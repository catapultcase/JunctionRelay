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

namespace JunctionRelayServer.Services
{
    // Lab module (HOMELAB) — Spaces and the placements inside them.
    //
    // Display fields (ComponentLabel, OccupantLabel, UsedU) are JOINed on read rather than
    // stored, per the module's "store raw, derive on read" rule: a rack's occupancy is a
    // function of its placements and must never be able to disagree with them.
    public class Service_Database_Manager_Lab_Spaces
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_Lab_Spaces(IDbConnection db)
        {
            _db = db;
        }

        // ---------------------------------------------------------------- spaces ----

        private const string SpaceSelect = @"
            SELECT s.*,
                   COALESCE(NULLIF(c.Name, ''), COALESCE(NULLIF(TRIM(COALESCE(c.Manufacturer, '') || ' ' || COALESCE(c.Model, '')), ''), c.Nickname)) AS ComponentLabel,
                   (SELECT COUNT(*) FROM Lab_Placements p WHERE p.SpaceId = s.Id) AS PlacementCount,
                   (SELECT COALESCE(SUM(COALESCE(p.HeightU, 0)), 0) FROM Lab_Placements p
                     WHERE p.SpaceId = s.Id AND p.Face <> 'rear' AND p.OnPlacementId IS NULL) AS UsedU
              FROM Lab_Spaces s
              LEFT JOIN Lab_Components c ON c.Id = s.ComponentId ";

        public async Task<IEnumerable<Model_Lab_Space>> GetAllSpacesAsync(string? kind = null, string? status = null)
        {
            var sql = SpaceSelect + " WHERE 1=1 ";
            if (!string.IsNullOrWhiteSpace(kind)) sql += " AND s.Kind = @Kind ";
            if (!string.IsNullOrWhiteSpace(status)) sql += " AND s.Status = @Status ";
            sql += " ORDER BY s.SortOrder ASC, s.Id ASC";
            return await _db.QueryAsync<Model_Lab_Space>(sql, new { Kind = kind, Status = status });
        }

        public async Task<Model_Lab_Space?> GetSpaceByIdAsync(int id)
        {
            var sql = SpaceSelect + " WHERE s.Id = @Id";
            return await _db.QuerySingleOrDefaultAsync<Model_Lab_Space>(sql, new { Id = id });
        }

        public async Task<int> CreateSpaceAsync(Model_Lab_Space space)
        {
            var maxSortOrder = await _db.ExecuteScalarAsync<int?>("SELECT MAX(SortOrder) FROM Lab_Spaces") ?? -1;
            space.SortOrder = maxSortOrder + 1;
            space.CreatedAt = DateTime.UtcNow;
            space.UpdatedAt = DateTime.UtcNow;

            const string sql = @"
                INSERT INTO Lab_Spaces (Name, Kind, ComponentId, ParentSpaceId, HeightU, WidthInches,
                                        DepthInches, Rotation, Location, Status, SortOrder, Notes, CreatedAt, UpdatedAt)
                VALUES (@Name, @Kind, @ComponentId, @ParentSpaceId, @HeightU, @WidthInches,
                        @DepthInches, @Rotation, @Location, @Status, @SortOrder, @Notes, @CreatedAt, @UpdatedAt);
                SELECT last_insert_rowid();";

            return await _db.ExecuteScalarAsync<int>(sql, space);
        }

        public async Task<bool> UpdateSpaceAsync(Model_Lab_Space space)
        {
            space.UpdatedAt = DateTime.UtcNow;
            const string sql = @"
                UPDATE Lab_Spaces SET
                    Name = @Name, Kind = @Kind, ComponentId = @ComponentId,
                    ParentSpaceId = @ParentSpaceId, HeightU = @HeightU, WidthInches = @WidthInches,
                    DepthInches = @DepthInches, Rotation = @Rotation, Location = @Location, Status = @Status,
                    SortOrder = @SortOrder, Notes = @Notes, UpdatedAt = @UpdatedAt
                WHERE Id = @Id";
            // SortOrder is editable: it decides the order rooms are drawn on the network page. Every caller
            // sends the whole space, order included.
            return await _db.ExecuteAsync(sql, space) > 0;
        }

        // Refuses while anything is still placed here. Emptying a rack is a deliberate act;
        // deleting one out from under its contents would orphan them silently.
        public async Task<string> DeleteSpaceAsync(int id)
        {
            var placed = await _db.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM Lab_Placements WHERE SpaceId = @Id", new { Id = id });
            if (placed > 0)
                return $"blocked: {placed} item(s) are still placed here - remove them first";

            var nested = await _db.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM Lab_Spaces WHERE ParentSpaceId = @Id", new { Id = id });
            if (nested > 0)
                return $"blocked: {nested} space(s) sit inside this one - move them first";

            var rows = await _db.ExecuteAsync("DELETE FROM Lab_Spaces WHERE Id = @Id", new { Id = id });
            return rows > 0 ? "deleted" : "not found";
        }

        // ------------------------------------------------------------ placements ----

