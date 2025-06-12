/*
 * This file is part of Junction Relay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * Junction Relay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Junction Relay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Junction Relay. If not, see <https://www.gnu.org/licenses/>.
 */

using JunctionRelayServer.Models;
using System.Text.Json;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_Payloads
    {
        private readonly Service_Database_Manager_Sensors _sensorDb;
        private readonly Service_Database_Manager_Layouts _layoutsDb;
        private readonly Service_Manager_Connections _serviceManagerConnections;

        public Service_Manager_Payloads(
            Service_Database_Manager_Sensors sensorDb,
            Service_Manager_Connections serviceManagerConnections,
            Service_Database_Manager_Layouts layoutsDb)
        {
            _sensorDb = sensorDb;
            _serviceManagerConnections = serviceManagerConnections;
            _layoutsDb = layoutsDb;
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
            // FIXED: Check for any junction type that contains "Gateway" (case-insensitive)
            if (junctionType.Contains("Gateway", StringComparison.OrdinalIgnoreCase))
            {
                if (!string.IsNullOrEmpty(gatewayDestination))
                {
                    payloadDict["destination"] = gatewayDestination;
                    // Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] 🚀 Adding Gateway destination to {screenKey} -> {gatewayDestination}");
                }
                else
                {
                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ Gateway junction detected but no destination specified for {screenKey}");
                }
            }
        }

        // Refactored to use passed-in device and screen data, and already assigned sensors, now with option to override the template
        public async Task<Dictionary<string, object>> GenerateConfigPayloadsAsync(
            string screenKey,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            Model_Screen_Layout? overrideTemplate = null,
            string? junctionType = null,
            string? gatewayDestination = null)
        {
            var result = new Dictionary<string, object>();

            // 0) Ensure there's a ScreenLayoutId
            if (screen.ScreenLayoutId == null)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ❌ Screen {screen.Id} is missing ScreenLayoutId.");
                return result;
            }

            // 1) Load or override the template
            Model_Screen_Layout? template;
            if (overrideTemplate != null)
            {
                template = overrideTemplate;
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] Using provided template override for screen {screen.ScreenKey}");
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

            // 2) Sort sensors (treat null as empty list)
            var sortedSensors = (assignedSensors ?? new List<Model_Sensor>())
                .OrderBy(s => s.SensorOrder)
                .ToList();

            // 3) Build base config dictionary from JsonLayoutConfig + template props
            var configDict = new Dictionary<string, object>();
            if (!string.IsNullOrWhiteSpace(template.JsonLayoutConfig))
            {
                try
                {
                    // Parse the JSON and deep‐clone each value before disposing
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

            // 4) Determine layoutKey (CUSTOM stays special)
            string layoutKey;
            if (template.LayoutType.Equals("CUSTOM", StringComparison.OrdinalIgnoreCase))
            {
                layoutKey = string.IsNullOrEmpty(template.CustomLayoutType)
                    ? "custom"
                    : template.CustomLayoutType.ToLowerInvariant();
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] Using custom layout type '{layoutKey}' for screen {screen.Id}");
            }
            else
            {
                layoutKey = template.LayoutType.ToLowerInvariant();
            }

            // 5) Build a 'layout' array only if there are sensors
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

            // 6) Assemble the payload dictionary
            var payloadDict = new Dictionary<string, object>
            {
                ["type"] = "config",
                ["screenId"] = screen.ScreenKey,
                [layoutKey] = configDict
            };

            // 7) Add gateway destination if applicable
            if (!string.IsNullOrEmpty(junctionType))
            {
                AddGatewayDestination(payloadDict, junctionType, gatewayDestination, screenKey);
            }

            if (layoutItems != null)
            {
                payloadDict["layout"] = layoutItems;
            }

            // 8) Serialize to JSON with an 8-digit length prefix
            var json = JsonSerializer.Serialize(payloadDict);
            var prefix = json.Length.ToString().PadLeft(8, '0');
            var finalPayload = prefix + json;

            // 9) Return under the screenKey
            result[screenKey] = finalPayload;
            Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ✅ Created {template.LayoutType} config payload for {screenKey} (length: {json.Length})");

            return result;
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

        public Task<Dictionary<string, object>> GenerateMQTTSubscriptionConfigPayloadsAsync(
            string screenKey,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            string? junctionType = null,
            string? gatewayDestination = null)
        {
            var result = new Dictionary<string, object>();

            // If no sensors are assigned, skip
            if (assignedSensors.Count == 0)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ Screen {screen.Id} has no assigned sensors. Skipping.");
                return Task.FromResult(new Dictionary<string, object>()); // Return empty if no sensors are assigned
            }

            // Create a list of subscriptions based on MQTTTopic from each sensor
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

            // Generate the payload object for MQTT subscriptions
            var payloadDict = new Dictionary<string, object>
            {
                ["type"] = "MQTT_Subscription_Request",
                ["screenId"] = screen.ScreenKey,
                ["subscriptions"] = subscriptions
            };

            // Add gateway destination if applicable
            if (!string.IsNullOrEmpty(junctionType))
            {
                AddGatewayDestination(payloadDict, junctionType, gatewayDestination, screenKey);
            }

            // Serialize and prefix with length
            string json = System.Text.Json.JsonSerializer.Serialize(payloadDict);
            string finalPayload = json.Length.ToString().PadLeft(8, '0') + json;

            result[screenKey] = finalPayload;
            Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] Subscription Payload for {screenKey}: {finalPayload}");

            return Task.FromResult(result);
        }

        public Task<Dictionary<string, object>> GenerateSensorPayloadsAsync(
            string screenId,
            int sensorCount,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            string? junctionType = null,
            string? gatewayDestination = null)
        {
            var result = new Dictionary<string, object>();
            // Ensure we have assigned sensors to work with
            if (assignedSensors.Count == 0)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ No assigned sensors for Screen {screenId}. Skipping payload generation.");
                return Task.FromResult(result);
            }
            // Fetch the screen's layout template (for GRID or QUAD layout)
            var template = screen.Template;
            if (template == null)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ Screen {screenId} has no layout template.");
                return Task.FromResult(result);
            }

            // Get decimal places from template, default to 0 if null
            int decimalPlaces = template.DecimalPlaces ?? 0;

            // Create a dictionary to hold the sensor data in the desired structure
            var sensors = new Dictionary<string, object>();
            // Sort the assigned sensors by SensorOrder before processing
            var sortedSensors = assignedSensors
                .OrderBy(s => s.SensorOrder)
                .Take(sensorCount)
                .ToList();
            // Iterate over the sorted sensors and create the payloads
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
                        formattedValue = numericValue.ToString($"F{decimalPlaces}");
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

            // Create the final payload object in the desired structure
            var payloadDict = new Dictionary<string, object>
            {
                ["type"] = "sensor",
                ["screenId"] = screen.ScreenKey,
                ["sensors"] = sensors
            };

            // Add gateway destination if applicable
            if (!string.IsNullOrEmpty(junctionType))
            {
                AddGatewayDestination(payloadDict, junctionType, gatewayDestination, screenId);
            }

            // Serialize the object to JSON and prefix with length
            string json = System.Text.Json.JsonSerializer.Serialize(payloadDict);
            string finalPayload = json.Length.ToString().PadLeft(8, '0') + json;
            result[screenId] = finalPayload;
            return Task.FromResult(result);
        }

        public Task<Dictionary<string, object>> GenerateMatrixSensorPayloadsAsync(
            string screenId,
            int sensorCount,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            int startingYOffset,
            string? junctionType = null,
            string? gatewayDestination = null)
        {
            var result = new Dictionary<string, object>();
            // If no sensors are assigned, skip
            if (assignedSensors.Count == 0)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ No assigned sensors for Screen {screenId}. Skipping payload generation.");
                return Task.FromResult(result);
            }
            // Ensure the screen has a template
            var template = screen.Template;
            if (template == null)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS] ⚠️ Screen {screenId} has no layout template.");
                return Task.FromResult(result);
            }

            // Get decimal places from template, default to 0 if null
            int decimalPlaces = template.DecimalPlaces ?? 0;

            var sensors = new Dictionary<string, object>();
            // Get the sorted sensors, limit by count
            var sortedSensors = assignedSensors
                .OrderBy(s => s.SensorOrder)
                .Take(sensorCount)
                .ToList();
            int offset = startingYOffset;
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
                        formattedValue = numericValue.ToString($"F{decimalPlaces}");
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

            // Create the final payload object
            var payloadDict = new Dictionary<string, object>
            {
                ["type"] = "sensor",
                ["screenId"] = screen.ScreenKey,
                ["sensors"] = sensors
            };

            // Add gateway destination if applicable
            if (!string.IsNullOrEmpty(junctionType))
            {
                AddGatewayDestination(payloadDict, junctionType, gatewayDestination, screenId);
            }

            string json = System.Text.Json.JsonSerializer.Serialize(payloadDict);
            string finalPayload = json.Length.ToString().PadLeft(8, '0') + json;
            result[screenId] = finalPayload;
            return Task.FromResult(result);
        }
    }
}