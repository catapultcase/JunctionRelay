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

using Dapper;
using JunctionRelayServer.Models;
using JunctionRelayServer.Utils;
using Microsoft.AspNetCore.Hosting;
using System.Data;
using System.Text.Json;

namespace JunctionRelayServer.Services
{
    public class Service_Database_Manager_FrameEngine
    {
        private readonly IDbConnection _db;
        private readonly IWebHostEnvironment _webHostEnvironment;
        private readonly DatabasePathProvider _dbPathProvider;

        public Service_Database_Manager_FrameEngine(
            IDbConnection db,
            IWebHostEnvironment webHostEnvironment,
            DatabasePathProvider dbPathProvider)
        {
            _db = db;
            _webHostEnvironment = webHostEnvironment;
            _dbPathProvider = dbPathProvider;
        }

        public async Task<IEnumerable<Model_Frame_Layout>> GetAllFrameLayoutsAsync()
        {
            const string query = "SELECT * FROM FrameLayouts ORDER BY Created DESC";
            return await _db.QueryAsync<Model_Frame_Layout>(query);
        }

        public async Task<Model_Frame_Layout?> GetFrameLayoutByIdAsync(int id)
        {
            const string query = "SELECT * FROM FrameLayouts WHERE Id = @Id";
            return await _db.QuerySingleOrDefaultAsync<Model_Frame_Layout>(query, new { Id = id });
        }

        public async Task<Model_Frame_Layout?> GetFrameLayoutByNameAsync(string displayName)
        {
            const string query = "SELECT * FROM FrameLayouts WHERE DisplayName = @DisplayName";
            return await _db.QuerySingleOrDefaultAsync<Model_Frame_Layout>(query, new { DisplayName = displayName });
        }

        public async Task<Model_Frame_Layout?> GetFrameLayoutByCloudVariantIdAsync(string cloudVariantId)
        {
            const string query = "SELECT * FROM FrameLayouts WHERE CloudVariantId = @CloudVariantId LIMIT 1";
            return await _db.QueryFirstOrDefaultAsync<Model_Frame_Layout>(query, new { CloudVariantId = cloudVariantId });
        }

        public async Task<int> CreateFrameLayoutAsync(Model_Frame_Layout frameLayout)
        {
            ValidateFrameLayout(frameLayout);

            const string sql = @"
        INSERT INTO FrameLayouts
          (DisplayName, Description, LayoutType,
           IsTemplate, CloudTemplateId, CloudVariantId, IsDraft, IsPublished, Created, LastModified, CreatedBy, Version,
           BackgroundType, BackgroundColor, BackgroundImageUrl, BackgroundImageFit, BackgroundVideoUrl,
           BackgroundVideoFit, VideoLoop, VideoMuted, VideoAutoplay, BackgroundOpacity,
           Width, Height, Orientation, RiveFile,
           JsonFrameConfig, JsonFrameConfigRuntime, JsonFrameElements,
           HasThumbnail, ThumbnailPath, ThumbnailGeneratedAt, ThumbnailFormat, ThumbnailOverride)
        VALUES
          (@DisplayName, @Description, @LayoutType,
           @IsTemplate, @CloudTemplateId, @CloudVariantId, @IsDraft, @IsPublished, @Created, @LastModified, @CreatedBy, @Version,
           @BackgroundType, @BackgroundColor, @BackgroundImageUrl, @BackgroundImageFit, @BackgroundVideoUrl,
           @BackgroundVideoFit, @VideoLoop, @VideoMuted, @VideoAutoplay, @BackgroundOpacity,
           @Width, @Height, @Orientation, @RiveFile,
           @JsonFrameConfig, @JsonFrameConfigRuntime, @JsonFrameElements,
           @HasThumbnail, @ThumbnailPath, @ThumbnailGeneratedAt, @ThumbnailFormat, @ThumbnailOverride);
        SELECT last_insert_rowid();
    ";

            if (frameLayout.Created == default)
                frameLayout.Created = DateTime.UtcNow;

            frameLayout.LastModified = DateTime.UtcNow;

            // Generate UUIDs for user-created layouts (if not already set, e.g., from FrameXchange downloads)
            if (string.IsNullOrEmpty(frameLayout.CloudTemplateId))
                frameLayout.CloudTemplateId = Guid.NewGuid().ToString();

            if (string.IsNullOrEmpty(frameLayout.CloudVariantId))
                frameLayout.CloudVariantId = Guid.NewGuid().ToString();

            return await _db.ExecuteScalarAsync<int>(sql, frameLayout);
        }

        public async Task<bool> UpdateFrameLayoutAsync(Model_Frame_Layout frameLayout)
        {
            ValidateFrameLayout(frameLayout);

            const string check = "SELECT COUNT(1) FROM FrameLayouts WHERE Id = @Id";
            var exists = await _db.ExecuteScalarAsync<int>(check, new { frameLayout.Id }) > 0;
            if (!exists)
                throw new InvalidOperationException($"Frame layout with ID {frameLayout.Id} not found.");

            frameLayout.LastModified = DateTime.UtcNow;

            const string sql = @"
                UPDATE FrameLayouts
                SET
                  DisplayName           = @DisplayName,
                  Description           = @Description,
                  LayoutType            = @LayoutType,
                  IsTemplate            = @IsTemplate,
                  CloudTemplateId       = @CloudTemplateId,
                  CloudVariantId        = @CloudVariantId,
                  IsDraft               = @IsDraft,
                  IsPublished           = @IsPublished,
                  LastModified          = @LastModified,
                  CreatedBy             = @CreatedBy,
                  Version               = @Version,
                  BackgroundType        = @BackgroundType,
                  BackgroundColor       = @BackgroundColor,
                  BackgroundImageUrl    = @BackgroundImageUrl,
                  BackgroundImageFit    = @BackgroundImageFit,
                  BackgroundVideoUrl    = @BackgroundVideoUrl,
                  BackgroundVideoFit    = @BackgroundVideoFit,
                  VideoLoop             = @VideoLoop,
                  VideoMuted            = @VideoMuted,
                  VideoAutoplay         = @VideoAutoplay,
                  BackgroundOpacity     = @BackgroundOpacity,
                  Width                 = @Width,
                  Height                = @Height,
                  Orientation           = @Orientation,
                  RiveFile              = @RiveFile,
                  JsonFrameConfig       = @JsonFrameConfig,
                  JsonFrameConfigRuntime = @JsonFrameConfigRuntime,
                  JsonFrameElements     = @JsonFrameElements,
                  HasThumbnail          = @HasThumbnail,
                  ThumbnailPath         = @ThumbnailPath,
                  ThumbnailGeneratedAt  = @ThumbnailGeneratedAt,
                  ThumbnailFormat       = @ThumbnailFormat,
                  ThumbnailOverride     = @ThumbnailOverride
                WHERE Id = @Id";

            var affected = await _db.ExecuteAsync(sql, frameLayout);
            return affected > 0;
        }

        public async Task<bool> DeleteFrameLayoutAsync(int id)
        {
            const string sql = "DELETE FROM FrameLayouts WHERE Id = @Id";
            var affected = await _db.ExecuteAsync(sql, new { Id = id });
            return affected > 0;
        }

        public async Task<int> CloneFrameLayoutAsync(int originalId, string? newName = null)
        {
            var original = await GetFrameLayoutByIdAsync(originalId)
                           ?? throw new InvalidOperationException($"Frame layout with ID {originalId} not found.");

            var cloneName = !string.IsNullOrWhiteSpace(newName)
                ? newName.Trim()
                : $"{original.DisplayName} (Copy)";

            var counter = 1;
            var baseName = cloneName;
            while (await GetFrameLayoutByNameAsync(cloneName) != null)
            {
                cloneName = $"{baseName} ({counter})";
                counter++;
            }

            var clone = new Model_Frame_Layout
            {
                DisplayName = cloneName,
                Description = original.Description,
                LayoutType = original.LayoutType,
                IsTemplate = false,
                CloudTemplateId = Guid.NewGuid().ToString(),
                CloudVariantId = Guid.NewGuid().ToString(),
                IsDraft = true,
                IsPublished = false,
                Created = DateTime.UtcNow,
                CreatedBy = original.CreatedBy ?? "System",
                Version = original.Version ?? "1.0",
                BackgroundType = original.BackgroundType,
                BackgroundColor = original.BackgroundColor,
                BackgroundImageUrl = original.BackgroundImageUrl,
                BackgroundImageFit = original.BackgroundImageFit,
                BackgroundVideoUrl = original.BackgroundVideoUrl,
                BackgroundVideoFit = original.BackgroundVideoFit,
                VideoLoop = original.VideoLoop,
                VideoMuted = original.VideoMuted,
                VideoAutoplay = original.VideoAutoplay,
                BackgroundOpacity = original.BackgroundOpacity,
                Width = original.Width,
                Height = original.Height,
                Orientation = original.Orientation,
                RiveFile = original.RiveFile,
                JsonFrameConfig = original.JsonFrameConfig,
                JsonFrameConfigRuntime = original.JsonFrameConfigRuntime,
                JsonFrameElements = original.JsonFrameElements,
                ThumbnailOverride = false
            };

            return await CreateFrameLayoutAsync(clone);
        }

