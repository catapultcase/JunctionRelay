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

namespace JunctionRelayServer.Services
{
    public class Service_Manager_Payloads_FrameEngine
    {
        private readonly Service_Database_Manager_FrameEngine _frameLayoutDb;
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly Service_Manager_Connections _serviceManagerConnections;
        private readonly Service_Database_Manager_Layouts _layoutsDb;
        private readonly Service_Manager_Payloads_Prefix _prefixService;
        private readonly Service_Manager_Events _eventManager;

        public Service_Manager_Payloads_FrameEngine(
            Service_Database_Manager_FrameEngine frameLayoutDb,
            IHttpContextAccessor httpContextAccessor,
            Service_Manager_Connections serviceManagerConnections,
            Service_Database_Manager_Layouts layoutsDb,
            Service_Manager_Payloads_Prefix prefixService,
            Service_Manager_Events eventManager)
        {
            _frameLayoutDb = frameLayoutDb;
            _httpContextAccessor = httpContextAccessor;
            _serviceManagerConnections = serviceManagerConnections;
            _layoutsDb = layoutsDb;
            _prefixService = prefixService;
            _eventManager = eventManager;
        }

        public async Task<Model_PayloadResultCollection> GenerateFrameEngineConfigPayloadsAsync(
            string screenKey,
            List<Model_Sensor> assignedSensors,
            Model_Device_Screens screen,
            Model_JunctionScreenLayout? screenOverride = null,
            string? junctionType = null,
            string? gatewayDestination = null,
            bool compressPayload = false)
        {
            var result = new Model_PayloadResultCollection();

            try
            {
                Model_Frame_Layout? frameLayout = null;

                if (screen.DeviceId < 0)
                {
                    if (screen.FrameLayoutId.HasValue)
                    {
                        frameLayout = await _frameLayoutDb.GetFrameLayoutByIdAsync(screen.FrameLayoutId.Value);
                        Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_FRAMEENGINE] ℹ️ DeviceId < 0 — using screen.FrameLayoutId {screen.FrameLayoutId.Value} for {screenKey}");
                    }

                    if (frameLayout == null)
                    {
                        Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_FRAMEENGINE] ❌ DeviceId < 0 but no FrameLayoutId found for {screenKey}");
                        return result;
                    }
                }
                else
                {
                    if (screenOverride?.FrameLayoutId.HasValue == true)
                    {
                        frameLayout = await _frameLayoutDb.GetFrameLayoutByIdAsync(screenOverride.FrameLayoutId.Value);
                        Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_FRAMEENGINE] ℹ️ Using override FrameLayoutId {screenOverride.FrameLayoutId.Value} for {screenKey}");
                    }

                    if (frameLayout == null)
                    {
                        var riveLayouts = await _frameLayoutDb.GetFrameLayoutsByTypeAsync("COMPOSITE_MODE");
                        frameLayout = riveLayouts.FirstOrDefault(f => f.IsTemplate);
                    }

