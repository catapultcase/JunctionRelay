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

using System.Text.Json;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    /// <summary>
    /// XSD sensor payload generation for Mode 2 and Mode 3.
    /// Handles sensor dictionary validation and xsd_sensor message building.
    /// </summary>
    public class Service_Manager_Payloads_XSD_Sensor
    {
        private readonly Service_Manager_Connections _connectionManager;
        private readonly HashSet<string> _validDictionaryTags = new();

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        public Service_Manager_Payloads_XSD_Sensor(Service_Manager_Connections connectionManager)
        {
            _connectionManager = connectionManager;
            LoadSensorDictionary();
        }

        /// <summary>
        /// Load valid sensor tags from the sensor dictionary file.
        /// </summary>
        private void LoadSensorDictionary()
        {
            try
            {
                var dictionaryPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "frameengine", "sensor-dictionary.json");
                if (File.Exists(dictionaryPath))
                {
                    var json = File.ReadAllText(dictionaryPath);
                    var entries = JsonSerializer.Deserialize<List<SensorDictionaryEntry>>(json, _jsonOptions);
                    if (entries != null)
                    {
                        foreach (var entry in entries)
                        {
                            if (!string.IsNullOrEmpty(entry.SensorTag))
                            {
                                _validDictionaryTags.Add(entry.SensorTag);
                            }
                        }
                        Console.WriteLine($"[XSD_PAYLOADS] Loaded {_validDictionaryTags.Count} valid dictionary tags");
                    }
                }
                else
                {
                    Console.WriteLine("[XSD_PAYLOADS] No sensor dictionary found (open-source build)");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[XSD_PAYLOADS] Error loading sensor dictionary: {ex.Message}");
            }
        }

        private class SensorDictionaryEntry
        {
            public string Category { get; set; } = "";
            public string Sensor { get; set; } = "";
            public string SensorTag { get; set; } = "";
            public string Unit { get; set; } = "";
        }

        /// <summary>
        /// Check if a sensor tag exists in the dictionary.
        /// </summary>
        public bool IsValidDictionaryTag(string? tag)
        {
            return !string.IsNullOrEmpty(tag) && _validDictionaryTags.Contains(tag);
        }

        /// <summary>
        /// Build XSD sensor payload from junction sensors.
        /// Matches XSD's native sensor format with value, unit, displayValue, and source.
        /// Properly categorizes sensors into dictionarySensors and unmappedSensors.
        /// </summary>
        public string BuildXsdSensorPayload(List<Model_Sensor> sensors)
        {
            var dictionarySensors = new Dictionary<string, object>();
            var unmappedSensors = new Dictionary<string, object>();

            foreach (var sensor in sensors)
            {
                var cachedSensor = _connectionManager.GetSensorData(sensor.OriginalId);
                var rawValue = cachedSensor?.Value ?? sensor.Value;
                var unit = cachedSensor?.Unit ?? sensor.Unit ?? "";
                var source = sensor.DeviceName ?? "JunctionRelay";

                // Parse value to proper type (number, boolean, or string)
                object typedValue = ParseSensorValue(rawValue);
                var displayValue = rawValue?.ToString() ?? "";

                var sensorData = new Dictionary<string, object>
                {
                    ["value"] = typedValue,
                    ["unit"] = unit,
                    ["displayValue"] = displayValue,
                    ["source"] = source
                };

                // Check if the tag exists in the sensor dictionary (not just if SensorTag is set)
                if (!string.IsNullOrEmpty(sensor.SensorTag) && _validDictionaryTags.Contains(sensor.SensorTag))
                {
                    dictionarySensors[sensor.SensorTag] = sensorData;
                }
                else
                {
                    // For unmapped sensors, use sensor name as key and include additional metadata
                    sensorData["pollerSource"] = source;
                    sensorData["rawLabel"] = sensor.Name;
                    unmappedSensors[sensor.Name] = sensorData;
                }
            }

            var payload = new
            {
                type = "xsd_sensor",
                screenId = "xsd",
                dictionarySensors,
                unmappedSensors
            };

            return JsonSerializer.Serialize(payload, _jsonOptions);
        }

        /// <summary>
        /// Build streams_available message (XSD protocol).
        /// Sent on initial connection to inform XSD what streams are available.
        /// </summary>
        public string BuildStreamsAvailablePayload(string streamName, int port, int rate, int sensorCount)
        {
            var payload = new
            {
                type = "streams_available",
                streams = new[]
                {
                    new
                    {
                        id = "main",
                        name = streamName,
                        type = "sensors",
                        port,
                        rate,
                        enabled = true,
                        sensorCount
                    }
                }
            };

            return JsonSerializer.Serialize(payload, _jsonOptions);
        }

        /// <summary>
        /// Parse sensor value to its proper type (number, boolean, or string).
        /// </summary>
        public static object ParseSensorValue(object? rawValue)
        {
            if (rawValue == null) return 0;

            var strValue = rawValue.ToString();
            if (string.IsNullOrEmpty(strValue)) return 0;

            // Try parsing as number
            if (double.TryParse(strValue, out var numValue))
            {
                // Return as int if it's a whole number, otherwise as double
                if (numValue == Math.Floor(numValue) && numValue >= int.MinValue && numValue <= int.MaxValue)
                {
                    return (int)numValue;
                }
                return numValue;
            }

            // Try parsing as boolean
            if (bool.TryParse(strValue, out var boolValue))
            {
                return boolValue;
            }

            // Return as string
            return strValue;
        }

    }
}
