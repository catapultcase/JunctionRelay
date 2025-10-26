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
using JunctionRelayServer.Services;
using System.Collections.Concurrent;

namespace JunctionRelayServer.Controllers
{
    [Route("api/connections")]
    [ApiController]
    public class Controller_Connections : ControllerBase
    {
        private readonly Service_Manager_Connections _connectionService;
        private readonly Service_Database_Manager_Sensors _sensorDb;
        private readonly Service_Stream_Manager_HTTP _httpStreamManager;
        private readonly Service_Stream_Manager_MQTT _mqttStreamManager;
        private readonly Service_Stream_Manager_COM _comStreamManager;
        private readonly Service_Stream_Manager_WebSocket _webSocketStreamManager;
        private readonly Service_Stream_Manager_Virtual _virtualStreamManager;
        private readonly Service_Database_Manager_Devices _deviceDbManager;

        // LRU-style cache for device ID to first screen ID mapping
        private static readonly ConcurrentDictionary<int, int> _deviceScreenCache = new();
        private static readonly ConcurrentDictionary<int, DateTime> _lastAccessTimes = new();
        private static readonly TimeSpan _cacheInactivityTimeout = TimeSpan.FromMilliseconds(5000);
        private static DateTime _lastCleanup = DateTime.UtcNow;
        private static readonly TimeSpan _cleanupInterval = TimeSpan.FromSeconds(10);

        public Controller_Connections(
            Service_Manager_Connections connectionService,
            Service_Database_Manager_Sensors sensorDb,
            Service_Stream_Manager_HTTP httpStreamManager,
            Service_Stream_Manager_MQTT mqttStreamManager,
            Service_Stream_Manager_COM comStreamManager,
            Service_Stream_Manager_WebSocket webSocketStreamManager,
            Service_Stream_Manager_Virtual virtualStreamManager,
            Service_Database_Manager_Devices deviceDbManager)
        {
            _connectionService = connectionService;
            _sensorDb = sensorDb;
            _httpStreamManager = httpStreamManager;
            _mqttStreamManager = mqttStreamManager;
            _comStreamManager = comStreamManager;
            _webSocketStreamManager = webSocketStreamManager;
            _virtualStreamManager = virtualStreamManager;
            _deviceDbManager = deviceDbManager;
        }

        private static void CleanupStaleCache()
        {
            var now = DateTime.UtcNow;

            // Only run cleanup every 10 seconds to avoid overhead
            if (now - _lastCleanup < _cleanupInterval)
                return;

            _lastCleanup = now;

            var staleKeys = new List<int>();

            foreach (var kvp in _lastAccessTimes)
            {
                if (now - kvp.Value > _cacheInactivityTimeout)
                {
                    staleKeys.Add(kvp.Key);
                }
            }

            foreach (var key in staleKeys)
            {
                _deviceScreenCache.TryRemove(key, out _);
                _lastAccessTimes.TryRemove(key, out _);
            }

            if (staleKeys.Count > 0)
            {
                Console.WriteLine($"[CONNECTIONS] Cleaned up {staleKeys.Count} stale cache entries");
            }
        }

        // STREAM STATS CONFIGURATION
        private static class StreamStatsConfig
        {
            // Time thresholds for stream health
            public const int ERROR_NO_DATA_MINUTES = 5;        // ❌ Error if no data for X minutes
            public const int WARNING_NO_DATA_SECONDS = 30;     // ⚠️ Warning if no data for X seconds
        }

