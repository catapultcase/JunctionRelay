using System.IO.Compression;
using JunctionRelayServer.Utils;
using Microsoft.Data.Sqlite;

namespace JunctionRelayServer.Services
{
    public class Service_Backups
    {
        private readonly string _dbPath;

        public Service_Backups(DatabasePathProvider dbPathProvider)
        {
            _dbPath = dbPathProvider.DbPath;
        }

        public class BackupOptions
        {
            public bool IncludeKeys { get; set; } = false;
            public bool IncludeIdentity { get; set; } = false;
            public bool IncludeFrameEngine { get; set; } = false;
        }

        public class BackupResult
        {
            public bool Success { get; set; }
            public byte[]? BackupData { get; set; }
            public string? Filename { get; set; }
            public string? ErrorMessage { get; set; }
            public string? ContentType { get; set; }
        }

        public async Task<BackupResult> CreateBackupAsync(BackupOptions options)
        {
            try
            {
                if (!System.IO.File.Exists(_dbPath))
                {
                    return new BackupResult
                    {
                        Success = false,
                        ErrorMessage = "Database file not found."
                    };
                }

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

                // If no additional components are requested, just return the database file
                if (!options.IncludeKeys && !options.IncludeIdentity && !options.IncludeFrameEngine)
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
                            await Task.Delay(100); // Wait 100ms before retry
                        }
                    }

                    var fileBytes = await System.IO.File.ReadAllBytesAsync(tempExportPath);
                    System.IO.File.Delete(tempExportPath);

                    return new BackupResult
                    {
                        Success = true,
                        BackupData = fileBytes,
                        Filename = $"junction_backup_{timestamp}.db",
                        ContentType = "application/octet-stream"
                    };
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
                            await Task.Delay(100); // Wait 100ms before retry
                        }
                    }

                    try
                    {
                        var dbEntry = archive.CreateEntry("junction_backup.db");
                        using (var dbEntryStream = dbEntry.Open())
                        using (var dbFileStream = System.IO.File.OpenRead(tempDbPath))
                        {
                            await dbFileStream.CopyToAsync(dbEntryStream);
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
                    if (options.IncludeKeys)
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
                                await keyFileStream.CopyToAsync(keyEntryStream);
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
                                await jwtSecretFileStream.CopyToAsync(jwtSecretEntryStream);
                                Console.WriteLine("Included JWT secret file with encryption keys");
                            }
                        }
                    }

                    // Include frameengine folder if requested
                    if (options.IncludeFrameEngine)
                    {
                        var frameEngineDirectory = !string.IsNullOrEmpty(dbDirectory) ? Path.Combine(dbDirectory, "frameengine") : "frameengine";

                        if (Directory.Exists(frameEngineDirectory))
                        {
                            var frameEngineFiles = Directory.GetFiles(frameEngineDirectory, "*", SearchOption.AllDirectories);

                            foreach (var frameEngineFile in frameEngineFiles)
                            {
                                var relativePath = Path.GetRelativePath(frameEngineDirectory, frameEngineFile);
                                var frameEngineEntry = archive.CreateEntry($"frameengine/{relativePath}");

                                using var frameEngineEntryStream = frameEngineEntry.Open();
                                using var frameEngineFileStream = System.IO.File.OpenRead(frameEngineFile);
                                await frameEngineFileStream.CopyToAsync(frameEngineEntryStream);
                            }

                            Console.WriteLine($"Exported database with {frameEngineFiles.Length} frame engine files");
                            includedComponents.Add("frame engine files");
                        }
                        else
                        {
                            archive.CreateEntry("frameengine/");
                            Console.WriteLine("Exported database with empty frameengine directory (no frame engine files found)");
                            includedComponents.Add("frameengine directory (empty)");
                        }
                    }

                    // Include backend identity files if requested (backend-id.json)
                    if (options.IncludeIdentity && !string.IsNullOrEmpty(dbDirectory))
                    {
                        var backendIdFile = Path.Combine(dbDirectory, "backend-id.json");

                        if (System.IO.File.Exists(backendIdFile))
                        {
                            var backendIdEntry = archive.CreateEntry("backend-id.json");
                            using var backendIdEntryStream = backendIdEntry.Open();
                            using var backendIdFileStream = System.IO.File.OpenRead(backendIdFile);
                            await backendIdFileStream.CopyToAsync(backendIdEntryStream);
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

                        if (options.IncludeKeys)
                        {
                            writer.WriteLine("- keys/: Encryption keys for decrypting secrets");
                            writer.WriteLine("- jwt-secret.key: JWT authentication secret");
                        }

                        if (options.IncludeFrameEngine)
                        {
                            writer.WriteLine("- frameengine/: Frame engine configuration and data files");
                        }

                        if (options.IncludeIdentity)
                        {
                            writer.WriteLine("- backend-id.json: Backend identity (preserves device identity)");
                        }

                        writer.WriteLine();
                        writer.WriteLine("Backup type:");
                        if (options.IncludeKeys && options.IncludeIdentity && options.IncludeFrameEngine)
                        {
                            writer.WriteLine("- COMPLETE FULL BACKUP: Full restore to same backend with all encryption and frame engine");
                        }
                        else if (options.IncludeKeys && options.IncludeIdentity && !options.IncludeFrameEngine)
                        {
                            writer.WriteLine("- COMPLETE BACKUP: Full restore to same backend with all encryption");
                        }
                        else if (options.IncludeKeys && !options.IncludeIdentity && options.IncludeFrameEngine)
                        {
                            writer.WriteLine("- DATA MIGRATION WITH FRAME ENGINE: Transfer data + encryption + frame engine to new backend");
                        }
                        else if (options.IncludeKeys && !options.IncludeIdentity)
                        {
                            writer.WriteLine("- DATA MIGRATION: Transfer data + encryption to new backend (new identity will be generated)");
                        }
                        else if (!options.IncludeKeys && options.IncludeIdentity && options.IncludeFrameEngine)
                        {
                            writer.WriteLine("- BASIC BACKUP WITH FRAME ENGINE: Database + identity + frame engine (no encryption keys)");
                        }
                        else if (!options.IncludeKeys && options.IncludeIdentity)
                        {
                            writer.WriteLine("- BASIC BACKUP: Database + identity only (no encryption keys - will generate new JWT secret)");
                        }
                        else if (!options.IncludeKeys && !options.IncludeIdentity && options.IncludeFrameEngine)
                        {
                            writer.WriteLine("- DATABASE WITH FRAME ENGINE: Basic data + frame engine transfer (new identity, new encryption keys)");
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

                        if (options.IncludeIdentity)
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
                        writer.WriteLine($"JunctionRelay Version: {typeof(Service_Backups).Assembly.GetName().Version}");
                    }
                }

                var zipBytes = memoryStream.ToArray();

                // Generate appropriate filename based on what's included
                var backupComponents = new List<string>();
                if (options.IncludeKeys) backupComponents.Add("keys");
                if (options.IncludeIdentity) backupComponents.Add("identity");
                if (options.IncludeFrameEngine) backupComponents.Add("frameengine");

                var backupType = backupComponents.Count == 0 ? "database_only" :
                                backupComponents.Count == 3 ? "complete_full" :
                                string.Join("_", backupComponents);

                return new BackupResult
                {
                    Success = true,
                    BackupData = zipBytes,
                    Filename = $"junction_backup_{backupType}_{timestamp}.zip",
                    ContentType = "application/zip"
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error creating backup: {ex.Message}");
                return new BackupResult
                {
                    Success = false,
                    ErrorMessage = $"Failed to create backup: {ex.Message}"
                };
            }
        }
    }
}