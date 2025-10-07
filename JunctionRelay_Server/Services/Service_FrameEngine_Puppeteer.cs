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

using JunctionRelayServer.Models;
using PuppeteerSharp;
using System.Collections.Concurrent;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using System.Runtime.InteropServices;

namespace JunctionRelayServer.Services
{
    public class Service_FrameEngine_Puppeteer : IDisposable
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly Service_FrameEngine _frameEngine;
        private readonly IConfiguration _configuration;
        private readonly IWebHostEnvironment _webHostEnvironment;
        private readonly IServer _server;
        private readonly DataDirectoryProvider _dataDirectoryProvider;
        private readonly ConcurrentDictionary<string, IBrowser> _browsers = new();
        private readonly ConcurrentDictionary<string, IPage> _pages = new();
        private readonly ConcurrentDictionary<string, byte[]> _lastSuccessfulFrames = new();
        private readonly SemaphoreSlim _browserSemaphore = new(1, 1);
        private bool _disposed = false;

        public Service_FrameEngine_Puppeteer(
            IServiceScopeFactory scopeFactory,
            Service_FrameEngine frameEngine,
            IConfiguration configuration,
            IWebHostEnvironment webHostEnvironment,
            IServer server,
            DataDirectoryProvider dataDirectoryProvider)
        {
            _scopeFactory = scopeFactory;
            _frameEngine = frameEngine;
            _configuration = configuration;
            _webHostEnvironment = webHostEnvironment;
            _server = server;
            _dataDirectoryProvider = dataDirectoryProvider;
        }

        public async Task<byte[]> RenderFrame(
            Model_Frame_Layout frameLayout,
            Dictionary<string, object> sensorData,
            string virtualScreenDeviceId,
            int junctionId,
            int linkId,
            int screenId,
            Model_JunctionScreenLayout? screenConfig = null)
        {
            var browserKey = $"screen_{virtualScreenDeviceId}";
            var frameKey = $"frame_{virtualScreenDeviceId}_{screenId}";

            try
            {
                var page = await GetOrCreatePage(browserKey, virtualScreenDeviceId, frameLayout.Width, frameLayout.Height);

                // Brief wait for any real-time data updates
                await Task.Delay(100);

                // Use the simplified CaptureScreenshot method
                var screenshotBytes = await CaptureScreenshot(
                    virtualScreenDeviceId,
                    frameLayout.Width,
                    frameLayout.Height,
                    junctionId,
                    linkId,
                    screenId);

                // Store as last successful frame
                _lastSuccessfulFrames[frameKey] = screenshotBytes;

                return screenshotBytes;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Error rendering frame for screen {virtualScreenDeviceId}: {ex.Message}");

                // Return last successful frame if available
                if (_lastSuccessfulFrames.TryGetValue(frameKey, out var lastFrame))
                {
                    Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Returning last successful frame for screen {virtualScreenDeviceId}");
                    return lastFrame;
                }

                // Fallback to error frame
                return await CreateErrorFrame(frameLayout.Width, frameLayout.Height, ex.Message);
            }
        }

        public async Task<byte[]> GenerateThumbnail(Model_Frame_Layout frameLayout, string virtualScreenDeviceId, int width = 300, int height = 200)
        {
            var browserKey = $"thumbnail_{virtualScreenDeviceId}";
            var frameKey = $"thumbnail_{virtualScreenDeviceId}";

            try
            {
                var page = await GetOrCreatePage(browserKey, virtualScreenDeviceId, width, height);

                var screenshotBytes = await page.ScreenshotDataAsync(new ScreenshotOptions
                {
                    Type = ScreenshotType.Png,
                    FullPage = false
                });

                // Store as last successful thumbnail
                _lastSuccessfulFrames[frameKey] = screenshotBytes;

                return screenshotBytes;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Error generating thumbnail for screen {virtualScreenDeviceId}: {ex.Message}");

                // Return last successful thumbnail if available
                if (_lastSuccessfulFrames.TryGetValue(frameKey, out var lastFrame))
                {
                    Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Returning last successful thumbnail for screen {virtualScreenDeviceId}");
                    return lastFrame;
                }

                return await CreateErrorFrame(width, height, ex.Message);
            }
        }

