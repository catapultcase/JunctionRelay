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
    // Models module (MODELS) — the measurement ledger. Append-only, the
    // Lab_MarketValues discipline: no update, no delete-as-correction workflow —
    // the series is the point. (A hard delete exists for rows that were wrong at
    // the moment of entry, mirroring lab_delete_market_value.)
    public class Service_Database_Manager_Models_Benchmarks
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_Models_Benchmarks(IDbConnection db)
        {
            _db = db;
        }

        // Full history for one catalog entry, newest first. Matches on the LINK
        // or on the name, so a run submitted before the model was catalogued
        // still shows up once the entry exists.
        public async Task<IEnumerable<Model_Models_Benchmark>> GetForModelAsync(int modelId)
        {
            const string sql = @"
                SELECT b.* FROM Models_Benchmarks b
                LEFT JOIN Models_Catalog c ON c.Id = @ModelId
                WHERE b.ModelId = @ModelId
                   OR (b.ModelId IS NULL AND c.Name IS NOT NULL
                       AND b.ModelName = c.Name COLLATE NOCASE)
                ORDER BY b.CapturedAt DESC, b.Id DESC";
            return await _db.QueryAsync<Model_Models_Benchmark>(sql, new { ModelId = modelId });
        }

        // Every distinct model NAME the ledger holds that has no catalog link,
        // with how many rows each has — what the ⚠️ in the UI counts, and what
        // models_link_benchmarks offers to attach.
        public async Task<IEnumerable<(string ModelName, int Rows)>> GetUnlinkedNamesAsync()
        {
            const string sql = @"
                SELECT ModelName, COUNT(*) AS Rows
                FROM Models_Benchmarks
                WHERE ModelId IS NULL
                GROUP BY ModelName COLLATE NOCASE
                ORDER BY Rows DESC, ModelName";
            var rows = await _db.QueryAsync<(string ModelName, int Rows)>(sql);
            return rows;
        }

        // Attach every unlinked row with this name to a catalog entry. Only ever
        // fills a NULL link - it never re-points a row that is already attached,
        // so it cannot silently move history between models.
        public async Task<int> LinkByNameAsync(string modelName, int modelId)
        {
            const string sql = @"
                UPDATE Models_Benchmarks SET ModelId = @ModelId
                WHERE ModelId IS NULL AND ModelName = @ModelName COLLATE NOCASE";
            return await _db.ExecuteAsync(sql, new { ModelId = modelId, ModelName = modelName });
        }

        // EVERY row, newest first. Used by the cloud push: reading per catalog
        // entry would silently drop rows that name a model the catalog does not
        // have, and those are legitimate (the link is optional).
        public async Task<IEnumerable<Model_Models_Benchmark>> GetAllAsync()
        {
            const string sql = @"
                SELECT * FROM Models_Benchmarks
                ORDER BY CapturedAt DESC, Id DESC";
            return await _db.QueryAsync<Model_Models_Benchmark>(sql);
        }

        // Recent measurements across every model, newest first — the Benchmarks tab feed.
        public async Task<IEnumerable<Model_Models_Benchmark>> GetRecentAsync(int limit = 200)
        {
            const string sql = @"
                SELECT * FROM Models_Benchmarks
                ORDER BY CapturedAt DESC, Id DESC
                LIMIT @Limit";
            return await _db.QueryAsync<Model_Models_Benchmark>(sql, new { Limit = limit });
        }

        public async Task<int> RecordAsync(Model_Models_Benchmark benchmark)
        {
            const string sql = @"
                INSERT INTO Models_Benchmarks (
                    ModelName, ModelId, MachineId, Metric, Value,
                    Quant, ContextTokens, Slots, KvPrecision, Mtp, Vision, Engine, WeightsGb,
                    CapturedAt, Source, Notes, ConfigJson, Scenario, Hardware, Thinking, CreatedAt
                ) VALUES (
                    @ModelName, @ModelId, @MachineId, @Metric, @Value,
                    @Quant, @ContextTokens, @Slots, @KvPrecision, @Mtp, @Vision, @Engine, @WeightsGb,
                    @CapturedAt, @Source, @Notes, @ConfigJson, @Scenario, @Hardware, @Thinking, @CreatedAt
                );
                SELECT last_insert_rowid();";

            benchmark.CreatedAt = DateTime.UtcNow;
            if (benchmark.CapturedAt == default) benchmark.CapturedAt = DateTime.UtcNow;

            // Auto-link on the way in when the name matches something on the
            // shelf. Not required: an unmatched name is a legitimate row (a model
            // the user has not catalogued), it just carries the ⚠️ until
            // models_link_benchmarks attaches it.
            if (benchmark.ModelId == null && !string.IsNullOrWhiteSpace(benchmark.ModelName))
            {
                benchmark.ModelId = await _db.ExecuteScalarAsync<int?>(
                    "SELECT Id FROM Models_Catalog WHERE Name = @Name COLLATE NOCASE LIMIT 1",
                    new { Name = benchmark.ModelName.Trim() });
            }

            return await _db.ExecuteScalarAsync<int>(sql, benchmark);
        }

        // For rows that were WRONG at entry (typo, wrong model) — never for numbers
        // that merely went stale. Mirrors lab_delete_market_value.
        public async Task<bool> DeleteAsync(int id)
        {
            return await _db.ExecuteAsync("DELETE FROM Models_Benchmarks WHERE Id = @Id", new { Id = id }) > 0;
        }

        // Bulk delete for INVALIDATED runs — a whole measurement era shown to be
        // wrong (contaminated by parallel benching, a capture bug poisoning
        // ConfigJson). Added when the first day's data fell to both at
        // once and rows had to die one REST call at a time. At least one filter is
        // required — the caller states what made the era invalid; there is no
        // delete-everything. Returns the number of rows removed.
        public async Task<int> DeleteRangeAsync(int? modelId, int? machineId, DateTime? capturedBefore,
                                                string? metric = null, string? modelName = null, string? quant = null)
        {
            if (modelId == null && machineId == null && capturedBefore == null
                && metric == null && modelName == null && quant == null)
                return 0;

            var where = new List<string>();
            if (modelId != null) where.Add("ModelId = @ModelId");
            if (machineId != null) where.Add("MachineId = @MachineId");
            if (capturedBefore != null) where.Add("CapturedAt < @CapturedBefore");
            if (metric != null) where.Add("Metric = @Metric");
            // Setup filters. A row records the setup that produced it (contract v2),
            // so a capture bug is correctable at the granularity it occurred - without
            // this, fixing one wrong quant string meant deleting every row for the
            // model on that box, valid measurements included.
            if (modelName != null) where.Add("ModelName = @ModelName");
            if (quant != null) where.Add("Quant = @Quant");

            var sql = "DELETE FROM Models_Benchmarks WHERE " + string.Join(" AND ", where);
            return await _db.ExecuteAsync(sql, new { ModelId = modelId, MachineId = machineId,
                CapturedBefore = capturedBefore, Metric = metric, ModelName = modelName, Quant = quant });
        }
    }
}
