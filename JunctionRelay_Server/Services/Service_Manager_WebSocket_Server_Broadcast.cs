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
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    /// <summary>
    /// WebSocket server for Broadcast junction sensor streaming.
    /// Each junction starts a dedicated WebSocket listener on its configured port.
    /// Server broadcasts sensor data to connected clients.
    /// Devices connect directly to the port (no path needed).
    /// Uses TcpListener instead of HttpListener to avoid permission issues on Linux.
    /// </summary>
    public class Service_Manager_WebSocket_Server_Broadcast
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly Service_Manager_Payloads_XSD_Sensor _xsdPayloads;

        // Active junctions with their listeners
        private readonly ConcurrentDictionary<int, JunctionBroadcast> _activeJunctions = new();

        // Default port for Broadcast junctions (9084 to avoid conflict with XSD's 8084)
        public const int DefaultBroadcastPort = 9084;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        /// <summary>
        /// Tracks an active junction broadcast including its TCP listener.
        /// </summary>
        private class JunctionBroadcast
        {
            public int JunctionId { get; set; }
            public string JunctionName { get; set; } = string.Empty;
            public int Port { get; set; }
            public int Rate { get; set; }
            public List<Model_Sensor> Sensors { get; set; } = new();
            public Service_StreamInfo_Broadcast StreamInfo { get; set; } = null!;
            public TcpListener? Listener { get; set; }
            public CancellationTokenSource Cts { get; set; } = new();
        }

        public Service_Manager_WebSocket_Server_Broadcast(
            IServiceScopeFactory scopeFactory,
            Service_Manager_Payloads_XSD_Sensor xsdPayloads)
        {
            _scopeFactory = scopeFactory;
            _xsdPayloads = xsdPayloads;

            Console.WriteLine("[BROADCAST_SERVER] Service initialized");
        }

        /// <summary>
        /// Start broadcasting for a junction on its configured port.
        /// </summary>
        public async Task StartJunctionBroadcastAsync(int junctionId, string junctionName, int rate, int port, List<Model_Sensor> sensors)
        {
            if (_activeJunctions.ContainsKey(junctionId))
            {
                Console.WriteLine($"[BROADCAST_SERVER] Junction {junctionId} already broadcasting");
                return;
            }

            // Check if port is already in use by another junction
            if (_activeJunctions.Values.Any(j => j.Port == port))
            {
                Console.WriteLine($"[BROADCAST_SERVER] ERROR: Port {port} already in use by another Broadcast junction");
                throw new InvalidOperationException($"Port {port} is already in use by another Broadcast junction");
            }

            var streamInfo = new Service_StreamInfo_Broadcast
            {
                JunctionId = junctionId,
                JunctionName = junctionName,
                Rate = rate,
                Status = "Active",
                StartedAt = DateTime.UtcNow,
                SensorsCount = sensors.Count
            };

            var broadcast = new JunctionBroadcast
            {
                JunctionId = junctionId,
                JunctionName = junctionName,
                Port = port,
                Rate = rate,
                Sensors = sensors,
                StreamInfo = streamInfo
            };

            // Start TCP listener for WebSocket connections
            try
            {
                var listener = new TcpListener(IPAddress.Any, port);
                listener.Start();
                broadcast.Listener = listener;

                Console.WriteLine($"[BROADCAST_SERVER] Started WebSocket server on port {port} for junction '{junctionName}'");
            }
            catch (SocketException ex)
            {
                Console.WriteLine($"[BROADCAST_SERVER] ERROR: Failed to start listener on port {port}: {ex.Message}");
                throw;
            }

            _activeJunctions[junctionId] = broadcast;

            // Start accepting connections
            _ = Task.Run(() => AcceptConnectionsAsync(broadcast));

            // Start broadcast loop
            _ = Task.Run(() => BroadcastLoopAsync(broadcast));

            Console.WriteLine($"[BROADCAST_SERVER] Junction '{junctionName}' broadcasting on port {port} with {sensors.Count} sensors at {rate}ms rate");
        }

        /// <summary>
        /// Accept incoming WebSocket connections on the junction's port.
        /// </summary>
        private async Task AcceptConnectionsAsync(JunctionBroadcast broadcast)
        {
            var listener = broadcast.Listener;
            var token = broadcast.Cts.Token;

            if (listener == null) return;

            while (!token.IsCancellationRequested)
            {
                try
                {
                    var tcpClient = await listener.AcceptTcpClientAsync(token);
                    _ = Task.Run(() => HandleTcpConnectionAsync(tcpClient, broadcast));
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (SocketException) when (token.IsCancellationRequested)
                {
                    break;
                }
                catch (ObjectDisposedException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[BROADCAST_SERVER] Error accepting connection on port {broadcast.Port}: {ex.Message}");
                }
            }

            Console.WriteLine($"[BROADCAST_SERVER] Stopped accepting connections for junction {broadcast.JunctionId}");
        }

        /// <summary>
        /// Handle a TCP connection - perform WebSocket handshake if requested.
        /// </summary>
        private async Task HandleTcpConnectionAsync(TcpClient tcpClient, JunctionBroadcast broadcast)
        {
            var clientId = Guid.NewGuid().ToString();
            var clientIp = tcpClient.Client.RemoteEndPoint?.ToString() ?? "Unknown";
            NetworkStream? stream = null;

            try
            {
                stream = tcpClient.GetStream();

                // Read HTTP request
                var buffer = new byte[4096];
                var bytesRead = await stream.ReadAsync(buffer, 0, buffer.Length);
                var request = Encoding.UTF8.GetString(buffer, 0, bytesRead);

                if (request.Contains("Upgrade: websocket", StringComparison.OrdinalIgnoreCase))
                {
                    // WebSocket upgrade request - perform handshake
                    var webSocket = await PerformWebSocketHandshakeAsync(stream, request, tcpClient, broadcast.Cts.Token);

                    if (webSocket != null)
                    {
                        broadcast.StreamInfo.AddClient(clientId, webSocket, $"Client from {clientIp}");
                        Console.WriteLine($"[BROADCAST_SERVER] Client connected to junction '{broadcast.JunctionName}' on port {broadcast.Port}");

                        // Send streams_available message (XSD protocol)
                        await SendStreamsAvailableAsync(webSocket, broadcast);

                        // Keep connection alive
                        await HandleClientMessagesAsync(webSocket, broadcast, clientId);
                    }
                }
                else if (request.StartsWith("GET ", StringComparison.OrdinalIgnoreCase))
                {
                    // Regular HTTP request - return info about the junction
                    var info = JsonSerializer.Serialize(new
                    {
                        type = "broadcast_info",
                        junctionId = broadcast.JunctionId,
                        junctionName = broadcast.JunctionName,
                        port = broadcast.Port,
                        rate = broadcast.Rate,
                        sensorsCount = broadcast.Sensors.Count,
                        connectedClients = broadcast.StreamInfo.ConnectedClients,
                        message = "Connect via WebSocket to receive sensor data"
                    }, _jsonOptions);

                    var response = $"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {Encoding.UTF8.GetByteCount(info)}\r\nConnection: close\r\n\r\n{info}";
                    var responseBytes = Encoding.UTF8.GetBytes(response);
                    await stream.WriteAsync(responseBytes, 0, responseBytes.Length);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[BROADCAST_SERVER] Error handling client {clientId}: {ex.Message}");
            }
            finally
            {
                broadcast.StreamInfo.RemoveClient(clientId);
                stream?.Dispose();
                tcpClient.Dispose();
            }
        }

        /// <summary>
        /// Perform WebSocket handshake and return the WebSocket.
        /// </summary>
        private async Task<WebSocket?> PerformWebSocketHandshakeAsync(NetworkStream stream, string request, TcpClient tcpClient, CancellationToken token)
        {
            try
            {
                // Extract Sec-WebSocket-Key
                var keyMatch = Regex.Match(request, @"Sec-WebSocket-Key: (.+)\r\n", RegexOptions.IgnoreCase);
                if (!keyMatch.Success)
                {
                    Console.WriteLine("[BROADCAST_SERVER] WebSocket handshake failed: No Sec-WebSocket-Key");
                    return null;
                }

                var key = keyMatch.Groups[1].Value.Trim();
                var acceptKey = ComputeWebSocketAcceptKey(key);

                // Send handshake response
                var response = $"HTTP/1.1 101 Switching Protocols\r\n" +
                               $"Upgrade: websocket\r\n" +
                               $"Connection: Upgrade\r\n" +
                               $"Sec-WebSocket-Accept: {acceptKey}\r\n\r\n";

                var responseBytes = Encoding.UTF8.GetBytes(response);
                await stream.WriteAsync(responseBytes, 0, responseBytes.Length, token);

                // Create WebSocket from the stream
                var webSocket = WebSocket.CreateFromStream(stream, new WebSocketCreationOptions
                {
                    IsServer = true,
                    KeepAliveInterval = TimeSpan.FromSeconds(30)
                });

                return webSocket;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[BROADCAST_SERVER] WebSocket handshake error: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Compute the Sec-WebSocket-Accept key for the handshake.
        /// </summary>
        private static string ComputeWebSocketAcceptKey(string key)
        {
            const string webSocketGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
            var combined = key + webSocketGuid;
            var hash = SHA1.HashData(Encoding.UTF8.GetBytes(combined));
            return Convert.ToBase64String(hash);
        }

        /// <summary>
        /// Broadcast loop - sends sensor data to all connected clients at configured rate.
        /// </summary>
        private async Task BroadcastLoopAsync(JunctionBroadcast broadcast)
        {
            var streamInfo = broadcast.StreamInfo;
            var token = broadcast.Cts.Token;

            while (!token.IsCancellationRequested && _activeJunctions.ContainsKey(broadcast.JunctionId))
            {
                try
                {
                    var clients = streamInfo.GetActiveClients().ToList();
                    if (clients.Count == 0)
                    {
                        await Task.Delay(broadcast.Rate, token);
                        continue;
                    }

                    var sensorPayload = BuildXsdSensorPayload(broadcast.Sensors);
                    var payloadBytes = Encoding.UTF8.GetBytes(sensorPayload);

                    var sendTasks = clients.Select(async client =>
                    {
                        try
                        {
                            if (client.WebSocket?.State == WebSocketState.Open)
                            {
                                await client.WebSocket.SendAsync(
                                    new ArraySegment<byte>(payloadBytes),
                                    WebSocketMessageType.Text,
                                    true,
                                    token);

                                streamInfo.IncrementClientMessagesSent(client.ClientId);
                            }
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine($"[BROADCAST_SERVER] Error sending to client {client.ClientId}: {ex.Message}");
                        }
                    });

                    await Task.WhenAll(sendTasks);
                    streamInfo.IncrementMessagesSent();

                    await Task.Delay(broadcast.Rate, token);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[BROADCAST_SERVER] Error in broadcast loop: {ex.Message}");
                    await Task.Delay(1000, token);
                }
            }
        }

        /// <summary>
        /// Send streams_available message (XSD protocol).
        /// </summary>
        private async Task SendStreamsAvailableAsync(WebSocket webSocket, JunctionBroadcast broadcast)
        {
            var json = _xsdPayloads.BuildStreamsAvailablePayload(
                broadcast.JunctionName,
                broadcast.Port,
                broadcast.Rate,
                broadcast.Sensors.Count);

            var bytes = Encoding.UTF8.GetBytes(json);

            await webSocket.SendAsync(
                new ArraySegment<byte>(bytes),
                WebSocketMessageType.Text,
                true,
                CancellationToken.None);
        }

        /// <summary>
        /// Build XSD sensor payload from junction sensors using shared payload service.
        /// </summary>
        private string BuildXsdSensorPayload(List<Model_Sensor> sensors)
        {
            return _xsdPayloads.BuildXsdSensorPayload(sensors);
        }

        /// <summary>
        /// Handle messages from connected client.
        /// </summary>
        private async Task HandleClientMessagesAsync(WebSocket webSocket, JunctionBroadcast broadcast, string clientId)
        {
            var buffer = new byte[1024];
            var token = broadcast.Cts.Token;

            while (webSocket.State == WebSocketState.Open && !token.IsCancellationRequested)
            {
                try
                {
                    var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), token);

                    if (result.MessageType == WebSocketMessageType.Close)
                        break;
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (WebSocketException)
                {
                    break;
                }
            }
        }

        /// <summary>
        /// Stop broadcasting for a junction.
        /// </summary>
        public void StopJunctionBroadcast(int junctionId)
        {
            if (_activeJunctions.TryRemove(junctionId, out var broadcast))
            {
                broadcast.StreamInfo.Status = "Stopping";
                broadcast.Cts.Cancel();

                try
                {
                    broadcast.Listener?.Stop();
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[BROADCAST_SERVER] Error stopping listener: {ex.Message}");
                }

                broadcast.StreamInfo.Dispose();
                Console.WriteLine($"[BROADCAST_SERVER] Stopped broadcast for junction '{broadcast.JunctionName}' on port {broadcast.Port}");
            }
        }

        /// <summary>
        /// Check if a junction is currently broadcasting.
        /// </summary>
        public bool IsJunctionActive(int junctionId)
        {
            return _activeJunctions.ContainsKey(junctionId);
        }

        /// <summary>
        /// Get information about active junctions.
        /// </summary>
        public IEnumerable<object> GetActiveJunctions()
        {
            return _activeJunctions.Values.Select(j => new
            {
                j.JunctionId,
                j.JunctionName,
                j.Port,
                j.Rate,
                j.StreamInfo.Status,
                j.StreamInfo.ConnectedClients,
                j.StreamInfo.MessagesSent,
                j.StreamInfo.LastBroadcastTime,
                j.StreamInfo.StartedAt,
                j.StreamInfo.SensorsCount
            });
        }

        /// <summary>
        /// Get active streams in Model_StreamInfo_DTO format for dashboard display.
        /// </summary>
        public IEnumerable<Model_StreamInfo_DTO> GetActiveStreams()
        {
            return _activeJunctions.Values.Select(j => new Model_StreamInfo_DTO
            {
                StreamKey = $"broadcast_{j.JunctionId}",
                Protocol = "Broadcast",
                DeviceName = j.JunctionName,
                DeviceMac = $"Port:{j.Port}",
                ScreenId = 0,
                ScreenName = $"Broadcast (Port {j.Port})",
                Status = j.StreamInfo.Status,
                Rate = j.Rate,
                Latency = 0,
                LastSentTime = j.StreamInfo.LastBroadcastTime ?? DateTime.MinValue,
                SensorsCount = j.StreamInfo.SensorsCount,
                ConfigPayloadPrefix = "",
                ConfigPayloadJson = "{}",
                LastSentPayloadPrefix = "",
                LastSentPayloadJson = "{}",
                HasLastFrame = false,
                IsGatewayMode = false,
                CompressionEnabled = false,
                Health = new Model_StreamHealth_DTO
                {
                    ConnectionState = "good", // Always "good" when broadcasting - it's a server, not dependent on client connections
                    SuccessRate = 100.0,
                    PayloadsSent = (int)j.StreamInfo.MessagesSent,
                    LastSuccessTime = j.StreamInfo.LastBroadcastTime ?? DateTime.MinValue
                }
            });
        }

        /// <summary>
        /// Get detailed info for a specific junction.
        /// </summary>
        public object? GetJunctionInfo(int junctionId)
        {
            if (_activeJunctions.TryGetValue(junctionId, out var broadcast))
            {
                return new
                {
                    broadcast.JunctionId,
                    broadcast.JunctionName,
                    broadcast.Port,
                    broadcast.Rate,
                    broadcast.StreamInfo.Status,
                    broadcast.StreamInfo.ConnectedClients,
                    broadcast.StreamInfo.MessagesSent,
                    broadcast.StreamInfo.LastBroadcastTime,
                    broadcast.StreamInfo.StartedAt,
                    broadcast.StreamInfo.SensorsCount,
                    Clients = broadcast.StreamInfo.GetActiveClients().Select(c => new
                    {
                        c.ClientId,
                        c.ConnectedAt,
                        c.LastMessageAt,
                        c.ClientInfo,
                        c.MessagesSent
                    })
                };
            }
            return null;
        }

        /// <summary>
        /// Stop all broadcasts (for shutdown).
        /// </summary>
        public async Task StopAllBroadcastsAsync()
        {
            Console.WriteLine($"[BROADCAST_SERVER] Stopping all {_activeJunctions.Count} broadcasts...");

            foreach (var junctionId in _activeJunctions.Keys.ToList())
            {
                StopJunctionBroadcast(junctionId);
            }

            await Task.Delay(200);
            Console.WriteLine("[BROADCAST_SERVER] All broadcasts stopped");
        }

        /// <summary>
        /// Check if a port is available for use.
        /// Returns status: "available", "in_use_by_this_junction", "in_use_by_junction", "in_use_by_system"
        /// </summary>
        public async Task<PortCheckResult> CheckPortAvailabilityAsync(int port, int? excludeJunctionId = null)
        {
            // First check if THIS junction (the excluded one) is already using the port
            if (excludeJunctionId.HasValue)
            {
                var thisJunction = _activeJunctions.Values
                    .FirstOrDefault(j => j.Port == port && j.JunctionId == excludeJunctionId.Value);

                if (thisJunction != null)
                {
                    return new PortCheckResult
                    {
                        Status = "in_use_by_this_junction",
                        Message = "Port is in use by this junction (running)",
                        JunctionId = thisJunction.JunctionId,
                        JunctionName = thisJunction.JunctionName
                    };
                }
            }

            // Check if port is used by ANOTHER active Broadcast junction
            var otherJunctionUsingPort = _activeJunctions.Values
                .FirstOrDefault(j => j.Port == port && j.JunctionId != excludeJunctionId);

            if (otherJunctionUsingPort != null)
            {
                return new PortCheckResult
                {
                    Status = "in_use_by_junction",
                    Message = $"Port in use by junction '{otherJunctionUsingPort.JunctionName}'",
                    JunctionId = otherJunctionUsingPort.JunctionId,
                    JunctionName = otherJunctionUsingPort.JunctionName
                };
            }

            // Try to bind to the port to check system availability
            try
            {
                using var testListener = new TcpListener(IPAddress.Any, port);
                testListener.Start();
                testListener.Stop();

                return new PortCheckResult
                {
                    Status = "available",
                    Message = "Port is available"
                };
            }
            catch (SocketException)
            {
                return new PortCheckResult
                {
                    Status = "in_use_by_system",
                    Message = "Port is in use by another application"
                };
            }
        }
    }

    /// <summary>
    /// Result of a port availability check.
    /// </summary>
    public class PortCheckResult
    {
        public string Status { get; set; } = "unknown";
        public string Message { get; set; } = "";
        public int? JunctionId { get; set; }
        public string? JunctionName { get; set; }
    }
}
