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
    // A component category and the spec fields that belong to it.
    //
    // 🔑 Lab_Components.Type stays a plain string and is NOT a foreign key. Types are a
    // vocabulary, not a constraint: a component whose type was retired must keep rendering
    // rather than vanish or block a delete. This table drives the pickers, the section order
    // and the typed fields - it does not own the data.
    public class Model_Lab_ComponentType
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;   // the stored key: "CPU", "UPS"
        public string? Label { get; set; }                 // plural display: "CPUs", "UPSes"
        public int SortOrder { get; set; }                 // section order on Inventory
        public string Status { get; set; } = "active";     // active | retired
        public string? Icon { get; set; }
        public string? Notes { get; set; }

        // Field definitions as JSON — see Model_Lab_ComponentTypeField. Stored as a document
        // rather than a child table for the same reason SpecJson and RolesJson are: it is read
        // and written whole, never queried across, and a second table would mean a second CRUD
        // surface for no gain.
        public string? FieldsJson { get; set; }

        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }

        // Populated by the DB manager for display, not mapped to a column
        public int ComponentCount { get; set; }
    }

    // One typed field on a component category. The same definition drives BOTH the add/edit
    // form and the Inventory section table - ShowInTable is the only difference between them.
    // Keeping it as one list is deliberate: SPEC_FIELDS and TYPE_SECTION_COLUMNS were two
    // hand-synchronised lists, and they had already drifted.
    public class Model_Lab_ComponentTypeField
    {
        public string Key { get; set; } = string.Empty;    // "vramGb" — the SpecJson property
        public string Label { get; set; } = string.Empty;  // form label: "DDR Gen"
        public string Kind { get; set; } = "text";         // text | number | select | boolean
        public string? Unit { get; set; }                  // display suffix: "GB", "MT/s"
        public List<string>? Options { get; set; }         // kind=select only
        public bool Multiline { get; set; }                // text rendered as one entry per line
        public bool ShowInTable { get; set; }              // becomes a column in that section

        // ⚠️ The table header is often SHORTER than the form label - "DDR Gen" on the form is
        // "DDR" in the column, "Cores (P)" is "Cores". The two lists this table replaces each
        // carried their own wording; null means reuse Label.
        public string? TableLabel { get; set; }
        public string? Align { get; set; }                 // left | right, table only
        public int SortOrder { get; set; }
    }
}
