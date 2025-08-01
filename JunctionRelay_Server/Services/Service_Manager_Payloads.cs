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

        public Service_Manager_Payloads(
            Service_Database_Manager_Sensors sensorDb,
            Service_Manager_Connections serviceManagerConnections,
            Service_Database_Manager_Layouts layoutsDb,
            Service_FrameEngine frameEngine,
            Service_Database_Manager_FrameEngine frameLayoutDb,
            Service_Database_Manager_JunctionLinks junctionLinksService)
        {
            _sensorDb = sensorDb;
            _serviceManagerConnections = serviceManagerConnections;
            _layoutsDb = layoutsDb;
            _frameEngine = frameEngine;
            _frameLayoutDb = frameLayoutDb;
            _junctionLinksService = junctionLinksService;
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

            // Debug input parameters
            //Console.WriteLine($"[DEBUG] SerializeWithOptionalPrefix parameters:");
            //Console.WriteLine($"  - includePrefix: {includePrefix}");
            //Console.WriteLine($"  - compressPayload: {compressPayload}");
            //Console.WriteLine($"  - routingHint: '{routingHint}'");
            //Console.WriteLine($"  - json.Length: {json.Length}");

            if (compressPayload)
            {
                var compressedData = CompressData(json);
                var originalSize = Encoding.UTF8.GetByteCount(json);
                var compressedSize = compressedData.Length;
                var compressionRatio = (1.0 - (double)compressedSize / originalSize) * 100;

                // Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] 🗜️ Compressed {payloadType} payload: {originalSize}→{compressedSize} bytes ({compressionRatio:F1}% reduction)");

                if (includePrefix)
                {
                    // FIXED: LLLLTTRR format: Length(4) + Type(01=Gzip) + Route(2)
                    var lengthHint = Math.Min(compressedData.Length, 9999).ToString("D4");
                    var typeField = "01"; // Gzip
                    var cleanRoutingHint = routingHint.Substring(0, Math.Min(2, routingHint.Length)).PadLeft(2, '0');
                    var prefix = lengthHint + typeField + cleanRoutingHint;

                    // Debug prefix components
                    //Console.WriteLine($"[DEBUG] Compressed prefix components:");
                    //Console.WriteLine($"  - lengthHint: '{lengthHint}' (4 chars)");
                    //Console.WriteLine($"  - typeField: '{typeField}' (2 chars)");
                    //Console.WriteLine($"  - cleanRoutingHint: '{cleanRoutingHint}' (2 chars)");
                    //Console.WriteLine($"  - Final prefix: '{prefix}' (8 chars total)");

                    var prefixBytes = Encoding.UTF8.GetBytes(prefix);
                    var result = new byte[prefixBytes.Length + compressedData.Length];
                    Array.Copy(prefixBytes, 0, result, 0, prefixBytes.Length);
                    Array.Copy(compressedData, 0, result, prefixBytes.Length, compressedData.Length);

                    // Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ✅ Added LLLLTTRR prefix '{prefix}' to compressed {payloadType} payload (Type: Gzip, Route: {cleanRoutingHint})");
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

                    // Debug prefix components
                    //Console.WriteLine($"[DEBUG] JSON prefix components:");
                    //Console.WriteLine($"  - lengthHint: '{lengthHint}' (4 chars)");
                    //Console.WriteLine($"  - typeField: '{typeField}' (2 chars)");
                    //Console.WriteLine($"  - cleanRoutingHint: '{cleanRoutingHint}' (2 chars)");
                    //Console.WriteLine($"  - Final prefix: '{prefix}' (8 chars total)");

                    // Validate prefix format
                    if (prefix.Length != 8)
                    {
                        Console.WriteLine($"[ERROR] Prefix wrong length: {prefix.Length} (expected 8)");
                    }

                    for (int i = 0; i < prefix.Length; i++)
                    {
                        if (!char.IsDigit(prefix[i]))
                        {
                            Console.WriteLine($"[ERROR] Non-digit at position {i}: '{prefix[i]}'");
                        }
                    }

                    // Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ✅ Added LLLLTTRR prefix '{prefix}' to {payloadType} payload (Type: JSON, Route: {cleanRoutingHint})");
                    return prefix + json;
                }
                else
                {
                    // Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ℹ️ No prefix added to {payloadType} payload");
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
                // Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] Using provided template override for screen {screen.ScreenKey}");
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

            //// 3) Get decimal places from template, default to 0 if null
            //int decimalPlaces = template.DecimalPlaces ?? 0;

            // 4) Create a dictionary to hold the sensor data in the desired structure
            var sensors = new Dictionary<string, object>();

            // 5) Sort the assigned sensors by SensorOrder before processing
            var sortedSensors = assignedSensors
                .OrderBy(s => s.SensorOrder)
                .Take(sensorCount)
                .ToList();

            // 6) Iterate over the sorted sensors and create the payloads
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

            // 7) Create the final payload object in the desired structure
            var payloadDict = new Dictionary<string, object>
            {
                ["type"] = "sensor",
                ["screenId"] = screen.ScreenKey,
                ["sensors"] = sensors
            };

            // 8) Add gateway destination if applicable
            if (!string.IsNullOrEmpty(junctionType))
            {
                AddGatewayDestination(payloadDict, junctionType, gatewayDestination, screenId);
            }

            // 9) Determine routing hint and serialize with optional prefix and compression
            string routingHint = (!string.IsNullOrEmpty(junctionType) && junctionType.Contains("Gateway", StringComparison.OrdinalIgnoreCase)) ? "01" : "00";
            object finalPayload = SerializeWithOptionalPrefix(payloadDict, template.IncludePrefixSensor, "sensor", compressPayload, routingHint);

            // 10) Return under the screenId
            result[screenId] = finalPayload;
            // Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ✅ Created sensor payload for {screenId}");

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

            // 3) Get decimal places from template, default to 0 if null
            // int decimalPlaces = template.DecimalPlaces ?? 0;

            var sensors = new Dictionary<string, object>();

            // 4) Get the sorted sensors, limit by count
            var sortedSensors = assignedSensors
                .OrderBy(s => s.SensorOrder)
                .Take(sensorCount)
                .ToList();

            int offset = startingYOffset;

            // 5) Process each sensor and build matrix-style payload
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

            // 6) Create the final payload object
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
            object finalPayload = SerializeWithOptionalPrefix(payloadDict, template.IncludePrefixSensor, "matrix sensor", compressPayload, routingHint);

            // 9) Return under the screenId
            result[screenId] = finalPayload;
            // Console.WriteLine($"[SERVICE_MANAGER_PAYLOAD] ✅ Created matrix sensor payload for {screenId}");

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

        // Generate frame payloads for screens using FrameEngine
        public async Task<Dictionary<string, object>> GenerateFramePayloadsAsync(
    string screenKey,
    List<Model_Sensor> assignedSensors,
    Model_Device_Screens screen,
    Model_JunctionScreenLayout? screenOverride = null,
    int? junctionId = null, // Add this parameter
    int? linkId = null, // Add this parameter
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

                // Ultimate fallback to default sensor grid
                if (frameLayout == null)
                {
                    var defaultFrameLayouts = await _frameLayoutDb.GetFrameLayoutsByTypeAsync("FRAME_SENSOR_GRID");
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

                // 4) Render the frame using FrameEngine with new signature
                var frameBytes = _frameEngine.RenderFrame(frameLayout, sensorData, screenConfig, junctionId, linkId, screen.Id);

                // 5) Handle compression and prefix if needed
                object finalPayload;
                if (compressPayload)
                {
                    // For frames, we could optionally compress the PNG data further
                    // For now, PNG is already compressed, so we'll use as-is
                    finalPayload = frameBytes;
                }
                else
                {
                    finalPayload = frameBytes;
                }

                // 6) Add prefix if required (similar to existing logic)
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

                // Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ✅ Generated frame payload for {screenKey} using layout {frameLayout.DisplayName} ({frameBytes.Length} bytes)");

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
                "MATRIX" => "FRAME_SENSOR_GRID",
                "DASHBOARD" => "FRAME_DASHBOARD",
                "CHART" => "FRAME_CHART",
                "QUAD" => "FRAME_QUAD",
                "CALENDAR" => "FRAME_CALENDAR",
                "IMAGE" => "FRAME_IMAGE",
                _ => "FRAME_SENSOR_GRID" // Default fallback
            };
        }

    }
}