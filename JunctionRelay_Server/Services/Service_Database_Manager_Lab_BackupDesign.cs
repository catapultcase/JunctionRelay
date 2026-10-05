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
    // Homelab module (LAB) — the backups page's elements (locations, jobs, rules).
    public class Service_Database_Manager_Lab_BackupDesign
    {
        private readonly IDbConnection _db;
        public Service_Database_Manager_Lab_BackupDesign(IDbConnection db) { _db = db; }

        public async Task<IEnumerable<Model_Lab_BackupDesign>> GetAllAsync() =>
            await _db.QueryAsync<Model_Lab_BackupDesign>(
                "SELECT * FROM Lab_Backup_Design ORDER BY Kind ASC, Row ASC, Position ASC, Id ASC");

        public async Task<Model_Lab_BackupDesign?> GetByIdAsync(int id) =>
            await _db.QuerySingleOrDefaultAsync<Model_Lab_BackupDesign>(
                "SELECT * FROM Lab_Backup_Design WHERE Id = @Id", new { Id = id });

        public async Task<int> CreateAsync(Model_Lab_BackupDesign e)
        {
            e.CreatedAt = e.UpdatedAt = DateTime.UtcNow;
            return await _db.ExecuteScalarAsync<int>(@"
                INSERT INTO Lab_Backup_Design (Kind, Name, Body, MachineId, Path, Tier, Snapshots, SourceId, TargetId,
                    Schedule, Mode, Row, Position, Accent, CreatedAt, UpdatedAt)
                VALUES (@Kind, @Name, @Body, @MachineId, @Path, @Tier, @Snapshots, @SourceId, @TargetId,
                    @Schedule, @Mode, @Row, @Position, @Accent, @CreatedAt, @UpdatedAt);
                SELECT last_insert_rowid();", e);
        }

        public async Task<bool> UpdateAsync(Model_Lab_BackupDesign e)
        {
            e.UpdatedAt = DateTime.UtcNow;
            return await _db.ExecuteAsync(@"
                UPDATE Lab_Backup_Design SET Kind = @Kind, Name = @Name, Body = @Body, MachineId = @MachineId,
                    Path = @Path, Tier = @Tier, Snapshots = @Snapshots, SourceId = @SourceId, TargetId = @TargetId,
                    Schedule = @Schedule, Mode = @Mode, Row = @Row, Position = @Position, Accent = @Accent,
                    UpdatedAt = @UpdatedAt
                WHERE Id = @Id", e) > 0;
        }

        // ONE copy of the rules, used by the API and the MCP tools: a location sits on a machine that is in
        // the Lab, a job joins two different locations, a rule has text.
        public async Task<string?> InvalidAsync(Model_Lab_BackupDesign e, IEnumerable<int> machineIds)
        {
            if (e.Kind is not ("location" or "job" or "copy" or "rule")) return "Kind must be location, job, copy or rule.";
            if (e.Kind == "rule") return string.IsNullOrWhiteSpace(e.Body) ? "A rule needs a body." : null;
            if (string.IsNullOrWhiteSpace(e.Name)) return $"A {e.Kind} needs a name.";
            // A cloud location (Backblaze B2) is a service, not a box in the Lab: no machine.
            if (e.Kind == "location" && string.Equals(e.Tier, "cloud", StringComparison.OrdinalIgnoreCase))
                return e.MachineId is null || machineIds.Contains(e.MachineId.Value) ? null : "That Lab machine does not exist.";
            if (e.Kind == "location")
                return e.MachineId is int m && machineIds.Contains(m) ? null : "A location needs a Lab machine (or tier 'cloud' for a cloud service).";
            if (e.Kind == "copy")
            {
                if (e.Tier is not ("live" or "copy")) return "A copy's tier is live or copy.";
                return e.SourceId is int box && (await GetByIdAsync(box))?.Kind == "location" ? null : "A copy needs the box (location) holding it.";
            }
            if (e.SourceId is not int src || e.TargetId is not int dst) return "A job needs a source and a target location.";
            if (src == dst) return "A job's source and target must differ.";
            foreach (var lid in new[] { src, dst })
                if ((await GetByIdAsync(lid))?.Kind != "location") return $"#{lid} is not a location.";
            return null;
        }

        // A location's jobs go with it: a job pointing at nothing would draw an arrow from nowhere.
        public async Task<bool> DeleteAsync(int id)
        {
            using var tx = _db.BeginTransaction();
            try
            {
                await _db.ExecuteAsync("DELETE FROM Lab_Backup_Design WHERE Kind IN ('job', 'copy') AND (SourceId = @Id OR TargetId = @Id)", new { Id = id }, tx);
                var deleted = await _db.ExecuteAsync("DELETE FROM Lab_Backup_Design WHERE Id = @Id", new { Id = id }, tx) > 0;
                tx.Commit();
                return deleted;
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }
    }
}
