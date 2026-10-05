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
    /// <summary>
    /// API for monitoring Broadcast junction sensor stream broadcasts.
    /// Devices connect directly to the junction's configured port (not through this API).
    /// </summary>
    [Route("api/broadcast")]
    [ApiController]
    public class Controller_Broadcast : ControllerBase
    {
        private readonly Service_Stream_Manager_Broadcast _broadcastStreamManager;

        public Controller_Broadcast(Service_Stream_Manager_Broadcast broadcastStreamManager)
        {
            _broadcastStreamManager = broadcastStreamManager;
        }

        /// <summary>
        /// Get list of active Broadcast junctions broadcasting sensors.
        /// </summary>
        [HttpGet("active")]
        public IActionResult GetActiveJunctions()
        {
            try
            {
                var activeJunctions = _broadcastStreamManager.GetActiveJunctions();
                return Ok(new
                {
                    timestamp = DateTime.UtcNow,
                    count = activeJunctions.Count(),
                    junctions = activeJunctions
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[BROADCAST_API] Error getting active junctions: {ex.Message}");
                return StatusCode(500, new { error = "Internal server error", message = ex.Message });
            }
        }

        /// <summary>
        /// Get detailed info for a specific junction broadcast.
        /// </summary>
        [HttpGet("junction/{junctionId}")]
        public IActionResult GetJunctionInfo(int junctionId)
        {
            try
            {
                var info = _broadcastStreamManager.GetStreamInfo(junctionId);
                if (info == null)
                {
                    return NotFound(new { error = $"Junction {junctionId} is not broadcasting" });
                }
                return Ok(info);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[BROADCAST_API] Error getting junction info: {ex.Message}");
                return StatusCode(500, new { error = "Internal server error", message = ex.Message });
            }
        }

        /// <summary>
        /// Check if a port is available for Broadcast junction.
        /// </summary>
        [HttpGet("check-port/{port}")]
        public async Task<IActionResult> CheckPortAvailability(int port, [FromQuery] int? excludeJunctionId = null)
        {
            try
            {
                if (port < 1024 || port > 65535)
                {
                    return BadRequest(new { status = "invalid", message = "Port must be between 1024 and 65535" });
                }

                var result = await _broadcastStreamManager.CheckPortAvailabilityAsync(port, excludeJunctionId);
                return Ok(result);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[BROADCAST_API] Error checking port: {ex.Message}");
                return StatusCode(500, new { status = "error", message = ex.Message });
            }
        }
    }
}
