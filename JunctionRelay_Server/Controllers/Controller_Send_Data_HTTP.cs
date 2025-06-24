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
using JunctionRelayServer.Models;
using JunctionRelayServer.Services;

namespace JunctionRelayServer.Controllers
{
    [Route("api/send-data")]
    [ApiController]
    public class Controller_Send_Data_HTTP : ControllerBase
    {
        private readonly Service_Database_Manager_Devices _deviceDb;
        private readonly Service_Stream_Manager_HTTP _streamManager;

        public Controller_Send_Data_HTTP(Service_Database_Manager_Devices deviceDb, Service_Stream_Manager_HTTP streamManager)
        {
            _deviceDb = deviceDb;
            _streamManager = streamManager;
        }

        [HttpPost("send")]
        public async Task<IActionResult> SendData([FromBody] Model_Send_Data request)
        {
            if (request == null)
            {
                Console.WriteLine("[CONTROLLER_SEND_DATA_HTTP] Invalid request data received.");
                return BadRequest("Invalid request data.");
            }

            var device = await _deviceDb.GetDeviceByIdAsync(request.DeviceId);
            if (device == null)
            {
                Console.WriteLine($"[CONTROLLER_SEND_DATA_HTTP] Device with ID {request.DeviceId} not found.");
                return NotFound($"Device with ID {request.DeviceId} not found.");
            }

            if (string.IsNullOrWhiteSpace(device.IPAddress))
            {
                Console.WriteLine("[CONTROLLER_SEND_DATA_HTTP] Device has no IP address configured.");
                return BadRequest("Device has no IP address.");
            }

            string endpointUrl = $"http://{device.IPAddress}/api/data";
            var sender = new Service_Send_Data_HTTP(endpointUrl);

            // Generate the Quad config payload based on DisplayText (if provided)
            if (!string.IsNullOrWhiteSpace(request.DisplayText))
            {
                string quadConfigPayload = Service_Payload_Generator_Quad.GenerateQuadPayload(request.DisplayText, request.Mode);

                Console.WriteLine($"[CONTROLLER_SEND_DATA_HTTP] Sending Quad config payload to {endpointUrl}: {quadConfigPayload}");
                var (quadConfigSent, quadConfigResponse) = await sender.SendPayloadAsync(quadConfigPayload);

                if (!quadConfigSent)
                {
                    Console.WriteLine("[CONTROLLER_SEND_DATA_HTTP] Failed to send Quad config payload.");
                    return StatusCode(500, "Failed to send Quad config payload.");
                }

                Console.WriteLine($"[CONTROLLER_SEND_DATA_HTTP] ACK received from Quad config: {quadConfigResponse}");
            }


            // Send config payload if available
            if (!string.IsNullOrWhiteSpace(request.ConfigPayload))
            {
                Console.WriteLine($"[CONTROLLER_SEND_DATA_HTTP] Sending config payload to {endpointUrl}: {request.ConfigPayload}");
                var (configSent, configResponse) = await sender.SendPayloadAsync(request.ConfigPayload);

                if (!configSent)
                {
                    Console.WriteLine("[CONTROLLER_SEND_DATA_HTTP] Failed to send config payload.");
                    return StatusCode(500, "Failed to send config payload.");
                }

                Console.WriteLine($"[CONTROLLER_SEND_DATA_HTTP] ACK received from config: {configResponse}");
            }

            // Send sensor payload if available
            if (!string.IsNullOrWhiteSpace(request.SensorPayload))
            {
                Console.WriteLine($"[CONTROLLER_SEND_DATA_HTTP] Sending sensor payload to {endpointUrl}: {request.SensorPayload}");

                var (sensorSent, sensorResponse) = await sender.SendPayloadAsync(request.SensorPayload);

                if (!sensorSent)
                {
                    Console.WriteLine("[CONTROLLER_SEND_DATA_HTTP] Failed to send sensor payload.");
                    return StatusCode(500, "Failed to send sensor payload.");
                }

                Console.WriteLine($"[CONTROLLER_SEND_DATA_HTTP] ACK received from sensor: {sensorResponse}");
            }

            Console.WriteLine("[CONTROLLER_SEND_DATA_HTTP] Payload(s) sent successfully.");
            return Ok("Payload(s) sent successfully.");
        }

        // Endpoint to get the latest latency
        [HttpGet("latency/{screenId}")]
        public IActionResult GetLatency(int screenId)
        {
            if (_streamManager.IsStreaming(screenId))  // Fixed the parenthesis
            {
                long latency = _streamManager.GetLatestLatency(screenId);  // This would return the last captured latency
                return Ok(new { latency });
            }

            return NotFound("Device is not streaming.");
        }

    }
}