        public async Task<bool> RestoreDefaultTemplatesAsync()
        {
            try
            {
                var contentRootPath = _webHostEnvironment.ContentRootPath;
                var dbPath = _dbPathProvider.DbPath;
                var dataDir = Path.GetDirectoryName(dbPath) ?? throw new InvalidOperationException("Invalid database path");
                var templatesPath = Path.Combine(contentRootPath, "frameengine", "templates");
                var rivePath = Path.Combine(dataDir, "frameengine", "rive");
                var assetsPath = Path.Combine(dataDir, "frameengine", "images");
                var videosPath = Path.Combine(dataDir, "frameengine", "videos");
                var templatePackagesPath = Path.Combine(contentRootPath, "frameengine", "template-packages");

                if (!Directory.Exists(templatePackagesPath))
                {
                    Console.WriteLine($"Template packages directory not found: {templatePackagesPath}");
                    return false;
                }

                var zipFiles = Directory.GetFiles(templatePackagesPath, "*.zip");
                if (zipFiles.Length == 0)
                {
                    Console.WriteLine("No template ZIP files found");
                    return false;
                }

                var anyChanged = false;

                foreach (var zipFile in zipFiles)
                {
                    try
                    {
                        var templateName = Path.GetFileNameWithoutExtension(zipFile);

                        var existing = await GetFrameLayoutByNameAsync(templateName);
                        if (existing != null && existing.IsTemplate)
                        {
                            Console.WriteLine($"Template '{templateName}' already exists, skipping");
                            continue;
                        }

                        Console.WriteLine($"Importing template: {templateName}");

                        var zipData = await File.ReadAllBytesAsync(zipFile);
                        var layoutId = await ImportFrameLayoutPackageAsync(zipData, contentRootPath, templatesPath, rivePath, assetsPath, videosPath, dbPath);

                        var importedLayout = await GetFrameLayoutByIdAsync(layoutId);
                        if (importedLayout != null)
                        {
                            importedLayout.DisplayName = templateName;
                            importedLayout.IsTemplate = true;
                            importedLayout.IsDraft = false;
                            importedLayout.IsPublished = true;
                            importedLayout.CreatedBy = "JunctionRelay";
                            await UpdateFrameLayoutAsync(importedLayout);

                            Console.WriteLine($"Successfully restored template: {templateName}");
                            anyChanged = true;
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"Error importing template {Path.GetFileName(zipFile)}: {ex.Message}");
                    }
                }

                return anyChanged;
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Error restoring templates: {ex.Message}", ex);
            }
        }

        public async Task<IEnumerable<Model_Frame_Layout>> GetFrameLayoutsByTypeAsync(string layoutType)
        {
            const string query = "SELECT * FROM FrameLayouts WHERE LayoutType = @LayoutType ORDER BY Created DESC";
            return await _db.QueryAsync<Model_Frame_Layout>(query, new { LayoutType = layoutType.ToUpperInvariant() });
        }

        public async Task<IEnumerable<Model_Frame_Layout>> GetTemplateFrameLayoutsAsync()
        {
            const string query = "SELECT * FROM FrameLayouts WHERE IsTemplate = 1 ORDER BY DisplayName";
            return await _db.QueryAsync<Model_Frame_Layout>(query);
        }

        public async Task<IEnumerable<Model_Frame_Layout>> GetPublishedFrameLayoutsAsync()
        {
            const string query = "SELECT * FROM FrameLayouts WHERE IsPublished = 1 ORDER BY DisplayName";
            return await _db.QueryAsync<Model_Frame_Layout>(query);
        }

        public async Task<IEnumerable<Model_Frame_Layout>> GetDraftFrameLayoutsAsync()
        {
            const string query = "SELECT * FROM FrameLayouts WHERE IsDraft = 1 AND IsTemplate = 0 ORDER BY LastModified DESC";
            return await _db.QueryAsync<Model_Frame_Layout>(query);
        }

        public async Task<bool> PublishFrameLayoutAsync(int id)
        {
            const string sql = @"
                UPDATE FrameLayouts 
                SET IsPublished = 1, IsDraft = 0, LastModified = @LastModified 
                WHERE Id = @Id";

            var affected = await _db.ExecuteAsync(sql, new { Id = id, LastModified = DateTime.UtcNow });
            return affected > 0;
        }

        public async Task<bool> UnpublishFrameLayoutAsync(int id)
        {
            const string sql = @"
                UPDATE FrameLayouts 
                SET IsPublished = 0, IsDraft = 1, LastModified = @LastModified 
                WHERE Id = @Id";

            var affected = await _db.ExecuteAsync(sql, new { Id = id, LastModified = DateTime.UtcNow });
            return affected > 0;
        }

        private static void ValidateFrameLayout(Model_Frame_Layout frameLayout)
        {
            if (string.IsNullOrWhiteSpace(frameLayout.DisplayName))
                throw new ArgumentException("DisplayName is required");

            if (string.IsNullOrWhiteSpace(frameLayout.LayoutType))
                throw new ArgumentException("LayoutType is required");

            if (frameLayout.Width <= 0)
                throw new ArgumentException("Width must be greater than 0");

            if (frameLayout.Height <= 0)
                throw new ArgumentException("Height must be greater than 0");

            if (frameLayout.BackgroundOpacity < 0 || frameLayout.BackgroundOpacity > 1)
                throw new ArgumentException("BackgroundOpacity must be between 0 and 1");

            if (!string.IsNullOrEmpty(frameLayout.JsonFrameConfig))
            {
                try
                {
                    JsonDocument.Parse(frameLayout.JsonFrameConfig);
                }
                catch (JsonException ex)
                {
                    throw new ArgumentException($"Invalid JsonFrameConfig: {ex.Message}");
                }
            }

            if (!string.IsNullOrEmpty(frameLayout.JsonFrameElements))
            {
                try
                {
                    JsonDocument.Parse(frameLayout.JsonFrameElements);
                }
                catch (JsonException ex)
                {
                    throw new ArgumentException($"Invalid JsonFrameElements: {ex.Message}");
                }
            }
        }


        /// <summary>
        /// Generates the export package configuration object in the format expected by import
        /// </summary>
        public object GenerateExportConfig(
            Model_Frame_Layout frameLayout,
            string? backgroundImageFileName,
            string? backgroundVideoFileName,
            string exportedFrameConfig,
            string exportedFrameConfigRuntime,
            string exportedFrameElements,
            List<string> packageContents)
        {
            return new
            {
                type = "frame_layout_package",
                exportDate = DateTime.UtcNow.ToString("O"),
                layoutId = frameLayout.Id,
                cloudTemplateId = frameLayout.CloudTemplateId,
                cloudVariantId = frameLayout.CloudVariantId,
                isTemplate = frameLayout.IsTemplate,
                displayName = frameLayout.DisplayName,
                description = frameLayout.Description,
                layoutType = frameLayout.LayoutType,
                width = frameLayout.Width,
                height = frameLayout.Height,
                orientation = frameLayout.Orientation,
                backgroundType = frameLayout.BackgroundType,
                backgroundColor = frameLayout.BackgroundColor,
                backgroundImageUrl = backgroundImageFileName != null ? $"images/{backgroundImageFileName}" :
                    (!string.IsNullOrEmpty(frameLayout.BackgroundImageUrl) && !frameLayout.BackgroundImageUrl.StartsWith("http") ? $"images/{Path.GetFileName(frameLayout.BackgroundImageUrl)}" : frameLayout.BackgroundImageUrl),
                backgroundImageFit = frameLayout.BackgroundImageFit,
                backgroundVideoUrl = backgroundVideoFileName != null ? $"videos/{backgroundVideoFileName}" :
                    (!string.IsNullOrEmpty(frameLayout.BackgroundVideoUrl) && !frameLayout.BackgroundVideoUrl.StartsWith("http") ? $"videos/{Path.GetFileName(frameLayout.BackgroundVideoUrl)}" : frameLayout.BackgroundVideoUrl),
                backgroundVideoFit = frameLayout.BackgroundVideoFit,
                videoLoop = frameLayout.VideoLoop,
                videoMuted = frameLayout.VideoMuted,
                videoAutoplay = frameLayout.VideoAutoplay,
                backgroundOpacity = frameLayout.BackgroundOpacity,
                riveFile = frameLayout.RiveFile,
                thumbnailOverride = frameLayout.ThumbnailOverride,
                jsonFrameConfigRaw = exportedFrameConfig,
                jsonFrameConfigRuntimeRaw = exportedFrameConfigRuntime,
                jsonFrameElementsRaw = exportedFrameElements,
                packageContents = packageContents.ToArray()
            };
        }

