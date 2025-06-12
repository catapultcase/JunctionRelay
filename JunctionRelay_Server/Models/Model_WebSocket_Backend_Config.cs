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
    public class Model_WebSocket_Backend_Config : Model_WebSocket_Base_Message
    {
        [JsonPropertyName("data")]
        public BackendConfigData Data { get; set; } = new();

        public class BackendConfigData
        {
            [JsonPropertyName("backendVersion")]
            public string BackendVersion { get; set; } = string.Empty;

            [JsonPropertyName("healthReportInterval")]
            public int HealthReportIntervalMs { get; set; } = 60000; // Default 1 minute

            [JsonPropertyName("heartbeatInterval")]
            public int HeartbeatIntervalMs { get; set; } = 30000; // Default 30 seconds

            [JsonPropertyName("enablePayloadAck")]
            public bool EnablePayloadAck { get; set; } = false;

            [JsonPropertyName("maxReconnectAttempts")]
            public int MaxReconnectAttempts { get; set; } = 5;

            [JsonPropertyName("reconnectDelayMs")]
            public int ReconnectDelayMs { get; set; } = 5000;
        }
    }
}