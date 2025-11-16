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
using System.Text.Json;
using System.Text.RegularExpressions;
using Ical.Net;
using Ical.Net.CalendarComponents;
using Ical.Net.DataTypes;

namespace JunctionRelayServer.Collectors
{
    public class DataCollector_SonarrCalendar : IDataCollector
    {
        public int CollectorId { get; private set; }
        public string CollectorName => "SonarrCalendar";

        private string _icalFeedUrl = string.Empty;

        public void ApplyConfiguration(Model_Collector collector)
        {
            _icalFeedUrl = collector.DecryptedAccessToken?.Trim()
                ?? throw new ArgumentException("Collector.DecryptedAccessToken (iCal Feed URL) is required.");

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

            if (!content.Contains("BEGIN:VCALENDAR"))
            {
                throw new InvalidDataException("Response does not appear to be valid iCal content");
            }

            // Parse calendar using Ical.Net
            var calendar = Calendar.Load(content);
            if (calendar == null)
            {
                return sensors;
            }
            var episodesByDate = ParseEpisodesByDate(calendar);

            // Create individual episode sensors
            foreach (var dateGroup in episodesByDate)
            {
                var date = dateGroup.Key;
                var episodes = dateGroup.Value;

                for (int i = 0; i < episodes.Count; i++)
                {
                    var episodeInfo = episodes[i];
                    var episodeIndex = i + 1;
                    var externalId = $"episode-{date:yyyy-MM-dd}-{episodeIndex:D2}";

                    var episodeData = CreateEpisodeData(episodeInfo);
                    var jsonValue = JsonSerializer.Serialize(episodeData, new JsonSerializerOptions
                    {
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                    });

                    // Truncate JSON if too long
                    if (jsonValue.Length > 2000)
                    {
                        episodeData = CreateSimplifiedEpisodeData(episodeInfo);
                        jsonValue = JsonSerializer.Serialize(episodeData, new JsonSerializerOptions
                        {
                            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                        });
                    }

                    var sensor = new Model_Sensor
                    {
                        ExternalId = externalId,
                        Name = $"{episodeInfo.SeriesTitle} S{episodeInfo.Season:D2}E{episodeInfo.Episode:D2}",
                        Value = jsonValue,
                        Unit = "Episode JSON",
                        DecimalPlaces = 0,
                        Category = "Sonarr Episode",
                        DeviceName = collector.Name,
                        SensorType = "Data",
                        SensorTag = date.ToString("MMM dd, yyyy"),
                        ComponentName = episodeInfo.AirTimeString,
                        JunctionId = null,
                        DeviceId = null,
                        CollectorId = collector.Id,
                        LastUpdated = DateTime.UtcNow,
                        CustomAttribute1 = episodeInfo.AirTimeString,
                        CustomAttribute2 = TruncateString(episodeInfo.SeriesTitle, 100) ?? "Unknown Series",
                        CustomAttribute3 = episodeInfo.Season.ToString(),
                        CustomAttribute4 = episodeInfo.Episode.ToString(),
                        CustomAttribute5 = TruncateString(episodeInfo.Description, 200),
                        CustomAttribute6 = $"S{episodeInfo.Season:D2}E{episodeInfo.Episode:D2}",
                        CustomAttribute7 = episodeInfo.AirDateTimeString,
                        CustomAttribute8 = date.ToString("yyyy-MM-dd")
                    };

                    sensors.Add(sensor);
                }
            }

            // Add convenience sensors
            AddConvenienceSensors(sensors, episodesByDate, collector);

            return sensors.OrderBy(s => s.ExternalId).ToList();
        }

