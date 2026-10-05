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
    [Route("api/ssh")]
    [ApiController]
    public class Controller_SSH : ControllerBase
    {
        private readonly Service_Manager_SSH _sshService;
        private readonly Service_Database_Manager_Devices _deviceDb;

        public Controller_SSH(Service_Manager_SSH sshService, Service_Database_Manager_Devices deviceDb)
        {
            _sshService = sshService;
            _deviceDb = deviceDb;
        }

        // GET: api/ssh/connections
        [HttpGet("connections")]
        public IActionResult GetAllConnections()
        {
            try
            {
                var connections = _sshService.GetAllDevices();
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
                    message = "Error retrieving SSH connections",
                    error = ex.Message
                });
            }
        }

        // GET: api/ssh/connections/active
        [HttpGet("connections/active")]
        public IActionResult GetActiveConnections()
        {
            try
            {
                var activeConnections = _sshService.GetConnectedDevices();
                return Ok(new
                {
                    success = true,
                    connections = activeConnections,
                    activeCount = activeConnections.Count()
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error retrieving active SSH connections",
                    error = ex.Message
                });
            }
        }

        // GET: api/ssh/connections/{deviceKey}/status
        [HttpGet("connections/{deviceKey}/status")]
        public IActionResult GetConnectionStatus(string deviceKey)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(deviceKey))
                    return BadRequest(new { success = false, message = "Device key is required" });

                var isConnected = _sshService.IsDeviceConnected(deviceKey);
                var allDevices = _sshService.GetAllDevices();
                var deviceInfo = allDevices.FirstOrDefault(d =>
                    d.GetType().GetProperty("DeviceKey")?.GetValue(d)?.ToString() == deviceKey);

                return Ok(new
                {
                    success = true,
                    deviceKey = deviceKey,
                    isConnected = isConnected,
                    deviceInfo = deviceInfo
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error checking SSH connection status",
                    error = ex.Message
                });
            }
        }

        // POST: api/ssh/connections/{deviceKey}/disconnect
        [HttpPost("connections/{deviceKey}/disconnect")]
        public async Task<IActionResult> DisconnectDevice(string deviceKey)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(deviceKey))
                    return BadRequest(new { success = false, message = "Device key is required" });

                var success = await _sshService.ForceDisconnectDeviceAsync(deviceKey);

                if (success)
                {
                    return Ok(new
                    {
                        success = true,
                        message = $"Device {deviceKey} disconnected successfully"
                    });
                }
                else
                {
                    return BadRequest(new
                    {
                        success = false,
                        message = $"Failed to disconnect device {deviceKey}"
                    });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error disconnecting SSH device",
                    error = ex.Message
                });
            }
        }

        // POST: api/ssh/connections/{deviceKey}/reconnect
        [HttpPost("connections/{deviceKey}/reconnect")]
        public async Task<IActionResult> ReconnectDevice(string deviceKey)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(deviceKey))
                    return BadRequest(new { success = false, message = "Device key is required" });

                var success = await _sshService.ForceReconnectDeviceAsync(deviceKey);

                if (success)
                {
                    return Ok(new
                    {
                        success = true,
                        message = $"Device {deviceKey} reconnection initiated successfully"
                    });
                }
                else
                {
                    return BadRequest(new
                    {
                        success = false,
                        message = $"Failed to reconnect device {deviceKey}"
                    });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error reconnecting SSH device",
                    error = ex.Message
                });
            }
        }

        // POST: api/ssh/connections/{deviceKey}/execute
        [HttpPost("connections/{deviceKey}/execute")]
        public async Task<IActionResult> ExecuteCommand(string deviceKey, [FromBody] ExecuteCommandRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(deviceKey))
                    return BadRequest(new { success = false, message = "Device key is required" });

                if (request == null || string.IsNullOrWhiteSpace(request.Command))
                    return BadRequest(new { success = false, message = "Command is required" });

                var timeoutMs = request.TimeoutMs ?? 10000;
                if (timeoutMs < 1000 || timeoutMs > 60000)
                    return BadRequest(new { success = false, message = "Timeout must be between 1000ms and 60000ms" });

                var (success, duration, output, exitStatus) = await _sshService.ExecuteCommandAsync(
                    deviceKey, request.Command, timeoutMs);

                return Ok(new
                {
                    success = success,
                    deviceKey = deviceKey,
                    command = request.Command,
                    duration = duration,
                    output = output,
                    exitStatus = exitStatus,
                    executedAt = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error executing SSH command",
                    error = ex.Message
                });
            }
        }

        // POST: api/ssh/connections/{deviceKey}/health-check
        [HttpPost("connections/{deviceKey}/health-check")]
        public async Task<IActionResult> ExecuteHealthCheck(string deviceKey, [FromBody] HealthCheckRequest? request = null)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(deviceKey))
                    return BadRequest(new { success = false, message = "Device key is required" });

                var command = request?.Command ?? "uptime";
                var expectedValue = request?.ExpectedValue ?? "up";

                var (success, duration, output) = await _sshService.ExecuteHealthCheckAsync(
                    deviceKey, command, expectedValue);

                return Ok(new
                {
                    success = success,
                    deviceKey = deviceKey,
                    command = command,
                    expectedValue = expectedValue,
                    duration = duration,
                    output = output,
                    executedAt = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error executing SSH health check",
                    error = ex.Message
                });
            }
        }

        // GET: api/ssh/devices
        [HttpGet("devices")]
        public async Task<IActionResult> GetSshDevices()
        {
            try
            {
                var devices = await _deviceDb.GetAllDevicesAsync();
                var sshDevices = devices.Where(d =>
                    d.HeartbeatEnabled &&
                    d.HeartbeatProtocol?.ToUpper() == "SSH" &&
                    !string.IsNullOrWhiteSpace(d.IPAddress) &&
                    !string.IsNullOrWhiteSpace(d.SshUsername)
                ).Select(d => new
                {
                    deviceId = d.Id,
                    deviceName = d.Name,
                    deviceKey = $"{d.IPAddress}:{d.SshPort ?? 22}:{d.SshUsername}",
                    ipAddress = d.IPAddress,
                    port = d.SshPort ?? 22,
                    username = d.SshUsername,
                    useKeyAuth = d.UseSshKeyAuth,
                    heartbeatEnabled = d.HeartbeatEnabled,
                    heartbeatTarget = d.HeartbeatTarget,
                    heartbeatExpectedValue = d.HeartbeatExpectedValue,
                    isConnected = _sshService.IsDeviceConnected($"{d.IPAddress}:{d.SshPort ?? 22}:{d.SshUsername}")
                }).ToList();

                return Ok(new
                {
                    success = true,
                    devices = sshDevices,
                    totalCount = sshDevices.Count
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error retrieving SSH devices",
                    error = ex.Message
                });
            }
        }

        // POST: api/ssh/connections/disconnect-all
        [HttpPost("connections/disconnect-all")]
        public async Task<IActionResult> DisconnectAllDevices()
        {
            try
            {
                var activeConnections = _sshService.GetConnectedDevices().ToList();
                var disconnectTasks = new List<Task<bool>>();

                foreach (var connection in activeConnections)
                {
                    var deviceKey = connection.GetType().GetProperty("DeviceKey")?.GetValue(connection)?.ToString();
                    if (!string.IsNullOrEmpty(deviceKey))
                    {
                        disconnectTasks.Add(_sshService.ForceDisconnectDeviceAsync(deviceKey));
                    }
                }

                var results = await Task.WhenAll(disconnectTasks);
                var successCount = results.Count(r => r);

                return Ok(new
                {
                    success = true,
                    message = $"Disconnected {successCount} out of {activeConnections.Count} SSH connections",
                    disconnectedCount = successCount,
                    totalAttempted = activeConnections.Count
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Error disconnecting all SSH devices",
                    error = ex.Message
                });
            }
        }

        // GET: api/ssh/statistics
        [HttpGet("statistics")]
        public IActionResult GetSshStatistics()
        {
            try
            {
                var allConnections = _sshService.GetAllDevices().ToList();
                var activeConnections = allConnections.Where(c =>
                {
                    var isConnectedProp = c.GetType().GetProperty("IsConnected");
                    return isConnectedProp?.GetValue(c) as bool? ?? false;
                }).ToList();

                var statistics = new
                {
                    totalConnections = allConnections.Count,
                    activeConnections = activeConnections.Count,
                    inactiveConnections = allConnections.Count - activeConnections.Count,
                    connectionDetails = allConnections.GroupBy(c =>
                    {
                        var isConnectedProp = c.GetType().GetProperty("IsConnected");
                        return isConnectedProp?.GetValue(c) as bool? ?? false ? "Connected" : "Disconnected";
                    }).ToDictionary(g => g.Key, g => g.Count())
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
                    message = "Error retrieving SSH statistics",
                    error = ex.Message
                });
            }
        }

        // Request models
        public class ExecuteCommandRequest
        {
            [Required]
            public string Command { get; set; } = string.Empty;

            [Range(1000, 60000)]
            public int? TimeoutMs { get; set; }
        }

        public class HealthCheckRequest
        {
            public string? Command { get; set; }
            public string? ExpectedValue { get; set; }
        }
    }
}