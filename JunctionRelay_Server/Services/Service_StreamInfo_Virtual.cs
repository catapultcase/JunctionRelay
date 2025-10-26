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

namespace JunctionRelayServer.Services
{
    public class Service_StreamInfo_Virtual
    {
        // Core stream properties
        public required string DeviceName { get; set; }
        public required int ScreenId { get; set; }
        public required string ScreenName { get; set; }
        public required int SensorsCount { get; set; }
        public required int Rate { get; set; }
        public required string Status { get; set; }
        public required CancellationTokenSource Cts { get; set; }
        public required long Latency { get; set; }
        public required DateTime LastGeneratedTime { get; set; }
        public required string Protocol { get; set; }

        // Blit mode support
        public bool IsBlitMode { get; set; } = false;
        public int CanvasWidth { get; set; } = 400;
        public int CanvasHeight { get; set; } = 1280;

        // Frame data (for blit mode)
        public byte[]? LastGeneratedFrameBytes { get; private set; }
        public long? LastFrameSize { get; private set; }
        public DateTime? LastFrameGeneratedTime { get; private set; }
        public string? LastFrameLayoutType { get; private set; }

        // Frame rendering metrics
        public double AverageFrameRenderTime { get; private set; }
        public long MaxFrameRenderTime { get; private set; }
        public long MinFrameRenderTime { get; private set; } = long.MaxValue;
        private readonly Queue<long> _renderTimes = new(50); // Keep last 50 render times

        // Payload generation tracking
        public long PayloadsGenerated { get; private set; } = 0;

        // Payload tracking for UI and virtual screens (to match other StreamInfo classes)
        public string ConfigPayloadPrefix { get; set; } = string.Empty;
        public string ConfigPayloadJson { get; private set; } = string.Empty;
        public string LastSentPayloadPrefix { get; set; } = string.Empty;
        public string LastSentPayloadJson { get; private set; } = string.Empty;
        public string CompressedConfigPayloadPrefix { get; private set; } = string.Empty;
        public string CompressedLastSentPayloadPrefix { get; private set; } = string.Empty;

        // Health information - Updated to match new architecture
        public Service_StreamHealth_Virtual Health { get; } = new();

        // Thread-safe frame and payload operations
        private readonly object _frameLock = new();
        private readonly object _payloadLock = new();

        public void UpdateLastGeneratedFrame(byte[] frameData, string layoutType, DateTime generatedTime)
        {
            lock (_frameLock)
            {
                // Only allocate new array if size changed (reduces GC pressure)
                if (LastGeneratedFrameBytes == null || LastGeneratedFrameBytes.Length != frameData.Length)
                {
                    LastGeneratedFrameBytes = new byte[frameData.Length];
                }
                Array.Copy(frameData, LastGeneratedFrameBytes, frameData.Length);
                LastFrameSize = frameData.Length;
                LastFrameGeneratedTime = generatedTime;
                LastFrameLayoutType = layoutType;
                PayloadsGenerated++;

                // Update health metrics for frames
                Health.FramesSent++;
                Health.UpdateFrameSize(frameData.Length);
            }
        }

        public void UpdateFrameRenderMetrics(long renderTimeMs)
        {
            lock (_frameLock)
            {
                _renderTimes.Enqueue(renderTimeMs);
                if (_renderTimes.Count > 50)
                    _renderTimes.Dequeue();

                AverageFrameRenderTime = _renderTimes.Average();
                MaxFrameRenderTime = Math.Max(MaxFrameRenderTime, renderTimeMs);
                MinFrameRenderTime = Math.Min(MinFrameRenderTime, renderTimeMs);

                // Update health metrics for render time
                Health.UpdateFrameRenderTime(renderTimeMs);
            }
        }

        public byte[]? GetLastGeneratedFrameCopy()
        {
            lock (_frameLock)
            {
                if (LastGeneratedFrameBytes == null) return null;

                var copy = new byte[LastGeneratedFrameBytes.Length];
                Array.Copy(LastGeneratedFrameBytes, copy, LastGeneratedFrameBytes.Length);
                return copy;
            }
        }

