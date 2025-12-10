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

using JunctionRelayServer.Utils;
using JunctionRelayServer.Models;
using System.Text.Json;

namespace JunctionRelayServer.Services
{
    /// <summary>
    /// Service for creating cloud versions/snapshots of frame layouts
    /// </summary>
    public class Service_FrameEngine_CloudVersioning
    {
        private readonly Service_Database_Manager_FrameEngine _frameLayoutService;
        private readonly IWebHostEnvironment _webHostEnvironment;
        private readonly DatabasePathProvider _dbPathProvider;
        private readonly Service_CloudSessionStore _cloudSessionStore;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Service_Unified_Notification_Broadcaster _notificationBroadcaster;

        public Service_FrameEngine_CloudVersioning(
            Service_Database_Manager_FrameEngine frameLayoutService,
            IWebHostEnvironment webHostEnvironment,
            DatabasePathProvider dbPathProvider,
            Service_CloudSessionStore cloudSessionStore,
            IHttpClientFactory httpClientFactory,
            Service_Unified_Notification_Broadcaster notificationBroadcaster)
        {
            _frameLayoutService = frameLayoutService;
            _webHostEnvironment = webHostEnvironment;
            _dbPathProvider = dbPathProvider;
            _cloudSessionStore = cloudSessionStore;
            _httpClientFactory = httpClientFactory;
            _notificationBroadcaster = notificationBroadcaster;
        }

        public class CloudVersionResult
        {
            public bool Success { get; set; }
            public Guid? SnapshotId { get; set; }
            public string? ErrorMessage { get; set; }
            public int? StatusCode { get; set; }
        }

