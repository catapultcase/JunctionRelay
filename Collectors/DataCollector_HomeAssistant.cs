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
using Newtonsoft.Json.Linq;

namespace JunctionRelayServer.Collectors
{
    public class DataCollector_HomeAssistant : IDataCollector
    {
        // The unique ID is set dynamically in ApplyConfiguration using the Model_Collector.
        public int CollectorId { get; private set; }

        public string CollectorName => "HomeAssistant";

        private string _baseUrl = string.Empty;
        private string _accessToken = string.Empty;

        public void ApplyConfiguration(Model_Collector collector)
        {
            _baseUrl = collector.URL?.TrimEnd('/')
                ?? throw new ArgumentException("Collector.URL is required.");
            _accessToken = collector.AccessToken
                ?? throw new ArgumentException("Collector.AccessToken is required.");
            // Set the CollectorId from the Model_Collector.
            CollectorId = collector.Id;
        }

        public async Task<List<Model_Sensor>> FetchSensorsAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);
            var sensors = new List<Model_Sensor>();

            using var client = new HttpClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
            var response = await client.GetAsync($"{_baseUrl}/api/states", cancellationToken);
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            var array = JArray.Parse(json);

            foreach (var obj in array)
            {
                if (obj["entity_id"] is not JToken id || obj["state"] is not JToken state)
                    continue;
                var attributes = obj["attributes"] as JObject;
                var friendlyName = attributes?["friendly_name"]?.ToString();

                sensors.Add(new Model_Sensor
                {
                    ExternalId = id.ToString(),
                    Name = attributes?["friendly_name"]?.ToString() ?? id.ToString(),
                    Value = state.ToString(),
                    Unit = attributes?["unit_of_measurement"]?.ToString() ?? "N/A",
                    Category = "Home Assistant",
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = friendlyName ?? id.ToString(),
                    ComponentName = id.ToString(),
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
            ApplyConfiguration(collector);
            var sensors = new List<Model_Sensor>();

            using var client = new HttpClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
            var response = await client.GetAsync($"{_baseUrl}/api/states", cancellationToken);
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            var array = JArray.Parse(json);

            foreach (var obj in array)
            {
                if (obj["entity_id"] is not JToken id || obj["state"] is not JToken state)
                    continue;
                if (!selectedSensorIds.Contains(id.ToString()))
                    continue;

                var attributes = obj["attributes"] as JObject;

                sensors.Add(new Model_Sensor
                {
                    ExternalId = id.ToString(),
                    Name = attributes?["friendly_name"]?.ToString() ?? id.ToString(),
                    Value = state.ToString(),
                    Unit = attributes?["unit_of_measurement"]?.ToString() ?? "N/A",
                    Category = "Home Assistant",
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = id.ToString(),
                    ComponentName = id.ToString(),
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });
            }

            return sensors;
        }

        public async Task<bool> TestConnectionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            try
            {
                ApplyConfiguration(collector);
                using var client = new HttpClient();
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
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
    }
}
