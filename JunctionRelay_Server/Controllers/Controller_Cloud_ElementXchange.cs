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
    /// Controller for proxying ElementXchange marketplace API calls to JunctionRelay Cloud.
    /// Mirrors the pattern used by Controller_Cloud_FrameXchange.
    /// </summary>
    [ApiController]
    [Route("api/cloud/elementxchange")]
    public class Controller_Cloud_ElementXchange : ControllerBase
    {
        private readonly Service_CloudSessionStore _sessionStore;
        private readonly IHttpClientFactory _httpClientFactory;

        private string CloudBaseUrl =>
            Environment.GetEnvironmentVariable("CLOUD_BACKEND_URL")?.TrimEnd('/') ?? "https://api.junctionrelay.com";

        public Controller_Cloud_ElementXchange(
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
        // LIST ELEMENTS
        // ============================================================================

        /// <summary>
        /// GET /api/cloud/elementxchange — list approved elements from ElementXchange
        /// Proxies to Cloud API: GET /elementxchange
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> GetElements()
        {
            try
            {
                var (client, authError) = await CreateAuthenticatedClientAsync();
                if (authError != null) return authError;

                var response = await client!.GetAsync($"{CloudBaseUrl}/elementxchange");

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    Console.WriteLine($"[CLOUD_ELEMENTXCHANGE] Failed to fetch elements: {response.StatusCode} - {errorContent}");
                    return StatusCode((int)response.StatusCode, new { success = false, error = "Failed to fetch elements" });
                }

                var json = await response.Content.ReadAsStringAsync();
                return Content(json, "application/json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_ELEMENTXCHANGE] Error fetching elements: {ex.Message}");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // GET ELEMENT DETAILS
        // ============================================================================

        /// <summary>
        /// GET /api/cloud/elementxchange/{elementId} — get element details
        /// </summary>
        [HttpGet("{elementId}")]
        public async Task<IActionResult> GetElementDetails(string elementId)
        {
            try
            {
                var (client, authError) = await CreateAuthenticatedClientAsync();
                if (authError != null) return authError;

                var response = await client!.GetAsync($"{CloudBaseUrl}/elementxchange/{Uri.EscapeDataString(elementId)}");

                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[CLOUD_ELEMENTXCHANGE] Failed to fetch element details: {response.StatusCode}");
                    return StatusCode((int)response.StatusCode, new { success = false, error = "Element not found" });
                }

                var json = await response.Content.ReadAsStringAsync();
                return Content(json, "application/json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_ELEMENTXCHANGE] Error fetching element details: {ex.Message}");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // GET ELEMENT VERSIONS
        // ============================================================================

        /// <summary>
        /// GET /api/cloud/elementxchange/{elementId}/versions — get version history
        /// </summary>
        [HttpGet("{elementId}/versions")]
        public async Task<IActionResult> GetElementVersions(string elementId)
        {
            try
            {
                var (client, authError) = await CreateAuthenticatedClientAsync();
                if (authError != null) return authError;

                var response = await client!.GetAsync(
                    $"{CloudBaseUrl}/elementxchange/{Uri.EscapeDataString(elementId)}/versions");

                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[CLOUD_ELEMENTXCHANGE] Failed to fetch versions: {response.StatusCode}");
                    return StatusCode((int)response.StatusCode, new { success = false, error = "Element versions not found" });
                }

                var json = await response.Content.ReadAsStringAsync();
                return Content(json, "application/json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_ELEMENTXCHANGE] Error fetching versions: {ex.Message}");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // BATCH THUMBNAILS
        // ============================================================================

        /// <summary>
        /// POST /api/cloud/elementxchange/thumbnails/batch — batch resolve thumbnail URLs
        /// Proxies to Cloud API: POST /elementxchange/thumbnails/batch
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
                var response = await client!.PostAsync($"{CloudBaseUrl}/elementxchange/thumbnails/batch", content);

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    Console.WriteLine($"[CLOUD_ELEMENTXCHANGE] Failed to fetch batch thumbnails: {response.StatusCode} - {errorContent}");
                    return StatusCode((int)response.StatusCode, new { success = false, error = "Failed to fetch batch thumbnails" });
                }

                var json = await response.Content.ReadAsStringAsync();
                return Content(json, "application/json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_ELEMENTXCHANGE] Error fetching batch thumbnails: {ex.Message}");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // VERSION THUMBNAIL
        // ============================================================================

        /// <summary>
        /// GET /api/cloud/elementxchange/{elementId}/versions/{versionId}/thumbnail
        /// </summary>
        [HttpGet("{elementId}/versions/{versionId}/thumbnail")]
        public async Task<IActionResult> GetVersionThumbnail(string elementId, string versionId)
        {
            try
            {
                var (client, authError) = await CreateAuthenticatedClientAsync();
                if (authError != null) return authError;

                var response = await client!.GetAsync(
                    $"{CloudBaseUrl}/elementxchange/{Uri.EscapeDataString(elementId)}/versions/{Uri.EscapeDataString(versionId)}/thumbnail");

                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[CLOUD_ELEMENTXCHANGE] Failed to fetch thumbnail: {response.StatusCode}");
                    return StatusCode((int)response.StatusCode, new { success = false, error = "Thumbnail not found" });
                }

                var json = await response.Content.ReadAsStringAsync();
                return Content(json, "application/json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_ELEMENTXCHANGE] Error fetching thumbnail: {ex.Message}");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }
    }
}
