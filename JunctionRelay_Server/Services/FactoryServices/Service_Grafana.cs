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
using System.Text.Json;
using System.Collections.Concurrent;

namespace JunctionRelayServer.Services.FactoryServices
{
    public class Service_Grafana : IService
    {
        private static readonly ConcurrentDictionary<int, Service_Grafana> _instances = new();
        private Model_Service? _service;

        public bool IsConnected { get; private set; }
        public Model_Service? GetCurrentService() => _service;

        // Constructor
        public Service_Grafana()
        {
            // No external connections needed - this is a data provider service
        }

        // Static method to get or create singleton instance for a service
        public static Service_Grafana GetInstance(Model_Service service)
        {
            return _instances.GetOrAdd(service.Id, _ =>
            {
                var instance = new Service_Grafana();
                instance.SetService(service);
                return instance;
            });
        }

        // Set the service configuration dynamically
        public void SetService(Model_Service service)
        {
            if (_service != null && _service.Id == service.Id)
                return; // Already set

            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        // Connect - for data provider mode, we don't need to connect to Grafana
        public async Task ConnectAsync()
        {
            if (_service == null)
            {
                throw new InvalidOperationException($"[SERVICE_GRAFANA] Service must be configured before connecting.");
            }

            // Only log if not already connected
            if (!IsConnected)
            {
                IsConnected = true;
                Console.WriteLine($"[SERVICE_GRAFANA][{_service.Id}] Grafana data provider service activated for '{_service.Name}'");

                var sharedMetrics = GetSharedMetricIds();
                Console.WriteLine($"[SERVICE_GRAFANA][{_service.Id}] Currently sharing {sharedMetrics.Count} metric types with Grafana");
            }

            await Task.CompletedTask;
        }

        // Check if Grafana access is enabled
        public bool IsGrafanaAccessEnabled()
        {
            return _service != null && IsConnected && _service.Status == "Active";
        }

        // Get list of shared metric IDs from the service configuration
        public List<string> GetSharedMetricIds()
        {
            if (_service?.GrafanaSharedMetrics == null)
                return new List<string>();

            try
            {
                var sharedMetrics = JsonSerializer.Deserialize<List<string>>(_service.GrafanaSharedMetrics);
                return sharedMetrics ?? new List<string>();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_GRAFANA][{_service?.Id}] Failed to parse shared metrics: {ex.Message}");
                return new List<string>();
            }
        }

        // Check if a specific metric type is shared
        public bool IsMetricShared(string metricType)
        {
            if (!IsGrafanaAccessEnabled())
                return false;

            var sharedMetrics = GetSharedMetricIds();
            return sharedMetrics.Contains(metricType);
        }

        // Get junction data formatted for Grafana consumption
        public async Task<object> GetJunctionDataForGrafanaAsync<T>(List<T> junctions, Func<T, object> formatJunctionData)
        {
            if (!IsGrafanaAccessEnabled())
            {
                Console.WriteLine($"[SERVICE_GRAFANA][{_service?.Id}] Grafana access not enabled - returning empty data");
                return new { data = new List<object>(), error = "Grafana service not active" };
            }

            try
            {
                var formattedData = junctions.Select(formatJunctionData).ToList();

                Console.WriteLine($"[SERVICE_GRAFANA][{_service?.Id}] Formatted {junctions.Count} junctions for Grafana");

                return new
                {
                    data = formattedData,
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    source = "JunctionRelay",
                    serviceId = _service?.Id
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_GRAFANA][{_service?.Id}] Error formatting junction data: {ex.Message}");
                return new { data = new List<object>(), error = ex.Message };
            }
        }

        // Get sensor data formatted for Grafana time series
        public async Task<object> GetSensorDataForGrafanaAsync<T>(List<T> sensors, Func<T, object> formatSensorData)
        {
            if (!IsGrafanaAccessEnabled())
            {
                Console.WriteLine($"[SERVICE_GRAFANA][{_service?.Id}] Grafana access not enabled - returning empty data");
                return new { data = new List<object>(), error = "Grafana service not active" };
            }

            try
            {
                var formattedData = sensors.Select(formatSensorData).ToList();

                Console.WriteLine($"[SERVICE_GRAFANA][{_service?.Id}] Formatted {sensors.Count} sensors for Grafana");

                return new
                {
                    data = formattedData,
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    source = "JunctionRelay",
                    serviceId = _service?.Id,
                    type = "timeseries"
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_GRAFANA][{_service?.Id}] Error formatting sensor data: {ex.Message}");
                return new { data = new List<object>(), error = ex.Message };
            }
        }

