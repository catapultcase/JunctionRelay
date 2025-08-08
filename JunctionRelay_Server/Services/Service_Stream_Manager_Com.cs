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

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using JunctionRelayServer.Models;
using System.Text;

namespace JunctionRelayServer.Services
{
    // Proper COM-specific result class
    public class ComOperationResult
    {
        public bool Success { get; set; }
        public string ErrorType { get; set; } = string.Empty;
        public string ErrorMessage { get; set; } = string.Empty;
        public long LatencyMs { get; set; }
        public int BytesSent { get; set; }
        public string ComPort { get; set; } = string.Empty;

        // Frame-specific metrics
        public bool IsFramePayload { get; set; } = false;
        public int? FrameSizeBytes { get; set; }
        public long? FrameRenderTimeMs { get; set; }
        public string? FrameLayoutType { get; set; }
        public string PayloadType { get; set; } = "JSON"; // "JSON", "Gzip", "Frame"
    }

    // COM-specific health tracking
    public class ComStreamHealth
    {
        public string ConnectionState { get; set; } = "good"; // "good", "poor", "disconnected"
        public int ConsecutiveFailures { get; set; } = 0;
        public int ConsecutiveSuccesses { get; set; } = 0;
        public DateTime LastSuccessTime { get; set; } = DateTime.UtcNow;
        public DateTime LastFailureTime { get; set; } = DateTime.MinValue;
        public string LastErrorMessage { get; set; } = string.Empty;
        public double SuccessRate { get; set; } = 100.0; // Rolling 10-attempt window
        public List<bool> RecentAttempts { get; set; } = new(); // Last 10 attempts for rolling average
        public string ErrorType { get; set; } = string.Empty; // Latest error type
        public string ComPort { get; set; } = string.Empty;

        // Performance metrics
        public double AverageLatency { get; set; } = 0.0;
        public long MaxLatency { get; set; } = 0;
        public long MinLatency { get; set; } = long.MaxValue;
        public long TotalBytesSent { get; set; } = 0;

        // Frame-specific health metrics
        public bool IsFrameMode { get; set; } = false;
        public double AverageFrameSize { get; set; } = 0.0;
        public long MaxFrameSize { get; set; } = 0;
        public long MinFrameSize { get; set; } = long.MaxValue;
        public double AverageFrameRenderTime { get; set; } = 0.0;
        public long MaxFrameRenderTime { get; set; } = 0;
        public long MinFrameRenderTime { get; set; } = long.MaxValue;
        public string CurrentFrameLayoutType { get; set; } = string.Empty;
        public string PayloadType { get; set; } = "JSON"; // Track current payload type
        public int FramesSent { get; set; } = 0;
        public int PayloadsSent { get; set; } = 0;

        public void UpdateHealth(ComOperationResult result)
        {
            // Update recent attempts (rolling window of 10)
            RecentAttempts.Add(result.Success);
            if (RecentAttempts.Count > 10)
                RecentAttempts.RemoveAt(0);

            // Calculate success rate
            SuccessRate = RecentAttempts.Count > 0 ?
                RecentAttempts.Count(x => x) * 100.0 / RecentAttempts.Count : 100.0;

            // Update latency metrics
            if (result.Success && result.LatencyMs > 0)
            {
                AverageLatency = AverageLatency == 0 ? result.LatencyMs :
                    (AverageLatency * 0.8) + (result.LatencyMs * 0.2); // Weighted average
                MaxLatency = Math.Max(MaxLatency, result.LatencyMs);
                MinLatency = Math.Min(MinLatency, result.LatencyMs);
            }

            // Update byte tracking
            if (result.Success && result.BytesSent > 0)
            {
                TotalBytesSent += result.BytesSent;
            }

            // Update frame-specific metrics
            if (result.IsFramePayload)
            {
                IsFrameMode = true;
                FramesSent++;
                PayloadType = "Frame";
                CurrentFrameLayoutType = result.FrameLayoutType ?? string.Empty;

                // Track frame size metrics
                if (result.FrameSizeBytes.HasValue && result.FrameSizeBytes.Value > 0)
                {
                    var frameSize = result.FrameSizeBytes.Value;
                    AverageFrameSize = AverageFrameSize == 0 ? frameSize :
                        (AverageFrameSize * 0.8) + (frameSize * 0.2); // Weighted average
                    MaxFrameSize = Math.Max(MaxFrameSize, frameSize);
                    MinFrameSize = MinFrameSize == long.MaxValue ? frameSize : Math.Min(MinFrameSize, frameSize);
                }

                // Track frame render time metrics
                if (result.FrameRenderTimeMs.HasValue && result.FrameRenderTimeMs.Value > 0)
                {
                    var renderTime = result.FrameRenderTimeMs.Value;
                    AverageFrameRenderTime = AverageFrameRenderTime == 0 ? renderTime :
                        (AverageFrameRenderTime * 0.8) + (renderTime * 0.2); // Weighted average
                    MaxFrameRenderTime = Math.Max(MaxFrameRenderTime, renderTime);
                    MinFrameRenderTime = MinFrameRenderTime == long.MaxValue ? renderTime : Math.Min(MinFrameRenderTime, renderTime);
                }
            }
            else
            {
                PayloadsSent++;
                PayloadType = result.PayloadType;
            }

            ComPort = result.ComPort;

            if (result.Success)
            {
                ConsecutiveSuccesses++;
                ConsecutiveFailures = 0;
                LastSuccessTime = DateTime.UtcNow;
                ErrorType = string.Empty;
                LastErrorMessage = string.Empty;
            }
            else
            {
                ConsecutiveFailures++;
                ConsecutiveSuccesses = 0;
                LastFailureTime = DateTime.UtcNow;
                ErrorType = result.ErrorType;
                LastErrorMessage = result.ErrorMessage;
            }

            // Determine connection state
            DetermineConnectionState();
        }