        private void AddConvenienceSensors(List<Model_Sensor> sensors, Dictionary<DateTime, List<EpisodeInfo>> episodesByDate, Model_Collector collector)
        {
            var now = DateTime.UtcNow;
            var today = DateTime.Today;
            var yesterday = today.AddDays(-1);
            var tomorrow = today.AddDays(1);

            // Current episode
            var currentEpisode = FindCurrentEpisode(episodesByDate, now);
            sensors.Add(CreateEpisodeSensor("episodes-current", "Current Episode", currentEpisode, "Current", collector));
            sensors.Add(CreateTitleSensor("episodes-current-title", "Current Episode Title",
                FormatEpisodeTitle(currentEpisode) ?? "No current episode", "Current", collector));

            // Next episode
            var nextEpisode = FindNextEpisode(episodesByDate, now);
            sensors.Add(CreateEpisodeSensor("episodes-next", "Next Episode", nextEpisode, "Next", collector));
            sensors.Add(CreateTitleSensor("episodes-next-title", "Next Episode Title",
                FormatEpisodeTitle(nextEpisode) ?? "No upcoming episodes", "Next", collector));

            // Daily convenience sensors
            var yesterdayEpisodes = episodesByDate.ContainsKey(yesterday) ? episodesByDate[yesterday] : new List<EpisodeInfo>();
            var todayEpisodes = episodesByDate.ContainsKey(today) ? episodesByDate[today] : new List<EpisodeInfo>();
            var tomorrowEpisodes = episodesByDate.ContainsKey(tomorrow) ? episodesByDate[tomorrow] : new List<EpisodeInfo>();

            sensors.Add(CreateMultiEpisodeSensor("episodes-yesterday", "Episodes Yesterday", yesterdayEpisodes, "Yesterday", collector));
            sensors.Add(CreateMultiTitleSensor("episodes-yesterday-titles", "Yesterday's Episode Titles", yesterdayEpisodes, "Yesterday", collector));

            sensors.Add(CreateMultiEpisodeSensor("episodes-today", "Episodes Today", todayEpisodes, "Today", collector));
            sensors.Add(CreateMultiTitleSensor("episodes-today-titles", "Today's Episode Titles", todayEpisodes, "Today", collector));

            sensors.Add(CreateMultiEpisodeSensor("episodes-tomorrow", "Episodes Tomorrow", tomorrowEpisodes, "Tomorrow", collector));
            sensors.Add(CreateMultiTitleSensor("episodes-tomorrow-titles", "Tomorrow's Episode Titles", tomorrowEpisodes, "Tomorrow", collector));

            // Next 7 days
            var next7DaysEpisodes = GetEpisodesInRange(episodesByDate, today, 7);
            sensors.Add(CreateMultiEpisodeSensor("episodes-next-7-days", "Episodes Next 7 Days", next7DaysEpisodes, "Next 7 Days", collector));
            sensors.Add(CreateMultiTitleSensor("episodes-next-7-days-titles", "Next 7 Days Episode Titles", next7DaysEpisodes, "Next 7 Days", collector));
        }

        private Dictionary<DateTime, List<EpisodeInfo>> ParseEpisodesByDate(Calendar calendar)
        {
            var episodesByDate = new Dictionary<DateTime, List<EpisodeInfo>>();

            foreach (var calendarEvent in calendar.Events)
            {
                try
                {
                    var episodeInfo = ConvertToEpisodeInfo(calendarEvent);
                    if (episodeInfo?.AirDateUtc.HasValue == true)
                    {
                        var dateKey = episodeInfo.AirDateUtc.Value.Date;

                        if (!episodesByDate.ContainsKey(dateKey))
                        {
                            episodesByDate[dateKey] = new List<EpisodeInfo>();
                        }

                        episodesByDate[dateKey].Add(episodeInfo);
                    }
                }
                catch
                {
                    // Skip malformed episodes
                    continue;
                }
            }

            // Sort episodes within each date by air time
            foreach (var dateGroup in episodesByDate)
            {
                dateGroup.Value.Sort((e1, e2) =>
                {
                    if (!e1.AirDateUtc.HasValue && !e2.AirDateUtc.HasValue) return 0;
                    if (!e1.AirDateUtc.HasValue) return 1;
                    if (!e2.AirDateUtc.HasValue) return -1;
                    return e1.AirDateUtc.Value.CompareTo(e2.AirDateUtc.Value);
                });
            }

            return episodesByDate;
        }

        private EpisodeInfo ConvertToEpisodeInfo(CalendarEvent calendarEvent)
        {
            var episodeInfo = new EpisodeInfo();

            // Parse summary for episode details
            var summary = calendarEvent.Summary ?? string.Empty;
            ParseEpisodeFromSummary(summary, episodeInfo);

            // Use description if available
            if (string.IsNullOrEmpty(episodeInfo.Description))
            {
                episodeInfo.Description = calendarEvent.Description ?? string.Empty;
            }

            // Convert air time to UTC using Ical.Net's built-in timezone handling
            if (calendarEvent.Start != null)
            {
                var airTimeUtc = calendarEvent.Start.AsUtc;
                episodeInfo.AirDateUtc = airTimeUtc;
                episodeInfo.AirTimeString = airTimeUtc.ToString("HH:mm");
                episodeInfo.AirDateTimeString = airTimeUtc.ToString("yyyy-MM-ddTHH:mm:ssZ");
            }

            return episodeInfo;
        }

