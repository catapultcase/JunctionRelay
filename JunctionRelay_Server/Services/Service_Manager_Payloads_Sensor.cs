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
using System.Text;
using System.Text.Json;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_Payloads_Sensor
    {
        private readonly Service_Manager_Connections _serviceManagerConnections;
        private readonly Service_Database_Manager_Layouts _layoutsDb;
        private readonly Service_Manager_Payloads_Prefix _prefixService;
        private readonly Service_Manager_Events _eventManager;

        public Service_Manager_Payloads_Sensor(
            Service_Manager_Connections serviceManagerConnections,
            Service_Database_Manager_Layouts layoutsDb,
            Service_Manager_Payloads_Prefix prefixService,
            Service_Manager_Events eventManager)
        {
            _serviceManagerConnections = serviceManagerConnections;
            _layoutsDb = layoutsDb;
            _prefixService = prefixService;
            _eventManager = eventManager;
        }

        public async Task<Model_PayloadResultCollection> GenerateSensorPayloadsAsync(
    string screenId,
    int sensorCount,
    List<Model_Sensor> assignedSensors,
    Model_Device_Screens screen,
    string? junctionType = null,
    string? gatewayDestination = null,
    bool compressPayload = false)
        {
            var result = new Model_PayloadResultCollection();

            if (assignedSensors.Count == 0)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_SENSOR] ⚠️ No assigned sensors for Screen {screenId}. Skipping payload generation.");
                return result;
            }

            if (screen.ScreenLayoutId == null)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_SENSOR] ❌ Screen {screen.Id} is missing ScreenLayoutId.");
                return result;
            }

            var template = await _layoutsDb.GetTemplateByIdAsync(screen.ScreenLayoutId.Value);
            if (template == null)
            {
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_SENSOR] ⚠️ Layout template {screen.ScreenLayoutId.Value} not found for screen {screen.Id}.");
                return result;
            }

            var fieldsToSend = new[] { "SensorTag", "Value", "Unit" };
            if (!string.IsNullOrEmpty(template.FieldsToSend))
            {
                fieldsToSend = template.FieldsToSend.Split(',')
                    .Select(f => f.Trim())
                    .Where(f => !string.IsNullOrEmpty(f))
                    .ToArray();
            }

            var sensors = new Dictionary<string, object>();

            var sortedSensors = assignedSensors
                .OrderBy(s => s.SensorOrder)
                .Take(sensorCount)
                .ToList();

            foreach (var sensor in sortedSensors)
            {
                bool sensorDataFound = false;
                Model_Sensor? dataSource = null;

                if (sensor.IsCustomJunctionSensor)
                {
                    // Handle custom junction sensors
                    dataSource = sensor; // Use the sensor itself as data source
                    sensorDataFound = true;
                }
                else if (sensor.IsEventSensor)
                {
                    // Handle event sensors - get latest values from event cache
                    var eventSensor = await _eventManager.GetEventSensorAsync(sensor.OriginalId);
                    if (eventSensor != null)
                    {
                        dataSource = eventSensor;
                        sensorDataFound = true;
                    }
                }
                else
                {
                    // Handle regular device/collector sensors
                    var cachedSensor = _serviceManagerConnections.GetSensorData(sensor.OriginalId);
                    if (cachedSensor != null)
                    {
                        dataSource = cachedSensor;
                        sensorDataFound = true;
                    }
                }

                if (sensorDataFound && dataSource != null)
                {
                    var sensorData = BuildSensorData(sensor, dataSource == sensor ? null : dataSource, fieldsToSend);
                    sensors[sensor.SensorTag] = new List<object> { sensorData };
                }
                else
                {
                    // Only log if sensor wasn't found in any of the 3 locations
                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_SENSOR] ⚠️ Sensor {sensor.SensorTag} (OriginalId: {sensor.OriginalId}) not found in any cache for sensor payload");

                    // Still include the sensor but with fallback data
                    var sensorData = BuildSensorData(sensor, null, fieldsToSend);
                    sensors[sensor.SensorTag] = new List<object> { sensorData };
                }
            }

            var payloadDict = new Dictionary<string, object>
            {
                ["type"] = "sensor",
                ["screenId"] = screen.ScreenKey,
                ["sensors"] = sensors
            };

            if (!string.IsNullOrEmpty(junctionType))
            {
                AddGatewayDestination(payloadDict, junctionType, gatewayDestination, screenId);
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
                PayloadType = "sensor"
            };

            result.AddResult(screenId, payloadResult);

            return result;
        }

        private Dictionary<string, object> BuildSensorData(Model_Sensor sensor, Model_Sensor? cachedSensor, string[] fieldsToSend)
        {
            var sensorData = new Dictionary<string, object>();

            foreach (var field in fieldsToSend)
            {
                var fieldName = field.Trim();

                if (fieldName.Equals("SensorTag", StringComparison.OrdinalIgnoreCase))
                    continue;

                object? value = null;

                switch (fieldName)
                {
                    case "Id":
                        value = sensor.Id;
                        break;
                    case "OriginalId":
                        value = sensor.OriginalId;
                        break;
                    case "JunctionId":
                        value = sensor.JunctionId;
                        break;
                    case "JunctionDeviceLinkId":
                        value = sensor.JunctionDeviceLinkId;
                        break;
                    case "JunctionCollectorLinkId":
                        value = sensor.JunctionCollectorLinkId;
                        break;
                    case "SensorOrder":
                        value = sensor.SensorOrder;
                        break;
                    case "MQTTServiceId":
                        value = sensor.MQTTServiceId;
                        break;
                    case "MQTTTopic":
                        value = sensor.MQTTTopic;
                        break;
                    case "MQTTQoS":
                        value = sensor.MQTTQoS;
                        break;
                    case "SensorType":
                        value = sensor.SensorType;
                        break;
                    case "ExternalId":
                        value = sensor.ExternalId;
                        break;
                    case "DeviceName":
                        value = sensor.DeviceName;
                        break;
                    case "Name":
                        value = sensor.Name;
                        break;
                    case "ComponentName":
                        value = sensor.ComponentName;
                        break;
                    case "Category":
                        value = sensor.Category;
                        break;
                    case "Unit":
                        value = cachedSensor?.Unit ?? sensor.Unit;
                        break;
                    case "Value":
                        if (cachedSensor != null && double.TryParse(cachedSensor.Value?.ToString(), out double numericValue))
                        {
                            value = numericValue.ToString($"F{sensor.DecimalPlaces}");
                        }
                        else
                        {
                            if (double.TryParse(sensor.Value?.ToString(), out double sensorNumericValue))
                            {
                                value = sensorNumericValue.ToString($"F{sensor.DecimalPlaces}");
                            }
                            else
                            {
                                value = sensor.Value?.ToString() ?? "N/A";
                            }
                        }
                        break;
                    case "DecimalPlaces":
                        value = sensor.DecimalPlaces;
                        break;
                    case "Formula":
                        value = sensor.Formula;
                        break;
                    case "LastUpdated":
                        value = cachedSensor?.LastUpdated ?? sensor.LastUpdated;
                        break;
                    case "CustomAttribute1":
                        value = sensor.CustomAttribute1;
                        break;
                    case "CustomAttribute2":
                        value = sensor.CustomAttribute2;
                        break;
                    case "CustomAttribute3":
                        value = sensor.CustomAttribute3;
                        break;
                    case "CustomAttribute4":
                        value = sensor.CustomAttribute4;
                        break;
                    case "CustomAttribute5":
                        value = sensor.CustomAttribute5;
                        break;
                    case "CustomAttribute6":
                        value = sensor.CustomAttribute6;
                        break;
                    case "CustomAttribute7":
                        value = sensor.CustomAttribute7;
                        break;
                    case "CustomAttribute8":
                        value = sensor.CustomAttribute8;
                        break;
                    case "CustomAttribute9":
                        value = sensor.CustomAttribute9;
                        break;
                    case "CustomAttribute10":
                        value = sensor.CustomAttribute10;
                        break;
                    case "IsMissing":
                        value = sensor.IsMissing;
                        break;
                    case "IsStale":
                        value = sensor.IsStale;
                        break;
                    case "IsSelected":
                        value = sensor.IsSelected;
                        break;
                    case "IsVisible":
                        value = sensor.IsVisible;
                        break;
                    case "DeviceId":
                        value = sensor.DeviceId;
                        break;
                    case "ServiceId":
                        value = sensor.ServiceId;
                        break;
                    case "CollectorId":
                        value = sensor.CollectorId;
                        break;
                    default:
                        Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_SENSOR] ⚠️ Unknown field '{fieldName}' requested in FieldsToSend");
                        continue;
                }

                if (value != null)
                {
                    sensorData[fieldName] = value;
                }
            }

            return sensorData;
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
                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_SENSOR] ⚠️ Gateway junction detected but no destination specified for {screenKey}");
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