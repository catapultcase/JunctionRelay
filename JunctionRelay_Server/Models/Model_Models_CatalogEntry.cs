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
    // Models module (MODELS) — one archived weight. This is the row the prose model
    // docs kept trying to be: family, quant, context, KV precision, measured size and
    // the trait that decides the choice, plus what superseded what. A name like
    //   Qwen3.8-27B dense Q4_K_XL | 256K q8_0 | 17.9GB | vision
    // is DERIVED from these columns, never the storage format.
    //
    // Column-only POCO by design: no derived-on-read display properties, so a cloud
    // sync projection can serialize instances without dragging computed fields along.
    public class Model_Models_CatalogEntry
    {
        public int Id { get; set; }

        // ⛔ THE MODEL, NOT A SERVING ID: 'qwen3.8-27b', never 'qwen3.8-27b-128k-mtp'.
        // A catalog entry is a CHECKPOINT we own, and quant, window, KV and MTP are
        // ways of RUNNING it that belong to the serving map and to a benchmark's
        // own fields. models_add_model rejects a name carrying such a suffix.
        public string Name { get; set; } = string.Empty;

        // Family/architecture: 'Qwen3.8', 'Llama-4', 'whisper-large-v3'.
        public string? Family { get; set; }

        // Parameter count in billions. 27, 80, 0.6.
        public double? ParamsB { get; set; }

        // 'Dense' | 'MoE' | 'Hybrid'. The one property that predicts how a
        // model serves: a dense reads every weight per token, a MoE reads only its active
        // experts - which is why a 35B MoE generates 2.5x faster than a 27B dense on the
        // same cards, and why a MoE tolerates experts in RAM at all. Free text on purpose,
        // like Category: 'Hybrid' covers the Mamba-transformer mixes without a schema change.
        public string? Architecture { get; set; }

        // Active parameters per token in billions, for a MoE (35B-A3B -> 3). ParamsB is the
        // total; this is the figure that predicts generation speed. Null for a dense.
        public double? ActiveParamsB { get; set; }

        // The checkpoint's public release, 'YYYY-MM-DD'. The upstream publication
        // date, not when we downloaded it -
        // CreatedAt below is ours. Text, so a month-only date can be '2026-09'.
        public string? ReleaseDate { get; set; }

        // Quant tier exactly as the filename spells it: 'UD-Q4_K_XL', 'Q8_0', 'f16'.
        public string? Quant { get; set; }

        // The quants of this model we actually hold, each with its own MEASURED
        // size: [{"quant":"UD-Q4_K_XL","sizeGb":17.92}, ...]. The catalog holds
        // MODELS, so a quant is never its own entry - it is a row inside one,
        // and SizeGb above is their total.
        public string? QuantsJson { get; set; }

        // Context length in tokens the weights are served with (131072, 262144).
        public int? ContextLength { get; set; }

        // KV cache precision ('q8_0', 'f16'). Not decoration: the long-context entries
        // are only reachable BECAUSE their cache is quantized, and while every model
        // read as '<family> - <context>' nothing said so.
        public string? KvCachePrecision { get; set; }

        // ⚠️ Weights size in GB, MEASURED (the ls -l figure), never estimated.
        // A quant tier is not a size: UD-Q4_K_XL is 17.92 GB for one family and
        // 49.61 GB for another.
        public double? SizeGb { get; set; }

        // JSON array of the traits that decide a choice: ["vision","experts in RAM","mtp"].
        public string? TraitsJson { get; set; }

        // Where the weights live (share path, host folder). Stays local — excluded
        // from cloud sync as storage topology.
        public string? StorageLocation { get; set; }

        // The workload class this model serves: 'Agentic Coding', 'General AI',
        // 'Vision', 'Utility'... Free text, not an enum - a new use case must not
        // need a schema change. Drives the Benchmarks browser's table grouping.
        public string? Category { get; set; }

        // active | archived | superseded
        public string Status { get; set; } = "active";

        // Self-ref: the catalog entry that replaced this one. The chain answers
        // 'what superseded what' without prose.
        public int? SupersededById { get; set; }

        public string? Notes { get; set; }

        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
