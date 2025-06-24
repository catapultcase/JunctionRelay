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

using System;
using System.Linq;
using System.Net.NetworkInformation;
using System.Collections.Concurrent;
using JunctionRelayServer.Models;
using JunctionRelayServer.Utils;
using Microsoft.Extensions.DependencyInjection;

namespace JunctionRelayServer.Services
{
    public class Service_Heartbeats : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IHttpClientFactory _httpClientFactory;
        // In-memory failure count to avoid persisting across restarts
        private readonly ConcurrentDictionary<int, int> _failureCounts = new();

        // Rate limiting configuration
        private readonly int _maxConcurrentPings = 5; // Max simultaneous pings
        private readonly int _minDelayBetweenPingsMs = 100; // Minimum delay between starting pings
        private readonly SemaphoreSlim _concurrencyLimiter;

        public Service_Heartbeats(IServiceScopeFactory scopeFactory, IHttpClientFactory httpClientFactory)
        {
            _scopeFactory = scopeFactory;
            _httpClientFactory = httpClientFactory;
            _concurrencyLimiter = new SemaphoreSlim(_maxConcurrentPings, _maxConcurrentPings);
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            Console.WriteLine("[HEARTBEATS] ✅ Heartbeat service started");

            // Wait for database to be initialized
            using (var initScope = _scopeFactory.CreateScope())
            {
                var startupSignals = initScope.ServiceProvider.GetRequiredService<StartupSignals>();
                await startupSignals.DatabaseInitialized.Task;

                var deviceDb = initScope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();
                var allDevices = await deviceDb.GetAllDevicesAsync();

                foreach (var device in allDevices)
                {
                    // Set both heartbeat status and device status to offline on startup
                    device.LastPingStatus = "Offline";
                    device.Status = "Offline";
                    await deviceDb.UpdateDeviceAsync(device.Id, device);
                }

                Console.WriteLine($"[HEARTBEATS] ⏳ Set {allDevices.Count} device(s) to Offline on startup");
            }

            bool isFirstRun = true;

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var deviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();
                    var devices = await deviceDb.GetAllDevicesAsync();
                    var now = DateTime.UtcNow;

                    // 1) Reset in-memory failures and move Offline devices into Testing after grace period
                    foreach (var d in devices)
                    {
                        var max = d.HeartbeatMaxRetryAttempts ?? 0;
                        if (max > 0
                            && _failureCounts.TryGetValue(d.Id, out var fails) && fails >= max
                            && d.LastPingAttempt.HasValue
                            && (now - d.LastPingAttempt.Value) >= TimeSpan.FromMilliseconds(d.HeartbeatGracePeriodMs ?? 0)
                            && d.LastPingStatus == "Offline")
                        {
                            _failureCounts[d.Id] = 0;
                            d.LastPingStatus = "Testing";
                            await deviceDb.UpdateDeviceAsync(d.Id, d);
                            Console.WriteLine($"[HEARTBEATS] 🔄 Reset in-memory failure count and set '{d.Name}' heartbeat status to TESTING after grace period");
                        }
                    }

                    // 2) Build list of devices due for a ping
                    var heartbeatDevices = devices
                        .Where(d => d.HeartbeatEnabled
                                     && (
                                         // HTTP: Either has explicit target OR has IP address
                                         (d.HeartbeatProtocol?.ToUpper() == "HTTP" &&
                                          (!string.IsNullOrWhiteSpace(d.HeartbeatTarget) || !string.IsNullOrWhiteSpace(d.IPAddress)))
                                         ||
                                         // ICMP: Has target or IP address (existing logic)
                                         (d.HeartbeatProtocol?.ToUpper() == "ICMP" &&
                                          (!string.IsNullOrWhiteSpace(d.HeartbeatTarget) || !string.IsNullOrWhiteSpace(d.IPAddress)))
                                        )
                                     && (
                                         d.HeartbeatMaxRetryAttempts == 0
                                         || (_failureCounts.TryGetValue(d.Id, out var f) ? f : 0) < (d.HeartbeatMaxRetryAttempts ?? 0)
                                        )
                                     && (isFirstRun || (now - (d.LastPingAttempt ?? DateTime.MinValue)) >= TimeSpan.FromMilliseconds(d.HeartbeatIntervalMs ?? 60000))
                        )
                        .OrderBy(d => d.LastPingAttempt ?? DateTime.MinValue) // Process oldest first
                        .ToList();

                    // 3) Process devices with rate limiting
                    if (heartbeatDevices.Any())
                    {
                        Console.WriteLine($"[HEARTBEATS] 📊 Processing {heartbeatDevices.Count} device(s) with rate limiting (max {_maxConcurrentPings} concurrent)");
                        await ProcessDevicesWithRateLimitingAsync(deviceDb, heartbeatDevices, stoppingToken);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[HEARTBEATS] ❌ Top-level exception: {ex.Message}");
                }

                isFirstRun = false;
                await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
            }

