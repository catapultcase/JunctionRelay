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

using System.Text.Json.Serialization;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Security.Cryptography;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_OTA
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Service_Database_Manager_Devices _deviceDbManager;
        private readonly IWebHostEnvironment _env;

        // GitHub repo for firmware files
        private const string GitHubRepo = "catapultcase/JunctionRelay";
        private const string GitHubApiBaseUrl = "https://api.github.com";

        // Keep firmware directory for caching
        private readonly string _firmwareDirectory;

        // Cache directory for releases
        private readonly string _releaseCacheDirectory;

        // Cache lifetime in hours
        private const int ReleaseCacheLifetimeHours = 24;

        // Force cache level checks - NOW STORES ALL RELEASES
        private static DateTime _lastForcedCheckTime = DateTime.MinValue;
        private static List<GitHubRelease>? _lastForcedCheckReleases = null;
        private static readonly object _forcedCheckLock = new object();
        private static readonly TimeSpan _forcedCheckCooldown = TimeSpan.FromSeconds(2);

        public Service_Manager_OTA(IHttpClientFactory httpClientFactory, Service_Database_Manager_Devices deviceDbManager, IWebHostEnvironment env)
        {
            _httpClientFactory = httpClientFactory;
            _deviceDbManager = deviceDbManager;
            _env = env;

            // Set firmware directory path to the Firmware folder in the application's root
            _firmwareDirectory = Path.Combine(env.ContentRootPath, "Firmware");
            _releaseCacheDirectory = Path.Combine(_firmwareDirectory, "Releases");

            if (!Directory.Exists(_firmwareDirectory))
            {
                Directory.CreateDirectory(_firmwareDirectory);
                Console.WriteLine($"[OTA] Created firmware cache directory at: {_firmwareDirectory}");
            }

            if (!Directory.Exists(_releaseCacheDirectory))
            {
                Directory.CreateDirectory(_releaseCacheDirectory);
                Console.WriteLine($"[OTA] Created release cache directory at: {_releaseCacheDirectory}");
            }
        }

        public async Task<Result<object>> CheckForUpdate(int deviceId, bool force = false)
        {
            const string FirmwarePrefix = "junctionrelay_";

            var device = await _deviceDbManager.GetDeviceByIdAsync(deviceId);
            if (device == null)
            {
                Console.WriteLine("[OTA] Device not found.");
                return Result<object>.Error(404, "Device not found");
            }

            bool ignoreUpdates = device.IgnoreUpdates;
            string normalizedTarget = NormalizeFirmwareTarget(device);

            // Console.WriteLine($"[OTA DEBUG] Device: {device.DeviceManufacturer} {device.DeviceModel}");
            // Console.WriteLine($"[OTA DEBUG] Normalized target: '{normalizedTarget}'");

            try
            {
                GitHubRelease? targetRelease = null;
                List<GitHubRelease>? releases = null;

                if (force)
                {
                    // Check if we have recent forced check results
                    lock (_forcedCheckLock)
                    {
                        var cacheAge = DateTime.Now - _lastForcedCheckTime;
                        if (cacheAge < _forcedCheckCooldown && _lastForcedCheckReleases != null)
                        {
                            Console.WriteLine($"[OTA] Using recent forced check result (age: {cacheAge.TotalSeconds:F1}s)");
                            releases = _lastForcedCheckReleases;
                        }
                    }

                    // If no recent forced check, fetch from GitHub
                    if (releases == null)
                    {
                        Console.WriteLine("[OTA] Force check - fetching fresh data from GitHub");
                        releases = await GetLatestReleasesFromGitHub();
                        if (releases != null && releases.Any())
                        {
                            await SaveReleasesToCache(releases);

                            // Store in forced check cache
                            lock (_forcedCheckLock)
                            {
                                _lastForcedCheckTime = DateTime.Now;
                                _lastForcedCheckReleases = releases;
                            }
                        }
                    }

                    // Find release for this device from the releases list
                    if (releases != null)
                    {
                        targetRelease = FindReleaseForTarget(releases, normalizedTarget);
                    }
                }
                else
                {
                    // Non-forced check - use regular cache logic
                    releases = await GetReleasesFromCache();

                    if (releases != null)
                    {
                        // Cache exists - search within it
                        Console.WriteLine($"[OTA CACHE] Cache exists with {releases.Count} releases");
                        targetRelease = FindReleaseForTarget(releases, normalizedTarget);

                        if (targetRelease == null)
                        {
                            Console.WriteLine($"[OTA CACHE] No firmware found in cache for target: {normalizedTarget}");
                            return Result<object>.Error(404, $"No firmware found for target '{normalizedTarget}'");
                        }
                    }
                    else
                    {
                        // Cache doesn't exist - fetch from GitHub
                        Console.WriteLine("[OTA CACHE] No cache found, fetching from GitHub");
                        releases = await GetLatestReleasesFromGitHub();
                        if (releases != null && releases.Any())
                        {
                            await SaveReleasesToCache(releases);
                            targetRelease = FindReleaseForTarget(releases, normalizedTarget);
                        }
                    }
                }

                if (targetRelease == null)
                {
                    Console.WriteLine("[OTA] No releases found on GitHub.");
                    return Result<object>.Error(404, "No firmware releases found.");
                }

                //Console.WriteLine("[OTA DEBUG] Available firmware files:");
                //foreach (var asset in targetRelease.Assets.Where(a => a.Name.EndsWith(".bin")))
                //{
                //    Console.WriteLine($"[OTA DEBUG]   - {asset.Name}");
                //}

                // Use flexible firmware matching
                var matchingAsset = FindMatchingFirmware(targetRelease.Assets, normalizedTarget);

                if (matchingAsset == null)
                {
                    // Console.WriteLine($"[OTA] No matching firmware asset found for target '{normalizedTarget}'");
                    // Console.WriteLine($"[OTA] Searched for pattern: '{FirmwarePrefix}{normalizedTarget}_v*.bin'");
                    return Result<object>.Error(404, $"No firmware found for target '{normalizedTarget}'");
                }

                // Console.WriteLine($"[OTA DEBUG] Found matching firmware: {matchingAsset.Name}");

                string versionStr = Path.GetFileNameWithoutExtension(matchingAsset.Name);
                int vIndex = versionStr.LastIndexOf('_') + 2;
                string latestVersion = versionStr.Substring(vIndex);

                string currentVersion = device.FirmwareVersion?.Replace("JunctionRelay ", "").TrimStart('v') ?? "0.0.0";
                bool isOutdated = CompareVersions(currentVersion, latestVersion) < 0;

                string tagName = !string.IsNullOrEmpty(targetRelease.TagName)
                    ? targetRelease.TagName
                    : $"v{latestVersion}";

                string downloadUrl = $"https://github.com/{GitHubRepo}/releases/download/{tagName}/{matchingAsset.Name}";

                // Console.WriteLine($"[OTA DEBUG] Current: {currentVersion}, Latest: {latestVersion}, Outdated: {isOutdated}");

                var result = new
                {
                    current_version = currentVersion,
                    latest_version = latestVersion,
                    firmware_file = matchingAsset.Name,
                    firmware_url = downloadUrl,
                    is_outdated = isOutdated,
                    ignore_updates = ignoreUpdates,
                    firmware_hash = matchingAsset.Sha256Hash
                };

                return Result<object>.Success(result);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[OTA] Error checking for update: {ex.Message}");
                return Result<object>.Error(500, $"Error checking for update: {ex.Message}");
            }
        }

        // Method to verify device firmware hash      

        // Method to verify device firmware hash
        public async Task<Result<object>> VerifyDeviceFirmware(int deviceId)
        {
            // Console.WriteLine($"[OTA VERIFY START] Device {deviceId}");

            var device = await _deviceDbManager.GetDeviceByIdAsync(deviceId);
            if (device == null)
            {
                return Result<object>.Error(404, "Device not found");
            }

            // Console.WriteLine($"[OTA VERIFY] Current HasCustomFirmware: {device.HasCustomFirmware}");

            try
            {
                // Get device's current firmware hash
                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(10);

                // Console.WriteLine($"[OTA VERIFY] Attempting to get firmware hash from: http://{device.IPAddress}/api/firmware-hash");
                var response = await client.GetAsync($"http://{device.IPAddress}/api/firmware-hash");

                if (!response.IsSuccessStatusCode)
                {
                    // Console.WriteLine($"[OTA VERIFY] Device returned {response.StatusCode} - assuming custom firmware");

                    // Device can't provide hash (older firmware or custom firmware) - mark as custom
                    var updateResult = await _deviceDbManager.SetCustomFirmwareAsync(device.Id, true);
                    // Console.WriteLine($"[OTA VERIFY] Set HasCustomFirmware=true, result: {updateResult}");

                    var result = new
                    {
                        device_id = deviceId,
                        firmware_hash = "unavailable",
                        is_authentic = false,
                        matching_firmware = (string?)null,
                        custom_firmware = true
                    };

                    // Console.WriteLine($"[OTA VERIFY] Device {deviceId} verification result: authentic=false (no hash endpoint)");
                    return Result<object>.Success(result);
                }

                var responseContent = await response.Content.ReadAsStringAsync();
                // Console.WriteLine($"[OTA VERIFY DEBUG] Raw response from device: {responseContent}");

                var hashResponse = JsonSerializer.Deserialize<Dictionary<string, object>>(responseContent);

                if (!hashResponse.TryGetValue("firmware_hash", out var hashObj) || hashObj?.ToString() is not string deviceHash)
                {
                    // Console.WriteLine("[OTA VERIFY] Invalid hash response - assuming custom firmware");

                    var updateResult = await _deviceDbManager.SetCustomFirmwareAsync(device.Id, true);
                    // Console.WriteLine($"[OTA VERIFY] Set HasCustomFirmware=true, result: {updateResult}");

                    var result = new
                    {
                        device_id = deviceId,
                        firmware_hash = "invalid_response",
                        is_authentic = false,
                        matching_firmware = (string?)null,
                        custom_firmware = true
                    };

                    return Result<object>.Success(result);
                }

                // Console.WriteLine($"[OTA VERIFY] Device hash: {deviceHash}");

                // Check existing cached releases first (efficient path)
                var cachedReleases = await GetReleasesFromCache();
                if (cachedReleases != null)
                {
                    // Console.WriteLine($"[OTA VERIFY DEBUG] Checking device hash against {cachedReleases.Count} cached releases");
                    var matchingFirmware = FindFirmwareByHashWithDebug(cachedReleases, deviceHash);

                    if (matchingFirmware != null)
                    {
                        // Console.WriteLine($"[OTA VERIFY] ✅ MATCH FOUND in cache: {matchingFirmware.Name}");
                        // Console.WriteLine($"[OTA VERIFY] Setting HasCustomFirmware=false");

                        var updateResult = await _deviceDbManager.SetCustomFirmwareAsync(device.Id, false);
                        // Console.WriteLine($"[OTA VERIFY] Database update result: {updateResult}");

                        var result = new
                        {
                            device_id = deviceId,
                            firmware_hash = deviceHash,
                            is_authentic = true,
                            matching_firmware = matchingFirmware.Name,
                            custom_firmware = false
                        };

                        // Console.WriteLine($"[OTA VERIFY] Device {deviceId} verification result: authentic=true (cached)");
                        return Result<object>.Success(result);
                    }
                    else
                    {
                        // Console.WriteLine($"[OTA VERIFY DEBUG] ❌ No match found in cached releases");
                    }
                }
                else
                {
                    // Console.WriteLine("[OTA VERIFY DEBUG] No cached releases found");
                }

                // Only if no match in cache, refresh and try again
                // Console.WriteLine("[OTA VERIFY DEBUG] No match in cache - refreshing firmware database...");
                var freshReleases = await GetLatestReleasesFromGitHub();
                if (freshReleases != null)
                {
                    await SaveReleasesToCache(freshReleases);
                    // Console.WriteLine($"[OTA VERIFY DEBUG] Refreshed cache with {freshReleases.Count} releases");

                    var matchingFirmware = FindFirmwareByHashWithDebug(freshReleases, deviceHash);
                    bool isAuthentic = matchingFirmware != null;

                    // Console.WriteLine($"[OTA VERIFY] Final result: isAuthentic={isAuthentic}");
                    // Console.WriteLine($"[OTA VERIFY] Setting HasCustomFirmware={!isAuthentic}");

                    var updateResult = await _deviceDbManager.SetCustomFirmwareAsync(device.Id, !isAuthentic);
                    // Console.WriteLine($"[OTA VERIFY] Database update result: {updateResult}");

                    // Verify the database was actually updated
                    var verifyDevice = await _deviceDbManager.GetDeviceByIdAsync(deviceId);
                    // Console.WriteLine($"[OTA VERIFY] After update - HasCustomFirmware: {verifyDevice?.HasCustomFirmware}");

                    var result = new
                    {
                        device_id = deviceId,
                        firmware_hash = deviceHash,
                        is_authentic = isAuthentic,
                        matching_firmware = matchingFirmware?.Name,
                        custom_firmware = !isAuthentic
                    };

                    // Console.WriteLine($"[OTA VERIFY] Device {deviceId} verification result: authentic={isAuthentic} (fresh)");
                    return Result<object>.Success(result);
                }
                else
                {
                    // Console.WriteLine("[OTA VERIFY] Could not load firmware database - assuming custom firmware");

                    var updateResult = await _deviceDbManager.SetCustomFirmwareAsync(device.Id, true);
                    // Console.WriteLine($"[OTA VERIFY] Set HasCustomFirmware=true, result: {updateResult}");

                    var result = new
                    {
                        device_id = deviceId,
                        firmware_hash = "database_unavailable",
                        is_authentic = false,
                        matching_firmware = (string?)null,
                        custom_firmware = true
                    };

                    return Result<object>.Success(result);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[OTA VERIFY ERROR] Exception: {ex.Message}");

                // On any exception, assume custom firmware and update database
                try
                {
                    var updateResult = await _deviceDbManager.SetCustomFirmwareAsync(device.Id, true);
                    Console.WriteLine($"[OTA VERIFY] Exception handler - Set HasCustomFirmware=true, result: {updateResult}");
                }
                catch (Exception dbEx)
                {
                    Console.WriteLine($"[OTA VERIFY ERROR] Database update failed in exception handler: {dbEx.Message}");
                }

                return Result<object>.Error(500, $"Verification failed: {ex.Message}");
            }
        }

        // NEW: Clear hash cache and force recalculation
        private async Task ClearHashCacheAndRecalculate()
        {
            // Console.WriteLine("[OTA CACHE CLEAR] Clearing firmware hash cache to force recalculation...");

            try
            {
                // Delete the cache file to force fresh download and hash calculation
                var cacheFilePath = GetGlobalCacheFilePath();
                if (File.Exists(cacheFilePath))
                {
                    File.Delete(cacheFilePath);
                    // Console.WriteLine("[OTA CACHE CLEAR] Cache file deleted");
                }

                // Force fresh fetch from GitHub with new hashing method
                var releases = await GetLatestReleasesFromGitHub();
                if (releases != null)
                {
                    await SaveReleasesToCache(releases);
                    // Console.WriteLine($"[OTA CACHE CLEAR] Recalculated hashes for {releases.Count} releases");
                }
            }
            catch (Exception ex)
            {
                // Console.WriteLine($"[OTA CACHE CLEAR] Error clearing cache: {ex.Message}");
            }
        }

        public async Task<Result<object>> GetAllReleases(int deviceId, bool forceRefresh = false)
        {
            string? normalizedTarget = null;
            if (deviceId > 0)
            {
                var device = await _deviceDbManager.GetDeviceByIdAsync(deviceId);
                if (device == null)
                    return Result<object>.Error(404, "Device not found.");

                normalizedTarget = NormalizeFirmwareTarget(device);
                // Console.WriteLine($"[OTA RELEASES] Looking for releases for device target: '{normalizedTarget}'");
            }

            try
            {
                List<GitHubRelease>? githubReleases = null;

                if (forceRefresh)
                {
                    githubReleases = await GetLatestReleasesFromGitHub();
                    if (githubReleases != null)
                        await SaveReleasesToCache(githubReleases);
                }
                else
                {
                    githubReleases = await GetReleasesFromCache();
                    if (githubReleases == null)
                    {
                        githubReleases = await GetLatestReleasesFromGitHub();
                        if (githubReleases != null)
                            await SaveReleasesToCache(githubReleases);
                    }
                }

                if (githubReleases == null || !githubReleases.Any())
                    return Result<object>.Error(404, "No firmware releases found.");

                // Get all firmware releases (containing any .bin files)
                var allFirmwareReleases = githubReleases
                    .Where(release =>
                        release.Assets.Any(a =>
                            a.Name.StartsWith("junctionrelay_") &&
                            a.Name.EndsWith(".bin")));

                // Console.WriteLine($"[OTA RELEASES] Found {allFirmwareReleases.Count()} total firmware releases");

                // For device-specific requests, find ALL releases that contain firmware for this exact device
                if (deviceId > 0 && !string.IsNullOrEmpty(normalizedTarget))
                {
                    var deviceSpecificReleases = allFirmwareReleases
                        .Where(release =>
                            release.Assets.Any(a =>
                                a.Name.StartsWith($"junctionrelay_{normalizedTarget}_v") &&
                                a.Name.EndsWith(".bin")))
                        .Select(release => new
                        {
                            name = release.Name,
                            assets = release.Assets
                                     .Where(a =>
                                         a.Name.StartsWith($"junctionrelay_{normalizedTarget}_v") &&
                                         a.Name.EndsWith(".bin"))
                                     .Select(a => a.Name)
                                     .ToList()
                        })
                        .Where(r => r.assets.Any()) // Only include releases that have .bin files for this device
                        .OrderByDescending(r => {
                            // Extract version for ordering (newest first)
                            var versionMatch = System.Text.RegularExpressions.Regex.Match(r.name, @"v?(\d+\.\d+\.\d+)");
                            if (versionMatch.Success && Version.TryParse(versionMatch.Groups[1].Value, out var version))
                            {
                                return version;
                            }
                            return new Version(0, 0, 0);
                        })
                        .ToList();

                    // Console.WriteLine($"[OTA RELEASES] Found {deviceSpecificReleases.Count} releases with firmware for '{normalizedTarget}'");

                    //foreach (var release in deviceSpecificReleases)
                    //{
                    //    Console.WriteLine($"[OTA RELEASES]   - {release.name} ({release.assets.Count} assets for this device)");
                    //    foreach (var asset in release.assets)
                    //    {
                    //        Console.WriteLine($"[OTA RELEASES]     * {asset}");
                    //    }
                    //}

                    return Result<object>.Success(deviceSpecificReleases);
                }
                else
                {
                    // No device specified, return all firmware releases
                    var releases = allFirmwareReleases
                        .Select(release => new
                        {
                            name = release.Name,
                            assets = release.Assets
                                     .Where(a => a.Name.EndsWith(".bin"))
                                     .Select(a => a.Name)
                                     .ToList()
                        })
                        .ToList();

                    return Result<object>.Success(releases);
                }
            }
            catch (Exception ex)
            {
                return Result<object>.Error(500, $"Error fetching releases: {ex.Message}");
            }
        }

        public async Task<Result<object>> UploadFirmware(int deviceId, IFormFile firmwareFile)
        {
            if (firmwareFile == null || firmwareFile.Length == 0)
            {
                return Result<object>.Error(400, "No firmware file uploaded.");
            }

            var device = await _deviceDbManager.GetDeviceByIdAsync(deviceId);
            if (device == null)
            {
                return Result<object>.Error(404, "Device not found.");
            }

            try
            {
                string filePath = Path.Combine(_firmwareDirectory, firmwareFile.FileName);
                using var stream = new FileStream(filePath, FileMode.Create);
                await firmwareFile.CopyToAsync(stream);
                return Result<object>.Success(new { message = "Custom firmware uploaded successfully." });
            }
            catch (Exception ex)
            {
                return Result<object>.Error(500, $"Firmware upload failed: {ex.Message}");
            }
        }

        // UPDATED: GetFirmware method with version support
        public async Task<Result<object>> GetFirmware(
            int deviceId,
            string? releaseTag = null,
            string? version = null,  // NEW: Add version parameter
            bool force = false,
            string requestScheme = "http",
            string requestHost = "localhost")
        {
            Console.WriteLine($"[OTA] GetFirmware called for device {deviceId}, release: {releaseTag}, version: {version}, force: {force}");

            // Get device information to determine the target firmware
            var device = await _deviceDbManager.GetDeviceByIdAsync(deviceId);
            if (device == null)
            {
                return Result<object>.Error(404, "Device not found");
            }

            string normalizedTarget = NormalizeFirmwareTarget(device);
            Console.WriteLine($"[OTA] Normalized target for device: {normalizedTarget}");

            try
            {
                // Get all releases from cache or GitHub
                List<GitHubRelease>? releases = await GetReleasesFromCache();
                if (releases == null || force)
                {
                    Console.WriteLine("[OTA] Fetching fresh releases from GitHub");
                    releases = await GetLatestReleasesFromGitHub();
                    if (releases != null)
                    {
                        await SaveReleasesToCache(releases);
                    }
                }

                if (releases == null || !releases.Any())
                {
                    return Result<object>.Error(404, "No firmware releases found");
                }

                // NEW: If version is provided, find the release that contains firmware for this device with that version
                if (!string.IsNullOrEmpty(version))
                {
                    Console.WriteLine($"[OTA] Looking for device firmware with version: {version}");

                    // Look for any release that has a firmware file for this device with the specified version
                    var targetRelease = releases.FirstOrDefault(release =>
                        release.Assets.Any(asset =>
                            asset.Name.StartsWith($"junctionrelay_{normalizedTarget}_v{version}") &&
                            asset.Name.EndsWith(".bin")));

                    if (targetRelease == null)
                    {
                        Console.WriteLine($"[OTA] No firmware found for device target '{normalizedTarget}' with version '{version}'");
                        return Result<object>.Error(404, $"No firmware found for this device with version {version}");
                    }

                    // Find the specific asset for this device
                    var matchingAsset = targetRelease.Assets.FirstOrDefault(asset =>
                        asset.Name.StartsWith($"junctionrelay_{normalizedTarget}_v{version}") &&
                        asset.Name.EndsWith(".bin"));

                    if (matchingAsset == null)
                    {
                        return Result<object>.Error(404, $"Firmware asset not found for version {version}");
                    }

                    Console.WriteLine($"[OTA] Found firmware: {matchingAsset.Name} in release: {targetRelease.TagName}");

                    // Download and return the firmware
                    return await DownloadFirmware(targetRelease.TagName, matchingAsset.Name);
                }

                // Fallback to existing release tag logic if no version specified
                if (!string.IsNullOrEmpty(releaseTag))
                {
                    var targetRelease = releases.FirstOrDefault(r =>
                        string.Equals(r.TagName, releaseTag, StringComparison.OrdinalIgnoreCase));

                    if (targetRelease != null)
                    {
                        var matchingAsset = FindMatchingFirmware(targetRelease.Assets, normalizedTarget);
                        if (matchingAsset != null)
                        {
                            return await DownloadFirmware(targetRelease.TagName, matchingAsset.Name);
                        }
                    }
                }

                // If no version or release tag, find the latest compatible firmware
                var latestRelease = FindReleaseForTarget(releases, normalizedTarget);
                if (latestRelease != null)
                {
                    var latestAsset = FindMatchingFirmware(latestRelease.Assets, normalizedTarget);
                    if (latestAsset != null)
                    {
                        return await DownloadFirmware(latestRelease.TagName, latestAsset.Name);
                    }
                }

                return Result<object>.Error(404, "No compatible firmware found for this device");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[OTA] Error in GetFirmware: {ex.Message}");
                return Result<object>.Error(500, $"Failed to get firmware: {ex.Message}");
            }
        }

        // NEW: Helper method to download firmware
        private async Task<Result<object>> DownloadFirmware(string releaseTagName, string assetName)
        {
            string downloadUrl = $"https://github.com/{GitHubRepo}/releases/download/{releaseTagName}/{assetName}";
            Console.WriteLine($"[OTA] Download URL: {downloadUrl}");

            var client = _httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Accept.Add(
                new MediaTypeWithQualityHeaderValue("application/octet-stream"));
            client.DefaultRequestHeaders.UserAgent.Add(
                new ProductInfoHeaderValue("JunctionRelayServer", "1.0"));

            var response = await client.GetAsync(downloadUrl);
            if (!response.IsSuccessStatusCode)
            {
                return Result<object>.Error(500,
                    $"Failed to download firmware from GitHub. Status: {response.StatusCode}");
            }

            var memoryStream = new MemoryStream();
            await response.Content.CopyToAsync(memoryStream);
            memoryStream.Position = 0;

            Console.WriteLine($"[OTA] Successfully downloaded firmware: {assetName} ({memoryStream.Length} bytes)");

            return Result<object>.FileResult(memoryStream, assetName);
        }

        // UPDATED: PollForUpdate method with version support
        public async Task<Result<object>> PollForUpdate(int deviceId, bool force = false, string requestScheme = "http", string requestHost = "localhost", string? releaseTag = null, string? version = null)
        {
            var device = await _deviceDbManager.GetDeviceByIdAsync(deviceId);
            if (device == null)
                return Result<object>.Error(404, "Device not found.");

            string ip = device.IPAddress ?? string.Empty;
            if (string.IsNullOrWhiteSpace(ip))
                return Result<object>.Error(400, "Device IP address is missing.");

            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(10);
            string baseUrl = $"{requestScheme}://{requestHost}";

            Console.WriteLine($"[OTA POLL] Polling device {deviceId} for update. Force: {force}, Release: {releaseTag}, Version: {version}");

            if (force)
            {
                try
                {
                    await client.GetAsync($"http://{ip}/update?force=true");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[OTA POLL] Expected error triggering device update: {ex.Message}");
                }

                // Wait a moment for the device to process
                await Task.Delay(3000);

                try
                {
                    // NEW: If we have a specific version, use that to set the firmware version
                    if (!string.IsNullOrEmpty(version))
                    {
                        string fullVersion = $"JunctionRelay v{version}";
                        await _deviceDbManager.SetFirmwareVersionAsync(device.Id, fullVersion);

                        Console.WriteLine($"[OTA POLL] Updated device {deviceId} to version {fullVersion} from specified version {version}");
                        return Result<object>.Success(new
                        {
                            updated = true,
                            version = fullVersion
                        });
                    }

                    // If we have a specific release, we need to determine what version that represents
                    if (!string.IsNullOrEmpty(releaseTag))
                    {
                        var releases = await GetReleasesFromCache();
                        if (releases == null)
                        {
                            releases = await GetLatestReleasesFromGitHub();
                            if (releases != null)
                            {
                                await SaveReleasesToCache(releases);
                            }
                        }

                        if (releases != null)
                        {
                            var targetRelease = releases.FirstOrDefault(r =>
                                string.Equals(r.TagName, releaseTag, StringComparison.OrdinalIgnoreCase) ||
                                string.Equals(r.Name, releaseTag, StringComparison.OrdinalIgnoreCase));

                            if (targetRelease != null)
                            {
                                string normalizedTarget = NormalizeFirmwareTarget(device);
                                var matchingAsset = FindMatchingFirmware(targetRelease.Assets, normalizedTarget);

                                if (matchingAsset != null)
                                {
                                    // Extract version from the firmware filename
                                    string versionStr = Path.GetFileNameWithoutExtension(matchingAsset.Name);
                                    int vIndex = versionStr.LastIndexOf('_') + 2;
                                    if (vIndex < versionStr.Length)
                                    {
                                        string extractedVersion = versionStr.Substring(vIndex);
                                        string fullVersion = $"JunctionRelay v{extractedVersion}";
                                        await _deviceDbManager.SetFirmwareVersionAsync(device.Id, fullVersion);

                                        Console.WriteLine($"[OTA POLL] Updated device {deviceId} to version {fullVersion} from release {releaseTag}");
                                        return Result<object>.Success(new
                                        {
                                            updated = true,
                                            version = fullVersion,
                                            release = releaseTag
                                        });
                                    }
                                }
                            }
                        }
                    }

                    // Fallback to checking via API if release/version-specific logic didn't work
                    var checkResponse = await client.GetAsync($"{baseUrl}/api/ota/check/{deviceId}?force={force}");
                    if (checkResponse.IsSuccessStatusCode)
                    {
                        var json = await checkResponse.Content.ReadAsStringAsync();
                        var otaResponse = JsonSerializer.Deserialize<Dictionary<string, object>>(json) ?? new();

                        if (otaResponse.TryGetValue("latest_version", out var lv))
                        {
                            string latestVersion = lv?.ToString() ?? "unknown";
                            string fullVersion = $"JunctionRelay v{latestVersion}";
                            await _deviceDbManager.SetFirmwareVersionAsync(device.Id, fullVersion);

                            Console.WriteLine($"[OTA POLL] Updated device {deviceId} to version {fullVersion} (fallback method)");
                            return Result<object>.Success(new
                            {
                                updated = true,
                                version = fullVersion
                            });
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[OTA POLL] Error during forced update polling: {ex.Message}");
                    return Result<object>.Error(500, ex.Message);
                }
            }

            // Non-forced polling logic (existing code)
            try
            {
                var checkResponse = await client.GetAsync($"{baseUrl}/api/ota/check/{deviceId}");
                if (checkResponse.IsSuccessStatusCode)
                {
                    var json = await checkResponse.Content.ReadAsStringAsync();
                    var otaResponse = JsonSerializer.Deserialize<Dictionary<string, object>>(json) ?? new();

                    otaResponse.TryGetValue("current_version", out var cvObj);
                    otaResponse.TryGetValue("latest_version", out var lvObj);
                    otaResponse.TryGetValue("is_outdated", out var ioObj);

                    string latestVersion = lvObj?.ToString() ?? "unknown";
                    bool isOutdated = false;
                    if (ioObj != null && bool.TryParse(ioObj.ToString(), out var parsed))
                        isOutdated = parsed;

                    if (isOutdated)
                    {
                        string fullVersion = $"JunctionRelay v{latestVersion}";
                        await _deviceDbManager.SetFirmwareVersionAsync(device.Id, fullVersion);
                        return Result<object>.Success(new { updated = true, version = fullVersion });
                    }
                    else
                    {
                        return Result<object>.Success(new { updated = false, message = "Firmware is already up-to-date." });
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[OTA POLL] Error during standard polling: {ex.Message}");
                return Result<object>.Error(500, ex.Message);
            }

            return Result<object>.Success(new { updated = false, message = "No updates detected." });
        }

        #region Helper Methods

        private GitHubAsset? FindFirmwareByHash(List<GitHubRelease> releases, string hash)
        {
            foreach (var release in releases)
            {
                foreach (var asset in release.Assets)
                {
                    if (asset.Name.EndsWith(".bin") && asset.Sha256Hash == hash)
                    {
                        Console.WriteLine($"[OTA VERIFY] Found matching firmware: {asset.Name} for hash: {hash[..8]}...");
                        return asset;
                    }
                }
            }
            return null;
        }

        // Enhanced hash matching with detailed debug logging
        private GitHubAsset? FindFirmwareByHashWithDebug(List<GitHubRelease> releases, string deviceHash)
        {
            Console.WriteLine($"[OTA HASH DEBUG] Starting hash comparison for device hash: {deviceHash}");
            Console.WriteLine($"[OTA HASH DEBUG] Device hash normalized: {deviceHash.ToLowerInvariant()}");

            int totalAssets = 0;
            int binAssets = 0;

            foreach (var release in releases)
            {
                Console.WriteLine($"[OTA HASH DEBUG] Checking release: {release.Name} (TagName: {release.TagName})");
                Console.WriteLine($"[OTA HASH DEBUG] Release has {release.Assets.Count} assets");

                foreach (var asset in release.Assets)
                {
                    totalAssets++;

                    if (!asset.Name.EndsWith(".bin"))
                    {
                        Console.WriteLine($"[OTA HASH DEBUG] Skipping non-bin asset: {asset.Name}");
                        continue;
                    }

                    binAssets++;
                    Console.WriteLine($"[OTA HASH DEBUG] Checking bin asset: {asset.Name}");

                    if (string.IsNullOrEmpty(asset.Sha256Hash))
                    {
                        Console.WriteLine($"[OTA HASH DEBUG] WARNING: Asset {asset.Name} has no hash stored!");
                        continue;
                    }

                    Console.WriteLine($"[OTA HASH DEBUG] Asset hash: {asset.Sha256Hash}");
                    Console.WriteLine($"[OTA HASH DEBUG] Asset hash length: {asset.Sha256Hash.Length}");

                    // Try exact match
                    if (asset.Sha256Hash == deviceHash)
                    {
                        Console.WriteLine($"[OTA HASH DEBUG] ✅ EXACT MATCH found: {asset.Name}");
                        return asset;
                    }

                    // Try case-insensitive match
                    if (string.Equals(asset.Sha256Hash, deviceHash, StringComparison.OrdinalIgnoreCase))
                    {
                        Console.WriteLine($"[OTA HASH DEBUG] ✅ CASE-INSENSITIVE MATCH found: {asset.Name}");
                        return asset;
                    }

                    // Try both normalized to lowercase
                    var normalizedAssetHash = asset.Sha256Hash.ToLowerInvariant();
                    var normalizedDeviceHash = deviceHash.ToLowerInvariant();

                    if (normalizedAssetHash == normalizedDeviceHash)
                    {
                        Console.WriteLine($"[OTA HASH DEBUG] ✅ NORMALIZED MATCH found: {asset.Name}");
                        return asset;
                    }

                    Console.WriteLine($"[OTA HASH DEBUG] ❌ No match for {asset.Name}");
                    Console.WriteLine($"[OTA HASH DEBUG]   Asset:  '{normalizedAssetHash}'");
                    Console.WriteLine($"[OTA HASH DEBUG]   Device: '{normalizedDeviceHash}'");

                    // Show character-by-character comparison for first few characters
                    if (normalizedAssetHash.Length == normalizedDeviceHash.Length)
                    {
                        var differences = new List<int>();
                        for (int i = 0; i < Math.Min(normalizedAssetHash.Length, 16); i++)
                        {
                            if (normalizedAssetHash[i] != normalizedDeviceHash[i])
                            {
                                differences.Add(i);
                            }
                        }

                        if (differences.Any())
                        {
                            Console.WriteLine($"[OTA HASH DEBUG]   Character differences at positions: {string.Join(", ", differences)}");
                        }
                    }
                    else
                    {
                        Console.WriteLine($"[OTA HASH DEBUG]   Length mismatch: Asset={normalizedAssetHash.Length}, Device={normalizedDeviceHash.Length}");
                    }
                }
            }

            // Console.WriteLine($"[OTA HASH DEBUG] Hash comparison complete. Checked {totalAssets} total assets, {binAssets} .bin assets");
            // Console.WriteLine($"[OTA HASH DEBUG] ❌ NO MATCH FOUND for device hash: {deviceHash}");

            return null;
        }

        private bool IsFirmwareRelease(GitHubRelease release)
        {
            // Check if the release name contains "ESP32 Family Firmware" or "OTA Firmware" (for backwards compatibility)
            bool nameContainsFirmware = release.Name.Contains("ESP32 Family Firmware", StringComparison.OrdinalIgnoreCase) ||
                                       release.Name.Contains("OTA Firmware", StringComparison.OrdinalIgnoreCase);

            // Also check if the release has .bin firmware files
            bool hasFirmwareAssets = release.Assets?.Any(asset =>
                asset.Name.StartsWith("junctionrelay_") &&
                asset.Name.EndsWith(".bin")
            ) ?? false;

            // Console.WriteLine($"[OTA DEBUG] Release '{release.Name}': nameContainsFirmware={nameContainsFirmware}, hasFirmwareAssets={hasFirmwareAssets}");

            // A release is considered a firmware release if either:
            // 1. The name contains firmware keywords, OR
            // 2. It has firmware .bin assets with the correct naming convention
            return nameContainsFirmware || hasFirmwareAssets;
        }

        private GitHubAsset? FindMatchingFirmware(List<GitHubAsset> assets, string normalizedTarget)
        {
            const string FirmwarePrefix = "junctionrelay_";

            // Console.WriteLine($"[OTA DEBUG] Looking for firmware matching: '{normalizedTarget}'");

            // First try exact match
            var exactMatch = assets.FirstOrDefault(a =>
                a.Name.StartsWith($"{FirmwarePrefix}{normalizedTarget}_v") &&
                a.Name.EndsWith(".bin"));

            if (exactMatch != null)
            {
                // Console.WriteLine($"[OTA DEBUG] Found exact match: {exactMatch.Name}");
                return exactMatch;
            }

            // Console.WriteLine($"[OTA DEBUG] No exact match found for pattern: '{FirmwarePrefix}{normalizedTarget}_v*.bin'");

            // Try fuzzy matching - look for assets that contain the key parts
            string[] targetParts = normalizedTarget.Split('_');
            // Console.WriteLine($"[OTA DEBUG] Trying fuzzy match with parts: [{string.Join(", ", targetParts)}]");

            var fuzzyMatches = assets.Where(a =>
                a.Name.StartsWith(FirmwarePrefix) &&
                a.Name.EndsWith(".bin") &&
                targetParts.All(part => a.Name.Contains(part))
            ).ToList();

            if (fuzzyMatches.Count == 1)
            {
                // Console.WriteLine($"[OTA DEBUG] Found single fuzzy match: {fuzzyMatches[0].Name}");
                return fuzzyMatches[0];
            }
            else if (fuzzyMatches.Count > 1)
            {
                // Console.WriteLine($"[OTA DEBUG] Multiple fuzzy matches found:");
                foreach (var match in fuzzyMatches)
                {
                    // Console.WriteLine($"[OTA DEBUG]   - {match.Name}");
                }

                // Try to find the best match by checking if the filename contains the target in sequence
                var bestMatch = fuzzyMatches.FirstOrDefault(a => a.Name.Contains($"{FirmwarePrefix}{normalizedTarget}"));
                if (bestMatch != null)
                {
                    // Console.WriteLine($"[OTA DEBUG] Selected best match: {bestMatch.Name}");
                    return bestMatch;
                }

                // Return the first one as fallback
                // Console.WriteLine($"[OTA DEBUG] Using first fuzzy match: {fuzzyMatches[0].Name}");
                return fuzzyMatches[0];
            }

            // Console.WriteLine($"[OTA DEBUG] No fuzzy matches found either");
            return null;
        }

        private string NormalizeFirmwareTarget(Model_Device device)
        {
            string manufacturer = (device.DeviceManufacturer ?? "unknown").ToLowerInvariant().Replace(" ", "_");
            string model = (device.DeviceModel ?? "unknown").ToLowerInvariant()
                              .Replace(" ", "_").Replace("-", "_").Replace("5_inch", "5").Replace("7_inch", "7");

            if (manufacturer == "elecrow" && model.Contains("crowpanel5")) model = "crowpanel_5";
            if (manufacturer == "elecrow" && model.Contains("crowpanel7")) model = "crowpanel_7";
            if (manufacturer == "lilygo" && model.Contains("t4_s3")) model = "t4_s3";

            return $"{manufacturer}_{model}";
        }

        private int CompareVersions(string current, string latest)
        {
            Version.TryParse(current.TrimStart('v', 'V'), out var currentVer);
            Version.TryParse(latest.TrimStart('v', 'V'), out var latestVer);
            currentVer ??= new Version(0, 0, 0);
            latestVer ??= new Version(0, 0, 0);
            return currentVer.CompareTo(latestVer);
        }

        // Download firmware and calculate hashes
        private async Task<List<GitHubRelease>?> GetLatestReleasesFromGitHub()
        {
            Console.WriteLine("[OTA] Fetching releases from GitHub...");

            var client = _httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github.v3+json"));
            client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("JunctionRelayServer", "1.0"));

            var response = await client.GetAsync($"{GitHubApiBaseUrl}/repos/{GitHubRepo}/releases");
            if (!response.IsSuccessStatusCode) return null;

            var content = await response.Content.ReadAsStringAsync();
            var allReleases = JsonSerializer.Deserialize<List<GitHubRelease>>(content, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            // Filter to OTA firmware releases only
            var firmwareReleases = allReleases?.Where(IsFirmwareRelease).ToList();

            if (firmwareReleases != null)
            {
                // Download and hash firmware files
                await PopulateFirmwareHashes(firmwareReleases);
            }

            Console.WriteLine($"[OTA] Found {firmwareReleases?.Count ?? 0} OTA firmware releases out of {allReleases?.Count ?? 0} total releases");

            return firmwareReleases;
        }

        // Download firmware files and calculate SHA-256 hashes
        private async Task PopulateFirmwareHashes(List<GitHubRelease> releases)
        {
            var client = _httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("JunctionRelayServer", "1.0"));

            foreach (var release in releases)
            {
                Console.WriteLine($"[OTA HASH] Processing release: {release.Name} (TagName: {release.TagName})");

                foreach (var asset in release.Assets.Where(a => a.Name.EndsWith(".bin")))
                {
                    if (!string.IsNullOrEmpty(asset.Sha256Hash))
                    {
                        Console.WriteLine($"[OTA HASH] Skipping {asset.Name} - hash already cached: {asset.Sha256Hash}");

                        // DEBUG: Let's also verify the cached hash for v0.6.8
                        if (asset.Name.Contains("v0.6.8"))
                        {
                            Console.WriteLine($"[OTA HASH DEBUG] Found cached v0.6.8 firmware: {asset.Name}");
                            Console.WriteLine($"[OTA HASH DEBUG] Cached hash: {asset.Sha256Hash}");
                            Console.WriteLine($"[OTA HASH DEBUG] Device hash: e9105c4c64f5bcbd2fbf297153b45da1cde0c8eedbcbb5b08a68642cd8c232cc");
                            Console.WriteLine($"[OTA HASH DEBUG] Hash match: {asset.Sha256Hash == "e9105c4c64f5bcbd2fbf297153b45da1cde0c8eedbcbb5b08a68642cd8c232cc"}");

                            // ESP32 calculates hash of entire partition, we need to simulate that
                            Console.WriteLine($"[OTA HASH DEBUG] Re-downloading {asset.Name} to calculate partition-style hash...");
                            await RecalculateHashForAsset(client, release, asset);
                        }

                        continue;
                    }

                    try
                    {
                        await CalculateAssetHash(client, release, asset);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[OTA HASH] Error hashing {asset.Name}: {ex.Message}");
                        Console.WriteLine($"[OTA HASH] Exception details: {ex}");
                    }
                }
            }
        }

        // Calculate hash for a single asset
        private async Task CalculateAssetHash(HttpClient client, GitHubRelease release, GitHubAsset asset)
        {
            string downloadUrl = $"https://github.com/{GitHubRepo}/releases/download/{release.TagName}/{asset.Name}";
            Console.WriteLine($"[OTA HASH] Downloading and hashing: {asset.Name}");
            Console.WriteLine($"[OTA HASH] Download URL: {downloadUrl}");

            var firmwareResponse = await client.GetAsync(downloadUrl);
            if (!firmwareResponse.IsSuccessStatusCode)
            {
                Console.WriteLine($"[OTA HASH] Failed to download {asset.Name} - Status: {firmwareResponse.StatusCode}");
                return;
            }

            Console.WriteLine($"[OTA HASH] Successfully downloaded {asset.Name}, size: {firmwareResponse.Content.Headers.ContentLength} bytes");

            // Get the raw bytes
            var firmwareBytes = await firmwareResponse.Content.ReadAsByteArrayAsync();
            Console.WriteLine($"[OTA HASH] Firmware file size: {firmwareBytes.Length} bytes");

            // ESP32 partition size is typically 1966080 bytes (as shown in device response)
            // We need to pad the firmware to match the partition size that ESP32 uses
            const int ESP32_PARTITION_SIZE = 1966080; // From device response: "size":1966080

            byte[] paddedFirmware;
            if (firmwareBytes.Length <= ESP32_PARTITION_SIZE)
            {
                // Pad with 0xFF (typical flash memory erased state) to match partition size
                paddedFirmware = new byte[ESP32_PARTITION_SIZE];
                Array.Copy(firmwareBytes, 0, paddedFirmware, 0, firmwareBytes.Length);

                // Fill remaining bytes with 0xFF (flash erased state)
                for (int i = firmwareBytes.Length; i < ESP32_PARTITION_SIZE; i++)
                {
                    paddedFirmware[i] = 0xFF;
                }

                Console.WriteLine($"[OTA HASH] Padded firmware from {firmwareBytes.Length} to {ESP32_PARTITION_SIZE} bytes with 0xFF");
            }
            else
            {
                Console.WriteLine($"[OTA HASH] WARNING: Firmware size ({firmwareBytes.Length}) exceeds expected partition size ({ESP32_PARTITION_SIZE})");
                paddedFirmware = firmwareBytes; // Use as-is if larger than expected
            }

            // Calculate SHA-256 hash of the padded firmware (matching ESP32 behavior)
            using var sha256 = SHA256.Create();
            var hashBytes = sha256.ComputeHash(paddedFirmware);
            asset.Sha256Hash = Convert.ToHexString(hashBytes).ToLowerInvariant();

            Console.WriteLine($"[OTA HASH] ✅ {asset.Name} hash calculated: {asset.Sha256Hash}");
            Console.WriteLine($"[OTA HASH] Original file size: {firmwareBytes.Length} bytes");
            Console.WriteLine($"[OTA HASH] Padded size: {paddedFirmware.Length} bytes");
            Console.WriteLine($"[OTA HASH] Hash length: {asset.Sha256Hash.Length} characters");

            // Special logging for v0.6.8
            if (asset.Name.Contains("v0.6.8"))
            {
                Console.WriteLine($"[OTA HASH DEBUG] ⚠️  v0.6.8 FIRMWARE HASH COMPARISON:");
                Console.WriteLine($"[OTA HASH DEBUG] Calculated: {asset.Sha256Hash}");
                Console.WriteLine($"[OTA HASH DEBUG] Device:     e9105c4c64f5bcbd2fbf297153b45da1cde0c8eedbcbb5b08a68642cd8c232cc");
                Console.WriteLine($"[OTA HASH DEBUG] Match: {asset.Sha256Hash == "e9105c4c64f5bcbd2fbf297153b45da1cde0c8eedbcbb5b08a68642cd8c232cc"}");

                // Show first and last few bytes for debugging
                Console.WriteLine($"[OTA HASH DEBUG] First 32 bytes: {Convert.ToHexString(paddedFirmware.Take(32).ToArray()).ToLowerInvariant()}");
                Console.WriteLine($"[OTA HASH DEBUG] Last 32 bytes:  {Convert.ToHexString(paddedFirmware.Skip(paddedFirmware.Length - 32).ToArray()).ToLowerInvariant()}");
                Console.WriteLine($"[OTA HASH DEBUG] Padding start (bytes at firmware end): {Convert.ToHexString(paddedFirmware.Skip(firmwareBytes.Length).Take(32).ToArray()).ToLowerInvariant()}");
            }
        }

        // DEBUG: Method to recalculate hash for a specific asset
        private async Task RecalculateHashForAsset(HttpClient client, GitHubRelease release, GitHubAsset asset)
        {
            try
            {
                Console.WriteLine($"[OTA HASH RECALC] Investigating hash mismatch for {asset.Name}");

                // First, let's try the original method (just firmware file)
                string downloadUrl = $"https://github.com/{GitHubRepo}/releases/download/{release.TagName}/{asset.Name}";
                Console.WriteLine($"[OTA HASH RECALC] Downloading: {downloadUrl}");

                var response = await client.GetAsync(downloadUrl);
                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[OTA HASH RECALC] Failed to download - Status: {response.StatusCode}");
                    return;
                }

                var bytes = await response.Content.ReadAsByteArrayAsync();
                Console.WriteLine($"[OTA HASH RECALC] Downloaded {bytes.Length} bytes");

                // Method 1: Hash just the firmware file (what we were doing before)
                using var sha256_file = SHA256.Create();
                var fileHashBytes = sha256_file.ComputeHash(bytes);
                var fileHash = Convert.ToHexString(fileHashBytes).ToLowerInvariant();

                // Method 2: Hash with partition padding (what ESP32 does)
                const int ESP32_PARTITION_SIZE = 1966080;
                byte[] paddedBytes = new byte[ESP32_PARTITION_SIZE];
                Array.Copy(bytes, 0, paddedBytes, 0, bytes.Length);

                // Fill with 0xFF (flash erased state)
                for (int i = bytes.Length; i < ESP32_PARTITION_SIZE; i++)
                {
                    paddedBytes[i] = 0xFF;
                }

                using var sha256_padded = SHA256.Create();
                var paddedHashBytes = sha256_padded.ComputeHash(paddedBytes);
                var paddedHash = Convert.ToHexString(paddedHashBytes).ToLowerInvariant();

                Console.WriteLine($"[OTA HASH RECALC] COMPARISON RESULTS:");
                Console.WriteLine($"[OTA HASH RECALC] File-only hash:     {fileHash}");
                Console.WriteLine($"[OTA HASH RECALC] Partition hash:     {paddedHash}");
                Console.WriteLine($"[OTA HASH RECALC] Device hash:        e9105c4c64f5bcbd2fbf297153b45da1cde0c8eedbcbb5b08a68642cd8c232cc");
                Console.WriteLine($"[OTA HASH RECALC] File vs Device:     {fileHash == "e9105c4c64f5bcbd2fbf297153b45da1cde0c8eedbcbb5b08a68642cd8c232cc"}");
                Console.WriteLine($"[OTA HASH RECALC] Partition vs Device: {paddedHash == "e9105c4c64f5bcbd2fbf297153b45da1cde0c8eedbcbb5b08a68642cd8c232cc"}");

                // Update the asset with the correct method
                if (paddedHash == "e9105c4c64f5bcbd2fbf297153b45da1cde0c8eedbcbb5b08a68642cd8c232cc")
                {
                    Console.WriteLine($"[OTA HASH RECALC] ✅ FOUND MATCH! Using partition-style hashing.");
                    asset.Sha256Hash = paddedHash;
                }
                else if (fileHash == "e9105c4c64f5bcbd2fbf297153b45da1cde0c8eedbcbb5b08a68642cd8c232cc")
                {
                    Console.WriteLine($"[OTA HASH RECALC] ✅ FOUND MATCH! Using file-only hashing.");
                    asset.Sha256Hash = fileHash;
                }
                else
                {
                    Console.WriteLine($"[OTA HASH RECALC] ❌ NO MATCH with either method. Need further investigation.");
                }

            }
            catch (Exception ex)
            {
                Console.WriteLine($"[OTA HASH RECALC] Error: {ex.Message}");
            }
        }

        private async Task<List<GitHubRelease>?> GetReleasesFromCache()
        {
            var cacheFilePath = GetGlobalCacheFilePath();

            try
            {
                if (!File.Exists(cacheFilePath))
                {
                    Console.WriteLine("[OTA CACHE] No cache file found");
                    return null;
                }

                var fileInfo = new FileInfo(cacheFilePath);
                if ((DateTime.Now - fileInfo.LastWriteTime).TotalHours > ReleaseCacheLifetimeHours)
                {
                    Console.WriteLine($"[OTA CACHE] Cache expired ({(DateTime.Now - fileInfo.LastWriteTime).TotalHours:F1} hours old)");
                    return null;
                }

                var json = await File.ReadAllTextAsync(cacheFilePath);
                var cachedData = JsonSerializer.Deserialize<CachedReleaseData>(json);

                if (cachedData?.Releases == null || !cachedData.Releases.Any())
                {
                    Console.WriteLine("[OTA CACHE] No releases in cached data");
                    return null;
                }

                Console.WriteLine($"[OTA CACHE] Using cached data with {cachedData.Releases.Count} releases");
                return cachedData.Releases;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[OTA CACHE] Error reading cache: {ex.Message}");
                return null;
            }
        }

        private async Task SaveReleasesToCache(List<GitHubRelease> releases)
        {
            var cacheFilePath = GetGlobalCacheFilePath();

            try
            {
                var cachedData = new CachedReleaseData
                {
                    Releases = releases,
                    CachedAt = DateTime.Now
                };

                var json = JsonSerializer.Serialize(cachedData, new JsonSerializerOptions
                {
                    WriteIndented = true
                });

                var directory = Path.GetDirectoryName(cacheFilePath);
                if (!Directory.Exists(directory))
                    Directory.CreateDirectory(directory!);

                await File.WriteAllTextAsync(cacheFilePath, json);
                Console.WriteLine($"[OTA CACHE] Saved {releases.Count} releases to cache");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[OTA CACHE] Error saving to cache: {ex.Message}");
            }
        }

        private string GetGlobalCacheFilePath()
        {
            return Path.Combine(_releaseCacheDirectory, "github_releases.json");
        }

        private GitHubRelease? FindReleaseForTarget(List<GitHubRelease> releases, string targetFirmware)
        {
            foreach (var release in releases)
            {
                if (release.Assets == null) continue;

                foreach (var asset in release.Assets)
                {
                    if (asset.Name != null && asset.Name.Contains(targetFirmware, StringComparison.OrdinalIgnoreCase))
                    {
                        Console.WriteLine($"[OTA CACHE] Found matching asset: {asset.Name} for target: {targetFirmware}");
                        return release;
                    }
                }
            }

            Console.WriteLine($"[OTA CACHE] No matching asset found for target: {targetFirmware}");
            return null;
        }

        #endregion
    }

    // Data models
    public class CachedReleaseData
    {
        public List<GitHubRelease> Releases { get; set; } = new();
        public DateTime CachedAt { get; set; }
    }

    public class Result<T>
    {
        public bool IsError { get; set; }
        public int StatusCode { get; set; }
        public string Message { get; set; } = string.Empty;
        public T Data { get; set; } = default!;
        public Stream FileStream { get; set; } = default!;
        public string FileName { get; set; } = string.Empty;

        public static Result<T> Success(T data) => new Result<T> { IsError = false, StatusCode = 200, Data = data };
        public static Result<T> Error(int statusCode, string message) => new Result<T> { IsError = true, StatusCode = statusCode, Message = message };
        public static Result<T> FileResult(Stream fileStream, string fileName) => new Result<T> { IsError = false, StatusCode = 200, FileStream = fileStream, FileName = fileName };
    }

    public class GitHubRelease
    {
        [JsonPropertyName("tag_name")]
        public string TagName { get; set; } = string.Empty;

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("prerelease")]
        public bool Prerelease { get; set; }

        [JsonPropertyName("assets")]
        public List<GitHubAsset> Assets { get; set; } = new List<GitHubAsset>();
    }

    public class GitHubAsset
    {
        public string Name { get; set; } = string.Empty;
        public long Size { get; set; }
        public string? Sha256Hash { get; set; }
    }
}