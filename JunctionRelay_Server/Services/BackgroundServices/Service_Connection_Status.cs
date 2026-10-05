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
using System.Text.Json;
using JunctionRelayServer.Models;
using JunctionRelayServer.Services;
using JunctionRelayServer.Utils;
using Microsoft.Extensions.DependencyInjection;

namespace JunctionRelayServer.Services.BackgroundServices
{
    public class Service_Connection_Status : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IService_Settings _settingsService;

        // Class to store connection status response from device
        private class DeviceConnectionStatusResponse
        {
            public bool EspNow { get; set; }
            public bool WifiUp { get; set; }
            public bool MqttUp { get; set; }
            public bool EthernetUp { get; set; }
            public bool WebSocketUp { get; set; }
            public string? Ip { get; set; }
            public string? Mac { get; set; }
            public string? ActiveNetworkType { get; set; }
            public string? BackendServerIP { get; set; }
        }

        public Service_Connection_Status(
            IServiceScopeFactory scopeFactory,
            IHttpClientFactory httpClientFactory,
            IService_Settings settingsService)
        {
            _scopeFactory = scopeFactory;
            _httpClientFactory = httpClientFactory;
            _settingsService = settingsService;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            Console.WriteLine("[CONNECTION_STATUS] ✅ Connection Status service initialized");

            // Wait for database to be initialized
            using (var initScope = _scopeFactory.CreateScope())
            {
                var startupSignals = initScope.ServiceProvider.GetRequiredService<StartupSignals>();
                await startupSignals.DatabaseInitialized.Task.ConfigureAwait(false);

                var deviceDb = initScope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();
                var allDevices = await deviceDb.GetAllDevicesAsync().ConfigureAwait(false);

                foreach (var device in allDevices)
                {
                    // Set connection mode to null on startup (only for connection status enabled devices)
                    if (device.ConnectionStatusEnabled)
                    {
                        device.ConnMode = null;
                        await deviceDb.UpdateDeviceAsync(device.Id, device).ConfigureAwait(false);
                    }
                }

                var connectionDeviceCount = allDevices.Count(d => d.ConnectionStatusEnabled);
                Console.WriteLine($"[CONNECTION_STATUS] ⏳ Set {connectionDeviceCount} connection status enabled device(s) to null ConnMode on startup");
            }

            bool isFirstRun = true;

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    // Check if connection status service is enabled via settings
                    var serviceEnabled = await _settingsService.GetBoolSettingAsync("service_connection_status_enabled", true);

                    if (!serviceEnabled)
                    {
                        if (isFirstRun)
                        {
                            Console.WriteLine("[CONNECTION_STATUS] ⏸️ Connection Status service is DISABLED via settings - skipping processing");
                            isFirstRun = false;
                        }
                        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken).ConfigureAwait(false);
                        continue;
                    }

                    using var scope = _scopeFactory.CreateScope();
                    var deviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();
                    var devices = await deviceDb.GetAllDevicesAsync().ConfigureAwait(false);
                    var now = DateTime.UtcNow;

