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
using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_WebSocket_Server
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly Service_Manager_Polling _pollingManager;
        private readonly Service_Manager_Connections _connectionManager;

        // Track dashboard client connections
        private readonly ConcurrentDictionary<string, DashboardWebSocketConnection> _connections = new();

        // Cache for sensor data to reduce processing overhead
        private readonly ConcurrentDictionary<string, Model_Sensor> _sensorCache = new();
        private DateTime _lastSensorCacheUpdate = DateTime.MinValue;
        private readonly TimeSpan _sensorCacheTimeout = TimeSpan.FromSeconds(2); // Cache sensor data for 2 seconds

        // Cancellation token for polling loop shutdown
        private readonly CancellationTokenSource _pollingCancellation = new();

        public Service_Manager_WebSocket_Server(
            IServiceScopeFactory scopeFactory,
            Service_Manager_Polling pollingManager,
            Service_Manager_Connections connectionManager)
        {
            _scopeFactory = scopeFactory;
            _pollingManager = pollingManager;
            _connectionManager = connectionManager;

            Console.WriteLine("[WebSocket Server] Service initialized with sensor cache support - USING LastFrameGeneratedTime FIX");

            // Set up polling for dashboard and sensor data updates
            _ = Task.Run(StartDataPolling);
        }

        private class DashboardWebSocketConnection
        {
            public WebSocket? WebSocket { get; set; }
            public string ConnectionId { get; set; } = string.Empty;
            public DateTime ConnectedAt { get; set; } = DateTime.UtcNow;
            public DateTime LastMessageAt { get; set; } = DateTime.UtcNow;
            public CancellationTokenSource CancellationToken { get; set; } = new();
            public bool IsClosing { get; set; } = false;
            public string ClientInfo { get; set; } = string.Empty;

            // Track what data types this connection wants
            public bool WantsDashboardData { get; set; } = false;
            public bool WantsSensorCacheData { get; set; } = false;
        }

        private class SensorCacheData
        {
            public int SensorId { get; set; }
            public string SensorName { get; set; } = string.Empty;
            public string DeviceName { get; set; } = string.Empty;
            public string SensorType { get; set; } = string.Empty;
            public object? Value { get; set; }
            public string? Unit { get; set; }
            public DateTime Timestamp { get; set; }
            public string Quality { get; set; } = "Unknown";
            public long LastUpdated { get; set; }
        }

        // Handle new client connection (dashboard or sensor cache)
        public async Task HandleConnectionAsync(WebSocket webSocket, string? clientInfo = null)
        {
            var connectionId = Guid.NewGuid().ToString();
            Console.WriteLine($"[WebSocket Server] New connection: {connectionId} ({clientInfo})");

            try
            {
                var connection = new DashboardWebSocketConnection
                {
                    WebSocket = webSocket,
                    ConnectionId = connectionId,
                    ConnectedAt = DateTime.UtcNow,
                    LastMessageAt = DateTime.UtcNow,
                    ClientInfo = clientInfo ?? "Unknown Client",
                    WantsDashboardData = clientInfo?.Contains("Dashboard") == true,
                    WantsSensorCacheData = clientInfo?.Contains("EventEngine") == true
                };

                _connections[connectionId] = connection;

                // Send initial data based on client type
                if (connection.WantsDashboardData)
                {
                    await SendCollectorDataAsync(connectionId);
                    await SendStreamDataAsync(connectionId);
                }

                if (connection.WantsSensorCacheData)
                {
                    await SendSensorCacheDataAsync(connectionId);
                }

                // Handle messages from this connection
                await HandleClientMessagesAsync(connection);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Server] Error handling connection {connectionId}: {ex.Message}");
            }
            finally
            {
                _connections.TryRemove(connectionId, out _);
                Console.WriteLine($"[WebSocket Server] Connection {connectionId} removed");
            }
        }

        // Legacy method for backward compatibility
        public async Task HandleDashboardConnectionAsync(WebSocket webSocket, string? clientInfo = null)
        {
            await HandleConnectionAsync(webSocket, clientInfo ?? "Dashboard Client");
        }

        // Handle messages from clients
        private async Task HandleClientMessagesAsync(DashboardWebSocketConnection connection)
        {
            var buffer = new byte[4096];
            var cancellationToken = connection.CancellationToken.Token;

            try
            {
                while (connection.WebSocket?.State == WebSocketState.Open && !cancellationToken.IsCancellationRequested)
                {
                    var result = await connection.WebSocket.ReceiveAsync(
                        new ArraySegment<byte>(buffer),
                        cancellationToken);

                    if (result.MessageType == WebSocketMessageType.Close)
                        break;

                    if (result.MessageType == WebSocketMessageType.Text)
                    {
                        var messageText = Encoding.UTF8.GetString(buffer, 0, result.Count);
                        await ProcessClientMessageAsync(connection, messageText);
                        connection.LastMessageAt = DateTime.UtcNow;
                    }
                }
            }
            catch (OperationCanceledException)
            {
                Console.WriteLine($"[WebSocket Server] Connection {connection.ConnectionId} cancelled");
            }
            catch (WebSocketException ex) when (ex.WebSocketErrorCode == WebSocketError.ConnectionClosedPrematurely)
            {
                Console.WriteLine($"[WebSocket Server] Connection {connection.ConnectionId} closed prematurely");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Server] Error in message loop for {connection.ConnectionId}: {ex.Message}");
            }
        }

        // Process messages from clients
        private async Task ProcessClientMessageAsync(DashboardWebSocketConnection connection, string messageText)
        {
            try
            {
                var messageDoc = JsonDocument.Parse(messageText);
                var messageType = messageDoc.RootElement.GetProperty("type").GetString();

                switch (messageType?.ToLower())
                {
                    // Dashboard message types
                    case "request-collectors":
                        connection.WantsDashboardData = true;
                        await SendCollectorDataAsync(connection.ConnectionId);
                        break;
                    case "request-streams":
                        connection.WantsDashboardData = true;
                        await SendStreamDataAsync(connection.ConnectionId);
                        break;

                    // Sensor cache message types
                    case "request-sensor-cache":
                        connection.WantsSensorCacheData = true;
                        await SendSensorCacheDataAsync(connection.ConnectionId);
                        break;

                    // Common message types
                    case "ping":
                        await SendToConnectionAsync(connection.ConnectionId, new { type = "pong", timestamp = DateTime.UtcNow });
                        break;

                    default:
                        Console.WriteLine($"[WebSocket Server] Unknown message type: {messageType}");
                        break;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Server] Error processing message: {ex.Message}");
            }
        }

        // Start polling for data changes
        private async Task StartDataPolling()
        {
            while (!_pollingCancellation.Token.IsCancellationRequested)
            {
                try
                {
                    if (_connections.Any())
                    {
                        var dashboardConnections = _connections.Values.Where(c => c.WantsDashboardData).ToList();
                        var sensorConnections = _connections.Values.Where(c => c.WantsSensorCacheData).ToList();

                        // Update dashboard data if there are dashboard clients
                        if (dashboardConnections.Any())
                        {
                            await BroadcastCollectorDataAsync();
                            await BroadcastStreamDataAsync();
                        }
                    }

                    await Task.Delay(100, _pollingCancellation.Token); // Keep 100ms for dashboard updates
                }
                catch (OperationCanceledException)
                {
                    // Clean exit on cancellation
                    break;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[WebSocket Server] Error in polling loop: {ex.Message}");
                    try
                    {
                        await Task.Delay(1000, _pollingCancellation.Token);
                    }
                    catch (OperationCanceledException)
                    {
                        break;
                    }
                }
            }
            Console.WriteLine("[WebSocket Server] Polling loop stopped");
        }

        // Send collector data to specific connection
        private async Task SendCollectorDataAsync(string connectionId)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var collectorsService = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Collectors>();

                var collectors = await collectorsService.GetAllCollectorsAsync();
                var activePollers = _pollingManager.GetActivePollers();

                var collectorData = new
                {
                    type = "collectors-update",
                    timestamp = DateTime.UtcNow,
                    data = activePollers.Select(poller => new
                    {
                        sourceKey = poller.SourceKey,
                        sourceName = poller.SourceName,
                        sourceType = collectors.FirstOrDefault(c => c.Name == poller.SourceName)?.CollectorType ?? "Unknown",
                        status = poller.Status,
                        sensorCount = poller.PolledSensors?.Count ?? 0,
                        junctionCount = 0, // TODO: Calculate from connections
                        rate = poller.Rate,
                        lastPollTime = poller.LastPollTime,
                        polledSensors = poller.PolledSensors
                    })
                };

                await SendToConnectionAsync(connectionId, collectorData);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Server] Error sending collector data: {ex.Message}");
            }
        }

        // Send sensor cache data to specific connection
        private async Task SendSensorCacheDataAsync(string connectionId)
        {
            try
            {
                await RefreshSensorCacheAsync();

                var sensorData = new
                {
                    type = "sensor-cache-update",
                    timestamp = DateTime.UtcNow,
                    data = _sensorCache.Values.ToList()
                };

                await SendToConnectionAsync(connectionId, sensorData);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Server] Error sending sensor cache data: {ex.Message}");
            }
        }


        private Task RefreshSensorCacheAsync()
        {
            var now = DateTime.UtcNow;

            if (now - _lastSensorCacheUpdate < _sensorCacheTimeout)
                return Task.CompletedTask;

            using var scope = _scopeFactory.CreateScope();
            var connectionManager = scope.ServiceProvider.GetRequiredService<Service_Manager_Connections>();

            var allSensors = connectionManager.GetAllSensors();

            _sensorCache.Clear();

            foreach (var sensor in allSensors)
            {
                var sensorKey = $"{sensor.DeviceName}_{sensor.Id}";

                // Store the full sensor object directly
                _sensorCache[sensorKey] = sensor;
            }

            _lastSensorCacheUpdate = now;

            // Console.WriteLine($"[WebSocket Server] Refreshed sensor cache from Service_Manager_Connections with {_sensorCache.Count} sensors");

            return Task.CompletedTask;
        }

        // Send stream data to specific connection
        private async Task SendStreamDataAsync(string connectionId)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var httpStreamManager = scope.ServiceProvider.GetService<Service_Stream_Manager_HTTP>();
                var mqttStreamManager = scope.ServiceProvider.GetService<Service_Stream_Manager_MQTT>();
                var comStreamManager = scope.ServiceProvider.GetService<Service_Stream_Manager_COM>();
                var webSocketStreamManager = scope.ServiceProvider.GetService<Service_Stream_Manager_WebSocket>();
                var virtualStreamManager = scope.ServiceProvider.GetService<Service_Stream_Manager_Virtual>();

                var allStreams = new List<Model_StreamInfo_DTO>();

                // Collect streams from all managers - clean, type-safe code!
                if (httpStreamManager != null)
                    allStreams.AddRange(httpStreamManager.GetActiveStreams());

                if (mqttStreamManager != null)
                    allStreams.AddRange(mqttStreamManager.GetActiveStreams());

                if (comStreamManager != null)
                    allStreams.AddRange(comStreamManager.GetActiveStreams());

                if (webSocketStreamManager != null)
                    allStreams.AddRange(webSocketStreamManager.GetActiveStreams());

                if (virtualStreamManager != null)
                    allStreams.AddRange(virtualStreamManager.GetActiveStreams());

                var streamData = new
                {
                    type = "streams-update",
                    timestamp = DateTime.UtcNow,
                    data = allStreams
                };

                await SendToConnectionAsync(connectionId, streamData);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Server] Error sending stream data: {ex.Message}");
            }
        }

        private static int? ConvertToNullableInt(object? value)
        {
            if (value == null) return null;

            return value switch
            {
                int intValue => intValue,
                long longValue => longValue > int.MaxValue ? int.MaxValue : (int)longValue,
                short shortValue => shortValue,
                byte byteValue => byteValue,
                double doubleValue => (int)Math.Round(doubleValue),
                float floatValue => (int)Math.Round(floatValue),
                decimal decimalValue => (int)Math.Round(decimalValue),
                string stringValue when int.TryParse(stringValue, out var parsed) => parsed,
                _ => null
            };
        }

        // Broadcast collector data to all dashboard connections
        private async Task BroadcastCollectorDataAsync()
        {
            var dashboardConnections = _connections.Values.Where(c => c.WantsDashboardData).ToList();
            foreach (var connection in dashboardConnections)
            {
                await SendCollectorDataAsync(connection.ConnectionId);
            }
        }

        // Broadcast stream data to all dashboard connections
        private async Task BroadcastStreamDataAsync()
        {
            var dashboardConnections = _connections.Values.Where(c => c.WantsDashboardData).ToList();
            foreach (var connection in dashboardConnections)
            {
                await SendStreamDataAsync(connection.ConnectionId);
            }
        }

        // Broadcast sensor cache data to all sensor cache connections
        private async Task BroadcastSensorCacheDataAsync()
        {
            var sensorConnections = _connections.Values.Where(c => c.WantsSensorCacheData).ToList();
            foreach (var connection in sensorConnections)
            {
                await SendSensorCacheDataAsync(connection.ConnectionId);
            }
        }

        // Send message to specific connection
        private async Task<bool> SendToConnectionAsync(string connectionId, object message)
        {
            if (!_connections.TryGetValue(connectionId, out var connection) ||
                connection.WebSocket?.State != WebSocketState.Open)
                return false;

            try
            {
                var jsonOptions = new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                };
                var messageJson = JsonSerializer.Serialize(message, jsonOptions);
                var messageBytes = Encoding.UTF8.GetBytes(messageJson);

                await connection.WebSocket.SendAsync(
                    new ArraySegment<byte>(messageBytes),
                    WebSocketMessageType.Text,
                    true,
                    connection.CancellationToken.Token);

                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Server] Error sending to {connectionId}: {ex.Message}");
                return false;
            }
        }

        // Get connected clients
        public IEnumerable<object> GetConnectedClients()
        {
            return _connections.Values.Select(conn => new
            {
                ConnectionId = conn.ConnectionId,
                ConnectedAt = conn.ConnectedAt,
                LastMessageAt = conn.LastMessageAt,
                ClientInfo = conn.ClientInfo,
                WantsDashboardData = conn.WantsDashboardData,
                WantsSensorCacheData = conn.WantsSensorCacheData,
                IsConnected = conn.WebSocket?.State == WebSocketState.Open
            });
        }

        // Close all connections
        public async Task CloseAllConnectionsAsync(string reason = "Service shutdown")
        {
            Console.WriteLine("[WebSocket Server] Stopping polling loop...");
            _pollingCancellation.Cancel();
            await Task.Delay(200); // Give polling loop time to exit

            Console.WriteLine($"[WebSocket Server] Closing {_connections.Count} connections...");

            var tasks = new List<Task>();
            foreach (var conn in _connections.Values.ToList())
            {
                tasks.Add(CloseConnectionAsync(conn, reason));
            }

            await Task.WhenAll(tasks);
            _connections.Clear();
            _sensorCache.Clear();

            Console.WriteLine("[WebSocket Server] All connections closed");
        }

        private async Task CloseConnectionAsync(DashboardWebSocketConnection connection, string reason)
        {
            if (connection.IsClosing)
                return;

            connection.IsClosing = true;

            try
            {
                // Cancel the message handler first
                connection.CancellationToken.Cancel();

                // Only try to close if still in a valid state
                if (connection.WebSocket?.State == WebSocketState.Open ||
                    connection.WebSocket?.State == WebSocketState.CloseReceived)
                {
                    await connection.WebSocket.CloseAsync(
                        WebSocketCloseStatus.NormalClosure,
                        reason,
                        CancellationToken.None);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Server] Error closing connection {connection.ConnectionId}: {ex.Message}");
            }
            finally
            {
                connection.CancellationToken?.Dispose();
            }
        }
    }
}