        private async Task<IPage> GetOrCreatePage(string browserKey, string virtualScreenDeviceId, int width, int height)
        {
            // Check if page exists and is valid
            if (_pages.TryGetValue(browserKey, out var existingPage))
            {
                if (!existingPage.IsClosed)
                {
                    // Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Reusing existing page for key: {browserKey}");
                    return existingPage;
                }
                else
                {
                    // Remove closed page
                    Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Removing closed page for key: {browserKey}");
                    _pages.TryRemove(browserKey, out _);
                }
            }

            await _browserSemaphore.WaitAsync();
            try
            {
                // Double-check after acquiring lock
                if (_pages.TryGetValue(browserKey, out var existingPageLocked) && !existingPageLocked.IsClosed)
                {
                    Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Reusing existing page (locked) for key: {browserKey}");
                    return existingPageLocked;
                }

                Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Creating new page for key: {browserKey}");

                var browser = await GetOrCreateBrowser(browserKey);
                IPage page = null;

                try
                {
                    page = await browser.NewPageAsync();
                    Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Page created successfully for key: {browserKey}");

                    // Set viewport to exact dimensions
                    await page.SetViewportAsync(new ViewPortOptions
                    {
                        Width = width,
                        Height = height,
                        DeviceScaleFactor = 1.0,
                        IsMobile = false,
                        HasTouch = false
                    });
                    Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Viewport set to {width}x{height} for key: {browserKey}");

                    var virtualScreenUrl = GetVirtualScreenFullscreenUrl(virtualScreenDeviceId);
                    Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Loading virtual screen fullscreen URL: {virtualScreenUrl}");

                    try
                    {
                        await page.GoToAsync(virtualScreenUrl, new NavigationOptions
                        {
                            WaitUntil = new[] { WaitUntilNavigation.Load },
                            Timeout = 15000
                        });

                        // Inject CSS to ensure content is flush to viewport edges
                        await page.AddStyleTagAsync(new AddTagOptions
                        {
                            Content = @"
                                html, body {
                                    margin: 0 !important;
                                    padding: 0 !important;
                                    width: 100% !important;
                                    height: 100% !important;
                                    overflow: hidden !important;
                                    position: fixed !important;
                                    top: 0 !important;
                                    left: 0 !important;
                                }
                                [data-testid='virtual-screen-container'] {
                                    position: fixed !important;
                                    top: 0 !important;
                                    left: 0 !important;
                                    margin: 0 !important;
                                    padding: 0 !important;
                                }
                            "
                        });

                        // Wait for virtual screen container to load
                        try
                        {
                            await page.WaitForSelectorAsync("[data-testid='virtual-screen-container']", new WaitForSelectorOptions
                            {
                                Timeout = 10000
                            });
                            Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Virtual screen container found for key: {browserKey}");

                            // Wait for canvas (Rive) to render
                            await page.WaitForSelectorAsync("canvas", new WaitForSelectorOptions
                            {
                                Timeout = 10000
                            });
                            Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Canvas element found for key: {browserKey}");
                        }
                        catch (Exception selectorEx)
                        {
                            Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Selector wait failed for key {browserKey}: {selectorEx.Message}");
                        }

                        // Additional wait for Rive content to fully render
                        await Task.Delay(2000);

                        Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Successfully navigated to virtual screen fullscreen URL for key: {browserKey}");
                    }
                    catch (Exception navEx)
                    {
                        Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Navigation failed for {browserKey}: {navEx.Message}");

                        // Fallback: Create a properly sized placeholder
                        var fallbackHtml = $@"
                <html>
                    <head>
                        <title>Virtual Screen {virtualScreenDeviceId}</title>
                        <style>
                            html, body {{
                                margin: 0;
                                padding: 0;
                                width: {width}px;
                                height: {height}px;
                                background: #000;
                                color: #fff;
                                font-family: Arial;
                                overflow: hidden;
                            }}
                            .container {{
                                width: {width}px;
                                height: {height}px;
                                display: flex;
                                flex-direction: column;
                                justify-content: center;
                                align-items: center;
                                text-align: center;
                            }}
                        </style>
                    </head>
                    <body>
                        <div class='container' data-testid='virtual-screen-container'>
                            <h1>Virtual Screen {virtualScreenDeviceId}</h1>
                            <p>Waiting for content...</p>
                            <div style='width:100px;height:100px;background:#333;margin-top:20px;'></div>
                        </div>
                    </body>
                </html>";

                        await page.SetContentAsync(fallbackHtml);
                        Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Loaded fallback content for key: {browserKey}");
                    }

                    // Store the page in dictionary
                    _pages[browserKey] = page;
                    Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Page stored successfully in _pages dictionary for key: {browserKey}");

                    return page;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Critical error creating page for key {browserKey}: {ex.Message}");

                    // Clean up page if it was created but failed
                    if (page != null && !page.IsClosed)
                    {
                        try
                        {
                            await page.CloseAsync();
                        }
                        catch (Exception closeEx)
                        {
                            Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Error closing failed page: {closeEx.Message}");
                        }
                    }

                    throw;
                }
            }
            finally
            {
                _browserSemaphore.Release();
            }
        }

