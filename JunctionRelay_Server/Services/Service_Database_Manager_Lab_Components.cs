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
    public class Service_Database_Manager_Lab_Components
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_Lab_Components(IDbConnection db)
        {
            _db = db;
        }

        // ============================================================
        // Status vocabulary
        // ============================================================
        // Two statuses are DERIVED from where a part is: "active" (in a machine) and
        // "spare" (on the shelf). Moving a part rewrites those freely, because they are
        // just the location restated.
        //
        // The rest are RETIRED - a deliberate statement that the part has left the fleet,
        // and the reason it left. A move must never overwrite one of these, or shelving a
        // sold card would quietly resurrect it as a spare. They are also what the
        // Graveyard view is made of, which is why "why is it gone" is a status and not a
        // note: sold, dead and lost are different answers, and the fleet totals must not
        // count any of them.
        public const string StatusActive = "active";
        public const string StatusSpare = "spare";
        // ON ORDER: bought or about to be, not in hand.
        // Never on the shelf, never a usable spare, never in the value totals (groupBy=status shows them on
        // their own line). It ends the way any arrival does: installing it makes it active, shelving it spare.
        public const string StatusIncoming = "incoming";

        public static readonly string[] RetiredStatuses = { "sold", "dead", "damaged", "lost", "disposed" };
        public static readonly string[] ComponentStatuses =
            new[] { StatusActive, StatusSpare, StatusIncoming }.Concat(RetiredStatuses).ToArray();

        // A part that stands on its own - a switch on a desk, a patch panel in a rack, the modem - is IN USE
        // when it is INSTALLED in a Space or is a live device on the network page (placement counts as
        // installed). In use makes a spare or on-order one active; out of use makes an
        // active one spare. Retired parts and parts inside a machine (the machine decides) are never touched.
        // ONE copy, called by placements, the network page and the status rule.
        public static async Task<bool> StandaloneInUseAsync(IDbConnection db, int componentId) =>
            await db.ExecuteScalarAsync<int>(@"
                SELECT (SELECT COUNT(*) FROM Lab_Placements WHERE ComponentId = @Id AND Status = 'installed')
                     + (SELECT COUNT(*) FROM Lab_Network_Nodes WHERE ComponentId = @Id AND Status = 'live')",
                new { Id = componentId }) > 0;

        public static async Task SyncStandaloneStatusAsync(IDbConnection db, int? componentId)
        {
            if (!componentId.HasValue) return;
            var c = (await db.QueryAsync<(string Status, int? MachineId)>(
                "SELECT Status, CurrentMachineId FROM Lab_Components WHERE Id = @Id", new { Id = componentId })).FirstOrDefault();
            if (c.Status == null || c.MachineId.HasValue) return;
            var inUse = await StandaloneInUseAsync(db, componentId.Value);
            var next = inUse && (c.Status == StatusSpare || c.Status == StatusIncoming) ? StatusActive
                     : !inUse && c.Status == StatusActive ? StatusSpare : null;
            if (next != null)
                await db.ExecuteAsync("UPDATE Lab_Components SET Status = @S, UpdatedAt = @Now WHERE Id = @Id",
                    new { S = next, Now = DateTime.UtcNow, Id = componentId });
        }

        public static bool IsRetiredStatus(string? status) =>
            status != null && RetiredStatuses.Contains(status.Trim().ToLowerInvariant());

        public static bool IsValidStatus(string? status) =>
            string.IsNullOrWhiteSpace(status) || ComponentStatuses.Contains(status.Trim().ToLowerInvariant());

        // ============================================================
        // Components CRUD
        // ============================================================

        // machineId: null = no filter; 0 = on the shelf (CurrentMachineId IS NULL)
        // status: an exact status, or the pseudo-values "retired" (everything in the
        // Graveyard) and "in-service" (everything not in it).
        public async Task<IEnumerable<Model_Lab_Component>> GetAllComponentsAsync(string? type = null, int? machineId = null, string? status = null)
        {
            var sql = @"
                SELECT c.*, m.Name AS CurrentMachineName,
                       -- Where it physically SITS, derived on read. A component can be in a
                       -- machine AND in a rack at once - a GPU sits in a server, and the server
                       -- sits in a rack - so these are separate answers, not alternatives.
                       -- DIRECT: the component has its own placement (a PDU, a patch panel -
                       -- bare parts racked on their own).
                       (SELECT s.Name FROM Lab_Placements p
                          JOIN Lab_Spaces s ON s.Id = p.SpaceId
                         WHERE p.ComponentId = c.Id LIMIT 1) AS SpaceName,
                       (SELECT p.PositionU FROM Lab_Placements p
                         WHERE p.ComponentId = c.Id LIMIT 1) AS SpacePositionU,
                       -- INHERITED: it is in a machine, and that machine is racked. Answers
                       -- where is that GPU: answered with the rack, not just the box.
                       (SELECT s.Name FROM Lab_Placements p
                          JOIN Lab_Spaces s ON s.Id = p.SpaceId
                         WHERE p.MachineId = c.CurrentMachineId LIMIT 1) AS MachineSpaceName,
                       (SELECT COUNT(*) FROM Lab_Attachments a WHERE a.ComponentId = c.Id) AS AttachmentCount,
                       (SELECT mv.Value FROM Lab_MarketValues mv WHERE mv.ComponentId = c.Id
                        ORDER BY mv.CapturedAt DESC, mv.Id DESC LIMIT 1) AS LastObservedValue,
                       (SELECT mv.CapturedAt FROM Lab_MarketValues mv WHERE mv.ComponentId = c.Id
                        ORDER BY mv.CapturedAt DESC, mv.Id DESC LIMIT 1) AS LastObservedAt
                FROM Lab_Components c
                LEFT JOIN Lab_Machines m ON m.Id = c.CurrentMachineId
                WHERE 1 = 1";

            if (!string.IsNullOrWhiteSpace(type)) sql += " AND c.Type = @Type";
            var statusFilter = (status ?? "").Trim().ToLowerInvariant();
            if (statusFilter == "retired") sql += " AND c.Status IN @RetiredStatuses";
            else if (statusFilter == "in-service") sql += " AND c.Status NOT IN @RetiredStatuses";
            else if (statusFilter.Length > 0) sql += " AND c.Status = @Status";
            if (machineId.HasValue)
                sql += machineId.Value == 0
                    ? " AND c.CurrentMachineId IS NULL"
                    : " AND c.CurrentMachineId = @MachineId";

            sql += " ORDER BY c.Type ASC, c.Model COLLATE NOCASE ASC";

            var rows = (await _db.QueryAsync<Model_Lab_Component>(sql,
                new { Type = type, Status = statusFilter, MachineId = machineId, RetiredStatuses })).ToList();
            await ApplyParentInheritanceAsync(rows);
            return rows;
        }

        public async Task<Model_Lab_Component?> GetComponentByIdAsync(int id)
        {
            const string sql = @"
                SELECT c.*, m.Name AS CurrentMachineName,
                       -- Where it physically SITS, derived on read. A component can be in a
                       -- machine AND in a rack at once - a GPU sits in a server, and the server
                       -- sits in a rack - so these are separate answers, not alternatives.
                       -- DIRECT: the component has its own placement (a PDU, a patch panel -
                       -- bare parts racked on their own).
                       (SELECT s.Name FROM Lab_Placements p
                          JOIN Lab_Spaces s ON s.Id = p.SpaceId
                         WHERE p.ComponentId = c.Id LIMIT 1) AS SpaceName,
                       (SELECT p.PositionU FROM Lab_Placements p
                         WHERE p.ComponentId = c.Id LIMIT 1) AS SpacePositionU,
                       -- INHERITED: it is in a machine, and that machine is racked. Answers
                       -- where is that GPU: answered with the rack, not just the box.
                       (SELECT s.Name FROM Lab_Placements p
                          JOIN Lab_Spaces s ON s.Id = p.SpaceId
                         WHERE p.MachineId = c.CurrentMachineId LIMIT 1) AS MachineSpaceName,
                       (SELECT COUNT(*) FROM Lab_Attachments a WHERE a.ComponentId = c.Id) AS AttachmentCount,
                       (SELECT mv.Value FROM Lab_MarketValues mv WHERE mv.ComponentId = c.Id
                        ORDER BY mv.CapturedAt DESC, mv.Id DESC LIMIT 1) AS LastObservedValue,
                       (SELECT mv.CapturedAt FROM Lab_MarketValues mv WHERE mv.ComponentId = c.Id
                        ORDER BY mv.CapturedAt DESC, mv.Id DESC LIMIT 1) AS LastObservedAt
                FROM Lab_Components c
                LEFT JOIN Lab_Machines m ON m.Id = c.CurrentMachineId
                WHERE c.Id = @Id";
            var row = await _db.QuerySingleOrDefaultAsync<Model_Lab_Component>(sql, new { Id = id });
            if (row != null) await ApplyParentInheritanceAsync(new List<Model_Lab_Component> { row });
            return row;
        }

        // An integrated part - an iGPU in its CPU, the CPU soldered to a barebones board,
        // the case a DeskMini ships in - was never bought on its own. It arrived inside
        // its parent, on the parent's invoice, from the parent's vendor, on the parent's
        // date, under the parent's warranty. Those four facts are therefore DERIVED from
        // the parent rather than stored on the child (see UpdateComponentAsync, which
        // clears them), so they can never drift from the purchase that actually happened.
        //
        // Price is deliberately NOT inherited. The money was spent once, on the parent;
        // copying it down would double-count the same dollars in every fleet total.
        private const int MaxParentDepth = 8;

        private async Task ApplyParentInheritanceAsync(List<Model_Lab_Component> rows)
        {
            var wanted = rows.Where(r => r.ParentComponentId.HasValue)
                .Select(r => r.ParentComponentId!.Value).Distinct().ToList();
            if (wanted.Count == 0) return;

            // Load the whole ANCESTRY, not just the immediate parent. An iGPU hangs off a
            // CPU that is itself soldered to a board, and the purchase happened at the top
            // of that chain. Intermediate parents store nothing of their own (they are
            // children too), so a one-level lookup would read their blanks and report the
            // grandchild as never purchased.
            var byId = new Dictionary<int, Model_Lab_Component>();
            for (var depth = 0; depth < MaxParentDepth && wanted.Count > 0; depth++)
            {
                var fetched = (await _db.QueryAsync<Model_Lab_Component>(
                    "SELECT * FROM Lab_Components WHERE Id IN @Ids", new { Ids = wanted })).ToList();
                foreach (var p in fetched) byId[p.Id] = p;
                wanted = fetched
                    .Where(p => p.ParentComponentId.HasValue)
                    .Select(p => p.ParentComponentId!.Value)
                    .Where(id => !byId.ContainsKey(id))
                    .Distinct().ToList();
            }

            // One query for the ancestors' attachment counts - the invoice a child points
            // at is the root's, and an N+1 per child would be silly for a display hint.
            var attachmentCounts = byId.Count == 0
                ? new Dictionary<int, int>()
                : (await _db.QueryAsync<(int ComponentId, int Count)>(
                        @"SELECT ComponentId, COUNT(*) AS Count FROM Lab_Attachments
                          WHERE ComponentId IN @Ids GROUP BY ComponentId",
                        new { Ids = byId.Keys.ToList() }))
                    .ToDictionary(x => x.ComponentId, x => x.Count);

            foreach (var r in rows)
            {
                if (r.ParentComponentId is not int pid || !byId.TryGetValue(pid, out var parent)) continue;

                // Named after the part it plugs into, but the facts come from the root of
                // the chain - the thing that was actually bought.
                r.ParentComponentName = string.Join(" ", new[] { parent.Manufacturer, parent.Model }
                    .Where(s => !string.IsNullOrWhiteSpace(s)));
                r.InheritsPurchase = true;

                var root = parent;
                for (var hop = 0; hop < MaxParentDepth; hop++)
                {
                    if (root.ParentComponentId is not int up || !byId.TryGetValue(up, out var next)) break;
                    root = next;
                }

                r.AcquiredAt = root.AcquiredAt ?? r.AcquiredAt;
                r.Vendor = root.Vendor ?? r.Vendor;
                r.WarrantyYears = root.WarrantyYears ?? r.WarrantyYears;

                r.InvoiceSourceComponentId = root.Id;
                r.InvoiceSourceName = string.Join(" ", new[] { root.Manufacturer, root.Model }
                    .Where(s => !string.IsNullOrWhiteSpace(s)));
                r.InheritedAttachmentCount = attachmentCounts.TryGetValue(root.Id, out var n) ? n : 0;
            }
        }

        // A part cannot be inside itself, nor inside something that is already inside it -
        // a cycle would make "what did this cost" unanswerable and the read-side walk
        // would just hit its depth cap and give up quietly.
        private async Task ValidateParentAsync(Model_Lab_Component component)
        {
            if (component.ParentComponentId is not int parentId) return;
            if (parentId == component.Id)
                throw new InvalidOperationException("A component cannot be integrated into itself.");

            var seen = new HashSet<int> { component.Id };
            var cursor = parentId;
            for (var hop = 0; hop < MaxParentDepth; hop++)
            {
                if (!seen.Add(cursor))
                    throw new InvalidOperationException(
                        $"Component {parentId} is already inside component {component.Id}; " +
                        "that would make a loop.");
                var next = await _db.ExecuteScalarAsync<int?>(
                    "SELECT ParentComponentId FROM Lab_Components WHERE Id = @Id", new { Id = cursor });
                if (next is not int up) return;
                cursor = up;
            }
            throw new InvalidOperationException("Integrated-part chain is too deep.");
        }

        // Creating a component already installed in a machine writes the initial movement
        // row (shelf -> machine) so the timeline is complete from birth.
        public async Task<int> CreateComponentAsync(Model_Lab_Component component)
        {
            if (_db.State != ConnectionState.Open) _db.Open();
            using var tx = _db.BeginTransaction();
            try
            {
                const string sql = @"
                    INSERT INTO Lab_Components (
                        Type, Name, Manufacturer, Model, Nickname, SerialNumber, Sku, Spec, SpecJson,
                        Status, CurrentMachineId, ParentComponentId, ReleaseDate, Msrp, ListPrice, ListPriceDate, ListPriceNotes, PurchasePrice, AcquiredAt, Source, Vendor,
                        WarrantyYears, Notes, CreatedAt, UpdatedAt
                    ) VALUES (
                        @Type, @Name, @Manufacturer, @Model, @Nickname, @SerialNumber, @Sku, @Spec, @SpecJson,
                        @Status, @CurrentMachineId, @ParentComponentId, @ReleaseDate, @Msrp, @ListPrice, @ListPriceDate, @ListPriceNotes, @PurchasePrice, @AcquiredAt, @Source, @Vendor,
                        @WarrantyYears, @Notes, @CreatedAt, @UpdatedAt
                    );
                    SELECT last_insert_rowid();";

                await ValidateParentAsync(component);
                ClearInheritedFields(component);
                component.CreatedAt = DateTime.UtcNow;
                component.UpdatedAt = DateTime.UtcNow;
                if (string.IsNullOrWhiteSpace(component.Status))
                    component.Status = component.CurrentMachineId.HasValue ? "active" : "spare";

                var id = await _db.ExecuteScalarAsync<int>(sql, component, tx);

                if (component.CurrentMachineId.HasValue)
                {
                    var movedAt = component.AcquiredAt ?? DateTime.UtcNow;
                    await _db.ExecuteAsync(@"
                        INSERT INTO Lab_ComponentMovements (ComponentId, FromMachineId, ToMachineId, MovedAt, Reason, CreatedAt)
                        VALUES (@ComponentId, NULL, @ToMachineId, @MovedAt, @Reason, @CreatedAt)",
                        new
                        {
                            ComponentId = id,
                            ToMachineId = component.CurrentMachineId.Value,
                            MovedAt = movedAt,
                            Reason = "Initial install",
                            CreatedAt = DateTime.UtcNow
                        }, tx);
                }

                tx.Commit();
                return id;
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }

        // Field updates only — CurrentMachineId is deliberately NOT updatable here.
        // Location changes go through MoveComponentAsync so the ledger stays truthful.
        public async Task<bool> UpdateComponentAsync(Model_Lab_Component component)
        {
            var existing = await GetComponentByIdAsync(component.Id);
            if (existing == null) return false;

            component.Status = string.IsNullOrWhiteSpace(component.Status)
                ? existing.Status
                : component.Status.Trim().ToLowerInvariant();

            await ValidateParentAsync(component);
            ClearInheritedFields(component);

            const string sql = @"
                UPDATE Lab_Components SET
                    Type = @Type,
                    Name = @Name,
                    Manufacturer = @Manufacturer,
                    Model = @Model,
                    Nickname = @Nickname,
                    SerialNumber = @SerialNumber,
                    Sku = @Sku,
                    Spec = @Spec,
                    SpecJson = @SpecJson,
                    Status = @Status,
                    ParentComponentId = @ParentComponentId,
                    ReleaseDate = @ReleaseDate,
                    Msrp = @Msrp,
                    ListPrice = @ListPrice,
                    ListPriceDate = @ListPriceDate,
                    ListPriceNotes = @ListPriceNotes,
                    PurchasePrice = @PurchasePrice,
                    AcquiredAt = @AcquiredAt,
                    Source = @Source,
                    Vendor = @Vendor,
                    WarrantyYears = @WarrantyYears,
                    Notes = @Notes,
                    UpdatedAt = @UpdatedAt
                WHERE Id = @Id";

            component.UpdatedAt = DateTime.UtcNow;
            var rows = await _db.ExecuteAsync(sql, component);
            if (rows == 0) return false;

            // A part that has been sold, binned or lost cannot still be installed. Rather
            // than blank the pointer behind the ledger's back, retiring an installed part
            // records the removal as a real move - so the machine's timeline shows the day
            // the part left, with the reason.
            if (IsRetiredStatus(component.Status) && existing.CurrentMachineId.HasValue)
                await MoveComponentAsync(component.Id, null, null, null, $"Marked {component.Status}");

            return true;
        }

        // A child's purchase facts are the parent's, so it stores none of its own - a
        // saved form round-trips the inherited values back, and writing them would turn a
        // derived fact into a stale copy the day the parent's invoice is corrected.
        // Price is cleared outright: the child never cost anything by itself, and a
        // duplicated figure double-counts in every total (as the N100 row did).
        private static void ClearInheritedFields(Model_Lab_Component component)
        {
            if (component.ParentComponentId == null) return;
            component.AcquiredAt = null;
            component.Vendor = null;
            component.WarrantyYears = null;
            component.PurchasePrice = null;
            // Source stays on the child: it is the item's condition, not a fact about the
            // purchase, and "Internal" is exactly what an integrated part often is.
        }

        // Status-only change, so saying "I sold it" does not mean round-tripping every
        // field of the component and risking a stale write over the rest of them.
        // Retiring an installed part removes it from its machine, same as the full update.
        public async Task<Model_Lab_Component?> SetStatusAsync(int id, string status, string? reason = null)
        {
            var component = await GetComponentByIdAsync(id);
            if (component == null) return null;

            var newStatus = (status ?? "").Trim().ToLowerInvariant();
            if (!ComponentStatuses.Contains(newStatus))
                throw new ArgumentException(
                    $"Unknown status '{status}'. Valid statuses: {string.Join(", ", ComponentStatuses)}.");

            // "active" means something is using it: installed in a machine, or - for a part that
            // stands on its own, a switch or a modem - a live device on the network page. A part on
            // the shelf cannot be active, so say so rather than writing a
            // status the next move undoes.
            if (newStatus == StatusActive && !component.CurrentMachineId.HasValue && !await StandaloneInUseAsync(_db, id))
                throw new ArgumentException(
                    "A component is only 'active' once it is in use - install it in a machine, place it (installed) in a Space, or put it on the network page as a live device.");
            if (newStatus == StatusIncoming && component.CurrentMachineId.HasValue)
                throw new ArgumentException("An installed part is in hand, so it cannot be on order ('incoming').");

            await _db.ExecuteAsync(
                "UPDATE Lab_Components SET Status = @Status, UpdatedAt = @Now WHERE Id = @Id",
                new { Status = newStatus, Now = DateTime.UtcNow, Id = id });

            // Retiring or sparing a part that is still installed takes it out of the
            // machine, and that removal is a real event, so it goes through the ledger.
            if (newStatus != StatusActive && component.CurrentMachineId.HasValue)
                await MoveComponentAsync(id, null, null, null, reason ?? $"Marked {newStatus}");

            return await GetComponentByIdAsync(id);
        }

        // Hard delete only when the component has no history; otherwise it is disposed
        // (shelved + status flag) so the ledger keeps referencing a real row.
        // Returns "deleted", "disposed", or "notfound".
        public async Task<string> DeleteOrDisposeComponentAsync(int id)
        {
            var component = await GetComponentByIdAsync(id);
            if (component == null) return "notfound";

            var movementCount = await _db.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM Lab_ComponentMovements WHERE ComponentId = @Id", new { Id = id });

            if (movementCount == 0)
            {
                // ⛔ Attachment rows must go FIRST. Lab_Attachments carries a FK to
                // Lab_Components, so deleting the component while an invoice row still points
                // at it fails with "SQLite Error 19: FOREIGN KEY constraint failed" - a
                // message that names neither the table nor the file, and so reads as a random
                // failure. It only ever bit components that HAD an invoice, which is why it
                // looked intermittent. ForceDeleteComponentAsync always did this; this path
                // did not, and its comment claimed the controller handled it. It does not.
                if (_db.State != ConnectionState.Open) _db.Open();
                using var delTx = _db.BeginTransaction();
                try
                {
                    await _db.ExecuteAsync("DELETE FROM Lab_Attachments WHERE ComponentId = @Id", new { Id = id }, delTx);
                    // Same FK trap again, and the one that reached a user: Lab_MarketValues
                    // references Lab_Components, so a part that has been through ONE pricing
                    // round could not be deleted at all - the UI showed "SQLite Error 19" and
                    // the row stayed. Observations are worthless without the part they price,
                    // so they go with it.
                    await _db.ExecuteAsync("DELETE FROM Lab_MarketValues WHERE ComponentId = @Id", new { Id = id }, delTx);
                    // Same FK trap as attachments: a placement (racked part) or a space
                    // built on this component (a rack IS a component) blocks the delete
                    // with an unnamed constraint error. The space survives - only its
                    // purchase link is cleared.
                    await _db.ExecuteAsync("DELETE FROM Lab_Placements WHERE ComponentId = @Id", new { Id = id }, delTx);
                    await _db.ExecuteAsync("UPDATE Lab_Spaces SET ComponentId = NULL WHERE ComponentId = @Id", new { Id = id }, delTx);
                    await _db.ExecuteAsync("DELETE FROM Lab_Components WHERE Id = @Id", new { Id = id }, delTx);
                    delTx.Commit();
                }
                catch
                {
                    delTx.Rollback();
                    throw;
                }
                return "deleted";
            }

            if (_db.State != ConnectionState.Open) _db.Open();
            using var tx = _db.BeginTransaction();
            try
            {
                var now = DateTime.UtcNow;

                // A part already retired for a specific reason keeps it: deleting a SOLD
                // card should not rewrite the record to say it was binned.
                var retiredAs = IsRetiredStatus(component.Status) ? component.Status! : "disposed";

                if (component.CurrentMachineId.HasValue)
                {
                    await _db.ExecuteAsync(@"
                        INSERT INTO Lab_ComponentMovements (ComponentId, FromMachineId, ToMachineId, MovedAt, Reason, CreatedAt)
                        VALUES (@ComponentId, @FromMachineId, NULL, @MovedAt, @Reason, @CreatedAt)",
                        new { ComponentId = id, FromMachineId = component.CurrentMachineId.Value, MovedAt = now, Reason = "Disposed", CreatedAt = now }, tx);
                }

                await _db.ExecuteAsync(@"
                    UPDATE Lab_Components SET CurrentMachineId = NULL, Status = @Status, UpdatedAt = @Now
                    WHERE Id = @Id", new { Id = id, Status = retiredAs, Now = now }, tx);

                // A part that has left the fleet stops occupying rack U - the same rule
                // retiring already applies to machine slots.
                await _db.ExecuteAsync("DELETE FROM Lab_Placements WHERE ComponentId = @Id", new { Id = id }, tx);

                tx.Commit();
                return "disposed";
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }

        // Force delete = eradicating a mistaken/duplicate component: removes its
        // movement rows and the component itself. Attachment rows/files are handled
        // by the controller (file store access lives there).
        public async Task<bool> ForceDeleteComponentAsync(int id)
        {
            if (_db.State != ConnectionState.Open) _db.Open();
            using var tx = _db.BeginTransaction();
            try
            {
                await _db.ExecuteAsync("DELETE FROM Lab_ComponentMovements WHERE ComponentId = @Id", new { Id = id }, tx);
                await _db.ExecuteAsync("DELETE FROM Lab_Attachments WHERE ComponentId = @Id", new { Id = id }, tx);
                await _db.ExecuteAsync("DELETE FROM Lab_MarketValues WHERE ComponentId = @Id", new { Id = id }, tx);
                await _db.ExecuteAsync("DELETE FROM Lab_Placements WHERE ComponentId = @Id", new { Id = id }, tx);
                await _db.ExecuteAsync("UPDATE Lab_Spaces SET ComponentId = NULL WHERE ComponentId = @Id", new { Id = id }, tx);
                var rows = await _db.ExecuteAsync("DELETE FROM Lab_Components WHERE Id = @Id", new { Id = id }, tx);
                tx.Commit();
                return rows > 0;
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }

        // ⛔ DELETE = "this row should never have existed". NOT retirement, which says a real
        // part left the fleet and is a TRUE record in the Graveyard. Filing a mis-created row
        // as 'disposed' asserts a disposal that never happened - a fabricated fact, permanently,
        // in the one place you would look to check.
        //
        // 🔑 THE GUARD IS THE ABSENCE OF HISTORY, not a clock or an identity. A component with
        // no attachment, no placement, no market value and no movement beyond its own creation
        // is by definition one that was just filed and nothing has happened to. That is exactly
        // "a mistake, caught early", and the condition fails closed the moment the row acquires
        // any of them. Same rule for a human and for an agent, so there is one path to get right.
        //
        // ⛔ An ATTACHMENT is a hard refusal, never a cascade. An invoice PDF is the evidence
        // the part existed; a tool that removes the row AND its proof can erase the fact it was
        // ever real. Detach deliberately first, or do not delete.
        //
        // Returns (deleted, refusal). refusal != null means NOTHING was written.
        public async Task<(bool Deleted, string? Refusal)> DeleteComponentAsync(
            int componentId, string reason, string? deletedBy)
        {
            if (string.IsNullOrWhiteSpace(reason))
                return (false, "A reason is required - a deletion with no reason is indistinguishable from data loss.");

            // ⛔ AND AN AUTHOR. Made mandatory after the first real use left it empty:
            // the audit rows for the two mis-filed Mystery Box components recorded WHAT was
            // removed and WHY, and not WHO. Now that an agent files into the Lab on its own
            // judgement, the author is the field that makes an autonomous mistake traceable -
            // and an optional field is one that gets skipped exactly when it matters.
            if (string.IsNullOrWhiteSpace(deletedBy))
                return (false, "deletedBy is required - an audit row that cannot say who deleted " +
                               "the component is not an audit row. Pass your own name.");

            if (_db.State != ConnectionState.Open) _db.Open();
            using var tx = _db.BeginTransaction();
            try
            {
                var component = await _db.QueryFirstOrDefaultAsync<Model_Lab_Component>(
                    "SELECT * FROM Lab_Components WHERE Id = @Id", new { Id = componentId }, tx);
                if (component == null) { tx.Rollback(); return (false, $"No component with id {componentId}."); }

                async Task<int> Count(string sql) =>
                    await _db.ExecuteScalarAsync<int>(sql, new { Id = componentId }, tx);

                var attachments = await Count("SELECT COUNT(*) FROM Lab_Attachments WHERE ComponentId = @Id");
                if (attachments > 0)
                    { tx.Rollback(); return (false,
                        $"REFUSED: {attachments} attachment(s) are filed against this component. An invoice is " +
                        "the evidence the part existed - deleting the row would erase the proof with it. " +
                        "Look at them with lab_list_attachments. If one is junk - a blank or text file, " +
                        "not a receipt - remove it with lab_delete_attachment and try again. If it is a " +
                        "real invoice, this is a real part: it is not a mis-filing, and NOT something " +
                        "to mark disposed to get past this check."); }

                var placements = await Count("SELECT COUNT(*) FROM Lab_Placements WHERE ComponentId = @Id");
                if (placements > 0)
                    { tx.Rollback(); return (false,
                        $"REFUSED: it is placed in a space ({placements} placement row(s)). Something that " +
                        "has been fitted somewhere is not a mis-filing - remove it from the space first."); }

                var market = await Count("SELECT COUNT(*) FROM Lab_MarketValues WHERE ComponentId = @Id");
                if (market > 0)
                    { tx.Rollback(); return (false,
                        $"REFUSED: {market} market-value observation(s) exist. Someone has priced this row, " +
                        "so it has a history worth keeping. Retire it with lab_set_component_status instead."); }

                var children = await Count("SELECT COUNT(*) FROM Lab_Components WHERE ParentComponentId = @Id");
                if (children > 0)
                    { tx.Rollback(); return (false,
                        $"REFUSED: {children} component(s) are integrated into this one and would be left " +
                        "pointing at a row that does not exist. Re-parent them first."); }

                var spaces = await Count("SELECT COUNT(*) FROM Lab_Spaces WHERE ComponentId = @Id");
                if (spaces > 0)
                    { tx.Rollback(); return (false,
                        "REFUSED: a space (rack, desk, shelf) records this component as the thing that was " +
                        "bought for it. Clear that link first."); }

                // ⚠️ ONE movement is the creation itself - create-with-install writes a row.
                // More than one means the part has been moved since, which is history.
                var movements = await Count("SELECT COUNT(*) FROM Lab_ComponentMovements WHERE ComponentId = @Id");
                if (movements > 1)
                    { tx.Rollback(); return (false,
                        $"REFUSED: {movements} movement rows - this component has been moved since it was " +
                        "filed, so it has a history. A mis-filing has none. Retire it instead."); }

                var label = component.Name ?? string.Join(" ", new[] { component.Manufacturer, component.Model }
                    .Where(x => !string.IsNullOrWhiteSpace(x)));

                // 🔑 The snapshot has to be COMPLETE or it is not a recovery path. Because the
                // guards above refuse anything with history, the only child row a deletable
                // component can own is its single creation movement - so capturing that
                // alongside the row makes the snapshot the whole of what existed. Without it a
                // restore would silently lose "this was created into the server on that date".
                var movementRows = (await _db.QueryAsync(
                    "SELECT * FROM Lab_ComponentMovements WHERE ComponentId = @Id",
                    new { Id = componentId }, tx)).ToList();

                var snapshot = System.Text.Json.JsonSerializer.Serialize(new
                {
                    component,
                    movements = movementRows
                });

                await _db.ExecuteAsync(@"
                    INSERT INTO Lab_ComponentDeletions
                        (ComponentId, ComponentLabel, ComponentType, Snapshot, Reason, DeletedBy, DeletedAt)
                    VALUES (@ComponentId, @Label, @Type, @Snapshot, @Reason, @By, @At)",
                    new
                    {
                        ComponentId = componentId,
                        Label = label,
                        Type = component.Type,
                        Snapshot = snapshot,
                        Reason = reason.Trim(),
                        By = deletedBy,
                        At = DateTime.UtcNow
                    }, tx);

                // The creation movement, if there is one, goes with the row it describes.
                await _db.ExecuteAsync("DELETE FROM Lab_ComponentMovements WHERE ComponentId = @Id",
                    new { Id = componentId }, tx);
                await _db.ExecuteAsync("DELETE FROM Lab_Components WHERE Id = @Id",
                    new { Id = componentId }, tx);

                tx.Commit();
                return (true, null);
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }

        // The other half of DeleteComponentAsync. A deletion that cannot be undone is not an
        // audit trail, it is a confession - the snapshot exists precisely so this is possible.
        //
        // 🔑 THE ORIGINAL ID IS RESTORED, deliberately. Lab_Components is INTEGER PRIMARY KEY
        // AUTOINCREMENT, so SQLite never reuses an id and the old one is still free. That
        // matters beyond tidiness: review.py's state file maps each reviewed purchase row to
        // the component id it became, and restoring under a NEW id would leave those mappings
        // pointing at nothing while looking repaired.
        //
        // ⚠️ Restores the creation movement too. It is captured in the same snapshot, and a
        // component that comes back without knowing where it was installed is not restored.
        public async Task<(bool Restored, string? Refusal)> RestoreComponentAsync(int componentId)
        {
            if (_db.State != ConnectionState.Open) _db.Open();
            using var tx = _db.BeginTransaction();
            try
            {
                var rec = await _db.QueryFirstOrDefaultAsync<dynamic>(@"
                    SELECT Id, Snapshot, ComponentLabel, RestoredAt FROM Lab_ComponentDeletions
                    WHERE ComponentId = @Id ORDER BY DeletedAt DESC LIMIT 1",
                    new { Id = componentId }, tx);

                if (rec == null)
                {
                    var recent = (await _db.QueryAsync<string>(@"
                        SELECT ComponentId || '  ' || COALESCE(ComponentLabel,'?') ||
                               '  (deleted ' || substr(DeletedAt,1,16) || ')'
                        FROM Lab_ComponentDeletions WHERE RestoredAt IS NULL
                        ORDER BY DeletedAt DESC LIMIT 10", null, tx)).ToList();
                    tx.Rollback();
                    return (false, recent.Count == 0
                        ? $"No deletion record for component {componentId}, and nothing has been deleted."
                        : $"No deletion record for component {componentId}. Most recent deletions " +
                          $"not yet restored:{Environment.NewLine}  " + string.Join(Environment.NewLine + "  ", recent));
                }

                if (rec.RestoredAt != null)
                    { tx.Rollback(); return (false, $"Component {componentId} was already restored on {rec.RestoredAt}."); }

                var exists = await _db.ExecuteScalarAsync<int>(
                    "SELECT COUNT(*) FROM Lab_Components WHERE Id = @Id", new { Id = componentId }, tx);
                if (exists > 0)
                    { tx.Rollback(); return (false,
                        $"Component {componentId} already exists - restoring would overwrite a live row. " +
                        "Nothing was written."); }

                using var doc = System.Text.Json.JsonDocument.Parse((string)rec.Snapshot);
                var comp = System.Text.Json.JsonSerializer.Deserialize<Model_Lab_Component>(
                    doc.RootElement.GetProperty("component").GetRawText(),
                    new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

                await _db.ExecuteAsync(@"
                    INSERT INTO Lab_Components (
                        Id, Type, Name, Manufacturer, Model, Nickname, SerialNumber, Sku, Spec, SpecJson,
                        Status, CurrentMachineId, ParentComponentId, ReleaseDate, Msrp, ListPrice,
                        ListPriceDate, ListPriceNotes, PurchasePrice, AcquiredAt, Source, Vendor,
                        WarrantyYears, Notes, CreatedAt, UpdatedAt
                    ) VALUES (
                        @Id, @Type, @Name, @Manufacturer, @Model, @Nickname, @SerialNumber, @Sku, @Spec, @SpecJson,
                        @Status, @CurrentMachineId, @ParentComponentId, @ReleaseDate, @Msrp, @ListPrice,
                        @ListPriceDate, @ListPriceNotes, @PurchasePrice, @AcquiredAt, @Source, @Vendor,
                        @WarrantyYears, @Notes, @CreatedAt, @UpdatedAt
                    )", comp, tx);

                if (doc.RootElement.TryGetProperty("movements", out var moves))
                {
                    foreach (var m in moves.EnumerateArray())
                    {
                        await _db.ExecuteAsync(@"
                            INSERT INTO Lab_ComponentMovements (ComponentId, FromMachineId, ToMachineId, SlotLabel, Reason, MovedAt)
                            VALUES (@ComponentId, @FromMachineId, @ToMachineId, @SlotLabel, @Reason, @MovedAt)",
                            new
                            {
                                ComponentId = componentId,
                                FromMachineId = m.TryGetProperty("FromMachineId", out var f) && f.ValueKind != System.Text.Json.JsonValueKind.Null ? f.GetInt32() : (int?)null,
                                ToMachineId = m.TryGetProperty("ToMachineId", out var t2) && t2.ValueKind != System.Text.Json.JsonValueKind.Null ? t2.GetInt32() : (int?)null,
                                SlotLabel = m.TryGetProperty("SlotLabel", out var sl) && sl.ValueKind == System.Text.Json.JsonValueKind.String ? sl.GetString() : null,
                                Reason = m.TryGetProperty("Reason", out var rs) && rs.ValueKind == System.Text.Json.JsonValueKind.String ? rs.GetString() : null,
                                MovedAt = m.TryGetProperty("MovedAt", out var ma) && ma.ValueKind == System.Text.Json.JsonValueKind.String ? ma.GetString() : DateTime.UtcNow.ToString("o")
                            }, tx);
                    }
                }

                await _db.ExecuteAsync(
                    "UPDATE Lab_ComponentDeletions SET RestoredAt = @Now WHERE Id = @RecId",
                    new { Now = DateTime.UtcNow, RecId = (int)rec.Id }, tx);

                tx.Commit();
                return (true, null);
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }

        // Merge = collapsing two rows that describe ONE physical part into the keeper,
        // then eradicating the loser. This is the de-duplication primitive, and it exists
        // because force-delete is the wrong instrument for it: a duplicate filed twice from
        // the same invoice carries an attachment, and possibly prices and a ledger, and
        // deleting the row throws all of that away. Every child row is re-pointed at the
        // keeper first, so the delete at the end has nothing left to orphan.
        //
        // ⚠️ The caller decides WHETHER these two rows are one part. This method only
        // executes the merge - it does not judge similarity, because a wrong guess here
        // destroys a real component and its provenance.
        // adoptMachineId/adoptStatus: set the keeper's location as part of THIS transaction.
        // ⚠️ Not a job for UpdateComponentAsync — that writer omits CurrentMachineId by
        // design, so an adoption routed through it is silently dropped. No ledger row is
        // written here either: the duplicate's own movement rows come across in the same
        // transaction and already say how the part got into that machine.
        public async Task<Model_Lab_MergeResult> MergeComponentsAsync(
            int keepId, int duplicateId, string? note = null,
            int? adoptMachineId = null, string? adoptStatus = null)
        {
            var result = new Model_Lab_MergeResult();

            if (_db.State != ConnectionState.Open) _db.Open();
            using var tx = _db.BeginTransaction();
            try
            {
                var now = DateTime.UtcNow;

                // Attachments: the same file filed twice (identical hash) would land on the
                // keeper as two identical invoice rows, so drop the duplicate's copy rather
                // than re-pointing it. ⛔ Rows only - the stored FILE stays put, because it
                // is shared by hash with the keeper's row that already references it.
                result.AttachmentsDropped = await _db.ExecuteAsync(@"
                    DELETE FROM Lab_Attachments
                    WHERE ComponentId = @Dup
                      AND Sha256 IS NOT NULL
                      AND Sha256 IN (SELECT Sha256 FROM Lab_Attachments WHERE ComponentId = @Keep)",
                    new { Dup = duplicateId, Keep = keepId }, tx);

                result.AttachmentsMoved = await _db.ExecuteAsync(
                    "UPDATE Lab_Attachments SET ComponentId = @Keep WHERE ComponentId = @Dup",
                    new { Keep = keepId, Dup = duplicateId }, tx);

                // Observations are an append-only series; both rows' history belongs to the
                // surviving part. Duplicate figures are left alone deliberately - two prices
                // captured on one day is a fact about the pricing round, not a merge artifact.
                result.MarketValuesMoved = await _db.ExecuteAsync(
                    "UPDATE Lab_MarketValues SET ComponentId = @Keep WHERE ComponentId = @Dup",
                    new { Keep = keepId, Dup = duplicateId }, tx);

                result.MovementsMoved = await _db.ExecuteAsync(
                    "UPDATE Lab_ComponentMovements SET ComponentId = @Keep WHERE ComponentId = @Dup",
                    new { Keep = keepId, Dup = duplicateId }, tx);

                // Children of the loser become children of the keeper, and a rack built on
                // the loser (a space IS a component) re-points too - otherwise the space
                // loses its purchase link the moment the row goes.
                result.ChildrenReparented = await _db.ExecuteAsync(
                    "UPDATE Lab_Components SET ParentComponentId = @Keep WHERE ParentComponentId = @Dup",
                    new { Keep = keepId, Dup = duplicateId }, tx);

                result.SpacesRepointed = await _db.ExecuteAsync(
                    "UPDATE Lab_Spaces SET ComponentId = @Keep WHERE ComponentId = @Dup",
                    new { Keep = keepId, Dup = duplicateId }, tx);

                // Placement: one part occupies one U. If the keeper is already racked the
                // loser's placement is dropped; if it is not, the placement moves over so a
                // merge never empties a slot that is physically full.
                var keeperPlaced = await _db.ExecuteScalarAsync<int>(
                    "SELECT COUNT(*) FROM Lab_Placements WHERE ComponentId = @Keep",
                    new { Keep = keepId }, tx);

                if (keeperPlaced > 0)
                {
                    result.PlacementsDropped = await _db.ExecuteAsync(
                        "DELETE FROM Lab_Placements WHERE ComponentId = @Dup",
                        new { Dup = duplicateId }, tx);
                }
                else
                {
                    result.PlacementsMoved = await _db.ExecuteAsync(
                        "UPDATE Lab_Placements SET ComponentId = @Keep, UpdatedAt = @Now WHERE ComponentId = @Dup",
                        new { Keep = keepId, Dup = duplicateId, Now = now }, tx);
                }

                await _db.ExecuteAsync("DELETE FROM Lab_Components WHERE Id = @Dup",
                    new { Dup = duplicateId }, tx);

                if (adoptMachineId.HasValue)
                {
                    await _db.ExecuteAsync(@"
                        UPDATE Lab_Components
                        SET CurrentMachineId = @MachineId,
                            Status = COALESCE(@Status, Status),
                            UpdatedAt = @Now
                        WHERE Id = @Keep",
                        new { Keep = keepId, MachineId = adoptMachineId.Value, Status = adoptStatus, Now = now }, tx);
                    result.AdoptedMachineId = adoptMachineId;
                }

                if (!string.IsNullOrWhiteSpace(note))
                {
                    await _db.ExecuteAsync(@"
                        UPDATE Lab_Components
                        SET Notes = CASE
                                WHEN Notes IS NULL OR TRIM(Notes) = '' THEN @Note
                                ELSE Notes || char(10) || @Note
                            END,
                            UpdatedAt = @Now
                        WHERE Id = @Keep",
                        new { Keep = keepId, Note = note.Trim(), Now = now }, tx);
                }

                tx.Commit();
            }
            catch
            {
                tx.Rollback();
                throw;
            }

            return result;
        }

        // ============================================================
        // Movement (the RAM-swap primitive)
        // ============================================================

        // Inserts a ledger row and updates the cached pointer in one transaction.
        public async Task<Model_Lab_ComponentMovement?> MoveComponentAsync(
            int componentId, int? toMachineId, DateTime? movedAt, string? slotLabel, string? reason)
        {
            var component = await GetComponentByIdAsync(componentId);
            if (component == null) return null;

            if (_db.State != ConnectionState.Open) _db.Open();
            using var tx = _db.BeginTransaction();
            try
            {
                var movement = new Model_Lab_ComponentMovement
                {
                    ComponentId = componentId,
                    FromMachineId = component.CurrentMachineId,
                    ToMachineId = toMachineId,
                    SlotLabel = slotLabel,
                    MovedAt = movedAt ?? DateTime.UtcNow,
                    Reason = reason,
                    CreatedAt = DateTime.UtcNow
                };

                const string insertSql = @"
                    INSERT INTO Lab_ComponentMovements (ComponentId, FromMachineId, ToMachineId, SlotLabel, MovedAt, Reason, CreatedAt)
                    VALUES (@ComponentId, @FromMachineId, @ToMachineId, @SlotLabel, @MovedAt, @Reason, @CreatedAt);
                    SELECT last_insert_rowid();";

                movement.Id = await _db.ExecuteScalarAsync<int>(insertSql, movement, tx);

                var newStatus = toMachineId.HasValue ? StatusActive
                    : IsRetiredStatus(component.Status) ? component.Status
                    : StatusSpare;

                await _db.ExecuteAsync(@"
                    UPDATE Lab_Components SET CurrentMachineId = @ToMachineId, Status = @Status, UpdatedAt = @Now
                    WHERE Id = @ComponentId",
                    new { ToMachineId = toMachineId, Status = newStatus, Now = DateTime.UtcNow, ComponentId = componentId }, tx);

                tx.Commit();
                return movement;
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }

        // Undo = delete the WRONG ledger row and restore the prior location - never a
        // reverse move, which would fabricate a swap that never happened. Only the
        // component's LATEST movement is undoable: removing one from mid-history would
        // corrupt the replay chain. Returns null when the component or movement is
        // missing; throws InvalidOperationException when the movement is not the latest.
        public async Task<Model_Lab_ComponentMovement?> UndoMovementAsync(int componentId, int movementId)
        {
            var component = await GetComponentByIdAsync(componentId);
            if (component == null) return null;

            var latest = await _db.QueryFirstOrDefaultAsync<Model_Lab_ComponentMovement>(@"
                SELECT * FROM Lab_ComponentMovements
                WHERE ComponentId = @ComponentId
                ORDER BY MovedAt DESC, Id DESC LIMIT 1", new { ComponentId = componentId });
            if (latest == null) return null;
            if (latest.Id != movementId)
                throw new InvalidOperationException(
                    $"Movement {movementId} is not the latest for component {componentId}; " +
                    "only the most recent move can be undone.");

            if (_db.State != ConnectionState.Open) _db.Open();
            using var tx = _db.BeginTransaction();
            try
            {
                await _db.ExecuteAsync("DELETE FROM Lab_ComponentMovements WHERE Id = @Id",
                    new { latest.Id }, tx);

                var restoredMachineId = latest.FromMachineId;
                var restoredStatus = restoredMachineId.HasValue ? StatusActive
                    : IsRetiredStatus(component.Status) ? component.Status
                    : StatusSpare;

                await _db.ExecuteAsync(@"
                    UPDATE Lab_Components SET CurrentMachineId = @MachineId, Status = @Status, UpdatedAt = @Now
                    WHERE Id = @ComponentId",
                    new { MachineId = restoredMachineId, Status = restoredStatus, Now = DateTime.UtcNow, ComponentId = componentId }, tx);

                tx.Commit();
                return latest;
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        }

        public async Task<IEnumerable<Model_Lab_ComponentMovement>> GetMovementsForComponentAsync(int componentId)
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
                WHERE mv.ComponentId = @ComponentId
                ORDER BY mv.MovedAt DESC, mv.Id DESC";

            return await _db.QueryAsync<Model_Lab_ComponentMovement>(sql, new { ComponentId = componentId });
        }

        // The whole ledger, raw columns only — the cloud sync projection.
        public async Task<IEnumerable<Model_Lab_ComponentMovement>> GetAllMovementsAsync()
        {
            const string sql = @"
                SELECT * FROM Lab_ComponentMovements
                ORDER BY MovedAt ASC, Id ASC";
            return await _db.QueryAsync<Model_Lab_ComponentMovement>(sql);
        }
    }
}
