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
    public class Model_JunctionScreenLayout
    {
        public int Id { get; set; }
        public int JunctionId { get; set; }
        public int JunctionDeviceLinkId { get; set; }
        public int DeviceScreenId { get; set; }
        public int? ScreenLayoutId { get; set; }
        public int? FrameLayoutId { get; set; }
        public int? TargetPollRate { get; set; }
        public DateTime? LastRequested {  get; set; } 
        public bool OnlySendIfChanged { get; set; } = true;
        public bool EnableUrlAccess { get; set; } = false;
        public string? UrlPath { get; set; } 
    }
}
