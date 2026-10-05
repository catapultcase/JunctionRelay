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
using System.Collections.Concurrent;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_Events : IDisposable
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private Timer? _saveTimer;

        public int CacheSaveIntervalMs { get; set; } = 30_000;
        private const string EVENT_ENGINE_COLLECTOR_NAME = "EventEngine";

        private readonly ConcurrentDictionary<int, Model_Sensor> _eventSensorCache = new();
        private readonly ConcurrentDictionary<int, DateTime> _lastCacheSave = new();
        private readonly object _initLock = new object();
        private bool _isInitialized = false;
        private int? _eventEngineCollectorId = null;

        public Service_Manager_Events(IServiceScopeFactory scopeFactory)
        {
            _scopeFactory = scopeFactory;
            StartTimers();
        }

        private void StartTimers()
        {
            _saveTimer = new Timer(async _ => await SaveDirtyEventSensorsAsync(),
                                  null,
                                  TimeSpan.FromMilliseconds(CacheSaveIntervalMs),
                                  TimeSpan.FromMilliseconds(CacheSaveIntervalMs));
        }

        private async Task<int> EnsureEventEngineCollectorAsync()
        {
            if (_eventEngineCollectorId.HasValue)
                return _eventEngineCollectorId.Value;

            try
            {
                using var scope = _scopeFactory.CreateScope();
                var collectorDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Collectors>();

                // Try to find existing EventEngine collector
                var allCollectors = await collectorDb.GetAllCollectorsAsync();
                var eventEngineCollector = allCollectors.FirstOrDefault(c =>
                    string.Equals(c.Name, EVENT_ENGINE_COLLECTOR_NAME, StringComparison.OrdinalIgnoreCase));

                if (eventEngineCollector != null)
                {
                    _eventEngineCollectorId = eventEngineCollector.Id;
                    Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Found existing EventEngine collector (ID: {eventEngineCollector.Id})");
                    return eventEngineCollector.Id;
                }

                // Create new EventEngine collector
                var newCollector = new Model_Collector
                {
                    Name = EVENT_ENGINE_COLLECTOR_NAME,
                    CollectorType = "EventEngine",
                    Description = "Automatically created collector for managing event sensors",
                    URL = "",
                    AccessToken = "",
                    ExternalAccessToken = false,
                    PollRate = 5000, // 5 second default poll rate
                    SendRate = 5000, // 5 second default send rate
                    ServiceId = null,
                    DecimalPlaces = 2,
                    TestFrequency = 0, // No testing needed for event sensors
                    Status = "Active" // Required field
                };

                var createdCollector = await collectorDb.AddCollectorAsync(newCollector);

                if (createdCollector?.Id > 0)
                {
                    _eventEngineCollectorId = createdCollector.Id;
                    Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Created new EventEngine collector (ID: {createdCollector.Id})");
                    return createdCollector.Id;
                }
                else
                {
                    throw new InvalidOperationException("Failed to create EventEngine collector - invalid ID returned");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Error ensuring EventEngine collector: {ex.Message}");
                throw;
            }
        }

        private async Task InitializeCacheAsync()
        {
            if (_isInitialized) return;

            lock (_initLock)
            {
                if (_isInitialized) return;

                try
                {
                    _ = Task.Run(async () =>
                    {
                        using var scope = _scopeFactory.CreateScope();
                        var sensorDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Sensors>();

                        // Ensure EventEngine collector exists
                        await EnsureEventEngineCollectorAsync();

                        var allSensors = await sensorDb.GetAllSensorsAsync();
                        var eventSensors = allSensors.Where(s => s.IsEventSensor).ToList();

                        foreach (var sensor in eventSensors)
                        {
                            _eventSensorCache[sensor.Id] = sensor;
                        }

                        Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Loaded {eventSensors.Count} event sensors into cache");
                    });

                    _isInitialized = true;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Error initializing event sensor cache: {ex.Message}");
                }
            }
        }

        private async Task SaveDirtyEventSensorsAsync()
        {
            try
            {
                var now = DateTime.UtcNow;
                var sensorsToSave = new List<Model_Sensor>();

                foreach (var kvp in _eventSensorCache)
                {
                    var sensorId = kvp.Key;
                    var sensor = kvp.Value;

                    if (!_lastCacheSave.TryGetValue(sensorId, out var lastSaved) ||
                        (now - lastSaved).TotalMilliseconds >= CacheSaveIntervalMs)
                    {
                        sensorsToSave.Add(sensor);
                        _lastCacheSave[sensorId] = now;
                    }
                }

                if (sensorsToSave.Count > 0)
                {
                    using var scope = _scopeFactory.CreateScope();
                    var sensorDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Sensors>();

                    foreach (var sensor in sensorsToSave)
                    {
                        // Only update the Value field for periodic saves
                        await sensorDb.UpdateSensorValueAsync(sensor.Id, sensor);
                    }

                    Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Saved {sensorsToSave.Count} dirty event sensor values to database");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Error saving dirty event sensors: {ex.Message}");
            }
        }

        public async Task<IEnumerable<Model_Sensor>> GetAllEventSensorsAsync()
        {
            await InitializeCacheAsync();
            return _eventSensorCache.Values.ToList();
        }

        public async Task<Model_Sensor?> GetEventSensorAsync(int sensorId)
        {
            await InitializeCacheAsync();
            return _eventSensorCache.TryGetValue(sensorId, out var sensor) ? sensor : null;
        }

        public async Task<Model_Sensor?> GetEventSensorByTagAsync(string sensorTag)
        {
            await InitializeCacheAsync();
            return _eventSensorCache.Values.FirstOrDefault(s =>
                string.Equals(s.SensorTag, sensorTag, StringComparison.OrdinalIgnoreCase));
        }

        public async Task<Model_Sensor> CreateEventSensorAsync(Model_Sensor newEventSensor)
        {
            try
            {
                await InitializeCacheAsync();

                // Ensure EventEngine collector exists and get its ID
                var eventEngineCollectorId = await EnsureEventEngineCollectorAsync();

                newEventSensor.IsEventSensor = true;
                newEventSensor.CollectorId = eventEngineCollectorId; // Automatically assign to EventEngine collector
                newEventSensor.LastUpdated = DateTime.UtcNow;

                using var scope = _scopeFactory.CreateScope();
                var sensorDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Sensors>();

                var createdSensor = await sensorDb.AddSensorAsync(newEventSensor);
                _eventSensorCache[createdSensor.Id] = createdSensor;
                _lastCacheSave[createdSensor.Id] = DateTime.UtcNow;

                Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Created event sensor: {createdSensor.Name} (ID: {createdSensor.Id}) assigned to EventEngine collector (ID: {eventEngineCollectorId})");
                return createdSensor;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Error creating event sensor: {ex.Message}");
                throw;
            }
        }

        public async Task<bool> UpdateEventSensorAsync(int sensorId, Model_Sensor updatedSensor)
        {
            try
            {
                await InitializeCacheAsync();

                if (!_eventSensorCache.ContainsKey(sensorId))
                {
                    Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Event sensor {sensorId} not found in cache");
                    return false;
                }

                // Ensure EventEngine collector exists and assign sensor to it
                var eventEngineCollectorId = await EnsureEventEngineCollectorAsync();

                updatedSensor.Id = sensorId;
                updatedSensor.IsEventSensor = true;
                updatedSensor.CollectorId = eventEngineCollectorId; // Always ensure it's assigned to EventEngine
                updatedSensor.LastUpdated = DateTime.UtcNow;

                // Update cache immediately
                _eventSensorCache[sensorId] = updatedSensor;

                // Write to database immediately for full sensor updates (not just value changes)
                using var scope = _scopeFactory.CreateScope();
                var sensorDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Sensors>();
                await sensorDb.UpdateSensorAsync(sensorId, updatedSensor);

                // Mark as saved
                _lastCacheSave[sensorId] = DateTime.UtcNow;

                Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Updated event sensor: {updatedSensor.Name} (ID: {sensorId}) assigned to EventEngine collector");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Error updating event sensor {sensorId}: {ex.Message}");
                return false;
            }
        }

        public async Task<bool> UpdateEventSensorValueAsync(int sensorId, string newValue)
        {
            try
            {
                await InitializeCacheAsync();

                if (!_eventSensorCache.TryGetValue(sensorId, out var sensor))
                {
                    Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Event sensor {sensorId} not found in cache");
                    return false;
                }

                sensor.Value = newValue;
                sensor.LastUpdated = DateTime.UtcNow;

                _eventSensorCache[sensorId] = sensor;

                Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Updated event sensor value: {sensor.Name} = {newValue}");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Error updating event sensor value {sensorId}: {ex.Message}");
                return false;
            }
        }

        public async Task<bool> UpdateEventSensorValueByTagAsync(string sensorTag, string newValue)
        {
            try
            {
                await InitializeCacheAsync();

                var sensor = _eventSensorCache.Values.FirstOrDefault(s =>
                    string.Equals(s.SensorTag, sensorTag, StringComparison.OrdinalIgnoreCase));

                if (sensor == null)
                {
                    Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Event sensor with tag '{sensorTag}' not found in cache");
                    return false;
                }

                sensor.Value = newValue;
                sensor.LastUpdated = DateTime.UtcNow;

                _eventSensorCache[sensor.Id] = sensor;

                // Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Updated event sensor value by tag: {sensorTag} = {newValue}");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Error updating event sensor value by tag '{sensorTag}': {ex.Message}");
                return false;
            }
        }

        public async Task<bool> DeleteEventSensorAsync(int sensorId)
        {
            try
            {
                await InitializeCacheAsync();

                using var scope = _scopeFactory.CreateScope();
                var sensorDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Sensors>();

                var success = await sensorDb.DeleteSensorAsync(sensorId);
                if (success)
                {
                    _eventSensorCache.TryRemove(sensorId, out _);
                    _lastCacheSave.TryRemove(sensorId, out _);
                    Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Deleted event sensor: ID {sensorId}");
                }

                return success;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Error deleting event sensor {sensorId}: {ex.Message}");
                return false;
            }
        }

        public async Task<bool> ToggleEventSensorAsync(int sensorId, bool isSelected)
        {
            try
            {
                await InitializeCacheAsync();

                if (!_eventSensorCache.TryGetValue(sensorId, out var sensor))
                {
                    Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Event sensor {sensorId} not found in cache");
                    return false;
                }

                sensor.IsSelected = isSelected;
                sensor.LastUpdated = DateTime.UtcNow;

                // Update cache
                _eventSensorCache[sensorId] = sensor;

                // Write to database immediately for toggle changes
                using var scope = _scopeFactory.CreateScope();
                var sensorDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Sensors>();
                await sensorDb.UpdateSensorAsync(sensorId, sensor);

                // Mark as saved
                _lastCacheSave[sensorId] = DateTime.UtcNow;

                Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Toggled event sensor: {sensor.Name} = {(isSelected ? "enabled" : "disabled")}");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Error toggling event sensor {sensorId}: {ex.Message}");
                return false;
            }
        }

        public async Task RefreshCacheAsync()
        {
            try
            {
                _eventSensorCache.Clear();
                _lastCacheSave.Clear();
                _isInitialized = false;
                _eventEngineCollectorId = null; // Reset collector ID cache

                await InitializeCacheAsync();
                Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Event sensor cache refreshed");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_MANAGER_EVENTS] Error refreshing cache: {ex.Message}");
            }
        }

        public void Dispose()
        {
            _saveTimer?.Dispose();
        }
    }
}