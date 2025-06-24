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

        public void ApplyConfiguration(Model_Collector collector)
        {
            _baseUrl = collector.URL?.TrimEnd('/')
                ?? throw new ArgumentException("Collector.URL is required.");
            _accessToken = collector.AccessToken // We keep the accessToken for flexibility, though it isn't used.
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

            foreach (var hardware in jsonData["Children"])
            {
                string hardwareName = hardware["Text"]?.ToString();
                if (hardwareName == null)
                {
                    continue; // Skip if no name is found
                }

                foreach (var component in hardware["Children"])
                {
                    string componentName = component["Text"]?.ToString();
                    if (componentName == null)
                    {
                        continue; // Skip if no component name is found
                    }

                    ProcessComponents(component, hardwareName, componentName, sensorReadings);
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

        private void ProcessComponents(JToken component, string hardwareName, string parentComponentName, List<Model_Sensor> sensorReadings)
        {
            string componentName = component["Text"]?.ToString() ?? parentComponentName;

            foreach (var child in component["Children"] ?? Enumerable.Empty<JToken>())
            {
                if (child["Children"] != null && child["Children"].HasValues)
                {
                    // New component branch detected
                    string newComponentName = $"{componentName}";
                    ProcessComponents(child, hardwareName, newComponentName, sensorReadings);
                }
                else
                {
                    // Process sensors directly under the component
                    string sensorName = child["Text"]?.ToString();
                    string sensorType = child["Type"]?.ToString();
                    string sensorValue = child["Value"]?.ToString() ?? "N/A";
                    string sensorId = child["SensorId"]?.ToString() ?? string.Empty;

                    Model_Sensor sensorModel = new Model_Sensor
                    {
                        Name = sensorName,
                        ComponentName = $"{hardwareName} - {parentComponentName}",
                        Category = sensorType,
                        Unit = GetSensorUnit(sensorType),
                        Value = StripUnits(sensorValue),
                        ExternalId = sensorId,
                        SensorType = "API", // Set this required property
                        DeviceName = "LibreHardwareMonitor", // Set this required property
                        SensorTag = sensorId, // Set this required property
                        LastUpdated = DateTime.UtcNow
                    };

                    sensorReadings.Add(sensorModel);
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
            switch (sensorType)
            {
                case "Voltage":
                    return "V";
                case "Clock":
                    return "MHz";
                case "Temperature":
                    return "°C";
                case "Load":
                    return "%";
                case "Fan":
                    return "RPM";
                case "Flow":
                    return "L/h";
                case "Control":
                case "Level":
                    return "%";
                case "Power":
                    return "W";
                case "Data":
                    return "GB";
                default:
                    return "";
            }
        }
    }
}
