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

        private static List<Model_Frame_Layout> GetDefaultFrameTemplates()
        {
            var now = DateTime.UtcNow;

            return new List<Model_Frame_Layout>
            {
                new Model_Frame_Layout
                {
                    DisplayName = "Pre-Rendered Image (Template)",
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

                    // Rive settings - keep default true for templates
                    RiveEmbedInPayload = false,

                    // Elements
                    JsonFrameConfig = @"",
                    JsonFrameElements = @""
                
                },
                new Model_Frame_Layout
                {
                    DisplayName = "JR Cyber 400x1280",
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

                    RiveFile = "jr_cyber_400x1280.riv",
                    RiveEmbedInPayload = true,
                   
                    // Elements
                    JsonFrameConfig = @"{""type"":""rive_config"",""screenId"":""4"",""frameConfig"":{""version"":""1.0"",""lastConfigUpdate"":""2025-08-21T00:13:55.870Z"",""canvas"":{""width"":400,""height"":1280,""orientation"":""portrait""},""background"":{""type"":""rive"",""color"":""#FFFFFF"",""hasImageData"":false,""opacity"":1},""rive"":{""enabled"":true,""file"":""jr_cyber_400x1280.riv"",""inputs"":{},""settings"":{""fit"":""cover"",""alignment"":""center"",""autoplay"":true,""loop"":true},""discovery"":{""machines"":[{""name"":""Signal"",""inputNames"":[],""inputs"":[]},{""name"":""Bar2"",""inputNames"":[""Sensor2_Value""],""inputs"":[{""name"":""Sensor2_Value"",""type"":""number"",""currentValue"":30,""ref"":{""type"":56,""runtimeInput"":{}}}]},{""name"":""Bar1"",""inputNames"":[""Sensor1_Value""],""inputs"":[{""name"":""Sensor1_Value"",""type"":""number"",""currentValue"":40,""ref"":{""type"":56,""runtimeInput"":{}}}]}],""lastUpdate"":""2025-08-21T00:13:52.529Z"",""metadata"":{""totalInputs"":2,""inputTypeBreakdown"":{""number"":2},""discoveryAttempts"":3,""lastSuccessfulDiscovery"":""2025-08-21T00:13:52.529Z""},""activeStateMachine"":""Signal"",""globalInputMappings"":{}},""embedded"":true}},""frameElements"":[{""id"":""element_1755458946580_nnmkuo8bi"",""type"":""sensor"",""position"":{""x"":146,""y"":230.68,""width"":224.5,""height"":76.89},""display"":{""visible"":true,""zIndex"":1,""order"":0},""properties"":{""placeholderValue"":""66"",""placeholderUnit"":""%"",""fontSize"":52,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""CPU Load"",""sensorTag"":""cpu_load""},""lastModified"":""2025-08-21T00:13:55.870Z""},{""id"":""element_1755462732822_9fa8z0nuz"",""type"":""sensor"",""position"":{""x"":146,""y"":360.14,""width"":641.35,""height"":85.73},""display"":{""visible"":true,""zIndex"":1,""order"":1},""properties"":{""placeholderValue"":""62"",""placeholderUnit"":""%"",""fontSize"":52,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""Memory Load"",""sensorTag"":""mem_load""},""lastModified"":""2025-08-21T00:13:55.870Z""},{""id"":""element_1755459706258_70bus86nf"",""type"":""text"",""position"":{""x"":27,""y"":236.51,""width"":127.8,""height"":73.86},""display"":{""visible"":true,""zIndex"":1,""order"":2},""properties"":{""text"":""CPU:"",""fontSize"":40,""fontWeight"":""900"",""textAlign"":""left"",""color"":""#929e00"",""backgroundColor"":""transparent"",""fontFamily"":""Orbitron""},""lastModified"":""2025-08-21T00:13:55.870Z""},{""id"":""element_1755460606505_nf1cbp2n5"",""type"":""text"",""position"":{""x"":27,""y"":376.88,""width"":143.1,""height"":61.11},""display"":{""visible"":true,""zIndex"":1,""order"":3},""properties"":{""text"":""MEM:"",""fontSize"":40,""fontWeight"":""900"",""textAlign"":""left"",""color"":""#929e00"",""backgroundColor"":""transparent"",""fontFamily"":""Orbitron""},""lastModified"":""2025-08-21T00:13:55.870Z""},{""id"":""element_1755715808821_6j4dgyzcp"",""type"":""sensor"",""position"":{""x"":94.6,""y"":606.37,""width"":302.27,""height"":74.34},""display"":{""visible"":true,""zIndex"":1,""order"":4},""properties"":{""placeholderValue"":""66"",""placeholderUnit"":""%"",""fontSize"":42,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""Cache Read"",""sensorTag"":""cache_read""},""lastModified"":""2025-08-21T00:13:55.870Z""},{""id"":""element_1755715826121_ykjzyte4k"",""type"":""sensor"",""position"":{""x"":96.75,""y"":672.27,""width"":302.27,""height"":74.34},""display"":{""visible"":true,""zIndex"":1,""order"":5},""properties"":{""placeholderValue"":""56"",""placeholderUnit"":""%"",""fontSize"":42,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""Cache Write"",""sensorTag"":""cache_write""},""lastModified"":""2025-08-21T00:13:55.870Z""},{""id"":""element_1755715848043_qifk78vnw"",""type"":""sensor"",""position"":{""x"":91.65,""y"":1138.88,""width"":302.27,""height"":74.34},""display"":{""visible"":true,""zIndex"":1,""order"":6},""properties"":{""placeholderValue"":""66"",""placeholderUnit"":""%"",""fontSize"":42,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""Array Read"",""sensorTag"":""array_read""},""lastModified"":""2025-08-21T00:13:55.870Z""},{""id"":""element_1755715861118_icvue5bep"",""type"":""sensor"",""position"":{""x"":102.73,""y"":1204.78,""width"":302.27,""height"":74.34},""display"":{""visible"":true,""zIndex"":1,""order"":7},""properties"":{""placeholderValue"":""56"",""placeholderUnit"":""%"",""fontSize"":42,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""Array Write"",""sensorTag"":""array_write""},""lastModified"":""2025-08-21T00:13:55.870Z""}]}",
                    JsonFrameElements = @"[{""id"":""element_1755458946580_nnmkuo8bi"",""type"":""sensor"",""position"":{""x"":146,""y"":230.68,""width"":224.5,""height"":76.89},""display"":{""visible"":true,""zIndex"":1,""order"":0},""properties"":{""placeholderValue"":""66"",""placeholderUnit"":""%"",""fontSize"":52,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""CPU Load"",""sensorTag"":""cpu_load""},""lastModified"":""2025-08-21T00:13:55.870Z""},{""id"":""element_1755462732822_9fa8z0nuz"",""type"":""sensor"",""position"":{""x"":146,""y"":360.14,""width"":641.35,""height"":85.73},""display"":{""visible"":true,""zIndex"":1,""order"":1},""properties"":{""placeholderValue"":""62"",""placeholderUnit"":""%"",""fontSize"":52,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""Memory Load"",""sensorTag"":""mem_load""},""lastModified"":""2025-08-21T00:13:55.870Z""},{""id"":""element_1755459706258_70bus86nf"",""type"":""text"",""position"":{""x"":27,""y"":236.51,""width"":127.8,""height"":73.86},""display"":{""visible"":true,""zIndex"":1,""order"":2},""properties"":{""text"":""CPU:"",""fontSize"":40,""fontWeight"":""900"",""textAlign"":""left"",""color"":""#929e00"",""backgroundColor"":""transparent"",""fontFamily"":""Orbitron""},""lastModified"":""2025-08-21T00:13:55.870Z""},{""id"":""element_1755460606505_nf1cbp2n5"",""type"":""text"",""position"":{""x"":27,""y"":376.88,""width"":143.1,""height"":61.11},""display"":{""visible"":true,""zIndex"":1,""order"":3},""properties"":{""text"":""MEM:"",""fontSize"":40,""fontWeight"":""900"",""textAlign"":""left"",""color"":""#929e00"",""backgroundColor"":""transparent"",""fontFamily"":""Orbitron""},""lastModified"":""2025-08-21T00:13:55.870Z""},{""id"":""element_1755715808821_6j4dgyzcp"",""type"":""sensor"",""position"":{""x"":94.6,""y"":606.37,""width"":302.27,""height"":74.34},""display"":{""visible"":true,""zIndex"":1,""order"":4},""properties"":{""placeholderValue"":""66"",""placeholderUnit"":""%"",""fontSize"":42,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""Cache Read"",""sensorTag"":""cache_read""},""lastModified"":""2025-08-21T00:13:55.870Z""},{""id"":""element_1755715826121_ykjzyte4k"",""type"":""sensor"",""position"":{""x"":96.75,""y"":672.27,""width"":302.27,""height"":74.34},""display"":{""visible"":true,""zIndex"":1,""order"":5},""properties"":{""placeholderValue"":""56"",""placeholderUnit"":""%"",""fontSize"":42,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""Cache Write"",""sensorTag"":""cache_write""},""lastModified"":""2025-08-21T00:13:55.870Z""},{""id"":""element_1755715848043_qifk78vnw"",""type"":""sensor"",""position"":{""x"":91.65,""y"":1138.88,""width"":302.27,""height"":74.34},""display"":{""visible"":true,""zIndex"":1,""order"":6},""properties"":{""placeholderValue"":""66"",""placeholderUnit"":""%"",""fontSize"":42,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""Array Read"",""sensorTag"":""array_read""},""lastModified"":""2025-08-21T00:13:55.870Z""},{""id"":""element_1755715861118_icvue5bep"",""type"":""sensor"",""position"":{""x"":102.73,""y"":1204.78,""width"":302.27,""height"":74.34},""display"":{""visible"":true,""zIndex"":1,""order"":7},""properties"":{""placeholderValue"":""56"",""placeholderUnit"":""%"",""fontSize"":42,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""Array Write"",""sensorTag"":""array_write""},""lastModified"":""2025-08-21T00:13:55.870Z""}]"
                                },
                                new Model_Frame_Layout
                {
                    DisplayName = "JR Nost 720x1560",
                    Description = "Horizontal UI on Waveshare 720x1560 Display",
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

                    Width = 1560,
                    Height = 720,
                    Orientation = "horizontal",

                    RiveFile = "jr_nost_720×1560.riv",
                    RiveEmbedInPayload = true,

                    JsonFrameConfig = @"",
                    JsonFrameElements = @""
                }
            };
        }
    }
}