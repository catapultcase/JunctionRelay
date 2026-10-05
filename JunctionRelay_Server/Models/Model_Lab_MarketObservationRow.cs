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
    // One row of the Observations feed: a market-value observation with just enough
    // component context to read it standing alone - what the part launched at, what we
    // paid, what the PREVIOUS observation said, and the series so far for a sparkline.
    // Read model only; the ledger itself stays Model_Lab_MarketValue.
    public class Model_Lab_MarketObservationRow
    {
        public int Id { get; set; }
        public int ComponentId { get; set; }
        public string? ComponentLabel { get; set; }
        public string? ComponentType { get; set; }
        public string? Vendor { get; set; }              // where the part was purchased

        // Component price anchors, denormalised for the feed. AcquiredAt dates the
        // Paid figure the same way CapturedAt dates an observation.
        public double? Msrp { get; set; }
        public double? PurchasePrice { get; set; }
        public DateTime? AcquiredAt { get; set; }

        // The observation itself.
        public double Value { get; set; }
        public DateTime CapturedAt { get; set; }
        public string? Source { get; set; }
        public string? SourceUrl { get; set; }
        public string? Notes { get; set; }

        // The observation immediately before this one in the same component's series,
        // null when this row IS the first observation.
        public double? PriorValue { get; set; }
        public DateTime? PriorCapturedAt { get; set; }

        // Oldest→newest EFFECTIVE values (cheapest per day) up to and including this
        // observation's day, for a sparkline.
        public List<double> Series { get; set; } = new();

        // Other observations on the SAME day for the same component - different vendors,
        // dearer listings. The row itself is the day's effective (cheapest) observation;
        // these nest under it in the feed, cheapest-first.
        public List<Model_Lab_MarketValue> Alternates { get; set; } = new();
    }
}
