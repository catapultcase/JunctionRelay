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
    public class DataCollector_Github : IDataCollector
    {
        public int CollectorId { get; private set; }

        public string CollectorName => "Github";

        private string _baseUrl = string.Empty;
        private string _accessToken = string.Empty;
        private string _owner = string.Empty;
        private string _repo = string.Empty;

        public void ApplyConfiguration(Model_Collector collector)
        {
            _baseUrl = collector.URL?.TrimEnd('/')
                ?? throw new ArgumentException("Collector.URL is required.");
            _accessToken = collector.DecryptedAccessToken
                ?? throw new ArgumentException("Collector.AccessToken is required.");

            // Parse owner and repo from URL
            // Expected format: https://github.com/{owner}/{repo} or https://api.github.com/repos/{owner}/{repo}
            var uri = new Uri(_baseUrl);
            var pathSegments = uri.AbsolutePath.Trim('/').Split('/');

            if (pathSegments.Length >= 2)
            {
                if (pathSegments[0] == "repos" && pathSegments.Length >= 3)
                {
                    // API URL format: https://api.github.com/repos/{owner}/{repo}
                    _owner = pathSegments[1];
                    _repo = pathSegments[2];
                }
                else
                {
                    // Regular GitHub URL format: https://github.com/{owner}/{repo}
                    _owner = pathSegments[0];
                    _repo = pathSegments[1];
                }
            }
            else
            {
                throw new ArgumentException("Invalid GitHub URL format. Expected: https://github.com/{owner}/{repo}");
            }

            // Set the CollectorId from the Model_Collector.
            CollectorId = collector.Id;
        }

        public async Task<List<Model_Sensor>> FetchSensorsAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);
            var sensors = new List<Model_Sensor>();

            using var client = new HttpClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
            client.DefaultRequestHeaders.Add("User-Agent", "JunctionRelay-Github-Collector");

            try
            {
                // Fetch views data
                var viewsData = await FetchTrafficData(client, "views", cancellationToken);
                if (viewsData != null)
                {
                    sensors.AddRange(ParseViewsData(viewsData, collector));
                }

                // Fetch clones data
                var clonesData = await FetchTrafficData(client, "clones", cancellationToken);
                if (clonesData != null)
                {
                    sensors.AddRange(ParseClonesData(clonesData, collector));
                }

                // Fetch popular paths
                var pathsData = await FetchTrafficData(client, "popular/paths", cancellationToken);
                if (pathsData != null)
                {
                    sensors.AddRange(ParsePopularPathsData(pathsData, collector));
                }

                // Fetch popular referrers
                var referrersData = await FetchTrafficData(client, "popular/referrers", cancellationToken);
                if (referrersData != null)
                {
                    sensors.AddRange(ParsePopularReferrersData(referrersData, collector));
                }
            }
            catch (HttpRequestException ex)
            {
                // Log the error but don't throw - return empty list instead
                Console.WriteLine($"GitHub API request failed: {ex.Message}");
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
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
                client.DefaultRequestHeaders.Add("User-Agent", "JunctionRelay-Github-Collector");

                var response = await client.GetAsync($"https://api.github.com/repos/{_owner}/{_repo}", cancellationToken);
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

        private async Task<JObject?> FetchTrafficData(HttpClient client, string endpoint, CancellationToken cancellationToken)
        {
            try
            {
                var response = await client.GetAsync($"https://api.github.com/repos/{_owner}/{_repo}/traffic/{endpoint}", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JObject.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch {endpoint}: {ex.Message}");
            }
            return null;
        }

        private List<Model_Sensor> ParseViewsData(JObject viewsData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();

            // Total views
            var totalViews = viewsData["count"]?.ToString() ?? "0";
            sensors.Add(new Model_Sensor
            {
                ExternalId = $"github_views_total_{_owner}_{_repo}",
                Name = "Total Views",
                Value = totalViews,
                Unit = "views",
                Category = "GitHub Traffic",
                DeviceName = collector.Name,
                SensorType = "API",
                SensorTag = "total_views",
                ComponentName = $"{_owner}/{_repo}",
                JunctionId = null,
                DeviceId = null,
                CollectorId = collector.Id,
                LastUpdated = DateTime.UtcNow
            });

            // Unique views
            var uniqueViews = viewsData["uniques"]?.ToString() ?? "0";
            sensors.Add(new Model_Sensor
            {
                ExternalId = $"github_views_unique_{_owner}_{_repo}",
                Name = "Unique Views",
                Value = uniqueViews,
                Unit = "visitors",
                Category = "GitHub Traffic",
                DeviceName = collector.Name,
                SensorType = "API",
                SensorTag = "unique_views",
                ComponentName = $"{_owner}/{_repo}",
                JunctionId = null,
                DeviceId = null,
                CollectorId = collector.Id,
                LastUpdated = DateTime.UtcNow
            });

            return sensors;
        }

        private List<Model_Sensor> ParseClonesData(JObject clonesData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();

            // Total clones
            var totalClones = clonesData["count"]?.ToString() ?? "0";
            sensors.Add(new Model_Sensor
            {
                ExternalId = $"github_clones_total_{_owner}_{_repo}",
                Name = "Total Clones",
                Value = totalClones,
                Unit = "clones",
                Category = "GitHub Traffic",
                DeviceName = collector.Name,
                SensorType = "API",
                SensorTag = "total_clones",
                ComponentName = $"{_owner}/{_repo}",
                JunctionId = null,
                DeviceId = null,
                CollectorId = collector.Id,
                LastUpdated = DateTime.UtcNow
            });

            // Unique clones
            var uniqueClones = clonesData["uniques"]?.ToString() ?? "0";
            sensors.Add(new Model_Sensor
            {
                ExternalId = $"github_clones_unique_{_owner}_{_repo}",
                Name = "Unique Clones",
                Value = uniqueClones,
                Unit = "unique_clones",
                Category = "GitHub Traffic",
                DeviceName = collector.Name,
                SensorType = "API",
                SensorTag = "unique_clones",
                ComponentName = $"{_owner}/{_repo}",
                JunctionId = null,
                DeviceId = null,
                CollectorId = collector.Id,
                LastUpdated = DateTime.UtcNow
            });

            return sensors;
        }

        private List<Model_Sensor> ParsePopularPathsData(JObject pathsData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var paths = pathsData["paths"] as JArray;

            if (paths != null)
            {
                var index = 0;
                foreach (var path in paths.Take(5)) // Top 5 paths
                {
                    var pathName = path["path"]?.ToString() ?? "unknown";
                    var pathCount = path["count"]?.ToString() ?? "0";
                    var pathUniques = path["uniques"]?.ToString() ?? "0";

                    sensors.Add(new Model_Sensor
                    {
                        ExternalId = $"github_path_{index}_{_owner}_{_repo}",
                        Name = $"Path: {pathName}",
                        Value = pathCount,
                        Unit = "views",
                        Category = "GitHub Popular Paths",
                        DeviceName = collector.Name,
                        SensorType = "API",
                        SensorTag = $"popular_path_{index}",
                        ComponentName = $"{_owner}/{_repo}",
                        JunctionId = null,
                        DeviceId = null,
                        CollectorId = collector.Id,
                        LastUpdated = DateTime.UtcNow
                    });

                    index++;
                }
            }

            return sensors;
        }

        private List<Model_Sensor> ParsePopularReferrersData(JObject referrersData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var referrers = referrersData["referrers"] as JArray;

            if (referrers != null)
            {
                var index = 0;
                foreach (var referrer in referrers.Take(5)) // Top 5 referrers
                {
                    var referrerName = referrer["referrer"]?.ToString() ?? "unknown";
                    var referrerCount = referrer["count"]?.ToString() ?? "0";
                    var referrerUniques = referrer["uniques"]?.ToString() ?? "0";

                    sensors.Add(new Model_Sensor
                    {
                        ExternalId = $"github_referrer_{index}_{_owner}_{_repo}",
                        Name = $"Referrer: {referrerName}",
                        Value = referrerCount,
                        Unit = "views",
                        Category = "GitHub Popular Referrers",
                        DeviceName = collector.Name,
                        SensorType = "API",
                        SensorTag = $"popular_referrer_{index}",
                        ComponentName = $"{_owner}/{_repo}",
                        JunctionId = null,
                        DeviceId = null,
                        CollectorId = collector.Id,
                        LastUpdated = DateTime.UtcNow
                    });

                    index++;
                }
            }

            return sensors;
        }
    }
}