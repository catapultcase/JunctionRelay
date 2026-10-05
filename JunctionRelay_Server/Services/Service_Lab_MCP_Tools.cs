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

using System.ComponentModel;
using System.Text;
using JunctionRelayServer.Models;
using ModelContextProtocol.Server;

namespace JunctionRelayServer.Services
{
    // Lab module (HOMELAB) — MCP tool surface. Self-contained alongside the rest of the
    // module: removing this file plus its DI registration removes the endpoint.
    //
    // Tools stay thin. The summary itself is built and rendered by Service_Lab_Briefing so
    // that the assistant and the Homelab dashboard cannot report different numbers.
    //
    // ⚠️ Do not add regex validation attributes to tool parameters. Tool schemas are
    // converted to a constrained grammar by llama.cpp-backed runtimes, which reject any
    // unanchored `pattern` and fail the whole request — not just the offending tool.
    [McpServerToolType]
    public sealed class Service_Lab_MCP_Tools
    {
        private readonly IServiceScopeFactory _scopeFactory;

        public Service_Lab_MCP_Tools(IServiceScopeFactory scopeFactory)
        {
            _scopeFactory = scopeFactory;
        }

        // ------------------------------------------------------------------
        // THE BACKUPS PAGE - JR as the source of truth for the backup strategy, so it cannot drift.
        // Locations sit on Lab machines BY ID and jobs join locations BY ID, so a
        // rename in the Lab carries through. Rows of Lab_Backup_Design; the page draws itself from them.
        // ------------------------------------------------------------------

        [McpServerTool(Name = "lab_backups")]
        [Description("Read the Homelab backups page: every location (where data lives - its Lab machine, path, " +
                     "tier, snapshot policy, why), every job (a copy from one location to another - schedule, " +
                     "mode) and every rule, each with the id lab_set_backup changes.")]
        public async Task<string> LabBackupsAsync()
        {
            using var scope = _scopeFactory.CreateScope();
            var rows = (await scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_BackupDesign>().GetAllAsync()).ToList();
            if (rows.Count == 0) return "The backups page is empty. Add locations with lab_set_backup kind='location'.";
            var names = (await scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Machines>().GetAllMachinesAsync())
                .ToDictionary(m => m.Id, m => m.Name);
            var loc = rows.Where(r => r.Kind == "location").ToDictionary(r => r.Id, r => r.Name ?? $"#{r.Id}");
            var sb = new StringBuilder();
            foreach (var kind in new[] { "location", "copy", "job", "rule" })
            {
                var of = rows.Where(r => r.Kind == kind).OrderBy(r => r.Row).ThenBy(r => r.Position).ToList();
                if (of.Count == 0) continue;
                sb.AppendLine(kind == "location" ? "LOCATIONS:" : kind == "copy" ? "COPIES (data set on a box):" : kind == "job" ? "JOBS:" : "RULES:");
                foreach (var r in of)
                {
                    var bits = new List<string> { $"#{r.Id}" };
                    if (kind == "location")
                    {
                        var m = r.MachineId is int mid && names.TryGetValue(mid, out var n) ? n
                            : string.Equals(r.Tier, "cloud", StringComparison.OrdinalIgnoreCase) ? "the cloud" : "(machine missing from Lab)";
                        bits.Add($"{r.Name} on {m} [{r.Tier}] row {r.Row} pos {r.Position}");
                        if (!string.IsNullOrWhiteSpace(r.Path)) bits.Add($"path: {r.Path}");
                        if (!string.IsNullOrWhiteSpace(r.Snapshots)) bits.Add($"snapshots: {r.Snapshots}");
                        if (!string.IsNullOrWhiteSpace(r.Body)) bits.Add($"why: {r.Body}");
                    }
                    else if (kind == "copy")
                    {
                        string B(int? id) => id is int i && loc.TryGetValue(i, out var ln) ? ln : $"#{id}";
                        bits.Add($"{r.Name}: {r.Tier} on {B(r.SourceId)}, pos {r.Position}");
                        if (!string.IsNullOrWhiteSpace(r.Path)) bits.Add($"path: {r.Path}");
                        if (!string.IsNullOrWhiteSpace(r.Mode)) bits.Add(r.Mode!);
                        if (!string.IsNullOrWhiteSpace(r.Body)) bits.Add(r.Body!);
                    }
                    else if (kind == "job")
                    {
                        string L(int? id) => id is int i && loc.TryGetValue(i, out var ln) ? ln : $"#{id}";
                        bits.Add($"{r.Name}: {L(r.SourceId)} -> {L(r.TargetId)}");
                        if (!string.IsNullOrWhiteSpace(r.Schedule)) bits.Add(r.Schedule!);
                        if (!string.IsNullOrWhiteSpace(r.Mode)) bits.Add(r.Mode!);
                        if (!string.IsNullOrWhiteSpace(r.Body)) bits.Add(r.Body!);
                    }
                    else bits.Add($"{r.Position}. {r.Body}");
                    sb.AppendLine("  " + string.Join(" | ", bits));
                }
            }
            return sb.ToString().TrimEnd();
        }

