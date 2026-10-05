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

import { Fragment, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Accordion, AccordionDetails, AccordionSummary, Box, Checkbox, Chip, Collapse, FormControl, InputLabel, ListItemText, MenuItem,
    OutlinedInput, Paper, Select, Table, TableBody, TableCell, TableHead, TablePagination,
    Tab, TableRow, Tabs, ToggleButton, ToggleButtonGroup, Tooltip, Typography, alpha, useTheme, IconButton,
    Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField
    } from "@mui/material";
    import EditIcon from "@mui/icons-material/Edit";
    import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
    import SettingsIcon from "@mui/icons-material/Settings";
    import { useColumnVisibility, ColumnPickerPopover, type ColumnDefinition } from "@junctionrelay/styles";
import {
    ACCORDION_CONTROLS_SX, ACCORDION_HEADER_BOX_SX, ACCORDION_SUMMARY_SX
} from "@junctionrelay/styles";
import {
    ColumnFilters, activeFilterCount, distinctValues, passesFilters
} from "../../components/Lab_Column_Filter";
import { usePageTitle } from "../../hooks/usePageTitle";
import {
    MachineFacts, ModelsBenchmark, ModelsCatalogEntry, ModelsFitVerdict,
    ModelsReferenceScore, fetchMachineNames, machineFactsFrom, machineLabel, machineRole, thinkingOf, tinOwnersFrom
} from "./modelsTypes";
import {
    CaseFailure, PREFILL_AMBER, PREFILL_GREEN, RAG_AMBER, RAG_GREEN, casesOf, declaredColumnsOf, evalColor, failuresOf,
    prefillColor,
    VERSION_UNSET, suiteVersionOf, versionLabel, versionsIn,
    isSpeedMetric, overallRate,
    readRefPref, refLabel, refMetricsPresent, refScoresFor, scenarioOf, scoreColumnOf, depthOf, concurrencyOf, RUNGS,
    sortTiers, speedColor, suiteDisplayFrom, suiteLabel, suiteOf, tierLabel, usePersistedTableState,
    widestRefMetric, writeRefPref
} from "./benchmarkContract";

// The BENCHMARKS page - the ledger presented, then the ledger itself.
// One MATRIX per context section: setups are rows on the left,
// machines are column groups, so a third machine is just another group.
//   - A ROW IS ONE EXACT SETUP: model + quant + KV + slots + MTP + vision.
//     Machines share a row ONLY when they ran the identical config ("f16 is
//     NOT the same as q8"). The same model legitimately appears as several
//     rows when the boxes serve it differently.
//   - CONTEXT WINDOW is still the top-level grouping, and inside a section
//     the two weight-placement regimes are separate row bands (all-in-VRAM
//     vs experts spilled to system RAM) - never blended.
//   - Cells are pure numbers: tok/s (banded), prefill, the 4-stream pair
//     (each / total, QUEUES tag on 1-slot totals), watts. All the config
//     vocabulary lives in the row's identity line; downgrades read red.
//   - An absence is typed per cell: "untested" (could run it, nobody
//     benched it) vs "won't fit" with the physical reason from inventory.
//   - Every column is sortable; sorting is SECTION-WIDE anchored to the
//     clicked machine so rows never disassemble. Default: first machine's
//     tok/s descending - the page's question is "what is fastest here".
//   - The identity facts (Quant / KV / Slots / MTP / Vision / GB) are their
//     own COLUMNS, filtered per-column with the same ColumnFilterButton the
//     homelab tables use. No links, no counts, no invented rankings.




interface Cfg {
    ctxK: number; slots: number; mtp: boolean;
    // tri-state: true/false = measured by llm-bench's --mmproj capture;
    // undefined = the row predates the capture, and we say nothing rather
    // than call a capability missing without having measured it.
    vision: boolean | undefined;
    kv: string | null; offload: { layers: number | null; total: number | null } | null;
    // Tuning facts that move the number without changing the setup's name: the
    // GPU split and the ubatch. Part of the row identity when recorded, so an
    // A/B of splits never blends into one cell.
    tensorSplit?: string | null; ubatch?: number | null;
    // The -ot placement: which expert blocks sit on which card and which in RAM.
    // Two placements with the same layers-in-RAM count are still two rows.
    ot?: string | null;
    // The runtime build that produced the number - two builds serve the same
    // model at different speeds, and a different runtime is not comparable.
    engine: string | null;
    // The quant of the FILE this run loaded. The catalog holds MODELS, not
    // configurations, so it cannot say which quant a given row used - the
    // measurement has to carry it (captured; older rows fall
    // back to the quant embedded in the serving id).
    quant: string | null;
    // Size of the weights file this run loaded. ⛔ NOT the catalog's sizeGb:
    // the catalog holds MODELS, so its size is the total of every quant held
    // (68 GB for the 27B across q4+q5+q8). Using that to judge "won't fit"
    // would call every setup impossible.
    weightsGb: number | null;
}
// The -ot list as one string, the shell quoting the suite sometimes keeps stripped.
const otOf = (v: unknown[]): string => v.map(x => String(x).replace(/^"+|"+$/g, "")).join(",");
// ⛔ EVERY CONFIGURATION IS ITS OWN ROW: a changed ubatch or placement is a
// different row. Split, ubatch and the
// -ot placement are identity, not a tuning folded into a newer cell. The fold
// hid tested setups behind their neighbours and made the matrix read as random.
const tuningKeyOf = (c: Cfg): string => `${c.tensorSplit ?? ""}|${c.ubatch ?? ""}|${c.ot ?? ""}`;
const parseCfg = (json: string | null, name: string): Cfg => {
    const out: Cfg = { ctxK: 0, slots: 4, mtp: false, vision: undefined, kv: null, offload: null, quant: null, weightsGb: null, engine: null };
    try {
        const c = JSON.parse(json ?? "{}") as Record<string, unknown>;
        if (c.ctx) out.ctxK = Math.round(Number(c.ctx) / 1024);
        if (c.parallel) out.slots = Number(c.parallel);
        if (c.spec_type === "draft-mtp") out.mtp = true;
        if ("vision" in c) out.vision = Boolean(c.vision);
        if (c.cache_k || c.cache_v) out.kv = String(c.cache_k ?? c.cache_v);
        else {
            const nm = String(c.llama_swap_name ?? "");
            const kv = /(q8_0|f16|q4_0)/i.exec(nm.split("|")[1] ?? nm);
            if (kv) out.kv = kv[1];
        }
        if (c.quant) out.quant = String(c.quant);
        if (c.weights_gb) out.weightsGb = Number(c.weights_gb);
        if (c.n_cpu_moe !== undefined) out.offload = {
            layers: c.n_cpu_moe === true ? null : Number(c.n_cpu_moe),
            total: c.n_layers_total ? Number(c.n_layers_total) : null
        };
        if (typeof c.tensor_split === "string" && c.tensor_split) out.tensorSplit = c.tensor_split;
        if (c.ubatch !== undefined && c.ubatch !== null) out.ubatch = Number(c.ubatch);
        if (Array.isArray(c.tensor_overrides) && c.tensor_overrides.length) out.ot = otOf(c.tensor_overrides);
    } catch { /* name fallback below */ }
    if (!out.ctxK) {
        const m = /(\d+)k/i.exec(name);
        if (m) out.ctxK = Number(m[1]);
    }
    // ⛔ No quant fallback. Guessing it from the name, or borrowing it from the
    // catalog entry, is what printed every quant held against every row. If the
    // run did not report one, the column reads "—".
    return out;
};

// A benchmark row's setup comes from the ROW, which carries it as first-class
// fields captured at run time. configJson is consulted only for tool-specific
// extras that are not part of the contract.
const cfgOfBenchmark = (b: ModelsBenchmark): Cfg => {
    const out: Cfg = {
        ctxK: b.contextTokens ? Math.round(b.contextTokens / 1024) : 0,
        slots: b.slots ?? 4,
        mtp: b.mtp === true,
        vision: b.vision ?? undefined,
        kv: b.kvPrecision,
        engine: b.engine,
        offload: null,
        quant: b.quant,
        weightsGb: b.weightsGb
    };
    try {
        const c = JSON.parse(b.configJson ?? "{}") as Record<string, unknown>;
        if (c.n_cpu_moe !== undefined) out.offload = {
            layers: c.n_cpu_moe === true ? null : Number(c.n_cpu_moe),
            total: c.n_layers_total ? Number(c.n_layers_total) : null
        };
        if (typeof c.tensor_split === "string" && c.tensor_split) out.tensorSplit = c.tensor_split;
        if (c.ubatch !== undefined && c.ubatch !== null) out.ubatch = Number(c.ubatch);
        if (Array.isArray(c.tensor_overrides) && c.tensor_overrides.length) out.ot = otOf(c.tensor_overrides);
    } catch { /* extras are optional */ }
    return out;
};

// One measured cell: a (machine, setup) with every clean run it has. Rows
// arrive newest-first, so [0] is the latest; median is computed over all.
// A run lands in the cell of ITS OWN config's row - old q8_0 history can
// never blend into a q4_0 median.
// failed: the engine's cause line for each run whose rung was attempted and
// produced no numbers (metric rung_failed) - tested and failed is
// a different answer from never run, and the matrix says which.
interface RungSamples { pp: number[]; gen: number[]; ttft: number[]; lpp: number[]; ltg: number[]; failed: string[] }
interface MeasCell {
    // Every rung of the depth ladder (contract v3), keyed by K tokens: prefill,
    // tok/s and time-to-first-token at that depth. Every rung is its own band of
    // columns (one "tok/s" makes no sense when the figure varies by the test;
    // all six are on the matrix, and a column picker hides any).
    rung: Record<number, RungSamples>;
    watts: number[]; watts4: number[];
    each: number[]; total: number[]; vram: number[];
    // N of the run's `4k_xN` streams, newest first beside `each`. The suite runs
    // as many streams as it was told, not always four (a 1-slot entry is run at 1).
    streams: number[];
    // Sustained disk read during generation. Non-trivial values mean the run
    // was PAGING - a regime an order of magnitude below RAM-resident.
    disk: number[];
    // llama-server's GPU memory the Windows driver spilled to system RAM.
    shared: number[];
    // "split 47,20,33 · ub 1024" - the tuning this cell's runs share; shown in
    // the cell's tooltip. newestAt decides which tuning a machine's cell shows.
    tuning: string;
    newestAt: string;
    // How many other tunings of this setup the machine has measured.
    otherTunings: number;
}
// The resolved view of a cell under the Latest/Median toggle, with the
// honesty facts (n, min-max of deep tok/s) alongside.
interface Meas {
    gen: number;                       // the 4K tok/s: the row's face
    rung: Record<number, { pp: number | null; gen: number | null; ttft: number | null; lpp: number | null; ltg: number | null; failed: string | null }>;
    watts: number | null;
    each: number | null; total: number | null; vram: number | null;
    streams: number | null;
    // Every disk sample for this cell, kept as a list: the band needs the
    // median, and a single spike must not reclassify a resident run as paging.
    disk: number[];
    shared: number[];
    tuning: string; otherTunings: number;
    n: number; genMin: number; genMax: number;
}
// One matrix row: an exact setup. The identity facts render in the label
// column; a null kv means the engine default (f16) and is folded into it -
// that IS what those rows ran.
interface RowDef {
    key: string; label: string; modelId: number | null; sizeGb: number | null; ctxK: number;
    engine: string | null;
    thinking: string | null;           // on / off / effort level, from the newest run of this setup
    spilled: boolean; kv: string; slots: number; mtp: boolean;
    vision: boolean | undefined; quant: string | null;
    // What the WEIGHTS can do (catalog traitsJson) - so the columns can say
    // "supported but off" (a downgrade) vs "the weights can't" (nothing lost).
    mtpSupported: boolean; visionSupported: boolean;
    offload: { layers: number | null; total: number | null } | null;
    tensorSplit: string | null; ubatch: number | null; ot?: string | null;
}

// Model identity half of the row key: '-mtp' folds so rows measured before
// and after the naming convention (the id says -mtp when MTP is in use) stay
// one history.
const modelKeyOf = (name: string): string => name.toLowerCase().replace(/-mtp$/, "");
// Row label: the MODEL the run measured, as the ROW records it - 'qwen3.8-27b',
// not the serving id it was launched under. Quant, KV, slots and MTP are
// columns of their own, so carrying them in the name too said the same thing
// twice. The row supplies its own name rather than borrowing
// the catalog's, because a benchmark may name a model that was never
// catalogued - see Model_Models_Benchmark.ModelId.
// Ladder rungs on the matrix, in K tokens, and the picker's column fields.
const RUNG_KS = [4, 16, 32, 64, 128, 256] as const;
type MatrixField = "4k" | "16k" | "32k" | "64k" | "128k" | "256k" | "x4" | "ttft" | "watts";
const MATRIX_COLUMNS: ColumnDefinition<MatrixField>[] = [
    ...RUNG_KS.map(k => ({ field: `${k}k` as MatrixField, label: `${k}K prompt` })),
    { field: "x4", label: "4K concurrent streams" },
    { field: "ttft", label: "Time to first token at 4K" },   // the chat agent's own measure
    { field: "watts", label: "watts" },
];
const STORAGE_KEY_BENCH_COLUMNS = "models_benchmarks_columns";
type SortCol = "label" | "quant" | "kv" | "slots" | "gb" | "score"
    | `pp${number}` | `gen${number}` | "each" | "total" | "ttft" | "watts";
const rungOfCol = (col: string): { k: number; m: "pp" | "gen" } | null => {
    const r = /^(pp|gen)(\d+)$/.exec(col);
    return r ? { k: Number(r[2]), m: r[1] as "pp" | "gen" } : null;
};
const IDENTITY_SORTS: SortCol[] = ["label", "quant", "kv", "slots", "gb", "score"];

const displayModel = (label: string): string => label;

// Where a measured run's weights actually lived. "ram" and "ssd" are NOT
// variations of one another - paging costs an order of magnitude.
// A fourth regime: "paged" - the model fits nowhere and the
// WINDOWS driver spilled part of the process into system RAM. No error, no
// disk read (the pages go to RAM), just a cliff: on a 5090, 0.65 GB shared ran
// at full speed, 1.1 GB cost 35% of generation and 50% of prefill, 4.9 GB cost
// 93% and 98%. Decided by the MEASURED vram_shared_gb the suite posts.
type Regime = "vram" | "ram" | "ssd" | "paged";
const PAGING_SHARED_GB = 0.8;

// A build id is not a name. "b10639-2a36554fc" tells a reader nothing about
// WHICH RUNTIME produced the number, and that is the part that matters - a
// llama.cpp figure and a vLLM/TensorRT figure are not comparable at all, which
// is exactly what NVFP4 will introduce. Name the runtime,
// keep the build, and leave the commit hash for the tooltip.
const engineLabel = (e: string | null, quant?: string | null): string => {
    // The FORMAT rides along when it is not ordinary GGUF. An NVFP4 run is a
    // different serving stack - Blackwell-only, and on the safetensors path a
    // different runtime entirely - so a reader must see that before comparing
    // its number to a GGUF row.
    const fmt = quant && /NVFP4/i.test(quant) ? " · NVFP4"
        : quant && /safetensors/i.test(quant) ? " · safetensors" : "";
    if (!e) return fmt ? fmt.replace(" · ", "") : "";
    const llama = /^b(\d+)/.exec(e.trim());
    // Just the build id - every row here is llama.cpp unless the format says
    // otherwise, the build id is already unique, and the runtime name was the
    // width that ellipsised the MoE rows.
    if (llama) return `b${llama[1]}${fmt}`;
    const vllm = /^vllm[\s-]*v?([\d.]+)/i.exec(e.trim());
    if (vllm) return `vLLM ${vllm[1]}${fmt}`;
    const trt = /tensorrt[\s-]*v?([\d.]*)/i.exec(e.trim());
    if (trt) return `TensorRT-LLM ${trt[1]}${fmt}`.trim();
    // Unknown runtime: show it verbatim rather than inventing a name.
    return e.length > 24 ? e.slice(0, 23) + "…" : e;
};
const median = (xs: number[]): number => {
    const a = [...xs].sort((x, y) => x - y);
    const i = Math.floor(a.length / 2);
    return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2;
};

// Rank a quant by its bits per weight - what the name encodes. Higher = better
// quality and bigger. Unknown names sort last rather than pretending a rank.
//   f16/bf16 16 · Q8 8 · Q6 6 · Q5 5 · Q4 4 · IQ4 ~4.25 (finer than Q4_0) · Q3 3 …
// The IQ variants are deliberately ranked just under their Q sibling: an
// IQ4_XS is smaller and slightly weaker than a Q4_K_XL at the same nominal 4.
const quantRank = (q: string | null): number => {
    if (!q) return -1;
    const s = q.toUpperCase();
    if (/BF16|F16|FP16/.test(s)) return 16;
    if (/NVFP4/.test(s)) return 4.5;          // 4-bit, but a distinct scheme
    const m = /I?Q(\d)/.exec(s);
    if (!m) return -1;
    const bits = Number(m[1]);
    return /IQ/.test(s) ? bits - 0.25 : bits;
};

// KV precision, same idea: f16 is the engine default and the highest quality.
const kvRank = (kv: string | null): number => {
    if (!kv) return 16;                        // absent means f16 (the default)
    const s = kv.toLowerCase();
    if (s.includes("f16") || s.includes("bf16")) return 16;
    const m = /q(\d)/.exec(s);
    return m ? Number(m[1]) : -1;
};
// What a cell READS AS - the filter popovers offer the values the eye sees
// in the column (house rule, see lab/Inventory.tsx). MTP and Vision are
// TRI-STATE: ✓ on in this setup · ✕ the weights support it
// but this setup runs without it (a downgrade, reads red) · — the weights
// don't have it (nothing lost, plain dash).
const rowText = (r: RowDef, field: string): string =>
    field === "model" ? displayModel(r.label)
        : field === "quant" ? (r.quant ?? "")
        : field === "kv" ? r.kv
        : field === "ctx" ? (r.ctxK ? `${r.ctxK}K` : "")
        : field === "slots" ? String(r.slots)
        : field === "think" ? (r.thinking ?? "—")
        : field === "ub" ? (r.ubatch ? `ub ${r.ubatch}` : "not recorded")
        : field === "split" ? (r.tensorSplit ?? "not recorded")
        : field === "ram" ? (r.offload ? `${r.offload.layers ?? "all"} in RAM` : "all on cards")
        : field === "mtp" ? (r.mtp ? "✓" : r.mtpSupported ? "✕" : "—")
        : field === "vision" ? (r.vision === true ? "✓"
            : r.vision === false ? (r.visionSupported ? "✕" : "—")
            : (r.visionSupported ? "✓" : "—"))
        : "";

