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
    // Models module (MODELS) — fit verdicts: "this exact setup CANNOT SERVE on
    // this machine", with the evidence. A verdict is NOT a measurement and does
    // not live in the benchmark ledger (parked there as a fake metric, a delete
    // aimed at one bad verdict could destroy real measurements). The
    // Benchmarks matrix renders a verdict as a "won't fit"
    // cell instead of "untested".
    public class Model_Models_FitVerdict
    {
        public int Id { get; set; }

        public int ModelId { get; set; }

        // Soft ref to Lab_Machines.Id — the box the setup cannot serve on.
        public int MachineId { get; set; }

        // The EXACT setup the verdict is about (ctx, KV, slots, MTP, spill…) —
        // the same model on the same box may fit under a different config.
        public string ConfigJson { get; set; } = string.Empty;

        // The load error verbatim from the box's own logs. TESTED ONLY - a
        // policy or an untried argument is not a verdict.
        public string Reason { get; set; } = string.Empty;

        // Who established it: a suite name, or 'policy'.
        public string? Source { get; set; }

        public DateTime CapturedAt { get; set; }

        public DateTime CreatedAt { get; set; }
    }
}
