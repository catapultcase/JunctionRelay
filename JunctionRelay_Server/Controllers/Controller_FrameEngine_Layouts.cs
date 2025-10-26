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
using JunctionRelayServer.Models;
using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using System.Runtime.InteropServices;

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("api/frameengine")]
    public class Controller_FrameEngine_Layouts : ControllerBase
    {
        private readonly Service_Database_Manager_FrameEngine _frameLayoutService;
        private readonly Service_Database_Manager_JunctionLinks _junctionLinksService;

        public Controller_FrameEngine_Layouts(
            Service_Database_Manager_FrameEngine frameLayoutService,
            Service_Database_Manager_JunctionLinks junctionLinksService)
        {
            _frameLayoutService = frameLayoutService;
            _junctionLinksService = junctionLinksService;
        }

        // ============================================================================
        // PLATFORM INFORMATION
        // ============================================================================

        [HttpGet("platform")]
        public ActionResult GetPlatform()
        {
            try
            {
                var isWindows = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
                var isLinux = RuntimeInformation.IsOSPlatform(OSPlatform.Linux);
                var isMacOS = RuntimeInformation.IsOSPlatform(OSPlatform.OSX);

                var platform = "Unknown";
                if (isWindows) platform = "Windows";
                else if (isLinux) platform = "Linux";
                else if (isMacOS) platform = "macOS";

                return Ok(new
                {
                    platform = platform,
                    isWindows = isWindows,
                    isLinux = isLinux,
                    isMacOS = isMacOS,
                    osDescription = RuntimeInformation.OSDescription,
                    architecture = RuntimeInformation.OSArchitecture.ToString()
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error detecting platform", error = ex.Message });
            }
        }

        // ============================================================================
        // LAYOUT CRUD OPERATIONS
        // ============================================================================

        [HttpGet]
        public async Task<ActionResult<IEnumerable<FrameLayoutDto>>> GetFrameLayouts()
        {
            try
            {
                var frameLayouts = await _frameLayoutService.GetAllFrameLayoutsAsync();
                var dtos = frameLayouts.Select(MapToFrameLayoutDto).ToList();
                return Ok(dtos);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error retrieving frame engine layouts", error = ex.Message });
            }
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<FrameLayoutDto>> GetFrameLayout(int id)
        {
            try
            {
                var frameLayout = await _frameLayoutService.GetFrameLayoutByIdAsync(id);
                if (frameLayout == null)
                {
                    return NotFound(new { message = $"Frame layout with ID {id} not found" });
                }

                return Ok(MapToFrameLayoutDto(frameLayout));
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error retrieving frame layout", error = ex.Message });
            }
        }

        [HttpPost]
        public async Task<ActionResult<CreateFrameLayoutResponse>> CreateFrameLayout([FromBody] CreateFrameLayoutRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                var errors = ValidateFrameLayout(request.DisplayName, request.LayoutType, request.BackgroundType, request.Width, request.Height);

                if (errors.Count > 0)
                    return BadRequest(new { message = "Validation failed", errors });

                var newFrameLayout = new Model_Frame_Layout
                {
                    DisplayName = request.DisplayName.Trim(),
                    Description = request.Description?.Trim(),
                    LayoutType = string.IsNullOrWhiteSpace(request.LayoutType) ? "PRE_RENDERED_IMAGE" : request.LayoutType.ToUpperInvariant(),
                    Width = request.Width ?? 792,
                    Height = request.Height ?? 272,
                    Orientation = string.IsNullOrWhiteSpace(request.Orientation) ? "landscape" : request.Orientation.ToLowerInvariant(),
                    BackgroundType = string.IsNullOrWhiteSpace(request.BackgroundType) ? "color" : request.BackgroundType.ToLowerInvariant(),
                    BackgroundColor = request.BackgroundColor ?? "#FFFFFF",
                    BackgroundImageUrl = request.BackgroundImageUrl?.Trim(),
                    BackgroundImageFit = request.BackgroundImageFit ?? "cover",
                    BackgroundVideoUrl = request.BackgroundVideoUrl?.Trim(),
                    BackgroundVideoFit = request.BackgroundVideoFit ?? "cover",
                    VideoLoop = request.VideoLoop ?? true,
                    VideoMuted = request.VideoMuted ?? true,
                    VideoAutoplay = request.VideoAutoplay ?? true,
                    BackgroundOpacity = Math.Clamp(request.BackgroundOpacity ?? 1.0, 0.0, 1.0),
                    RiveFile = request.RiveFile?.Trim(),
                    JsonFrameConfig = SanitizeJson(request.JsonFrameConfig) ?? "{}",
                    JsonFrameElements = SanitizeJson(request.JsonFrameElements) ?? "[]",

                    // Flags & metadata
                    IsTemplate = false,
                    IsDraft = true,
                    IsPublished = false,
                    Created = DateTime.UtcNow,
                    LastModified = DateTime.UtcNow,
                    CreatedBy = "FrameEngine",
                    Version = "1.0"
                };

                var frameLayoutId = await _frameLayoutService.CreateFrameLayoutAsync(newFrameLayout);

                return Ok(new CreateFrameLayoutResponse
                {
                    Id = frameLayoutId,
                    Message = "Frame layout created successfully"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error creating frame layout", error = ex.Message });
            }
        }

        [HttpPut("{id}")]
        public async Task<ActionResult> UpdateFrameLayout(int id, [FromBody] UpdateFrameLayoutRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                var existing = await _frameLayoutService.GetFrameLayoutByIdAsync(id);
                if (existing == null)
                    return NotFound(new { message = $"Frame layout with ID {id} not found" });

                // Update properties only if provided
                if (!string.IsNullOrWhiteSpace(request.DisplayName))
                    existing.DisplayName = request.DisplayName.Trim();
                if (request.Description != null)
                    existing.Description = request.Description.Trim();
                if (!string.IsNullOrWhiteSpace(request.LayoutType))
                    existing.LayoutType = request.LayoutType.ToUpperInvariant();
                if (request.Width.HasValue)
                    existing.Width = request.Width.Value;
                if (request.Height.HasValue)
                    existing.Height = request.Height.Value;
                if (!string.IsNullOrWhiteSpace(request.Orientation))
                    existing.Orientation = request.Orientation.ToLowerInvariant();
                if (!string.IsNullOrWhiteSpace(request.BackgroundType))
                    existing.BackgroundType = request.BackgroundType.ToLowerInvariant();
                if (request.BackgroundColor != null)
                    existing.BackgroundColor = request.BackgroundColor;
                if (request.BackgroundImageUrl != null)
                    existing.BackgroundImageUrl = request.BackgroundImageUrl.Trim();
                if (request.BackgroundImageFit != null)
                    existing.BackgroundImageFit = request.BackgroundImageFit;
                if (request.BackgroundVideoUrl != null)
                    existing.BackgroundVideoUrl = request.BackgroundVideoUrl.Trim();
                if (request.BackgroundVideoFit != null)
                    existing.BackgroundVideoFit = request.BackgroundVideoFit;
                if (request.VideoLoop.HasValue)
                    existing.VideoLoop = request.VideoLoop.Value;
                if (request.VideoMuted.HasValue)
                    existing.VideoMuted = request.VideoMuted.Value;
                if (request.VideoAutoplay.HasValue)
                    existing.VideoAutoplay = request.VideoAutoplay.Value;
                if (request.BackgroundOpacity.HasValue)
                    existing.BackgroundOpacity = Math.Clamp(request.BackgroundOpacity.Value, 0.0, 1.0);
                if (request.RiveFile != null)
                    existing.RiveFile = request.RiveFile.Trim();
                if (request.ThumbnailOverride.HasValue)
                    existing.ThumbnailOverride = request.ThumbnailOverride.Value;

                if (request.JsonFrameConfig != null)
                {
                    var sanitizedConfig = SanitizeJson(request.JsonFrameConfig);
                    if (sanitizedConfig != null)
                    {
                        existing.JsonFrameConfig = sanitizedConfig;
                    }
                }

                if (request.JsonFrameConfigRuntime != null)
                {
                    var sanitizedRuntimeConfig = SanitizeJson(request.JsonFrameConfigRuntime);
                    if (sanitizedRuntimeConfig != null)
                    {
                        existing.JsonFrameConfigRuntime = sanitizedRuntimeConfig;
                    }
                }

                if (request.JsonFrameElements != null)
                    existing.JsonFrameElements = SanitizeJson(request.JsonFrameElements) ?? existing.JsonFrameElements;

                var errors = ValidateFrameLayout(existing.DisplayName, existing.LayoutType, existing.BackgroundType, existing.Width, existing.Height);
                if (errors.Count > 0)
                    return BadRequest(new { message = "Validation failed", errors });

                existing.LastModified = DateTime.UtcNow;

                await _frameLayoutService.UpdateFrameLayoutAsync(existing);
                return Ok(new { message = "Frame layout updated successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error updating frame layout", error = ex.Message });
            }
        }

        [HttpDelete("{id}")]
        public async Task<ActionResult> DeleteFrameLayout(int id)
        {
            try
            {
                var frameLayout = await _frameLayoutService.GetFrameLayoutByIdAsync(id);
                if (frameLayout == null)
                    return NotFound(new { message = $"Frame layout with ID {id} not found" });

                if (frameLayout.IsTemplate)
                    return BadRequest(new { message = "Cannot delete template frame layouts" });

                // Check if layout is in use
                var isInUse = await IsFrameLayoutInUse(id);
                if (isInUse)
                    return BadRequest(new { message = "Cannot delete frame layout as it is currently in use" });

                await _frameLayoutService.DeleteFrameLayoutAsync(id);
                return Ok(new { message = "Frame layout deleted successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error deleting frame layout", error = ex.Message });
            }
        }

        [HttpPost("clone")]
        public async Task<ActionResult<CreateFrameLayoutResponse>> CloneFrameLayout([FromBody] CloneFrameLayoutRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                var original = await _frameLayoutService.GetFrameLayoutByIdAsync(request.OriginalId);
                if (original == null)
                    return NotFound(new { message = $"Original frame layout with ID {request.OriginalId} not found" });

                var clonedLayoutId = await _frameLayoutService.CloneFrameLayoutAsync(request.OriginalId, request.NewName);

                return Ok(new CreateFrameLayoutResponse
                {
                    Id = clonedLayoutId,
                    Message = "Frame layout cloned successfully"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error cloning frame layout", error = ex.Message });
            }
        }

        [HttpPost("restore-templates")]
        public async Task<ActionResult> RestoreAllFrameTemplates()
        {
            try
            {
                await _frameLayoutService.RestoreDefaultTemplatesAsync();
                return Ok(new { message = "All frame engine templates have been restored or reset to defaults" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error restoring frame engine templates", error = ex.Message });
            }
        }

        // ============================================================================
        // HELPER METHODS
        // ============================================================================

        private static FrameLayoutDto MapToFrameLayoutDto(Model_Frame_Layout frameLayout)
        {
            return new FrameLayoutDto
            {
                Id = frameLayout.Id.ToString(),
                DisplayName = frameLayout.DisplayName ?? "Unnamed Frame Layout",
                Description = frameLayout.Description,
                LayoutType = frameLayout.LayoutType,
                IsTemplate = frameLayout.IsTemplate,
                IsDraft = frameLayout.IsDraft,
                IsPublished = frameLayout.IsPublished,
                Width = frameLayout.Width,
                Height = frameLayout.Height,
                Orientation = frameLayout.Orientation,
                BackgroundType = frameLayout.BackgroundType,
                BackgroundColor = frameLayout.BackgroundColor,
                BackgroundImageUrl = frameLayout.BackgroundImageUrl,
                BackgroundImageFit = frameLayout.BackgroundImageFit,
                BackgroundVideoUrl = frameLayout.BackgroundVideoUrl,
                BackgroundVideoFit = frameLayout.BackgroundVideoFit,
                VideoLoop = frameLayout.VideoLoop,
                VideoMuted = frameLayout.VideoMuted,
                VideoAutoplay = frameLayout.VideoAutoplay,
                BackgroundOpacity = frameLayout.BackgroundOpacity,
                RiveFile = frameLayout.RiveFile,
                JsonFrameConfig = frameLayout.JsonFrameConfig,
                JsonFrameConfigRuntime = frameLayout.JsonFrameConfigRuntime,
                JsonFrameElements = frameLayout.JsonFrameElements,
                Created = frameLayout.Created,
                LastModified = frameLayout.LastModified,
                HasThumbnail = frameLayout.HasThumbnail,
                ThumbnailPath = frameLayout.ThumbnailPath,
                ThumbnailGeneratedAt = frameLayout.ThumbnailGeneratedAt,
                ThumbnailOverride = frameLayout.ThumbnailOverride
            };
        }

        private static List<string> ValidateFrameLayout(
            string? displayName,
            string? layoutType,
            string? backgroundType,
            int? width,
            int? height)
        {
            var errors = new List<string>();

            if (string.IsNullOrWhiteSpace(displayName))
                errors.Add("DisplayName is required.");

            if (string.IsNullOrWhiteSpace(layoutType))
                errors.Add("LayoutType is required.");
            else if (!IsValidLayoutType(layoutType))
                errors.Add($"Invalid LayoutType: {layoutType}. Valid types are: PRE_RENDERED_IMAGE, COMPOSITE_MODE");

            if (!string.IsNullOrWhiteSpace(backgroundType) && !IsValidBackgroundType(backgroundType))
                errors.Add($"Invalid BackgroundType: {backgroundType}. Valid types are: none, color, image, url, rive, video");

            if (width.HasValue && width <= 0)
                errors.Add("Width must be greater than 0.");

            if (height.HasValue && height <= 0)
                errors.Add("Height must be greater than 0.");

            return errors;
        }

        private static bool IsValidLayoutType(string layoutType)
        {
            var validTypes = new[] { "PRE_RENDERED_IMAGE", "COMPOSITE_MODE" };
            return validTypes.Contains(layoutType.ToUpperInvariant());
        }

        private static bool IsValidBackgroundType(string backgroundType)
        {
            var validTypes = new[] { "none", "color", "image", "url", "rive", "video" };
            return validTypes.Contains(backgroundType.ToLowerInvariant());
        }

        private static string? SanitizeJson(string? json)
        {
            if (string.IsNullOrWhiteSpace(json))
                return null;

            try
            {
                // Parse and reformat to ensure valid JSON
                var doc = JsonDocument.Parse(json);
                return JsonSerializer.Serialize(doc.RootElement, new JsonSerializerOptions { WriteIndented = false });
            }
            catch (JsonException)
            {
                return null; // Invalid JSON
            }
        }

        private async Task<bool> IsFrameLayoutInUse(int layoutId)
        {
            try
            {
                // Check if any screen configurations reference this layout
                var screenConfigs = await GetAllScreenConfigurationsWithUrlPaths();
                return screenConfigs.Any(config => config.FrameLayoutId == layoutId);
            }
            catch
            {
                return false; // Assume not in use if we can't check
            }
        }

        private Task<List<Model_JunctionScreenLayout>> GetAllScreenConfigurationsWithUrlPaths()
        {
            try
            {
                // This should be implemented to get all screen configurations
                // For now, return empty list as placeholder
                return Task.FromResult(new List<Model_JunctionScreenLayout>());
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error getting screen configurations: {ex.Message}");
                return Task.FromResult(new List<Model_JunctionScreenLayout>());
            }
        }
    }

    // ============================================================================
    // DTOs AND REQUEST/RESPONSE MODELS
    // ============================================================================

    public class FrameLayoutDto
    {
        public string Id { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string LayoutType { get; set; } = string.Empty;

        public bool IsTemplate { get; set; }
        public bool IsDraft { get; set; }
        public bool IsPublished { get; set; }

        [Range(1, 10000)]
        public int? Width { get; set; }

        [Range(1, 10000)]
        public int? Height { get; set; }

        public string Orientation { get; set; } = "landscape";

        public string BackgroundType { get; set; } = "color";
        public string? BackgroundColor { get; set; }
        public string? BackgroundImageUrl { get; set; }
        public string? BackgroundImageFit { get; set; }
        public string? BackgroundVideoUrl { get; set; }
        public string? BackgroundVideoFit { get; set; }
        public bool VideoLoop { get; set; } = true;
        public bool VideoMuted { get; set; } = true;
        public bool VideoAutoplay { get; set; } = true;
        public double BackgroundOpacity { get; set; } = 1.0;

        public string? RiveFile { get; set; }
        public string? JsonFrameConfig { get; set; }
        public string? JsonFrameConfigRuntime { get; set; }
        public string? JsonFrameElements { get; set; }

        public DateTime Created { get; set; }
        public DateTime? LastModified { get; set; }
        public bool HasThumbnail { get; set; }
        public string? ThumbnailPath { get; set; }
        public DateTime? ThumbnailGeneratedAt { get; set; }
        public bool ThumbnailOverride { get; set; } = false;
    }

    public class CreateFrameLayoutRequest
    {
        [Required]
        [StringLength(100, MinimumLength = 1)]
        public string DisplayName { get; set; } = string.Empty;

        [StringLength(500)]
        public string? Description { get; set; }

        [Required]
        public string LayoutType { get; set; } = "PRE_RENDERED_IMAGE";

        [Range(1, 10000)]
        public int? Width { get; set; }

        [Range(1, 10000)]
        public int? Height { get; set; }

        public string? Orientation { get; set; } = "landscape";

        public string? BackgroundType { get; set; } = "color";
        public string? BackgroundColor { get; set; } = "#FFFFFF";
        public string? BackgroundImageUrl { get; set; }
        public string? BackgroundImageFit { get; set; }
        public string? BackgroundVideoUrl { get; set; }
        public string? BackgroundVideoFit { get; set; }
        public bool? VideoLoop { get; set; }
        public bool? VideoMuted { get; set; }
        public bool? VideoAutoplay { get; set; }
        [Range(0.0, 1.0)]
        public double? BackgroundOpacity { get; set; } = 1.0;

        public string? RiveFile { get; set; }
        public string? JsonFrameConfig { get; set; }
        public string? JsonFrameElements { get; set; }
    }

    public class UpdateFrameLayoutRequest
    {
        [StringLength(100, MinimumLength = 1)]
        public string? DisplayName { get; set; }

        [StringLength(500)]
        public string? Description { get; set; }

        public string? LayoutType { get; set; }

        [Range(1, 10000)]
        public int? Width { get; set; }

        [Range(1, 10000)]
        public int? Height { get; set; }

        public string? Orientation { get; set; }

        public string? BackgroundType { get; set; }
        public string? BackgroundColor { get; set; }
        public string? BackgroundImageUrl { get; set; }
        public string? BackgroundImageFit { get; set; }
        public string? BackgroundVideoUrl { get; set; }
        public string? BackgroundVideoFit { get; set; }
        public bool? VideoLoop { get; set; }
        public bool? VideoMuted { get; set; }
        public bool? VideoAutoplay { get; set; }
        [Range(0.0, 1.0)]
        public double? BackgroundOpacity { get; set; }

        public string? RiveFile { get; set; }
        public string? JsonFrameConfig { get; set; }
        public string? JsonFrameConfigRuntime { get; set; }
        public string? JsonFrameElements { get; set; }
        public bool? ThumbnailOverride { get; set; }
    }

    public class CloneFrameLayoutRequest
    {
        [Required]
        public int OriginalId { get; set; }

        [StringLength(100)]
        public string? NewName { get; set; }
    }

    public class CreateFrameLayoutResponse
    {
        public int Id { get; set; }
        public string Message { get; set; } = string.Empty;
    }
}