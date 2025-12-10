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
using System.Diagnostics;
using System.Net.Http;

namespace JunctionRelayServer.Services
{
    /// <summary>
    /// High-performance Puppeteer service optimized for MJPEG streaming.
    /// Key differences from standard Puppeteer service:
    /// - No artificial delays
    /// - JPEG screenshots directly (no PNG conversion)
    /// - No disk I/O
    /// - Optimized for continuous high-framerate capture
    /// </summary>
    public class Service_FrameEngine_Puppeteer_Streaming : IDisposable
    {
        private readonly IServer _server;
        private readonly Service_FrameEngine _frameEngine;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ConcurrentDictionary<string, byte[]> _lastSuccessfulFrames = new();
        private readonly SemaphoreSlim _browserSemaphore = new(1, 1);

        // CDP Screencast subprocess fields (Node.js based capture)
        private readonly ConcurrentDictionary<string, Process> _captureProcesses = new();
        private readonly ConcurrentDictionary<string, int> _captureHttpPorts = new();
        private readonly ConcurrentDictionary<string, HttpClient> _captureHttpClients = new();
        private readonly ConcurrentDictionary<string, byte[]> _latestScreencastFrames = new();
        private readonly ConcurrentDictionary<string, SemaphoreSlim> _frameSemaphores = new();
        private readonly ConcurrentDictionary<string, int> _frameCounters = new();
        private readonly ConcurrentDictionary<string, DateTime> _captureStartTimes = new();

        private bool _disposed = false;

        public Service_FrameEngine_Puppeteer_Streaming(
            IServer server,
            Service_FrameEngine frameEngine,
            IServiceScopeFactory scopeFactory)
        {
            _server = server;
            _frameEngine = frameEngine;
            _scopeFactory = scopeFactory;
            Console.WriteLine("[SERVICE_PUPPETEER_STREAMING] Streaming-optimized Puppeteer service initialized");
        }

        /// <summary>
        /// Initialize Node.js CDP screencast capture subprocess (ONLY for MJPEG streaming)
        /// Uses proven Node.js POC for high-performance frame capture
        /// </summary>
        public async Task<byte[]> InitializeStreamingCapture(
            Model_Frame_Layout frameLayout,
            string virtualScreenDeviceId,
            int junctionId,
            int targetFps = 30,
            int jpegQuality = 85)
        {
            var browserKey = $"screen_{virtualScreenDeviceId}";

            // Build the URL to the virtual screen viewer
            var baseUrl = GetServerBaseUrl();
            var url = $"{baseUrl}/device/{virtualScreenDeviceId}/virtual-screen";

            Console.WriteLine($"[SERVICE_PUPPETEER_STREAMING] Starting CDP screencast subprocess for {browserKey}");
            Console.WriteLine($"[SERVICE_PUPPETEER_STREAMING] Target URL: {url}");
            Console.WriteLine($"[SERVICE_PUPPETEER_STREAMING] Viewport: {frameLayout.Width}x{frameLayout.Height}");
            Console.WriteLine($"[SERVICE_PUPPETEER_STREAMING] Target FPS: {targetFps}");
            Console.WriteLine($"[SERVICE_PUPPETEER_STREAMING] JPEG Quality: {jpegQuality}");

            // Parse virtualScreenDeviceId to int for port calculation
            if (!int.TryParse(virtualScreenDeviceId, out int virtualDeviceIdInt))
            {
                throw new ArgumentException($"Invalid virtual screen device ID: {virtualScreenDeviceId}");
            }

            // Start Node.js CDP capture subprocess
            await StartCaptureSubprocess(browserKey, url, frameLayout.Width, frameLayout.Height, virtualDeviceIdInt, targetFps, jpegQuality);

            // Wait for first frame to be available
            await Task.Delay(2000);  // Give Node.js time to start and capture first frame

            // Try to return first frame
            try
            {
                return await GetLatestScreencastFrame(browserKey);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_PUPPETEER_STREAMING] Warning: Could not get initial frame for {browserKey}: {ex.Message}");
                return CreateEmptyJpeg();
            }
        }

        /// <summary>
        /// Get the base URL of the server
        /// </summary>
        private string GetServerBaseUrl()
        {
            var addresses = _server.Features.Get<IServerAddressesFeature>()?.Addresses;
            if (addresses != null && addresses.Any())
            {
                var address = addresses.First();
                return address.Replace("[::]", "localhost").Replace("0.0.0.0", "localhost");
            }
            return "http://localhost:7180";
        }

