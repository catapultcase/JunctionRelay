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
using System.Text.Json;
using JunctionRelay.Models;
using JunctionRelayServer.Utils;
using Microsoft.Data.Sqlite;

namespace JunctionRelayServer.Services
{
    /// <summary>
    /// Service for creating cloud backups with FrameEngine manifests (reference-based, no asset duplication)
    /// </summary>
    public class Service_CloudBackups_Manifest
    {
        private readonly string _dbPath;
        private readonly Service_Database_Manager_FrameEngine _frameEngineDb;
        private readonly Service_BackendIdentity _backendIdentity;
        private readonly Service_FrameEngine_CloudVersioning _cloudVersioningService;

        public Service_CloudBackups_Manifest(
            DatabasePathProvider dbPathProvider,
            Service_Database_Manager_FrameEngine frameEngineDb,
            Service_BackendIdentity backendIdentity,
            Service_FrameEngine_CloudVersioning cloudVersioningService)
        {
            _dbPath = dbPathProvider.DbPath;
            _frameEngineDb = frameEngineDb;
            _backendIdentity = backendIdentity;
            _cloudVersioningService = cloudVersioningService;
        }

        public class CloudBackupOptions
        {
            public bool IncludeKeys { get; set; } = true;
            public bool IncludeIdentity { get; set; } = true;
            public bool IncludeFrameEngine { get; set; } = true;
            public Action<BackupProgressUpdate>? ProgressCallback { get; set; }
        }

        public class BackupProgressUpdate
        {
            public string Stage { get; set; } = "";
            public string Message { get; set; } = "";
            public int? CurrentItem { get; set; }
            public int? TotalItems { get; set; }
            public string? ItemName { get; set; }
        }

        public class CloudBackupResult
        {
            public bool Success { get; set; }
            public byte[]? BackupData { get; set; }
            public string? Filename { get; set; }
            public string? ErrorMessage { get; set; }
            public object? Manifest { get; set; }  // FrameManifest as object for JSON serialization
        }

        public async Task<CloudBackupResult> CreateCloudBackupAsync(CloudBackupOptions options)
        {
            try
            {
                if (!System.IO.File.Exists(_dbPath))
                {
                    return new CloudBackupResult
                    {
                        Success = false,
                        ErrorMessage = "Database file not found."
                    };
                }

                var timestamp = DateTime.Now.ToString("yyyyMMddHHmmss");

                // Force database checkpoint before backup
                options.ProgressCallback?.Invoke(new BackupProgressUpdate
                {
                    Stage = "preparing",
                    Message = "Preparing database for backup..."
                });

                try
                {
                    using var connection = new SqliteConnection($"Data Source={_dbPath}");
                    connection.Open();
                    using var command = connection.CreateCommand();
                    command.CommandText = "PRAGMA wal_checkpoint(FULL);";
                    command.ExecuteNonQuery();
                    Console.WriteLine($"[CLOUD_BACKUP_MANIFEST] Database checkpoint completed");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[CLOUD_BACKUP_MANIFEST] Warning: Could not perform checkpoint: {ex.Message}");
                }

                // Generate FrameEngine manifest if requested
                FrameManifest? manifest = null;
                if (options.IncludeFrameEngine)
                {
                    manifest = await GenerateFrameManifestAsync(options.ProgressCallback);
                    Console.WriteLine($"[CLOUD_BACKUP_MANIFEST] Generated manifest: {manifest.TemplateFrameLayouts.Count} templates, {manifest.UserFrameLayouts.Count} user layouts");
                }

                // Create ZIP package with database + manifest
                options.ProgressCallback?.Invoke(new BackupProgressUpdate
                {
                    Stage = "packaging",
                    Message = "Creating backup archive..."
                });

                using var memoryStream = new MemoryStream();
                using (var archive = new ZipArchive(memoryStream, ZipArchiveMode.Create, true))
                {
                    // Add database
                    options.ProgressCallback?.Invoke(new BackupProgressUpdate
                    {
                        Stage = "packaging",
                        Message = "Adding database to archive..."
                    });

                    var tempDbPath = Path.Combine(Path.GetTempPath(), $"junction_cloud_backup_temp_{timestamp}.db");
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
                            await Task.Delay(100);
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

                    // Include encryption keys if requested
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
                            Console.WriteLine($"[CLOUD_BACKUP_MANIFEST] Included {keyFiles.Length} encryption key files");
                        }
                        else
                        {
                            archive.CreateEntry("keys/");
                        }

                        // Include JWT secret
                        if (!string.IsNullOrEmpty(dbDirectory))
                        {
                            var jwtSecretFile = Path.Combine(dbDirectory, "jwt-secret.key");
                            if (System.IO.File.Exists(jwtSecretFile))
                            {
                                var jwtSecretEntry = archive.CreateEntry("jwt-secret.key");
                                using var jwtSecretEntryStream = jwtSecretEntry.Open();
                                using var jwtSecretFileStream = System.IO.File.OpenRead(jwtSecretFile);
                                await jwtSecretFileStream.CopyToAsync(jwtSecretEntryStream);
                                Console.WriteLine("[CLOUD_BACKUP_MANIFEST] Included JWT secret");
                            }
                        }
                    }

                    // Include backend identity if requested
                    if (options.IncludeIdentity && !string.IsNullOrEmpty(dbDirectory))
                    {
                        var backendIdFile = Path.Combine(dbDirectory, "backend-id.json");
                        if (System.IO.File.Exists(backendIdFile))
                        {
                            var backendIdEntry = archive.CreateEntry("backend-id.json");
                            using var backendIdEntryStream = backendIdEntry.Open();
                            using var backendIdFileStream = System.IO.File.OpenRead(backendIdFile);
                            await backendIdFileStream.CopyToAsync(backendIdEntryStream);
                            Console.WriteLine("[CLOUD_BACKUP_MANIFEST] Included backend identity");
                        }
                    }

                    // Include FrameEngine manifest (references only, no assets)
                    if (manifest != null)
                    {
                        var manifestEntry = archive.CreateEntry("frame-manifest.json");
                        using var manifestStream = manifestEntry.Open();
                        await JsonSerializer.SerializeAsync(manifestStream, manifest, new JsonSerializerOptions { WriteIndented = true });
                        Console.WriteLine("[CLOUD_BACKUP_MANIFEST] Included frame manifest");
                    }
                }

