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

using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_Sensors
    {
        private readonly Service_Database_Manager_Sensors _sensorsDbManager;
        private readonly Service_Database_Manager_Devices _devicesDbManager;
        private readonly Service_Database_Manager_Collectors _collectorsDbManager;
        private readonly Service_Database_Manager_JunctionLinks _linkDb;
        private readonly Service_HostInfo _hostInfoService;

        public Service_Manager_Sensors(
            Service_Database_Manager_Sensors sensorsDbManager,
            Service_Database_Manager_Devices devicesDbManager,
            Service_Database_Manager_Collectors collectorsDbManager,
            Service_Database_Manager_JunctionLinks linkDb,
            Service_HostInfo hostInfoService)
        {
            _sensorsDbManager = sensorsDbManager;
            _devicesDbManager = devicesDbManager;
            _collectorsDbManager = collectorsDbManager;
            _linkDb = linkDb;
            _hostInfoService = hostInfoService;
        }

        public async Task<List<Model_Sensor>> GetNewSensorsAsync(bool isHostDevice, int deviceId)
        {
            try
            {
                var fetchedSensors = isHostDevice
                    ? await _hostInfoService.GetHostSensors(1000)
                    : new List<Model_Sensor>();

                var existingSensors = await _sensorsDbManager.GetSensorsByDeviceIdAsync(deviceId);
                var existingExternalIds = new HashSet<string>(
                    existingSensors
                        .Where(s => !string.IsNullOrEmpty(s.ExternalId))
                        .Select(s => s.ExternalId.Trim()),
                    StringComparer.OrdinalIgnoreCase
                );

                var newSensors = fetchedSensors
                    .Where(s => !string.IsNullOrWhiteSpace(s.ExternalId?.Trim())
                                && !existingExternalIds.Contains(s.ExternalId.Trim()))
                    .Select(s =>
                    {
                        var deviceName = "DefaultDeviceName";
                        if (s.DeviceId.HasValue)
                        {
                            var device = _devicesDbManager.GetDeviceByIdAsync(s.DeviceId.Value).Result;
                            deviceName = device?.Name ?? deviceName;
                        }
                        else if (s.CollectorId.HasValue)
                        {
                            var collector = _collectorsDbManager.GetCollectorByIdAsync(s.CollectorId.Value).Result;
                            deviceName = collector?.Name ?? deviceName;
                        }

                        return new Model_Sensor
                        {
                            Name = s.Name,
                            ExternalId = s.ExternalId,
                            SensorType = s.SensorType,
                            Value = s.Value,
                            Unit = s.Unit,
                            DecimalPlaces = s.DecimalPlaces,
                            ComponentName = s.ComponentName,
                            SensorTag = s.SensorTag ?? "DefaultSensorTag",
                            Category = s.Category ?? "DefaultCategory",
                            DeviceName = deviceName,
                            LastUpdated = DateTime.UtcNow
                        };
                    })
                    .ToList();

                Console.WriteLine("\nNew Sensors (Delta):");
                if (!newSensors.Any()) Console.WriteLine("No new sensors found.");
                else newSensors.ForEach(sensor =>
                    Console.WriteLine($"- {sensor.ExternalId}: {sensor.Name}, {sensor.SensorType}, {sensor.Value}"));

                return newSensors;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Error fetching new sensors: {ex.Message}");
                return new List<Model_Sensor>();
            }
        }

        public async Task<Model_Sensor> AddSensorToDeviceAsync(int deviceId, Model_Sensor newSensor)
        {
            newSensor.DeviceId = deviceId;
            var device = await _devicesDbManager.GetDeviceByIdAsync(deviceId);
            if (device == null)
                throw new Exception($"Device with ID {deviceId} not found.");
            newSensor.DeviceName = device.Name;
            return await _sensorsDbManager.AddSensorAsync(newSensor);
        }

        public async Task<Model_Sensor> AddSensorToCollectorAsync(int collectorId, Model_Sensor newSensor)
        {
            newSensor.CollectorId = collectorId;
            var collector = await _collectorsDbManager.GetCollectorByIdAsync(collectorId);
            if (collector == null)
                throw new Exception($"Collector with ID {collectorId} not found.");
            newSensor.DeviceName = collector.Name;
            return await _sensorsDbManager.AddSensorAsync(newSensor);
        }

        public async Task CloneSensorsForJunctionAsync(int junctionId, List<Model_Sensor> sensors)
        {
            // Preload existing junction-sensors and build composite keys
            var existingJunctionSensors = await _sensorsDbManager.GetJunctionSensorsByJunctionIdAsync(junctionId);
            var seenKeys = new HashSet<string>(
                existingJunctionSensors
                    .Select(s => $"{s.ExternalId}:{s.JunctionDeviceLinkId ?? s.JunctionCollectorLinkId}"),
                StringComparer.OrdinalIgnoreCase
            );

            var deviceLinks = await _linkDb.GetDeviceLinksByJunctionAsync(junctionId);
            var collectorLinks = await _linkDb.GetCollectorLinksByJunctionAsync(junctionId);
            var insertedCount = 0;

            foreach (var sensor in sensors)
            {
                int? linkId = null;
                bool isDevice = false;

                if (sensor.DeviceId.HasValue)
                {
                    var dl = deviceLinks.FirstOrDefault(x => x.DeviceId == sensor.DeviceId);
                    if (dl != null) { linkId = dl.Id; isDevice = true; }
                }
                else if (sensor.CollectorId.HasValue)
                {
                    var cl = collectorLinks.FirstOrDefault(x => x.CollectorId == sensor.CollectorId);
                    if (cl != null) linkId = cl.Id;
                }

                if (!linkId.HasValue)
                    continue;

                var key = $"{sensor.ExternalId}:{linkId.Value}";
                if (seenKeys.Contains(key))
                    continue;
                seenKeys.Add(key);

                var cloned = sensor.Clone();
                cloned.JunctionId = junctionId;
                cloned.JunctionDeviceLinkId = isDevice ? linkId : (int?)null;
                cloned.JunctionCollectorLinkId = !isDevice ? linkId : (int?)null;
                cloned.LastUpdated = DateTime.UtcNow;

                var maxOrder = await _sensorsDbManager.GetMaxSensorOrderAsync(junctionId) ?? 0;
                cloned.SensorOrder = maxOrder + 1;

                try
                {
                    await _sensorsDbManager.InsertJunctionSensorsAsync(junctionId, new List<Model_Sensor> { cloned });
                    insertedCount++;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"❌ Error inserting sensor {sensor.ExternalId}: {ex.Message}");
                }
            }

            Console.WriteLine($"✅ Cloned {insertedCount} sensors for junction {junctionId}.");
        }
    }
}
