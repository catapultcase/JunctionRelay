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
        private readonly Service_Stream_Manager_WebSocket _webSocketManager;
        private readonly Service_Stream_Manager_MQTT _mqttManager;
        private readonly Service_Stream_Manager_Virtual _virtualManager;
        private readonly Service_Stream_History_Manager _historyManager;

        public Controller_StreamHistory(
            Service_Stream_Manager_COM comManager,
            Service_Stream_Manager_HTTP httpManager,
            Service_Stream_Manager_WebSocket webSocketManager,
            Service_Stream_Manager_MQTT mqttManager,
            Service_Stream_Manager_Virtual virtualManager,
            Service_Stream_History_Manager historyManager)
        {
            _comManager = comManager;
            _httpManager = httpManager;
            _webSocketManager = webSocketManager;
            _mqttManager = mqttManager;
            _virtualManager = virtualManager;
            _historyManager = historyManager;
        }

        [HttpGet("stream/{screenId}/last-frame")]
        public IActionResult GetLastFrame(int screenId)
        {
            try
            {
                // Check stream managers that support frame data (MQTT does not support frames)
                byte[]? frameBytes = null;
                string protocol = "";

                if (_webSocketManager.IsStreaming(screenId))
                {
                    frameBytes = _webSocketManager.GetLastFrameBytes(screenId);
                    protocol = "WebSocket";
                }
                else if (_httpManager.IsStreaming(screenId))
                {
                    frameBytes = _httpManager.GetLastFrameBytes(screenId);
                    protocol = "HTTP";
                }
                else if (_comManager.IsStreaming(screenId))
                {
                    frameBytes = _comManager.GetLastFrameBytes(screenId);
                    protocol = "COM";
                }

                if (frameBytes != null)
                {
                    return File(frameBytes, "image/png", $"frame_{screenId}_{protocol}_{DateTime.Now:yyyyMMdd_HHmmss}.png");
                }

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

        [HttpGet("stream/{screenId}/frame-info")]
        public IActionResult GetFrameInfo(int screenId)
        {
            try
            {
                // Check stream managers that support frame data (MQTT does not support frames)
                object? frameInfo = null;

                if (_webSocketManager.IsStreaming(screenId))
                {
                    frameInfo = _webSocketManager.GetFrameInfo(screenId);
                }
                else if (_httpManager.IsStreaming(screenId))
                {
                    frameInfo = _httpManager.GetFrameInfo(screenId);
                }
                else if (_comManager.IsStreaming(screenId))
                {
                    frameInfo = _comManager.GetFrameInfo(screenId);
                }

                if (frameInfo != null)
                {
                    return Ok(frameInfo);
                }

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

        [HttpDelete("stream/{screenId}/last-frame")]
        public IActionResult ClearLastFrame(int screenId)
        {
            try
            {
                // Only check stream managers that support frame data (MQTT does not support frames)
                bool cleared = false;

                if (_webSocketManager.IsStreaming(screenId))
                {
                    cleared = _webSocketManager.ClearLastFrame(screenId);
                }
                else if (_httpManager.IsStreaming(screenId))
                {
                    cleared = _httpManager.ClearLastFrame(screenId);
                }
                else if (_comManager.IsStreaming(screenId))
                {
                    cleared = _comManager.ClearLastFrame(screenId);
                }

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

            if (!sample || fullHistory.Entries == null || fullHistory.Entries.Count <= maxPoints)
            {
                return Ok(fullHistory);
            }

            var allEntries = fullHistory.Entries;
            int interval = Math.Max(1, allEntries.Count / maxPoints);
            var sampledEntries = allEntries
                .Where((entry, index) => index % interval == 0)
                .ToList();

            if (sampledEntries.Count > 0 && sampledEntries[^1].Timestamp != allEntries[^1].Timestamp)
            {
                sampledEntries.Add(allEntries[^1]);
            }

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

        [HttpGet("metrics")]
        public IActionResult GetStreamMetrics()
        {
            try
            {
                var webSocketMetrics = _webSocketManager.GetWebSocketStreamMetrics();
                var httpMetrics = _httpManager.GetHttpStreamMetrics();
                var comMetrics = _comManager.GetComStreamMetrics();
                var mqttMetrics = _mqttManager.GetMqttStreamMetrics();

                return Ok(new
                {
                    webSocket = webSocketMetrics,
                    http = httpMetrics,
                    com = comMetrics,
                    mqtt = mqttMetrics,
                    totalActiveStreams = GetTotalActiveStreams(),
                    timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CONTROLLER] Error retrieving stream metrics: {ex.Message}");
                return StatusCode(500, new
                {
                    message = "Error retrieving stream metrics",
                    error = ex.Message,
                    timestamp = DateTime.UtcNow
                });
            }
        }

        private int GetTotalActiveStreams()
        {
            try
            {
                var webSocketStreams = _webSocketManager?.GetActiveStreams()?.Count() ?? 0;
                var httpStreams = _httpManager?.GetActiveStreams()?.Count() ?? 0;
                var comStreams = _comManager?.GetActiveStreams()?.Count() ?? 0;
                var mqttStreams = _mqttManager?.GetActiveStreams()?.Count() ?? 0;
                var virtualStreams = _virtualManager?.GetActiveStreams()?.Count() ?? 0;

                return webSocketStreams + httpStreams + comStreams + mqttStreams + virtualStreams;
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
                var rates = new List<int>();

                // WebSocket streams
                var webSocketStreams = _webSocketManager?.GetActiveStreams();
                if (webSocketStreams != null)
                {
                    foreach (dynamic stream in webSocketStreams)
                    {
                        if (stream.Rate is int rate && rate > 0)
                        {
                            rates.Add(rate);
                        }
                    }
                }

                // HTTP streams
                var httpStreams = _httpManager?.GetActiveStreams();
                if (httpStreams != null)
                {
                    foreach (dynamic stream in httpStreams)
                    {
                        if (stream.Rate is int rate && rate > 0)
                        {
                            rates.Add(rate);
                        }
                    }
                }

                // COM streams
                var comStreams = _comManager?.GetActiveStreams();
                if (comStreams != null)
                {
                    foreach (dynamic stream in comStreams)
                    {
                        if (stream.Rate is int rate && rate > 0)
                        {
                            rates.Add(rate);
                        }
                    }
                }

                // MQTT streams
                var mqttStreams = _mqttManager?.GetActiveStreams();
                if (mqttStreams != null)
                {
                    foreach (dynamic stream in mqttStreams)
                    {
                        if (stream.Rate is int rate && rate > 0)
                        {
                            rates.Add(rate);
                        }
                    }
                }

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
                const int bytesPerEntry = 500; // Conservative estimate for new binary architecture entries

                var entriesPerHour = (3600 * 1000) / Math.Max(avgCollectionRateMs, 1000);
                var maxEntriesFromTime = (long)(retentionHours * entriesPerHour);
                var effectiveMaxEntries = Math.Min(maxEntriesPerStream, maxEntriesFromTime);

                var totalEntries = activeStreams * effectiveMaxEntries;
                var totalBytes = (long)(totalEntries * bytesPerEntry * 1.3); // 30% overhead

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

            // Enhanced CSV header for new binary architecture
            csv.AppendLine("Timestamp,ScreenId,DeviceName,ScreenName,Protocol,Status,Latency,SensorsCount,Rate,ConnectionState,SuccessRate,ConsecutiveFailures,ConsecutiveSuccesses,AverageLatency,LastErrorMessage,ErrorType,IsFrameMode,PayloadType,FramesSent,PayloadsSent,AverageFrameSize,AverageFrameRenderTime,IsGatewayMode,GatewayTarget,GatewayMessagesSent,ProtocolSpecificData");

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
                                  $"{entry.IsFrameMode}," +
                                  $"\"{EscapeCsvField(entry.PayloadType)}\"," +
                                  $"{entry.FramesSent}," +
                                  $"{entry.PayloadsSent}," +
                                  $"{entry.AverageFrameSize:F2}," +
                                  $"{entry.AverageFrameRenderTime:F2}," +
                                  $"{entry.IsGatewayMode}," +
                                  $"\"{EscapeCsvField(entry.GatewayTarget ?? "")}\"," +
                                  $"{entry.GatewayMessagesSent}," +
                                  $"\"{EscapeCsvField(protocolData)}\"");
                }
            }

            return csv.ToString();
        }

        private static string EscapeCsvField(string field)
        {
            if (string.IsNullOrEmpty(field))
                return "";

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