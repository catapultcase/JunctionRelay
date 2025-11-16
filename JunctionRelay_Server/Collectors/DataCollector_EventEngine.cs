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
    public class DataCollector_EventEngine : IDataCollector
    {
        public string CollectorName => "Events";
        public int CollectorId { get; private set; }

        private readonly Service_Manager_Events _eventManager;

        public DataCollector_EventEngine(Service_Manager_Events eventManager)
        {
            _eventManager = eventManager;
        }

        public void ApplyConfiguration(Model_Collector collector)
        {
            CollectorId = collector.Id;
        }

        public async Task<List<Model_Sensor>> FetchSensorsAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);

            try
            {
                var eventSensors = await _eventManager.GetAllEventSensorsAsync();
                var sensors = new List<Model_Sensor>();

                foreach (var eventSensor in eventSensors)
                {
                    var sensor = new Model_Sensor
                    {
                        CollectorId = collector.Id,
                        ExternalId = eventSensor.ExternalId,
                        Name = eventSensor.Name,
                        ComponentName = eventSensor.ComponentName,
                        Value = eventSensor.Value,
                        Unit = eventSensor.Unit,
                        DecimalPlaces = eventSensor.DecimalPlaces,
                        SensorTag = eventSensor.SensorTag,
                        SensorType = eventSensor.SensorType,
                        Category = eventSensor.Category,
                        DeviceName = collector.Name,
                        MQTTQoS = 1,
                        Formula = eventSensor.Formula,
                        IsEventSensor = true,
                        IsSelected = eventSensor.IsSelected,
                        IsVisible = eventSensor.IsVisible,
                        LastUpdated = eventSensor.LastUpdated,
                        CustomAttribute1 = eventSensor.CustomAttribute1,
                        CustomAttribute2 = eventSensor.CustomAttribute2,
                        CustomAttribute3 = eventSensor.CustomAttribute3,
                        CustomAttribute4 = eventSensor.CustomAttribute4,
                        CustomAttribute5 = eventSensor.CustomAttribute5,
                        CustomAttribute6 = eventSensor.CustomAttribute6,
                        CustomAttribute7 = eventSensor.CustomAttribute7,
                        CustomAttribute8 = eventSensor.CustomAttribute8,
                        CustomAttribute9 = eventSensor.CustomAttribute9,
                        CustomAttribute10 = eventSensor.CustomAttribute10
                    };

                    sensors.Add(sensor);
                }

                // Console.WriteLine($"[DATACOLLECTOR_EVENTS] Fetched {sensors.Count} event sensors for collector {collector.Name}");
                return sensors;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DATACOLLECTOR_EVENTS] Error fetching event sensors: {ex.Message}");
                return new List<Model_Sensor>();
            }
        }

        public async Task<List<Model_Sensor>> FetchSelectedSensorsAsync(Model_Collector collector, List<string> selectedSensorIds, CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);

            try
            {
                var allEventSensors = await FetchSensorsAsync(collector, cancellationToken);
                var selectedSensors = allEventSensors.Where(s =>
                    selectedSensorIds.Contains(s.ExternalId) ||
                    selectedSensorIds.Contains(s.SensorTag) ||
                    selectedSensorIds.Contains(s.Id.ToString())
                ).ToList();

                // Console.WriteLine($"[DATACOLLECTOR_EVENTS] Fetched {selectedSensors.Count} selected event sensors for collector {collector.Name}");
                return selectedSensors;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DATACOLLECTOR_EVENTS] Error fetching selected event sensors: {ex.Message}");
                return new List<Model_Sensor>();
            }
        }

        public Task<bool> TestConnectionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            try
            {
                return Task.FromResult(true);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DATACOLLECTOR_EVENTS] Connection test failed: {ex.Message}");
                return Task.FromResult(false);
            }
        }

        public Task StartSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            Console.WriteLine($"[DATACOLLECTOR_EVENTS] Started session for collector {collector.Name} (ID: {collector.Id})");
            return Task.CompletedTask;
        }

        public Task StopSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            Console.WriteLine($"[DATACOLLECTOR_EVENTS] Stopped session for collector {collector.Name} (ID: {collector.Id})");
            return Task.CompletedTask;
        }

        public bool IsConnected(Model_Collector collector) => true;

        public async Task<bool> UpdateEventSensorValueAsync(string sensorTag, string newValue)
        {
            try
            {
                var success = await _eventManager.UpdateEventSensorValueByTagAsync(sensorTag, newValue);
                if (success)
                {
                    Console.WriteLine($"[DATACOLLECTOR_EVENTS] Updated event sensor '{sensorTag}' to value '{newValue}'");
                }
                else
                {
                    Console.WriteLine($"[DATACOLLECTOR_EVENTS] Failed to update event sensor '{sensorTag}' - sensor not found");
                }
                return success;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DATACOLLECTOR_EVENTS] Error updating event sensor '{sensorTag}': {ex.Message}");
                return false;
            }
        }

        public async Task<Model_Sensor?> GetEventSensorByTagAsync(string sensorTag)
        {
            try
            {
                var eventSensor = await _eventManager.GetEventSensorByTagAsync(sensorTag);
                if (eventSensor != null)
                {
                    return new Model_Sensor
                    {
                        CollectorId = CollectorId,
                        ExternalId = eventSensor.ExternalId,
                        Name = eventSensor.Name,
                        ComponentName = eventSensor.ComponentName,
                        Value = eventSensor.Value,
                        Unit = eventSensor.Unit,
                        DecimalPlaces = eventSensor.DecimalPlaces,
                        SensorTag = eventSensor.SensorTag,
                        SensorType = eventSensor.SensorType,
                        Category = eventSensor.Category,
                        DeviceName = "Events",
                        MQTTQoS = 1,
                        Formula = eventSensor.Formula,
                        IsEventSensor = true,
                        IsSelected = eventSensor.IsSelected,
                        IsVisible = eventSensor.IsVisible,
                        LastUpdated = eventSensor.LastUpdated,
                        CustomAttribute1 = eventSensor.CustomAttribute1,
                        CustomAttribute2 = eventSensor.CustomAttribute2,
                        CustomAttribute3 = eventSensor.CustomAttribute3,
                        CustomAttribute4 = eventSensor.CustomAttribute4,
                        CustomAttribute5 = eventSensor.CustomAttribute5,
                        CustomAttribute6 = eventSensor.CustomAttribute6,
                        CustomAttribute7 = eventSensor.CustomAttribute7,
                        CustomAttribute8 = eventSensor.CustomAttribute8,
                        CustomAttribute9 = eventSensor.CustomAttribute9,
                        CustomAttribute10 = eventSensor.CustomAttribute10
                    };
                }
                return null;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DATACOLLECTOR_EVENTS] Error getting event sensor by tag '{sensorTag}': {ex.Message}");
                return null;
            }
        }

        public async Task<List<Model_Sensor>> GetEnabledEventSensorsAsync(Model_Collector collector)
        {
            try
            {
                var allEventSensors = await FetchSensorsAsync(collector);
                var enabledSensors = allEventSensors.Where(s => s.IsSelected).ToList();

                Console.WriteLine($"[DATACOLLECTOR_EVENTS] Found {enabledSensors.Count} enabled event sensors for collector {collector.Name}");
                return enabledSensors;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DATACOLLECTOR_EVENTS] Error getting enabled event sensors: {ex.Message}");
                return new List<Model_Sensor>();
            }
        }

        public async Task<bool> ToggleEventSensorAsync(string sensorTag, bool isSelected)
        {
            try
            {
                var eventSensor = await _eventManager.GetEventSensorByTagAsync(sensorTag);
                if (eventSensor == null)
                {
                    Console.WriteLine($"[DATACOLLECTOR_EVENTS] Event sensor with tag '{sensorTag}' not found");
                    return false;
                }

                var success = await _eventManager.ToggleEventSensorAsync(eventSensor.Id, isSelected);
                if (success)
                {
                    Console.WriteLine($"[DATACOLLECTOR_EVENTS] Toggled event sensor '{sensorTag}' to {(isSelected ? "enabled" : "disabled")}");
                }
                return success;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DATACOLLECTOR_EVENTS] Error toggling event sensor '{sensorTag}': {ex.Message}");
                return false;
            }
        }
    }
}