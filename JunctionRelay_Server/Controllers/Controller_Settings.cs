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
using Microsoft.Extensions.Caching.Memory;
using System.Data;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using JunctionRelayServer.Models;
using JunctionRelayServer.Interfaces;
using JunctionRelayServer.Services;

[ApiController]
[Route("api/settings")]
public class Controller_Settings : ControllerBase
{
    private readonly IWebHostEnvironment _env;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IMemoryCache _memoryCache;
    private readonly IService_Settings _settingsService;

    public Controller_Settings(IWebHostEnvironment env, IHttpClientFactory httpClientFactory, IMemoryCache memoryCache, IService_Settings settingsService)
    {
        _env = env;
        _httpClientFactory = httpClientFactory;
        _memoryCache = memoryCache;
        _settingsService = settingsService;
    }

    [HttpGet]
    public async Task<IActionResult> GetSettings()
    {
        var allSettings = await _settingsService.GetAllSettingsWithMetadataAsync();
        // Filter out authentication_enabled like the original
        var filteredSettings = allSettings.Where(s => s.Key != "authentication_enabled").ToList();
        return Ok(filteredSettings);
    }

    [HttpPost]
    public async Task<IActionResult> AddSetting([FromBody] Model_Setting setting)
    {
        await _settingsService.SetSettingAsync(setting.Key, setting.Value ?? "", setting.Description);

        // Return the setting with a mock ID (since we don't track IDs in the cache)
        setting.Id = setting.Key.GetHashCode(); // Simple ID generation for API compatibility
        return Ok(setting);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateSetting(int id, [FromBody] Model_Setting setting)
    {
        await _settingsService.SetSettingAsync(setting.Key, setting.Value ?? "", setting.Description);

        setting.Id = id; // Preserve the ID for API compatibility
        return Ok(setting);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteSetting(int id)
    {
        // Since we don't have ID-based lookups in the service, we need to find the key first
        // This is a limitation of the current approach - you might want to enhance the service
        // For now, we'll need to get all settings and find the one with matching ID
        var allSettings = await _settingsService.GetAllSettingsWithMetadataAsync();
        var settingToDelete = allSettings.FirstOrDefault(s => s.Id == id);

        if (settingToDelete != null)
        {
            var deleted = await _settingsService.DeleteSettingAsync(settingToDelete.Key);
            if (deleted)
            {
                return Ok();
            }
        }

        return NotFound();
    }

    // New route for application version
    [HttpGet("version")]
    public IActionResult GetVersion()
    {
        var version = Assembly.GetEntryAssembly()?.GetName().Version?.ToString() ?? "unknown";
        return Ok(new { version });
    }

    // New route for latest version check with in-memory caching
    [HttpGet("version/latest")]
    public async Task<IActionResult> GetLatestVersion()
    {
        try
        {
            const string cacheKey = "latest_version_result";

            // Check memory cache first
            if (_memoryCache.TryGetValue(cacheKey, out var cachedResult))
            {
                // Console.WriteLine($"[VERSION CHECK] Returning cached result from memory");
                return Ok(cachedResult);
            }

            // Console.WriteLine("[VERSION CHECK] No valid cache found, fetching fresh data...");

            // Try Docker Hub first
            var dockerResult = await TryGetLatestFromDockerHub();
            if (dockerResult != null)
            {
                var result = new { latest_version = dockerResult, source = "docker_hub" };

                // Cache for 1 hour
                _memoryCache.Set(cacheKey, result, TimeSpan.FromHours(1));

                // Console.WriteLine($"[VERSION CHECK] Successfully got latest version from Docker Hub: {dockerResult}");
                return Ok(result);
            }

            // Console.WriteLine("[VERSION CHECK] Docker Hub failed, falling back to GitHub...");

            // Fallback to GitHub
            var githubResult = await TryGetLatestFromGitHub();
            if (githubResult != null)
            {
                var result = new { latest_version = githubResult, source = "github" };

                // Cache for 1 hour
                _memoryCache.Set(cacheKey, result, TimeSpan.FromHours(1));

                // Console.WriteLine($"[VERSION CHECK] Successfully got latest version from GitHub: {githubResult}");
                return Ok(result);
            }

            // Console.WriteLine("[VERSION CHECK] Both Docker Hub and GitHub failed");
            return StatusCode(500, new { error = "Failed to fetch latest version from both Docker Hub and GitHub" });
        }
        catch (Exception ex)
        {
            // Console.WriteLine($"[VERSION CHECK] Unexpected error during version check: {ex}");
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

            // Console.WriteLine("[VERSION CHECK] Fetching from Docker Hub API...");

            var response = await client.GetAsync(
                "https://hub.docker.com/v2/repositories/catapultcase/junctionrelay/tags/?page_size=100"
            );

            if (!response.IsSuccessStatusCode)
            {
                // Console.WriteLine($"[VERSION CHECK] Docker Hub API returned {response.StatusCode}");
                return null;
            }

            var content = await response.Content.ReadAsStringAsync();
            var dockerData = JsonSerializer.Deserialize<DockerHubResponse>(content, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (dockerData?.Results == null)
            {
                // Console.WriteLine("[VERSION CHECK] Docker Hub response was null or had no results");
                return null;
            }

            // Console.WriteLine($"[VERSION CHECK] Docker Hub returned {dockerData.Results.Count} tags");

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

            // Console.WriteLine($"[VERSION CHECK] Found {versionTags.Count} valid version tags");

            var latestVersion = versionTags.FirstOrDefault()?.Name;

            if (latestVersion != null)
            {
                // Console.WriteLine($"[VERSION CHECK] Latest Docker Hub version: {latestVersion}");
            }

            return latestVersion;
        }
        catch (Exception)
        {
            // Console.WriteLine($"[VERSION CHECK] Error fetching from Docker Hub: {ex}");
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

            // Console.WriteLine("[VERSION CHECK] Fetching from GitHub API...");

            // Get all tags from GitHub
            var allTagsRes = await client.GetAsync("https://api.github.com/repos/catapultcase/JunctionRelay/tags");
            if (!allTagsRes.IsSuccessStatusCode)
            {
                // Console.WriteLine($"[VERSION CHECK] GitHub tags API returned {allTagsRes.StatusCode}");
                return null;
            }

            var allTagsContent = await allTagsRes.Content.ReadAsStringAsync();
            var allTags = JsonSerializer.Deserialize<List<GitHubTag>>(allTagsContent, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (allTags == null)
            {
                // Console.WriteLine("[VERSION CHECK] GitHub tags response was null");
                return null;
            }

            // Console.WriteLine($"[VERSION CHECK] GitHub returned {allTags.Count} tags");

            // Find semantic version tags and get the latest
            var versionTags = allTags
                .Where(tag => Regex.IsMatch(tag.Name, @"^v?\d+\.\d+\.\d+"))
                .Select(tag => tag.Name.TrimStart('v'))
                .OrderByDescending(ParseVersion)
                .ToList();

            // Console.WriteLine($"[VERSION CHECK] Found {versionTags.Count} valid version tags on GitHub");

            var latestVersion = versionTags.FirstOrDefault();

            if (latestVersion != null)
            {
                // Console.WriteLine($"[VERSION CHECK] Latest GitHub version: {latestVersion}");
            }

            return latestVersion;
        }
        catch (Exception)
        {
            // Console.WriteLine($"[VERSION CHECK] Error fetching from GitHub: {ex}");
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

    [HttpGet("flags")]
    public async Task<IActionResult> GetFeatureFlags()
    {
        var settingsDict = await _settingsService.GetAllSettingsAsync();

        var flags = new Dictionary<string, object>();

        foreach (var setting in settingsDict)
        {
            var trimmedValue = setting.Value?.Trim() ?? "";

            // Auto-detect and convert based on value content and key naming
            flags[setting.Key] = InferSettingType(setting.Key, trimmedValue);
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

        // Ensure service_eventengine_enabled exists with default if not in database
        if (!flags.ContainsKey("service_eventengine_enabled"))
        {
            flags["service_eventengine_enabled"] = false;
        }

        return Ok(flags);
    }

    /// <summary>
    /// Infers the type of a setting based on its key and value, and returns the appropriately typed object.
    /// This method uses heuristics to automatically determine if a setting should be boolean, integer, or string.
    /// </summary>
    private static object InferSettingType(string key, string value)
    {
        // 1. Check for boolean values (most common case)
        if (string.Equals(value, "true", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(value, "false", StringComparison.OrdinalIgnoreCase))
        {
            return string.Equals(value, "true", StringComparison.OrdinalIgnoreCase);
        }

        // 2. Check for integer values
        if (int.TryParse(value, out var intValue))
        {
            return intValue;
        }

        // 3. Handle special alignment settings (validate known values)
        if (key.EndsWith("_alignment", StringComparison.OrdinalIgnoreCase))
        {
            var alignmentValue = value.ToLowerInvariant();
            if (alignmentValue == "left" || alignmentValue == "center" || alignmentValue == "right")
            {
                return alignmentValue;
            }

            // Invalid alignment value - default to "right"
            Console.WriteLine($"Invalid alignment value '{value}' for {key}, defaulting to 'right'");
            return "right";
        }

        // 4. Default to string for everything else
        return value;
    }

    [HttpPost("toggle/{key}")]
    public async Task<IActionResult> ToggleByKey(
        string key,
        [FromBody] Model_AuthToggleRequest req)
    {
        var newValue = req.Enabled.ToString().ToLower();

        await _settingsService.SetSettingAsync(key, newValue, $"Auto-created flag for '{key}'");

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

    // GET: /api/settings/collector-testing
    [HttpGet("collector-testing")]
    public async Task<IActionResult> GetCollectorTestingSettings()
    {
        var enabled = await _settingsService.GetBoolSettingAsync("collector_testing_enabled", false);
        var frequency = await _settingsService.GetIntSettingAsync("collector_testing_frequency", 6);

        return Ok(new
        {
            enabled = enabled,
            frequency = frequency
        });
    }

    // POST: /api/settings/collector-testing
    [HttpPost("collector-testing")]
    public async Task<IActionResult> UpdateCollectorTestingSettings([FromBody] CollectorTestingSettingsRequest request)
    {
        if (request.Enabled.HasValue)
        {
            await _settingsService.SetSettingAsync("collector_testing_enabled", request.Enabled.Value.ToString());
        }

        if (request.Frequency.HasValue)
        {
            if (request.Frequency.Value < 1)
            {
                return BadRequest(new { message = "Frequency must be at least 1 hour" });
            }

            await _settingsService.SetSettingAsync("collector_testing_frequency", request.Frequency.Value.ToString());
        }

        return Ok(new { message = "Settings updated successfully" });
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
    private readonly IMemoryCache _memoryCache;

    public Controller_Cache(IWebHostEnvironment env, IMemoryCache memoryCache)
    {
        _env = env;
        _memoryCache = memoryCache;
    }

    [HttpGet("status")]
    public IActionResult GetCacheStatus()
    {
        try
        {
            var cacheFiles = new List<object>();

            // Check firmware cache directory
            var firmwareDirectory = Path.Combine(_env.ContentRootPath, "Firmware");
            var releaseCacheDirectory = Path.Combine(firmwareDirectory, "Releases");

            if (Directory.Exists(releaseCacheDirectory))
            {
                var firmwareCacheFiles = Directory.GetFiles(releaseCacheDirectory, "*.json")
                    .Select(filePath =>
                    {
                        var fileInfo = new FileInfo(filePath);
                        var age = DateTime.Now - fileInfo.LastWriteTime;

                        return new
                        {
                            name = fileInfo.Name,
                            type = "firmware",
                            sizeKB = Math.Round(fileInfo.Length / 1024.0, 2),
                            age = FormatAge(age),
                            lastModified = fileInfo.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss"),
                            isExpired = age.TotalHours > 24
                        };
                    });

                cacheFiles.AddRange(firmwareCacheFiles);
            }

            // Clean up old version cache file if it exists (migration cleanup)
            CleanupLegacyVersionCache();

            // Add memory cache info for version data
            var memoryEntries = new List<object>();
            if (_memoryCache.TryGetValue("latest_version_result", out var versionCache))
            {
                memoryEntries.Add(new
                {
                    name = "latest_version_result",
                    type = "memory",
                    sizeKB = 0.1, // Approximate size for version data
                    age = "In memory",
                    lastModified = "N/A",
                    isExpired = false
                });
            }

            cacheFiles.AddRange(memoryEntries);

            var sortedCacheFiles = cacheFiles.OrderBy(f => f.GetType().GetProperty("name")?.GetValue(f)).ToList();

            return Ok(new { cacheFiles = sortedCacheFiles });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error getting cache status: {ex}");
            return StatusCode(500, new { error = "Failed to get cache status", message = ex.Message });
        }
    }

    [HttpDelete("clear")]
    public IActionResult ClearCache()
    {
        try
        {
            int filesDeleted = 0;

            // Clear firmware cache
            var firmwareDirectory = Path.Combine(_env.ContentRootPath, "Firmware");
            var releaseCacheDirectory = Path.Combine(firmwareDirectory, "Releases");

            if (Directory.Exists(releaseCacheDirectory))
            {
                var cacheFiles = Directory.GetFiles(releaseCacheDirectory, "*.json");
                foreach (var file in cacheFiles)
                {
                    try
                    {
                        System.IO.File.Delete(file);
                        filesDeleted++;
                        Console.WriteLine($"Deleted firmware cache file: {Path.GetFileName(file)}");
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"Failed to delete firmware cache file: {Path.GetFileName(file)} - {ex}");
                    }
                }
            }

            // Clear memory cache for version data
            _memoryCache.Remove("latest_version_result");
            Console.WriteLine("Cleared version data from memory cache");

            // Clean up legacy version cache file if it exists
            CleanupLegacyVersionCache();

            Console.WriteLine($"Cache cleared. {filesDeleted} files deleted.");

            return Ok(new
            {
                success = true,
                filesDeleted,
                message = $"Successfully cleared {filesDeleted} cache file{(filesDeleted != 1 ? "s" : "")} and memory cache"
            });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error clearing cache: {ex}");
            return StatusCode(500, new { error = "Failed to clear cache", message = ex.Message });
        }
    }

    [HttpDelete("clear/{fileName}")]
    public IActionResult ClearSpecificCacheFile(string fileName)
    {
        try
        {
            // Handle memory cache entries
            if (fileName == "latest_version_result")
            {
                _memoryCache.Remove("latest_version_result");
                Console.WriteLine("Cleared version data from memory cache");
                return Ok(new
                {
                    success = true,
                    message = "Successfully cleared version data from memory cache"
                });
            }

            // Sanitize filename to prevent directory traversal
            fileName = Path.GetFileName(fileName);
            if (!fileName.EndsWith(".json"))
            {
                return BadRequest(new { error = "Invalid file name. Only JSON cache files can be deleted." });
            }

            // Check firmware cache directory
            var firmwareDirectory = Path.Combine(_env.ContentRootPath, "Firmware");
            var releaseCacheDirectory = Path.Combine(firmwareDirectory, "Releases");

            var possiblePaths = new[]
            {
                Path.Combine(releaseCacheDirectory, fileName)
            };

            var filePath = possiblePaths.FirstOrDefault(System.IO.File.Exists);

            if (filePath == null)
            {
                return NotFound(new { error = "Cache file not found" });
            }

            System.IO.File.Delete(filePath);
            Console.WriteLine($"Deleted specific cache file: {fileName}");

            return Ok(new
            {
                success = true,
                message = $"Successfully deleted cache file: {fileName}"
            });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error deleting cache file: {fileName} - {ex}");
            return StatusCode(500, new { error = "Failed to delete cache file", message = ex.Message });
        }
    }

    private void CleanupLegacyVersionCache()
    {
        try
        {
            // Clean up old version cache file from previous implementation
            var legacyVersionCacheFile = Path.Combine(_env.ContentRootPath, "Cache", "latest_version.json");
            if (System.IO.File.Exists(legacyVersionCacheFile))
            {
                System.IO.File.Delete(legacyVersionCacheFile);
                Console.WriteLine("Cleaned up legacy version cache file");
            }

            // Remove empty Cache directory if it was only used for version cache
            var cacheDirectory = Path.Combine(_env.ContentRootPath, "Cache");
            if (Directory.Exists(cacheDirectory) && !Directory.GetFiles(cacheDirectory).Any() && !Directory.GetDirectories(cacheDirectory).Any())
            {
                Directory.Delete(cacheDirectory);
                Console.WriteLine("Removed empty legacy Cache directory");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error during legacy cache cleanup: {ex}");
            // Don't throw - cleanup failure shouldn't break the main operation
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

// Request model for collector testing settings
public class CollectorTestingSettingsRequest
{
    public bool? Enabled { get; set; }
    public int? Frequency { get; set; }
}