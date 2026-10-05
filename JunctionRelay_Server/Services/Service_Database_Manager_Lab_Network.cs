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

using Dapper;
using JunctionRelayServer.Models;
using System.Data;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace JunctionRelayServer.Services
{
    // Homelab module (LAB) — the network page: nodes, their ports and the links between ports. ONE copy of
    // the rules and of the port generator, used by the API and the MCP tools. See Model_Lab_Network.
    public class Service_Database_Manager_Lab_Network
    {
        private readonly IDbConnection _db;
        public Service_Database_Manager_Lab_Network(IDbConnection db) { _db = db; }

        public static readonly string[] Medias = { "rj45", "sfp", "sfp28", "qsfp", "other" };
        public static readonly string[] Sides = { "left", "right", "top", "bottom" };
        public static readonly string[] ZoneKinds = { "dmz", "untrusted" };

        // ── the port spec grammar ───────────────────────────────────────────────────────────────
        // "4x RJ45 2.5G, 2x SFP+ 10G" - comma or semicolon separated; each part COUNT x MEDIA SPEED, with an
        // optional label in brackets that becomes the port name prefix: "1x RJ45 2.5G (onboard)".
        private static readonly Regex SpecPart = new(
            @"^\s*(\d+)\s*[x×]\s*(RJ-?45|SFP28|SFP\+|SFP|QSFP28|QSFP\+?)\s*(?:([\d.]+)\s*(G|M)(?:b(?:ps|it)?|bE)?)?\s*(?:\(([^)]*)\))?\s*$",
            RegexOptions.IgnoreCase);

        public record SpecGroup(int Count, string Media, double? SpeedGb, string? Label);

        // Null when the spec is empty; otherwise the groups, or the part it could not read.
        public static (List<SpecGroup> Groups, string? Error) ParseSpec(string? spec)
        {
            var groups = new List<SpecGroup>();
            if (string.IsNullOrWhiteSpace(spec)) return (groups, null);
            foreach (var raw in spec.Split(new[] { ',', ';', '\n' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var m = SpecPart.Match(raw);
                if (!m.Success) return (groups, $"Cannot read '{raw.Trim()}' - write it as e.g. '4x RJ45 2.5G' or '2x SFP+ 10G'.");
                var media = m.Groups[2].Value.ToUpperInvariant() switch
                {
                    var s when s.StartsWith("RJ") => "rj45",
                    "SFP28" => "sfp28",
                    var s when s.StartsWith("QSFP") => "qsfp",
                    _ => "sfp",
                };
                double? speed = null;
                if (m.Groups[3].Success && double.TryParse(m.Groups[3].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var v))
                    speed = m.Groups[4].Value.Equals("M", StringComparison.OrdinalIgnoreCase) ? v / 1000.0 : v;
                groups.Add(new SpecGroup(int.Parse(m.Groups[1].Value), media, speed,
                    m.Groups[5].Success && !string.IsNullOrWhiteSpace(m.Groups[5].Value) ? m.Groups[5].Value.Trim() : null));
            }
            return (groups, null);
        }

        private static string SpeedText(double? gb) => gb is null ? "" : gb >= 1 ? $"{gb.Value.ToString("0.##", CultureInfo.InvariantCulture)}G" : $"{gb.Value * 1000:0}M";
        private static string MediaText(string media) => media switch { "sfp" => "SFP+", "sfp28" => "SFP28", "qsfp" => "QSFP", "rj45" => "RJ45", _ => "Port" };

        private static string? SpecOf(string? specJson)
        {
            if (string.IsNullOrWhiteSpace(specJson)) return null;
            try
            {
                using var doc = JsonDocument.Parse(specJson);
                return doc.RootElement.ValueKind == JsonValueKind.Object && doc.RootElement.TryGetProperty("ports", out var p)
                       && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
            }
            catch (JsonException) { return null; }
        }

        private class Source { public int? ComponentId { get; set; } public string? Spec { get; set; } }

        // What a node's ports should be, from the Lab: a placeholder's own list, a component's spec field, or a
        // machine's installed parts that carry one (its NICs and motherboard). Names count per media and speed
        // across the whole node, so two NICs give SFP+ 1..4, not two SFP+ 1s.
        public async Task<(List<Model_Lab_NetworkPort> Ports, string? Error)> PortsFromSpecAsync(Model_Lab_NetworkNode n)
        {
            var sources = new List<Source>();
            if (n.ComponentId.HasValue)
                sources.Add(new Source { ComponentId = n.ComponentId, Spec = SpecOf(await _db.ExecuteScalarAsync<string?>(
                    "SELECT SpecJson FROM Lab_Components WHERE Id = @Id", new { Id = n.ComponentId })) });
            else if (n.MachineId.HasValue)
                sources.AddRange((await _db.QueryAsync<(int Id, string? SpecJson)>(
                        "SELECT Id, SpecJson FROM Lab_Components WHERE CurrentMachineId = @M ORDER BY Id", new { M = n.MachineId }))
                    .Select(r => new Source { ComponentId = r.Id, Spec = SpecOf(r.SpecJson) })
                    .Where(s => !string.IsNullOrWhiteSpace(s.Spec)));
            else
                sources.Add(new Source { Spec = n.PortsSpec });

            var ports = new List<Model_Lab_NetworkPort>();
            var counters = new Dictionary<string, int>();
            var sideCount = new Dictionary<string, int>();
            foreach (var s in sources)
            {
                var (groups, error) = ParseSpec(s.Spec);
                if (error != null) return (ports, error);
                foreach (var g in groups)
                    for (int i = 0; i < g.Count; i++)
                    {
                        var key = g.Media == "rj45" ? $"rj45|{g.SpeedGb}|{g.Label}" : $"{g.Media}|{g.Label}";
                        counters[key] = counters.GetValueOrDefault(key) + 1;
                        var stem = g.Media == "rj45" ? (SpeedText(g.SpeedGb) is { Length: > 0 } st ? st : "RJ45") : MediaText(g.Media);
                        var name = $"{(g.Label != null ? g.Label + " " : "")}{stem}{(g.Media == "rj45" ? "-" : " ")}{counters[key]}";
                        // Machines draw their ports on top (toward the switch above); a switch puts cages on the
                        // right and copper along the bottom. Every port can be moved afterwards.
                        var side = n.MachineId.HasValue ? "top" : g.Media == "rj45" ? "bottom" : "right";
                        sideCount[side] = sideCount.GetValueOrDefault(side) + 1;
                        ports.Add(new Model_Lab_NetworkPort
                        {
                            NodeId = n.Id, Name = name, Media = g.Media, SpeedGb = g.SpeedGb,
                            Side = side, Position = sideCount[side], SourceComponentId = n.MachineId.HasValue ? s.ComponentId : null,
                        });
                    }
            }
            return (ports, null);
        }

        // ── reads ───────────────────────────────────────────────────────────────────────────────
        private class NodeRow : Model_Lab_NetworkNode
        {
            public string? MName { get; set; }
            public string? MOS { get; set; }
            public string? MRole { get; set; }
            public string? CName { get; set; }
            public string? CManufacturer { get; set; }
            public string? CModel { get; set; }
            public string? CType { get; set; }
            public int? CMachineId { get; set; }
            public bool MachineExists { get; set; }
            public bool ComponentExists { get; set; }
        }
        private class PlaceRow { public int SpaceId { get; set; } public string? SpaceName { get; set; } public int? MachineId { get; set; } public int? ComponentId { get; set; } public int? PositionU { get; set; } public int? HeightU { get; set; } }

        public async Task<List<Model_Lab_NetworkNode>> GetNodesAsync()
        {
            var rows = (await _db.QueryAsync<NodeRow>(@"
                SELECT n.*, m.Name AS MName, m.OS AS MOS, m.Role AS MRole,
                       c.Name AS CName, c.Manufacturer AS CManufacturer, c.Model AS CModel, c.Type AS CType, c.CurrentMachineId AS CMachineId,
                       (m.Id IS NOT NULL) AS MachineExists, (c.Id IS NOT NULL) AS ComponentExists
                FROM Lab_Network_Nodes n
                LEFT JOIN Lab_Machines m ON m.Id = n.MachineId
                LEFT JOIN Lab_Components c ON c.Id = n.ComponentId
                ORDER BY n.Row, n.Position, n.Id")).ToList();
            var places = (await _db.QueryAsync<PlaceRow>(@"
                SELECT p.SpaceId, s.Name AS SpaceName, p.MachineId, p.ComponentId, p.PositionU, p.HeightU
                FROM Lab_Placements p JOIN Lab_Spaces s ON s.Id = p.SpaceId")).ToList();
            var spaceRows = (await _db.QueryAsync<(int Id, string Name, int? ParentSpaceId)>("SELECT Id, Name, ParentSpaceId FROM Lab_Spaces")).ToDictionary(s => s.Id);
            var spaces = spaceRows.ToDictionary(kv => kv.Key, kv => kv.Value.Name);
            int TopOf(int id)
            {
                var seen = new HashSet<int>();
                while (spaceRows.TryGetValue(id, out var s) && s.ParentSpaceId is int p && spaceRows.ContainsKey(p) && seen.Add(id)) id = p;
                return id;
            }

            foreach (var r in rows)
            {
                PlaceRow? place = null;
                if (r.MachineId.HasValue)
                {
                    r.Missing = !r.MachineExists;
                    r.DisplayName = r.Label ?? r.MName ?? $"machine #{r.MachineId}";
                    r.RefLine = "machine" + string.Concat(new[] { r.MName != null && r.Label != null ? r.MName : null, r.MOS }
                        .Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => " · " + s));
                    place = places.FirstOrDefault(p => p.MachineId == r.MachineId);
                }
                else if (r.ComponentId.HasValue)
                {
                    r.Missing = !r.ComponentExists;
                    var model = r.CName ?? string.Join(" ", new[] { r.CManufacturer, r.CModel }.Where(s => !string.IsNullOrWhiteSpace(s)));
                    r.DisplayName = r.Label ?? (string.IsNullOrWhiteSpace(model) ? $"component #{r.ComponentId}" : model);
                    r.RefLine = $"component #{r.ComponentId}" + (r.Label != null && !string.IsNullOrWhiteSpace(model) ? $" · {model}" : "");
                    place = places.FirstOrDefault(p => p.ComponentId == r.ComponentId)
                            ?? (r.CMachineId.HasValue ? places.FirstOrDefault(p => p.MachineId == r.CMachineId) : null);
                }
                else
                {
                    r.DisplayName = r.Label ?? "placeholder";
                    r.RefLine = "placeholder · not in the Lab";
                }
                if (r.SpaceId.HasValue)
                {
                    r.ResolvedSpaceId = r.SpaceId;
                    r.ResolvedSpaceName = spaces.GetValueOrDefault(r.SpaceId.Value);
                }
                else if (place != null)
                {
                    r.ResolvedSpaceId = place.SpaceId;
                    r.ResolvedSpaceName = place.SpaceName;
                    if (place.PositionU.HasValue)
                        r.PlacementNote = place.HeightU is > 1 ? $"U{place.PositionU}-U{place.PositionU + place.HeightU - 1}" : $"U{place.PositionU}";
                }
                if (r.ResolvedSpaceId is int direct)
                {
                    var top = TopOf(direct);
                    r.FrameSpaceId = top;
                    r.FrameSpaceName = spaces.GetValueOrDefault(top);
                    if (top != direct) { r.SubSpaceId = direct; r.SubSpaceName = r.ResolvedSpaceName; }
                }
            }
            return rows.Cast<Model_Lab_NetworkNode>().ToList();
        }

        public async Task<Model_Lab_NetworkNode?> GetNodeAsync(int id) => (await GetNodesAsync()).FirstOrDefault(n => n.Id == id);

        public async Task<List<Model_Lab_NetworkPort>> GetPortsAsync(int? nodeId = null) =>
            (await _db.QueryAsync<Model_Lab_NetworkPort>(@"
                SELECT p.*,
                       COALESCE(mc.Name, TRIM(COALESCE(mc.Manufacturer, '') || ' ' || COALESCE(mc.Model, ''))) AS ModuleName,
                       COALESCE(sc.Name, TRIM(COALESCE(sc.Manufacturer, '') || ' ' || COALESCE(sc.Model, ''))) AS SourceName
                FROM Lab_Network_Ports p
                LEFT JOIN Lab_Components mc ON mc.Id = p.ModuleComponentId
                LEFT JOIN Lab_Components sc ON sc.Id = p.SourceComponentId
                WHERE @NodeId IS NULL OR p.NodeId = @NodeId
                ORDER BY p.NodeId, p.Side, p.Position, p.Id", new { NodeId = nodeId })).ToList();

        public async Task<Model_Lab_NetworkPort?> GetPortAsync(int id) =>
            (await _db.QueryAsync<Model_Lab_NetworkPort>("SELECT * FROM Lab_Network_Ports WHERE Id = @Id", new { Id = id })).FirstOrDefault();

        public async Task<List<Model_Lab_NetworkLink>> GetLinksAsync() =>
            (await _db.QueryAsync<Model_Lab_NetworkLink>("SELECT * FROM Lab_Network_Links ORDER BY Id")).ToList();

        public async Task<Model_Lab_NetworkLink?> GetLinkAsync(int id) =>
            (await _db.QueryAsync<Model_Lab_NetworkLink>("SELECT * FROM Lab_Network_Links WHERE Id = @Id", new { Id = id })).FirstOrDefault();

        public async Task<Model_Lab_NetworkGraph> GetGraphAsync()
        {
            var g = new Model_Lab_NetworkGraph { Nodes = await GetNodesAsync(), Ports = await GetPortsAsync(), Links = await GetLinksAsync(), Zones = await GetZonesAsync() };
            var ports = g.Ports.ToDictionary(p => p.Id);
            var nodes = g.Nodes.ToDictionary(n => n.Id);
            string Where(Model_Lab_NetworkPort p) => $"{(nodes.TryGetValue(p.NodeId, out var n) ? n.DisplayName : $"node #{p.NodeId}")} {p.Name}";
            foreach (var l in g.Links)
            {
                if (!ports.TryGetValue(l.PortAId, out var a) || !ports.TryGetValue(l.PortBId, out var b)) continue;
                l.SpeedGb = a.SpeedGb.HasValue && b.SpeedGb.HasValue ? Math.Min(a.SpeedGb.Value, b.SpeedGb.Value) : a.SpeedGb ?? b.SpeedGb;
                if (a.SpeedGb.HasValue && b.SpeedGb.HasValue && a.SpeedGb != b.SpeedGb)
                    g.Checks.Add(new() { Level = "warn", Text = $"{Where(a)} ({SpeedText(a.SpeedGb)}) to {Where(b)} ({SpeedText(b.SpeedGb)}) runs at {SpeedText(l.SpeedGb)}." });
                if (l.Status == "live" && ((nodes.GetValueOrDefault(a.NodeId)?.Status == "planned") || (nodes.GetValueOrDefault(b.NodeId)?.Status == "planned")))
                    g.Checks.Add(new() { Level = "warn", Text = $"Link #{l.Id} is live but touches a planned device." });
            }
            foreach (var n in g.Nodes.Where(n => n.Missing))
                g.Checks.Add(new() { Level = "warn", Text = $"{n.DisplayName}: its Lab record is gone (node #{n.Id})." });
            foreach (var n in g.Nodes.Where(n => !n.Missing && !g.Ports.Any(p => p.NodeId == n.Id)))
                g.Checks.Add(new() { Level = "info", Text = $"{n.DisplayName} has no ports yet: set the 'ports' spec field on its record (or its NICs) and sync, or add ports by hand." });
            foreach (var z in g.Zones.Where(z => z.NodeIds.Count == 0))
                g.Checks.Add(new() { Level = "info", Text = $"Zone {z.Name} has no devices yet, so it is not drawn." });
            var planned = g.Links.Count(l => l.Status == "planned");
            if (planned > 0) g.Checks.Add(new() { Level = "info", Text = $"{planned} planned link{(planned > 1 ? "s" : "")}." });
            var modules = g.Ports.Count(p => p.Media is "sfp" or "sfp28" && (p.ModuleComponentId.HasValue || p.ModuleLabel != null));
            if (g.Links.Count > 0 && !g.Checks.Any(c => c.Level == "warn"))
                g.Checks.Add(new() { Level = "ok", Text = $"Every link runs at both ends' speed{(modules > 0 ? $"; {modules} cage{(modules > 1 ? "s" : "")} hold a module" : "")}." });
            return g;
        }

        // ── zones ──────────────────────────────────────────────────────────────────────────────
        public async Task<List<Model_Lab_NetworkZone>> GetZonesAsync()
        {
            var zones = (await _db.QueryAsync<Model_Lab_NetworkZone>("SELECT * FROM Lab_Network_Zones ORDER BY Name, Id")).ToList();
            var members = (await _db.QueryAsync<(int NodeId, int ZoneId)>("SELECT NodeId, ZoneId FROM Lab_Network_ZoneNodes ORDER BY NodeId")).ToList();
            foreach (var z in zones) z.NodeIds = members.Where(m => m.ZoneId == z.Id).Select(m => m.NodeId).ToList();
            return zones;
        }

        public async Task<Model_Lab_NetworkZone?> GetZoneAsync(int id) => (await GetZonesAsync()).FirstOrDefault(z => z.Id == id);

        public async Task<string?> InvalidZoneAsync(Model_Lab_NetworkZone z)
        {
            if (string.IsNullOrWhiteSpace(z.Name)) return "A zone needs a name.";
            if (!ZoneKinds.Contains(z.Kind)) return $"Kind must be one of: {string.Join(", ", ZoneKinds)}.";
            if (z.NodeIds.Count != z.NodeIds.Distinct().Count()) return "A device is listed twice.";
            var known = (await _db.QueryAsync<int>("SELECT Id FROM Lab_Network_Nodes")).ToHashSet();
            var unknown = z.NodeIds.Where(id => !known.Contains(id)).ToList();
            return unknown.Count > 0 ? $"No network node with id {string.Join(", ", unknown)}." : null;
        }

        // Saving a zone replaces its device list; a device taken into it leaves any other zone.
        private async Task SetZoneNodesAsync(int zoneId, List<int> nodeIds, IDbTransaction tx)
        {
            await _db.ExecuteAsync("DELETE FROM Lab_Network_ZoneNodes WHERE ZoneId = @ZoneId", new { ZoneId = zoneId }, tx);
            foreach (var nodeId in nodeIds)
                await _db.ExecuteAsync("INSERT OR REPLACE INTO Lab_Network_ZoneNodes (NodeId, ZoneId) VALUES (@NodeId, @ZoneId)", new { NodeId = nodeId, ZoneId = zoneId }, tx);
        }

        public async Task<int> CreateZoneAsync(Model_Lab_NetworkZone z)
        {
            z.CreatedAt = z.UpdatedAt = DateTime.UtcNow;
            using var tx = _db.BeginTransaction();
            try
            {
                var id = await _db.ExecuteScalarAsync<int>(@"
                    INSERT INTO Lab_Network_Zones (Name, Kind, Notes, CreatedAt, UpdatedAt) VALUES (@Name, @Kind, @Notes, @CreatedAt, @UpdatedAt);
                    SELECT last_insert_rowid();", z, tx);
                await SetZoneNodesAsync(id, z.NodeIds, tx);
                tx.Commit();
                return id;
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }

        public async Task UpdateZoneAsync(Model_Lab_NetworkZone z)
        {
            z.UpdatedAt = DateTime.UtcNow;
            using var tx = _db.BeginTransaction();
            try
            {
                await _db.ExecuteAsync("UPDATE Lab_Network_Zones SET Name = @Name, Kind = @Kind, Notes = @Notes, UpdatedAt = @UpdatedAt WHERE Id = @Id", z, tx);
                await SetZoneNodesAsync(z.Id, z.NodeIds, tx);
                tx.Commit();
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }

        // One device in or out of a zone (zoneId null = out of every zone) - the device dialog's picker.
        public async Task SetNodeZoneAsync(int nodeId, int? zoneId)
        {
            if (zoneId.HasValue)
                await _db.ExecuteAsync("INSERT OR REPLACE INTO Lab_Network_ZoneNodes (NodeId, ZoneId) VALUES (@NodeId, @ZoneId)", new { NodeId = nodeId, ZoneId = zoneId });
            else
                await _db.ExecuteAsync("DELETE FROM Lab_Network_ZoneNodes WHERE NodeId = @NodeId", new { NodeId = nodeId });
        }

        public async Task<bool> DeleteZoneAsync(int id)
        {
            using var tx = _db.BeginTransaction();
            try
            {
                await _db.ExecuteAsync("DELETE FROM Lab_Network_ZoneNodes WHERE ZoneId = @Id", new { Id = id }, tx);
                var deleted = await _db.ExecuteAsync("DELETE FROM Lab_Network_Zones WHERE Id = @Id", new { Id = id }, tx) > 0;
                tx.Commit();
                return deleted;
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }

        // ── lookups for the MCP tools (by id or name) ───────────────────────────────────────────
        public async Task<List<(int Id, string Name)>> FindComponentsAsync(string text)
        {
            var t = text.Trim();
            if (int.TryParse(t.TrimStart('#'), out var id))
                return (await _db.QueryAsync<(int, string)>(@"SELECT Id, COALESCE(Name, TRIM(COALESCE(Manufacturer,'') || ' ' || COALESCE(Model,''))) FROM Lab_Components WHERE Id = @Id", new { Id = id })).ToList();
            var rows = (await _db.QueryAsync<(int Id, string Name)>(@"
                SELECT Id, COALESCE(Name, TRIM(COALESCE(Manufacturer,'') || ' ' || COALESCE(Model,''))) AS Name FROM Lab_Components
                WHERE Status NOT IN ('sold','disposed','lost')
                  AND (Name LIKE @Q OR Model LIKE @Q OR Nickname LIKE @Q OR (COALESCE(Manufacturer,'') || ' ' || COALESCE(Model,'')) LIKE @Q)",
                new { Q = $"%{t}%" })).ToList();
            var exact = rows.Where(r => r.Name.Equals(t, StringComparison.OrdinalIgnoreCase)).ToList();
            return exact.Count == 1 ? exact : rows;
        }

        public async Task<List<(int Id, string Name)>> FindSpacesAsync(string text)
        {
            var t = text.Trim();
            if (int.TryParse(t.TrimStart('#'), out var id))
                return (await _db.QueryAsync<(int, string)>("SELECT Id, Name FROM Lab_Spaces WHERE Id = @Id", new { Id = id })).ToList();
            var rows = (await _db.QueryAsync<(int Id, string Name)>("SELECT Id, Name FROM Lab_Spaces WHERE Name LIKE @Q", new { Q = $"%{t}%" })).ToList();
            var exact = rows.Where(r => r.Name.Equals(t, StringComparison.OrdinalIgnoreCase)).ToList();
            return exact.Count == 1 ? exact : rows;
        }

        // ── rules ───────────────────────────────────────────────────────────────────────────────
        public async Task<string?> InvalidNodeAsync(Model_Lab_NetworkNode n)
        {
            if (n.MachineId.HasValue && n.ComponentId.HasValue) return "A node is a machine or a component, not both.";
            if (n.Status is not ("live" or "planned")) return "Status must be live or planned.";
            if (n.MachineId.HasValue)
            {
                if (await _db.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM Lab_Machines WHERE Id = @Id", new { Id = n.MachineId }) == 0)
                    return $"No Lab machine with id {n.MachineId}.";
                if (await _db.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM Lab_Network_Nodes WHERE MachineId = @M AND Id <> @Id", new { M = n.MachineId, n.Id }) > 0)
                    return "That machine is already on the network page.";
            }
            else if (n.ComponentId.HasValue)
            {
                if (await _db.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM Lab_Components WHERE Id = @Id", new { Id = n.ComponentId }) == 0)
                    return $"No Lab component with id {n.ComponentId}.";
                if (await _db.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM Lab_Network_Nodes WHERE ComponentId = @C AND Id <> @Id", new { C = n.ComponentId, n.Id }) > 0)
                    return "That component is already on the network page.";
            }
            else
            {
                if (string.IsNullOrWhiteSpace(n.Label)) return "A placeholder (no machine or component) needs a label.";
                if (n.Status != "planned") return "A placeholder is not in the Lab, so it is always planned.";
                if (ParseSpec(n.PortsSpec).Error is string e) return e;
            }
            if (n.SpaceId.HasValue && await _db.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM Lab_Spaces WHERE Id = @Id", new { Id = n.SpaceId }) == 0)
                return $"No Lab Space with id {n.SpaceId}.";
            return null;
        }

        public async Task<string?> InvalidPortAsync(Model_Lab_NetworkPort p)
        {
            if (await _db.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM Lab_Network_Nodes WHERE Id = @Id", new { Id = p.NodeId }) == 0)
                return $"No network node with id {p.NodeId}.";
            if (string.IsNullOrWhiteSpace(p.Name)) return "A port needs a name.";
            if (!Medias.Contains(p.Media)) return $"Media must be one of: {string.Join(", ", Medias)}.";
            if (!Sides.Contains(p.Side)) return $"Side must be one of: {string.Join(", ", Sides)}.";
            if (p.SpeedGb is <= 0) return "Speed must be positive (Gb/s).";
            if (await _db.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM Lab_Network_Ports WHERE NodeId = @N AND Name = @Name AND Id <> @Id",
                    new { N = p.NodeId, p.Name, p.Id }) > 0) return $"This device already has a port named '{p.Name}'.";
            if (p.ModuleComponentId.HasValue && await _db.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM Lab_Components WHERE Id = @Id", new { Id = p.ModuleComponentId }) == 0)
                return $"No Lab component with id {p.ModuleComponentId} for the module.";
            return null;
        }

        public async Task<string?> InvalidLinkAsync(Model_Lab_NetworkLink l)
        {
            if (l.Status is not ("live" or "planned")) return "Status must be live or planned.";
            if (l.PortAId == l.PortBId) return "A link joins two different ports.";
            var a = await GetPortAsync(l.PortAId);
            var b = await GetPortAsync(l.PortBId);
            if (a == null || b == null) return $"No port with id {(a == null ? l.PortAId : l.PortBId)}.";
            if (a.NodeId == b.NodeId) return "A link joins two different devices.";
            var busy = (await _db.QueryAsync<int>(@"SELECT PortAId FROM Lab_Network_Links WHERE Id <> @Id UNION SELECT PortBId FROM Lab_Network_Links WHERE Id <> @Id",
                new { l.Id })).ToHashSet();
            if (busy.Contains(a.Id)) return $"Port '{a.Name}' (#{a.Id}) already has a link.";
            if (busy.Contains(b.Id)) return $"Port '{b.Name}' (#{b.Id}) already has a link.";
            return null;
        }

        // ── writes ──────────────────────────────────────────────────────────────────────────────
        // A standalone component's status follows its use - Service_Database_Manager_Lab_Components holds the rule.
        private Task SyncComponentStatusAsync(int? componentId) =>
            Service_Database_Manager_Lab_Components.SyncStandaloneStatusAsync(_db, componentId);

        public async Task<(int Id, int PortsAdded, string? Warning)> CreateNodeAsync(Model_Lab_NetworkNode n, bool withPorts = true)
        {
            n.CreatedAt = n.UpdatedAt = DateTime.UtcNow;
            if (!n.MachineId.HasValue && !n.ComponentId.HasValue) n.Status = "planned";
            // Ports are worked out before the transaction: every command inside one must carry it.
            var (ports, error) = withPorts ? await PortsFromSpecAsync(n) : (new List<Model_Lab_NetworkPort>(), null);
            using (var tx = _db.BeginTransaction())
            {
                try
                {
                    n.Id = await _db.ExecuteScalarAsync<int>(@"
                        INSERT INTO Lab_Network_Nodes (MachineId, ComponentId, Label, PortsSpec, Status, SpaceId, Row, Position, Notes, CreatedAt, UpdatedAt)
                        VALUES (@MachineId, @ComponentId, @Label, @PortsSpec, @Status, @SpaceId, @Row, @Position, @Notes, @CreatedAt, @UpdatedAt);
                        SELECT last_insert_rowid();", n, tx);
                    foreach (var p in ports) { p.NodeId = n.Id; await CreatePortAsync(p, tx); }
                    tx.Commit();
                }
                catch
                {
                    tx.Rollback();
                    throw;
                }
            }
            await SyncComponentStatusAsync(n.ComponentId);
            if (!withPorts) return (n.Id, 0, null);
            return (n.Id, ports.Count, error ?? NoPortsWarning(n, ports.Count));
        }

        public async Task UpdateNodeAsync(Model_Lab_NetworkNode n)
        {
            n.UpdatedAt = DateTime.UtcNow;
            if (!n.MachineId.HasValue && !n.ComponentId.HasValue) n.Status = "planned";
            await _db.ExecuteAsync(@"
                UPDATE Lab_Network_Nodes SET MachineId = @MachineId, ComponentId = @ComponentId, Label = @Label, PortsSpec = @PortsSpec,
                    Status = @Status, SpaceId = @SpaceId, Row = @Row, Position = @Position, Notes = @Notes, UpdatedAt = @UpdatedAt
                WHERE Id = @Id", n);
            await SyncComponentStatusAsync(n.ComponentId);
        }

        // Adds the spec's ports this node does not have yet (by name). Never deletes: a port that went away
        // from the spec may still carry a link, so removing it stays a deliberate edit.
        public async Task<(int Added, string? Warning)> SyncPortsAsync(int nodeId)
        {
            var node = (await _db.QueryAsync<Model_Lab_NetworkNode>("SELECT * FROM Lab_Network_Nodes WHERE Id = @Id", new { Id = nodeId })).FirstOrDefault();
            if (node == null) return (0, $"No network node with id {nodeId}.");
            var (wanted, error) = await PortsFromSpecAsync(node);
            if (error != null) return (0, error);
            var have = (await GetPortsAsync(nodeId)).Select(p => p.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var sideMax = (await GetPortsAsync(nodeId)).GroupBy(p => p.Side).ToDictionary(g => g.Key, g => g.Max(p => p.Position));
            var missing = wanted.Where(p => !have.Contains(p.Name)).ToList();
            using (var tx = _db.BeginTransaction())
            {
                try
                {
                    foreach (var p in missing)
                    {
                        sideMax[p.Side] = sideMax.GetValueOrDefault(p.Side) + 1;
                        p.Position = sideMax[p.Side];
                        await CreatePortAsync(p, tx);
                    }
                    tx.Commit();
                }
                catch
                {
                    tx.Rollback();
                    throw;
                }
            }
            return (missing.Count, NoPortsWarning(node, wanted.Count));
        }

        private static string? NoPortsWarning(Model_Lab_NetworkNode node, int wanted) =>
            wanted > 0 ? null
            : node.MachineId.HasValue ? "None of this machine's installed parts has a 'ports' spec field yet."
            : "Its 'ports' spec field is empty.";

        public async Task<int> CreatePortAsync(Model_Lab_NetworkPort p, IDbTransaction? tx = null)
        {
            p.CreatedAt = p.UpdatedAt = DateTime.UtcNow;
            return await _db.ExecuteScalarAsync<int>(@"
                INSERT INTO Lab_Network_Ports (NodeId, Name, Media, SpeedGb, Side, Position, ModuleComponentId, ModuleLabel, SourceComponentId, Notes, CreatedAt, UpdatedAt)
                VALUES (@NodeId, @Name, @Media, @SpeedGb, @Side, @Position, @ModuleComponentId, @ModuleLabel, @SourceComponentId, @Notes, @CreatedAt, @UpdatedAt);
                SELECT last_insert_rowid();", p, tx);
        }

        public async Task UpdatePortAsync(Model_Lab_NetworkPort p)
        {
            p.UpdatedAt = DateTime.UtcNow;
            await _db.ExecuteAsync(@"
                UPDATE Lab_Network_Ports SET Name = @Name, Media = @Media, SpeedGb = @SpeedGb, Side = @Side, Position = @Position,
                    ModuleComponentId = @ModuleComponentId, ModuleLabel = @ModuleLabel, SourceComponentId = @SourceComponentId,
                    Notes = @Notes, UpdatedAt = @UpdatedAt
                WHERE Id = @Id", p);
        }

        public async Task<int> CreateLinkAsync(Model_Lab_NetworkLink l)
        {
            l.CreatedAt = l.UpdatedAt = DateTime.UtcNow;
            return await _db.ExecuteScalarAsync<int>(@"
                INSERT INTO Lab_Network_Links (PortAId, PortBId, Status, Notes, CreatedAt, UpdatedAt)
                VALUES (@PortAId, @PortBId, @Status, @Notes, @CreatedAt, @UpdatedAt);
                SELECT last_insert_rowid();", l);
        }

        public async Task UpdateLinkAsync(Model_Lab_NetworkLink l)
        {
            l.UpdatedAt = DateTime.UtcNow;
            await _db.ExecuteAsync("UPDATE Lab_Network_Links SET PortAId = @PortAId, PortBId = @PortBId, Status = @Status, Notes = @Notes, UpdatedAt = @UpdatedAt WHERE Id = @Id", l);
        }

        // Deletes take what hangs off them: a node its ports and zone place, a port its link - a line to nowhere draws nothing useful.
        public async Task<bool> DeleteNodeAsync(int id)
        {
            var componentId = await _db.ExecuteScalarAsync<int?>("SELECT ComponentId FROM Lab_Network_Nodes WHERE Id = @Id", new { Id = id });
            bool deleted;
            using (var tx = _db.BeginTransaction())
            {
                try
                {
                    await _db.ExecuteAsync(@"DELETE FROM Lab_Network_Links WHERE PortAId IN (SELECT Id FROM Lab_Network_Ports WHERE NodeId = @Id)
                                                                           OR PortBId IN (SELECT Id FROM Lab_Network_Ports WHERE NodeId = @Id)", new { Id = id }, tx);
                    await _db.ExecuteAsync("DELETE FROM Lab_Network_Ports WHERE NodeId = @Id", new { Id = id }, tx);
                    await _db.ExecuteAsync("DELETE FROM Lab_Network_ZoneNodes WHERE NodeId = @Id", new { Id = id }, tx);
                    deleted = await _db.ExecuteAsync("DELETE FROM Lab_Network_Nodes WHERE Id = @Id", new { Id = id }, tx) > 0;
                    tx.Commit();
                }
                catch
                {
                    tx.Rollback();
                    throw;
                }
            }
            await SyncComponentStatusAsync(componentId);
            return deleted;
        }

        public async Task<bool> DeletePortAsync(int id)
        {
            using var tx = _db.BeginTransaction();
            try
            {
                await _db.ExecuteAsync("DELETE FROM Lab_Network_Links WHERE PortAId = @Id OR PortBId = @Id", new { Id = id }, tx);
                var deleted = await _db.ExecuteAsync("DELETE FROM Lab_Network_Ports WHERE Id = @Id", new { Id = id }, tx) > 0;
                tx.Commit();
                return deleted;
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }

        public async Task<bool> DeleteLinkAsync(int id) =>
            await _db.ExecuteAsync("DELETE FROM Lab_Network_Links WHERE Id = @Id", new { Id = id }) > 0;
    }
}
