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
using Newtonsoft.Json;

namespace JunctionRelayServer.Models
{
    public class Model_Device_Preferences
    {
        [JsonProperty("connMode")]
        public required string ConnMode { get; set; }

        [JsonProperty("wifiSSID")]
        public required string WifiSSID { get; set; }

        [JsonProperty("wifiPassword")]
        public required string WifiPassword { get; set; }

        [JsonProperty("mqttBroker")]
        public required string MqttBroker { get; set; }

        [JsonProperty("mqttUsername")]
        public required string MqttUsername { get; set; }

        [JsonProperty("mqttPassword")]
        public required string MqttPassword { get; set; }

        [JsonProperty("rotation")]
        public int Rotation { get; set; }

        [JsonProperty("swapBlueGreen")]
        public bool? SwapBlueGreen { get; set; }

        [JsonProperty("restart")]
        public bool? Restart { get; set; }

        [JsonProperty("externalNeoPixelsData1")]
        public string? ExternalNeoPixelsData1 { get; set; }

        [JsonProperty("externalNeoPixelsData2")]
        public string? ExternalNeoPixelsData2 { get; set; }
    }
}