        private void ParseEpisodeFromSummary(string summary, EpisodeInfo episodeInfo)
        {
            // Parse format like "Series Name - S01E01 - Episode Title"
            var episodeMatch = Regex.Match(summary, @"^(.+?)\s*-\s*S(\d+)E(\d+)(?:\s*-\s*(.+))?");
            if (episodeMatch.Success)
            {
                episodeInfo.SeriesTitle = episodeMatch.Groups[1].Value.Trim();
                episodeInfo.Season = int.Parse(episodeMatch.Groups[2].Value);
                episodeInfo.Episode = int.Parse(episodeMatch.Groups[3].Value);
                episodeInfo.Description = episodeMatch.Groups[4].Success ? episodeMatch.Groups[4].Value.Trim() : "";
            }
            else
            {
                episodeInfo.SeriesTitle = summary; // Fallback
                episodeInfo.Season = 0;
                episodeInfo.Episode = 0;
                episodeInfo.Description = "";
            }
        }

        private EpisodeInfo? FindCurrentEpisode(Dictionary<DateTime, List<EpisodeInfo>> episodesByDate, DateTime now)
        {
            foreach (var dateGroup in episodesByDate)
            {
                foreach (var episodeInfo in dateGroup.Value)
                {
                    if (episodeInfo.AirDateUtc.HasValue)
                    {
                        var airTime = episodeInfo.AirDateUtc.Value;
                        var endTime = airTime.AddHours(1); // Assume 1 hour episode duration

                        if (now >= airTime && now <= endTime)
                        {
                            return episodeInfo;
                        }
                    }
                }
            }
            return null;
        }

        private EpisodeInfo? FindNextEpisode(Dictionary<DateTime, List<EpisodeInfo>> episodesByDate, DateTime now)
        {
            EpisodeInfo? nextEpisode = null;
            DateTime? nextAirTime = null;

            foreach (var dateGroup in episodesByDate.OrderBy(d => d.Key))
            {
                foreach (var episodeInfo in dateGroup.Value.OrderBy(e => e.AirDateUtc))
                {
                    if (episodeInfo.AirDateUtc.HasValue && episodeInfo.AirDateUtc.Value > now)
                    {
                        if (nextAirTime == null || episodeInfo.AirDateUtc.Value < nextAirTime)
                        {
                            nextEpisode = episodeInfo;
                            nextAirTime = episodeInfo.AirDateUtc.Value;
                        }
                    }
                }
            }
            return nextEpisode;
        }

        private List<EpisodeInfo> GetEpisodesInRange(Dictionary<DateTime, List<EpisodeInfo>> episodesByDate, DateTime startDate, int dayCount)
        {
            var episodes = new List<EpisodeInfo>();
            for (int i = 0; i < dayCount; i++)
            {
                var date = startDate.AddDays(i);
                if (episodesByDate.ContainsKey(date))
                {
                    episodes.AddRange(episodesByDate[date]);
                }
            }
            return episodes.OrderBy(e => e.AirDateUtc).ToList();
        }

        private string? FormatEpisodeTitle(EpisodeInfo? episodeInfo)
        {
            if (episodeInfo == null) return null;
            return $"{episodeInfo.SeriesTitle} S{episodeInfo.Season:D2}E{episodeInfo.Episode:D2}";
        }

        private Model_Sensor CreateEpisodeSensor(string externalId, string name, EpisodeInfo episodeInfo, string tag, Model_Collector collector)
        {
            var episodeData = episodeInfo != null ? CreateEpisodeData(episodeInfo) : new object[0];
            var jsonValue = JsonSerializer.Serialize(episodeData, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            });

            var sensor = new Model_Sensor
            {
                ExternalId = externalId,
                Name = name,
                Value = jsonValue,
                Unit = "Episode JSON",
                DecimalPlaces = 0,
                Category = "Sonarr Calendar",
                DeviceName = collector.Name,
                SensorType = "Data",
                SensorTag = tag,
                ComponentName = episodeInfo != null ? "1 Episode" : "No Episode",
                JunctionId = null,
                DeviceId = null,
                CollectorId = collector.Id,
                LastUpdated = DateTime.UtcNow
            };

            if (episodeInfo != null)
            {
                sensor.CustomAttribute1 = episodeInfo.AirTimeString;
                sensor.CustomAttribute2 = TruncateString(episodeInfo.SeriesTitle, 100) ?? "Unknown Series";
                sensor.CustomAttribute3 = episodeInfo.Season.ToString();
                sensor.CustomAttribute4 = episodeInfo.Episode.ToString();
                sensor.CustomAttribute5 = TruncateString(episodeInfo.Description, 200);
                sensor.CustomAttribute6 = $"S{episodeInfo.Season:D2}E{episodeInfo.Episode:D2}";
                sensor.CustomAttribute7 = episodeInfo.AirDateTimeString;
                sensor.CustomAttribute8 = episodeInfo.AirDateUtc?.ToString("yyyy-MM-dd") ?? "";
            }

