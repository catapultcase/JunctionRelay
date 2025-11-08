using Microsoft.AspNetCore.Mvc;
using JunctionRelayServer.Services;
using System.Text.Json;
using System.Text;

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("api/cloud-backups")]
    public class Controller_CloudBackups : ControllerBase
    {
        private readonly Service_Backups _backupService;
        private readonly Service_CloudBackups_Manifest _manifestBackupService;
        private readonly Service_CloudSessionStore _cloudSessionStore;
        private readonly Service_BackendIdentity _backendIdentityService;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Service_BackupProgressTracker _progressTracker;
        private readonly Service_FrameEngine_AssetPathResolver _assetPathResolver;

        public Controller_CloudBackups(
            Service_Backups backupService,
            Service_CloudBackups_Manifest manifestBackupService,
            Service_CloudSessionStore cloudSessionStore,
            Service_BackendIdentity backendIdentityService,
            IHttpClientFactory httpClientFactory,
            Service_BackupProgressTracker progressTracker,
            Service_FrameEngine_AssetPathResolver assetPathResolver)
        {
            _backupService = backupService;
            _manifestBackupService = manifestBackupService;
            _cloudSessionStore = cloudSessionStore;
            _backendIdentityService = backendIdentityService;
            _httpClientFactory = httpClientFactory;
            _progressTracker = progressTracker;
            _assetPathResolver = assetPathResolver;
        }

        [HttpGet("status")]
        public async Task<IActionResult> GetBackupStatus()
        {
            try
            {
                // Get backend ID to fetch settings for this specific backend
                var backendId = _backendIdentityService.GetBackendId();
                var result = await CallCloudBackupApiAsync("GET", $"/cloud-backups/status?backendId={backendId}");

                if (result.Success)
                {
                    return Ok(result.Data);
                }
                else
                {
                    Console.WriteLine($"[CLOUD_BACKUPS] Failed to get status: {result.ErrorMessage}");
                    return StatusCode(500, new { error = result.ErrorMessage });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_BACKUPS] Error getting backup status: {ex.Message}");
                return StatusCode(500, new { error = "Failed to get backup status" });
            }
        }

        [HttpPost("settings")]
        public async Task<IActionResult> UpdateBackupSettings([FromBody] BackupSettingsRequest request)
        {
            try
            {
                // Add backend ID to the request
                var backendId = _backendIdentityService.GetBackendId();

                var requestWithBackendId = new
                {
                    backendId = backendId,
                    enabled = request.Enabled,
                    frequency = request.Frequency,
                    retentionDays = request.RetentionDays,
                    includeKeys = request.IncludeKeys ?? true,
                    includeIdentity = request.IncludeIdentity ?? true,
                    includeFrameEngine = request.IncludeFrameEngine ?? true,
                };

                var result = await CallCloudBackupApiAsync("POST", "/cloud-backups/settings", requestWithBackendId);

                if (result.Success)
                {
                    return Ok(result.Data);
                }
                else
                {
                    Console.WriteLine($"[CLOUD_BACKUPS] Failed to update settings: {result.ErrorMessage}");
                    return StatusCode(500, new { error = result.ErrorMessage });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_BACKUPS] Error updating backup settings: {ex.Message}");
                return StatusCode(500, new { error = "Failed to update backup settings" });
            }
        }

        [HttpPost("create")]
        public async Task<IActionResult> CreateBackup([FromBody] CreateCloudBackupRequest request)
        {
            // Create operation ID and start async background task
            var operationId = _progressTracker.CreateOperation();

            // Start backup in background
            _ = Task.Run(async () => await ProcessBackupAsync(operationId, request));

            // Return operation ID immediately for progress polling
            return Ok(new { operationId = operationId });
        }

        private async Task ProcessBackupAsync(string operationId, CreateCloudBackupRequest request)
        {
            try
            {
                Console.WriteLine($"[CLOUD_BACKUPS] Creating backup for cloud upload (IncludeFrameEngine={request.IncludeFrameEngine})...");

                byte[] backupData;
                string filename;
                object? manifest = null;

                // Choose backup strategy based on IncludeFrameEngine flag
                if (request.IncludeFrameEngine)
                {
                    // Use manifest-based backup (includes FrameEngine references)
                    var manifestOptions = new Service_CloudBackups_Manifest.CloudBackupOptions
                    {
                        IncludeKeys = request.IncludeKeys,
                        IncludeIdentity = request.IncludeIdentity,
                        IncludeFrameEngine = true,
                        ProgressCallback = (update) =>
                        {
                            _progressTracker.UpdateProgress(
                                operationId,
                                update.Stage,
                                update.Message,
                                update.CurrentItem,
                                update.TotalItems,
                                update.ItemName
                            );
                        }
                    };

                    var manifestResult = await _manifestBackupService.CreateCloudBackupAsync(manifestOptions);
                    if (!manifestResult.Success || manifestResult.BackupData == null)
                    {
                        _progressTracker.FailOperation(operationId, manifestResult.ErrorMessage ?? "Failed to create manifest-based backup");
                        return;
                    }

                    backupData = manifestResult.BackupData;
                    filename = manifestResult.Filename!;
                    manifest = manifestResult.Manifest;

                    Console.WriteLine("[CLOUD_BACKUPS] Created manifest-based backup with FrameEngine references");
                }
                else
                {
                    // Use traditional backup (no FrameEngine)
                    var traditionalOptions = new Service_Backups.BackupOptions
                    {
                        IncludeKeys = request.IncludeKeys,
                        IncludeIdentity = request.IncludeIdentity,
                    };

                    var traditionalResult = await _backupService.CreateBackupAsync(traditionalOptions);
                    if (!traditionalResult.Success || traditionalResult.BackupData == null)
                    {
                        _progressTracker.FailOperation(operationId, traditionalResult.ErrorMessage ?? "Failed to create traditional backup");
                        return;
                    }

                    backupData = traditionalResult.BackupData;
                    filename = traditionalResult.Filename!;

                    Console.WriteLine("[CLOUD_BACKUPS] Created traditional backup without FrameEngine");
                }

                // Get backend ID
                var backendId = _backendIdentityService.GetBackendId();

                // Request upload URL from cloud
                _progressTracker.UpdateProgress(operationId, "uploading", "Requesting upload URL from cloud...");

                var uploadRequest = new
                {
                    filename = filename,
                    backendId = backendId,
                    uncompressedSize = backupData.Length,
                    compressedSize = backupData.Length,
                    manifest = manifest  // Include manifest if available
                };

                var requestUploadResult = await CallCloudBackupApiAsync("POST", "/cloud-backups/request-upload", uploadRequest);
                if (!requestUploadResult.Success)
                {
                    _progressTracker.FailOperation(operationId, requestUploadResult.ErrorMessage ?? "Failed to request upload URL");
                    return;
                }

                var uploadResponse = JsonSerializer.Deserialize<JsonElement>(requestUploadResult.Data!.ToString()!);
                var backupId = uploadResponse.GetProperty("backupId").GetString();
                var uploadUrl = uploadResponse.GetProperty("uploadUrl").GetString();

                Console.WriteLine($"[CLOUD_BACKUPS] Got upload URL for backup {backupId}");

                // Upload to S3 (use application/octet-stream to match presigned URL)
                var sizeMB = (backupData.Length / 1024.0 / 1024.0).ToString("F2");
                _progressTracker.UpdateProgress(operationId, "uploading", $"Uploading backup to cloud storage ({sizeMB} MB)...");

                var uploadSuccess = await UploadToS3Async(uploadUrl!, backupData, "application/octet-stream");
                if (!uploadSuccess)
                {
                    _progressTracker.FailOperation(operationId, "Failed to upload backup to cloud storage");
                    return;
                }

                Console.WriteLine("[CLOUD_BACKUPS] Successfully uploaded backup to cloud storage");

                // Confirm upload
                _progressTracker.UpdateProgress(operationId, "completing", "Finalizing backup...");

                var completeRequest = new
                {
                    backupId = backupId,
                    actualCompressedSize = backupData.Length,
                    manifest = manifest  // Include manifest in completion
                };

                var completeResult = await CallCloudBackupApiAsync("POST", "/cloud-backups/complete-upload", completeRequest);
                if (!completeResult.Success)
                {
                    Console.WriteLine($"[CLOUD_BACKUPS] Warning: Upload completed but failed to confirm: {completeResult.ErrorMessage}");
                }

                var backupType = request.IncludeFrameEngine ? "manifest-based backup with FrameEngine" : "traditional backup";
                Console.WriteLine($"[CLOUD_BACKUPS] Cloud {backupType} completed successfully");

                _progressTracker.CompleteOperation(operationId);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_BACKUPS] Error creating cloud backup: {ex.Message}");
                _progressTracker.FailOperation(operationId, ex.Message);
            }
        }

        [HttpGet("progress/{operationId}")]
        public IActionResult GetBackupProgress(string operationId)
        {
            var progress = _progressTracker.GetProgress(operationId);
            if (progress == null)
            {
                return NotFound(new { error = "Operation not found" });
            }

            return Ok(progress);
        }

        [HttpGet("download-result/{operationId}")]
        public IActionResult GetDownloadResult(string operationId)
        {
            try
            {
                var downloadPath = Path.Combine(Path.GetTempPath(), $"{operationId}.zip");

                if (!System.IO.File.Exists(downloadPath))
                {
                    return NotFound(new { error = "Download result not found or expired" });
                }

                var fileBytes = System.IO.File.ReadAllBytes(downloadPath);

                // Clean up the temp file after reading
                try
                {
                    System.IO.File.Delete(downloadPath);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[CLOUD_BACKUPS] Warning: Failed to delete temp file {downloadPath}: {ex.Message}");
                }

                return File(fileBytes, "application/zip", $"backup-restore-{operationId}.zip");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_BACKUPS] Error retrieving download result: {ex.Message}");
                return StatusCode(500, new { error = "Failed to retrieve download result" });
            }
        }

        [HttpPost("{backupId}/download")]
        public async Task<IActionResult> DownloadBackup(string backupId)
        {
            // Create operation ID and start async background task
            var operationId = _progressTracker.CreateOperation();

            // Start download in background
            _ = Task.Run(async () => await ProcessDownloadAsync(operationId, backupId));

            // Return operation ID immediately for progress polling
            return Ok(new { operationId = operationId });
        }

        private async Task ProcessDownloadAsync(string operationId, string backupId)
        {
            try
            {
                Console.WriteLine($"[CLOUD_BACKUPS] Starting manifest-based download for backup {backupId}");

                // 1. Fetch restore info with manifest
                _progressTracker.UpdateProgress(operationId, "fetching_manifest", "Fetching backup manifest...");

                var restoreInfoResult = await CallCloudBackupApiAsync("POST", $"/cloud-backups/{backupId}/restore-info");
                if (!restoreInfoResult.Success)
                {
                    _progressTracker.FailOperation(operationId, restoreInfoResult.ErrorMessage ?? "Failed to fetch restore info");
                    return;
                }

                // Parse the response - it's wrapped in { success: true, data: {...} }
                var response = JsonSerializer.Deserialize<JsonElement>(restoreInfoResult.Data!.ToString()!);
                var restoreInfo = response.GetProperty("data");

                var backupDownloadUrl = restoreInfo.GetProperty("backupDownloadUrl").GetString();
                var downloadUrls = restoreInfo.GetProperty("downloadUrls");
                var templateFrameLayouts = downloadUrls.GetProperty("templateFrameLayouts");
                var userFrameLayouts = downloadUrls.GetProperty("userFrameLayouts");

                // 2. Download backup database ZIP
                _progressTracker.UpdateProgress(operationId, "downloading_database", "Downloading backup database...");

                // Create a clean HTTP client for S3 downloads (no auth headers)
                using var s3HttpClient = new HttpClient();
                s3HttpClient.Timeout = TimeSpan.FromMinutes(10);

                var databaseZipBytes = await s3HttpClient.GetByteArrayAsync(backupDownloadUrl!);
                Console.WriteLine($"[CLOUD_BACKUPS] Downloaded database ZIP ({databaseZipBytes.Length} bytes)");

                // 3. Download template variant ZIPs (parallel)
                var templateCount = templateFrameLayouts.GetArrayLength();
                var templateDownloads = new List<(int frameId, string cloudVariantId, byte[] zipBytes)>();

                if (templateCount > 0)
                {
                    _progressTracker.UpdateProgress(operationId, "downloading_templates",
                        $"Downloading template variants...", 0, templateCount);

                    var templateTasks = new List<Task>();

                    var index = 0;
                    foreach (var template in templateFrameLayouts.EnumerateArray())
                    {
                        var frameId = template.GetProperty("frameId").GetInt32();
                        var cloudVariantId = template.GetProperty("cloudVariantId").GetString();
                        var downloadUrl = template.GetProperty("downloadUrl").GetString();
                        var currentIndex = index;

                        templateTasks.Add(Task.Run(async () =>
                        {
                            try
                            {
                                Console.WriteLine($"[CLOUD_BACKUPS] Downloading template {frameId} (variant {cloudVariantId})");
                                var zipBytes = await s3HttpClient.GetByteArrayAsync(downloadUrl!);
                                lock (templateDownloads)
                                {
                                    templateDownloads.Add((frameId, cloudVariantId!, zipBytes));
                                    _progressTracker.UpdateProgress(operationId, "downloading_templates",
                                        $"Downloading template variants...", currentIndex + 1, templateCount);
                                }
                                Console.WriteLine($"[CLOUD_BACKUPS] Template {frameId} downloaded successfully ({zipBytes.Length} bytes)");
                            }
                            catch (Exception ex)
                            {
                                Console.WriteLine($"[CLOUD_BACKUPS] ❌ Failed to download template {frameId}: {ex.Message}");
                                throw;
                            }
                        }));

                        index++;
                    }

                    await Task.WhenAll(templateTasks);
                    Console.WriteLine($"[CLOUD_BACKUPS] Downloaded {templateDownloads.Count} template variants");
                }

                // 4. Download snapshot assets (parallel)
                var snapshotCount = userFrameLayouts.GetArrayLength();
                var snapshotAssets = new List<(int frameId, string snapshotId, string assetPath, byte[] data)>();

                if (snapshotCount > 0)
                {
                    var totalAssets = 0;
                    foreach (var snapshot in userFrameLayouts.EnumerateArray())
                    {
                        totalAssets += snapshot.GetProperty("assets").GetArrayLength();
                    }

                    _progressTracker.UpdateProgress(operationId, "downloading_snapshots",
                        $"Downloading snapshot assets...", 0, totalAssets);

                    var assetTasks = new List<Task>();
                    var downloadedAssets = 0;

                    foreach (var snapshot in userFrameLayouts.EnumerateArray())
                    {
                        var frameId = snapshot.GetProperty("frameId").GetInt32();
                        var snapshotId = snapshot.GetProperty("snapshotId").GetString()!;
                        var assets = snapshot.GetProperty("assets");

                        foreach (var asset in assets.EnumerateArray())
                        {
                            var assetPath = asset.GetProperty("assetPath").GetString()!;
                            var downloadUrl = asset.GetProperty("downloadUrl").GetString()!;

                            assetTasks.Add(Task.Run(async () =>
                            {
                                var assetBytes = await s3HttpClient.GetByteArrayAsync(downloadUrl);
                                lock (snapshotAssets)
                                {
                                    snapshotAssets.Add((frameId, snapshotId, assetPath, assetBytes));
                                    downloadedAssets++;
                                    _progressTracker.UpdateProgress(operationId, "downloading_snapshots",
                                        $"Downloading snapshot assets...", downloadedAssets, totalAssets);
                                }
                            }));
                        }
                    }

                    await Task.WhenAll(assetTasks);
                    Console.WriteLine($"[CLOUD_BACKUPS] Downloaded {snapshotAssets.Count} snapshot assets");
                }

                // 5. Create final restore package
                _progressTracker.UpdateProgress(operationId, "packaging", "Creating restore package...");

                // Track deduplicated assets by path
                var addedAssets = new HashSet<string>();

                // Build CloudVariantId→frameId and SnapshotId→frameId mappings from manifest BEFORE creating output archive
                Dictionary<string, int> variantIdToFrameId = new Dictionary<string, int>();
                Dictionary<string, int> snapshotIdToFrameId = new Dictionary<string, int>();

                using (var backupZipStream = new MemoryStream(databaseZipBytes))
                using (var backupZip = new System.IO.Compression.ZipArchive(backupZipStream, System.IO.Compression.ZipArchiveMode.Read))
                {
                    var manifestEntry = backupZip.Entries.FirstOrDefault(e => e.Name == "frame-manifest.json");

                    if (manifestEntry != null)
                    {
                        using var manifestStream = manifestEntry.Open();
                        var manifest = await System.Text.Json.JsonSerializer.DeserializeAsync<JunctionRelay.Models.FrameManifest>(manifestStream);

                        if (manifest != null)
                        {
                            // Build template mapping
                            foreach (var template in manifest.TemplateFrameLayouts)
                            {
                                if (!string.IsNullOrEmpty(template.CloudVariantId))
                                {
                                    variantIdToFrameId[template.CloudVariantId] = template.LocalFrameId;
                                }
                            }

                            // Build snapshot mapping
                            foreach (var userLayout in manifest.UserFrameLayouts)
                            {
                                if (!string.IsNullOrEmpty(userLayout.SnapshotId))
                                {
                                    snapshotIdToFrameId[userLayout.SnapshotId] = userLayout.LocalFrameId;
                                }
                            }

                            Console.WriteLine($"[CLOUD_BACKUPS] Built mappings: {variantIdToFrameId.Count} templates, {snapshotIdToFrameId.Count} snapshots");
                        }
                    }
                }

                using var finalZipStream = new MemoryStream();
                using (var archive = new System.IO.Compression.ZipArchive(finalZipStream, System.IO.Compression.ZipArchiveMode.Create, true))
                {
                    // Extract backup.zip contents into root (skip manifest - only needed during reconstruction)
                    using (var backupZipStream = new MemoryStream(databaseZipBytes))
                    using (var backupZip = new System.IO.Compression.ZipArchive(backupZipStream, System.IO.Compression.ZipArchiveMode.Read))
                    {
                        foreach (var entry in backupZip.Entries)
                        {
                            if (entry.Length == 0) continue; // Skip directories
                            if (entry.Name.Equals("frame-manifest.json", StringComparison.OrdinalIgnoreCase)) continue; // Skip manifest

                            var destEntry = archive.CreateEntry(entry.FullName);
                            using var sourceStream = entry.Open();
                            using var destStream = destEntry.Open();
                            await sourceStream.CopyToAsync(destStream);
                        }
                    }

                    // Extract template variant ZIPs directly into frameengine/ (skip config.json, dedupe, rename thumbnails)
                    if (templateCount > 0)
                    {
                        foreach (var (frameId, cloudVariantId, zipBytes) in templateDownloads)
                        {
                            // Extract the template variant ZIP directly into frameengine/
                            using var templateZipStream = new MemoryStream(zipBytes);
                            using var templateZip = new System.IO.Compression.ZipArchive(templateZipStream, System.IO.Compression.ZipArchiveMode.Read);

                            foreach (var entry in templateZip.Entries)
                            {
                                if (entry.Length == 0) continue; // Skip directories
                                if (entry.FullName.Equals("config.json", StringComparison.OrdinalIgnoreCase)) continue; // Skip config.json

                                var destPath = $"frameengine/{entry.FullName}";

                                // Special handling for thumbnails - rename to match database frameId using service
                                if (_assetPathResolver.IsThumbnailPath(entry.FullName))
                                {
                                    if (variantIdToFrameId.TryGetValue(cloudVariantId, out var correctFrameId))
                                    {
                                        var resolvedPath = _assetPathResolver.ResolveThumbnailPath(entry.FullName, correctFrameId);
                                        destPath = $"frameengine/{resolvedPath}";
                                    }
                                }

                                // Skip if already added (dedupe)
                                if (addedAssets.Contains(destPath))
                                {
                                    continue;
                                }
                                addedAssets.Add(destPath);

                                var destEntry = archive.CreateEntry(destPath);

                                using var sourceStream = entry.Open();
                                using var destStream = destEntry.Open();
                                await sourceStream.CopyToAsync(destStream);
                            }
                        }
                    }

                    // Add snapshot assets directly into frameengine/ (dedupe, rename thumbnails)
                    if (snapshotCount > 0)
                    {
                        foreach (var (frameId, snapshotId, assetPath, data) in snapshotAssets)
                        {
                            var destPath = $"frameengine/{assetPath}";

                            // Special handling for thumbnails - rename to match database frameId using service
                            if (_assetPathResolver.IsThumbnailPath(assetPath))
                            {
                                if (snapshotIdToFrameId.TryGetValue(snapshotId, out var correctFrameId))
                                {
                                    var resolvedPath = _assetPathResolver.ResolveThumbnailPath(assetPath, correctFrameId);
                                    destPath = $"frameengine/{resolvedPath}";
                                }
                            }

                            // Skip if already added (dedupe)
                            if (addedAssets.Contains(destPath))
                            {
                                continue;
                            }
                            addedAssets.Add(destPath);

                            var assetEntry = archive.CreateEntry(destPath);
                            using (var assetEntryStream = assetEntry.Open())
                            {
                                await assetEntryStream.WriteAsync(data, 0, data.Length);
                            }
                        }
                    }
                }

                finalZipStream.Position = 0;
                var finalZipBytes = finalZipStream.ToArray();

                // Store the final ZIP for download
                var downloadPath = Path.Combine(Path.GetTempPath(), $"{operationId}.zip");
                await System.IO.File.WriteAllBytesAsync(downloadPath, finalZipBytes);

                Console.WriteLine($"[CLOUD_BACKUPS] Restore package created ({finalZipBytes.Length} bytes) at {downloadPath}");
                _progressTracker.CompleteOperation(operationId);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_BACKUPS] Error downloading backup: {ex.Message}");
                _progressTracker.FailOperation(operationId, ex.Message);
            }
        }

        [HttpGet("list")]
        public async Task<IActionResult> ListBackups([FromQuery] int limit = 50)
        {
            try
            {
                var result = await CallCloudBackupApiAsync("GET", $"/cloud-backups/list?limit={limit}");

                if (result.Success)
                {
                    return Ok(result.Data);
                }
                else
                {
                    Console.WriteLine($"[CLOUD_BACKUPS] Failed to list backups: {result.ErrorMessage}");
                    return StatusCode(500, new { error = result.ErrorMessage });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_BACKUPS] Error listing backups: {ex.Message}");
                return StatusCode(500, new { error = "Failed to list backups" });
            }
        }

        [HttpPost("{backupId}/request-download")]
        public async Task<IActionResult> RequestDownload(string backupId)
        {
            try
            {
                var result = await CallCloudBackupApiAsync("POST", $"/cloud-backups/{backupId}/request-download");

                if (result.Success)
                {
                    return Ok(result.Data);
                }
                else if (result.StatusCode == 404)
                {
                    return NotFound(new { error = "Backup not found" });
                }
                else
                {
                    Console.WriteLine($"[CLOUD_BACKUPS] Failed to request download: {result.ErrorMessage}");
                    return StatusCode(500, new { error = result.ErrorMessage });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_BACKUPS] Error requesting download: {ex.Message}");
                return StatusCode(500, new { error = "Failed to request download" });
            }
        }

        [HttpDelete("{backupId}")]
        public async Task<IActionResult> DeleteBackup(string backupId)
        {
            try
            {
                var result = await CallCloudBackupApiAsync("DELETE", $"/cloud-backups/{backupId}");

                if (result.Success)
                {
                    return Ok(result.Data);
                }
                else if (result.StatusCode == 404)
                {
                    return NotFound(new { error = "Backup not found" });
                }
                else
                {
                    Console.WriteLine($"[CLOUD_BACKUPS] Failed to delete backup: {result.ErrorMessage}");
                    return StatusCode(500, new { error = result.ErrorMessage });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_BACKUPS] Error deleting backup: {ex.Message}");
                return StatusCode(500, new { error = "Failed to delete backup" });
            }
        }

        private async Task<CloudApiResult> CallCloudBackupApiAsync(string method, string endpoint, object? body = null)
        {
            try
            {
                var token = await _cloudSessionStore.GetValidAccessTokenAsync();
                if (string.IsNullOrEmpty(token))
                {
                    return new CloudApiResult { Success = false, ErrorMessage = "No valid cloud authentication token" };
                }

                using var httpClient = _httpClientFactory.CreateClient();
                httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                var cloudBaseUrl = Environment.GetEnvironmentVariable("CLOUD_BACKEND_URL") ?? "https://api.junctionrelay.com";
                var fullUrl = $"{cloudBaseUrl.TrimEnd('/')}{endpoint}";

                HttpResponseMessage response;
                if (method.ToUpper() == "GET")
                {
                    response = await httpClient.GetAsync(fullUrl);
                }
                else if (method.ToUpper() == "DELETE")
                {
                    response = await httpClient.DeleteAsync(fullUrl);
                }
                else
                {
                    var json = body != null ? JsonSerializer.Serialize(body, new JsonSerializerOptions
                    {
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                    }) : "{}";

                    var content = new StringContent(json, Encoding.UTF8, "application/json");

                    if (method.ToUpper() == "POST")
                    {
                        response = await httpClient.PostAsync(fullUrl, content);
                    }
                    else if (method.ToUpper() == "PUT")
                    {
                        response = await httpClient.PutAsync(fullUrl, content);
                    }
                    else
                    {
                        return new CloudApiResult { Success = false, ErrorMessage = $"Unsupported HTTP method: {method}" };
                    }
                }

                var responseContent = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    var responseData = JsonSerializer.Deserialize<object>(responseContent);
                    return new CloudApiResult { Success = true, Data = responseData };
                }
                else
                {
                    var errorMessage = "Unknown error";
                    try
                    {
                        var errorObj = JsonSerializer.Deserialize<JsonElement>(responseContent);
                        if (errorObj.TryGetProperty("error", out var errorProp))
                        {
                            errorMessage = errorProp.GetString() ?? errorMessage;
                        }
                        else if (errorObj.TryGetProperty("message", out var messageProp))
                        {
                            errorMessage = messageProp.GetString() ?? errorMessage;
                        }
                    }
                    catch
                    {
                        errorMessage = responseContent.Length > 100 ? responseContent.Substring(0, 100) + "..." : responseContent;
                    }

                    return new CloudApiResult
                    {
                        Success = false,
                        ErrorMessage = errorMessage,
                        StatusCode = (int)response.StatusCode
                    };
                }
            }
            catch (Exception ex)
            {
                return new CloudApiResult { Success = false, ErrorMessage = ex.Message };
            }
        }

        private async Task<bool> UploadToS3Async(string uploadUrl, byte[] data, string contentType)
        {
            try
            {
                using var httpClient = _httpClientFactory.CreateClient();
                httpClient.Timeout = TimeSpan.FromMinutes(10); // Longer timeout for large uploads

                using var content = new ByteArrayContent(data);
                content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(contentType);

                var response = await httpClient.PutAsync(uploadUrl, content);
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_BACKUPS] S3 upload error: {ex.Message}");
                return false;
            }
        }

        public class CreateCloudBackupRequest
        {
            public bool IncludeKeys { get; set; } = true;
            public bool IncludeIdentity { get; set; } = true;
            public bool IncludeFrameEngine { get; set; } = true;
        }

        public class BackupSettingsRequest
        {
            public bool Enabled { get; set; }
            public string Frequency { get; set; } = "daily";
            public int RetentionDays { get; set; } = 30;
            public bool? IncludeKeys { get; set; }
            public bool? IncludeIdentity { get; set; }
            public bool? IncludeFrameEngine { get; set; }
        }

        private class CloudApiResult
        {
            public bool Success { get; set; }
            public object? Data { get; set; }
            public string? ErrorMessage { get; set; }
            public int StatusCode { get; set; }
        }
    }
}