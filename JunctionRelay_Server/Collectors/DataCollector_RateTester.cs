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

namespace JunctionRelayServer.Collectors
{
    public class DataCollector_RateTester : IDataCollector
    {
        public string CollectorName => "RateTester";
        public int CollectorId { get; private set; }

        private int _counter = 0;

        public void ApplyConfiguration(Model_Collector collector)
        {
            CollectorId = collector.Id;
        }

        public Task<List<Model_Sensor>> FetchSensorsAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);

            _counter = (_counter + 1) % 1000;

            var sensors = new List<Model_Sensor>
                {
                    new Model_Sensor
                    {
                        CollectorId = collector.Id,
                        ExternalId = "rate_tester",
                        Name = "Rate Tester",
                        ComponentName = "RateTester",
                        Value = _counter.ToString("F1"),
                        Unit = "%",
                        SensorTag = "Rate Tester",
                        SensorType = "Tester",
                        Category = "Synthetic",
                        DeviceName = collector.Name,
                        MQTTQoS = 1,
                    }
                };

            return Task.FromResult(sensors);
        }

        public Task<List<Model_Sensor>> FetchSelectedSensorsAsync(Model_Collector collector, List<string> selectedSensorIds, CancellationToken cancellationToken = default)
        {
            return FetchSensorsAsync(collector, cancellationToken);
        }

        public Task<bool> TestConnectionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            return Task.FromResult(true); // Always available
        }

        public Task StartSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }

        public Task StopSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }

        public bool IsConnected(Model_Collector collector) => true;
    }
}