        /// <summary>
        /// Saves a cloud version/snapshot of a frame layout
        /// </summary>
        public async Task<CloudVersionResult> SaveCloudVersionAsync(
            int frameId,
            bool isBackupSnapshot = false,
            string? operationId = null,
            bool emitNotifications = false)
        {
            operationId ??= Guid.NewGuid().ToString();

            try
            {
                Console.WriteLine($"[CLOUD_VERSIONING] Saving cloud version for frame {frameId}, IsBackupSnapshot={isBackupSnapshot}, EmitNotifications={emitNotifications}");

                // 1. Get authentication token
                var token = await _cloudSessionStore.GetValidAccessTokenAsync();
                if (string.IsNullOrEmpty(token))
                {
                    return new CloudVersionResult
                    {
                        Success = false,
                        ErrorMessage = "Not authenticated with cloud",
                        StatusCode = 401
                    };
                }

                // 2. Get frame layout from database
                var frameLayout = await _frameLayoutService.GetFrameLayoutByIdAsync(frameId);
                if (frameLayout == null)
                {
                    return new CloudVersionResult
                    {
                        Success = false,
                        ErrorMessage = $"Frame layout with ID {frameId} not found",
                        StatusCode = 404
                    };
                }

                // Validate that CloudTemplateId and CloudVariantId are set (required for snapshots)
                if (string.IsNullOrEmpty(frameLayout.CloudTemplateId) || string.IsNullOrEmpty(frameLayout.CloudVariantId))
                {
                    return new CloudVersionResult
                    {
                        Success = false,
                        ErrorMessage = "Cannot create snapshot: Layout must have CloudTemplateId and CloudVariantId",
                        StatusCode = 400
                    };
                }

                var templateName = frameLayout.DisplayName ?? "Unnamed Template";

                // Emit preparing notification
                if (emitNotifications)
                {
                    await _notificationBroadcaster.EmitTemplateVersionProgressAsync(
                        frameId, templateName, operationId,
                        TemplateVersionUploadStage.Preparing,
                        "Gathering template configuration and assets...",
                        progressPercentage: 10);
                }

                // 3. Build asset manifest
                var (assetManifest, assetFiles) = await BuildAssetManifestAsync(frameLayout);
                Console.WriteLine($"[CLOUD_VERSIONING] Found {assetManifest.Count} assets, {assetFiles.Count} unique files");

                // Emit hashing notification
                if (emitNotifications)
                {
                    await _notificationBroadcaster.EmitTemplateVersionProgressAsync(
                        frameId, templateName, operationId,
                        TemplateVersionUploadStage.HashingAssets,
                        $"Calculated hashes for {assetFiles.Count} unique assets",
                        progressPercentage: 25);
                }

                // 4. Generate export config
                var assetPaths = assetManifest.Keys.ToList();
                var exportConfig = _frameLayoutService.GenerateSimpleExportConfig(frameLayout, assetPaths);
                var configJson = JsonSerializer.Serialize(exportConfig);

                // 5. Call Cloud /initiate
                using var httpClient = _httpClientFactory.CreateClient();
                httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                var cloudBaseUrl = Environment.GetEnvironmentVariable("CLOUD_BACKEND_URL") ?? "https://api.junctionrelay.com";
                var initiateUrl = $"{cloudBaseUrl.TrimEnd('/')}/api/template-versions/initiate";

                // Emit checking cloud notification
                if (emitNotifications)
                {
                    await _notificationBroadcaster.EmitTemplateVersionProgressAsync(
                        frameId, templateName, operationId,
                        TemplateVersionUploadStage.CheckingCloud,
                        "Checking which assets already exist in cloud...",
                        progressPercentage: 40);
                }

                var initiateRequest = new {
                    cloudTemplateId = frameLayout.CloudTemplateId,
                    cloudVariantId = frameLayout.CloudVariantId,
                    templateName = templateName,
                    assetManifest = assetManifest
                };
                var initiateJson = JsonSerializer.Serialize(initiateRequest);
                var initiateContent = new StringContent(initiateJson, System.Text.Encoding.UTF8, "application/json");

                var initiateResponse = await httpClient.PostAsync(initiateUrl, initiateContent);
                var initiateResponseContent = await initiateResponse.Content.ReadAsStringAsync();

                if (!initiateResponse.IsSuccessStatusCode)
                {
                    return new CloudVersionResult
                    {
                        Success = false,
                        ErrorMessage = $"Failed to initiate: {initiateResponseContent}",
                        StatusCode = (int)initiateResponse.StatusCode
                    };
                }

                var initiateResult = JsonSerializer.Deserialize<JsonElement>(initiateResponseContent);
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

                // 6. Upload missing assets to S3
                var fileSizes = new Dictionary<string, long>();
                if (missingHashes.Count > 0)
                {
                    // Emit uploading notification
                    if (emitNotifications)
                    {
                        await _notificationBroadcaster.EmitTemplateVersionProgressAsync(
                            frameId, templateName, operationId,
                            TemplateVersionUploadStage.UploadingAssets,
                            $"Uploading {missingHashes.Count} new assets to cloud storage...",
                            progressPercentage: 55);
                    }

                    using var s3Client = new HttpClient();
                    s3Client.Timeout = TimeSpan.FromMinutes(5);

                    int uploadedCount = 0;
                    foreach (var hash in missingHashes)
                    {
                        if (!assetFiles.ContainsKey(hash) || !presignedUrls.ContainsKey(hash))
                            continue;

                        var physicalPath = assetFiles[hash];
                        var uploadUrl = presignedUrls[hash];

                        var fileBytes = await File.ReadAllBytesAsync(physicalPath);
                        fileSizes[hash] = fileBytes.Length;
                        var content = new ByteArrayContent(fileBytes);
                        content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/octet-stream");

                        var uploadResponse = await s3Client.PutAsync(uploadUrl, content);
                        if (!uploadResponse.IsSuccessStatusCode)
                        {
                            var error = await uploadResponse.Content.ReadAsStringAsync();
                            if (emitNotifications)
                            {
                                await _notificationBroadcaster.EmitTemplateVersionProgressAsync(
                                    frameId, templateName, operationId,
                                    TemplateVersionUploadStage.UploadingAssets,
                                    "Failed to upload asset",
                                    progressPercentage: 55,
                                    isComplete: true,
                                    hasError: true,
                                    errorMessage: $"Failed to upload asset: {error}");
                            }
                            return new CloudVersionResult
                            {
                                Success = false,
                                ErrorMessage = $"Failed to upload asset: {error}",
                                StatusCode = 500
                            };
                        }

                        uploadedCount++;
                        if (emitNotifications && missingHashes.Count > 0)
                        {
                            var uploadProgress = 55 + (int)((uploadedCount / (double)missingHashes.Count) * 25);
                            await _notificationBroadcaster.EmitTemplateVersionProgressAsync(
                                frameId, templateName, operationId,
                                TemplateVersionUploadStage.UploadingAssets,
                                $"Uploaded {uploadedCount} of {missingHashes.Count} assets...",
                                progressPercentage: uploadProgress);
                        }
                    }
                }

                // Emit saving metadata notification
                if (emitNotifications)
                {
                    await _notificationBroadcaster.EmitTemplateVersionProgressAsync(
                        frameId, templateName, operationId,
                        TemplateVersionUploadStage.SavingMetadata,
                        "Finalizing template version in cloud...",
                        progressPercentage: 85);
                }

                // 7. Call Cloud /complete
                var completeUrl = $"{cloudBaseUrl.TrimEnd('/')}/api/template-versions/complete";
                var completeRequest = new {
                    cloudTemplateId = frameLayout.CloudTemplateId,
                    cloudVariantId = frameLayout.CloudVariantId,
                    templateName = templateName,
                    configJson = configJson,
                    assetManifest = assetManifest,
                    fileSizes = fileSizes,
                    isBackupSnapshot = isBackupSnapshot
                };
                var completeJson = JsonSerializer.Serialize(completeRequest);
                var completeContent = new StringContent(completeJson, System.Text.Encoding.UTF8, "application/json");

                var completeResponse = await httpClient.PostAsync(completeUrl, completeContent);
                var completeResponseContent = await completeResponse.Content.ReadAsStringAsync();

                if (!completeResponse.IsSuccessStatusCode)
                {
                    return new CloudVersionResult
                    {
                        Success = false,
                        ErrorMessage = $"Failed to complete: {completeResponseContent}",
                        StatusCode = (int)completeResponse.StatusCode
                    };
                }

                var completeResult = JsonSerializer.Deserialize<JsonElement>(completeResponseContent);
                if (completeResult.TryGetProperty("snapshotId", out var snapshotIdElement))
                {
                    var snapshotId = snapshotIdElement.GetGuid();
                    var isUnchanged = completeResult.TryGetProperty("unchanged", out var unchangedProp) && unchangedProp.GetBoolean();
                    Console.WriteLine($"[CLOUD_VERSIONING] ✅ Snapshot created: {snapshotId}");

                    // Emit completion notification
                    if (emitNotifications)
                    {
                        await _notificationBroadcaster.EmitTemplateVersionProgressAsync(
                            frameId, templateName, operationId,
                            TemplateVersionUploadStage.Complete,
                            isUnchanged ? "No changes detected - template identical to latest version" : "Template version saved successfully!",
                            progressPercentage: 100,
                            isComplete: true,
                            hasError: false);
                    }

                    return new CloudVersionResult
                    {
                        Success = true,
                        SnapshotId = snapshotId
                    };
                }

                return new CloudVersionResult
                {
                    Success = false,
                    ErrorMessage = "Response did not contain snapshotId",
                    StatusCode = 500
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_VERSIONING] Error: {ex.Message}");

                if (emitNotifications)
                {
                    await _notificationBroadcaster.EmitTemplateVersionProgressAsync(
                        frameId, "Template", operationId,
                        TemplateVersionUploadStage.Preparing,
                        "Error saving cloud version",
                        progressPercentage: 0,
                        isComplete: true,
                        hasError: true,
                        errorMessage: ex.Message);
                }

                return new CloudVersionResult
                {
                    Success = false,
                    ErrorMessage = ex.Message,
                    StatusCode = 500
                };
            }
        }

