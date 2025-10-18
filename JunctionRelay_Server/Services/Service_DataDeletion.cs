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

using System.Runtime.InteropServices;

namespace JunctionRelayServer.Services
{
    public class Service_DataDeletion
    {
        public Service_DataDeletion()
        {
        }

        public bool HasDeletionMarker()
        {
            var dbDirectory = GetDatabaseDirectory();
            var deleteMarkerPath = Path.Combine(dbDirectory, ".delete-all-data");
            return File.Exists(deleteMarkerPath);
        }

        public void ProcessDeletionMarker()
        {
            var dbDirectory = GetDatabaseDirectory();
            var deleteMarkerPath = Path.Combine(dbDirectory, ".delete-all-data");

            if (!File.Exists(deleteMarkerPath))
                return;

            try
            {
                Console.WriteLine("Database deletion marker found - proceeding with data cleanup...");

                var dbPath = Service_BackendIdentity.GetDatabasePath();
                var deletionDbDirectory = Path.GetDirectoryName(dbPath);

                // Delete database files
                if (File.Exists(dbPath))
                {
                    File.Delete(dbPath);
                    Console.WriteLine("Deleted main database file");
                }

                // Delete database journal files (SQLite artifacts)
                if (!string.IsNullOrEmpty(deletionDbDirectory))
                {
                    var dbFileName = Path.GetFileNameWithoutExtension(dbPath);
                    var journalFiles = Directory.GetFiles(deletionDbDirectory, $"{dbFileName}.*")
                        .Where(f => f.EndsWith(".db-journal") || f.EndsWith(".db-wal") || f.EndsWith(".db-shm"));

                    foreach (var file in journalFiles)
                    {
                        File.Delete(file);
                        Console.WriteLine($"Deleted database artifact: {Path.GetFileName(file)}");
                    }
                }

                // Delete identity files (backend-id.txt, jwt-secret.key)
                if (!string.IsNullOrEmpty(deletionDbDirectory))
                {
                    var backendIdFile = Path.Combine(deletionDbDirectory, "backend-id.json");
                    var jwtSecretFile = Path.Combine(deletionDbDirectory, "jwt-secret.key");

                    if (File.Exists(backendIdFile))
                    {
                        File.Delete(backendIdFile);
                        Console.WriteLine("Deleted backend ID file");
                    }

                    if (File.Exists(jwtSecretFile))
                    {
                        File.Delete(jwtSecretFile);
                        Console.WriteLine("Deleted JWT secret file");
                    }
                }

                // Delete encryption keys directory
                var deletionKeysDirectory = !string.IsNullOrEmpty(deletionDbDirectory) ? Path.Combine(deletionDbDirectory, "keys") : "keys";
                if (Directory.Exists(deletionKeysDirectory))
                {
                    Directory.Delete(deletionKeysDirectory, true);
                    Console.WriteLine("Deleted encryption keys directory");
                }

                // Delete cache directories (in data folder, not app folder)
                var firmwareDirectory = Path.Combine(dbDirectory, "firmware");
                if (Directory.Exists(firmwareDirectory))
                {
                    Directory.Delete(firmwareDirectory, true);
                    Console.WriteLine("Deleted firmware cache directory");
                }

                // Delete logs directory (in app folder)
                var logsDirectory = Path.Combine(Directory.GetCurrentDirectory(), "Logs");
                if (Directory.Exists(logsDirectory))
                {
                    Directory.Delete(logsDirectory, true);
                    Console.WriteLine("Deleted logs directory");
                }

                // Delete FrameEngine directories (in data folder, not app folder)
                var frameEngineDirectories = new[]
                {
                    Path.Combine(dbDirectory, "frameengine", "frames"),
                    Path.Combine(dbDirectory, "frameengine", "rive"),
                    Path.Combine(dbDirectory, "frameengine", "assets"),
                    Path.Combine(dbDirectory, "frameengine", "videos"),
                    Path.Combine(dbDirectory, "frameengine", "thumbnails")
                };

                foreach (var directory in frameEngineDirectories)
                {
                    if (Directory.Exists(directory))
                    {
                        Directory.Delete(directory, true);
                        Console.WriteLine($"Deleted FrameEngine directory: {Path.GetFileName(Path.GetDirectoryName(directory))}/{Path.GetFileName(directory)}");
                    }
                }

                // Remove the marker file
                File.Delete(deleteMarkerPath);
                Console.WriteLine("Removed deletion marker file");

                Console.WriteLine("Database deletion completed successfully - starting with fresh setup");

                // Recreate essential directories immediately after deletion
                RecreateEssentialDirectories(dbDirectory);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error during database deletion: {ex.Message}");
            }
        }

        private void RecreateEssentialDirectories(string dbDirectory)
        {
            var essentialDirs = new[]
            {
                Path.Combine(dbDirectory, "keys"),
                Path.Combine(dbDirectory, "frameengine", "frames"),
                Path.Combine(dbDirectory, "frameengine", "rive"),
                Path.Combine(dbDirectory, "frameengine", "assets"),
                Path.Combine(dbDirectory, "frameengine", "videos"),
                Path.Combine(dbDirectory, "frameengine", "thumbnails"),
                Path.Combine(dbDirectory, "firmware"),
                Path.Combine(dbDirectory, "firmware", "releases")
            };

            foreach (var dir in essentialDirs)
            {
                Directory.CreateDirectory(dir);
            }

            Console.WriteLine("Recreated essential directories");
        }

        public void ScheduleDeletion()
        {
            var dbDirectory = GetDatabaseDirectory();
            var deleteMarkerPath = Path.Combine(dbDirectory, ".delete-all-data");
            var markerContent = $"DELETE_ALL_DATA_ON_STARTUP\nRequested at: {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC\nReason: User requested complete database reset";

            // Ensure directory exists
            if (!Directory.Exists(dbDirectory))
            {
                Directory.CreateDirectory(dbDirectory);
            }

            File.WriteAllText(deleteMarkerPath, markerContent);
            Console.WriteLine($"Scheduled complete data deletion for next restart at: {deleteMarkerPath}");
        }

        private static string GetDatabaseDirectory()
        {
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "JunctionRelay"
                );
            }
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
            {
                return Path.Combine(Directory.GetCurrentDirectory(), "data");
            }
            else
            {
                return Directory.GetCurrentDirectory();
            }
        }
    }
}