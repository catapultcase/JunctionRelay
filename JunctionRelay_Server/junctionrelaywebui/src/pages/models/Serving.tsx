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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
    Autocomplete, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
    IconButton, MenuItem, Paper, Tab, Tabs, TextField, Typography, useTheme,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { lighten } from "@mui/material/styles";
import { usePageTitle } from "../../hooks/usePageTitle";
import {
    MachineFacts, ModelsBenchmark, ModelsCatalogEntry, ModelsServingAssignment, ModelsServingDesign,
    machineFactsFrom, splitList
} from "./modelsTypes";
import { depthOf, RUNGS, scenarioOf, speedColor } from "./benchmarkContract";

// The SERVING page - ONE PICTURE of how models are served across the fleet, and why.
//
// ⛔ NO SITE DATA IS IN THIS FILE, so the page is updated over MCP and in the UI, never by a build:
//   * THE DESIGN - boxes, their titles, roles and reasons, the Lab machines in each, slot owners, who
//     delegates to and falls back to whom, the clients and the rules - is Models_Serving_Design,
//     edited with models_set_serving_design or the pencil / "Clients & rules" on this page.
//   * WHAT A BOX SHOWS is the Models_Serving rows you ticked (onCard): the card is the
//     machine, each ticked row one expandable line in cardOrder - model, quant, window, slots, KV, MTP,
//     thinking, and the engine with whether its window is per stream from a shared pool (sharedKv) or
//     split between fixed slots. A preset (sharesWith - GLM Brief of GLM Full) says so and repeats none
//     of its process. Edited with models_set_serving or the pencil's Serving and Rows tabs.
//   * SPEED is the benchmark ledger's 4K-rung figures for that exact setup; active params the catalog's.
//   * HARDWARE and always-on are the Lab's. The editor PICKS machines and boxes from what exists, so
//     nothing drifts; a card with no Lab hardware says so instead of trusting a typed line.
// THE LAYOUT IS COMPUTED: boxes sit in rows by their Row, left to right by Position, spaced evenly;
// each row starts below the tallest card above it (measured, never assumed); clients sit above the
// box they ask; arrow ends spread across a card's width in the order of the cards they connect to.

const BOX_W = 400, GROUP_W = 500, CLIENT_W = 180, CLIENT_H = 52, CANVAS_MIN_W = 1120;
const CLIENT_TOP = 8, FIRST_ROW_TOP = CLIENT_TOP + CLIENT_H + 70, ROW_GAP = 110, EST_BOX_H = 380;
const DEFAULT_ACCENT = "#455a64";
type Rect = { left: number; top: number; width: number; height: number };

interface LabMachine { id: number; name: string; alwaysOn: boolean; status: string }

const normKv = (kv: unknown) => {
    const v = (kv ?? "").toString().trim().toLowerCase();
    return v === "" || v === "f16" ? "f16" : v;
};
const setupKey = (q: unknown, ctx: unknown, kv: unknown, mtp: unknown) =>
    [q ?? "", ctx ?? "", normKv(kv), mtp ? "mtp" : ""].join("|");
// The three ledger metrics a card shows, all at the short rung.
const FACT_METRICS = ["prompt_tok_s", "gen_tok_s", "ttft_s"];
const fmtB = (b: number) => (Number.isInteger(b) ? `${b}B` : `${b.toFixed(1)}B`);
const fmtInt = (v: number) => Math.round(v).toLocaleString();
const fmtS = (v: number) => (v < 10 ? v.toFixed(2) : v.toFixed(1));
// Chip colours: one per chip type, the same on every card, so a column of cards scans by type.
// Thinking is a scale from off (grey) to max (red). Dark mode lightens them (chipSx).
const CHIP = {
    quant: "#6a1b9a", window: "#1565c0", kv: "#00838f", mtp: "#2e7d32", vision: "#ad1457",
    gb: "#6d4c41", engine: "#3949ab", port: "#78909c",
};
const THINK: Record<string, string> = { off: "#757575", none: "#757575", low: "#b8860b", on: "#ef6c00", max: "#c62828" };
const thinkColour = (t: string) => THINK[(t.split(/[ ·]/)[0] ?? "").toLowerCase()] ?? THINK.on;
const fmtTok = (t: number) => {
    const k = t / 1024;
    return k >= 1024 ? `${+(k / 1024).toFixed(2)}M` : `${Math.round(k)}K`;
};

interface ServingForm {
    servingId: number | null; machineId: number | null; machineName: string;
    modelId: number | ""; alias: string; endpointPort: string; mode: string; quant: string; contextTokens: string;
    slots: string; kvPrecision: string; mtp: boolean; vision: boolean; weightsGb: string; notes: string;
    engine: string; sharedKv: boolean; poolTokens: string; thinking: string;
}
type DesignForm = Omit<ModelsServingDesign, "id"> & { id: number | null };
const emptyBox = (row: number, position: number): DesignForm => ({
    id: null, kind: "box", name: "", title: "", role: "", body: "", machines: "", slotOwners: "",
    asksBox: null, delegatesTo: "", fallbackBox: "", row, position, accent: "", hw: "",
});

