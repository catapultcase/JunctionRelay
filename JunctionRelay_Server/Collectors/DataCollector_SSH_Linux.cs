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
using JunctionRelayServer.Services;
using System.Text.RegularExpressions;

namespace JunctionRelayServer.Collectors
{
    public class DataCollector_SSH_Linux : IDataCollector
    {
        private readonly Service_Manager_SSH _sshManager;
        private string? _deviceKey;

        public string CollectorName => "SSH_Linux";
        public int CollectorId { get; private set; }

        public DataCollector_SSH_Linux(Service_Manager_SSH sshManager)
        {
            _sshManager = sshManager;
        }

        public void ApplyConfiguration(Model_Collector collector)
        {
            CollectorId = collector.Id;

            // Build device key from collector URL
            var ip = "unknown";
            var port = 22;
            var username = "root";

            // Parse ssh://username@host:port format
            if (!string.IsNullOrEmpty(collector.URL))
            {
                var match = Regex.Match(collector.URL, @"ssh://([^@]+)@([^:]+):?(\d+)?");
                if (match.Success)
                {
                    username = match.Groups[1].Value;
                    ip = match.Groups[2].Value;
                    if (match.Groups[3].Success && int.TryParse(match.Groups[3].Value, out var parsedPort))
                    {
                        port = parsedPort;
                    }
                }
            }

            _deviceKey = $"{ip}:{port}:{username}";
        }

        public async Task<List<Model_Sensor>> FetchSensorsAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);

            if (string.IsNullOrEmpty(_deviceKey))
            {
                Console.WriteLine($"[SSH Linux Collector] Device key not configured for collector '{collector.Name}'");
                return new List<Model_Sensor>();
            }

            // If not connected, try to establish connection using collector's credentials
            if (!_sshManager.IsDeviceConnected(_deviceKey))
            {
                Console.WriteLine($"[SSH Linux Collector] Device {_deviceKey} not connected, attempting to connect...");

                // Parse the collector's URL and credentials
                var match = Regex.Match(collector.URL ?? "", @"ssh://([^@]+)@([^:]+):?(\d+)?");
                if (match.Success && !string.IsNullOrEmpty(collector.DecryptedAccessToken))
                {
                    var username = match.Groups[1].Value;
                    var host = match.Groups[2].Value;
                    var port = match.Groups[3].Success && int.TryParse(match.Groups[3].Value, out var parsedPort) ? parsedPort : 22;

                    // Determine if using key or password
                    bool useKeyAuth = collector.DecryptedAccessToken.StartsWith("KEY:");
                    string credential = useKeyAuth
                        ? collector.DecryptedAccessToken.Substring(4)
                        : collector.DecryptedAccessToken.StartsWith("PASS:")
                            ? collector.DecryptedAccessToken.Substring(5)
                            : collector.DecryptedAccessToken;

                    // Connect using SSH Manager
                    try
                    {
                        var connected = await _sshManager.ConnectDeviceAsync(host, port, username, credential, useKeyAuth);

                        if (!connected)
                        {
                            Console.WriteLine($"[SSH Linux Collector] Failed to connect to {_deviceKey}");
                            return new List<Model_Sensor>();
                        }

                        Console.WriteLine($"[SSH Linux Collector] Successfully connected to {_deviceKey}");
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[SSH Linux Collector] Error connecting to {_deviceKey}: {ex.Message}");
                        return new List<Model_Sensor>();
                    }
                }
                else
                {
                    Console.WriteLine($"[SSH Linux Collector] Invalid URL format or missing credentials for collector '{collector.Name}'");
                    return new List<Model_Sensor>();
                }
            }

            var sensors = new List<Model_Sensor>();

            // Collect various system metrics
            await CollectCpuMetrics(collector, sensors);
            await CollectMemoryMetrics(collector, sensors);
            await CollectDiskMetrics(collector, sensors);
            await CollectNetworkMetrics(collector, sensors);
            await CollectTemperatureMetrics(collector, sensors);
            await CollectLoadAverage(collector, sensors);
            await CollectUptimeMetrics(collector, sensors);

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

                if (string.IsNullOrEmpty(_deviceKey))
                {
                    return false;
                }

