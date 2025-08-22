/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * JunctionRelay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * JunctionRelay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * You should have received a copy of the GNU General Public License
 * along with JunctionRelay. If not, see <https://www.gnu.org/licenses/>.
 */

using System.Collections.Concurrent;
using System.IO.Compression;
using System.Text;
using System.Linq;
using Microsoft.Extensions.DependencyInjection;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    public class Service_Stream_Manager_Virtual
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly Service_Stream_History_Manager _historyManager;
        private readonly ConcurrentDictionary<int, Service_StreamInfo_Virtual> _streamingTokens = new();
        private readonly ConcurrentDictionary<int, long> _streamLatencies = new();

        public Service_Stream_Manager_Virtual(
            IServiceScopeFactory scopeFactory,
            Service_Stream_History_Manager historyManager)
        {
            _scopeFactory = scopeFactory;
            _historyManager = historyManager;
        }

        // Match the WebSocket shape so /api/connections/streams can display uniform fields
        public IEnumerable<object> GetActiveStreams(bool showCompressed = false)
        {
            return _streamingTokens.Select(kvp =>
            {
                var info = kvp.Value;

                // JSON we keep for UI
                string configJson = info.ConfigPayloadJson ?? "{}";
                string lastJson = info.LastGeneratedPayloadJson ?? "{}";

                // Always provide compressed hex previews (like WS manager does),
                // but keep the *JSON* fields uncompressed for readability.
                string configHex = CompressToHex(configJson);
                string lastHex = CompressToHex(lastJson);

                // Match WS: payloadType shows "Rive Sensor" when running in Rive mode
                bool isRive = (info.Protocol ?? "").IndexOf("Rive", StringComparison.OrdinalIgnoreCase) >= 0;
                string payloadType = isRive ? "Rive Sensor" : "JSON";

                return new
                {
                    // Core parity
                    StreamKey = kvp.Key,
                    DeviceName = info.DeviceName,
                    DeviceMac = "Unknown",
                    ScreenId = info.ScreenId,
                    ScreenName = info.ScreenName,
                    Status = info.Status,
                    Rate = info.Rate,
                    Latency = info.Latency,
                    LastSentTime = info.LastGeneratedTime,
                    Protocol = info.Protocol ?? "Virtual",
                    SensorsCount = info.SensorsCount,

                    // Frame parity fields
                    HasLastFrame = info.LastGeneratedFrameBytes != null,
                    LastFrameSize = info.LastFrameSize,
                    LastFrameTime = info.LastFrameGeneratedTime,
                    LastFrameLayoutType = info.LastFrameLayoutType,

                    // Gateway parity fields
                    IsGatewayMode = false,
                    GatewayTarget = "Unknown",

                    // Health parity - FIXED TO MATCH OTHER MANAGERS' INT TYPES
                    Health = new
                    {
                        ConnectionState = info.Health.ConnectionState,
                        SuccessRate = info.Health.SuccessRate,
                        LastErrorMessage = info.Health.LastErrorMessage,
                        ErrorType = info.Health.ErrorType,
                        ConsecutiveFailures = info.Health.ConsecutiveFailures,
                        ConsecutiveSuccesses = info.Health.ConsecutiveSuccesses,
                        ConnectionRecreated = false,
                        LastWebSocketState = (string?)null,
                        AverageLatency = info.Health.AverageLatency,
                        MaxLatency = (long)info.Latency,        // Cast to long to match WS manager
                        MinLatency = (long)info.Latency,        // Cast to long to match WS manager
                        LastSuccessTime = info.Health.LastSuccessTime,
                        LastFailureTime = info.Health.LastFailureTime,
                        ConnectionRecreationCount = 0,

                        // Frame/gateway metrics - FIXED TO USE INT TYPES
                        IsFrameMode = false,
                        PayloadType = payloadType,
                        FramesSent = 0,
                        PayloadsSent = (int)Math.Min(info.PayloadsGenerated, int.MaxValue), // Cast long to int safely
                        CurrentFrameLayoutType = "",
                        AverageFrameSize = 0.0,                 // double to match WS
                        MaxFrameSize = 0L,                      // long to match WS
                        MinFrameSize = 0L,                      // long to match WS (not MaxValue)
                        AverageFrameRenderTime = 0.0,           // double to match WS  
                        MaxFrameRenderTime = 0L,                // long to match WS
                        MinFrameRenderTime = 0L,                // long to match WS (not MaxValue)
                        FrameHealthSummary = new { message = "Not in frame mode" },

                        IsGatewayMode = false,
                        GatewayTarget = "Unknown",
                        GatewayMessagesSent = 0,
                        GatewayHealthSummary = new { message = "Not in gateway mode" }
                    },

                    // Payload fields (prefixes left empty for UI safety, like WS often does)
                    ConfigPayloadPrefix = "",
                    ConfigPayloadJson = configJson,
                    LastSentPayloadPrefix = "",
                    LastSentPayloadJson = lastJson,

                    // Compressed previews: always include hex (like WS manager)
                    CompressedConfigPayloadPrefix = "",
                    CompressedLastSentPayloadPrefix = "",
                    ConfigPayloadCompressed = configHex,
                    LastSentPayloadCompressed = lastHex
                };
            });
        }


        private static string ExtractStringPrefix(string payload)
        {
            if (string.IsNullOrEmpty(payload) || payload.Length < 8) return string.Empty;
            for (int i = 0; i < 8; i++)
            {
                if (payload[i] < '0' || payload[i] > '9') return string.Empty;
            }
            return payload.Substring(0, 8);
        }

        private static string CompressToHex(string? s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            var input = Encoding.UTF8.GetBytes(s);
            using var ms = new MemoryStream();
            using (var gzip = new GZipStream(ms, CompressionMode.Compress))
                gzip.Write(input, 0, input.Length);
            var bytes = ms.ToArray();
            var sb = new StringBuilder(bytes.Length * 3);
            for (int i = 0; i < bytes.Length; i++)
            {
                if (i > 0) sb.Append(' ');
                sb.Append(bytes[i].ToString("x2"));
            }
            return sb.ToString();
        }

        public async Task StartStreamingAsync(
            int junctionId,
            int deviceId,
            int rate,
            string screenKey,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen)
        {
            if (_streamingTokens.ContainsKey(screen.Id))
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Stream already active for device {deviceId}, screen {screenKey}");
                return;
            }

            var cts = new CancellationTokenSource();

            using var initScope = _scopeFactory.CreateScope();
            var junctionDb = initScope.ServiceProvider.GetRequiredService<Service_Database_Manager_Junctions>();
            var junctionLinkDb = initScope.ServiceProvider.GetRequiredService<Service_Database_Manager_JunctionLinks>();
            var payloadSvc = initScope.ServiceProvider.GetRequiredService<Service_Manager_Payloads>();
            var deviceDb = initScope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();

            var junction = await junctionDb.GetJunctionByIdAsync(junctionId);
            if (junction == null)
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Junction {junctionId} not found.");
                return;
            }

            var device = await deviceDb.GetDeviceByIdAsync(deviceId);
            var deviceName = device?.Name ?? $"Virtual-{deviceId}";

            bool isRiveMode = junction.RenderingMode.Equals("CompositeMode", StringComparison.OrdinalIgnoreCase);
            bool isFrameMode = junction.RenderingMode.Equals("FrameEngine", StringComparison.OrdinalIgnoreCase); // parity only

            // Fetch screen layout overrides (REPLICATE WS)
            var screenLayoutOverrides = await junctionLinkDb.GetJunctionScreenLayoutsByScreenIdAsync(junctionId, screen.Id);
            Model_JunctionScreenLayout? screenOverride = screenLayoutOverrides.FirstOrDefault(o => o.DeviceScreenId == screen.Id);

            var info = new Service_StreamInfo_Virtual
            {
                DeviceName = deviceName,
                ScreenId = screen.Id,
                ScreenName = screen.DisplayName ?? "Unnamed Screen",
                SensorsCount = assignedSensors.Count,
                Rate = rate,
                Status = "Active",
                Cts = cts,
                Latency = 0,
                LastGeneratedTime = DateTime.UtcNow,
                Protocol = isRiveMode ? "Virtual (Rive)"
                                  : isFrameMode ? "Virtual (Frames)"
                                  : "Virtual"
            };

            _streamingTokens[screen.Id] = info;

            // INITIAL CONFIG (REPLICATE WS BEHAVIOR)
            if (isRiveMode)
            {
                // Rive CONFIG uses override (exactly like WS)
                var riveCfg = await payloadSvc.GenerateRiveConfigPayloadsAsync(
                    screenKey,
                    assignedSensors,
                    screen,
                    screenOverride,          // pass the override (matches WS)
                    junctionType: null,
                    gatewayDestination: null,
                    compressPayload: junction.CompressPayload);

                if (!riveCfg.TryGetValue(screenKey, out var rawCfg))
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] No Rive config for {screenKey}.");
                    _streamingTokens.TryRemove(screen.Id, out _);
                    return;
                }

                if (rawCfg is byte[] cfgBytes)
                {
                    if (junction.CompressPayload)
                    {
                        // For UI: produce uncompressed view for storage, mimicking WS summary
                        var uncompressedCfg = await payloadSvc.GenerateRiveConfigPayloadsAsync(
                            screenKey, assignedSensors, screen, screenOverride,
                            junctionType: null, gatewayDestination: null, compressPayload: false);

                        if (uncompressedCfg.TryGetValue(screenKey, out var rawUnc) && rawUnc is string uncStr)
                        {
                            var pref = ExtractStringPrefix(uncStr);
                            var json = string.IsNullOrEmpty(pref) ? uncStr : uncStr.Substring(8);
                            info.UpdateConfigPayload(json);
                        }
                    }
                    else
                    {
                        var cfgStr = Encoding.UTF8.GetString(cfgBytes);
                        var pref = ExtractStringPrefix(cfgStr);
                        var json = string.IsNullOrEmpty(pref) ? cfgStr : cfgStr.Substring(8);
                        info.UpdateConfigPayload(json);
                    }
                }
                else if (rawCfg is string cfgStr)
                {
                    var pref = ExtractStringPrefix(cfgStr);
                    var json = string.IsNullOrEmpty(pref) ? cfgStr : cfgStr.Substring(8);
                    info.UpdateConfigPayload(json);
                }

                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Rive config prepared for {deviceName}/{screenKey}.");
            }
            else
            {
                // Payload CONFIG (WS passes override=null for config)
                var uncompressedConfig = await payloadSvc.GenerateConfigPayloadsAsync(
                    screenKey,
                    assignedSensors,
                    screen,
                    overrideTemplate: null,
                    junctionType: null,
                    gatewayDestination: null,
                    compressPayload: false);

                if (!uncompressedConfig.TryGetValue(screenKey, out var rawUnc) || rawUnc is not string uncJson)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] No payload config for {screenKey}.");
                    _streamingTokens.TryRemove(screen.Id, out _);
                    return;
                }

                var pref = ExtractStringPrefix(uncJson);
                var json = string.IsNullOrEmpty(pref) ? uncJson : uncJson.Substring(8);
                info.UpdateConfigPayload(json);

                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Payload config prepared for {deviceName}/{screenKey}.");
            }

            // —— SENSOR LOOP (REPLICATE WS BRANCHING) —— //
            _ = Task.Run(async () =>
            {
                using var loopScope = _scopeFactory.CreateScope();
                var loopPayloadSvc = loopScope.ServiceProvider.GetRequiredService<Service_Manager_Payloads>();

                await Task.Delay(500, cts.Token);

                while (!cts.Token.IsCancellationRequested)
                {
                    try
                    {
                        if (isRiveMode)
                        {
                            // RIVE SENSOR payloads (no override here, matching WS)
                            var riveSensor = await loopPayloadSvc.GenerateRiveSensorPayloadsAsync(
                                screenKey,
                                assignedSensors,
                                screen,
                                junctionType: null,
                                gatewayDestination: null,
                                compressPayload: junction.CompressPayload);

                            if (!riveSensor.TryGetValue(screenKey, out var rawSensor))
                                break;

                            if (rawSensor is byte[] sensorBytes)
                            {
                                // Store uncompressed JSON view for UI (replicates WS preview behavior)
                                if (junction.CompressPayload)
                                {
                                    var unc = await loopPayloadSvc.GenerateRiveSensorPayloadsAsync(
                                        screenKey, assignedSensors, screen,
                                        junctionType: null, gatewayDestination: null,
                                        compressPayload: false);

                                    if (unc.TryGetValue(screenKey, out var rawUnc) && rawUnc is string uncStr)
                                    {
                                        var sp = ExtractStringPrefix(uncStr);
                                        var json = string.IsNullOrEmpty(sp) ? uncStr : uncStr.Substring(8);
                                        info.UpdateLastGeneratedPayload(json);
                                    }
                                }
                                else
                                {
                                    var str = Encoding.UTF8.GetString(sensorBytes);
                                    var sp = ExtractStringPrefix(str);
                                    var json = string.IsNullOrEmpty(sp) ? str : str.Substring(8);
                                    info.UpdateLastGeneratedPayload(json);
                                }
                            }
                            else if (rawSensor is string sensorStr)
                            {
                                var sp = ExtractStringPrefix(sensorStr);
                                var json = string.IsNullOrEmpty(sp) ? sensorStr : sensorStr.Substring(8);
                                info.UpdateLastGeneratedPayload(json);
                            }
                        }
                        else
                        {
                            // PAYLOAD SENSOR (Matrix-aware), same as WS branching
                            Dictionary<string, object> uncompressedSensor = screen.Template?.LayoutType switch
                            {
                                "MATRIX" => await loopPayloadSvc.GenerateMatrixSensorPayloadsAsync(
                                                screenKey,
                                                assignedSensors.Count,
                                                assignedSensors,
                                                screen,
                                                startingYOffset: 0,
                                                junctionType: null,
                                                gatewayDestination: null,
                                                compressPayload: false),
                                _ => await loopPayloadSvc.GenerateSensorPayloadsAsync(
                                                screenKey,
                                                assignedSensors.Count,
                                                assignedSensors,
                                                screen,
                                                junctionType: null,
                                                gatewayDestination: null,
                                                compressPayload: false)
                            };

                            if (!uncompressedSensor.TryGetValue(screenKey, out var rawUncSensor) || rawUncSensor is not string uncSensorJson)
                                break;

                            var sp = ExtractStringPrefix(uncSensorJson);
                            var json = string.IsNullOrEmpty(sp) ? uncSensorJson : uncSensorJson.Substring(8);
                            info.UpdateLastGeneratedPayload(json);
                        }

                        info.LastGeneratedTime = DateTime.UtcNow;
                        info.Latency = 0;
                        _streamLatencies[screen.Id] = 0;

                        // success health
                        info.Health.ConsecutiveSuccesses++;
                        info.Health.ConsecutiveFailures = 0;
                        info.Health.LastSuccessTime = DateTime.UtcNow;

                        // history
                        var entry = _historyManager.CreateEntryFromVirtual(info);
                        _historyManager.AddHistoryEntry(entry);

                        await Task.Delay(rate, cts.Token);
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Error: {ex.Message}");
                        info.Health.ConsecutiveFailures++;
                        info.Health.LastFailureTime = DateTime.UtcNow;
                        info.Health.LastErrorMessage = ex.Message;
                        await Task.Delay(1000, cts.Token);
                    }
                }

                info.Status = "Inactive";
            }, cts.Token);

            Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] ✅ Virtual stream started for screen {screenKey} (Mode: {(isRiveMode ? "Rive" : (isFrameMode ? "Frame" : "Payload"))})");
        }

        public void StopStreaming(int screenId)
        {
            if (_streamingTokens.TryRemove(screenId, out var info))
            {
                info.Cts.Cancel();
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Stopped stream for screen {screenId}");
            }
        }

        public bool IsStreaming(int screenId) => _streamingTokens.ContainsKey(screenId);

        public long GetLatestLatency(int screenId)
        {
            _streamLatencies.TryGetValue(screenId, out var latency);
            return latency;
        }

        public StreamHistoryResponse GetStreamHistory(int screenId, DateTime? from = null, DateTime? to = null, bool includeStats = true)
        {
            return _historyManager.GetStreamHistory(screenId, from, to, includeStats);
        }
    }
}