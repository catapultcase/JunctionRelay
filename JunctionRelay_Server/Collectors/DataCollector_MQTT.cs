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
using JunctionRelayServer.Services;
using Newtonsoft.Json;

namespace JunctionRelayServer.Collectors
{
    public class DataCollector_MQTT : IDataCollector
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly Service_Stream_Manager_MQTT _streamManager;

        private int _collectorId;
        private string _deviceName = "MQTT";

        public string CollectorName => "MQTT";
        public int CollectorId => _collectorId;

        public DataCollector_MQTT(IServiceScopeFactory scopeFactory, Service_Stream_Manager_MQTT streamManager)
        {
            _scopeFactory = scopeFactory;
            _streamManager = streamManager;
        }

        public void ApplyConfiguration(Model_Collector collector)
        {
            _collectorId = collector.Id;
            _deviceName = collector.Name;
        }

        private async Task<Model_Service> ResolveServiceAsync(Model_Collector collector)
        {
            if (!collector.ServiceId.HasValue)
                throw new InvalidOperationException("Collector is not associated with an MQTT broker (ServiceId is null).");

            using var scope = _scopeFactory.CreateScope();
            var serviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Services>();
            var service = await serviceDb.GetServiceByIdAsync(collector.ServiceId.Value);

            if (service == null || service.Type != "MQTT Broker")
                throw new InvalidOperationException("Invalid or missing MQTT service for this collector.");

            return service;
        }

        public async Task<List<Model_Sensor>> FetchSensorsAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            var service = await ResolveServiceAsync(collector);
            var payloads = _streamManager.GetAllLatestPayloads(service);

            var sensors = new List<Model_Sensor>();

            foreach (var kvp in payloads)
            {
                var payloadJson = JsonConvert.DeserializeObject<Dictionary<string, object>>(kvp.Value);
                var sensorValue = payloadJson != null && payloadJson.ContainsKey("value") ? payloadJson["value"] : null;
                var valueAsString = sensorValue?.ToString() ?? string.Empty;

                sensors.Add(new Model_Sensor
                {
                    CollectorId = _collectorId,
                    DeviceName = _deviceName,
                    ExternalId = kvp.Key,
                    Name = kvp.Key,
                    ComponentName = kvp.Key.Split('/').Last(),
                    Category = "MQTT",
                    SensorType = "MQTT",
                    Unit = string.Empty,
                    Value = valueAsString,
                    SensorTag = kvp.Key,
                    LastUpdated = DateTime.UtcNow,
                    MQTTTopic = kvp.Key,
                    MQTTQoS = _streamManager.GetTopicQoS(service, kvp.Key),
                    MQTTServiceId = service.Id,
                    IsMissing = false,
                    IsStale = false,
                    IsSelected = true,
                    IsVisible = true
                });
            }

            return sensors.Select(s => s.Clone()).ToList();
        }

        public async Task<List<Model_Sensor>> FetchSelectedSensorsAsync(Model_Collector collector, List<string> selectedSensorIds, CancellationToken cancellationToken = default)
        {
            var service = await ResolveServiceAsync(collector);
            var payloads = _streamManager.GetAllLatestPayloads(service);

            var selectedSensors = new List<Model_Sensor>();

            foreach (var topic in selectedSensorIds)
            {
                if (payloads.TryGetValue(topic, out var payload))
                {
                    var payloadJson = JsonConvert.DeserializeObject<Dictionary<string, object>>(payload);
                    var sensorValue = payloadJson != null && payloadJson.ContainsKey("value") ? payloadJson["value"] : null;
                    var valueAsString = sensorValue?.ToString() ?? string.Empty;

                    selectedSensors.Add(new Model_Sensor
                    {
                        CollectorId = _collectorId,
                        DeviceName = _deviceName,
                        ExternalId = topic,
                        Name = topic,
                        ComponentName = topic.Split('/').Last(),
                        Category = "MQTT",
                        SensorType = "MQTT",
                        Unit = string.Empty,
                        Value = valueAsString,
                        SensorTag = topic,
                        LastUpdated = DateTime.UtcNow,
                        MQTTTopic = topic,
                        MQTTQoS = _streamManager.GetTopicQoS(service, topic),
                        MQTTServiceId = service.Id,
                        IsMissing = false,
                        IsStale = false,
                        IsSelected = true,
                        IsVisible = true
                    });
                }
            }

            return selectedSensors.Select(s => s.Clone()).ToList();
        }

        public async Task<bool> TestConnectionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            var service = await ResolveServiceAsync(collector);
            return _streamManager.IsStreaming(service.Id);
        }

        public Task StartSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task StopSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default) => Task.CompletedTask;

        public bool IsConnected(Model_Collector collector)
        {
            // For consistency, we should resolve the service and ask the stream manager
            var service = ResolveServiceAsync(collector).Result; // synchronous wait to match interface
            return _streamManager.IsStreaming(service.Id);
        }
    }
}