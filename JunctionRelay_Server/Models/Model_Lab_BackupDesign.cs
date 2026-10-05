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
    // Homelab module (LAB) — the BACKUPS PAGE as data, editable in the web UI and over MCP without a
    // rebuild, so JR is the source of truth for the backup strategy. The serving page's pattern:
    // one table, several kinds of element, the layout computed from Row/Position.
    //   location - where data lives: Name ("NAS"), the Lab MACHINE it is on (MachineId - an id,
    //              never a typed name, so a rename in the Lab carries through), Path, Tier (hot,
    //              replaceable, cold, backup, working, primary), Snapshots (its undo policy), Body (why).
    //   job      - a copy between two locations: SourceId and TargetId (location ids), Name (the tool
    //              and task, e.g. "luckyBackup: NAS to offsite - archive"), Schedule, Mode (mirror with
    //              delete, copy), Body.
    //   copy     - one data set held on one box (the 3-2-1 matrix): Name = the data set,
    //              SourceId = the location (box) holding it, Tier = live | copy, Path = where on that box,
    //              Mode = 'replaceable' on the live row when a single copy is the design, Body = a note.
    //              The page counts copies, boxes and offsite per data set from these rows.
    //   rule     - a numbered line under the picture: Body, ordered by Position.
    // Sizes are not stored: they change daily and a typed size is the drift this page exists to stop.
    public class Model_Lab_BackupDesign
    {
        public int Id { get; set; }
        public string Kind { get; set; } = "location";    // location | job | rule
        public string? Name { get; set; }
        public string? Body { get; set; }
        public int? MachineId { get; set; }               // location -> Lab_Machines.Id; NULL for a cloud location
        public string? Path { get; set; }                 // location: dataset or share path
        public string? Tier { get; set; }                 // location: onsite | offsite | cloud (cloud = a service like Backblaze B2, no machine, counts as offsite)
        public string? Snapshots { get; set; }            // location: its snapshot policy, e.g. "daily kept 7 · monthly kept 1 yr"
        public int? SourceId { get; set; }                // job -> location id
        public int? TargetId { get; set; }                // job -> location id
        public string? Schedule { get; set; }             // job: "Mondays 10:00"
        public string? Mode { get; set; }                 // job: "mirror, deletes" | "copy"
        public int Row { get; set; } = 1;
        public int Position { get; set; }
        public string? Accent { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
