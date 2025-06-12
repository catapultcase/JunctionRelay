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

using System.Text.Json.Serialization;

namespace JunctionRelayServer.Models
{
    public class Model_WebSocket_Payload_Ack : Model_WebSocket_Base_Message
    {
        [JsonPropertyName("data")]
        public PayloadAckData Data { get; set; } = new();

        public class PayloadAckData
        {
            [JsonPropertyName("payloadId")]
            public string PayloadId { get; set; } = string.Empty;

            [JsonPropertyName("payloadType")]
            public string PayloadType { get; set; } = string.Empty; // "sensor", "config", etc.

            [JsonPropertyName("success")]
            public bool Success { get; set; }

            [JsonPropertyName("processingTimeMs")]
            public long? ProcessingTimeMs { get; set; }

            [JsonPropertyName("errorMessage")]
            public string? ErrorMessage { get; set; }

            [JsonPropertyName("receivedAt")]
            public DateTime ReceivedAt { get; set; } = DateTime.UtcNow;
        }
    }
}