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

using System.Collections.Concurrent;

namespace JunctionRelayServer.Services
{
    // Configuration for history retention
    public class HistoryConfiguration
    {
        public TimeSpan RetentionPeriod { get; set; } = TimeSpan.FromHours(24); // Default 24 hours
        public int MaxEntriesPerStream { get; set; } = 10000; // Safety limit
        public TimeSpan CleanupInterval { get; set; } = TimeSpan.FromMinutes(15); // Cleanup frequency
        public bool LoggingEnabled { get; set; } = true; // Enable/disable history logging
    }

    // Single history entry for a stream
    public class StreamHistoryEntry
    {
        public DateTime Timestamp { get; set; }
        public int ScreenId { get; set; }
        public string DeviceName { get; set; } = string.Empty;
        public string ScreenName { get; set; } = string.Empty;
        public string Protocol { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public long Latency { get; set; }
        public int SensorsCount { get; set; }
        public int Rate { get; set; }

        // Health snapshot
        public string ConnectionState { get; set; } = string.Empty;
        public double SuccessRate { get; set; }
        public int ConsecutiveFailures { get; set; }
        public int ConsecutiveSuccesses { get; set; }
        public double AverageLatency { get; set; }
        public string? LastErrorMessage { get; set; }
        public string? ErrorType { get; set; }

        // Protocol-specific data
        public Dictionary<string, object> ProtocolSpecificData { get; set; } = new();
    }

    // Aggregated statistics for time periods
    public class StreamStatistics
    {
        public DateTime PeriodStart { get; set; }
        public DateTime PeriodEnd { get; set; }
        public TimeSpan Period { get; set; }
        public int TotalDataPoints { get; set; }
        public double AverageLatency { get; set; }
        public double MinLatency { get; set; }
        public double MaxLatency { get; set; }
        public double SuccessRate { get; set; }
        public int TotalFailures { get; set; }
        public int TotalSuccesses { get; set; }
        public Dictionary<string, int> ErrorTypeCounts { get; set; } = new();
        public List<string> StatusChanges { get; set; } = new();
    }

    // History response for API
    public class StreamHistoryResponse
    {
        public int ScreenId { get; set; }
        public string DeviceName { get; set; } = string.Empty;
        public string ScreenName { get; set; } = string.Empty;
        public string Protocol { get; set; } = string.Empty;
        public DateTime OldestEntry { get; set; }
        public DateTime NewestEntry { get; set; }
        public int TotalEntries { get; set; }
        public List<StreamHistoryEntry> Entries { get; set; } = new();
        public StreamStatistics? Statistics { get; set; }
    }

    // Main history manager service
    public class Service_Stream_History_Manager
    {
        private readonly ConcurrentDictionary<int, ConcurrentQueue<StreamHistoryEntry>> _streamHistories = new();
        private readonly Service_Database_Manager_StreamHistory _dbManager;
        private readonly HistoryConfiguration _config;
        private readonly Timer _cleanupTimer;
        private readonly object _configLock = new object();

        public Service_Stream_History_Manager(Service_Database_Manager_StreamHistory dbManager)
        {
            _dbManager = dbManager;
            _config = new HistoryConfiguration();

            // Load configuration from database on startup
            LoadConfigurationFromDatabase();

            // Start cleanup timer
            _cleanupTimer = new Timer(PerformCleanup, null, _config.CleanupInterval, _config.CleanupInterval);
        }

        private async void LoadConfigurationFromDatabase()
        {
            try
            {
                var dbConfig = await _dbManager.GetConfigurationAsync();
                lock (_configLock)
                {
                    _config.RetentionPeriod = dbConfig.RetentionPeriod;
                    _config.MaxEntriesPerStream = dbConfig.MaxEntriesPerStream;
                    _config.CleanupInterval = dbConfig.CleanupInterval;
                    _config.LoggingEnabled = dbConfig.LoggingEnabled;
                }
                Console.WriteLine($"[STREAM_HISTORY] Configuration loaded from database: {_config.RetentionPeriod.TotalHours}h retention, {_config.MaxEntriesPerStream} max entries, logging {(_config.LoggingEnabled ? "enabled" : "disabled")}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[STREAM_HISTORY] Failed to load config from database, using defaults: {ex.Message}");
            }
        }

        public async void UpdateRetentionPeriod(TimeSpan retentionPeriod)
        {
            lock (_configLock)
            {
                _config.RetentionPeriod = retentionPeriod;
            }

            try
            {
                await _dbManager.UpdateConfigurationAsync(_config);
                Console.WriteLine($"[STREAM_HISTORY] Retention period updated to {retentionPeriod.TotalHours} hours");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[STREAM_HISTORY] Failed to save retention period: {ex.Message}");
            }
        }

