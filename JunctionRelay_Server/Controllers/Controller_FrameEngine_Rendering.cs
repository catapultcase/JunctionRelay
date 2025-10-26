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
    public class Controller_FrameEngine_Rendering : ControllerBase
    {
        private readonly Service_Database_Manager_FrameEngine _frameLayoutService;
        private readonly Service_FrameEngine _frameEngine;
        private readonly Service_FrameEngine_Puppeteer _puppeteerFrameEngine;
        private readonly IWebHostEnvironment _webHostEnvironment;
        private readonly DatabasePathProvider _dbPathProvider;

        public Controller_FrameEngine_Rendering(
            Service_Database_Manager_FrameEngine frameLayoutService,
            Service_FrameEngine frameEngine,
            Service_FrameEngine_Puppeteer puppeteerFrameEngine,
            IWebHostEnvironment webHostEnvironment,
            DatabasePathProvider dbPathProvider)
        {
            _frameLayoutService = frameLayoutService;
            _frameEngine = frameEngine;
            _puppeteerFrameEngine = puppeteerFrameEngine;
            _webHostEnvironment = webHostEnvironment;
            _dbPathProvider = dbPathProvider;
        }

        // ============================================================================
        // FRAME PREVIEW
        // ============================================================================

        [HttpPost("{id}/preview")]
        public async Task<ActionResult> GenerateFramePreview(int id, [FromBody] FramePreviewRequest request)
        {
            try
            {
                var frameLayout = await _frameLayoutService.GetFrameLayoutByIdAsync(id);
                if (frameLayout == null)
                    return NotFound(new { message = $"Frame layout with ID {id} not found" });

                // Create a temporary virtual screen ID for preview
                var previewVirtualScreenId = $"preview_{id}_{Guid.NewGuid()}";

                var frameData = await _puppeteerFrameEngine.RenderFrame(
                    frameLayout,
                    request.SensorData ?? new Dictionary<string, object>(),
                    previewVirtualScreenId,
                    0, // dummy junction ID
                    0, // dummy link ID
                    0  // dummy screen ID
                );

                // Clean up browser after preview
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await _puppeteerFrameEngine.CloseBrowser(previewVirtualScreenId);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[CONTROLLER_FRAMEENGINE_RENDERING] Error cleaning up preview browser: {ex.Message}");
                    }
                });

                return File(frameData, "image/png", $"frame-preview-{id}.png");
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error generating frame preview", error = ex.Message });
            }
        }

        // ============================================================================
        // THUMBNAIL GENERATION
        // ============================================================================

        [HttpPost("{id}/generate-thumbnail")]
        public async Task<ActionResult> GenerateThumbnail(int id, [FromBody] GenerateThumbnailRequest? request = null)
        {
            try
            {
                var frameLayout = await _frameLayoutService.GetFrameLayoutByIdAsync(id);
                if (frameLayout == null)
                    return NotFound(new { message = $"Frame layout with ID {id} not found" });

                var width = request?.Width ?? 300;
                var height = request?.Height ?? 200;

                // Create a temporary virtual screen ID for thumbnail
                var thumbnailVirtualScreenId = $"thumbnail_{id}_{Guid.NewGuid()}";

                var thumbnailData = await _puppeteerFrameEngine.GenerateThumbnail(
                    frameLayout,
                    thumbnailVirtualScreenId,
                    width,
                    height);

                // Save thumbnail to file system
                var thumbnailPath = await SaveThumbnailToFile(id, thumbnailData, "png");

                // Update database record
                frameLayout.ThumbnailPath = thumbnailPath;
                frameLayout.ThumbnailGeneratedAt = DateTime.UtcNow;
                frameLayout.HasThumbnail = true;
                frameLayout.ThumbnailFormat = "png";
                await _frameLayoutService.UpdateFrameLayoutAsync(frameLayout);

                // Clean up browser after thumbnail generation
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await _puppeteerFrameEngine.CloseBrowser(thumbnailVirtualScreenId);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[CONTROLLER_FRAMEENGINE_RENDERING] Error cleaning up thumbnail browser: {ex.Message}");
                    }
                });

                return Ok(new
                {
                    message = "Thumbnail generated successfully",
                    thumbnailPath = thumbnailPath,
                    size = thumbnailData.Length
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error generating thumbnail", error = ex.Message });
            }
        }

        [HttpPost("{id}/thumbnail-upload")]
        public async Task<ActionResult> UploadCustomThumbnail(int id, IFormFile thumbnail)
        {
            try
            {
                var frameLayout = await _frameLayoutService.GetFrameLayoutByIdAsync(id);
                if (frameLayout == null)
                    return NotFound(new { message = $"Frame layout with ID {id} not found" });

                if (thumbnail == null || thumbnail.Length == 0)
                    return BadRequest(new { message = "No thumbnail file provided" });

                // Validate file type
                var allowedTypes = new[] { "image/png", "image/jpeg", "image/jpg", "image/webp" };
                if (!allowedTypes.Contains(thumbnail.ContentType.ToLower()))
                    return BadRequest(new { message = "Invalid file type. Only PNG, JPEG, and WebP are allowed." });

                // Validate file size (max 5MB)
                if (thumbnail.Length > 5 * 1024 * 1024)
                    return BadRequest(new { message = "File size exceeds 5MB limit" });

                // Process and save the thumbnail
                using var stream = new MemoryStream();
                await thumbnail.CopyToAsync(stream);
                var thumbnailData = stream.ToArray();

                // Determine format from content type
                var format = thumbnail.ContentType.ToLower() switch
                {
                    "image/jpeg" or "image/jpg" => "jpg",
                    "image/webp" => "webp",
                    _ => "png"
                };

                // Save thumbnail to file system
                var thumbnailPath = await SaveThumbnailToFile(id, thumbnailData, format);

                // Update database record with override flag
                frameLayout.ThumbnailPath = thumbnailPath;
                frameLayout.ThumbnailGeneratedAt = DateTime.UtcNow;
                frameLayout.HasThumbnail = true;
                frameLayout.ThumbnailFormat = format;
                frameLayout.ThumbnailOverride = true; // Set override flag
                await _frameLayoutService.UpdateFrameLayoutAsync(frameLayout);

                return Ok(new
                {
                    message = "Custom thumbnail uploaded successfully",
                    thumbnailPath = thumbnailPath,
                    size = thumbnailData.Length
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error uploading custom thumbnail", error = ex.Message });
            }
        }

        [HttpPost("{id}/thumbnail-from-frontend")]
        public async Task<ActionResult> ProcessThumbnailFromFrontend(int id, [FromBody] ThumbnailFromFrontendRequest request)
        {
            try
            {
                var frameLayout = await _frameLayoutService.GetFrameLayoutByIdAsync(id);
                if (frameLayout == null)
                    return NotFound(new { message = $"Frame layout with ID {id} not found" });

                // Process the base64 image data
                var thumbnailData = await _frameEngine.ProcessThumbnailFromFrontend(request.ImageData);

                // Save thumbnail to file system
                var thumbnailPath = await SaveThumbnailToFile(id, thumbnailData, "png");

                // Update database record
                frameLayout.ThumbnailPath = thumbnailPath;
                frameLayout.ThumbnailGeneratedAt = DateTime.UtcNow;
                frameLayout.HasThumbnail = true;
                frameLayout.ThumbnailFormat = "png";
                await _frameLayoutService.UpdateFrameLayoutAsync(frameLayout);

                return Ok(new
                {
                    message = "Thumbnail processed successfully",
                    thumbnailPath = thumbnailPath,
                    size = thumbnailData.Length
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error processing thumbnail", error = ex.Message });
            }
        }

        // ============================================================================
        // THUMBNAIL RETRIEVAL AND DELETION
        // ============================================================================

        [HttpGet("{id}/thumbnail")]
        public async Task<ActionResult> GetThumbnail(int id)
        {
            try
            {
                var frameLayout = await _frameLayoutService.GetFrameLayoutByIdAsync(id);
                if (frameLayout == null)
                {
                    return NotFound(new { message = $"Frame layout with ID {id} not found" });
                }

                if (!frameLayout.HasThumbnail || string.IsNullOrEmpty(frameLayout.ThumbnailPath))
                {
                    return NotFound(new { message = "No thumbnail available for this frame layout" });
                }

                // All thumbnails are now served from the data directory
                var thumbnailPath = GetFullThumbnailPath(frameLayout.ThumbnailPath);

                if (!System.IO.File.Exists(thumbnailPath))
                {
                    // File missing, update database
                    frameLayout.HasThumbnail = false;
                    frameLayout.ThumbnailPath = null;
                    await _frameLayoutService.UpdateFrameLayoutAsync(frameLayout);
                    return NotFound(new { message = "Thumbnail file not found" });
                }

                var fileBytes = await System.IO.File.ReadAllBytesAsync(thumbnailPath);

                var contentType = frameLayout.ThumbnailFormat switch
                {
                    "jpg" or "jpeg" => "image/jpeg",
                    "webp" => "image/webp",
                    _ => "image/png"
                };

                return File(fileBytes, contentType, $"thumbnail-{id}.{frameLayout.ThumbnailFormat}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error retrieving thumbnail for ID {id}: {ex.Message}");
                return StatusCode(500, new { message = "Error retrieving thumbnail", error = ex.Message });
            }
        }

        [HttpDelete("{id}/thumbnail")]
        public async Task<ActionResult> DeleteThumbnail(int id)
        {
            try
            {
                var frameLayout = await _frameLayoutService.GetFrameLayoutByIdAsync(id);
                if (frameLayout == null)
                    return NotFound(new { message = $"Frame layout with ID {id} not found" });

                if (frameLayout.HasThumbnail && !string.IsNullOrEmpty(frameLayout.ThumbnailPath))
                {
                    await DeleteThumbnailFile(frameLayout.ThumbnailPath);
                }

                // Update database
                frameLayout.HasThumbnail = false;
                frameLayout.ThumbnailPath = null;
                frameLayout.ThumbnailGeneratedAt = null;
                frameLayout.ThumbnailOverride = false;
                await _frameLayoutService.UpdateFrameLayoutAsync(frameLayout);

                return Ok(new { message = "Thumbnail deleted successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error deleting thumbnail", error = ex.Message });
            }
        }

        // ============================================================================
        // HELPER METHODS
        // ============================================================================

        private string GetThumbnailsPath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath)
                          ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine", "thumbnails");
        }

        private async Task<string> SaveThumbnailToFile(int layoutId, byte[] thumbnailData, string format)
        {
            var thumbnailsDir = GetThumbnailsPath();
            Directory.CreateDirectory(thumbnailsDir);

            var filename = $"{layoutId}.{format}";
            var fullPath = Path.Combine(thumbnailsDir, filename);

            await System.IO.File.WriteAllBytesAsync(fullPath, thumbnailData);

            // Return relative path for database storage
            return Path.Combine("frameengine", "thumbnails", filename).Replace("\\", "/");
        }

        private string GetFullThumbnailPath(string relativePath)
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath)
                          ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, relativePath.Replace("/", Path.DirectorySeparatorChar.ToString()));
        }

        private Task DeleteThumbnailFile(string relativePath)
        {
            try
            {
                var fullPath = GetFullThumbnailPath(relativePath);
                if (System.IO.File.Exists(fullPath))
                {
                    System.IO.File.Delete(fullPath);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Warning: Failed to delete thumbnail file {relativePath}: {ex.Message}");
            }
            return Task.CompletedTask;
        }
    }

    // ============================================================================
    // DTOs
    // ============================================================================

    public class FramePreviewRequest
    {
        public Dictionary<string, object>? SensorData { get; set; }
    }

    public class GenerateThumbnailRequest
    {
        [Range(50, 1000)]
        public int? Width { get; set; } = 300;

        [Range(50, 1000)]
        public int? Height { get; set; } = 200;
    }

    public class ThumbnailFromFrontendRequest
    {
        [Required]
        public string ImageData { get; set; } = string.Empty;
    }
}