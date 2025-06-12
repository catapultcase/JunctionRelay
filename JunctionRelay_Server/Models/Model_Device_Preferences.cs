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

namespace JunctionRelayServer.Models
{
    public class Model_Device_Preferences
    {
        public string ConnMode { get; set; }
        public string WifiSSID { get; set; }
        public string WifiPassword { get; set; }
        public string MqttBroker { get; set; }
        public string MqttUsername { get; set; }
        public string MqttPassword { get; set; }
        public int Rotation { get; set; }
        public bool? SwapBlueGreen { get; set; }
        public bool? Restart { get; set; }
        public string? ExternalNeoPixelsData1 { get; set; }
        public string? ExternalNeoPixelsData2 { get; set; }

    }
}