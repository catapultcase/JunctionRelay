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
using JunctionRelayServer.Services.FactoryServices;

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("api/homeassistant")]
    public class Controller_HomeAssistant : ControllerBase
    {
        private readonly Service_Database_Manager_Junctions _junctionManager;
        private readonly Service_Database_Manager_Services _serviceManager;
        private readonly IServiceProvider _serviceProvider;

        public Controller_HomeAssistant(
            Service_Database_Manager_Junctions junctionManager,
            Service_Database_Manager_Services serviceManager,
            IServiceProvider serviceProvider)
        {
            _junctionManager = junctionManager;
            _serviceManager = serviceManager;
            _serviceProvider = serviceProvider;
        }

        // Get junction summary for HomeAssistant integration discovery
        [HttpGet("junctions/summary")]
        public async Task<IActionResult> GetJunctionsSummary()
        {
            try
            {
                // Get active HomeAssistant service
                var haService = await GetActiveHomeAssistantServiceAsync();
                if (haService == null)
                {
                    return Ok(new List<object>()); // Return empty if no HA service active
                }

                // Get all junctions
                var allJunctions = await _junctionManager.GetAllJunctionsAsync();

                // Filter junctions based on shared configuration
                var filteredJunctions = haService.FilterJunctionsForHomeAssistant(allJunctions, j => j.Id.ToString());

                // Return summary format expected by HomeAssistant integration
                var summary = filteredJunctions.Select(j => new
                {
                    id = j.Id,
                    name = j.Name,
                    status = j.Status,
                    description = j.Description,
                    type = j.Type
                }).ToList();

                Console.WriteLine($"[CONTROLLER_HOMEASSISTANT] Returning {summary.Count} junctions for HomeAssistant");
                return Ok(summary);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CONTROLLER_HOMEASSISTANT] Error getting junctions summary: {ex.Message}");
                return StatusCode(500, new { error = "Failed to retrieve junctions" });
            }
        }

        // Get specific junction details
        [HttpGet("junctions/{id}")]
        public async Task<IActionResult> GetJunction(int id)
        {
            try
            {
                // Get active HomeAssistant service
                var haService = await GetActiveHomeAssistantServiceAsync();
                if (haService == null)
                {
                    return NotFound(new { error = "HomeAssistant service not active" });
                }

                // Check if this junction is shared with HomeAssistant
                if (!haService.IsJunctionShared(id.ToString()))
                {
                    return NotFound(new { error = "Junction not shared with HomeAssistant" });
                }

                var junction = await _junctionManager.GetJunctionByIdAsync(id);
                if (junction == null)
                {
                    return NotFound(new { error = "Junction not found" });
                }

                var result = new
                {
                    id = junction.Id,
                    name = junction.Name,
                    status = junction.Status,
                    description = junction.Description,
                    type = junction.Type,
                    showOnDashboard = junction.ShowOnDashboard,
                    autoStartOnLaunch = junction.AutoStartOnLaunch
                };

                return Ok(result);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CONTROLLER_HOMEASSISTANT] Error getting junction {id}: {ex.Message}");
                return StatusCode(500, new { error = "Failed to retrieve junction" });
            }
        }

        // Start a junction (for HomeAssistant switch control)
        [HttpPost("connections/start/{id}")]
        public async Task<IActionResult> StartJunction(int id)
        {
            try
            {
                // Get active HomeAssistant service
                var haService = await GetActiveHomeAssistantServiceAsync();
                if (haService == null)
                {
                    return BadRequest(new { error = "HomeAssistant service not active" });
                }

                // Check if this junction is shared with HomeAssistant
                if (!haService.IsJunctionShared(id.ToString()))
                {
                    return Forbid("Junction not shared with HomeAssistant");
                }

                var junction = await _junctionManager.GetJunctionByIdAsync(id);
                if (junction == null)
                {
                    return NotFound(new { error = "Junction not found" });
                }

                // Update junction status to Running
                junction.Status = "Running";
                await _junctionManager.UpdateJunctionAsync(junction.Id, junction);

                Console.WriteLine($"[CONTROLLER_HOMEASSISTANT] Started junction {id} via HomeAssistant");
                return Ok(new { message = "Junction started successfully", status = "Running" });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CONTROLLER_HOMEASSISTANT] Error starting junction {id}: {ex.Message}");
                return StatusCode(500, new { error = "Failed to start junction" });
            }
        }

        // Stop a junction (for HomeAssistant switch control)
        [HttpPost("connections/stop/{id}")]
        public async Task<IActionResult> StopJunction(int id)
        {
            try
            {
                // Get active HomeAssistant service
                var haService = await GetActiveHomeAssistantServiceAsync();
                if (haService == null)
                {
                    return BadRequest(new { error = "HomeAssistant service not active" });
                }

                // Check if this junction is shared with HomeAssistant
                if (!haService.IsJunctionShared(id.ToString()))
                {
                    return Forbid("Junction not shared with HomeAssistant");
                }

                var junction = await _junctionManager.GetJunctionByIdAsync(id);
                if (junction == null)
                {
                    return NotFound(new { error = "Junction not found" });
                }

                // Update junction status to Idle
                junction.Status = "Idle";
                await _junctionManager.UpdateJunctionAsync(junction.Id, junction);

                Console.WriteLine($"[CONTROLLER_HOMEASSISTANT] Stopped junction {id} via HomeAssistant");
                return Ok(new { message = "Junction stopped successfully", status = "Idle" });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CONTROLLER_HOMEASSISTANT] Error stopping junction {id}: {ex.Message}");
                return StatusCode(500, new { error = "Failed to stop junction" });
            }
        }

        // Get HomeAssistant service status
        [HttpGet("status")]
        public async Task<IActionResult> GetServiceStatus()
        {
            try
            {
                var haService = await GetActiveHomeAssistantServiceAsync();
                if (haService == null)
                {
                    return Ok(new { isActive = false, message = "No active HomeAssistant service" });
                }

                var status = haService.GetServiceStatus();
                return Ok(status);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CONTROLLER_HOMEASSISTANT] Error getting service status: {ex.Message}");
                return StatusCode(500, new { error = "Failed to get service status" });
            }
        }

        // Helper method to get active HomeAssistant service
        private async Task<Service_HomeAssistant?> GetActiveHomeAssistantServiceAsync()
        {
            try
            {
                var services = await _serviceManager.GetAllServicesAsync();
                var haServiceModel = services.FirstOrDefault(s =>
                    s.Type == "HomeAssistant" && s.Status == "Active");

                if (haServiceModel == null)
                    return null;

                // FIXED: Get the correct factory function signature
                var serviceFactory = _serviceProvider.GetRequiredService<Func<Type, Models.Model_Service, IService>>();
                //                                                            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                //                                                            Changed 'object' to 'IService'

                // Create and return the HomeAssistant service instance
                var serviceInstance = serviceFactory(typeof(Service_HomeAssistant), haServiceModel) as Service_HomeAssistant;

                if (serviceInstance != null && !serviceInstance.IsConnected)
                {
                    await serviceInstance.ConnectAsync();
                }

                return serviceInstance;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CONTROLLER_HOMEASSISTANT] Error getting active HomeAssistant service: {ex.Message}");
                return null;
            }
        }
    }
}