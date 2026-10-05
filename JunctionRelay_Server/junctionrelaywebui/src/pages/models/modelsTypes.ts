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

// Models module (MODELS) — shared row types for the four pages, matching the
// Model_Models_* POCOs (ASP.NET serializes camelCase).

export interface ModelsCatalogEntry {
    id: number;
    name: string;
    family: string | null;
    paramsB: number | null;
    // Dense | MoE | Hybrid, and a MoE's active params per token (35B-A3B -> 3):
    // the property that predicts how a model serves.
    architecture: string | null;
    activeParamsB: number | null;
    // The checkpoint's public release, 'YYYY-MM-DD' or 'YYYY-MM'.
    releaseDate: string | null;
    quant: string | null;
    // The quants of this model we hold, each with its measured size. The
    // catalog holds MODELS, so a quant is a sub-row inside an entry, never
    // an entry of its own; sizeGb is their total.
    quantsJson: string | null;
    contextLength: number | null;
    kvCachePrecision: string | null;
    sizeGb: number | null;
    traitsJson: string | null;
    storageLocation: string | null;
    category: string | null;
    status: string;
    supersededById: number | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface ModelsServingAssignment {
    id: number;
    modelId: number;
    machineId: number | null;
    alias: string | null;
    endpointPort: number | null;
    mode: string;
    isDefault: boolean;
    status: string;
    // What this slot ACTUALLY serves. Never read the catalog for these: a
    // catalog entry is a CHECKPOINT and lists every quant owned of it.
    quant: string | null;
    contextTokens: number | null;
    slots: number | null;
    kvPrecision: string | null;
    mtp: boolean | null;
    vision: boolean | null;
    weightsGb: number | null;
    // The engine and what its window means: sharedKv true = every one of `slots`
    // streams gets the whole contextTokens window out of one shared pool (vLLM, TensorFold);
    // false/null = contextTokens is split between fixed slots (llama.cpp -np).
    engine: string | null;
    sharedKv: boolean | null;
    poolTokens: number | null;
    // "on", "off", or an effort level ("max", "none") - Models_Benchmarks' vocabulary.
    thinking: string | null;
    // Its row on the serving page: only rows with onCard get a line on their machine's card,
    // in cardOrder, labelled cardLabel. sharesWith = the serving id whose process this row is a preset
    // of (GLM Brief -> GLM Full): same load, asked for differently per request, never counted twice.
    onCard: boolean;
    cardLabel: string | null;
    cardOrder: number | null;
    sharesWith: number | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

// One element of the serving page's design: a box (card), a client (who asks a box)
// or a rule (a numbered line). Edited over MCP (models_set_serving_design) and from the page.
export interface ModelsServingDesign {
    id: number;
    kind: "box" | "client" | "rule";
    name: string | null; title: string | null; role: string | null; body: string | null;
    machines: string | null; slotOwners: string | null; asksBox: string | null;
    delegatesTo: string | null; fallbackBox: string | null;
    row: number; position: number; accent: string | null; hw: string | null;
}
export const splitList = (s: string | null | undefined): string[] =>
    (s ?? "").split(",").map(x => x.trim()).filter(Boolean);

// A PUBLISHED third-party eval figure for a model, cited (its own table -
// catalog-domain, never a fleet measurement).
export interface ModelsReferenceScore {
    id: number;
    modelId: number;
    benchmark: string;
    score: number;
    source: string;
    notes: string | null;
    capturedAt: string;
}

// A fit verdict: this exact setup cannot serve on this machine (its own
// table - a refusal is not a measurement).
export interface ModelsFitVerdict {
    id: number;
    modelId: number;
    machineId: number;
    configJson: string;
    reason: string;
    source: string | null;
    capturedAt: string;
}

export interface ModelsBenchmark {
    id: number;
    // The model measured, and the row's own identity. modelId is the OPTIONAL
    // catalog link: null means the model is not on this user's shelf, which is
    // legitimate - the row is flagged, never hidden or discarded.
    modelName: string;
    modelId: number | null;
    machineId: number | null;
    metric: string;
    value: number;

    // ⛔ THE SETUP, AS THE RUN REPORTED IT. Never fill any of these in from the
    // catalog: the catalog holds MODELS, so asked "which quant?" it can only
    // answer "the ones we own" - and that is exactly the bug that printed every
    // quant held against every row. null means the submitting tool did not
    // capture it, and renders "—". Unknown is a legitimate answer; a borrowed
    // value is not.
    quant: string | null;
    contextTokens: number | null;
    slots: number | null;
    kvPrecision: string | null;
    mtp: boolean | null;
    vision: boolean | null;
    engine: string | null;
    weightsGb: number | null;

    capturedAt: string;
    source: string | null;
    notes: string | null;
    // Tool-specific extras only. The fields above are the contract.
    configJson: string | null;
    // The contract's load regime: shallow | code | deep | parallel_xN.
    scenario: string | null;
    // The tin behind a role-named machine ("Acer Veriton GN100" for a Node A run), when the
    // submitter said so. null = not stated; never filled from the inventory.
    hardware: string | null;
    // The thinking setting the run was served under: "on", "off", or an effort level ("max",
    // "none"). null = not stated (older rows); thinkingOf() then reads the config bag.
    thinking: string | null;
    createdAt: string;
}
// Which Lab machine each TIN (a box's own manufacturer + model, as a row's `hardware` spells it)
// belongs to today: "acer veriton gn100" -> "Node A". From the Lab's component inventory, so a
// pair's label is derived, never typed.
export const tinOwnersFrom = (components: {
    type: string; manufacturer?: string | null; model?: string | null; currentMachineName?: string | null;
}[]): { name: string; text: string }[] =>
    components.filter(c => c.currentMachineName && c.model)
        .map(c => ({ name: c.currentMachineName!, text: `${c.manufacturer ?? ""} ${c.model}`.toLowerCase() }));
// A tin belongs to the Lab machine whose component text contains every word of it: the Lab
// spells the Acer "Veriton VGN100-UD11 DGX Spark Workstation", a row says "Acer Veriton GN100".
// Exactly one machine must match, or the tin is left unresolved (never a guess).
const ownerOf = (tin: string, owners: { name: string; text: string }[]): string | null => {
    const words = tin.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = new Set(owners.filter(o => words.every(w => o.text.includes(w))).map(o => o.name));
    return hits.size === 1 ? [...hits][0] : null;
};
// "Node A" + "Node B" -> "Nodes A+B": a shared leading word pluralised, the rest joined.
// Names that share nothing are joined as they are ("Pris + Cheyenne").
const pairName = (names: string[]): string => {
    const parts = names.map(n => n.trim().split(/\s+/));
    const head = parts[0][0];
    if (parts.every(p => p.length === 2 && p[0] === head)) return `${head}s ${parts.map(p => p[1]).join("+")}`;
    return names.join(" + ");
};
// A machine label that carries the tin when the row names one. A row whose hardware names
// several tins ("Acer Veriton GN100 + Gigabyte AI TOP ATOM") was a PAIR run: the label names
// every Lab machine those tins belong to ("Nodes A+B (…)"), looked up through tinOwners.
export const machineLabel = (machines: Map<number, string>, b: ModelsBenchmark, tinOwners?: { name: string; text: string }[]): string => {
    const name = b.machineId == null ? "" : (machines.get(b.machineId) ?? `#${b.machineId}`);
    if (!b.hardware) return name;
    const tins = b.hardware.split(/\s\+\s/).map(t => t.trim()).filter(Boolean);
    if (tins.length > 1 && tinOwners) {
        const owners = tins.map(t => ownerOf(t, tinOwners));
        if (owners.every(o => o != null) && new Set(owners).size === owners.length) {
            return `${pairName(owners as string[])} (${b.hardware})`;
        }
    }
    return `${name} (${b.hardware})`;
};
// The thinking setting of a row: the column when the submitter said so, else the config bag's
// thinking_default (LLMSpeedTest wrote it there first), else null = not stated.
export const thinkingOf = (b: ModelsBenchmark): string | null => {
    if (b.thinking) return b.thinking;
    try {
        const cfg = JSON.parse(b.configJson ?? "{}") as { thinking_default?: string };
        return cfg.thinking_default ?? null;
    } catch { return null; }
};
// The role back out of a label: "Node A (Acer Veriton GN100)" -> "Node A". Lab facts (sentiment,
// installed parts, ids) key on the role; a label with no tin is already the role.
export const machineRole = (label: string): string => label.replace(/ \([^()]*\)$/, "");

// Machine hardware comes from the LAB INVENTORY, not from code: JR is open
// source and these pages must describe whatever fleet they land in. The GPUs
// and memory installed on a machine ARE its serving-relevant hardware; their
// spec strings carry the GB. No inventory data = no header lines and no
// won't-fit verdicts - absence degrades to "untested", never to a guess.
export interface MachineFacts { hw: string[]; vramGb: number | null }
export const machineFactsFrom = (components: {
    type: string; manufacturer?: string | null; model?: string | null;
    spec?: string | null; currentMachineName?: string | null;
}[]): Map<string, MachineFacts> => {
    const out = new Map<string, MachineFacts>();
    const gb = (s: string | null | undefined): number | null => {
        const m = /(\d+(?:\.\d+)?)\s*GB/i.exec(s ?? "");
        return m ? Number(m[1]) : null;
    };
    const byMachine = new Map<string, typeof components>();
    for (const c of components) {
        if (!c.currentMachineName) continue;
        (byMachine.get(c.currentMachineName) ?? byMachine.set(c.currentMachineName, []).get(c.currentMachineName)!).push(c);
    }
    // The model NUMBER, not the marketing name: "MSI RTX 5090 Gaming Trio OC"
    // reads "RTX 5090" in a header, where a wide string would spill.
    const shortGpu = (model: string | null | undefined): string | null => {
        const m = /\b((?:RTX|GTX|RX|Arc(?:\s\w+)?|AI\sPro)\s?[A-Z]?\d{3,4}\s?(?:Ti|SUPER|XT|XTX)?)\b/i.exec(model ?? "");
        return m ? m[1].replace(/\s+/g, " ").trim() : null;
    };
    for (const [mach, parts] of byMachine) {
        const gpus = parts.filter(p => p.type.toUpperCase() === "GPU");
        const ram = parts.filter(p => /^(RAM|MEMORY)$/i.test(p.type))
            .reduce((n, p) => n + (gb(p.spec) ?? 0), 0);
        // A box with no GPU (the mini PC) reads its CPU, else its board, else the whole unit when the Lab files the
        // machine as one part (a Spark is one "Mini PC" row) - so every machine card is the Lab's.
        const whole = parts.find(p => /^(MINI PC|SBC|LAPTOP|DESKTOP|SERVER|WORKSTATION)$/i.test(p.type));
        const host = parts.find(p => p.type.toUpperCase() === "CPU") ?? parts.find(p => p.type.toUpperCase() === "MOBO") ?? whole;
        const unitRam = ram === 0 && host === whole && whole ? gb(whole.spec) ?? 0 : 0;
        if (gpus.length === 0 && !host && !ram) continue;
        // One line per GPU, one for RAM - rows, never one wide string.
        const lines = gpus.length === 0 ? [host?.model ?? host?.manufacturer ?? "no GPU"] : gpus.map(p => {
            const g = gb(p.spec);
            const name = shortGpu(p.model) ?? p.model ?? "GPU";
            return g ? `${name} · ${g} GB` : name;
        });
        if (ram) lines.push(`${ram} GB RAM`);
        else if (unitRam) lines.push(`${unitRam} GB`);
        const vrams = gpus.map(p => gb(p.spec));
        out.set(mach, {
            hw: lines,
            vramGb: vrams.every(v => v != null) ? (vrams as number[]).reduce((a, b) => a + b, 0) : null
        });
    }
    return out;
};

// The slice of a Lab machine the Models pages need for id → name display.
export interface LabMachineRef {
    id: number;
    name: string;
}

export const fetchMachineNames = async (): Promise<Map<number, string>> => {
    const res = await fetch("/api/lab/machines");
    if (!res.ok) return new Map();
    const machines: LabMachineRef[] = await res.json();
    return new Map(machines.map(m => [m.id, m.name]));
};
