/*
 * This file is part of Junction Relay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * Junction Relay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Junction Relay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Junction Relay. If not, see <https://www.gnu.org/licenses/>.
 */

using System.Collections.Concurrent;
using System.Net.Http;
using System.Text;

namespace JunctionRelayServer.Services
{
    public class Service_Send_Data_HTTP : IDisposable
    {
        // Keep-alive connection pool for different endpoints
        private static readonly ConcurrentDictionary<string, HttpClient> _keepAliveClients = new();

        // Non-keep-alive client (shared, disposes connections after each request)
        private static readonly Lazy<HttpClient> _standardClient = new(() =>
        {
            var handler = new SocketsHttpHandler()
            {
                PooledConnectionLifetime = TimeSpan.FromMilliseconds(1), // Force new connections
                PooledConnectionIdleTimeout = TimeSpan.FromMilliseconds(1),
                MaxConnectionsPerServer = 1
            };

            var client = new HttpClient(handler)
            {
                Timeout = TimeSpan.FromSeconds(30)
            };

            // Explicitly disable keep-alive
            client.DefaultRequestHeaders.Connection.Add("close");

            Console.WriteLine("[SERVICE_SEND_DATA_HTTP] Created standard (non-keep-alive) HttpClient");
            return client;
        });

        private static readonly object _lockObject = new object();

        private readonly string _endpointUrl;
        private readonly bool _useKeepAlive;
        private readonly HttpClient _httpClient;
        private bool _disposed = false;

        public Service_Send_Data_HTTP(string endpointUrl, bool useKeepAlive = true)
        {
            _endpointUrl = endpointUrl;
            _useKeepAlive = useKeepAlive;

            if (_useKeepAlive)
            {
                // Get or create a dedicated keep-alive HttpClient for this endpoint
                _httpClient = _keepAliveClients.GetOrAdd(endpointUrl, url =>
                {
                    var handler = new SocketsHttpHandler()
                    {
                        // Enable connection pooling and keep-alive
                        PooledConnectionLifetime = TimeSpan.FromMinutes(10),
                        PooledConnectionIdleTimeout = TimeSpan.FromMinutes(2),
                        MaxConnectionsPerServer = 10,

                        // Keep-alive settings
                        KeepAlivePingDelay = TimeSpan.FromSeconds(30),
                        KeepAlivePingTimeout = TimeSpan.FromSeconds(5),
                        KeepAlivePingPolicy = HttpKeepAlivePingPolicy.WithActiveRequests
                    };

                    var client = new HttpClient(handler)
                    {
                        Timeout = TimeSpan.FromSeconds(30)
                    };

                    // Set keep-alive headers
                    client.DefaultRequestHeaders.Connection.Add("keep-alive");
                    client.DefaultRequestHeaders.Add("Keep-Alive", "timeout=60, max=1000");

                    Console.WriteLine($"[SERVICE_SEND_DATA_HTTP] Created keep-alive HttpClient for {url}");
                    return client;
                });
            }
            else
            {
                // Use the shared non-keep-alive client
                _httpClient = _standardClient.Value;
                Console.WriteLine($"[SERVICE_SEND_DATA_HTTP] Using standard HttpClient for {endpointUrl}");
            }
        }

        public async Task<(bool Success, string ResponseMessage)> SendPayloadAsync(string payload)
        {
            if (_disposed)
                throw new ObjectDisposedException(nameof(Service_Send_Data_HTTP));

            try
            {
                var content = new StringContent(payload, Encoding.UTF8, "application/json");

                using var request = new HttpRequestMessage(HttpMethod.Post, _endpointUrl)
                {
                    Content = content
                };

                // REMOVED: Per-request connection headers - using HttpClient defaults instead
                // The connection headers are already set correctly on the HttpClient in the constructor

                HttpResponseMessage response = await _httpClient.SendAsync(request);
                string responseBody = await response.Content.ReadAsStringAsync();

                // Console.WriteLine($"[DEBUG] Response from device: {response.StatusCode} - {responseBody}");
                response.EnsureSuccessStatusCode();
                return (true, responseBody);
            }
            catch (HttpRequestException ex) when (ex.Message.Contains("timeout") || ex.Message.Contains("connection"))
            {
                Console.WriteLine($"[SERVICE_SEND_DATA_HTTP] Connection error for {_endpointUrl} (KeepAlive: {_useKeepAlive}): {ex.Message}");

                // Only attempt to recreate keep-alive clients on connection issues
                if (_useKeepAlive)
                {
                    lock (_lockObject)
                    {
                        if (_keepAliveClients.TryRemove(_endpointUrl, out var oldClient))
                        {
                            oldClient.Dispose();
                            Console.WriteLine($"[SERVICE_SEND_DATA_HTTP] Recreating keep-alive HttpClient for {_endpointUrl}");
                        }
                    }
                }

                return (false, ex.Message);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_SEND_DATA_HTTP] Error sending payload to {_endpointUrl} (KeepAlive: {_useKeepAlive}): {ex.Message}");
                return (false, ex.Message);
            }
        }

        public void Dispose()
        {
            if (!_disposed)
            {
                _disposed = true;
                // Note: We don't dispose the HttpClients here since they may be shared
                // Keep-alive clients are cleaned up via DisposeAllClients()
                // Standard client is cleaned up when the Lazy<T> is disposed
            }
        }

        // Static cleanup methods for application shutdown
        public static void DisposeAllKeepAliveClients()
        {
            foreach (var client in _keepAliveClients.Values)
            {
                client.Dispose();
            }
            _keepAliveClients.Clear();
            Console.WriteLine("[SERVICE_SEND_DATA_HTTP] Disposed all keep-alive HttpClients");
        }

        public static void DisposeStandardClient()
        {
            if (_standardClient.IsValueCreated)
            {
                _standardClient.Value.Dispose();
                Console.WriteLine("[SERVICE_SEND_DATA_HTTP] Disposed standard HttpClient");
            }
        }

        public static void DisposeAllClients()
        {
            DisposeAllKeepAliveClients();
            DisposeStandardClient();
        }
    }
}