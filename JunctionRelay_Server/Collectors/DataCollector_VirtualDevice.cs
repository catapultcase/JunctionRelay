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

using System.Text.Json;
using JunctionRelayServer.Interfaces;
using JunctionRelayServer.Models;
using JunctionRelayServer.Services;

namespace JunctionRelayServer.Collectors
{
    /// <summary>
    /// Collector for Virtual Devices (Electron/Steam apps) that send metrics over WebSocket
    /// Server connects TO the device, sends metrics_request, receives response
    /// </summary>
    public class DataCollector_VirtualDevice : IDataCollector
    {
        public int CollectorId { get; private set; }
        public string CollectorName => "VirtualDevice";

        private readonly Service_Manager_WebSocket_Client _webSocketClient;
        private readonly IServiceScopeFactory _scopeFactory;
        private int _linkedDeviceId;
        private string? _deviceMac;

        public DataCollector_VirtualDevice(
            Service_Manager_WebSocket_Client webSocketClient,
            IServiceScopeFactory scopeFactory)
        {
            _webSocketClient = webSocketClient;
            _scopeFactory = scopeFactory;
        }

        public void ApplyConfiguration(Model_Collector collector)
        {
            CollectorId = collector.Id;

            // URL format: "virtualdevice://{deviceId}"
            if (string.IsNullOrEmpty(collector.URL) || !collector.URL.StartsWith("virtualdevice://"))
            {
                throw new ArgumentException("Collector.URL must be in format 'virtualdevice://{deviceId}' for VirtualDevice collector.");
            }

            if (!int.TryParse(collector.URL.Replace("virtualdevice://", ""), out _linkedDeviceId))
            {
                throw new ArgumentException("Invalid device ID in VirtualDevice collector URL.");
            }
        }

        public async Task<List<Model_Sensor>> FetchSensorsAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);

            var sensors = new List<Model_Sensor>();