                memoryStream.Position = 0;
                var backupData = memoryStream.ToArray();

                return new CloudBackupResult
                {
                    Success = true,
                    BackupData = backupData,
                    Filename = $"junction_cloud_backup_{timestamp}.zip",
                    Manifest = manifest
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD_BACKUP_MANIFEST] Error creating backup: {ex.Message}");
                return new CloudBackupResult
                {
                    Success = false,
                    ErrorMessage = ex.Message
                };
            }
        }

        private async Task<FrameManifest> GenerateFrameManifestAsync(Action<BackupProgressUpdate>? progressCallback)
        {
            var manifest = new FrameManifest
            {
                Version = "2.0",
                Timestamp = DateTime.UtcNow,
                BackendId = _backendIdentity.GetBackendId()
            };

            // Get all frame layouts from database
            var frames = await _frameEngineDb.GetAllFrameLayoutsAsync();

            // Count template vs user layouts using isTemplate field
            var templateCount = frames.Count(f => f.IsTemplate);
            var userLayoutCount = frames.Count() - templateCount;

            progressCallback?.Invoke(new BackupProgressUpdate
            {
                Stage = "analyzing",
                Message = $"Found {templateCount} template references and {userLayoutCount} user layouts"
            });

            int processedTemplates = 0;
            int processedUserLayouts = 0;

            foreach (var frame in frames)
            {
                // Check if this is a FrameXchange template using isTemplate field
                if (frame.IsTemplate)
                {
                    // FrameXchange template - reference cloud library (don't snapshot)
                    manifest.TemplateFrameLayouts.Add(new TemplateFrameLayoutReference
                    {
                        LocalFrameId = frame.Id,
                        FrameName = frame.DisplayName ?? "",
                        CloudTemplateId = frame.CloudTemplateId,
                        CloudVariantId = frame.CloudVariantId
                    });

                    processedTemplates++;
                    progressCallback?.Invoke(new BackupProgressUpdate
                    {
                        Stage = "templates",
                        Message = "Adding template references to manifest",
                        CurrentItem = processedTemplates,
                        TotalItems = templateCount,
                        ItemName = frame.DisplayName ?? $"Frame {frame.Id}"
                    });
                }
                else
                {
                    // User frame layout - needs cloud snapshot
                    // Create snapshot with isBackupSnapshot=true for protection
                    try
                    {
                        processedUserLayouts++;
                        progressCallback?.Invoke(new BackupProgressUpdate
                        {
                            Stage = "snapshotting",
                            Message = "Creating cloud snapshots for user layouts",
                            CurrentItem = processedUserLayouts,
                            TotalItems = userLayoutCount,
                            ItemName = frame.DisplayName ?? $"Frame {frame.Id}"
                        });

                        Console.WriteLine($"[CLOUD_BACKUP_MANIFEST] Creating backup snapshot for user frame layout {frame.Id} ({frame.DisplayName})");

                        var snapshotId = await CreateBackupSnapshotForFrameAsync(frame.Id);

                        if (!string.IsNullOrEmpty(snapshotId))
                        {
                            manifest.UserFrameLayouts.Add(new UserFrameLayoutReference
                            {
                                LocalFrameId = frame.Id,
                                FrameName = frame.DisplayName ?? "",
                                SnapshotId = snapshotId
                            });
                            Console.WriteLine($"[CLOUD_BACKUP_MANIFEST] Created snapshot {snapshotId} for frame {frame.Id}");
                        }
                        else
                        {
                            Console.WriteLine($"[CLOUD_BACKUP_MANIFEST] Warning: Could not create snapshot for frame {frame.Id}, skipping");
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[CLOUD_BACKUP_MANIFEST] Error creating snapshot for frame {frame.Id}: {ex.Message}");
                        // Continue with other frames - don't fail entire backup
                    }
                }
            }

            return manifest;
        }

        /// <summary>
        /// Creates a backup snapshot for a user frame layout using the cloud versioning service
        /// </summary>
        private async Task<string?> CreateBackupSnapshotForFrameAsync(int frameId)
        {
            Console.WriteLine($"[CLOUD_BACKUP_MANIFEST] Creating backup snapshot for user frame layout {frameId}");

            var result = await _cloudVersioningService.SaveCloudVersionAsync(frameId, isBackupSnapshot: true);

            if (result.Success && result.SnapshotId.HasValue)
            {
                Console.WriteLine($"[CLOUD_BACKUP_MANIFEST] ✅ Created snapshot {result.SnapshotId.Value} for frame {frameId}");
                return result.SnapshotId.Value.ToString();
            }
            else
            {
                Console.WriteLine($"[CLOUD_BACKUP_MANIFEST] ⚠️ Failed to create snapshot for frame {frameId}: {result.ErrorMessage}");
                return null;
            }
        }
    }
}
