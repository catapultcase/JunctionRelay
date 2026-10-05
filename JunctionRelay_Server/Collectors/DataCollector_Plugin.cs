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
using JunctionRelayServer.Services.CollectorPlugins;

namespace JunctionRelayServer.Collectors
{
    public class DataCollector_Plugin : IDataCollector
    {
        private readonly Service_PluginProcess _process;
        private readonly Model_CollectorMetadata _metadata;

        public string CollectorName { get; }
        public int CollectorId { get; private set; }

        public DataCollector_Plugin(Service_PluginProcess process, Model_CollectorMetadata metadata)
        {
            _process = process;
            _metadata = metadata;
            CollectorName = metadata.CollectorName;
        }

        public void ApplyConfiguration(Model_Collector collector)
        {
            CollectorId = collector.Id;

            // Re-send configure to the plugin process so it picks up URL/token changes.
            // Fire-and-forget because the IDataCollector interface is synchronous,
            // but the next fetch/test call will use the updated config.
            _ = _process.ConfigureAsync(
                collector.Id,
                collector.URL,
                collector.DecryptedAccessToken,
                collector.DecimalPlaces
            );
        }

        public async Task ConfigurePluginAsync(Model_Collector collector)
        {
            CollectorId = collector.Id;
            await _process.ConfigureAsync(
                collector.Id,
                collector.URL,
                collector.DecryptedAccessToken,
                collector.DecimalPlaces
            );
        }

        public async Task<List<Model_Sensor>> FetchSensorsAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            var result = await _process.FetchSensorsAsync();
            return MapSensors(result.Sensors, collector);
        }

        public async Task<List<Model_Sensor>> FetchSelectedSensorsAsync(Model_Collector collector, List<string> selectedSensorIds, CancellationToken cancellationToken = default)
        {
            var result = await _process.FetchSelectedSensorsAsync(selectedSensorIds);
            return MapSensors(result.Sensors, collector);
        }

        public async Task<bool> TestConnectionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            var result = await _process.TestConnectionAsync();
            return result.Success;
        }

        public async Task StartSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            await _process.StartSessionAsync();
        }

        public async Task StopSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            await _process.StopSessionAsync();
        }

        public bool IsConnected(Model_Collector collector) => _process.IsRunning;

        public Model_CollectorMetadata GetMetadata() => _metadata;

        private List<Model_Sensor> MapSensors(List<PluginSensorResult> pluginSensors, Model_Collector collector)
        {
            return pluginSensors.Select(s => new Model_Sensor
            {
                CollectorId = collector.Id,
                ExternalId = s.UniqueSensorKey,
                Name = s.Name,
                Value = s.Value,
                Unit = s.Unit,
                Category = s.Category,
                DecimalPlaces = s.DecimalPlaces,
                SensorType = s.SensorType,
                ComponentName = s.ComponentName,
                SensorTag = s.SensorTag,
                DeviceName = collector.Name,
                MQTTQoS = 1,
            }).ToList();
        }
    }
}
