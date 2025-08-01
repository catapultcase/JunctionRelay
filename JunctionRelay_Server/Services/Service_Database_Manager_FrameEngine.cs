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
using System.Data;

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
            var frameLayouts = await _db.QueryAsync<Model_Frame_Layout>(query);
            return frameLayouts;
        }

        public async Task<Model_Frame_Layout?> GetFrameLayoutByIdAsync(int id)
        {
            const string query = "SELECT * FROM FrameLayouts WHERE Id = @Id";
            var frameLayout = await _db.QuerySingleOrDefaultAsync<Model_Frame_Layout>(query, new { Id = id });
            return frameLayout;
        }

        public async Task<Model_Frame_Layout?> GetFrameLayoutByNameAsync(string displayName)
        {
            const string query = "SELECT * FROM FrameLayouts WHERE DisplayName = @DisplayName";
            var frameLayout = await _db.QuerySingleOrDefaultAsync<Model_Frame_Layout>(query, new { DisplayName = displayName });
            return frameLayout;
        }

        public async Task<int> CreateFrameLayoutAsync(Model_Frame_Layout frameLayout)
        {
            const string sql = @"
                INSERT INTO FrameLayouts 
                  (DisplayName, Description, LayoutType, Rows, Columns, 
                   IsTemplate, IsDraft, IsPublished, Created, LastModified, CreatedBy, Version,
                   BackgroundType, BackgroundColor, BackgroundImageUrl, BackgroundImageData, BackgroundOpacity,
                   Width, Height, Orientation,
                   JsonFrameConfig, JsonElementPositions)
                VALUES 
                  (@DisplayName, @Description, @LayoutType, @Rows, @Columns,
                   @IsTemplate, @IsDraft, @IsPublished, @Created, @LastModified, @CreatedBy, @Version,
                   @BackgroundType, @BackgroundColor, @BackgroundImageUrl, @BackgroundImageData, @BackgroundOpacity,
                   @Width, @Height, @Orientation,
                   @JsonFrameConfig, @JsonElementPositions);
                SELECT last_insert_rowid();
            ";

            // Set Created date if not already set
            if (frameLayout.Created == default)
            {
                frameLayout.Created = DateTime.UtcNow;
            }

            var frameLayoutId = await _db.ExecuteScalarAsync<int>(sql, frameLayout);
            return frameLayoutId;
        }

        public async Task<bool> UpdateFrameLayoutAsync(Model_Frame_Layout frameLayout)
        {
            // Ensure the frame layout exists
            const string checkQuery = "SELECT COUNT(1) FROM FrameLayouts WHERE Id = @Id";
            var existingFrameLayoutCount = await _db.ExecuteScalarAsync<int>(checkQuery, new { Id = frameLayout.Id });

            if (existingFrameLayoutCount == 0)
            {
                throw new Exception($"Frame layout with ID {frameLayout.Id} not found.");
            }

            // Update the LastModified timestamp
            frameLayout.LastModified = DateTime.UtcNow;

            // Update the frame layout
            const string sql = @"
                UPDATE FrameLayouts
                SET 
                  DisplayName           = @DisplayName,
                  Description           = @Description,
                  LayoutType            = @LayoutType,
                  Rows                  = @Rows,
                  Columns               = @Columns,
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
                  JsonFrameConfig       = @JsonFrameConfig,
                  JsonElementPositions  = @JsonElementPositions
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

        public async Task<int> CloneFrameLayoutAsync(int originalId)
        {
            // 1. Get the original frame layout
            var original = await GetFrameLayoutByIdAsync(originalId);
            if (original == null)
            {
                throw new Exception($"Frame layout with ID {originalId} not found.");
            }

            // 2. Create a new frame layout with the same properties but a modified name
            var clone = new Model_Frame_Layout
            {
                DisplayName = $"{original.DisplayName} (Copy)",
                Description = original.Description,
                LayoutType = original.LayoutType,
                Rows = original.Rows,
                Columns = original.Columns,
                IsTemplate = false, // Clones are never templates
                IsDraft = true,
                IsPublished = false,
                CreatedBy = original.CreatedBy,
                Version = original.Version,
                BackgroundType = original.BackgroundType,
                BackgroundColor = original.BackgroundColor,
                BackgroundImageUrl = original.BackgroundImageUrl,
                BackgroundImageData = original.BackgroundImageData,
                BackgroundOpacity = original.BackgroundOpacity,
                Width = original.Width,
                Height = original.Height,
                Orientation = original.Orientation,
                JsonFrameConfig = original.JsonFrameConfig,
                JsonElementPositions = original.JsonElementPositions
            };

            // 3. Add the cloned frame layout to the database
            return await CreateFrameLayoutAsync(clone);
        }

        public async Task<bool> RestoreDefaultTemplatesAsync()
        {
            try
            {
                var defaultTemplates = GetDefaultFrameTemplates();
                int templatesCreated = 0;

                foreach (var template in defaultTemplates)
                {
                    // Check if template already exists
                    var existing = await GetFrameLayoutByNameAsync(template.DisplayName);
                    if (existing == null)
                    {
                        await CreateFrameLayoutAsync(template);
                        templatesCreated++;
                    }
                    else if (existing.IsTemplate)
                    {
                        // Update existing template
                        template.Id = existing.Id;
                        template.Created = existing.Created; // Preserve original creation date
                        await UpdateFrameLayoutAsync(template);
                        templatesCreated++;
                    }
                }

                return templatesCreated > 0;
            }
            catch (Exception ex)
            {
                throw new Exception($"Error restoring default frame templates: {ex.Message}", ex);
            }
        }

        public async Task<IEnumerable<Model_Frame_Layout>> GetFrameLayoutsByTypeAsync(string layoutType)
        {
            const string query = "SELECT * FROM FrameLayouts WHERE LayoutType = @LayoutType ORDER BY Created DESC";
            var frameLayouts = await _db.QueryAsync<Model_Frame_Layout>(query, new { LayoutType = layoutType });
            return frameLayouts;
        }

        public async Task<IEnumerable<Model_Frame_Layout>> GetTemplateFrameLayoutsAsync()
        {
            const string query = "SELECT * FROM FrameLayouts WHERE IsTemplate = 1 ORDER BY DisplayName";
            var templates = await _db.QueryAsync<Model_Frame_Layout>(query);
            return templates;
        }

        public async Task<IEnumerable<Model_Frame_Layout>> GetPublishedFrameLayoutsAsync()
        {
            const string query = "SELECT * FROM FrameLayouts WHERE IsPublished = 1 ORDER BY DisplayName";
            var published = await _db.QueryAsync<Model_Frame_Layout>(query);
            return published;
        }

        private static List<Model_Frame_Layout> GetDefaultFrameTemplates()
        {
            return new List<Model_Frame_Layout>
            {
                new Model_Frame_Layout
                {
                    DisplayName = "Basic Sensor Grid Frame",
                    Description = "Simple grid layout for sensor data display with backend rendering",
                    LayoutType = "FRAME_SENSOR_GRID",
                    Rows = 2,
                    Columns = 2,
                    IsTemplate = true,
                    IsDraft = false,
                    IsPublished = true,
                    Created = DateTime.UtcNow,
                    CreatedBy = "System",
                    Version = "1.0",
                    BackgroundType = "color",
                    BackgroundColor = "#FFFFFF",
                    Width = 792,
                    Height = 272,
                    Orientation = "landscape",
                    JsonFrameConfig = @"{
                        ""title"": {
                            ""text"": ""Sensor Grid"",
                            ""fontSize"": 24,
                            ""color"": ""#000000"",
                            ""position"": { ""x"": 20, ""y"": 20 }
                        },
                        ""grid"": {
                            ""rows"": 2,
                            ""columns"": 2,
                            ""padding"": 10,
                            ""cellSpacing"": 5
                        }
                    }",
                    JsonElementPositions = @"[]"
                },

                new Model_Frame_Layout
                {
                    DisplayName = "TV Guide Calendar Frame",
                    Description = "Calendar layout for episode and schedule displays with time zone support",
                    LayoutType = "FRAME_CALENDAR",
                    Rows = 1,
                    Columns = 3,
                    IsTemplate = true,
                    IsDraft = false,
                    IsPublished = true,
                    Created = DateTime.UtcNow,
                    CreatedBy = "System",
                    Version = "1.0",
                    BackgroundType = "color",
                    BackgroundColor = "#F8F9FA",
                    Width = 792,
                    Height = 272,
                    Orientation = "landscape",
                    JsonFrameConfig = @"{
                        ""title"": {
                            ""text"": ""TV Guide"",
                            ""fontSize"": 28,
                            ""color"": ""#000000"",
                            ""position"": { ""x"": 20, ""y"": 15 }
                        },
                        ""calendar"": {
                            ""columns"": 3,
                            ""dayHeaders"": [""Yesterday"", ""Today"", ""Tomorrow""],
                            ""timeFormat"": ""HH:mm"",
                            ""showAirTimes"": true
                        }
                    }",
                    JsonElementPositions = @"[]"
                },

                new Model_Frame_Layout
                {
                    DisplayName = "Dashboard Frame",
                    Description = "Multi-widget dashboard layout for comprehensive displays",
                    LayoutType = "FRAME_DASHBOARD",
                    Rows = 3,
                    Columns = 3,
                    IsTemplate = true,
                    IsDraft = false,
                    IsPublished = true,
                    Created = DateTime.UtcNow,
                    CreatedBy = "System",
                    Version = "1.0",
                    BackgroundType = "color",
                    BackgroundColor = "#F5F5F5",
                    Width = 792,
                    Height = 272,
                    Orientation = "landscape",
                    JsonFrameConfig = @"{
                        ""title"": {
                            ""text"": ""System Dashboard"",
                            ""fontSize"": 22,
                            ""color"": ""#000000"",
                            ""position"": { ""x"": 20, ""y"": 10 }
                        },
                        ""widgets"": {
                            ""enableShadows"": true,
                            ""cornerRadius"": 8,
                            ""padding"": 12
                        }
                    }",
                    JsonElementPositions = @"[]"
                },

                new Model_Frame_Layout
                {
                    DisplayName = "Chart Frame",
                    Description = "Data visualization and chart display frame with SkiaSharp rendering",
                    LayoutType = "FRAME_CHART",
                    Rows = 1,
                    Columns = 1,
                    IsTemplate = true,
                    IsDraft = false,
                    IsPublished = true,
                    Created = DateTime.UtcNow,
                    CreatedBy = "System",
                    Version = "1.0",
                    BackgroundType = "color",
                    BackgroundColor = "#FFFFFF",
                    Width = 792,
                    Height = 272,
                    Orientation = "landscape",
                    JsonFrameConfig = @"{
                        ""chart"": {
                            ""type"": ""line"",
                            ""title"": ""Sensor Data Over Time"",
                            ""showLegend"": true,
                            ""showGrid"": true,
                            ""colors"": [""#1976d2"", ""#388e3c"", ""#f57c00""]
                        }
                    }",
                    JsonElementPositions = @"[]"
                },

                new Model_Frame_Layout
                {
                    DisplayName = "Quad Frame",
                    Description = "Four-panel display arrangement with equal quadrants",
                    LayoutType = "FRAME_QUAD",
                    Rows = 2,
                    Columns = 2,
                    IsTemplate = true,
                    IsDraft = false,
                    IsPublished = true,
                    Created = DateTime.UtcNow,
                    CreatedBy = "System",
                    Version = "1.0",
                    BackgroundType = "color",
                    BackgroundColor = "#FAFAFA",
                    Width = 792,
                    Height = 272,
                    Orientation = "landscape",
                    JsonFrameConfig = @"{
                        ""quad"": {
                            ""dividerWidth"": 2,
                            ""dividerColor"": ""#CCCCCC"",
                            ""quadrantPadding"": 10
                        }
                    }",
                    JsonElementPositions = @"[]"
                },

                new Model_Frame_Layout
                {
                    DisplayName = "Image Frame",
                    Description = "Background image with data overlays for branded displays",
                    LayoutType = "FRAME_IMAGE",
                    Rows = 1,
                    Columns = 1,
                    IsTemplate = true,
                    IsDraft = false,
                    IsPublished = true,
                    Created = DateTime.UtcNow,
                    CreatedBy = "System",
                    Version = "1.0",
                    BackgroundType = "image",
                    BackgroundColor = "#000000",
                    Width = 792,
                    Height = 272,
                    Orientation = "landscape",
                    JsonFrameConfig = @"{
                        ""overlay"": {
                            ""opacity"": 0.8,
                            ""textShadow"": true,
                            ""shadowColor"": ""#000000""
                        }
                    }",
                    JsonElementPositions = @"[]"
                }
            };
        }
    }
}