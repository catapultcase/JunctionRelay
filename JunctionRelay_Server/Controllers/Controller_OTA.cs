/*
 * This file is part of Junction Relay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * Junction Relay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Junction Relay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Junction Relay. If not, see <https://www.gnu.org/licenses/>.
 */

using Microsoft.AspNetCore.Mvc;
using JunctionRelayServer.Services;

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("api/ota")]
    public class Controller_OTA : ControllerBase
    {
        private readonly Service_Manager_OTA _otaManager;
        private static readonly Dictionary<int, DateTime> _deviceLastFetch = new();
        private static readonly TimeSpan DeviceCooldown = TimeSpan.FromSeconds(5);

        public Controller_OTA(Service_Manager_OTA otaManager)
        {
            _otaManager = otaManager;
        }

        [HttpGet("check/{deviceId}")]
        public async Task<IActionResult> CheckForUpdate(int deviceId, [FromQuery] bool force = false)
        {
            if (force && _deviceLastFetch.ContainsKey(deviceId))
            {
                var timeSinceLastFetch = DateTime.UtcNow - _deviceLastFetch[deviceId];
                if (timeSinceLastFetch < DeviceCooldown)
                {
                    Console.WriteLine($"[OTA API] Device {deviceId} check request blocked by cooldown");
                    return StatusCode(429, "Rate limit: Please wait before checking again");
                }
            }

            var result = await _otaManager.CheckForUpdate(deviceId, force);

            if (result.IsError)
                return result.StatusCode == 404
                    ? NotFound(result.Message)
                    : StatusCode(result.StatusCode, result.Message);

            if (force)
            {
                _deviceLastFetch[deviceId] = DateTime.UtcNow;
            }

            // REMOVED: Automatic background firmware verification
            // Only verify firmware when explicitly requested via the "Verify Firmware" button
            // This prevents unnecessary GitHub API calls on every page visit

            return Ok(result.Data);
        }

        [HttpPost("verify-firmware/{deviceId}")]
        public async Task<IActionResult> VerifyDeviceFirmware(int deviceId)
        {
            Console.WriteLine($"[OTA API] Firmware verification requested for device {deviceId}");

            var result = await _otaManager.VerifyDeviceFirmware(deviceId);

            if (result.IsError)
            {
                Console.WriteLine($"[OTA API] Firmware verification failed for device {deviceId}: {result.Message}");
                return result.StatusCode == 404
                    ? NotFound(result.Message)
                    : result.StatusCode == 500
                        ? StatusCode(500, result.Message)
                        : StatusCode(result.StatusCode, result.Message);
            }

            Console.WriteLine($"[OTA API] Firmware verification completed for device {deviceId}");
            return Ok(result.Data);
        }

        [HttpGet("releases")]
        public async Task<IActionResult> GetAllReleases([FromQuery] int deviceId, [FromQuery] bool forceRefresh = false)
        {
            if (forceRefresh && _deviceLastFetch.ContainsKey(deviceId))
            {
                var timeSinceLastFetch = DateTime.UtcNow - _deviceLastFetch[deviceId];
                if (timeSinceLastFetch < DeviceCooldown)
                {
                    Console.WriteLine($"[OTA API] Device {deviceId} releases request blocked by cooldown");
                    return StatusCode(429, "Rate limit: Please wait before refreshing again");
                }
            }

            var result = await _otaManager.GetAllReleases(deviceId, forceRefresh);

            if (result.IsError)
            {
                if (result.StatusCode == 404 && result.Message.Contains("No firmware releases found"))
                {
                    return Ok(new List<object>());
                }
                return result.StatusCode == 404
                    ? NotFound(result.Message)
                    : StatusCode(result.StatusCode, result.Message);
            }

            if (forceRefresh)
            {
                _deviceLastFetch[deviceId] = DateTime.UtcNow;
            }

            return Ok(result.Data);
        }

        [HttpGet("releases/{deviceId}")]
        public async Task<IActionResult> GetDeviceReleases(int deviceId, [FromQuery] bool forceRefresh = false)
        {
            Console.WriteLine($"[OTA API] Getting device-specific releases for device {deviceId} with forceRefresh={forceRefresh}");

            if (forceRefresh && _deviceLastFetch.ContainsKey(deviceId))
            {
                var timeSinceLastFetch = DateTime.UtcNow - _deviceLastFetch[deviceId];
                if (timeSinceLastFetch < DeviceCooldown)
                {
                    Console.WriteLine($"[OTA API] Device {deviceId} releases request blocked by cooldown");
                    return StatusCode(429, "Rate limit: Please wait before refreshing again");
                }
            }

            var result = await _otaManager.GetAllReleases(deviceId, forceRefresh);

            if (result.IsError)
            {
                Console.WriteLine($"[OTA API] Error getting device releases: {result.Message}");

                if (result.StatusCode == 404 && result.Message.Contains("No firmware releases found"))
                {
                    Console.WriteLine($"[OTA API] No firmware found for device {deviceId} - returning empty list");
                    return Ok(new List<object>());
                }

                return result.StatusCode == 404
                    ? NotFound(result.Message)
                    : StatusCode(result.StatusCode, result.Message);
            }

            if (forceRefresh)
            {
                _deviceLastFetch[deviceId] = DateTime.UtcNow;
            }

            Console.WriteLine($"[OTA API] Successfully retrieved device releases for device {deviceId}");
            return Ok(result.Data);
        }

        [HttpPost("upload/{deviceId}")]
        public async Task<IActionResult> UploadFirmware(int deviceId, IFormFile firmwareFile)
        {
            if (firmwareFile == null || firmwareFile.Length == 0)
            {
                return BadRequest("No firmware file provided");
            }

            if (!firmwareFile.FileName.EndsWith(".bin", StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest("Firmware file must be a .bin file");
            }

            const long maxFileSize = 10 * 1024 * 1024; // 10MB
            if (firmwareFile.Length > maxFileSize)
            {
                return BadRequest("Firmware file is too large (max 10MB)");
            }

            var result = await _otaManager.UploadFirmware(deviceId, firmwareFile);

            if (result.IsError)
                return result.StatusCode == 404
                    ? NotFound(result.Message)
                    : result.StatusCode == 400
                        ? BadRequest(result.Message)
                        : StatusCode(result.StatusCode, result.Message);

            return Ok(result.Data);
        }

        [HttpGet("firmware/{deviceId}")]
        public async Task<IActionResult> GetFirmware(
            int deviceId,
            [FromQuery] string? release = null,
            [FromQuery] string? version = null,  // NEW: Add version parameter
            [FromQuery] bool force = false)
        {
            Console.WriteLine($"[OTA API] GetFirmware called for device {deviceId}, release: {release}, version: {version}, force: {force}");

            var result = await _otaManager.GetFirmware(
                deviceId,
                release,
                version,  // Pass version parameter
                force,
                Request.Scheme,
                Request.Host.ToString()
            );

            if (result.IsError)
                return result.StatusCode == 404
                    ? NotFound(result.Message)
                    : result.StatusCode == 400
                        ? BadRequest(result.Message)
                        : StatusCode(result.StatusCode, result.Message);

            return File(result.FileStream, "application/octet-stream", result.FileName);
        }

        [HttpPost("poll-for-update/{deviceId}")]
        public async Task<IActionResult> PollForUpdate(int deviceId, [FromBody] UpdateOptions? options = null)
        {
            var force = options?.Force ?? false;
            var release = options?.Release;
            var version = options?.Version;  // NEW: Get version from options

            Console.WriteLine($"[OTA API] PollForUpdate called for device {deviceId}, force: {force}, release: {release}, version: {version}");

            var result = await _otaManager.PollForUpdate(
                deviceId,
                force,
                Request.Scheme,
                Request.Host.ToString(),
                release,
                version  // NEW: Pass version parameter
            );

            if (result.IsError)
                return result.StatusCode == 404
                    ? NotFound(result.Message)
                    : result.StatusCode == 400
                        ? BadRequest(result.Message)
                        : StatusCode(result.StatusCode, result.Message);

            return Ok(result.Data);
        }

        [HttpGet("cooldown/{deviceId}")]
        public IActionResult GetCooldownStatus(int deviceId)
        {
            if (!_deviceLastFetch.ContainsKey(deviceId))
            {
                return Ok(new { deviceId, inCooldown = false, message = "No previous requests" });
            }

            var timeSinceLastFetch = DateTime.UtcNow - _deviceLastFetch[deviceId];
            var inCooldown = timeSinceLastFetch < DeviceCooldown;
            var remainingCooldown = inCooldown ? DeviceCooldown - timeSinceLastFetch : TimeSpan.Zero;

            return Ok(new
            {
                deviceId,
                inCooldown,
                lastFetchAgo = timeSinceLastFetch.TotalSeconds,
                remainingCooldownSeconds = remainingCooldown.TotalSeconds,
                message = inCooldown
                    ? "Device is in cooldown period"
                    : "Device can make requests"
            });
        }
    }

    public class UpdateOptions
    {
        public bool Force { get; set; } = false;
        public string? Release { get; set; }
        public string? Version { get; set; }  // NEW: Add Version property
    }
}