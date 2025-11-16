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

using Microsoft.Extensions.Logging;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    public class Service_LogRotation_Manager
    {
        private readonly ILogger<Service_LogRotation_Manager> _logger;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly string _logsDirectory;

        public Service_LogRotation_Manager(
            ILogger<Service_LogRotation_Manager> logger,
            IServiceScopeFactory scopeFactory)
        {
            _logger = logger;
            _scopeFactory = scopeFactory;
            var appDataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JunctionRelay");
            _logsDirectory = Path.Combine(appDataDir, "logs");

            // Ensure logs directory exists
            Directory.CreateDirectory(_logsDirectory);
        }

        public LogDirectoryInfo GetLogDirectoryInfo()
        {
            var info = new LogDirectoryInfo
            {
                DirectoryPath = _logsDirectory,
                Files = new List<LogFileInfo>()
            };

            if (!Directory.Exists(_logsDirectory))
            {
                return info;
            }

            // Search for both .log and .json files
            var logFiles = Directory.GetFiles(_logsDirectory, "*.log", SearchOption.AllDirectories);
            var jsonFiles = Directory.GetFiles(_logsDirectory, "*.json", SearchOption.AllDirectories);
            var allFiles = logFiles.Concat(jsonFiles).Distinct();

            foreach (var file in allFiles)
            {
                var fileInfo = new FileInfo(file);
                info.Files.Add(new LogFileInfo
                {
                    FilePath = file,
                    FileName = fileInfo.Name,
                    SizeBytes = fileInfo.Length,
                    CreatedAt = fileInfo.CreationTimeUtc,
                    LastModified = fileInfo.LastWriteTimeUtc,
                    Category = DetermineCategoryFromFileName(fileInfo.Name)
                });
            }

            info.TotalSizeBytes = info.Files.Sum(f => f.SizeBytes);
            info.TotalFiles = info.Files.Count;

            return info;
        }

        public async Task<LogCleanupResult> PerformGlobalCleanupAsync()
        {
            _logger.LogInformation("Starting global log cleanup");

            var result = new LogCleanupResult();

            try
            {
                using var scope = _scopeFactory.CreateScope();
                var loggingDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_LoggingSettings>();
                var allSettings = await loggingDb.GetAllAsync();

                foreach (var setting in allSettings.Where(s => s.AutoCleanupEnabled))
                {
                    var categoryResult = await CleanupCategoryAsync(setting);
                    result.FilesDeleted += categoryResult.FilesDeleted;
                    result.BytesFreed += categoryResult.BytesFreed;
                    result.CategoriesProcessed++;

                    // Update last cleanup time
                    await loggingDb.UpdateLastCleanupAsync(setting.Category);
                }

                result.Success = true;
                _logger.LogInformation("Global log cleanup completed: {FilesDeleted} files deleted, {BytesFreed} bytes freed",
                    result.FilesDeleted, result.BytesFreed);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.ErrorMessage = ex.Message;
                _logger.LogError(ex, "Global log cleanup failed");
            }

            return result;
        }

        public async Task<LogCleanupResult> CleanupCategoryAsync(Model_LoggingSettings settings)
        {
            var result = new LogCleanupResult { Success = true };

            try
            {
                var categoryPrefix = GetLogFilePrefix(settings.Category);

                // Search for both .log and .json files
                var logFiles = Directory.GetFiles(_logsDirectory, $"{categoryPrefix}*.log", SearchOption.TopDirectoryOnly);
                var jsonFiles = Directory.GetFiles(_logsDirectory, $"{categoryPrefix}*.json", SearchOption.TopDirectoryOnly);
                var allFiles = logFiles.Concat(jsonFiles);

                var cutoffDate = DateTime.UtcNow.AddDays(-settings.MaxLogRetentionDays);

                foreach (var file in allFiles)
                {
                    var fileInfo = new FileInfo(file);

                    // Check if file is older than retention period
                    if (fileInfo.LastWriteTime.ToUniversalTime() < cutoffDate)
                    {
                        try
                        {
                            var fileSize = fileInfo.Length;
                            fileInfo.Delete();
                            result.FilesDeleted++;
                            result.BytesFreed += fileSize;

                            _logger.LogInformation("Deleted old log file: {FileName} ({Size} bytes)",
                                fileInfo.Name, fileSize);
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Failed to delete log file: {FileName}", fileInfo.Name);
                        }
                    }
                }

                // Update database with cleanup timestamp
                using var scope = _scopeFactory.CreateScope();
                var loggingDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_LoggingSettings>();
                await loggingDb.UpdateLastCleanupAsync(settings.Category);
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.ErrorMessage = ex.Message;
                _logger.LogError(ex, "Cleanup failed for category: {Category}", settings.Category);
            }

            return result;
        }

        public bool ShouldRotateFile(string filePath, long maxSizeMB)
        {
            if (!File.Exists(filePath))
                return false;

            var fileInfo = new FileInfo(filePath);
            var maxSizeBytes = maxSizeMB * 1024 * 1024;

            return fileInfo.Length >= maxSizeBytes;
        }

        public string RotateLogFile(string filePath)
        {
            if (!File.Exists(filePath))
                throw new FileNotFoundException("Log file not found", filePath);

            var directory = Path.GetDirectoryName(filePath) ?? _logsDirectory;
            var fileNameWithoutExt = Path.GetFileNameWithoutExtension(filePath);
            var extension = Path.GetExtension(filePath);

            // Find next available sequence number
            int sequence = 1;
            string newFilePath;
            do
            {
                newFilePath = Path.Combine(directory, $"{fileNameWithoutExt}_{sequence:D3}{extension}");
                sequence++;
            } while (File.Exists(newFilePath));

            File.Move(filePath, newFilePath);
            _logger.LogInformation("Rotated log file: {OldPath} -> {NewPath}", filePath, newFilePath);

            return newFilePath;
        }

        private string GetLogFilePrefix(string category)
        {
            return category switch
            {
                "BlitMode" => "blit_resources",
                "CloudBackupScheduler" => "cloudbackup",
                "JunctionStartup" => "junctionstartup",
                _ => category.ToLower()
            };
        }

        private string DetermineCategoryFromFileName(string fileName)
        {
            if (fileName.StartsWith("blit_resources"))
                return "BlitMode";

            if (fileName.StartsWith("stream_history_resources"))
                return "StreamHistory";

            if (fileName.StartsWith("auth_"))
                return "LoginAndAuthentication";

            if (fileName.StartsWith("cloudbackup_"))
                return "CloudBackupScheduler";

            if (fileName.StartsWith("junctionstartup_"))
                return "JunctionStartup";

            return "Unknown";
        }

        public async Task<LogCleanupResult> ManualCleanupAsync(string category)
        {
            _logger.LogInformation("Manual cleanup triggered for category: {Category}", category);

            using var scope = _scopeFactory.CreateScope();
            var loggingDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_LoggingSettings>();
            var settings = await loggingDb.GetByCategoryAsync(category);

            if (settings == null)
            {
                return new LogCleanupResult
                {
                    Success = false,
                    ErrorMessage = $"Settings not found for category: {category}"
                };
            }

            return await CleanupCategoryAsync(settings);
        }

        public async Task RunStartupCleanupAsync()
        {
            _logger.LogInformation("Running startup log cleanup");

            try
            {
                using var scope = _scopeFactory.CreateScope();
                var loggingDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_LoggingSettings>();
                var allSettings = await loggingDb.GetAllAsync();

                foreach (var setting in allSettings.Where(s => s.AutoCleanupEnabled))
                {
                    // Only run cleanup if last cleanup was more than 1 day ago or never ran
                    if (setting.LastCleanupAt == null ||
                        (DateTime.UtcNow - setting.LastCleanupAt.Value).TotalDays >= 1)
                    {
                        await CleanupCategoryAsync(setting);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Startup log cleanup failed");
            }
        }
    }

    public class LogDirectoryInfo
    {
        public string DirectoryPath { get; set; } = string.Empty;
        public List<LogFileInfo> Files { get; set; } = new();
        public long TotalSizeBytes { get; set; }
        public int TotalFiles { get; set; }
    }

    public class LogFileInfo
    {
        public string FilePath { get; set; } = string.Empty;
        public string FileName { get; set; } = string.Empty;
        public long SizeBytes { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime LastModified { get; set; }
        public string Category { get; set; } = string.Empty;
    }

    // Result of a log cleanup operation
    public class LogCleanupResult
    {
        public bool Success { get; set; }
        public int FilesDeleted { get; set; }
        public long BytesFreed { get; set; }
        public int CategoriesProcessed { get; set; }
        public string? ErrorMessage { get; set; }
    }
}
