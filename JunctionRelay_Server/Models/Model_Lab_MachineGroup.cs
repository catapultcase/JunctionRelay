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
    // A user-defined machine group: machines whose Role is in RolesJson belong to it.
    // Display order is SortOrder ascending.
    public class Model_Lab_MachineGroup
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Field { get; set; } = "role";       // machine field to group on: role | kind | status | os | location
        public string RolesJson { get; set; } = "[]";     // JSON array of matched values for Field (name kept from role-only era)
        public int SortOrder { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