        private const string PlacementSelect = @"
            SELECT p.*,
                   s.Name AS SpaceName,
                   CASE WHEN p.MachineId IS NOT NULL THEN 'machine' ELSE 'component' END AS OccupantKind,
                   COALESCE(m.Name, COALESCE(NULLIF(c.Name, ''), COALESCE(NULLIF(TRIM(COALESCE(c.Manufacturer, '') || ' ' || COALESCE(c.Model, '')), ''), c.Nickname))) AS OccupantLabel
              FROM Lab_Placements p
              LEFT JOIN Lab_Spaces s     ON s.Id = p.SpaceId
              LEFT JOIN Lab_Machines m   ON m.Id = p.MachineId
              LEFT JOIN Lab_Components c ON c.Id = p.ComponentId ";

        public async Task<IEnumerable<Model_Lab_Placement>> GetPlacementsAsync(int? spaceId = null)
        {
            var sql = PlacementSelect + (spaceId.HasValue ? " WHERE p.SpaceId = @SpaceId " : " ")
                    + " ORDER BY p.SpaceId ASC, p.PositionU DESC, p.Id ASC";
            return await _db.QueryAsync<Model_Lab_Placement>(sql, new { SpaceId = spaceId });
        }

        public async Task<Model_Lab_Placement?> GetPlacementByIdAsync(int id)
        {
            var sql = PlacementSelect + " WHERE p.Id = @Id";
            return await _db.QuerySingleOrDefaultAsync<Model_Lab_Placement>(sql, new { Id = id });
        }

        // Every placement holding this machine or component, across all spaces. The MCP
        // placement tools use it to decide between create, update-in-place and move.
        public async Task<IEnumerable<Model_Lab_Placement>> GetPlacementsForOccupantAsync(
            int? machineId = null, int? componentId = null)
        {
            var sql = PlacementSelect +
                (machineId.HasValue ? " WHERE p.MachineId = @MachineId " : " WHERE p.ComponentId = @ComponentId ") +
                " ORDER BY p.Id ASC";
            return await _db.QueryAsync<Model_Lab_Placement>(sql,
                new { MachineId = machineId, ComponentId = componentId });
        }

        // Returns null when the placement is valid, otherwise the reason it is not.
        //
        // ⚠️ Validated here rather than in the UI: the MCP surface will write through this
        // same manager, and an assistant placing two things in the same U is exactly the kind
        // of nonsense a table view cannot show you at a glance.
        public async Task<string?> ValidatePlacementAsync(Model_Lab_Placement placement)
        {
            if ((placement.MachineId == null) == (placement.ComponentId == null))
                return "a placement holds exactly one of machineId or componentId";

            var space = await GetSpaceByIdAsync(placement.SpaceId);
            if (space == null) return $"no space with id {placement.SpaceId}";

            // On a carrier (a shelf, drawer, tray): no U of its own, so no overlap - it shares the carrier's.
            if (placement.OnPlacementId is int onId)
            {
                if (onId == placement.Id) return "a placement cannot sit on itself";
                var carrier = await GetPlacementByIdAsync(onId);
                if (carrier == null) return $"no placement with id {onId} to sit on";
                if (carrier.SpaceId != placement.SpaceId) return $"'{carrier.OccupantLabel}' is in {carrier.SpaceName}, not this space";
                if (carrier.OnPlacementId != null) return $"'{carrier.OccupantLabel}' itself sits on something - only one level";
                if (placement.Id != 0 && await _db.ExecuteScalarAsync<int>(
                        "SELECT COUNT(*) FROM Lab_Placements WHERE OnPlacementId = @Id", new { placement.Id }) > 0)
                    return "it holds other things - take them off it first";
                placement.PositionU = null;
                // how tall it stands on the shelf - drawn, never counted against the rack's U
                placement.HeightU = placement.HeightU is int hu && hu >= 1 ? hu : 1;
                placement.Face = carrier.Face;
                return null;
            }

            // Non-rack spaces (a desk, a room) carry no U geometry, so nothing to check.
            if (placement.PositionU == null) return null;

            var height = placement.HeightU ?? 1;
            if (placement.PositionU < 1) return "positionU is 1-based - the bottom U is 1";
            if (height < 1) return "heightU must be at least 1";

            if (space.HeightU.HasValue && placement.PositionU + height - 1 > space.HeightU)
                return $"does not fit: U{placement.PositionU}-U{placement.PositionU + height - 1} " +
                       $"runs past the top of a {space.HeightU}U space";

            // ⚠️ Uses PlacementSelect, not SELECT * - the raw table has no OccupantLabel,
            // so an overlap reported "placement 65" instead of naming what is in the way.
            var clash = (await _db.QueryAsync<Model_Lab_Placement>(PlacementSelect + @"
                 WHERE p.SpaceId = @SpaceId AND p.Id <> @Id AND p.PositionU IS NOT NULL
                   AND (p.Face = @Face OR p.Face = 'both' OR @Face = 'both')",
                new { placement.SpaceId, placement.Id, placement.Face }))
                .FirstOrDefault(other =>
                {
                    var otherTop = other.PositionU!.Value + (other.HeightU ?? 1) - 1;
                    var thisTop = placement.PositionU.Value + height - 1;
                    return placement.PositionU <= otherTop && other.PositionU <= thisTop;
                });

            if (clash != null)
                return $"U{placement.PositionU} is taken on the {placement.Face} face by " +
                       $"'{clash.OccupantLabel ?? "placement " + clash.Id}' " +
                       $"(U{clash.PositionU}-U{clash.PositionU + (clash.HeightU ?? 1) - 1})";

            return null;
        }

