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
import {
    Box, FormControl, InputLabel, MenuItem, Paper, Select, Typography, useTheme
} from "@mui/material";
import {
    CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer,
    Tooltip as ChartTooltip, XAxis, YAxis
} from "recharts";
import { ModelsBenchmark, machineLabel } from "./modelsTypes";
import { scenarioOf, utcDate, placementOf, placementLabel, depthOf, concurrencyOf } from "./benchmarkContract";

// OVER TIME: the ledger over TIME - whether prefill and tok/s improved as the
// hardware and software changed. Pick a machine, a
// model and one exact setup of it; every run of that setup becomes a point.
// Generation and prefill are different scales, so they are TWO charts with one
// axis each - never a dual axis. Engine changes are marked on the time axis,
// since a speed series without its engine is not one series.

interface RunPoint {
    t: number;          // ms since epoch, the run's first row
    at: string;
    engine: string | null;
    // The three matrix rungs of the depth ladder, plus concurrency.
    k4?: number; k32?: number; k128?: number; each?: number;
    p4?: number; p32?: number; p128?: number;
    watts?: number;
}

interface Setup {
    key: string; label: string;
    quant: string | null; kv: string; ctxK: number | null; slots: number | null; mtp: boolean | null;
    placement: string;   // "12 in RAM · split 39,31,30 · ub 512" - part of the identity
    rows: ModelsBenchmark[];
}

// Fixed categorical hues (the validated default palette, light / dark steps),
// assigned to a scenario for good - a series never changes colour because
// another one is absent.
const HUES = {
    k4:   { light: "#2a78d6", dark: "#3987e5" },
    k32:  { light: "#eb6834", dark: "#d95926" },
    k128: { light: "#1baf7a", dark: "#199e70" },
    each: { light: "#eda100", dark: "#c98500" },
};

const GEN_SERIES: { key: keyof typeof HUES; label: string }[] = [
    { key: "k4", label: "4K prompt" },
    { key: "k32", label: "32K prompt" },
    { key: "k128", label: "128K prompt" },
    { key: "each", label: "×N per stream" },
];
const PRE_SERIES: { key: "p4" | "p32" | "p128"; hue: keyof typeof HUES; label: string }[] = [
    { key: "p4", hue: "k4", label: "4K prompt" },
    { key: "p32", hue: "k32", label: "32K prompt" },
    { key: "p128", hue: "k128", label: "128K prompt" },
];

// Rows of one setup cluster into RUNS: a suite posts its scenarios minutes
// apart, so rows within 45 minutes of a cluster's first row are one run.
const RUN_WINDOW_MS = 45 * 60 * 1000;

