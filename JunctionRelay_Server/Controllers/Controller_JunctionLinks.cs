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
using JunctionRelayServer.Models.Requests;
using JunctionRelayServer.Services;
using Microsoft.AspNetCore.Mvc;

namespace JunctionRelayServer.Controllers
{
    [Route("api/junctions/{junctionId}/links")]
    [ApiController]
    public class Controller_JunctionLinks : ControllerBase
    {
        private readonly Service_Database_Manager_JunctionLinks _linkDb;
        private readonly Service_Database_Manager_Devices _deviceDbManager;
        private readonly Service_Database_Manager_Collectors _collectorDbManager;
        private readonly Service_Database_Manager_Sensors _sensorsDbManager;
        private readonly Service_Manager_Sensors _sensorManager;

        public Controller_JunctionLinks(Service_Database_Manager_JunctionLinks linkDb,
                                        Service_Database_Manager_Devices deviceDbManager,
                                        Service_Database_Manager_Collectors collectorDbManager,
                                        Service_Database_Manager_Sensors sensorsDbManager,
                                        Service_Manager_Sensors sensorManager)

        {
            _linkDb = linkDb;
            _deviceDbManager = deviceDbManager;
            _collectorDbManager = collectorDbManager;
            _sensorsDbManager = sensorsDbManager;
            _sensorManager = sensorManager;
        }

        // GET: api/junctions/{junctionId}/links
        [HttpGet]
        public async Task<IActionResult> GetLinksForJunction(int junctionId)
        {
            var deviceLinks = await _linkDb.GetDeviceLinksByJunctionAsync(junctionId);
            var collectorLinks = await _linkDb.GetCollectorLinksByJunctionAsync(junctionId);

            if (!deviceLinks.Any() && !collectorLinks.Any())
            {
                return NotFound($"No links found for junction with ID {junctionId}.");
            }

            var allDevices = await _deviceDbManager.GetAllDevicesAsync();
            var allCollectors = await _collectorDbManager.GetAllCollectorsAsync();

            // Populate device name, description, status, and PollRateOverride
            foreach (var link in deviceLinks)
            {
                var device = allDevices.FirstOrDefault(d => d.Id == link.DeviceId);
                if (device != null)
                {
                    link.DeviceName = device.Name;
                    link.DeviceDescription = device.Description;
                    link.DeviceStatus = device.Status; // ADD THIS LINE
                }
            }

            // Populate collector name, description, status, and PollRateOverride
            foreach (var link in collectorLinks)
            {
                var collector = allCollectors.FirstOrDefault(c => c.Id == link.CollectorId);
                if (collector != null)
                {
                    link.CollectorName = collector.Name;
                    link.CollectorDescription = collector.Description;
                    link.CollectorStatus = collector.Status; // ADD THIS LINE
                }
            }

            var devices = await _deviceDbManager.GetDevicesByJunctionIdAsync(junctionId);
            var collectors = await _collectorDbManager.GetCollectorsByJunctionIdAsync(junctionId);

            var availableSources = new
            {
                Devices = devices,
                Collectors = collectors
            };

            var allLinks = new
            {
                DeviceLinks = deviceLinks,
                CollectorLinks = collectorLinks,
                AvailableSources = availableSources
            };

            return Ok(allLinks);
        }


        // POST: api/junctions/{junctionId}/links/device-links
        [HttpPost("device-links")]
        public async Task<IActionResult> AddDeviceLink(int junctionId, [FromBody] Model_JunctionDeviceLink newLink)
        {
            if (newLink == null || !ModelState.IsValid)
            {
                return BadRequest("Invalid link data.");
            }

            newLink.JunctionId = junctionId;
            var addedLink = await _linkDb.AddDeviceLinkAsync(newLink);

            if (addedLink == null)
            {
                return StatusCode(500, "A problem occurred while saving the device link.");
            }

            return CreatedAtAction(nameof(GetLinksForJunction), new { junctionId }, addedLink);
        }

        // POST: api/junctions/{junctionId}/links/collector-links
        [HttpPost("collector-links")]
        public async Task<IActionResult> AddCollectorLink(int junctionId, [FromBody] Model_JunctionCollectorLink newLink)
        {
            if (newLink == null || !ModelState.IsValid)
            {
                return BadRequest("Invalid link data.");
            }

            newLink.JunctionId = junctionId;
            var addedLink = await _linkDb.AddCollectorLinkAsync(newLink);

            if (addedLink == null)
            {
                return StatusCode(500, "A problem occurred while saving the collector link.");
            }

            return CreatedAtAction(nameof(GetLinksForJunction), new { junctionId }, addedLink);
        }

