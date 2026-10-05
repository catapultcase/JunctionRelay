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

using System.Text;
using System.Text.Json;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    // Lab module (HOMELAB) — parameterised reads for the MCP `lab_query` tool.
    //
    // Rendering is ASCII and deliberately terse: the consuming assistant truncates tool
    // results at a fixed character budget, so verbosity is spent where it is useful.
    //
    // The rule is adaptive detail: a query that lands on ONE machine or ONE component
    // returns every field for it; a query that matches many returns one line each plus a
    // count. That way "tell me about the NAS" is rich and "list all storage" still fits.
    //
    // the tool surface was GENERAL-PURPOSE-ONLY by design, but incomplete —
    // `limit` capped results with no way to ask for the rest, so a set larger than one page
    // was simply unreachable. An assistant asked to total 157 components re-queried the same
    // first page repeatedly, then did the arithmetic itself on partial data and produced two
    // contradictory totals an hour apart. The fix is four general primitives, none of which
    // encode a particular question:
    //
    //   offset   — walk any result set of any size
    //   fields   — project only the columns asked for, so more rows fit the budget
    //   groupBy  — aggregate server-side, where the arithmetic is exact
    //   format   — tsv, roughly half the characters of the prose rendering
    //
    // Aggregation deliberately returns a FIXED set of measures (count, msrp, paid, plus
    // coverage) rather than an expression language. A richer `agg=` would mean a richer
    // parameter schema, and see the warning in Service_Lab_MCP_Tools about what tool schemas
    // do to llama.cpp-backed runtimes. Fixed measures answer valuation, census and coverage
    // questions without the server knowing what any of them mean.
    //
    // no date reached the tool. the assistant, asked for "price observations for
    // categories bought in the last 90 days", had no acquired column and no date parameter, so
    // the question was unanswerable short of reading every part's detail view. `acquiredSince` is
    // ONE date floor, the same fixed-measure discipline as groupBy - no ranges, no expression
    // language. 50 of 1,122 live rows carry no AcquiredAt, concentrated in exactly the categories a
    // price question asks about (storage, CPU, board, memory, GPU), so a bare floor would drop them
    // silently and answer "bought in the last 90 days" confidently wrong. Rows without a date are
    // EXCLUDED and COUNTED: the scope line says how many in scope had none. The same line counts
    // retired rows, because only shelfOnly excludes them - a plain query includes sold parts.
    public class Service_Lab_Query
    {
        // A page size, not a wall — `offset` walks past it. Raised from 40 alongside the
        // consumer's character budget; with `fields` projection a 100-row page still fits.
        private const int MaxRenderedRows = 100;

        // Column names accepted by `fields`. Anything unrecognised is reported rather than
        // ignored, so a typo cannot silently return a narrower row than the caller thinks.
        private static readonly string[] KnownFields =
        {
            // The surrogate key. It is here because lab_record_market_value REQUIRES a
            // componentId, documented as "from lab_query" - without it here that write path
            // would be unreachable.
            // Names are not a substitute: two machines can hold the same part.
            "id",
            "name", "type", "machine", "status", "spec", "nickname",
            "msrp", "list", "paid", "serial", "sku", "notes",
            // Latest row from the Lab_MarketValues ledger. Deliberately separate from msrp
            // (launch) and list (the invoice's list at purchase) - three different questions.
            "market", "marketdate", "marketsource",
            // When the part was acquired (AcquiredAt). Blank when unknown - and acquiredSince
            // counts those rather than hiding them.
            "acquired"
        };

        private readonly Service_Database_Manager_Lab_Machines _machinesDb;
        private readonly Service_Database_Manager_Lab_Components _componentsDb;
        private readonly Service_Database_Manager_Lab_MarketValues _marketDb;

        public Service_Lab_Query(
            Service_Database_Manager_Lab_Machines machinesDb,
            Service_Database_Manager_Lab_Components componentsDb,
            Service_Database_Manager_Lab_MarketValues marketDb)
        {
            _machinesDb = machinesDb;
            _componentsDb = componentsDb;
            _marketDb = marketDb;
        }

        // Latest observation per component, fetched once per query rather than per row.
        private Dictionary<int, Model_Lab_MarketValue> _latestMarket = new();

        public async Task<string> QueryAsync(
            string? machine,
            string? componentType,
            string? search,
            bool shelfOnly,
            int limit,
            int offset = 0,
            string? fields = null,
            string? groupBy = null,
            string? format = null,
            DateTime? acquiredSince = null)
        {
            if (limit <= 0) limit = 25;
            if (limit > MaxRenderedRows) limit = MaxRenderedRows;
            if (offset < 0) offset = 0;

            var tsv = string.Equals(format, "tsv", StringComparison.OrdinalIgnoreCase);

            var selected = ParseFields(fields, out var unknownFields);
            if (unknownFields.Count > 0)
                return $"Unknown field(s): {string.Join(", ", unknownFields)}. " +
                       $"Valid fields: {string.Join(", ", KnownFields)}.";

            var machines = (await _machinesDb.GetAllMachinesAsync()).ToList();

            // Aggregation runs over the filtered component set and takes precedence over the
            // single-machine detail path: `groupBy=machine` is a question about the whole
            // fleet, and `machine=x groupBy=type` is a coherent narrowing of it.
            if (!string.IsNullOrWhiteSpace(groupBy))
            {
                var key = groupBy!.Trim().ToLowerInvariant();
                if (key is not ("machine" or "type" or "status"))
                    return $"Unknown groupBy '{groupBy}'. Valid: machine, type, status.";

                var (forAgg, aggUndated) = await LoadComponentsAsync(componentType, shelfOnly, search, machine, acquiredSince);
                if (forAgg.Count == 0) return DescribeEmpty(componentType, search, shelfOnly, acquiredSince, aggUndated);

                return RenderAggregate(forAgg, key, componentType, search, shelfOnly, machine, tsv, acquiredSince, aggUndated);
            }

            // A named machine is the most specific question available — answer it fully.
            if (!string.IsNullOrWhiteSpace(machine))
            {
                var matches = machines
                    .Where(m => m.Name.Contains(machine, StringComparison.OrdinalIgnoreCase)
                             || (m.Hostname ?? "").Contains(machine, StringComparison.OrdinalIgnoreCase))
                    .ToList();

                if (matches.Count == 0)
                    return $"No machine matches '{machine}'. Known machines: " +
                           string.Join(", ", machines.Select(m => m.Name));

                if (matches.Count > 1)
                    return $"'{machine}' matches {matches.Count} machines: " +
                           string.Join(", ", matches.Select(m => m.Name)) +
                           ". Ask again with one name.";

                // An explicit `fields=` asks for columns, so honour it rather than
                // returning the narrative view. This is also the only route to a component
                // id for a whole machine, which is exactly how the market-value write path
                // gets used: read the ids for a box, then record a price against each.
                // A date floor is a filter the narrative view cannot show, so it takes the list.
                if (selected.Count == 0 && acquiredSince == null)
                    return RenderMachineDetail(matches[0], componentType);

                var (machineComponents, machineUndated) =
                    await LoadComponentsAsync(componentType, shelfOnly, search, matches[0].Name, acquiredSince);

                if (machineComponents.Count == 0)
                    return DescribeEmpty(componentType, search, shelfOnly, acquiredSince, machineUndated);

                if (selected.Any(f => f.StartsWith("market")))
                    _latestMarket = await _marketDb.GetLatestPerComponentAsync();

                return RenderComponentList(machineComponents, limit, offset, selected, tsv,
                                           componentType, search, shelfOnly, _latestMarket, acquiredSince, machineUndated);
            }

            // Otherwise this is a component search.
            var (components, undated) = await LoadComponentsAsync(componentType, shelfOnly, search, null, acquiredSince);

            if (components.Count == 0) return DescribeEmpty(componentType, search, shelfOnly, acquiredSince, undated);

            // One hit means the user asked about a specific part — give them everything.
            // Paging past it would be nonsense, so only do this on the first page.
            // ⚠️ The detail view must carry market values too. Asking about ONE part - the
            // most natural way to ask - lands here, and MSRP, list and paid without the
            // market ledger would silently omit half the answer.
            // ...unless columns were asked for. A projection is a machine-readable request
            // and the detail view would silently drop it.
            if (components.Count == 1 && offset == 0 && selected.Count == 0)
            {
                var history = (await _marketDb.GetForComponentAsync(components[0].Id)).ToList();
                return RenderComponentDetail(components[0], history);
            }

            // One query for the whole page rather than one per row.
            if (selected.Any(f => f.StartsWith("market")))
                _latestMarket = await _marketDb.GetLatestPerComponentAsync();

            return RenderComponentList(components, limit, offset, selected, tsv,
                                       componentType, search, shelfOnly, _latestMarket, acquiredSince, undated);
        }

        // Shared by the list and aggregate paths so a total can never be computed over a
        // different set than the rows it claims to summarise.
        // Returns the rows and, when acquiredSince is given, how many rows in scope were dropped
        // for having no AcquiredAt - counted AFTER every other filter so the number matches the
        // scope the caller asked about.
        private async Task<(List<Model_Lab_Component> Rows, int Undated)> LoadComponentsAsync(
            string? componentType, bool shelfOnly, string? search, string? machine, DateTime? acquiredSince)
        {
            var components = (await _componentsDb.GetAllComponentsAsync(
                type: string.IsNullOrWhiteSpace(componentType) ? null : componentType,
                machineId: shelfOnly ? 0 : null)).ToList();

            // ⛔ "On the shelf" MUST mean on the shelf AND usable. machineId:0 only means
            // "not installed in a machine", which a sold, dead, lost or disposed part also
            // satisfies - so shelfOnly was answering "what is not in a machine" while the web
            // UI puts those same parts in the Graveyard, a different place entirely. Two models
            // for one dataset, and an agent only ever saw the looser one.
            //
            // Measured: a shelfOnly sweep offered a SOLD Kingston A400 and a DEAD
            // MS30 as replacement candidates, twice in one evening. A sold part is not on the
            // shelf; it is not in the building.
            // On-order parts (incoming) are not in the building either.
            if (shelfOnly)
                components = components
                    .Where(c => !Service_Database_Manager_Lab_Components.IsRetiredStatus(c.Status)
                                && c.Status != Service_Database_Manager_Lab_Components.StatusIncoming)
                    .ToList();

            if (!string.IsNullOrWhiteSpace(search))
                components = components.Where(c => Matches(c, search!)).ToList();

            if (!string.IsNullOrWhiteSpace(machine))
                components = components
                    .Where(c => Contains(c.CurrentMachineName, machine!))
                    .ToList();

            var undated = 0;
            if (acquiredSince is DateTime floor)
            {
                undated = components.Count(c => c.AcquiredAt == null);
                components = components.Where(c => c.AcquiredAt?.Date >= floor.Date).ToList();
            }

            return (components, undated);
        }

        private static string DescribeEmpty(string? componentType, string? search, bool shelfOnly,
                                            DateTime? acquiredSince = null, int undated = 0)
        {
            var what = new List<string>();
            if (!string.IsNullOrWhiteSpace(componentType)) what.Add($"type '{componentType}'");
            if (!string.IsNullOrWhiteSpace(search)) what.Add($"matching '{search}'");
            if (shelfOnly) what.Add("on the shelf");
            if (acquiredSince is DateTime f) what.Add($"acquired since {f:yyyy-MM-dd}");
            var tail = undated > 0 ? $" {undated} in scope excluded: no acquired date." : "";
            return "No components found" + (what.Count > 0 ? " for " + string.Join(", ", what) : "") + "." + tail;
        }

        // The scope a list or a total was computed over, in one place so the two cannot drift.
        // The undated and retired counts are what a caller cannot see from the rows themselves.
        private static List<string> ScopeParts(List<Model_Lab_Component> rows, string? machine, string? type,
                                               string? search, bool shelfOnly, DateTime? acquiredSince, int undated)
        {
            var scope = new List<string>();
            if (!string.IsNullOrWhiteSpace(machine)) scope.Add($"machine '{machine}'");
            if (!string.IsNullOrWhiteSpace(type)) scope.Add(type!);
            if (!string.IsNullOrWhiteSpace(search)) scope.Add($"'{search}'");
            if (shelfOnly) scope.Add("shelf only");
            if (acquiredSince is DateTime f)
            {
                scope.Add($"acquired since {f:yyyy-MM-dd}");
                if (undated > 0) scope.Add($"{undated} in scope excluded: no acquired date");
            }
            var retired = rows.Count(c => Service_Database_Manager_Lab_Components.IsRetiredStatus(c.Status));
            if (retired > 0) scope.Add($"{retired} retired included");
            return scope;
        }

        private static List<string> ParseFields(string? fields, out List<string> unknown)
        {
            unknown = new List<string>();
            var selected = new List<string>();
            if (string.IsNullOrWhiteSpace(fields)) return selected;

            foreach (var raw in fields!.Split(',', StringSplitOptions.RemoveEmptyEntries))
            {
                var f = raw.Trim().ToLowerInvariant();
                if (f.Length == 0) continue;
                if (KnownFields.Contains(f)) { if (!selected.Contains(f)) selected.Add(f); }
                else unknown.Add(raw.Trim());
            }

            return selected;
        }

        // ⚠️ Notes is included deliberately. It carries the PROVENANCE of a purchase - order
        // numbers, vendors, "after certs", "+ ship/sig", "whereabouts unknown" - and while it
        // was unsearchable a query for cert/voucher/coupon/rebate returned nothing at all.
        // That reads as "the data is clean" when it means "nothing looked".
        private static bool Matches(Model_Lab_Component c, string term) =>
            Contains(c.Manufacturer, term) || Contains(c.Model, term) ||
            Contains(c.Nickname, term) || Contains(c.SerialNumber, term) ||
            Contains(c.Sku, term) || Contains(c.Spec, term) ||
            Contains(c.Type, term) || Contains(c.CurrentMachineName, term) ||
            Contains(c.Notes, term);

        private static bool Contains(string? haystack, string needle) =>
            !string.IsNullOrEmpty(haystack) &&
            haystack.Contains(needle, StringComparison.OrdinalIgnoreCase);

        private static string RenderMachineDetail(Model_Lab_Machine m, string? componentTypeFilter)
        {
            var sb = new StringBuilder();
            sb.Append(m.Name.ToUpperInvariant());
            if (!string.IsNullOrWhiteSpace(m.Role)) sb.Append(" - ").Append(m.Role);
            sb.AppendLine();

            AppendField(sb, "Kind", m.Kind);
            AppendField(sb, "Hostname", m.Hostname);
            AppendField(sb, "OS", m.OS);
            AppendField(sb, "IP", m.IPAddress);
            AppendField(sb, "Location", m.Location);
            AppendField(sb, "Status", m.Status);
            AppendField(sb, "Always-on", m.AlwaysOn ? "yes" : "no");
            AppendField(sb, "Notes", m.Notes);

            var parts = m.InstalledComponents;
            if (!string.IsNullOrWhiteSpace(componentTypeFilter))
            {
                parts = parts
                    .Where(c => string.Equals(c.Type, componentTypeFilter, StringComparison.OrdinalIgnoreCase))
                    .ToList();
            }

            sb.AppendLine();
            sb.Append("INSTALLED (").Append(parts.Count).AppendLine(")");

            foreach (var c in parts.OrderBy(c => c.Type, StringComparer.OrdinalIgnoreCase))
            {
                sb.Append("- ").Append(c.Type).Append(": ").Append(Label(c));
                if (!string.IsNullOrWhiteSpace(c.Spec)) sb.Append(" [").Append(c.Spec).Append(']');
                AppendPricing(sb, c);
                sb.AppendLine();
            }

            if (parts.Count == 0)
            {
                sb.AppendLine("(none recorded)");
                return sb.ToString();
            }

            // A machine total answers "what is this worth" in one call. Without it the
            // assistant has to query every component separately and then add up - which it
            // did, badly, reporting two parts as having no MSRP when all of them did.
            var priced = parts.Where(c => c.Msrp.HasValue).ToList();
            var paidKnown = parts.Where(c => c.PurchasePrice.HasValue).ToList();

            if (priced.Count > 0 || paidKnown.Count > 0)
            {
                sb.AppendLine();
                sb.Append("VALUE:");
                if (priced.Count > 0) sb.Append(" MSRP ").Append(Money(priced.Sum(c => c.Msrp!.Value)));
                if (paidKnown.Count > 0) sb.Append(" | paid ").Append(Money(paidKnown.Sum(c => c.PurchasePrice!.Value)));

                // State the coverage, so a partial total is never read as complete.
                sb.Append(" (").Append(priced.Count).Append(" of ").Append(parts.Count)
                  .Append(" have MSRP");
                if (paidKnown.Count != parts.Count)
                    sb.Append(", ").Append(paidKnown.Count).Append(" have a purchase price");
                sb.AppendLine(")");
            }

            return sb.ToString();
        }

        private static string RenderComponentDetail(Model_Lab_Component c,
                                                    List<Model_Lab_MarketValue>? market = null)
        {
            var sb = new StringBuilder();
            sb.Append(Label(c)).Append(" (").Append(c.Type).AppendLine(")");

            AppendField(sb, "Spec", c.Spec);
            AppendField(sb, "Location", c.CurrentMachineName ?? "shelf");
            AppendField(sb, "Status", c.Status);
            AppendField(sb, "Serial", c.SerialNumber);
            AppendField(sb, "SKU", c.Sku);
            AppendField(sb, "Released", c.ReleaseDate);
            AppendField(sb, "MSRP", Money(c.Msrp));
            AppendField(sb, "List price", Money(c.ListPrice) +
                (string.IsNullOrWhiteSpace(c.ListPriceDate) ? "" : $" (as of {c.ListPriceDate})"));
            AppendField(sb, "Paid", Money(c.PurchasePrice));

            // Latest observation, plus the depth of the series so the history is
            // discoverable rather than hidden behind an endpoint nobody knows to call.
            if (market is { Count: > 0 })
            {
                var latest = market[0];                       // manager returns newest first
                var bits = new List<string>();
                if (!string.IsNullOrWhiteSpace(latest.Condition)) bits.Add(latest.Condition!);
                if (!string.IsNullOrWhiteSpace(latest.Source)) bits.Add(latest.Source!);
                bits.Add(latest.CapturedAt.ToString("yyyy-MM-dd"));
                AppendField(sb, "Market", $"{Money(latest.Value)} ({string.Join(", ", bits)})");

                if (market.Count > 1)
                {
                    var oldest = market[^1];
                    AppendField(sb, "Market history",
                        $"{market.Count} observations, {Money(oldest.Value)} on {oldest.CapturedAt:yyyy-MM-dd} -> " +
                        $"{Money(latest.Value)} on {latest.CapturedAt:yyyy-MM-dd}");
                }
                if (!string.IsNullOrWhiteSpace(latest.SourceUrl))
                    AppendField(sb, "Market source", latest.SourceUrl);
            }
            AppendField(sb, "Acquired", c.AcquiredAt?.ToString("yyyy-MM-dd"));
            AppendField(sb, "Vendor", c.Vendor);
            AppendField(sb, "Condition", c.Source);
            AppendField(sb, "Warranty", c.WarrantyYears.HasValue ? $"{c.WarrantyYears} yr" : null);
            if (c.AttachmentCount > 0) AppendField(sb, "Files", c.AttachmentCount.ToString());
            AppendField(sb, "Notes", c.Notes);

            // Typed spec fields carry detail the display string omits (cores, VRAM, ECC…).
            foreach (var kv in ParseSpecJson(c))
                AppendField(sb, kv.Key, kv.Value);

            return sb.ToString();
        }

        private static string RenderComponentList(
            List<Model_Lab_Component> components, int limit, int offset,
            List<string> selected, bool tsv,
            string? type, string? search, bool shelfOnly,
            Dictionary<int, Model_Lab_MarketValue>? market = null,
            DateTime? acquiredSince = null, int undated = 0)
        {
            var sb = new StringBuilder();

            var scope = ScopeParts(components, null, type, search, shelfOnly, acquiredSince, undated);

            var page = components.Skip(offset).Take(limit).ToList();
            var shownTo = offset + page.Count;

            sb.Append(components.Count).Append(" components");
            if (scope.Count > 0) sb.Append(" (").Append(string.Join(", ", scope)).Append(')');
            if (offset > 0 || shownTo < components.Count)
                sb.Append(" - showing ").Append(offset + 1).Append('-').Append(shownTo);
            sb.AppendLine();

            if (page.Count == 0)
            {
                sb.Append("Offset ").Append(offset).Append(" is past the end of ")
                  .Append(components.Count).AppendLine(" results.");
                return sb.ToString();
            }

            if (selected.Count > 0)
            {
                // Projection: header row then one record per line. TSV by request, otherwise
                // the same columns joined readably - either way only what was asked for.
                var sep = tsv ? "\t" : " | ";
                sb.AppendLine(string.Join(sep, selected));
                foreach (var c in page)
                    sb.AppendLine(string.Join(sep, selected.Select(f => FieldValue(c, f, market) ?? "")));
            }
            else if (tsv)
            {
                sb.AppendLine(string.Join('\t', "name", "type", "machine", "spec", "status", "paid"));
                foreach (var c in page)
                    sb.AppendLine(string.Join('\t',
                        Label(c), c.Type ?? "", c.CurrentMachineName ?? "shelf",
                        c.Spec ?? "", c.Status ?? "", Money(c.PurchasePrice) ?? ""));
            }
            else
            {
                foreach (var c in page)
                {
                    sb.Append("- ").Append(Label(c));
                    if (!string.IsNullOrWhiteSpace(c.Spec)) sb.Append(", ").Append(c.Spec);
                    sb.Append(" @ ").Append(c.CurrentMachineName ?? "shelf");
                    if (!string.Equals(c.Status, "active", StringComparison.OrdinalIgnoreCase))
                        sb.Append(" [").Append(c.Status).Append(']');
                    sb.AppendLine();
                }
            }

            // Never truncate silently — and always say how to get the rest. Before `offset`
            // existed this line could only suggest narrowing, which is why a caller wanting
            // the whole set had no move except to re-ask the same question.
            if (shownTo < components.Count)
                sb.Append("... ").Append(components.Count - shownTo)
                  .Append(" more. Continue with offset=").Append(shownTo)
                  .AppendLine(", or use groupBy to total them without listing.");

            return sb.ToString();
        }

        // Fixed measures, deliberately. See the class comment: an expression language here
        // would mean a richer tool schema, and the schema is the thing that breaks runtimes.
        private static string RenderAggregate(
            List<Model_Lab_Component> components, string key,
            string? type, string? search, bool shelfOnly, string? machine, bool tsv,
            DateTime? acquiredSince = null, int undated = 0)
        {
            var sb = new StringBuilder();

            // What it is worth counts what is here: on-order parts stay out of the machine and type totals,
            // and the scope line says how many (groupBy=status shows them on their own line).
            var onOrder = key == "status" ? 0 : components.Count(c => c.Status == Service_Database_Manager_Lab_Components.StatusIncoming);
            if (onOrder > 0) components = components.Where(c => c.Status != Service_Database_Manager_Lab_Components.StatusIncoming).ToList();

            var scope = ScopeParts(components, machine, type, search, shelfOnly, acquiredSince, undated);
            if (onOrder > 0) scope.Add($"{onOrder} on order not counted");

            sb.Append("TOTALS by ").Append(key);
            if (scope.Count > 0) sb.Append(" (").Append(string.Join(", ", scope)).Append(')');
            sb.AppendLine();

            var groups = components
                .GroupBy(c => key switch
                {
                    "machine" => c.CurrentMachineName ?? "shelf",
                    "type" => string.IsNullOrWhiteSpace(c.Type) ? "(untyped)" : c.Type!,
                    _ => string.IsNullOrWhiteSpace(c.Status) ? "(no status)" : c.Status!
                })
                .OrderBy(g => g.Key, StringComparer.OrdinalIgnoreCase)
                .ToList();

            var sep = tsv ? "\t" : " | ";
            sb.Append(string.Join(sep, "group", "count", "msrp", "paid", "coverage")).AppendLine();

            foreach (var g in groups)
                sb.AppendLine(string.Join(sep, AggregateRow(g.Key, g.ToList())));

            if (groups.Count > 1)
                sb.AppendLine(string.Join(sep, AggregateRow("ALL", components)));

            return sb.ToString();
        }

        // Coverage travels with every total. A sum over the parts that happen to carry a
        // price is not the value of the set, and a caller cannot tell the difference unless
        // it is stated - the same reason RenderMachineDetail reports its own coverage.
        private static string[] AggregateRow(string label, List<Model_Lab_Component> items)
        {
            var priced = items.Where(c => c.Msrp.HasValue).ToList();
            var paid = items.Where(c => c.PurchasePrice.HasValue).ToList();

            return new[]
            {
                label,
                items.Count.ToString(),
                priced.Count > 0 ? Money(priced.Sum(c => c.Msrp!.Value))! : "-",
                paid.Count > 0 ? Money(paid.Sum(c => c.PurchasePrice!.Value))! : "-",
                $"{priced.Count}/{items.Count} msrp, {paid.Count}/{items.Count} paid"
            };
        }

        private static string? FieldValue(Model_Lab_Component c, string field,
                                          Dictionary<int, Model_Lab_MarketValue>? market = null) => field switch
        {
            "id" => c.Id.ToString(),
            "name" => Label(c),
            "type" => c.Type,
            "machine" => c.CurrentMachineName ?? "shelf",
            "status" => c.Status,
            "spec" => c.Spec,
            "nickname" => c.Nickname,
            "msrp" => Money(c.Msrp),
            "list" => Money(c.ListPrice),
            "paid" => Money(c.PurchasePrice),
            "serial" => c.SerialNumber,
            "sku" => c.Sku,
            // Flattened: a newline inside a projected row would break TSV and the
            // one-record-per-line contract the caller is relying on.
            "notes" => c.Notes?.Replace("\r", " ").Replace("\n", " "),
            "market" => Latest(c, market) is { } m ? Money(m.Value) : null,
            "marketdate" => Latest(c, market)?.CapturedAt.ToString("yyyy-MM-dd"),
            "marketsource" => Latest(c, market)?.Source,
            "acquired" => c.AcquiredAt?.ToString("yyyy-MM-dd"),
            _ => null
        };

        // Pricing on every component line, not just the single-component view. A machine
        // query is how "what is this worth" gets asked, and omitting it forces the caller
        // into one round trip per part.
        private static void AppendPricing(StringBuilder sb, Model_Lab_Component c)
        {
            var bits = new List<string>();
            if (c.Msrp.HasValue) bits.Add("msrp " + Money(c.Msrp));
            if (c.ListPrice.HasValue) bits.Add("list " + Money(c.ListPrice));
            if (c.PurchasePrice.HasValue) bits.Add("paid " + Money(c.PurchasePrice));

            // Integrated silicon carries no price of its own - the parent board does. Say
            // so explicitly rather than leaving a blank that reads as missing data.
            if (bits.Count == 0)
            {
                if (!string.IsNullOrWhiteSpace(c.SpecJson) &&
                    c.SpecJson!.Contains("integratedWith", StringComparison.OrdinalIgnoreCase))
                    sb.Append(" - price n/a (integrated)");
                return;
            }

            sb.Append(" - ").Append(string.Join(", ", bits));
        }

        private static string Label(Model_Lab_Component c)
        {
            var basis = string.Join(" ", new[] { c.Manufacturer, c.Model }
                .Where(s => !string.IsNullOrWhiteSpace(s)));
            if (string.IsNullOrWhiteSpace(basis)) basis = c.Type;
            return string.IsNullOrWhiteSpace(c.Nickname) ? basis : $"{basis} \"{c.Nickname}\"";
        }

        private static Model_Lab_MarketValue? Latest(Model_Lab_Component c,
                                                     Dictionary<int, Model_Lab_MarketValue>? market)
            => market != null && market.TryGetValue(c.Id, out var m) ? m : null;

        private static string? Money(double? v) => v.HasValue ? v.Value.ToString("0.##") : null;

        private static void AppendField(StringBuilder sb, string label, string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return;
            sb.Append(label).Append(": ").AppendLine(value.Trim());
        }

        private static IEnumerable<KeyValuePair<string, string>> ParseSpecJson(Model_Lab_Component c)
        {
            if (string.IsNullOrWhiteSpace(c.SpecJson)) yield break;

            Dictionary<string, JsonElement>? parsed = null;
            try
            {
                parsed = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(c.SpecJson!);
            }
            catch (JsonException)
            {
                // Malformed SpecJson is a data problem, not a reason to fail the whole query.
            }

            if (parsed == null) yield break;

            foreach (var kv in parsed)
            {
                var text = kv.Value.ValueKind switch
                {
                    JsonValueKind.String => kv.Value.GetString(),
                    JsonValueKind.Number => kv.Value.ToString(),
                    JsonValueKind.True => "yes",
                    JsonValueKind.False => "no",
                    _ => null
                };

                if (!string.IsNullOrWhiteSpace(text))
                    yield return new KeyValuePair<string, string>(kv.Key, text!);
            }
        }
    }
}
