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
using JunctionRelayServer.Utils;

namespace JunctionRelayServer.Controllers
{
    /// <summary>
    /// Proxies requests to a remote JunctionRelay Server for the shared FrameEngine UI.
    /// Matches XSD's apiHandlers_cloud.js proxy endpoints so the "JunctionRelay Server" tab works.
    /// </summary>
    [ApiController]
    [Route("api")]
    public class Controller_LocalServer_Proxy : ControllerBase
    {
        private readonly IService_Settings _settingsService;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly DatabasePathProvider _dbPathProvider;
        private readonly IWebHostEnvironment _webHostEnvironment;

        public Controller_LocalServer_Proxy(
            IService_Settings settingsService,
            IHttpClientFactory httpClientFactory,
            DatabasePathProvider dbPathProvider,
            IWebHostEnvironment webHostEnvironment)
        {
            _settingsService = settingsService;
            _httpClientFactory = httpClientFactory;
            _dbPathProvider = dbPathProvider;
            _webHostEnvironment = webHostEnvironment;
        }

        // ============================================================================
        // PROXY — Layout List
        // ============================================================================

        /// <summary>GET /api/localserver/proxy/frameengine — proxy layout list from remote server</summary>
        [HttpGet("localserver/proxy/frameengine")]
        public async Task<IActionResult> ProxyFrameEngineLayouts()
        {
            try
            {
                var (url, port, error) = await GetServerConfigAsync();
                if (error != null) return error;

                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(10);

                var response = await client.GetAsync($"http://{url}:{port}/api/frameengine");
                if (!response.IsSuccessStatusCode)
                    return StatusCode((int)response.StatusCode, new { error = "Failed to fetch layouts from remote server" });

                var content = await response.Content.ReadAsStringAsync();
                return Content(content, "application/json");
            }
            catch (HttpRequestException)
            {
                return StatusCode(503, new { error = "Remote server is unreachable" });
            }
            catch (TaskCanceledException)
            {
                return StatusCode(504, new { error = "Remote server request timed out" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // ============================================================================
        // PROXY — Thumbnail
        // ============================================================================

        /// <summary>GET /api/localserver/proxy/frameengine/{layoutId}/thumbnail — proxy thumbnail from remote server</summary>
        [HttpGet("localserver/proxy/frameengine/{layoutId}/thumbnail")]
        public async Task<IActionResult> ProxyThumbnail(string layoutId)
        {
            try
            {
                var (url, port, error) = await GetServerConfigAsync();
                if (error != null) return error;

                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(10);

                var response = await client.GetAsync($"http://{url}:{port}/api/frameengine/{layoutId}/thumbnail");
                if (!response.IsSuccessStatusCode)
                    return NotFound();

                var bytes = await response.Content.ReadAsByteArrayAsync();
                var contentType = response.Content.Headers.ContentType?.MediaType ?? "image/png";
                return File(bytes, contentType);
            }
            catch (Exception)
            {
                return NotFound();
            }
        }

        // ============================================================================
        // IMPORT FROM REMOTE — Download ZIP
        // ============================================================================

        /// <summary>POST /api/layouts/import-from-remote — download layout ZIP from remote server</summary>
        [HttpPost("layouts/import-from-remote")]
        public async Task<IActionResult> ImportFromRemote([FromBody] ImportFromRemoteRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.LayoutId))
                    return BadRequest(new { error = "layoutId is required" });

                var (url, port, error) = await GetServerConfigAsync();
                if (error != null) return error;

                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromMinutes(5);

                var zipBytes = await client.GetByteArrayAsync(
                    $"http://{url}:{port}/api/frameengine/{request.LayoutId}/export-standalone");

                var downloadsDir = GetDownloadsPath();
                var safeName = string.Concat((request.LayoutName ?? $"remote-{request.LayoutId}")
                    .Split(Path.GetInvalidFileNameChars()));
                if (string.IsNullOrEmpty(safeName)) safeName = $"remote-{request.LayoutId}";

                var filename = $"{safeName}.zip";
                var counter = 1;
                while (System.IO.File.Exists(Path.Combine(downloadsDir, filename)))
                {
                    filename = $"{safeName}_{counter}.zip";
                    counter++;
                }

                var filePath = Path.Combine(downloadsDir, filename);

                // Path traversal check
                var resolvedPath = Path.GetFullPath(filePath);
                var resolvedDir = Path.GetFullPath(downloadsDir);
                if (!resolvedPath.StartsWith(resolvedDir))
                    return BadRequest(new { error = "Invalid file path" });

                await System.IO.File.WriteAllBytesAsync(filePath, zipBytes);

                Console.WriteLine($"[LOCAL_SERVER_PROXY] Downloaded remote layout to: {filePath}");

                return Ok(new { success = true, path = filePath, filename });
            }
            catch (HttpRequestException ex)
            {
                return StatusCode(503, new { error = $"Remote server unreachable: {ex.Message}" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // ============================================================================
        // HELPERS
        // ============================================================================

        private async Task<(string url, string port, IActionResult? error)> GetServerConfigAsync()
        {
            var settings = await _settingsService.GetAllSettingsAsync();
            settings.TryGetValue("localServerUrl", out var url);
            settings.TryGetValue("localServerPort", out var port);

            if (string.IsNullOrWhiteSpace(url))
                return ("", "", BadRequest(new { error = "Remote server URL not configured. Set localServerUrl in Settings." }));

            return (url, port ?? "7180", null);
        }

        private string GetDownloadsPath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath)
                          ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            var downloadsDir = Path.Combine(dataDir, "frameengine", "downloads");
            Directory.CreateDirectory(downloadsDir);
            return downloadsDir;
        }

        // ============================================================================
        // REQUEST DTOs
        // ============================================================================

        public class ImportFromRemoteRequest
        {
            public string LayoutId { get; set; } = string.Empty;
            public string? LayoutName { get; set; }
        }
    }
}
