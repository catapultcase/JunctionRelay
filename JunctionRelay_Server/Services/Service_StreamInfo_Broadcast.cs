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
using System.Text.Json.Serialization;

namespace JunctionRelayServer.Services
{
    /// <summary>
    /// Tracks state for a connected broadcast client.
    /// </summary>
    public class BroadcastClientConnection
    {
        public string ClientId { get; set; } = string.Empty;
        public WebSocket? WebSocket { get; set; }
        public DateTime ConnectedAt { get; set; } = DateTime.UtcNow;
        public DateTime LastMessageAt { get; set; } = DateTime.UtcNow;
        public string? ClientInfo { get; set; }
        public long MessagesSent { get; set; }
        public bool IsClosing { get; set; }
    }

    /// <summary>
    /// Tracks state for a Broadcast junction.
    /// Server broadcasts sensor data to connected clients.
    /// </summary>
    public class Service_StreamInfo_Broadcast : IDisposable, IAsyncDisposable
    {
        public int JunctionId { get; set; }
        public string JunctionName { get; set; } = string.Empty;
        public int Rate { get; set; }
        public string Status { get; set; } = "Inactive";

        // Stream statistics
        public int ConnectedClients => _connectedClients.Count;
        public long MessagesSent { get; private set; }
        public DateTime? LastBroadcastTime { get; private set; }
        public DateTime StartedAt { get; set; }

        // Sensor tracking
        public int SensorsCount { get; set; }

        // Connected clients
        private readonly ConcurrentDictionary<string, BroadcastClientConnection> _connectedClients = new();

        [JsonIgnore]
        public CancellationTokenSource Cts { get; set; } = new();

        private bool _disposed = false;
        private readonly object _disposeLock = new object();

        [JsonIgnore]
        public bool IsDisposed => _disposed;

        public void AddClient(string clientId, WebSocket webSocket, string? clientInfo = null)
        {
            _connectedClients[clientId] = new BroadcastClientConnection
            {
                ClientId = clientId,
                WebSocket = webSocket,
                ClientInfo = clientInfo
            };
            Console.WriteLine($"[SERVICE_STREAMINFO_BROADCAST] Client {clientId} connected to junction {JunctionName}");
        }

        public void RemoveClient(string clientId)
        {
            if (_connectedClients.TryRemove(clientId, out var client))
            {
                Console.WriteLine($"[SERVICE_STREAMINFO_BROADCAST] Client {clientId} disconnected from junction {JunctionName} (sent {client.MessagesSent} messages)");
            }
        }

        public IEnumerable<BroadcastClientConnection> GetActiveClients()
        {
            return _connectedClients.Values.Where(c => !c.IsClosing && c.WebSocket?.State == WebSocketState.Open);
        }

        public void IncrementMessagesSent()
        {
            MessagesSent++;
            LastBroadcastTime = DateTime.UtcNow;
        }

        public void IncrementClientMessagesSent(string clientId)
        {
            if (_connectedClients.TryGetValue(clientId, out var client))
            {
                client.MessagesSent++;
                client.LastMessageAt = DateTime.UtcNow;
            }
        }

        // Graceful: each client gets a normal close, bounded at one second (the stream manager awaits this).
        public async ValueTask DisposeAsync()
        {
            lock (_disposeLock)
            {
                if (_disposed) return;
                _disposed = true;
            }

            var clients = _connectedClients.Values.ToList();
            using var closeTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(1));
            await Task.WhenAll(clients.Select(async client =>
            {
                client.IsClosing = true;
                try
                {
                    if (client.WebSocket?.State == WebSocketState.Open)
                        await client.WebSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Stream stopped", closeTimeout.Token);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SERVICE_STREAMINFO_BROADCAST] Error closing client {client.ClientId}: {ex.Message}");
                    client.WebSocket?.Abort();
                }
            }));

            ReleaseResources();
        }

        // Synchronous path: no handshake - sockets are aborted.
        public void Dispose()
        {
            lock (_disposeLock)
            {
                if (_disposed) return;
                _disposed = true;
            }

            foreach (var client in _connectedClients.Values)
            {
                client.IsClosing = true;
                try { client.WebSocket?.Abort(); }
                catch (Exception ex) { Console.WriteLine($"[SERVICE_STREAMINFO_BROADCAST] Error aborting client {client.ClientId}: {ex.Message}"); }
            }

            ReleaseResources();
        }

        private void ReleaseResources()
        {
            _connectedClients.Clear();

            try
            {
                Cts?.Cancel();
                Cts?.Dispose();
            }
            catch (ObjectDisposedException) { }

            Console.WriteLine($"[SERVICE_STREAMINFO_BROADCAST] Disposed stream for junction {JunctionName}");
        }
    }
}
