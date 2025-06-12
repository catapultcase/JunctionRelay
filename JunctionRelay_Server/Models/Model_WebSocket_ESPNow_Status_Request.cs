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
    public class Model_WebSocket_ESPNow_Status_Request : Model_WebSocket_Base_Message
    {
        [JsonPropertyName("data")]
        public ESPNowStatusRequestData Data { get; set; } = new();

        public class ESPNowStatusRequestData
        {
            [JsonPropertyName("requestId")]
            public string RequestId { get; set; } = string.Empty;

            [JsonPropertyName("includePeerDetails")]
            public bool IncludePeerDetails { get; set; } = true;

            [JsonPropertyName("includeMessageHistory")]
            public bool IncludeMessageHistory { get; set; } = false;
        }
    }
}