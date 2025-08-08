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

using JunctionRelayServer.Interfaces;
using JunctionRelayServer.Models;
using Newtonsoft.Json.Linq;
using System.Text.RegularExpressions;

namespace JunctionRelayServer.Collectors
{
    public class DataCollector_LibreHardwareMonitor : IDataCollector
    {
        private string _baseUrl = string.Empty;
        private string _accessToken = string.Empty;

        public int CollectorId { get; private set; }

        public string CollectorName => "LibreHardwareMonitor";

        // Helper method to detect decimal places in a value
        private int GetDecimalPlaces(string value)
        {
            // Handle null or empty values
            if (string.IsNullOrEmpty(value))
                return 0;

            // Try to parse as decimal to validate it's a numeric value
            if (!decimal.TryParse(value, out decimal numericValue))
                return 0; // Non-numeric values (including "N/A") have 0 decimal places

            // Convert to string to analyze decimal places
            string valueStr = numericValue.ToString();

            // Find the decimal point
            int decimalIndex = valueStr.IndexOf('.');
            if (decimalIndex == -1)
                return 0; // No decimal point found

            // Count digits after decimal point
            return valueStr.Length - decimalIndex - 1;
        }

        public void ApplyConfiguration(Model_Collector collector)
        {
            _baseUrl = collector.URL?.TrimEnd('/')
                ?? throw new ArgumentException("Collector.URL is required.");
            _accessToken = collector.DecryptedAccessToken // We keep the accessToken for flexibility, though it isn't used.
                ?? throw new ArgumentException("Collector.AccessToken is required."); // Optional in this case
            // Set the CollectorId from the Model_Collector.
            CollectorId = collector.Id;
        }

        public async Task<List<Model_Sensor>> FetchSensorsAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);
            var sensors = new List<Model_Sensor>();

            using var client = new HttpClient();

            // Removed the Authorization header as the old code didn't use it
            // We are assuming that the LibreHardwareMonitor doesn't need authentication headers

            var response = await client.GetAsync($"{_baseUrl}/data.json", cancellationToken);
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            var jsonData = JObject.Parse(json);

            List<Model_Sensor> sensorReadings = new List<Model_Sensor>();

            var children = jsonData["Children"];
            if (children != null)
            {
                foreach (var hardware in children)
                {
                    if (hardware == null) continue;

                    string? hardwareName = hardware["Text"]?.ToString();
                    if (string.IsNullOrEmpty(hardwareName))
                    {
                        continue; // Skip if no name is found
                    }

                    var hardwareChildren = hardware["Children"];
                    if (hardwareChildren != null)
                    {
                        foreach (var component in hardwareChildren)
                        {
                            if (component == null) continue;

                            string? componentName = component["Text"]?.ToString();
                            if (string.IsNullOrEmpty(componentName))
                            {
                                continue; // Skip if no component name is found
                            }

                            ProcessComponents(component, hardwareName, componentName, sensorReadings, collector);
                        }
                    }
                }
            }

            return sensorReadings;
        }

        public async Task<List<Model_Sensor>> FetchSelectedSensorsAsync(Model_Collector collector, List<string> selectedSensorIds, CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);
            var sensors = new List<Model_Sensor>();

            var allSensors = await FetchSensorsAsync(collector, cancellationToken);
            return allSensors.FindAll(sensor => selectedSensorIds.Contains(sensor.ExternalId));
        }

        public async Task<bool> TestConnectionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            try
            {
                ApplyConfiguration(collector);
                using var client = new HttpClient();

                // No authentication needed for the LibreHardwareMonitor
                var response = await client.GetAsync($"{_baseUrl}/api/", cancellationToken);
                return response.IsSuccessStatusCode;
            }
            catch
            {
                return false;
            }
        }

        // Stub persistent session methods (non-persistent)
        public Task StartSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task StopSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public bool IsConnected(Model_Collector collector) => true;

        private void ProcessComponents(JToken component, string hardwareName, string parentComponentName, List<Model_Sensor> sensorReadings, Model_Collector collector)
        {
            string componentName = component["Text"]?.ToString() ?? parentComponentName;

            var componentChildren = component["Children"];
            if (componentChildren?.HasValues == true)
            {
                foreach (var child in componentChildren)
                {
                    if (child == null) continue;

                    var childChildren = child["Children"];
                    if (childChildren?.HasValues == true)
                    {
                        // New component branch detected
                        string newComponentName = componentName;
                        ProcessComponents(child, hardwareName, newComponentName, sensorReadings, collector);
                    }
                    else
                    {
                        // Process sensors directly under the component
                        string? sensorName = child["Text"]?.ToString();
                        string? sensorType = child["Type"]?.ToString();
                        string sensorValue = child["Value"]?.ToString() ?? "N/A";
                        string sensorId = child["SensorId"]?.ToString() ?? string.Empty;

                        // Skip if essential data is missing
                        if (string.IsNullOrEmpty(sensorName) || string.IsNullOrEmpty(sensorType))
                        {
                            continue;
                        }

                        string strippedValue = StripUnits(sensorValue);

                        Model_Sensor sensorModel = new Model_Sensor
                        {
                            Name = sensorName,
                            ComponentName = $"{hardwareName} - {parentComponentName}",
                            Category = sensorType,
                            Unit = GetSensorUnit(sensorType),
                            Value = strippedValue,
                            DecimalPlaces = GetDecimalPlaces(strippedValue),
                            ExternalId = $"{sensorId}::{sensorName}",
                            SensorType = "API", // Set this required property
                            DeviceName = collector.Name, // Use collector name instead of hardcoded value
                            SensorTag = $"{sensorId}::{sensorName}",
                            JunctionId = null,
                            DeviceId = null,
                            CollectorId = collector.Id,
                            LastUpdated = DateTime.UtcNow
                        };

                        sensorReadings.Add(sensorModel);
                        //Console.WriteLine($"[Collector] {sensorModel.ExternalId} → {sensorModel.Name} ({sensorModel.ComponentName})");
                    }
                }
            }
        }

        private string StripUnits(string value)
        {
            // Remove any non-numeric characters except for dot and minus sign
            return Regex.Replace(value, @"[^\d.-]", "").Trim();
        }

        private string GetSensorUnit(string sensorType)
        {
            return sensorType switch
            {
                "Voltage" => "V",
                "Clock" => "MHz",
                "Temperature" => "°C",
                "Load" => "%",
                "Fan" => "RPM",
                "Flow" => "L/h",
                "Control" or "Level" => "%",
                "Power" => "W",
                "Data" => "GB",
                _ => string.Empty
            };
        }
    }
}