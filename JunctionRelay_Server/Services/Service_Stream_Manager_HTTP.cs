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
using System.Text;
using System.Text.Json;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    public class Service_Stream_Manager_HTTP
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ConcurrentDictionary<int, Service_StreamInfo_HTTP> _streamingTokens = new();
        private readonly ConcurrentDictionary<int, long> _streamLatencies = new();
        private readonly Service_Stream_History_Manager _historyManager;
        private readonly Service_Image_Processor _imageProcessor;
        private readonly Service_BlitMode_ResourceMonitor _blitResourceMonitor;

        public Service_Stream_Manager_HTTP(
            IServiceScopeFactory scopeFactory,
            Service_Stream_History_Manager historyManager,
            Service_Image_Processor imageProcessor,
            Service_BlitMode_ResourceMonitor blitResourceMonitor)
        {
            _scopeFactory = scopeFactory;
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
                    DeviceMac = "HTTP",
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
                        ConnectionRecreated = info.Health.KeepAlivePoolRecreated,
                        AverageLatency = info.Health.AverageLatency,
                        MaxLatency = info.Health.MaxLatency,
                        MinLatency = info.Health.MinLatency == long.MaxValue ? 0L : info.Health.MinLatency,
                        LastSuccessTime = info.Health.LastSuccessTime ?? DateTime.MinValue,
                        LastFailureTime = info.Health.LastFailureTime ?? DateTime.MinValue,
                        PoolRecreationCount = info.Health.PoolRecreationCount,
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
                        GatewayMessagesSent = info.Health.PayloadsSent
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
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Could not get link ID for device {deviceId}: {ex.Message}");
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
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Stream already active for device {deviceId}, screen {screenKey}");
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
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Device {deviceId} not found.");
                    return;
                }

                var junction = await junctionDb.GetJunctionByIdAsync(junctionId);
                if (junction is null)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Junction {junctionId} not found.");
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
                                   junctionType.Equals("Gateway Junction (HTTP to ESP:NOW)", StringComparison.OrdinalIgnoreCase);
                string? targetMacAddress = device.UniqueIdentifier;

                string httpEndpoint;
                if (isGatewayMode)
                {
                    if (string.IsNullOrEmpty(gatewayDestination))
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Gateway junction requires gateway IP address.");
                        return;
                    }
                    httpEndpoint = $"http://{gatewayDestination}/api/data";
                }
                else
                {
                    httpEndpoint = $"http://{device.IPAddress}/api/data";
                    targetMacAddress = null;
                }

                bool useKeepAlive = screen.UseKeepAlive ?? false;
                var httpSender = new Service_Send_Data_HTTP(
                    isGatewayMode ? gatewayDestination! : device.IPAddress!,
                    device.HttpPort,
                    isGatewayMode ? "/api/data" : "/api/data",
                    useKeepAlive);

                string protocolString = isGatewayMode
                    ? "HTTP (Gateway to ESP-NOW)"
                    : "HTTP";

                if (useKeepAlive)
                {
                    protocolString += " (Keep-Alive)";
                }

                if (isBlitMode)
                {
                    protocolString += " (Pre-rendered Frames)";
                }
                else if (isCompositeMode)
                {
                    protocolString += " (Frame Assembly)";
                }

                var info = new Service_StreamInfo_HTTP(junction.CompressPayload, isGatewayMode, targetMacAddress)
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
                    Protocol = protocolString
                };

                if (isAnyFrameMode)
                {
                    info.Health.IsFrameMode = true;
                }

                _streamingTokens[screen.Id] = info;

                if (isBlitMode)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Sending blit mode config for {screenKey}");

                    var frameLayoutId = screenOverride?.FrameLayoutId ?? screen.FrameLayoutId;
                    if (!frameLayoutId.HasValue)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] No frame layout ID for blit config");
                        info.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }

                    var frameLayoutDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_FrameEngine>();
                    var frameLayout = await frameLayoutDb.GetFrameLayoutByIdAsync(frameLayoutId.Value);

                    if (frameLayout == null)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Frame layout not found for ID {frameLayoutId}");
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
                    var configBytes = Encoding.UTF8.GetBytes(configJson);

                    var result = await httpSender.SendPayloadWithHealthAsync(configBytes);
                    result.PayloadType = "Blit Config";
                    info.Health.UpdateHealth(result);

                    if (!result.Success)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Failed to send blit config.");
                        info.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }

                    info.ConfigPayloadPrefix = "BLIT_CONFIG";
                    info.UpdateConfigPayload(configJson);

                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Blit config sent to {device.Name}: {frameLayout.Width}x{frameLayout.Height} ({frameLayout.Width * frameLayout.Height * 2} bytes per frame)");
                }
                else if (isCompositeMode)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Starting in Composite mode for {screenKey}");

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
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] No composite config payload for screen {screenKey}.");
                        info.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }

                    var result = await httpSender.SendPayloadWithHealthAsync(configPayload.BinaryPayload);
                    result.PayloadType = "Composite Config";
                    info.Health.UpdateHealth(result);

                    if (!result.Success)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Failed to send composite config.");
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

                    string connectionType = useKeepAlive ? "keep-alive" : "standard";
                    string gatewayInfo = isGatewayMode ? $" via gateway {gatewayDestination} targeting {targetMacAddress}" : "";
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Composite config sent to {device.Name}{gatewayInfo} via {connectionType} connection.");
                }
                else
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Starting in Payload mode for {screenKey}");

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
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] No config payload for screen {screenKey}.");
                        info.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }

                    var result = await httpSender.SendPayloadWithHealthAsync(configPayload.BinaryPayload);
                    result.PayloadType = "Config";
                    info.Health.UpdateHealth(result);

                    if (!result.Success)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Failed to send config payload.");
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

                    string connectionType = useKeepAlive ? "keep-alive" : "standard";
                    string compressionInfo = junction.CompressPayload ? " (compressed)" : "";
                    string gatewayInfo = isGatewayMode ? $" via gateway {gatewayDestination} targeting {targetMacAddress}" : "";
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Config sent to {device.Name}{gatewayInfo} via {connectionType} connection{compressionInfo}.");
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
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Junction {junctionId} not found in sensor loop.");
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
                                var frameStopwatch = Stopwatch.StartNew();
                                long renderTimeMs = 0;
                                long conversionTimeMs = 0;
                                long compressionTimeMs = 0;

                                using var frameScope = _scopeFactory.CreateScope();
                                var virtualStreamManager = frameScope.ServiceProvider.GetRequiredService<Service_Stream_Manager_Virtual>();
                                var frameLayoutDb = frameScope.ServiceProvider.GetRequiredService<Service_Database_Manager_FrameEngine>();

                                var frameLayoutId = screenOverride?.FrameLayoutId ?? screen.FrameLayoutId;
                                if (!frameLayoutId.HasValue)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] No frame layout ID for screen {screen.Id}");
                                    continue;
                                }

                                var frameLayout = await frameLayoutDb.GetFrameLayoutByIdAsync(frameLayoutId.Value);
                                if (frameLayout == null)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Frame layout not found for ID {frameLayoutId}");
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
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Error generating sensor data: {sensorEx.Message}");
                                }

                                // Time the frame capture (Puppeteer rendering)
                                var renderTimer = Stopwatch.StartNew();
                                var pngBytes = await virtualStreamManager.CaptureFrameForBlitMode(
                                    screen.Id, sensorData, frameLayout, junctionId, actualLinkId ?? 0, screenOverride);
                                renderTimer.Stop();
                                renderTimeMs = renderTimer.ElapsedMilliseconds;

                                if (pngBytes == null || pngBytes.Length == 0)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Failed to capture frame from virtual screen");
                                    continue;
                                }

                                // Time the RGB565 conversion
                                var conversionTimer = Stopwatch.StartNew();
                                var imageResult = await _imageProcessor.ConvertToRgb565Async(pngBytes, frameLayout.Width, frameLayout.Height);
                                conversionTimer.Stop();
                                conversionTimeMs = conversionTimer.ElapsedMilliseconds;

                                if (!imageResult.Success || imageResult.Data == null)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] RGB565 conversion failed: {imageResult.ErrorMessage ?? "Unknown error"}");
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
                                var result = await info.HttpSender!.SendPayloadWithHealthAsync(blitPayload);
                                stopwatch.Stop();

                                result.PayloadType = "Frame";
                                result.IsFramePayload = true;
                                result.FrameSizeBytes = imageResult.Data.Length;
                                result.FrameLayoutType = "BLIT_MODE";

                                info.Health.UpdateHealth(result);

                                if (result.Success)
                                {
                                    info.UpdateLastSentFrame(pngBytes, "BLIT_MODE");
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Blit frame sent: {blitPayload.Length} bytes (original: {imageResult.Data.Length} bytes)");

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
                            catch (Exception ex)
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Error in blit mode frame capture: {ex.Message}");
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
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] No composite sensor payload for screen {screenKey}. Exiting loop.");
                                break;
                            }

                            Stopwatch stopwatch = Stopwatch.StartNew();
                            var result = await info.HttpSender!.SendPayloadWithHealthAsync(sensorPayload.BinaryPayload);
                            stopwatch.Stop();

                            result.PayloadType = "Composite Sensor";
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
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Composite sensor send failed: {result.ErrorType} - {result.ErrorMessage}");
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
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] No sensor payload for screen {screenKey}. Exiting loop.");
                                break;
                            }

                            Stopwatch stopwatch = Stopwatch.StartNew();
                            var result = await info.HttpSender!.SendPayloadWithHealthAsync(sensorPayload.BinaryPayload);
                            stopwatch.Stop();

                            result.PayloadType = "JSON";
                            info.Health.UpdateHealth(result);

                            if (result.Success)
                            {
                                info.LastSentPayloadPrefix = sensorPayload.UncompressedPrefix;
                                info.UpdateLastSentPayload(sensorPayload.UncompressedJson);
                                if (sensorPayload.IsCompressed)
                                {
                                    info.UpdateCompressedLastSentPayloadPrefix(sensorPayload.CompressedPrefix);
                                }

                                if (result.KeepAlivePoolRecreated)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Keep-alive pool recreated for {info.DeviceName}");
                                }
                            }
                            else
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

                            var historyEntry = _historyManager.CreateEntryFromHTTP(info);
                            _historyManager.AddHistoryEntry(historyEntry);

                            _streamLatencies[screen.Id] = result.LatencyMs;

                            int calculatedPause = Math.Max(rate - (int)result.LatencyMs, 0);
                            if (calculatedPause > 0)
                            {
                                await Task.Delay(calculatedPause, cts.Token);
                            }
                        }
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Unexpected error in streaming loop: {ex.Message}");
                        var errorResult = new HttpSendResult
                        {
                            Success = false,
                            ErrorType = "unexpected_error",
                            ErrorMessage = ex.Message,
                            LatencyMs = 0,
                            PayloadType = isBlitMode ? "Frame" : (isCompositeMode ? "Composite Sensor" : "JSON")
                        };
                        info.Health.UpdateHealth(errorResult);
                        await Task.Delay(1000, cts.Token);
                    }
                }

                if (_streamingTokens.TryGetValue(screen.Id, out var finalInfo))
                {
                    finalInfo.Status = "Inactive";
                    finalInfo.Health.ConnectionState = "disconnected";
                }

            }, cts.Token);

            var streamInfo = _streamingTokens[screen.Id];
            Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] HTTP stream started for screen {screenKey} ({streamInfo.Protocol})");
        }

        public void StopStreaming(int screenId)
        {
            if (_streamingTokens.TryRemove(screenId, out var info))
            {
                info.Cts.Cancel();
                info.Dispose();
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] Stopped HTTP stream for screen {screenId}.");
            }
            else
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_HTTP] No active HTTP stream for screen {screenId}.");
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

        public bool IsStreaming(int screenId) => _streamingTokens.ContainsKey(screenId);

        public object GetHttpStreamMetrics()
        {
            return new
            {
                TotalStreams = _streamingTokens.Count,
                ActiveStreams = _streamingTokens.Values.Count(s => s.Status == "Active"),
                StreamsByProtocol = _streamingTokens.Values
                    .GroupBy(s => s.Protocol ?? "Unknown")
                    .ToDictionary(g => g.Key, g => g.Count()),
                GatewayStreams = _streamingTokens.Values.Count(s => s.IsGatewayMode),
                FrameStreams = _streamingTokens.Values.Count(s => s.Health.IsFrameMode),
                CompositeStreams = _streamingTokens.Values.Count(s => s.Protocol?.Contains("Frame Assembly") == true),
                KeepAliveStreams = _streamingTokens.Values.Count(s => s.Protocol?.Contains("Keep-Alive") == true),
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