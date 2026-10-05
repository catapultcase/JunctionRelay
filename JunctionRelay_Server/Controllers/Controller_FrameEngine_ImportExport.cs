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

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using JunctionRelayServer.Services;
using JunctionRelayServer.Utils;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Controllers
{
    /// <summary>
    /// Controller for FrameEngine import/export operations
    /// </summary>
    [ApiController]
    [Route("api/frameengine")]
    public class Controller_FrameEngine_ImportExport : ControllerBase
    {
        private readonly Service_Database_Manager_FrameEngine _frameLayoutService;
        private readonly Service_Database_Manager_JunctionLinks _junctionLinksService;
        private readonly IWebHostEnvironment _webHostEnvironment;
        private readonly DatabasePathProvider _dbPathProvider;
        private readonly Service_Database_Manager_Subscriptions _subscriptionService;

        public Controller_FrameEngine_ImportExport(
            Service_Database_Manager_FrameEngine frameLayoutService,
            Service_Database_Manager_JunctionLinks junctionLinksService,
            IWebHostEnvironment webHostEnvironment,
            DatabasePathProvider dbPathProvider,
            Service_Database_Manager_Subscriptions subscriptionService)
        {
            _frameLayoutService = frameLayoutService;
            _junctionLinksService = junctionLinksService;
            _webHostEnvironment = webHostEnvironment;
            _dbPathProvider = dbPathProvider;
            _subscriptionService = subscriptionService;
        }

        // ============================================================================
        // IMPORT PACKAGE
        // ============================================================================

        [HttpPost("import-package")]
        public async Task<ActionResult> ImportFrameLayoutPackage(
            IFormFile packageFile,
            [FromQuery] bool preserveCloudIds = true)
        {
            try
            {
                if (packageFile == null || packageFile.Length == 0)
                    return BadRequest(new { message = "No file provided" });

                if (!packageFile.FileName.ToLowerInvariant().EndsWith(".zip"))
                    return BadRequest(new { message = "File must be a ZIP package" });

                // Validate file size (max 100MB)
                if (packageFile.Length > 100 * 1024 * 1024)
                    return BadRequest(new { message = "File size exceeds 100MB limit" });

                // Read file data
                byte[] zipData;
                using (var memoryStream = new MemoryStream())
                {
                    await packageFile.CopyToAsync(memoryStream);
                    zipData = memoryStream.ToArray();
                }

                var contentRootPath = _webHostEnvironment.ContentRootPath;
                var templatesPath = GetTemplatesPath();
                var rivePath = GetRivePath();
                var assetsPath = GetAssetsPath();
                var videosPath = GetVideosPath();
                var dbPath = _dbPathProvider.DbPath;

                var layoutId = await _frameLayoutService.ImportFrameLayoutPackageAsync(
                    zipData,
                    contentRootPath,
                    templatesPath,
                    rivePath,
                    assetsPath,
                    videosPath,
                    dbPath,
                    preserveCloudIds);

                return Ok(new
                {
                    id = layoutId,
                    message = "Frame layout package imported successfully"
                });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error importing frame layout package", error = ex.Message });
            }
        }

        // ============================================================================
        // EXPORT PACKAGE
        // ============================================================================

        [AllowAnonymous]
        [HttpGet("{id}/export-standalone")]
        public async Task<ActionResult> ExportStandaloneConfig(int id, [FromQuery] string? filename = null)
        {
            try
            {
                var templatesPath = GetTemplatesPath();
                var rivePath = GetRivePath();
                var assetsPath = GetAssetsPath();
                var videosPath = GetVideosPath();
                var dataPath = _dbPathProvider.DbPath;

                var result = await _frameLayoutService.ExportFrameLayoutPackageAsync(
                    id,
                    templatesPath,
                    rivePath,
                    assetsPath,
                    videosPath,
                    dataPath,
                    _webHostEnvironment.ContentRootPath);

                var exportFilename = filename ?? result.filename;

                return File(result.zipData, "application/zip", exportFilename);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (FileNotFoundException ex)
            {
                return NotFound(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error exporting frame layout package", error = ex.Message });
            }
        }

        // ============================================================================
        // SCREEN CONFIGURATION URL
        // ============================================================================

        [HttpGet("screen-config/{screenConfigId}/url")]
        public async Task<ActionResult> GetScreenConfigUrl(int screenConfigId, [FromQuery] string? baseUrl = null)
        {
            try
            {
                var screenConfig = await _junctionLinksService.GetJunctionScreenLayoutByIdAsync(screenConfigId);
                if (screenConfig == null)
                    return NotFound(new { message = $"Screen configuration with ID {screenConfigId} not found" });

                if (!screenConfig.EnableUrlAccess)
                    return Ok(new { message = "URL access is disabled for this screen configuration", url = "" });

                var requestBaseUrl = baseUrl ?? $"{Request.Scheme}://{Request.Host}";
                var url = Service_FrameEngine.GenerateFrameUrl(requestBaseUrl, screenConfig);

                return Ok(new { url, enabled = screenConfig.EnableUrlAccess, urlPath = screenConfig.UrlPath });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error retrieving screen configuration URL", error = ex.Message });
            }
        }

        // ============================================================================
        // IMPORT TO LIBRARY (ZIP, no DB import)
        // ============================================================================

        [HttpPost("import-to-library")]
        public async Task<ActionResult> ImportToLibrary(IFormFile packageFile)
        {
            try
            {
                if (packageFile == null || packageFile.Length == 0)
                    return BadRequest(new { message = "No file provided" });

                if (!packageFile.FileName.ToLowerInvariant().EndsWith(".zip"))
                    return BadRequest(new { message = "File must be a ZIP package" });

                if (packageFile.Length > 100 * 1024 * 1024)
                    return BadRequest(new { message = "File size exceeds 100MB limit" });

                var downloadsDir = GetDownloadsPath();
                var safeName = string.Concat(Path.GetFileNameWithoutExtension(packageFile.FileName)
                    .Split(Path.GetInvalidFileNameChars()));
                if (string.IsNullOrEmpty(safeName)) safeName = "imported-layout";

                var filename = $"{safeName}.zip";
                var counter = 1;
                while (System.IO.File.Exists(Path.Combine(downloadsDir, filename)))
                {
                    filename = $"{safeName}_{counter}.zip";
                    counter++;
                }

                var filePath = Path.Combine(downloadsDir, filename);

                // Path traversal check
                var resolvedPath = Path.GetFullPath(filePath);
                var resolvedDir = Path.GetFullPath(downloadsDir);
                if (!resolvedPath.StartsWith(resolvedDir))
                    return BadRequest(new { message = "Invalid file path" });

                using (var stream = new FileStream(filePath, FileMode.Create))
                {
                    await packageFile.CopyToAsync(stream);
                }

                // Create subscription record (source='manual')
                var subscription = new Model_Layout_Subscription
                {
                    ServerUrl = "local",
                    ServerPort = "0",
                    RemoteLayoutId = Guid.NewGuid().ToString(),
                    RemoteLayoutName = Path.GetFileNameWithoutExtension(packageFile.FileName),
                    LocalFilePath = filePath,
                    LocalFileName = filename,
                    Source = "manual",
                };

                var subId = await _subscriptionService.CreateSubscriptionAsync(subscription);

                return Ok(new
                {
                    success = true,
                    path = filePath,
                    filename,
                    subscriptionId = subId,
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error importing to library", error = ex.Message });
            }
        }

        // ============================================================================
        // IMPORT FROM ZIP (clone downloaded/subscribed layout into FrameEngine)
        // ============================================================================

        public class ImportFromZipRequest
        {
            public string ZipPath { get; set; } = "";
        }

        [HttpPost("import-from-zip")]
        public async Task<ActionResult> ImportFromZip([FromBody] ImportFromZipRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.ZipPath))
                    return BadRequest(new { success = false, error = "zipPath is required" });

                // Resolve path — allow both absolute and relative to downloads dir
                var zipPath = request.ZipPath;
                if (!Path.IsPathRooted(zipPath))
                {
                    zipPath = Path.Combine(GetDownloadsPath(), zipPath);
                }

                var resolvedPath = Path.GetFullPath(zipPath);
                if (!System.IO.File.Exists(resolvedPath))
                    return NotFound(new { success = false, error = "ZIP file not found" });

                var zipData = await System.IO.File.ReadAllBytesAsync(resolvedPath);

                var layoutId = await _frameLayoutService.ImportFrameLayoutPackageAsync(
                    zipData,
                    _webHostEnvironment.ContentRootPath,
                    GetTemplatesPath(),
                    GetRivePath(),
                    GetAssetsPath(),
                    GetVideosPath(),
                    _dbPathProvider.DbPath,
                    preserveCloudIds: false);

                // Cloning always produces a user-owned layout, never a template
                var imported = await _frameLayoutService.GetFrameLayoutByIdAsync(layoutId);
                if (imported != null)
                {
                    imported.IsTemplate = false;
                    await _frameLayoutService.UpdateFrameLayoutAsync(imported);
                }

                // Count assets for the response
                var assetCount = 0;
                if (imported != null)
                {
                    if (!string.IsNullOrEmpty(imported.RiveFile)) assetCount++;
                    if (!string.IsNullOrEmpty(imported.BackgroundImageUrl) &&
                        !imported.BackgroundImageUrl.StartsWith("http")) assetCount++;
                    if (!string.IsNullOrEmpty(imported.BackgroundVideoUrl) &&
                        !imported.BackgroundVideoUrl.StartsWith("http")) assetCount++;
                }

                return Ok(new
                {
                    success = true,
                    data = new
                    {
                        id = layoutId,
                        displayName = imported?.DisplayName ?? "",
                        assetCount,
                    }
                });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { success = false, error = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, error = $"Error importing layout: {ex.Message}" });
            }
        }

        // ============================================================================
        // HELPER METHODS
        // ============================================================================

        private string GetDownloadsPath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath)
                          ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            var downloadsDir = Path.Combine(dataDir, "frameengine", "downloads");
            Directory.CreateDirectory(downloadsDir);
            return downloadsDir;
        }

        private string GetTemplatesPath()
        {
            return Path.Combine(_webHostEnvironment.ContentRootPath, "frameengine", "templates");
        }

        private string GetRivePath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath)
                          ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine", "rive");
        }

        private string GetAssetsPath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath)
                          ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine", "images");
        }

        private string GetVideosPath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath)
                          ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine", "videos");
        }
    }
}
