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
using JunctionRelayServer.Models;
using Tmds.MDns;
using System.Net.NetworkInformation;
using System.Net;
using System.Collections.Concurrent;
using System.Diagnostics;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_Network_Scan
    {
        private Dictionary<string, string> _discoveredDevices = new Dictionary<string, string>();

        public async Task<List<Model_ScannedDevice>> ScanNetworkAsync()
        {
            return await PerformJunctionRelayScan();
        }

        public async IAsyncEnumerable<Model_ScannedDevice> ScanNetworkStreamAsync()
        {
            var foundDevices = new ConcurrentBag<Model_ScannedDevice>();
            var yieldedIps = new ConcurrentHashSet<string>();

            // Start JunctionRelay scan
            var junctionRelayTask = StreamJunctionRelayScan(foundDevices);

            // Start common services scan
            var servicesTask = StreamCommonServices(foundDevices);

            // Start subnet scan
            var subnetTask = StreamSubnetScan(foundDevices);

            // Yield devices as they're found
            var completionSource = new TaskCompletionSource<bool>();

            // Monitor for new devices and yield them
            _ = Task.Run(async () =>
            {
                try
                {
                    // Wait for all scanning tasks to complete
                    await Task.WhenAll(junctionRelayTask, servicesTask, subnetTask);
                    completionSource.SetResult(true);
                }
                catch (Exception ex)
                {
                    completionSource.SetException(ex);
                }
            });

            // Yield devices as they're discovered
            while (!completionSource.Task.IsCompleted)
            {
                var newDevices = foundDevices
                    .Where(d => !yieldedIps.Contains(d.IpAddress))
                    .ToList();

                foreach (var device in newDevices)
                {
                    yieldedIps.Add(device.IpAddress);
                    yield return device;
                }

                await Task.Delay(100); // Check for new devices every 100ms
            }

            // Yield any remaining devices
            var finalDevices = foundDevices
                .Where(d => !yieldedIps.Contains(d.IpAddress))
                .ToList();

            foreach (var device in finalDevices)
            {
                yield return device;
            }
        }

        public async IAsyncEnumerable<(Model_ScannedDevice Device, string DiscoveryMethod)> ScanNetworkStreamAsyncWithMethod()
        {
            var foundDevices = new ConcurrentBag<(Model_ScannedDevice Device, string DiscoveryMethod)>();
            var yieldedIps = new ConcurrentHashSet<string>();

            // Start JunctionRelay scan
            var junctionRelayTask = StreamJunctionRelayScanWithMethod(foundDevices);

            // Start common services scan
            var servicesTask = StreamCommonServicesWithMethod(foundDevices);

            // Start subnet scan
            var subnetTask = StreamSubnetScanWithMethod(foundDevices);

            // Yield devices as they're found
            var completionSource = new TaskCompletionSource<bool>();

            // Monitor for new devices and yield them
            _ = Task.Run(async () =>
            {
                try
                {
                    // Wait for all scanning tasks to complete
                    await Task.WhenAll(junctionRelayTask, servicesTask, subnetTask);
                    completionSource.SetResult(true);
                }
                catch (Exception ex)
                {
                    completionSource.SetException(ex);
                }
            });

            // Yield devices as they're discovered
            while (!completionSource.Task.IsCompleted)
            {
                var newDevices = foundDevices
                    .Where(d => !yieldedIps.Contains(d.Device.IpAddress))
                    .ToList();

                foreach (var deviceWithMethod in newDevices)
                {
                    yieldedIps.Add(deviceWithMethod.Device.IpAddress);
                    yield return deviceWithMethod;
                }

                await Task.Delay(100); // Check for new devices every 100ms
            }

            // Yield any remaining devices
            var finalDevices = foundDevices
                .Where(d => !yieldedIps.Contains(d.Device.IpAddress))
                .ToList();

            foreach (var deviceWithMethod in finalDevices)
            {
                yield return deviceWithMethod;
            }
        }

        private async Task<List<Model_ScannedDevice>> PerformJunctionRelayScan()
        {
            var discoveredDevices = new List<Model_ScannedDevice>();
            string serviceType = "_junctionrelay._tcp";  // Default service type for ESP32 devices
            var serviceBrowser = new ServiceBrowser();

            serviceBrowser.ServiceAdded += (sender, e) =>
            {
                var ipAddress = e.Announcement.Addresses.FirstOrDefault()?.ToString();
                if (ipAddress != null)
                {
                    discoveredDevices.Add(new Model_ScannedDevice
                    {
                        Instance = e.Announcement.Instance,
                        IpAddress = ipAddress
                    });
                }
            };

            serviceBrowser.ServiceRemoved += (sender, e) =>
            {
                // Handle service removal if needed
            };

            serviceBrowser.ServiceChanged += (sender, e) =>
            {
                // Handle service changes if needed
            };

            Console.WriteLine("Browsing for type: {0}", serviceType);
            var cts = new System.Threading.CancellationTokenSource();
            var token = cts.Token;
            serviceBrowser.StartBrowse(serviceType);

            try
            {
                await Task.Delay(5000, token);  // Scan for 5 seconds
            }
            catch (TaskCanceledException)
            {
                Console.WriteLine("Scanning cancelled after timeout.");
            }

            serviceBrowser.StopBrowse();
            Console.WriteLine("Browsing stopped.");
            return discoveredDevices;
        }

        private async Task StreamJunctionRelayScan(ConcurrentBag<Model_ScannedDevice> foundDevices)
        {
            var serviceBrowser = new ServiceBrowser();
            string serviceType = "_junctionrelay._tcp";

            serviceBrowser.ServiceAdded += (sender, e) =>
            {
                var ipAddress = e.Announcement.Addresses.FirstOrDefault()?.ToString();
                if (ipAddress != null)
                {
                    foundDevices.Add(new Model_ScannedDevice
                    {
                        Instance = e.Announcement.Instance,
                        IpAddress = ipAddress
                    });
                }
            };

            serviceBrowser.StartBrowse(serviceType);
            await Task.Delay(5000); // Scan for 5 seconds
            serviceBrowser.StopBrowse();
        }

        private async Task StreamJunctionRelayScanWithMethod(ConcurrentBag<(Model_ScannedDevice Device, string DiscoveryMethod)> foundDevices)
        {
            var serviceBrowser = new ServiceBrowser();
            string serviceType = "_junctionrelay._tcp";

            serviceBrowser.ServiceAdded += (sender, e) =>
            {
                var ipAddress = e.Announcement.Addresses.FirstOrDefault()?.ToString();
                if (ipAddress != null)
                {
                    foundDevices.Add((new Model_ScannedDevice
                    {
                        Instance = e.Announcement.Instance,
                        IpAddress = ipAddress
                    }, "junctionrelay"));
                }
            };

            serviceBrowser.StartBrowse(serviceType);
            await Task.Delay(5000); // Scan for 5 seconds
            serviceBrowser.StopBrowse();
        }

        private async Task StreamCommonServices(ConcurrentBag<Model_ScannedDevice> foundDevices)
        {
            var commonServices = new[]
            {
                "_http._tcp", "_https._tcp", "_ssh._tcp", "_ftp._tcp",
                "_printer._tcp", "_airplay._tcp", "_googlecast._tcp",
                "_homekit._tcp", "_hap._tcp"
            };

            var tasks = commonServices.Select(serviceType =>
                StreamSingleService(serviceType, foundDevices));

            await Task.WhenAll(tasks);
        }

        private async Task StreamCommonServicesWithMethod(ConcurrentBag<(Model_ScannedDevice Device, string DiscoveryMethod)> foundDevices)
        {
            var commonServices = new[]
            {
                "_http._tcp", "_https._tcp", "_ssh._tcp", "_ftp._tcp",
                "_printer._tcp", "_airplay._tcp", "_googlecast._tcp",
                "_homekit._tcp", "_hap._tcp"
            };

            var tasks = commonServices.Select(serviceType =>
                StreamSingleServiceWithMethod(serviceType, foundDevices));

            await Task.WhenAll(tasks);
        }

        private async Task StreamSingleService(string serviceType, ConcurrentBag<Model_ScannedDevice> foundDevices)
        {
            var serviceBrowser = new ServiceBrowser();

            serviceBrowser.ServiceAdded += (sender, e) =>
            {
                var ipAddress = e.Announcement.Addresses.FirstOrDefault()?.ToString();
                if (ipAddress != null)
                {
                    // Check if we already have this IP
                    if (!foundDevices.Any(d => d.IpAddress == ipAddress))
                    {
                        foundDevices.Add(new Model_ScannedDevice
                        {
                            Instance = e.Announcement.Instance ?? $"Device-{ipAddress}",
                            IpAddress = ipAddress
                        });
                    }
                }
            };

            serviceBrowser.StartBrowse(serviceType);
            await Task.Delay(2000); // Shorter delay for each service
            serviceBrowser.StopBrowse();
        }

        private async Task StreamSingleServiceWithMethod(string serviceType, ConcurrentBag<(Model_ScannedDevice Device, string DiscoveryMethod)> foundDevices)
        {
            var serviceBrowser = new ServiceBrowser();

            serviceBrowser.ServiceAdded += (sender, e) =>
            {
                var ipAddress = e.Announcement.Addresses.FirstOrDefault()?.ToString();
                if (ipAddress != null)
                {
                    // Check if we already have this IP
                    if (!foundDevices.Any(d => d.Device.IpAddress == ipAddress))
                    {
                        foundDevices.Add((new Model_ScannedDevice
                        {
                            Instance = e.Announcement.Instance ?? $"Device-{ipAddress}",
                            IpAddress = ipAddress
                        }, "mdns"));
                    }
                }
            };

            serviceBrowser.StartBrowse(serviceType);
            await Task.Delay(2000); // Shorter delay for each service
            serviceBrowser.StopBrowse();
        }

        private async Task StreamSubnetScan(ConcurrentBag<Model_ScannedDevice> foundDevices)
        {
            try
            {
                var localIp = GetLocalIPAddress();
                if (localIp == null) return;

                var subnet = GetSubnet(localIp);
                var semaphore = new SemaphoreSlim(20); // Limit concurrent pings

                var tasks = Enumerable.Range(1, 254).Select(async i =>
                {
                    await semaphore.WaitAsync();
                    try
                    {
                        var targetIp = $"{subnet}.{i}";
                        using var ping = new Ping();
                        var reply = await ping.SendPingAsync(targetIp, 1000);

                        if (reply.Status == IPStatus.Success)
                        {
                            if (!foundDevices.Any(d => d.IpAddress == targetIp))
                            {
                                foundDevices.Add(new Model_ScannedDevice
                                {
                                    Instance = $"Device-{targetIp}",
                                    IpAddress = targetIp
                                });
                            }
                        }
                    }
                    finally
                    {
                        semaphore.Release();
                    }
                });

                await Task.WhenAll(tasks);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error during subnet scan: {ex.Message}");
            }
        }

        private async Task StreamSubnetScanWithMethod(ConcurrentBag<(Model_ScannedDevice Device, string DiscoveryMethod)> foundDevices)
        {
            try
            {
                var localIp = GetLocalIPAddress();
                if (localIp == null) return;

                var subnet = GetSubnet(localIp);
                var semaphore = new SemaphoreSlim(20); // Limit concurrent pings

                var tasks = Enumerable.Range(1, 254).Select(async i =>
                {
                    await semaphore.WaitAsync();
                    try
                    {
                        var targetIp = $"{subnet}.{i}";
                        using var ping = new Ping();
                        var reply = await ping.SendPingAsync(targetIp, 1000);

                        if (reply.Status == IPStatus.Success)
                        {
                            if (!foundDevices.Any(d => d.Device.IpAddress == targetIp))
                            {
                                foundDevices.Add((new Model_ScannedDevice
                                {
                                    Instance = $"Device-{targetIp}",
                                    IpAddress = targetIp
                                }, "subnet"));
                            }
                        }
                    }
                    finally
                    {
                        semaphore.Release();
                    }
                });

                await Task.WhenAll(tasks);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error during subnet scan: {ex.Message}");
            }
        }

        private string? GetLocalIPAddress()
        {
            try
            {
                var host = Dns.GetHostEntry(Dns.GetHostName());
                return host.AddressList
                    .FirstOrDefault(ip => ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                    ?.ToString();
            }
            catch
            {
                return null;
            }
        }

        private string GetSubnet(string ipAddress)
        {
            var parts = ipAddress.Split('.');
            return $"{parts[0]}.{parts[1]}.{parts[2]}";
        }

        private async Task<string?> GetMacAddressFromArp(string ipAddress)
        {
            try
            {
                var process = new Process
                {
                    StartInfo = new ProcessStartInfo
                    {
                        FileName = "arp",
                        Arguments = $"-a {ipAddress}",
                        RedirectStandardOutput = true,
                        UseShellExecute = false,
                        CreateNoWindow = true
                    }
                };

                process.Start();
                var output = await process.StandardOutput.ReadToEndAsync();
                await process.WaitForExitAsync();

                // Parse ARP output to extract MAC address
                var lines = output.Split('\n');
                foreach (var line in lines)
                {
                    if (line.Contains(ipAddress))
                    {
                        var parts = line.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                        if (parts.Length >= 2)
                        {
                            var macCandidate = parts[1];
                            if (macCandidate.Contains("-") || macCandidate.Contains(":"))
                            {
                                return macCandidate;
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to get MAC from ARP for {ipAddress}: {ex.Message}");
            }

            return null;
        }

        public async Task<string> GetDeviceIpByInstance(string instance)
        {
            try
            {
                Console.WriteLine($"Attempting to resolve IP for instance: {instance}");  // Debug log
                if (_discoveredDevices.ContainsKey(instance))
                {
                    return await Task.FromResult(_discoveredDevices[instance]);
                }
                else
                {
                    throw new Exception("Device IP not found for instance: " + instance);
                }
            }
            catch (Exception ex)
            {
                throw new Exception($"Error retrieving IP for instance {instance}: {ex.Message}");
            }
        }
    }

    public class ConcurrentHashSet<T> : IDisposable
    {
        private readonly HashSet<T> _hashSet = new HashSet<T>();
        private readonly ReaderWriterLockSlim _lock = new ReaderWriterLockSlim();

        public bool Add(T item)
        {
            _lock.EnterWriteLock();
            try
            {
                return _hashSet.Add(item);
            }
            finally
            {
                _lock.ExitWriteLock();
            }
        }

        public bool Contains(T item)
        {
            _lock.EnterReadLock();
            try
            {
                return _hashSet.Contains(item);
            }
            finally
            {
                _lock.ExitReadLock();
            }
        }

        public void Dispose()
        {
            _lock?.Dispose();
        }
    }
}