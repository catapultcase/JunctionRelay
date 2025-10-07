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
using JunctionRelayServer.Extensions;

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
                var added = await _collectorDb.AddCollectorAsync(newCollector);
                return CreatedAtAction(nameof(GetCollectorById), new { id = added.Id }, added.ToResponse());
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
            return collector == null ? NotFound() : Ok(collector.ToResponse());
        }

        // GET: /api/collectors
        [HttpGet]
        public async Task<IActionResult> GetAllCollectors()
        {
            try
            {
                var collectors = await _collectorDb.GetAllCollectorsAsync();
                return Ok(collectors.ToResponseList());
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error fetching collectors: {ex.Message}");
            }
        }

        // PUT: /api/collectors/{id}
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateCollector(int id, [FromBody] UpdateCollectorRequest request)
        {
            try
            {
                // First check if collector exists
                var existingCollector = await _collectorDb.GetCollectorByIdAsync(id);
                if (existingCollector == null)
                {
                    return NotFound($"Collector with ID {id} not found.");
                }

                // Create updated collector model
                var updatedCollector = new Model_Collector
                {
                    Id = id,
                    Name = request.Name,
                    CollectorType = existingCollector.CollectorType, // Don't allow changing type
                    Description = request.Description,
                    URL = request.URL, // Now allowing URL updates
                    AccessToken = request.AccessToken, // Will be handled by database manager
                    ExternalAccessToken = request.ExternalAccessToken,
                    EncryptionPassword = request.EncryptionPassword, // For password-based encryption
                    PollRate = request.PollRate,
                    SendRate = request.SendRate,
                    ServiceId = request.ServiceId,
                    DecimalPlaces = request.DecimalPlaces,
                    TestFrequency = request.TestFrequency, // NEW
                    Status = request.Status ?? existingCollector.Status
                };

                var success = await _collectorDb.UpdateCollectorAsync(id, updatedCollector);

                if (!success)
                {
                    return StatusCode(500, "Failed to update collector");
                }

                // Return updated collector (will have encrypted tokens, etc.)
                var result = await _collectorDb.GetCollectorByIdAsync(id);
                return Ok(result.ToResponse());
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error updating collector: {ex.Message}");
            }
        }


        // POST: /api/collectors/{id}/unlock
        [HttpPost("{id}/unlock")]
        public async Task<IActionResult> UnlockCollector(int id, [FromBody] UnlockCollectorRequest request)
        {
            if (string.IsNullOrEmpty(request.Password))
            {
                return BadRequest(new { status = "Password is required" });
            }

            try
            {
                var success = await _collectorDb.UnlockCollectorWithPasswordAsync(id, request.Password);

                if (success)
                {
                    return Ok(new { status = "Collector unlocked successfully" });
                }
                else
                {
                    return BadRequest(new { status = "Invalid password or collector not found" });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { status = $"Error unlocking collector: {ex.Message}" });
            }
        }

        // NEW: POST: /api/collectors/{id}/lock
        [HttpPost("{id}/lock")]
        public IActionResult LockCollector(int id)
        {
            try
            {
                _collectorDb.LockCollector(id);
                return Ok(new { status = "Collector locked successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { status = $"Error locking collector: {ex.Message}" });
            }
        }

        // NEW: GET: /api/collectors/{id}/unlock-status
        [HttpGet("{id}/unlock-status")]
        public async Task<IActionResult> GetUnlockStatus(int id)
        {
            try
            {
                var collector = await _collectorDb.GetCollectorByIdAsync(id);
                if (collector == null) return NotFound();

                var isUnlocked = _collectorDb.IsCollectorUnlocked(id);
                var requiresPassword = collector.ExternalAccessToken;

                return Ok(new
                {
                    isUnlocked = isUnlocked,
                    requiresPassword = requiresPassword,
                    isLocked = requiresPassword && !isUnlocked
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { status = $"Error checking unlock status: {ex.Message}" });
            }
        }

        // GET: /api/collectors/{id}/testConnection
        [HttpGet("{id}/testConnection")]
        public async Task<IActionResult> TestConnection(int id)
        {
            var collector = await _collectorDb.GetCollectorByIdAsync(id);
            if (collector == null) return NotFound();

            bool testSuccessful = false;
            string errorMessage = null;

            try
            {
                // Use the factory to get the correct IDataCollector based on the collector type
                var dataCollector = _dataCollectorFactory(collector);

                // Apply configuration using collector's URL and AccessToken (specific to the collector)
                dataCollector.ApplyConfiguration(collector);

                // Test connection
                testSuccessful = await dataCollector.TestConnectionAsync(collector);

                // Update the LastTested timestamp
                await _collectorDb.UpdateLastTestedAsync(id, DateTime.UtcNow);

                return testSuccessful ?
                    Ok(new { status = "Connection successful" }) :
                    StatusCode(500, new { status = "Connection failed" });
            }
            catch (Exception ex)
            {
                errorMessage = ex.Message;

                // Still update LastTested even if test failed
                await _collectorDb.UpdateLastTestedAsync(id, DateTime.UtcNow);

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

            var currentSensors = new List<Model_Sensor>();
            var storedSensors = new List<Model_Sensor>();
            bool fetchSuccessful = false;
            string errorMessage = null;

            try
            {
                // Use the factory to get the correct IDataCollector based on the collector type
                var dataCollector = _dataCollectorFactory(collector);

                // Apply configuration using collector's URL and AccessToken (specific to the collector)
                dataCollector.ApplyConfiguration(collector);
                Console.WriteLine($"Configuration applied for collector: {collector.Name}");

                // Fetch current sensors from the collector (external source)
                currentSensors = await dataCollector.FetchSensorsAsync(collector);
                Console.WriteLine($"Fetched {currentSensors.Count} current sensors from the collector.");
                fetchSuccessful = true;

                // Fetch previously stored sensors from the database
                storedSensors = await _sensorDb.GetSensorsByCollectorIdAsync(id);
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

                // UPDATED: Separate new sensors from lost sensors
                var newSensors = new List<Model_Sensor>();
                var lostSensors = new List<Model_Sensor>();

                // Find new sensors (in collector but not in database)
                foreach (var currentSensor in currentSensors)
                {
                    var storedSensor = storedSensors.FirstOrDefault(s => s.ExternalId == currentSensor.ExternalId);
                    if (storedSensor == null)
                    {
                        newSensors.Add(currentSensor);
                        Console.WriteLine($"New sensor found: {currentSensor.Name}");
                    }
                }

                // Find lost sensors (in database but not in collector)
                foreach (var storedSensor in storedSensors)
                {
                    var currentSensor = currentSensors.FirstOrDefault(s => s.ExternalId == storedSensor.ExternalId);
                    if (currentSensor == null)
                    {
                        lostSensors.Add(storedSensor);
                        Console.WriteLine($"Lost sensor found: {storedSensor.Name}");
                    }
                }

                // Debug: Log counts
                Console.WriteLine($"Found {newSensors.Count} new sensors and {lostSensors.Count} lost sensors.");

                // Update collector with last fetch information
                await _collectorDb.UpdateLastFetchInfoAsync(id, DateTime.UtcNow,
                    currentSensors.Count, newSensors.Count, fetchSuccessful, null, lostSensors.Count);

                // Return enhanced response with separate sensor types
                return Ok(new
                {
                    deltaSensors = newSensors,    // Keep for backward compatibility
                    newSensors = newSensors,      // Explicit new sensors
                    lostSensors = lostSensors,    // NEW: Lost sensors
                    totalFetched = currentSensors.Count,
                    totalStored = storedSensors.Count,
                    totalNew = newSensors.Count,
                    totalLost = lostSensors.Count,
                    fetchSuccessful = fetchSuccessful,
                    errorMessage = (string)null
                });
            }
            catch (Exception ex)
            {
                // Log the error for debugging purposes
                Console.WriteLine($"Error fetching delta sensors: {ex.Message}");
                errorMessage = ex.Message;

                // Update collector with failed fetch information
                await _collectorDb.UpdateLastFetchInfoAsync(id, DateTime.UtcNow,
                    currentSensors.Count, 0, false, errorMessage, 0);

                // Return error response with metadata
                return Ok(new
                {
                    deltaSensors = new List<Model_Sensor>(),
                    newSensors = new List<Model_Sensor>(),
                    lostSensors = new List<Model_Sensor>(),
                    totalFetched = currentSensors.Count,
                    totalStored = storedSensors.Count,
                    totalNew = 0,
                    totalLost = 0,
                    fetchSuccessful = false,
                    errorMessage = errorMessage
                });
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

    // NEW: Request model for unlock endpoint
    public class UnlockCollectorRequest
    {
        public string Password { get; set; } = string.Empty;
    }

    public class UpdateCollectorRequest
    {
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string? URL { get; set; }
        public string? AccessToken { get; set; }
        public bool ExternalAccessToken { get; set; } = false;
        public string? EncryptionPassword { get; set; } // Only used if ExternalAccessToken is true
        public int PollRate { get; set; } = 5000;
        public int? SendRate { get; set; }
        public int? ServiceId { get; set; }
        public int DecimalPlaces { get; set; } = 2;
        public int? TestFrequency { get; set; }
        public string? Status { get; set; }
    }
}