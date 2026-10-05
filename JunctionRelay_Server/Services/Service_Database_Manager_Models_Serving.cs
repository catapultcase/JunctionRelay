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
    // Models module (MODELS) — serving assignments: which box holds which model.
    public class Service_Database_Manager_Models_Serving
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_Models_Serving(IDbConnection db)
        {
            _db = db;
        }

        public async Task<IEnumerable<Model_Models_ServingAssignment>> GetAllAsync(bool activeOnly = false)
        {
            var sql = activeOnly
                ? "SELECT * FROM Models_Serving WHERE Status = 'active' ORDER BY MachineId ASC, Alias COLLATE NOCASE ASC"
                : "SELECT * FROM Models_Serving ORDER BY Status ASC, MachineId ASC, Alias COLLATE NOCASE ASC";
            return await _db.QueryAsync<Model_Models_ServingAssignment>(sql);
        }

        public async Task<Model_Models_ServingAssignment?> GetByIdAsync(int id)
        {
            const string sql = "SELECT * FROM Models_Serving WHERE Id = @Id";
            return await _db.QuerySingleOrDefaultAsync<Model_Models_ServingAssignment>(sql, new { Id = id });
        }

        public async Task<int> CreateAsync(Model_Models_ServingAssignment assignment)
        {
            const string sql = @"
                INSERT INTO Models_Serving (
                    ModelId, MachineId, Alias, EndpointPort, Mode, IsDefault, Status,
                    Quant, ContextTokens, Slots, KvPrecision, Mtp, Vision, WeightsGb,
                    Engine, SharedKv, PoolTokens, Thinking, OnCard, CardLabel, CardOrder, SharesWith,
                    Notes, CreatedAt, UpdatedAt
                ) VALUES (
                    @ModelId, @MachineId, @Alias, @EndpointPort, @Mode, @IsDefault, @Status,
                    @Quant, @ContextTokens, @Slots, @KvPrecision, @Mtp, @Vision, @WeightsGb,
                    @Engine, @SharedKv, @PoolTokens, @Thinking, @OnCard, @CardLabel, @CardOrder, @SharesWith,
                    @Notes, @CreatedAt, @UpdatedAt
                );
                SELECT last_insert_rowid();";

            assignment.CreatedAt = DateTime.UtcNow;
            assignment.UpdatedAt = DateTime.UtcNow;
            if (string.IsNullOrWhiteSpace(assignment.Mode)) assignment.Mode = "on-demand";
            if (string.IsNullOrWhiteSpace(assignment.Status)) assignment.Status = "active";

            return await _db.ExecuteScalarAsync<int>(sql, assignment);
        }

        public async Task<bool> UpdateAsync(Model_Models_ServingAssignment assignment)
        {
            const string sql = @"
                UPDATE Models_Serving SET
                    ModelId = @ModelId, MachineId = @MachineId, Alias = @Alias,
                    EndpointPort = @EndpointPort, Mode = @Mode, IsDefault = @IsDefault,
                    Status = @Status, Quant = @Quant, ContextTokens = @ContextTokens,
                    Slots = @Slots, KvPrecision = @KvPrecision, Mtp = @Mtp,
                    Vision = @Vision, WeightsGb = @WeightsGb,
                    Engine = @Engine, SharedKv = @SharedKv, PoolTokens = @PoolTokens, Thinking = @Thinking,
                    OnCard = @OnCard, CardLabel = @CardLabel, CardOrder = @CardOrder, SharesWith = @SharesWith,
                    Notes = @Notes, UpdatedAt = @UpdatedAt
                WHERE Id = @Id";

            assignment.UpdatedAt = DateTime.UtcNow;
            return await _db.ExecuteAsync(sql, assignment) > 0;
        }

        // A preset (SharesWith) is another row's process asked for differently, so it must point at a
        // row on the same machine that is not itself a preset. Null = fine; otherwise the reason.
        public async Task<string?> PresetProblemAsync(Model_Models_ServingAssignment a)
        {
            if (!a.SharesWith.HasValue) return null;
            if (a.SharesWith.Value == a.Id) return "A serving row cannot share its own process.";
            var target = await GetByIdAsync(a.SharesWith.Value);
            if (target == null) return $"sharesWith: no serving assignment with id {a.SharesWith}.";
            if (target.SharesWith.HasValue) return $"sharesWith: #{target.Id} is itself a preset of #{target.SharesWith}; point at #{target.SharesWith}.";
            if (target.MachineId != a.MachineId) return $"sharesWith: #{target.Id} is on another machine - a preset shares a process on its own machine.";
            return null;
        }

        public async Task<bool> DeleteAsync(int id)
        {
            return await _db.ExecuteAsync("DELETE FROM Models_Serving WHERE Id = @Id", new { Id = id }) > 0;
        }
    }
}
