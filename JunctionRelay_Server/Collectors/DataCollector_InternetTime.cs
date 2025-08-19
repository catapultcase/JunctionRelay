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
using JunctionRelayServer.Interfaces;
using JunctionRelayServer.Models;
using System.Text.Json;

namespace JunctionRelayServer.Collectors
{
    public class DataCollector_InternetTime : IDataCollector, IDisposable
    {
        public string CollectorName => "InternetTime";
        public int CollectorId { get; private set; }
        private readonly HttpClient _httpClient;
        private bool _isConnected = false;
        private DateTime? _lastSuccessfulTime = null;
        private DateTime _lastAttempt = DateTime.MinValue;

        public DataCollector_InternetTime()
        {
            _httpClient = new HttpClient();
            _httpClient.Timeout = TimeSpan.FromSeconds(10);
            _httpClient.DefaultRequestHeaders.Add("User-Agent", "JunctionRelay/1.0");
        }

        public void ApplyConfiguration(Model_Collector collector)
        {
            CollectorId = collector.Id;
        }

        public async Task<List<Model_Sensor>> FetchSensorsAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);

            DateTime internetTime;
            string timeSource;
            bool success = false;

            try
            {
                internetTime = await GetUtcTimeFromInternetAsync(cancellationToken);
                _lastSuccessfulTime = internetTime;
                _isConnected = true;
                success = true;
                timeSource = "Internet";
            }
            catch (Exception)
            {
                _isConnected = false;
                // If we have a recent successful time (within last 5 minutes), use it with offset
                if (_lastSuccessfulTime.HasValue &&
                    DateTime.UtcNow.Subtract(_lastAttempt).TotalMinutes < 5)
                {
                    var timeSinceLastSuccess = DateTime.UtcNow.Subtract(_lastAttempt);
                    internetTime = _lastSuccessfulTime.Value.Add(timeSinceLastSuccess);
                    timeSource = "Cached";
                }
                else
                {
                    throw; // Re-throw if we can't provide a reasonable time estimate
                }
            }

            _lastAttempt = DateTime.UtcNow;

            var sensors = new List<Model_Sensor>
            {
                new Model_Sensor
                {
                    CollectorId = collector.Id,
                    ExternalId = "internet_utc_time_iso",
                    Name = "Internet UTC Time (ISO 8601)",
                    ComponentName = "InternetTime",
                    Value = internetTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                    Unit = "UTC",
                    DecimalPlaces = 0,
                    SensorTag = "Time",
                    SensorType = "DateTime",
                    Category = "Network",
                    DeviceName = collector.Name,
                    MQTTQoS = 1,
                },
                new Model_Sensor
                {
                    CollectorId = collector.Id,
                    ExternalId = "internet_utc_timestamp",
                    Name = "Internet UTC Timestamp",
                    ComponentName = "InternetTime",
                    Value = ((DateTimeOffset)internetTime).ToUnixTimeSeconds().ToString(),
                    Unit = "seconds",
                    DecimalPlaces = 0,
                    SensorTag = "Timestamp",
                    SensorType = "Numeric",
                    Category = "Network",
                    DeviceName = collector.Name,
                    MQTTQoS = 1,
                },
                new Model_Sensor
                {
                    CollectorId = collector.Id,
                    ExternalId = "internet_utc_time_readable",
                    Name = "Internet UTC Time (Readable)",
                    ComponentName = "InternetTime",
                    Value = internetTime.ToString("yyyy-MM-dd HH:mm:ss UTC"),
                    Unit = "UTC",
                    DecimalPlaces = 0,
                    SensorTag = "Time",
                    SensorType = "Text",
                    Category = "Network",
                    DeviceName = collector.Name,
                    MQTTQoS = 1,
                },
                new Model_Sensor
                {
                    CollectorId = collector.Id,
                    ExternalId = "internet_time_source",
                    Name = "Time Source",
                    ComponentName = "InternetTime",
                    Value = timeSource,
                    Unit = "Source",
                    DecimalPlaces = 0,
                    SensorTag = "Source",
                    SensorType = "Text",
                    Category = "Network",
                    DeviceName = collector.Name,
                    MQTTQoS = 1,
                },
                new Model_Sensor
                {
                    CollectorId = collector.Id,
                    ExternalId = "internet_time_sync_status",
                    Name = "Time Sync Status",
                    ComponentName = "InternetTime",
                    Value = success ? "Connected" : "Disconnected",
                    Unit = "Status",
                    DecimalPlaces = 0,
                    SensorTag = "Status",
                    SensorType = "Text",
                    Category = "Network",
                    DeviceName = collector.Name,
                    MQTTQoS = 1,
                }
            };

