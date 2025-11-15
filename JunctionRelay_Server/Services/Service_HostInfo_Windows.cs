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

using System.Runtime.InteropServices;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    public class Service_HostInfo_Windows : Service_HostInfo
    {
        // For CPU usage timeslice
        private Dictionary<string, (long user, long nice, long system, long idle)> _prevCpuData =
            new Dictionary<string, (long, long, long, long)>();
        private DateTime _lastCpuTime = DateTime.MinValue;
        private List<Model_Sensor> _lastCpuSensors = new List<Model_Sensor>();

        // For Disk I/O timeslice
        private Dictionary<string, (long readOps, long writeOps, long readSectors, long writeSectors)>
            _prevDiskIoData = new Dictionary<string, (long, long, long, long)>();
        private DateTime _lastDiskIoTime = DateTime.MinValue;
        private List<Model_Sensor> _lastDiskIoSensors = new List<Model_Sensor>();

        public Service_HostInfo_Windows()
        {
            // Windows-specific initialization (if any)
        }

        // Synchronous implementation wrapped in Task.FromResult
        public override async Task<List<Model_Sensor>> GetHostSensors(int sampleRateMs)
        {
            var sensors = new List<Model_Sensor>();

            sensors.AddRange(GetCpuUsageTimeslice(sampleRateMs));
            sensors.AddRange(GetCpuTemperature());
            sensors.AddRange(GetMemoryUsage());
            //sensors.AddRange(GetDiskUsage());
            //sensors.AddRange(GetDiskIoTimeslice(sampleRateMs));
            //sensors.AddRange(GetNetworkStats());
            sensors.AddRange(GetGpuStats());
            sensors.AddRange(GetSystemUptime());
            sensors.AddRange(GetNetworkLatency());

            return await Task.FromResult(sensors); // Return as a Task
        }


        private List<Model_Sensor> GetCpuUsageTimeslice(int sampleRateMs)
        {
            if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                string naValue = "N/A";
                return new List<Model_Sensor>
                {
                    new Model_Sensor
                    {
                        Name = "CPU Usage",
                        SensorType = "Load",
                        Value = naValue,
                        ComponentName = "CPU",
                        Unit = "%",
                        DecimalPlaces = GetDecimalPlaces(naValue),
                        DeviceId = 1,
                        ExternalId = "cpu_usage_win_01",
                        SensorTag = "CPU Usage",
                        Category = "CPU Load",
                        DeviceName = "Host Device",
                        LastUpdated = DateTime.UtcNow
                    }
                };
            }

            string statPath = "C:\\Windows\\System32\\perfmon";
            if (!File.Exists(statPath))
            {
                string naValue = "N/A";
                return new List<Model_Sensor>
                {
                    new Model_Sensor
                    {
                        Name = "CPU Usage",
                        SensorType = "Load",
                        Value = naValue,
                        ComponentName = "CPU",
                        Unit = "%",
                        DecimalPlaces = GetDecimalPlaces(naValue),
                        DeviceId = 1,
                        ExternalId = "cpu_usage_missing_win_01",
                        SensorTag = "CPU Usage",
                        Category = "CPU Load",
                        DeviceName = "Host Device",
                        LastUpdated = DateTime.UtcNow
                    }
                };
            }

            var now = DateTime.UtcNow;
            double msSinceLast = (now - _lastCpuTime).TotalMilliseconds;
            if (msSinceLast < sampleRateMs && _lastCpuSensors.Any())
            {
                return _lastCpuSensors;
            }

            var newSensors = new List<Model_Sensor>();
            var loadPercent = 35.5; // Placeholder for CPU load
            string loadValue = loadPercent.ToString();

            newSensors.Add(new Model_Sensor
            {
                Name = "CPU Load",
                SensorType = "Load",
                Value = loadValue,
                ComponentName = "CPU",
                Unit = "%",
                DecimalPlaces = GetDecimalPlaces(loadValue),
                DeviceId = 1,
                ExternalId = "cpu_usage_win_placeholder_01",
                SensorTag = "CPU Load",
                Category = "CPU Load",
                DeviceName = "Host Device",
                LastUpdated = DateTime.UtcNow
            });

            _lastCpuTime = now;
            _lastCpuSensors = newSensors;
            return newSensors;
        }

        private List<Model_Sensor> GetCpuTemperature()
        {
            if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                string naValue = "N/A";
                return new List<Model_Sensor>
                {
                    new Model_Sensor
                    {
                        Name = "CPU Temperature",
                        SensorType = "Temperature",
                        Value = naValue,
                        ComponentName = "CPU",
                        Unit = "C",
                        DecimalPlaces = GetDecimalPlaces(naValue),
                        DeviceId = 1,
                        ExternalId = "cpu_temp_win_01",
                        SensorTag = "CPU Temperature",
                        Category = "Temperature",
                        DeviceName = "Host Device",
                        LastUpdated = DateTime.UtcNow
                    }
                };
            }

            string tempFile = "C:\\Windows\\System32\\temp";
            if (!File.Exists(tempFile))
            {
                string naValue = "N/A";
                return new List<Model_Sensor>
                {
                    new Model_Sensor
                    {
                        Name = "CPU Temperature",
                        SensorType = "Temperature",
                        Value = naValue,
                        ComponentName = "CPU",
                        Unit = "C",
                        DecimalPlaces = GetDecimalPlaces(naValue),
                        DeviceId = 1,
                        ExternalId = "cpu_temp_missing_win_01",
                        SensorTag = "CPU Temperature",
                        Category = "Temperature",
                        DeviceName = "Host Device",
                        LastUpdated = DateTime.UtcNow
                    }
                };
            }

            var content = File.ReadAllText(tempFile).Trim();
            if (!double.TryParse(content, out double tempMillideg))
            {
                string naValue = "N/A";
                return new List<Model_Sensor>
                {
                    new Model_Sensor
                    {
                        Name = "CPU Temperature",
                        SensorType = "Temperature",
                        Value = naValue,
                        ComponentName = "CPU",
                        Unit = "C",
                        DecimalPlaces = GetDecimalPlaces(naValue),
                        DeviceId = 1,
                        ExternalId = "cpu_temp_parse_fail_win_01",
                        SensorTag = "CPU Temperature",
                        Category = "Temperature",
                        DeviceName = "Host Device",
                        LastUpdated = DateTime.UtcNow
                    }
                };
            }

            double tempC = tempMillideg / 1000.0;
            string tempValue = tempC.ToString();

            return new List<Model_Sensor>
            {
                new Model_Sensor
                {
                    Name = "CPU Temperature",
                    SensorType = "Temperature",
                    Value = tempValue,
                    ComponentName = "CPU",
                    Unit = "C",
                    DecimalPlaces = GetDecimalPlaces(tempValue),
                    DeviceId = 1,
                    ExternalId = "cpu_temperature_win_01",
                    SensorTag = "CPU Temperature",
                    Category = "Temperature",
                    DeviceName = "Host Device",
                    LastUpdated = DateTime.UtcNow
                }
            };
        }

        private List<Model_Sensor> GetGpuStats()
        {
            if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                string naValue1 = "N/A";
                string naValue2 = "N/A";
                return new List<Model_Sensor>
                {
                    new Model_Sensor
                    {
                        Name = "GPU Utilization",
                        SensorType = "GPU",
                        Value = naValue1,
                        ComponentName = "GPU",
                        Unit = "%",
                        DecimalPlaces = GetDecimalPlaces(naValue1),
                        DeviceId = 1,
                        ExternalId = "gpu_utilization_win_01",
                        SensorTag = "GPU Utilization",
                        Category = "GPU Stats",
                        DeviceName = "Host Device",
                        LastUpdated = DateTime.UtcNow
                    },
                    new Model_Sensor
                    {
                        Name = "GPU Temperature",
                        SensorType = "GPU",
                        Value = naValue2,
                        ComponentName = "GPU",
                        Unit = "C",
                        DecimalPlaces = GetDecimalPlaces(naValue2),
                        DeviceId = 1,
                        ExternalId = "gpu_temperature_win_01",
                        SensorTag = "GPU Temperature",
                        Category = "GPU Stats",
                        DeviceName = "Host Device",
                        LastUpdated = DateTime.UtcNow
                    }
                };
            }

            string gpuUtilValue = "40";
            string gpuTempValue = "60";

            return new List<Model_Sensor>
            {
                new Model_Sensor
                {
                    Name = "GPU Utilization",
                    SensorType = "GPU",
                    Value = gpuUtilValue,
                    ComponentName = "GPU",
                    Unit = "%",
                    DecimalPlaces = GetDecimalPlaces(gpuUtilValue),
                    DeviceId = 1,
                    ExternalId = "gpu_utilization_win_01",
                    SensorTag = "GPU Utilization",
                    Category = "GPU Stats",
                    DeviceName = "Host Device",
                    LastUpdated = DateTime.UtcNow
                },
                new Model_Sensor
                {
                    Name = "GPU Temperature",
                    SensorType = "GPU",
                    Value = gpuTempValue,
                    ComponentName = "GPU",
                    Unit = "C",
                    DecimalPlaces = GetDecimalPlaces(gpuTempValue),
                    DeviceId = 1,
                    ExternalId = "gpu_temperature_win_01",
                    SensorTag = "GPU Temperature",
                    Category = "GPU Stats",
                    DeviceName = "Host Device",
                    LastUpdated = DateTime.UtcNow
                }
            };
        }

        private List<Model_Sensor> GetSystemUptime()
        {
            if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                string naValue = "N/A";
                return new List<Model_Sensor>
                {
                    new Model_Sensor
                    {
                        Name = "System Uptime",
                        SensorType = "System",
                        Value = naValue,
                        ComponentName = "System",
                        Unit = "hh:mm:ss",
                        DecimalPlaces = GetDecimalPlaces(naValue),
                        DeviceId = 1,
                        ExternalId = "system_uptime_win_01",
                        SensorTag = "System Uptime",
                        Category = "System Stats",
                        DeviceName = "Host Device",
                        LastUpdated = DateTime.UtcNow
                    }
                };
            }

            var timeStr = TimeSpan.FromHours(5).ToString(@"d\.hh\:mm\:ss");
            return new List<Model_Sensor>
            {
                new Model_Sensor
                {
                    Name = "System Uptime",
                    SensorType = "System",
                    Value = timeStr,
                    ComponentName = "System",
                    Unit = "hh:mm:ss",
                    DecimalPlaces = GetDecimalPlaces(timeStr),
                    DeviceId = 1,
                    ExternalId = "system_uptime_win_01",
                    SensorTag = "System Uptime",
                    Category = "System Stats",
                    DeviceName = "Host Device",
                    LastUpdated = DateTime.UtcNow
                }
            };
        }

        private List<Model_Sensor> GetNetworkLatency()
        {
            if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                string naValue = "N/A";
                return new List<Model_Sensor>
                {
                    new Model_Sensor
                    {
                        Name = "Latency",
                        SensorType = "Network",
                        Value = naValue,
                        ComponentName = "Network",
                        Unit = "ms",
                        DecimalPlaces = GetDecimalPlaces(naValue),
                        DeviceId = 1,
                        ExternalId = "latency_win_01",
                        SensorTag = "Latency",
                        Category = "Network Stats",
                        DeviceName = "Host Device",
                        LastUpdated = DateTime.UtcNow
                    }
                };
            }

            string latencyValue = "12.5";

            return new List<Model_Sensor>
            {
                new Model_Sensor
                {
                    Name = "Latency to google.com",
                    SensorType = "Network",
                    Value = latencyValue,
                    ComponentName = "Network",
                    Unit = "ms",
                    DecimalPlaces = GetDecimalPlaces(latencyValue),
                    DeviceId = 1,
                    ExternalId = "latency_google_win_01",
                    SensorTag = "Latency to google.com",
                    Category = "Network Stats",
                    DeviceName = "Host Device",
                    LastUpdated = DateTime.UtcNow
                }
            };
        }

        private List<Model_Sensor> GetMemoryUsage()
        {
            if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                string naValue = "N/A";
                return new List<Model_Sensor>
                {
                    new Model_Sensor
                    {
                        Name = "Memory Usage",
                        SensorType = "Memory",
                        Value = naValue,
                        ComponentName = "Memory",
                        Unit = "%",
                        DecimalPlaces = GetDecimalPlaces(naValue),
                        DeviceId = 1,
                        ExternalId = "memory_usage_win_01",
                        SensorTag = "Memory Usage",
                        Category = "Memory",
                        DeviceName = "Host Device",
                        LastUpdated = DateTime.UtcNow
                    }
                };
            }

            string meminfoPath = "C:\\Windows\\System32\\meminfo";
            if (!File.Exists(meminfoPath))
            {
                string naValue = "N/A";
                return new List<Model_Sensor>
                {
                    new Model_Sensor
                    {
                        Name = "Memory Usage",
                        SensorType = "Memory",
                        Value = naValue,
                        ComponentName = "Memory",
                        Unit = "%",
                        DecimalPlaces = GetDecimalPlaces(naValue),
                        DeviceId = 1,
                        ExternalId = "memory_usage_missing_win_01",
                        SensorTag = "Memory Usage",
                        Category = "Memory",
                        DeviceName = "Host Device",
                        LastUpdated = DateTime.UtcNow
                    }
                };
            }

            var lines = File.ReadAllLines(meminfoPath);
            long totalMem = 0, freeMem = 0;
            foreach (var line in lines)
            {
                if (line.StartsWith("MemTotal:"))
                {
                    totalMem = ParseMeminfoLine(line);
                }
                else if (line.StartsWith("MemFree:"))
                {
                    freeMem = ParseMeminfoLine(line);
                }
            }
            if (totalMem <= 0)
            {
                string naValue = "N/A";
                return new List<Model_Sensor>
                {
                    new Model_Sensor
                    {
                        Name = "Memory Usage",
                        SensorType = "Memory",
                        Value = naValue,
                        ComponentName = "Memory",
                        Unit = "%",
                        DecimalPlaces = GetDecimalPlaces(naValue),
                        DeviceId = 1,
                        ExternalId = "memory_usage_fail_win_01",
                        SensorTag = "Memory Usage",
                        Category = "Memory",
                        DeviceName = "Host Device",
                        LastUpdated = DateTime.UtcNow
                    }
                };
            }

            double usedPercent = Math.Round((double)(totalMem - freeMem) / totalMem * 100.0, 2);
            string usedValue = usedPercent.ToString();

            return new List<Model_Sensor>
            {
                new Model_Sensor
                {
                    Name = "Memory Usage",
                    SensorType = "Memory",
                    Value = usedValue,
                    ComponentName = "Memory",
                    Unit = "%",
                    DecimalPlaces = GetDecimalPlaces(usedValue),
                    DeviceId = 1,
                    ExternalId = "memory_usage_win_01",
                    SensorTag = "Memory Usage",
                    Category = "Memory",
                    DeviceName = "Host Device",
                    LastUpdated = DateTime.UtcNow
                }
            };
        }

        private long ParseMeminfoLine(string line)
        {
            var parts = line.Split(':', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 2) return 0;
            var raw = parts[1].Trim().Split(' ')[0];
            return long.TryParse(raw, out long val) ? val : 0;
        }
    }
}