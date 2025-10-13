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
                Service_Manager_Polling pollingManager)
        {
            _collectorDb = collectorDb;
            _sensorDb = sensorDb;
            _dataCollectorFactory = dataCollectorFactory;
            _pollingManager = pollingManager;
        }


        // ⚙COLLECTOR STATS CONFIGURATION
        private static class CollectorStatsConfig
        {
            // Sensor health thresholds
            public const int SENSOR_ERROR_LOST_THRESHOLD = 5;      // ❌ Error if X+ sensors lost
            public const int SENSOR_WARNING_LOST_THRESHOLD = 1;    // ⚠️ Warning if any sensors lost
        }

        // GET: /api/collectors/stats
        [HttpGet("stats")]
        public async Task<IActionResult> GetCollectorStats()
        {
            try
            {
                var allCollectors = await _collectorDb.GetAllCollectorsAsync();

                // Exclude EventEngine from stats - it's a special collector
                var collectors = allCollectors.Where(c => c.CollectorType != "EventEngine").ToList();

                var activePollers = _pollingManager.GetActivePollers().ToList();

                // Count collectors by various states
                var totalCollectors = collectors.Count;
                var activeCollectors = activePollers.Count;

                // Locked collectors (require password and are not unlocked)
                var lockedCollectors = collectors.Count(c =>
                    c.ExternalAccessToken && !_collectorDb.IsCollectorUnlocked(c.Id));

                // Failed fetch collectors (last fetch failed)
                var failedFetchCollectors = collectors.Count(c =>
                    c.LastFetchSuccessful == false);

                // Never fetched collectors
                var neverFetchedCollectors = collectors.Count(c =>
                    c.LastFetchTime == null);

                // Collectors with errors (fetch failed)
                var collectorsWithErrors = failedFetchCollectors;

                // Collectors with warnings (locked or never fetched)
                var collectorsWithWarnings = collectors.Count(c =>
                    (c.ExternalAccessToken && !_collectorDb.IsCollectorUnlocked(c.Id)) ||
                    c.LastFetchTime == null);

                // Healthy collectors (fetched successfully and not locked)
                var healthyCollectors = collectors.Count(c =>
                    c.LastFetchSuccessful == true &&
                    c.LastFetchTime != null &&
                    (!c.ExternalAccessToken || _collectorDb.IsCollectorUnlocked(c.Id)));

                // === SENSOR STATS AGGREGATION ===
                var totalSensors = collectors.Sum(c => c.LastFetchTotalSensors ?? 0);
                var totalLostSensors = collectors.Sum(c => c.LastFetchLostSensors ?? 0);
                var totalNewSensors = collectors.Sum(c => c.LastFetchNewSensors ?? 0);

                // Active sensors = total sensors from successful collectors
                var activeSensors = collectors
                    .Where(c => c.LastFetchSuccessful == true)
                    .Sum(c => c.LastFetchTotalSensors ?? 0);

                // Determine overall health status for COLLECTORS
                string healthStatus;
                string healthSeverity;

                if (collectorsWithErrors > 0)
                {
                    healthStatus = $"{collectorsWithErrors} {(collectorsWithErrors == 1 ? "Error" : "Errors")}";
                    healthSeverity = "error";
                }
                else if (collectorsWithWarnings > 0)
                {
                    healthStatus = $"{collectorsWithWarnings} {(collectorsWithWarnings == 1 ? "Warning" : "Warnings")}";
                    healthSeverity = "warning";
                }
                else
                {
                    healthStatus = "All Healthy";
                    healthSeverity = "success";
                }

                // Determine overall health status for SENSORS
                string sensorHealthStatus;
                string sensorHealthSeverity;

                if (totalLostSensors >= CollectorStatsConfig.SENSOR_ERROR_LOST_THRESHOLD)
                {
                    sensorHealthStatus = $"{totalLostSensors} Lost";
                    sensorHealthSeverity = "error";
                }
                else if (totalLostSensors >= CollectorStatsConfig.SENSOR_WARNING_LOST_THRESHOLD)
                {
                    sensorHealthStatus = $"{totalLostSensors} Lost";
                    sensorHealthSeverity = "warning";
                }
                else
                {
                    sensorHealthStatus = "All Healthy";
                    sensorHealthSeverity = "success";
                }

                // Build detailed issues list
                var details = new List<object>();
                var sensorDetails = new List<object>();
                int issueId = 1;
                int sensorIssueId = 1;

                // Add failed fetch issues
                foreach (var collector in collectors.Where(c => c.LastFetchSuccessful == false && !string.IsNullOrEmpty(c.LastFetchErrorMessage)))
                {
                    details.Add(new
                    {
                        id = issueId++,
                        type = "error",
                        title = $"{collector.Name} fetch failed",
                        description = collector.LastFetchErrorMessage ?? "Fetch operation failed",
                        timestamp = collector.LastFetchTime ?? DateTime.UtcNow,
                        area = "collectors",
                        collectorId = collector.Id
                    });
                }

                // Add locked collector warnings
                foreach (var collector in collectors.Where(c => c.ExternalAccessToken && !_collectorDb.IsCollectorUnlocked(c.Id)))
                {
                    details.Add(new
                    {
                        id = issueId++,
                        type = "warning",
                        title = $"{collector.Name} is locked",
                        description = "Collector requires password to unlock",
                        timestamp = DateTime.UtcNow,
                        area = "collectors",
                        collectorId = collector.Id
                    });
                }

                // Add never fetched warnings
                foreach (var collector in collectors.Where(c => c.LastFetchTime == null))
                {
                    details.Add(new
                    {
                        id = issueId++,
                        type = "warning",
                        title = $"{collector.Name} not fetched",
                        description = "Collector has never fetched data",
                        timestamp = DateTime.UtcNow,
                        area = "collectors",
                        collectorId = collector.Id
                    });
                }

                // Add sensor lost warnings/errors
                foreach (var collector in collectors.Where(c => (c.LastFetchLostSensors ?? 0) > 0))
                {
                    var lostCount = collector.LastFetchLostSensors ?? 0;  // Changed from c. to collector.
                    var isError = lostCount >= CollectorStatsConfig.SENSOR_ERROR_LOST_THRESHOLD;

                    sensorDetails.Add(new
                    {
                        id = sensorIssueId++,
                        type = isError ? "error" : "warning",
                        title = $"{collector.Name} lost {lostCount} sensor{(lostCount == 1 ? "" : "s")}",
                        description = $"{lostCount} sensor{(lostCount == 1 ? "" : "s")} no longer detected",
                        timestamp = collector.LastFetchTime ?? DateTime.UtcNow,
                        area = "sensors",
                        collectorId = collector.Id,
                        lostCount = lostCount
                    });
                }

                return Ok(new
                {
                    collectors = new
                    {
                        active = activeCollectors,
                        total = totalCollectors,
                        health = new
                        {
                            status = healthStatus,
                            severity = healthSeverity
                        },
                        hasIssues = collectorsWithErrors > 0 || collectorsWithWarnings > 0,
                        details = details.OrderByDescending(d => ((dynamic)d).timestamp),
                        breakdown = new
                        {
                            locked = lockedCollectors,
                            failedFetch = failedFetchCollectors,
                            neverFetched = neverFetchedCollectors,
                            healthy = healthyCollectors,
                            errors = collectorsWithErrors,
                            warnings = collectorsWithWarnings
                        }
                    },
                    sensors = new
                    {
                        active = activeSensors,
                        total = totalSensors,
                        health = new
                        {
                            status = sensorHealthStatus,
                            severity = sensorHealthSeverity
                        },
                        hasIssues = totalLostSensors > 0,
                        details = sensorDetails.OrderByDescending(d => ((dynamic)d).timestamp),
                        breakdown = new
                        {
                            lost = totalLostSensors,
                            new_ = totalNewSensors,
                            healthy = totalSensors - totalLostSensors
                        }
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = $"Error fetching collector stats: {ex.Message}" });
            }
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