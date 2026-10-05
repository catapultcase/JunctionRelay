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
    // Lab module (HOMELAB) — the component vocabulary.
    //
    // ComponentCount is JOINed on Lab_Components.Type as a STRING match, not a foreign key.
    // That is the whole design: types describe components, they do not own them.
    public class Service_Database_Manager_Lab_ComponentTypes
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_Lab_ComponentTypes(IDbConnection db)
        {
            _db = db;
        }

        private const string Select = @"
            SELECT t.*,
                   (SELECT COUNT(*) FROM Lab_Components c WHERE c.Type = t.Name) AS ComponentCount
              FROM Lab_ComponentTypes t ";

        public async Task<IEnumerable<Model_Lab_ComponentType>> GetAllAsync(bool includeRetired = true)
        {
            var sql = Select + (includeRetired ? "" : " WHERE t.Status = 'active' ")
                    + " ORDER BY t.SortOrder ASC, t.Id ASC";
            return await _db.QueryAsync<Model_Lab_ComponentType>(sql);
        }

        public async Task<Model_Lab_ComponentType?> GetByIdAsync(int id)
        {
            return await _db.QuerySingleOrDefaultAsync<Model_Lab_ComponentType>(
                Select + " WHERE t.Id = @Id", new { Id = id });
        }

        public async Task<Model_Lab_ComponentType?> GetByNameAsync(string name)
        {
            return await _db.QuerySingleOrDefaultAsync<Model_Lab_ComponentType>(
                Select + " WHERE t.Name = @Name COLLATE NOCASE", new { Name = name });
        }

        public async Task<int> CreateAsync(Model_Lab_ComponentType type)
        {
            var maxOrder = await _db.ExecuteScalarAsync<int?>(
                "SELECT MAX(SortOrder) FROM Lab_ComponentTypes") ?? -1;
            type.SortOrder = maxOrder + 1;
            type.CreatedAt = DateTime.UtcNow;
            type.UpdatedAt = DateTime.UtcNow;

            const string sql = @"
                INSERT INTO Lab_ComponentTypes (Name, Label, SortOrder, Status, Icon, Notes, FieldsJson, CreatedAt, UpdatedAt)
                VALUES (@Name, @Label, @SortOrder, @Status, @Icon, @Notes, @FieldsJson, @CreatedAt, @UpdatedAt);
                SELECT last_insert_rowid();";
            return await _db.ExecuteScalarAsync<int>(sql, type);
        }

        // ⚠️ Renaming a type does NOT rewrite the components filed under the old name - they
        // would silently change category. The caller decides; RenameAndRepointAsync is the
        // explicit version.
        public async Task<bool> UpdateAsync(Model_Lab_ComponentType type)
        {
            type.UpdatedAt = DateTime.UtcNow;
            const string sql = @"
                UPDATE Lab_ComponentTypes SET
                    Name = @Name, Label = @Label, Status = @Status, Icon = @Icon,
                    Notes = @Notes, FieldsJson = @FieldsJson, UpdatedAt = @UpdatedAt
                WHERE Id = @Id";
            return await _db.ExecuteAsync(sql, type) > 0;
        }

        // Renames the type and repoints every component filed under the old name, in one
        // transaction. Without the repoint a rename orphans its own components.
        public async Task<int> RenameAndRepointAsync(int id, string newName)
        {
            var existing = await GetByIdAsync(id);
            if (existing == null) return 0;

            if (_db.State != ConnectionState.Open) _db.Open();
            using var tx = _db.BeginTransaction();

            var moved = await _db.ExecuteAsync(
                "UPDATE Lab_Components SET Type = @New WHERE Type = @Old",
                new { New = newName, Old = existing.Name }, tx);

            await _db.ExecuteAsync(
                "UPDATE Lab_ComponentTypes SET Name = @New, UpdatedAt = @Now WHERE Id = @Id",
                new { New = newName, Now = DateTime.UtcNow, Id = id }, tx);

            tx.Commit();
            return moved;
        }

        public async Task<bool> ReorderAsync(IEnumerable<int> idsInOrder)
        {
            if (_db.State != ConnectionState.Open) _db.Open();
            using var tx = _db.BeginTransaction();
            var i = 0;
            foreach (var id in idsInOrder)
            {
                await _db.ExecuteAsync(
                    "UPDATE Lab_ComponentTypes SET SortOrder = @Order, UpdatedAt = @Now WHERE Id = @Id",
                    new { Order = i++, Now = DateTime.UtcNow, Id = id }, tx);
            }
            tx.Commit();
            return true;
        }

        // Refuses while components are still filed under it. "Flag, never silently drop" is
        // the module rule, and retiring is the intended path: a retired type stops appearing
        // in pickers while its existing components keep rendering exactly as before.
        public async Task<string> DeleteAsync(int id)
        {
            var type = await GetByIdAsync(id);
            if (type == null) return "not found";

            if (type.ComponentCount > 0)
                return $"blocked: {type.ComponentCount} component(s) are filed as '{type.Name}' - " +
                       $"retire the type instead, or move those components first";

            await _db.ExecuteAsync("DELETE FROM Lab_ComponentTypes WHERE Id = @Id", new { Id = id });
            return "deleted";
        }
    }
}
