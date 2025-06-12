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

using System.Net.Http.Headers;
using JunctionRelayServer.Interfaces;
using JunctionRelayServer.Models;
using System.Text.RegularExpressions;

namespace JunctionRelayServer.Collectors
{
    public class DataCollector_UptimeKuma : IDataCollector
    {
        public int CollectorId { get; private set; }

        public string CollectorName => "UptimeKuma";

        private string _fullEndpoint = string.Empty;

        public void ApplyConfiguration(Model_Collector collector)
        {
            _fullEndpoint = collector.URL?.TrimEnd('/')
                ?? throw new ArgumentException("Collector.URL is required.");
            CollectorId = collector.Id;
        }

        public async Task<List<Model_Sensor>> FetchSensorsAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);
            var sensors = new List<Model_Sensor>();

            using var client = new HttpClient();
            var response = await client.GetAsync(_fullEndpoint, cancellationToken);
            response.EnsureSuccessStatusCode();

            var content = await response.Content.ReadAsStringAsync(cancellationToken);

            // Match monitor status lines with name
            var regex = new Regex(@"monitor_status\{.*?monitor_name=""(?<name>[^""]+)""[^}]*\}\s+(?<status>\d+)", RegexOptions.Compiled);

            foreach (Match match in regex.Matches(content))
            {
                var name = match.Groups["name"].Value;
                var statusCode = match.Groups["status"].Value;

                string statusText = statusCode switch
                {
                    "0" => "down",
                    "1" => "up",
                    "2" => "pending",
                    "3" => "maintenance",
                    _ => "unknown"
                };

                sensors.Add(new Model_Sensor
                {
                    ExternalId = name.ToLowerInvariant().Replace(" ", "-"),
                    Name = name,
                    Value = statusText,
                    Unit = "Status",
                    Category = "Uptime Kuma",
                    DeviceName = collector.Name,
                    SensorType = "Metrics",
                    SensorTag = name,
                    ComponentName = name,
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });
            }

            return sensors;
        }

        public async Task<List<Model_Sensor>> FetchSelectedSensorsAsync(Model_Collector collector, List<string> selectedSensorIds, CancellationToken cancellationToken = default)
        {
            var all = await FetchSensorsAsync(collector, cancellationToken);
            return all.Where(s => selectedSensorIds.Contains(s.ExternalId)).ToList();
        }

        public async Task<bool> TestConnectionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            try
            {
                ApplyConfiguration(collector);
                using var client = new HttpClient();
                var response = await client.GetAsync(_fullEndpoint, cancellationToken);
                return response.IsSuccessStatusCode;
            }
            catch
            {
                return false;
            }
        }

        public Task StartSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task StopSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public bool IsConnected(Model_Collector collector) => true;
    }
}
