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
    // A physical thing you install into: a rack, a desk, a shelf, a room.
    //
    // 🔑 A rack is BOTH something you own and something you install into. ComponentId links
    // to the component that was actually bought, so purchase price, invoice and warranty stay
    // on that record instead of being restated here. A rack that is planned but not yet
    // purchased is simply a Space with ComponentId NULL.
    public class Model_Lab_Space
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;      // "Office Rack", "Desk (left)"
        public string Kind { get; set; } = "Rack";            // Rack | Desk | Shelf | Cabinet | Room
        public int? ComponentId { get; set; }                 // the rack itself, as purchased
        public int? ParentSpaceId { get; set; }               // a rack stands in a room; NULL = top level
        public int? HeightU { get; set; }                     // racks only
        public double? WidthInches { get; set; }              // 7, 10 and 19 are all in use here
        public double? DepthInches { get; set; }

        // ⚠️ VISUAL ONLY. Turns the drawing and nothing else - U numbering, occupancy, fit and
        // every placement are untouched. A DeskPi RackMate TT mounted on its side is still the
        // same U space; only the picture should change.
        public int Rotation { get; set; }
        public string? Location { get; set; }
        public string Status { get; set; } = "active";        // active | planned | retired
        public int SortOrder { get; set; }
        public string? Notes { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }

        // Populated by the DB manager for display, not mapped to columns
        public string? ComponentLabel { get; set; }           // "GeeekPi 12U Network Rack"
        public int PlacementCount { get; set; }
        public int? UsedU { get; set; }                       // sum of placed HeightU, front face
    }
}