        public async void UpdateMaxEntries(int maxEntries)
        {
            lock (_configLock)
            {
                _config.MaxEntriesPerStream = Math.Max(100, maxEntries); // Minimum 100 entries
            }

            try
            {
                await _dbManager.UpdateConfigurationAsync(_config);
                Console.WriteLine($"[STREAM_HISTORY] Max entries updated to {maxEntries}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[STREAM_HISTORY] Failed to save max entries: {ex.Message}");
            }
        }

        public async void UpdateLoggingEnabled(bool loggingEnabled)
        {
            bool wasEnabled;
            lock (_configLock)
            {
                wasEnabled = _config.LoggingEnabled;
                _config.LoggingEnabled = loggingEnabled;
            }

            try
            {
                await _dbManager.UpdateConfigurationAsync(_config);
                Console.WriteLine($"[STREAM_HISTORY] Logging {(loggingEnabled ? "enabled" : "disabled")}");

                // If logging was disabled, optionally clear existing history
                if (wasEnabled && !loggingEnabled)
                {
                    Console.WriteLine($"[STREAM_HISTORY] Logging disabled - existing history retained until next cleanup");
                }
                else if (!wasEnabled && loggingEnabled)
                {
                    Console.WriteLine($"[STREAM_HISTORY] Logging enabled - will start collecting new data");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[STREAM_HISTORY] Failed to save logging setting: {ex.Message}");
            }
        }

        public HistoryConfiguration GetConfiguration()
        {
            lock (_configLock)
            {
                return new HistoryConfiguration
                {
                    RetentionPeriod = _config.RetentionPeriod,
                    MaxEntriesPerStream = _config.MaxEntriesPerStream,
                    CleanupInterval = _config.CleanupInterval,
                    LoggingEnabled = _config.LoggingEnabled
                };
            }
        }

        // Add a new history entry - only if logging is enabled
        public void AddHistoryEntry(StreamHistoryEntry entry)
        {
            if (entry == null) return;

            // Check if logging is enabled
            bool loggingEnabled;
            lock (_configLock)
            {
                loggingEnabled = _config.LoggingEnabled;
            }

            if (!loggingEnabled)
            {
                // Silently skip adding entries when logging is disabled
                return;
            }

            var queue = _streamHistories.GetOrAdd(entry.ScreenId, _ => new ConcurrentQueue<StreamHistoryEntry>());
            queue.Enqueue(entry);

            // Immediate size check to prevent memory issues
            if (queue.Count > _config.MaxEntriesPerStream * 1.2) // 20% buffer before aggressive cleanup
            {
                TrimQueue(queue, _config.MaxEntriesPerStream);
            }
        }

        // Create entry from COM stream info
        // Create entry from COM stream info
        public StreamHistoryEntry CreateEntryFromCOM(Service_StreamInfo_COM info)
        {
            return new StreamHistoryEntry
            {
                Timestamp = DateTime.UtcNow,
                ScreenId = info.ScreenId,
                DeviceName = info.DeviceName,
                ScreenName = info.ScreenName,
                Protocol = info.Protocol,
                Status = info.Status,
                Latency = info.Latency,
                SensorsCount = info.SensorsCount,
                Rate = info.Rate,
                ConnectionState = info.Health.ConnectionState,
                SuccessRate = info.Health.SuccessRate,
                ConsecutiveFailures = info.Health.ConsecutiveFailures,
                ConsecutiveSuccesses = info.Health.ConsecutiveSuccesses,
                AverageLatency = info.Health.AverageLatency,
                LastErrorMessage = info.Health.LastErrorMessage,
                ErrorType = info.Health.ErrorType,
                ProtocolSpecificData = new Dictionary<string, object>
                {
                    ["MinLatency"] = info.Health.MinLatency,
                    ["MaxLatency"] = info.Health.MaxLatency,
                    ["LastSuccessTime"] = info.Health.LastSuccessTime.ToString("O"),
                    ["LastFailureTime"] = info.Health.LastFailureTime.ToString("O")
                }
            };
        }

        // Create entry from HTTP stream info
        public StreamHistoryEntry CreateEntryFromHTTP(Service_StreamInfo_HTTP info)
        {
            return new StreamHistoryEntry
            {
                Timestamp = DateTime.UtcNow,
                ScreenId = info.ScreenId,
                DeviceName = info.DeviceName,
                ScreenName = info.ScreenName,
                Protocol = info.Protocol,
                Status = info.Status,
                Latency = info.Latency,
                SensorsCount = info.SensorsCount,
                Rate = info.Rate,
                ConnectionState = info.Health.ConnectionState,
                SuccessRate = info.Health.SuccessRate,
                ConsecutiveFailures = info.Health.ConsecutiveFailures,
                ConsecutiveSuccesses = info.Health.ConsecutiveSuccesses,
                AverageLatency = info.Health.AverageLatency,
                LastErrorMessage = info.Health.LastErrorMessage,
                ErrorType = info.Health.ErrorType,
                ProtocolSpecificData = new Dictionary<string, object>
                {
                    ["HttpStatusCode"] = info.Health.HttpStatusCode,
                    ["KeepAlivePoolRecreated"] = info.Health.KeepAlivePoolRecreated,
                    ["PoolRecreationCount"] = info.Health.PoolRecreationCount,
                    ["MinLatency"] = info.Health.MinLatency,
                    ["MaxLatency"] = info.Health.MaxLatency,
                    ["LastSuccessTime"] = info.Health.LastSuccessTime.ToString("O"),
                    ["LastFailureTime"] = info.Health.LastFailureTime.ToString("O")
                }
            };
        }

        // Add this method to your Service_Stream_History_Manager class

        // Create entry from WebSocket stream info
        public StreamHistoryEntry CreateEntryFromWebSocket(Service_StreamInfo_WebSocket info)
        {
            return new StreamHistoryEntry
            {
                Timestamp = DateTime.UtcNow,
                ScreenId = info.ScreenId,
                DeviceName = info.DeviceName,
                ScreenName = info.ScreenName,
                Protocol = info.Protocol,
                Status = info.Status,
                Latency = info.Latency,
                SensorsCount = info.SensorsCount,
                Rate = info.Rate,
                ConnectionState = info.Health.ConnectionState,
                SuccessRate = info.Health.SuccessRate,
                ConsecutiveFailures = info.Health.ConsecutiveFailures,
                ConsecutiveSuccesses = info.Health.ConsecutiveSuccesses,
                AverageLatency = info.Health.AverageLatency,
                LastErrorMessage = info.Health.LastErrorMessage,
                ErrorType = info.Health.ErrorType,
                ProtocolSpecificData = new Dictionary<string, object>
                {
                    ["DeviceMac"] = info.DeviceMac,
                    ["LastWebSocketState"] = info.Health.LastWebSocketState?.ToString() ?? "Unknown",
                    ["ConnectionRecreated"] = info.Health.ConnectionRecreated,
                    ["ConnectionRecreationCount"] = info.Health.ConnectionRecreationCount,
                    ["MinLatency"] = info.Health.MinLatency,
                    ["MaxLatency"] = info.Health.MaxLatency,
                    ["LastSuccessTime"] = info.Health.LastSuccessTime.ToString("O"),
                    ["LastFailureTime"] = info.Health.LastFailureTime.ToString("O"),
                    ["IsGatewayMode"] = info.IsGatewayMode,
                    ["GatewayTarget"] = info.GatewayTarget ?? "",
                    ["GatewayMessagesSent"] = info.Health.GatewayMessagesSent,
                    ["IsFrameMode"] = info.Health.IsFrameMode,
                    ["FramesSent"] = info.Health.FramesSent,
                    ["PayloadsSent"] = info.Health.PayloadsSent,
                    ["PayloadType"] = info.Health.PayloadType
                }
            };
        }

        // Create entry from MQTT stream info
        public StreamHistoryEntry CreateEntryFromMQTT(Service_StreamInfo_MQTT info)
        {
            return new StreamHistoryEntry
            {
                Timestamp = DateTime.UtcNow,
                ScreenId = info.ScreenId,
                DeviceName = info.DeviceName,
                ScreenName = info.ScreenName,
                Protocol = info.Protocol,
                Status = info.Status,
                Latency = info.Latency,
                SensorsCount = info.SensorsCount,
                Rate = info.Rate,
                ConnectionState = info.Health.ConnectionState,
                SuccessRate = info.Health.SuccessRate,
                ConsecutiveFailures = info.Health.ConsecutiveFailures,
                ConsecutiveSuccesses = info.Health.ConsecutiveSuccesses,
                AverageLatency = info.Health.AverageLatency,
                LastErrorMessage = info.Health.LastErrorMessage,
                ErrorType = info.Health.ErrorType,
                ProtocolSpecificData = new Dictionary<string, object>
                {
                    ["ConnectionRecreated"] = info.Health.ConnectionRecreated,
                    ["ConnectionRecreationCount"] = info.Health.ConnectionRecreationCount,
                    ["AcknowledgmentTimeouts"] = info.Health.AcknowledgmentTimeouts,
                    ["PublishFailures"] = info.Health.PublishFailures,
                    ["TopicLatencies"] = info.Health.TopicLatencies,
                    ["MinLatency"] = info.Health.MinLatency,
                    ["MaxLatency"] = info.Health.MaxLatency,
                    ["LastSuccessTime"] = info.Health.LastSuccessTime.ToString("O"),
                    ["LastFailureTime"] = info.Health.LastFailureTime.ToString("O")
                }
            };
        }

        public StreamHistoryEntry CreateEntryFromVirtual(Service_StreamInfo_Virtual info)
        {
            return new StreamHistoryEntry
            {
                Timestamp = DateTime.UtcNow,
                ScreenId = info.ScreenId,
                DeviceName = info.DeviceName,
                ScreenName = info.ScreenName,
                Protocol = info.Protocol,
                Status = info.Status,
                Latency = info.Latency,
                SensorsCount = info.SensorsCount,
                Rate = info.Rate,
                ConnectionState = info.Health.ConnectionState,
                SuccessRate = info.Health.SuccessRate,
                ConsecutiveFailures = info.Health.ConsecutiveFailures,
                ConsecutiveSuccesses = info.Health.ConsecutiveSuccesses,
                AverageLatency = info.Health.AverageLatency,
                LastErrorMessage = info.Health.LastErrorMessage,
                ErrorType = info.Health.ErrorType,
                ProtocolSpecificData = new Dictionary<string, object>
                {
                    ["IsVirtual"] = true,
                    ["LastSuccessTime"] = info.Health.LastSuccessTime.ToString("O"),
                    ["LastFailureTime"] = info.Health.LastFailureTime.ToString("O"),
                    ["PayloadsGenerated"] = info.PayloadsGenerated
                }
            };
        }


        // Get history for a specific stream
        public StreamHistoryResponse GetStreamHistory(int screenId, DateTime? fromTime = null, DateTime? toTime = null, bool includeStatistics = true)
        {
            if (!_streamHistories.TryGetValue(screenId, out var queue))
            {
                return new StreamHistoryResponse { ScreenId = screenId };
            }

            var entries = queue.ToArray();
            if (entries.Length == 0)
            {
                return new StreamHistoryResponse { ScreenId = screenId };
            }

            // Apply time filtering
            var filteredEntries = entries.AsEnumerable();
            if (fromTime.HasValue)
            {
                filteredEntries = filteredEntries.Where(e => e.Timestamp >= fromTime.Value);
            }
            if (toTime.HasValue)
            {
                filteredEntries = filteredEntries.Where(e => e.Timestamp <= toTime.Value);
            }

            var finalEntries = filteredEntries.OrderBy(e => e.Timestamp).ToList();
            if (finalEntries.Count == 0)
            {
                return new StreamHistoryResponse { ScreenId = screenId };
            }

            var response = new StreamHistoryResponse
            {
                ScreenId = screenId,
                DeviceName = finalEntries.First().DeviceName,
                ScreenName = finalEntries.First().ScreenName,
                Protocol = finalEntries.First().Protocol,
                OldestEntry = finalEntries.First().Timestamp,
                NewestEntry = finalEntries.Last().Timestamp,
                TotalEntries = finalEntries.Count,
                Entries = finalEntries
            };

            if (includeStatistics && finalEntries.Count > 1)
            {
                response.Statistics = CalculateStatistics(finalEntries);
            }

            return response;
        }

        // Get history for all streams
        public Dictionary<int, StreamHistoryResponse> GetAllStreamHistories(DateTime? fromTime = null, DateTime? toTime = null, bool includeStatistics = false)
        {
            var result = new Dictionary<int, StreamHistoryResponse>();

            foreach (var screenId in _streamHistories.Keys)
            {
                var history = GetStreamHistory(screenId, fromTime, toTime, includeStatistics);
                if (history.TotalEntries > 0)
                {
                    result[screenId] = history;
                }
            }

            return result;
        }

        // Get summary of all streams
        public object GetHistorySummary()
        {
            var now = DateTime.UtcNow;
            var cutoff = now - _config.RetentionPeriod;

            return new
            {
                TotalStreams = _streamHistories.Count,
                RetentionPeriod = _config.RetentionPeriod,
                MaxEntriesPerStream = _config.MaxEntriesPerStream,
                LoggingEnabled = _config.LoggingEnabled,
                Streams = _streamHistories.Select(kvp =>
                {
                    var entries = kvp.Value.Where(e => e.Timestamp >= cutoff).ToArray();
                    return new
                    {
                        ScreenId = kvp.Key,
                        EntryCount = entries.Length,
                        OldestEntry = entries.Length > 0 ? entries.Min(e => e.Timestamp) : (DateTime?)null,
                        NewestEntry = entries.Length > 0 ? entries.Max(e => e.Timestamp) : (DateTime?)null,
                        DeviceName = entries.Length > 0 ? entries.Last().DeviceName : "Unknown",
                        Protocol = entries.Length > 0 ? entries.Last().Protocol : "Unknown"
                    };
                }).ToList()
            };
        }

        // Clear history for a specific stream
        public bool ClearStreamHistory(int screenId)
        {
            return _streamHistories.TryRemove(screenId, out _);
        }

        // Clear all history
        public void ClearAllHistory()
        {
            _streamHistories.Clear();
        }

        // Calculate statistics for a set of entries
        private StreamStatistics CalculateStatistics(List<StreamHistoryEntry> entries)
        {
            if (entries.Count == 0)
                return new StreamStatistics();

            var start = entries.First().Timestamp;
            var end = entries.Last().Timestamp;
            var latencies = entries.Select(e => (double)e.Latency).ToArray();
            var successfulEntries = entries.Where(e => e.ConsecutiveFailures == 0).ToArray();

            var stats = new StreamStatistics
            {
                PeriodStart = start,
                PeriodEnd = end,
                Period = end - start,
                TotalDataPoints = entries.Count,
                AverageLatency = latencies.Average(),
                MinLatency = latencies.Min(),
                MaxLatency = latencies.Max(),
                SuccessRate = entries.Count > 0 ? (double)successfulEntries.Length / entries.Count * 100 : 0,
                TotalSuccesses = successfulEntries.Length,
                TotalFailures = entries.Count - successfulEntries.Length,
                ErrorTypeCounts = entries
                    .Where(e => !string.IsNullOrEmpty(e.ErrorType))
                    .GroupBy(e => e.ErrorType)
                    .ToDictionary(g => g.Key!, g => g.Count()),
                StatusChanges = entries
                    .Select((entry, index) => new { entry, index })
                    .Where(x => x.index == 0 || entries[x.index - 1].Status != x.entry.Status)
                    .Select(x => $"{x.entry.Timestamp:HH:mm:ss} - {x.entry.Status}")
                    .ToList()
            };

            return stats;
        }

        // Cleanup old entries
        private void PerformCleanup(object? state)
        {
            try
            {
                var cutoff = DateTime.UtcNow - _config.RetentionPeriod;
                var streamsToRemove = new List<int>();

                foreach (var kvp in _streamHistories)
                {
                    var queue = kvp.Value;
                    var newQueue = new ConcurrentQueue<StreamHistoryEntry>();
                    var hasValidEntries = false;

                    // Move valid entries to new queue
                    while (queue.TryDequeue(out var entry))
                    {
                        if (entry.Timestamp >= cutoff)
                        {
                            newQueue.Enqueue(entry);
                            hasValidEntries = true;
                        }
                    }

                    if (hasValidEntries)
                    {
                        // Trim to max entries if needed
                        TrimQueue(newQueue, _config.MaxEntriesPerStream);
                        _streamHistories[kvp.Key] = newQueue;
                    }
                    else
                    {
                        streamsToRemove.Add(kvp.Key);
                    }
                }

                // Remove empty streams
                foreach (var screenId in streamsToRemove)
                {
                    _streamHistories.TryRemove(screenId, out _);
                }

                var loggingStatus = _config.LoggingEnabled ? "enabled" : "disabled";
                Console.WriteLine($"[STREAM_HISTORY] Cleanup completed. Removed {streamsToRemove.Count} empty streams. Active streams: {_streamHistories.Count}. Logging: {loggingStatus}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[STREAM_HISTORY] Cleanup error: {ex.Message}");
            }
        }

        // Trim queue to specified size
        private static void TrimQueue(ConcurrentQueue<StreamHistoryEntry> queue, int maxSize)
        {
            var excess = queue.Count - maxSize;
            for (int i = 0; i < excess; i++)
            {
                queue.TryDequeue(out _);
            }
        }

        public void Dispose()
        {
            _cleanupTimer?.Dispose();
            _streamHistories.Clear();
        }
    }
}