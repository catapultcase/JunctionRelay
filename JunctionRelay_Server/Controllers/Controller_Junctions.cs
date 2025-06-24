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
using Newtonsoft.Json;

namespace JunctionRelayServer.Controllers
{
    [Route("api/junctions")]
    [ApiController]
    public class Controller_Junctions : ControllerBase
    {
        private readonly Service_Database_Manager_Junctions _junctionDb;
        private readonly Service_Database_Manager_Devices _deviceDb;
        private readonly Service_Database_Manager_Collectors _collectorDb;

        public Controller_Junctions(
            Service_Database_Manager_Junctions junctionDb,
            Service_Database_Manager_Devices deviceDb,
            Service_Database_Manager_Collectors collectorDb)
        {
            _junctionDb = junctionDb;
            _deviceDb = deviceDb;
            _collectorDb = collectorDb;
        }

        // GET: /api/junctions
        [HttpGet]
        public async Task<ActionResult<List<Model_Junction>>> GetAllJunctions()
        {
            var junctions = await _junctionDb.GetAllJunctionsAsync();
            var allDevices = await _deviceDb.GetAllDevicesAsync();
            var allCollectors = await _collectorDb.GetAllCollectorsAsync();

            foreach (var junction in junctions)
            {
                // Fetch and populate related DeviceLinks and CollectorLinks data
                foreach (var link in junction.DeviceLinks)
                {
                    var device = allDevices.FirstOrDefault(d => d.Id == link.DeviceId);
                    if (device != null)
                    {
                        link.DeviceName = device.Name;
                        link.DeviceDescription = device.Description;
                        link.DeviceStatus = device.Status;
                    }
                }

                foreach (var link in junction.CollectorLinks)
                {
                    var collector = allCollectors.FirstOrDefault(c => c.Id == link.CollectorId);
                    if (collector != null)
                    {
                        link.CollectorName = collector.Name;
                        link.CollectorDescription = collector.Description;
                        link.CollectorStatus = collector.Status;
                    }
                }
            }

            return Ok(junctions);
        }

        // GET: /api/junctions/{id}
        [HttpGet("{id}")]
        public async Task<ActionResult<Model_Junction>> GetJunctionById(int id)
        {
            var junction = await _junctionDb.GetJunctionByIdAsync(id);
            if (junction == null) return NotFound();

            var allDevices = await _deviceDb.GetAllDevicesAsync();
            var allCollectors = await _collectorDb.GetAllCollectorsAsync();

            // Fetch and populate related DeviceLinks and CollectorLinks data
            foreach (var link in junction.DeviceLinks)
            {
                var device = allDevices.FirstOrDefault(d => d.Id == link.DeviceId);
                if (device != null)
                {
                    link.DeviceName = device.Name;
                    link.DeviceDescription = device.Description;
                    link.DeviceStatus = device.Status;
                }
            }

            foreach (var link in junction.CollectorLinks)
            {
                var collector = allCollectors.FirstOrDefault(c => c.Id == link.CollectorId);
                if (collector != null)
                {
                    link.CollectorName = collector.Name;
                    link.CollectorDescription = collector.Description;
                    link.CollectorStatus = collector.Status;
                }
            }

            return Ok(junction);
        }

        [HttpPost]
        public async Task<ActionResult<Model_Junction>> CreateJunction([FromBody] Model_Junction newJunction)
        {
            var created = await _junctionDb.AddJunctionAsync(newJunction);
            return CreatedAtAction(nameof(GetJunctionById), new { id = created.Id }, created);
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateJunction(int id, [FromBody] Model_Junction updatedJunction)
        {
            var success = await _junctionDb.UpdateJunctionAsync(id, updatedJunction);
            if (!success) return NotFound();
            return Ok(new { message = "Junction updated successfully." });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteJunction(int id)
        {
            var success = await _junctionDb.DeleteJunctionAsync(id);
            if (!success) return NotFound();
            return Ok(new { message = "Junction deleted successfully." });
        }

        // POST: /api/junctions/{id}/clone
        [HttpPost("{id}/clone")]
        public async Task<ActionResult<Model_Junction>> CloneJunction(int id)
        {
            var cloned = await _junctionDb.CloneJunctionAsync(id);
            if (cloned == null)
                return NotFound(new { message = $"Junction with id {id} not found or could not be cloned." });

            var allDevices = await _deviceDb.GetAllDevicesAsync();
            var allCollectors = await _collectorDb.GetAllCollectorsAsync();

            foreach (var link in cloned.DeviceLinks)
            {
                var device = allDevices.FirstOrDefault(d => d.Id == link.DeviceId);
                if (device != null)
                {
                    link.DeviceName = device.Name;
                    link.DeviceDescription = device.Description;
                    link.DeviceStatus = device.Status;
                }
            }

            foreach (var link in cloned.CollectorLinks)
            {
                var collector = allCollectors.FirstOrDefault(c => c.Id == link.CollectorId);
                if (collector != null)
                {
                    link.CollectorName = collector.Name;
                    link.CollectorDescription = collector.Description;
                    link.CollectorStatus = collector.Status;
                }
            }

            return CreatedAtAction(nameof(GetJunctionById), new { id = cloned.Id }, cloned);
        }

        [HttpGet("export/{id}")]
        public async Task<IActionResult> ExportJunction(int id)
        {
            // Step 1: Get the junction and related data
            var junction = await _junctionDb.GetJunctionByIdAsync(id);
            if (junction == null)
            {
                return NotFound($"Junction with ID {id} not found.");
            }

            // Populate related data (DeviceLinks, CollectorLinks, Sensors, etc.)
            await _junctionDb.PopulateLinksAndSensors(junction);

            // Step 2: Serialize the junction and related data to JSON
            var jsonData = JsonConvert.SerializeObject(junction, Formatting.Indented);

            // Step 3: Return JSON content as a file to download
            var fileName = $"junction_{id}.json";
            var fileBytes = System.Text.Encoding.UTF8.GetBytes(jsonData);

            // Return file as download
            return File(fileBytes, "application/json", fileName);
        }

        [HttpPost("import")]
        public async Task<IActionResult> ImportJunction([FromBody] Model_Junction junctionData)
        {
            if (junctionData == null)
            {
                return BadRequest("Invalid data.");
            }

            try
            {
                // Call the service to handle the import
                var newJunction = await _junctionDb.ImportJunctionFromJsonAsync(junctionData);

                if (newJunction != null)
                {
                    return Ok(new { message = "Junction imported successfully.", newJunction });
                }
                else
                {
                    return StatusCode(500, "Failed to import junction.");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error importing junction: {ex.Message}");
                return StatusCode(500, "Internal server error.");
            }
        }
    }
}