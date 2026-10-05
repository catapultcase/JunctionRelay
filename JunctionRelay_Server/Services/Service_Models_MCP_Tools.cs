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

using System.ComponentModel;
using System.Text;
using JunctionRelayServer.Models;
using ModelContextProtocol.Server;

namespace JunctionRelayServer.Services
{
    // Models module (MODELS) — MCP tool surface. Self-contained alongside the rest of
    // the module: removing this file plus its DI registration removes the tools. Shares
    // the /mcp endpoint and key with the Lab tools — same box, same trust boundary.
    //
    // This is the true-state replacement for the prose model docs: what is archived,
    // what holds which slot, and what was measured.
    //
    // ⚠️ Do not add regex validation attributes to tool parameters. Tool schemas are
    // converted to a constrained grammar by llama.cpp-backed runtimes, which reject any
    // unanchored `pattern` and fail the whole request — not just the offending tool.
    [McpServerToolType]
    public sealed class Service_Models_MCP_Tools
    {
        private readonly IServiceScopeFactory _scopeFactory;

        public Service_Models_MCP_Tools(IServiceScopeFactory scopeFactory)
        {
            _scopeFactory = scopeFactory;
        }

        // ------------------------------------------------------------------
        // Rendering helpers — one line per row, adaptive detail like lab_query:
        // a single match renders every field, a list renders one line each.
        // ------------------------------------------------------------------

        private static string RenderEntryLine(Model_Models_CatalogEntry e,
                                              Dictionary<int, string> nameById)
        {
            var parts = new List<string> { $"[{e.Id}] {e.Name}" };
            if (e.ParamsB.HasValue) parts.Add($"{e.ParamsB:0.#}B");
            if (!string.IsNullOrWhiteSpace(e.Architecture))
                parts.Add(e.ActiveParamsB.HasValue ? $"{e.Architecture} {e.ActiveParamsB:0.#}B active" : e.Architecture);
            if (!string.IsNullOrWhiteSpace(e.ReleaseDate)) parts.Add($"released {e.ReleaseDate}");
            if (!string.IsNullOrWhiteSpace(e.Quant)) parts.Add(e.Quant!);
            if (e.ContextLength.HasValue) parts.Add($"{e.ContextLength / 1024}K ctx");
            if (!string.IsNullOrWhiteSpace(e.KvCachePrecision)) parts.Add($"kv {e.KvCachePrecision}");
            if (e.SizeGb.HasValue) parts.Add($"{e.SizeGb:0.##}GB");
            parts.Add(e.Status);
            if (e.SupersededById.HasValue)
                parts.Add($"superseded by {(nameById.TryGetValue(e.SupersededById.Value, out var n) ? n : $"#{e.SupersededById}")}");
            return string.Join(" | ", parts);
        }

        private static string RenderEntryFull(Model_Models_CatalogEntry e,
                                              Dictionary<int, string> nameById)
        {
            var sb = new StringBuilder();
            sb.AppendLine($"[{e.Id}] {e.Name} ({e.Status})");
            if (!string.IsNullOrWhiteSpace(e.Family)) sb.AppendLine($"  family: {e.Family}");
            if (e.ParamsB.HasValue) sb.AppendLine($"  params: {e.ParamsB:0.#}B");
            if (!string.IsNullOrWhiteSpace(e.Architecture))
                sb.AppendLine($"  architecture: {e.Architecture}" + (e.ActiveParamsB.HasValue ? $" - {e.ActiveParamsB:0.#}B active per token" : ""));
            if (!string.IsNullOrWhiteSpace(e.ReleaseDate)) sb.AppendLine($"  released: {e.ReleaseDate}");
            if (!string.IsNullOrWhiteSpace(e.Quant)) sb.AppendLine($"  quant: {e.Quant}");
            var quantRows = RenderQuants(e.QuantsJson);
            if (!string.IsNullOrWhiteSpace(quantRows))
            {
                sb.AppendLine("  quants held (⚠️ the size below is their TOTAL, not any one of them):");
                sb.Append(quantRows);
            }
            if (e.ContextLength.HasValue) sb.AppendLine($"  context: {e.ContextLength} tokens");
            if (!string.IsNullOrWhiteSpace(e.KvCachePrecision)) sb.AppendLine($"  kv cache: {e.KvCachePrecision}");
            if (e.SizeGb.HasValue) sb.AppendLine($"  size: {e.SizeGb:0.##} GB (measured)");
            if (!string.IsNullOrWhiteSpace(e.TraitsJson)) sb.AppendLine($"  traits: {e.TraitsJson}");
            if (!string.IsNullOrWhiteSpace(e.StorageLocation)) sb.AppendLine($"  stored: {e.StorageLocation}");
            if (e.SupersededById.HasValue)
                sb.AppendLine($"  superseded by: {(nameById.TryGetValue(e.SupersededById.Value, out var n) ? n : $"#{e.SupersededById}")}");
            if (!string.IsNullOrWhiteSpace(e.Notes)) sb.AppendLine($"  notes: {e.Notes}");
            return sb.ToString().TrimEnd();
        }

        // ⚠️ Accept a boolean written either way. An MCP client caches the tool
        // schema it connected with, so a client older than a new bool parameter
        // has no type for it and sends the STRING "true" - which a bool?
        // parameter rejects with an unhandled JsonException (hit
        // adding mtp/vision here). The value is unambiguous either way, and
        // refusing it only punishes a client for being older than the server.
        private static bool? AsBool(System.Text.Json.JsonElement? e)
        {
            if (e == null) return null;
            var v = e.Value;
            switch (v.ValueKind)
            {
                case System.Text.Json.JsonValueKind.True: return true;
                case System.Text.Json.JsonValueKind.False: return false;
                case System.Text.Json.JsonValueKind.String:
                    return bool.TryParse(v.GetString(), out var b) ? b : (bool?)null;
                case System.Text.Json.JsonValueKind.Number:
                    return v.TryGetInt32(out var i) ? i != 0 : (bool?)null;
                default: return null;
            }
        }

        // The quants held, each with its own size and capability. ⛔ WITHOUT THIS the
        // catalog can only say "we own six quants of this" and "131 GB in total" - so
        // "how big is the Q4_K_XL?" and "does this quant have MTP?" were unanswerable,
        // including for the mtp flag the matrix now depends on.
        private static string RenderQuants(string? quantsJson)
        {
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(quantsJson ?? "[]");
                if (doc.RootElement.ValueKind != System.Text.Json.JsonValueKind.Array) return "";
                var sb = new StringBuilder();
                foreach (var q in doc.RootElement.EnumerateArray())
                {
                    var name = q.TryGetProperty("quant", out var n) ? n.GetString() : null;
                    if (string.IsNullOrWhiteSpace(name)) continue;
                    var bits = new List<string>();
                    if (q.TryGetProperty("sizeGb", out var g) && g.TryGetDouble(out var gb))
                        bits.Add($"{gb:0.##} GB");
                    // Absent means UNCHECKED, and that is not the same as false.
                    if (q.TryGetProperty("mtp", out var m))
                        bits.Add(m.ValueKind == System.Text.Json.JsonValueKind.True
                            ? "MTP in the weights" : "no MTP in the weights");
                    sb.AppendLine($"    - {name}{(bits.Count > 0 ? " · " + string.Join(" · ", bits) : "")}");
                }
                return sb.ToString();
            }
            catch { return ""; }
        }

        private static string Short(string? s, int n) =>
            string.IsNullOrWhiteSpace(s) ? "" : (s!.Length <= n ? s : s[..(n - 1)] + "…");

        // The SETUP a row was measured under, as one readable line. Everything
        // here decides the number, so an agent reading it can explain a result
        // without being shown the page.
        private static string SetupOf(Model_Models_Benchmark b)
        {
            var p = new List<string>();
            if (!string.IsNullOrWhiteSpace(b.Quant)) p.Add(b.Quant!);
            if (b.ContextTokens.HasValue) p.Add($"{b.ContextTokens / 1024}K ctx");
            p.Add(b.Slots.HasValue ? $"{b.Slots} slots" : "4 slots");
            p.Add($"kv {(string.IsNullOrWhiteSpace(b.KvPrecision) ? "f16 (default)" : b.KvPrecision)}");
            if (b.Mtp == true) p.Add("MTP");
            if (b.Vision == true) p.Add("vision");
            if (b.Vision == false) p.Add("no vision");
            if (b.WeightsGb.HasValue) p.Add($"{b.WeightsGb:0.#} GB weights");
            // Placement - the part that explains an order-of-magnitude gap.
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(b.ConfigJson ?? "{}");
                var r = doc.RootElement;
                if (r.TryGetProperty("n_cpu_moe", out var moe)) p.Add($"experts→RAM ({moe})");
                if (r.TryGetProperty("load_mode", out var lm))
                {
                    var v = lm.GetString();
                    p.Add(v == "none" ? "resident (no mmap)" : $"mmap ({v})");
                }
                if (r.TryGetProperty("tensor_split", out var ts)) p.Add($"split {ts.GetString()}");
                if (r.TryGetProperty("ubatch", out var ub)) p.Add($"ub {ub}");
                if (r.TryGetProperty("tensor_overrides", out var ov) && ov.ValueKind == System.Text.Json.JsonValueKind.Array)
                    p.Add("-ot " + string.Join(",", ov.EnumerateArray().Select(x => x.GetString())));
            }
            catch { /* extras are optional */ }
            if (!string.IsNullOrWhiteSpace(b.Engine)) p.Add($"engine {b.Engine}");
            if (!string.IsNullOrWhiteSpace(b.Thinking)) p.Add($"thinking {b.Thinking}");
            return string.Join(" · ", p);
        }

        // Same, from a stored configJson alone (fit verdicts have no row).
        private static string SetupOf(string? configJson)
        {
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(configJson ?? "{}");
                var r = doc.RootElement;
                var p = new List<string>();
                foreach (var name in new[] { "quant", "ctx", "cache_k", "parallel", "spec_type",
                                             "n_cpu_moe", "load_mode", "tensor_split", "ubatch" })
                    if (r.TryGetProperty(name, out var v))
                        p.Add($"{name}={v}");
                return p.Count > 0 ? string.Join(" · ", p) : "(no config recorded)";
            }
            catch { return "(no config recorded)"; }
        }

        // Group a model's rows into (machine × setup) cells and render the
        // headline figures with the setup that earned them.
        private static string RenderSetups(List<Model_Models_Benchmark> rows,
                                           Dictionary<int, string> machineNames)
        {
            if (rows.Count == 0) return "";
            var sb = new StringBuilder();
            var groups = rows
                .Where(b => b.MachineId.HasValue)
                .GroupBy(b => (mach: b.MachineId!.Value, setup: SetupOf(b)))
                .OrderBy(g => machineNames.TryGetValue(g.Key.mach, out var n) ? n : "")
                .ToList();
            if (groups.Count == 0) return "";
            sb.AppendLine("  measured (latest per setup):");
            foreach (var g in groups)
            {
                var box = machineNames.TryGetValue(g.Key.mach, out var n) ? n : $"#{g.Key.mach}";
                double? Latest(string metric, string? scen = null) => g
                    .Where(b => b.Metric == metric && (scen == null || b.Scenario == scen))
                    .OrderByDescending(b => b.CapturedAt).Select(b => (double?)b.Value).FirstOrDefault();

                // Contract v3: scenarios are prompt depths. The three matrix rungs.
                var (each, tot, nStreams) = Streams(g);
                var w = Latest("gpu_watts_avg", "32k") ?? Latest("gpu_watts_avg", "4k");
                var vram = Latest("vram_gb");
                var disk = Latest("disk_read_mbs");

                var bits = new List<string>();
                foreach (var rung in LadderRungs)
                {
                    var rp = Latest("prompt_tok_s", rung); var rg = Latest("gen_tok_s", rung);
                    if (rp.HasValue || rg.HasValue) bits.Add($"{rung} {rp:0} / {rg:0.#}");
                    else if (Latest("rung_failed", rung).HasValue) bits.Add($"{rung} FAILED");
                }
                if (each.HasValue || tot.HasValue) bits.Add(StreamsText(each, tot, nStreams, false));
                if (w.HasValue) bits.Add($"{w:0} W");
                if (vram.HasValue) bits.Add($"{vram:0.#} GB VRAM");
                // The paging tell: RAM-resident reads ~0, an SSD-paged run reads
                // hundreds of MB/s and runs an order of magnitude slower.
                if (disk.HasValue) bits.Add(disk >= 50 ? $"⚠ PAGING FROM DISK {disk:0} MB/s" : $"disk {disk:0.#} MB/s");
                var when = g.Max(b => b.CapturedAt);

                sb.AppendLine($"    {box}: {string.Join(" · ", bits)}  ({when:yyyy-MM-dd})");
                sb.AppendLine($"      setup: {g.Key.setup}");
            }
            return sb.ToString();
        }

        private static async Task<Dictionary<int, string>> MachineNamesAsync(IServiceScope scope)
        {
            var machines = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Lab_Machines>();
            return (await machines.GetAllMachinesAsync()).ToDictionary(m => m.Id, m => m.Name);
        }

        // ------------------------------------------------------------------
        // Tools
        // ------------------------------------------------------------------

