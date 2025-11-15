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
    public class DataCollector_Cloudflare : IDataCollector
    {
        public int CollectorId { get; private set; }

        public string CollectorName => "Cloudflare";

        private string _baseUrl = string.Empty;
        private string _apiToken = string.Empty;
        private string _zoneId = string.Empty;

        public void ApplyConfiguration(Model_Collector collector)
        {
            _baseUrl = collector.URL?.TrimEnd('/')
                ?? throw new ArgumentException("Collector.URL is required.");
            _apiToken = collector.DecryptedAccessToken
                ?? throw new ArgumentException("Collector.AccessToken (API Token) is required.");

            try
            {
                // Parse zone ID from URL
                // Expected formats: 
                // - https://dash.cloudflare.com/{account_id}/{zone_id}
                // - https://api.cloudflare.com/client/v4/zones/{zone_id}
                // - Just the zone_id directly
                var uri = new Uri(_baseUrl);
                var pathSegments = uri.AbsolutePath.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);

                if (pathSegments.Length >= 1)
                {
                    if (pathSegments.Contains("zones") && pathSegments.Length >= 2)
                    {
                        // API URL format: zones/{zone_id}
                        var zoneIndex = Array.IndexOf(pathSegments, "zones") + 1;
                        if (zoneIndex < pathSegments.Length)
                        {
                            _zoneId = pathSegments[zoneIndex];
                        }
                    }
                    else if (pathSegments.Length >= 2)
                    {
                        // Dashboard URL format: {account_id}/{zone_id}
                        _zoneId = pathSegments[1];
                    }
                    else if (pathSegments.Length == 1 && pathSegments[0].Length > 20)
                    {
                        // Direct zone ID
                        _zoneId = pathSegments[0];
                    }
                }

                // If parsing failed, check if the URL itself looks like a zone ID
                if (string.IsNullOrEmpty(_zoneId))
                {
                    var urlWithoutProtocol = _baseUrl.Replace("https://", "").Replace("http://", "");
                    if (urlWithoutProtocol.Length > 20 && !urlWithoutProtocol.Contains("/") && !urlWithoutProtocol.Contains("."))
                    {
                        _zoneId = urlWithoutProtocol;
                    }
                }

                if (string.IsNullOrEmpty(_zoneId))
                {
                    throw new ArgumentException($"Could not extract Zone ID from URL. Please provide either: Zone ID directly, dashboard URL (https://dash.cloudflare.com/account_id/zone_id), or API URL (https://api.cloudflare.com/client/v4/zones/zone_id)");
                }
            }
            catch (Exception ex) when (!(ex is ArgumentException))
            {
                throw new ArgumentException($"Failed to parse Cloudflare URL '{_baseUrl}': {ex.Message}", ex);
            }

            // Set the CollectorId from the Model_Collector.
            CollectorId = collector.Id;
        }

        public async Task<List<Model_Sensor>> FetchSensorsAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);
            var sensors = new List<Model_Sensor>();

            using var client = new HttpClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _apiToken);
            client.DefaultRequestHeaders.Add("User-Agent", "JunctionRelay-Cloudflare-Collector");

            try
            {
                // Get zone information first
                var zoneInfo = await FetchZoneInfo(client, cancellationToken);
                if (zoneInfo != null)
                {
                    sensors.AddRange(ParseZoneInfo(zoneInfo, collector));
                }

                // Fetch analytics data for the last 24 hours
                var since = DateTime.UtcNow.AddDays(-1);
                var until = DateTime.UtcNow;

                // Fetch HTTP requests analytics
                var httpAnalytics = await FetchAnalyticsData(client, "httpRequests1dGroups", since, until, cancellationToken);
                if (httpAnalytics != null)
                {
                    sensors.AddRange(ParseHttpAnalytics(httpAnalytics, collector));
                }

                // Fetch threats analytics
                var threatAnalytics = await FetchAnalyticsData(client, "firewallEventsAdaptiveGroups", since, until, cancellationToken);
                if (threatAnalytics != null)
                {
                    sensors.AddRange(ParseThreatAnalytics(threatAnalytics, collector));
                }

                // Fetch bandwidth analytics
                var bandwidthAnalytics = await FetchAnalyticsData(client, "httpRequests1dGroups", since, until, cancellationToken, includeBandwidth: true);
                if (bandwidthAnalytics != null)
                {
                    sensors.AddRange(ParseBandwidthAnalytics(bandwidthAnalytics, collector));
                }
            }
            catch (HttpRequestException ex)
            {
                Console.WriteLine($"Cloudflare API request failed: {ex.Message}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Cloudflare collector error: {ex.Message}");
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
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _apiToken);
                client.DefaultRequestHeaders.Add("User-Agent", "JunctionRelay-Cloudflare-Collector");

                var response = await client.GetAsync($"https://api.cloudflare.com/client/v4/zones/{_zoneId}", cancellationToken);
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

        private async Task<JObject?> FetchZoneInfo(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                var response = await client.GetAsync($"https://api.cloudflare.com/client/v4/zones/{_zoneId}", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    var result = JObject.Parse(json);
                    return result["result"] as JObject;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch zone info: {ex.Message}");
            }
            return null;
        }

        private async Task<JObject?> FetchAnalyticsData(HttpClient client, string dataset, DateTime since, DateTime until, CancellationToken cancellationToken, bool includeBandwidth = false)
        {
            try
            {
                var sinceStr = since.ToString("yyyy-MM-ddTHH:mm:ssZ");
                var untilStr = until.ToString("yyyy-MM-ddTHH:mm:ssZ");

                var url = $"https://api.cloudflare.com/client/v4/graphql";

                string query;
                if (dataset == "httpRequests1dGroups" && includeBandwidth)
                {
                    query = $@"{{
                        viewer {{
                            zones(filter: {{zoneTag: ""{_zoneId}""}}) {{
                                {dataset}(
                                    limit: 1000,
                                    filter: {{
                                        datetime_geq: ""{sinceStr}"",
                                        datetime_leq: ""{untilStr}""
                                    }}
                                ) {{
                                    sum {{
                                        bytes
                                        cachedBytes
                                    }}
                                }}
                            }}
                        }}
                    }}";
                }
                else if (dataset == "httpRequests1dGroups")
                {
                    query = $@"{{
                        viewer {{
                            zones(filter: {{zoneTag: ""{_zoneId}""}}) {{
                                {dataset}(
                                    limit: 1000,
                                    filter: {{
                                        datetime_geq: ""{sinceStr}"",
                                        datetime_leq: ""{untilStr}""
                                    }}
                                ) {{
                                    sum {{
                                        requests
                                        cachedRequests
                                        uncachedRequests
                                    }}
                                    uniq {{
                                        uniques
                                    }}
                                }}
                            }}
                        }}
                    }}";
                }
                else
                {
                    query = $@"{{
                        viewer {{
                            zones(filter: {{zoneTag: ""{_zoneId}""}}) {{
                                {dataset}(
                                    limit: 1000,
                                    filter: {{
                                        datetime_geq: ""{sinceStr}"",
                                        datetime_leq: ""{untilStr}""
                                    }}
                                ) {{
                                    sum {{
                                        count
                                    }}
                                }}
                            }}
                        }}
                    }}";
                }

                var requestBody = new { query = query };
                var content = new StringContent(System.Text.Json.JsonSerializer.Serialize(requestBody), System.Text.Encoding.UTF8, "application/json");

                var response = await client.PostAsync(url, content, cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JObject.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch analytics data for {dataset}: {ex.Message}");
            }
            return null;
        }

        private List<Model_Sensor> ParseZoneInfo(JObject zoneInfo, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var zoneName = zoneInfo["name"]?.ToString() ?? "Unknown";

            // Zone status
            var status = zoneInfo["status"]?.ToString() ?? "unknown";
            sensors.Add(new Model_Sensor
            {
                ExternalId = $"cloudflare_zone_status_{_zoneId}",
                Name = "Zone Status",
                Value = status,
                Unit = "status",
                DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(status),
                Category = "Cloudflare Zone",
                DeviceName = collector.Name,
                SensorType = "API",
                SensorTag = "zone_status",
                ComponentName = zoneName,
                JunctionId = null,
                DeviceId = null,
                CollectorId = collector.Id,
                LastUpdated = DateTime.UtcNow
            });

            // Development mode
            var devMode = zoneInfo["development_mode"]?.ToString() ?? "0";
            string devModeValue = devMode == "0" ? "0" : "1";
            sensors.Add(new Model_Sensor
            {
                ExternalId = $"cloudflare_dev_mode_{_zoneId}",
                Name = "Development Mode",
                Value = devModeValue,
                Unit = "boolean",
                DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(devModeValue),
                Category = "Cloudflare Zone",
                DeviceName = collector.Name,
                SensorType = "API",
                SensorTag = "dev_mode",
                ComponentName = zoneName,
                JunctionId = null,
                DeviceId = null,
                CollectorId = collector.Id,
                LastUpdated = DateTime.UtcNow
            });

            return sensors;
        }

        private List<Model_Sensor> ParseHttpAnalytics(JObject analyticsData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();

            try
            {
                var zones = analyticsData["data"]?["viewer"]?["zones"] as JArray;
                if (zones?.Count > 0)
                {
                    var zone = zones[0];
                    var httpRequests = zone["httpRequests1dGroups"] as JArray;

                    if (httpRequests?.Count > 0)
                    {
                        var totals = httpRequests[0];
                        var sum = totals["sum"];
                        var uniq = totals["uniq"];

                        // Total requests
                        var totalRequests = sum?["requests"]?.ToString() ?? "0";
                        sensors.Add(new Model_Sensor
                        {
                            ExternalId = $"cloudflare_total_requests_{_zoneId}",
                            Name = "Total Requests (24h)",
                            Value = totalRequests,
                            Unit = "requests",
                            DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(totalRequests),
                            Category = "Cloudflare Analytics",
                            DeviceName = collector.Name,
                            SensorType = "API",
                            SensorTag = "total_requests",
                            ComponentName = "HTTP Analytics",
                            JunctionId = null,
                            DeviceId = null,
                            CollectorId = collector.Id,
                            LastUpdated = DateTime.UtcNow
                        });

                        // Cached requests
                        var cachedRequests = sum?["cachedRequests"]?.ToString() ?? "0";
                        sensors.Add(new Model_Sensor
                        {
                            ExternalId = $"cloudflare_cached_requests_{_zoneId}",
                            Name = "Cached Requests (24h)",
                            Value = cachedRequests,
                            Unit = "requests",
                            DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(cachedRequests),
                            Category = "Cloudflare Analytics",
                            DeviceName = collector.Name,
                            SensorType = "API",
                            SensorTag = "cached_requests",
                            ComponentName = "HTTP Analytics",
                            JunctionId = null,
                            DeviceId = null,
                            CollectorId = collector.Id,
                            LastUpdated = DateTime.UtcNow
                        });

                        // Uncached requests
                        var uncachedRequests = sum?["uncachedRequests"]?.ToString() ?? "0";
                        sensors.Add(new Model_Sensor
                        {
                            ExternalId = $"cloudflare_uncached_requests_{_zoneId}",
                            Name = "Uncached Requests (24h)",
                            Value = uncachedRequests,
                            Unit = "requests",
                            DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(uncachedRequests),
                            Category = "Cloudflare Analytics",
                            DeviceName = collector.Name,
                            SensorType = "API",
                            SensorTag = "uncached_requests",
                            ComponentName = "HTTP Analytics",
                            JunctionId = null,
                            DeviceId = null,
                            CollectorId = collector.Id,
                            LastUpdated = DateTime.UtcNow
                        });

                        // Unique visitors
                        var uniqueVisitors = uniq?["uniques"]?.ToString() ?? "0";
                        sensors.Add(new Model_Sensor
                        {
                            ExternalId = $"cloudflare_unique_visitors_{_zoneId}",
                            Name = "Unique Visitors (24h)",
                            Value = uniqueVisitors,
                            Unit = "visitors",
                            DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(uniqueVisitors),
                            Category = "Cloudflare Analytics",
                            DeviceName = collector.Name,
                            SensorType = "API",
                            SensorTag = "unique_visitors",
                            ComponentName = "HTTP Analytics",
                            JunctionId = null,
                            DeviceId = null,
                            CollectorId = collector.Id,
                            LastUpdated = DateTime.UtcNow
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error parsing HTTP analytics: {ex.Message}");
            }

            return sensors;
        }

        private List<Model_Sensor> ParseThreatAnalytics(JObject analyticsData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();

            try
            {
                var zones = analyticsData["data"]?["viewer"]?["zones"] as JArray;
                if (zones?.Count > 0)
                {
                    var zone = zones[0];
                    var firewallEvents = zone["firewallEventsAdaptiveGroups"] as JArray;

                    if (firewallEvents?.Count > 0)
                    {
                        var totals = firewallEvents[0];
                        var sum = totals["sum"];

                        // Threats blocked
                        var threatsBlocked = sum?["count"]?.ToString() ?? "0";
                        sensors.Add(new Model_Sensor
                        {
                            ExternalId = $"cloudflare_threats_blocked_{_zoneId}",
                            Name = "Threats Blocked (24h)",
                            Value = threatsBlocked,
                            Unit = "threats",
                            DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(threatsBlocked),
                            Category = "Cloudflare Security",
                            DeviceName = collector.Name,
                            SensorType = "API",
                            SensorTag = "threats_blocked",
                            ComponentName = "Security Analytics",
                            JunctionId = null,
                            DeviceId = null,
                            CollectorId = collector.Id,
                            LastUpdated = DateTime.UtcNow
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error parsing threat analytics: {ex.Message}");
            }

            return sensors;
        }

        private List<Model_Sensor> ParseBandwidthAnalytics(JObject analyticsData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();

            try
            {
                var zones = analyticsData["data"]?["viewer"]?["zones"] as JArray;
                if (zones?.Count > 0)
                {
                    var zone = zones[0];
                    var httpRequests = zone["httpRequests1dGroups"] as JArray;

                    if (httpRequests?.Count > 0)
                    {
                        var totals = httpRequests[0];
                        var sum = totals["sum"];

                        // Total bandwidth
                        var totalBytes = sum?["bytes"]?.ToObject<long>() ?? 0;
                        var totalMB = totalBytes / (1024.0 * 1024.0);
                        var (totalMBValue, totalMBDecimals) = Helper_DataCollector.SanitizeSensorValue(totalMB, 2);
                        sensors.Add(new Model_Sensor
                        {
                            ExternalId = $"cloudflare_total_bandwidth_{_zoneId}",
                            Name = "Total Bandwidth (24h)",
                            Value = totalMBValue,
                            Unit = "MB",
                            DecimalPlaces = totalMBDecimals,
                            Category = "Cloudflare Analytics",
                            DeviceName = collector.Name,
                            SensorType = "API",
                            SensorTag = "total_bandwidth",
                            ComponentName = "Bandwidth Analytics",
                            JunctionId = null,
                            DeviceId = null,
                            CollectorId = collector.Id,
                            LastUpdated = DateTime.UtcNow
                        });

                        // Cached bandwidth
                        var cachedBytes = sum?["cachedBytes"]?.ToObject<long>() ?? 0;
                        var cachedMB = cachedBytes / (1024.0 * 1024.0);
                        var (cachedMBValue, cachedMBDecimals) = Helper_DataCollector.SanitizeSensorValue(cachedMB, 2);
                        sensors.Add(new Model_Sensor
                        {
                            ExternalId = $"cloudflare_cached_bandwidth_{_zoneId}",
                            Name = "Cached Bandwidth (24h)",
                            Value = cachedMBValue,
                            Unit = "MB",
                            DecimalPlaces = cachedMBDecimals,
                            Category = "Cloudflare Analytics",
                            DeviceName = collector.Name,
                            SensorType = "API",
                            SensorTag = "cached_bandwidth",
                            ComponentName = "Bandwidth Analytics",
                            JunctionId = null,
                            DeviceId = null,
                            CollectorId = collector.Id,
                            LastUpdated = DateTime.UtcNow
                        });

                        // Cache hit ratio
                        if (totalBytes > 0)
                        {
                            var cacheHitRatio = (cachedBytes / (double)totalBytes) * 100;
                            var (cacheHitRatioValue, cacheHitRatioDecimals) = Helper_DataCollector.SanitizeSensorValue(cacheHitRatio, 1);
                            sensors.Add(new Model_Sensor
                            {
                                ExternalId = $"cloudflare_cache_hit_ratio_{_zoneId}",
                                Name = "Cache Hit Ratio (24h)",
                                Value = cacheHitRatioValue,
                                Unit = "%",
                                DecimalPlaces = cacheHitRatioDecimals,
                                Category = "Cloudflare Analytics",
                                DeviceName = collector.Name,
                                SensorType = "API",
                                SensorTag = "cache_hit_ratio",
                                ComponentName = "Bandwidth Analytics",
                                JunctionId = null,
                                DeviceId = null,
                                CollectorId = collector.Id,
                                LastUpdated = DateTime.UtcNow
                            });
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error parsing bandwidth analytics: {ex.Message}");
            }

            return sensors;
        }
    }
}