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

namespace JunctionRelayServer.Models.Requests
{
    public class Model_Device_Screen_Update_Request
    {
        public string DisplayName { get; set; }
        public int? ScreenLayoutId { get; set; }
        public bool? SupportsConfigPayloads { get; set; }  // New field
        public bool? SupportsSensorPayloads { get; set; }  // New field
    }
}
