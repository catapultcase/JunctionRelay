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

    /// Specialized generator for sensor data payloads (standard and matrix-style)
    public class Service_Manager_Payloads_Sensor
    {
        private readonly Service_Manager_Connections _serviceManagerConnections;
        private readonly Service_Database_Manager_Layouts _layoutsDb;

        public Service_Manager_Payloads_Sensor(
            Service_Manager_Connections serviceManagerConnections,
            Service_Database_Manager_Layouts layoutsDb)
        {
            _serviceManagerConnections = serviceManagerConnections;
            _layoutsDb = layoutsDb;
        }

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
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_SENSOR] ⚠️ No assigned sensors for Screen {screenId}. Skipping payload generation.");
                return result;
            }

            // 2) Load template from database
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

            // Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_SENSOR] Template ID: {template.Id}, FieldsToSend from DB: '{template.FieldsToSend}'");

            // 3) Parse FieldsToSend from template
            var fieldsToSend = new[] { "SensorTag", "Value", "Unit" }; // Default fallback
            if (!string.IsNullOrEmpty(template.FieldsToSend))
            {
                fieldsToSend = template.FieldsToSend.Split(',')
                    .Select(f => f.Trim())
                    .Where(f => !string.IsNullOrEmpty(f))
                    .ToArray();
            }

            // Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_SENSOR] Using fields: {string.Join(", ", fieldsToSend)} for screen {screenId}");

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
                // Get the sensor's latest value from the global cache using OriginalId
                var cachedSensor = _serviceManagerConnections.GetSensorData(sensor.OriginalId);
                if (cachedSensor == null)
                {
                    // Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_SENSOR] ⚠️ Sensor with OriginalId {sensor.OriginalId} not found in cache.");
                    continue;
                }

                // Build sensor data based on selected fields
                var sensorData = BuildSensorData(sensor, cachedSensor, fieldsToSend);

                // Use the sensor's SensorTag as the key for the payload
                sensors[sensor.SensorTag] = new List<object> { sensorData };
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

            return result;
        }

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
                Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_SENSOR] ⚠️ No assigned sensors for Screen {screenId}. Skipping payload generation.");
                return result;
            }

            // 2) Load template from database
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
                        formattedValue = cachedSensor.Value?.ToString() ?? "";
                    }

                    // Create the text with formatted value
                    string text = $"{sensor.SensorTag}: {formattedValue} {cachedSensor.Unit}";

                    var sensorData = new List<object> { new { text } };

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
                    Console.WriteLine($"[SERVICE_MANAGER_PAYLOADS_SENSOR] ⚠️ Sensor with OriginalId {sensor.OriginalId} not found in cache.");
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

        // Helper method to build sensor data based on selected fields
        private Dictionary<string, object> BuildSensorData(Model_Sensor sensor, Model_Sensor? cachedSensor, string[] fieldsToSend)
        {
            var sensorData = new Dictionary<string, object>();

            foreach (var field in fieldsToSend)
            {
                var fieldName = field.Trim();

                // Skip SensorTag since it's always used as the outer key
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
                            value = cachedSensor?.Value?.ToString() ?? sensor.Value;
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

        // Shared utility methods
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