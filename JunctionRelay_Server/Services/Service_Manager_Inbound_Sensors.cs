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
using Microsoft.Extensions.DependencyInjection;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_Inbound_Sensors
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly Dictionary<string, Model_Sensor> _inboundSensorCache = new();
        private readonly object _cacheLock = new object();

        public Service_Manager_Inbound_Sensors(IServiceScopeFactory scopeFactory)
        {
            _scopeFactory = scopeFactory;
            Console.WriteLine("[SERVICE_MANAGER_INBOUND_SENSORS] Service initialized");
        }

        public void UpdateInboundSensorData(Model_Sensor sensor)
        {
            if (!sensor.JunctionId.HasValue)
            {
                Console.WriteLine("[SERVICE_MANAGER_INBOUND_SENSORS] Sensor missing JunctionId, cannot cache as inbound");
                return;
            }

            string externalId = sensor.ExternalId;
            string cacheKey = $"{sensor.JunctionId}_{externalId}";

            lock (_cacheLock)
            {
                _inboundSensorCache[cacheKey] = sensor;
            }

            Console.WriteLine($"[SERVICE_MANAGER_INBOUND_SENSORS] Updated inbound sensor cache: {sensor.Name} (ID: {sensor.Id})");
        }

        public async Task<bool> ProcessInboundSensorUpdateAsync(
            int junctionId,
            string deviceMac,
            string sensorKey,
            string value,
            string sensorType = "Analog",
            string? deviceName = null,
            string? unit = null,
            string? category = null,
            string? componentName = null)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(deviceMac))
                {
                    Console.WriteLine("[SERVICE_MANAGER_INBOUND_SENSORS] Device MAC cannot be empty");
                    return false;
                }

                if (string.IsNullOrWhiteSpace(sensorKey))
                {
                    Console.WriteLine("[SERVICE_MANAGER_INBOUND_SENSORS] Sensor key cannot be empty");
                    return false;
                }

                string externalId = $"{deviceMac}_{sensorKey}";
                string cacheKey = $"{junctionId}_{externalId}";

                Console.WriteLine($"[SERVICE_MANAGER_INBOUND_SENSORS] Processing inbound sensor: Junction {junctionId}, Device {deviceMac}, Sensor {sensorKey}, Value {value}");

                Model_Sensor? existingSensor = null;
                lock (_cacheLock)
                {
                    _inboundSensorCache.TryGetValue(cacheKey, out existingSensor);
                }

                using var scope = _scopeFactory.CreateScope();
                var sensorDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Sensors>();
                var deviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();

                if (existingSensor != null)
                {
                    existingSensor.Value = value;
                    existingSensor.LastUpdated = DateTime.UtcNow;

                    await sensorDb.UpdateSensorValueAsync(existingSensor.Id, existingSensor);
                    UpdateInboundSensorData(existingSensor);

                    Console.WriteLine($"[SERVICE_MANAGER_INBOUND_SENSORS] Updated existing inbound sensor {existingSensor.Id} with value {value}");
                    return true;
                }

                int? deviceId = null;
                if (!string.IsNullOrWhiteSpace(deviceMac))
                {
                    var devices = await deviceDb.GetAllDevicesAsync();
                    var device = devices.FirstOrDefault(d =>
                        string.Equals(d.UniqueIdentifier, deviceMac, StringComparison.OrdinalIgnoreCase));
                    deviceId = device?.Id;

                    if (string.IsNullOrWhiteSpace(deviceName) && device != null)
                    {
                        deviceName = device.Name;
                    }
                }

                var inboundSensor = new Model_Sensor
                {
                    OriginalId = 0,
                    JunctionId = junctionId,
                    SensorType = sensorType,
                    ExternalId = externalId,
                    DeviceName = deviceName ?? $"Device-{deviceMac}",
                    Name = $"{sensorKey} (Inbound)",
                    ComponentName = componentName ?? sensorKey,
                    Category = category ?? "Inbound",
                    Unit = unit ?? "",
                    Value = value,
                    DecimalPlaces = DetermineDecimalPlaces(value),
                    SensorTag = $"inbound_{sensorKey}",
                    DeviceId = deviceId,
                    IsMissing = false,
                    IsStale = false,
                    IsSelected = true,
                    IsVisible = true,
                    LastUpdated = DateTime.UtcNow
                };

                var createdSensor = await sensorDb.AddSensorAsync(inboundSensor);

                createdSensor.OriginalId = createdSensor.Id;
                await sensorDb.UpdateSensorAsync(createdSensor.Id, createdSensor);

                UpdateInboundSensorData(createdSensor);

                Console.WriteLine($"[SERVICE_MANAGER_INBOUND_SENSORS] Created new inbound sensor {createdSensor.Id} for junction {junctionId}");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_INBOUND_SENSORS] Error processing inbound sensor: {ex.Message}");
                return false;
            }
        }

        public async Task<int> ProcessInboundSensorBatchAsync(
            int junctionId,
            string deviceMac,
            Dictionary<string, object> sensorData,
            string defaultSensorType = "Analog")
        {
            int successCount = 0;

            foreach (var kvp in sensorData)
            {
                string sensorKey = kvp.Key;
                string value = kvp.Value?.ToString() ?? "";

                bool success = await ProcessInboundSensorUpdateAsync(
                    junctionId, deviceMac, sensorKey, value, defaultSensorType);

                if (success)
                {
                    successCount++;
                }
            }

            Console.WriteLine($"[SERVICE_MANAGER_INBOUND_SENSORS] Batch processed: {successCount}/{sensorData.Count} sensors successful");
            return successCount;
        }

        public IEnumerable<Model_Sensor> GetAllInboundSensors()
        {
            lock (_cacheLock)
            {
                return _inboundSensorCache.Values.ToList();
            }
        }

        public IEnumerable<Model_Sensor> GetInboundSensorsByJunctionId(int junctionId)
        {
            lock (_cacheLock)
            {
                return _inboundSensorCache.Values
                    .Where(s => s.JunctionId == junctionId)
                    .ToList();
            }
        }

        public Model_Sensor? GetInboundSensorById(int sensorId)
        {
            lock (_cacheLock)
            {
                return _inboundSensorCache.Values
                    .FirstOrDefault(s => s.Id == sensorId);
            }
        }

        public Model_Sensor? GetInboundSensorByKey(int junctionId, string deviceMac, string sensorKey)
        {
            string externalId = $"{deviceMac}_{sensorKey}";
            string cacheKey = $"{junctionId}_{externalId}";

            lock (_cacheLock)
            {
                _inboundSensorCache.TryGetValue(cacheKey, out var sensor);
                return sensor;
            }
        }

        public async Task<List<Model_Sensor>> GetInboundSensorsForJunctionAsync(int junctionId)
        {
            using var scope = _scopeFactory.CreateScope();
            var sensorDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Sensors>();

            var allSensors = await sensorDb.GetAllSensorsAsync();
            return allSensors.Where(s => s.JunctionId == junctionId).ToList();
        }

        public async Task<bool> ClearInboundSensorsForJunctionAsync(int junctionId)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var sensorDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Sensors>();

                var inboundSensors = await GetInboundSensorsForJunctionAsync(junctionId);

                foreach (var sensor in inboundSensors)
                {
                    await sensorDb.DeleteSensorAsync(sensor.Id);
                }

                lock (_cacheLock)
                {
                    var keysToRemove = _inboundSensorCache.Keys
                        .Where(k => k.StartsWith($"{junctionId}_"))
                        .ToList();

                    foreach (var key in keysToRemove)
                    {
                        _inboundSensorCache.Remove(key);
                    }
                }

                Console.WriteLine($"[SERVICE_MANAGER_INBOUND_SENSORS] Cleared {inboundSensors.Count} inbound sensors for junction {junctionId}");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_INBOUND_SENSORS] Error clearing inbound sensors: {ex.Message}");
                return false;
            }
        }

        public async Task<object> GetInboundSensorStatisticsAsync()
        {
            using var scope = _scopeFactory.CreateScope();
            var sensorDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Sensors>();

            var allSensors = await sensorDb.GetAllSensorsAsync();
            var inboundSensors = allSensors.Where(s => s.JunctionId.HasValue).ToList();

            var stats = new
            {
                TotalInboundSensors = inboundSensors.Count,
                SensorsByJunction = inboundSensors
                    .GroupBy(s => s.JunctionId)
                    .ToDictionary(g => g.Key, g => g.Count()),
                SensorsByType = inboundSensors
                    .GroupBy(s => s.SensorType)
                    .ToDictionary(g => g.Key, g => g.Count()),
                SensorsByDevice = inboundSensors
                    .GroupBy(s => s.DeviceName)
                    .ToDictionary(g => g.Key, g => g.Count()),
                CacheSize = _inboundSensorCache.Count,
                RecentUpdates = inboundSensors
                    .Where(s => (DateTime.UtcNow - s.LastUpdated).TotalMinutes < 5)
                    .Count()
            };

            return stats;
        }

        public async Task<bool> ValidateInboundSensorSourceAsync(int junctionId, string deviceMac)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var deviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();

                var devices = await deviceDb.GetAllDevicesAsync();
                var device = devices.FirstOrDefault(d =>
                    string.Equals(d.UniqueIdentifier, deviceMac, StringComparison.OrdinalIgnoreCase));

                if (device == null)
                {
                    Console.WriteLine($"[SERVICE_MANAGER_INBOUND_SENSORS] Warning: Device {deviceMac} not found in database, but accepting inbound data");
                }

                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_INBOUND_SENSORS] Error validating inbound source: {ex.Message}");
                return false;
            }
        }

        private int DetermineDecimalPlaces(string value)
        {
            if (decimal.TryParse(value, out decimal decimalValue))
            {
                string[] parts = value.Split('.');
                if (parts.Length == 2)
                {
                    return Math.Min(parts[1].Length, 6);
                }
            }
            return 0;
        }

        public void ClearCache()
        {
            lock (_cacheLock)
            {
                _inboundSensorCache.Clear();
            }
            Console.WriteLine("[SERVICE_MANAGER_INBOUND_SENSORS] Cache cleared");
        }
    }
}