        private void DetermineConnectionState()
        {
            // Good: High success rate and no recent failures
            if (SuccessRate >= 95.0 && ConsecutiveFailures == 0)
            {
                ConnectionState = "good";
            }
            // Poor: Moderate success rate or some failures but still functional
            else if (SuccessRate >= 70.0 || (ConsecutiveFailures > 0 && ConsecutiveFailures < 3))
            {
                ConnectionState = "poor";
            }
            // Disconnected: Low success rate or sustained failures
            else
            {
                ConnectionState = "disconnected";
            }

            // COM-specific considerations
            if (ConnectionState == "good" && AverageLatency > 200) // High latency for COM
            {
                ConnectionState = "poor";
            }

            // Frame-specific health considerations
            if (IsFrameMode && ConnectionState == "good")
            {
                // Consider frame rendering performance in health assessment
                if (AverageFrameRenderTime > 1000) // Frame rendering taking too long for COM
                {
                    ConnectionState = "poor";
                }

                // Large frames might indicate potential issues for COM
                if (AverageFrameSize > 100000) // 100KB frames might be too large for COM
                {
                    Console.WriteLine($"[COM_STREAM_HEALTH] ⚠️ Large average frame size detected: {AverageFrameSize:F0} bytes on {ComPort}");
                }
            }
        }

        // Helper method to get frame-specific health summary
        public object GetFrameHealthSummary()
        {
            if (!IsFrameMode)
            {
                return new { Message = "Not in frame mode" };
            }

            return new
            {
                FrameMode = IsFrameMode,
                FrameLayoutType = CurrentFrameLayoutType,
                FramesSent,
                AverageFrameSize = $"{AverageFrameSize:F0} bytes",
                FrameSizeRange = $"{(MinFrameSize == long.MaxValue ? 0 : MinFrameSize)} - {MaxFrameSize} bytes",
                AverageRenderTime = $"{AverageFrameRenderTime:F1}ms",
                RenderTimeRange = $"{(MinFrameRenderTime == long.MaxValue ? 0 : MinFrameRenderTime)} - {MaxFrameRenderTime}ms",
                ComPort = ComPort,
                TotalBytesSent = $"{TotalBytesSent:N0} bytes"
            };
        }
    }

    public class Service_Stream_Manager_COM
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IServiceProvider _serviceProvider;
        private readonly ConcurrentDictionary<int, Service_StreamInfo_COM> _streamingTokens = new();
        private readonly ConcurrentDictionary<int, long> _latencies = new();
        private readonly Service_Stream_History_Manager _historyManager;

        public Service_Stream_Manager_COM(
            IServiceScopeFactory scopeFactory,
            IServiceProvider serviceProvider,
            Service_Stream_History_Manager historyManager)
        {
            _scopeFactory = scopeFactory;
            _serviceProvider = serviceProvider;
            _historyManager = historyManager;
        }

