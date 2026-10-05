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

import { useEffect, useMemo, useState } from "react";
import {
    Box, Checkbox, Chip, FormControl, InputLabel, ListItemText, MenuItem, Paper, Select, Typography, useTheme
} from "@mui/material";
import {
    CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis
} from "recharts";
import { ModelsBenchmark, machineLabel } from "./modelsTypes";
import { scenarioOf, placementOf, PAGING_SHARED_GB, depthOf, concurrencyOf } from "./benchmarkContract";

// MoE PLACEMENT: what the ledger says about a mixture-of-experts model on this
// hardware: a way to review what the data has taught about MoE placement. The
// reading that decided the
// Flash-Next forecast: with REAP-256 run in the full model's exact placements,
// generation turned out to be a LINE in milliseconds per token against the
// number of expert layers in system RAM; windows were flat; prompt depth, not
// the window, cost speed; and the micro-batch only paid on the CPU side.
//
// Every point is the MEDIAN of the ledger's runs of one exact cell: model,
// quant, machine, window, KV, layers in RAM, ubatch. Paged cells (Windows
// shared memory over the threshold) are a different regime and are kept out
// of the curves - they are listed, flagged, in the table.

interface Cell {
    model: string; quant: string; machine: string; ctxK: number; kv: string; inRam: number; ub: number;
    // deep = the 4K rung; review = the deepest rung the cell ran (>= 32K), reviewK its depth.
    deep: number | null; deepPre: number | null; review: number | null; reviewPre: number | null; reviewK: number | null;
    x4: number | null; vram: number | null; shared: number | null; n: number; paged: boolean;
}
interface Series { key: string; model: string; quant: string; label: string; slot: number }
interface Pt { x: number; y: number; cell: Cell }
interface ChartSeries { key: string; label: string; color: string; square: boolean; dash?: boolean; pts: Pt[]; fit?: ((n: number) => number) | null }
interface Fit { a: number; step: number; slope: number; r2: number; pred: (n: number) => number }

// The validated categorical palette (light / dark steps), assigned to a
// model+quant series by its position among ALL series in the ledger - so a
// series keeps its colour whatever the filter shows.
const PALETTE: { light: string; dark: string }[] = [
    { light: "#2a78d6", dark: "#3987e5" }, { light: "#eb6834", dark: "#d95926" },
    { light: "#1baf7a", dark: "#199e70" }, { light: "#eda100", dark: "#c98500" },
    { light: "#e87ba4", dark: "#d55181" }, { light: "#008300", dark: "#3cae3c" },
    { light: "#4a3aa7", dark: "#9085e9" }, { light: "#e34948", dark: "#e66767" },
];
const LAYERS_TOTAL_DEFAULT = 48;

const median = (v: number[]): number | null => {
    if (!v.length) return null;
    const s = [...v].sort((a, b) => a - b), m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const fmt = (v: number | null | undefined) => v == null ? "–" : Math.round(v).toLocaleString();
const f1 = (v: number | null | undefined) => v == null ? "–" : (Math.round(v * 10) / 10).toLocaleString();
const shortModel = (name: string) => name.replace(/^qwen/, "Qwen");

// ms/token = a + step·[n>0] + slope·max(n−1, 0), least squares by normal equations.
const fitCurve = (pts: Pt[]): Fit | null => {
    if (pts.length < 3) return null;
    const X = pts.map(p => [1, p.x > 0 ? 1 : 0, Math.max(p.x - 1, 0)]);
    const y = pts.map(p => 1000 / p.y);
    const n = 3;
    const A = Array.from({ length: n }, () => Array<number>(n).fill(0)), B = Array<number>(n).fill(0);
    X.forEach((r, i) => { for (let a = 0; a < n; a++) { B[a] += r[a] * y[i]; for (let b = 0; b < n; b++) A[a][b] += r[a] * r[b]; } });
    const M = A.map((r, i) => [...r, B[i]]);
    for (let i = 0; i < n; i++) {
        let p = i;
        for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
        [M[i], M[p]] = [M[p], M[i]];
        if (Math.abs(M[i][i]) < 1e-9) return null;
        for (let r = 0; r < n; r++) {
            if (r === i) continue;
            const f = M[r][i] / M[i][i];
            for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c];
        }
    }
    const co = M.map((r, i) => r[n] / r[i]);
    const pred = (nn: number) => co[0] + co[1] * (nn > 0 ? 1 : 0) + co[2] * Math.max(nn - 1, 0);
    const my = y.reduce((a, b) => a + b) / y.length;
    const ssr = y.reduce((a, v, i) => a + (v - pred(pts[i].x)) ** 2, 0), sst = y.reduce((a, v) => a + (v - my) ** 2, 0);
    return { a: co[0], step: co[1], slope: co[2], r2: sst ? 1 - ssr / sst : 1, pred };
};

