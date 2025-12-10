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
    public class Service_Stream_Manager_Virtual
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly Service_Stream_History_Manager _historyManager;
        private readonly Service_FrameEngine_Puppeteer _puppeteerEngine;
        private readonly Service_FrameEngine_Puppeteer_Streaming _streamingPuppeteerEngine;
        private readonly Service_FrameEngine _frameEngine;
        private readonly ConcurrentDictionary<int, Service_StreamInfo_Virtual> _streamingTokens = new();
        private readonly ConcurrentDictionary<int, long> _streamLatencies = new();

        // Track virtual screens created for blit mode
        private readonly ConcurrentDictionary<int, (int virtualDeviceId, int virtualScreenId, string virtualScreenUrl, int linkId)> _blitModeVirtualScreens = new();

        // Track junction/link context for virtual screens (needed for streaming endpoint)
        private readonly ConcurrentDictionary<int, (int junctionId, int linkId, int frameLayoutId)> _blitModeContext = new();

        public Service_Stream_Manager_Virtual(
            IServiceScopeFactory scopeFactory,
            Service_Stream_History_Manager historyManager,
            Service_FrameEngine_Puppeteer puppeteerEngine,
            Service_FrameEngine_Puppeteer_Streaming streamingPuppeteerEngine,
            Service_FrameEngine frameEngine)
        {
            _scopeFactory = scopeFactory;
            _historyManager = historyManager;
            _puppeteerEngine = puppeteerEngine;
            _streamingPuppeteerEngine = streamingPuppeteerEngine;
            _frameEngine = frameEngine;
        }

        public async Task<(int virtualDeviceId, int virtualScreenId, string virtualScreenUrl)?> CreateBlitModeVirtualScreenAsync(
            Model_Device realDevice,
            Model_Device_Screens realScreen,
            int junctionId,
            int linkId,
            int rate,
            List<Model_Sensor> assignedSensors,
            bool isStreamingMode = false)
        {
            using var scope = _scopeFactory.CreateScope();
            var junctionLinkDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_JunctionLinks>();
            var screenLayoutOverrides = await junctionLinkDb.GetJunctionScreenLayoutsByScreenIdAsync(junctionId, realScreen.Id);
            var screenOverride = screenLayoutOverrides.FirstOrDefault(o => o.DeviceScreenId == realScreen.Id);

            var (virtualDevice, virtualScreen, virtualScreenUrl) = CreateVirtualScreenForBlit(realDevice, realScreen, screenOverride, isStreamingMode);

            _blitModeVirtualScreens[realScreen.Id] = (virtualDevice.Id, virtualScreen.Id, virtualScreenUrl, linkId);

            // Store junction/link context for streaming endpoint
            var effectiveFrameLayoutId = screenOverride?.FrameLayoutId ?? realScreen.FrameLayoutId ?? -1;
            _blitModeContext[realScreen.Id] = (junctionId, linkId, effectiveFrameLayoutId);

            var virtualScreenKey = $"device_{virtualDevice.Id}_screen_{virtualScreen.Id}";
            await StartStreamingAsync(junctionId, virtualDevice.Id, rate, virtualScreenKey, assignedSensors, virtualScreen, null, null, linkId);

            try
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Initializing Puppeteer browsers for virtual device {virtualDevice.Id}");

                // Load actual frame layout from database instead of hardcoded 240x240
                Model_Frame_Layout? actualFrameLayout = null;
                var frameLayoutId = screenOverride?.FrameLayoutId ?? realScreen.FrameLayoutId;

                if (frameLayoutId.HasValue)
                {
                    var frameEngineDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_FrameEngine>();
                    actualFrameLayout = await frameEngineDb.GetFrameLayoutByIdAsync(frameLayoutId.Value);
                }

                // Fallback to default if frame layout not found
                var frameLayout = actualFrameLayout ?? new Model_Frame_Layout
                {
                    Id = -1,
                    DisplayName = "Default Blit",
                    Width = 240,
                    Height = 240
                };

                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Using frame layout: {frameLayout.DisplayName} ({frameLayout.Width}x{frameLayout.Height})");

                if (isStreamingMode)
                {
                    // Retrieve junction for quality fallback
                    var junctionDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Junctions>();
                    var junction = await junctionDb.GetJunctionByIdAsync(junctionId);

                    // Retrieve streaming FPS from screen override or use default
                    int targetFps = screenOverride?.StreamingFps ?? 30;

                    // Retrieve JPEG quality: per-screen override → junction setting → default 85
                    int jpegQuality = screenOverride?.StreamingJpegQuality ?? junction?.StreamingJpegQuality ?? 85;

                    // Initialize streaming Puppeteer with CDP screencast subprocess (for MJPEG streaming)
                    await _streamingPuppeteerEngine.InitializeStreamingCapture(
                        frameLayout,
                        virtualDevice.Id.ToString(),
                        junctionId,
                        targetFps,
                        jpegQuality);

                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Streaming Puppeteer (CDP) initialized for virtual device {virtualDevice.Id} on port {50000 + junctionId} at {targetFps} FPS, Quality {jpegQuality}");
                }
                else
                {
                    // Initialize regular Puppeteer for Blit mode
                    await _puppeteerEngine.RenderFrame(
                        frameLayout,
                        new Dictionary<string, object>(),
                        virtualDevice.Id.ToString(),
                        junctionId,
                        linkId,
                        virtualScreen.Id,
                        screenOverride);

                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Blit Puppeteer initialized for virtual device {virtualDevice.Id}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Warning: Failed to initialize Puppeteer browsers for virtual device {virtualDevice.Id}: {ex.Message}");
            }

            Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Created and started blit mode virtual stream for {realDevice.Name} -> {virtualScreenUrl}");

            return (virtualDevice.Id, virtualScreen.Id, virtualScreenUrl);
        }

        public async Task StopBlitModeVirtualScreen(int originalScreenId)
        {
            if (_blitModeVirtualScreens.TryGetValue(originalScreenId, out var screenTuple))
            {
                StopStreaming(screenTuple.virtualScreenId);

                try
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Cleaning up Puppeteer browsers for virtual device {screenTuple.virtualDeviceId}");

                    // Close both Puppeteer services
                    await _puppeteerEngine.CloseBrowser(screenTuple.virtualDeviceId.ToString());
                    await _streamingPuppeteerEngine.CloseBrowser(screenTuple.virtualDeviceId.ToString());
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Warning: Error cleaning up Puppeteer browsers for virtual device {screenTuple.virtualDeviceId}: {ex.Message}");
                }

                _blitModeVirtualScreens.TryRemove(originalScreenId, out _);
                _blitModeContext.TryRemove(originalScreenId, out _);

                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Stopped blit mode virtual screen for original screen {originalScreenId}");
            }
        }

        /// <summary>
        /// Get the virtual device ID and screen ID for a given original screen
        /// Used by streaming services to directly access the virtual screen
        /// </summary>
        public (int virtualDeviceId, int virtualScreenId)? GetVirtualScreenInfo(int originalScreenId)
        {
            if (_blitModeVirtualScreens.TryGetValue(originalScreenId, out var screenTuple))
            {
                return (screenTuple.virtualDeviceId, screenTuple.virtualScreenId);
            }
            return null;
        }

        /// <summary>
        /// Get the junction/link context for a given original screen
        /// Used by streaming endpoint to retrieve junction info
        /// </summary>
        public (int junctionId, int linkId, int frameLayoutId)? GetBlitModeContext(int originalScreenId)
        {
            if (_blitModeContext.TryGetValue(originalScreenId, out var context))
            {
                return context;
            }
            return null;
        }

        /// <summary>
        /// Capture frame optimized for MJPEG streaming - returns JPEG directly with no delays
        /// Uses dedicated streaming-optimized Puppeteer service
        /// </summary>
        public async Task<byte[]?> CaptureFrameForStreamingMode(
            int originalScreenId,
            Model_Frame_Layout frameLayout)
        {
            if (!_blitModeVirtualScreens.TryGetValue(originalScreenId, out var screenTuple))
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] No virtual screen found for original screen {originalScreenId}");
                return null;
            }

            try
            {
                var sw = System.Diagnostics.Stopwatch.StartNew();

                // Use streaming-optimized Puppeteer service for high FPS capture (CDP screencast)
                var browserKey = $"screen_{screenTuple.virtualDeviceId}";
                var frameBytes = await _streamingPuppeteerEngine.GetLatestScreencastFrame(browserKey);

                sw.Stop();

                return frameBytes;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Error capturing streaming frame for virtual screen {screenTuple.virtualScreenId}: {ex.Message}");
                return null;
            }
        }

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

                // Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Captured frame for virtual screen {screenTuple.virtualScreenId} ({frameBytes.Length} bytes)");
                return frameBytes;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Error capturing frame for virtual screen {screenTuple.virtualScreenId}: {ex.Message}");
                return null;
            }
        }

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

        public object GetPuppeteerMetrics()
        {
            return _puppeteerEngine.GetBrowserMetrics();
        }

        private (Model_Device virtualDevice, Model_Device_Screens virtualScreen, string virtualScreenUrl) CreateVirtualScreenForBlit(
            Model_Device realDevice,
            Model_Device_Screens realScreen,
            Model_JunctionScreenLayout? screenOverride = null,
            bool isStreamingMode = false)
        {
            var virtualDeviceId = -Math.Abs(realDevice.Id + 10000);
            var virtualScreenId = -Math.Abs(realScreen.Id + 20000);

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

            var virtualScreen = new Model_Device_Screens
            {
                Id = virtualScreenId,
                DeviceId = virtualDeviceId,
                ScreenKey = $"blit_screen_{virtualScreenId}",
                DisplayName = $"{(isStreamingMode ? "Streaming" : "Blit")}-{realScreen.DisplayName}",
                Template = realScreen.Template,
                ScreenLayoutId = screenOverride?.ScreenLayoutId ?? realScreen.ScreenLayoutId,
                FrameLayoutId = screenOverride?.FrameLayoutId ?? realScreen.FrameLayoutId,
                FrameTemplate = realScreen.FrameTemplate,
                ScreenType = realScreen.ScreenType,
                SupportsConfigPayloads = true,
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

        public IEnumerable<Model_StreamInfo_DTO> GetActiveStreams(bool showCompressed = false)
        {
            return _streamingTokens.Select(kvp =>
            {
                var info = kvp.Value;
                return new Model_StreamInfo_DTO
                {
                    StreamKey = kvp.Key.ToString(),
                    DeviceName = info.DeviceName,
                    DeviceMac = "Virtual",
                    ScreenId = info.ScreenId,
                    ScreenName = info.ScreenName,
                    Status = info.Status,
                    Rate = info.Rate,
                    Latency = info.Latency,
                    LastSentTime = info.LastGeneratedTime,
                    Protocol = info.Protocol ?? "Virtual",
                    SensorsCount = info.SensorsCount,
                    HasLastFrame = info.LastGeneratedFrameBytes != null,
                    LastFrameSize = (int?)info.LastFrameSize,
                    LastFrameTime = info.LastFrameGeneratedTime,
                    LastFrameLayoutType = info.LastFrameLayoutType,
                    IsGatewayMode = false,
                    GatewayTarget = "N/A",
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
                        MaxLatency = (long)info.Latency,
                        MinLatency = (long)info.Latency,
                        LastSuccessTime = info.Health.LastSuccessTime ?? DateTime.MinValue,
                        LastFailureTime = info.Health.LastFailureTime ?? DateTime.MinValue,
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
                        GatewayMessagesSent = 0
                    }
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
            string? junctionType = null,
            string? gatewayDestination = null,
            int linkId = 0)
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

            var renderMode = junction.RenderingMode;
            bool isBlitMode = renderMode == RenderModes.Blit;
            bool isCompositeMode = renderMode == RenderModes.Composite;
            bool isStreamingMode = renderMode == RenderModes.Streaming;
            bool isAnyFrameMode = RenderModes.IsFrameMode(renderMode);

            var screenLayoutOverrides = await junctionLinkDb.GetJunctionScreenLayoutsByScreenIdAsync(junctionId, screen.Id);
            Model_JunctionScreenLayout? screenOverride = screenLayoutOverrides.FirstOrDefault(o => o.DeviceScreenId == screen.Id);

            string protocolString = "Virtual";

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
                Protocol = protocolString
            };

            if (isAnyFrameMode)
            {
                info.Health.IsFrameMode = true;
                info.IsBlitMode = isBlitMode;
                info.IsStreamingMode = isStreamingMode;
            }

            _streamingTokens[screen.Id] = info;

            // CONFIG GENERATION
            Model_PayloadResultCollection configResult;

            if (isAnyFrameMode) // Blit, Composite, or Streaming modes
            {
                configResult = await payloadSvc.GenerateFrameEngineConfigPayloadsAsync(
                    screenKey,
                    assignedSensors,
                    screen,
                    screenOverride,
                    junctionType: junctionType,
                    gatewayDestination: gatewayDestination,
                    compressPayload: junction.CompressPayload);
            }
            else // Payload mode
            {
                configResult = await payloadSvc.GenerateConfigPayloadsAsync(
                    screenKey,
                    assignedSensors,
                    screen,
                    overrideTemplate: null,
                    junctionType: junctionType,
                    gatewayDestination: gatewayDestination,
                    compressPayload: junction.CompressPayload);
            }

            var configPayload = configResult.GetResult(screenKey);
            if (configPayload == null)
            {
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] No config payload for {screenKey}.");
                _streamingTokens.TryRemove(screen.Id, out _);
                return;
            }

            // Update StreamInfo with config details
            info.ConfigPayloadPrefix = configPayload.UncompressedPrefix;
            info.UpdateConfigPayload(configPayload.UncompressedJson);
            if (configPayload.IsCompressed)
            {
                info.UpdateCompressedConfigPayloadPrefix(configPayload.CompressedPrefix);
            }

            Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Config prepared for {deviceName}/{screenKey} ({configPayload.BinaryPayload.Length} bytes).");

            // SENSOR LOOP
            _ = Task.Run(async () =>
            {
                using var loopScope = _scopeFactory.CreateScope();
                var loopPayloadSvc = loopScope.ServiceProvider.GetRequiredService<Service_Manager_Payloads>();

                await Task.Delay(500, cts.Token);

                while (!cts.Token.IsCancellationRequested)
                {
                    try
                    {
                        Stopwatch stopwatch = Stopwatch.StartNew();
                        Model_PayloadResultCollection sensorResult;

                        if (isAnyFrameMode) // Blit, Composite, or Streaming modes
                        {
                            sensorResult = await loopPayloadSvc.GenerateFrameEngineSensorPayloadsAsync(
                                screenKey,
                                assignedSensors,
                                screen,
                                junctionType: junctionType,
                                gatewayDestination: gatewayDestination,
                                compressPayload: junction.CompressPayload);
                        }
                        else // Payload mode
                        {
                            sensorResult = await loopPayloadSvc.GenerateSensorPayloadsAsync(
                                screenKey,
                                assignedSensors.Count,
                                assignedSensors,
                                screen,
                                junctionType: junctionType,
                                gatewayDestination: gatewayDestination,
                                compressPayload: junction.CompressPayload);
                        }

                        var sensorPayload = sensorResult.GetResult(screenKey);
                        if (sensorPayload == null)
                            break;

                        stopwatch.Stop();

                        // Update StreamInfo with sensor payload details
                        info.LastSentPayloadPrefix = sensorPayload.UncompressedPrefix;
                        info.UpdateLastSentPayload(sensorPayload.UncompressedJson);
                        if (sensorPayload.IsCompressed)
                        {
                            info.UpdateCompressedLastSentPayloadPrefix(sensorPayload.CompressedPrefix);
                        }

                        // Notify FrameEngine that sensor data is now available for this virtual screen
                        // This allows screenshots to proceed once data has been received
                        if (deviceId < 0) // Negative deviceId indicates virtual device
                        {
                            _puppeteerEngine.NotifySensorDataReceived($"{deviceId}");
                        }

                        var healthResult = new VirtualStreamHealthResult
                        {
                            Success = true,
                            LatencyMs = stopwatch.ElapsedMilliseconds,
                            PayloadType = isCompositeMode ? "Composite Sensor" : (isBlitMode ? "Frame" : "JSON"),
                            IsGatewayMode = false,
                            GatewayTarget = null
                        };

                        info.Health.UpdateHealth(healthResult);

                        // BLIT MODE: Capture frame if this is a virtual screen for blit mode
                        if (isBlitMode && deviceId < 0)
                        {
                            _ = Task.Run(async () =>
                            {
                                try
                                {
                                    var originalScreenEntry = _blitModeVirtualScreens.FirstOrDefault(kvp => kvp.Value.virtualScreenId == screen.Id);
                                    if (!originalScreenEntry.Equals(default(KeyValuePair<int, (int, int, string, int)>)))
                                    {
                                        var originalScreenId = originalScreenEntry.Key;
                                        var storedLinkId = originalScreenEntry.Value.linkId;

                                        using var frameScope = _scopeFactory.CreateScope();
                                        var frameLayoutDb = frameScope.ServiceProvider.GetRequiredService<Service_Database_Manager_FrameEngine>();
                                        var frameLayoutId = screenOverride?.FrameLayoutId ?? screen.FrameLayoutId;

                                        if (frameLayoutId.HasValue)
                                        {
                                            var frameLayout = await frameLayoutDb.GetFrameLayoutByIdAsync(frameLayoutId.Value);
                                            if (frameLayout != null)
                                            {
                                                // Update canvas dimensions from actual frame layout
                                                info.CanvasWidth = frameLayout.Width;
                                                info.CanvasHeight = frameLayout.Height;

                                                var frameBytes = await _puppeteerEngine.CaptureScreenshot(
                                                    deviceId.ToString(),
                                                    frameLayout.Width,
                                                    frameLayout.Height,
                                                    junctionId,
                                                    storedLinkId,
                                                    originalScreenId);

                                                // Store the frame for preview/debugging purposes
                                                // Keep the actual layout type (COMPOSITE_MODE) - this Virtual stream is Frame mode
                                                info.UpdateLastGeneratedFrame(frameBytes, frameLayout.LayoutType ?? "COMPOSITE_MODE", DateTime.UtcNow);
                                            }
                                        }
                                    }
                                }
                                catch (Exception frameEx)
                                {
                                    Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Error capturing blit frame: {frameEx.Message}");
                                }
                            });
                        }

                        info.Latency = healthResult.LatencyMs;
                        info.LastGeneratedTime = DateTime.UtcNow;

                        var historyEntry = _historyManager.CreateEntryFromVirtual(info);
                        _historyManager.AddHistoryEntry(historyEntry);

                        _streamLatencies[screen.Id] = healthResult.LatencyMs;

                        int calculatedPause = Math.Max(rate - (int)healthResult.LatencyMs, 0);
                        if (calculatedPause > 0)
                        {
                            await Task.Delay(calculatedPause, cts.Token);
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
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] CTS disposed during streaming loop - shutting down gracefully");
                        break;
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Unexpected error: {ex.Message}");

                        var errorResult = new VirtualStreamHealthResult
                        {
                            Success = false,
                            ErrorType = "unexpected_error",
                            ErrorMessage = ex.Message,
                            LatencyMs = 0,
                            PayloadType = isCompositeMode ? "Composite Sensor" : (isBlitMode ? "Frame" : "JSON"),
                            IsGatewayMode = false,
                            GatewayTarget = null
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

            string modeDescription = renderMode switch
            {
                RenderModes.Blit => "Pre-rendered Frames",
                RenderModes.Composite => "Frame Assembly",
                RenderModes.Payload => "Payload",
                _ => renderMode
            };

            Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Virtual stream started for screen {screenKey} (Mode: {modeDescription})");
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

                // Now dispose resources (was missing - memory leak!)
                info.Cts?.Dispose();

                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Stopped stream for screen {screenId}");
            }

            if (_blitModeVirtualScreens.TryRemove(screenId, out var blitScreenTuple))
            {
                _blitModeContext.TryRemove(screenId, out _);
                Console.WriteLine($"[SERVICE_STREAM_MANAGER_VIRTUAL] Cleaned up blit mode virtual screen for original screen {screenId}");
            }
        }

        public string? GetBlitModeVirtualScreenUrl(int originalScreenId)
        {
            if (_blitModeVirtualScreens.TryGetValue(originalScreenId, out var screenTuple))
            {
                return screenTuple.virtualScreenUrl;
            }
            return null;
        }

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

            if (!virtualScreen.Equals(default((int, int, string, int))))
            {
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

        public object GetVirtualStreamMetrics()
        {
            return new
            {
                TotalStreams = _streamingTokens.Count,
                ActiveStreams = _streamingTokens.Values.Count(s => s.Status == "Active"),
                BlitModeVirtualScreens = _blitModeVirtualScreens.Count,
                StreamsByProtocol = _streamingTokens.Values
                    .GroupBy(s => s.Protocol)
                    .ToDictionary(g => g.Key, g => g.Count()),
                FrameStreams = _streamingTokens.Values.Count(s => s.Health.IsFrameMode),
                CompositeStreams = _streamingTokens.Values.Count(s => s.Protocol?.Contains("Frame Assembly") == true),
                BlitStreams = _streamingTokens.Values.Count(s => s.Protocol?.Contains("Pre-rendered Frames") == true),
                HealthSummary = new
                {
                    Good = _streamingTokens.Values.Count(s => s.Health.ConnectionState == "good"),
                    Poor = _streamingTokens.Values.Count(s => s.Health.ConnectionState == "poor"),
                    Disconnected = _streamingTokens.Values.Count(s => s.Health.ConnectionState == "disconnected")
                }
            };
        }
    }

    // Helper class for virtual stream health results
    public class VirtualStreamHealthResult
    {
        public bool Success { get; set; }
        public string? ErrorType { get; set; }
        public string? ErrorMessage { get; set; }
        public long LatencyMs { get; set; }
        public string PayloadType { get; set; } = "";
        public bool IsGatewayMode { get; set; }
        public string? GatewayTarget { get; set; }
    }
}