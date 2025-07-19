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

using Microsoft.AspNetCore.Mvc;
using JunctionRelayServer.Models;
using JunctionRelayServer.Services;
using JunctionRelayServer.Interfaces;

namespace JunctionRelayServer.Controllers
{
    [Route("api/collectors")]
    [ApiController]
    public class Controller_Collectors : ControllerBase
    {
        private readonly Service_Database_Manager_Collectors _collectorDb;
        private readonly Service_Database_Manager_Sensors _sensorDb;  // Injected service for accessing sensors
        private readonly Func<Model_Collector, IDataCollector> _dataCollectorFactory; // Injected factory for flexibility
        private readonly Service_Manager_Polling _pollingManager;

        // Constructor - Inject Service_Database_Manager_Collectors, Service_Database_Manager_Sensors, and the factory
        public Controller_Collectors(
                Service_Database_Manager_Collectors collectorDb,
                Service_Database_Manager_Sensors sensorDb,
                Func<Model_Collector, IDataCollector> dataCollectorFactory,
                Service_Manager_Polling pollingManager) // <- NEW
        {
            _collectorDb = collectorDb;
            _sensorDb = sensorDb;
            _dataCollectorFactory = dataCollectorFactory;
            _pollingManager = pollingManager; // <- NEW
        }

        // GET: /api/collectors/pollers
        [HttpGet("pollers")]
        public IActionResult GetActivePollers()
        {
            var activePollers = _pollingManager.GetActivePollers();
            return Ok(new { activePollers }); // Always returns 200, even if empty
        }



        // POST: /api/collectors
        [HttpPost]
        public async Task<IActionResult> AddCollector([FromBody] Model_Collector newCollector)
        {
            try
            {
                // Add the new collector to the database
                var added = await _collectorDb.AddCollectorAsync(newCollector);
                return CreatedAtAction(nameof(GetCollectorById), new { id = added.Id }, added);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error adding collector: {ex.Message}");
            }
        }

        // GET: /api/collectors/{id}
        [HttpGet("{id}")]
        public async Task<IActionResult> GetCollectorById(int id)
        {
            var collector = await _collectorDb.GetCollectorByIdAsync(id);
            return collector == null ? NotFound() : Ok(collector);
        }

        // GET: /api/collectors
        [HttpGet]
        public async Task<IActionResult> GetAllCollectors()
        {
            try
            {
                // Fetch all collectors from the database
                var collectors = await _collectorDb.GetAllCollectorsAsync();
                return Ok(collectors);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error fetching collectors: {ex.Message}");
            }
        }

