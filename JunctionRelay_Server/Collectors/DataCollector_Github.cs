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

        // Helper method to detect decimal places in a value
        private int GetDecimalPlaces(string value)
        {
            // Handle null or empty values
            if (string.IsNullOrEmpty(value))
                return 0;

            // Try to parse as decimal to validate it's a numeric value
            if (!decimal.TryParse(value, out decimal numericValue))
                return 0; // Non-numeric values (including "N/A") have 0 decimal places

            // Convert to string to analyze decimal places
            string valueStr = numericValue.ToString();

            // Find the decimal point
            int decimalIndex = valueStr.IndexOf('.');
            if (decimalIndex == -1)
                return 0; // No decimal point found

            // Count digits after decimal point
            return valueStr.Length - decimalIndex - 1;
        }

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
                // Repository basic information
                var repoData = await FetchRepositoryData(client, cancellationToken);
                if (repoData != null)
                {
                    sensors.AddRange(ParseRepositoryData(repoData, collector));
                }

                // Traffic data
                var viewsData = await FetchTrafficData(client, "views", cancellationToken);
                if (viewsData != null)
                {
                    sensors.AddRange(ParseViewsData(viewsData, collector));
                }

                var clonesData = await FetchTrafficData(client, "clones", cancellationToken);
                if (clonesData != null)
                {
                    sensors.AddRange(ParseClonesData(clonesData, collector));
                }

                var pathsData = await FetchTrafficData(client, "popular/paths", cancellationToken);
                if (pathsData != null)
                {
                    sensors.AddRange(ParsePopularPathsData(pathsData, collector));
                }

                var referrersData = await FetchTrafficData(client, "popular/referrers", cancellationToken);
                if (referrersData != null)
                {
                    sensors.AddRange(ParsePopularReferrersData(referrersData, collector));
                }

                // Issues and Pull Requests
                var issuesData = await FetchIssuesData(client, cancellationToken);
                if (issuesData != null)
                {
                    sensors.AddRange(ParseIssuesData(issuesData, collector));
                }

                var pullRequestsData = await FetchPullRequestsData(client, cancellationToken);
                if (pullRequestsData != null)
                {
                    sensors.AddRange(ParsePullRequestsData(pullRequestsData, collector));
                }

                // Releases
                var releasesData = await FetchReleasesData(client, cancellationToken);
                if (releasesData != null)
                {
                    sensors.AddRange(ParseReleasesData(releasesData, collector));
                }

                // Contributors
                var contributorsData = await FetchContributorsData(client, cancellationToken);
                if (contributorsData != null)
                {
                    sensors.AddRange(ParseContributorsData(contributorsData, collector));
                }

                // Languages
                var languagesData = await FetchLanguagesData(client, cancellationToken);
                if (languagesData != null)
                {
                    sensors.AddRange(ParseLanguagesData(languagesData, collector));
                }

                // Commits (recent activity)
                var commitsData = await FetchCommitsData(client, cancellationToken);
                if (commitsData != null)
                {
                    sensors.AddRange(ParseCommitsData(commitsData, collector));
                }

                // Forks
                var forksData = await FetchForksData(client, cancellationToken);
                if (forksData != null)
                {
                    sensors.AddRange(ParseForksData(forksData, collector));
                }

                // Stargazers
                var stargazersData = await FetchStargazersData(client, cancellationToken);
                if (stargazersData != null)
                {
                    sensors.AddRange(ParseStargazersData(stargazersData, collector));
                }

                // Watchers/Subscribers
                var watchersData = await FetchWatchersData(client, cancellationToken);
                if (watchersData != null)
                {
                    sensors.AddRange(ParseWatchersData(watchersData, collector));
                }

                // Branches
                var branchesData = await FetchBranchesData(client, cancellationToken);
                if (branchesData != null)
                {
                    sensors.AddRange(ParseBranchesData(branchesData, collector));
                }

                // Tags
                var tagsData = await FetchTagsData(client, cancellationToken);
                if (tagsData != null)
                {
                    sensors.AddRange(ParseTagsData(tagsData, collector));
                }

                // Workflows (GitHub Actions)
                var workflowsData = await FetchWorkflowsData(client, cancellationToken);
                if (workflowsData != null)
                {
                    sensors.AddRange(ParseWorkflowsData(workflowsData, collector));
                }

                // Security alerts (if accessible)
                var securityData = await FetchSecurityData(client, cancellationToken);
                if (securityData != null)
                {
                    sensors.AddRange(ParseSecurityData(securityData, collector));
                }

                // Milestones
                var milestonesData = await FetchMilestonesData(client, cancellationToken);
                if (milestonesData != null)
                {
                    sensors.AddRange(ParseMilestonesData(milestonesData, collector));
                }

                // Projects
                var projectsData = await FetchProjectsData(client, cancellationToken);
                if (projectsData != null)
                {
                    sensors.AddRange(ParseProjectsData(projectsData, collector));
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

        // Data fetching methods
        private async Task<JObject?> FetchRepositoryData(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                var response = await client.GetAsync($"https://api.github.com/repos/{_owner}/{_repo}", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JObject.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch repository data: {ex.Message}");
            }
            return null;
        }

        private async Task<JObject?> FetchTrafficData(HttpClient client, string endpoint, CancellationToken cancellationToken)
        {
            try
            {
                var response = await client.GetAsync($"https://api.github.com/repos/{_owner}/{_repo}/traffic/{endpoint}", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);

                    // Handle endpoints that return arrays (popular/paths, popular/referrers)
                    if (endpoint == "popular/paths")
                    {
                        var pathsArray = JArray.Parse(json);
                        return new JObject { ["paths"] = pathsArray };
                    }
                    else if (endpoint == "popular/referrers")
                    {
                        var referrersArray = JArray.Parse(json);
                        return new JObject { ["referrers"] = referrersArray };
                    }
                    else
                    {
                        // Handle endpoints that return objects (views, clones)
                        return JObject.Parse(json);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch {endpoint}: {ex.Message}");
            }
            return null;
        }

        private async Task<JArray?> FetchIssuesData(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                var response = await client.GetAsync($"https://api.github.com/repos/{_owner}/{_repo}/issues?state=all&per_page=100", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JArray.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch issues: {ex.Message}");
            }
            return null;
        }

        private async Task<JArray?> FetchPullRequestsData(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                var response = await client.GetAsync($"https://api.github.com/repos/{_owner}/{_repo}/pulls?state=all&per_page=100", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JArray.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch pull requests: {ex.Message}");
            }
            return null;
        }

        private async Task<JArray?> FetchReleasesData(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                var response = await client.GetAsync($"https://api.github.com/repos/{_owner}/{_repo}/releases", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JArray.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch releases: {ex.Message}");
            }
            return null;
        }

        private async Task<JArray?> FetchContributorsData(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                var response = await client.GetAsync($"https://api.github.com/repos/{_owner}/{_repo}/contributors", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JArray.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch contributors: {ex.Message}");
            }
            return null;
        }

        private async Task<JObject?> FetchLanguagesData(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                var response = await client.GetAsync($"https://api.github.com/repos/{_owner}/{_repo}/languages", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JObject.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch languages: {ex.Message}");
            }
            return null;
        }

        private async Task<JArray?> FetchCommitsData(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                var since = DateTime.UtcNow.AddDays(-30).ToString("yyyy-MM-ddTHH:mm:ssZ");
                var response = await client.GetAsync($"https://api.github.com/repos/{_owner}/{_repo}/commits?since={since}&per_page=100", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JArray.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch commits: {ex.Message}");
            }
            return null;
        }

        private async Task<JArray?> FetchForksData(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                var response = await client.GetAsync($"https://api.github.com/repos/{_owner}/{_repo}/forks?per_page=100", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JArray.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch forks: {ex.Message}");
            }
            return null;
        }

        private async Task<JArray?> FetchStargazersData(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                var response = await client.GetAsync($"https://api.github.com/repos/{_owner}/{_repo}/stargazers?per_page=100", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JArray.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch stargazers: {ex.Message}");
            }
            return null;
        }

        private async Task<JArray?> FetchWatchersData(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                var response = await client.GetAsync($"https://api.github.com/repos/{_owner}/{_repo}/subscribers?per_page=100", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JArray.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch watchers: {ex.Message}");
            }
            return null;
        }

        private async Task<JArray?> FetchBranchesData(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                var response = await client.GetAsync($"https://api.github.com/repos/{_owner}/{_repo}/branches", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JArray.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch branches: {ex.Message}");
            }
            return null;
        }

        private async Task<JArray?> FetchTagsData(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                var response = await client.GetAsync($"https://api.github.com/repos/{_owner}/{_repo}/tags", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JArray.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch tags: {ex.Message}");
            }
            return null;
        }

        private async Task<JObject?> FetchWorkflowsData(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                var response = await client.GetAsync($"https://api.github.com/repos/{_owner}/{_repo}/actions/workflows", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JObject.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch workflows: {ex.Message}");
            }
            return null;
        }

        private async Task<JObject?> FetchSecurityData(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                var response = await client.GetAsync($"https://api.github.com/repos/{_owner}/{_repo}/vulnerability-alerts", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JObject.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch security data: {ex.Message}");
            }
            return null;
        }

        private async Task<JArray?> FetchMilestonesData(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                var response = await client.GetAsync($"https://api.github.com/repos/{_owner}/{_repo}/milestones?state=all", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JArray.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch milestones: {ex.Message}");
            }
            return null;
        }

        private async Task<JArray?> FetchProjectsData(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                var response = await client.GetAsync($"https://api.github.com/repos/{_owner}/{_repo}/projects", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JArray.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch projects: {ex.Message}");
            }
            return null;
        }

        // Data parsing methods
        private List<Model_Sensor> ParseRepositoryData(JObject repoData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var now = DateTime.UtcNow;

            // Basic repository metrics
            sensors.Add(CreateSensor($"github_stars_{_owner}_{_repo}", "Stars",
                repoData["stargazers_count"]?.ToString() ?? "0", "stars", "GitHub Repository", collector, now));

            sensors.Add(CreateSensor($"github_forks_{_owner}_{_repo}", "Forks",
                repoData["forks_count"]?.ToString() ?? "0", "forks", "GitHub Repository", collector, now));

            sensors.Add(CreateSensor($"github_watchers_{_owner}_{_repo}", "Watchers",
                repoData["watchers_count"]?.ToString() ?? "0", "watchers", "GitHub Repository", collector, now));

            sensors.Add(CreateSensor($"github_size_{_owner}_{_repo}", "Repository Size",
                repoData["size"]?.ToString() ?? "0", "KB", "GitHub Repository", collector, now));

            sensors.Add(CreateSensor($"github_open_issues_{_owner}_{_repo}", "Open Issues",
                repoData["open_issues_count"]?.ToString() ?? "0", "issues", "GitHub Repository", collector, now));

            sensors.Add(CreateSensor($"github_is_private_{_owner}_{_repo}", "Is Private",
                repoData["private"]?.ToString() ?? "false", "boolean", "GitHub Repository", collector, now));

            sensors.Add(CreateSensor($"github_is_fork_{_owner}_{_repo}", "Is Fork",
                repoData["fork"]?.ToString() ?? "false", "boolean", "GitHub Repository", collector, now));

            sensors.Add(CreateSensor($"github_is_archived_{_owner}_{_repo}", "Is Archived",
                repoData["archived"]?.ToString() ?? "false", "boolean", "GitHub Repository", collector, now));

            sensors.Add(CreateSensor($"github_default_branch_{_owner}_{_repo}", "Default Branch",
                repoData["default_branch"]?.ToString() ?? "main", "branch", "GitHub Repository", collector, now));

            var createdAt = repoData["created_at"]?.ToString();
            if (DateTime.TryParse(createdAt, out var created))
            {
                var daysOld = (DateTime.UtcNow - created).Days;
                sensors.Add(CreateSensor($"github_age_days_{_owner}_{_repo}", "Repository Age",
                    daysOld.ToString(), "days", "GitHub Repository", collector, now));
            }

            var pushedAt = repoData["pushed_at"]?.ToString();
            if (DateTime.TryParse(pushedAt, out var pushed))
            {
                var daysSincePush = (DateTime.UtcNow - pushed).Days;
                sensors.Add(CreateSensor($"github_days_since_push_{_owner}_{_repo}", "Days Since Last Push",
                    daysSincePush.ToString(), "days", "GitHub Repository", collector, now));
            }

            return sensors;
        }

        private List<Model_Sensor> ParseViewsData(JObject viewsData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var now = DateTime.UtcNow;

            sensors.Add(CreateSensor($"github_views_total_{_owner}_{_repo}", "Total Views",
                viewsData["count"]?.ToString() ?? "0", "views", "GitHub Traffic", collector, now));

            sensors.Add(CreateSensor($"github_views_unique_{_owner}_{_repo}", "Unique Views",
                viewsData["uniques"]?.ToString() ?? "0", "visitors", "GitHub Traffic", collector, now));

            return sensors;
        }

        private List<Model_Sensor> ParseClonesData(JObject clonesData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var now = DateTime.UtcNow;

            sensors.Add(CreateSensor($"github_clones_total_{_owner}_{_repo}", "Total Clones",
                clonesData["count"]?.ToString() ?? "0", "clones", "GitHub Traffic", collector, now));

            sensors.Add(CreateSensor($"github_clones_unique_{_owner}_{_repo}", "Unique Clones",
                clonesData["uniques"]?.ToString() ?? "0", "unique_clones", "GitHub Traffic", collector, now));

            return sensors;
        }

        private List<Model_Sensor> ParsePopularPathsData(JObject pathsData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var paths = pathsData["paths"] as JArray;
            var now = DateTime.UtcNow;

            if (paths != null)
            {
                var index = 0;
                foreach (var path in paths.Take(10)) // Top 10 paths
                {
                    var pathName = path["path"]?.ToString() ?? "unknown";
                    var pathCount = path["count"]?.ToString() ?? "0";

                    sensors.Add(CreateSensor($"github_path_{index}_{_owner}_{_repo}",
                        $"Path: {pathName}", pathCount, "views", "GitHub Popular Paths", collector, now));
                    index++;
                }
            }

            return sensors;
        }

        private List<Model_Sensor> ParsePopularReferrersData(JObject referrersData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var referrers = referrersData["referrers"] as JArray;
            var now = DateTime.UtcNow;

            if (referrers != null)
            {
                var index = 0;
                foreach (var referrer in referrers.Take(10)) // Top 10 referrers
                {
                    var referrerName = referrer["referrer"]?.ToString() ?? "unknown";
                    var referrerCount = referrer["count"]?.ToString() ?? "0";

                    sensors.Add(CreateSensor($"github_referrer_{index}_{_owner}_{_repo}",
                        $"Referrer: {referrerName}", referrerCount, "views", "GitHub Popular Referrers", collector, now));
                    index++;
                }
            }

            return sensors;
        }

        private List<Model_Sensor> ParseIssuesData(JArray issuesData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var now = DateTime.UtcNow;

            var openIssues = issuesData.Count(issue => issue["state"]?.ToString() == "open" && issue["pull_request"] == null);
            var closedIssues = issuesData.Count(issue => issue["state"]?.ToString() == "closed" && issue["pull_request"] == null);

            sensors.Add(CreateSensor($"github_issues_open_{_owner}_{_repo}", "Open Issues",
                openIssues.ToString(), "issues", "GitHub Issues", collector, now));

            sensors.Add(CreateSensor($"github_issues_closed_{_owner}_{_repo}", "Closed Issues",
                closedIssues.ToString(), "issues", "GitHub Issues", collector, now));

            return sensors;
        }

        private List<Model_Sensor> ParsePullRequestsData(JArray pullRequestsData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var now = DateTime.UtcNow;

            var openPRs = pullRequestsData.Count(pr => pr["state"]?.ToString() == "open");
            var closedPRs = pullRequestsData.Count(pr => pr["state"]?.ToString() == "closed");
            var mergedPRs = pullRequestsData.Count(pr => pr["merged_at"] != null);

            sensors.Add(CreateSensor($"github_prs_open_{_owner}_{_repo}", "Open Pull Requests",
                openPRs.ToString(), "pull_requests", "GitHub Pull Requests", collector, now));

            sensors.Add(CreateSensor($"github_prs_closed_{_owner}_{_repo}", "Closed Pull Requests",
                closedPRs.ToString(), "pull_requests", "GitHub Pull Requests", collector, now));

            sensors.Add(CreateSensor($"github_prs_merged_{_owner}_{_repo}", "Merged Pull Requests",
                mergedPRs.ToString(), "pull_requests", "GitHub Pull Requests", collector, now));

            return sensors;
        }

        private List<Model_Sensor> ParseReleasesData(JArray releasesData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var now = DateTime.UtcNow;

            sensors.Add(CreateSensor($"github_releases_total_{_owner}_{_repo}", "Total Releases",
                releasesData.Count.ToString(), "releases", "GitHub Releases", collector, now));

            var preReleases = releasesData.Count(release => release["prerelease"]?.ToObject<bool>() == true);
            sensors.Add(CreateSensor($"github_releases_prerelease_{_owner}_{_repo}", "Pre-releases",
                preReleases.ToString(), "releases", "GitHub Releases", collector, now));

            var drafts = releasesData.Count(release => release["draft"]?.ToObject<bool>() == true);
            sensors.Add(CreateSensor($"github_releases_draft_{_owner}_{_repo}", "Draft Releases",
                drafts.ToString(), "releases", "GitHub Releases", collector, now));

            // Latest release info
            var latestRelease = releasesData.FirstOrDefault();
            if (latestRelease != null)
            {
                var publishedAt = latestRelease["published_at"]?.ToString();
                if (DateTime.TryParse(publishedAt, out var published))
                {
                    var daysSinceRelease = (DateTime.UtcNow - published).Days;
                    sensors.Add(CreateSensor($"github_days_since_release_{_owner}_{_repo}", "Days Since Latest Release",
                        daysSinceRelease.ToString(), "days", "GitHub Releases", collector, now));
                }

                var assets = latestRelease["assets"] as JArray;
                var downloadCount = assets?.Sum(asset => asset["download_count"]?.ToObject<int>() ?? 0) ?? 0;
                sensors.Add(CreateSensor($"github_latest_release_downloads_{_owner}_{_repo}", "Latest Release Downloads",
                    downloadCount.ToString(), "downloads", "GitHub Releases", collector, now));
            }

            return sensors;
        }

        private List<Model_Sensor> ParseContributorsData(JArray contributorsData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var now = DateTime.UtcNow;

            sensors.Add(CreateSensor($"github_contributors_total_{_owner}_{_repo}", "Total Contributors",
                contributorsData.Count.ToString(), "contributors", "GitHub Contributors", collector, now));

            // Top contributors by commits
            var index = 0;
            foreach (var contributor in contributorsData.Take(5))
            {
                var login = contributor["login"]?.ToString() ?? "unknown";
                var contributions = contributor["contributions"]?.ToString() ?? "0";

                sensors.Add(CreateSensor($"github_contributor_{index}_{_owner}_{_repo}",
                    $"Contributor: {login}", contributions, "commits", "GitHub Contributors", collector, now));
                index++;
            }

            return sensors;
        }

        private List<Model_Sensor> ParseLanguagesData(JObject languagesData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var now = DateTime.UtcNow;

            var totalBytes = languagesData.Properties().Sum(p => p.Value?.ToObject<long>() ?? 0);
            sensors.Add(CreateSensor($"github_total_code_bytes_{_owner}_{_repo}", "Total Code Bytes",
                totalBytes.ToString(), "bytes", "GitHub Languages", collector, now));

            var languageCount = languagesData.Properties().Count();
            sensors.Add(CreateSensor($"github_language_count_{_owner}_{_repo}", "Programming Languages",
                languageCount.ToString(), "languages", "GitHub Languages", collector, now));

            // Top languages by bytes
            var topLanguages = languagesData.Properties()
                .OrderByDescending(p => p.Value?.ToObject<long>() ?? 0)
                .Take(5);

            var index = 0;
            foreach (var language in topLanguages)
            {
                var languageBytes = language.Value?.ToObject<long>() ?? 0;
                var percentage = totalBytes > 0 ? (languageBytes * 100.0 / totalBytes) : 0;
                sensors.Add(CreateSensor($"github_language_{index}_{_owner}_{_repo}",
                    $"Language: {language.Name}", percentage.ToString("F1"), "percentage", "GitHub Languages", collector, now));
                index++;
            }

            return sensors;
        }

        private List<Model_Sensor> ParseCommitsData(JArray commitsData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var now = DateTime.UtcNow;

            sensors.Add(CreateSensor($"github_commits_30days_{_owner}_{_repo}", "Commits (Last 30 Days)",
                commitsData.Count.ToString(), "commits", "GitHub Activity", collector, now));

            // Group commits by author
            var commitsByAuthor = commitsData
                .GroupBy(commit => commit["commit"]?["author"]?["email"]?.ToString() ?? "unknown")
                .OrderByDescending(g => g.Count())
                .Take(5);

            var index = 0;
            foreach (var authorGroup in commitsByAuthor)
            {
                sensors.Add(CreateSensor($"github_commits_author_{index}_{_owner}_{_repo}",
                    $"Commits by: {authorGroup.Key}", authorGroup.Count().ToString(), "commits", "GitHub Activity", collector, now));
                index++;
            }

            // Commits by day of week
            var commitsByDay = commitsData
                .GroupBy(commit =>
                {
                    var dateStr = commit["commit"]?["author"]?["date"]?.ToString();
                    return DateTime.TryParse(dateStr, out var date) ? date.DayOfWeek.ToString() : "Unknown";
                })
                .ToDictionary(g => g.Key, g => g.Count());

            foreach (var day in commitsByDay)
            {
                sensors.Add(CreateSensor($"github_commits_{day.Key.ToLower()}_{_owner}_{_repo}",
                    $"Commits on {day.Key}", day.Value.ToString(), "commits", "GitHub Activity", collector, now));
            }

            return sensors;
        }

        private List<Model_Sensor> ParseForksData(JArray forksData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var now = DateTime.UtcNow;

            sensors.Add(CreateSensor($"github_forks_total_{_owner}_{_repo}", "Total Forks",
                forksData.Count.ToString(), "forks", "GitHub Forks", collector, now));

            // Recent forks (last 30 days)
            var thirtyDaysAgo = DateTime.UtcNow.AddDays(-30);
            var recentForks = forksData.Count(fork =>
            {
                var createdAt = fork["created_at"]?.ToString();
                return DateTime.TryParse(createdAt, out var created) && created > thirtyDaysAgo;
            });

            sensors.Add(CreateSensor($"github_forks_30days_{_owner}_{_repo}", "Forks (Last 30 Days)",
                recentForks.ToString(), "forks", "GitHub Forks", collector, now));

            return sensors;
        }

        private List<Model_Sensor> ParseStargazersData(JArray stargazersData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var now = DateTime.UtcNow;

            sensors.Add(CreateSensor($"github_stargazers_total_{_owner}_{_repo}", "Total Stargazers",
                stargazersData.Count.ToString(), "stargazers", "GitHub Engagement", collector, now));

            return sensors;
        }

        private List<Model_Sensor> ParseWatchersData(JArray watchersData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var now = DateTime.UtcNow;

            sensors.Add(CreateSensor($"github_watchers_total_{_owner}_{_repo}", "Total Watchers",
                watchersData.Count.ToString(), "watchers", "GitHub Engagement", collector, now));

            return sensors;
        }

        private List<Model_Sensor> ParseBranchesData(JArray branchesData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var now = DateTime.UtcNow;

            sensors.Add(CreateSensor($"github_branches_total_{_owner}_{_repo}", "Total Branches",
                branchesData.Count.ToString(), "branches", "GitHub Repository", collector, now));

            // Protected branches
            var protectedBranches = branchesData.Count(branch => branch["protected"]?.ToObject<bool>() == true);
            sensors.Add(CreateSensor($"github_branches_protected_{_owner}_{_repo}", "Protected Branches",
                protectedBranches.ToString(), "branches", "GitHub Repository", collector, now));

            return sensors;
        }

        private List<Model_Sensor> ParseTagsData(JArray tagsData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var now = DateTime.UtcNow;

            sensors.Add(CreateSensor($"github_tags_total_{_owner}_{_repo}", "Total Tags",
                tagsData.Count.ToString(), "tags", "GitHub Repository", collector, now));

            return sensors;
        }

        private List<Model_Sensor> ParseWorkflowsData(JObject workflowsData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var now = DateTime.UtcNow;

            var workflows = workflowsData["workflows"] as JArray;
            if (workflows != null)
            {
                sensors.Add(CreateSensor($"github_workflows_total_{_owner}_{_repo}", "Total Workflows",
                    workflows.Count.ToString(), "workflows", "GitHub Actions", collector, now));

                var activeWorkflows = workflows.Count(workflow => workflow["state"]?.ToString() == "active");
                sensors.Add(CreateSensor($"github_workflows_active_{_owner}_{_repo}", "Active Workflows",
                    activeWorkflows.ToString(), "workflows", "GitHub Actions", collector, now));
            }

            return sensors;
        }

        private List<Model_Sensor> ParseSecurityData(JObject securityData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var now = DateTime.UtcNow;

            var totalCount = securityData["total_count"];
            if (totalCount != null)
            {
                sensors.Add(CreateSensor($"github_security_alerts_{_owner}_{_repo}", "Security Alerts",
                    totalCount.ToString(), "alerts", "GitHub Security", collector, now));
            }

            return sensors;
        }

        private List<Model_Sensor> ParseMilestonesData(JArray milestonesData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var now = DateTime.UtcNow;

            sensors.Add(CreateSensor($"github_milestones_total_{_owner}_{_repo}", "Total Milestones",
                milestonesData.Count.ToString(), "milestones", "GitHub Project Management", collector, now));

            var openMilestones = milestonesData.Count(milestone => milestone["state"]?.ToString() == "open");
            sensors.Add(CreateSensor($"github_milestones_open_{_owner}_{_repo}", "Open Milestones",
                openMilestones.ToString(), "milestones", "GitHub Project Management", collector, now));

            var closedMilestones = milestonesData.Count(milestone => milestone["state"]?.ToString() == "closed");
            sensors.Add(CreateSensor($"github_milestones_closed_{_owner}_{_repo}", "Closed Milestones",
                closedMilestones.ToString(), "milestones", "GitHub Project Management", collector, now));

            return sensors;
        }

        private List<Model_Sensor> ParseProjectsData(JArray projectsData, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var now = DateTime.UtcNow;

            sensors.Add(CreateSensor($"github_projects_total_{_owner}_{_repo}", "Total Projects",
                projectsData.Count.ToString(), "projects", "GitHub Project Management", collector, now));

            var openProjects = projectsData.Count(project => project["state"]?.ToString() == "open");
            sensors.Add(CreateSensor($"github_projects_open_{_owner}_{_repo}", "Open Projects",
                openProjects.ToString(), "projects", "GitHub Project Management", collector, now));

            var closedProjects = projectsData.Count(project => project["state"]?.ToString() == "closed");
            sensors.Add(CreateSensor($"github_projects_closed_{_owner}_{_repo}", "Closed Projects",
                closedProjects.ToString(), "projects", "GitHub Project Management", collector, now));

            return sensors;
        }

        // Helper method to create sensors
        private Model_Sensor CreateSensor(string externalId, string name, string value, string unit,
            string category, Model_Collector collector, DateTime lastUpdated)
        {
            return new Model_Sensor
            {
                ExternalId = externalId,
                Name = name,
                Value = value,
                Unit = unit,
                DecimalPlaces = GetDecimalPlaces(value),
                Category = category,
                DeviceName = collector.Name,
                SensorType = "API",
                SensorTag = externalId.Split('_').Last(),
                ComponentName = $"{_owner}/{_repo}",
                JunctionId = null,
                DeviceId = null,
                CollectorId = collector.Id,
                LastUpdated = lastUpdated
            };
        }
    }
}