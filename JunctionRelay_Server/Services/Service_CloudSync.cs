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

using System.Collections.Concurrent;
using System.Text.Json;

namespace JunctionRelayServer.Services
{
    public class Service_CloudSync : BackgroundService
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Service_CloudSessionStore _cloudSessionStore;
        private readonly Service_Notifications _notificationService;
        private readonly Timer _healthReportTimer;

        // Store accumulated health reports (deviceId -> latest health data)
        private readonly ConcurrentDictionary<string, object> _accumulatedHealthReports = new();

        // Class to store health report data for batching
        private class DeviceHealthReport
        {
            public string DeviceId { get; set; } = string.Empty;
            public string DeviceName { get; set; } = string.Empty;
            public DateTime Timestamp { get; set; }
            public string Status { get; set; } = string.Empty;
            public int LastPingDurationMs { get; set; }
            public int FailureCount { get; set; }
            public string Protocol { get; set; } = string.Empty;
            public string SyncMode { get; set; } = string.Empty;
        }

        // Master switch for per-device cloud sync (health batches). OFF by
        // default, like lab sync: nothing leaves this machine implicitly. The
        // per-device right-click Cloud Sync Mode chooses WHICH devices sync;
        // this flag chooses WHETHER any of it runs at all.
        public const string DeviceCloudSyncEnabledKey = "device_cloud_sync_enabled";

        private readonly Service_Lab_CloudSyncPush _labPush;
        private readonly IService_Settings _settings;

        public Service_CloudSync(
            IHttpClientFactory httpClientFactory,
            Service_CloudSessionStore cloudSessionStore,
            Service_Notifications notificationService,
            Service_Lab_CloudSyncPush labPush,
            IService_Settings settings)
        {
            _httpClientFactory = httpClientFactory;
            _cloudSessionStore = cloudSessionStore;
            _notificationService = notificationService;
            _labPush = labPush;
            _settings = settings;

            // Set up timer to send health reports every minute
            _healthReportTimer = new Timer(SendAccumulatedHealthReports, null, TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(1));
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            Console.WriteLine("[CLOUDSYNC] ✅ Cloud sync service started");

            // 60s ticks; each periodic job decides for itself whether it is due.
            while (!stoppingToken.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(60), stoppingToken);

                // Lab/Models cloud sync — opt-in, and quiet unless enabled and
                // logged in. A push-only mirror: the periodic snapshot goes up
                // when the interval has elapsed; nothing comes back down.
                try
                {
                    // HasPersistedSession, not IsAuthenticated: after a restart no
                    // access token exists yet, and the push mints its own
                    // via GetValidAccessTokenAsync. Gating on IsAuthenticated put
                    // the loop to sleep until a manual sync happened to wake it.
                    if (await _labPush.IsEnabledAsync() && _cloudSessionStore.HasPersistedSession)
                    {
                        var interval = TimeSpan.FromMinutes(await _labPush.IntervalMinutesAsync());
                        var last = _labPush.LastSuccessAt ?? DateTime.MinValue;
                        if (DateTime.UtcNow - last >= interval)
                        {
                            await _labPush.PushSnapshotAsync(stoppingToken);
                        }
                    }
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[CLOUDSYNC] ⚠️ Lab snapshot push cycle failed: {ex.Message}");
                }
            }

