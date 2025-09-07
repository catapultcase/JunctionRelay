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

        // NEW: Blit mode support
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

        // Payload data (for non-blit modes)
        public string? ConfigPayloadJson { get; private set; }
        public string? LastGeneratedPayloadJson { get; private set; }

        // Payload generation tracking
        public long PayloadsGenerated { get; private set; } = 0;

        // Health information
        public Service_StreamHealth_Virtual Health { get; } = new();

        // Thread-safe frame update
        private readonly object _frameLock = new();

        public void UpdateLastGeneratedFrame(byte[] frameData, string layoutType, DateTime generatedTime)
        {
            lock (_frameLock)
            {
                LastGeneratedFrameBytes = new byte[frameData.Length];
                Array.Copy(frameData, LastGeneratedFrameBytes, frameData.Length);
                LastFrameSize = frameData.Length;
                LastFrameGeneratedTime = generatedTime;
                LastFrameLayoutType = layoutType;
                PayloadsGenerated++;
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
            ConfigPayloadJson = jsonPayload;
        }

        public void UpdateLastGeneratedPayload(string jsonPayload)
        {
            LastGeneratedPayloadJson = jsonPayload;
            PayloadsGenerated++;
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

        // Health calculation based on consecutive failures
        public void UpdateConnectionState()
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