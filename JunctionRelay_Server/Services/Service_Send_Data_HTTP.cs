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
using System.Diagnostics;
using System.Net.Http;
using System.Text;

namespace JunctionRelayServer.Services
{
    // Health tracking result for detailed frontend visualization
    public class HttpSendResult
    {
        public bool Success { get; set; }
        public int StatusCode { get; set; }
        public string ErrorType { get; set; } = string.Empty; // "timeout", "connection_refused", "dns_failure", "keep_alive_recreation", etc.
        public string ErrorMessage { get; set; } = string.Empty;
        public long LatencyMs { get; set; }
        public bool KeepAlivePoolRecreated { get; set; } = false;
        public string ResponseMessage { get; set; } = string.Empty;
    }

    // Stream health tracking for detailed connection analytics
    public class StreamHealth
    {
        public string ConnectionState { get; set; } = "good"; // "good", "poor", "disconnected"
        public int ConsecutiveFailures { get; set; } = 0;
        public int ConsecutiveSuccesses { get; set; } = 0;
        public DateTime LastSuccessTime { get; set; } = DateTime.UtcNow;
        public DateTime LastFailureTime { get; set; } = DateTime.MinValue;
        public string LastErrorMessage { get; set; } = string.Empty;
        public double SuccessRate { get; set; } = 100.0; // Rolling 10-attempt window
        public List<bool> RecentAttempts { get; set; } = new(); // Last 10 attempts for rolling average
        public int HttpStatusCode { get; set; } = 200;
        public string ErrorType { get; set; } = string.Empty; // Latest error type

        // Connection pool health (for keep-alive)
        public bool KeepAlivePoolRecreated { get; set; } = false;
        public DateTime LastPoolRecreation { get; set; } = DateTime.MinValue;
        public int PoolRecreationCount { get; set; } = 0;

        // Performance metrics
        public double AverageLatency { get; set; } = 0.0;
        public long MaxLatency { get; set; } = 0;
        public long MinLatency { get; set; } = long.MaxValue;

        public void UpdateHealth(HttpSendResult result)
        {
            // Update recent attempts (rolling window of 10)
            RecentAttempts.Add(result.Success);
            if (RecentAttempts.Count > 10)
                RecentAttempts.RemoveAt(0);

            // Calculate success rate
            SuccessRate = RecentAttempts.Count > 0 ?
                RecentAttempts.Count(x => x) * 100.0 / RecentAttempts.Count : 100.0;

            // Update latency metrics
            if (result.Success && result.LatencyMs > 0)
            {
                AverageLatency = AverageLatency == 0 ? result.LatencyMs :
                    (AverageLatency * 0.8) + (result.LatencyMs * 0.2); // Weighted average
                MaxLatency = Math.Max(MaxLatency, result.LatencyMs);
                MinLatency = Math.Min(MinLatency, result.LatencyMs);
            }

            if (result.Success)
            {
                ConsecutiveSuccesses++;
                ConsecutiveFailures = 0;
                LastSuccessTime = DateTime.UtcNow;
                HttpStatusCode = result.StatusCode;
                ErrorType = string.Empty;
                LastErrorMessage = string.Empty;
            }
            else
            {
                ConsecutiveFailures++;
                ConsecutiveSuccesses = 0;
                LastFailureTime = DateTime.UtcNow;
                HttpStatusCode = result.StatusCode;
                ErrorType = result.ErrorType;
                LastErrorMessage = result.ErrorMessage;
            }

            // Track keep-alive pool recreation events
            if (result.KeepAlivePoolRecreated)
            {
                KeepAlivePoolRecreated = true;
                LastPoolRecreation = DateTime.UtcNow;
                PoolRecreationCount++;
            }

            // Determine connection state
            DetermineConnectionState();
        }

