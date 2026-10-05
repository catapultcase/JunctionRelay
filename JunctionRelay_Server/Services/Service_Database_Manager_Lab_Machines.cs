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
    public class Service_Database_Manager_Lab_Machines
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_Lab_Machines(IDbConnection db)
        {
            _db = db;
        }

        // ============================================================
        // Machines CRUD
        // ============================================================

        public async Task<IEnumerable<Model_Lab_Machine>> GetAllMachinesAsync()
        {
            const string sql = @"
                SELECT * FROM Lab_Machines
                ORDER BY Name COLLATE NOCASE ASC";

            var machines = (await _db.QueryAsync<Model_Lab_Machine>(sql)).ToList();

            // One query for every installed component, grouped in memory —
            // the card view renders major components (CPU/GPU/RAM) as chips.
            // Retired parts (sold, dead, lost...) are removed from their machine when they
            // are retired, but the filter stays as a guard for rows retired before that was
            // true - a sold card must never pad a machine's component count.
            const string componentsSql = @"
                SELECT * FROM Lab_Components
                WHERE CurrentMachineId IS NOT NULL AND Status NOT IN @RetiredStatuses
                ORDER BY Type ASC, Model COLLATE NOCASE ASC";

            var installed = (await _db.QueryAsync<Model_Lab_Component>(componentsSql,
                    new { Service_Database_Manager_Lab_Components.RetiredStatuses }))
                .GroupBy(c => c.CurrentMachineId!.Value)
                .ToDictionary(g => g.Key, g => g.ToList());

            foreach (var machine in machines)
            {
                machine.InstalledComponents = installed.TryGetValue(machine.Id, out var list) ? list : new List<Model_Lab_Component>();
                machine.ComponentCount = machine.InstalledComponents.Count;
            }

            return machines;
        }

        public async Task<Model_Lab_Machine?> GetMachineByIdAsync(int id)
        {
            const string sql = "SELECT * FROM Lab_Machines WHERE Id = @Id";
            var machine = await _db.QuerySingleOrDefaultAsync<Model_Lab_Machine>(sql, new { Id = id });

            if (machine != null)
            {
                const string componentsSql = @"
                    SELECT * FROM Lab_Components
                    WHERE CurrentMachineId = @Id AND Status NOT IN @RetiredStatuses
                    ORDER BY Type ASC, Model COLLATE NOCASE ASC";
                machine.InstalledComponents = (await _db.QueryAsync<Model_Lab_Component>(componentsSql,
                    new { Id = id, Service_Database_Manager_Lab_Components.RetiredStatuses })).ToList();
                machine.ComponentCount = machine.InstalledComponents.Count;
            }

            return machine;
        }

        public async Task<int> CreateMachineAsync(Model_Lab_Machine machine)
        {
            const string sql = @"
                INSERT INTO Lab_Machines (
                    Name, Hostname, Kind, Role, Status, OS, IPAddress, Location,
                    AlwaysOn, LinkedDeviceId, Notes, Sentiment, CreatedAt, UpdatedAt
                ) VALUES (
                    @Name, @Hostname, @Kind, @Role, @Status, @OS, @IPAddress, @Location,
                    @AlwaysOn, @LinkedDeviceId, @Notes, @Sentiment, @CreatedAt, @UpdatedAt
                );
                SELECT last_insert_rowid();";

            machine.CreatedAt = DateTime.UtcNow;
            machine.UpdatedAt = DateTime.UtcNow;
            if (string.IsNullOrWhiteSpace(machine.Status)) machine.Status = "active";

            return await _db.ExecuteScalarAsync<int>(sql, machine);
        }

        public async Task<bool> UpdateMachineAsync(Model_Lab_Machine machine)
        {
            const string sql = @"
                UPDATE Lab_Machines SET
                    Name = @Name,
                    Hostname = @Hostname,
                    Kind = @Kind,
                    Role = @Role,
                    Status = @Status,
                    OS = @OS,
                    IPAddress = @IPAddress,
                    Location = @Location,
                    AlwaysOn = @AlwaysOn,
                    LinkedDeviceId = @LinkedDeviceId,
                    Notes = @Notes,
                    Sentiment = @Sentiment,
                    UpdatedAt = @UpdatedAt
                WHERE Id = @Id";

            var oldName = await _db.ExecuteScalarAsync<string?>("SELECT Name FROM Lab_Machines WHERE Id = @Id", new { machine.Id });
            var renamed = oldName != null && !string.Equals(oldName, machine.Name, StringComparison.Ordinal);
            var designRows = renamed ? await ServingDesignRenamesAsync(oldName!, machine.Name) : new List<(int Id, string Machines)>();
            machine.UpdatedAt = DateTime.UtcNow;
            using var tx = _db.BeginTransaction();
            try
            {
                var rows = await _db.ExecuteAsync(sql, machine, tx);
                if (rows > 0)
                    foreach (var (id, machines) in designRows)
                        await _db.ExecuteAsync("UPDATE Models_Serving_Design SET Machines = @M, UpdatedAt = @Now WHERE Id = @Id",
                            new { M = machines, Now = DateTime.UtcNow, Id = id }, tx);
                tx.Commit();
                return rows > 0;
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }

        // The serving page's boxes list their machines by name (Models_Serving_Design.Machines), so a rename
        // carries into them or the cards lose their machines. The Models module is optional: no table, no rows.
        private async Task<List<(int Id, string Machines)>> ServingDesignRenamesAsync(string oldName, string newName)
        {
            var result = new List<(int Id, string Machines)>();
            if (await _db.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'Models_Serving_Design'") == 0) return result;
            var rows = (await _db.QueryAsync<(int Id, string? Machines)>("SELECT Id, Machines FROM Models_Serving_Design WHERE Machines IS NOT NULL")).ToList();
            foreach (var (id, machines) in rows)
            {
                var parts = machines!.Split(',').Select(p => p.Trim()).Where(p => p.Length > 0).ToList();
                if (!parts.Any(p => string.Equals(p, oldName, StringComparison.OrdinalIgnoreCase))) continue;
                result.Add((id, string.Join(", ", parts.Select(p => string.Equals(p, oldName, StringComparison.OrdinalIgnoreCase) ? newName : p))));
            }
            return result;
        }

        // Hard delete = eradicating a mistaken machine. Components are shelved, and the
        // machine's movement rows + attachments are removed (they FK-reference the machine,
        // and a mistake's history is itself a mistake). A real machine being decommissioned
        // should get Status = 'retired' instead, which preserves its ledger.
        public async Task<bool> DeleteMachineAsync(int id)
        {
            if (_db.State != ConnectionState.Open) _db.Open();
            using var tx = _db.BeginTransaction();
            try
            {
                var now = DateTime.UtcNow;
                await _db.ExecuteAsync(@"
                    UPDATE Lab_Components SET CurrentMachineId = NULL, Status = 'spare', UpdatedAt = @Now
                    WHERE CurrentMachineId = @Id",
                    new { Id = id, Now = now }, tx);

                await _db.ExecuteAsync(
                    "DELETE FROM Lab_ComponentMovements WHERE FromMachineId = @Id OR ToMachineId = @Id",
                    new { Id = id }, tx);

                await _db.ExecuteAsync(
                    "DELETE FROM Lab_Attachments WHERE MachineId = @Id",
                    new { Id = id }, tx);

                // Placements FK-reference the machine, so a machine still racked in a space
                // fails to delete with a bare "FOREIGN KEY constraint failed" - the same
                // trap Lab_Attachments already documents on the component delete path.
                await _db.ExecuteAsync(
                    "DELETE FROM Lab_Placements WHERE MachineId = @Id",
                    new { Id = id }, tx);

                var rows = await _db.ExecuteAsync("DELETE FROM Lab_Machines WHERE Id = @Id", new { Id = id }, tx);
                tx.Commit();
                return rows > 0;
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }

        // ============================================================
        // Timeline (replay over the append-only movement ledger)
        // ============================================================

        // Loadout of a machine at a point in time: for each component, take its latest
        // movement at or before the date; the component was installed here if that
        // movement's ToMachineId is this machine.
        public async Task<IEnumerable<Model_Lab_Component>> GetTimelineAsync(int machineId, DateTime asOf)
        {
            const string sql = @"
                SELECT c.*
                FROM Lab_Components c
                JOIN Lab_ComponentMovements mv ON mv.ComponentId = c.Id
                WHERE mv.Id = (
                    SELECT mv2.Id FROM Lab_ComponentMovements mv2
                    WHERE mv2.ComponentId = c.Id AND mv2.MovedAt <= @AsOf
                    ORDER BY mv2.MovedAt DESC, mv2.Id DESC
                    LIMIT 1
                )
                AND mv.ToMachineId = @MachineId
                ORDER BY c.Type ASC, c.Model COLLATE NOCASE ASC";

            return await _db.QueryAsync<Model_Lab_Component>(sql, new { MachineId = machineId, AsOf = asOf });
        }

        public async Task<IEnumerable<Model_Lab_ComponentMovement>> GetMovementsForMachineAsync(int machineId)
        {
            const string sql = @"
                SELECT mv.*,
                       COALESCE(NULLIF(c.Name, ''), COALESCE(NULLIF(TRIM(COALESCE(c.Manufacturer, '') || ' ' || COALESCE(c.Model, '')), ''), c.Nickname)) AS ComponentLabel,
                       fm.Name AS FromMachineName,
                       tm.Name AS ToMachineName
                FROM Lab_ComponentMovements mv
                JOIN Lab_Components c ON c.Id = mv.ComponentId
                LEFT JOIN Lab_Machines fm ON fm.Id = mv.FromMachineId
                LEFT JOIN Lab_Machines tm ON tm.Id = mv.ToMachineId
                WHERE mv.FromMachineId = @MachineId OR mv.ToMachineId = @MachineId
                ORDER BY mv.MovedAt DESC, mv.Id DESC";

            return await _db.QueryAsync<Model_Lab_ComponentMovement>(sql, new { MachineId = machineId });
        }
    }
}
