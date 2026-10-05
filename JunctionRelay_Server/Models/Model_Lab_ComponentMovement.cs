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
    // Append-only ledger row: the timeline primitive. Rows are never updated or deleted.
    public class Model_Lab_ComponentMovement
    {
        public int Id { get; set; }
        public int ComponentId { get; set; }
        public int? FromMachineId { get; set; }                  // NULL = came from shelf/new
        public int? ToMachineId { get; set; }                    // NULL = removed to shelf/disposed
        public string? SlotLabel { get; set; }                   // optional: "M.2 4.0 x4 (CPU)", "3.5 Disk 2"
        public DateTime MovedAt { get; set; }                    // backdatable
        public string? Reason { get; set; }
        public DateTime CreatedAt { get; set; }

        // Display fields populated by the DB manager, not mapped to columns
        public string? ComponentLabel { get; set; }
        public string? FromMachineName { get; set; }
        public string? ToMachineName { get; set; }
    }
}
