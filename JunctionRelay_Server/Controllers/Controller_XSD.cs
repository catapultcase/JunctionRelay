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

using JunctionRelayServer.Models;
using JunctionRelayServer.Services;
using Microsoft.AspNetCore.Mvc;

namespace JunctionRelayServer.Controllers
{
    [Route("api/xsd")]
    [ApiController]
    public class Controller_XSD : ControllerBase
    {
        private readonly Service_Database_Manager_Devices _deviceDb;
        private readonly Service_Database_Manager_Collectors _collectorDb;
        private readonly Service_Manager_WebSocket_Client _webSocketClient;
        private readonly ILogger<Controller_XSD> _logger;

        public Controller_XSD(
            Service_Database_Manager_Devices deviceDb,
            Service_Database_Manager_Collectors collectorDb,
            Service_Manager_WebSocket_Client webSocketClient,
            ILogger<Controller_XSD> logger)
        {
            _deviceDb = deviceDb;
            _collectorDb = collectorDb;
            _webSocketClient = webSocketClient;
            _logger = logger;
        }

        /// <summary>
        /// GET /api/xsd - Get all XSD devices
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> GetAllXSDs()
        {
            try
            {
                var allDevices = await _deviceDb.GetAllDevicesAsync();
                var xsdDevices = allDevices.Where(d => d.IsXSD).ToList();

                // Add connection status from WebSocket client
                foreach (var device in xsdDevices)
                {
                    device.IsConnected = !string.IsNullOrEmpty(device.UniqueIdentifier) &&
                                        _webSocketClient.IsDeviceConnected(device.UniqueIdentifier);
                    device.Status = device.IsConnected ? "Connected" : "Disconnected";
                }

                return Ok(xsdDevices);
            }
            catch (Exception ex)
            {
                _logger.LogError($"[XSDs API] Error getting XSD devices: {ex.Message}");
                return StatusCode(500, new { error = "Failed to retrieve XSD devices", message = ex.Message });
            }
        }

        /// <summary>
        /// GET /api/xsd/{id} - Get specific XSD device
        /// </summary>
        [HttpGet("{id}")]
        public async Task<IActionResult> GetXSD(int id)
        {
            try
            {
                var device = await _deviceDb.GetDeviceByIdAsync(id);

                if (device == null || !device.IsXSD)
                {
                    return NotFound(new { error = "XSD device not found" });
                }

                // Update connection status
                device.IsConnected = !string.IsNullOrEmpty(device.UniqueIdentifier) &&
                                    _webSocketClient.IsDeviceConnected(device.UniqueIdentifier);
                device.Status = device.IsConnected ? "Connected" : "Disconnected";

                return Ok(device);
            }
            catch (Exception ex)
            {
                _logger.LogError($"[XSDs API] Error getting XSD device {id}: {ex.Message}");
                return StatusCode(500, new { error = "Failed to retrieve XSD device", message = ex.Message });
            }
        }

        /// <summary>
        /// POST /api/xsd - Create new XSD device
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> CreateXSD([FromBody] Model_Device device)
        {
            try
            {
                // Set required fields for XSD device
                device.IsXSD = true;
                device.Type = "XSD";
                device.Status = "Disconnected";
                device.IsConnected = false;
                device.SupportsWebSockets = true;

                // Set default WebSocket port if not provided
                if (!device.WebSocketPort.HasValue || device.WebSocketPort == 0)
                {
                    device.WebSocketPort = 8084;
                }

                // Generate unique identifier if not provided
                if (string.IsNullOrEmpty(device.UniqueIdentifier))
                {
                    device.UniqueIdentifier = $"xsd_{Guid.NewGuid():N}";
                }

                var createdDevice = await _deviceDb.AddDeviceAsync(device);

                _logger.LogInformation($"[XSDs API] Created XSD device {createdDevice.Id} ({createdDevice.Name})");

                // Always create a linked collector for XSD devices
                var collectorName = $"{createdDevice.Name} (Metrics)";

                // Check if a collector with this name already exists and delete it
                var allCollectors = await _collectorDb.GetAllCollectorsAsync();
                var existingCollector = allCollectors.FirstOrDefault(c => c.Name == collectorName);
                if (existingCollector != null)
                {
                    _logger.LogWarning($"[XSDs] Found existing collector '{collectorName}' (ID: {existingCollector.Id}), deleting it before creating new one");
                    await _collectorDb.DeleteCollectorAsync(existingCollector.Id);
                }

                // Create linked collector
                var collector = new Model_Collector
                {
                    Name = collectorName,
                    CollectorType = "XSD",
                    Status = "Active",
                    URL = $"xsd://{createdDevice.Id}",
                    PollRate = 5000,
                    Description = $"Auto-created collector for XSD device: {createdDevice.Name}"
                };

                var createdCollector = await _collectorDb.AddCollectorAsync(collector);
                createdDevice.LinkedCollectorId = createdCollector.Id;
                await _deviceDb.UpdateDeviceAsync(createdDevice.Id, createdDevice);

                _logger.LogInformation($"[XSDs] Created linked collector {createdCollector.Id} for device {createdDevice.Id}");

                return Ok(createdDevice);
            }
            catch (Exception ex)
            {
                _logger.LogError($"[XSDs API] Error creating XSD device: {ex.Message}");
                return StatusCode(500, new { error = "Failed to create XSD device", message = ex.Message });
            }
        }