                    // Process Connection Status Checks
                    await ProcessConnectionStatusChecksAsync(deviceDb, devices, now, stoppingToken).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[CONNECTION_STATUS] ❌ Top-level exception: {ex.Message}");
                }

                isFirstRun = false;
                await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken).ConfigureAwait(false);
            }

            Console.WriteLine("[CONNECTION_STATUS] ⛔ Connection Status service stopping...");
        }

        private async Task ProcessConnectionStatusChecksAsync(
            Service_Database_Manager_Devices deviceDb,
            List<Model_Device> devices,
            DateTime now,
            CancellationToken stoppingToken)
        {
            // Get devices that need connection status checks
            var connectionStatusDevices = devices
                .Where(d => d.ConnectionStatusEnabled
                           && !string.IsNullOrWhiteSpace(d.IPAddress)
                           && (d.LastConnectionStatusCheck == null
                               || now - d.LastConnectionStatusCheck.Value >= TimeSpan.FromMilliseconds(d.ConnectionStatusIntervalMs ?? 300000)))
                .OrderBy(d => d.LastConnectionStatusCheck ?? DateTime.MinValue)
                .ToList();

            if (!connectionStatusDevices.Any())
                return;

            Console.WriteLine($"[CONNECTION_STATUS] 🔍 Checking connection status for {connectionStatusDevices.Count} device(s)");

            foreach (var device in connectionStatusDevices)
            {
                if (stoppingToken.IsCancellationRequested)
                    break;

                await ProcessDeviceConnectionStatusAsync(deviceDb, device, now, stoppingToken).ConfigureAwait(false);

                // Small delay between connection status checks to avoid overwhelming devices
                if (!stoppingToken.IsCancellationRequested)
                {
                    await Task.Delay(200, stoppingToken).ConfigureAwait(false); // 200ms between checks
                }
            }

            Console.WriteLine($"[CONNECTION_STATUS] ✅ Connection status checks completed for {connectionStatusDevices.Count} device(s)");
        }

        private async Task ProcessDeviceConnectionStatusAsync(
            Service_Database_Manager_Devices deviceDb,
            Model_Device device,
            DateTime now,
            CancellationToken stoppingToken)
        {
            try
            {
                var httpClient = _httpClientFactory.CreateClient();
                httpClient.Timeout = TimeSpan.FromSeconds(5); // Quick timeout for connection status

                var connectionStatusUrl = $"http://{device.IPAddress}/api/connection/status";

                Console.WriteLine($"[CONNECTION_STATUS] 🌐 Checking connection status for '{device.Name}' at {connectionStatusUrl}");

                var response = await httpClient.GetAsync(connectionStatusUrl, stoppingToken).ConfigureAwait(false);

                if (response.IsSuccessStatusCode)
                {
                    var jsonContent = await response.Content.ReadAsStringAsync(stoppingToken).ConfigureAwait(false);
                    var connectionStatus = JsonSerializer.Deserialize<DeviceConnectionStatusResponse>(jsonContent, new JsonSerializerOptions
                    {
                        PropertyNameCaseInsensitive = true
                    });

                    if (connectionStatus != null)
                    {
                        var activeConnections = new List<string>();

                        if (connectionStatus.EthernetUp) activeConnections.Add("Ethernet");
                        if (connectionStatus.WifiUp) activeConnections.Add("WiFi");
                        if (connectionStatus.EspNow) activeConnections.Add("ESP-NOW");
                        if (connectionStatus.MqttUp) activeConnections.Add("MQTT");

                        string? newConnMode = activeConnections.Any() ? string.Join(",", activeConnections) : null;

                        if (device.ConnMode != newConnMode)
                        {
                            device.ConnMode = newConnMode;
                            Console.WriteLine($"[CONNECTION_STATUS] ✅ Updated '{device.Name}' connection mode: {newConnMode ?? "null"}");
                        }
                        else
                        {
                            Console.WriteLine($"[CONNECTION_STATUS] ℹ️ '{device.Name}' connection mode unchanged: {newConnMode ?? "null"}");
                        }
                    }
                    else
                    {
                        Console.WriteLine($"[CONNECTION_STATUS] ⚠️ Invalid JSON response from '{device.Name}': {jsonContent}");
                        device.ConnMode = null;
                    }
                }
                else
                {
                    Console.WriteLine($"[CONNECTION_STATUS] ❌ Failed to get connection status from '{device.Name}': {response.StatusCode}");
                    device.ConnMode = null;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CONNECTION_STATUS] ⚠️ Error checking connection status for '{device.Name}': {ex.Message}");
                device.ConnMode = null;
            }
            finally
            {
                device.LastConnectionStatusCheck = now;
                await deviceDb.UpdateDeviceAsync(device.Id, device).ConfigureAwait(false);
            }
        }

        public override void Dispose()
        {
            base.Dispose();
        }
    }
}