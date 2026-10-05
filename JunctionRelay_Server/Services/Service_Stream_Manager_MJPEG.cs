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
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Threading.Tasks;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    public class Service_Stream_Manager_MJPEG
    {
        private readonly Service_Stream_Manager_Virtual _virtualStreamManager;
        private readonly ILogger<Service_Stream_Manager_MJPEG> _logger;

        public Service_Stream_Manager_MJPEG(
            Service_Stream_Manager_Virtual virtualStreamManager,
            ILogger<Service_Stream_Manager_MJPEG> logger)
        {
            _virtualStreamManager = virtualStreamManager;
            _logger = logger;
        }

        public async IAsyncEnumerable<byte[]> GenerateMJPEGStream(
            int originalScreenId,
            Model_Frame_Layout frameLayout,
            int junctionId,
            int linkId,
            Model_JunctionScreenLayout? screenOverride,
            int jpegQuality = 85,
            int targetFps = 30,
            [EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            _logger.LogInformation("Starting MJPEG stream for screen {ScreenId}, Quality: {Quality}, FPS: {Fps}",
                originalScreenId, jpegQuality, targetFps);

            var frameDelay = 1000.0 / targetFps;
            int frameCount = 0;
            var fpsTimer = Stopwatch.StartNew();

            while (!cancellationToken.IsCancellationRequested)
            {
                var frameTimer = Stopwatch.StartNew();
                var t0 = frameTimer.ElapsedMilliseconds;

                // Use optimized streaming capture - returns JPEG directly, no delays
                var jpegBytes = await _virtualStreamManager.CaptureFrameForStreamingMode(
                    originalScreenId,
                    frameLayout);
                var t1 = frameTimer.ElapsedMilliseconds;

                if (jpegBytes == null || jpegBytes.Length == 0)
                {
                    _logger.LogWarning("Empty frame from screen {ScreenId}", originalScreenId);
                    await Task.Delay(100, cancellationToken);
                    continue;
                }

                // Build MJPEG frame (jpegBytes is already JPEG - no conversion needed!)
                var frame = BuildMJPEGFrame(jpegBytes);
                var t2 = frameTimer.ElapsedMilliseconds;
                frameCount++;

                // Log stats every 30 frames (disabled for production)
                // if (frameCount % 30 == 0)
                // {
                //     var elapsed = fpsTimer.Elapsed.TotalSeconds;
                //     var actualFps = frameCount / elapsed;
                //     var avgFrameSize = jpegBytes.Length / 1024.0;
                //     var bandwidth = (jpegBytes.Length * 8 * actualFps) / 1_000_000.0;
                //
                //     _logger.LogInformation(
                //         "MJPEG Stream - Screen {ScreenId}: Frame {Count}, {Fps:F1} FPS, {Size:F1} KB/frame, {Bandwidth:F1} Mbps | Timing: Capture={CaptureMs}ms, Build={BuildMs}ms",
                //         originalScreenId, frameCount, actualFps, avgFrameSize, bandwidth, t1-t0, t2-t1);
                // }

                yield return frame;
                var t3 = frameTimer.ElapsedMilliseconds;

                // Frame rate limiting
                frameTimer.Stop();
                var totalFrameTime = frameTimer.ElapsedMilliseconds;

                // Log detailed timing every 30 frames (disabled for production)
                // if (frameCount % 30 == 0)
                // {
                //     _logger.LogInformation(
                //         "MJPEG Timing Detail - Frame {Count}: Capture={CaptureMs}ms, Build={BuildMs}ms, Yield={YieldMs}ms, Total={TotalMs}ms",
                //         frameCount, t1-t0, t2-t1, t3-t2, totalFrameTime);
                // }

                var sleepTime = (int)(frameDelay - totalFrameTime);
                if (sleepTime > 0)
                {
                    await Task.Delay(sleepTime, cancellationToken);
                }
            }

            _logger.LogInformation("MJPEG stream stopped for screen {ScreenId}. Total frames: {Count}",
                originalScreenId, frameCount);
        }

        private byte[] BuildMJPEGFrame(byte[] jpegData)
        {
            // MJPEG multipart format:
            // --frame\r\nContent-Type: image/jpeg\r\nContent-Length: {size}\r\n\r\n{jpeg}\r\n
            var boundary = "--frame\r\n";
            var contentType = "Content-Type: image/jpeg\r\n";
            var contentLength = $"Content-Length: {jpegData.Length}\r\n\r\n";

            var headerBytes = System.Text.Encoding.UTF8.GetBytes(boundary + contentType + contentLength);
            var endBytes = System.Text.Encoding.UTF8.GetBytes("\r\n");

            var frame = new byte[headerBytes.Length + jpegData.Length + endBytes.Length];
            Buffer.BlockCopy(headerBytes, 0, frame, 0, headerBytes.Length);
            Buffer.BlockCopy(jpegData, 0, frame, headerBytes.Length, jpegData.Length);
            Buffer.BlockCopy(endBytes, 0, frame, headerBytes.Length + jpegData.Length, endBytes.Length);

            return frame;
        }
    }
}
