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

        public Service_Manager_Sensors(Service_Database_Manager_Sensors sensorsDbManager,
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
                // Step 1: Get live sensors from device
                List<Model_Sensor> fetchedSensors = new List<Model_Sensor>();

                if (isHostDevice)
                {
                    // Fetch the sensors and assign to fetchedSensors
                    fetchedSensors = await _hostInfoService.GetHostSensors(1000); // Sample rate = 1000 ms
                }
                else
                {
                    // For non-host devices, we could fetch the sensors from some other source
                    fetchedSensors = new List<Model_Sensor>(); // Placeholder for non-host device API
                }

                // Step 2: Get known sensors from DB
                var existingSensors = await _sensorsDbManager.GetSensorsByDeviceIdAsync(deviceId);

                // Step 3: Build hash set of existing external IDs for fast lookup
                var existingExternalIds = new HashSet<string>(
                    existingSensors
                        .Where(s => !string.IsNullOrEmpty(s.ExternalId)) // Filter out null or empty ExternalIds
                        .Select(s => s.ExternalId.Trim()),  // Trim the ExternalId (no nullable values)
                    StringComparer.OrdinalIgnoreCase
                );

                // Step 4: Compare fetched sensors with existing ones and find new sensors
                var newSensors = fetchedSensors
                    .Where(s => !string.IsNullOrEmpty(s.ExternalId?.Trim()) && !existingExternalIds.Contains(s.ExternalId?.Trim() ?? "")) // Handle null or empty ExternalId before Contains
                    .Select(s =>
                    {
                        // Set the DeviceName based on the device or collector name
                        var deviceName = "DefaultDeviceName"; // Default value
                        if (s.DeviceId.HasValue)
                        {
                            var device = _devicesDbManager.GetDeviceByIdAsync(s.DeviceId.Value).Result;  // Fetch device by DeviceId
                            deviceName = device?.Name ?? deviceName;
                        }
                        else if (s.CollectorId.HasValue)
                        {
                            var collector = _collectorsDbManager.GetCollectorByIdAsync(s.CollectorId.Value).Result;  // Fetch collector by CollectorId
                            deviceName = collector?.Name ?? deviceName;
                        }

                        return new Model_Sensor
                        {
                            Name = s.Name,
                            ExternalId = s.ExternalId,
                            SensorType = s.SensorType,
                            Value = s.Value,
                            Unit = s.Unit,
                            ComponentName = s.ComponentName,
                            SensorTag = s.SensorTag ?? "DefaultSensorTag",  // Set the required SensorTag property
                            Category = s.Category ?? "DefaultCategory",    // Set the required Category property
                            DeviceName = deviceName,  // Set the required DeviceName property
                            LastUpdated = DateTime.UtcNow
                        };
                    })
                    .ToList();

                // Debug log for new sensors (delta sensors)
                Console.WriteLine("\nNew Sensors (Delta):");
                if (newSensors.Count == 0)
                {
                    Console.WriteLine("No new sensors found.");
                }
                else
                {
                    foreach (var sensor in newSensors)
                    {
                        Console.WriteLine($"- {sensor.ExternalId}: {sensor.Name}, {sensor.SensorType}, {sensor.Value}");
                    }
                }

                return newSensors;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Error fetching new sensors: {ex.Message}");
                return new List<Model_Sensor>();  // Return empty list on error
            }
        }

        public async Task<Model_Sensor> AddSensorToDeviceAsync(int deviceId, Model_Sensor newSensor)
        {
            // Ensure the sensor has a valid DeviceId
            newSensor.DeviceId = deviceId;

            // Fetch the device name from the database
            var device = await _devicesDbManager.GetDeviceByIdAsync(deviceId);
            if (device != null)
            {
                newSensor.DeviceName = device.Name;  // Set the device name
            }
            else
            {
                throw new Exception($"Device with ID {deviceId} not found.");
            }

            // Add the sensor to the database
            var addedSensor = await _sensorsDbManager.AddSensorAsync(newSensor);
            return addedSensor;
        }

        public async Task<Model_Sensor> AddSensorToCollectorAsync(int collectorId, Model_Sensor newSensor)
        {
            // Ensure the sensor has a valid CollectorId
            newSensor.CollectorId = collectorId;

            // Fetch the collector name from the database
            var collector = await _collectorsDbManager.GetCollectorByIdAsync(collectorId);
            if (collector != null)
            {
                newSensor.DeviceName = collector.Name;  // Set the collector name
            }
            else
            {
                throw new Exception($"Collector with ID {collectorId} not found.");
            }

            // Add the sensor to the database
            var addedSensor = await _sensorsDbManager.AddSensorAsync(newSensor);
            return addedSensor;
        }

        public async Task CloneSensorsForJunctionAsync(int junctionId, List<Model_Sensor> sensors)
        {
            int insertedCount = 0;

            // Fetch all device links and collector links for the given junction
            var deviceLinks = await _linkDb.GetDeviceLinksByJunctionAsync(junctionId);
            var collectorLinks = await _linkDb.GetCollectorLinksByJunctionAsync(junctionId);

            foreach (var sensor in sensors)
            {
                // Check if a sensor with the same ExternalId already exists in JunctionSensors
                var existingSensor = await _sensorsDbManager.GetSensorByExternalIdAsync(junctionId, sensor.ExternalId);
                if (existingSensor != null)
                {
                    continue;  // Skip cloning if the sensor already exists
                }

                // Variable to store the JunctionDeviceLinkId or JunctionCollectorLinkId
                int? junctionLinkId = null;

                if (sensor.DeviceId.HasValue)
                {
                    var deviceLink = deviceLinks.FirstOrDefault(dl => dl.DeviceId == sensor.DeviceId);
                    if (deviceLink != null)
                    {
                        junctionLinkId = deviceLink.Id;
                    }
                }
                else if (sensor.CollectorId.HasValue)
                {
                    var collectorLink = collectorLinks.FirstOrDefault(cl => cl.CollectorId == sensor.CollectorId);
                    if (collectorLink != null)
                    {
                        junctionLinkId = collectorLink.Id;
                    }
                }

                if (junctionLinkId.HasValue)
                {
                    // Clone the sensor for the current junction
                    var clonedSensor = sensor.Clone();
                    clonedSensor.JunctionId = junctionId;
                    clonedSensor.JunctionDeviceLinkId = sensor.DeviceId.HasValue ? junctionLinkId.Value : (int?)null;
                    clonedSensor.JunctionCollectorLinkId = sensor.CollectorId.HasValue ? junctionLinkId.Value : (int?)null;
                    clonedSensor.LastUpdated = DateTime.UtcNow;

                    // Set the SensorOrder to the current incremented value
                    var maxSensorOrder = await _sensorsDbManager.GetMaxSensorOrderAsync(junctionId);
                    clonedSensor.SensorOrder = (maxSensorOrder ?? 0) + 1;  // Increment the order

                    try
                    {
                        await _sensorsDbManager.InsertJunctionSensorsAsync(junctionId, new List<Model_Sensor> { clonedSensor });
                        insertedCount++;
                    }
                    catch (Exception ex)
                    {
                        // Handle and log any errors during insert
                        Console.WriteLine($"❌ Error inserting sensor {sensor.ExternalId} into JunctionSensors: {ex.Message}");
                    }
                }
            }

            // Console.WriteLine($"✅ Cloned {insertedCount} sensors for junction {junctionId}.");
        }
    }
}
