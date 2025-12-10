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
    public class Service_Manager_WebSocket_Client : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ConcurrentDictionary<string, DeviceWebSocketConnection> _deviceConnections = new();
        private readonly int _connectionTimeoutMs = 10000;
        private readonly int _heartbeatTimeoutMs = 3000;
        private readonly int _reconnectIntervalMs = 30000;

        // Connection status cache to reduce lookup overhead
        private readonly ConcurrentDictionary<string, (bool isConnected, DateTime lastCheck)> _connectionCache = new();
        private readonly TimeSpan _connectionCacheTimeout = TimeSpan.FromMilliseconds(500);

        // Track connection attempts to prevent duplicate simultaneous connections
        private readonly ConcurrentDictionary<string, Task> _connectionAttempts = new();

        // Track pending request-response operations for VirtualDevice metrics
        private readonly ConcurrentDictionary<string, TaskCompletionSource<string>> _pendingRequests = new();

        public Service_Manager_WebSocket_Client(IServiceScopeFactory scopeFactory)
        {
            _scopeFactory = scopeFactory;
            Console.WriteLine("[WebSocket Service] Service initialized for WebSocketsServer library");
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

        // NEW METHOD: Ensure connection exists for a device (on-demand connection)
        public async Task<bool> EnsureConnectionAsync(string deviceMac, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrEmpty(deviceMac))
            {
                Console.WriteLine("[WebSocket Service] ❌ Device MAC cannot be null or empty");
                return false;
            }

            // Check if already connected
            if (IsDeviceConnected(deviceMac))
            {
                Console.WriteLine($"[WebSocket Service] ✅ Device {deviceMac} already connected");
                return true;
            }

            // Check if there's already a connection attempt in progress
            if (_connectionAttempts.TryGetValue(deviceMac, out var existingAttempt) && !existingAttempt.IsCompleted)
            {
                Console.WriteLine($"[WebSocket Service] ⏳ Connection attempt already in progress for {deviceMac}, waiting...");
                try
                {
                    await existingAttempt;
                    return IsDeviceConnected(deviceMac);
                }
                catch
                {
                    return false;
                }
            }

            // Start new connection attempt
            var connectionTask = ConnectToDeviceByMacAsync(deviceMac, cancellationToken);
            _connectionAttempts[deviceMac] = connectionTask;

            try
            {
                var success = await connectionTask;
                Console.WriteLine($"[WebSocket Service] {(success ? "✅" : "❌")} On-demand connection for {deviceMac}: {success}");
                return success;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Service] ❌ Error in on-demand connection for {deviceMac}: {ex.Message}");
                return false;
            }
            finally
            {
                _connectionAttempts.TryRemove(deviceMac, out _);
            }
        }

        // NEW METHOD: Connect to device by MAC address (used by EnsureConnectionAsync)
        private async Task<bool> ConnectToDeviceByMacAsync(string deviceMac, CancellationToken cancellationToken = default)
        {
            using var scope = _scopeFactory.CreateScope();
            var deviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();

            try
            {
                // Find device by MAC address
                var devices = await deviceDb.GetAllDevicesAsync();
                var device = devices.FirstOrDefault(d =>
                    string.Equals(d.UniqueIdentifier, deviceMac, StringComparison.OrdinalIgnoreCase));

                if (device == null)
                {
                    Console.WriteLine($"[WebSocket Service] ❌ Device with MAC {deviceMac} not found in database");
                    return false;
                }

                if (string.IsNullOrWhiteSpace(device.IPAddress))
                {
                    Console.WriteLine($"[WebSocket Service] ❌ Device {device.Name} ({deviceMac}) has no IP address");
                    return false;
                }

                Console.WriteLine($"[WebSocket Service] 🔄 On-demand connection to {device.Name} ({deviceMac}) at {device.IPAddress}");

                return await ConnectToDeviceAsync(device, cancellationToken);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Service] ❌ Error finding device {deviceMac}: {ex.Message}");
                return false;
            }
        }

        private async Task DiscoverAndConnectToDevicesAsync(CancellationToken stoppingToken)
        {
            using var scope = _scopeFactory.CreateScope();
            var deviceDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Devices>();

            try
            {
                var devices = await deviceDb.GetAllDevicesAsync();

                // Find devices that need WebSocket connections:
                // 1. VirtualDevices (always connect if Active status)
                // 2. Regular devices with WebSocket heartbeat enabled
                var webSocketDevices = devices.Where(d =>
                    !string.IsNullOrWhiteSpace(d.IPAddress) &&
                    !string.IsNullOrWhiteSpace(d.UniqueIdentifier) &&
                    (
                        (d.IsVirtualDevice && d.Status == "Active") ||
                        (d.HeartbeatEnabled && d.HeartbeatProtocol?.ToUpper() == "WEBSOCKET")
                    )
                ).ToList();

                Console.WriteLine($"[WebSocket Service] 🔍 Discovery scan: Found {webSocketDevices.Count} devices needing WebSocket connections");

                // Log VirtualDevices specifically
                var virtualDevices = webSocketDevices.Where(d => d.IsVirtualDevice).ToList();
                if (virtualDevices.Any())
                {
                    Console.WriteLine($"[WebSocket Service] 🎮 VirtualDevices found: {string.Join(", ", virtualDevices.Select(d => $"{d.Name} (Status={d.Status})"))}");
                }

                foreach (var device in webSocketDevices)
                {
                    if (stoppingToken.IsCancellationRequested) break;

                    var deviceMac = device.UniqueIdentifier!;

                    // Skip if already connected
                    if (_deviceConnections.TryGetValue(deviceMac, out var existingConn) && existingConn.IsConnected)
                    {
                        if (device.IsVirtualDevice)
                        {
                            Console.WriteLine($"[WebSocket Service] ⏭️ VirtualDevice {device.Name} already connected, skipping");
                        }
                        continue;
                    }

                    // Check if enough time has passed since last reconnect attempt
                    if (existingConn != null &&
                        (DateTime.UtcNow - existingConn.LastReconnectAttempt).TotalMilliseconds < _reconnectIntervalMs)
                    {
                        if (device.IsVirtualDevice)
                        {
                            var timeSinceAttempt = (DateTime.UtcNow - existingConn.LastReconnectAttempt).TotalSeconds;
                            Console.WriteLine($"[WebSocket Service] ⏰ VirtualDevice {device.Name} reconnect too soon ({timeSinceAttempt:F1}s ago), waiting...");
                        }
                        continue;
                    }

                    // Skip if there's an ongoing connection attempt
                    if (_connectionAttempts.ContainsKey(deviceMac))
                    {
                        if (device.IsVirtualDevice)
                        {
                            Console.WriteLine($"[WebSocket Service] ⏳ VirtualDevice {device.Name} connection attempt already in progress");
                        }
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

        private async Task<bool> ConnectToDeviceAsync(Model_Device device, CancellationToken stoppingToken)
        {
            var deviceMac = device.UniqueIdentifier!;

            // Use WebSocketPort if available, otherwise default to 81
            int wsPort = device.WebSocketPort ?? 81;

            // Parse WebSocket URL from HeartbeatTarget or use the port
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
                // If it's a path, use the WebSocketPort (or default 81) with the path
                else if (device.HeartbeatTarget.StartsWith("/"))
                {
                    wsUrl = $"ws://{device.IPAddress}:{wsPort}{device.HeartbeatTarget}";
                }
                else
                {
                    // Treat as port:path format like "8081" or "8081/"
                    wsUrl = $"ws://{device.IPAddress}:{device.HeartbeatTarget}";
                    if (!wsUrl.EndsWith("/")) wsUrl += "/";
                }
            }
            else
            {
                // Use WebSocketPort from device (or default 81)
                wsUrl = $"ws://{device.IPAddress}:{wsPort}/";
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

                    // Send identification message to Virtual Device so it knows not to echo back to us
                    try
                    {
                        var identifyMessage = JsonSerializer.Serialize(new
                        {
                            type = "identify",
                            role = "server"
                        });
                        var identifyBytes = Encoding.UTF8.GetBytes(identifyMessage);
                        await webSocket.SendAsync(new ArraySegment<byte>(identifyBytes), WebSocketMessageType.Text, true, stoppingToken);
                        Console.WriteLine($"[WebSocket Client] 📤 Sent identification to {device.Name}");
                    }
                    catch (Exception identifyEx)
                    {
                        Console.WriteLine($"[WebSocket Client] ⚠️ Failed to send identification to {device.Name}: {identifyEx.Message}");
                    }

                    // Start enhanced receive loop
                    connection.ReceiveTask = Task.Run(async () => await ReceiveMessagesAsync(connection, stoppingToken));

                    Console.WriteLine($"[WebSocket Client] ✅ Connected to {device.Name} ({deviceMac})");
                    return true;
                }
                else
                {
                    Console.WriteLine($"[WebSocket Client] ❌ Failed to connect to {device.Name} ({deviceMac}) - State: {webSocket.State}");
                    webSocket.Dispose();
                    return false;
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
                return false;
            }
        }

        private async Task ReceiveMessagesAsync(DeviceWebSocketConnection connection, CancellationToken stoppingToken)
        {
            var buffer = new byte[8192]; // Increased buffer size
            var messageBuffer = new List<byte>();

            try
            {
                while (connection.IsConnected && !stoppingToken.IsCancellationRequested && connection.WebSocket != null)
                {
                    try
                    {
                        var result = await connection.WebSocket.ReceiveAsync(buffer, stoppingToken);

                        if (result.MessageType == WebSocketMessageType.Text)
                        {
                            // Accumulate message fragments
                            for (int i = 0; i < result.Count; i++)
                            {
                                messageBuffer.Add(buffer[i]);
                            }

                            // Check if this is the end of the message
                            if (result.EndOfMessage)
                            {
                                var messageText = Encoding.UTF8.GetString(messageBuffer.ToArray());
                                messageBuffer.Clear();
                                await ProcessIncomingMessage(connection, messageText);
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
                        messageBuffer.Clear(); // Clear partial message on error
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
                            var messageType = typeElement.GetString() ?? "";

                            switch (messageType)
                            {
                                case "heartbeat-response":
                                    await HandleHeartbeatResponse(connection, root);
                                    break;

                                case "websocket_pong":
                                    await HandleWebSocketPong(connection, root);
                                    break;

                                case "sensor_update":
                                    await HandleSensorUpdate(connection, root);
                                    break;

                                case "error":
                                    await HandleErrorMessage(connection, root);
                                    break;

                                case "metrics_response":
                                    HandleMetricsResponse(connection, messageText);
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
        private Task HandleHeartbeatResponse(DeviceWebSocketConnection connection, JsonElement root)
        {
            try
            {
                // Look for data.status (new format from our WebSocket helper)
                if (root.TryGetProperty("data", out var dataElement) &&
                    dataElement.TryGetProperty("status", out var statusElement))
                {
                    var status = statusElement.GetString() ?? "";
                    connection.LastHeartbeatSuccess = status.Equals("ok", StringComparison.OrdinalIgnoreCase);
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

            return Task.CompletedTask;
        }

        // Handle WebSocket pong responses (for protocol-level pings)
        private Task HandleWebSocketPong(DeviceWebSocketConnection connection, JsonElement root)
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

            return Task.CompletedTask;
        }

        // Handle sensor update messages from device
        private async Task HandleSensorUpdate(DeviceWebSocketConnection connection, JsonElement root)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var inboundManager = scope.ServiceProvider.GetRequiredService<Service_Manager_Inbound_Sensors>();

                // For POC, we'll use a placeholder junction ID - you'll need to implement proper lookup
                int junctionId = 1; // TODO: Implement proper junction lookup

                // Handle single sensor update
                if (root.TryGetProperty("sensor_key", out var keyElement) &&
                    root.TryGetProperty("value", out var valueElement))
                {
                    var sensorKey = keyElement.GetString() ?? "";
                    var value = valueElement.ToString();
                    var sensorType = root.TryGetProperty("sensor_type", out var typeElement) ?
                                    (typeElement.GetString() ?? "Analog") : "Analog";

                    var success = await inboundManager.ProcessInboundSensorUpdateAsync(
                        junctionId: junctionId,
                        deviceMac: connection.DeviceMac,
                        sensorKey: sensorKey,
                        value: value,
                        sensorType: sensorType
                    );

                    Console.WriteLine($"[WebSocket Client] 📊 Sensor update {sensorKey}={value} from {connection.DeviceName}: {(success ? "✅" : "❌")}");
                }
                // Handle batch sensor update  
                else if (root.TryGetProperty("data", out var dataElement) && dataElement.ValueKind == JsonValueKind.Object)
                {
                    var sensorData = new Dictionary<string, object>();

                    foreach (var property in dataElement.EnumerateObject())
                    {
                        sensorData[property.Name] = property.Value.ToString();
                    }

                    var successCount = await inboundManager.ProcessInboundSensorBatchAsync(
                        junctionId: junctionId,
                        deviceMac: connection.DeviceMac,
                        sensorData: sensorData
                    );

                    Console.WriteLine($"[WebSocket Client] 📊 Batch sensor update from {connection.DeviceName}: {successCount}/{sensorData.Count} processed");
                }
                else
                {
                    Console.WriteLine($"[WebSocket Client] ⚠️ Sensor update missing required fields from {connection.DeviceName}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Client] ❌ Error processing sensor update from {connection.DeviceName}: {ex.Message}");
            }
        }

        // Handle error messages from device
        private Task HandleErrorMessage(DeviceWebSocketConnection connection, JsonElement root)
        {
            var error = root.TryGetProperty("error", out var errorElement) ? (errorElement.GetString() ?? "Unknown error") : "Unknown error";
            var context = root.TryGetProperty("context", out var contextElement) ? (contextElement.GetString() ?? "") : "";

            Console.WriteLine($"[WebSocket Client] ❌ Error from {connection.DeviceName}: {error}" +
                            (string.IsNullOrEmpty(context) ? "" : $" (Context: {context})"));

            return Task.CompletedTask;
        }

        // Handle metrics_response from VirtualDevice
        private void HandleMetricsResponse(DeviceWebSocketConnection connection, string messageText)
        {
            try
            {
                // Check if there's a pending request for this device
                if (_pendingRequests.TryRemove(connection.DeviceMac, out var tcs))
                {
                    tcs.TrySetResult(messageText);
                }
                else
                {
                    Console.WriteLine($"[WebSocket Client] ⚠️ Received metrics response from {connection.DeviceName} but no pending request found");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Client] ❌ Error handling metrics response from {connection.DeviceName}: {ex.Message}");
            }
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

        // Send data and wait for response (request-response pattern for VirtualDevice metrics)
        public async Task<(bool success, string? response, string? errorType, string? errorMessage, WebSocketState? connectionState)> SendDataAndWaitForResponseAsync(
            string deviceMac,
            byte[] data,
            int timeoutMs = 5000)
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

                // Create a TaskCompletionSource to wait for the response
                var tcs = new TaskCompletionSource<string>();

                // Register the pending request
                if (!_pendingRequests.TryAdd(deviceMac, tcs))
                {
                    // There's already a pending request for this device
                    return (false, null, "pending_request", $"Device {deviceMac} already has a pending request", connection.WebSocket.State);
                }

                try
                {
                    // Send the request
                    await connection.WebSocket!.SendAsync(
                        new ArraySegment<byte>(data),
                        WebSocketMessageType.Text,  // Send as Text for JSON messages
                        true,
                        connection.CancellationToken.Token);

                    // Wait for the response with timeout
                    var responseTask = tcs.Task;
                    var timeoutTask = Task.Delay(timeoutMs);

                    var completedTask = await Task.WhenAny(responseTask, timeoutTask);

                    if (completedTask == responseTask)
                    {
                        // Response received
                        var response = await responseTask;
                        return (true, response, null, null, connection.WebSocket.State);
                    }
                    else
                    {
                        // Timeout
                        Console.WriteLine($"[WebSocket Client] ⏰ Response timeout from {connection.DeviceName} ({timeoutMs}ms)");
                        _pendingRequests.TryRemove(deviceMac, out _);
                        return (false, null, "timeout", $"Response timeout after {timeoutMs}ms", connection.WebSocket.State);
                    }
                }
                catch
                {
                    // Clean up pending request on error
                    _pendingRequests.TryRemove(deviceMac, out _);
                    throw;
                }
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