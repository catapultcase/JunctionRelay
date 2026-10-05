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

import React from "react";

// The BENCHMARK CONTRACT's client-side single source of truth. JR is open
// source and suite-agnostic: ANY harness that posts the contract's shapes
// (see docs/BENCHMARK-CONTRACT.md) lights up the Benchmarks browser and the
// Models dashboard. Both pages read the vocabulary from here so it cannot
// drift between them.

import { ModelsBenchmark, ModelsReferenceScore } from "./modelsTypes";

// Display bands (defaults; an instance may tune them, the meaning may not):
// GREEN at/above feels instant, AMBER spans the usability threshold zone,
// RED below it means visible waiting.
// 50 / 30 for generation. The old 70 / 60 was set when the
// fleet's daily driver read 70+; the bar for a daily model is 50 tok/s and
// ~30 is where a smarter model is still usable.
export const RAG_GREEN = 50;
export const RAG_AMBER = 30;
// Prefill has its own scale - it is how long a big prompt takes to READ before
// the first token: 2,000 / 1,000. 2,000 tok/s reads the 71K-token repo
// review in ~35 s; 1,000-2,000 is about a minute; below 1,000 a review turn
// is minutes (1,500-1,850 is amber, not green).
export const PREFILL_GREEN = 2000;
export const PREFILL_AMBER = 1000;
// ⛔ THEME TOKENS, NEVER HEX. These are read in dark mode too, and a literal
// colour is fixed to one background - the matrix cells were unreadable black on
// black. A token resolves against whichever theme is showing.
// Same tokens as evalColor, so the two tabs band alike.
export const speedColor = (v: number): string =>
    v >= RAG_GREEN ? "success.main" : v >= RAG_AMBER ? "warning.main" : "error.main";
export const prefillColor = (v: number): string =>
    v >= PREFILL_GREEN ? "success.main" : v >= PREFILL_AMBER ? "warning.main" : "error.main";

// The contract's scenarios are PROMPT DEPTHS: `4k`,
// `16k`, `32k`, `64k`, `128k`, `256k` - one cold request each, prompt_tok_s the
// prefill of the whole prompt, gen_tok_s the next 128 tokens at that depth -
// and `<depth>_x<N>` for N simultaneous streams. That is the shape published
// numbers take (llama-bench -d, the vLLM/MLX recipes), so a cell here reads
// against a cell out there. Depths are never averaged together.
// The matrix shows three rungs; the rest ride the reports and tooltips.
export const RUNGS = { short: 4, mid: 32, deep: 128 } as const;
export const depthOf = (scen: string): number | null => {
    const m = /^(\d+)k$/.exec(scen);
    return m ? Number(m[1]) : null;
};
export const concurrencyOf = (scen: string): { depthK: number; n: number } | null => {
    const m = /^(\d+)k_x(\d+)$/.exec(scen);
    return m ? { depthK: Number(m[1]), n: Number(m[2]) } : null;
};
export const scenarioOf = (b: ModelsBenchmark): string => {
    // First-class since 0.9.0.63; the notes-field "scenario=..." convention
    // remains readable for rows from before the column existed.
    if (b.scenario) return b.scenario;
    return /scenario=(\w+)/.exec(b.notes ?? "")?.[1] ?? "unknown";
};

// capturedAt is UTC serialized without a zone suffix (server quirk); parse
// suffix-less strings as the UTC they are or every timestamp shifts by the
// viewer's UTC offset.
export const utcDate = (iso: string): Date =>
    new Date(/Z$|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + "Z");

