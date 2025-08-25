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
using System.IO;
using System.Text;
using System.Linq;
using System.Net.NetworkInformation;
using System.Collections.Concurrent;
using JunctionRelayServer.Models;
using JunctionRelayServer.Utils;
using JunctionRelayServer.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using System.Data;
using Dapper;
using System.Text.Json;

namespace JunctionRelayServer.Services
{
    public class Service_Heartbeats : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Service_CloudSessionStore _cloudSessionStore;
        private readonly Service_Manager_WebSocket_Devices _webSocketService;
        private readonly Service_Manager_SSH _sshService;
        private readonly Service_CloudSync _cloudSyncService;
        private readonly IService_Settings _settingsService;
        private readonly ConcurrentDictionary<int, int> _failureCounts = new();

        public Service_Heartbeats(
            IServiceScopeFactory scopeFactory,
            IHttpClientFactory httpClientFactory,
            Service_CloudSessionStore cloudSessionStore,
            Service_Manager_WebSocket_Devices webSocketService,
            Service_Manager_SSH sshService,
            Service_CloudSync cloudSyncService,
            IService_Settings settingsService)
        {
            _scopeFactory = scopeFactory;
            _httpClientFactory = httpClientFactory;
            _cloudSessionStore = cloudSessionStore;
            _webSocketService = webSocketService;
            _sshService = sshService;
            _cloudSyncService = cloudSyncService;
            _settingsService = settingsService;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            Console.WriteLine("[HEARTBEATS] ✅ Heartbeat service initialized");

            // Wait for database to be initialized
            using (var initScope = _scopeFactory.CreateScope())
            {
                var startupSignals = initScope.ServiceProvider.GetRequiredService<StartupSignals>();
                await startupSignals.DatabaseInitialized.Task.ConfigureAwait(false);

                // Initialize cloud session before processing devices
                Console.WriteLine("[HEARTBEATS] 🔄 Initializing cloud session...");
                try
                {
                    await _cloudSessionStore.GetValidAccessTokenAsync(stoppingToken).ConfigureAwait(false);
                    Console.WriteLine("[HEARTBEATS] ✅ Cloud session initialization complete");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[HEARTBEATS] ⚠️ Cloud session initialization failed: {ex.Message}");
                }

                var deviceDb = initScope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();
                var allDevices = await deviceDb.GetAllDevicesAsync().ConfigureAwait(false);

                foreach (var device in allDevices)
                {
                    // Set heartbeat status to offline on startup (only for heartbeat-enabled devices)
                    if (device.HeartbeatEnabled)
                    {
                        device.LastPingStatus = "Offline";
                        await deviceDb.UpdateDeviceAsync(device.Id, device).ConfigureAwait(false);
                    }
                }

                var heartbeatDeviceCount = allDevices.Count(d => d.HeartbeatEnabled);
                Console.WriteLine($"[HEARTBEATS] ⏳ Set {heartbeatDeviceCount} heartbeat-enabled device(s) to Offline on startup");
            }

            bool isFirstRun = true;

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    // Check if heartbeat service is enabled via settings
                    var serviceEnabled = await _settingsService.GetBoolSettingAsync("service_heartbeats_enabled", true);

                    if (!serviceEnabled)
                    {
                        if (isFirstRun)
                        {
                            Console.WriteLine("[HEARTBEATS] ⏸️ Heartbeat service is DISABLED via settings - skipping processing");
                            isFirstRun = false;
                        }
                        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken).ConfigureAwait(false);
                        continue;
                    }

                    using var scope = _scopeFactory.CreateScope();
                    var deviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();
                    var devices = await deviceDb.GetAllDevicesAsync().ConfigureAwait(false);
                    var now = DateTime.UtcNow;