const ReportOverTime = ({ benchmarks, machines }: { benchmarks: ModelsBenchmark[]; machines: Map<number, string> }) => {
    const theme = useTheme();
    const dark = theme.palette.mode === "dark";

    const [machine, setMachine] = useState<string>("");
    const [model, setModel] = useState<string>("");
    const [setupKey, setSetupKey] = useState<string>("");

    const speedRows = useMemo(() => benchmarks.filter(b => b.machineId != null
        && ["gen_tok_s", "prompt_tok_s", "gpu_watts_avg"].includes(b.metric)), [benchmarks]);
    const machineOf = useCallback((b: ModelsBenchmark) => machineLabel(machines, b), [machines]);

    const machineNames = useMemo(() => [...new Set(speedRows.map(machineOf))].sort(), [speedRows, machineOf]);
    const modelNames = useMemo(() => [...new Set(speedRows.filter(b => machineOf(b) === machine).map(b => b.modelName))].sort(),
        [speedRows, machineOf, machine]);

    // Exact setups of the chosen model on the chosen machine, most-measured first.
    const setups = useMemo((): Setup[] => {
        const map = new Map<string, Setup>();
        for (const b of speedRows) {
            if (machineOf(b) !== machine || b.modelName !== model) continue;
            const kv = b.kvPrecision ?? "f16";
            const ctxK = b.contextTokens ? Math.round(b.contextTokens / 1024) : null;
            // ⛔ THE PLACEMENT IS PART OF THE SETUP. Without it every layers-in-RAM
            // count, split and ubatch of one quant/window landed in one series and
            // the line jumped between configs.
            const placement = placementLabel(placementOf(b.configJson)).join(" · ");
            const key = `${b.quant ?? "?"}|${ctxK ?? "?"}|${kv}|${b.slots ?? "?"}|${b.mtp ? 1 : 0}|${placement}`;
            const s = map.get(key) ?? map.set(key, {
                key, quant: b.quant, kv, ctxK, slots: b.slots, mtp: b.mtp, placement, rows: [],
                label: [b.quant ?? "quant ?", ctxK != null ? `${ctxK}K` : "window ?", `${kv} KV`,
                    b.slots != null ? `${b.slots} slot${b.slots === 1 ? "" : "s"}` : null, b.mtp ? "MTP" : null,
                    placement || null]
                    .filter(Boolean).join(" · ")
            }).get(key)!;
            s.rows.push(b);
        }
        return [...map.values()].sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label));
    }, [speedRows, machineOf, machine, model]);

    // Defaults follow the data: first machine, its most-measured model, that
    // model's most-measured setup. A stale pick (after a reload) resets.
    useEffect(() => { if (!machine && machineNames.length) setMachine(machineNames[0]); }, [machine, machineNames]);
    useEffect(() => {
        if (!modelNames.includes(model)) {
            const counts = new Map<string, number>();
            speedRows.filter(b => machineOf(b) === machine).forEach(b => counts.set(b.modelName, (counts.get(b.modelName) ?? 0) + 1));
            setModel([...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "");
        }
    }, [machine, model, modelNames, speedRows, machineOf]);
    useEffect(() => { if (!setups.some(s => s.key === setupKey)) setSetupKey(setups[0]?.key ?? ""); }, [setups, setupKey]);

    const setup = setups.find(s => s.key === setupKey) ?? null;

    // The runs of the chosen setup, oldest first.
    const runs = useMemo((): RunPoint[] => {
        if (!setup) return [];
        const rows = [...setup.rows].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
        const out: RunPoint[] = [];
        for (const b of rows) {
            const t = utcDate(b.capturedAt).getTime();
            let run = out[out.length - 1];
            if (!run || t - run.t > RUN_WINDOW_MS) {
                run = { t, at: b.capturedAt, engine: b.engine };
                out.push(run);
            }
            if (!run.engine && b.engine) run.engine = b.engine;
            const scen = scenarioOf(b);
            const depth = depthOf(scen);
            if (b.metric === "gen_tok_s") {
                if (depth === 4) run.k4 = b.value;
                else if (depth === 32) run.k32 = b.value;
                else if (depth === 128) run.k128 = b.value;
                else if (concurrencyOf(scen)) run.each = b.value;
            } else if (b.metric === "prompt_tok_s") {
                if (depth === 4) run.p4 = b.value;
                else if (depth === 32) run.p32 = b.value;
                else if (depth === 128) run.p128 = b.value;
            } else if (b.metric === "gpu_watts_avg" && (depth === 32 || (depth === 4 && run.watts == null))) run.watts = b.value;
        }
        return out;
    }, [setup]);

    // Where the engine changed between consecutive runs - a reference line each.
    const engineChanges = useMemo(() => {
        const out: { t: number; engine: string }[] = [];
        for (let i = 1; i < runs.length; i++)
            if (runs[i].engine && runs[i].engine !== runs[i - 1].engine) out.push({ t: runs[i].t, engine: runs[i].engine! });
        return out;
    }, [runs]);

    const hue = (k: keyof typeof HUES) => dark ? HUES[k].dark : HUES[k].light;
    const surface = theme.palette.background.paper;
    const ink = theme.palette.text.primary;
    const inkSecondary = theme.palette.text.secondary;
    const grid = theme.palette.divider;

    const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const fmtNum = (v: number) => Math.round(v).toLocaleString();

    // A chart: one measure, one axis. Lines 2px, markers >= 8px with a surface
    // ring, hairline solid grid, legend always (>= 2 series), crosshair tooltip.
    const chart = (title: string, unit: string, series: { key: string; hue: keyof typeof HUES; label: string }[]) => {
        const present = series.filter(s => runs.some(r => (r as unknown as Record<string, number | undefined>)[s.key] != null));
        return (
            <Paper sx={{ p: "16px 20px 8px" }}>
                <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 0.5 }}>{title} <Box component="span" sx={{ color: "text.secondary", fontWeight: 500 }}>· {unit}</Box></Typography>
                {present.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>no runs carry this measure for the chosen setup</Typography>
                ) : (
                    <Box sx={{ width: "100%", height: 300 }}>
                        <ResponsiveContainer>
                            <LineChart data={runs} margin={{ top: 12, right: 28, bottom: 4, left: 4 }}>
                                <CartesianGrid stroke={grid} strokeWidth={1} vertical={false} />
                                <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time"
                                    tickFormatter={fmtDate} tick={{ fill: inkSecondary, fontSize: 11 }} stroke={grid} tickLine={false} />
                                <YAxis domain={[0, "auto"]} tick={{ fill: inkSecondary, fontSize: 11 }} stroke={grid} tickLine={false} width={56}
                                    tickFormatter={fmtNum} />
                                <ChartTooltip
                                    cursor={{ stroke: inkSecondary, strokeWidth: 1 }}
                                    contentStyle={{ background: surface, border: `1px solid ${grid}`, borderRadius: 6, fontSize: 12, color: ink }}
                                    labelStyle={{ color: inkSecondary, fontSize: 11 }}
                                    itemStyle={{ color: ink }}
                                    labelFormatter={(t) => {
                                        const r = runs.find(x => x.t === t);
                                        return `${new Date(Number(t)).toLocaleString()}${r?.engine ? ` · ${r.engine}` : ""}`;
                                    }}
                                    formatter={(v: number, name: string) => [`${fmtNum(v)} ${unit}`, name]} />
                                <Legend wrapperStyle={{ fontSize: 12, color: inkSecondary }} iconType="circle" iconSize={8} />
                                {engineChanges.map(c => (
                                    <ReferenceLine key={c.t} x={c.t} stroke={inkSecondary} strokeWidth={1}
                                        label={{ value: `engine ${c.engine}`, position: "insideTopRight", fill: inkSecondary, fontSize: 10 }} />
                                ))}
                                {present.map(s => (
                                    <Line key={s.key} type="monotone" dataKey={s.key} name={s.label}
                                        stroke={hue(s.hue)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                                        connectNulls isAnimationActive={false}
                                        dot={{ r: 4, fill: hue(s.hue), stroke: surface, strokeWidth: 2 }}
                                        activeDot={{ r: 6, fill: hue(s.hue), stroke: surface, strokeWidth: 2 }} />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </Box>
                )}
            </Paper>
        );
    };

    const selectSx = { fontSize: 13 };

    return (
        <Box sx={{ fontVariantNumeric: "tabular-nums" }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                One setup over time: every run of it is a point, so a hardware or engine change shows as a step.
                Generation and prefill are different scales and get a chart each. A setup is the quant, window,
                KV, slots, MTP and the placement (layers in RAM, split, ubatch).
            </Typography>

            {/* ---- Pick the setup ---- */}
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2, alignItems: "center" }}>
                <FormControl size="small" sx={{ minWidth: 160 }}>
                    <InputLabel sx={selectSx}>Machine</InputLabel>
                    <Select value={machine} label="Machine" onChange={e => setMachine(e.target.value)} sx={selectSx}>
                        {machineNames.map(m => <MenuItem key={m} value={m} sx={selectSx}>{m}</MenuItem>)}
                    </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 220 }}>
                    <InputLabel sx={selectSx}>Model</InputLabel>
                    <Select value={modelNames.includes(model) ? model : ""} label="Model" onChange={e => setModel(e.target.value)} sx={selectSx}>
                        {modelNames.map(m => <MenuItem key={m} value={m} sx={selectSx}>{m}</MenuItem>)}
                    </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 320 }}>
                    <InputLabel sx={selectSx}>Setup</InputLabel>
                    <Select value={setups.some(s => s.key === setupKey) ? setupKey : ""} label="Setup" onChange={e => setSetupKey(e.target.value)} sx={selectSx}>
                        {setups.map(s => <MenuItem key={s.key} value={s.key} sx={selectSx}>{s.label} <Box component="span" sx={{ color: "text.secondary", ml: 1 }}>· {s.rows.length} rows</Box></MenuItem>)}
                    </Select>
                </FormControl>
                {setup && (
                    <Typography variant="caption" color="text.secondary">
                        {runs.length} run{runs.length === 1 ? "" : "s"}
                        {runs.length ? ` · ${fmtDate(runs[0].t)} → ${fmtDate(runs[runs.length - 1].t)}` : ""}
                        {engineChanges.length ? ` · ${engineChanges.length} engine change${engineChanges.length === 1 ? "" : "s"}` : ""}
                    </Typography>
                )}
            </Box>

            {speedRows.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                    No measurements yet — any suite that speaks the benchmark contract
                    (docs/BENCHMARK-CONTRACT.md) fills this page.
                </Typography>
            ) : setup && (
                <>
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0,1fr))" }, gap: 2 }}>
                        {chart("Prefill", "tok/s", PRE_SERIES.map(s => ({ key: s.key, hue: s.hue, label: s.label })))}
                        {chart("Generation", "tok/s", GEN_SERIES.map(s => ({ key: s.key, hue: s.key, label: s.label })))}
                    </Box>

                    {/* ---- The same runs as a table: the numbers behind the lines ---- */}
                    <Paper sx={{ mt: 2, overflowX: "auto" }}>
                        <Box component="table" sx={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
                            <thead>
                                <tr>
                                    {["Run", "Engine", "4K prefill", "4K tok/s", "32K prefill", "32K tok/s", "128K prefill", "128K tok/s", "×N each", "watts"].map((h, i) => (
                                        <Box component="th" key={h} sx={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "text.secondary", p: "10px 12px 8px", textAlign: i < 2 ? "left" : "right", whiteSpace: "nowrap", borderBottom: "2px solid", borderColor: "divider" }}>{h}</Box>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {[...runs].reverse().map(r => (
                                    <tr key={r.t}>
                                        <Box component="td" sx={{ p: "8px 12px", fontSize: 12.5, whiteSpace: "nowrap", borderTop: "1px solid", borderColor: "divider" }}>{new Date(r.t).toLocaleString()}</Box>
                                        <Box component="td" sx={{ p: "8px 12px", fontSize: 11, color: "text.secondary", whiteSpace: "nowrap", borderTop: "1px solid", borderColor: "divider" }}>{r.engine ?? "—"}</Box>
                                        {[r.p4, r.k4, r.p32, r.k32, r.p128, r.k128, r.each, r.watts].map((v, i) => (
                                            <Box component="td" key={i} sx={{ p: "8px 12px", fontSize: 13, textAlign: "right", fontWeight: 600, whiteSpace: "nowrap", borderTop: "1px solid", borderColor: "divider", color: v == null ? "text.disabled" : "text.primary" }}>{v == null ? "–" : fmtNum(v)}</Box>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </Box>
                    </Paper>
                </>
            )}
        </Box>
    );
};

export default ReportOverTime;