// Reference scores live in their OWN TABLE (/api/models/reference-scores):
// published, cited eval figures per model - catalog-domain facts about the
// checkpoint, never fleet measurements, never in the benchmark ledger.
//
// ⛔ ONE BENCHMARK AT A TIME, NEVER A FALLBACK CHAIN. Mixing
// SWE-bench Verified with Pro in one column produced a wrong verdict once
// (Pro is a HARDER set - on the shared metric the ranking inverted). The
// reader picks the benchmark, every row shows that one, and a model that
// does not publish it stays BLANK.
export const REF_METRICS = ["swe_bench_verified", "swe_bench_pro", "aider_polyglot"];
export const REF_LABELS: Record<string, string> = {
    swe_bench_verified: "SWE-bench Verified", swe_bench_pro: "SWE-bench Pro",
    aider_polyglot: "Aider polyglot",
};
export const REF_SHORT: Record<string, string> = {
    swe_bench_verified: "SWE-bench V", swe_bench_pro: "SWE-bench Pro",
    aider_polyglot: "Aider polyglot",
};
export const refLabel = (m: string): string => REF_LABELS[m] ?? m;
export interface RefScore { metric: string; value: number; source: string | null; at: string }

// Which benchmarks the reference-score table carries, canonical order first.
export const refMetricsPresent = (scores: ModelsReferenceScore[]): string[] => {
    const seen = new Set(scores.map(r => r.benchmark));
    return [...REF_METRICS.filter(m => seen.has(m)),
            ...[...seen].filter(m => !REF_METRICS.includes(m)).sort()];
};

// Scores for EXACTLY ONE benchmark, newest citation per model winning.
export const refScoresFor = (scores: ModelsReferenceScore[], benchmark: string): Map<number, RefScore> => {
    const out = new Map<number, RefScore>();
    for (const r of scores) {
        if (r.benchmark !== benchmark) continue;
        const cur = out.get(r.modelId);
        if (!cur || r.capturedAt > cur.at)
            out.set(r.modelId, { metric: r.benchmark, value: r.score, source: r.source, at: r.capturedAt });
    }
    return out;
};

// The default pick: whichever benchmark covers the most models on screen.
export const widestRefMetric = (scores: ModelsReferenceScore[], modelIds: Set<number>): string | null => {
    let best: string | null = null, bestN = 0;
    for (const m of refMetricsPresent(scores)) {
        const n = [...refScoresFor(scores, m).keys()].filter(id => modelIds.has(id)).length;
        if (n > bestN) { best = m; bestN = n; }
    }
    return best;
};

// The chosen benchmark is a viewer preference, remembered per browser so the
// Benchmarks matrix and the Serving page never disagree about the column.
const REF_PREF_KEY = "jr.models.refMetric";
export const readRefPref = (): string | null => {
    try { return window.localStorage.getItem(REF_PREF_KEY); } catch { return null; }
};
export const writeRefPref = (m: string): void => {
    try { window.localStorage.setItem(REF_PREF_KEY, m); } catch { /* private mode */ }
};


// ─────────────────────────────────────────────────────────────────────────────
// Persisted table UI state, the Collectors/Junctions convention: sorting
// and filters survive navigating away, like every other JR table. One helper so the MODELS pages cannot drift apart again.
// Wrapped in try/catch: localStorage throws outright in some privacy modes,
// and a lost preference must never take the page down with it.
export function usePersistedTableState<T>(
    key: string, dflt: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [v, setV] = React.useState<T>(() => {
        try {
            const s = localStorage.getItem(key);
            return s !== null ? (JSON.parse(s) as T) : dflt;
        } catch { return dflt; }
    });
    React.useEffect(() => {
        try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* unavailable */ }
    }, [key, v]);
    return [v, setV];
}

// ─────────────────────────────────────────────────────────────────────────────
// INTELLIGENCE — the reasoning suite's side of the ledger.
//
// LLMReasoningTest posts one row per TIER as `eval_<tier>`, value = pass rate %.
// It shares the benchmark table with speed rows and is separable by metric, which
// is why the Speed matrix never sees these: it matches gen_tok_s and friends
// explicitly rather than taking whatever arrives.
//
// ⛔ INTELLIGENCE IS A PROPERTY OF THE WEIGHTS, NOT THE BOX. The same quant on
// two machines answers the same; only quant, context and sampling can move it.
// So these rows key on the MODEL and its setup, and the machine is provenance -
// where it happened to run - not an axis. It is also why a cloud model with no
// machine at all is a first-class row here.
export const EVAL_PREFIX = "eval_";