        [McpServerTool(Name = "models_query")]
        [Description("The model catalog, serving map and measurements. No arguments = " +
                     "every model with its serving assignments. 'search' narrows by " +
                     "name/family/quant/notes; exactly one match returns the full record, " +
                     "its serving slots and recent benchmarks. status filters the catalog " +
                     "(active, archived, superseded). Use this instead of recalling model " +
                     "facts from prose docs - this is the true state.")]
        public async Task<string> ModelsQueryAsync(
            [Description("Free text matched against name, family, quant, traits and notes.")]
            string? search = null,
            [Description("Catalog status filter: active, archived or superseded.")]
            string? status = null,
            [Description("Machine name, full or partial. Returns what that box serves.")]
            string? machine = null)
        {
            using var scope = _scopeFactory.CreateScope();
            var catalog = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_Catalog>();
            var serving = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_Serving>();
            var benchmarks = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_Benchmarks>();

            var entries = (await catalog.GetAllAsync()).ToList();
            var nameById = entries.ToDictionary(e => e.Id, e => e.Name);
            var machineNames = await MachineNamesAsync(scope);
            var assignments = (await serving.GetAllAsync()).ToList();

            if (!string.IsNullOrWhiteSpace(status))
                entries = entries.Where(e => e.Status.Equals(status, StringComparison.OrdinalIgnoreCase)).ToList();

            if (!string.IsNullOrWhiteSpace(machine))
            {
                var machineIds = machineNames
                    .Where(kv => kv.Value.Contains(machine, StringComparison.OrdinalIgnoreCase))
                    .Select(kv => kv.Key).ToHashSet();
                if (machineIds.Count == 0) return $"No machine matching '{machine}'.";
                var modelIds = assignments.Where(a => a.MachineId.HasValue && machineIds.Contains(a.MachineId.Value))
                                          .Select(a => a.ModelId).ToHashSet();
                entries = entries.Where(e => modelIds.Contains(e.Id)).ToList();
            }

            if (!string.IsNullOrWhiteSpace(search))
            {
                bool Hit(string? s) => s != null && s.Contains(search, StringComparison.OrdinalIgnoreCase);
                entries = entries.Where(e => Hit(e.Name) || Hit(e.Family) || Hit(e.Quant) ||
                                             Hit(e.Architecture) || Hit(e.TraitsJson) || Hit(e.Notes)).ToList();
            }

            if (entries.Count == 0) return "No models match. The catalog may simply not have rows yet - add them with models_add_model.";

            string ServingLine(Model_Models_ServingAssignment a, int notesMax)
            {
                var box = a.MachineId.HasValue && machineNames.TryGetValue(a.MachineId.Value, out var n) ? n : "untracked box";
                // The assignment id leads the line: models_set_serving can only CHANGE a
                // row by servingId; without it here 'default' could only be flipped in
                // the web UI, and creating without an id would duplicate.
                var bits = new List<string> { $"#{a.Id}", box };
                if (a.EndpointPort.HasValue) bits.Add($":{a.EndpointPort}");
                bits.Add(a.Mode);
                // ⛔ WHAT THE SLOT SERVES. The cloud mirror rendered this and the local
                // server - which owns the data - did not, so an agent on the box could
                // see WHICH alias a machine runs but not at what quant or window.
                // Never read these off the catalog: it is a CHECKPOINT and
                // lists every quant owned of it.
                var setup = new List<string>();
                if (!string.IsNullOrWhiteSpace(a.Quant)) setup.Add(a.Quant!);
                if (a.ContextTokens.HasValue) setup.Add($"{a.ContextTokens / 1024}K");
                if (!string.IsNullOrWhiteSpace(a.KvPrecision)) setup.Add($"kv {a.KvPrecision}");
                if (a.Slots.HasValue) setup.Add($"{a.Slots} slots");
                if (a.Mtp == true) setup.Add("MTP");
                if (!string.IsNullOrWhiteSpace(a.Thinking)) setup.Add($"thinking {a.Thinking}");
                if (a.Vision == true) setup.Add("vision");
                if (a.WeightsGb.HasValue) setup.Add($"{a.WeightsGb:0.#} GB");
                if (!string.IsNullOrWhiteSpace(a.Engine)) setup.Add(a.Engine!);
                if (a.SharedKv == true) setup.Add("each stream the whole window, shared pool" + (a.PoolTokens.HasValue ? $" {a.PoolTokens / 1024}K" : ""));
                if (setup.Count > 0) bits.Add("[" + string.Join(" · ", setup) + "]");
                if (a.SharesWith.HasValue) bits.Add($"preset of #{a.SharesWith} (same process, no extra load)");
                if (a.OnCard) bits.Add(string.IsNullOrWhiteSpace(a.CardLabel) ? $"on card #{a.CardOrder}" : $"on card as '{a.CardLabel}' #{a.CardOrder}");
                if (!string.IsNullOrWhiteSpace(a.Alias)) bits.Add($"as '{a.Alias}'");
                if (a.IsDefault) bits.Add("default");
                if (a.Status != "active") bits.Add(a.Status);
                // ⚠️ The notes say whether a row is live, planned or a fallback. Without
                // them a pair's planned bake-off rows read as one machine running all
                // three models.
                if (!string.IsNullOrWhiteSpace(a.Notes)) bits.Add($"- {Short(a.Notes, notesMax)}");
                return string.Join(" ", bits);
            }

            // One match: full record + serving + recent measurements.
            if (entries.Count == 1)
            {
                var e = entries[0];
                var sb = new StringBuilder();
                sb.AppendLine(RenderEntryFull(e, nameById));

                var slots = assignments.Where(a => a.ModelId == e.Id).ToList();
                if (slots.Count > 0)
                {
                    sb.AppendLine("  serving:");
                    foreach (var a in slots) sb.AppendLine($"    - {ServingLine(a, int.MaxValue)}");
                }

                // ⚠️ Rolled up per (machine × SETUP), not a flat list of numbers.
                // A bare list cannot say which run a figure came from, that two
                // KV variants of the same quant exist, or why one is slower -
                // so an agent had to be shown a screenshot to hold a
                // conversation about results.
                var rows = (await benchmarks.GetForModelAsync(e.Id)).ToList();
                sb.Append(RenderSetups(rows, machineNames));

                var verdicts = (await scope.ServiceProvider
                        .GetRequiredService<Service_Database_Manager_Models_FitVerdicts>()
                        .GetAllAsync())
                    .Where(v => v.ModelId == e.Id).ToList();
                if (verdicts.Count > 0)
                {
                    sb.AppendLine("  will NOT load:");
                    foreach (var v in verdicts)
                    {
                        var box = machineNames.TryGetValue(v.MachineId, out var vn) ? vn : $"#{v.MachineId}";
                        sb.AppendLine($"    {box}: {Short(v.Reason, 120)}");
                        sb.AppendLine($"      attempted: {SetupOf(v.ConfigJson)}");
                    }
                }

                var scores = (await scope.ServiceProvider
                        .GetRequiredService<Service_Database_Manager_Models_ReferenceScores>()
                        .GetAllAsync())
                    .Where(r => r.ModelId == e.Id).OrderBy(r => r.Benchmark).ToList();
                if (scores.Count > 0)
                {
                    sb.AppendLine("  published scores (the checkpoint, NOT the quant served):");
                    foreach (var r in scores)
                    {
                        // ⚠️ Provenance first: it decides how much the number is worth.
                        var cond = new List<string>();
                        if (!string.IsNullOrWhiteSpace(r.Provenance)) cond.Add(r.Provenance!);
                        else cond.Add("provenance unestablished");
                        if (!string.IsNullOrWhiteSpace(r.EvaluatedPrecision)) cond.Add(r.EvaluatedPrecision!);
                        if (!string.IsNullOrWhiteSpace(r.Scaffold)) cond.Add(r.Scaffold!);
                        if (r.EvaluatedContextTokens.HasValue) cond.Add($"{r.EvaluatedContextTokens / 1024}K ctx");
                        sb.AppendLine($"    {r.Benchmark} {r.Score:0.##} [{string.Join(" · ", cond)}] - {r.Source}"
                                      + (string.IsNullOrWhiteSpace(r.Notes) ? "" : $" ({Short(r.Notes, 80)})"));
                    }
                }
                return sb.ToString().TrimEnd();
            }

            // Many: one line each, with serving boxes appended.
            var outSb = new StringBuilder();
            outSb.AppendLine($"{entries.Count} model(s):");
            foreach (var e in entries)
            {
                var slots = assignments.Where(a => a.ModelId == e.Id && a.Status == "active").ToList();
                var line = RenderEntryLine(e, nameById);
                if (slots.Count > 0)
                    line += " | serves: " + string.Join(", ", slots.Select(a => ServingLine(a, 160)));
                outSb.AppendLine(line);
            }
            return outSb.ToString().TrimEnd();
        }


        // ⛔ THE CATALOG IS MODELS, NEVER CONFIGURATIONS. This is the guard for the
        // mistake that keeps recurring: naming a catalog entry after a serving id, so
        // one downloaded model sprouts an entry per quant/window/flag. Returns the
        // reason a name is config-shaped, or null if the name names a model.
        private static string? ConfigShapedName(string name)
        {
            var n = name.Trim().ToLowerInvariant();
            if (System.Text.RegularExpressions.Regex.IsMatch(n, @"-\d+k(-|$)"))
                return "it carries a context window";
            if (n.EndsWith("-mtp") || n.Contains("-mtp-"))
                return "it carries an MTP flag";
            if (System.Text.RegularExpressions.Regex.IsMatch(n, @"-(iq\d|q\d)(_[a-z0-9]+)*(-[a-z]+)?$"))
                return "it carries a quant tier";
            if (System.Text.RegularExpressions.Regex.IsMatch(n, @"-(f16|bf16|fp8|nvfp4)$"))
                return "it carries a precision";
            return null;
        }

        // The identity of a SETUP, for asking whether a cell has been measured.
        // Same fields the matrix keys its rows on - a different quant, window,
        // KV precision, slot count, MTP or vision setting is a different cell,
        // not a newer number for the same one.
        // The metrics the SPEED matrix owns. Anything else is a scored result from
        // some other suite and belongs in its own section - matched explicitly so
        // a new metric never silently lands in a throughput column.
        private static readonly HashSet<string> SpeedMetrics = new(StringComparer.OrdinalIgnoreCase)
        {
            "gen_tok_s", "prompt_tok_s", "gen_tok_s_aggregate",
            "gpu_watts_avg", "vram_gb", "cold_load_s", "disk_read_mbs",
            "vram_shared_gb",   // the Windows paging tell
            "ttft_s", "draft_accept",   // contract v3: per depth rung
            "llb_pp512", "llb_tg128",   // v3.1: llama-bench's own numbers at the rung's depth
            "rung_failed",   // a rung attempted and dead: value 1, the engine's cause in notes
        };
        // Every rung of the v3 ladder. The digest printed three (4k/32k/128k) and a
        // measured 256k rung was invisible to every MCP reader.
        private static readonly string[] LadderRungs = { "4k", "16k", "32k", "64k", "128k", "256k" };
        private static readonly System.Text.RegularExpressions.Regex StreamsScenario = new(@"^\d+k_x(\d+)$");
        // The newest `<depth>_xN` run: each, total and N. The suite runs as many streams as it
        // was told - a 1-slot entry runs one - so N is read, never assumed to be 4 (a 4k_x1 run
        // would print an empty "each" and a total under an "x4" label).
        private static (double? each, double? tot, int? n) Streams(IEnumerable<Model_Models_Benchmark> rows)
        {
            var run = rows.Where(b => b.Scenario != null && StreamsScenario.IsMatch(b.Scenario)
                                      && (b.Metric == "gen_tok_s" || b.Metric == "gen_tok_s_aggregate"))
                          .OrderByDescending(b => b.CapturedAt).ToList();
            if (run.Count == 0) return (null, null, null);
            var scen = run[0].Scenario!;
            var n = int.Parse(StreamsScenario.Match(scen).Groups[1].Value);
            double? Of(string metric) => run.Where(b => b.Scenario == scen && b.Metric == metric)
                                            .Select(b => (double?)b.Value).FirstOrDefault();
            return (Of("gen_tok_s"), Of("gen_tok_s_aggregate"), n);
        }
        // One stream is the 4k rung again and its total counts the prefill: not a concurrency figure.
        private static string StreamsText(double? each, double? tot, int? n, bool words) =>
            n == 1 ? "x1 n/a (1 slot)"
            : words ? $"x{n} {each:0.#} each / {tot:0.#} total" : $"x{n} {each:0.#}/{tot:0.#}";
        private static bool IsSpeedMetric(string? m) => m != null && SpeedMetrics.Contains(m);

