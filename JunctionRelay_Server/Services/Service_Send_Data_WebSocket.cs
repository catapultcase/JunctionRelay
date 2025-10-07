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
    // Simplified WebSocket send result - purely for operation results
    public class WebSocketSendResult
    {
        public bool Success { get; set; }
        public string ErrorType { get; set; } = string.Empty;
        public string ErrorMessage { get; set; } = string.Empty;
        public long LatencyMs { get; set; }
        public int BytesSent { get; set; }
        public bool ConnectionRecreated { get; set; } = false;
        public string ResponseMessage { get; set; } = string.Empty;
        public WebSocketState? ConnectionState { get; set; }

        // Frame-specific data that gets passed to health tracking
        public bool IsFramePayload { get; set; } = false;
        public int? FrameSizeBytes { get; set; }
        public long? FrameRenderTimeMs { get; set; }
        public string? FrameLayoutType { get; set; }
        public string PayloadType { get; set; } = "JSON";

        // Gateway-specific data
        public bool IsGatewayMode { get; set; } = false;
        public string? GatewayTarget { get; set; }

        // Chunking data
        public bool WasChunked { get; set; } = false;
        public int ChunkCount { get; set; } = 0;
        public int TotalChunkedSize { get; set; } = 0;
    }

    // WebSocket stream health tracking - matches COM pattern
    public class WebSocketStreamHealth
    {
        public string ConnectionState { get; set; } = "good";
        public int ConsecutiveFailures { get; set; } = 0;
        public int ConsecutiveSuccesses { get; set; } = 0;
        public DateTime LastSuccessTime { get; set; } = DateTime.UtcNow;
        public DateTime LastFailureTime { get; set; } = DateTime.MinValue;
        public string LastErrorMessage { get; set; } = string.Empty;
        public double SuccessRate { get; set; } = 100.0;
        public List<bool> RecentAttempts { get; set; } = new();
        public WebSocketState? LastWebSocketState { get; set; }
        public string ErrorType { get; set; } = string.Empty;

        // Connection recreation tracking
        public bool ConnectionRecreated { get; set; } = false;
        public DateTime LastConnectionRecreation { get; set; } = DateTime.MinValue;
        public int ConnectionRecreationCount { get; set; } = 0;

        // Performance metrics
        public double AverageLatency { get; set; } = 0.0;
        public long MaxLatency { get; set; } = 0;
        public long MinLatency { get; set; } = long.MaxValue;
        public long TotalBytesSent { get; set; } = 0;

        // Frame-specific health metrics
        public bool IsFrameMode { get; set; } = false;
        public double AverageFrameSize { get; set; } = 0.0;
        public long MaxFrameSize { get; set; } = 0;
        public long MinFrameSize { get; set; } = long.MaxValue;
        public double AverageFrameRenderTime { get; set; } = 0.0;
        public long MaxFrameRenderTime { get; set; } = 0;
        public long MinFrameRenderTime { get; set; } = long.MaxValue;
        public string CurrentFrameLayoutType { get; set; } = string.Empty;
        public string PayloadType { get; set; } = "JSON";
        public int FramesSent { get; set; } = 0;
        public int PayloadsSent { get; set; } = 0;

        // Gateway-specific metrics
        public bool IsGatewayMode { get; set; } = false;
        public string? GatewayTarget { get; set; }
        public int GatewayMessagesSent { get; set; } = 0;

        // WebSocket-specific metrics
        public int ChunkedMessagesSent { get; set; } = 0;
        public int TotalChunksSent { get; set; } = 0;
        public double AverageChunksPerMessage { get; set; } = 0.0;
        public long LargestChunkedMessage { get; set; } = 0;

        public void UpdateHealth(WebSocketSendResult result)
        {
            RecentAttempts.Add(result.Success);
            if (RecentAttempts.Count > 10)
                RecentAttempts.RemoveAt(0);

            SuccessRate = RecentAttempts.Count > 0 ?
                RecentAttempts.Count(x => x) * 100.0 / RecentAttempts.Count : 100.0;

            if (result.Success && result.LatencyMs > 0)
            {
                AverageLatency = AverageLatency == 0 ? result.LatencyMs :
                    (AverageLatency * 0.8) + (result.LatencyMs * 0.2);
                MaxLatency = Math.Max(MaxLatency, result.LatencyMs);
                MinLatency = Math.Min(MinLatency, result.LatencyMs);
            }

            if (result.Success && result.BytesSent > 0)
            {
                TotalBytesSent += result.BytesSent;
            }

            // Update chunking metrics
            if (result.WasChunked)
            {
                ChunkedMessagesSent++;
                TotalChunksSent += result.ChunkCount;
                LargestChunkedMessage = Math.Max(LargestChunkedMessage, result.TotalChunkedSize);
                AverageChunksPerMessage = ChunkedMessagesSent > 0 ?
                    (double)TotalChunksSent / ChunkedMessagesSent : 0.0;
            }

            if (result.IsFramePayload)
            {
                IsFrameMode = true;
                FramesSent++;
                PayloadType = "Frame";
                CurrentFrameLayoutType = result.FrameLayoutType ?? string.Empty;

                if (result.FrameSizeBytes.HasValue && result.FrameSizeBytes.Value > 0)
                {
                    var frameSize = result.FrameSizeBytes.Value;
                    AverageFrameSize = AverageFrameSize == 0 ? frameSize :
                        (AverageFrameSize * 0.8) + (frameSize * 0.2);
                    MaxFrameSize = Math.Max(MaxFrameSize, frameSize);
                    MinFrameSize = MinFrameSize == long.MaxValue ? frameSize : Math.Min(MinFrameSize, frameSize);
                }

                if (result.FrameRenderTimeMs.HasValue && result.FrameRenderTimeMs.Value > 0)
                {
                    var renderTime = result.FrameRenderTimeMs.Value;
                    AverageFrameRenderTime = AverageFrameRenderTime == 0 ? renderTime :
                        (AverageFrameRenderTime * 0.8) + (renderTime * 0.2);
                    MaxFrameRenderTime = Math.Max(MaxFrameRenderTime, renderTime);
                    MinFrameRenderTime = MinFrameRenderTime == long.MaxValue ? renderTime : Math.Min(MinFrameRenderTime, renderTime);
                }
            }
            else
            {
                PayloadsSent++;
                PayloadType = result.PayloadType;
            }

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

            if (result.ConnectionRecreated)
            {
                ConnectionRecreated = true;
                LastConnectionRecreation = DateTime.UtcNow;
                ConnectionRecreationCount++;
            }

            DetermineConnectionState();
        }

        private void DetermineConnectionState()
        {
            if (SuccessRate >= 95.0 && ConsecutiveFailures == 0)
            {
                ConnectionState = "good";
            }
            else if (SuccessRate >= 70.0 || (ConsecutiveFailures > 0 && ConsecutiveFailures < 3))
            {
                ConnectionState = "poor";
            }
            else
            {
                ConnectionState = "disconnected";
            }

            if (ConnectionState == "good" && AverageLatency > 200)
            {
                ConnectionState = "poor";
            }

            if (IsFrameMode && ConnectionState == "good")
            {
                if (AverageFrameRenderTime > 1000)
                {
                    ConnectionState = "poor";
                }

                if (AverageFrameSize > 100000)
                {
                    Console.WriteLine($"[WEBSOCKET_STREAM_HEALTH] Large average frame size detected: {AverageFrameSize:F0} bytes");
                }
            }
        }

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
                RenderTimeRange = $"{(MinFrameRenderTime == long.MaxValue ? 0 : MinFrameRenderTime)} - {MaxFrameRenderTime}ms",
                TotalBytesSent = $"{TotalBytesSent:N0} bytes"
            };
        }

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
        private readonly Service_Manager_WebSocket_Client _webSocketManager;
        private readonly bool _isGatewayMode;
        private readonly string? _gatewayTarget;
        private bool _disposed = false;

        // Chunking configuration
        private const int CHUNK_THRESHOLD = 5120; // 5KB threshold
        private const int MAX_CHUNK_SIZE = 4096;  // 4KB max chunk size for ESP safety
        private const int CHUNK_DELAY_MS = 10;    // Small delay between chunks to prevent ESP overflow

        // Cache the connection check to avoid repeated lookups
        private DateTime _lastConnectionCheck = DateTime.MinValue;
        private bool _lastConnectionResult = false;
        private readonly TimeSpan _connectionCheckCacheTime = TimeSpan.FromSeconds(1);

        public Service_Send_Data_WebSocket(
            string deviceMac,
            Service_Manager_WebSocket_Client webSocketManager,
            bool isGatewayMode = false,
            string? gatewayTarget = null)
        {
            _deviceMac = deviceMac;
            _webSocketManager = webSocketManager;
            _isGatewayMode = isGatewayMode;
            _gatewayTarget = gatewayTarget;

            Console.WriteLine($"[SERVICE_SEND_DATA_WEBSOCKET] Created WebSocket sender for {deviceMac}" +
                             (_isGatewayMode ? $" (Gateway mode, target: {gatewayTarget})" : "") +
                             $" with chunking enabled for payloads > {CHUNK_THRESHOLD} bytes");
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
                            BytesSent = 0,
                            IsGatewayMode = _isGatewayMode,
                            GatewayTarget = _gatewayTarget
                        };
                    }
                }

                // Check if payload needs chunking
                if (payloadBytes.Length > CHUNK_THRESHOLD)
                {
                    // Console.WriteLine($"[SERVICE_SEND_DATA_WEBSOCKET] Large payload detected ({payloadBytes.Length} bytes), using chunking");
                    return await SendChunkedPayloadAsync(payloadBytes, stopwatch);
                }
                else
                {
                    // Send as single message for small payloads
                    return await SendSinglePayloadAsync(payloadBytes, stopwatch);
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
                    BytesSent = 0,
                    IsGatewayMode = _isGatewayMode,
                    GatewayTarget = _gatewayTarget
                };
            }
        }

        private async Task<WebSocketSendResult> SendSinglePayloadAsync(byte[] payloadBytes, Stopwatch stopwatch)
        {
            var sendResult = await _webSocketManager.SendDataToDeviceAsync(_deviceMac, payloadBytes);
            stopwatch.Stop();

            if (sendResult.success)
            {
                return new WebSocketSendResult
                {
                    Success = true,
                    LatencyMs = stopwatch.ElapsedMilliseconds,
                    BytesSent = payloadBytes.Length,
                    ResponseMessage = "Message sent",
                    ConnectionState = sendResult.connectionState,
                    IsGatewayMode = _isGatewayMode,
                    GatewayTarget = _gatewayTarget,
                    WasChunked = false,
                    ChunkCount = 1,
                    TotalChunkedSize = payloadBytes.Length
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
                    BytesSent = 0,
                    ConnectionState = sendResult.connectionState,
                    IsGatewayMode = _isGatewayMode,
                    GatewayTarget = _gatewayTarget,
                    WasChunked = false,
                    ChunkCount = 0,
                    TotalChunkedSize = payloadBytes.Length
                };
            }
        }

        private async Task<WebSocketSendResult> SendChunkedPayloadAsync(byte[] payloadBytes, Stopwatch stopwatch)
        {
            try
            {
                // Generate unique message ID for this chunked message
                var messageId = Guid.NewGuid().ToString("N")[..8]; // Use first 8 chars
                var totalChunks = (int)Math.Ceiling((double)payloadBytes.Length / MAX_CHUNK_SIZE);

                // Console.WriteLine($"[SERVICE_SEND_DATA_WEBSOCKET] Sending {payloadBytes.Length} bytes as {totalChunks} chunks (ID: {messageId})");

                // Send chunks sequentially with small delays
                for (int chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++)
                {
                    var startIndex = chunkIndex * MAX_CHUNK_SIZE;
                    var chunkSize = Math.Min(MAX_CHUNK_SIZE, payloadBytes.Length - startIndex);
                    var chunkData = new byte[chunkSize];
                    Array.Copy(payloadBytes, startIndex, chunkData, 0, chunkSize);

                    // Create chunk header with metadata
                    var chunkHeader = new
                    {
                        type = "chunk",
                        messageId = messageId,
                        chunkIndex = chunkIndex,
                        totalChunks = totalChunks,
                        chunkSize = chunkSize,
                        totalSize = payloadBytes.Length,
                        isLast = chunkIndex == totalChunks - 1
                    };

                    var headerJson = JsonSerializer.Serialize(chunkHeader);
                    var headerBytes = Encoding.UTF8.GetBytes(headerJson);

                    // Combine header and chunk data with separator
                    var separator = Encoding.UTF8.GetBytes("|||");
                    var fullChunk = new byte[headerBytes.Length + separator.Length + chunkSize];
                    Array.Copy(headerBytes, 0, fullChunk, 0, headerBytes.Length);
                    Array.Copy(separator, 0, fullChunk, headerBytes.Length, separator.Length);
                    Array.Copy(chunkData, 0, fullChunk, headerBytes.Length + separator.Length, chunkSize);

                    // Send chunk
                    var chunkResult = await _webSocketManager.SendDataToDeviceAsync(_deviceMac, fullChunk);

                    if (!chunkResult.success)
                    {
                        stopwatch.Stop();
                        _lastConnectionResult = false;

                        Console.WriteLine($"[SERVICE_SEND_DATA_WEBSOCKET] Failed to send chunk {chunkIndex + 1}/{totalChunks}: {chunkResult.errorMessage}");

                        return new WebSocketSendResult
                        {
                            Success = false,
                            ErrorType = chunkResult.errorType ?? "chunk_send_failed",
                            ErrorMessage = $"Failed to send chunk {chunkIndex + 1}/{totalChunks}: {chunkResult.errorMessage}",
                            LatencyMs = stopwatch.ElapsedMilliseconds,
                            BytesSent = (chunkIndex * MAX_CHUNK_SIZE) + chunkSize, // Bytes sent before failure
                            ConnectionState = chunkResult.connectionState,
                            IsGatewayMode = _isGatewayMode,
                            GatewayTarget = _gatewayTarget,
                            WasChunked = true,
                            ChunkCount = chunkIndex + 1, // Chunks sent before failure
                            TotalChunkedSize = payloadBytes.Length
                        };
                    }

                    // Console.WriteLine($"[SERVICE_SEND_DATA_WEBSOCKET] Sent chunk {chunkIndex + 1}/{totalChunks} ({chunkSize} bytes)");

                    // Small delay between chunks to prevent ESP buffer overflow
                    if (chunkIndex < totalChunks - 1)
                    {
                        await Task.Delay(CHUNK_DELAY_MS);
                    }
                }

                stopwatch.Stop();

                // Console.WriteLine($"[SERVICE_SEND_DATA_WEBSOCKET] Successfully sent all {totalChunks} chunks ({payloadBytes.Length} bytes total) in {stopwatch.ElapsedMilliseconds}ms");

                return new WebSocketSendResult
                {
                    Success = true,
                    LatencyMs = stopwatch.ElapsedMilliseconds,
                    BytesSent = payloadBytes.Length,
                    ResponseMessage = $"Chunked message sent ({totalChunks} chunks)",
                    ConnectionState = WebSocketState.Open, // Assume good state after successful chunked send
                    IsGatewayMode = _isGatewayMode,
                    GatewayTarget = _gatewayTarget,
                    WasChunked = true,
                    ChunkCount = totalChunks,
                    TotalChunkedSize = payloadBytes.Length
                };
            }
            catch (Exception ex)
            {
                stopwatch.Stop();
                _lastConnectionResult = false;

                Console.WriteLine($"[SERVICE_SEND_DATA_WEBSOCKET] Error during chunked send: {ex.Message}");

                return new WebSocketSendResult
                {
                    Success = false,
                    ErrorType = "chunked_send_exception",
                    ErrorMessage = ex.Message,
                    LatencyMs = stopwatch.ElapsedMilliseconds,
                    BytesSent = 0,
                    IsGatewayMode = _isGatewayMode,
                    GatewayTarget = _gatewayTarget,
                    WasChunked = true,
                    ChunkCount = 0,
                    TotalChunkedSize = payloadBytes.Length
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