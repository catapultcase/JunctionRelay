using Microsoft.AspNetCore.Mvc;
using JunctionRelayServer.Utils;
using JunctionRelayServer.Services;
using System.IO.Compression;

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("api/db")]
    public class Controller_Database : ControllerBase
    {
        private readonly string _dbPath;
        private readonly Service_BackendIdentity _backendIdentity;
        private readonly Service_DataDeletion _dataDeletion;
        private readonly Service_Backups _backupService;

        public Controller_Database(
            DatabasePathProvider dbPathProvider,
            Service_BackendIdentity backendIdentity,
            Service_DataDeletion dataDeletion,
            Service_Backups backupService)
        {
            _dbPath = dbPathProvider.DbPath;
            _backendIdentity = backendIdentity;
            _dataDeletion = dataDeletion;
            _backupService = backupService;
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

                // Clear immediate cache files
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
                        "Backend ID file (backend-id.json)",
                        "JWT secret file (jwt-secret.key)",
                        "Encryption keys directory",
                        "Frame engine directory",
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
        public async Task<IActionResult> ExportDb([FromQuery] bool includeKeys = false, [FromQuery] bool includeIdentity = false, [FromQuery] bool includeFrameEngine = false)
        {
            try
            {
                var options = new Service_Backups.BackupOptions
                {
                    IncludeKeys = includeKeys,
                    IncludeIdentity = includeIdentity,
                    IncludeFrameEngine = includeFrameEngine
                };

                var result = await _backupService.CreateBackupAsync(options);

                if (!result.Success)
                {
                    if (result.ErrorMessage?.Contains("not found") == true)
                        return NotFound(result.ErrorMessage);

                    return StatusCode(500, new { error = "Failed to create backup", message = result.ErrorMessage });
                }

                return new FileContentResult(result.BackupData!, result.ContentType!)
                {
                    FileDownloadName = result.Filename
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error exporting database: {ex.Message}");
                return StatusCode(500, new { error = "Failed to export database", message = ex.Message });
            }
        }

        [HttpPost("import-db")]
        [RequestSizeLimit(524288000)] // 500MB
        [RequestFormLimits(MultipartBodyLengthLimit = 524288000)]
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
                        keysRestored = false,
                        frameEngineRestored = false
                    });
                }

                using var fileStream = file.OpenReadStream();
                using var archive = new ZipArchive(fileStream, ZipArchiveMode.Read);

                bool databaseFound = false;
                bool keysFound = false;
                bool identityFilesFound = false;
                bool frameEngineFound = false;
                int keysRestored = 0;
                int identityFilesRestored = 0;
                int frameEngineFilesRestored = 0;

                foreach (var entry in archive.Entries)
                {
                    if (entry.Name == "jr_database.db")
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
                    else if (entry.FullName.StartsWith("frameengine/") && !string.IsNullOrEmpty(entry.Name))
                    {
                        frameEngineFound = true;
                        if (!string.IsNullOrEmpty(dbDirectory))
                        {
                            var frameEngineDirectory = Path.Combine(dbDirectory, "frameengine");
                            var frameEnginePath = Path.Combine(frameEngineDirectory, Path.GetRelativePath("frameengine", entry.FullName));
                            var frameEngineDir = Path.GetDirectoryName(frameEnginePath);

                            if (!string.IsNullOrEmpty(frameEngineDir) && !Directory.Exists(frameEngineDir))
                            {
                                Directory.CreateDirectory(frameEngineDir);
                            }

                            using var entryStream = entry.Open();
                            using var frameEngineFileStream = System.IO.File.Create(frameEnginePath);
                            await entryStream.CopyToAsync(frameEngineFileStream);
                            frameEngineFilesRestored++;
                            Console.WriteLine($"Restored frame engine file: {entry.FullName}");
                        }
                        else
                        {
                            Console.WriteLine($"Skipped frame engine file {entry.FullName} - no database directory available");
                        }
                    }
                    else if (entry.Name == "backend-id.json" || entry.Name == "jwt-secret.key")
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
                if (frameEngineFound)
                    message += $" and {frameEngineFilesRestored} frame engine files";
                message += " uploaded. Please restart the app to apply changes.";

                Console.WriteLine($"ZIP import completed. Database: {databaseFound}, Keys: {keysRestored}, Identity: {identityFilesRestored}, FrameEngine: {frameEngineFilesRestored}");

                return Ok(new
                {
                    message,
                    keysRestored = keysRestored > 0,
                    keyCount = keysRestored,
                    identityRestored = identityFilesRestored > 0,
                    identityCount = identityFilesRestored,
                    frameEngineRestored = frameEngineFilesRestored > 0,
                    frameEngineCount = frameEngineFilesRestored
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
                var frameEngineDirectory = !string.IsNullOrEmpty(dbDirectory) ? Path.Combine(dbDirectory, "frameengine") : "frameengine";

                var info = new
                {
                    databaseExists = System.IO.File.Exists(_dbPath),
                    databaseSize = System.IO.File.Exists(_dbPath) ? new FileInfo(_dbPath).Length : 0,
                    keysDirectoryExists = Directory.Exists(keysDirectory),
                    keyFileCount = Directory.Exists(keysDirectory) ? Directory.GetFiles(keysDirectory, "*", SearchOption.AllDirectories).Length : 0,
                    hasEncryptionKeys = Directory.Exists(keysDirectory) && Directory.GetFiles(keysDirectory, "*", SearchOption.AllDirectories).Length > 0,
                    frameEngineDirectoryExists = Directory.Exists(frameEngineDirectory),
                    frameEngineFileCount = Directory.Exists(frameEngineDirectory) ? Directory.GetFiles(frameEngineDirectory, "*", SearchOption.AllDirectories).Length : 0,
                    hasFrameEngineFiles = Directory.Exists(frameEngineDirectory) && Directory.GetFiles(frameEngineDirectory, "*", SearchOption.AllDirectories).Length > 0
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