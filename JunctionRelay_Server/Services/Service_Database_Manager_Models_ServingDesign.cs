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
    // Models module (MODELS) — the serving page's design elements (boxes, clients, rules).
    public class Service_Database_Manager_Models_ServingDesign
    {
        private readonly IDbConnection _db;
        public Service_Database_Manager_Models_ServingDesign(IDbConnection db) { _db = db; }

        public async Task<IEnumerable<Model_Models_ServingDesign>> GetAllAsync() =>
            await _db.QueryAsync<Model_Models_ServingDesign>(
                "SELECT * FROM Models_Serving_Design ORDER BY Kind ASC, Row ASC, Position ASC, Id ASC");

        public async Task<Model_Models_ServingDesign?> GetByIdAsync(int id) =>
            await _db.QuerySingleOrDefaultAsync<Model_Models_ServingDesign>(
                "SELECT * FROM Models_Serving_Design WHERE Id = @Id", new { Id = id });

        public async Task<int> CreateAsync(Model_Models_ServingDesign e)
        {
            e.CreatedAt = e.UpdatedAt = DateTime.UtcNow;
            return await _db.ExecuteScalarAsync<int>(@"
                INSERT INTO Models_Serving_Design (Kind, Name, Title, Role, Body, Machines, SlotOwners, AsksBox,
                    DelegatesTo, FallbackBox, Row, Position, Accent, Hw, CreatedAt, UpdatedAt)
                VALUES (@Kind, @Name, @Title, @Role, @Body, @Machines, @SlotOwners, @AsksBox,
                    @DelegatesTo, @FallbackBox, @Row, @Position, @Accent, @Hw, @CreatedAt, @UpdatedAt);
                SELECT last_insert_rowid();", e);
        }

        public async Task<bool> UpdateAsync(Model_Models_ServingDesign e)
        {
            e.UpdatedAt = DateTime.UtcNow;
            return await _db.ExecuteAsync(@"
                UPDATE Models_Serving_Design SET Kind = @Kind, Name = @Name, Title = @Title, Role = @Role,
                    Body = @Body, Machines = @Machines, SlotOwners = @SlotOwners, AsksBox = @AsksBox,
                    DelegatesTo = @DelegatesTo, FallbackBox = @FallbackBox, Row = @Row, Position = @Position,
                    Accent = @Accent, Hw = @Hw, UpdatedAt = @UpdatedAt
                WHERE Id = @Id", e) > 0;
        }

        public async Task<bool> DeleteAsync(int id) =>
            await _db.ExecuteAsync("DELETE FROM Models_Serving_Design WHERE Id = @Id", new { Id = id }) > 0;
    }
}