const ModelsServing = () => {
    usePageTitle("Models Serving");
    const theme = useTheme();
    const chipSx = (c: string) => {
        const col = theme.palette.mode === "dark" ? lighten(c, 0.45) : c;
        return { height: 18, fontSize: 10, borderColor: col, color: col, bgcolor: `${col}14` };
    };

    const [assignments, setAssignments] = useState<ModelsServingAssignment[]>([]);
    const [design, setDesign] = useState<ModelsServingDesign[]>([]);
    const [catalog, setCatalog] = useState<ModelsCatalogEntry[]>([]);
    const [benchmarks, setBenchmarks] = useState<ModelsBenchmark[]>([]);
    const [machines, setMachines] = useState<LabMachine[]>([]);
    const [facts, setFacts] = useState<Map<string, MachineFacts>>(new Map());
    const [error, setError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);

    const load = useCallback(async () => {
        try {
            const [sRes, dRes, cRes, bRes, mRes, compRes] = await Promise.all([
                fetch("/api/models/serving"), fetch("/api/models/serving-design"), fetch("/api/models/catalog"),
                fetch("/api/models/benchmarks/recent?limit=20000"),
                fetch("/api/lab/machines"), fetch("/api/lab/components"),
            ]);
            if (!sRes.ok) throw new Error(await sRes.text());
            setAssignments(await sRes.json());
            if (dRes.ok) setDesign(await dRes.json());
            if (cRes.ok) setCatalog(await cRes.json());
            if (bRes.ok) setBenchmarks(await bRes.json());
            if (mRes.ok) setMachines(await mRes.json());
            if (compRes.ok) setFacts(machineFactsFrom(await compRes.json()));
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load the serving map");
        } finally {
            setLoaded(true);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    const boxes = useMemo(() => design.filter(d => d.kind === "box")
        .sort((a, b) => a.row - b.row || a.position - b.position || a.id - b.id), [design]);
    const clients = useMemo(() => design.filter(d => d.kind === "client")
        .sort((a, b) => a.position - b.position || a.id - b.id), [design]);
    const rules = useMemo(() => design.filter(d => d.kind === "rule")
        .sort((a, b) => a.position - b.position || a.id - b.id), [design]);
    const boxByName = useMemo(() => new Map(boxes.map(b => [(b.name ?? "").toLowerCase(), b])), [boxes]);

    const byName = useMemo(() => new Map(machines.map(m => [m.name.toLowerCase(), m])), [machines]);
    const modelName = useMemo(() => new Map(catalog.map(m => [m.id, m.name])), [catalog]);
    const catById = useMemo(() => new Map(catalog.map(m => [m.id, m])), [catalog]);
    const catalogSorted = useMemo(() => [...catalog].sort((a, b) => a.name.localeCompare(b.name)), [catalog]);

    // Latest short-rung figures per (metric, machine, model, SETUP) - the benchmark matrix's key, so
    // a card is never labelled with another setup's number. A pair's rows live on its head machine.
    const ledger = useMemo(() => {
        const out = new Map<string, number>();
        for (const b of benchmarks) {
            if (b.machineId == null || !FACT_METRICS.includes(b.metric) || depthOf(scenarioOf(b)) !== RUNGS.short) continue;
            const k = `${b.metric}|${b.machineId}|${b.modelId}|${setupKey(b.quant, b.contextTokens, b.kvPrecision, b.mtp)}`;
            if (!out.has(k)) out.set(k, b.value);
        }
        return out;
    }, [benchmarks]);

    // ---- what a box serves and how it reads ----
    const boxData = (d: ModelsServingDesign) => {
        const names = splitList(d.machines);
        const ms = names.map(n => byName.get(n.toLowerCase()));
        const ids = new Set(ms.filter(Boolean).map(m => m!.id));
        const live = assignments.filter(a => a.machineId != null && ids.has(a.machineId) && a.status === "active");
        const group = names.length > 1;
        const def = live.find(a => a.isDefault) ?? (group ? undefined : live[0]);
        const shown = live.filter(a => a.onCard)
            .sort((a, b) => (a.cardOrder ?? 99) - (b.cardOrder ?? 99) || a.id - b.id);
        return { names, ms, live, group, def, shown };
    };

    // The card figures for one serving row: the ledger's short-rung speeds for that exact setup, the
    // catalog's active params, and the window each stream gets.
    const factsOf = (a: ModelsServingAssignment) => {
        const sk = `${a.machineId}|${a.modelId}|${setupKey(a.quant, a.contextTokens, a.kvPrecision, a.mtp)}`;
        const fact = (metric: string) => ledger.get(`${metric}|${sk}`);
        const cat = catById.get(a.modelId);
        const active = cat?.activeParamsB != null ? { v: fmtB(cat.activeParamsB), u: "active" }
            : cat?.paramsB != null ? { v: fmtB(cat.paramsB), u: "dense" } : null;
        const perStream = a.contextTokens && a.slots ? (a.sharedKv ? a.contextTokens : a.contextTokens / a.slots) : null;
        return { tok: fact("gen_tok_s"), pp: fact("prompt_tok_s"), ttft: fact("ttft_s"), active, perStream };
    };

    // Rows folded to one line: per viewer, remembered in this browser; open by default.
    const FOLD_KEY = "jr.serving.folded";
    const [folded, setFolded] = useState<Set<number>>(() => {
        try { return new Set<number>(JSON.parse(localStorage.getItem(FOLD_KEY) ?? "[]")); } catch { return new Set(); }
    });
    const setFold = (ids: number[], fold: boolean) => setFolded(prev => {
        const next = new Set(prev);
        ids.forEach(id => (fold ? next.add(id) : next.delete(id)));
        try { localStorage.setItem(FOLD_KEY, JSON.stringify([...next])); } catch { /* private window: forget it */ }
        return next;
    });

    // ---- the pencil: edit a box's card (design) and what it serves (serving row) ----
    const [editTab, setEditTab] = useState(0);
    const [boxForm, setBoxForm] = useState<DesignForm | null>(null);
    const [servForm, setServForm] = useState<ServingForm | null>(null);
    const [rowsDraft, setRowsDraft] = useState<ModelsServingAssignment[]>([]);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const servingFormFor = (def: ModelsServingAssignment | undefined, head: LabMachine | undefined, fallbackName: string): ServingForm => ({
        servingId: def?.id ?? null, machineId: def?.machineId ?? head?.id ?? null, machineName: head?.name ?? fallbackName,
        modelId: def?.modelId ?? "", alias: def?.alias ?? "", endpointPort: def?.endpointPort?.toString() ?? "",
        mode: def?.mode ?? "resident", quant: def?.quant ?? "", contextTokens: def?.contextTokens?.toString() ?? "",
        slots: def?.slots?.toString() ?? "", kvPrecision: def?.kvPrecision ?? "", mtp: !!def?.mtp, vision: !!def?.vision,
        weightsGb: def?.weightsGb?.toString() ?? "", notes: def?.notes ?? "",
        engine: def?.engine ?? "", sharedKv: !!def?.sharedKv, poolTokens: def?.poolTokens?.toString() ?? "",
        thinking: def?.thinking ?? "",
    });
    const openEdit = (d: ModelsServingDesign | null, tab = 0) => {
        setSaveError(null);
        if (!d) {
            const lastRow = boxes.length ? boxes[boxes.length - 1].row : 1;
            setBoxForm(emptyBox(lastRow, boxes.filter(b => b.row === lastRow).length));
            setServForm(null);
            setRowsDraft([]);
            setEditTab(0);
            return;
        }
        const { names, ms, def, live } = boxData(d);
        setBoxForm({ ...d });
        setServForm(names.length ? servingFormFor(def, ms[0], names[0]) : null);
        setRowsDraft(live.map(a => ({ ...a })).sort((a, b) =>
            Number(b.onCard) - Number(a.onCard) || (a.cardOrder ?? 99) - (b.cardOrder ?? 99) || a.id - b.id));
        setEditTab(live.length ? tab : 0);
    };
    const setRow = (id: number, patch: Partial<ModelsServingAssignment>) =>
        setRowsDraft(rows => rows.map(r => (r.id === id ? { ...r, ...patch } : r)));
    // + Add version: a preset of this box's default process - same model, machine and port; its own
    // label and thinking; no setup of its own, so nothing reads it as a second load.
    const addVersion = () => {
        const parent = rowsDraft.find(r => r.isDefault && r.sharesWith == null && r.id > 0) ?? rowsDraft.find(r => r.sharesWith == null && r.id > 0);
        if (!parent) return;
        const order = Math.max(0, ...rowsDraft.filter(r => r.onCard).map(r => r.cardOrder ?? 0)) + 1;
        setRowsDraft(rows => [...rows, {
            ...parent, id: -Date.now(), isDefault: false, alias: null, notes: null, thinking: null,
            quant: null, contextTokens: null, slots: null, kvPrecision: null, mtp: null, vision: null,
            weightsGb: null, engine: null, sharedKv: null, poolTokens: null,
            onCard: true, cardLabel: "", cardOrder: order, sharesWith: parent.id,
        }]);
    };
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    const putJson = (url: string, method: string, body: unknown) =>
        fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

    const saveDesign = async (f: DesignForm) => {
        const body = { ...f, id: f.id ?? 0 };
        const res = await putJson(f.id != null ? `/api/models/serving-design/${f.id}` : "/api/models/serving-design",
            f.id != null ? "PUT" : "POST", body);
        if (!res.ok) throw new Error(await res.text());
    };
    const saveServing = async (f: ServingForm) => {
        if (f.modelId === "" || f.machineId == null) return;   // nothing chosen: the card can exist without a model
        const body = {
            id: f.servingId ?? 0, modelId: f.modelId, machineId: f.machineId,
            alias: f.alias.trim() || null, endpointPort: num(f.endpointPort), mode: f.mode,
            isDefault: true, status: "active", quant: f.quant.trim() || null,
            contextTokens: num(f.contextTokens), slots: num(f.slots),
            kvPrecision: f.kvPrecision.trim() || null, mtp: f.mtp, vision: f.vision,
            weightsGb: num(f.weightsGb), notes: f.notes.trim() || null,
            engine: f.engine.trim() || null, sharedKv: f.sharedKv, poolTokens: num(f.poolTokens),
            thinking: f.thinking.trim() || null,
            // The default's line on the card comes from the Rows tab; a brand-new default goes on it.
            ...(() => {
                const card = rowsDraft.find(r => r.id === f.servingId);
                return card
                    ? { onCard: card.onCard, cardLabel: card.cardLabel?.trim() || null, cardOrder: card.cardOrder, sharesWith: card.sharesWith }
                    : { onCard: true, cardLabel: null, cardOrder: 1, sharesWith: null };
            })(),
        };
        const res = await putJson(f.servingId != null ? `/api/models/serving/${f.servingId}` : "/api/models/serving",
            f.servingId != null ? "PUT" : "POST", body);
        if (!res.ok) throw new Error(await res.text());
        const saved: ModelsServingAssignment = await res.json();
        // One default per box: any other default on this machine steps down.
        for (const a of assignments) {
            if (a.machineId === f.machineId && a.isDefault && a.id !== saved.id && a.status === "active")
                await putJson(`/api/models/serving/${a.id}`, "PUT", { ...a, isDefault: false });
        }
        return saved.id;
    };
    // The Rows tab: every changed or new row except the default, which saveServing has just written.
    const saveRows = async (defaultId: number | null, defaultMachine: number | null) => {
        for (const r of rowsDraft) {
            if (defaultId != null && r.id === defaultId) continue;
            const body = {
                ...r, id: r.id > 0 ? r.id : 0, cardLabel: r.cardLabel?.trim() || null,
                isDefault: defaultId != null && r.machineId === defaultMachine ? false : r.isDefault,
            };
            const orig = assignments.find(a => a.id === r.id);
            if (orig && JSON.stringify({ ...orig, cardLabel: orig.cardLabel || null }) === JSON.stringify(body)) continue;
            const res = await putJson(r.id > 0 ? `/api/models/serving/${r.id}` : "/api/models/serving", r.id > 0 ? "PUT" : "POST", body);
            if (!res.ok) throw new Error(await res.text());
        }
    };
    const saveEdit = async () => {
        if (!boxForm) return;
        setSaving(true); setSaveError(null);
        try {
            await saveDesign(boxForm);
            const defaultId = servForm ? await saveServing(servForm) : null;
            await saveRows(defaultId ?? null, servForm?.machineId ?? null);
            await load();
            setBoxForm(null); setServForm(null);
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSaving(false);
        }
    };
    const deleteBox = async () => {
        if (!boxForm?.id) return;
        setSaving(true);
        try {
            await fetch(`/api/models/serving-design/${boxForm.id}`, { method: "DELETE" });
            await load();
            setBoxForm(null); setServForm(null);
        } finally { setSaving(false); }
    };

    // ---- clients & rules editor ----
    const [listOpen, setListOpen] = useState(false);
    const [listDraft, setListDraft] = useState<DesignForm[]>([]);
    const [listDeleted, setListDeleted] = useState<number[]>([]);
    const openLists = () => {
        setListDraft([...clients, ...rules].map(d => ({ ...d })));
        setListDeleted([]); setSaveError(null); setListOpen(true);
    };
    const saveLists = async () => {
        setSaving(true); setSaveError(null);
        try {
            for (const id of listDeleted) await fetch(`/api/models/serving-design/${id}`, { method: "DELETE" });
            for (const f of listDraft) await saveDesign(f);
            await load();
            setListOpen(false);
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : "Save failed");
        } finally { setSaving(false); }
    };

    // ---- layout, computed ----
    const canvasRef = useRef<HTMLDivElement>(null);
    const [w, setW] = useState(CANVAS_MIN_W);
    useLayoutEffect(() => {
        const el = canvasRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setW(Math.max(CANVAS_MIN_W, el.clientWidth)));
        ro.observe(el);
        return () => ro.disconnect();
    }, [loaded]);

    const boxEls = useRef(new Map<string, HTMLElement>());
    const [rects, setRects] = useState<Map<string, Rect>>(new Map());
    const register = (key: string) => (el: HTMLElement | null) => {
        if (el) boxEls.current.set(key, el); else boxEls.current.delete(key);
    };
    useLayoutEffect(() => {
        const next = new Map<string, Rect>();
        boxEls.current.forEach((el, key) =>
            next.set(key, { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight }));
        const same = next.size === rects.size && [...next].every(([k, r]) => {
            const o = rects.get(k);
            return o && o.left === r.left && o.top === r.top && o.width === r.width && o.height === r.height;
        });
        if (!same) setRects(next);
    });

    const keyOf = (d: ModelsServingDesign) => `box:${d.id}`;
    const widthOf = (d: ModelsServingDesign) => (splitList(d.machines).length > 1 ? GROUP_W : BOX_W);
    const placement = useMemo(() => {
        const pos = new Map<string, { x: number; y: number }>();
        const rows = [...new Set(boxes.map(b => b.row))].sort((a, b) => a - b);
        let top = FIRST_ROW_TOP;
        for (const r of rows) {
            const inRow = boxes.filter(b => b.row === r);
            inRow.forEach((b, i) => pos.set(keyOf(b), { x: ((i + 0.5) / inRow.length) * w, y: top }));
            const tallest = Math.max(...inRow.map(b => rects.get(keyOf(b))?.height ?? EST_BOX_H));
            top += tallest + ROW_GAP;
        }
        // Clients above the column of the box they ask, side by side when several share a column -
        // a lower-row box under another (the server under Node C) shares it, so grouping by box
        // stacked its client on the upper box's. Within a column: upper boxes' clients
        // first; then one sweep keeps every pill a full width apart across columns.
        const step = CLIENT_W + 30;
        const byColumn = new Map<number, { c: ModelsServingDesign; row: number }[]>();
        let orphan = 0;
        for (const c of clients) {
            const target = boxByName.get((c.asksBox ?? "").toLowerCase());
            const cx = Math.round(target ? pos.get(keyOf(target))?.x ?? w / 2 : (++orphan) * (CLIENT_W + 40));
            (byColumn.get(cx) ?? byColumn.set(cx, []).get(cx)!).push({ c, row: target?.row ?? 0 });
        }
        const placed: { key: string; x: number }[] = [];
        for (const [cx, cs] of [...byColumn].sort((a, b) => a[0] - b[0])) {
            cs.sort((a, b) => a.row - b.row || a.c.position - b.c.position);
            cs.forEach(({ c }, j) => placed.push({ key: `client:${c.id}`, x: cx + (j - (cs.length - 1) / 2) * step }));
        }
        for (let i = 1; i < placed.length; i++) placed[i].x = Math.max(placed[i].x, placed[i - 1].x + step);
        const over = placed.length ? placed[placed.length - 1].x - (w - CLIENT_W / 2) : 0;
        placed.forEach(p => pos.set(p.key, { x: over > 0 ? p.x - over : p.x, y: CLIENT_TOP }));
        return { pos, height: top - ROW_GAP + 20 };
    }, [boxes, clients, boxByName, rects, w]);

    const availOf = (ms: (LabMachine | undefined)[]) =>
        ms.length === 0 || ms.some(m => !m) ? { label: "not in Lab", color: "#757575" }
            : ms.some(m => m!.status === "incoming") ? { label: "arriving", color: "#1565c0" }
            : ms.every(m => m!.alwaysOn) ? { label: "always on", color: "#2e7d32" }
            : { label: "check first", color: "#ed6c02" };

    const boxFor = (d: ModelsServingDesign) => {
        const { names, ms, live, group, shown } = boxData(d);
        const p = placement.pos.get(keyOf(d)) ?? { x: w / 2, y: FIRST_ROW_TOP };
        const owners = splitList(d.slotOwners);
        const tile = (label: string, v: string | null, unit: string | null, color?: string) => (
            <Box key={label} sx={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: "6px", p: "5px 6px", textAlign: "center", minWidth: 0 }}>
                <Typography sx={{ fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary", lineHeight: 1.2 }}>{label}</Typography>
                {v != null
                    ? <Typography sx={{ fontSize: 15, fontWeight: 800, lineHeight: 1.25, color: color ?? "text.primary" }}>{v}<Box component="span" sx={{ fontSize: 10, fontWeight: 600, color: "text.secondary", ml: 0.4 }}>{unit}</Box></Typography>
                    : <Typography sx={{ fontSize: 11, color: "text.disabled", lineHeight: 1.7 }}>not measured</Typography>}
            </Box>
        );
        const avail = availOf(ms);
        const accent = d.accent || DEFAULT_ACCENT;
        const bw = widthOf(d);
        const hwOf = (m: LabMachine | undefined) => (m && facts.get(m.name)?.hw.join(" · ")) || "no hardware in Lab";
        return (
            <Paper key={keyOf(d)} ref={register(keyOf(d))} elevation={3} sx={{
                position: "absolute", left: p.x - bw / 2, top: p.y, width: bw,
                borderTop: `5px solid ${accent}`, borderRadius: "8px", p: "12px 14px", zIndex: 1,
            }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography sx={{ fontSize: 16, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>{d.name}</Typography>
                    <Typography sx={{ fontSize: 12, color: accent, fontWeight: 700 }}>{d.title}</Typography>
                    <Box sx={{ flex: 1 }} />
                    <Box component="span" sx={{
                        px: 1, py: "2px", borderRadius: "10px", fontSize: 10.5, fontWeight: 700,
                        color: "#fff", backgroundColor: avail.color, whiteSpace: "nowrap",
                    }}>{avail.label}</Box>
                    <IconButton size="small" title="Edit this box: its card and what it serves" onClick={() => openEdit(d)} sx={{ p: 0.25, ml: 0.25 }}>
                        <EditIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                </Box>
                {group ? (
                    <Box sx={{ display: "flex", gap: 0.75, mt: 1 }}>
                        {names.map((name, i) => {
                            const mm = ms[i];
                            const a = availOf([mm]);
                            return (
                                <Box key={name} sx={{ flex: 1, border: "1px solid rgba(0,0,0,0.15)", borderRadius: "6px", p: "6px 8px" }}>
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                                        <Typography sx={{ fontSize: 13, fontWeight: 800 }}>{name}</Typography>
                                        <Box sx={{ flex: 1 }} />
                                        <Box component="span" sx={{
                                            px: 0.75, borderRadius: "8px", fontSize: 9.5, fontWeight: 700,
                                            color: "#fff", backgroundColor: a.color, whiteSpace: "nowrap",
                                        }}>{a.label}</Box>
                                    </Box>
                                    <Typography sx={{ fontSize: 10.5, color: "text.secondary", mt: 0.25 }}>{hwOf(mm)}</Typography>
                                </Box>
                            );
                        })}
                    </Box>
                ) : (
                    <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.25 }}>{hwOf(ms[0])}</Typography>
                )}
                {shown.length > 1 && (
                    <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 0.75, mb: -0.5 }}>
                        <Typography component="button" type="button"
                            onClick={() => setFold(shown.map(a => a.id), !shown.every(a => folded.has(a.id)))}
                            sx={{ border: 0, bgcolor: "transparent", p: 0, cursor: "pointer", fontSize: 11, color: "text.secondary", textDecoration: "underline" }}>
                            {shown.every(a => folded.has(a.id)) ? "expand all" : "collapse all"}
                        </Typography>
                    </Box>
                )}
                {shown.length > 0 ? (
                    <Box sx={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: "6px", mt: 1 }}>
                        {shown.map((a, idx) => {
                            const parent = a.sharesWith != null ? assignments.find(x => x.id === a.sharesWith) : undefined;
                            const open = !folded.has(a.id);
                            const f = factsOf(parent ?? a);
                            const name = modelName.get(a.modelId) ?? `#${a.modelId}`;
                            const parentName = parent ? (parent.cardLabel || modelName.get(parent.modelId) || `#${parent.id}`) : "";
                            return (
                                <Box key={a.id} sx={{ borderTop: idx ? "1px solid rgba(0,0,0,0.08)" : "none" }}>
                                    <Box role="button" tabIndex={0} aria-expanded={open}
                                        onClick={() => setFold([a.id], open)}
                                        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFold([a.id], open); } }}
                                        sx={{ display: "flex", alignItems: "center", gap: 0.75, p: "6px 8px", cursor: "pointer", "&:hover": { bgcolor: `${accent}0d` } }}>
                                        <ExpandMoreIcon sx={{ fontSize: 18, color: "text.secondary", transform: open ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
                                        {a.cardLabel && (
                                            <Box component="span" sx={{
                                                border: `1.5px solid ${accent}`, color: accent, borderRadius: "4px", px: 0.5,
                                                fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap",
                                            }}>{a.cardLabel}</Box>
                                        )}
                                        <Typography noWrap sx={{ fontSize: 14, fontWeight: 800, lineHeight: 1.2, minWidth: 0 }}>{name}</Typography>
                                        {a.isDefault && <Typography sx={{ fontSize: 10.5, color: "text.secondary" }}>default</Typography>}
                                        <Box sx={{ flex: 1 }} />
                                        {!parent && f.tok != null
                                            ? <Typography sx={{ fontSize: 13, fontWeight: 800, color: speedColor(f.tok), whiteSpace: "nowrap" }}>
                                                {fmtInt(f.tok)}<Box component="span" sx={{ fontSize: 10, fontWeight: 600, color: "text.secondary", ml: 0.4 }}>tok/s</Box>
                                            </Typography>
                                            : <Typography sx={{ fontSize: 11, color: "text.disabled", whiteSpace: "nowrap" }}>not measured</Typography>}
                                    </Box>
                                    {open && (parent ? (
                                        <Box sx={{ px: 1, pb: 1, pl: 4 }}>
                                            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                                                {a.thinking && <Chip label={`thinking ${a.thinking}`} size="small" variant="outlined" sx={chipSx(thinkColour(a.thinking))} />}
                                                <Chip label={`same process as ${parentName}`} size="small" variant="outlined" sx={chipSx(accent)} />
                                            </Box>
                                            <Typography sx={{ fontSize: 10.5, color: "text.secondary", mt: 0.5, lineHeight: 1.4 }}>
                                                {parentName}&#39;s weights, window and streams; clients ask for this preset per request, so it adds no load.
                                                Speeds stay unmeasured until the ledger has a run at thinking {a.thinking ?? "this setting"}.
                                            </Typography>
                                        </Box>
                                    ) : (
                                        <Box sx={{ px: 1, pb: 1, pl: 4 }}>
                                            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                                                {([
                                                    [a.quant, CHIP.quant],
                                                    [a.contextTokens ? `${fmtTok(a.contextTokens)} window` : null, CHIP.window],
                                                    [`kv ${normKv(a.kvPrecision)}`, CHIP.kv],
                                                    [a.thinking ? `thinking ${a.thinking}` : null, a.thinking ? thinkColour(a.thinking) : ""],
                                                    [a.mtp ? "MTP" : null, CHIP.mtp],
                                                    [a.vision ? "vision" : null, CHIP.vision],
                                                    [a.weightsGb ? `${a.weightsGb} GB` : null, CHIP.gb],
                                                    [a.engine, CHIP.engine],
                                                    [a.endpointPort ? `port ${a.endpointPort}` : null, CHIP.port],
                                                ] as [string | null | undefined, string][])
                                                    .filter((t): t is [string, string] => !!t[0])
                                                    .map(([t, c]) => <Chip key={t} label={t} size="small" variant="outlined" sx={chipSx(c)} />)}
                                            </Box>
                                            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0.75, mt: 1 }}>
                                                {tile("active", f.active?.v ?? null, f.active?.u ?? null)}
                                                {tile("prefill", f.pp != null ? fmtInt(f.pp) : null, "tok/s")}
                                                {tile("decode", f.tok != null ? fmtInt(f.tok) : null, "tok/s", f.tok != null ? speedColor(f.tok) : undefined)}
                                                {tile(`ttft ${RUNGS.short}K`, f.ttft != null ? fmtS(f.ttft) : null, "s")}
                                            </Box>
                                            {a.slots != null && f.perStream != null && (
                                                <>
                                                    <Box sx={{ display: "flex", gap: 0.75, mt: 0.75 }}>
                                                        {Array.from({ length: a.slots }).map((_, i) => (
                                                            <Box key={i} sx={{
                                                                flex: 1, border: `2px solid ${accent}`, borderRadius: "5px", py: 0.4,
                                                                textAlign: "center", bgcolor: `${accent}12`,
                                                            }}>
                                                                <Typography sx={{ fontSize: 12, fontWeight: 800, lineHeight: 1.2 }}>{fmtTok(f.perStream!)}</Typography>
                                                                <Typography sx={{ fontSize: 10, color: "text.secondary", lineHeight: 1.2 }}>{(a.isDefault ? owners[i] : undefined) ?? (a.sharedKv ? "stream" : "slot")}</Typography>
                                                            </Box>
                                                        ))}
                                                    </Box>
                                                    <Typography sx={{ fontSize: 10.5, color: "text.secondary", mt: 0.4 }}>
                                                        {a.sharedKv
                                                            ? `each stream gets the whole window from one shared KV pool${a.poolTokens ? ` of ${fmtTok(a.poolTokens)} tokens` : ""}`
                                                            : "fixed slots: the window is split between them"}
                                                    </Typography>
                                                </>
                                            )}
                                        </Box>
                                    ))}
                                </Box>
                            );
                        })}
                    </Box>
                ) : live.length ? (
                    <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 1 }}>nothing ticked - the pencil&#39;s Rows tab chooses what this card shows</Typography>
                ) : (
                    <Typography sx={{ fontSize: 12, color: "text.disabled", mt: 1 }}>no model on the serving map</Typography>
                )}
                {shown.length > 0 && live.length > shown.length && (
                    <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.75 }}>
                        {live.length - shown.length} more serving{live.length - shown.length > 1 ? "s" : ""} on this machine, not shown ·{" "}
                        <Box component="button" type="button" onClick={() => openEdit(d, 2)}
                            sx={{ border: 0, bgcolor: "transparent", p: 0, cursor: "pointer", font: "inherit", color: "inherit", textDecoration: "underline" }}>choose</Box>
                    </Typography>
                )}
                {d.body && <Typography sx={{ fontSize: 12, mt: 1, lineHeight: 1.4 }}>{d.body}</Typography>}
            </Paper>
        );
    };

    const clientBox = (c: ModelsServingDesign) => {
        const p = placement.pos.get(`client:${c.id}`) ?? { x: w / 2, y: CLIENT_TOP };
        return (
            <Paper key={`client:${c.id}`} ref={register(`client:${c.id}`)} elevation={1} sx={{
                position: "absolute", left: p.x - CLIENT_W / 2, top: p.y, width: CLIENT_W, height: CLIENT_H, zIndex: 1,
                borderRadius: "26px", display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", border: "2px solid #455a64",
            }}>
                <Typography sx={{ fontSize: 14, fontWeight: 800, lineHeight: 1.1 }}>{c.name}</Typography>
                <Typography sx={{ fontSize: 10.5, color: "text.secondary" }}>{c.body}</Typography>
            </Paper>
        );
    };

    // ---- arrows: from the data, ends spread across each card in the order of the far ends ----
    const canvasBg = theme.palette.background.paper;
    const boxNotAlwaysOn = (b: ModelsServingDesign) => splitList(b.machines).some(n => byName.get(n.toLowerCase())?.alwaysOn === false);
    const pairs: { from: string; to: string; label: string; dashed: boolean }[] = [
        ...clients.flatMap(c => {
            const t = boxByName.get((c.asksBox ?? "").toLowerCase());
            return t ? [{ from: `client:${c.id}`, to: keyOf(t), label: "asks", dashed: false }] : [];
        }),
        ...boxes.flatMap(b => splitList(b.delegatesTo).flatMap(n => {
            const t = boxByName.get(n.toLowerCase());
            return t ? [{ from: keyOf(b), to: keyOf(t), label: "delegates, in the background", dashed: boxNotAlwaysOn(t) }] : [];
        })),
        ...boxes.flatMap(b => {
            const t = b.fallbackBox ? boxByName.get(b.fallbackBox.toLowerCase()) : undefined;
            return t ? [{ from: keyOf(b), to: keyOf(t), label: "falls back to", dashed: true }] : [];
        }),
    ];
    const centreX = (k: string) => { const r = rects.get(k); return r ? r.left + r.width / 2 : 0; };
    const spread = (key: string, side: "from" | "to") => {
        const mine = pairs.filter(e => e[side] === key)
            .sort((a, b) => centreX(side === "from" ? a.to : a.from) - centreX(side === "from" ? b.to : b.from));
        return (e: typeof pairs[number]) => (mine.indexOf(e) + 1) / (mine.length + 1);
    };
    // Where an arrow attaches follows where the far box IS:
    // below - bottom to top; above - top to bottom; beside (the rows overlap, e.g. a fallback between two
    // boxes in one row) - side to side, so it never cuts across a card.
    const edges = pairs.flatMap(e => {
        const f = rects.get(e.from), t = rects.get(e.to);
        if (!f || !t) return [];
        if (t.top >= f.top + f.height)
            return [{ ...e, side: false, x1: f.left + f.width * spread(e.from, "from")(e), y1: f.top + f.height,
                x2: t.left + t.width * spread(e.to, "to")(e), y2: t.top - 3 }];
        if (t.top + t.height <= f.top)
            return [{ ...e, side: false, x1: f.left + f.width * spread(e.from, "from")(e), y1: f.top,
                x2: t.left + t.width * spread(e.to, "to")(e), y2: t.top + t.height + 3 }];
        const leftward = t.left + t.width / 2 < f.left + f.width / 2;
        const band = Math.max(f.top, t.top) + Math.min(f.height, t.height) * 0.35;
        return [{ ...e, side: true, x1: leftward ? f.left : f.left + f.width, y1: band,
            x2: leftward ? t.left + t.width + 3 : t.left - 3, y2: band }];
    });

    const canvasH = Math.max(placement.height, 300);
    const setL = (i: number, patch: Partial<DesignForm>) => setListDraft(listDraft.map((x, j) => (j === i ? { ...x, ...patch } : x)));

    return (
        <Box sx={{ p: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                <Typography variant="h6">Serving</Typography>
                <Box sx={{ flex: 1 }} />
                <Button size="small" variant="outlined" onClick={() => openEdit(null)}>Add box</Button>
                <Button size="small" variant="outlined" onClick={openLists}>Clients &amp; rules</Button>
            </Box>
            <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 2 }}>
                How models are served, and who asks whom. Every word and number here is data: the pencil and
                the buttons edit it, and so does MCP (models_set_serving_design, models_set_serving).
            </Typography>
            {error && <Typography color="error" variant="body2" sx={{ mb: 2 }}>{error}</Typography>}

            {loaded && boxes.length === 0 ? (
                <Paper sx={{ p: 3 }}>
                    <Typography sx={{ fontSize: 14 }}>No serving design yet. Add a box for each machine or pair that serves a model.</Typography>
                </Paper>
            ) : (
                <Paper sx={{ p: 2, overflowX: "auto", bgcolor: canvasBg }}>
                    <Box ref={canvasRef} sx={{ position: "relative", height: canvasH, minWidth: CANVAS_MIN_W }}>
                        <svg width={w} height={canvasH} style={{ position: "absolute", inset: 0, zIndex: 0 }}>
                            <defs>
                                <marker id="srv-arrow" viewBox="0 0 10 10" refX="9" refY="5"
                                    markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                                    <path d="M0,0 L10,5 L0,10 z" fill="#607d8b" />
                                </marker>
                            </defs>
                            {edges.map((e, i) => {
                                const midY = (e.y1 + e.y2) / 2, midX = (e.x1 + e.x2) / 2;
                                const dd = e.side
                                    ? `M${e.x1},${e.y1} C${midX},${e.y1} ${midX},${e.y2} ${e.x2},${e.y2}`
                                    : `M${e.x1},${e.y1} C${e.x1},${midY} ${e.x2},${midY} ${e.x2},${e.y2}`;
                                return (
                                    <g key={i}>
                                        <path d={dd} fill="none" stroke="#607d8b" strokeWidth={2.5}
                                            strokeDasharray={e.dashed ? "7 6" : undefined} markerEnd="url(#srv-arrow)" />
                                        <text x={midX} y={(e.side ? midY - 8 : midY + 4)} fontSize={11} fontWeight={600}
                                            textAnchor="middle" fill="#455a64" stroke={canvasBg} strokeWidth={5}
                                            strokeLinejoin="round" style={{ paintOrder: "stroke" }}>{e.label}</text>
                                    </g>
                                );
                            })}
                        </svg>
                        {clients.map(clientBox)}
                        {boxes.map(boxFor)}
                    </Box>

                    {rules.length > 0 && (
                        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mt: 1, pt: 1.5, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                            {rules.map((r, i) => (
                                <Box key={r.id} sx={{ flex: "1 1 260px", display: "flex", gap: 1 }}>
                                    <Box sx={{
                                        minWidth: 22, height: 22, borderRadius: "11px", bgcolor: "#455a64", color: "#fff",
                                        fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
                                    }}>{i + 1}</Box>
                                    <Typography sx={{ fontSize: 12.5, lineHeight: 1.45 }}>{r.body}</Typography>
                                </Box>
                            ))}
                        </Box>
                    )}
                    <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 1.5 }}>
                        Solid arrow: always available. Dashed: only when that box is on. Each line on a card is a serving row you
                        ticked (the pencil&#39;s Rows tab, or models_set_serving onCard); click it to fold it. Active params are the
                        catalog&#39;s; prefill, decode and time to first token the ledger&#39;s latest {RUNGS.short}K-rung figures
                        for that exact setup.
                    </Typography>
                </Paper>
            )}

            <Dialog open={!!boxForm} onClose={() => !saving && setBoxForm(null)} maxWidth="sm" fullWidth>
                {boxForm && (
                    <>
                        <DialogTitle sx={{ pb: 0 }}>{boxForm.id != null ? `${boxForm.name}` : "New box"}</DialogTitle>
                        <Tabs value={editTab} onChange={(_, v) => setEditTab(v)} sx={{ px: 3 }}>
                            <Tab label="Card" />
                            <Tab label="Serving" disabled={!servForm} />
                            <Tab label="Rows" disabled={!rowsDraft.length} />
                        </Tabs>
                        <DialogContent>
                            {editTab === 0 && (
                                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mt: 0.5 }}>
                                    <TextField label="Heading" size="small" value={boxForm.name ?? ""} onChange={e => setBoxForm({ ...boxForm, name: e.target.value })} />
                                    <TextField label="Title (three or four words)" size="small" value={boxForm.title ?? ""} onChange={e => setBoxForm({ ...boxForm, title: e.target.value })} />
                                    <TextField label="Role" size="small" value={boxForm.role ?? ""} onChange={e => setBoxForm({ ...boxForm, role: e.target.value })} />
                                    <TextField label="Accent colour (#rrggbb)" size="small" value={boxForm.accent ?? ""} onChange={e => setBoxForm({ ...boxForm, accent: e.target.value })} />
                                    <Autocomplete multiple size="small" sx={{ gridColumn: "1 / -1" }}
                                        options={machines.map(m => m.name).sort((a, b) => a.localeCompare(b))}
                                        value={splitList(boxForm.machines)}
                                        onChange={(_, v) => setBoxForm({ ...boxForm, machines: v.join(", ") })}
                                        renderInput={params => <TextField {...params} label="Lab machines (a pair picks both; the first serves)" />} />
                                    <TextField label="Slot owners, left to right" size="small" value={boxForm.slotOwners ?? ""} sx={{ gridColumn: "1 / -1" }} onChange={e => setBoxForm({ ...boxForm, slotOwners: e.target.value })} />
                                    <Autocomplete multiple size="small"
                                        options={boxes.filter(b => b.id !== boxForm.id).map(b => b.name ?? "").filter(Boolean)}
                                        value={splitList(boxForm.delegatesTo)}
                                        onChange={(_, v) => setBoxForm({ ...boxForm, delegatesTo: v.join(", ") })}
                                        renderInput={params => <TextField {...params} label="Delegates to" />} />
                                    <TextField select label="Falls back to" size="small" value={boxForm.fallbackBox ?? ""} onChange={e => setBoxForm({ ...boxForm, fallbackBox: e.target.value })}>
                                        <MenuItem value="">(none)</MenuItem>
                                        {boxes.filter(b => b.id !== boxForm.id).map(b => <MenuItem key={b.id} value={b.name ?? ""}>{b.name}</MenuItem>)}
                                    </TextField>
                                    <TextField label="Row (1 = top)" size="small" type="number" value={boxForm.row} onChange={e => setBoxForm({ ...boxForm, row: Number(e.target.value) })} />
                                    <TextField label="Position in the row" size="small" type="number" value={boxForm.position} onChange={e => setBoxForm({ ...boxForm, position: Number(e.target.value) })} />
                                    <TextField label="Why it exists, one or two lines" size="small" multiline minRows={2} value={boxForm.body ?? ""} sx={{ gridColumn: "1 / -1" }} onChange={e => setBoxForm({ ...boxForm, body: e.target.value })} />
                                </Box>
                            )}
                            {editTab === 1 && servForm && (
                                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mt: 0.5 }}>
                                    <Typography sx={{ gridColumn: "1 / -1", fontSize: 12, color: "text.secondary" }}>
                                        {servForm.servingId != null ? `serving row #${servForm.servingId}` : "new serving row"} on {servForm.machineName}; saved as its default. Other rows: the Rows tab and models_set_serving
                                    </Typography>
                                    <TextField select label="Model (catalog)" size="small" value={servForm.modelId} sx={{ gridColumn: "1 / -1" }}
                                        onChange={e => setServForm({ ...servForm, modelId: Number(e.target.value) })}>
                                        {catalogSorted.map(m => (
                                            <MenuItem key={m.id} value={m.id}>
                                                {m.name}{m.activeParamsB != null ? ` · ${fmtB(m.activeParamsB)} active` : m.paramsB != null ? ` · ${fmtB(m.paramsB)}` : ""}
                                            </MenuItem>
                                        ))}
                                    </TextField>
                                    <TextField label="Quant served (e.g. EXL3-4bpw)" size="small" value={servForm.quant} onChange={e => setServForm({ ...servForm, quant: e.target.value })} />
                                    <TextField label="Engine (e.g. TensorFold v0.6.1)" size="small" value={servForm.engine} onChange={e => setServForm({ ...servForm, engine: e.target.value })} />
                                    <TextField label="Window, tokens" size="small" value={servForm.contextTokens} onChange={e => setServForm({ ...servForm, contextTokens: e.target.value })} />
                                    <TextField label="Streams / slots" size="small" value={servForm.slots} onChange={e => setServForm({ ...servForm, slots: e.target.value })} />
                                    <FormControlLabel sx={{ gridColumn: "1 / -1" }} control={<Checkbox size="small" checked={servForm.sharedKv} onChange={e => setServForm({ ...servForm, sharedKv: e.target.checked })} />}
                                        label="Each stream gets the whole window from a shared KV pool (vLLM, TensorFold). Off: the window is split between fixed slots (llama.cpp)." />
                                    <TextField label="Shared pool, tokens (optional)" size="small" value={servForm.poolTokens} onChange={e => setServForm({ ...servForm, poolTokens: e.target.value })} />
                                    <TextField label="KV precision (blank = f16)" size="small" value={servForm.kvPrecision} onChange={e => setServForm({ ...servForm, kvPrecision: e.target.value })} />
                                    <TextField label="Thinking (on, off, or effort e.g. max)" size="small" value={servForm.thinking} onChange={e => setServForm({ ...servForm, thinking: e.target.value })} />
                                    <TextField label="Weights loaded, GB" size="small" value={servForm.weightsGb} onChange={e => setServForm({ ...servForm, weightsGb: e.target.value })} />
                                    <TextField label="Port" size="small" value={servForm.endpointPort} onChange={e => setServForm({ ...servForm, endpointPort: e.target.value })} />
                                    <TextField label="Alias clients ask for (optional)" size="small" value={servForm.alias} onChange={e => setServForm({ ...servForm, alias: e.target.value })} />
                                    <TextField select label="Mode" size="small" value={servForm.mode} onChange={e => setServForm({ ...servForm, mode: e.target.value })}>
                                        <MenuItem value="resident">resident</MenuItem>
                                        <MenuItem value="on-demand">on-demand</MenuItem>
                                    </TextField>
                                    <FormControlLabel control={<Checkbox size="small" checked={servForm.mtp} onChange={e => setServForm({ ...servForm, mtp: e.target.checked })} />} label="Speculative decoding" />
                                    <FormControlLabel control={<Checkbox size="small" checked={servForm.vision} onChange={e => setServForm({ ...servForm, vision: e.target.checked })} />} label="Vision" />
                                    <TextField label="Notes" size="small" multiline minRows={2} value={servForm.notes} sx={{ gridColumn: "1 / -1" }} onChange={e => setServForm({ ...servForm, notes: e.target.value })} />
                                    <Typography sx={{ gridColumn: "1 / -1", fontSize: 11.5, color: "text.secondary" }}>
                                        Speeds are never typed: they come from the benchmark ledger for this exact quant, window, KV and MTP setup.
                                    </Typography>
                                </Box>
                            )}
                            {editTab === 2 && (
                                <Box sx={{ mt: 0.5 }}>
                                    <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1.25 }}>
                                        Tick the serving rows this card shows, one line each, top to bottom by order. Unticked rows stay on the
                                        serving map and in models_query. A preset shares another row&#39;s process - same weights, window and
                                        streams - and is asked for differently per request, like GLM Brief at thinking low.
                                    </Typography>
                                    <Box sx={{ display: "grid", gridTemplateColumns: "40px 64px 1fr 1.6fr 1fr 1.2fr", gap: 1, alignItems: "center" }}>
                                        {["Show", "Order", "Label", "Serving row", "Thinking", "Shares process with"].map(h => (
                                            <Typography key={h} sx={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "text.secondary" }}>{h}</Typography>
                                        ))}
                                        {rowsDraft.map(r => {
                                            const isDef = servForm?.servingId != null && r.id === servForm.servingId;
                                            const parent = r.sharesWith != null ? rowsDraft.find(x => x.id === r.sharesWith) : undefined;
                                            const setup = parent ? `preset of #${parent.id}`
                                                : [r.quant, r.contextTokens ? `${fmtTok(r.contextTokens)} window` : null, r.mode].filter(Boolean).join(" · ");
                                            return (
                                                <Box key={r.id} sx={{ display: "contents" }}>
                                                    <Checkbox size="small" checked={r.onCard} sx={{ p: 0.5 }}
                                                        onChange={e => setRow(r.id, {
                                                            onCard: e.target.checked,
                                                            cardOrder: e.target.checked && r.cardOrder == null
                                                                ? Math.max(0, ...rowsDraft.filter(x => x.onCard).map(x => x.cardOrder ?? 0)) + 1 : r.cardOrder,
                                                        })} />
                                                    <TextField size="small" type="number" value={r.cardOrder ?? ""} disabled={!r.onCard}
                                                        onChange={e => setRow(r.id, { cardOrder: e.target.value === "" ? null : Number(e.target.value) })} />
                                                    <TextField size="small" placeholder="optional" value={r.cardLabel ?? ""} disabled={!r.onCard}
                                                        onChange={e => setRow(r.id, { cardLabel: e.target.value })} />
                                                    <Box sx={{ minWidth: 0 }}>
                                                        <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 700 }}>
                                                            {r.id > 0 ? `#${r.id}` : "new"} {modelName.get(r.modelId) ?? `#${r.modelId}`}{r.isDefault ? " (default)" : ""}
                                                        </Typography>
                                                        <Typography noWrap sx={{ fontSize: 11, color: "text.secondary" }}>{setup || "-"}</Typography>
                                                    </Box>
                                                    <TextField size="small" placeholder="off / on / max"
                                                        value={isDef ? servForm!.thinking : (r.thinking ?? "")}
                                                        onChange={e => (isDef ? setServForm({ ...servForm!, thinking: e.target.value }) : setRow(r.id, { thinking: e.target.value || null }))} />
                                                    <TextField select size="small" value={r.sharesWith ?? ""} disabled={rowsDraft.some(x => x.sharesWith === r.id)}
                                                        onChange={e => setRow(r.id, { sharesWith: e.target.value === "" ? null : Number(e.target.value) })}>
                                                        <MenuItem value="">its own process</MenuItem>
                                                        {rowsDraft.filter(x => x.id > 0 && x.id !== r.id && x.sharesWith == null && x.machineId === r.machineId).map(x => (
                                                            <MenuItem key={x.id} value={x.id}>#{x.id} {x.cardLabel || modelName.get(x.modelId) || ""}</MenuItem>
                                                        ))}
                                                    </TextField>
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 1.5 }}>
                                        <Button size="small" variant="outlined" onClick={addVersion}
                                            disabled={!rowsDraft.some(r => r.sharesWith == null && r.id > 0)}>+ Add version</Button>
                                        <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>
                                            A preset of this box&#39;s default process, e.g. a Brief at a lower thinking effort.
                                        </Typography>
                                    </Box>
                                </Box>
                            )}
                            {saveError && <Typography color="error" sx={{ fontSize: 12, mt: 1 }}>{saveError}</Typography>}
                        </DialogContent>
                        <DialogActions>
                            {boxForm.id != null && <Button color="error" onClick={deleteBox} disabled={saving}>Delete box</Button>}
                            <Box sx={{ flex: 1 }} />
                            <Button onClick={() => setBoxForm(null)} disabled={saving}>Cancel</Button>
                            <Button variant="contained" onClick={saveEdit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                        </DialogActions>
                    </>
                )}
            </Dialog>

            <Dialog open={listOpen} onClose={() => !saving && setListOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>Clients &amp; rules</DialogTitle>
                <DialogContent>
                    <Typography sx={{ fontSize: 12, fontWeight: 700, mt: 1, mb: 1 }}>CLIENTS - who asks which box</Typography>
                    {listDraft.map((f, i) => f.kind !== "client" ? null : (
                        <Box key={`c${i}`} sx={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1fr 70px 36px", gap: 1, mb: 1 }}>
                            <TextField size="small" label="Label" value={f.name ?? ""} onChange={e => setL(i, { name: e.target.value })} />
                            <TextField size="small" label="What it is" value={f.body ?? ""} onChange={e => setL(i, { body: e.target.value })} />
                            <TextField select size="small" label="Asks" value={f.asksBox ?? ""} onChange={e => setL(i, { asksBox: e.target.value })}>
                                {boxes.map(b => <MenuItem key={b.id} value={b.name ?? ""}>{b.name}</MenuItem>)}
                            </TextField>
                            <TextField size="small" label="Order" type="number" value={f.position} onChange={e => setL(i, { position: Number(e.target.value) })} />
                            <IconButton size="small" onClick={() => { if (f.id) setListDeleted([...listDeleted, f.id]); setListDraft(listDraft.filter((_, j) => j !== i)); }}><DeleteIcon fontSize="small" /></IconButton>
                        </Box>
                    ))}
                    <Button size="small" onClick={() => setListDraft([...listDraft, { ...emptyBox(0, clients.length), kind: "client", asksBox: boxes[0]?.name ?? "" }])}>Add client</Button>
                    <Typography sx={{ fontSize: 12, fontWeight: 700, mt: 2, mb: 1 }}>RULES - the numbered lines under the picture</Typography>
                    {listDraft.map((f, i) => f.kind !== "rule" ? null : (
                        <Box key={`r${i}`} sx={{ display: "grid", gridTemplateColumns: "70px 1fr 36px", gap: 1, mb: 1 }}>
                            <TextField size="small" label="Order" type="number" value={f.position} onChange={e => setL(i, { position: Number(e.target.value) })} />
                            <TextField size="small" label="Rule" multiline value={f.body ?? ""} onChange={e => setL(i, { body: e.target.value })} />
                            <IconButton size="small" onClick={() => { if (f.id) setListDeleted([...listDeleted, f.id]); setListDraft(listDraft.filter((_, j) => j !== i)); }}><DeleteIcon fontSize="small" /></IconButton>
                        </Box>
                    ))}
                    <Button size="small" onClick={() => setListDraft([...listDraft, { ...emptyBox(0, rules.length + 1), kind: "rule" }])}>Add rule</Button>
                    {saveError && <Typography color="error" sx={{ fontSize: 12, mt: 1 }}>{saveError}</Typography>}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setListOpen(false)} disabled={saving}>Cancel</Button>
                    <Button variant="contained" onClick={saveLists} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ModelsServing;