        // DELETE: api/junctions/{junctionId}/links/device-links/{linkId}
        [HttpDelete("device-links/{linkId}")]
        public async Task<IActionResult> RemoveDeviceLink(int junctionId, int linkId)
        {
            var link = await _linkDb.GetDeviceLinkByIdAsync(linkId); // Get the link by ID

            if (link == null || link.JunctionId != junctionId)
            {
                return NotFound($"Device link with ID {linkId} not found for junction {junctionId}.");
            }

            try
            {
                // 1. Remove all JunctionSensorTargets for this device in this junction
                await RemoveAssociatedSensorTargets(junctionId, link.DeviceId);

                // 2. Remove all JunctionScreenLayouts for this device link
                await RemoveAssociatedScreenLayouts(linkId);

                // 3. Remove associated JunctionSensors
                await RemoveAssociatedJunctionSensors(junctionId, link.Id, true);  // true for device

                // 4. Finally, remove the device link itself
                var success = await _linkDb.RemoveDeviceLinkAsync(junctionId, link.DeviceId);

                if (!success)
                {
                    return StatusCode(500, "An error occurred while deleting the device link.");
                }

                return NoContent(); // Return no content if the operation is successful
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error removing device link: {ex.Message}");
                return StatusCode(500, $"An error occurred while deleting the device link: {ex.Message}");
            }
        }

        // Helper method to remove associated JunctionSensorTargets for a device
        private async Task RemoveAssociatedSensorTargets(int junctionId, int deviceId)
        {
            // SQL query to delete from JunctionSensorTargets will be handled by the sensors manager
            await _sensorsDbManager.RemoveSensorTargetsByDeviceAsync(junctionId, deviceId);
            Console.WriteLine($"✅ Removed associated sensor targets for device with ID {deviceId} in junction {junctionId}.");
        }

        // Helper method to remove associated JunctionScreenLayouts for a device link
        private async Task RemoveAssociatedScreenLayouts(int linkId)
        {
            // SQL query to delete from JunctionScreenLayouts will be handled by the links manager
            await _linkDb.RemoveScreenLayoutsByLinkIdAsync(linkId);
            Console.WriteLine($"✅ Removed associated screen layouts for device link with ID {linkId}.");
        }

        // DELETE: api/junctions/{junctionId}/links/collector-links/{linkId}
        [HttpDelete("collector-links/{linkId}")]
        public async Task<IActionResult> RemoveCollectorLink(int junctionId, int linkId)
        {
            var link = await _linkDb.GetCollectorLinkByIdAsync(linkId); // Get the link by ID
            if (link == null || link.JunctionId != junctionId)
            {
                return NotFound($"Collector link with ID {linkId} not found for junction {junctionId}.");
            }

            try
            {
                // 1. First get all junction sensors associated with this collector link
                var collectorSensors = await _sensorsDbManager.GetJunctionSensorsByJunctionCollectorLinkIdAsync(junctionId, link.Id);

                // 2. For each sensor, remove any sensor targets
                foreach (var sensor in collectorSensors)
                {
                    await _sensorsDbManager.RemoveAllSensorTargetsAsync(junctionId, sensor.Id);
                }

                // 3. Remove associated JunctionSensors when a collector link is removed
                await RemoveAssociatedJunctionSensors(junctionId, link.Id, false);  // false for collector

                // 4. Finally, remove the collector link itself
                var success = await _linkDb.RemoveCollectorLinkAsync(junctionId, link.CollectorId);

                if (!success)
                {
                    return StatusCode(500, "An error occurred while deleting the collector link.");
                }

                return NoContent(); // Return no content if the operation is successful
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error removing collector link: {ex.Message}");
                return StatusCode(500, $"An error occurred while deleting the collector link: {ex.Message}");
            }
        }


        // Helper method to remove associated JunctionSensors for the source (device or collector)
        private async Task RemoveAssociatedJunctionSensors(int junctionId, int sourceId, bool isDevice)
        {
            // Remove all sensors linked to this source (device or collector) from JunctionSensors
            await _sensorsDbManager.RemoveJunctionSensorsBySourceIdAsync(junctionId, sourceId, isDevice);
            // Console.WriteLine($"✅ Removed associated sensors for source with ID {sourceId} in junction {junctionId}. IsDevice: {isDevice}");
        }



