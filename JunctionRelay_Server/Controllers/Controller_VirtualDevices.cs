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
    [Route("api/virtualdevices")]
    [ApiController]
    public class Controller_VirtualDevices : ControllerBase
    {
        private readonly Service_Database_Manager_Devices _deviceDb;
        private readonly Service_Database_Manager_Collectors _collectorDb;
        private readonly Service_Manager_WebSocket_Client _webSocketClient;
        private readonly ILogger<Controller_VirtualDevices> _logger;

        public Controller_VirtualDevices(
            Service_Database_Manager_Devices deviceDb,
            Service_Database_Manager_Collectors collectorDb,
            Service_Manager_WebSocket_Client webSocketClient,
            ILogger<Controller_VirtualDevices> logger)
        {
            _deviceDb = deviceDb;
            _collectorDb = collectorDb;
            _webSocketClient = webSocketClient;
            _logger = logger;
        }

        /// <summary>
        /// GET /api/virtualdevices - Get all virtual devices
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> GetAllVirtualDevices()
        {
            try
            {
                var allDevices = await _deviceDb.GetAllDevicesAsync();
                var virtualDevices = allDevices.Where(d => d.IsVirtualDevice).ToList();

                // Add connection status from WebSocket client
                foreach (var device in virtualDevices)
                {
                    device.IsConnected = !string.IsNullOrEmpty(device.UniqueIdentifier) &&
                                        _webSocketClient.IsDeviceConnected(device.UniqueIdentifier);
                    device.Status = device.IsConnected ? "Connected" : "Disconnected";
                }

                return Ok(virtualDevices);
            }
            catch (Exception ex)
            {
                _logger.LogError($"[VirtualDevices API] Error getting virtual devices: {ex.Message}");
                return StatusCode(500, new { error = "Failed to retrieve virtual devices", message = ex.Message });
            }
        }

        /// <summary>
        /// GET /api/virtualdevices/{id} - Get specific virtual device
        /// </summary>
        [HttpGet("{id}")]
        public async Task<IActionResult> GetVirtualDevice(int id)
        {
            try
            {
                var device = await _deviceDb.GetDeviceByIdAsync(id);

                if (device == null || !device.IsVirtualDevice)
                {
                    return NotFound(new { error = "Virtual device not found" });
                }

                // Update connection status
                device.IsConnected = !string.IsNullOrEmpty(device.UniqueIdentifier) &&
                                    _webSocketClient.IsDeviceConnected(device.UniqueIdentifier);
                device.Status = device.IsConnected ? "Connected" : "Disconnected";

                return Ok(device);
            }
            catch (Exception ex)
            {
                _logger.LogError($"[VirtualDevices API] Error getting virtual device {id}: {ex.Message}");
                return StatusCode(500, new { error = "Failed to retrieve virtual device", message = ex.Message });
            }
        }

        /// <summary>
        /// POST /api/virtualdevices - Create new virtual device
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> CreateVirtualDevice([FromBody] Model_Device device)
        {
            try
            {
                // Set required fields for virtual device
                device.IsVirtualDevice = true;
                device.Type = "VirtualDevice";
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
                    device.UniqueIdentifier = $"virtualdevice_{Guid.NewGuid():N}";
                }

                var createdDevice = await _deviceDb.AddDeviceAsync(device);

                _logger.LogInformation($"[VirtualDevices API] Created virtual device {createdDevice.Id} ({createdDevice.Name})");

                // If Mode 1 (Collector) is enabled, create a linked collector
                if (createdDevice.VirtualDevice_Mode1_Enabled)
                {
                    await EnableMode1Async(createdDevice);
                    await _deviceDb.UpdateDeviceAsync(createdDevice.Id, createdDevice);
                }

                return Ok(createdDevice);
            }
            catch (Exception ex)
            {
                _logger.LogError($"[VirtualDevices API] Error creating virtual device: {ex.Message}");
                return StatusCode(500, new { error = "Failed to create virtual device", message = ex.Message });
            }
        }

        /// <summary>
        /// PUT /api/virtualdevices/{id} - Update virtual device
        /// </summary>
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateVirtualDevice(int id, [FromBody] Model_Device updatedDevice)
        {
            try
            {
                var existingDevice = await _deviceDb.GetDeviceByIdAsync(id);

                if (existingDevice == null || !existingDevice.IsVirtualDevice)
                {
                    return NotFound(new { error = "Virtual device not found" });
                }

                // Update fields
                existingDevice.Name = updatedDevice.Name;
                existingDevice.Description = updatedDevice.Description;
                existingDevice.IPAddress = updatedDevice.IPAddress;
                existingDevice.WebSocketPort = updatedDevice.WebSocketPort;

                // Handle Mode 1 toggle (collector mode)
                if (existingDevice.VirtualDevice_Mode1_Enabled != updatedDevice.VirtualDevice_Mode1_Enabled)
                {
                    if (updatedDevice.VirtualDevice_Mode1_Enabled)
                    {
                        // Enable Mode 1 - Create linked collector
                        await EnableMode1Async(existingDevice);
                    }
                    else
                    {
                        // Disable Mode 1 - Delete linked collector
                        await DisableMode1Async(existingDevice);
                    }
                }

                // Update mode configurations
                existingDevice.VirtualDevice_Mode1_Enabled = updatedDevice.VirtualDevice_Mode1_Enabled;
                existingDevice.VirtualDevice_Mode1_PollRate = updatedDevice.VirtualDevice_Mode1_PollRate;
                existingDevice.VirtualDevice_Mode2_Enabled = updatedDevice.VirtualDevice_Mode2_Enabled;
                existingDevice.VirtualDevice_Mode2_JunctionId = updatedDevice.VirtualDevice_Mode2_JunctionId;
                existingDevice.VirtualDevice_Mode2_SendRate = updatedDevice.VirtualDevice_Mode2_SendRate;
                existingDevice.VirtualDevice_Mode3_Enabled = updatedDevice.VirtualDevice_Mode3_Enabled;
                existingDevice.VirtualDevice_Mode3_LayoutConfig = updatedDevice.VirtualDevice_Mode3_LayoutConfig;

                await _deviceDb.UpdateDeviceAsync(existingDevice.Id, existingDevice);

                _logger.LogInformation($"[VirtualDevices API] Updated virtual device {id}");

                return Ok(existingDevice);
            }
            catch (Exception ex)
            {
                _logger.LogError($"[VirtualDevices API] Error updating virtual device {id}: {ex.Message}");
                return StatusCode(500, new { error = "Failed to update virtual device", message = ex.Message });
            }
        }

        /// <summary>
        /// DELETE /api/virtualdevices/{id} - Delete virtual device
        /// </summary>
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteVirtualDevice(int id)
        {
            try
            {
                var device = await _deviceDb.GetDeviceByIdAsync(id);

                if (device == null || !device.IsVirtualDevice)
                {
                    return NotFound(new { error = "Virtual device not found" });
                }

                // Delete linked collector if exists
                if (device.LinkedCollectorId.HasValue)
                {
                    await _collectorDb.DeleteCollectorAsync(device.LinkedCollectorId.Value);
                }

                // Delete device
                await _deviceDb.DeleteDeviceAsync(id);

                _logger.LogInformation($"[VirtualDevices API] Deleted virtual device {id}");

                return Ok(new { message = "Virtual device deleted successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError($"[VirtualDevices API] Error deleting virtual device {id}: {ex.Message}");
                return StatusCode(500, new { error = "Failed to delete virtual device", message = ex.Message });
            }
        }

        /// <summary>
        /// POST /api/virtualdevices/{id}/test-connection - Test connection to virtual device
        /// </summary>
        [HttpPost("{id}/test-connection")]
        public async Task<IActionResult> TestConnection(int id)
        {
            try
            {
                var device = await _deviceDb.GetDeviceByIdAsync(id);

                if (device == null || !device.IsVirtualDevice)
                {
                    return NotFound(new { error = "Virtual device not found" });
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
                _logger.LogError($"[VirtualDevices API] Error testing connection for device {id}: {ex.Message}");
                return StatusCode(500, new { error = "Failed to test connection", message = ex.Message });
            }
        }

        /// <summary>
        /// POST /api/virtualdevices/{id}/toggle-mode1 - Toggle Mode 1 (Collector)
        /// </summary>
        [HttpPost("{id}/toggle-mode1")]
        public async Task<IActionResult> ToggleMode1(int id)
        {
            try
            {
                var device = await _deviceDb.GetDeviceByIdAsync(id);

                if (device == null || !device.IsVirtualDevice)
                {
                    return NotFound(new { error = "Virtual device not found" });
                }

                // Toggle Mode 1
                device.VirtualDevice_Mode1_Enabled = !device.VirtualDevice_Mode1_Enabled;

                if (device.VirtualDevice_Mode1_Enabled)
                {
                    await EnableMode1Async(device);
                }
                else
                {
                    await DisableMode1Async(device);
                }

                await _deviceDb.UpdateDeviceAsync(device.Id, device);

                return Ok(new
                {
                    mode1_enabled = device.VirtualDevice_Mode1_Enabled,
                    linked_collector_id = device.LinkedCollectorId
                });
            }
            catch (Exception ex)
            {
                _logger.LogError($"[VirtualDevices API] Error toggling Mode 1 for device {id}: {ex.Message}");
                return StatusCode(500, new { error = "Failed to toggle Mode 1", message = ex.Message });
            }
        }

        /// <summary>
        /// POST /api/virtualdevices/{id}/toggle-mode2 - Toggle Mode 2 (Display)
        /// </summary>
        [HttpPost("{id}/toggle-mode2")]
        public async Task<IActionResult> ToggleMode2(int id)
        {
            try
            {
                var device = await _deviceDb.GetDeviceByIdAsync(id);

                if (device == null || !device.IsVirtualDevice)
                {
                    return NotFound(new { error = "Virtual device not found" });
                }

                // Toggle Mode 2
                device.VirtualDevice_Mode2_Enabled = !device.VirtualDevice_Mode2_Enabled;

                await _deviceDb.UpdateDeviceAsync(device.Id, device);

                return Ok(new { mode2_enabled = device.VirtualDevice_Mode2_Enabled });
            }
            catch (Exception ex)
            {
                _logger.LogError($"[VirtualDevices API] Error toggling Mode 2 for device {id}: {ex.Message}");
                return StatusCode(500, new { error = "Failed to toggle Mode 2", message = ex.Message });
            }
        }

        /// <summary>
        /// POST /api/virtualdevices/{id}/toggle-mode3 - Toggle Mode 3 (Self-Monitor)
        /// </summary>
        [HttpPost("{id}/toggle-mode3")]
        public async Task<IActionResult> ToggleMode3(int id)
        {
            try
            {
                var device = await _deviceDb.GetDeviceByIdAsync(id);

                if (device == null || !device.IsVirtualDevice)
                {
                    return NotFound(new { error = "Virtual device not found" });
                }

                // Toggle Mode 3
                device.VirtualDevice_Mode3_Enabled = !device.VirtualDevice_Mode3_Enabled;

                await _deviceDb.UpdateDeviceAsync(device.Id, device);

                return Ok(new { mode3_enabled = device.VirtualDevice_Mode3_Enabled });
            }
            catch (Exception ex)
            {
                _logger.LogError($"[VirtualDevices API] Error toggling Mode 3 for device {id}: {ex.Message}");
                return StatusCode(500, new { error = "Failed to toggle Mode 3", message = ex.Message });
            }
        }

        // Private helper methods

        /// <summary>
        /// Enable Mode 1 - Create linked collector
        /// </summary>
        private async Task EnableMode1Async(Model_Device device)
        {
            var collectorName = $"{device.Name} (Metrics)";

            // Check if a collector with this name already exists and delete it
            var allCollectors = await _collectorDb.GetAllCollectorsAsync();
            var existingCollector = allCollectors.FirstOrDefault(c => c.Name == collectorName);
            if (existingCollector != null)
            {
                _logger.LogWarning($"[VirtualDevices] Found existing collector '{collectorName}' (ID: {existingCollector.Id}), deleting it before creating new one");
                await _collectorDb.DeleteCollectorAsync(existingCollector.Id);
            }

            // Create linked collector
            var collector = new Model_Collector
            {
                Name = collectorName,
                CollectorType = "VirtualDevice",
                Status = "Active",
                URL = $"virtualdevice://{device.Id}",
                PollRate = device.VirtualDevice_Mode1_PollRate ?? 5000,
                Description = $"Auto-created collector for virtual device: {device.Name}"
            };

            var createdCollector = await _collectorDb.AddCollectorAsync(collector);
            device.LinkedCollectorId = createdCollector.Id;

            _logger.LogInformation($"[VirtualDevices] Created linked collector {createdCollector.Id} for device {device.Id}");
        }

        /// <summary>
        /// Disable Mode 1 - Delete linked collector
        /// </summary>
        private async Task DisableMode1Async(Model_Device device)
        {
            if (device.LinkedCollectorId.HasValue)
            {
                await _collectorDb.DeleteCollectorAsync(device.LinkedCollectorId.Value);
                _logger.LogInformation($"[VirtualDevices] Deleted linked collector {device.LinkedCollectorId.Value} for device {device.Id}");
                device.LinkedCollectorId = null;
            }
        }
    }
}
