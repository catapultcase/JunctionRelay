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
using static System.Net.Mime.MediaTypeNames;
using JunctionRelayServer.Services;
using static System.Runtime.InteropServices.JavaScript.JSType;

namespace JunctionRelayServer.Services
{
    public class Service_Stream_Manager_WebSocket
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly Service_Manager_WebSocket_Client _webSocketDeviceManager;
        private readonly ConcurrentDictionary<int, Service_StreamInfo_WebSocket> _streamingTokens = new();
        private readonly ConcurrentDictionary<int, long> _streamLatencies = new();
        private readonly Service_Stream_History_Manager _historyManager;
        private readonly Service_Image_Processor _imageProcessor;

        public Service_Stream_Manager_WebSocket(
            IServiceScopeFactory scopeFactory,
            Service_Manager_WebSocket_Client webSocketDeviceManager,
            Service_Stream_History_Manager historyManager,
            Service_Image_Processor imageProcessor)
        {
            _scopeFactory = scopeFactory;
            _webSocketDeviceManager = webSocketDeviceManager;
            _historyManager = historyManager;
            _imageProcessor = imageProcessor;
        }

        public IEnumerable<object> GetActiveStreams(bool showCompressed = false)
        {
            return _streamingTokens.Select(kvp =>
            {
                var info = kvp.Value;
                return new
                {
                    StreamKey = kvp.Key,
                    DeviceName = info.DeviceName,
                    DeviceMac = info.DeviceMac,
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
                    Health = new
                    {
                        ConnectionState = info.Health.ConnectionState,
                        SuccessRate = info.Health.SuccessRate,
                        LastErrorMessage = info.Health.LastErrorMessage,
                        ErrorType = info.Health.ErrorType,
                        ConsecutiveFailures = info.Health.ConsecutiveFailures,
                        ConsecutiveSuccesses = info.Health.ConsecutiveSuccesses,
                        ConnectionRecreated = info.Health.ConnectionRecreated,
                        LastWebSocketState = info.Health.LastWebSocketState?.ToString(),
                        AverageLatency = info.Health.AverageLatency,
                        MaxLatency = info.Health.MaxLatency,
                        MinLatency = info.Health.MinLatency,
                        LastSuccessTime = info.Health.LastSuccessTime,
                        LastFailureTime = info.Health.LastFailureTime,
                        ConnectionRecreationCount = info.Health.ConnectionRecreationCount,
                        IsFrameMode = info.Health.IsFrameMode,
                        PayloadType = info.Health.PayloadType,
                        FramesSent = info.Health.FramesSent,
                        PayloadsSent = info.Health.PayloadsSent,
                        CurrentFrameLayoutType = info.Health.CurrentFrameLayoutType,
                        AverageFrameSize = info.Health.AverageFrameSize,
                        MaxFrameSize = info.Health.MaxFrameSize,
                        MinFrameSize = info.Health.MinFrameSize,
                        AverageFrameRenderTime = info.Health.AverageFrameRenderTime,
                        MaxFrameRenderTime = info.Health.MaxFrameRenderTime,
                        MinFrameRenderTime = info.Health.MinFrameRenderTime,
                        FrameHealthSummary = info.Health.GetFrameHealthSummary(),
                        GatewayMessagesSent = info.Health.GatewayMessagesSent,
                        GatewayHealthSummary = info.Health.GetGatewayHealthSummary()
                    },
                    ConfigPayloadPrefix = info.ConfigPayloadPrefix,
                    ConfigPayloadJson = showCompressed ? info.GetCompressedConfigPayloadPreview() : info.ConfigPayloadJson,
                    LastSentPayloadPrefix = info.LastSentPayloadPrefix,
                    LastSentPayloadJson = showCompressed ? info.GetCompressedLastSentPayloadPreview() : info.LastSentPayloadJson,
                    CompressedConfigPayloadPrefix = info.CompressedConfigPayloadPrefix,
                    CompressedLastSentPayloadPrefix = info.CompressedLastSentPayloadPrefix,
                    ConfigPayloadCompressed = info.GetCompressedConfigPayloadPreview(),
                    LastSentPayloadCompressed = info.GetCompressedLastSentPayloadPreview()
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
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Stream already active for device {deviceId}, screen {screenKey}");
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
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Device {deviceId} not found.");
                    return;
                }

                var junction = await junctionDb.GetJunctionByIdAsync(junctionId);
                if (junction is null)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Junction {junctionId} not found.");
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
                                   junctionType.Equals("Gateway Junction (WebSocket to ESP:NOW)", StringComparison.OrdinalIgnoreCase);
                string? targetMacAddress = device.UniqueIdentifier;

                if (isGatewayMode && string.IsNullOrEmpty(gatewayDestination))
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Gateway junction requires gateway IP address.");
                    return;
                }

                string deviceMacToConnect = isGatewayMode ? gatewayDestination! : device.UniqueIdentifier!;

                Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Ensuring WebSocket connection to {deviceMacToConnect}...");
                bool connectionReady = await _webSocketDeviceManager.EnsureConnectionAsync(deviceMacToConnect, cts.Token);

                if (!connectionReady)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Failed to establish WebSocket connection to {deviceMacToConnect}.");
                    return;
                }

                Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] WebSocket connection ready for {deviceMacToConnect}");

