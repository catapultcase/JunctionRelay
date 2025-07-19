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
using Dapper;
using Microsoft.AspNetCore.Mvc;
using System.Data;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using JunctionRelayServer.Models;
using JunctionRelayServer.Interfaces;

[ApiController]
[Route("api/settings")]
public class Controller_Settings : ControllerBase
{
    private readonly IDbConnection _db;
    private readonly IWebHostEnvironment _env;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<Controller_Settings> _logger;

    public Controller_Settings(IDbConnection db, IWebHostEnvironment env, IHttpClientFactory httpClientFactory, ILogger<Controller_Settings> logger)
    {
        _db = db;
        _env = env;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetSettings() =>
    Ok(await _db.QueryAsync<Model_Setting>(
        "SELECT * FROM Settings WHERE Key != 'authentication_enabled' ORDER BY Key ASC"));

    [HttpPost]
    public async Task<IActionResult> AddSetting([FromBody] Model_Setting setting)
    {
        var id = await _db.ExecuteScalarAsync<long>(
            @"INSERT INTO Settings (Key, Value, Description) VALUES (@Key, @Value, @Description);
              SELECT last_insert_rowid();",
            setting);
        setting.Id = (int)id;
        return Ok(setting);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateSetting(int id, [FromBody] Model_Setting setting)
    {
        setting.Id = id;
        await _db.ExecuteAsync(
            "UPDATE Settings SET Key = @Key, Value = @Value, Description = @Description WHERE Id = @Id",
            setting);
        return Ok(setting);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteSetting(int id)
    {
        await _db.ExecuteAsync("DELETE FROM Settings WHERE Id = @id", new { id });
        return Ok();
    }

    // New route for application version
    [HttpGet("version")]
    public IActionResult GetVersion()
    {
        var version = Assembly.GetEntryAssembly()?.GetName().Version?.ToString() ?? "unknown";
        return Ok(new { version });
    }

    // New route for latest version check
    [HttpGet("version/latest")]
    public async Task<IActionResult> GetLatestVersion()
    {
        try
        {
            _logger.LogInformation("[VERSION CHECK] Starting latest version check...");

            // Try Docker Hub first
            var dockerResult = await TryGetLatestFromDockerHub();
            if (dockerResult != null)
            {
                _logger.LogInformation($"[VERSION CHECK] Successfully got latest version from Docker Hub: {dockerResult}");
                return Ok(new { latest_version = dockerResult, source = "docker_hub" });
            }

            _logger.LogWarning("[VERSION CHECK] Docker Hub failed, falling back to GitHub...");

            // Fallback to GitHub
            var githubResult = await TryGetLatestFromGitHub();
            if (githubResult != null)
            {
                _logger.LogInformation($"[VERSION CHECK] Successfully got latest version from GitHub: {githubResult}");
                return Ok(new { latest_version = githubResult, source = "github" });
            }

            _logger.LogError("[VERSION CHECK] Both Docker Hub and GitHub failed");
            return StatusCode(500, new { error = "Failed to fetch latest version from both Docker Hub and GitHub" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[VERSION CHECK] Unexpected error during version check");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    private async Task<string?> TryGetLatestFromDockerHub()
    {
        try
        {
            using var client = _httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Add("User-Agent", "JunctionRelay/1.0");
            client.Timeout = TimeSpan.FromSeconds(10);

            _logger.LogInformation("[VERSION CHECK] Fetching from Docker Hub API...");

            var response = await client.GetAsync(
                "https://hub.docker.com/v2/repositories/catapultcase/junctionrelay/tags/?page_size=100"
            );

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning($"[VERSION CHECK] Docker Hub API returned {response.StatusCode}");
                return null;
            }

            var content = await response.Content.ReadAsStringAsync();
            var dockerData = JsonSerializer.Deserialize<DockerHubResponse>(content, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (dockerData?.Results == null)
            {
                _logger.LogWarning("[VERSION CHECK] Docker Hub response was null or had no results");
                return null;
            }

            _logger.LogInformation($"[VERSION CHECK] Docker Hub returned {dockerData.Results.Count} tags");

            // Filter and sort version tags
            var versionTags = dockerData.Results
                .Where(tag => Regex.IsMatch(tag.Name, @"^v?\d+\.\d+\.\d+"))
                .Select(tag => new
                {
                    Name = tag.Name.TrimStart('v'),
                    LastUpdated = tag.LastUpdated
                })
                .OrderByDescending(tag => ParseVersion(tag.Name))
                .ToList();

            _logger.LogInformation($"[VERSION CHECK] Found {versionTags.Count} valid version tags");

            var latestVersion = versionTags.FirstOrDefault()?.Name;

            if (latestVersion != null)
            {
                _logger.LogInformation($"[VERSION CHECK] Latest Docker Hub version: {latestVersion}");
            }

            return latestVersion;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[VERSION CHECK] Error fetching from Docker Hub");
            return null;
        }
    }

    private async Task<string?> TryGetLatestFromGitHub()
    {
        try
        {
            using var client = _httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Add("User-Agent", "JunctionRelay/1.0");
            client.Timeout = TimeSpan.FromSeconds(10);

            _logger.LogInformation("[VERSION CHECK] Fetching from GitHub API...");

            // Get all tags from GitHub
            var allTagsRes = await client.GetAsync("https://api.github.com/repos/catapultcase/JunctionRelay/tags");
            if (!allTagsRes.IsSuccessStatusCode)
            {
                _logger.LogWarning($"[VERSION CHECK] GitHub tags API returned {allTagsRes.StatusCode}");
                return null;
            }

            var allTagsContent = await allTagsRes.Content.ReadAsStringAsync();
            var allTags = JsonSerializer.Deserialize<List<GitHubTag>>(allTagsContent, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (allTags == null)
            {
                _logger.LogWarning("[VERSION CHECK] GitHub tags response was null");
                return null;
            }

            _logger.LogInformation($"[VERSION CHECK] GitHub returned {allTags.Count} tags");

            // Find semantic version tags and get the latest
            var versionTags = allTags
                .Where(tag => Regex.IsMatch(tag.Name, @"^v?\d+\.\d+\.\d+"))
                .Select(tag => tag.Name.TrimStart('v'))
                .OrderByDescending(ParseVersion)
                .ToList();

            _logger.LogInformation($"[VERSION CHECK] Found {versionTags.Count} valid version tags on GitHub");

            var latestVersion = versionTags.FirstOrDefault();

            if (latestVersion != null)
            {
                _logger.LogInformation($"[VERSION CHECK] Latest GitHub version: {latestVersion}");
            }

            return latestVersion;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[VERSION CHECK] Error fetching from GitHub");
            return null;
        }
    }

    private static int ParseVersion(string version)
    {
        try
        {
            var parts = version.Split('.').Select(int.Parse).ToArray();
            if (parts.Length >= 3)
            {
                return parts[0] * 10000 + parts[1] * 100 + parts[2];
            }
            return 0;
        }
        catch
        {
            return 0;
        }
    }

    // Update the GetFeatureFlags method in your Controller_Settings class:

    [HttpGet("flags")]
    public async Task<IActionResult> GetFeatureFlags()
    {
        var settings = await _db.QueryAsync<Model_Setting>("SELECT * FROM Settings");

        var flags = new Dictionary<string, object>();

        foreach (var setting in settings)
        {
            // Handle boolean flags
            if (setting.Key == "host_charts" ||
                setting.Key == "custom_firmware_flashing" ||
                setting.Key == "hyperlink_rows" ||
                setting.Key == "junction_import_export")
            {
                flags[setting.Key] = string.Equals(setting.Value?.Trim(), "true", StringComparison.OrdinalIgnoreCase);
            }
            // Handle alignment settings as strings (normalize case)
            else if (setting.Key == "device_actions_alignment" ||
                     setting.Key == "junction_actions_alignment")
            {
                // Normalize alignment values to lowercase for consistency
                var alignmentValue = setting.Value?.Trim()?.ToLowerInvariant();

                // Validate alignment values and provide sensible defaults
                if (alignmentValue == "left" || alignmentValue == "center" || alignmentValue == "right")
                {
                    flags[setting.Key] = alignmentValue;
                }
                else
                {
                    // Default to 'right' for invalid values
                    flags[setting.Key] = "right";
                    _logger.LogWarning($"Invalid alignment value '{setting.Value}' for {setting.Key}, defaulting to 'right'");
                }
            }
            // Handle other settings as strings
            else
            {
                flags[setting.Key] = setting.Value?.Trim() ?? "";
            }
        }

        // Ensure alignment flags exist with defaults if not in database
        if (!flags.ContainsKey("device_actions_alignment"))
        {
            flags["device_actions_alignment"] = "right";
        }

        if (!flags.ContainsKey("junction_actions_alignment"))
        {
            flags["junction_actions_alignment"] = "right";
        }

        return Ok(flags);
    }

    [HttpPost("toggle/{key}")]
    public async Task<IActionResult> ToggleByKey(
        string key,
        [FromBody] Model_AuthToggleRequest req)
    {
        var newValue = req.Enabled.ToString().ToLower();

        var updateSql = @"
        UPDATE Settings
           SET Value = @Value
         WHERE [Key] = @Key;
    ";
        var rows = await _db.ExecuteAsync(updateSql, new { Key = key, Value = newValue });

        if (rows == 0)
        {
            var insertSql = @"
            INSERT INTO Settings ([Key], Value, Description)
            VALUES (@Key, @Value, @Description);
        ";
            await _db.ExecuteAsync(insertSql, new
            {
                Key = key,
                Value = newValue,
                Description = $"Auto-created flag for '{key}'"
            });
        }

        if (key == "authentication_enabled")
        {
            var authService = HttpContext.RequestServices.GetRequiredService<IService_Auth>();
            authService.ClearAuthCache();
        }

        return Ok(new
        {
            message = $"Setting '{key}' set to '{newValue}'. Authentication changes take effect immediately.",
            enabled = req.Enabled
        });
    }
}

    // Data models for Docker Hub API
    public class DockerHubResponse
{
    [JsonPropertyName("results")]
    public List<DockerHubTag> Results { get; set; } = new();
}

public class DockerHubTag
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("last_updated")]
    public DateTime LastUpdated { get; set; }
}

// Data model for GitHub API
public class GitHubTag
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
}

[ApiController]
[Route("api/cache")]
public class Controller_Cache : ControllerBase
{
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<Controller_Cache> _logger;

    public Controller_Cache(IWebHostEnvironment env, ILogger<Controller_Cache> logger)
    {
        _env = env;
        _logger = logger;
    }

    [HttpGet("status")]
    public IActionResult GetCacheStatus()
    {
        try
        {
            var firmwareDirectory = Path.Combine(_env.ContentRootPath, "Firmware");
            var releaseCacheDirectory = Path.Combine(firmwareDirectory, "Releases");

            if (!Directory.Exists(releaseCacheDirectory))
            {
                return Ok(new { cacheFiles = new List<object>() });
            }

            var cacheFiles = Directory.GetFiles(releaseCacheDirectory, "*.json")
                .Select(filePath =>
                {
                    var fileInfo = new FileInfo(filePath);
                    var age = DateTime.Now - fileInfo.LastWriteTime;

                    return new
                    {
                        name = fileInfo.Name,
                        sizeKB = Math.Round(fileInfo.Length / 1024.0, 2),
                        age = FormatAge(age),
                        lastModified = fileInfo.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss"),
                        isExpired = age.TotalHours > 24
                    };
                })
                .OrderBy(f => f.name)
                .ToList();

            return Ok(new { cacheFiles });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting cache status");
            return StatusCode(500, new { error = "Failed to get cache status", message = ex.Message });
        }
    }

    [HttpDelete("clear")]
    public IActionResult ClearCache()
    {
        try
        {
            var firmwareDirectory = Path.Combine(_env.ContentRootPath, "Firmware");
            var releaseCacheDirectory = Path.Combine(firmwareDirectory, "Releases");

            int filesDeleted = 0;

            if (Directory.Exists(releaseCacheDirectory))
            {
                var cacheFiles = Directory.GetFiles(releaseCacheDirectory, "*.json");

                foreach (var file in cacheFiles)
                {
                    try
                    {
                        System.IO.File.Delete(file);
                        filesDeleted++;
                        _logger.LogInformation($"Deleted cache file: {Path.GetFileName(file)}");
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, $"Failed to delete cache file: {Path.GetFileName(file)}");
                    }
                }
            }

            _logger.LogInformation($"Cache cleared. {filesDeleted} files deleted.");

            return Ok(new
            {
                success = true,
                filesDeleted,
                message = $"Successfully cleared {filesDeleted} cache file{(filesDeleted != 1 ? "s" : "")}"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error clearing cache");
            return StatusCode(500, new { error = "Failed to clear cache", message = ex.Message });
        }
    }

    [HttpDelete("clear/{fileName}")]
    public IActionResult ClearSpecificCacheFile(string fileName)
    {
        try
        {
            // Sanitize filename to prevent directory traversal
            fileName = Path.GetFileName(fileName);
            if (!fileName.EndsWith(".json"))
            {
                return BadRequest(new { error = "Invalid file name. Only JSON cache files can be deleted." });
            }

            var firmwareDirectory = Path.Combine(_env.ContentRootPath, "Firmware");
            var releaseCacheDirectory = Path.Combine(firmwareDirectory, "Releases");
            var filePath = Path.Combine(releaseCacheDirectory, fileName);

            if (!System.IO.File.Exists(filePath))
            {
                return NotFound(new { error = "Cache file not found" });
            }

            System.IO.File.Delete(filePath);
            _logger.LogInformation($"Deleted specific cache file: {fileName}");

            return Ok(new
            {
                success = true,
                message = $"Successfully deleted cache file: {fileName}"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error deleting cache file: {fileName}");
            return StatusCode(500, new { error = "Failed to delete cache file", message = ex.Message });
        }
    }


    private static string FormatAge(TimeSpan age)
    {
        if (age.TotalMinutes < 1)
            return "< 1 minute";
        if (age.TotalHours < 1)
            return $"{(int)age.TotalMinutes} minute{((int)age.TotalMinutes != 1 ? "s" : "")} ago";
        if (age.TotalDays < 1)
            return $"{(int)age.TotalHours} hour{((int)age.TotalHours != 1 ? "s" : "")} ago";

        return $"{(int)age.TotalDays} day{((int)age.TotalDays != 1 ? "s" : "")} ago";
    }
}