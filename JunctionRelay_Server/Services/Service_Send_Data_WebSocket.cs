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
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace JunctionRelayServer.Services
{
    // WebSocket send result for detailed health tracking
    public class WebSocketSendResult
    {
        public bool Success { get; set; }
        public string ErrorType { get; set; } = string.Empty; // "connection_closed", "send_timeout", "not_connected", "gateway_error", etc.
        public string ErrorMessage { get; set; } = string.Empty;
        public long LatencyMs { get; set; }
        public bool ConnectionRecreated { get; set; } = false;
        public string ResponseMessage { get; set; } = string.Empty;
        public WebSocketState? ConnectionState { get; set; }

        // Frame-specific metrics
        public bool IsFramePayload { get; set; } = false;
        public int? FrameSizeBytes { get; set; }
        public long? FrameRenderTimeMs { get; set; }
        public string? FrameLayoutType { get; set; }
        public string PayloadType { get; set; } = "JSON"; // "JSON", "Gzip", "Frame"

        // Gateway-specific metrics
        public bool IsGatewayMode { get; set; } = false;
        public string? GatewayTarget { get; set; }
    }

    // WebSocket stream health tracking
    public class WebSocketStreamHealth
    {
        public string ConnectionState { get; set; } = "good"; // "good", "poor", "disconnected"
        public int ConsecutiveFailures { get; set; } = 0;
        public int ConsecutiveSuccesses { get; set; } = 0;
        public DateTime LastSuccessTime { get; set; } = DateTime.UtcNow;
        public DateTime LastFailureTime { get; set; } = DateTime.MinValue;
        public string LastErrorMessage { get; set; } = string.Empty;
        public double SuccessRate { get; set; } = 100.0; // Rolling 10-attempt window
        public List<bool> RecentAttempts { get; set; } = new(); // Last 10 attempts for rolling average
        public WebSocketState? LastWebSocketState { get; set; }
        public string ErrorType { get; set; } = string.Empty; // Latest error type

        // Connection recreation tracking
        public bool ConnectionRecreated { get; set; } = false;
        public DateTime LastConnectionRecreation { get; set; } = DateTime.MinValue;
        public int ConnectionRecreationCount { get; set; } = 0;

        // Performance metrics
        public double AverageLatency { get; set; } = 0.0;
        public long MaxLatency { get; set; } = 0;
        public long MinLatency { get; set; } = long.MaxValue;

        // Frame-specific health metrics
        public bool IsFrameMode { get; set; } = false;
        public double AverageFrameSize { get; set; } = 0.0;
        public long MaxFrameSize { get; set; } = 0;
        public long MinFrameSize { get; set; } = long.MaxValue;
        public double AverageFrameRenderTime { get; set; } = 0.0;
        public long MaxFrameRenderTime { get; set; } = 0;
        public long MinFrameRenderTime { get; set; } = long.MaxValue;
        public string CurrentFrameLayoutType { get; set; } = string.Empty;
        public string PayloadType { get; set; } = "JSON"; // Track current payload type
        public int FramesSent { get; set; } = 0;
        public int PayloadsSent { get; set; } = 0;

        // Gateway-specific metrics
        public bool IsGatewayMode { get; set; } = false;
        public string? GatewayTarget { get; set; }
        public int GatewayMessagesSent { get; set; } = 0;

        public void UpdateHealth(WebSocketSendResult result)
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

            // Update frame-specific metrics
            if (result.IsFramePayload)
            {
                IsFrameMode = true;
                FramesSent++;
                PayloadType = "Frame";
                CurrentFrameLayoutType = result.FrameLayoutType ?? string.Empty;

                // Track frame size metrics
                if (result.FrameSizeBytes.HasValue && result.FrameSizeBytes.Value > 0)
                {
                    var frameSize = result.FrameSizeBytes.Value;
                    AverageFrameSize = AverageFrameSize == 0 ? frameSize :
                        (AverageFrameSize * 0.8) + (frameSize * 0.2); // Weighted average
                    MaxFrameSize = Math.Max(MaxFrameSize, frameSize);
                    MinFrameSize = MinFrameSize == long.MaxValue ? frameSize : Math.Min(MinFrameSize, frameSize);
                }

                // Track frame render time metrics
                if (result.FrameRenderTimeMs.HasValue && result.FrameRenderTimeMs.Value > 0)
                {
                    var renderTime = result.FrameRenderTimeMs.Value;
                    AverageFrameRenderTime = AverageFrameRenderTime == 0 ? renderTime :
                        (AverageFrameRenderTime * 0.8) + (renderTime * 0.2); // Weighted average
                    MaxFrameRenderTime = Math.Max(MaxFrameRenderTime, renderTime);
                    MinFrameRenderTime = MinFrameRenderTime == long.MaxValue ? renderTime : Math.Min(MinFrameRenderTime, renderTime);
                }
            }
            else
            {
                PayloadsSent++;
                PayloadType = result.PayloadType;
            }

            // Update gateway metrics
            if (result.IsGatewayMode)
            {
                IsGatewayMode = true;
                GatewayTarget = result.GatewayTarget;
                GatewayMessagesSent++;
            }

            if (result.Success)
            {
                ConsecutiveSuccesses++;
                ConsecutiveFailures = 0;
                LastSuccessTime = DateTime.UtcNow;
                LastWebSocketState = result.ConnectionState;
                ErrorType = string.Empty;
                LastErrorMessage = string.Empty;
            }
            else
            {
                ConsecutiveFailures++;
                ConsecutiveSuccesses = 0;
                LastFailureTime = DateTime.UtcNow;
                LastWebSocketState = result.ConnectionState;
                ErrorType = result.ErrorType;
                LastErrorMessage = result.ErrorMessage;
            }

            // Track connection recreation events
            if (result.ConnectionRecreated)
            {
                ConnectionRecreated = true;
                LastConnectionRecreation = DateTime.UtcNow;
                ConnectionRecreationCount++;
            }

            // Determine connection state
            DetermineConnectionState();
        }

        private void DetermineConnectionState()
        {
            // Good: High success rate and no recent failures
            if (SuccessRate >= 95.0 && ConsecutiveFailures == 0)
            {
                ConnectionState = "good";
            }
            // Poor: Moderate success rate or some failures but still functional
            else if (SuccessRate >= 70.0 || (ConsecutiveFailures > 0 && ConsecutiveFailures < 2))
            {
                ConnectionState = "poor";
            }
            // Disconnected: Low success rate or sustained failures
            else
            {
                ConnectionState = "disconnected";
            }

            // Special cases for connection issues
            if (ConnectionRecreated && SuccessRate < 90.0)
            {
                ConnectionState = "poor"; // Connection recreation indicates instability
            }

            // Consider latency in health assessment
            if (ConnectionState == "good" && AverageLatency > 100)
            {
                ConnectionState = "poor";
            }

            // Frame-specific health considerations
            if (IsFrameMode && ConnectionState == "good")
            {
                // Consider frame rendering performance in health assessment
                if (AverageFrameRenderTime > 500) // Frame rendering taking too long
                {
                    ConnectionState = "poor";
                }

                // Large frames might indicate potential issues
                if (AverageFrameSize > 500000) // 500KB frames might be too large
                {
                    Console.WriteLine($"[WEBSOCKET_STREAM_HEALTH] ⚠️ Large average frame size detected: {AverageFrameSize:F0} bytes");
                }
            }
        }

        // Helper method to get frame-specific health summary
        public object GetFrameHealthSummary()
        {
            if (!IsFrameMode)
            {
                return new { Message = "Not in frame mode" };
            }

            return new
            {
                FrameMode = IsFrameMode,
                FrameLayoutType = CurrentFrameLayoutType,
                FramesSent,
                AverageFrameSize = $"{AverageFrameSize:F0} bytes",
                FrameSizeRange = $"{(MinFrameSize == long.MaxValue ? 0 : MinFrameSize)} - {MaxFrameSize} bytes",
                AverageRenderTime = $"{AverageFrameRenderTime:F1}ms",
                RenderTimeRange = $"{(MinFrameRenderTime == long.MaxValue ? 0 : MinFrameRenderTime)} - {MaxFrameRenderTime}ms"
            };
        }

        // Helper method to get gateway-specific health summary
        public object GetGatewayHealthSummary()
        {
            if (!IsGatewayMode)
            {
                return new { Message = "Not in gateway mode" };
            }

            return new
            {
                GatewayMode = IsGatewayMode,
                GatewayTarget,
                GatewayMessagesSent
            };
        }
    }

    public class Service_Send_Data_WebSocket : IDisposable
    {
        private readonly string _deviceMac;
        private readonly Service_Manager_WebSocket_Devices _webSocketManager;
        private readonly bool _isGatewayMode;
        private readonly string? _gatewayTarget;
        private bool _disposed = false;

        // Cache the connection check to avoid repeated lookups
        private DateTime _lastConnectionCheck = DateTime.MinValue;
        private bool _lastConnectionResult = false;
        private readonly TimeSpan _connectionCheckCacheTime = TimeSpan.FromSeconds(1);

        public Service_Send_Data_WebSocket(
            string deviceMac,
            Service_Manager_WebSocket_Devices webSocketManager,
            bool isGatewayMode = false,
            string? gatewayTarget = null)
        {
            _deviceMac = deviceMac;
            _webSocketManager = webSocketManager;
            _isGatewayMode = isGatewayMode;
            _gatewayTarget = gatewayTarget;

            Console.WriteLine($"[SERVICE_SEND_DATA_WEBSOCKET] Created WebSocket sender for {deviceMac}" +
                             (_isGatewayMode ? $" (Gateway mode, target: {gatewayTarget})" : ""));
        }

        public Task<(bool Success, string ResponseMessage)> SendPayloadAsync(string payload)
        {
            try
            {
                if (_disposed)
                    return Task.FromResult((false, "WebSocket sender has been disposed."));

                if (string.IsNullOrEmpty(payload))
                    return Task.FromResult((false, "Payload cannot be null or empty."));

                // Convert string to UTF-8 bytes and send as binary
                byte[] payloadBytes = Encoding.UTF8.GetBytes(payload);
                return SendPayloadAsync(payloadBytes);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_SEND_DATA_WEBSOCKET] Error converting string payload: {ex.Message}");
                return Task.FromResult((false, ex.Message));
            }
        }

        public async Task<(bool Success, string ResponseMessage)> SendPayloadAsync(byte[] payloadBytes)
        {
            var result = await SendPayloadWithHealthAsync(payloadBytes);
            return (result.Success, result.ResponseMessage);
        }

        public async Task<WebSocketSendResult> SendPayloadWithHealthAsync(byte[] payloadBytes)
        {
            if (_disposed)
                throw new ObjectDisposedException(nameof(Service_Send_Data_WebSocket));

            if (payloadBytes == null || payloadBytes.Length == 0)
                return new WebSocketSendResult
                {
                    Success = false,
                    ErrorType = "invalid_payload",
                    ErrorMessage = "Payload cannot be null or empty."
                };

            var stopwatch = Stopwatch.StartNew();

            try
            {
                // Optimized connection check - cache result for 1 second to avoid repeated lookups
                var now = DateTime.UtcNow;
                if (now - _lastConnectionCheck > _connectionCheckCacheTime)
                {
                    _lastConnectionResult = _webSocketManager.IsDeviceConnected(_deviceMac);
                    _lastConnectionCheck = now;
                }

                if (!_lastConnectionResult)
                {
                    // Force refresh the connection check on failure
                    _lastConnectionResult = _webSocketManager.IsDeviceConnected(_deviceMac);
                    _lastConnectionCheck = now;

                    if (!_lastConnectionResult)
                    {
                        stopwatch.Stop();
                        return new WebSocketSendResult
                        {
                            Success = false,
                            ErrorType = "not_connected",
                            ErrorMessage = $"Device {_deviceMac} is not connected",
                            LatencyMs = stopwatch.ElapsedMilliseconds,
                            IsGatewayMode = _isGatewayMode,
                            GatewayTarget = _gatewayTarget
                        };
                    }
                }

                byte[] messageBytes;

                if (_isGatewayMode)
                {
                    // Gateway mode: wrap payload for ESP-NOW forwarding
                    var gatewayMessage = new
                    {
                        type = "gateway-forward",
                        target = _gatewayTarget,
                        protocol = "esp-now",
                        payload = Convert.ToBase64String(payloadBytes),
                        timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                    };

                    string jsonMessage = JsonSerializer.Serialize(gatewayMessage);
                    messageBytes = Encoding.UTF8.GetBytes(jsonMessage);
                }
                else
                {
                    // Direct mode: send raw payload directly to ESP32
                    messageBytes = payloadBytes;
                }

                // Send via WebSocket - single call, no additional checks
                var sendResult = await _webSocketManager.SendDataToDeviceAsync(_deviceMac, messageBytes);

                stopwatch.Stop();

                if (sendResult.success)
                {
                    return new WebSocketSendResult
                    {
                        Success = true,
                        LatencyMs = stopwatch.ElapsedMilliseconds,
                        ResponseMessage = "Message sent",
                        ConnectionState = sendResult.connectionState,
                        IsGatewayMode = _isGatewayMode,
                        GatewayTarget = _gatewayTarget
                    };
                }
                else
                {
                    // Invalidate connection cache on failure
                    _lastConnectionResult = false;

                    return new WebSocketSendResult
                    {
                        Success = false,
                        ErrorType = sendResult.errorType ?? "send_failed",
                        ErrorMessage = sendResult.errorMessage ?? "Failed to send WebSocket message",
                        LatencyMs = stopwatch.ElapsedMilliseconds,
                        ConnectionState = sendResult.connectionState,
                        IsGatewayMode = _isGatewayMode,
                        GatewayTarget = _gatewayTarget
                    };
                }
            }
            catch (Exception ex)
            {
                stopwatch.Stop();
                Console.WriteLine($"[SERVICE_SEND_DATA_WEBSOCKET] Error sending payload to {_deviceMac}: {ex.Message}");

                // Invalidate connection cache on exception
                _lastConnectionResult = false;

                return new WebSocketSendResult
                {
                    Success = false,
                    ErrorType = "send_exception",
                    ErrorMessage = ex.Message,
                    LatencyMs = stopwatch.ElapsedMilliseconds,
                    IsGatewayMode = _isGatewayMode,
                    GatewayTarget = _gatewayTarget
                };
            }
        }

        public void Dispose()
        {
            if (!_disposed)
            {
                _disposed = true;
                Console.WriteLine($"[SERVICE_SEND_DATA_WEBSOCKET] Disposed WebSocket sender for {_deviceMac}");
            }
        }
    }
}