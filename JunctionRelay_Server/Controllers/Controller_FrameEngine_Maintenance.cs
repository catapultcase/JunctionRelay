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
using JunctionRelayServer.Models;
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
        private readonly Service_FrameEngine_Filesystem _filesystemService;
        private readonly IFrameEngineAssetReferenceUpdater _assetReferenceUpdater;

        public Controller_FrameEngine_Maintenance(
            Service_Database_Manager_FrameEngine frameLayoutService,
            Service_FrameEngine frameEngine,
            IWebHostEnvironment webHostEnvironment,
            DatabasePathProvider dbPathProvider,
            Service_FrameEngine_Filesystem filesystemService,
            IFrameEngineAssetReferenceUpdater assetReferenceUpdater)
        {
            _frameLayoutService = frameLayoutService;
            _frameEngine = frameEngine;
            _webHostEnvironment = webHostEnvironment;
            _dbPathProvider = dbPathProvider;
            _filesystemService = filesystemService;
            _assetReferenceUpdater = assetReferenceUpdater;
        }

        // ============================================================================
        // FRAME CLEANUP
        // ============================================================================

        [HttpPost("cleanup")]
        public Task<ActionResult> CleanupOldFrames([FromBody] CleanupFramesRequest? request = null)
        {
            try
            {
                var maxAge = request?.MaxAgeHours.HasValue == true
                    ? TimeSpan.FromHours(request.MaxAgeHours.Value)
                    : TimeSpan.FromHours(24);

                _frameEngine.CleanupOldFrames(maxAge);

                return Task.FromResult<ActionResult>(Ok(new { message = "Frame cleanup completed successfully" }));
            }
            catch (Exception ex)
            {
                return Task.FromResult<ActionResult>(StatusCode(500, new { message = "Error during cleanup", error = ex.Message }));
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
                var report = await _filesystemService.AuditOrphanedFiles();
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
                var result = await _filesystemService.CleanupOrphanedFiles();

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
                var success = _filesystemService.OpenFrameEngineDirectory();

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

        // ============================================================================
        // DUPLICATE ASSET DE-DUPLICATION
        // ============================================================================

        [HttpPost("cleanup/duplicate-assets")]
        public async Task<ActionResult<Model_DeduplicationResult_DTO>> CleanupDuplicateAssets(
            [FromBody] Model_DeduplicationRequest_DTO request)
        {
            try
            {
                var result = new Model_DeduplicationResult_DTO();

                // Process each duplicate group
                foreach (var group in request.DuplicateGroups)
                {
                    // For each duplicate file in the group
                    foreach (var duplicateFile in group.Duplicates)
                    {
                        try
                        {
                            // Update all references to point to the canonical file
                            var updatedCount = await _assetReferenceUpdater.UpdateAssetReferencesAsync(
                                duplicateFile.Filename,
                                group.CanonicalFile,
                                group.AssetType
                            );

                            result.LayoutsUpdated += updatedCount;

                            // Delete the duplicate file
                            var filePath = GetAssetFilePath(duplicateFile.Filename, group.AssetType);
                            if (System.IO.File.Exists(filePath))
                            {
                                System.IO.File.Delete(filePath);
                                result.FilesDeleted++;
                                result.SpaceFreedBytes += duplicateFile.SizeBytes;
                            }
                        }
                        catch (Exception ex)
                        {
                            result.Errors.Add($"Failed to process {duplicateFile.Filename}: {ex.Message}");
                        }
                    }
                }

                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error de-duplicating assets", error = ex.Message });
            }
        }

        /// <summary>
        /// Gets the full file path for an asset based on its type.
        /// </summary>
        private string GetAssetFilePath(string filename, string assetType)
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath) ??
                         Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            var frameEngineDir = Path.Combine(dataDir, "frameengine");

            return assetType.ToLower() switch
            {
                "image" => Path.Combine(frameEngineDir, "images", filename),
                "video" => Path.Combine(frameEngineDir, "videos", filename),
                "rive" => Path.Combine(frameEngineDir, "rive", filename),
                _ => throw new ArgumentException($"Unknown asset type: {assetType}")
            };
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