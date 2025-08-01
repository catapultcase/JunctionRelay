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

using JunctionRelayServer.Models;
using SkiaSharp;
using System.Text.Json;

namespace JunctionRelayServer.Services
{
    public class Service_FrameEngine
    {
        public byte[] RenderFrame(Model_Frame_Layout layout, Dictionary<string, object> sensorData,
            Model_JunctionScreenLayout? screenConfig = null, int? junctionId = null, int? linkId = null, int? screenId = null)
        {
            // Create surface matching frame dimensions
            var info = new SKImageInfo(layout.Width, layout.Height);
            using var surface = SKSurface.Create(info);
            var canvas = surface.Canvas;

            // Clear canvas with background
            ApplyBackground(canvas, layout);

            // Render content based on layout type
            switch (layout.LayoutType.ToUpperInvariant())
            {
                case "FRAME_SENSOR_GRID":
                    RenderSensorGridLayout(canvas, layout, sensorData);
                    break;
                case "FRAME_CALENDAR":
                    RenderCalendarLayout(canvas, layout, sensorData);
                    break;
                case "FRAME_DASHBOARD":
                    RenderDashboardLayout(canvas, layout, sensorData);
                    break;
                case "FRAME_CHART":
                    RenderChartLayout(canvas, layout, sensorData);
                    break;
                case "FRAME_QUAD":
                    RenderQuadLayout(canvas, layout, sensorData);
                    break;
                case "FRAME_IMAGE":
                    RenderImageLayout(canvas, layout, sensorData);
                    break;
                default:
                    RenderDefaultLayout(canvas, layout, sensorData);
                    break;
            }

            // Generate PNG frame
            using var image = surface.Snapshot();
            using var data = image.Encode(SKEncodedImageFormat.Png, 100);
            var frameData = data.ToArray();

            // Save to disk if URL access is enabled
            if (screenConfig?.EnableUrlAccess == true && junctionId.HasValue && linkId.HasValue && screenId.HasValue)
            {
                SaveFrameToFile(frameData, junctionId.Value, linkId.Value, screenId.Value, screenConfig);
            }

            return frameData;
        }