            Console.WriteLine("[CLOUDSYNC] ⛔ Cloud sync service stopping...");
        }

        // Method for other services to accumulate health reports for batching
        public async Task AccumulateHealthReportAsync(string deviceId, object healthData)
        {
            if (string.IsNullOrWhiteSpace(deviceId) || healthData == null)
                return;

            // Store the latest health report for this device (overwrites previous)
            _accumulatedHealthReports.AddOrUpdate(deviceId, healthData, (key, oldValue) => healthData);

            await Task.CompletedTask; // Make it async for consistency
        }

        // Timer callback to send accumulated health reports
        private async void SendAccumulatedHealthReports(object? state)
        {
            if (_accumulatedHealthReports.IsEmpty)
                return;

            try
            {
                // Opt-in master switch — consistent with lab sync: disabled means
                // nothing leaves, and the batch drains quietly so a later enable
                // does not flush stale reports.
                var enabled = string.Equals(
                    await _settings.GetSettingAsync(DeviceCloudSyncEnabledKey), "true",
                    StringComparison.OrdinalIgnoreCase);
                if (!enabled)
                {
                    _accumulatedHealthReports.Clear();
                    return;
                }
                // Extract all accumulated reports
                var reportsToSend = new List<DeviceHealthReport>();
                var reportsCopy = new Dictionary<string, object>(_accumulatedHealthReports);

                // Clear the accumulated reports immediately to avoid race conditions
                _accumulatedHealthReports.Clear();

                // Convert to DeviceHealthReport objects
                foreach (var kvp in reportsCopy)
                {
                    try
                    {
                        var healthDataJson = JsonSerializer.Serialize(kvp.Value);
                        var healthData = JsonSerializer.Deserialize<JsonElement>(healthDataJson);

                        var report = new DeviceHealthReport
                        {
                            DeviceId = kvp.Key,
                            DeviceName = healthData.TryGetProperty("deviceName", out var nameElement) ? nameElement.GetString() ?? kvp.Key : kvp.Key,
                            Timestamp = healthData.TryGetProperty("timestamp", out var timestampElement) ? timestampElement.GetDateTime() : DateTime.UtcNow,
                            Status = healthData.TryGetProperty("status", out var statusElement) ? statusElement.GetString() ?? "unknown" : "unknown",
                            LastPingDurationMs = healthData.TryGetProperty("lastPingDurationMs", out var durationElement) ? durationElement.GetInt32() : 0,
                            FailureCount = healthData.TryGetProperty("failureCount", out var failureElement) ? failureElement.GetInt32() : 0,
                            Protocol = healthData.TryGetProperty("protocol", out var protocolElement) ? protocolElement.GetString() ?? "unknown" : "unknown",
                            SyncMode = healthData.TryGetProperty("syncMode", out var syncModeElement) ? syncModeElement.GetString() ?? "unknown" : "unknown"
                        };

                        reportsToSend.Add(report);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[CLOUDSYNC] ⚠️ Error converting health data for device {kvp.Key}: {ex.Message}");
                    }
                }

                if (!reportsToSend.Any())
                    return;

                // Send to cloud
                var cloudToken = await _cloudSessionStore.GetValidAccessTokenAsync(CancellationToken.None);
                if (string.IsNullOrEmpty(cloudToken))
                {
                    Console.WriteLine("[CLOUDSYNC] ⚠️ No cloud token available for health reporting");
                    await _notificationService.NotifyHealthReportFailedAsync("No cloud authentication token available");
                    return;
                }

                var cloudHealthUrl = "https://api.junctionrelay.com/local-devices/health/batch";

                var payload = new
                {
                    timestamp = DateTime.UtcNow,
                    deviceCount = reportsToSend.Count,
                    devices = reportsToSend.Select(hr => new
                    {
                        deviceId = hr.DeviceId,
                        deviceName = hr.DeviceName,
                        timestamp = hr.Timestamp,
                        status = hr.Status,
                        lastPingDurationMs = hr.LastPingDurationMs,
                        failureCount = hr.FailureCount,
                        protocol = hr.Protocol
                    }).ToList()
                };

                var httpClient = _httpClientFactory.CreateClient();
                var cloudReq = new HttpRequestMessage(HttpMethod.Post, cloudHealthUrl)
                {
                    Content = new StringContent(JsonSerializer.Serialize(payload), System.Text.Encoding.UTF8, "application/json")
                };
                cloudReq.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cloudToken);

                var cloudResp = await httpClient.SendAsync(cloudReq);
                if (cloudResp.IsSuccessStatusCode)
                {
                    var onlineCount = reportsToSend.Count(hr => hr.Status == "online");
                    var offlineCount = reportsToSend.Count(hr => hr.Status == "offline");
                    var syncModes = string.Join(", ", reportsToSend.Select(hr => hr.SyncMode).Distinct());

                    Console.WriteLine($"[CLOUDSYNC] ☁️ Sent combined health report to cloud: {reportsToSend.Count} devices ({onlineCount} online, {offlineCount} offline) [Modes: {syncModes}]");

                    // Send enhanced multi-line success notification
                    await _notificationService.NotifyHealthReportSentAsync(
                        reportsToSend.Count,
                        onlineCount,
                        offlineCount,
                        syncModes.Length > 20 ? "Multiple sync modes" : syncModes
                    );
                }
                else
                {
                    var responseContent = await cloudResp.Content.ReadAsStringAsync();
                    Console.WriteLine($"[CLOUDSYNC] ❌ Failed to send combined health report to cloud: {cloudResp.StatusCode} - {responseContent}");

                    // Send failure notification with error details
                    await _notificationService.NotifyHealthReportFailedAsync(
                        $"HTTP {cloudResp.StatusCode}: {responseContent}",
                        reportsToSend.Count
                    );
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLOUDSYNC] ❌ Error sending accumulated health reports: {ex.Message}");

                // Send error notification with exception details
                await _notificationService.NotifyHealthReportFailedAsync(
                    $"Network error: {ex.Message}",
                    0
                );
            }
        }

        public override void Dispose()
        {
            _healthReportTimer?.Dispose();
            base.Dispose();
        }
    }
}