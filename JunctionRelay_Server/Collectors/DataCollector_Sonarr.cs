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
using System.Text.RegularExpressions;
using System.Globalization;
using System.Text.Json;

namespace JunctionRelayServer.Collectors
{
    public class DataCollector_SonarrCalendar : IDataCollector
    {
        public int CollectorId { get; private set; }

        public string CollectorName => "SonarrCalendar";

        private string _icalFeedUrl = string.Empty;

        public void ApplyConfiguration(Model_Collector collector)
        {
            // The iCal feed URL (with API key) is stored in AccessToken field for security
            // Use DecryptedAccessToken which is automatically decrypted by the secrets service
            _icalFeedUrl = collector.DecryptedAccessToken?.Trim()
                ?? throw new ArgumentException("Collector.DecryptedAccessToken (iCal Feed URL) is required.");

            // Validate that it's a proper URL
            if (!Uri.TryCreate(_icalFeedUrl, UriKind.Absolute, out Uri? uri) ||
                (uri.Scheme != "http" && uri.Scheme != "https"))
            {
                throw new ArgumentException($"Collector.DecryptedAccessToken must be a valid HTTP/HTTPS URL. Received: '{_icalFeedUrl}'");
            }

            CollectorId = collector.Id;
        }

        public async Task<List<Model_Sensor>> FetchSensorsAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);
            var sensors = new List<Model_Sensor>();

            using var client = new HttpClient();
            var response = await client.GetAsync(_icalFeedUrl, cancellationToken);
            response.EnsureSuccessStatusCode();

            var content = await response.Content.ReadAsStringAsync(cancellationToken);

            // Basic validation
            if (!content.Contains("BEGIN:VCALENDAR"))
            {
                throw new InvalidDataException("Response does not appear to be valid iCal content");
            }

            // Parse iCal content and group by date
            var episodesByDate = ParseEpisodesByDate(content);

            // Create one sensor per date
            foreach (var dateGroup in episodesByDate)
            {
                var date = dateGroup.Key;
                var episodes = dateGroup.Value;

                // Create JSON payload for the episodes
                var episodeData = episodes.Select(e => new
                {
                    series = e.SeriesTitle,
                    season = e.Season,
                    episode = e.Episode,
                    airTime = e.AirTimeString,  // UTC time
                    airDateTime = e.AirDateTimeString,  // UTC time with Z suffix
                    description = e.Description
                }).ToList();

                var jsonValue = JsonSerializer.Serialize(episodeData, new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                });

                // Use consistent naming with friendly date
                var sensorName = $"Episodes {date:MMM dd, yyyy}";

                // Always use date-based ExternalId for consistency
                var externalId = $"episodes-{date:yyyy-MM-dd}";

