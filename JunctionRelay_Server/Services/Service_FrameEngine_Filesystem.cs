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

using JunctionRelayServer.Models;
using JunctionRelayServer.Utils;
using System.Runtime.InteropServices;

namespace JunctionRelayServer.Services
{
    /// <summary>
    /// Service for managing FrameEngine filesystem operations including
    /// orphaned file detection and cleanup
    /// </summary>
    public class Service_FrameEngine_Filesystem
    {
        private readonly Service_Database_Manager_FrameEngine _frameLayoutService;
        private readonly DatabasePathProvider _dbPathProvider;
        private readonly IWebHostEnvironment _webHostEnvironment;

        public Service_FrameEngine_Filesystem(
            Service_Database_Manager_FrameEngine frameLayoutService,
            DatabasePathProvider dbPathProvider,
            IWebHostEnvironment webHostEnvironment)
        {
            _frameLayoutService = frameLayoutService;
            _dbPathProvider = dbPathProvider;
            _webHostEnvironment = webHostEnvironment;
        }

        /// <summary>
        /// Opens the FrameEngine data directory in Windows Explorer
        /// </summary>
        public bool OpenFrameEngineDirectory()
        {
            try
            {
                if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                {
                    return false; // Only supported on Windows
                }

                var frameEnginePath = GetFrameEngineBasePath();

                if (!Directory.Exists(frameEnginePath))
                {
                    Directory.CreateDirectory(frameEnginePath);
                }

                System.Diagnostics.Process.Start("explorer.exe", frameEnginePath);
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_FRAMEENGINE_FILESYSTEM] Error opening directory: {ex.Message}");
                return false;
            }
        }

