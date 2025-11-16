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
    public class HistoryConfiguration
    {
        public TimeSpan RetentionPeriod { get; set; } = TimeSpan.FromHours(24);
        public int MaxEntriesPerStream { get; set; } = 10000;
        public TimeSpan CleanupInterval { get; set; } = TimeSpan.FromMinutes(15);
        public bool LoggingEnabled { get; set; } = true;
    }

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

        // Frame mode metrics
        public bool IsFrameMode { get; set; }
        public string PayloadType { get; set; } = "JSON";
        public int FramesSent { get; set; }
        public int PayloadsSent { get; set; }
        public double AverageFrameSize { get; set; }
        public double AverageFrameRenderTime { get; set; }

        // Gateway mode metrics
        public bool IsGatewayMode { get; set; }
        public string? GatewayTarget { get; set; }
        public int GatewayMessagesSent { get; set; }

        // Protocol-specific data
        public Dictionary<string, object> ProtocolSpecificData { get; set; } = new();
    }

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
        public int TotalFramesSent { get; set; }
        public int TotalPayloadsSent { get; set; }
        public double AverageFrameSize { get; set; }
        public double AverageFrameRenderTime { get; set; }
        public Dictionary<string, int> ErrorTypeCounts { get; set; } = new();
        public Dictionary<string, int> PayloadTypeCounts { get; set; } = new();
        public List<string> StatusChanges { get; set; } = new();
    }

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

    public class Service_Stream_History_Manager
    {
        private readonly ConcurrentDictionary<int, ConcurrentQueue<StreamHistoryEntry>> _streamHistories = new();
        private readonly HistoryConfiguration _config = new();
        private readonly Timer _cleanupTimer;
        private readonly object _configLock = new();

        public Service_Stream_History_Manager()
        {
            _cleanupTimer = new Timer(PerformCleanup, null, _config.CleanupInterval, _config.CleanupInterval);
        }

        public void UpdateRetentionPeriod(TimeSpan retentionPeriod)
        {
            lock (_configLock)
            {
                _config.RetentionPeriod = retentionPeriod;
            }
            Console.WriteLine($"[STREAM_HISTORY] Retention period updated to {retentionPeriod.TotalHours} hours");
        }

        public void UpdateMaxEntries(int maxEntries)
        {
            lock (_configLock)
            {
                _config.MaxEntriesPerStream = Math.Max(100, maxEntries);
            }
            Console.WriteLine($"[STREAM_HISTORY] Max entries updated to {maxEntries}");
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

        public void AddHistoryEntry(StreamHistoryEntry entry)
        {
            if (entry == null) return;

            bool loggingEnabled;
            lock (_configLock)
            {
                loggingEnabled = _config.LoggingEnabled;
            }

            if (!loggingEnabled) return;

            var queue = _streamHistories.GetOrAdd(entry.ScreenId, _ => new ConcurrentQueue<StreamHistoryEntry>());
            queue.Enqueue(entry);

            if (queue.Count > _config.MaxEntriesPerStream * 1.2)
            {
                TrimQueue(queue, _config.MaxEntriesPerStream);
            }
        }

        // WebSocket stream entry creation
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
                IsFrameMode = info.Health.IsFrameMode,
                PayloadType = info.Health.PayloadType,
                FramesSent = info.Health.FramesSent,
                PayloadsSent = info.Health.PayloadsSent,
                AverageFrameSize = info.Health.AverageFrameSize,
                AverageFrameRenderTime = info.Health.AverageFrameRenderTime,
                IsGatewayMode = info.IsGatewayMode,
                GatewayTarget = info.GatewayTarget,
                GatewayMessagesSent = info.Health.GatewayMessagesSent,
                ProtocolSpecificData = new Dictionary<string, object>
                {
                    ["DeviceMac"] = info.DeviceMac,
                    ["LastWebSocketState"] = info.Health.LastWebSocketState?.ToString() ?? "Unknown",
                    ["ConnectionRecreated"] = info.Health.ConnectionRecreated,
                    ["ConnectionRecreationCount"] = info.Health.ConnectionRecreationCount,
                    ["MinLatency"] = info.Health.MinLatency == long.MaxValue ? 0L : info.Health.MinLatency,
                    ["MaxLatency"] = info.Health.MaxLatency,
                    ["LastSuccessTime"] = info.Health.LastSuccessTime.ToString("O") ?? "",
                    ["LastFailureTime"] = info.Health.LastFailureTime.ToString("O") ?? ""
                }
            };
        }

        // COM stream entry creation
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
                IsFrameMode = info.Health.IsFrameMode,
                PayloadType = info.Health.PayloadType,
                FramesSent = info.Health.FramesSent,
                PayloadsSent = info.Health.PayloadsSent,
                AverageFrameSize = info.Health.AverageFrameSize,
                AverageFrameRenderTime = info.Health.AverageFrameRenderTime,
                IsGatewayMode = info.IsGatewayMode,
                GatewayTarget = info.GatewayTarget,
                GatewayMessagesSent = info.Health.PayloadsSent,
                ProtocolSpecificData = new Dictionary<string, object>
                {
                    ["ComPort"] = info.ComPort ?? "",
                    ["MinLatency"] = info.Health.MinLatency,
                    ["MaxLatency"] = info.Health.MaxLatency,
                    ["LastSuccessTime"] = info.Health.LastSuccessTime.ToString("O"),
                    ["LastFailureTime"] = info.Health.LastFailureTime != DateTime.MinValue ? info.Health.LastFailureTime.ToString("O") : ""
                    //["TotalBytesSent"] = info.Health.TotalBytesSent
                }
            };
        }

        // HTTP stream entry creation
        public StreamHistoryEntry CreateEntryFromHTTP(Service_StreamInfo_HTTP info)
        {
            return new StreamHistoryEntry
            {
                Timestamp = DateTime.UtcNow,
                ScreenId = info.ScreenId,
                DeviceName = info.DeviceName,
                ScreenName = info.ScreenName,
                Protocol = info.Protocol ?? "HTTP",
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
                IsFrameMode = info.Health.IsFrameMode,
                PayloadType = info.Health.PayloadType,
                FramesSent = info.Health.FramesSent,
                PayloadsSent = info.Health.PayloadsSent,
                AverageFrameSize = info.Health.AverageFrameSize,
                AverageFrameRenderTime = info.Health.AverageFrameRenderTime,
                IsGatewayMode = info.IsGatewayMode,
                GatewayTarget = info.GatewayTarget,
                GatewayMessagesSent = info.Health.PayloadsSent,
                ProtocolSpecificData = new Dictionary<string, object>
                {
                    ["HttpStatusCode"] = info.Health.HttpStatusCode ?? 0,
                    ["KeepAlivePoolRecreated"] = info.Health.KeepAlivePoolRecreated,
                    ["PoolRecreationCount"] = info.Health.PoolRecreationCount,
                    ["MinLatency"] = info.Health.MinLatency,
                    ["MaxLatency"] = info.Health.MaxLatency,
                    ["LastSuccessTime"] = info.Health.LastSuccessTime?.ToString("O") ?? "",
                    ["LastFailureTime"] = info.Health.LastFailureTime?.ToString("O") ?? ""
                }
            };
        }

        // Virtual stream entry creation
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
                IsFrameMode = info.Health.IsFrameMode,
                PayloadType = info.Health.PayloadType,
                FramesSent = info.Health.FramesSent,
                PayloadsSent = info.Health.PayloadsSent,
                AverageFrameSize = info.Health.AverageFrameSize,
                AverageFrameRenderTime = info.Health.AverageFrameRenderTime,
                IsGatewayMode = false,
                GatewayTarget = null,
                GatewayMessagesSent = 0,
                ProtocolSpecificData = new Dictionary<string, object>
                {
                    ["IsVirtual"] = true,
                    ["LastSuccessTime"] = info.Health.LastSuccessTime?.ToString("O") ?? "",
                    ["LastFailureTime"] = info.Health.LastFailureTime?.ToString("O") ?? "",
                    ["PayloadsGenerated"] = info.PayloadsGenerated,
                    ["IsBlitMode"] = info.IsBlitMode,
                    ["CanvasWidth"] = info.CanvasWidth,
                    ["CanvasHeight"] = info.CanvasHeight,
                    ["LastFrameSize"] = info.LastFrameSize ?? 0,
                    ["AverageFrameRenderTime"] = info.AverageFrameRenderTime,
                    ["MaxFrameRenderTime"] = info.MaxFrameRenderTime,
                    ["MinFrameRenderTime"] = info.MinFrameRenderTime == long.MaxValue ? 0 : info.MinFrameRenderTime
                }
            };
        }

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
                        Protocol = entries.Length > 0 ? entries.Last().Protocol : "Unknown",
                        IsFrameMode = entries.Length > 0 && entries.Last().IsFrameMode,
                        IsGatewayMode = entries.Length > 0 && entries.Last().IsGatewayMode,
                        TotalFramesSent = entries.Where(e => e.IsFrameMode).Sum(e => e.FramesSent),
                        TotalPayloadsSent = entries.Sum(e => e.PayloadsSent)
                    };
                }).ToList()
            };
        }

        public bool ClearStreamHistory(int screenId)
        {
            return _streamHistories.TryRemove(screenId, out _);
        }

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
                TotalFramesSent = entries.Sum(e => e.FramesSent),
                TotalPayloadsSent = entries.Sum(e => e.PayloadsSent),
                AverageFrameSize = entries.Where(e => e.IsFrameMode && e.AverageFrameSize > 0).DefaultIfEmpty().Average(e => e?.AverageFrameSize ?? 0),
                AverageFrameRenderTime = entries.Where(e => e.IsFrameMode && e.AverageFrameRenderTime > 0).DefaultIfEmpty().Average(e => e?.AverageFrameRenderTime ?? 0),
                ErrorTypeCounts = entries
                    .Where(e => !string.IsNullOrEmpty(e.ErrorType))
                    .GroupBy(e => e.ErrorType)
                    .ToDictionary(g => g.Key!, g => g.Count()),
                PayloadTypeCounts = entries
                    .Where(e => !string.IsNullOrEmpty(e.PayloadType))
                    .GroupBy(e => e.PayloadType)
                    .ToDictionary(g => g.Key!, g => g.Count()),
                StatusChanges = entries
                    .Select((entry, index) => new { entry, index })
                    .Where(x => x.index == 0 || entries[x.index - 1].Status != x.entry.Status)
                    .Select(x => $"{x.entry.Timestamp:HH:mm:ss} - {x.entry.Status}")
                    .ToList()
            };

            return stats;
        }

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
                        TrimQueue(newQueue, _config.MaxEntriesPerStream);
                        _streamHistories[kvp.Key] = newQueue;
                    }
                    else
                    {
                        streamsToRemove.Add(kvp.Key);
                    }
                }

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