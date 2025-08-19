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
using System.Text.Json;
using System.IO.Compression;
using System.Text;
using Microsoft.AspNetCore.Http;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_Payloads
    {
        private readonly Service_Database_Manager_Sensors _sensorDb;
        private readonly Service_Database_Manager_Layouts _layoutsDb;
        private readonly Service_Manager_Connections _serviceManagerConnections;
        private readonly Service_FrameEngine _frameEngine;
        private readonly Service_Database_Manager_FrameEngine _frameLayoutDb;
        private readonly Service_Database_Manager_JunctionLinks _junctionLinksService;
        private readonly IHttpContextAccessor _httpContextAccessor;

        public Service_Manager_Payloads(
            Service_Database_Manager_Sensors sensorDb,
            Service_Manager_Connections serviceManagerConnections,
            Service_Database_Manager_Layouts layoutsDb,
            Service_FrameEngine frameEngine,
            Service_Database_Manager_FrameEngine frameLayoutDb,
            Service_Database_Manager_JunctionLinks junctionLinksService,
            IHttpContextAccessor httpContextAccessor)
        {
            _sensorDb = sensorDb;
            _serviceManagerConnections = serviceManagerConnections;
            _layoutsDb = layoutsDb;
            _frameEngine = frameEngine;
            _frameLayoutDb = frameLayoutDb;
            _junctionLinksService = junctionLinksService;
            _httpContextAccessor = httpContextAccessor;
        }

        // Helper method to add properties if they are present (including valid 0 values)
        private void AddIfPresent<T>(Dictionary<string, object> dictionary, string key, T? value)
        {
            if (value == null)
                return;

            // For booleans, only add if true
            if (value is bool boolValue)
            {
                if (boolValue) // Only add if true
                    dictionary[key] = value!;
                return;
            }

            // For numbers, only add if non-zero
            if (value is int intValue)
            {
                if (intValue != 0)
                    dictionary[key] = value!;
                return;
            }

            if (value is double doubleValue)
            {
                if (doubleValue != 0)
                    dictionary[key] = value!;
                return;
            }

            // For strings, only add if not empty
            if (value is string stringValue)
            {
                if (!string.IsNullOrEmpty(stringValue))
                    dictionary[key] = value!;
                return;
            }

            // For any other type (nested dicts/lists), add if not null
            dictionary[key] = value!;
        }

        // Helper method to deep‐clone a JsonElement into native .NET types (primitives, dictionaries, lists)
        private object? CloneJsonValue(JsonElement element)
        {
            switch (element.ValueKind)
            {
                case JsonValueKind.Object:
                    var obj = new Dictionary<string, object>();
                    foreach (var prop in element.EnumerateObject())
                    {
                        var cloned = CloneJsonValue(prop.Value);
                        if (cloned != null)
                            obj[prop.Name] = cloned;
                    }
                    return obj;

                case JsonValueKind.Array:
                    var list = new List<object>();
                    foreach (var item in element.EnumerateArray())
                    {
                        var cloned = CloneJsonValue(item);
                        if (cloned != null)
                            list.Add(cloned);
                    }
                    return list;

                case JsonValueKind.String:
                    return element.GetString();

                case JsonValueKind.Number:
                    if (element.TryGetInt32(out var i)) return i;
                    if (element.TryGetInt64(out var l)) return l;
                    if (element.TryGetDouble(out var d)) return d;
                    return element.GetRawText();

                case JsonValueKind.True:
                    return true;

                case JsonValueKind.False:
                    return false;

                case JsonValueKind.Null:
                default:
                    return null;
            }
        }

        // Helper method to add gateway destination when junction type is "Gateway"
        private void AddGatewayDestination(Dictionary<string, object> payloadDict, string junctionType, string? gatewayDestination, string screenKey)
        {
            if (junctionType.Contains("Gateway", StringComparison.OrdinalIgnoreCase))
            {
                if (!string.IsNullOrEmpty(gatewayDestination))
                {
                    payloadDict["destination"] = gatewayDestination;
                }
                else
                {
                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ Gateway junction detected but no destination specified for {screenKey}");
                }
            }
        }

        // Helper method to compress data using Gzip
        private byte[] CompressData(string data)
        {
            var bytes = Encoding.UTF8.GetBytes(data);
            using var output = new MemoryStream();
            using (var gzip = new GZipStream(output, CompressionMode.Compress))
            {
                gzip.Write(bytes, 0, bytes.Length);
            }
            return output.ToArray();
        }

        // Helper method to serialize payload with LLLLTTRR prefix and compression
        private object SerializeWithOptionalPrefix(Dictionary<string, object> payloadDict, bool includePrefix, string payloadType, bool compressPayload = false, string routingHint = "00")
        {
            var json = JsonSerializer.Serialize(payloadDict, new JsonSerializerOptions
            {
                WriteIndented = false // Remove whitespace for better compression
            });

            if (compressPayload)
            {
                var compressedData = CompressData(json);
                var originalSize = Encoding.UTF8.GetByteCount(json);
                var compressedSize = compressedData.Length;
                var compressionRatio = (1.0 - (double)compressedSize / originalSize) * 100;

                if (includePrefix)
                {
                    // FIXED: LLLLTTRR format: Length(4) + Type(01=Gzip) + Route(2)
                    var lengthHint = Math.Min(compressedData.Length, 9999).ToString("D4");
                    var typeField = "01"; // Gzip
                    var cleanRoutingHint = routingHint.Substring(0, Math.Min(2, routingHint.Length)).PadLeft(2, '0');
                    var prefix = lengthHint + typeField + cleanRoutingHint;

                    var prefixBytes = Encoding.UTF8.GetBytes(prefix);
                    var result = new byte[prefixBytes.Length + compressedData.Length];
                    Array.Copy(prefixBytes, 0, result, 0, prefixBytes.Length);
                    Array.Copy(compressedData, 0, result, prefixBytes.Length, compressedData.Length);

                    return result;
                }
                else
                {
                    return compressedData;
                }
            }
            else
            {
                // Uncompressed JSON
                if (includePrefix)
                {
                    // FIXED: LLLLTTRR format: Length(4) + Type(00=JSON) + Route(2)
                    var lengthHint = Math.Min(json.Length, 9999).ToString("D4");
                    var typeField = "00"; // JSON
                    var cleanRoutingHint = routingHint.Substring(0, Math.Min(2, routingHint.Length)).PadLeft(2, '0');
                    var prefix = lengthHint + typeField + cleanRoutingHint;

                    return prefix + json;
                }
                else
                {
                    return json;
                }
            }
        }

        // Helper method to add all template properties to a dictionary
        private void AddAllTemplateProperties(Model_Screen_Layout template, Dictionary<string, object> dictionary)
        {
            // Add all model properties with appropriate snake_case naming for the API
            AddIfPresent(dictionary, "rows", template.Rows);
            AddIfPresent(dictionary, "columns", template.Columns);
            AddIfPresent(dictionary, "top_margin", template.TopMargin);
            AddIfPresent(dictionary, "bottom_margin", template.BottomMargin);
            AddIfPresent(dictionary, "left_margin", template.LeftMargin);
            AddIfPresent(dictionary, "right_margin", template.RightMargin);
            AddIfPresent(dictionary, "outer_padding", template.OuterPadding);
            AddIfPresent(dictionary, "inner_padding", template.InnerPadding);
            AddIfPresent(dictionary, "text_color", template.TextColor);
            AddIfPresent(dictionary, "background_color", template.BackgroundColor);
            AddIfPresent(dictionary, "border_color", template.BorderColor);
            AddIfPresent(dictionary, "border_visible", template.BorderVisible);
            AddIfPresent(dictionary, "border_thickness", template.BorderThickness);
            AddIfPresent(dictionary, "rounded_corners", template.RoundedCorners);
            AddIfPresent(dictionary, "border_radius_size", template.BorderRadiusSize);
            AddIfPresent(dictionary, "opacity_percentage", template.OpacityPercentage);
            AddIfPresent(dictionary, "gradient_direction", template.GradientDirection);
            AddIfPresent(dictionary, "gradient_end_color", template.GradientEndColor);
            AddIfPresent(dictionary, "justify_content", template.JustifyContent);
            AddIfPresent(dictionary, "align_items", template.AlignItems);
            AddIfPresent(dictionary, "text_alignment", template.TextAlignment);
            AddIfPresent(dictionary, "animation_type", template.AnimationType);
            AddIfPresent(dictionary, "animation_duration", template.AnimationDuration);
            AddIfPresent(dictionary, "text_size", template.TextSize);
            AddIfPresent(dictionary, "label_size", template.LabelSize);
            AddIfPresent(dictionary, "value_size", template.ValueSize);
            AddIfPresent(dictionary, "title_font_id", template.TitleFontId);
            AddIfPresent(dictionary, "sub_heading_font_id", template.SubHeadingFontId);
            AddIfPresent(dictionary, "sensor_labels_font_id", template.SensorLabelsFontId);
            AddIfPresent(dictionary, "sensor_values_font_id", template.SensorValuesFontId);
            AddIfPresent(dictionary, "sensor_units_font_id", template.SensorUnitsFontId);
            AddIfPresent(dictionary, "chart_outline_visible", template.ChartOutlineVisible);
            AddIfPresent(dictionary, "chart_scroll_speed", template.ChartScrollSpeed);
            AddIfPresent(dictionary, "show_legend", template.ShowLegend);
            AddIfPresent(dictionary, "position_legend_inside", template.PositionLegendInside);
            AddIfPresent(dictionary, "show_x_axis_labels", template.ShowXAxisLabels);
            AddIfPresent(dictionary, "show_y_axis_labels", template.ShowYAxisLabels);
            AddIfPresent(dictionary, "grid_density", template.GridDensity);
            AddIfPresent(dictionary, "history_points_to_show", template.HistoryPointsToShow);
            AddIfPresent(dictionary, "show_units", template.ShowUnits);
            AddIfPresent(dictionary, "is_responsive", template.IsResponsive);
            AddIfPresent(dictionary, "mobile_layout_behavior", template.MobileLayoutBehavior);
            AddIfPresent(dictionary, "theme_id", template.ThemeId);
            AddIfPresent(dictionary, "inherit_theme_styles", template.InheritThemeStyles);
            AddIfPresent(dictionary, "allow_interaction", template.AllowInteraction);
            AddIfPresent(dictionary, "on_click_behavior", template.OnClickBehavior);
            AddIfPresent(dictionary, "navigation_target", template.NavigationTarget);
            AddIfPresent(dictionary, "data_refresh_interval_seconds", template.DataRefreshIntervalSeconds);
            AddIfPresent(dictionary, "cache_data", template.CacheData);
            AddIfPresent(dictionary, "data_filter_criteria", template.DataFilterCriteria);
            AddIfPresent(dictionary, "background_image_url", template.BackgroundImageUrl);
            AddIfPresent(dictionary, "background_image_id", template.BackgroundImageId);
            AddIfPresent(dictionary, "image_fit", template.ImageFit);
            AddIfPresent(dictionary, "lazy_load", template.LazyLoad);
            AddIfPresent(dictionary, "render_priority", template.RenderPriority);
            AddIfPresent(dictionary, "enable_scrollbars", template.EnableScrollbars);
            AddIfPresent(dictionary, "min_width", template.MinWidth);
            AddIfPresent(dictionary, "max_width", template.MaxWidth);
            AddIfPresent(dictionary, "min_height", template.MinHeight);
            AddIfPresent(dictionary, "max_height", template.MaxHeight);
        }

        // Generate Rive configuration payloads for screens

        public async Task<Dictionary<string, object>> GenerateRiveConfigPayloadsAsync(
            string screenKey,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            Model_JunctionScreenLayout? screenOverride = null,
            string? junctionType = null,
            string? gatewayDestination = null,
            bool compressPayload = false)
        {
            var result = new Dictionary<string, object>();

            try
            {
                // 1) Get the frame layout for this screen
                Model_Frame_Layout? frameLayout = null;

                // Check if junction has a specific frame layout override for this screen
                if (screenOverride?.FrameLayoutId.HasValue == true)
                {
                    frameLayout = await _frameLayoutDb.GetFrameLayoutByIdAsync(screenOverride.FrameLayoutId.Value);
                }

                // Fallback to default Rive layout
                if (frameLayout == null)
                {
                    var riveLayouts = await _frameLayoutDb.GetFrameLayoutsByTypeAsync("RIVE_MAPPING");
                    frameLayout = riveLayouts.FirstOrDefault(f => f.IsTemplate);
                }

                if (frameLayout == null)
                {
                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ❌ No Rive frame layout found for screen {screenKey}");
                    return result;
                }

                // 2) Parse JsonFrameConfig and JsonFrameElements
                object? frameConfig = null;
                object? frameElements = null;

                if (!string.IsNullOrWhiteSpace(frameLayout.JsonFrameConfig))
                {
                    try
                    {
                        using var configDoc = JsonDocument.Parse(frameLayout.JsonFrameConfig);
                        frameConfig = CloneJsonValue(configDoc.RootElement);

                        // UPDATED: Only embed Rive file if RiveEmbedInPayload flag is explicitly true
                        if (frameLayout.RiveEmbedInPayload && !string.IsNullOrEmpty(frameLayout.RiveFile))
                        {
                            frameConfig = await EmbedRiveFileInConfig(frameConfig, frameLayout.RiveFile);
                            Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ✅ Embedded Rive file '{frameLayout.RiveFile}' in config for {screenKey}");
                        }
                        else if (!frameLayout.RiveEmbedInPayload && !string.IsNullOrEmpty(frameLayout.RiveFile))
                        {
                            Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ℹ️ Rive file '{frameLayout.RiveFile}' referenced but not embedded for {screenKey} (RiveEmbedInPayload = false)");
                        }
                    }
                    catch (JsonException ex)
                    {
                        Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ Invalid JsonFrameConfig for frame layout {frameLayout.Id}: {ex.Message}");
                    }
                }

                if (!string.IsNullOrWhiteSpace(frameLayout.JsonFrameElements))
                {
                    try
                    {
                        using var elementsDoc = JsonDocument.Parse(frameLayout.JsonFrameElements);
                        frameElements = CloneJsonValue(elementsDoc.RootElement);
                    }
                    catch (JsonException ex)
                    {
                        Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ Invalid JsonFrameElements for frame layout {frameLayout.Id}: {ex.Message}");
                    }
                }

                // 3) Build the Rive config payload
                var payloadDict = new Dictionary<string, object>
                {
                    ["type"] = "rive_config",
                    ["screenId"] = screen.ScreenKey
                };

                // Add frame config if present
                if (frameConfig != null)
                {
                    payloadDict["frameConfig"] = frameConfig;
                }

                // Add frame elements if present
                if (frameElements != null)
                {
                    payloadDict["frameElements"] = frameElements;
                }

                // Add metadata about Rive embedding status
                if (!string.IsNullOrEmpty(frameLayout.RiveFile))
                {
                    payloadDict["riveFile"] = frameLayout.RiveFile;
                    payloadDict["riveEmbedInPayload"] = frameLayout.RiveEmbedInPayload;

                    if (frameLayout.RiveEmbedInPayload)
                    {
                        payloadDict["riveDataEmbedded"] = true;
                    }
                    else
                    {
                        payloadDict["riveDataEmbedded"] = false;
                        payloadDict["riveFileReference"] = frameLayout.RiveFile;
                    }
                }

                // 4) Add gateway destination if applicable
                if (!string.IsNullOrEmpty(junctionType))
                {
                    AddGatewayDestination(payloadDict, junctionType, gatewayDestination, screenKey);
                }

                // 5) Serialize with optional prefix and compression
                string routingHint = (!string.IsNullOrEmpty(junctionType) && junctionType.Contains("Gateway", StringComparison.OrdinalIgnoreCase)) ? "01" : "00";

                // Use screen layout's prefix setting if available
                bool includePrefix = false;
                if (screen.ScreenLayoutId.HasValue)
                {
                    var screenLayout = await _layoutsDb.GetTemplateByIdAsync(screen.ScreenLayoutId.Value);
                    includePrefix = screenLayout?.IncludePrefixConfig == true;
                }

                object finalPayload = SerializeWithOptionalPrefix(payloadDict, includePrefix, "rive config", compressPayload, routingHint);

                result[screenKey] = finalPayload;

                var embeddedStatus = frameLayout.RiveEmbedInPayload && !string.IsNullOrEmpty(frameLayout.RiveFile) ?
                    " (with embedded Rive data)" :
                    (!string.IsNullOrEmpty(frameLayout.RiveFile) ? " (Rive file referenced only)" : "");
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ✅ Created Rive config payload for {screenKey} using layout {frameLayout.DisplayName}{embeddedStatus}");

                return result;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ❌ Error generating Rive config payload for {screenKey}: {ex.Message}");
                return result;
            }
        }

        // Helper method to embed Rive file data in config (add to Service_Manager_Payloads class)
        private async Task<object?> EmbedRiveFileInConfig(object? configObject, string riveFileName)
        {
            try
            {
                if (configObject == null) return null;

                // Convert the config object to a mutable dictionary structure
                var configJson = JsonSerializer.Serialize(configObject);
                var configDict = JsonSerializer.Deserialize<Dictionary<string, object>>(configJson);

                if (configDict == null) return configObject;

                // Navigate to frameConfig.rive section or create it
                if (!configDict.TryGetValue("frameConfig", out var frameConfigObj))
                {
                    // Create frameConfig if it doesn't exist
                    configDict["frameConfig"] = new Dictionary<string, object>();
                    frameConfigObj = configDict["frameConfig"];
                }

                // Convert frameConfig to dictionary if it's a JsonElement
                Dictionary<string, object> frameConfigDict;
                if (frameConfigObj is JsonElement frameConfigElement)
                {
                    var frameConfigJson = frameConfigElement.GetRawText();
                    frameConfigDict = JsonSerializer.Deserialize<Dictionary<string, object>>(frameConfigJson) ?? new Dictionary<string, object>();
                }
                else
                {
                    frameConfigDict = frameConfigObj as Dictionary<string, object> ?? new Dictionary<string, object>();
                }

                // Navigate to or create the rive section
                if (!frameConfigDict.TryGetValue("rive", out var riveObj))
                {
                    frameConfigDict["rive"] = new Dictionary<string, object>();
                    riveObj = frameConfigDict["rive"];
                }

                // Convert rive to dictionary if it's a JsonElement
                Dictionary<string, object> riveDict;
                if (riveObj is JsonElement riveElement)
                {
                    var riveJson = riveElement.GetRawText();
                    riveDict = JsonSerializer.Deserialize<Dictionary<string, object>>(riveJson) ?? new Dictionary<string, object>();
                }
                else
                {
                    riveDict = riveObj as Dictionary<string, object> ?? new Dictionary<string, object>();
                }

                // Get the Rive file as base64 and embed it
                var riveFileData = await GetRiveFileAsBase64(riveFileName);
                if (!string.IsNullOrEmpty(riveFileData))
                {
                    // CHANGED: Use auto-detected server URL
                    var baseUrl = GetServerBaseUrl();
                    riveDict["file"] = riveFileName;
                    riveDict["fileUrl"] = $"{baseUrl}/api/frameengine/rive-files/{riveFileName}/content";
                    riveDict["embedded"] = false;

                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] Generated Rive URL: {riveDict["fileUrl"]}");

                    // Update the nested structure
                    frameConfigDict["rive"] = riveDict;
                    configDict["frameConfig"] = frameConfigDict;

                    // Convert back to the original object structure
                    return CloneJsonValue(JsonDocument.Parse(JsonSerializer.Serialize(configDict)).RootElement);
                }

                return configObject; // Return original if embedding fails
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ Error embedding Rive file {riveFileName} in config: {ex.Message}");
                return configObject; // Return original config if embedding fails
            }
        }

        private string GetServerBaseUrl()
        {
            // Try to get from current HTTP context
            var httpContext = _httpContextAccessor.HttpContext;
            if (httpContext?.Request != null)
            {
                var request = httpContext.Request;
                var scheme = request.Scheme;
                var host = request.Host.Value;
                return $"{scheme}://{host}";
            }

            // Fallback: auto-detect local IP
            try
            {
                var host = System.Net.Dns.GetHostEntry(System.Net.Dns.GetHostName());
                var localIP = host.AddressList
                    .FirstOrDefault(ip => ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork &&
                                          !System.Net.IPAddress.IsLoopback(ip));

                if (localIP != null)
                {
                    return $"http://{localIP}:7180"; // Use your actual port
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] Could not auto-detect IP: {ex.Message}");
            }

            // Final fallback
            return "http://localhost:7180";
        }

        // Helper method to get Rive file as Base64 (add to Service_Manager_Payloads class)
        private async Task<string?> GetRiveFileAsBase64(string filename)
        {
            try
            {
                if (string.IsNullOrEmpty(filename) || !filename.EndsWith(".riv", StringComparison.OrdinalIgnoreCase))
                    return null;

                // Check user files first (next to database)
                var userPath = GetRiveUserPath();
                var userFile = Path.Combine(userPath, filename);
                if (File.Exists(userFile))
                {
                    var fileBytes = await File.ReadAllBytesAsync(userFile);
                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] 📁 Found user Rive file: {filename} ({fileBytes.Length} bytes)");
                    return Convert.ToBase64String(fileBytes);
                }

                // Fallback to templates
                var templatesPath = GetRiveTemplatesPath();
                var templateFile = Path.Combine(templatesPath, filename);
                if (File.Exists(templateFile))
                {
                    var fileBytes = await File.ReadAllBytesAsync(templateFile);
                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] 📁 Found template Rive file: {filename} ({fileBytes.Length} bytes)");
                    return Convert.ToBase64String(fileBytes);
                }

                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ❌ Rive file not found: {filename}");
                return null;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ❌ Error reading Rive file {filename} for Base64 conversion: {ex.Message}");
                return null;
            }
        }

        // Helper method to get Rive templates path (add to Service_Manager_Payloads class)
        private string GetRiveTemplatesPath()
        {
            // This should match the path used in your controller
            return Path.Combine(Directory.GetCurrentDirectory(), "frameengine", "templates");
        }

        // Helper method to get user Rive path (add to Service_Manager_Payloads class)  
        private string GetRiveUserPath()
        {
            // This should match the path used in your controller
            // You may need to inject DatabasePathProvider or use a similar approach
            var dataDir = Path.Combine(Directory.GetCurrentDirectory(), "data");
            return Path.Combine(dataDir, "rive");
        }

        // Generate Rive sensor data payloads for screens (NEW)
        public async Task<Dictionary<string, object>> GenerateRiveSensorPayloadsAsync(
            string screenKey,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            string? junctionType = null,
            string? gatewayDestination = null,
            bool compressPayload = false)
        {
            var result = new Dictionary<string, object>();

            try
            {
                // 1) Ensure we have assigned sensors to work with
                if (assignedSensors.Count == 0)
                {
                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ No assigned sensors for Rive screen {screenKey}. Skipping payload generation.");
                    return result;
                }

                // 2) Build sensor data dictionary from assigned sensors
                var sensorData = new Dictionary<string, object>();

                // Sort sensors by SensorOrder
                var sortedSensors = assignedSensors.OrderBy(s => s.SensorOrder).ToList();

                foreach (var sensor in sortedSensors)
                {
                    // Get the sensor's latest value from the global cache using OriginalId
                    var cachedSensor = _serviceManagerConnections.GetSensorData(sensor.OriginalId);
                    if (cachedSensor != null)
                    {
                        // Format the sensor value based on decimal places
                        object formattedValue;
                        if (double.TryParse(cachedSensor.Value?.ToString(), out double numericValue))
                        {
                            // For Rive, send the numeric value directly for animation purposes
                            formattedValue = Math.Round(numericValue, sensor.DecimalPlaces);
                        }
                        else
                        {
                            formattedValue = cachedSensor.Value?.ToString() ?? "N/A";
                        }

                        // Create sensor data object with value, unit, and formatted display
                        sensorData[sensor.SensorTag] = new
                        {
                            value = formattedValue,
                            unit = cachedSensor.Unit ?? "",
                            displayValue = formattedValue.ToString() + (!string.IsNullOrEmpty(cachedSensor.Unit) ? $" {cachedSensor.Unit}" : "")
                        };
                    }
                    else
                    {
                        Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ Sensor with OriginalId {sensor.OriginalId} not found in cache for Rive rendering");
                        sensorData[sensor.SensorTag] = new
                        {
                            value = 0,
                            unit = "",
                            displayValue = "N/A"
                        };
                    }
                }

                // 3) Create the Rive sensor payload
                var payloadDict = new Dictionary<string, object>
                {
                    ["type"] = "rive_sensor",
                    ["screenId"] = screen.ScreenKey,
                    ["sensors"] = sensorData
                };

                // 4) Add gateway destination if applicable
                if (!string.IsNullOrEmpty(junctionType))
                {
                    AddGatewayDestination(payloadDict, junctionType, gatewayDestination, screenKey);
                }

                // 5) Serialize with optional prefix and compression
                string routingHint = (!string.IsNullOrEmpty(junctionType) && junctionType.Contains("Gateway", StringComparison.OrdinalIgnoreCase)) ? "01" : "00";

                // Use screen layout's prefix setting if available
                bool includePrefix = false;
                if (screen.ScreenLayoutId.HasValue)
                {
                    var screenLayout = await _layoutsDb.GetTemplateByIdAsync(screen.ScreenLayoutId.Value);
                    includePrefix = screenLayout?.IncludePrefixSensor == true;
                }

                object finalPayload = SerializeWithOptionalPrefix(payloadDict, includePrefix, "rive sensor", compressPayload, routingHint);

                result[screenKey] = finalPayload;

                return result;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ❌ Error generating Rive sensor payload for {screenKey}: {ex.Message}");
                return result;
            }
        }

        // Generate configuration payloads for screens
        public async Task<Dictionary<string, object>> GenerateConfigPayloadsAsync(
            string screenKey,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            Model_Screen_Layout? overrideTemplate = null,
            string? junctionType = null,
            string? gatewayDestination = null,
            bool compressPayload = false)
        {
            var result = new Dictionary<string, object>();

            // 1) Ensure there's a ScreenLayoutId
            if (screen.ScreenLayoutId == null)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ❌ Screen {screen.Id} is missing ScreenLayoutId.");
                return result;
            }

            // 2) Load template - use override if provided, otherwise load from database
            Model_Screen_Layout? template;
            if (overrideTemplate != null)
            {
                template = overrideTemplate;
            }
            else
            {
                template = await _layoutsDb.GetTemplateByIdAsync(screen.ScreenLayoutId.Value);
                if (template == null)
                {
                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ Layout template {screen.ScreenLayoutId.Value} not found for screen {screen.Id}.");
                    return result;
                }
            }

            // 3) Sort sensors (treat null as empty list)
            var sortedSensors = (assignedSensors ?? new List<Model_Sensor>())
                .OrderBy(s => s.SensorOrder)
                .ToList();

            // 4) Build base config dictionary from JsonLayoutConfig + template props
            var configDict = new Dictionary<string, object>();
            if (!string.IsNullOrWhiteSpace(template.JsonLayoutConfig))
            {
                try
                {
                    using var doc = JsonDocument.Parse(template.JsonLayoutConfig);
                    foreach (var prop in doc.RootElement.EnumerateObject())
                    {
                        var clonedValue = CloneJsonValue(prop.Value);
                        AddIfPresent(configDict, prop.Name, clonedValue);
                    }
                }
                catch (JsonException ex)
                {
                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ Invalid JsonLayoutConfig for screen {screen.Id}: {ex.Message}");
                }
            }
            AddAllTemplateProperties(template, configDict);

            // 5) Determine layoutKey (CUSTOM stays special)
            string layoutKey;
            if (template.LayoutType.Equals("CUSTOM", StringComparison.OrdinalIgnoreCase))
            {
                layoutKey = string.IsNullOrEmpty(template.CustomLayoutType)
                    ? "custom"
                    : template.CustomLayoutType.ToLowerInvariant();
            }
            else
            {
                layoutKey = template.LayoutType.ToLowerInvariant();
            }

            // 6) Build a 'layout' array only if there are sensors
            List<object>? layoutItems = null;
            if (sortedSensors.Any())
            {
                layoutItems = new List<object>(sortedSensors.Count);
                foreach (var s in sortedSensors)
                {
                    layoutItems.Add(new
                    {
                        id = s.SensorTag,
                        label = s.SensorTag,
                        unit = string.IsNullOrEmpty(s.Unit) ? "" : s.Unit
                    });
                }
            }

            // 7) Assemble the payload dictionary
            var payloadDict = new Dictionary<string, object>
            {
                ["type"] = "config",
                ["screenId"] = screen.ScreenKey,
                [layoutKey] = configDict
            };

            // 8) Add gateway destination if applicable
            if (!string.IsNullOrEmpty(junctionType))
            {
                AddGatewayDestination(payloadDict, junctionType, gatewayDestination, screenKey);
            }

            if (layoutItems != null)
            {
                payloadDict["layout"] = layoutItems;
            }

            // 9) Determine routing hint and serialize with optional prefix and compression
            string routingHint = (!string.IsNullOrEmpty(junctionType) && junctionType.Contains("Gateway", StringComparison.OrdinalIgnoreCase)) ? "01" : "00";
            object finalPayload = SerializeWithOptionalPrefix(payloadDict, template.IncludePrefixConfig, "config", compressPayload, routingHint);

            // 10) Return under the screenKey
            result[screenKey] = finalPayload;
            Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ✅ Created {template.LayoutType} config payload for {screenKey}");

            return result;
        }

        // Generate MQTT subscription configuration payloads for screens
        public async Task<Dictionary<string, object>> GenerateMQTTSubscriptionConfigPayloadsAsync(
            string screenKey,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            string? junctionType = null,
            string? gatewayDestination = null,
            bool compressPayload = false)
        {
            var result = new Dictionary<string, object>();

            // 1) If no sensors are assigned, skip
            if (assignedSensors.Count == 0)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ Screen {screen.Id} has no assigned sensors. Skipping.");
                return result;
            }

            // 2) Load template to get prefix setting
            if (screen.ScreenLayoutId == null)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ❌ Screen {screen.Id} is missing ScreenLayoutId.");
                return result;
            }

            var template = await _layoutsDb.GetTemplateByIdAsync(screen.ScreenLayoutId.Value);
            if (template == null)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ Layout template {screen.ScreenLayoutId.Value} not found for screen {screen.Id}.");
                return result;
            }

            // 3) Create a list of subscriptions based on MQTTTopic from each sensor
            var subscriptions = new List<string>();
            foreach (var sensor in assignedSensors)
            {
                if (!string.IsNullOrEmpty(sensor.MQTTTopic))
                {
                    subscriptions.Add(sensor.MQTTTopic);
                }
                else
                {
                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ Sensor {sensor.SensorTag} does not have an MQTT topic.");
                }
            }

            // 4) Generate the payload object for MQTT subscriptions
            var payloadDict = new Dictionary<string, object>
            {
                ["type"] = "MQTT_Subscription_Request",
                ["screenId"] = screen.ScreenKey,
                ["subscriptions"] = subscriptions
            };

            // 5) Add gateway destination if applicable
            if (!string.IsNullOrEmpty(junctionType))
            {
                AddGatewayDestination(payloadDict, junctionType, gatewayDestination, screenKey);
            }

            // 6) Determine routing hint and serialize with optional prefix and compression
            string routingHint = (!string.IsNullOrEmpty(junctionType) && junctionType.Contains("Gateway", StringComparison.OrdinalIgnoreCase)) ? "01" : "00";
            object finalPayload = SerializeWithOptionalPrefix(payloadDict, template.IncludePrefixConfig, "MQTT config", compressPayload, routingHint);

            // 7) Return under the screenKey
            result[screenKey] = finalPayload;
            Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ✅ Created MQTT subscription payload for {screenKey}");

            return result;
        }

        // Generate sensor data payloads for screens
        public async Task<Dictionary<string, object>> GenerateSensorPayloadsAsync(
            string screenId,
            int sensorCount,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            string? junctionType = null,
            string? gatewayDestination = null,
            bool compressPayload = false)
        {
            var result = new Dictionary<string, object>();

            // 1) Ensure we have assigned sensors to work with
            if (assignedSensors.Count == 0)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ No assigned sensors for Screen {screenId}. Skipping payload generation.");
                return result;
            }

            // 2) Load template from database
            if (screen.ScreenLayoutId == null)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ❌ Screen {screen.Id} is missing ScreenLayoutId.");
                return result;
            }

            var template = await _layoutsDb.GetTemplateByIdAsync(screen.ScreenLayoutId.Value);
            if (template == null)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ Layout template {screen.ScreenLayoutId.Value} not found for screen {screen.Id}.");
                return result;
            }

            // 3) Create a dictionary to hold the sensor data in the desired structure
            var sensors = new Dictionary<string, object>();

            // 4) Sort the assigned sensors by SensorOrder before processing
            var sortedSensors = assignedSensors
                .OrderBy(s => s.SensorOrder)
                .Take(sensorCount)
                .ToList();

            // 5) Iterate over the sorted sensors and create the payloads
            foreach (var sensor in sortedSensors)
            {
                var sensorData = new List<object>();

                // Get the sensor's latest value from the global cache using OriginalId
                var cachedSensor = _serviceManagerConnections.GetSensorData(sensor.OriginalId);
                if (cachedSensor != null)
                {
                    // Format the sensor value based on decimal places from template
                    object formattedValue;
                    if (double.TryParse(cachedSensor.Value?.ToString(), out double numericValue))
                    {
                        formattedValue = numericValue.ToString($"F{sensor.DecimalPlaces}");
                    }
                    else
                    {
                        // If value is not numeric, use as-is
                        formattedValue = cachedSensor.Value?.ToString() ?? "";
                    }

                    sensorData.Add(new { Value = formattedValue, Unit = cachedSensor.Unit });
                }
                else
                {
                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ Sensor with OriginalId {sensor.OriginalId} not found in cache.");
                    continue;
                }

                // Use the sensor's SensorTag as the key for the payload
                sensors[sensor.SensorTag] = sensorData;
            }

            // 6) Create the final payload object in the desired structure
            var payloadDict = new Dictionary<string, object>
            {
                ["type"] = "sensor",
                ["screenId"] = screen.ScreenKey,
                ["sensors"] = sensors
            };

            // 7) Add gateway destination if applicable
            if (!string.IsNullOrEmpty(junctionType))
            {
                AddGatewayDestination(payloadDict, junctionType, gatewayDestination, screenId);
            }

            // 8) Determine routing hint and serialize with optional prefix and compression
            string routingHint = (!string.IsNullOrEmpty(junctionType) && junctionType.Contains("Gateway", StringComparison.OrdinalIgnoreCase)) ? "01" : "00";
            object finalPayload = SerializeWithOptionalPrefix(payloadDict, template.IncludePrefixSensor, "sensor", compressPayload, routingHint);

            // 9) Return under the screenId
            result[screenId] = finalPayload;

            return result;
        }

        // Generate matrix-style sensor data payloads for screens
        public async Task<Dictionary<string, object>> GenerateMatrixSensorPayloadsAsync(
            string screenId,
            int sensorCount,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            int startingYOffset,
            string? junctionType = null,
            string? gatewayDestination = null,
            bool compressPayload = false)
        {
            var result = new Dictionary<string, object>();

            // 1) If no sensors are assigned, skip
            if (assignedSensors.Count == 0)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ No assigned sensors for Screen {screenId}. Skipping payload generation.");
                return result;
            }

            // 2) Load template from database
            if (screen.ScreenLayoutId == null)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ❌ Screen {screen.Id} is missing ScreenLayoutId.");
                return result;
            }

            var template = await _layoutsDb.GetTemplateByIdAsync(screen.ScreenLayoutId.Value);
            if (template == null)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ Layout template {screen.ScreenLayoutId.Value} not found for screen {screen.Id}.");
                return result;
            }

            var sensors = new Dictionary<string, object>();

            // 3) Get the sorted sensors, limit by count
            var sortedSensors = assignedSensors
                .OrderBy(s => s.SensorOrder)
                .Take(sensorCount)
                .ToList();

            int offset = startingYOffset;

            // 4) Process each sensor and build matrix-style payload
            foreach (var sensor in sortedSensors)
            {
                var sensorData = new List<object>();

                var cachedSensor = _serviceManagerConnections.GetSensorData(sensor.OriginalId);
                if (cachedSensor != null)
                {
                    // Format the sensor value based on decimal places from template
                    string formattedValue;
                    if (double.TryParse(cachedSensor.Value?.ToString(), out double numericValue))
                    {
                        formattedValue = numericValue.ToString($"F{sensor.DecimalPlaces}");
                    }
                    else
                    {
                        // If value is not numeric, use as-is
                        formattedValue = cachedSensor.Value?.ToString() ?? "";
                    }

                    // Create the text with formatted value
                    string text = $"{sensor.SensorTag}: {formattedValue} {cachedSensor.Unit}";

                    sensorData.Add(new { text });

                    sensors[sensor.SensorTag] = new
                    {
                        Position = new { x = 0, y = offset },
                        Data = sensorData
                    };

                    // Increment offset for next sensor (8 pixels is font height)
                    offset += 8;
                }
                else
                {
                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ Sensor with OriginalId {sensor.OriginalId} not found in cache.");
                }
            }

            // 5) Create the final payload object
            var payloadDict = new Dictionary<string, object>
            {
                ["type"] = "sensor",
                ["screenId"] = screen.ScreenKey,
                ["sensors"] = sensors
            };

            // 6) Add gateway destination if applicable
            if (!string.IsNullOrEmpty(junctionType))
            {
                AddGatewayDestination(payloadDict, junctionType, gatewayDestination, screenId);
            }

            // 7) Determine routing hint and serialize with optional prefix and compression
            string routingHint = (!string.IsNullOrEmpty(junctionType) && junctionType.Contains("Gateway", StringComparison.OrdinalIgnoreCase)) ? "01" : "00";
            object finalPayload = SerializeWithOptionalPrefix(payloadDict, template.IncludePrefixSensor, "matrix sensor", compressPayload, routingHint);

            // 8) Return under the screenId
            result[screenId] = finalPayload;

            return result;
        }

        // Generate gateway command payloads (add_peer, etc.)
        public string SerializeGatewayCommand(
            object command,
            bool includePrefix,
            bool compressPayload = false,
            string routingHint = "01") // Default to forward for gateway commands
        {
            // Convert command object to dictionary format
            var commandDict = new Dictionary<string, object>();

            // Handle the command object (could be anonymous object or dictionary)
            var json = JsonSerializer.Serialize(command);
            using var doc = JsonDocument.Parse(json);
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                var clonedValue = CloneJsonValue(prop.Value);
                if (clonedValue != null)
                    commandDict[prop.Name] = clonedValue;
            }

            // Use the existing SerializeWithOptionalPrefix method
            var result = SerializeWithOptionalPrefix(commandDict, includePrefix, "gateway command", compressPayload, routingHint);

            // Gateway commands are always strings (not binary), so cast appropriately
            return result as string ?? throw new InvalidOperationException("Gateway command serialization failed");
        }

        // Generate frame payloads for screens using FrameEngine (Pre-Rendered Frames Mode)
        public async Task<Dictionary<string, object>> GenerateFramePayloadsAsync(
            string screenKey,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            Model_JunctionScreenLayout? screenOverride = null,
            int? junctionId = null,
            int? linkId = null,
            string? junctionType = null,
            string? gatewayDestination = null,
            bool compressPayload = false)
        {
            var result = new Dictionary<string, object>();

            try
            {
                // 1) Get the frame layout for this screen
                Model_Frame_Layout? frameLayout = null;

                // Check if junction has a specific frame layout override for this screen
                if (screenOverride?.FrameLayoutId.HasValue == true)
                {
                    frameLayout = await _frameLayoutDb.GetFrameLayoutByIdAsync(screenOverride.FrameLayoutId.Value);
                }

                // Fallback to default frame layout based on screen layout type
                if (frameLayout == null && screen.ScreenLayoutId.HasValue)
                {
                    var screenLayout = await _layoutsDb.GetTemplateByIdAsync(screen.ScreenLayoutId.Value);
                    if (screenLayout != null)
                    {
                        // Map screen layout type to frame layout type
                        var frameLayoutType = MapScreenLayoutToFrameLayout(screenLayout.LayoutType);
                        var frameLayouts = await _frameLayoutDb.GetFrameLayoutsByTypeAsync(frameLayoutType);
                        frameLayout = frameLayouts.FirstOrDefault(f => f.IsTemplate);
                    }
                }

                // Ultimate fallback to default PRE_RENDERED_IMAGE layout
                if (frameLayout == null)
                {
                    var defaultFrameLayouts = await _frameLayoutDb.GetFrameLayoutsByTypeAsync("PRE_RENDERED_IMAGE");
                    frameLayout = defaultFrameLayouts.FirstOrDefault(f => f.IsTemplate);
                }

                if (frameLayout == null)
                {
                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ❌ No frame layout found for screen {screenKey}");
                    return result;
                }

                // 2) Build sensor data dictionary from assigned sensors
                var sensorData = new Dictionary<string, object>();

                // Sort sensors by SensorOrder
                var sortedSensors = assignedSensors.OrderBy(s => s.SensorOrder).ToList();

                foreach (var sensor in sortedSensors)
                {
                    // Get the sensor's latest value from the global cache using OriginalId
                    var cachedSensor = _serviceManagerConnections.GetSensorData(sensor.OriginalId);
                    if (cachedSensor != null)
                    {
                        // Format the sensor value based on decimal places
                        string formattedValue;
                        if (double.TryParse(cachedSensor.Value?.ToString(), out double numericValue))
                        {
                            formattedValue = numericValue.ToString($"F{sensor.DecimalPlaces}");
                        }
                        else
                        {
                            formattedValue = cachedSensor.Value?.ToString() ?? "N/A";
                        }

                        // Add unit if present
                        var unit = !string.IsNullOrEmpty(cachedSensor.Unit) ? $" {cachedSensor.Unit}" : "";
                        sensorData[sensor.SensorTag] = $"{formattedValue}{unit}";
                    }
                    else
                    {
                        Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ Sensor with OriginalId {sensor.OriginalId} not found in cache for frame rendering");
                        sensorData[sensor.SensorTag] = "N/A";
                    }
                }

                // 3) Get screen configuration for URL access (if linkId is provided)
                Model_JunctionScreenLayout? screenConfig = null;
                if (linkId.HasValue && screen.Id > 0)
                {
                    try
                    {
                        var screenConfigs = await _junctionLinksService.GetJunctionScreenLayoutsByLinkIdAsync(linkId.Value);
                        screenConfig = screenConfigs.FirstOrDefault(sc => sc.DeviceScreenId == screen.Id);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ Could not get screen configuration: {ex.Message}");
                    }
                }

                // 4) Render the frame using FrameEngine
                var frameBytes = _frameEngine.RenderFrame(frameLayout, sensorData, screenConfig, junctionId, linkId, screen.Id);

                // 5) Handle compression and prefix if needed
                object finalPayload = frameBytes;

                // 6) Add prefix if required
                if (screen.ScreenLayoutId.HasValue)
                {
                    var template = await _layoutsDb.GetTemplateByIdAsync(screen.ScreenLayoutId.Value);
                    if (template?.IncludePrefixSensor == true)
                    {
                        // FRAME type prefix: LLLLTTRR where TT = "02" for Frame data
                        string routingHint = (!string.IsNullOrEmpty(junctionType) &&
                            junctionType.Contains("Gateway", StringComparison.OrdinalIgnoreCase)) ? "01" : "00";

                        var lengthHint = Math.Min(frameBytes.Length, 9999).ToString("D4");
                        var typeField = "02"; // Frame data type
                        var cleanRoutingHint = routingHint.Substring(0, Math.Min(2, routingHint.Length)).PadLeft(2, '0');
                        var prefix = lengthHint + typeField + cleanRoutingHint;

                        var prefixBytes = Encoding.UTF8.GetBytes(prefix);
                        var prefixedFrame = new byte[prefixBytes.Length + frameBytes.Length];
                        Array.Copy(prefixBytes, 0, prefixedFrame, 0, prefixBytes.Length);
                        Array.Copy(frameBytes, 0, prefixedFrame, prefixBytes.Length, frameBytes.Length);

                        finalPayload = prefixedFrame;
                        Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ✅ Added LLLLTTRR prefix '{prefix}' to frame payload (Type: Frame, Route: {cleanRoutingHint})");
                    }
                }

                // 7) Add gateway destination to metadata if applicable
                var payloadWithMetadata = new Dictionary<string, object>();
                if (!string.IsNullOrEmpty(junctionType))
                {
                    AddGatewayDestination(payloadWithMetadata, junctionType, gatewayDestination, screenKey);
                }

                result[screenKey] = finalPayload;

                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ✅ Generated frame payload for {screenKey} using layout {frameLayout.DisplayName} ({frameBytes.Length} bytes)");

                return result;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ❌ Error generating frame payload for {screenKey}: {ex.Message}");
                return result;
            }
        }

        // Helper method to map screen layout types to frame layout types
        private string MapScreenLayoutToFrameLayout(string screenLayoutType)
        {
            return screenLayoutType.ToUpperInvariant() switch
            {
                "MATRIX" => "PRE_RENDERED_IMAGE",
                "DASHBOARD" => "PRE_RENDERED_IMAGE",
                "CHART" => "PRE_RENDERED_IMAGE",
                "QUAD" => "PRE_RENDERED_IMAGE",
                "CALENDAR" => "PRE_RENDERED_IMAGE",
                "IMAGE" => "PRE_RENDERED_IMAGE",
                _ => "PRE_RENDERED_IMAGE" // Default fallback for pre-rendered frames
            };
        }
    }
}