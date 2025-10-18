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

using Microsoft.AspNetCore.Mvc;
using JunctionRelayServer.Services;
using JunctionRelayServer.Utils;

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("api/frameengine")]
    public class Controller_FrameEngine_ImportExport : ControllerBase
    {
        private readonly Service_Database_Manager_FrameEngine _frameLayoutService;
        private readonly Service_Database_Manager_JunctionLinks _junctionLinksService;
        private readonly IWebHostEnvironment _webHostEnvironment;
        private readonly DatabasePathProvider _dbPathProvider;

        public Controller_FrameEngine_ImportExport(
            Service_Database_Manager_FrameEngine frameLayoutService,
            Service_Database_Manager_JunctionLinks junctionLinksService,
            IWebHostEnvironment webHostEnvironment,
            DatabasePathProvider dbPathProvider)
        {
            _frameLayoutService = frameLayoutService;
            _junctionLinksService = junctionLinksService;
            _webHostEnvironment = webHostEnvironment;
            _dbPathProvider = dbPathProvider;
        }

        // ============================================================================
        // IMPORT PACKAGE
        // ============================================================================

        [HttpPost("import-package")]
        public async Task<ActionResult> ImportFrameLayoutPackage(IFormFile packageFile)
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
                    dbPath);

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
        // HELPER METHODS
        // ============================================================================

        /// <summary>
        /// Gets the path to the templates directory
        /// </summary>
        private string GetTemplatesPath()
        {
            return Path.Combine(_webHostEnvironment.ContentRootPath, "frameengine", "templates");
        }

        /// <summary>
        /// Gets the path to the Rive files directory
        /// </summary>
        private string GetRivePath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath)
                          ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine", "rive");
        }

        /// <summary>
        /// Gets the path to the assets directory (images)
        /// </summary>
        private string GetAssetsPath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath)
                          ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine", "assets");
        }

        /// <summary>
        /// Gets the path to the videos directory
        /// </summary>
        private string GetVideosPath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath)
                          ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine", "videos");
        }
    }
}