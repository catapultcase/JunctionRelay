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

using System.Data;
using Dapper;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    // Lab module (HOMELAB) — the market-value ledger. Append-only, like
    // Lab_ComponentMovements: there is no update and no delete, because the series is the
    // point. A single overwritten "current price" answers "what is it worth today" and
    // destroys "has it held its value", which is the question people actually ask.
    public class Service_Database_Manager_Lab_MarketValues
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_Lab_MarketValues(IDbConnection db)
        {
            _db = db;
        }

        // Full history for one component, newest first.
        public async Task<IEnumerable<Model_Lab_MarketValue>> GetForComponentAsync(int componentId)
        {
            const string sql = @"
                SELECT * FROM Lab_MarketValues
                WHERE ComponentId = @ComponentId
                ORDER BY CapturedAt DESC, Id DESC";
            return await _db.QueryAsync<Model_Lab_MarketValue>(sql, new { ComponentId = componentId });
        }

        // The whole ledger, raw columns only — the cloud sync projection.
        public async Task<IEnumerable<Model_Lab_MarketValue>> GetAllAsync()
        {
            const string sql = @"
                SELECT * FROM Lab_MarketValues
                ORDER BY CapturedAt ASC, Id ASC";
            return await _db.QueryAsync<Model_Lab_MarketValue>(sql);
        }

        // The effective latest observation per component, for the whole inventory in one
        // query - so a list view never becomes N+1. Several observations can land on the
        // same day; the day's EFFECTIVE price is the cheapest of them ("what could it be
        // bought for that day"), so: latest day per component, then minimum value within it.
        public async Task<Dictionary<int, Model_Lab_MarketValue>> GetLatestPerComponentAsync()
        {
            // date(..,'localtime') so a day boundary is the SERVER's local midnight, not
            // UTC's — an evening observation belongs to today, not tomorrow. Requires the
            // container's TZ to be set (Unraid templates do); with TZ unset this degrades
            // to the old UTC behaviour.
            const string sql = @"
                SELECT mv.* FROM Lab_MarketValues mv
                JOIN (
                    SELECT ComponentId, MAX(date(CapturedAt,'localtime')) AS MaxDay
                    FROM Lab_MarketValues GROUP BY ComponentId
                ) latest
                  ON latest.ComponentId = mv.ComponentId AND date(mv.CapturedAt,'localtime') = latest.MaxDay
                ORDER BY mv.Value ASC, mv.Id DESC";

            var rows = await _db.QueryAsync<Model_Lab_MarketValue>(sql);
            var map = new Dictionary<int, Model_Lab_MarketValue>();
            foreach (var r in rows)
                if (!map.ContainsKey(r.ComponentId)) map[r.ComponentId] = r;   // first = cheapest of latest day
            return map;
        }

        // The Observations feed: recent observations across the whole inventory, each with
        // component context, its predecessor, and the series-so-far for a sparkline. Two
        // queries total (recent rows + history for the involved components) - never N+1.
        public async Task<List<Model_Lab_MarketObservationRow>> GetRecentObservationsAsync(int limit = 200)
        {
            const string recentSql = @"
                SELECT mv.Id, mv.ComponentId, mv.Value, mv.Source, mv.SourceUrl,
                       mv.CapturedAt, mv.Notes,
                       COALESCE(NULLIF(c.Name, ''), COALESCE(NULLIF(TRIM(COALESCE(c.Manufacturer, '') || ' ' || COALESCE(c.Model, '')), ''), c.Nickname)) AS ComponentLabel,
                       c.Type AS ComponentType, c.Vendor, c.Msrp, c.PurchasePrice, c.AcquiredAt
                FROM Lab_MarketValues mv
                JOIN Lab_Components c ON c.Id = mv.ComponentId
                ORDER BY mv.CapturedAt DESC, mv.Id DESC
                LIMIT @Limit";

            var rows = (await _db.QueryAsync<Model_Lab_MarketObservationRow>(recentSql, new { Limit = limit })).ToList();
            if (rows.Count == 0) return rows;

            const string historySql = @"
                SELECT Id, ComponentId, Value, CapturedAt FROM Lab_MarketValues
                WHERE ComponentId IN @Ids
                ORDER BY CapturedAt ASC, Id ASC";

            var componentIds = rows.Select(r => r.ComponentId).Distinct().ToArray();
            var history = (await _db.QueryAsync<Model_Lab_MarketValue>(historySql, new { Ids = componentIds }))
                .GroupBy(h => h.ComponentId)
                .ToDictionary(g => g.Key, g => g.ToList());

            // CapturedAt is stored UTC; bucket by the server's LOCAL calendar day (TZ env)
            // so the feed's day groups match what a human in this house calls "today".
            static string Day(DateTime d) =>
                TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(d, DateTimeKind.Utc), TimeZoneInfo.Local)
                    .ToString("yyyy-MM-dd");

            // Several vendors can be observed on the same day; every row is kept in the
            // ledger, but the feed shows ONE row per component per day - the day's
            // EFFECTIVE (cheapest) observation - with the rest nested as Alternates.
            var primaries = new List<Model_Lab_MarketObservationRow>();
            foreach (var g in rows.GroupBy(r => (r.ComponentId, Day: Day(r.CapturedAt))))
            {
                var ordered = g.OrderBy(r => r.Value).ThenByDescending(r => r.Id).ToList();
                var primary = ordered[0];
                primary.Alternates = ordered.Skip(1).Select(a => new Model_Lab_MarketValue
                {
                    Id = a.Id,
                    ComponentId = a.ComponentId,
                    Value = a.Value,
                    Condition = "new",
                    Source = a.Source,
                    SourceUrl = a.SourceUrl,
                    Notes = a.Notes,
                    CapturedAt = a.CapturedAt
                }).ToList();
                primaries.Add(primary);
            }
            var result = primaries
                .OrderByDescending(r => r.CapturedAt).ThenByDescending(r => r.Id)
                .ToList();

            foreach (var row in result)
            {
                if (!history.TryGetValue(row.ComponentId, out var series)) continue;

                // Effective series: cheapest observation per day (ties break to the newer
                // row), oldest day first, up to and including this row's day.
                var perDay = series
                    .GroupBy(h => Day(h.CapturedAt))
                    .Select(g => g.OrderBy(h => h.Value).ThenByDescending(h => h.Id).First())
                    .OrderBy(h => h.CapturedAt).ThenBy(h => h.Id)
                    .ToList();

                var rowDay = Day(row.CapturedAt);
                var upTo = perDay.Where(h => string.CompareOrdinal(Day(h.CapturedAt), rowDay) <= 0).ToList();

                row.Series = upTo.Select(h => h.Value).ToList();
                var prior = upTo.Count >= 2 ? upTo[^2] : null;
                if (prior != null)
                {
                    row.PriorValue = prior.Value;
                    row.PriorCapturedAt = prior.CapturedAt;
                }
            }
            return result;
        }

        public async Task<Model_Lab_MarketValue?> GetLatestForComponentAsync(int componentId)
        {
            const string sql = @"
                SELECT * FROM Lab_MarketValues
                WHERE ComponentId = @ComponentId
                ORDER BY CapturedAt DESC, Id DESC LIMIT 1";
            return await _db.QuerySingleOrDefaultAsync<Model_Lab_MarketValue>(sql, new { ComponentId = componentId });
        }

        // Correction path only - see the controller. Scoped by componentId as well as id so
        // a wrong id cannot delete another component's history.
        public async Task<bool> DeleteAsync(int componentId, int id)
        {
            const string sql = "DELETE FROM Lab_MarketValues WHERE Id = @Id AND ComponentId = @ComponentId";
            return await _db.ExecuteAsync(sql, new { Id = id, ComponentId = componentId }) > 0;
        }

        // The only additive write. CapturedAt is backdatable so a migrated or historical figure keeps
        // the date it was OBSERVED, not the date it was entered.
        public async Task<int> RecordAsync(Model_Lab_MarketValue value)
        {
            const string sql = @"
                INSERT INTO Lab_MarketValues
                    (ComponentId, Value, Condition, Source, SourceUrl, CapturedAt, Notes, CreatedAt)
                VALUES
                    (@ComponentId, @Value, @Condition, @Source, @SourceUrl, @CapturedAt, @Notes, @CreatedAt);
                SELECT last_insert_rowid();";

            if (value.CapturedAt == default) value.CapturedAt = DateTime.UtcNow;
            value.CreatedAt = DateTime.UtcNow;
            return await _db.ExecuteScalarAsync<int>(sql, value);
        }
    }
}
