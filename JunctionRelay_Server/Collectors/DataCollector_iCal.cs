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
using Ical.Net;
using Ical.Net.CalendarComponents;
using Ical.Net.DataTypes;

namespace JunctionRelayServer.Collectors
{
    public class DataCollector_iCal : IDataCollector
    {
        public int CollectorId { get; private set; }
        public string CollectorName => "iCal";

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
            var eventsByDate = ParseEventsByDate(calendar);

            // Create individual event sensors
            foreach (var dateGroup in eventsByDate)
            {
                var date = dateGroup.Key;
                var events = dateGroup.Value;

                for (int i = 0; i < events.Count; i++)
                {
                    var eventInfo = events[i];
                    var eventIndex = i + 1;
                    var externalId = $"event-{date:yyyy-MM-dd}-{eventIndex:D2}";

                    var durationMinutes = CalculateEventDuration(eventInfo);
                    var eventData = CreateEventData(eventInfo);
                    var jsonValue = JsonSerializer.Serialize(eventData, new JsonSerializerOptions
                    {
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                    });

                    // Truncate JSON if too long
                    if (jsonValue.Length > 2000)
                    {
                        eventData = CreateSimplifiedEventData(eventInfo);
                        jsonValue = JsonSerializer.Serialize(eventData, new JsonSerializerOptions
                        {
                            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                        });
                    }

                    var sensor = new Model_Sensor
                    {
                        ExternalId = externalId,
                        Name = eventInfo.Title ?? "Untitled Event",
                        Value = jsonValue,
                        Unit = "Event JSON",
                        DecimalPlaces = 0,
                        Category = "iCal Event",
                        DeviceName = collector.Name,
                        SensorType = "Data",
                        SensorTag = date.ToString("MMM dd, yyyy"),
                        ComponentName = eventInfo.IsAllDay ? "All Day" : $"{eventInfo.StartTimeString}-{eventInfo.EndTimeString}",
                        JunctionId = null,
                        DeviceId = null,
                        CollectorId = collector.Id,
                        LastUpdated = DateTime.UtcNow,
                        CustomAttribute1 = eventInfo.StartTimeString,
                        CustomAttribute2 = eventInfo.EndTimeString,
                        CustomAttribute3 = TruncateString(eventInfo.Title ?? "Untitled Event", 100),
                        CustomAttribute4 = TruncateString(eventInfo.Description ?? "", 200),
                        CustomAttribute5 = TruncateString(eventInfo.Location ?? "", 100),
                        CustomAttribute6 = eventInfo.IsAllDay.ToString().ToLower(),
                        CustomAttribute7 = durationMinutes.ToString("F0"),
                        CustomAttribute8 = date.ToString("yyyy-MM-dd")
                    };

                    sensors.Add(sensor);
                }
            }

            // Add convenience sensors
            AddConvenienceSensors(sensors, eventsByDate, collector);

            return sensors.OrderBy(s => s.ExternalId).ToList();
        }

        private void AddConvenienceSensors(List<Model_Sensor> sensors, Dictionary<DateTime, List<EventInfo>> eventsByDate, Model_Collector collector)
        {
            var now = DateTime.UtcNow;
            var today = DateTime.Today;
            var tomorrow = today.AddDays(1);

            // Current event
            var currentEvent = FindCurrentEvent(eventsByDate, now);
            sensors.Add(CreateEventSensor("events-current", "Current Event", currentEvent, "Current", collector));
            sensors.Add(CreateTitleSensor("events-current-title", "Current Event Title",
                currentEvent?.Title ?? "No current event", "Current", collector));

            // Next event
            var nextEvent = FindNextEvent(eventsByDate, now);
            sensors.Add(CreateEventSensor("events-next", "Next Event", nextEvent, "Next", collector));
            sensors.Add(CreateTitleSensor("events-next-title", "Next Event Title",
                nextEvent?.Title ?? "No upcoming events", "Next", collector));

            // Time until next event
            if (nextEvent != null)
            {
                sensors.Add(CreateTimeUntilSensor(nextEvent, now, collector));
            }

            // Daily convenience sensors
            var todayEvents = eventsByDate.ContainsKey(today) ? eventsByDate[today] : new List<EventInfo>();
            var tomorrowEvents = eventsByDate.ContainsKey(tomorrow) ? eventsByDate[tomorrow] : new List<EventInfo>();

            sensors.Add(CreateMultiEventSensor("events-today", "Events Today", todayEvents, "Today", collector));
            sensors.Add(CreateMultiTitleSensor("events-today-titles", "Today's Event Titles", todayEvents, "Today", collector));

            sensors.Add(CreateMultiEventSensor("events-tomorrow", "Events Tomorrow", tomorrowEvents, "Tomorrow", collector));
            sensors.Add(CreateMultiTitleSensor("events-tomorrow-titles", "Tomorrow's Event Titles", tomorrowEvents, "Tomorrow", collector));

            // Next 7 days
            var next7DaysEvents = GetEventsInRange(eventsByDate, today, 7);
            sensors.Add(CreateMultiEventSensor("events-next-7-days", "Events Next 7 Days", next7DaysEvents, "Next 7 Days", collector));
            sensors.Add(CreateMultiTitleSensor("events-next-7-days-titles", "Next 7 Days Event Titles", next7DaysEvents, "Next 7 Days", collector));
        }

