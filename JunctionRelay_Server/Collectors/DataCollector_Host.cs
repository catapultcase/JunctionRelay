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

namespace JunctionRelayServer.Collectors
{
    public class DataCollector_Host : IDataCollector
    {
        private readonly Service_HostInfo _hostInfo;

        public string CollectorName => "HostDevice";
        public int CollectorId { get; private set; }

        public DataCollector_Host(Service_HostInfo hostInfo)
        {
            _hostInfo = hostInfo;
        }

        public void ApplyConfiguration(Model_Collector collector)
        {
            // No URL or token needed, but assign ID so it's consistent with others
            CollectorId = collector.Id;
        }

        public async Task<List<Model_Sensor>> FetchSensorsAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);
            var rawSensors = await _hostInfo.GetHostSensors(1000);

            foreach (var sensor in rawSensors)
            {
                sensor.CollectorId = collector.Id;
                sensor.DeviceName = collector.Name;
                sensor.Category ??= "Host";
                sensor.SensorType ??= "System";
                sensor.JunctionId = null;
                sensor.DeviceId = null;
            }

            return rawSensors;
        }

        public async Task<List<Model_Sensor>> FetchSelectedSensorsAsync(Model_Collector collector, List<string> selectedSensorIds, CancellationToken cancellationToken = default)
        {
            var all = await FetchSensorsAsync(collector, cancellationToken);
            return all.Where(s => selectedSensorIds.Contains(s.ExternalId)).ToList();
        }

        public Task<bool> TestConnectionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            return Task.FromResult(true); // Always available
        }

        public Task StartSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task StopSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public bool IsConnected(Model_Collector collector) => true;
    }
}
