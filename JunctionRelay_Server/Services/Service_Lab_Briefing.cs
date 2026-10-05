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

using System.Text;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    // Lab module (HOMELAB) — builds the Lab summary once, for every consumer.
    //
    // The MCP tool and the Homelab dashboard must never disagree about how many machines
    // or components exist, so neither computes its own totals: both start here. Text
    // rendering for the assistant lives here too, so the wording is versioned alongside
    // the numbers rather than drifting inside the tool class.
    public class Service_Lab_Briefing
    {
        private readonly Service_Database_Manager_Lab_Machines _machinesDb;
        private readonly Service_Database_Manager_Lab_Components _componentsDb;
        private readonly Service_Database_Manager_Lab_Spaces _spacesDb;

        public Service_Lab_Briefing(
            Service_Database_Manager_Lab_Machines machinesDb,
            Service_Database_Manager_Lab_Components componentsDb,
            Service_Database_Manager_Lab_Spaces spacesDb)
        {
            _machinesDb = machinesDb;
            _componentsDb = componentsDb;
            _spacesDb = spacesDb;
        }

        public async Task<Model_Lab_Briefing> BuildAsync()
        {
            var machines = (await _machinesDb.GetAllMachinesAsync()).ToList();
            var components = (await _componentsDb.GetAllComponentsAsync()).ToList();
            var spaces = (await _spacesDb.GetAllSpacesAsync()).ToList();
            var placements = (await _spacesDb.GetPlacementsAsync()).ToList();

            var briefing = new Model_Lab_Briefing
            {
                MachineCount = machines.Count,
                AlwaysOnCount = machines.Count(m => m.AlwaysOn),
                ComponentCount = components.Count,
                // On-order parts are not in the building, so they are not on the shelf.
                ShelvedCount = components.Count(c => c.CurrentMachineId == null && c.Status != Service_Database_Manager_Lab_Components.StatusIncoming),
                SpaceCount = spaces.Count,
                GeneratedAt = DateTime.UtcNow,

                Machines = machines
                    .OrderBy(m => m.Name, StringComparer.OrdinalIgnoreCase)
                    .Select(m => new Model_Lab_Briefing_Machine
                    {
                        Id = m.Id,
                        Name = m.Name,
                        Kind = m.Kind,
                        Role = m.Role,
                        Status = m.Status,
                        OS = m.OS,
                        AlwaysOn = m.AlwaysOn,
                        ComponentCount = m.ComponentCount
                    })
                    .ToList(),

                ComponentsByType = components
                    .GroupBy(c => string.IsNullOrWhiteSpace(c.Type) ? "Other" : c.Type)
                    .Select(g => new Model_Lab_Briefing_ComponentType
                    {
                        Type = g.Key,
                        Count = g.Count(),
                        Shelved = g.Count(c => c.CurrentMachineId == null && c.Status != Service_Database_Manager_Lab_Components.StatusIncoming)
                    })
                    .OrderByDescending(t => t.Count)
                    .ThenBy(t => t.Type, StringComparer.OrdinalIgnoreCase)
                    .ToList(),

                // Occupancy is derived here, not stored - a rack's free space is a function of
                // its placements and must never be able to disagree with them.
                Spaces = spaces
                    .OrderBy(s => s.SortOrder).ThenBy(s => s.Id)
                    .Select(s =>
                    {
                        var mine = placements.Where(p => p.SpaceId == s.Id).ToList();
                        return new Model_Lab_Briefing_Space
                        {
                            Id = s.Id,
                            Name = s.Name,
                            Kind = s.Kind,
                            Location = s.Location,
                            ParentName = s.ParentSpaceId is int pid ? spaces.FirstOrDefault(x => x.Id == pid)?.Name : null,
                            HeightU = s.HeightU,
                            UsedU = s.UsedU,
                            PlacementCount = mine.Count,
                            PlannedCount = mine.Count(p =>
                                string.Equals(p.Status, "planned", StringComparison.OrdinalIgnoreCase)),
                        };
                    })
                    .ToList()
            };

            return briefing;
        }

        // Compact plain-text rendering for the MCP tool.
        //
        // Written for a small local model that truncates tool results at roughly 2,000
        // characters: ASCII only, no tables, and `active` status omitted because it is the
        // common case and costs characters to state.
        public static string RenderText(Model_Lab_Briefing briefing)
        {
            var sb = new StringBuilder();

            sb.Append("MACHINES (").Append(briefing.MachineCount).AppendLine(")");
            foreach (var m in briefing.Machines)
            {
                sb.Append("- ").Append(m.Name);

                var descriptors = new List<string>();
                if (!string.IsNullOrWhiteSpace(m.Role)) descriptors.Add(m.Role!);
                else if (!string.IsNullOrWhiteSpace(m.Kind)) descriptors.Add(m.Kind!);
                if (!string.IsNullOrWhiteSpace(m.OS)) descriptors.Add(m.OS!);
                if (m.AlwaysOn) descriptors.Add("always-on");
                if (descriptors.Count > 0) sb.Append(" (").Append(string.Join(", ", descriptors)).Append(')');

                if (!string.Equals(m.Status, "active", StringComparison.OrdinalIgnoreCase))
                    sb.Append(" [").Append(m.Status).Append(']');

                sb.Append(" - ").Append(m.ComponentCount)
                  .AppendLine(m.ComponentCount == 1 ? " part" : " parts");
            }

            sb.AppendLine();
            sb.Append("INVENTORY (").Append(briefing.ComponentCount).Append(" components, ")
              .Append(briefing.ShelvedCount).AppendLine(" on the shelf)");

            foreach (var t in briefing.ComponentsByType)
            {
                sb.Append("- ").Append(t.Type).Append(": ").Append(t.Count);
                if (t.Shelved > 0) sb.Append(" (").Append(t.Shelved).Append(" shelved)");
                sb.AppendLine();
            }

            if (briefing.Spaces.Count > 0)
            {
                sb.AppendLine();
                sb.Append("SPACES (").Append(briefing.SpaceCount)
                  .AppendLine(" - racks, desks and rooms things are installed in)");

                foreach (var s in briefing.Spaces)
                {
                    sb.Append("- ").Append(s.Name).Append(" (").Append(s.Kind);
                    if (!string.IsNullOrWhiteSpace(s.ParentName)) sb.Append(", in ").Append(s.ParentName);
                    else if (!string.IsNullOrWhiteSpace(s.Location)) sb.Append(", ").Append(s.Location);
                    sb.Append(')');

                    // "3U free of 12" answers the question a rack summary is asked; "12U rack"
                    // just restates the spec.
                    if (s.HeightU.HasValue)
                    {
                        var free = s.HeightU.Value - (s.UsedU ?? 0);
                        sb.Append(" - ").Append(free).Append("U free of ").Append(s.HeightU.Value);
                    }

                    if (s.PlacementCount > 0)
                    {
                        sb.Append(", ").Append(s.PlacementCount)
                          .Append(s.PlacementCount == 1 ? " item" : " items");
                        if (s.PlannedCount > 0) sb.Append(" (").Append(s.PlannedCount).Append(" planned)");
                    }
                    else
                    {
                        sb.Append(", empty");
                    }

                    sb.AppendLine();
                }
            }

            return sb.ToString();
        }
    }
}
