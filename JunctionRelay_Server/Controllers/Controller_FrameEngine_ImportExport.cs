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
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("api/frameengine")]
    public class Controller_FrameEngine_ImportExport : ControllerBase
    {
        private readonly Service_Database_Manager_FrameEngine _frameLayoutService;
        private readonly Service_Database_Manager_JunctionLinks _junctionLinksService;
        private readonly IWebHostEnvironment _webHostEnvironment;
        private readonly DatabasePathProvider _dbPathProvider;
        private readonly Service_CloudSessionStore _cloudSessionStore;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Service_Unified_Notification_Broadcaster _unifiedNotificationBroadcaster;

        public Controller_FrameEngine_ImportExport(
            Service_Database_Manager_FrameEngine frameLayoutService,
            Service_Database_Manager_JunctionLinks junctionLinksService,
            IWebHostEnvironment webHostEnvironment,
            DatabasePathProvider dbPathProvider,
            Service_CloudSessionStore cloudSessionStore,
            IHttpClientFactory httpClientFactory,
            Service_Unified_Notification_Broadcaster unifiedNotificationBroadcaster)
        {
            _frameLayoutService = frameLayoutService;
            _junctionLinksService = junctionLinksService;
            _webHostEnvironment = webHostEnvironment;
            _dbPathProvider = dbPathProvider;
            _cloudSessionStore = cloudSessionStore;
            _httpClientFactory = httpClientFactory;
            _unifiedNotificationBroadcaster = unifiedNotificationBroadcaster;
        }

        // ============================================================================
        // IMPORT PACKAGE
        // ============================================================================

        [HttpPost("import-package")]
        public async Task<ActionResult> ImportFrameLayoutPackage(IFormFile packageFile)
        {
            try
            {
                if (packageFile == null || packageFile.Length == 0)
                    return BadRequest(new { message = "No file provided" });

                if (!packageFile.FileName.ToLowerInvariant().EndsWith(".zip"))
                    return BadRequest(new { message = "File must be a ZIP package" });

                // Validate file size (max 100MB)
                if (packageFile.Length > 100 * 1024 * 1024)
                    return BadRequest(new { message = "File size exceeds 100MB limit" });

                // Read file data
                byte[] zipData;
                using (var memoryStream = new MemoryStream())
                {
                    await packageFile.CopyToAsync(memoryStream);
                    zipData = memoryStream.ToArray();
                }

                var contentRootPath = _webHostEnvironment.ContentRootPath;
                var templatesPath = GetTemplatesPath();
                var rivePath = GetRivePath();
                var assetsPath = GetAssetsPath();
                var videosPath = GetVideosPath();
                var dbPath = _dbPathProvider.DbPath;

                var layoutId = await _frameLayoutService.ImportFrameLayoutPackageAsync(
                    zipData,
                    contentRootPath,
                    templatesPath,
                    rivePath,
                    assetsPath,
                    videosPath,
                    dbPath);

                return Ok(new
                {
                    id = layoutId,
                    message = "Frame layout package imported successfully"
                });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error importing frame layout package", error = ex.Message });
            }
        }

        // ============================================================================
        // EXPORT PACKAGE
        // ============================================================================

        [HttpGet("{id}/export-standalone")]
        public async Task<ActionResult> ExportStandaloneConfig(int id, [FromQuery] string? filename = null)
        {
            try
            {
                var templatesPath = GetTemplatesPath();
                var rivePath = GetRivePath();
                var assetsPath = GetAssetsPath();
                var videosPath = GetVideosPath();
                var dataPath = _dbPathProvider.DbPath;

                var result = await _frameLayoutService.ExportFrameLayoutPackageAsync(
                    id,
                    templatesPath,
                    rivePath,
                    assetsPath,
                    videosPath,
                    dataPath,
                    _webHostEnvironment.ContentRootPath);

                var exportFilename = filename ?? result.filename;

                return File(result.zipData, "application/zip", exportFilename);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (FileNotFoundException ex)
            {
                return NotFound(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error exporting frame layout package", error = ex.Message });
            }
        }

        // ============================================================================
        // SAVE CLOUD VERSION (POC)
        // ============================================================================

        [HttpPost("{id}/save-cloud-version")]
        public async Task<ActionResult> SaveCloudVersion(int id)
        {
            var operationId = Guid.NewGuid().ToString();

            try
            {
                Console.WriteLine($"[TEMPLATE_VERSION] Initiating cloud version save for template {id}, OperationID={operationId}");

                // 1. Get authentication token
                var token = await _cloudSessionStore.GetValidAccessTokenAsync();
                if (string.IsNullOrEmpty(token))
                {
                    Console.WriteLine($"[TEMPLATE_VERSION] No valid cloud authentication token");
                    return Unauthorized(new { message = "Not authenticated with cloud. Please log in to JunctionRelay Cloud." });
                }

                // 2. Get template from database
                var frameLayout = await _frameLayoutService.GetFrameLayoutByIdAsync(id);
                if (frameLayout == null)
                {
                    return NotFound(new { message = $"Frame layout with ID {id} not found" });
                }

                var templateName = frameLayout.DisplayName ?? "Unnamed Template";
                Console.WriteLine($"[TEMPLATE_VERSION] Processing template '{templateName}'");

                // STAGE 1: Preparing
                await _unifiedNotificationBroadcaster.EmitTemplateVersionProgressAsync(
                    id,
                    templateName,
                    operationId,
                    TemplateVersionUploadStage.Preparing,
                    "Gathering template configuration and assets...",
                    progressPercentage: 10
                );

                // 3. Build asset manifest and collect file paths
                var assetManifest = new Dictionary<string, string>(); // { "path": "hash" }
                var assetFiles = new Dictionary<string, string>(); // { "hash": "physicalPath" }

                var templatesPath = GetTemplatesPath();
                var rivePath = GetRivePath();
                var assetsPath = GetAssetsPath();
                var videosPath = GetVideosPath();

                // Helper function to add asset to manifest
                void AddAsset(string relativePath, string physicalPath)
                {
                    if (System.IO.File.Exists(physicalPath))
                    {
                        var hash = CalculateSHA256(physicalPath);
                        assetManifest[relativePath] = hash;
                        if (!assetFiles.ContainsKey(hash))
                        {
                            assetFiles[hash] = physicalPath;
                        }
                        Console.WriteLine($"  Asset: {relativePath} -> {hash}");
                    }
                    else
                    {
                        Console.WriteLine($"  Warning: Asset not found: {physicalPath}");
                    }
                }

                // Helper to find asset file (checks user path first, then templates)
                string? FindAssetFile(string fileName, string userPath, string templatesPath)
                {
                    var userFile = Path.Combine(userPath, fileName);
                    if (System.IO.File.Exists(userFile))
                        return userFile;

                    var templateFile = Path.Combine(templatesPath, fileName);
                    if (System.IO.File.Exists(templateFile))
                        return templateFile;

                    return null;
                }

                // Add Rive file
                if (!string.IsNullOrEmpty(frameLayout.RiveFile))
                {
                    var riveFilePath = FindAssetFile(frameLayout.RiveFile, rivePath, templatesPath);
                    if (!string.IsNullOrEmpty(riveFilePath))
                    {
                        AddAsset($"rive/{frameLayout.RiveFile}", riveFilePath);
                    }
                }

                // Add thumbnail (stored in data directory under frameengine/thumbnails/)
                // Store in separate 'thumbnails/' folder to avoid conflicts with images/ folder
                if (!string.IsNullOrEmpty(frameLayout.ThumbnailPath))
                {
                    var dbPath = _dbPathProvider.DbPath;
                    var dataDir = Path.GetDirectoryName(dbPath)
                                  ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
                    var thumbnailFullPath = Path.Combine(dataDir, frameLayout.ThumbnailPath.Replace("/", Path.DirectorySeparatorChar.ToString()));

                    Console.WriteLine($"[THUMBNAIL_DEBUG] ThumbnailPath from DB: {frameLayout.ThumbnailPath}");
                    Console.WriteLine($"[THUMBNAIL_DEBUG] Looking for thumbnail at: {thumbnailFullPath}");
                    Console.WriteLine($"[THUMBNAIL_DEBUG] File exists: {System.IO.File.Exists(thumbnailFullPath)}");

                    if (System.IO.File.Exists(thumbnailFullPath))
                    {
                        // Use generic thumbnail filename for consistency with local exports
                        var thumbnailFormat = frameLayout.ThumbnailFormat ?? Path.GetExtension(frameLayout.ThumbnailPath).TrimStart('.');
                        var thumbnailFileName = $"thumbnail.{thumbnailFormat}";
                        var thumbnailHash = CalculateSHA256(thumbnailFullPath);
                        Console.WriteLine($"[THUMBNAIL_DEBUG] Thumbnail hash: {thumbnailHash}");
                        Console.WriteLine($"[THUMBNAIL_DEBUG] Adding to manifest as: thumbnails/{thumbnailFileName}");

                        AddAsset($"thumbnails/{thumbnailFileName}", thumbnailFullPath);
                    }
                    else
                    {
                        Console.WriteLine($"[THUMBNAIL_DEBUG] ERROR: Thumbnail file not found!");
                    }
                }

                // Add background image
                if (!string.IsNullOrEmpty(frameLayout.BackgroundImageUrl) &&
                    !frameLayout.BackgroundImageUrl.StartsWith("http://") &&
                    !frameLayout.BackgroundImageUrl.StartsWith("https://"))
                {
                    var fileName = Path.GetFileName(frameLayout.BackgroundImageUrl);
                    var filePath = FindAssetFile(fileName, assetsPath, templatesPath);
                    if (!string.IsNullOrEmpty(filePath))
                    {
                        AddAsset($"images/{fileName}", filePath);
                    }
                }

                // Add background video
                if (!string.IsNullOrEmpty(frameLayout.BackgroundVideoUrl) &&
                    !frameLayout.BackgroundVideoUrl.StartsWith("http://") &&
                    !frameLayout.BackgroundVideoUrl.StartsWith("https://"))
                {
                    var fileName = Path.GetFileName(frameLayout.BackgroundVideoUrl);
                    var filePath = FindAssetFile(fileName, videosPath, templatesPath);
                    if (!string.IsNullOrEmpty(filePath))
                    {
                        AddAsset($"videos/{fileName}", filePath);
                    }
                }

                // Process element assets from JsonFrameElements
                if (!string.IsNullOrEmpty(frameLayout.JsonFrameElements))
                {
                    try
                    {
                        var elementsArray = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(frameLayout.JsonFrameElements);
                        if (elementsArray.ValueKind == System.Text.Json.JsonValueKind.Array)
                        {
                            foreach (var element in elementsArray.EnumerateArray())
                            {
                                if (!element.TryGetProperty("type", out var typeProperty) ||
                                    !element.TryGetProperty("properties", out var propertiesElement))
                                    continue;

                                var elementType = typeProperty.GetString();

                                // Handle asset-image elements
                                if (elementType == "asset-image" && propertiesElement.TryGetProperty("assetImageUrl", out var imageUrlProp))
                                {
                                    var imageUrl = imageUrlProp.GetString();
                                    if (!string.IsNullOrEmpty(imageUrl) &&
                                        !imageUrl.StartsWith("http://") &&
                                        !imageUrl.StartsWith("https://"))
                                    {
                                        var fileName = Path.GetFileName(imageUrl);
                                        var filePath = FindAssetFile(fileName, assetsPath, templatesPath);
                                        if (!string.IsNullOrEmpty(filePath))
                                        {
                                            AddAsset($"images/{fileName}", filePath);
                                        }
                                    }
                                }

                                // Handle asset-video elements
                                if (elementType == "asset-video" && propertiesElement.TryGetProperty("assetVideoUrl", out var videoUrlProp))
                                {
                                    var videoUrl = videoUrlProp.GetString();
                                    if (!string.IsNullOrEmpty(videoUrl) &&
                                        !videoUrl.StartsWith("http://") &&
                                        !videoUrl.StartsWith("https://"))
                                    {
                                        var fileName = Path.GetFileName(videoUrl);
                                        var filePath = FindAssetFile(fileName, videosPath, templatesPath);
                                        if (!string.IsNullOrEmpty(filePath))
                                        {
                                            AddAsset($"videos/{fileName}", filePath);
                                        }
                                    }
                                }

                                // Handle asset-rive elements
                                if (elementType == "asset-rive" && propertiesElement.TryGetProperty("assetRiveFile", out var riveFileProp))
                                {
                                    var riveFile = riveFileProp.GetString();
                                    if (!string.IsNullOrEmpty(riveFile))
                                    {
                                        var filePath = FindAssetFile(riveFile, rivePath, templatesPath);
                                        if (!string.IsNullOrEmpty(filePath))
                                        {
                                            AddAsset($"rive/{riveFile}", filePath);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"  Warning: Failed to parse JsonFrameElements: {ex.Message}");
                    }
                }

                Console.WriteLine($"[TEMPLATE_VERSION] Found {assetManifest.Count} assets, {assetFiles.Count} unique files");

                // STAGE 2: Hashing Assets
                await _unifiedNotificationBroadcaster.EmitTemplateVersionProgressAsync(
                    id,
                    templateName,
                    operationId,
                    TemplateVersionUploadStage.HashingAssets,
                    $"Calculated hashes for {assetFiles.Count} unique assets",
                    progressPercentage: 25
                );

                // 4. Generate properly formatted export config (not raw database record)
                var assetPaths = assetManifest.Keys.ToList();
                var exportConfig = _frameLayoutService.GenerateSimpleExportConfig(frameLayout, assetPaths);
                var configJson = System.Text.Json.JsonSerializer.Serialize(exportConfig);

                // STAGE 3: Checking Cloud
                await _unifiedNotificationBroadcaster.EmitTemplateVersionProgressAsync(
                    id,
                    templateName,
                    operationId,
                    TemplateVersionUploadStage.CheckingCloud,
                    "Checking which assets already exist in cloud...",
                    progressPercentage: 40
                );

                // 5. Call Cloud /initiate to check which assets need uploading
                using var httpClient = _httpClientFactory.CreateClient();
                httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                var cloudBaseUrl = Environment.GetEnvironmentVariable("CLOUD_BACKEND_URL") ?? "https://api.junctionrelay.com";
                var initiateUrl = $"{cloudBaseUrl.TrimEnd('/')}/api/template-versions/initiate";

                var initiateRequest = new { templateId = id, templateName = templateName, assetManifest = assetManifest };
                var initiateJson = System.Text.Json.JsonSerializer.Serialize(initiateRequest);
                var initiateContent = new StringContent(initiateJson, System.Text.Encoding.UTF8, "application/json");

                Console.WriteLine($"[TEMPLATE_VERSION] Checking which assets need upload...");
                var initiateResponse = await httpClient.PostAsync(initiateUrl, initiateContent);
                var initiateResponseContent = await initiateResponse.Content.ReadAsStringAsync();

                if (initiateResponse.StatusCode == System.Net.HttpStatusCode.Forbidden)
                {
                    Console.WriteLine($"[TEMPLATE_VERSION] Pro tier required");
                    return StatusCode(403, new { message = "Pro tier subscription required for cloud template versioning" });
                }

                if (!initiateResponse.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[TEMPLATE_VERSION] Failed to initiate: {initiateResponse.StatusCode} - {initiateResponseContent}");
                    return StatusCode((int)initiateResponse.StatusCode, new { message = "Failed to initiate upload", error = initiateResponseContent });
                }

                var initiateResult = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(initiateResponseContent);
                var missingHashes = initiateResult.GetProperty("missingHashes").EnumerateArray()
                    .Select(h => h.GetString()).Where(h => h != null).Select(h => h!).ToList();

                var presignedUrls = new Dictionary<string, string>();
                if (initiateResult.TryGetProperty("presignedUrls", out var urlsElement))
                {
                    foreach (var prop in urlsElement.EnumerateObject())
                    {
                        presignedUrls[prop.Name] = prop.Value.GetString() ?? "";
                    }
                }

                Console.WriteLine($"[TEMPLATE_VERSION] Total assets in manifest: {assetManifest.Count}");
                Console.WriteLine($"[TEMPLATE_VERSION] Unique file hashes: {assetFiles.Count}");
                Console.WriteLine($"[TEMPLATE_VERSION] Missing hashes from cloud: {missingHashes.Count}");

                // Debug: Show which assets are in manifest
                Console.WriteLine($"[TEMPLATE_VERSION] Asset manifest contents:");
                foreach (var asset in assetManifest)
                {
                    var isMissing = missingHashes.Contains(asset.Value);
                    Console.WriteLine($"  {asset.Key} -> {asset.Value.Substring(0, 8)}... {(isMissing ? "[WILL UPLOAD]" : "[EXISTS IN CLOUD]")}");
                }

                // STAGE 4: Uploading Assets
                if (missingHashes.Count > 0)
                {
                    await _unifiedNotificationBroadcaster.EmitTemplateVersionProgressAsync(
                        id,
                        templateName,
                        operationId,
                        TemplateVersionUploadStage.UploadingAssets,
                        $"Uploading {missingHashes.Count} new assets to cloud storage...",
                        progressPercentage: 55
                    );
                }

                // 6. Upload missing assets directly to S3
                using var s3Client = new HttpClient();
                s3Client.Timeout = TimeSpan.FromMinutes(5);

                int uploadedCount = 0;
                var fileSizes = new Dictionary<string, long>();  // Track file sizes by hash
                foreach (var hash in missingHashes)
                {
                    if (!assetFiles.ContainsKey(hash))
                    {
                        Console.WriteLine($"  Warning: Hash {hash} marked as missing but file not found locally");
                        continue;
                    }

                    if (!presignedUrls.ContainsKey(hash))
                    {
                        Console.WriteLine($"  Warning: No presigned URL for hash {hash}");
                        continue;
                    }

                    var physicalPath = assetFiles[hash];
                    var uploadUrl = presignedUrls[hash];

                    Console.WriteLine($"  Uploading: {Path.GetFileName(physicalPath)} ({hash.Substring(0, 8)}...)");

                    var fileBytes = await System.IO.File.ReadAllBytesAsync(physicalPath);
                    fileSizes[hash] = fileBytes.Length;  // Store file size
                    var content = new ByteArrayContent(fileBytes);
                    content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/octet-stream");

                    var uploadResponse = await s3Client.PutAsync(uploadUrl, content);
                    if (!uploadResponse.IsSuccessStatusCode)
                    {
                        var error = await uploadResponse.Content.ReadAsStringAsync();
                        Console.WriteLine($"  Failed to upload {hash}: {uploadResponse.StatusCode} - {error}");

                        // Emit error progress
                        await _unifiedNotificationBroadcaster.EmitTemplateVersionProgressAsync(
                            id,
                            templateName,
                            operationId,
                            TemplateVersionUploadStage.UploadingAssets,
                            $"Failed to upload asset",
                            progressPercentage: 55,
                            isComplete: true,
                            hasError: true,
                            errorMessage: $"Failed to upload asset: {error}"
                        );

                        return StatusCode(500, new { message = $"Failed to upload asset {hash}", error = error });
                    }

                    uploadedCount++;
                    // Update progress during upload
                    if (missingHashes.Count > 0)
                    {
                        var uploadProgress = 55 + (int)((uploadedCount / (double)missingHashes.Count) * 25);
                        await _unifiedNotificationBroadcaster.EmitTemplateVersionProgressAsync(
                            id,
                            templateName,
                            operationId,
                            TemplateVersionUploadStage.UploadingAssets,
                            $"Uploaded {uploadedCount} of {missingHashes.Count} assets...",
                            progressPercentage: uploadProgress
                        );
                    }
                }

                Console.WriteLine($"[TEMPLATE_VERSION] All assets uploaded successfully");

                // STAGE 5: Saving Metadata
                await _unifiedNotificationBroadcaster.EmitTemplateVersionProgressAsync(
                    id,
                    templateName,
                    operationId,
                    TemplateVersionUploadStage.SavingMetadata,
                    "Finalizing template version in cloud...",
                    progressPercentage: 85
                );

                // 7. Call Cloud /complete to finalize the snapshot
                var completeUrl = $"{cloudBaseUrl.TrimEnd('/')}/api/template-versions/complete";
                var completeRequest = new { templateId = id, templateName = templateName, configJson = configJson, assetManifest = assetManifest, fileSizes = fileSizes };
                var completeJson = System.Text.Json.JsonSerializer.Serialize(completeRequest);
                var completeContent = new StringContent(completeJson, System.Text.Encoding.UTF8, "application/json");

                var completeResponse = await httpClient.PostAsync(completeUrl, completeContent);
                var completeResponseContent = await completeResponse.Content.ReadAsStringAsync();

                if (!completeResponse.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[TEMPLATE_VERSION] Failed to complete: {completeResponse.StatusCode} - {completeResponseContent}");

                    // Emit error progress
                    await _unifiedNotificationBroadcaster.EmitTemplateVersionProgressAsync(
                        id,
                        frameLayout?.DisplayName ?? "Template",
                        operationId,
                        TemplateVersionUploadStage.SavingMetadata,
                        "Failed to save template version",
                        progressPercentage: 85,
                        isComplete: true,
                        hasError: true,
                        errorMessage: $"Failed to save template version: {completeResponseContent}"
                    );

                    return StatusCode((int)completeResponse.StatusCode, new { message = "Failed to save template version", error = completeResponseContent });
                }

                // Parse response to check if unchanged
                var completeResult = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(completeResponseContent);
                var isUnchanged = completeResult.TryGetProperty("unchanged", out var unchangedProp) && unchangedProp.GetBoolean();

                // STAGE 6: Complete
                await _unifiedNotificationBroadcaster.EmitTemplateVersionProgressAsync(
                    id,
                    frameLayout?.DisplayName ?? "Template",
                    operationId,
                    TemplateVersionUploadStage.Complete,
                    isUnchanged ? "No changes detected - template identical to latest version" : "Template version saved successfully!",
                    progressPercentage: 100,
                    isComplete: true,
                    hasError: false
                );

                Console.WriteLine($"[TEMPLATE_VERSION] ✅ Template version saved successfully");
                return Ok(System.Text.Json.JsonSerializer.Deserialize<object>(completeResponseContent));
            }
            catch (InvalidOperationException ex)
            {
                Console.WriteLine($"[TEMPLATE_VERSION] Template not found: {ex.Message}");

                // Emit error progress
                await _unifiedNotificationBroadcaster.EmitTemplateVersionProgressAsync(
                    id,
                    "Template",
                    operationId,
                    TemplateVersionUploadStage.Preparing,
                    "Template not found",
                    progressPercentage: 0,
                    isComplete: true,
                    hasError: true,
                    errorMessage: ex.Message
                );

                return NotFound(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TEMPLATE_VERSION] Error saving cloud version: {ex.Message}");

                // Emit error progress
                await _unifiedNotificationBroadcaster.EmitTemplateVersionProgressAsync(
                    id,
                    "Template",
                    operationId,
                    TemplateVersionUploadStage.Preparing,
                    "Error saving cloud version",
                    progressPercentage: 0,
                    isComplete: true,
                    hasError: true,
                    errorMessage: ex.Message
                );

                return StatusCode(500, new { message = "Error saving cloud version", error = ex.Message });
            }
        }

        [HttpGet("cloud-versions/{templateId}")]
        public async Task<ActionResult> GetCloudVersions(int templateId)
        {
            try
            {
                // Get authentication token
                var token = await _cloudSessionStore.GetValidAccessTokenAsync();
                if (string.IsNullOrEmpty(token))
                {
                    return Unauthorized(new { message = "Not authenticated with cloud" });
                }

                // Call Cloud API to get snapshots list
                using var httpClient = _httpClientFactory.CreateClient();
                httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                var cloudBaseUrl = Environment.GetEnvironmentVariable("CLOUD_BACKEND_URL") ?? "https://api.junctionrelay.com";
                var snapshotsUrl = $"{cloudBaseUrl.TrimEnd('/')}/api/template-versions/{templateId}/snapshots";

                var response = await httpClient.GetAsync(snapshotsUrl);

                if (!response.IsSuccessStatusCode)
                {
                    var error = await response.Content.ReadAsStringAsync();
                    return StatusCode((int)response.StatusCode, new { message = "Failed to get snapshots", error = error });
                }

                var snapshots = await response.Content.ReadAsStringAsync();
                return Content(snapshots, "application/json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TEMPLATE_VERSION] Error getting versions: {ex.Message}");
                return StatusCode(500, new { message = "Error getting versions", error = ex.Message });
            }
        }

        [HttpDelete("cloud-versions/{snapshotId}")]
        public async Task<ActionResult> DeleteCloudVersion(string snapshotId)
        {
            try
            {
                Console.WriteLine($"[TEMPLATE_VERSION] Deleting cloud version {snapshotId}");

                // 1. Get authentication token
                var token = await _cloudSessionStore.GetValidAccessTokenAsync();
                if (string.IsNullOrEmpty(token))
                {
                    Console.WriteLine($"[TEMPLATE_VERSION] No valid cloud authentication token");
                    return Unauthorized(new { message = "Not authenticated with cloud. Please log in to JunctionRelay Cloud." });
                }

                // 2. Call Cloud API to delete snapshot
                using var httpClient = _httpClientFactory.CreateClient();
                httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                var cloudBaseUrl = Environment.GetEnvironmentVariable("CLOUD_BACKEND_URL") ?? "https://api.junctionrelay.com";
                var deleteUrl = $"{cloudBaseUrl.TrimEnd('/')}/api/template-versions/snapshot/{snapshotId}";

                Console.WriteLine($"[TEMPLATE_VERSION] Calling cloud delete endpoint...");
                var deleteResponse = await httpClient.DeleteAsync(deleteUrl);

                if (!deleteResponse.IsSuccessStatusCode)
                {
                    var error = await deleteResponse.Content.ReadAsStringAsync();
                    Console.WriteLine($"[TEMPLATE_VERSION] Failed to delete: {deleteResponse.StatusCode} - {error}");
                    return StatusCode((int)deleteResponse.StatusCode, new { message = "Failed to delete snapshot", error = error });
                }

                var responseContent = await deleteResponse.Content.ReadAsStringAsync();
                Console.WriteLine($"[TEMPLATE_VERSION] ✅ Snapshot deleted successfully");

                return Ok(System.Text.Json.JsonSerializer.Deserialize<object>(responseContent));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TEMPLATE_VERSION] Error deleting cloud version: {ex.Message}");
                return StatusCode(500, new { message = "Error deleting cloud version", error = ex.Message });
            }
        }

        [HttpGet("cloud-versions/{snapshotId}/download")]
        public async Task<ActionResult> DownloadCloudVersion(string snapshotId)
        {
            try
            {
                Console.WriteLine($"[TEMPLATE_VERSION] Downloading cloud version {snapshotId}");

                // 1. Get authentication token
                var token = await _cloudSessionStore.GetValidAccessTokenAsync();
                if (string.IsNullOrEmpty(token))
                {
                    Console.WriteLine($"[TEMPLATE_VERSION] No valid cloud authentication token");
                    return Unauthorized(new { message = "Not authenticated with cloud. Please log in to JunctionRelay Cloud." });
                }

                // 2. Call Cloud API to get snapshot details + download URLs
                using var httpClient = _httpClientFactory.CreateClient();
                httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                var cloudBaseUrl = Environment.GetEnvironmentVariable("CLOUD_BACKEND_URL") ?? "https://api.junctionrelay.com";
                var snapshotUrl = $"{cloudBaseUrl.TrimEnd('/')}/api/template-versions/snapshot/{snapshotId}";

                Console.WriteLine($"[TEMPLATE_VERSION] Fetching snapshot details from cloud...");
                var snapshotResponse = await httpClient.GetAsync(snapshotUrl);

                if (!snapshotResponse.IsSuccessStatusCode)
                {
                    var error = await snapshotResponse.Content.ReadAsStringAsync();
                    Console.WriteLine($"[TEMPLATE_VERSION] Failed to get snapshot: {snapshotResponse.StatusCode} - {error}");
                    return StatusCode((int)snapshotResponse.StatusCode, new { message = "Failed to get snapshot", error = error });
                }

                var snapshotJson = await snapshotResponse.Content.ReadAsStringAsync();
                var snapshot = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(snapshotJson);

                var templateName = snapshot.GetProperty("templateName").GetString() ?? "template";
                var configJson = snapshot.GetProperty("configJson").GetString() ?? "{}";
                var downloadUrls = snapshot.GetProperty("downloadUrls");

                // Count the number of properties in the downloadUrls object
                var urlCount = downloadUrls.EnumerateObject().Count();
                Console.WriteLine($"[TEMPLATE_VERSION] Downloading {urlCount} assets...");

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

                Console.WriteLine($"[TEMPLATE_VERSION] All assets downloaded, reconstructing ZIP...");

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

                Console.WriteLine($"[TEMPLATE_VERSION] ✅ ZIP reconstructed ({zipBytes.Length} bytes)");

                // Sanitize filename
                var safeTemplateName = string.Concat(templateName.Split(Path.GetInvalidFileNameChars()));
                var filename = $"{safeTemplateName}.zip";

                return File(zipBytes, "application/zip", filename);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TEMPLATE_VERSION] Error downloading cloud version: {ex.Message}");
                return StatusCode(500, new { message = "Error downloading cloud version", error = ex.Message });
            }
        }

        // Helper method to calculate SHA256 hash of a file
        private static string CalculateSHA256(string filePath)
        {
            using var sha256 = System.Security.Cryptography.SHA256.Create();
            using var stream = System.IO.File.OpenRead(filePath);
            var hashBytes = sha256.ComputeHash(stream);
            return BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
        }

        // ============================================================================
        // SCREEN CONFIGURATION URL
        // ============================================================================

        [HttpGet("screen-config/{screenConfigId}/url")]
        public async Task<ActionResult> GetScreenConfigUrl(int screenConfigId, [FromQuery] string? baseUrl = null)
        {
            try
            {
                var screenConfig = await _junctionLinksService.GetJunctionScreenLayoutByIdAsync(screenConfigId);
                if (screenConfig == null)
                    return NotFound(new { message = $"Screen configuration with ID {screenConfigId} not found" });

                if (!screenConfig.EnableUrlAccess)
                    return Ok(new { message = "URL access is disabled for this screen configuration", url = "" });

                var requestBaseUrl = baseUrl ?? $"{Request.Scheme}://{Request.Host}";
                var url = Service_FrameEngine.GenerateFrameUrl(requestBaseUrl, screenConfig);

                return Ok(new { url, enabled = screenConfig.EnableUrlAccess, urlPath = screenConfig.UrlPath });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error retrieving screen configuration URL", error = ex.Message });
            }
        }

        // ============================================================================
        // HELPER METHODS
        // ============================================================================

        /// <summary>
        /// Gets the path to the templates directory
        /// </summary>
        private string GetTemplatesPath()
        {
            return Path.Combine(_webHostEnvironment.ContentRootPath, "frameengine", "templates");
        }

        /// <summary>
        /// Gets the path to the Rive files directory
        /// </summary>
        private string GetRivePath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath)
                          ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine", "rive");
        }

        /// <summary>
        /// Gets the path to the images directory
        /// </summary>
        private string GetAssetsPath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath)
                          ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine", "images");
        }

        /// <summary>
        /// Gets the path to the videos directory
        /// </summary>
        private string GetVideosPath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath)
                          ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine", "videos");
        }
    }
}