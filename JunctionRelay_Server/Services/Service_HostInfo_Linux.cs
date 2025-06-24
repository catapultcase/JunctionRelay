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

using JunctionRelayServer.Models; // Make sure the Model_Sensor is imported

namespace JunctionRelayServer.Services
{
    public class Service_HostInfo_Linux : Service_HostInfo
    {
        // For CPU usage timeslice
        private Dictionary<string, (long user, long nice, long system, long idle)> _prevCpuData
            = new Dictionary<string, (long, long, long, long)>();
        private DateTime _lastCpuTime = DateTime.MinValue;
        private List<Model_Sensor> _lastCpuSensors = new List<Model_Sensor>();

        // For Disk I/O timeslice
        private Dictionary<string, (long readOps, long writeOps, long readSectors, long writeSectors)>
            _prevDiskIoData = new Dictionary<string, (long, long, long, long)>();
        private DateTime _lastDiskIoTime = DateTime.MinValue;
        private List<Model_Sensor> _lastDiskIoSensors = new List<Model_Sensor>();

        public Service_HostInfo_Linux()
        {
            // Linux-specific initialization (if any)
        }

        // Return type updated to Task<IEnumerable<object>> to match the base class,
        // but we'll return List<Model_Sensor> internally, then cast to IEnumerable<object>.
        public override async Task<List<Model_Sensor>> GetHostSensors(int sampleRateMs)
        {
            var sensors = new List<Model_Sensor>();

            sensors.AddRange(GetCpuUsageTimeslice(sampleRateMs));
            sensors.AddRange(GetCpuTemperature());
            sensors.AddRange(GetMemoryUsage());
            sensors.AddRange(GetDiskUsage());
            sensors.AddRange(GetDiskIoTimeslice(sampleRateMs));
            sensors.AddRange(GetNetworkStats());
            sensors.AddRange(GetGpuStats());
            sensors.AddRange(GetSystemUptime());
            sensors.AddRange(GetNetworkLatency());

            return await Task.FromResult(sensors); // Return as a Task
        }