        private string GetVirtualScreenFullscreenUrl(string virtualScreenDeviceId)
        {
            try
            {
                // Get the actual address the server is listening on
                var addresses = _server.Features.Get<IServerAddressesFeature>()?.Addresses;
                if (addresses != null && addresses.Count > 0)
                {
                    var serverAddress = addresses.First();
                    var baseUrl = serverAddress.Replace("0.0.0.0", "localhost").Replace("*", "localhost");
                    Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Using actual server address: {baseUrl}");

                    // Use dedicated fullscreen route
                    return $"{baseUrl}/device/{virtualScreenDeviceId}/virtual-screen/fullscreen";
                }

                // Fallback: Try configuration sources
                var aspnetUrls = Environment.GetEnvironmentVariable("ASPNETCORE_URLS");
                if (!string.IsNullOrEmpty(aspnetUrls))
                {
                    var firstUrl = aspnetUrls.Split(';')[0];
                    var baseUrl = firstUrl.Replace("0.0.0.0", "localhost").Replace("*", "localhost");
                    Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Using ASPNETCORE_URLS: {baseUrl}");

                    return $"{baseUrl}/device/{virtualScreenDeviceId}/virtual-screen/fullscreen";
                }

                var configUrls = _configuration["urls"];
                if (!string.IsNullOrEmpty(configUrls))
                {
                    var firstUrl = configUrls.Split(';')[0];
                    var baseUrl = firstUrl.Replace("0.0.0.0", "localhost").Replace("*", "localhost");
                    Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Using config urls: {baseUrl}");

                    return $"{baseUrl}/device/{virtualScreenDeviceId}/virtual-screen/fullscreen";
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Error constructing virtual screen URL: {ex.Message}");
            }

            // Final fallback
            Console.WriteLine("[SERVICE_FRAMEENGINE_PUPPETEER] Using final fallback URL");
            return $"http://localhost:7180/device/{virtualScreenDeviceId}/virtual-screen/fullscreen";
        }

        private async Task<IBrowser> GetOrCreateBrowser(string browserKey)
        {
            if (_browsers.TryGetValue(browserKey, out var existingBrowser) && existingBrowser.IsConnected)
            {
                return existingBrowser;
            }

            Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Creating new browser for key: {browserKey}");

            try
            {
                // Download Chromium if not already present
                var browserFetcher = new BrowserFetcher();

                // On Linux, try to detect and use system Chrome first
                string executablePath = null;

                if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
                {
                    Console.WriteLine("[SERVICE_FRAMEENGINE_PUPPETEER] Linux detected, checking for system Chrome");

                    var systemChromePaths = new[]
                    {
                        "/usr/bin/google-chrome",
                        "/usr/bin/google-chrome-stable",
                        "/usr/bin/chromium",
                        "/usr/bin/chromium-browser",
                        "/snap/bin/chromium",
                        "/usr/bin/chrome"
                    };

                    executablePath = systemChromePaths.FirstOrDefault(File.Exists);

                    if (executablePath != null)
                    {
                        Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Using system Chrome: {executablePath}");
                    }
                    else
                    {
                        Console.WriteLine("[SERVICE_FRAMEENGINE_PUPPETEER] No system Chrome found, downloading PuppeteerSharp Chrome");
                        await browserFetcher.DownloadAsync();
                    }
                }
                else
                {
                    // Windows/macOS - use downloaded Chrome
                    await browserFetcher.DownloadAsync();
                }

                var launchOptions = new LaunchOptions
                {
                    Headless = true,
                    Args = GetChromeArgs(),
                    DefaultViewport = new ViewPortOptions
                    {
                        Width = 1920,
                        Height = 1080
                    }
                };

                // Set executable path if we found system Chrome
                if (executablePath != null)
                {
                    launchOptions.ExecutablePath = executablePath;
                }

                var browser = await Puppeteer.LaunchAsync(launchOptions);

                _browsers.TryRemove(browserKey, out _);
                _browsers[browserKey] = browser;

                Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Browser launched successfully for key: {browserKey}");
                return browser;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Failed to launch browser: {ex.Message}");
                throw;
            }
        }

        private string[] GetChromeArgs()
        {
            var args = new List<string>
            {
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-extensions",
                "--disable-plugins",
                "--disable-web-security",
                "--disable-features=TranslateUI",
                "--disable-ipc-flooding-protection",
                "--disable-renderer-backgrounding",
                "--disable-backgrounding-occluded-windows",
                "--disable-client-side-phishing-detection",
                "--disable-component-extensions-with-background-pages",
                "--disable-default-apps",
                "--disable-hang-monitor",
                "--disable-popup-blocking",
                "--disable-prompt-on-repost",
                "--disable-sync",
                "--metrics-recording-only",
                "--no-first-run",
                "--safebrowsing-disable-auto-update",
                "--enable-automation",
                "--password-store=basic",
                "--use-mock-keychain",
                "--hide-scrollbars",
                "--mute-audio",
                "--memory-pressure-off",
                "--max_old_space_size=512"
            };

            // Additional args for ARM architecture
            if (RuntimeInformation.ProcessArchitecture == Architecture.Arm64)
            {
                Console.WriteLine("[SERVICE_FRAMEENGINE_PUPPETEER] ARM64 detected, adding ARM-specific Chrome args");
                args.AddRange(new[]
                {
                    "--single-process",
                    "--disable-software-rasterizer",
                    "--disable-background-networking",
                    "--disable-background-timer-throttling",
                    "--disable-features=VizDisplayCompositor"
                });
            }

            return args.ToArray();
        }

        public async Task CloseBrowser(string virtualScreenDeviceId)
        {
            var browserKey = $"screen_{virtualScreenDeviceId}";
            var thumbnailBrowserKey = $"thumbnail_{virtualScreenDeviceId}";

            await CloseBrowserByKey(browserKey);
            await CloseBrowserByKey(thumbnailBrowserKey);

            // Clean up last successful frames
            var frameKey = $"frame_{virtualScreenDeviceId}";
            var thumbnailKey = $"thumbnail_{virtualScreenDeviceId}";
            _lastSuccessfulFrames.TryRemove(frameKey, out _);
            _lastSuccessfulFrames.TryRemove(thumbnailKey, out _);
        }

        private async Task CloseBrowserByKey(string browserKey)
        {
            try
            {
                if (_pages.TryRemove(browserKey, out var page))
                {
                    if (!page.IsClosed)
                    {
                        await page.CloseAsync();
                    }
                }

                if (_browsers.TryRemove(browserKey, out var browser))
                {
                    if (browser.IsConnected)
                    {
                        await browser.CloseAsync();
                    }
                }

                Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Closed browser for key: {browserKey}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Error closing browser {browserKey}: {ex.Message}");
            }
        }

        private async Task<byte[]> CreateErrorFrame(int width, int height, string errorMessage)
        {
            try
            {
                // Create a simple error page in memory
                var browser = await Puppeteer.LaunchAsync(new LaunchOptions
                {
                    Headless = true,
                    Args = new[] { "--no-sandbox", "--disable-dev-shm-usage" }
                });
                var page = await browser.NewPageAsync();

                await page.SetViewportAsync(new ViewPortOptions { Width = width, Height = height });

                var html = $@"
                <html>
                <head>
                    <style>
                        body {{ 
                            margin: 0; 
                            padding: 20px; 
                            background: #ff0000; 
                            color: white; 
                            font-family: Arial, sans-serif;
                            display: flex;
                            flex-direction: column;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            text-align: center;
                            box-sizing: border-box;
                        }}
                        .error {{ font-size: {Math.Min(width, height) / 20}px; margin-bottom: 10px; }}
                        .message {{ font-size: {Math.Min(width, height) / 40}px; word-wrap: break-word; }}
                    </style>
                </head>
                <body>
                    <div class='error'>⚠ Frame Error</div>
                    <div class='message'>{System.Web.HttpUtility.HtmlEncode(errorMessage)}</div>
                </body>
                </html>";

                await page.SetContentAsync(html);
                var errorBytes = await page.ScreenshotDataAsync(new ScreenshotOptions
                {
                    Type = ScreenshotType.Png,
                    FullPage = false
                });

                await browser.CloseAsync();
                return errorBytes;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Error creating error frame: {ex.Message}");
                // Return minimal 1x1 PNG as absolute fallback
                return CreateMinimalPng();
            }
        }

        private byte[] CreateMinimalPng()
        {
            // Minimal 1x1 red PNG
            return new byte[] {
                0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
                0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
                0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
                0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0x00, 0x00, 0x00,
                0x01, 0x00, 0x01, 0x5C, 0xC2, 0x5D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
                0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
            };
        }

        public void Dispose()
        {
            if (_disposed) return;

            Console.WriteLine("[SERVICE_FRAMEENGINE_PUPPETEER] Disposing browser instances...");

            var closeTasks = _browsers.Keys.Select(CloseBrowserByKey).ToArray();
            try
            {
                Task.WhenAll(closeTasks).GetAwaiter().GetResult();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Error during disposal: {ex.Message}");
            }

            _lastSuccessfulFrames.Clear();
            _browserSemaphore.Dispose();
            _disposed = true;
        }

        public object GetBrowserMetrics()
        {
            return new
            {
                ActiveBrowsers = _browsers.Count(kvp => kvp.Value.IsConnected),
                TotalBrowsers = _browsers.Count,
                ActivePages = _pages.Count(kvp => !kvp.Value.IsClosed),
                TotalPages = _pages.Count,
                CachedFrames = _lastSuccessfulFrames.Count,
                BrowserKeys = _browsers.Keys.ToArray(),
                PageKeys = _pages.Keys.ToArray(),
                DetectedBaseUrl = GetVirtualScreenFullscreenUrl("test")
            };
        }

        public async Task<bool> RefreshPage(string virtualScreenDeviceId)
        {
            var browserKey = $"screen_{virtualScreenDeviceId}";

            try
            {
                if (_pages.TryGetValue(browserKey, out var page) && !page.IsClosed)
                {
                    await page.ReloadAsync(new NavigationOptions
                    {
                        WaitUntil = new[] { WaitUntilNavigation.Load },
                        Timeout = 15000
                    });

                    Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Refreshed page for {virtualScreenDeviceId}");
                    return true;
                }
                return false;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Error refreshing page for {virtualScreenDeviceId}: {ex.Message}");
                return false;
            }
        }

        public async Task<byte[]> CaptureScreenshot(string virtualScreenDeviceId, int width, int height, int junctionId = 0, int linkId = 0, int originalScreenId = 0)
        {
            var browserKey = $"screen_{virtualScreenDeviceId}";
            var frameKey = $"frame_{virtualScreenDeviceId}";

            try
            {
                // Get existing page or create new one
                IPage page;
                if (_pages.TryGetValue(browserKey, out var existingPage) && !existingPage.IsClosed)
                {
                    page = existingPage;
                }
                else
                {
                    page = await GetOrCreatePage(browserKey, virtualScreenDeviceId, width, height);
                }

                // Ensure viewport matches target dimensions
                await page.SetViewportAsync(new ViewPortOptions
                {
                    Width = width,
                    Height = height,
                    DeviceScaleFactor = 1.0,
                    IsMobile = false,
                    HasTouch = false
                });

                // Small delay for rendering updates
                await Task.Delay(200);

                // Take screenshot of exact viewport size
                var screenshotBytes = await page.ScreenshotDataAsync(new ScreenshotOptions
                {
                    Type = ScreenshotType.Png,
                    FullPage = false,
                    OptimizeForSpeed = false
                });

                // Store as last successful frame
                _lastSuccessfulFrames[frameKey] = screenshotBytes;

                // Save to disk if we have valid IDs
                if (junctionId > 0 && originalScreenId > 0)
                {
                    await SaveFrameToDisk(junctionId, linkId, originalScreenId, screenshotBytes);
                }

                return screenshotBytes;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Error capturing screenshot: {ex.Message}");

                // Return last successful frame or error frame
                if (_lastSuccessfulFrames.TryGetValue(frameKey, out var lastFrame))
                {
                    Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Returning cached frame for {virtualScreenDeviceId}");
                    return lastFrame;
                }

                return await CreateErrorFrame(width, height, ex.Message);
            }
        }

        private async Task SaveFrameToDisk(int junctionId, int linkId, int originalScreenId, byte[] frameBytes)
        {
            try
            {
                var framesDirectory = Path.Combine(_dataDirectoryProvider.DataDirectory, "frameengine", "frames");
                Directory.CreateDirectory(framesDirectory);

                var filename = $"junction-{junctionId}-link-{linkId}-screen-{originalScreenId}.png";
                var filePath = Path.Combine(framesDirectory, filename);

                await File.WriteAllBytesAsync(filePath, frameBytes);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_FRAMEENGINE_PUPPETEER] Error saving frame: {ex.Message}");
            }
        }
    }
}