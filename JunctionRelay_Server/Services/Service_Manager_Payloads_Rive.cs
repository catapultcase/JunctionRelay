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
    // Specialized generator for Rive animation payloads (config and sensor data)

    public class Service_Manager_Payloads_Rive
    {
        private readonly Service_Database_Manager_FrameEngine _frameLayoutDb;
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly Service_Manager_Connections _serviceManagerConnections;
        private readonly Service_Database_Manager_Layouts _layoutsDb;

        public Service_Manager_Payloads_Rive(
            Service_Database_Manager_FrameEngine frameLayoutDb,
            IHttpContextAccessor httpContextAccessor,
            Service_Manager_Connections serviceManagerConnections,
            Service_Database_Manager_Layouts layoutsDb)
        {
            _frameLayoutDb = frameLayoutDb;
            _httpContextAccessor = httpContextAccessor;
            _serviceManagerConnections = serviceManagerConnections;
            _layoutsDb = layoutsDb;
        }

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


                // Do not perform override for virtual puppet screens
                if (screen.DeviceId < 0)
                {
                    if (screen.FrameLayoutId.HasValue)
                    {
                        frameLayout = await _frameLayoutDb.GetFrameLayoutByIdAsync(screen.FrameLayoutId.Value);
                        Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_RIVE] ℹ️ DeviceId < 0 — using screen.FrameLayoutId {screen.FrameLayoutId.Value} for {screenKey}");
                    }

                    if (frameLayout == null)
                    {
                        Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_RIVE] ❌ DeviceId < 0 but no FrameLayoutId found for {screenKey}");
                        return result; // stop here, no fallback
                    }
                }
                else
                {
                    // Normal path: check if junction has a specific frame layout override for this screen
                    if (screenOverride?.FrameLayoutId.HasValue == true)
                    {
                        frameLayout = await _frameLayoutDb.GetFrameLayoutByIdAsync(screenOverride.FrameLayoutId.Value);
                        Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_RIVE] ℹ️ Using override FrameLayoutId {screenOverride.FrameLayoutId.Value} for {screenKey}");
                    }

                    // Fallback to default Rive layout (template)
                    if (frameLayout == null)
                    {
                        var riveLayouts = await _frameLayoutDb.GetFrameLayoutsByTypeAsync("COMPOSITE_MODE");
                        frameLayout = riveLayouts.FirstOrDefault(f => f.IsTemplate);
                    }

                    if (frameLayout == null)
                    {
                        Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_RIVE] ❌ No Rive frame layout found for screen {screenKey}");
                        return result;
                    }
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

                        // Add Rive file URL reference if available
                        if (!string.IsNullOrEmpty(frameLayout.RiveFile))
                        {
                            frameConfig = AddRiveFileReference(frameConfig, frameLayout.RiveFile);
                            Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_RIVE] ✅ Added Rive file URL reference '{frameLayout.RiveFile}' for {screenKey}");
                        }
                    }
                    catch (JsonException ex)
                    {
                        Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_RIVE] ⚠️ Invalid JsonFrameConfig for frame layout {frameLayout.Id}: {ex.Message}");
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
                        Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_RIVE] ⚠️ Invalid JsonFrameElements for frame layout {frameLayout.Id}: {ex.Message}");
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

                // Add metadata about Rive file reference
                if (!string.IsNullOrEmpty(frameLayout.RiveFile))
                {
                    payloadDict["riveFile"] = frameLayout.RiveFile;
                    payloadDict["riveFileReference"] = frameLayout.RiveFile;
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

                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_RIVE] ✅ Created Rive config payload for {screenKey} using layout {frameLayout.DisplayName}");

                return result;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_RIVE] ❌ Error generating Rive config payload for {screenKey}: {ex.Message}");
                return result;
            }
        }

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
                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_RIVE] ⚠️ No assigned sensors for Rive screen {screenKey}. Skipping payload generation.");
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
                        Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_RIVE] ⚠️ Sensor with OriginalId {sensor.OriginalId} not found in cache for Rive rendering");
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
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_RIVE] ❌ Error generating Rive sensor payload for {screenKey}: {ex.Message}");
                return result;
            }
        }

        // Helper methods
        private object? AddRiveFileReference(object? configObject, string riveFileName)
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

                // Add Rive file URL reference
                var baseUrl = GetServerBaseUrl();
                riveDict["file"] = riveFileName;
                riveDict["fileUrl"] = $"{baseUrl}/api/frameengine/rive-files/{riveFileName}/content";
                riveDict["embedded"] = false;

                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_RIVE] Generated Rive URL: {riveDict["fileUrl"]}");

                // Update the nested structure
                frameConfigDict["rive"] = riveDict;
                configDict["frameConfig"] = frameConfigDict;

                // Convert back to the original object structure
                return CloneJsonValue(JsonDocument.Parse(JsonSerializer.Serialize(configDict)).RootElement);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_RIVE] ⚠️ Error adding Rive file reference {riveFileName} to config: {ex.Message}");
                return configObject;
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
                    return $"http://{localIP}:7180";
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_RIVE] Could not auto-detect IP: {ex.Message}");
            }

            return "http://localhost:7180";
        }

        // Shared utility methods
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
                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_RIVE] ⚠️ Gateway junction detected but no destination specified for {screenKey}");
                }
            }
        }

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

        private object SerializeWithOptionalPrefix(Dictionary<string, object> payloadDict, bool includePrefix, string payloadType, bool compressPayload = false, string routingHint = "00")
        {
            var json = JsonSerializer.Serialize(payloadDict, new JsonSerializerOptions
            {
                WriteIndented = false
            });

            if (compressPayload)
            {
                var compressedData = CompressData(json);

                if (includePrefix)
                {
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
                if (includePrefix)
                {
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
    }
}