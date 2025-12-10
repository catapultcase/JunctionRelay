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
    public class Model_StreamInfo_DTO
    {
        // Stream identification
        public string StreamKey { get; set; } = "unknown";
        public string Protocol { get; set; } = "Unknown";
        public string DeviceName { get; set; } = "Unknown Device";
        public string DeviceMac { get; set; } = "Unknown";
        public int ScreenId { get; set; } = 0;
        public string ScreenName { get; set; } = "Unknown Screen";
        public string Status { get; set; } = "Unknown";

        // Stream metrics
        public int Rate { get; set; } = 0;
        public long Latency { get; set; } = 0;
        public DateTime LastSentTime { get; set; } = DateTime.MinValue;
        public int SensorsCount { get; set; } = 0;

        // Payload data
        public string ConfigPayloadPrefix { get; set; } = "";
        public string ConfigPayloadJson { get; set; } = "{}";
        public string LastSentPayloadPrefix { get; set; } = "";
        public string LastSentPayloadJson { get; set; } = "{}";

        // Compressed payload data
        public string CompressedConfigPayloadPrefix { get; set; } = "";
        public string CompressedLastSentPayloadPrefix { get; set; } = "";
        public string ConfigPayloadCompressed { get; set; } = "";
        public string LastSentPayloadCompressed { get; set; } = "";

        // Frame data
        public bool HasLastFrame { get; set; } = false;
        public int? LastFrameSize { get; set; }
        public DateTime? LastFrameTime { get; set; }
        public string LastFrameLayoutType { get; set; } = "";

        // Gateway mode
        public bool IsGatewayMode { get; set; } = false;
        public string? GatewayTarget { get; set; }

        // Compression
        public bool CompressionEnabled { get; set; } = false;

        // MQTT-specific fields
        public string? MqttConfigPayloadPrefix { get; set; }
        public string? MqttConfigPayloadJson { get; set; }
        public string? CompressedMqttConfigPayloadPrefix { get; set; }
        public string? MqttConfigPayloadCompressed { get; set; }

        // Health metrics
        public Model_StreamHealth_DTO? Health { get; set; }
    }
}
