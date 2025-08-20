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

using JunctionRelayServer.Services;
using Microsoft.AspNetCore.Mvc;

namespace JunctionRelay_Server.Controllers
{
    [ApiController]
    [Route("api/streamhistory")]
    public class Controller_StreamHistory : ControllerBase
    {
        private readonly Service_Stream_Manager_COM _comManager;
        private readonly Service_Stream_Manager_HTTP _httpManager;
        private readonly Service_Stream_Manager_MQTT _mqttManager;
        private readonly Service_Stream_History_Manager _historyManager;

        public Controller_StreamHistory(
            Service_Stream_Manager_COM comManager,
            Service_Stream_Manager_HTTP httpManager,
            Service_Stream_Manager_MQTT mqttManager,
            Service_Stream_History_Manager historyManager)
        {
            _comManager = comManager;
            _httpManager = httpManager;
            _mqttManager = mqttManager;
            _historyManager = historyManager;
        }

        // NEW: Frame endpoint for last sent frame
        [HttpGet("stream/{screenId}/last-frame")]
        public IActionResult GetLastFrame(int screenId)
        {
            try
            {
                // Check HTTP stream manager first
                if (_httpManager.IsStreaming(screenId))
                {
                    var frameBytes = _httpManager.GetLastFrameBytes(screenId);
                    if (frameBytes != null)
                    {
                        return File(frameBytes, "image/png", $"frame_{screenId}_{DateTime.Now:yyyyMMdd_HHmmss}.png");
                    }
                }

                // Check COM stream manager
                if (_comManager.IsStreaming(screenId))
                {
                    var frameBytes = _comManager.GetLastFrameBytes(screenId);
                    if (frameBytes != null)
                    {
                        return File(frameBytes, "image/png", $"frame_{screenId}_{DateTime.Now:yyyyMMdd_HHmmss}.png");
                    }
                }

                // Check MQTT stream manager if applicable
                //try
                //{
                //    if (_mqttManager.IsStreaming(screenId))
                //    {
                //        // Note: You'll need to add GetLastFrameBytes method to MQTT manager if it supports frames
                //        var frameBytes = _mqttManager.GetLastFrameBytes(screenId);
                //        if (frameBytes != null)
                //        {
                //            return File(frameBytes, "image/png", $"frame_{screenId}_{DateTime.Now:yyyyMMdd_HHmmss}.png");
                //        }
                //    }
                //}
                //catch (InvalidOperationException)
                //{
                //    // MQTT stream manager may not be registered or may not support frames yet
                //    // This is fine, just continue to the next check
                //}
                //catch (System.MissingMethodException)
                //{
                //    // GetLastFrameBytes method may not exist on MQTT manager yet
                //    // This is fine, just continue
                //}

                return NotFound(new
                {
                    message = "No frame available for this stream",
                    screenId,
                    timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CONTROLLER] Error retrieving frame for screen {screenId}: {ex.Message}");
                return StatusCode(500, new
                {
                    message = "Error retrieving frame",
                    error = ex.Message,
                    screenId,
                    timestamp = DateTime.UtcNow
                });
            }
        }

        // NEW: Get frame info for a specific stream
        [HttpGet("stream/{screenId}/frame-info")]
        public IActionResult GetFrameInfo(int screenId)
        {
            try
            {
                // Check HTTP stream manager first
                if (_httpManager.IsStreaming(screenId))
                {
                    var frameInfo = _httpManager.GetFrameInfo(screenId);
                    if (frameInfo != null)
                    {
                        return Ok(frameInfo);
                    }
                }

                // Check COM stream manager
                if (_comManager.IsStreaming(screenId))
                {
                    var frameInfo = _comManager.GetFrameInfo(screenId);
                    if (frameInfo != null)
                    {
                        return Ok(frameInfo);
                    }
                }

                // Check MQTT stream manager if applicable
                //try
                //{
                //    if (_mqttManager.IsStreaming(screenId))
                //    {
                //        var frameInfo = _mqttManager.GetFrameInfo(screenId);
                //        if (frameInfo != null)
                //        {
                //            return Ok(frameInfo);
                //        }
                //    }
                //}
                //catch (InvalidOperationException)
                //{
                //    // MQTT stream manager may not support frames yet
                //}
                //catch (System.MissingMethodException)
                //{
                //    // GetFrameInfo method may not exist on MQTT manager yet
                //}

                return NotFound(new
                {
                    message = "No frame info available for this stream",
                    screenId,
                    timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CONTROLLER] Error retrieving frame info for screen {screenId}: {ex.Message}");
                return StatusCode(500, new
                {
                    message = "Error retrieving frame info",
                    error = ex.Message,
                    screenId,
                    timestamp = DateTime.UtcNow
                });
            }
        }

        // NEW: Clear last frame for a specific stream (to free memory)
        [HttpDelete("stream/{screenId}/last-frame")]
        public IActionResult ClearLastFrame(int screenId)
        {
            try
            {
                bool cleared = false;

                // Try HTTP stream manager
                if (_httpManager.IsStreaming(screenId))
                {
                    cleared = _httpManager.ClearLastFrame(screenId);
                }

                // Try COM stream manager
                if (!cleared && _comManager.IsStreaming(screenId))
                {
                    cleared = _comManager.ClearLastFrame(screenId);
                }

                //// Try MQTT stream manager if applicable
                //if (!cleared)
                //{
                //    try
                //    {
                //        if (_mqttManager.IsStreaming(screenId))
                //        {
                //            cleared = _mqttManager.ClearLastFrame(screenId);
                //        }
                //    }
                //    catch (InvalidOperationException)
                //    {
                //        // MQTT stream manager may not support frames yet
                //    }
                //    catch (System.MissingMethodException)
                //    {
                //        // ClearLastFrame method may not exist on MQTT manager yet
                //    }
                //}

                return Ok(new
                {
                    success = cleared,
                    message = cleared ? "Frame cleared" : "No frame to clear or stream not found",
                    screenId,
                    timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CONTROLLER] Error clearing frame for screen {screenId}: {ex.Message}");
                return StatusCode(500, new
                {
                    message = "Error clearing frame",
                    error = ex.Message,
                    screenId,
                    timestamp = DateTime.UtcNow
                });
            }
        }

        [HttpGet("summary")]
        public IActionResult GetHistorySummary()
        {
            return Ok(_historyManager.GetHistorySummary());
        }

        [HttpGet("configuration")]
        public IActionResult GetConfiguration()
        {
            var config = _historyManager.GetConfiguration();
            var activeStreams = GetTotalActiveStreams();
            var memoryEstimate = CalculateCurrentMemoryUsage();

            return Ok(new
            {
                retentionHours = config.RetentionPeriod.TotalHours,
                maxEntriesPerStream = config.MaxEntriesPerStream,
                cleanupInterval = config.CleanupInterval.ToString(),
                estimatedMemoryUsage = memoryEstimate,
                totalActiveStreams = activeStreams,
                loggingEnabled = config.LoggingEnabled
            });
        }

        [HttpGet("stream/{screenId}")]
        public IActionResult GetStreamHistory(
            int screenId,
            [FromQuery] DateTime? fromTime = null,
            [FromQuery] DateTime? toTime = null,
            [FromQuery] bool includeStatistics = true,
            [FromQuery] bool sample = false,
            [FromQuery] int maxPoints = 200)
        {
            var fullHistory = _historyManager.GetStreamHistory(screenId, fromTime, toTime, includeStatistics);

            // Early exit if no sampling requested or not enough data
            if (!sample || fullHistory.Entries == null || fullHistory.Entries.Count <= maxPoints)
            {
                return Ok(fullHistory);
            }

            var allEntries = fullHistory.Entries;
            int interval = Math.Max(1, allEntries.Count / maxPoints);
            var sampledEntries = allEntries
                .Where((entry, index) => index % interval == 0)
                .ToList();

            // Ensure most recent entry is included
            if (sampledEntries.Count > 0 && sampledEntries[^1].Timestamp != allEntries[^1].Timestamp)
            {
                sampledEntries.Add(allEntries[^1]);
            }

            // Create a copy of the response with sampled entries and sampling metadata
            var sampledResponse = new
            {
                fullHistory.ScreenId,
                fullHistory.DeviceName,
                fullHistory.ScreenName,
                fullHistory.Protocol,
                fullHistory.OldestEntry,
                fullHistory.NewestEntry,
                TotalEntries = allEntries.Count,
                SampledEntries = sampledEntries.Count,
                SamplingRatio = Math.Round((double)sampledEntries.Count / allEntries.Count, 4),
                IsSampled = true,
                Entries = sampledEntries,
                Statistics = includeStatistics ? fullHistory.Statistics : null
            };

            return Ok(sampledResponse);
        }

        [HttpGet("all")]
        public IActionResult GetAllStreamHistories(
            [FromQuery] DateTime? fromTime = null,
            [FromQuery] DateTime? toTime = null,
            [FromQuery] bool includeStatistics = false)
        {
            var histories = _historyManager.GetAllStreamHistories(fromTime, toTime, includeStatistics);
            return Ok(histories);
        }

        [HttpPost("memory-estimate")]
        public IActionResult GetMemoryEstimate([FromBody] HistoryConfigurationRequest request)
        {
            var activeStreams = GetTotalActiveStreams();
            var avgCollectionRate = CalculateAverageCollectionRate();

            var estimatedMemory = CalculateMemoryUsage(
                request.RetentionHours ?? 24,
                request.MaxEntriesPerStream ?? 10000,
                activeStreams,
                avgCollectionRate
            );

            return Ok(new { estimatedMemoryUsage = estimatedMemory });
        }

        [HttpPost("configuration")]
        public IActionResult UpdateConfiguration([FromBody] HistoryConfigurationRequest request)
        {
            if (request.RetentionHours.HasValue)
            {
                _historyManager.UpdateRetentionPeriod(TimeSpan.FromHours(request.RetentionHours.Value));
            }
            if (request.MaxEntriesPerStream.HasValue)
            {
                _historyManager.UpdateMaxEntries(request.MaxEntriesPerStream.Value);
            }
            if (request.LoggingEnabled.HasValue)
            {
                _historyManager.UpdateLoggingEnabled(request.LoggingEnabled.Value);
            }

            var config = _historyManager.GetConfiguration();
            var memoryEstimate = CalculateCurrentMemoryUsage();

            return Ok(new
            {
                retentionHours = config.RetentionPeriod.TotalHours,
                maxEntriesPerStream = config.MaxEntriesPerStream,
                cleanupInterval = config.CleanupInterval.ToString(),
                estimatedMemoryUsage = memoryEstimate,
                loggingEnabled = config.LoggingEnabled
            });
        }

        [HttpGet("stream/{screenId}/export")]
        public IActionResult ExportStreamHistoryCSV(
            int screenId,
            [FromQuery] DateTime? fromTime = null,
            [FromQuery] DateTime? toTime = null)
        {
            var history = _historyManager.GetStreamHistory(screenId, fromTime, toTime, false);

            if (history.TotalEntries == 0)
            {
                return NotFound(new { message = "No history data found for this stream" });
            }

            var csv = GenerateCSV(new[] { history });
            var fileName = $"stream_{screenId}_history_{DateTime.UtcNow:yyyyMMdd_HHmmss}.csv";

            return File(System.Text.Encoding.UTF8.GetBytes(csv), "text/csv", fileName);
        }

        [HttpGet("export")]
        public IActionResult ExportAllStreamsCSV(
            [FromQuery] DateTime? fromTime = null,
            [FromQuery] DateTime? toTime = null)
        {
            var histories = _historyManager.GetAllStreamHistories(fromTime, toTime, false);

            if (!histories.Any())
            {
                return NotFound(new { message = "No history data found" });
            }

            var csv = GenerateCSV(histories.Values);
            var fileName = $"all_streams_history_{DateTime.UtcNow:yyyyMMdd_HHmmss}.csv";

            return File(System.Text.Encoding.UTF8.GetBytes(csv), "text/csv", fileName);
        }

        [HttpDelete("stream/{screenId}")]
        public IActionResult ClearStreamHistory(int screenId)
        {
            var success = _historyManager.ClearStreamHistory(screenId);
            return Ok(new { success, message = success ? "History cleared" : "Stream not found" });
        }

        [HttpDelete("all")]
        public IActionResult ClearAllHistory()
        {
            _historyManager.ClearAllHistory();
            return Ok(new { success = true, message = "All history cleared" });
        }

        // Private helper methods for calculations

        private int GetTotalActiveStreams()
        {
            try
            {
                var comStreams = _comManager?.GetActiveStreams()?.Count() ?? 0;
                var httpStreams = _httpManager?.GetActiveStreams()?.Count() ?? 0;
                var mqttStreams = _mqttManager?.GetActiveStreams()?.Count() ?? 0;

                return comStreams + httpStreams + mqttStreams;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[STREAM_HISTORY] Error getting active stream count: {ex.Message}");
                return 0;
            }
        }

        private double CalculateAverageCollectionRate()
        {
            try
            {
                var rates = new List<double>();

                // Get rates from COM streams
                var comStreams = _comManager?.GetActiveStreams();
                if (comStreams != null)
                {
                    foreach (var stream in comStreams)
                    {
                        // Assuming the stream objects have a Rate property
                        // You may need to adjust this based on your actual stream object structure
                        var rateProperty = stream.GetType().GetProperty("Rate");
                        if (rateProperty != null)
                        {
                            var rate = rateProperty.GetValue(stream);
                            if (rate is int intRate && intRate > 0)
                            {
                                rates.Add(intRate);
                            }
                        }
                    }
                }

                // Get rates from HTTP streams
                var httpStreams = _httpManager?.GetActiveStreams();
                if (httpStreams != null)
                {
                    foreach (var stream in httpStreams)
                    {
                        var rateProperty = stream.GetType().GetProperty("Rate");
                        if (rateProperty != null)
                        {
                            var rate = rateProperty.GetValue(stream);
                            if (rate is int intRate && intRate > 0)
                            {
                                rates.Add(intRate);
                            }
                        }
                    }
                }

                // Get rates from MQTT streams
                var mqttStreams = _mqttManager?.GetActiveStreams();
                if (mqttStreams != null)
                {
                    foreach (var stream in mqttStreams)
                    {
                        var rateProperty = stream.GetType().GetProperty("Rate");
                        if (rateProperty != null)
                        {
                            var rate = rateProperty.GetValue(stream);
                            if (rate is int intRate && intRate > 0)
                            {
                                rates.Add(intRate);
                            }
                        }
                    }
                }

                // Return average rate in milliseconds, or default to 30 seconds if no data
                return rates.Count > 0 ? rates.Average() : 30000; // 30 second default
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[STREAM_HISTORY] Error calculating collection rate: {ex.Message}");
                return 30000; // 30 second fallback
            }
        }

        private string CalculateMemoryUsage(double retentionHours, int maxEntriesPerStream, int activeStreams, double avgCollectionRateMs)
        {
            try
            {
                // Approximate size per history entry in bytes
                const int bytesPerEntry =
                    50 +   // Timestamp (DateTime + serialization overhead)
                    4 +    // ScreenId (int)
                    40 +   // DeviceName (average string length)
                    40 +   // ScreenName (average string length)
                    20 +   // Protocol (string)
                    15 +   // Status (string)
                    8 +    // Latency (long)
                    4 +    // SensorsCount (int)
                    4 +    // Rate (int)
                    20 +   // ConnectionState (string)
                    8 +    // SuccessRate (double)
                    4 +    // ConsecutiveFailures (int)
                    4 +    // ConsecutiveSuccesses (int)
                    8 +    // AverageLatency (double)
                    100 +  // LastErrorMessage (nullable string, average when present)
                    30 +   // ErrorType (nullable string, average when present)
                    200;   // ProtocolSpecificData (Dictionary overhead + data)

                // Calculate entries based on time and rate
                var entriesPerHour = (3600 * 1000) / Math.Max(avgCollectionRateMs, 1000); // Convert ms to entries per hour
                var maxEntriesFromTime = (long)(retentionHours * entriesPerHour);

                // Use the smaller of the two limits
                var effectiveMaxEntries = Math.Min(maxEntriesPerStream, maxEntriesFromTime);

                // Calculate total memory
                var totalEntries = activeStreams * effectiveMaxEntries;
                var totalBytes = totalEntries * bytesPerEntry;

                // Add overhead for data structures (approximately 30% overhead for collections, etc.)
                totalBytes = (long)(totalBytes * 1.3);

                // Format as human-readable string
                return FormatBytes(totalBytes);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[STREAM_HISTORY] Error calculating memory usage: {ex.Message}");
                return "Unknown";
            }
        }

        private string CalculateCurrentMemoryUsage()
        {
            try
            {
                var config = _historyManager.GetConfiguration();
                var activeStreams = GetTotalActiveStreams();
                var avgRate = CalculateAverageCollectionRate();

                return CalculateMemoryUsage(
                    config.RetentionPeriod.TotalHours,
                    config.MaxEntriesPerStream,
                    activeStreams,
                    avgRate
                );
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[STREAM_HISTORY] Error calculating current memory usage: {ex.Message}");
                return "Unknown";
            }
        }

        private static string FormatBytes(long bytes)
        {
            if (bytes < 1024)
                return $"{bytes} bytes";
            else if (bytes < 1024 * 1024)
                return $"{bytes / 1024.0:F1} KB";
            else if (bytes < 1024 * 1024 * 1024)
                return $"{bytes / (1024.0 * 1024.0):F1} MB";
            else
                return $"{bytes / (1024.0 * 1024.0 * 1024.0):F1} GB";
        }

        private static string GenerateCSV(IEnumerable<StreamHistoryResponse> histories)
        {
            var csv = new System.Text.StringBuilder();

            // CSV Header
            csv.AppendLine("Timestamp,ScreenId,DeviceName,ScreenName,Protocol,Status,Latency,SensorsCount,Rate,ConnectionState,SuccessRate,ConsecutiveFailures,ConsecutiveSuccesses,AverageLatency,LastErrorMessage,ErrorType,ProtocolSpecificData");

            // CSV Data
            foreach (var history in histories)
            {
                foreach (var entry in history.Entries)
                {
                    var protocolData = entry.ProtocolSpecificData != null
                        ? string.Join("; ", entry.ProtocolSpecificData.Select(kvp => $"{kvp.Key}={kvp.Value}"))
                        : "";

                    csv.AppendLine($"{entry.Timestamp:yyyy-MM-dd HH:mm:ss.fff}," +
                                  $"{entry.ScreenId}," +
                                  $"\"{EscapeCsvField(entry.DeviceName)}\"," +
                                  $"\"{EscapeCsvField(entry.ScreenName)}\"," +
                                  $"\"{EscapeCsvField(entry.Protocol)}\"," +
                                  $"\"{EscapeCsvField(entry.Status)}\"," +
                                  $"{entry.Latency}," +
                                  $"{entry.SensorsCount}," +
                                  $"{entry.Rate}," +
                                  $"\"{EscapeCsvField(entry.ConnectionState)}\"," +
                                  $"{entry.SuccessRate:F2}," +
                                  $"{entry.ConsecutiveFailures}," +
                                  $"{entry.ConsecutiveSuccesses}," +
                                  $"{entry.AverageLatency:F2}," +
                                  $"\"{EscapeCsvField(entry.LastErrorMessage ?? "")}\"," +
                                  $"\"{EscapeCsvField(entry.ErrorType ?? "")}\"," +
                                  $"\"{EscapeCsvField(protocolData)}\"");
                }
            }

            return csv.ToString();
        }

        private static string EscapeCsvField(string field)
        {
            if (string.IsNullOrEmpty(field))
                return "";

            // Escape quotes by doubling them and wrap in quotes if contains comma, quote, or newline
            if (field.Contains("\"") || field.Contains(",") || field.Contains("\n") || field.Contains("\r"))
            {
                return field.Replace("\"", "\"\"");
            }

            return field;
        }
    }

    public class HistoryConfigurationRequest
    {
        public double? RetentionHours { get; set; }
        public int? MaxEntriesPerStream { get; set; }
        public bool? LoggingEnabled { get; set; }
    }
}