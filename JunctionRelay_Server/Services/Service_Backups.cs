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
                        var dbEntry = archive.CreateEntry("jr_database.db");
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
                            // Exclude frameengine/frames/ subdirectory (dynamically generated screenshots)
                            var frameEngineFiles = Directory.GetFiles(frameEngineDirectory, "*", SearchOption.AllDirectories)
                                .Where(f => !f.Contains(Path.DirectorySeparatorChar + "frames" + Path.DirectorySeparatorChar) &&
                                            !f.EndsWith(Path.DirectorySeparatorChar + "frames"))
                                .ToArray();

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