                    if (frameLayout == null)
                    {
                        Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_FRAMEENGINE] ❌ No Rive frame layout found for screen {screenKey}");
                        return result;
                    }
                }

                object? frameConfig = null;
                object? frameElements = null;

                if (!string.IsNullOrWhiteSpace(frameLayout.JsonFrameConfigRuntime))
                {
                    try
                    {
                        using var configDoc = JsonDocument.Parse(frameLayout.JsonFrameConfigRuntime);
                        var rootElement = configDoc.RootElement;

                        // Extract just the frameConfig property
                        if (rootElement.TryGetProperty("frameConfig", out var innerFrameConfig))
                        {
                            frameConfig = CloneJsonValue(innerFrameConfig);

                            // Add fileUrl directly to the existing rive object
                            if (!string.IsNullOrEmpty(frameLayout.RiveFile) && frameConfig is Dictionary<string, object> configDict)
                            {
                                if (configDict.TryGetValue("rive", out var riveObj) && riveObj is Dictionary<string, object> riveDict)
                                {
                                    var baseUrl = GetServerBaseUrl();
                                    riveDict["fileUrl"] = $"{baseUrl}/api/frameengine/rive-files/{frameLayout.RiveFile}/content";
                                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_FRAMEENGINE] ✅ Added fileUrl to existing rive object for {screenKey}");
                                }
                            }
                        }
                    }
                    catch (JsonException ex)
                    {
                        Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_FRAMEENGINE] ⚠️ Invalid JsonFrameConfigRuntime for frame layout {frameLayout.Id}: {ex.Message}");
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
                        Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_FRAMEENGINE] ⚠️ Invalid JsonFrameElements for frame layout {frameLayout.Id}: {ex.Message}");
                    }
                }

                var payloadDict = new Dictionary<string, object>
                {
                    ["type"] = "rive_config",
                    ["screenId"] = screen.ScreenKey
                };

                if (frameConfig != null)
                {
                    payloadDict["frameConfig"] = frameConfig;
                }

                if (frameElements != null)
                {
                    payloadDict["frameElements"] = frameElements;
                }

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
                    PayloadType = "rive_config"
                };

                result.AddResult(screenKey, payloadResult);

                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_FRAMEENGINE] ✅ Created Rive config payload for {screenKey} using layout {frameLayout.DisplayName}");

                return result;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_FRAMEENGINE] ❌ Error generating Rive config payload for {screenKey}: {ex.Message}");
                return result;
            }
        }

        public async Task<Model_PayloadResultCollection> GenerateFrameEngineSensorPayloadsAsync(
    string screenKey,
    List<Model_Sensor> assignedSensors,
    Model_Device_Screens screen,
    string? junctionType = null,
    string? gatewayDestination = null,
    bool compressPayload = false)
        {
            var result = new Model_PayloadResultCollection();

            try
            {
                if (assignedSensors.Count == 0)
                {
                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_FRAMEENGINE] ⚠️ No assigned sensors for Rive screen {screenKey}. Skipping payload generation.");
                    return result;
                }

                var sensorData = new Dictionary<string, object>();

                var sortedSensors = assignedSensors.OrderBy(s => s.SensorOrder).ToList();

                foreach (var sensor in sortedSensors)
                {
                    bool sensorDataFound = false;
                    object formattedValue = "N/A";
                    string unit = "";

                    if (sensor.IsCustomJunctionSensor)
                    {
                        // Handle custom junction sensors
                        if (double.TryParse(sensor.Value?.ToString(), out double numericValue))
                        {
                            formattedValue = Math.Round(numericValue, sensor.DecimalPlaces);
                        }
                        else
                        {
                            formattedValue = sensor.Value?.ToString() ?? "N/A";
                        }
                        unit = sensor.Unit ?? "";
                        sensorDataFound = true;
                    }
                    else if (sensor.IsEventSensor)
                    {
                        // Handle event sensors - get latest values from event cache
                        var eventSensor = await _eventManager.GetEventSensorAsync(sensor.OriginalId);
                        if (eventSensor != null)
                        {
                            if (double.TryParse(eventSensor.Value?.ToString(), out double numericValue))
                            {
                                formattedValue = Math.Round(numericValue, sensor.DecimalPlaces);
                            }
                            else
                            {
                                formattedValue = eventSensor.Value?.ToString() ?? "N/A";
                            }
                            unit = eventSensor.Unit ?? "";
                            sensorDataFound = true;
                        }
                    }
                    else
                    {
                        // Handle regular device/collector sensors
                        var cachedSensor = _serviceManagerConnections.GetSensorData(sensor.OriginalId);
                        if (cachedSensor != null)
                        {
                            if (double.TryParse(cachedSensor.Value?.ToString(), out double numericValue))
                            {
                                formattedValue = Math.Round(numericValue, sensor.DecimalPlaces);
                            }
                            else
                            {
                                formattedValue = cachedSensor.Value?.ToString() ?? "N/A";
                            }
                            unit = cachedSensor.Unit ?? "";
                            sensorDataFound = true;
                        }
                    }

                    // Only log if sensor wasn't found in any of the 3 locations
                    if (!sensorDataFound)
                    {
                        Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_FRAMEENGINE] ⚠️ Sensor {sensor.SensorTag} (OriginalId: {sensor.OriginalId}) not found in any cache for FrameEngine rendering");
                        formattedValue = 0;
                        unit = "";
                    }

                    sensorData[sensor.SensorTag] = new
                    {
                        value = formattedValue,
                        unit = unit
                    };
                }

                var payloadDict = new Dictionary<string, object>
                {
                    ["type"] = "rive_sensor",
                    ["screenId"] = screen.ScreenKey,
                    ["sensors"] = sensorData
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
                    PayloadType = "rive_sensor"
                };

                result.AddResult(screenKey, payloadResult);

                return result;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_FRAMEENGINE] ❌ Error generating Rive sensor payload for {screenKey}: {ex.Message}");
                return result;
            }
        }        

        private string GetServerBaseUrl()
        {
            var httpContext = _httpContextAccessor.HttpContext;
            string? scheme = "http";
            string? hostValue = null;

            if (httpContext?.Request != null)
            {
                var request = httpContext.Request;
                scheme = request.Scheme;
                hostValue = request.Host.Host;
            }

            try
            {
                // Always resolve the true LAN/WAN IP, not "localhost"
                var host = System.Net.Dns.GetHostEntry(System.Net.Dns.GetHostName());
                var localIP = host.AddressList
                    .FirstOrDefault(ip =>
                        ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork &&
                        !System.Net.IPAddress.IsLoopback(ip) &&
                        !ip.ToString().StartsWith("169.254") // ignore link-local
                    );

                if (localIP != null)
                {
                    var port = httpContext?.Request?.Host.Port ?? 7180;
                    return $"{scheme}://{localIP}:{port}";
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_FRAMEENGINE] Could not auto-detect IP: {ex.Message}");
            }

            // As a last fallback, return the hostname instead of localhost
            var machineName = System.Net.Dns.GetHostName();
            return $"{scheme}://{machineName}:7180";
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
                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_FRAMEENGINE] ⚠️ Gateway junction detected but no destination specified for {screenKey}");
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