        // A suite names itself in configJson.suite; the metric suffix is the column.
        private static string SuiteOf(Model_Models_Benchmark b)
        {
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(b.ConfigJson ?? "{}");
                if (doc.RootElement.TryGetProperty("suite", out var su))
                {
                    var v = su.GetString();
                    if (!string.IsNullOrWhiteSpace(v)) return v!;
                }
            }
            catch { }
            var i = (b.Metric ?? "").IndexOf('_');
            return i > 0 ? b.Metric![..i] : (b.Metric ?? "unknown");
        }

        private static string ColumnOf(string metric)
        {
            var i = metric.IndexOf('_');
            return i > 0 ? metric[(i + 1)..] : metric;
        }

        // What actually FAILED, when the suite said so. A bare "75%" tells the
        // reader a quarter went wrong and gives them no way to find out what,
        // short of opening a transcript on the box that ran it. Absent is
        // normal - not every bench knows its cases by name.
        private static List<string> FailuresOf(string? configJson)
        {{
            var outp = new List<string>();
            if (string.IsNullOrWhiteSpace(configJson)) return outp;
            try
            {{
                using var doc = System.Text.Json.JsonDocument.Parse(configJson);
                if (!doc.RootElement.TryGetProperty("failures", out var f)
                    || f.ValueKind != System.Text.Json.JsonValueKind.Array) return outp;
                foreach (var el in f.EnumerateArray())
                {{
                    var id = el.TryGetProperty("case", out var c) ? c.GetString() : null;
                    var why = el.TryGetProperty("why", out var w) ? w.GetString() : null;
                    if (!string.IsNullOrWhiteSpace(id))
                        outp.Add(string.IsNullOrWhiteSpace(why) ? id! : $"{id} — {why}");
                }}
            }}
            catch {{ /* spillover bag: malformed is not fatal */ }}
            return outp;
        }}

        private static List<string> DeclaredColumns(string? configJson)
        {
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(configJson ?? "{}");
                if (doc.RootElement.TryGetProperty("suite_columns", out var c)
                    && c.ValueKind == System.Text.Json.JsonValueKind.Array)
                    return c.EnumerateArray().Select(x => x.GetString() ?? "").Where(x => x != "").ToList();
            }
            catch { }
            return new List<string>();
        }

        private static int? CasesOf(string? configJson)
        {
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(configJson ?? "{}");
                if (doc.RootElement.TryGetProperty("cases", out var c) && c.TryGetInt32(out var n)) return n;
            }
            catch { }
            return null;
        }

        // Tuning facts from configJson that move the number without changing the
        // setup's name: the GPU split and the ubatch (so split variants of one
        // entry never land in one cell). Absent = "".
        private static string TuningOf(Model_Models_Benchmark b)
        {
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(b.ConfigJson ?? "{}");
                var r = doc.RootElement;
                var split = r.TryGetProperty("tensor_split", out var s) ? s.ToString() : "";
                var ub = r.TryGetProperty("ubatch", out var u) ? u.ToString() : "";
                // The placement (expert layers in RAM) is identity too: three REAP
                // placements at one window collapsed into one cell.
                var moe = r.TryGetProperty("n_cpu_moe", out var m) ? m.ToString() : "";
                return split + "|" + ub + "|" + moe;
            }
            catch { return "|"; }
        }

        private static string CellKey(Model_Models_Benchmark b) => string.Join("|",
            b.ModelName ?? "", b.Quant ?? "", b.ContextTokens?.ToString() ?? "",
            b.KvPrecision ?? "", b.Slots?.ToString() ?? "", b.Mtp?.ToString() ?? "",
            b.Vision?.ToString() ?? "",
            // ⛔ ENGINE IS PART OF THE CELL. Without it two builds of the same
            // config collapse and the newest wins - which hid a deliberate A/B
            // the day this shipped: Flash-Next measured 29.5 tok/s on b10662 and
            // 26.1 on b10639, and the matrix showed only the 26.1, silently
            // discarding the 12% difference that decided which engine to keep.
            b.Engine ?? "",
            TuningOf(b));

        // Does this refusal actually describe THIS setup? A verdict records the
        // config it was taken under; quant and context window are what decide
        // whether it fits, so those are what must agree. When the verdict cannot
        // be parsed we fall back to covering the model on that box - the old
        // behaviour - because claiming a cell is untested when a refusal may
        // apply is the worse error.
        private static bool VerdictCovers(string? configJson, Model_Models_Benchmark row)
        {
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(configJson ?? "{}");
                var r = doc.RootElement;
                if (r.TryGetProperty("quant", out var q) && row.Quant != null)
                {
                    var vq = q.GetString() ?? "";
                    // NVFP4 verdicts record the family, rows record the tier.
                    if (!row.Quant.StartsWith(vq, StringComparison.OrdinalIgnoreCase)
                        && !vq.StartsWith(row.Quant, StringComparison.OrdinalIgnoreCase))
                        return false;
                }
                if (r.TryGetProperty("ctx", out var c) && row.ContextTokens.HasValue
                    && c.TryGetInt32(out var ctx) && ctx != row.ContextTokens.Value)
                    return false;
                return true;
            }
            catch { return true; }
        }

        // The part of a setup that MOVES BETWEEN BOXES - no engine build, no offload
        // dial. Used for gaps only; a measurement still keys on the full setup,
        // because two engines really are two different results.
        private static string GapKey(Model_Models_Benchmark b) => string.Join("|",
            b.ModelName ?? "", b.Quant ?? "", b.ContextTokens?.ToString() ?? "",
            b.KvPrecision ?? "", b.Slots?.ToString() ?? "", b.Mtp?.ToString() ?? "",
            b.Vision?.ToString() ?? "");

        // The same thing, readable - what to ask the other box for.
        private static string PortableSetupOf(Model_Models_Benchmark b)
        {
            var p = new List<string>();
            if (!string.IsNullOrWhiteSpace(b.Quant)) p.Add(b.Quant!);
            if (b.ContextTokens.HasValue) p.Add($"{b.ContextTokens / 1024}K ctx");
            p.Add(b.Slots.HasValue ? $"{b.Slots} slots" : "4 slots");
            p.Add($"kv {(string.IsNullOrWhiteSpace(b.KvPrecision) ? "f16 (default)" : b.KvPrecision)}");
            if (b.Mtp == true) p.Add("MTP");
            if (b.Vision == true) p.Add("vision");
            if (b.Vision == false) p.Add("no vision");
            return string.Join(" · ", p);
        }

        // Where the weights actually sat. An order of magnitude lives here, so        // Where the weights actually sat. An order of magnitude lives here, so
        // setups from different regimes must never be read as comparable.
        private static string RegimeOf(IEnumerable<Model_Models_Benchmark> cell)
        {
            var disk = cell.Where(b => b.Metric == "disk_read_mbs")
                           .Select(b => (double?)b.Value).FirstOrDefault();
            if (disk >= 50) return "paged from SSD";
            // The Windows tell: the driver spilled part of llama-server into system
            // RAM - no error, no disk read, and a cliff (measured on a
            // 5090: 0.65 GB shared ran at full speed, 1.1 GB cost 35% of generation
            // and 50% of prefill, 4.9 GB cost 93% / 98%).
            var any = cell.FirstOrDefault();
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(any?.ConfigJson ?? "{}");
                // A chosen offload's pinned host buffers ALSO count as "shared" on Windows
                // (12 expert layers in RAM read 9.6 GB shared and ran at 97 tok/s), so the
                // paging test only applies to setups that place nothing in RAM on purpose.
                if (doc.RootElement.TryGetProperty("n_cpu_moe", out _)) return "MoE experts in system RAM";
            }
            catch { }
            var shared = cell.Where(b => b.Metric == "vram_shared_gb")
                             .OrderByDescending(b => b.CapturedAt)
                             .Select(b => (double?)b.Value).FirstOrDefault();
            if (shared >= 0.8) return "paged to system RAM (Windows)";
            return "all in VRAM";
        }

        [McpServerTool(Name = "models_benchmarks")]
        [Description("The fleet's measured performance as the MATRIX, in one call - what the " +
                     "Benchmarks page shows, without reassembling it model by model. Every " +
                     "measured cell (model x setup x machine) with the deep-context tok/s (the " +
                     "honest working figure), prefill, the 4-stream pair, watts and VRAM, plus " +
                     "the setup that earned it. Grouped by context window and by PLACEMENT " +
                     "REGIME - all-in-VRAM, experts in system RAM, and paged from SSD are an " +
                     "order of magnitude apart and are never comparable across groups. Ends " +
                     "with the refusals (proven not to load, with the engine's own reason) and " +
                     "the gaps (measured on one box, never attempted on another) so 'what is " +
                     "left to bench' is answerable without reading the page.")]
        public async Task<string> ModelsBenchmarksAsync(
            [Description("Machine name filter, full or partial. Optional.")]
            string? machine = null,
            [Description("Model name filter, full or partial. Optional.")]
            string? model = null)
        {
            using var scope = _scopeFactory.CreateScope();
            var benchmarks = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_Benchmarks>();
            var machineNames = await MachineNamesAsync(scope);

            var everything = (await benchmarks.GetAllAsync()).ToList();
            // ⛔ A SCORE IS NOT A SPEED. Intelligence rows share this table and are
            // separated by metric, exactly as the contract says - averaging a pass
            // rate into a tok/s column would be meaningless. They also keep rows
            // with NO machine, which a hosted model posts.
            var scored = everything.Where(b => !IsSpeedMetric(b.Metric)).ToList();
            var all = everything.Where(b => b.MachineId.HasValue && IsSpeedMetric(b.Metric)).ToList();
            var verdicts = (await scope.ServiceProvider
                .GetRequiredService<Service_Database_Manager_Models_FitVerdicts>().GetAllAsync()).ToList();
            // A verdict keys on the CATALOG id; a benchmark row keys on its own
            // model name and need not be catalogued at all. Resolve one to the
            // other so both can be read side by side.
            var nameById = (await scope.ServiceProvider
                .GetRequiredService<Service_Database_Manager_Models_Catalog>().GetAllAsync())
                .ToDictionary(e => e.Id, e => e.Name);
            string VName(int id) => nameById.TryGetValue(id, out var n) ? n : $"#{id}";

            string Box(int id) => machineNames.TryGetValue(id, out var n) ? n : $"#{id}";

            if (!string.IsNullOrWhiteSpace(model))
            {
                all = all.Where(b => (b.ModelName ?? "").Contains(model, StringComparison.OrdinalIgnoreCase)).ToList();
                verdicts = verdicts.Where(v => VName(v.ModelId).Contains(model, StringComparison.OrdinalIgnoreCase)).ToList();
            }
            if (!string.IsNullOrWhiteSpace(machine))
            {
                all = all.Where(b => Box(b.MachineId!.Value).Contains(machine, StringComparison.OrdinalIgnoreCase)).ToList();
                verdicts = verdicts.Where(v => Box(v.MachineId).Contains(machine, StringComparison.OrdinalIgnoreCase)).ToList();
            }

            // SCORED ROWS COUNT AS MEASUREMENTS. Filtered the same way, and
            // counted before declaring nothing matches: a model measured only
            // for reasoning - every hosted model is - reported "nothing has
            // been benchmarked" while its rows sat in the table.
            if (!string.IsNullOrWhiteSpace(model))
                scored = scored.Where(b => (b.ModelName ?? "").Contains(model, StringComparison.OrdinalIgnoreCase)).ToList();
            if (!string.IsNullOrWhiteSpace(machine))
                scored = scored.Where(b => b.MachineId.HasValue
                    && Box(b.MachineId.Value).Contains(machine, StringComparison.OrdinalIgnoreCase)).ToList();

            if (all.Count == 0 && verdicts.Count == 0 && scored.Count == 0)
                return "No measurements match. Nothing has been benchmarked under those filters.";

            var sb = new StringBuilder();
            sb.AppendLine("Fleet matrix - latest run per cell (model x setup x machine).");
            sb.AppendLine("Bands: generation >=50 tok/s green, 30-50 amber, below 30 red. Prefill >=2000 tok/s green, 1000-2000 amber, below 1000 red.");
            sb.AppendLine("Scenarios are prompt depths (contract v3): '4k 1,560 / 64' = at a 4K-token prompt, prefill 1,560 tok/s, then 64 tok/s generating (tg128). Every rung the window allows is shown; '256k FAILED' = attempted and died (the cause is on the web matrix). xN = N concurrent streams at 4k (four unless it says otherwise), each / total; 'x1 n/a' = a 1-slot setup, no concurrency to measure.");
            sb.AppendLine();

            // cell = one (machine x setup) measurement of one model name.
            var cells = all.GroupBy(b => (b.MachineId!.Value, key: CellKey(b))).ToList();

            foreach (var ctxGroup in cells
                .GroupBy(c => c.First().ContextTokens ?? 0)
                .OrderBy(g => g.Key))
            {
                foreach (var regimeGroup in ctxGroup
                    .GroupBy(c => RegimeOf(c))
                    .OrderBy(g => g.Key == "all in VRAM" ? 0 : g.Key == "MoE experts in system RAM" ? 1 : 2))
                {
                    var ctxLabel = ctxGroup.Key > 0 ? $"{ctxGroup.Key / 1024}K context" : "context not recorded";
                    sb.AppendLine($"== {ctxLabel} - {regimeGroup.Key}");
                    foreach (var cell in regimeGroup.OrderBy(c => c.First().ModelName).ThenBy(c => Box(c.Key.Item1)))
                    {
                        double? Latest(string metric, string? scen = null) => cell
                            .Where(b => b.Metric == metric && (scen == null || b.Scenario == scen))
                            .OrderByDescending(b => b.CapturedAt).Select(b => (double?)b.Value).FirstOrDefault();

                        var bits = new List<string>();
                        foreach (var rung in LadderRungs)
                        {
                            var rp = Latest("prompt_tok_s", rung); var rg = Latest("gen_tok_s", rung);
                            if (rp.HasValue || rg.HasValue) bits.Add($"{rung} {rp:0} / {rg:0.#}");
                            else if (Latest("rung_failed", rung).HasValue) bits.Add($"{rung} FAILED");
                        }
                        var (each, tot, nStreams) = Streams(cell);
                        var w = Latest("gpu_watts_avg", "32k") ?? Latest("gpu_watts_avg", "4k");
                        var vram = Latest("vram_gb");
                        if (each.HasValue || tot.HasValue) bits.Add(StreamsText(each, tot, nStreams, true));
                        if (w.HasValue) bits.Add($"{w:0} W");
                        if (vram.HasValue) bits.Add($"{vram:0.#} GB VRAM");
                        var sharedGb = Latest("vram_shared_gb");
                        if (sharedGb.HasValue) bits.Add(RegimeOf(cell).StartsWith("paged to system RAM") ? $"⚠ {sharedGb:0.0} GB PAGED TO SYSTEM RAM" : $"{sharedGb:0.0} GB shared");

                        var first = cell.First();
                        // The tin, when the rows name one: a role-named machine (Node A) has
                        // been three different boxes; the latest row's Hardware says which.
                        var hw = cell.Where(b => !string.IsNullOrWhiteSpace(b.Hardware))
                            .OrderByDescending(b => b.CapturedAt).Select(b => b.Hardware).FirstOrDefault();
                        sb.AppendLine($"  {first.ModelName} on {Box(cell.Key.Item1)}{(hw != null ? $" ({hw})" : "")}:");
                        sb.AppendLine($"    {string.Join(" · ", bits)}");
                        sb.AppendLine($"    {SetupOf(first)}");
                    }
                    sb.AppendLine();
                }
            }

            // ⛔ A refusal is a RESULT. Without it an agent cannot tell a cell
            // proven not to load from one nobody has tried, and will happily
            // recommend a config the box has already rejected.
            if (verdicts.Count > 0)
            {
                sb.AppendLine("== will NOT load (measured refusals, the engine's own reason)");
                foreach (var v in verdicts.OrderBy(v => VName(v.ModelId)).ThenBy(v => Box(v.MachineId)))
                {
                    sb.AppendLine($"  {VName(v.ModelId)} on {Box(v.MachineId)}: {Short(v.Reason, 140)}");
                    sb.AppendLine($"    attempted: {SetupOf(v.ConfigJson)}");
                }
                sb.AppendLine();
            }

            // The gaps. A setup measured on one box and never attempted on
            // another is the matrix's empty cell - the thing worth benching next.
            var boxes = all.Select(b => b.MachineId!.Value).Distinct().ToList();
            var gaps = new List<string>();
            // ⛔ A GAP IS KEYED ON THE PORTABLE PART OF A SETUP. Engine build and the
            // --n-cpu-moe dial are per-BOX facts: the engine may not be installed on
            // the other machine, and the offload dial is tuned against that machine's
            // own memory, so "the server has not run the desktop's 29-layer split on b10662" is
            // not a cell anyone should fill. Keyed on the full CellKey the list
            // suggested exactly that, three times over for one model.
            foreach (var setup in all.GroupBy(GapKey))
            {
                var first = setup.First();
                var measured = setup.Select(b => b.MachineId!.Value).Distinct().ToHashSet();
                foreach (var m in boxes.Where(m => !measured.Contains(m)))
                {
                    // ⚠️ Match the refusal to the SETUP, not just the model. A
                    // model-level test let one refusal on a box hide every
                    // untested setup for that model there - so a cell nobody had
                    // tried read the same as one proven not to fit.
                    var refused = verdicts.Any(v => v.MachineId == m
                        && VName(v.ModelId) == (first.ModelName ?? "")
                        && VerdictCovers(v.ConfigJson, first));
                    if (!refused) gaps.Add($"  {first.ModelName} on {Box(m)}: {PortableSetupOf(first)}");
                }
            }
            // ── Scored suites ───────────────────────────────────────────────────
            // Everything that is not a throughput metric, grouped by the suite that
            // posted it. ⛔ Keyed on the MODEL and its setup, never the machine: a
            // reasoning score is a property of the weights - the same quant answers
            // the same on either box - and a hosted model has no machine at all.
            foreach (var suiteGroup in scored.GroupBy(SuiteOf).OrderBy(g => g.Key))
            {
                // Columns the suite DECLARES, so a tier that errored out entirely
                // reads as untested instead of vanishing from the table.
                var columns = suiteGroup.SelectMany(b => DeclaredColumns(b.ConfigJson))
                    .Concat(suiteGroup.Select(b => ColumnOf(b.Metric)))
                    .Distinct().OrderBy(c => c).ToList();

                sb.AppendLine();
                sb.AppendLine($"== {suiteGroup.Key} - scored results (pass rate %, not speed)");
                foreach (var row in suiteGroup
                    .GroupBy(b => (b.ModelName, b.Quant, b.ContextTokens))
                    .OrderBy(g => g.Key.ModelName))
                {
                    var latest = row.GroupBy(b => ColumnOf(b.Metric))
                        .ToDictionary(g => g.Key, g => g.OrderByDescending(b => b.CapturedAt).First());
                    // ⚠️ Case-weighted, never a mean of rates: a five-case tier and a
                    // twenty-case tier do not deserve equal say.
                    double weighted = 0, cases = 0;
                    foreach (var kv in latest)
                    {
                        var n = CasesOf(kv.Value.ConfigJson) ?? 1;
                        weighted += kv.Value.Value * n; cases += n;
                    }
                    var overall = cases > 0 ? (double?)(weighted / cases) : null;
                    var ran = latest.Count;
                    var first = row.First();
                    var box = first.MachineId.HasValue ? Box(first.MachineId.Value) : "hosted";
                    var setup = string.Join(" · ", new[] { row.Key.Quant,
                        row.Key.ContextTokens.HasValue ? $"{row.Key.ContextTokens / 1024}K" : null, box }
                        .Where(x => !string.IsNullOrWhiteSpace(x)));
                    sb.AppendLine($"  {row.Key.ModelName} [{setup}]"
                        + (overall.HasValue ? $" - overall {overall:0.#}%" : "")
                        + (ran < columns.Count
                            ? $"  ⚠ PARTIAL: {ran}/{columns.Count} columns ran, NOT comparable with a full run"
                            : ""));
                    foreach (var c in columns)
                        sb.AppendLine(latest.TryGetValue(c, out var hit)
                            ? $"      {c}: {hit.Value:0.#}%  ({CasesOf(hit.ConfigJson)?.ToString() ?? "?"} cases)"
                            : $"      {c}: — untested");
                    // The failures under the column they belong to.
                    foreach (var c in columns)
                        if (latest.TryGetValue(c, out var fh))
                            foreach (var f in FailuresOf(fh.ConfigJson))
                                sb.AppendLine($"          ✗ {c}/{f}");
                }
            }

            if (gaps.Count > 0)
            {
                sb.AppendLine("== untested (measured elsewhere, never attempted here - the cells left to fill)");
                foreach (var g in gaps.OrderBy(g => g)) sb.AppendLine(g);
            }

            return sb.ToString();
        }

        // ------------------------------------------------------------------
        // Reports: one setup's numbers OVER TIME, the Reports page as text.
        // The matrix answers "what is true now"; this answers "did the box get
        // faster" - across engine builds, KV changes and hardware swaps. Runs are
        // the suite's own batches (rows posted within ten minutes of each other),
        // oldest first, with the engine named on every run and a marker where it
        // changed, so a jump is never read as a hardware gain when it was a build.
        // ------------------------------------------------------------------
        private static List<List<Model_Models_Benchmark>> RunsOf(IEnumerable<Model_Models_Benchmark> rows)
        {
            var runs = new List<List<Model_Models_Benchmark>>();
            List<Model_Models_Benchmark>? cur = null;
            foreach (var b in rows.OrderBy(b => b.CapturedAt))
            {
                if (cur == null || (b.CapturedAt - cur[^1].CapturedAt).TotalMinutes > 10)
                    runs.Add(cur = new List<Model_Models_Benchmark>());
                cur.Add(b);
            }
            return runs;
        }

        private static string ReportSetupKey(Model_Models_Benchmark b) => string.Join("|",
            b.ModelName ?? "", b.Quant ?? "", b.ContextTokens?.ToString() ?? "",
            b.KvPrecision ?? "", b.Slots?.ToString() ?? "", b.Mtp?.ToString() ?? "",
            b.Vision?.ToString() ?? "");

        private static string ReportSetupLabel(Model_Models_Benchmark b)
        {
            var p = new List<string>();
            if (!string.IsNullOrWhiteSpace(b.Quant)) p.Add(b.Quant!);
            if (b.ContextTokens.HasValue) p.Add($"{b.ContextTokens / 1024}K ctx");
            p.Add(b.Slots.HasValue ? $"{b.Slots} slots" : "4 slots");
            p.Add($"kv {(string.IsNullOrWhiteSpace(b.KvPrecision) ? "f16" : b.KvPrecision)}");
            if (b.Mtp == true) p.Add("MTP");
            if (b.Vision == false) p.Add("no vision");
            return string.Join(" · ", p);
        }

        private static string RenderReport(List<Model_Models_Benchmark> speedRows, Func<int, string> box,
                                           string? machine, string model, string? setup)
        {
            var rows = speedRows
                .Where(b => b.MachineId.HasValue
                            && (b.ModelName ?? "").Contains(model, StringComparison.OrdinalIgnoreCase)
                            && (machine == null || box(b.MachineId.Value).Contains(machine, StringComparison.OrdinalIgnoreCase)))
                .ToList();
            if (!string.IsNullOrWhiteSpace(setup))
            {
                var words = setup.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                rows = rows.Where(b => { var l = ReportSetupLabel(b); return words.All(w => l.Contains(w, StringComparison.OrdinalIgnoreCase)); }).ToList();
            }
            if (rows.Count == 0) return "No measured runs match. Nothing has been benchmarked under those filters.";

            var sb = new StringBuilder();
            sb.AppendLine("Report - every run of a setup on a box, oldest first (the Reports page as text).");
            sb.AppendLine("Columns: date · engine · deep prefill / tok/s · review prefill / tok/s · xN total (N streams). A jump on an engine change is the build, not the hardware.");
            sb.AppendLine();
            foreach (var series in rows
                .GroupBy(b => (mach: b.MachineId!.Value, key: ReportSetupKey(b)))
                .OrderBy(g => box(g.Key.mach)).ThenBy(g => g.Key.key))
            {
                var first = series.First();
                sb.AppendLine($"== {first.ModelName} on {box(series.Key.mach)} · {ReportSetupLabel(first)}");
                string? lastEngine = null;
                double? firstGen = null, firstPre = null, lastGen = null, lastPre = null;
                foreach (var run in RunsOf(series))
                {
                    double? Of(string metric, string? scen) => run
                        .Where(b => b.Metric == metric && (scen == null || b.Scenario == scen))
                        .Select(b => (double?)b.Value).FirstOrDefault();
                    var gen = Of("gen_tok_s", "4k"); var pre = Of("prompt_tok_s", "4k");
                    var rgen = Of("gen_tok_s", "128k"); var rpre = Of("prompt_tok_s", "128k");
                    var (_, tot, nStreams) = Streams(run);
                    if (!gen.HasValue && !pre.HasValue) continue;
                    var engine = run.Select(b => b.Engine).FirstOrDefault(e => !string.IsNullOrWhiteSpace(e)) ?? "engine not recorded";
                    if (lastEngine != null && engine != lastEngine)
                        sb.AppendLine($"  -- engine changed: {lastEngine} -> {engine}");
                    lastEngine = engine;
                    var bits = new List<string> { run[0].CapturedAt.ToString("yyyy-MM-dd HH:mm"), engine };
                    bits.Add($"4k {(pre.HasValue ? pre.Value.ToString("0") : "-")} / {(gen.HasValue ? gen.Value.ToString("0.#") : "-")}");
                    if (rgen.HasValue || rpre.HasValue)
                        bits.Add($"128k {(rpre.HasValue ? rpre.Value.ToString("0") : "-")} / {(rgen.HasValue ? rgen.Value.ToString("0.#") : "-")}");
                    if (tot.HasValue) bits.Add(nStreams == 1 ? "x1 n/a (1 slot)" : $"x{nStreams} {tot:0.#}");
                    sb.AppendLine("  " + string.Join(" · ", bits));
                    firstGen ??= gen; firstPre ??= pre; lastGen = gen ?? lastGen; lastPre = pre ?? lastPre;
                }
                if (firstGen.HasValue && lastGen.HasValue && firstGen != lastGen)
                    sb.AppendLine($"  first -> latest: 4k tok/s {firstGen:0.#} -> {lastGen:0.#} ({(lastGen / firstGen - 1) * 100:+0;-0}%)"
                        + (firstPre.HasValue && lastPre.HasValue ? $", prefill {firstPre:0} -> {lastPre:0} ({(lastPre / firstPre - 1) * 100:+0;-0}%)" : ""));
                sb.AppendLine();
            }
            return sb.ToString().TrimEnd();
        }

        [McpServerTool(Name = "models_reports")]
        [Description("One setup's speed OVER TIME on a box - the Reports page as text. Every suite " +
                     "run of that model x setup x machine, oldest first, with the engine build on " +
                     "each run and a marker where it changed, then first-to-latest deltas. Answers " +
                     "'did the box get faster after the hardware / KV / engine change' without " +
                     "reading the matrix twice.")]
        public async Task<string> ModelsReportsAsync(
            [Description("Model name, full or partial. Required.")]
            string model,
            [Description("Machine name filter, full or partial. Optional.")]
            string? machine = null,
            [Description("Setup filter: every word must appear in 'quant · NNK ctx · N slots · kv X · MTP', e.g. 'Q5_K_XL 128K' or 'kv f16'. Optional.")]
            string? setup = null)
        {
            using var scope = _scopeFactory.CreateScope();
            var benchmarks = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_Benchmarks>();
            var machineNames = await MachineNamesAsync(scope);
            var rows = (await benchmarks.GetAllAsync()).Where(b => IsSpeedMetric(b.Metric)).ToList();
            return RenderReport(rows, id => machineNames.TryGetValue(id, out var n) ? n : $"#{id}", machine, model, setup);
        }

        [McpServerTool(Name = "models_add_model")]
        [Description("Add a MODEL WE HAVE DOWNLOADED to the catalog. ⛔ THE CATALOG IS " +
                     "MODELS, NEVER CONFIGURATIONS: one entry " +
                     "per model that exists on disk - 'qwen3.8-27b', 'glm-5.3-flash'. " +
                     "Quant, context window, KV precision, slot count and MTP are ways " +
                     "of RUNNING that model: they belong to the serving map and to a " +
                     "benchmark's configJson, and must never become separate catalog " +
                     "entries. Holding one model at three quants is still ONE entry. " +
                     "⚠️ sizeGb is the MEASURED total on disk (the ls -l / du figure) - " +
                     "never an estimate; omit it rather than guess.")]
        public async Task<string> ModelsAddModelAsync(
            [Description("The model's name, with no configuration in it: 'qwen3.8-27b', " +
                         "not 'qwen3.8-27b-128k-q4-mtp'. Rejected if it carries a quant, " +
                         "window or MTP suffix.")]
            string name,
            [Description("Family/architecture, e.g. 'Qwen3.8', 'whisper-large-v3'.")]
            string? family = null,
            [Description("Parameter count in billions, e.g. 27 or 0.6.")]
            double? paramsB = null,
            [Description("'Dense', 'MoE' or 'Hybrid' - what predicts how it serves. A MoE reads only " +
                         "its active experts per token, so it is faster than a dense of the same " +
                         "total size and tolerates experts in RAM.")]
            string? architecture = null,
            [Description("For a MoE: active parameters per token in billions (35B-A3B -> 3). " +
                         "The figure that predicts generation speed. Omit for a dense.")]
            double? activeParamsB = null,
            [Description("The checkpoint's public release date, 'YYYY-MM-DD' (or 'YYYY-MM') - the " +
                         "upstream publication, not the download.")]
            string? releaseDate = null,
            [Description("Which quants of this model are held on disk, as one descriptive " +
                         "string: 'UD-Q4_K_XL · UD-Q5_K_XL · Q8_0'. NOT a reason to create " +
                         "more entries. Prefer models_sync_catalog, which derives this from " +
                         "the per-quant detail.")]
            string? quant = null,
            [Description("The model's NATIVE context length in tokens - what the checkpoint " +
                         "supports, not the window a box happens to serve it at.")]
            int? contextLength = null,
            [Description("KV cache precision, e.g. 'q8_0' or 'f16'.")]
            string? kvCachePrecision = null,
            [Description("MEASURED weights size in GB. Omit if not measured.")]
            double? sizeGb = null,
            [Description("JSON array of deciding traits, e.g. [\"vision\",\"mtp\"].")]
            string? traitsJson = null,
            [Description("Where the weights live (share path, host folder).")]
            string? storageLocation = null,
            [Description("Workload class: 'Agentic Coding', 'General AI', 'Vision', " +
                         "'Utility'... Drives the Benchmarks browser's grouping.")]
            string? category = null,
            [Description("Anything worth keeping with the entry.")]
            string? notes = null)
        {
            if (string.IsNullOrWhiteSpace(name)) return "Name is required.";

            using var scope = _scopeFactory.CreateScope();
            var catalog = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_Catalog>();

            // Duplicate guard on the serving id — same discipline as the invoice order
            // number: refuse quietly-similar rows before they exist.
            var existing = (await catalog.GetAllAsync())
                .FirstOrDefault(e => e.Name.Equals(name.Trim(), StringComparison.OrdinalIgnoreCase));
            if (existing != null)
                return $"'{existing.Name}' already exists (id {existing.Id}, {existing.Status}). " +
                       "Update it with models_update_model instead of adding a duplicate.";

            var id = await catalog.CreateAsync(new Model_Models_CatalogEntry
            {
                Name = name.Trim(),
                Family = family,
                ParamsB = paramsB,
                Architecture = architecture,
                ActiveParamsB = activeParamsB,
                ReleaseDate = string.IsNullOrWhiteSpace(releaseDate) ? null : releaseDate.Trim(),
                Quant = quant,
                ContextLength = contextLength,
                KvCachePrecision = kvCachePrecision,
                SizeGb = sizeGb,
                TraitsJson = traitsJson,
                StorageLocation = storageLocation,
                Category = category,
                Notes = notes
            });
            return $"Added '{name.Trim()}' to the catalog (id {id}).";
        }

        [McpServerTool(Name = "models_update_model")]
        [Description("Update a catalog entry. Only the fields you pass change. To mark " +
                     "a model superseded, pass status='superseded' and supersededById " +
                     "of its replacement - the chain answers 'what replaced what'.")]
        public async Task<string> ModelsUpdateModelAsync(
            [Description("Catalog id, from models_query.")]
            int modelId,
            [Description("The model's name, if renamed. No configuration in it - see " +
                         "models_add_model.")]
            string? name = null,
            [Description("active, archived or superseded.")]
            string? status = null,
            [Description("Catalog id of the model that replaced this one.")]
            int? supersededById = null,
            [Description("Family/architecture.")]
            string? family = null,
            [Description("Parameter count in billions.")]
            double? paramsB = null,
            [Description("'Dense', 'MoE' or 'Hybrid'.")]
            string? architecture = null,
            [Description("For a MoE: active parameters per token in billions (35B-A3B -> 3).")]
            double? activeParamsB = null,
            [Description("Public release date, 'YYYY-MM-DD' or 'YYYY-MM'; '' clears it.")]
            string? releaseDate = null,
            [Description("Quant tier.")]
            string? quant = null,
            [Description("Served context length in tokens.")]
            int? contextLength = null,
            [Description("KV cache precision.")]
            string? kvCachePrecision = null,
            [Description("MEASURED weights size in GB.")]
            double? sizeGb = null,
            [Description("JSON array of deciding traits. ⚠️ These describe the CHECKPOINT. " +
                         "A quant is not its checkpoint - Flash-Next's checkpoint has MTP and " +
                         "its UD-IQ4_XS quant does not - so per-quant capability belongs in " +
                         "quantsJson, not here.")]
            string? traitsJson = null,
            [Description("JSON array of the quants held: [{\"quant\":\"UD-Q4_K_XL\",\"sizeGb\":17.92," +
                         "\"mtp\":true}]. mtp is what the WEIGHTS carry, read from the GGUF tensor " +
                         "table (LLMSpeedTest/gguf_caps.py), not what the checkpoint supports. " +
                         "Omit mtp when it has not been checked - unknown is not false.")]
            string? quantsJson = null,
            [Description("Where the weights live.")]
            string? storageLocation = null,
            [Description("Workload class: 'Agentic Coding', 'General AI', 'Vision', 'Utility'...")]
            string? category = null,
            [Description("Replaces the notes field entirely when passed.")]
            string? notes = null)
        {
            using var scope = _scopeFactory.CreateScope();
            var catalog = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_Catalog>();

            var entry = await catalog.GetByIdAsync(modelId);
            if (entry == null) return $"No catalog entry with id {modelId}.";

            if (status != null)
            {
                var valid = new[] { "active", "archived", "superseded" };
                if (!valid.Contains(status)) return $"Status must be one of: {string.Join(", ", valid)}.";
                entry.Status = status;
            }
            if (supersededById.HasValue)
            {
                if (supersededById.Value == modelId) return "An entry cannot supersede itself.";
                if (await catalog.GetByIdAsync(supersededById.Value) == null)
                    return $"No catalog entry with id {supersededById.Value} to supersede this one.";
                entry.SupersededById = supersededById;
            }
            if (name != null) entry.Name = name.Trim();
            if (family != null) entry.Family = family;
            if (paramsB.HasValue) entry.ParamsB = paramsB;
            if (architecture != null) entry.Architecture = architecture;
            if (activeParamsB.HasValue) entry.ActiveParamsB = activeParamsB;
            if (releaseDate != null) entry.ReleaseDate = releaseDate.Trim() == "" ? null : releaseDate.Trim();
            if (quant != null) entry.Quant = quant;
            if (contextLength.HasValue) entry.ContextLength = contextLength;
            if (kvCachePrecision != null) entry.KvCachePrecision = kvCachePrecision;
            if (sizeGb.HasValue) entry.SizeGb = sizeGb;
            if (traitsJson != null) entry.TraitsJson = traitsJson;
            if (quantsJson != null)
            {
                try { System.Text.Json.JsonDocument.Parse(quantsJson); }
                catch { return "quantsJson must be valid JSON, e.g. [{\"quant\":\"UD-Q4_K_XL\",\"sizeGb\":17.92,\"mtp\":true}]."; }
                entry.QuantsJson = quantsJson;
            }
            if (storageLocation != null) entry.StorageLocation = storageLocation;
            if (category != null) entry.Category = category;
            if (notes != null) entry.Notes = notes;

            await catalog.UpdateAsync(entry);
            return $"Updated '{entry.Name}' (id {entry.Id}, {entry.Status}" +
                   (entry.SupersededById.HasValue ? $", superseded by #{entry.SupersededById}" : "") + ").";
        }

        [McpServerTool(Name = "models_set_serving")]
        [Description("Record which box serves a model. Pass servingId (the '#n' on the " +
                     "serves: line of models_query) to change an existing assignment - " +
                     "flip isDefault, retire it with status='retired'; omit it to create " +
                     "one. Machine is matched against Lab machines by name so the serving " +
                     "map and the hardware inventory stay one world.")]
        public async Task<string> ModelsSetServingAsync(
            [Description("Catalog id, from models_query.")]
            int modelId,
            [Description("Existing assignment id to change - the '#n' that leads each " +
                         "'serves:' entry in models_query. Omit to create.")]
            int? servingId = null,
            [Description("Machine name from the Lab inventory, full or partial.")]
            string? machine = null,
            [Description("The alias consumers ask for when it differs from the model id, e.g. 'brain'.")]
            string? alias = null,
            [Description("Port the serving stack answers on, e.g. 8080.")]
            int? endpointPort = null,
            [Description("resident (preloaded, stays in VRAM) or on-demand (loads when asked).")]
            string? mode = null,
            [Description("True if this is the box's default/selector model.")]
            bool? isDefault = null,
            [Description("active or retired.")]
            string? status = null,
            [Description("Anything worth keeping with the assignment.")]
            string? notes = null,
            [Description("The quant this slot ACTUALLY serves, e.g. UD-Q4_K_XL. ⛔ Not the " +
                         "catalog's quant list - a catalog entry is a checkpoint and lists " +
                         "every quant owned of it, so borrowing from it showed six quants " +
                         "against a slot serving one.")]
            string? quant = null,
            [Description("Context window this slot is configured for, in tokens.")]
            int? contextTokens = null,
            [Description("Shared slots (llama-server --parallel).")]
            int? slots = null,
            [Description("KV cache precision, e.g. q8_0. Omit for the f16 default.")]
            string? kvPrecision = null,
            [Description("true if speculative decoding is enabled (--spec-type draft-mtp).")]
            System.Text.Json.JsonElement? mtp = null,
            [Description("true if an mmproj is loaded and the slot can see images.")]
            System.Text.Json.JsonElement? vision = null,
            [Description("GB of weights THIS slot loads - not the catalog's total across quants.")]
            double? weightsGb = null,
            [Description("The serving engine and version, e.g. 'TensorFold v0.6.1', 'vLLM 0.30', 'llama.cpp b11030'.")]
            string? engine = null,
            [Description("true when EVERY stream gets the whole contextTokens window out of one shared KV pool " +
                         "(vLLM, TensorFold); false when contextTokens is split between fixed slots (llama.cpp -np). " +
                         "The serving page draws slots from this.")]
            System.Text.Json.JsonElement? sharedKv = null,
            [Description("Size of the shared KV pool in tokens, when the engine reports one (TensorFold 5 x 262K = 1310720).")]
            int? poolTokens = null,
            [Description("The thinking setting this slot serves under: 'on', 'off', or the effort level ('max', " +
                         "'none') - the benchmark ledger's vocabulary. Shown as a chip on the serving card. " +
                         "Pass an empty string to clear it.")]
            string? thinking = null,
            [Description("true gives this row its own line on its machine's card on the serving page; false keeps it " +
                         "on the map without one (planned rows, on-demand extras). Only rows you select show.")]
            System.Text.Json.JsonElement? onCard = null,
            [Description("The row's label on the card, e.g. 'Full', 'Brief'. Empty string clears it.")]
            string? cardLabel = null,
            [Description("Order of the row within its card, 1 = top.")]
            int? cardOrder = null,
            [Description("Serving id of the row whose PROCESS this one shares: a preset clients ask for differently per " +
                         "request (GLM Brief shares GLM Full - same weights, window and streams - at thinking low). Same " +
                         "machine, and not itself a preset. 0 clears it. A new row given no machine takes that row's machine.")]
            int? sharesWith = null)
        {
            using var scope = _scopeFactory.CreateScope();
            var catalog = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_Catalog>();
            var serving = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_Serving>();

            var entry = await catalog.GetByIdAsync(modelId);
            if (entry == null) return $"No catalog entry with id {modelId}.";

            int? machineId = null;
            string? machineName = null;
            if (!string.IsNullOrWhiteSpace(machine))
            {
                var machines = await MachineNamesAsync(scope);
                var hits = machines.Where(kv => kv.Value.Contains(machine, StringComparison.OrdinalIgnoreCase)).ToList();
                if (hits.Count == 0) return $"No Lab machine matching '{machine}'. Add it to the Lab inventory first, or omit machine.";
                if (hits.Count > 1) return $"'{machine}' matches several machines: {string.Join(", ", hits.Select(h => h.Value))}. Be more specific.";
                machineId = hits[0].Key;
                machineName = hits[0].Value;
            }

            if (mode != null && mode != "resident" && mode != "on-demand")
                return "Mode must be 'resident' or 'on-demand'.";
            if (status != null && status != "active" && status != "retired")
                return "Status must be 'active' or 'retired'.";

            if (servingId.HasValue)
            {
                var a = await serving.GetByIdAsync(servingId.Value);
                if (a == null) return $"No serving assignment with id {servingId}.";
                if (a.ModelId != modelId) return $"Assignment {servingId} belongs to model #{a.ModelId}, not #{modelId}.";
                if (machineId.HasValue) a.MachineId = machineId;
                if (alias != null) a.Alias = alias;
                if (endpointPort.HasValue) a.EndpointPort = endpointPort;
                if (mode != null) a.Mode = mode;
                if (isDefault.HasValue) a.IsDefault = isDefault.Value;
                if (status != null) a.Status = status;
                if (notes != null) a.Notes = notes;
                if (quant != null) a.Quant = quant;
                if (contextTokens.HasValue) a.ContextTokens = contextTokens;
                if (slots.HasValue) a.Slots = slots;
                if (kvPrecision != null) a.KvPrecision = kvPrecision;
                var mtpV = AsBool(mtp); var visionV = AsBool(vision);
                if (mtpV.HasValue) a.Mtp = mtpV;
                if (visionV.HasValue) a.Vision = visionV;
                if (weightsGb.HasValue) a.WeightsGb = weightsGb;
                if (engine != null) a.Engine = engine;
                var sharedV = AsBool(sharedKv);
                if (sharedV.HasValue) a.SharedKv = sharedV;
                if (poolTokens.HasValue) a.PoolTokens = poolTokens;
                if (thinking != null) a.Thinking = string.IsNullOrWhiteSpace(thinking) ? null : thinking.Trim();
                var onCardV = AsBool(onCard);
                if (onCardV.HasValue) a.OnCard = onCardV.Value;
                if (cardLabel != null) a.CardLabel = string.IsNullOrWhiteSpace(cardLabel) ? null : cardLabel.Trim();
                if (cardOrder.HasValue) a.CardOrder = cardOrder;
                if (sharesWith.HasValue) a.SharesWith = sharesWith.Value == 0 ? null : sharesWith;
                var problem = await serving.PresetProblemAsync(a);
                if (problem != null) return problem;
                await serving.UpdateAsync(a);
                return $"Updated assignment {a.Id}: '{entry.Name}' on {machineName ?? (a.MachineId.HasValue ? $"machine #{a.MachineId}" : "untracked box")} ({a.Mode}, {a.Status}).";
            }

            // A new preset with no machine named sits where the process it shares runs.
            if (sharesWith is > 0 && !machineId.HasValue)
            {
                var target = await serving.GetByIdAsync(sharesWith.Value);
                if (target?.MachineId != null)
                {
                    machineId = target.MachineId;
                    var names = await MachineNamesAsync(scope);
                    machineName = names.TryGetValue(target.MachineId.Value, out var tn) ? tn : null;
                }
            }

            var created = new Model_Models_ServingAssignment
            {
                ModelId = modelId,
                MachineId = machineId,
                Alias = alias,
                EndpointPort = endpointPort,
                Mode = mode ?? "on-demand",
                IsDefault = isDefault ?? false,
                Status = status ?? "active",
                Notes = notes,
                Quant = quant,
                ContextTokens = contextTokens,
                Slots = slots,
                KvPrecision = kvPrecision,
                Mtp = AsBool(mtp),
                Vision = AsBool(vision),
                WeightsGb = weightsGb,
                Engine = engine,
                SharedKv = AsBool(sharedKv),
                PoolTokens = poolTokens,
                Thinking = string.IsNullOrWhiteSpace(thinking) ? null : thinking.Trim(),
                OnCard = AsBool(onCard) ?? false,
                CardLabel = string.IsNullOrWhiteSpace(cardLabel) ? null : cardLabel.Trim(),
                CardOrder = cardOrder,
                SharesWith = sharesWith is > 0 ? sharesWith : null
            };
            var createProblem = await serving.PresetProblemAsync(created);
            if (createProblem != null) return createProblem;
            var id = await serving.CreateAsync(created);
            return $"'{entry.Name}' now recorded as served on {machineName ?? "an untracked box"} (assignment {id}).";
        }

        // ------------------------------------------------------------------
        // THE SERVING PAGE'S DESIGN, updated over MCP and in the UI rather than by a build.
        // Boxes, clients and rules are rows of
        // Models_Serving_Design; the page computes its layout from Row/Position. What a box
        // serves stays in Models_Serving, its speed in the ledger.
        // ------------------------------------------------------------------

        [McpServerTool(Name = "models_serving_design")]
        [Description("Read the serving page's design: every box (a card - its role, title, the reason it " +
                     "exists, the Lab machines in it, slot owners, who it delegates to and falls back to, " +
                     "its row and position), every client (who asks which box) and every rule (the numbered " +
                     "lines under the picture), each with the id models_set_serving_design changes.")]
        public async Task<string> ModelsServingDesignAsync()
        {
            using var scope = _scopeFactory.CreateScope();
            var rows = (await scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_ServingDesign>().GetAllAsync()).ToList();
            if (rows.Count == 0) return "The serving page has no design yet. Add boxes with models_set_serving_design kind='box'.";
            var sb = new StringBuilder();
            foreach (var kind in new[] { "box", "client", "rule" })
            {
                var of = rows.Where(r => r.Kind == kind).OrderBy(r => r.Row).ThenBy(r => r.Position).ToList();
                if (of.Count == 0) continue;
                sb.AppendLine(kind == "box" ? "BOXES:" : kind == "client" ? "CLIENTS:" : "RULES:");
                foreach (var r in of)
                {
                    var bits = new List<string> { $"#{r.Id}" };
                    if (kind == "box")
                    {
                        bits.Add($"{r.Name} - {r.Title} [{r.Role}] row {r.Row} pos {r.Position}");
                        if (!string.IsNullOrWhiteSpace(r.Machines)) bits.Add($"machines: {r.Machines}");
                        if (!string.IsNullOrWhiteSpace(r.SlotOwners)) bits.Add($"slots: {r.SlotOwners}");
                        if (!string.IsNullOrWhiteSpace(r.DelegatesTo)) bits.Add($"delegates to: {r.DelegatesTo}");
                        if (!string.IsNullOrWhiteSpace(r.FallbackBox)) bits.Add($"falls back to: {r.FallbackBox}");
                        if (!string.IsNullOrWhiteSpace(r.Accent)) bits.Add($"accent {r.Accent}");
                        if (!string.IsNullOrWhiteSpace(r.Body)) bits.Add($"why: {r.Body}");
                    }
                    else if (kind == "client") bits.Add($"{r.Name} ({r.Body}) asks {r.AsksBox}, pos {r.Position}");
                    else bits.Add($"{r.Position}. {r.Body}");
                    sb.AppendLine("  " + string.Join(" | ", bits));
                }
            }
            return sb.ToString().TrimEnd();
        }

        [McpServerTool(Name = "models_set_serving_design")]
        [Description("Create or change one element of the serving page's design - no JR build needed. Pass id " +
                     "(from models_serving_design) to change an element: only the fields you pass change. Omit id " +
                     "to create one, with kind. kind='box': name (the card's heading), title, role, body (the one-" +
                     "line reason), machines (comma-separated Lab machine names; a pair lists both), slotOwners " +
                     "(comma-separated, left to right), delegatesTo and fallbackBox (box names), row (1 = top) and " +
                     "position (left to right), accent (#rrggbb). Hardware is always the Lab's. kind='client': name, body (what it is), " +
                     "asksBox. kind='rule': body, position. Pass an empty string to clear a text field.")]
        public async Task<string> ModelsSetServingDesignAsync(
            [Description("Element id to change; omit to create.")] int? id = null,
            [Description("box, client or rule - required when creating.")] string? kind = null,
            [Description("A box's heading or a client's label.")] string? name = null,
            [Description("A box's title, three or four words.")] string? title = null,
            [Description("A box's role, free text: 'coding agent', 'chat agent', 'worker'.")] string? role = null,
            [Description("A box's reason to exist, a client's description, or a rule's text.")] string? body = null,
            [Description("Comma-separated Lab machine names in the box.")] string? machines = null,
            [Description("Comma-separated slot owners, left to right.")] string? slotOwners = null,
            [Description("A client's target box name.")] string? asksBox = null,
            [Description("Comma-separated box names this box delegates to.")] string? delegatesTo = null,
            [Description("The box its clients fall back to when it is down.")] string? fallbackBox = null,
            [Description("Canvas row, 1 = top.")] int? row = null,
            [Description("Order within the row, or a rule's number.")] int? position = null,
            [Description("Card accent colour, #rrggbb.")] string? accent = null)
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_ServingDesign>();
            string? T(string? v, string? old) => v == null ? old : (v.Trim() == "" ? null : v.Trim());
            Model_Models_ServingDesign e;
            if (id.HasValue)
            {
                e = await db.GetByIdAsync(id.Value) ?? throw new InvalidOperationException($"No design element #{id}.");
            }
            else
            {
                if (kind is not ("box" or "client" or "rule")) return "Creating needs kind = box, client or rule.";
                e = new Model_Models_ServingDesign { Kind = kind };
            }
            if (kind != null && id.HasValue)
            {
                if (kind is not ("box" or "client" or "rule")) return "kind must be box, client or rule.";
                e.Kind = kind;
            }
            e.Name = T(name, e.Name); e.Title = T(title, e.Title); e.Role = T(role, e.Role); e.Body = T(body, e.Body);
            e.Machines = T(machines, e.Machines); e.SlotOwners = T(slotOwners, e.SlotOwners); e.AsksBox = T(asksBox, e.AsksBox);
            e.DelegatesTo = T(delegatesTo, e.DelegatesTo); e.FallbackBox = T(fallbackBox, e.FallbackBox);
            e.Accent = T(accent, e.Accent);
            if (row.HasValue) e.Row = row.Value;
            if (position.HasValue) e.Position = position.Value;
            if (e.Kind != "rule" && string.IsNullOrWhiteSpace(e.Name)) return "A box or client needs a name.";
            if (e.Kind == "rule" && string.IsNullOrWhiteSpace(e.Body)) return "A rule needs a body.";
            if (id.HasValue) { await db.UpdateAsync(e); return $"Updated design {e.Kind} #{e.Id} ({e.Name ?? e.Body})."; }
            var newId = await db.CreateAsync(e);
            return $"Created design {e.Kind} #{newId} ({e.Name ?? e.Body}).";
        }

        [McpServerTool(Name = "models_delete_serving_design")]
        [Description("Delete one element of the serving page's design (a box, client or rule) by id from " +
                     "models_serving_design. Serving rows and benchmarks are not touched.")]
        public async Task<string> ModelsDeleteServingDesignAsync([Description("Element id.")] int id)
        {
            using var scope = _scopeFactory.CreateScope();
            return await scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_ServingDesign>().DeleteAsync(id)
                ? $"Deleted design element #{id}." : $"No design element #{id}.";
        }

        // retiring kept every dead
        // assignment on each model's record forever; only the web API could delete one.
        [McpServerTool(Name = "models_delete_serving")]
        [Description("DELETE a serving assignment outright - for a slot that no longer exists and whose " +
                     "record is not wanted as history. Retiring (models_set_serving status='retired') KEEPS " +
                     "the row visible on the model's record; this removes it. Benchmarks are NOT touched - " +
                     "the ledger keys on machine, model and setup, never on the assignment. ⛔ Irreversible: " +
                     "read the assignment with models_query first and name what you delete in your reply.")]
        public async Task<string> ModelsDeleteServingAsync(
            [Description("The assignment id - the '#n' on a serves: line of models_query.")]
            int servingId)
        {
            using var scope = _scopeFactory.CreateScope();
            var serving = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_Serving>();
            var existing = await serving.GetByIdAsync(servingId);
            if (existing == null) return $"No serving assignment with id {servingId}. Nothing was deleted.";
            await serving.DeleteAsync(servingId);
            return $"Deleted serving assignment #{servingId} (model {existing.ModelId}, machine " +
                   $"{existing.MachineId?.ToString() ?? "none"}, {existing.Status}). Benchmarks untouched.";
        }

        [McpServerTool(Name = "models_record_benchmark")]
        [Description("Record a MEASURED number for a model - gen_tok_s, prompt_tok_s, " +
                     "cold_load_s, vram_gb or any metric worth a series. Appends a dated " +
                     "observation, never overwrites - the series answers what a driver, " +
                     "quant or KV change actually cost. ⚠️ MEASURED ONLY: a figure read " +
                     "from /api/metrics/activity (drop rows with output_tokens < 2 - the " +
                     "one-token probes report absurd tok/s) or a timed run. Never an " +
                     "estimate, never a spec sheet.")]
        public async Task<string> ModelsRecordBenchmarkAsync(
            [Description("The MODEL that was measured, e.g. 'qwen3.8-27b'. NOT a serving id: " +
                         "no quant, context or '-mtp' suffix - those are their own fields " +
                         "below. It does NOT have to be in the catalog: benchmarking a model " +
                         "you have not catalogued is normal and the row stands on its own. " +
                         "If the name matches a catalog entry the row is linked automatically; " +
                         "if not, it is flagged in the UI and models_link_benchmarks can " +
                         "attach it later.")]
            string modelName,
            [Description("What was measured: gen_tok_s, prompt_tok_s, cold_load_s, vram_gb...")]
            string metric,
            [Description("The measured value.")]
            double value,
            [Description("Machine name from the Lab inventory the number was measured ON.")]
            string? machine = null,
            [Description("THE SETUP, CAPTURED AT RUN TIME - the quant tier of the file that was " +
                         "actually loaded, spelled as the filename spells it: 'UD-Q4_K_XL', " +
                         "'Q8_0', 'f16'. ⛔ Read it from the running server (llama-server's " +
                         "/props gives model_path), never from a catalog entry: the catalog " +
                         "holds MODELS and can only say which quants you own, not which one " +
                         "this run loaded.")]
            string? quant = null,
            [Description("Context the server was serving with, in TOKENS (e.g. 131072).")]
            int? contextTokens = null,
            [Description("Concurrent slots (--parallel / total_slots).")]
            int? slots = null,
            [Description("KV cache precision: 'f16', 'q8_0', 'q4_0'.")]
            string? kvPrecision = null,
            [Description("Multi-token prediction in use (--spec-type draft-mtp).")]
            bool? mtp = null,
            [Description("Vision was loaded for this run (an mmproj was in play).")]
            bool? vision = null,
            [Description("Engine build the number came off, e.g. 'b10639-2a36554fc'. A speed " +
                         "without its engine is not comparable across an upgrade.")]
            string? engine = null,
            [Description("Size in GB of the weights ACTUALLY LOADED. ⛔ Not the catalog's size, " +
                         "which totals every quant held.")]
            double? weightsGb = null,
            [Description("Where the figure came from: 'llama-swap activity', 'manual run', 'hud'.")]
            string? source = null,
            [Description("Caveats worth keeping with the number: context depth, batch, driver.")]
            string? notes = null,
            [Description("When it was measured, ISO date, if not right now. Backdatable so " +
                         "old notes keep their real date.")]
            string? capturedAt = null,
            [Description("Anything else your tool wants to keep, as a JSON object - sampler " +
                         "settings, --n-cpu-moe, whatever is specific to it. The fields above " +
                         "are the contract; this is the spillover bag.")]
            string? configJson = null,
            [Description("The BENCHMARK CONTRACT's scenario (v3): a prompt depth - 4k, 16k, " +
                         "32k, 64k, 128k or 256k, one cold request of that many tokens - or " +
                         "<depth>_xN for N simultaneous streams (4k_x4). Depths are never " +
                         "averaged together.")]
            string? scenario = null,
            [Description("THE TIN, when the machine's name is a role that moves between boxes: " +
                         "'Acer Veriton GN100' for a run on 'Node A' while that box holds the role. " +
                         "A speed belongs to the hardware; the Lab inventory only says what is " +
                         "in the machine today. Optional; shown beside the machine in the matrix.")]
            string? hardware = null,
            [Description("The thinking setting the run was served under: 'on', 'off', or the effort " +
                         "level ('max', 'none'). Optional; a column in the matrix.")]
            string? thinking = null)
        {
            if (string.IsNullOrWhiteSpace(metric)) return "Metric is required.";
            if (metric.Trim().Equals("wont_fit", StringComparison.OrdinalIgnoreCase))
                return "Refusing: a refusal is not a measurement. Record it with models_record_wont_fit " +
                       "(its own table), never as a benchmark metric.";
            if (metric.Trim() is "swe_bench_verified" or "swe_bench_pro" or "aider_polyglot")
                return "Refusing: a published eval figure is a citation, not a fleet measurement. " +
                       "Record it with models_record_reference_score (its own table).";
            // ⛔ A MACHINE IS REQUIRED FOR A SPEED NUMBER, NOT FOR A SCORE.
            // tok/s, watts and VRAM are properties of the
            // weights AND the hardware - without the box the number means
            // nothing and must be refused. A pass rate is a property of the
            // WEIGHTS: the same quant answers the same on either machine, and a
            // hosted model has no box in this house at all. Requiring one there
            // forced the only honest options to be inventing a machine or
            // filing our own measurement as someone else's published score.
            // This is the same distinction the Benchmarks page draws between a
            // matrix (machine is an axis) and a table (machine is provenance).
            if (string.IsNullOrWhiteSpace(machine) && IsSpeedMetric(metric.Trim()))
                return "Machine is required for a speed metric: tok/s, watts and VRAM are " +
                       "measured ON a box and mean nothing without it. A scored metric " +
                       "(a pass rate) may omit it - that is how a hosted model is recorded.";

            if (string.IsNullOrWhiteSpace(modelName))
                return "modelName is required: the row's own identity, so a measurement " +
                       "survives the catalog being reorganised.";

            var name = modelName.Trim();
            var shaped = ConfigShapedName(name);
            if (shaped != null)
                return $"Refusing '{name}': {shaped}. A benchmark names the MODEL; the quant, " +
                       "context and MTP are their own fields on this call.";

            using var scope = _scopeFactory.CreateScope();
            var catalog = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_Catalog>();
            var benchmarks = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_Benchmarks>();

            // A catalog entry is OPTIONAL - see Model_Models_Benchmark.ModelId.
            var entry = (await catalog.GetAllAsync())
                .FirstOrDefault(e => e.Name.Equals(name, StringComparison.OrdinalIgnoreCase));

            int? machineId = null;
            if (!string.IsNullOrWhiteSpace(machine))
            {
                var machines = await MachineNamesAsync(scope);
                var hits = machines.Where(kv => kv.Value.Contains(machine, StringComparison.OrdinalIgnoreCase)).ToList();
                if (hits.Count == 0) return $"No Lab machine matching '{machine}'.";
                if (hits.Count > 1) return $"'{machine}' matches several machines: {string.Join(", ", hits.Select(h => h.Value))}. Be more specific.";
                machineId = hits[0].Key;
            }

            DateTime captured = DateTime.UtcNow;
            if (!string.IsNullOrWhiteSpace(capturedAt))
            {
                if (!DateTime.TryParse(capturedAt, null,
                        System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal,
                        out captured))
                    return $"Could not parse capturedAt '{capturedAt}'. Use an ISO date like 2026-08-21.";
            }

            var id = await benchmarks.RecordAsync(new Model_Models_Benchmark
            {
                ModelName = name,
                ModelId = entry?.Id,
                MachineId = machineId,
                Metric = metric.Trim(),
                Value = value,
                Quant = string.IsNullOrWhiteSpace(quant) ? null : quant.Trim(),
                ContextTokens = contextTokens,
                Slots = slots,
                KvPrecision = string.IsNullOrWhiteSpace(kvPrecision) ? null : kvPrecision.Trim(),
                Mtp = mtp,
                Vision = vision,
                Engine = string.IsNullOrWhiteSpace(engine) ? null : engine.Trim(),
                WeightsGb = weightsGb,
                CapturedAt = captured,
                Source = source,
                Notes = notes,
                ConfigJson = configJson,
                Scenario = string.IsNullOrWhiteSpace(scenario) ? null : scenario.Trim(),
                Hardware = string.IsNullOrWhiteSpace(hardware) ? null : hardware.Trim(),
                Thinking = string.IsNullOrWhiteSpace(thinking) ? null : thinking.Trim()
            });

            var msg = $"Recorded {metric.Trim()} {value:0.##} for '{name}'" +
                      (quant != null ? $" ({quant.Trim()})" : "") + $" (observation {id}).";

            // Say plainly what was NOT captured. A silently-null column reads as
            // "not applicable" in the UI, and the submitter is the only one who
            // could still have gone and measured it.
            var missing = new List<string>();
            if (string.IsNullOrWhiteSpace(quant)) missing.Add("quant");
            if (contextTokens == null) missing.Add("contextTokens");
            if (slots == null) missing.Add("slots");
            if (engine == null) missing.Add("engine");
            if (missing.Count > 0)
                msg += $" ⚠️ Not captured: {string.Join(", ", missing)} - these show as '—' and " +
                       "cannot be filled in later from the catalog. Read them from the running " +
                       "server (llama-server: /props?model=<id>) and re-record if you can.";

            if (entry == null)
                msg += $" ⚠️ '{name}' is not in the catalog, so this row is UNLINKED (valid, and " +
                       "flagged in the UI). Add it with models_add_model, or attach these rows " +
                       "with models_link_benchmarks once it exists.";

            return msg;
        }

        [McpServerTool(Name = "models_link_benchmarks")]
        [Description("Attach benchmark rows to a catalog entry after the fact. Benchmark " +
                     "rows carry a model NAME and only optionally a catalog link, so a model " +
                     "can be measured before - or without ever - being catalogued. This is " +
                     "how those rows get connected once the entry exists. " +
                     "Call with no arguments to LIST what is unlinked. Call with " +
                     "modelName + catalogName to attach, apply=true to write. " +
                     "⛔ It only ever fills an EMPTY link: a row already attached is never " +
                     "re-pointed, so history cannot be silently moved between models.")]
        public async Task<string> ModelsLinkBenchmarksAsync(
            [Description("The benchmark rows' model name, exactly as recorded. Omit to list " +
                         "every unlinked name with its row count.")]
            string? modelName = null,
            [Description("The catalog entry to attach them to. Defaults to modelName when " +
                         "omitted, which is the usual case - you catalogued it under the " +
                         "same name the benchmarks already use.")]
            string? catalogName = null,
            [Description("false (default) REPORTS what would be linked and writes nothing. " +
                         "true performs the link.")]
            bool apply = false)
        {
            using var scope = _scopeFactory.CreateScope();
            var catalog = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_Catalog>();
            var benchmarks = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_Benchmarks>();

            var unlinked = (await benchmarks.GetUnlinkedNamesAsync()).ToList();
            var entries = (await catalog.GetAllAsync()).ToList();

            if (string.IsNullOrWhiteSpace(modelName))
            {
                if (unlinked.Count == 0) return "Every benchmark row is linked to a catalog entry.";
                var sb = new System.Text.StringBuilder();
                sb.AppendLine($"{unlinked.Count} model name(s) with unlinked benchmark rows:");
                foreach (var u in unlinked)
                {
                    var match = entries.FirstOrDefault(e => e.Name.Equals(u.ModelName, StringComparison.OrdinalIgnoreCase));
                    sb.AppendLine($"  {u.ModelName} - {u.Rows} row(s)" +
                                  (match != null
                                      ? $" → catalog entry [{match.Id}] '{match.Name}' matches by name; "
                                        + "call again with apply=true to attach"
                                      : " → NO catalog entry of that name (add it with models_add_model, "
                                        + "or pass catalogName to attach to a differently-named entry)"));
                }
                return sb.ToString().TrimEnd();
            }

            var target = catalogName?.Trim() ?? modelName.Trim();
            var dest = entries.FirstOrDefault(e => e.Name.Equals(target, StringComparison.OrdinalIgnoreCase));
            if (dest == null)
                return $"No catalog entry named '{target}'. Add it with models_add_model first " +
                       "(the benchmark rows are valid meanwhile - they just stay flagged).";

            var rows = unlinked.FirstOrDefault(u => u.ModelName.Equals(modelName.Trim(), StringComparison.OrdinalIgnoreCase));
            if (rows.Rows == 0)
                return $"No UNLINKED benchmark rows named '{modelName.Trim()}'. " +
                       "Rows already attached are never re-pointed by this tool.";

            if (!apply)
                return $"Would attach {rows.Rows} row(s) named '{rows.ModelName}' to catalog entry " +
                       $"[{dest.Id}] '{dest.Name}'. Nothing written - call again with apply=true.";

            var n = await benchmarks.LinkByNameAsync(modelName.Trim(), dest.Id);
            return $"Attached {n} benchmark row(s) named '{modelName.Trim()}' to [{dest.Id}] '{dest.Name}'.";
        }

        [McpServerTool(Name = "models_delete_benchmarks")]
        [Description("Delete benchmark rows whose MEASUREMENT was invalid - runs " +
                     "contaminated by parallel load, or rows whose captured config was " +
                     "wrong at entry. Never for numbers that merely went stale: the " +
                     "series is the point. At least one filter is required and they " +
                     "combine with AND; state in your workflow WHY the era was invalid " +
                     "before calling. Returns the count removed. For a dataset spoiled by " +
                     "cross-box contamination or a config-capture bug.")]
        public async Task<string> ModelsDeleteBenchmarksAsync(
            [Description("Only rows for this catalog id, from models_query.")]
            int? modelId = null,
            [Description("Only rows measured on this machine (Lab name, full or partial).")]
            string? machine = null,
            [Description("Only rows captured BEFORE this ISO timestamp (UTC), e.g. " +
                         "2026-08-26T21:00:00.")]
            string? capturedBefore = null,
            [Description("Only rows of this metric, e.g. gen_tok_s. Combine with modelId/machine " +
                         "to target precisely - a bare modelId deletes that model's rows EVERYWHERE " +
                         "(one such call can destroy many valid measurements).")]
            string? metric = null,
            [Description("Only rows whose ModelName is exactly this - the row's own identity, " +
                         "which need not be a catalog entry.")]
            string? modelName = null,
            [Description("Only rows measured at exactly this quant, e.g. NVFP4-HIGH. Use this " +
                         "when a capture bug labelled one setup wrongly: it removes that setup and " +
                         "leaves every other quant of the same model on the same box untouched.")]
            string? quant = null)
        {
            using var scope = _scopeFactory.CreateScope();
            var benchmarks = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_Benchmarks>();

            int? machineId = null;
            if (!string.IsNullOrWhiteSpace(machine))
            {
                var machines = await MachineNamesAsync(scope);
                var hits = machines.Where(kv => kv.Value.Contains(machine, StringComparison.OrdinalIgnoreCase)).ToList();
                if (hits.Count == 0) return $"No Lab machine matching '{machine}'.";
                if (hits.Count > 1) return $"'{machine}' matches several machines: {string.Join(", ", hits.Select(h => h.Value))}. Be more specific.";
                machineId = hits[0].Key;
            }

            DateTime? before = null;
            if (!string.IsNullOrWhiteSpace(capturedBefore))
            {
                if (!DateTime.TryParse(capturedBefore, null,
                        System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal,
                        out var parsed))
                    return $"Could not parse capturedBefore '{capturedBefore}'. Use ISO like 2026-08-26T21:00:00.";
                before = parsed;
            }

            if (modelId == null && machineId == null && before == null && metric == null
                && string.IsNullOrWhiteSpace(modelName) && string.IsNullOrWhiteSpace(quant))
                return "Refusing: at least one filter (modelId, machine, capturedBefore, metric, modelName, quant) is required - there is no delete-everything.";

            var removed = await benchmarks.DeleteRangeAsync(modelId, machineId, before, metric,
                string.IsNullOrWhiteSpace(modelName) ? null : modelName.Trim(),
                string.IsNullOrWhiteSpace(quant) ? null : quant.Trim());
            return removed == 0
                ? "No rows matched those filters."
                : $"Deleted {removed} benchmark row(s). The series they belonged to start clean from here.";
        }

        [McpServerTool(Name = "models_record_reference_score")]
        [Description("Record a PUBLISHED benchmark score for a model - SWE-bench Verified/Pro, " +
                     "Aider polyglot… - cited from an online source. Catalog-domain: a fact about " +
                     "the checkpoint itself, never a fleet measurement. Source URL is mandatory; " +
                     "note the evaluated variant (published figures describe the full-precision " +
                     "checkpoint, not the quant a box serves).")]
        public async Task<string> ModelsRecordReferenceScoreAsync(
            [Description("Catalog id, from models_query.")]
            int modelId,
            [Description("The benchmark: swe_bench_verified, swe_bench_pro, aider_polyglot…")]
            string benchmark,
            [Description("The published score.")]
            double score,
            [Description("The URL the figure came from. Mandatory - an uncited score is a rumor.")]
            string source,
            [Description("independent or vendor_reported. ⚠️ A vendor's own claim and an " +
                         "independently-run figure are not the same evidence - Aider Polyglot's " +
                         "leaderboard once read 0 verified / 22 self-reported. Omit when " +
                         "nobody has established which; unknown is not 'independent'.")]
            string? provenance = null,
            [Description("The precision actually evaluated - BF16, FP8, or a quant name. Published " +
                         "figures almost always describe the full-precision checkpoint, never the " +
                         "quant a box serves.")]
            string? evaluatedPrecision = null,
            [Description("The harness: 'SWE-Agent', 'Claude Code', 'mini-swe-agent'. Scaffold moves " +
                         "a SWE-bench number by more than most model differences do.")]
            string? scaffold = null,
            [Description("Context window the evaluation ran at, in tokens.")]
            int? evaluatedContextTokens = null,
            [Description("Anything the fields above cannot hold. ⛔ Stays on the box - free text " +
                         "never syncs, so a fact worth discussing remotely belongs in a field.")]
            string? notes = null,
            [Description("Publication date, ISO, if known.")]
            string? capturedAt = null)
        {
            if (string.IsNullOrWhiteSpace(benchmark)) return "Benchmark is required.";
            if (string.IsNullOrWhiteSpace(source)) return "Source URL is required - an uncited published score is a rumor.";
            if (provenance != null && provenance != "independent" && provenance != "vendor_reported")
                return "Provenance must be 'independent' or 'vendor_reported' - or omitted when nobody has established which.";

            using var scope = _scopeFactory.CreateScope();
            var catalog = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_Catalog>();
            var scores = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_ReferenceScores>();

            var entry = await catalog.GetByIdAsync(modelId);
            if (entry == null) return $"No catalog entry with id {modelId}.";

            DateTime captured = DateTime.UtcNow;
            if (!string.IsNullOrWhiteSpace(capturedAt) &&
                !DateTime.TryParse(capturedAt, null,
                    System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal,
                    out captured))
                return $"Could not parse capturedAt '{capturedAt}'.";

            var id = await scores.CreateAsync(new Model_Models_ReferenceScore
            {
                ModelId = modelId,
                Benchmark = benchmark.Trim(),
                Score = score,
                Source = source.Trim(),
                Provenance = provenance,
                EvaluatedPrecision = evaluatedPrecision,
                Scaffold = scaffold,
                EvaluatedContextTokens = evaluatedContextTokens,
                Notes = notes,
                CapturedAt = captured
            });
            return $"Recorded {benchmark.Trim()} {score:0.##} for '{entry.Name}' (reference score {id}).";
        }

        [McpServerTool(Name = "models_delete_reference_score")]
        [Description("Delete ONE reference score by its id (from the reference-scores listing) - " +
                     "for a figure that was mis-entered or has been corrected upstream.")]
        public async Task<string> ModelsDeleteReferenceScoreAsync(
            [Description("The reference score id.")]
            int scoreId)
        {
            using var scope = _scopeFactory.CreateScope();
            var scores = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_ReferenceScores>();
            var existing = await scores.GetByIdAsync(scoreId);
            if (existing == null) return $"No reference score with id {scoreId}.";
            await scores.DeleteAsync(scoreId);
            return $"Deleted reference score {scoreId} ({existing.Benchmark} {existing.Score:0.##} for model #{existing.ModelId}).";
        }

        [McpServerTool(Name = "models_record_wont_fit")]
        [Description("Record a FIT VERDICT: a real load was ATTEMPTED and this exact setup " +
                     "cannot serve on this machine. ⛔ TESTED DATA ONLY - NO MANUAL VERDICTS " +
                     ": the reason must be the load error verbatim from " +
                     "the box's own logs. A policy, an estimate, or an untried arithmetic " +
                     "argument is NOT a verdict - leave the cell untested. A transient failure " +
                     "is not a verdict either: an HTTP 500 with no load error in the logs is " +
                     "INCONCLUSIVE, record nothing. configJson is the exact setup attempted - " +
                     "the same model may fit the same box under a different config.")]
        public async Task<string> ModelsRecordWontFitAsync(
            [Description("Catalog id, from models_query.")]
            int modelId,
            [Description("Machine name from the Lab inventory.")]
            string machine,
            [Description("The EXACT setup attempted, as a JSON object: ctx, KV precision, slots, MTP, offload.")]
            string configJson,
            [Description("The load error verbatim from the box's own logs - measured evidence only.")]
            string reason,
            [Description("The suite that attempted the load.")]
            string? source = null,
            [Description("When it was established, ISO, if not right now.")]
            string? capturedAt = null)
        {
            if (string.IsNullOrWhiteSpace(configJson)) return "ConfigJson is required - a verdict is about an exact setup.";
            if (string.IsNullOrWhiteSpace(reason)) return "Reason is required - a verdict without evidence is a guess.";

            using var scope = _scopeFactory.CreateScope();
            var catalog = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_Catalog>();
            var verdicts = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_FitVerdicts>();

            var entry = await catalog.GetByIdAsync(modelId);
            if (entry == null) return $"No catalog entry with id {modelId}.";

            var machines = await MachineNamesAsync(scope);
            var hits = machines.Where(kv => kv.Value.Contains(machine, StringComparison.OrdinalIgnoreCase)).ToList();
            if (hits.Count == 0) return $"No Lab machine matching '{machine}'.";
            if (hits.Count > 1) return $"'{machine}' matches several machines: {string.Join(", ", hits.Select(h => h.Value))}. Be more specific.";

            DateTime captured = DateTime.UtcNow;
            if (!string.IsNullOrWhiteSpace(capturedAt) &&
                !DateTime.TryParse(capturedAt, null,
                    System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal,
                    out captured))
                return $"Could not parse capturedAt '{capturedAt}'.";

            var id = await verdicts.CreateAsync(new Model_Models_FitVerdict
            {
                ModelId = modelId,
                MachineId = hits[0].Key,
                ConfigJson = configJson,
                Reason = reason,
                Source = source,
                CapturedAt = captured
            });
            return $"Recorded fit verdict {id}: '{entry.Name}' cannot serve on {hits[0].Value} under that config.";
        }

        [McpServerTool(Name = "models_withdraw_wont_fit")]
        [Description("Withdraw ONE fit verdict by its id - because the setup loaded after all " +
                     "(driver/engine change, freed VRAM) or the verdict was wrong. A disproven " +
                     "verdict must vanish, not linger as history.")]
        public async Task<string> ModelsWithdrawWontFitAsync(
            [Description("The verdict id, from the fit-verdicts listing.")]
            int verdictId)
        {
            using var scope = _scopeFactory.CreateScope();
            var verdicts = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_FitVerdicts>();
            var existing = await verdicts.GetByIdAsync(verdictId);
            if (existing == null) return $"No fit verdict with id {verdictId}.";
            await verdicts.DeleteAsync(verdictId);
            return $"Withdrew fit verdict {verdictId} (model #{existing.ModelId} on machine #{existing.MachineId}).";
        }

        [McpServerTool(Name = "models_sync_catalog")]
        [Description("Refresh the catalog against what is ACTUALLY ON DISK, on demand. " +
                     "The agent walks its own weight store and passes what it found; this " +
                     "tool reports the difference and, with apply=true, writes it. " +
                     "⛔ THE CATALOG IS MODELS, NEVER CONFIGURATIONS: pass ONE entry per " +
                     "model directory, with every quant held listed in its 'quants' field " +
                     "and 'sizeGb' as the MEASURED total for that directory. Do not pass a " +
                     "row per quant file, and do not pass projectors (mmproj), partial " +
                     "downloads (.part) or non-servable formats as models. Curation stays " +
                     "a judgement: report first, apply once you have read the report.")]
        public async Task<string> ModelsSyncCatalogAsync(
            [Description("What is on disk, as a JSON array: " +
                         "[{\"name\":\"qwen3.8-27b\",\"storageLocation\":\"vickers Models/Qwen3.8-27B/\"," +
                         "\"quantsHeld\":[{\"quant\":\"UD-Q4_K_XL\",\"sizeGb\":17.92}," +
                         "{\"quant\":\"Q8_0\",\"sizeGb\":29.05}]}]")]
            string inventoryJson,
            [Description("false (default) reports the difference and writes nothing. " +
                         "true applies it: adds what is missing, updates quants/size where " +
                         "they drifted. Never deletes - a catalog entry whose files are gone " +
                         "is reported for a human to retire.")]
            bool apply = false)
        {
            List<Dictionary<string, object>>? found;
            try
            {
                found = System.Text.Json.JsonSerializer.Deserialize<List<Dictionary<string, object>>>(inventoryJson);
            }
            catch (Exception ex) { return $"Could not parse inventoryJson: {ex.Message}"; }
            if (found == null || found.Count == 0) return "inventoryJson held no entries.";

            using var scope = _scopeFactory.CreateScope();
            var catalog = scope.ServiceProvider.GetRequiredService<Service_Database_Manager_Models_Catalog>();
            var existing = (await catalog.GetAllAsync()).ToList();

            var sb = new System.Text.StringBuilder();
            int added = 0, updated = 0;
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var f in found)
            {
                var name = f.TryGetValue("name", out var n) ? n?.ToString()?.Trim() : null;
                if (string.IsNullOrWhiteSpace(name)) { sb.AppendLine("skipped an entry with no name"); continue; }
                var bad = ConfigShapedName(name);
                if (bad != null) { sb.AppendLine($"REFUSED '{name}': {bad} - pass the model, not a configuration"); continue; }
                seen.Add(name);

                // Preferred shape: a row per quant held, each with its measured
                // size. The summary string and the total are DERIVED here, so a
                // caller never has to keep them consistent by hand.
                string? quantsJson = null;
                string? quants = f.TryGetValue("quants", out var q) ? q?.ToString() : null;
                double? size = f.TryGetValue("sizeGb", out var g) && double.TryParse(g?.ToString(), out var gv) ? gv : null;
                if (f.TryGetValue("quantsHeld", out var qh) && qh is System.Text.Json.JsonElement qe
                    && qe.ValueKind == System.Text.Json.JsonValueKind.Array)
                {
                    quantsJson = qe.GetRawText();
                    var names = new List<string>();
                    double total = 0;
                    foreach (var one in qe.EnumerateArray())
                    {
                        if (one.TryGetProperty("quant", out var qn) && qn.ValueKind == System.Text.Json.JsonValueKind.String)
                            names.Add(qn.GetString()!);
                        if (one.TryGetProperty("sizeGb", out var qs) && qs.ValueKind == System.Text.Json.JsonValueKind.Number)
                            total += qs.GetDouble();
                    }
                    if (names.Count > 0) quants = string.Join(" · ", names);
                    if (total > 0) size = Math.Round(total, 2);
                }
                string? store = f.TryGetValue("storageLocation", out var sl) ? sl?.ToString() : null;

                var hit = existing.FirstOrDefault(e => string.Equals(e.Name, name, StringComparison.OrdinalIgnoreCase));
                if (hit == null)
                {
                    sb.AppendLine($"{(apply ? "ADDED" : "MISSING")}: {name} ({quants ?? "?"}, {size?.ToString("0.##") ?? "?"} GB)");
                    if (apply)
                    {
                        await catalog.CreateAsync(new Model_Models_CatalogEntry
                        {
                            Name = name, Quant = quants, QuantsJson = quantsJson, SizeGb = size,
                            StorageLocation = store, Status = "active"
                        });
                        added++;
                    }
                    continue;
                }
                var drift = new List<string>();
                if (quants != null && hit.Quant != quants) drift.Add($"quants {hit.Quant ?? "-"} -> {quants}");
                if (size != null && (hit.SizeGb == null || Math.Abs(hit.SizeGb.Value - size.Value) > 0.05))
                    drift.Add($"sizeGb {hit.SizeGb?.ToString("0.##") ?? "-"} -> {size.Value:0.##}");
                if (quantsJson != null && hit.QuantsJson != quantsJson) drift.Add("per-quant detail");
                if (drift.Count > 0)
                {
                    sb.AppendLine($"{(apply ? "UPDATED" : "DRIFTED")}: {name} - {string.Join(", ", drift)}");
                    if (apply)
                    {
                        if (quants != null) hit.Quant = quants;
                        if (quantsJson != null) hit.QuantsJson = quantsJson;
                        if (size != null) hit.SizeGb = size;
                        if (store != null) hit.StorageLocation = store;
                        await catalog.UpdateAsync(hit);
                        updated++;
                    }
                }
            }

            foreach (var e in existing.Where(e => e.Status == "active" && !seen.Contains(e.Name)))
                sb.AppendLine($"IN CATALOG BUT NOT ON DISK: {e.Name} (id {e.Id}) - retire it by hand if the files are really gone");

            var head = apply ? $"Applied: {added} added, {updated} updated.\n"
                             : "Report only - nothing written. Re-run with apply=true to write.\n";
            return head + (sb.Length == 0 ? "catalog already matches the inventory." : sb.ToString().TrimEnd());
        }
    }
}
