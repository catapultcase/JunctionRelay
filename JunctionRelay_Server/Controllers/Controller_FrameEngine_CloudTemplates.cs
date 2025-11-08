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
    /// Controller for individual FrameEngine template cloud versioning (snapshots)
    /// </summary>
    [ApiController]
    [Route("api/frameengine/cloud-templates")]
    public class Controller_FrameEngine_CloudTemplates : ControllerBase
    {
        private readonly Service_FrameEngine_CloudVersioning _cloudVersioningService;
        private readonly Service_CloudSessionStore _sessionStore;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Service_Database_Manager_FrameEngine _frameEngineDb;
        private readonly Service_Unified_Notification_Broadcaster _notificationBroadcaster;

        public Controller_FrameEngine_CloudTemplates(
            Service_FrameEngine_CloudVersioning cloudVersioningService,
            Service_CloudSessionStore sessionStore,
            IHttpClientFactory httpClientFactory,
            Service_Database_Manager_FrameEngine frameEngineDb,
            Service_Unified_Notification_Broadcaster notificationBroadcaster)
        {
            _cloudVersioningService = cloudVersioningService;
            _sessionStore = sessionStore;
            _httpClientFactory = httpClientFactory;
            _frameEngineDb = frameEngineDb;
            _notificationBroadcaster = notificationBroadcaster;
        }

        // ============================================================================
        // SAVE CLOUD VERSION (SNAPSHOT)
        // ============================================================================

        [HttpPost("{frameId}/cloud-version")]
        public async Task<IActionResult> SaveCloudVersion(int frameId)
        {
            try
            {
                var operationId = Guid.NewGuid().ToString();

                // Delegate to service with notification broadcasting enabled
                var result = await _cloudVersioningService.SaveCloudVersionAsync(
                    frameId,
                    isBackupSnapshot: false,
                    operationId: operationId,
                    emitNotifications: true);

                if (!result.Success)
                {
                    return BadRequest(new { message = result.ErrorMessage });
                }

                return Ok(new
                {
                    snapshotId = result.SnapshotId,
                    message = "Cloud version saved successfully"
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_TEMPLATES] Error saving cloud version: {ex.Message}");
                return StatusCode(500, new { message = "Error saving cloud version", error = ex.Message });
            }
        }

        // ============================================================================
        // GET CLOUD VERSIONS
        // ============================================================================

        [HttpGet("{frameId}/cloud-versions")]
        public async Task<IActionResult> GetCloudVersions(int frameId)
        {
            try
            {
                // Get frame layout to retrieve CloudVariantId
                var frameLayout = await _frameEngineDb.GetFrameLayoutByIdAsync(frameId);
                if (frameLayout == null)
                {
                    return NotFound(new { message = $"Frame layout with ID {frameId} not found" });
                }

                if (string.IsNullOrEmpty(frameLayout.CloudVariantId))
                {
                    return BadRequest(new { message = "Cannot retrieve cloud versions: Layout does not have CloudVariantId" });
                }

                var token = await _sessionStore.GetValidAccessTokenAsync();
                if (string.IsNullOrEmpty(token))
                {
                    return Unauthorized(new { message = "No active cloud session" });
                }

                var cloudBaseUrl = Environment.GetEnvironmentVariable("CLOUD_BACKEND_URL") ?? "https://api.junctionrelay.com";

                var httpClient = _httpClientFactory.CreateClient();
                httpClient.DefaultRequestHeaders.Authorization =
                    new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                var response = await httpClient.GetAsync(
                    $"{cloudBaseUrl.TrimEnd('/')}/api/template-versions/{frameLayout.CloudVariantId}/snapshots");

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    return StatusCode((int)response.StatusCode,
                        new { message = "Failed to retrieve cloud versions", error = errorContent });
                }

                var versionsJson = await response.Content.ReadAsStringAsync();
                return Content(versionsJson, "application/json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_TEMPLATES] Error retrieving cloud versions: {ex.Message}");
                return StatusCode(500, new { message = "Error retrieving cloud versions", error = ex.Message });
            }
        }

        // ============================================================================
        // DELETE CLOUD VERSION
        // ============================================================================

        [HttpDelete("{frameId}/cloud-versions/{snapshotId}")]
        public async Task<IActionResult> DeleteCloudVersion(int frameId, Guid snapshotId)
        {
            try
            {
                var token = await _sessionStore.GetValidAccessTokenAsync();
                if (string.IsNullOrEmpty(token))
                {
                    return Unauthorized(new { message = "No active cloud session" });
                }

                var cloudBaseUrl = Environment.GetEnvironmentVariable("CLOUD_BACKEND_URL") ?? "https://api.junctionrelay.com";

                var httpClient = _httpClientFactory.CreateClient();
                httpClient.DefaultRequestHeaders.Authorization =
                    new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                var response = await httpClient.DeleteAsync(
                    $"{cloudBaseUrl.TrimEnd('/')}/api/template-versions/snapshot/{snapshotId}");

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    return StatusCode((int)response.StatusCode,
                        new { message = "Failed to delete cloud version", error = errorContent });
                }

                return Ok(new { message = "Cloud version deleted successfully" });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_TEMPLATES] Error deleting cloud version: {ex.Message}");
                return StatusCode(500, new { message = "Error deleting cloud version", error = ex.Message });
            }
        }

        // ============================================================================
        // DOWNLOAD CLOUD VERSION
        // ============================================================================

        [HttpPost("{frameId}/cloud-versions/{snapshotId}/download")]
        public async Task<IActionResult> DownloadCloudVersion(int frameId, Guid snapshotId)
        {
            try
            {
                Console.WriteLine($"[CLOUD_TEMPLATES] Downloading cloud version {snapshotId} for frame {frameId}");

                // 1. Get authentication token
                var token = await _sessionStore.GetValidAccessTokenAsync();
                if (string.IsNullOrEmpty(token))
                {
                    Console.WriteLine($"[CLOUD_TEMPLATES] No valid cloud authentication token");
                    return Unauthorized(new { message = "Not authenticated with cloud. Please log in to JunctionRelay Cloud." });
                }

                // 2. Call Cloud API to get snapshot details + download URLs
                using var httpClient = _httpClientFactory.CreateClient();
                httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                var cloudBaseUrl = Environment.GetEnvironmentVariable("CLOUD_BACKEND_URL") ?? "https://api.junctionrelay.com";
                var snapshotUrl = $"{cloudBaseUrl.TrimEnd('/')}/api/template-versions/snapshot/{snapshotId}";

                Console.WriteLine($"[CLOUD_TEMPLATES] Fetching snapshot details from cloud...");
                var snapshotResponse = await httpClient.GetAsync(snapshotUrl);

                if (!snapshotResponse.IsSuccessStatusCode)
                {
                    var error = await snapshotResponse.Content.ReadAsStringAsync();
                    Console.WriteLine($"[CLOUD_TEMPLATES] Failed to get snapshot: {snapshotResponse.StatusCode} - {error}");
                    return StatusCode((int)snapshotResponse.StatusCode, new { message = "Failed to get snapshot", error = error });
                }

                var snapshotJson = await snapshotResponse.Content.ReadAsStringAsync();
                var snapshot = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(snapshotJson);

                var templateName = snapshot.GetProperty("templateName").GetString() ?? "template";
                var configJson = snapshot.GetProperty("configJson").GetString() ?? "{}";
                var downloadUrls = snapshot.GetProperty("downloadUrls");

                // Count the number of properties in the downloadUrls object
                var urlCount = downloadUrls.EnumerateObject().Count();
                Console.WriteLine($"[CLOUD_TEMPLATES] Downloading {urlCount} assets...");

                // 3. Download all assets from S3 using presigned URLs
                var assetData = new Dictionary<string, byte[]>(); // { "path": fileBytes }

                using var s3Client = new HttpClient();
                s3Client.Timeout = TimeSpan.FromMinutes(5);

                foreach (var urlProp in downloadUrls.EnumerateObject())
                {
                    var assetPath = urlProp.Name;
                    var downloadUrl = urlProp.Value.GetString();

                    if (string.IsNullOrEmpty(downloadUrl))
                        continue;

                    Console.WriteLine($"  Downloading: {assetPath}");
                    var assetBytes = await s3Client.GetByteArrayAsync(downloadUrl);
                    assetData[assetPath] = assetBytes;
                }

                Console.WriteLine($"[CLOUD_TEMPLATES] All assets downloaded, reconstructing ZIP...");

                // 4. Reconstruct ZIP exactly like the export format
                using var zipStream = new MemoryStream();
                using (var archive = new System.IO.Compression.ZipArchive(zipStream, System.IO.Compression.ZipArchiveMode.Create, true))
                {
                    // Add config.json
                    var configEntry = archive.CreateEntry("config.json");
                    using (var entryStream = configEntry.Open())
                    using (var writer = new StreamWriter(entryStream))
                    {
                        await writer.WriteAsync(configJson);
                    }

                    // Add all assets
                    foreach (var asset in assetData)
                    {
                        var entry = archive.CreateEntry(asset.Key);
                        using (var entryStream = entry.Open())
                        {
                            await entryStream.WriteAsync(asset.Value, 0, asset.Value.Length);
                        }
                    }
                }

                zipStream.Position = 0;
                var zipBytes = zipStream.ToArray();

                Console.WriteLine($"[CLOUD_TEMPLATES] ✅ ZIP reconstructed ({zipBytes.Length} bytes)");

                // Sanitize filename
                var safeTemplateName = string.Concat(templateName.Split(Path.GetInvalidFileNameChars()));
                var filename = $"{safeTemplateName}.zip";

                return File(zipBytes, "application/zip", filename);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_TEMPLATES] Error downloading cloud version: {ex.Message}");
                return StatusCode(500, new { message = "Error downloading cloud version", error = ex.Message });
            }
        }
    }
}