                    // Reset in-memory failures and move Offline devices into Testing after grace period
                    foreach (var d in devices.Where(d => d.HeartbeatEnabled))
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
                            await deviceDb.UpdateDeviceAsync(d.Id, d).ConfigureAwait(false);
                            Console.WriteLine($"[HEARTBEATS] 🔄 Reset in-memory failure count and set '{d.Name}' heartbeat status to TESTING after grace period");
                        }
                    }

                    // Build list of devices due for a heartbeat ping
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
                                         ||
                                         // SSH: Has IP address and username
                                         (d.HeartbeatProtocol?.ToUpper() == "SSH" &&
                                          !string.IsNullOrWhiteSpace(d.IPAddress) && !string.IsNullOrWhiteSpace(d.SshUsername))
                                         ||
                                         // WebSocket: Has UniqueIdentifier (MAC address) and is connected
                                         (d.HeartbeatProtocol?.ToUpper() == "WEBSOCKET" &&
                                          !string.IsNullOrWhiteSpace(d.UniqueIdentifier))
                                         ||
                                         // ESP-NOW: Has UniqueIdentifier (MAC address) - relies on stream activity
                                         (d.HeartbeatProtocol?.ToUpper() == "ESPNOW" &&
                                          !string.IsNullOrWhiteSpace(d.UniqueIdentifier))
                                        )
                                     && (
                                         d.HeartbeatMaxRetryAttempts == 0
                                         || (_failureCounts.TryGetValue(d.Id, out var f) ? f : 0) < (d.HeartbeatMaxRetryAttempts ?? 0)
                                        )
                                     && (isFirstRun || (now - (d.LastPingAttempt ?? DateTime.MinValue)) >= TimeSpan.FromMilliseconds(d.HeartbeatIntervalMs ?? 60000))
                        )
                        .OrderBy(d => d.LastPingAttempt ?? DateTime.MinValue) // Process oldest first
                        .ToList();

                    // Process heartbeat devices sequentially
                    if (heartbeatDevices.Any())
                    {
                        Console.WriteLine($"[HEARTBEATS] 📊 Processing {heartbeatDevices.Count} device(s) sequentially");
                        await ProcessDevicesSequentiallyAsync(deviceDb, heartbeatDevices, stoppingToken).ConfigureAwait(false);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[HEARTBEATS] ❌ Top-level exception: {ex.Message}");
                }

                isFirstRun = false;
                await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken).ConfigureAwait(false);
            }

            Console.WriteLine("[HEARTBEATS] ⛔ Heartbeat service stopping...");
        }

        private async Task ProcessDevicesSequentiallyAsync(
            Service_Database_Manager_Devices deviceDb,
            List<Model_Device> devices,
            CancellationToken stoppingToken)
        {
            foreach (var device in devices)
            {
                if (stoppingToken.IsCancellationRequested)
                    break;

                // Process each device one at a time, waiting for completion
                try
                {
                    await ProcessDeviceHeartbeatAsync(deviceDb, device, stoppingToken).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[HEARTBEATS] ❌ Error processing device '{device.Name}': {ex.Message}");
                }

                // Small delay between devices to prevent overwhelming the system
                if (!stoppingToken.IsCancellationRequested)
                {
                    await Task.Delay(50, stoppingToken).ConfigureAwait(false); // 50ms between devices
                }
            }
        }

        private async Task ProcessDeviceHeartbeatAsync(
            Service_Database_Manager_Devices deviceDb,
            Model_Device device,
            CancellationToken token)
        {
            var now = DateTime.UtcNow;
            device.LastPingAttempt = now;
            var duration = 0;
            var success = false;

            var prevDeviceStatus = device.Status;
            var prevHeartbeatStatus = device.LastPingStatus;

            // Check for stream-based heartbeat first if enabled
            if (device.UseStreamAsHeartbeat && device.StreamHeartbeatThresholdMs.HasValue)
            {
                var thresholdMs = device.StreamHeartbeatThresholdMs.Value;
                var (streamSuccess, streamLatency) = await CheckRecentStreamActivityAsync(device.Id, thresholdMs);

                if (streamSuccess)
                {
                    // Use stream activity as successful heartbeat
                    success = true;
                    duration = (int)streamLatency;

                    Console.WriteLine($"[HEARTBEATS] 📡 Device '{device.Name}' ONLINE via stream activity ({duration}ms latency, threshold: {thresholdMs}ms)");

                    // Update success metrics and skip traditional heartbeat
                    device.LastPinged = now;
                    device.LastPingStatus = "Online (Streaming)";
                    device.LastPingDurationMs = duration;
                    device.ConsecutivePingFailures = 0;
                    _failureCounts.TryRemove(device.Id, out _);

                    // Send health report to cloud sync service for batching
                    await SendHealthReportToCloudSyncServiceAsync(device, now, success, duration);

                    // Update status transitions
                    if (!string.Equals(prevHeartbeatStatus, device.LastPingStatus, StringComparison.OrdinalIgnoreCase))
                    {
                        Console.WriteLine($"[HEARTBEATS] ↔️ Device '{device.Name}' HEARTBEAT status transition: {prevHeartbeatStatus} -> {device.LastPingStatus}");
                    }

                    await deviceDb.UpdateDeviceAsync(device.Id, device).ConfigureAwait(false);
                    return; // Skip traditional heartbeat
                }
                else
                {
                    Console.WriteLine($"[HEARTBEATS] 📡 No recent stream activity for '{device.Name}' within {thresholdMs}ms, falling back to {device.HeartbeatProtocol} heartbeat");
                }
            }

            // Continue with existing traditional heartbeat logic...
            if (device.HeartbeatProtocol?.ToUpper() == "HTTP")
            {
                string targetUrl;
                if (!string.IsNullOrWhiteSpace(device.HeartbeatTarget))
                {
                    targetUrl = device.HeartbeatTarget;

                    // If target is a relative path, combine with IP address
                    if (targetUrl.StartsWith("/") && !string.IsNullOrWhiteSpace(device.IPAddress))
                    {
                        var ipAddress = device.IPAddress.Trim();
                        if (ipAddress.Contains(':'))
                        {
                            targetUrl = $"http://{ipAddress}{targetUrl}";
                        }
                        else
                        {
                            targetUrl = $"http://{ipAddress}:80{targetUrl}";
                        }
                    }
                    // If target doesn't start with http/https, assume it's a hostname/IP
                    else if (!targetUrl.StartsWith("http://") && !targetUrl.StartsWith("https://"))
                    {
                        targetUrl = $"http://{targetUrl}";
                    }
                }
                else if (!string.IsNullOrWhiteSpace(device.IPAddress))
                {
                    // Construct full URL with default port if not specified
                    var ipAddress = device.IPAddress.Trim();

                    // Check if IP already includes port
                    if (ipAddress.Contains(':'))
                    {
                        targetUrl = $"http://{ipAddress}/api/health/heartbeat";
                    }
                    else
                    {
                        // Use hardcoded port 80 for HTTP
                        targetUrl = $"http://{ipAddress}:80/api/health/heartbeat";
                    }
                }
                else
                {
                    if (prevHeartbeatStatus != "Online")
                        Console.WriteLine($"[HEARTBEATS] ⚠️ No HTTP target or IP address for device '{device.Name}'");
                    return;
                }

                // Validate that we have a proper absolute URI
                if (!Uri.IsWellFormedUriString(targetUrl, UriKind.Absolute))
                {
                    Console.WriteLine($"[HEARTBEATS] ❌ Invalid URI format for device '{device.Name}': {targetUrl}");
                    return;
                }

                var httpClient = _httpClientFactory.CreateClient();
                httpClient.Timeout = TimeSpan.FromSeconds(5);

                try
                {
                    Console.WriteLine($"[HEARTBEATS] 🌐 HTTP ping to '{device.Name}' at {targetUrl}");

                    // Perform HTTP ping
                    var sw = System.Diagnostics.Stopwatch.StartNew();
                    var response = await httpClient.GetAsync(targetUrl, token).ConfigureAwait(false);
                    var content = await response.Content.ReadAsStringAsync(token).ConfigureAwait(false);
                    sw.Stop();
                    duration = (int)sw.ElapsedMilliseconds;

                    if (response.IsSuccessStatusCode)
                    {
                        bool contentValid = true;

                        if (!string.IsNullOrEmpty(device.HeartbeatExpectedValue))
                        {
                            contentValid = content.Contains(device.HeartbeatExpectedValue);
                            if (!contentValid && prevHeartbeatStatus != "Online")
                            {
                                Console.WriteLine($"[HEARTBEATS] ❌ Expected value '{device.HeartbeatExpectedValue}' not found in response from '{device.Name}'");
                            }
                        }

                        if (contentValid)
                        {
                            try
                            {
                                var jsonDoc = System.Text.Json.JsonDocument.Parse(content);
                                var root = jsonDoc.RootElement;

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
                                if (prevHeartbeatStatus != "Online")
                                    Console.WriteLine($"[HEARTBEATS] ⚠️ Non-JSON response from '{device.Name}': {content.Substring(0, Math.Min(50, content.Length))}");
                            }
                        }

                        success = contentValid;
                    }
                    else
                    {
                        if (prevHeartbeatStatus != "Online")
                            Console.WriteLine($"[HEARTBEATS] ❌ HTTP response failed for '{device.Name}': Status={response.StatusCode}");
                        success = false;
                    }
                }
                catch (Exception ex)
                {
                    if (prevHeartbeatStatus != "Online")
                        Console.WriteLine($"[HEARTBEATS] ⚠️ HTTP error for device '{device.Name}' at {targetUrl}: {ex.Message}");
                    success = false;
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
                        var reply = await ping.SendPingAsync(target, 2000).ConfigureAwait(false);
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
            else if (device.HeartbeatProtocol?.ToUpper() == "SSH")
            {
                // Use the SSH service manager instead of opening new connections
                var deviceKey = $"{device.IPAddress}:{device.SshPort ?? 22}:{device.SshUsername}";
                var command = !string.IsNullOrWhiteSpace(device.HeartbeatTarget) ? device.HeartbeatTarget : "uptime";
                var expectedValue = !string.IsNullOrWhiteSpace(device.HeartbeatExpectedValue) ? device.HeartbeatExpectedValue : "up";

                var (sshSuccess, sshDuration, output) = await _sshService.ExecuteHealthCheckAsync(deviceKey, command, expectedValue).ConfigureAwait(false);
                success = sshSuccess;
                duration = sshDuration;
            }
            else if (device.HeartbeatProtocol?.ToUpper() == "WEBSOCKET")
            {
                if (string.IsNullOrEmpty(device.UniqueIdentifier))
                {
                    Console.WriteLine($"[HEARTBEATS] ❌ Device '{device.Name}' missing MAC address for WebSocket heartbeat");
                    success = false;
                    duration = 0;
                }
                else
                {
                    // Send heartbeat request and wait for response
                    var (wsSuccess, wsDuration, response) = await _webSocketService.SendHeartbeatRequestAsync(device.UniqueIdentifier!, new { }).ConfigureAwait(false);

                    if (wsSuccess && !string.IsNullOrEmpty(response))
                    {
                        // Validate the response includes correct MAC address
                        var validationResult = ValidateWebSocketHeartbeatResponse(response, device.UniqueIdentifier, device.Name);
                        success = validationResult.isValid;
                        duration = wsDuration;

                        if (success)
                        {
                            Console.WriteLine($"[HEARTBEATS] ✅ WebSocket heartbeat verified for '{device.Name}': {validationResult.details}");
                        }
                        else
                        {
                            Console.WriteLine($"[HEARTBEATS] ❌ WebSocket heartbeat validation failed for '{device.Name}': {validationResult.details}");
                        }
                    }
                    else
                    {
                        success = false;
                        duration = wsDuration;
                        Console.WriteLine($"[HEARTBEATS] ❌ WebSocket heartbeat failed for '{device.Name}': {response ?? "No response"}");
                    }
                }
            }
            else if (device.HeartbeatProtocol?.ToUpper() == "ESPNOW")
            {
                // ESP-NOW devices MUST use stream activity for heartbeat
                // ESP-NOW communicates through gateways via HTTP/MQTT/COM protocols
                // If we get here, stream activity check either failed or is disabled
                success = false;
                duration = 0;

                if (device.UseStreamAsHeartbeat)
                {
                    Console.WriteLine($"[HEARTBEATS] 📡 ESP-NOW device '{device.Name}' has no recent stream activity - marking as failed");
                }
                else
                {
                    Console.WriteLine($"[HEARTBEATS] 📡 ESP-NOW device '{device.Name}' requires stream heartbeat to be enabled - marking as failed");
                }
            }

            // Send health report to cloud sync service for batching
            await SendHealthReportToCloudSyncServiceAsync(device, now, success, duration);

            // Traditional heartbeat status update logic
            if (success)
            {
                device.LastPinged = now;
                device.LastPingStatus = "Online";
                device.LastPingDurationMs = duration;
                device.ConsecutivePingFailures = 0;
                _failureCounts.TryRemove(device.Id, out _);
                Console.WriteLine($"[HEARTBEATS] ✅ Device '{device.Name}' is ONLINE ({duration}ms)");
            }
            else
            {
                device.LastPingStatus = "Timeout";
                device.LastPingDurationMs = duration;
                var failures = _failureCounts.AddOrUpdate(device.Id, 1, (_, count) => count + 1);
                var max = device.HeartbeatMaxRetryAttempts ?? 3;

                device.ConsecutivePingFailures = failures;

                if (failures >= max)
                {
                    device.LastPingStatus = "Offline";
                    Console.WriteLine($"[HEARTBEATS] 🚨 Device '{device.Name}' marked OFFLINE after {failures} failures");
                }
                else
                {
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
                        device.LastPingStatus = "Testing";
                        Console.WriteLine($"[HEARTBEATS] ⚠️ Unexpected heartbeat status '{prevHeartbeatStatus}' for device '{device.Name}', setting to TESTING, attempt #{failures}");
                    }
                }
            }

            if (!string.Equals(prevHeartbeatStatus, device.LastPingStatus, StringComparison.OrdinalIgnoreCase))
            {
                Console.WriteLine($"[HEARTBEATS] ↔️ Device '{device.Name}' HEARTBEAT status transition: {prevHeartbeatStatus} -> {device.LastPingStatus}");
            }

            if (!string.Equals(prevDeviceStatus, device.Status, StringComparison.OrdinalIgnoreCase))
            {
                Console.WriteLine($"[HEARTBEATS] ↔️ Device '{device.Name}' DEVICE status transition: {prevDeviceStatus} -> {device.Status}");
            }

            await deviceDb.UpdateDeviceAsync(device.Id, device).ConfigureAwait(false);
        }

        // Add this validation method to the Service_Heartbeats class
        private (bool isValid, string details) ValidateWebSocketHeartbeatResponse(string jsonResponse, string expectedMac, string deviceName)
        {
            try
            {
                var response = JsonSerializer.Deserialize<JsonElement>(jsonResponse, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                // Check basic response structure
                if (!response.TryGetProperty("type", out var typeElement) ||
                    typeElement.GetString() != "heartbeat-response")
                {
                    return (false, "Invalid response type");
                }

                if (!response.TryGetProperty("status", out var statusElement) ||
                    statusElement.GetString() != "ok")
                {
                    var actualStatus = statusElement.GetString() ?? "unknown";
                    return (false, $"Status not OK: {actualStatus}");
                }

                // Critical: Verify MAC address
                if (!response.TryGetProperty("mac", out var macElement))
                {
                    return (false, "Missing MAC address in response");
                }

                var responseMac = macElement.GetString();
                if (string.IsNullOrEmpty(responseMac))
                {
                    return (false, "Empty MAC address in response");
                }

                // Normalize MAC addresses for comparison (remove colons, dashes, make uppercase)
                var normalizedExpected = expectedMac.Replace(":", "").Replace("-", "").ToUpper();
                var normalizedResponse = responseMac.Replace(":", "").Replace("-", "").ToUpper();

                if (!string.Equals(normalizedExpected, normalizedResponse, StringComparison.OrdinalIgnoreCase))
                {
                    return (false, $"MAC mismatch: expected {expectedMac}, got {responseMac}");
                }

                // Extract diagnostic info for logging
                var diagnostics = new List<string>();

                if (response.TryGetProperty("uptime", out var uptimeElement))
                {
                    var uptimeMs = uptimeElement.GetInt64();
                    var uptimeSeconds = uptimeMs / 1000;
                    if (uptimeSeconds > 86400) // > 1 day
                        diagnostics.Add($"uptime: {uptimeSeconds / 86400}d");
                    else if (uptimeSeconds > 3600) // > 1 hour
                        diagnostics.Add($"uptime: {uptimeSeconds / 3600}h");
                    else
                        diagnostics.Add($"uptime: {uptimeSeconds}s");
                }

                if (response.TryGetProperty("freeHeap", out var heapElement))
                {
                    var freeHeap = heapElement.GetInt32();
                    diagnostics.Add($"heap: {freeHeap / 1024}KB");
                }

                if (response.TryGetProperty("ip", out var ipElement))
                {
                    diagnostics.Add($"ip: {ipElement.GetString()}");
                }

                if (response.TryGetProperty("firmware", out var firmwareElement))
                {
                    diagnostics.Add($"fw: {firmwareElement.GetString()}");
                }

                var details = $"MAC verified: {responseMac}";
                if (diagnostics.Any())
                {
                    details += $" ({string.Join(", ", diagnostics)})";
                }

                return (true, details);
            }
            catch (Exception ex)
            {
                return (false, $"JSON parse error: {ex.Message}");
            }
        }

        // New method to send health report to cloud sync service for batching
        private async Task SendHealthReportToCloudSyncServiceAsync(Model_Device device, DateTime timestamp, bool success, int duration)
        {
            // Only send health reports if SyncMode is 'local_health' or 'local_sync'
            if (string.IsNullOrEmpty(device.SyncMode) ||
                (device.SyncMode != "local_health" && device.SyncMode != "local_sync"))
            {
                return; // Skip cloud health reporting for disabled devices
            }

            try
            {
                await _cloudSyncService.AccumulateHealthReportAsync(
                    device.UniqueIdentifier ?? device.Id.ToString(),
                    new
                    {
                        deviceName = device.Name,
                        timestamp = timestamp,
                        status = success ? "online" : "offline",
                        lastPingDurationMs = duration,
                        failureCount = _failureCounts.TryGetValue(device.Id, out var f) ? f : 0,
                        protocol = device.HeartbeatProtocol?.ToLower() ?? "unknown",
                        syncMode = device.SyncMode
                    });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[HEARTBEATS] ⚠️ Failed to send health report for '{device.Name}' to cloud sync service: {ex.Message}");
            }
        }

        // New method to check recent stream activity
        private async Task<(bool success, long latencyMs)> CheckRecentStreamActivityAsync(int deviceId, int thresholdMs)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();

                // Get all stream managers to check for recent activity
                var httpStreamManager = scope.ServiceProvider.GetService<Service_Stream_Manager_HTTP>();
                var mqttStreamManager = scope.ServiceProvider.GetService<Service_Stream_Manager_MQTT>();
                var comStreamManager = scope.ServiceProvider.GetService<Service_Stream_Manager_COM>();
                var webSocketStreamManager = scope.ServiceProvider.GetService<Service_Stream_Manager_WebSocket>();

                var cutoffTime = DateTime.UtcNow.AddMilliseconds(-thresholdMs);
                var recentEntries = new List<(DateTime lastSent, long latency)>();

                // Check HTTP streams
                if (httpStreamManager != null)
                {
                    var httpStreams = httpStreamManager.GetActiveStreams();
                    foreach (var stream in httpStreams)
                    {
                        // Use reflection to get device screens for this device
                        var streamObj = stream.GetType().GetProperties()
                            .ToDictionary(p => p.Name, p => p.GetValue(stream));

                        if (streamObj.TryGetValue("ScreenId", out var screenIdObj) && screenIdObj is int screenId &&
                            streamObj.TryGetValue("LastSentTime", out var lastSentTimeObj) && lastSentTimeObj is DateTime lastSentTime &&
                            streamObj.TryGetValue("Latency", out var latencyObj) && latencyObj is long latency)
                        {
                            // Check if this screen belongs to our device and is recent
                            if (await IsScreenBelongsToDeviceAsync(screenId, deviceId) && lastSentTime > cutoffTime)
                            {
                                recentEntries.Add((lastSentTime, latency));
                            }
                        }
                    }
                }

                // Check MQTT streams
                if (mqttStreamManager != null)
                {
                    var mqttStreams = mqttStreamManager.GetActiveStreams();
                    foreach (var stream in mqttStreams)
                    {
                        var streamObj = stream.GetType().GetProperties()
                            .ToDictionary(p => p.Name, p => p.GetValue(stream));

                        if (streamObj.TryGetValue("ScreenId", out var screenIdObj) && screenIdObj is int screenId &&
                            streamObj.TryGetValue("LastSentTime", out var lastSentTimeObj) && lastSentTimeObj is DateTime lastSentTime &&
                            streamObj.TryGetValue("Latency", out var latencyObj) && latencyObj is long latency)
                        {
                            if (await IsScreenBelongsToDeviceAsync(screenId, deviceId) && lastSentTime > cutoffTime)
                            {
                                recentEntries.Add((lastSentTime, latency));
                            }
                        }
                    }
                }

                // Check COM streams
                if (comStreamManager != null)
                {
                    var comStreams = comStreamManager.GetActiveStreams();
                    foreach (var stream in comStreams)
                    {
                        var streamObj = stream.GetType().GetProperties()
                            .ToDictionary(p => p.Name, p => p.GetValue(stream));

                        if (streamObj.TryGetValue("ScreenId", out var screenIdObj) && screenIdObj is int screenId &&
                            streamObj.TryGetValue("LastSentTime", out var lastSentTimeObj) && lastSentTimeObj is DateTime lastSentTime &&
                            streamObj.TryGetValue("Latency", out var latencyObj) && latencyObj is long latency)
                        {
                            if (await IsScreenBelongsToDeviceAsync(screenId, deviceId) && lastSentTime > cutoffTime)
                            {
                                recentEntries.Add((lastSentTime, latency));
                            }
                        }
                    }
                }

                // Check WebSocket streams
                if (webSocketStreamManager != null)
                {
                    var webSocketStreams = webSocketStreamManager.GetActiveStreams();
                    foreach (var stream in webSocketStreams)
                    {
                        var streamObj = stream.GetType().GetProperties()
                            .ToDictionary(p => p.Name, p => p.GetValue(stream));

                        if (streamObj.TryGetValue("ScreenId", out var screenIdObj) && screenIdObj is int screenId &&
                            streamObj.TryGetValue("LastSentTime", out var lastSentTimeObj) && lastSentTimeObj is DateTime lastSentTime &&
                            streamObj.TryGetValue("Latency", out var latencyObj) && latencyObj is long latency)
                        {
                            if (await IsScreenBelongsToDeviceAsync(screenId, deviceId) && lastSentTime > cutoffTime)
                            {
                                recentEntries.Add((lastSentTime, latency));
                            }
                        }
                    }
                }

                if (recentEntries.Any())
                {
                    // Find the most recent entry with the lowest latency (best quality connection)
                    var bestEntry = recentEntries
                        .OrderByDescending(e => e.lastSent)
                        .ThenBy(e => e.latency)
                        .First();

                    return (true, bestEntry.latency);
                }

                return (false, 0);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[HEARTBEATS] ⚠️ Error checking stream activity for device {deviceId}: {ex.Message}");
                return (false, 0);
            }
        }

        // Helper method to check if a screen belongs to a device
        private async Task<bool> IsScreenBelongsToDeviceAsync(int screenId, int deviceId)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<IDbConnection>();

                var result = await db.QuerySingleOrDefaultAsync<int?>(
                    "SELECT DeviceId FROM DeviceScreens WHERE Id = @ScreenId",
                    new { ScreenId = screenId });

                return result == deviceId;
            }
            catch
            {
                return false;
            }
        }

        public override void Dispose()
        {
            base.Dispose();
        }

        // Obsolete methods kept for compatibility
        [Obsolete("No longer needed - WebSocket client service handles responses internally")]
        public void HandleWebSocketHeartbeatResponse(string deviceMac, bool success, string? responseData = null)
        {
            Console.WriteLine($"[HEARTBEATS] ⚠️ HandleWebSocketHeartbeatResponse called but no longer needed for {deviceMac}");
        }

        [Obsolete("No longer needed with new WebSocket client architecture")]
        private int? FindDeviceIdByMac(string deviceMac)
        {
            return null;
        }
    }
}