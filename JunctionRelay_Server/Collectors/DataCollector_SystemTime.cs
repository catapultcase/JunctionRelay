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
    public class DataCollector_SystemTime : IDataCollector
    {
        public string CollectorName => "SystemTime";
        public int CollectorId { get; private set; }

        public void ApplyConfiguration(Model_Collector collector)
        {
            CollectorId = collector.Id;
        }

        public Task<List<Model_Sensor>> FetchSensorsAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);

            var utcTime = DateTime.UtcNow;
            var localTime = DateTime.Now;

            var sensors = new List<Model_Sensor>
            {
                new Model_Sensor
                {
                    CollectorId = collector.Id,
                    ExternalId = "system_utc_time_iso",
                    Name = "System UTC Time (ISO 8601)",
                    ComponentName = "SystemTime",
                    Value = utcTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                    Unit = "UTC",
                    DecimalPlaces = 0,
                    SensorTag = "Time",
                    SensorType = "DateTime",
                    Category = "System",
                    DeviceName = collector.Name,
                    MQTTQoS = 1,
                },
                new Model_Sensor
                {
                    CollectorId = collector.Id,
                    ExternalId = "system_utc_timestamp",
                    Name = "System UTC Timestamp",
                    ComponentName = "SystemTime",
                    Value = ((DateTimeOffset)utcTime).ToUnixTimeSeconds().ToString(),
                    Unit = "seconds",
                    DecimalPlaces = 0,
                    SensorTag = "Timestamp",
                    SensorType = "Numeric",
                    Category = "System",
                    DeviceName = collector.Name,
                    MQTTQoS = 1,
                },
                new Model_Sensor
                {
                    CollectorId = collector.Id,
                    ExternalId = "system_utc_time_readable",
                    Name = "System UTC Time (Readable)",
                    ComponentName = "SystemTime",
                    Value = utcTime.ToString("yyyy-MM-dd HH:mm:ss UTC"),
                    Unit = "UTC",
                    DecimalPlaces = 0,
                    SensorTag = "Time",
                    SensorType = "Text",
                    Category = "System",
                    DeviceName = collector.Name,
                    MQTTQoS = 1,
                },
                new Model_Sensor
                {
                    CollectorId = collector.Id,
                    ExternalId = "system_local_time_iso",
                    Name = "System Local Time (ISO 8601)",
                    ComponentName = "SystemTime",
                    Value = localTime.ToString("yyyy-MM-ddTHH:mm:ss.fff") + localTime.ToString("zzz"),
                    Unit = "Local",
                    DecimalPlaces = 0,
                    SensorTag = "Time",
                    SensorType = "DateTime",
                    Category = "System",
                    DeviceName = collector.Name,
                    MQTTQoS = 1,
                },
                new Model_Sensor
                {
                    CollectorId = collector.Id,
                    ExternalId = "system_local_time_readable",
                    Name = "System Local Time (Readable)",
                    ComponentName = "SystemTime",
                    Value = localTime.ToString("yyyy-MM-dd HH:mm:ss") + " " + localTime.ToString("zzz"),
                    Unit = "Local",
                    DecimalPlaces = 0,
                    SensorTag = "Time",
                    SensorType = "Text",
                    Category = "System",
                    DeviceName = collector.Name,
                    MQTTQoS = 1,
                },
                new Model_Sensor
                {
                    CollectorId = collector.Id,
                    ExternalId = "system_timezone",
                    Name = "System Timezone",
                    ComponentName = "SystemTime",
                    Value = TimeZoneInfo.Local.DisplayName,
                    Unit = "Zone",
                    DecimalPlaces = 0,
                    SensorTag = "TimeZone",
                    SensorType = "Text",
                    Category = "System",
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
            return Task.FromResult(true); // System time is always available
        }

        public Task StartSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }

        public Task StopSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }

        public bool IsConnected(Model_Collector collector) => true; // System time is always available
    }
}