        // GET: api/junctions/{junctionId}/links/available-sensors
        [HttpGet("available-sensors")]
        public async Task<IActionResult> GetAvailableSensors(int junctionId)
        {
            try
            {
                var deviceLinks = await _linkDb.GetDeviceLinksByJunctionAsync(junctionId);
                var collectorLinks = await _linkDb.GetCollectorLinksByJunctionAsync(junctionId);

                var allDevices = await _deviceDbManager.GetAllDevicesAsync();
                var allCollectors = await _collectorDbManager.GetAllCollectorsAsync();

                var availableSensors = new List<Model_Sensor>();

                // Fetch sensors for devices linked to the junction
                foreach (var link in deviceLinks)
                {
                    var deviceSensors = await _sensorsDbManager.GetSensorsByDeviceIdAsync(link.DeviceId);
                    availableSensors.AddRange(deviceSensors);
                }

                // Fetch sensors for collectors linked to the junction
                foreach (var link in collectorLinks)
                {
                    var collectorSensors = await _sensorsDbManager.GetSensorsByCollectorIdAsync(link.CollectorId);
                    availableSensors.AddRange(collectorSensors);
                }

                // Call the service to clone the sensors into the JunctionSensors table for this junction
                await _sensorManager.CloneSensorsForJunctionAsync(junctionId, availableSensors);

                // Return the cloned sensors from JunctionSensors table
                var junctionSensors = await _sensorsDbManager.GetJunctionSensorsByJunctionIdAsync(junctionId);
                return Ok(junctionSensors);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error occurred: {ex.Message}");
                return StatusCode(500, ex.Message);
            }
        }


        // PUT: /api/junctions/{junctionId}/links/device-links/{linkId}/update
        [HttpPut("device-links/{linkId}/update")]
        public async Task<IActionResult> UpdateDeviceLinkUpdate(int junctionId, int linkId, [FromBody] Model_JunctionLinkUpdateRequest updateRequest)
        {
            var link = await _linkDb.GetDeviceLinkByIdAsync(linkId);
            if (link == null || link.JunctionId != junctionId)
            {
                return NotFound($"Device link with ID {linkId} not found for junction {junctionId}.");
            }

            // Loop through each field that needs to be updated, as specified in FieldsToInclude
            foreach (var field in updateRequest.FieldsToInclude)
            {
                // Use reflection to find the property in the Model and update it if it exists
                var propertyInfo = typeof(Model_JunctionDeviceLink).GetProperty(field);
                if (propertyInfo != null && propertyInfo.CanWrite)
                {
                    var value = updateRequest.GetType().GetProperty(field)?.GetValue(updateRequest, null);
                    if (value != null)
                    {
                        propertyInfo.SetValue(link, value);
                    }
                }
            }

            var success = await _linkDb.UpdateJunctionLinkFieldsAsync(linkId, updateRequest, isDeviceLink: true);
            if (!success)
            {
                return StatusCode(500, "An error occurred while updating the device link fields.");
            }

            return Ok(new { message = "Device link fields updated successfully." });
        }

        // PUT: api/junctions/{junctionId}/links/collector-links/{linkId}/update
        [HttpPut("collector-links/{linkId}/update")]
        public async Task<IActionResult> UpdateCollectorLinkUpdate(int junctionId, int linkId, [FromBody] Model_JunctionLinkUpdateRequest updateRequest)
        {
            var link = await _linkDb.GetCollectorLinkByIdAsync(linkId);
            if (link == null || link.JunctionId != junctionId)
            {
                return NotFound($"Collector link with ID {linkId} not found for junction {junctionId}.");
            }

            // Loop through each field that needs to be updated, as specified in FieldsToInclude
            foreach (var field in updateRequest.FieldsToInclude)
            {
                // Use reflection to find the property in the Model and update it if it exists
                var propertyInfo = typeof(Model_JunctionCollectorLink).GetProperty(field); // Use correct class here
                if (propertyInfo != null && propertyInfo.CanWrite)
                {
                    var value = updateRequest.GetType().GetProperty(field)?.GetValue(updateRequest, null);
                    if (value != null)
                    {
                        propertyInfo.SetValue(link, value);
                    }
                }
            }

            var success = await _linkDb.UpdateJunctionLinkFieldsAsync(linkId, updateRequest, isDeviceLink: false);
            if (!success)
            {
                return StatusCode(500, "An error occurred while updating the collector link fields.");
            }

            return Ok(new { message = "Collector link fields updated successfully." });
        }

        // Modified GetDeviceScreenLayouts method
        [HttpGet("device-links/{linkId}/screen-layouts")]
        public async Task<IActionResult> GetDeviceScreenLayouts(int junctionId, int linkId)
        {
            // First verify the link exists and belongs to this junction
            var link = await _linkDb.GetDeviceLinkByIdAsync(linkId);
            if (link == null || link.JunctionId != junctionId)
            {
                return NotFound($"Device link with ID {linkId} not found for junction {junctionId}.");
            }

            // Get the device details
            var device = await _deviceDbManager.GetDeviceByIdAsync(link.DeviceId);
            if (device == null)
            {
                return NotFound($"Device with ID {link.DeviceId} not found.");
            }

            // Get the device's screens explicitly
            var deviceScreens = await _deviceDbManager.GetDeviceScreensAsync(link.DeviceId);

            // Get any existing screen layout overrides for this link
            var screenLayouts = await _linkDb.GetJunctionScreenLayoutsByLinkIdAsync(linkId);

            // Create a response that includes both the device's screens and any overrides
            var response = new
            {
                DeviceScreens = deviceScreens,
                ScreenLayoutOverrides = screenLayouts
            };

            return Ok(response);
        }

