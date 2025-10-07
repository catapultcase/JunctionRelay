/*
 * This file is part of JunctionRelay.
 * (license header unchanged)
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

        public async Task<int> CreateFrameLayoutAsync(Model_Frame_Layout frameLayout)
        {
            // Validate before saving
            ValidateFrameLayout(frameLayout);

            const string sql = @"
        INSERT INTO FrameLayouts 
          (DisplayName, Description, LayoutType,
           IsTemplate, IsDraft, IsPublished, Created, LastModified, CreatedBy, Version,
           BackgroundType, BackgroundColor, BackgroundImageUrl, BackgroundImageData, BackgroundOpacity,
           Width, Height, Orientation, RiveFile,
           JsonFrameConfig, JsonFrameElements,
           HasThumbnail, ThumbnailPath, ThumbnailGeneratedAt, ThumbnailFormat, ThumbnailOverride)
        VALUES 
          (@DisplayName, @Description, @LayoutType,
           @IsTemplate, @IsDraft, @IsPublished, @Created, @LastModified, @CreatedBy, @Version,
           @BackgroundType, @BackgroundColor, @BackgroundImageUrl, @BackgroundImageData, @BackgroundOpacity,
           @Width, @Height, @Orientation, @RiveFile,
           @JsonFrameConfig, @JsonFrameElements,
           @HasThumbnail, @ThumbnailPath, @ThumbnailGeneratedAt, @ThumbnailFormat, @ThumbnailOverride);
        SELECT last_insert_rowid();
    ";

            if (frameLayout.Created == default)
                frameLayout.Created = DateTime.UtcNow;

            frameLayout.LastModified = DateTime.UtcNow;

            return await _db.ExecuteScalarAsync<int>(sql, frameLayout);
        }

        public async Task<bool> UpdateFrameLayoutAsync(Model_Frame_Layout frameLayout)
        {
            // Validate before updating
            ValidateFrameLayout(frameLayout);

            // Ensure it exists
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
                  IsDraft               = @IsDraft,
                  IsPublished           = @IsPublished,
                  LastModified          = @LastModified,
                  CreatedBy             = @CreatedBy,
                  Version               = @Version,
                  BackgroundType        = @BackgroundType,
                  BackgroundColor       = @BackgroundColor,
                  BackgroundImageUrl    = @BackgroundImageUrl,
                  BackgroundImageData   = @BackgroundImageData,
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

            // Ensure unique name
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
                IsDraft = true,
                IsPublished = false,
                Created = DateTime.UtcNow,
                CreatedBy = original.CreatedBy ?? "System",
                Version = original.Version ?? "1.0",
                BackgroundType = original.BackgroundType,
                BackgroundColor = original.BackgroundColor,
                BackgroundImageUrl = original.BackgroundImageUrl,
                BackgroundImageData = original.BackgroundImageData,
                BackgroundOpacity = original.BackgroundOpacity,
                Width = original.Width,
                Height = original.Height,
                Orientation = original.Orientation,
                RiveFile = original.RiveFile,
                JsonFrameConfig = original.JsonFrameConfig,
                JsonFrameElements = original.JsonFrameElements,
                // Reset thumbnail override for clones - they get auto-generated thumbnails
                ThumbnailOverride = false
            };

            return await CreateFrameLayoutAsync(clone);
        }

        public async Task<bool> RestoreDefaultTemplatesAsync()
        {
            try
            {
                // The service handles its own path resolution
                var contentRootPath = _webHostEnvironment.ContentRootPath;
                var dbPath = _dbPathProvider.DbPath;
                var dataDir = Path.GetDirectoryName(dbPath) ?? throw new InvalidOperationException("Invalid database path");
                var riveUserPath = Path.Combine(dataDir, "frameengine", "rive");
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

                        // Check if template already exists
                        var existing = await GetFrameLayoutByNameAsync(templateName);
                        if (existing != null && existing.IsTemplate)
                        {
                            Console.WriteLine($"Template '{templateName}' already exists, skipping");
                            continue;
                        }

                        Console.WriteLine($"Importing template: {templateName}");

                        // Use existing import method with internal path resolution
                        var zipData = await File.ReadAllBytesAsync(zipFile);
                        var layoutId = await ImportFrameLayoutPackageAsync(zipData, contentRootPath, riveUserPath, dbPath);

                        // Convert imported layout to template
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

            // Validate JSON if provided
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

        public async Task<(byte[] zipData, string filename)> ExportFrameLayoutPackageAsync(int id, string riveTemplatesPath, string riveUserPath, string dbPath, string contentRootPath)
        {
            var frameLayout = await GetFrameLayoutByIdAsync(id);
            if (frameLayout == null)
                throw new InvalidOperationException($"Frame layout with ID {id} not found");

            // Require Rive file
            if (string.IsNullOrEmpty(frameLayout.RiveFile))
                throw new InvalidOperationException("Frame layout must have a Rive file to export as package");

            // Locate the Rive file (user files override templates)
            var riveFilePath = GetRiveFilePath(frameLayout.RiveFile, riveUserPath, riveTemplatesPath);
            if (string.IsNullOrEmpty(riveFilePath) || !System.IO.File.Exists(riveFilePath))
                throw new FileNotFoundException($"Rive file '{frameLayout.RiveFile}' not found on disk");

            // Create clean export data - STORE JSON AS RAW STRINGS
            var exportData = new
            {
                type = "frame_layout_package",
                exportDate = DateTime.UtcNow.ToString("O"),
                layoutId = frameLayout.Id,
                displayName = frameLayout.DisplayName,
                description = frameLayout.Description,
                layoutType = frameLayout.LayoutType,
                width = frameLayout.Width,
                height = frameLayout.Height,
                orientation = frameLayout.Orientation,
                backgroundType = frameLayout.BackgroundType,
                backgroundColor = frameLayout.BackgroundColor,
                backgroundOpacity = frameLayout.BackgroundOpacity,
                riveFile = frameLayout.RiveFile,
                thumbnailOverride = frameLayout.ThumbnailOverride, // Include thumbnail override flag

                // Store as raw JSON strings - this is the key fix
                jsonFrameConfigRaw = frameLayout.JsonFrameConfig ?? "{}",
                jsonFrameElementsRaw = frameLayout.JsonFrameElements ?? "[]",

                packageContents = new[] { "config.json", frameLayout.RiveFile }
            };

            // Create ZIP in memory
            using var memoryStream = new MemoryStream();
            using (var archive = new System.IO.Compression.ZipArchive(memoryStream, System.IO.Compression.ZipArchiveMode.Create, true))
            {
                // Add config.json
                var configEntry = archive.CreateEntry("config.json");
                using (var configStream = configEntry.Open())
                {
                    var jsonBytes = JsonSerializer.SerializeToUtf8Bytes(exportData, new JsonSerializerOptions { WriteIndented = true });
                    await configStream.WriteAsync(jsonBytes, 0, jsonBytes.Length);
                }

                // Add Rive file
                var riveEntry = archive.CreateEntry(frameLayout.RiveFile);
                using (var riveStream = riveEntry.Open())
                {
                    var riveBytes = await System.IO.File.ReadAllBytesAsync(riveFilePath);
                    await riveStream.WriteAsync(riveBytes, 0, riveBytes.Length);
                }

                // Add thumbnail if available
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
                        var thumbnailEntry = archive.CreateEntry($"thumbnail.{thumbnailFormat}");
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

        // Helper method to find Rive file (user files override templates)
        private static string? GetRiveFilePath(string riveFileName, string riveUserPath, string riveTemplatesPath)
        {
            // Check user directory first
            var userFile = Path.Combine(riveUserPath, riveFileName);
            if (System.IO.File.Exists(userFile))
                return userFile;

            // Fallback to templates
            var templateFile = Path.Combine(riveTemplatesPath, riveFileName);
            if (System.IO.File.Exists(templateFile))
                return templateFile;

            return null;
        }

        // Helper method to sanitize filename
        private static string SanitizeFilename(string filename)
        {
            var invalid = Path.GetInvalidFileNameChars();
            var sanitized = string.Join("_", filename.Split(invalid, StringSplitOptions.RemoveEmptyEntries));
            return string.IsNullOrWhiteSpace(sanitized) ? "frame_layout" : sanitized;
        }

        public async Task<int> ImportFrameLayoutPackageAsync(byte[] zipData, string contentRootPath, string riveUserPath, string dbPath)
        {
            using var zipStream = new MemoryStream(zipData);
            using var archive = new System.IO.Compression.ZipArchive(zipStream, System.IO.Compression.ZipArchiveMode.Read);

            // Extract config.json
            var configEntry = archive.GetEntry("config.json");
            if (configEntry == null)
                throw new InvalidOperationException("Invalid import package: config.json not found");

            string configJson;
            using (var configStream = configEntry.Open())
            using (var reader = new StreamReader(configStream))
            {
                configJson = await reader.ReadToEndAsync();
            }

            // Parse config
            var importData = JsonSerializer.Deserialize<JsonElement>(configJson);

            if (!importData.TryGetProperty("type", out var typeProperty) ||
                typeProperty.GetString() != "frame_layout_package")
            {
                throw new InvalidOperationException("Invalid import package: not a frame layout package");
            }

            // Extract layout data
            var displayName = importData.GetProperty("displayName").GetString() ?? "Imported Layout";
            var description = importData.GetProperty("description").GetString();
            var layoutType = importData.GetProperty("layoutType").GetString() ?? "COMPOSITE_MODE";
            var width = importData.GetProperty("width").GetInt32();
            var height = importData.GetProperty("height").GetInt32();
            var orientation = importData.GetProperty("orientation").GetString() ?? "landscape";
            var backgroundType = importData.GetProperty("backgroundType").GetString() ?? "rive";
            var backgroundColor = importData.GetProperty("backgroundColor").GetString() ?? "#FFFFFF";
            var backgroundOpacity = importData.GetProperty("backgroundOpacity").GetDouble();
            var riveFile = importData.GetProperty("riveFile").GetString();

            // Extract thumbnail override flag (default to false for imported layouts)
            var thumbnailOverride = false;
            if (importData.TryGetProperty("thumbnailOverride", out var thumbnailOverrideProp))
            {
                thumbnailOverride = thumbnailOverrideProp.GetBoolean();
            }

            // KEY FIX: Extract JSON as raw strings
            var jsonFrameConfig = "{}";
            var jsonFrameElements = "[]";

            if (importData.TryGetProperty("jsonFrameConfigRaw", out var configRaw))
            {
                jsonFrameConfig = configRaw.GetString() ?? "{}";
            }
            else if (importData.TryGetProperty("jsonFrameConfig", out var configOld))
            {
                // Handle old format - re-serialize the object back to string
                jsonFrameConfig = JsonSerializer.Serialize(configOld);
            }

            if (importData.TryGetProperty("jsonFrameElementsRaw", out var elementsRaw))
            {
                jsonFrameElements = elementsRaw.GetString() ?? "[]";
            }
            else if (importData.TryGetProperty("jsonFrameElements", out var elementsOld))
            {
                // Handle old format - re-serialize the object back to string
                jsonFrameElements = JsonSerializer.Serialize(elementsOld);
            }

            // Ensure unique name
            var uniqueName = await EnsureUniqueLayoutName(displayName);

            // Extract and save Rive file
            string? savedRiveFileName = null;
            if (!string.IsNullOrEmpty(riveFile))
            {
                var riveEntry = archive.GetEntry(riveFile);
                if (riveEntry != null)
                {
                    var riveFileName = Path.GetFileNameWithoutExtension(riveFile);
                    var riveExtension = Path.GetExtension(riveFile);
                    savedRiveFileName = GenerateUniqueRiveFilename(riveUserPath, riveFileName, riveExtension);

                    var riveFilePath = Path.Combine(riveUserPath, savedRiveFileName);
                    Directory.CreateDirectory(riveUserPath);

                    using var riveStream = riveEntry.Open();
                    using var riveFileStream = new FileStream(riveFilePath, FileMode.Create);
                    await riveStream.CopyToAsync(riveFileStream);
                }
            }

            // Create new frame layout
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
                BackgroundOpacity = backgroundOpacity,
                RiveFile = savedRiveFileName,
                JsonFrameConfig = jsonFrameConfig,      // Now properly formatted JSON strings
                JsonFrameElements = jsonFrameElements,  // Now properly formatted JSON strings
                IsTemplate = false,
                IsDraft = true,
                IsPublished = false,
                Created = DateTime.UtcNow,
                LastModified = DateTime.UtcNow,
                CreatedBy = "Import",
                Version = "1.0",
                ThumbnailOverride = thumbnailOverride   // Import the thumbnail override setting
            };

            // Save to database
            var layoutId = await CreateFrameLayoutAsync(newFrameLayout);

            // Extract and save thumbnail if present
            var thumbnailEntry = archive.Entries.FirstOrDefault(e =>
                e.Name.StartsWith("thumbnail.") &&
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

                // Update layout with thumbnail info
                newFrameLayout.Id = layoutId;
                newFrameLayout.HasThumbnail = true;
                newFrameLayout.ThumbnailPath = Path.Combine("frameengine", "thumbnails", thumbnailFileName).Replace("\\", "/");
                newFrameLayout.ThumbnailFormat = thumbnailFormat;
                newFrameLayout.ThumbnailGeneratedAt = DateTime.UtcNow;
                // Keep the imported thumbnail override setting

                await UpdateFrameLayoutAsync(newFrameLayout);
            }

            return layoutId;
        }

        // Helper method to ensure unique layout name
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

        // Helper method to generate unique Rive filename
        private static string GenerateUniqueRiveFilename(string directory, string baseName, string extension)
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

        // Helper method to get thumbnails directory
        private static string GetThumbnailsDirectory(string dbPath)
        {
            var dataDir = Path.GetDirectoryName(dbPath)!;
            return Path.Combine(dataDir, "frameengine", "thumbnails");
        }


        // Check if a template thumbnail exists in the application's template directory

        private static bool HasTemplateThumbnail(string templateFileName)
        {
            try
            {
                var appDirectory = AppDomain.CurrentDomain.BaseDirectory;
                var templatePath = Path.Combine(appDirectory, "frameengine", "templates", $"{templateFileName}.png");
                return File.Exists(templatePath);
            }
            catch
            {
                return false;
            }
        }
    }
}