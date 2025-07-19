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

namespace JunctionRelayServer.Services
{
    public class Service_Layout_Templates
    {
        private readonly Service_Database_Manager_Layouts _dbManager;

        public Service_Layout_Templates(Service_Database_Manager_Layouts dbManager)
        {
            _dbManager = dbManager;
        }

        /// <summary>
        /// Seed or restore all built-in templates
        /// </summary>
        public async Task InitializeLayoutTemplatesAsync()
        {
            Console.WriteLine("Initializing built-in layout templates...");

            var templateNames = new[]
            {
        "Template: 2x2 Grid",
        "Template: 2x4 Grid",
        "Template: Vintage Radio",
        "Template: Chart Plotter",
        "Template: Astro",
        "Template: Matrix Display",
        "Template: NeoPixel Color Cycle",
        "Template: QUAD Static Display",
        "Template (Offset): 2x2 Grid",
        "Template (Offset): 2x4 Grid",
        "Template (Offset): Vintage Radio",
        "Template (Offset): Chart Plotter",
        "Template (Offset): Astro",
    };

            var existingTemplates = await _dbManager.GetAllTemplatesAsync();

            foreach (var name in templateNames)
            {
                var existing = existingTemplates.FirstOrDefault(t => t.DisplayName == name);

                if (existing == null || existing.IsTemplate)
                {
                    await CreateOrRestoreTemplateAsync(name);
                }
                else
                {
                    Console.WriteLine($"⚠️ Skipping '{name}' — exists but not marked as a template.");
                }
            }

            Console.WriteLine("✅ Successfully initialized built-in layout templates");
        }


        /// <summary>
        /// Create a new template or PUT it back to its defaults
        /// </summary>
        public async Task<bool> CreateOrRestoreTemplateAsync(string templateName)
        {
            // Console.WriteLine($"Restoring defaults for '{templateName}'");
            var existing = (await _dbManager.GetAllTemplatesAsync())
                           .FirstOrDefault(t => t.DisplayName == templateName);

            // Build the default Model_Screen_Layout for this name:
            Model_Screen_Layout? template = templateName switch  // Make template nullable
            {
                "Template: 2x2 Grid" => BuildGridTemplate(templateName, 2, 2),
                "Template: 2x4 Grid" => BuildGridTemplate(templateName, 2, 4),
                "Template: Vintage Radio" => BuildRadioTemplate(templateName),
                "Template: Chart Plotter" => BuildPlotterTemplate(templateName),
                "Template: Astro" => BuildAstroTemplate(templateName),
                "Template: Matrix Display" => BuildMatrixTemplate(templateName),
                "Template: NeoPixel Color Cycle" => BuildNeoPixelTemplate(templateName),
                "Template: QUAD Static Display" => BuildQuadTemplate(templateName),
                "Template (Offset): 2x2 Grid" => BuildGridOffsetTemplate(templateName, 2, 2),
                "Template (Offset): 2x4 Grid" => BuildGridOffsetTemplate(templateName, 2, 4),
                "Template (Offset): Vintage Radio" => BuildRadioOffsetTemplate(templateName),
                "Template (Offset): Chart Plotter" => BuildPlotterOffsetTemplate(templateName),
                "Template (Offset): Astro" => BuildAstroOffsetTemplate(templateName),
                _ => null
            };

            if (template == null)
            {
                Console.WriteLine($"❌ No default defined for '{templateName}'.");
                return false;
            }

            template.LastModified = DateTime.UtcNow;

            if (existing != null)
            {
                template.Id = existing.Id;
                var updated = await _dbManager.UpdateTemplateAsync(existing.Id, template);
                Console.WriteLine(updated
                    ? $"✅ Updated '{templateName}' (ID {existing.Id})."
                    : $"❌ Failed to update '{templateName}' (ID {existing.Id}).");
                return updated;
            }
            else
            {
                var newId = await _dbManager.AddTemplateAsync(template);
                var created = newId > 0;
                Console.WriteLine(created
                    ? $"✅ Created '{templateName}' (new ID {newId})."
                    : $"❌ Failed to create '{templateName}'.");
                return created;
            }
        }

