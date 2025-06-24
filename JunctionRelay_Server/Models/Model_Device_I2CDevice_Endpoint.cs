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
    public class Model_Device_I2CDevice_Endpoint
    {
        public int Id { get; set; }
        public int I2CDeviceId { get; set; }
        public string EndpointType { get; set; } = "publish";
        public string Address { get; set; } = "";
        public int QoS { get; set; } = 0;
        public string? Notes { get; set; }
    }
}
