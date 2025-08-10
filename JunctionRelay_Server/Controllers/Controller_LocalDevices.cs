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
    [Route("api/localdevices")]
    [ApiController]
    public class Controller_LocalDevices : ControllerBase
    {
        private readonly Service_Database_Manager_Devices _deviceDb;
        private readonly Service_Manager_CloudNotifications _cloudNotificationService;
        private readonly Service_Manager_LocalDeviceSync _localDeviceSyncService;
        private readonly Service_CloudSessionStore _cloudSessionStore;

        public Controller_LocalDevices(
            Service_Database_Manager_Devices deviceDb,
            Service_Manager_CloudNotifications cloudNotificationService,
            Service_Manager_LocalDeviceSync localDeviceSyncService,
            Service_CloudSessionStore cloudSessionStore)
        {
            _deviceDb = deviceDb;
            _cloudNotificationService = cloudNotificationService;
            _localDeviceSyncService = localDeviceSyncService;
            _cloudSessionStore = cloudSessionStore;
        }        

        // POST: api/cloud-devices/{deviceId}/sync-mode
        [HttpPost("{deviceId}/sync-mode")]
        public async Task<IActionResult> UpdateDeviceSyncMode(int deviceId, [FromBody] UpdateSyncModeRequest request)
        {
            try
            {
                if (request == null || string.IsNullOrWhiteSpace(request.SyncMode))
                {
                    return BadRequest(new { message = "Sync mode is required" });
                }

                // Check if user has cloud authentication
                var authHeader = Request.Headers.Authorization.FirstOrDefault();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                {
                    return Unauthorized(new { message = "Cloud authentication required" });
                }

                // Get the device from local database
                var allLocalDevices = await _deviceDb.GetAllDevicesAsync();
                var localDevice = allLocalDevices.FirstOrDefault(d => d.Id == deviceId);

                if (localDevice == null)
                {
                    return NotFound(new { message = "Device not found" });
                }

                var previousSyncMode = localDevice.SyncMode;

                // Update the device sync mode in database
                localDevice.SyncMode = request.SyncMode;
                await _deviceDb.UpdateDeviceSyncModeAsync(localDevice.Id, request.SyncMode);

                Console.WriteLine($"About to call HandleSyncModeChangeAsync for device {deviceId}, previous: {previousSyncMode}, current: {request.SyncMode}");

                // Handle sync mode change (registration/unregistration)
                var syncSuccess = await _localDeviceSyncService.HandleSyncModeChangeAsync(
                    localDevice,
                    previousSyncMode);

                Console.WriteLine($"HandleSyncModeChangeAsync completed, result: {syncSuccess}");

                if (syncSuccess)
                {
                    return Ok(new
                    {
                        success = true,
                        message = $"Sync mode updated to '{request.SyncMode}' for device '{localDevice.Name}'",
                        deviceId = deviceId,
                        syncMode = request.SyncMode,
                        previousSyncMode = previousSyncMode
                    });
                }
                else
                {
                    // Rollback the database change if cloud sync failed
                    await _deviceDb.UpdateDeviceSyncModeAsync(localDevice.Id, previousSyncMode ?? "local_health");

                    return StatusCode(500, new
                    {
                        success = false,
                        message = "Failed to update sync mode - cloud registration failed",
                        deviceId = deviceId
                    });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Failed to update device sync mode",
                    error = ex.Message
                });
            }
        }
    }

    // Request models for this controller only
    public class UpdateSyncModeRequest
    {
        public string SyncMode { get; set; } = string.Empty;
    }
}