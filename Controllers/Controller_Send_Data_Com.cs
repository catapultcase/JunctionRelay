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
using JunctionRelayServer.Models;
using JunctionRelayServer.Services;

namespace JunctionRelayServer.Controllers
{
    [Route("api/send-data")]
    [ApiController]
    public class Controller_Send_Data_COM : ControllerBase
    {
        private readonly Service_Database_Manager_Devices _deviceDb;
        private readonly Service_Stream_Manager_COM _streamManager;
        private readonly Func<string, Service_Send_Data_COM> _dataSenderFactory;  // Injected factory for dynamic COM port creation

        // Constructor now injects the factory for Service_Send_Data_COM
        public Controller_Send_Data_COM(Service_Database_Manager_Devices deviceDb,
                                         Service_Stream_Manager_COM streamManager,
                                         Func<string, Service_Send_Data_COM> dataSenderFactory)
        {
            _deviceDb = deviceDb;
            _streamManager = streamManager;
            _dataSenderFactory = dataSenderFactory;  // Store the injected factory
        }

        [HttpPost("com-send")]
        public async Task<IActionResult> SendData([FromBody] Model_Send_Data request)
        {
            if (request == null || request.DeviceId <= 0)
            {
                Console.WriteLine("[DEBUG] Invalid request data received or missing DeviceId.");
                return BadRequest("Invalid request data or missing DeviceId.");
            }

            var device = await _deviceDb.GetDeviceByIdAsync(request.DeviceId);
            if (device == null)
            {
                Console.WriteLine($"[DEBUG] Device with ID {request.DeviceId} not found.");
                return NotFound($"Device with ID {request.DeviceId} not found.");
            }

            if (string.IsNullOrWhiteSpace(device.SelectedPort))
            {
                Console.WriteLine("[DEBUG] Device has no COM port configured.");
                return BadRequest("Device has no COM port.");
            }

            string comPort = device.SelectedPort;

            // Use the factory to create a new instance of Service_Send_Data_COM with the dynamic comPort
            var sender = _dataSenderFactory(comPort);  // Create a new instance of Service_Send_Data_COM

            // Send the different payloads if they are provided
            if (!string.IsNullOrWhiteSpace(request.DisplayText))
            {
                string quadConfigPayload = Service_Payload_Generator_Quad.GenerateQuadPayload(request.DisplayText, request.Mode);
                Console.WriteLine($"[DEBUG] Sending Quad config payload to COM port {comPort} (Mode={request.Mode}): {quadConfigPayload}");
                var (quadConfigSent, quadConfigResponse) = await sender.SendPayloadAsync(quadConfigPayload);

                if (!quadConfigSent)
                {
                    Console.WriteLine("[DEBUG] Failed to send Quad config payload.");
                    return StatusCode(500, "Failed to send Quad config payload.");
                }

                Console.WriteLine($"[DEBUG] ACK received from Quad config: {quadConfigResponse}");
            }

            if (!string.IsNullOrWhiteSpace(request.ConfigPayload))
            {
                Console.WriteLine($"[DEBUG] Sending config payload to COM port {comPort}: {request.ConfigPayload}");
                var (configSent, configResponse) = await sender.SendPayloadAsync(request.ConfigPayload);

                if (!configSent)
                {
                    Console.WriteLine("[DEBUG] Failed to send config payload.");
                    return StatusCode(500, "Failed to send config payload.");
                }

                Console.WriteLine($"[DEBUG] ACK received from config: {configResponse}");
            }

            if (!string.IsNullOrWhiteSpace(request.SensorPayload))
            {
                Console.WriteLine($"[DEBUG] Sending sensor payload to COM port {comPort}: {request.SensorPayload}");
                var (sensorSent, sensorResponse) = await sender.SendPayloadAsync(request.SensorPayload);

                if (!sensorSent)
                {
                    Console.WriteLine("[DEBUG] Failed to send sensor payload.");
                    return StatusCode(500, "Failed to send sensor payload.");
                }

                Console.WriteLine($"[DEBUG] ACK received from sensor: {sensorResponse}");
            }

            Console.WriteLine("[DEBUG] Payload(s) sent successfully.");
            return Ok("Payload(s) sent successfully.");
        }

        [HttpGet("com-latency/{deviceId}")]
        public IActionResult GetLatency(int deviceId)
        {
            if (_streamManager.IsStreaming(deviceId))
            {
                long latency = _streamManager.GetLatestLatency(deviceId);
                return Ok(new { latency });
            }

            return NotFound("Device is not streaming.");
        }
    }
}
