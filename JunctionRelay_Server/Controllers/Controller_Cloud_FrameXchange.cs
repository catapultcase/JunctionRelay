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
    /// Controller for proxying FrameXchange community marketplace API calls to JunctionRelay Cloud.
    /// Mirrors the endpoints consumed by the shared FrameEngine CloudTab UI.
    /// </summary>
    [ApiController]
    [Route("api/cloud/framexchange")]
    public class Controller_Cloud_FrameXchange : ControllerBase
    {
        private readonly Service_CloudSessionStore _sessionStore;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Service_Database_Manager_FrameEngine _frameEngineDb;
        private readonly IWebHostEnvironment _webHostEnvironment;
        private readonly DatabasePathProvider _dbPathProvider;

        private string CloudBaseUrl =>
            Environment.GetEnvironmentVariable("CLOUD_BACKEND_URL")?.TrimEnd('/') ?? "https://api.junctionrelay.com";

        public Controller_Cloud_FrameXchange(
            Service_CloudSessionStore sessionStore,
            IHttpClientFactory httpClientFactory,
            Service_Database_Manager_FrameEngine frameEngineDb,
            IWebHostEnvironment webHostEnvironment,
            DatabasePathProvider dbPathProvider)
        {
            _sessionStore = sessionStore;
            _httpClientFactory = httpClientFactory;
            _frameEngineDb = frameEngineDb;
            _webHostEnvironment = webHostEnvironment;
            _dbPathProvider = dbPathProvider;
        }

        // ============================================================================
        // HELPERS
        // ============================================================================

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

        private string GetDownloadsPath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath)
                          ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            var downloadsDir = Path.Combine(dataDir, "frameengine", "downloads");
            Directory.CreateDirectory(downloadsDir);
            return downloadsDir;
        }

        private string GetTemplatesPath() =>
            Path.Combine(_webHostEnvironment.ContentRootPath, "frameengine", "templates");

        private string GetRivePath()
        {
            var dataDir = Path.GetDirectoryName(_dbPathProvider.DbPath)
                          ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine", "rive");
        }

        private string GetAssetsPath()
        {
            var dataDir = Path.GetDirectoryName(_dbPathProvider.DbPath)
                          ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine", "images");
        }

        private string GetVideosPath()
        {
            var dataDir = Path.GetDirectoryName(_dbPathProvider.DbPath)
                          ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine", "videos");
        }

        // ============================================================================
        // MY TEMPLATES (must be before wildcard {templateId} routes)
        // ============================================================================

        /// <summary>
        /// GET /api/cloud/framexchange/templates/mine — get user's own templates (all statuses)
        /// Proxies to Cloud API: GET /templates/mine
        /// </summary>
        [HttpGet("templates/mine")]
        public async Task<IActionResult> GetMyTemplates()
        {
            try
            {
                var (client, authError) = await CreateAuthenticatedClientAsync();
                if (authError != null) return authError;

                var response = await client!.GetAsync($"{CloudBaseUrl}/templates/mine");

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Failed to fetch my templates: {response.StatusCode} - {errorContent}");
                    return StatusCode((int)response.StatusCode, new { success = false, error = "Failed to fetch my templates" });
                }

                var json = await response.Content.ReadAsStringAsync();
                return Content(json, "application/json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Error fetching my templates: {ex.Message}");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // GET TEMPLATES
        // ============================================================================

        /// <summary>
        /// GET /api/cloud/framexchange/templates — list FrameXchange community templates
        /// Proxies to Cloud API: GET /templates?page=X&amp;limit=X&amp;sortBy=X&amp;sortOrder=X&amp;filter=X
        /// </summary>
        [HttpGet("templates")]
        public async Task<IActionResult> GetTemplates(
            [FromQuery] int page = 1,
            [FromQuery] int limit = 50,
            [FromQuery] string sortBy = "createdAt",
            [FromQuery] string sortOrder = "desc",
            [FromQuery] string filter = "all")
        {
            try
            {
                var (client, authError) = await CreateAuthenticatedClientAsync();
                if (authError != null) return authError;

                var queryParams = $"?page={page}&limit={limit}&sortBy={Uri.EscapeDataString(sortBy)}&sortOrder={Uri.EscapeDataString(sortOrder)}&filter={Uri.EscapeDataString(filter)}";
                var response = await client!.GetAsync($"{CloudBaseUrl}/templates{queryParams}");

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Failed to fetch templates: {response.StatusCode} - {errorContent}");
                    return StatusCode((int)response.StatusCode, new { success = false, error = "Failed to fetch templates" });
                }

                // Pass through Cloud API response directly — no data wrapper
                var json = await response.Content.ReadAsStringAsync();
                return Content(json, "application/json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Error fetching templates: {ex.Message}");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // GET TEMPLATE DETAILS
        // ============================================================================

        /// <summary>
        /// GET /api/cloud/framexchange/templates/{templateId} — get template details
        /// Proxies to Cloud API: GET /templates/{templateId}
        /// </summary>
        [HttpGet("templates/{templateId}")]
        public async Task<IActionResult> GetTemplateDetails(string templateId)
        {
            try
            {
                var (client, authError) = await CreateAuthenticatedClientAsync();
                if (authError != null) return authError;

                var response = await client!.GetAsync($"{CloudBaseUrl}/templates/{Uri.EscapeDataString(templateId)}");

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Failed to fetch template details: {response.StatusCode}");
                    return StatusCode((int)response.StatusCode, new { success = false, error = "Template not found" });
                }

                // Pass through Cloud API response directly — no data wrapper
                var json = await response.Content.ReadAsStringAsync();
                return Content(json, "application/json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Error fetching template details: {ex.Message}");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // GET TEMPLATE VERSIONS
        // ============================================================================

        /// <summary>
        /// GET /api/cloud/framexchange/templates/{templateId}/versions — get version history
        /// Proxies to Cloud API: GET /templates/{templateId}/versions
        /// </summary>
        [HttpGet("templates/{templateId}/versions")]
        public async Task<IActionResult> GetTemplateVersions(string templateId)
        {
            try
            {
                var (client, authError) = await CreateAuthenticatedClientAsync();
                if (authError != null) return authError;

                var response = await client!.GetAsync(
                    $"{CloudBaseUrl}/templates/{Uri.EscapeDataString(templateId)}/versions");

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Failed to fetch versions: {response.StatusCode}");
                    return StatusCode((int)response.StatusCode, new { success = false, error = "Template versions not found" });
                }

                // Pass through directly — frontend handles both data.versions and data.data?.versions
                var json = await response.Content.ReadAsStringAsync();
                return Content(json, "application/json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Error fetching template versions: {ex.Message}");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // GET VERSION THUMBNAIL
        // ============================================================================

        /// <summary>
        /// GET /api/cloud/framexchange/templates/{templateId}/versions/{versionId}/thumbnail
        /// Proxies to Cloud API: GET /templates/{templateId}/versions/{versionId}/thumbnail
        /// Returns presigned S3 URL for the version thumbnail image.
        /// </summary>
        [HttpGet("templates/{templateId}/versions/{versionId}/thumbnail")]
        public async Task<IActionResult> GetVersionThumbnail(string templateId, string versionId)
        {
            try
            {
                var (client, authError) = await CreateAuthenticatedClientAsync();
                if (authError != null) return authError;

                var response = await client!.GetAsync(
                    $"{CloudBaseUrl}/templates/{Uri.EscapeDataString(templateId)}/versions/{Uri.EscapeDataString(versionId)}/thumbnail");

                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Failed to fetch thumbnail: {response.StatusCode}");
                    return StatusCode((int)response.StatusCode, new { success = false, error = "Thumbnail not found" });
                }

                // Pass through Cloud API response directly — no data wrapper
                var json = await response.Content.ReadAsStringAsync();
                return Content(json, "application/json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Error fetching thumbnail: {ex.Message}");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // BATCH THUMBNAILS
        // ============================================================================

        /// <summary>
        /// POST /api/cloud/framexchange/thumbnails/batch
        /// Proxies to Cloud API: POST /templates/thumbnails/batch
        /// Batch resolves thumbnail URLs for multiple templates in a single request.
        /// </summary>
        [HttpPost("thumbnails/batch")]
        public async Task<IActionResult> GetBatchThumbnails()
        {
            try
            {
                var (client, authError) = await CreateAuthenticatedClientAsync();
                if (authError != null) return authError;

                // Forward request body as-is
                using var reader = new StreamReader(Request.Body);
                var body = await reader.ReadToEndAsync();

                var content = new StringContent(body, System.Text.Encoding.UTF8, "application/json");
                var response = await client!.PostAsync($"{CloudBaseUrl}/templates/thumbnails/batch", content);

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Failed to fetch batch thumbnails: {response.StatusCode} - {errorContent}");
                    return StatusCode((int)response.StatusCode, new { success = false, error = "Failed to fetch batch thumbnails" });
                }

                var json = await response.Content.ReadAsStringAsync();
                return Content(json, "application/json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Error fetching batch thumbnails: {ex.Message}");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // DOWNLOAD TEMPLATE
        // ============================================================================

        /// <summary>
        /// POST /api/cloud/framexchange/download/{templateId}/{variantId}
        /// Downloads a template variant from FrameXchange cloud:
        /// 1. Gets presigned download URL from Cloud API
        /// 2. Downloads the ZIP from S3
        /// 3. Saves the ZIP to the downloads directory
        /// 4. Auto-imports the layout into the local database
        /// 5. Returns the file path for subscription tracking
        /// </summary>
        [HttpPost("download/{templateId}/{variantId}")]
        public async Task<IActionResult> DownloadTemplate(string templateId, string variantId)
        {
            try
            {
                // Parse optional template name from body
                string templateName;
                try
                {
                    using var reader = new StreamReader(Request.Body);
                    var bodyJson = await reader.ReadToEndAsync();
                    if (!string.IsNullOrEmpty(bodyJson))
                    {
                        var body = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(bodyJson);
                        templateName = body.TryGetProperty("templateName", out var nameProp)
                            ? nameProp.GetString() ?? $"framexchange-{templateId[..Math.Min(8, templateId.Length)]}"
                            : $"framexchange-{templateId[..Math.Min(8, templateId.Length)]}";
                    }
                    else
                    {
                        templateName = $"framexchange-{templateId[..Math.Min(8, templateId.Length)]}";
                    }
                }
                catch
                {
                    templateName = $"framexchange-{templateId[..Math.Min(8, templateId.Length)]}";
                }

                Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Downloading template {templateId}, variant {variantId}");

                // 1. Get authenticated client
                var (client, authError) = await CreateAuthenticatedClientAsync();
                if (authError != null) return authError;

                // 2. Request download URL from Cloud API
                var downloadEndpoint = $"{CloudBaseUrl}/templates/{Uri.EscapeDataString(templateId)}/variants/{Uri.EscapeDataString(variantId)}/download";
                var response = await client!.PostAsync(downloadEndpoint, null);

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Failed to get download URL: {response.StatusCode} - {errorContent}");
                    return StatusCode((int)response.StatusCode, new { success = false, error = "Failed to download template" });
                }

                var downloadJson = await response.Content.ReadAsStringAsync();
                var downloadData = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(downloadJson);

                if (!downloadData.TryGetProperty("downloadUrl", out var downloadUrlProp) &&
                    !downloadData.TryGetProperty("success", out _))
                {
                    Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Invalid download response: {downloadJson}");
                    return BadRequest(new { success = false, error = "Invalid response from cloud API" });
                }

                var downloadUrl = downloadData.TryGetProperty("downloadUrl", out var urlProp)
                    ? urlProp.GetString()
                    : null;

                if (string.IsNullOrEmpty(downloadUrl))
                {
                    Console.WriteLine("[CLOUD_FRAMEXCHANGE] No download URL in response");
                    return BadRequest(new { success = false, error = "No download URL returned" });
                }

                // 3. Download the ZIP from S3
                Console.WriteLine("[CLOUD_FRAMEXCHANGE] Downloading ZIP from S3...");
                using var s3Client = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
                var zipBytes = await s3Client.GetByteArrayAsync(downloadUrl);
                Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Downloaded ZIP ({zipBytes.Length} bytes)");

                // 4. Save ZIP to downloads directory
                var downloadsDir = GetDownloadsPath();
                var safeName = string.Concat(templateName.Split(Path.GetInvalidFileNameChars()));
                if (string.IsNullOrEmpty(safeName)) safeName = $"framexchange-{templateId[..Math.Min(8, templateId.Length)]}";

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
                {
                    Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Path traversal attempt detected: {filePath}");
                    return BadRequest(new { success = false, error = "Invalid file path" });
                }

                await System.IO.File.WriteAllBytesAsync(filePath, zipBytes);
                Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Saved ZIP to: {filePath}");

                return Ok(new
                {
                    success = true,
                    message = "Template downloaded successfully",
                    filename,
                    path = filePath
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Error downloading template: {ex.Message}");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // GET CURRENT VERSION (any status — for My Uploads thumbnails)
        // ============================================================================

        /// <summary>
        /// GET /api/cloud/framexchange/templates/{templateId}/versions/current
        /// Proxies to Cloud API: GET /templates/{templateId}/versions/current
        /// Returns the current version regardless of status (for unapproved thumbnail loading).
        /// </summary>
        [HttpGet("templates/{templateId}/versions/current")]
        public async Task<IActionResult> GetCurrentVersion(string templateId)
        {
            try
            {
                var (client, authError) = await CreateAuthenticatedClientAsync();
                if (authError != null) return authError;

                var response = await client!.GetAsync(
                    $"{CloudBaseUrl}/templates/{Uri.EscapeDataString(templateId)}/versions/current");

                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Failed to fetch current version: {response.StatusCode}");
                    return StatusCode((int)response.StatusCode, new { success = false, error = "Current version not found" });
                }

                var json = await response.Content.ReadAsStringAsync();
                return Content(json, "application/json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Error fetching current version: {ex.Message}");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // UNAPPROVED VERSION THUMBNAIL
        // ============================================================================

        /// <summary>
        /// GET /api/cloud/framexchange/templates/{templateId}/versions/{versionId}/unapproved/thumbnail
        /// Proxies to Cloud API: GET /templates/{templateId}/versions/{versionId}/unapproved/thumbnail
        /// Returns presigned S3 URL for an unapproved version's thumbnail.
        /// </summary>
        [HttpGet("templates/{templateId}/versions/{versionId}/unapproved/thumbnail")]
        public async Task<IActionResult> GetUnapprovedVersionThumbnail(string templateId, string versionId)
        {
            try
            {
                var (client, authError) = await CreateAuthenticatedClientAsync();
                if (authError != null) return authError;

                var response = await client!.GetAsync(
                    $"{CloudBaseUrl}/templates/{Uri.EscapeDataString(templateId)}/versions/{Uri.EscapeDataString(versionId)}/unapproved/thumbnail");

                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Failed to fetch unapproved thumbnail: {response.StatusCode}");
                    return StatusCode((int)response.StatusCode, new { success = false, error = "Unapproved thumbnail not found" });
                }

                var json = await response.Content.ReadAsStringAsync();
                return Content(json, "application/json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Error fetching unapproved thumbnail: {ex.Message}");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // UNAPPROVED VARIANT DOWNLOAD
        // ============================================================================

        /// <summary>
        /// GET /api/cloud/framexchange/templates/{templateId}/variants/{variantId}/unapproved/download
        /// Proxies to Cloud API: GET /templates/{templateId}/variants/{variantId}/unapproved/download
        /// Returns presigned S3 download URL for an unapproved variant.
        /// </summary>
        [HttpGet("templates/{templateId}/variants/{variantId}/unapproved/download")]
        public async Task<IActionResult> GetUnapprovedVariantDownload(string templateId, string variantId)
        {
            try
            {
                var (client, authError) = await CreateAuthenticatedClientAsync();
                if (authError != null) return authError;

                var response = await client!.GetAsync(
                    $"{CloudBaseUrl}/templates/{Uri.EscapeDataString(templateId)}/variants/{Uri.EscapeDataString(variantId)}/unapproved/download");

                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Failed to fetch unapproved download URL: {response.StatusCode}");
                    return StatusCode((int)response.StatusCode, new { success = false, error = "Unapproved download not found" });
                }

                var json = await response.Content.ReadAsStringAsync();
                return Content(json, "application/json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Error fetching unapproved download URL: {ex.Message}");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // LIKE TEMPLATE
        // ============================================================================

        /// <summary>
        /// POST /api/cloud/framexchange/templates/{templateId}/like
        /// Proxies to Cloud API: POST /templates/{templateId}/like
        /// Toggles the like status for a template. Returns { liked, likes }.
        /// </summary>
        [HttpPost("templates/{templateId}/like")]
        public async Task<IActionResult> LikeTemplate(string templateId)
        {
            try
            {
                var (client, authError) = await CreateAuthenticatedClientAsync();
                if (authError != null) return authError;

                var response = await client!.PostAsync(
                    $"{CloudBaseUrl}/templates/{Uri.EscapeDataString(templateId)}/like", null);

                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Failed to toggle like: {response.StatusCode}");
                    return StatusCode((int)response.StatusCode, new { success = false, error = "Failed to toggle like" });
                }

                var json = await response.Content.ReadAsStringAsync();
                return Content(json, "application/json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_FRAMEXCHANGE] Error toggling like: {ex.Message}");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }
    }
}
