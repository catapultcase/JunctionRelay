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
    // Models module (MODELS) — fit verdicts: which exact setups a box cannot
    // serve, with the evidence. Separate from the benchmark ledger on purpose.
    public class Service_Database_Manager_Models_FitVerdicts
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_Models_FitVerdicts(IDbConnection db)
        {
            _db = db;
        }

        public async Task<IEnumerable<Model_Models_FitVerdict>> GetAllAsync()
        {
            const string sql = "SELECT * FROM Models_Fit_Verdicts ORDER BY MachineId ASC, ModelId ASC, CapturedAt DESC";
            return await _db.QueryAsync<Model_Models_FitVerdict>(sql);
        }

        public async Task<Model_Models_FitVerdict?> GetByIdAsync(int id)
        {
            const string sql = "SELECT * FROM Models_Fit_Verdicts WHERE Id = @Id";
            return await _db.QuerySingleOrDefaultAsync<Model_Models_FitVerdict>(sql, new { Id = id });
        }

        public async Task<int> CreateAsync(Model_Models_FitVerdict verdict)
        {
            const string sql = @"
                INSERT INTO Models_Fit_Verdicts (
                    ModelId, MachineId, ConfigJson, Reason, Source, CapturedAt, CreatedAt
                ) VALUES (
                    @ModelId, @MachineId, @ConfigJson, @Reason, @Source, @CapturedAt, @CreatedAt
                );
                SELECT last_insert_rowid();";

            verdict.CreatedAt = DateTime.UtcNow;
            if (verdict.CapturedAt == default) verdict.CapturedAt = DateTime.UtcNow;
            return await _db.ExecuteScalarAsync<int>(sql, verdict);
        }

        // Withdraw = hard delete: a verdict proven wrong (the setup loaded
        // after all) must not linger as history — unlike a measurement, a
        // verdict has no honest stale state.
        public async Task<bool> DeleteAsync(int id)
        {
            return await _db.ExecuteAsync("DELETE FROM Models_Fit_Verdicts WHERE Id = @Id", new { Id = id }) > 0;
        }
    }
}