        /// <summary>
        /// Start Node.js CDP screencast capture subprocess
        /// Launches cdp_screencast_capture.js with the target URL and parameters
        /// Port is calculated as 50000 + virtualScreenDeviceId for unique per-screen allocation
        /// </summary>
        private async Task StartCaptureSubprocess(string browserKey, string targetUrl, int width, int height, int virtualScreenDeviceId, int targetFps = 30, int jpegQuality = 85)
        {
            // Calculate predictable port based on virtual screen device ID (50000 + abs(virtualDeviceId))
            // Example: Virtual Device -10010 → Port 60010, Virtual Device -20003 → Port 70003
            // This ensures unique ports even when one junction has multiple screens
            int httpPort = 50000 + Math.Abs(virtualScreenDeviceId);

            Console.WriteLine($"[CDP_SUBPROCESS] Starting Node.js capture process for {browserKey}");
            Console.WriteLine($"[CDP_SUBPROCESS]   Virtual Device ID: {virtualScreenDeviceId}");
            Console.WriteLine($"[CDP_SUBPROCESS]   URL: {targetUrl}");
            Console.WriteLine($"[CDP_SUBPROCESS]   Size: {width}x{height}");
            Console.WriteLine($"[CDP_SUBPROCESS]   HTTP Port: {httpPort} (50000 + abs({virtualScreenDeviceId}))");
            Console.WriteLine($"[CDP_SUBPROCESS]   Target FPS: {targetFps}");
            Console.WriteLine($"[CDP_SUBPROCESS]   JPEG Quality: {jpegQuality}");

            var scriptPath = Path.Combine(AppContext.BaseDirectory, "Services", "cdp_screencast_capture.js");
            if (!File.Exists(scriptPath))
            {
                throw new FileNotFoundException($"CDP capture script not found: {scriptPath}");
            }

            var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "node",
                    Arguments = $"\"{scriptPath}\" \"{targetUrl}\" {width} {height} {httpPort} {jpegQuality} {targetFps}",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                }
            };

            // Capture output for debugging
            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                {
                    Console.WriteLine($"[CDP_SUBPROCESS:{browserKey}] {e.Data}");
                }
            };

            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                {
                    Console.WriteLine($"[CDP_SUBPROCESS:{browserKey}] ERROR: {e.Data}");
                }
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            _captureProcesses[browserKey] = process;
            _captureHttpPorts[browserKey] = httpPort;

            Console.WriteLine($"[CDP_SUBPROCESS] Process started for {browserKey} (PID: {process.Id})");

            // Wait for the process to signal it's ready
            await Task.Delay(3000);  // Give it time to launch Chrome and start screencast

            // Create HTTP client to consume the stream
            var httpClient = new HttpClient
            {
                Timeout = Timeout.InfiniteTimeSpan
            };
            _captureHttpClients[browserKey] = httpClient;

            // Start consuming frames from the HTTP stream in background
            _ = Task.Run(async () => await ConsumeFrameStream(browserKey, httpPort));

            Console.WriteLine($"[CDP_SUBPROCESS] Subprocess initialized for {browserKey}");
        }

        /// <summary>
        /// Consume frames from the Node.js HTTP MJPEG stream
        /// Runs continuously in the background
        /// </summary>
        private async Task ConsumeFrameStream(string browserKey, int httpPort)
        {
            var streamUrl = $"http://127.0.0.1:{httpPort}/stream";
            Console.WriteLine($"[CDP_STREAM] Connecting to {streamUrl} for {browserKey}");

            try
            {
                if (!_captureHttpClients.TryGetValue(browserKey, out var httpClient))
                {
                    Console.WriteLine($"[CDP_STREAM] ERROR: HTTP client not found for {browserKey}");
                    return;
                }

                using var response = await httpClient.GetAsync(streamUrl, HttpCompletionOption.ResponseHeadersRead);
                response.EnsureSuccessStatusCode();

                Console.WriteLine($"[CDP_STREAM] Connected to stream for {browserKey}");

                using var stream = await response.Content.ReadAsStreamAsync();
                var boundary = "--frame";
                var boundaryBytes = System.Text.Encoding.ASCII.GetBytes(boundary);

                while (!_disposed && _captureProcesses.ContainsKey(browserKey))
                {
                    // Read until we find the boundary
                    var frame = await ReadMjpegFrame(stream, boundaryBytes);
                    if (frame != null && frame.Length > 0)
                    {
                        _latestScreencastFrames[browserKey] = frame;
                        _frameCounters[browserKey] = (_frameCounters.TryGetValue(browserKey, out var count) ? count : 0) + 1;

                        // Log performance every 60 frames (disabled for production)
                        // if (_frameCounters[browserKey] % 60 == 0)
                        // {
                        //     Console.WriteLine($"[CDP_STREAM] {browserKey}: Received {_frameCounters[browserKey]} frames, latest size: {frame.Length / 1024.0:F1} KB");
                        // }
                    }
                }

                Console.WriteLine($"[CDP_STREAM] Stream consumer stopped for {browserKey}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CDP_STREAM] Error consuming stream for {browserKey}: {ex.Message}");
            }
        }

        /// <summary>
        /// Read a single MJPEG frame from the stream
        /// </summary>
        private async Task<byte[]?> ReadMjpegFrame(Stream stream, byte[] boundaryBytes)
        {
            try
            {
                // Read everything as binary to avoid StreamReader buffering issues
                var buffer = new byte[1];
                var lineBuffer = new List<byte>();
                int contentLength = 0;
                bool foundBoundary = false;
                bool inHeaders = false;

                // Read until we find the boundary
                while (!foundBoundary)
                {
                    var read = await stream.ReadAsync(buffer, 0, 1);
                    if (read == 0) return null;

                    lineBuffer.Add(buffer[0]);

                    // Check if we have a complete line (ends with \n)
                    if (buffer[0] == '\n' && lineBuffer.Count > 1)
                    {
                        var line = System.Text.Encoding.ASCII.GetString(lineBuffer.ToArray()).Trim();
                        if (line.StartsWith("--frame"))
                        {
                            foundBoundary = true;
                            inHeaders = true;
                        }
                        lineBuffer.Clear();
                    }
                }

                // Read headers until blank line
                lineBuffer.Clear();
                bool foundBlankLine = false;

                while (inHeaders && !foundBlankLine)
                {
                    var read = await stream.ReadAsync(buffer, 0, 1);
                    if (read == 0) return null;

                    lineBuffer.Add(buffer[0]);

                    // Check if we have a complete line
                    if (buffer[0] == '\n')
                    {
                        var line = System.Text.Encoding.ASCII.GetString(lineBuffer.ToArray()).Trim();

                        if (string.IsNullOrEmpty(line))
                        {
                            // Blank line - end of headers
                            foundBlankLine = true;
                        }
                        else if (line.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase))
                        {
                            var parts = line.Split(':');
                            if (parts.Length == 2 && int.TryParse(parts[1].Trim(), out var length))
                            {
                                contentLength = length;
                            }
                        }

                        lineBuffer.Clear();
                    }
                }

                if (contentLength == 0) return null;

                // Read the JPEG data (pure binary)
                var jpegData = new byte[contentLength];
                int totalRead = 0;
                while (totalRead < contentLength)
                {
                    var bytesRead = await stream.ReadAsync(jpegData, totalRead, contentLength - totalRead);
                    if (bytesRead == 0) return null;
                    totalRead += bytesRead;
                }

                return jpegData;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CDP_STREAM] Error reading MJPEG frame: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Get the latest screencast frame (non-blocking)
        /// Uses frame captured by Node.js CDP subprocess
        /// </summary>
        public async Task<byte[]> GetLatestScreencastFrame(string browserKey)
        {
            var frameKey = $"frame_{browserKey}";

            if (_disposed)
            {
                if (_lastSuccessfulFrames.TryGetValue(frameKey, out var cachedFrame))
                {
                    return cachedFrame;
                }
                throw new ObjectDisposedException(nameof(Service_FrameEngine_Puppeteer_Streaming));
            }

            try
            {
                // Check if we have a screencast frame available
                if (_latestScreencastFrames.TryGetValue(browserKey, out var latestFrame))
                {
                    // Cache the frame
                    _lastSuccessfulFrames[frameKey] = latestFrame;
                    return latestFrame;
                }

                // Wait for next frame (with longer timeout for initial frame)
                if (_frameSemaphores.TryGetValue(browserKey, out var semaphore))
                {
                    // Wait up to 500ms for a frame (enough time for screencast to start)
                    var gotFrame = await semaphore.WaitAsync(TimeSpan.FromMilliseconds(500));

                    if (gotFrame && _latestScreencastFrames.TryGetValue(browserKey, out latestFrame))
                    {
                        _lastSuccessfulFrames[frameKey] = latestFrame;
                        return latestFrame;
                    }
                }

                // Fallback: return cached frame if available (don't throw exception during streaming)
                if (_lastSuccessfulFrames.TryGetValue(frameKey, out var cachedFrame))
                {
                    // Silently return cached frame (no spam)
                    return cachedFrame;
                }

                // Return cached frame if we have one, otherwise throw (only log once on initial failure)
                if (_lastSuccessfulFrames.TryGetValue(frameKey, out var finalCachedFrame))
                {
                    return finalCachedFrame;
                }

                // Only log on first failure, not repeatedly
                if (!_lastSuccessfulFrames.ContainsKey(frameKey))
                {
                    Console.WriteLine($"[CDP_SCREENCAST] WARNING: No initial screencast frames available for {browserKey}");
                }

                throw new InvalidOperationException($"No screencast frames available for {browserKey}");
            }
            catch (Exception ex)
            {
                // Don't spam logs for repeated failures
                if (!_lastSuccessfulFrames.ContainsKey(frameKey))
                {
                    Console.WriteLine($"[CDP_SCREENCAST] Error getting screencast frame for {browserKey}: {ex.Message}");
                }

                // Return cached frame if available
                if (_lastSuccessfulFrames.TryGetValue(frameKey, out var lastFrame))
                {
                    return lastFrame;
                }

                throw;
            }
        }

        /// <summary>
        /// Create a 1x1 pixel black JPEG as placeholder
        /// </summary>
        private byte[] CreateEmptyJpeg()
        {
            // Minimal 1x1 black JPEG (Base64: /9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wA8f/9k=)
            return Convert.FromBase64String("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wA8f/9k=");
        }

        /// <summary>
        /// Close browser/subprocess for a specific key
        /// </summary>
        public async Task CloseBrowser(string browserKey)
        {
            // Kill Node.js capture subprocess
            if (_captureProcesses.TryRemove(browserKey, out var process))
            {
                try
                {
                    if (!process.HasExited)
                    {
                        process.Kill(true);  // Kill process tree
                        Console.WriteLine($"[CDP_SUBPROCESS] Killed capture process for {browserKey}");
                    }
                    process.Dispose();
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[CDP_SUBPROCESS] Error killing process for {browserKey}: {ex.Message}");
                }
            }

            // Cleanup HTTP client
            if (_captureHttpClients.TryRemove(browserKey, out var httpClient))
            {
                httpClient.Dispose();
            }

            // Cleanup subprocess-related data
            _captureHttpPorts.TryRemove(browserKey, out _);
            _latestScreencastFrames.TryRemove(browserKey, out _);
            _frameCounters.TryRemove(browserKey, out _);
            _captureStartTimes.TryRemove(browserKey, out _);
            _lastSuccessfulFrames.TryRemove($"frame_{browserKey}", out _);

            Console.WriteLine($"[SERVICE_PUPPETEER_STREAMING] Closed capture for {browserKey}");

            await Task.CompletedTask;
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;

            Console.WriteLine("[SERVICE_PUPPETEER_STREAMING] Disposing...");

            // Kill all Node.js capture subprocesses
            foreach (var kvp in _captureProcesses)
            {
                try
                {
                    if (!kvp.Value.HasExited)
                    {
                        kvp.Value.Kill(true);
                        Console.WriteLine($"[CDP_SUBPROCESS] Killed capture process for {kvp.Key}");
                    }
                    kvp.Value.Dispose();
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[CDP_SUBPROCESS] Error killing process for {kvp.Key}: {ex.Message}");
                }
            }

            // Dispose all HTTP clients
            foreach (var httpClient in _captureHttpClients.Values)
            {
                try
                {
                    httpClient.Dispose();
                }
                catch { }
            }

            // Clear subprocess collections
            _captureProcesses.Clear();
            _captureHttpPorts.Clear();
            _captureHttpClients.Clear();
            _latestScreencastFrames.Clear();
            _frameCounters.Clear();
            _captureStartTimes.Clear();
            _lastSuccessfulFrames.Clear();
            _browserSemaphore.Dispose();

            Console.WriteLine("[SERVICE_PUPPETEER_STREAMING] Disposed");
        }
    }
}
