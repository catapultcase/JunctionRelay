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
using System.ComponentModel.DataAnnotations;

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("api/frameengine")]
    public class Controller_FrameEngine_Maintenance : ControllerBase
    {
        private readonly Service_Database_Manager_FrameEngine _frameLayoutService;
        private readonly Service_FrameEngine _frameEngine;
        private readonly IWebHostEnvironment _webHostEnvironment;
        private readonly DatabasePathProvider _dbPathProvider;

        public Controller_FrameEngine_Maintenance(
            Service_Database_Manager_FrameEngine frameLayoutService,
            Service_FrameEngine frameEngine,
            IWebHostEnvironment webHostEnvironment,
            DatabasePathProvider dbPathProvider)
        {
            _frameLayoutService = frameLayoutService;
            _frameEngine = frameEngine;
            _webHostEnvironment = webHostEnvironment;
            _dbPathProvider = dbPathProvider;
        }

        // ============================================================================
        // FRAME CLEANUP
        // ============================================================================

        [HttpPost("cleanup")]
        public async Task<ActionResult> CleanupOldFrames([FromBody] CleanupFramesRequest? request = null)
        {
            try
            {
                var maxAge = request?.MaxAgeHours.HasValue == true
                    ? TimeSpan.FromHours(request.MaxAgeHours.Value)
                    : TimeSpan.FromHours(24);

                _frameEngine.CleanupOldFrames(maxAge);

                return Ok(new { message = "Frame cleanup completed successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error during cleanup", error = ex.Message });
            }
        }

        // ============================================================================
        // ORPHANED FILES AUDIT & CLEANUP
        // ============================================================================

        [HttpGet("audit/orphaned-files")]
        public async Task<ActionResult<OrphanedFilesReport>> GetOrphanedFilesAudit()
        {
            try
            {
                var filesystemService = new Service_FrameEngine_Filesystem(
                    _frameLayoutService,
                    _dbPathProvider,
                    _webHostEnvironment);

                var report = await filesystemService.AuditOrphanedFiles();
                return Ok(report);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error auditing orphaned files", error = ex.Message });
            }
        }

        [HttpPost("cleanup/orphaned-files")]
        public async Task<ActionResult<CleanupResult>> CleanupOrphanedFiles()
        {
            try
            {
                var filesystemService = new Service_FrameEngine_Filesystem(
                    _frameLayoutService,
                    _dbPathProvider,
                    _webHostEnvironment);

                var result = await filesystemService.CleanupOrphanedFiles();

                if (result.Errors.Count > 0)
                {
                    return Ok(new
                    {
                        deletedCount = result.DeletedCount,
                        freedSpaceMB = result.FreedSpaceMB,
                        deletedFiles = result.DeletedFiles,
                        errors = result.Errors,
                        message = $"Cleanup completed with {result.Errors.Count} error(s)"
                    });
                }

                return Ok(new
                {
                    deletedCount = result.DeletedCount,
                    freedSpaceMB = result.FreedSpaceMB,
                    message = $"Successfully cleaned up {result.DeletedCount} orphaned files, freed {result.FreedSpaceMB:F2} MB"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error cleaning up orphaned files", error = ex.Message });
            }
        }

        // ============================================================================
        // AUTO-CLEANUP SETTINGS
        // ============================================================================

        [HttpGet("settings/auto-cleanup")]
        public async Task<ActionResult> GetAutoCleanupSetting()
        {
            try
            {
                var settingsService = HttpContext.RequestServices.GetRequiredService<IService_Settings>();
                var enabled = await settingsService.GetBoolSettingAsync("frameengine_auto_cleanup", false);

                return Ok(new { enabled });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error retrieving auto-cleanup setting", error = ex.Message });
            }
        }

        [HttpPost("settings/auto-cleanup")]
        public async Task<ActionResult> UpdateAutoCleanupSetting([FromBody] AutoCleanupSettingRequest request)
        {
            try
            {
                var settingsService = HttpContext.RequestServices.GetRequiredService<IService_Settings>();
                await settingsService.SetSettingAsync("frameengine_auto_cleanup", request.Enabled.ToString());

                return Ok(new { message = $"Auto-cleanup {(request.Enabled ? "enabled" : "disabled")}" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error updating auto-cleanup setting", error = ex.Message });
            }
        }

        // ============================================================================
        // DIRECTORY MANAGEMENT
        // ============================================================================

        [HttpPost("open-directory")]
        public ActionResult OpenFrameEngineDirectory()
        {
            try
            {
                var filesystemService = new Service_FrameEngine_Filesystem(
                    _frameLayoutService,
                    _dbPathProvider,
                    _webHostEnvironment);

                var success = filesystemService.OpenFrameEngineDirectory();

                if (!success)
                {
                    return BadRequest(new { message = "Opening directory is only supported on Windows" });
                }

                return Ok(new { message = "Directory opened in Explorer" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error opening directory", error = ex.Message });
            }
        }
    }

    // ============================================================================
    // DTOs
    // ============================================================================

    public class CleanupFramesRequest
    {
        [Range(0.1, 8760)]
        public double? MaxAgeHours { get; set; }

        public bool? RemoveUnreferencedFiles { get; set; }

        public bool? DryRun { get; set; }
    }

    public class AutoCleanupSettingRequest
    {
        public bool Enabled { get; set; }
    }
}