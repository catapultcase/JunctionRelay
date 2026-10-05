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
    public class Model_Lab_Machine
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;         // spoken name, e.g. "the desktop"
        public string? Hostname { get; set; }                    // what the machine actually reports
        public string? Kind { get; set; }                        // Desktop | Laptop | Server | NAS | SBC | Mini PC | Console | Appliance | Other
        public string? Role { get; set; }                        // NAS, gaming, LLM box, HTPC…
        public string Status { get; set; } = "active";           // active | incoming | retiring | retired
        public string? OS { get; set; }
        public string? IPAddress { get; set; }
        public string? Location { get; set; }
        public bool AlwaysOn { get; set; }
        public int? LinkedDeviceId { get; set; }                 // nullable soft link -> Devices
        public string? Notes { get; set; }
        // SENTIMENT: the machine's standing verdict as an LLM box, in a
        // sentence or two - what it is good for, what an upgrade would and would not buy.
        // Shown above the benchmark matrix. Notes is the charter; this is the headline.
        public string? Sentiment { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }

        // Populated by the DB manager, not mapped to columns
        public List<Model_Lab_Component> InstalledComponents { get; set; } = new();
        public int ComponentCount { get; set; }
    }
}
