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

namespace JunctionRelayServer.Models
{
    public class Model_StreamHealth_DTO
    {
        // Common health metrics (all protocols)
        public string ConnectionState { get; set; } = "unknown";
        public double SuccessRate { get; set; } = 0.0;
        public string? LastErrorMessage { get; set; }
        public string? ErrorType { get; set; }
        public int ConsecutiveFailures { get; set; } = 0;
        public int ConsecutiveSuccesses { get; set; } = 0;
        public double AverageLatency { get; set; } = 0.0;
        public long MaxLatency { get; set; } = 0;
        public long MinLatency { get; set; } = 0;
        public DateTime LastSuccessTime { get; set; } = DateTime.MinValue;
        public DateTime LastFailureTime { get; set; } = DateTime.MinValue;

        // Frame mode metrics (all protocols)
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

        // Protocol-specific: WebSocket
        public bool ConnectionRecreated { get; set; } = false;
        public string? LastWebSocketState { get; set; }
        public int ConnectionRecreationCount { get; set; } = 0;

        // Protocol-specific: HTTP
        public int PoolRecreationCount { get; set; } = 0;

        // Protocol-specific: COM
        public string? ComPort { get; set; }

        // Protocol-specific: MQTT
        public int AcknowledgmentTimeouts { get; set; } = 0;
        public int PublishFailures { get; set; } = 0;
        public Dictionary<string, double>? TopicLatencies { get; set; }

        // Gateway mode metrics
        public bool IsGatewayMode { get; set; } = false;
        public string? GatewayTarget { get; set; }
        public int GatewayMessagesSent { get; set; } = 0;

        // Helper methods for consistency
        public string GetFrameHealthSummary()
        {
            if (!IsFrameMode) return "N/A";
            return $"{FramesSent} frames, avg {AverageFrameSize:F0} bytes, {AverageFrameRenderTime:F1}ms render";
        }

        public string GetGatewayHealthSummary()
        {
            if (!IsGatewayMode) return "N/A";
            return $"{GatewayMessagesSent} messages to {GatewayTarget}";
        }
    }
}