        // GET: /api/connections/streams/stats
        [HttpGet("streams/stats")]
        public IActionResult GetStreamsStats()
        {
            try
            {
                // Get all active streams from all managers
                var activeVirtualStreams = _virtualStreamManager.GetActiveStreams();
                var activeHttpStreams = _httpStreamManager.GetActiveStreams();
                var activeMqttStreams = _mqttStreamManager.GetActiveStreams();
                var activeComStreams = _comStreamManager.GetActiveStreams();
                var activeWebSocketStreams = _webSocketStreamManager.GetActiveStreams();

                var allActiveStreams = activeHttpStreams
                    .Concat(activeVirtualStreams)
                    .Concat(activeMqttStreams)
                    .Concat(activeComStreams)
                    .Concat(activeWebSocketStreams)
                    .ToList();

                var totalStreams = allActiveStreams.Count;
                var activeStreams = totalStreams; // All returned streams are active

                // Count by stream type
                var streamsByType = new Dictionary<string, int>
        {
            { "HTTP", activeHttpStreams.Count() },
            { "MQTT", activeMqttStreams.Count() },
            { "COM", activeComStreams.Count() },
            { "WebSocket", activeWebSocketStreams.Count() },
            { "Virtual", activeVirtualStreams.Count() }
        };

                // Analyze stream health
                // For now, we'll check if streams have sent data recently
                var details = new List<object>();
                int issueId = 1;
                int streamErrorCount = 0;
                int streamWarningCount = 0;

                // Helper method to check stream health
                void CheckStreamHealth(object stream, string streamType, int index)
                {
                    try
                    {
                        var streamObjType = stream.GetType();
                        var lastSentTimeProp = streamObjType.GetProperty("LastSentTime");
                        var deviceNameProp = streamObjType.GetProperty("DeviceName");
                        var screenIdProp = streamObjType.GetProperty("ScreenId");

                        var lastSentTime = lastSentTimeProp?.GetValue(stream) as DateTime?;
                        var deviceName = deviceNameProp?.GetValue(stream)?.ToString() ?? $"{streamType} Stream {index}";
                        var screenId = screenIdProp?.GetValue(stream);

                        // Check if stream hasn't sent data in the last 30 seconds
                        if (lastSentTime.HasValue)
                        {
                            var timeSinceLastSend = DateTime.UtcNow - lastSentTime.Value;

                            if (timeSinceLastSend.TotalMinutes > StreamStatsConfig.ERROR_NO_DATA_MINUTES)
                            {
                                // Error: No data sent in X+ minutes
                                details.Add(new
                                {
                                    id = issueId++,
                                    type = "error",
                                    title = $"{deviceName} stream inactive",
                                    description = $"No data sent for {timeSinceLastSend.TotalMinutes:F1} minutes",
                                    timestamp = lastSentTime.Value,
                                    area = "streams",
                                    streamType = streamType,
                                    screenId = screenId
                                });
                                streamErrorCount++;
                            }
                            else if (timeSinceLastSend.TotalSeconds > StreamStatsConfig.WARNING_NO_DATA_SECONDS)
                            {
                                // Warning: No data sent in X+ seconds
                                details.Add(new
                                {
                                    id = issueId++,
                                    type = "warning",
                                    title = $"{deviceName} stream slow",
                                    description = $"No data sent for {timeSinceLastSend.TotalSeconds:F0} seconds",
                                    timestamp = lastSentTime.Value,
                                    area = "streams",
                                    streamType = streamType,
                                    screenId = screenId
                                });
                                streamWarningCount++;
                            }
                        }
                        else
                        {
                            // Warning: Stream has never sent data
                            details.Add(new
                            {
                                id = issueId++,
                                type = "warning",
                                title = $"{deviceName} stream not sending",
                                description = "Stream has never sent data",
                                timestamp = DateTime.UtcNow,
                                area = "streams",
                                streamType = streamType,
                                screenId = screenId
                            });
                            streamWarningCount++;
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[STREAMS_STATS] Error checking stream health: {ex.Message}");
                    }
                }

                // Check all streams for health issues
                int index = 1;
                foreach (var stream in activeHttpStreams) CheckStreamHealth(stream, "HTTP", index++);
                index = 1;
                foreach (var stream in activeMqttStreams) CheckStreamHealth(stream, "MQTT", index++);
                index = 1;
                foreach (var stream in activeComStreams) CheckStreamHealth(stream, "COM", index++);
                index = 1;
                foreach (var stream in activeWebSocketStreams) CheckStreamHealth(stream, "WebSocket", index++);
                index = 1;
                foreach (var stream in activeVirtualStreams) CheckStreamHealth(stream, "Virtual", index++);

                // Determine overall health status
                string healthStatus;
                string healthSeverity;

                if (streamErrorCount > 0)
                {
                    healthStatus = $"{streamErrorCount} {(streamErrorCount == 1 ? "Error" : "Errors")}";
                    healthSeverity = "error";
                }
                else if (streamWarningCount > 0)
                {
                    healthStatus = $"{streamWarningCount} {(streamWarningCount == 1 ? "Warning" : "Warnings")}";
                    healthSeverity = "warning";
                }
                else
                {
                    healthStatus = "All Healthy";
                    healthSeverity = "success";
                }

                return Ok(new
                {
                    active = activeStreams,
                    total = totalStreams,
                    health = new
                    {
                        status = healthStatus,
                        severity = healthSeverity
                    },
                    hasIssues = streamErrorCount > 0 || streamWarningCount > 0,
                    details = details.OrderByDescending(d => ((dynamic)d).timestamp),
                    breakdown = new
                    {
                        byType = streamsByType,
                        errors = streamErrorCount,
                        warnings = streamWarningCount,
                        healthy = totalStreams - streamErrorCount - streamWarningCount
                    }
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[STREAMS_STATS] Error: {ex.Message}");
                return StatusCode(500, new { error = $"Error fetching stream stats: {ex.Message}" });
            }
        }

        [HttpPost("start/{junctionId}")]
        public async Task<IActionResult> StartJunction(int junctionId, CancellationToken cancellationToken)
        {
            var result = await _connectionService.StartJunctionAsync(junctionId, cancellationToken);
            if (!result.Success)
                return BadRequest(new { message = result.Message });

            return Ok(new { message = $"Junction {junctionId} started." });
        }

        [HttpPost("stop/{junctionId}")]
        public async Task<IActionResult> StopJunction(int junctionId, CancellationToken cancellationToken)
        {
            var result = await _connectionService.StopJunctionAsync(junctionId, cancellationToken);
            if (!result.Success)
                return BadRequest(new { message = result.Message });

            return Ok(new { message = $"Junction {junctionId} stopped." });
        }

        // GET: /api/connections/running
        [HttpGet("running")]
        public IActionResult GetRunningJunctions()
        {
            var running = _connectionService.RunningJunctions.Values
                .Select(j => new
                {
                    j.Id,
                    j.Name,
                    j.Status
                });

            return Ok(running);
        }

        // GET: /api/connections/streams
        [HttpGet("streams")]
        public IActionResult GetActiveStreams()
        {
            var activeVirtualStreams = _virtualStreamManager.GetActiveStreams();
            var activeHttpStreams = _httpStreamManager.GetActiveStreams();
            var activeMqttStreams = _mqttStreamManager.GetActiveStreams();
            var activeComStreams = _comStreamManager.GetActiveStreams();
            var activeWebSocketStreams = _webSocketStreamManager.GetActiveStreams();

            var allActiveStreams = activeHttpStreams
                .Concat(activeVirtualStreams)
                .Concat(activeMqttStreams)
                .Concat(activeComStreams)
                .Concat(activeWebSocketStreams)
                .ToList();

            return Ok(new { activeStreams = allActiveStreams });
        }

        // GET: /api/connections/device/{deviceId}
        [HttpGet("device/{deviceId}")]
        public async Task<IActionResult> GetDeviceStreamData(string deviceId)
        {
            try
            {
                if (!int.TryParse(deviceId, out int parsedDeviceId))
                {
                    return BadRequest(new
                    {
                        message = "Device ID must be a valid integer",
                        deviceId,
                        timestamp = DateTime.UtcNow
                    });
                }

                // Periodic cache cleanup
                CleanupStaleCache();

                // Get all active streams
                var activeVirtualStreams = _virtualStreamManager.GetActiveStreams();
                var activeHttpStreams = _httpStreamManager.GetActiveStreams();
                var activeMqttStreams = _mqttStreamManager.GetActiveStreams();
                var activeComStreams = _comStreamManager.GetActiveStreams();
                var activeWebSocketStreams = _webSocketStreamManager.GetActiveStreams();

                var allActiveStreams = activeHttpStreams
                    .Concat(activeVirtualStreams)
                    .Concat(activeMqttStreams)
                    .Concat(activeComStreams)
                    .Concat(activeWebSocketStreams)
                    .ToList();

                object? targetStream = null;
                int actualScreenId = 0;

                if (parsedDeviceId < 0)
                {
                    // Handle negative device IDs (blit mode virtual devices)
                    actualScreenId = parsedDeviceId;
                    targetStream = allActiveStreams.FirstOrDefault(stream =>
                    {
                        var streamType = stream.GetType();
                        var screenIdProp = streamType.GetProperty("ScreenId");
                        var streamScreenId = screenIdProp?.GetValue(stream);
                        return streamScreenId != null && streamScreenId.Equals(actualScreenId);
                    });

                    // Fallback: device name pattern match
                    if (targetStream == null)
                    {
                        var expectedDeviceName = $"Virtual--{Math.Abs(parsedDeviceId)}";

                        targetStream = allActiveStreams.FirstOrDefault(stream =>
                        {
                            var streamType = stream.GetType();
                            var deviceNameProp = streamType.GetProperty("DeviceName");
                            var streamDeviceName = deviceNameProp?.GetValue(stream)?.ToString();

                            if (streamDeviceName == expectedDeviceName)
                            {
                                var screenIdProp = streamType.GetProperty("ScreenId");
                                var streamScreenId = screenIdProp?.GetValue(stream);
                                if (streamScreenId != null)
                                {
                                    actualScreenId = (int)streamScreenId;
                                    return true;
                                }
                            }
                            return false;
                        });
                    }
                }
                else
                {
                    // Handle positive device IDs (normal devices) with LRU-style caching
                    var now = DateTime.UtcNow;

                    // Check cache and update access time
                    if (_deviceScreenCache.TryGetValue(parsedDeviceId, out int cachedScreenId))
                    {
                        actualScreenId = cachedScreenId;
                        _lastAccessTimes[parsedDeviceId] = now; // Update access time
                    }
                    else
                    {
                        // Cache miss - query database
                        var deviceScreens = await _deviceDbManager.GetDeviceScreensAsync(parsedDeviceId);

                        if (!deviceScreens.Any())
                        {
                            return NotFound(new
                            {
                                message = "No screens found for this device",
                                deviceId,
                                timestamp = DateTime.UtcNow
                            });
                        }

                        actualScreenId = deviceScreens.First().Id;

                        // Add to cache
                        _deviceScreenCache[parsedDeviceId] = actualScreenId;
                        _lastAccessTimes[parsedDeviceId] = now;
                    }

                    targetStream = allActiveStreams.FirstOrDefault(stream =>
                    {
                        var streamType = stream.GetType();
                        var screenIdProp = streamType.GetProperty("ScreenId");
                        var streamScreenId = screenIdProp?.GetValue(stream);
                        return streamScreenId != null && streamScreenId.Equals(actualScreenId);
                    });
                }

                if (targetStream == null)
                {
                    return NotFound(new
                    {
                        message = "No active stream found for this device's screen",
                        deviceId,
                        screenId = actualScreenId,
                        timestamp = DateTime.UtcNow
                    });
                }

                // Extract data from the found stream
                var targetStreamType = targetStream.GetType();
                var deviceNameProp = targetStreamType.GetProperty("DeviceName");
                var configProp = targetStreamType.GetProperty("ConfigPayloadJson");
                var sensorProp = targetStreamType.GetProperty("LastSentPayloadJson");
                var lastSentTimeProp = targetStreamType.GetProperty("LastSentTime");

                var deviceName = deviceNameProp?.GetValue(targetStream)?.ToString();
                var configJson = configProp?.GetValue(targetStream)?.ToString();
                var sensorJson = sensorProp?.GetValue(targetStream)?.ToString();
                var lastSentTime = lastSentTimeProp?.GetValue(targetStream);

                // Parse JSON payloads
                object? configPayload = null;
                object? sensorPayload = null;

                try
                {
                    if (!string.IsNullOrEmpty(configJson))
                    {
                        configPayload = System.Text.Json.JsonSerializer.Deserialize<object>(configJson);
                    }
                }
                catch (Exception)
                {
                    configPayload = configJson;
                }

                try
                {
                    if (!string.IsNullOrEmpty(sensorJson))
                    {
                        sensorPayload = System.Text.Json.JsonSerializer.Deserialize<object>(sensorJson);
                    }
                }
                catch (Exception)
                {
                    sensorPayload = sensorJson;
                }

                var response = new
                {
                    deviceId,
                    deviceName,
                    screenId = actualScreenId,
                    configPayload,
                    sensorPayload,
                    lastUpdate = lastSentTime,
                    timestamp = DateTime.UtcNow
                };

                return Ok(response);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CONNECTIONS] Error getting device stream data: {ex.Message}");
                return StatusCode(500, new
                {
                    message = "Error retrieving device stream data",
                    error = ex.Message,
                    deviceId,
                    timestamp = DateTime.UtcNow
                });
            }
        }

        // GET: /api/connections/sensors
        [HttpGet("sensors")]
        public IActionResult GetSensors()
        {
            var sensors = _connectionService.GetAllSensors();
            if (sensors == null || !sensors.Any())
            {
                return NotFound("No sensors found.");
            }
            return Ok(sensors);
        }

        // GET: /api/connections/sensors/junction/{junctionId}
        [HttpGet("sensors/junction/{junctionId}")]
        public async Task<IActionResult> GetSensorsByJunctionAsync(int junctionId)
        {
            var sensors = await _connectionService.GetSensorsByJunctionAsync(junctionId);

            if (sensors == null || !sensors.Any())
            {
                return NotFound($"No sensors found for junction {junctionId}.");
            }

            return Ok(sensors);
        }
    }
}