        private Dictionary<DateTime, List<EventInfo>> ParseEventsByDate(Calendar calendar)
        {
            var eventsByDate = new Dictionary<DateTime, List<EventInfo>>();
            var sevenDaysAgo = DateTime.Today.AddDays(-7);

            foreach (var calendarEvent in calendar.Events)
            {
                try
                {
                    var eventInfo = ConvertToEventInfo(calendarEvent);
                    if (eventInfo?.StartDateUtc.HasValue == true)
                    {
                        var dateKey = eventInfo.StartDateUtc.Value.Date;

                        // Skip events older than 7 days
                        if (dateKey < sevenDaysAgo) continue;

                        if (!eventsByDate.ContainsKey(dateKey))
                        {
                            eventsByDate[dateKey] = new List<EventInfo>();
                        }

                        eventsByDate[dateKey].Add(eventInfo);
                    }
                }
                catch
                {
                    // Skip malformed events
                    continue;
                }
            }

            // Sort events within each date by start time
            foreach (var dateGroup in eventsByDate)
            {
                dateGroup.Value.Sort((e1, e2) =>
                {
                    if (!e1.StartDateUtc.HasValue && !e2.StartDateUtc.HasValue) return 0;
                    if (!e1.StartDateUtc.HasValue) return 1;
                    if (!e2.StartDateUtc.HasValue) return -1;
                    return e1.StartDateUtc.Value.CompareTo(e2.StartDateUtc.Value);
                });
            }

            return eventsByDate;
        }

        private EventInfo ConvertToEventInfo(CalendarEvent calendarEvent)
        {
            var eventInfo = new EventInfo
            {
                Title = calendarEvent.Summary ?? string.Empty,
                Description = calendarEvent.Description ?? string.Empty,
                Location = calendarEvent.Location ?? string.Empty,
                IsAllDay = calendarEvent.IsAllDay
            };

            // Convert start time to UTC using Ical.Net's built-in timezone handling
            if (calendarEvent.Start != null)
            {
                var startUtc = calendarEvent.Start.AsUtc;
                eventInfo.StartDateUtc = startUtc;

                if (eventInfo.IsAllDay)
                {
                    eventInfo.StartTimeString = "";
                    eventInfo.StartDateTimeString = startUtc.ToString("yyyy-MM-dd");
                }
                else
                {
                    eventInfo.StartTimeString = startUtc.ToString("HH:mm");
                    eventInfo.StartDateTimeString = startUtc.ToString("yyyy-MM-ddTHH:mm:ssZ");
                }
            }

            // Convert end time to UTC using Ical.Net's built-in timezone handling
            if (calendarEvent.End != null)
            {
                var endUtc = calendarEvent.End.AsUtc;
                eventInfo.EndDateUtc = endUtc;

                if (eventInfo.IsAllDay)
                {
                    eventInfo.EndTimeString = "";
                    eventInfo.EndDateTimeString = endUtc.ToString("yyyy-MM-dd");
                }
                else
                {
                    eventInfo.EndTimeString = endUtc.ToString("HH:mm");
                    eventInfo.EndDateTimeString = endUtc.ToString("yyyy-MM-ddTHH:mm:ssZ");
                }
            }

            return eventInfo;
        }

        private EventInfo? FindCurrentEvent(Dictionary<DateTime, List<EventInfo>> eventsByDate, DateTime now)
        {
            foreach (var dateGroup in eventsByDate)
            {
                foreach (var eventInfo in dateGroup.Value)
                {
                    if (eventInfo.StartDateUtc.HasValue)
                    {
                        var startTime = eventInfo.StartDateUtc.Value;
                        var endTime = eventInfo.EndDateUtc ?? startTime.AddHours(1);

                        if (now >= startTime && now <= endTime)
                        {
                            return eventInfo;
                        }
                    }
                }
            }
            return null;
        }