const ReportMoE = ({ benchmarks, machines }: { benchmarks: ModelsBenchmark[]; machines: Map<number, string> }) => {
    const theme = useTheme();
    const dark = theme.palette.mode === "dark";
    const surface = theme.palette.background.paper;
    const ink = theme.palette.text.primary;
    const inkSecondary = theme.palette.text.secondary;
    const grid = theme.palette.divider;

    // ---- cells: one per exact setup, medians over its runs ----
    const cells = useMemo((): Cell[] => {
        const acc = new Map<string, { c: Omit<Cell, "deep" | "deepPre" | "review" | "reviewPre" | "reviewK" | "x4" | "vram" | "shared" | "n" | "paged">; m: Map<string, number[]> }>();
        for (const b of benchmarks) {
            if (b.machineId == null || !b.contextTokens) continue;
            if (!["gen_tok_s", "prompt_tok_s", "gen_tok_s_aggregate", "vram_gb", "vram_shared_gb"].includes(b.metric)) continue;
            const pl = placementOf(b.configJson);
            const c = {
                model: b.modelName, quant: b.quant ?? "?", machine: machineLabel(machines, b),
                ctxK: Math.round(b.contextTokens / 1024), kv: b.kvPrecision ?? "f16",
                inRam: pl.layersInRam ?? 0, ub: pl.ubatch ?? 512,
            };
            const key = [c.model, c.quant, c.machine, c.ctxK, c.kv, c.inRam, c.ub].join("|");
            const e = acc.get(key) ?? acc.set(key, { c, m: new Map() }).get(key)!;
            const mk = `${scenarioOf(b)}|${b.metric}`;
            (e.m.get(mk) ?? e.m.set(mk, []).get(mk)!).push(b.value);
        }
        const out: Cell[] = [];
        for (const { c, m } of acc.values()) {
            const med = (scen: string, metric: string) => median(m.get(`${scen}|${metric}`) ?? []);
            const deep = med("4k", "gen_tok_s");
            if (deep == null) continue;
            // The deepest rung this cell ran, 32K or beyond: the depth figure.
            const deepest = Math.max(0, ...[...m.keys()].map(k => depthOf(k.split("|")[0]) ?? 0).filter(d => d >= 32));
            const rk = deepest ? `${deepest}k` : null;
            const shared = median([...m.entries()].filter(([k]) => k.endsWith("|vram_shared_gb")).flatMap(([, v]) => v));
            out.push({
                ...c, deep, deepPre: med("4k", "prompt_tok_s"),
                review: rk ? med(rk, "gen_tok_s") : null, reviewPre: rk ? med(rk, "prompt_tok_s") : null, reviewK: deepest || null,
                x4: median([...m.entries()].filter(([k]) => concurrencyOf(k.split("|")[0]) && k.endsWith("|gen_tok_s_aggregate")).flatMap(([, v]) => v)),
                vram: median([...m.entries()].filter(([k]) => k.endsWith("|vram_gb")).flatMap(([, v]) => v)),
                shared, n: (m.get("4k|gen_tok_s") ?? []).length,
                paged: shared != null && shared >= PAGING_SHARED_GB,
            });
        }
        return out;
    }, [benchmarks, machines]);

    // ---- which models are MoE: the catalog says, or a placement row does ----
    const [moeNames, setMoeNames] = useState<Set<string> | null>(null);
    useEffect(() => {
        let alive = true;
        fetch("/api/models/catalog").then(r => r.ok ? r.json() : [])
            .then((rows: { name: string; architecture?: string | null }[]) => {
                if (!alive) return;
                setMoeNames(new Set(rows.filter(r => /moe|hybrid/i.test(r.architecture ?? "")).map(r => r.name)));
            }).catch(() => { if (alive) setMoeNames(new Set()); });
        return () => { alive = false; };
    }, []);
    const modelNames = useMemo(() => {
        const withPlacement = new Set(cells.filter(c => c.inRam > 0).map(c => c.model));
        return [...new Set(cells.map(c => c.model))].filter(m => withPlacement.has(m) || moeNames?.has(m)).sort();
    }, [cells, moeNames]);
    const machineNames = useMemo(() => [...new Set(cells.map(c => c.machine))].sort(), [cells]);

    // ---- series: model+quant, colour by position among all series in the ledger ----
    const allSeries = useMemo((): Series[] => {
        const keys = [...new Set(cells.filter(c => modelNames.includes(c.model)).map(c => `${c.model}|${c.quant}`))].sort();
        return keys.map((key, i) => { const [model, quant] = key.split("|"); return { key, model, quant, label: `${shortModel(model)} ${quant}`, slot: i % PALETTE.length }; });
    }, [cells, modelNames]);
    const seriesOf = (c: Cell) => allSeries.find(s => s.key === `${c.model}|${c.quant}`);
    const colorOf = (s: Series) => dark ? PALETTE[s.slot].dark : PALETTE[s.slot].light;

    // ---- the picks ----
    const [models, setModels] = useState<string[]>([]);
    const [machs, setMachs] = useState<string[]>([]);
    const [win, setWin] = useState<string>("any");
    useEffect(() => {
        // Default: the models with the most placements measured, capped at two.
        if (models.length || !modelNames.length) return;
        const score = (m: string) => new Set(cells.filter(c => c.model === m).map(c => c.inRam)).size;
        setModels([...modelNames].sort((a, b) => score(b) - score(a)).slice(0, 2));
    }, [models.length, modelNames, cells]);
    useEffect(() => { if (!machs.length && machineNames.length) setMachs(machineNames); }, [machs.length, machineNames]);

    const visible = useMemo(() => cells.filter(c => models.includes(c.model) && machs.includes(c.machine) && !c.paged && seriesOf(c)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [cells, models, machs, allSeries]);
    const multiMach = machs.length > 1;

    // Placement points: per series+machine, the cell at the chosen window (or the
    // one nearest 32K), the smallest ubatch when a layer count was run at several.
    const groups = useMemo(() => {
        const dist = (w: number) => win === "any" ? Math.abs(Math.log2(w / 32)) : (String(w) === win ? 0 : 99);
        const out = new Map<string, { s: Series; machine: string; pts: Map<number, Cell> }>();
        for (const c of visible) {
            if (dist(c.ctxK) >= 99) continue;
            const s = seriesOf(c)!;
            const k = `${s.key}|${c.machine}`;
            const g = out.get(k) ?? out.set(k, { s, machine: c.machine, pts: new Map() }).get(k)!;
            const cur = g.pts.get(c.inRam);
            if (!cur || dist(c.ctxK) < dist(cur.ctxK) || (dist(c.ctxK) === dist(cur.ctxK) && c.ub < cur.ub)) g.pts.set(c.inRam, c);
        }
        return [...out.values()].map(g => ({ s: g.s, machine: g.machine, pts: [...g.pts.values()].sort((a, b) => a.inRam - b.inRam) }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, win, allSeries]);
    const fits = useMemo(() => groups.map(g => ({ g, f: fitCurve(g.pts.map(c => ({ x: c.inRam, y: c.deep!, cell: c }))) })), [groups]);

    // Window series: per series+machine+placement+kv, deep across windows.
    const windowGroups = useMemo(() => {
        const out = new Map<string, { s: Series; machine: string; inRam: number; kv: string; by: Map<number, Cell> }>();
        for (const c of visible) {
            const s = seriesOf(c)!;
            const k = `${s.key}|${c.machine}|${c.inRam}|${c.kv}`;
            const g = out.get(k) ?? out.set(k, { s, machine: c.machine, inRam: c.inRam, kv: c.kv, by: new Map() }).get(k)!;
            const cur = g.by.get(c.ctxK);
            if (!cur || c.ub < cur.ub) g.by.set(c.ctxK, c);
        }
        return [...out.values()];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, allSeries]);

    // -ub pairs: same everything but the micro-batch.
    const ubPairs = useMemo(() => {
        const m = new Map<string, Cell[]>();
        for (const c of visible) { const k = `${c.model}|${c.quant}|${c.machine}|${c.ctxK}|${c.kv}|${c.inRam}`; (m.get(k) ?? m.set(k, []).get(k)!).push(c); }
        return [...m.values()].filter(v => v.length > 1).map(v => [...v].sort((a, b) => a.ub - b.ub));
    }, [visible]);

    const labelOf = (g: { s: Series; machine: string }) => g.s.label + (multiMach ? ` · ${g.machine}` : "");
    const tipOf = (c: Cell) => `${c.inRam} in RAM · ${c.ctxK}K ${c.kv} · -ub ${c.ub} · 4K ${f1(c.deep)} / ${fmt(c.deepPre)}${c.reviewK ? ` · ${c.reviewK}K ${f1(c.review)} / ${fmt(c.reviewPre)}` : ""}${c.vram != null ? ` · ${f1(c.vram)} GB` : ""}`;

    // ---- one chart shape: per-series data on a shared numeric or category x ----
    const chart = (title: string, sub: string, note: string, series: ChartSeries[], opts: { xKey: "layers" | "window"; xlabel: string; ylabel: string }) => {
        const present = series.filter(s => s.pts.length);
        const dotFor = (s: ChartSeries) => (p: { cx?: number; cy?: number }) => {
            const { cx = 0, cy = 0 } = p;
            return s.square
                ? <rect key={`${cx}-${cy}`} x={cx - 4.5} y={cy - 4.5} width={9} height={9} fill={s.color} stroke={surface} strokeWidth={2} />
                : <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={5} fill={s.color} stroke={surface} strokeWidth={2} />;
        };
        return (
            <Paper sx={{ p: "16px 20px 8px", minWidth: 0 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{title} <Box component="span" sx={{ color: "text.secondary", fontWeight: 500 }}>· {sub}</Box></Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>{note}</Typography>
                {present.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>nothing measured for this selection</Typography>
                ) : (
                    <Box sx={{ width: "100%", height: 320 }}>
                        <ResponsiveContainer>
                            <LineChart margin={{ top: 12, right: 24, bottom: 18, left: 4 }}>
                                <CartesianGrid stroke={grid} strokeWidth={1} vertical={false} />
                                {opts.xKey === "layers"
                                    ? <XAxis dataKey="x" type="number" domain={[0, LAYERS_TOTAL_DEFAULT]} ticks={[0, 8, 16, 24, 32, 40, 48]} allowDuplicatedCategory={false}
                                        tick={{ fill: inkSecondary, fontSize: 11 }} stroke={grid} tickLine={false}
                                        label={{ value: opts.xlabel, position: "insideBottom", offset: -10, fill: inkSecondary, fontSize: 11 }} />
                                    : <XAxis dataKey="x" type="category" allowDuplicatedCategory={false}
                                        tick={{ fill: inkSecondary, fontSize: 11 }} stroke={grid} tickLine={false} tickFormatter={(v) => `${v}K`}
                                        label={{ value: opts.xlabel, position: "insideBottom", offset: -10, fill: inkSecondary, fontSize: 11 }} />}
                                <YAxis domain={[0, "auto"]} tick={{ fill: inkSecondary, fontSize: 11 }} stroke={grid} tickLine={false} width={56} tickFormatter={fmt}
                                    label={{ value: opts.ylabel, angle: -90, position: "insideLeft", offset: 14, fill: inkSecondary, fontSize: 11 }} />
                                <ChartTooltip
                                    cursor={{ stroke: inkSecondary, strokeWidth: 1 }}
                                    contentStyle={{ background: surface, border: `1px solid ${grid}`, borderRadius: 6, fontSize: 12, color: ink }}
                                    labelStyle={{ display: "none" }}
                                    itemStyle={{ color: ink }}
                                    formatter={(v: number, name: string, item: { payload?: Pt }) => [
                                        `${f1(v)} ${opts.ylabel}${item.payload?.cell ? ` — ${tipOf(item.payload.cell)}` : ""}`, name]} />
                                <Legend wrapperStyle={{ fontSize: 12, color: inkSecondary, paddingTop: 12 }} iconType="circle" iconSize={8} />
                                {present.map(s => s.fit ? (
                                    <Line key={`${s.key}-fit`} data={Array.from({ length: 49 }, (_, n) => ({ x: n, y: s.fit!(n) }))}
                                        dataKey="y" name={`${s.label} fit`} legendType="none" tooltipType="none"
                                        stroke={s.color} strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} />
                                ) : null)}
                                {present.map(s => (
                                    <Line key={s.key} data={s.pts} dataKey="y" name={s.label} type="linear"
                                        stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                                        strokeDasharray={s.dash ? "5 4" : undefined} isAnimationActive={false}
                                        dot={dotFor(s)} activeDot={{ r: 7, fill: s.color, stroke: surface, strokeWidth: 2 }} />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </Box>
                )}
            </Paper>
        );
    };

    // ---- the four charts' series ----
    const curveSeries: ChartSeries[] = groups.map(g => ({
        key: `${g.s.key}|${g.machine}`, label: labelOf(g), color: colorOf(g.s), square: g.machine !== machineNames[0],
        pts: g.pts.map(c => ({ x: c.inRam, y: c.deep!, cell: c })),
    }));
    const msSeries: ChartSeries[] = fits.map(({ g, f }) => ({
        key: `${g.s.key}|${g.machine}`, label: labelOf(g), color: colorOf(g.s), square: g.machine !== machineNames[0], fit: f?.pred ?? null,
        pts: g.pts.map(c => ({ x: c.inRam, y: 1000 / c.deep!, cell: c })),
    }));
    const prefillSeries: ChartSeries[] = groups.flatMap(g => [
        { key: `${g.s.key}|${g.machine}|d`, label: `${labelOf(g)} · 4K`, color: colorOf(g.s), square: g.machine !== machineNames[0], pts: g.pts.filter(c => c.deepPre != null).map(c => ({ x: c.inRam, y: c.deepPre!, cell: c })) },
        { key: `${g.s.key}|${g.machine}|r`, label: `${labelOf(g)} · deepest rung`, color: colorOf(g.s), square: g.machine !== machineNames[0], dash: true, pts: g.pts.filter(c => c.reviewPre != null).map(c => ({ x: c.inRam, y: c.reviewPre!, cell: c })) },
    ]);
    const windowSeries: ChartSeries[] = windowGroups.filter(g => g.by.size >= 2).map(g => ({
        key: `${g.s.key}|${g.machine}|${g.inRam}|${g.kv}`, label: `${g.s.label} · ${g.inRam} in RAM · ${g.kv}${multiMach ? ` · ${g.machine}` : ""}`,
        color: colorOf(g.s), square: g.machine !== machineNames[0], dash: g.kv !== "q8_0",
        pts: [...g.by.values()].sort((a, b) => a.ctxK - b.ctxK).map(c => ({ x: c.ctxK, y: c.deep!, cell: c })),
    }));

    // ---- findings, computed from the points on the page ----
    const findings: { head: string; body: string }[] = [];
    const bestFit = fits.filter(x => x.f).sort((a, b) => b.g.pts.length - a.g.pts.length)[0];
    if (bestFit?.f) {
        const f = bestFit.f;
        findings.push({ head: "Generation is a line in ms per token.", body: `${labelOf(bestFit.g)}: ${f1(f.a)} ms on the cards, +${f1(f.step)} ms for the first layer in RAM, +${(Math.round(f.slope * 100) / 100).toFixed(2)} ms per layer after it (R² ${f.r2.toFixed(3)}). All in VRAM reads ${f1(1000 / f.a)} tok/s; every layer in RAM would read ${f1(1000 / f.pred(LAYERS_TOTAL_DEFAULT))}.` });
        // Another series measured at the same layer count is the check on the tax.
        const others = groups.filter(g => g.s.key !== bestFit.g.s.key);
        for (const p of bestFit.g.pts) {
            const same = others.flatMap(o => o.pts.filter(c => c.inRam === p.inRam && p.inRam > 0).map(c => ({ o, c })));
            if (same.length) { findings.push({ head: "The tax is the placement's, not the checkpoint's.", body: `At ${p.inRam} layers in RAM ${bestFit.g.s.label} reads ${f1(p.deep)} tok/s against ${same.map(x => `${x.o.s.label} ${f1(x.c.deep)}`).join(", ")} in the same placement.` }); break; }
        }
    }
    const flat = windowGroups.filter(g => g.by.size >= 3).map(g => { const v = [...g.by.values()].map(c => c.deep!); return (Math.max(...v) - Math.min(...v)) / Math.max(...v); });
    if (flat.length) findings.push({ head: "Windows are flat.", body: `Across ${flat.length} placement${flat.length > 1 ? "s" : ""} measured at three or more windows the 4K number moves ${Math.round(100 * Math.max(...flat))}% at most. The window decides fit, not speed.` });
    const onCards = ubPairs.find(v => v[0].inRam === 0), inRam = ubPairs.find(v => v[0].inRam > 0);
    if (onCards) findings.push({ head: "The batch buys nothing on the cards.", body: `${seriesOf(onCards[0])!.label} all on the cards: prefill ${fmt(onCards[0].deepPre)} at -ub ${onCards[0].ub} and ${fmt(onCards[1].deepPre)} at -ub ${onCards[1].ub}.` });
    if (inRam && inRam[0].deepPre && inRam[1].deepPre) findings.push({ head: "The batch pays only for the CPU side.", body: `${seriesOf(inRam[0])!.label} with ${inRam[0].inRam} in RAM: -ub ${inRam[1].ub} lifts 4K prefill ${Math.round(100 * (inRam[1].deepPre / inRam[0].deepPre - 1))}%${inRam[0].reviewPre && inRam[1].reviewPre ? ` and review prefill ${Math.round(100 * (inRam[1].reviewPre / inRam[0].reviewPre - 1))}%` : ""}, generation unchanged.` });
    if (machineNames.length > 1) {
        const [m0, m1] = machineNames;
        const pairs = windowGroups.filter(g => g.machine === m0 && g.inRam === 0).map(g0 => {
            const g1 = windowGroups.find(g => g.machine === m1 && g.s.key === g0.s.key && g.inRam === 0 && g.kv === g0.kv);
            if (!g1) return null;
            const ks = [...g0.by.keys()].filter(k => g1.by.has(k));
            if (!ks.length) return null;
            const gen = ks.map(k => g0.by.get(k)!.deep! / g1.by.get(k)!.deep!);
            const pre = ks.map(k => { const a = g0.by.get(k)!.reviewPre, b = g1.by.get(k)!.reviewPre; return a && b ? a / b : null; }).filter((x): x is number => x != null);
            return { s: g0.s, gen: gen.reduce((a, b) => a + b) / gen.length, pre: pre.length ? pre.reduce((a, b) => a + b) / pre.length : null };
        }).filter((x): x is { s: Series; gen: number; pre: number | null } => !!x);
        if (pairs.length) findings.push({ head: `${m0} against ${m1}, all on the cards.`, body: pairs.map(p => `${p.s.label}: generation ${Math.round(p.gen * 100)}%${p.pre ? `, deep prefill ${Math.round(p.pre * 100)}%` : ""}`).join("; ") + "." });
    }

    const depthRows = visible.filter(c => c.review != null).sort((a, b) => seriesOf(a)!.label.localeCompare(seriesOf(b)!.label) || a.inRam - b.inRam || a.ctxK - b.ctxK);
    const share = (a: number | null, b: number | null) => a && b ? a / b : null;
    const shareChip = (v: number | null) => {
        if (v == null) return null;
        const c = v >= 0.85 ? "success" : v >= 0.65 ? "warning" : "error";
        return <Chip size="small" color={c} variant="outlined" label={v >= 0.85 ? "holds" : v >= 0.65 ? "drops" : "halves"} sx={{ ml: 0.75, height: 18, fontSize: 10, fontWeight: 700 }} />;
    };
    const allRows = [...cells.filter(c => models.includes(c.model) && machs.includes(c.machine) && seriesOf(c))]
        .sort((a, b) => seriesOf(a)!.label.localeCompare(seriesOf(b)!.label) || a.machine.localeCompare(b.machine) || a.ctxK - b.ctxK || a.inRam - b.inRam || a.ub - b.ub);

    const th = (h: string, i: number) => <Box component="th" key={`${h}-${i}`} sx={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "text.secondary", textAlign: i === 0 ? "left" : "right", p: "6px 10px", borderBottom: "1px solid", borderColor: "divider", whiteSpace: "nowrap" }}>{h}</Box>;
    const td = (v: React.ReactNode, i: number, key: string) => <Box component="td" key={key} sx={{ p: "6px 10px", fontSize: i === 0 ? 12.5 : 12, textAlign: i === 0 ? "left" : "right", whiteSpace: "nowrap", borderBottom: "1px solid", borderColor: "divider", fontWeight: i === 0 ? 500 : 600 }}>{v}</Box>;
    const table = (title: string, sub: string, heads: string[], rows: React.ReactNode[][], empty: string) => (
        <Paper sx={{ p: "16px 20px 8px", minWidth: 0, overflowX: "auto" }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 1 }}>{title} <Box component="span" sx={{ color: "text.secondary", fontWeight: 500 }}>· {sub}</Box></Typography>
            {rows.length === 0 ? <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>{empty}</Typography> : (
                <Box component="table" sx={{ borderCollapse: "collapse", width: "100%", fontVariantNumeric: "tabular-nums" }}>
                    <thead><tr>{heads.map(th)}</tr></thead>
                    <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((v, i) => td(v, i, `${ri}-${i}`))}</tr>)}</tbody>
                </Box>
            )}
        </Paper>
    );

    const selectSx = { fontSize: 13 };
    const swatch = (color: string, square = false) => <Box component="span" sx={{ display: "inline-block", width: 9, height: 9, borderRadius: square ? "1px" : "50%", bgcolor: color, mr: 0.75, verticalAlign: "-1px" }} />;

    return (
        <Box sx={{ fontVariantNumeric: "tabular-nums" }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                What the ledger says about a mixture-of-experts model on this hardware: how speed falls with each expert layer
                moved to system RAM, whether the window matters, what prompt depth costs, and what the batch buys. Every point
                is a median of the runs of one exact setup; paged cells are kept out of the curves and flagged in the table.
            </Typography>

            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2, alignItems: "center" }}>
                <FormControl size="small" sx={{ minWidth: 300 }}>
                    <InputLabel sx={selectSx}>Models</InputLabel>
                    <Select multiple value={models} label="Models" onChange={e => setModels(typeof e.target.value === "string" ? e.target.value.split(",") : e.target.value)} sx={selectSx}
                        renderValue={(v) => <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>{(v as string[]).map(m => <Chip key={m} size="small" label={shortModel(m)} sx={{ height: 20, fontSize: 11 }} />)}</Box>}>
                        {modelNames.map(m => (
                            <MenuItem key={m} value={m} dense>
                                <Checkbox size="small" checked={models.includes(m)} sx={{ p: 0.5, mr: 0.5 }} />
                                <ListItemText primaryTypographyProps={{ fontSize: 13 }} primary={<>{allSeries.filter(s => s.model === m).map(s => <Box component="span" key={s.key}>{swatch(colorOf(s))}</Box>)}{shortModel(m)}</>} />
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 200 }}>
                    <InputLabel sx={selectSx}>Machines</InputLabel>
                    <Select multiple value={machs} label="Machines" onChange={e => setMachs(typeof e.target.value === "string" ? e.target.value.split(",") : e.target.value)} sx={selectSx}
                        renderValue={(v) => (v as string[]).join(", ")}>
                        {machineNames.map((m, i) => (
                            <MenuItem key={m} value={m} dense>
                                <Checkbox size="small" checked={machs.includes(m)} sx={{ p: 0.5, mr: 0.5 }} />
                                <ListItemText primaryTypographyProps={{ fontSize: 13 }} primary={<>{swatch(inkSecondary, i > 0)}{m}</>} />
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 190 }}>
                    <InputLabel sx={selectSx}>Placement window</InputLabel>
                    <Select value={win} label="Placement window" onChange={e => setWin(e.target.value)} sx={selectSx}>
                        <MenuItem value="any" sx={selectSx}>any (nearest to 32K)</MenuItem>
                        {[32, 64, 128, 256].map(w => <MenuItem key={w} value={String(w)} sx={selectSx}>{w}K</MenuItem>)}
                    </Select>
                </FormControl>
                <Typography variant="caption" color="text.secondary">
                    {visible.length} cell{visible.length === 1 ? "" : "s"} · {groups.reduce((a, g) => a + g.pts.length, 0)} placement points
                    {machineNames.length > 1 ? ` · circle = ${machineNames[0]}, square = ${machineNames.slice(1).join(", ")}` : ""}
                </Typography>
            </Box>

            {modelNames.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No MoE model has measurements yet.</Typography>
            ) : (
                <>
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0,1fr))" }, gap: 2 }}>
                        {chart("The placement curve", "deep tok/s vs expert layers in system RAM", "One line per model and quant, each point a placement at the chosen window with a ~3K prompt.", curveSeries, { xKey: "layers", xlabel: "expert layers in system RAM", ylabel: "tok/s" })}
                        {chart("The same curve in milliseconds per token", "the fit", "ms/token = base + first-layer step + slope × further layers, least squares where a model has three or more placements (dashed).", msSeries, { xKey: "layers", xlabel: "expert layers in system RAM", ylabel: "ms/token" })}
                    </Box>
                    {fits.some(x => x.f) && (
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1.5 }}>
                            {fits.filter(x => x.f).map(({ g, f }) => (
                                <Box key={`${g.s.key}|${g.machine}`} sx={{ fontFamily: "ui-monospace, monospace", fontSize: 12, px: 1.25, py: 0.75, borderRadius: 1, border: "1px solid", borderColor: "divider", borderLeft: `3px solid ${colorOf(g.s)}` }}>
                                    {labelOf(g)}: ms = {f1(f!.a)} + {f1(f!.step)}·[n&gt;0] + {(Math.round(f!.slope * 100) / 100).toFixed(2)}·(n−1) &nbsp; R² {f!.r2.toFixed(3)} &nbsp;→ all in VRAM ≈ <b>{f1(1000 / f!.a)} tok/s</b>, all {LAYERS_TOTAL_DEFAULT} in RAM ≈ {f1(1000 / f!.pred(LAYERS_TOTAL_DEFAULT))}
                                </Box>
                            ))}
                        </Box>
                    )}
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0,1fr))" }, gap: 2, mt: 2 }}>
                        {chart("Prefill vs layers in RAM", "tok/s, 4K prompt (solid) and the deepest rung run (dashed)", "A layer in RAM runs every prompt token through the CPU, so prefill falls faster than generation.", prefillSeries, { xKey: "layers", xlabel: "expert layers in system RAM", ylabel: "tok/s" })}
                        {chart("Windows", "4K tok/s by context window, each placement its own line", "A flat line means the window only decides fit. Placements measured at two or more windows; dashed = a KV precision other than q8_0.", windowSeries, { xKey: "window", xlabel: "context window", ylabel: "tok/s" })}
                    </Box>
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0,1fr))" }, gap: 2, mt: 2 }}>
                        {table("Depth", "the deepest rung run as a share of the 4K figures",
                            ["setup", "window", "depth", "4K", "deep", "gen share", "prefill 4K", "prefill deep", "prefill share"],
                            depthRows.map(c => [
                                `${seriesOf(c)!.label} · ${c.inRam} in RAM${multiMach ? ` · ${c.machine}` : ""}`, `${c.ctxK}K ${c.kv}`, `${c.reviewK}K`,
                                f1(c.deep), f1(c.review), <>{share(c.review, c.deep) != null ? `${Math.round(100 * share(c.review, c.deep)!)}%` : "–"}{shareChip(share(c.review, c.deep))}</>,
                                fmt(c.deepPre), fmt(c.reviewPre), share(c.reviewPre, c.deepPre) != null ? `${Math.round(100 * share(c.reviewPre, c.deepPre)!)}%` : "–",
                            ]), "no deep rung for this selection")}
                        {table("The batch", "-ub pairs at one placement",
                            ["setup", "-ub", "4K", "prefill 4K", "deep", "prefill deep", "Δ prefill 4K", "Δ prefill deep"],
                            ubPairs.flatMap(v => v.map((c, i) => [
                                i === 0 ? `${seriesOf(c)!.label} · ${c.ctxK}K ${c.kv} · ${c.inRam} in RAM${multiMach ? ` · ${c.machine}` : ""}` : "", String(c.ub),
                                f1(c.deep), fmt(c.deepPre), f1(c.review), fmt(c.reviewPre),
                                i && c.deepPre && v[0].deepPre ? `${Math.round(100 * (c.deepPre / v[0].deepPre - 1))}%` : "–",
                                i && c.reviewPre && v[0].reviewPre ? `${Math.round(100 * (c.reviewPre / v[0].reviewPre - 1))}%` : "–",
                            ])), "no two runs of one placement differ only in -ub for this selection")}
                    </Box>
                    <Paper sx={{ p: "16px 20px 14px", mt: 2 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 1 }}>What the data says <Box component="span" sx={{ color: "text.secondary", fontWeight: 500 }}>· computed from the points above</Box></Typography>
                        {findings.length === 0 ? <Typography variant="body2" color="text.secondary">Pick a model with measured placements.</Typography> : (
                            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0,1fr))" }, gap: "10px 24px" }}>
                                {findings.map((f, i) => <Box key={i} sx={{ fontSize: 13 }}><Typography sx={{ fontSize: 12, fontWeight: 700 }}>{f.head}</Typography>{f.body}</Box>)}
                            </Box>
                        )}
                    </Paper>
                    <Box sx={{ mt: 2 }}>
                        {table("Every point", "the cells behind the charts (paged cells flagged, kept out of the curves)",
                            ["model · quant", "machine", "window", "kv", "in RAM", "-ub", "4K", "prefill", "deepest", "prefill", "×4 total", "VRAM GB", "runs"],
                            allRows.map(c => [
                                <>{swatch(colorOf(seriesOf(c)!))}{seriesOf(c)!.label}{c.paged ? <Chip size="small" color="warning" variant="outlined" label={`paged ${f1(c.shared)} GB`} sx={{ ml: 0.75, height: 18, fontSize: 10 }} /> : null}</>,
                                c.machine, `${c.ctxK}K`, c.kv, String(c.inRam), String(c.ub), f1(c.deep), fmt(c.deepPre), f1(c.review), fmt(c.reviewPre), f1(c.x4), c.vram != null ? f1(c.vram) : "–", String(c.n),
                            ]), "nothing measured for this selection")}
                    </Box>
                </>
            )}
        </Box>
    );
};

export default ReportMoE;