        // GET: /api/collectors/{id}/testConnection
        [HttpGet("{id}/testConnection")]
        public async Task<IActionResult> TestConnection(int id)
        {
            var collector = await _collectorDb.GetCollectorByIdAsync(id);
            if (collector == null) return NotFound();

            try
            {
                // Use the factory to get the correct IDataCollector based on the collector type
                var dataCollector = _dataCollectorFactory(collector);

                // Apply configuration using collector's URL and AccessToken (specific to the collector)
                dataCollector.ApplyConfiguration(collector);

                // Test connection
                var success = await dataCollector.TestConnectionAsync(collector);
                return success ? Ok(new { status = "Connection successful" }) : StatusCode(500, new { status = "Connection failed" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error testing connection: {ex.Message}");
            }
        }

        // GET: /api/collectors/{id}/sensors
        [HttpGet("{id}/sensors")]
        public async Task<IActionResult> GetSensorsByCollectorId(int id)
        {
            var collector = await _collectorDb.GetCollectorByIdAsync(id);
            if (collector == null) return NotFound();

            try
            {
                // Use the factory to get the correct IDataCollector based on the collector type
                var dataCollector = _dataCollectorFactory(collector);

                // Fetch current sensors from the collector (external source)
                var currentSensors = await dataCollector.FetchSensorsAsync(collector);

                // Only fetch stored sensors from the database (no need for AccessToken here)
                var storedSensors = await _sensorDb.GetSensorsByCollectorIdAsync(id);

                return Ok(new { StoredSensors = storedSensors, CurrentSensors = currentSensors });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error fetching stored sensors: {ex.Message}");
            }
        }

        // GET: /api/collectors/{id}/sensors/delta
        [HttpGet("{id}/sensors/delta")]
        public async Task<IActionResult> GetDeltaSensorsForCollector(int id)
        {
            var collector = await _collectorDb.GetCollectorByIdAsync(id);
            if (collector == null) return NotFound();

            try
            {
                // Use the factory to get the correct IDataCollector based on the collector type
                var dataCollector = _dataCollectorFactory(collector);

                // Apply configuration using collector's URL and AccessToken (specific to the collector)
                dataCollector.ApplyConfiguration(collector);
                Console.WriteLine($"Configuration applied for collector: {collector.Name}");

                // Fetch current sensors from the collector (external source)
                var currentSensors = await dataCollector.FetchSensorsAsync(collector);
                Console.WriteLine($"Fetched {currentSensors.Count} current sensors from the collector.");

                // Fetch previously stored sensors from the database
                var storedSensors = await _sensorDb.GetSensorsByCollectorIdAsync(id);
                Console.WriteLine($"Fetched {storedSensors.Count} stored sensors from the database.");

                // 1. Create a lookup for current values by ExternalId
                var currentLookup = currentSensors
                    .GroupBy(s => s.ExternalId)
                    .Select(g => g.First()) // take the first occurrence
                    .ToDictionary(s => s.ExternalId, s => s);


                // 2. Update matching stored sensors with latest values
                foreach (var stored in storedSensors)
                {
                    if (currentLookup.TryGetValue(stored.ExternalId, out var latest))
                    {
                        stored.Value = latest.Value;
                        await _sensorDb.UpdateSensorAsync(stored.Id, stored); // Persist the change
                    }
                }

                // Detect deltas: sensors that exist in one but not the other
                var deltaSensors = new List<Model_Sensor>();

                // Add sensors from the collector (external source) that do not exist in the database
                foreach (var currentSensor in currentSensors)
                {
                    var storedSensor = storedSensors.FirstOrDefault(s => s.ExternalId == currentSensor.ExternalId);
                    if (storedSensor == null)
                    {
                        // If the sensor does not exist in the database, it's a new sensor (delta)
                        // Console.WriteLine($"New delta sensor found (not in stored sensors): {currentSensor.Name}");
                        deltaSensors.Add(currentSensor);
                    }
                }

                // Add sensors from the database that do not exist in the collector (external source)
                foreach (var storedSensor in storedSensors)
                {
                    var currentSensor = currentSensors.FirstOrDefault(s => s.ExternalId == storedSensor.ExternalId);
                    if (currentSensor == null)
                    {
                        // If the sensor does not exist in the collector, it's a missing sensor (delta)
                        // Console.WriteLine($"Missing delta sensor found (not in current sensors): {storedSensor.Name}");
                        deltaSensors.Add(storedSensor);
                    }
                }

                // Debug: Log number of delta sensors
                Console.WriteLine($"Found {deltaSensors.Count} delta sensors.");

                // Return delta sensors
                return Ok(deltaSensors);
            }
            catch (Exception ex)
            {
                // Log the error for debugging purposes
                Console.WriteLine($"Error fetching delta sensors: {ex.Message}");
                return StatusCode(500, $"Error fetching delta sensors: {ex.Message}");
            }
        }

        // DELETE: /api/collectors/{id}
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteCollector(int id)
        {
            try
            {
                var deleted = await _collectorDb.DeleteCollectorAsync(id);
                if (!deleted) return NotFound($"Collector with ID {id} not found.");
                return NoContent();
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error deleting collector: {ex.Message}");
            }
        }
    }
}