        // POST: api/junctions/{junctionId}/links/device-links/{linkId}/screen-layouts
        [HttpPost("device-links/{linkId}/screen-layouts")]
        public async Task<IActionResult> AddScreenLayoutOverride(int junctionId, int linkId, [FromBody] Model_JunctionScreenLayout newScreenLayout)
        {
            if (newScreenLayout == null || !ModelState.IsValid)
            {
                return BadRequest("Invalid screen layout data.");
            }

            // First verify the link exists and belongs to this junction
            var link = await _linkDb.GetDeviceLinkByIdAsync(linkId);
            if (link == null || link.JunctionId != junctionId)
            {
                return NotFound($"Device link with ID {linkId} not found for junction {junctionId}.");
            }

            // Set the JunctionDeviceLinkId
            newScreenLayout.JunctionDeviceLinkId = linkId;

            // Add the screen layout override
            var addedScreenLayout = await _linkDb.AddJunctionScreenLayoutAsync(newScreenLayout);
            if (addedScreenLayout == null)
            {
                return StatusCode(500, "A problem occurred while saving the screen layout override.");
            }

            return CreatedAtAction(nameof(GetDeviceScreenLayouts), new { junctionId, linkId }, addedScreenLayout);
        }

        // PUT: api/junctions/{junctionId}/links/device-links/{linkId}/screen-layouts/{screenLayoutId}
        [HttpPut("device-links/{linkId}/screen-layouts/{screenLayoutId}")]
        public async Task<IActionResult> UpdateScreenLayoutOverride(int junctionId, int linkId, int screenLayoutId, [FromBody] Model_JunctionScreenLayout updatedScreenLayout)
        {
            if (updatedScreenLayout == null || !ModelState.IsValid)
            {
                return BadRequest("Invalid screen layout data.");
            }

            // First verify the link exists and belongs to this junction
            var link = await _linkDb.GetDeviceLinkByIdAsync(linkId);
            if (link == null || link.JunctionId != junctionId)
            {
                return NotFound($"Device link with ID {linkId} not found for junction {junctionId}.");
            }

            // Verify the screen layout exists and belongs to this link
            var existingScreenLayout = await _linkDb.GetJunctionScreenLayoutByIdAsync(screenLayoutId);
            if (existingScreenLayout == null || existingScreenLayout.JunctionDeviceLinkId != linkId)
            {
                return NotFound($"Screen layout with ID {screenLayoutId} not found for device link {linkId}.");
            }

            // Update the screen layout override
            updatedScreenLayout.Id = screenLayoutId;
            updatedScreenLayout.JunctionDeviceLinkId = linkId;
            var success = await _linkDb.UpdateJunctionScreenLayoutAsync(updatedScreenLayout);
            if (!success)
            {
                return StatusCode(500, "An error occurred while updating the screen layout override.");
            }

            return Ok(updatedScreenLayout);
        }

        // DELETE: api/junctions/{junctionId}/links/device-links/{linkId}/screen-layouts/{screenLayoutId}
        [HttpDelete("device-links/{linkId}/screen-layouts/{screenLayoutId}")]
        public async Task<IActionResult> RemoveScreenLayoutOverride(int junctionId, int linkId, int screenLayoutId)
        {
            // First verify the link exists and belongs to this junction
            var link = await _linkDb.GetDeviceLinkByIdAsync(linkId);
            if (link == null || link.JunctionId != junctionId)
            {
                return NotFound($"Device link with ID {linkId} not found for junction {junctionId}.");
            }

            // Verify the screen layout exists and belongs to this link
            var screenLayout = await _linkDb.GetJunctionScreenLayoutByIdAsync(screenLayoutId);
            if (screenLayout == null || screenLayout.JunctionDeviceLinkId != linkId)
            {
                return NotFound($"Screen layout with ID {screenLayoutId} not found for device link {linkId}.");
            }

            var success = await _linkDb.RemoveJunctionScreenLayoutAsync(screenLayoutId);
            if (!success)
            {
                return StatusCode(500, "An error occurred while deleting the screen layout override.");
            }

            return NoContent();
        }
    }
}
