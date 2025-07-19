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
using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using JunctionRelayServer.Models;
using JunctionRelayServer.Utils;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_WebSocket_Devices : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ConcurrentDictionary<string, DeviceWebSocketConnection> _deviceConnections = new();
        private readonly int _connectionTimeoutMs = 10000;
        private readonly int _heartbeatTimeoutMs = 3000; // Reduced timeout since new library is faster
        private readonly int _reconnectIntervalMs = 30000;

        public Service_Manager_WebSocket_Devices(IServiceScopeFactory scopeFactory)
        {
            _scopeFactory = scopeFactory;
            Console.WriteLine("[WebSocket Service] Service initialized for WebSocketsServer library (port 81)");
        }

        // Simplified device connection tracking
        private class DeviceWebSocketConnection
        {
            public ClientWebSocket? WebSocket { get; set; }
            public string DeviceId { get; set; } = string.Empty;
            public string DeviceMac { get; set; } = string.Empty;
            public string DeviceIP { get; set; } = string.Empty;
            public string DeviceName { get; set; } = string.Empty;
            public DateTime ConnectedAt { get; set; }
            public bool IsConnected { get; set; } = false;
            public CancellationTokenSource CancellationToken { get; set; } = new();
            public Task? ReceiveTask { get; set; }
            public int ReconnectAttempts { get; set; } = 0;
            public DateTime LastReconnectAttempt { get; set; } = DateTime.MinValue;

            // Simple heartbeat tracking
            public volatile bool LastHeartbeatSuccess = false;
            public DateTime LastHeartbeatSent = DateTime.MinValue;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            Console.WriteLine("[WebSocket Service] Service started (WebSocketsServer compatible)");

            // Wait for database initialization
            using (var initScope = _scopeFactory.CreateScope())
            {
                var startupSignals = initScope.ServiceProvider.GetRequiredService<StartupSignals>();
                await startupSignals.DatabaseInitialized.Task;
            }

            // Main service loop
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await DiscoverAndConnectToDevicesAsync(stoppingToken);
                    await ManageExistingConnectionsAsync(stoppingToken);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[WebSocket Service] ❌ Service loop error: {ex.Message}");
                }

                await Task.Delay(_reconnectIntervalMs, stoppingToken);
            }

            Console.WriteLine("[WebSocket Service] Service stopping...");
            await DisconnectAllDevicesAsync();
        }

        private async Task DiscoverAndConnectToDevicesAsync(CancellationToken stoppingToken)
        {
            using var scope = _scopeFactory.CreateScope();
            var deviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();

            try
            {
                var devices = await deviceDb.GetAllDevicesAsync();
                var webSocketDevices = devices.Where(d =>
                    d.HeartbeatEnabled &&
                    d.HeartbeatProtocol?.ToUpper() == "WEBSOCKET" &&
                    !string.IsNullOrWhiteSpace(d.IPAddress) &&
                    !string.IsNullOrWhiteSpace(d.UniqueIdentifier)
                ).ToList();

                Console.WriteLine($"[WebSocket Service] Found {webSocketDevices.Count} WebSocket devices");

                foreach (var device in webSocketDevices)
                {
                    if (stoppingToken.IsCancellationRequested) break;

                    var deviceMac = device.UniqueIdentifier!;

                    // Skip if already connected
                    if (_deviceConnections.TryGetValue(deviceMac, out var existingConn) && existingConn.IsConnected)
                    {
                        continue;
                    }

                    // Check if enough time has passed since last reconnect attempt
                    if (existingConn != null &&
                        (DateTime.UtcNow - existingConn.LastReconnectAttempt).TotalMilliseconds < _reconnectIntervalMs)
                    {
                        continue;
                    }

                    await ConnectToDeviceAsync(device, stoppingToken);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Client] ❌ Discovery error: {ex.Message}");
            }
        }

        private async Task ManageExistingConnectionsAsync(CancellationToken stoppingToken)
        {
            var disconnectedDevices = new List<string>();

            foreach (var kvp in _deviceConnections)
            {
                var deviceMac = kvp.Key;
                var connection = kvp.Value;

                if (!connection.IsConnected || connection.WebSocket?.State != WebSocketState.Open)
                {
                    Console.WriteLine($"[WebSocket Client] 🔌 Connection lost for device {connection.DeviceName} ({deviceMac})");
                    disconnectedDevices.Add(deviceMac);
                }
            }

            foreach (var deviceMac in disconnectedDevices)
            {
                await DisconnectDeviceAsync(deviceMac);
            }
        }

        private async Task ConnectToDeviceAsync(Model_Device device, CancellationToken stoppingToken)
        {
            var deviceMac = device.UniqueIdentifier!;

            // Parse WebSocket URL from HeartbeatTarget or default to port 81
            string wsUrl;
            if (!string.IsNullOrWhiteSpace(device.HeartbeatTarget))
            {
                // If HeartbeatTarget starts with ws://, use it directly
                if (device.HeartbeatTarget.StartsWith("ws://"))
                {
                    wsUrl = device.HeartbeatTarget;
                }
                // If it's just a port number, construct URL with that port
                else if (device.HeartbeatTarget.All(char.IsDigit))
                {
                    wsUrl = $"ws://{device.IPAddress}:{device.HeartbeatTarget}/";
                }
                // If it's a path, assume it's for the old AsyncWebSocket format
                else if (device.HeartbeatTarget.StartsWith("/"))
                {
                    wsUrl = $"ws://{device.IPAddress}{device.HeartbeatTarget}";
                }
                else
                {
                    // Treat as port:path format like "81" or "81/"
                    wsUrl = $"ws://{device.IPAddress}:{device.HeartbeatTarget}";
                    if (!wsUrl.EndsWith("/")) wsUrl += "/";
                }
            }
            else
            {
                // Default to port 81 for WebSocketsServer
                wsUrl = $"ws://{device.IPAddress}:81/";
            }

            Console.WriteLine($"[WebSocket Client] 🔄 Connecting to {device.Name} ({deviceMac}) at {wsUrl}");

            try
            {
                await DisconnectDeviceAsync(deviceMac);

                var webSocket = new ClientWebSocket();
                var connection = new DeviceWebSocketConnection
                {
                    WebSocket = webSocket,
                    DeviceId = device.Id.ToString(),
                    DeviceMac = deviceMac,
                    DeviceIP = device.IPAddress,
                    DeviceName = device.Name,
                    LastReconnectAttempt = DateTime.UtcNow
                };

                using var connectCts = new CancellationTokenSource(_connectionTimeoutMs);
                using var combinedCts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken, connectCts.Token);

                await webSocket.ConnectAsync(new Uri(wsUrl), combinedCts.Token);

                if (webSocket.State == WebSocketState.Open)
                {
                    connection.IsConnected = true;
                    connection.ConnectedAt = DateTime.UtcNow;
                    connection.ReconnectAttempts = 0;

                    _deviceConnections[deviceMac] = connection;

                    // Start simple receive loop
                    connection.ReceiveTask = Task.Run(async () => await ReceiveMessagesAsync(connection, stoppingToken));

                    Console.WriteLine($"[WebSocket Client] ✅ Connected to {device.Name} ({deviceMac})");
                }
                else
                {
                    Console.WriteLine($"[WebSocket Client] ❌ Failed to connect to {device.Name} ({deviceMac}) - State: {webSocket.State}");
                    webSocket.Dispose();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Client] ❌ Connection error to {device.Name} ({deviceMac}): {ex.Message}");

                if (_deviceConnections.TryGetValue(deviceMac, out var existingConn))
                {
                    existingConn.ReconnectAttempts++;
                    existingConn.LastReconnectAttempt = DateTime.UtcNow;
                }
            }
        }

        private async Task ReceiveMessagesAsync(DeviceWebSocketConnection connection, CancellationToken stoppingToken)
        {
            var buffer = new byte[4096];

            try
            {
                while (connection.IsConnected && !stoppingToken.IsCancellationRequested)
                {
                    try
                    {
                        var result = await connection.WebSocket.ReceiveAsync(buffer, stoppingToken);

                        if (result.MessageType == WebSocketMessageType.Text)
                        {
                            var messageText = Encoding.UTF8.GetString(buffer, 0, result.Count);
                            Console.WriteLine($"[WebSocket Client] 📥 {connection.DeviceName}: {messageText}");

                            // Simple response detection - FAST processing
                            if (messageText == "pong")
                            {
                                connection.LastHeartbeatSuccess = true;
                            }
                            else if (messageText.Contains("heartbeat-response") && messageText.Contains("\"status\":\"ok\""))
                            {
                                connection.LastHeartbeatSuccess = true;
                            }
                        }
                        else if (result.MessageType == WebSocketMessageType.Close)
                        {
                            Console.WriteLine($"[WebSocket Client] 🔌 Close message received from {connection.DeviceName}");
                            break;
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[WebSocket Client] ❌ {connection.DeviceName}: {ex.Message}");
                        break;
                    }
                }
            }
            finally
            {
                connection.IsConnected = false;
                Console.WriteLine($"[WebSocket Client] 🔌 Receive loop ended for {connection.DeviceName}");
            }
        }

        // Simplified heartbeat using simple ping for maximum speed
        public async Task<(bool success, int duration, string? response)> SendHeartbeatRequestAsync(string deviceMac, object? requestData = null)
        {
            if (!_deviceConnections.TryGetValue(deviceMac, out var connection) || !connection.IsConnected)
            {
                Console.WriteLine($"[WebSocket Client] ❌ Device {deviceMac} not connected for heartbeat");
                return (false, 0, null);
            }

            var sw = System.Diagnostics.Stopwatch.StartNew();

            try
            {
                // Reset heartbeat state
                connection.LastHeartbeatSuccess = false;
                connection.LastHeartbeatSent = DateTime.UtcNow;

                // Send simple ping for fastest response
                var pingBytes = Encoding.UTF8.GetBytes("ping");

                await connection.WebSocket!.SendAsync(
                    new ArraySegment<byte>(pingBytes),
                    WebSocketMessageType.Text,
                    true,
                    connection.CancellationToken.Token);

                Console.WriteLine($"[WebSocket Client] 📤 Sent ping to {connection.DeviceName}");

                // Fast polling with shorter intervals
                var timeout = DateTime.UtcNow.AddMilliseconds(_heartbeatTimeoutMs);
                while (DateTime.UtcNow < timeout)
                {
                    if (connection.LastHeartbeatSuccess)
                    {
                        sw.Stop();
                        Console.WriteLine($"[WebSocket Client] ✅ Heartbeat response received from {connection.DeviceName} ({sw.ElapsedMilliseconds}ms)");
                        return (true, (int)sw.ElapsedMilliseconds, "pong");
                    }

                    await Task.Delay(5); // Check every 5ms for faster detection
                }

                // Timeout
                sw.Stop();
                Console.WriteLine($"[WebSocket Client] ⏰ Heartbeat timeout for {connection.DeviceName} ({sw.ElapsedMilliseconds}ms)");
                return (false, (int)sw.ElapsedMilliseconds, null);
            }
            catch (Exception ex)
            {
                sw.Stop();
                Console.WriteLine($"[WebSocket Client] ❌ Heartbeat error for {connection.DeviceName}: {ex.Message}");
                return (false, (int)sw.ElapsedMilliseconds, null);
            }
        }

        // Check if device is connected
        public bool IsDeviceConnected(string deviceMac)
        {
            return _deviceConnections.TryGetValue(deviceMac, out var connection) &&
                   connection.IsConnected &&
                   connection.WebSocket?.State == WebSocketState.Open;
        }

        // Get connected device info
        public IEnumerable<object> GetConnectedDevices()
        {
            return _deviceConnections.Values
                .Where(c => c.IsConnected)
                .Select(c => new
                {
                    DeviceId = c.DeviceId,
                    DeviceMac = c.DeviceMac,
                    DeviceName = c.DeviceName,
                    DeviceIP = c.DeviceIP,
                    ConnectedAt = c.ConnectedAt,
                    ReconnectAttempts = c.ReconnectAttempts
                });
        }

        private async Task DisconnectDeviceAsync(string deviceMac)
        {
            if (_deviceConnections.TryRemove(deviceMac, out var connection))
            {
                try
                {
                    connection.IsConnected = false;
                    connection.CancellationToken.Cancel();

                    if (connection.WebSocket?.State == WebSocketState.Open)
                    {
                        await connection.WebSocket.CloseAsync(
                            WebSocketCloseStatus.NormalClosure,
                            "Disconnecting",
                            CancellationToken.None);
                    }

                    connection.WebSocket?.Dispose();
                    connection.CancellationToken.Dispose();

                    Console.WriteLine($"[WebSocket Client] 🔌 Disconnected from {connection.DeviceName} ({deviceMac})");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[WebSocket Client] ❌ Error disconnecting from {deviceMac}: {ex.Message}");
                }
            }
        }

        private async Task DisconnectAllDevicesAsync()
        {
            Console.WriteLine("[WebSocket Client] 🔌 Disconnecting all devices...");

            var disconnectTasks = _deviceConnections.Keys.Select(deviceMac => DisconnectDeviceAsync(deviceMac));
            await Task.WhenAll(disconnectTasks);

            _deviceConnections.Clear();
            Console.WriteLine("[WebSocket Client] ✅ All devices disconnected");
        }

        public override void Dispose()
        {
            var disconnectTask = DisconnectAllDevicesAsync();
            disconnectTask.Wait(TimeSpan.FromSeconds(5));

            base.Dispose();
        }
    }
}