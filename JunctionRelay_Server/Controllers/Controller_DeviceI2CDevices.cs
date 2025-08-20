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
    [Route("api/devices/{deviceId}/i2c-devices")]
    [ApiController]
    public class Controller_DeviceI2CDevices : ControllerBase
    {
        private readonly Service_Database_Manager_Device_I2CDevices _i2cDeviceDb;
        private readonly ILogger<Controller_DeviceI2CDevices> _logger;

        public Controller_DeviceI2CDevices(Service_Database_Manager_Device_I2CDevices i2cDeviceDb, ILogger<Controller_DeviceI2CDevices> logger)
        {
            _i2cDeviceDb = i2cDeviceDb;
            _logger = logger;
        }

        // Get all I2C devices for a Device
        [HttpGet]
        public async Task<IActionResult> GetAllI2CDevices(int deviceId)
        {
            try
            {
                var devices = await _i2cDeviceDb.GetI2CDevicesForDeviceAsync(deviceId);

                // Fetch and add endpoints for each I2C device
                foreach (var device in devices)
                {
                    device.Endpoints = await _i2cDeviceDb.GetEndpointsForI2CDeviceAsync(device.Id);
                }

                return Ok(devices);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching I2C devices for deviceId {deviceId}.", deviceId);
                return StatusCode(500, $"Error fetching I2C devices: {ex.Message}");
            }
        }


        // Get a specific I2C device by ID
        [HttpGet("{i2cDeviceId}", Name = "GetI2CDeviceById")]
        public async Task<IActionResult> GetI2CDeviceById(int i2cDeviceId)
        {
            try
            {
                var device = await _i2cDeviceDb.GetI2CDeviceByIdAsync(i2cDeviceId);
                if (device == null)
                {
                    return NotFound($"I2C device with ID {i2cDeviceId} not found.");
                }
                return Ok(device);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching I2C device with ID {i2cDeviceId}.", i2cDeviceId);
                return StatusCode(500, $"Error fetching I2C device: {ex.Message}");
            }
        }

        // Add a new I2C device to a device
        [HttpPost]
        public async Task<IActionResult> AddI2CDevice(int deviceId, [FromBody] Model_Device_I2CDevice newDevice)
        {
            newDevice.DeviceId = deviceId;  // Set the deviceId to associate with the correct device

            try
            {
                // Add the new I2C device and get the added device object
                var added = await _i2cDeviceDb.AddI2CDeviceAsync(newDevice);

                // Return the created device object directly with a 201 status code
                return Created("", added);  // 201 Created with the new device in the body
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error adding I2C device: {ex.Message}");
            }
        }


        // Update an existing I2C device
        [HttpPut("{i2cDeviceId}")]
        public async Task<IActionResult> UpdateI2CDevice(int deviceId, int i2cDeviceId, [FromBody] Model_Device_I2CDevice updatedDevice)
        {
            try
            {
                var existing = await _i2cDeviceDb.GetI2CDeviceByIdAsync(i2cDeviceId);
                if (existing == null || existing.DeviceId != deviceId)
                    return NotFound($"I2C device with ID {i2cDeviceId} not found for deviceId {deviceId}.");

                var success = await _i2cDeviceDb.UpdateI2CDeviceAsync(i2cDeviceId, updatedDevice);
                return success ? Ok(new { message = "I2C Device updated successfully." }) : StatusCode(500, "Update failed.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating I2C device with ID {i2cDeviceId} for deviceId {deviceId}.", i2cDeviceId, deviceId);
                return StatusCode(500, $"Error updating I2C device: {ex.Message}");
            }
        }

        // Delete an I2C device
        [HttpDelete("{i2cDeviceId}")]
        public async Task<IActionResult> DeleteI2CDevice(int deviceId, int i2cDeviceId)
        {
            try
            {
                var existing = await _i2cDeviceDb.GetI2CDeviceByIdAsync(i2cDeviceId);
                if (existing == null || existing.DeviceId != deviceId)
                    return NotFound($"I2C device with ID {i2cDeviceId} not found for deviceId {deviceId}.");

                var success = await _i2cDeviceDb.DeleteI2CDeviceAsync(i2cDeviceId);
                return success ? Ok(new { message = "I2C Device deleted successfully." }) : StatusCode(500, "Deletion failed.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting I2C device with ID {i2cDeviceId} for deviceId {deviceId}.", i2cDeviceId, deviceId);
                return StatusCode(500, $"Error deleting I2C device: {ex.Message}");
            }
        }

        // Get all endpoints for a specific I2C device
        [HttpGet("{i2cDeviceId}/endpoints")]
        public async Task<IActionResult> GetI2CDeviceEndpoints(int i2cDeviceId)
        {
            try
            {
                var endpoints = await _i2cDeviceDb.GetEndpointsForI2CDeviceAsync(i2cDeviceId);
                return Ok(endpoints);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching endpoints for I2C device with ID {i2cDeviceId}.", i2cDeviceId);
                return StatusCode(500, $"Error fetching endpoints: {ex.Message}");
            }
        }

        // Add an endpoint to the I2C device
        [HttpPost("{i2cDeviceId}/endpoints")]
        public async Task<IActionResult> AddI2CDeviceEndpoint(int i2cDeviceId, [FromBody] Model_Device_I2CDevice_Endpoint newEndpoint)
        {
            newEndpoint.I2CDeviceId = i2cDeviceId;

            try
            {
                var added = await _i2cDeviceDb.AddI2CEndpointAsync(newEndpoint);
                return Created("", added);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error adding endpoint to I2C device with ID {i2cDeviceId}.", i2cDeviceId);
                return StatusCode(500, $"Error adding endpoint: {ex.Message}");
            }
        }

        // Update an endpoint of an I2C device
        [HttpPut("{i2cDeviceId}/endpoints/{endpointId}")]
        public async Task<IActionResult> UpdateI2CDeviceEndpoint(int i2cDeviceId, int endpointId, [FromBody] Model_Device_I2CDevice_Endpoint updatedEndpoint)
        {
            try
            {
                var success = await _i2cDeviceDb.UpdateEndpointAsync(endpointId, updatedEndpoint);
                return success ? Ok(new { message = "Endpoint updated successfully." }) : StatusCode(500, "Endpoint update failed.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating endpoint {endpointId} for I2C device {i2cDeviceId}.", endpointId, i2cDeviceId);
                return StatusCode(500, $"Error updating endpoint: {ex.Message}");
            }
        }

        // Delete an endpoint for the I2C device
        [HttpDelete("{i2cDeviceId}/endpoints/{endpointId}")]
        public async Task<IActionResult> DeleteI2CDeviceEndpoint(int i2cDeviceId, int endpointId)
        {
            try
            {
                var success = await _i2cDeviceDb.DeleteEndpointAsync(endpointId);
                return success ? Ok(new { message = "Endpoint deleted successfully." }) : StatusCode(500, "Endpoint deletion failed.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting endpoint {endpointId} for I2C device {i2cDeviceId}.", endpointId, i2cDeviceId);
                return StatusCode(500, $"Error deleting endpoint: {ex.Message}");
            }
        }
    }
}
