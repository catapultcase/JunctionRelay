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

import { Fragment, useCallback, useEffect, useState } from "react";
import {
    Accordion, AccordionDetails, AccordionSummary, Box, Button, Chip, Dialog,
    DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Select,
    Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip,
    Typography
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import AddIcon from "@mui/icons-material/Add";
import SettingsIcon from "@mui/icons-material/Settings";
import {
    ACCORDION_HEADER_BOX_SX, ACCORDION_SUMMARY_SX, ACCORDION_CONTROLS_SX,
    TABLE_CELL_SX, TABLE_HEADER_CELL_SX, TABLE_HEADER_ROW_SX,
    useColumnVisibility, ColumnPickerPopover, type ColumnDefinition
} from "@junctionrelay/styles";
import ColumnFilterButton, {
    BLANK, ColumnFilters, distinctValues, passesFilters
} from "../../components/Lab_Column_Filter";
import { usePageTitle } from "../../hooks/usePageTitle";
import {
    ModelsBenchmark, ModelsCatalogEntry, ModelsReferenceScore, fetchMachineNames,
    machineLabel,
} from "./modelsTypes";
import {
    readRefPref, refLabel, refMetricsPresent, refScoresFor, usePersistedTableState, writeRefPref
} from "./benchmarkContract";

// THE MODELS WE OWN - one row per checkpoint+quant actually held (archive or
// a box's local disk), MEASURED sizes, cited scores. Serving facts (windows,
// KV precision, slots) live on the Serving tab and in benchmark configJson,
// not here. "Runs on" is evidence, not speculation: a machine appears only
// when the ledger holds measured rows for the model there. House table
// treatment: column picker (shared hook), per-column funnels, sortable
// headers - the lab/Machines conventions.

const STATUSES = ["active", "archived", "superseded"] as const;

const STORAGE_KEY_CATALOG_COLUMNS = "models_catalog_visible_columns";
const STORAGE_KEY_CATALOG_SORT = "models_catalog_sort";
const STORAGE_KEY_CATALOG_FILTERS = "models_catalog_filters";
const CATALOG_COLUMNS: ColumnDefinition<string>[] = [
    { field: "name", label: "Name", align: "left", sortable: true },
    { field: "family", label: "Family", align: "left", sortable: true },
    { field: "params", label: "Params", align: "right", sortable: true },
    { field: "arch", label: "Architecture", align: "left", sortable: true },
    { field: "active", label: "Active (B)", align: "right", sortable: true },
    { field: "released", label: "Released", align: "left", sortable: true },
    { field: "quant", label: "Quant", align: "left", sortable: true },
    { field: "context", label: "Native ctx", align: "right", sortable: true },
    { field: "gb", label: "Size (GB)", align: "right", sortable: true },
    { field: "score", label: "Score", align: "right", sortable: true },
    { field: "runs", label: "Runs on", align: "left", sortable: true },
    { field: "storage", label: "Storage", align: "left", sortable: true, defaultHidden: true },
    { field: "category", label: "Category", align: "left", sortable: true, defaultHidden: true },
    { field: "traits", label: "Traits", align: "left", sortable: true, defaultHidden: true },
    { field: "status", label: "Status", align: "left", sortable: true, defaultHidden: true },
];

interface EditState {
    id: number | null;    // null = new entry
    name: string;
    family: string;
    paramsB: string;
    architecture: string;
    activeParamsB: string;
    releaseDate: string;
    quant: string;
    contextLength: string;
    kvCachePrecision: string;
    sizeGb: string;
    traitsJson: string;
    storageLocation: string;
    category: string;
    status: string;
    supersededById: string;
    notes: string;
}

const emptyEdit: EditState = {
    id: null, name: "", family: "", paramsB: "", architecture: "", activeParamsB: "", releaseDate: "", quant: "", contextLength: "",
    kvCachePrecision: "", sizeGb: "", traitsJson: "", storageLocation: "",
    category: "", status: "active", supersededById: "", notes: ""
};

const statusColor = (status: string): "success" | "default" | "warning" =>
    status === "active" ? "success" : status === "superseded" ? "warning" : "default";

const ModelsCatalog = () => {
    usePageTitle("Models Catalog");

    const [entries, setEntries] = useState<ModelsCatalogEntry[]>([]);
    const [refScores, setRefScores] = useState<ModelsReferenceScore[]>([]);
    // The same one-benchmark rule and remembered choice as Benchmarks/Serving.
    const [refMetric, setRefMetric] = useState<string | null>(readRefPref());
    const [error, setError] = useState<string | null>(null);
    const [edit, setEdit] = useState<EditState | null>(null);
    const [saving, setSaving] = useState(false);
    // House table treatment: per-column funnels picking from the values the
    // eye sees, and sortable headers (lab/Inventory conventions).
    const [filters, setFilters] = usePersistedTableState<ColumnFilters>(STORAGE_KEY_CATALOG_FILTERS, {});
    const [sort, setSort] = usePersistedTableState<{ col: string; desc: boolean }>(
        STORAGE_KEY_CATALOG_SORT, { col: "name", desc: false });
    // Accordion expansion - persisted, the Machines convention.
    // Which model rows have their per-quant sub-rows open.
    const [openQuants, setOpenQuants] = useState<Set<number>>(new Set());
    const toggleQuants = (id: number) => setOpenQuants(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const quantsOf = (e: ModelsCatalogEntry): { quant: string; sizeGb?: number }[] => {
        try {
            const q = JSON.parse(e.quantsJson ?? "[]");
            if (Array.isArray(q) && q.length) return q;
        } catch { /* fall through to the summary string */ }
        // Older entries carry only the summary - show the names, sizes unknown.
        return (e.quant ?? "").split("·").map(s => s.trim()).filter(Boolean).map(quant => ({ quant }));
    };
    const [tableExpanded, setTableExpanded] = useState<boolean>(() => {
        const s = localStorage.getItem("models_catalog_expanded");
        return s !== null ? JSON.parse(s) : true;
    });
    useEffect(() => {
        localStorage.setItem("models_catalog_expanded", JSON.stringify(tableExpanded));
    }, [tableExpanded]);
    const [benchmarks, setBenchmarks] = useState<ModelsBenchmark[]>([]);
    const [machines, setMachines] = useState<Map<number, string>>(new Map());
    const {
        visibleColumns, orderedColumns, hiddenColumns,
        toggleColumn, moveColumn, resetToDefault,
        anchorEl: colPickerAnchor, openPopover: openColPicker, closePopover: closeColPicker,
    } = useColumnVisibility(STORAGE_KEY_CATALOG_COLUMNS, CATALOG_COLUMNS);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/models/catalog");
            // Published, cited eval figures - catalog-domain facts about the
            // checkpoint (their own table; an older server just lacks them).
            const scoresRes = await fetch("/api/models/reference-scores");
            if (scoresRes.ok) setRefScores(await scoresRes.json());
            // "Runs on" evidence: measured ledger rows per (machine, model).
            const benchRes = await fetch("/api/models/benchmarks/recent?limit=20000");
            if (benchRes.ok) setBenchmarks(await benchRes.json());
            setMachines(await fetchMachineNames());
            if (!res.ok) throw new Error(await res.text());
            setEntries(await res.json());
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load catalog");
        }
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        const opts = refMetricsPresent(refScores);
        if ((!refMetric || !opts.includes(refMetric)) && opts.length) setRefMetric(opts[0]);
    }, [refScores, refMetric]);


    const openEdit = (entry: ModelsCatalogEntry | null) => {
        if (!entry) { setEdit(emptyEdit); return; }
        setEdit({
            id: entry.id,
            name: entry.name,
            family: entry.family ?? "",
            paramsB: entry.paramsB?.toString() ?? "",
            architecture: entry.architecture ?? "",
            activeParamsB: entry.activeParamsB?.toString() ?? "",
            releaseDate: entry.releaseDate ?? "",
            quant: entry.quant ?? "",
            contextLength: entry.contextLength?.toString() ?? "",
            kvCachePrecision: entry.kvCachePrecision ?? "",
            sizeGb: entry.sizeGb?.toString() ?? "",
            traitsJson: entry.traitsJson ?? "",
            storageLocation: entry.storageLocation ?? "",
            category: entry.category ?? "",
            status: entry.status,
            supersededById: entry.supersededById?.toString() ?? "",
            notes: entry.notes ?? ""
        });
    };

    const save = async () => {
        if (!edit) return;
        setSaving(true);
        try {
            const body = {
                id: edit.id ?? 0,
                name: edit.name.trim(),
                family: edit.family || null,
                paramsB: edit.paramsB ? Number(edit.paramsB) : null,
                architecture: edit.architecture || null,
                activeParamsB: edit.activeParamsB ? Number(edit.activeParamsB) : null,
                releaseDate: edit.releaseDate.trim() || null,
                quant: edit.quant || null,
                contextLength: edit.contextLength ? Number(edit.contextLength) : null,
                kvCachePrecision: edit.kvCachePrecision || null,
                sizeGb: edit.sizeGb ? Number(edit.sizeGb) : null,
                traitsJson: edit.traitsJson || null,
                storageLocation: edit.storageLocation || null,
                category: edit.category || null,
                status: edit.status,
                supersededById: edit.supersededById ? Number(edit.supersededById) : null,
                notes: edit.notes || null
            };
            const res = await fetch(
                edit.id === null ? "/api/models/catalog" : `/api/models/catalog/${edit.id}`,
                {
                    method: edit.id === null ? "POST" : "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body)
                });
            if (!res.ok) throw new Error(await res.text());
            setEdit(null);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save");
        } finally {
            setSaving(false);
        }
    };

    const field = (label: string, key: keyof EditState, opts?: { multiline?: boolean; helper?: string }) => (
        <TextField
            label={label}
            value={edit ? String(edit[key] ?? "") : ""}
            onChange={(e) => setEdit(prev => prev ? { ...prev, [key]: e.target.value } : prev)}
            size="small"
            fullWidth
            multiline={opts?.multiline}
            minRows={opts?.multiline ? 2 : undefined}
            helperText={opts?.helper}
        />
    );

    const scoreOf = (id: number) => refMetric ? refScoresFor(refScores, refMetric).get(id)?.value : undefined;
    // Runs on: EVIDENCE ONLY - machines the ledger holds measured rows for.
    const runsOn = (id: number): string => {
        const names = new Set<string>();
        for (const b of benchmarks)
            if (b.modelId === id && b.machineId != null)
                names.add(machineLabel(machines, b));
        return [...names].sort().join(" · ") || "—";
    };
    const traitsOf = (e: ModelsCatalogEntry): string => {
        try { return (JSON.parse(e.traitsJson ?? "[]") as string[]).join(" · ") || "—"; }
        catch { return "—"; }
    };
    // Architecture and active params are two columns, not one string:
    // "35B · MoE · 3B" reads as three sortable facts, and a dense shows a dash for active.
    // What each cell READS AS - filters offer exactly these values.
    const cellText = (e: ModelsCatalogEntry, field: string): string =>
        field === "name" ? e.name
            : field === "family" ? (e.family ?? "—")
            : field === "params" ? (e.paramsB != null ? `${e.paramsB}B` : "—")
            : field === "arch" ? (e.architecture ?? "—")
            : field === "active" ? (e.activeParamsB != null ? `${e.activeParamsB}B` : "—")
            : field === "released" ? (e.releaseDate ?? "—")
            : field === "quant" ? (e.quant ?? "—")
            : field === "context" ? (e.contextLength != null ? `${Math.round(e.contextLength / 1024)}K` : "—")
            : field === "gb" ? (e.sizeGb != null ? e.sizeGb.toFixed(2) : "—")
            : field === "score" ? (scoreOf(e.id)?.toString() ?? "—")
            : field === "runs" ? runsOn(e.id)
            : field === "storage" ? (e.storageLocation ?? "—")
            : field === "category" ? (e.category ?? "—")
            : field === "traits" ? traitsOf(e)
            : field === "status" ? e.status
            : "";
    // What a FILTER matches, where it differs from what the cell shows: Released filters by
    // month - the cell keeps the full date, the filter offers YYYY-MM under
    // year headers, so "August" and "2026" are one click each.
    const filterText = (e: ModelsCatalogEntry, field: string): string =>
        field === "released" ? (e.releaseDate?.slice(0, 7) ?? "") : cellText(e, field);
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthLabel = (v: string): string => {
        const m = /^(\d{4})-(\d{2})$/.exec(v);
        return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : v;
    };
    const sortVal = (e: ModelsCatalogEntry, col: string): number | string => {
        switch (col) {
            case "params": return e.paramsB ?? -1;
            case "arch": return (e.architecture ?? "").toLowerCase();
            case "active": return e.activeParamsB ?? -1;
            case "context": return e.contextLength ?? -1;
            case "gb": return e.sizeGb ?? -1;
            case "score": return scoreOf(e.id) ?? -1;
            default: return cellText(e, col).toLowerCase();
        }
    };
    const shown = entries
        .filter(e => passesFilters(e, filters, filterText))
        .sort((a, b) => {
            const x = sortVal(a, sort.col), y = sortVal(b, sort.col);
            const d = typeof x === "number" && typeof y === "number"
                ? x - y : String(x).localeCompare(String(y));
            return sort.desc ? -d : d;
        });
    const NO_FILTER = new Set(["gb", "score", "context", "params"]);
    const labelFor = (f: string) =>
        f === "score" ? (refMetric ? refLabel(refMetric) : "Score")
            : CATALOG_COLUMNS.find(c => c.field === f)?.label ?? f;
    const alignFor = (f: string) => CATALOG_COLUMNS.find(c => c.field === f)?.align ?? "left";
    const sortGlyph = (col: string) => (
        <Box component="span" sx={{ fontSize: 9, ml: "2px", color: sort.col === col ? "text.primary" : "rgba(0,0,0,0.26)" }}>
            {sort.col === col ? (sort.desc ? "▾" : "▴") : "↕"}
        </Box>
    );

    return (
        <Box sx={{ padding: 2 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Catalog</Typography>

            {error && <Typography color="error" variant="body2" sx={{ mb: 2 }}>{error}</Typography>}

            <Accordion expanded={tableExpanded} onChange={() => setTableExpanded(!tableExpanded)}
                TransitionProps={{ timeout: tableExpanded ? undefined : 0 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={ACCORDION_SUMMARY_SX}>
                    <Box sx={ACCORDION_HEADER_BOX_SX}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                            Models we own ({entries.length})
                        </Typography>
                        <Box sx={ACCORDION_CONTROLS_SX} onClick={(e) => e.stopPropagation()}>
                            {refMetricsPresent(refScores).length > 0 && (
                                <Select size="small" value={refMetric ?? ""}
                                    onChange={(e: { target: { value: string } }) => { setRefMetric(e.target.value); writeRefPref(e.target.value); }}
                                    sx={{ height: 32, fontSize: 12.5, minWidth: 170 }}>
                                    {refMetricsPresent(refScores).map(m => (
                                        <MenuItem key={m} value={m} sx={{ fontSize: 12.5 }}>{refLabel(m)}</MenuItem>
                                    ))}
                                </Select>
                            )}
                            <IconButton size="small" onClick={openColPicker}>
                                <SettingsIcon fontSize="small" />
                            </IconButton>
                            <Button startIcon={<AddIcon />} variant="contained" color="primary" size="small"
                                onClick={() => openEdit(null)}>
                                Add Model
                            </Button>
                        </Box>
                    </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 0 }}>
                {entries.length === 0 && !error ? (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                        The models we own - one row per checkpoint+quant, measured sizes. No entries yet.
                    </Typography>
                ) : (
                // Too many columns scroll INSIDE this box rather than spilling past
                // the page. minWidth 0 lets the flex child shrink so the
                // scrollbar appears instead of the page widening.
                <Box sx={{ overflowX: "auto", maxWidth: "100%", minWidth: 0 }}>
                <Table size="small" sx={{ width: "max-content", minWidth: "100%", "& th, & td": { whiteSpace: "nowrap" } }}>
                    <TableHead>
                        <TableRow sx={TABLE_HEADER_ROW_SX}>
                            {visibleColumns.map((f: string) => (
                                <TableCell key={f} align={alignFor(f) as "left" | "right"}
                                    onClick={() => setSort(prev => ({ col: f, desc: prev.col === f ? !prev.desc : false }))}
                                    sx={{ ...TABLE_HEADER_CELL_SX, cursor: "pointer", userSelect: "none" }}>
                                    {labelFor(f)}{sortGlyph(f)}
                                    {!NO_FILTER.has(f) && (
                                        <ColumnFilterButton label={labelFor(f)}
                                            values={f === "released"
                                                ? distinctValues(entries, e => filterText(e, f)).sort((a, b) => a === BLANK ? 1 : b === BLANK ? -1 : b.localeCompare(a))
                                                : distinctValues(entries, e => filterText(e, f))}
                                            selected={filters[f] ?? []}
                                            groupOf={f === "released" ? (v => v === BLANK ? null : v.slice(0, 4)) : undefined}
                                            labelOf={f === "released" ? monthLabel : undefined}
                                            onChange={next => setFilters(fl => ({ ...fl, [f]: next }))} />
                                    )}
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {shown.map((e) => (
                            <Fragment key={e.id}>
                            <TableRow hover sx={{ cursor: "pointer" }} onClick={() => openEdit(e)}>
                                {visibleColumns.map((f: string) => (
                                    <TableCell key={f} align={alignFor(f) as "left" | "right"}
                                        sx={f === "name" ? { ...TABLE_CELL_SX, fontWeight: 600 } : { ...TABLE_CELL_SX, color: "text.secondary" }}>
                                        {f === "name" ? (
                                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                                {quantsOf(e).length > 1 ? (
                                                    <Box component="span" onClick={ev => { ev.stopPropagation(); toggleQuants(e.id); }}
                                                        sx={{ display: "flex", cursor: "pointer", color: "text.secondary" }}>
                                                        {openQuants.has(e.id) ? <ExpandMoreIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
                                                    </Box>
                                                ) : <Box component="span" sx={{ width: 20 }} />}
                                                {e.name}
                                            </Box>
                                        ) : f === "quant" ? (
                                            quantsOf(e).length > 1
                                                ? `${quantsOf(e).length} quants`
                                                : (quantsOf(e)[0]?.quant ?? "—")
                                        ) : f === "score" ? (() => {
                                            const ref = refMetric ? refScoresFor(refScores, refMetric).get(e.id) : undefined;
                                            return ref ? (
                                                <Tooltip arrow placement="top" title={
                                                    `${refLabel(ref.metric)}: ${ref.value} — published for the full-precision checkpoint, not any served quant. Source: ${ref.source ?? "unknown"}`}>
                                                    <Box component="span" sx={{ cursor: "help", whiteSpace: "nowrap", borderBottom: "1px dotted rgba(0,0,0,0.3)" }}>
                                                        {ref.value}
                                                    </Box>
                                                </Tooltip>
                                            ) : "—";
                                        })()
                                        : f === "status" ? <Chip label={e.status} size="small" color={statusColor(e.status)} />
                                        : cellText(e, f)}
                                    </TableCell>
                                ))}
                            </TableRow>
                            {openQuants.has(e.id) && quantsOf(e).map(q => (
                                <TableRow key={`${e.id}-${q.quant}`} sx={{ bgcolor: "action.hover" }}>
                                    {visibleColumns.map((f: string) => (
                                        <TableCell key={f} align={alignFor(f) as "left" | "right"}
                                            sx={{ ...TABLE_CELL_SX, color: "text.secondary", fontSize: 12.5, py: "6px" }}>
                                            {f === "name" ? <Box component="span" sx={{ pl: 3.5 }}>{q.quant}</Box>
                                                : f === "gb" ? (q.sizeGb != null ? q.sizeGb.toFixed(2) : "—")
                                                : ""}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                            </Fragment>
                        ))}
                    </TableBody>
                </Table>
                </Box>
                )}
                </AccordionDetails>
            </Accordion>

            <ColumnPickerPopover
                allColumns={CATALOG_COLUMNS}
                orderedColumns={orderedColumns}
                hiddenColumns={hiddenColumns}
                anchorEl={colPickerAnchor}
                onClose={closeColPicker}
                onToggle={toggleColumn}
                onMove={moveColumn}
                onReset={resetToDefault}
            />

            <Dialog open={edit !== null} onClose={() => setEdit(null)} maxWidth="sm" fullWidth>
                <DialogTitle>{edit?.id === null ? "Add model" : "Edit model"}</DialogTitle>
                <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "8px !important" }}>
                    {field("Name (serving id)", "name", { helper: "The MODEL, not a serving id: qwen3.8-27b. Quant, window and MTP are ways of RUNNING it and live on the serving map" })}
                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                        {field("Family", "family")}
                        {field("Params (B)", "paramsB")}
                        <TextField
                            select label="Architecture" size="small"
                            value={edit?.architecture ?? ""}
                            onChange={(e) => setEdit(prev => prev ? { ...prev, architecture: e.target.value } : prev)}
                            helperText="What predicts how it serves"
                        >
                            <MenuItem value="">—</MenuItem>
                            <MenuItem value="Dense">Dense</MenuItem>
                            <MenuItem value="MoE">MoE</MenuItem>
                            <MenuItem value="Hybrid">Hybrid</MenuItem>
                        </TextField>
                        {field("Active params (B) — MoE only", "activeParamsB", { helper: "35B-A3B → 3" })}
                        {field("Release date", "releaseDate", { helper: "Upstream release, YYYY-MM-DD" })}
                        {field("Quant", "quant")}
                        {field("Context (tokens)", "contextLength")}
                        {field("KV cache precision", "kvCachePrecision")}
                        {field("Size GB — measured, never estimated", "sizeGb")}
                    </Box>
                    {field("Traits (JSON array)", "traitsJson", { helper: '["vision","mtp"]' })}
                    {field("Storage location", "storageLocation", { helper: "Stays local — never synced to cloud" })}
                    {field("Category", "category", { helper: "Workload class: Agentic Coding, General AI, Vision, Utility… — groups the Benchmarks tables" })}
                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                        <TextField
                            select label="Status" size="small"
                            value={edit?.status ?? "active"}
                            onChange={(e) => setEdit(prev => prev ? { ...prev, status: e.target.value } : prev)}
                        >
                            {STATUSES.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                        </TextField>
                        <TextField
                            select label="Superseded by" size="small"
                            value={edit?.supersededById ?? ""}
                            onChange={(e) => setEdit(prev => prev ? { ...prev, supersededById: e.target.value } : prev)}
                        >
                            <MenuItem value="">—</MenuItem>
                            {entries.filter(e => e.id !== edit?.id).map(e =>
                                <MenuItem key={e.id} value={e.id.toString()}>{e.name}</MenuItem>)}
                        </TextField>
                    </Box>
                    {field("Notes", "notes", { multiline: true })}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEdit(null)}>Cancel</Button>
                    <Button variant="contained" onClick={save} disabled={saving || !edit?.name.trim()}>
                        {saving ? "Saving…" : "Save"}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ModelsCatalog;