        // ──────────────────────────────────────────────────────────────
        // Factory methods for each built-in template
        // ──────────────────────────────────────────────────────────────

        private Model_Screen_Layout BuildGridTemplate(string name, int rows, int cols)
        {
            int sensorCount = rows * cols;
            return new Model_Screen_Layout
            {
                DisplayName = name,
                IsTemplate = true,
                Description = $"Will plot {sensorCount} sensors in a grid",
                LayoutType = "LVGL_GRID",
                Rows = rows,
                Columns = cols,
                IsPublished = true,
                Created = DateTime.UtcNow,
                Version = "1.0",
                TopMargin = 10,
                BottomMargin = 10,
                LeftMargin = 10,
                RightMargin = 10,
                OuterPadding = 10,
                InnerPadding = 20,
                TextColor = "#FFFF00",
                BackgroundColor = "#000000",
                BorderColor = "#FF0000",
                BorderVisible = true,
                BorderThickness = 2,
                RoundedCorners = true,
                BorderRadiusSize = 15,
                PreviewWidth = 800,
                PreviewHeight = 480,
                PreviewSensors = sensorCount
            };
        }

        private Model_Screen_Layout BuildGridOffsetTemplate(string name, int rows, int cols)
        {
            var tpl = BuildGridTemplate(name, rows, cols);
            tpl.Description = $"Will plot {rows * cols} sensors in a grid, with offsets";
            tpl.TopMargin = 80;
            tpl.BottomMargin = 35;
            tpl.LeftMargin = 25;
            tpl.RightMargin = 35;
            return tpl;
        }

        private Model_Screen_Layout BuildRadioTemplate(string name)
        {
            return new Model_Screen_Layout
            {
                DisplayName = name,
                IsTemplate = true,
                Description = "Send 4 sensors as radio selections (bars & digital inserts)",
                LayoutType = "LVGL_RADIO",
                TopMargin = 10,
                BottomMargin = 10,
                LeftMargin = 10,
                RightMargin = 10,
                TextColor = "#FFFF00",
                BackgroundColor = "#000000",
                ShowUnits = true,
                PreviewWidth = 800,
                PreviewHeight = 480,
                PreviewSensors = 4
            };
        }

        private Model_Screen_Layout BuildRadioOffsetTemplate(string name)
        {
            var tpl = BuildRadioTemplate(name);
            tpl.TopMargin = 80;
            tpl.BottomMargin = 40;
            tpl.LeftMargin = 30;
            tpl.RightMargin = 45;
            return tpl;
        }

        private Model_Screen_Layout BuildPlotterTemplate(string name)
        {
            var template = new Model_Screen_Layout
            {
                DisplayName = name,
                IsTemplate = true,
                Description = "Will plot 1 to 4 sensors on charts with continuous scrolling",
                LayoutType = "LVGL_PLOTTER",
                Rows = 1,
                Columns = 1,
                TopMargin = 10,
                BottomMargin = 10,
                LeftMargin = 10,
                RightMargin = 10,
                OuterPadding = 5,
                InnerPadding = 5,
                TextColor = "#FFFF00",
                BackgroundColor = "#000000",
                BorderColor = "#FF0000",
                BorderVisible = true,
                BorderThickness = 2,
                RoundedCorners = true,
                BorderRadiusSize = 20,
                ChartScrollSpeed = 100,
                ChartOutlineVisible = true,
                ShowLegend = true,
                PositionLegendInside = true,
                ShowXAxisLabels = false,
                ShowYAxisLabels = false,
                GridDensity = 10,
                HistoryPointsToShow = 100,
                ShowUnits = false,
                PreviewWidth = 800,
                PreviewHeight = 480,
                PreviewSensors = 1
            };

            return template;
        }

