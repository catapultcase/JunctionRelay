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
    public class Model_WebSocket_Device_Registration : Model_WebSocket_Base_Message
    {
        [JsonPropertyName("data")]
        public DeviceRegistrationData Data { get; set; } = new();

        public class DeviceRegistrationData
        {
            [JsonPropertyName("deviceName")]
            public string DeviceName { get; set; } = string.Empty;

            [JsonPropertyName("firmwareVersion")]
            public string FirmwareVersion { get; set; } = string.Empty;

            [JsonPropertyName("deviceModel")]
            public string DeviceModel { get; set; } = string.Empty;

            [JsonPropertyName("capabilities")]
            public List<string> Capabilities { get; set; } = new();

            [JsonPropertyName("connectionMode")]
            public string ConnectionMode { get; set; } = string.Empty;

            [JsonPropertyName("ipAddress")]
            public string IpAddress { get; set; } = string.Empty;

            [JsonPropertyName("supportedProtocols")]
            public List<string> SupportedProtocols { get; set; } = new();
        }
    }
}