        private void DetermineConnectionState()
        {
            // TESTING: Very sensitive thresholds for easy testing
            // Good: High success rate and no recent failures
            if (SuccessRate >= 95.0 && ConsecutiveFailures == 0) // Changed from 90% to 95%
            {
                ConnectionState = "good";
            }
            // Poor: Moderate success rate or some failures but still functional
            else if (SuccessRate >= 70.0 || (ConsecutiveFailures > 0 && ConsecutiveFailures < 2)) // Changed from 50% to 70%
            {
                ConnectionState = "poor";
            }
            // Disconnected: Low success rate or sustained failures
            else
            {
                ConnectionState = "disconnected";
            }

            // Special cases for keep-alive issues
            if (KeepAlivePoolRecreated && SuccessRate < 90.0) // Changed from 80% to 90%
            {
                ConnectionState = "poor"; // Pool recreation indicates instability
            }

            // TESTING: Very low latency threshold for easy testing
            if (ConnectionState == "good" && AverageLatency > 100) // Changed from 200ms to 100ms
            {
                ConnectionState = "poor";
            }
        }
    }

    public class Service_Send_Data_HTTP : IDisposable
    {
        // Keep-alive connection pool for different endpoints
        private static readonly ConcurrentDictionary<string, HttpClient> _keepAliveClients = new();

        // FIXED: Non-keep-alive client with reasonable connection reuse (not aggressive disposal)
        private static readonly Lazy<HttpClient> _standardClient = new(() =>
        {
            var handler = new SocketsHttpHandler()
            {
                // ✅ FIXED: Allow reasonable connection reuse instead of forcing new connections
                PooledConnectionLifetime = TimeSpan.FromMinutes(2),     // Was: FromMilliseconds(1)
                PooledConnectionIdleTimeout = TimeSpan.FromSeconds(30), // Was: FromMilliseconds(1)
                MaxConnectionsPerServer = 5,                            // Was: 1

                // ✅ Faster connection establishment
                ConnectTimeout = TimeSpan.FromSeconds(5),               // New: Reduce from default 30s
            };

            var client = new HttpClient(handler)
            {
                Timeout = TimeSpan.FromSeconds(10)  // ✅ Reduced from 30s for faster failures
            };

            // Still send "Connection: close" header to indicate no keep-alive to server
            client.DefaultRequestHeaders.Connection.Add("close");

            Console.WriteLine("[SERVICE_SEND_DATA_HTTP] Created standard (non-keep-alive) HttpClient with reasonable connection reuse");
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
                // Use the shared non-keep-alive client (now with reasonable settings)
                _httpClient = _standardClient.Value;
                Console.WriteLine($"[SERVICE_SEND_DATA_HTTP] Using standard HttpClient for {endpointUrl}");
            }
        }

        public Task<(bool Success, string ResponseMessage)> SendPayloadAsync(string payload)
        {
            try
            {
                if (_disposed)
                    return Task.FromResult((false, "HTTP sender has been disposed."));

                if (string.IsNullOrEmpty(payload))
                    return Task.FromResult((false, "Payload cannot be null or empty."));

                // Convert string to UTF-8 bytes and send as binary
                byte[] payloadBytes = Encoding.UTF8.GetBytes(payload);
                return SendPayloadAsync(payloadBytes);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_SEND_DATA_HTTP] Error converting string payload: {ex.Message}");
                return Task.FromResult((false, ex.Message));
            }
        }

        public async Task<(bool Success, string ResponseMessage)> SendPayloadAsync(byte[] payloadBytes)
        {
            var result = await SendPayloadWithHealthAsync(payloadBytes);
            return (result.Success, result.ResponseMessage);
        }