            try
            {
                // Get device to find MAC address
                using var scope = _scopeFactory.CreateScope();
                var deviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();
                var device = await deviceDb.GetDeviceByIdAsync(_linkedDeviceId);

                if (device == null || string.IsNullOrEmpty(device.UniqueIdentifier))
                {
                    throw new InvalidOperationException($"Virtual device {_linkedDeviceId} not found or has no MAC address.");
                }

                _deviceMac = device.UniqueIdentifier;

                // Check if device is connected
                if (!_webSocketClient.IsDeviceConnected(_deviceMac))
                {
                    throw new InvalidOperationException($"Virtual device {device.Name} is not connected.");
                }

                // Send metrics_request message
                var request = new
                {
                    type = "metrics_request",
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                };

                var requestJson = JsonSerializer.Serialize(request);
                var requestBytes = System.Text.Encoding.UTF8.GetBytes(requestJson);

                var (success, response, errorType, errorMsg, connectionState) = await _webSocketClient.SendDataAndWaitForResponseAsync(
                    _deviceMac,
                    requestBytes,
                    timeoutMs: 10000  // 10 second timeout for metrics collection
                );

                if (!success || string.IsNullOrEmpty(response))
                {
                    throw new InvalidOperationException($"Virtual device did not respond to metrics request: {errorMsg}");
                }

                // Parse the response
                var responseElement = JsonSerializer.Deserialize<JsonElement>(response);

                    // Parse flat metrics format: { sensorTag: { value, unit }, ... }
                    if (responseElement.TryGetProperty("data", out var dataElement) &&
                        dataElement.ValueKind == JsonValueKind.Object)
                    {
                        foreach (var property in dataElement.EnumerateObject())
                        {
                            var sensorTag = property.Name;
                            var sensorData = property.Value;

                            // Extract value and unit from flat format
                            var valueString = sensorData.TryGetProperty("value", out var valueElement)
                                ? GetValueAsString(valueElement)
                                : "";

                            var unit = sensorData.TryGetProperty("unit", out var unitElement)
                                ? unitElement.GetString() ?? ""
                                : "";

                            // Infer category from sensorTag prefix
                            var category = InferCategoryFromTag(sensorTag);
                            var sensorType = InferSensorType(sensorTag, unit);
                            var friendlyName = ConvertTagToFriendlyName(sensorTag);

                            AddSensor(sensorTag, friendlyName, valueString, unit, sensors, collector, category, sensorType);
                        }
                    }

                return sensors;
            }
            catch (Exception)
            {
                throw;
            }
        }

        private void AddSensor(string externalId, string name, string value, string unit,
            List<Model_Sensor> sensors, Model_Collector collector, string category, string sensorType)
        {
            var sensor = new Model_Sensor
            {
                ExternalId = externalId.ToLowerInvariant().Replace(" ", "_"),
                Name = name,
                Value = value,
                Unit = unit,
                DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(value),
                Category = category,
                DeviceName = collector.Name,
                SensorType = sensorType,
                SensorTag = externalId,
                ComponentName = category,
                JunctionId = null,
                DeviceId = null,
                CollectorId = collector.Id,
                LastUpdated = DateTime.UtcNow
            };

            sensors.Add(sensor);
        }

        private string GetValueAsString(JsonElement element)
        {
            switch (element.ValueKind)
            {
                case JsonValueKind.String:
                    return element.GetString() ?? "";
                case JsonValueKind.Number:
                    if (element.TryGetInt64(out long longValue))
                        return longValue.ToString();
                    if (element.TryGetDouble(out double doubleValue))
                        return doubleValue.ToString("F6").TrimEnd('0').TrimEnd('.');
                    return element.ToString();
                case JsonValueKind.True:
                    return "true";
                case JsonValueKind.False:
                    return "false";
                case JsonValueKind.Null:
                    return "null";
                default:
                    return element.ToString();
            }
        }

        private string ConvertToFriendlyName(string propertyName)
        {
            return string.Join(" ", propertyName.Split('_')
                .Select(word => char.ToUpper(word[0]) + word.Substring(1)));
        }

        private string InferCategoryFromTag(string sensorTag)
        {
            if (sensorTag.StartsWith("cpu_")) return "CPU";
            if (sensorTag.StartsWith("gpu_")) return "GPU";
            if (sensorTag.StartsWith("memory_")) return "Memory";
            if (sensorTag.StartsWith("disk_")) return "Disk";
            if (sensorTag.StartsWith("network_")) return "Network";
            if (sensorTag.StartsWith("battery_")) return "Battery";
            if (sensorTag.StartsWith("system_")) return "System";
            if (sensorTag.StartsWith("gaming_")) return "Gaming";
            return "Other";
        }

        private string InferSensorType(string sensorTag, string unit)
        {
            // Boolean types
            if (unit == "boolean" || sensorTag.Contains("is_"))
                return "Boolean";

            // Text types
            if (unit == "text" || sensorTag.Contains("_name") || sensorTag.Contains("hostname") ||
                sensorTag.Contains("platform") || sensorTag.Contains("current_game") || sensorTag.Contains("app_id"))
                return "Text";

            // Default to Numeric
            return "Numeric";
        }

        private string ConvertTagToFriendlyName(string sensorTag)
        {
            // Remove category prefix and convert to friendly name
            var parts = sensorTag.Split('_');
            if (parts.Length > 1)
            {
                // Skip first part (category prefix) and capitalize the rest
                return string.Join(" ", parts.Skip(1)
                    .Select(word => word.Length > 0 ? char.ToUpper(word[0]) + word.Substring(1) : ""));
            }
            return ConvertToFriendlyName(sensorTag);
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

                // Get device MAC
                using var scope = _scopeFactory.CreateScope();
                var deviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();
                var device = await deviceDb.GetDeviceByIdAsync(_linkedDeviceId);

                if (device == null || string.IsNullOrEmpty(device.UniqueIdentifier))
                    return false;

                return _webSocketClient.IsDeviceConnected(device.UniqueIdentifier);
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
