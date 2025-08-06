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
        private readonly int _heartbeatTimeoutMs = 3000;
        private readonly int _reconnectIntervalMs = 30000;

        // Connection status cache to reduce lookup overhead
        private readonly ConcurrentDictionary<string, (bool isConnected, DateTime lastCheck)> _connectionCache = new();
        private readonly TimeSpan _connectionCacheTimeout = TimeSpan.FromMilliseconds(500);

        public Service_Manager_WebSocket_Devices(IServiceScopeFactory scopeFactory)
        {
            _scopeFactory = scopeFactory;
            Console.WriteLine("[WebSocket Service] Service initialized for WebSocketsServer library (port 81)");
        }

        // Enhanced device connection tracking
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

            // Enhanced heartbeat tracking
            public volatile bool LastHeartbeatSuccess = false;
            public DateTime LastHeartbeatSent = DateTime.MinValue;
            public string? LastHeartbeatResponse = null;
            public long? LastDeviceUptime = null;
            public int? LastDeviceFreeHeap = null;
            public int? LastDeviceClients = null;
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

                    // Clear any cached connection status
                    _connectionCache.TryRemove(deviceMac, out _);

                    // Start enhanced receive loop
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
                            // Only log non-routine messages (not OK responses)
                            if (!messageText.Trim().Equals("OK", StringComparison.OrdinalIgnoreCase))
                            {
                                Console.WriteLine($"[WebSocket Client] 📥 {connection.DeviceName}: {messageText}");
                            }

                            await ProcessIncomingMessage(connection, messageText);
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
                // Clear cached connection status
                _connectionCache.TryRemove(connection.DeviceMac, out _);
                Console.WriteLine($"[WebSocket Client] 🔌 Receive loop ended for {connection.DeviceName}");
            }
        }

        // Enhanced message processing to handle new WebSocket helper format
        private async Task ProcessIncomingMessage(DeviceWebSocketConnection connection, string messageText)
        {
            try
            {
                // Handle simple ping/pong response
                if (messageText == "pong")
                {
                    connection.LastHeartbeatSuccess = true;
                    connection.LastHeartbeatResponse = messageText;
                    return;
                }

                // Handle simple OK responses from streaming
                if (messageText.Trim().Equals("OK", StringComparison.OrdinalIgnoreCase))
                {
                    // Silent acknowledgment - no logging needed for routine streaming responses
                    return;
                }

                // Handle device-connected message (sent automatically on connection)
                if (messageText.Contains("device-connected"))
                {
                    Console.WriteLine($"[WebSocket Client] 📱 Device connected message from {connection.DeviceName}");
                    return;
                }

                // Handle JSON messages
                if (messageText.StartsWith("{") && messageText.EndsWith("}"))
                {
                    try
                    {
                        using var jsonDoc = JsonDocument.Parse(messageText);
                        var root = jsonDoc.RootElement;

                        if (root.TryGetProperty("type", out var typeElement))
                        {
                            var messageType = typeElement.GetString();

                            switch (messageType)
                            {
                                case "heartbeat-response":
                                    await HandleHeartbeatResponse(connection, root);
                                    break;

                                case "websocket_pong":
                                    await HandleWebSocketPong(connection, root);
                                    break;

                                case "error":
                                    await HandleErrorMessage(connection, root);
                                    break;

                                default:
                                    Console.WriteLine($"[WebSocket Client] ❓ Unknown message type '{messageType}' from {connection.DeviceName}");
                                    break;
                            }
                        }
                        else
                        {
                            Console.WriteLine($"[WebSocket Client] ⚠️ JSON message without type field from {connection.DeviceName}");
                        }
                    }
                    catch (JsonException ex)
                    {
                        Console.WriteLine($"[WebSocket Client] ❌ JSON parse error from {connection.DeviceName}: {ex.Message}");
                    }
                }
                else
                {
                    Console.WriteLine($"[WebSocket Client] ❓ Unrecognized message format from {connection.DeviceName}: {messageText.Substring(0, Math.Min(50, messageText.Length))}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Client] ❌ Error processing message from {connection.DeviceName}: {ex.Message}");
            }
        }

        // Handle the enhanced heartbeat-response format from our WebSocket helper
        private async Task HandleHeartbeatResponse(DeviceWebSocketConnection connection, JsonElement root)
        {
            try
            {
                // Look for data.status (new format from our WebSocket helper)
                if (root.TryGetProperty("data", out var dataElement) &&
                    dataElement.TryGetProperty("status", out var statusElement))
                {
                    var status = statusElement.GetString();
                    connection.LastHeartbeatSuccess = status?.Equals("ok", StringComparison.OrdinalIgnoreCase) == true;
                    connection.LastHeartbeatResponse = root.GetRawText();

                    // Extract additional device info
                    if (dataElement.TryGetProperty("uptime", out var uptimeElement))
                    {
                        connection.LastDeviceUptime = uptimeElement.GetInt64();
                    }

                    if (dataElement.TryGetProperty("freeHeap", out var heapElement))
                    {
                        connection.LastDeviceFreeHeap = heapElement.GetInt32();
                    }

                    if (dataElement.TryGetProperty("clients", out var clientsElement))
                    {
                        connection.LastDeviceClients = clientsElement.GetInt32();
                    }

                    Console.WriteLine($"[WebSocket Client] 💓 Heartbeat response from {connection.DeviceName}: " +
                                    $"Status={status}, Uptime={connection.LastDeviceUptime}ms, " +
                                    $"Heap={connection.LastDeviceFreeHeap}, Clients={connection.LastDeviceClients}");
                }
                else
                {
                    Console.WriteLine($"[WebSocket Client] ⚠️ Heartbeat response missing data.status from {connection.DeviceName}");
                    connection.LastHeartbeatSuccess = false;
                    connection.LastHeartbeatResponse = root.GetRawText();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Client] ❌ Error processing heartbeat response from {connection.DeviceName}: {ex.Message}");
                connection.LastHeartbeatSuccess = false;
            }
        }

        // Handle WebSocket pong responses (for protocol-level pings)
        private async Task HandleWebSocketPong(DeviceWebSocketConnection connection, JsonElement root)
        {
            connection.LastHeartbeatSuccess = true;
            connection.LastHeartbeatResponse = root.GetRawText();

            // Extract device info if available
            if (root.TryGetProperty("uptime", out var uptimeElement))
            {
                connection.LastDeviceUptime = uptimeElement.GetInt64();
            }

            if (root.TryGetProperty("freeHeap", out var heapElement))
            {
                connection.LastDeviceFreeHeap = heapElement.GetInt32();
            }

            if (root.TryGetProperty("clients", out var clientsElement))
            {
                connection.LastDeviceClients = clientsElement.GetInt32();
            }

            Console.WriteLine($"[WebSocket Client] 🏓 WebSocket pong from {connection.DeviceName}: " +
                            $"Uptime={connection.LastDeviceUptime}ms, Heap={connection.LastDeviceFreeHeap}, " +
                            $"Clients={connection.LastDeviceClients}");
        }

        // Handle error messages from device
        private async Task HandleErrorMessage(DeviceWebSocketConnection connection, JsonElement root)
        {
            var error = root.TryGetProperty("error", out var errorElement) ? errorElement.GetString() : "Unknown error";
            var context = root.TryGetProperty("context", out var contextElement) ? contextElement.GetString() : "";

            Console.WriteLine($"[WebSocket Client] ❌ Error from {connection.DeviceName}: {error}" +
                            (string.IsNullOrEmpty(context) ? "" : $" (Context: {context})"));
        }

        // Enhanced heartbeat using simple ping for maximum speed
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
                connection.LastHeartbeatSuccess = false;
                connection.LastHeartbeatSent = DateTime.UtcNow;
                connection.LastHeartbeatResponse = null;

                var heartbeatRequest = new
                {
                    type = "heartbeat-request",
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                };
                var pingJson = JsonSerializer.Serialize(heartbeatRequest);
                var pingBytes = Encoding.UTF8.GetBytes(pingJson);

                await connection.WebSocket!.SendAsync(
                    new ArraySegment<byte>(pingBytes),
                    WebSocketMessageType.Text,
                    true,
                    connection.CancellationToken.Token);

                Console.WriteLine($"[WebSocket Client] 📤 Sent heartbeat request to {connection.DeviceName}");

                var timeout = DateTime.UtcNow.AddMilliseconds(_heartbeatTimeoutMs);
                while (DateTime.UtcNow < timeout)
                {
                    if (connection.LastHeartbeatResponse != null)
                    {
                        string responseStr = connection.LastHeartbeatResponse;
                        try
                        {
                            var doc = JsonDocument.Parse(responseStr);
                            var root = doc.RootElement;

                            if (root.TryGetProperty("status", out var statusProp) && statusProp.GetString() == "ok")
                            {
                                connection.LastHeartbeatSuccess = true;

                                var mac = root.GetProperty("mac").GetString();
                                var uptime = root.GetProperty("uptime").GetInt32();
                                var heap = root.GetProperty("freeHeap").GetInt32();
                                var fw = root.TryGetProperty("firmware", out var fwProp) ? fwProp.GetString() : "n/a";
                                var clients = root.TryGetProperty("clients", out var clientProp) ? clientProp.GetInt32() : -1;

                                connection.LastDeviceUptime = uptime;
                                connection.LastDeviceFreeHeap = heap;
                                connection.LastDeviceClients = clients;

                                sw.Stop();
                                var info = $" [Uptime: {uptime}ms, Heap: {heap}, Clients: {clients}, FW: {fw}]";
                                Console.WriteLine($"[WebSocket Client] ✅ Heartbeat response received from {connection.DeviceName} ({sw.ElapsedMilliseconds}ms){info}");

                                return (true, (int)sw.ElapsedMilliseconds, responseStr);
                            }
                            else
                            {
                                Console.WriteLine($"[WebSocket Client] ⚠️ Heartbeat response missing or invalid 'status' from {connection.DeviceName}");
                            }
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine($"[WebSocket Client] ⚠️ Failed to parse heartbeat JSON from {connection.DeviceName}: {ex.Message}");
                        }

                        break; // exit polling early if we got something but it's invalid
                    }

                    await Task.Delay(5);
                }

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

        // Optimized send data to device (for streaming) - minimal overhead
        public async Task<(bool success, string? response, string? errorType, string? errorMessage, WebSocketState? connectionState)> SendDataToDeviceAsync(string deviceMac, byte[] data)
        {
            try
            {
                if (!_deviceConnections.TryGetValue(deviceMac, out var connection))
                {
                    return (false, null, "not_found", $"Device {deviceMac} not found", null);
                }

                if (!connection.IsConnected || connection.WebSocket?.State != WebSocketState.Open)
                {
                    return (false, null, "not_connected", $"Device {deviceMac} not connected", connection.WebSocket?.State);
                }

                // Send the data through the client WebSocket - optimized for speed
                // FIXED: Send as Binary instead of Text since we're receiving byte[] data
                await connection.WebSocket!.SendAsync(
                    new ArraySegment<byte>(data),
                    WebSocketMessageType.Binary,  // Changed from Text to Binary
                    true,
                    connection.CancellationToken.Token);

                return (true, "Data sent successfully", null, null, connection.WebSocket.State);
            }
            catch (OperationCanceledException)
            {
                return (false, null, "cancelled", "Send operation was cancelled", null);
            }
            catch (WebSocketException wsEx)
            {
                Console.WriteLine($"[WebSocket Client] ❌ WebSocket error sending to {deviceMac}: {wsEx.Message}");
                return (false, null, "websocket_error", wsEx.Message, null);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Client] ❌ Unexpected error sending to {deviceMac}: {ex.Message}");
                return (false, null, "unexpected_error", ex.Message, null);
            }
        }

        // Optimized connection check with caching
        public bool IsDeviceConnected(string deviceMac)
        {
            var now = DateTime.UtcNow;

            // Check cache first
            if (_connectionCache.TryGetValue(deviceMac, out var cached) &&
                now - cached.lastCheck < _connectionCacheTimeout)
            {
                return cached.isConnected;
            }

            // Perform actual check
            var result = _deviceConnections.TryGetValue(deviceMac, out var connection) &&
                   connection.IsConnected &&
                   connection.WebSocket?.State == WebSocketState.Open;

            // Update cache
            _connectionCache[deviceMac] = (result, now);

            // Only log when connection check fails for debugging
            if (!result)
            {
                Console.WriteLine($"[WebSocket Client] 🔍 Connection check for {deviceMac}: {result}");
                if (_deviceConnections.TryGetValue(deviceMac, out var conn))
                {
                    Console.WriteLine($"  - Found in connections: {conn.IsConnected}");
                    Console.WriteLine($"  - WebSocket state: {conn.WebSocket?.State}");
                }
                else
                {
                    Console.WriteLine($"  - Not found in connections dictionary");
                    Console.WriteLine($"  - Available devices: [{string.Join(", ", _deviceConnections.Keys)}]");
                }
            }

            return result;
        }

        // Enhanced connected device info
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
                    ReconnectAttempts = c.ReconnectAttempts,
                    LastHeartbeatSent = c.LastHeartbeatSent,
                    LastHeartbeatSuccess = c.LastHeartbeatSuccess,
                    LastDeviceUptime = c.LastDeviceUptime,
                    LastDeviceFreeHeap = c.LastDeviceFreeHeap,
                    LastDeviceClients = c.LastDeviceClients
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

                    // Clear cache
                    _connectionCache.TryRemove(deviceMac, out _);

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
            _connectionCache.Clear();
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