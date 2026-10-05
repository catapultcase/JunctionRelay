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
    // A stored file (invoice PDF, manual, photo) linked to a Lab component or machine.
    // The bytes live under <dataDir>/lab/attachments/<StoredName>; rows are the index.
    public class Model_Lab_Attachment
    {
        public int Id { get; set; }
        public int? ComponentId { get; set; }
        public int? MachineId { get; set; }
        public string Kind { get; set; } = "Invoice";      // Invoice | Manual | Photo | Other
        public string FileName { get; set; } = string.Empty;   // original name, shown in UI
        public string StoredName { get; set; } = string.Empty; // guid-based name on disk
        public string? ContentType { get; set; }
        public long? SizeBytes { get; set; }
        public string? Sha256 { get; set; }               // content hash; identical files share one StoredName
        public string? Notes { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
