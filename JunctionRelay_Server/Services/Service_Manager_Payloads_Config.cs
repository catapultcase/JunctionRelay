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
using Microsoft.AspNetCore.Http;
using System.Text;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_Payloads_Config
    {
        private readonly Service_Database_Manager_Layouts _layoutsDb;
        private readonly Service_FrameEngine _frameEngine;
        private readonly Service_Database_Manager_FrameEngine _frameLayoutDb;
        private readonly Service_Database_Manager_JunctionLinks _junctionLinksService;
        private readonly Service_Manager_Connections _serviceManagerConnections;
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly Service_Manager_Payloads_Prefix _prefixService;

        public Service_Manager_Payloads_Config(
            Service_Database_Manager_Layouts layoutsDb,
            Service_FrameEngine frameEngine,
            Service_Database_Manager_FrameEngine frameLayoutDb,
            Service_Database_Manager_JunctionLinks junctionLinksService,
            Service_Manager_Connections serviceManagerConnections,
            IHttpContextAccessor httpContextAccessor,
            Service_Manager_Payloads_Prefix prefixService)
        {
            _layoutsDb = layoutsDb;
            _frameEngine = frameEngine;
            _frameLayoutDb = frameLayoutDb;
            _junctionLinksService = junctionLinksService;
            _serviceManagerConnections = serviceManagerConnections;
            _httpContextAccessor = httpContextAccessor;
            _prefixService = prefixService;
        }

        public async Task<Model_PayloadResultCollection> GenerateConfigPayloadsAsync(
            string screenKey,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            Model_Screen_Layout? overrideTemplate = null,
            string? junctionType = null,
            string? gatewayDestination = null,
            bool compressPayload = false)
        {
            var result = new Model_PayloadResultCollection();

            if (screen.ScreenLayoutId == null)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_CONFIG] ❌ Screen {screen.Id} is missing ScreenLayoutId.");
                return result;
            }

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
                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_CONFIG] ⚠️ Layout template {screen.ScreenLayoutId.Value} not found for screen {screen.Id}.");
                    return result;
                }
            }

            var sortedSensors = (assignedSensors ?? new List<Model_Sensor>())
                .OrderBy(s => s.SensorOrder)
                .ToList();

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
                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_CONFIG] ⚠️ Invalid JsonLayoutConfig for screen {screen.Id}: {ex.Message}");
                }
            }
            AddAllTemplateProperties(template, configDict);

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

            var payloadDict = new Dictionary<string, object>
            {
                ["type"] = "config",
                ["screenId"] = screen.ScreenKey,
                [layoutKey] = configDict
            };

            if (!string.IsNullOrEmpty(junctionType))
            {
                AddGatewayDestination(payloadDict, junctionType, gatewayDestination, screenKey);
            }

            if (layoutItems != null)
            {
                payloadDict["layout"] = layoutItems;
            }

            // Generate uncompressed JSON first
            string uncompressedJson = JsonSerializer.Serialize(payloadDict);
            string uncompressedPrefix = ExtractStringPrefix(uncompressedJson);

            // Generate binary payload
            var routing = _prefixService.DetermineRouting(junctionType);
            byte[] binaryPayload = _prefixService.CreateDataMessage(payloadDict, routing,
                Service_Manager_Payloads_Prefix.SerializationFormat.Json, compressPayload);

            // Extract compressed prefix if compression was used
            string compressedPrefix = string.Empty;
            if (compressPayload)
            {
                compressedPrefix = ExtractBinaryPrefix(binaryPayload);
            }

            var payloadResult = new Model_PayloadResult
            {
                BinaryPayload = binaryPayload,
                UncompressedJson = uncompressedJson,
                UncompressedPrefix = uncompressedPrefix,
                CompressedPrefix = compressedPrefix,
                IsCompressed = compressPayload,
                PayloadType = "config"
            };

            result.AddResult(screenKey, payloadResult);
            Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_CONFIG] ✅ Created {template.LayoutType} config payload for {screenKey}");

            return result;
        }

        public async Task<Model_PayloadResultCollection> GenerateMQTTSubscriptionConfigPayloadsAsync(
            string screenKey,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            string? junctionType = null,
            string? gatewayDestination = null,
            bool compressPayload = false)
        {
            var result = new Model_PayloadResultCollection();

            if (assignedSensors.Count == 0)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_CONFIG] ⚠️ Screen {screen.Id} has no assigned sensors. Skipping.");
                return result;
            }

            if (screen.ScreenLayoutId == null)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_CONFIG] ❌ Screen {screen.Id} is missing ScreenLayoutId.");
                return result;
            }

            var template = await _layoutsDb.GetTemplateByIdAsync(screen.ScreenLayoutId.Value);
            if (template == null)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_CONFIG] ⚠️ Layout template {screen.ScreenLayoutId.Value} not found for screen {screen.Id}.");
                return result;
            }

            var subscriptions = new List<string>();
            foreach (var sensor in assignedSensors)
            {
                if (!string.IsNullOrEmpty(sensor.MQTTTopic))
                {
                    subscriptions.Add(sensor.MQTTTopic);
                }
                else
                {
                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_CONFIG] ⚠️ Sensor {sensor.SensorTag} does not have an MQTT topic.");
                }
            }

            var payloadDict = new Dictionary<string, object>
            {
                ["type"] = "MQTT_Subscription_Request",
                ["screenId"] = screen.ScreenKey,
                ["subscriptions"] = subscriptions
            };

            if (!string.IsNullOrEmpty(junctionType))
            {
                AddGatewayDestination(payloadDict, junctionType, gatewayDestination, screenKey);
            }

            // Generate uncompressed JSON first
            string uncompressedJson = JsonSerializer.Serialize(payloadDict);
            string uncompressedPrefix = ExtractStringPrefix(uncompressedJson);

            // Generate binary payload
            var routing = _prefixService.DetermineRouting(junctionType);
            byte[] binaryPayload = _prefixService.CreateDataMessage(payloadDict, routing,
                Service_Manager_Payloads_Prefix.SerializationFormat.Json, compressPayload);

            // Extract compressed prefix if compression was used
            string compressedPrefix = string.Empty;
            if (compressPayload)
            {
                compressedPrefix = ExtractBinaryPrefix(binaryPayload);
            }

            var payloadResult = new Model_PayloadResult
            {
                BinaryPayload = binaryPayload,
                UncompressedJson = uncompressedJson,
                UncompressedPrefix = uncompressedPrefix,
                CompressedPrefix = compressedPrefix,
                IsCompressed = compressPayload,
                PayloadType = "mqtt_subscription"
            };

            result.AddResult(screenKey, payloadResult);
            Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_CONFIG] ✅ Created MQTT subscription payload for {screenKey}");

            return result;
        }

        public byte[] SerializeGatewayCommand(
            object command,
            bool compressPayload = false)
        {
            var commandDict = new Dictionary<string, object>();

            var json = JsonSerializer.Serialize(command);
            using var doc = JsonDocument.Parse(json);
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                var clonedValue = CloneJsonValue(prop.Value);
                if (clonedValue != null)
                    commandDict[prop.Name] = clonedValue;
            }

            return _prefixService.CreateCommandMessage(commandDict,
                Service_Manager_Payloads_Prefix.RoutingMode.GATEWAY, compressPayload);
        }

        private void AddIfPresent<T>(Dictionary<string, object> dictionary, string key, T? value)
        {
            if (value == null)
                return;

            if (value is bool boolValue)
            {
                if (boolValue)
                    dictionary[key] = value!;
                return;
            }

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

            if (value is string stringValue)
            {
                if (!string.IsNullOrEmpty(stringValue))
                    dictionary[key] = value!;
                return;
            }

            dictionary[key] = value!;
        }

        private void AddAllTemplateProperties(Model_Screen_Layout template, Dictionary<string, object> dictionary)
        {
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
                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_CONFIG] ⚠️ Gateway junction detected but no destination specified for {screenKey}");
                }
            }
        }

        private string ExtractStringPrefix(string payload)
        {
            // For uncompressed JSON, create a readable summary
            if (string.IsNullOrEmpty(payload))
                return string.Empty;

            return $"JSON: {payload.Length} chars";
        }

        private string ExtractBinaryPrefix(byte[] payload)
        {
            if (payload == null || payload.Length < 8)
                return string.Empty;

            try
            {
                // Parse the binary header to create human-readable prefix
                var (length, type, routing) = Service_Manager_Payloads_Prefix.ParseHeader(payload.Take(8).ToArray());

                string typeName = type switch
                {
                    Service_Manager_Payloads_Prefix.MessageType.DATA => "DATA",
                    Service_Manager_Payloads_Prefix.MessageType.COMMAND => "COMMAND",
                    Service_Manager_Payloads_Prefix.MessageType.BLIT_RGB565 => "BLIT_RGB565",
                    Service_Manager_Payloads_Prefix.MessageType.BLIT_COMPRESSED => "BLIT_COMPRESSED",
                    _ => $"UNKNOWN(0x{(ushort)type:04x})"
                };

                string routingName = routing switch
                {
                    Service_Manager_Payloads_Prefix.RoutingMode.LOCAL => "LOCAL",
                    Service_Manager_Payloads_Prefix.RoutingMode.GATEWAY => "GATEWAY",
                    var r when (ushort)r >= 0x0100 => $"SCREEN_{(ushort)r - 0x0100}",
                    _ => $"UNKNOWN(0x{(ushort)routing:04x})"
                };

                return $"Len={length}, Type={typeName}, Route={routingName}";
            }
            catch
            {
                return $"BINARY: {payload.Length} bytes";
            }
        }
    }
}