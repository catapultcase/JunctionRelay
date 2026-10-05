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
    // Models module (MODELS) — the SERVING PAGE'S DESIGN as data, so the page is updated over MCP and
    // in the UI rather than by a build. One table, three kinds of element:
    //   box    - a card: Name ("Pair"), Title ("The coding agent"), Role, Body (the why), the Lab
    //            Machines in it, SlotOwners, DelegatesTo / FallbackBox (box names), Row and Position
    //            on the canvas, Accent colour, Hw (shown when the Lab has no GPU line).
    //   client - a pill above the boxes: Name ("Assistant"), Body ("chat gateway"), AsksBox.
    //   rule   - a numbered line under the canvas: Body, ordered by Position.
    // What a box SERVES is not here: that is its default Models_Serving row, and its speed is the
    // benchmark ledger's. The layout is computed from Row/Position, never from pixel constants.
    public class Model_Models_ServingDesign
    {
        public int Id { get; set; }
        public string Kind { get; set; } = "box";          // box | client | rule
        public string? Name { get; set; }
        public string? Title { get; set; }
        public string? Role { get; set; }                 // free text: coding agent, chat agent, worker...
        public string? Body { get; set; }
        public string? Machines { get; set; }             // comma-separated Lab machine names
        public string? SlotOwners { get; set; }           // comma-separated, left to right
        public string? AsksBox { get; set; }              // client -> the box it asks
        public string? DelegatesTo { get; set; }          // box -> comma-separated boxes it hands work to
        public string? FallbackBox { get; set; }          // box -> where its clients go when it is down
        public int Row { get; set; } = 1;                 // canvas row, top to bottom (clients sit above row 1)
        public int Position { get; set; }                 // left to right within the row; order of rules
        public string? Accent { get; set; }               // card top-border colour, e.g. #6a1b9a
        public string? Hw { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
