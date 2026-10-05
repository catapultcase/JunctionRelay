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
    // What the user chose to share with JunctionRelay Cloud: a category is shared or not, and inside a
    // shared category each broad feature is opted into on its own. Everything off by default. Stored as one
    // JSON setting (Service_Lab_CloudSyncPush.ShareKey). A category or feature that is off travels EMPTY,
    // so the cloud's wipe-replace mirror drops it at the next push.
    public class Model_Lab_CloudShare
    {
        public HomelabShare Homelab { get; set; } = new();
        public ModelsShare Models { get; set; } = new();

        public class HomelabShare
        {
            public bool Enabled { get; set; }        // inventory: machines, components, types, machine groups
            public bool Movements { get; set; }      // part history
            public bool Purchases { get; set; }      // prices paid/listed, where and when bought, market values
            public bool Spaces { get; set; }         // rooms, racks, desks and what sits where
            public bool Attachments { get; set; }    // attachment metadata (never the files)
        }

        public class ModelsShare
        {
            public bool Enabled { get; set; }        // the catalog
            public bool Serving { get; set; }        // which machine serves what (sends those machines' names)
            public bool Scores { get; set; }         // cited reference scores
            public bool Benchmarks { get; set; }     // speeds measured on the user's machines
        }

        public bool Any => Homelab.Enabled || Models.Enabled;
    }

    // The share page's description of each category and feature, with the exact fields each one sends -
    // generated from the sync contract DTOs (Service_Lab_CloudSyncPush.GetShareContract).
    public class Model_Lab_ShareContract
    {
        public int SchemaVersion { get; set; }
        public List<Category> Categories { get; set; } = new();

        public class Category
        {
            public string Key { get; set; } = string.Empty;
            public string Label { get; set; } = string.Empty;
            public List<Feature> Features { get; set; } = new();
            public List<string> NeverShared { get; set; } = new();
        }

        public class Feature
        {
            public string Key { get; set; } = string.Empty;          // "base" = shared whenever the category is
            public string Label { get; set; } = string.Empty;
            public string Description { get; set; } = string.Empty;
            public Dictionary<string, List<string>> Fields { get; set; } = new();
        }
    }
}
