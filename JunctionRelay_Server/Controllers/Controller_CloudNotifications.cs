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

namespace JunctionRelayServer.Controllers
{
    [Route("api/notifications")]
    [ApiController]
    public class Controller_CloudNotifications : ControllerBase
    {
        private readonly Service_Manager_CloudNotifications _cloudNotificationService;

        public Controller_CloudNotifications(Service_Manager_CloudNotifications cloudNotificationService)
        {
            _cloudNotificationService = cloudNotificationService;
        }

        // GET: api/notifications/preferences
        [HttpGet("preferences")]
        public async Task<IActionResult> GetNotificationPreferences()
        {
            try
            {
                // ZERO TRUST: Require cloud authentication token
                var authHeader = Request.Headers.Authorization.FirstOrDefault();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                {
                    return Unauthorized(new { message = "Cloud authentication required" });
                }

                var cloudToken = authHeader.Substring("Bearer ".Length);

                // Forward request to cloud with user's token
                var preferences = await _cloudNotificationService.GetNotificationPreferencesAsync(cloudToken);

                return Ok(new
                {
                    success = true,
                    preferences = preferences
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
                    message = "Failed to retrieve notification preferences",
                    error = ex.Message
                });
            }
        }

        // PUT: api/notifications/preferences
        [HttpPut("preferences")]
        public async Task<IActionResult> UpdateNotificationPreferences([FromBody] UpdateNotificationPreferencesRequest request)
        {
            try
            {
                if (request == null)
                {
                    return BadRequest(new { message = "Request body is required" });
                }

                // ZERO TRUST: Require cloud authentication token
                var authHeader = Request.Headers.Authorization.FirstOrDefault();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                {
                    return Unauthorized(new { message = "Cloud authentication required" });
                }

                var cloudToken = authHeader.Substring("Bearer ".Length);

                // Forward request to cloud with user's token
                var success = await _cloudNotificationService.UpdateNotificationPreferencesAsync(cloudToken, request);

                if (success)
                {
                    return Ok(new
                    {
                        success = true,
                        message = "Notification preferences updated successfully"
                    });
                }
                else
                {
                    return StatusCode(500, new
                    {
                        success = false,
                        message = "Failed to update notification preferences"
                    });
                }
            }
            catch (UnauthorizedAccessException)
            {
                return Unauthorized(new { message = "Invalid cloud authentication token" });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Failed to update notification preferences",
                    error = ex.Message
                });
            }
        }

        // POST: api/notifications/create-pair-code
        [HttpPost("create-pair-code")]
        public async Task<IActionResult> CreateNotificationPairCode([FromBody] CreatePairCodeRequest request)
        {
            try
            {
                if (request == null || string.IsNullOrWhiteSpace(request.DeviceName))
                {
                    return BadRequest(new { message = "Device name is required" });
                }

                // ZERO TRUST: Require cloud authentication token
                var authHeader = Request.Headers.Authorization.FirstOrDefault();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                {
                    return Unauthorized(new { message = "Cloud authentication required" });
                }

                var cloudToken = authHeader.Substring("Bearer ".Length);

                // Forward request to cloud with user's token
                var pairCodeResponse = await _cloudNotificationService.CreateNotificationPairCodeAsync(cloudToken, request.DeviceName);

                return Ok(pairCodeResponse);
            }
            catch (UnauthorizedAccessException)
            {
                return Unauthorized(new { message = "Invalid cloud authentication token" });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Failed to create pair code",
                    error = ex.Message
                });
            }
        }

        // POST: api/notifications/complete-pairing
        [HttpPost("complete-pairing")]
        public async Task<IActionResult> CompletePairing([FromBody] CompletePairingRequest request)
        {
            try
            {
                if (request == null || string.IsNullOrWhiteSpace(request.PairCode) ||
                    string.IsNullOrWhiteSpace(request.FcmToken) || string.IsNullOrWhiteSpace(request.Platform))
                {
                    return BadRequest(new { message = "Pair code, FCM token, and platform are required" });
                }

                // ZERO TRUST: Require cloud authentication token
                var authHeader = Request.Headers.Authorization.FirstOrDefault();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                {
                    return Unauthorized(new { message = "Cloud authentication required" });
                }

                var cloudToken = authHeader.Substring("Bearer ".Length);

                // Forward request to cloud with user's token
                var pairingResponse = await _cloudNotificationService.CompletePairingAsync(cloudToken, request);

                return Ok(pairingResponse);
            }
            catch (UnauthorizedAccessException)
            {
                return Unauthorized(new { message = "Invalid cloud authentication token" });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Failed to complete pairing",
                    error = ex.Message
                });
            }
        }

        // POST: api/notifications/send-push
        [HttpPost("send-push")]
        public async Task<IActionResult> SendPushNotification([FromBody] SendPushNotificationRequest request)
        {
            try
            {
                if (request == null || string.IsNullOrWhiteSpace(request.Title) || string.IsNullOrWhiteSpace(request.Body))
                {
                    return BadRequest(new { message = "Title and body are required" });
                }

                // ZERO TRUST: Require cloud authentication token
                var authHeader = Request.Headers.Authorization.FirstOrDefault();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                {
                    return Unauthorized(new { message = "Cloud authentication required" });
                }

                var cloudToken = authHeader.Substring("Bearer ".Length);

                // Forward request to cloud with user's token
                var pushResponse = await _cloudNotificationService.SendPushNotificationAsync(cloudToken, request);

                return Ok(pushResponse);
            }
            catch (UnauthorizedAccessException)
            {
                return Unauthorized(new { message = "Invalid cloud authentication token" });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Failed to send push notification",
                    error = ex.Message
                });
            }
        }

        // GET: api/notifications/devices
        [HttpGet("devices")]
        public async Task<IActionResult> GetMobileDevices()
        {
            try
            {
                // ZERO TRUST: Require cloud authentication token
                var authHeader = Request.Headers.Authorization.FirstOrDefault();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                {
                    return Unauthorized(new { message = "Cloud authentication required" });
                }

                var cloudToken = authHeader.Substring("Bearer ".Length);

                // Forward request to cloud with user's token
                var devices = await _cloudNotificationService.GetMobileDevicesAsync(cloudToken);

                return Ok(new
                {
                    success = true,
                    devices = devices,
                    count = devices?.Count() ?? 0
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
                    message = "Failed to retrieve mobile devices",
                    error = ex.Message
                });
            }
        }

        // DELETE: api/notifications/devices/{deviceId}
        [HttpDelete("devices/{deviceId}")]
        public async Task<IActionResult> RemoveMobileDevice(string deviceId)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(deviceId))
                {
                    return BadRequest(new { message = "Device ID is required" });
                }

                // ZERO TRUST: Require cloud authentication token
                var authHeader = Request.Headers.Authorization.FirstOrDefault();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                {
                    return Unauthorized(new { message = "Cloud authentication required" });
                }

                var cloudToken = authHeader.Substring("Bearer ".Length);

                // Forward request to cloud with user's token
                var success = await _cloudNotificationService.RemoveMobileDeviceAsync(cloudToken, deviceId);

                if (success)
                {
                    return Ok(new
                    {
                        success = true,
                        message = "Mobile device removed successfully"
                    });
                }
                else
                {
                    return NotFound(new { message = "Mobile device not found" });
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
                    message = "Failed to remove mobile device",
                    error = ex.Message
                });
            }
        }

        // GET: api/notifications/status
        [HttpGet("status")]
        public async Task<IActionResult> GetNotificationStatus()
        {
            try
            {
                // ZERO TRUST: Require cloud authentication token
                var authHeader = Request.Headers.Authorization.FirstOrDefault();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                {
                    return Ok(new
                    {
                        authenticated = false,
                        notificationsAvailable = false,
                        message = "Cloud authentication required for push notifications"
                    });
                }

                var cloudToken = authHeader.Substring("Bearer ".Length);

                // Forward request to cloud with user's token
                var status = await _cloudNotificationService.GetNotificationStatusAsync(cloudToken);

                return Ok(status);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    authenticated = false,
                    notificationsAvailable = false,
                    message = "Error checking notification status",
                    error = ex.Message
                });
            }
        }
    }

    // Request models for notifications
    public class UpdateNotificationPreferencesRequest
    {
        public bool PushNotificationsEnabled { get; set; }
        public int? DeviceHealthTimeoutMinutes { get; set; }
        public int? DeviceHealthReminderIntervalMinutes { get; set; }
    }

    public class CreatePairCodeRequest
    {
        public string DeviceName { get; set; } = string.Empty;
    }

    public class CompletePairingRequest
    {
        public string PairCode { get; set; } = string.Empty;
        public string FcmToken { get; set; } = string.Empty;
        public string Platform { get; set; } = string.Empty;
    }

    public class SendPushNotificationRequest
    {
        public string Title { get; set; } = string.Empty;
        public string Body { get; set; } = string.Empty;
        public Dictionary<string, string>? Data { get; set; }
    }
}