        private string GetFrameEngineBasePath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath) ??
                         Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine");
        }

        /// <summary>
        /// Audits the filesystem for orphaned files that are not referenced by any frame layout
        /// </summary>
        public async Task<OrphanedFilesReport> AuditOrphanedFiles()
        {
            var report = new OrphanedFilesReport
            {
                OrphanedRiveFiles = new List<string>(),
                OrphanedThumbnails = new List<string>(),
                OrphanedFrameImages = new List<string>(),
                TotalOrphanedFiles = 0,
                EstimatedSizeMB = 0
            };

            try
            {
                // Get all frame layouts from database
                var frameLayouts = (await _frameLayoutService.GetAllFrameLayoutsAsync()).ToList();

                // Audit Rive files
                await AuditRiveFiles(frameLayouts, report);

                // Audit thumbnails
                await AuditThumbnails(frameLayouts, report);

                // Audit frame images (rendered frames in output directory)
                await AuditFrameImages(frameLayouts, report);

                // Calculate totals
                report.TotalOrphanedFiles = report.OrphanedRiveFiles.Count +
                                           report.OrphanedThumbnails.Count +
                                           report.OrphanedFrameImages.Count;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_FRAMEENGINE_FILESYSTEM] Error during audit: {ex.Message}");
                throw;
            }

            return report;
        }

        /// <summary>
        /// Cleans up orphaned files from the filesystem
        /// </summary>
        public async Task<CleanupResult> CleanupOrphanedFiles()
        {
            var result = new CleanupResult
            {
                DeletedFiles = new List<string>(),
                DeletedCount = 0,
                FreedSpaceMB = 0,
                Errors = new List<string>()
            };

            try
            {
                // Get audit report
                var report = await AuditOrphanedFiles();

                if (report.TotalOrphanedFiles == 0)
                {
                    return result; // Nothing to clean
                }

                // Delete orphaned Rive files
                foreach (var riveFile in report.OrphanedRiveFiles)
                {
                    try
                    {
                        var filePath = GetRiveUserFilePath(riveFile);
                        if (File.Exists(filePath))
                        {
                            var fileInfo = new FileInfo(filePath);
                            var sizeMB = fileInfo.Length / (1024.0 * 1024.0);

                            File.Delete(filePath);
                            result.DeletedFiles.Add(riveFile);
                            result.FreedSpaceMB += sizeMB;
                        }
                    }
                    catch (Exception ex)
                    {
                        result.Errors.Add($"Failed to delete Rive file '{riveFile}': {ex.Message}");
                    }
                }

                // Delete orphaned thumbnails
                foreach (var thumbnail in report.OrphanedThumbnails)
                {
                    try
                    {
                        var filePath = GetThumbnailFullPath(thumbnail);
                        if (File.Exists(filePath))
                        {
                            var fileInfo = new FileInfo(filePath);
                            var sizeMB = fileInfo.Length / (1024.0 * 1024.0);

                            File.Delete(filePath);
                            result.DeletedFiles.Add(thumbnail);
                            result.FreedSpaceMB += sizeMB;
                        }
                    }
                    catch (Exception ex)
                    {
                        result.Errors.Add($"Failed to delete thumbnail '{thumbnail}': {ex.Message}");
                    }
                }

                // Delete orphaned frame images
                foreach (var frameImage in report.OrphanedFrameImages)
                {
                    try
                    {
                        var filePath = GetFrameImageFullPath(frameImage);
                        if (File.Exists(filePath))
                        {
                            var fileInfo = new FileInfo(filePath);
                            var sizeMB = fileInfo.Length / (1024.0 * 1024.0);

                            File.Delete(filePath);
                            result.DeletedFiles.Add(frameImage);
                            result.FreedSpaceMB += sizeMB;
                        }
                    }
                    catch (Exception ex)
                    {
                        result.Errors.Add($"Failed to delete frame image '{frameImage}': {ex.Message}");
                    }
                }

                result.DeletedCount = result.DeletedFiles.Count;
            }
            catch (Exception ex)
            {
                result.Errors.Add($"Cleanup failed: {ex.Message}");
                Console.WriteLine($"[SERVICE_FRAMEENGINE_FILESYSTEM] Error during cleanup: {ex.Message}");
            }

            return result;
        }

        private async Task AuditRiveFiles(List<Model_Frame_Layout> frameLayouts, OrphanedFilesReport report)
        {
            try
            {
                var riveUserPath = GetRiveUserPath();
                if (!Directory.Exists(riveUserPath))
                {
                    return; // No user Rive directory, nothing to audit
                }

                // Get all Rive files in user directory
                var riveFiles = Directory.GetFiles(riveUserPath, "*.riv");

                // Get list of Rive files referenced by frame layouts
                var referencedRiveFiles = frameLayouts
                    .Where(fl => !string.IsNullOrEmpty(fl.RiveFile))
                    .Select(fl => fl.RiveFile!)
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);

                // Find orphaned files
                foreach (var riveFile in riveFiles)
                {
                    var fileName = Path.GetFileName(riveFile);

                    if (!referencedRiveFiles.Contains(fileName))
                    {
                        report.OrphanedRiveFiles.Add(fileName);

                        // Add to estimated size
                        var fileInfo = new FileInfo(riveFile);
                        report.EstimatedSizeMB += fileInfo.Length / (1024.0 * 1024.0);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_FRAMEENGINE_FILESYSTEM] Error auditing Rive files: {ex.Message}");
            }
        }

        private async Task AuditThumbnails(List<Model_Frame_Layout> frameLayouts, OrphanedFilesReport report)
        {
            try
            {
                var thumbnailsPath = GetThumbnailsPath();
                if (!Directory.Exists(thumbnailsPath))
                {
                    return; // No thumbnails directory, nothing to audit
                }

                // Get all thumbnail files
                var thumbnailFiles = Directory.GetFiles(thumbnailsPath, "*.*")
                    .Where(f => f.EndsWith(".png", StringComparison.OrdinalIgnoreCase) ||
                               f.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase) ||
                               f.EndsWith(".jpeg", StringComparison.OrdinalIgnoreCase) ||
                               f.EndsWith(".webp", StringComparison.OrdinalIgnoreCase))
                    .ToList();

                // Get list of thumbnail files referenced by frame layouts
                var referencedThumbnails = frameLayouts
                    .Where(fl => fl.HasThumbnail && !string.IsNullOrEmpty(fl.ThumbnailPath))
                    .Select(fl => Path.GetFileName(fl.ThumbnailPath!))
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);

                // Find orphaned thumbnails
                foreach (var thumbnailFile in thumbnailFiles)
                {
                    var fileName = Path.GetFileName(thumbnailFile);

                    if (!referencedThumbnails.Contains(fileName))
                    {
                        report.OrphanedThumbnails.Add(fileName);

                        // Add to estimated size
                        var fileInfo = new FileInfo(thumbnailFile);
                        report.EstimatedSizeMB += fileInfo.Length / (1024.0 * 1024.0);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_FRAMEENGINE_FILESYSTEM] Error auditing thumbnails: {ex.Message}");
            }
        }

        private async Task AuditFrameImages(List<Model_Frame_Layout> frameLayouts, OrphanedFilesReport report)
        {
            try
            {
                var framesPath = GetFramesPath();
                if (!Directory.Exists(framesPath))
                {
                    return; // No frames directory, nothing to audit
                }

                // Get all frame image files (typically PNG files)
                var frameFiles = Directory.GetFiles(framesPath, "*.png");

                // For now, we consider frame images that are older than 7 days as potentially orphaned
                // since they should be regenerated frequently
                var cutoffDate = DateTime.UtcNow.AddDays(-7);

                foreach (var frameFile in frameFiles)
                {
                    var fileInfo = new FileInfo(frameFile);

                    if (fileInfo.LastWriteTimeUtc < cutoffDate)
                    {
                        var fileName = Path.GetFileName(frameFile);
                        report.OrphanedFrameImages.Add(fileName);

                        // Add to estimated size
                        report.EstimatedSizeMB += fileInfo.Length / (1024.0 * 1024.0);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_FRAMEENGINE_FILESYSTEM] Error auditing frame images: {ex.Message}");
            }
        }

        // Path helper methods
        private string GetRiveUserPath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath) ??
                         Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine", "rive");
        }

        private string GetThumbnailsPath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath) ??
                         Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine", "thumbnails");
        }

        private string GetFramesPath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath) ??
                         Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine", "frames");
        }

        private string GetRiveUserFilePath(string fileName)
        {
            return Path.Combine(GetRiveUserPath(), fileName);
        }

        private string GetThumbnailFullPath(string fileName)
        {
            return Path.Combine(GetThumbnailsPath(), fileName);
        }

        private string GetFrameImageFullPath(string fileName)
        {
            return Path.Combine(GetFramesPath(), fileName);
        }
    }

    // DTOs for filesystem operations
    public class OrphanedFilesReport
    {
        public List<string> OrphanedRiveFiles { get; set; } = new();
        public List<string> OrphanedThumbnails { get; set; } = new();
        public List<string> OrphanedFrameImages { get; set; } = new();
        public int TotalOrphanedFiles { get; set; }
        public double EstimatedSizeMB { get; set; }
    }

    public class CleanupResult
    {
        public List<string> DeletedFiles { get; set; } = new();
        public int DeletedCount { get; set; }
        public double FreedSpaceMB { get; set; }
        public List<string> Errors { get; set; } = new();
    }
}