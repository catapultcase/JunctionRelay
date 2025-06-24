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
using System.Net.WebSockets;

namespace JunctionRelayServer.Controllers
{
    [Route("api/device-websocket")]
    [ApiController]
    public class Controller_DeviceWebSocket : ControllerBase
    {
        private readonly Service_Manager_WebSocket_Devices _webSocketManager;

        public Controller_DeviceWebSocket(Service_Manager_WebSocket_Devices webSocketManager)
        {
            _webSocketManager = webSocketManager;
        }

        // WebSocket endpoint for device connections
        [HttpGet("connect")]
        public async Task ConnectDevice([FromQuery] string mac, [FromQuery] string? name = null)
        {
            try
            {
                if (!HttpContext.WebSockets.IsWebSocketRequest)
                {
                    HttpContext.Response.StatusCode = 400;
                    await HttpContext.Response.WriteAsync("This endpoint only accepts WebSocket connections");
                    return;
                }

                if (string.IsNullOrWhiteSpace(mac))
                {
                    HttpContext.Response.StatusCode = 400;
                    await HttpContext.Response.WriteAsync("Device MAC address is required as query parameter 'mac'");
                    return;
                }

                // Validate MAC address format
                if (!IsValidMacAddress(mac))
                {
                    HttpContext.Response.StatusCode = 400;
                    await HttpContext.Response.WriteAsync("Invalid MAC address format. Expected format: XX:XX:XX:XX:XX:XX");
                    return;
                }

                // Get client IP address
                var clientIp = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Unknown";

                Console.WriteLine($"WebSocket connection request from device {mac} at {clientIp}");

                // Accept the WebSocket connection
                var webSocket = await HttpContext.WebSockets.AcceptWebSocketAsync();

                // IMPORTANT: Handle the connection and WAIT for it to end
                // Don't return immediately - this keeps the HTTP context alive
                await _webSocketManager.HandleDeviceConnectionAndWaitAsync(
                    webSocket,
                    mac,
                    name,
                    clientIp);

                Console.WriteLine($"WebSocket connection ended for device {mac}");

                // Connection has ended - now we can return
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error handling WebSocket connection request: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
            }
        }

        // Get list of currently connected devices
        [HttpGet("connected")]
        public IActionResult GetConnectedDevices()
        {
            try
            {
                var connectedDevices = _webSocketManager.GetConnectedDevices();
                return Ok(new
                {
                    timestamp = DateTime.UtcNow,
                    connectedCount = connectedDevices.Count(),
                    devices = connectedDevices
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error getting connected devices: {ex.Message}");
                return StatusCode(500, new { error = "Internal server error", message = ex.Message });
            }
        }

        // Get connection status for specific device
        [HttpGet("status/{deviceMac}")]
        public IActionResult GetDeviceStatus(string deviceMac)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(deviceMac) || !IsValidMacAddress(deviceMac))
                {
                    return BadRequest("Valid device MAC address is required");
                }

                var isConnected = _webSocketManager.IsDeviceConnected(deviceMac);
                var statistics = _webSocketManager.GetDeviceStatistics(deviceMac);

                if (statistics == null && !isConnected)
                {
                    return NotFound($"No connection information found for device {deviceMac}");
                }

                return Ok(new
                {
                    deviceMac = deviceMac,
                    isConnected = isConnected,
                    timestamp = DateTime.UtcNow,
                    statistics = statistics
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error getting device status for {deviceMac}: {ex.Message}");
                return StatusCode(500, new { error = "Internal server error", message = ex.Message });
            }
        }

        // Send message to specific device
        [HttpPost("send/{deviceMac}")]
        public async Task<IActionResult> SendMessageToDevice(string deviceMac, [FromBody] object message)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(deviceMac) || !IsValidMacAddress(deviceMac))
                {
                    return BadRequest("Valid device MAC address is required");
                }

                if (message == null)
                {
                    return BadRequest("Message content is required");
                }

                if (!_webSocketManager.IsDeviceConnected(deviceMac))
                {
                    return NotFound($"Device {deviceMac} is not currently connected");
                }

                var success = await _webSocketManager.SendMessageToDeviceAsync(deviceMac, message);

                if (success)
                {
                    return Ok(new
                    {
                        success = true,
                        message = "Message sent successfully",
                        deviceMac = deviceMac,
                        timestamp = DateTime.UtcNow
                    });
                }
                else
                {
                    return StatusCode(500, new
                    {
                        success = false,
                        message = "Failed to send message to device",
                        deviceMac = deviceMac
                    });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error sending message to device {deviceMac}: {ex.Message}");
                return StatusCode(500, new { error = "Internal server error", message = ex.Message });
            }
        }

        // Disconnect specific device
        [HttpPost("disconnect/{deviceMac}")]
        public async Task<IActionResult> DisconnectDevice(string deviceMac, [FromQuery] string reason = "Manual disconnect")
        {
            try
            {
                if (string.IsNullOrWhiteSpace(deviceMac) || !IsValidMacAddress(deviceMac))
                {
                    return BadRequest("Valid device MAC address is required");
                }

                if (!_webSocketManager.IsDeviceConnected(deviceMac))
                {
                    return NotFound($"Device {deviceMac} is not currently connected");
                }

                await _webSocketManager.CloseConnectionAsync(deviceMac, reason);

                return Ok(new
                {
                    success = true,
                    message = $"Device {deviceMac} disconnected",
                    reason = reason,
                    timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error disconnecting device {deviceMac}: {ex.Message}");
                return StatusCode(500, new { error = "Internal server error", message = ex.Message });
            }
        }

        // Request health report from specific device
        [HttpPost("request-health/{deviceMac}")]
        public async Task<IActionResult> RequestHealthReport(string deviceMac)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(deviceMac) || !IsValidMacAddress(deviceMac))
                {
                    return BadRequest("Valid device MAC address is required");
                }

                if (!_webSocketManager.IsDeviceConnected(deviceMac))
                {
                    return NotFound($"Device {deviceMac} is not currently connected");
                }

                var healthRequest = new
                {
                    type = "health-request",
                    timestamp = DateTime.UtcNow,
                    requestId = Guid.NewGuid().ToString()
                };

                var success = await _webSocketManager.SendMessageToDeviceAsync(deviceMac, healthRequest);

                if (success)
                {
                    return Ok(new
                    {
                        success = true,
                        message = "Health report requested",
                        deviceMac = deviceMac,
                        requestId = healthRequest.requestId,
                        timestamp = DateTime.UtcNow
                    });
                }
                else
                {
                    return StatusCode(500, new
                    {
                        success = false,
                        message = "Failed to send health request to device",
                        deviceMac = deviceMac
                    });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error requesting health report from device {deviceMac}: {ex.Message}");
                return StatusCode(500, new { error = "Internal server error", message = ex.Message });
            }
        }

        // Helper method to validate MAC address format
        private static bool IsValidMacAddress(string macAddress)
        {
            if (string.IsNullOrWhiteSpace(macAddress) || macAddress.Length != 17)
                return false;

            for (int i = 0; i < 17; i++)
            {
                if (i % 3 == 2)
                {
                    if (macAddress[i] != ':') return false;
                }
                else
                {
                    char c = macAddress[i];
                    if (!((c >= '0' && c <= '9') || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f')))
                        return false;
                }
            }
            return true;
        }
    }
}