        public IEnumerable<object> GetActiveStreams(bool showCompressed = false)
        {
            return _streamingTokens.Select(kvp =>
            {
                Service_StreamInfo_COM info = kvp.Value;
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
                    info.ComPort,

                    // NEW: Frame information
                    HasLastFrame = info.LastSentFrameBytes != null,
                    LastFrameSize = info.LastFrameSize,
                    LastFrameTime = info.LastFrameGeneratedTime,
                    LastFrameLayoutType = info.LastFrameLayoutType,

                    // Proper COM health information
                    Health = new
                    {
                        info.Health.ConnectionState,
                        info.Health.SuccessRate,
                        info.Health.LastErrorMessage,
                        info.Health.ErrorType,
                        info.Health.ConsecutiveFailures,
                        info.Health.ConsecutiveSuccesses,
                        info.Health.AverageLatency,
                        info.Health.MaxLatency,
                        info.Health.MinLatency,
                        info.Health.LastSuccessTime,
                        info.Health.LastFailureTime,
                        info.Health.ComPort,
                        info.Health.TotalBytesSent,

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
                    ConfigPayloadJson = showCompressed
                        ? info.GetCompressedConfigPayloadPreview()
                        : info.ConfigPayloadJson,
                    info.LastSentPayloadPrefix,
                    LastSentPayloadJson = showCompressed
                        ? info.GetCompressedLastSentPayloadPreview()
                        : info.LastSentPayloadJson,
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

        // Helper method to get link ID for device
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
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] ⚠️ Could not get link ID for device {deviceId}: {ex.Message}");
                return null;
            }
        }

        public async Task StartStreamingAsync(
            int junctionId,
            int deviceId,
            int rate,
            string screenKey,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            string? junctionType = null,
            string? gatewayDestination = null)
        {
            if (_streamingTokens.ContainsKey(screen.Id))
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Stream already active for device {deviceId}, screen {screenKey}");
                return;
            }

            CancellationTokenSource cts = new();

            // —— INITIAL CONFIG SCOPE ——
            using (IServiceScope scope = _scopeFactory.CreateScope())
            {
                Service_Database_Manager_Devices deviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();
                Service_Manager_Payloads payloadService = scope.ServiceProvider.GetRequiredService<Service_Manager_Payloads>();
                Service_Database_Manager_Junctions junctionDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Junctions>();
                Service_Database_Manager_JunctionLinks junctionLinkDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_JunctionLinks>();

                Model_Device? device = await deviceDb.GetDeviceByIdAsync(deviceId);
                if (device is null)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Device {deviceId} not found.");
                    return;
                }

                Model_Junction? junction = await junctionDb.GetJunctionByIdAsync(junctionId);
                if (junction is null)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Junction {junctionId} not found.");
                    return;
                }

                // Check if this junction is in Frame rendering mode
                bool isFrameMode = junction.RenderingMode.Equals("FrameEngine", StringComparison.OrdinalIgnoreCase);

                // Get screen layout override if exists
                var screenLayoutOverrides = await junctionLinkDb.GetJunctionScreenLayoutsByScreenIdAsync(screen.Id);
                var screenOverride = screenLayoutOverrides.FirstOrDefault(o => o.DeviceScreenId == screen.Id);

                string comPort;
                string? targetMacAddress = device.UniqueIdentifier;

                if (!string.IsNullOrEmpty(junctionType) &&
                    junctionType.Equals("Gateway Junction (COM to ESP:NOW)", StringComparison.OrdinalIgnoreCase))
                {
                    if (string.IsNullOrWhiteSpace(gatewayDestination))
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Gateway junction requires gateway COM port.");
                        return;
                    }