        // Get available metrics/endpoints for Grafana discovery
        public object GetAvailableMetrics()
        {
            if (!IsGrafanaAccessEnabled())
                return new { metrics = new List<object>(), error = "Service not active" };

            var sharedMetrics = GetSharedMetricIds();

            return new
            {
                metrics = new[]
                {
                    new { name = "junctions", endpoint = "/api/grafana/junctions", description = "Junction states and information", shared = sharedMetrics.Contains("junctions") },
                    new { name = "sensors", endpoint = "/api/grafana/sensors", description = "Sensor readings and time series data", shared = sharedMetrics.Contains("sensors") },
                    new { name = "system", endpoint = "/api/grafana/system", description = "System metrics and health data", shared = sharedMetrics.Contains("system") },
                    new { name = "events", endpoint = "/api/grafana/events", description = "System events and alerts", shared = sharedMetrics.Contains("events") }
                },
                serviceInfo = new
                {
                    name = _service?.Name,
                    id = _service?.Id,
                    version = "1.0",
                    capabilities = new[] { "real-time", "historical", "alerts" },
                    sharedMetricsCount = sharedMetrics.Count
                }
            };
        }

        // Format junction data specifically for Grafana API backend datasource
        public object FormatJunctionForGrafana(dynamic junction)
        {
            try
            {
                return new
                {
                    target = $"junction_{junction.Id}_{junction.Name}".Replace(" ", "_"),
                    datapoints = new[]
                    {
                        new object[] { junction.Status == "Running" ? 1 : 0, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }
                    },
                    tags = new
                    {
                        junction_id = junction.Id?.ToString(),
                        junction_name = junction.Name?.ToString(),
                        status = junction.Status?.ToString(),
                        type = junction.Type?.ToString()
                    }
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_GRAFANA][{_service?.Id}] Error formatting junction: {ex.Message}");
                return new { target = "error", datapoints = new object[0][] };
            }
        }

        // Format sensor data for Grafana time series
        public object FormatSensorForGrafana(dynamic sensor)
        {
            try
            {
                var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                var value = sensor.Value;

                // Try to parse numeric values
                if (double.TryParse(value?.ToString(), out double numericValue))
                {
                    return new
                    {
                        target = $"sensor_{sensor.Id}_{sensor.Name}".Replace(" ", "_"),
                        datapoints = new[]
                        {
                            new object[] { numericValue, timestamp }
                        },
                        tags = new
                        {
                            sensor_id = sensor.Id?.ToString(),
                            sensor_name = sensor.Name?.ToString(),
                            unit = sensor.Unit?.ToString(),
                            junction_id = sensor.JunctionId?.ToString()
                        }
                    };
                }
                else
                {
                    // For non-numeric values, create a status indicator
                    return new
                    {
                        target = $"sensor_{sensor.Id}_{sensor.Name}_status".Replace(" ", "_"),
                        datapoints = new[]
                        {
                            new object[] { string.IsNullOrEmpty(value?.ToString()) ? 0 : 1, timestamp }
                        },
                        tags = new
                        {
                            sensor_id = sensor.Id?.ToString(),
                            sensor_name = sensor.Name?.ToString(),
                            value = value?.ToString(),
                            junction_id = sensor.JunctionId?.ToString()
                        }
                    };
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_GRAFANA][{_service?.Id}] Error formatting sensor: {ex.Message}");
                return new { target = "error", datapoints = new object[0][] };
            }
        }

        // Get service status for API responses
        public object GetServiceStatus()
        {
            var sharedMetrics = GetSharedMetricIds();

            return new
            {
                ServiceName = _service?.Name ?? "Unknown",
                ServiceId = _service?.Id ?? 0,
                IsEnabled = IsGrafanaAccessEnabled(),
                SharedMetricsCount = sharedMetrics.Count,
                SharedMetrics = sharedMetrics,
                IsConnected = IsConnected,
                Mode = "DataProvider",
                LastUpdated = DateTime.UtcNow,
                ApiEndpoints = new[]
                {
                    "/api/grafana/junctions",
                    "/api/grafana/sensors",
                    "/api/grafana/system",
                    "/api/grafana/metrics",
                    "/api/grafana/discovery"
                }
            };
        }

        // Disconnect - cleanup
        public async Task DisconnectAsync()
        {
            IsConnected = false;
            Console.WriteLine($"[SERVICE_GRAFANA][{_service?.Id}] Grafana data provider service disconnected");
            await Task.CompletedTask;
        }

        // Clean up singleton instance
        public static void RemoveInstance(int serviceId)
        {
            _instances.TryRemove(serviceId, out _);
        }

        // No resources to dispose for this service
        public void Dispose()
        {
            if (_service != null)
            {
                RemoveInstance(_service.Id);
            }
        }
    }
}