        /// <summary>
        /// PUT /api/xsd/{id} - Update XSD device
        /// </summary>
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateXSD(int id, [FromBody] Model_Device updatedDevice)
        {
            try
            {
                var existingDevice = await _deviceDb.GetDeviceByIdAsync(id);

                if (existingDevice == null || !existingDevice.IsXSD)
                {
                    return NotFound(new { error = "XSD device not found" });
                }

                // Update fields
                existingDevice.Name = updatedDevice.Name;
                existingDevice.Description = updatedDevice.Description;
                existingDevice.IPAddress = updatedDevice.IPAddress;
                existingDevice.WebSocketPort = updatedDevice.WebSocketPort;

                await _deviceDb.UpdateDeviceAsync(existingDevice.Id, existingDevice);

                _logger.LogInformation($"[XSDs API] Updated XSD device {id}");

                return Ok(existingDevice);
            }
            catch (Exception ex)
            {
                _logger.LogError($"[XSDs API] Error updating XSD device {id}: {ex.Message}");
                return StatusCode(500, new { error = "Failed to update XSD device", message = ex.Message });
            }
        }

        /// <summary>
        /// DELETE /api/xsd/{id} - Delete XSD device
        /// </summary>
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteXSD(int id)
        {
            try
            {
                var device = await _deviceDb.GetDeviceByIdAsync(id);

                if (device == null || !device.IsXSD)
                {
                    return NotFound(new { error = "XSD device not found" });
                }

                // Delete linked collector if exists
                if (device.LinkedCollectorId.HasValue)
                {
                    await _collectorDb.DeleteCollectorAsync(device.LinkedCollectorId.Value);
                }

                // Delete device
                await _deviceDb.DeleteDeviceAsync(id);

                _logger.LogInformation($"[XSDs API] Deleted XSD device {id}");

                return Ok(new { message = "XSD device deleted successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError($"[XSDs API] Error deleting XSD device {id}: {ex.Message}");
                return StatusCode(500, new { error = "Failed to delete XSD device", message = ex.Message });
            }
        }

        /// <summary>
        /// POST /api/xsd/{id}/test-connection - Test connection to XSD device
        /// </summary>
        [HttpPost("{id}/test-connection")]
        public async Task<IActionResult> TestConnection(int id)
        {
            try
            {
                var device = await _deviceDb.GetDeviceByIdAsync(id);

                if (device == null || !device.IsXSD)
                {
                    return NotFound(new { error = "XSD device not found" });
                }

                var isConnected = !string.IsNullOrEmpty(device.UniqueIdentifier) &&
                                 _webSocketClient.IsDeviceConnected(device.UniqueIdentifier);

                return Ok(new
                {
                    connected = isConnected,
                    message = isConnected ? "Device is connected" : "Device is not connected"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError($"[XSDs API] Error testing connection for device {id}: {ex.Message}");
                return StatusCode(500, new { error = "Failed to test connection", message = ex.Message });
            }
        }

        /// <summary>
        /// GET /api/xsd/{id}/streams - Get available streams from XSD device
        /// </summary>
        [HttpGet("{id}/streams")]
        public async Task<IActionResult> GetStreams(int id)
        {
            try
            {
                var device = await _deviceDb.GetDeviceByIdAsync(id);

                if (device == null || !device.IsXSD)
                {
                    return NotFound(new { error = "XSD device not found" });
                }

                var isConnected = !string.IsNullOrEmpty(device.UniqueIdentifier) &&
                                 _webSocketClient.IsDeviceConnected(device.UniqueIdentifier);

                if (!isConnected)
                {
                    return Ok(new
                    {
                        connected = false,
                        streams = Array.Empty<object>()
                    });
                }

                var streams = _webSocketClient.GetDeviceStreams(device.UniqueIdentifier);

                return Ok(new
                {
                    connected = true,
                    streams = streams
                });
            }
            catch (Exception ex)
            {
                _logger.LogError($"[XSDs API] Error getting streams for device {id}: {ex.Message}");
                return StatusCode(500, new { error = "Failed to get streams", message = ex.Message });
            }
        }

    }
}
