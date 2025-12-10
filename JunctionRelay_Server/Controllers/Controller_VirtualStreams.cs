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

using Microsoft.AspNetCore.Mvc;
using JunctionRelayServer.Services;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Controllers
{
    /// <summary>
    /// Controller for virtual device streaming endpoints
    /// Handles MJPEG streaming for virtual screens created by Blit/Streaming mode junctions
    /// </summary>
    [Route("device")]
    [ApiController]
    public class Controller_VirtualStreams : ControllerBase
    {
        private readonly Service_Stream_Manager_Virtual _virtualStreamManager;
        private readonly Service_Stream_Manager_MJPEG _mjpegService;
        private readonly Service_Database_Manager_FrameEngine _frameEngineDb;
        private readonly Service_Database_Manager_JunctionLinks _junctionLinkDb;
        private readonly Service_Database_Manager_Junctions _junctionDb;

        public Controller_VirtualStreams(
            Service_Stream_Manager_Virtual virtualStreamManager,
            Service_Stream_Manager_MJPEG mjpegService,
            Service_Database_Manager_FrameEngine frameEngineDb,
            Service_Database_Manager_JunctionLinks junctionLinkDb,
            Service_Database_Manager_Junctions junctionDb)
        {
            _virtualStreamManager = virtualStreamManager;
            _mjpegService = mjpegService;
            _frameEngineDb = frameEngineDb;
            _junctionLinkDb = junctionLinkDb;
            _junctionDb = junctionDb;
        }

        /// <summary>
        /// MJPEG streaming endpoint for virtual devices
        /// Streams frames from CDP screencast subprocess via MJPEG protocol
        /// </summary>
        /// <param name="virtualDeviceId">Virtual device ID (negative number, e.g., -10010)</param>
        /// <param name="cancellationToken">Cancellation token</param>
        [HttpGet("{virtualDeviceId}/stream")]
        public async Task StreamMJPEG(int virtualDeviceId, CancellationToken cancellationToken)
        {
            Console.WriteLine($"[CONTROLLER_VIRTUAL_STREAMS] Stream request for virtual device {virtualDeviceId}");

            // Find the original screen ID from virtual device ID
            int? originalScreenId = null;
            foreach (var stream in _virtualStreamManager.GetActiveStreams())
            {
                var virtualDevId = _virtualStreamManager.GetBlitModeVirtualDeviceId(stream.ScreenId);
                if (virtualDevId == virtualDeviceId)
                {
                    originalScreenId = stream.ScreenId;
                    break;
                }
            }

            if (!originalScreenId.HasValue)
            {
                Response.StatusCode = 404;
                await Response.WriteAsync($"Virtual device {virtualDeviceId} not found or not streaming", cancellationToken);
                Console.WriteLine($"[CONTROLLER_VIRTUAL_STREAMS] Virtual device {virtualDeviceId} not found");
                return;
            }

            Console.WriteLine($"[CONTROLLER_VIRTUAL_STREAMS] Found original screen ID: {originalScreenId.Value}");

            // Get junction/link context
            var context = _virtualStreamManager.GetBlitModeContext(originalScreenId.Value);
            if (!context.HasValue)
            {
                Response.StatusCode = 500;
                await Response.WriteAsync($"Could not retrieve context for virtual device {virtualDeviceId}", cancellationToken);
                Console.WriteLine($"[CONTROLLER_VIRTUAL_STREAMS] Context not found for screen {originalScreenId.Value}");
                return;
            }

            var (junctionId, linkId, frameLayoutId) = context.Value;
            Console.WriteLine($"[CONTROLLER_VIRTUAL_STREAMS] Junction: {junctionId}, Link: {linkId}, FrameLayout: {frameLayoutId}");

            // Get frame layout
            Model_Frame_Layout? frameLayout = null;
            if (frameLayoutId > 0)
            {
                frameLayout = await _frameEngineDb.GetFrameLayoutByIdAsync(frameLayoutId);
            }

            if (frameLayout == null)
            {
                Response.StatusCode = 400;
                await Response.WriteAsync($"Frame layout {frameLayoutId} not found for virtual device {virtualDeviceId}", cancellationToken);
                Console.WriteLine($"[CONTROLLER_VIRTUAL_STREAMS] Frame layout {frameLayoutId} not found");
                return;
            }

            // Get screen override for additional config
            var screenLayoutOverrides = await _junctionLinkDb.GetJunctionScreenLayoutsByScreenIdAsync(junctionId, originalScreenId.Value);
            var screenOverride = screenLayoutOverrides.FirstOrDefault(o => o.DeviceScreenId == originalScreenId.Value);

            // Get junction for quality settings and FPS from screen override
            var junction = await _junctionDb.GetJunctionByIdAsync(junctionId);
            int jpegQuality = junction?.StreamingJpegQuality ?? 85;
            int targetFps = screenOverride?.StreamingFps ?? 30; // Per-screen FPS (default: 30)

            Console.WriteLine($"[CONTROLLER_VIRTUAL_STREAMS] Starting MJPEG stream: {frameLayout.Width}x{frameLayout.Height}, Quality: {jpegQuality}, FPS: {targetFps}");

            // Set up MJPEG stream response headers
            Response.StatusCode = 200;
            Response.ContentType = "multipart/x-mixed-replace; boundary=frame";
            Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
            Response.Headers["Pragma"] = "no-cache";
            Response.Headers["Expires"] = "0";

            try
            {
                // Stream frames from CDP subprocess
                await foreach (var frame in _mjpegService.GenerateMJPEGStream(
                    originalScreenId.Value,
                    frameLayout,
                    junctionId,
                    linkId,
                    screenOverride,
                    jpegQuality,
                    targetFps,
                    cancellationToken))
                {
                    await Response.Body.WriteAsync(frame, cancellationToken);
                }
            }
            catch (OperationCanceledException)
            {
                // Client disconnected - normal
                Console.WriteLine($"[CONTROLLER_VIRTUAL_STREAMS] Client disconnected from virtual device {virtualDeviceId} stream");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CONTROLLER_VIRTUAL_STREAMS] Error streaming MJPEG for virtual device {virtualDeviceId}: {ex.Message}");
            }
        }
    }
}
