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
using JunctionRelayServer.Models;
using JunctionRelayServer.Services;
using System.IO.Compression;
using JunctionRelayServer.Utils;

namespace JunctionRelayServer.Controllers
{
    /// <summary>
    /// Manages layout subscriptions for cloud (FrameXchange) and remote server layouts.
    /// API contract matches XSD's subscription handlers for shared UI compatibility.
    /// </summary>
    [ApiController]
    [Route("api/subscriptions")]
    public class Controller_Subscriptions : ControllerBase
    {
        private readonly Service_Database_Manager_Subscriptions _subscriptionService;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Service_CloudSessionStore _sessionStore;
        private readonly DatabasePathProvider _dbPathProvider;

        public Controller_Subscriptions(
            Service_Database_Manager_Subscriptions subscriptionService,
            IHttpClientFactory httpClientFactory,
            Service_CloudSessionStore sessionStore,
            DatabasePathProvider dbPathProvider)
        {
            _subscriptionService = subscriptionService;
            _httpClientFactory = httpClientFactory;
            _sessionStore = sessionStore;
            _dbPathProvider = dbPathProvider;
        }

        // ============================================================================
        // LIST SUBSCRIPTIONS
        // ============================================================================

        /// <summary>GET /api/subscriptions — list all active subscriptions</summary>
        [HttpGet]
        public async Task<IActionResult> GetSubscriptions()
        {
            try
            {
                var subscriptions = await _subscriptionService.GetAllSubscriptionsAsync();
                var mapped = subscriptions.Select(s => new
                {
                    id = s.Id,
                    server_url = s.ServerUrl,
                    server_port = s.ServerPort,
                    remote_layout_id = s.RemoteLayoutId,
                    layout_name = s.RemoteLayoutName,
                    local_file_path = s.LocalFilePath,
                    auto_update = s.AutoUpdate == 1,
                });
                return Ok(new { success = true, subscriptions = mapped });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // SUBSCRIBE
        // ============================================================================

        /// <summary>POST /api/subscriptions/subscribe — create a subscription record</summary>
        [HttpPost("subscribe")]
        public async Task<IActionResult> Subscribe([FromBody] SubscribeRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.RemoteLayoutId))
                    return BadRequest(new { success = false, error = "remoteLayoutId is required" });

                if (string.IsNullOrWhiteSpace(request.LayoutName))
                    return BadRequest(new { success = false, error = "layoutName is required" });

                if (string.IsNullOrWhiteSpace(request.LocalFilePath))
                    return BadRequest(new { success = false, error = "localFilePath is required" });

                var serverUrl = request.ServerUrl ?? "cloud";
                var serverPort = request.ServerPort ?? "0";

                // Check for existing subscription
                var existing = await _subscriptionService.GetSubscriptionByRemoteLayoutAsync(
                    serverUrl, serverPort, request.RemoteLayoutId);

                if (existing != null)
                {
                    return Ok(new
                    {
                        success = true,
                        subscriptionId = existing.Id,
                        message = "Already subscribed"
                    });
                }

                // Determine source type
                var source = request.SourceType ?? (serverUrl == "cloud" ? "cloud" : "server");

                // Fetch version info from remote source for update tracking
                string? remoteLastModified = null;
                int isTemplate = 0;

                if (source == "cloud")
                {
                    var versions = await FetchCloudVersionsBatchAsync(new List<string> { request.RemoteLayoutId });
                    remoteLastModified = versions?.GetValueOrDefault(request.RemoteLayoutId);
                    isTemplate = 1;
                }
                else if (source == "server")
                {
                    var serverInfo = await FetchServerLayoutInfoAsync(serverUrl, serverPort, request.RemoteLayoutId);
                    remoteLastModified = serverInfo.lastModified;
                    isTemplate = serverInfo.isTemplate ? 1 : 0;
                }

                var subscription = new Model_Layout_Subscription
                {
                    ServerUrl = serverUrl,
                    ServerPort = serverPort,
                    ServerName = request.ServerName,
                    RemoteLayoutId = request.RemoteLayoutId,
                    RemoteLayoutName = request.LayoutName,
                    RemoteVariantId = request.RemoteVariantId,
                    LocalFilePath = request.LocalFilePath,
                    LocalFileName = Path.GetFileName(request.LocalFilePath),
                    LastDownloadedAt = DateTime.UtcNow.ToString("o"),
                    RemoteLastModified = remoteLastModified,
                    SubscribedAt = DateTime.UtcNow.ToString("o"),
                    IsActive = 1,
                    AutoUpdate = 1,
                    IsTemplate = isTemplate,
                    Source = source,
                    AuthorName = request.AuthorName,
                    AuthorUrl = request.AuthorUrl,
                    AuthorId = request.AuthorId,
                    AuthorAvatarUrl = request.AuthorAvatarUrl,
                };

                var id = await _subscriptionService.CreateSubscriptionAsync(subscription);

                // Extract thumbnail from ZIP
                await ExtractSubscriptionThumbnailAsync(id, request.LocalFilePath);

                return Ok(new
                {
                    success = true,
                    subscriptionId = id,
                    subscription = new
                    {
                        id,
                        server_url = subscription.ServerUrl,
                        server_port = subscription.ServerPort,
                        remote_layout_id = subscription.RemoteLayoutId,
                        layout_name = subscription.RemoteLayoutName,
                        local_file_path = subscription.LocalFilePath,
                        auto_update = subscription.AutoUpdate == 1,
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // UNSUBSCRIBE
        // ============================================================================

        /// <summary>POST /api/subscriptions/unsubscribe — delete subscription + local ZIP</summary>
        [HttpPost("unsubscribe")]
        public async Task<IActionResult> Unsubscribe([FromBody] UnsubscribeRequest request)
        {
            try
            {
                var subscription = await _subscriptionService.GetSubscriptionByIdAsync(request.SubscriptionId);
                if (subscription == null)
                    return NotFound(new { success = false, error = "Subscription not found" });

                // Clean up subscription thumbnail
                CleanupSubscriptionThumbnail(subscription);

                // Delete the local ZIP file
                if (!string.IsNullOrEmpty(subscription.LocalFilePath) &&
                    System.IO.File.Exists(subscription.LocalFilePath))
                {
                    try
                    {
                        System.IO.File.Delete(subscription.LocalFilePath);
                        Console.WriteLine($"[SUBSCRIPTIONS] Deleted local file: {subscription.LocalFilePath}");
                    }
                    catch (Exception fileEx)
                    {
                        Console.WriteLine($"[SUBSCRIPTIONS] Failed to delete local file: {fileEx.Message}");
                    }
                }

                await _subscriptionService.DeleteSubscriptionAsync(request.SubscriptionId);

                return Ok(new { success = true, message = "Unsubscribed successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // CHECK UPDATES
        // ============================================================================

        /// <summary>GET /api/subscriptions/check-updates — check all subscriptions for updates</summary>
        [HttpGet("check-updates")]
        public async Task<IActionResult> CheckUpdates()
        {
            try
            {
                var subscriptions = await _subscriptionService.GetAllSubscriptionsAsync();
                var updates = new List<object>();

                // Group by source for efficient batch checking
                var cloudSubs = subscriptions.Where(s => s.Source == "cloud").ToList();
                var serverSubs = subscriptions.Where(s => s.Source == "server").ToList();

                // Check cloud subscriptions (batch, public endpoint — no auth required)
                var cloudVersionMap = new Dictionary<string, string>();
                var cloudReachable = false;
                if (cloudSubs.Count > 0)
                {
                    var templateIds = cloudSubs.Select(s => s.RemoteLayoutId).Distinct().ToList();
                    var versions = await FetchCloudVersionsBatchAsync(templateIds);
                    if (versions != null)
                    {
                        cloudReachable = true;
                        cloudVersionMap = versions;
                    }
                }

                foreach (var sub in cloudSubs)
                {
                    cloudVersionMap.TryGetValue(sub.RemoteLayoutId, out var currentVersionId);
                    var updateAvailable = cloudReachable && currentVersionId != null &&
                                          currentVersionId != sub.RemoteLastModified;

                    var autoApplied = false;
                    if (updateAvailable && sub.AutoUpdate == 1)
                    {
                        autoApplied = await TryApplyCloudUpdateAsync(sub, currentVersionId!);
                    }

                    updates.Add(new
                    {
                        subscriptionId = sub.Id,
                        remoteLayoutId = sub.RemoteLayoutId,
                        source = "cloud",
                        reachable = cloudReachable,
                        updateAvailable = autoApplied ? false : updateAvailable,
                        autoUpdate = sub.AutoUpdate == 1,
                        autoApplied,
                    });
                }

                // Check server subscriptions
                foreach (var sub in serverSubs)
                {
                    var serverInfo = await FetchServerLayoutInfoAsync(
                        sub.ServerUrl, sub.ServerPort, sub.RemoteLayoutId);

                    var updateAvailable = serverInfo.lastModified != null &&
                                          serverInfo.lastModified != sub.RemoteLastModified;

                    var autoApplied = false;
                    if (updateAvailable && sub.AutoUpdate == 1)
                    {
                        autoApplied = await TryApplyServerUpdateAsync(sub, serverInfo.lastModified!);
                    }

                    updates.Add(new
                    {
                        subscriptionId = sub.Id,
                        remoteLayoutId = sub.RemoteLayoutId,
                        source = "server",
                        reachable = serverInfo.reachable,
                        updateAvailable,
                        autoUpdate = sub.AutoUpdate == 1,
                        autoApplied,
                    });
                }

                return Ok(new { success = true, updates });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // APPLY UPDATE
        // ============================================================================

        /// <summary>POST /api/subscriptions/apply-update — manually apply a subscription update</summary>
        [HttpPost("apply-update")]
        public async Task<IActionResult> ApplyUpdate([FromBody] ApplyUpdateRequest request)
        {
            try
            {
                var subscription = await _subscriptionService.GetSubscriptionByIdAsync(request.SubscriptionId);
                if (subscription == null)
                    return NotFound(new { success = false, error = "Subscription not found" });

                bool applied;
                if (subscription.Source == "cloud")
                {
                    var versions = await FetchCloudVersionsBatchAsync(new List<string> { subscription.RemoteLayoutId });
                    var currentVersionId = versions?.GetValueOrDefault(subscription.RemoteLayoutId);
                    applied = await TryApplyCloudUpdateAsync(subscription, currentVersionId ?? "");
                }
                else
                {
                    var serverInfo = await FetchServerLayoutInfoAsync(
                        subscription.ServerUrl, subscription.ServerPort, subscription.RemoteLayoutId);
                    applied = await TryApplyServerUpdateAsync(subscription, serverInfo.lastModified ?? "");
                }

                if (applied)
                    return Ok(new { success = true, message = "Update applied successfully" });

                return StatusCode(500, new { success = false, error = "Failed to apply update" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // AUTO-UPDATE TOGGLE
        // ============================================================================

        /// <summary>PUT /api/subscriptions/{id}/auto-update — toggle auto-update</summary>
        [HttpPut("{id}/auto-update")]
        public async Task<IActionResult> ToggleAutoUpdate(int id, [FromBody] ToggleAutoUpdateRequest request)
        {
            try
            {
                var subscription = await _subscriptionService.GetSubscriptionByIdAsync(id);
                if (subscription == null)
                    return NotFound(new { success = false, error = "Subscription not found" });

                await _subscriptionService.SetAutoUpdateAsync(id, request.Enabled);

                return Ok(new { success = true, message = $"Auto-update {(request.Enabled ? "enabled" : "disabled")}" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // LOOKUP BY REMOTE
        // ============================================================================

        /// <summary>GET /api/subscriptions/by-remote/{serverUrl}/{port}/{layoutId}</summary>
        [HttpGet("by-remote/{serverUrl}/{port}/{layoutId}")]
        public async Task<IActionResult> GetByRemote(string serverUrl, string port, string layoutId)
        {
            try
            {
                var subscription = await _subscriptionService.GetSubscriptionByRemoteLayoutAsync(
                    serverUrl, port, layoutId);

                if (subscription == null)
                    return Ok(new { success = true, subscribed = false });

                return Ok(new
                {
                    success = true,
                    subscribed = true,
                    subscription = new
                    {
                        id = subscription.Id,
                        server_url = subscription.ServerUrl,
                        server_port = subscription.ServerPort,
                        remote_layout_id = subscription.RemoteLayoutId,
                        layout_name = subscription.RemoteLayoutName,
                        local_file_path = subscription.LocalFilePath,
                        auto_update = subscription.AutoUpdate == 1,
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        // ============================================================================
        // HELPERS — Cloud Version Info
        // ============================================================================

        /// <summary>
        /// Batch-check cloud template versions using the public endpoint (no auth required).
        /// Matches XSD's cloudApiClient.checkTemplateVersions() implementation.
        /// </summary>
        private async Task<Dictionary<string, string>?> FetchCloudVersionsBatchAsync(List<string> templateIds)
        {
            try
            {
                var cloudBaseUrl = Environment.GetEnvironmentVariable("CLOUD_BACKEND_URL")?.TrimEnd('/')
                    ?? "https://api.junctionrelay.com";

                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(10);

                var result = new Dictionary<string, string>();

                // The cloud's check-versions accepts at most 50 ids per call.
                foreach (var batch in templateIds.Chunk(50))
                {
                    var response = await client.PostAsJsonAsync(
                        $"{cloudBaseUrl}/api/public/framexchange/templates/check-versions",
                        new { templateIds = batch });

                    if (!response.IsSuccessStatusCode)
                    {
                        Console.WriteLine($"[SUBSCRIPTIONS] Cloud batch version check failed: {response.StatusCode}");
                        return null;
                    }

                    var json = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
                    if (json.TryGetProperty("versions", out var versionsArray))
                    {
                        foreach (var v in versionsArray.EnumerateArray())
                        {
                            if (v.TryGetProperty("templateId", out var tidProp) &&
                                v.TryGetProperty("currentVersionId", out var vidProp))
                            {
                                var tid = tidProp.GetString();
                                var vid = vidProp.GetString();
                                if (tid != null && vid != null)
                                    result[tid] = vid;
                            }
                        }
                    }
                }

                Console.WriteLine($"[SUBSCRIPTIONS] Got version info for {result.Count}/{templateIds.Count} templates");
                return result;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SUBSCRIPTIONS] Failed to batch-check cloud versions: {ex.Message}");
                return null;
            }
        }

        // ============================================================================
        // HELPERS — Server Layout Info
        // ============================================================================

        private async Task<(bool reachable, string? lastModified, bool isTemplate)> FetchServerLayoutInfoAsync(
            string serverUrl, string serverPort, string layoutId)
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(5);

                var url = $"http://{serverUrl}:{serverPort}/api/frameengine/{layoutId}";
                var response = await client.GetAsync(url);
                if (!response.IsSuccessStatusCode)
                    return (false, null, false);

                var json = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
                var lastModified = json.TryGetProperty("lastModified", out var lmProp)
                    ? lmProp.GetString()
                    : null;
                var isTemplate = json.TryGetProperty("isTemplate", out var tProp) && tProp.GetBoolean();

                return (true, lastModified, isTemplate);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SUBSCRIPTIONS] Failed to reach server {serverUrl}:{serverPort}: {ex.Message}");
                return (false, null, false);
            }
        }

        // ============================================================================
        // HELPERS — Apply Updates
        // ============================================================================

        private async Task<bool> TryApplyCloudUpdateAsync(Model_Layout_Subscription subscription, string newVersionId)
        {
            try
            {
                var token = await _sessionStore.GetValidAccessTokenAsync();
                if (string.IsNullOrEmpty(token)) return false;

                var cloudBaseUrl = Environment.GetEnvironmentVariable("CLOUD_BACKEND_URL")?.TrimEnd('/')
                    ?? "https://api.junctionrelay.com";

                var client = _httpClientFactory.CreateClient();
                client.DefaultRequestHeaders.Authorization =
                    new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                client.Timeout = TimeSpan.FromMinutes(5);

                // Get presigned download URL
                var variantId = subscription.RemoteVariantId ?? subscription.RemoteLayoutId;
                var downloadResponse = await client.GetAsync(
                    $"{cloudBaseUrl}/api/public/framexchange/templates/{subscription.RemoteLayoutId}/variants/{variantId}/download-url");

                if (!downloadResponse.IsSuccessStatusCode) return false;

                var downloadJson = await downloadResponse.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
                var downloadUrl = downloadJson.TryGetProperty("downloadUrl", out var urlProp)
                    ? urlProp.GetString()
                    : null;

                if (string.IsNullOrEmpty(downloadUrl)) return false;

                // Download the ZIP
                using var s3Client = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
                var zipBytes = await s3Client.GetByteArrayAsync(downloadUrl);

                // Write to temp file then rename (atomic)
                var tempPath = subscription.LocalFilePath + ".tmp";
                await System.IO.File.WriteAllBytesAsync(tempPath, zipBytes);
                System.IO.File.Move(tempPath, subscription.LocalFilePath, overwrite: true);

                await _subscriptionService.UpdateLastDownloadedAsync(subscription.Id, newVersionId);

                // Re-extract thumbnail from updated ZIP
                await ExtractSubscriptionThumbnailAsync(subscription.Id, subscription.LocalFilePath);

                Console.WriteLine($"[SUBSCRIPTIONS] Applied cloud update for subscription {subscription.Id}");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SUBSCRIPTIONS] Failed to apply cloud update: {ex.Message}");
                return false;
            }
        }

        private async Task<bool> TryApplyServerUpdateAsync(Model_Layout_Subscription subscription, string newLastModified)
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromMinutes(5);

                var url = $"http://{subscription.ServerUrl}:{subscription.ServerPort}/api/frameengine/{subscription.RemoteLayoutId}/export-standalone";
                var zipBytes = await client.GetByteArrayAsync(url);

                // Write to temp file then rename (atomic)
                var tempPath = subscription.LocalFilePath + ".tmp";
                await System.IO.File.WriteAllBytesAsync(tempPath, zipBytes);
                System.IO.File.Move(tempPath, subscription.LocalFilePath, overwrite: true);

                await _subscriptionService.UpdateLastDownloadedAsync(subscription.Id, newLastModified);

                // Re-extract thumbnail from updated ZIP
                await ExtractSubscriptionThumbnailAsync(subscription.Id, subscription.LocalFilePath);

                Console.WriteLine($"[SUBSCRIPTIONS] Applied server update for subscription {subscription.Id}");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SUBSCRIPTIONS] Failed to apply server update: {ex.Message}");
                return false;
            }
        }

        // ============================================================================
        // HELPERS — Subscription Thumbnail Extraction
        // ============================================================================

        private async Task ExtractSubscriptionThumbnailAsync(int subscriptionId, string zipPath)
        {
            try
            {
                if (!System.IO.File.Exists(zipPath)) return;

                var dataDir = Path.GetDirectoryName(_dbPathProvider.DbPath) ?? "data";
                var thumbnailDir = Path.Combine(dataDir, "frameengine", "thumbnails");
                Directory.CreateDirectory(thumbnailDir);

                using var zipStream = System.IO.File.OpenRead(zipPath);
                using var archive = new ZipArchive(zipStream, ZipArchiveMode.Read);

                var thumbnailEntry = archive.Entries.FirstOrDefault(e =>
                    e.FullName.StartsWith("thumbnails/") &&
                    (e.FullName.EndsWith(".png") || e.FullName.EndsWith(".jpg") ||
                     e.FullName.EndsWith(".jpeg") || e.FullName.EndsWith(".webp")));

                if (thumbnailEntry == null) return;

                var format = Path.GetExtension(thumbnailEntry.FullName).TrimStart('.');
                var fileName = $"sub_{subscriptionId}.{format}";
                var fullPath = Path.Combine(thumbnailDir, fileName);
                var relativePath = $"frameengine/thumbnails/{fileName}";

                using (var entryStream = thumbnailEntry.Open())
                using (var fileStream = System.IO.File.Create(fullPath))
                {
                    await entryStream.CopyToAsync(fileStream);
                }

                await _subscriptionService.UpdateThumbnailAsync(subscriptionId, true, relativePath, format);
                Console.WriteLine($"[SUBSCRIPTIONS] Extracted thumbnail for subscription {subscriptionId}: {relativePath}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SUBSCRIPTIONS] Failed to extract subscription thumbnail: {ex.Message}");
            }
        }

        private void CleanupSubscriptionThumbnail(Model_Layout_Subscription subscription)
        {
            if (subscription.HasThumbnail != 1 || string.IsNullOrEmpty(subscription.ThumbnailPath)) return;

            try
            {
                var dataDir = Path.GetDirectoryName(_dbPathProvider.DbPath) ?? "data";
                var thumbPath = Path.IsPathRooted(subscription.ThumbnailPath)
                    ? subscription.ThumbnailPath
                    : Path.Combine(dataDir, subscription.ThumbnailPath);

                if (System.IO.File.Exists(thumbPath))
                {
                    System.IO.File.Delete(thumbPath);
                    Console.WriteLine($"[SUBSCRIPTIONS] Deleted subscription thumbnail: {thumbPath}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SUBSCRIPTIONS] Failed to delete subscription thumbnail: {ex.Message}");
            }
        }

        // ============================================================================
        // REQUEST DTOs
        // ============================================================================

        public class SubscribeRequest
        {
            public string? ServerUrl { get; set; }
            public string? ServerPort { get; set; }
            public string? ServerName { get; set; }
            public string? SourceType { get; set; }
            public string RemoteLayoutId { get; set; } = string.Empty;
            public string? RemoteVariantId { get; set; }
            public string LayoutName { get; set; } = string.Empty;
            public string LocalFilePath { get; set; } = string.Empty;
            public string? AuthorName { get; set; }
            public string? AuthorUrl { get; set; }
            public string? AuthorId { get; set; }
            public string? AuthorAvatarUrl { get; set; }
        }

        public class UnsubscribeRequest
        {
            public int SubscriptionId { get; set; }
        }

        public class ApplyUpdateRequest
        {
            public int SubscriptionId { get; set; }
        }

        public class ToggleAutoUpdateRequest
        {
            public bool Enabled { get; set; }
        }
    }
}