            Console.WriteLine("[HEARTBEATS] ⛔ Heartbeat service stopping...");
        }

        private async Task ProcessDevicesWithRateLimitingAsync(
            Service_Database_Manager_Devices deviceDb,
            List<Model_Device> devices,
            CancellationToken stoppingToken)
        {
            var tasks = new List<Task>();

            foreach (var device in devices)
            {
                if (stoppingToken.IsCancellationRequested)
                    break;

                // Start the ping task with rate limiting
                var task = ProcessDeviceWithRateLimitingAsync(deviceDb, device, stoppingToken);
                tasks.Add(task);

                // Add delay between starting pings to spread them out
                if (_minDelayBetweenPingsMs > 0)
                {
                    await Task.Delay(_minDelayBetweenPingsMs, stoppingToken);
                }
            }

            // Wait for all pings to complete
            await Task.WhenAll(tasks);
        }

        private async Task ProcessDeviceWithRateLimitingAsync(
            Service_Database_Manager_Devices deviceDb,
            Model_Device device,
            CancellationToken stoppingToken)
        {
            // Wait for available slot in concurrency limiter
            await _concurrencyLimiter.WaitAsync(stoppingToken);

            try
            {
                await ProcessDeviceHeartbeatAsync(deviceDb, device, stoppingToken);
            }
            finally
            {
                // Release the slot
                _concurrencyLimiter.Release();
            }
        }

        private async Task ProcessDeviceHeartbeatAsync(Service_Database_Manager_Devices deviceDb, Model_Device device, CancellationToken token)
        {
            var now = DateTime.UtcNow;
            device.LastPingAttempt = now;
            var duration = 0;
            var success = false;

            // Store previous states for logging
            var prevDeviceStatus = device.Status;
            var prevHeartbeatStatus = device.LastPingStatus;

            // Perform the ping/check
            if (device.HeartbeatProtocol?.ToUpper() == "HTTP")
            {
                // Use HeartbeatTarget if specified, otherwise build URL from IP address
                string targetUrl;
                if (!string.IsNullOrWhiteSpace(device.HeartbeatTarget))
                {
                    targetUrl = device.HeartbeatTarget;
                }
                else if (!string.IsNullOrWhiteSpace(device.IPAddress))
                {
                    // Build HTTP URL from IP address - use /api/health/heartbeat endpoint
                    targetUrl = $"http://{device.IPAddress}/api/health/heartbeat";
                }
                else
                {
                    if (prevHeartbeatStatus != "Online")
                        Console.WriteLine($"[HEARTBEATS] ⚠️ No HTTP target or IP address for device '{device.Name}'");
                    return; // Skip this device - no way to reach it
                }

                try
                {
                    var httpClient = _httpClientFactory.CreateClient();
                    httpClient.Timeout = TimeSpan.FromSeconds(5); // Add timeout to prevent hanging
                    var sw = System.Diagnostics.Stopwatch.StartNew();
                    var response = await httpClient.GetAsync(targetUrl, token);
                    var content = await response.Content.ReadAsStringAsync(token);
                    sw.Stop();
                    duration = (int)sw.ElapsedMilliseconds;

                    if (response.IsSuccessStatusCode)
                    {
                        bool contentValid = true;

                        // Check for expected value if specified
                        if (!string.IsNullOrEmpty(device.HeartbeatExpectedValue))
                        {
                            contentValid = content.Contains(device.HeartbeatExpectedValue);
                            if (!contentValid && prevHeartbeatStatus != "Online")
                            {
                                Console.WriteLine($"[HEARTBEATS] ❌ Expected value '{device.HeartbeatExpectedValue}' not found in response from '{device.Name}'");
                            }
                        }

                        // Try to parse JSON response for enhanced verification
                        if (contentValid)
                        {
                            try
                            {
                                var jsonDoc = System.Text.Json.JsonDocument.Parse(content);
                                var root = jsonDoc.RootElement;

                                // Verify MAC address if device has one stored and response contains MAC
                                if (!string.IsNullOrEmpty(device.UniqueIdentifier) && root.TryGetProperty("mac", out var macElement))
                                {
                                    var responseMac = macElement.GetString();
                                    if (!string.Equals(device.UniqueIdentifier, responseMac, StringComparison.OrdinalIgnoreCase))
                                    {
                                        contentValid = false;
                                        Console.WriteLine($"[HEARTBEATS] ❌ MAC mismatch for '{device.Name}': Expected '{device.UniqueIdentifier}', got '{responseMac}'");
                                    }
                                    else
                                    {
                                        Console.WriteLine($"[HEARTBEATS] ✅ MAC verified for '{device.Name}': {responseMac}");
                                    }
                                }

                                // Log additional device info from JSON response (only on status changes to reduce spam)
                                if (prevHeartbeatStatus != "Online")
                                {
                                    if (root.TryGetProperty("firmware", out var firmwareElement))
                                    {
                                        var firmware = firmwareElement.GetString();
                                        Console.WriteLine($"[HEARTBEATS] 📟 Device '{device.Name}' firmware: {firmware}");
                                    }

                                    if (root.TryGetProperty("uptime", out var uptimeElement))
                                    {
                                        var uptime = uptimeElement.GetInt64();
                                        var uptimeSeconds = uptime / 1000;
                                        Console.WriteLine($"[HEARTBEATS] ⏱️ Device '{device.Name}' uptime: {uptimeSeconds}s");
                                    }

                                    if (root.TryGetProperty("free_heap", out var heapElement))
                                    {
                                        var freeHeap = heapElement.GetInt32();
                                        Console.WriteLine($"[HEARTBEATS] 💾 Device '{device.Name}' free heap: {freeHeap} bytes");
                                    }
                                }
                            }
                            catch (System.Text.Json.JsonException)
                            {
                                // Response isn't JSON or malformed - treat as simple text response
                                if (prevHeartbeatStatus != "Online")
                                    Console.WriteLine($"[HEARTBEATS] ⚠️ Non-JSON response from '{device.Name}': {content.Substring(0, Math.Min(50, content.Length))}");

                                // For non-JSON responses, we can't verify MAC but still consider success if expected value matches
                                // contentValid remains as set by the expected value check above
                            }
                        }

                        success = contentValid;
                    }
                    else
                    {
                        if (prevHeartbeatStatus != "Online")
                            Console.WriteLine($"[HEARTBEATS] ❌ HTTP response failed for '{device.Name}': Status={response.StatusCode}");
                    }
                }
                catch (Exception ex)
                {
                    if (prevHeartbeatStatus != "Online")
                        Console.WriteLine($"[HEARTBEATS] ⚠️ HTTP error for device '{device.Name}' at {targetUrl}: {ex.Message}");
                }
            }
            else if (device.HeartbeatProtocol?.ToUpper() == "ICMP")
            {
                var target = device.HeartbeatTarget ?? device.IPAddress;
                if (!string.IsNullOrWhiteSpace(target))
                {
                    try
                    {
                        var ping = new Ping();
                        var sw = System.Diagnostics.Stopwatch.StartNew();
                        var reply = await ping.SendPingAsync(target, 2000);
                        sw.Stop();
                        duration = (int)sw.ElapsedMilliseconds;

                        if (reply.Status == IPStatus.Success)
                            success = true;
                        else if (prevHeartbeatStatus != "Online")
                            Console.WriteLine($"[HEARTBEATS] ❌ Ping reply status for device '{device.Name}': {reply.Status}");
                    }
                    catch (Exception ex)
                    {
                        if (prevHeartbeatStatus != "Online")
                            Console.WriteLine($"[HEARTBEATS] ⚠️ ICMP error for device '{device.Name}': {ex.Message}");
                    }
                }
            }

            // Handle result using in-memory counts
            if (success)
            {
                device.LastPinged = now;
                device.LastPingStatus = "Online";
                device.LastPingDurationMs = duration;
                device.ConsecutivePingFailures = 0; // Reset failure count in database
                _failureCounts.TryRemove(device.Id, out _); // Reset in-memory count

                // Update device status to Online when heartbeat succeeds
                device.Status = "Online";

                Console.WriteLine($"[HEARTBEATS] ✅ Device '{device.Name}' is ONLINE ({duration}ms)");
            }
            else
            {
                device.LastPingStatus = "Timeout";
                device.LastPingDurationMs = duration;
                var failures = _failureCounts.AddOrUpdate(device.Id, 1, (_, count) => count + 1);
                var max = device.HeartbeatMaxRetryAttempts ?? 3;

                // Update consecutive ping failures in the database
                device.ConsecutivePingFailures = failures;

                if (failures >= max)
                {
                    device.LastPingStatus = "Offline";
                    // Also update device status when heartbeat fails completely
                    device.Status = "Offline";
                    Console.WriteLine($"[HEARTBEATS] 🚨 Device '{device.Name}' marked OFFLINE after {failures} failures");
                }
                else
                {
                    // Determine new heartbeat status based on previous heartbeat status (not device status)
                    if (prevHeartbeatStatus == "Online")
                    {
                        device.LastPingStatus = "Unstable";
                        Console.WriteLine($"[HEARTBEATS] ❌ Device '{device.Name}' heartbeat is UNSTABLE ({duration}ms), attempt #{failures}");
                    }
                    else if (prevHeartbeatStatus == "Testing" || prevHeartbeatStatus == "Failed")
                    {
                        device.LastPingStatus = "Retesting";
                        Console.WriteLine($"[HEARTBEATS] 🔄 Retesting device '{device.Name}' heartbeat ({duration}ms), attempt #{failures}");
                    }
                    else if (prevHeartbeatStatus == "Offline")
                    {
                        device.LastPingStatus = "Testing";
                        Console.WriteLine($"[HEARTBEATS] 🔍 Testing offline device '{device.Name}' heartbeat ({duration}ms), attempt #{failures}");
                    }
                    else if (prevHeartbeatStatus == "Retesting")
                    {
                        device.LastPingStatus = "Retesting";
                        Console.WriteLine($"[HEARTBEATS] 🔄 Retesting device '{device.Name}' heartbeat ({duration}ms), attempt #{failures}");
                    }
                    else if (prevHeartbeatStatus == "Unstable")
                    {
                        device.LastPingStatus = "Retesting";
                        Console.WriteLine($"[HEARTBEATS] 🔄 Device '{device.Name}' heartbeat moved from UNSTABLE to RETESTING ({duration}ms), attempt #{failures}");
                    }
                    else if (prevHeartbeatStatus == "Timeout")
                    {
                        device.LastPingStatus = "Retesting";
                        Console.WriteLine($"[HEARTBEATS] 🔄 Device '{device.Name}' heartbeat moved from TIMEOUT to RETESTING ({duration}ms), attempt #{failures}");
                    }
                    else
                    {
                        // Catch-all for unexpected states - transition to Testing
                        device.LastPingStatus = "Testing";
                        Console.WriteLine($"[HEARTBEATS] ⚠️ Unexpected heartbeat status '{prevHeartbeatStatus}' for device '{device.Name}', setting to TESTING, attempt #{failures}");
                    }
                }
            }

            // Debug: log heartbeat status transition (only if changed)
            if (!string.Equals(prevHeartbeatStatus, device.LastPingStatus, StringComparison.OrdinalIgnoreCase))
            {
                Console.WriteLine($"[HEARTBEATS] ↔️ Device '{device.Name}' HEARTBEAT status transition: {prevHeartbeatStatus} -> {device.LastPingStatus}");
            }

            // Debug: log device status transition (only if changed)
            if (!string.Equals(prevDeviceStatus, device.Status, StringComparison.OrdinalIgnoreCase))
            {
                Console.WriteLine($"[HEARTBEATS] ↔️ Device '{device.Name}' DEVICE status transition: {prevDeviceStatus} -> {device.Status}");
            }

            // Persist changes to database
            await deviceDb.UpdateDeviceAsync(device.Id, device);
        }

        public override void Dispose()
        {
            _concurrencyLimiter?.Dispose();
            base.Dispose();
        }
    }
}