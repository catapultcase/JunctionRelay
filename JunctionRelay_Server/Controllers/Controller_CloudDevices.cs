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

using JunctionRelayServer.Services;
using Microsoft.AspNetCore.Mvc;
using JunctionRelayServer.Models;
using JunctionRelay_Server.Models.Requests;

namespace JunctionRelayServer.Controllers
{
    [Route("api/cloud-auth")]
    [ApiController]
    public class Controller_CloudDevices : ControllerBase
    {
        private readonly Service_Manager_CloudDevices _cloudDeviceService;
        private readonly Service_Database_Manager_Devices _deviceDb;

        public Controller_CloudDevices(
            Service_Manager_CloudDevices cloudDeviceService,
            Service_Database_Manager_Devices deviceDb)
        {
            _cloudDeviceService = cloudDeviceService;
            _deviceDb = deviceDb;
        }

        // POST: api/cloud-auth/devices/refresh
        [HttpPost("devices/refresh")]
        public async Task<IActionResult> RefreshCloudDevices()
        {
            try
            {
                // Check if user has cloud authentication
                var authHeader = Request.Headers.Authorization.FirstOrDefault();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                {
                    return Unauthorized(new { message = "Cloud authentication required" });
                }

                var cloudToken = authHeader.Substring("Bearer ".Length);

                // Use your existing cloud device service to sync
                var refreshedCount = await _cloudDeviceService.SyncCloudDevicesAsync(cloudToken);

                return Ok(new
                {
                    success = true,
                    count = refreshedCount,
                    message = $"Successfully refreshed {refreshedCount} cloud devices"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Failed to refresh cloud devices",
                    error = ex.Message
                });
            }
        }

        // POST: api/cloud-auth/devices/register
        [HttpPost("devices/register")]
        public async Task<IActionResult> RegisterCloudDevice([FromBody] Model_Register_Cloud_Device_Request request)
        {
            try
            {
                // Validate request
                if (request == null || string.IsNullOrWhiteSpace(request.DeviceId) || string.IsNullOrWhiteSpace(request.DeviceName))
                {
                    return BadRequest(new { message = "Device ID and Device Name are required" });
                }

                // Check if user has cloud authentication
                var authHeader = Request.Headers.Authorization.FirstOrDefault();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                {
                    return Unauthorized(new { message = "Cloud authentication required" });
                }

                var cloudToken = authHeader.Substring("Bearer ".Length);

                // Register the device with the cloud service
                var registeredDevice = await _cloudDeviceService.RegisterCloudDeviceAsync(cloudToken, request.DeviceId, request.DeviceName);

                return Ok(new
                {
                    success = true,
                    message = $"Cloud device '{request.DeviceName}' registered successfully",
                    device = registeredDevice
                });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (UnauthorizedAccessException)
            {
                return Unauthorized(new { message = "Invalid cloud authentication token" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Failed to register cloud device",
                    error = ex.Message
                });
            }
        }

        // GET: api/cloud-auth/devices
        [HttpGet("devices")]
        public async Task<IActionResult> GetCloudDevices()
        {
            try
            {
                // Check if user has cloud authentication
                var authHeader = Request.Headers.Authorization.FirstOrDefault();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                {
                    return Unauthorized(new { message = "Cloud authentication required" });
                }

                var cloudToken = authHeader.Substring("Bearer ".Length);

                // Get cloud devices from the cloud service
                var cloudDevices = await _cloudDeviceService.GetCloudDevicesAsync(cloudToken);

                return Ok(new
                {
                    success = true,
                    devices = cloudDevices,
                    count = cloudDevices?.Count() ?? 0
                });
            }
            catch (UnauthorizedAccessException)
            {
                return Unauthorized(new { message = "Invalid cloud authentication token" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Failed to retrieve cloud devices",
                    error = ex.Message
                });
            }
        }

        // DELETE: api/cloud-auth/devices/{deviceId}
        [HttpDelete("devices/{deviceId}")]
        public async Task<IActionResult> UnregisterCloudDevice(string deviceId)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(deviceId))
                {
                    return BadRequest(new { message = "Device ID is required" });
                }

                // Check if user has cloud authentication
                var authHeader = Request.Headers.Authorization.FirstOrDefault();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                {
                    return Unauthorized(new { message = "Cloud authentication required" });
                }

                var cloudToken = authHeader.Substring("Bearer ".Length);

                // Unregister the device from the cloud service
                var success = await _cloudDeviceService.UnregisterCloudDeviceAsync(cloudToken, deviceId);

                if (success)
                {
                    return Ok(new
                    {
                        success = true,
                        message = $"Cloud device '{deviceId}' unregistered successfully"
                    });
                }
                else
                {
                    return NotFound(new { message = $"Cloud device '{deviceId}' not found" });
                }
            }
            catch (UnauthorizedAccessException)
            {
                return Unauthorized(new { message = "Invalid cloud authentication token" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Failed to unregister cloud device",
                    error = ex.Message
                });
            }
        }

        // GET: api/cloud-auth/status
        [HttpGet("status")]
        public async Task<IActionResult> GetCloudAuthStatus()
        {
            try
            {
                // Check if user has cloud authentication
                var authHeader = Request.Headers.Authorization.FirstOrDefault();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                {
                    return Ok(new
                    {
                        authenticated = false,
                        message = "No cloud authentication token provided"
                    });
                }

                var cloudToken = authHeader.Substring("Bearer ".Length);

                // Validate the token with the cloud service
                var isValid = await _cloudDeviceService.ValidateCloudTokenAsync(cloudToken);

                return Ok(new
                {
                    authenticated = isValid,
                    message = isValid ? "Cloud authentication valid" : "Invalid cloud authentication token"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    authenticated = false,
                    message = "Error validating cloud authentication",
                    error = ex.Message
                });
            }
        }
    }
}