/*
 * Debug WebSocket Service Manager with Console Output
 */

using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_WebSocket_Devices
    {
        private readonly IServiceScopeFactory _scopeFactory;

        // Track active WebSocket connections by device MAC address
        private readonly ConcurrentDictionary<string, DeviceWebSocketConnection> _connections = new();

        // Track connection statistics
        private readonly ConcurrentDictionary<string, DeviceConnectionStats> _connectionStats = new();

        public Service_Manager_WebSocket_Devices(IServiceScopeFactory scopeFactory)
        {
            _scopeFactory = scopeFactory;
            Console.WriteLine("[WebSocket Service] Service_Manager_WebSocket_Devices created");
        }

        // Container for WebSocket connection and metadata
        private class DeviceWebSocketConnection
        {
            public WebSocket WebSocket { get; set; }
            public string DeviceMac { get; set; } = string.Empty;
            public string DeviceName { get; set; } = string.Empty;
            public DateTime ConnectedAt { get; set; } = DateTime.UtcNow;
            public DateTime LastMessageAt { get; set; } = DateTime.UtcNow;
            public CancellationTokenSource CancellationToken { get; set; } = new();
            public Task? MessageLoopTask { get; set; }
            public string ConnectionType { get; set; } = "WiFi";
            public string IpAddress { get; set; } = string.Empty;
            public bool IsClosing { get; set; } = false;

            // Device registration info
            public string? FirmwareVersion { get; set; }
            public string? DeviceModel { get; set; }
            public string? ChipModel { get; set; }
            public int? CpuFreqMHz { get; set; }
            public long? FlashSize { get; set; }
            public List<string> Capabilities { get; set; } = new();
            public List<string> SupportedProtocols { get; set; } = new();
            public bool IsRegistered { get; set; } = false;
        }

        // Statistics tracking for each device
        private class DeviceConnectionStats
        {
            public int MessagesReceived { get; set; }
            public int MessagesSent { get; set; }
            public int ReconnectionCount { get; set; }
            public DateTime LastHealthReport { get; set; }
            public DateTime FirstConnected { get; set; } = DateTime.UtcNow;
            public TimeSpan TotalConnectedTime { get; set; }
            public List<string> RecentErrors { get; set; } = new();
            public DateTime LastRegistration { get; set; }
        }

        // Handle new WebSocket connection from device and WAIT for it to end
        public async Task HandleDeviceConnectionAndWaitAsync(WebSocket webSocket, string deviceMac, string? deviceName = null, string? ipAddress = null)
        {
            Console.WriteLine($"[WebSocket Service] HandleDeviceConnectionAndWaitAsync called for {deviceMac}");

            try
            {
                if (string.IsNullOrWhiteSpace(deviceMac) || !IsValidMacAddress(deviceMac))
                {
                    Console.WriteLine($"[WebSocket Service] Invalid MAC address: {deviceMac}");
                    return;
                }

                Console.WriteLine($"[WebSocket Service] WebSocket state: {webSocket.State}");

                // Close existing connection if device reconnects
                if (_connections.TryGetValue(deviceMac, out var existingConnection))
                {
                    Console.WriteLine($"[WebSocket Service] Closing existing connection for {deviceMac}");
                    await CloseConnectionAsync(deviceMac, "Device reconnecting");

                    // Update reconnection stats
                    if (_connectionStats.TryGetValue(deviceMac, out var stats))
                    {
                        stats.ReconnectionCount++;
                    }
                }

                // Use provided device name or generate one
                if (string.IsNullOrEmpty(deviceName))
                {
                    deviceName = $"Device_{deviceMac.Substring(12)}";
                }

                Console.WriteLine($"[WebSocket Service] Creating connection for {deviceName} ({deviceMac})");

                // Create new connection
                var connection = new DeviceWebSocketConnection
                {
                    WebSocket = webSocket,
                    DeviceMac = deviceMac,
                    DeviceName = deviceName,
                    IpAddress = ipAddress ?? "Unknown",
                    ConnectedAt = DateTime.UtcNow,
                    LastMessageAt = DateTime.UtcNow
                };

                // Initialize or update statistics
                if (!_connectionStats.ContainsKey(deviceMac))
                {
                    _connectionStats[deviceMac] = new DeviceConnectionStats();
                }

                // Store connection
                _connections[deviceMac] = connection;
                Console.WriteLine($"[WebSocket Service] Connection stored for {deviceMac}");

                // Send initial welcome message
                Console.WriteLine($"[WebSocket Service] Sending welcome message to {deviceMac}");
                await SendWelcomeMessageAsync(deviceMac);

                // IMPORTANT: Handle messages directly in this method - don't use background task
                Console.WriteLine($"[WebSocket Service] Starting message handling for {deviceMac}");
                await HandleDeviceMessagesAsync(connection);

                Console.WriteLine($"[WebSocket Service] Message handling completed for {deviceMac}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Service] Error in HandleDeviceConnectionAndWaitAsync for {deviceMac}: {ex.Message}");
                Console.WriteLine($"[WebSocket Service] Stack trace: {ex.StackTrace}");
            }
        }

        // Handle new WebSocket connection from device (legacy method for compatibility)
        public async Task<bool> HandleDeviceConnectionAsync(WebSocket webSocket, string deviceMac, string? deviceName = null, string? ipAddress = null)
        {
            Console.WriteLine($"[WebSocket Service] HandleDeviceConnectionAsync called for {deviceMac}");

            try
            {
                if (string.IsNullOrWhiteSpace(deviceMac) || !IsValidMacAddress(deviceMac))
                {
                    Console.WriteLine($"[WebSocket Service] Invalid MAC address: {deviceMac}");
                    return false;
                }

                Console.WriteLine($"[WebSocket Service] WebSocket state: {webSocket.State}");

                // Close existing connection if device reconnects
                if (_connections.TryGetValue(deviceMac, out var existingConnection))
                {
                    Console.WriteLine($"[WebSocket Service] Closing existing connection for {deviceMac}");
                    await CloseConnectionAsync(deviceMac, "Device reconnecting");

                    // Update reconnection stats
                    if (_connectionStats.TryGetValue(deviceMac, out var stats))
                    {
                        stats.ReconnectionCount++;
                    }
                }

                // Use provided device name or generate one
                if (string.IsNullOrEmpty(deviceName))
                {
                    deviceName = $"Device_{deviceMac.Substring(12)}";
                }

                Console.WriteLine($"[WebSocket Service] Creating connection for {deviceName} ({deviceMac})");

                // Create new connection
                var connection = new DeviceWebSocketConnection
                {
                    WebSocket = webSocket,
                    DeviceMac = deviceMac,
                    DeviceName = deviceName,
                    IpAddress = ipAddress ?? "Unknown",
                    ConnectedAt = DateTime.UtcNow,
                    LastMessageAt = DateTime.UtcNow
                };

                // Initialize or update statistics
                if (!_connectionStats.ContainsKey(deviceMac))
                {
                    _connectionStats[deviceMac] = new DeviceConnectionStats();
                }

                // Store connection BEFORE starting message loop
                _connections[deviceMac] = connection;
                Console.WriteLine($"[WebSocket Service] Connection stored for {deviceMac}");

                // Send initial welcome message
                Console.WriteLine($"[WebSocket Service] Sending welcome message to {deviceMac}");
                await SendWelcomeMessageAsync(deviceMac);

                // Start message handling loop
                Console.WriteLine($"[WebSocket Service] Starting message loop for {deviceMac}");
                connection.MessageLoopTask = Task.Run(async () => await HandleDeviceMessagesAsync(connection));

                Console.WriteLine($"[WebSocket Service] HandleDeviceConnectionAsync completed successfully for {deviceMac}");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Service] Error in HandleDeviceConnectionAsync for {deviceMac}: {ex.Message}");
                Console.WriteLine($"[WebSocket Service] Stack trace: {ex.StackTrace}");
                return false;
            }
        }

        // Send welcome message to newly connected device
        private async Task SendWelcomeMessageAsync(string deviceMac)
        {
            Console.WriteLine($"[WebSocket Service] SendWelcomeMessageAsync called for {deviceMac}");

            try
            {
                var welcomeMessage = new
                {
                    type = "welcome",
                    timestamp = DateTime.UtcNow,
                    message = "Connected to Junction Relay",
                    serverVersion = "1.0.0"
                };

                Console.WriteLine($"[WebSocket Service] Calling SendMessageToDeviceAsync for welcome message");
                bool result = await SendMessageToDeviceAsync(deviceMac, welcomeMessage);
                Console.WriteLine($"[WebSocket Service] Welcome message send result: {result}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Service] Error sending welcome message to {deviceMac}: {ex.Message}");
            }
        }

        // Main message handling loop for each device
        private async Task HandleDeviceMessagesAsync(DeviceWebSocketConnection connection)
        {
            Console.WriteLine($"[WebSocket Service] Message loop started for {connection.DeviceMac}");

            var buffer = new byte[4096];
            var cancellationToken = connection.CancellationToken.Token;

            try
            {
                while (connection.WebSocket.State == WebSocketState.Open && !cancellationToken.IsCancellationRequested)
                {
                    try
                    {
                        Console.WriteLine($"[WebSocket Service] Waiting for message from {connection.DeviceMac}...");

                        var result = await connection.WebSocket.ReceiveAsync(
                            new ArraySegment<byte>(buffer),
                            cancellationToken);

                        Console.WriteLine($"[WebSocket Service] Received message type: {result.MessageType} from {connection.DeviceMac}");

                        if (result.MessageType == WebSocketMessageType.Close)
                        {
                            Console.WriteLine($"[WebSocket Service] Close message received from {connection.DeviceMac}");
                            break;
                        }

                        if (result.MessageType == WebSocketMessageType.Text)
                        {
                            var messageText = Encoding.UTF8.GetString(buffer, 0, result.Count);
                            Console.WriteLine($"[WebSocket Service] Text message from {connection.DeviceMac}: {messageText}");

                            await ProcessDeviceMessageAsync(connection, messageText);

                            connection.LastMessageAt = DateTime.UtcNow;

                            if (_connectionStats.TryGetValue(connection.DeviceMac, out var stats))
                            {
                                stats.MessagesReceived++;
                            }
                        }
                    }
                    catch (OperationCanceledException)
                    {
                        Console.WriteLine($"[WebSocket Service] Operation cancelled for {connection.DeviceMac}");
                        break;
                    }
                    catch (WebSocketException ex) when (ex.WebSocketErrorCode == WebSocketError.ConnectionClosedPrematurely)
                    {
                        Console.WriteLine($"[WebSocket Service] Connection closed prematurely for {connection.DeviceMac}");
                        break;
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[WebSocket Service] Error in message loop for {connection.DeviceMac}: {ex.Message}");
                        break;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Service] Unexpected error in message loop for {connection.DeviceMac}: {ex.Message}");
                RecordConnectionError(connection.DeviceMac, $"Unexpected error: {ex.Message}");
            }
            finally
            {
                Console.WriteLine($"[WebSocket Service] Message loop ending for {connection.DeviceMac}");
                await CloseConnectionInternalAsync(connection, "Message loop ended");
            }
        }

        // Process incoming message from device
        private async Task ProcessDeviceMessageAsync(DeviceWebSocketConnection connection, string messageText)
        {
            Console.WriteLine($"[WebSocket Service] Processing message from {connection.DeviceMac}");

            try
            {
                // Handle simple heartbeat/ping messages that might not be JSON
                if (messageText.Trim().ToLower() == "ping")
                {
                    Console.WriteLine($"[WebSocket Service] Handling ping from {connection.DeviceMac}");
                    await SendMessageToDeviceAsync(connection.DeviceMac, "pong");
                    return;
                }

                var messageDoc = JsonDocument.Parse(messageText);
                var messageType = messageDoc.RootElement.GetProperty("type").GetString();

                Console.WriteLine($"[WebSocket Service] Message type: {messageType}");

                switch (messageType?.ToLower())
                {
                    case "device-registration":
                        Console.WriteLine($"[WebSocket Service] Processing device registration");
                        await ProcessDeviceRegistrationAsync(connection, messageDoc);
                        break;

                    case "health":
                        await ProcessHealthReportAsync(connection, messageDoc);
                        break;

                    case "espnow-status":
                        await ProcessESPNowStatusAsync(connection, messageDoc);
                        break;

                    case "heartbeat":
                        await ProcessHeartbeatAsync(connection, messageDoc);
                        break;

                    case "config-ack":
                        await ProcessConfigAcknowledgmentAsync(connection, messageDoc);
                        break;

                    case "payload-ack":
                        await ProcessPayloadAcknowledgmentAsync(connection, messageDoc);
                        break;

                    default:
                        Console.WriteLine($"[WebSocket Service] Unknown message type: {messageType}");
                        break;
                }
            }
            catch (JsonException ex)
            {
                Console.WriteLine($"[WebSocket Service] JSON error: {ex.Message}");
                RecordConnectionError(connection.DeviceMac, $"Invalid JSON: {ex.Message}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Service] Error processing message: {ex.Message}");
                RecordConnectionError(connection.DeviceMac, $"Message processing error: {ex.Message}");
            }
        }

        // Process device registration
        private async Task ProcessDeviceRegistrationAsync(DeviceWebSocketConnection connection, JsonDocument messageDoc)
        {
            Console.WriteLine($"[WebSocket Service] Processing device registration for {connection.DeviceMac}");

            try
            {
                if (messageDoc.RootElement.TryGetProperty("data", out var data))
                {
                    // Extract device information
                    if (data.TryGetProperty("deviceName", out var nameElement))
                        connection.DeviceName = nameElement.GetString() ?? connection.DeviceName;

                    if (data.TryGetProperty("firmwareVersion", out var firmwareElement))
                        connection.FirmwareVersion = firmwareElement.GetString();

                    if (data.TryGetProperty("deviceModel", out var modelElement))
                        connection.DeviceModel = modelElement.GetString();

                    if (data.TryGetProperty("chipModel", out var chipElement))
                        connection.ChipModel = chipElement.GetString();

                    if (data.TryGetProperty("cpuFreqMHz", out var cpuElement))
                        connection.CpuFreqMHz = cpuElement.GetInt32();

                    if (data.TryGetProperty("flashSize", out var flashElement))
                        connection.FlashSize = flashElement.GetInt64();

                    // Extract capabilities
                    if (data.TryGetProperty("capabilities", out var capabilitiesElement))
                    {
                        connection.Capabilities = capabilitiesElement.EnumerateArray()
                            .Select(c => c.GetString())
                            .Where(c => c != null)
                            .Cast<string>()
                            .ToList();
                    }

                    // Extract supported protocols
                    if (data.TryGetProperty("supportedProtocols", out var protocolsElement))
                    {
                        connection.SupportedProtocols = protocolsElement.EnumerateArray()
                            .Select(p => p.GetString())
                            .Where(p => p != null)
                            .Cast<string>()
                            .ToList();
                    }

                    Console.WriteLine($"[WebSocket Service] Device {connection.DeviceName} info extracted");
                }

                // Mark as registered
                connection.IsRegistered = true;

                // Update registration stats
                if (_connectionStats.TryGetValue(connection.DeviceMac, out var stats))
                {
                    stats.LastRegistration = DateTime.UtcNow;
                }

                // Send registration acknowledgment
                var response = new
                {
                    type = "device-registration-ack",
                    timestamp = DateTime.UtcNow,
                    status = "registered",
                    message = $"Device {connection.DeviceName} registered successfully"
                };

                Console.WriteLine($"[WebSocket Service] Sending registration ACK");
                await SendMessageToDeviceAsync(connection.DeviceMac, response);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Service] Error in device registration: {ex.Message}");
            }
        }

        // Process health report from device
        private async Task ProcessHealthReportAsync(DeviceWebSocketConnection connection, JsonDocument messageDoc)
        {
            try
            {
                if (_connectionStats.TryGetValue(connection.DeviceMac, out var stats))
                {
                    stats.LastHealthReport = DateTime.UtcNow;
                }

                await SendMessageToDeviceAsync(connection.DeviceMac, new
                {
                    type = "health-ack",
                    timestamp = DateTime.UtcNow,
                    status = "received"
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Service] Error processing health report: {ex.Message}");
            }
        }

        // Process ESP-NOW status from gateway device
        private async Task ProcessESPNowStatusAsync(DeviceWebSocketConnection connection, JsonDocument messageDoc)
        {
            try
            {
                await SendMessageToDeviceAsync(connection.DeviceMac, new
                {
                    type = "espnow-status-ack",
                    timestamp = DateTime.UtcNow,
                    status = "received"
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Service] Error processing ESP-NOW status: {ex.Message}");
            }
        }

        // Process heartbeat from device
        private async Task ProcessHeartbeatAsync(DeviceWebSocketConnection connection, JsonDocument messageDoc)
        {
            try
            {
                var response = new
                {
                    type = "heartbeat-ack",
                    timestamp = DateTime.UtcNow
                };

                await SendMessageToDeviceAsync(connection.DeviceMac, response);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Service] Error processing heartbeat: {ex.Message}");
            }
        }

        // Process configuration acknowledgment
        private async Task ProcessConfigAcknowledgmentAsync(DeviceWebSocketConnection connection, JsonDocument messageDoc)
        {
            // No action needed for config acknowledgments
        }

        // Process payload acknowledgment
        private async Task ProcessPayloadAcknowledgmentAsync(DeviceWebSocketConnection connection, JsonDocument messageDoc)
        {
            // No action needed for payload acknowledgments
        }

        // Send message to specific device
        public async Task<bool> SendMessageToDeviceAsync(string deviceMac, object message)
        {
            Console.WriteLine($"[WebSocket Service] SendMessageToDeviceAsync called for {deviceMac}");

            if (!_connections.TryGetValue(deviceMac, out var connection))
            {
                Console.WriteLine($"[WebSocket Service] Connection not found for {deviceMac}");
                return false;
            }

            if (connection.WebSocket.State != WebSocketState.Open)
            {
                Console.WriteLine($"[WebSocket Service] WebSocket not open for {deviceMac}, state: {connection.WebSocket.State}");
                return false;
            }

            try
            {
                string messageJson;
                if (message is string stringMessage)
                {
                    messageJson = stringMessage;
                }
                else
                {
                    messageJson = JsonSerializer.Serialize(message);
                }

                Console.WriteLine($"[WebSocket Service] Sending to {deviceMac}: {messageJson}");

                var messageBytes = Encoding.UTF8.GetBytes(messageJson);

                await connection.WebSocket.SendAsync(
                    new ArraySegment<byte>(messageBytes),
                    WebSocketMessageType.Text,
                    true,
                    connection.CancellationToken.Token);

                if (_connectionStats.TryGetValue(deviceMac, out var stats))
                {
                    stats.MessagesSent++;
                }

                Console.WriteLine($"[WebSocket Service] Message sent successfully to {deviceMac}");
                return true;
            }
            catch (WebSocketException ex) when (ex.WebSocketErrorCode == WebSocketError.ConnectionClosedPrematurely)
            {
                Console.WriteLine($"[WebSocket Service] Connection closed while sending to {deviceMac}");
                await CloseConnectionAsync(deviceMac, "Connection lost during send");
                return false;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Service] Error sending message to {deviceMac}: {ex.Message}");
                RecordConnectionError(deviceMac, $"Send error: {ex.Message}");
                return false;
            }
        }

        // Internal close method to prevent double-closing
        private async Task CloseConnectionInternalAsync(DeviceWebSocketConnection connection, string reason)
        {
            Console.WriteLine($"[WebSocket Service] Closing connection for {connection.DeviceMac}: {reason}");

            if (connection.IsClosing)
            {
                Console.WriteLine($"[WebSocket Service] Already closing {connection.DeviceMac}");
                return; // Already closing
            }

            connection.IsClosing = true;

            try
            {
                connection.CancellationToken.Cancel();

                if (connection.WebSocket.State == WebSocketState.Open)
                {
                    await connection.WebSocket.CloseAsync(
                        WebSocketCloseStatus.NormalClosure,
                        reason,
                        CancellationToken.None);
                }

                // Update total connected time
                if (_connectionStats.TryGetValue(connection.DeviceMac, out var stats))
                {
                    stats.TotalConnectedTime += DateTime.UtcNow - connection.ConnectedAt;
                }

                Console.WriteLine($"[WebSocket Service] Connection closed for {connection.DeviceMac}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WebSocket Service] Error closing connection for {connection.DeviceMac}: {ex.Message}");
            }
            finally
            {
                connection.CancellationToken.Dispose();
                // Remove from connections dictionary
                _connections.TryRemove(connection.DeviceMac, out _);
                Console.WriteLine($"[WebSocket Service] Connection removed from dictionary for {connection.DeviceMac}");
            }
        }

        // Close connection for specific device - PUBLIC API
        public async Task CloseConnectionAsync(string deviceMac, string reason = "Unknown")
        {
            if (_connections.TryGetValue(deviceMac, out var connection))
            {
                await CloseConnectionInternalAsync(connection, reason);
            }
        }

        // Get connected devices with enhanced info
        public IEnumerable<object> GetConnectedDevices()
        {
            return _connections.Values.Select(conn => new
            {
                DeviceMac = conn.DeviceMac,
                DeviceName = conn.DeviceName,
                IpAddress = conn.IpAddress,
                ConnectionType = conn.ConnectionType,
                ConnectedAt = conn.ConnectedAt,
                LastMessageAt = conn.LastMessageAt,
                IsConnected = conn.WebSocket.State == WebSocketState.Open,
                IsRegistered = conn.IsRegistered,
                FirmwareVersion = conn.FirmwareVersion,
                DeviceModel = conn.DeviceModel,
                ChipModel = conn.ChipModel,
                CpuFreqMHz = conn.CpuFreqMHz,
                FlashSize = conn.FlashSize,
                Capabilities = conn.Capabilities,
                SupportedProtocols = conn.SupportedProtocols,
                Statistics = _connectionStats.TryGetValue(conn.DeviceMac, out var stats) ? stats : null
            });
        }

        // Check if device is connected
        public bool IsDeviceConnected(string deviceMac)
        {
            return _connections.TryGetValue(deviceMac, out var connection) &&
                   connection.WebSocket.State == WebSocketState.Open;
        }

        // Get device statistics
        public object? GetDeviceStatistics(string deviceMac)
        {
            if (!_connectionStats.TryGetValue(deviceMac, out var stats))
                return null;

            var connection = _connections.TryGetValue(deviceMac, out var conn) ? conn : null;

            return new
            {
                DeviceMac = deviceMac,
                IsConnected = connection?.WebSocket.State == WebSocketState.Open,
                IsRegistered = connection?.IsRegistered ?? false,
                ConnectedAt = connection?.ConnectedAt,
                LastMessageAt = connection?.LastMessageAt,
                MessagesReceived = stats.MessagesReceived,
                MessagesSent = stats.MessagesSent,
                ReconnectionCount = stats.ReconnectionCount,
                LastHealthReport = stats.LastHealthReport,
                LastRegistration = stats.LastRegistration,
                FirstConnected = stats.FirstConnected,
                TotalConnectedTime = stats.TotalConnectedTime + (connection != null ? DateTime.UtcNow - connection.ConnectedAt : TimeSpan.Zero),
                RecentErrors = stats.RecentErrors.TakeLast(5).ToList(),
                DeviceInfo = connection != null ? new
                {
                    DeviceName = connection.DeviceName,
                    FirmwareVersion = connection.FirmwareVersion,
                    DeviceModel = connection.DeviceModel,
                    ChipModel = connection.ChipModel,
                    CpuFreqMHz = connection.CpuFreqMHz,
                    FlashSize = connection.FlashSize,
                    Capabilities = connection.Capabilities,
                    SupportedProtocols = connection.SupportedProtocols
                } : null
            };
        }

        // Close all connections (for graceful shutdown)
        public async Task CloseAllConnectionsAsync(string reason = "Service shutdown")
        {
            var tasks = _connections.Values.Select(connection => CloseConnectionInternalAsync(connection, reason)).ToArray();
            await Task.WhenAll(tasks);
            _connections.Clear();
            _connectionStats.Clear();
        }

        // Helper methods
        private void RecordConnectionError(string deviceMac, string error)
        {
            if (_connectionStats.TryGetValue(deviceMac, out var stats))
            {
                stats.RecentErrors.Add($"{DateTime.UtcNow:HH:mm:ss}: {error}");

                if (stats.RecentErrors.Count > 10)
                {
                    stats.RecentErrors.RemoveRange(0, stats.RecentErrors.Count - 10);
                }
            }
        }

        private static bool IsValidMacAddress(string macAddress)
        {
            if (string.IsNullOrWhiteSpace(macAddress) || macAddress.Length != 17)
                return false;

            for (int i = 0; i < 17; i++)
            {
                if (i % 3 == 2)
                {
                    if (macAddress[i] != ':') return false;
                }
                else
                {
                    char c = macAddress[i];
                    if (!((c >= '0' && c <= '9') || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f')))
                        return false;
                }
            }
            return true;
        }
    }
}