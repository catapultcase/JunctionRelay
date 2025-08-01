using Microsoft.AspNetCore.Mvc;
using JunctionRelayServer.Utils;
using JunctionRelayServer.Services;
using System.IO.Compression;
using Microsoft.Data.Sqlite;

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("api/db")]
    public class Controller_Database : ControllerBase
    {
        private readonly string _dbPath;
        private readonly Service_BackendIdentity _backendIdentity;
        private readonly Service_DataDeletion _dataDeletion;

        public Controller_Database(
            DatabasePathProvider dbPathProvider,
            Service_BackendIdentity backendIdentity,
            Service_DataDeletion dataDeletion)
        {
            _dbPath = dbPathProvider.DbPath;
            _backendIdentity = backendIdentity;
            _dataDeletion = dataDeletion;
        }

        [HttpGet("backend-identity")]
        public IActionResult GetBackendIdentity()
        {
            try
            {
                return Ok(new
                {
                    backendId = _backendIdentity.GetBackendId(),
                    friendlyName = _backendIdentity.GetFriendlyName()
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error getting backend identity: {ex.Message}");
                return StatusCode(500, new { error = "Failed to get backend identity" });
            }
        }

        [HttpPost("backend-identity/set-name")]
        public IActionResult SetFriendlyName([FromBody] FriendlyNameUpdateRequest request)
        {
            if (string.IsNullOrWhiteSpace(request?.FriendlyName))
                return BadRequest(new { error = "Friendly name must be provided." });

            try
            {
                _backendIdentity.SetFriendlyName(request.FriendlyName);
                return Ok(new
                {
                    success = true,
                    message = "Friendly name updated.",
                    backendId = _backendIdentity.GetBackendId(),
                    friendlyName = _backendIdentity.GetFriendlyName()
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error updating friendly name: {ex.Message}");
                return StatusCode(500, new { error = "Failed to update friendly name." });
            }
        }

        public class FriendlyNameUpdateRequest
        {
            public string FriendlyName { get; set; } = "";
        }


        [HttpDelete("delete-database")]
        public IActionResult DeleteDatabase()
        {
            try
            {
                Console.WriteLine("Database deletion requested - marking for deletion on next restart");

                var deletedItems = new List<string>();
                var errors = new List<string>();

                try
                {
                    _dataDeletion.ScheduleDeletion();
                    deletedItems.Add("Created deletion marker for next startup");
                }
                catch (Exception ex)
                {
                    errors.Add($"Failed to create deletion marker: {ex.Message}");
                    Console.WriteLine($"Failed to create deletion marker file: {ex.Message}");
                    return StatusCode(500, new { error = "Failed to schedule database deletion", details = errors });
                }

                // Clear immediate cache files (same as your existing logic)
                var appDirectory = Directory.GetCurrentDirectory();
                var firmwareDirectory = Path.Combine(appDirectory, "Firmware");
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
                                Console.WriteLine($"Failed to delete cache file {file}: {ex.Message}");
                            }
                        }
                        deletedItems.Add($"Cleared {cacheFiles.Length} cache files");
                    }
                    catch (Exception ex)
                    {
                        errors.Add($"Failed to clear some cache files: {ex.Message}");
                    }
                }

                var logsDirectory = Path.Combine(appDirectory, "Logs");
                if (Directory.Exists(logsDirectory))
                {
                    try
                    {
                        var logFiles = Directory.GetFiles(logsDirectory, "*.log")
                            .Where(f => !f.Contains(DateTime.Now.ToString("yyyy-MM-dd")))
                            .ToArray();

                        foreach (var file in logFiles)
                        {
                            try
                            {
                                System.IO.File.Delete(file);
                            }
                            catch (Exception ex)
                            {
                                Console.WriteLine($"Failed to delete log file {file}: {ex.Message}");
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

                Console.WriteLine($"Database deletion scheduled for next application restart. Items cleared immediately: {string.Join(", ", deletedItems)}");

                return Ok(new
                {
                    success = true,
                    message = "Database deletion scheduled for next restart. Application restart required to complete the reset.",
                    deletedImmediately = deletedItems,
                    scheduledForDeletion = new[]
                    {
                        "SQLite database file (jr_database.db)",
                        "Database journal files (.db-wal, .db-shm, .db-journal)",
                        "Backend ID file (backend-id.txt)",
                        "JWT secret file (jwt-secret.key)",
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
                Console.WriteLine($"Error scheduling database deletion: {ex.Message}");
                return StatusCode(500, new
                {
                    error = "Failed to schedule database deletion",
                    message = ex.Message
                });
            }
        }

        [HttpGet("export-db")]
        public IActionResult ExportDb([FromQuery] bool includeKeys = false, [FromQuery] bool includeIdentity = false)
        {
            try
            {
                if (!System.IO.File.Exists(_dbPath))
                    return NotFound("Database file not found.");

                var timestamp = DateTime.Now.ToString("yyyyMMddHHmmss");

                // Ensure database integrity before backup by forcing a checkpoint
                try
                {
                    using var connection = new SqliteConnection($"Data Source={_dbPath}");
                    connection.Open();

                    // Force WAL checkpoint to ensure all pending writes are flushed to main database file
                    using var command = connection.CreateCommand();
                    command.CommandText = "PRAGMA wal_checkpoint(FULL);";
                    command.ExecuteNonQuery();

                    // Optional: Get checkpoint info for logging
                    command.CommandText = "PRAGMA wal_checkpoint;";
                    var result = command.ExecuteScalar();
                    Console.WriteLine($"Database checkpoint completed before backup: {result}");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Warning: Could not perform database checkpoint: {ex.Message}");
                    // Continue with backup anyway - the file copy should still work
                }

                // If neither keys nor identity are requested, just return the database file
                if (!includeKeys && !includeIdentity)
                {
                    var tempExportPath = Path.Combine(Path.GetTempPath(), $"junction_backup_{timestamp}.db");

                    // Copy with retry in case of temporary locks
                    var maxRetries = 3;
                    for (int i = 0; i < maxRetries; i++)
                    {
                        try
                        {
                            System.IO.File.Copy(_dbPath, tempExportPath, overwrite: true);
                            break;
                        }
                        catch (IOException) when (i < maxRetries - 1)
                        {
                            Thread.Sleep(100); // Wait 100ms before retry
                        }
                    }

                    var fileBytes = System.IO.File.ReadAllBytes(tempExportPath);
                    System.IO.File.Delete(tempExportPath);

                    var fileResult = new FileContentResult(fileBytes, "application/octet-stream")
                    {
                        FileDownloadName = $"junction_backup_{timestamp}.db"
                    };
                    return fileResult;
                }

                // Create ZIP package with selected components
                using var memoryStream = new MemoryStream();
                using (var archive = new ZipArchive(memoryStream, ZipArchiveMode.Create, true))
                {
                    var tempDbPath = Path.Combine(Path.GetTempPath(), $"junction_backup_temp_{timestamp}.db");

                    // Copy database with retry logic for potential locks
                    var maxRetries = 3;
                    for (int i = 0; i < maxRetries; i++)
                    {
                        try
                        {
                            System.IO.File.Copy(_dbPath, tempDbPath, overwrite: true);
                            break;
                        }
                        catch (IOException) when (i < maxRetries - 1)
                        {
                            Thread.Sleep(100); // Wait 100ms before retry
                        }
                    }

                    try
                    {
                        var dbEntry = archive.CreateEntry("junction_backup.db");
                        using (var dbEntryStream = dbEntry.Open())
                        using (var dbFileStream = System.IO.File.OpenRead(tempDbPath))
                        {
                            dbFileStream.CopyTo(dbEntryStream);
                        }
                    }
                    finally
                    {
                        if (System.IO.File.Exists(tempDbPath))
                        {
                            System.IO.File.Delete(tempDbPath);
                        }
                    }

                    var dbDirectory = Path.GetDirectoryName(_dbPath);
                    var includedComponents = new List<string> { "database" };

                    // Include encryption keys if requested (including JWT secret)
                    if (includeKeys)
                    {
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

                            Console.WriteLine($"Exported database with {keyFiles.Length} encryption key files");
                            includedComponents.Add("encryption keys");
                        }
                        else
                        {
                            archive.CreateEntry("keys/");
                            Console.WriteLine("Exported database with empty keys directory (no encryption keys found)");
                            includedComponents.Add("keys directory (empty)");
                        }

                        // Include JWT secret as part of encryption keys
                        if (!string.IsNullOrEmpty(dbDirectory))
                        {
                            var jwtSecretFile = Path.Combine(dbDirectory, "jwt-secret.key");
                            if (System.IO.File.Exists(jwtSecretFile))
                            {
                                var jwtSecretEntry = archive.CreateEntry("jwt-secret.key");
                                using var jwtSecretEntryStream = jwtSecretEntry.Open();
                                using var jwtSecretFileStream = System.IO.File.OpenRead(jwtSecretFile);
                                jwtSecretFileStream.CopyTo(jwtSecretEntryStream);
                                Console.WriteLine("Included JWT secret file with encryption keys");
                            }
                        }
                    }

                    // Include backend identity files if requested (only backend-id.txt)
                    if (includeIdentity && !string.IsNullOrEmpty(dbDirectory))
                    {
                        var backendIdFile = Path.Combine(dbDirectory, "backend-id.txt");

                        if (System.IO.File.Exists(backendIdFile))
                        {
                            var backendIdEntry = archive.CreateEntry("backend-id.txt");
                            using var backendIdEntryStream = backendIdEntry.Open();
                            using var backendIdFileStream = System.IO.File.OpenRead(backendIdFile);
                            backendIdFileStream.CopyTo(backendIdEntryStream);
                            Console.WriteLine("Included backend ID file in backup");
                            includedComponents.Add("backend identity");
                        }
                    }

                    // Create README with backup details
                    var readmeEntry = archive.CreateEntry("README.txt");
                    using (var readmeStream = readmeEntry.Open())
                    using (var writer = new StreamWriter(readmeStream))
                    {
                        writer.WriteLine("JunctionRelay Backup Package");
                        writer.WriteLine("============================");
                        writer.WriteLine();
                        writer.WriteLine("This backup contains:");
                        writer.WriteLine("- junction_backup.db: Your JunctionRelay database");

                        if (includeKeys)
                        {
                            writer.WriteLine("- keys/: Encryption keys for decrypting secrets");
                            writer.WriteLine("- jwt-secret.key: JWT authentication secret");
                        }

                        if (includeIdentity)
                        {
                            writer.WriteLine("- backend-id.txt: Backend identity (preserves device identity)");
                        }

                        writer.WriteLine();
                        writer.WriteLine("Backup type:");
                        if (includeKeys && includeIdentity)
                        {
                            writer.WriteLine("- COMPLETE BACKUP: Full restore to same backend with all encryption");
                        }
                        else if (includeKeys && !includeIdentity)
                        {
                            writer.WriteLine("- DATA MIGRATION: Transfer data + encryption to new backend (new identity will be generated)");
                        }
                        else if (!includeKeys && includeIdentity)
                        {
                            writer.WriteLine("- BASIC BACKUP: Database + identity only (no encryption keys - will generate new JWT secret)");
                        }
                        else
                        {
                            writer.WriteLine("- DATABASE ONLY: Basic data transfer (new identity, new encryption keys)");
                        }

                        writer.WriteLine();
                        writer.WriteLine("To restore:");
                        writer.WriteLine("1. Upload this ZIP file using the 'Upload Database File' button");
                        writer.WriteLine("2. Available components will be automatically restored");
                        writer.WriteLine("3. Restart the application to apply changes");

                        if (includeIdentity)
                        {
                            writer.WriteLine("4. Your backend will maintain the same identity after restore");
                        }
                        else
                        {
                            writer.WriteLine("4. A new backend identity will be generated");
                        }

                        writer.WriteLine();
                        writer.WriteLine($"Backup created: {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC");
                        writer.WriteLine($"Components: {string.Join(", ", includedComponents)}");
                        writer.WriteLine($"JunctionRelay Version: {GetType().Assembly.GetName().Version}");
                    }
                }

                var zipBytes = memoryStream.ToArray();

                // Generate appropriate filename based on what's included
                var backupType = includeKeys && includeIdentity ? "complete" :
                                includeKeys ? "data_migration" :
                                includeIdentity ? "basic" : "database_only";

                var zipResult = new FileContentResult(zipBytes, "application/zip")
                {
                    FileDownloadName = $"junction_backup_{backupType}_{timestamp}.zip"
                };
                return zipResult;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error exporting database: {ex.Message}");
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
                    var tempDbPath = _dbPath + ".pending";
                    using var stream = new FileStream(tempDbPath, FileMode.Create, FileAccess.Write);
                    await file.CopyToAsync(stream);

                    Console.WriteLine("Database import completed (database only)");
                    return Ok(new
                    {
                        message = "Database uploaded. Please restart the app to apply changes.",
                        keysRestored = false
                    });
                }

                using var fileStream = file.OpenReadStream();
                using var archive = new ZipArchive(fileStream, ZipArchiveMode.Read);

                bool databaseFound = false;
                bool keysFound = false;
                bool identityFilesFound = false;
                int keysRestored = 0;
                int identityFilesRestored = 0;

                foreach (var entry in archive.Entries)
                {
                    if (entry.Name == "junction_backup.db")
                    {
                        var tempDbPath = _dbPath + ".pending";
                        using var entryStream = entry.Open();
                        using var dbFileStream = System.IO.File.Create(tempDbPath);
                        await entryStream.CopyToAsync(dbFileStream);
                        databaseFound = true;
                        Console.WriteLine("Database extracted from ZIP backup");
                    }
                    else if (entry.FullName.StartsWith("keys/") && !string.IsNullOrEmpty(entry.Name))
                    {
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
                        Console.WriteLine($"Restored encryption key: {entry.Name}");
                    }
                    else if (entry.Name == "backend-id.txt" || entry.Name == "jwt-secret.key")
                    {
                        if (!string.IsNullOrEmpty(dbDirectory))
                        {
                            identityFilesFound = true;
                            var identityPath = Path.Combine(dbDirectory, entry.Name);

                            using var entryStream = entry.Open();
                            using var identityFileStream = System.IO.File.Create(identityPath);
                            await entryStream.CopyToAsync(identityFileStream);
                            identityFilesRestored++;
                            Console.WriteLine($"Restored identity file: {entry.Name}");
                        }
                        else
                        {
                            Console.WriteLine($"Skipped identity file {entry.Name} - no database directory available");
                        }
                    }
                }

                if (!databaseFound)
                {
                    return BadRequest("No valid database file found in the ZIP archive");
                }

                var message = $"Database";
                if (keysFound)
                    message += $" and {keysRestored} encryption keys";
                if (identityFilesFound)
                    message += $" and {identityFilesRestored} identity files";
                message += " uploaded. Please restart the app to apply changes.";

                Console.WriteLine($"ZIP import completed. Database: {databaseFound}, Keys: {keysRestored}, Identity: {identityFilesRestored}");

                return Ok(new
                {
                    message,
                    keysRestored = keysRestored > 0,
                    keyCount = keysRestored,
                    identityRestored = identityFilesRestored > 0,
                    identityCount = identityFilesRestored
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error importing database: {ex.Message}");
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
                Console.WriteLine($"Error getting backup info: {ex.Message}");
                return StatusCode(500, new { error = "Failed to get backup info", message = ex.Message });
            }
        }
    }
}