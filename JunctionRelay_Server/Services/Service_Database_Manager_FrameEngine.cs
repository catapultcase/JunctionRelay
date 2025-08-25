/*
 * This file is part of JunctionRelay.
 * (license header unchanged)
 */

using Dapper;
using JunctionRelayServer.Models;
using System.Data;
using System.Text.Json;

namespace JunctionRelayServer.Services
{
    public class Service_Database_Manager_FrameEngine
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_FrameEngine(IDbConnection db)
        {
            _db = db;
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
           Width, Height, Orientation, RiveFile, RiveEmbedInPayload,
           JsonFrameConfig, JsonFrameElements,
           HasThumbnail, ThumbnailPath, ThumbnailGeneratedAt, ThumbnailFormat)
        VALUES 
          (@DisplayName, @Description, @LayoutType,
           @IsTemplate, @IsDraft, @IsPublished, @Created, @LastModified, @CreatedBy, @Version,
           @BackgroundType, @BackgroundColor, @BackgroundImageUrl, @BackgroundImageData, @BackgroundOpacity,
           @Width, @Height, @Orientation, @RiveFile, @RiveEmbedInPayload,
           @JsonFrameConfig, @JsonFrameElements,
           @HasThumbnail, @ThumbnailPath, @ThumbnailGeneratedAt, @ThumbnailFormat);
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
          RiveEmbedInPayload    = @RiveEmbedInPayload,
          JsonFrameConfig       = @JsonFrameConfig,
          JsonFrameElements     = @JsonFrameElements,
          HasThumbnail          = @HasThumbnail,
          ThumbnailPath         = @ThumbnailPath,
          ThumbnailGeneratedAt  = @ThumbnailGeneratedAt,
          ThumbnailFormat       = @ThumbnailFormat
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
                RiveEmbedInPayload = original.RiveEmbedInPayload,
                JsonFrameConfig = original.JsonFrameConfig,
                JsonFrameElements = original.JsonFrameElements
            };

            return await CreateFrameLayoutAsync(clone);
        }

        public async Task<bool> RestoreDefaultTemplatesAsync()
        {
            try
            {
                var defaults = GetDefaultFrameTemplates();
                var anyChanged = false;

                foreach (var template in defaults)
                {
                    var existing = await GetFrameLayoutByNameAsync(template.DisplayName!);
                    if (existing == null)
                    {
                        await CreateFrameLayoutAsync(template);
                        anyChanged = true;
                    }
                    else if (existing.IsTemplate)
                    {
                        // Update the existing template in-place
                        template.Id = existing.Id;
                        template.Created = existing.Created; // preserve creation time
                        await UpdateFrameLayoutAsync(template);
                        anyChanged = true;
                    }
                }

                return anyChanged;
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Error restoring default frame templates: {ex.Message}", ex);
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
                riveEmbedInPayload = frameLayout.RiveEmbedInPayload,

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


        // Add this method to Service_Database_Manager_FrameEngine class

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
            var riveEmbedInPayload = importData.GetProperty("riveEmbedInPayload").GetBoolean();

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
                RiveEmbedInPayload = riveEmbedInPayload,
                JsonFrameConfig = jsonFrameConfig,      // Now properly formatted JSON strings
                JsonFrameElements = jsonFrameElements,  // Now properly formatted JSON strings
                IsTemplate = false,
                IsDraft = true,
                IsPublished = false,
                Created = DateTime.UtcNow,
                LastModified = DateTime.UtcNow,
                CreatedBy = "Import",
                Version = "1.0"
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


        private static List<Model_Frame_Layout> GetDefaultFrameTemplates()
        {
            var now = DateTime.UtcNow;

            return new List<Model_Frame_Layout>
    {
        new Model_Frame_Layout
        {
            DisplayName = "Pre-Rendered Image",
            Description = "Static image background with optional sensor/text overlays",
            LayoutType = "PRE_RENDERED_IMAGE",
            IsTemplate = true,
            IsDraft = false,
            IsPublished = true,
            Created = now,
            LastModified = now,
            CreatedBy = "JunctionRelay",
            Version = "1.0",

            // Background defaults
            BackgroundType = "color",
            BackgroundColor = "#FFFFFF",
            BackgroundOpacity = 1.0,

            // Dimensions/orientation
            Width = 792,
            Height = 272,
            Orientation = "landscape",

            // Rive settings
            RiveEmbedInPayload = false,

            // Thumbnail settings
            HasThumbnail = true,
            ThumbnailPath = "/templates/jr_static.png",
            ThumbnailGeneratedAt = now,
            ThumbnailFormat = "png",

            // Elements
            JsonFrameConfig = @"",
            JsonFrameElements = @""
        },
        new Model_Frame_Layout
        {
            DisplayName = "JR Cyber",
            Description = "Vertical UI for JunctionRelay Jr Demo on Waveshare 400x1280 Display",
            LayoutType = "COMPOSITE_MODE",
            IsTemplate = true,
            IsDraft = false,
            IsPublished = true,
            Created = now,
            LastModified = now,
            CreatedBy = "JunctionRelay",
            Version = "1.0",

            BackgroundType = "rive",
            BackgroundColor = "#FFFFFF",
            BackgroundOpacity = 1.0,

            Width = 400,
            Height = 1280,
            Orientation = "portrait",

            RiveFile = "jr_cyber.riv",
            RiveEmbedInPayload = true,

            // Thumbnail settings
            HasThumbnail = true,
            ThumbnailPath = "/templates/jr_cyber.png",
            ThumbnailGeneratedAt = now,
            ThumbnailFormat = "png",
           
            // Elements (keeping your existing JSON)
            JsonFrameConfig = @"{""type"":""rive_config"",""screenId"":""4"",""frameConfig"":{""version"":""1.0"",""lastConfigUpdate"":""2025-08-21T21:40:42.873Z"",""canvas"":{""width"":400,""height"":1280,""orientation"":""portrait""},""background"":{""type"":""rive"",""color"":""#ff00ae"",""hasImageData"":false,""opacity"":1},""rive"":{""enabled"":true,""file"":""jr_cyber.riv"",""inputs"":{},""settings"":{""fit"":""cover"",""alignment"":""center"",""autoplay"":true,""loop"":true},""discovery"":{""machines"":[{""name"":""Signal"",""inputNames"":[],""inputs"":[]},{""name"":""Bar2"",""inputNames"":[""Sensor2_Value""],""inputs"":[{""name"":""Sensor2_Value"",""type"":""number"",""currentValue"":30,""ref"":{""type"":56,""runtimeInput"":{}}}]},{""name"":""Bar1"",""inputNames"":[""Sensor1_Value""],""inputs"":[{""name"":""Sensor1_Value"",""type"":""number"",""currentValue"":40,""ref"":{""type"":56,""runtimeInput"":{}}}]}],""lastUpdate"":""2025-08-21T21:40:33.595Z"",""metadata"":{""totalInputs"":2,""inputTypeBreakdown"":{""number"":2},""discoveryAttempts"":7,""lastSuccessfulDiscovery"":""2025-08-21T21:40:33.595Z""},""activeStateMachine"":""Signal"",""globalInputMappings"":{}},""embedded"":true}},""frameElements"":[{""id"":""element_1755458946580_nnmkuo8bi"",""type"":""sensor"",""position"":{""x"":146,""y"":230.68,""width"":224.5,""height"":76.89},""display"":{""visible"":true,""zIndex"":1,""order"":0},""properties"":{""placeholderValue"":""66"",""placeholderUnit"":""%"",""fontSize"":52,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""CPU Load"",""sensorTag"":""cpu_load""},""lastModified"":""2025-08-21T21:40:42.873Z""},{""id"":""element_1755462732822_9fa8z0nuz"",""type"":""sensor"",""position"":{""x"":146,""y"":360.14,""width"":641.35,""height"":85.73},""display"":{""visible"":true,""zIndex"":1,""order"":1},""properties"":{""placeholderValue"":""62"",""placeholderUnit"":""%"",""fontSize"":52,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""Memory Load"",""sensorTag"":""mem_load""},""lastModified"":""2025-08-21T21:40:42.873Z""},{""id"":""element_1755459706258_70bus86nf"",""type"":""text"",""position"":{""x"":27,""y"":236.51,""width"":127.8,""height"":73.86},""display"":{""visible"":true,""zIndex"":1,""order"":2},""properties"":{""text"":""CPU:"",""fontSize"":40,""fontWeight"":""900"",""textAlign"":""left"",""color"":""#929e00"",""backgroundColor"":""transparent"",""fontFamily"":""Orbitron""},""lastModified"":""2025-08-21T21:40:42.873Z""},{""id"":""element_1755460606505_nf1cbp2n5"",""type"":""text"",""position"":{""x"":27,""y"":376.88,""width"":143.1,""height"":61.11},""display"":{""visible"":true,""zIndex"":1,""order"":3},""properties"":{""text"":""MEM:"",""fontSize"":40,""fontWeight"":""900"",""textAlign"":""left"",""color"":""#929e00"",""backgroundColor"":""transparent"",""fontFamily"":""Orbitron""},""lastModified"":""2025-08-21T21:40:42.873Z""},{""id"":""element_1755715808821_6j4dgyzcp"",""type"":""sensor"",""position"":{""x"":94.6,""y"":606.37,""width"":302.27,""height"":74.34},""display"":{""visible"":true,""zIndex"":1,""order"":4},""properties"":{""placeholderValue"":""66"",""placeholderUnit"":""%"",""fontSize"":42,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""Cache Read"",""sensorTag"":""cache_read""},""lastModified"":""2025-08-21T21:40:42.873Z""},{""id"":""element_1755715826121_ykjzyte4k"",""type"":""sensor"",""position"":{""x"":96.75,""y"":672.27,""width"":302.27,""height"":74.34},""display"":{""visible"":true,""zIndex"":1,""order"":5},""properties"":{""placeholderValue"":""56"",""placeholderUnit"":""%"",""fontSize"":42,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""Cache Write"",""sensorTag"":""cache_write""},""lastModified"":""2025-08-21T21:40:42.873Z""},{""id"":""element_1755715848043_qifk78vnw"",""type"":""sensor"",""position"":{""x"":91.65,""y"":1138.88,""width"":302.27,""height"":74.34},""display"":{""visible"":true,""zIndex"":1,""order"":6},""properties"":{""placeholderValue"":""66"",""placeholderUnit"":""%"",""fontSize"":42,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""Array Read"",""sensorTag"":""array_read""},""lastModified"":""2025-08-21T21:40:42.873Z""},{""id"":""element_1755715861118_icvue5bep"",""type"":""sensor"",""position"":{""x"":102.73,""y"":1204.78,""width"":302.27,""height"":74.34},""display"":{""visible"":true,""zIndex"":1,""order"":7},""properties"":{""placeholderValue"":""56"",""placeholderUnit"":""%"",""fontSize"":42,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""Array Write"",""sensorTag"":""array_write""},""lastModified"":""2025-08-21T21:40:42.873Z""}]}",
            JsonFrameElements = @"[{""id"":""element_1755458946580_nnmkuo8bi"",""type"":""sensor"",""position"":{""x"":146,""y"":230.68,""width"":224.5,""height"":76.89},""display"":{""visible"":true,""zIndex"":1,""order"":0},""properties"":{""placeholderValue"":""66"",""placeholderUnit"":""%"",""fontSize"":52,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""CPU Load"",""sensorTag"":""cpu_load""},""lastModified"":""2025-08-21T21:40:42.873Z""},{""id"":""element_1755462732822_9fa8z0nuz"",""type"":""sensor"",""position"":{""x"":146,""y"":360.14,""width"":641.35,""height"":85.73},""display"":{""visible"":true,""zIndex"":1,""order"":1},""properties"":{""placeholderValue"":""62"",""placeholderUnit"":""%"",""fontSize"":52,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""Memory Load"",""sensorTag"":""mem_load""},""lastModified"":""2025-08-21T21:40:42.873Z""},{""id"":""element_1755459706258_70bus86nf"",""type"":""text"",""position"":{""x"":27,""y"":236.51,""width"":127.8,""height"":73.86},""display"":{""visible"":true,""zIndex"":1,""order"":2},""properties"":{""text"":""CPU:"",""fontSize"":40,""fontWeight"":""900"",""textAlign"":""left"",""color"":""#929e00"",""backgroundColor"":""transparent"",""fontFamily"":""Orbitron""},""lastModified"":""2025-08-21T21:40:42.873Z""},{""id"":""element_1755460606505_nf1cbp2n5"",""type"":""text"",""position"":{""x"":27,""y"":376.88,""width"":143.1,""height"":61.11},""display"":{""visible"":true,""zIndex"":1,""order"":3},""properties"":{""text"":""MEM:"",""fontSize"":40,""fontWeight"":""900"",""textAlign"":""left"",""color"":""#929e00"",""backgroundColor"":""transparent"",""fontFamily"":""Orbitron""},""lastModified"":""2025-08-21T21:40:42.873Z""},{""id"":""element_1755715808821_6j4dgyzcp"",""type"":""sensor"",""position"":{""x"":94.6,""y"":606.37,""width"":302.27,""height"":74.34},""display"":{""visible"":true,""zIndex"":1,""order"":4},""properties"":{""placeholderValue"":""66"",""placeholderUnit"":""%"",""fontSize"":42,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""Cache Read"",""sensorTag"":""cache_read""},""lastModified"":""2025-08-21T21:40:42.873Z""},{""id"":""element_1755715826121_ykjzyte4k"",""type"":""sensor"",""position"":{""x"":96.75,""y"":672.27,""width"":302.27,""height"":74.34},""display"":{""visible"":true,""zIndex"":1,""order"":5},""properties"":{""placeholderValue"":""56"",""placeholderUnit"":""%"",""fontSize"":42,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""Cache Write"",""sensorTag"":""cache_write""},""lastModified"":""2025-08-21T21:40:42.873Z""},{""id"":""element_1755715848043_qifk78vnw"",""type"":""sensor"",""position"":{""x"":91.65,""y"":1138.88,""width"":302.27,""height"":74.34},""display"":{""visible"":true,""zIndex"":1,""order"":6},""properties"":{""placeholderValue"":""66"",""placeholderUnit"":""%"",""fontSize"":42,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""Array Read"",""sensorTag"":""array_read""},""lastModified"":""2025-08-21T21:40:42.873Z""},{""id"":""element_1755715861118_icvue5bep"",""type"":""sensor"",""position"":{""x"":102.73,""y"":1204.78,""width"":302.27,""height"":74.34},""display"":{""visible"":true,""zIndex"":1,""order"":7},""properties"":{""placeholderValue"":""56"",""placeholderUnit"":""%"",""fontSize"":42,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""Array Write"",""sensorTag"":""array_write""},""lastModified"":""2025-08-21T21:40:42.873Z""}]"
        },
        new Model_Frame_Layout
        {
            DisplayName = "JR Pixels",
            Description = "Horizontal UI",
            LayoutType = "COMPOSITE_MODE",
            IsTemplate = true,
            IsDraft = false,
            IsPublished = true,
            Created = now,
            LastModified = now,
            CreatedBy = "JunctionRelay",
            Version = "1.0",

            BackgroundType = "rive",
            BackgroundColor = "#000000",
            BackgroundOpacity = 1.0,

            Width = 1080,
            Height = 1920,
            Orientation = "horizontal",

            RiveFile = "jr_pixels.riv",
            RiveEmbedInPayload = true,

            // Thumbnail settings
            HasThumbnail = true,
            ThumbnailPath = "/templates/jr_pixels.png",
            ThumbnailGeneratedAt = now,
            ThumbnailFormat = "png",

            JsonFrameConfig = @"{""type"":""rive_config"",""screenId"":""9"",""frameConfig"":{""version"":""1.0"",""lastConfigUpdate"":""2025-08-22T22:57:04.211Z"",""canvas"":{""width"":1920,""height"":1080,""orientation"":""landscape""},""background"":{""type"":""rive"",""color"":""#000000"",""hasImageData"":false,""opacity"":1},""rive"":{""enabled"":true,""file"":""jr_pixels.riv"",""inputs"":{},""settings"":{""fit"":""cover"",""alignment"":""center"",""autoplay"":true,""loop"":true},""discovery"":{""machines"":[{""name"":""State Machine 1"",""inputNames"":[],""inputs"":[]}],""lastUpdate"":""2025-08-22T22:57:03.715Z"",""metadata"":{""totalInputs"":0,""inputTypeBreakdown"":{},""discoveryAttempts"":6,""lastSuccessfulDiscovery"":""2025-08-22T22:57:03.715Z""},""activeStateMachine"":""State Machine 1"",""globalInputMappings"":{}},""embedded"":true}},""frameElements"":[{""id"":""element_1755900154199_h43camr7v"",""type"":""sensor"",""position"":{""x"":592.28,""y"":-6.87,""width"":900.68,""height"":367.61},""display"":{""visible"":true,""zIndex"":0,""order"":0},""properties"":{""sensorName"":""New Sensor"",""placeholderValue"":""40"",""placeholderUnit"":""C"",""fontSize"":120,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#ffffff"",""textAlign"":""left"",""fontFamily"":""Press Start 2P"",""placeholderSensorLabel"":""CPU: "",""sensorTag"":""cpu_temp""},""lastModified"":""2025-08-22T22:57:04.211Z""},{""id"":""element_1755900570540_7wfmrnmgn"",""type"":""sensor"",""position"":{""x"":593.84,""y"":233.27,""width"":900.68,""height"":367.61},""display"":{""visible"":true,""zIndex"":1,""order"":1},""properties"":{""sensorName"":""New Sensor"",""placeholderValue"":""40"",""placeholderUnit"":""C"",""fontSize"":120,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#ffffff"",""textAlign"":""left"",""fontFamily"":""Press Start 2P"",""placeholderSensorLabel"":""GPU: "",""sensorTag"":""gpu_temp""},""lastModified"":""2025-08-22T22:57:04.211Z""},{""id"":""element_1755902392609_pvtzuh8q7"",""type"":""text"",""position"":{""x"":107.39,""y"":2.34,""width"":720.84,""height"":357.59},""display"":{""visible"":true,""zIndex"":2,""order"":2},""properties"":{""text"":""CPU:"",""fontSize"":120,""fontWeight"":""normal"",""textAlign"":""left"",""color"":""#ffffff"",""backgroundColor"":""transparent"",""fontFamily"":""Press Start 2P""},""lastModified"":""2025-08-22T22:57:04.211Z""},{""id"":""element_1755902428753_npkmxjz3u"",""type"":""text"",""position"":{""x"":113.47,""y"":240.31,""width"":720.84,""height"":357.59},""display"":{""visible"":true,""zIndex"":3,""order"":3},""properties"":{""text"":""GPU:"",""fontSize"":120,""fontWeight"":""normal"",""textAlign"":""left"",""color"":""#ffffff"",""backgroundColor"":""transparent"",""fontFamily"":""Press Start 2P""},""lastModified"":""2025-08-22T22:57:04.211Z""}]}",
            JsonFrameElements = @"[{""id"":""element_1755900154199_h43camr7v"",""type"":""sensor"",""position"":{""x"":592.28,""y"":-6.87,""width"":900.68,""height"":367.61},""display"":{""visible"":true,""zIndex"":0,""order"":0},""properties"":{""sensorName"":""New Sensor"",""placeholderValue"":""40"",""placeholderUnit"":""C"",""fontSize"":120,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#ffffff"",""textAlign"":""left"",""fontFamily"":""Press Start 2P"",""placeholderSensorLabel"":""CPU: "",""sensorTag"":""cpu_temp""},""lastModified"":""2025-08-22T22:57:04.211Z""},{""id"":""element_1755900570540_7wfmrnmgn"",""type"":""sensor"",""position"":{""x"":593.84,""y"":233.27,""width"":900.68,""height"":367.61},""display"":{""visible"":true,""zIndex"":1,""order"":1},""properties"":{""sensorName"":""New Sensor"",""placeholderValue"":""40"",""placeholderUnit"":""C"",""fontSize"":120,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#ffffff"",""textAlign"":""left"",""fontFamily"":""Press Start 2P"",""placeholderSensorLabel"":""GPU: "",""sensorTag"":""gpu_temp""},""lastModified"":""2025-08-22T22:57:04.211Z""},{""id"":""element_1755902392609_pvtzuh8q7"",""type"":""text"",""position"":{""x"":107.39,""y"":2.34,""width"":720.84,""height"":357.59},""display"":{""visible"":true,""zIndex"":2,""order"":2},""properties"":{""text"":""CPU:"",""fontSize"":120,""fontWeight"":""normal"",""textAlign"":""left"",""color"":""#ffffff"",""backgroundColor"":""transparent"",""fontFamily"":""Press Start 2P""},""lastModified"":""2025-08-22T22:57:04.211Z""},{""id"":""element_1755902428753_npkmxjz3u"",""type"":""text"",""position"":{""x"":113.47,""y"":240.31,""width"":720.84,""height"":357.59},""display"":{""visible"":true,""zIndex"":3,""order"":3},""properties"":{""text"":""GPU:"",""fontSize"":120,""fontWeight"":""normal"",""textAlign"":""left"",""color"":""#ffffff"",""backgroundColor"":""transparent"",""fontFamily"":""Press Start 2P""},""lastModified"":""2025-08-22T22:57:04.212Z""}]"
        }
    };
        }

        /// Check if a template thumbnail exists in the application's template directory

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