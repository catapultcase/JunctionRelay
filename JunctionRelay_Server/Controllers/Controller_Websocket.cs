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
using System.ComponentModel.DataAnnotations;

namespace JunctionRelayServer.Controllers
{
    [Route("api/websocket")]
    [ApiController]
    public class Controller_WebSocket : ControllerBase
    {
        private readonly Service_Manager_WebSocket_Devices _webSocketService;
        private readonly Service_Database_Manager_Devices _deviceDb;

        public Controller_WebSocket(Service_Manager_WebSocket_Devices webSocketService, Service_Database_Manager_Devices deviceDb)
        {
            _webSocketService = webSocketService;
            _deviceDb = deviceDb;
        }

        // GET: api/websocket/connections
        [HttpGet("connections")]
        public IActionResult GetAllConnections()
        {
            try
            {
                var connections = _webSocketService.GetConnectedDevices();
                return Ok(new
                {
                    success = true,
                    connections = connections,
                    totalCount = connections.Count()
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error retrieving WebSocket connections",
                    error = ex.Message
                });
            }
        }

        // GET: api/websocket/connections/{deviceMac}/status
        [HttpGet("connections/{deviceMac}/status")]
        public IActionResult GetConnectionStatus(string deviceMac)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(deviceMac))
                    return BadRequest(new { success = false, message = "Device MAC address is required" });

                var isConnected = _webSocketService.IsDeviceConnected(deviceMac);
                var allConnections = _webSocketService.GetConnectedDevices();
                var deviceInfo = allConnections.FirstOrDefault(d =>
                    d.GetType().GetProperty("DeviceMac")?.GetValue(d)?.ToString() == deviceMac);