        // Collects CPU Usage statistics
        private List<Model_Sensor> GetCpuUsageTimeslice(int sampleRateMs)
        {
            string statPath = "/proc/stat";
            if (!File.Exists(statPath))
            {
                return new List<Model_Sensor>
                {
                    new Model_Sensor
                    {
                        Name = "CPU Usage",
                        SensorType = "Load",
                        Value = "N/A",
                        ComponentName = "CPU",
                        Unit = "%",
                        DeviceId = 1,
                        ExternalId = "cpu_usage_linux_missing",
                        SensorTag = "CPU Usage",  // Set SensorTag equal to Name
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
            var lines = File.ReadAllLines(statPath)
                .Where(l => l.StartsWith("cpu")); // "cpu", "cpu0", "cpu1", etc.

            foreach (var line in lines)
            {
                var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 5) continue;

                string cpuName = parts[0]; // e.g. "cpu", "cpu0"
                if (!long.TryParse(parts[1], out long user)) user = 0;
                if (!long.TryParse(parts[2], out long nice)) nice = 0;
                if (!long.TryParse(parts[3], out long system)) system = 0;
                if (!long.TryParse(parts[4], out long idle)) idle = 0;

                if (!_prevCpuData.TryGetValue(cpuName, out var prev))
                {
                    // Store the initial values so we can compute deltas next time
                    _prevCpuData[cpuName] = (user, nice, system, idle);
                    continue; // Skip first sample (no delta)
                }

                long deltaUser = user - prev.user;
                long deltaNice = nice - prev.nice;
                long deltaSystem = system - prev.system;
                long deltaIdle = idle - prev.idle;
                long deltaTotal = deltaUser + deltaNice + deltaSystem + deltaIdle;

                double loadPercent = 0;
                if (deltaTotal > 0)
                {
                    long active = deltaUser + deltaNice + deltaSystem;
                    loadPercent = Math.Round(active / (double)deltaTotal * 100.0, 2);
                }

                // Update the dictionary with new values
                _prevCpuData[cpuName] = (user, nice, system, idle);

                newSensors.Add(new Model_Sensor
                {
                    Name = $"CPU {cpuName} Load",
                    SensorType = "Load",
                    Value = loadPercent.ToString(),
                    ComponentName = "CPU",
                    Unit = "%",
                    DeviceId = 1,
                    ExternalId = $"{cpuName}_load",
                    SensorTag = $"CPU {cpuName} Load",  // Set SensorTag equal to Name
                    Category = "CPU Load",
                    DeviceName = "Host Device",
                    LastUpdated = DateTime.UtcNow
                });
            }

            _lastCpuTime = now;
            _lastCpuSensors = newSensors;
            return newSensors;
        }

        // Collects CPU Temperature
        private List<Model_Sensor> GetCpuTemperature()
        {
            string tempFile = "/sys/class/thermal/thermal_zone0/temp";
            if (!File.Exists(tempFile))
            {
                return new List<Model_Sensor>
                {
                    new Model_Sensor
                    {
                        Name = "CPU Temperature",
                        SensorType = "Temperature",
                        Value = "N/A",
                        ComponentName = "CPU",
                        Unit = "C",
                        DeviceId = 1,
                        ExternalId = "cpu_temp_missing",
                        SensorTag = "CPU Temperature",  // Set SensorTag equal to Name
                        Category = "Temperature",
                        DeviceName = "Host Device",
                        LastUpdated = DateTime.UtcNow
                    }
                };
            }

            var content = File.ReadAllText(tempFile).Trim();
            if (!double.TryParse(content, out double tempMillideg))
            {
                return new List<Model_Sensor>
                {
                    new Model_Sensor
                    {
                        Name = "CPU Temperature",
                        SensorType = "Temperature",
                        Value = "N/A",
                        ComponentName = "CPU",
                        Unit = "C",
                        DeviceId = 1,
                        ExternalId = "cpu_temp_parse_fail",
                        SensorTag = "CPU Temperature",  // Set SensorTag equal to Name
                        Category = "Temperature",
                        DeviceName = "Host Device",
                        LastUpdated = DateTime.UtcNow
                    }
                };
            }

            double tempC = tempMillideg / 1000.0;
            return new List<Model_Sensor>
            {
                new Model_Sensor
                {
                    Name = "CPU Temperature",
                    SensorType = "Temperature",
                    Value = tempC.ToString(),
                    ComponentName = "CPU",
                    Unit = "C",
                    DeviceId = 1,
                    ExternalId = "cpu_temperature",
                    SensorTag = "CPU Temperature",  // Set SensorTag equal to Name
                    Category = "Temperature",
                    DeviceName = "Host Device",
                    LastUpdated = DateTime.UtcNow
                }
            };
        }

        // Collects Memory Usage
        private List<Model_Sensor> GetMemoryUsage()
        {
            string meminfoPath = "/proc/meminfo";
            if (!File.Exists(meminfoPath))
            {
                return new List<Model_Sensor>
                {
                    new Model_Sensor
                    {
                        Name = "Memory Usage",
                        SensorType = "Memory",
                        Value = "N/A",
                        ComponentName = "Memory",
                        Unit = "%",
                        DeviceId = 1,
                        ExternalId = "memory_usage_missing",
                        SensorTag = "Memory Usage",  // Set SensorTag equal to Name
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
                return new List<Model_Sensor>
                {
                    new Model_Sensor
                    {
                        Name = "Memory Usage",
                        SensorType = "Memory",
                        Value = "N/A",
                        ComponentName = "Memory",
                        Unit = "%",
                        DeviceId = 1,
                        ExternalId = "memory_usage_fail",
                        SensorTag = "Memory Usage",  // Set SensorTag equal to Name
                        Category = "Memory",
                        DeviceName = "Host Device",
                        LastUpdated = DateTime.UtcNow
                    }
                };
            }

            double usedPercent = Math.Round((double)(totalMem - freeMem) / totalMem * 100.0, 2);
            return new List<Model_Sensor>
            {
                new Model_Sensor
                {
                    Name = "Memory Usage",
                    SensorType = "Memory",
                    Value = usedPercent.ToString(),
                    ComponentName = "Memory",
                    Unit = "%",
                    DeviceId = 1,
                    ExternalId = "memory_usage",
                    SensorTag = "Memory Usage",  // Set SensorTag equal to Name
                    Category = "Memory",
                    DeviceName = "Host Device",
                    LastUpdated = DateTime.UtcNow
                }
            };
        }

        // Helper to parse /proc/meminfo lines
        private long ParseMeminfoLine(string line)
        {
            var parts = line.Split(':', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 2) return 0;
            var raw = parts[1].Trim().Split(' ')[0];
            return long.TryParse(raw, out long val) ? val : 0;
        }

        // Collects Disk Usage
        private List<Model_Sensor> GetDiskUsage()
        {
            var diskList = new List<Model_Sensor>();
            foreach (var drive in DriveInfo.GetDrives())
            {
                if (!drive.IsReady) continue;
                double usage = Math.Round((double)(drive.TotalSize - drive.AvailableFreeSpace) / drive.TotalSize * 100.0, 2);

                diskList.Add(new Model_Sensor
                {
                    Name = $"Disk {drive.Name} Usage",
                    SensorType = "Disk",
                    Value = usage.ToString(),
                    ComponentName = "Disk",
                    Unit = "%",
                    DeviceId = 1,
                    ExternalId = $"disk_{drive.Name.Replace(":", "")}_usage",
                    SensorTag = $"Disk {drive.Name} Usage",  // Set SensorTag equal to Name
                    Category = "Disk Usage",
                    DeviceName = "Host Device",
                    LastUpdated = DateTime.UtcNow
                });
            }
            if (!diskList.Any())
            {
                diskList.Add(new Model_Sensor
                {
                    Name = "Disk Usage",
                    SensorType = "Disk",
                    Value = "N/A",
                    ComponentName = "Disk",
                    Unit = "%",
                    DeviceId = 1,
                    ExternalId = "disk_usage_none",
                    SensorTag = "Disk Usage",  // Set SensorTag equal to Name
                    Category = "Disk Usage",
                    DeviceName = "Host Device",
                    LastUpdated = DateTime.UtcNow
                });
            }
            return diskList;
        }

        // Collects Disk I/O
        private List<Model_Sensor> GetDiskIoTimeslice(int sampleRateMs)
        {
            var now = DateTime.UtcNow;
            double msSinceLast = (now - _lastDiskIoTime).TotalMilliseconds;

            // Return cached data if we haven't hit sampleRateMs yet
            if (msSinceLast < sampleRateMs && _lastDiskIoSensors.Any())
            {
                return _lastDiskIoSensors;
            }

            var newSensors = new List<Model_Sensor>();
            const string diskstatsPath = "/proc/diskstats";

            if (!File.Exists(diskstatsPath))
            {
                newSensors.Add(new Model_Sensor
                {
                    Name = "Disk I/O",
                    SensorType = "DiskIO",
                    Value = "N/A",
                    ComponentName = "Disk",
                    Unit = "ops",
                    DeviceId = 1,
                    ExternalId = "disk_io_missing",
                    SensorTag = "Disk I/O",  // Set SensorTag equal to Name
                    Category = "Disk I/O",
                    DeviceName = "Host Device",
                    LastUpdated = DateTime.UtcNow
                });
                _lastDiskIoSensors = newSensors;
                _lastDiskIoTime = now;
                return newSensors;
            }

            var lines = File.ReadAllLines(diskstatsPath);
            foreach (var line in lines)
            {
                var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 14) continue;

                string diskName = parts[2];
                if (diskName.StartsWith("loop")) continue; // skip loop devices

                if (!_prevDiskIoData.ContainsKey(diskName))
                {
                    // Initialize the dictionary for the disk
                    _prevDiskIoData[diskName] = (0L, 0L, 0L, 0L);
                }

                long.TryParse(parts[3], out long readsCompleted);
                long.TryParse(parts[5], out long readSectors);
                long.TryParse(parts[7], out long writesCompleted);
                long.TryParse(parts[9], out long writeSectors);

                var prev = _prevDiskIoData[diskName];
                long deltaReads = readsCompleted - prev.readOps;
                long deltaWrites = writesCompleted - prev.writeOps;
                long deltaRdSect = readSectors - prev.readSectors;
                long deltaWrSect = writeSectors - prev.writeSectors;

                // Update
                _prevDiskIoData[diskName] = (readsCompleted, writesCompleted, readSectors, writeSectors);

                double secondsElapsed = msSinceLast / 1000.0;
                double readMBs = 0.0;
                double writeMBs = 0.0;
                if (secondsElapsed > 0)
                {
                    readMBs = Math.Round((deltaRdSect * 512.0 / 1024.0 / 1024.0) / secondsElapsed, 2);
                    writeMBs = Math.Round((deltaWrSect * 512.0 / 1024.0 / 1024.0) / secondsElapsed, 2);
                }

                newSensors.Add(new Model_Sensor
                {
                    Name = $"Disk {diskName} Read Ops",
                    SensorType = "DiskIO",
                    Value = deltaReads.ToString(),
                    ComponentName = "Disk",
                    Unit = "ops",
                    DeviceId = 1,
                    ExternalId = $"disk_{diskName}_read_ops",
                    SensorTag = $"Disk {diskName} Read Ops",  // Set SensorTag equal to Name
                    Category = "Disk I/O",
                    DeviceName = "Host Device",
                    LastUpdated = DateTime.UtcNow
                });
                newSensors.Add(new Model_Sensor
                {
                    Name = $"Disk {diskName} Write Ops",
                    SensorType = "DiskIO",
                    Value = deltaWrites.ToString(),
                    ComponentName = "Disk",
                    Unit = "ops",
                    DeviceId = 1,
                    ExternalId = $"disk_{diskName}_write_ops",
                    SensorTag = $"Disk {diskName} Write Ops",  // Set SensorTag equal to Name
                    Category = "Disk I/O",
                    DeviceName = "Host Device",
                    LastUpdated = DateTime.UtcNow
                });
                newSensors.Add(new Model_Sensor
                {
                    Name = $"Disk {diskName} Read Speed",
                    SensorType = "DiskIO",
                    Value = readMBs.ToString(),
                    ComponentName = "Disk",
                    Unit = "MB/s",
                    DeviceId = 1,
                    ExternalId = $"disk_{diskName}_read_speed",
                    SensorTag = $"Disk {diskName} Read Speed",  // Set SensorTag equal to Name
                    Category = "Disk I/O",
                    DeviceName = "Host Device",
                    LastUpdated = DateTime.UtcNow
                });
                newSensors.Add(new Model_Sensor
                {
                    Name = $"Disk {diskName} Write Speed",
                    SensorType = "DiskIO",
                    Value = writeMBs.ToString(),
                    ComponentName = "Disk",
                    Unit = "MB/s",
                    DeviceId = 1,
                    ExternalId = $"disk_{diskName}_write_speed",
                    SensorTag = $"Disk {diskName} Write Speed",  // Set SensorTag equal to Name
                    Category = "Disk I/O",
                    DeviceName = "Host Device",
                    LastUpdated = DateTime.UtcNow
                });
            }

            _lastDiskIoTime = now;
            _lastDiskIoSensors = newSensors;
            return newSensors;
        }

        // Collects Network Stats
        private List<Model_Sensor> GetNetworkStats()
        {
            // Placeholder: in a real scenario, you'd parse /proc/net/dev or similar.
            return new List<Model_Sensor>
            {
                new Model_Sensor
                {
                    Name = "Bytes Sent (eth0)",
                    SensorType = "Network",
                    Value = "1234567",
                    ComponentName = "Network",
                    Unit = "bytes",
                    DeviceId = 1,
                    ExternalId = "net_eth0_bytes_sent",
                    SensorTag = "Bytes Sent (eth0)",  // Set SensorTag equal to Name
                    Category = "Network Stats",
                    DeviceName = "Host Device",
                    LastUpdated = DateTime.UtcNow
                },
                new Model_Sensor
                {
                    Name = "Bytes Received (eth0)",
                    SensorType = "Network",
                    Value = "9876543",
                    ComponentName = "Network",
                    Unit = "bytes",
                    DeviceId = 1,
                    ExternalId = "net_eth0_bytes_recv",
                    SensorTag = "Bytes Received (eth0)",  // Set SensorTag equal to Name
                    Category = "Network Stats",
                    DeviceName = "Host Device",
                    LastUpdated = DateTime.UtcNow
                }
            };
        }

        // Collects GPU Stats
        private List<Model_Sensor> GetGpuStats()
        {
            // Placeholder GPU info
            return new List<Model_Sensor>
            {
                new Model_Sensor
                {
                    Name = "GPU 0 Utilization",
                    SensorType = "GPU",
                    Value = "40", // placeholder
                    ComponentName = "GPU",
                    Unit = "%",
                    DeviceId = 1,
                    ExternalId = "gpu_0_utilization",
                    SensorTag = "GPU 0 Utilization",  // Set SensorTag equal to Name
                    Category = "GPU Stats",
                    DeviceName = "Host Device",
                    LastUpdated = DateTime.UtcNow
                },
                new Model_Sensor
                {
                    Name = "GPU 0 Temperature",
                    SensorType = "GPU",
                    Value = "60", // placeholder
                    ComponentName = "GPU",
                    Unit = "C",
                    DeviceId = 1,
                    ExternalId = "gpu_0_temperature",
                    SensorTag = "GPU 0 Temperature",  // Set SensorTag equal to Name
                    Category = "GPU Stats",
                    DeviceName = "Host Device",
                    LastUpdated = DateTime.UtcNow
                }
            };
        }

        // Collects System Uptime
        private List<Model_Sensor> GetSystemUptime()
        {
            const string uptimePath = "/proc/uptime";
            if (!File.Exists(uptimePath))
            {
                return new List<Model_Sensor>
                {
                    new Model_Sensor
                    {
                        Name = "System Uptime",
                        SensorType = "System",
                        Value = "N/A",
                        ComponentName = "System",
                        Unit = "hh:mm:ss",
                        DeviceId = 1,
                        ExternalId = "system_uptime_missing",
                        SensorTag = "System Uptime",  // Set SensorTag equal to Name
                        Category = "System Stats",
                        DeviceName = "Host Device",
                        LastUpdated = DateTime.UtcNow
                    }
                };
            }

            var raw = File.ReadAllText(uptimePath).Split(' ')[0];
            if (!double.TryParse(raw, out double seconds))
            {
                return new List<Model_Sensor>
                {
                    new Model_Sensor
                    {
                        Name = "System Uptime",
                        SensorType = "System",
                        Value = "N/A",
                        ComponentName = "System",
                        Unit = "hh:mm:ss",
                        DeviceId = 1,
                        ExternalId = "system_uptime_parse_fail",
                        SensorTag = "System Uptime",  // Set SensorTag equal to Name
                        Category = "System Stats",
                        DeviceName = "Host Device",
                        LastUpdated = DateTime.UtcNow
                    }
                };
            }

            var timeStr = TimeSpan.FromSeconds(seconds).ToString(@"d\.hh\:mm\:ss");
            return new List<Model_Sensor>
            {
                new Model_Sensor
                {
                    Name = "System Uptime",
                    SensorType = "System",
                    Value = timeStr,
                    ComponentName = "System",
                    Unit = "hh:mm:ss",
                    DeviceId = 1,
                    ExternalId = "system_uptime",
                    SensorTag = "System Uptime",  // Set SensorTag equal to Name
                    Category = "System Stats",
                    DeviceName = "Host Device",
                    LastUpdated = DateTime.UtcNow
                }
            };
        }

        // Collects Network Latency
        private List<Model_Sensor> GetNetworkLatency()
        {
            // Placeholder: in a real scenario, you'd ping or measure latency to a target.
            return new List<Model_Sensor>
            {
                new Model_Sensor
                {
                    Name = "Latency to google.com",
                    SensorType = "Network",
                    Value = "12.5",
                    ComponentName = "Network",
                    Unit = "ms",
                    DeviceId = 1,
                    ExternalId = "latency_google",
                    SensorTag = "Latency to google.com",  // Set SensorTag equal to Name
                    Category = "Network Stats",
                    DeviceName = "Host Device",
                    LastUpdated = DateTime.UtcNow
                }
            };
        }
    }
}
