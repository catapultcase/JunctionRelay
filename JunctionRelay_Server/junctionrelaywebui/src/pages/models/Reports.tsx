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

import { useCallback, useEffect, useState } from "react";
import { Box, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { usePageTitle } from "../../hooks/usePageTitle";
import { ModelsBenchmark, fetchMachineNames } from "./modelsTypes";
import ReportOverTime from "./ReportOverTime";
import ReportMoE from "./ReportMoE";

// REPORTS: one ledger, several READINGS of it. The selector at the top picks
// the reading:
//   - Over time: one exact setup, every run a point, engine changes marked.
//   - MoE placement: how a mixture-of-experts model's speed falls with each
//     expert layer moved to system RAM, whether the window matters, what
//     depth costs, what the batch buys - the reading that decided the
//     Flash-Next forecast.
// Each report is its own component over the same loaded rows; this page only
// loads and routes.

type ReportKind = "time" | "moe";
const REPORTS: { key: ReportKind; label: string }[] = [
    { key: "time", label: "Over time" },
    { key: "moe", label: "MoE placement" },
];
const PREF_KEY = "models.reports.kind";

const ModelsReports = () => {
    usePageTitle("Models · Reports");
    const [benchmarks, setBenchmarks] = useState<ModelsBenchmark[]>([]);
    const [machines, setMachines] = useState<Map<number, string>>(new Map());
    const [error, setError] = useState<string | null>(null);
    const [kind, setKind] = useState<ReportKind>(() => {
        try { const v = localStorage.getItem(PREF_KEY); if (v === "time" || v === "moe") return v; } catch { /* no storage, no memory */ }
        return "time";
    });

    const load = useCallback(async () => {
        try {
            const [benchRes, machineMap] = await Promise.all([
                fetch("/api/models/benchmarks/recent?limit=20000"),
                fetchMachineNames()
            ]);
            if (!benchRes.ok) throw new Error(await benchRes.text());
            setBenchmarks(await benchRes.json());
            setMachines(machineMap);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load the ledger");
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    const pick = (k: ReportKind | null) => {
        if (!k) return;
        setKind(k);
        try { localStorage.setItem(PREF_KEY, k); } catch { /* fine */ }
    };

    return (
        <Box sx={{ p: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", mb: 1.5 }}>
                <Typography variant="h6">Reports</Typography>
                <ToggleButtonGroup size="small" exclusive value={kind} onChange={(_, v) => pick(v)} aria-label="report">
                    {REPORTS.map(r => (
                        <ToggleButton key={r.key} value={r.key} sx={{ fontSize: 12, textTransform: "none", px: 1.5 }}>{r.label}</ToggleButton>
                    ))}
                </ToggleButtonGroup>
            </Box>
            {error && <Typography color="error" variant="body2" sx={{ mb: 2 }}>{error}</Typography>}
            {kind === "time"
                ? <ReportOverTime benchmarks={benchmarks} machines={machines} />
                : <ReportMoE benchmarks={benchmarks} machines={machines} />}
        </Box>
    );
};

export default ModelsReports;
