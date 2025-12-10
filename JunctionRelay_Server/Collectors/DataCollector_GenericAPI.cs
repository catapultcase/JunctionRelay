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

namespace JunctionRelayServer.Collectors
{
    public class DataCollector_GenericAPI : IDataCollector
    {
        public int CollectorId { get; private set; }

        public string CollectorName => "GenericAPI";

        private string _endpoint = string.Empty;
        private string _accessToken = string.Empty;// Helper method to determine appropriate unit based on key name
        private string DetermineUnit(string key, object value)
        {
            var lowerKey = key.ToLowerInvariant();

            // Time-based metrics
            if (lowerKey.Contains("uptime") && lowerKey.Contains("minutes"))
                return "minutes";
            if (lowerKey.Contains("timestamp") && !lowerKey.Contains("iso"))
                return "unix";
            if (lowerKey.Contains("hours"))
                return "hours";
            if (lowerKey.Contains("days"))
                return "days";

            // Financial metrics
            if (lowerKey.Contains("revenue") || lowerKey.Contains("payment"))
                return "currency";

            // Percentage/Rate metrics
            if (lowerKey.Contains("rate") || lowerKey.Contains("ratio"))
                return "percentage";

            // Count/Number metrics
            if (lowerKey.Contains("count") || lowerKey.Contains("total") ||
                lowerKey.Contains("users") || lowerKey.Contains("devices") ||
                lowerKey.Contains("subscriptions") || lowerKey.Contains("entries"))
                return "count";

            // Memory/Size metrics
            if (lowerKey.Contains("memory") || lowerKey.Contains("size"))
                return "bytes";

            // Environment/String values
            if (value is string || lowerKey.Contains("environment") || lowerKey.Contains("version"))
                return "text";

            // Default for numeric values
            if (decimal.TryParse(value?.ToString(), out _))
                return "value";

            return "text";
        }

        // Helper method to determine sensor category
        private string DetermineCategory(string key)
        {
            var lowerKey = key.ToLowerInvariant();

            if (lowerKey.StartsWith("system_"))
                return "System";
            if (lowerKey.StartsWith("cache_"))
                return "Cache";
            if (lowerKey.StartsWith("db_"))
                return "Database";
            if (lowerKey.StartsWith("financial_") || lowerKey.StartsWith("revenue_"))
                return "Financial";
            if (lowerKey.StartsWith("growth_"))
                return "Growth";
            if (lowerKey.StartsWith("refresh_token_"))
                return "Tokens";
            if (lowerKey.StartsWith("collector_"))
                return "Metadata";

            return "API Data";
        }

        public void ApplyConfiguration(Model_Collector collector)
        {
            _endpoint = collector.URL?.TrimEnd('/')
                ?? throw new ArgumentException("Collector.URL is required for GenericAPI collector.");

            _accessToken = collector.DecryptedAccessToken?.Trim()
                ?? throw new ArgumentException("Collector.AccessToken is required for GenericAPI collector.");

            CollectorId = collector.Id;
        }

        public async Task<List<Model_Sensor>> FetchSensorsAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);
            var sensors = new List<Model_Sensor>();

            using var client = new HttpClient();

            // Add the access token header
            client.DefaultRequestHeaders.Add("X-Collector-Token", _accessToken);

            // Set a reasonable timeout
            client.Timeout = TimeSpan.FromSeconds(30);

            var response = await client.GetAsync(_endpoint, cancellationToken);
            response.EnsureSuccessStatusCode();

            var content = await response.Content.ReadAsStringAsync(cancellationToken);

            // Parse the JSON response
            using var document = JsonDocument.Parse(content);
            var root = document.RootElement;

            // Check if response has expected structure
            if (!root.TryGetProperty("success", out var successElement) || !successElement.GetBoolean())
            {
                throw new InvalidOperationException("API response indicates failure or unexpected format");
            }

            if (!root.TryGetProperty("data", out var dataElement))
            {
                throw new InvalidOperationException("API response missing 'data' property");
            }

            // Convert each data property to a sensor
            foreach (var property in dataElement.EnumerateObject())
            {
                var key = property.Name;
                var value = property.Value;

                // Convert value to string
                string valueString;
                object rawValue;

                switch (value.ValueKind)
                {
                    case JsonValueKind.String:
                        valueString = value.GetString() ?? "";
                        rawValue = valueString;
                        break;
                    case JsonValueKind.Number:
                        if (value.TryGetInt64(out long longValue))
                        {
                            valueString = longValue.ToString();
                            rawValue = longValue;
                        }
                        else if (value.TryGetDouble(out double doubleValue))
                        {
                            valueString = doubleValue.ToString("F6").TrimEnd('0').TrimEnd('.');
                            rawValue = doubleValue;
                        }
                        else
                        {
                            valueString = value.ToString();
                            rawValue = valueString;
                        }
                        break;
                    case JsonValueKind.True:
                        valueString = "true";
                        rawValue = true;
                        break;
                    case JsonValueKind.False:
                        valueString = "false";
                        rawValue = false;
                        break;
                    case JsonValueKind.Array:
                        // For arrays, show count or convert to string
                        var arrayLength = value.GetArrayLength();
                        valueString = arrayLength.ToString();
                        rawValue = arrayLength;
                        key = key + "_count"; // Modify key to indicate this is array length
                        break;
                    case JsonValueKind.Object:
                        // Skip complex objects for now
                        continue;
                    case JsonValueKind.Null:
                        valueString = "null";
                        rawValue = null!;
                        break;
                    default:
                        valueString = value.ToString();
                        rawValue = valueString;
                        break;
                }

                sensors.Add(new Model_Sensor
                {
                    ExternalId = key.ToLowerInvariant().Replace(" ", "_"),
                    Name = key,
                    Value = valueString,
                    Unit = rawValue != null ? DetermineUnit(key, rawValue) : "",
                    DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(valueString),
                    Category = DetermineCategory(key),
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = key,
                    ComponentName = DetermineCategory(key),
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });
            }

            return sensors;
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
                client.DefaultRequestHeaders.Add("X-Collector-Token", _accessToken);
                client.Timeout = TimeSpan.FromSeconds(10); // Shorter timeout for connection test

                var response = await client.GetAsync(_endpoint, cancellationToken);

                if (!response.IsSuccessStatusCode)
                    return false;

                var content = await response.Content.ReadAsStringAsync(cancellationToken);

                // Basic validation that response is JSON with expected structure
                using var document = JsonDocument.Parse(content);
                var root = document.RootElement;

                return root.TryGetProperty("success", out var successElement) && successElement.GetBoolean();
            }
            catch
            {
                return false;
            }
        }

        public Task StartSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task StopSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public bool IsConnected(Model_Collector collector) => true;
    }
}