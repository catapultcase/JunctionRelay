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

                    // Parse the metrics response (same format as Steam collector)
                    if (responseElement.TryGetProperty("data", out var dataElement))
                    {
                        // Process each section
                        if (dataElement.TryGetProperty("system", out var systemElement))
                            ProcessSystemMetrics(systemElement, sensors, collector);

                        if (dataElement.TryGetProperty("gaming", out var gamingElement))
                            ProcessGamingMetrics(gamingElement, sensors, collector);

                        if (dataElement.TryGetProperty("cpu", out var cpuElement))
                            ProcessCpuMetrics(cpuElement, sensors, collector);

                        if (dataElement.TryGetProperty("gpu", out var gpuElement))
                            ProcessGpuMetrics(gpuElement, sensors, collector);

                        if (dataElement.TryGetProperty("memory", out var memoryElement))
                            ProcessMemoryMetrics(memoryElement, sensors, collector);

                        if (dataElement.TryGetProperty("disk", out var diskElement))
                            ProcessDiskMetrics(diskElement, sensors, collector);

                        if (dataElement.TryGetProperty("network", out var networkElement))
                            ProcessNetworkMetrics(networkElement, sensors, collector);

                        if (dataElement.TryGetProperty("battery", out var batteryElement))
                            ProcessBatteryMetrics(batteryElement, sensors, collector);
                    }

                return sensors;
            }
            catch (Exception)
            {
                throw;
            }
        }

        // Metric processing methods (same as before)
        private void ProcessSystemMetrics(JsonElement systemElement, List<Model_Sensor> sensors, Model_Collector collector)
        {
            AddSensorFromProperty(systemElement, "hostname", sensors, collector, "System", "Text", "text");
            AddSensorFromProperty(systemElement, "platform", sensors, collector, "System", "Text", "text");
            AddSensorFromProperty(systemElement, "uptime", sensors, collector, "System", "Numeric", "seconds");
        }

        private void ProcessGamingMetrics(JsonElement gamingElement, List<Model_Sensor> sensors, Model_Collector collector)
        {
            AddSensorFromProperty(gamingElement, "current_game", sensors, collector, "Gaming", "Text", "text");
            AddSensorFromProperty(gamingElement, "app_id", sensors, collector, "Gaming", "Text", "text");
            AddSensorFromProperty(gamingElement, "fps", sensors, collector, "Gaming", "Numeric", "fps");
            AddSensorFromProperty(gamingElement, "frame_time", sensors, collector, "Gaming", "Numeric", "ms");
            AddSensorFromProperty(gamingElement, "session_duration", sensors, collector, "Gaming", "Numeric", "seconds");
            AddSensorFromProperty(gamingElement, "is_playing", sensors, collector, "Gaming", "Boolean", "boolean");
        }

        private void ProcessCpuMetrics(JsonElement cpuElement, List<Model_Sensor> sensors, Model_Collector collector)
        {
            AddSensorFromProperty(cpuElement, "name", sensors, collector, "CPU", "Text", "text");
            AddSensorFromProperty(cpuElement, "usage_total", sensors, collector, "CPU", "Numeric", "%");
            AddSensorFromProperty(cpuElement, "frequency", sensors, collector, "CPU", "Numeric", "MHz");
            AddSensorFromProperty(cpuElement, "temperature", sensors, collector, "CPU", "Numeric", "°C");
            AddSensorFromProperty(cpuElement, "core_count", sensors, collector, "CPU", "Numeric", "cores");
            AddSensorFromProperty(cpuElement, "thread_count", sensors, collector, "CPU", "Numeric", "threads");

            // Process per-core data
            if (cpuElement.TryGetProperty("cores", out var coresElement) && coresElement.ValueKind == JsonValueKind.Array)
            {
                int coreIndex = 0;
                foreach (var core in coresElement.EnumerateArray())
                {
                    if (core.TryGetProperty("usage", out var usage))
                    {
                        var (value, unit, tag) = ExtractSensorMetadata(usage);
                        AddSensor(tag, $"CPU Core {coreIndex} Usage", value, unit, sensors, collector, "CPU", "Numeric");
                    }

                    if (core.TryGetProperty("frequency", out var freq))
                    {
                        var (value, unit, tag) = ExtractSensorMetadata(freq);
                        AddSensor(tag, $"CPU Core {coreIndex} Frequency", value, unit, sensors, collector, "CPU", "Numeric");
                    }

                    if (core.TryGetProperty("temperature", out var temp))
                    {
                        var (value, unit, tag) = ExtractSensorMetadata(temp);
                        AddSensor(tag, $"CPU Core {coreIndex} Temperature", value, unit, sensors, collector, "CPU", "Numeric");
                    }

                    coreIndex++;
                }
            }
        }

        private void ProcessGpuMetrics(JsonElement gpuElement, List<Model_Sensor> sensors, Model_Collector collector)
        {
            AddSensorFromProperty(gpuElement, "name", sensors, collector, "GPU", "Text", "text");
            AddSensorFromProperty(gpuElement, "usage", sensors, collector, "GPU", "Numeric", "%");
            AddSensorFromProperty(gpuElement, "frequency", sensors, collector, "GPU", "Numeric", "MHz");
            AddSensorFromProperty(gpuElement, "temperature", sensors, collector, "GPU", "Numeric", "°C");
            AddSensorFromProperty(gpuElement, "vram_used", sensors, collector, "GPU", "Numeric", "MB");
            AddSensorFromProperty(gpuElement, "vram_total", sensors, collector, "GPU", "Numeric", "MB");
            AddSensorFromProperty(gpuElement, "vram_usage_percent", sensors, collector, "GPU", "Numeric", "%");
            AddSensorFromProperty(gpuElement, "power_draw", sensors, collector, "GPU", "Numeric", "W");
            AddSensorFromProperty(gpuElement, "fan_speed", sensors, collector, "GPU", "Numeric", "RPM");
            AddSensorFromProperty(gpuElement, "fan_speed_percent", sensors, collector, "GPU", "Numeric", "%");
        }

        private void ProcessMemoryMetrics(JsonElement memoryElement, List<Model_Sensor> sensors, Model_Collector collector)
        {
            AddSensorFromProperty(memoryElement, "used", sensors, collector, "Memory", "Numeric", "MB");
            AddSensorFromProperty(memoryElement, "total", sensors, collector, "Memory", "Numeric", "MB");
            AddSensorFromProperty(memoryElement, "available", sensors, collector, "Memory", "Numeric", "MB");
            AddSensorFromProperty(memoryElement, "usage_percent", sensors, collector, "Memory", "Numeric", "%");
            AddSensorFromProperty(memoryElement, "swap_used", sensors, collector, "Memory", "Numeric", "MB");
            AddSensorFromProperty(memoryElement, "swap_total", sensors, collector, "Memory", "Numeric", "MB");
        }

        private void ProcessDiskMetrics(JsonElement diskElement, List<Model_Sensor> sensors, Model_Collector collector)
        {
            AddSensorFromProperty(diskElement, "used", sensors, collector, "Disk", "Numeric", "GB");
            AddSensorFromProperty(diskElement, "total", sensors, collector, "Disk", "Numeric", "GB");
            AddSensorFromProperty(diskElement, "free", sensors, collector, "Disk", "Numeric", "GB");
            AddSensorFromProperty(diskElement, "usage_percent", sensors, collector, "Disk", "Numeric", "%");
            AddSensorFromProperty(diskElement, "read_speed", sensors, collector, "Disk", "Numeric", "MB/s");
            AddSensorFromProperty(diskElement, "write_speed", sensors, collector, "Disk", "Numeric", "MB/s");
        }

        private void ProcessNetworkMetrics(JsonElement networkElement, List<Model_Sensor> sensors, Model_Collector collector)
        {
            AddSensorFromProperty(networkElement, "download_speed", sensors, collector, "Network", "Numeric", "MB/s");
            AddSensorFromProperty(networkElement, "upload_speed", sensors, collector, "Network", "Numeric", "MB/s");
            AddSensorFromProperty(networkElement, "bytes_sent", sensors, collector, "Network", "Numeric", "bytes");
            AddSensorFromProperty(networkElement, "bytes_received", sensors, collector, "Network", "Numeric", "bytes");
        }

        private void ProcessBatteryMetrics(JsonElement batteryElement, List<Model_Sensor> sensors, Model_Collector collector)
        {
            AddSensorFromProperty(batteryElement, "percent", sensors, collector, "Battery", "Numeric", "%");
            AddSensorFromProperty(batteryElement, "is_charging", sensors, collector, "Battery", "Boolean", "boolean");
            AddSensorFromProperty(batteryElement, "time_remaining", sensors, collector, "Battery", "Numeric", "minutes");
            AddSensorFromProperty(batteryElement, "power_draw", sensors, collector, "Battery", "Numeric", "W");
        }

        private (string value, string unit, string sensorTag) ExtractSensorMetadata(JsonElement element)
        {
            // Expect format: {value, unit, sensorTag}
            var valueString = element.TryGetProperty("value", out var valueElement)
                ? GetValueAsString(valueElement)
                : "";

            var unit = element.TryGetProperty("unit", out var unitElement)
                ? unitElement.GetString() ?? ""
                : "";

            var sensorTag = element.TryGetProperty("sensorTag", out var tagElement)
                ? tagElement.GetString() ?? ""
                : "";

            return (valueString, unit, sensorTag);
        }

        private void AddSensorFromProperty(JsonElement element, string propertyName, List<Model_Sensor> sensors,
            Model_Collector collector, string category, string sensorType, string _unusedFallbackUnit)
        {
            if (element.TryGetProperty(propertyName, out var property))
            {
                var (valueString, unit, sensorTag) = ExtractSensorMetadata(property);
                var friendlyName = ConvertToFriendlyName(propertyName);
                AddSensor(sensorTag, friendlyName, valueString, unit, sensors, collector, category, sensorType);
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