        private void SaveFrameToFile(byte[] frameData, int junctionId, int linkId, int screenId, Model_JunctionScreenLayout screenConfig)
        {
            // Console.WriteLine($"[DEBUG] SaveFrameToFile called: junctionId={junctionId}, linkId={linkId}, screenId={screenId}");
            // Console.WriteLine($"[DEBUG] EnableUrlAccess={screenConfig.EnableUrlAccess}, UrlPath={screenConfig.UrlPath}");

            try
            {
                // Generate filename
                var filename = $"junction-{junctionId}-link-{linkId}-screen-{screenId}.png";
                var framesDirectory = Path.Combine(Directory.GetCurrentDirectory(), "frames");
                var filePath = Path.Combine(framesDirectory, filename);

                // Console.WriteLine($"[DEBUG] Saving to: {filePath}");

                // Ensure frames directory exists
                if (!Directory.Exists(framesDirectory))
                {
                    Directory.CreateDirectory(framesDirectory);
                    // Console.WriteLine($"[DEBUG] Created frames directory: {framesDirectory}");
                }

                // Save file
                File.WriteAllBytes(filePath, frameData);
                // Console.WriteLine($"[DEBUG] File saved successfully: {filename} ({frameData.Length} bytes)");

                // Update URL path if it's changed
                if (screenConfig.UrlPath != filename)
                {
                    screenConfig.UrlPath = filename;
                    Console.WriteLine($"[DEBUG] Updated UrlPath to: {filename}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERROR] SaveFrameToFile failed: {ex.Message}");
                Console.WriteLine($"[ERROR] Stack trace: {ex.StackTrace}");
            }
        }

        public static string GenerateFrameUrl(string baseUrl, Model_JunctionScreenLayout screenConfig)
        {
            if (!screenConfig.EnableUrlAccess || string.IsNullOrEmpty(screenConfig.UrlPath))
                return string.Empty;

            return $"{baseUrl.TrimEnd('/')}/frames/{screenConfig.UrlPath}";
        }

        public static string GenerateUrlPath(int junctionId, int linkId, int screenId)
        {
            return $"junction-{junctionId}-link-{linkId}-screen-{screenId}.png";
        }

        public void CleanupOldFrames(TimeSpan maxAge)
        {
            try
            {
                var framesDirectory = Path.Combine(Directory.GetCurrentDirectory(), "frames");
                if (!Directory.Exists(framesDirectory))
                    return;

                var cutoffTime = DateTime.Now - maxAge;
                var files = Directory.GetFiles(framesDirectory, "*.png");

                foreach (var file in files)
                {
                    var fileInfo = new FileInfo(file);
                    if (fileInfo.LastWriteTime < cutoffTime)
                    {
                        File.Delete(file);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error cleaning up old frames: {ex.Message}");
            }
        }

        private void ApplyBackground(SKCanvas canvas, Model_Frame_Layout layout)
        {
            var backgroundColor = ParseBackgroundColor(layout.BackgroundColor);
            canvas.Clear(backgroundColor);

            // Handle background image if specified
            if (layout.BackgroundType == "image" && !string.IsNullOrEmpty(layout.BackgroundImageUrl))
            {
                // TODO: Implement background image rendering
                // This would involve loading the image and drawing it with proper scaling/positioning
            }
        }

        private SKColor ParseBackgroundColor(string? colorString)
        {
            if (string.IsNullOrEmpty(colorString))
                return SKColors.White;

            // Handle hex colors (#FFFFFF)
            if (colorString.StartsWith("#"))
            {
                if (SKColor.TryParse(colorString, out var color))
                    return color;
            }

            // Handle RGB arrays [255, 255, 255]
            if (colorString.StartsWith("["))
            {
                try
                {
                    var rgb = JsonSerializer.Deserialize<int[]>(colorString);
                    if (rgb?.Length == 3)
                        return new SKColor((byte)rgb[0], (byte)rgb[1], (byte)rgb[2]);
                }
                catch { }
            }

            return SKColors.White; // Default fallback
        }

        #region Layout Renderers

        private void RenderSensorGridLayout(SKCanvas canvas, Model_Frame_Layout layout, Dictionary<string, object> sensorData)
        {
            var config = ParseFrameConfig(layout.JsonFrameConfig);

            using var titlePaint = CreateTextPaint(
                GetConfigValue(config, "title.fontSize", 24),
                GetConfigValue(config, "title.color", "#000000"),
                SKFontStyle.Bold
            );

            using var textPaint = CreateTextPaint(18, "#000000");
            using var timestampPaint = CreateTextPaint(14, "#666666");

            // Draw title
            var titleText = GetConfigValue(config, "title.text", "Sensor Grid");
            var titleX = GetConfigValue(config, "title.position.x", 20);
            var titleY = GetConfigValue(config, "title.position.y", 30);
            canvas.DrawText(titleText, titleX, titleY, titlePaint);

            // Draw timestamp
            var timestamp = DateTime.Now.ToString("HH:mm:ss");
            canvas.DrawText($"Updated: {timestamp}", layout.Width - 150, 25, timestampPaint);

            // Render sensor grid
            RenderSensorGrid(canvas, layout, sensorData, textPaint, 20, titleY + 20);
        }

        private void RenderCalendarLayout(SKCanvas canvas, Model_Frame_Layout layout, Dictionary<string, object> sensorData)
        {
            var config = ParseFrameConfig(layout.JsonFrameConfig);

            using var titlePaint = CreateTextPaint(
                GetConfigValue(config, "title.fontSize", 28),
                GetConfigValue(config, "title.color", "#000000"),
                SKFontStyle.Bold
            );

            using var dayHeaderPaint = CreateTextPaint(20, "#000000", SKFontStyle.Bold);
            using var episodePaint = CreateTextPaint(16, "#333333");
            using var timePaint = CreateTextPaint(14, "#666666");

            // Draw title
            var titleText = GetConfigValue(config, "title.text", "TV Guide");
            var today = DateTime.Now.ToString("MMMM dd, yyyy");
            canvas.DrawText($"{titleText} - {today}", 20, 35, titlePaint);

            // Calendar configuration
            var columns = GetConfigValue(config, "calendar.columns", 3);
            var dayHeaders = GetConfigArray(config, "calendar.dayHeaders", new[] { "Yesterday", "Today", "Tomorrow" });
            var columnWidth = (layout.Width - 40) / columns;

            // Draw calendar columns
            for (int col = 0; col < columns && col < dayHeaders.Length; col++)
            {
                var x = 20f + (col * columnWidth);
                var y = 70f;

                // Draw day header
                canvas.DrawText(dayHeaders[col], x, y, dayHeaderPaint);
                y += 30;

                // Find episodes for this day
                var dayKey = dayHeaders[col].ToLowerInvariant();
                var episodeData = sensorData.FirstOrDefault(kvp =>
                    kvp.Key.ToLowerInvariant().Contains(dayKey) &&
                    kvp.Key.ToLowerInvariant().Contains("episode")).Value;

                if (episodeData != null)
                {
                    var episodes = ParseEpisodeData(episodeData.ToString());
                    foreach (var episode in episodes.Take(6)) // Limit for space
                    {
                        canvas.DrawText(episode.Time, x, y, timePaint);
                        canvas.DrawText(episode.Title, x, y + 15, episodePaint);
                        y += 35;
                    }
                }
            }
        }

        private void RenderDashboardLayout(SKCanvas canvas, Model_Frame_Layout layout, Dictionary<string, object> sensorData)
        {
            var config = ParseFrameConfig(layout.JsonFrameConfig);

            using var titlePaint = CreateTextPaint(
                GetConfigValue(config, "title.fontSize", 22),
                GetConfigValue(config, "title.color", "#000000"),
                SKFontStyle.Bold
            );

            using var widgetPaint = CreateTextPaint(16, "#000000");
            using var borderPaint = new SKPaint
            {
                Color = SKColors.LightGray,
                Style = SKPaintStyle.Stroke,
                StrokeWidth = 1
            };

            // Draw title
            var titleText = GetConfigValue(config, "title.text", "System Dashboard");
            canvas.DrawText(titleText, 20, 25, titlePaint);

            // Widget configuration
            var enableShadows = GetConfigValue(config, "widgets.enableShadows", true);
            var cornerRadius = GetConfigValue(config, "widgets.cornerRadius", 8);
            var padding = GetConfigValue(config, "widgets.padding", 12);

            // Calculate widget grid
            var rows = layout.Rows ?? 3;
            var columns = layout.Columns ?? 3;
            var widgetWidth = (layout.Width - 60 - ((columns - 1) * 10)) / columns;
            var widgetHeight = (layout.Height - 80 - ((rows - 1) * 10)) / rows;

            // Draw widgets
            var sensorList = sensorData.ToList();
            for (int row = 0; row < rows; row++)
            {
                for (int col = 0; col < columns; col++)
                {
                    var x = 20 + (col * (widgetWidth + 10));
                    var y = 40 + (row * (widgetHeight + 10));

                    var widgetRect = new SKRect(x, y, x + widgetWidth, y + widgetHeight);

                    // Draw widget background
                    using var widgetBgPaint = new SKPaint
                    {
                        Color = SKColors.White,
                        Style = SKPaintStyle.Fill
                    };
                    canvas.DrawRoundRect(widgetRect, cornerRadius, cornerRadius, widgetBgPaint);
                    canvas.DrawRoundRect(widgetRect, cornerRadius, cornerRadius, borderPaint);

                    // Draw sensor data in widget
                    var sensorIndex = (row * columns) + col;
                    if (sensorIndex < sensorList.Count)
                    {
                        var sensor = sensorList[sensorIndex];
                        canvas.DrawText(sensor.Key, x + padding, y + padding + 16, widgetPaint);
                        canvas.DrawText(FormatSensorValue(sensor.Value), x + padding, y + padding + 36, widgetPaint);
                    }
                }
            }
        }

        private void RenderChartLayout(SKCanvas canvas, Model_Frame_Layout layout, Dictionary<string, object> sensorData)
        {
            var config = ParseFrameConfig(layout.JsonFrameConfig);

            using var titlePaint = CreateTextPaint(20, "#000000", SKFontStyle.Bold);
            using var chartPaint = new SKPaint
            {
                Color = SKColor.Parse("#1976d2"),
                Style = SKPaintStyle.Stroke,
                StrokeWidth = 2,
                IsAntialias = true
            };

            // Draw chart title
            var chartTitle = GetConfigValue(config, "chart.title", "Sensor Data Over Time");
            canvas.DrawText(chartTitle, 20, 30, titlePaint);

            // Simple line chart placeholder
            var chartRect = new SKRect(50, 50, layout.Width - 50, layout.Height - 50);

            // Draw chart border
            using var borderPaint = new SKPaint
            {
                Color = SKColors.Gray,
                Style = SKPaintStyle.Stroke,
                StrokeWidth = 1
            };
            canvas.DrawRect(chartRect, borderPaint);

            // Draw simple data visualization
            if (sensorData.Any())
            {
                var values = sensorData.Values.Take(10).Select(v =>
                {
                    if (float.TryParse(v?.ToString()?.Replace("°C", "").Replace("%", ""), out float result))
                        return result;
                    return 0f;
                }).ToArray();

                if (values.Length > 1)
                {
                    var stepX = chartRect.Width / (values.Length - 1);
                    var maxValue = values.Max();
                    var minValue = values.Min();
                    var range = maxValue - minValue;

                    using var path = new SKPath();
                    for (int i = 0; i < values.Length; i++)
                    {
                        var x = chartRect.Left + (i * stepX);
                        var normalizedValue = range > 0 ? (values[i] - minValue) / range : 0.5f;
                        var y = chartRect.Bottom - (normalizedValue * chartRect.Height);

                        if (i == 0)
                            path.MoveTo(x, y);
                        else
                            path.LineTo(x, y);
                    }
                    canvas.DrawPath(path, chartPaint);
                }
            }
        }

        private void RenderQuadLayout(SKCanvas canvas, Model_Frame_Layout layout, Dictionary<string, object> sensorData)
        {
            var config = ParseFrameConfig(layout.JsonFrameConfig);

            using var textPaint = CreateTextPaint(16, "#000000");
            using var dividerPaint = new SKPaint
            {
                Color = SKColor.Parse(GetConfigValue(config, "quad.dividerColor", "#CCCCCC")),
                Style = SKPaintStyle.Stroke,
                StrokeWidth = GetConfigValue(config, "quad.dividerWidth", 2)
            };

            var padding = GetConfigValue(config, "quad.quadrantPadding", 10);
            var halfWidth = layout.Width / 2f;
            var halfHeight = layout.Height / 2f;

            // Draw dividers
            canvas.DrawLine(halfWidth, 0, halfWidth, layout.Height, dividerPaint);
            canvas.DrawLine(0, halfHeight, layout.Width, halfHeight, dividerPaint);

            // Draw content in each quadrant
            var sensorList = sensorData.ToList();
            var quadrants = new[]
            {
                new { x = (float)padding, y = (float)padding, title = "Quadrant 1" },
                new { x = (float)(halfWidth + padding), y = (float)padding, title = "Quadrant 2" },
                new { x = (float)padding, y = (float)(halfHeight + padding), title = "Quadrant 3" },
                new { x = (float)(halfWidth + padding), y = (float)(halfHeight + padding), title = "Quadrant 4" }
            };

            for (int i = 0; i < quadrants.Length; i++)
            {
                var quad = quadrants[i];
                canvas.DrawText(quad.title, quad.x, quad.y + 20, textPaint);

                // Display sensor data in this quadrant
                var startIndex = i * (sensorList.Count / 4);
                var endIndex = Math.Min(startIndex + (sensorList.Count / 4), sensorList.Count);

                var y = quad.y + 40;
                for (int j = startIndex; j < endIndex; j++)
                {
                    var sensor = sensorList[j];
                    canvas.DrawText($"{sensor.Key}: {FormatSensorValue(sensor.Value)}", quad.x, y, textPaint);
                    y += 20;
                }
            }
        }

        private void RenderImageLayout(SKCanvas canvas, Model_Frame_Layout layout, Dictionary<string, object> sensorData)
        {
            var config = ParseFrameConfig(layout.JsonFrameConfig);

            // Apply semi-transparent overlay for text readability
            var opacity = GetConfigValue(config, "overlay.opacity", 0.8f);
            using var overlayPaint = new SKPaint
            {
                Color = SKColors.Black.WithAlpha((byte)(255 * (1 - opacity))),
                Style = SKPaintStyle.Fill
            };
            canvas.DrawRect(0, 0, layout.Width, layout.Height, overlayPaint);

            // Text with shadow for better visibility
            var useShadow = GetConfigValue(config, "overlay.textShadow", true);
            using var textPaint = CreateTextPaint(18, "#FFFFFF");
            using var shadowPaint = useShadow ? CreateTextPaint(18, "#000000") : null;

            var y = 30f;
            foreach (var sensor in sensorData.Take(10))
            {
                var text = $"{sensor.Key}: {FormatSensorValue(sensor.Value)}";

                if (useShadow && shadowPaint != null)
                {
                    canvas.DrawText(text, 22, y + 2, shadowPaint); // Shadow
                }
                canvas.DrawText(text, 20, y, textPaint);
                y += 25;
            }
        }

        private void RenderDefaultLayout(SKCanvas canvas, Model_Frame_Layout layout, Dictionary<string, object> sensorData)
        {
            // Fallback to sensor grid layout
            RenderSensorGridLayout(canvas, layout, sensorData);
        }

        #endregion

        #region Helper Methods

        private void RenderSensorGrid(SKCanvas canvas, Model_Frame_Layout layout, Dictionary<string, object> sensorData, SKPaint textPaint, float startX, float startY)
        {
            // Draw sensor data in a simple table format
            using var headerPaint = CreateTextPaint(16, "#000000", SKFontStyle.Bold);
            using var borderPaint = new SKPaint
            {
                Color = SKColors.LightGray,
                Style = SKPaintStyle.Stroke,
                StrokeWidth = 1
            };

            var tableWidth = layout.Width - (startX * 2);
            var tableHeight = Math.Min(200, layout.Height - startY - 20);
            var tableRect = new SKRect(startX, startY, startX + tableWidth, startY + tableHeight);

            // Draw table background
            using var tableBgPaint = new SKPaint
            {
                Color = SKColors.White,
                Style = SKPaintStyle.Fill
            };
            canvas.DrawRect(tableRect, tableBgPaint);
            canvas.DrawRect(tableRect, borderPaint);

            // Draw headers
            canvas.DrawText("Sensor", startX + 10, startY + 20, headerPaint);
            canvas.DrawText("Value", startX + tableWidth - 150, startY + 20, headerPaint);

            // Draw sensor rows
            var rowHeight = 25f;
            var currentY = startY + 35;
            var maxRows = Math.Min(sensorData.Count, (int)((tableHeight - 40) / rowHeight));

            foreach (var sensor in sensorData.Take(maxRows))
            {
                canvas.DrawText(sensor.Key, startX + 10, currentY, textPaint);
                canvas.DrawText(FormatSensorValue(sensor.Value), startX + tableWidth - 150, currentY, textPaint);
                currentY += rowHeight;
            }
        }

        private SKPaint CreateTextPaint(float textSize, string color, SKFontStyle fontStyle = default)
        {
            return new SKPaint
            {
                Color = SKColor.Parse(color),
                TextSize = textSize,
                IsAntialias = true,
                Typeface = SKTypeface.FromFamilyName("Arial", fontStyle == default ? SKFontStyle.Normal : fontStyle)
            };
        }

        private JsonDocument? ParseFrameConfig(string? jsonConfig)
        {
            if (string.IsNullOrEmpty(jsonConfig))
                return null;

            try
            {
                return JsonDocument.Parse(jsonConfig);
            }
            catch
            {
                return null;
            }
        }

        private T GetConfigValue<T>(JsonDocument? config, string path, T defaultValue)
        {
            if (config == null)
                return defaultValue;

            try
            {
                var parts = path.Split('.');
                var current = config.RootElement;

                foreach (var part in parts)
                {
                    if (current.TryGetProperty(part, out var element))
                        current = element;
                    else
                        return defaultValue;
                }

                if (typeof(T) == typeof(int))
                    return (T)(object)current.GetInt32();
                if (typeof(T) == typeof(float))
                    return (T)(object)current.GetSingle();
                if (typeof(T) == typeof(bool))
                    return (T)(object)current.GetBoolean();
                if (typeof(T) == typeof(string))
                    return (T)(object)current.GetString()!;

                return defaultValue;
            }
            catch
            {
                return defaultValue;
            }
        }

        private string[] GetConfigArray(JsonDocument? config, string path, string[] defaultValue)
        {
            if (config == null)
                return defaultValue;

            try
            {
                var parts = path.Split('.');
                var current = config.RootElement;

                foreach (var part in parts)
                {
                    if (current.TryGetProperty(part, out var element))
                        current = element;
                    else
                        return defaultValue;
                }

                if (current.ValueKind == JsonValueKind.Array)
                {
                    return current.EnumerateArray()
                        .Select(e => e.GetString() ?? "")
                        .ToArray();
                }

                return defaultValue;
            }
            catch
            {
                return defaultValue;
            }
        }

        private string FormatSensorValue(object? value)
        {
            if (value == null) return "N/A";

            var valueStr = value.ToString() ?? "";
            if (valueStr.Length > 20)
                return valueStr.Substring(0, 17) + "...";

            return valueStr;
        }

        private List<(string Time, string Title)> ParseEpisodeData(string? episodeJson)
        {
            var episodes = new List<(string Time, string Title)>();

            if (string.IsNullOrEmpty(episodeJson))
                return episodes;

            try
            {
                var jsonDoc = JsonDocument.Parse(episodeJson);
                if (jsonDoc.RootElement.ValueKind == JsonValueKind.Array)
                {
                    foreach (var episode in jsonDoc.RootElement.EnumerateArray())
                    {
                        var time = episode.GetProperty("airTime").GetString() ?? "";
                        var series = episode.GetProperty("series").GetString() ?? "";
                        episodes.Add((time, series));
                    }
                }
            }
            catch (JsonException)
            {
                // Fallback for non-JSON data
                episodes.Add(("--:--", episodeJson));
            }

            return episodes;
        }

        // Simple test method for POC compatibility
        public byte[] RenderTestFrame()
        {
            var testSensorData = new Dictionary<string, object>
            {
                ["Temperature"] = "23.5°C",
                ["Humidity"] = "45%",
                ["Pressure"] = "1013.2 hPa",
                ["Light"] = "750 lux",
                ["Motion"] = "No motion",
                ["Battery"] = "98%"
            };

            var testLayout = new Model_Frame_Layout
            {
                DisplayName = "Test Frame",
                LayoutType = "FRAME_SENSOR_GRID",
                Width = 792,
                Height = 272,
                BackgroundColor = "#FFFFFF",
                JsonFrameConfig = @"{
                    ""title"": {
                        ""text"": ""Test Frame"",
                        ""fontSize"": 24,
                        ""color"": ""#000000"",
                        ""position"": { ""x"": 20, ""y"": 30 }
                    }
                }"
            };

            return RenderFrame(testLayout, testSensorData);
        }

        #endregion
    }
}