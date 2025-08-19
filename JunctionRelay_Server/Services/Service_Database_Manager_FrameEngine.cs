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
                   JsonFrameConfig, JsonFrameElements)
                VALUES 
                  (@DisplayName, @Description, @LayoutType,
                   @IsTemplate, @IsDraft, @IsPublished, @Created, @LastModified, @CreatedBy, @Version,
                   @BackgroundType, @BackgroundColor, @BackgroundImageUrl, @BackgroundImageData, @BackgroundOpacity,
                   @Width, @Height, @Orientation, @RiveFile, @RiveEmbedInPayload,
                   @JsonFrameConfig, @JsonFrameElements);
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
                  JsonFrameElements     = @JsonFrameElements
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

                    // Minimal JSON placeholders
                    JsonFrameConfig = @"{""version"":""1.0"",""lastConfigUpdate"":""2025-08-18T02:05:52.236Z"",""canvas"":{""width"":792,""height"":272,""orientation"":""landscape"",""layoutType"":""PRE_RENDERED_IMAGE"",""grid"":{""enabled"":false,""rows"":null,""columns"":null,""snapToGrid"":false,""gridSize"":20}},""background"":{""type"":""color"",""color"":""#FFFFFF"",""imageUrl"":null,""hasImageData"":false,""opacity"":1,""imageSettings"":null},""rive"":{""enabled"":false,""file"":null,""inputs"":{},""settings"":null},""rendering"":{""quality"":""high"",""antialiasing"":true,""pixelRatio"":1,""colorProfile"":""sRGB""},""metadata"":{""name"":""Pre-Rendered Image (Template)"",""description"":""Static image background with optional sensor/text overlays"",""isTemplate"":true,""isDraft"":false,""isPublished"":true,""tags"":[],""category"":""custom""},""elements"":{""count"":2,""types"":[""sensor"",""text""],""hasSensors"":true,""hasInteractive"":false,""bounds"":{""minX"":160.05906040268457,""minY"":91.82890625,""maxX"":526.5538461538462,""maxY"":168.04315095427853}},""export"":{""formats"":[""png"",""json"",""pdf""],""defaultFormat"":""png"",""pngSettings"":{""dpi"":150,""transparent"":false,""compression"":""medium""},""pdfSettings"":{""orientation"":""landscape"",""margins"":{""top"":0,""right"":0,""bottom"":0,""left"":0},""printOptimized"":true}},""extensions"":{""animations"":{""enabled"":false,""transitions"":[]},""interactivity"":{""enabled"":false,""hotspots"":[]},""dataBinding"":{""enabled"":true,""refreshRate"":5000,""dataSources"":[]}}}",
                    JsonFrameElements = @"[{""id"":""element_1755477112937_v3oskjykx"",""type"":""sensor"",""position"":{""x"":160.05906040268457,""y"":108.04315095427853,""width"":120,""height"":60},""display"":{""visible"":true,""zIndex"":0,""order"":0},""properties"":{""sensorName"":""New Sensor"",""placeholderValue"":""40"",""placeholderUnit"":""C"",""fontSize"":12,""showUnit"":true,""showLabel"":true,""backgroundColor"":""#e3f2fd"",""textColor"":""#000000"",""textAlign"":""left"",""sensorTag"":""CPU_Temp"",""placeholderSensorLabel"":""CPU""},""lastModified"":""2025-08-18T00:32:02.320Z""}]"
                },
                new Model_Frame_Layout
                {
                    DisplayName = "JR Cyber 400x1280",
                    Description = "Vertical UI for JunctionRelay Jr Demo on Waveshare 400x1280 Display",
                    LayoutType = "RIVE_MAPPING",
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

                    JsonFrameConfig = @"{""type"":""rive_config"",""screenId"":""5"",""frameConfig"":{""version"":""1.0"",""lastConfigUpdate"":""2025-08-18T14:52:05.352Z"",""canvas"":{""width"":400,""height"":1280,""orientation"":""portrait""},""background"":{""type"":""rive"",""color"":""#FFFFFF"",""hasImageData"":false,""opacity"":1},""rive"":{""enabled"":true,""file"":""jr_cyber_400x1280.riv"",""inputs"":{},""settings"":{""fit"":""cover"",""alignment"":""center"",""autoplay"":true,""loop"":true}}},""frameElements"":[{""id"":""element_1755458946580_nnmkuo8bi"",""type"":""sensor"",""position"":{""x"":146,""y"":230.68,""width"":224.5,""height"":76.89},""display"":{""visible"":true,""zIndex"":1,""order"":0},""properties"":{""placeholderValue"":""66"",""placeholderUnit"":""%"",""fontSize"":52,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""CPU Load"",""sensorTag"":""cpu_load""},""lastModified"":""2025-08-18T14:52:05.352Z""},{""id"":""element_1755462732822_9fa8z0nuz"",""type"":""sensor"",""position"":{""x"":146,""y"":360.14,""width"":641.35,""height"":85.73},""display"":{""visible"":true,""zIndex"":1,""order"":1},""properties"":{""placeholderValue"":""62"",""placeholderUnit"":""%"",""fontSize"":52,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""Memory Load"",""sensorTag"":""mem_load""},""lastModified"":""2025-08-18T14:52:05.352Z""},{""id"":""element_1755459706258_70bus86nf"",""type"":""text"",""position"":{""x"":27,""y"":236.51,""width"":127.8,""height"":73.86},""display"":{""visible"":true,""zIndex"":1,""order"":2},""properties"":{""text"":""CPU:"",""fontSize"":40,""fontWeight"":""900"",""textAlign"":""left"",""color"":""#929e00"",""backgroundColor"":""transparent"",""fontFamily"":""Orbitron""},""lastModified"":""2025-08-18T14:52:05.352Z""},{""id"":""element_1755460606505_nf1cbp2n5"",""type"":""text"",""position"":{""x"":27,""y"":376.88,""width"":143.1,""height"":61.11},""display"":{""visible"":true,""zIndex"":1,""order"":3},""properties"":{""text"":""MEM:"",""fontSize"":40,""fontWeight"":""900"",""textAlign"":""left"",""color"":""#929e00"",""backgroundColor"":""transparent"",""fontFamily"":""Orbitron""},""lastModified"":""2025-08-18T14:52:05.352Z""}]}",
                    JsonFrameElements = @"[{""id"":""element_1755458946580_nnmkuo8bi"",""type"":""sensor"",""position"":{""x"":146,""y"":230.68,""width"":224.5,""height"":76.89},""display"":{""visible"":true,""zIndex"":1,""order"":0},""properties"":{""placeholderValue"":""66"",""placeholderUnit"":""%"",""fontSize"":52,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""CPU Load"",""sensorTag"":""cpu_load""},""lastModified"":""2025-08-18T00:01:26.235Z""},{""id"":""element_1755462732822_9fa8z0nuz"",""type"":""sensor"",""position"":{""x"":146,""y"":360.14,""width"":641.35,""height"":85.73},""display"":{""visible"":true,""zIndex"":1,""order"":1},""properties"":{""placeholderValue"":""62"",""placeholderUnit"":""%"",""fontSize"":52,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""Memory Load"",""sensorTag"":""mem_load""},""lastModified"":""2025-08-18T00:01:26.235Z""},{""id"":""element_1755459706258_70bus86nf"",""type"":""text"",""position"":{""x"":27,""y"":236.51,""width"":127.8,""height"":73.86},""display"":{""visible"":true,""zIndex"":1,""order"":2},""properties"":{""text"":""CPU:"",""fontSize"":40,""fontWeight"":""900"",""textAlign"":""left"",""color"":""#929e00"",""backgroundColor"":""transparent"",""fontFamily"":""Orbitron""},""lastModified"":""2025-08-18T00:01:26.235Z""},{""id"":""element_1755460606505_nf1cbp2n5"",""type"":""text"",""position"":{""x"":27,""y"":376.88,""width"":143.1,""height"":61.11},""display"":{""visible"":true,""zIndex"":1,""order"":3},""properties"":{""text"":""MEM:"",""fontSize"":40,""fontWeight"":""900"",""textAlign"":""left"",""color"":""#929e00"",""backgroundColor"":""transparent"",""fontFamily"":""Orbitron""},""lastModified"":""2025-08-18T00:01:26.235Z""}]"
                },
                                new Model_Frame_Layout
                {
                    DisplayName = "JR Nost 720x1560",
                    Description = "Horizontal UI on Waveshare 720x1560 Display",
                    LayoutType = "RIVE_MAPPING",
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

                    JsonFrameConfig = @"{""type"":""rive_config"",""screenId"":""5"",""frameConfig"":{""version"":""1.0"",""lastConfigUpdate"":""2025-08-18T14:52:05.352Z"",""canvas"":{""width"":400,""height"":1280,""orientation"":""portrait""},""background"":{""type"":""rive"",""color"":""#FFFFFF"",""hasImageData"":false,""opacity"":1},""rive"":{""enabled"":true,""file"":""jr_nost_720×1560.riv"",""inputs"":{},""settings"":{""fit"":""cover"",""alignment"":""center"",""autoplay"":true,""loop"":true}}},""frameElements"":[{""id"":""element_1755458946580_nnmkuo8bi"",""type"":""sensor"",""position"":{""x"":146,""y"":230.68,""width"":224.5,""height"":76.89},""display"":{""visible"":true,""zIndex"":1,""order"":0},""properties"":{""placeholderValue"":""66"",""placeholderUnit"":""%"",""fontSize"":52,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""CPU Load"",""sensorTag"":""cpu_load""},""lastModified"":""2025-08-18T14:52:05.352Z""},{""id"":""element_1755462732822_9fa8z0nuz"",""type"":""sensor"",""position"":{""x"":146,""y"":360.14,""width"":641.35,""height"":85.73},""display"":{""visible"":true,""zIndex"":1,""order"":1},""properties"":{""placeholderValue"":""62"",""placeholderUnit"":""%"",""fontSize"":52,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""Memory Load"",""sensorTag"":""mem_load""},""lastModified"":""2025-08-18T14:52:05.352Z""},{""id"":""element_1755459706258_70bus86nf"",""type"":""text"",""position"":{""x"":27,""y"":236.51,""width"":127.8,""height"":73.86},""display"":{""visible"":true,""zIndex"":1,""order"":2},""properties"":{""text"":""CPU:"",""fontSize"":40,""fontWeight"":""900"",""textAlign"":""left"",""color"":""#929e00"",""backgroundColor"":""transparent"",""fontFamily"":""Orbitron""},""lastModified"":""2025-08-18T14:52:05.352Z""},{""id"":""element_1755460606505_nf1cbp2n5"",""type"":""text"",""position"":{""x"":27,""y"":376.88,""width"":143.1,""height"":61.11},""display"":{""visible"":true,""zIndex"":1,""order"":3},""properties"":{""text"":""MEM:"",""fontSize"":40,""fontWeight"":""900"",""textAlign"":""left"",""color"":""#929e00"",""backgroundColor"":""transparent"",""fontFamily"":""Orbitron""},""lastModified"":""2025-08-18T14:52:05.352Z""}]}",
                    JsonFrameElements = @"[{""id"":""element_1755458946580_nnmkuo8bi"",""type"":""sensor"",""position"":{""x"":146,""y"":230.68,""width"":224.5,""height"":76.89},""display"":{""visible"":true,""zIndex"":1,""order"":0},""properties"":{""placeholderValue"":""66"",""placeholderUnit"":""%"",""fontSize"":52,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""CPU Load"",""sensorTag"":""cpu_load""},""lastModified"":""2025-08-18T00:01:26.235Z""},{""id"":""element_1755462732822_9fa8z0nuz"",""type"":""sensor"",""position"":{""x"":146,""y"":360.14,""width"":641.35,""height"":85.73},""display"":{""visible"":true,""zIndex"":1,""order"":1},""properties"":{""placeholderValue"":""62"",""placeholderUnit"":""%"",""fontSize"":52,""showUnit"":true,""showLabel"":false,""backgroundColor"":""transparent"",""textColor"":""#929e00"",""textAlign"":""left"",""fontFamily"":""Orbitron"",""fontWeight"":""900"",""placeholderSensorLabel"":""Memory Load"",""sensorTag"":""mem_load""},""lastModified"":""2025-08-18T00:01:26.235Z""},{""id"":""element_1755459706258_70bus86nf"",""type"":""text"",""position"":{""x"":27,""y"":236.51,""width"":127.8,""height"":73.86},""display"":{""visible"":true,""zIndex"":1,""order"":2},""properties"":{""text"":""CPU:"",""fontSize"":40,""fontWeight"":""900"",""textAlign"":""left"",""color"":""#929e00"",""backgroundColor"":""transparent"",""fontFamily"":""Orbitron""},""lastModified"":""2025-08-18T00:01:26.235Z""},{""id"":""element_1755460606505_nf1cbp2n5"",""type"":""text"",""position"":{""x"":27,""y"":376.88,""width"":143.1,""height"":61.11},""display"":{""visible"":true,""zIndex"":1,""order"":3},""properties"":{""text"":""MEM:"",""fontSize"":40,""fontWeight"":""900"",""textAlign"":""left"",""color"":""#929e00"",""backgroundColor"":""transparent"",""fontFamily"":""Orbitron""},""lastModified"":""2025-08-18T00:01:26.235Z""}]"
                }
            };
        }
    }
}