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
    // Models module (MODELS) — reference scores: PUBLISHED third-party eval
    // figures for known models (SWE-bench, Aider…), cited from online sources.
    // Their own table on purpose: they are citations about a checkpoint, not
    // fleet measurements, and they never mix with the benchmark ledger.
    public class Model_Models_ReferenceScore
    {
        public int Id { get; set; }

        public int ModelId { get; set; }

        // Which published benchmark: swe_bench_verified, swe_bench_pro,
        // aider_polyglot… Free text so a new benchmark needs no schema change.
        public string Benchmark { get; set; } = string.Empty;

        public double Score { get; set; }

        // The citation — the URL the figure came from. Required: an uncited
        // published score is a rumor.
        public string Source { get; set; } = string.Empty;

        // ── What makes this score COMPARABLE, as fields ───────────────────
        // ⛔ Not inside Notes as a sentence: nothing could filter or group on
        // them there, and they could not leave the box - the sync contract
        // excludes free text, so a remote agent would see "73.4" with no idea
        // it was a vendor's own number at BF16 on their own scaffold. A fact
        // that decides whether two numbers can be compared belongs in a column.

        // independent | vendor_reported. ⚠️ A vendor's own claim and an
        // independently-run figure are not the same evidence: Aider Polyglot's
        // leaderboard once read 0 verified / 22 self-reported. Null means
        // nobody has established which.
        public string? Provenance { get; set; }

        // The precision actually evaluated - BF16, FP8, a quant name. Published
        // figures almost always describe the full-precision checkpoint, never
        // the quant a box serves.
        public string? EvaluatedPrecision { get; set; }

        // The harness: "SWE-Agent", "Claude Code", "Qwen internal agent scaffold".
        // Scaffold moves a SWE-bench number by more than most model differences.
        public string? Scaffold { get; set; }

        // Context window the evaluation ran at.
        public int? EvaluatedContextTokens { get; set; }

        // Anything the fields above cannot hold. Stays ON THE BOX.
        public string? Notes { get; set; }

        public DateTime CapturedAt { get; set; }

        public DateTime CreatedAt { get; set; }
    }
}
