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
        private readonly Service_FrameEngine_Puppeteer _puppeteerEngine;
        private readonly Service_FrameEngine _frameEngine;
        private readonly ConcurrentDictionary<int, Service_StreamInfo_Virtual> _streamingTokens = new();
        private readonly ConcurrentDictionary<int, long> _streamLatencies = new();

        // Track virtual screens created for blit mode
        private readonly ConcurrentDictionary<int, (int virtualDeviceId, int virtualScreenId, string virtualScreenUrl, int linkId)> _blitModeVirtualScreens = new();

        public Service_Stream_Manager_Virtual(
            IServiceScopeFactory scopeFactory,
            Service_Stream_History_Manager historyManager,
            Service_FrameEngine_Puppeteer puppeteerEngine,
            Service_FrameEngine frameEngine)
        {
            _scopeFactory = scopeFactory;
            _historyManager = historyManager;
            _puppeteerEngine = puppeteerEngine;
            _frameEngine = frameEngine;
        }

        // PUBLIC helper method that ANY stream manager can call to create virtual screens for blit mode
        public async Task<(int virtualDeviceId, int virtualScreenId, string virtualScreenUrl)?> CreateBlitModeVirtualScreenAsync(
            Model_Device realDevice,
            Model_Device_Screens realScreen,
            int junctionId,
            int linkId,
            int rate,
            List<Model_Sensor> assignedSensors)
        {
            // Get any screen layout overrides for the real screen first
            using var scope = _scopeFactory.CreateScope();
            var junctionLinkDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_JunctionLinks>();
            var screenLayoutOverrides = await junctionLinkDb.GetJunctionScreenLayoutsByScreenIdAsync(junctionId, realScreen.Id);
            var screenOverride = screenLayoutOverrides.FirstOrDefault(o => o.DeviceScreenId == realScreen.Id);

            // Create virtual screen for blit mode with proper overrides applied
            var (virtualDevice, virtualScreen, virtualScreenUrl) = CreateVirtualScreenForBlit(realDevice, realScreen, screenOverride);

            // Track the virtual screen
            _blitModeVirtualScreens[realScreen.Id] = (virtualDevice.Id, virtualScreen.Id, virtualScreenUrl, linkId);

            // Start a virtual stream to the virtual screen (recursive call but with virtual device)
            var virtualScreenKey = $"device_{virtualDevice.Id}_screen_{virtualScreen.Id}";
            await StartStreamingAsync(junctionId, virtualDevice.Id, rate, virtualScreenKey, assignedSensors, virtualScreen, null, null, linkId);

            // Initialize Puppeteer browser for this virtual screen automatically
            try
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Initializing Puppeteer browser for virtual device {virtualDevice.Id}");

                // Create a basic frame layout for initialization (will be overridden by actual calls)
                var defaultFrameLayout = new Model_Frame_Layout
                {
                    Id = -1,
                    DisplayName = "Default Blit",
                    Width = 240,
                    Height = 240
                };

                // Initialize browser by attempting to render a frame with empty sensor data
                await _puppeteerEngine.RenderFrame(
                    defaultFrameLayout,
                    new Dictionary<string, object>(), // Empty sensor data for initialization
                    virtualDevice.Id.ToString(),
                    junctionId,
                    linkId,
                    virtualScreen.Id,
                    screenOverride);

                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Puppeteer browser initialized for virtual device {virtualDevice.Id}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Warning: Failed to initialize Puppeteer browser for virtual device {virtualDevice.Id}: {ex.Message}");
                // Continue anyway - browser will be created on first frame capture if needed
            }

            Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Created and started blit mode virtual stream for {realDevice.Name} -> {virtualScreenUrl}");

            return (virtualDevice.Id, virtualScreen.Id, virtualScreenUrl);
        }

        // PUBLIC helper method to stop blit mode virtual screens
        public async void StopBlitModeVirtualScreen(int originalScreenId)
        {
            if (_blitModeVirtualScreens.TryGetValue(originalScreenId, out var screenTuple))
            {
                // Stop the virtual stream
                StopStreaming(screenTuple.virtualScreenId);

                // Clean up Puppeteer browser for this virtual screen
                try
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Cleaning up Puppeteer browser for virtual device {screenTuple.virtualDeviceId}");
                    await _puppeteerEngine.CloseBrowser(screenTuple.virtualDeviceId.ToString());
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Warning: Error cleaning up Puppeteer browser for virtual device {screenTuple.virtualDeviceId}: {ex.Message}");
                }

                // Remove from tracking
                _blitModeVirtualScreens.TryRemove(originalScreenId, out _);

                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Stopped blit mode virtual screen for original screen {originalScreenId}");
            }
        }

        // PUBLIC method to capture frames for blit mode (called by other stream managers)
        public async Task<byte[]?> CaptureFrameForBlitMode(
            int originalScreenId,
            Dictionary<string, object> sensorData,
            Model_Frame_Layout frameLayout,
            int junctionId,
            int linkId,
            Model_JunctionScreenLayout? screenConfig = null)
        {
            if (!_blitModeVirtualScreens.TryGetValue(originalScreenId, out var screenTuple))
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] No virtual screen found for original screen {originalScreenId}");
                return null;
            }

            try
            {
                var frameBytes = await _puppeteerEngine.RenderFrame(
                    frameLayout,
                    sensorData,
                    screenTuple.virtualDeviceId.ToString(),
                    junctionId,
                    linkId,
                    screenTuple.virtualScreenId,
                    screenConfig);

                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Captured frame for virtual screen {screenTuple.virtualScreenId} ({frameBytes.Length} bytes)");
                return frameBytes;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Error capturing frame for virtual screen {screenTuple.virtualScreenId}: {ex.Message}");
                return null;
            }
        }

        // PUBLIC method to refresh virtual screen page (useful for debugging)
        public async Task<bool> RefreshVirtualScreen(int originalScreenId)
        {
            if (_blitModeVirtualScreens.TryGetValue(originalScreenId, out var screenTuple))
            {
                try
                {
                    return await _puppeteerEngine.RefreshPage(screenTuple.virtualDeviceId.ToString());
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Error refreshing virtual screen {screenTuple.virtualScreenId}: {ex.Message}");
                    return false;
                }
            }
            return false;
        }

        // PUBLIC method to get Puppeteer metrics for debugging
        public object GetPuppeteerMetrics()
        {
            return _puppeteerEngine.GetBrowserMetrics();
        }

        // Create a virtual device that mirrors a real device for blit mode
        private (Model_Device virtualDevice, Model_Device_Screens virtualScreen, string virtualScreenUrl) CreateVirtualScreenForBlit(
            Model_Device realDevice,
            Model_Device_Screens realScreen,
            Model_JunctionScreenLayout? screenOverride = null)
        {
            // Generate unique IDs for virtual device and screen
            var virtualDeviceId = -Math.Abs(realDevice.Id + 10000); // Negative to avoid conflicts
            var virtualScreenId = -Math.Abs(realScreen.Id + 20000);

            // Create virtual device that mirrors the real device
            var virtualDevice = new Model_Device
            {
                Id = virtualDeviceId,
                Name = $"Blit-{realDevice.Name}",
                Type = "Virtual Screen",
                UniqueIdentifier = $"blit-{realDevice.UniqueIdentifier}",
                Description = $"Virtual device for blit mode rendering of {realDevice.Name}",
                IPAddress = null,
                COMPort = null,
                Status = "Active",
                CreatedAt = DateTime.UtcNow
            };

            // Create virtual screen that mirrors the real screen with overrides applied
            var virtualScreen = new Model_Device_Screens
            {
                Id = virtualScreenId,
                DeviceId = virtualDeviceId,
                ScreenKey = $"blit_screen_{virtualScreenId}",
                DisplayName = $"Blit-{realScreen.DisplayName}",
                Template = realScreen.Template, // Use same template
                ScreenLayoutId = screenOverride?.ScreenLayoutId ?? realScreen.ScreenLayoutId, // Apply override if exists
                FrameLayoutId = screenOverride?.FrameLayoutId ?? realScreen.FrameLayoutId, // Apply override if exists
                FrameTemplate = realScreen.FrameTemplate,
                ScreenType = realScreen.ScreenType,
                SupportsConfigPayloads = true, // Always true for virtual screens
                SupportsSensorPayloads = true,
                UseKeepAlive = false
            };

            var virtualScreenUrl = $"/device/{virtualDeviceId}/virtual-screen";

            Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Created virtual screen for blit mode: {virtualDevice.Name} -> {virtualScreenUrl}");

            if (screenOverride != null)
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Applied screen layout override (ID: {screenOverride.ScreenLayoutId}) to virtual screen");
                if (screenOverride.FrameLayoutId.HasValue)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Applied frame layout override (ID: {screenOverride.FrameLayoutId}) to virtual screen");
                }
            }

            return (virtualDevice, virtualScreen, virtualScreenUrl);
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

                // Match updated naming: payloadType shows "Composite Sensor" when running in composite mode
                bool isComposite = (info.Protocol ?? "").IndexOf("Frame Assembly", StringComparison.OrdinalIgnoreCase) >= 0;
                string payloadType = isComposite ? "Composite Sensor" : "JSON";

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

        // Updated method with 9 parameters to match the unified signature
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
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Stream already active for device {deviceId}, screen {screenKey}");
                return;
            }

            // Log gateway parameters for debugging (Virtual manager doesn't use them but logs for consistency)
            if (!string.IsNullOrEmpty(junctionType))
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Gateway junction type: {junctionType} (ignored by virtual manager)");
            }
            if (!string.IsNullOrEmpty(gatewayDestination))
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Gateway destination: {gatewayDestination} (ignored by virtual manager)");
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

            // Determine rendering mode using new constants
            var renderMode = junction.RenderingMode;
            bool isBlitMode = renderMode == RenderModes.Blit;
            bool isCompositeMode = renderMode == RenderModes.Composite;
            bool isAnyFrameMode = RenderModes.IsFrameMode(renderMode);

            // Fetch screen layout overrides
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
                Protocol = isCompositeMode ? "Virtual (Frame Assembly)"
                                  : isBlitMode ? "Virtual (Pre-rendered Frames)"
                                  : "Virtual"
            };

            _streamingTokens[screen.Id] = info;

            // CONFIG GENERATION - (composite or blit both use same data - this manager is not currently setup for standard payload mode)
            var riveConfig = await payloadSvc.GenerateRiveConfigPayloadsAsync(
                screenKey,
                assignedSensors,
                screen,
                screenOverride,
                junctionType: junctionType,
                gatewayDestination: gatewayDestination,
                compressPayload: junction.CompressPayload);

            if (!riveConfig.TryGetValue(screenKey, out var rawConfig))
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] No rive config for {screenKey}.");
                _streamingTokens.TryRemove(screen.Id, out _);
                return;
            }

            // Extract config JSON for UI display
            string configJson = "";
            if (rawConfig is byte[] configBytes)
            {
                if (junction.CompressPayload)
                {
                    // Get uncompressed version for UI display
                    var uncompressedConfig = await payloadSvc.GenerateRiveConfigPayloadsAsync(
                        screenKey, assignedSensors, screen, screenOverride,
                        junctionType: junctionType, gatewayDestination: gatewayDestination, compressPayload: false);

                    if (uncompressedConfig.TryGetValue(screenKey, out var rawUnc) && rawUnc is string uncStr)
                    {
                        var prefix = ExtractStringPrefix(uncStr);
                        configJson = string.IsNullOrEmpty(prefix) ? uncStr : uncStr.Substring(8);
                    }
                }
                else
                {
                    var configStr = Encoding.UTF8.GetString(configBytes);
                    var prefix = ExtractStringPrefix(configStr);
                    configJson = string.IsNullOrEmpty(prefix) ? configStr : configStr.Substring(8);
                }
            }
            else if (rawConfig is string configStr)
            {
                var prefix = ExtractStringPrefix(configStr);
                configJson = string.IsNullOrEmpty(prefix) ? configStr : configStr.Substring(8);
            }

            info.UpdateConfigPayload(configJson);
            Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Rive config prepared for {deviceName}/{screenKey}.");

            // SENSOR LOOP - Always use Rive sensor payloads
            _ = Task.Run(async () =>
            {
                using var loopScope = _scopeFactory.CreateScope();
                var loopPayloadSvc = loopScope.ServiceProvider.GetRequiredService<Service_Manager_Payloads>();

                await Task.Delay(500, cts.Token);

                while (!cts.Token.IsCancellationRequested)
                {
                    // Console.WriteLine($"[DEBUG] Sensor loop iteration for device {deviceId}, screen {screen.Id}, isBlitMode: {isBlitMode}");

                    try
                    {
                        // Always generate Rive sensor payloads (works for both blit and composite)
                        var riveSensor = await loopPayloadSvc.GenerateRiveSensorPayloadsAsync(
                            screenKey,
                            assignedSensors,
                            screen,
                            junctionType: junctionType,
                            gatewayDestination: gatewayDestination,
                            compressPayload: junction.CompressPayload);

                        if (!riveSensor.TryGetValue(screenKey, out var rawSensor))
                            break;

                        // Extract sensor JSON for UI display
                        string sensorJson = "";
                        if (rawSensor is byte[] sensorBytes)
                        {
                            if (junction.CompressPayload)
                            {
                                // Get uncompressed version for UI display
                                var uncompressed = await loopPayloadSvc.GenerateRiveSensorPayloadsAsync(
                                    screenKey, assignedSensors, screen,
                                    junctionType: junctionType, gatewayDestination: gatewayDestination,
                                    compressPayload: false);

                                if (uncompressed.TryGetValue(screenKey, out var rawUnc) && rawUnc is string uncStr)
                                {
                                    var prefix = ExtractStringPrefix(uncStr);
                                    sensorJson = string.IsNullOrEmpty(prefix) ? uncStr : uncStr.Substring(8);
                                }
                            }
                            else
                            {
                                var sensorStr = Encoding.UTF8.GetString(sensorBytes);
                                var prefix = ExtractStringPrefix(sensorStr);
                                sensorJson = string.IsNullOrEmpty(prefix) ? sensorStr : sensorStr.Substring(8);
                            }
                        }
                        else if (rawSensor is string sensorStr)
                        {
                            var prefix = ExtractStringPrefix(sensorStr);
                            sensorJson = string.IsNullOrEmpty(prefix) ? sensorStr : sensorStr.Substring(8);
                        }

                        info.UpdateLastGeneratedPayload(sensorJson);

                        info.LastGeneratedTime = DateTime.UtcNow;
                        info.Latency = 0;
                        _streamLatencies[screen.Id] = 0;

                        // BLIT MODE: Capture frame if this is a virtual screen for blit mode (fire-and-forget async)
                        if (isBlitMode && deviceId < 0) // Virtual device IDs are negative
                        {
                            _ = Task.Run(async () =>
                            {
                                try
                                {
                                    // Console.WriteLine($"[DEBUG] Starting frame capture for virtual device {deviceId}, screen {screen.Id}");

                                    // Find the original screen ID that this virtual screen represents
                                    var originalScreenEntry = _blitModeVirtualScreens.FirstOrDefault(kvp => kvp.Value.virtualScreenId == screen.Id);
                                    if (!originalScreenEntry.Equals(default(KeyValuePair<int, (int, int, string, int)>)))
                                    {
                                        var originalScreenId = originalScreenEntry.Key;
                                        var storedLinkId = originalScreenEntry.Value.linkId;
                                        // Console.WriteLine($"[DEBUG] Found original screen ID: {originalScreenId}");

                                        // Get frame layout from screen override or screen itself
                                        using var frameScope = _scopeFactory.CreateScope();
                                        var frameLayoutDb = frameScope.ServiceProvider.GetRequiredService<Service_Database_Manager_FrameEngine>();
                                        var frameLayoutId = screenOverride?.FrameLayoutId ?? screen.FrameLayoutId;
                                        // Console.WriteLine($"[DEBUG] Frame layout ID: {frameLayoutId}");

                                        if (frameLayoutId.HasValue)
                                        {
                                            var frameLayout = await frameLayoutDb.GetFrameLayoutByIdAsync(frameLayoutId.Value);
                                            if (frameLayout != null)
                                            {
                                                // Console.WriteLine($"[DEBUG] Got frame layout: {frameLayout.DisplayName} ({frameLayout.Width}x{frameLayout.Height})");

                                                // Take a screenshot with the correct parameters for saving
                                                var frameBytes = await _puppeteerEngine.CaptureScreenshot(
                                                    deviceId.ToString(),
                                                    frameLayout.Width,
                                                    frameLayout.Height,
                                                    junctionId,
                                                    storedLinkId,
                                                    originalScreenId);

                                                // Update stream info with frame data
                                                info.UpdateLastGeneratedFrame(frameBytes, frameLayout.LayoutType ?? "BLIT", DateTime.UtcNow);
                                                // Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Captured blit frame for virtual screen {screen.Id} ({frameBytes.Length} bytes)");
                                            }
                                            else
                                            {
                                                Console.WriteLine($"[DEBUG] Frame layout not found for ID: {frameLayoutId}");
                                            }
                                        }
                                        else
                                        {
                                            Console.WriteLine($"[DEBUG] No frame layout ID available");
                                        }
                                    }
                                    else
                                    {
                                        // Console.WriteLine($"[DEBUG] No original screen entry found for virtual screen {screen.Id}");
                                    }
                                }
                                catch (Exception frameEx)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Error capturing blit frame: {frameEx.Message}");
                                    Console.WriteLine($"[DEBUG] Frame capture exception: {frameEx}");
                                }
                            });
                        }

                        // Update health metrics
                        info.Health.ConsecutiveSuccesses++;
                        info.Health.ConsecutiveFailures = 0;
                        info.Health.LastSuccessTime = DateTime.UtcNow;

                        // Add to history
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

            string modeDescription = renderMode switch
            {
                RenderModes.Blit => "Pre-rendered Frames",
                RenderModes.Composite => "Frame Assembly",
                RenderModes.Payload => "Payload",
                _ => renderMode
            };

            Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] ✅ Virtual stream started for screen {screenKey} (Mode: {modeDescription})");
        }



        public void StopStreaming(int screenId)
        {
            if (_streamingTokens.TryRemove(screenId, out var info))
            {
                info.Cts.Cancel();
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Stopped stream for screen {screenId}");
            }

            // Clean up blit mode virtual screen if exists
            if (_blitModeVirtualScreens.TryRemove(screenId, out var blitScreenTuple))
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Cleaned up blit mode virtual screen for original screen {screenId}");
            }
        }

        // Get virtual screen URL for blit mode (for Puppeteer to use)
        public string? GetBlitModeVirtualScreenUrl(int originalScreenId)
        {
            if (_blitModeVirtualScreens.TryGetValue(originalScreenId, out var screenTuple))
            {
                return screenTuple.virtualScreenUrl;
            }
            return null;
        }

        // Get virtual device ID for blit mode
        public int? GetBlitModeVirtualDeviceId(int originalScreenId)
        {
            if (_blitModeVirtualScreens.TryGetValue(originalScreenId, out var screenTuple))
            {
                return screenTuple.virtualDeviceId;
            }
            return null;
        }

        public Model_Device? GetVirtualDeviceById(int virtualDeviceId)
        {
            var virtualScreen = _blitModeVirtualScreens.Values
                .FirstOrDefault(v => v.virtualDeviceId == virtualDeviceId);

            // Check if we found a match by comparing with default tuple
            if (!virtualScreen.Equals(default((int, int, string, int))))
            {
                // Create a virtual device model based on the stored info
                return new Model_Device
                {
                    Id = virtualScreen.virtualDeviceId,
                    Name = $"Blit-Virtual-{Math.Abs(virtualDeviceId)}",
                    Type = "Virtual Screen",
                    UniqueIdentifier = $"blit-virtual-{virtualDeviceId}",
                    Description = "Virtual device for blit mode rendering",
                    IPAddress = null,
                    COMPort = null,
                    Status = "Active",
                    CreatedAt = DateTime.UtcNow
                };
            }

            return null;
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