                sensors.Add(new Model_Sensor
                {
                    ExternalId = externalId,
                    Name = sensorName,
                    Value = jsonValue,
                    Unit = "Episodes JSON",
                    DecimalPlaces = 0,
                    Category = "Sonarr Calendar",
                    DeviceName = collector.Name,
                    SensorType = "Data",
                    SensorTag = date.ToString("MMM dd, yyyy"), // Friendly date format
                    ComponentName = $"{episodes.Count} Episodes",
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });
            }

            // Add convenience sensors for Yesterday, Today, Tomorrow, Next 7 Days
            var today = DateTime.Today;
            var yesterday = today.AddDays(-1);
            var tomorrow = today.AddDays(1);

            // Helper function to create convenience sensor
            void CreateConvenienceSensor(DateTime targetDate, string label)
            {
                var targetEpisodes = episodesByDate.ContainsKey(targetDate) ? episodesByDate[targetDate] : new List<EpisodeInfo>();

                var episodeData = targetEpisodes.Select(e => new
                {
                    series = e.SeriesTitle,
                    season = e.Season,
                    episode = e.Episode,
                    airTime = e.AirTimeString,  // UTC time
                    airDateTime = e.AirDateTimeString,  // UTC time with Z suffix
                    description = e.Description
                }).ToList();

                var jsonValue = JsonSerializer.Serialize(episodeData, new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                });

                sensors.Add(new Model_Sensor
                {
                    ExternalId = $"episodes-{label.ToLower()}",
                    Name = $"Episodes {label}",
                    Value = jsonValue,
                    Unit = "Episodes JSON",
                    DecimalPlaces = 0,
                    Category = "Sonarr Calendar",
                    DeviceName = collector.Name,
                    SensorType = "Data",
                    SensorTag = label,
                    ComponentName = $"{targetEpisodes.Count} Episodes",
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });
            }

            // Helper function to create multi-day convenience sensor
            void CreateMultiDaySensor(DateTime startDate, int dayCount, string label)
            {
                var allEpisodes = new List<EpisodeInfo>();

                // Collect all episodes within the date range
                for (int i = 0; i < dayCount; i++)
                {
                    var date = startDate.AddDays(i);
                    if (episodesByDate.ContainsKey(date))
                    {
                        allEpisodes.AddRange(episodesByDate[date]);
                    }
                }

                // Sort by air date/time
                allEpisodes.Sort((e1, e2) =>
                {
                    // First compare by date, then by time
                    if (!e1.AirDate.HasValue && !e2.AirDate.HasValue) return 0;
                    if (!e1.AirDate.HasValue) return 1;
                    if (!e2.AirDate.HasValue) return -1;

                    var dateComparison = e1.AirDate.Value.CompareTo(e2.AirDate.Value);
                    if (dateComparison != 0) return dateComparison;

                    // Same date, compare by time string
                    if (string.IsNullOrEmpty(e1.AirTimeString) && string.IsNullOrEmpty(e2.AirTimeString)) return 0;
                    if (string.IsNullOrEmpty(e1.AirTimeString)) return 1;
                    if (string.IsNullOrEmpty(e2.AirTimeString)) return -1;
                    return string.Compare(e1.AirTimeString, e2.AirTimeString, StringComparison.Ordinal);
                });

                var episodeData = allEpisodes.Select(e => new
                {
                    series = e.SeriesTitle,
                    season = e.Season,
                    episode = e.Episode,
                    airTime = e.AirTimeString,  // UTC time
                    airDateTime = e.AirDateTimeString,  // UTC time with Z suffix
                    description = e.Description
                }).ToList();

                var jsonValue = JsonSerializer.Serialize(episodeData, new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                });

                sensors.Add(new Model_Sensor
                {
                    ExternalId = $"episodes-{label.ToLower().Replace(" ", "-")}",
                    Name = $"Episodes {label}",
                    Value = jsonValue,
                    Unit = "Episodes JSON",
                    DecimalPlaces = 0,
                    Category = "Sonarr Calendar",
                    DeviceName = collector.Name,
                    SensorType = "Data",
                    SensorTag = label,
                    ComponentName = $"{allEpisodes.Count} Episodes",
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });
            }

            CreateConvenienceSensor(yesterday, "Yesterday");
            CreateConvenienceSensor(today, "Today");
            CreateConvenienceSensor(tomorrow, "Tomorrow");
            CreateMultiDaySensor(today, 7, "Next 7 Days");

            return sensors.OrderBy(s => s.ExternalId).ToList();
        }

        private Dictionary<DateTime, List<EpisodeInfo>> ParseEpisodesByDate(string icalContent)
        {
            var episodesByDate = new Dictionary<DateTime, List<EpisodeInfo>>();

            // Split content into events
            var events = icalContent.Split(new[] { "BEGIN:VEVENT" }, StringSplitOptions.RemoveEmptyEntries);

            foreach (var eventContent in events.Skip(1)) // Skip the first split part (header)
            {
                if (!eventContent.Contains("END:VEVENT"))
                    continue;

                var episode = ParseEvent(eventContent);
                if (episode != null && episode.AirDate.HasValue)
                {
                    var dateKey = episode.AirDate.Value.Date;

                    if (!episodesByDate.ContainsKey(dateKey))
                    {
                        episodesByDate[dateKey] = new List<EpisodeInfo>();
                    }

                    episodesByDate[dateKey].Add(episode);
                }
            }

            // Sort episodes within each date by air time
            foreach (var dateGroup in episodesByDate)
            {
                dateGroup.Value.Sort((e1, e2) =>
                {
                    if (string.IsNullOrEmpty(e1.AirTimeString) && string.IsNullOrEmpty(e2.AirTimeString)) return 0;
                    if (string.IsNullOrEmpty(e1.AirTimeString)) return 1;
                    if (string.IsNullOrEmpty(e2.AirTimeString)) return -1;
                    return string.Compare(e1.AirTimeString, e2.AirTimeString, StringComparison.Ordinal);
                });
            }

            return episodesByDate;
        }

        private EpisodeInfo? ParseEvent(string eventContent)
        {
            try
            {
                var episode = new EpisodeInfo();

                // Extract SUMMARY (contains series title and episode info)
                var summaryMatch = Regex.Match(eventContent, @"SUMMARY:(.+)", RegexOptions.Multiline);
                if (summaryMatch.Success)
                {
                    var summary = summaryMatch.Groups[1].Value.Trim();
                    // Parse format like "Series Name - S01E01 - Episode Title"
                    var episodeMatch = Regex.Match(summary, @"^(.+?)\s*-\s*S(\d+)E(\d+)(?:\s*-\s*(.+))?");
                    if (episodeMatch.Success)
                    {
                        episode.SeriesTitle = episodeMatch.Groups[1].Value.Trim();
                        episode.Season = int.Parse(episodeMatch.Groups[2].Value);
                        episode.Episode = int.Parse(episodeMatch.Groups[3].Value);
                        episode.Description = episodeMatch.Groups[4].Success ? episodeMatch.Groups[4].Value.Trim() : "";
                    }
                    else
                    {
                        episode.SeriesTitle = summary; // Fallback
                        episode.Season = 0;
                        episode.Episode = 0;
                        episode.Description = "";
                    }
                }

                // Extract DTSTART (air date/time) - Keep as UTC, no conversion
                var dtStartMatch = Regex.Match(eventContent, @"DTSTART(?:;TZID=([^:]+))?:(\d{8}T?\d{6}Z?)", RegexOptions.Multiline);
                if (dtStartMatch.Success)
                {
                    var dateTimeStr = dtStartMatch.Groups[2].Value;

                    // Extract date and time components DIRECTLY from the string - keep as UTC
                    if (dateTimeStr.Length >= 8) // At least YYYYMMDD
                    {
                        var yearStr = dateTimeStr.Substring(0, 4);
                        var monthStr = dateTimeStr.Substring(4, 2);
                        var dayStr = dateTimeStr.Substring(6, 2);

                        // Parse date components
                        if (int.TryParse(yearStr, out var year) &&
                            int.TryParse(monthStr, out var month) &&
                            int.TryParse(dayStr, out var day))
                        {
                            DateTime utcDateTime;

                            // Check if we have time component
                            if (dateTimeStr.Length >= 15 && dateTimeStr[8] == 'T') // Has time component
                            {
                                var timeStr = dateTimeStr.Substring(9, 6); // HHMMSS
                                if (timeStr.Length == 6 &&
                                    int.TryParse(timeStr.Substring(0, 2), out var hour) &&
                                    int.TryParse(timeStr.Substring(2, 2), out var minute) &&
                                    int.TryParse(timeStr.Substring(4, 2), out var second))
                                {
                                    // Create UTC DateTime explicitly and KEEP as UTC
                                    utcDateTime = new DateTime(year, month, day, hour, minute, second, DateTimeKind.Utc);

                                    // Store UTC time as strings - no conversion
                                    episode.AirTimeString = utcDateTime.ToString("HH:mm");
                                    episode.AirDateTimeString = utcDateTime.ToString("yyyy-MM-ddTHH:mm:ssZ"); // Include Z for UTC
                                }
                                else
                                {
                                    // Fallback: date only
                                    utcDateTime = new DateTime(year, month, day, 0, 0, 0, DateTimeKind.Utc);

                                    episode.AirTimeString = "00:00";
                                    episode.AirDateTimeString = utcDateTime.ToString("yyyy-MM-ddT00:00:00Z");
                                }
                            }
                            else
                            {
                                // Date only
                                utcDateTime = new DateTime(year, month, day, 0, 0, 0, DateTimeKind.Utc);

                                episode.AirTimeString = "00:00";
                                episode.AirDateTimeString = utcDateTime.ToString("yyyy-MM-ddT00:00:00Z");
                            }

                            // Store the UTC date for grouping
                            episode.AirDate = utcDateTime.Date;
                        }
                    }
                }

                // Extract DESCRIPTION if available and not already set
                if (string.IsNullOrEmpty(episode.Description))
                {
                    var descMatch = Regex.Match(eventContent, @"DESCRIPTION:(.+)", RegexOptions.Multiline);
                    if (descMatch.Success)
                    {
                        episode.Description = descMatch.Groups[1].Value.Trim();
                    }
                }

                return string.IsNullOrEmpty(episode.SeriesTitle) ? null : episode;
            }
            catch
            {
                return null; // Skip malformed events
            }
        }

        public async Task<List<Model_Sensor>> FetchSelectedSensorsAsync(Model_Collector collector, List<string> selectedSensorIds, CancellationToken cancellationToken = default)
        {
            var all = await FetchSensorsAsync(collector, cancellationToken);
            return all.Where(s => selectedSensorIds.Contains(s.ExternalId)).ToList();
        }

        public async Task<bool> TestConnectionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            try
            {
                ApplyConfiguration(collector);
                using var client = new HttpClient();
                var response = await client.GetAsync(_icalFeedUrl, cancellationToken);
                if (!response.IsSuccessStatusCode)
                    return false;

                var content = await response.Content.ReadAsStringAsync(cancellationToken);
                // Basic validation - check if it looks like iCal content
                return content.Contains("BEGIN:VCALENDAR") && content.Contains("END:VCALENDAR");
            }
            catch
            {
                return false;
            }
        }

        public Task StartSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task StopSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public bool IsConnected(Model_Collector collector) => true;

        // Helper class to store episode information
        private class EpisodeInfo
        {
            public string SeriesTitle { get; set; } = string.Empty;
            public int Season { get; set; }
            public int Episode { get; set; }
            public DateTime? AirDate { get; set; }  // UTC date for grouping
            public string AirTimeString { get; set; } = string.Empty;  // UTC time string (HH:mm)
            public string AirDateTimeString { get; set; } = string.Empty;  // UTC datetime string (yyyy-MM-ddTHH:mm:ssZ)
            public string Description { get; set; } = string.Empty;
        }
    }
}