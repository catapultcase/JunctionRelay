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
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace JunctionRelayServer.Services
{
    public class Service_Stream_Manager_WebSocket
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly Service_Manager_WebSocket_Devices _webSocketDeviceManager;
        private readonly ConcurrentDictionary<int, Service_StreamInfo_WebSocket> _streamingTokens = new();
        private readonly ConcurrentDictionary<int, long> _streamLatencies = new();
        private readonly Service_Stream_History_Manager _historyManager;

        public Service_Stream_Manager_WebSocket(
            IServiceScopeFactory scopeFactory,
            Service_Manager_WebSocket_Devices webSocketDeviceManager,
            Service_Stream_History_Manager historyManager)
        {
            _scopeFactory = scopeFactory;
            _webSocketDeviceManager = webSocketDeviceManager;
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

                    // Frame information
                    HasLastFrame = info.LastSentFrameBytes != null,
                    LastFrameSize = info.LastFrameSize,
                    LastFrameTime = info.LastFrameGeneratedTime,
                    LastFrameLayoutType = info.LastFrameLayoutType,

                    // Gateway information
                    IsGatewayMode = info.IsGatewayMode,
                    GatewayTarget = info.GatewayTarget,

                    // Enhanced health information with WebSocket and gateway support
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

                        // Frame-specific health metrics
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

                        // Gateway-specific health metrics
                        IsGatewayMode = info.Health.IsGatewayMode,
                        GatewayTarget = info.Health.GatewayTarget,
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
                    LayoutType = streamInfo.LastFrameLayoutType,
                    IsGatewayMode = streamInfo.IsGatewayMode,
                    GatewayTarget = streamInfo.GatewayTarget
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

        // Start WebSocket streaming for a device screen
        public async Task StartStreamingAsync(
            int junctionId,
            int deviceId,
            int rate,
            string screenKey,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            string? junctionType = null,           // Junction type (e.g., "Gateway Junction (WebSocket to ESP:NOW)")
            string? gatewayDestination = null,     // Gateway IP address (for Gateway junctions)
            int linkId = 0)                        // ✅ FIXED: Added linkId parameter
        {
            if (_streamingTokens.ContainsKey(screen.Id))
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Stream already active for device {deviceId}, screen {screenKey}");
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
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Device {deviceId} not found.");
                    return;
                }

                // Get junction to access CompressPayload and RenderingMode settings
                var junction = await junctionDb.GetJunctionByIdAsync(junctionId);
                if (junction is null)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Junction {junctionId} not found.");
                    return;
                }

                // Determine rendering mode using new constants
                var renderMode = junction.RenderingMode;
                bool isPayloadMode = renderMode == RenderModes.Payload;
                bool isBlitMode = renderMode == RenderModes.Blit;
                bool isCompositeMode = renderMode == RenderModes.Composite;
                bool isAnyFrameMode = RenderModes.IsFrameMode(renderMode);

                // Get screen layout override if exists
                var screenLayoutOverrides = await junctionLinkDb.GetJunctionScreenLayoutsByScreenIdAsync(junctionId, screen.Id);
                var screenOverride = screenLayoutOverrides.FirstOrDefault(o => o.DeviceScreenId == screen.Id);

                // Determine if this is a gateway junction and get target information
                bool isGatewayMode = !string.IsNullOrEmpty(junctionType) &&
                                   junctionType.Equals("Gateway Junction (WebSocket to ESP:NOW)", StringComparison.OrdinalIgnoreCase);
                string? targetMacAddress = device.UniqueIdentifier; // Target device MAC for ESP-NOW

                // For gateway junctions, ensure we have the gateway destination
                if (isGatewayMode && string.IsNullOrEmpty(gatewayDestination))
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Gateway junction requires gateway IP address.");
                    return;
                }

                // FIXED: Ensure connection exists (either existing or create new)
                string deviceMacToConnect = isGatewayMode ? gatewayDestination! : device.UniqueIdentifier!;

                Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Ensuring WebSocket connection to {deviceMacToConnect}...");
                bool connectionReady = await _webSocketDeviceManager.EnsureConnectionAsync(deviceMacToConnect, cts.Token);

                if (!connectionReady)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Failed to establish WebSocket connection to {deviceMacToConnect}.");
                    return;
                }

                Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] ✅ WebSocket connection ready for {deviceMacToConnect}");

                // Create WebSocket sender
                var webSocketSender = new Service_Send_Data_WebSocket(
                    deviceMacToConnect,
                    _webSocketDeviceManager,
                    isGatewayMode,
                    targetMacAddress);

                // Determine protocol string
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

                // Create stream info
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

                // Update health to indicate frame mode
                if (isAnyFrameMode)
                {
                    info.Health.IsFrameMode = true;
                }

                _streamingTokens[screen.Id] = info;

                // Send initial configuration based on rendering mode
                if (isBlitMode)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] 🖼️ Sending blit mode config for {screenKey}");

                    // Get frame layout for correct dimensions
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

                    // Create blit mode configuration message with actual dimensions
                    var blitConfig = new
                    {
                        type = "blit_config",
                        screenId = screenKey,
                        mode = "blit",
                        frameFormat = "RGB565",
                        frameWidth = frameLayout.Width,
                        frameHeight = frameLayout.Height,
                        frameSize = frameLayout.Width * frameLayout.Height * 2, // RGB565 = 2 bytes per pixel
                        bytesPerPixel = 2,
                        description = "Pre-rendered frame stream - expecting binary frame data"
                    };

                    string configJson = JsonSerializer.Serialize(blitConfig);

                    // Send the blit config
                    var (success, _) = await webSocketSender.SendPayloadAsync(configJson);
                    if (!success)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Failed to send blit config.");
                        info.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }

                    // Update StreamInfo with config details
                    info.ConfigPayloadPrefix = "";
                    info.UpdateConfigPayload(configJson);

                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Blit config sent to {device.Name}: {frameLayout.Width}x{frameLayout.Height} ({frameLayout.Width * frameLayout.Height * 2} bytes per frame)");
                }

                else if (isCompositeMode)
                {
                    // COMPOSITE MODE: Generate and send initial composite config
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] 🎭 Starting in Composite (frame assembly) mode for {screenKey}");

                    Dictionary<string, object> compositeConfig = await payloadService.GenerateRiveConfigPayloadsAsync(
                        screenKey,
                        assignedSensors,
                        screen,
                        screenOverride,
                        junctionType: junctionType,
                        gatewayDestination: targetMacAddress,
                        compressPayload: junction.CompressPayload);

                    if (!compositeConfig.TryGetValue(screenKey, out object rawCompositeConfig))
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] No composite config payload for screen {screenKey}.");
                        info.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }

                    // Send the composite config and extract payload info
                    bool configSent = false;
                    if (rawCompositeConfig is byte[] compositeConfigBytes)
                    {
                        var result = await webSocketSender.SendPayloadWithHealthAsync(compositeConfigBytes);
                        result.PayloadType = "Composite Config";
                        result.IsGatewayMode = isGatewayMode;
                        result.GatewayTarget = targetMacAddress;
                        info.Health.UpdateHealth(result);
                        configSent = result.Success;

                        // Extract payload info for UI
                        if (configSent)
                        {
                            if (junction.CompressPayload)
                            {
                                // Extract binary prefix for compressed
                                string compressedPrefix = ExtractBinaryPrefix(compositeConfigBytes);
                                info.UpdateCompressedConfigPayloadPrefix(compressedPrefix);

                                // Get uncompressed version for UI display
                                var uncompressedCompositeConfig = await payloadService.GenerateRiveConfigPayloadsAsync(
                                    screenKey, assignedSensors, screen, screenOverride,
                                    junctionType: junctionType, gatewayDestination: targetMacAddress,
                                    compressPayload: false);

                                if (uncompressedCompositeConfig.TryGetValue(screenKey, out object uncompressedRaw) &&
                                    uncompressedRaw is string uncompressedString)
                                {
                                    string uncompressedPrefix = ExtractStringPrefix(uncompressedString);
                                    info.ConfigPayloadPrefix = uncompressedPrefix;
                                    string jsonConfig = string.IsNullOrEmpty(uncompressedPrefix)
                                        ? uncompressedString
                                        : uncompressedString.Substring(8);
                                    info.UpdateConfigPayload(jsonConfig);
                                }
                            }
                            else
                            {
                                // Uncompressed byte array - convert to string
                                string configString = Encoding.UTF8.GetString(compositeConfigBytes);
                                string configPrefix = ExtractStringPrefix(configString);
                                info.ConfigPayloadPrefix = configPrefix;
                                string jsonConfig = string.IsNullOrEmpty(configPrefix)
                                    ? configString
                                    : configString.Substring(8);
                                info.UpdateConfigPayload(jsonConfig);
                            }
                        }
                    }
                    else if (rawCompositeConfig is string compositeConfigString)
                    {
                        var result = await webSocketSender.SendPayloadWithHealthAsync(Encoding.UTF8.GetBytes(compositeConfigString));
                        result.PayloadType = "Composite Config";
                        result.IsGatewayMode = isGatewayMode;
                        result.GatewayTarget = targetMacAddress;
                        info.Health.UpdateHealth(result);
                        configSent = result.Success;

                        // Extract payload info for UI
                        if (configSent)
                        {
                            string configPrefix = ExtractStringPrefix(compositeConfigString);
                            info.ConfigPayloadPrefix = configPrefix;
                            string jsonConfig = string.IsNullOrEmpty(configPrefix)
                                ? compositeConfigString
                                : compositeConfigString.Substring(8);
                            info.UpdateConfigPayload(jsonConfig);
                        }
                    }

                    if (!configSent)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Failed to send composite config.");
                        info.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }

                    string gatewayInfo = isGatewayMode ? $" via gateway {deviceMacToConnect} targeting {targetMacAddress}" : "";
                    Console.WriteLine($"[{DateTime.Now:HH:mm:ss.fff}] [SERVICE_STREAM_MANAGER_WEBSOCKET] " +
                        $"Composite config sent to {device.Name}{gatewayInfo}.");
                }
                else
                {
                    // PAYLOAD MODE: Generate and send config payload
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] 📄 Starting in Payload mode for {screenKey}");

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
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] No uncompressed config payload for screen {screenKey}.");
                        info.Dispose();
                        _streamingTokens.TryRemove(screen.Id, out _);
                        return;
                    }

                    // Send compressed or uncompressed payload
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
                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] No compressed config payload for screen {screenKey}.");
                            info.Dispose();
                            _streamingTokens.TryRemove(screen.Id, out _);
                            return;
                        }

                        if (rawCompressed is byte[] compressedBytes)
                        {
                            // Extract prefix from binary payload
                            string compressedPrefix = ExtractBinaryPrefix(compressedBytes);
                            info.UpdateCompressedConfigPayloadPrefix(compressedPrefix);

                            // Send raw binary bytes directly
                            var (success, _) = await webSocketSender.SendPayloadAsync(compressedBytes);
                            if (!success)
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Failed to send compressed config payload.");
                                info.Dispose();
                                _streamingTokens.TryRemove(screen.Id, out _);
                                return;
                            }
                        }
                        else if (rawCompressed is string compressedString)
                        {
                            // Extract prefix from string payload
                            string compressedPrefix = ExtractStringPrefix(compressedString);
                            info.UpdateCompressedConfigPayloadPrefix(compressedPrefix);

                            var (success, _) = await webSocketSender.SendPayloadAsync(compressedString);
                            if (!success)
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Failed to send compressed config payload as string.");
                                info.Dispose();
                                _streamingTokens.TryRemove(screen.Id, out _);
                                return;
                            }
                        }
                        else
                        {
                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Unexpected compressed config payload type for screen {screenKey}.");
                            info.Dispose();
                            _streamingTokens.TryRemove(screen.Id, out _);
                            return;
                        }
                    }
                    else
                    {
                        var (success, _) = await webSocketSender.SendPayloadAsync(uncompressedJson);
                        if (!success)
                        {
                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Failed to send uncompressed config payload.");
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

                    string compressionInfo = junction.CompressPayload ? " (compressed)" : "";
                    string gatewayInfo = isGatewayMode ? $" via gateway {deviceMacToConnect} targeting {targetMacAddress}" : "";
                    Console.WriteLine($"[{DateTime.Now:HH:mm:ss.fff}] [SERVICE_STREAM_MANAGER_WEBSOCKET] Config sent to {device.Name}{gatewayInfo}{compressionInfo}.");
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

                // Get screen layout override if exists
                var screenLayoutOverrides = await junctionLinkDb.GetJunctionScreenLayoutsByScreenIdAsync(junctionId, screen.Id);
                var screenOverride = screenLayoutOverrides.FirstOrDefault(o => o.DeviceScreenId == screen.Id);

                await Task.Delay(500, cts.Token);

                while (!cts.Token.IsCancellationRequested)
                {
                    try
                    {
                        // FIXED: Check if WebSocket connection is still active, try to reconnect if needed
                        if (!_webSocketDeviceManager.IsDeviceConnected(info.DeviceMac))
                        {
                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] WebSocket connection lost for {info.DeviceMac}. Attempting to reconnect...");

                            bool reconnected = await _webSocketDeviceManager.EnsureConnectionAsync(info.DeviceMac, cts.Token);
                            if (!reconnected)
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Failed to reconnect to {info.DeviceMac}. Stopping stream.");
                                break;
                            }

                            Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] ✅ Reconnected to {info.DeviceMac}. Resuming stream.");
                        }

                        if (isBlitMode)
                        {
                            // BLIT MODE: Capture frame from virtual screen and convert to RGB565

                            try
                            {
                                // Get the virtual stream manager and frame layout
                                using var frameScope = _scopeFactory.CreateScope();
                                var virtualStreamManager = frameScope.ServiceProvider.GetRequiredService<Service_Stream_Manager_Virtual>();
                                var frameLayoutDb = frameScope.ServiceProvider.GetRequiredService<Service_Database_Manager_FrameEngine>();

                                // Get frame layout from screen override or screen itself
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

                                // Generate current sensor data for the frame
                                Dictionary<string, object> sensorData = new();
                                try
                                {
                                    var riveSensor = await loopPayloadService.GenerateRiveSensorPayloadsAsync(
                                        screenKey, assignedSensors, screen,
                                        junctionType: junctionType, gatewayDestination: targetMacAddress,
                                        compressPayload: false);

                                    if (riveSensor.TryGetValue(screenKey, out var rawSensor) && rawSensor is string sensorJson)
                                    {
                                        var prefix = ExtractStringPrefix(sensorJson);
                                        var cleanJson = string.IsNullOrEmpty(prefix) ? sensorJson : sensorJson.Substring(8);
                                        var sensorObj = JsonSerializer.Deserialize<Dictionary<string, object>>(cleanJson);
                                        if (sensorObj?.ContainsKey("sensors") == true)
                                        {
                                            sensorData = sensorObj;
                                        }
                                    }
                                }
                                catch (Exception sensorEx)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Error generating sensor data: {sensorEx.Message}");
                                    // Continue with empty sensor data
                                }

                                // Capture PNG frame from virtual screen
                                var pngBytes = await virtualStreamManager.CaptureFrameForBlitMode(
                                    screen.Id, sensorData, frameLayout, junctionId, linkId, screenOverride);

                                if (pngBytes == null || pngBytes.Length == 0)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Failed to capture frame from virtual screen");
                                    continue;
                                }

                                // Convert PNG to RGB565 format (240x240x2 = 115,200 bytes)
                                var rgb565Bytes = await ConvertPngToRgb565(pngBytes, frameLayout.Width, frameLayout.Height);

                                if (rgb565Bytes == null || rgb565Bytes.Length != frameLayout.Width * frameLayout.Height * 2)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] RGB565 conversion failed or wrong size");
                                    continue;
                                }

                                Stopwatch stopwatch = Stopwatch.StartNew();
                                var result = await info.WebSocketSender!.SendPayloadWithHealthAsync(rgb565Bytes);
                                stopwatch.Stop();

                                // Update result with frame-specific metrics
                                result.PayloadType = "Frame";
                                result.IsGatewayMode = isGatewayMode;
                                result.GatewayTarget = targetMacAddress;

                                // Update health information with frame metrics
                                info.Health.UpdateHealth(result);

                                // Update frame-specific info in StreamInfo
                                if (result.Success)
                                {
                                    info.UpdateLastSentFrame(rgb565Bytes, "BLIT_MODE");
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Real frame sent: {rgb565Bytes.Length} bytes from {pngBytes.Length} PNG bytes");
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

                                // Add to history
                                var historyEntry = _historyManager.CreateEntryFromWebSocket(info);
                                _historyManager.AddHistoryEntry(historyEntry);

                                _streamLatencies[screen.Id] = result.LatencyMs;

                                // Calculate pause based on desired rate minus actual send time
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
                                // Fall back to delay and continue
                                await Task.Delay(rate, cts.Token);
                                continue;
                            }
                        }

                        else if (isCompositeMode)
                        {
                            // COMPOSITE MODE: Generate and send composite sensor data
                            Dictionary<string, object> compositeSensorPayload = await loopPayloadService.GenerateRiveSensorPayloadsAsync(
                                screenKey,
                                assignedSensors,
                                screen,
                                junctionType: junctionType,
                                gatewayDestination: targetMacAddress,
                                compressPayload: junction.CompressPayload);

                            if (!compositeSensorPayload.TryGetValue(screenKey, out object rawCompositeSensor))
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] No composite sensor payload for screen {screenKey}. Exiting loop.");
                                break;
                            }

                            // Send composite sensor data
                            Stopwatch stopwatch = Stopwatch.StartNew();
                            WebSocketSendResult result;

                            if (rawCompositeSensor is byte[] compositeSensorBytes)
                            {
                                result = await info.WebSocketSender!.SendPayloadWithHealthAsync(compositeSensorBytes);

                                // Extract payload info for UI after successful send
                                if (result.Success)
                                {
                                    if (junction.CompressPayload)
                                    {
                                        // Extract binary prefix for compressed
                                        string compressedPrefix = ExtractBinaryPrefix(compositeSensorBytes);
                                        info.UpdateCompressedLastSentPayloadPrefix(compressedPrefix);

                                        // Get uncompressed version for UI display
                                        var uncompressedCompositeSensor = await loopPayloadService.GenerateRiveSensorPayloadsAsync(
                                            screenKey, assignedSensors, screen,
                                            junctionType: junctionType, gatewayDestination: targetMacAddress,
                                            compressPayload: false);

                                        if (uncompressedCompositeSensor.TryGetValue(screenKey, out object uncompressedRaw) &&
                                            uncompressedRaw is string uncompressedString)
                                        {
                                            string uncompressedPrefix = ExtractStringPrefix(uncompressedString);
                                            info.LastSentPayloadPrefix = uncompressedPrefix;
                                            string jsonSensor = string.IsNullOrEmpty(uncompressedPrefix)
                                                ? uncompressedString
                                                : uncompressedString.Substring(8);
                                            info.UpdateLastSentPayload(jsonSensor);
                                        }
                                    }
                                    else
                                    {
                                        // Uncompressed byte array - convert to string
                                        string sensorString = Encoding.UTF8.GetString(compositeSensorBytes);
                                        string sensorPrefix = ExtractStringPrefix(sensorString);
                                        info.LastSentPayloadPrefix = sensorPrefix;
                                        string jsonSensor = string.IsNullOrEmpty(sensorPrefix)
                                            ? sensorString
                                            : sensorString.Substring(8);
                                        info.UpdateLastSentPayload(jsonSensor);
                                    }
                                }
                            }
                            else if (rawCompositeSensor is string compositeSensorString)
                            {
                                result = await info.WebSocketSender!.SendPayloadWithHealthAsync(Encoding.UTF8.GetBytes(compositeSensorString));

                                // Extract payload info for UI after successful send
                                if (result.Success)
                                {
                                    string sensorPrefix = ExtractStringPrefix(compositeSensorString);
                                    info.LastSentPayloadPrefix = sensorPrefix;
                                    string jsonSensor = string.IsNullOrEmpty(sensorPrefix)
                                        ? compositeSensorString
                                        : compositeSensorString.Substring(8);
                                    info.UpdateLastSentPayload(jsonSensor);
                                }
                            }
                            else
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Unexpected composite sensor payload type for screen {screenKey}. Exiting loop.");
                                break;
                            }

                            stopwatch.Stop();

                            // Update result with composite-specific metrics
                            result.PayloadType = "Composite Sensor";
                            result.IsGatewayMode = isGatewayMode;
                            result.GatewayTarget = targetMacAddress;

                            // Update health information
                            info.Health.UpdateHealth(result);

                            if (!result.Success)
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Composite sensor send failed: {result.ErrorType} - {result.ErrorMessage}");
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
                        else
                        {
                            // PAYLOAD MODE: Existing sensor payload logic (similar to HTTP but using WebSocket)
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
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] No uncompressed sensor payload for screen {screenKey}. Exiting loop.");
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
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] No compressed sensor payload for screen {screenKey}. Exiting loop.");
                                    break;
                                }

                                if (rawCompressedSensor is byte[] compressedSensorBytes)
                                {
                                    // Extract compressed prefix from binary payload
                                    string compressedSensorPrefix = ExtractBinaryPrefix(compressedSensorBytes);
                                    info.UpdateCompressedLastSentPayloadPrefix(compressedSensorPrefix);

                                    // Send raw binary bytes directly
                                    Stopwatch stopwatch = Stopwatch.StartNew();
                                    var result = await info.WebSocketSender!.SendPayloadWithHealthAsync(compressedSensorBytes);
                                    stopwatch.Stop();

                                    // Mark as payload, not frame
                                    result.PayloadType = "Gzip";
                                    result.IsGatewayMode = isGatewayMode;
                                    result.GatewayTarget = targetMacAddress;

                                    // Update health information
                                    info.Health.UpdateHealth(result);

                                    if (!result.Success)
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

                                    continue;
                                }
                                else if (rawCompressedSensor is string compressedSensorString)
                                {
                                    // Extract compressed prefix from string payload
                                    string compressedSensorPrefix = ExtractStringPrefix(compressedSensorString);
                                    info.UpdateCompressedLastSentPayloadPrefix(compressedSensorPrefix);

                                    Stopwatch stopwatch = Stopwatch.StartNew();
                                    var result = await info.WebSocketSender!.SendPayloadWithHealthAsync(Encoding.UTF8.GetBytes(compressedSensorString));
                                    stopwatch.Stop();

                                    // Mark as payload, not frame
                                    result.PayloadType = "Gzip";
                                    result.IsGatewayMode = isGatewayMode;
                                    result.GatewayTarget = targetMacAddress;

                                    // Update health information
                                    info.Health.UpdateHealth(result);

                                    if (!result.Success)
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

                                    continue;
                                }
                                else
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Unexpected compressed sensor payload type for screen {screenKey}. Exiting loop.");
                                    break;
                                }
                            }

                            // Send uncompressed JSON sensor payload (convert string to bytes)
                            Stopwatch stopwatchUncompressed = Stopwatch.StartNew();
                            var resultUncompressed = await info.WebSocketSender!.SendPayloadWithHealthAsync(Encoding.UTF8.GetBytes(uncompressedSensorJson));
                            stopwatchUncompressed.Stop();

                            // Mark as payload, not frame
                            resultUncompressed.PayloadType = "JSON";
                            resultUncompressed.IsGatewayMode = isGatewayMode;
                            resultUncompressed.GatewayTarget = targetMacAddress;

                            // Update health information
                            info.Health.UpdateHealth(resultUncompressed);

                            if (!resultUncompressed.Success)
                            {
                                Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Send failed: {resultUncompressed.ErrorType} - {resultUncompressed.ErrorMessage}");
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
                            else
                            {
                                // Log connection recreation events for debugging
                                if (resultUncompressed.ConnectionRecreated)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] WebSocket connection recreated for {info.DeviceName}");
                                }
                            }

                            info.Latency = resultUncompressed.LatencyMs;
                            info.LastSentTime = DateTime.UtcNow;

                            var historyEntryUncompressed = _historyManager.CreateEntryFromWebSocket(info);
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
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] Unexpected error in streaming loop: {ex.Message}");

                        // Update health with unexpected error
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

        private async Task<byte[]?> ConvertPngToRgb565(byte[] pngBytes, int targetWidth, int targetHeight)
        {
            try
            {
                using var inputStream = new MemoryStream(pngBytes);
                using var image = await SixLabors.ImageSharp.Image.LoadAsync<Rgba32>(inputStream);

                // Resize if needed
                if (image.Width != targetWidth || image.Height != targetHeight)
                {
                    image.Mutate(x => x.Resize(targetWidth, targetHeight));
                }

                var rgb565Bytes = new byte[targetWidth * targetHeight * 2];
                int byteIndex = 0;

                for (int y = 0; y < targetHeight; y++)
                {
                    for (int x = 0; x < targetWidth; x++)
                    {
                        var pixel = image[x, y];

                        // Convert RGBA to RGB565
                        byte r = (byte)(pixel.R >> 3); // 5 bits
                        byte g = (byte)(pixel.G >> 2); // 6 bits  
                        byte b = (byte)(pixel.B >> 3); // 5 bits

                        ushort rgb565 = (ushort)((r << 11) | (g << 5) | b);

                        // Store as little endian
                        rgb565Bytes[byteIndex++] = (byte)(rgb565 & 0xFF);
                        rgb565Bytes[byteIndex++] = (byte)((rgb565 >> 8) & 0xFF);
                    }
                }

                return rgb565Bytes;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_WEBSOCKET] PNG to RGB565 conversion error: {ex.Message}");
                return null;
            }
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

        // WebSocket-specific methods
        public bool IsDeviceConnected(string deviceMac)
        {
            return _webSocketDeviceManager.IsDeviceConnected(deviceMac);
        }

        public IEnumerable<object> GetConnectedDevices()
        {
            return _webSocketDeviceManager.GetConnectedDevices();
        }

        // Get WebSocket-specific stream metrics
        public object GetWebSocketStreamMetrics()
        {
            return new
            {
                TotalStreams = _streamingTokens.Count,
                ActiveStreams = _streamingTokens.Values.Count(s => s.Status == "Active"),
                ConnectedDevices = _webSocketDeviceManager.GetConnectedDevices().Count(),
                StreamsByProtocol = _streamingTokens.Values
                    .GroupBy(s => s.Protocol)
                    .ToDictionary(g => g.Key, g => g.Count()),
                GatewayStreams = _streamingTokens.Values.Count(s => s.IsGatewayMode),
                FrameStreams = _streamingTokens.Values.Count(s => s.Health.IsFrameMode),
                CompositeStreams = _streamingTokens.Values.Count(s => s.Protocol.Contains("Frame Assembly")),
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