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
    // The Lab summary, in one shape. Built once by Service_Lab_Briefing and rendered two
    // ways: as text by the MCP tool, and as cards by the Homelab dashboard. Both consumers
    // must show the same numbers, so neither derives its own.
    public class Model_Lab_Briefing
    {
        public int MachineCount { get; set; }
        public int AlwaysOnCount { get; set; }
        public int ComponentCount { get; set; }
        public int ShelvedCount { get; set; }

        public int SpaceCount { get; set; }

        public List<Model_Lab_Briefing_Machine> Machines { get; set; } = new();
        public List<Model_Lab_Briefing_ComponentType> ComponentsByType { get; set; } = new();
        public List<Model_Lab_Briefing_Space> Spaces { get; set; } = new();

        public DateTime GeneratedAt { get; set; }
    }

    public class Model_Lab_Briefing_Machine
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Kind { get; set; }
        public string? Role { get; set; }
        public string Status { get; set; } = "active";
        public string? OS { get; set; }
        public bool AlwaysOn { get; set; }
        public int ComponentCount { get; set; }
    }

    public class Model_Lab_Briefing_ComponentType
    {
        public string Type { get; set; } = string.Empty;
        public int Count { get; set; }
        public int Shelved { get; set; }
    }

    // A rack, desk or room, with how full it is. Occupancy is what makes a space worth
    // mentioning in a summary at all - "12U rack" is a fact, "3U free of 12" is an answer.
    public class Model_Lab_Briefing_Space
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Kind { get; set; } = "Rack";
        public string? Location { get; set; }
        public string? ParentName { get; set; }   // the space it sits inside (a room)
        public int? HeightU { get; set; }
        public int? UsedU { get; set; }
        public int PlacementCount { get; set; }
        public int PlannedCount { get; set; }   // placements not yet installed
    }
}
