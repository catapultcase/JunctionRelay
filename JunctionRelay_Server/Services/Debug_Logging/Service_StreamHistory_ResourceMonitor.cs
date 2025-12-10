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

using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace JunctionRelayServer.Services
{
    public class Service_StreamHistory_ResourceMonitor
    {
        private readonly ILogger<Service_StreamHistory_ResourceMonitor> _logger;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly Service_BackendIdentity _backendIdentity;
        private readonly Service_LogRotation_Manager _logRotationManager;
        private readonly Service_Stream_History_Manager _streamHistoryManager;
        private Timer? _monitoringTimer;
        private readonly string _logFilePath;
        private int _currentIntervalMinutes = 15;

        public Service_StreamHistory_ResourceMonitor(
            ILogger<Service_StreamHistory_ResourceMonitor> logger,
            IServiceScopeFactory scopeFactory,
            Service_BackendIdentity backendIdentity,
            Service_LogRotation_Manager logRotationManager,
            Service_Stream_History_Manager streamHistoryManager)
        {
            _logger = logger;
            _scopeFactory = scopeFactory;
            _backendIdentity = backendIdentity;
            _logRotationManager = logRotationManager;
            _streamHistoryManager = streamHistoryManager;

            // Create logs directory if it doesn't exist (in user's local app data)
            var appDataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JunctionRelay");
            var logsDir = Path.Combine(appDataDir, "logs");
            Directory.CreateDirectory(logsDir);

            // Create a dated JSON log file for stream history resource monitoring
            var fileName = $"stream_history_resources_{DateTime.Now:yyyy-MM-dd}.json";
            _logFilePath = Path.Combine(logsDir, fileName);

            _logger.LogInformation("Stream History Resource Monitor initialized. Log file: {LogPath}", _logFilePath);
        }

        public async void StartMonitoring()
        {
            if (_monitoringTimer != null)
            {
                _logger.LogWarning("Stream History resource monitoring already started");
                return;
            }

            // Load settings from database
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var loggingDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_LoggingSettings>();
                var settings = await loggingDb.GetByCategoryAsync("StreamHistory");

                if (settings == null || !settings.Enabled)
                {
                    _logger.LogInformation("Stream History resource monitoring is disabled in settings");
                    return;
                }

                _currentIntervalMinutes = settings.LogIntervalMinutes;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to load logging settings, using defaults");
                _currentIntervalMinutes = 15;
            }

            // Log immediately on start
            LogResourceSnapshot("INITIAL");

            // Then log at configured interval
            var intervalMs = TimeSpan.FromMinutes(_currentIntervalMinutes);
            _monitoringTimer = new Timer(
                callback: _ => LogResourceSnapshot("SCHEDULED"),
                state: null,
                dueTime: intervalMs,
                period: intervalMs
            );

            _logger.LogInformation("Stream History resource monitoring started (interval: {Interval} minutes)", _currentIntervalMinutes);
        }

        public void LogManualSnapshot()
        {
            LogResourceSnapshot("MANUAL");
        }

        public string GetLogFilePath()
        {
            return _logFilePath;
        }

        public bool LogFileExists()
        {
            return File.Exists(_logFilePath);
        }

        public long GetLogFileSize()
        {
            if (!File.Exists(_logFilePath))
                return 0;

            var fileInfo = new FileInfo(_logFilePath);
            return fileInfo.Length;
        }

        public bool IsMonitoring()
        {
            return _monitoringTimer != null;
        }

        public int GetCurrentIntervalMinutes()
        {
            return _currentIntervalMinutes;
        }

        public void StopMonitoring()
        {
            if (_monitoringTimer != null)
            {
                LogResourceSnapshot("FINAL");

                // Close the JSON array
                try
                {
                    if (File.Exists(_logFilePath))
                    {
                        File.AppendAllText(_logFilePath, "\n]");
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to close JSON array in log file");
                }

                _monitoringTimer.Dispose();
                _monitoringTimer = null;
                _logger.LogInformation("Stream History resource monitoring stopped");
            }
        }

        private void LogResourceSnapshot(string snapshotType)
        {
            try
            {
                // Update last logged timestamp in database
                Task.Run(async () =>
                {
                    try
                    {
                        using var scope = _scopeFactory.CreateScope();
                        var loggingDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_LoggingSettings>();
                        await loggingDb.UpdateLastLoggedAsync("StreamHistory");
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to update last logged timestamp");
                    }
                });

                var now = DateTime.UtcNow;
                var config = _streamHistoryManager.GetConfiguration();
                var summary = _streamHistoryManager.GetHistorySummary();

                // Extract summary data
                var summaryDict = (dynamic)summary;
                var totalStreams = (int)summaryDict.TotalStreams;
                var streams = (System.Collections.IEnumerable)summaryDict.Streams;

                // Calculate total entries and estimated memory
                int totalEntries = 0;
                var streamDetails = new List<object>();

                foreach (dynamic stream in streams)
                {
                    int entryCount = (int)stream.EntryCount;
                    totalEntries += entryCount;

                    DateTime? oldestEntry = stream.OldestEntry;
                    DateTime? newestEntry = stream.NewestEntry;

                    streamDetails.Add(new
                    {
                        screenId = (int)stream.ScreenId,
                        deviceName = (string)stream.DeviceName,
                        protocol = (string)stream.Protocol,
                        entryCount = entryCount,
                        oldestEntryAge = oldestEntry.HasValue ? FormatAge(now - oldestEntry.Value) : "N/A",
                        newestEntryAge = newestEntry.HasValue ? FormatAge(now - newestEntry.Value) : "N/A",
                        isFrameMode = (bool)stream.IsFrameMode,
                        isGatewayMode = (bool)stream.IsGatewayMode,
                        totalFramesSent = (int)stream.TotalFramesSent,
                        totalPayloadsSent = (int)stream.TotalPayloadsSent
                    });
                }

                // Estimate memory: ~1.5 KB per entry (conservative estimate including dictionaries)
                double estimatedMemoryMB = (totalEntries * 1.5) / 1024.0;

                // Build the snapshot object
                var snapshot = new
                {
                    timestamp = now,
                    snapshotType = snapshotType,
                    backendId = _backendIdentity.GetBackendId(),
                    backendName = _backendIdentity.GetFriendlyName(),
                    streamHistoryStats = new
                    {
                        totalStreams = totalStreams,
                        totalEntries = totalEntries,
                        estimatedMemoryMB = Math.Round(estimatedMemoryMB, 2),
                        retentionPeriodHours = Math.Round(config.RetentionPeriod.TotalHours, 1),
                        maxEntriesPerStream = config.MaxEntriesPerStream,
                        cleanupIntervalMinutes = Math.Round(config.CleanupInterval.TotalMinutes, 1),
                        loggingEnabled = config.LoggingEnabled
                    },
                    streamDetails = streamDetails
                };

                // Serialize to JSON with indentation for readability
                var options = new JsonSerializerOptions
                {
                    WriteIndented = true,
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                };
                var jsonLine = JsonSerializer.Serialize(snapshot, options);

                // Check if file needs rotation based on max size setting
                long maxFileSizeMB = 100; // Default
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var loggingDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_LoggingSettings>();
                    var settings = loggingDb.GetByCategoryAsync("StreamHistory").GetAwaiter().GetResult();
                    if (settings != null)
                    {
                        maxFileSizeMB = settings.MaxLogFileSizeMB;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to load max file size setting, using default");
                }

                // Check and rotate if needed
                if (_logRotationManager.ShouldRotateFile(_logFilePath, maxFileSizeMB))
                {
                    try
                    {
                        // Close the JSON array before rotating
                        if (File.Exists(_logFilePath))
                        {
                            File.AppendAllText(_logFilePath, "\n]");
                        }

                        var rotatedPath = _logRotationManager.RotateLogFile(_logFilePath);
                        _logger.LogInformation("Stream History resource log rotated to: {Path}", rotatedPath);
                    }
                    catch (Exception rotateEx)
                    {
                        _logger.LogError(rotateEx, "Failed to rotate log file");
                    }
                }

                // Append to file
                var isNewFile = !File.Exists(_logFilePath);
                var prefix = isNewFile ? "[" : ",";
                File.AppendAllText(_logFilePath, $"{prefix}\n{jsonLine}");

                // Console output for immediate visibility
                Console.WriteLine($"[STREAM_HISTORY_MONITOR] {snapshotType} snapshot logged - Streams: {totalStreams} | Entries: {totalEntries} | Est. Memory: {estimatedMemoryMB:N2}MB");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to log stream history resource snapshot");
            }
        }

        private string FormatAge(TimeSpan age)
        {
            if (age.TotalHours >= 1)
                return $"{(int)age.TotalHours}h {age.Minutes}m";
            else if (age.TotalMinutes >= 1)
                return $"{(int)age.TotalMinutes}m {age.Seconds}s";
            else
                return $"{age.Seconds}s";
        }

        public void Dispose()
        {
            StopMonitoring();
        }
    }
}