        [McpServerTool(Name = "lab_set_backup")]
        [Description("Create or change one element of the Homelab backups page - no JR build needed. Pass id (from " +
                     "lab_backups) to change one: only the fields you pass change. Omit id to create, with kind. " +
                     "kind='location': name, machine (a Lab machine name - stored as its id), path, tier (hot, " +
                     "replaceable, cold, backup, working; primary = live data that is not LLMs), snapshots (its undo policy), body (why), row (1 = top), " +
                     "position, accent (#rrggbb). kind='job': name (tool and task), source and target (location " +
                     "ids or names), schedule, mode (e.g. 'mirror, deletes'), body. kind='copy' (one data set on one box - the " +
                     "3-2-1 matrix's rows): name (the data set), source (the box's location), tier (live or copy), path, " +
                     "mode ('replaceable' on the live row when one copy is the design), body, position (row order). " +
                     "A location's tier is onsite, offsite or cloud; offsite and cloud copies count as offsite. A cloud location " +
                     "(Backblaze B2) needs no machine - pass machine='' to clear one. kind='rule': body, position. " +
                     "Sizes are never stored. Pass an empty string to clear a text field.")]
        public async Task<string> LabSetBackupAsync(
            [Description("Element id to change; omit to create.")] int? id = null,
            [Description("location, job, copy or rule - required when creating.")] string? kind = null,
            [Description("A location's or job's name.")] string? name = null,
            [Description("Why a location exists, a job's note, or a rule's text.")] string? body = null,
            [Description("Location: the Lab machine it is on, by name.")] string? machine = null,
            [Description("Location: dataset or share path.")] string? path = null,
            [Description("Location: onsite, offsite or cloud. Copy: live or copy.")] string? tier = null,
            [Description("Location: its snapshot policy, e.g. 'daily kept 7, monthly kept 1 year'.")] string? snapshots = null,
            [Description("Job: the source location. Copy: the box (location) holding it. By id or name.")] string? source = null,
            [Description("Job: the target location, by id or name.")] string? target = null,
            [Description("Job: when it runs, e.g. 'Mondays 10:00'.")] string? schedule = null,
            [Description("Job: how it copies, e.g. 'mirror, deletes' or 'copy'.")] string? mode = null,
            [Description("Canvas row, 1 = top.")] int? row = null,
            [Description("Order within the row, or a rule's number.")] int? position = null,
            [Description("Card accent colour, #rrggbb.")] string? accent = null)
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_BackupDesign>();
            var machines = (await scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Machines>().GetAllMachinesAsync()).ToList();
            var all = (await db.GetAllAsync()).ToList();
            string? T(string? v, string? old) => v == null ? old : (v.Trim() == "" ? null : v.Trim());
            Model_Lab_BackupDesign e;
            if (id.HasValue) e = await db.GetByIdAsync(id.Value) ?? throw new InvalidOperationException($"No backups element #{id}.");
            else
            {
                if (kind is not ("location" or "job" or "copy" or "rule")) return "Creating needs kind = location, job, copy or rule.";
                e = new Model_Lab_BackupDesign { Kind = kind };
            }
            if (kind != null && id.HasValue) e.Kind = kind;
            if (machine != null && machine.Trim() == "") e.MachineId = null;
            else if (machine != null)
            {
                var hits = machines.Where(m => m.Name.Equals(machine.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
                if (hits.Count == 0) hits = machines.Where(m => m.Name.Contains(machine.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
                if (hits.Count != 1) return hits.Count == 0 ? $"No Lab machine matches '{machine}'." : $"'{machine}' matches {string.Join(", ", hits.Select(h => h.Name))} - be exact.";
                e.MachineId = hits[0].Id;
            }
            int? Loc(string v)
            {
                if (int.TryParse(v.Trim(), out var n)) return n;
                var l = all.Where(r => r.Kind == "location" && (r.Name ?? "").Equals(v.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
                return l.Count == 1 ? l[0].Id : null;
            }
            if (source != null) e.SourceId = Loc(source) ?? throw new InvalidOperationException($"No single location matches '{source}'.");
            if (target != null) e.TargetId = Loc(target) ?? throw new InvalidOperationException($"No single location matches '{target}'.");
            e.Name = T(name, e.Name); e.Body = T(body, e.Body); e.Path = T(path, e.Path); e.Tier = T(tier, e.Tier);
            e.Snapshots = T(snapshots, e.Snapshots); e.Schedule = T(schedule, e.Schedule); e.Mode = T(mode, e.Mode);
            e.Accent = T(accent, e.Accent);
            if (row.HasValue) e.Row = row.Value;
            if (position.HasValue) e.Position = position.Value;
            if (await db.InvalidAsync(e, machines.Select(m => m.Id)) is string why) return why;
            if (id.HasValue) { await db.UpdateAsync(e); return $"Updated backups {e.Kind} #{e.Id} ({e.Name ?? e.Body})."; }
            var newId = await db.CreateAsync(e);
            return $"Created backups {e.Kind} #{newId} ({e.Name ?? e.Body}).";
        }

        [McpServerTool(Name = "lab_delete_backup")]
        [Description("Delete one element of the Homelab backups page by id from lab_backups. Deleting a location " +
                     "also deletes the jobs into and out of it.")]
        public async Task<string> LabDeleteBackupAsync([Description("Element id.")] int id)
        {
            using var scope = _scopeFactory.CreateScope();
            return await scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_BackupDesign>().DeleteAsync(id)
                ? $"Deleted backups element #{id}." : $"No backups element #{id}.";
        }

        // ------------------------------------------------------------------
        // THE NETWORK PAGE - machines and switches, their ports and links, editable here and in the web UI.
        // Devices are
        // Lab machines and components BY ID (or a placeholder for something not bought); ports come from each
        // record's 'ports' spec field; links join port to port. Rules: Service_Database_Manager_Lab_Network.
        // ------------------------------------------------------------------

        private static string Gb(double? g) => g is null ? "?" : g >= 1 ? $"{g:0.##}G" : $"{g * 1000:0}M";

        [McpServerTool(Name = "lab_network")]
        [Description("Read the Homelab network page: every device (a Lab machine, a Lab component such as a switch, or a " +
                     "placeholder for something not bought yet) grouped by its Lab Space, each port (media, speed, card " +
                     "edge, fitted module) with what it links to, the zones (dmz or untrusted, drawn as a red hatched outline " +
                     "around their devices), and the checks (speed mismatches, planned links, devices with no ports). Every " +
                     "node, port, link and zone id here is what the other lab_*network tools take.")]
        public async Task<string> LabNetworkAsync()
        {
            using var scope = _scopeFactory.CreateScope();
            var g = await scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Network>().GetGraphAsync();
            if (g.Nodes.Count == 0) return "The network page is empty. Add devices with lab_set_network_node (machine=, component= or a placeholder label=).";
            var ports = g.Ports.ToDictionary(p => p.Id);
            var nodes = g.Nodes.ToDictionary(n => n.Id);
            var linkOf = new Dictionary<int, Model_Lab_NetworkLink>();
            foreach (var l in g.Links) { linkOf[l.PortAId] = l; linkOf[l.PortBId] = l; }
            var zoneOf = g.Zones.SelectMany(z => z.NodeIds.Select(id => (id, z))).ToDictionary(x => x.id, x => x.z);
            var sb = new StringBuilder();
            foreach (var grp in g.Nodes.GroupBy(n => n.FrameSpaceName == null ? "(not in a Space)"
                         : n.SubSpaceName != null ? $"{n.FrameSpaceName} > {n.SubSpaceName}" : n.FrameSpaceName)
                         .OrderBy(x => x.Key == "(not in a Space)").ThenBy(x => x.Key))
            {
                sb.AppendLine($"{grp.Key.ToUpperInvariant()}:");
                foreach (var n in grp.OrderBy(n => n.Y ?? int.MaxValue).ThenBy(n => n.X ?? int.MaxValue))
                {
                    var bits = new List<string> { $"#{n.Id} {n.DisplayName}", $"[{n.RefLine}]" };
                    if (n.Status == "planned") bits.Add("PLANNED");
                    if (n.Missing) bits.Add("LAB RECORD GONE");
                    if (n.PlacementNote != null) bits.Add(n.PlacementNote);
                    if (zoneOf.TryGetValue(n.Id, out var nz)) bits.Add($"zone #{nz.Id} {nz.Name} ({nz.Kind})");
                    bits.Add(n.X.HasValue && n.Y.HasValue ? $"at {n.X},{n.Y}" : "not placed yet");
                    if (n.SpaceId.HasValue) bits.Add("space set by hand");
                    if (!string.IsNullOrWhiteSpace(n.Notes)) bits.Add($"- {n.Notes}");
                    sb.AppendLine("  " + string.Join(" | ", bits));
                    foreach (var p in g.Ports.Where(p => p.NodeId == n.Id).OrderBy(p => p.Side).ThenBy(p => p.Position))
                    {
                        var line = $"    port #{p.Id} {p.Name} {p.Media} {Gb(p.SpeedGb)} ({p.Side} {p.Position})";
                        if (p.ModuleComponentId.HasValue || p.ModuleLabel != null) line += $" module: {p.ModuleName ?? p.ModuleLabel}";
                        if (p.SourceName != null && !string.IsNullOrWhiteSpace(p.SourceName)) line += $" via {p.SourceName}";
                        if (linkOf.TryGetValue(p.Id, out var l))
                        {
                            var o = ports.GetValueOrDefault(l.PortAId == p.Id ? l.PortBId : l.PortAId);
                            var on = o != null ? nodes.GetValueOrDefault(o.NodeId) : null;
                            line += $" -> {on?.DisplayName ?? "?"} {o?.Name ?? "?"} (link #{l.Id}, {Gb(l.SpeedGb)}{(l.Status == "planned" ? ", planned" : "")})";
                        }
                        else line += " - free";
                        sb.AppendLine(line);
                    }
                }
            }
            if (g.Zones.Count > 0)
            {
                sb.AppendLine("ZONES:");
                foreach (var z in g.Zones)
                    sb.AppendLine($"  #{z.Id} {z.Name} | {z.Kind} | {(z.NodeIds.Count == 0 ? "no devices" : string.Join(", ", z.NodeIds.Select(id => $"#{id} {nodes.GetValueOrDefault(id)?.DisplayName ?? "?"}")))}" +
                                  (string.IsNullOrWhiteSpace(z.Notes) ? "" : $" - {z.Notes}"));
            }
            if (g.Checks.Count > 0)
            {
                sb.AppendLine("CHECKS:");
                foreach (var c in g.Checks) sb.AppendLine($"  [{c.Level}] {c.Text}");
            }
            return sb.ToString().TrimEnd();
        }

        [McpServerTool(Name = "lab_set_network_node")]
        [Description("Add a device to the Homelab network page, or change one - no JR build needed. Create with ONE of: " +
                     "machine (a Lab machine name), component (a Lab component id or name, e.g. a switch), or label (a " +
                     "PLACEHOLDER for something not in the Lab yet - always planned - with portsSpec). A new device gets its " +
                     "ports from the Lab straight away: a component's 'ports' spec field, a machine's installed NICs and " +
                     "motherboard, a placeholder's portsSpec (grammar: '4x RJ45 2.5G, 2x SFP+ 10G'). Its frame is the Lab " +
                     "Space it is placed in unless space is given. Where it is drawn: x/y, the card's top-left in canvas " +
                     "pixels on a 20px grid (lab_network shows each device's 'at x,y'); its frame is drawn around its devices, " +
                     "so keep a device clear of other devices and of other frames. A new device without x/y goes on a free " +
                     "spot below the map. Pass id (from lab_network) to change one: only the fields " +
                     "you pass change; syncPorts=true adds spec ports it lacks (never removes). Empty string clears a text field.")]
        public async Task<string> LabSetNetworkNodeAsync(
            [Description("Node id to change; omit to create.")] int? id = null,
            [Description("Create: a Lab machine, by name.")] string? machine = null,
            [Description("Create: a Lab component, by id or name (a switch, router, modem).")] string? component = null,
            [Description("A placeholder's name, or a display name for a machine/component (e.g. 'Big Switch').")] string? label = null,
            [Description("Placeholder only: its ports, e.g. '4x SFP+ 10G'.")] string? portsSpec = null,
            [Description("live or planned.")] string? status = null,
            [Description("A Lab Space name or id to draw it in, overriding its placement; empty string = back to its placement.")] string? space = null,
            [Description("Canvas x of the card's top-left, in pixels (rounded to the 20px grid).")] int? x = null,
            [Description("Canvas y of the card's top-left, in pixels (rounded to the 20px grid).")] int? y = null,
            [Description("Notes.")] string? notes = null,
            [Description("true: add the ports its spec has and it lacks.")] bool? syncPorts = null)
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Network>();
            string? T(string? v, string? old) => v == null ? old : (v.Trim() == "" ? null : v.Trim());
            Model_Lab_NetworkNode n;
            if (id.HasValue)
            {
                n = (await db.GetNodesAsync()).FirstOrDefault(x => x.Id == id.Value) ?? throw new InvalidOperationException($"No network node #{id}.");
                if (machine != null || component != null) return "A node's Lab record cannot change; delete it and add the other one.";
            }
            else
            {
                n = new Model_Lab_NetworkNode();
                if (new[] { machine, component }.Count(v => !string.IsNullOrWhiteSpace(v)) > 1) return "Give machine OR component, not both.";
                if (!string.IsNullOrWhiteSpace(machine))
                {
                    var ms = (await scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Machines>().GetAllMachinesAsync()).ToList();
                    var hits = ms.Where(m => m.Name.Equals(machine.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
                    if (hits.Count == 0) hits = ms.Where(m => m.Name.Contains(machine.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
                    if (hits.Count != 1) return hits.Count == 0 ? $"No Lab machine matches '{machine}'." : $"'{machine}' matches {string.Join(", ", hits.Select(h => h.Name))} - be exact.";
                    n.MachineId = hits[0].Id;
                }
                else if (!string.IsNullOrWhiteSpace(component))
                {
                    var hits = await db.FindComponentsAsync(component);
                    if (hits.Count != 1) return hits.Count == 0 ? $"No Lab component matches '{component}'." :
                        $"'{component}' matches {hits.Count}: {string.Join("; ", hits.Take(8).Select(h => $"#{h.Id} {h.Name}"))} - pass the id.";
                    n.ComponentId = hits[0].Id;
                }
                else if (string.IsNullOrWhiteSpace(label)) return "Creating needs machine, component, or a placeholder label.";
                if (n.MachineId == null && n.ComponentId == null) n.Status = "planned";
            }
            n.Label = T(label, n.Label);
            n.PortsSpec = T(portsSpec, n.PortsSpec);
            n.Notes = T(notes, n.Notes);
            if (status != null) n.Status = status.Trim();
            if (x.HasValue) n.X = (int)Math.Round(x.Value / 20.0) * 20;
            if (y.HasValue) n.Y = (int)Math.Round(y.Value / 20.0) * 20;
            if (space != null)
            {
                if (space.Trim() == "") n.SpaceId = null;
                else
                {
                    var hits = await db.FindSpacesAsync(space);
                    if (hits.Count != 1) return hits.Count == 0 ? $"No Lab Space matches '{space}'." : $"'{space}' matches {string.Join(", ", hits.Select(h => h.Name))} - be exact.";
                    n.SpaceId = hits[0].Id;
                }
            }
            if (await db.InvalidNodeAsync(n) is string why) return why;
            if (id.HasValue)
            {
                await db.UpdateNodeAsync(n);
                var msg = $"Updated network node #{n.Id} ({n.Label ?? n.DisplayName}).";
                if (syncPorts == true)
                {
                    var (added, warning) = await db.SyncPortsAsync(n.Id);
                    msg += $" {added} port(s) added from its spec.{(warning != null ? " " + warning : "")}";
                }
                return msg;
            }
            var (newId, portsAdded, warn) = await db.CreateNodeAsync(n);
            var created = (await db.GetNodesAsync()).First(x => x.Id == newId);
            return $"Added network node #{newId} {created.DisplayName} [{created.RefLine}]{(created.ResolvedSpaceName != null ? $" in {created.ResolvedSpaceName}" : "")}: {portsAdded} port(s) from the Lab.{(warn != null ? " " + warn : "")}";
        }

        [McpServerTool(Name = "lab_set_network_port")]
        [Description("Add or change one port of a device on the Homelab network page. Pass id (from lab_network) to change: " +
                     "only the fields you pass change. Omit id to add, with node (its id or name) and name. media: rj45, sfp " +
                     "(SFP+), sfp28, qsfp or other. speed in Gb/s (2.5, 10). side: the card edge it is drawn on (left, right, " +
                     "top, bottom); position: order along that edge. module: the part fitted in an SFP cage - a Lab component id " +
                     "or name (an SFP+ to RJ45 transceiver), or moduleLabel when it is not in the Lab. Empty string clears.")]
        public async Task<string> LabSetNetworkPortAsync(
            [Description("Port id to change; omit to add.")] int? id = null,
            [Description("Add: the device, by node id or name.")] string? node = null,
            [Description("Port name, e.g. 'SFP+ 1', '2.5G-3'.")] string? name = null,
            [Description("rj45, sfp, sfp28, qsfp or other.")] string? media = null,
            [Description("Speed in Gb/s.")] double? speed = null,
            [Description("Card edge: left, right, top or bottom.")] string? side = null,
            [Description("Order along that edge.")] int? position = null,
            [Description("Module fitted in the cage: a Lab component id or name; empty string removes it.")] string? module = null,
            [Description("A module that is not in the Lab, as text; empty string clears.")] string? moduleLabel = null,
            [Description("Notes.")] string? notes = null)
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Network>();
            string? T(string? v, string? old) => v == null ? old : (v.Trim() == "" ? null : v.Trim());
            Model_Lab_NetworkPort p;
            if (id.HasValue) p = await db.GetPortAsync(id.Value) ?? throw new InvalidOperationException($"No port #{id}.");
            else
            {
                if (string.IsNullOrWhiteSpace(node)) return "Adding a port needs node (id or name).";
                var nodes = await db.GetNodesAsync();
                var hit = int.TryParse(node.Trim().TrimStart('#'), out var nid) ? nodes.Where(x => x.Id == nid).ToList()
                    : nodes.Where(x => (x.DisplayName ?? "").Equals(node.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
                if (hit.Count == 0 && !int.TryParse(node.Trim().TrimStart('#'), out _))
                    hit = nodes.Where(x => (x.DisplayName ?? "").Contains(node.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
                if (hit.Count != 1) return hit.Count == 0 ? $"No network node matches '{node}'." : $"'{node}' matches {string.Join(", ", hit.Select(h => h.DisplayName))} - pass the id.";
                var existing = await db.GetPortsAsync(hit[0].Id);
                p = new Model_Lab_NetworkPort { NodeId = hit[0].Id, Side = side?.Trim() ?? "bottom" };
                p.Position = existing.Where(x => x.Side == p.Side).Select(x => x.Position).DefaultIfEmpty(0).Max() + 1;
            }
            if (name != null) p.Name = name.Trim();
            if (media != null) p.Media = media.Trim().ToLowerInvariant() is "sfp+" ? "sfp" : media.Trim().ToLowerInvariant();
            if (speed.HasValue) p.SpeedGb = speed;
            if (side != null) p.Side = side.Trim().ToLowerInvariant();
            if (position.HasValue) p.Position = position.Value;
            if (module != null)
            {
                if (module.Trim() == "") p.ModuleComponentId = null;
                else
                {
                    var hits = await db.FindComponentsAsync(module);
                    if (hits.Count != 1) return hits.Count == 0 ? $"No Lab component matches '{module}'." :
                        $"'{module}' matches {hits.Count}: {string.Join("; ", hits.Take(8).Select(h => $"#{h.Id} {h.Name}"))} - pass the id.";
                    p.ModuleComponentId = hits[0].Id;
                }
            }
            p.ModuleLabel = T(moduleLabel, p.ModuleLabel);
            p.Notes = T(notes, p.Notes);
            if (await db.InvalidPortAsync(p) is string why) return why;
            if (id.HasValue) { await db.UpdatePortAsync(p); return $"Updated port #{p.Id} {p.Name}."; }
            var newId = await db.CreatePortAsync(p);
            return $"Added port #{newId} {p.Name} ({p.Media} {Gb(p.SpeedGb)}, {p.Side} {p.Position}).";
        }

        [McpServerTool(Name = "lab_connect")]
        [Description("Link two ports on the Homelab network page, or change a link. from/to: a port id, or 'Device:Port' " +
                     "by name (e.g. 'S762 Switch:10G-1'). status: live or planned (planned draws dashed). A port has at " +
                     "most one link. Pass id (from lab_network) to change an existing link's status, notes or ends.")]
        public async Task<string> LabConnectAsync(
            [Description("Link id to change; omit to create.")] int? id = null,
            [Description("One end: port id or 'Device:Port'.")] string? from = null,
            [Description("The other end: port id or 'Device:Port'.")] string? to = null,
            [Description("live or planned.")] string? status = null,
            [Description("Notes.")] string? notes = null)
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Network>();
            var nodes = await db.GetNodesAsync();
            var ports = await db.GetPortsAsync();
            (int? Id, string? Error) Port(string v)
            {
                var t = v.Trim();
                if (int.TryParse(t.TrimStart('#'), out var pid)) return ports.Any(p => p.Id == pid) ? (pid, null) : (null, $"No port #{pid}.");
                var cut = t.LastIndexOf(':');
                if (cut <= 0) return (null, $"'{v}': give a port id or 'Device:Port'.");
                var dev = t[..cut].Trim(); var pn = t[(cut + 1)..].Trim();
                var ns = nodes.Where(n => (n.DisplayName ?? "").Equals(dev, StringComparison.OrdinalIgnoreCase)).ToList();
                if (ns.Count == 0) ns = nodes.Where(n => (n.DisplayName ?? "").Contains(dev, StringComparison.OrdinalIgnoreCase)).ToList();
                if (ns.Count != 1) return (null, ns.Count == 0 ? $"No device matches '{dev}'." : $"'{dev}' matches {string.Join(", ", ns.Select(n => n.DisplayName))}.");
                var ps = ports.Where(p => p.NodeId == ns[0].Id && p.Name.Equals(pn, StringComparison.OrdinalIgnoreCase)).ToList();
                return ps.Count == 1 ? (ps[0].Id, null) : (null, $"{ns[0].DisplayName} has no port named '{pn}' (it has: {string.Join(", ", ports.Where(p => p.NodeId == ns[0].Id).Select(p => p.Name))}).");
            }
            Model_Lab_NetworkLink l;
            if (id.HasValue) l = await db.GetLinkAsync(id.Value) ?? throw new InvalidOperationException($"No link #{id}.");
            else
            {
                if (string.IsNullOrWhiteSpace(from) || string.IsNullOrWhiteSpace(to)) return "Creating a link needs from and to.";
                l = new Model_Lab_NetworkLink();
            }
            if (from != null) { var (pid, err) = Port(from); if (err != null) return err; l.PortAId = pid!.Value; }
            if (to != null) { var (pid, err) = Port(to); if (err != null) return err; l.PortBId = pid!.Value; }
            if (status != null) l.Status = status.Trim();
            if (notes != null) l.Notes = notes.Trim() == "" ? null : notes.Trim();
            if (await db.InvalidLinkAsync(l) is string why) return why;
            if (id.HasValue) { await db.UpdateLinkAsync(l); return $"Updated link #{l.Id} ({l.Status})."; }
            var newId = await db.CreateLinkAsync(l);
            var a = ports.First(p => p.Id == l.PortAId); var b = ports.First(p => p.Id == l.PortBId);
            var speed = a.SpeedGb.HasValue && b.SpeedGb.HasValue ? Math.Min(a.SpeedGb.Value, b.SpeedGb.Value) : a.SpeedGb ?? b.SpeedGb;
            return $"Linked {nodes.First(n => n.Id == a.NodeId).DisplayName} {a.Name} to {nodes.First(n => n.Id == b.NodeId).DisplayName} {b.Name} (link #{newId}, {Gb(speed)}, {l.Status}).";
        }

        [McpServerTool(Name = "lab_set_network_zone")]
        [Description("Add or change a zone on the Homelab network page - a walled-off part of the network drawn as a red " +
                     "hatched outline around its devices. kind: dmz (servers exposed to the internet) or untrusted (devices " +
                     "kept off the LAN: an agents' box, IoT). A device is in at most one zone. Pass id (from lab_network) to " +
                     "change one: only the fields you pass change. nodes REPLACES the device list; add and remove edit it. " +
                     "Device lists are node ids from lab_network, comma separated. Delete with lab_delete_network kind=zone.")]
        public async Task<string> LabSetNetworkZoneAsync(
            [Description("Zone id to change; omit to create.")] int? id = null,
            [Description("Its name, e.g. 'Sandbox' or 'IoT'.")] string? name = null,
            [Description("dmz or untrusted.")] string? kind = null,
            [Description("Node ids, comma separated: the whole device list.")] string? nodes = null,
            [Description("Node ids to add, comma separated (taken out of any other zone).")] string? add = null,
            [Description("Node ids to remove, comma separated.")] string? remove = null,
            [Description("Notes; empty string clears them.")] string? notes = null)
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Network>();
            List<int>? Ids(string? v)
            {
                if (v == null) return null;
                var parts = v.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                var ids = new List<int>();
                foreach (var part in parts)
                {
                    if (!int.TryParse(part.TrimStart('#'), out var n)) throw new InvalidOperationException($"'{part}' is not a node id.");
                    ids.Add(n);
                }
                return ids;
            }
            Model_Lab_NetworkZone z;
            if (id.HasValue) z = await db.GetZoneAsync(id.Value) ?? throw new InvalidOperationException($"No zone #{id}.");
            else
            {
                if (string.IsNullOrWhiteSpace(name)) return "Creating a zone needs a name.";
                z = new Model_Lab_NetworkZone();
            }
            if (name != null) z.Name = name.Trim();
            if (kind != null) z.Kind = kind.Trim().ToLowerInvariant();
            if (notes != null) z.Notes = notes.Trim() == "" ? null : notes.Trim();
            if (Ids(nodes) is List<int> all) z.NodeIds = all;
            if (Ids(add) is List<int> plus) z.NodeIds = z.NodeIds.Concat(plus.Where(x => !z.NodeIds.Contains(x))).ToList();
            if (Ids(remove) is List<int> minus) z.NodeIds = z.NodeIds.Where(x => !minus.Contains(x)).ToList();
            if (await db.InvalidZoneAsync(z) is string why) return why;
            if (id.HasValue) await db.UpdateZoneAsync(z);
            else z.Id = await db.CreateZoneAsync(z);
            return $"{(id.HasValue ? "Updated" : "Added")} zone #{z.Id} {z.Name} ({z.Kind}) with {z.NodeIds.Count} device(s).";
        }

        [McpServerTool(Name = "lab_delete_network")]
        [Description("Delete from the Homelab network page by id (from lab_network). kind: node (also deletes its ports and " +
                     "their links), port (also deletes its link), link, or zone (its devices stay). The Lab machine or " +
                     "component itself is never touched.")]
        public async Task<string> LabDeleteNetworkAsync(
            [Description("node, port, link or zone.")] string kind,
            [Description("Its id.")] int id)
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Network>();
            return kind.Trim().ToLowerInvariant() switch
            {
                "node" => await db.DeleteNodeAsync(id) ? $"Deleted network node #{id} with its ports and links." : $"No network node #{id}.",
                "port" => await db.DeletePortAsync(id) ? $"Deleted port #{id} and its link." : $"No port #{id}.",
                "link" => await db.DeleteLinkAsync(id) ? $"Deleted link #{id}." : $"No link #{id}.",
                "zone" => await db.DeleteZoneAsync(id) ? $"Deleted zone #{id}; its devices stay on the page." : $"No zone #{id}.",
                _ => "kind must be node, port, link or zone.",
            };
        }

        // ------------------------------------------------------------------
        // MACHINE GROUPS AND SPACES. Deliberately UI-only: deleting a machine (retire it with
        // lab_update_machine status=retired - a delete strands everything that points at it by id), the MCP key,
        // cloud-sync settings, and rack dimensions on an existing space.
        // ------------------------------------------------------------------

        private static readonly string[] GroupFields = { "role", "kind", "status", "os", "location" };

        private static string? GroupFieldOf(Model_Lab_Machine m, string field) => field switch
        {
            "role" => m.Role, "kind" => m.Kind, "status" => m.Status, "os" => m.OS, "location" => m.Location, _ => null,
        };

        [McpServerTool(Name = "lab_machine_groups")]
        [Description("Read the Machines page groups, in display order: each group's id, name, the machine field it matches " +
                     "(role, kind, status, os or location), the values it matches and the machines that land in it, plus " +
                     "the machines no group catches. A group does not list machines - it catches every machine whose field " +
                     "value is in its list, so a role change moves a machine between groups.")]
        public async Task<string> LabMachineGroupsAsync()
        {
            using var scope = _scopeFactory.CreateScope();
            var groups = (await scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_MachineGroups>().GetAllGroupsAsync())
                .OrderBy(g => g.SortOrder).ToList();
            var machines = (await scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Machines>().GetAllMachinesAsync()).ToList();
            var sb = new StringBuilder();
            var caught = new HashSet<int>();
            foreach (var g in groups)
            {
                var values = ParseValues(g.RolesJson);
                var hits = machines.Where(m => !caught.Contains(m.Id) && values.Any(v => string.Equals(v, GroupFieldOf(m, g.Field), StringComparison.OrdinalIgnoreCase))).ToList();
                hits.ForEach(m => caught.Add(m.Id));
                sb.AppendLine($"#{g.Id} {g.Name} [{g.Field} in: {string.Join(" | ", values)}] -> {(hits.Count == 0 ? "(no machines)" : string.Join(", ", hits.Select(m => m.Name)))}");
            }
            var rest = machines.Where(m => !caught.Contains(m.Id)).Select(m => m.Name).ToList();
            if (rest.Count > 0) sb.AppendLine($"Not in any group: {string.Join(", ", rest)}");
            return groups.Count == 0 ? "No machine groups yet. Create one with lab_set_machine_group." : sb.ToString().TrimEnd();
        }

        private static List<string> ParseValues(string? json)
        {
            if (string.IsNullOrWhiteSpace(json)) return new();
            try { return System.Text.Json.JsonSerializer.Deserialize<List<string>>(json) ?? new(); }
            catch (System.Text.Json.JsonException) { return new(); }
        }

        [McpServerTool(Name = "lab_set_machine_group")]
        [Description("Create or change a Machines page group - no build needed. Omit id to create (name required). field: the " +
                     "machine field it matches - role (default), kind, status, os or location. values: the field values it " +
                     "catches, as a JSON array ('[\"Coding agent · TP head\",\"Coding agent · TP rank 1\"]') or separated by " +
                     "' | '. position: 1 = first group on the page. Only what you pass changes. The reply lists the machines it now catches.")]
        public async Task<string> LabSetMachineGroupAsync(
            [Description("Group id from lab_machine_groups; omit to create.")] int? id = null,
            [Description("Group name, e.g. 'GPU nodes'.")] string? name = null,
            [Description("role, kind, status, os or location.")] string? field = null,
            [Description("Values it catches: a JSON array, or values separated by ' | '.")] string? values = null,
            [Description("Display position, 1 = first.")] int? position = null)
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_MachineGroups>();
            Model_Lab_MachineGroup g;
            if (id.HasValue) g = await db.GetGroupByIdAsync(id.Value) ?? throw new InvalidOperationException($"No machine group #{id}.");
            else
            {
                if (string.IsNullOrWhiteSpace(name)) return "Creating a group needs a name. Nothing was written.";
                g = new Model_Lab_MachineGroup { Field = "role", RolesJson = "[]" };
            }
            if (name != null) g.Name = name.Trim();
            if (field != null)
            {
                var f = field.Trim().ToLowerInvariant();
                if (!GroupFields.Contains(f)) return $"field must be one of: {string.Join(", ", GroupFields)}. Nothing was written.";
                g.Field = f;
            }
            if (values != null)
            {
                var t = values.Trim();
                List<string> list;
                if (t.StartsWith("["))
                {
                    try { list = System.Text.Json.JsonSerializer.Deserialize<List<string>>(t) ?? new(); }
                    catch (System.Text.Json.JsonException) { return "values is not a valid JSON array of strings. Nothing was written."; }
                }
                else list = t.Split('|').Select(v => v.Trim()).Where(v => v.Length > 0).ToList();
                g.RolesJson = System.Text.Json.JsonSerializer.Serialize(list);
            }
            int gid;
            if (id.HasValue) { await db.UpdateGroupAsync(g); gid = g.Id; }
            else gid = await db.CreateGroupAsync(g);
            if (position.HasValue)
            {
                var order = (await db.GetAllGroupsAsync()).OrderBy(x => x.SortOrder).Select(x => x.Id).Where(x => x != gid).ToList();
                order.Insert(Math.Clamp(position.Value - 1, 0, order.Count), gid);
                await db.ReorderGroupsAsync(order);
            }
            var machines = (await scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Machines>().GetAllMachinesAsync()).ToList();
            var vals = ParseValues(g.RolesJson);
            var hits = machines.Where(m => vals.Any(v => string.Equals(v, GroupFieldOf(m, g.Field), StringComparison.OrdinalIgnoreCase))).Select(m => m.Name).ToList();
            return $"{(id.HasValue ? "Updated" : "Created")} machine group #{gid} {g.Name} [{g.Field} in: {string.Join(" | ", vals)}] - catches {(hits.Count == 0 ? "no machines (check the values against lab_query)" : string.Join(", ", hits))}.";
        }

        [McpServerTool(Name = "lab_delete_machine_group")]
        [Description("Delete a Machines page group by id (from lab_machine_groups). The machines are untouched; they show under the next group that catches them, or ungrouped.")]
        public async Task<string> LabDeleteMachineGroupAsync([Description("Group id.")] int id)
        {
            using var scope = _scopeFactory.CreateScope();
            return await scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_MachineGroups>().DeleteGroupAsync(id)
                ? $"Deleted machine group #{id}." : $"No machine group #{id}.";
        }

        [McpServerTool(Name = "lab_add_space")]
        [Description("Create a space - a room, rack, desk, shelf or cabinet things are placed in. kind: Room, Rack, Desk, Shelf or " +
                     "Cabinet. parent: the space it sits inside (a rack in a room). heightU for a rack. Change it later with " +
                     "lab_update_space; place things in it with lab_place_in_space.")]
        public async Task<string> LabAddSpaceAsync(
            [Description("Space name, e.g. 'Office', 'Rack 2'.")] string name,
            [Description("Room, Rack, Desk, Shelf or Cabinet.")] string kind,
            [Description("The space it sits inside, by name (usually a Room).")] string? parent = null,
            [Description("Rack height in U.")] int? heightU = null,
            [Description("Rack width in inches (7, 10 or 19 are in use).")] double? widthInches = null,
            [Description("Free-text location note.")] string? location = null,
            [Description("active (default) or planned.")] string? status = null,
            [Description("Notes.")] string? notes = null)
        {
            using var scope = _scopeFactory.CreateScope();
            var spacesDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Spaces>();
            var all = (await spacesDb.GetAllSpacesAsync()).ToList();
            if (string.IsNullOrWhiteSpace(name)) return "A space needs a name. Nothing was written.";
            if (all.Any(s => string.Equals(s.Name, name.Trim(), StringComparison.OrdinalIgnoreCase))) return $"A space named '{name.Trim()}' already exists. Nothing was written.";
            var kinds = new[] { "Room", "Rack", "Desk", "Shelf", "Cabinet" };
            var k = kinds.FirstOrDefault(x => string.Equals(x, kind?.Trim(), StringComparison.OrdinalIgnoreCase));
            if (k == null) return $"kind must be one of: {string.Join(", ", kinds)}. Nothing was written.";
            var st = string.IsNullOrWhiteSpace(status) ? "active" : status.Trim().ToLowerInvariant();
            if (st is not ("active" or "planned")) return "status must be active or planned. Nothing was written.";
            int? parentId = null;
            if (!string.IsNullOrWhiteSpace(parent))
            {
                var ph = all.Where(s => string.Equals(s.Name, parent.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
                if (ph.Count == 0) ph = all.Where(s => (s.Name ?? "").Contains(parent.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
                if (ph.Count != 1) return (ph.Count == 0 ? $"No space matches '{parent}'." : $"'{parent}' is ambiguous: {string.Join(", ", ph.Select(s => s.Name))}.") + " Nothing was written.";
                parentId = ph[0].Id;
            }
            var space = new Model_Lab_Space { Name = name.Trim(), Kind = k, ParentSpaceId = parentId, HeightU = heightU, WidthInches = widthInches,
                Location = string.IsNullOrWhiteSpace(location) ? null : location.Trim(), Status = st, Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim() };
            var newId = await spacesDb.CreateSpaceAsync(space);
            return $"Created space #{newId} {space.Name} ({k}{(parentId.HasValue ? $", in {await spacesDb.PathOfAsync(parentId.Value)}" : "")}{(heightU.HasValue ? $", {heightU}U" : "")}).";
        }

        [McpServerTool(Name = "lab_delete_space")]
        [Description("Delete an empty space. Refused while anything is placed in it or another space sits inside it - move those first " +
                     "(lab_remove_from_space, lab_update_space parent). A space that is gone for good but has history is better retired: lab_update_space status=retired.")]
        public async Task<string> LabDeleteSpaceAsync([Description("Space name, exact.")] string space)
        {
            using var scope = _scopeFactory.CreateScope();
            var spacesDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Spaces>();
            var hit = (await spacesDb.GetAllSpacesAsync()).FirstOrDefault(s => string.Equals(s.Name, space?.Trim(), StringComparison.OrdinalIgnoreCase));
            if (hit == null) return $"No space named exactly '{space}'. Nothing was deleted.";
            var result = await spacesDb.DeleteSpaceAsync(hit.Id);
            return result == "deleted" ? $"Deleted space {hit.Name} (#{hit.Id})." : $"{hit.Name}: {result}. Nothing was deleted.";
        }

        // ⛔ WHY THIS EXISTS. A component type can carry TYPED fields - Memory has a DDR
        // column, GPU has VRAM - and their values live in the component's SpecJson. A tool
        // that neither writes SpecJson nor tells the caller those fields exist files every
        // part blank in every typed column while it looks perfectly filed (memory rows
        // filed from invoices with no DDR generation, noticed only as an empty column).
        //
        // 🔑 The free-text Spec line is NOT a substitute. "DDR4 DRAM 2400MHz C16" reads fine
        // to a human and is invisible to a filter.
        // ⛔ ONE copy of the field-schema rules, shared by lab_add_component_type and
        // lab_update_component_type. Two hand-synchronised validators is exactly how the
        // SPEC_FIELDS / TYPE_SECTION_COLUMNS pair drifted before they were merged.
        private static (string Json, string? Error) NormaliseFieldsJson(string? fields, string verb)
        {
            if (string.IsNullOrWhiteSpace(fields)) return ("[]", null);
            try
            {
                var parsed = System.Text.Json.JsonSerializer.Deserialize<
                    List<Dictionary<string, System.Text.Json.JsonElement>>>(fields);
                foreach (var fdef in parsed ?? new())
                {
                    if (!fdef.ContainsKey("key") || !fdef.ContainsKey("label") || !fdef.ContainsKey("kind"))
                        return ("[]", $"Each field needs key, label and kind. Nothing was {verb}.");
                    var kind = fdef["kind"].GetString();
                    if (kind != "text" && kind != "number" && kind != "select" && kind != "boolean")
                        return ("[]", $"Unknown field kind '{kind}' - text, number, select or boolean. Nothing was {verb}.");
                    if (kind == "select" && !fdef.ContainsKey("options"))
                        return ("[]", $"A select field needs options. Nothing was {verb}.");
                }
                // Normalise sortOrder to array position, same as the Manage Types dialog.
                var reser = new List<object>();
                for (int i = 0; i < parsed!.Count; i++)
                {
                    var d = new Dictionary<string, object?>();
                    foreach (var kv in parsed[i]) d[kv.Key] = kv.Value;
                    d["sortOrder"] = i;
                    reser.Add(d);
                }
                return (System.Text.Json.JsonSerializer.Serialize(reser), null);
            }
            catch (System.Text.Json.JsonException e)
            {
                return ("[]", $"fields is not valid JSON ({e.Message}). Nothing was {verb}.");
            }
        }

        private sealed record SpecFieldOutcome(string? Error, string? Json, string? Advice);

        private static async Task<SpecFieldOutcome> BuildSpecJsonAsync(
            Service_Database_Manager_Lab_ComponentTypes typesDb,
            string typeName, string? specFields, string? existingSpecJson)
        {
            var type = await typesDb.GetByNameAsync(typeName);
            var defs = new List<Model_Lab_ComponentTypeField>();
            if (!string.IsNullOrWhiteSpace(type?.FieldsJson))
            {
                try
                {
                    defs = System.Text.Json.JsonSerializer.Deserialize<List<Model_Lab_ComponentTypeField>>(
                               type!.FieldsJson!,
                               new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                           ?? new List<Model_Lab_ComponentTypeField>();
                }
                catch { defs = new List<Model_Lab_ComponentTypeField>(); }
            }

            // Nothing supplied: say what was left empty rather than filing a blank row in
            // silence. An agent that is not told will not ask.
            if (string.IsNullOrWhiteSpace(specFields))
            {
                if (defs.Count == 0) return new SpecFieldOutcome(null, null, null);
                var have = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                if (!string.IsNullOrWhiteSpace(existingSpecJson))
                {
                    try
                    {
                        using var doc = System.Text.Json.JsonDocument.Parse(existingSpecJson!);
                        foreach (var prop in doc.RootElement.EnumerateObject()) have.Add(prop.Name);
                    }
                    catch { }
                }
                var missing = defs.Where(d => !have.Contains(d.Key)).ToList();
                if (missing.Count == 0) return new SpecFieldOutcome(null, null, null);
                var listed = string.Join(", ", missing.Select(d =>
                    d.Key + " (" + d.Label + (d.Options != null && d.Options.Count > 0
                        ? ": " + string.Join("|", d.Options) : "") + ")"));
                return new SpecFieldOutcome(null, null,
                    $"⚠️ '{typeName}' has typed fields still EMPTY, so this part is blank in those " +
                    $"columns and invisible to filters on them: {listed}. Set them with specFields, " +
                    "e.g. specFields='{\"key\":\"value\"}'. The free-text spec line does not fill them.");
            }

            if (defs.Count == 0)
                return new SpecFieldOutcome(
                    $"Type '{typeName}' has no typed fields, so specFields cannot be set on it. " +
                    "Put the detail in the free-text spec line instead. Nothing was changed.",
                    null, null);

            Dictionary<string, System.Text.Json.JsonElement>? supplied;
            try
            {
                supplied = System.Text.Json.JsonSerializer
                    .Deserialize<Dictionary<string, System.Text.Json.JsonElement>>(specFields!);
            }
            catch (Exception ex)
            {
                return new SpecFieldOutcome(
                    $"specFields is not valid JSON ({ex.Message}). Expected an object like " +
                    "{\"ddrGen\":\"DDR4\",\"capacityGb\":16}. Nothing was changed.", null, null);
            }
            if (supplied == null || supplied.Count == 0)
                return new SpecFieldOutcome("specFields was empty. Nothing was changed.", null, null);

            // ⛔ Refuse an unknown key rather than storing it. A typo becomes a property nothing
            // reads and no column shows - the same failure as an unknown type name, silent.
            var known = defs.ToDictionary(d => d.Key, d => d, StringComparer.OrdinalIgnoreCase);
            var bad = supplied.Keys.Where(k => !known.ContainsKey(k)).ToList();
            if (bad.Count > 0)
                return new SpecFieldOutcome(
                    $"Unknown field(s) for type '{typeName}': {string.Join(", ", bad)}. " +
                    $"Valid keys: {string.Join(", ", defs.Select(d => d.Key))}. Nothing was changed.",
                    null, null);

            // Merge over what is already there, so setting one field does not wipe the rest.
            var merged = new Dictionary<string, object?>(StringComparer.Ordinal);
            if (!string.IsNullOrWhiteSpace(existingSpecJson))
            {
                try
                {
                    using var doc = System.Text.Json.JsonDocument.Parse(existingSpecJson!);
                    foreach (var prop in doc.RootElement.EnumerateObject())
                        merged[prop.Name] = prop.Value.Clone();
                }
                catch { }
            }

            foreach (var kv in supplied)
            {
                var def = known[kv.Key];
                var raw = kv.Value.ValueKind == System.Text.Json.JsonValueKind.String
                    ? kv.Value.GetString() : kv.Value.ToString();

                if (def.Kind == "number")
                {
                    if (!decimal.TryParse(raw, out var num))
                        return new SpecFieldOutcome(
                            $"'{def.Key}' is a number field and '{raw}' is not a number. Nothing was changed.",
                            null, null);
                    merged[def.Key] = num;
                }
                else if (def.Kind == "select" && def.Options != null && def.Options.Count > 0)
                {
                    var match = def.Options.FirstOrDefault(o =>
                        string.Equals(o, raw, StringComparison.OrdinalIgnoreCase));
                    if (match == null)
                        return new SpecFieldOutcome(
                            $"'{def.Key}' only accepts: {string.Join(", ", def.Options)}. " +
                            $"Got '{raw}'. Nothing was changed.", null, null);
                    merged[def.Key] = match;   // store the canonical spelling
                }
                else merged[def.Key] = raw;
            }

            return new SpecFieldOutcome(null,
                System.Text.Json.JsonSerializer.Serialize(merged), null);
        }

        [McpServerTool(Name = "lab_briefing")]
        [Description("Homelab summary: every machine with role, status and installed-component count, plus " +
                     "totals by component type and the spaces. Start here for broad questions.")]
        public async Task<string> LabBriefingAsync()
        {
            using var scope = _scopeFactory.CreateScope();
            var briefingService = scope.ServiceProvider.GetRequiredService<Service_Lab_Briefing>();

            var briefing = await briefingService.BuildAsync();
            return Service_Lab_Briefing.RenderText(briefing);
        }

        [McpServerTool(Name = "lab_query")]
        [Description("Look up machines, components and spaces. One machine: its record and installed parts. " +
                     "One space: its U-map and free slots. A search matching one component returns full " +
                     "detail, else a list. Pass at least one argument. Page with the offset in the '... N " +
                     "more' line. To total, use groupBy - never add rows up yourself.")]
        public async Task<string> LabQueryAsync(
            [Description("Machine name or hostname, full or partial (e.g. 'nas').")]
            string? machine = null,
            [Description("Component type, e.g. CPU, GPU, RAM, Storage, Networking.")]
            string? componentType = null,
            [Description("Free text over manufacturer, model, nickname, serial, SKU, spec, machine and notes. " +
                         "Notes hold order numbers and vendors - search the ORDER NUMBER for provenance.")]
            string? search = null,
            [Description("Only usable spare parts on the shelf; retired parts (Graveyard) are excluded.")]
            bool shelfOnly = false,
            [Description("Rows per page. Default 25, max 100.")]
            int limit = 25,
            [Description("Row to start from; the '... N more' line gives the next offset. Default 0.")]
            int offset = 0,
            [Description("Comma-separated columns instead of the full line, e.g. 'id,name,paid'. Valid: id, name, " +
                         "type, machine, status, spec, nickname, msrp, list, paid, serial, sku, notes, market, " +
                         "marketdate, marketsource, acquired. Ask for 'id' to get componentIds.")]
            string? fields = null,
            [Description("Totals instead of rows, grouped by 'machine', 'type' or 'status': count, summed msrp and " +
                         "paid, and how many rows carried each price. Use for any 'how many' or 'what is it " +
                         "worth'.")]
            string? groupBy = null,
            [Description("'tsv' for tab-separated output, about twice the rows per result.")]
            string? format = null,
            [Description("Space name, full or partial (e.g. 'Rack 1'): what occupies it, with U, height, face " +
                         "and planned/installed. Ignores other filters.")]
            string? space = null,
            [Description("YYYY-MM-DD: only rows acquired on or after it. Rows with no acquired date are excluded and " +
                         "COUNTED in the result's scope line - read that count before answering 'bought since'.")]
            string? acquiredSince = null)
        {
            using var scope = _scopeFactory.CreateScope();

            // Rejected, never ignored: a mistyped date silently dropping the filter would answer
            // "bought in the last 90 days" with the whole fleet. Same parse as acquiredAt's.
            DateTime? since = null;
            if (!string.IsNullOrWhiteSpace(acquiredSince))
            {
                if (!DateTime.TryParseExact(acquiredSince.Trim(), "yyyy-MM-dd",
                        System.Globalization.CultureInfo.InvariantCulture,
                        System.Globalization.DateTimeStyles.None, out var parsedSince))
                    return $"acquiredSince must be YYYY-MM-DD, got '{acquiredSince}'.";
                since = parsedSince;
            }

            // ⛔ A READ MUST NEVER REQUIRE A WRITE. Without this there was no way to see
            // what occupied a space: the only signal was the overlap error from attempting
            // a placement, so finding a rack's contents meant probing it with writes.
            if (!string.IsNullOrWhiteSpace(space))
                return await DescribeSpaceAsync(scope, space);

            var query = scope.ServiceProvider.GetRequiredService<Service_Lab_Query>();

            return await query.QueryAsync(machine, componentType, search, shelfOnly,
                                          limit, offset, fields, groupBy, format, since);
        }

        // Renders a space as a U-map, top down, the way you look at a rack.
        private static async Task<string> DescribeSpaceAsync(IServiceScope scope, string want)
        {
            var spacesDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Spaces>();
            var all = (await spacesDb.GetAllSpacesAsync()).ToList();
            want = want.Trim();

            var hits = all.Where(x => string.Equals(x.Name, want, StringComparison.OrdinalIgnoreCase)).ToList();
            if (hits.Count == 0)
                hits = all.Where(x => (x.Name ?? "").Contains(want, StringComparison.OrdinalIgnoreCase)).ToList();
            if (hits.Count == 0)
                return $"No space matches '{want}'. Spaces: " +
                       string.Join(", ", all.Select(x => x.Name).OrderBy(n => n)) + ".";
            if (hits.Count > 1)
                return $"'{want}' is ambiguous: " + string.Join(", ", hits.Select(x => x.Name)) +
                       ". Say the full name.";

            var target = hits[0];
            var placements = (await spacesDb.GetPlacementsAsync(target.Id)).ToList();

            var sb = new StringBuilder();
            sb.Append(target.Name.ToUpperInvariant());
            if (!string.IsNullOrWhiteSpace(target.Kind)) sb.Append($" ({target.Kind}");
            if (target.ParentSpaceId.HasValue) sb.Append($", in {await spacesDb.PathOfAsync(target.ParentSpaceId.Value)}");
            else if (!string.IsNullOrWhiteSpace(target.Location)) sb.Append($", {target.Location}");
            if (!string.IsNullOrWhiteSpace(target.Kind)) sb.Append(')');
            sb.AppendLine();
            var inside = all.Where(x => x.ParentSpaceId == target.Id).Select(x => x.Name).ToList();
            if (inside.Count > 0) sb.AppendLine($"  holds: {string.Join(", ", inside)}");

            if (placements.Count == 0)
            {
                sb.AppendLine(target.HeightU.HasValue ? $"Empty - {target.HeightU}U free." : "Empty.");
                return sb.ToString().TrimEnd();
            }

            // U-numbered spaces read top down; anything else is just a list.
            var racked = placements.Where(x => x.PositionU.HasValue)
                                   .OrderByDescending(x => x.PositionU).ToList();
            var loose = placements.Where(x => !x.PositionU.HasValue).ToList();

            if (racked.Count > 0)
            {
                sb.AppendLine();
                foreach (var pl in racked)
                {
                    var h = pl.HeightU ?? 1;
                    var top = pl.PositionU!.Value + h - 1;
                    var slot = h == 1 ? $"U{pl.PositionU}" : $"U{pl.PositionU}-U{top}";
                    var label = pl.OccupantLabel ?? $"placement {pl.Id}";
                    var bits = new List<string> { pl.OccupantKind ?? "?" };
                    if (!string.Equals(pl.Face, "front", StringComparison.OrdinalIgnoreCase))
                        bits.Add(pl.Face);
                    if (!string.Equals(pl.Status, "installed", StringComparison.OrdinalIgnoreCase))
                        bits.Add(pl.Status);
                    sb.AppendLine($"  {slot,-9} {label}  [{string.Join(", ", bits)}]");
                }
            }

            foreach (var pl in loose)
                sb.AppendLine($"  {"(no U)",-9} {pl.OccupantLabel ?? $"placement {pl.Id}"}  " +
                              $"[{pl.OccupantKind ?? "?"}]");

            // Free U matter more than used ones - they are what you need before placing.
            if (target.HeightU.HasValue)
            {
                var taken = new HashSet<int>();
                foreach (var pl in racked)
                    for (var u = pl.PositionU!.Value; u < pl.PositionU.Value + (pl.HeightU ?? 1); u++)
                        taken.Add(u);
                var free = Enumerable.Range(1, target.HeightU.Value).Where(u => !taken.Contains(u)).ToList();
                sb.AppendLine();
                sb.AppendLine(free.Count == 0
                    ? $"Full - 0U free of {target.HeightU}."
                    : $"{free.Count}U free of {target.HeightU}: " + Describe(free));
            }

            return sb.ToString().TrimEnd();
        }

        // "1-3, 7, 10-12" reads better than a list of every number.
        private static string Describe(List<int> us)
        {
            var parts = new List<string>();
            for (var i = 0; i < us.Count;)
            {
                var j = i;
                while (j + 1 < us.Count && us[j + 1] == us[j] + 1) j++;
                parts.Add(i == j ? $"U{us[i]}" : $"U{us[i]}-U{us[j]}");
                i = j + 1;
            }
            return string.Join(", ", parts);
        }

        // ⚠️ THE FIRST WRITE TOOL. v1 of this endpoint was deliberately read-only: an
        // assistant could answer "what is in this host" but could not change anything.
        // This breaks that seal in the narrowest way available - it APPENDS an observation
        // to a ledger and can neither modify inventory nor overwrite a previous figure.
        // Worst case is a wrong price with a date and a source next to it, which is exactly
        // what the SourceUrl field exists to make checkable.
        [McpServerTool(Name = "lab_record_market_value")]
        [Description("Record what a component costs NEW today, as an appended dated observation (history is " +
                     "kept). ⛔ Only a price read off the listing page this session - never estimated, " +
                     "recalled, derived from MSRP or taken from another model without opening the URL. ⛔ New " +
                     "retail only: never eBay, marketplace, used, refurbished or open-box. ⛔ Exact model/SKU, " +
                     "in stock now; otherwise record nothing and say so. One observation per vendor. Always " +
                     "pass sourceUrl. Wrong entry: delete it with lab_delete_market_value, never a correcting " +
                     "note.")]
        public async Task<string> LabRecordMarketValueAsync(
            [Description("Component id, from lab_query fields=id.")]
            int componentId,
            [Description("Price in dollars.")]
            double value,
            [Description("Retailer: newegg, amazon, bestbuy, microcenter, manufacturer. Never a marketplace.")]
            string? source = null,
            [Description("Listing URL the price was read from.")]
            string? sourceUrl = null,
            [Description("Caveats, e.g. 'sale, ends 8/15'.")]
            string? notes = null)
        {
            using var scope = _scopeFactory.CreateScope();
            var components = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Components>();
            var market = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_MarketValues>();

            var component = await components.GetComponentByIdAsync(componentId);
            if (component == null) return $"No component with id {componentId}.";
            if (value <= 0) return "Value must be greater than zero.";

            var newId = await market.RecordAsync(new Model_Lab_MarketValue
            {
                ComponentId = componentId,
                Value = value,
                Condition = "new",          // the only condition this ledger tracks
                Source = source,
                SourceUrl = sourceUrl,
                Notes = notes,
                CapturedAt = DateTime.UtcNow
            });

            var history = (await market.GetForComponentAsync(componentId)).ToList();
            var label = string.Join(" ", new[] { component.Manufacturer, component.Model }
                .Where(x => !string.IsNullOrWhiteSpace(x)));
            return $"Recorded {value:0.##} new for {label} (observation {newId}). " +
                   $"{history.Count} observation(s) on record.";
        }

        [McpServerTool(Name = "lab_move_component")]
        [Description("Move a component into a machine or to the shelf; writes the movement ledger. Status " +
                     "becomes active when installed, spare when shelved. Say what moved where.")]
        public async Task<string> LabMoveComponentAsync(
            [Description("Component id, from lab_query fields=id.")]
            int componentId,
            [Description("Machine name or hostname, or 'shelf'.")]
            string toMachine,
            [Description("Optional slot, e.g. 'M.2 4.0 x4 (CPU)'.")]
            string? slotLabel = null,
            [Description("Optional reason, e.g. 'upgrade', 'RMA'.")]
            string? reason = null)
        {
            using var scope = _scopeFactory.CreateScope();
            var components = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Components>();
            var machines = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Machines>();

            var component = await components.GetComponentByIdAsync(componentId);
            if (component == null) return $"No component with id {componentId}.";

            int? toId = null;
            string toName = "shelf";
            var want = (toMachine ?? "").Trim();
            if (!string.IsNullOrEmpty(want) && !want.Equals("shelf", StringComparison.OrdinalIgnoreCase))
            {
                var all = (await machines.GetAllMachinesAsync()).ToList();
                var hits = all.Where(m =>
                        string.Equals(m.Name, want, StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(m.Hostname, want, StringComparison.OrdinalIgnoreCase))
                    .ToList();
                if (hits.Count == 0)
                    hits = all.Where(m =>
                            (m.Name ?? "").Contains(want, StringComparison.OrdinalIgnoreCase) ||
                            (m.Hostname ?? "").Contains(want, StringComparison.OrdinalIgnoreCase))
                        .ToList();
                if (hits.Count == 0)
                    return $"No machine matches '{want}'. Machines: " +
                           string.Join(", ", all.Select(m => m.Name).OrderBy(n => n)) + ", or 'shelf'.";
                if (hits.Count > 1)
                    return $"'{want}' is ambiguous: " + string.Join(", ", hits.Select(m => m.Name)) +
                           ". Say the full name.";
                toId = hits[0].Id;
                toName = hits[0].Name ?? want;
            }

            if (toId == component.CurrentMachineId)
                return $"Already there - no move recorded ({(toId == null ? "on the shelf" : $"in {toName}")}).";

            var fromName = "the shelf";
            if (component.CurrentMachineId is int fromId)
                fromName = (await machines.GetMachineByIdAsync(fromId))?.Name ?? $"machine {fromId}";

            var movement = await components.MoveComponentAsync(componentId, toId, null, slotLabel, reason);
            if (movement == null) return $"No component with id {componentId}.";

            var label = string.Join(" ", new[] { component.Manufacturer, component.Model }
                .Where(x => !string.IsNullOrWhiteSpace(x)));
            var slot = string.IsNullOrWhiteSpace(slotLabel) ? "" : $", slot {slotLabel}";
            return $"Moved {label} from {fromName} to {(toId == null ? "the shelf" : toName)}{slot} " +
                   $"(movement {movement.Id}). Status is now " +
                   $"{(toId == null ? "spare" : "active")}.";
        }

        [McpServerTool(Name = "lab_set_component_status")]
        [Description("Retire a component (sold, dead, damaged, lost, disposed - it moves to the Graveyard and " +
                     "out of its machine), return a retired one with spare, or mark one ON ORDER with incoming " +
                     "(bought or about to be, not in hand: never on the shelf, never in the value totals; it becomes " +
                     "active when installed). Only for parts that really left, failed or are on order. To install, " +
                     "use lab_move_component. A standalone part (switch, modem) is active while it is a live device " +
                     "on the network page.")]
        public async Task<string> LabSetComponentStatusAsync(
            [Description("Component id, from lab_query fields=id.")]
            int componentId,
            [Description("sold, dead, damaged, lost, disposed, spare or incoming (on order).")]
            string status,
            [Description("Optional reason, e.g. 'failed SMART'.")]
            string? reason = null)
        {
            using var scope = _scopeFactory.CreateScope();
            var components = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Components>();
            var machines = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Machines>();

            var component = await components.GetComponentByIdAsync(componentId);
            if (component == null) return $"No component with id {componentId}.";

            var fromName = component.CurrentMachineId is int fromId
                ? (await machines.GetMachineByIdAsync(fromId))?.Name ?? $"machine {fromId}"
                : null;

            Model_Lab_Component? updated;
            try
            {
                updated = await components.SetStatusAsync(componentId, status, reason);
            }
            catch (ArgumentException ex)
            {
                return ex.Message;
            }
            if (updated == null) return $"No component with id {componentId}.";

            var label = string.Join(" ", new[] { component.Manufacturer, component.Model }
                .Where(x => !string.IsNullOrWhiteSpace(x)));
            var removed = fromName != null ? $" It was removed from {fromName}." : "";
            return $"{label} is now {updated.Status}.{removed}";
        }

        [McpServerTool(Name = "lab_delete_market_value")]
        [Description("Delete ONE wrong market-value observation - the correction path. The " +
                     "ledger is append-only with no edit-in-place: delete only a row that " +
                     "is factually wrong (bad price, wrong component, resale source, " +
                     "out-of-stock listing), then record the correct figure with " +
                     "lab_record_market_value if one exists. Not for reshaping history.")]
        public async Task<string> LabDeleteMarketValueAsync(
            [Description("Component id the observation belongs to.")]
            int componentId,
            [Description("Id of the observation to delete (visible in the Observations tab " +
                         "and the price pipeline's report). Omit or pass 0 to delete the " +
                         "NEWEST observation on the component.")]
            int valueId = 0)
        {
            using var scope = _scopeFactory.CreateScope();
            var components = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Components>();
            var market = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_MarketValues>();

            var component = await components.GetComponentByIdAsync(componentId);
            if (component == null) return $"No component with id {componentId}.";

            var target = valueId > 0
                ? (await market.GetForComponentAsync(componentId)).FirstOrDefault(v => v.Id == valueId)
                : await market.GetLatestForComponentAsync(componentId);
            if (target == null)
                return valueId > 0
                    ? $"No observation {valueId} on component {componentId}."
                    : $"Component {componentId} has no observations.";

            await market.DeleteAsync(componentId, target.Id);

            var remaining = (await market.GetForComponentAsync(componentId)).ToList();
            var label = string.Join(" ", new[] { component.Manufacturer, component.Model }
                .Where(x => !string.IsNullOrWhiteSpace(x)));
            return $"Deleted observation {target.Id} ({target.Value:0.##} from " +
                   $"{target.CapturedAt:yyyy-MM-dd}, source {target.Source ?? "none"}) on {label}. " +
                   $"{remaining.Count} observation(s) remain. If a correct figure exists, " +
                   $"record it now with lab_record_market_value.";
        }

        // ---- the two captured-once price facts -------------------------------------
        // Msrp, ListPrice and PurchasePrice are facts about a PAST event, so they are
        // columns, not a ledger - unlike the market value, which changes and so has rows
        // (Model_Lab_MarketValue). This is their MCP write path, so filing does not have to
        // go through the web UI's PUT - NOT a second way to write a price an agent recalled.
        [McpServerTool(Name = "lab_set_purchase_pricing")]
        [Description("Set purchase-time prices, which never change: msrp (launch list), listPrice (invoice " +
                     "price before discounts), purchasePrice (what the owner paid). ⛔ Not today's price - that is " +
                     "lab_record_market_value. ⛔ From a document only: listPrice/purchasePrice off the " +
                     "invoice, msrp off the launch page or maker's store; no document = write nothing. ⛔ " +
                     "Pre-tax UNIT price; a multi-pack line divided by its units. Seller discounts reduce " +
                     "purchasePrice only; an order-level discount is split pro-rata; gift cards, cashback and " +
                     "shipping reduce neither. ⚠️ Overwrites - the reply reads back old values; say so if you " +
                     "replaced one by mistake.")]
        public async Task<string> LabSetPurchasePricingAsync(
            [Description("Component id, from lab_query fields=id.")]
            int componentId,
            [Description("Manufacturer's launch list price, dollars.")]
            double? msrp = null,
            [Description("Invoice list price for one unit before seller discounts, dollars.")]
            double? listPrice = null,
            [Description("Price actually paid for one unit, dollars. 0 means genuinely free (a $0.00 invoice " +
                         "line).")]
            double? purchasePrice = null,
            [Description("Date listPrice applied, YYYY-MM-DD. Defaults to the acquired date.")]
            string? listPriceDate = null,
            [Description("Order date off the invoice, YYYY-MM-DD, for rows whose paperwork came later or was dated " +
                         "wrong. Overwrites.")]
            string? acquiredAt = null,
            [Description("Comma-separated fields to EMPTY because the value is wrong (not merely unverified): " +
                         "msrp, list, listDate, paid, notes. Can't clear and set one field in the same call.")]
            string? clear = null,
            [Description("Pricing context, e.g. 'list $159.99 less 4%'. ⚠️ Replaces existing pricing notes.")]
            string? notes = null)
        {
            // Which columns to null. Parsed up front so a typo refuses before anything
            // is written, the same rule an unknown component type follows.
            var clearing = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (!string.IsNullOrWhiteSpace(clear))
            {
                foreach (var raw in clear.Split(',', StringSplitOptions.RemoveEmptyEntries))
                {
                    var f = raw.Trim().ToLowerInvariant();
                    var canonical = f switch
                    {
                        "msrp" => "msrp",
                        "list" or "listprice" => "list",
                        "listdate" or "listpricedate" => "listdate",
                        "paid" or "purchaseprice" => "paid",
                        "notes" or "listpricenotes" => "notes",
                        _ => null,
                    };
                    if (canonical == null)
                        return $"'{raw.Trim()}' is not a clearable field. Valid: msrp, list, " +
                               $"listDate, paid, notes. Nothing was written.";
                    clearing.Add(canonical);
                }

                var conflict =
                    (clearing.Contains("msrp") && msrp.HasValue) ? "msrp" :
                    (clearing.Contains("list") && listPrice.HasValue) ? "list" :
                    (clearing.Contains("paid") && purchasePrice.HasValue) ? "paid" :
                    (clearing.Contains("listdate") && !string.IsNullOrWhiteSpace(listPriceDate)) ? "listDate" :
                    (clearing.Contains("notes") && notes != null) ? "notes" : null;
                if (conflict != null)
                    return $"You asked to clear '{conflict}' and to set it in the same call. " +
                           $"Nothing was written - say which one you meant.";
            }

            if (!msrp.HasValue && !listPrice.HasValue && !purchasePrice.HasValue &&
                clearing.Count == 0 && string.IsNullOrWhiteSpace(acquiredAt) &&
                string.IsNullOrWhiteSpace(notes))
                return "Pass at least one of msrp, listPrice, purchasePrice, acquiredAt or clear. " +
                       "Nothing was written. If you meant the CURRENT price, that is " +
                       "lab_record_market_value.";

            // A price of zero is how "I do not know" gets written by accident, and a
            // stored 0 reads as free rather than as unknown. Refuse it: leaving the
            // column NULL is the honest way to say nothing is known.
            foreach (var (label, v) in new[] { ("msrp", msrp), ("listPrice", listPrice) })
            {
                if (v.HasValue && v.Value <= 0)
                    return $"{label} was {v.Value:0.##}, which is not a price. Nothing was " +
                           $"written - leave the field empty rather than storing 0, which " +
                           $"would read as 'this was free'.";
            }

            // ⚠️ purchasePrice is deliberately NOT in the loop above. A free promo
            // line really did cost nothing, so 0 is a fact here rather than a missing
            // value, and only a negative is impossible.
            if (purchasePrice is < 0)
                return $"purchasePrice was {purchasePrice:0.##}. A refund is not a negative " +
                       $"purchase price - retire the component instead. Nothing was written.";

            if (!string.IsNullOrWhiteSpace(listPriceDate) &&
                !DateTime.TryParseExact(listPriceDate.Trim(), "yyyy-MM-dd",
                    System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None, out _))
                return $"listPriceDate '{listPriceDate}' is not YYYY-MM-DD. Nothing was written.";

            DateTime? acquiredParsed = null;
            if (!string.IsNullOrWhiteSpace(acquiredAt))
            {
                if (!DateTime.TryParseExact(acquiredAt.Trim(), "yyyy-MM-dd",
                        System.Globalization.CultureInfo.InvariantCulture,
                        System.Globalization.DateTimeStyles.None, out var acq))
                    return $"acquiredAt '{acquiredAt}' is not YYYY-MM-DD. Nothing was written.";
                acquiredParsed = acq;
            }

            using var scope = _scopeFactory.CreateScope();
            var componentsDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Components>();

            var component = await componentsDb.GetComponentByIdAsync(componentId);
            if (component == null) return $"No component with id {componentId}. Nothing was changed.";

            // ⚠️ A child part never carries a price of its own - an iGPU inside its CPU, a
            // soldered barebones CPU. It inherits the parent's purchase facts on read, so
            // a figure written here would be a second, disagreeing answer to the same
            // question. Send the caller to the parent instead of quietly splitting them.
            // ⚠️ msrp is the exception: it is a fact about the PRODUCT, the same for every
            // unit ever sold, and a soldered CPU or a board out of a mystery box has one
            // whether or not it was ever priced on its own. What a child may not carry is
            // what the owner PAID - that belongs to the line that bought it.
            var childBlocked = listPrice.HasValue || purchasePrice.HasValue ||
                               !string.IsNullOrWhiteSpace(acquiredAt) || !string.IsNullOrWhiteSpace(listPriceDate) ||
                               (clear ?? "").Split(',').Any(c => c.Trim().ToLowerInvariant() is "list" or "paid" or "listdate" or "acquired");
            if (component.ParentComponentId.HasValue && childBlocked)
                return $"Component {componentId} arrived inside component " +
                       $"{component.ParentComponentId} and carries no price of its own - it " +
                       $"inherits the parent's purchase facts on read. Nothing was written. " +
                       $"Price the parent instead if the figure is really about the whole unit. " +
                       $"(msrp on its own IS allowed on a child - a fact about the product, not the purchase.)";

            var componentLabel = string.Join(" ", new[] { component.Manufacturer, component.Model }
                .Where(x => !string.IsNullOrWhiteSpace(x)));
            if (string.IsNullOrWhiteSpace(componentLabel))
                componentLabel = component.Name ?? $"component {componentId}";

            var changes = new List<string>();

            if (msrp.HasValue && msrp != component.Msrp)
            {
                changes.Add($"msrp {(component.Msrp.HasValue ? $"${component.Msrp:0.##}" : "(empty)")}" +
                            $" -> ${msrp:0.##}");
                component.Msrp = msrp;
            }

            if (listPrice.HasValue && listPrice != component.ListPrice)
            {
                changes.Add($"list {(component.ListPrice.HasValue ? $"${component.ListPrice:0.##}" : "(empty)")}" +
                            $" -> ${listPrice:0.##}");
                component.ListPrice = listPrice;
            }

            if (purchasePrice.HasValue && purchasePrice != component.PurchasePrice)
            {
                changes.Add($"paid {(component.PurchasePrice.HasValue ? $"${component.PurchasePrice:0.##}" : "(empty)")}" +
                            $" -> ${purchasePrice:0.##}");
                component.PurchasePrice = purchasePrice;
            }

            if (clearing.Contains("msrp") && component.Msrp.HasValue)
            {
                changes.Add($"msrp ${component.Msrp:0.##} -> (cleared)");
                component.Msrp = null;
            }
            if (clearing.Contains("list") && component.ListPrice.HasValue)
            {
                changes.Add($"list ${component.ListPrice:0.##} -> (cleared)");
                component.ListPrice = null;
            }
            if (clearing.Contains("paid") && component.PurchasePrice.HasValue)
            {
                changes.Add($"paid ${component.PurchasePrice:0.##} -> (cleared)");
                component.PurchasePrice = null;
            }
            if (clearing.Contains("listdate") && !string.IsNullOrWhiteSpace(component.ListPriceDate))
            {
                changes.Add($"list date {component.ListPriceDate} -> (cleared)");
                component.ListPriceDate = null;
            }
            if (clearing.Contains("notes") && !string.IsNullOrWhiteSpace(component.ListPriceNotes))
            {
                changes.Add($"pricing notes {component.ListPriceNotes} -> (cleared)");
                component.ListPriceNotes = null;
            }

            if (acquiredParsed.HasValue && component.AcquiredAt?.Date != acquiredParsed.Value.Date)
            {
                changes.Add($"acquired {component.AcquiredAt?.ToString("yyyy-MM-dd") ?? "(empty)"} -> {acquiredParsed:yyyy-MM-dd}");
                component.AcquiredAt = acquiredParsed;
            }

            // An undated list price cannot be checked later, which is the failure the
            // market ledger's sourceUrl rule exists to prevent. Fall back to the acquired
            // date - for an invoice list that IS the date it was true.
            var effectiveDate = !string.IsNullOrWhiteSpace(listPriceDate)
                ? listPriceDate.Trim()
                : (listPrice.HasValue && string.IsNullOrWhiteSpace(component.ListPriceDate)
                    ? component.AcquiredAt?.ToString("yyyy-MM-dd")
                    : null);

            if (!string.IsNullOrWhiteSpace(effectiveDate) && effectiveDate != component.ListPriceDate)
            {
                changes.Add($"list date {component.ListPriceDate ?? "(empty)"} -> {effectiveDate}");
                component.ListPriceDate = effectiveDate;
            }

            if (notes != null && notes.Trim() != (component.ListPriceNotes ?? string.Empty))
            {
                changes.Add($"pricing notes " +
                            $"{(string.IsNullOrEmpty(component.ListPriceNotes) ? "(empty)" : component.ListPriceNotes)}" +
                            $" -> {notes.Trim()}");
                component.ListPriceNotes = notes.Trim();
            }

            if (changes.Count == 0)
                return $"Nothing to change on {componentLabel} (id {componentId}) - every value " +
                       $"you passed already matches. Nothing was written.";

            await componentsDb.UpdateComponentAsync(component);

            var reply = $"Set purchase pricing on {componentLabel} (id {componentId}):" +
                        Environment.NewLine +
                        string.Join(Environment.NewLine, changes.Select(c => "  " + c));

            if (listPrice.HasValue && string.IsNullOrWhiteSpace(component.ListPriceDate))
                reply += Environment.NewLine +
                         "⚠️ The list price is UNDATED - this component has no acquired date " +
                         "either. Pass listPriceDate from the invoice so the figure can be " +
                         "checked later.";

            return reply;
        }

        [McpServerTool(Name = "lab_add_from_invoice")]
        [Description("File a purchase: create the components an invoice covers and attach it, or attach an " +
                     "invoice to an existing component (componentId, no components). Every figure comes off " +
                     "the document - never estimated or recalled. ⛔ One row per physical unit at the pre-tax " +
                     "UNIT price: qty 2 is two rows; a multi-pack ('2-Pack', 'Lot Of 2' - check the title) is " +
                     "its units with the line price divided. Rows must sum to the item subtotal. ⛔ lab_query " +
                     "the ORDER NUMBER first. The server refuses a known order and lists what it bought: if " +
                     "your line is one of them, attach to that id; only genuinely different items re-run with " +
                     "confirmAdditionalLines=true. ⛔ A returned or refunded item is not owned - check the " +
                     "document for 'Refund'/'Return', file only kept lines, and say what you left out.")]
        public async Task<string> LabAddFromInvoiceAsync(
            [Description("Invoice file name, e.g. 'order-111-8136640.pdf'.")]
            string fileName,
            [Description("Server-readable path (within LAB_ATTACHMENT_ROOTS). Usually omit it: the reply then " +
                         "gives a one-line curl with a single-use upload ticket that works from any machine - run " +
                         "it exactly.")]
            string? filePath = null,
            [Description("JSON array of {type, manufacturer, model, spec, purchasePrice, listPrice, msrp, units}; " +
                         "units defaults to 1 and creates that many rows. listPrice is the document's " +
                         "pre-discount UNIT price when it prints one; msrp only when the document states the " +
                         "maker's launch price - never estimate, lab_set_purchase_pricing can add them later. " +
                         "Omit to attach to componentId.")]
            string? components = null,
            [Description("Existing component to attach the invoice to, from lab_query fields=id.")]
            int? componentId = null,
            [Description("Vendor as printed, e.g. Amazon, Newegg, Micro Center, Best Buy.")]
            string? vendor = null,
            [Description("Order number as printed.")]
            string? orderRef = null,
            [Description("Order date, YYYY-MM-DD.")]
            string? acquiredAt = null,
            [Description("Only after a refusal listed what the order already bought and your lines are genuinely " +
                         "different items. Never on a first attempt.")]
            bool confirmAdditionalLines = false)
        {
            // ⛔ THE BYTES NEVER PASS THROUGH THE MODEL. A chat model cannot reproduce a
            // 90 KB file - it emits a valid-looking header and drifts, and the row then reads
            // as documented while the paperwork cannot be opened. Either the SERVER reads the
            // file itself, or the caller uploads it out of band with the curl below.
            byte[] bytes = Array.Empty<byte>();
            var haveFile = false;

            if (!string.IsNullOrWhiteSpace(filePath))
            {
                var denied = Service_Lab_Attachment_Store.PathRefusal(filePath!);
                if (denied != null) return denied + " Nothing was written.";

                try
                {
                    bytes = await File.ReadAllBytesAsync(filePath!);
                }
                catch (Exception ex)
                {
                    return $"Could not read {filePath}: {ex.Message}. Nothing was written. " +
                           "If the file is not on this server, omit filePath and use the curl " +
                           "in the reply instead.";
                }
                haveFile = true;

                var sizeProblem = Service_Lab_Attachment_Store.EnsureStorable(bytes.LongLength, 1, null);
                if (sizeProblem != null) return sizeProblem + " Nothing was written.";

                // ⛔ Refuse a corrupt receipt outright - it is worse than no receipt, because
                // the row then reads as documented when the paperwork cannot be opened.
                var integrity = Service_Lab_Attachment_Store.ValidateIntegrity(bytes, fileName, "invoice");
                if (integrity != null) return "NOTHING was written - " + integrity;
            }

            using var scope = _scopeFactory.CreateScope();
            var componentsDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Components>();
            var store = scope.ServiceProvider.GetRequiredService<Service_Lab_Attachment_Store>();

            DateTime? acquired = DateTime.TryParse(acquiredAt, out var parsed) ? parsed : null;
            var provenance = string.Join(" ", new[]
            {
                string.IsNullOrWhiteSpace(vendor) ? null : vendor + " order",
                orderRef,
                acquired.HasValue ? "placed " + acquired.Value.ToString("yyyy-MM-dd") : null,
            }.Where(x => !string.IsNullOrWhiteSpace(x)));

            // Attach-only: the purchase is already recorded, this is just its paperwork.
            if (componentId.HasValue && string.IsNullOrWhiteSpace(components))
            {
                var existing = await componentsDb.GetComponentByIdAsync(componentId.Value);
                if (existing == null)
                    return $"No component with id {componentId}. Nothing was written.";

                if (!haveFile)
                {
                    // No readable path - hand back a single-use ticket instead of a command
                    // that would 401. The caller uploads from wherever the file actually is.
                    var tickets = scope.ServiceProvider.GetRequiredService<Service_Lab_Attachment_Tickets>();
                    var t = tickets.Mint(new[] { componentId!.Value }, null, "invoice", provenance);
                    // The date and vendor are on the invoice the caller just read; a row that
                    // lacks them gets them now, so paperwork arriving late still completes the
                    // record. Never overwrites a value already there.
                    var filledNow = await FillPurchaseFactsAsync(componentsDb, existing, acquired, vendor);
                    return $"Nothing attached yet - this server cannot read that path. " +
                           (filledNow != null ? filledNow + " " : "") +
                           $"Upload it with this command (single use, expires in " +
                           $"{(int)Service_Lab_Attachment_Tickets.Lifetime.TotalMinutes} minutes):" +
                           $"{Environment.NewLine}  {Service_Lab_Attachment_Store.UploadHint(t.Token)}";
                }

                var one = await store.StoreAsync(bytes, fileName, null, componentId, null,
                                                 "invoice", provenance);
                var filled = await FillPurchaseFactsAsync(componentsDb, existing, acquired, vendor);
                return $"Attached {one.FileName} to {existing.Manufacturer} {existing.Model} " +
                       $"(id {existing.Id}, {Service_Lab_Attachment_Store.ComponentLink(existing.Id)}). " +
                       (filled ?? "Nothing else changed.");
            }

            if (string.IsNullOrWhiteSpace(components))
                return "Pass components to create rows, or componentId to attach to an " +
                       "existing one. Nothing was written.";

            List<InvoiceLine>? lines;
            try
            {
                lines = System.Text.Json.JsonSerializer.Deserialize<List<InvoiceLine>>(
                    components,
                    new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            }
            catch (System.Text.Json.JsonException ex)
            {
                return $"components is not valid JSON ({ex.Message}). Nothing was written.";
            }
            if (lines == null || lines.Count == 0)
                return "components parsed to an empty array. Nothing was written.";

            foreach (var line in lines)
            {
                if (string.IsNullOrWhiteSpace(line.Model))
                    return "Every entry needs a model. Nothing was written.";

                // Same rule lab_set_purchase_pricing enforces: a stored 0 reads as free rather
                // than as unknown, so a bad figure is refused here where it costs one call -
                // not written into a row that then has to be corrected.
                foreach (var (label, v) in new[] { ("msrp", line.Msrp), ("listPrice", line.ListPrice) })
                {
                    if (v.HasValue && v.Value <= 0)
                        return $"{label} was {v.Value:0.##} on the {line.Model} line, which is not a " +
                               $"price. Nothing was written - omit the field instead of storing 0.";
                }
            }

            // ⛔ SERVER-SIDE DUPLICATE GUARD, because the instruction to "lab_query first" is
            // not enough: an agent that DID check can search the invoice's full product title
            // ("ACME X1 512GB SATA SSD (X1-512-A)") and match nothing, because the existing row's
            // model reads "X1 512GB". Fuzzy name matching is not a duplicate check.
            //
            // 🔑 The order number IS one: it is exact, it is printed on the document, and this
            // tool already takes it. Same order + same model = already filed.
            //
            // ⛔ MATCHING ON THE MODEL STRING ALONE IS NOT ENOUGH EITHER: two sources spell the
            // same object differently ("1U Blank Panel Filler Panel" against a stored "7 inch 1U
            // Blank Panel"), and both carry the same order number. An exact-string test on a
            // field two sources spell differently passes precisely when it is needed.
            //
            // So the order number alone stops the call. Same order + DIFFERENT model is
            // still legitimate - one invoice routinely carries several line items - but it is
            // never allowed to happen SILENTLY: the tool refuses, shows what that order
            // already bought, and the caller re-runs with confirmAdditionalLines to say it
            // looked. That costs a legitimate multi-line filing one extra call (the lines of
            // one invoice go in a single call anyway, so a second call for the same order is
            // already the unusual case) and it makes filing a duplicate impossible to do
            // without reading what is there.
            if (!string.IsNullOrWhiteSpace(orderRef))
            {
                var existing = (await componentsDb.GetAllComponentsAsync()).ToList();
                var onOrder = existing
                    .Where(c => !string.IsNullOrWhiteSpace(c.Notes) &&
                                c.Notes!.Contains(orderRef, StringComparison.OrdinalIgnoreCase))
                    .ToList();

                var clashes = lines
                    .Select(l => new
                    {
                        Line = l,
                        Match = onOrder.FirstOrDefault(c =>
                            string.Equals(c.Model?.Trim(), l.Model?.Trim(), StringComparison.OrdinalIgnoreCase))
                    })
                    .Where(x => x.Match != null)
                    .ToList();

                // ⚠️ A retired row still counts as filed - it is still that purchase. Measured
                // an agent that could not delete rows carrying a bad attachment
                // marked them disposed and tried to re-file the order clean; this check then
                // refused the re-file, so every part of the order sat in the Graveyard with
                // nothing replacing it. The way out of that is to bring the row BACK, not to
                // file it twice - so say so, and say which rows are retired.
                static string Tag(Model_Lab_Component c) =>
                    Service_Database_Manager_Lab_Components.IsRetiredStatus(c.Status) ? $"  [{c.Status.ToUpperInvariant()}]" : "";
                var anyRetired = onOrder.Any(c => Service_Database_Manager_Lab_Components.IsRetiredStatus(c.Status));
                var retiredNote = anyRetired
                    ? Environment.NewLine +
                      "⚠️ Rows tagged [SOLD/DEAD/DAMAGED/LOST/DISPOSED] are RETIRED but still on record " +
                      "for this order. If that retirement was a workaround - a row you could not delete " +
                      "because of a bad attachment - the fix is lab_delete_attachment on the junk file, " +
                      "then lab_set_component_status to 'spare' to bring the row back. Do not file the " +
                      "purchase a second time; two rows for one part is exactly what this check exists " +
                      "to stop."
                    : "";

                if (clashes.Count > 0)
                {
                    var found = string.Join(Environment.NewLine, clashes.Select(x =>
                        $"  id {x.Match!.Id}  {x.Match.Manufacturer} {x.Match.Model}  " +
                        $"${x.Match.PurchasePrice:0.##}{Tag(x.Match)}"));
                    return $"ALREADY FILED - nothing was written. Order {orderRef} is already on " +
                           $"record for {(clashes.Count == 1 ? "this item" : "these items")}:" +
                           Environment.NewLine + found + Environment.NewLine +
                           $"⛔ Do NOT file it again. If the invoice is missing from that record, " +
                           $"attach it with the wrapper against the id above. If a DIFFERENT line " +
                           $"on the same invoice is genuinely new, call again with only that line." +
                           retiredNote;
                }

                // No exact clash - but this order has bought things before. Show them.
                if (onOrder.Count > 0 && !confirmAdditionalLines)
                {
                    var already = string.Join(Environment.NewLine, onOrder
                        .OrderBy(c => c.Id)
                        .Take(40)
                        .Select(c => $"  id {c.Id}  {c.Manufacturer} {c.Model}  " +
                                     $"${c.PurchasePrice:0.##}  ({c.Type}){Tag(c)}"));
                    var more = onOrder.Count > 40 ? $"{Environment.NewLine}  ... and {onOrder.Count - 40} more" : "";
                    var wanted = string.Join(Environment.NewLine, lines
                        .Select(l => $"  {l.Manufacturer} {l.Model}  ${l.PurchasePrice:0.##}"));
                    return $"STOP AND COMPARE - nothing was written. Order {orderRef} already has " +
                           $"{onOrder.Count} component(s) on record:" + Environment.NewLine + already + more +
                           Environment.NewLine + "You are about to add:" + Environment.NewLine + wanted +
                           Environment.NewLine +
                           $"⚠️ The SAME part is often written two different ways - a title off an " +
                           $"invoice against a shorter stored model - so read the list above and " +
                           $"decide whether any of it IS what you are filing. " +
                           $"⛔ If it is already there, do not file it: attach the paperwork to that " +
                           $"id instead, or correct it with lab_update_component. " +
                           $"✅ Only if these really are different line items of the same order, " +
                           $"call again with confirmAdditionalLines set to true." +
                           retiredNote;
                }
            }

            var created = new List<string>();
            var createdIds = new List<int>();
            var total = 0d;
            foreach (var line in lines)
            {
                var units = line.Units is > 0 ? line.Units.Value : 1;
                for (var n = 0; n < units; n++)
                {
                    var component = new Model_Lab_Component
                    {
                        Type = string.IsNullOrWhiteSpace(line.Type) ? "Other" : line.Type!,
                        Manufacturer = line.Manufacturer,
                        Model = line.Model,
                        Spec = line.Spec,
                        PurchasePrice = line.PurchasePrice,
                        ListPrice = line.ListPrice,
                        Msrp = line.Msrp,
                        Status = "active",
                        Vendor = vendor,
                        AcquiredAt = acquired,
                        Notes = string.IsNullOrWhiteSpace(provenance) ? null : provenance,
                    };
                    var newId = await componentsDb.CreateComponentAsync(component);
                    if (haveFile)
                        await store.StoreAsync(bytes, fileName, null, newId, null, "invoice", provenance);
                    createdIds.Add(newId);
                    created.Add($"  {newId}  {component.Type,-7} {line.Manufacturer} {line.Model}" +
                                (line.ListPrice.HasValue ? $"  list ${line.ListPrice:0.##}" : "") +
                                (line.Msrp.HasValue ? $"  msrp ${line.Msrp:0.##}" : "") +
                                (line.PurchasePrice.HasValue ? $"  paid ${line.PurchasePrice:0.##}" : "") +
                                $"  {Service_Lab_Attachment_Store.ComponentLink(newId)}");
                    total += line.PurchasePrice ?? 0;
                }
            }

            var head = haveFile
                ? $"Filed {fileName}: {created.Count} component(s) created, invoice attached to " +
                  $"each (stored once, linked {created.Count} times)."
                : $"Created {created.Count} component(s) from {fileName}. ⛔ NO INVOICE IS " +
                  $"ATTACHED YET - run this to attach the real file, which is already on disk:" +
                  Environment.NewLine +
                  $"  {Service_Lab_Attachment_Store.UploadHint(scope.ServiceProvider.GetRequiredService<Service_Lab_Attachment_Tickets>().Mint(createdIds, null, "invoice", provenance).Token)}";

            return head + Environment.NewLine +
                   string.Join(Environment.NewLine, created) + Environment.NewLine +
                   $"Line total ${total:0.##} - confirm that matches the invoice's item subtotal. " +
                   "Wrong? Correct it with lab_update rather than filing a second copy. " +
                   "When you report, give the user the link on each row, not just the id.";
        }

        // Shape of one entry in the components argument. The MCP surface takes this as a
        // JSON string rather than a nested schema: tool schemas are converted to a
        // constrained grammar by llama.cpp-backed runtimes, and flat scalar parameters are
        // the shape those runtimes handle reliably.
        private sealed class InvoiceLine
        {
            public string? Type { get; set; }
            public string? Manufacturer { get; set; }
            public string? Model { get; set; }
            public string? Spec { get; set; }
            public double? PurchasePrice { get; set; }
            public double? ListPrice { get; set; }   // the document's pre-discount unit price, when it prints one
            public double? Msrp { get; set; }        // the maker's launch price, when the document states it
            public int? Units { get; set; }
        }


        // ⛔ PAPERWORK AN AGENT CAN WRITE, IT MUST BE ABLE TO READ. lab_add_from_invoice
        // opens with "READ THE INVOICE FIRST"; without tools to list, inspect and remove an
        // attachment, a blank file once uploaded is invisible to the agent that uploaded it and
        // permanent for everyone - and the row can never be deleted (lab_delete_component
        // refuses anything with an attachment).
        [McpServerTool(Name = "lab_list_attachments")]
        [Description("List a component's attachments with what each really is, judged by its bytes. Check " +
                     "before trusting that a row has an invoice. Lines marked ⛔ are junk for " +
                     "lab_delete_attachment.")]
        public async Task<string> LabListAttachmentsAsync(
            [Description("Component id, from lab_query fields=id.")]
            int componentId)
        {
            using var scope = _scopeFactory.CreateScope();
            var componentsDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Components>();
            var attachmentsDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Attachments>();
            var store = scope.ServiceProvider.GetRequiredService<Service_Lab_Attachment_Store>();

            var component = await componentsDb.GetComponentByIdAsync(componentId);
            if (component == null) return $"No component with id {componentId}.";
            var label = component.Name ?? string.Join(" ", new[] { component.Manufacturer, component.Model }
                .Where(x => !string.IsNullOrWhiteSpace(x)));

            var rows = (await attachmentsDb.GetAttachmentsAsync(componentId, null)).ToList();
            if (rows.Count == 0) return $"{label} (id {componentId}) has no attachments.";

            var sb = new StringBuilder();
            sb.AppendLine($"{rows.Count} attachment(s) on {label} (id {componentId}):");
            var junk = 0;
            foreach (var a in rows)
            {
                var (verdict, isJunk) = await DescribeAttachmentAsync(store, a);
                if (isJunk) junk++;
                sb.AppendLine($"  #{a.Id}  {a.Kind,-8} {a.FileName}  {a.SizeBytes ?? 0:N0} B  " +
                              $"{a.CreatedAt:yyyy-MM-dd}  {verdict}");
            }
            if (junk > 0)
                sb.AppendLine($"⛔ {junk} of these is not a document. Remove it with lab_delete_attachment " +
                              $"(it needs a reason and your name); the row can then be corrected or " +
                              $"deleted normally. Do NOT retire the component to get around it.");
            return sb.ToString().TrimEnd();
        }

        [McpServerTool(Name = "lab_read_attachment")]
        [Description("Read one attachment. Text returns as text; a PDF or image returns a one-line curl with a " +
                     "single-use download ticket - run it exactly, then read the file locally.")]
        public async Task<string> LabReadAttachmentAsync(
            [Description("Attachment id, from lab_list_attachments.")]
            int attachmentId,
            [Description("Characters to return for text. Default 6000.")]
            int maxChars = 6000)
        {
            using var scope = _scopeFactory.CreateScope();
            var attachmentsDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Attachments>();
            var store = scope.ServiceProvider.GetRequiredService<Service_Lab_Attachment_Store>();
            var tickets = scope.ServiceProvider.GetRequiredService<Service_Lab_Attachment_Tickets>();

            var a = await attachmentsDb.GetAttachmentByIdAsync(attachmentId);
            if (a == null) return $"No attachment with id {attachmentId}.";

            var bytes = await store.ReadAsync(a);
            if (bytes == null)
                return $"Attachment #{a.Id} ({a.FileName}) is recorded but its file is MISSING on disk. " +
                       $"Nothing to read - remove the row with lab_delete_attachment and re-attach the real file.";

            var sniffed = Service_Lab_Attachment_Store.Sniff(bytes);
            var target = a.ComponentId is int cid ? $"component {cid}" : a.MachineId is int mid ? $"machine {mid}" : "nothing";

            if (sniffed == "text")
            {
                var text = Encoding.UTF8.GetString(bytes);
                var cap = Math.Max(200, maxChars);
                var clipped = text.Length > cap ? text[..cap] + $"{Environment.NewLine}... [{text.Length - cap:N0} more chars]" : text;
                return $"#{a.Id} {a.FileName} on {target} is a PLAIN-TEXT file ({bytes.Length:N0} B) - " +
                       $"not a document, and it renders blank in the viewer. Its contents:" +
                       Environment.NewLine + clipped + Environment.NewLine +
                       $"⛔ If this is under an invoice name it is junk: lab_delete_attachment {a.Id}.";
            }

            var ticket = tickets.MintDownload(a.Id);
            var what = sniffed switch { "pdf" => "a PDF", "png" => "a PNG image", "jpeg" => "a JPEG image", _ => "binary data" };
            return $"#{a.Id} {a.FileName} on {target} is {what} ({bytes.Length:N0} B, kind {a.Kind}, " +
                   $"attached {a.CreatedAt:yyyy-MM-dd}). The server cannot extract its text. Download it " +
                   $"with this exact command - single use, valid {Service_Lab_Attachment_Tickets.Lifetime.TotalMinutes:0} minutes:" +
                   Environment.NewLine +
                   $"  {Service_Lab_Attachment_Store.DownloadHint(ticket.Token, a.FileName)}" +
                   Environment.NewLine +
                   "Then read the file with your own tools (pdftotext, a PDF reader, an image viewer).";
        }

        [McpServerTool(Name = "lab_delete_attachment")]
        [Description("Remove one wrongly attached file (blank upload, text under an invoice name, another " +
                     "order's receipt). Junk (⛔ in lab_list_attachments) goes freely. ⛔ A real PDF/image is " +
                     "refused without confirmRealDocument=true - it is evidence of purchase. The reason is " +
                     "stamped into the component's notes; the row itself is untouched.")]
        public async Task<string> LabDeleteAttachmentAsync(
            [Description("Attachment id, from lab_list_attachments.")]
            int attachmentId,
            [Description("Required. Why, e.g. 'email body saved as text, not a receipt'.")]
            string reason,
            [Description("Required. Who is removing it - your agent name, or the user's name.")]
            string deletedBy,
            [Description("Only after the refusal named a genuine PDF/image you mean to remove.")]
            bool confirmRealDocument = false)
        {
            if (string.IsNullOrWhiteSpace(reason)) return "A reason is required. Nothing was removed.";
            if (string.IsNullOrWhiteSpace(deletedBy)) return "deletedBy is required. Nothing was removed.";

            using var scope = _scopeFactory.CreateScope();
            var componentsDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Components>();
            var attachmentsDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Attachments>();
            var store = scope.ServiceProvider.GetRequiredService<Service_Lab_Attachment_Store>();

            var a = await attachmentsDb.GetAttachmentByIdAsync(attachmentId);
            if (a == null) return $"No attachment with id {attachmentId}. Nothing was removed.";

            var (verdict, isJunk) = await DescribeAttachmentAsync(store, a);
            if (!isJunk && !confirmRealDocument)
                return $"REFUSED - #{a.Id} {a.FileName} is {verdict}. That is a real document, and " +
                       $"removing it erases the evidence of a purchase. Nothing was removed. If it " +
                       $"genuinely does not belong on this row (wrong order, wrong part), re-run with " +
                       $"confirmRealDocument=true.";

            var removed = await store.DeleteAsync(a);
            if (!removed) return $"Attachment {attachmentId} could not be removed.";

            var where = "nothing";
            if (a.ComponentId is int cid)
            {
                var component = await componentsDb.GetComponentByIdAsync(cid);
                if (component != null)
                {
                    where = $"{component.Name ?? string.Join(" ", new[] { component.Manufacturer, component.Model }.Where(x => !string.IsNullOrWhiteSpace(x)))} (id {cid})";
                    var stamp = $"Attachment '{a.FileName}' ({verdict}) removed {DateTime.UtcNow:yyyy-MM-dd} by {deletedBy.Trim()}: {reason.Trim()}.";
                    component.Notes = string.IsNullOrWhiteSpace(component.Notes) ? stamp : component.Notes.TrimEnd() + " " + stamp;
                    await componentsDb.UpdateComponentAsync(component);
                }
            }

            var left = a.ComponentId is int c2 ? (await attachmentsDb.GetAttachmentsAsync(c2, null)).Count() : 0;
            return $"Removed attachment #{a.Id} '{a.FileName}' from {where}. {left} attachment(s) remain on it. " +
                   $"The removal and your reason are stamped in the component's notes.";
        }

        // One verdict for both the list and the delete guard, so they cannot disagree about
        // what counts as junk.
        private static async Task<(string Verdict, bool IsJunk)> DescribeAttachmentAsync(
            Service_Lab_Attachment_Store store, Model_Lab_Attachment a)
        {
            var bytes = await store.ReadAsync(a);
            if (bytes == null) return ("⛔ FILE MISSING ON DISK", true);
            if (bytes.Length == 0) return ("⛔ EMPTY (0 bytes)", true);

            var sniffed = Service_Lab_Attachment_Store.Sniff(bytes);
            switch (sniffed)
            {
                case "pdf":
                    var tailLength = Math.Min(bytes.Length, 2048);
                    var tail = Encoding.ASCII.GetString(bytes, bytes.Length - tailLength, tailLength);
                    return tail.Contains("%%EOF") ? ("PDF, intact", false) : ("⛔ PDF, TRUNCATED (no %%EOF)", true);
                case "png":  return ("PNG image", false);
                case "jpeg": return ("JPEG image", false);
                case "text": return ("⛔ PLAIN TEXT, NOT A DOCUMENT - renders blank", true);
                default:     return ("⛔ unrecognised binary, not a document", true);
            }
        }

        // Attach-only filing also fills the row: an invoice attached late carries the acquired
        // date in the caller's hand, and nothing else would write it afterwards. Fills only
        // what is EMPTY.
        private static async Task<string?> FillPurchaseFactsAsync(
            Service_Database_Manager_Lab_Components componentsDb, Model_Lab_Component existing,
            DateTime? acquired, string? vendor)
        {
            if (existing.ParentComponentId.HasValue) return null;   // a child inherits these
            var filled = new List<string>();
            if (acquired.HasValue && existing.AcquiredAt == null)
            {
                existing.AcquiredAt = acquired.Value;
                filled.Add($"acquired {acquired:yyyy-MM-dd}");
            }
            if (!string.IsNullOrWhiteSpace(vendor) && string.IsNullOrWhiteSpace(existing.Vendor))
            {
                existing.Vendor = vendor.Trim();
                filled.Add($"vendor {existing.Vendor}");
            }
            if (filled.Count == 0) return null;
            await componentsDb.UpdateComponentAsync(existing);
            return $"Filled in from the invoice: {string.Join(", ", filled)}.";
        }

        [McpServerTool(Name = "lab_update_component")]
        [Description("Change fields on an existing component; only passed arguments change. ⛔ Not for prices " +
                     "(lab_record_market_value, lab_set_purchase_pricing), location (lab_move_component) or " +
                     "retiring (lab_set_component_status). Batch re-type: get ids from lab_query, call once " +
                     "per id, report the ids. An unknown type is refused - create it with " +
                     "lab_add_component_type first.")]
        public async Task<string> LabUpdateComponentAsync(
            [Description("Component id, from lab_query fields=id.")]
            int componentId,
            [Description("Component type, e.g. 'Networking'. Must exist; case-insensitive.")]
            string? type = null,
            [Description("Name overriding manufacturer + model - only for no-brand parts, e.g. 'Patch Panel 10\"'.")]
            string? name = null,
            [Description("Manufacturer, e.g. 'TP-Link'.")]
            string? manufacturer = null,
            [Description("Model, e.g. 'TL-SG105'.")]
            string? model = null,
            [Description("Free-text spec line, e.g. '5-port gigabit, unmanaged'.")]
            string? spec = null,
            [Description("Nickname.")]
            string? nickname = null,
            [Description("Serial number.")]
            string? serialNumber = null,
            [Description("SKU or part number.")]
            string? sku = null,
            [Description("Vendor, e.g. Amazon, Newegg.")]
            string? vendor = null,
            [Description("Acquired condition: New, Used, Shucked, Internal.")]
            string? source = null,
            [Description("Warranty, years.")]
            int? warrantyYears = null,
            [Description("Notes. ⚠️ Replaces existing notes - read them first to append.")]
            string? notes = null,
            [Description("Typed spec fields as a JSON object, e.g. '{\"ddrGen\":\"DDR4\",\"speedMts\":2400}'. These fill " +
                         "the Inventory columns and filters; the spec line does not. Unknown keys refused; merges " +
                         "with existing values. The reply names empty fields.")]
            string? specFields = null)
        {
            using var scope = _scopeFactory.CreateScope();
            var componentsDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Components>();
            var typesDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_ComponentTypes>();

            var component = await componentsDb.GetComponentByIdAsync(componentId);
            if (component == null) return $"No component with id {componentId}. Nothing was changed.";

            var before = $"{component.Type} / {component.Manufacturer} {component.Model}";
            var changes = new List<string>();

            if (!string.IsNullOrWhiteSpace(type))
            {
                // ⛔ Refuse an unknown type rather than creating it. A typo in a type name is
                // permanent and invisible: it makes its own Inventory section of one component.
                var known = await typesDb.GetByNameAsync(type);
                if (known == null)
                {
                    var all = (await typesDb.GetAllAsync(includeRetired: false))
                              .Select(t => t.Name).ToList();
                    return $"There is no component type called '{type}', so NOTHING was changed. " +
                           $"Existing types: {string.Join(", ", all)}. " +
                           $"If '{type}' is genuinely a new category, create it with " +
                           $"lab_add_component_type and then re-run this.";
                }
                if (!string.Equals(known.Name, component.Type, StringComparison.Ordinal))
                {
                    changes.Add($"type {component.Type} -> {known.Name}");
                    component.Type = known.Name;   // stored spelling wins over what was typed
                }
            }

            void Set(string label, string? incoming, Func<string?> get, Action<string?> set)
            {
                if (incoming == null) return;
                var trimmed = incoming.Trim();
                if (trimmed == (get() ?? string.Empty)) return;
                changes.Add($"{label} {(string.IsNullOrEmpty(get()) ? "(empty)" : get())} -> {trimmed}");
                set(trimmed);
            }

            Set("name", name, () => component.Name, v => component.Name = v);
            Set("manufacturer", manufacturer, () => component.Manufacturer, v => component.Manufacturer = v);
            Set("model", model, () => component.Model, v => component.Model = v);
            Set("spec", spec, () => component.Spec, v => component.Spec = v);
            Set("nickname", nickname, () => component.Nickname, v => component.Nickname = v);
            Set("serial", serialNumber, () => component.SerialNumber, v => component.SerialNumber = v);
            Set("sku", sku, () => component.Sku, v => component.Sku = v);
            Set("vendor", vendor, () => component.Vendor, v => component.Vendor = v);
            Set("source", source, () => component.Source, v => component.Source = v);
            Set("notes", notes, () => component.Notes, v => component.Notes = v);

            if (warrantyYears.HasValue && warrantyYears != component.WarrantyYears)
            {
                changes.Add($"warranty {component.WarrantyYears?.ToString() ?? "(none)"} -> {warrantyYears}");
                component.WarrantyYears = warrantyYears;
            }

            // ⚠️ NOT named 'spec' - that is already this method's free-text spec parameter.
            var typed = await BuildSpecJsonAsync(typesDb, component.Type ?? "", specFields, component.SpecJson);
            if (typed.Error != null) return typed.Error;
            if (typed.Json != null && !string.Equals(typed.Json, component.SpecJson, StringComparison.Ordinal))
            {
                changes.Add("typed fields updated");
                component.SpecJson = typed.Json;
            }

            if (changes.Count == 0)
                return $"Nothing to change on {before} (id {componentId}) - every value you " +
                       $"passed already matches. Nothing was written." +
                       (typed.Advice != null ? Environment.NewLine + typed.Advice : "");

            await componentsDb.UpdateComponentAsync(component);

            return $"Updated component {componentId} ({before}):" + Environment.NewLine +
                   string.Join(Environment.NewLine, changes.Select(c => "  " + c)) +
                   (typed.Advice != null ? Environment.NewLine + typed.Advice : "");
        }

        [McpServerTool(Name = "lab_delete_component")]
        [Description("Delete a row that should never have existed (a mis-filing). ⛔ A real part that left is " +
                     "lab_set_component_status - never mark a mistake 'disposed'. Works only on a row with no " +
                     "history (no attachment, placement, market value, children or moves); otherwise it " +
                     "refuses and names what the row has. Duplicates of one part: lab_merge_component. The row " +
                     "is kept in an audit table.")]
        public async Task<string> LabDeleteComponentAsync(
            [Description("Component id, from lab_query fields=id.")]
            int componentId,
            [Description("Required. Why the row should not exist, e.g. 'sealed grab-bag, not a part - order " +
                         "R146221211'.")]
            string reason,
            [Description("Required. Who is deleting it - your agent name, or the user's name.")]
            string deletedBy)
        {
            using var scope = _scopeFactory.CreateScope();
            var componentsDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Components>();

            var existing = await componentsDb.GetComponentByIdAsync(componentId);
            if (existing == null) return $"No component with id {componentId}. Nothing was deleted.";

            var label = existing.Name ?? string.Join(" ", new[] { existing.Manufacturer, existing.Model }
                .Where(x => !string.IsNullOrWhiteSpace(x)));

            var (deleted, refusal) = await componentsDb.DeleteComponentAsync(
                componentId, reason, deletedBy?.Trim());

            if (refusal != null)
                return refusal + Environment.NewLine +
                       "Nothing was written. If this really is a mis-filing, clear what it has " +
                       "picked up first; if it is a real part that has gone, retire it with " +
                       "lab_set_component_status instead.";

            return deleted
                ? $"Deleted {existing.Type} '{label}' (id {componentId}). The full row is kept in " +
                  $"the deletion audit with your reason; the component itself is gone and will not " +
                  $"appear in lab_query or any total."
                : $"Nothing was deleted for id {componentId}.";
        }

        [McpServerTool(Name = "lab_restore_component")]
        [Description("Put back a component deleted with lab_delete_component. " +
                     "🔑 It comes back under its ORIGINAL id, deliberately - ids are never " +
                     "reused, and anything holding the old id (review.py's state file maps " +
                     "each purchase row to the component it became) starts resolving again " +
                     "instead of pointing at nothing while looking repaired. Its creation " +
                     "movement is restored too. " +
                     "⚠️ Only a row deleted through that tool can come back: a merge or a " +
                     "web-UI delete leaves no snapshot. " +
                     "Call it with the id from the deletion reply. If you do not have the id, " +
                     "pass any id and the refusal lists what has been deleted and not yet " +
                     "restored.")]
        public async Task<string> LabRestoreComponentAsync(
            [Description("The component id that was deleted. Pass anything to be shown the list.")]
            int componentId)
        {
            using var scope = _scopeFactory.CreateScope();
            var componentsDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Components>();

            var (restored, refusal) = await componentsDb.RestoreComponentAsync(componentId);
            if (refusal != null) return refusal;

            var back = await componentsDb.GetComponentByIdAsync(componentId);
            var label = back == null ? $"component {componentId}"
                : back.Name ?? string.Join(" ", new[] { back.Manufacturer, back.Model }
                    .Where(x => !string.IsNullOrWhiteSpace(x)));

            return restored
                ? $"Restored {back?.Type} '{label}' under its original id {componentId}. The " +
                  $"deletion record is kept and marked restored, so the round trip stays visible."
                : $"Nothing was restored for id {componentId}.";
        }

        [McpServerTool(Name = "lab_merge_component")]
        [Description("Merge two rows describing ONE physical part: the keeper inherits invoices, prices and " +
                     "moves; the duplicate is erased. ⛔ Irreversible. Two identical parts bought together are " +
                     "two components - never merge them. ⚠️ lab_query both ids and show the user invoice and serial " +
                     "of each before calling; if you can't tell, ask. Mismatched type, serial, machine or " +
                     "retirement is refused.")]
        public async Task<string> LabMergeComponentAsync(
            [Description("Id to KEEP - prefer the one with the invoice, or the older.")]
            int keepId,
            [Description("Id of the duplicate to erase.")]
            int duplicateId,
            [Description("Why they are one part, e.g. 'same serial'. Stamped into the keeper's notes.")]
            string? reason = null)
        {
            if (keepId == duplicateId)
                return "keepId and duplicateId are the same component. Nothing was changed.";

            using var scope = _scopeFactory.CreateScope();
            var components = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Components>();
            var machines = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Machines>();

            var keeper = await components.GetComponentByIdAsync(keepId);
            if (keeper == null) return $"No component with id {keepId} (keepId). Nothing was changed.";
            var duplicate = await components.GetComponentByIdAsync(duplicateId);
            if (duplicate == null) return $"No component with id {duplicateId} (duplicateId). Nothing was changed.";

            static string Label(Model_Lab_Component c)
            {
                var made = string.Join(" ", new[] { c.Manufacturer, c.Model }
                    .Where(x => !string.IsNullOrWhiteSpace(x)));
                if (!string.IsNullOrWhiteSpace(made)) return made;
                return string.IsNullOrWhiteSpace(c.Name) ? $"component {c.Id}" : c.Name!;
            }

            var keepLabel = Label(keeper);
            var dupLabel = Label(duplicate);

            // ⛔ Every refusal below is a case where the RECORD says these are two different
            // things. Merging through one of them destroys a real component, so the tool
            // stops and hands the judgement back rather than resolving it itself.
            if (!string.Equals(keeper.Type, duplicate.Type, StringComparison.OrdinalIgnoreCase))
                return $"REFUSED: {keepLabel} is a {keeper.Type} and {dupLabel} is a " +
                       $"{duplicate.Type}. Two types means two different things, or one is " +
                       $"mis-typed - fix the type with lab_update_component first, then merge.";

            var keepSerial = keeper.SerialNumber?.Trim();
            var dupSerial = duplicate.SerialNumber?.Trim();
            if (!string.IsNullOrWhiteSpace(keepSerial) && !string.IsNullOrWhiteSpace(dupSerial) &&
                !string.Equals(keepSerial, dupSerial, StringComparison.OrdinalIgnoreCase))
                return $"REFUSED: different serial numbers ({keepSerial} vs {dupSerial}). " +
                       $"These are two physical units, not one filed twice. Nothing was changed.";

            if (keeper.CurrentMachineId.HasValue && duplicate.CurrentMachineId.HasValue &&
                keeper.CurrentMachineId != duplicate.CurrentMachineId)
            {
                var a = (await machines.GetMachineByIdAsync(keeper.CurrentMachineId.Value))?.Name ?? $"machine {keeper.CurrentMachineId}";
                var b = (await machines.GetMachineByIdAsync(duplicate.CurrentMachineId.Value))?.Name ?? $"machine {duplicate.CurrentMachineId}";
                return $"REFUSED: {keepLabel} is installed in {a} and {dupLabel} in {b}. One " +
                       $"part cannot be in two machines, so these are two units. Nothing was changed.";
            }

            var keepRetired = Service_Database_Manager_Lab_Components.IsRetiredStatus(keeper.Status);
            var dupRetired = Service_Database_Manager_Lab_Components.IsRetiredStatus(duplicate.Status);
            if (keepRetired != dupRetired)
                return $"REFUSED: {keepLabel} is '{keeper.Status}' and {dupLabel} is " +
                       $"'{duplicate.Status}' - one has left the fleet and the other has not, " +
                       $"which says they are two parts. If it is really one, set them to the " +
                       $"same status with lab_set_component_status first. Nothing was changed.";

            // The keeper takes the duplicate's machine when it has none of its own, so a
            // merge never shelves a part that is physically installed. The ledger rows come
            // across in the same transaction, which is what keeps the two consistent.
            //
            // ⛔ This CANNOT go through UpdateComponentAsync: that writer deliberately omits
            // CurrentMachineId, because location is supposed to move via MoveComponentAsync.
            // Setting the property and calling it looks right and silently drops the machine
            // — the merge then REPORTS an adoption it has not performed (the machine is
            // announced and lost). The adoption is handed to
            // MergeComponentsAsync instead, which writes it inside the merge transaction.
            int? adoptMachineId = null;
            if (!keeper.CurrentMachineId.HasValue && duplicate.CurrentMachineId.HasValue)
                adoptMachineId = duplicate.CurrentMachineId;
            var adopted = adoptMachineId.HasValue;

            var stamp = $"Merged duplicate #{duplicateId} ({dupLabel}) on {DateTime.UtcNow:yyyy-MM-dd}" +
                        (string.IsNullOrWhiteSpace(reason) ? "." : $" - {reason.Trim()}");

            var result = await components.MergeComponentsAsync(
                keepId, duplicateId, stamp,
                adoptMachineId,
                adopted && !keepRetired ? Service_Database_Manager_Lab_Components.StatusActive : null);
            // Report the machine the DB confirms, never the one that was asked for.
            adopted = result.AdoptedMachineId.HasValue;
            if (adopted) keeper.CurrentMachineId = result.AdoptedMachineId;

            var carried = new List<string>();
            if (result.AttachmentsMoved > 0) carried.Add($"{result.AttachmentsMoved} attachment(s)");
            if (result.MarketValuesMoved > 0) carried.Add($"{result.MarketValuesMoved} price observation(s)");
            if (result.MovementsMoved > 0) carried.Add($"{result.MovementsMoved} ledger row(s)");
            if (result.ChildrenReparented > 0) carried.Add($"{result.ChildrenReparented} child part(s)");
            if (result.SpacesRepointed > 0) carried.Add($"{result.SpacesRepointed} space link(s)");
            if (result.PlacementsMoved > 0) carried.Add($"its rack placement");

            var dropped = new List<string>();
            if (result.AttachmentsDropped > 0) dropped.Add($"{result.AttachmentsDropped} duplicate file row(s)");
            if (result.PlacementsDropped > 0) dropped.Add($"{result.PlacementsDropped} redundant rack placement(s)");

            var machineNow = keeper.CurrentMachineId.HasValue
                ? (await machines.GetMachineByIdAsync(keeper.CurrentMachineId.Value))?.Name ?? $"machine {keeper.CurrentMachineId}"
                : "the shelf";

            return $"Merged #{duplicateId} ({dupLabel}) into #{keepId} ({keepLabel}), which is now on/in {machineNow}. " +
                   (carried.Count > 0 ? $"Carried over: {string.Join(", ", carried)}. " : "The duplicate had no history to carry. ") +
                   (dropped.Count > 0 ? $"Dropped as redundant: {string.Join(", ", dropped)}. " : "") +
                   (adopted ? "The keeper was on the shelf and took the duplicate's machine. " : "") +
                   $"Row {duplicateId} no longer exists - this cannot be undone. " +
                   $"The merge is recorded in the keeper's notes.";
        }

        // ⛔ THE MISSING HALF OF ParentComponentId. The column has been READ since the
        // integrated-CPU rows existed - lab_set_purchase_pricing refuses to price a child,
        // and the read side inherits the parent's invoice - but nothing could SET it, so an
        // agent could only describe the relationship in a note and hope. Measured
        // that gap is what left three mystery-box parts filed "catalogued
        // without invoice" next to the very row that paid for them.
        [McpServerTool(Name = "lab_set_parent")]
        [Description("Record that a component came inside another - an integrated part, or the contents of one " +
                     "priced purchase (a mystery box, a kit). The child inherits the parent's purchase facts. " +
                     "Put the line price on the PARENT; never split it or copy it to children. ⛔ Clears the " +
                     "child's own price, vendor, date and warranty: if it has any this refuses and names them; " +
                     "pass confirmDropsPurchaseFacts=true only if they belong to the parent. Detaching does " +
                     "not restore them. Two identical parts bought together are NOT parent and child. " +
                     "parentComponentId=0 detaches; cycles are refused.")]
        public async Task<string> LabSetParentAsync(
            [Description("Child component id (the part inside), from lab_query fields=id.")]
            int componentId,
            [Description("Parent component id (holds the purchase). 0 detaches.")]
            int parentComponentId,
            [Description("Why they belong together, e.g. 'came in the $59 Mystery Box, order R146221211'. Stamped " +
                         "into the child's notes.")]
            string? reason = null,
            [Description("Only after a refusal named the purchase facts this clears. Never on a first attempt.")]
            bool confirmDropsPurchaseFacts = false)
        {
            using var scope = _scopeFactory.CreateScope();
            var componentsDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Components>();

            static string Label(Model_Lab_Component c) =>
                c.Name ?? string.Join(" ", new[] { c.Manufacturer, c.Model }
                    .Where(x => !string.IsNullOrWhiteSpace(x)));

            var child = await componentsDb.GetComponentByIdAsync(componentId);
            if (child == null) return $"No component with id {componentId}. Nothing was written.";
            var childLabel = Label(child);

            if (parentComponentId <= 0)
            {
                if (child.ParentComponentId == null)
                    return $"{childLabel} (id {componentId}) is not inside anything. Nothing was written.";

                var wasInside = child.ParentComponentId.Value;
                child.ParentComponentId = null;
                await componentsDb.UpdateComponentAsync(child);
                return $"{childLabel} (id {componentId}) is no longer inside component {wasInside}. " +
                       $"⚠️ Its own purchase facts were cleared when it was attached and did NOT " +
                       $"come back - if this part has a price of its own, set it now with " +
                       $"lab_set_purchase_pricing, or it reads as free.";
            }

            if (parentComponentId == componentId)
                return "A component cannot be inside itself. Nothing was written.";

            var parent = await componentsDb.GetComponentByIdAsync(parentComponentId);
            if (parent == null)
                return $"No component with id {parentComponentId} to be the parent. Nothing was written.";

            if (child.ParentComponentId == parentComponentId)
                return $"{childLabel} (id {componentId}) is already inside {Label(parent)} " +
                       $"(id {parentComponentId}). Nothing was written.";

            var losing = new List<string>();
            if (child.PurchasePrice.HasValue) losing.Add($"paid {child.PurchasePrice:0.##}");
            if (child.AcquiredAt.HasValue) losing.Add($"acquired {child.AcquiredAt:yyyy-MM-dd}");
            if (!string.IsNullOrWhiteSpace(child.Vendor)) losing.Add($"vendor {child.Vendor}");
            if (child.WarrantyYears.HasValue) losing.Add($"warranty {child.WarrantyYears}y");

            if (losing.Count > 0 && !confirmDropsPurchaseFacts)
                return $"{childLabel} (id {componentId}) carries its own purchase facts: " +
                       $"{string.Join(", ", losing)}. Putting it inside {Label(parent)} " +
                       $"(id {parentComponentId}) CLEARS every one of them - the child inherits " +
                       $"the parent's invoice instead, and detaching later does not bring them " +
                       $"back. Nothing was written. If those figures really belong to the parent, " +
                       $"re-run with confirmDropsPurchaseFacts=true. If this part was bought " +
                       $"separately, it is not a child - leave it alone.";

            child.ParentComponentId = parentComponentId;

            var stamp = string.IsNullOrWhiteSpace(reason)
                ? $"Inside #{parentComponentId} ({Label(parent)}) - recorded {DateTime.UtcNow:yyyy-MM-dd}."
                : $"Inside #{parentComponentId} ({Label(parent)}): {reason.Trim()} (recorded {DateTime.UtcNow:yyyy-MM-dd}).";
            child.Notes = string.IsNullOrWhiteSpace(child.Notes)
                ? stamp
                : child.Notes.TrimEnd() + " " + stamp;

            try
            {
                await componentsDb.UpdateComponentAsync(child);
            }
            catch (InvalidOperationException ex)
            {
                return ex.Message + " Nothing was written.";
            }

            return $"{childLabel} (id {componentId}) is now inside {Label(parent)} (id {parentComponentId}). " +
                   (losing.Count > 0
                       ? $"Cleared its own {string.Join(", ", losing)} - it inherits the parent's " +
                         $"purchase facts from here. "
                       : "It carries no price of its own and inherits the parent's. ") +
                   $"Price the PARENT if the invoice is ever corrected; lab_query shows the " +
                   $"inherited figures on the child.";
        }

        [McpServerTool(Name = "lab_update_component_type")]
        [Description("Change an existing component CATEGORY - its label, notes, or its TYPED " +
                     "FIELDS. ⛔ Fields are what fill the Inventory COLUMNS and what filters " +
                     "match on; the free-text spec line does not. A type with no fields means " +
                     "every part under it is uncomparable. " +
                     "⚠️ `fields` REPLACES the whole definition list - it is not a merge. The " +
                     "tool REFUSES to overwrite an existing set unless you pass " +
                     "replaceFields=true, and shows you what is there so you can carry it " +
                     "forward. Read the current fields with lab_query first. " +
                     "⛔ Renaming a type is NOT possible here - the name is stored on every " +
                     "component under it, so a rename is a data migration, not an edit. " +
                     "⚠️ Removing a field does not delete the values already stored against it; " +
                     "they simply stop being shown. Adding it back brings them back.")]
        public async Task<string> LabUpdateComponentTypeAsync(
            [Description("The existing type name, e.g. 'USB Drive'. Must already exist.")]
            string name,
            [Description("New plural heading for its Inventory section.")]
            string? label = null,
            [Description("Why this category exists. ⚠️ REPLACES the existing notes.")]
            string? notes = null,
            [Description("The FULL typed-field list as a JSON array of " +
                         "{key, label, kind, options?, unit?, showInTable?, tableLabel?, align?}. " +
                         "kind is text | number | select | boolean; select requires options. " +
                         "Example: [{\"key\":\"capacityGb\",\"label\":\"Capacity\"," +
                         "\"kind\":\"number\",\"unit\":\"GB\",\"showInTable\":true}]")]
            string? fields = null,
            [Description("Set true ONLY after you have read the type's current fields and are " +
                         "deliberately replacing them. Without it, a type that already has " +
                         "fields is left alone and the reply shows you what it has.")]
            bool replaceFields = false)
        {
            if (string.IsNullOrWhiteSpace(name))
                return "A type name is required. Nothing was changed.";

            using var scope = _scopeFactory.CreateScope();
            var typesDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_ComponentTypes>();

            var trimmed = name.Trim();
            var type = await typesDb.GetByNameAsync(trimmed);
            if (type == null)
            {
                var all = (await typesDb.GetAllAsync(includeRetired: false)).Select(t => t.Name).ToList();
                return $"There is no component type called '{trimmed}', so NOTHING was changed. " +
                       $"Existing types: {string.Join(", ", all)}.";
            }

            var changes = new List<string>();

            if (!string.IsNullOrWhiteSpace(fields))
            {
                // ⛔ The existing definitions are the only record of what those columns mean.
                // Replacing them blind is how a type silently loses half its schema, so the
                // caller has to have seen them first.
                var hadFields = !string.IsNullOrWhiteSpace(type.FieldsJson) &&
                                type.FieldsJson!.Trim() != "[]";
                if (hadFields && !replaceFields)
                    return $"'{type.Name}' already defines fields, and `fields` REPLACES the whole " +
                           $"list rather than merging. Nothing was changed. Its current definition " +
                           $"is:{Environment.NewLine}  {type.FieldsJson}{Environment.NewLine}" +
                           $"Carry forward what you want to keep, then re-run with replaceFields=true.";

                var (json, err) = NormaliseFieldsJson(fields, "changed");
                if (err != null) return err;
                if (!string.Equals(json, type.FieldsJson, StringComparison.Ordinal))
                {
                    changes.Add(hadFields ? "fields REPLACED" : "fields set");
                    type.FieldsJson = json;
                }
            }

            if (!string.IsNullOrWhiteSpace(label) && label.Trim() != type.Label)
            {
                changes.Add($"label {type.Label} -> {label.Trim()}");
                type.Label = label.Trim();
            }
            if (!string.IsNullOrWhiteSpace(notes) && notes.Trim() != type.Notes)
            {
                changes.Add("notes replaced");
                type.Notes = notes.Trim();
            }

            if (changes.Count == 0)
                return $"Nothing to change on type '{type.Name}' - every value you passed already " +
                       $"matches. Nothing was written.";

            await typesDb.UpdateAsync(type);
            return $"Updated component type '{type.Name}':" + Environment.NewLine +
                   string.Join(Environment.NewLine, changes.Select(c => "  " + c)) +
                   Environment.NewLine +
                   "⚠️ Existing components keep any values already stored for fields you removed - " +
                   "they stop being displayed, and reappear if the field is added back.";
        }

        [McpServerTool(Name = "lab_add_component_type")]
        [Description("Create a new component CATEGORY when nothing fits (an ESP32 is not a MOBO). ⚠️ Propose " +
                     "it first: say which types you considered and the name, create only once the user agrees. ⛔ " +
                     "Check lab_briefing for a near-duplicate first. Name it singular and short (Networking, " +
                     "UPS, PDU). Creating a type re-types nothing - use lab_update_component after.")]
        public async Task<string> LabAddComponentTypeAsync(
            [Description("Type name as stored: 'Networking', 'ESP', 'UPS'.")]
            string name,
            [Description("Plural section heading, e.g. 'ESP Boards'. Defaults to the name.")]
            string? label = null,
            [Description("One sentence on what belongs here.")]
            string? notes = null,
            [Description("Typed spec fields, JSON array of {key, label, kind, options?, unit?, showInTable?}; kind " +
                         "is text | number | select (select needs options). Omit for none.")]
            string? fields = null,
            [Description("Required true, and only once the user has agreed in this conversation to this exact name.")]
            bool confirmedByUser = false)
        {
            if (string.IsNullOrWhiteSpace(name))
                return "A type name is required. Nothing was created.";
            if (!confirmedByUser)
                return $"NOT CREATED - '{name.Trim()}' needs the user's agreement first. Say which " +
                       $"existing types you considered (lab_briefing lists them) and why none fits, " +
                       $"propose this name, and re-run with confirmedByUser=true once they have said " +
                       $"yes. Nothing was written.";

            // Validate the field schema BEFORE creating anything - a type with a broken
            // FieldsJson breaks the Manage Types dialog and the Inventory columns for
            // everyone. Refused means nothing was created, so the caller can just retry.
            var (fieldsJson, fieldsError) = NormaliseFieldsJson(fields, "created");
            if (fieldsError != null) return fieldsError;

            using var scope = _scopeFactory.CreateScope();
            var typesDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_ComponentTypes>();

            var trimmed = name.Trim();
            var existing = await typesDb.GetByNameAsync(trimmed);
            if (existing != null)
                return $"A type called '{existing.Name}' already exists ({existing.ComponentCount} " +
                       $"component(s) filed under it). Nothing was created - use it as it is, or " +
                       $"re-type parts into it with lab_update_component.";

            var all = (await typesDb.GetAllAsync(includeRetired: false)).Select(t => t.Name).ToList();

            var created = await typesDb.CreateAsync(new Model_Lab_ComponentType
            {
                Name = trimmed,
                Label = string.IsNullOrWhiteSpace(label) ? trimmed : label.Trim(),
                Status = "active",
                Notes = notes,
                FieldsJson = fieldsJson,
            });

            var fieldNote = fieldsJson == "[]"
                ? "It has no typed spec fields, so parts filed under it use the free-text Spec " +
                  "line - fields can be added later from Inventory > Manage Types."
                : $"It has typed spec fields as given.";
            return $"Created component type '{trimmed}' (id {created}). {fieldNote} " +
                   $"Nothing was re-typed: move parts into it with lab_update_component. " +
                   $"Types now: {string.Join(", ", all.Append(trimmed))}.";
        }

        [McpServerTool(Name = "lab_update_machine")]
        [Description("Change fields on a machine that already exists - name, hostname, kind, " +
                     "role, status, OS, IP address, location, always-on, notes. " +
                     "Only the arguments you pass are changed; everything else is left alone. " +
                     "⛔ NOT for what is installed in it (lab_move_component moves parts). " +
                     "⚠️ The notes field is the machine's CURRENT STATE, kept terse: its role, how " +
                     "to reach and run it, live traps, open items - no history or dated decision " +
                     "trail. It REPLACES on write: read the current notes with lab_query first, " +
                     "replace what changed and keep what still holds.")]
        public async Task<string> LabUpdateMachineAsync(
            [Description("Machine name or hostname, full or partial (e.g. 'server'). Must " +
                         "match exactly one machine.")]
            string machine,
            [Description("New name for the machine. ⚠️ Renames are the user's call - only " +
                         "rename when asked.")]
            string? name = null,
            [Description("Hostname the machine actually reports.")]
            string? hostname = null,
            [Description("Kind: Desktop, Laptop, Server, NAS, SBC, Mini PC, Console, " +
                         "Appliance, Other.")]
            string? kind = null,
            [Description("Role, e.g. 'Server', 'Router', 'Agent Gateway', 'Rig'.")]
            string? role = null,
            [Description("One of: active, incoming, retiring, retired. 'incoming' also " +
                         "models unbuilt/planned machines.")]
            string? status = null,
            [Description("Operating system, e.g. 'Unraid', 'Ubuntu Server', 'pfSense'.")]
            string? os = null,
            [Description("LAN IP address, e.g. '192.168.1.50'.")]
            string? ipAddress = null,
            [Description("Where the machine physically is, e.g. 'Office'.")]
            string? location = null,
            [Description("Whether the machine is always on.")]
            bool? alwaysOn = null,
            [Description("Notes - the machine's current state, terse, no history. ⚠️ REPLACES the " +
                         "existing notes: read them with lab_query first and keep what still holds.")]
            string? notes = null,
            [Description("Sentiment - the machine's standing verdict as an LLM box in one or two " +
                         "sentences, shown above the benchmark matrix: what it is good for and what " +
                         "an upgrade would or would not buy. REPLACES on write; '' clears it.")]
            string? sentiment = null)
        {
            using var scope = _scopeFactory.CreateScope();
            var machines = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Machines>();

            var found = await ResolveMachineAsync(machines, machine);
            if (found.Error != null) return found.Error;
            var target = found.Machine!;

            if (!string.IsNullOrWhiteSpace(status))
            {
                var allowed = new[] { "active", "incoming", "retiring", "retired" };
                var s = status.Trim().ToLowerInvariant();
                if (!allowed.Contains(s))
                    return $"'{status}' is not a machine status - active, incoming, retiring " +
                           $"or retired. Nothing was changed.";
                status = s;
            }

            var before = target.Name;
            var changes = new List<string>();

            void Set(string label, string? incoming, Func<string?> get, Action<string?> set)
            {
                if (incoming == null) return;
                var trimmed = incoming.Trim();
                if (trimmed == (get() ?? string.Empty)) return;
                changes.Add($"{label} {(string.IsNullOrEmpty(get()) ? "(empty)" : get())} -> {trimmed}");
                set(trimmed);
            }

            Set("name", name, () => target.Name, v => target.Name = v ?? target.Name);
            Set("hostname", hostname, () => target.Hostname, v => target.Hostname = v);
            Set("kind", kind, () => target.Kind, v => target.Kind = v);
            Set("role", role, () => target.Role, v => target.Role = v);
            Set("status", status, () => target.Status, v => target.Status = v ?? target.Status);
            Set("os", os, () => target.OS, v => target.OS = v);
            Set("ip", ipAddress, () => target.IPAddress, v => target.IPAddress = v);
            Set("location", location, () => target.Location, v => target.Location = v);
            Set("notes", notes, () => target.Notes, v => target.Notes = v);
            Set("sentiment", sentiment, () => target.Sentiment, v => target.Sentiment = string.IsNullOrEmpty(v) ? null : v);

            if (alwaysOn.HasValue && alwaysOn != target.AlwaysOn)
            {
                changes.Add($"always-on {target.AlwaysOn} -> {alwaysOn}");
                target.AlwaysOn = alwaysOn.Value;
            }

            if (changes.Count == 0)
                return $"Nothing to change on {before} - every value you passed already " +
                       $"matches. Nothing was written.";

            await machines.UpdateMachineAsync(target);

            return $"Updated machine {before} (id {target.Id}):" + Environment.NewLine +
                   string.Join(Environment.NewLine, changes.Select(c => "  " + c));
        }

        // machines could only be created in the web UI, so a box that
        // arrived or was ordered could not be put on the serving map from an agent session.
        [McpServerTool(Name = "lab_add_machine")]
        [Description("Create a MACHINE - a box that parts are installed in and that the serving " +
                     "map and the benchmark matrix are keyed on. Use it when a new box arrives or " +
                     "is planned ('incoming'). ⛔ CHECK FIRST with lab_briefing that it does not " +
                     "already exist under another name - a duplicate splits its parts, serving and " +
                     "benchmarks across two records. ⛔ NOT for a part: a purchase goes through " +
                     "lab_add_from_invoice, and moving that part into the new machine is " +
                     "lab_move_component. 🔑 Use the name the user gives it.")]
        public async Task<string> LabAddMachineAsync(
            [Description("Spoken name, e.g. 'Spark'. Must not match an existing machine.")]
            string name,
            [Description("Kind: Desktop, Laptop, Server, NAS, SBC, Mini PC, Console, " +
                         "Appliance, Other.")]
            string? kind = null,
            [Description("Role, e.g. 'Server', 'Router', 'Agent Gateway', 'Rig'.")]
            string? role = null,
            [Description("One of: active, incoming, retiring, retired. Default active; " +
                         "'incoming' models a box not yet built or delivered.")]
            string? status = null,
            [Description("Operating system.")]
            string? os = null,
            [Description("Hostname the machine actually reports.")]
            string? hostname = null,
            [Description("LAN IP address.")]
            string? ipAddress = null,
            [Description("Where the machine physically is.")]
            string? location = null,
            [Description("Whether the machine is always on.")]
            bool alwaysOn = false,
            [Description("Notes - the machine's charter: what it is for and what was decided, dated.")]
            string? notes = null,
            [Description("Sentiment - the machine's verdict as an LLM box in a sentence or two.")]
            string? sentiment = null)
        {
            if (string.IsNullOrWhiteSpace(name)) return "A machine needs a name. Nothing was created.";
            using var scope = _scopeFactory.CreateScope();
            var machines = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Machines>();

            var trimmed = name.Trim();
            var all = await machines.GetAllMachinesAsync();
            var clash = all.FirstOrDefault(m =>
                string.Equals(m.Name, trimmed, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(m.Hostname, trimmed, StringComparison.OrdinalIgnoreCase));
            if (clash != null)
                return $"A machine named '{clash.Name}' (id {clash.Id}) already exists. Nothing was " +
                       $"created - change it with lab_update_machine.";

            var s = string.IsNullOrWhiteSpace(status) ? "active" : status.Trim().ToLowerInvariant();
            if (!new[] { "active", "incoming", "retiring", "retired" }.Contains(s))
                return $"'{status}' is not a machine status - active, incoming, retiring or retired. " +
                       $"Nothing was created.";

            static string? T(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();
            var id = await machines.CreateMachineAsync(new Model_Lab_Machine
            {
                Name = trimmed, Kind = T(kind), Role = T(role), Status = s, OS = T(os),
                Hostname = T(hostname), IPAddress = T(ipAddress), Location = T(location),
                AlwaysOn = alwaysOn, Notes = T(notes), Sentiment = T(sentiment),
            });
            return $"Created machine {trimmed} (id {id}, {s}). It holds no parts yet - install " +
                   $"them with lab_move_component.";
        }

        [McpServerTool(Name = "lab_add_component")]
        [Description("Catalogue a part with no paperwork (found in a machine or a drawer). Creates one " +
                     "component; notes record 'catalogued without invoice'. ⛔ Anything with an invoice or " +
                     "order number goes through lab_add_from_invoice. An unknown type is refused (see " +
                     "lab_add_component_type). Pass machine to install it where found, else it goes on the " +
                     "shelf.")]
        public async Task<string> LabAddComponentAsync(
            [Description("Component type, e.g. 'Storage'. Must exist; case-insensitive.")]
            string type,
            [Description("Manufacturer, e.g. 'Samsung'.")]
            string? manufacturer = null,
            [Description("Model, e.g. 'SSD 850 EVO 500GB'.")]
            string? model = null,
            [Description("Name overriding manufacturer + model - only for no-brand parts.")]
            string? name = null,
            [Description("Free-text spec line, e.g. '500 GB SATA3 SSD'.")]
            string? spec = null,
            [Description("Serial number.")]
            string? serialNumber = null,
            [Description("Machine to install it in (ledger recorded); omit for the shelf.")]
            string? machine = null,
            [Description("Acquired condition: New, Used, Shucked, Internal.")]
            string? source = null,
            [Description("Known history. The no-invoice line is added automatically.")]
            string? notes = null,
            [Description("Typed spec fields as a JSON object, e.g. '{\"ddrGen\":\"DDR4\"}'. These fill the Inventory " +
                         "columns; unknown keys refused. The reply names empty fields.")]
            string? specFields = null)
        {
            if (string.IsNullOrWhiteSpace(model) && string.IsNullOrWhiteSpace(name))
                return "A model or a name is required - a row with neither is unfindable. " +
                       "Nothing was created.";

            using var scope = _scopeFactory.CreateScope();
            var componentsDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Components>();
            var typesDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_ComponentTypes>();
            var machinesDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Machines>();

            // ⛔ Refuse an unknown type rather than creating it - same rule as
            // lab_update_component, same reason: a typo becomes a permanent category.
            var known = await typesDb.GetByNameAsync(type);
            if (known == null)
            {
                var all = (await typesDb.GetAllAsync(includeRetired: false))
                          .Select(t => t.Name).ToList();
                return $"There is no component type called '{type}', so NOTHING was created. " +
                       $"Existing types: {string.Join(", ", all)}. " +
                       $"If '{type}' is genuinely a new category, create it with " +
                       $"lab_add_component_type and then re-run this.";
            }

            // Resolve the destination BEFORE creating anything, so a bad machine name
            // refuses cleanly instead of leaving an orphan row on the shelf.
            Model_Lab_Machine? dest = null;
            if (!string.IsNullOrWhiteSpace(machine))
            {
                var found = await ResolveMachineAsync(machinesDb, machine);
                if (found.Error != null) return found.Error + " Nothing was created.";
                dest = found.Machine;
            }

            var provenance = $"Catalogued without invoice {DateTime.UtcNow:yyyy-MM-dd} - " +
                             "purchase price, vendor and order date unknown.";
            var component = new Model_Lab_Component
            {
                Type = known.Name,
                Manufacturer = manufacturer?.Trim(),
                Model = model?.Trim(),
                Name = name?.Trim(),
                Spec = spec?.Trim(),
                SerialNumber = serialNumber?.Trim(),
                Source = source?.Trim(),
                CurrentMachineId = dest?.Id,   // create-with-install writes the ledger row itself
                Notes = string.IsNullOrWhiteSpace(notes) ? provenance
                        : notes.Trim() + Environment.NewLine + provenance,
            };

            // Validate typed fields BEFORE creating, so a bad key refuses cleanly rather than
            // leaving a half-filed row behind.
            var spec2 = await BuildSpecJsonAsync(typesDb, known.Name, specFields, null);
            if (spec2.Error != null) return spec2.Error;
            component.SpecJson = spec2.Json;

            var newId = await componentsDb.CreateComponentAsync(component);

            var label = component.Name ?? string.Join(" ", new[] { component.Manufacturer, component.Model }
                .Where(x => !string.IsNullOrWhiteSpace(x)));

            var where = dest == null
                ? "on the shelf, status spare"
                : $"installed in {dest.Name}, status active (initial-install movement recorded)";
            return $"Created {known.Name} '{label}' (id {newId}) {where}. No invoice is " +
                   $"attached and the notes say so - if paperwork ever turns up, attach it " +
                   $"with lab_add_from_invoice (componentId {newId})." +
                   (spec2.Advice != null ? Environment.NewLine + spec2.Advice : "");
        }

        [McpServerTool(Name = "lab_update_space")]
        [Description("Change fields on a space (rack, desk, shelf, room) - name, kind, " +
                     "location, status, notes, order (lowest first), and parent: the space it sits INSIDE (a rack or " +
                     "desk in a room - the Rooms tab and the network page group by it). Only the arguments you pass are changed. " +
                     "⛔ NOT for what occupies the space - that is lab_place_in_space / " +
                     "lab_remove_from_space. " +
                     "⛔ NOT for dimensions (height U, width, depth) - those describe the " +
                     "physical object and belong to the UI's edit form, where the rack is " +
                     "in view. " +
                     "⚠️ Notes REPLACE on write - read the current notes with lab_query or " +
                     "lab_briefing first and carry forward what still holds.")]
        public async Task<string> LabUpdateSpaceAsync(
            [Description("Space name, full or partial (e.g. 'Rack 1', 'Desk'). Must match " +
                         "exactly one space.")]
            string space,
            [Description("New name for the space.")]
            string? name = null,
            [Description("Kind: Rack, Desk, Shelf, Cabinet, Room.")]
            string? kind = null,
            [Description("Where the space is, e.g. 'Office'.")]
            string? location = null,
            [Description("One of: active, planned, retired.")]
            string? status = null,
            [Description("Notes. ⚠️ REPLACES the existing notes.")]
            string? notes = null,
            [Description("The space it sits inside, by name (usually a Room, e.g. 'Office'); empty string = top level.")]
            string? parent = null,
            [Description("Display order among spaces, lowest first - rooms and racks on the Rooms tab and frames on the network page left to right.")]
            int? order = null)
        {
            using var scope = _scopeFactory.CreateScope();
            var spacesDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Spaces>();

            var all = (await spacesDb.GetAllSpacesAsync()).ToList();
            var want = (space ?? "").Trim();
            if (string.IsNullOrEmpty(want)) return "Which space? Nothing was changed.";

            var hits = all.Where(s => string.Equals(s.Name, want, StringComparison.OrdinalIgnoreCase)).ToList();
            if (hits.Count == 0)
                hits = all.Where(s => (s.Name ?? "").Contains(want, StringComparison.OrdinalIgnoreCase)).ToList();
            if (hits.Count == 0)
                return $"No space matches '{want}'. Spaces: " +
                       string.Join(", ", all.Select(s => s.Name).OrderBy(n => n)) + ".";
            if (hits.Count > 1)
                return $"'{want}' is ambiguous: " + string.Join(", ", hits.Select(s => s.Name)) +
                       ". Say the full name.";
            var target = hits[0];

            if (!string.IsNullOrWhiteSpace(status))
            {
                var allowed = new[] { "active", "planned", "retired" };
                var s = status.Trim().ToLowerInvariant();
                if (!allowed.Contains(s))
                    return $"'{status}' is not a space status - active, planned or retired. " +
                           $"Nothing was changed.";
                status = s;
            }

            var before = target.Name;
            var changes = new List<string>();

            void Set(string label, string? incoming, Func<string?> get, Action<string?> set)
            {
                if (incoming == null) return;
                var trimmed = incoming.Trim();
                if (trimmed == (get() ?? string.Empty)) return;
                changes.Add($"{label} {(string.IsNullOrEmpty(get()) ? "(empty)" : get())} -> {trimmed}");
                set(trimmed);
            }

            Set("name", name, () => target.Name, v => target.Name = v ?? target.Name);
            Set("kind", kind, () => target.Kind, v => target.Kind = v ?? target.Kind);
            Set("location", location, () => target.Location, v => target.Location = v);
            Set("status", status, () => target.Status, v => target.Status = v ?? target.Status);
            Set("notes", notes, () => target.Notes, v => target.Notes = v);
            if (order.HasValue && order.Value != target.SortOrder)
            {
                changes.Add($"order {target.SortOrder} -> {order.Value}");
                target.SortOrder = order.Value;
            }
            if (parent != null)
            {
                int? newParent = null;
                if (parent.Trim() != "")
                {
                    var ph = all.Where(s => string.Equals(s.Name, parent.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
                    if (ph.Count == 0) ph = all.Where(s => (s.Name ?? "").Contains(parent.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
                    if (ph.Count != 1)
                        return (ph.Count == 0 ? $"No space matches '{parent}'." : $"'{parent}' is ambiguous: {string.Join(", ", ph.Select(s => s.Name))}.") + " Nothing was changed.";
                    newParent = ph[0].Id;
                }
                if (await spacesDb.ParentProblemAsync(target.Id, newParent) is string why) return why + " Nothing was changed.";
                if (newParent != target.ParentSpaceId)
                {
                    string NameOf(int? sid) => sid is int i ? all.FirstOrDefault(s => s.Id == i)?.Name ?? $"#{i}" : "(top level)";
                    changes.Add($"inside {NameOf(target.ParentSpaceId)} -> {NameOf(newParent)}");
                    target.ParentSpaceId = newParent;
                }
            }

            if (changes.Count == 0)
                return $"Nothing to change on {before} - every value you passed already " +
                       $"matches. Nothing was written.";

            await spacesDb.UpdateSpaceAsync(target);

            return $"Updated space {before} (id {target.Id}):" + Environment.NewLine +
                   string.Join(Environment.NewLine, changes.Select(c => "  " + c));
        }

        [McpServerTool(Name = "lab_place_in_space")]
        [Description("Place a machine or component in a space (rack, desk, shelf), or update its placement - " +
                     "pass exactly one of machine or componentId. A new positionU moves it; status 'installed' " +
                     "marks planned kit fitted. U-overlap is refused and names the occupant - remove it first " +
                     "with lab_remove_from_space. Say what went where.")]
        public async Task<string> LabPlaceInSpaceAsync(
            [Description("Space name, full or partial; must match one space.")]
            string space,
            [Description("Machine name or hostname.")]
            string? machine = null,
            [Description("Component id, from lab_query fields=id.")]
            int? componentId = null,
            [Description("Lowest U occupied, counted from the bottom (U1). Omit for spaces without U.")]
            int? positionU = null,
            [Description("Height in U. Default 1.")]
            int? heightU = null,
            [Description("front, rear or both. Default front.")]
            string? face = null,
            [Description("planned or installed. New placements default to planned.")]
            string? status = null)
        {
            if ((machine == null) == (componentId == null))
                return "Pass exactly one of machine or componentId. Nothing was placed.";

            if (!string.IsNullOrWhiteSpace(face))
            {
                face = face.Trim().ToLowerInvariant();
                if (face != "front" && face != "rear" && face != "both")
                    return $"'{face}' is not a face - front, rear or both. Nothing was placed.";
            }
            if (!string.IsNullOrWhiteSpace(status))
            {
                status = status.Trim().ToLowerInvariant();
                if (status != "planned" && status != "installed")
                    return $"'{status}' is not a placement status - planned or installed. " +
                           $"Nothing was placed.";
            }

            using var scope = _scopeFactory.CreateScope();
            var spacesDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Spaces>();

            var foundSpace = await ResolveSpaceAsync(spacesDb, space);
            if (foundSpace.Error != null) return foundSpace.Error + " Nothing was placed.";
            var targetSpace = foundSpace.Space!;

            int? machineId = null;
            string label;
            if (machine != null)
            {
                var machinesDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Machines>();
                var foundMachine = await ResolveMachineAsync(machinesDb, machine);
                if (foundMachine.Error != null) return foundMachine.Error + " Nothing was placed.";
                machineId = foundMachine.Machine!.Id;
                label = foundMachine.Machine!.Name ?? machine;
            }
            else
            {
                var componentsDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Components>();
                var component = await componentsDb.GetComponentByIdAsync(componentId!.Value);
                if (component == null) return $"No component with id {componentId}. Nothing was placed.";
                label = !string.IsNullOrWhiteSpace(component.Name) ? component.Name!
                      : string.Join(" ", new[] { component.Manufacturer, component.Model }
                            .Where(x => !string.IsNullOrWhiteSpace(x)));
                if (string.IsNullOrWhiteSpace(label)) label = component.Nickname ?? $"component {componentId}";
            }

            var existing = (await spacesDb.GetPlacementsForOccupantAsync(machineId, componentId)).ToList();
            var current = existing.FirstOrDefault(p => p.SpaceId == targetSpace.Id) ?? existing.FirstOrDefault();
            if (existing.Count > 1 && current!.SpaceId != targetSpace.Id)
                return $"{label} is placed in more than one space (" +
                       string.Join(", ", existing.Select(p => p.SpaceName)) +
                       $") - remove the wrong one with lab_remove_from_space first. Nothing was changed.";

            var changes = new List<string>();
            Model_Lab_Placement placement;
            if (current == null)
            {
                placement = new Model_Lab_Placement
                {
                    SpaceId = targetSpace.Id,
                    MachineId = machineId,
                    ComponentId = componentId,
                    PositionU = positionU,
                    HeightU = heightU,
                    Face = face ?? "front",
                    Status = status ?? "planned",
                };
            }
            else
            {
                placement = current;
                if (current.SpaceId != targetSpace.Id)
                {
                    changes.Add($"space {current.SpaceName} -> {targetSpace.Name}");
                    placement.SpaceId = targetSpace.Id;
                }
                if (positionU.HasValue && positionU != placement.PositionU)
                {
                    changes.Add($"position U{placement.PositionU?.ToString() ?? "-"} -> U{positionU}");
                    placement.PositionU = positionU;
                }
                if (heightU.HasValue && heightU != placement.HeightU)
                {
                    changes.Add($"height {placement.HeightU?.ToString() ?? "-"}U -> {heightU}U");
                    placement.HeightU = heightU;
                }
                if (face != null && face != placement.Face)
                {
                    changes.Add($"face {placement.Face} -> {face}");
                    placement.Face = face;
                }
                if (status != null && status != placement.Status)
                {
                    changes.Add($"status {placement.Status} -> {status}");
                    placement.Status = status;
                }
                if (changes.Count == 0)
                    return $"{label} is already placed exactly like that in {targetSpace.Name} - " +
                           $"nothing was changed.";
            }

            var problem = await spacesDb.ValidatePlacementAsync(placement);
            if (problem != null) return $"Not placed: {problem}. Nothing was written.";

            var h = placement.HeightU ?? 1;
            var at = placement.PositionU is int p
                ? (h > 1 ? $" at U{p}-U{p + h - 1}" : $" at U{p}")
                : "";

            if (current == null)
            {
                await spacesDb.CreatePlacementAsync(placement);
                return $"Placed {label} in {targetSpace.Name}{at} ({placement.Face}, " +
                       $"{placement.Status}).";
            }

            await spacesDb.UpdatePlacementAsync(placement);
            return $"Updated {label} in {targetSpace.Name}{at}:" + Environment.NewLine +
                   string.Join(Environment.NewLine, changes.Select(c => "  " + c));
        }

        [McpServerTool(Name = "lab_remove_from_space")]
        [Description("Take a machine or component OUT of a space. Deletes only the " +
                     "placement - the machine/component record, its parts, prices and " +
                     "history are untouched. Pass exactly one of machine or componentId; " +
                     "space is only needed when the occupant is placed in more than one.")]
        public async Task<string> LabRemoveFromSpaceAsync(
            [Description("Machine name or hostname.")]
            string? machine = null,
            [Description("Component id, from lab_query fields=id.")]
            int? componentId = null,
            [Description("Space name, when the occupant is placed in more than one space.")]
            string? space = null)
        {
            if ((machine == null) == (componentId == null))
                return "Pass exactly one of machine or componentId. Nothing was removed.";

            using var scope = _scopeFactory.CreateScope();
            var spacesDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Spaces>();

            int? machineId = null;
            string label;
            if (machine != null)
            {
                var machinesDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Machines>();
                var foundMachine = await ResolveMachineAsync(machinesDb, machine);
                if (foundMachine.Error != null) return foundMachine.Error + " Nothing was removed.";
                machineId = foundMachine.Machine!.Id;
                label = foundMachine.Machine!.Name ?? machine;
            }
            else
            {
                var componentsDb = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Components>();
                var component = await componentsDb.GetComponentByIdAsync(componentId!.Value);
                if (component == null) return $"No component with id {componentId}. Nothing was removed.";
                label = !string.IsNullOrWhiteSpace(component.Name) ? component.Name!
                      : string.Join(" ", new[] { component.Manufacturer, component.Model }
                            .Where(x => !string.IsNullOrWhiteSpace(x)));
                if (string.IsNullOrWhiteSpace(label)) label = component.Nickname ?? $"component {componentId}";
            }

            var placements = (await spacesDb.GetPlacementsForOccupantAsync(machineId, componentId)).ToList();
            if (!string.IsNullOrWhiteSpace(space))
            {
                var foundSpace = await ResolveSpaceAsync(spacesDb, space);
                if (foundSpace.Error != null) return foundSpace.Error + " Nothing was removed.";
                placements = placements.Where(p => p.SpaceId == foundSpace.Space!.Id).ToList();
            }

            if (placements.Count == 0)
                return $"{label} is not placed" +
                       (string.IsNullOrWhiteSpace(space) ? " in any space." : $" in {space}.") +
                       " Nothing was removed.";
            if (placements.Count > 1)
                return $"{label} is placed in more than one space: " +
                       string.Join(", ", placements.Select(p => p.SpaceName)) +
                       ". Say which with the space argument. Nothing was removed.";

            var target = placements[0];
            await spacesDb.DeletePlacementAsync(target.Id);

            var h = target.HeightU ?? 1;
            var at = target.PositionU is int p
                ? (h > 1 ? $" (was U{p}-U{p + h - 1})" : $" (was U{p})")
                : "";
            return $"Removed {label} from {target.SpaceName}{at}. The record itself is untouched.";
        }

        // Shared space-by-name resolution, mirroring ResolveMachineAsync: exact name
        // first, then substring; refuse zero and refuse many.
        private static async Task<(Model_Lab_Space? Space, string? Error)> ResolveSpaceAsync(
            Service_Database_Manager_Lab_Spaces spacesDb, string space)
        {
            var want = (space ?? "").Trim();
            var all = (await spacesDb.GetAllSpacesAsync()).ToList();
            if (string.IsNullOrEmpty(want))
                return (null, "Which space? Spaces: " +
                              string.Join(", ", all.Select(s => s.Name).OrderBy(n => n)) + ".");

            var hits = all.Where(s => string.Equals(s.Name, want, StringComparison.OrdinalIgnoreCase)).ToList();
            if (hits.Count == 0)
                hits = all.Where(s => (s.Name ?? "").Contains(want, StringComparison.OrdinalIgnoreCase)).ToList();
            if (hits.Count == 0)
                return (null, $"No space matches '{want}'. Spaces: " +
                              string.Join(", ", all.Select(s => s.Name).OrderBy(n => n)) + ".");
            if (hits.Count > 1)
                return (null, $"'{want}' is ambiguous: " + string.Join(", ", hits.Select(s => s.Name)) +
                              ". Say the full name.");
            return (hits[0], null);
        }

        // Shared machine-by-name resolution: exact name/hostname first, then substring;
        // refuse zero and refuse many. Same behaviour lab_move_component established.
        private static async Task<(Model_Lab_Machine? Machine, string? Error)> ResolveMachineAsync(
            Service_Database_Manager_Lab_Machines machines, string machine)
        {
            var want = (machine ?? "").Trim();
            var all = (await machines.GetAllMachinesAsync()).ToList();
            if (string.IsNullOrEmpty(want))
                return (null, "Which machine? Machines: " +
                              string.Join(", ", all.Select(m => m.Name).OrderBy(n => n)) + ".");

            var hits = all.Where(m =>
                    string.Equals(m.Name, want, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(m.Hostname, want, StringComparison.OrdinalIgnoreCase))
                .ToList();
            if (hits.Count == 0)
                hits = all.Where(m =>
                        (m.Name ?? "").Contains(want, StringComparison.OrdinalIgnoreCase) ||
                        (m.Hostname ?? "").Contains(want, StringComparison.OrdinalIgnoreCase))
                    .ToList();
            if (hits.Count == 0)
                return (null, $"No machine matches '{want}'. Machines: " +
                              string.Join(", ", all.Select(m => m.Name).OrderBy(n => n)) + ".");
            if (hits.Count > 1)
                return (null, $"'{want}' is ambiguous: " + string.Join(", ", hits.Select(m => m.Name)) +
                              ". Say the full name.");
            return (hits[0], null);
        }

    }
}
