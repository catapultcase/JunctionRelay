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
        private readonly IWebHostEnvironment _webHostEnvironment;

        public Service_FrameEngine(IWebHostEnvironment webHostEnvironment)
        {
            _webHostEnvironment = webHostEnvironment;
        }

        // ORIGINAL SKIASHARP METHODS (for live frame generation)

        public byte[] RenderFrame(Model_Frame_Layout layout, Dictionary<string, object> sensorData,
            Model_JunctionScreenLayout? screenConfig = null, int? junctionId = null, int? linkId = null, int? screenId = null)
        {
            try
            {
                // Validate input
                if (layout == null)
                    throw new ArgumentNullException(nameof(layout));

                sensorData ??= new Dictionary<string, object>();

                // Create surface matching frame dimensions
                var info = new SKImageInfo(layout.Width, layout.Height);
                using var surface = SKSurface.Create(info);
                var canvas = surface.Canvas;

                // Clear canvas and apply background
                ApplyBackground(canvas, layout);

                // Render content based on layout type
                switch (layout.LayoutType.ToUpperInvariant())
                {
                    case "PRE_RENDERED_IMAGE":
                        RenderPreRenderedImage(canvas, layout, sensorData);
                        break;
                    case "COMPOSITE_MODE":
                        RenderRiveMapping(canvas, layout, sensorData);
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
            catch (Exception ex)
            {
                Console.WriteLine($"Error rendering frame for layout {layout?.Id}: {ex.Message}");
                return CreateErrorFrame(layout?.Width ?? 792, layout?.Height ?? 272, ex.Message);
            }
        }

        // NEW THUMBNAIL METHODS (for frontend html2canvas integration)

        /// <summary>
        /// Process thumbnail data received from frontend html2canvas
        /// </summary>
        public async Task<byte[]> ProcessThumbnailFromFrontend(string base64ImageData)
        {
            try
            {
                // Remove data URL prefix if present (data:image/png;base64,...)
                var base64Data = base64ImageData;
                if (base64Data.Contains(","))
                {
                    base64Data = base64Data.Split(',')[1];
                }

                // Convert base64 to bytes
                var imageBytes = Convert.FromBase64String(base64Data);

                // Validate image data
                if (imageBytes.Length == 0)
                {
                    throw new ArgumentException("Invalid image data received");
                }

                return imageBytes;
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Failed to process thumbnail data: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// Fallback thumbnail generation using SkiaSharp (for cases where frontend isn't available)
        /// Note: This won't capture live Rive animations, but provides a basic thumbnail
        /// </summary>
        public async Task<byte[]> GenerateThumbnailAsync(Model_Frame_Layout layout, int width = 300, int height = 200)
        {
            try
            {
                if (layout == null)
                    throw new ArgumentNullException(nameof(layout));

                // Create sample sensor data for thumbnail
                var sampleSensorData = GenerateSampleSensorData();

                // Create thumbnail-sized surface
                var info = new SKImageInfo(width, height);
                using var surface = SKSurface.Create(info);
                var canvas = surface.Canvas;

                // Scale the layout to fit thumbnail dimensions
                var scaleX = (float)width / layout.Width;
                var scaleY = (float)height / layout.Height;
                var scale = Math.Min(scaleX, scaleY);

                canvas.Scale(scale);

                // Apply background (but skip Rive since we can't capture it server-side)
                ApplyBackgroundForThumbnail(canvas, layout);

                // Render content with thumbnail-specific styling
                RenderThumbnailContent(canvas, layout, sampleSensorData, scale);

                // Generate PNG thumbnail
                using var image = surface.Snapshot();
                using var data = image.Encode(SKEncodedImageFormat.Png, 85); // Slightly compressed for thumbnails
                return data.ToArray();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error generating thumbnail for layout {layout?.Id}: {ex.Message}");
                return CreateErrorThumbnail(width, height, "Thumbnail generation failed");
            }
        }

        // ORIGINAL SKIASHARP RENDERING METHODS (unchanged)

        private void RenderPreRenderedImage(SKCanvas canvas, Model_Frame_Layout layout, Dictionary<string, object> sensorData)
        {
            var config = ParseFrameConfig(layout.JsonFrameConfig);
            var elements = ParseFrameElements(layout.JsonFrameElements);

            // Render title if configured
            if (GetConfigValue(config, "title.enabled", true))
            {
                var titleText = GetConfigValue(config, "title.text", layout.DisplayName ?? "Frame");
                var titleSize = GetConfigValue(config, "title.fontSize", 24f);
                var titleColor = GetConfigValue(config, "title.color", "#000000");
                var titleX = GetConfigValue(config, "title.position.x", 20f);
                var titleY = GetConfigValue(config, "title.position.y", 40f);

                using var titlePaint = CreateTextPaint(titleSize, titleColor, SKFontStyle.Bold);
                canvas.DrawText(titleText, titleX, titleY, titlePaint);
            }

            // Render sensor data grid
            if (sensorData.Any())
            {
                var gridEnabled = GetConfigValue(config, "sensorGrid.enabled", true);
                if (gridEnabled)
                {
                    var gridX = GetConfigValue(config, "sensorGrid.position.x", 20f);
                    var gridY = GetConfigValue(config, "sensorGrid.position.y", 80f);

                    using var sensorPaint = CreateTextPaint(14, "#333333");
                    RenderSensorGrid(canvas, layout, sensorData, sensorPaint, gridX, gridY);
                }
            }

            // Render additional elements from JsonFrameElements
            RenderFrameElements(canvas, elements, sensorData);
        }

        private void RenderRiveMapping(SKCanvas canvas, Model_Frame_Layout layout, Dictionary<string, object> sensorData)
        {
            // For Rive layouts, show a placeholder since we can't render live Rive server-side
            using var paint = CreateTextPaint(16, "#666666");
            var text = $"Rive Animation: {layout.RiveFile ?? "No file specified"}";
            canvas.DrawText(text, 20, layout.Height / 2, paint);

            // Show sensor mappings
            var config = ParseFrameConfig(layout.JsonFrameConfig);
            var mappings = GetConfigValue(config, "sensorMappings", new Dictionary<string, object>());

            var y = (float)(layout.Height / 2 + 40);
            foreach (var sensor in sensorData.Take(5))
            {
                var mappingText = $"{sensor.Key}: {FormatSensorValue(sensor.Value)}";
                canvas.DrawText(mappingText, 20, y, paint);
                y += 25;
            }
        }

        private void RenderDefaultLayout(SKCanvas canvas, Model_Frame_Layout layout, Dictionary<string, object> sensorData)
        {
            // Fallback rendering for unknown layout types
            using var titlePaint = CreateTextPaint(20, "#000000", SKFontStyle.Bold);
            canvas.DrawText(layout.DisplayName ?? "Unknown Layout", 20, 40, titlePaint);

            using var textPaint = CreateTextPaint(14, "#666666");
            canvas.DrawText($"Layout Type: {layout.LayoutType}", 20, 70, textPaint);

            if (sensorData.Any())
            {
                RenderSensorGrid(canvas, layout, sensorData, textPaint, 20, 100);
            }
        }

        // NEW THUMBNAIL-SPECIFIC RENDERING METHODS

        private void ApplyBackgroundForThumbnail(SKCanvas canvas, Model_Frame_Layout layout)
        {
            var backgroundColor = ParseBackgroundColor(layout.BackgroundColor);
            canvas.Clear(backgroundColor);

            // Handle regular background image data (skip Rive for thumbnails)
            if (layout.BackgroundType == "image" && layout.BackgroundImageData != null && layout.BackgroundImageData.Length > 0)
            {
                try
                {
                    using var stream = new MemoryStream(layout.BackgroundImageData);
                    using var bitmap = SKBitmap.Decode(stream);
                    if (bitmap != null)
                    {
                        var destRect = new SKRect(0, 0, layout.Width, layout.Height);
                        canvas.DrawBitmap(bitmap, destRect);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Failed to render background image in thumbnail: {ex.Message}");
                }
            }

            // For Rive backgrounds in thumbnails, just show a placeholder
            if (layout.BackgroundType == "rive")
            {
                using var rivePlaceholderPaint = new SKPaint
                {
                    Color = SKColor.Parse("#E8F4FD"),
                    Style = SKPaintStyle.Fill
                };
                canvas.DrawRect(0, 0, layout.Width, layout.Height, rivePlaceholderPaint);

                // Add Rive indicator
                using var textPaint = CreateTextPaint(12, "#666666");
                var riveText = $"Rive: {Path.GetFileNameWithoutExtension(layout.RiveFile) ?? "Animation"}";
                canvas.DrawText(riveText, 10, 25, textPaint);
            }
        }

        private void RenderThumbnailContent(SKCanvas canvas, Model_Frame_Layout layout, Dictionary<string, object> sensorData, float scale)
        {
            // Render a simplified version optimized for thumbnails
            var config = ParseFrameConfig(layout.JsonFrameConfig);
            var elements = ParseFrameElements(layout.JsonFrameElements);

            // Title (smaller for thumbnails)
            if (GetConfigValue(config, "title.enabled", true))
            {
                var titleText = GetConfigValue(config, "title.text", layout.DisplayName ?? "Frame");
                var titleSize = Math.Max(8f, GetConfigValue(config, "title.fontSize", 24f) * 0.6f);
                var titleColor = GetConfigValue(config, "title.color", "#000000");

                using var titlePaint = CreateTextPaint(titleSize, titleColor, SKFontStyle.Bold);
                canvas.DrawText(TruncateText(titleText, 25), 10, 20, titlePaint);
            }

            // Show a few sensors in a compact grid
            if (sensorData.Any())
            {
                using var sensorPaint = CreateTextPaint(8, "#333333");
                var y = 40f;
                var maxSensors = 4; // Limit for thumbnail

                foreach (var sensor in sensorData.Take(maxSensors))
                {
                    var sensorText = $"{TruncateText(sensor.Key, 8)}: {FormatSensorValue(sensor.Value)}";
                    canvas.DrawText(sensorText, 10, y, sensorPaint);
                    y += 12;
                }
            }
        }

        // UTILITY METHODS (unchanged from original)

        private void RenderFrameElements(SKCanvas canvas, JsonElement? elements, Dictionary<string, object> sensorData)
        {
            if (elements == null || elements.Value.ValueKind != JsonValueKind.Array)
                return;

            foreach (var element in elements.Value.EnumerateArray())
            {
                try
                {
                    var elementType = element.GetProperty("type").GetString();
                    switch (elementType?.ToLowerInvariant())
                    {
                        case "text":
                            RenderTextElement(canvas, element, sensorData);
                            break;
                        case "sensor":
                            RenderSensorElement(canvas, element, sensorData);
                            break;
                        case "image":
                            RenderImageElement(canvas, element);
                            break;
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error rendering frame element: {ex.Message}");
                }
            }
        }

        private void RenderTextElement(SKCanvas canvas, JsonElement element, Dictionary<string, object> sensorData)
        {
            var text = element.GetProperty("text").GetString() ?? "";
            var x = element.GetProperty("position").GetProperty("x").GetSingle();
            var y = element.GetProperty("position").GetProperty("y").GetSingle();
            var fontSize = element.TryGetProperty("fontSize", out var fontSizeProp) ? fontSizeProp.GetSingle() : 14f;
            var color = element.TryGetProperty("color", out var colorProp) ? colorProp.GetString() : "#000000";

            // Replace sensor placeholders in text
            foreach (var sensor in sensorData)
            {
                text = text.Replace($"{{{sensor.Key}}}", FormatSensorValue(sensor.Value));
            }

            using var paint = CreateTextPaint(fontSize, color ?? "#000000");
            canvas.DrawText(text, x, y, paint);
        }

        private void RenderSensorElement(SKCanvas canvas, JsonElement element, Dictionary<string, object> sensorData)
        {
            var sensorKey = element.GetProperty("sensorKey").GetString() ?? "";
            var x = element.GetProperty("position").GetProperty("x").GetSingle();
            var y = element.GetProperty("position").GetProperty("y").GetSingle();
            var fontSize = element.TryGetProperty("fontSize", out var fontSizeProp) ? fontSizeProp.GetSingle() : 14f;
            var color = element.TryGetProperty("color", out var colorProp) ? colorProp.GetString() : "#000000";

            if (sensorData.TryGetValue(sensorKey, out var sensorValue))
            {
                var text = FormatSensorValue(sensorValue);
                using var paint = CreateTextPaint(fontSize, color ?? "#000000");
                canvas.DrawText(text, x, y, paint);
            }
        }

        private void RenderImageElement(SKCanvas canvas, JsonElement element)
        {
            // Placeholder for image rendering
            var x = element.GetProperty("position").GetProperty("x").GetSingle();
            var y = element.GetProperty("position").GetProperty("y").GetSingle();
            var width = element.TryGetProperty("width", out var widthProp) ? widthProp.GetSingle() : 100f;
            var height = element.TryGetProperty("height", out var heightProp) ? heightProp.GetSingle() : 100f;

            using var paint = new SKPaint
            {
                Color = SKColors.LightGray,
                Style = SKPaintStyle.Fill
            };
            canvas.DrawRect(x, y, width, height, paint);

            using var borderPaint = new SKPaint
            {
                Color = SKColors.Gray,
                Style = SKPaintStyle.Stroke,
                StrokeWidth = 1
            };
            canvas.DrawRect(x, y, width, height, borderPaint);
        }

        private void SaveFrameToFile(byte[] frameData, int junctionId, int linkId, int screenId, Model_JunctionScreenLayout screenConfig)
        {
            try
            {
                var filename = $"junction-{junctionId}-link-{linkId}-screen-{screenId}.png";
                var framesDirectory = Path.Combine(Directory.GetCurrentDirectory(), "frames");
                var filePath = Path.Combine(framesDirectory, filename);

                // Ensure frames directory exists
                if (!Directory.Exists(framesDirectory))
                {
                    Directory.CreateDirectory(framesDirectory);
                }

                // Save file
                File.WriteAllBytes(filePath, frameData);

                // Update URL path if it's changed
                if (screenConfig.UrlPath != filename)
                {
                    screenConfig.UrlPath = filename;
                }

                Console.WriteLine($"[DEBUG] Frame saved to file: {filename} ({frameData.Length} bytes)");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERROR] Failed to save frame to file: {ex.Message}");
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
                var deletedCount = 0;

                foreach (var file in files)
                {
                    var fileInfo = new FileInfo(file);
                    if (fileInfo.LastWriteTime < cutoffTime)
                    {
                        File.Delete(file);
                        deletedCount++;
                    }
                }

                if (deletedCount > 0)
                {
                    Console.WriteLine($"Cleaned up {deletedCount} old frame files");
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
                Console.WriteLine($"Background image rendering not yet implemented: {layout.BackgroundImageUrl}");
            }

            // Handle background image data if provided
            if (layout.BackgroundType == "image" && layout.BackgroundImageData != null && layout.BackgroundImageData.Length > 0)
            {
                try
                {
                    using var stream = new MemoryStream(layout.BackgroundImageData);
                    using var bitmap = SKBitmap.Decode(stream);
                    if (bitmap != null)
                    {
                        var destRect = new SKRect(0, 0, layout.Width, layout.Height);
                        canvas.DrawBitmap(bitmap, destRect);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Failed to render background image from data: {ex.Message}");
                }
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
                catch (JsonException ex)
                {
                    Console.WriteLine($"Failed to parse RGB color array: {colorString} - {ex.Message}");
                }
            }

            return SKColors.White; // Default fallback
        }

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

            var tableWidth = Math.Min(400, layout.Width - (startX * 2));
            var tableHeight = Math.Min(200, layout.Height - startY - 20);
            var tableRect = new SKRect(startX, startY, startX + tableWidth, startY + tableHeight);

            // Draw table background
            using var tableBgPaint = new SKPaint
            {
                Color = SKColor.Parse("#F8F9FA"),
                Style = SKPaintStyle.Fill
            };
            canvas.DrawRect(tableRect, tableBgPaint);
            canvas.DrawRect(tableRect, borderPaint);

            // Draw headers
            canvas.DrawText("Sensor", startX + 10, startY + 20, headerPaint);
            canvas.DrawText("Value", startX + tableWidth - 150, startY + 20, headerPaint);

            // Draw separator line
            canvas.DrawLine(startX + 5, startY + 25, startX + tableWidth - 5, startY + 25, borderPaint);

            // Draw sensor rows
            var rowHeight = 25f;
            var currentY = startY + 45;
            var maxRows = Math.Min(sensorData.Count, (int)((tableHeight - 50) / rowHeight));

            foreach (var sensor in sensorData.Take(maxRows))
            {
                canvas.DrawText(TruncateText(sensor.Key, 15), startX + 10, currentY, textPaint);
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
            catch (JsonException ex)
            {
                Console.WriteLine($"Failed to parse frame config JSON: {ex.Message}");
                return null;
            }
        }

        private JsonElement? ParseFrameElements(string? jsonElements)
        {
            if (string.IsNullOrEmpty(jsonElements))
                return null;

            try
            {
                var doc = JsonDocument.Parse(jsonElements);
                return doc.RootElement;
            }
            catch (JsonException ex)
            {
                Console.WriteLine($"Failed to parse frame elements JSON: {ex.Message}");
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
                    return (T)(object)(current.GetString() ?? "");
                if (typeof(T) == typeof(Dictionary<string, object>))
                {
                    var dict = new Dictionary<string, object>();
                    foreach (var prop in current.EnumerateObject())
                    {
                        dict[prop.Name] = prop.Value.ToString();
                    }
                    return (T)(object)dict;
                }

                return defaultValue;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to get config value for path: {path} - {ex.Message}");
                return defaultValue;
            }
        }

        private Dictionary<string, object> GenerateSampleSensorData()
        {
            return new Dictionary<string, object>
            {
                ["Temperature"] = "23.5°C",
                ["Humidity"] = "45%",
                ["Pressure"] = "1013.2 hPa",
                ["Light"] = "750 lux",
                ["Motion"] = "No motion",
                ["Battery"] = "98%"
            };
        }

        private string FormatSensorValue(object? value)
        {
            if (value == null) return "N/A";

            var valueStr = value.ToString() ?? "";
            return TruncateText(valueStr, 20);
        }

        private string TruncateText(string text, int maxLength)
        {
            if (text.Length > maxLength)
                return text.Substring(0, maxLength - 3) + "...";
            return text;
        }

        private byte[] CreateErrorFrame(int width, int height, string errorMessage)
        {
            var info = new SKImageInfo(width, height);
            using var surface = SKSurface.Create(info);
            var canvas = surface.Canvas;

            // Red background for error
            canvas.Clear(SKColor.Parse("#FFE6E6"));

            // Error text
            using var paint = CreateTextPaint(16, "#CC0000", SKFontStyle.Bold);
            canvas.DrawText("Error rendering frame:", 20, 40, paint);

            using var detailPaint = CreateTextPaint(12, "#666666");
            canvas.DrawText(TruncateText(errorMessage, 50), 20, 70, detailPaint);

            using var image = surface.Snapshot();
            using var data = image.Encode(SKEncodedImageFormat.Png, 100);
            return data.ToArray();
        }

        private byte[] CreateErrorThumbnail(int width, int height, string errorMessage)
        {
            var info = new SKImageInfo(width, height);
            using var surface = SKSurface.Create(info);
            var canvas = surface.Canvas;

            canvas.Clear(SKColor.Parse("#F0F0F0"));

            using var paint = CreateTextPaint(Math.Max(8f, width / 25f), "#999999");
            canvas.DrawText("Error", width / 2 - 20, height / 2, paint);

            using var image = surface.Snapshot();
            using var data = image.Encode(SKEncodedImageFormat.Png, 85);
            return data.ToArray();
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
                LayoutType = "PRE_RENDERED_IMAGE",
                Width = 792,
                Height = 272,
                BackgroundColor = "#FFFFFF",
                BackgroundType = "color",
                JsonFrameConfig = @"{
                    ""title"": {
                        ""enabled"": true,
                        ""text"": ""Test Frame"",
                        ""fontSize"": 24,
                        ""color"": ""#000000"",
                        ""position"": { ""x"": 20, ""y"": 30 }
                    },
                    ""sensorGrid"": {
                        ""enabled"": true,
                        ""position"": { ""x"": 20, ""y"": 80 }
                    }
                }",
                JsonFrameElements = @"[]"
            };

            return RenderFrame(testLayout, testSensorData);
        }
    }
}