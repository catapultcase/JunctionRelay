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

using System.Net.Http.Headers;
using JunctionRelayServer.Interfaces;
using JunctionRelayServer.Models;
using Newtonsoft.Json.Linq;

namespace JunctionRelayServer.Collectors
{
    public class DataCollector_Render : IDataCollector
    {
        public int CollectorId { get; private set; }

        public string CollectorName => "Render";

        private string _baseUrl = string.Empty;
        private string _apiKey = string.Empty;
        private string _serviceId = string.Empty;


        public void ApplyConfiguration(Model_Collector collector)
        {
            _baseUrl = collector.URL?.TrimEnd('/')
                ?? throw new ArgumentException("Collector.URL is required.");
            _apiKey = collector.DecryptedAccessToken
                ?? throw new ArgumentException("Collector.AccessToken (API Key) is required.");

            try
            {
                // Parse service ID from URL
                // Expected formats: 
                // - https://dashboard.render.com/web/srv-abc123def456
                // - https://api.render.com/v1/services/srv-abc123def456
                // - Just the service_id directly: srv-abc123def456
                var uri = new Uri(_baseUrl);
                var pathSegments = uri.AbsolutePath.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);

                if (pathSegments.Length >= 1)
                {
                    if (pathSegments.Contains("services") && pathSegments.Length >= 2)
                    {
                        // API URL format: /v1/services/{service_id}
                        var serviceIndex = Array.IndexOf(pathSegments, "services") + 1;
                        if (serviceIndex < pathSegments.Length)
                        {
                            _serviceId = pathSegments[serviceIndex];
                        }
                    }
                    else if (pathSegments.Length >= 2 && pathSegments[0] == "web")
                    {
                        // Dashboard URL format: /web/{service_id}
                        _serviceId = pathSegments[1];
                    }
                    else if (pathSegments.Length == 1 && pathSegments[0].StartsWith("srv-"))
                    {
                        // Direct service ID
                        _serviceId = pathSegments[0];
                    }
                }

                // If parsing failed, check if the URL itself looks like a service ID
                if (string.IsNullOrEmpty(_serviceId))
                {
                    var urlWithoutProtocol = _baseUrl.Replace("https://", "").Replace("http://", "");
                    if (urlWithoutProtocol.StartsWith("srv-") && !urlWithoutProtocol.Contains("/"))
                    {
                        _serviceId = urlWithoutProtocol;
                    }
                }

                if (string.IsNullOrEmpty(_serviceId))
                {
                    throw new ArgumentException($"Could not extract Service ID from URL. Please provide either: Service ID directly (srv-abc123), dashboard URL (https://dashboard.render.com/web/srv-abc123), or API URL (https://api.render.com/v1/services/srv-abc123)");
                }
            }
            catch (Exception ex) when (!(ex is ArgumentException))
            {
                throw new ArgumentException($"Failed to parse Render URL '{_baseUrl}': {ex.Message}", ex);
            }

            // Set the CollectorId from the Model_Collector.
            CollectorId = collector.Id;
        }

