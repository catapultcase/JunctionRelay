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

import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Paper, Typography } from "@mui/material";
import { usePageTitle } from "../../hooks/usePageTitle";
import { ModelsBenchmark, fetchMachineNames } from "./modelsTypes";
import { RAG_AMBER, RAG_GREEN, RUNGS, depthOf, prefillColor, scenarioOf, speedColor, utcDate } from "./benchmarkContract";

// The MODELS landing page: FLEET ALTITUDE, an overview above the per-setup
// detail that lives on Benchmarks.
// One card per machine, one line of derived status each, plus a fleet strip.
// Everything on this page is computed from the ledger and the lab inventory;
// nothing is ranked, recommended or invented. The engine-mismatch note is the
// only editorial voice, and it states a measured fact.

interface MachineSummary {
    name: string;
    hw: string | null;
    engine: string | null;
    setups: number;
    measurements: number;
    minGen: number; maxGen: number;
    bands: { green: number; amber: number; red: number };
    lastAt: string;
    // Highlights, not detail: the
    // fastest setup at 4K, and the best 128K turn - its tok/s with the prompt
    // speed that fed it. The per-setup detail is the Benchmarks matrix.
    fastest: { model: string; gen: number } | null;
    review: { model: string; gen: number; prefill: number | null } | null;
}

