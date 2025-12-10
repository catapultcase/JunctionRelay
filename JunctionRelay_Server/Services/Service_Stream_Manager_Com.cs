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
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    public class ComOperationResult
    {
        public bool Success { get; set; }
        public string ErrorType { get; set; } = string.Empty;
        public string ErrorMessage { get; set; } = string.Empty;
        public long LatencyMs { get; set; }
        public int BytesSent { get; set; }
        public string ComPort { get; set; } = string.Empty;
        public bool IsFramePayload { get; set; } = false;
        public int? FrameSizeBytes { get; set; }
        public long? FrameRenderTimeMs { get; set; }
        public string? FrameLayoutType { get; set; }
        public string PayloadType { get; set; } = "JSON";
    }

    public class ComStreamHealth
    {
        public string ConnectionState { get; set; } = "good";
        public int ConsecutiveFailures { get; set; } = 0;
        public int ConsecutiveSuccesses { get; set; } = 0;
        public DateTime LastSuccessTime { get; set; } = DateTime.UtcNow;
        public DateTime LastFailureTime { get; set; } = DateTime.MinValue;
        public string LastErrorMessage { get; set; } = string.Empty;
        public double SuccessRate { get; set; } = 100.0;
        public List<bool> RecentAttempts { get; set; } = new();
        public string ErrorType { get; set; } = string.Empty;
        public string ComPort { get; set; } = string.Empty;

        public double AverageLatency { get; set; } = 0.0;
        public long MaxLatency { get; set; } = 0;
        public long MinLatency { get; set; } = long.MaxValue;
        public long TotalBytesSent { get; set; } = 0;

        public bool IsFrameMode { get; set; } = false;
        public double AverageFrameSize { get; set; } = 0.0;
        public long MaxFrameSize { get; set; } = 0;
        public long MinFrameSize { get; set; } = long.MaxValue;
        public double AverageFrameRenderTime { get; set; } = 0.0;
        public long MaxFrameRenderTime { get; set; } = 0;
        public long MinFrameRenderTime { get; set; } = long.MaxValue;
        public string CurrentFrameLayoutType { get; set; } = string.Empty;
        public string PayloadType { get; set; } = "JSON";
        public int FramesSent { get; set; } = 0;
        public int PayloadsSent { get; set; } = 0;

        public void UpdateHealth(ComOperationResult result)
        {
            RecentAttempts.Add(result.Success);
            if (RecentAttempts.Count > 10)
                RecentAttempts.RemoveAt(0);

            SuccessRate = RecentAttempts.Count > 0 ?
                RecentAttempts.Count(x => x) * 100.0 / RecentAttempts.Count : 100.0;

            if (result.Success && result.LatencyMs > 0)
            {
                AverageLatency = AverageLatency == 0 ? result.LatencyMs :
                    (AverageLatency * 0.8) + (result.LatencyMs * 0.2);
                MaxLatency = Math.Max(MaxLatency, result.LatencyMs);
                MinLatency = Math.Min(MinLatency, result.LatencyMs);
            }

            if (result.Success && result.BytesSent > 0)
            {
                TotalBytesSent += result.BytesSent;
            }

            if (result.IsFramePayload)
            {
                IsFrameMode = true;
                FramesSent++;
                PayloadType = "Frame";
                CurrentFrameLayoutType = result.FrameLayoutType ?? string.Empty;

                if (result.FrameSizeBytes.HasValue && result.FrameSizeBytes.Value > 0)
                {
                    var frameSize = result.FrameSizeBytes.Value;
                    AverageFrameSize = AverageFrameSize == 0 ? frameSize :
                        (AverageFrameSize * 0.8) + (frameSize * 0.2);
                    MaxFrameSize = Math.Max(MaxFrameSize, frameSize);
                    MinFrameSize = MinFrameSize == long.MaxValue ? frameSize : Math.Min(MinFrameSize, frameSize);
                }

                if (result.FrameRenderTimeMs.HasValue && result.FrameRenderTimeMs.Value > 0)
                {
                    var renderTime = result.FrameRenderTimeMs.Value;
                    AverageFrameRenderTime = AverageFrameRenderTime == 0 ? renderTime :
                        (AverageFrameRenderTime * 0.8) + (renderTime * 0.2);
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

            DetermineConnectionState();
        }

        private void DetermineConnectionState()
        {
            if (SuccessRate >= 95.0 && ConsecutiveFailures == 0)
            {
                ConnectionState = "good";
            }
            else if (SuccessRate >= 70.0 || (ConsecutiveFailures > 0 && ConsecutiveFailures < 3))
            {
                ConnectionState = "poor";
            }
            else
            {
                ConnectionState = "disconnected";
            }

            if (ConnectionState == "good" && AverageLatency > 200)
            {
                ConnectionState = "poor";
            }

            if (IsFrameMode && ConnectionState == "good")
            {
                if (AverageFrameRenderTime > 1000)
                {
                    ConnectionState = "poor";
                }

                if (AverageFrameSize > 100000)
                {
                    Console.WriteLine($"[COM_STREAM_HEALTH] Large average frame size detected: {AverageFrameSize:F0} bytes on {ComPort}");
                }
            }
        }

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

        public object GetGatewayHealthSummary()
        {
            return new { message = "Not in gateway mode" };
        }
    }

    public class Service_Stream_Manager_COM
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IServiceProvider _serviceProvider;
        private readonly ConcurrentDictionary<int, Service_StreamInfo_COM> _streamingTokens = new();
        private readonly ConcurrentDictionary<int, long> _latencies = new();
        private readonly Service_Stream_History_Manager _historyManager;
        private readonly Service_Image_Processor _imageProcessor;
        private readonly Service_BlitMode_ResourceMonitor _blitResourceMonitor;

        public Service_Stream_Manager_COM(
            IServiceScopeFactory scopeFactory,
            IServiceProvider serviceProvider,
            Service_Stream_History_Manager historyManager,
            Service_Image_Processor imageProcessor,
            Service_BlitMode_ResourceMonitor blitResourceMonitor)
        {
            _scopeFactory = scopeFactory;
            _serviceProvider = serviceProvider;
            _historyManager = historyManager;
            _imageProcessor = imageProcessor;
            _blitResourceMonitor = blitResourceMonitor;
        }

        public IEnumerable<Model_StreamInfo_DTO> GetActiveStreams(bool showCompressed = false)
        {
            return _streamingTokens.Select(kvp =>
            {
                var info = kvp.Value;
                return new Model_StreamInfo_DTO
                {
                    StreamKey = kvp.Key.ToString(),
                    DeviceName = info.DeviceName,
                    DeviceMac = "COM",
                    ScreenId = info.ScreenId,
                    ScreenName = info.ScreenName,
                    Status = info.Status,
                    Rate = info.Rate,
                    Latency = info.Latency,
                    LastSentTime = info.LastSentTime,
                    Protocol = info.Protocol,
                    SensorsCount = info.SensorsCount,
                    HasLastFrame = info.LastSentFrameBytes != null,
                    LastFrameSize = info.LastFrameSize,
                    LastFrameTime = info.LastFrameGeneratedTime,
                    LastFrameLayoutType = info.LastFrameLayoutType,
                    IsGatewayMode = info.IsGatewayMode,
                    GatewayTarget = info.GatewayTarget,
                    ConfigPayloadPrefix = info.ConfigPayloadPrefix,
                    ConfigPayloadJson = showCompressed ? info.GetCompressedConfigPayloadPreview() : info.ConfigPayloadJson,
                    LastSentPayloadPrefix = info.LastSentPayloadPrefix,
                    LastSentPayloadJson = showCompressed ? info.GetCompressedLastSentPayloadPreview() : info.LastSentPayloadJson,
                    CompressedConfigPayloadPrefix = info.CompressedConfigPayloadPrefix,
                    CompressedLastSentPayloadPrefix = info.CompressedLastSentPayloadPrefix,
                    ConfigPayloadCompressed = info.GetCompressedConfigPayloadPreview(),
                    LastSentPayloadCompressed = info.GetCompressedLastSentPayloadPreview(),
                    Health = new Model_StreamHealth_DTO
                    {
                        ConnectionState = info.Health.ConnectionState,
                        SuccessRate = info.Health.SuccessRate,
                        LastErrorMessage = info.Health.LastErrorMessage,
                        ErrorType = info.Health.ErrorType,
                        ConsecutiveFailures = info.Health.ConsecutiveFailures,
                        ConsecutiveSuccesses = info.Health.ConsecutiveSuccesses,
                        AverageLatency = info.Health.AverageLatency,
                        MaxLatency = info.Health.MaxLatency,
                        MinLatency = info.Health.MinLatency == long.MaxValue ? 0L : info.Health.MinLatency,
                        LastSuccessTime = info.Health.LastSuccessTime,
                        LastFailureTime = info.Health.LastFailureTime,
                        IsFrameMode = info.Health.IsFrameMode,
                        PayloadType = info.Health.PayloadType,
                        FramesSent = info.Health.FramesSent,
                        PayloadsSent = info.Health.PayloadsSent,
                        CurrentFrameLayoutType = info.Health.CurrentFrameLayoutType,
                        AverageFrameSize = info.Health.AverageFrameSize,
                        MaxFrameSize = info.Health.MaxFrameSize,
                        MinFrameSize = info.Health.MinFrameSize == long.MaxValue ? 0L : info.Health.MinFrameSize,
                        AverageFrameRenderTime = info.Health.AverageFrameRenderTime,
                        MaxFrameRenderTime = info.Health.MaxFrameRenderTime,
                        MinFrameRenderTime = info.Health.MinFrameRenderTime == long.MaxValue ? 0L : info.Health.MinFrameRenderTime,
                        GatewayMessagesSent = info.Health.PayloadsSent,
                        ComPort = info.Health.ComPort
                    }
                };
            });
        }

        public byte[]? GetLastFrameBytes(int screenId)
        {
            if (_streamingTokens.TryGetValue(screenId, out var streamInfo))
            {
                return streamInfo.GetLastSentFrameCopy();
            }
            return null;
        }

        public object? GetFrameInfo(int screenId)
        {
            if (_streamingTokens.TryGetValue(screenId, out var streamInfo))
            {
                return new
                {
                    HasFrame = streamInfo.LastSentFrameBytes != null,
                    FrameSize = streamInfo.LastFrameSize,
                    FrameTime = streamInfo.LastFrameGeneratedTime,
                    LayoutType = streamInfo.LastFrameLayoutType,
                    IsGatewayMode = streamInfo.IsGatewayMode,
                    GatewayTarget = streamInfo.GatewayTarget
                };
            }
            return null;
        }

        public bool ClearLastFrame(int screenId)
        {
            if (_streamingTokens.TryGetValue(screenId, out var streamInfo))
            {
                streamInfo.ClearLastSentFrame();
                return true;
            }
            return false;
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
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Could not get link ID for device {deviceId}: {ex.Message}");
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
            string? gatewayDestination = null,
            int linkId = 0)
        {
            if (_streamingTokens.ContainsKey(screen.Id))
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Stream already active for device {deviceId}, screen {screenKey}");
                return;
            }

            var cts = new CancellationTokenSource();

            using (var scope = _scopeFactory.CreateScope())
            {
                var deviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();
                var payloadService = scope.ServiceProvider.GetRequiredService<Service_Manager_Payloads>();
                var junctionDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Junctions>();
                var junctionLinkDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_JunctionLinks>();

                var device = await deviceDb.GetDeviceByIdAsync(deviceId);
                if (device is null)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Device {deviceId} not found.");
                    return;
                }

                var junction = await junctionDb.GetJunctionByIdAsync(junctionId);
                if (junction is null)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Junction {junctionId} not found.");
                    return;
                }

                var renderMode = junction.RenderingMode;
                bool isPayloadMode = renderMode == RenderModes.Payload;
                bool isBlitMode = renderMode == RenderModes.Blit;
                bool isCompositeMode = renderMode == RenderModes.Composite;
                bool isAnyFrameMode = RenderModes.IsFrameMode(renderMode);

                var screenLayoutOverrides = await junctionLinkDb.GetJunctionScreenLayoutsByScreenIdAsync(junctionId, screen.Id);
                var screenOverride = screenLayoutOverrides.FirstOrDefault(o => o.DeviceScreenId == screen.Id);

                bool isGatewayMode = !string.IsNullOrEmpty(junctionType) &&
                                   junctionType.Equals("Gateway Junction (COM to ESP:NOW)", StringComparison.OrdinalIgnoreCase);
                string? targetMacAddress = device.UniqueIdentifier;

                string comPort;
                if (isGatewayMode)
                {
                    if (string.IsNullOrWhiteSpace(gatewayDestination))
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Gateway junction requires gateway COM port.");
                        return;
                    }
                    comPort = gatewayDestination;
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

                var senderFactory = _serviceProvider.GetRequiredService<Func<string, Service_Send_Data_COM>>();
                var comSender = senderFactory(comPort);
                comSender.OpenPortIfNotOpen(115200);

                string protocolString = isGatewayMode
                    ? "COM (Gateway)"
                    : "COM";

                var info = new Service_StreamInfo_COM(junction.CompressPayload, isGatewayMode, targetMacAddress)
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
                    Protocol = protocolString
                };

                if (isAnyFrameMode)
                {
                    info.Health.IsFrameMode = true;
                }

                _streamingTokens[screen.Id] = info;

                if (isBlitMode)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Sending blit mode config for {screenKey}");

                    var frameLayoutId = screenOverride?.FrameLayoutId ?? screen.FrameLayoutId;
                    if (!frameLayoutId.HasValue)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] No frame layout ID for blit config");
                        info.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }

                    var frameLayoutDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_FrameEngine>();
                    var frameLayout = await frameLayoutDb.GetFrameLayoutByIdAsync(frameLayoutId.Value);

                    if (frameLayout == null)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Frame layout not found for ID {frameLayoutId}");
                        info.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }

                    var blitConfig = new
                    {
                        type = "blit_config",
                        screenId = screenKey,
                        mode = "blit",
                        frameFormat = "RGB565",
                        frameWidth = frameLayout.Width,
                        frameHeight = frameLayout.Height,
                        frameSize = frameLayout.Width * frameLayout.Height * 2,
                        bytesPerPixel = 2,
                        description = "Pre-rendered frame stream - expecting binary frame data"
                    };

                    string configJson = JsonSerializer.Serialize(blitConfig);

                    var (success, _) = await comSender.SendPayloadAsync(configJson);
                    if (!success)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Failed to send blit config.");
                        info.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }

                    info.ConfigPayloadPrefix = "BLIT_CONFIG";
                    info.UpdateConfigPayload(configJson);

                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Blit config sent to {device.Name}: {frameLayout.Width}x{frameLayout.Height} ({frameLayout.Width * frameLayout.Height * 2} bytes per frame)");
                }
                else if (isCompositeMode)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Starting in Composite mode for {screenKey}");

                    var compositeConfigResult = await payloadService.GenerateFrameEngineConfigPayloadsAsync(
                        screenKey,
                        assignedSensors,
                        screen,
                        screenOverride,
                        junctionType: junctionType,
                        gatewayDestination: targetMacAddress,
                        compressPayload: junction.CompressPayload);

                    var configPayload = compositeConfigResult.GetResult(screenKey);
                    if (configPayload == null)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] No composite config payload for screen {screenKey}.");
                        info.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }

                    var (success, _) = await comSender.SendPayloadAsync(configPayload.BinaryPayload);
                    if (!success)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Failed to send composite config.");
                        info.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }

                    info.ConfigPayloadPrefix = configPayload.UncompressedPrefix;
                    info.UpdateConfigPayload(configPayload.UncompressedJson);
                    if (configPayload.IsCompressed)
                    {
                        info.UpdateCompressedConfigPayloadPrefix(configPayload.CompressedPrefix);
                    }

                    string gatewayInfo = isGatewayMode ? $" via gateway {comPort} targeting {targetMacAddress}" : "";
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Composite config sent to {device.Name}{gatewayInfo}.");
                }
                else
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Starting in Payload mode for {screenKey}");

                    var configResult = await payloadService.GenerateConfigPayloadsAsync(
                        screenKey,
                        assignedSensors,
                        screen,
                        overrideTemplate: null,
                        junctionType: junctionType,
                        gatewayDestination: targetMacAddress,
                        compressPayload: junction.CompressPayload);

                    var configPayload = configResult.GetResult(screenKey);
                    if (configPayload == null)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] No config payload for screen {screenKey}.");
                        info.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }

                    var (success, _) = await comSender.SendPayloadAsync(configPayload.BinaryPayload);
                    if (!success)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Failed to send config payload.");
                        info.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }

                    info.ConfigPayloadPrefix = configPayload.UncompressedPrefix;
                    info.UpdateConfigPayload(configPayload.UncompressedJson);
                    if (configPayload.IsCompressed)
                    {
                        info.UpdateCompressedConfigPayloadPrefix(configPayload.CompressedPrefix);
                    }

                    string compressionInfo = junction.CompressPayload ? " (compressed)" : "";
                    string gatewayInfo = isGatewayMode ? $" via gateway {comPort} targeting {targetMacAddress}" : "";
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Config sent to {device.Name}{gatewayInfo}{compressionInfo}.");
                }
            }

            _ = Task.Run(async () =>
            {
                using var loopScope = _scopeFactory.CreateScope();
                var loopPayloadService = loopScope.ServiceProvider.GetRequiredService<Service_Manager_Payloads>();
                var junctionDb = loopScope.ServiceProvider.GetRequiredService<Service_Database_Manager_Junctions>();
                var junctionLinkDb = loopScope.ServiceProvider.GetRequiredService<Service_Database_Manager_JunctionLinks>();

                var info = _streamingTokens[screen.Id];

                var junction = await junctionDb.GetJunctionByIdAsync(junctionId);
                if (junction is null)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Junction {junctionId} not found in sensor loop.");
                    return;
                }

                var renderMode = junction.RenderingMode;
                bool isPayloadMode = renderMode == RenderModes.Payload;
                bool isBlitMode = renderMode == RenderModes.Blit;
                bool isCompositeMode = renderMode == RenderModes.Composite;
                bool isAnyFrameMode = RenderModes.IsFrameMode(renderMode);
                bool isGatewayMode = info.IsGatewayMode;
                string? targetMacAddress = info.GatewayTarget;

                var screenLayoutOverrides = await junctionLinkDb.GetJunctionScreenLayoutsByScreenIdAsync(junctionId, screen.Id);
                var screenOverride = screenLayoutOverrides.FirstOrDefault(o => o.DeviceScreenId == screen.Id);

                await Task.Delay(500, cts.Token);

                while (!cts.Token.IsCancellationRequested)
                {
                    try
                    {
                        if (isBlitMode)
                        {
                            try
                            {
                                // Start timing the entire frame processing
                                long renderTimeMs = 0;
                                long conversionTimeMs = 0;
                                long compressionTimeMs = 0;

                                using var frameScope = _scopeFactory.CreateScope();
                                var virtualStreamManager = frameScope.ServiceProvider.GetRequiredService<Service_Stream_Manager_Virtual>();
                                var frameLayoutDb = frameScope.ServiceProvider.GetRequiredService<Service_Database_Manager_FrameEngine>();

                                var frameLayoutId = screenOverride?.FrameLayoutId ?? screen.FrameLayoutId;
                                if (!frameLayoutId.HasValue)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] No frame layout ID for screen {screen.Id}");
                                    continue;
                                }

                                var frameLayout = await frameLayoutDb.GetFrameLayoutByIdAsync(frameLayoutId.Value);
                                if (frameLayout == null)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Frame layout not found for ID {frameLayoutId}");
                                    continue;
                                }

                                var actualLinkId = linkId > 0 ? linkId : await GetLinkIdForDeviceAsync(junctionId, deviceId, frameScope);

                                Dictionary<string, object> sensorData = new();
                                try
                                {
                                    var riveSensorResult = await loopPayloadService.GenerateFrameEngineSensorPayloadsAsync(
                                        screenKey, assignedSensors, screen,
                                        junctionType: junctionType, gatewayDestination: targetMacAddress,
                                        compressPayload: false);

                                    var sensorPayload = riveSensorResult.GetResult(screenKey);
                                    if (sensorPayload != null)
                                    {
                                        var sensorObj = JsonSerializer.Deserialize<Dictionary<string, object>>(sensorPayload.UncompressedJson);
                                        if (sensorObj?.ContainsKey("sensors") == true)
                                        {
                                            sensorData = sensorObj;
                                        }
                                    }
                                }
                                catch (Exception sensorEx)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Error generating sensor data: {sensorEx.Message}");
                                }

                                // Time the frame capture (Puppeteer rendering)
                                var renderTimer = Stopwatch.StartNew();
                                var pngBytes = await virtualStreamManager.CaptureFrameForBlitMode(
                                    screen.Id, sensorData, frameLayout, junctionId, actualLinkId ?? 0, screenOverride);
                                renderTimer.Stop();
                                renderTimeMs = renderTimer.ElapsedMilliseconds;

                                if (pngBytes == null || pngBytes.Length == 0)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Failed to capture frame from virtual screen");
                                    continue;
                                }

                                // Time the RGB565 conversion
                                var conversionTimer = Stopwatch.StartNew();
                                var imageResult = await _imageProcessor.ConvertToRgb565Async(pngBytes, frameLayout.Width, frameLayout.Height);
                                conversionTimer.Stop();
                                conversionTimeMs = conversionTimer.ElapsedMilliseconds;

                                if (!imageResult.Success || imageResult.Data == null)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] RGB565 conversion failed: {imageResult.ErrorMessage ?? "Unknown error"}");
                                    continue;
                                }

                                // Time the payload generation (includes compression if enabled)
                                var compressionTimer = Stopwatch.StartNew();
                                var blitPayload = loopPayloadService.GenerateBlitFramePayload(
                                    imageResult.Data,
                                    junction.CompressPayload,
                                    isGatewayMode);
                                compressionTimer.Stop();
                                compressionTimeMs = compressionTimer.ElapsedMilliseconds;

                                Stopwatch stopwatch = Stopwatch.StartNew();
                                var (success, _) = await info.ComSender!.SendPayloadAsync(blitPayload);
                                stopwatch.Stop();

                                var result = new ComOperationResult
                                {
                                    Success = success,
                                    LatencyMs = stopwatch.ElapsedMilliseconds,
                                    ErrorType = success ? string.Empty : "com_frame_send_failed",
                                    ErrorMessage = success ? string.Empty : "COM frame send failure",
                                    ComPort = info.ComPort ?? string.Empty,
                                    BytesSent = blitPayload.Length,
                                    IsFramePayload = true,
                                    FrameSizeBytes = imageResult.Data.Length,
                                    FrameLayoutType = "BLIT_MODE",
                                    PayloadType = "Frame"
                                };

                                info.Health.UpdateHealth(result);

                                if (result.Success)
                                {
                                    info.UpdateLastSentFrame(pngBytes, "BLIT_MODE");
                                    // Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Blit frame sent: {blitPayload.Length} bytes (original: {imageResult.Data.Length} bytes)");

                                    // Record frame metrics for resource monitoring
                                    var sessionId = $"J{junctionId}_D{deviceId}_S{screen.Id}_L{actualLinkId}";
                                    _blitResourceMonitor.RecordFrameProcessed(
                                        sessionId,
                                        blitPayload.Length,
                                        renderTimeMs,
                                        conversionTimeMs,
                                        compressionTimeMs);
                                }
                                else
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Frame send failed: {result.ErrorType} - {result.ErrorMessage}");
                                    if (info.Health.ConnectionState == "disconnected" && info.Health.ConsecutiveFailures > 5)
                                    {
                                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Too many consecutive failures ({info.Health.ConsecutiveFailures}), stopping stream.");
                                        break;
                                    }
                                    if (info.Health.ConsecutiveFailures > 1)
                                    {
                                        await Task.Delay(Math.Min(info.Health.ConsecutiveFailures * 100, 1000), cts.Token);
                                    }
                                }

                                info.Latency = result.LatencyMs;
                                info.LastSentTime = DateTime.UtcNow;

                                var historyEntry = _historyManager.CreateEntryFromCOM(info);
                                _historyManager.AddHistoryEntry(historyEntry);

                                _latencies[screen.Id] = result.LatencyMs;

                                int calculatedPause = Math.Max(rate - (int)result.LatencyMs, 0);
                                if (calculatedPause > 0)
                                {
                                    await Task.Delay(calculatedPause, cts.Token);
                                }

                                continue;
                            }
                            catch (Exception ex)
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Error in blit mode frame capture: {ex.Message}");
                                await Task.Delay(rate, cts.Token);
                                continue;
                            }
                        }
                        else if (isCompositeMode)
                        {
                            var compositeSensorResult = await loopPayloadService.GenerateFrameEngineSensorPayloadsAsync(
                                screenKey,
                                assignedSensors,
                                screen,
                                junctionType: junctionType,
                                gatewayDestination: targetMacAddress,
                                compressPayload: junction.CompressPayload);

                            var sensorPayload = compositeSensorResult.GetResult(screenKey);
                            if (sensorPayload == null)
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] No composite sensor payload for screen {screenKey}. Exiting loop.");
                                break;
                            }

                            Stopwatch stopwatch = Stopwatch.StartNew();
                            var (success, _) = await info.ComSender!.SendPayloadAsync(sensorPayload.BinaryPayload);
                            stopwatch.Stop();

                            var result = new ComOperationResult
                            {
                                Success = success,
                                LatencyMs = stopwatch.ElapsedMilliseconds,
                                ErrorType = success ? string.Empty : "com_composite_send_failed",
                                ErrorMessage = success ? string.Empty : "COM composite sensor send failure",
                                ComPort = info.ComPort ?? string.Empty,
                                BytesSent = sensorPayload.BinaryPayload.Length,
                                PayloadType = "Composite Sensor"
                            };

                            info.Health.UpdateHealth(result);

                            if (result.Success)
                            {
                                info.LastSentPayloadPrefix = sensorPayload.UncompressedPrefix;
                                info.UpdateLastSentPayload(sensorPayload.UncompressedJson);
                                if (sensorPayload.IsCompressed)
                                {
                                    info.UpdateCompressedLastSentPayloadPrefix(sensorPayload.CompressedPrefix);
                                }
                            }
                            else
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Composite sensor send failed: {result.ErrorType} - {result.ErrorMessage}");
                                if (info.Health.ConnectionState == "disconnected" && info.Health.ConsecutiveFailures > 5)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Too many consecutive failures ({info.Health.ConsecutiveFailures}), stopping stream.");
                                    break;
                                }
                                if (info.Health.ConsecutiveFailures > 1)
                                {
                                    await Task.Delay(Math.Min(info.Health.ConsecutiveFailures * 100, 1000), cts.Token);
                                }
                            }

                            info.Latency = result.LatencyMs;
                            info.LastSentTime = DateTime.UtcNow;

                            var historyEntry = _historyManager.CreateEntryFromCOM(info);
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
                            var sensorResult = await loopPayloadService.GenerateSensorPayloadsAsync(
                                screenKey,
                                assignedSensors.Count,
                                assignedSensors,
                                screen,
                                junctionType: junctionType,
                                gatewayDestination: targetMacAddress,
                                compressPayload: junction.CompressPayload);

                            var sensorPayload = sensorResult.GetResult(screenKey);
                            if (sensorPayload == null)
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] No sensor payload for screen {screenKey}. Exiting loop.");
                                break;
                            }

                            Stopwatch stopwatch = Stopwatch.StartNew();
                            var (success, _) = await info.ComSender!.SendPayloadAsync(sensorPayload.BinaryPayload);
                            stopwatch.Stop();

                            var sendResult = new ComOperationResult
                            {
                                Success = success,
                                LatencyMs = stopwatch.ElapsedMilliseconds,
                                ErrorType = success ? string.Empty : "com_send_failed",
                                ErrorMessage = success ? string.Empty : "COM payload send failure",
                                ComPort = info.ComPort ?? string.Empty,
                                BytesSent = sensorPayload.BinaryPayload.Length,
                                PayloadType = "JSON"
                            };

                            info.Health.UpdateHealth(sendResult);

                            if (sendResult.Success)
                            {
                                info.LastSentPayloadPrefix = sensorPayload.UncompressedPrefix;
                                info.UpdateLastSentPayload(sensorPayload.UncompressedJson);
                                if (sensorPayload.IsCompressed)
                                {
                                    info.UpdateCompressedLastSentPayloadPrefix(sensorPayload.CompressedPrefix);
                                }
                            }
                            else
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Send failed: {sendResult.ErrorType} - {sendResult.ErrorMessage}");
                                if (info.Health.ConnectionState == "disconnected" && info.Health.ConsecutiveFailures > 5)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Too many consecutive failures ({info.Health.ConsecutiveFailures}), stopping stream.");
                                    break;
                                }
                                if (info.Health.ConsecutiveFailures > 1)
                                {
                                    await Task.Delay(Math.Min(info.Health.ConsecutiveFailures * 100, 1000), cts.Token);
                                }
                            }

                            info.Latency = sendResult.LatencyMs;
                            info.LastSentTime = DateTime.UtcNow;

                            var historyEntry = _historyManager.CreateEntryFromCOM(info);
                            _historyManager.AddHistoryEntry(historyEntry);

                            _latencies[screen.Id] = sendResult.LatencyMs;

                            int calculatedPause = Math.Max(rate - (int)sendResult.LatencyMs, 0);
                            if (calculatedPause > 0)
                            {
                                await Task.Delay(calculatedPause, cts.Token);
                            }
                        }
                    }
                    catch (OperationCanceledException)
                    {
                        // Expected during shutdown - exit gracefully
                        break;
                    }
                    catch (ObjectDisposedException ex) when (ex.ObjectName == "CancellationTokenSource")
                    {
                        // CTS was disposed during shutdown - exit gracefully
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] CTS disposed during streaming loop - shutting down gracefully");
                        break;
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Unexpected error in streaming loop: {ex.Message}");

                        var errorResult = new ComOperationResult
                        {
                            Success = false,
                            ErrorType = "unexpected_error",
                            ErrorMessage = ex.Message,
                            LatencyMs = 0,
                            ComPort = info.ComPort ?? string.Empty,
                            PayloadType = isBlitMode ? "Frame" : (isCompositeMode ? "Composite Sensor" : "JSON")
                        };
                        info.Health.UpdateHealth(errorResult);

                        try
                        {
                            await Task.Delay(1000, cts.Token);
                        }
                        catch (ObjectDisposedException)
                        {
                            // CTS disposed - exit loop
                            break;
                        }
                    }
                }

                if (_streamingTokens.TryGetValue(screen.Id, out var finalInfo))
                {
                    finalInfo.Status = "Inactive";
                    finalInfo.Health.ConnectionState = "disconnected";
                }

            }, cts.Token);

            var streamInfo = _streamingTokens[screen.Id];
            Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] COM stream started for screen {screenKey} ({streamInfo.Protocol})");
        }

        public void StopStreaming(int screenId)
        {
            if (_streamingTokens.TryRemove(screenId, out var info))
            {
                // Cancel first and wait briefly for the loop to detect cancellation
                try
                {
                    info.Cts.Cancel();
                }
                catch (ObjectDisposedException)
                {
                    // Already disposed - safe to ignore
                }

                // Give the streaming loop time to detect cancellation and exit cleanly
                Task.Delay(100).Wait();

                // Now dispose resources
                info.Dispose();
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] Stopped COM stream for screen {screenId}.");
            }
            else
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_COM] No active COM stream for screen {screenId}.");
            }
        }

        public long GetLatestLatency(int screenId)
        {
            _latencies.TryGetValue(screenId, out var latency);
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

        public bool IsStreaming(int screenId) => _streamingTokens.ContainsKey(screenId);

        public object GetComStreamMetrics()
        {
            return new
            {
                TotalStreams = _streamingTokens.Count,
                ActiveStreams = _streamingTokens.Values.Count(s => s.Status == "Active"),
                ComPorts = _streamingTokens.Values.Select(s => s.ComPort).Distinct().Count(),
                StreamsByProtocol = _streamingTokens.Values
                    .GroupBy(s => s.Protocol ?? "Unknown")
                    .ToDictionary(g => g.Key, g => g.Count()),
                GatewayStreams = _streamingTokens.Values.Count(s => s.IsGatewayMode),
                FrameStreams = _streamingTokens.Values.Count(s => s.Health.IsFrameMode),
                CompositeStreams = _streamingTokens.Values.Count(s => s.Protocol?.Contains("Frame Assembly") == true),
                HealthSummary = new
                {
                    Good = _streamingTokens.Values.Count(s => s.Health.ConnectionState == "good"),
                    Poor = _streamingTokens.Values.Count(s => s.Health.ConnectionState == "poor"),
                    Disconnected = _streamingTokens.Values.Count(s => s.Health.ConnectionState == "disconnected")
                }
            };
        }
    }
}