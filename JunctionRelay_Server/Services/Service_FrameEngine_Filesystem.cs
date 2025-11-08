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
using System.Text.Json;

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
        private readonly IFrameEngineHashUtility _hashUtility;

        public Service_FrameEngine_Filesystem(
            Service_Database_Manager_FrameEngine frameLayoutService,
            DatabasePathProvider dbPathProvider,
            IWebHostEnvironment webHostEnvironment,
            IFrameEngineHashUtility hashUtility)
        {
            _frameLayoutService = frameLayoutService;
            _dbPathProvider = dbPathProvider;
            _webHostEnvironment = webHostEnvironment;
            _hashUtility = hashUtility;
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
                OrphanedAssets = new List<string>(),
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

                // Audit assets (background images and videos)
                await AuditAssets(frameLayouts, report);

                // Audit for duplicate assets
                await AuditDuplicateAssets(frameLayouts, report);

                // Calculate totals
                report.TotalOrphanedFiles = report.OrphanedRiveFiles.Count +
                                           report.OrphanedThumbnails.Count +
                                           report.OrphanedFrameImages.Count +
                                           report.OrphanedAssets.Count;
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

                // Delete orphaned assets (background images and videos)
                foreach (var asset in report.OrphanedAssets)
                {
                    try
                    {
                        var filePath = GetAssetFullPath(asset);
                        if (File.Exists(filePath))
                        {
                            var fileInfo = new FileInfo(filePath);
                            var sizeMB = fileInfo.Length / (1024.0 * 1024.0);

                            File.Delete(filePath);
                            result.DeletedFiles.Add(asset);
                            result.FreedSpaceMB += sizeMB;
                        }
                    }
                    catch (Exception ex)
                    {
                        result.Errors.Add($"Failed to delete asset '{asset}': {ex.Message}");
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

                // Extract media-rive element references from jsonFrameElements
                var referencedMediaRiveFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                foreach (var layout in frameLayouts)
                {
                    if (!string.IsNullOrEmpty(layout.JsonFrameElements))
                    {
                        try
                        {
                            var elements = JsonSerializer.Deserialize<List<JsonElement>>(layout.JsonFrameElements);
                            if (elements != null)
                            {
                                foreach (var element in elements)
                                {
                                    if (element.TryGetProperty("type", out var typeProperty))
                                    {
                                        var elementType = typeProperty.GetString();

                                        if (element.TryGetProperty("properties", out var properties))
                                        {
                                            // Media Rive elements
                                            if (elementType == "media-rive" &&
                                                properties.TryGetProperty("filename", out var riveFile))
                                            {
                                                var file = riveFile.GetString();
                                                if (!string.IsNullOrEmpty(file))
                                                    referencedMediaRiveFiles.Add(file);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine($"[SERVICE_FRAMEENGINE_FILESYSTEM] Error parsing elements for layout {layout.Id}: {ex.Message}");
                        }
                    }
                }

                // Find orphaned files
                foreach (var riveFile in riveFiles)
                {
                    var fileName = Path.GetFileName(riveFile);

                    if (!referencedRiveFiles.Contains(fileName) && !referencedMediaRiveFiles.Contains(fileName))
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

        // Audit assets (images and videos in separate directories)
        private async Task AuditAssets(List<Model_Frame_Layout> frameLayouts, OrphanedFilesReport report)
        {
            try
            {
                // Extract media element references from jsonFrameElements
                var referencedMediaImages = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var referencedMediaVideos = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                foreach (var layout in frameLayouts)
                {
                    if (!string.IsNullOrEmpty(layout.JsonFrameElements))
                    {
                        try
                        {
                            var elements = JsonSerializer.Deserialize<List<JsonElement>>(layout.JsonFrameElements);
                            if (elements != null)
                            {
                                foreach (var element in elements)
                                {
                                    if (element.TryGetProperty("type", out var typeProperty))
                                    {
                                        var elementType = typeProperty.GetString();

                                        if (element.TryGetProperty("properties", out var properties))
                                        {
                                            // Media Image elements
                                            if (elementType == "media-image" &&
                                                properties.TryGetProperty("filename", out var imageFile))
                                            {
                                                var file = imageFile.GetString();
                                                if (!string.IsNullOrEmpty(file))
                                                    referencedMediaImages.Add(file);
                                            }

                                            // Media Video elements
                                            if (elementType == "media-video" &&
                                                properties.TryGetProperty("filename", out var videoFile))
                                            {
                                                var file = videoFile.GetString();
                                                if (!string.IsNullOrEmpty(file))
                                                    referencedMediaVideos.Add(file);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine($"[SERVICE_FRAMEENGINE_FILESYSTEM] Error parsing elements for layout {layout.Id}: {ex.Message}");
                        }
                    }
                }

                // ========================================
                // Audit Images (images folder)
                // ========================================
                var assetsPath = GetAssetsUserPath();
                if (Directory.Exists(assetsPath))
                {
                    var imageExtensions = new[] { ".png", ".jpg", ".jpeg", ".webp", ".gif" };
                    var imageFiles = Directory.GetFiles(assetsPath, "*.*")
                        .Where(f => imageExtensions.Contains(Path.GetExtension(f).ToLowerInvariant()))
                        .ToList();

                    // Get list of background images referenced by frame layouts
                    var referencedImages = frameLayouts
                        .Where(fl => !string.IsNullOrEmpty(fl.BackgroundImageUrl))
                        .Select(fl => fl.BackgroundImageUrl!)
                        .ToHashSet(StringComparer.OrdinalIgnoreCase);

                    // Find orphaned image files
                    foreach (var imageFile in imageFiles)
                    {
                        var fileName = Path.GetFileName(imageFile);

                        if (!referencedImages.Contains(fileName) && !referencedMediaImages.Contains(fileName))
                        {
                            report.OrphanedAssets.Add(fileName);

                            // Add to estimated size
                            var fileInfo = new FileInfo(imageFile);
                            report.EstimatedSizeMB += fileInfo.Length / (1024.0 * 1024.0);
                        }
                    }
                }

                // ========================================
                // Audit Videos (videos folder)
                // ========================================
                var videosPath = GetVideosUserPath();
                if (Directory.Exists(videosPath))
                {
                    var videoExtensions = new[] { ".mp4", ".webm", ".ogg", ".mov", ".avi" };
                    var videoFiles = Directory.GetFiles(videosPath, "*.*")
                        .Where(f => videoExtensions.Contains(Path.GetExtension(f).ToLowerInvariant()))
                        .ToList();

                    // Get list of background videos referenced by frame layouts
                    var referencedVideos = frameLayouts
                        .Where(fl => !string.IsNullOrEmpty(fl.BackgroundVideoUrl))
                        .Select(fl => fl.BackgroundVideoUrl!)
                        .ToHashSet(StringComparer.OrdinalIgnoreCase);

                    // Find orphaned video files
                    foreach (var videoFile in videoFiles)
                    {
                        var fileName = Path.GetFileName(videoFile);

                        if (!referencedVideos.Contains(fileName) && !referencedMediaVideos.Contains(fileName))
                        {
                            report.OrphanedAssets.Add(fileName);

                            // Add to estimated size
                            var fileInfo = new FileInfo(videoFile);
                            report.EstimatedSizeMB += fileInfo.Length / (1024.0 * 1024.0);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_FRAMEENGINE_FILESYSTEM] Error auditing assets: {ex.Message}");
            }
        }

        /// <summary>
        /// Audits the filesystem for duplicate asset files (same content, different names).
        /// Uses SHA256 hash comparison to detect identical files.
        /// </summary>
        private async Task AuditDuplicateAssets(List<Model_Frame_Layout> frameLayouts, OrphanedFilesReport report)
        {
            try
            {
                var duplicateGroups = new List<Model_DuplicateGroup_DTO>();

                // Audit images for duplicates
                var imagesDuplicates = await _hashUtility.FindDuplicatesByHashAsync(GetAssetsUserPath(), "*.*");
                ProcessDuplicateGroups(imagesDuplicates, "image", frameLayouts, duplicateGroups);

                // Audit videos for duplicates
                var videosDuplicates = await _hashUtility.FindDuplicatesByHashAsync(GetVideosUserPath(), "*.*");
                ProcessDuplicateGroups(videosDuplicates, "video", frameLayouts, duplicateGroups);

                // Audit Rive files for duplicates
                var riveDuplicates = await _hashUtility.FindDuplicatesByHashAsync(GetRiveUserPath(), "*.riv");
                ProcessDuplicateGroups(riveDuplicates, "rive", frameLayouts, duplicateGroups);

                // Populate report
                report.DuplicateAssets = duplicateGroups;
                report.TotalDuplicateSpaceSavingsBytes = duplicateGroups.Sum(g => g.SpaceSavingsBytes);
                report.TotalDuplicateFileCount = duplicateGroups.Sum(g => g.Duplicates.Count);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_FRAMEENGINE_FILESYSTEM] Error auditing duplicate assets: {ex.Message}");
            }
        }

        /// <summary>
        /// Processes duplicate file groups from hash utility into DTO format.
        /// Identifies oldest file as canonical, calculates space savings, counts usage.
        /// </summary>
        private void ProcessDuplicateGroups(
            Dictionary<string, List<FileInfo>> hashGroups,
            string assetType,
            List<Model_Frame_Layout> frameLayouts,
            List<Model_DuplicateGroup_DTO> duplicateGroups)
        {
            foreach (var hashGroup in hashGroups)
            {
                var hash = hashGroup.Key;
                var files = hashGroup.Value;

                // Skip if only one file (not a duplicate)
                if (files.Count < 2) continue;

                // Sort by creation time (oldest first)
                var sortedFiles = files.OrderBy(f => f.CreationTime).ToList();
                var canonicalFile = sortedFiles.First();

                var group = new Model_DuplicateGroup_DTO
                {
                    FileHash = hash,
                    AssetType = assetType,
                    CanonicalFile = canonicalFile.Name,
                    Duplicates = new List<Model_DuplicateFile_DTO>(),
                    SpaceSavingsBytes = 0
                };

                // Process duplicates (all files except the canonical)
                foreach (var file in sortedFiles.Skip(1))
                {
                    var usageCount = CountFileUsage(file.Name, assetType, frameLayouts);

                    group.Duplicates.Add(new Model_DuplicateFile_DTO
                    {
                        Filename = file.Name,
                        SizeBytes = file.Length,
                        CreatedDate = file.CreationTime,
                        UsageCount = usageCount
                    });

                    // Space savings = size of each duplicate
                    group.SpaceSavingsBytes += file.Length;
                }

                duplicateGroups.Add(group);
            }
        }

        /// <summary>
        /// Counts how many FrameLayouts reference a specific asset file.
        /// Checks both direct references (BackgroundImageUrl, etc.) and JsonFrameElements.
        /// </summary>
        private int CountFileUsage(string filename, string assetType, List<Model_Frame_Layout> frameLayouts)
        {
            var count = 0;

            foreach (var layout in frameLayouts)
            {
                // Check direct references based on asset type
                switch (assetType)
                {
                    case "image":
                        if (filename.Equals(layout.BackgroundImageUrl, StringComparison.OrdinalIgnoreCase))
                            count++;
                        break;

                    case "video":
                        if (filename.Equals(layout.BackgroundVideoUrl, StringComparison.OrdinalIgnoreCase))
                            count++;
                        break;

                    case "rive":
                        if (filename.Equals(layout.RiveFile, StringComparison.OrdinalIgnoreCase))
                            count++;
                        break;
                }

                // Check JsonFrameElements
                if (!string.IsNullOrEmpty(layout.JsonFrameElements))
                {
                    try
                    {
                        var elements = JsonSerializer.Deserialize<List<JsonElement>>(layout.JsonFrameElements);
                        if (elements != null)
                        {
                            foreach (var element in elements)
                            {
                                if (element.TryGetProperty("type", out var typeProperty) &&
                                    element.TryGetProperty("properties", out var properties))
                                {
                                    var elementType = typeProperty.GetString();
                                    var matchingType = assetType switch
                                    {
                                        "image" => "media-image",
                                        "video" => "media-video",
                                        "rive" => "media-rive",
                                        _ => null
                                    };

                                    if (elementType == matchingType &&
                                        properties.TryGetProperty("filename", out var filenameProperty))
                                    {
                                        var elementFilename = filenameProperty.GetString();
                                        if (filename.Equals(elementFilename, StringComparison.OrdinalIgnoreCase))
                                        {
                                            count++;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    catch
                    {
                        // Ignore JSON parsing errors
                    }
                }
            }

            return count;
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

        // Get assets user path (background images)
        private string GetAssetsUserPath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath) ??
                         Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine", "images");
        }

        // Get videos user path (background videos)
        private string GetVideosUserPath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath) ??
                         Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine", "videos");
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

        // Get asset full path (checks both images and videos folders)
        private string GetAssetFullPath(string fileName)
        {
            var extension = Path.GetExtension(fileName).ToLowerInvariant();
            var videoExtensions = new[] { ".mp4", ".webm", ".ogg", ".mov", ".avi" };

            // If it's a video, look in videos folder
            if (videoExtensions.Contains(extension))
            {
                return Path.Combine(GetVideosUserPath(), fileName);
            }

            // Otherwise, look in images folder
            return Path.Combine(GetAssetsUserPath(), fileName);
        }
    }

    // DTOs for filesystem operations
    public class OrphanedFilesReport
    {
        public List<string> OrphanedRiveFiles { get; set; } = new();
        public List<string> OrphanedThumbnails { get; set; } = new();
        public List<string> OrphanedFrameImages { get; set; } = new();
        public List<string> OrphanedAssets { get; set; } = new();
        public int TotalOrphanedFiles { get; set; }
        public double EstimatedSizeMB { get; set; }

        // Duplicate asset detection results
        public List<Model_DuplicateGroup_DTO> DuplicateAssets { get; set; } = new();
        public long TotalDuplicateSpaceSavingsBytes { get; set; }
        public int TotalDuplicateFileCount { get; set; }
    }

    public class CleanupResult
    {
        public List<string> DeletedFiles { get; set; } = new();
        public int DeletedCount { get; set; }
        public double FreedSpaceMB { get; set; }
        public List<string> Errors { get; set; } = new();
    }
}