                // If not connected, try to establish connection
                if (!_sshManager.IsDeviceConnected(_deviceKey))
                {
                    var match = Regex.Match(collector.URL ?? "", @"ssh://([^@]+)@([^:]+):?(\d+)?");
                    if (match.Success && !string.IsNullOrEmpty(collector.DecryptedAccessToken))
                    {
                        var username = match.Groups[1].Value;
                        var host = match.Groups[2].Value;
                        var port = match.Groups[3].Success && int.TryParse(match.Groups[3].Value, out var parsedPort) ? parsedPort : 22;

                        bool useKeyAuth = collector.DecryptedAccessToken.StartsWith("KEY:");
                        string credential = useKeyAuth
                            ? collector.DecryptedAccessToken.Substring(4)
                            : collector.DecryptedAccessToken.StartsWith("PASS:")
                                ? collector.DecryptedAccessToken.Substring(5)
                                : collector.DecryptedAccessToken;

                        var connected = await _sshManager.ConnectDeviceAsync(host, port, username, credential, useKeyAuth);
                        if (!connected)
                        {
                            return false;
                        }
                    }
                    else
                    {
                        return false;
                    }
                }

                // Test with simple uptime command
                var (success, _, _) = await _sshManager.ExecuteHealthCheckAsync(_deviceKey, "uptime", "up");
                return success;
            }
            catch
            {
                return false;
            }
        }

        public Task StartSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default) => Task.CompletedTask;

        public async Task StopSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);

            // Disconnect when stopping the collector session
            if (!string.IsNullOrEmpty(_deviceKey) && _sshManager.IsDeviceConnected(_deviceKey))
            {
                Console.WriteLine($"[SSH Linux Collector] Disconnecting from {_deviceKey}");
                await _sshManager.ForceDisconnectDeviceAsync(_deviceKey);
            }

            return;
        }

        public bool IsConnected(Model_Collector collector)
        {
            ApplyConfiguration(collector);
            return !string.IsNullOrEmpty(_deviceKey) && _sshManager.IsDeviceConnected(_deviceKey);
        }

        // Private helper methods for collecting specific metrics

        private async Task CollectCpuMetrics(Model_Collector collector, List<Model_Sensor> sensors)
        {
            try
            {
                // Get CPU usage from top command
                var (success, _, output, _) = await _sshManager.ExecuteCommandAsync(
                    _deviceKey!,
                    "top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'",
                    5000
                );

                if (success && !string.IsNullOrWhiteSpace(output))
                {
                    if (double.TryParse(output.Trim(), out var cpuUsage))
                    {
                        sensors.Add(CreateSensor(
                            collector,
                            "cpu_usage",
                            "CPU Usage",
                            cpuUsage.ToString("F2"),
                            "%",
                            "CPU",
                            "Usage",
                            2
                        ));
                    }
                }

                // Get CPU count
                var (success2, _, output2, _) = await _sshManager.ExecuteCommandAsync(
                    _deviceKey!,
                    "nproc",
                    5000
                );

                if (success2 && !string.IsNullOrWhiteSpace(output2))
                {
                    if (int.TryParse(output2.Trim(), out var cpuCount))
                    {
                        sensors.Add(CreateSensor(
                            collector,
                            "cpu_count",
                            "CPU Cores",
                            cpuCount.ToString(),
                            "cores",
                            "CPU",
                            "Info",
                            0
                        ));
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SSH Linux Collector] Error collecting CPU metrics: {ex.Message}");
            }
        }

        private async Task CollectMemoryMetrics(Model_Collector collector, List<Model_Sensor> sensors)
        {
            try
            {
                var (success, _, output, _) = await _sshManager.ExecuteCommandAsync(
                    _deviceKey!,
                    "free -m | awk 'NR==2{printf \"TOTAL:%s USED:%s FREE:%s PERCENT:%.2f\", $2,$3,$4,$3*100/$2}'",
                    5000
                );

                if (success && !string.IsNullOrWhiteSpace(output))
                {
                    var match = Regex.Match(output, @"TOTAL:(\d+) USED:(\d+) FREE:(\d+) PERCENT:([\d.]+)");
                    if (match.Success)
                    {
                        sensors.Add(CreateSensor(collector, "memory_total", "Memory Total",
                            match.Groups[1].Value, "MB", "Memory", "Info", 0));

                        sensors.Add(CreateSensor(collector, "memory_used", "Memory Used",
                            match.Groups[2].Value, "MB", "Memory", "Usage", 0));

                        sensors.Add(CreateSensor(collector, "memory_free", "Memory Free",
                            match.Groups[3].Value, "MB", "Memory", "Usage", 0));

                        sensors.Add(CreateSensor(collector, "memory_percent", "Memory Usage",
                            match.Groups[4].Value, "%", "Memory", "Usage", 2));
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SSH Linux Collector] Error collecting memory metrics: {ex.Message}");
            }
        }

        private async Task CollectDiskMetrics(Model_Collector collector, List<Model_Sensor> sensors)
        {
            try
            {
                var (success, _, output, _) = await _sshManager.ExecuteCommandAsync(
                    _deviceKey!,
                    "df -h / | awk 'NR==2{printf \"SIZE:%s USED:%s AVAIL:%s PERCENT:%s\", $2,$3,$4,$5}'",
                    5000
                );

                if (success && !string.IsNullOrWhiteSpace(output))
                {
                    var match = Regex.Match(output, @"SIZE:(\S+) USED:(\S+) AVAIL:(\S+) PERCENT:(\d+)%");
                    if (match.Success)
                    {
                        sensors.Add(CreateSensor(collector, "disk_size", "Disk Size (Root)",
                            match.Groups[1].Value, "", "Disk", "Info", 0));

                        sensors.Add(CreateSensor(collector, "disk_used", "Disk Used (Root)",
                            match.Groups[2].Value, "", "Disk", "Usage", 0));

                        sensors.Add(CreateSensor(collector, "disk_available", "Disk Available (Root)",
                            match.Groups[3].Value, "", "Disk", "Usage", 0));

                        sensors.Add(CreateSensor(collector, "disk_percent", "Disk Usage (Root)",
                            match.Groups[4].Value, "%", "Disk", "Usage", 0));
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SSH Linux Collector] Error collecting disk metrics: {ex.Message}");
            }
        }

        private async Task CollectNetworkMetrics(Model_Collector collector, List<Model_Sensor> sensors)
        {
            try
            {
                // Get network interface stats
                var (success, _, output, _) = await _sshManager.ExecuteCommandAsync(
                    _deviceKey!,
                    "cat /proc/net/dev | grep -v 'lo:' | awk 'NR>2{print $1,$2,$10}' | head -1",
                    5000
                );

                if (success && !string.IsNullOrWhiteSpace(output))
                {
                    var parts = output.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length >= 3)
                    {
                        var iface = parts[0].TrimEnd(':');

                        if (long.TryParse(parts[1], out var rxBytes))
                        {
                            var rxMB = (rxBytes / 1024.0 / 1024.0).ToString("F2");
                            sensors.Add(CreateSensor(collector, $"net_{iface}_rx_bytes",
                                $"Network RX ({iface})", rxMB, "MB", "Network", "Traffic", 2));
                        }

                        if (long.TryParse(parts[2], out var txBytes))
                        {
                            var txMB = (txBytes / 1024.0 / 1024.0).ToString("F2");
                            sensors.Add(CreateSensor(collector, $"net_{iface}_tx_bytes",
                                $"Network TX ({iface})", txMB, "MB", "Network", "Traffic", 2));
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SSH Linux Collector] Error collecting network metrics: {ex.Message}");
            }
        }

        private async Task CollectTemperatureMetrics(Model_Collector collector, List<Model_Sensor> sensors)
        {
            try
            {
                // Method 1: Try lm-sensors (most common)
                var (success1, _, output1, _) = await _sshManager.ExecuteCommandAsync(
                    _deviceKey!,
                    "sensors 2>/dev/null",
                    5000
                );

                if (success1 && !string.IsNullOrWhiteSpace(output1))
                {
                    // Parse CPU package temperature
                    var packageMatch = Regex.Match(output1, @"Package id \d+:\s*\+?([\d.]+)°C", RegexOptions.IgnoreCase);
                    if (packageMatch.Success && double.TryParse(packageMatch.Groups[1].Value, out var pkgTemp))
                    {
                        sensors.Add(CreateSensor(collector, "cpu_package_temp", "CPU Package Temperature",
                            pkgTemp.ToString("F1"), "°C", "Temperature", "Sensor", 1));
                    }

                    // Parse individual core temperatures
                    var coreMatches = Regex.Matches(output1, @"Core (\d+):\s*\+?([\d.]+)°C", RegexOptions.IgnoreCase);
                    foreach (Match match in coreMatches)
                    {
                        if (int.TryParse(match.Groups[1].Value, out var coreNum) &&
                            double.TryParse(match.Groups[2].Value, out var coreTemp))
                        {
                            sensors.Add(CreateSensor(collector, $"cpu_core{coreNum}_temp",
                                $"CPU Core {coreNum} Temperature",
                                coreTemp.ToString("F1"), "°C", "Temperature", "Sensor", 1));
                        }
                    }

                    // Parse other temperature sensors (motherboard, GPU, etc.)
                    var tempMatches = Regex.Matches(output1, @"^([^:]+):\s*\+?([\d.]+)°C", RegexOptions.Multiline);
                    foreach (Match match in tempMatches)
                    {
                        var label = match.Groups[1].Value.Trim();
                        if (double.TryParse(match.Groups[2].Value, out var temp) &&
                            !label.StartsWith("Core") &&
                            !label.StartsWith("Package"))
                        {
                            var sensorId = $"temp_{Regex.Replace(label.ToLower(), @"[^a-z0-9]+", "_").Trim('_')}";
                            sensors.Add(CreateSensor(collector, sensorId, $"{label} Temperature",
                                temp.ToString("F1"), "°C", "Temperature", "Sensor", 1));
                        }
                    }
                }

                // Method 2: Try thermal_zone (common on embedded systems and some laptops)
                var (success2, _, output2, _) = await _sshManager.ExecuteCommandAsync(
                    _deviceKey!,
                    "for zone in /sys/class/thermal/thermal_zone*/temp; do [ -f \"$zone\" ] && echo \"$zone:$(cat $zone)\"; done",
                    5000
                );

                if (success2 && !string.IsNullOrWhiteSpace(output2))
                {
                    var lines = output2.Split('\n', StringSplitOptions.RemoveEmptyEntries);
                    foreach (var line in lines)
                    {
                        var parts = line.Split(':');
                        if (parts.Length == 2)
                        {
                            var zoneMatch = Regex.Match(parts[0], @"thermal_zone(\d+)");
                            if (zoneMatch.Success && int.TryParse(parts[1], out var milliTemp))
                            {
                                var tempC = milliTemp / 1000.0;
                                var zoneNum = zoneMatch.Groups[1].Value;

                                // Only add if reasonable temperature (0-150°C)
                                if (tempC > 0 && tempC < 150)
                                {
                                    sensors.Add(CreateSensor(collector, $"thermal_zone{zoneNum}_temp",
                                        $"Thermal Zone {zoneNum}",
                                        tempC.ToString("F1"), "°C", "Temperature", "Sensor", 1));
                                }
                            }
                        }
                    }
                }

                // Method 3: Try hwmon interface (alternative sensor reading)
                var (success3, _, output3, _) = await _sshManager.ExecuteCommandAsync(
                    _deviceKey!,
                    "for hwmon in /sys/class/hwmon/hwmon*/temp*_input; do [ -f \"$hwmon\" ] && echo \"$hwmon:$(cat $hwmon)\"; done | head -10",
                    5000
                );

                if (success3 && !string.IsNullOrWhiteSpace(output3))
                {
                    var lines = output3.Split('\n', StringSplitOptions.RemoveEmptyEntries);
                    foreach (var line in lines)
                    {
                        var parts = line.Split(':');
                        if (parts.Length == 2)
                        {
                            var hwmonMatch = Regex.Match(parts[0], @"hwmon(\d+)/temp(\d+)_input");
                            if (hwmonMatch.Success && int.TryParse(parts[1], out var milliTemp))
                            {
                                var tempC = milliTemp / 1000.0;
                                var hwmonNum = hwmonMatch.Groups[1].Value;
                                var tempNum = hwmonMatch.Groups[2].Value;

                                // Only add if reasonable temperature
                                if (tempC > 0 && tempC < 150)
                                {
                                    sensors.Add(CreateSensor(collector, $"hwmon{hwmonNum}_temp{tempNum}",
                                        $"HWMon {hwmonNum} Temp {tempNum}",
                                        tempC.ToString("F1"), "°C", "Temperature", "Sensor", 1));
                                }
                            }
                        }
                    }
                }

                // Method 4: Raspberry Pi specific temperature
                var (success4, _, output4, _) = await _sshManager.ExecuteCommandAsync(
                    _deviceKey!,
                    "[ -f /sys/class/thermal/thermal_zone0/temp ] && cat /sys/class/thermal/thermal_zone0/temp",
                    5000
                );

                if (success4 && !string.IsNullOrWhiteSpace(output4))
                {
                    if (int.TryParse(output4.Trim(), out var milliTemp))
                    {
                        var tempC = milliTemp / 1000.0;
                        if (tempC > 0 && tempC < 150)
                        {
                            sensors.Add(CreateSensor(collector, "soc_temp", "SoC Temperature",
                                tempC.ToString("F1"), "°C", "Temperature", "Sensor", 1));
                        }
                    }
                }

                // If no temperatures found, log it
                if (!sensors.Any(s => s.Category == "Temperature"))
                {
                    Console.WriteLine($"[SSH Linux Collector] No temperature sensors found for {_deviceKey}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SSH Linux Collector] Error collecting temperature metrics: {ex.Message}");
            }
        }

        private async Task CollectLoadAverage(Model_Collector collector, List<Model_Sensor> sensors)
        {
            try
            {
                var (success, _, output, _) = await _sshManager.ExecuteCommandAsync(
                    _deviceKey!,
                    "cat /proc/loadavg | awk '{print $1,$2,$3}'",
                    5000
                );

                if (success && !string.IsNullOrWhiteSpace(output))
                {
                    var parts = output.Trim().Split(' ');
                    if (parts.Length >= 3)
                    {
                        sensors.Add(CreateSensor(collector, "load_1min", "Load Average (1min)",
                            parts[0], "", "System", "Load", 2));

                        sensors.Add(CreateSensor(collector, "load_5min", "Load Average (5min)",
                            parts[1], "", "System", "Load", 2));

                        sensors.Add(CreateSensor(collector, "load_15min", "Load Average (15min)",
                            parts[2], "", "System", "Load", 2));
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SSH Linux Collector] Error collecting load average: {ex.Message}");
            }
        }

        private async Task CollectUptimeMetrics(Model_Collector collector, List<Model_Sensor> sensors)
        {
            try
            {
                var (success, _, output, _) = await _sshManager.ExecuteCommandAsync(
                    _deviceKey!,
                    "cat /proc/uptime | awk '{print $1}'",
                    5000
                );

                if (success && !string.IsNullOrWhiteSpace(output))
                {
                    if (double.TryParse(output.Trim(), out var uptimeSeconds))
                    {
                        var uptimeDays = (uptimeSeconds / 86400.0).ToString("F2");

                        sensors.Add(CreateSensor(collector, "uptime_seconds", "Uptime",
                            uptimeSeconds.ToString("F0"), "seconds", "System", "Info", 0));

                        sensors.Add(CreateSensor(collector, "uptime_days", "Uptime",
                            uptimeDays, "days", "System", "Info", 2));
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SSH Linux Collector] Error collecting uptime metrics: {ex.Message}");
            }
        }

        private Model_Sensor CreateSensor(
            Model_Collector collector,
            string externalId,
            string name,
            string value,
            string unit,
            string category,
            string sensorType,
            int decimalPlaces)
        {
            return new Model_Sensor
            {
                ExternalId = externalId,
                Name = name,
                Value = value,
                Unit = unit,
                DecimalPlaces = decimalPlaces,
                Category = category,
                DeviceName = collector.Name,
                SensorType = sensorType,
                SensorTag = externalId,
                ComponentName = externalId,
                JunctionId = null,
                DeviceId = null,
                CollectorId = collector.Id,
                LastUpdated = DateTime.UtcNow
            };
        }
    }
}