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
    // Models module (MODELS) — the weights catalog.
    public class Service_Database_Manager_Models_Catalog
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_Models_Catalog(IDbConnection db)
        {
            _db = db;
        }

        public async Task<IEnumerable<Model_Models_CatalogEntry>> GetAllAsync(bool includeRetired = true)
        {
            var sql = includeRetired
                ? "SELECT * FROM Models_Catalog ORDER BY Status ASC, Name COLLATE NOCASE ASC"
                : "SELECT * FROM Models_Catalog WHERE Status = 'active' ORDER BY Name COLLATE NOCASE ASC";
            return await _db.QueryAsync<Model_Models_CatalogEntry>(sql);
        }

        public async Task<Model_Models_CatalogEntry?> GetByIdAsync(int id)
        {
            const string sql = "SELECT * FROM Models_Catalog WHERE Id = @Id";
            return await _db.QuerySingleOrDefaultAsync<Model_Models_CatalogEntry>(sql, new { Id = id });
        }

        public async Task<int> CreateAsync(Model_Models_CatalogEntry entry)
        {
            const string sql = @"
                INSERT INTO Models_Catalog (
                    Name, Family, ParamsB, Architecture, ActiveParamsB, ReleaseDate, Quant, QuantsJson, ContextLength, KvCachePrecision, SizeGb,
                    TraitsJson, StorageLocation, Category, Status, SupersededById, Notes, CreatedAt, UpdatedAt
                ) VALUES (
                    @Name, @Family, @ParamsB, @Architecture, @ActiveParamsB, @ReleaseDate, @Quant, @QuantsJson, @ContextLength, @KvCachePrecision, @SizeGb,
                    @TraitsJson, @StorageLocation, @Category, @Status, @SupersededById, @Notes, @CreatedAt, @UpdatedAt
                );
                SELECT last_insert_rowid();";

            entry.CreatedAt = DateTime.UtcNow;
            entry.UpdatedAt = DateTime.UtcNow;
            if (string.IsNullOrWhiteSpace(entry.Status)) entry.Status = "active";

            return await _db.ExecuteScalarAsync<int>(sql, entry);
        }

        public async Task<bool> UpdateAsync(Model_Models_CatalogEntry entry)
        {
            const string sql = @"
                UPDATE Models_Catalog SET
                    Name = @Name, Family = @Family, ParamsB = @ParamsB, Architecture = @Architecture,
                    ActiveParamsB = @ActiveParamsB, ReleaseDate = @ReleaseDate, Quant = @Quant, QuantsJson = @QuantsJson,
                    ContextLength = @ContextLength, KvCachePrecision = @KvCachePrecision,
                    SizeGb = @SizeGb, TraitsJson = @TraitsJson, StorageLocation = @StorageLocation,
                    Category = @Category, Status = @Status, SupersededById = @SupersededById, Notes = @Notes,
                    UpdatedAt = @UpdatedAt
                WHERE Id = @Id";

            entry.UpdatedAt = DateTime.UtcNow;
            return await _db.ExecuteAsync(sql, entry) > 0;
        }

        // Delete is for typo rows only. A model that stopped mattering is 'archived'
        // or 'superseded' - the chain of what replaced what is the catalog's point.
        public async Task<bool> DeleteAsync(int id)
        {
            // Refuse while anything points here, or the supersession chain and the
            // serving/benchmark history would dangle.
            const string refsSql = @"
                SELECT (SELECT COUNT(*) FROM Models_Catalog   WHERE SupersededById = @Id)
                     + (SELECT COUNT(*) FROM Models_Serving   WHERE ModelId = @Id)
                     + (SELECT COUNT(*) FROM Models_Benchmarks WHERE ModelId = @Id)";
            var refs = await _db.ExecuteScalarAsync<int>(refsSql, new { Id = id });
            if (refs > 0) return false;

            return await _db.ExecuteAsync("DELETE FROM Models_Catalog WHERE Id = @Id", new { Id = id }) > 0;
        }
    }
}