        public async Task<HttpSendResult> SendPayloadWithHealthAsync(byte[] payloadBytes)
        {
            if (_disposed)
                throw new ObjectDisposedException(nameof(Service_Send_Data_HTTP));

            if (payloadBytes == null || payloadBytes.Length == 0)
                return new HttpSendResult
                {
                    Success = false,
                    ErrorType = "invalid_payload",
                    ErrorMessage = "Payload cannot be null or empty."
                };

            var stopwatch = Stopwatch.StartNew();
            bool poolRecreated = false;

            try
            {
                // Send raw binary bytes directly
                var content = new ByteArrayContent(payloadBytes);
                content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/octet-stream");

                // Add headers to indicate binary payload format
                content.Headers.Add("X-Payload-Type", "binary");
                if (payloadBytes.Length > 8)
                {
                    // Check for ASCII prefix in binary data (8-digit prefix)
                    bool hasPrefix = true;
                    for (int i = 0; i < 8 && i < payloadBytes.Length; i++)
                    {
                        if (payloadBytes[i] < '0' || payloadBytes[i] > '9')
                        {
                            hasPrefix = false;
                            break;
                        }
                    }
                    if (hasPrefix)
                    {
                        content.Headers.Add("X-Payload-Prefix", "true");
                        // Extract and log the prefix for debugging
                        string prefix = Encoding.ASCII.GetString(payloadBytes, 0, 8);
                        content.Headers.Add("X-Payload-Prefix-Value", prefix);
                    }
                }

                using var request = new HttpRequestMessage(HttpMethod.Post, _endpointUrl)
                {
                    Content = content
                };

                HttpResponseMessage response = await _httpClient.SendAsync(request);
                stopwatch.Stop();

                string responseBody = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    return new HttpSendResult
                    {
                        Success = true,
                        StatusCode = (int)response.StatusCode,
                        LatencyMs = stopwatch.ElapsedMilliseconds,
                        ResponseMessage = responseBody,
                        KeepAlivePoolRecreated = poolRecreated
                    };
                }
                else
                {
                    return new HttpSendResult
                    {
                        Success = false,
                        StatusCode = (int)response.StatusCode,
                        ErrorType = "http_error",
                        ErrorMessage = $"HTTP {response.StatusCode}: {responseBody}",
                        LatencyMs = stopwatch.ElapsedMilliseconds,
                        ResponseMessage = responseBody,
                        KeepAlivePoolRecreated = poolRecreated
                    };
                }
            }
            catch (TaskCanceledException ex) when (ex.InnerException is TimeoutException)
            {
                stopwatch.Stop();
                return new HttpSendResult
                {
                    Success = false,
                    ErrorType = "timeout",
                    ErrorMessage = $"Request timeout after {_httpClient.Timeout.TotalMilliseconds}ms",
                    LatencyMs = stopwatch.ElapsedMilliseconds,
                    KeepAlivePoolRecreated = poolRecreated
                };
            }
            catch (TaskCanceledException)
            {
                stopwatch.Stop();
                return new HttpSendResult
                {
                    Success = false,
                    ErrorType = "cancelled",
                    ErrorMessage = "Request was cancelled",
                    LatencyMs = stopwatch.ElapsedMilliseconds,
                    KeepAlivePoolRecreated = poolRecreated
                };
            }
            catch (HttpRequestException ex)
            {
                stopwatch.Stop();

                // Categorize HTTP request errors
                string errorType = ex.Message.ToLower() switch
                {
                    var msg when msg.Contains("connection refused") => "connection_refused",
                    var msg when msg.Contains("host not found") || msg.Contains("dns") => "dns_failure",
                    var msg when msg.Contains("network unreachable") => "network_unreachable",
                    var msg when msg.Contains("connection reset") => "connection_reset",
                    var msg when msg.Contains("ssl") || msg.Contains("tls") => "ssl_error",
                    var msg when msg.Contains("timeout") => "timeout",
                    _ => "http_request_error"
                };

                Console.WriteLine($"[SERVICE_SEND_DATA_HTTP] Connection error for {_endpointUrl} (KeepAlive: {_useKeepAlive}): {ex.Message}");

                // Only attempt to recreate keep-alive clients on connection issues
                if (_useKeepAlive && (errorType == "connection_refused" || errorType == "connection_reset"))
                {
                    lock (_lockObject)
                    {
                        if (_keepAliveClients.TryRemove(_endpointUrl, out var oldClient))
                        {
                            oldClient.Dispose();
                            poolRecreated = true;
                            Console.WriteLine($"[SERVICE_SEND_DATA_HTTP] Recreating keep-alive HttpClient for {_endpointUrl}");
                        }
                    }
                }

                return new HttpSendResult
                {
                    Success = false,
                    ErrorType = errorType,
                    ErrorMessage = ex.Message,
                    LatencyMs = stopwatch.ElapsedMilliseconds,
                    KeepAlivePoolRecreated = poolRecreated
                };
            }
            catch (Exception ex)
            {
                stopwatch.Stop();
                Console.WriteLine($"[SERVICE_SEND_DATA_HTTP] Error sending binary payload to {_endpointUrl}: {ex.Message}");

                return new HttpSendResult
                {
                    Success = false,
                    ErrorType = "binary_send_error",
                    ErrorMessage = ex.Message,
                    LatencyMs = stopwatch.ElapsedMilliseconds,
                    KeepAlivePoolRecreated = poolRecreated
                };
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