        private async Task<(Dictionary<string, string> assetManifest, Dictionary<string, string> assetFiles)> BuildAssetManifestAsync(dynamic frameLayout)
        {
            var assetManifest = new Dictionary<string, string>();
            var assetFiles = new Dictionary<string, string>();

            var templatesPath = GetTemplatesPath();
            var rivePath = GetRivePath();
            var assetsPath = GetAssetsPath();
            var videosPath = GetVideosPath();

            void AddAsset(string relativePath, string physicalPath)
            {
                if (File.Exists(physicalPath))
                {
                    var hash = CalculateSHA256(physicalPath);
                    assetManifest[relativePath] = hash;
                    if (!assetFiles.ContainsKey(hash))
                    {
                        assetFiles[hash] = physicalPath;
                    }
                }
            }

            string? FindAssetFile(string fileName, string userPath, string templatesPath)
            {
                var userFile = Path.Combine(userPath, fileName);
                if (File.Exists(userFile))
                    return userFile;

                var templateFile = Path.Combine(templatesPath, fileName);
                if (File.Exists(templateFile))
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

            // Add thumbnail
            if (!string.IsNullOrEmpty(frameLayout.ThumbnailPath))
            {
                var dbPath = _dbPathProvider.DbPath;
                var dataDir = Path.GetDirectoryName(dbPath) ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
                var thumbnailFullPath = Path.Combine(dataDir, frameLayout.ThumbnailPath.Replace("/", Path.DirectorySeparatorChar.ToString()));

                if (File.Exists(thumbnailFullPath))
                {
                    var thumbnailFormat = frameLayout.ThumbnailFormat ?? Path.GetExtension(frameLayout.ThumbnailPath).TrimStart('.');
                    var thumbnailFileName = $"thumbnail.{thumbnailFormat}";
                    AddAsset($"thumbnails/{thumbnailFileName}", thumbnailFullPath);
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

            // Process element assets
            if (!string.IsNullOrEmpty(frameLayout.JsonFrameElements))
            {
                try
                {
                    var elementsArray = JsonSerializer.Deserialize<JsonElement>(frameLayout.JsonFrameElements);
                    if (elementsArray.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var element in elementsArray.EnumerateArray())
                        {
                            if (!element.TryGetProperty("type", out JsonElement typeProperty))
                                continue;
                            if (!element.TryGetProperty("properties", out JsonElement propertiesElement))
                                continue;

                            var elementType = typeProperty.GetString();

                            if (elementType == "media-image" && propertiesElement.TryGetProperty("filename", out var imageFilename))
                            {
                                var imageFile = imageFilename.GetString();
                                if (!string.IsNullOrEmpty(imageFile) && !imageFile.StartsWith("http://") && !imageFile.StartsWith("https://"))
                                {
                                    var fileName = Path.GetFileName(imageFile);
                                    var filePath = FindAssetFile(fileName, assetsPath, templatesPath);
                                    if (!string.IsNullOrEmpty(filePath))
                                    {
                                        AddAsset($"images/{fileName}", filePath);
                                    }
                                }
                            }

                            if (elementType == "media-video" && propertiesElement.TryGetProperty("filename", out var videoFilename))
                            {
                                var videoFile = videoFilename.GetString();
                                if (!string.IsNullOrEmpty(videoFile) && !videoFile.StartsWith("http://") && !videoFile.StartsWith("https://"))
                                {
                                    var fileName = Path.GetFileName(videoFile);
                                    var filePath = FindAssetFile(fileName, videosPath, templatesPath);
                                    if (!string.IsNullOrEmpty(filePath))
                                    {
                                        AddAsset($"videos/{fileName}", filePath);
                                    }
                                }
                            }

                            if (elementType == "media-rive" && propertiesElement.TryGetProperty("filename", out var riveFilename))
                            {
                                var riveFile = riveFilename.GetString();
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

            await Task.CompletedTask;
            return (assetManifest, assetFiles);
        }

        private static string CalculateSHA256(string filePath)
        {
            using var sha256 = System.Security.Cryptography.SHA256.Create();
            using var stream = File.OpenRead(filePath);
            var hashBytes = sha256.ComputeHash(stream);
            return BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
        }

        private string GetTemplatesPath()
        {
            return Path.Combine(_webHostEnvironment.ContentRootPath, "frameengine", "templates");
        }

        private string GetRivePath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath) ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine", "rive");
        }

        private string GetAssetsPath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath) ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine", "images");
        }

        private string GetVideosPath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath) ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine", "videos");
        }
    }
}
