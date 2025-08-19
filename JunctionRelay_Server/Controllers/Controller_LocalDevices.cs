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
        private readonly Service_Manager_LocalDeviceSync _localDeviceSyncService;
        private readonly Service_CloudSessionStore _cloudSessionStore;

        public Controller_LocalDevices(
            Service_Database_Manager_Devices deviceDb,
            Service_Manager_LocalDeviceSync localDeviceSyncService,
            Service_CloudSessionStore cloudSessionStore)
        {
            _deviceDb = deviceDb;
            _localDeviceSyncService = localDeviceSyncService;
            _cloudSessionStore = cloudSessionStore;
        }

        // POST: api/localdevices/{deviceId}/sync-mode
        [HttpPost("{deviceId}/sync-mode")]
        public async Task<IActionResult> UpdateDeviceSyncMode(int deviceId, [FromBody] UpdateSyncModeRequest request)
        {
            try
            {
                // Validate request
                if (request == null)
                {
                    return BadRequest(new { message = "Request object is required" });
                }

                if (string.IsNullOrWhiteSpace(request.SyncMode))
                {
                    return BadRequest(new { message = "Sync mode is required" });
                }

                // Validate authentication
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

                // Handle sync mode change (registration/unregistration)
                var syncSuccess = await _localDeviceSyncService.HandleSyncModeChangeAsync(
                    localDevice,
                    previousSyncMode);

                if (syncSuccess)
                {
                    var response = new
                    {
                        success = true,
                        message = $"Sync mode updated to '{request.SyncMode}' for device '{localDevice.Name}'",
                        deviceId = deviceId,
                        syncMode = request.SyncMode,
                        previousSyncMode = previousSyncMode
                    };
                    return Ok(response);
                }
                else
                {
                    Console.WriteLine($"[CONTROLLER] ❌ Sync failed, rolling back database changes");
                    // Rollback the database change if cloud sync failed
                    await _deviceDb.UpdateDeviceSyncModeAsync(localDevice.Id, previousSyncMode ?? "local_health");

                    var errorResponse = new
                    {
                        success = false,
                        message = "Failed to update sync mode - cloud registration failed",
                        deviceId = deviceId
                    };
                    return StatusCode(500, errorResponse);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CONTROLLER] ❌ Exception caught: {ex.GetType().Name}");
                Console.WriteLine($"[CONTROLLER] ❌ Exception message: {ex.Message}");
                Console.WriteLine($"[CONTROLLER] ❌ Stack trace: {ex.StackTrace}");

                var errorResponse = new
                {
                    success = false,
                    message = "Failed to update device sync mode",
                    error = ex.Message,
                    exceptionType = ex.GetType().Name
                };
                return StatusCode(500, errorResponse);
            }
        }
    }

    // Request models for this controller only
    public class UpdateSyncModeRequest
    {
        public string SyncMode { get; set; } = string.Empty;
    }
}