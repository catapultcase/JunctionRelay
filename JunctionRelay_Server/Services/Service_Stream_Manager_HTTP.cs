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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with JunctionRelay. If not, see <https://www.gnu.org/licenses/>.
 */

using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using JunctionRelayServer.Models;
using System.Text;

namespace JunctionRelayServer.Services
{
    public class Service_Stream_Manager_HTTP
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ConcurrentDictionary<int, Service_StreamInfo_HTTP> _streamingTokens = new();
        private readonly ConcurrentDictionary<int, long> _streamLatencies = new();
        private readonly Service_Stream_History_Manager _historyManager;

        public Service_Stream_Manager_HTTP(
            IServiceScopeFactory scopeFactory,
            Service_Stream_History_Manager historyManager)
        {
            _scopeFactory = scopeFactory;
            _historyManager = historyManager;
        }

        public IEnumerable<object> GetActiveStreams(bool showCompressed = false)
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

                    // NEW: Frame information
                    HasLastFrame = info.LastSentFrameBytes != null,
                    LastFrameSize = info.LastFrameSize,
                    LastFrameTime = info.LastFrameGeneratedTime,
                    LastFrameLayoutType = info.LastFrameLayoutType,

                    // Enhanced health information with frame support
                    Health = new
                    {
                        info.Health.ConnectionState,
                        info.Health.SuccessRate,
                        info.Health.LastErrorMessage,
                        info.Health.ErrorType,
                        info.Health.ConsecutiveFailures,
                        info.Health.ConsecutiveSuccesses,
                        info.Health.KeepAlivePoolRecreated,
                        info.Health.HttpStatusCode,
                        info.Health.AverageLatency,
                        info.Health.MaxLatency,
                        info.Health.MinLatency,
                        info.Health.LastSuccessTime,
                        info.Health.LastFailureTime,
                        info.Health.PoolRecreationCount,

                        // Frame-specific health metrics
                        info.Health.IsFrameMode,
                        info.Health.PayloadType,
                        info.Health.FramesSent,
                        info.Health.PayloadsSent,
                        info.Health.CurrentFrameLayoutType,
                        info.Health.AverageFrameSize,
                        info.Health.MaxFrameSize,
                        info.Health.MinFrameSize,
                        info.Health.AverageFrameRenderTime,
                        info.Health.MaxFrameRenderTime,
                        info.Health.MinFrameRenderTime,
                        FrameHealthSummary = info.Health.GetFrameHealthSummary()
                    },
                    info.ConfigPayloadPrefix,
                    ConfigPayloadJson = showCompressed ? info.GetCompressedConfigPayloadPreview() : info.ConfigPayloadJson,
                    info.LastSentPayloadPrefix,
                    LastSentPayloadJson = showCompressed ? info.GetCompressedLastSentPayloadPreview() : info.LastSentPayloadJson,
                    info.CompressedConfigPayloadPrefix,
                    info.CompressedLastSentPayloadPrefix,
                    ConfigPayloadCompressed = info.GetCompressedConfigPayloadPreview(),
                    LastSentPayloadCompressed = info.GetCompressedLastSentPayloadPreview()
                };
            });
        }

        // Get the last sent frame bytes for a specific screen
        public byte[]? GetLastFrameBytes(int screenId)
        {
            if (_streamingTokens.TryGetValue(screenId, out var streamInfo))
            {
                return streamInfo.GetLastSentFrameCopy();
            }
            return null;
        }

        // Get frame information for a specific screen
        public object? GetFrameInfo(int screenId)
        {
            if (_streamingTokens.TryGetValue(screenId, out var streamInfo))
            {
                return new
                {
                    HasFrame = streamInfo.LastSentFrameBytes != null,
                    FrameSize = streamInfo.LastFrameSize,
                    FrameTime = streamInfo.LastFrameGeneratedTime,
                    LayoutType = streamInfo.LastFrameLayoutType
                };
            }
            return null;
        }

        // Clear the last sent frame for a specific screen (to free memory)
        public bool ClearLastFrame(int screenId)
        {
            if (_streamingTokens.TryGetValue(screenId, out var streamInfo))
            {
                streamInfo.ClearLastSentFrame();
                return true;
            }
            return false;
        }

        // Helper method to extract prefix from binary payload (for compressed payloads)
        private string ExtractBinaryPrefix(byte[] payload)
        {
            if (payload == null || payload.Length < 8)
                return string.Empty;

            // Check if first 8 bytes are ASCII digits (valid prefix)
            for (int i = 0; i < 8; i++)
            {
                if (payload[i] < '0' || payload[i] > '9')
                    return string.Empty;
            }

            // Extract the 8-digit prefix
            return Encoding.ASCII.GetString(payload, 0, 8);
        }

        // Helper method to extract prefix from string payload (for uncompressed payloads)
        private string ExtractStringPrefix(string payload)
        {
            if (string.IsNullOrEmpty(payload) || payload.Length < 8)
                return string.Empty;

            // Check if first 8 characters are digits
            for (int i = 0; i < 8; i++)
            {
                if (payload[i] < '0' || payload[i] > '9')
                    return string.Empty;
            }

            return payload.Substring(0, 8);
        }

        // Update the StartStreamingAsync method to support frame rendering mode

        public async Task StartStreamingAsync(
            int junctionId,
            int deviceId,
            int rate,
            string screenKey,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            string? junctionType = null,           // Junction type (e.g., "Gateway Junction (HTTP to ESP:NOW)")
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
                var junctionDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Junctions>();
                var junctionLinkDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_JunctionLinks>();

                var device = await deviceDb.GetDeviceByIdAsync(deviceId);
                if (device is null)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Device {deviceId} not found.");
                    return;
                }

                // Get junction to access CompressPayload and RenderingMode settings
                var junction = await junctionDb.GetJunctionByIdAsync(junctionId);
                if (junction is null)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Junction {junctionId} not found.");
                    return;
                }

                // Check if this junction is in Frame rendering mode
                bool isFrameMode = junction.RenderingMode.Equals("FrameEngine", StringComparison.OrdinalIgnoreCase);

                // Get screen layout override if exists
                var screenLayoutOverrides = await junctionLinkDb.GetJunctionScreenLayoutsByScreenIdAsync(screen.Id);
                var screenOverride = screenLayoutOverrides.FirstOrDefault(o => o.DeviceScreenId == screen.Id);

                // Determine the HTTP endpoint based on junction type
                string httpEndpoint;
                string? targetMacAddress = device.UniqueIdentifier; // Target device MAC for ESP-NOW

                if (!string.IsNullOrEmpty(junctionType) && junctionType.Equals("Gateway Junction (HTTP to ESP:NOW)", StringComparison.OrdinalIgnoreCase))
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

                //Console.WriteLine($"[DEBUG] Screen.UseKeepAlive = {screen.UseKeepAlive}");
                //Console.WriteLine($"[DEBUG] Resolved useKeepAlive = {useKeepAlive}");
                //Console.WriteLine($"[DEBUG] Junction RenderingMode = {junction.RenderingMode}");
                //Console.WriteLine($"[DEBUG] About to create HTTP sender for {httpEndpoint} with useKeepAlive={useKeepAlive}");

                // Create HTTP sender with the determined endpoint
                var httpSender = new Service_Send_Data_HTTP(httpEndpoint, useKeepAlive);

                // seed our StreamInfo
                var info = new Service_StreamInfo_HTTP(junction.CompressPayload)
                {
                    DeviceName = device.Name,
                    Rate = rate,
                    Status = "Active",
                    Cts = cts,
                    HttpSender = httpSender,
                    ScreenId = screen.Id,
                    ScreenName = screen.DisplayName ?? "Unnamed Screen",
                    SensorsCount = assignedSensors.Count,
                    Latency = 0,
                    LastSentTime = DateTime.UtcNow,
                    Protocol = useKeepAlive ? "HTTP (Keep-Alive)" : "HTTP"
                };

                // Update protocol to indicate frame mode
                if (isFrameMode)
                {
                    info.Protocol = useKeepAlive ? "HTTP (Keep-Alive, Frames)" : "HTTP (Frames)";
                    info.Health.IsFrameMode = true;
                }

                _streamingTokens[screen.Id] = info;

                // Send initial configuration based on rendering mode
                if (isFrameMode)
                {
                    // FRAME MODE: Generate and send initial frame
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] 🖼️ Starting in Frame rendering mode for {screenKey}");

                    var frameStopwatch = System.Diagnostics.Stopwatch.StartNew();
                    Dictionary<string, object> frameConfig = await payloadService.GenerateFramePayloadsAsync(
                        screenKey,
                        assignedSensors,
                        screen,
                        screenOverride,
                        junctionId,  // ADD THIS
                        await GetLinkIdForDeviceAsync(junctionId, deviceId, scope), // ADD THIS
                        junctionType: junctionType,
                        gatewayDestination: targetMacAddress,
                        compressPayload: junction.CompressPayload);
                    frameStopwatch.Stop();

                    if (!frameConfig.TryGetValue(screenKey, out object rawFrame))
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] No frame payload for screen {screenKey}.");
                        info.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }

                    // Send the frame (should be byte array)
                    if (rawFrame is byte[] frameBytes)
                    {
                        // Store the frame in stream info before sending
                        var layoutType = screenOverride?.FrameLayoutId?.ToString() ?? screen.Template?.LayoutType ?? "default";
                        info.UpdateLastSentFrame(frameBytes, layoutType);

                        var sendStopwatch = System.Diagnostics.Stopwatch.StartNew();
                        var result = await httpSender.SendPayloadWithHealthAsync(frameBytes);
                        sendStopwatch.Stop();

                        // Update result with frame-specific metrics
                        result.IsFramePayload = true;
                        result.FrameSizeBytes = frameBytes.Length;
                        result.FrameRenderTimeMs = frameStopwatch.ElapsedMilliseconds;
                        result.PayloadType = "Frame";

                        info.Health.UpdateHealth(result);

                        if (!result.Success)
                        {
                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Failed to send initial frame.");
                            info.Dispose();
                            _streamingTokens.TryRemove(screen.Id, out _);
                            return;
                        }

                        Console.WriteLine(
                        $"[{DateTime.Now:HH:mm:ss.fff}] [SERVICE_STREAM_MANAGER_HTTP] " +
                        $"Initial frame sent to {device.Name} via {(useKeepAlive ? "keep-alive" : "standard")} connection. " +
                        $"Frame: {frameBytes.Length} bytes, Render: {frameStopwatch.ElapsedMilliseconds}ms, Send: {sendStopwatch.ElapsedMilliseconds}ms");
                    }
                    else
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Frame payload is not byte array for screen {screenKey}.");
                        info.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }
                }
                else
                {
                    // PAYLOAD MODE: Generate and send config payload (existing logic)
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] 📄 Starting in Payload rendering mode for {screenKey}");

                    // Prepare uncompressed JSON payload
                    Dictionary<string, object> uncompressedConfig = await payloadService.GenerateConfigPayloadsAsync(
                        screenKey,
                        assignedSensors,
                        screen,
                        overrideTemplate: null,
                        junctionType: junctionType,
                        gatewayDestination: targetMacAddress,
                        compressPayload: false);

                    if (!uncompressedConfig.TryGetValue(screenKey, out object rawUncompressed) ||
                        rawUncompressed is not string uncompressedJson)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] No uncompressed config payload for screen {screenKey}.");
                        info.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }

                    // Send compressed or uncompressed payload (existing logic)
                    if (junction.CompressPayload)
                    {
                        Dictionary<string, object> compressedConfig = await payloadService.GenerateConfigPayloadsAsync(
                            screenKey,
                            assignedSensors,
                            screen,
                            overrideTemplate: null,
                            junctionType: junctionType,
                            gatewayDestination: targetMacAddress,
                            compressPayload: true);

                        if (!compressedConfig.TryGetValue(screenKey, out object rawCompressed))
                        {
                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] No compressed config payload for screen {screenKey}.");
                            info.Dispose();
                            _streamingTokens.TryRemove(screen.Id, out _);
                            return;
                        }

                        if (rawCompressed is byte[] compressedBytes)
                        {
                            // Extract prefix from binary payload
                            string compressedPrefix = ExtractBinaryPrefix(compressedBytes);
                            info.UpdateCompressedConfigPayloadPrefix(compressedPrefix);

                            // Send raw binary bytes directly (no Base64 conversion)
                            var (success, _) = await httpSender.SendPayloadAsync(compressedBytes);
                            if (!success)
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Failed to send compressed config payload.");
                                info.Dispose();
                                _streamingTokens.TryRemove(screen.Id, out _);
                                return;
                            }
                        }
                        else if (rawCompressed is string compressedString)
                        {
                            // Extract prefix from string payload (shouldn't happen for compressed, but handle it)
                            string compressedPrefix = ExtractStringPrefix(compressedString);
                            info.UpdateCompressedConfigPayloadPrefix(compressedPrefix);

                            var (success, _) = await httpSender.SendPayloadAsync(compressedString);
                            if (!success)
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Failed to send compressed config payload as string.");
                                info.Dispose();
                                _streamingTokens.TryRemove(screen.Id, out _);
                                return;
                            }
                        }
                        else
                        {
                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Unexpected compressed config payload type for screen {screenKey}.");
                            info.Dispose();
                            _streamingTokens.TryRemove(screen.Id, out _);
                            return;
                        }
                    }
                    else
                    {
                        var (success, _) = await httpSender.SendPayloadAsync(uncompressedJson);
                        if (!success)
                        {
                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Failed to send uncompressed config payload.");
                            info.Dispose();
                            _streamingTokens.TryRemove(screen.Id, out _);
                            return;
                        }
                    }

                    // Extract uncompressed prefix and update StreamInfo
                    string uncompressedPrefix = ExtractStringPrefix(uncompressedJson);
                    info.ConfigPayloadPrefix = uncompressedPrefix;

                    // Extract JSON part (after prefix)
                    string jsonConfig = string.IsNullOrEmpty(uncompressedPrefix)
                        ? uncompressedJson
                        : uncompressedJson.Substring(8);
                    info.UpdateConfigPayload(jsonConfig);

                    string connectionType = useKeepAlive ? "keep-alive" : "standard";
                    string compressionInfo = junction.CompressPayload ? " (compressed)" : "";
                    string junctionInfo = !string.IsNullOrEmpty(junctionType) ? $" ({junctionType})" : "";
                    if (!string.IsNullOrEmpty(junctionType) && junctionType.Equals("Gateway Junction (HTTP to ESP:NOW)", StringComparison.OrdinalIgnoreCase))
                    {
                        Console.WriteLine($"[{DateTime.Now:HH:mm:ss.fff}] [SERVICE_STREAM_MANAGER_HTTP] Config sent to gateway {gatewayDestination} via {connectionType} connection, target: {targetMacAddress}{compressionInfo}");
                    }
                    else
                    {
                        Console.WriteLine($"[{DateTime.Now:HH:mm:ss.fff}] [SERVICE_STREAM_MANAGER_HTTP] Config sent to {device.Name} via {connectionType} connection{junctionInfo}{compressionInfo}.");
                    }
                }
            }

            // —— SENSOR POLLING LOOP ——
            _ = Task.Run(async () =>
            {
                using var loopScope = _scopeFactory.CreateScope();
                var loopPayloadService = loopScope.ServiceProvider.GetRequiredService<Service_Manager_Payloads>();
                var junctionDb = loopScope.ServiceProvider.GetRequiredService<Service_Database_Manager_Junctions>();
                var junctionLinkDb = loopScope.ServiceProvider.GetRequiredService<Service_Database_Manager_JunctionLinks>();

                var info = _streamingTokens[screen.Id];

                // Get junction for compression and rendering mode settings
                var junction = await junctionDb.GetJunctionByIdAsync(junctionId);
                if (junction is null)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Junction {junctionId} not found in sensor loop.");
                    return;
                }

                bool isFrameMode = junction.RenderingMode.Equals("FrameEngine", StringComparison.OrdinalIgnoreCase);

                // Get screen layout override if exists
                var screenLayoutOverrides = await junctionLinkDb.GetJunctionScreenLayoutsByScreenIdAsync(screen.Id);
                var screenOverride = screenLayoutOverrides.FirstOrDefault(o => o.DeviceScreenId == screen.Id);

                // Get the target MAC address for this device (for ESP-NOW forwarding)
                string? targetMacAddress = null;
                if (!string.IsNullOrEmpty(junctionType) && junctionType.Equals("Gateway Junction (HTTP to ESP:NOW)", StringComparison.OrdinalIgnoreCase))
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
                    try
                    {
                        if (isFrameMode)
                        {
                            // FRAME MODE: Generate and send frame
                            var frameStopwatch = System.Diagnostics.Stopwatch.StartNew();
                            Dictionary<string, object> framePayload = await loopPayloadService.GenerateFramePayloadsAsync(
                                screenKey,
                                assignedSensors,
                                screen,
                                screenOverride,
                                junctionId,  // ADD THIS
                                await GetLinkIdForDeviceAsync(junctionId, deviceId, loopScope), // ADD THIS
                                junctionType: junctionType,
                                gatewayDestination: targetMacAddress,
                                compressPayload: junction.CompressPayload);
                            frameStopwatch.Stop();

                            if (!framePayload.TryGetValue(screenKey, out object rawFrame) || rawFrame is not byte[] frameBytes)
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] No frame payload for screen {screenKey}. Exiting loop.");
                                break;
                            }

                            // Store the frame in stream info before sending
                            var layoutType = screenOverride?.FrameLayoutId?.ToString() ?? screen.Template?.LayoutType ?? "default";
                            info.UpdateLastSentFrame(frameBytes, layoutType);

                            // Send frame
                            Stopwatch sendStopwatch = Stopwatch.StartNew();
                            var result = await info.HttpSender!.SendPayloadWithHealthAsync(frameBytes);
                            sendStopwatch.Stop();

                            // Update result with frame-specific metrics
                            result.IsFramePayload = true;
                            result.FrameSizeBytes = frameBytes.Length;
                            result.FrameRenderTimeMs = frameStopwatch.ElapsedMilliseconds;
                            result.PayloadType = "Frame";

                            // Update health information
                            info.Health.UpdateHealth(result);

                            if (!result.Success)
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Frame send failed: {result.ErrorType} - {result.ErrorMessage}");
                                if (info.Health.ConnectionState == "disconnected" && info.Health.ConsecutiveFailures > 5)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Too many consecutive failures ({info.Health.ConsecutiveFailures}), stopping stream.");
                                    break;
                                }
                                if (info.Health.ConsecutiveFailures > 1)
                                {
                                    await Task.Delay(Math.Min(info.Health.ConsecutiveFailures * 100, 1000), cts.Token);
                                }
                            }

                            info.Latency = result.LatencyMs;
                            info.LastSentTime = DateTime.UtcNow;

                            // Console.WriteLine($"[{DateTime.Now:HH:mm:ss.fff}] [SERVICE_STREAM_MANAGER_HTTP] Frame sent to {info.DeviceName}. Size: {frameBytes.Length} bytes, Render: {frameStopwatch.ElapsedMilliseconds}ms, Send: {result.LatencyMs}ms");

                            var historyEntry = _historyManager.CreateEntryFromHTTP(info);
                            _historyManager.AddHistoryEntry(historyEntry);

                            _streamLatencies[screen.Id] = result.LatencyMs;

                            int calculatedPause = Math.Max(rate - (int)result.LatencyMs, 0);
                            if (calculatedPause > 0)
                            {
                                await Task.Delay(calculatedPause, cts.Token);
                            }
                        }
                        else
                        {
                            // PAYLOAD MODE: Existing sensor payload logic
                            // Build uncompressed sensor payload JSON
                            Dictionary<string, object> uncompressedSensorPayload = screen.Template?.LayoutType switch
                            {
                                "MATRIX" => await loopPayloadService.GenerateMatrixSensorPayloadsAsync(
                                    screenKey,
                                    assignedSensors.Count,
                                    assignedSensors,
                                    screen,
                                    startingYOffset: 0,
                                    junctionType: junctionType,
                                    gatewayDestination: targetMacAddress,
                                    compressPayload: false),
                                _ => await loopPayloadService.GenerateSensorPayloadsAsync(
                                    screenKey,
                                    assignedSensors.Count,
                                    assignedSensors,
                                    screen,
                                    junctionType: junctionType,
                                    gatewayDestination: targetMacAddress,
                                    compressPayload: false)
                            };

                            if (!uncompressedSensorPayload.TryGetValue(screenKey, out object rawUncompressedSensor) ||
                                rawUncompressedSensor is not string uncompressedSensorJson)
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] No uncompressed sensor payload for screen {screenKey}. Exiting loop.");
                                break;
                            }

                            // Extract uncompressed sensor payload info FIRST (always needed for UI)
                            string uncompressedSensorPrefix = ExtractStringPrefix(uncompressedSensorJson);
                            info.LastSentPayloadPrefix = uncompressedSensorPrefix;

                            string sensorJson = string.IsNullOrEmpty(uncompressedSensorPrefix)
                                ? uncompressedSensorJson
                                : uncompressedSensorJson.Substring(8);
                            info.UpdateLastSentPayload(sensorJson);

                            // If compression is enabled, send binary; otherwise send JSON string
                            if (junction.CompressPayload)
                            {
                                Dictionary<string, object> compressedSensorPayload = screen.Template?.LayoutType switch
                                {
                                    "MATRIX" => await loopPayloadService.GenerateMatrixSensorPayloadsAsync(
                                        screenKey,
                                        assignedSensors.Count,
                                        assignedSensors,
                                        screen,
                                        startingYOffset: 0,
                                        junctionType: junctionType,
                                        gatewayDestination: targetMacAddress,
                                        compressPayload: true),
                                    _ => await loopPayloadService.GenerateSensorPayloadsAsync(
                                        screenKey,
                                        assignedSensors.Count,
                                        assignedSensors,
                                        screen,
                                        junctionType: junctionType,
                                        gatewayDestination: targetMacAddress,
                                        compressPayload: true)
                                };

                                if (!compressedSensorPayload.TryGetValue(screenKey, out object rawCompressedSensor))
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] No compressed sensor payload for screen {screenKey}. Exiting loop.");
                                    break;
                                }

                                if (rawCompressedSensor is byte[] compressedSensorBytes)
                                {
                                    // Extract compressed prefix from binary payload
                                    string compressedSensorPrefix = ExtractBinaryPrefix(compressedSensorBytes);
                                    info.UpdateCompressedLastSentPayloadPrefix(compressedSensorPrefix);

                                    // Send raw binary bytes directly (no Base64 conversion)
                                    Stopwatch stopwatch = Stopwatch.StartNew();
                                    var result = await info.HttpSender!.SendPayloadWithHealthAsync(compressedSensorBytes);
                                    stopwatch.Stop();

                                    // Mark as payload, not frame
                                    result.PayloadType = "Gzip";

                                    // Update health information
                                    info.Health.UpdateHealth(result);

                                    if (!result.Success)
                                    {
                                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Send failed: {result.ErrorType} - {result.ErrorMessage}");
                                        if (info.Health.ConnectionState == "disconnected" && info.Health.ConsecutiveFailures > 5)
                                        {
                                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Too many consecutive failures ({info.Health.ConsecutiveFailures}), stopping stream.");
                                            break;
                                        }
                                        if (info.Health.ConsecutiveFailures > 1)
                                        {
                                            await Task.Delay(Math.Min(info.Health.ConsecutiveFailures * 100, 1000), cts.Token);
                                        }
                                    }

                                    info.Latency = result.LatencyMs;
                                    info.LastSentTime = DateTime.UtcNow;

                                    // Console.WriteLine($"[{DateTime.Now:HH:mm:ss.fff}] [SERVICE_STREAM_MANAGER_HTTP] Sensor payload sent (compressed) to {info.DeviceName}. Latency: {result.LatencyMs}ms");

                                    var historyEntry = _historyManager.CreateEntryFromHTTP(info);
                                    _historyManager.AddHistoryEntry(historyEntry);

                                    _streamLatencies[screen.Id] = result.LatencyMs;

                                    int calculatedPause = Math.Max(rate - (int)result.LatencyMs, 0);
                                    if (calculatedPause > 0)
                                    {
                                        await Task.Delay(calculatedPause, cts.Token);
                                    }

                                    continue;
                                }
                                else if (rawCompressedSensor is string compressedSensorString)
                                {
                                    // Extract compressed prefix from string payload
                                    string compressedSensorPrefix = ExtractStringPrefix(compressedSensorString);
                                    info.UpdateCompressedLastSentPayloadPrefix(compressedSensorPrefix);

                                    Stopwatch stopwatch = Stopwatch.StartNew();
                                    var result = await info.HttpSender!.SendPayloadWithHealthAsync(Encoding.UTF8.GetBytes(compressedSensorString));
                                    stopwatch.Stop();

                                    // Mark as payload, not frame
                                    result.PayloadType = "Gzip";

                                    // Update health information
                                    info.Health.UpdateHealth(result);

                                    if (!result.Success)
                                    {
                                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Send failed: {result.ErrorType} - {result.ErrorMessage}");
                                        if (info.Health.ConnectionState == "disconnected" && info.Health.ConsecutiveFailures > 5)
                                        {
                                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Too many consecutive failures ({info.Health.ConsecutiveFailures}), stopping stream.");
                                            break;
                                        }
                                        if (info.Health.ConsecutiveFailures > 1)
                                        {
                                            await Task.Delay(Math.Min(info.Health.ConsecutiveFailures * 100, 1000), cts.Token);
                                        }
                                    }

                                    info.Latency = result.LatencyMs;
                                    info.LastSentTime = DateTime.UtcNow;

                                    // Console.WriteLine($"[{DateTime.Now:HH:mm:ss.fff}] [SERVICE_STREAM_MANAGER_HTTP] Sensor payload sent (compressed string) to {info.DeviceName}. Latency: {result.LatencyMs}ms");

                                    var historyEntry = _historyManager.CreateEntryFromHTTP(info);
                                    _historyManager.AddHistoryEntry(historyEntry);

                                    _streamLatencies[screen.Id] = result.LatencyMs;

                                    int calculatedPause = Math.Max(rate - (int)result.LatencyMs, 0);
                                    if (calculatedPause > 0)
                                    {
                                        await Task.Delay(calculatedPause, cts.Token);
                                    }

                                    continue;
                                }
                                else
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Unexpected compressed sensor payload type for screen {screenKey}. Exiting loop.");
                                    break;
                                }
                            }

                            // Send uncompressed JSON sensor payload (convert string to bytes)
                            Stopwatch stopwatchUncompressed = Stopwatch.StartNew();
                            var resultUncompressed = await info.HttpSender!.SendPayloadWithHealthAsync(Encoding.UTF8.GetBytes(uncompressedSensorJson));
                            stopwatchUncompressed.Stop();

                            // Mark as payload, not frame
                            resultUncompressed.PayloadType = "JSON";

                            // Update health information
                            info.Health.UpdateHealth(resultUncompressed);

                            if (!resultUncompressed.Success)
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Send failed: {resultUncompressed.ErrorType} - {resultUncompressed.ErrorMessage}");
                                if (info.Health.ConnectionState == "disconnected" && info.Health.ConsecutiveFailures > 5)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Too many consecutive failures ({info.Health.ConsecutiveFailures}), stopping stream.");
                                    break;
                                }
                                if (info.Health.ConsecutiveFailures > 1)
                                {
                                    await Task.Delay(Math.Min(info.Health.ConsecutiveFailures * 100, 1000), cts.Token);
                                }
                            }
                            else
                            {
                                // Log pool recreation events for debugging
                                if (resultUncompressed.KeepAlivePoolRecreated)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Keep-alive pool recreated for {info.DeviceName}");
                                }
                            }

                            info.Latency = resultUncompressed.LatencyMs;
                            info.LastSentTime = DateTime.UtcNow;

                            // Console.WriteLine($"[{DateTime.Now:HH:mm:ss.fff}] [SERVICE_STREAM_MANAGER_HTTP] Sensor payload sent (uncompressed) to {info.DeviceName}. Latency: {resultUncompressed.LatencyMs}ms");

                            var historyEntryUncompressed = _historyManager.CreateEntryFromHTTP(info);
                            _historyManager.AddHistoryEntry(historyEntryUncompressed);

                            _streamLatencies[screen.Id] = resultUncompressed.LatencyMs;

                            int calculatedPauseUncompressed = Math.Max(rate - (int)resultUncompressed.LatencyMs, 0);
                            if (calculatedPauseUncompressed > 0)
                            {
                                await Task.Delay(calculatedPauseUncompressed, cts.Token);
                            }
                        }
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Unexpected error in streaming loop: {ex.Message}");

                        // Update health with unexpected error
                        var errorResult = new HttpSendResult
                        {
                            Success = false,
                            ErrorType = "unexpected_error",
                            ErrorMessage = ex.Message,
                            LatencyMs = 0,
                            PayloadType = isFrameMode ? "Frame" : "JSON"
                        };
                        info.Health.UpdateHealth(errorResult);

                        // Wait a bit before retrying on unexpected errors
                        await Task.Delay(1000, cts.Token);
                    }
                }

                // Update status when loop exits
                if (_streamingTokens.TryGetValue(screen.Id, out var finalInfo))
                {
                    finalInfo.Status = "Inactive";
                    finalInfo.Health.ConnectionState = "disconnected";
                }

            }, cts.Token);
        }

        private async Task<int?> GetLinkIdForDeviceAsync(int junctionId, int deviceId, IServiceScope scope)
        {
            try
            {
                var junctionLinkDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_JunctionLinks>();
                var deviceLinks = await junctionLinkDb.GetDeviceLinksByJunctionAsync(junctionId);
                var deviceLink = deviceLinks.FirstOrDefault(link => link.DeviceId == deviceId);
                return deviceLink?.Id;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] ⚠️ Could not get link ID for device {deviceId}: {ex.Message}");
                return null;
            }
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

        public StreamHistoryResponse GetStreamHistory(int screenId, DateTime? fromTime = null, DateTime? toTime = null, bool includeStatistics = true)
        {
            return _historyManager.GetStreamHistory(screenId, fromTime, toTime, includeStatistics);
        }

        public Dictionary<int, StreamHistoryResponse> GetAllStreamHistories(DateTime? fromTime = null, DateTime? toTime = null, bool includeStatistics = false)
        {
            return _historyManager.GetAllStreamHistories(fromTime, toTime, includeStatistics);
        }

        public object GetHistorySummary()
        {
            return _historyManager.GetHistorySummary();
        }

        public bool ClearStreamHistory(int screenId)
        {
            return _historyManager.ClearStreamHistory(screenId);
        }

        public void UpdateHistoryRetention(TimeSpan retentionPeriod)
        {
            _historyManager.UpdateRetentionPeriod(retentionPeriod);
        }

        public void UpdateHistoryMaxEntries(int maxEntries)
        {
            _historyManager.UpdateMaxEntries(maxEntries);
        }

        public HistoryConfiguration GetHistoryConfiguration()
        {
            return _historyManager.GetConfiguration();
        }

        public bool IsStreaming(int screenId)
            => _streamingTokens.ContainsKey(screenId);
    }
}