        public void ClearLastFrame()
        {
            lock (_frameLock)
            {
                LastGeneratedFrameBytes = null;
                LastFrameSize = null;
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
    }

    public class Service_StreamHealth_Virtual
    {
        public string ConnectionState { get; set; } = "good";
        public double SuccessRate { get; set; } = 100.0;
        public string? LastErrorMessage { get; set; }
        public string? ErrorType { get; set; }
        public int ConsecutiveFailures { get; set; } = 0;
        public int ConsecutiveSuccesses { get; set; } = 0;
        public double AverageLatency { get; set; } = 0.0;
        public DateTime? LastSuccessTime { get; set; }
        public DateTime? LastFailureTime { get; set; }

        // Frame mode properties to match WebSocket manager
        public bool IsFrameMode { get; set; } = false;
        public string PayloadType { get; set; } = "JSON";
        public int FramesSent { get; set; } = 0;
        public int PayloadsSent { get; set; } = 0;
        public string CurrentFrameLayoutType { get; set; } = "";
        public double AverageFrameSize { get; set; } = 0.0;
        public long MaxFrameSize { get; set; } = 0;
        public long MinFrameSize { get; set; } = 0;
        public double AverageFrameRenderTime { get; set; } = 0.0;
        public long MaxFrameRenderTime { get; set; } = 0;
        public long MinFrameRenderTime { get; set; } = 0;

        // Frame size tracking
        private readonly Queue<long> _frameSizes = new(50);
        private readonly Queue<long> _renderTimes = new(50);

        // Update health based on result from virtual stream manager
        public void UpdateHealth(VirtualStreamHealthResult result)
        {
            if (result.Success)
            {
                ConsecutiveSuccesses++;
                ConsecutiveFailures = 0;
                LastSuccessTime = DateTime.UtcNow;
                ErrorType = null;
                LastErrorMessage = null;
                PayloadsSent++;
            }
            else
            {
                ConsecutiveFailures++;
                ConsecutiveSuccesses = 0;
                LastFailureTime = DateTime.UtcNow;
                ErrorType = result.ErrorType;
                LastErrorMessage = result.ErrorMessage;
            }

            // Update latency
            UpdateLatency(result.LatencyMs);

            // Update payload type
            PayloadType = result.PayloadType;

            UpdateConnectionState();
        }

        public void UpdateLatency(long latencyMs)
        {
            // Simple running average for latency
            AverageLatency = (AverageLatency + latencyMs) / 2.0;
        }

        public void UpdateFrameSize(long sizeBytes)
        {
            lock (_frameSizes)
            {
                _frameSizes.Enqueue(sizeBytes);
                if (_frameSizes.Count > 50)
                    _frameSizes.Dequeue();

                AverageFrameSize = _frameSizes.Average();
                MaxFrameSize = Math.Max(MaxFrameSize, sizeBytes);

                if (MinFrameSize == 0 || sizeBytes < MinFrameSize)
                    MinFrameSize = sizeBytes;
            }
        }

        public void UpdateFrameRenderTime(long renderTimeMs)
        {
            lock (_renderTimes)
            {
                _renderTimes.Enqueue(renderTimeMs);
                if (_renderTimes.Count > 50)
                    _renderTimes.Dequeue();

                AverageFrameRenderTime = _renderTimes.Average();
                MaxFrameRenderTime = Math.Max(MaxFrameRenderTime, renderTimeMs);

                if (MinFrameRenderTime == 0 || renderTimeMs < MinFrameRenderTime)
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
                sizeRange = $"{MinFrameSize} - {MaxFrameSize} bytes",
                renderTimeRange = $"{MinFrameRenderTime} - {MaxFrameRenderTime} ms"
            };
        }

        // Health calculation based on consecutive failures
        private void UpdateConnectionState()
        {
            ConnectionState = ConsecutiveFailures switch
            {
                0 => "good",
                > 0 and <= 3 => "poor",
                _ => "disconnected"
            };

            // Calculate success rate based on recent history
            var totalAttempts = ConsecutiveSuccesses + ConsecutiveFailures;
            if (totalAttempts > 0)
            {
                SuccessRate = (double)ConsecutiveSuccesses / totalAttempts * 100.0;
            }
        }

        public void RecordSuccess()
        {
            ConsecutiveSuccesses++;
            ConsecutiveFailures = 0;
            LastSuccessTime = DateTime.UtcNow;
            ErrorType = null;
            LastErrorMessage = null;
            PayloadsSent++;
            UpdateConnectionState();
        }

        public void RecordFailure(string errorType, string errorMessage)
        {
            ConsecutiveFailures++;
            ConsecutiveSuccesses = 0;
            LastFailureTime = DateTime.UtcNow;
            ErrorType = errorType;
            LastErrorMessage = errorMessage;
            UpdateConnectionState();
        }
    }
}