// ⛔ THE TABS ARE NOT A FIXED PAIR. This page is bench-agnostic - anything that
// posts the contract's shapes lights it up - so hardcoding "Speed" and
// "Intelligence" would mean the next suite someone brings has nowhere to land
// and needs a code change to be seen at all.
//
// A tab is a SUITE. Speed is the built-in throughput matrix; every other suite
// that posts scored metrics gets its own tab, discovered from the rows.
// A suite names itself in configJson.suite - the reasoning suite already does -
// and the metric's suffix becomes the column, so `eval_looping` is the
// `looping` column of whatever suite posted it.
export const SPEED_METRICS = new Set([
    "gen_tok_s", "prompt_tok_s", "gen_tok_s_aggregate",
    "gpu_watts_avg", "vram_gb", "cold_load_s", "disk_read_mbs",
    // The Windows paging tell. Without this line it fell through to
    // the scored-suite path and rendered as "LLMSpeedTest · shared_gb 9.6%".
    "vram_shared_gb",
    // Contract v3: time to first token (the server's prompt_ms) and the draft
    // head's acceptance rate, per depth rung.
    "ttft_s", "draft_accept",
    // llama-bench's own pp512 / tg128 at the rung's depth (v3.1): the community's
    // number for the same file and placement, beside ours in the cell tooltip.
    "llb_pp512", "llb_tg128",
    // A rung attempted and dead (value 1, the engine's cause line in notes) - the
    // matrix shows a FAILED chip there instead of a bare dash.
    "rung_failed",
    ]);

export const isSpeedMetric = (metric: string): boolean => SPEED_METRICS.has(metric);

/** A suite's display name. Known suites get the name people call them; the rest
 *  are shown as they named themselves, which is better than "Other". */
const SUITE_LABELS: Record<string, string> = {
    LLMReasoningTest: "Intelligence",
    LLMSpeedTest: "Speed",
};
export const suiteLabel = (suite: string): string => SUITE_LABELS[suite] ?? suite;

/** The suite a row belongs to, from configJson; falls back to the metric family
 *  so a bench that never names itself still gets a tab rather than vanishing. */
export const suiteOf = (configJson: string | null, metric: string): string => {
    try {
        const c = JSON.parse(configJson ?? "{}");
        if (typeof c.suite === "string" && c.suite.trim()) return c.suite.trim();
    } catch { /* fall through */ }
    const i = metric.indexOf("_");
    return i > 0 ? metric.slice(0, i) : metric;
};

/** The column a scored metric belongs to: the part after the family prefix. */
export const scoreColumnOf = (metric: string): string => {
    const i = metric.indexOf("_");
    return i > 0 ? metric.slice(i + 1) : metric;
};

/** How a suite wants its rows drawn, declared per row in configJson.display.
 *
 *  ⛔ THIS IS NOT A COSMETIC CHOICE - IT DECLARES WHAT THE MEASUREMENT IS OF
 *. "matrix" puts MACHINES on an axis, which is only honest
 *  when the box is part of what was measured: speed is a property of the
 *  weights AND the hardware, so the same quant genuinely differs across boxes
 *  and a matrix is the only shape that can show it. "table" says the machine
 *  is provenance - where it happened to run - because the result would be the
 *  same anywhere, which is true of anything scoring the weights themselves.
 *
 *  Pick wrong and the page lies in a specific way: a matrix invites the reader
 *  to compare two boxes on a number that cannot differ between them, and a
 *  table quietly hides a machine difference that is the entire finding.
 *
 *  Default "table": a suite that says nothing is assumed to be measuring the
 *  weights, which is the safer error - it under-claims rather than inventing
 *  an axis the submitter never said existed.
 */
export type SuiteDisplay = "table" | "matrix";
export const displayOf = (configJson: string | null): SuiteDisplay => {
    try {
        const c = JSON.parse(configJson ?? "{}");
        return c.display === "matrix" ? "matrix" : "table";
    } catch { return "table"; }
};

