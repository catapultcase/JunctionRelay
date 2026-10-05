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
    // Models module (MODELS) — reference scores: published eval figures per
    // model, cited. Not measurements; never in the benchmark ledger.
    public class Service_Database_Manager_Models_ReferenceScores
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_Models_ReferenceScores(IDbConnection db)
        {
            _db = db;
        }

        public async Task<IEnumerable<Model_Models_ReferenceScore>> GetAllAsync()
        {
            const string sql = "SELECT * FROM Models_Reference_Scores ORDER BY ModelId ASC, Benchmark ASC, CapturedAt DESC";
            return await _db.QueryAsync<Model_Models_ReferenceScore>(sql);
        }

        public async Task<Model_Models_ReferenceScore?> GetByIdAsync(int id)
        {
            const string sql = "SELECT * FROM Models_Reference_Scores WHERE Id = @Id";
            return await _db.QuerySingleOrDefaultAsync<Model_Models_ReferenceScore>(sql, new { Id = id });
        }

        public async Task<int> CreateAsync(Model_Models_ReferenceScore score)
        {
            const string sql = @"
                INSERT INTO Models_Reference_Scores (
                    ModelId, Benchmark, Score, Source,
                    Provenance, EvaluatedPrecision, Scaffold, EvaluatedContextTokens,
                    Notes, CapturedAt, CreatedAt
                ) VALUES (
                    @ModelId, @Benchmark, @Score, @Source,
                    @Provenance, @EvaluatedPrecision, @Scaffold, @EvaluatedContextTokens,
                    @Notes, @CapturedAt, @CreatedAt
                );
                SELECT last_insert_rowid();";

            score.CreatedAt = DateTime.UtcNow;
            if (score.CapturedAt == default) score.CapturedAt = DateTime.UtcNow;
            return await _db.ExecuteScalarAsync<int>(sql, score);
        }

        public async Task<bool> DeleteAsync(int id)
        {
            return await _db.ExecuteAsync("DELETE FROM Models_Reference_Scores WHERE Id = @Id", new { Id = id }) > 0;
        }
    }
}