                var webSocketSender = new Service_Send_Data_WebSocket(
                    deviceMacToConnect,
                    _webSocketDeviceManager,
                    isGatewayMode,
                    targetMacAddress);

                string protocolString = isGatewayMode
                    ? "WebSocket (Gateway to ESP-NOW)"
                    : "WebSocket";

                if (isBlitMode)
                {
                    protocolString += " (Pre-rendered Frames)";
                }
                else if (isCompositeMode)
                {
                    protocolString += " (Frame Assembly)";
                }

                var info = new Service_StreamInfo_WebSocket(junction.CompressPayload, isGatewayMode, targetMacAddress)
                {
                    DeviceName = device.Name,
                    DeviceMac = deviceMacToConnect,
                    Rate = rate,
                    Status = "Active",
                    Cts = cts,
                    WebSocketSender = webSocketSender,
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
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Sending blit mode config for {screenKey}");

                    var frameLayoutId = screenOverride?.FrameLayoutId ?? screen.FrameLayoutId;
                    if (!frameLayoutId.HasValue)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] No frame layout ID for blit config");
                        info.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }

                    var frameLayoutDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_FrameEngine>();
                    var frameLayout = await frameLayoutDb.GetFrameLayoutByIdAsync(frameLayoutId.Value);

                    if (frameLayout == null)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Frame layout not found for ID {frameLayoutId}");
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

                    var (success, _) = await webSocketSender.SendPayloadAsync(configJson);
                    if (!success)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Failed to send blit config.");
                        info.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }

                    info.ConfigPayloadPrefix = "BLIT_CONFIG";
                    info.UpdateConfigPayload(configJson);

                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Blit config sent to {device.Name}: {frameLayout.Width}x{frameLayout.Height} ({frameLayout.Width * frameLayout.Height * 2} bytes per frame)");
                }
                else if (isCompositeMode)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Starting in Composite mode for {screenKey}");

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
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] No composite config payload for screen {screenKey}.");
                        info.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }

                    var result = await webSocketSender.SendPayloadWithHealthAsync(configPayload.BinaryPayload);
                    result.PayloadType = "Composite Config";
                    result.IsGatewayMode = isGatewayMode;
                    result.GatewayTarget = targetMacAddress;
                    info.Health.UpdateHealth(result);

                    if (!result.Success)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Failed to send composite config.");
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

                    string gatewayInfo = isGatewayMode ? $" via gateway {deviceMacToConnect} targeting {targetMacAddress}" : "";
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Composite config sent to {device.Name}{gatewayInfo}.");
                }
                else
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Starting in Payload mode for {screenKey}");

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
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] No config payload for screen {screenKey}.");
                        info.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }

                    var (success, _) = await webSocketSender.SendPayloadAsync(configPayload.BinaryPayload);
                    if (!success)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Failed to send config payload.");
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
                    string gatewayInfo = isGatewayMode ? $" via gateway {deviceMacToConnect} targeting {targetMacAddress}" : "";
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Config sent to {device.Name}{gatewayInfo}{compressionInfo}.");
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
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Junction {junctionId} not found in sensor loop.");
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
                        if (!_webSocketDeviceManager.IsDeviceConnected(info.DeviceMac))
                        {
                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] WebSocket connection lost for {info.DeviceMac}. Attempting to reconnect...");

                            bool reconnected = await _webSocketDeviceManager.EnsureConnectionAsync(info.DeviceMac, cts.Token);
                            if (!reconnected)
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Failed to reconnect to {info.DeviceMac}. Stopping stream.");
                                break;
                            }

                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Reconnected to {info.DeviceMac}. Resuming stream.");
                        }

                        if (isBlitMode)
                        {
                            try
                            {
                                using var frameScope = _scopeFactory.CreateScope();
                                var virtualStreamManager = frameScope.ServiceProvider.GetRequiredService<Service_Stream_Manager_Virtual>();
                                var frameLayoutDb = frameScope.ServiceProvider.GetRequiredService<Service_Database_Manager_FrameEngine>();

                                var frameLayoutId = screenOverride?.FrameLayoutId ?? screen.FrameLayoutId;
                                if (!frameLayoutId.HasValue)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] No frame layout ID for screen {screen.Id}");
                                    continue;
                                }

                                var frameLayout = await frameLayoutDb.GetFrameLayoutByIdAsync(frameLayoutId.Value);
                                if (frameLayout == null)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Frame layout not found for ID {frameLayoutId}");
                                    continue;
                                }

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
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Error generating sensor data: {sensorEx.Message}");
                                }

                                var pngBytes = await virtualStreamManager.CaptureFrameForBlitMode(
                                    screen.Id, sensorData, frameLayout, junctionId, linkId, screenOverride);

                                if (pngBytes == null || pngBytes.Length == 0)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Failed to capture frame from virtual screen");
                                    continue;
                                }

                                var imageResult = await _imageProcessor.ConvertToRgb565Async(pngBytes, frameLayout.Width, frameLayout.Height);
                                if (!imageResult.Success || imageResult.Data == null)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] RGB565 conversion failed: {imageResult.ErrorMessage ?? "Unknown error"}");
                                    continue;
                                }

                                var blitPayload = loopPayloadService.GenerateBlitFramePayload(
                                    imageResult.Data,
                                    junction.CompressPayload,
                                    isGatewayMode);

                                Stopwatch stopwatch = Stopwatch.StartNew();
                                var result = await info.WebSocketSender!.SendPayloadWithHealthAsync(blitPayload);
                                stopwatch.Stop();

                                result.PayloadType = "Frame";
                                result.IsGatewayMode = isGatewayMode;
                                result.GatewayTarget = targetMacAddress;

                                info.Health.UpdateHealth(result);

                                if (result.Success)
                                {
                                    info.UpdateLastSentFrame(pngBytes, "BLIT_MODE");
                                    // Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Blit frame sent: {blitPayload.Length} bytes (original: {imageResult.Data.Length} bytes)");
                                }
                                else
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Frame send failed: {result.ErrorType} - {result.ErrorMessage}");
                                    if (info.Health.ConnectionState == "disconnected" && info.Health.ConsecutiveFailures > 5)
                                    {
                                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Too many consecutive failures ({info.Health.ConsecutiveFailures}), stopping stream.");
                                        break;
                                    }
                                    if (info.Health.ConsecutiveFailures > 1)
                                    {
                                        await Task.Delay(Math.Min(info.Health.ConsecutiveFailures * 100, 1000), cts.Token);
                                    }
                                }

                                info.Latency = result.LatencyMs;
                                info.LastSentTime = DateTime.UtcNow;

                                var historyEntry = _historyManager.CreateEntryFromWebSocket(info);
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
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Error in blit mode frame capture: {ex.Message}");
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
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] No composite sensor payload for screen {screenKey}. Exiting loop.");
                                break;
                            }

                            Stopwatch stopwatch = Stopwatch.StartNew();
                            var result = await info.WebSocketSender!.SendPayloadWithHealthAsync(sensorPayload.BinaryPayload);
                            stopwatch.Stop();

                            result.PayloadType = "JSON";
                            result.IsGatewayMode = isGatewayMode;
                            result.GatewayTarget = targetMacAddress;

                            info.Health.UpdateHealth(result);

                            if (result.Success)
                            {
                                info.LastSentPayloadPrefix = sensorPayload.UncompressedPrefix;
                                info.UpdateLastSentPayload(sensorPayload.UncompressedJson);
                                if (sensorPayload.IsCompressed)
                                {
                                    info.UpdateCompressedLastSentPayloadPrefix(sensorPayload.CompressedPrefix);
                                }

                                if (result.ConnectionRecreated)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] WebSocket connection recreated for {info.DeviceName}");
                                }
                            }
                            else
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Send failed: {result.ErrorType} - {result.ErrorMessage}");
                                if (info.Health.ConnectionState == "disconnected" && info.Health.ConsecutiveFailures > 5)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Too many consecutive failures ({info.Health.ConsecutiveFailures}), stopping stream.");
                                    break;
                                }
                                if (info.Health.ConsecutiveFailures > 1)
                                {
                                    await Task.Delay(Math.Min(info.Health.ConsecutiveFailures * 100, 1000), cts.Token);
                                }
                            }

                            info.Latency = result.LatencyMs;
                            info.LastSentTime = DateTime.UtcNow;

                            var historyEntry = _historyManager.CreateEntryFromWebSocket(info);
                            _historyManager.AddHistoryEntry(historyEntry);

                            _streamLatencies[screen.Id] = result.LatencyMs;

                            int calculatedPause = Math.Max(rate - (int)result.LatencyMs, 0);
                            if (calculatedPause > 0)
                            {
                                await Task.Delay(calculatedPause, cts.Token);
                            }
                        }
                        else // Payload mode
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
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] No sensor payload for screen {screenKey}. Exiting loop.");
                                break;
                            }

                            Stopwatch stopwatch = Stopwatch.StartNew();
                            var result = await info.WebSocketSender!.SendPayloadWithHealthAsync(sensorPayload.BinaryPayload);
                            stopwatch.Stop();

                            result.PayloadType = "JSON";
                            result.IsGatewayMode = isGatewayMode;
                            result.GatewayTarget = targetMacAddress;

                            info.Health.UpdateHealth(result);

                            if (result.Success)
                            {
                                info.LastSentPayloadPrefix = sensorPayload.UncompressedPrefix;
                                info.UpdateLastSentPayload(sensorPayload.UncompressedJson);
                                if (sensorPayload.IsCompressed)
                                {
                                    info.UpdateCompressedLastSentPayloadPrefix(sensorPayload.CompressedPrefix);
                                }

                                if (result.ConnectionRecreated)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] WebSocket connection recreated for {info.DeviceName}");
                                }
                            }
                            else
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Send failed: {result.ErrorType} - {result.ErrorMessage}");
                                if (info.Health.ConnectionState == "disconnected" && info.Health.ConsecutiveFailures > 5)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Too many consecutive failures ({info.Health.ConsecutiveFailures}), stopping stream.");
                                    break;
                                }
                                if (info.Health.ConsecutiveFailures > 1)
                                {
                                    await Task.Delay(Math.Min(info.Health.ConsecutiveFailures * 100, 1000), cts.Token);
                                }
                            }

                            info.Latency = result.LatencyMs;
                            info.LastSentTime = DateTime.UtcNow;

                            var historyEntry = _historyManager.CreateEntryFromWebSocket(info);
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
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Unexpected error in streaming loop: {ex.Message}");

                        var errorResult = new WebSocketSendResult
                        {
                            Success = false,
                            ErrorType = "unexpected_error",
                            ErrorMessage = ex.Message,
                            LatencyMs = 0,
                            PayloadType = isBlitMode ? "Frame" : (isCompositeMode ? "Composite Sensor" : "JSON"),
                            IsGatewayMode = isGatewayMode,
                            GatewayTarget = targetMacAddress
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
        }

        public void StopStreaming(int screenId)
        {
            if (_streamingTokens.TryRemove(screenId, out var info))
            {
                info.Cts.Cancel();
                info.Dispose();

                Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Stopped WebSocket stream for screen {screenId}.");
            }
            else
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] No active WebSocket stream for screen {screenId}.");
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

        public bool IsDeviceConnected(string deviceMac)
        {
            return _webSocketDeviceManager.IsDeviceConnected(deviceMac);
        }

        public IEnumerable<object> GetConnectedDevices()
        {
            return _webSocketDeviceManager.GetConnectedDevices();
        }

        public object GetWebSocketStreamMetrics()
        {
            return new
            {
                TotalStreams = _streamingTokens.Count,
                ActiveStreams = _streamingTokens.Values.Count(s => s.Status == "Active"),
                ConnectedDevices = _webSocketDeviceManager.GetConnectedDevices().Count(),
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