            return sensors;
        }

        public Task<List<Model_Sensor>> FetchSelectedSensorsAsync(Model_Collector collector, List<string> selectedSensorIds, CancellationToken cancellationToken = default)
        {
            return FetchSensorsAsync(collector, cancellationToken);
        }

        public async Task<bool> TestConnectionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            try
            {
                await GetUtcTimeFromInternetAsync(cancellationToken);
                return true;
            }
            catch
            {
                return false;
            }
        }

        public Task StartSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }

        public Task StopSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }

        public bool IsConnected(Model_Collector collector) => _isConnected;

        private async Task<DateTime> GetUtcTimeFromInternetAsync(CancellationToken cancellationToken = default)
        {
            // Primary API: WorldTimeAPI
            try
            {
                var response = await _httpClient.GetStringAsync("https://worldtimeapi.org/api/timezone/UTC", cancellationToken);
                var timeData = JsonSerializer.Deserialize<JsonElement>(response);

                if (timeData.TryGetProperty("utc_datetime", out var utcDateTimeProperty))
                {
                    var utcString = utcDateTimeProperty.GetString();
                    if (DateTime.TryParse(utcString, out var parsedTime))
                    {
                        return parsedTime.ToUniversalTime();
                    }
                }
            }
            catch
            {
                // Continue to fallback APIs
            }

            // Fallback API 1: TimeAPI
            try
            {
                var response = await _httpClient.GetStringAsync("https://timeapi.io/api/Time/current/zone?timeZone=UTC", cancellationToken);
                var timeData = JsonSerializer.Deserialize<JsonElement>(response);

                if (timeData.TryGetProperty("dateTime", out var dateTimeProperty))
                {
                    var utcString = dateTimeProperty.GetString();
                    if (DateTime.TryParse(utcString, out var parsedTime))
                    {
                        return parsedTime.ToUniversalTime();
                    }
                }
            }
            catch
            {
                // Continue to next fallback
            }

            // Fallback API 2: HTTP Date header from a reliable source
            try
            {
                var request = new HttpRequestMessage(HttpMethod.Head, "https://www.google.com");
                var response = await _httpClient.SendAsync(request, cancellationToken);

                if (response.Headers.Date.HasValue)
                {
                    return response.Headers.Date.Value.UtcDateTime;
                }
            }
            catch
            {
                // Continue to final fallback
            }

            // Final fallback API: Another time service
            try
            {
                var response = await _httpClient.GetStringAsync("http://worldclockapi.com/api/json/utc/now", cancellationToken);
                var timeData = JsonSerializer.Deserialize<JsonElement>(response);

                if (timeData.TryGetProperty("currentDateTime", out var currentDateTimeProperty))
                {
                    var utcString = currentDateTimeProperty.GetString();
                    if (DateTime.TryParse(utcString, out var parsedTime))
                    {
                        return parsedTime.ToUniversalTime();
                    }
                }
            }
            catch
            {
                // All APIs failed
            }

            throw new InvalidOperationException("Unable to retrieve UTC time from internet sources");
        }

        protected virtual void Dispose(bool disposing)
        {
            if (disposing)
            {
                _httpClient?.Dispose();
            }
        }

        public void Dispose()
        {
            Dispose(true);
            GC.SuppressFinalize(this);
        }
    }
}