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
    // What occupies a Space, and where in it.
    //
    // MachineId XOR ComponentId — enforced by a CHECK constraint on the table. A rack holds
    // whole machines (the server) and bare components alike (a PDU, a patch panel, a blank
    // panel), and both need to occupy U.
    //
    // 🔑 Status planned|installed is what makes this a PLANNER rather than a map: a rack can
    // be laid out before the parts arrive, then flipped row by row as they go in.
    public class Model_Lab_Placement
    {
        public int Id { get; set; }
        public int SpaceId { get; set; }
        public int? MachineId { get; set; }                 // exactly one of these two is set
        public int? ComponentId { get; set; }
        public int? PositionU { get; set; }                 // bottom-most U, 1-based; NULL off-rack
        public int? HeightU { get; set; }                   // how many U it consumes
        // Sits ON another placement in the same space - a shelf, drawer or tray (its carrier) - side by
        // side with whatever else is on it. It takes no U of its own: PositionU is NULL, its U and face are
        // the carrier's, and HeightU is only how tall it stands on the shelf (drawn, never counted as used
        // U; default 1). One level only (nothing sits on something that sits on a shelf).
        public int? OnPlacementId { get; set; }
        public string Face { get; set; } = "front";         // front | rear | both

        // ⚠️ VISUAL ONLY, and INDEPENDENT of the space's own rotation. The rack can be mounted
        // turned, and a unit inside it can be mounted turned as well - a shelf or a Pi tray put
        // in sideways. Neither changes U numbering, occupancy or fit.
        public int Rotation { get; set; }
        public string Status { get; set; } = "planned";     // planned | installed
        public string? Notes { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }

        // Populated by the DB manager for display, not mapped to columns
        public string? SpaceName { get; set; }
        public string? OccupantLabel { get; set; }          // machine name, or manufacturer + model
        public string? OccupantKind { get; set; }           // "machine" | "component"
    }
}
