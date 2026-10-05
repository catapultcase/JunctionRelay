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

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("api/frameengine")]
    public class Controller_FrameEngine_Media : ControllerBase
    {
        private readonly Service_Database_Manager_FrameEngine _frameLayoutService;
        private readonly IWebHostEnvironment _webHostEnvironment;
        private readonly DatabasePathProvider _dbPathProvider;

        public Controller_FrameEngine_Media(
            Service_Database_Manager_FrameEngine frameLayoutService,
            IWebHostEnvironment webHostEnvironment,
            DatabasePathProvider dbPathProvider)
        {
            _frameLayoutService = frameLayoutService;
            _webHostEnvironment = webHostEnvironment;
            _dbPathProvider = dbPathProvider;
        }

        // ============================================================================
        // RIVE FILES
        // ============================================================================

        [HttpGet("rive")]
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

        [HttpDelete("rive/{filename}")]
        public async Task<ActionResult> DeleteRiveFile(string filename)
        {
            try
            {
                filename = Path.GetFileName(filename); // Security: strip path traversal
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

        [AllowAnonymous]
        [HttpGet("rive/{filename}/content")]
        public async Task<ActionResult> GetRiveFileContent(string filename)
        {
            try
            {
                filename = Path.GetFileName(filename); // Security: strip path traversal
                if (string.IsNullOrEmpty(filename) || !filename.EndsWith(".riv", StringComparison.OrdinalIgnoreCase))
                    return BadRequest(new { message = "Invalid filename" });

                // Prefer user override first
                var userPath = GetRiveUserPath();
                var userFile = Path.Combine(userPath, filename);
                if (System.IO.File.Exists(userFile))
                {
                    if (TryAddCacheHeaders(userFile)) return new StatusCodeResult(304);
                    var fileBytes = await System.IO.File.ReadAllBytesAsync(userFile);
                    return File(fileBytes, "application/octet-stream", filename);
                }

                // Fallback to built-in templates
                var templatesPath = GetRiveTemplatesPath();
                var templateFile = Path.Combine(templatesPath, filename);
                if (System.IO.File.Exists(templateFile))
                {
                    if (TryAddCacheHeaders(templateFile)) return new StatusCodeResult(304);
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

        // ============================================================================
        // IMAGES
        // ============================================================================

        [HttpGet("images")]
        public ActionResult<IEnumerable<BackgroundImageInfoDto>> GetBackgroundImages()
        {
            try
            {
                var templatesPath = GetBackgroundImageTemplatesPath();
                var userPath = GetBackgroundImageUserPath();
                Directory.CreateDirectory(userPath);

                // Collect files, user overrides template if same filename
                var filesByName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

                if (Directory.Exists(templatesPath))
                {
                    foreach (var p in Directory.EnumerateFiles(templatesPath, "*.*")
                        .Where(f => IsValidImageExtension(Path.GetExtension(f))))
                    {
                        filesByName[Path.GetFileName(p)] = p;
                    }
                }

                foreach (var p in Directory.EnumerateFiles(userPath, "*.*")
                    .Where(f => IsValidImageExtension(Path.GetExtension(f))))
                {
                    filesByName[Path.GetFileName(p)] = p;
                }

                var results = filesByName.Select(kvp =>
                {
                    var fi = new FileInfo(kvp.Value);
                    return new BackgroundImageInfoDto
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
                return StatusCode(500, new { message = "Error retrieving images", error = ex.Message });
            }
        }

        [HttpPost("upload-image")]
        public async Task<ActionResult<BackgroundImageUploadResponse>> UploadBackgroundImage(IFormFile backgroundImage)
        {
            try
            {
                if (backgroundImage == null || backgroundImage.Length == 0)
                    return BadRequest(new { message = "No file provided" });

                var extension = Path.GetExtension(backgroundImage.FileName).ToLowerInvariant();
                if (!IsValidImageExtension(extension))
                    return BadRequest(new { message = "File must be a valid image (PNG, JPG, JPEG, WebP, or GIF)" });

                // Validate file size (max 10MB for images)
                if (backgroundImage.Length > 10 * 1024 * 1024)
                    return BadRequest(new { message = "File size exceeds 10MB limit" });

                var uploadsPath = GetBackgroundImageUserPath();
                Directory.CreateDirectory(uploadsPath);

                var originalName = Path.GetFileNameWithoutExtension(backgroundImage.FileName);
                var filename = GenerateUniqueFilename(uploadsPath, originalName, extension);
                var filePath = Path.Combine(uploadsPath, filename);

                using (var stream = new FileStream(filePath, FileMode.Create))
                    await backgroundImage.CopyToAsync(stream);

                return Ok(new BackgroundImageUploadResponse
                {
                    Filename = filename,
                    DisplayName = originalName,
                    FileSize = backgroundImage.Length,
                    Message = "Image uploaded successfully"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error uploading image", error = ex.Message });
            }
        }

        [HttpDelete("images/{filename}")]
        public async Task<ActionResult> DeleteBackgroundImage(string filename)
        {
            try
            {
                filename = Path.GetFileName(filename); // Security: strip path traversal
                if (string.IsNullOrEmpty(filename) || !IsValidImageExtension(Path.GetExtension(filename)))
                    return BadRequest(new { message = "Invalid filename" });

                var userPath = GetBackgroundImageUserPath();
                var userFile = Path.Combine(userPath, filename);

                if (System.IO.File.Exists(userFile))
                {
                    // Check if file is in use
                    var frameLayouts = await _frameLayoutService.GetAllFrameLayoutsAsync();
                    var isInUse = frameLayouts.Any(layout =>
                        !string.IsNullOrEmpty(layout.BackgroundImageUrl) &&
                        layout.BackgroundImageUrl.Equals(filename, StringComparison.OrdinalIgnoreCase));

                    if (isInUse)
                        return BadRequest(new { message = "Cannot delete image as it is being used by one or more frame layouts" });

                    System.IO.File.Delete(userFile);
                    return Ok(new { message = "Image deleted successfully" });
                }

                // Protect built-in templates from deletion
                var templatesPath = GetBackgroundImageTemplatesPath();
                var templateFile = Path.Combine(templatesPath, filename);
                if (System.IO.File.Exists(templateFile))
                    return BadRequest(new { message = "Cannot delete built-in template files" });

                return NotFound(new { message = "Image not found" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error deleting image", error = ex.Message });
            }
        }

        [AllowAnonymous]
        [HttpGet("images/{filename}/content")]
        public async Task<ActionResult> GetBackgroundImageContent(string filename)
        {
            try
            {
                filename = Path.GetFileName(filename); // Security: strip path traversal
                if (string.IsNullOrEmpty(filename) || !IsValidImageExtension(Path.GetExtension(filename)))
                    return BadRequest(new { message = "Invalid filename" });

                // Prefer user override first
                var userPath = GetBackgroundImageUserPath();
                var userFile = Path.Combine(userPath, filename);
                if (System.IO.File.Exists(userFile))
                {
                    if (TryAddCacheHeaders(userFile)) return new StatusCodeResult(304);
                    var fileBytes = await System.IO.File.ReadAllBytesAsync(userFile);
                    var contentType = GetImageContentType(Path.GetExtension(filename));
                    return File(fileBytes, contentType, filename);
                }

                // Fallback to built-in templates
                var templatesPath = GetBackgroundImageTemplatesPath();
                var templateFile = Path.Combine(templatesPath, filename);
                if (System.IO.File.Exists(templateFile))
                {
                    if (TryAddCacheHeaders(templateFile)) return new StatusCodeResult(304);
                    var fileBytes = await System.IO.File.ReadAllBytesAsync(templateFile);
                    var contentType = GetImageContentType(Path.GetExtension(filename));
                    return File(fileBytes, contentType, filename);
                }

                return NotFound(new { message = "Image not found" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error serving image", error = ex.Message });
            }
        }

        // ============================================================================
        // VIDEOS
        // ============================================================================

        [HttpGet("videos")]
        public ActionResult<IEnumerable<BackgroundVideoInfoDto>> GetBackgroundVideos()
        {
            try
            {
                var templatesPath = GetBackgroundVideoTemplatesPath();
                var userPath = GetBackgroundVideoUserPath();
                Directory.CreateDirectory(userPath);

                // Collect files, user overrides template if same filename
                var filesByName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

                if (Directory.Exists(templatesPath))
                {
                    foreach (var p in Directory.EnumerateFiles(templatesPath, "*.*")
                        .Where(f => IsValidVideoExtension(Path.GetExtension(f))))
                    {
                        filesByName[Path.GetFileName(p)] = p;
                    }
                }

                foreach (var p in Directory.EnumerateFiles(userPath, "*.*")
                    .Where(f => IsValidVideoExtension(Path.GetExtension(f))))
                {
                    filesByName[Path.GetFileName(p)] = p;
                }

                var results = filesByName.Select(kvp =>
                {
                    var fi = new FileInfo(kvp.Value);
                    return new BackgroundVideoInfoDto
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
                return StatusCode(500, new { message = "Error retrieving videos", error = ex.Message });
            }
        }

        [HttpPost("upload-video")]
        public async Task<ActionResult<BackgroundVideoUploadResponse>> UploadBackgroundVideo(IFormFile backgroundVideo)
        {
            try
            {
                if (backgroundVideo == null || backgroundVideo.Length == 0)
                    return BadRequest(new { message = "No file provided" });

                var extension = Path.GetExtension(backgroundVideo.FileName).ToLowerInvariant();
                if (!IsValidVideoExtension(extension))
                    return BadRequest(new { message = "File must be a valid video (MP4, WebM, or OGG)" });

                // Validate file size (max 100MB for videos)
                if (backgroundVideo.Length > 100 * 1024 * 1024)
                    return BadRequest(new { message = "File size exceeds 100MB limit" });

                var uploadsPath = GetBackgroundVideoUserPath();
                Directory.CreateDirectory(uploadsPath);

                var originalName = Path.GetFileNameWithoutExtension(backgroundVideo.FileName);
                var filename = GenerateUniqueFilename(uploadsPath, originalName, extension);
                var filePath = Path.Combine(uploadsPath, filename);

                using (var stream = new FileStream(filePath, FileMode.Create))
                    await backgroundVideo.CopyToAsync(stream);

                return Ok(new BackgroundVideoUploadResponse
                {
                    Filename = filename,
                    DisplayName = originalName,
                    FileSize = backgroundVideo.Length,
                    Message = "Video uploaded successfully"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error uploading video", error = ex.Message });
            }
        }

        [HttpDelete("videos/{filename}")]
        public async Task<ActionResult> DeleteBackgroundVideo(string filename)
        {
            try
            {
                filename = Path.GetFileName(filename); // Security: strip path traversal
                if (string.IsNullOrEmpty(filename) || !IsValidVideoExtension(Path.GetExtension(filename)))
                    return BadRequest(new { message = "Invalid filename" });

                var userPath = GetBackgroundVideoUserPath();
                var userFile = Path.Combine(userPath, filename);

                if (System.IO.File.Exists(userFile))
                {
                    // Check if file is in use
                    var frameLayouts = await _frameLayoutService.GetAllFrameLayoutsAsync();
                    var isInUse = frameLayouts.Any(layout =>
                        !string.IsNullOrEmpty(layout.BackgroundVideoUrl) &&
                        layout.BackgroundVideoUrl.Equals(filename, StringComparison.OrdinalIgnoreCase));

                    if (isInUse)
                        return BadRequest(new { message = "Cannot delete video as it is being used by one or more frame layouts" });

                    System.IO.File.Delete(userFile);
                    return Ok(new { message = "Video deleted successfully" });
                }

                // Protect built-in templates from deletion
                var templatesPath = GetBackgroundVideoTemplatesPath();
                var templateFile = Path.Combine(templatesPath, filename);
                if (System.IO.File.Exists(templateFile))
                    return BadRequest(new { message = "Cannot delete built-in template files" });

                return NotFound(new { message = "Video not found" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error deleting video", error = ex.Message });
            }
        }

        [AllowAnonymous]
        [HttpGet("videos/{filename}/content")]
        public async Task<ActionResult> GetBackgroundVideoContent(string filename)
        {
            try
            {
                filename = Path.GetFileName(filename); // Security: strip path traversal
                if (string.IsNullOrEmpty(filename) || !IsValidVideoExtension(Path.GetExtension(filename)))
                    return BadRequest(new { message = "Invalid filename" });

                // Prefer user override first
                var userPath = GetBackgroundVideoUserPath();
                var userFile = Path.Combine(userPath, filename);
                if (System.IO.File.Exists(userFile))
                {
                    if (TryAddCacheHeaders(userFile)) return new StatusCodeResult(304);
                    var fileBytes = await System.IO.File.ReadAllBytesAsync(userFile);
                    var contentType = GetVideoContentType(Path.GetExtension(filename));
                    return File(fileBytes, contentType, filename);
                }

                // Fallback to built-in templates
                var templatesPath = GetBackgroundVideoTemplatesPath();
                var templateFile = Path.Combine(templatesPath, filename);
                if (System.IO.File.Exists(templateFile))
                {
                    if (TryAddCacheHeaders(templateFile)) return new StatusCodeResult(304);
                    var fileBytes = await System.IO.File.ReadAllBytesAsync(templateFile);
                    var contentType = GetVideoContentType(Path.GetExtension(filename));
                    return File(fileBytes, contentType, filename);
                }

                return NotFound(new { message = "Video not found" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error serving video", error = ex.Message });
            }
        }

        // ============================================================================
        // ASSET USAGE
        // ============================================================================

        [HttpGet("asset-usage")]
        public async Task<ActionResult> GetAssetUsage()
        {
            try
            {
                var frameLayouts = await _frameLayoutService.GetAllFrameLayoutsAsync();
                var usageMap = new Dictionary<string, List<object>>(StringComparer.OrdinalIgnoreCase);

                foreach (var layout in frameLayouts)
                {
                    var layoutRef = new { id = layout.Id.ToString(), displayName = layout.DisplayName ?? "" };

                    // Check background image
                    if (!string.IsNullOrEmpty(layout.BackgroundImageUrl))
                    {
                        AddUsage(usageMap, layout.BackgroundImageUrl, "images", layoutRef);
                    }

                    // Check background video
                    if (!string.IsNullOrEmpty(layout.BackgroundVideoUrl))
                    {
                        AddUsage(usageMap, layout.BackgroundVideoUrl, "videos", layoutRef);
                    }

                    // Check rive file
                    if (!string.IsNullOrEmpty(layout.RiveFile))
                    {
                        AddUsage(usageMap, layout.RiveFile, "rive", layoutRef);
                    }

                    // Check element-level references in JsonFrameElements
                    if (!string.IsNullOrEmpty(layout.JsonFrameElements))
                    {
                        try
                        {
                            var elements = System.Text.Json.JsonSerializer.Deserialize<List<System.Text.Json.JsonElement>>(layout.JsonFrameElements);
                            if (elements != null)
                            {
                                foreach (var element in elements)
                                {
                                    if (!element.TryGetProperty("type", out var typeProperty)) continue;
                                    var elementType = typeProperty.GetString();
                                    if (!element.TryGetProperty("properties", out var properties)) continue;

                                    // Media image elements
                                    if (elementType == "media-image" &&
                                        properties.TryGetProperty("filename", out var imgFile))
                                    {
                                        var file = imgFile.GetString();
                                        if (!string.IsNullOrEmpty(file))
                                            AddUsage(usageMap, file, "images", layoutRef);
                                    }

                                    // Media video elements
                                    if (elementType == "media-video" &&
                                        properties.TryGetProperty("filename", out var vidFile))
                                    {
                                        var file = vidFile.GetString();
                                        if (!string.IsNullOrEmpty(file))
                                            AddUsage(usageMap, file, "videos", layoutRef);
                                    }

                                    // Media rive elements
                                    if (elementType == "media-rive" &&
                                        properties.TryGetProperty("filename", out var riveFile))
                                    {
                                        var file = riveFile.GetString();
                                        if (!string.IsNullOrEmpty(file))
                                            AddUsage(usageMap, file, "rive", layoutRef);
                                    }
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine($"[CONTROLLER_FRAMEENGINE_MEDIA] Error parsing elements for layout {layout.Id}: {ex.Message}");
                        }
                    }
                }

                var assetUsages = usageMap.Select(kvp =>
                {
                    // Determine asset type from the first entry's type, or infer from filename
                    var parts = kvp.Key.Split('|');
                    return new
                    {
                        filename = parts[0],
                        assetType = parts.Length > 1 ? parts[1] : "images",
                        usedByLayouts = kvp.Value
                    };
                }).ToList();

                return Ok(new { assetUsages });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error fetching asset usage", error = ex.Message });
            }
        }

        private static void AddUsage(Dictionary<string, List<object>> usageMap, string filename, string assetType, object layoutRef)
        {
            var key = $"{filename}|{assetType}";
            if (!usageMap.TryGetValue(key, out var list))
            {
                list = new List<object>();
                usageMap[key] = list;
            }
            // Avoid duplicate layout entries for the same asset
            if (!list.Any(l =>
            {
                var id = l.GetType().GetProperty("id")?.GetValue(l)?.ToString();
                var refId = layoutRef.GetType().GetProperty("id")?.GetValue(layoutRef)?.ToString();
                return id == refId;
            }))
            {
                list.Add(layoutRef);
            }
        }

        // ============================================================================
        // HELPER METHODS
        // ============================================================================

        /// <summary>
        /// Adds Cache-Control and ETag headers. Returns true if the client cache is still valid (304).
        /// </summary>
        private bool TryAddCacheHeaders(string filePath)
        {
            var fileInfo = new FileInfo(filePath);
            if (!fileInfo.Exists) return false;

            var etag = $"\"{fileInfo.LastWriteTimeUtc.Ticks}_{fileInfo.Length}\"";
            Response.Headers["Cache-Control"] = "public, max-age=3600";
            Response.Headers["ETag"] = etag;
            Response.Headers["Last-Modified"] = fileInfo.LastWriteTimeUtc.ToString("R");

            var ifNoneMatch = Request.Headers["If-None-Match"].FirstOrDefault();
            if (ifNoneMatch == etag)
            {
                Response.StatusCode = 304;
                return true;
            }

            return false;
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

        // Rive paths
        private string GetRiveTemplatesPath()
        {
            return Path.Combine(_webHostEnvironment.ContentRootPath, "frameengine", "templates");
        }

        private string GetRiveUserPath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath)
                          ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine", "rive");
        }

        // Image paths
        private string GetBackgroundImageTemplatesPath()
        {
            return Path.Combine(_webHostEnvironment.ContentRootPath, "frameengine", "images", "templates");
        }

        private string GetBackgroundImageUserPath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath)
                          ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine", "images");
        }

        // Video paths
        private string GetBackgroundVideoTemplatesPath()
        {
            return Path.Combine(_webHostEnvironment.ContentRootPath, "frameengine", "videos", "templates");
        }

        private string GetBackgroundVideoUserPath()
        {
            var dbPath = _dbPathProvider.DbPath;
            var dataDir = Path.GetDirectoryName(dbPath)
                          ?? Path.Combine(_webHostEnvironment.ContentRootPath, "data");
            return Path.Combine(dataDir, "frameengine", "videos");
        }

        // Image validation
        private bool IsValidImageExtension(string extension)
        {
            var validExtensions = new[] { ".png", ".jpg", ".jpeg", ".webp", ".gif" };
            return validExtensions.Contains(extension.ToLowerInvariant());
        }

        private string GetImageContentType(string extension)
        {
            return extension.ToLowerInvariant() switch
            {
                ".png" => "image/png",
                ".jpg" or ".jpeg" => "image/jpeg",
                ".webp" => "image/webp",
                ".gif" => "image/gif",
                _ => "application/octet-stream"
            };
        }

        // Video validation
        private bool IsValidVideoExtension(string extension)
        {
            var validExtensions = new[] { ".mp4", ".webm", ".ogg" };
            return validExtensions.Contains(extension.ToLowerInvariant());
        }

        private string GetVideoContentType(string extension)
        {
            return extension.ToLowerInvariant() switch
            {
                ".mp4" => "video/mp4",
                ".webm" => "video/webm",
                ".ogg" => "video/ogg",
                _ => "application/octet-stream"
            };
        }
    }

    // ============================================================================
    // DTOs
    // ============================================================================

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

    public class BackgroundImageInfoDto
    {
        public string Filename { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public DateTime UploadDate { get; set; }
        public long FileSize { get; set; }
    }

    public class BackgroundImageUploadResponse
    {
        public string Filename { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public long FileSize { get; set; }
        public string Message { get; set; } = string.Empty;
    }

    public class BackgroundVideoInfoDto
    {
        public string Filename { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public DateTime UploadDate { get; set; }
        public long FileSize { get; set; }
        public double? Duration { get; set; }
        public int? Width { get; set; }
        public int? Height { get; set; }
    }

    public class BackgroundVideoUploadResponse
    {
        public string Filename { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public long FileSize { get; set; }
        public string Message { get; set; } = string.Empty;
    }
}