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

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("api/frameengine")]
    public class Controller_FrameEngine : ControllerBase
    {
        private readonly Service_Database_Manager_FrameEngine _frameLayoutService;
        private readonly Service_FrameEngine _frameEngine;
        private readonly Service_Manager_Connections _connectionManager;
        private readonly Service_Database_Manager_JunctionLinks _junctionLinksService;

        public Controller_FrameEngine(
            Service_Database_Manager_FrameEngine frameLayoutService,
            Service_FrameEngine frameEngine,
            Service_Manager_Connections connectionManager,
            Service_Database_Manager_JunctionLinks junctionLinksService)
        {
            _frameLayoutService = frameLayoutService;
            _frameEngine = frameEngine;
            _connectionManager = connectionManager;
            _junctionLinksService = junctionLinksService;
        }

        // Get all frame engine layouts
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

        // Get frame layout by ID
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

        // Create new frame layout
        [HttpPost]
        public async Task<ActionResult<CreateFrameLayoutResponse>> CreateFrameLayout([FromBody] CreateFrameLayoutRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(ModelState);
                }

                // Validate frame layout type
                if (!Model_Frame_Layout.GetSupportedFrameTypes().Contains(request.LayoutType, StringComparer.OrdinalIgnoreCase))
                {
                    return BadRequest(new { message = $"Invalid frame layout type: {request.LayoutType}" });
                }

                // Create new frame layout
                var newFrameLayout = new Model_Frame_Layout
                {
                    DisplayName = request.DisplayName,
                    Description = request.Description,
                    LayoutType = request.LayoutType,
                    Rows = request.Rows,
                    Columns = request.Columns,
                    Width = request.Width ?? Model_Frame_Layout.GetRecommendedDimensions(request.LayoutType).Width,
                    Height = request.Height ?? Model_Frame_Layout.GetRecommendedDimensions(request.LayoutType).Height,
                    BackgroundColor = request.BackgroundColor,
                    BackgroundImageUrl = request.BackgroundImageUrl,
                    IsTemplate = false,
                    IsDraft = true,
                    IsPublished = false,
                    Created = DateTime.UtcNow,
                    CreatedBy = "FrameEngine", // Could be updated to use actual user context
                    Version = "1.0"
                };

                // Validate the frame layout
                var validationErrors = newFrameLayout.Validate();
                if (validationErrors.Any())
                {
                    return BadRequest(new { message = "Validation failed", errors = validationErrors });
                }

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

        // Update frame layout
        [HttpPut("{id}")]
        public async Task<ActionResult> UpdateFrameLayout(int id, [FromBody] UpdateFrameLayoutRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(ModelState);
                }

                var existingFrameLayout = await _frameLayoutService.GetFrameLayoutByIdAsync(id);
                if (existingFrameLayout == null)
                {
                    return NotFound(new { message = $"Frame layout with ID {id} not found" });
                }

                // Update frame layout properties
                if (request.DisplayName != null)
                    existingFrameLayout.DisplayName = request.DisplayName;
                if (request.Description != null)
                    existingFrameLayout.Description = request.Description;
                if (request.LayoutType != null)
                    existingFrameLayout.LayoutType = request.LayoutType;
                if (request.Rows.HasValue)
                    existingFrameLayout.Rows = request.Rows;
                if (request.Columns.HasValue)
                    existingFrameLayout.Columns = request.Columns;
                if (request.Width.HasValue)
                    existingFrameLayout.Width = request.Width.Value;
                if (request.Height.HasValue)
                    existingFrameLayout.Height = request.Height.Value;
                if (request.BackgroundColor != null)
                    existingFrameLayout.BackgroundColor = request.BackgroundColor;
                if (request.BackgroundImageUrl != null)
                    existingFrameLayout.BackgroundImageUrl = request.BackgroundImageUrl;

                existingFrameLayout.LastModified = DateTime.UtcNow;

                // Validate the updated frame layout
                var validationErrors = existingFrameLayout.Validate();
                if (validationErrors.Any())
                {
                    return BadRequest(new { message = "Validation failed", errors = validationErrors });
                }

                await _frameLayoutService.UpdateFrameLayoutAsync(existingFrameLayout);

                return Ok(new { message = "Frame layout updated successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error updating frame layout", error = ex.Message });
            }
        }

        // Delete frame layout
        [HttpDelete("{id}")]
        public async Task<ActionResult> DeleteFrameLayout(int id)
        {
            try
            {
                var frameLayout = await _frameLayoutService.GetFrameLayoutByIdAsync(id);
                if (frameLayout == null)
                {
                    return NotFound(new { message = $"Frame layout with ID {id} not found" });
                }

                // Don't allow deletion of templates
                if (frameLayout.IsTemplate)
                {
                    return BadRequest(new { message = "Cannot delete template frame layouts" });
                }

                await _frameLayoutService.DeleteFrameLayoutAsync(id);

                return Ok(new { message = "Frame layout deleted successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error deleting frame layout", error = ex.Message });
            }
        }

        // Clone frame layout
        [HttpPost("clone")]
        public async Task<ActionResult<CreateFrameLayoutResponse>> CloneFrameLayout([FromBody] CloneFrameLayoutRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(ModelState);
                }

                var originalFrameLayout = await _frameLayoutService.GetFrameLayoutByIdAsync(request.OriginalId);
                if (originalFrameLayout == null)
                {
                    return NotFound(new { message = $"Original frame layout with ID {request.OriginalId} not found" });
                }

                var clonedLayoutId = await _frameLayoutService.CloneFrameLayoutAsync(request.OriginalId);

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

        // Restore all frame engine template layouts
        [HttpPost("restoreAll")]
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

        // Generate frame preview using new architecture
        [HttpPost("{id}/preview")]
        public async Task<ActionResult> GenerateFramePreview(int id, [FromBody] FramePreviewRequest request)
        {
            try
            {
                var frameLayout = await _frameLayoutService.GetFrameLayoutByIdAsync(id);
                if (frameLayout == null)
                {
                    return NotFound(new { message = $"Frame layout with ID {id} not found" });
                }

                // Generate frame using the new frame engine
                var frameData = _frameEngine.RenderFrame(frameLayout, request.SensorData ?? new Dictionary<string, object>());

                return File(frameData, "image/png", $"frame-preview-{id}.png");
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error generating frame preview", error = ex.Message });
            }
        }

        // Test frame rendering with sample data using new architecture
        [HttpGet("test-render")]
        public ActionResult TestFrameRender()
        {
            try
            {
                var frameData = _frameEngine.RenderTestFrame();

                return File(frameData, "image/png", "test-frame.png");
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error generating test frame", error = ex.Message });
            }
        }

        // Render frame with real sensor data (replacement for POC /sensors endpoint)
        [HttpGet("{id}/render")]
        public async Task<ActionResult> RenderFrameWithSensorData(int id, [FromQuery] int? junctionId, [FromQuery] int? linkId, [FromQuery] int? screenId, [FromQuery] int maxSensors = 10)
        {
            try
            {
                var frameLayout = await _frameLayoutService.GetFrameLayoutByIdAsync(id);
                if (frameLayout == null)
                {
                    return NotFound(new { message = $"Frame layout with ID {id} not found" });
                }

                // Get screen configuration if parameters provided
                Model_JunctionScreenLayout? screenConfig = null;
                if (linkId.HasValue && screenId.HasValue)
                {
                    var screenConfigs = await _junctionLinksService.GetJunctionScreenLayoutsByLinkIdAsync(linkId.Value);
                    screenConfig = screenConfigs.FirstOrDefault(sc => sc.DeviceScreenId == screenId.Value);
                }

                // Get live sensor data from your existing cache
                var sensorData = new Dictionary<string, object>();

                if (junctionId.HasValue)
                {
                    var sensors = await _connectionManager.GetSensorsByJunctionAsync(junctionId.Value);
                    foreach (var sensor in sensors.Take(maxSensors))
                    {
                        var value = sensor.Value?.ToString() ?? "N/A";
                        var unit = !string.IsNullOrEmpty(sensor.Unit) ? $" {sensor.Unit}" : "";
                        sensorData[sensor.SensorTag] = $"{value}{unit}";
                    }
                }
                else
                {
                    var allSensors = _connectionManager.GetAllSensors();
                    foreach (var sensor in allSensors.Take(maxSensors))
                    {
                        var value = sensor.Value?.ToString() ?? "N/A";
                        var unit = !string.IsNullOrEmpty(sensor.Unit) ? $" {sensor.Unit}" : "";
                        sensorData[sensor.SensorTag] = $"{value}{unit}";
                    }
                }

                if (!sensorData.Any())
                {
                    // Add dummy data if no sensors available
                    sensorData["Demo"] = "No live sensors - this is test data";
                    sensorData["Temperature"] = "22.5°C";
                    sensorData["Humidity"] = "48%";
                    sensorData["Pressure"] = "1013.2 hPa";
                }

                // Generate URL path if enabling URL access for the first time
                if (screenConfig?.EnableUrlAccess == true && string.IsNullOrEmpty(screenConfig.UrlPath) &&
                    junctionId.HasValue && linkId.HasValue && screenId.HasValue)
                {
                    screenConfig.UrlPath = Service_FrameEngine.GenerateUrlPath(junctionId.Value, linkId.Value, screenId.Value);
                    await _junctionLinksService.UpdateJunctionScreenLayoutAsync(screenConfig);
                }

                var frameData = _frameEngine.RenderFrame(frameLayout, sensorData, screenConfig, junctionId, linkId, screenId);
                return File(frameData, "image/png", $"sensor-frame-{id}.png");
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Sensor frame rendering failed", error = ex.Message });
            }
        }

        // Send frame directly to Pi device using layout from database
        [HttpPost("{id}/send-to-pi")]
        public async Task<ActionResult> SendFrameToPi(int id, [FromBody] SendFrameToDeviceRequest request)
        {
            try
            {
                var frameLayout = await _frameLayoutService.GetFrameLayoutByIdAsync(id);
                if (frameLayout == null)
                {
                    return NotFound(new { message = $"Frame layout with ID {id} not found" });
                }

                // Parse junction/link/screen IDs from request if provided
                int? junctionId = null, linkId = null, screenId = null;
                Model_JunctionScreenLayout? screenConfig = null;

                if (!string.IsNullOrEmpty(request.JunctionId))
                {
                    junctionId = int.Parse(request.JunctionId);
                }

                // Note: You might want to add LinkId and ScreenId to SendFrameToDeviceRequest
                // For now, we'll proceed without screen config

                // Get sensor data
                var sensorData = new Dictionary<string, object>();
                if (junctionId.HasValue)
                {
                    var sensors = await _connectionManager.GetSensorsByJunctionAsync(junctionId.Value);
                    foreach (var sensor in sensors.Take(request.MaxSensors ?? 10))
                    {
                        var value = sensor.Value?.ToString() ?? "N/A";
                        var unit = !string.IsNullOrEmpty(sensor.Unit) ? $" {sensor.Unit}" : "";
                        sensorData[sensor.SensorTag] = $"{value}{unit}";
                    }
                }

                // Override sensor data if provided in request
                if (request.SensorData != null && request.SensorData.Any())
                {
                    foreach (var kvp in request.SensorData)
                    {
                        sensorData[kvp.Key] = kvp.Value;
                    }
                }

                // Render frame using new frame engine with screen config
                var frameData = _frameEngine.RenderFrame(frameLayout, sensorData, screenConfig, junctionId, linkId, screenId);

                // Send to Pi
                using var httpClient = new HttpClient();
                var content = new ByteArrayContent(frameData);
                content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/octet-stream");

                var response = await httpClient.PostAsync($"http://{request.DeviceIpAddress}/api/display/frame", content);

                if (response.IsSuccessStatusCode)
                {
                    return Ok(new
                    {
                        message = "Frame sent successfully",
                        frameSize = frameData.Length,
                        layoutUsed = frameLayout.DisplayName,
                        layoutType = frameLayout.LayoutType
                    });
                }
                else
                {
                    return BadRequest($"Failed to send frame to device: {response.StatusCode}");
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Send to device failed", error = ex.Message });
            }
        }

        // Quick render endpoint for backward compatibility (replacement for POC /test)
        [HttpGet("quick-render/{layoutType}")]
        public async Task<ActionResult> QuickRender(string layoutType)
        {
            try
            {
                // Find a template of the requested type
                var templates = await _frameLayoutService.GetFrameLayoutsByTypeAsync(layoutType.ToUpperInvariant());
                var template = templates.FirstOrDefault(t => t.IsTemplate);

                if (template == null)
                {
                    return NotFound(new { message = $"No template found for layout type: {layoutType}" });
                }

                // Use test data
                var testData = new Dictionary<string, object>
                {
                    ["Temperature"] = "23.5°C",
                    ["Humidity"] = "45%",
                    ["Pressure"] = "1013.2 hPa",
                    ["Light"] = "750 lux",
                    ["Motion"] = "No motion",
                    ["Battery"] = "98%"
                };

                var frameData = _frameEngine.RenderFrame(template, testData);
                return File(frameData, "image/png", $"quick-{layoutType}.png");
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Quick render failed", error = ex.Message });
            }
        }

        // New endpoint to get accessible URL for a screen configuration
        [HttpGet("screen-config/{screenConfigId}/url")]
        public async Task<ActionResult> GetScreenConfigUrl(int screenConfigId, [FromQuery] string? baseUrl = null)
        {
            try
            {
                var screenConfig = await _junctionLinksService.GetJunctionScreenLayoutByIdAsync(screenConfigId);
                if (screenConfig == null)
                {
                    return NotFound(new { message = $"Screen configuration with ID {screenConfigId} not found" });
                }

                if (!screenConfig.EnableUrlAccess)
                {
                    return Ok(new { message = "URL access is disabled for this screen configuration", url = "" });
                }

                // Use provided base URL or construct from request
                var requestBaseUrl = baseUrl ?? $"{Request.Scheme}://{Request.Host}";
                var url = Service_FrameEngine.GenerateFrameUrl(requestBaseUrl, screenConfig);

                return Ok(new { url, enabled = screenConfig.EnableUrlAccess, urlPath = screenConfig.UrlPath });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error retrieving screen configuration URL", error = ex.Message });
            }
        }

        // Clean up old frame files
        [HttpPost("cleanup")]
        public async Task<ActionResult> CleanupOldFrames([FromBody] CleanupFramesRequest? request = null)
        {
            try
            {
                // Default to cleaning up files older than 24 hours
                var maxAge = request?.MaxAgeHours.HasValue == true
                    ? TimeSpan.FromHours(request.MaxAgeHours.Value)
                    : TimeSpan.FromHours(24);

                var framesDirectory = System.IO.Path.Combine(System.IO.Directory.GetCurrentDirectory(), "frames");

                if (!System.IO.Directory.Exists(framesDirectory))
                {
                    return Ok(new
                    {
                        message = "Frames directory does not exist",
                        filesDeleted = 0,
                        totalSize = 0
                    });
                }

                var files = System.IO.Directory.GetFiles(framesDirectory, "*.png");
                var cutoffTime = DateTime.Now - maxAge;
                var deletedFiles = 0;
                long totalSizeDeleted = 0;
                var errors = new List<string>();

                // Handle dry run
                if (request?.DryRun == true)
                {
                    var filesToDelete = new List<string>();
                    foreach (var filePath in files)
                    {
                        var fileInfo = new System.IO.FileInfo(filePath);
                        if (fileInfo.LastWriteTime < cutoffTime)
                        {
                            filesToDelete.Add(System.IO.Path.GetFileName(filePath));
                            totalSizeDeleted += fileInfo.Length;
                            deletedFiles++;
                        }
                    }

                    return Ok(new
                    {
                        message = "Dry run completed - no files were actually deleted",
                        filesWouldBeDeleted = deletedFiles,
                        totalSizeWouldBeDeleted = totalSizeDeleted,
                        totalSizeWouldBeDeletedMB = Math.Round(totalSizeDeleted / 1024.0 / 1024.0, 2),
                        maxAgeHours = maxAge.TotalHours,
                        filesToDelete = filesToDelete
                    });
                }

                // Delete old files
                foreach (var filePath in files)
                {
                    try
                    {
                        var fileInfo = new System.IO.FileInfo(filePath);

                        // Check if file is older than cutoff time
                        if (fileInfo.LastWriteTime < cutoffTime)
                        {
                            totalSizeDeleted += fileInfo.Length;
                            System.IO.File.Delete(filePath);
                            deletedFiles++;
                        }
                    }
                    catch (Exception ex)
                    {
                        errors.Add($"Failed to delete {System.IO.Path.GetFileName(filePath)}: {ex.Message}");
                    }
                }

                // Optionally clean up frames that are no longer referenced in database
                if (request?.RemoveUnreferencedFiles == true)
                {
                    var referencedFiles = new HashSet<string>();

                    // Get all screen configurations with URL paths
                    var allConfigs = await GetAllScreenConfigurationsWithUrlPaths();
                    foreach (var config in allConfigs)
                    {
                        if (!string.IsNullOrEmpty(config.UrlPath))
                        {
                            referencedFiles.Add(config.UrlPath.ToLowerInvariant());
                        }
                    }

                    // Delete unreferenced files
                    var remainingFiles = System.IO.Directory.GetFiles(framesDirectory, "*.png");
                    foreach (var filePath in remainingFiles)
                    {
                        try
                        {
                            var fileName = System.IO.Path.GetFileName(filePath).ToLowerInvariant();
                            if (!referencedFiles.Contains(fileName))
                            {
                                var fileInfo = new System.IO.FileInfo(filePath);
                                totalSizeDeleted += fileInfo.Length;
                                System.IO.File.Delete(filePath);
                                deletedFiles++;
                            }
                        }
                        catch (Exception ex)
                        {
                            errors.Add($"Failed to delete unreferenced {System.IO.Path.GetFileName(filePath)}: {ex.Message}");
                        }
                    }
                }

                var response = new
                {
                    message = $"Cleanup completed successfully",
                    filesDeleted = deletedFiles,
                    totalSizeDeleted = totalSizeDeleted,
                    totalSizeDeletedMB = Math.Round(totalSizeDeleted / 1024.0 / 1024.0, 2),
                    maxAgeHours = maxAge.TotalHours,
                    removeUnreferencedFiles = request?.RemoveUnreferencedFiles ?? false,
                    errors = errors.Any() ? errors : null
                };

                return Ok(response);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error during cleanup", error = ex.Message });
            }
        }

        #region Private Helper Methods

        private static FrameLayoutDto MapToFrameLayoutDto(Model_Frame_Layout frameLayout)
        {
            return new FrameLayoutDto
            {
                Id = frameLayout.Id.ToString(),
                DisplayName = frameLayout.DisplayName ?? "Unnamed Frame Layout",
                Description = frameLayout.Description,
                LayoutType = frameLayout.LayoutType,
                Rows = frameLayout.Rows,
                Columns = frameLayout.Columns,
                IsTemplate = frameLayout.IsTemplate,
                Width = frameLayout.Width,
                Height = frameLayout.Height,
                BackgroundColor = frameLayout.BackgroundColor,
                BackgroundImageUrl = frameLayout.BackgroundImageUrl,
                Created = frameLayout.Created,
                LastModified = frameLayout.LastModified
            };
        }

        // Helper method to get all screen configurations with URL paths
        private async Task<List<Model_JunctionScreenLayout>> GetAllScreenConfigurationsWithUrlPaths()
        {
            try
            {
                // This is a simplified approach - you might want to optimize this query
                // by adding a method to your database service to get all configs with URL paths
                var allConfigs = new List<Model_JunctionScreenLayout>();

                // You would need to implement this in your database service
                // For now, this is a placeholder that would need to be implemented
                // based on your specific database structure

                return allConfigs;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error getting screen configurations: {ex.Message}");
                return new List<Model_JunctionScreenLayout>();
            }
        }

        #endregion
    }

    #region DTOs and Request Models

    public class FrameLayoutDto
    {
        public string Id { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string LayoutType { get; set; } = string.Empty;
        public int? Rows { get; set; }
        public int? Columns { get; set; }
        public bool IsTemplate { get; set; }
        public string? BackgroundColor { get; set; }
        public string? BackgroundImageUrl { get; set; }

        [Range(1, 10000)]
        public int? Width { get; set; }

        [Range(1, 10000)]
        public int? Height { get; set; }

        public DateTime Created { get; set; }
        public DateTime? LastModified { get; set; }
    }

    public class CreateFrameLayoutRequest
    {
        [Required]
        [StringLength(100, MinimumLength = 1)]
        public string DisplayName { get; set; } = string.Empty;

        [StringLength(500)]
        public string? Description { get; set; }

        [Required]
        public string LayoutType { get; set; } = string.Empty;

        [Range(1, 100)]
        public int? Rows { get; set; } = 2;

        [Range(1, 100)]
        public int? Columns { get; set; } = 2;

        [Range(1, 10000)]
        public int? Width { get; set; }

        [Range(1, 10000)]
        public int? Height { get; set; }

        public string? BackgroundColor { get; set; }
        public string? BackgroundImageUrl { get; set; }
    }

    public class UpdateFrameLayoutRequest
    {
        [StringLength(100, MinimumLength = 1)]
        public string? DisplayName { get; set; }

        [StringLength(500)]
        public string? Description { get; set; }

        public string? LayoutType { get; set; }

        [Range(1, 100)]
        public int? Rows { get; set; }

        [Range(1, 100)]
        public int? Columns { get; set; }

        [Range(1, 10000)]
        public int? Width { get; set; }

        [Range(1, 10000)]
        public int? Height { get; set; }

        public string? BackgroundColor { get; set; }
        public string? BackgroundImageUrl { get; set; }
    }

    public class CloneFrameLayoutRequest
    {
        [Required]
        public int OriginalId { get; set; }
    }

    public class CreateFrameLayoutResponse
    {
        public int Id { get; set; }
        public string Message { get; set; } = string.Empty;
    }

    public class FramePreviewRequest
    {
        public Dictionary<string, object>? SensorData { get; set; }
    }

    public class SendFrameToDeviceRequest
    {
        [Required]
        public string DeviceIpAddress { get; set; } = "";
        public string? JunctionId { get; set; }
        public int? MaxSensors { get; set; }
        public Dictionary<string, object>? SensorData { get; set; }
    }

    public class CleanupFramesRequest
    {
        /// <summary>
        /// Maximum age in hours for files to keep. Files older than this will be deleted.
        /// Default is 24 hours if not specified.
        /// </summary>
        [Range(0.1, 8760)] // Minimum 6 minutes, maximum 1 year
        public double? MaxAgeHours { get; set; }

        /// <summary>
        /// If true, also removes frame files that are not referenced by any screen configuration.
        /// Default is false.
        /// </summary>
        public bool? RemoveUnreferencedFiles { get; set; }

        /// <summary>
        /// If true, performs a dry run without actually deleting files.
        /// Returns what would be deleted. Default is false.
        /// </summary>
        public bool? DryRun { get; set; }
    }

    #endregion
}