                return Ok(new
                {
                    success = true,
                    deviceMac = deviceMac,
                    isConnected = isConnected,
                    deviceInfo = deviceInfo
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error checking WebSocket connection status",
                    error = ex.Message
                });
            }
        }

        // POST: api/websocket/connections/{deviceMac}/heartbeat
        [HttpPost("connections/{deviceMac}/heartbeat")]
        public async Task<IActionResult> SendHeartbeat(string deviceMac, [FromBody] HeartbeatRequest? request = null)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(deviceMac))
                    return BadRequest(new { success = false, message = "Device MAC address is required" });

                var heartbeatData = new
                {
                    expectedValue = request?.ExpectedValue ?? "ok",
                    deviceMac = deviceMac,
                    timeout = request?.TimeoutMs ?? 10000
                };

                var (success, duration, response) = await _webSocketService.SendHeartbeatRequestAsync(deviceMac, heartbeatData);

                return Ok(new
                {
                    success = success,
                    deviceMac = deviceMac,
                    duration = duration,
                    response = response,
                    sentAt = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error sending WebSocket heartbeat",
                    error = ex.Message
                });
            }
        }

        // GET: api/websocket/devices
        [HttpGet("devices")]
        public async Task<IActionResult> GetWebSocketDevices()
        {
            try
            {
                var devices = await _deviceDb.GetAllDevicesAsync();
                var webSocketDevices = devices.Where(d =>
                    d.HeartbeatEnabled &&
                    d.HeartbeatProtocol?.ToUpper() == "WEBSOCKET" &&
                    !string.IsNullOrWhiteSpace(d.IPAddress) &&
                    !string.IsNullOrWhiteSpace(d.UniqueIdentifier)
                ).Select(d => new
                {
                    deviceId = d.Id,
                    deviceName = d.Name,
                    deviceMac = d.UniqueIdentifier,
                    ipAddress = d.IPAddress,
                    heartbeatTarget = d.HeartbeatTarget,
                    heartbeatExpectedValue = d.HeartbeatExpectedValue,
                    heartbeatEnabled = d.HeartbeatEnabled,
                    lastPingStatus = d.LastPingStatus,
                    lastPinged = d.LastPinged,
                    isConnected = _webSocketService.IsDeviceConnected(d.UniqueIdentifier!)
                }).ToList();

                return Ok(new
                {
                    success = true,
                    devices = webSocketDevices,
                    totalCount = webSocketDevices.Count
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error retrieving WebSocket devices",
                    error = ex.Message
                });
            }
        }

        // GET: api/websocket/statistics
        [HttpGet("statistics")]
        public async Task<IActionResult> GetWebSocketStatistics()
        {
            try
            {
                var devices = await _deviceDb.GetAllDevicesAsync();
                var webSocketDevices = devices.Where(d =>
                    d.HeartbeatEnabled &&
                    d.HeartbeatProtocol?.ToUpper() == "WEBSOCKET" &&
                    !string.IsNullOrWhiteSpace(d.IPAddress) &&
                    !string.IsNullOrWhiteSpace(d.UniqueIdentifier)
                ).ToList();

                var connectedDevices = webSocketDevices.Where(d =>
                    _webSocketService.IsDeviceConnected(d.UniqueIdentifier!)).ToList();

                var statusBreakdown = webSocketDevices.GroupBy(d => d.LastPingStatus ?? "Unknown")
                    .ToDictionary(g => g.Key, g => g.Count());

                var statistics = new
                {
                    totalWebSocketDevices = webSocketDevices.Count,
                    connectedDevices = connectedDevices.Count,
                    disconnectedDevices = webSocketDevices.Count - connectedDevices.Count,
                    statusBreakdown = statusBreakdown,
                    recentActivity = webSocketDevices
                        .Where(d => d.LastPinged.HasValue)
                        .OrderByDescending(d => d.LastPinged)
                        .Take(5)
                        .Select(d => new
                        {
                            deviceName = d.Name,
                            deviceMac = d.UniqueIdentifier,
                            lastPinged = d.LastPinged,
                            status = d.LastPingStatus,
                            duration = d.LastPingDurationMs
                        })
                };

                return Ok(new
                {
                    success = true,
                    statistics = statistics,
                    generatedAt = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error retrieving WebSocket statistics",
                    error = ex.Message
                });
            }
        }

        // POST: api/websocket/connections/refresh
        [HttpPost("connections/refresh")]
        public IActionResult RefreshConnections()
        {
            try
            {
                // This endpoint can be used to trigger a refresh of connections
                // The background service will handle the actual reconnection logic
                var currentConnections = _webSocketService.GetConnectedDevices().ToList();

                return Ok(new
                {
                    success = true,
                    message = "Connection refresh triggered",
                    currentConnections = currentConnections.Count,
                    refreshedAt = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error refreshing WebSocket connections",
                    error = ex.Message
                });
            }
        }

        // GET: api/websocket/connection-urls
        [HttpGet("connection-urls")]
        public async Task<IActionResult> GetConnectionUrls()
        {
            try
            {
                var devices = await _deviceDb.GetAllDevicesAsync();
                var webSocketDevices = devices.Where(d =>
                    d.HeartbeatEnabled &&
                    d.HeartbeatProtocol?.ToUpper() == "WEBSOCKET" &&
                    !string.IsNullOrWhiteSpace(d.IPAddress) &&
                    !string.IsNullOrWhiteSpace(d.UniqueIdentifier)
                ).Select(d =>
                {
                    // Generate WebSocket URL based on HeartbeatTarget or default to port 81
                    string wsUrl;
                    if (!string.IsNullOrWhiteSpace(d.HeartbeatTarget))
                    {
                        if (d.HeartbeatTarget.StartsWith("ws://"))
                        {
                            wsUrl = d.HeartbeatTarget;
                        }
                        else if (d.HeartbeatTarget.All(char.IsDigit))
                        {
                            wsUrl = $"ws://{d.IPAddress}:{d.HeartbeatTarget}/";
                        }
                        else if (d.HeartbeatTarget.StartsWith("/"))
                        {
                            wsUrl = $"ws://{d.IPAddress}{d.HeartbeatTarget}";
                        }
                        else
                        {
                            wsUrl = $"ws://{d.IPAddress}:{d.HeartbeatTarget}";
                            if (!wsUrl.EndsWith("/")) wsUrl += "/";
                        }
                    }
                    else
                    {
                        wsUrl = $"ws://{d.IPAddress}:81/";
                    }

                    return new
                    {
                        deviceId = d.Id,
                        deviceName = d.Name,
                        deviceMac = d.UniqueIdentifier,
                        ipAddress = d.IPAddress,
                        heartbeatTarget = d.HeartbeatTarget,
                        calculatedUrl = wsUrl,
                        isConnected = _webSocketService.IsDeviceConnected(d.UniqueIdentifier!)
                    };
                }).ToList();

                return Ok(new
                {
                    success = true,
                    devices = webSocketDevices,
                    totalCount = webSocketDevices.Count
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error retrieving WebSocket connection URLs",
                    error = ex.Message
                });
            }
        }

        // Request models
        public class HeartbeatRequest
        {
            public string? ExpectedValue { get; set; }

            [Range(1000, 30000)]
            public int? TimeoutMs { get; set; }
        }
    }
}