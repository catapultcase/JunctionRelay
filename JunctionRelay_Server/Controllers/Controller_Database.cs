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
using JunctionRelayServer.Utils;
using System.IO.Compression;

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("api/db")]
    public class Controller_Database : ControllerBase
    {
        private readonly string _dbPath;
        private readonly IWebHostEnvironment _env;
        private readonly ILogger<Controller_Database> _logger;

        public Controller_Database(DatabasePathProvider dbPathProvider, IWebHostEnvironment env, ILogger<Controller_Database> logger)
        {
            _dbPath = dbPathProvider.DbPath;
            _env = env;
            _logger = logger;
        }

        [HttpDelete("delete-database")]
        public IActionResult DeleteDatabase()
        {
            try
            {
                _logger.LogWarning("Database deletion requested - marking for deletion on next restart");

                var deletedItems = new List<string>();
                var errors = new List<string>();

                // Create a marker file that tells the application to delete everything on startup
                var deleteMarkerPath = Path.Combine(_env.ContentRootPath, ".delete-all-data");

                try
                {
                    var markerContent = $"DELETE_ALL_DATA_ON_STARTUP\nRequested at: {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC\nReason: User requested complete database reset";
                    System.IO.File.WriteAllText(deleteMarkerPath, markerContent);
                    deletedItems.Add("Created deletion marker for next startup");
                    _logger.LogInformation("Created deletion marker file: {MarkerPath}", deleteMarkerPath);
                }
                catch (Exception ex)
                {
                    errors.Add($"Failed to create deletion marker: {ex.Message}");
                    _logger.LogError(ex, "Failed to create deletion marker file");
                    return StatusCode(500, new { error = "Failed to schedule database deletion", details = errors });
                }

                // Clear cache immediately (this we can do safely)
                var firmwareDirectory = Path.Combine(_env.ContentRootPath, "Firmware");
                var releaseCacheDirectory = Path.Combine(firmwareDirectory, "Releases");

                if (Directory.Exists(releaseCacheDirectory))
                {
                    try
                    {
                        var cacheFiles = Directory.GetFiles(releaseCacheDirectory, "*.json");
                        foreach (var file in cacheFiles)
                        {
                            try
                            {
                                System.IO.File.Delete(file);
                            }
                            catch (Exception ex)
                            {
                                _logger.LogWarning(ex, "Failed to delete cache file: {File}", file);
                            }
                        }
                        deletedItems.Add($"Cleared {cacheFiles.Length} cache files");
                    }
                    catch (Exception ex)
                    {
                        errors.Add($"Failed to clear some cache files: {ex.Message}");
                    }
                }

                // Clear logs directory (optional - be careful not to delete current log)
                var logsDirectory = Path.Combine(_env.ContentRootPath, "Logs");
                if (Directory.Exists(logsDirectory))
                {
                    try
                    {
                        var logFiles = Directory.GetFiles(logsDirectory, "*.log")
                            .Where(f => !f.Contains(DateTime.Now.ToString("yyyy-MM-dd"))) // Don't delete today's log
                            .ToArray();

                        foreach (var file in logFiles)
                        {
                            try
                            {
                                System.IO.File.Delete(file);
                            }
                            catch (Exception ex)
                            {
                                _logger.LogWarning(ex, "Failed to delete log file: {File}", file);
                            }
                        }
                        if (logFiles.Length > 0)
                        {
                            deletedItems.Add($"Cleared {logFiles.Length} old log files");
                        }
                    }
                    catch (Exception ex)
                    {
                        errors.Add($"Failed to clear some log files: {ex.Message}");
                    }
                }

                _logger.LogWarning("Database deletion scheduled for next application restart. Items cleared immediately: {Items}", string.Join(", ", deletedItems));

                return Ok(new
                {
                    success = true,
                    message = "Database deletion scheduled for next restart. Application restart required to complete the reset.",
                    deletedImmediately = deletedItems,
                    scheduledForDeletion = new[]
                    {
                        "SQLite database file (JunctionRelay.db)",
                        "Database journal files (.db-wal, .db-shm, .db-journal)",
                        "Encryption keys directory",
                        "All application settings",
                        "Remaining cache files",
                        "Temporary data"
                    },
                    errors = errors.Count > 0 ? errors : null,
                    restartRequired = true
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error scheduling database deletion");
                return StatusCode(500, new
                {
                    error = "Failed to schedule database deletion",
                    message = ex.Message
                });
            }
        }

        [HttpGet("export-db")]
        public IActionResult ExportDb([FromQuery] bool includeKeys = false)
        {
            try
            {
                if (!System.IO.File.Exists(_dbPath))
                    return NotFound("Database file not found.");

                var timestamp = DateTime.Now.ToString("yyyyMMddHHmmss");

                if (!includeKeys)
                {
                    // Original behavior - just return the database file
                    var tempExportPath = Path.Combine(Path.GetTempPath(), $"junction_backup_{timestamp}.db");
                    System.IO.File.Copy(_dbPath, tempExportPath, overwrite: true);
                    var fileBytes = System.IO.File.ReadAllBytes(tempExportPath);
                    System.IO.File.Delete(tempExportPath);

                    var fileResult = new FileContentResult(fileBytes, "application/octet-stream")
                    {
                        FileDownloadName = $"junction_backup_{timestamp}.db"
                    };
                    return fileResult;
                }

                // New behavior - create a zip with database + keys
                using var memoryStream = new MemoryStream();
                using (var archive = new ZipArchive(memoryStream, ZipArchiveMode.Create, true))
                {
                    // Copy database to temp file first to avoid file lock issues
                    var tempDbPath = Path.Combine(Path.GetTempPath(), $"junction_backup_temp_{timestamp}.db");
                    System.IO.File.Copy(_dbPath, tempDbPath, overwrite: true);

                    try
                    {
                        // Add database file from temp copy
                        var dbEntry = archive.CreateEntry("junction_backup.db");
                        using (var dbEntryStream = dbEntry.Open())
                        using (var dbFileStream = System.IO.File.OpenRead(tempDbPath))
                        {
                            dbFileStream.CopyTo(dbEntryStream);
                        }
                    }
                    finally
                    {
                        // Clean up temp file
                        if (System.IO.File.Exists(tempDbPath))
                        {
                            System.IO.File.Delete(tempDbPath);
                        }
                    }

                    // Add encryption keys directory
                    var dbDirectory = Path.GetDirectoryName(_dbPath);
                    var keysDirectory = !string.IsNullOrEmpty(dbDirectory) ? Path.Combine(dbDirectory, "keys") : "keys";

                    if (Directory.Exists(keysDirectory))
                    {
                        var keyFiles = Directory.GetFiles(keysDirectory, "*", SearchOption.AllDirectories);

                        foreach (var keyFile in keyFiles)
                        {
                            var relativePath = Path.GetRelativePath(keysDirectory, keyFile);
                            var keyEntry = archive.CreateEntry($"keys/{relativePath}");

                            using var keyEntryStream = keyEntry.Open();
                            using var keyFileStream = System.IO.File.OpenRead(keyFile);
                            keyFileStream.CopyTo(keyEntryStream);
                        }

                        _logger.LogInformation($"Exported database with {keyFiles.Length} encryption key files");
                    }
                    else
                    {
                        // Create empty keys directory in zip to indicate structure
                        archive.CreateEntry("keys/");
                        _logger.LogInformation("Exported database with empty keys directory (no encryption keys found)");
                    }

                    // Add a README file explaining the contents
                    var readmeEntry = archive.CreateEntry("README.txt");
                    using (var readmeStream = readmeEntry.Open())
                    using (var writer = new StreamWriter(readmeStream))
                    {
                        writer.WriteLine("JunctionRelay Backup Package");
                        writer.WriteLine("============================");
                        writer.WriteLine();
                        writer.WriteLine("This backup contains:");
                        writer.WriteLine("- junction_backup.db: Your JunctionRelay database");
                        writer.WriteLine("- keys/: Encryption keys for decrypting secrets");
                        writer.WriteLine();
                        writer.WriteLine("To restore:");
                        writer.WriteLine("1. Upload this entire ZIP file using the 'Upload Database File' button");
                        writer.WriteLine("2. The database and keys will be automatically restored");
                        writer.WriteLine("3. Restart the application to apply changes");
                        writer.WriteLine();
                        writer.WriteLine($"Backup created: {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC");
                        writer.WriteLine($"JunctionRelay Version: {GetType().Assembly.GetName().Version}");
                    }
                }

                var zipBytes = memoryStream.ToArray();
                var zipResult = new FileContentResult(zipBytes, "application/zip")
                {
                    FileDownloadName = $"junction_backup_with_keys_{timestamp}.zip"
                };
                return zipResult;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error exporting database");
                return StatusCode(500, new { error = "Failed to export database", message = ex.Message });
            }
        }

        [HttpPost("import-db")]
        public async Task<IActionResult> ImportDb(IFormFile file)
        {
            try
            {
                if (file == null || file.Length == 0)
                    return BadRequest("No file uploaded.");

                var dbDirectory = Path.GetDirectoryName(_dbPath);
                var keysDirectory = !string.IsNullOrEmpty(dbDirectory) ? Path.Combine(dbDirectory, "keys") : "keys";

                bool isZipFile = file.FileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase);
                bool isDatabaseFile = file.FileName.EndsWith(".db", StringComparison.OrdinalIgnoreCase);

                if (!isZipFile && !isDatabaseFile)
                {
                    return BadRequest("Invalid file type. Please upload a .db or .zip file.");
                }

                if (isDatabaseFile)
                {
                    // Original behavior - just import the database file
                    var tempDbPath = _dbPath + ".pending";
                    using var stream = new FileStream(tempDbPath, FileMode.Create, FileAccess.Write);
                    await file.CopyToAsync(stream);

                    _logger.LogInformation("Database import completed (database only)");
                    return Ok(new
                    {
                        message = "Database uploaded. Please restart the app to apply changes.",
                        keysRestored = false
                    });
                }

                // Handle ZIP file import
                using var fileStream = file.OpenReadStream();
                using var archive = new ZipArchive(fileStream, ZipArchiveMode.Read);

                bool databaseFound = false;
                bool keysFound = false;
                int keysRestored = 0;

                foreach (var entry in archive.Entries)
                {
                    if (entry.Name == "junction_backup.db")
                    {
                        // Extract database to pending location
                        var tempDbPath = _dbPath + ".pending";
                        using var entryStream = entry.Open();
                        using var dbFileStream = System.IO.File.Create(tempDbPath);
                        await entryStream.CopyToAsync(dbFileStream);
                        databaseFound = true;
                        _logger.LogInformation("Database extracted from ZIP backup");
                    }
                    else if (entry.FullName.StartsWith("keys/") && !string.IsNullOrEmpty(entry.Name))
                    {
                        // Extract encryption keys
                        keysFound = true;
                        var keyPath = Path.Combine(keysDirectory, entry.Name);
                        var keyDir = Path.GetDirectoryName(keyPath);

                        if (!string.IsNullOrEmpty(keyDir) && !Directory.Exists(keyDir))
                        {
                            Directory.CreateDirectory(keyDir);
                        }

                        using var entryStream = entry.Open();
                        using var keyFileStream = System.IO.File.Create(keyPath);
                        await entryStream.CopyToAsync(keyFileStream);
                        keysRestored++;
                        _logger.LogInformation($"Restored encryption key: {entry.Name}");
                    }
                }

                if (!databaseFound)
                {
                    return BadRequest("No valid database file found in the ZIP archive");
                }

                var message = keysFound
                    ? $"Database and {keysRestored} encryption keys uploaded. Please restart the app to apply changes."
                    : "Database uploaded (no encryption keys found in archive). Please restart the app to apply changes.";

                _logger.LogInformation($"ZIP import completed. Database: {databaseFound}, Keys: {keysRestored}");

                return Ok(new
                {
                    message,
                    keysRestored = keysRestored > 0,
                    keyCount = keysRestored
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error importing database");
                return StatusCode(500, new { error = "Failed to import database", message = ex.Message });
            }
        }

        [HttpGet("backup-info")]
        public IActionResult GetBackupInfo()
        {
            try
            {
                var dbDirectory = Path.GetDirectoryName(_dbPath);
                var keysDirectory = !string.IsNullOrEmpty(dbDirectory) ? Path.Combine(dbDirectory, "keys") : "keys";

                var info = new
                {
                    databaseExists = System.IO.File.Exists(_dbPath),
                    databaseSize = System.IO.File.Exists(_dbPath) ? new FileInfo(_dbPath).Length : 0,
                    keysDirectoryExists = Directory.Exists(keysDirectory),
                    keyFileCount = Directory.Exists(keysDirectory) ? Directory.GetFiles(keysDirectory, "*", SearchOption.AllDirectories).Length : 0,
                    hasEncryptionKeys = Directory.Exists(keysDirectory) && Directory.GetFiles(keysDirectory, "*", SearchOption.AllDirectories).Length > 0
                };

                return Ok(info);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting backup info");
                return StatusCode(500, new { error = "Failed to get backup info", message = ex.Message });
            }
        }
    }
}