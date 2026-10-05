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

namespace JunctionRelayServer.Services.ElementPlugins
{
    /// <summary>
    /// Extracts .zip files dropped into plugin directories before discovery runs.
    /// Shared by both element and collector plugin discovery.
    /// </summary>
    public static class Service_PluginZipInstaller
    {
        public static void ExtractPendingZips(string pluginDir)
        {
            if (!Directory.Exists(pluginDir))
                return;

            foreach (var zipPath in Directory.GetFiles(pluginDir, "*.zip"))
            {
                var folderName = Path.GetFileNameWithoutExtension(zipPath);
                var targetDir = Path.Combine(pluginDir, folderName);

                if (Directory.Exists(targetDir))
                {
                    Console.WriteLine($"[PLUGINS] Plugin folder '{folderName}' already exists, skipping {Path.GetFileName(zipPath)}");
                    continue;
                }

                try
                {
                    using var archive = ZipFile.OpenRead(zipPath);
                    var resolvedTarget = Path.GetFullPath(pluginDir) + Path.DirectorySeparatorChar;

                    foreach (var entry in archive.Entries)
                    {
                        if (string.IsNullOrEmpty(entry.Name))
                            continue; // Skip directory entries

                        var entryPath = Path.GetFullPath(Path.Combine(pluginDir, entry.FullName));
                        if (!entryPath.StartsWith(resolvedTarget, StringComparison.OrdinalIgnoreCase))
                        {
                            Console.WriteLine($"[PLUGINS] Skipping entry with path traversal: {entry.FullName}");
                            continue;
                        }

                        var entryDir = Path.GetDirectoryName(entryPath);
                        if (!string.IsNullOrEmpty(entryDir) && !Directory.Exists(entryDir))
                        {
                            Directory.CreateDirectory(entryDir);
                        }

                        using var entryStream = entry.Open();
                        using var fileStream = File.Create(entryPath);
                        entryStream.CopyTo(fileStream);
                    }

                    File.Delete(zipPath);
                    Console.WriteLine($"[PLUGINS] Installed plugin from {Path.GetFileName(zipPath)}");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[PLUGINS] Failed to extract {Path.GetFileName(zipPath)}: {ex.Message}");
                }
            }
        }
    }
}