        public async Task<int> CreatePlacementAsync(Model_Lab_Placement placement)
        {
            placement.CreatedAt = DateTime.UtcNow;
            placement.UpdatedAt = DateTime.UtcNow;

            const string sql = @"
                INSERT INTO Lab_Placements (SpaceId, MachineId, ComponentId, PositionU, HeightU, OnPlacementId,
                                            Face, Rotation, Status, Notes, CreatedAt, UpdatedAt)
                VALUES (@SpaceId, @MachineId, @ComponentId, @PositionU, @HeightU, @OnPlacementId,
                        @Face, @Rotation, @Status, @Notes, @CreatedAt, @UpdatedAt);
                SELECT last_insert_rowid();";

            var id = await _db.ExecuteScalarAsync<int>(sql, placement);
            await Service_Database_Manager_Lab_Components.SyncStandaloneStatusAsync(_db, placement.ComponentId);
            return id;
        }

        public async Task<bool> UpdatePlacementAsync(Model_Lab_Placement placement)
        {
            var before = await GetPlacementByIdAsync(placement.Id);
            placement.UpdatedAt = DateTime.UtcNow;
            const string sql = @"
                UPDATE Lab_Placements SET
                    SpaceId = @SpaceId, MachineId = @MachineId, ComponentId = @ComponentId,
                    PositionU = @PositionU, HeightU = @HeightU, OnPlacementId = @OnPlacementId, Face = @Face,
                    Rotation = @Rotation, Status = @Status, Notes = @Notes, UpdatedAt = @UpdatedAt
                WHERE Id = @Id";
            var ok = await _db.ExecuteAsync(sql, placement) > 0;
            // what sits on a carrier goes where it goes, and takes its face
            await _db.ExecuteAsync("UPDATE Lab_Placements SET SpaceId = @SpaceId, Face = @Face, UpdatedAt = @UpdatedAt WHERE OnPlacementId = @Id", placement);
            // installed <-> planned, or a different part: both ends' status follows their use
            await Service_Database_Manager_Lab_Components.SyncStandaloneStatusAsync(_db, placement.ComponentId);
            if (before?.ComponentId != placement.ComponentId)
                await Service_Database_Manager_Lab_Components.SyncStandaloneStatusAsync(_db, before?.ComponentId);
            return ok;
        }

        public async Task<bool> DeletePlacementAsync(int id)
        {
            var before = await GetPlacementByIdAsync(id);
            // whatever sat on it stays in the space, off the shelf (no U until placed again)
            await _db.ExecuteAsync("UPDATE Lab_Placements SET OnPlacementId = NULL, UpdatedAt = @Now WHERE OnPlacementId = @Id", new { Id = id, Now = DateTime.UtcNow });
            var ok = await _db.ExecuteAsync("DELETE FROM Lab_Placements WHERE Id = @Id", new { Id = id }) > 0;
            await Service_Database_Manager_Lab_Components.SyncStandaloneStatusAsync(_db, before?.ComponentId);
            return ok;
        }

        // A space sits inside another (a rack in a room, a desk in a room): the parent must exist,
        // not be the space itself, and not be inside it - a loop would have no top. Null = fine, else the reason.
        public async Task<string?> ParentProblemAsync(int spaceId, int? parentId)
        {
            if (!parentId.HasValue) return null;
            if (parentId == spaceId) return "A space cannot be inside itself.";
            var parents = (await _db.QueryAsync<(int Id, int? ParentSpaceId)>("SELECT Id, ParentSpaceId FROM Lab_Spaces"))
                .ToDictionary(r => r.Id, r => r.ParentSpaceId);
            if (!parents.ContainsKey(parentId.Value)) return $"No space with id {parentId}.";
            var seen = new HashSet<int>();
            for (int? at = parentId; at.HasValue; at = parents.GetValueOrDefault(at.Value))
            {
                if (at == spaceId) return "That would put the space inside one of its own children.";
                if (!seen.Add(at.Value)) break;
            }
            return null;
        }

        // Room > rack names from the top, e.g. "Office > Rack 1".
        public async Task<string> PathOfAsync(int spaceId)
        {
            var rows = (await _db.QueryAsync<(int Id, string Name, int? ParentSpaceId)>("SELECT Id, Name, ParentSpaceId FROM Lab_Spaces"))
                .ToDictionary(r => r.Id);
            var names = new List<string>();
            var seen = new HashSet<int>();
            for (int? at = spaceId; at.HasValue && rows.TryGetValue(at.Value, out var r) && seen.Add(at.Value); at = r.ParentSpaceId)
                names.Insert(0, r.Name);
            return string.Join(" > ", names);
        }
    }
}