        /// <summary>
        /// Generates export config with JSON path processing for consistency with local exports.
        /// Processes embedded JSON to add path prefixes (images/, videos/, rive/) to all asset URLs.
        /// </summary>
        public object GenerateSimpleExportConfig(Model_Frame_Layout frameLayout, List<string> assetPaths)
        {
            return new
            {
                type = "frame_layout_package",
                exportDate = DateTime.UtcNow.ToString("O"),
                layoutId = frameLayout.Id,
                cloudTemplateId = frameLayout.CloudTemplateId,
                cloudVariantId = frameLayout.CloudVariantId,
                displayName = frameLayout.DisplayName,
                description = frameLayout.Description,
                layoutType = frameLayout.LayoutType,
                width = frameLayout.Width,
                height = frameLayout.Height,
                orientation = frameLayout.Orientation,
                backgroundType = frameLayout.BackgroundType,
                backgroundColor = frameLayout.BackgroundColor,
                // Add images/ prefix if not already there and not a URL
                backgroundImageUrl = !string.IsNullOrEmpty(frameLayout.BackgroundImageUrl) && !frameLayout.BackgroundImageUrl.StartsWith("http")
                    ? (frameLayout.BackgroundImageUrl.StartsWith("images/") ? frameLayout.BackgroundImageUrl : $"images/{Path.GetFileName(frameLayout.BackgroundImageUrl)}")
                    : frameLayout.BackgroundImageUrl,
                backgroundImageFit = frameLayout.BackgroundImageFit,
                // Add videos/ prefix if not already there and not a URL
                backgroundVideoUrl = !string.IsNullOrEmpty(frameLayout.BackgroundVideoUrl) && !frameLayout.BackgroundVideoUrl.StartsWith("http")
                    ? (frameLayout.BackgroundVideoUrl.StartsWith("videos/") ? frameLayout.BackgroundVideoUrl : $"videos/{Path.GetFileName(frameLayout.BackgroundVideoUrl)}")
                    : frameLayout.BackgroundVideoUrl,
                backgroundVideoFit = frameLayout.BackgroundVideoFit,
                videoLoop = frameLayout.VideoLoop,
                videoMuted = frameLayout.VideoMuted,
                videoAutoplay = frameLayout.VideoAutoplay,
                backgroundOpacity = frameLayout.BackgroundOpacity,
                riveFile = frameLayout.RiveFile,
                thumbnailOverride = frameLayout.ThumbnailOverride,
                jsonFrameConfigRaw = ProcessFrameConfigForExport(
                    frameLayout.JsonFrameConfig ?? "{}",
                    frameLayout.BackgroundImageUrl,
                    frameLayout.BackgroundVideoUrl),
                jsonFrameConfigRuntimeRaw = ProcessFrameConfigForExport(
                    frameLayout.JsonFrameConfigRuntime ?? "{}",
                    frameLayout.BackgroundImageUrl,
                    frameLayout.BackgroundVideoUrl),
                jsonFrameElementsRaw = ProcessFrameElementsForExport(frameLayout.JsonFrameElements ?? "[]"),
                packageContents = assetPaths.ToArray()
            };
        }
        /// <summary>
        /// Processes jsonFrameElements to add path prefixes (images/, videos/, rive/) to asset URLs
        /// </summary>
        private string ProcessFrameElementsForExport(string jsonFrameElements)
        {
            try
            {
                var elementsArray = JsonSerializer.Deserialize<JsonElement>(jsonFrameElements);
                if (elementsArray.ValueKind != JsonValueKind.Array)
                    return jsonFrameElements;

                var updatedElements = new List<object>();

                foreach (var element in elementsArray.EnumerateArray())
                {
                    var elementDict = new Dictionary<string, object?>();

                    // Copy all properties
                    foreach (var prop in element.EnumerateObject())
                    {
                        elementDict[prop.Name] = JsonSerializer.Deserialize<object>(prop.Value.GetRawText());
                    }

                    // Process properties if they exist
                    if (element.TryGetProperty("type", out var typeProperty) &&
                        element.TryGetProperty("properties", out var propertiesElement))
                    {
                        var elementType = typeProperty.GetString();
                        var properties = new Dictionary<string, object?>();

                        foreach (var prop in propertiesElement.EnumerateObject())
                        {
                            properties[prop.Name] = JsonSerializer.Deserialize<object>(prop.Value.GetRawText());
                        }

                        // Add path prefixes based on element type
                        if (elementType == "asset-image" && propertiesElement.TryGetProperty("assetImageUrl", out var imageUrl))
                        {
                            var url = imageUrl.GetString();
                            if (!string.IsNullOrEmpty(url) && !url.StartsWith("http") && !url.StartsWith("images/"))
                            {
                                properties["assetImageUrl"] = $"images/{Path.GetFileName(url)}";
                            }
                        }
                        else if (elementType == "asset-video" && propertiesElement.TryGetProperty("assetVideoUrl", out var videoUrl))
                        {
                            var url = videoUrl.GetString();
                            if (!string.IsNullOrEmpty(url) && !url.StartsWith("http") && !url.StartsWith("videos/"))
                            {
                                properties["assetVideoUrl"] = $"videos/{Path.GetFileName(url)}";
                            }
                        }
                        else if (elementType == "asset-rive" && propertiesElement.TryGetProperty("assetRiveFile", out var riveFile))
                        {
                            var file = riveFile.GetString();
                            if (!string.IsNullOrEmpty(file) && !file.StartsWith("rive/"))
                            {
                                properties["assetRiveFile"] = $"rive/{Path.GetFileName(file)}";
                            }
                        }

                        elementDict["properties"] = properties;
                    }

                    updatedElements.Add(elementDict);
                }

                return JsonSerializer.Serialize(updatedElements);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Warning: Failed to process frame elements: {ex.Message}");
                return jsonFrameElements;
            }
        }

