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
using System.Text.Json;

namespace JunctionRelayServer.Controllers
{
    [ApiController]
    [Route("api/grafana")]
    public class Controller_Grafana : ControllerBase
    {
        private readonly Service_Database_Manager_Junctions _junctionManager;
        private readonly Service_Database_Manager_Sensors _sensorManager;
        private readonly Service_Database_Manager_Services _serviceManager;
        private readonly IServiceProvider _serviceProvider;

        public Controller_Grafana(
            Service_Database_Manager_Junctions junctionManager,
            Service_Database_Manager_Sensors sensorManager,
            Service_Database_Manager_Services serviceManager,
            IServiceProvider serviceProvider)
        {
            _junctionManager = junctionManager;
            _sensorManager = sensorManager;
            _serviceManager = serviceManager;
            _serviceProvider = serviceProvider;
        }

        // Main query endpoint for Grafana API Backend datasource
        [HttpPost("query")]
        public async Task<IActionResult> Query([FromBody] JsonElement requestBody)
        {
            try
            {
                var grafanaService = await GetActiveGrafanaServiceAsync();
                if (grafanaService == null)
                {
                    return Ok(new List<object>());
                }

                // Parse Grafana query request
                var targets = requestBody.GetProperty("targets");
                var results = new List<object>();

                foreach (var target in targets.EnumerateArray())
                {
                    var queryType = target.GetProperty("target").GetString();

                    switch (queryType?.ToLower())
                    {
                        case "junctions":
                            if (IsMetricShared(grafanaService, "junctions"))
                            {
                                var junctions = await _junctionManager.GetAllJunctionsAsync();
                                foreach (var junction in junctions)
                                {
                                    results.Add(new
                                    {
                                        target = $"junction_{junction.Id}_{junction.Name.Replace(" ", "_")}",
                                        datapoints = new[]
                                        {
                                            new object[] { junction.Status == "Running" ? 1 : 0, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }
                                        }
                                    });
                                }
                            }
                            break;

                        case "sensors":
                            if (IsMetricShared(grafanaService, "sensors"))
                            {
                                var sensors = await _sensorManager.GetAllSensorsAsync();
                                foreach (var sensor in sensors)
                                {
                                    if (double.TryParse(sensor.Value, out double numericValue))
                                    {
                                        results.Add(new
                                        {
                                            target = $"sensor_{sensor.Id}_{sensor.Name.Replace(" ", "_")}",
                                            datapoints = new[]
                                            {
                                                new object[] { numericValue, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }
                                            }
                                        });
                                    }
                                }
                            }
                            break;

                        case "system":
                            if (IsMetricShared(grafanaService, "system"))
                            {
                                results.Add(new
                                {
                                    target = "system_uptime",
                                    datapoints = new[]
                                    {
                                        new object[] { Environment.TickCount64 / 1000, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }
                                    }
                                });

                                results.Add(new
                                {
                                    target = "system_memory_used",
                                    datapoints = new[]
                                    {
                                        new object[] { GC.GetTotalMemory(false), DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }
                                    }
                                });

                                results.Add(new
                                {
                                    target = "system_thread_count",
                                    datapoints = new[]
                                    {
                                        new object[] { System.Diagnostics.Process.GetCurrentProcess().Threads.Count, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }
                                    }
                                });
                            }
                            break;
                    }
                }

                return Ok(results);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CONTROLLER_GRAFANA] Error in query endpoint: {ex.Message}");
                return Ok(new List<object>());
            }
        }

        // Test connectivity endpoint
        [HttpGet("")]
        public IActionResult TestConnection()
        {
            return Ok(new { message = "JunctionRelay API Backend is working!" });
        }

