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
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace JunctionRelayServer.Services
{
    public class Service_JunctionStartup_Logger
    {
        private readonly ILogger<Service_JunctionStartup_Logger> _logger;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly Service_BackendIdentity _backendIdentity;
        private readonly Service_LogRotation_Manager _logRotationManager;
        private readonly string _logFilePath;
        private bool _isEnabled = false;

        public Service_JunctionStartup_Logger(
            ILogger<Service_JunctionStartup_Logger> logger,
            IServiceScopeFactory scopeFactory,
            Service_BackendIdentity _backendIdentity,
            Service_LogRotation_Manager logRotationManager)
        {
            _logger = logger;
            _scopeFactory = scopeFactory;
            this._backendIdentity = _backendIdentity;
            _logRotationManager = logRotationManager;

            // Create logs directory if it doesn't exist
            var appDataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JunctionRelay");
            var logsDir = Path.Combine(appDataDir, "logs");
            Directory.CreateDirectory(logsDir);

            // Create a dated JSON log file for junction startup events
            var fileName = $"junctionstartup_{DateTime.Now:yyyy-MM-dd}.json";
            _logFilePath = Path.Combine(logsDir, fileName);

            _logger.LogInformation("Junction Startup Logger initialized. Log file: {LogPath}", _logFilePath);
        }

        public async void Initialize()
        {
            // Load settings from database
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var loggingDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_LoggingSettings>();
                var settings = await loggingDb.GetByCategoryAsync("JunctionStartup");

                if (settings == null || !settings.Enabled)
                {
                    _logger.LogInformation("Junction Startup logging is disabled in settings");
                    _isEnabled = false;
                    return;
                }

                _isEnabled = true;
                _logger.LogInformation("Junction Startup logging is enabled");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to load logging settings, defaulting to disabled");
                _isEnabled = false;
            }
        }

        public void LogStartupModeSelected(bool isParallel, int junctionCount)
        {
            if (!_isEnabled) return;

            var logEntry = new
            {
                timestamp = DateTime.UtcNow,
                eventType = "StartupModeSelected",
                backendId = _backendIdentity.GetBackendId(),
                backendName = _backendIdentity.GetFriendlyName(),
                isParallel = isParallel,
                junctionCount = junctionCount,
                mode = isParallel ? "Parallel" : "Sequential"
            };

            LogEvent(logEntry);
        }

        public void LogJunctionStartAttempt(int junctionId, string junctionName, string junctionType)
        {
            if (!_isEnabled) return;

            var logEntry = new
            {
                timestamp = DateTime.UtcNow,
                eventType = "JunctionStartAttempt",
                backendId = _backendIdentity.GetBackendId(),
                backendName = _backendIdentity.GetFriendlyName(),
                junctionId = junctionId,
                junctionName = junctionName,
                junctionType = junctionType
            };

            LogEvent(logEntry);
        }

        public void LogJunctionStartCompleted(int junctionId, string junctionName, bool success, string? error, long durationMs)
        {
            if (!_isEnabled) return;

            var logEntry = new
            {
                timestamp = DateTime.UtcNow,
                eventType = "JunctionStartCompleted",
                backendId = _backendIdentity.GetBackendId(),
                backendName = _backendIdentity.GetFriendlyName(),
                junctionId = junctionId,
                junctionName = junctionName,
                success = success,
                error = error,
                durationMs = durationMs
            };

            LogEvent(logEntry);
        }

        public void LogJunctionStartupSummary(int totalJunctions, int successCount, int failureCount, long totalDurationMs, bool isParallel)
        {
            if (!_isEnabled) return;

            var logEntry = new
            {
                timestamp = DateTime.UtcNow,
                eventType = "JunctionStartupSummary",
                backendId = _backendIdentity.GetBackendId(),
                backendName = _backendIdentity.GetFriendlyName(),
                totalJunctions = totalJunctions,
                successCount = successCount,
                failureCount = failureCount,
                totalDurationMs = totalDurationMs,
                isParallel = isParallel,
                mode = isParallel ? "Parallel" : "Sequential"
            };

            LogEvent(logEntry);
        }

        public void LogServiceLoaded(string serviceName, string serviceType, bool success, string? error)
        {
            if (!_isEnabled) return;

            var logEntry = new
            {
                timestamp = DateTime.UtcNow,
                eventType = "ServiceLoaded",
                backendId = _backendIdentity.GetBackendId(),
                backendName = _backendIdentity.GetFriendlyName(),
                serviceName = serviceName,
                serviceType = serviceType,
                success = success,
                error = error
            };

            LogEvent(logEntry);
        }

        public void LogStartupComplete(long totalDurationMs)
        {
            if (!_isEnabled) return;

            var logEntry = new
            {
                timestamp = DateTime.UtcNow,
                eventType = "StartupComplete",
                backendId = _backendIdentity.GetBackendId(),
                backendName = _backendIdentity.GetFriendlyName(),
                totalDurationMs = totalDurationMs
            };

            LogEvent(logEntry);
        }

        private void LogEvent(object logEntry)
        {
            try
            {
                // Check if file needs rotation
                long maxFileSizeMB = 100;
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var loggingDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_LoggingSettings>();
                    var settings = loggingDb.GetByCategoryAsync("JunctionStartup").GetAwaiter().GetResult();
                    if (settings != null)
                    {
                        maxFileSizeMB = settings.MaxLogFileSizeMB;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to load max file size setting, using default");
                }

                // Rotate if needed
                if (_logRotationManager.ShouldRotateFile(_logFilePath, maxFileSizeMB))
                {
                    try
                    {
                        if (File.Exists(_logFilePath))
                        {
                            File.AppendAllText(_logFilePath, "\n]");
                        }

                        var rotatedPath = _logRotationManager.RotateLogFile(_logFilePath);
                        _logger.LogInformation("Junction startup log file rotated: {RotatedFile}", rotatedPath);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to rotate junction startup log file");
                    }
                }

                // Serialize and write to file
                var options = new JsonSerializerOptions
                {
                    WriteIndented = true,
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                };
                var jsonLine = JsonSerializer.Serialize(logEntry, options);

                // Append to file with JSON array format
                if (File.Exists(_logFilePath) && new FileInfo(_logFilePath).Length > 0)
                {
                    File.AppendAllText(_logFilePath, ",\n" + jsonLine);
                }
                else
                {
                    File.WriteAllText(_logFilePath, "[\n" + jsonLine);
                }

                // Update last logged timestamp
                Task.Run(async () =>
                {
                    try
                    {
                        using var scope = _scopeFactory.CreateScope();
                        var loggingDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_LoggingSettings>();
                        await loggingDb.UpdateLastLoggedAsync("JunctionStartup");
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to update last logged timestamp");
                    }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to log junction startup event to file");
            }
        }

        public string GetLogFilePath()
        {
            return _logFilePath;
        }

        public bool IsEnabled()
        {
            return _isEnabled;
        }
    }
}
