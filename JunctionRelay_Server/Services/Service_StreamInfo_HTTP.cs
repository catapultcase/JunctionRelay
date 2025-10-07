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

using System.Text.Json.Serialization;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    public class HttpStreamHealth
    {
        public string ConnectionState { get; set; } = "good";
        public double SuccessRate { get; set; } = 100.0;
        public string? LastErrorMessage { get; set; }
        public string? ErrorType { get; set; }
        public int ConsecutiveFailures { get; set; } = 0;
        public int ConsecutiveSuccesses { get; set; } = 0;
        public bool KeepAlivePoolRecreated { get; set; } = false;
        public int? HttpStatusCode { get; set; }
        public double AverageLatency { get; set; } = 0.0;
        public long MaxLatency { get; set; } = 0;
        public long MinLatency { get; set; } = long.MaxValue;
        public DateTime? LastSuccessTime { get; set; }
        public DateTime? LastFailureTime { get; set; }
        public int PoolRecreationCount { get; set; } = 0;

        // Frame-specific health metrics
        public bool IsFrameMode { get; set; } = false;
        public string PayloadType { get; set; } = "JSON";
        public int FramesSent { get; set; } = 0;
        public int PayloadsSent { get; set; } = 0;
        public string CurrentFrameLayoutType { get; set; } = "";
        public double AverageFrameSize { get; set; } = 0.0;
        public long MaxFrameSize { get; set; } = 0;
        public long MinFrameSize { get; set; } = long.MaxValue;
        public double AverageFrameRenderTime { get; set; } = 0.0;
        public long MaxFrameRenderTime { get; set; } = 0;
        public long MinFrameRenderTime { get; set; } = long.MaxValue;

        // Frame size and render time tracking
        private readonly Queue<long> _frameSizes = new(50);
        private readonly Queue<long> _renderTimes = new(50);
        private readonly Queue<bool> _recentAttempts = new(10);

        public void UpdateHealth(HttpSendResult result)
        {
            // Update recent attempts for success rate calculation
            _recentAttempts.Enqueue(result.Success);
            if (_recentAttempts.Count > 10)
                _recentAttempts.Dequeue();

            SuccessRate = _recentAttempts.Count > 0 ?
                _recentAttempts.Count(x => x) * 100.0 / _recentAttempts.Count : 100.0;

            // Update latency metrics
            if (result.Success && result.LatencyMs > 0)
            {
                AverageLatency = AverageLatency == 0 ? result.LatencyMs :
                    (AverageLatency * 0.8) + (result.LatencyMs * 0.2);
                MaxLatency = Math.Max(MaxLatency, result.LatencyMs);
                MinLatency = Math.Min(MinLatency, result.LatencyMs);
            }

            // Handle frame-specific metrics
            if (result.IsFramePayload)
            {
                IsFrameMode = true;
                FramesSent++;
                PayloadType = "Frame";
                CurrentFrameLayoutType = result.FrameLayoutType ?? "";

                if (result.FrameSizeBytes.HasValue && result.FrameSizeBytes.Value > 0)
                {
                    UpdateFrameSize(result.FrameSizeBytes.Value);
                }

                if (result.FrameRenderTimeMs.HasValue && result.FrameRenderTimeMs.Value > 0)
                {
                    UpdateFrameRenderTime(result.FrameRenderTimeMs.Value);
                }
            }
            else
            {
                PayloadsSent++;
                PayloadType = result.PayloadType;
            }

            // Update connection recreation tracking
            if (result.KeepAlivePoolRecreated)
            {
                KeepAlivePoolRecreated = true;
                PoolRecreationCount++;
            }

            // Note: HttpStatusCode would be set here if available in HttpSendResult

            if (result.Success)
            {
                ConsecutiveSuccesses++;
                ConsecutiveFailures = 0;
                LastSuccessTime = DateTime.UtcNow;
                ErrorType = null;
                LastErrorMessage = null;
            }
            else
            {
                ConsecutiveFailures++;
                ConsecutiveSuccesses = 0;
                LastFailureTime = DateTime.UtcNow;
                ErrorType = result.ErrorType;
                LastErrorMessage = result.ErrorMessage;
            }

            UpdateConnectionState();
        }

        private void UpdateConnectionState()
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

            if (ConnectionState == "good" && AverageLatency > 500)
            {
                ConnectionState = "poor";
            }
        }

        private void UpdateFrameSize(long sizeBytes)
        {
            lock (_frameSizes)
            {
                _frameSizes.Enqueue(sizeBytes);
                if (_frameSizes.Count > 50)
                    _frameSizes.Dequeue();

                AverageFrameSize = _frameSizes.Average();
                MaxFrameSize = Math.Max(MaxFrameSize, sizeBytes);

                if (MinFrameSize == long.MaxValue || sizeBytes < MinFrameSize)
                    MinFrameSize = sizeBytes;
            }
        }

        private void UpdateFrameRenderTime(long renderTimeMs)
        {
            lock (_renderTimes)
            {
                _renderTimes.Enqueue(renderTimeMs);
                if (_renderTimes.Count > 50)
                    _renderTimes.Dequeue();

                AverageFrameRenderTime = _renderTimes.Average();
                MaxFrameRenderTime = Math.Max(MaxFrameRenderTime, renderTimeMs);

                if (MinFrameRenderTime == long.MaxValue || renderTimeMs < MinFrameRenderTime)
                    MinFrameRenderTime = renderTimeMs;
            }
        }

        public object GetFrameHealthSummary()
        {
            if (!IsFrameMode)
            {
                return new { message = "Not in frame mode" };
            }

            return new
            {
                totalFrames = FramesSent,
                averageSize = $"{AverageFrameSize:F1} bytes",
                averageRenderTime = $"{AverageFrameRenderTime:F1} ms",
                sizeRange = $"{(MinFrameSize == long.MaxValue ? 0 : MinFrameSize)} - {MaxFrameSize} bytes",
                renderTimeRange = $"{(MinFrameRenderTime == long.MaxValue ? 0 : MinFrameRenderTime)} - {MaxFrameRenderTime} ms",
                payloadType = PayloadType
            };
        }

        public object GetGatewayHealthSummary()
        {
            return new { message = "Not in gateway mode" };
        }
    }

    public class Service_StreamInfo_HTTP
    {
        public string DeviceName { get; set; } = string.Empty;
        public int Rate { get; set; }
        public string Status { get; set; } = string.Empty;
        public string? Protocol { get; set; }

        [JsonIgnore]
        public CancellationTokenSource Cts { get; set; } = new();

        [JsonIgnore]
        public Service_Send_Data_HTTP? HttpSender { get; set; }

        public int ScreenId { get; set; }
        public string ScreenName { get; set; } = string.Empty;
        public int SensorsCount { get; set; }
        public long Latency { get; set; }
        public DateTime LastSentTime { get; set; }

        // Health tracking
        public HttpStreamHealth Health { get; set; } = new HttpStreamHealth();

        // Gateway mode support
        public bool IsGatewayMode { get; private set; }
        public string? GatewayTarget { get; private set; }

        // Frame data for blit mode
        [JsonIgnore]
        public byte[]? LastSentFrameBytes { get; private set; }
        public DateTime? LastFrameGeneratedTime { get; private set; }
        public int? LastFrameSize => LastSentFrameBytes?.Length;
        public string? LastFrameLayoutType { get; private set; }

        // Payload tracking for UI and virtual screens
        public string ConfigPayloadPrefix { get; set; } = string.Empty;
        public string ConfigPayloadJson { get; private set; } = string.Empty;
        public string LastSentPayloadPrefix { get; set; } = string.Empty;
        public string LastSentPayloadJson { get; private set; } = string.Empty;
        public string CompressedConfigPayloadPrefix { get; private set; } = string.Empty;
        public string CompressedLastSentPayloadPrefix { get; private set; } = string.Empty;

        // Thread-safe frame and payload operations
        private readonly object _frameLock = new();
        private readonly object _payloadLock = new();

        // Constructor with gateway mode support
        public Service_StreamInfo_HTTP(bool compressionEnabled = false, bool isGatewayMode = false, string? gatewayTarget = null)
        {
            IsGatewayMode = isGatewayMode;
            GatewayTarget = gatewayTarget;
        }

        public void UpdateLastSentFrame(byte[] frameBytes, string? layoutType = null)
        {
            lock (_frameLock)
            {
                LastSentFrameBytes = new byte[frameBytes.Length];
                Array.Copy(frameBytes, LastSentFrameBytes, frameBytes.Length);
                LastFrameGeneratedTime = DateTime.UtcNow;
                LastFrameLayoutType = layoutType;
            }
        }

        public byte[]? GetLastSentFrameCopy()
        {
            lock (_frameLock)
            {
                if (LastSentFrameBytes == null) return null;

                var copy = new byte[LastSentFrameBytes.Length];
                Array.Copy(LastSentFrameBytes, copy, LastSentFrameBytes.Length);
                return copy;
            }
        }

        public void ClearLastSentFrame()
        {
            lock (_frameLock)
            {
                LastSentFrameBytes = null;
                LastFrameGeneratedTime = null;
                LastFrameLayoutType = null;
            }
        }

        public void UpdateConfigPayload(string jsonPayload)
        {
            lock (_payloadLock)
            {
                ConfigPayloadJson = jsonPayload ?? string.Empty;
            }
        }

        public void UpdateLastSentPayload(string jsonPayload)
        {
            lock (_payloadLock)
            {
                LastSentPayloadJson = jsonPayload ?? string.Empty;
            }
        }

        public void UpdateCompressedConfigPayloadPrefix(string prefix)
        {
            lock (_payloadLock)
            {
                CompressedConfigPayloadPrefix = prefix ?? string.Empty;
            }
        }

        public void UpdateCompressedLastSentPayloadPrefix(string prefix)
        {
            lock (_payloadLock)
            {
                CompressedLastSentPayloadPrefix = prefix ?? string.Empty;
            }
        }

        public string GetCompressedConfigPayloadPreview()
        {
            lock (_payloadLock)
            {
                if (string.IsNullOrEmpty(CompressedConfigPayloadPrefix))
                    return ConfigPayloadJson;

                return $"[{CompressedConfigPayloadPrefix}] {(ConfigPayloadJson.Length > 200 ? ConfigPayloadJson.Substring(0, 200) + "..." : ConfigPayloadJson)}";
            }
        }

        public string GetCompressedLastSentPayloadPreview()
        {
            lock (_payloadLock)
            {
                if (string.IsNullOrEmpty(CompressedLastSentPayloadPrefix))
                    return LastSentPayloadJson;

                return $"[{CompressedLastSentPayloadPrefix}] {(LastSentPayloadJson.Length > 200 ? LastSentPayloadJson.Substring(0, 200) + "..." : LastSentPayloadJson)}";
            }
        }

        public void Dispose()
        {
            lock (_frameLock)
            {
                lock (_payloadLock)
                {
                    Cts?.Dispose();
                    HttpSender?.Dispose();
                    LastSentFrameBytes = null;
                    LastFrameGeneratedTime = null;
                    LastFrameLayoutType = null;
                    ConfigPayloadJson = string.Empty;
                    LastSentPayloadJson = string.Empty;
                    CompressedConfigPayloadPrefix = string.Empty;
                    CompressedLastSentPayloadPrefix = string.Empty;
                }
            }
        }
    }
}