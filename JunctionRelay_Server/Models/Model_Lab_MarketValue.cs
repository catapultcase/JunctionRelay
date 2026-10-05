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
    // Append-only observation: "what was this selling for, on this date, according to whom".
    // Rows are never updated or deleted - the same discipline as Lab_ComponentMovements,
    // and for the same reason: the SERIES is the value. One overwritten number tells you
    // today's price; a ledger tells you the trend, which is the question actually being
    // asked when someone says "has this held its value".
    //
    // Three price questions, three homes:
    //   Msrp         launch list, fixed forever
    //   ListPrice    the invoice's list price at time of purchase, captured once
    //   MarketValue  what it sells for NOW - which changes, so it cannot be a column
    public class Model_Lab_MarketValue
    {
        public int Id { get; set; }
        public int ComponentId { get; set; }
        public double Value { get; set; }

        // "new" and "used" are different questions about the same part and must not be
        // averaged together. Free text rather than an enum so "refurb", "open box" and
        // "for parts" do not need a schema change.
        public string? Condition { get; set; }

        // Where the figure came from: ebay-sold, newegg, amazon, escalation, manual.
        public string? Source { get; set; }

        // ⚠️ The citation. A market figure without one cannot be checked later, and an
        // unverifiable number is the thing this module exists to avoid.
        public string? SourceUrl { get; set; }

        // Stamped on every capture. Backdatable so migrated ListPriceDate values keep the
        // date they were actually observed rather than the date of the migration.
        public DateTime CapturedAt { get; set; }

        // Range, sample size, caveats - "3 sold listings, $780-$910".
        public string? Notes { get; set; }

        public DateTime CreatedAt { get; set; }

        // Display field populated by the DB manager, not mapped to a column.
        public string? ComponentLabel { get; set; }
    }
}
