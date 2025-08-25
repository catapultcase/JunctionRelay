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

namespace JunctionRelayServer.Controllers
{
    [Route("api/cloud-devices")]
    [ApiController]
    public class Controller_CloudDevices : ControllerBase
    {
        private readonly Service_Manager_CloudDevices _cloudDevices;

        public Controller_CloudDevices(Service_Manager_CloudDevices cloudDevices)
        {
            _cloudDevices = cloudDevices;
        }

        // GET: api/cloud-devices
        // Returns the devices directly from the cloud (no local DB mutation)
        [HttpGet]
        public async Task<IActionResult> GetCloudDevices()
        {
            try
            {
                var authHeader = Request.Headers.Authorization.FirstOrDefault();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                {
                    return Unauthorized(new { message = "Cloud authentication required" });
                }

                var token = authHeader.Substring("Bearer ".Length).Trim();

                Console.WriteLine("[CLOUD-DEVICES] 🔎 Fetching devices from cloud...");
                var devices = await _cloudDevices.FetchCloudDevicesAsync(token);

                Console.WriteLine($"[CLOUD-DEVICES] ✅ Fetched {devices?.Count ?? 0} devices");
                return Ok(new
                {
                    success = true,
                    devices = devices ?? new List<CloudDeviceResponse>()
                });
            }
            catch (UnauthorizedAccessException uaex)
            {
                Console.WriteLine($"[CLOUD-DEVICES] ❌ Unauthorized: {uaex.Message}");
                return Unauthorized(new { message = uaex.Message });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD-DEVICES] ❌ Exception: {ex.GetType().Name} - {ex.Message}");
                Console.WriteLine(ex.StackTrace);
                return StatusCode(500, new
                {
                    success = false,
                    message = "Failed to fetch cloud devices",
                    error = ex.Message,
                    exceptionType = ex.GetType().Name
                });
            }
        }

        // POST: api/cloud-devices/refresh
        // Pulls from cloud and upserts into local DB, returns count
        [HttpPost("refresh")]
        public async Task<IActionResult> RefreshCloudDevices()
        {
            try
            {
                var authHeader = Request.Headers.Authorization.FirstOrDefault();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                {
                    return Unauthorized(new { message = "Cloud authentication required" });
                }

                var token = authHeader.Substring("Bearer ".Length).Trim();

                Console.WriteLine("[CLOUD-DEVICES] 🔄 Syncing cloud devices into local DB...");
                var count = await _cloudDevices.SyncCloudDevicesAsync(token);

                Console.WriteLine($"[CLOUD-DEVICES] ✅ Sync complete. Upserted {count} device(s).");
                return Ok(new
                {
                    success = true,
                    count,
                    message = $"Synced {count} cloud device(s)"
                });
            }
            catch (UnauthorizedAccessException uaex)
            {
                Console.WriteLine($"[CLOUD-DEVICES] ❌ Unauthorized: {uaex.Message}");
                return Unauthorized(new { message = uaex.Message });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUD-DEVICES] ❌ Exception: {ex.GetType().Name} - {ex.Message}");
                Console.WriteLine(ex.StackTrace);
                return StatusCode(500, new
                {
                    success = false,
                    message = "Failed to refresh cloud devices",
                    error = ex.Message,
                    exceptionType = ex.GetType().Name
                });
            }
        }
    }
}
