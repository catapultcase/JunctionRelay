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
using JunctionRelayServer.Utils;


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
        private readonly IWebHostEnvironment _webHostEnvironment;
        private readonly DatabasePathProvider _dbPathProvider;

        public Controller_FrameEngine(
            Service_Database_Manager_FrameEngine frameLayoutService,
            Service_FrameEngine frameEngine,
            Service_Manager_Connections connectionManager,
            Service_Database_Manager_JunctionLinks junctionLinksService,
            IWebHostEnvironment webHostEnvironment,
            DatabasePathProvider dbPathProvider)
        {
            _frameLayoutService = frameLayoutService;
            _frameEngine = frameEngine;
            _connectionManager = connectionManager;
            _junctionLinksService = junctionLinksService;
            _webHostEnvironment = webHostEnvironment;
            _dbPathProvider = dbPathProvider;
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
                    BackgroundImageData = request.BackgroundImageData,
                    BackgroundOpacity = Math.Clamp(request.BackgroundOpacity ?? 1.0, 0.0, 1.0),
                    RiveFile = request.RiveFile?.Trim(),
                    RiveEmbedInPayload = request.RiveEmbedInPayload,
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

        // Update frame layout - UPDATED: No embedding during save, just store the flag
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
                if (request.BackgroundImageData != null)
                    existing.BackgroundImageData = request.BackgroundImageData;
                if (request.BackgroundOpacity.HasValue)
                    existing.BackgroundOpacity = Math.Clamp(request.BackgroundOpacity.Value, 0.0, 1.0);
                if (request.RiveFile != null)
                    existing.RiveFile = request.RiveFile.Trim();
                if (request.RiveEmbedInPayload.HasValue)
                    existing.RiveEmbedInPayload = request.RiveEmbedInPayload.Value;

                // Handle JsonFrameConfig - NO embedding during save
                if (request.JsonFrameConfig != null)
                {
                    var sanitizedConfig = SanitizeJson(request.JsonFrameConfig);
                    if (sanitizedConfig != null)
                    {
                        existing.JsonFrameConfig = sanitizedConfig;
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

        // Delete frame layout
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

        // Clone frame layout
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

        // Restore all frame engine template layouts
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

        [HttpGet("rive-files")]
        public ActionResult<IEnumerable<RiveFileInfoDto>> GetRiveFiles()
        {
            try
            {
                var templatesPath = GetRiveTemplatesPath();
                var userPath = GetRiveUserPath();
                Directory.CreateDirectory(userPath);

                // Collect files, user overrides template if same filename
                var filesByName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

                if (Directory.Exists(templatesPath))
                {
                    foreach (var p in Directory.EnumerateFiles(templatesPath, "*.riv"))
                        filesByName[Path.GetFileName(p)] = p;
                }

                foreach (var p in Directory.EnumerateFiles(userPath, "*.riv"))
                    filesByName[Path.GetFileName(p)] = p;

                var results = filesByName.Select(kvp =>
                {
                    var fi = new FileInfo(kvp.Value);
                    return new RiveFileInfoDto
                    {
                        Filename = kvp.Key,
                        DisplayName = Path.GetFileNameWithoutExtension(kvp.Key),
                        UploadDate = fi.CreationTime,
                        FileSize = fi.Length
                    };
                })
                .OrderByDescending(r => r.UploadDate)
                .ToList();

                return Ok(results);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error retrieving Rive files", error = ex.Message });
            }
        }


        // Upload new Rive file
        [HttpPost("upload-rive")]
        public async Task<ActionResult<RiveUploadResponse>> UploadRiveFile(IFormFile riveFile)
        {
            try
            {
                if (riveFile == null || riveFile.Length == 0)
                    return BadRequest(new { message = "No file provided" });

                if (!riveFile.FileName.ToLowerInvariant().EndsWith(".riv"))
                    return BadRequest(new { message = "File must have .riv extension" });

                // Validate file size (max 50MB)
                if (riveFile.Length > 50 * 1024 * 1024)
                    return BadRequest(new { message = "File size exceeds 50MB limit" });

                var uploadsPath = GetRiveUserPath();
                Directory.CreateDirectory(uploadsPath);

                var originalName = Path.GetFileNameWithoutExtension(riveFile.FileName);
                var extension = Path.GetExtension(riveFile.FileName);
                var filename = GenerateUniqueFilename(uploadsPath, originalName, extension);
                var filePath = Path.Combine(uploadsPath, filename);

                using (var stream = new FileStream(filePath, FileMode.Create))
                    await riveFile.CopyToAsync(stream);

                return Ok(new RiveUploadResponse
                {
                    Filename = filename,
                    DisplayName = originalName,
                    FileSize = riveFile.Length,
                    Message = "Rive file uploaded successfully"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error uploading Rive file", error = ex.Message });
            }
        }

        // Delete Rive file
        [HttpDelete("rive-files/{filename}")]
        public async Task<ActionResult> DeleteRiveFile(string filename)
        {
            try
            {
                if (string.IsNullOrEmpty(filename) || !filename.EndsWith(".riv", StringComparison.OrdinalIgnoreCase))
                    return BadRequest(new { message = "Invalid filename" });

                var userPath = GetRiveUserPath();
                var userFile = Path.Combine(userPath, filename);

                if (System.IO.File.Exists(userFile))
                {
                    // Check if file is in use
                    var frameLayouts = await _frameLayoutService.GetAllFrameLayoutsAsync();
                    var isInUse = frameLayouts.Any(layout =>
                        !string.IsNullOrEmpty(layout.RiveFile) &&
                        layout.RiveFile.Equals(filename, StringComparison.OrdinalIgnoreCase));

                    if (isInUse)
                        return BadRequest(new { message = "Cannot delete Rive file as it is being used by one or more frame layouts" });

                    System.IO.File.Delete(userFile);

                    return Ok(new { message = "Rive file deleted successfully" });
                }

                // Protect built-in templates from deletion
                var templatesPath = GetRiveTemplatesPath();
                var templateFile = Path.Combine(templatesPath, filename);
                if (System.IO.File.Exists(templateFile))
                    return BadRequest(new { message = "Cannot delete built-in template files" });

                return NotFound(new { message = "Rive file not found" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error deleting Rive file", error = ex.Message });
            }
        }

        // Serve Rive file content
        [HttpGet("rive-files/{filename}/content")]
        public async Task<ActionResult> GetRiveFileContent(string filename)
        {
            try
            {
                // Add CORS headers for Electron app
                Response.Headers.Add("Access-Control-Allow-Origin", "*");
                Response.Headers.Add("Access-Control-Allow-Methods", "GET");
                Response.Headers.Add("Access-Control-Allow-Headers", "Content-Type");

                if (string.IsNullOrEmpty(filename) || !filename.EndsWith(".riv", StringComparison.OrdinalIgnoreCase))
                    return BadRequest(new { message = "Invalid filename" });

                // Prefer user override first
                var userPath = GetRiveUserPath();
                var userFile = Path.Combine(userPath, filename);
                if (System.IO.File.Exists(userFile))
                {
                    var fileBytes = await System.IO.File.ReadAllBytesAsync(userFile);
                    return File(fileBytes, "application/octet-stream", filename);
                }

                // Fallback to built-in templates
                var templatesPath = GetRiveTemplatesPath();
                var templateFile = Path.Combine(templatesPath, filename);
                if (System.IO.File.Exists(templateFile))
                {
                    var fileBytes = await System.IO.File.ReadAllBytesAsync(templateFile);
                    return File(fileBytes, "application/octet-stream", filename);
                }

                return NotFound(new { message = "Rive file not found" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error serving Rive file", error = ex.Message });
            }
        }
    
        // UPDATED: Export standalone config with embedded Rive (always embeds regardless of flag)
        [HttpGet("{id}/export-standalone")]
        public async Task<ActionResult> ExportStandaloneConfig(int id, [FromQuery] string? filename = null)
        {
            try
            {
                var frameLayout = await _frameLayoutService.GetFrameLayoutByIdAsync(id);
                if (frameLayout == null)
                    return NotFound(new { message = $"Frame layout with ID {id} not found" });

                var config = frameLayout.JsonFrameConfig;

                var exportData = new
                {
                    type = "standalone_frame_config",
                    exportDate = DateTime.UtcNow.ToString("O"),
                    layoutId = frameLayout.Id,
                    displayName = frameLayout.DisplayName,
                    config = config != null ? JsonSerializer.Deserialize<object>(config) : null,
                    elements = frameLayout.JsonFrameElements != null ? JsonSerializer.Deserialize<object>(frameLayout.JsonFrameElements) : null,
                    hasEmbeddedRive = !string.IsNullOrEmpty(frameLayout.RiveFile)
                };

                var jsonBytes = JsonSerializer.SerializeToUtf8Bytes(exportData, new JsonSerializerOptions { WriteIndented = true });
                var exportFilename = filename ?? $"frame-config-{frameLayout.Id}-standalone.json";

                return File(jsonBytes, "application/json", exportFilename);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error exporting standalone config", error = ex.Message });
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
                    return NotFound(new { message = $"Frame layout with ID {id} not found" });

                var frameData = _frameEngine.RenderFrame(frameLayout, request.SensorData ?? new Dictionary<string, object>());
                return File(frameData, "image/png", $"frame-preview-{id}.png");
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error generating frame preview", error = ex.Message });
            }
        }

        // Test frame rendering with sample data
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

        // Render frame with real sensor data
        [HttpGet("{id}/render")]
        public async Task<ActionResult> RenderFrameWithSensorData(int id, [FromQuery] int? junctionId, [FromQuery] int? linkId, [FromQuery] int? screenId, [FromQuery] int maxSensors = 10)
        {
            try
            {
                var frameLayout = await _frameLayoutService.GetFrameLayoutByIdAsync(id);
                if (frameLayout == null)
                    return NotFound(new { message = $"Frame layout with ID {id} not found" });

                Model_JunctionScreenLayout? screenConfig = null;
                if (linkId.HasValue && screenId.HasValue)
                {
                    var screenConfigs = await _junctionLinksService.GetJunctionScreenLayoutsByLinkIdAsync(linkId.Value);
                    screenConfig = screenConfigs.FirstOrDefault(sc => sc.DeviceScreenId == screenId.Value);
                }

                var sensorData = await GetSensorData(junctionId, maxSensors);

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
                    return NotFound(new { message = $"Frame layout with ID {id} not found" });

                int? junctionId = null;
                if (!string.IsNullOrEmpty(request.JunctionId) && int.TryParse(request.JunctionId, out var jId))
                    junctionId = jId;

                var sensorData = await GetSensorData(junctionId, request.MaxSensors ?? 10);

                // Override with provided sensor data
                if (request.SensorData != null && request.SensorData.Any())
                {
                    foreach (var kvp in request.SensorData)
                        sensorData[kvp.Key] = kvp.Value;
                }

                var frameData = _frameEngine.RenderFrame(frameLayout, sensorData);

                using var httpClient = new HttpClient();
                httpClient.Timeout = TimeSpan.FromSeconds(30);

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

        // Quick render endpoint for backward compatibility
        [HttpGet("quick-render/{layoutType}")]
        public async Task<ActionResult> QuickRender(string layoutType)
        {
            try
            {
                var templates = await _frameLayoutService.GetFrameLayoutsByTypeAsync(layoutType.ToUpperInvariant());
                var template = templates.FirstOrDefault(t => t.IsTemplate);

                if (template == null)
                    return NotFound(new { message = $"No template found for layout type: {layoutType}" });

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

        // Clean up old frame files
        [HttpPost("cleanup")]
        public async Task<ActionResult> CleanupOldFrames([FromBody] CleanupFramesRequest? request = null)
        {
            try
            {
                var maxAge = request?.MaxAgeHours.HasValue == true
                    ? TimeSpan.FromHours(request.MaxAgeHours.Value)
                    : TimeSpan.FromHours(24);

                var framesDirectory = Path.Combine(Directory.GetCurrentDirectory(), "frames");

                if (!Directory.Exists(framesDirectory))
                {
                    return Ok(new
                    {
                        message = "Frames directory does not exist",
                        filesDeleted = 0,
                        totalSize = 0
                    });
                }

                var files = Directory.GetFiles(framesDirectory, "*.png");
                var cutoffTime = DateTime.Now - maxAge;
                var deletedFiles = 0;
                long totalSizeDeleted = 0;
                var errors = new List<string>();

                if (request?.DryRun == true)
                {
                    var filesToDelete = new List<string>();
                    foreach (var filePath in files)
                    {
                        var fileInfo = new FileInfo(filePath);
                        if (fileInfo.LastWriteTime < cutoffTime)
                        {
                            filesToDelete.Add(Path.GetFileName(filePath));
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

                foreach (var filePath in files)
                {
                    try
                    {
                        var fileInfo = new FileInfo(filePath);
                        if (fileInfo.LastWriteTime < cutoffTime)
                        {
                            totalSizeDeleted += fileInfo.Length;
                            System.IO.File.Delete(filePath);
                            deletedFiles++;
                        }
                    }
                    catch (Exception ex)
                    {
                        errors.Add($"Failed to delete {Path.GetFileName(filePath)}: {ex.Message}");
                    }
                }

                if (request?.RemoveUnreferencedFiles == true)
                {
                    var referencedFiles = new HashSet<string>();
                    var allConfigs = await GetAllScreenConfigurationsWithUrlPaths();
                    foreach (var config in allConfigs)
                    {
                        if (!string.IsNullOrEmpty(config.UrlPath))
                            referencedFiles.Add(config.UrlPath.ToLowerInvariant());
                    }

                    var remainingFiles = Directory.GetFiles(framesDirectory, "*.png");
                    foreach (var filePath in remainingFiles)
                    {
                        try
                        {
                            var fileName = Path.GetFileName(filePath).ToLowerInvariant();
                            if (!referencedFiles.Contains(fileName))
                            {
                                var fileInfo = new FileInfo(filePath);
                                totalSizeDeleted += fileInfo.Length;
                                System.IO.File.Delete(filePath);
                                deletedFiles++;
                            }
                        }
                        catch (Exception ex)
                        {
                            errors.Add($"Failed to delete unreferenced {Path.GetFileName(filePath)}: {ex.Message}");
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
                BackgroundOpacity = frameLayout.BackgroundOpacity,
                RiveFile = frameLayout.RiveFile,
                RiveEmbedInPayload = frameLayout.RiveEmbedInPayload,
                JsonFrameConfig = frameLayout.JsonFrameConfig,
                JsonFrameElements = frameLayout.JsonFrameElements,
                Created = frameLayout.Created,
                LastModified = frameLayout.LastModified,
                HasThumbnail = frameLayout.HasThumbnail,
                ThumbnailPath = frameLayout.ThumbnailPath,
                ThumbnailGeneratedAt = frameLayout.ThumbnailGeneratedAt
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
                errors.Add($"Invalid BackgroundType: {backgroundType}. Valid types are: none, color, image, url, rive");

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
            var validTypes = new[] { "none", "color", "image", "url", "rive" };
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

        private string GenerateUniqueFilename(string directory, string baseName, string extension)
        {
            var filename = $"{baseName}{extension}";
            var counter = 1;

            while (System.IO.File.Exists(Path.Combine(directory, filename)))
            {
                filename = $"{baseName}_{counter}{extension}";
                counter++;
            }

            return filename;
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

        private async Task<Dictionary<string, object>> GetSensorData(int? junctionId, int maxSensors)
        {
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

            // Provide fallback test data if no sensors available
            if (!sensorData.Any())
            {
                sensorData["Demo"] = "No live sensors - this is test data";
                sensorData["Temperature"] = "22.5°C";
                sensorData["Humidity"] = "48%";
                sensorData["Pressure"] = "1013.2 hPa";
            }

            return sensorData;
        }
        private string GetRiveTemplatesPath()
        {
            return Path.Combine(_webHostEnvironment.ContentRootPath, "frameengine", "templates");
        }

        // User-writable Rive storage next to the DB (mapped/persistent)
        private string GetRiveUserPath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath)
                          ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "rive"); // e.g. /.../data/rive
        }
         
        private async Task<List<Model_JunctionScreenLayout>> GetAllScreenConfigurationsWithUrlPaths()
        {
            try
            {
                // This should be implemented to get all screen configurations
                // For now, return empty list as placeholder
                return new List<Model_JunctionScreenLayout>();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error getting screen configurations: {ex.Message}");
                return new List<Model_JunctionScreenLayout>();
            }
        }

        // THUMBNAILS        

        // Process thumbnail from frontend (html2canvas)
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

        // Get thumbnail image
        [HttpGet("{id}/thumbnail")]
        public async Task<ActionResult> GetThumbnail(int id)
        {
            try
            {
                var frameLayout = await _frameLayoutService.GetFrameLayoutByIdAsync(id);
                if (frameLayout == null)
                    return NotFound(new { message = $"Frame layout with ID {id} not found" });

                if (!frameLayout.HasThumbnail || string.IsNullOrEmpty(frameLayout.ThumbnailPath))
                    return NotFound(new { message = "No thumbnail available for this frame layout" });

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
                return StatusCode(500, new { message = "Error retrieving thumbnail", error = ex.Message });
            }
        }

        // Delete thumbnail
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
                await _frameLayoutService.UpdateFrameLayoutAsync(frameLayout);

                return Ok(new { message = "Thumbnail deleted successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error deleting thumbnail", error = ex.Message });
            }
        }

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

        private async Task DeleteThumbnailFile(string relativePath)
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
        }


    }

    // DTOs and Request/Response Models
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
        public double BackgroundOpacity { get; set; } = 1.0;

        public string? RiveFile { get; set; }
        public bool RiveEmbedInPayload { get; set; } = true;
        public string? JsonFrameConfig { get; set; }
        public string? JsonFrameElements { get; set; }

        public DateTime Created { get; set; }
        public DateTime? LastModified { get; set; }
        public bool HasThumbnail { get; set; }
        public string? ThumbnailPath { get; set; }
        public DateTime? ThumbnailGeneratedAt { get; set; }
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
        public byte[]? BackgroundImageData { get; set; }
        [Range(0.0, 1.0)]
        public double? BackgroundOpacity { get; set; } = 1.0;

        public string? RiveFile { get; set; }
        public bool RiveEmbedInPayload { get; set; } = true;
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
        public byte[]? BackgroundImageData { get; set; }
        [Range(0.0, 1.0)]
        public double? BackgroundOpacity { get; set; }

        public string? RiveFile { get; set; }
        public bool? RiveEmbedInPayload { get; set; }
        public string? JsonFrameConfig { get; set; }
        public string? JsonFrameElements { get; set; }
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
        [Range(0.1, 8760)]
        public double? MaxAgeHours { get; set; }

        public bool? RemoveUnreferencedFiles { get; set; }

        public bool? DryRun { get; set; }
    }

    // Rive-specific DTOs
    public class RiveFileInfoDto
    {
        public string Filename { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public DateTime UploadDate { get; set; }
        public long FileSize { get; set; }
    }

    public class RiveUploadResponse
    {
        public string Filename { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public long FileSize { get; set; }
        public string Message { get; set; } = string.Empty;
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