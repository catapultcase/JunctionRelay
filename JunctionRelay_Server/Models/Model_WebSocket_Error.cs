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
    public class Model_WebSocket_Error : Model_WebSocket_Base_Message
    {
        [JsonPropertyName("data")]
        public ErrorData Data { get; set; } = new();

        public class ErrorData
        {
            [JsonPropertyName("errorCode")]
            public string ErrorCode { get; set; } = string.Empty;

            [JsonPropertyName("errorMessage")]
            public string ErrorMessage { get; set; } = string.Empty;

            [JsonPropertyName("originalRequestId")]
            public string? OriginalRequestId { get; set; }

            [JsonPropertyName("severity")]
            public string Severity { get; set; } = "Error"; // "Info", "Warning", "Error", "Critical"
        }
    }
}