        public async Task<List<Model_Sensor>> FetchSensorsAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);
            var sensors = new List<Model_Sensor>();

            using var client = new HttpClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);
            client.DefaultRequestHeaders.Add("User-Agent", "JunctionRelay-Render-Collector");

            try
            {
                // Get service information
                var serviceInfo = await FetchServiceInfo(client, cancellationToken);
                if (serviceInfo != null)
                {
                    sensors.AddRange(ParseServiceInfo(serviceInfo, collector));
                }

                // Fetch recent deployments
                var deployments = await FetchDeployments(client, cancellationToken);
                if (deployments != null)
                {
                    sensors.AddRange(ParseDeployments(deployments, collector));
                }

                // Fetch service events (last 24 hours)
                var events = await FetchServiceEvents(client, cancellationToken);
                if (events != null)
                {
                    sensors.AddRange(ParseServiceEvents(events, collector));
                }

                // If it's a web service, fetch additional web-specific metrics
                if (serviceInfo?["type"]?.ToString() == "web_service")
                {
                    // Note: Render's metrics API might require higher plan tiers
                    // For now, we'll collect what's available from the basic endpoints
                }
            }
            catch (HttpRequestException ex)
            {
                Console.WriteLine($"Render API request failed: {ex.Message}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Render collector error: {ex.Message}");
            }

            return sensors;
        }

        public async Task<List<Model_Sensor>> FetchSelectedSensorsAsync(Model_Collector collector, List<string> selectedSensorIds, CancellationToken cancellationToken = default)
        {
            var allSensors = await FetchSensorsAsync(collector, cancellationToken);
            return allSensors.FindAll(sensor => selectedSensorIds.Contains(sensor.ExternalId));
        }

        public async Task<bool> TestConnectionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            try
            {
                ApplyConfiguration(collector);
                using var client = new HttpClient();
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);
                client.DefaultRequestHeaders.Add("User-Agent", "JunctionRelay-Render-Collector");

                var response = await client.GetAsync($"https://api.render.com/v1/services/{_serviceId}", cancellationToken);
                return response.IsSuccessStatusCode;
            }
            catch
            {
                return false;
            }
        }

        // Stub persistent session methods (non-persistent)
        public Task StartSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task StopSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public bool IsConnected(Model_Collector collector) => true;

        private async Task<JObject?> FetchServiceInfo(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                var response = await client.GetAsync($"https://api.render.com/v1/services/{_serviceId}", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JObject.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch service info: {ex.Message}");
            }
            return null;
        }

        private async Task<JArray?> FetchDeployments(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                var response = await client.GetAsync($"https://api.render.com/v1/services/{_serviceId}/deploys?limit=10", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JArray.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch deployments: {ex.Message}");
            }
            return null;
        }

        private async Task<JArray?> FetchServiceEvents(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                // Get events from the last 24 hours
                var since = DateTime.UtcNow.AddDays(-1).ToString("yyyy-MM-ddTHH:mm:ssZ");
                var response = await client.GetAsync($"https://api.render.com/v1/services/{_serviceId}/events?since={since}&limit=50", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JArray.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch service events: {ex.Message}");
            }
            return null;
        }

        private List<Model_Sensor> ParseServiceInfo(JObject serviceInfo, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var serviceName = serviceInfo["name"]?.ToString() ?? "Unknown Service";

            // Service status
            var status = serviceInfo["serviceDetails"]?["status"]?.ToString() ?? "unknown";
            sensors.Add(new Model_Sensor
            {
                ExternalId = $"render_service_status_{_serviceId}",
                Name = "Service Status",
                Value = status,
                Unit = "status",
                DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(status),
                Category = "Render Service",
                DeviceName = collector.Name,
                SensorType = "API",
                SensorTag = "service_status",
                ComponentName = serviceName,
                JunctionId = null,
                DeviceId = null,
                CollectorId = collector.Id,
                LastUpdated = DateTime.UtcNow
            });

            // Service type
            var serviceType = serviceInfo["type"]?.ToString() ?? "unknown";
            sensors.Add(new Model_Sensor
            {
                ExternalId = $"render_service_type_{_serviceId}",
                Name = "Service Type",
                Value = serviceType,
                Unit = "type",
                DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(serviceType),
                Category = "Render Service",
                DeviceName = collector.Name,
                SensorType = "API",
                SensorTag = "service_type",
                ComponentName = serviceName,
                JunctionId = null,
                DeviceId = null,
                CollectorId = collector.Id,
                LastUpdated = DateTime.UtcNow
            });

            // Auto-deploy enabled
            var autoDeploy = serviceInfo["autoDeploy"]?.ToString() ?? "unknown";
            string autoDeployValue = autoDeploy.ToLower() == "true" ? "1" : "0";
            sensors.Add(new Model_Sensor
            {
                ExternalId = $"render_auto_deploy_{_serviceId}",
                Name = "Auto Deploy",
                Value = autoDeployValue,
                Unit = "boolean",
                DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(autoDeployValue),
                Category = "Render Service",
                DeviceName = collector.Name,
                SensorType = "API",
                SensorTag = "auto_deploy",
                ComponentName = serviceName,
                JunctionId = null,
                DeviceId = null,
                CollectorId = collector.Id,
                LastUpdated = DateTime.UtcNow
            });

            // Branch being deployed
            var branch = serviceInfo["branch"]?.ToString() ?? "unknown";
            sensors.Add(new Model_Sensor
            {
                ExternalId = $"render_branch_{_serviceId}",
                Name = "Git Branch",
                Value = branch,
                Unit = "branch",
                DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(branch),
                Category = "Render Service",
                DeviceName = collector.Name,
                SensorType = "API",
                SensorTag = "git_branch",
                ComponentName = serviceName,
                JunctionId = null,
                DeviceId = null,
                CollectorId = collector.Id,
                LastUpdated = DateTime.UtcNow
            });

            // Service plan/instance type
            var serviceDetails = serviceInfo["serviceDetails"];
            if (serviceDetails != null)
            {
                var plan = serviceDetails["plan"]?.ToString() ?? "unknown";
                sensors.Add(new Model_Sensor
                {
                    ExternalId = $"render_plan_{_serviceId}",
                    Name = "Service Plan",
                    Value = plan,
                    Unit = "plan",
                    DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(plan),
                    Category = "Render Service",
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = "service_plan",
                    ComponentName = serviceName,
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });

                // Number of instances (if available)
                var numInstances = serviceDetails["numInstances"]?.ToString() ?? "0";
                sensors.Add(new Model_Sensor
                {
                    ExternalId = $"render_instances_{_serviceId}",
                    Name = "Instance Count",
                    Value = numInstances,
                    Unit = "instances",
                    DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(numInstances),
                    Category = "Render Service",
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = "instance_count",
                    ComponentName = serviceName,
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });
            }

            return sensors;
        }

        private List<Model_Sensor> ParseDeployments(JArray deployments, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();

            if (deployments.Count > 0)
            {
                // Latest deployment status
                var latestDeploy = deployments[0];
                var deployStatus = latestDeploy["status"]?.ToString() ?? "unknown";
                sensors.Add(new Model_Sensor
                {
                    ExternalId = $"render_latest_deploy_status_{_serviceId}",
                    Name = "Latest Deploy Status",
                    Value = deployStatus,
                    Unit = "status",
                    DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(deployStatus),
                    Category = "Render Deployments",
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = "latest_deploy_status",
                    ComponentName = "Deployments",
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });

                // Latest deployment duration (if finished)
                var createdAt = latestDeploy["createdAt"]?.ToString();
                var finishedAt = latestDeploy["finishedAt"]?.ToString();
                if (!string.IsNullOrEmpty(createdAt) && !string.IsNullOrEmpty(finishedAt))
                {
                    if (DateTime.TryParse(createdAt, out var created) && DateTime.TryParse(finishedAt, out var finished))
                    {
                        var duration = (finished - created).TotalSeconds;
                        var (durationValue, durationDecimals) = Helper_DataCollector.SanitizeSensorValue(duration, 1);
                        sensors.Add(new Model_Sensor
                        {
                            ExternalId = $"render_latest_deploy_duration_{_serviceId}",
                            Name = "Latest Deploy Duration",
                            Value = durationValue,
                            Unit = "seconds",
                            DecimalPlaces = durationDecimals,
                            Category = "Render Deployments",
                            DeviceName = collector.Name,
                            SensorType = "API",
                            SensorTag = "latest_deploy_duration",
                            ComponentName = "Deployments",
                            JunctionId = null,
                            DeviceId = null,
                            CollectorId = collector.Id,
                            LastUpdated = DateTime.UtcNow
                        });
                    }
                }

                // Count successful deployments in last 10
                var successfulCount = deployments.Count(d => d["status"]?.ToString() == "live");
                string successfulValue = successfulCount.ToString();
                sensors.Add(new Model_Sensor
                {
                    ExternalId = $"render_successful_deploys_{_serviceId}",
                    Name = "Successful Deploys (Last 10)",
                    Value = successfulValue,
                    Unit = "deployments",
                    DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(successfulValue),
                    Category = "Render Deployments",
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = "successful_deploys",
                    ComponentName = "Deployments",
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });

                // Count failed deployments in last 10
                var failedCount = deployments.Count(d =>
                    d["status"]?.ToString() == "build_failed" ||
                    d["status"]?.ToString() == "upload_failed" ||
                    d["status"]?.ToString() == "canceled");
                string failedValue = failedCount.ToString();
                sensors.Add(new Model_Sensor
                {
                    ExternalId = $"render_failed_deploys_{_serviceId}",
                    Name = "Failed Deploys (Last 10)",
                    Value = failedValue,
                    Unit = "deployments",
                    DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(failedValue),
                    Category = "Render Deployments",
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = "failed_deploys",
                    ComponentName = "Deployments",
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });

                // Calculate success rate
                if (deployments.Count > 0)
                {
                    var successRate = (successfulCount / (double)deployments.Count) * 100;
                    var (successRateValue, successRateDecimals) = Helper_DataCollector.SanitizeSensorValue(successRate, 1);
                    sensors.Add(new Model_Sensor
                    {
                        ExternalId = $"render_deploy_success_rate_{_serviceId}",
                        Name = "Deploy Success Rate (Last 10)",
                        Value = successRateValue,
                        Unit = "%",
                        DecimalPlaces = successRateDecimals,
                        Category = "Render Deployments",
                        DeviceName = collector.Name,
                        SensorType = "API",
                        SensorTag = "deploy_success_rate",
                        ComponentName = "Deployments",
                        JunctionId = null,
                        DeviceId = null,
                        CollectorId = collector.Id,
                        LastUpdated = DateTime.UtcNow
                    });
                }
            }

            return sensors;
        }

        private List<Model_Sensor> ParseServiceEvents(JArray events, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();

            if (events.Count > 0)
            {
                // Count events by type in last 24 hours
                var restartCount = events.Count(e => e["type"]?.ToString()?.Contains("restart") == true);
                string restartValue = restartCount.ToString();
                sensors.Add(new Model_Sensor
                {
                    ExternalId = $"render_restarts_24h_{_serviceId}",
                    Name = "Restarts (24h)",
                    Value = restartValue,
                    Unit = "restarts",
                    DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(restartValue),
                    Category = "Render Events",
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = "restarts_24h",
                    ComponentName = "Service Events",
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });

                var deployCount = events.Count(e => e["type"]?.ToString()?.Contains("deploy") == true);
                string deployValue = deployCount.ToString();
                sensors.Add(new Model_Sensor
                {
                    ExternalId = $"render_deploys_24h_{_serviceId}",
                    Name = "Deploys (24h)",
                    Value = deployValue,
                    Unit = "deploys",
                    DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(deployValue),
                    Category = "Render Events",
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = "deploys_24h",
                    ComponentName = "Service Events",
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });

                // Total events in 24h
                string totalValue = events.Count.ToString();
                sensors.Add(new Model_Sensor
                {
                    ExternalId = $"render_total_events_24h_{_serviceId}",
                    Name = "Total Events (24h)",
                    Value = totalValue,
                    Unit = "events",
                    DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(totalValue),
                    Category = "Render Events",
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = "total_events_24h",
                    ComponentName = "Service Events",
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });

                // Latest event type
                var latestEvent = events[0];
                var latestEventType = latestEvent["type"]?.ToString() ?? "unknown";
                sensors.Add(new Model_Sensor
                {
                    ExternalId = $"render_latest_event_{_serviceId}",
                    Name = "Latest Event Type",
                    Value = latestEventType,
                    Unit = "event",
                    DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(latestEventType),
                    Category = "Render Events",
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = "latest_event",
                    ComponentName = "Service Events",
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });
            }

            return sensors;
        }
    }
}