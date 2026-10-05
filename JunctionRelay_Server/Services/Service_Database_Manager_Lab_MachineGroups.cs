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
    public class Service_Database_Manager_Lab_MachineGroups
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_Lab_MachineGroups(IDbConnection db)
        {
            _db = db;
        }

        public async Task<IEnumerable<Model_Lab_MachineGroup>> GetAllGroupsAsync()
        {
            const string sql = "SELECT * FROM Lab_MachineGroups ORDER BY SortOrder ASC, Id ASC";
            return await _db.QueryAsync<Model_Lab_MachineGroup>(sql);
        }

        public async Task<Model_Lab_MachineGroup?> GetGroupByIdAsync(int id)
        {
            const string sql = "SELECT * FROM Lab_MachineGroups WHERE Id = @Id";
            return await _db.QuerySingleOrDefaultAsync<Model_Lab_MachineGroup>(sql, new { Id = id });
        }

        public async Task<int> CreateGroupAsync(Model_Lab_MachineGroup group)
        {
            var maxSortOrder = await _db.ExecuteScalarAsync<int?>("SELECT MAX(SortOrder) FROM Lab_MachineGroups") ?? -1;
            group.SortOrder = maxSortOrder + 1;
            group.CreatedAt = DateTime.UtcNow;
            group.UpdatedAt = DateTime.UtcNow;

            const string sql = @"
                INSERT INTO Lab_MachineGroups (Name, Field, RolesJson, SortOrder, CreatedAt, UpdatedAt)
                VALUES (@Name, @Field, @RolesJson, @SortOrder, @CreatedAt, @UpdatedAt);
                SELECT last_insert_rowid();";

            return await _db.ExecuteScalarAsync<int>(sql, group);
        }

        public async Task<bool> UpdateGroupAsync(Model_Lab_MachineGroup group)
        {
            const string sql = @"
                UPDATE Lab_MachineGroups SET
                    Name = @Name,
                    Field = @Field,
                    RolesJson = @RolesJson,
                    UpdatedAt = @UpdatedAt
                WHERE Id = @Id";

            group.UpdatedAt = DateTime.UtcNow;
            var rows = await _db.ExecuteAsync(sql, group);
            return rows > 0;
        }

        public async Task<bool> DeleteGroupAsync(int id)
        {
            var rows = await _db.ExecuteAsync("DELETE FROM Lab_MachineGroups WHERE Id = @Id", new { Id = id });
            return rows > 0;
        }

        // Persist a full display order: ids in the desired order get SortOrder 0..n-1.
        public async Task ReorderGroupsAsync(List<int> orderedIds)
        {
            if (_db.State != ConnectionState.Open) _db.Open();
            using var tx = _db.BeginTransaction();
            try
            {
                for (var i = 0; i < orderedIds.Count; i++)
                {
                    await _db.ExecuteAsync(
                        "UPDATE Lab_MachineGroups SET SortOrder = @SortOrder, UpdatedAt = @Now WHERE Id = @Id",
                        new { SortOrder = i, Now = DateTime.UtcNow, Id = orderedIds[i] }, tx);
                }
                tx.Commit();
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }
    }
}