                    comPort = gatewayDestination;
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Gateway junction: COM to {comPort}, ESP-NOW target: {targetMacAddress}");
                }
                else
                {
                    if (string.IsNullOrWhiteSpace(device.COMPort))
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] No COM port selected for device {deviceId}.");
                        return;
                    }

                    comPort = device.COMPort;
                }

                Func<string, Service_Send_Data_COM> senderFactory =
                    _serviceProvider.GetRequiredService<Func<string, Service_Send_Data_COM>>();
                Service_Send_Data_COM comSender = senderFactory(comPort);
                comSender.OpenPortIfNotOpen(115200);

                Service_StreamInfo_COM streamInfo = new(junction.CompressPayload)
                {
                    DeviceName = device.Name,
                    Rate = rate,
                    Status = "Active",
                    Cts = cts,
                    ComSender = comSender,
                    ComPort = comPort,
                    ScreenId = screen.Id,
                    ScreenName = screen.DisplayName ?? string.Empty,
                    SensorsCount = assignedSensors.Count,
                    Latency = 0,
                    LastSentTime = DateTime.UtcNow,
                    Protocol = "COM",
                    Health = new ComStreamHealth { ComPort = comPort }
                };

                // Update protocol to indicate frame mode
                if (isFrameMode)
                {
                    streamInfo.Protocol = "COM (Frames)";
                    streamInfo.Health.IsFrameMode = true;
                }

                _streamingTokens[screen.Id] = streamInfo;

                // Send initial configuration based on rendering mode
                if (isFrameMode)
                {
                    // FRAME MODE: Generate and send initial frame
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] 🖼️ Starting in Frame rendering mode for {screenKey}");

                    var frameStopwatch = System.Diagnostics.Stopwatch.StartNew();
                    Dictionary<string, object> frameConfig = await payloadService.GenerateFramePayloadsAsync(
                        screenKey,
                        assignedSensors,
                        screen,
                        screenOverride,
                        junctionId,
                        await GetLinkIdForDeviceAsync(junctionId, deviceId, scope),
                        junctionType: junctionType,
                        gatewayDestination: targetMacAddress,
                        compressPayload: junction.CompressPayload);
                    frameStopwatch.Stop();

                    if (!frameConfig.TryGetValue(screenKey, out object rawFrame))
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] No frame payload for screen {screenKey}.");
                        streamInfo.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }

                    // Send the frame (should be byte array)
                    if (rawFrame is byte[] frameBytes)
                    {
                        // Store the frame in stream info before sending
                        var layoutType = screenOverride?.FrameLayoutId?.ToString() ?? screen.Template?.LayoutType ?? "default";
                        streamInfo.UpdateLastSentFrame(frameBytes, layoutType);

                        var sendStopwatch = System.Diagnostics.Stopwatch.StartNew();
                        (bool success, _) = await comSender.SendPayloadAsync(frameBytes);
                        sendStopwatch.Stop();

                        // Create result with frame-specific metrics
                        var result = new ComOperationResult
                        {
                            Success = success,
                            LatencyMs = sendStopwatch.ElapsedMilliseconds,
                            ErrorType = success ? string.Empty : "com_frame_send_failed",
                            ErrorMessage = success ? string.Empty : "COM frame send failure",
                            ComPort = comPort,
                            BytesSent = frameBytes.Length,
                            IsFramePayload = true,
                            FrameSizeBytes = frameBytes.Length,
                            FrameRenderTimeMs = frameStopwatch.ElapsedMilliseconds,
                            PayloadType = "Frame",
                            FrameLayoutType = layoutType
                        };

                        streamInfo.Health.UpdateHealth(result);

                        if (!result.Success)
                        {
                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Failed to send initial frame.");
                            streamInfo.Dispose();
                            _streamingTokens.TryRemove(screen.Id, out _);
                            return;
                        }

                        Console.WriteLine(
                        $"[{DateTime.Now:HH:mm:ss.fff}] [SERVICE_STREAM_MANAGER_COM] " +
                        $"Initial frame sent to {device.Name} via COM port {comPort}. " +
                        $"Frame: {frameBytes.Length} bytes, Render: {frameStopwatch.ElapsedMilliseconds}ms, Send: {sendStopwatch.ElapsedMilliseconds}ms");
                    }
                    else
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Frame payload is not byte array for screen {screenKey}.");
                        streamInfo.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }
                }
                else
                {
                    // PAYLOAD MODE: Generate and send config payload (existing logic)
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] 📄 Starting in Payload rendering mode for {screenKey}");

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
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] No uncompressed config payload for screen {screenKey}.");
                        streamInfo.Dispose();
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
                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] No compressed config payload for screen {screenKey}.");
                            streamInfo.Dispose();
                            _streamingTokens.TryRemove(screen.Id, out _);
                            return;
                        }

                        if (rawCompressed is byte[] compressedBytes)
                        {
                            string compressedPrefix = ExtractBinaryPrefix(compressedBytes);
                            streamInfo.UpdateCompressedConfigPayloadPrefix(compressedPrefix);

                            (bool success, _) = await comSender.SendPayloadAsync(compressedBytes);
                            if (!success)
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Failed to send compressed config payload.");
                                streamInfo.Dispose();
                                _streamingTokens.TryRemove(screen.Id, out _);
                                return;
                            }
                        }
                        else if (rawCompressed is string compressedString)
                        {
                            string compressedPrefix = ExtractStringPrefix(compressedString);
                            streamInfo.UpdateCompressedConfigPayloadPrefix(compressedPrefix);

                            (bool success, _) = await comSender.SendPayloadAsync(compressedString);
                            if (!success)
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Failed to send compressed config payload as string.");
                                streamInfo.Dispose();
                                _streamingTokens.TryRemove(screen.Id, out _);
                                return;
                            }
                        }
                        else
                        {
                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Unexpected compressed config payload type for screen {screenKey}.");
                            streamInfo.Dispose();
                            _streamingTokens.TryRemove(screen.Id, out _);
                            return;
                        }
                    }
                    else
                    {
                        (bool success, _) = await comSender.SendPayloadAsync(uncompressedJson);
                        if (!success)
                        {
                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Failed to send uncompressed config payload.");
                            streamInfo.Dispose();
                            _streamingTokens.TryRemove(screen.Id, out _);
                            return;
                        }
                    }

                    // Extract uncompressed prefix and update StreamInfo
                    string uncompressedPrefix = ExtractStringPrefix(uncompressedJson);
                    streamInfo.ConfigPayloadPrefix = uncompressedPrefix;

                    // Extract JSON part (after prefix)
                    string jsonConfig = string.IsNullOrEmpty(uncompressedPrefix)
                        ? uncompressedJson
                        : uncompressedJson.Substring(8);
                    streamInfo.UpdateConfigPayload(jsonConfig);

                    string compressionInfo = junction.CompressPayload ? " (compressed)" : "";
                    string junctionInfo = !string.IsNullOrEmpty(junctionType) ? $" ({junctionType})" : "";
                    if (!string.IsNullOrEmpty(junctionType) && junctionType.Equals("Gateway Junction (COM to ESP:NOW)", StringComparison.OrdinalIgnoreCase))
                    {
                        Console.WriteLine($"[{DateTime.Now:HH:mm:ss.fff}] [SERVICE_STREAM_MANAGER_COM] Config sent to gateway {comPort} via COM connection, target: {targetMacAddress}{compressionInfo}");
                    }
                    else
                    {
                        Console.WriteLine($"[{DateTime.Now:HH:mm:ss.fff}] [SERVICE_STREAM_MANAGER_COM] Config sent to {device.Name} via COM port {comPort}{junctionInfo}{compressionInfo}.");
                    }
                }
            }

            // —— SENSOR POLLING LOOP ——
            _ = Task.Run(async () =>
            {
                using IServiceScope loopScope = _scopeFactory.CreateScope();
                Service_Manager_Payloads loopPayloadService =
                    loopScope.ServiceProvider.GetRequiredService<Service_Manager_Payloads>();
                Service_Database_Manager_Junctions junctionDb =
                    loopScope.ServiceProvider.GetRequiredService<Service_Database_Manager_Junctions>();
                Service_Database_Manager_JunctionLinks junctionLinkDb = loopScope.ServiceProvider.GetRequiredService<Service_Database_Manager_JunctionLinks>();

                Service_StreamInfo_COM streamInfo = _streamingTokens[screen.Id];

                // Get junction for compression and rendering mode settings
                Model_Junction? junction = await junctionDb.GetJunctionByIdAsync(junctionId);
                if (junction is null)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Junction {junctionId} not found in sensor loop.");
                    return;
                }

                bool isFrameMode = junction.RenderingMode.Equals("FrameEngine", StringComparison.OrdinalIgnoreCase);

                // Get screen layout override if exists
                var screenLayoutOverrides = await junctionLinkDb.GetJunctionScreenLayoutsByScreenIdAsync(screen.Id);
                var screenOverride = screenLayoutOverrides.FirstOrDefault(o => o.DeviceScreenId == screen.Id);

                // Get the target MAC address for this device (for ESP-NOW forwarding)
                string? targetMacAddress = null;
                if (!string.IsNullOrEmpty(junctionType) &&
                    junctionType.Equals("Gateway Junction (COM to ESP:NOW)", StringComparison.OrdinalIgnoreCase))
                {
                    using IServiceScope deviceScope = _scopeFactory.CreateScope();
                    Service_Database_Manager_Devices deviceDb =
                        deviceScope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();
                    Model_Device? device = await deviceDb.GetDeviceByIdAsync(deviceId);
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
                                junctionId,
                                await GetLinkIdForDeviceAsync(junctionId, deviceId, loopScope),
                                junctionType: junctionType,
                                gatewayDestination: targetMacAddress,
                                compressPayload: junction.CompressPayload);
                            frameStopwatch.Stop();

                            if (!framePayload.TryGetValue(screenKey, out object rawFrame) || rawFrame is not byte[] frameBytes)
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] No frame payload for screen {screenKey}. Exiting loop.");
                                break;
                            }

                            // Store the frame in stream info before sending
                            var layoutType = screenOverride?.FrameLayoutId?.ToString() ?? screen.Template?.LayoutType ?? "default";
                            streamInfo.UpdateLastSentFrame(frameBytes, layoutType);

                            // Send frame
                            Stopwatch sendStopwatch = Stopwatch.StartNew();
                            (bool success, _) = await streamInfo.ComSender!.SendPayloadAsync(frameBytes);
                            sendStopwatch.Stop();

                            // Create result with frame-specific metrics
                            var result = new ComOperationResult
                            {
                                Success = success,
                                LatencyMs = sendStopwatch.ElapsedMilliseconds,
                                ErrorType = success ? string.Empty : "com_frame_send_failed",
                                ErrorMessage = success ? string.Empty : "COM frame send failure",
                                ComPort = streamInfo.ComPort ?? string.Empty,
                                BytesSent = frameBytes.Length,
                                IsFramePayload = true,
                                FrameSizeBytes = frameBytes.Length,
                                FrameRenderTimeMs = frameStopwatch.ElapsedMilliseconds,
                                PayloadType = "Frame",
                                FrameLayoutType = layoutType
                            };

                            // Update health information
                            streamInfo.Health.UpdateHealth(result);

                            if (!result.Success)
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Frame send failed: {result.ErrorType} - {result.ErrorMessage}");
                                if (streamInfo.Health.ConnectionState == "disconnected" && streamInfo.Health.ConsecutiveFailures > 5)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Too many consecutive failures ({streamInfo.Health.ConsecutiveFailures}), stopping stream.");
                                    break;
                                }
                                if (streamInfo.Health.ConsecutiveFailures > 1)
                                {
                                    await Task.Delay(Math.Min(streamInfo.Health.ConsecutiveFailures * 100, 1000), cts.Token);
                                }
                            }

                            streamInfo.Latency = result.LatencyMs;
                            streamInfo.LastSentTime = DateTime.UtcNow;

                            // Console.WriteLine($"[{DateTime.Now:HH:mm:ss.fff}] [SERVICE_STREAM_MANAGER_COM] Frame sent to {streamInfo.DeviceName}. Size: {frameBytes.Length} bytes, Render: {frameStopwatch.ElapsedMilliseconds}ms, Send: {result.LatencyMs}ms");

                            StreamHistoryEntry historyEntry = _historyManager.CreateEntryFromCOM(streamInfo);
                            _historyManager.AddHistoryEntry(historyEntry);

                            _latencies[screen.Id] = result.LatencyMs;

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
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] No uncompressed sensor payload for screen {screenKey}. Exiting loop.");
                                break;
                            }

                            // Extract uncompressed sensor payload info FIRST (always needed for UI)
                            string uncompressedSensorPrefix = ExtractStringPrefix(uncompressedSensorJson);
                            streamInfo.LastSentPayloadPrefix = uncompressedSensorPrefix;

                            string sensorJson = string.IsNullOrEmpty(uncompressedSensorPrefix)
                                ? uncompressedSensorJson
                                : uncompressedSensorJson.Substring(8);
                            streamInfo.UpdateLastSentPayload(sensorJson);

                            Stopwatch stopwatch = Stopwatch.StartNew();
                            bool success = false;
                            string payloadType = junction.CompressPayload ? "Gzip" : "JSON";
                            int bytesSent = 0;

                            try
                            {
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

                                    if (compressedSensorPayload.TryGetValue(screenKey, out object rawCompressedSensor))
                                    {
                                        if (rawCompressedSensor is byte[] compressedSensorBytes)
                                        {
                                            streamInfo.UpdateCompressedLastSentPayloadPrefix(ExtractBinaryPrefix(compressedSensorBytes));
                                            (success, _) = await streamInfo.ComSender!.SendPayloadAsync(compressedSensorBytes);
                                            bytesSent = compressedSensorBytes.Length;
                                        }
                                        else if (rawCompressedSensor is string compressedSensorString)
                                        {
                                            streamInfo.UpdateCompressedLastSentPayloadPrefix(ExtractStringPrefix(compressedSensorString));
                                            (success, _) = await streamInfo.ComSender!.SendPayloadAsync(compressedSensorString);
                                            bytesSent = Encoding.UTF8.GetByteCount(compressedSensorString);
                                        }
                                    }
                                }
                                else
                                {
                                    (success, _) = await streamInfo.ComSender!.SendPayloadAsync(uncompressedSensorJson);
                                    bytesSent = Encoding.UTF8.GetByteCount(uncompressedSensorJson);
                                }
                            }
                            catch (Exception ex)
                            {
                                success = false;
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] COM send failed: {ex.Message}");
                            }

                            stopwatch.Stop();

                            ComOperationResult sendResult = new()
                            {
                                Success = success,
                                LatencyMs = stopwatch.ElapsedMilliseconds,
                                ErrorType = success ? string.Empty : "com_send_failed",
                                ErrorMessage = success ? string.Empty : "COM payload send failure",
                                ComPort = streamInfo.ComPort ?? string.Empty,
                                BytesSent = bytesSent,
                                PayloadType = payloadType
                            };

                            streamInfo.Health.UpdateHealth(sendResult);

                            if (!sendResult.Success)
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Send failed: {sendResult.ErrorType} - {sendResult.ErrorMessage}");
                                if (streamInfo.Health.ConnectionState == "disconnected" &&
                                    streamInfo.Health.ConsecutiveFailures > 5)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Too many consecutive failures ({streamInfo.Health.ConsecutiveFailures}), stopping stream.");
                                    break;
                                }
                                if (streamInfo.Health.ConsecutiveFailures > 1)
                                {
                                    await Task.Delay(Math.Min(streamInfo.Health.ConsecutiveFailures * 100, 1000), cts.Token);
                                }
                            }

                            streamInfo.Latency = sendResult.LatencyMs;
                            streamInfo.LastSentTime = DateTime.UtcNow;

                            // Console.WriteLine($"[{DateTime.Now:HH:mm:ss.fff}] [SERVICE_STREAM_MANAGER_COM] Sensor payload sent to {streamInfo.DeviceName}. Latency: {sendResult.LatencyMs}ms");

                            StreamHistoryEntry historyEntry = _historyManager.CreateEntryFromCOM(streamInfo);
                            _historyManager.AddHistoryEntry(historyEntry);

                            _latencies[screen.Id] = sendResult.LatencyMs;

                            int calculatedPause = Math.Max(rate - (int)sendResult.LatencyMs, 0);
                            if (calculatedPause > 0)
                            {
                                await Task.Delay(calculatedPause, cts.Token);
                            }
                        }
                    }
                    catch (Exception exception) when (exception is not OperationCanceledException)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Unexpected error in streaming loop: {exception.Message}");

                        // Update health with unexpected error
                        var errorResult = new ComOperationResult
                        {
                            Success = false,
                            ErrorType = "unexpected_error",
                            ErrorMessage = exception.Message,
                            LatencyMs = 0,
                            ComPort = streamInfo.ComPort ?? string.Empty,
                            PayloadType = isFrameMode ? "Frame" : "JSON"
                        };
                        streamInfo.Health.UpdateHealth(errorResult);

                        // Wait a bit before retrying on unexpected errors
                        await Task.Delay(1000, cts.Token);
                    }
                }

                // Update status when loop exits
                if (_streamingTokens.TryGetValue(screen.Id, out Service_StreamInfo_COM finalInfo))
                {
                    finalInfo.Status = "Inactive";
                    finalInfo.Health.ConnectionState = "disconnected";
                }

            }, cts.Token);
        }

        public void StopStreaming(int screenId)
        {
            if (_streamingTokens.TryRemove(screenId, out Service_StreamInfo_COM info))
            {
                info.Cts.Cancel();
                info.Dispose();
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Stopped stream for screen {screenId}.");
            }
            else
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] No active stream for screen {screenId}.");
            }
        }

        public long GetLatestLatency(int screenId)
        {
            _latencies.TryGetValue(screenId, out long latency);
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
        {
            return _streamingTokens.ContainsKey(screenId);
        }
    }
}