        // Search endpoint for query options
        [HttpPost("search")]
        public async Task<IActionResult> Search([FromBody] JsonElement requestBody)
        {
            try
            {
                var grafanaService = await GetActiveGrafanaServiceAsync();
                if (grafanaService == null)
                {
                    return Ok(new List<string>());
                }

                var searchTargets = new List<string>();

                if (IsMetricShared(grafanaService, "junctions"))
                {
                    searchTargets.Add("junctions");
                }

                if (IsMetricShared(grafanaService, "sensors"))
                {
                    searchTargets.Add("sensors");
                }

                if (IsMetricShared(grafanaService, "system"))
                {
                    searchTargets.Add("system");
                }

                return Ok(searchTargets);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CONTROLLER_GRAFANA] Error in search endpoint: {ex.Message}");
                return Ok(new List<string>());
            }
        }

        // Legacy endpoints (keeping for backward compatibility and testing)

        // Get junctions data for Grafana
        [HttpGet("junctions")]
        public async Task<IActionResult> GetJunctions()
        {
            try
            {
                var grafanaService = await GetActiveGrafanaServiceAsync();
                if (grafanaService == null)
                {
                    return Ok(new { data = new List<object>(), error = "No active Grafana service" });
                }

                // Check if junctions are shared
                if (!IsMetricShared(grafanaService, "junctions"))
                {
                    return Ok(new { data = new List<object>(), error = "Junctions not shared with Grafana" });
                }

                var junctions = await _junctionManager.GetAllJunctionsAsync();

                var result = await grafanaService.GetJunctionDataForGrafanaAsync(
                    junctions,
                    junction => grafanaService.FormatJunctionForGrafana(junction)
                );

                return Ok(result);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CONTROLLER_GRAFANA] Error getting junctions: {ex.Message}");
                return StatusCode(500, new { error = "Failed to retrieve junction data" });
            }
        }

        // Get sensors data for Grafana
        [HttpGet("sensors")]
        public async Task<IActionResult> GetSensors()
        {
            try
            {
                var grafanaService = await GetActiveGrafanaServiceAsync();
                if (grafanaService == null)
                {
                    return Ok(new { data = new List<object>(), error = "No active Grafana service" });
                }

                // Check if sensors are shared
                if (!IsMetricShared(grafanaService, "sensors"))
                {
                    return Ok(new { data = new List<object>(), error = "Sensors not shared with Grafana" });
                }

                var sensors = await _sensorManager.GetAllSensorsAsync();

                var result = await grafanaService.GetSensorDataForGrafanaAsync(
                    sensors,
                    sensor => grafanaService.FormatSensorForGrafana(sensor)
                );

                return Ok(result);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CONTROLLER_GRAFANA] Error getting sensors: {ex.Message}");
                return StatusCode(500, new { error = "Failed to retrieve sensor data" });
            }
        }

        // Get system metrics for Grafana
        [HttpGet("system")]
        public async Task<IActionResult> GetSystemMetrics()
        {
            try
            {
                var grafanaService = await GetActiveGrafanaServiceAsync();
                if (grafanaService == null)
                {
                    return Ok(new { data = new List<object>(), error = "No active Grafana service" });
                }

                // Check if system metrics are shared
                if (!IsMetricShared(grafanaService, "system"))
                {
                    return Ok(new { data = new List<object>(), error = "System metrics not shared with Grafana" });
                }

                // Get system metrics
                var systemMetrics = new[]
                {
                    new
                    {
                        target = "system_uptime",
                        datapoints = new object[] { Environment.TickCount64 / 1000, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() },
                        tags = new { metric_type = "uptime", unit = "seconds" }
                    },
                    new
                    {
                        target = "system_memory_used",
                        datapoints = new object[] { GC.GetTotalMemory(false), DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() },
                        tags = new { metric_type = "memory", unit = "bytes" }
                    },
                    new
                    {
                        target = "system_thread_count",
                        datapoints = new object[] { System.Diagnostics.Process.GetCurrentProcess().Threads.Count, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() },
                        tags = new { metric_type = "threads", unit = "count" }
                    }
                };

                var result = new
                {
                    data = systemMetrics,
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    source = "JunctionRelay",
                    serviceId = grafanaService.GetCurrentService()?.Id,
                    type = "system_metrics"
                };

                return Ok(result);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CONTROLLER_GRAFANA] Error getting system metrics: {ex.Message}");
                return StatusCode(500, new { error = "Failed to retrieve system metrics" });
            }
        }

        // Get combined metrics for Grafana
        [HttpGet("metrics")]
        public async Task<IActionResult> GetAllMetrics()
        {
            try
            {
                var grafanaService = await GetActiveGrafanaServiceAsync();
                if (grafanaService == null)
                {
                    return Ok(new { data = new List<object>(), error = "No active Grafana service" });
                }

                var allMetrics = new List<object>();

                // Add junctions if shared
                if (IsMetricShared(grafanaService, "junctions"))
                {
                    var junctions = await _junctionManager.GetAllJunctionsAsync();
                    var junctionMetrics = junctions.Select(j => grafanaService.FormatJunctionForGrafana(j));
                    allMetrics.AddRange(junctionMetrics);
                }

                // Add sensors if shared
                if (IsMetricShared(grafanaService, "sensors"))
                {
                    var sensors = await _sensorManager.GetAllSensorsAsync();
                    var sensorMetrics = sensors.Select(s => grafanaService.FormatSensorForGrafana(s));
                    allMetrics.AddRange(sensorMetrics);
                }

                // Add system metrics if shared
                if (IsMetricShared(grafanaService, "system"))
                {
                    var systemMetrics = new[]
                    {
                        new
                        {
                            target = "system_uptime",
                            datapoints = new[] { new object[] { Environment.TickCount64 / 1000, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() } },
                            tags = new { metric_type = "uptime", unit = "seconds" }
                        }
                    };
                    allMetrics.AddRange(systemMetrics);
                }

                var result = new
                {
                    data = allMetrics,
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    source = "JunctionRelay",
                    serviceId = grafanaService.GetCurrentService()?.Id,
                    type = "combined_metrics"
                };

                return Ok(result);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CONTROLLER_GRAFANA] Error getting all metrics: {ex.Message}");
                return StatusCode(500, new { error = "Failed to retrieve metrics" });
            }
        }

        // Get available metrics/discovery endpoint
        [HttpGet("discovery")]
        public async Task<IActionResult> GetDiscovery()
        {
            try
            {
                var grafanaService = await GetActiveGrafanaServiceAsync();
                if (grafanaService == null)
                {
                    return Ok(new { metrics = new List<object>(), error = "No active Grafana service" });
                }

                var discovery = grafanaService.GetAvailableMetrics();
                return Ok(discovery);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CONTROLLER_GRAFANA] Error getting discovery info: {ex.Message}");
                return StatusCode(500, new { error = "Failed to get discovery information" });
            }
        }

        // Get Grafana service status
        [HttpGet("status")]
        public async Task<IActionResult> GetServiceStatus()
        {
            try
            {
                var grafanaService = await GetActiveGrafanaServiceAsync();
                if (grafanaService == null)
                {
                    return Ok(new { isActive = false, message = "No active Grafana service" });
                }

                var status = grafanaService.GetServiceStatus();
                return Ok(status);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CONTROLLER_GRAFANA] Error getting service status: {ex.Message}");
                return StatusCode(500, new { error = "Failed to get service status" });
            }
        }

        // Helper method to get active Grafana service
        private async Task<Service_Grafana?> GetActiveGrafanaServiceAsync()
        {
            try
            {
                var services = await _serviceManager.GetAllServicesAsync();
                var grafanaServiceModel = services.FirstOrDefault(s =>
                    s.Type == "Grafana" && s.Status == "Active");

                if (grafanaServiceModel == null)
                    return null;

                // Get the correct factory function signature
                var serviceFactory = _serviceProvider.GetRequiredService<Func<Type, Models.Model_Service, IService>>();

                // Create and return the Grafana service instance
                var serviceInstance = serviceFactory(typeof(Service_Grafana), grafanaServiceModel) as Service_Grafana;

                if (serviceInstance != null && !serviceInstance.IsConnected)
                {
                    await serviceInstance.ConnectAsync();
                }

                return serviceInstance;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CONTROLLER_GRAFANA] Error getting active Grafana service: {ex.Message}");
                return null;
            }
        }

        // Helper method to check if a metric type is shared
        private bool IsMetricShared(Service_Grafana grafanaService, string metricType)
        {
            try
            {
                var serviceModel = grafanaService.GetCurrentService();
                if (string.IsNullOrEmpty(serviceModel?.GrafanaSharedMetrics))
                    return false;

                var sharedMetrics = JsonSerializer.Deserialize<List<string>>(serviceModel.GrafanaSharedMetrics);
                return sharedMetrics?.Contains(metricType) == true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CONTROLLER_GRAFANA] Error checking shared metrics: {ex.Message}");
                return false;
            }
        }
    }
}