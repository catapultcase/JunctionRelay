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
    public class Model_Lab_Component
    {
        public int Id { get; set; }
        public string Type { get; set; } = string.Empty;         // CPU | GPU | MOBO | RAM | Storage | PSU | NIC | Case | Other

        // 🔑 A NAME YOU SET, which beats the one composed from Manufacturer + Model. Most parts
        // are named perfectly well by their maker and model and leave this null - but a no-brand
        // part has neither, and there has to be somewhere to just type what the thing is. A patch
        // panel entered with only a nickname showed up as "component 215", matched nothing when
        // its own name was typed, and drew as a blank block in the rack.
        public string? Name { get; set; }
        public string? Manufacturer { get; set; }
        public string? Model { get; set; }
        public string? Nickname { get; set; }                    // drive pet names: "Tank", "Vault"…
        public string? SerialNumber { get; set; }
        public string? Sku { get; set; }
        public string? Spec { get; set; }                        // human-readable: "32GB DDR5-6400 (2x16GB)"
        public string? SpecJson { get; set; }                    // type-specific fields as JSON
        public string Status { get; set; } = "active";           // active | spare | sold | dead | damaged | lost | disposed
        public int? CurrentMachineId { get; set; }               // NULL = on the shelf
        // Set when this part arrived INSIDE another one - an iGPU in its CPU, the CPU
        // soldered to a barebones board, the case a DeskMini ships in. It was never
        // bought separately, so it inherits the parent's purchase facts on read and
        // carries no price of its own.
        public int? ParentComponentId { get; set; }
        // "YYYY" or "YYYY-MM-DD" — full launch date when known, year otherwise.
        public string? ReleaseDate { get; set; }
        public double? Msrp { get; set; }
        public double? ListPrice { get; set; }            // the invoice's list price AT PURCHASE, captured once
                                                          // (rewritten from "current market price" in 1.7c - what it
                                                          // sells for NOW lives in Lab_MarketValues, never here)
        public string? ListPriceDate { get; set; }        // when ListPrice was captured (YYYY-MM-DD)
        public string? ListPriceNotes { get; set; }       // human context for pricing lookups ("RAM doubled last month");
                                                          // future lookups must consider this, and keep the old price
                                                          // when no newer verified price is found
        public double? PurchasePrice { get; set; }
        public DateTime? AcquiredAt { get; set; }
        public string? Source { get; set; }                      // condition: Internal | Shucked | New…
        public string? Vendor { get; set; }                      // where purchased: Newegg | Amazon | Micro Center…
        public int? WarrantyYears { get; set; }
        public string? Notes { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }

        // Populated by the DB manager for display, not mapped to columns
        public string? CurrentMachineName { get; set; }

        // Physical location, derived on read - never stored, so it cannot disagree with the
        // placements it comes from. A component can carry BOTH: installed in a machine, and
        // that machine racked. SpaceName is its OWN placement (a bare part in a rack);
        // MachineSpaceName is the rack its machine sits in.
        public string? SpaceName { get; set; }
        public int? SpacePositionU { get; set; }
        public string? MachineSpaceName { get; set; }
        public int AttachmentCount { get; set; }

        // The parent's name, and the flag that says AcquiredAt/Vendor/WarrantyYears on
        // this row came from it rather than from the row's own columns.
        public string? ParentComponentName { get; set; }
        public bool InheritsPurchase { get; set; }

        // Where the purchase - and therefore the invoice - actually lives: the ROOT of the
        // integration chain, which for an iGPU is the board its CPU is soldered to. A child
        // has no invoice of its own, but it is not undocumented; the paperwork is one hop
        // (or two) up, and these let the UI link to it rather than show an empty clip.
        public int? InvoiceSourceComponentId { get; set; }
        public string? InvoiceSourceName { get; set; }
        public int InheritedAttachmentCount { get; set; }

        // Latest row from the Lab_MarketValues ledger, so list views can show
        // "what does it sell for now (as of when)" without an N+1 or a second fetch.
        public double? LastObservedValue { get; set; }
        public DateTime? LastObservedAt { get; set; }
    }
}