/** The unit a suite's values carry. Defaults to a percentage pass rate, which
 *  is what the pass/fail bands assume; anything else is shown as a plain number
 *  with its unit and is NOT banded, because 90 of an unknown unit is not "good"
 *  and colouring it would assert something the submitter never claimed. */
export const unitOf = (configJson: string | null): string => {
    try {
        const c = JSON.parse(configJson ?? "{}");
        return typeof c.unit === "string" && c.unit.trim() ? c.unit.trim() : "%";
    } catch { return "%"; }
};

/** A suite's declaration, resolved from its NEWEST row - a suite that changes
 *  how it presents itself should take effect without rewriting history. */
export const suiteDisplayFrom = (
    rows: { configJson: string | null; capturedAt: string }[],
): { display: SuiteDisplay; unit: string } => {
    let newest: { configJson: string | null; capturedAt: string } | null = null;
    for (const r of rows) if (!newest || r.capturedAt > newest.capturedAt) newest = r;
    return { display: displayOf(newest?.configJson ?? null), unit: unitOf(newest?.configJson ?? null) };
};

/** What actually failed, when the suite bothered to say. A bare "75%" tells a
 *  reader that a quarter of something went wrong and gives them no way to find
 *  out what, short of opening a transcript on the box that ran it - so a suite
 *  may carry configJson.failures: [{case, why}], and the run detail shows them.
 *  Absent is normal and fine: not every bench knows its cases by name. */
/** The version of the SUITE that produced a row - configJson.suite_version.
 *
 *  ⛔ SCORES COMPARE ONLY WITHIN A VERSION. Change the cases,
 *  the checkers or the token budget and the number means something different,
 *  exactly as a different engine build or placement regime does on the speed
 *  side - and this page already refuses to blend those. A suite that raised its
 *  token ceiling scored every local model 0% on one tier beforehand and 100%
 *  after; averaging across that change would have hidden the entire finding.
 *
 *  null means the suite never said. That is legitimate for older rows, but they
 *  are their own era ("unversioned") and are not mixed with versioned ones.
 */
export const suiteVersionOf = (configJson: string | null): string | null => {
    try {
        const v = JSON.parse(configJson ?? "{}").suite_version;
        return v == null || `${v}`.trim() === "" ? null : `${v}`.trim();
    } catch { return null; }
};

export const VERSION_UNSET = "—";
export const versionLabel = (v: string | null): string => v ?? "unversioned";

/** Versions present in a set of rows, newest first. Numeric where it can be,
 *  so "10" sorts after "9" rather than before it. */
export const versionsIn = (rows: { configJson: string | null }[]): (string | null)[] => {
    const seen = new Set<string | null>();
    for (const r of rows) seen.add(suiteVersionOf(r.configJson));
    return [...seen].sort((a, b) => {
        if (a === b) return 0;
        if (a === null) return 1;          // unversioned is always the oldest era
        if (b === null) return -1;
        const na = Number(a), nb = Number(b);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na;
        return b.localeCompare(a);
    });
};

export interface CaseFailure { case: string; why: string }
const isFailureEntry = (x: unknown): x is { case: string; why?: unknown } =>
    typeof x === "object" && x !== null && "case" in x && typeof x.case === "string";
export const failuresOf = (configJson: string | null): CaseFailure[] => {
    try {
        const f: unknown = JSON.parse(configJson ?? "{}").failures;
        return Array.isArray(f)
            ? f.filter(isFailureEntry)
               .map(x => ({ case: x.case, why: String(x.why ?? "") }))
            : [];
    } catch { return []; }
};

export const isEvalMetric = (metric: string): boolean => metric.startsWith(EVAL_PREFIX);
export const tierOf = (metric: string): string => metric.slice(EVAL_PREFIX.length);

// Order the tiers deliberately: the two that catch a model being unusable rather
// than merely wrong come first. `looping` is the fault that silences the assistant -
// finish_reason stop with empty content and thousands of characters of thinking -
// and `tool_calling` is what an agent needs before anything else matters.
export const TIER_ORDER = ["tool_calling", "looping", "code_exec", "house_rules", "long_context"];

export const tierLabel = (tier: string): string =>
    tier.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