        /// <summary>
        /// Processes jsonFrameConfig or jsonFrameConfigRuntime to add path prefixes to background URLs
        /// </summary>
        private string ProcessFrameConfigForExport(string jsonFrameConfig, string? backgroundImageUrl, string? backgroundVideoUrl)
        {
            try
            {
                var frameConfig = JsonSerializer.Deserialize<JsonElement>(jsonFrameConfig);
                if (frameConfig.ValueKind != JsonValueKind.Object)
                    return jsonFrameConfig;

                var configDict = new Dictionary<string, object?>();
                foreach (var prop in frameConfig.EnumerateObject())
                {
                    configDict[prop.Name] = JsonSerializer.Deserialize<object>(prop.Value.GetRawText());
                }

                if (configDict.TryGetValue("frameConfig", out var frameConfigObj) && frameConfigObj != null)
                {
                    var frameConfigDict = JsonSerializer.Deserialize<Dictionary<string, object?>>(
                        JsonSerializer.Serialize(frameConfigObj)) ?? new Dictionary<string, object?>();

                    if (frameConfigDict.TryGetValue("background", out var backgroundObj) && backgroundObj != null)
                    {
                        var backgroundDict = JsonSerializer.Deserialize<Dictionary<string, object?>>(
                            JsonSerializer.Serialize(backgroundObj)) ?? new Dictionary<string, object?>();

                        // Update background image URL
                        if (backgroundDict.ContainsKey("imageUrl") && backgroundDict["imageUrl"] != null)
                        {
                            var imageUrl = backgroundDict["imageUrl"]?.ToString();
                            if (!string.IsNullOrEmpty(imageUrl) && !imageUrl.StartsWith("http"))
                            {
                                if (!imageUrl.StartsWith("images/"))
                                {
                                    backgroundDict["imageUrl"] = $"images/{Path.GetFileName(imageUrl)}";
                                }
                            }
                        }

                        // Update background video URL
                        if (backgroundDict.ContainsKey("videoUrl") && backgroundDict["videoUrl"] != null)
                        {
                            var videoUrl = backgroundDict["videoUrl"]?.ToString();
                            if (!string.IsNullOrEmpty(videoUrl) && !videoUrl.StartsWith("http"))
                            {
                                if (!videoUrl.StartsWith("videos/"))
                                {
                                    backgroundDict["videoUrl"] = $"videos/{Path.GetFileName(videoUrl)}";
                                }
                            }
                        }

                        frameConfigDict["background"] = backgroundDict;
                    }

                    configDict["frameConfig"] = frameConfigDict;
                }

                return JsonSerializer.Serialize(configDict);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Warning: Failed to process frame config: {ex.Message}");
                return jsonFrameConfig;
            }
        }
        public async Task<(byte[] zipData, string filename)> ExportFrameLayoutPackageAsync(
            int id,
            string templatesPath,
            string rivePath,
            string assetsPath,
            string videosPath,
            string dbPath,
            string contentRootPath)
        {
            var frameLayout = await GetFrameLayoutByIdAsync(id);
            if (frameLayout == null)
                throw new InvalidOperationException($"Frame layout with ID {id} not found");

            var packageContents = new List<string> { "config.json" };

            string? riveFilePath = null;
            if (!string.IsNullOrEmpty(frameLayout.RiveFile))
            {
                riveFilePath = GetAssetFilePath(frameLayout.RiveFile, rivePath, templatesPath);
                if (!string.IsNullOrEmpty(riveFilePath) && System.IO.File.Exists(riveFilePath))
                {
                    packageContents.Add($"rive/{frameLayout.RiveFile}");
                }
                else
                {
                    Console.WriteLine($"Warning: Rive file '{frameLayout.RiveFile}' not found, exporting without it");
                    frameLayout.RiveFile = null;
                }
            }

            string? backgroundImagePath = null;
            string? backgroundImageFileName = null;
            if (!string.IsNullOrEmpty(frameLayout.BackgroundImageUrl) &&
                !frameLayout.BackgroundImageUrl.StartsWith("http://") &&
                !frameLayout.BackgroundImageUrl.StartsWith("https://"))
            {
                backgroundImageFileName = Path.GetFileName(frameLayout.BackgroundImageUrl);
                backgroundImagePath = GetAssetFilePath(backgroundImageFileName, assetsPath, templatesPath);

                if (!string.IsNullOrEmpty(backgroundImagePath) && System.IO.File.Exists(backgroundImagePath))
                {
                    packageContents.Add($"images/{backgroundImageFileName}");
                }
                else
                {
                    Console.WriteLine($"Warning: Background image '{frameLayout.BackgroundImageUrl}' not found");
                    backgroundImagePath = null;
                    backgroundImageFileName = null;
                }
            }

            string? backgroundVideoPath = null;
            string? backgroundVideoFileName = null;
            if (!string.IsNullOrEmpty(frameLayout.BackgroundVideoUrl) &&
                !frameLayout.BackgroundVideoUrl.StartsWith("http://") &&
                !frameLayout.BackgroundVideoUrl.StartsWith("https://"))
            {
                backgroundVideoFileName = Path.GetFileName(frameLayout.BackgroundVideoUrl);
                backgroundVideoPath = GetAssetFilePath(backgroundVideoFileName, videosPath, templatesPath);

                if (!string.IsNullOrEmpty(backgroundVideoPath) && System.IO.File.Exists(backgroundVideoPath))
                {
                    packageContents.Add($"videos/{backgroundVideoFileName}");
                }
                else
                {
                    Console.WriteLine($"Warning: Background video '{frameLayout.BackgroundVideoUrl}' not found");
                    backgroundVideoPath = null;
                    backgroundVideoFileName = null;
                }
            }

            // Process element assets (asset-image, asset-video, asset-rive components)
            var elementAssets = new Dictionary<string, (string physicalPath, string zipPath, string newUrl)>();
            string exportedFrameElements = frameLayout.JsonFrameElements ?? "[]";

            try
            {
                var elementsArray = JsonSerializer.Deserialize<JsonElement>(exportedFrameElements);
                if (elementsArray.ValueKind == JsonValueKind.Array)
                {
                    var updatedElements = new List<JsonElement>();

                    foreach (var element in elementsArray.EnumerateArray())
                    {
                        var elementDict = new Dictionary<string, object?>();

                        // Copy all properties
                        foreach (var prop in element.EnumerateObject())
                        {
                            elementDict[prop.Name] = JsonSerializer.Deserialize<object>(prop.Value.GetRawText());
                        }

                        // Check element type and process assets
                        if (element.TryGetProperty("type", out var typeProperty))
                        {
                            var elementType = typeProperty.GetString();

                            if (element.TryGetProperty("properties", out var propertiesElement))
                            {
                                var properties = new Dictionary<string, object?>();
                                foreach (var prop in propertiesElement.EnumerateObject())
                                {
                                    properties[prop.Name] = JsonSerializer.Deserialize<object>(prop.Value.GetRawText());
                                }

                                // Handle media-image elements
                                if (elementType == "media-image" && propertiesElement.TryGetProperty("filename", out var imageFilename))
                                {
                                    var imageFile = imageFilename.GetString();
                                    if (!string.IsNullOrEmpty(imageFile) &&
                                        !imageFile.StartsWith("http://") &&
                                        !imageFile.StartsWith("https://"))
                                    {
                                        var fileName = Path.GetFileName(imageFile);
                                        var filePath = GetAssetFilePath(fileName, assetsPath, templatesPath);

                                        if (!string.IsNullOrEmpty(filePath) && System.IO.File.Exists(filePath))
                                        {
                                            var zipPath = $"images/{fileName}";
                                            if (!elementAssets.ContainsKey(fileName))
                                            {
                                                elementAssets[fileName] = (filePath, zipPath, $"images/{fileName}");
                                                packageContents.Add(zipPath);
                                            }
                                            properties["filename"] = fileName;
                                        }
                                    }
                                }

                                // Handle media-video elements
                                if (elementType == "media-video" && propertiesElement.TryGetProperty("filename", out var videoFilename))
                                {
                                    var videoFile = videoFilename.GetString();
                                    if (!string.IsNullOrEmpty(videoFile) &&
                                        !videoFile.StartsWith("http://") &&
                                        !videoFile.StartsWith("https://"))
                                    {
                                        var fileName = Path.GetFileName(videoFile);
                                        var filePath = GetAssetFilePath(fileName, videosPath, templatesPath);

                                        if (!string.IsNullOrEmpty(filePath) && System.IO.File.Exists(filePath))
                                        {
                                            var zipPath = $"videos/{fileName}";
                                            if (!elementAssets.ContainsKey(fileName))
                                            {
                                                elementAssets[fileName] = (filePath, zipPath, $"videos/{fileName}");
                                                packageContents.Add(zipPath);
                                            }
                                            properties["filename"] = fileName;
                                        }
                                    }
                                }

                                // Handle media-rive elements
                                if (elementType == "media-rive" && propertiesElement.TryGetProperty("filename", out var riveFilename))
                                {
                                    var riveFileStr = riveFilename.GetString();
                                    if (!string.IsNullOrEmpty(riveFileStr))
                                    {
                                        var filePath = GetAssetFilePath(riveFileStr, rivePath, templatesPath);

                                        if (!string.IsNullOrEmpty(filePath) && System.IO.File.Exists(filePath))
                                        {
                                            var zipPath = $"rive/{riveFileStr}";
                                            if (!elementAssets.ContainsKey(riveFileStr))
                                            {
                                                elementAssets[riveFileStr] = (filePath, zipPath, riveFileStr);
                                                packageContents.Add(zipPath);
                                            }
                                            // Keep original filename property for media-rive
                                            properties["filename"] = riveFileStr;
                                        }
                                    }
                                }

                                elementDict["properties"] = properties;
                            }
                        }

                        updatedElements.Add(JsonSerializer.SerializeToElement(elementDict));
                    }

                    exportedFrameElements = JsonSerializer.Serialize(updatedElements);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Warning: Failed to process element assets: {ex.Message}");
            }

            // Update jsonFrameConfig to use relative paths for export
            string exportedFrameConfig = frameLayout.JsonFrameConfig ?? "{}";
            try
            {
                var frameConfig = JsonSerializer.Deserialize<JsonElement>(exportedFrameConfig);
                if (frameConfig.ValueKind == JsonValueKind.Object)
                {
                    var configDict = new Dictionary<string, object?>();
                    foreach (var prop in frameConfig.EnumerateObject())
                    {
                        configDict[prop.Name] = JsonSerializer.Deserialize<object>(prop.Value.GetRawText());
                    }

                    if (configDict.TryGetValue("frameConfig", out var frameConfigObj) && frameConfigObj != null)
                    {
                        var frameConfigDict = JsonSerializer.Deserialize<Dictionary<string, object?>>(
                            JsonSerializer.Serialize(frameConfigObj)) ?? new Dictionary<string, object?>();

                        if (frameConfigDict.TryGetValue("background", out var backgroundObj) && backgroundObj != null)
                        {
                            var backgroundDict = JsonSerializer.Deserialize<Dictionary<string, object?>>(
                                JsonSerializer.Serialize(backgroundObj)) ?? new Dictionary<string, object?>();

                            // Update background image URL to relative path if we're exporting the file
                            if (backgroundImageFileName != null)
                            {
                                backgroundDict["imageUrl"] = $"images/{backgroundImageFileName}";
                            }
                            // If not exporting file, keep just filename
                            else if (backgroundDict.ContainsKey("imageUrl") && backgroundDict["imageUrl"] != null)
                            {
                                var currentImageUrl = backgroundDict["imageUrl"]?.ToString();
                                if (!string.IsNullOrEmpty(currentImageUrl) && !currentImageUrl.StartsWith("http"))
                                {
                                    backgroundDict["imageUrl"] = Path.GetFileName(currentImageUrl);
                                }
                            }

                            // Update background video URL to relative path if we're exporting the file
                            if (backgroundVideoFileName != null)
                            {
                                backgroundDict["videoUrl"] = $"videos/{backgroundVideoFileName}";
                            }
                            // If not exporting file, keep just filename
                            else if (backgroundDict.ContainsKey("videoUrl") && backgroundDict["videoUrl"] != null)
                            {
                                var currentVideoUrl = backgroundDict["videoUrl"]?.ToString();
                                if (!string.IsNullOrEmpty(currentVideoUrl) && !currentVideoUrl.StartsWith("http"))
                                {
                                    backgroundDict["videoUrl"] = Path.GetFileName(currentVideoUrl);
                                }
                            }

                            // Handle background Rive file if present
                            if (backgroundDict.ContainsKey("riveFile") && backgroundDict["riveFile"] != null)
                            {
                                var currentRiveFile = backgroundDict["riveFile"]?.ToString();
                                if (!string.IsNullOrEmpty(currentRiveFile) && !currentRiveFile.StartsWith("http"))
                                {
                                    backgroundDict["riveFile"] = Path.GetFileName(currentRiveFile);
                                }
                            }

                            frameConfigDict["background"] = backgroundDict;
                        }

                        configDict["frameConfig"] = frameConfigDict;
                    }

                    exportedFrameConfig = JsonSerializer.Serialize(configDict);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Warning: Failed to update jsonFrameConfig for export: {ex.Message}");
            }

            // Update jsonFrameConfigRuntime to use relative paths for export
            string exportedFrameConfigRuntime = frameLayout.JsonFrameConfigRuntime ?? "{}";
            try
            {
                var frameConfigRuntime = JsonSerializer.Deserialize<JsonElement>(exportedFrameConfigRuntime);
                if (frameConfigRuntime.ValueKind == JsonValueKind.Object)
                {
                    var configDict = new Dictionary<string, object?>();
                    foreach (var prop in frameConfigRuntime.EnumerateObject())
                    {
                        configDict[prop.Name] = JsonSerializer.Deserialize<object>(prop.Value.GetRawText());
                    }

                    if (configDict.TryGetValue("frameConfig", out var frameConfigObj) && frameConfigObj != null)
                    {
                        var frameConfigDict = JsonSerializer.Deserialize<Dictionary<string, object?>>(
                            JsonSerializer.Serialize(frameConfigObj)) ?? new Dictionary<string, object?>();

                        if (frameConfigDict.TryGetValue("background", out var backgroundObj) && backgroundObj != null)
                        {
                            var backgroundDict = JsonSerializer.Deserialize<Dictionary<string, object?>>(
                                JsonSerializer.Serialize(backgroundObj)) ?? new Dictionary<string, object?>();

                            // Update background image URL to relative path if we're exporting the file
                            if (backgroundImageFileName != null)
                            {
                                backgroundDict["imageUrl"] = $"images/{backgroundImageFileName}";
                            }
                            // If not exporting file, keep just filename format
                            else if (backgroundDict.ContainsKey("imageUrl") && backgroundDict["imageUrl"] != null)
                            {
                                var currentImageUrl = backgroundDict["imageUrl"]?.ToString();
                                if (!string.IsNullOrEmpty(currentImageUrl) && !currentImageUrl.StartsWith("http"))
                                {
                                    backgroundDict["imageUrl"] = $"assets/{Path.GetFileName(currentImageUrl)}";
                                }
                            }

                            // Update background video URL to relative path if we're exporting the file
                            if (backgroundVideoFileName != null)
                            {
                                backgroundDict["videoUrl"] = $"videos/{backgroundVideoFileName}";
                            }
                            // If not exporting file, keep just filename format
                            else if (backgroundDict.ContainsKey("videoUrl") && backgroundDict["videoUrl"] != null)
                            {
                                var currentVideoUrl = backgroundDict["videoUrl"]?.ToString();
                                if (!string.IsNullOrEmpty(currentVideoUrl) && !currentVideoUrl.StartsWith("http"))
                                {
                                    backgroundDict["videoUrl"] = $"videos/{Path.GetFileName(currentVideoUrl)}";
                                }
                            }

                            // Handle background Rive file if present
                            if (backgroundDict.ContainsKey("riveFile") && backgroundDict["riveFile"] != null)
                            {
                                var currentRiveFile = backgroundDict["riveFile"]?.ToString();
                                if (!string.IsNullOrEmpty(currentRiveFile) && !currentRiveFile.StartsWith("http"))
                                {
                                    backgroundDict["riveFile"] = Path.GetFileName(currentRiveFile);
                                }
                            }

                            frameConfigDict["background"] = backgroundDict;
                        }

                        configDict["frameConfig"] = frameConfigDict;
                    }

                    exportedFrameConfigRuntime = JsonSerializer.Serialize(configDict);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Warning: Failed to update jsonFrameConfigRuntime for export: {ex.Message}");
            }

            var exportData = GenerateExportConfig(
                frameLayout,
                backgroundImageFileName,
                backgroundVideoFileName,
                exportedFrameConfig,
                exportedFrameConfigRuntime,
                exportedFrameElements,
                packageContents);

            using var memoryStream = new MemoryStream();
            using (var archive = new System.IO.Compression.ZipArchive(memoryStream, System.IO.Compression.ZipArchiveMode.Create, true))
            {
                var configEntry = archive.CreateEntry("config.json");
                using (var configStream = configEntry.Open())
                {
                    var jsonBytes = JsonSerializer.SerializeToUtf8Bytes(exportData, new JsonSerializerOptions { WriteIndented = true });
                    await configStream.WriteAsync(jsonBytes, 0, jsonBytes.Length);
                }

                if (!string.IsNullOrEmpty(riveFilePath) && System.IO.File.Exists(riveFilePath))
                {
                    var riveEntry = archive.CreateEntry($"rive/{frameLayout.RiveFile}");
                    using (var riveStream = riveEntry.Open())
                    {
                        var riveBytes = await System.IO.File.ReadAllBytesAsync(riveFilePath);
                        await riveStream.WriteAsync(riveBytes, 0, riveBytes.Length);
                    }
                }

                if (!string.IsNullOrEmpty(backgroundImagePath) && System.IO.File.Exists(backgroundImagePath))
                {
                    var imageEntry = archive.CreateEntry($"images/{backgroundImageFileName}");
                    using (var imageStream = imageEntry.Open())
                    {
                        var imageBytes = await System.IO.File.ReadAllBytesAsync(backgroundImagePath);
                        await imageStream.WriteAsync(imageBytes, 0, imageBytes.Length);
                    }
                }

                if (!string.IsNullOrEmpty(backgroundVideoPath) && System.IO.File.Exists(backgroundVideoPath))
                {
                    var videoEntry = archive.CreateEntry($"videos/{backgroundVideoFileName}");
                    using (var videoStream = videoEntry.Open())
                    {
                        var videoBytes = await System.IO.File.ReadAllBytesAsync(backgroundVideoPath);
                        await videoStream.WriteAsync(videoBytes, 0, videoBytes.Length);
                    }
                }

                // Write element assets to ZIP
                foreach (var asset in elementAssets.Values)
                {
                    if (System.IO.File.Exists(asset.physicalPath))
                    {
                        var assetEntry = archive.CreateEntry(asset.zipPath);
                        using (var assetStream = assetEntry.Open())
                        {
                            var assetBytes = await System.IO.File.ReadAllBytesAsync(asset.physicalPath);
                            await assetStream.WriteAsync(assetBytes, 0, assetBytes.Length);
                        }
                    }
                }

                if (frameLayout.HasThumbnail && !string.IsNullOrEmpty(frameLayout.ThumbnailPath))
                {
                    string thumbnailPath;

                    if (frameLayout.ThumbnailPath.StartsWith("/templates/"))
                    {
                        var fileName = Path.GetFileName(frameLayout.ThumbnailPath);
                        thumbnailPath = Path.Combine(contentRootPath, "frameengine", "templates", fileName);
                    }
                    else
                    {
                        var dataDir = Path.GetDirectoryName(dbPath)!;
                        thumbnailPath = Path.Combine(dataDir, frameLayout.ThumbnailPath.Replace("/", Path.DirectorySeparatorChar.ToString()));
                    }

                    if (System.IO.File.Exists(thumbnailPath))
                    {
                        var thumbnailFormat = frameLayout.ThumbnailFormat ?? "png";
                        var thumbnailFileName = $"thumbnail.{thumbnailFormat}";
                        var thumbnailEntry = archive.CreateEntry($"thumbnails/{thumbnailFileName}");
                        using (var thumbnailStream = thumbnailEntry.Open())
                        {
                            var thumbnailBytes = await System.IO.File.ReadAllBytesAsync(thumbnailPath);
                            await thumbnailStream.WriteAsync(thumbnailBytes, 0, thumbnailBytes.Length);
                        }
                    }
                }
            }

            var zipBytes = memoryStream.ToArray();
            var filename = $"{SanitizeFilename(frameLayout.DisplayName)}.zip";

            return (zipBytes, filename);
        }

        private static string? GetAssetFilePath(string fileName, string userPath, string templatesPath)
        {
            var userFile = Path.Combine(userPath, fileName);
            if (System.IO.File.Exists(userFile))
                return userFile;

            var templateFile = Path.Combine(templatesPath, fileName);
            if (System.IO.File.Exists(templateFile))
                return templateFile;

            return null;
        }

        private static string SanitizeFilename(string filename)
        {
            var invalid = Path.GetInvalidFileNameChars();
            var sanitized = string.Join("_", filename.Split(invalid, StringSplitOptions.RemoveEmptyEntries));
            return string.IsNullOrWhiteSpace(sanitized) ? "frame_layout" : sanitized;
        }

        public async Task<int> ImportFrameLayoutPackageAsync(
    byte[] zipData,
    string contentRootPath,
    string templatesPath,
    string rivePath,
    string assetsPath,
    string videosPath,
    string dbPath,
    bool preserveCloudIds = true)
        {
            using var zipStream = new MemoryStream(zipData);
            using var archive = new System.IO.Compression.ZipArchive(zipStream, System.IO.Compression.ZipArchiveMode.Read);

            var configEntry = archive.GetEntry("config.json");
            if (configEntry == null)
                throw new InvalidOperationException("Invalid import package: config.json not found");

            string configJson;
            using (var configStream = configEntry.Open())
            using (var reader = new StreamReader(configStream))
            {
                configJson = await reader.ReadToEndAsync();
            }

            var importData = JsonSerializer.Deserialize<JsonElement>(configJson);

            if (!importData.TryGetProperty("type", out var typeProperty) ||
                typeProperty.GetString() != "frame_layout_package")
            {
                throw new InvalidOperationException("Invalid import package: not a frame layout package");
            }

            var displayName = importData.GetProperty("displayName").GetString() ?? "Imported Layout";
            var description = importData.GetProperty("description").GetString();
            var layoutType = importData.GetProperty("layoutType").GetString() ?? "COMPOSITE_MODE";
            var width = importData.GetProperty("width").GetInt32();
            var height = importData.GetProperty("height").GetInt32();
            var orientation = importData.GetProperty("orientation").GetString() ?? "landscape";
            var backgroundType = importData.GetProperty("backgroundType").GetString() ?? "color";
            var backgroundColor = importData.GetProperty("backgroundColor").GetString() ?? "#FFFFFF";

            string? backgroundImageUrl = null;
            if (importData.TryGetProperty("backgroundImageUrl", out var imageUrlProp))
            {
                backgroundImageUrl = imageUrlProp.GetString();
            }

            string? backgroundImageFit = "cover";
            if (importData.TryGetProperty("backgroundImageFit", out var imageFitProp))
            {
                backgroundImageFit = imageFitProp.GetString() ?? "cover";
            }

            string? backgroundVideoUrl = null;
            if (importData.TryGetProperty("backgroundVideoUrl", out var videoUrlProp))
            {
                backgroundVideoUrl = videoUrlProp.GetString();
            }

            string? backgroundVideoFit = "cover";
            if (importData.TryGetProperty("backgroundVideoFit", out var videoFitProp))
            {
                backgroundVideoFit = videoFitProp.GetString() ?? "cover";
            }

            bool videoLoop = true;
            if (importData.TryGetProperty("videoLoop", out var videoLoopProp))
            {
                videoLoop = videoLoopProp.GetBoolean();
            }

            bool videoMuted = true;
            if (importData.TryGetProperty("videoMuted", out var videoMutedProp))
            {
                videoMuted = videoMutedProp.GetBoolean();
            }

            bool videoAutoplay = true;
            if (importData.TryGetProperty("videoAutoplay", out var videoAutoplayProp))
            {
                videoAutoplay = videoAutoplayProp.GetBoolean();
            }

            var backgroundOpacity = importData.GetProperty("backgroundOpacity").GetDouble();
            var riveFile = importData.GetProperty("riveFile").GetString();

            var thumbnailOverride = false;
            if (importData.TryGetProperty("thumbnailOverride", out var thumbnailOverrideProp))
            {
                thumbnailOverride = thumbnailOverrideProp.GetBoolean();
            }

            var jsonFrameConfig = "{}";
            var jsonFrameConfigRuntime = "{}";
            var jsonFrameElements = "[]";

            if (importData.TryGetProperty("jsonFrameConfigRaw", out var configRaw))
            {
                jsonFrameConfig = configRaw.GetString() ?? "{}";
            }
            else if (importData.TryGetProperty("jsonFrameConfig", out var configOld))
            {
                jsonFrameConfig = JsonSerializer.Serialize(configOld);
            }

            if (importData.TryGetProperty("jsonFrameConfigRuntimeRaw", out var configRuntimeRaw))
            {
                jsonFrameConfigRuntime = configRuntimeRaw.GetString() ?? "{}";
            }
            else if (importData.TryGetProperty("jsonFrameConfigRuntime", out var configRuntimeOld))
            {
                jsonFrameConfigRuntime = JsonSerializer.Serialize(configRuntimeOld);
            }

            if (importData.TryGetProperty("jsonFrameElementsRaw", out var elementsRaw))
            {
                jsonFrameElements = elementsRaw.GetString() ?? "[]";
            }
            else if (importData.TryGetProperty("jsonFrameElements", out var elementsOld))
            {
                jsonFrameElements = JsonSerializer.Serialize(elementsOld);
            }

            // Extract cloud template tracking fields if present (UUID strings)
            string? cloudTemplateId = null;
            string? cloudVariantId = null;

            if (importData.TryGetProperty("cloudTemplateId", out var cloudTemplateIdValue))
            {
                if (cloudTemplateIdValue.ValueKind == JsonValueKind.String)
                {
                    cloudTemplateId = cloudTemplateIdValue.GetString();
                }
            }

            if (importData.TryGetProperty("cloudVariantId", out var cloudVariantIdValue))
            {
                if (cloudVariantIdValue.ValueKind == JsonValueKind.String)
                {
                    cloudVariantId = cloudVariantIdValue.GetString();
                }
            }

            // Read isTemplate from config.json (don't derive it from cloud IDs)
            bool isTemplate = false;
            if (importData.TryGetProperty("isTemplate", out var isTemplateProp))
            {
                isTemplate = isTemplateProp.GetBoolean();
            }

            // Handle preserveCloudIds parameter
            if (!preserveCloudIds)
            {
                // New layout mode - generate fresh UUIDs
                cloudTemplateId = Guid.NewGuid().ToString();
                cloudVariantId = Guid.NewGuid().ToString();
                Console.WriteLine($"[IMPORT] Generating new UUIDs for new layout - TID: {cloudTemplateId}, VID: {cloudVariantId}");
            }
            else
            {
                // Migration mode - check for duplicate CloudVariantId
                if (!string.IsNullOrEmpty(cloudVariantId))
                {
                    var existingLayout = await GetFrameLayoutByCloudVariantIdAsync(cloudVariantId);
                    if (existingLayout != null)
                    {
                        throw new InvalidOperationException(
                            $"Cannot migrate: A layout with CloudVariantId '{cloudVariantId}' already exists " +
                            $"(ID: {existingLayout.Id}, Name: '{existingLayout.DisplayName}'). " +
                            $"Delete the existing layout before importing as a migration, or choose 'Import as New Layout' instead."
                        );
                    }
                }
                Console.WriteLine($"[IMPORT] Migration mode - preserving UUIDs - TID: {cloudTemplateId}, VID: {cloudVariantId}");
            }

            var uniqueName = await EnsureUniqueLayoutName(displayName);

            string? savedRiveFileName = null;
            if (!string.IsNullOrEmpty(riveFile))
            {
                var riveEntry = archive.GetEntry($"rive/{riveFile}");
                if (riveEntry != null)
                {
                    var riveFileName = Path.GetFileNameWithoutExtension(riveFile);
                    var riveExtension = Path.GetExtension(riveFile);
                    savedRiveFileName = GenerateUniqueFilename(rivePath, riveFileName, riveExtension);

                    var riveFilePath = Path.Combine(rivePath, savedRiveFileName);
                    Directory.CreateDirectory(rivePath);

                    using var riveStream = riveEntry.Open();
                    using var riveFileStream = new FileStream(riveFilePath, FileMode.Create);
                    await riveStream.CopyToAsync(riveFileStream);
                }
            }

            string? savedImageFileName = null;
            if (!string.IsNullOrEmpty(backgroundImageUrl) &&
                !backgroundImageUrl.StartsWith("http://") &&
                !backgroundImageUrl.StartsWith("https://"))
            {
                var imageFileName = Path.GetFileName(backgroundImageUrl);
                var imageEntry = archive.GetEntry($"images/{imageFileName}");

                if (imageEntry != null)
                {
                    var imageName = Path.GetFileNameWithoutExtension(imageFileName);
                    var imageExtension = Path.GetExtension(imageFileName);
                    savedImageFileName = GenerateUniqueFilename(assetsPath, imageName, imageExtension);

                    var imageFilePath = Path.Combine(assetsPath, savedImageFileName);
                    Directory.CreateDirectory(assetsPath);

                    using var imageStream = imageEntry.Open();
                    using var imageFileStream = new FileStream(imageFilePath, FileMode.Create);
                    await imageStream.CopyToAsync(imageFileStream);

                    backgroundImageUrl = savedImageFileName;
                }
            }

            string? savedVideoFileName = null;
            if (!string.IsNullOrEmpty(backgroundVideoUrl) &&
                !backgroundVideoUrl.StartsWith("http://") &&
                !backgroundVideoUrl.StartsWith("https://"))
            {
                var videoFileName = Path.GetFileName(backgroundVideoUrl);
                var videoEntry = archive.GetEntry($"videos/{videoFileName}");

                if (videoEntry != null)
                {
                    var videoName = Path.GetFileNameWithoutExtension(videoFileName);
                    var videoExtension = Path.GetExtension(videoFileName);
                    savedVideoFileName = GenerateUniqueFilename(videosPath, videoName, videoExtension);

                    var videoFilePath = Path.Combine(videosPath, savedVideoFileName);
                    Directory.CreateDirectory(videosPath);

                    using var videoStream = videoEntry.Open();
                    using var videoFileStream = new FileStream(videoFilePath, FileMode.Create);
                    await videoStream.CopyToAsync(videoFileStream);

                    backgroundVideoUrl = savedVideoFileName;
                }
            }

            // Update jsonFrameConfig with transformed background paths (Note: background URLs should be just filenames, not full paths)
            try
            {
                var frameConfig = JsonSerializer.Deserialize<JsonElement>(jsonFrameConfig);
                if (frameConfig.ValueKind == JsonValueKind.Object)
                {
                    var configDict = new Dictionary<string, object?>();
                    foreach (var prop in frameConfig.EnumerateObject())
                    {
                        configDict[prop.Name] = JsonSerializer.Deserialize<object>(prop.Value.GetRawText());
                    }

                    // Update background paths in nested structure to match root-level transformed paths
                    if (configDict.TryGetValue("frameConfig", out var frameConfigObj) && frameConfigObj != null)
                    {
                        var frameConfigDict = JsonSerializer.Deserialize<Dictionary<string, object?>>(
                            JsonSerializer.Serialize(frameConfigObj)) ?? new Dictionary<string, object?>();

                        if (frameConfigDict.TryGetValue("background", out var backgroundObj) && backgroundObj != null)
                        {
                            var backgroundDict = JsonSerializer.Deserialize<Dictionary<string, object?>>(
                                JsonSerializer.Serialize(backgroundObj)) ?? new Dictionary<string, object?>();

                            if (!string.IsNullOrEmpty(backgroundImageUrl))
                            {
                                backgroundDict["imageUrl"] = backgroundImageUrl;
                            }

                            if (!string.IsNullOrEmpty(backgroundVideoUrl))
                            {
                                backgroundDict["videoUrl"] = backgroundVideoUrl;
                            }

                            // Handle background Rive file if present in the import data
                            if (backgroundDict.ContainsKey("riveFile") && backgroundDict["riveFile"] != null)
                            {
                                // Keep the riveFile as-is during import (it should already be just a filename)
                                var bgRiveFile = backgroundDict["riveFile"]?.ToString();
                                if (!string.IsNullOrEmpty(bgRiveFile) && !bgRiveFile.StartsWith("http"))
                                {
                                    backgroundDict["riveFile"] = Path.GetFileName(bgRiveFile);
                                }
                            }

                            frameConfigDict["background"] = backgroundDict;
                        }

                        configDict["frameConfig"] = frameConfigDict;
                    }

                    jsonFrameConfig = JsonSerializer.Serialize(configDict);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Warning: Failed to update jsonFrameConfig paths: {ex.Message}");
            }

            // Update jsonFrameConfigRuntime with transformed background paths
            try
            {
                var frameConfigRuntime = JsonSerializer.Deserialize<JsonElement>(jsonFrameConfigRuntime);
                if (frameConfigRuntime.ValueKind == JsonValueKind.Object)
                {
                    var configDict = new Dictionary<string, object?>();
                    foreach (var prop in frameConfigRuntime.EnumerateObject())
                    {
                        configDict[prop.Name] = JsonSerializer.Deserialize<object>(prop.Value.GetRawText());
                    }

                    // Update background paths in nested structure to match root-level transformed paths
                    if (configDict.TryGetValue("frameConfig", out var frameConfigObj) && frameConfigObj != null)
                    {
                        var frameConfigDict = JsonSerializer.Deserialize<Dictionary<string, object?>>(
                            JsonSerializer.Serialize(frameConfigObj)) ?? new Dictionary<string, object?>();

                        if (frameConfigDict.TryGetValue("background", out var backgroundObj) && backgroundObj != null)
                        {
                            var backgroundDict = JsonSerializer.Deserialize<Dictionary<string, object?>>(
                                JsonSerializer.Serialize(backgroundObj)) ?? new Dictionary<string, object?>();

                            if (!string.IsNullOrEmpty(backgroundImageUrl))
                            {
                                backgroundDict["imageUrl"] = backgroundImageUrl;
                            }

                            if (!string.IsNullOrEmpty(backgroundVideoUrl))
                            {
                                backgroundDict["videoUrl"] = backgroundVideoUrl;
                            }

                            // Handle background Rive file if present in the import data
                            if (backgroundDict.ContainsKey("riveFile") && backgroundDict["riveFile"] != null)
                            {
                                // Keep the riveFile as-is during import (it should already be just a filename)
                                var bgRiveFile = backgroundDict["riveFile"]?.ToString();
                                if (!string.IsNullOrEmpty(bgRiveFile) && !bgRiveFile.StartsWith("http"))
                                {
                                    backgroundDict["riveFile"] = Path.GetFileName(bgRiveFile);
                                }
                            }

                            frameConfigDict["background"] = backgroundDict;
                        }

                        configDict["frameConfig"] = frameConfigDict;
                    }

                    jsonFrameConfigRuntime = JsonSerializer.Serialize(configDict);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Warning: Failed to update jsonFrameConfigRuntime paths: {ex.Message}");
            }

            // Process element assets from jsonFrameElements
            try
            {
                var elementsArray = JsonSerializer.Deserialize<JsonElement>(jsonFrameElements);
                if (elementsArray.ValueKind == JsonValueKind.Array)
                {
                    var updatedElements = new List<JsonElement>();

                    foreach (var element in elementsArray.EnumerateArray())
                    {
                        var elementDict = new Dictionary<string, object?>();

                        // Copy all properties
                        foreach (var prop in element.EnumerateObject())
                        {
                            elementDict[prop.Name] = JsonSerializer.Deserialize<object>(prop.Value.GetRawText());
                        }

                        // Check element type and process assets
                        if (element.TryGetProperty("type", out var elementTypeProperty))
                        {
                            var elementType = elementTypeProperty.GetString();

                            if (element.TryGetProperty("properties", out var propertiesElement))
                            {
                                var properties = new Dictionary<string, object?>();
                                foreach (var prop in propertiesElement.EnumerateObject())
                                {
                                    properties[prop.Name] = JsonSerializer.Deserialize<object>(prop.Value.GetRawText());
                                }

                                // Handle media-image elements
                                if (elementType == "media-image" && propertiesElement.TryGetProperty("filename", out var imageFilename))
                                {
                                    var imageUrl = imageFilename.GetString();
                                    if (!string.IsNullOrEmpty(imageUrl) &&
                                        !imageUrl.StartsWith("http://") &&
                                        !imageUrl.StartsWith("https://"))
                                    {
                                        var imageFileName = Path.GetFileName(imageUrl);
                                        var imageEntry = archive.GetEntry($"images/{imageFileName}");

                                        if (imageEntry != null)
                                        {
                                            var imageName = Path.GetFileNameWithoutExtension(imageFileName);
                                            var imageExtension = Path.GetExtension(imageFileName);
                                            var savedElementImageFileName = GenerateUniqueFilename(assetsPath, imageName, imageExtension);

                                            var imageFilePath = Path.Combine(assetsPath, savedElementImageFileName);
                                            Directory.CreateDirectory(assetsPath);

                                            using var imageStream = imageEntry.Open();
                                            using var imageFileStream = new FileStream(imageFilePath, FileMode.Create);
                                            await imageStream.CopyToAsync(imageFileStream);

                                            properties["filename"] = savedElementImageFileName;
                                        }
                                    }
                                }

                                // Handle media-video elements
                                if (elementType == "media-video" && propertiesElement.TryGetProperty("filename", out var videoFilename))
                                {
                                    var videoUrl = videoFilename.GetString();
                                    if (!string.IsNullOrEmpty(videoUrl) &&
                                        !videoUrl.StartsWith("http://") &&
                                        !videoUrl.StartsWith("https://"))
                                    {
                                        var videoFileName = Path.GetFileName(videoUrl);
                                        var videoEntry = archive.GetEntry($"videos/{videoFileName}");

                                        if (videoEntry != null)
                                        {
                                            var videoName = Path.GetFileNameWithoutExtension(videoFileName);
                                            var videoExtension = Path.GetExtension(videoFileName);
                                            var savedElementVideoFileName = GenerateUniqueFilename(videosPath, videoName, videoExtension);

                                            var videoFilePath = Path.Combine(videosPath, savedElementVideoFileName);
                                            Directory.CreateDirectory(videosPath);

                                            using var videoStream = videoEntry.Open();
                                            using var videoFileStream = new FileStream(videoFilePath, FileMode.Create);
                                            await videoStream.CopyToAsync(videoFileStream);

                                            properties["filename"] = savedElementVideoFileName;
                                        }
                                    }
                                }

                                // Handle media-rive elements
                                if (elementType == "media-rive" && propertiesElement.TryGetProperty("filename", out var riveFilename))
                                {
                                    var riveFileStr = riveFilename.GetString();
                                    if (!string.IsNullOrEmpty(riveFileStr))
                                    {
                                        var riveEntry = archive.GetEntry($"rive/{riveFileStr}");

                                        if (riveEntry != null)
                                        {
                                            var riveFileName = Path.GetFileNameWithoutExtension(riveFileStr);
                                            var riveExtension = Path.GetExtension(riveFileStr);
                                            var savedRiveFileName2 = GenerateUniqueFilename(rivePath, riveFileName, riveExtension);

                                            var riveFilePath2 = Path.Combine(rivePath, savedRiveFileName2);
                                            Directory.CreateDirectory(rivePath);

                                            using var riveStream = riveEntry.Open();
                                            using var riveFileStream = new FileStream(riveFilePath2, FileMode.Create);
                                            await riveStream.CopyToAsync(riveFileStream);

                                            properties["filename"] = savedRiveFileName2;
                                        }
                                    }
                                }

                                elementDict["properties"] = properties;
                            }
                        }

                        updatedElements.Add(JsonSerializer.SerializeToElement(elementDict));
                    }

                    jsonFrameElements = JsonSerializer.Serialize(updatedElements);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Warning: Failed to process element assets during import: {ex.Message}");
            }

            var newFrameLayout = new Model_Frame_Layout
            {
                DisplayName = uniqueName,
                Description = description,
                LayoutType = layoutType,
                Width = width,
                Height = height,
                Orientation = orientation,
                BackgroundType = backgroundType,
                BackgroundColor = backgroundColor,
                BackgroundImageUrl = backgroundImageUrl,
                BackgroundImageFit = backgroundImageFit,
                BackgroundVideoUrl = backgroundVideoUrl,
                BackgroundVideoFit = backgroundVideoFit,
                VideoLoop = videoLoop,
                VideoMuted = videoMuted,
                VideoAutoplay = videoAutoplay,
                BackgroundOpacity = backgroundOpacity,
                RiveFile = savedRiveFileName,
                JsonFrameConfig = jsonFrameConfig,
                JsonFrameConfigRuntime = jsonFrameConfigRuntime,
                JsonFrameElements = jsonFrameElements,
                IsTemplate = isTemplate,
                CloudTemplateId = cloudTemplateId,
                CloudVariantId = cloudVariantId,
                IsDraft = true,
                IsPublished = false,
                Created = DateTime.UtcNow,
                LastModified = DateTime.UtcNow,
                CreatedBy = "Import",
                Version = "1.0",
                ThumbnailOverride = thumbnailOverride
            };

            var layoutId = await CreateFrameLayoutAsync(newFrameLayout);

            // Look for thumbnail in thumbnails/ folder
            var thumbnailEntry = archive.Entries.FirstOrDefault(e =>
                e.FullName.StartsWith("thumbnails/") &&
                (e.Name.EndsWith(".png") || e.Name.EndsWith(".jpg") || e.Name.EndsWith(".jpeg") || e.Name.EndsWith(".webp")));

            if (thumbnailEntry != null)
            {
                var thumbnailFormat = Path.GetExtension(thumbnailEntry.Name).TrimStart('.');
                var thumbnailsDir = GetThumbnailsDirectory(dbPath);
                Directory.CreateDirectory(thumbnailsDir);

                var thumbnailFileName = $"{layoutId}.{thumbnailFormat}";
                var thumbnailPath = Path.Combine(thumbnailsDir, thumbnailFileName);

                using var thumbnailStream = thumbnailEntry.Open();
                using var thumbnailFileStream = new FileStream(thumbnailPath, FileMode.Create);
                await thumbnailStream.CopyToAsync(thumbnailFileStream);

                newFrameLayout.Id = layoutId;
                newFrameLayout.HasThumbnail = true;
                newFrameLayout.ThumbnailPath = Path.Combine("frameengine", "thumbnails", thumbnailFileName).Replace("\\", "/");
                newFrameLayout.ThumbnailFormat = thumbnailFormat;
                newFrameLayout.ThumbnailGeneratedAt = DateTime.UtcNow;

                await UpdateFrameLayoutAsync(newFrameLayout);
            }

            return layoutId;
        }

        private async Task<string> EnsureUniqueLayoutName(string baseName)
        {
            var uniqueName = baseName;
            var counter = 1;

            while (await GetFrameLayoutByNameAsync(uniqueName) != null)
            {
                uniqueName = $"{baseName} (Import {counter})";
                counter++;
            }

            return uniqueName;
        }

        private static string GenerateUniqueFilename(string directory, string baseName, string extension)
        {
            var filename = $"{baseName}{extension}";
            var counter = 1;

            while (System.IO.File.Exists(Path.Combine(directory, filename)))
            {
                filename = $"{baseName}_{counter}{extension}";
                counter++;
            }

            return filename;
        }

        private static string GetThumbnailsDirectory(string dbPath)
        {
            var dataDir = Path.GetDirectoryName(dbPath)!;
            return Path.Combine(dataDir, "frameengine", "thumbnails");
        }

    }
}