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

namespace JunctionRelayServer.Models
{
    public class Model_WebSocket_ESPNow_Status : Model_WebSocket_Base_Message
    {
        [JsonPropertyName("data")]
        public ESPNowData Data { get; set; } = new();

        public class ESPNowData
        {
            [JsonPropertyName("isInitialized")]
            public bool IsInitialized { get; set; }

            [JsonPropertyName("peerCount")]
            public int PeerCount { get; set; }

            [JsonPropertyName("onlinePeers")]
            public List<string> OnlinePeers { get; set; } = new();

            [JsonPropertyName("offlinePeers")]
            public List<string> OfflinePeers { get; set; } = new();

            [JsonPropertyName("degradedPeers")]
            public List<string> DegradedPeers { get; set; } = new();

            [JsonPropertyName("messagesSent")]
            public long MessagesSent { get; set; }

            [JsonPropertyName("messagesReceived")]
            public long MessagesReceived { get; set; }

            [JsonPropertyName("sendErrors")]
            public long SendErrors { get; set; }

            [JsonPropertyName("receiveErrors")]
            public long ReceiveErrors { get; set; }

            [JsonPropertyName("channel")]
            public int Channel { get; set; }

            [JsonPropertyName("peerDetails")]
            public List<PeerDetail> PeerDetails { get; set; } = new();
        }

        public class PeerDetail
        {
            [JsonPropertyName("mac")]
            public string Mac { get; set; } = string.Empty;

            [JsonPropertyName("name")]
            public string Name { get; set; } = string.Empty;

            [JsonPropertyName("isActive")]
            public bool IsActive { get; set; }

            [JsonPropertyName("lastSeen")]
            public DateTime LastSeen { get; set; }

            [JsonPropertyName("rssi")]
            public int Rssi { get; set; }

            [JsonPropertyName("consecutiveFailures")]
            public int ConsecutiveFailures { get; set; }

            [JsonPropertyName("lastSuccessfulSend")]
            public DateTime? LastSuccessfulSend { get; set; }
        }
    }
}