            return sensor;
        }

        private Model_Sensor CreateTitleSensor(string externalId, string name, string titleValue, string tag, Model_Collector collector)
        {
            return new Model_Sensor
            {
                ExternalId = externalId,
                Name = name,
                Value = titleValue,
                Unit = "Episode Title",
                DecimalPlaces = 0,
                Category = "Sonarr Calendar",
                DeviceName = collector.Name,
                SensorType = "Data",
                SensorTag = tag,
                ComponentName = titleValue != "No current episode" && titleValue != "No upcoming episodes" ? "Current" : "None",
                JunctionId = null,
                DeviceId = null,
                CollectorId = collector.Id,
                LastUpdated = DateTime.UtcNow
            };
        }

        private Model_Sensor CreateMultiEpisodeSensor(string externalId, string name, List<EpisodeInfo> episodes, string tag, Model_Collector collector)
        {
            var episodeData = episodes.Select(e => CreateEpisodeData(e)).ToList();
            var jsonValue = JsonSerializer.Serialize(episodeData, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            });

            return new Model_Sensor
            {
                ExternalId = externalId,
                Name = name,
                Value = jsonValue,
                Unit = "Episodes JSON",
                DecimalPlaces = 0,
                Category = "Sonarr Calendar",
                DeviceName = collector.Name,
                SensorType = "Data",
                SensorTag = tag,
                ComponentName = $"{episodes.Count} Episodes",
                JunctionId = null,
                DeviceId = null,
                CollectorId = collector.Id,
                LastUpdated = DateTime.UtcNow
            };
        }

        private Model_Sensor CreateMultiTitleSensor(string externalId, string name, List<EpisodeInfo> episodes, string tag, Model_Collector collector)
        {
            var episodeTitles = episodes
                .Where(e => !string.IsNullOrWhiteSpace(e.SeriesTitle))
                .Select(e => FormatEpisodeTitle(e))
                .ToList();

            var titleValue = episodeTitles.Count == 0 ?
                $"No episodes {tag.ToLower()}" :
                TruncateString(string.Join(", ", episodeTitles), 500);

            return new Model_Sensor
            {
                ExternalId = externalId,
                Name = name,
                Value = titleValue,
                Unit = "Episode Titles",
                DecimalPlaces = 0,
                Category = "Sonarr Calendar",
                DeviceName = collector.Name,
                SensorType = "Data",
                SensorTag = tag,
                ComponentName = $"{episodeTitles.Count} Episodes",
                JunctionId = null,
                DeviceId = null,
                CollectorId = collector.Id,
                LastUpdated = DateTime.UtcNow
            };
        }

        private object[] CreateEpisodeData(EpisodeInfo episodeInfo)
        {
            return new[]
            {
                new
                {
                    series = TruncateString(episodeInfo.SeriesTitle, 200),
                    season = episodeInfo.Season,
                    episode = episodeInfo.Episode,
                    airTime = episodeInfo.AirTimeString,
                    airDateTime = episodeInfo.AirDateTimeString,
                    description = TruncateString(episodeInfo.Description, 500)
                }
            };
        }

        private object[] CreateSimplifiedEpisodeData(EpisodeInfo episodeInfo)
        {
            return new[]
            {
                new
                {
                    series = TruncateString(episodeInfo.SeriesTitle, 30),
                    season = episodeInfo.Season,
                    episode = episodeInfo.Episode,
                    airTime = episodeInfo.AirTimeString
                }
            };
        }

        private string TruncateString(string input, int maxLength)
        {
            if (string.IsNullOrEmpty(input)) return "";
            if (input.Length <= maxLength) return input;
            return input.Substring(0, maxLength - 3) + "...";
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
                if (!response.IsSuccessStatusCode) return false;

                var content = await response.Content.ReadAsStringAsync(cancellationToken);

                // Test parse with Ical.Net
                var calendar = Calendar.Load(content);
                return calendar != null && calendar.Events.Any();
            }
            catch
            {
                return false;
            }
        }

        public Task StartSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task StopSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public bool IsConnected(Model_Collector collector) => true;

        private class EpisodeInfo
        {
            public string SeriesTitle { get; set; } = string.Empty;
            public int Season { get; set; }
            public int Episode { get; set; }
            public DateTime? AirDateUtc { get; set; }  // Always UTC
            public string AirTimeString { get; set; } = string.Empty;    // UTC time (HH:mm)
            public string AirDateTimeString { get; set; } = string.Empty; // UTC datetime (ISO format)
            public string Description { get; set; } = string.Empty;
        }
    }
}