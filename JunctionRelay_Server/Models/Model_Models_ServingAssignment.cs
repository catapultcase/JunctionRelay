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
    // Models module (MODELS) — which box holds which model. One row per
    // (model, machine) slot: the server serving the brain resident, the desktop serving six
    // coding models on demand. Column-only POCO, same reason as the catalog entry.
    public class Model_Models_ServingAssignment
    {
        public int Id { get; set; }

        public int ModelId { get; set; }

        // Soft ref to Lab_Machines.Id, NO foreign key — the Lab module must stay
        // removable as a unit, and so must this one. NULL = machine not tracked in Lab.
        public int? MachineId { get; set; }

        // The name consumers actually ask for when it differs from the model id:
        // 'brain' is a warm selector over whichever model is loaded.
        public string? Alias { get; set; }

        // Port the serving stack answers on (llama-swap convention: 8080).
        public int? EndpointPort { get; set; }

        // resident | on-demand. Resident models are preloaded at boot and stay in
        // VRAM together; on-demand models load when asked for (~12 s cold).
        public string Mode { get; set; } = "on-demand";

        // The model this box serves when asked for its default/selector id.
        public bool IsDefault { get; set; }

        // active | retired. A retired row is history: the assignment existed and ended.
        public string Status { get; set; } = "active";

        // ── What this slot ACTUALLY serves ────────────────────────────────
        // ⛔ These are NOT lookups into the catalog. A catalog entry is a
        // CHECKPOINT and lists every quant we own of it - six, for the 27B - so
        // rendering the catalog's quant here printed all six against a slot
        // serving exactly one, and the catalog's total size (131 GB) against a
        // slot holding 17.9 GB.
        //
        // Same ethic as the benchmark contract: the row states what it is, and
        // borrows nothing. It also lets a benchmark be matched to the setup
        // actually being served rather than to any run on that box.
        public string? Quant { get; set; }

        public int? ContextTokens { get; set; }

        public int? Slots { get; set; }

        public string? KvPrecision { get; set; }

        public bool? Mtp { get; set; }

        public bool? Vision { get; set; }

        // The weights this slot loads, GB - not the catalog's total across quants.
        public double? WeightsGb { get; set; }
        // THE ENGINE AND WHAT ITS WINDOW MEANS. llama.cpp splits -c across -np fixed
        // slots; vLLM and TensorFold give EVERY stream the whole window out of one shared KV pool.
        // The serving page drew Node C as 5 x 51K when it serves 5 x 262K, because it could only
        // guess. Now the row says: Engine ("TensorFold v0.6.1"), SharedKv (true = each of Slots gets
        // ContextTokens; false/null = ContextTokens is split between them), PoolTokens (the shared
        // pool's size, when the engine reports one).
        public string? Engine { get; set; }
        public bool? SharedKv { get; set; }
        public int? PoolTokens { get; set; }
        // The thinking setting this slot serves under: "on", "off", or an effort level
        // ("max", "none") - the same vocabulary as Models_Benchmarks.Thinking, so a card can say how
        // its model answers and match the benchmark rows run that way. NULL = not stated.
        public string? Thinking { get; set; }

        // ── Its row on the serving page: only the rows chosen for a card, editable in the web UI and
        // over MCP without a rebuild ──────────────────────────────────────────────────────────
        // A box's card is the machine; each row with OnCard gets one line inside it, in CardOrder,
        // labelled CardLabel ("Full", "Brief"). Rows without OnCard stay on the map and in
        // models_query - planned bake-off rows, on-demand extras - and get no line.
        public bool OnCard { get; set; }
        public string? CardLabel { get; set; }
        public int? CardOrder { get; set; }
        // A PRESET of another row's process: the same load on the same machine, which clients ask
        // for differently per request - GLM Brief (thinking low) shares GLM Full's weights, window
        // and streams. Its line says so and repeats none of them, and nothing counts its load twice.
        // Points at a row on the same machine that is not itself a preset.
        public int? SharesWith { get; set; }

        public string? Notes { get; set; }

        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