export const sortTiers = (tiers: string[]): string[] =>
    [...tiers].sort((a, b) => {
        const ia = TIER_ORDER.indexOf(a), ib = TIER_ORDER.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });

// A pass RATE, so the bands are not the speed bands. 100 is the only score that
// means "nothing failed"; a tier at 80% still fails one case in five.
export const evalColor = (pct: number): string =>
    pct >= 90 ? "success.main" : pct >= 70 ? "warning.main" : "error.main";

/**
 * ⚠️ OVERALL IS CASE-WEIGHTED, NEVER A MEAN OF RATES. A five-case tier and a
 * twenty-case tier do not deserve equal say, and averaging the percentages gives
 * them exactly that. The suite records `cases` in configJson for this reason;
 * where it is missing the tier is counted once so the number degrades rather
 * than lying.
 */
export const overallRate = (rows: { value: number; cases: number | null }[]): number | null => {
    if (rows.length === 0) return null;
    const totalCases = rows.reduce((n, r) => n + (r.cases ?? 1), 0);
    if (totalCases === 0) return null;
    return rows.reduce((n, r) => n + r.value * (r.cases ?? 1), 0) / totalCases;
};

/**
 * The columns a suite DECLARES it has, from configJson.suite_columns.
 *
 * ⛔ Columns inferred from the rows alone cannot tell "this tier has not run"
 * from "this tier does not exist": a tier whose cases all errored simply
 * vanishes, and the table looks identical either way. A suite
 * that declares its columns gets an honest "— untested" cell instead.
 */
export const declaredColumnsOf = (configJson: string | null): string[] => {
    try {
        const c = JSON.parse(configJson ?? "{}");
        return Array.isArray(c.suite_columns) ? c.suite_columns.filter((x: unknown) => typeof x === "string") : [];
    } catch { return []; }
};

export const casesOf = (configJson: string | null): number | null => {
    try {
        const c = JSON.parse(configJson ?? "{}");
        return typeof c.cases === "number" ? c.cases : null;
    } catch { return null; }
};

// ---------------------------------------------------------------- placement --
// WHERE THE WEIGHTS SAT when the number was measured, from the run's own
// configJson: expert layers in system RAM (n_cpu_moe - the suite counts
// --n-cpu-moe AND every -ot ...=CPU pin), the GPU split and the micro-batch.
// The layer count is part of a setup's IDENTITY (it decides the regime band
// and it is what a placement-curve series varies); split and ubatch are
// tuning. Three REAP placements at one window once folded into one row and
// the all-in-VRAM result vanished - every page that groups rows
// into setups goes through this.
export interface Placement { layersInRam: number | null; layersTotal: number | null; tensorSplit: string | null; ubatch: number | null }
export const placementOf = (configJson: string | null): Placement => {
    const out: Placement = { layersInRam: null, layersTotal: null, tensorSplit: null, ubatch: null };
    try {
        const c = JSON.parse(configJson ?? "{}") as Record<string, unknown>;
        if (c.n_cpu_moe !== undefined && c.n_cpu_moe !== null)
            out.layersInRam = c.n_cpu_moe === true ? null : Number(c.n_cpu_moe);
        if (c.n_layers_total) out.layersTotal = Number(c.n_layers_total);
        if (typeof c.tensor_split === "string" && c.tensor_split) out.tensorSplit = c.tensor_split;
        if (c.ubatch !== undefined && c.ubatch !== null) out.ubatch = Number(c.ubatch);
    } catch { /* extras are optional */ }
    return out;
};
// The words for a placement, in the order they read on a row.
export const placementLabel = (p: Placement): string[] => [
    p.layersInRam != null ? `${p.layersInRam} in RAM` : null,
    p.tensorSplit ? `split ${p.tensorSplit}` : null,
    p.ubatch ? `ub ${p.ubatch}` : null,
].filter((x): x is string => !!x);
// Windows pages the GPU silently: a process with this much of its memory in
// shared (system) RAM is in the paged regime, not a slow all-in-VRAM row.
export const PAGING_SHARED_GB = 0.8;