        private Model_Screen_Layout BuildPlotterOffsetTemplate(string name)
        {
            var tpl = BuildPlotterTemplate(name);
            tpl.TopMargin = 65;
            tpl.BottomMargin = 35;
            tpl.LeftMargin = 30;
            tpl.RightMargin = 40;

            // The JsonLayoutConfig is already set in the base template
            return tpl;
        }

        private Model_Screen_Layout BuildAstroTemplate(string name)
        {
            var template = new Model_Screen_Layout
            {
                DisplayName = name,
                IsTemplate = true,
                Description = "Sci-Fi Cassette Futurism Display with animated starfield",
                LayoutType = "LVGL_ASTRO",
                TopMargin = 10,
                BottomMargin = 10,
                LeftMargin = 10,
                RightMargin = 10,
                OuterPadding = 10,
                InnerPadding = 10,
                TextColor = "#FFCB6B",
                BackgroundColor = "#001C1C",
                BorderColor = "#FFCB6B",
                BorderVisible = true,
                BorderThickness = 2,
                RoundedCorners = false,
                BorderRadiusSize = 0,
                GridDensity = 12,
                ChartOutlineVisible = true,
                ShowLegend = true,
                ShowXAxisLabels = true,
                ShowYAxisLabels = true,
                HistoryPointsToShow = 100,
                ShowUnits = true,
                PreviewWidth = 800,
                PreviewHeight = 480,
                PreviewSensors = 1
            };
            // Add the terminal color for Astro layout and animation settings
            var jsonConfig = new Dictionary<string, object>
            {
                ["terminal_color"] = "#00FF00",      // Terminal green color
                ["console_opacity"] = 60,            // Console panel opacity (semi-transparent)
                ["terminal_opacity"] = 80,           // Terminal panel opacity (more opaque)
                ["animation_rate_ms"] = 100,         // Animation refresh rate in ms (10fps)
                ["star_count"] = 100,                // Number of stars in the starfield
                ["star_brightness_min"] = 0,         // Minimum star brightness (0-255)
                ["star_brightness_max"] = 255,       // Maximum star brightness (0-255)
                ["star_twinkle_speed_min"] = 3,      // Minimum twinkle speed
                ["star_twinkle_speed_max"] = 12      // Maximum twinkle speed
            };

            var options = new System.Text.Json.JsonSerializerOptions
            {
                WriteIndented = true
            };

            template.JsonLayoutConfig = System.Text.Json.JsonSerializer.Serialize(jsonConfig, options);
            return template;
        }

        private Model_Screen_Layout BuildAstroOffsetTemplate(string name)
        {
            var tpl = BuildAstroTemplate(name);
            tpl.TopMargin = 80;
            tpl.BottomMargin = 35;
            tpl.LeftMargin = 30;
            tpl.RightMargin = 40;

            // The JsonLayoutConfig is already set in the base template

            return tpl;
        }

        private Model_Screen_Layout BuildMatrixTemplate(string name)
        {
            return new Model_Screen_Layout
            {
                DisplayName = name,
                IsTemplate = true,
                Description = "4-row, 4 sensor matrix layout.",
                LayoutType = "MATRIX",
                TextColor = "#FFFFFF",
                BackgroundColor = "#000000",
                ShowUnits = true,
                PreviewWidth = 800,
                PreviewHeight = 480,
                PreviewSensors = 4
            };
        }

        private Model_Screen_Layout BuildNeoPixelTemplate(string name)
        {
            return new Model_Screen_Layout
            {
                DisplayName = name,
                IsTemplate = true,
                Description = "Random color each payload on CM5 effect",
                LayoutType = "NEOPIXEL",
                PreviewWidth = 800,
                PreviewHeight = 480,
                PreviewSensors = 1,
            };
        }

        private Model_Screen_Layout BuildQuadTemplate(string name)
        {
            return new Model_Screen_Layout
            {
                DisplayName = name,
                IsTemplate = true,
                Description = "4-char QUAD display layout, right-aligned static mode showing first 3 digits + unit.",
                LayoutType = "QUAD",
                PreviewWidth = 560,
                PreviewHeight = 280,
                PreviewSensors = 1
            };
        }
    }
}