const ModelsDashboard = () => {
    usePageTitle("Models");

    const [benchmarks, setBenchmarks] = useState<ModelsBenchmark[]>([]);
    const [machines, setMachines] = useState<Map<number, string>>(new Map());
    const [hwByMachine, setHwByMachine] = useState<Map<string, string>>(new Map());
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const [benchRes, componentsRes, machineMap] = await Promise.all([
                fetch("/api/models/benchmarks/recent?limit=20000"),
                fetch("/api/lab/components"),
                fetchMachineNames()
            ]);
            if (!benchRes.ok) throw new Error(await benchRes.text());
            setBenchmarks(await benchRes.json());
            setMachines(machineMap);
            // Hardware garnish from the lab inventory; optional by design.
            if (componentsRes.ok) {
                const comps: { type: string; manufacturer?: string | null; model?: string | null; spec?: string | null; currentMachineName?: string | null }[] = await componentsRes.json();
                const gb = (s: string | null | undefined) => /(\d+(?:\.\d+)?)\s*GB/i.exec(s ?? "")?.[1];
                const hw = new Map<string, string>();
                const byMach = new Map<string, typeof comps>();
                comps.forEach(c => { if (c.currentMachineName) (byMach.get(c.currentMachineName) ?? byMach.set(c.currentMachineName, []).get(c.currentMachineName)!).push(c); });
                for (const [mach, parts] of byMach) {
                    const gpus = parts.filter(p => p.type.toUpperCase() === "GPU")
                        .map(p => `${[p.manufacturer, p.model].filter(Boolean).join(" ")}${gb(p.spec) ? ` ${gb(p.spec)} GB` : ""}`);
                    const ram = parts.filter(p => /^(RAM|MEMORY)$/i.test(p.type))
                        .reduce((n, p) => n + Number(gb(p.spec) ?? 0), 0);
                    if (gpus.length) hw.set(mach, gpus.join(" + ") + (ram ? ` · ${ram} GB RAM` : ""));
                }
                setHwByMachine(hw);
            }
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load the fleet overview");
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    const fleet = useMemo(() => {
        // Latest deep gen per (machine, model) drives the bands and ranges;
        // rows arrive newest-first.
        const deepSeen = new Map<string, number>();
        // Latest review gen / prefill per (machine, setup) - the highlight is the
        // setup with the best review tok/s, shown with the prefill that fed it.
        const reviewGen = new Map<string, number>();
        const reviewPre = new Map<string, number>();
        const perMachine = new Map<string, MachineSummary>();
        for (const b of benchmarks) {
            if (b.machineId == null) continue;
            const mach = machines.get(b.machineId) ?? `#${b.machineId}`;
            const m = perMachine.get(mach) ?? perMachine.set(mach, {
                name: mach, hw: null, engine: null, setups: 0, measurements: 0,
                minGen: Infinity, maxGen: -Infinity,
                bands: { green: 0, amber: 0, red: 0 }, lastAt: b.capturedAt,
                fastest: null, review: null
            }).get(mach)!;
            m.measurements++;
            if (b.capturedAt > m.lastAt) m.lastAt = b.capturedAt;
            // The engine is a field ON THE ROW (contract v2) - it was a
            // configJson key, and a key that no submitter had to set.
            if (!m.engine && b.engine) m.engine = b.engine;
            // Keyed by the row's own model name and the quant it ran: a benchmark
            // need not be linked to a catalog entry, so modelId can be null.
            const label = `${b.modelName}${b.quant ? ` ${b.quant}` : ""}`;
            const key = `${mach}|${label}|${b.contextTokens ?? ""}`;
            const depth = depthOf(scenarioOf(b));
            if (b.metric === "gen_tok_s" && depth === RUNGS.short) {
                if (!deepSeen.has(key)) {
                    deepSeen.set(key, b.value);
                    m.setups++;
                    m.minGen = Math.min(m.minGen, b.value);
                    m.maxGen = Math.max(m.maxGen, b.value);
                    if (b.value >= RAG_GREEN) m.bands.green++;
                    else if (b.value >= RAG_AMBER) m.bands.amber++;
                    else m.bands.red++;
                    if (!m.fastest || b.value > m.fastest.gen) m.fastest = { model: label, gen: b.value };
                }
            } else if (b.metric === "gen_tok_s" && depth === RUNGS.deep) {
                if (!reviewGen.has(key)) reviewGen.set(key, b.value);
            } else if (b.metric === "prompt_tok_s" && depth === RUNGS.deep) {
                if (!reviewPre.has(key)) reviewPre.set(key, b.value);
            }
        }
        for (const [key, gen] of reviewGen) {
            const [mach, label] = key.split("|");
            const m = perMachine.get(mach);
            if (m && (!m.review || gen > m.review.gen)) m.review = { model: label, gen, prefill: reviewPre.get(key) ?? null };
        }
        const list = [...perMachine.values()]
            .sort((a, b) => (b.fastest?.gen ?? 0) - (a.fastest?.gen ?? 0) || a.name.localeCompare(b.name));
        list.forEach(m => { m.hw = hwByMachine.get(m.name) ?? null; });
        const engines = [...new Set(list.map(m => m.engine).filter(Boolean))] as string[];
        const lastAt = list.map(m => m.lastAt).sort().pop() ?? null;
        return { list, engines, lastAt, totalMeasurements: list.reduce((n, m) => n + m.measurements, 0) };
    }, [benchmarks, machines, hwByMachine]);

    const eyebrowSx = {
        fontSize: 11, fontWeight: 700, letterSpacing: "0.11em",
        textTransform: "uppercase" as const, color: "text.secondary"
    };

    const bandDots = (b: MachineSummary["bands"]) => (
        <Box component="span" sx={{ whiteSpace: "nowrap" }}>
            {([["#2e7d32", b.green], ["#ed6c02", b.amber], ["#d32f2f", b.red]] as const)
                .filter(([, n]) => n > 0)
                .map(([c, n], i) => (
                    <Box key={i} component="span" sx={{ mr: 1.5, whiteSpace: "nowrap" }}>
                        <Box component="span" sx={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", bgcolor: c, mr: 0.5, verticalAlign: "1px" }} />
                        <b>{n}</b>
                    </Box>
                ))}
        </Box>
    );

    return (
        <Box sx={{ p: 2, fontVariantNumeric: "tabular-nums" }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Models</Typography>

            {error && <Typography color="error" variant="body2" sx={{ mb: 2 }}>{error}</Typography>}

            {fleet.list.length === 0 && !error ? (
                <Typography variant="body2" color="text.secondary">
                    No measurements yet — any suite that speaks the benchmark contract
                    (docs/BENCHMARK-CONTRACT.md) fills this page.
                </Typography>
            ) : (
                <>
                    {/* ---- Fleet strip ---- */}
                    <Paper sx={{ p: "12px 20px", mb: 2.5, display: "flex", gap: 4, flexWrap: "wrap", alignItems: "baseline" }}>
                        <Typography variant="body2"><b>{fleet.list.length}</b> machines benched</Typography>
                        <Typography variant="body2"><b>{fleet.list.reduce((n, m) => n + m.setups, 0)}</b> setups measured</Typography>
                        <Typography variant="body2"><b>{fleet.totalMeasurements}</b> measurements</Typography>
                        {fleet.lastAt && <Typography variant="body2">last suite <b>{utcDate(fleet.lastAt).toLocaleString()}</b></Typography>}
                        {fleet.engines.length > 1 && (
                            <Typography variant="body2" sx={{ color: "#b45309", fontWeight: 600 }}>
                                ⚠ engines differ: {fleet.engines.join(" vs ")} — cross-machine numbers are not fully comparable
                            </Typography>
                        )}
                        {fleet.engines.length === 1 && (
                            <Typography variant="body2" color="text.secondary">engine {fleet.engines[0]}</Typography>
                        )}
                    </Paper>

                    {/* ---- One card per machine ---- */}
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0,1fr))" }, gap: 2.5, alignItems: "start" }}>
                        {fleet.list.map(m => (
                            <Paper key={m.name} sx={{ p: "18px 20px" }}>
                                <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
                                    <Typography sx={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{m.name}</Typography>
                                    {m.hw && <Typography variant="caption" color="text.secondary">{m.hw}</Typography>}
                                </Box>
                                <Box sx={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 18px", mt: 1.5, fontSize: 13.5, alignItems: "baseline" }}>
                                    <Box sx={{ ...eyebrowSx, fontSize: 10 }}>Setups</Box>
                                    <Box><b>{m.setups}</b> measured · {m.measurements} data points</Box>
                                    <Box sx={{ ...eyebrowSx, fontSize: 10 }}>Speed range</Box>
                                    <Box>
                                        <Box component="span" sx={{ fontWeight: 700, color: speedColor(m.minGen) }}>{m.minGen.toFixed(0)}</Box>
                                        {" – "}
                                        <Box component="span" sx={{ fontWeight: 700, color: speedColor(m.maxGen) }}>{m.maxGen.toFixed(0)}</Box>
                                        {" tok/s deep"}
                                    </Box>
                                    <Box sx={{ ...eyebrowSx, fontSize: 10 }}>Bands</Box>
                                    <Box>{bandDots(m.bands)}</Box>
                                    <Box sx={{ ...eyebrowSx, fontSize: 10 }}>Fastest</Box>
                                    <Box>
                                        {m.fastest ? (
                                            <>
                                                <Box component="span" sx={{ fontWeight: 700, color: speedColor(m.fastest.gen) }}>{m.fastest.gen.toFixed(0)}</Box>
                                                {" tok/s at 4K · "}
                                                <Box component="span" sx={{ color: "text.secondary" }}>{m.fastest.model}</Box>
                                            </>
                                        ) : <Box component="span" sx={{ color: "text.secondary" }}>—</Box>}
                                    </Box>
                                    <Box sx={{ ...eyebrowSx, fontSize: 10 }}>128K prompt</Box>
                                    <Box>
                                        {m.review ? (
                                            <>
                                                <Box component="span" sx={{ fontWeight: 700, color: m.review.prefill != null ? prefillColor(m.review.prefill) : "text.secondary" }}>{m.review.prefill != null ? Math.round(m.review.prefill).toLocaleString() : "—"}</Box>
                                                {" pp · "}
                                                <Box component="span" sx={{ fontWeight: 700, color: speedColor(m.review.gen) }}>{m.review.gen.toFixed(0)}</Box>
                                                {" tok/s · "}
                                                <Box component="span" sx={{ color: "text.secondary" }}>{m.review.model}</Box>
                                            </>
                                        ) : <Box component="span" sx={{ color: "text.secondary" }}>not run</Box>}
                                    </Box>
                                    <Box sx={{ ...eyebrowSx, fontSize: 10 }}>Engine</Box>
                                    <Box sx={{ color: "text.secondary" }}>{m.engine ?? "unknown"}</Box>
                                    <Box sx={{ ...eyebrowSx, fontSize: 10 }}>Last benched</Box>
                                    <Box sx={{ color: "text.secondary" }}>{utcDate(m.lastAt).toLocaleString()}</Box>
                                </Box>
                            </Paper>
                        ))}
                    </Box>
                </>
            )}
        </Box>
    );
};

export default ModelsDashboard;