        private EventInfo? FindNextEvent(Dictionary<DateTime, List<EventInfo>> eventsByDate, DateTime now)
        {
            EventInfo? nextEvent = null;
            DateTime? nextEventTime = null;

            foreach (var dateGroup in eventsByDate.OrderBy(d => d.Key))
            {
                foreach (var eventInfo in dateGroup.Value.OrderBy(e => e.StartDateUtc))
                {
                    if (eventInfo.StartDateUtc.HasValue && eventInfo.StartDateUtc.Value > now)
                    {
                        if (nextEventTime == null || eventInfo.StartDateUtc.Value < nextEventTime)
                        {
                            nextEvent = eventInfo;
                            nextEventTime = eventInfo.StartDateUtc.Value;
                        }
                    }
                }
            }
            return nextEvent;
        }

        private List<EventInfo> GetEventsInRange(Dictionary<DateTime, List<EventInfo>> eventsByDate, DateTime startDate, int dayCount)
        {
            var events = new List<EventInfo>();
            for (int i = 0; i < dayCount; i++)
            {
                var date = startDate.AddDays(i);
                if (eventsByDate.ContainsKey(date))
                {
                    events.AddRange(eventsByDate[date]);
                }
            }
            return events.OrderBy(e => e.StartDateUtc).ToList();
        }

        private Model_Sensor CreateEventSensor(string externalId, string name, EventInfo eventInfo, string tag, Model_Collector collector)
        {
            var eventData = eventInfo != null ? CreateEventData(eventInfo) : new object[0];
            var jsonValue = JsonSerializer.Serialize(eventData, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            });

            var sensor = new Model_Sensor
            {
                ExternalId = externalId,
                Name = name,
                Value = jsonValue,
                Unit = "Event JSON",
                DecimalPlaces = 0,
                Category = "iCal Calendar",
                DeviceName = collector.Name,
                SensorType = "Data",
                SensorTag = tag,
                ComponentName = eventInfo != null ? "1 Event" : "No Event",
                JunctionId = null,
                DeviceId = null,
                CollectorId = collector.Id,
                LastUpdated = DateTime.UtcNow
            };

