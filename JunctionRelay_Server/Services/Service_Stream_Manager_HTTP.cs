/*
 * This file is part of Junction Relay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * Junction Relay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Junction Relay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Junction Relay. If not, see <https://www.gnu.org/licenses/>.
 */

using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    public class Service_Stream_Manager_HTTP
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ConcurrentDictionary<int, StreamInfo> _streamingTokens = new();
        private readonly ConcurrentDictionary<int, long> _streamLatencies = new();

        public Service_Stream_Manager_HTTP(IServiceScopeFactory scopeFactory)
        {
            _scopeFactory = scopeFactory;
        }

        public class StreamInfo
        {
            public string DeviceName { get; set; } = string.Empty;
            public int Rate { get; set; }
            public string Status { get; set; } = string.Empty;

            [JsonIgnore]
            public CancellationTokenSource Cts { get; set; } = new();

            // Add a dedicated HTTP sender for this stream
            [JsonIgnore]
            public Service_Send_Data_HTTP HttpSender { get; set; }

            public int ScreenId { get; set; }
            public string ScreenName { get; set; } = string.Empty;
            public int SensorsCount { get; set; }
            public long Latency { get; set; }
            public DateTime LastSentTime { get; set; }
            public string Protocol { get; set; } = "HTTP";

            // just the length‐prefix (if any) before the '{'
            public string ConfigPayloadPrefix { get; set; } = string.Empty;
            public string LastSentPayloadPrefix { get; set; } = string.Empty;

            // hold the parsed JSON docs; we will expose raw JSON strings instead of JsonElement
            [JsonIgnore]
            public JsonDocument ConfigPayloadDoc { get; set; } = JsonDocument.Parse("{}");
            [JsonIgnore]
            public JsonDocument LastSentPayloadDoc { get; set; } = JsonDocument.Parse("{}");

            // Thread-safe cached JSON strings to avoid accessing disposed JsonDocuments
            private string _configPayloadJsonCache = "{}";
            private string _lastSentPayloadJsonCache = "{}";
            private readonly object _jsonCacheLock = new object();

            // expose JSON text so we never serialize a disposed JsonDocument/JsonElement
            public string ConfigPayloadJson
            {
                get
                {
                    lock (_jsonCacheLock)
                    {
                        return _configPayloadJsonCache;
                    }
                }
            }

            public string LastSentPayloadJson
            {
                get
                {
                    lock (_jsonCacheLock)
                    {
                        return _lastSentPayloadJsonCache;
                    }
                }
            }

            // Method to safely update the config payload and cache
            public void UpdateConfigPayload(string jsonString)
            {
                lock (_jsonCacheLock)
                {
                    ConfigPayloadDoc?.Dispose();
                    ConfigPayloadDoc = JsonDocument.Parse(jsonString);
                    _configPayloadJsonCache = jsonString;
                }
            }

            // Method to safely update the last sent payload and cache
            public void UpdateLastSentPayload(string jsonString)
            {
                lock (_jsonCacheLock)
                {
                    LastSentPayloadDoc?.Dispose();
                    LastSentPayloadDoc = JsonDocument.Parse(jsonString);
                    _lastSentPayloadJsonCache = jsonString;
                }
            }

            // Updated dispose method to handle HTTP sender
            public void Dispose()
            {
                lock (_jsonCacheLock)
                {
                    ConfigPayloadDoc?.Dispose();
                    LastSentPayloadDoc?.Dispose();
                    Cts?.Dispose();
                    HttpSender?.Dispose(); // Dispose the HTTP sender
                }
            }
        }

        public IEnumerable<object> GetActiveStreams()
        {
            return _streamingTokens.Select(kvp =>
            {
                var info = kvp.Value;
                return new
                {
                    StreamKey = kvp.Key,
                    info.DeviceName,
                    info.ScreenId,
                    info.ScreenName,
                    info.Status,
                    info.Rate,
                    info.Latency,
                    info.LastSentTime,
                    info.Protocol,
                    info.SensorsCount,
                    info.ConfigPayloadPrefix,
                    // return raw JSON strings instead of JsonElement
                    ConfigPayloadJson = info.ConfigPayloadJson,
                    info.LastSentPayloadPrefix,
                    LastSentPayloadJson = info.LastSentPayloadJson
                };
            });
        }

        public async Task StartStreamingAsync(
            int junctionId,
            int deviceId,
            int rate,
            string screenKey,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            string? junctionType = null,           // Junction type (e.g., "Gateway Junction (HTTP)")
            string? gatewayDestination = null)     // Gateway IP address (for Gateway junctions)
        {
            if (_streamingTokens.ContainsKey(screen.Id))
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Stream already active for device {deviceId}, screen {screenKey}");
                return;
            }

            var cts = new CancellationTokenSource();

            // —— INITIAL CONFIG SCOPE ——
            using (var scope = _scopeFactory.CreateScope())
            {
                var deviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();
                var payloadService = scope.ServiceProvider.GetRequiredService<Service_Manager_Payloads>();

                var device = await deviceDb.GetDeviceByIdAsync(deviceId);
                if (device is null)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Device {deviceId} not found.");
                    return;
                }

                // Determine the HTTP endpoint based on junction type
                string httpEndpoint;
                string targetMacAddress = device.UniqueIdentifier; // Target device MAC for ESP-NOW

                if (!string.IsNullOrEmpty(junctionType) && junctionType.Equals("Gateway Junction (HTTP)", StringComparison.OrdinalIgnoreCase))
                {
                    // For Gateway junctions: 
                    // - gatewayDestination = Gateway device IP (where to send HTTP)
                    // - device.UniqueIdentifier = Target device MAC (for ESP-NOW forwarding)
                    if (string.IsNullOrEmpty(gatewayDestination))
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Gateway junction requires gateway IP address.");
                        return;
                    }

                    httpEndpoint = $"http://{gatewayDestination}/api/data";
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Gateway junction: HTTP to {gatewayDestination}, ESP-NOW target: {targetMacAddress}");
                }
                else
                {
                    // Regular HTTP/MQTT junctions - send directly to target device
                    httpEndpoint = $"http://{device.IPAddress}/api/data";
                    targetMacAddress = null; // No ESP-NOW forwarding for direct connections
                }

                // Get the keep-alive setting from the screen configuration
                bool useKeepAlive = screen.UseKeepAlive ?? false; // Default to false if not set

                // Create HTTP sender with the determined endpoint
                var httpSender = new Service_Send_Data_HTTP(httpEndpoint, useKeepAlive);

                // seed our StreamInfo
                var info = new StreamInfo
                {
                    DeviceName = device.Name,
                    Rate = rate,
                    Status = "Active",
                    Cts = cts,
                    HttpSender = httpSender, // Store the HTTP sender
                    ScreenId = screen.Id,
                    ScreenName = screen.DisplayName ?? "Unnamed Screen",
                    SensorsCount = assignedSensors.Count,
                    Latency = 0,
                    LastSentTime = DateTime.UtcNow,
                    Protocol = useKeepAlive ? "HTTP (Keep-Alive)" : "HTTP" // Update protocol display
                };
                _streamingTokens[screen.Id] = info;

                // generate config payload with junction type and target MAC
                var configPayloads = await payloadService.GenerateConfigPayloadsAsync(
                    screenKey,
                    assignedSensors,
                    screen,
                    overrideTemplate: null,
                    junctionType: junctionType,
                    gatewayDestination: targetMacAddress); // Pass target device MAC for ESP-NOW

                if (!configPayloads.TryGetValue(screenKey, out var cpObj) || cpObj is not string configPayload)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] No config payload for screen {screenKey}.");
                    info.Dispose(); // Clean up on failure
                    _streamingTokens.TryRemove(screen.Id, out _);
                    return;
                }

                // capture just the length-prefix (if any)
                var idxC = configPayload.IndexOf('{');
                if (idxC > 0)
                    info.ConfigPayloadPrefix = configPayload.Substring(0, idxC);

                // strip prefix then parse and cache
                var jsonConfig = idxC > 0 ? configPayload.Substring(idxC) : configPayload;
                info.UpdateConfigPayload(jsonConfig);

                // send to device using the keep-alive enabled sender
                var (ok, _) = await httpSender.SendPayloadAsync(configPayload);
                if (!ok)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Failed to send config.");
                    info.Dispose(); // Clean up on failure
                    _streamingTokens.TryRemove(screen.Id, out _);
                    return;
                }

                string connectionType = useKeepAlive ? "keep-alive" : "standard";
                string junctionInfo = !string.IsNullOrEmpty(junctionType) ? $" ({junctionType})" : "";
                if (!string.IsNullOrEmpty(junctionType) && junctionType.Equals("Gateway Junction (HTTP)", StringComparison.OrdinalIgnoreCase))
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Config sent to gateway {gatewayDestination} via {connectionType} connection, target: {targetMacAddress}");
                }
                else
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Config sent to {device.Name} via {connectionType} connection{junctionInfo}.");
                }
            }

            // —— SENSOR POLLING LOOP —— (Updated to pass target MAC for ESP-NOW)
            _ = Task.Run(async () =>
            {
                using var loopScope = _scopeFactory.CreateScope();
                var loopPayloadService = loopScope.ServiceProvider.GetRequiredService<Service_Manager_Payloads>();

                var info = _streamingTokens[screen.Id];

                // Get the target MAC address for this device (for ESP-NOW forwarding)
                string targetMacAddress = null;
                if (!string.IsNullOrEmpty(junctionType) && junctionType.Equals("Gateway Junction (HTTP)", StringComparison.OrdinalIgnoreCase))
                {
                    // For Gateway junctions, get the target device to extract its MAC
                    using var deviceScope = _scopeFactory.CreateScope();
                    var deviceDb = deviceScope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();
                    var device = await deviceDb.GetDeviceByIdAsync(deviceId);
                    targetMacAddress = device?.UniqueIdentifier;
                }

                await Task.Delay(500, cts.Token);

                while (!cts.Token.IsCancellationRequested)
                {
                    // pick the right sensor payload generator and pass target MAC for ESP-NOW
                    Dictionary<string, object> sensorPayload = screen.Template?.LayoutType switch
                    {
                        "MATRIX" => await loopPayloadService.GenerateMatrixSensorPayloadsAsync(
                            screenKey,
                            assignedSensors.Count,
                            assignedSensors,
                            screen,
                            startingYOffset: 0,
                            junctionType: junctionType,
                            gatewayDestination: targetMacAddress), // Pass target device MAC
                        _ => await loopPayloadService.GenerateSensorPayloadsAsync(
                            screenKey,
                            assignedSensors.Count,
                            assignedSensors,
                            screen,
                            junctionType: junctionType,
                            gatewayDestination: targetMacAddress) // Pass target device MAC
                    };

                    if (!sensorPayload.TryGetValue(screenKey, out var rawObj) || rawObj is not string rawPayload)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] No sensor payload for screen {screenKey}. Exiting loop.");
                        break;
                    }

                    // Always update the "last generated" payload info for display purposes
                    var idxS = rawPayload.IndexOf('{');
                    if (idxS > 0)
                        info.LastSentPayloadPrefix = rawPayload.Substring(0, idxS);

                    // Strip prefix and safely update the last sent payload
                    var jsonSensor = idxS > 0 ? rawPayload.Substring(idxS) : rawPayload;
                    info.UpdateLastSentPayload(jsonSensor);

                    // Use the stored HTTP sender (keep-alive or standard)
                    var sw = Stopwatch.StartNew();
                    var (sent, _) = await info.HttpSender.SendPayloadAsync(rawPayload);
                    sw.Stop();

                    if (!sent)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Failed to send sensor payload. Exiting loop.");
                        break;
                    }

                    long latency = sw.ElapsedMilliseconds;
                    _streamLatencies[screen.Id] = latency;
                    int pause = Math.Max(rate - (int)latency, 0);
                    if (pause > 0) await Task.Delay(pause, cts.Token);

                    info.Latency = latency;
                    info.LastSentTime = DateTime.UtcNow;
                }

                _streamingTokens[screen.Id].Status = "Inactive";
            }, cts.Token);
        }

        public void StopStreaming(int screenId)
        {
            if (_streamingTokens.TryRemove(screenId, out var info))
            {
                info.Cts.Cancel();
                info.Dispose(); // Use the updated dispose method

                Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Stopped stream for screen {screenId}.");
            }
            else
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] No active stream for screen {screenId}.");
            }
        }

        public long GetLatestLatency(int screenId)
        {
            _streamLatencies.TryGetValue(screenId, out var latency);
            return latency;
        }

        public bool IsStreaming(int screenId)
            => _streamingTokens.ContainsKey(screenId);
    }
}