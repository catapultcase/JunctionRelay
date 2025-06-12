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
    public class Model_Collector
    {
        public int Id { get; set; }

        // Required properties
        public required string Name { get; set; }
        // This property explicitly indicates which concrete implementation to use.
        public required string CollectorType { get; set; }
        public required string Status { get; set; }

        // Optional properties
        public string? Description { get; set; }

        // Settings
        public string? URL { get; set; }
        public string? AccessToken { get; set; }
        public int? PollRate { get; set; } = 5000;
        public int? SendRate { get; set; } = 5000;
        public int? ServiceId { get; set; }

    }
}
