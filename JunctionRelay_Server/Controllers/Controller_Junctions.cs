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
        private readonly Service_Manager_Connections _connectionManager;
        private readonly Service_Database_Manager_Layouts _layoutDb;
        private readonly Service_Database_Manager_FrameEngine _frameEngineDb;

        public Controller_Junctions(
            Service_Database_Manager_Junctions junctionDb,
            Service_Database_Manager_Devices deviceDb,
            Service_Database_Manager_Collectors collectorDb,
            Service_Manager_Connections connectionManager,
            Service_Database_Manager_Layouts layoutDb,
            Service_Database_Manager_FrameEngine frameEngineDb)
        {
            _junctionDb = junctionDb;
            _deviceDb = deviceDb;
            _collectorDb = collectorDb;
            _connectionManager = connectionManager;
            _layoutDb = layoutDb;
            _frameEngineDb = frameEngineDb;
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
                // Update with real-time status from connection manager
                junction.Status = _connectionManager.IsJunctionRunning(junction.Id) ? "Running" : "Idle";

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

        // GET: /api/junctions/summary
        [HttpGet("summary")]
        public async Task<ActionResult<List<JunctionSummaryDto>>> GetAllJunctionSummaries()
        {
            var junctions = await _junctionDb.GetAllJunctionsAsync();
            var allDevices = await _deviceDb.GetAllDevicesAsync();
            var allCollectors = await _collectorDb.GetAllCollectorsAsync();

            // Fetch all layouts once for efficient lookup
            var allScreenLayouts = (await _layoutDb.GetAllTemplatesAsync()).ToList();
            var allFrameLayouts = (await _frameEngineDb.GetAllFrameLayoutsAsync()).ToList();

            var summaries = junctions.Select(j => new JunctionSummaryDto
            {
                Id = j.Id,
                Name = j.Name,
                Description = j.Description,
                Type = j.Type,
                RenderingMode = j.RenderingMode,
                Status = _connectionManager.IsJunctionRunning(j.Id) ? "Running" : "Idle", // Real-time status
                ShowOnDashboard = j.ShowOnDashboard,
                AutoStartOnLaunch = j.AutoStartOnLaunch,
                AllTargetsAllData = j.AllTargetsAllData,
                SortOrder = j.SortOrder,
                GatewayDestination = j.GatewayDestination,
                GatewayDeviceId = j.GatewayDeviceId,
                DeviceLinks = j.DeviceLinks.Select(dl => new DeviceLinkSummaryDto
                {
                    DeviceId = dl.DeviceId,
                    Role = dl.Role,
                    DeviceName = allDevices.FirstOrDefault(d => d.Id == dl.DeviceId)?.Name,
                    DeviceStatus = allDevices.FirstOrDefault(d => d.Id == dl.DeviceId)?.Status,
                    ScreenLayouts = dl.ScreenLayouts.Select(sl => new ScreenLayoutSummaryDto
                    {
                        FrameLayoutId = sl.FrameLayoutId,
                        ScreenLayoutId = sl.ScreenLayoutId,
                        FrameLayoutName = sl.FrameLayoutId.HasValue
                            ? allFrameLayouts.FirstOrDefault(fl => fl.Id == sl.FrameLayoutId)?.DisplayName
                            : null,
                        ScreenLayoutName = sl.ScreenLayoutId.HasValue
                            ? allScreenLayouts.FirstOrDefault(scl => scl.Id == sl.ScreenLayoutId)?.DisplayName
                            : null
                    }).ToList()
                }).ToList(),
                CollectorLinks = j.CollectorLinks.Select(cl => new CollectorLinkSummaryDto
                {
                    CollectorId = cl.CollectorId,
                    Role = cl.Role,
                    CollectorName = allCollectors.FirstOrDefault(c => c.Id == cl.CollectorId)?.Name,
                    CollectorStatus = allCollectors.FirstOrDefault(c => c.Id == cl.CollectorId)?.Status
                }).ToList()
            }).ToList();

            return Ok(summaries);
        }

        public class JunctionSummaryDto
        {
            public int Id { get; set; }
            public required string Name { get; set; }
            public string Description { get; set; } = string.Empty;
            public required string Type { get; set; }
            public required string RenderingMode { get; set; }
            public required string Status { get; set; }
            public bool ShowOnDashboard { get; set; }
            public bool AutoStartOnLaunch { get; set; }
            public bool AllTargetsAllData { get; set; }
            public int SortOrder { get; set; }
            public string? GatewayDestination { get; set; }
            public int? GatewayDeviceId { get; set; }
            public List<DeviceLinkSummaryDto> DeviceLinks { get; set; } = new();
            public List<CollectorLinkSummaryDto> CollectorLinks { get; set; } = new();
        }

        public class DeviceLinkSummaryDto
        {
            public int DeviceId { get; set; }
            public required string Role { get; set; }
            public string? DeviceName { get; set; }
            public string? DeviceStatus { get; set; }
            public List<ScreenLayoutSummaryDto> ScreenLayouts { get; set; } = new();
        }

        public class CollectorLinkSummaryDto
        {
            public int CollectorId { get; set; }
            public required string Role { get; set; }
            public string? CollectorName { get; set; }
            public string? CollectorStatus { get; set; }
        }

        public class ScreenLayoutSummaryDto
        {
            public int? FrameLayoutId { get; set; }
            public int? ScreenLayoutId { get; set; }
            public string? FrameLayoutName { get; set; }
            public string? ScreenLayoutName { get; set; }
        }

        // GET: /api/junctions/layout-usage
        [HttpGet("layout-usage")]
        public async Task<ActionResult<LayoutUsageResponseDto>> GetJunctionLayoutUsage()
        {
            var junctions = await _junctionDb.GetAllJunctionsAsync();

            // Get junction usage
            var junctionUsages = junctions.Select(j => new JunctionLayoutUsageDto
            {
                JunctionId = j.Id,
                JunctionName = j.Name,
                LayoutIds = j.DeviceLinks
                    .SelectMany(link => link.ScreenLayouts)
                    .Select(sl => new LayoutIdPair
                    {
                        FrameLayoutId = sl.FrameLayoutId,
                        ScreenLayoutId = sl.ScreenLayoutId
                    })
                    .Where(pair => pair.FrameLayoutId.HasValue || pair.ScreenLayoutId.HasValue)
                    .Distinct()
                    .ToList()
            }).ToList();

            // Get device screen defaults - query directly from DeviceScreens table for efficiency
            var allDevices = await _deviceDb.GetAllDevicesAsync();
            var deviceScreenDefaults = new List<DeviceScreenDefaultDto>();

            foreach (var device in allDevices)
            {
                var screens = await _deviceDb.GetDeviceScreensAsync(device.Id);
                foreach (var screen in screens)
                {
                    if (screen.FrameLayoutId.HasValue || screen.ScreenLayoutId.HasValue)
                    {
                        deviceScreenDefaults.Add(new DeviceScreenDefaultDto
                        {
                            DeviceId = device.Id,
                            DeviceName = device.Name,
                            ScreenKey = screen.ScreenKey,
                            ScreenDisplayName = screen.DisplayName ?? screen.ScreenKey,
                            FrameLayoutId = screen.FrameLayoutId,
                            ScreenLayoutId = screen.ScreenLayoutId
                        });
                    }
                }
            }

            return Ok(new LayoutUsageResponseDto
            {
                JunctionUsages = junctionUsages,
                DeviceScreenDefaults = deviceScreenDefaults
            });
        }

        public class LayoutUsageResponseDto
        {
            public List<JunctionLayoutUsageDto> JunctionUsages { get; set; } = new();
            public List<DeviceScreenDefaultDto> DeviceScreenDefaults { get; set; } = new();
        }

        public class JunctionLayoutUsageDto
        {
            public int JunctionId { get; set; }
            public required string JunctionName { get; set; }
            public List<LayoutIdPair> LayoutIds { get; set; } = new();
        }

        public class DeviceScreenDefaultDto
        {
            public int DeviceId { get; set; }
            public required string DeviceName { get; set; }
            public required string ScreenKey { get; set; }
            public required string ScreenDisplayName { get; set; }
            public int? FrameLayoutId { get; set; }
            public int? ScreenLayoutId { get; set; }
        }

        public class LayoutIdPair
        {
            public int? FrameLayoutId { get; set; }
            public int? ScreenLayoutId { get; set; }
        }

        // GET: /api/junctions/{id}
        [HttpGet("{id}")]
        public async Task<ActionResult<Model_Junction>> GetJunctionById(int id)
        {
            var junction = await _junctionDb.GetJunctionByIdAsync(id);
            if (junction == null) return NotFound();

            // Update with real-time status from connection manager
            junction.Status = _connectionManager.IsJunctionRunning(junction.Id) ? "Running" : "Idle";

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