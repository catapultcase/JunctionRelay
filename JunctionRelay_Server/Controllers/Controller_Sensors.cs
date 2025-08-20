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
using JunctionRelayServer.Services;
using JunctionRelayServer.Models;
using JunctionRelayServer.Models.Requests;

namespace JunctionRelayServer.Controllers
{
    [Route("api/sensors")]  // Define a general route for sensors
    [ApiController]
    public class Controller_Sensors : ControllerBase
    {
        private readonly Service_Database_Manager_Sensors _sensorDb;
        private readonly Service_Manager_Sensors _sensorManager;

        public Controller_Sensors(Service_Database_Manager_Sensors sensorDb, Service_Manager_Sensors sensorManager)
        {
            _sensorDb = sensorDb;
            _sensorManager = sensorManager;
        }

        // Get all sensors for a specific device
        [HttpGet("devices/{deviceId}")]
        public async Task<IActionResult> GetSensorsByDevice(int deviceId)
        {
            try
            {
                var sensors = await _sensorDb.GetSensorsByDeviceIdAsync(deviceId);
                return Ok(sensors);
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        // Get all sensors for a specific collector
        [HttpGet("collectors/{collectorId}")]
        public async Task<IActionResult> GetSensorsByCollector(int collectorId)
        {
            try
            {
                var sensors = await _sensorDb.GetSensorsByCollectorIdAsync(collectorId);
                return Ok(sensors);
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        // Add a new sensor to a device
        [HttpPost("devices/{deviceId}")]
        public async Task<IActionResult> AddSensorToDevice(int deviceId, [FromBody] Model_Sensor newSensor)
        {
            try
            {
                // Ensure the sensor has a valid DeviceId
                if (newSensor == null || string.IsNullOrEmpty(newSensor.Name) || string.IsNullOrEmpty(newSensor.SensorType))
                {
                    return BadRequest("Invalid sensor data.");
                }

                // Add the sensor to the device via the service
                var addedSensor = await _sensorManager.AddSensorToDeviceAsync(deviceId, newSensor);

                return CreatedAtAction(nameof(GetSensorsByDevice), new { deviceId = deviceId }, addedSensor);
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        // Add a new sensor to a collector
        [HttpPost("collectors/{collectorId}")]
        public async Task<IActionResult> AddSensorToCollector(int collectorId, [FromBody] Model_Sensor newSensor)
        {
            try
            {
                // Ensure the sensor has a valid CollectorId
                if (newSensor == null || string.IsNullOrEmpty(newSensor.Name) || string.IsNullOrEmpty(newSensor.SensorType))
                {
                    return BadRequest("Invalid sensor data.");
                }

                // Add the sensor to the collector via the service
                var addedSensor = await _sensorManager.AddSensorToCollectorAsync(collectorId, newSensor);

                return CreatedAtAction(nameof(GetSensorsByCollector), new { collectorId = collectorId }, addedSensor);
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        // DELETE api/sensors/{sensorId}
        [HttpDelete("{sensorId}")]
        public async Task<IActionResult> DeleteSensor(int sensorId)
        {
            try
            {
                var success = await _sensorDb.DeleteSensorAsync(sensorId);
                if (!success) return NotFound(new { message = "Sensor not found." });
                return NoContent();
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        // Update a sensor for a device
        [HttpPut("devices/{deviceId}/{sensorId}")]
        public async Task<IActionResult> UpdateSensorForDevice(int deviceId, int sensorId, [FromBody] Model_Sensor updatedSensor)
        {
            try
            {
                var success = await _sensorDb.UpdateSensorAsync(sensorId, updatedSensor);
                return success ? Ok(new { message = "Sensor updated successfully." }) : NotFound();
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        // Update a sensor for a collector
        [HttpPut("collectors/{collectorId}/{sensorId}")]
        public async Task<IActionResult> UpdateSensorForCollector(int collectorId, int sensorId, [FromBody] Model_Sensor updatedSensor)
        {
            try
            {
                var success = await _sensorDb.UpdateSensorAsync(sensorId, updatedSensor);
                return success ? Ok(new { message = "Sensor updated successfully." }) : NotFound();
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        [HttpPut("junction-sensors/update")]
        public async Task<IActionResult> UpdateJunctionSensor([FromBody] Model_Sensor updatedSensor)
        {
            var success = await _sensorDb.UpdateJunctionSensorAsync(updatedSensor);
            return success ? Ok(new { message = "Junction sensor updated successfully." }) : NotFound();
        }

        [HttpPut("junction-sensors/{sensorId}/device-select")]
        public async Task<IActionResult> UpdateJunctionSensorForDevice(int sensorId, [FromBody] bool isSelected)
        {
            var success = await _sensorDb.UpdateJunctionSensorForDeviceAsync(sensorId, isSelected);
            return success ? Ok(new { message = "Junction device sensor selection updated." }) : NotFound();
        }

        [HttpPut("junction-sensors/{sensorId}/collector-select")]
        public async Task<IActionResult> UpdateJunctionSensorForCollector(int sensorId, [FromBody] bool isSelected)
        {
            var success = await _sensorDb.UpdateJunctionSensorForCollectorAsync(sensorId, isSelected);
            return success ? Ok(new { message = "Junction collector sensor selection updated." }) : NotFound();
        }

        // Updated methods with JunctionId

        [HttpPost("junction-sensors/{junctionId}/{sensorId}/assign-target")]
        public async Task<IActionResult> AssignSensorTarget(int junctionId, int sensorId, [FromBody] Model_JunctionSensorTarget target)
        {
            if (target.DeviceId <= 0)
                return BadRequest("DeviceId is required.");

            await _sensorDb.AddJunctionSensorTargetAsync(
                junctionId,
                sensorId,
                target.DeviceId,
                target.ScreenId
            );

            return Ok(new { message = "Sensor target assigned." });
        }

        [HttpDelete("junction-sensors/{junctionId}/{sensorId}/remove-target/{deviceId}")]
        public async Task<IActionResult> RemoveSensorTarget(int junctionId, int sensorId, int deviceId)
        {
            await _sensorDb.RemoveJunctionSensorTargetAsync(junctionId, sensorId, deviceId);
            return Ok(new { message = "Sensor target removed." });
        }

        [HttpGet("junction-sensors/by-junction/{junctionId}/targets-grouped")]
        public async Task<IActionResult> GetSensorTargetsGroupedForJunction(int junctionId)
        {
            var results = await _sensorDb.GetAllSensorTargetsForJunctionGroupedAsync(junctionId);
            return Ok(results);
        }

        [HttpPost("junction-sensors/{junctionId}/{sensorId}/assign-screen")]
        public async Task<IActionResult> AssignScreenToSensorTarget(int junctionId, int sensorId, [FromBody] Model_Assign_Screen_Request request)
        {
            if (request.DeviceId <= 0 || request.ScreenId <= 0)
                return BadRequest("DeviceId and ScreenId are required.");

            await _sensorDb.AddScreenToJunctionSensorTargetAsync(junctionId, sensorId, request.DeviceId, request.ScreenId);
            return Ok(new { message = "Screen assigned to sensor target." });
        }

        [HttpDelete("junction-sensors/{junctionId}/{sensorId}/remove-screen")]
        public async Task<IActionResult> RemoveScreenFromSensorTarget(int junctionId, int sensorId, [FromBody] Model_Remove_Screen_Request request)
        {
            if (request.DeviceId <= 0 || request.ScreenId <= 0)
                return BadRequest("DeviceId and ScreenId are required.");

            await _sensorDb.RemoveScreenFromJunctionSensorTargetAsync(junctionId, sensorId, request.DeviceId, request.ScreenId);
            return Ok(new { message = "Screen removed from sensor target." });
        }

        [HttpDelete("junction-sensors/{junctionId}/{sensorId}/remove-all-targets")]
        public async Task<IActionResult> RemoveAllSensorTargets(int junctionId, int sensorId)
        {
            await _sensorDb.RemoveAllSensorTargetsAsync(junctionId, sensorId);
            return Ok(new { message = "All sensor targets removed." });
        }

        [HttpGet("junction-sensors/by-junction/{junctionId}/targets")]
        public async Task<IActionResult> GetSensorTargetsForJunction(int junctionId)
        {
            var targets = await _sensorDb.GetAllSensorTargetsForJunctionAsync(junctionId);
            return Ok(targets);
        }
    }
}