// Persisted UI state, the Collectors/Junctions convention: read once on mount,
// written on every change, so sorting and column filters survive a reload like
// every other JR table. Wrapped in try/catch because
// localStorage throws outright in some privacy modes - a lost preference must
// never take the page down with it.
const STORAGE_KEY_BENCH_FILTERS = "models_bench_filters";
const STORAGE_KEY_BENCH_SORT = "models_bench_sort";

const ModelsBenchmarks = () => {
    // ⛔ THE MATRIX WAS DRAWN IN LITERAL BLACK. Text, rules, hover and the
    // spill tint were all rgba(0,0,0,…) - fine on a white page, and in dark
    // mode black on black: the table rendered and could not be read at all.
    // Resolve them from the THEME once, here, so every rule
    // below adapts instead of assuming the page is white. Nothing in this file
    // may hardcode a colour again - use these, or a palette token in sx.
    const theme = useTheme();
    const TEXT = theme.palette.text.primary;
    const MUTED = theme.palette.text.secondary;
    const FAINT = theme.palette.text.disabled;
    const LINE = theme.palette.divider;
    // The heavier rule where a machine block starts, and the header row's wash -
    // both from the theme so they read in dark mode too.
    const RULE_HEAVY = alpha(theme.palette.text.primary, 0.22);
    const HEAD_BG = alpha(theme.palette.text.primary, 0.03);
    const HOVER = theme.palette.action.hover;
    const WARN = theme.palette.warning.main;
    const WARN_BG = alpha(theme.palette.warning.main, 0.12);
    const WARN_LINE = alpha(theme.palette.warning.main, 0.3);

    usePageTitle("Models Benchmarks");

    const [catalog, setCatalog] = useState<ModelsCatalogEntry[]>([]);
    const [benchmarks, setBenchmarks] = useState<ModelsBenchmark[]>([]);
    const [refScoreRows, setRefScoreRows] = useState<ModelsReferenceScore[]>([]);
    const [verdicts, setVerdicts] = useState<ModelsFitVerdict[]>([]);
    const [machines, setMachines] = useState<Map<number, string>>(new Map());
    // Each machine's standing verdict (Lab machine Sentiment), keyed by name.
    const [sentiments, setSentiments] = useState<Map<string, string>>(new Map());
    const [machineIds, setMachineIds] = useState<Map<string, number>>(new Map());
    const [sentEdit, setSentEdit] = useState<{ mach: string; text: string } | null>(null);
    const [sentSaving, setSentSaving] = useState(false);
    const sentimentPlaced = useRef(false);
    const [machineFacts, setMachineFacts] = useState<Map<string, MachineFacts>>(new Map());
    const [tinOwners, setTinOwners] = useState<{ name: string; text: string }[]>([]);   // tin -> Lab machine, for pair labels
    const [error, setError] = useState<string | null>(null);
    // Which question the page is answering: how FAST, or how well it THINKS.
    // Persisted like every other table preference here - a reload should not
    // bounce you back to a tab you were not reading.
    // "speed" or a SUITE name. Not a fixed union: the tabs are discovered from
    // the rows, so a bench brought tomorrow needs no code change to appear.
    const [tab, setTab] = useState<string>(() => {
        try { return localStorage.getItem("models.benchmarks.tab") || "speed"; }
        catch { return "speed"; }
    });
    const pickTab = (v: string) => {
        setTab(v);
        try { localStorage.setItem("models.benchmarks.tab", v); } catch { /* private mode */ }
    };
    // Per-column filters, homelab-style: each identity column's funnel picks
    // from the values actually in that column. Global across sections.
    const [filters, setFilters] = usePersistedTableState<ColumnFilters>(STORAGE_KEY_BENCH_FILTERS, {});
    // The explainer folds away once read - default collapsed.
    const [explainerOpen, setExplainerOpen] = useState(false);
    // Connect-your-suite cards: at most one open at a time.
    const [connectOpen, setConnectOpen] = useState<string | null>(null);
    // Accordion expansion - persisted, the Machines convention.
    const expState = (key: string, dflt: boolean): [boolean, (v: boolean) => void] => {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const [v, setV] = useState<boolean>(() => {
            const st = localStorage.getItem(key);
            return st !== null ? JSON.parse(st) : dflt;
        });
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useEffect(() => { localStorage.setItem(key, JSON.stringify(v)); }, [key, v]);
        return [v, setV];
    };
    const [connectExpanded, setConnectExpanded] = expState("models_bench_connect_expanded", false);
    const [matrixExpanded, setMatrixExpanded] = expState("models_bench_matrix_expanded", true);
    const [runsExpanded, setRunsExpanded] = expState("models_bench_runs_expanded", true);
    // Latest = the newest suite's numbers; Median = across every clean run
    // of that exact setup. Either way n and min-max ride the tok/s tooltip.
    const [agg, setAgg] = useState<"latest" | "median">("latest");
    // ⛔ ONE VERSION AT A TIME. Rows from two versions of a suite are two
    // different measurements; blending them hides the change that caused the
    // difference. null = the newest version present, which is what you want
    // almost always - but the older eras stay reachable rather than deleted.
    const [version, setVersion] = usePersistedTableState<string | null>(
        "models.benchmarks.version", null);
    // Sorting the scored table, persisted like every other table preference.
    const [intelSort, setIntelSort] = usePersistedTableState<{ col: string; desc: boolean }>(
        "models.benchmarks.intelSort", { col: "overall", desc: true });

    // The reference benchmark the Score column shows - never a per-row mix.
    const [refMetric, setRefMetric] = useState<string | null>(readRefPref());
    // Section-wide sort: the clicked machine's values order every row.
    // The column picker (house pattern): every rung on by default; hiding is
    // per browser. visibleColumns is ordered, so the bands follow the picker.
    const {
        visibleColumns: visibleMatrixCols, orderedColumns: orderedMatrixCols, hiddenColumns: hiddenMatrixCols,
        toggleColumn: toggleMatrixCol, moveColumn: moveMatrixCol, resetToDefault: resetMatrixCols,
        anchorEl: colPickerAnchor, openPopover: openColPicker, closePopover: closeColPicker,
    } = useColumnVisibility<MatrixField>(STORAGE_KEY_BENCH_COLUMNS, MATRIX_COLUMNS);
    const [sort, setSort] = usePersistedTableState<{ col: SortCol; machine: string | null; desc: boolean }>(
        STORAGE_KEY_BENCH_SORT, { col: "gen4", machine: null, desc: true });

    const load = useCallback(async () => {
        try {
            const [catalogRes, benchRes, scoresRes, verdictsRes, componentsRes, machineMap] = await Promise.all([
                fetch("/api/models/catalog"),
                fetch("/api/models/benchmarks/recent?limit=20000"),
                fetch("/api/models/reference-scores"),
                fetch("/api/models/fit-verdicts"),
                fetch("/api/lab/components"),
                fetchMachineNames()
            ]);
            if (!catalogRes.ok) throw new Error(await catalogRes.text());
            if (!benchRes.ok) throw new Error(await benchRes.text());
            setCatalog(await catalogRes.json());
            setBenchmarks(await benchRes.json());
            // Both live in their own tables; an older server without the
            // endpoints just leaves them empty.
            if (scoresRes.ok) setRefScoreRows(await scoresRes.json());
            if (verdictsRes.ok) setVerdicts(await verdictsRes.json());
            // Hardware facts are optional garnish - a fleet with no lab
            // inventory still gets the full benchmark view.
            if (componentsRes.ok) {
                const comps = await componentsRes.json();
                setMachineFacts(machineFactsFrom(comps));
                setTinOwners(tinOwnersFrom(comps));
            }
            setMachines(machineMap);
            try {
                const mr = await fetch("/api/lab/machines");
                if (mr.ok) {
                    const all: { id: number; name: string; sentiment?: string | null }[] = await mr.json();
                    setSentiments(new Map(all.filter(m => m.sentiment).map(m => [m.name, m.sentiment!])));
                    setMachineIds(new Map(all.map(m => [m.name, m.id])));
                }
            } catch { /* garnish - the matrix stands without it */ }
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load the benchmark ledger");
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    // Delete one RUN: every row that submission wrote, together. A run is the
    // unit that was measured, so half of one left behind is a partial result
    // wearing a complete one's face - exactly what the all-or-nothing posting
    // rule exists to prevent. Reload afterwards so the table cannot show a
    // number computed from rows that no longer exist.
    const deleteRun = useCallback(async (ids: number[]) => {
        try {
            await Promise.all(ids.map(id =>
                fetch(`/api/models/benchmarks/${id}`, { method: "DELETE" })));
            setArmedDelete(null);
            await load();
        } catch (e) {
            setError(`Could not delete the run: ${e instanceof Error ? e.message : String(e)}`);
        }
    }, [load]);

    const byId = useMemo(() => new Map(catalog.map(c => [c.id, c])), [catalog]);

    // The versions the SPEED suite has posted. Same rule as the scored tabs:
    // one version at a time, newest by default. A speed suite that never posts
    // suite_version has a single "unversioned" era and the picker stays hidden -
    // there is nothing to choose between.
    const speedVersions = useMemo(
        () => versionsIn(benchmarks.filter(b => isSpeedMetric(b.metric))),
        [benchmarks]);
    const speedShown = version !== null && speedVersions.includes(version)
        ? version : (speedVersions[0] ?? null);

    const model = useMemo(() => {
        // Every benchmark row lands in the cell of ITS OWN config's setup
        // row - the row key comes from the measurement's configJson, so a
        // config change on the same llama-swap id starts a new row instead
        // of polluting the old one's history. Rows arrive newest-first.
        const cells = new Map<string, MeasCell>();
        const tuningsBy = new Map<string, Map<string, Set<string>>>();            // "machine|rowKey"
        const rowDefs = new Map<string, RowDef>();            // rowKey
        const cfgCache = new Map<string, Cfg>();
        const cfgOf = (json: string | null, name: string): Cfg => {
            const ck = `${json ?? ""}\u0000${name}`;
            let c = cfgCache.get(ck);
            if (!c) { c = parseCfg(json, name); cfgCache.set(ck, c); }
            return c;
        };
        // Fit verdicts (their own table): this exact setup cannot serve on
        // that machine. The reason beats the computed-inventory guess.
        const wontFit = new Map<string, string>();            // "machine|rowKey" -> reason
        for (const v of verdicts) {
            // ⛔ ONE ERA HERE TOO. A verdict carries suite_version like a row; shown
            // beside a newer era it claimed "won't fit" for placements the same
            // era had measured under another tuning (v2 REAP rows).
            if (suiteVersionOf(v.configJson) !== speedShown) continue;
            const modelName = byId.get(v.modelId)?.name ?? `#${v.modelId}`;
            const mach = machines.get(v.machineId) ?? `#${v.machineId}`;
            const cfg = cfgOf(v.configJson, modelName);
            const kv = cfg.kv ?? "f16";
            // ⚠️ QUANT AND CONTEXT ARE PART OF THE ROW'S IDENTITY. The label is the bare
            // model name, so without them six measured setups of one machine collapse into
            // two rows - q4 and q5 of the same model at the same KV read as one.
            // ⛔ THE SAME KEY AS A MEASURED ROW, PLACEMENT INCLUDED. A key that drifts
            // from the row key matches no verdict, and every refused cell would read
            // "untested" when the reason it does not work is known.
            const placement = cfg.offload ? (cfg.offload.layers ?? "all") : "";
            const rowKey = `${modelKeyOf(modelName)}|${cfg.quant ?? "?"}|${cfg.ctxK}|${kv}|${cfg.slots}|${cfg.mtp ? 1 : 0}|${cfg.vision === false ? 0 : 1}|${placement}`;
            const cellKey = `${mach}|${rowKey}#${tuningKeyOf(cfg)}`;
            if (!wontFit.has(cellKey)) wontFit.set(cellKey, v.reason);
        }
        for (const b of benchmarks) {
            if (b.machineId == null) continue;
            // ⛔ One version at a time here too - two versions of a speed suite
            // are two different measurements, exactly as two engine builds are.
            if (suiteVersionOf(b.configJson) !== speedShown) continue;
            // The row's OWN name. Not the catalog's - a benchmark may name a
            // model that is not catalogued at all, and it still belongs here.
            const modelName = b.modelName;
            const mach = machineLabel(machines, b, tinOwners);   // "Node A (Acer Veriton GN100)"; a pair's rows read "Nodes A+B (… + …)"
            const cfg = cfgOfBenchmark(b);
            // Row identity: exact setup. kv null folds into the f16 engine
            // default; vision undefined (pre-capture) folds into "has it"
            // rather than minting a phantom separate row.
            const kv = cfg.kv ?? "f16";
            // ⚠️ QUANT AND CONTEXT ARE PART OF THE ROW'S IDENTITY. The label is the bare
            // model name, so without them six measured setups of one machine collapse into
            // two rows - q4 and q5 of the same model at the same KV read as one.
            // ⛔ THE PLACEMENT IS PART OF THE ROW'S IDENTITY. How many expert layers
            // sit in system RAM decides the regime band the row lives in, and it
            // is what a placement-curve series varies: REAP-256 measured with every
            // expert on the cards, 12 in RAM and 37 in RAM at the same window
            // collapsed into ONE row showing only the newest, and the all-in-VRAM
            // result "vanished". Absent = all on the cards.
            const placement = cfg.offload ? (cfg.offload.layers ?? "all") : "";
            const baseKey = `${modelKeyOf(modelName)}|${cfg.quant ?? "?"}|${cfg.ctxK}|${kv}|${cfg.slots}|${cfg.mtp ? 1 : 0}|${cfg.vision === false ? 0 : 1}|${placement}`;
            // TUNING (split, ubatch) is a per-machine fact, not a cross-machine
            // identity: the desktop runs one card and records no split, so keying every
            // row on it put the desktop and the server on separate rows, each calling the
            // other untested. Rows are keyed on the tuning ONLY when
            // one machine ran several tunings of the same setup (an A/B); the
            // merge pass after this loop folds everything else back to the base.
            const tuning = tuningKeyOf(cfg);
            const rowKey = `${baseKey}#${tuning}`;
            const perMach = tuningsBy.get(baseKey) ?? tuningsBy.set(baseKey, new Map()).get(baseKey)!;
            (perMach.get(mach) ?? perMach.set(mach, new Set()).get(mach)!).add(tuning);
            const cellKey = `${mach}|${rowKey}`;
            const tuningText = [cfg.tensorSplit ? `split ${cfg.tensorSplit}` : "", cfg.ubatch ? `ub ${cfg.ubatch}` : ""].filter(Boolean).join(" · ");
            // Rows arrive newest-first, so the first row seen for a cell is its newest.
            const cell = cells.get(cellKey)
                ?? cells.set(cellKey, { rung: {}, watts: [], watts4: [], each: [], total: [], vram: [], streams: [], disk: [], shared: [], tuning: tuningText, newestAt: b.capturedAt, otherTunings: 0 }).get(cellKey)!;
                const scen = scenarioOf(b);
                const depth = depthOf(scen);
                const rungOf = (k: number) => cell.rung[k] ?? (cell.rung[k] = { pp: [], gen: [], ttft: [], lpp: [], ltg: [], failed: [] });
                if (b.metric === "gen_tok_s" && depth === RUNGS.short) {
                    rungOf(depth).gen.push(b.value);
                // The newest 4K run defines the row's face.
                if (!rowDefs.has(rowKey)) {
                    let traits: string[] = [];
                    try { traits = JSON.parse((b.modelId != null ? byId.get(b.modelId)?.traitsJson : null) ?? "[]") as string[]; }
                    catch { /* no traits, no claims */ }

                    // ⛔ MTP SUPPORT IS A FACT ABOUT THE WEIGHTS, NOT THE CHECKPOINT.
                    // traits describes the checkpoint, so Flash-Next - whose
                    // checkpoint has MTP and whose UD-IQ4_XS quant does not - showed
                    // a red ✕ on every row, reporting a capability left off when
                    // there was nothing to turn on. llama-server will not even load
                    // that quant with --spec-type draft-mtp.
                    //
                    // quantsJson carries mtp per quant, read from the GGUF tensor
                    // table. Absent means UNKNOWN, not false - fall back to the
                    // checkpoint rather than silently claiming the weights lack it.
                    let quantMtp: boolean | undefined;
                    try {
                        const qs = JSON.parse((b.modelId != null ? byId.get(b.modelId)?.quantsJson : null) ?? "[]") as
                            { quant?: string; mtp?: boolean }[];
                        const hit = qs.find(q => (q.quant ?? "").toLowerCase() === (cfg.quant ?? "").toLowerCase());
                        if (hit && typeof hit.mtp === "boolean") quantMtp = hit.mtp;
                    } catch { /* no quants, no claims */ }
                    rowDefs.set(rowKey, {
                    key: rowKey,
                    modelId: b.modelId,
                    mtpSupported: quantMtp ?? traits.includes("mtp"),
                    visionSupported: traits.includes("vision"),
                    label: modelName,
                    engine: cfg.engine,
                    thinking: thinkingOf(b),
                    sizeGb: cfg.weightsGb,
                    ctxK: cfg.ctxK, spilled: cfg.offload !== null,
                    kv, slots: cfg.slots, mtp: cfg.mtp, vision: cfg.vision,
                    quant: cfg.quant,
                    offload: cfg.offload,
                    tensorSplit: cfg.tensorSplit ?? null, ubatch: cfg.ubatch ?? null, ot: cfg.ot ?? null,
                    });
                }
            }
            else if (b.metric === "gen_tok_s" && depth != null) rungOf(depth).gen.push(b.value);
            else if (b.metric === "prompt_tok_s" && depth != null) rungOf(depth).pp.push(b.value);
            else if (b.metric === "ttft_s" && depth != null) rungOf(depth).ttft.push(b.value);
            else if (b.metric === "llb_pp512" && depth != null) rungOf(depth).lpp.push(b.value);
            else if (b.metric === "llb_tg128" && depth != null) rungOf(depth).ltg.push(b.value);
            else if (b.metric === "rung_failed" && depth != null) rungOf(depth).failed.push(b.notes ?? "no cause recorded");
            // Watts: the 32K rung, the 4K rung when a window stops short of it.
            else if (b.metric === "gpu_watts_avg" && depth === RUNGS.mid) cell.watts.push(b.value);
            else if (b.metric === "gpu_watts_avg" && depth === RUNGS.short) cell.watts4.push(b.value);
            else if (b.metric === "gen_tok_s" && concurrencyOf(scen)) { cell.each.push(b.value); cell.streams.push(concurrencyOf(scen)!.n); }
            else if (b.metric === "gen_tok_s_aggregate") cell.total.push(b.value);
            else if (b.metric === "vram_gb") cell.vram.push(b.value);
            else if (b.metric === "disk_read_mbs" && depth != null) cell.disk.push(b.value);
            else if (b.metric === "vram_shared_gb") cell.shared.push(b.value);
        }
        // Rows are never folded across tunings: each (split, ub, -ot) is its own
        // row, so tuningsBy is bookkeeping only.
        void tuningsBy;
        // ⛔ A REFUSAL WITHOUT A ROW WAS INVISIBLE. A verdict only rendered on a row
        // some machine had measured, so a setup tried and refused everywhere
        // (REAP-256 with every expert on the cards at 128K and 256K)
        // vanished from the matrix. A verdict now mints its own row when nothing
        // else did, so the cell reads "won't fit" with the engine's reason.
        for (const v of verdicts) {
            if (suiteVersionOf(v.configJson) !== speedShown) continue;
            const modelName = byId.get(v.modelId)?.name ?? `#${v.modelId}`;
            const cfg = cfgOf(v.configJson, modelName);
            const kv = cfg.kv ?? "f16";
            const placement = cfg.offload ? (cfg.offload.layers ?? "all") : "";
            const rowKey = `${modelKeyOf(modelName)}|${cfg.quant ?? "?"}|${cfg.ctxK}|${kv}|${cfg.slots}|${cfg.mtp ? 1 : 0}|${cfg.vision === false ? 0 : 1}|${placement}#${tuningKeyOf(cfg)}`;
            if (rowDefs.has(rowKey) || !cfg.ctxK) continue;
            let traits: string[] = [];
            try { traits = JSON.parse(byId.get(v.modelId)?.traitsJson ?? "[]") as string[]; } catch { /* no traits, no claims */ }
            rowDefs.set(rowKey, {
                key: rowKey, modelId: v.modelId, label: modelName,
                mtpSupported: traits.includes("mtp"), visionSupported: traits.includes("vision"),
                engine: null, thinking: null, sizeGb: cfg.weightsGb, ctxK: cfg.ctxK, spilled: cfg.offload !== null,
                kv, slots: cfg.slots, mtp: cfg.mtp, vision: cfg.vision, quant: cfg.quant,
                offload: cfg.offload, tensorSplit: cfg.tensorSplit ?? null, ubatch: cfg.ubatch ?? null, ot: cfg.ot ?? null,
            });
        }
        // Resolve each cell under the toggle. A cell without a 4K tok/s
        // stays absent - partial suites don't get a row face to sit in.
        const median = (a: number[]): number => {
            const s = [...a].sort((x, y) => x - y);
            const mid = s.length >> 1;
            return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
        };
        const resolve = (a: number[]): number | null =>
            a.length === 0 ? null : agg === "median" ? median(a) : a[0];
        const meas = new Map<string, Meas>();
        for (const [cellKey, c] of cells) {
            const face = c.rung[RUNGS.short]?.gen ?? [];
            if (face.length === 0) continue;
            const rung: Meas["rung"] = {};
            for (const [k, r] of Object.entries(c.rung)) rung[Number(k)] = { pp: resolve(r.pp), gen: resolve(r.gen), ttft: resolve(r.ttft), lpp: resolve(r.lpp), ltg: resolve(r.ltg), failed: r.failed[0] ?? null };
            meas.set(cellKey, {
                gen: resolve(face)!, rung, watts: resolve(c.watts) ?? resolve(c.watts4),
                each: resolve(c.each), total: resolve(c.total), vram: resolve(c.vram), streams: c.streams[0] ?? null,
                disk: c.disk, shared: c.shared, tuning: c.tuning, otherTunings: c.otherTunings,
                n: face.length, genMin: Math.min(...face), genMax: Math.max(...face),
            });
        }
        // Machines: FASTEST first - the box with the highest 4K tok/s leads
        // (: the desktop belongs left of the server). "Busiest first" had
        // put the always-on box, with its longer history, ahead of the desk.
        const bestGen = (mach: string) => Math.max(0, ...[...meas.entries()]
            .filter(([k]) => k.startsWith(mach + "|")).map(([, v]) => v.gen));
        const machineNames = [...new Set([...meas.keys()].map(k => k.split("|")[0]))]
            .sort((a, b) => bestGen(b) - bestGen(a) || a.localeCompare(b));
        const ctxKs = [...new Set([...rowDefs.values()].map(r => r.ctxK))].sort((a, b) => a - b);
        return { meas, rowDefs, machineNames, ctxKs, wontFit };
    }, [benchmarks, verdicts, byId, machines, tinOwners, agg, speedShown]);

    // ONE reference benchmark for the whole page (see benchmarkContract).
    // Default: the one covering the most models here; the reader can switch,
    // and the choice is remembered so Serving shows the same column.
    // ── INTELLIGENCE ────────────────────────────────────────────────────────
    // One row per (model × setup), one column per tier. ⛔ NOT per machine: the
    // same weights answer the same on either box, so machine is provenance and
    // rides the row's subtext, exactly as engine does on the Speed tab. It is
    // also what lets a cloud model - no machine, no quant, no VRAM - be a row
    // here rather than a special case.
    // ⛔ NO TAB IS HARDCODED - SPEED INCLUDED. Every tab, its
    // label AND its count come from the rows that posted. Speed used to be a
    // built-in rendered unconditionally, which meant a JR holding no speed data
    // still showed an empty Speed tab, and every bring-your-own bench sat next
    // to one privileged tab that existed for no reason a reader could see.
    // They are all just suites; only the RENDERING differs, because a pass rate
    // and a tok/s want different tables.
    //
    // The count is the number of rows the tab's own table will draw, so the
    // header never disagrees with what is under it.
    const tabs = useMemo(() => {
        // ⛔ COUNT ONLY THE VERSION THE TAB WILL SHOW. This counted every row
        // of a suite regardless of version while the table below drew one
        // version, so RULER read "(2)" over a single row - the other was an
        // older era, correctly hidden. A header that disagrees with the table
        // under it is worse than no header.
        const bySuite = new Map<string, ModelsBenchmark[]>();
        let speedRows = 0;
        for (const b of benchmarks) {
            if (isSpeedMetric(b.metric)) { speedRows++; continue; }
            const su = suiteOf(b.configJson, b.metric);
            if (!bySuite.has(su)) bySuite.set(su, []);
            bySuite.get(su)!.push(b);
        }
        const scored = new Map<string, Set<string>>();
        for (const [su, rows] of bySuite) {
            // Resolve this suite's shown version exactly as `intel` does.
            const vs = versionsIn(rows);
            const shown = version !== null && vs.includes(version) ? version : (vs[0] ?? null);
            const keys = new Set<string>();
            for (const b of rows) {
                if (suiteVersionOf(b.configJson) !== shown) continue;
                // Same row identity the scored table groups on: the WEIGHTS and
                // their setup, not the machine.
                keys.add(`${b.modelName}|${b.quant ?? ""}|${b.contextTokens ?? ""}`);
            }
            scored.set(su, keys);
        }
        const out: { key: string; label: string; count: number }[] = [];
        if (speedRows > 0) out.push({ key: "speed", label: suiteLabel("LLMSpeedTest"), count: model.rowDefs.size });
        for (const su of [...scored.keys()].sort((a, b) => suiteLabel(a).localeCompare(suiteLabel(b))))
            out.push({ key: su, label: suiteLabel(su), count: scored.get(su)!.size });
        return out;
    }, [benchmarks, model, version]);

    // A stored tab whose suite no longer has rows would render nothing at all.
    useEffect(() => {
        if (tabs.length > 0 && !tabs.some(t => t.key === tab)) pickTab(tabs[0].key);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabs]);

    // The suite currently shown - "speed" is the built-in throughput matrix.
    const activeSuite = tab === "speed" ? null : tab;

    // ⛔ THE MULTI-RUN CONTRACT. A suite gets run AGAIN - after
    // a fix, a new build, a different day - so one model+setup legitimately has
    // many runs and the table must say which it is showing. Identical rule to
    // the speed matrix, so the two tabs never mean different things by the same
    // word:
    //   LATEST - the newest run's value. What is true now.
    //   MEDIAN - the middle value across every run of that exact setup, which
    //            survives one anomalous run. Needs 2+ runs to differ.
    // n and the min-max spread ride the tooltip either way, and expanding the
    // row lists the individual runs with their dates - so any number on this
    // page can be traced back to the runs it was computed from, and a run that
    // should never have been posted can be deleted from where you found it.
    const intel = useMemo(() => {
        const all = benchmarks.filter(b => !isSpeedMetric(b.metric)
            && suiteOf(b.configJson, b.metric) === activeSuite);
        // ⛔ ONE VERSION AT A TIME - see suiteVersionOf. Default to the newest
        // present rather than everything, so the table is never a silent blend
        // of two different measurements.
        const versions = versionsIn(all);
        const shown = version !== null && versions.includes(version) ? version
            : (versions[0] ?? null);
        const rows = all.filter(b => suiteVersionOf(b.configJson) === shown);
        // How this suite asked to be drawn, and in what unit. Read from its
        // NEWEST row so a suite can change its mind without rewriting history.
        const { display, unit } = suiteDisplayFrom(rows);
        const med = (xs: number[]): number => {
            const a = [...xs].sort((x, y) => x - y), m = a.length >> 1;
            return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
        };
        // One submission's rows land together; a later run is a separate batch.
        const RUN_GAP_MS = 5 * 60 * 1000;
        const CLOUD = "";                                   // no machine: a hosted model
        type Sample = { id: number; value: number; cases: number | null; at: string; tier: string; mach: string; fails: CaseFailure[] };
        type Cell = { value: number; cases: number | null; at: string; n: number; min: number; max: number };
        type Run = { at: string; mach: string; ids: number[]; cells: Map<string, number>; fails: Map<string, CaseFailure[]> };
        type IRow = {
            key: string; modelName: string; quant: string | null; ctxK: number | null;
            machine: string | null; samples: Sample[]; at: string;
        };
        const byKey = new Map<string, IRow>();
        const tiers = new Set<string>();
        const machSet = new Set<string>();

        for (const b of rows) {
            const tier = scoreColumnOf(b.metric);
            tiers.add(tier);
            // A suite that declares its columns gets all of them, so a tier that
            // errored out entirely reads "— untested" instead of disappearing.
            for (const c of declaredColumnsOf(b.configJson)) tiers.add(c);
            // The setup is part of the identity - a Q4 and a Q5 of one model are
            // two different things to reason with, as they are to measure.
            const key = [b.modelName, b.quant ?? "", b.contextTokens ?? ""].join("|");
            const mach = b.machineId != null ? (machineLabel(machines, b, tinOwners) || CLOUD) : CLOUD;
            machSet.add(mach);
            let r = byKey.get(key);
            if (!r) {
                r = {
                    key, modelName: b.modelName, quant: b.quant ?? null,
                    ctxK: b.contextTokens ? Math.round(b.contextTokens / 1024) : null,
                    machine: mach || null, samples: [], at: b.capturedAt,
                };
                byKey.set(key, r);
            }
            r.samples.push({ id: b.id, value: b.value, cases: casesOf(b.configJson), at: b.capturedAt, tier, mach,
                             fails: failuresOf(b.configJson) });
            if (b.capturedAt > r.at) r.at = b.capturedAt;
        }

        // Resolve a set of samples into one cell under the Latest/Median toggle.
        const cellOf = (arr: Sample[]): Cell => {
            const vals = arr.map(s => s.value);
            return {
                value: agg === "median" ? med(vals) : arr[0].value,
                cases: arr[0].cases, at: arr[0].at,
                n: arr.length, min: Math.min(...vals), max: Math.max(...vals),
            };
        };

        // ⛔ AN OVERALL OVER FEWER TIERS IS NOT THE SAME NUMBER. A model run
        // through a terminal cannot do the tool_calling tier - a CLI takes no
        // per-case tool schema and returns no structured tool_calls - so it
        // scores on four tiers where a local model scores on five. Averaged
        // without saying so, a partial run reads as a full one and ranks above
        // models that were actually tested harder.
        const fullTierCount = tiers.size;
        const machList = [...machSet].sort((a, b) => (a || "~").localeCompare(b || "~"));

        const list = [...byKey.values()].map(r => {
            r.samples.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));   // newest first

            // TABLE shape: machine collapsed away, because the weights answer
            // the same wherever they ran. MATRIX shape: machine kept as an
            // axis, because the suite declared the box is part of the finding.
            const group = (pred: (s: Sample) => boolean) => {
                const by = new Map<string, Sample[]>();
                for (const s of r.samples) {
                    if (!pred(s)) continue;
                    if (!by.has(s.tier)) by.set(s.tier, []);
                    by.get(s.tier)!.push(s);
                }
                const out = new Map<string, Cell>();
                for (const [tier, arr] of by) out.set(tier, cellOf(arr));
                return out;
            };
            const cells = group(() => true);
            const byMachine = new Map<string, Map<string, Cell>>();
            for (const m of machList) {
                const c = group(s => s.mach === m);
                if (c.size) byMachine.set(m, c);
            }

            // Runs: this row's samples split wherever a gap says a new
            // invocation started. One run = one submission = one date.
            const runs: Run[] = [];
            let cur: Run | null = null, prevT = 0;
            for (const s of r.samples) {
                const t = new Date(s.at).getTime();
                if (!cur || prevT - t > RUN_GAP_MS || cur.mach !== s.mach) {
                    cur = { at: s.at, mach: s.mach, ids: [], cells: new Map(), fails: new Map() };
                    runs.push(cur);
                }
                cur.ids.push(s.id);
                if (!cur.cells.has(s.tier)) {
                    cur.cells.set(s.tier, s.value);
                    if (s.fails.length) cur.fails.set(s.tier, s.fails);
                }
                prevT = t;
            }

            const overallOf = (c: Map<string, Cell>) =>
                overallRate([...c.values()].map(x => ({ value: x.value, cases: x.cases })));

            return {
                ...r, cells, byMachine, runs,
                overall: overallOf(cells),
                overallBy: new Map([...byMachine].map(([m, c]) => [m, overallOf(c)])),
                ranTiers: cells.size,
                partial: cells.size < fullTierCount,
            };
        });
        // Sort by whichever column was clicked; model name breaks every tie so
        // the order is stable rather than whatever the map happened to yield.
        const valueOf = (r: typeof list[number]): number | null =>
            intelSort.col === "overall" ? r.overall : (r.cells.get(intelSort.col)?.value ?? null);
        list.sort((a, b) => {
            if (intelSort.col === "model") {
                const c = a.modelName.localeCompare(b.modelName);
                return intelSort.desc ? -c : c;
            }
            // An absent number always sorts last, in either direction: "not
            // measured" is not a low score and must not read as one.
            const va = valueOf(a), vb = valueOf(b);
            if (va == null && vb == null) return a.modelName.localeCompare(b.modelName);
            if (va == null) return 1;
            if (vb == null) return -1;
            return (intelSort.desc ? vb - va : va - vb)
                || a.modelName.localeCompare(b.modelName);
        });
        return { rows: list, tiers: sortTiers([...tiers]), machines: machList,
                 display, unit, versions, shown };
    }, [benchmarks, machines, activeSuite, agg, version, intelSort]);

    const refOptions = useMemo(() => refMetricsPresent(refScoreRows), [refScoreRows]);
    useEffect(() => {
        if (refMetric && refOptions.includes(refMetric)) return;
        // ⛔ Never override a score the user PINNED. The
        // auto-picker exists for a first visit with no preference; it used to
        // fire whenever the chosen metric was absent from refOptions - which
        // includes the moment before the scores have loaded, so an explicit
        // choice was silently replaced on every navigation back to the page.
        if (readRefPref()) return;
        if (refScoreRows.length === 0) return;
        // Only a catalogued row can cite a reference score - an unlinked one has
        // no entry to hang it on.
        const ids = new Set([...model.rowDefs.values()]
            .map(r => r.modelId)
            .filter((id): id is number => id != null));
        const auto = widestRefMetric(refScoreRows, ids);
        if (auto) setRefMetric(auto);
    }, [refScoreRows, model, refMetric, refOptions]);
    const refScores = useMemo(
        () => refMetric ? refScoresFor(refScoreRows, refMetric) : new Map(),
        [refScoreRows, refMetric]);

    const fmt = (v: number | null | undefined, digits = 0) =>
        v == null ? "–" : v.toLocaleString(undefined, { maximumFractionDigits: digits });

    // A sortable header for the scored table. Clicking a column sorts by it;
    // clicking it again reverses. The choice is persisted, like every other
    // table preference on this page.
    const sortHead = (col: string, label: string, align: "left" | "right" = "right") => (
        <TableCell key={col} align={align}
            onClick={() => setIntelSort({ col, desc: intelSort.col === col ? !intelSort.desc : true })}
            sx={{
                fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", whiteSpace: "nowrap",
                cursor: "pointer", userSelect: "none",
                color: intelSort.col === col ? "text.primary" : "text.secondary",
                "&:hover": { color: "text.primary" },
            }}>
            {label}{intelSort.col === col ? (intelSort.desc ? " ▾" : " ▴") : ""}
        </TableCell>
    );

    // ── Scored-suite cell renderers ──────────────────────────────────────────
    // Banded ONLY when the suite's unit is a percentage pass rate. A suite
    // reporting something else gets its number and its unit and no colour: 90
    // of an unknown unit is not "good", and colouring it would assert a verdict
    // the submitter never made.
    const scoreCell = (c?: { value: number; cases: number | null; at: string; n: number; min: number; max: number }) => {
        if (!c) return (
            <Tooltip arrow title="Declared by the suite, but not run for this model">
                <Box component="span" sx={{ color: "text.disabled", cursor: "help" }}>— untested</Box>
            </Tooltip>
        );
        const pct = intel.unit === "%";
        const spread = c.n > 1 ? ` · spread ${c.min.toFixed(1)}–${c.max.toFixed(1)}` : "";
        return (
            <Tooltip arrow placement="left" title={
                `${agg === "median" ? "Median" : "Latest"} of n=${c.n} run${c.n === 1 ? "" : "s"}${spread}`
                + ` · ${c.cases ?? "?"} case(s) · newest ${c.at.slice(0, 10)}`}>
                <Box component="span" sx={{ fontWeight: 700, cursor: "help", color: pct ? evalColor(c.value) : "text.primary" }}>
                    {c.value.toFixed(1)}{pct ? "%" : ` ${intel.unit}`}
                </Box>
            </Tooltip>
        );
    };

    const overallCell = (overall: number | null, ranTiers: number, partial: boolean) => overall == null
        ? <Box component="span" sx={{ color: "text.disabled" }}>—</Box>
        : (
            <Tooltip arrow placement="left" title={
                "Case-weighted across columns, never a mean of rates - a five-case column and a twenty-case column do not deserve equal say."
                + (partial ? ` ⚠ PARTIAL: ${ranTiers} of ${intel.tiers.length} columns ran, so this is NOT comparable with a full run.` : "")}>
                <Box component="span" sx={{
                    fontWeight: 800, fontSize: 13.5, cursor: "help",
                    color: partial ? "text.secondary" : (intel.unit === "%" ? evalColor(overall) : "text.primary"),
                }}>
                    {overall.toFixed(1)}{intel.unit === "%" ? "%" : ` ${intel.unit}`}
                    {partial && (
                        <Box component="span" sx={{ fontSize: 10, fontWeight: 700, color: "warning.main", ml: 0.5 }}>
                            ⚠{ranTiers}/{intel.tiers.length}
                        </Box>
                    )}
                </Box>
            </Tooltip>
        );

    // Absence typing, in precedence order: an ENTERED wont_fit verdict (the
    // ledger's measured refusal or stated policy, reason in its notes), then
    // then "untested". The page NEVER computes an impossibility - it believes
    // a recorded verdict and says nothing otherwise.
    const absence = (mach: string, row: RowDef): { imp: boolean; why: string } => {
        const entered = model.wontFit.get(`${mach}|${row.key}`);
        if (entered) return { imp: true, why: entered };
        // ⛔ NOTHING ELSE MAKES A CELL "WON'T FIT". Only a RECORDED verdict - a
        // real load that the box refused, with its own error - can say that.
        //
        // There used to be a computed one here: weights > the machine's
        // inventoried VRAM. It is WRONG, because weights larger than VRAM are
        // not impossible - llama.cpp mmaps the remainder into system RAM, and
        // MoE setups do it deliberately (--n-cpu-moe). Qwen3-Coder-Next runs on
        // the desktop at 49.6 GB against 32 GB of VRAM, and Flash-Next LOADED AND RAN
        // at 93.7 GB on that same card (badly - 4.5 tok/s - but it ran, which
        // is the point: slow is a measurement, impossible is a claim).
        // It read "93.7 > 28 GB" and meant nothing.
        return { imp: false, why: "" };
    };
    // The cell states a reason - a SHORT one, because a recorded refusal can
    // carry a whole OOM story and the full text belongs in the tooltip.
    const shortWhy = (why: string): string => {
        // ⚠️ JR is suite-agnostic: a reason arrives as whatever the submitter's
        // harness scraped, and that is routinely a raw log line - syslog date,
        // hostname, pid, the engine's own uptime prefix, absolute paths. The
        // cell must never render that (a verdict displayed as "01:56 host
        // llama-swap…"). Strip the furniture first, classify
        // on the WHOLE text, and only ever fall back to a cleaned fragment.
        const clean = why
            .replace(/[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\S+\s+\S+?\[\d+\]:\s*/g, "")
            .replace(/\d+\.\d+\.\d+\.\d+\s+[EWID]\s+(?:srv|cmn|common\S*|load)?\s*/g, "")
            .replace(/\[[A-Z]+\]\s*/g, "")
            .replace(/[A-Za-z]:[\\/][^\s'"]+[\\/]|\/(?:[\w.-]+\/)+/g, "")
            .trim();
        // Classified on the full text, so the cause wins wherever it appears -
        // engines log the cause once and the consequence several times after.
        if (/out of memory|cudamalloc|\bOOM\b|failed to allocate|unable to allocate/i.test(clean))
            return /kv cache/i.test(clean) ? "KV cache OOM" : "OOM on load";
        if (/kv cache/i.test(clean)) return "KV cache OOM";
        if (/unknown model architecture|unsupported/i.test(clean)) return "arch unsupported";
        if (/policy|rule|forbid/i.test(clean)) return "excluded here";
        const first = clean.replace(/^[^:]{0,24}:\s*/, "").split(/[;.]/)[0].trim();
        return first.length > 26 ? first.slice(0, 25) + "…" : first;
    };

    const sortVal = (row: RowDef, mach: string): number => {
        const m = model.meas.get(`${mach}|${row.key}`);
        if (!m) return -Infinity;
        const rc = rungOfCol(sort.col);
        const v = rc ? (m.rung[rc.k]?.[rc.m] ?? null)
            : sort.col === "each" ? m.each : sort.col === "total" ? m.total : sort.col === "watts" ? m.watts
            : sort.col === "ttft" ? (m.rung[RUNGS.short]?.ttft ?? null) : m.gen;
        return v ?? -Infinity;
    };
    // Identity columns compare on the row itself, no machine anchor.
    // ⚠️ Quant and KV are QUALITY SCALES, not alphabets. Sorted as text,
    // UD-IQ4_XS lands above UD-Q5_K_XL and q4_0 above q8_0 - the reverse of
    // what the column means. Rank by bits-per-weight, which
    // is what the name encodes, so sorting reads as better-to-worse.
    const identityCmp = (a: RowDef, b: RowDef): number => {
        switch (sort.col) {
            case "quant": return quantRank(a.quant) - quantRank(b.quant);
            case "kv": return kvRank(a.kv) - kvRank(b.kv);
            case "slots": return a.slots - b.slots;
            case "gb": return (a.sizeGb ?? -1) - (b.sizeGb ?? -1);
            case "score": return ((a.modelId != null ? refScores.get(a.modelId)?.value : undefined) ?? -1)
                - ((b.modelId != null ? refScores.get(b.modelId)?.value : undefined) ?? -1);
            default: return displayModel(a.label).localeCompare(displayModel(b.label));
        }
    };

    const eyebrowSx = {
        fontSize: 11, fontWeight: 700, letterSpacing: "0.11em",
        textTransform: "uppercase" as const, color: "text.secondary"
    };

    // Filter options come from ALL rows, not the filtered subset, so options
    // do not vanish as you filter a different column (house rule).
    const allRows = useMemo(() => [...model.rowDefs.values()], [model]);
    // The machine filter hides a machine's column block. Rows with no cell and no
    // verdict on a shown
    // machine drop out with it.
    const pickedMachines = filters.machine ?? [];
    // The placement filter hides whole regime bands - pick "all in VRAM" to read
    // only what fits the cards (no overspill results).
    const REGIME_LABELS: Record<Regime, string> = { vram: "all in VRAM", ram: "experts → RAM", ssd: "paged from SSD", paged: "paged to RAM" };
    const pickedRegimes = filters.regime ?? [];
    const regimeShown = (r: Regime) => !pickedRegimes.length || pickedRegimes.includes(REGIME_LABELS[r]);
    const shownMachines = model.machineNames.filter(m => !pickedMachines.length || pickedMachines.includes(m));
    const valuesFor = (field: string): string[] =>
        field === "machine" ? model.machineNames :
        field === "regime" ? Object.values(REGIME_LABELS) :
        distinctValues(allRows, r => rowText(r, field));

    // Column plumbing. Identity columns sit between Model and the machine
    // groups; metric columns repeat per machine. Widths fixed so sections
    // align vertically down the page.
    // Widths carry deliberate air - columns breathe rather than abut.
    const ID_COLS: { field: string; label: string; w: number; align: "left" | "center" | "right"; sort: SortCol | null; filter: boolean }[] = [
        { field: "quant", label: "Quant", w: 100, align: "left", sort: "quant", filter: true },
        { field: "kv", label: "KV", w: 56, align: "left", sort: "kv", filter: true },
        { field: "slots", label: "Slots", w: 50, align: "center", sort: "slots", filter: true },
        { field: "mtp", label: "MTP", w: 44, align: "center", sort: null, filter: true },
        { field: "think", label: "Think", w: 52, align: "center", sort: null, filter: true },   // on / off / effort
        { field: "vision", label: "Vision", w: 54, align: "center", sort: null, filter: true },
        { field: "gb", label: "GB", w: 52, align: "right", sort: "gb", filter: false },
        // Cited third-party coding eval (SWE-bench Verified, else Pro/Aider) -
        // provenance and the not-this-quant caveat ride the tooltip.
        // ONE benchmark for every row (the picker above chooses it); the
        // header names it so the table reads right in a screenshot.
        // Just "Score" - the picker above the table already names WHICH benchmark,
        // and the long names (SWE-BENCH PRO) cost width the machine columns need
        // more.
        { field: "score", label: "Score",
          w: 64, align: "right", sort: "score", filter: false },
    ];
    type ColKey = Exclude<SortCol, "label" | "quant" | "kv" | "slots" | "gb" | "score">;
    const COLS: { key: ColKey; label: string; sub: string; w: number }[] = visibleMatrixCols.flatMap((f: MatrixField): { key: ColKey; label: string; sub: string; w: number }[] => {
        const k = /^(\d+)k$/.exec(f);
        if (k) { const n = Number(k[1]); return [{ key: `pp${n}`, label: `${n}K`, sub: "prefill", w: 66 }, { key: `gen${n}`, label: `${n}K`, sub: "tok/s", w: 56 }]; }
        // The field key stays "x4" (browsers persist it); the header does not promise four -
        // each cell names its own N when it is not 4 (GLM-5.3-Flash ran 1 stream).
        if (f === "x4") return [{ key: "each", label: "4K streams", sub: "each / total", w: 88 }];
        if (f === "ttft") return [{ key: "ttft", label: "TTFT", sub: "4K, s", w: 58 }];
        return [{ key: "watts", label: "watts", sub: "", w: 54 }];
    });
    // WIDTHS ARE SHARES OF THE SPACE WE HAVE, not pixels. The identity block takes 45% and the
    // machines split the rest equally, each column in proportion to its w, so
    // the table always fills its box exactly and never scrolls.
    // ⛔ FIXED PIXEL COLUMNS. Every column has one width in every section, and
    // the table is exactly as wide as its columns - it scrolls inside its box
    // when the window is narrower, it never squeezes. Window percentages would let
    // each added column shrink all the others until the numbers no longer fit.
    // The band row: one head per rung spanning its prefill + tok/s pair (six
    // near-identical micro-labels read as no heads at all).
    const BANDS = COLS.reduce<{ label: string; span: number }[]>((acc, c) => {
        const last = acc[acc.length - 1];
        if (last && last.label === c.label) last.span++; else acc.push({ label: c.label, span: 1 });
        return acc;
    }, []);
    const GAP_W = 12;
    // The model column fits its longest name: between
    // the old 216 px floor and a 460 px ceiling, ~7.2 px a character at this font.
    const longestModel = Math.max(0, ...[...model.rowDefs.values()].map(r => displayModel(r.label).length));
    const MODEL_W = Math.min(460, Math.max(216, Math.round(longestModel * 7.2) + 28));
    const idW = ID_COLS.reduce((n, c) => n + c.w, 0);
    const colsW = COLS.reduce((n, c) => n + c.w, 0);
    const TABLE_W = MODEL_W + idW + Math.max(1, shownMachines.length) * (colsW + GAP_W);
    const totalCols = 1 + ID_COLS.length + shownMachines.length * (COLS.length + 1);

    const sortGlyph = (col: SortCol, mach: string | null) => {
        const active = sort.col === col && sort.machine === mach;
        return (
            <Box component="span" sx={{ fontSize: 9, ml: "2px", color: active ? "text.primary" : FAINT }}>
                {active ? (sort.desc ? "▾" : "▴") : "↕"}
            </Box>
        );
    };
    const clickSort = (col: SortCol, mach: string | null) => setSort(prev => ({
        col, machine: mach,
        desc: prev.col === col && prev.machine === mach ? !prev.desc : col !== "label"
    }));

    // Suite runs: one line per bench invocation, newest first. A run is a
    // CLUSTER IN TIME per (machine, model) - consecutive rows belong to the
    // same run while they land within GAP of each other, so a suite that
    // straddles a minute (or hour) boundary stays one line. Timestamps are
    // UTC without the Z suffix (server quirk); parse them as the UTC they are.
    const utcDate = (iso: string): Date =>
        new Date(/Z$|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + "Z");
    interface SuiteRun { key: string; at: string; mach: string; model: string; scen: Set<string>; rows: ModelsBenchmark[]; engine: string | null; configJson: string | null }
    const suiteRuns = useMemo(() => {
        const GAP_MS = 5 * 60 * 1000;
        const byPair = new Map<string, { mach: string; model: string; rows: ModelsBenchmark[] }>();
        for (const b of benchmarks) {
            if (b.machineId == null) continue;
            const mach = machines.get(b.machineId) ?? `#${b.machineId}`;
            const name = b.modelName;
            const pk = `${mach}|${name}`;
            (byPair.get(pk) ?? byPair.set(pk, { mach, model: name, rows: [] }).get(pk)!).rows.push(b);
        }
        const runs: SuiteRun[] = [];
        for (const pair of byPair.values()) {
            pair.rows.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
            let cur: SuiteRun | null = null;
            let prevT = 0;
            for (const b of pair.rows) {
                const t = utcDate(b.capturedAt).getTime();
                if (!cur || t - prevT > GAP_MS) {
                    cur = { key: `${pair.mach}|${pair.model}|${b.capturedAt}`, at: b.capturedAt, mach: pair.mach, model: pair.model, scen: new Set(), rows: [], engine: null, configJson: null };
                    runs.push(cur);
                }
                prevT = t;
                cur.at = b.capturedAt; // the run wears its newest row's stamp
                const s = scenarioOf(b);
                if (s !== "unknown") cur.scen.add(s);
                cur.rows.push(b);
                if (!cur.configJson && b.configJson) cur.configJson = b.configJson;
                // Engine version rides configJson ('engine': llama-server build_info) -
                // the axis that makes results comparable across runtime upgrades.
                if (!cur.engine) {
                    try { cur.engine = String((JSON.parse(b.configJson ?? "{}") as Record<string, unknown>).engine ?? "") || null; }
                    catch { /* stays null */ }
                }
            }
        }
        return runs.sort((a, b) => b.at.localeCompare(a.at));
    }, [benchmarks, machines]);
    const [runsPage, setRunsPage] = useState(0);
    const [runsPerPage, setRunsPerPage] = useState(10);
    const [expandedRun, setExpandedRun] = useState<string | null>(null);
    // Scored tabs: which model row is expanded to show its individual runs,
    // and which run is one click away from deletion. Deleting is two-step on
    // purpose - a run is measured data and there is no undo.
    const [intelOpen, setIntelOpen] = useState<string | null>(null);
    const [armedDelete, setArmedDelete] = useState<string | null>(null);

    return (
        <Box sx={{ p: 2, fontVariantNumeric: "tabular-nums" }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Benchmarks</Typography>

            {error && <Typography color="error" variant="body2" sx={{ mb: 2 }}>{error}</Typography>}

            {model.ctxKs.length === 0 && !error && (
                <Typography variant="body2" color="text.secondary">
                    No measurements yet — connect a benchmark suite below and this page fills itself.
                </Typography>
            )}

            {/* ---- Connect your suites (plural, deliberately): the page is
                 suite-agnostic and hosts as MANY as post to it. Speed is just
                 the built-in one; every other suite that posts scored rows
                 earns its own tab, discovered from the data - see `tabs`.
                 Terse on purpose; the full text is in the repo. ---- */}
            <Accordion expanded={connectExpanded} onChange={() => setConnectExpanded(!connectExpanded)}
                TransitionProps={{ timeout: connectExpanded ? undefined : 0 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={ACCORDION_SUMMARY_SX}>
                    <Box sx={ACCORDION_HEADER_BOX_SX}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Connect your suites</Typography>
                    </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                {([
                    ["contract", "The contract", <>
                        Post one MCP call per measurement to this server&#39;s local endpoint
                        (<code>/mcp</code>, bearer key from Settings → Local MCP): <code>models_record_benchmark</code> with{" "}
                        <code>modelName</code> — the MODEL, e.g. <code>qwen3.8-27b</code>, not a serving id, and it
                        need <em>not</em> be in your catalog — plus <code>metric</code>. The SPEED metrics are{" "}
                        <code>gen_tok_s</code> · <code>prompt_tok_s</code> · <code>gen_tok_s_aggregate</code> · <code>gpu_watts_avg</code> · <code>vram_gb</code> · <code>cold_load_s</code>{" "}
                        (anything else is a scored suite — see below),{" "}
                        <code>machine</code>, <code>scenario</code> (a prompt depth: <code>4k</code> · <code>16k</code> · <code>32k</code> · <code>64k</code> · <code>128k</code> · <code>256k</code>, or <code>4k_xN</code> for N simultaneous streams),
                        and <strong>the setup, captured at run time</strong>: <code>quant</code>, <code>contextTokens</code>,{" "}
                        <code>slots</code>, <code>kvPrecision</code>, <code>mtp</code>, <code>vision</code>, <code>engine</code>, <code>weightsGb</code>.
                        Read those from the running server (llama-server: <code>/props?model=&lt;id&gt;</code>) — never from a
                        catalog entry, which can only say which quants you own, not which one this run loaded. A field you
                        did not capture is sent null and shows <code>—</code>; unknown is a legitimate answer.
                        Rules that keep numbers comparable: measured from engine telemetry, never estimated;
                        one box at a time; salt your prompts (engines prompt-cache); retire invalidated eras
                        with <code>models_delete_benchmarks</code>. Full text: <code>docs/BENCHMARK-CONTRACT.md</code>.
                    </>],
                    ["scored", "Bring your own bench: a tab of your own", <>
                        Nothing on this page is hardcoded — not the tabs, not the columns, not the
                        ordering. A suite that measures something other than speed gets its own tab, its
                        own columns and its own scores <em>without a line of JR code</em>, because all
                        three are read back out of the rows you post.
                        <br /><br />
                        <strong>The metric name IS the column.</strong> Post{" "}
                        <code>metric</code> as <code>&lt;family&gt;_&lt;column&gt;</code>. Everything before the
                        first underscore is the family, everything after it is the column heading — so{" "}
                        <code>eval_tool_calling</code> is the <em>Tool Calling</em> column, and{" "}
                        <code>mybench_accuracy</code> is the <em>Accuracy</em> column of a suite called{" "}
                        <code>mybench</code>. Underscores become spaces and the heading is title-cased for
                        display; the raw name is what you post. A new column is just a new metric name.
                        <br /><br />
                        <strong>Name the suite</strong> in <code>configJson.suite</code> — that string is the
                        tab, and every row carrying it lands together. Without it the family prefix is used
                        instead, which works but splits <code>gen_tok_s</code> and <code>prompt_tok_s</code>
                        into two tabs, so name it. The tab shows a count of the rows beneath it.
                        <br /><br />
                        <strong>Values are pass rates, 0–100</strong> — not durations, not counts, not
                        seconds. 100 is the only score meaning nothing failed. Send <code>cases</code> per
                        row and the overall is weighted by case count across columns rather than averaging
                        the averages, so a 12-case column outweighs a 2-case one as it should.
                        <br /><br />
                        ⚠️ <strong>Declare your columns.</strong> Send <code>configJson.suite_columns</code>:
                        the full list of columns the suite runs, in the order you want them tried. Without
                        it a column whose cases all failed to execute simply <em>vanishes</em> from the
                        table, and a run that half-worked is indistinguishable from a clean one. Declared
                        columns render <code>— untested</code> instead, which is the honest answer.
                        <br /><br />
                        ⛔ <strong>Post a finished run, or post nothing — and the unit is one MODEL.</strong>{" "}
                        Buffer a model's rows and submit them together once that model has finished every
                        case clean. Not per column, because that publishes a row's first columns while its
                        later ones are still being measured, and the half-populated result reads exactly
                        like a completed one — there is no marker that says otherwise, and nobody reading
                        it later can tell. Not per sweep either: models measured back to back are
                        independent results, so a failure on the last must not discard the ones already
                        good. If a case errors, post nothing for that model and fix the cause — an
                        incomplete run is not a smaller result, it is a wrong one.
                        <br /><br />
                        A hosted model has no <code>machine</code> — omit the field rather than inventing a
                        box for it. Scores key on the WEIGHTS (model, quant, context), not the box, because
                        the same quant answers the same on either machine.
                    </>],
                    ["example", "The example suite", <>
                        The repo ships a reference harness, <code>docs/examples/llm-bench.py</code> — a single
                        dependency-free Python file that measures any OpenAI-compatible llama-server / llama-swap
                        box (the depth ladder, salted prompts, telemetry-only speeds) and posts each row over
                        MCP as it is measured. Point it at your own suite&#39;s output instead if you have one;
                        the contract is the interface, not this script.
                    </>],
                    ["run", "Running it", <>
                        1. Mint a bearer key in Settings → Local MCP and add your models with{" "}
                        <code>models_add_model</code> (or let an agent do it via <code>models_query</code> first).{" "}
                        2. Start the harness <i>detached</i> on a coordinator that can reach your inference
                        boxes — never on the box being measured, and not supervised by an agent whose own
                        model is being benched. 3. Rows appear here as they land, grouped by exact config.
                    </>],
                ] as [string, string, ReactNode][]).map(([k, title, body]) => (
                    <Box key={k} sx={{ mt: 1 }}>
                        <Typography onClick={() => setConnectOpen(o => o === k ? null : k)}
                            sx={{ fontSize: 12.5, fontWeight: 700, cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: 1 }}>
                            <Box component="span" sx={{ fontSize: 10 }}>{connectOpen === k ? "▾" : "▸"}</Box>
                            {title}
                        </Typography>
                        <Collapse in={connectOpen === k} timeout="auto" unmountOnExit>
                            <Typography component="div" variant="body2" sx={{ color: "text.secondary", mt: 0.5, ml: 2.5, lineHeight: 1.55, "& code": { fontSize: 12 } }}>
                                {body}
                            </Typography>
                        </Collapse>
                    </Box>
                ))}
                </AccordionDetails>
            </Accordion>

            {/* One tab per SUITE, discovered from the rows - nothing here is a
                fixed pair. Speed is how fast it answers; a scored suite is
                whether the answer is usable, and a model that types at 140 tok/s
                but never finishes a thought is worse than a slower one that
                does. The speed matrix cannot see that difference, which is the
                whole reason another suite gets to exist beside it. */}
            <Tabs
                value={tab}
                onChange={(_, v) => pickTab(v)}
                sx={{ mb: 2, mt: 2, borderBottom: 1, borderColor: "divider", minHeight: 40 }}
            >
                {tabs.map(t => (
                    <Tab key={t.key} value={t.key} label={`${t.label} (${t.count})`} sx={{ minHeight: 40 }} />
                ))}
            </Tabs>

            {tab === "speed" && (<>
            <Accordion expanded={matrixExpanded} onChange={() => setMatrixExpanded(!matrixExpanded)}
                TransitionProps={{ timeout: matrixExpanded ? undefined : 0 }} sx={{ mt: 2 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={ACCORDION_SUMMARY_SX}>
                    <Box sx={ACCORDION_HEADER_BOX_SX}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                            Benchmark matrix ({model.rowDefs.size} setups)
                        </Typography>
                        <Box sx={ACCORDION_CONTROLS_SX} onClick={(e) => e.stopPropagation()}>
                            {refOptions.length > 0 && (
                                <Select size="small" value={refMetric ?? ""}
                                    onChange={e => { setRefMetric(e.target.value); writeRefPref(e.target.value); }}
                                    sx={{ height: 32, fontSize: 12.5, minWidth: 170 }}>
                                    {refOptions.map(m => (
                                        <MenuItem key={m} value={m} sx={{ fontSize: 12.5 }}>{refLabel(m)}</MenuItem>
                                    ))}
                                </Select>
                            )}
                            {speedVersions.length === 1 && (
                                <Typography sx={{ fontSize: 12, color: "text.secondary", whiteSpace: "nowrap" }}>
                                    suite v{versionLabel(speedShown)}
                                </Typography>
                            )}
                            {speedVersions.length > 1 && (
                                <Select size="small" value={speedShown ?? VERSION_UNSET}
                                    onChange={e => setVersion(e.target.value === VERSION_UNSET ? null : String(e.target.value))}
                                    sx={{ height: 32, fontSize: 12, minWidth: 132 }}>
                                    {speedVersions.map((v, i) => (
                                        <MenuItem key={v ?? VERSION_UNSET} value={v ?? VERSION_UNSET} sx={{ fontSize: 12 }}>
                                            suite v{versionLabel(v)}{i === 0 ? " (latest)" : ""}
                                        </MenuItem>
                                    ))}
                                </Select>
                            )}
                            <IconButton size="small" onClick={openColPicker} title="Columns">
                                <SettingsIcon fontSize="small" />
                            </IconButton>
                            <ToggleButtonGroup size="small" exclusive value={agg}
                                onChange={(_, v) => v && setAgg(v)} sx={{ height: 32 }}>
                                <ToggleButton value="latest" sx={{ px: 1.5, fontSize: 12, textTransform: "none" }}>Latest</ToggleButton>
                                <ToggleButton value="median" sx={{ px: 1.5, fontSize: 12, textTransform: "none" }}>Median</ToggleButton>
                            </ToggleButtonGroup>
                            </Box>
                            </Box>
                            </AccordionSummary>
                            <AccordionDetails sx={{ p: 2, pt: 1 }}>
            {/* Filters live in a row ABOVE the matrix, not in the headers: the
                identity columns are too narrow for a funnel each, and model, quant,
                context, KV and slots are what anyone filters on (context so a window
                sweep, e.g. one model at 32K/64K/128K/256K, reads as one question). Same
                pick-from-the-column-values control the Lab tables use. Every one
                is MULTI-select and says so: a checkbox per option, the picks as
                chips in the box, and "any of" in the label - the plain
                comma-joined text read as a single choice. */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.25, flexWrap: "wrap" }}>
                {([["machine", "Machine"], ["regime", "Placement"], ["model", "Model"], ["quant", "Quant"], ["ctx", "Context"], ["kv", "KV"], ["slots", "Slots"], ["ram", "Layers in RAM"], ["ub", "Batch"], ["split", "Split"],
                   ["rprefill", "128K RAG Prefill"], ["rgen", "128K RAG Tok/s"]] as const).map(([field, label]) => {
                    const picked = filters[field] ?? [];
                    const title = `${label} · any of`;
                    // The two RAG filters pick a BAND, judged on the 128K rung (the deep review
                    // figure): a row stays when any machine's 128K figure falls in a picked band.
                    const bandOptions = field === "rprefill"
                        ? [["green", `green ≥${PREFILL_GREEN.toLocaleString()}`], ["amber", `amber ${PREFILL_AMBER.toLocaleString()}–${PREFILL_GREEN.toLocaleString()}`], ["red", `red <${PREFILL_AMBER.toLocaleString()}`]]
                        : field === "rgen"
                        ? [["green", `green ≥${RAG_GREEN}`], ["amber", `amber ${RAG_AMBER}–${RAG_GREEN}`], ["red", `red <${RAG_AMBER}`]]
                        : null;
                    const options: [string, string][] = bandOptions
                        ? bandOptions as [string, string][]
                        : valuesFor(field).map(v => [v, v] as [string, string]);
                    const labelOf = (v: string) => options.find(o => o[0] === v)?.[1] ?? v;
                    return (
                        <FormControl key={field} size="small" sx={{ minWidth: field === "kv" || field === "slots" || field === "ctx" ? 140 : field === "rprefill" || field === "rgen" ? 200 : 220, maxWidth: 420 }}>
                            <InputLabel sx={{ fontSize: 13 }}>{title}</InputLabel>
                            <Select multiple value={picked}
                                onChange={e => {
                                    const v = e.target.value;
                                    setFilters(f => ({ ...f, [field]: typeof v === "string" ? v.split(",") : v }));
                                }}
                                input={<OutlinedInput label={title} />}
                                renderValue={sel => (
                                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                                        {(sel as string[]).map(v => (
                                            <Chip key={v} label={labelOf(v)} size="small"
                                                sx={{ height: 20, fontSize: 12, "& .MuiChip-label": { px: 0.75 } }} />
                                        ))}
                                    </Box>
                                )}
                                sx={{ fontSize: 13, "& .MuiSelect-select": { py: picked.length ? 0.5 : undefined } }}
                                MenuProps={{ PaperProps: { sx: { maxHeight: 320 } } }}>
                                {options.map(([v, text]) => (
                                    <MenuItem key={v} value={v} dense sx={{ fontSize: 13, py: 0.25 }}>
                                        <Checkbox size="small" checked={picked.includes(v)} sx={{ p: 0.5, mr: 0.5 }} />
                                        <ListItemText primary={text} primaryTypographyProps={{ fontSize: 13,
                                            color: bandOptions ? (v === "green" ? "success.main" : v === "amber" ? "warning.main" : "error.main") : undefined }} />
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    );
                })}
                {activeFilterCount(filters) > 0 && (
                    <Chip label="clear filters" size="small" variant="outlined" onClick={() => setFilters({})} />
                )}
            </Box>
            {/* The bands, one row per scale: prefill first (a prompt is read before
                the answer is typed), tok/s beneath. */}
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1, lineHeight: 1.7 }}>
                <Box component="span" sx={{ display: "inline-block", width: 52, fontWeight: 700 }}>prefill</Box>
                <Box component="span" sx={{ color: "success.main", fontWeight: 700 }}>green ≥{PREFILL_GREEN.toLocaleString()}</Box> a repo reads in half a minute ·{" "}
                <Box component="span" sx={{ color: "warning.main", fontWeight: 700 }}>amber {PREFILL_AMBER.toLocaleString()}–{PREFILL_GREEN.toLocaleString()}</Box> about a minute ·{" "}
                <Box component="span" sx={{ color: "error.main", fontWeight: 700 }}>red &lt;{PREFILL_AMBER.toLocaleString()}</Box> minutes
                <br />
                <Box component="span" sx={{ display: "inline-block", width: 52, fontWeight: 700 }}>tok/s</Box>
                <Box component="span" sx={{ color: "success.main", fontWeight: 700 }}>green ≥{RAG_GREEN}</Box> feels instant ·{" "}
                <Box component="span" sx={{ color: "warning.main", fontWeight: 700 }}>amber {RAG_AMBER}–{RAG_GREEN}</Box> usable ·{" "}
                <Box component="span" sx={{ color: "error.main", fontWeight: 700 }}>red &lt;{RAG_AMBER}</Box> you&#39;ll wait
                {model.ctxKs.length === 0 && " — no measurements yet; connect a suite above and this page fills itself"}
            </Typography>

            {/* SENTIMENT: each shown machine's standing verdict, above
                the matrix - what the box is good for and what an upgrade would buy. Written
                on the Lab machine (lab_update_machine sentiment), one card per machine. */}
            <Dialog open={!!sentEdit} onClose={() => !sentSaving && setSentEdit(null)} maxWidth="sm" fullWidth>
                <DialogTitle>{sentEdit?.mach} · sentiment</DialogTitle>
                <DialogContent sx={{ pt: "8px !important" }}>
                    <TextField autoFocus multiline minRows={3} fullWidth size="small"
                        value={sentEdit?.text ?? ""}
                        onChange={e => setSentEdit(s => s ? { ...s, text: e.target.value } : s)}
                        helperText="The machine's standing verdict as an LLM box: what it is good for, what an upgrade would and would not buy. Empty clears it." />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setSentEdit(null)} disabled={sentSaving}>Cancel</Button>
                    <Button variant="contained" disabled={sentSaving} onClick={async () => {
                        if (!sentEdit) return;
                        const id = machineIds.get(machineRole(sentEdit.mach));
                        if (id == null) return;
                        setSentSaving(true);
                        try {
                            const res = await fetch(`/api/lab/machines/${id}/sentiment`, {
                                method: "PUT", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ sentiment: sentEdit.text })
                            });
                            if (!res.ok) throw new Error(await res.text());
                            setSentiments(prev => {
                                const next = new Map(prev);
                                if (sentEdit.text.trim()) next.set(sentEdit.mach, sentEdit.text.trim()); else next.delete(sentEdit.mach);
                                return next;
                            });
                            setSentEdit(null);
                        } catch (e) {
                            setError(e instanceof Error ? e.message : "Failed to save the sentiment");
                        } finally {
                            setSentSaving(false);
                        }
                    }}>Save</Button>
                </DialogActions>
            </Dialog>

            {(() => { sentimentPlaced.current = false; return null; })()}
            {model.ctxKs.map(ctxK => {
                // Rows for this section, split by placement, filtered on row
                // identity, then sorted section-wide by the anchor machine.
                // ⚠️ THREE REGIMES, not two. Where the experts were PLACED cannot
                // distinguish "they live in system RAM" from "they live on the SSD
                // and are paged in every token" - and those are an order of
                // magnitude apart: Flash-Next read 573 MB/s for 4 tok/s while
                // coder-next, resident, read nothing for 65. They shared a band.
                //
                // Paging is decided by the MEASURED disk rate, never by comparing
                // weights to memory: that would be arithmetic dressed as evidence,
                // the same mistake as the computed "won't fit" deleted earlier.
                // A row pages if ANY machine measured it paging - the honest
                // headline is the worst regime observed.
                const PAGING_MBS = 50;
                // ⛔ THE REGIME IS A PROPERTY OF THE CELL, NOT THE ROW: a row-level regime
                // reports paging on machines that never paged. The same setup can page on a 32 GB card and sit
                // in VRAM on three cards, so a row shows in EVERY band one of its machines
                // measured, with only that band's cells in it - the others point to where
                // their number lives.
                const cellRegime = (mach: string, r: RowDef): Regime | null => {
                    const m = model.meas.get(`${mach}|${r.key}`);
                    if (!m) return null;
                    if (m.disk.length && median(m.disk) >= PAGING_MBS) return "ssd";
                    // ⚠️ Only for setups that place NOTHING in RAM on purpose: the Windows
                    // counter also counts the pinned host buffers a chosen offload uses
                    // (12 expert layers in RAM read 9.6 GB "shared" at 26.7 GB dedicated and
                    // ran at 97 tok/s). Paging is shared memory on a FULL card.
                    if (!r.spilled && m.shared.length && median(m.shared) >= PAGING_SHARED_GB) return "paged";
                    return r.spilled ? "ram" : "vram";
                };
                // The bands render in this order, so a pointer knows which way to point
                // ("all in VRAM" sits above, so its arrow points up).
                const REGIME_ORDER: Regime[] = ["vram", "ram", "ssd", "paged"];
                const REGIME_LABEL: Record<Regime, string> = {
                    vram: "all in VRAM", ram: "experts → RAM", ssd: "paged from SSD", paged: "paged to system RAM"
                };
                const { rprefill: pickPre, rgen: pickGen, machine: _pickMach, regime: _pickRegime, ...colFilters } = filters;
                const bandOf = (v: number | null, green: number, amber: number) =>
                    v == null ? null : v >= green ? "green" : v >= amber ? "amber" : "red";
                const bandsActive = !!(pickPre?.length || pickGen?.length);
                // One machine's cell against the band filters. A row stays when ANY
                // machine passes; the machines that do not are struck through in red.
                const machinePasses = (mach: string, r: RowDef) => {
                    const m = model.meas.get(`${mach}|${r.key}`);
                    if (!m) return false;
                    const okPre = !pickPre?.length || pickPre.includes(bandOf(m.rung[RUNGS.deep]?.pp ?? null, PREFILL_GREEN, PREFILL_AMBER) ?? "");
                    const okGen = !pickGen?.length || pickGen.includes(bandOf(m.rung[RUNGS.deep]?.gen ?? null, RAG_GREEN, RAG_AMBER) ?? "");
                    return okPre && okGen;
                };
                const passesBands = (r: RowDef) =>
                    !bandsActive || shownMachines.some(mach => machinePasses(mach, r));
                const rowsFor = (regime: Regime) => {
                    if (!regimeShown(regime)) return [];
                    const rows = [...model.rowDefs.values()]
                        .filter(r => r.ctxK === ctxK && (shownMachines.some(mach => cellRegime(mach, r) === regime)
                            // a verdict-only row (measured nowhere) sits in the band its own config implies
                            || (!shownMachines.some(mach => model.meas.has(`${mach}|${r.key}`)) && shownMachines.some(mach => model.wontFit.has(`${mach}|${r.key}`)) && (r.spilled ? "ram" : "vram") === regime)))
                        .filter(r => passesFilters(r, colFilters, rowText) && passesBands(r));
                    const anchor = sort.machine && shownMachines.includes(sort.machine)
                        ? sort.machine : shownMachines[0];
                    return rows.sort((a, b) => {
                        if (IDENTITY_SORTS.includes(sort.col)) {
                            const d = identityCmp(a, b) || a.key.localeCompare(b.key);
                            return sort.desc ? -d : d;
                        }
                        const d = sortVal(b, anchor) - sortVal(a, anchor);
                        return (sort.desc ? d : -d) || a.label.localeCompare(b.label);
                    });
                };
                const vramRows = rowsFor("vram"), spillRows = rowsFor("ram"), pagedRows = rowsFor("ssd"), sharedRows = rowsFor("paged");
                if (vramRows.length + spillRows.length + pagedRows.length + sharedRows.length === 0) return null;
                // The sentiment row rides the first section that actually renders - filters can
                // hide the smallest windows, and then it vanished with them.
                const withSentiment = !sentimentPlaced.current;
                sentimentPlaced.current = true;
                // The caption states the measured spill, so the band explains itself.
                const sharedCap = (() => {
                    const gbs: number[] = [];
                    for (const r of sharedRows) for (const mach of shownMachines) {
                        const m = model.meas.get(`${mach}|${r.key}`);
                        if (m && m.shared.length && cellRegime(mach, r) === "paged") gbs.push(median(m.shared));
                    }
                    if (!gbs.length) return "paged to system RAM (Windows)";
                    const lo = Math.min(...gbs), hi = Math.max(...gbs);
                    return `paged to system RAM (Windows) · ${lo === hi ? lo.toFixed(1) : `${lo.toFixed(1)}–${hi.toFixed(1)}`} GB of the process outside VRAM`;
                })();
                // The caption states the measured read rate, so the band explains
                // itself rather than asserting a cause.
                const pagedCap = (() => {
                    const rates: number[] = [];
                    for (const r of pagedRows) for (const mach of shownMachines) {
                        const m = model.meas.get(`${mach}|${r.key}`);
                        if (m && m.disk.length && cellRegime(mach, r) === "ssd") rates.push(median(m.disk));
                    }
                    if (!rates.length) return "paged from SSD";
                    const lo = Math.min(...rates), hi = Math.max(...rates);
                    return `paged from SSD · ${lo === hi ? `${lo.toFixed(0)}` : `${lo.toFixed(0)}–${hi.toFixed(0)}`} MB/s read while generating`;
                })();
                // The spill caption carries the fraction and the measured RAM share.
                // ⚠️ The caption may only state a figure the WHOLE band shares.
                // It used to return on the first spill row that had a
                // measurement, so a band holding --n-cpu-moe 24 and 99 was
                // labelled "24 LAYERS" for both - the header asserting something
                // false about half the rows under it.
                // ⛔ THE BAND NAMES THE REGIME. Nothing per-row goes here.
                // It used to carry a layer count, taken from whichever row was
                // found first - so a band holding --n-cpu-moe 24 and 29 was
                // labelled "24 LAYERS" for both. Showing it only when the rows
                // agreed fixed the lie but not the inconsistency: the same band
                // then said different things depending on how many rows it
                // happened to hold. The count is a fact about
                // a SETUP, so it rides the setup's own row.
                const spillCap = "MoE experts → system RAM";
                const bandRow = (label: string, spill: boolean) => (
                    <Box component="tr" key={label}>
                        <Box component="td" colSpan={totalCols} sx={{
                            fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase",
                            p: "8px 16px",
                            bgcolor: spill ? WARN_BG : HOVER,
                            color: spill ? WARN : "text.secondary",
                            borderTop: "1px solid", borderBottom: "1px solid",
                            borderColor: spill ? WARN_LINE : LINE
                        }}>{label}</Box>
                    </Box>
                );

                const idCellSx = (align: string) => ({
                    fontSize: 12, color: TEXT, whiteSpace: "nowrap" as const,
                    textAlign: align as "left" | "center" | "right",
                    borderTop: `1px solid ${LINE}`, borderRight: `1px solid ${LINE}`, verticalAlign: "middle" as const,
                    p: "4px 8px"
                });
                const dataRow = (row: RowDef, band: Regime) => {
                    // The TUNING that earned each machine's number (split, ub), on the
                    // row's runtime line where the split used to live before the fold
                    // nulled it. Per machine, prefixed when more than one machine is on
                    // the page, and only when the row itself carries none (an A/B row
                    // still names its own). Not under the number - that column is a
                    // number.
                    const machTuning = (() => {
                        if (row.tensorSplit || row.ubatch) return [] as string[];
                        const per = shownMachines.flatMap(mach => {
                            const t = model.meas.get(`${mach}|${row.key}`)?.tuning;
                            return t ? [{ mach, t }] : [];
                        });
                        // One tuning across the row reads plain; only a real
                        // per-machine difference earns the machine prefix.
                        const distinct = new Set(per.map(x => x.t));
                        return distinct.size <= 1 ? [...distinct] : per.map(x => `${x.mach} ${x.t}`);
                    })();
                    return (
                    <Box component="tr" key={`${band}|${row.key}`} sx={{ "&:hover > td": { bgcolor: HOVER } }}>
                        <Box component="td" sx={{ p: "4px 8px 4px 10px", borderTop: `1px solid ${LINE}`, borderRight: `1px solid ${LINE}`, verticalAlign: "middle" }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                                <Box>
                                    <Typography sx={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", lineHeight: 1.25 }}>
                                        {displayModel(row.label)}
                                    </Typography>
                                    {/* The RUNTIME that produced the number. Two builds can
                                        serve the same model at different speeds, and a
                                        different runtime entirely (NVFP4 needs one) is not
                                        comparable at all - so it belongs on the row, not
                                        buried in a tooltip. */}
                                    {(row.engine || row.offload || row.tensorSplit || row.ubatch || machTuning.length > 0) && (
                                        <Tooltip arrow placement="bottom-start"
                                            title={`engine build: ${row.engine ?? "unknown"}`
                                                + (row.offload ? ` · --n-cpu-moe ${row.offload.layers ?? "all"}` : "")
                                                + (row.tensorSplit ? ` · --tensor-split ${row.tensorSplit}` : "")
                                                + (row.ubatch ? ` · -ub ${row.ubatch}` : "")
                                                + (row.ot ? ` · -ot ${row.ot}` : "")
                                                + (machTuning.length ? ` · ${machTuning.join(" · ")}` : "")}>
                                            <Typography sx={{ fontSize: 10, color: "text.secondary", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", mt: "1px", cursor: "help", lineHeight: 1.2 }}>
                                                {engineLabel(row.engine, row.quant)}
                                                {row.offload && (
                                                    <Box component="span">
                                                        {row.engine ? " · " : ""}
                                                        {row.offload.layers ?? "all"}
                                                        {row.offload.total ? `/${row.offload.total}` : ""}→RAM
                                                    </Box>
                                                )}
                                                {/* The tuning that earned the number - only when the run recorded it. */}
                                                {(row.tensorSplit || row.ubatch) && (
                                                    <Box component="span">
                                                        {(row.engine || row.offload) ? " · " : ""}
                                                        {row.tensorSplit ? `split ${row.tensorSplit}` : ""}
                                                        {row.tensorSplit && row.ubatch ? " · " : ""}
                                                        {row.ubatch ? `ub ${row.ubatch}` : ""}
                                                    </Box>
                                                )}
                                                {machTuning.length > 0 && (
                                                    <Box component="span">
                                                        {(row.engine || row.offload) ? " · " : ""}
                                                        {machTuning.join(" · ")}
                                                    </Box>
                                                )}
                                            </Typography>
                                        </Tooltip>
                                    )}
                                </Box>
                                {/* Unlinked: these measurements name a model that is not in
                                    THIS catalog. The row is perfectly valid - benchmarking a
                                    model you have not catalogued is allowed by design - so it
                                    is flagged, never hidden, and the fix is one MCP call. */}
                                {row.modelId == null && (
                                    <Tooltip arrow placement="top" title={
                                        <Box sx={{ p: 0.5 }}>
                                            <Typography sx={{ fontSize: 12, fontWeight: 700, mb: 0.5 }}>
                                                Not in the catalog
                                            </Typography>
                                            <Typography sx={{ fontSize: 12, mb: 0.75 }}>
                                                These numbers are valid and kept - they just are not
                                                attached to a model on your shelf, so catalog facts
                                                (size, traits, reference scores) cannot be shown.
                                            </Typography>
                                            <Typography sx={{ fontSize: 12, fontFamily: "monospace" }}>
                                                models_link_benchmarks
                                            </Typography>
                                            <Typography sx={{ fontSize: 11, opacity: 0.85 }}>
                                                Ask your agent to run it - with no arguments it lists
                                                every unlinked name; add the model with
                                                models_add_model first if you do not have it yet.
                                            </Typography>
                                        </Box>
                                    }>
                                        <Typography component="span" sx={{ fontSize: 13, cursor: "help", lineHeight: 1 }}>
                                            &#9888;&#65039;
                                        </Typography>
                                    </Tooltip>
                                )}
                            </Box>
                        </Box>
                        {ID_COLS.map(c => {
                            if (c.field === "score") {
                                const ref = row.modelId != null ? refScores.get(row.modelId) : undefined;
                                return (
                                    <Box component="td" key={c.field} sx={{ ...idCellSx("right"), pr: "10px", color: ref ? TEXT : FAINT }}>
                                        {ref ? (
                                            <Tooltip arrow placement="top" title={
                                                `${refLabel(ref.metric)}: ${ref.value} — published for the full-precision checkpoint, not this quant.`
                                                + (ref.source ? ` Source: ${ref.source}` : "")}>
                                                <Box component="span" sx={{ cursor: "help", borderBottom: `1px dotted ${FAINT}` }}>
                                                    {ref.value.toFixed(1)}
                                                </Box>
                                            </Tooltip>
                                        ) : "—"}
                                    </Box>
                                );
                            }
                            const disp = c.field === "gb"
                                ? (row.sizeGb != null ? row.sizeGb.toFixed(1) : "—")
                                : (rowText(row, c.field) || "—");
                            // Downgrades read red: 1 slot queues; a measured
                            // lack of vision is a capability loss.
                            const bad = (c.field === "slots" && row.slots === 1)
                                || ((c.field === "vision" || c.field === "mtp") && disp === "✕");
                            const why = (c.field === "vision" || c.field === "mtp")
                                ? (disp === "✓" ? `${c.label} was on in this run`
                                    : disp === "✕" ? `the weights support ${c.label.toLowerCase()}, but this setup ran without it`
                                    : `these weights do not carry ${c.label.toLowerCase()}`)
                                : null;
                            const cell = (
                                <Box component="td" key={c.field} sx={{
                                    ...idCellSx(c.align),
                                    pr: c.align === "right" ? "10px" : 0,
                                    color: bad ? "error.main" : disp === "—" ? MUTED : TEXT,
                                    fontWeight: bad ? 600 : 400
                                }}>{why ? <Tooltip title={why} arrow placement="top"><Box component="span" sx={{ cursor: "help" }}>{disp}</Box></Tooltip> : disp}</Box>
                            );
                            return cell;
                        })}
                        {shownMachines.map(mach => {
                            const m = model.meas.get(`${mach}|${row.key}`);
                            const here = cellRegime(mach, row);
                            if (m && here && here !== band) {
                                // Measured on this machine, but in a different regime: its
                                // number lives in that band, and this cell says so rather
                                // than repeating it or reading as untested.
                                return (
                                    <Fragment key={mach}>
                                        <Box component="td" colSpan={COLS.length} sx={{ textAlign: "center", fontSize: 10.5, color: "text.secondary", p: "4px 8px", borderTop: `1px solid ${LINE}`, borderLeft: `2px solid ${RULE_HEAVY}`, borderRight: `1px solid ${LINE}`, verticalAlign: "middle", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                                            {REGIME_ORDER.indexOf(here) < REGIME_ORDER.indexOf(band) ? "↑" : "↓"} in {REGIME_LABEL[here]}
                                        </Box>
                                        <Box component="td" sx={{ p: 0, borderTop: `1px solid ${LINE}` }} />
                                    </Fragment>
                                );
                            }
                            if (!m) {
                                const a = absence(mach, row);
                                // The verdict chip alone sits in the cell; the
                                // full reason (which can be a whole OOM story)
                                // rides the tooltip so the table never spills.
                                return (
                                    <Fragment key={mach}>
                                        <Box component="td" colSpan={COLS.length} sx={{ textAlign: "center", fontSize: 11, color: a.imp ? WARN : "text.secondary", p: "4px 8px", borderTop: `1px solid ${LINE}`, borderLeft: `2px solid ${RULE_HEAVY}`, borderRight: `1px solid ${LINE}`, verticalAlign: "middle", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                                            {a.imp ? (
                                                <Tooltip title={a.why} arrow placement="top">
                                                    <Box component="span" sx={{ cursor: "help", whiteSpace: "nowrap" }}>
                                                        <Box component="span" sx={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", border: "1px solid rgba(180,83,9,0.5)", borderRadius: "3px", px: 0.5, mr: 0.75 }}>won&#39;t fit</Box>
                                                        {shortWhy(a.why)}
                                                    </Box>
                                                </Tooltip>
                                            ) : "— untested"}
                                        </Box>
                                        <Box component="td" sx={{ p: 0, borderTop: `1px solid ${LINE}` }} />
                                    </Fragment>
                                );
                            }
                            const struck = bandsActive && !machinePasses(mach, row);
                            const val = (col: typeof COLS[number]["key"]): number | null => {
                                const rc = rungOfCol(col);
                                return rc ? (m.rung[rc.k]?.[rc.m] ?? null)
                                    : col === "each" ? m.each : col === "total" ? m.total
                                    : col === "ttft" ? (m.rung[RUNGS.short]?.ttft ?? null) : m.watts;
                            };
                            return (
                                <Fragment key={mach}>
                                    {COLS.map((c, i) => {
                                        const v = val(c.key);
                                        const rc = rungOfCol(c.key);
                                        // A rung with no numbers says WHY: N/A when the
                                        // prompt cannot fit the window (the suite's own rule: depth + tg128
                                        // + 512 of headroom), a FAILED chip when the rung was attempted and
                                        // died - the engine's cause rides the tooltip. The two columns of
                                        // the rung merge into one cell; a bare "–" is left for never run.
                                        const gap = (k: number): { na: boolean; failed: string | null; after?: number } | null => {
                                            const r = m.rung[k];
                                            if (r && (r.pp != null || r.gen != null)) return null;
                                            if (row.ctxK && k * 1000 + 640 > row.ctxK * 1024) return { na: true, failed: null };
                                            if (r?.failed) return { na: false, failed: r.failed };
                                            // After a crash the deeper rungs went to a dead server: not reached,
                                            // which is neither a result nor "never run".
                                            const died = Object.entries(m.rung).find(([d, x]) => Number(d) < k && x.failed);
                                            return died ? { na: false, failed: null, after: Number(died[0]) } : null;
                                        };
                                        const prev = i > 0 ? rungOfCol(COLS[i - 1].key) : null;
                                        if (rc?.m === "gen" && prev?.m === "pp" && prev.k === rc.k && gap(rc.k)) return null;
                                        const g = rc ? gap(rc.k) : null;
                                        if (g) {
                                            const next = COLS[i + 1] ? rungOfCol(COLS[i + 1].key) : null;
                                            const span = rc!.m === "pp" && next?.m === "gen" && next.k === rc!.k ? 2 : 1;
                                            return (
                                                <Box component="td" key={c.key} colSpan={span} sx={{
                                                    textAlign: "center", whiteSpace: "nowrap", p: "4px 6px",
                                                    fontSize: 11, color: "text.disabled",
                                                    borderTop: `1px solid ${LINE}`, borderRight: `1px solid ${LINE}`,
                                                    borderLeft: i === 0 ? `2px solid ${RULE_HEAVY}` : undefined,
                                                    verticalAlign: "middle", lineHeight: 1.3
                                                }}>
                                                    {g.na ? (
                                                        <Tooltip title={`a ${rc!.k}K prompt does not fit a ${row.ctxK}K window`} arrow placement="top">
                                                            <Box component="span" sx={{ cursor: "help" }}>N/A</Box>
                                                        </Tooltip>
                                                    ) : g.after != null ? (
                                                        <Tooltip title={`not reached - the ${g.after}K rung crashed the server first`} arrow placement="top">
                                                            <Box component="span" sx={{ cursor: "help", fontStyle: "italic" }}>not reached</Box>
                                                        </Tooltip>
                                                    ) : (
                                                        <Tooltip title={`tested and failed at ${rc!.k}K: ${g.failed}`} arrow placement="top">
                                                            <Box component="span" sx={{ cursor: "help", fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "error.main", border: "1px solid", borderColor: "error.main", borderRadius: "3px", px: 0.5 }}>failed</Box>
                                                        </Tooltip>
                                                    )}
                                                </Box>
                                            );
                                        }
                                        const banded = rc?.m === "gen" || c.key === "each";
                                        const isWatts = c.key === "watts";
                                        // Prefill is banded on its OWN scale (how long a big
                                        // prompt takes to read), never on the tok/s bands.
                                        const cellColor = isWatts ? MUTED
                                            : v == null ? "text.disabled"
                                            : rc?.m === "pp" ? prefillColor(v)
                                            : banded ? speedColor(v) : "text.primary";
                                        // The honesty marker: n and min-max ride the 4K tok/s
                                        // number, since that is what the toggle aggregates.
                                        // Prefill cells carry their rung's time to first token.
                                        const ttft = rc?.m === "pp" ? (m.rung[rc.k]?.ttft ?? null) : null;
                                        // llama-bench's figure for the same rung, when the suite ran it: the number
                                        // a llama.cpp discussion thread would post for this file and placement.
                                        const llb = rc ? (rc.m === "pp" ? m.rung[rc.k]?.lpp : m.rung[rc.k]?.ltg) ?? null : null;
                                        const llbText = llb != null ? `llama-bench ${rc!.m === "pp" ? "pp512" : "tg128"} ${fmt(llb)}${rc!.m === "gen" ? " (no draft head)" : ""}` : "";
                                        const honesty = [
                                            c.key === "gen4"
                                                ? `${agg === "median" ? "median" : "latest"} of n=${m.n}`
                                                  + (m.n > 1 ? ` · ${fmt(m.genMin)}–${fmt(m.genMax)}` : "")
                                                  + (m.tuning ? ` · ${m.tuning}` : "")
                                                  + (m.otherTunings > 0 ? ` · ${m.otherTunings} other tuning${m.otherTunings > 1 ? "s" : ""} in the ledger` : "")
                                                : ttft != null ? `first token in ${ttft < 10 ? ttft.toFixed(1) : Math.round(ttft)} s` : "",
                                            llbText,
                                        ].filter(Boolean).join(" · ") || null;
                                        return (
                                            <Box component="td" key={c.key} sx={{
                                                textAlign: "right", whiteSpace: "nowrap", overflow: "hidden",
                                                p: "4px 7px 4px 0",
                                                fontSize: isWatts ? 11 : 12.5, fontWeight: isWatts ? 500 : 700,
                                                color: cellColor,
                                                ...(struck ? { textDecoration: "line-through", textDecorationColor: "#d32f2f", textDecorationThickness: "2px", opacity: 0.75 } : {}),
                                                borderTop: `1px solid ${LINE}`,
                                                // Column rules on every cell, a heavier one where a
                                                // machine block starts.
                                                borderRight: `1px solid ${LINE}`,
                                                borderLeft: i === 0 ? `2px solid ${RULE_HEAVY}` : undefined,
                                                verticalAlign: "middle", lineHeight: 1.3
                                            }}>
                                                {honesty ? (
                                                    <Tooltip title={honesty} arrow placement="top">
                                                        <Box component="span" sx={{ cursor: "help", borderBottom: m.n > 1 ? `1px dotted ${FAINT}` : undefined }}>{c.key === "ttft" && v != null ? (v < 10 ? v.toFixed(2) : v.toFixed(1)) : fmt(v)}</Box>
                                                    </Tooltip>
                                                ) : isWatts ? (v != null ? `${fmt(v)} W` : "–")
                                                    : c.key === "each" ? (
                                                        v == null && m.total == null && Object.values(m.rung).some(x => x.failed) ? (
                                                            <Tooltip title="not reached - a rung of this run crashed the server before the four streams" arrow placement="top">
                                                                <Box component="span" sx={{ cursor: "help", fontStyle: "italic", fontWeight: 400, fontSize: 11, color: "text.disabled" }}>not reached</Box>
                                                            </Tooltip>
                                                        ) : m.streams === 1 ? (
                                                            // One stream is the 4K rung again, and its "total" is tg128 over a wall
                                                            // that includes the prefill - neither is a concurrency figure.
                                                            <Tooltip title="n/a - this setup has one slot, so the suite ran a single stream: no concurrency to measure (its each is the 4K rung again)" arrow placement="top">
                                                                <Box component="span" sx={{ cursor: "help", fontStyle: "italic", fontWeight: 400, fontSize: 11, color: "text.disabled" }}>n/a · 1 slot</Box>
                                                            </Tooltip>
                                                        ) : v != null || m.total != null ? (
                                                            <>
                                                                {fmt(v)}
                                                                <Box component="span" sx={{ color: "text.disabled", fontWeight: 500, mx: "3px" }}>/</Box>
                                                                <Box component="span" sx={{ color: "text.primary" }}>{fmt(m.total)}</Box>
                                                            </>
                                                        ) : "–"
                                                    ) : fmt(v)}
                                                {c.key === "each" && m.streams != null && m.streams > 1 && m.streams !== 4 && (
                                                    <Box sx={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.06em", color: "text.secondary", lineHeight: 1, mt: "2px" }}>×{m.streams} streams</Box>
                                                )}
                                                {c.key === "each" && row.slots === 1 && m.streams !== 1 && m.total != null && (
                                                    <Box sx={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "text.secondary", lineHeight: 1, mt: "2px" }}>queues</Box>
                                                )}
                                            </Box>
                                        );
                                    })}
                                    <Box component="td" sx={{ p: 0, borderTop: `1px solid ${LINE}` }} />
                                </Fragment>
                            );
                        })}
                    </Box>
                );
                };

                return (
                    <Box key={ctxK}>
                        <Typography sx={{ ...eyebrowSx, fontSize: 13, fontWeight: 800, mt: 3.5, mb: 1.5, pb: 0.5, borderBottom: "2px solid", borderColor: LINE }}>
                            {ctxK}K context
                        </Typography>
                        {/* ⚠ The table is wider than the viewport by design (a machine
                            adds five columns). It must scroll INSIDE this box - without
                            the clamp the Paper grows to the table's width and takes the
                            whole PAGE horizontal, which drags the nav off-screen too.
                            minWidth:0 is the load-bearing part: a flex/grid child
                            defaults to min-content and refuses to shrink below it, so
                            maxWidth:100% alone does nothing. */}
                        <Paper sx={{ overflow: "hidden", borderRadius: "6px", width: "100%", maxWidth: "100%", minWidth: 0 }}>
                            <Box sx={{ overflowX: "auto", maxWidth: "100%", minWidth: 0 }}>
                                {/* ⚠ No blanket cell-padding rule here. '& th, & td' is a
                    DESCENDANT selector and outranks each cell's own sx, so a
                    p:0 default here silently flattened every padding the cells
                    asked for - which is why the rows sat on their gridlines
                    however wide the columns got. Cells own
                    their padding; the ones that want none say so. */}
                {/* The floor is the ONE-MACHINE width (236 model + 580 identity + 384 per
                    machine). It used to be 1480, which forced a scrollbar on a
                    single-machine table that would otherwise have fit. Extra
                    machines widen it naturally and scroll inside the box above. */}
                {/* Columns never clip (: NVFP4-HIGHEST was cut off): the
                    widths below are floors, the table grows to its widest value and scrolls
                    inside its box - a scrollbar over a clipped number. */}
                <Box component="table" sx={{ borderCollapse: "collapse", width: "max-content", minWidth: TABLE_W, tableLayout: "auto", "& th, & td": { whiteSpace: "nowrap" } }}>
                                    <colgroup>
                                        <col style={{ width: MODEL_W }} />
                                        {ID_COLS.map(c => <col key={c.field} style={{ width: c.w }} />)}
                                        {shownMachines.map(mach => (
                                            <Fragment key={mach}>
                                                {COLS.map(c => <col key={c.key} style={{ width: c.w }} />)}
                                                <col style={{ width: GAP_W }} />
                                            </Fragment>
                                        ))}
                                    </colgroup>
                                    <Box component="thead">
                                        {/* SENTIMENT: each machine's standing verdict sits
                                            in the matrix itself, one cell spanning exactly that machine's column
                                            block, so it is as wide as the numbers under it and scrolls with them.
                                            Top section only. Stored on the Lab machine; the pencil edits it. */}
                                        {withSentiment && (
                                            <Box component="tr">
                                                <Box component="th" colSpan={1 + ID_COLS.length} />
                                                {shownMachines.map(mach => (
                                                    <Box component="th" key={mach} colSpan={COLS.length + 1} sx={{ p: "8px 8px 10px 0", verticalAlign: "top", textAlign: "left", fontWeight: 400 }}>
                                                        <Box sx={{ border: `1px solid ${LINE}`, borderLeft: "3px solid", borderLeftColor: sentiments.has(mach) ? "primary.main" : LINE, borderRadius: "6px", p: "8px 12px", whiteSpace: "normal" }}>
                                                            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
                                                                <Typography sx={{ ...eyebrowSx, fontSize: 10.5 }}>{mach} · sentiment</Typography>
                                                                {machineIds.has(mach) && (
                                                                    <Tooltip title="Edit sentiment" arrow>
                                                                        <IconButton size="small" sx={{ p: 0.25 }}
                                                                            onClick={() => setSentEdit({ mach, text: sentiments.get(machineRole(mach)) ?? "" })}>
                                                                            <EditIcon sx={{ fontSize: 15 }} />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                )}
                                                            </Box>
                                                            <Typography sx={{ fontSize: 12.5, lineHeight: 1.5, whiteSpace: "pre-line", color: sentiments.has(mach) ? "text.primary" : "text.disabled" }}>
                                                                {sentiments.get(machineRole(mach)) ?? "No sentiment yet - the pencil adds one."}
                                                            </Typography>
                                                        </Box>
                                                    </Box>
                                                ))}
                                            </Box>
                                        )}
                                        <Box component="tr">
                                            <Box component="th" colSpan={1 + ID_COLS.length} />
                                            {shownMachines.map(mach => (
                                                <Box component="th" key={mach} colSpan={COLS.length + 1} sx={{ textAlign: "left", p: "7px 8px 2px 10px", borderLeft: `2px solid ${RULE_HEAVY}`, verticalAlign: "top", overflow: "hidden" }}>
                                                    <Typography sx={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", lineHeight: 1.2 }}>{mach}</Typography>
                                                    {machineFacts.get(machineRole(mach))?.hw.length ? (
                                                        // The inventory's own words, compacted (no vendor prefix) and
                                                        // clipped to the block; the full line rides the tooltip.
                                                        <Tooltip title={machineFacts.get(machineRole(mach))!.hw.join(" · ")} arrow placement="top">
                                                            <Typography sx={{ fontSize: 10, color: "text.secondary", mt: "1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 400, cursor: "help" }}>
                                                                {machineFacts.get(machineRole(mach))!.hw.map(l => l.replace(/^(NVIDIA|AMD|Intel)\s+/i, "").replace(/^(GeForce\s+)?RTX\s+/i, "")).join(" · ")}
                                                            </Typography>
                                                        </Tooltip>
                                                    ) : null}
                                                </Box>
                                            ))}
                                        </Box>
                                        <Box component="tr">
                                            <Box component="th" colSpan={1 + ID_COLS.length} sx={{ bgcolor: HEAD_BG }} />
                                            {shownMachines.map(mach => (
                                                <Fragment key={mach}>
                                                    {BANDS.map((b, i) => (
                                                        <Box component="th" key={b.label} colSpan={b.span} sx={{
                                                            fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
                                                            color: "text.primary", textAlign: "center", p: "6px 6px 2px", bgcolor: HEAD_BG,
                                                            borderLeft: i === 0 ? `2px solid ${RULE_HEAVY}` : `1px solid ${LINE}`,
                                                            borderBottom: `1px solid ${RULE_HEAVY}`
                                                        }}>{b.label}</Box>
                                                    ))}
                                                    <Box component="th" />
                                                </Fragment>
                                            ))}
                                        </Box>
                                        <Box component="tr" sx={{ "& th": { borderBottom: `2px solid ${LINE}` } }}>
                                            <Box component="th" onClick={() => clickSort("label", null)} sx={{ verticalAlign: "bottom", textAlign: "left", fontSize: 10.5, fontWeight: sort.col === "label" ? 800 : 700, letterSpacing: "0.07em", textTransform: "uppercase", color: sort.col === "label" ? "text.primary" : "text.secondary", p: "5px 8px 4px 10px", bgcolor: HEAD_BG, borderRight: `1px solid ${LINE}`, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
                                                Model{sortGlyph("label", null)}
                                            </Box>
                                            {ID_COLS.map(c => (
                                                <Box component="th" key={c.field}
                                                    onClick={c.sort ? () => clickSort(c.sort!, null) : undefined}
                                                    sx={{
                                                        verticalAlign: "bottom", textAlign: c.align,
                                                        fontSize: 10.5, letterSpacing: "0.07em", textTransform: "uppercase",
                                                        fontWeight: c.sort && sort.col === c.sort ? 800 : 700,
                                                        color: c.sort && sort.col === c.sort ? "text.primary" : MUTED,
                                                        p: "5px 8px 4px", bgcolor: HEAD_BG, borderRight: `1px solid ${LINE}`,
                                                        whiteSpace: "nowrap", cursor: c.sort ? "pointer" : "default", userSelect: "none"
                                                    }}>
                                                    {c.label}{c.sort && sortGlyph(c.sort, null)}
                                                </Box>
                                            ))}
                                            {shownMachines.map(mach => (
                                                <Fragment key={mach}>
                                                    {COLS.map((c, i) => {
                                                        const active = sort.col === c.key && sort.machine === mach;
                                                        return (
                                                            <Box component="th" key={c.key} onClick={() => clickSort(c.key, mach)} sx={{
                                                                fontSize: 9.5, fontWeight: active ? 800 : 600, letterSpacing: "0.04em",
                                                                textTransform: "none", color: active ? "text.primary" : MUTED,
                                                                textAlign: "right", p: "5px 7px 4px 0", whiteSpace: "nowrap", lineHeight: 1.2,
                                                                cursor: "pointer", userSelect: "none", verticalAlign: "bottom", overflow: "hidden",
                                                                bgcolor: HEAD_BG, borderRight: `1px solid ${LINE}`,
                                                                borderLeft: i === 0 ? `2px solid ${RULE_HEAVY}` : undefined
                                                            }}>
                                                                {/* The band row above names the depth; this row is the measure. */}
                                                                {c.sub || c.label}{sortGlyph(c.key, mach)}
                                                            </Box>
                                                        );
                                                    })}
                                                    <Box component="th" />
                                                </Fragment>
                                            ))}
                                        </Box>
                                    </Box>
                                    <Box component="tbody">
                                        {vramRows.length > 0 && bandRow("all in VRAM", false)}
                                        {vramRows.map(r => dataRow(r, "vram"))}
                                        {spillRows.length > 0 && bandRow(spillCap, true)}
                                        {spillRows.map(r => dataRow(r, "ram"))}
                                        {pagedRows.length > 0 && bandRow(pagedCap, true)}
                                        {pagedRows.map(r => dataRow(r, "ssd"))}
                                        {sharedRows.length > 0 && bandRow(sharedCap, true)}
                                        {sharedRows.map(r => dataRow(r, "paged"))}
                                    </Box>
                                </Box>
                            </Box>
                        </Paper>
                    </Box>
                );
            })}

            {/* ---- How to read these numbers: collapsed by default - the
                 explanation is there when needed, not in the way when not. ---- */}
            {model.ctxKs.length > 0 && (
                <Paper sx={{ p: "12px 20px", mt: 3 }}>
                    <Typography onClick={() => setExplainerOpen(o => !o)}
                        sx={{ ...eyebrowSx, cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: 1 }}>
                        <Box component="span" sx={{ fontSize: 10 }}>{explainerOpen ? "▾" : "▸"}</Box>
                        How to read these numbers
                    </Typography>
                    <Collapse in={explainerOpen} timeout="auto" unmountOnExit>
                    <Box component="dl" sx={{ m: 0, mt: 1.5, display: "grid", gridTemplateColumns: "150px 1fr", gap: "7px 16px", fontSize: 13, "& dt": { fontWeight: 700, whiteSpace: "nowrap" }, "& dd": { m: 0, color: "text.secondary", lineHeight: 1.45 } }}>
                        <dt>rows</dt><dd>Each row is one <i>exact</i> serving setup — model, quant, KV cache precision, slots, MTP, vision. Two machines share a row only when they ran the identical config; the same model appears more than once when the boxes serve it differently.</dd>
                        <dt>tok/s</dt><dd>How fast an answer gets typed out for one person at that prompt depth. Higher is better — ≥{RAG_GREEN} feels instant, {RAG_AMBER}–{RAG_GREEN} is usable, below {RAG_AMBER} you&#39;ll notice the wait.</dd>
                        <dt>prefill</dt><dd>How fast the machine <i>reads</i> your input before it starts answering. A big document hits this first — thousands means a huge file loads in a blink; double digits means minutes. Banded on its own scale: ≥{PREFILL_GREEN.toLocaleString()} reads a whole repo in about half a minute, {PREFILL_AMBER.toLocaleString()}–{PREFILL_GREEN.toLocaleString()} takes about a minute, below {PREFILL_AMBER.toLocaleString()} is minutes of waiting before the first token.</dd>
                        <dt>4K … 256K</dt><dd>The prompt depth that earned the figure — one cold request of that many tokens (cut from a frozen docs corpus), the prefill of all of it, then 128 generated tokens at that depth. The same depths the published tables use, so a cell here reads against a cell out there. Every rung is a band of two columns; the gear above the matrix hides the ones you are not reading.</dd>
                        <dt>depth</dt><dd>Why the 128K figure is lower than 4K on the same setup. To write each new word the model re-reads a note it kept for every earlier token (that is what attention is), so 70K tokens in it re-reads 70K notes per word. More notes, slower words. The size of the prompt is the depth.</dd>
                        <dt>KV</dt><dd>The format those notes are stored in. <i>f16</i> is the form the GPU computes with; <i>q8_0</i> is compressed to half the space, which is what lets a 256K window fit a card, but every read has to unpack it first, and that unpacking is work that grows with depth. On this engine build the unpacking also sends attention down a slower kernel, so q8_0 costs ~10% at depth on a single card and ~30% on a three-card split. Choose it for fit, never for speed, and re-measure after an engine upgrade.</dd>
                        <dt>4K streams each</dt><dd>Several 4K-token prompts at once (four unless the cell says otherwise; a 1-slot setup reads n/a): four people (or four coding agents) ask at the same time — this is how fast <i>each one</i> sees their answer being typed.</dd>
                        <dt>4K streams total</dt><dd>All the answers added up: the machine&#39;s total output per second under that load. A total well <i>above</i> the single-person tok/s means the box truly works in parallel. A total <i>below</i> it means requests are queuing — each answer types fast when its turn comes, but everyone spends time standing in line. A 1-slot row&#39;s total wears a QUEUES tag for exactly this reason.</dd>
                        <dt>mtp / vision</dt><dd>Tri-state: ✓ on in this setup · <Box component="span" sx={{ color: "error.main" }}>✕</Box> the weights support it but this setup runs without it (a downgrade) · — the weights don&#39;t have it, so nothing is lost. Support comes from the catalog&#39;s traits.</dd>
                        <dt>watts</dt><dd>Average GPU power draw over the 32K request (4K when the window stops short) — what the speed costs at the wall.</dd>
                        <dt>score</dt><dd>A <i>cited</i> third-party coding eval — whichever benchmark the <b>Score column</b> picker names, and only that one: a model that doesn&#39;t publish it stays blank rather than borrowing a number from a different scale (SWE-bench Pro is a <i>harder</i> set than Verified, so mixing them inverts the ranking). It describes the full-precision checkpoint, not the quant a box serves; the source and scaffold ride the tooltip. Never compare it against the measured columns — it answers &#39;how smart&#39;, they answer &#39;how fast here&#39;.</dd>
                        <dt>all in VRAM</dt><dd>The whole model lives on the graphics card — full speed, no compromises.</dd>
                        <dt>experts → RAM</dt><dd>The model is too big for the card, so part of it (the expert layers) lives in ordinary RAM <i>on purpose</i>. It runs — that&#39;s the point — but every token pays a toll crossing between RAM and the card, which is why these rows are slower and sit in their own band. The engine streams those layers in batches, so the cost is proportional: 12 layers in RAM on a 5090 still ran at 97 tok/s. Never compare them against all-in-VRAM rows.</dd>
                        <dt>paged to system RAM</dt><dd>Windows only, and never on purpose: the card was full and the driver quietly moved part of the process into RAM. No error, no disk read, and a cliff rather than a slope — measured on a 5090, 0.65 GB spilled ran at full speed, 1.1 GB cost a third of the speed, 4.9 GB cost ninety percent. Decided by the run&#39;s measured shared memory, shown in the band caption. A setup can page on one box and sit in VRAM on another, so it appears in both bands with each machine&#39;s cell under its own.</dd>
                        <dt>won&#39;t fit / untested</dt><dd><i>Won&#39;t fit</i> means this machine physically cannot run that setup (the reason is stated). <i>Untested</i> means it probably could, but nobody has served or benchmarked it there yet.</dd>
                    </Box>
                    </Collapse>
                </Paper>
            )}
                </AccordionDetails>
            </Accordion>
            <ColumnPickerPopover
                allColumns={MATRIX_COLUMNS}
                orderedColumns={orderedMatrixCols}
                hiddenColumns={hiddenMatrixCols}
                anchorEl={colPickerAnchor}
                onClose={closeColPicker}
                onToggle={toggleMatrixCol}
                onMove={moveMatrixCol}
                onReset={resetMatrixCols}
            />
            </>)}

            {/* ---- Suite runs: master-detail, paginated. One line per bench
                 batch; a click unfolds the batch's measurements. This IS the
                 full data behind the page above - there is no separate dump.
                 Speed-tab only: these are the speed suite's batches. ---- */}
            {tab === "speed" && suiteRuns.length > 0 && (
                <Accordion expanded={runsExpanded} onChange={() => setRunsExpanded(!runsExpanded)}
                    TransitionProps={{ timeout: runsExpanded ? undefined : 0 }} sx={{ mt: 2 }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={ACCORDION_SUMMARY_SX}>
                        <Box sx={ACCORDION_HEADER_BOX_SX}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                Suite runs ({suiteRuns.length})
                            </Typography>
                        </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ p: 0 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ width: 30 }} />
                                <TableCell sx={{ fontWeight: 700 }}>When</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Machine</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Model</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Scenarios</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Engine</TableCell>
                                <TableCell sx={{ fontWeight: 700 }} align="right">Measurements</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {suiteRuns.slice(runsPage * runsPerPage, (runsPage + 1) * runsPerPage).map(r => (
                                <Fragment key={r.key}>
                                <TableRow hover sx={{ cursor: "pointer" }}
                                    onClick={() => setExpandedRun(expandedRun === r.key ? null : r.key)}>
                                    <TableCell sx={{ color: "text.secondary" }}>{expandedRun === r.key ? "▾" : "▸"}</TableCell>
                                    <TableCell sx={{ whiteSpace: "nowrap" }}>{utcDate(r.at).toLocaleString()}</TableCell>
                                    <TableCell>{r.mach}</TableCell>
                                    <TableCell>{r.model}</TableCell>
                                    <TableCell sx={{ color: "text.secondary" }}>{[...r.scen].sort().join(" · ") || "—"}</TableCell>
                                    <TableCell sx={{ color: "text.secondary", whiteSpace: "nowrap" }}>{r.engine ?? "—"}</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 600 }}>{r.rows.length}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell colSpan={7} sx={{ py: 0, border: 0 }}>
                                        <Collapse in={expandedRun === r.key} timeout="auto" unmountOnExit>
                                            <Box sx={{ px: 2, py: 1.5, bgcolor: "action.hover", borderRadius: 1, mb: 1 }}>
                                                {r.configJson && (
                                                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                                                        {(() => { try {
                                                            return Object.entries(JSON.parse(r.configJson!) as Record<string, unknown>)
                                                                .filter(([k]) => k !== "llama_swap_name")
                                                                .map(([k, v]) => `${k}=${v}`).join("  ");
                                                        } catch { return r.configJson; } })()}
                                                    </Typography>
                                                )}
                                                <Table size="small">
                                                    <TableHead>
                                                        <TableRow>
                                                            <TableCell sx={{ fontWeight: 700 }}>Metric</TableCell>
                                                            <TableCell sx={{ fontWeight: 700 }}>Scenario</TableCell>
                                                            <TableCell sx={{ fontWeight: 700 }} align="right">Value</TableCell>
                                                            <TableCell sx={{ fontWeight: 700 }}>Notes</TableCell>
                                                        </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                        {r.rows.map(b => (
                                                            <TableRow key={b.id}>
                                                                <TableCell>{b.metric}</TableCell>
                                                                <TableCell>{scenarioOf(b)}</TableCell>
                                                                <TableCell align="right" sx={{ fontWeight: 600 }}>
                                                                    {b.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                                </TableCell>
                                                                <TableCell sx={{ color: "text.secondary" }}>{b.notes ?? ""}</TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </Box>
                                        </Collapse>
                                    </TableCell>
                                </TableRow>
                                </Fragment>
                            ))}
                        </TableBody>
                    </Table>
                    <TablePagination component="div" count={suiteRuns.length}
                        page={runsPage} onPageChange={(_, p) => setRunsPage(p)}
                        rowsPerPage={runsPerPage}
                        onRowsPerPageChange={e => { setRunsPerPage(Number(e.target.value)); setRunsPage(0); }}
                        rowsPerPageOptions={[10, 25, 50]} />
                    </AccordionDetails>
                </Accordion>
            )}

            {activeSuite !== null && (
                <Accordion expanded={matrixExpanded} onChange={() => setMatrixExpanded(!matrixExpanded)}
                    TransitionProps={{ timeout: matrixExpanded ? undefined : 0 }} sx={{ mt: 2 }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={ACCORDION_SUMMARY_SX}>
                        <Box sx={ACCORDION_HEADER_BOX_SX}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                {suiteLabel(activeSuite)} ({intel.rows.length} model{intel.rows.length === 1 ? "" : "s"})
                            </Typography>
                            {/* Same toggle, same meaning, as the speed matrix - the two
                                tabs must never mean different things by the same word. */}
                            <Box sx={ACCORDION_CONTROLS_SX} onClick={e => e.stopPropagation()}>
                                {/* ⛔ Version first: it decides WHICH measurement is on
                                    screen, and the aggregate only decides how the runs
                                    within it are summarised. */}
                                {/* ⛔ ALWAYS SAY WHICH VERSION IS ON SCREEN. A picker that
                                    hides itself when there is one version leaves the reader
                                    unable to tell what they are looking at - and these
                                    numbers are only comparable within a version, so it is
                                    the one label they cannot do without. */}
                                {intel.versions.length === 1 && (
                                    <Typography sx={{ fontSize: 12, color: "text.secondary", whiteSpace: "nowrap" }}>
                                        suite v{versionLabel(intel.shown)}
                                    </Typography>
                                )}
                                {intel.versions.length > 1 && (
                                    <Select size="small" value={intel.shown ?? VERSION_UNSET}
                                        onChange={e => setVersion(e.target.value === VERSION_UNSET ? null : String(e.target.value))}
                                        sx={{ height: 32, fontSize: 12, minWidth: 132 }}>
                                        {intel.versions.map((v, i) => (
                                            <MenuItem key={v ?? VERSION_UNSET} value={v ?? VERSION_UNSET} sx={{ fontSize: 12 }}>
                                                suite v{versionLabel(v)}{i === 0 ? " (latest)" : ""}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                )}
                                <ToggleButtonGroup size="small" exclusive value={agg}
                                    onChange={(_, v) => v && setAgg(v)} sx={{ height: 32 }}>
                                    <ToggleButton value="latest" sx={{ px: 1.5, fontSize: 12, textTransform: "none" }}>Latest</ToggleButton>
                                    <ToggleButton value="median" sx={{ px: 1.5, fontSize: 12, textTransform: "none" }}>Median</ToggleButton>
                                </ToggleButtonGroup>
                            </Box>
                        </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ p: 0 }}>
                        <Box sx={{ px: 2.5, pb: 1.5 }}>
                            <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>
                                Checked <strong>mechanically</strong> — no model grades another.
                                {intel.unit === "%" && <>
                                    <Box component="span" sx={{ color: "success.main", fontWeight: 700 }}> green ≥90</Box>
                                    <Box component="span" sx={{ color: "warning.main", fontWeight: 700 }}> · amber 70–90</Box>
                                    <Box component="span" sx={{ color: "error.main", fontWeight: 700 }}> · red &lt;70</Box>
                                    {" "}— 80% still fails one case in five.
                                </>}
                                {" "}Showing <strong>{agg === "median" ? "the median across runs" : "the latest run"}</strong>;
                                expand a row for the individual runs.
                                {intel.display === "matrix"
                                    ? " This suite declares MACHINE an axis, so boxes are column groups."
                                    : " This suite scores the weights, so the machine is provenance only — it rides the row."}
                            </Typography>
                        </Box>

                        {intel.rows.length === 0 ? (
                            <Box sx={{ px: 2.5, pb: 2.5 }}>
                                <Typography variant="body2" color="text.secondary">
                                    Nothing posted for this suite yet.
                                </Typography>
                            </Box>
                        ) : (
                            <Box sx={{ overflowX: "auto" }}>
                            <Table size="small">
                                <TableHead>
                                    {intel.display === "matrix" && (
                                        <TableRow>
                                            <TableCell />
                                            <TableCell />
                                            {intel.machines.map(m => (
                                                <TableCell key={m} align="center" colSpan={intel.tiers.length + 1}
                                                    sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", borderLeft: 1, borderColor: "divider" }}>
                                                    {(m || "CLOUD API").toUpperCase()}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    )}
                                    <TableRow>
                                        <TableCell sx={{ width: 28 }} />
                                        {sortHead("model", "MODEL", "left")}
                                        {intel.display === "matrix"
                                            ? intel.machines.flatMap(m => [
                                                <TableCell key={`${m}-o`} align="right"
                                                    sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", borderLeft: 1, borderColor: "divider" }}>OVERALL</TableCell>,
                                                ...intel.tiers.map(t => (
                                                    <TableCell key={`${m}-${t}`} align="right"
                                                        sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                                                        {tierLabel(t).toUpperCase()}
                                                    </TableCell>
                                                )),
                                            ])
                                            : [
                                                sortHead("overall", "OVERALL"),
                                                ...intel.tiers.map(t => sortHead(t, tierLabel(t).toUpperCase())),
                                            ]}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {intel.rows.map(r => {
                                        const span = 2 + (intel.display === "matrix"
                                            ? intel.machines.length * (intel.tiers.length + 1)
                                            : intel.tiers.length + 1);
                                        return (
                                        <Fragment key={r.key}>
                                        <TableRow hover sx={{ cursor: "pointer" }}
                                            onClick={() => setIntelOpen(intelOpen === r.key ? null : r.key)}>
                                            <TableCell sx={{ color: "text.secondary" }}>{intelOpen === r.key ? "▾" : "▸"}</TableCell>
                                            <TableCell>
                                                <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{r.modelName}</Typography>
                                                {/* Setup always; WHERE it ran only when the machine is not an axis. */}
                                                <Typography sx={{ fontSize: 10.5, color: "text.disabled" }}>
                                                    {[r.quant, r.ctxK ? `${r.ctxK}K` : null,
                                                      intel.display === "matrix" ? null : (r.machine ?? "cloud API"),
                                                      `${r.runs.length} run${r.runs.length === 1 ? "" : "s"}`]
                                                        .filter(Boolean).join(" · ")}
                                                </Typography>
                                            </TableCell>
                                            {intel.display === "matrix"
                                                ? intel.machines.flatMap(m => {
                                                    const cs = r.byMachine.get(m);
                                                    return [
                                                        <TableCell key={`${m}-o`} align="right" sx={{ borderLeft: 1, borderColor: "divider" }}>
                                                            {cs ? overallCell(r.overallBy.get(m) ?? null, cs.size, cs.size < intel.tiers.length)
                                                                : <Box component="span" sx={{ color: "text.disabled" }}>—</Box>}
                                                        </TableCell>,
                                                        ...intel.tiers.map(t => (
                                                            <TableCell key={`${m}-${t}`} align="right">{scoreCell(cs?.get(t))}</TableCell>
                                                        )),
                                                    ];
                                                })
                                                : [
                                                    <TableCell key="o" align="right">{overallCell(r.overall, r.ranTiers, r.partial)}</TableCell>,
                                                    ...intel.tiers.map(t => (
                                                        <TableCell key={t} align="right">{scoreCell(r.cells.get(t))}</TableCell>
                                                    )),
                                                ]}
                                        </TableRow>
                                        {/* ---- The runs behind the number, newest first. Every
                                             cell above is computed from these, so this is where
                                             a figure gets checked - and where a run that should
                                             never have been posted gets removed. ---- */}
                                        <TableRow>
                                            <TableCell colSpan={span} sx={{ p: 0, border: 0 }}>
                                                <Collapse in={intelOpen === r.key} timeout="auto" unmountOnExit>
                                                    <Box sx={{ px: 3, py: 1.5, bgcolor: "action.hover" }}>
                                                        <Table size="small">
                                                            <TableHead>
                                                                <TableRow>
                                                                    <TableCell sx={{ fontSize: 10.5, fontWeight: 700 }}>RUN</TableCell>
                                                                    <TableCell sx={{ fontSize: 10.5, fontWeight: 700 }}>WHERE</TableCell>
                                                                    {intel.tiers.map(t => (
                                                                        <TableCell key={t} align="right" sx={{ fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap" }}>
                                                                            {tierLabel(t).toUpperCase()}
                                                                        </TableCell>
                                                                    ))}
                                                                    <TableCell align="right" sx={{ fontSize: 10.5, fontWeight: 700 }}>DELETE</TableCell>
                                                                </TableRow>
                                                            </TableHead>
                                                            <TableBody>
                                                                {r.runs.map((run, n) => {
                                                                    const rk = `${r.key}|${run.at}|${run.mach}`;
                                                                    return (
                                                                        <Fragment key={rk}>
                                                                        <TableRow>
                                                                            <TableCell sx={{ fontSize: 12, whiteSpace: "nowrap" }}>
                                                                                {utcDate(run.at).toLocaleString()}
                                                                                {n === 0 && <Box component="span" sx={{ ml: 1, fontSize: 10, fontWeight: 700, color: "text.secondary" }}>LATEST</Box>}
                                                                            </TableCell>
                                                                            <TableCell sx={{ fontSize: 12, color: "text.secondary" }}>{run.mach || "cloud API"}</TableCell>
                                                                            {intel.tiers.map(t => {
                                                                                const v = run.cells.get(t);
                                                                                return (
                                                                                    <TableCell key={t} align="right" sx={{ fontSize: 12 }}>
                                                                                        {v == null
                                                                                            ? <Box component="span" sx={{ color: "text.disabled" }}>—</Box>
                                                                                            : <Box component="span" sx={{ fontWeight: 600, color: intel.unit === "%" ? evalColor(v) : "text.primary" }}>
                                                                                                  {v.toFixed(1)}{intel.unit === "%" ? "%" : ` ${intel.unit}`}
                                                                                              </Box>}
                                                                                    </TableCell>
                                                                                );
                                                                            })}
                                                                            <TableCell align="right">
                                                                                {/* Two-step: measured data, and there is no undo. */}
                                                                                {armedDelete === rk ? (
                                                                                    <Box component="span" sx={{ display: "inline-flex", gap: 1 }}>
                                                                                        <Box component="span" onClick={() => deleteRun(run.ids)}
                                                                                            sx={{ fontSize: 11.5, fontWeight: 700, color: "error.main", cursor: "pointer" }}>
                                                                                            Delete {run.ids.length} row{run.ids.length === 1 ? "" : "s"}
                                                                                        </Box>
                                                                                        <Box component="span" onClick={() => setArmedDelete(null)}
                                                                                            sx={{ fontSize: 11.5, color: "text.secondary", cursor: "pointer" }}>cancel</Box>
                                                                                    </Box>
                                                                                ) : (
                                                                                    <Tooltip arrow title="Remove this entire run - every row it posted">
                                                                                        <Box component="span" onClick={() => setArmedDelete(rk)}
                                                                                            sx={{ fontSize: 11.5, color: "text.secondary", cursor: "pointer", "&:hover": { color: "error.main" } }}>
                                                                                            delete
                                                                                        </Box>
                                                                                    </Tooltip>
                                                                                )}
                                                                            </TableCell>
                                                                        </TableRow>
                                                                        {/* ---- WHAT failed, not just how much. A bare
                                                                             75% says a quarter went wrong and gives the
                                                                             reader no way to find out what. ---- */}
                                                                        {run.fails.size > 0 && (
                                                                            <TableRow key={rk + "|fails"}>
                                                                                <TableCell colSpan={intel.tiers.length + 3} sx={{ py: 0.75, borderBottom: 0 }}>
                                                                                    {[...run.fails.entries()].map(([t, fs]) => (
                                                                                        <Box key={t} sx={{ mb: 0.25 }}>
                                                                                            <Box component="span" sx={{ fontSize: 11, fontWeight: 700, color: "error.main", mr: 1 }}>
                                                                                                {tierLabel(t)} failed:
                                                                                            </Box>
                                                                                            {fs.map((f, n) => (
                                                                                                <Box component="span" key={f.case} sx={{ fontSize: 11, color: "text.secondary" }}>
                                                                                                    {n > 0 && " · "}
                                                                                                    <code>{f.case}</code>{f.why ? ` — ${f.why}` : ""}
                                                                                                </Box>
                                                                                            ))}
                                                                                        </Box>
                                                                                    ))}
                                                                                </TableCell>
                                                                            </TableRow>
                                                                        )}
                                                                        </Fragment>
                                                                    );
                                                                })}
                                                            </TableBody>
                                                        </Table>
                                                    </Box>
                                                </Collapse>
                                            </TableCell>
                                        </TableRow>
                                        </Fragment>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                            </Box>
                        )}
                    </AccordionDetails>
                </Accordion>
            )}
        </Box>
    );
};

export default ModelsBenchmarks;
