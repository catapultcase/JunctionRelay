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
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_WebSocket_Dashboard
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly Service_Manager_Polling _pollingManager;
        private readonly Service_Manager_Connections _connectionManager;

        // Track dashboard client connections
        private readonly ConcurrentDictionary<string, DashboardWebSocketConnection> _connections = new();

        public Service_Manager_WebSocket_Dashboard(
            IServiceScopeFactory scopeFactory,
            Service_Manager_Polling pollingManager,
            Service_Manager_Connections connectionManager)
        {
            _scopeFactory = scopeFactory;
            _pollingManager = pollingManager;
            _connectionManager = connectionManager;

            Console.WriteLine("[Dashboard WebSocket] Service initialized");

            // Set up polling for dashboard data updates
            _ = Task.Run(StartDashboardDataPolling);
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
        }

        // Handle new dashboard client connection
        public async Task HandleDashboardConnectionAsync(WebSocket webSocket, string? clientInfo = null)
        {
            var connectionId = Guid.NewGuid().ToString();
            Console.WriteLine($"[Dashboard WebSocket] New connection: {connectionId}");

            try
            {
                var connection = new DashboardWebSocketConnection
                {
                    WebSocket = webSocket,
                    ConnectionId = connectionId,
                    ConnectedAt = DateTime.UtcNow,
                    LastMessageAt = DateTime.UtcNow,
                    ClientInfo = clientInfo ?? "Dashboard Client"
                };

                _connections[connectionId] = connection;

                // Send initial data
                await SendCollectorDataAsync(connectionId);
                await SendStreamDataAsync(connectionId);

                // Handle messages from this connection
                await HandleDashboardMessagesAsync(connection);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Dashboard WebSocket] Error handling connection {connectionId}: {ex.Message}");
            }
            finally
            {
                _connections.TryRemove(connectionId, out _);
                Console.WriteLine($"[Dashboard WebSocket] Connection {connectionId} removed");
            }
        }

        // Handle messages from dashboard clients
        private async Task HandleDashboardMessagesAsync(DashboardWebSocketConnection connection)
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
                        await ProcessDashboardMessageAsync(connection, messageText);
                        connection.LastMessageAt = DateTime.UtcNow;
                    }
                }
            }
            catch (OperationCanceledException)
            {
                Console.WriteLine($"[Dashboard WebSocket] Connection {connection.ConnectionId} cancelled");
            }
            catch (WebSocketException ex) when (ex.WebSocketErrorCode == WebSocketError.ConnectionClosedPrematurely)
            {
                Console.WriteLine($"[Dashboard WebSocket] Connection {connection.ConnectionId} closed prematurely");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Dashboard WebSocket] Error in message loop for {connection.ConnectionId}: {ex.Message}");
            }
        }

        // Process messages from dashboard clients
        private async Task ProcessDashboardMessageAsync(DashboardWebSocketConnection connection, string messageText)
        {
            try
            {
                var messageDoc = JsonDocument.Parse(messageText);
                var messageType = messageDoc.RootElement.GetProperty("type").GetString();

                switch (messageType?.ToLower())
                {
                    case "request-collectors":
                        await SendCollectorDataAsync(connection.ConnectionId);
                        break;
                    case "request-streams":
                        await SendStreamDataAsync(connection.ConnectionId);
                        break;
                    case "ping":
                        await SendToConnectionAsync(connection.ConnectionId, new { type = "pong", timestamp = DateTime.UtcNow });
                        break;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Dashboard WebSocket] Error processing message: {ex.Message}");
            }
        }

        // Start polling for dashboard data changes
        private async Task StartDashboardDataPolling()
        {
            while (true)
            {
                try
                {
                    if (_connections.Any())
                    {
                        await BroadcastCollectorDataAsync();
                        await BroadcastStreamDataAsync();
                    }

                    await Task.Delay(100); // Update every 100ms for high-frequency junctions (20ms+)
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[Dashboard WebSocket] Error in polling loop: {ex.Message}");
                    await Task.Delay(1000); // Wait longer on error
                }
            }
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
                Console.WriteLine($"[Dashboard WebSocket] Error sending collector data: {ex.Message}");
            }
        }

        // Send stream data to specific connection - REVERTED TO ORIGINAL WITH MQTT FIX
        private async Task SendStreamDataAsync(string connectionId)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var httpStreamManager = scope.ServiceProvider.GetService<Service_Stream_Manager_HTTP>();
                var mqttStreamManager = scope.ServiceProvider.GetService<Service_Stream_Manager_MQTT>();
                var comStreamManager = scope.ServiceProvider.GetService<Service_Stream_Manager_COM>();

                var allStreams = new List<object>();

                // Collect HTTP streams with enhanced health data (ORIGINAL APPROACH)
                if (httpStreamManager != null)
                {
                    var httpStreams = httpStreamManager.GetActiveStreams();
                    foreach (var stream in httpStreams)
                    {
                        var streamType = stream.GetType();

                        var healthProperty = streamType.GetProperty("Health");
                        object healthData = null;

                        if (healthProperty != null)
                        {
                            var healthValue = healthProperty.GetValue(stream);
                            if (healthValue != null)
                            {
                                var healthType = healthValue.GetType();
                                healthData = new
                                {
                                    connectionState = healthType.GetProperty("ConnectionState")?.GetValue(healthValue)?.ToString() ?? "unknown",
                                    successRate = (double)(healthType.GetProperty("SuccessRate")?.GetValue(healthValue) ?? 0.0),
                                    lastErrorMessage = healthType.GetProperty("LastErrorMessage")?.GetValue(healthValue)?.ToString() ?? "",
                                    errorType = healthType.GetProperty("ErrorType")?.GetValue(healthValue)?.ToString() ?? "",
                                    consecutiveFailures = (int)(healthType.GetProperty("ConsecutiveFailures")?.GetValue(healthValue) ?? 0),
                                    consecutiveSuccesses = (int)(healthType.GetProperty("ConsecutiveSuccesses")?.GetValue(healthValue) ?? 0),
                                    keepAlivePoolRecreated = (bool)(healthType.GetProperty("KeepAlivePoolRecreated")?.GetValue(healthValue) ?? false),
                                    httpStatusCode = (int)(healthType.GetProperty("HttpStatusCode")?.GetValue(healthValue) ?? 200),
                                    averageLatency = (double)(healthType.GetProperty("AverageLatency")?.GetValue(healthValue) ?? 0.0),
                                    maxLatency = (long)(healthType.GetProperty("MaxLatency")?.GetValue(healthValue) ?? 0),
                                    minLatency = (long)(healthType.GetProperty("MinLatency")?.GetValue(healthValue) ?? 0),
                                    lastSuccessTime = (DateTime)(healthType.GetProperty("LastSuccessTime")?.GetValue(healthValue) ?? DateTime.MinValue),
                                    lastFailureTime = (DateTime)(healthType.GetProperty("LastFailureTime")?.GetValue(healthValue) ?? DateTime.MinValue),
                                    poolRecreationCount = (int)(healthType.GetProperty("PoolRecreationCount")?.GetValue(healthValue) ?? 0)
                                };
                            }
                        }

                        allStreams.Add(new
                        {
                            streamKey = streamType.GetProperty("StreamKey")?.GetValue(stream)?.ToString() ?? "unknown",
                            protocol = streamType.GetProperty("Protocol")?.GetValue(stream)?.ToString() ?? "HTTP",
                            deviceName = streamType.GetProperty("DeviceName")?.GetValue(stream)?.ToString() ?? "Unknown Device",
                            screenName = streamType.GetProperty("ScreenName")?.GetValue(stream)?.ToString() ?? "Unknown Screen",
                            status = streamType.GetProperty("Status")?.GetValue(stream)?.ToString() ?? "Unknown",
                            sensorsCount = (int)(streamType.GetProperty("SensorsCount")?.GetValue(stream) ?? 0),
                            rate = (int)(streamType.GetProperty("Rate")?.GetValue(stream) ?? 0),
                            latency = (long)(streamType.GetProperty("Latency")?.GetValue(stream) ?? 0),
                            lastSentTime = (DateTime)(streamType.GetProperty("LastSentTime")?.GetValue(stream) ?? DateTime.MinValue),
                            configPayloadJson = streamType.GetProperty("ConfigPayloadJson")?.GetValue(stream)?.ToString() ?? "{}",
                            lastSentPayloadJson = streamType.GetProperty("LastSentPayloadJson")?.GetValue(stream)?.ToString() ?? "{}",
                            compressedConfigPayloadPrefix = streamType.GetProperty("CompressedConfigPayloadPrefix")?.GetValue(stream)?.ToString() ?? "",
                            compressedLastSentPayloadPrefix = streamType.GetProperty("CompressedLastSentPayloadPrefix")?.GetValue(stream)?.ToString() ?? "",
                            configPayloadCompressed = streamType.GetProperty("ConfigPayloadCompressed")?.GetValue(stream)?.ToString() ?? "",
                            lastSentPayloadCompressed = streamType.GetProperty("LastSentPayloadCompressed")?.GetValue(stream)?.ToString() ?? "",
                            health = healthData
                        });
                    }
                }

                // Collect MQTT streams - FIXED TO GET THE ARRAYS
                if (mqttStreamManager != null)
                {
                    var mqttStreams = mqttStreamManager.GetActiveStreams();
                    foreach (var stream in mqttStreams)
                    {
                        var streamType = stream.GetType();

                        // Extract health information like HTTP streams do
                        var healthProperty = streamType.GetProperty("Health");
                        object healthData = null;

                        if (healthProperty != null)
                        {
                            var healthValue = healthProperty.GetValue(stream);
                            if (healthValue != null)
                            {
                                var healthType = healthValue.GetType();
                                healthData = new
                                {
                                    connectionState = healthType.GetProperty("ConnectionState")?.GetValue(healthValue)?.ToString() ?? "unknown",
                                    successRate = (double)(healthType.GetProperty("SuccessRate")?.GetValue(healthValue) ?? 0.0),
                                    lastErrorMessage = healthType.GetProperty("LastErrorMessage")?.GetValue(healthValue)?.ToString() ?? "",
                                    errorType = healthType.GetProperty("ErrorType")?.GetValue(healthValue)?.ToString() ?? "",
                                    consecutiveFailures = (int)(healthType.GetProperty("ConsecutiveFailures")?.GetValue(healthValue) ?? 0),
                                    consecutiveSuccesses = (int)(healthType.GetProperty("ConsecutiveSuccesses")?.GetValue(healthValue) ?? 0),
                                    connectionRecreated = (bool)(healthType.GetProperty("ConnectionRecreated")?.GetValue(healthValue) ?? false),
                                    averageLatency = (double)(healthType.GetProperty("AverageLatency")?.GetValue(healthValue) ?? 0.0),
                                    maxLatency = (long)(healthType.GetProperty("MaxLatency")?.GetValue(healthValue) ?? 0),
                                    minLatency = (long)(healthType.GetProperty("MinLatency")?.GetValue(healthValue) ?? 0),
                                    lastSuccessTime = (DateTime)(healthType.GetProperty("LastSuccessTime")?.GetValue(healthValue) ?? DateTime.MinValue),
                                    lastFailureTime = (DateTime)(healthType.GetProperty("LastFailureTime")?.GetValue(healthValue) ?? DateTime.MinValue),
                                    connectionRecreationCount = (int)(healthType.GetProperty("ConnectionRecreationCount")?.GetValue(healthValue) ?? 0),
                                    acknowledgmentTimeouts = (int)(healthType.GetProperty("AcknowledgmentTimeouts")?.GetValue(healthValue) ?? 0),
                                    publishFailures = (int)(healthType.GetProperty("PublishFailures")?.GetValue(healthValue) ?? 0),
                                    topicLatencies = healthType.GetProperty("TopicLatencies")?.GetValue(healthValue) ?? new Dictionary<string, object>()
                                };
                            }
                        }

                        allStreams.Add(new
                        {
                            streamKey = streamType.GetProperty("StreamKey")?.GetValue(stream)?.ToString() ?? "unknown",
                            protocol = streamType.GetProperty("Protocol")?.GetValue(stream)?.ToString() ?? "MQTT",
                            deviceName = streamType.GetProperty("DeviceName")?.GetValue(stream)?.ToString() ?? "Unknown Device",
                            screenName = streamType.GetProperty("ScreenName")?.GetValue(stream)?.ToString() ?? "Unknown Screen",
                            status = streamType.GetProperty("Status")?.GetValue(stream)?.ToString() ?? "Unknown",
                            sensorsCount = (int)(streamType.GetProperty("SensorsCount")?.GetValue(stream) ?? 0),
                            rate = (int)(streamType.GetProperty("Rate")?.GetValue(stream) ?? 0),
                            latency = (long)(streamType.GetProperty("Latency")?.GetValue(stream) ?? 0),
                            lastSentTime = (DateTime)(streamType.GetProperty("LastSentTime")?.GetValue(stream) ?? DateTime.MinValue),
                            configPayloadPrefixes = streamType.GetProperty("ConfigPayloadPrefixes")?.GetValue(stream) ?? new string[] { "", "" },
                            configPayloadsJson = streamType.GetProperty("ConfigPayloadsJson")?.GetValue(stream) ?? new string[] { "{}", "{}" },
                            lastSentPayloadPrefix = streamType.GetProperty("LastSentPayloadPrefix")?.GetValue(stream)?.ToString() ?? "",
                            lastSentPayloadJson = streamType.GetProperty("LastSentPayloadJson")?.GetValue(stream)?.ToString() ?? "{}",
                            compressedConfigPayloadPrefix = streamType.GetProperty("CompressedConfigPayloadPrefix")?.GetValue(stream)?.ToString() ?? "",
                            compressedLastSentPayloadPrefix = streamType.GetProperty("CompressedLastSentPayloadPrefix")?.GetValue(stream)?.ToString() ?? "",
                            configPayloadCompressed = streamType.GetProperty("ConfigPayloadCompressed")?.GetValue(stream)?.ToString() ?? "",
                            lastSentPayloadCompressed = streamType.GetProperty("LastSentPayloadCompressed")?.GetValue(stream)?.ToString() ?? "",
                            health = healthData
                        });
                    }
                }

                // Collect COM streams with proper properties
                if (comStreamManager != null)
                {
                    var comStreams = comStreamManager.GetActiveStreams();
                    foreach (var stream in comStreams)
                    {
                        var streamType = stream.GetType();

                        var healthProperty = streamType.GetProperty("Health");
                        object healthData = null;

                        if (healthProperty != null)
                        {
                            var healthValue = healthProperty.GetValue(stream);
                            if (healthValue != null)
                            {
                                var healthType = healthValue.GetType();
                                healthData = new
                                {
                                    connectionState = healthType.GetProperty("ConnectionState")?.GetValue(healthValue)?.ToString() ?? "unknown",
                                    successRate = (double)(healthType.GetProperty("SuccessRate")?.GetValue(healthValue) ?? 0.0),
                                    lastErrorMessage = healthType.GetProperty("LastErrorMessage")?.GetValue(healthValue)?.ToString() ?? "",
                                    errorType = healthType.GetProperty("ErrorType")?.GetValue(healthValue)?.ToString() ?? "",
                                    consecutiveFailures = (int)(healthType.GetProperty("ConsecutiveFailures")?.GetValue(healthValue) ?? 0),
                                    consecutiveSuccesses = (int)(healthType.GetProperty("ConsecutiveSuccesses")?.GetValue(healthValue) ?? 0),
                                    averageLatency = (double)(healthType.GetProperty("AverageLatency")?.GetValue(healthValue) ?? 0.0),
                                    maxLatency = (long)(healthType.GetProperty("MaxLatency")?.GetValue(healthValue) ?? 0),
                                    minLatency = (long)(healthType.GetProperty("MinLatency")?.GetValue(healthValue) ?? 0),
                                    lastSuccessTime = (DateTime)(healthType.GetProperty("LastSuccessTime")?.GetValue(healthValue) ?? DateTime.MinValue),
                                    lastFailureTime = (DateTime)(healthType.GetProperty("LastFailureTime")?.GetValue(healthValue) ?? DateTime.MinValue),
                                    poolRecreationCount = (int)(healthType.GetProperty("PoolRecreationCount")?.GetValue(healthValue) ?? 0)
                                };
                            }
                        }

                        allStreams.Add(new
                        {
                            streamKey = streamType.GetProperty("StreamKey")?.GetValue(stream)?.ToString() ?? "unknown",
                            protocol = streamType.GetProperty("Protocol")?.GetValue(stream)?.ToString() ?? "COM",
                            deviceName = streamType.GetProperty("DeviceName")?.GetValue(stream)?.ToString() ?? "Unknown Device",
                            screenName = streamType.GetProperty("ScreenName")?.GetValue(stream)?.ToString() ?? "Unknown Screen",
                            status = streamType.GetProperty("Status")?.GetValue(stream)?.ToString() ?? "Unknown",
                            sensorsCount = (int)(streamType.GetProperty("SensorsCount")?.GetValue(stream) ?? 0),
                            rate = (int)(streamType.GetProperty("Rate")?.GetValue(stream) ?? 0),
                            latency = (long)(streamType.GetProperty("Latency")?.GetValue(stream) ?? 0),
                            lastSentTime = (DateTime)(streamType.GetProperty("LastSentTime")?.GetValue(stream) ?? DateTime.MinValue),
                            configPayloadPrefix = streamType.GetProperty("ConfigPayloadPrefix")?.GetValue(stream)?.ToString() ?? "",
                            configPayloadJson = streamType.GetProperty("ConfigPayloadJson")?.GetValue(stream)?.ToString() ?? "{}",
                            lastSentPayloadPrefix = streamType.GetProperty("LastSentPayloadPrefix")?.GetValue(stream)?.ToString() ?? "",
                            lastSentPayloadJson = streamType.GetProperty("LastSentPayloadJson")?.GetValue(stream)?.ToString() ?? "{}",
                            compressedConfigPayloadPrefix = streamType.GetProperty("CompressedConfigPayloadPrefix")?.GetValue(stream)?.ToString() ?? "",
                            compressedLastSentPayloadPrefix = streamType.GetProperty("CompressedLastSentPayloadPrefix")?.GetValue(stream)?.ToString() ?? "",
                            configPayloadCompressed = streamType.GetProperty("ConfigPayloadCompressed")?.GetValue(stream)?.ToString() ?? "",
                            lastSentPayloadCompressed = streamType.GetProperty("LastSentPayloadCompressed")?.GetValue(stream)?.ToString() ?? "",
                            health = healthData
                        });
                    }
                }

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
                Console.WriteLine($"[Dashboard WebSocket] Error sending stream data: {ex.Message}");
            }
        }

        // Broadcast collector data to all connections
        private async Task BroadcastCollectorDataAsync()
        {
            foreach (var connection in _connections.Keys.ToList())
            {
                await SendCollectorDataAsync(connection);
            }
        }

        // Broadcast stream data to all connections
        private async Task BroadcastStreamDataAsync()
        {
            foreach (var connection in _connections.Keys.ToList())
            {
                await SendStreamDataAsync(connection);
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
                var messageJson = JsonSerializer.Serialize(message);
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
                Console.WriteLine($"[Dashboard WebSocket] Error sending to {connectionId}: {ex.Message}");
                return false;
            }
        }

        // Get connected dashboard clients
        public IEnumerable<object> GetConnectedClients()
        {
            return _connections.Values.Select(conn => new
            {
                ConnectionId = conn.ConnectionId,
                ConnectedAt = conn.ConnectedAt,
                LastMessageAt = conn.LastMessageAt,
                ClientInfo = conn.ClientInfo,
                IsConnected = conn.WebSocket?.State == WebSocketState.Open
            });
        }

        // Close all connections
        public async Task CloseAllConnectionsAsync(string reason = "Service shutdown")
        {
            var tasks = _connections.Values.Select(conn => CloseConnectionAsync(conn, reason)).ToArray();
            await Task.WhenAll(tasks);
            _connections.Clear();
        }

        private async Task CloseConnectionAsync(DashboardWebSocketConnection connection, string reason)
        {
            if (connection.IsClosing || connection.WebSocket?.State != WebSocketState.Open)
                return;

            connection.IsClosing = true;
            try
            {
                connection.CancellationToken.Cancel();
                await connection.WebSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, reason, CancellationToken.None);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Dashboard WebSocket] Error closing connection: {ex.Message}");
            }
            finally
            {
                connection.CancellationToken.Dispose();
            }
        }
    }
}