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

        public string CollectorName => "LibreHardwareMonitor";public void ApplyConfiguration(Model_Collector collector)
        {
            _baseUrl = collector.URL?.TrimEnd('/')
                ?? throw new ArgumentException("Collector.URL is required.");

            // LHM typically doesn't need a token. Keep whatever is provided; allow empty.
            _accessToken = collector.DecryptedAccessToken ?? string.Empty;

            CollectorId = collector.Id;

            // Console.WriteLine(
            //     $"[LHM][Config] CollectorId={CollectorId}, Name='{collector.Name}', URL='{_baseUrl}', TokenProvided={(string.IsNullOrEmpty(_accessToken) ? "no" : "yes")}"
            // );
        }


        public async Task<List<Model_Sensor>> FetchSensorsAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);
            var sensorReadings = new List<Model_Sensor>();

            using var client = new HttpClient();

            var url = $"{_baseUrl}/data.json";
            // Console.WriteLine($"[LHM][FetchSensors] GET {url}");

            var response = await client.GetAsync(url, cancellationToken);
            // Console.WriteLine($"[LHM][FetchSensors] HTTP {(int)response.StatusCode} {response.StatusCode}");

            if (!response.IsSuccessStatusCode)
            {
                string body = string.Empty;
                try { body = await response.Content.ReadAsStringAsync(cancellationToken); } catch { }
                // Console.WriteLine($"[LHM][FetchSensors][ERROR] Non-success status. Body (first 500): {Trunc(body, 500)}");
                response.EnsureSuccessStatusCode(); // will throw with status info
            }

            string json;
            try
            {
                json = await response.Content.ReadAsStringAsync(cancellationToken);
                // Console.WriteLine($"[LHM][FetchSensors] Received JSON length={json.Length}");
            }
            catch (Exception ex)
            {
                // Console.WriteLine($"[LHM][FetchSensors][ERROR] Failed to read body: {ex.Message}");
                throw;
            }

            JObject jsonData;
            try
            {
                jsonData = JObject.Parse(json);
            }
            catch (Exception ex)
            {
                // Console.WriteLine($"[LHM][FetchSensors][ERROR] JSON parse failed: {ex.Message}. Payload head: {Trunc(json, 500)}");
                throw;
            }

            var children = jsonData["Children"];
            if (children == null)
            {
                // Console.WriteLine("[LHM][FetchSensors] No 'Children' node found.");
                return sensorReadings;
            }

            int hardwareCount = 0, componentCount = 0, sensorCount = 0, skippedUnnamedHardware = 0, skippedUnnamedComponent = 0;
            foreach (var hardware in children)
            {
                if (hardware == null)
                {
                    // Console.WriteLine("[LHM][FetchSensors] Skipped null hardware node.");
                    continue;
                }

                string? hardwareName = hardware["Text"]?.ToString();
                if (string.IsNullOrEmpty(hardwareName))
                {
                    skippedUnnamedHardware++;
                    continue;
                }
                hardwareCount++;
                // Console.WriteLine($"[LHM][FetchSensors] Hardware: {hardwareName}");

                var hardwareChildren = hardware["Children"];
                if (hardwareChildren != null)
                {
                    foreach (var component in hardwareChildren)
                    {
                        if (component == null)
                        {
                            // Console.WriteLine($"[LHM][FetchSensors]   Skipped null component under '{hardwareName}'.");
                            continue;
                        }

                        string? componentName = component["Text"]?.ToString();
                        if (string.IsNullOrEmpty(componentName))
                        {
                            skippedUnnamedComponent++;
                            continue;
                        }
                        componentCount++;
                        // Console.WriteLine($"[LHM][FetchSensors]   Component: {componentName}");

                        sensorCount += ProcessComponents(component, hardwareName, componentName, sensorReadings, collector);
                    }
                }
            }

            // Console.WriteLine($"[LHM][FetchSensors] Done. Hardware={hardwareCount}, Components={componentCount}, SensorsAdded={sensorReadings.Count}, SkippedUnnamedHardware={skippedUnnamedHardware}, SkippedUnnamedComponent={skippedUnnamedComponent}, TraversedSensorNodes={sensorCount}");
            return sensorReadings;
        }

        public async Task<List<Model_Sensor>> FetchSelectedSensorsAsync(Model_Collector collector, List<string> selectedSensorIds, CancellationToken cancellationToken = default)
        {
            var all = await FetchSensorsAsync(collector, cancellationToken);
            var filtered = all.FindAll(s => selectedSensorIds.Contains(s.ExternalId));
            // Console.WriteLine($"[LHM][FetchSelected] Selected {filtered.Count} of {all.Count} sensors by ExternalId match.");
            return filtered;
        }

        public async Task<bool> TestConnectionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            try
            {
                ApplyConfiguration(collector);
                using var client = new HttpClient();

                var url = $"{_baseUrl}/api/";
                // Console.WriteLine($"[LHM][TestConnection] GET {url}");

                var response = await client.GetAsync(url, cancellationToken);
                // Console.WriteLine($"[LHM][TestConnection] HTTP {(int)response.StatusCode} {response.StatusCode}");
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                // Console.WriteLine($"[LHM][TestConnection][ERROR] {ex.Message}");
                return false;
            }
        }

        // Stub persistent session methods (non-persistent)
        public Task StartSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task StopSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public bool IsConnected(Model_Collector collector) => true;

        private int ProcessComponents(JToken component, string hardwareName, string parentComponentName, List<Model_Sensor> sensorReadings, Model_Collector collector)
        {
            int traversedSensorNodes = 0;

            string componentName = component["Text"]?.ToString() ?? parentComponentName;
            var componentChildren = component["Children"];

            if (componentChildren?.HasValues == true)
            {
                foreach (var child in componentChildren)
                {
                    if (child == null)
                    {
                        // Console.WriteLine($"[LHM][Process] Skipped null child under '{componentName}'.");
                        continue;
                    }

                    var childChildren = child["Children"];
                    if (childChildren?.HasValues == true)
                    {
                        // New component branch
                        traversedSensorNodes += ProcessComponents(child, hardwareName, componentName, sensorReadings, collector);
                    }
                    else
                    {
                        traversedSensorNodes++;

                        string? sensorName = child["Text"]?.ToString();
                        string? sensorType = child["Type"]?.ToString();
                        string sensorValue = child["Value"]?.ToString() ?? "N/A";
                        string sensorId = child["SensorId"]?.ToString() ?? string.Empty;

                        if (string.IsNullOrEmpty(sensorName) || string.IsNullOrEmpty(sensorType))
                        {
                            // Console.WriteLine($"[LHM][Process] Skipped sensor with missing name/type under '{componentName}'. Raw: Name='{sensorName}', Type='{sensorType}', Id='{sensorId}'");
                            continue;
                        }

                        string strippedValue = StripUnits(sensorValue);
                        var model = new Model_Sensor
                        {
                            Name = sensorName,
                            ComponentName = $"{hardwareName} - {parentComponentName}",
                            Category = sensorType,
                            Unit = GetSensorUnit(sensorType),
                            Value = strippedValue,
                            DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(strippedValue),
                            ExternalId = $"{sensorId}::{sensorName}",
                            SensorType = "API",
                            DeviceName = collector.Name,
                            SensorTag = $"{sensorId}::{sensorName}",
                            JunctionId = null,
                            DeviceId = null,
                            CollectorId = collector.Id,
                            LastUpdated = DateTime.UtcNow
                        };

                        sensorReadings.Add(model);
                        // Console.WriteLine($"[LHM][Process] +Sensor ExternalId='{model.ExternalId}' Name='{model.Name}' Value='{model.Value}{model.Unit}' Component='{model.ComponentName}' Category='{model.Category}'");
                    }
                }
            }
            else
            {
                // Console.WriteLine($"[LHM][Process] No children under component '{componentName}'.");
            }

            return traversedSensorNodes;
        }

        private string StripUnits(string value)
        {
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

        private static string Trunc(string? s, int max)
        {
            if (string.IsNullOrEmpty(s)) return string.Empty;
            return s.Length <= max ? s : s.Substring(0, max);
        }
    }
}