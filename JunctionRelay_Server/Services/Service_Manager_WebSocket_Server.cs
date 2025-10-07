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

        public Service_Manager_WebSocket_Server(
            IServiceScopeFactory scopeFactory,
            Service_Manager_Polling pollingManager,
            Service_Manager_Connections connectionManager)
        {
            _scopeFactory = scopeFactory;
            _pollingManager = pollingManager;
            _connectionManager = connectionManager;

            Console.WriteLine("[WebSocket Server] Service initialized with sensor cache support");

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
            while (true)
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

                    await Task.Delay(100); // Keep 100ms for dashboard updates
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[WebSocket Server] Error in polling loop: {ex.Message}");
                    await Task.Delay(1000);
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
                var virtualStreamManager = scope.ServiceProvider.GetService<Service_Stream_Manager_Virtual>(); // <-- NEW

                var allStreams = new List<object>();

                // ---------------- HTTP ----------------
                if (httpStreamManager != null)
                {
                    var httpStreams = httpStreamManager.GetActiveStreams();
                    foreach (var stream in httpStreams)
                    {
                        var streamType = stream.GetType();
                        var healthProperty = streamType.GetProperty("Health");
                        object? healthData = null;

                        if (healthProperty != null)
                        {
                            var hv = healthProperty.GetValue(stream);
                            if (hv != null)
                            {
                                var ht = hv.GetType();
                                healthData = new
                                {
                                    connectionState = ht.GetProperty("ConnectionState")?.GetValue(hv)?.ToString() ?? "unknown",
                                    successRate = (double)(ht.GetProperty("SuccessRate")?.GetValue(hv) ?? 0.0),
                                    lastErrorMessage = ht.GetProperty("LastErrorMessage")?.GetValue(hv)?.ToString() ?? "",
                                    errorType = ht.GetProperty("ErrorType")?.GetValue(hv)?.ToString() ?? "",
                                    consecutiveFailures = (int)(ht.GetProperty("ConsecutiveFailures")?.GetValue(hv) ?? 0),
                                    consecutiveSuccesses = (int)(ht.GetProperty("ConsecutiveSuccesses")?.GetValue(hv) ?? 0),
                                    keepAlivePoolRecreated = (bool)(ht.GetProperty("KeepAlivePoolRecreated")?.GetValue(hv) ?? false),
                                    httpStatusCode = (int)(ht.GetProperty("HttpStatusCode")?.GetValue(hv) ?? 200),
                                    averageLatency = (double)(ht.GetProperty("AverageLatency")?.GetValue(hv) ?? 0.0),
                                    maxLatency = (long)(ht.GetProperty("MaxLatency")?.GetValue(hv) ?? 0),
                                    minLatency = (long)(ht.GetProperty("MinLatency")?.GetValue(hv) ?? 0),
                                    lastSuccessTime = (DateTime)(ht.GetProperty("LastSuccessTime")?.GetValue(hv) ?? DateTime.MinValue),
                                    lastFailureTime = (DateTime)(ht.GetProperty("LastFailureTime")?.GetValue(hv) ?? DateTime.MinValue),
                                    poolRecreationCount = (int)(ht.GetProperty("PoolRecreationCount")?.GetValue(hv) ?? 0),

                                    // shape parity
                                    isFrameMode = false,
                                    payloadType = "JSON"
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
                            hasLastFrame = streamType.GetProperty("LastFrameTime")?.GetValue(stream) != null,
                            lastFrameSize = ConvertToNullableInt(streamType.GetProperty("LastFrameSize")?.GetValue(stream)),
                            lastFrameTime = (DateTime?)(streamType.GetProperty("LastFrameTime")?.GetValue(stream)),
                            lastFrameLayoutType = streamType.GetProperty("LastFrameLayoutType")?.GetValue(stream)?.ToString() ?? "",
                            health = healthData
                        });
                    }
                }

                // ---------------- MQTT ----------------
                if (mqttStreamManager != null)
                {
                    var mqttStreams = mqttStreamManager.GetActiveStreams();
                    foreach (var stream in mqttStreams)
                    {
                        var streamType = stream.GetType();
                        var healthProperty = streamType.GetProperty("Health");
                        object? healthData = null;

                        if (healthProperty != null)
                        {
                            var hv = healthProperty.GetValue(stream);
                            if (hv != null)
                            {
                                var ht = hv.GetType();
                                healthData = new
                                {
                                    connectionState = ht.GetProperty("ConnectionState")?.GetValue(hv)?.ToString() ?? "unknown",
                                    successRate = (double)(ht.GetProperty("SuccessRate")?.GetValue(hv) ?? 0.0),
                                    lastErrorMessage = ht.GetProperty("LastErrorMessage")?.GetValue(hv)?.ToString() ?? "",
                                    errorType = ht.GetProperty("ErrorType")?.GetValue(hv)?.ToString() ?? "",
                                    consecutiveFailures = (int)(ht.GetProperty("ConsecutiveFailures")?.GetValue(hv) ?? 0),
                                    consecutiveSuccesses = (int)(ht.GetProperty("ConsecutiveSuccesses")?.GetValue(hv) ?? 0),
                                    connectionRecreated = (bool)(ht.GetProperty("ConnectionRecreated")?.GetValue(hv) ?? false),
                                    averageLatency = (double)(ht.GetProperty("AverageLatency")?.GetValue(hv) ?? 0.0),
                                    maxLatency = (long)(ht.GetProperty("MaxLatency")?.GetValue(hv) ?? 0),
                                    minLatency = (long)(ht.GetProperty("MinLatency")?.GetValue(hv) ?? 0),
                                    lastSuccessTime = (DateTime)(ht.GetProperty("LastSuccessTime")?.GetValue(hv) ?? DateTime.MinValue),
                                    lastFailureTime = (DateTime)(ht.GetProperty("LastFailureTime")?.GetValue(hv) ?? DateTime.MinValue),
                                    connectionRecreationCount = (int)(ht.GetProperty("ConnectionRecreationCount")?.GetValue(hv) ?? 0),
                                    acknowledgmentTimeouts = (int)(ht.GetProperty("AcknowledgmentTimeouts")?.GetValue(hv) ?? 0),
                                    publishFailures = (int)(ht.GetProperty("PublishFailures")?.GetValue(hv) ?? 0),
                                    topicLatencies = ht.GetProperty("TopicLatencies")?.GetValue(hv) ?? new Dictionary<string, object>(),

                                    // shape parity
                                    isFrameMode = false,
                                    payloadType = "JSON"
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
                            hasLastFrame = streamType.GetProperty("LastFrameTime")?.GetValue(stream) != null,
                            lastFrameSize = ConvertToNullableInt(streamType.GetProperty("LastFrameSize")?.GetValue(stream)),
                            lastFrameTime = (DateTime?)(streamType.GetProperty("LastFrameTime")?.GetValue(stream)),
                            lastFrameLayoutType = streamType.GetProperty("LastFrameLayoutType")?.GetValue(stream)?.ToString() ?? "",
                            health = healthData
                        });
                    }
                }

                // ---------------- COM ----------------
                if (comStreamManager != null)
                {
                    var comStreams = comStreamManager.GetActiveStreams();
                    foreach (var stream in comStreams)
                    {
                        var streamType = stream.GetType();
                        var healthProperty = streamType.GetProperty("Health");
                        object? healthData = null;

                        if (healthProperty != null)
                        {
                            var hv = healthProperty.GetValue(stream);
                            if (hv != null)
                            {
                                var ht = hv.GetType();
                                healthData = new
                                {
                                    connectionState = ht.GetProperty("ConnectionState")?.GetValue(hv)?.ToString() ?? "unknown",
                                    successRate = (double)(ht.GetProperty("SuccessRate")?.GetValue(hv) ?? 0.0),
                                    lastErrorMessage = ht.GetProperty("LastErrorMessage")?.GetValue(hv)?.ToString() ?? "",
                                    errorType = ht.GetProperty("ErrorType")?.GetValue(hv)?.ToString() ?? "",
                                    consecutiveFailures = (int)(ht.GetProperty("ConsecutiveFailures")?.GetValue(hv) ?? 0),
                                    consecutiveSuccesses = (int)(ht.GetProperty("ConsecutiveSuccesses")?.GetValue(hv) ?? 0),
                                    averageLatency = (double)(ht.GetProperty("AverageLatency")?.GetValue(hv) ?? 0.0),
                                    maxLatency = (long)(ht.GetProperty("MaxLatency")?.GetValue(hv) ?? 0),
                                    minLatency = (long)(ht.GetProperty("MinLatency")?.GetValue(hv) ?? 0),
                                    lastSuccessTime = (DateTime)(ht.GetProperty("LastSuccessTime")?.GetValue(hv) ?? DateTime.MinValue),
                                    lastFailureTime = (DateTime)(ht.GetProperty("LastFailureTime")?.GetValue(hv) ?? DateTime.MinValue),
                                    poolRecreationCount = (int)(ht.GetProperty("PoolRecreationCount")?.GetValue(hv) ?? 0),

                                    // shape parity
                                    isFrameMode = false,
                                    payloadType = "JSON"
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
                            hasLastFrame = streamType.GetProperty("LastFrameTime")?.GetValue(stream) != null,
                            lastFrameSize = ConvertToNullableInt(streamType.GetProperty("LastFrameSize")?.GetValue(stream)),
                            lastFrameTime = (DateTime?)(streamType.GetProperty("LastFrameTime")?.GetValue(stream)),
                            lastFrameLayoutType = streamType.GetProperty("LastFrameLayoutType")?.GetValue(stream)?.ToString() ?? "",
                            health = healthData
                        });
                    }
                }

                // ---------------- WebSocket ----------------
                if (webSocketStreamManager != null)
                {
                    var wsStreams = webSocketStreamManager.GetActiveStreams();
                    foreach (var stream in wsStreams)
                    {
                        var streamType = stream.GetType();
                        var healthProperty = streamType.GetProperty("Health");
                        object? healthData = null;

                        if (healthProperty != null)
                        {
                            var hv = healthProperty.GetValue(stream);
                            if (hv != null)
                            {
                                var ht = hv.GetType();
                                healthData = new
                                {
                                    connectionState = ht.GetProperty("ConnectionState")?.GetValue(hv)?.ToString() ?? "unknown",
                                    successRate = (double)(ht.GetProperty("SuccessRate")?.GetValue(hv) ?? 0.0),
                                    lastErrorMessage = ht.GetProperty("LastErrorMessage")?.GetValue(hv)?.ToString() ?? "",
                                    errorType = ht.GetProperty("ErrorType")?.GetValue(hv)?.ToString() ?? "",
                                    consecutiveFailures = (int)(ht.GetProperty("ConsecutiveFailures")?.GetValue(hv) ?? 0),
                                    consecutiveSuccesses = (int)(ht.GetProperty("ConsecutiveSuccesses")?.GetValue(hv) ?? 0),
                                    connectionRecreated = (bool)(ht.GetProperty("ConnectionRecreated")?.GetValue(hv) ?? false),
                                    lastWebSocketState = ht.GetProperty("LastWebSocketState")?.GetValue(hv)?.ToString() ?? "",
                                    connectionRecreationCount = (int)(ht.GetProperty("ConnectionRecreationCount")?.GetValue(hv) ?? 0),
                                    averageLatency = (double)(ht.GetProperty("AverageLatency")?.GetValue(hv) ?? 0.0),
                                    maxLatency = (long)(ht.GetProperty("MaxLatency")?.GetValue(hv) ?? 0),
                                    minLatency = (long)(ht.GetProperty("MinLatency")?.GetValue(hv) ?? 0),
                                    lastSuccessTime = (DateTime)(ht.GetProperty("LastSuccessTime")?.GetValue(hv) ?? DateTime.MinValue),
                                    lastFailureTime = (DateTime)(ht.GetProperty("LastFailureTime")?.GetValue(hv) ?? DateTime.MinValue),

                                    // frame / gateway
                                    isFrameMode = (bool)(ht.GetProperty("IsFrameMode")?.GetValue(hv) ?? false),
                                    payloadType = ht.GetProperty("PayloadType")?.GetValue(hv)?.ToString() ?? "JSON",
                                    framesSent = (int)(ht.GetProperty("FramesSent")?.GetValue(hv) ?? 0),
                                    payloadsSent = (int)(ht.GetProperty("PayloadsSent")?.GetValue(hv) ?? 0),
                                    currentFrameLayoutType = ht.GetProperty("CurrentFrameLayoutType")?.GetValue(hv)?.ToString() ?? "",
                                    averageFrameSize = (double)(ht.GetProperty("AverageFrameSize")?.GetValue(hv) ?? 0.0),
                                    maxFrameSize = (long)(ht.GetProperty("MaxFrameSize")?.GetValue(hv) ?? 0),
                                    minFrameSize = (long)(ht.GetProperty("MinFrameSize")?.GetValue(hv) ?? 0),
                                    averageFrameRenderTime = (double)(ht.GetProperty("AverageFrameRenderTime")?.GetValue(hv) ?? 0.0),
                                    maxFrameRenderTime = (long)(ht.GetProperty("MaxFrameRenderTime")?.GetValue(hv) ?? 0),
                                    minFrameRenderTime = (long)(ht.GetProperty("MinFrameRenderTime")?.GetValue(hv) ?? 0),
                                    isGatewayMode = (bool)(ht.GetProperty("IsGatewayMode")?.GetValue(hv) ?? false),
                                    gatewayTarget = ht.GetProperty("GatewayTarget")?.GetValue(hv)?.ToString() ?? "",
                                    gatewayMessagesSent = (int)(ht.GetProperty("GatewayMessagesSent")?.GetValue(hv) ?? 0)
                                };
                            }
                        }

                        allStreams.Add(new
                        {
                            streamKey = streamType.GetProperty("StreamKey")?.GetValue(stream)?.ToString() ?? "unknown",
                            protocol = streamType.GetProperty("Protocol")?.GetValue(stream)?.ToString() ?? "WebSocket",
                            deviceName = streamType.GetProperty("DeviceName")?.GetValue(stream)?.ToString() ?? "Unknown Device",
                            deviceMac = streamType.GetProperty("DeviceMac")?.GetValue(stream)?.ToString() ?? "Unknown",
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
                            hasLastFrame = streamType.GetProperty("LastFrameGeneratedTime")?.GetValue(stream) != null,
                            lastFrameSize = ConvertToNullableInt(streamType.GetProperty("LastFrameSize")?.GetValue(stream)),
                            lastFrameTime = (DateTime?)(streamType.GetProperty("LastFrameGeneratedTime")?.GetValue(stream)),
                            lastFrameLayoutType = streamType.GetProperty("LastFrameLayoutType")?.GetValue(stream)?.ToString() ?? "",
                            isGatewayMode = (bool)(streamType.GetProperty("IsGatewayMode")?.GetValue(stream) ?? false),
                            gatewayTarget = streamType.GetProperty("GatewayTarget")?.GetValue(stream)?.ToString() ?? "",
                            compressionEnabled = (bool)(streamType.GetProperty("CompressionEnabled")?.GetValue(stream) ?? false),
                            health = healthData
                        });
                    }
                }

                // ---------------- VIRTUAL (NEW) ----------------
                if (virtualStreamManager != null)
                {
                    var virtualStreams = virtualStreamManager.GetActiveStreams();
                    foreach (var stream in virtualStreams)
                    {
                        var streamType = stream.GetType();
                        var healthProperty = streamType.GetProperty("Health");
                        object? healthData = null;

                        if (healthProperty != null)
                        {
                            var hv = healthProperty.GetValue(stream);
                            if (hv != null)
                            {
                                var ht = hv.GetType();
                                healthData = new
                                {
                                    connectionState = ht.GetProperty("ConnectionState")?.GetValue(hv)?.ToString() ?? "unknown",
                                    successRate = (double)(ht.GetProperty("SuccessRate")?.GetValue(hv) ?? 0.0),
                                    lastErrorMessage = ht.GetProperty("LastErrorMessage")?.GetValue(hv)?.ToString() ?? "",
                                    errorType = ht.GetProperty("ErrorType")?.GetValue(hv)?.ToString() ?? "",
                                    consecutiveFailures = (int)(ht.GetProperty("ConsecutiveFailures")?.GetValue(hv) ?? 0),
                                    consecutiveSuccesses = (int)(ht.GetProperty("ConsecutiveSuccesses")?.GetValue(hv) ?? 0),
                                    averageLatency = (double)(ht.GetProperty("AverageLatency")?.GetValue(hv) ?? 0.0),
                                    maxLatency = (long)(ht.GetProperty("MaxLatency")?.GetValue(hv) ?? 0),
                                    minLatency = (long)(ht.GetProperty("MinLatency")?.GetValue(hv) ?? 0),
                                    lastSuccessTime = (DateTime)(ht.GetProperty("LastSuccessTime")?.GetValue(hv) ?? DateTime.MinValue),
                                    lastFailureTime = (DateTime)(ht.GetProperty("LastFailureTime")?.GetValue(hv) ?? DateTime.MinValue),

                                    // keep parity with WS health shape
                                    connectionRecreated = false,
                                    lastWebSocketState = (string?)null,
                                    connectionRecreationCount = 0,

                                    // frame/payload counters if your StreamHealth has them;
                                    // default sensibly when absent
                                    isFrameMode = (bool)(ht.GetProperty("IsFrameMode")?.GetValue(hv) ?? false),
                                    payloadType = ht.GetProperty("PayloadType")?.GetValue(hv)?.ToString() ?? "JSON",
                                    framesSent = (int)(ht.GetProperty("FramesSent")?.GetValue(hv) ?? 0),
                                    payloadsSent = (int)(ht.GetProperty("PayloadsSent")?.GetValue(hv) ?? 0),
                                    currentFrameLayoutType = ht.GetProperty("CurrentFrameLayoutType")?.GetValue(hv)?.ToString() ?? "",
                                    averageFrameSize = (double)(ht.GetProperty("AverageFrameSize")?.GetValue(hv) ?? 0.0),
                                    maxFrameSize = (long)(ht.GetProperty("MaxFrameSize")?.GetValue(hv) ?? 0),
                                    minFrameSize = (long)(ht.GetProperty("MinFrameSize")?.GetValue(hv) ?? 0),
                                    averageFrameRenderTime = (double)(ht.GetProperty("AverageFrameRenderTime")?.GetValue(hv) ?? 0.0),
                                    maxFrameRenderTime = (long)(ht.GetProperty("MaxFrameRenderTime")?.GetValue(hv) ?? 0),
                                    minFrameRenderTime = (long)(ht.GetProperty("MinFrameRenderTime")?.GetValue(hv) ?? 0),

                                    isGatewayMode = false,
                                    gatewayTarget = "Unknown",
                                    gatewayMessagesSent = 0
                                };
                            }
                        }

                        allStreams.Add(new
                        {
                            streamKey = streamType.GetProperty("StreamKey")?.GetValue(stream)?.ToString()
                                        ?? streamType.GetProperty("ScreenId")?.GetValue(stream)?.ToString()
                                        ?? "virtual",
                            protocol = streamType.GetProperty("Protocol")?.GetValue(stream)?.ToString() ?? "Virtual",
                            deviceName = streamType.GetProperty("DeviceName")?.GetValue(stream)?.ToString() ?? "Virtual Device",
                            deviceMac = "Unknown",
                            screenName = streamType.GetProperty("ScreenName")?.GetValue(stream)?.ToString() ?? "Unknown Screen",
                            status = streamType.GetProperty("Status")?.GetValue(stream)?.ToString() ?? "Unknown",
                            sensorsCount = (int)(streamType.GetProperty("SensorsCount")?.GetValue(stream) ?? 0),
                            rate = (int)(streamType.GetProperty("Rate")?.GetValue(stream) ?? 0),
                            latency = (long)(streamType.GetProperty("Latency")?.GetValue(stream) ?? 0),
                            lastSentTime = (DateTime)(streamType.GetProperty("LastGeneratedTime")?.GetValue(stream) ?? DateTime.MinValue),

                            // payloads (Virtual keeps the same names but "LastGeneratedPayloadJson")
                            configPayloadPrefix = streamType.GetProperty("ConfigPayloadPrefix")?.GetValue(stream)?.ToString() ?? "",
                            configPayloadJson = streamType.GetProperty("ConfigPayloadJson")?.GetValue(stream)?.ToString() ?? "{}",
                            lastSentPayloadPrefix = streamType.GetProperty("LastSentPayloadPrefix")?.GetValue(stream)?.ToString() ?? "",
                            lastSentPayloadJson =
                                streamType.GetProperty("LastGeneratedPayloadJson")?.GetValue(stream)?.ToString()
                                ?? streamType.GetProperty("LastSentPayloadJson")?.GetValue(stream)?.ToString()
                                ?? "{}",

                            // compression (may be empty for virtual)
                            compressedConfigPayloadPrefix = streamType.GetProperty("CompressedConfigPayloadPrefix")?.GetValue(stream)?.ToString() ?? "",
                            compressedLastSentPayloadPrefix = streamType.GetProperty("CompressedLastSentPayloadPrefix")?.GetValue(stream)?.ToString() ?? "",
                            configPayloadCompressed = streamType.GetProperty("ConfigPayloadCompressed")?.GetValue(stream)?.ToString() ?? "",
                            lastSentPayloadCompressed = streamType.GetProperty("LastSentPayloadCompressed")?.GetValue(stream)?.ToString() ?? "",

                            // frame parity
                            hasLastFrame = streamType.GetProperty("LastFrameGeneratedTime")?.GetValue(stream) != null,
                            lastFrameSize = ConvertToNullableInt(streamType.GetProperty("LastFrameSize")?.GetValue(stream)),
                            lastFrameTime = (DateTime?)(streamType.GetProperty("LastFrameGeneratedTime")?.GetValue(stream)),
                            lastFrameLayoutType = streamType.GetProperty("LastFrameLayoutType")?.GetValue(stream)?.ToString() ?? "",

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
            var tasks = _connections.Values.Select(conn => CloseConnectionAsync(conn, reason)).ToArray();
            await Task.WhenAll(tasks);
            _connections.Clear();
            _sensorCache.Clear();
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
                Console.WriteLine($"[WebSocket Server] Error closing connection: {ex.Message}");
            }
            finally
            {
                connection.CancellationToken.Dispose();
            }
        }
    }
}