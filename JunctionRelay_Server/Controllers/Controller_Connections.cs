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
    [Route("api/connections")]
    [ApiController]
    public class Controller_Connections : ControllerBase
    {
        private readonly Service_Manager_Connections _connectionService;
        private readonly Service_Database_Manager_Sensors _sensorDb;
        private readonly Service_Stream_Manager_HTTP _httpStreamManager;
        private readonly Service_Stream_Manager_MQTT _mqttStreamManager;
        private readonly Service_Stream_Manager_COM _comStreamManager;

        public Controller_Connections(Service_Manager_Connections connectionService ,Service_Database_Manager_Sensors sensorDb, Service_Stream_Manager_HTTP httpStreamManager, Service_Stream_Manager_MQTT mqttStreamManager, Service_Stream_Manager_COM comStreamManager)
        {
            _connectionService = connectionService;
            _sensorDb = sensorDb;
            _httpStreamManager = httpStreamManager;
            _mqttStreamManager = mqttStreamManager;
            _comStreamManager = comStreamManager;
        }

        [HttpPost("start/{junctionId}")]
        public async Task<IActionResult> StartJunction(int junctionId, CancellationToken cancellationToken)
        {
            var result = await _connectionService.StartJunctionAsync(junctionId, cancellationToken);
            if (!result.Success)
                return BadRequest(new { message = result.Message });

            return Ok(new { message = $"Junction {junctionId} started." });
        }

        [HttpPost("stop/{junctionId}")]
        public async Task<IActionResult> StopJunction(int junctionId, CancellationToken cancellationToken)
        {
            var result = await _connectionService.StopJunctionAsync(junctionId, cancellationToken);
            if (!result.Success)
                return BadRequest(new { message = result.Message });

            return Ok(new { message = $"Junction {junctionId} stopped." });
        }

        // GET: /api/connections/running
        [HttpGet("running")]
        public IActionResult GetRunningJunctions()
        {
            var running = _connectionService.RunningJunctions.Values
                .Select(j => new
                {
                    j.Id,
                    j.Name,
                    j.Status
                });

            return Ok(running);
        }

        // GET: /api/connections/streams
        [HttpGet("streams")]
        public IActionResult GetActiveStreams()
        {
            // Get active streams from HTTP, MQTT, and COM managers
            var activeHttpStreams = _httpStreamManager.GetActiveStreams();
            var activeMqttStreams = _mqttStreamManager.GetActiveStreams();
            var activeComStreams = _comStreamManager.GetActiveStreams();

            // Combine all active streams (HTTP, MQTT, COM)
            var allActiveStreams = activeHttpStreams
                                    .Concat(activeMqttStreams)
                                    .Concat(activeComStreams)
                                    .ToList();

            return Ok(new { activeStreams = allActiveStreams });  // Return the combined active streams
        }


        // GET: /api/connections/sensors
        [HttpGet("sensors")]
        public IActionResult GetSensors()
        {
            var sensors = _connectionService.GetAllSensors();
            if (sensors == null || !sensors.Any())
            {
                return NotFound("No sensors found.");
            }
            return Ok(sensors);
        }


        // GET: /api/connections/sensors/junction/{junctionId}
        [HttpGet("sensors/junction/{junctionId}")]
        public async Task<IActionResult> GetSensorsByJunctionAsync(int junctionId)
        {
            // Call the method from Service_Manager_Connections
            var sensors = await _connectionService.GetSensorsByJunctionAsync(junctionId);

            // Check if no sensors were found for the given junction
            if (sensors == null || !sensors.Any())
            {
                return NotFound($"No sensors found for junction {junctionId}.");
            }

            // Return the list of sensors if found
            return Ok(sensors);
        }

    }
}