            if (eventInfo != null)
            {
                var durationMinutes = CalculateEventDuration(eventInfo);
                sensor.CustomAttribute1 = eventInfo.StartTimeString;
                sensor.CustomAttribute2 = eventInfo.EndTimeString;
                sensor.CustomAttribute3 = TruncateString(eventInfo.Title, 100) ?? "Untitled Event";
                sensor.CustomAttribute4 = TruncateString(eventInfo.Description, 200);
                sensor.CustomAttribute5 = TruncateString(eventInfo.Location, 100);
                sensor.CustomAttribute6 = eventInfo.IsAllDay.ToString().ToLower();
                sensor.CustomAttribute7 = durationMinutes.ToString("F0");
                sensor.CustomAttribute8 = eventInfo.StartDateUtc?.ToString("yyyy-MM-dd") ?? "";
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
                Unit = "Event Title",
                DecimalPlaces = 0,
                Category = "iCal Calendar",
                DeviceName = collector.Name,
                SensorType = "Data",
                SensorTag = tag,
                ComponentName = titleValue != "No current event" && titleValue != "No upcoming events" ? "Current" : "None",
                JunctionId = null,
                DeviceId = null,
                CollectorId = collector.Id,
                LastUpdated = DateTime.UtcNow
            };
        }

        private Model_Sensor CreateTimeUntilSensor(EventInfo nextEvent, DateTime now, Model_Collector collector)
        {
            string timeUntilValue = "No upcoming events";
            double minutesUntil = 0;

            if (nextEvent?.StartDateUtc.HasValue == true)
            {
                var timeSpan = nextEvent.StartDateUtc.Value - now;
                minutesUntil = Math.Max(0, timeSpan.TotalMinutes);

                if (timeSpan.TotalDays >= 1)
                {
                    var days = (int)timeSpan.TotalDays;
                    var hours = timeSpan.Hours;
                    timeUntilValue = days == 1 ? $"1 day, {hours}h" : $"{days} days, {hours}h";
                }
                else if (timeSpan.TotalHours >= 1)
                {
                    var hours = (int)timeSpan.TotalHours;
                    var minutes = timeSpan.Minutes;
                    timeUntilValue = $"{hours}h {minutes}m";
                }
                else if (timeSpan.TotalMinutes >= 1)
                {
                    var minutes = (int)timeSpan.TotalMinutes;
                    timeUntilValue = $"{minutes}m";
                }
                else if (timeSpan.TotalMinutes >= 0)
                {
                    timeUntilValue = "Starting soon";
                }
            }

            return new Model_Sensor
            {
                ExternalId = "events-time-until-next",
                Name = "Time Until Next Event",
                Value = minutesUntil.ToString("F1"),
                Unit = "minutes",
                DecimalPlaces = 1,
                Category = "iCal Calendar",
                DeviceName = collector.Name,
                SensorType = "Data",
                SensorTag = "Time Until",
                ComponentName = timeUntilValue,
                JunctionId = null,
                DeviceId = null,
                CollectorId = collector.Id,
                LastUpdated = DateTime.UtcNow
            };
        }

        private Model_Sensor CreateMultiEventSensor(string externalId, string name, List<EventInfo> events, string tag, Model_Collector collector)
        {
            var eventData = events.Select(e => CreateEventData(e)).ToList();
            var jsonValue = JsonSerializer.Serialize(eventData, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            });

            return new Model_Sensor
            {
                ExternalId = externalId,
                Name = name,
                Value = jsonValue,
                Unit = "Events JSON",
                DecimalPlaces = 0,
                Category = "iCal Calendar",
                DeviceName = collector.Name,
                SensorType = "Data",
                SensorTag = tag,
                ComponentName = $"{events.Count} Events",
                JunctionId = null,
                DeviceId = null,
                CollectorId = collector.Id,
                LastUpdated = DateTime.UtcNow
            };
        }

        private Model_Sensor CreateMultiTitleSensor(string externalId, string name, List<EventInfo> events, string tag, Model_Collector collector)
        {
            var titles = events.Where(e => !string.IsNullOrWhiteSpace(e.Title)).Select(e => e.Title).ToList();
            var titleValue = titles.Count == 0 ?
                $"No events {tag.ToLower()}" :
                TruncateString(string.Join(", ", titles), 500);

            return new Model_Sensor
            {
                ExternalId = externalId,
                Name = name,
                Value = titleValue,
                Unit = "Event Titles",
                DecimalPlaces = 0,
                Category = "iCal Calendar",
                DeviceName = collector.Name,
                SensorType = "Data",
                SensorTag = tag,
                ComponentName = $"{titles.Count} Events",
                JunctionId = null,
                DeviceId = null,
                CollectorId = collector.Id,
                LastUpdated = DateTime.UtcNow
            };
        }

        private object[] CreateEventData(EventInfo eventInfo)
        {
            return new[]
            {
                new
                {
                    title = TruncateString(eventInfo.Title, 200),
                    startTime = eventInfo.StartTimeString,
                    startDateTime = eventInfo.StartDateTimeString,
                    endTime = eventInfo.EndTimeString,
                    endDateTime = eventInfo.EndDateTimeString,
                    description = TruncateString(eventInfo.Description, 500),
                    location = TruncateString(eventInfo.Location, 200),
                    allDay = eventInfo.IsAllDay
                }
            };
        }

        private object[] CreateSimplifiedEventData(EventInfo eventInfo)
        {
            return new[]
            {
                new
                {
                    title = TruncateString(eventInfo.Title, 30),
                    startTime = eventInfo.StartTimeString,
                    endTime = eventInfo.EndTimeString,
                    allDay = eventInfo.IsAllDay
                }
            };
        }

        private double CalculateEventDuration(EventInfo eventInfo)
        {
            if (eventInfo.StartDateUtc.HasValue && eventInfo.EndDateUtc.HasValue)
            {
                return (eventInfo.EndDateUtc.Value - eventInfo.StartDateUtc.Value).TotalMinutes;
            }
            else if (eventInfo.StartDateUtc.HasValue && !eventInfo.IsAllDay)
            {
                return 60.0; // Default 1 hour
            }
            else if (eventInfo.IsAllDay)
            {
                return 1440.0; // All day = 24 hours
            }
            return 0.0;
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
                client.Timeout = TimeSpan.FromSeconds(10);

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

        private class EventInfo
        {
            public string Title { get; set; } = string.Empty;
            public string Description { get; set; } = string.Empty;
            public string Location { get; set; } = string.Empty;
            public DateTime? StartDateUtc { get; set; }  // Always UTC
            public DateTime? EndDateUtc { get; set; }    // Always UTC
            public string StartTimeString { get; set; } = string.Empty;    // UTC time (HH:mm)
            public string StartDateTimeString { get; set; } = string.Empty; // UTC datetime (ISO format)
            public string EndTimeString { get; set; } = string.Empty;      // UTC time (HH:mm)
            public string EndDateTimeString { get; set; } = string.Empty;   // UTC datetime (ISO format)
            public bool IsAllDay { get; set; }
        }
    }
}