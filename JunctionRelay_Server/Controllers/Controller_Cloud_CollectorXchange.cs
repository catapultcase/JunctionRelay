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

namespace JunctionRelayServer.Controllers
{
    /// <summary>
    /// Controller for proxying CollectorXchange marketplace API calls to JunctionRelay Cloud.
    /// Mirrors the pattern used by Controller_Cloud_FrameXchange.
    /// </summary>
    [ApiController]
    [Route("api/cloud/collectorxchange")]
    public class Controller_Cloud_CollectorXchange : ControllerBase
    {
        private readonly Service_CloudSessionStore _sessionStore;
        private readonly IHttpClientFactory _httpClientFactory;

        private string CloudBaseUrl =>
            Environment.GetEnvironmentVariable("CLOUD_BACKEND_URL")?.TrimEnd('/') ?? "https://api.junctionrelay.com";

        public Controller_Cloud_CollectorXchange(
            Service_CloudSessionStore sessionStore,
            IHttpClientFactory httpClientFactory)
        {
            _sessionStore = sessionStore;
            _httpClientFactory = httpClientFactory;
        }

        private async Task<(HttpClient? client, IActionResult? error)> CreateAuthenticatedClientAsync()
        {
            var token = await _sessionStore.GetValidAccessTokenAsync();
            if (string.IsNullOrEmpty(token))
            {
                return (null, Unauthorized(new { success = false, error = "Not authenticated with JunctionRelay Cloud" }));
            }

            var client = _httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
            return (client, null);
        }

        // ============================================================================
        // LIST COLLECTORS
        // ============================================================================

        /// <summary>
        /// GET /api/cloud/collectorxchange — list approved collectors from CollectorXchange
        /// Proxies to Cloud API: GET /collectorxchange
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> GetCollectors()
        {
            try
            {
                var (client, authError) = await CreateAuthenticatedClientAsync();
                if (authError != null) return authError;

                var response = await client!.GetAsync($"{CloudBaseUrl}/collectorxchange");

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    Console.WriteLine($"[CLOUD_COLLECTORXCHANGE] Failed to fetch collectors: {response.StatusCode} - {errorContent}");
                    return StatusCode((int)response.StatusCode, new { success = false, error = "Failed to fetch collectors" });
                }

                var json = await response.Content.ReadAsStringAsync();
                return Content(json, "application/json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_COLLECTORXCHANGE] Error fetching collectors: {ex.Message}");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // GET COLLECTOR DETAILS
        // ============================================================================

        /// <summary>
        /// GET /api/cloud/collectorxchange/{collectorId} — get collector details
        /// </summary>
        [HttpGet("{collectorId}")]
        public async Task<IActionResult> GetCollectorDetails(string collectorId)
        {
            try
            {
                var (client, authError) = await CreateAuthenticatedClientAsync();
                if (authError != null) return authError;

                var response = await client!.GetAsync($"{CloudBaseUrl}/collectorxchange/{Uri.EscapeDataString(collectorId)}");

                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[CLOUD_COLLECTORXCHANGE] Failed to fetch collector details: {response.StatusCode}");
                    return StatusCode((int)response.StatusCode, new { success = false, error = "Collector not found" });
                }

                var json = await response.Content.ReadAsStringAsync();
                return Content(json, "application/json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_COLLECTORXCHANGE] Error fetching collector details: {ex.Message}");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // GET COLLECTOR VERSIONS
        // ============================================================================

        /// <summary>
        /// GET /api/cloud/collectorxchange/{collectorId}/versions — get version history
        /// </summary>
        [HttpGet("{collectorId}/versions")]
        public async Task<IActionResult> GetCollectorVersions(string collectorId)
        {
            try
            {
                var (client, authError) = await CreateAuthenticatedClientAsync();
                if (authError != null) return authError;

                var response = await client!.GetAsync(
                    $"{CloudBaseUrl}/collectorxchange/{Uri.EscapeDataString(collectorId)}/versions");

                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[CLOUD_COLLECTORXCHANGE] Failed to fetch versions: {response.StatusCode}");
                    return StatusCode((int)response.StatusCode, new { success = false, error = "Collector versions not found" });
                }

                var json = await response.Content.ReadAsStringAsync();
                return Content(json, "application/json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_COLLECTORXCHANGE] Error fetching versions: {ex.Message}");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // BATCH THUMBNAILS
        // ============================================================================

        /// <summary>
        /// POST /api/cloud/collectorxchange/thumbnails/batch — batch resolve thumbnail URLs
        /// Proxies to Cloud API: POST /collectorxchange/thumbnails/batch
        /// </summary>
        [HttpPost("thumbnails/batch")]
        public async Task<IActionResult> GetBatchThumbnails()
        {
            try
            {
                var (client, authError) = await CreateAuthenticatedClientAsync();
                if (authError != null) return authError;

                using var reader = new StreamReader(Request.Body);
                var body = await reader.ReadToEndAsync();

                var content = new StringContent(body, System.Text.Encoding.UTF8, "application/json");
                var response = await client!.PostAsync($"{CloudBaseUrl}/collectorxchange/thumbnails/batch", content);

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    Console.WriteLine($"[CLOUD_COLLECTORXCHANGE] Failed to fetch batch thumbnails: {response.StatusCode} - {errorContent}");
                    return StatusCode((int)response.StatusCode, new { success = false, error = "Failed to fetch batch thumbnails" });
                }

                var json = await response.Content.ReadAsStringAsync();
                return Content(json, "application/json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_COLLECTORXCHANGE] Error fetching batch thumbnails: {ex.Message}");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // VERSION THUMBNAIL
        // ============================================================================

        /// <summary>
        /// GET /api/cloud/collectorxchange/{collectorId}/versions/{versionId}/thumbnail
        /// </summary>
        [HttpGet("{collectorId}/versions/{versionId}/thumbnail")]
        public async Task<IActionResult> GetVersionThumbnail(string collectorId, string versionId)
        {
            try
            {
                var (client, authError) = await CreateAuthenticatedClientAsync();
                if (authError != null) return authError;

                var response = await client!.GetAsync(
                    $"{CloudBaseUrl}/collectorxchange/{Uri.EscapeDataString(collectorId)}/versions/{Uri.EscapeDataString(versionId)}/thumbnail");

                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[CLOUD_COLLECTORXCHANGE] Failed to fetch thumbnail: {response.StatusCode}");
                    return StatusCode((int)response.StatusCode, new { success = false, error = "Thumbnail not found" });
                }

                var json = await response.Content.ReadAsStringAsync();
                return Content(json, "application/json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_COLLECTORXCHANGE] Error fetching thumbnail: {ex.Message}");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }
    }
}
