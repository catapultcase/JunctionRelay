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

namespace JunctionRelayServer.Models
{
    // Models module (MODELS) — one measurement. Append-only, the Lab_MarketValues
    // discipline: rows are never updated or deleted, because the SERIES is the value.
    // A single overwritten number tells you today's speed; a ledger tells you what a
    // driver update, a quant change or a KV precision change actually cost.
    //
    // ⚠️ Measured means measured: a figure from /api/metrics/activity with the
    // one-token-probe rows dropped, or a timed run — never a spec-sheet estimate.
    public class Model_Models_Benchmark
    {
        public int Id { get; set; }

        // The model this run measured, as TEXT, and the row's own identity. Use
        // the plain model name ('qwen3.8-27b'), NOT a serving id - quant,
        // context and MTP are fields of their own below.
        public string ModelName { get; set; } = string.Empty;

        // OPTIONAL soft link to a Models_Catalog entry, when one matches.
        //
        // ⚠️ Nullable on purpose. Anyone must be able to benchmark a model they
        // have not catalogued: JR is distributed, and the catalog is one user's
        // shelf of what they downloaded, not a registry of what may be measured.
        // It is also what stops history breaking when the shelf is reorganised -
        // collapsing the quant-named entries into models deleted
        // entries and forced 100 rows to be re-pointed, which a required id makes
        // unavoidable and a nullable one makes a no-op. A measurement is a
        // historical fact; it must not depend on catalog state that changes after
        // the fact. models_link_benchmarks attaches unlinked rows later.
        public int? ModelId { get; set; }

        // Soft ref to Lab_Machines.Id, no FK — the machine the number was measured ON.
        // The same model on two boxes is two different measurements.
        public int? MachineId { get; set; }

        // What was measured: gen_tok_s, prompt_tok_s, cold_load_s, vram_gb.
        // Free text rather than an enum so a new metric does not need a schema change.
        public string Metric { get; set; } = string.Empty;

        public double Value { get; set; }

        // Stamped on every capture. Backdatable so measurements recorded from old
        // notes keep the date they were taken, not the date of data entry.
        public DateTime CapturedAt { get; set; }

        // Where the figure came from: 'llama-swap activity', 'manual run', 'llm-bench'.
        public string? Source { get; set; }
        // THE TIN, when the machine name is a role. "Node A" has moved
        // between three boxes in a week; a tok/s figure belongs to the hardware it ran on,
        // so the row names it ("Acer Veriton GN100") beside the Lab machine. Optional; the
        // Lab inventory's current parts are NOT a substitute, they describe today.
        public string? Hardware { get; set; }
        // THE THINKING SETTING the run was served under: "on", "off", or an
        // effort level ("max", "none"). A reasoning pass changes what the user feels far more
        // than the parameter count does, so it rides the row like quant and KV. Optional.
        public string? Thinking { get; set; }

        // ── THE SETUP THIS NUMBER WAS MEASURED UNDER ────────────────────────
        // First-class columns, captured at RUN TIME by whatever tool submits.
        //
        // ⛔ These must never be filled in from the catalog. The catalog holds
        // MODELS, so it can only answer "the three quants we own" when asked
        // which quant a run used - which is exactly the bug that printed every
        // quant against every row. A field the submitter did not capture stays
        // NULL and renders as "—": unknown is a legitimate answer, a borrowed
        // value is not.

        // Quant tier of the FILE that was loaded, as the filename spells it:
        // 'UD-Q4_K_XL', 'Q8_0', 'f16'.
        public string? Quant { get; set; }

        // Context the server was serving with, in tokens (131072), and how many
        // concurrent slots (--parallel).
        public int? ContextTokens { get; set; }
        public int? Slots { get; set; }

        // KV cache precision: 'f16', 'q8_0', 'q4_0'.
        public string? KvPrecision { get; set; }

        // Multi-token prediction in use (--spec-type draft-mtp), and whether the
        // run had vision loaded. Tri-state: null = the submitter did not say, so
        // the UI says nothing rather than calling a capability missing.
        public bool? Mtp { get; set; }
        public bool? Vision { get; set; }

        // Engine build the number came off, e.g. 'b10639-2a36554fc'. A speed
        // without its engine is not comparable across an upgrade.
        public string? Engine { get; set; }

        // Size of the weights ACTUALLY LOADED, GB. ⛔ Not the catalog's SizeGb,
        // which is the total of every quant held (68 GB for the 27B across
        // q4+q5+q8) - using that to judge "won't fit" calls every setup
        // impossible.
        public double? WeightsGb { get; set; }

        // Anything else the submitting tool wants to keep, as JSON. A free-form
        // bag for tool-specific extras (--n-cpu-moe, sampler settings); the
        // fields above are the contract. Local-only: excluded from the cloud
        // sync contract like SpecJson, and for the same reason.
        public string? ConfigJson { get; set; }

        // The BENCHMARK CONTRACT's load regime: shallow | code | deep |
        // parallel_xN. First-class since 0.9.0.63 - it began life as a
        // "scenario=..." convention inside Notes, which readers still fall
        // back to for rows from that era.
        public string? Scenario { get; set; }

        // Caveats worth keeping with the number: context depth, batch, driver.
        public string? Notes { get; set; }

        public DateTime CreatedAt { get; set; }
    }
}
