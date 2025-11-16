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
    public class Service_CloudBackupScheduler_Logger
    {
        private readonly ILogger<Service_CloudBackupScheduler_Logger> _logger;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly Service_BackendIdentity _backendIdentity;
        private readonly Service_LogRotation_Manager _logRotationManager;
        private readonly string _logFilePath;
        private bool _isEnabled = false;

        public Service_CloudBackupScheduler_Logger(
            ILogger<Service_CloudBackupScheduler_Logger> logger,
            IServiceScopeFactory scopeFactory,
            Service_BackendIdentity backendIdentity,
            Service_LogRotation_Manager logRotationManager)
        {
            _logger = logger;
            _scopeFactory = scopeFactory;
            _backendIdentity = backendIdentity;
            _logRotationManager = logRotationManager;

            // Create logs directory if it doesn't exist
            var appDataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JunctionRelay");
            var logsDir = Path.Combine(appDataDir, "logs");
            Directory.CreateDirectory(logsDir);

            // Create a dated JSON log file for cloud backup scheduler events
            var fileName = $"cloudbackup_{DateTime.Now:yyyy-MM-dd}.json";
            _logFilePath = Path.Combine(logsDir, fileName);

            _logger.LogInformation("Cloud Backup Scheduler Logger initialized. Log file: {LogPath}", _logFilePath);
        }

        public async void Initialize()
        {
            // Load settings from database
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var loggingDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_LoggingSettings>();
                var settings = await loggingDb.GetByCategoryAsync("CloudBackupScheduler");

                if (settings == null || !settings.Enabled)
                {
                    _logger.LogInformation("Cloud Backup Scheduler logging is disabled in settings");
                    _isEnabled = false;
                    return;
                }

                _isEnabled = true;
                _logger.LogInformation("Cloud Backup Scheduler logging is enabled");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to load logging settings, defaulting to disabled");
                _isEnabled = false;
            }
        }

        public void LogSchedulerCheck(bool hasAuth, bool hasLicense, bool backupsEnabled, string? lastBackupUtc, string frequency, bool backupDue, double? hoursSinceLastBackup = null, string? skipReason = null)
        {
            if (!_isEnabled) return;

            var logEntry = new
            {
                timestamp = DateTime.UtcNow,
                eventType = "SchedulerCheck",
                backendId = _backendIdentity.GetBackendId(),
                backendName = _backendIdentity.GetFriendlyName(),
                hasAuth = hasAuth,
                hasLicense = hasLicense,
                backupsEnabled = backupsEnabled,
                lastBackupUtc = lastBackupUtc,
                frequency = frequency,
                backupDue = backupDue,
                hoursSinceLastBackup = hoursSinceLastBackup,
                skipReason = skipReason
            };

            LogEvent(logEntry);

            if (!backupDue)
            {
                _logger.LogInformation("[CLOUD_BACKUP] Scheduler check: No backup due. Last backup: {LastBackup}, Frequency: {Frequency}, Hours elapsed: {Hours}",
                    lastBackupUtc ?? "Never", frequency, hoursSinceLastBackup?.ToString("F1") ?? "N/A");
            }
            else
            {
                _logger.LogInformation("[CLOUD_BACKUP] Scheduler check: Backup DUE! Last backup: {LastBackup}, Frequency: {Frequency}, Hours elapsed: {Hours}",
                    lastBackupUtc ?? "Never", frequency, hoursSinceLastBackup?.ToString("F1") ?? "N/A");
            }
        }

        public void LogBackupTriggered(string frequency, bool includeKeys, bool includeIdentity, bool includeFrameEngine)
        {
            if (!_isEnabled) return;

            var logEntry = new
            {
                timestamp = DateTime.UtcNow,
                eventType = "BackupTriggered",
                backendId = _backendIdentity.GetBackendId(),
                backendName = _backendIdentity.GetFriendlyName(),
                frequency = frequency,
                includeKeys = includeKeys,
                includeIdentity = includeIdentity,
                includeFrameEngine = includeFrameEngine
            };

            LogEvent(logEntry);
            _logger.LogInformation("[CLOUD_BACKUP] Backup triggered. Frequency: {Frequency}, Keys: {Keys}, Identity: {Identity}, FrameEngine: {FE}",
                frequency, includeKeys, includeIdentity, includeFrameEngine);
        }

        public void LogBackupCompleted(string backupId, string filename, long sizeBytes, long uploadDurationMs, bool hasManifest)
        {
            if (!_isEnabled) return;

            var logEntry = new
            {
                timestamp = DateTime.UtcNow,
                eventType = "BackupCompleted",
                backendId = _backendIdentity.GetBackendId(),
                backendName = _backendIdentity.GetFriendlyName(),
                backupId = backupId,
                filename = filename,
                sizeBytes = sizeBytes,
                uploadDurationMs = uploadDurationMs,
                hasManifest = hasManifest
            };

            LogEvent(logEntry);
            _logger.LogInformation("[CLOUD_BACKUP] Backup completed successfully. ID: {BackupId}, Size: {Size} bytes, Duration: {Duration}ms",
                backupId, sizeBytes, uploadDurationMs);
        }

        public void LogBackupFailed(string step, string errorMessage, string? backupId = null)
        {
            if (!_isEnabled) return;

            var logEntry = new
            {
                timestamp = DateTime.UtcNow,
                eventType = "BackupFailed",
                backendId = _backendIdentity.GetBackendId(),
                backendName = _backendIdentity.GetFriendlyName(),
                step = step,
                errorMessage = errorMessage,
                backupId = backupId
            };

            LogEvent(logEntry);
            _logger.LogWarning("[CLOUD_BACKUP] Backup failed at step: {Step}. Error: {Error}", step, errorMessage);
        }

        public void LogBackupSkipped(string reason)
        {
            if (!_isEnabled) return;

            var logEntry = new
            {
                timestamp = DateTime.UtcNow,
                eventType = "BackupSkipped",
                backendId = _backendIdentity.GetBackendId(),
                backendName = _backendIdentity.GetFriendlyName(),
                reason = reason
            };

            LogEvent(logEntry);
            _logger.LogInformation("[CLOUD_BACKUP] Backup skipped: {Reason}", reason);
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
                    var settings = loggingDb.GetByCategoryAsync("CloudBackupScheduler").GetAwaiter().GetResult();
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
                        _logger.LogInformation("Cloud backup log file rotated: {RotatedFile}", rotatedPath);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to rotate cloud backup log file");
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
                        await loggingDb.UpdateLastLoggedAsync("CloudBackupScheduler");
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to update last logged timestamp");
                    }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to log cloud backup scheduler event to file");
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
