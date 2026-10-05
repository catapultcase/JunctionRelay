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

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
    Box, Typography, CircularProgress, Chip, Paper, Tooltip, IconButton, Button,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel,
    Link as MuiLink, useTheme
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import FilterAltOffIcon from "@mui/icons-material/FilterAltOff";
import { usePageTitle } from "../../hooks/usePageTitle";
import {
    ColumnFilterButton, distinctValues, passesFilters, activeFilterCount,
    type ColumnFilters,
} from "../../components/Lab_Column_Filter";
import { getPriceColorMode, refreshPriceColorMode, vsPaidColor, movementColor } from "../../components/Lab_Display_Settings";
import LabPriceColorsToggle from "../../components/Lab_PriceColors_Toggle";
import { errorMessage } from '../../utils/errors';

// One row of the feed, as returned by /api/lab/market-values/recent
interface ObservationRow {
    id: number;
    componentId: number;
    componentLabel?: string | null;
    componentType?: string | null;
    vendor?: string | null;
    msrp?: number | null;
    purchasePrice?: number | null;
    acquiredAt?: string | null;
    value: number;
    capturedAt: string;
    source?: string | null;
    sourceUrl?: string | null;
    notes?: string | null;
    priorValue?: number | null;
    priorCapturedAt?: string | null;
    series: number[];
    // Same-day observations from other vendors (dearer than this row, which is the
    // day's effective/cheapest); they nest under the row, expandable.
    alternates?: {
        id: number;
        value: number;
        source?: string | null;
        sourceUrl?: string | null;
        capturedAt: string;
        notes?: string | null;
    }[];
}

// One shared column template for every day's table — see the colgroup below.
// Order: Component, Type, Vendor, MSRP, Paid, Prior, New, Delta, Trend, actions.
const COLUMN_WIDTHS = ["26%", "8%", "10%", "8%", "8%", "11%", "11%", "8%", "112px", "56px"];

type SortKey = "component" | "type" | "vendor" | "msrp" | "paid" | "prior" | "value" | "delta";

// Columns in render order; `key` null means the column carries no sortable value
// (the sparkline and the actions cell).
const COLUMNS: { key: SortKey | null; label: string; align?: "right" }[] = [
    { key: "component", label: "Component" },
    { key: "type", label: "Type" },
    { key: "vendor", label: "Vendor" },
    { key: "msrp", label: "MSRP", align: "right" },
    { key: "paid", label: "Paid", align: "right" },
    { key: "prior", label: "Prior Observation", align: "right" },
    { key: "value", label: "New Observation", align: "right" },
    { key: "delta", label: "Delta", align: "right" },
    { key: null, label: "Trend" },
    { key: null, label: "", align: "right" },
];

// Columns you pick values from. Money columns are answered by sorting instead - a list
// of every distinct price helps nobody.
const FILTERABLE: SortKey[] = ["component", "type", "vendor"];

const STORAGE_KEY_OBSERVATION_FILTERS = "lab_observations_filters";

const money = (v?: number | null) =>
    v === null || v === undefined ? "—" : `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Two kinds of date come through here and they must NOT share a formatter:
// - acquiredAt / listPriceDate are CALENDAR DATES (stored as midnight); slice them raw —
//   timezone-converting a midnight date shifts the purchase to the previous day.
// - capturedAt / priorCapturedAt are UTC INSTANTS (serialized without a Z), so an evening
//   observation slices to tomorrow's date; parse as UTC and render the LOCAL day.
const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : null);

const localDay = (iso?: string | null) => {
    if (!iso) return null;
    const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
    if (isNaN(d.getTime())) return iso.slice(0, 10);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// "2026-08-12" → "Aug 12, 2026" for the group headers; keeps ISO in cells.
const dayTitle = (isoDay: string) => {
    const d = new Date(`${isoDay}T00:00:00`);
    return isNaN(d.getTime())
        ? isoDay
        : d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
};

// Tiny inline series - the WHOLE series, starting at Paid when known; no axes. The
// numbers it summarises sit in the adjacent cells, so it carries no information that
// is only visual. Its colour is the trend of the last step (see trendColor below).
const Sparkline = ({ values, color }: { values: number[]; color: string }) => {
    const W = 96, H = 24, PAD = 2;
    if (values.length === 0) return <Typography variant="body2" color="text.disabled">—</Typography>;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1; // flat series draws a midline rather than dividing by zero
    const x = (i: number) => values.length === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (values.length - 1);
    const y = (v: number) => H - PAD - ((v - min) / span) * (H - 2 * PAD);
    const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const last = values[values.length - 1];

    return (
        <svg width={W} height={H} role="img" aria-label={`${values.length} points, ${money(min)} to ${money(max)}`}>
            {values.length > 1 && (
                <polyline points={points} fill="none" stroke={color} strokeWidth={1.5}
                    strokeLinecap="round" strokeLinejoin="round" />
            )}
            <circle cx={x(values.length - 1)} cy={y(last)} r={2.5} fill={color} />
        </svg>
    );
};

// Delta means ONE thing on every row: this observation vs what was PAID. It never
// switches to a vs-prior basis - a column whose meaning changes per row reads as
// randomly-colored. Market movement is already visible in the Prior/New
// columns and the sparkline. Shared by the cell and the sort so they cannot disagree.
const deltaOf = (r: ObservationRow): number | null =>
    (r.purchasePrice === null || r.purchasePrice === undefined) ? null : r.value - r.purchasePrice;

const DeltaCell = ({ row }: { row: ObservationRow }) => {
    const paid = row.purchasePrice;
    const delta = deltaOf(row);
    if (paid === null || paid === undefined || delta === null)
        return <Typography variant="body2" color="text.disabled">—</Typography>;

    const pct = paid !== 0 ? (delta / paid) * 100 : null;
    const color = vsPaidColor(delta, getPriceColorMode()) ?? "text.secondary";
    const sign = delta > 0 ? "+" : "";

    return (
        <Box>
            <Typography variant="body2" sx={{ color, fontWeight: 500 }}>
                {sign}{money(delta)}
            </Typography>
            <Typography variant="caption" sx={{ color }}>
                {pct !== null ? `${sign}${pct.toFixed(1)}% ` : ""}vs paid
            </Typography>
        </Box>
    );
};

const Observations = () => {
    usePageTitle("Homelab Observations");
    const navigate = useNavigate();
    const theme = useTheme();

    // The sparkline's last step is market movement, so its colour follows the price-color
    // lens: neutral under "verdict" (a market move carries no judgment), red-up/green-down
    // under "price watch". The signed delta in the adjacent cell carries the same fact as
    // text, so colour is never the only encoding.
    const trendColor = (vals: number[]) => {
        if (vals.length < 2) return theme.palette.text.secondary;
        const token = movementColor(vals[vals.length - 1] - vals[vals.length - 2], getPriceColorMode());
        return token === "error.main" ? theme.palette.error.main
            : token === "success.main" ? theme.palette.success.main
            : theme.palette.text.secondary;
    };

    const [rows, setRows] = useState<ObservationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Filtering lives on the column headers now, not on a row of type chips: the chips
    // could only ever filter ONE column, and they only listed the types that happened to
    // be in the feed - so "which vendor" or "which component" had no answer at all.
    const [filters, setFilters] = useState<ColumnFilters>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_OBSERVATION_FILTERS);
            return stored ? JSON.parse(stored) : {};
        } catch {
            return {};
        }
    });
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_OBSERVATION_FILTERS, JSON.stringify(filters));
    }, [filters]);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());
    const [sortKey, setSortKey] = useState<SortKey | null>(null);
    const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

    // Sorting applies WITHIN each day, so the feed stays a chronology of batches;
    // clicking the same header again flips direction.
    const handleSort = useCallback((k: SortKey) => {
        setSortKey(prev => {
            if (prev === k) { setSortDir(d => (d === "asc" ? "desc" : "asc")); return prev; }
            setSortDir("asc");
            return k;
        });
    }, []);

    const sortRows = useCallback((list: ObservationRow[]) => {
        if (!sortKey) return list;
        const val = (r: ObservationRow): string | number | null | undefined => {
            switch (sortKey) {
                case "component": return (r.componentLabel || "").toLowerCase();
                case "type": return (r.componentType || "").toLowerCase();
                case "vendor": return (r.vendor || "").toLowerCase();
                case "msrp": return r.msrp;
                case "paid": return r.purchasePrice;
                case "prior": return r.priorValue;
                case "value": return r.value;
                case "delta": return deltaOf(r);
            }
        };
        return [...list].sort((a, b) => {
            const av = val(a), bv = val(b);
            // Blanks sink to the bottom in BOTH directions — a column of dashes
            // should never push the real data off the top of the group.
            const aEmpty = av === null || av === undefined || av === "";
            const bEmpty = bv === null || bv === undefined || bv === "";
            if (aEmpty && bEmpty) return 0;
            if (aEmpty) return 1;
            if (bEmpty) return -1;
            const cmp = typeof av === "string"
                ? av.localeCompare(bv as string)
                : (av as number) - (bv as number);
            return sortDir === "asc" ? cmp : -cmp;
        });
    }, [sortKey, sortDir]);

    const toggleExpanded = useCallback((id: number) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/lab/market-values/recent?limit=200");
            if (!res.ok) throw new Error(await res.text());
            setRows(await res.json());
            setError(null);
        } catch (e) {
            setError(errorMessage(e) || "Failed to load observations");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Sync the price-color lens from the settings DB; re-render if it changed.
    const [, setColorModeTick] = useState(0);
    useEffect(() => { refreshPriceColorMode().then(() => setColorModeTick(t => t + 1)); }, []);

    // The ledger's correction path: removes ONE observation so the right figure can be
    // re-recorded. Neighbouring rows' prior/series change with it, so refetch rather
    // than splicing the deleted row out locally.
    const handleDelete = useCallback(async (componentId: number, valueId: number, value: number, capturedAt: string, label: string) => {
        if (!window.confirm(`Delete the ${money(value)} observation from ${localDay(capturedAt)} for ${label}? This is the correction path — re-record the right figure afterwards if one exists.`)) return;
        const res = await fetch(`/api/lab/components/${componentId}/market-values/${valueId}`, { method: "DELETE" });
        if (res.ok) load();
        else setError(await res.text() || "Delete failed");
    }, [load]);

    const cellText = useCallback((r: ObservationRow, field: string): string => {
        switch (field) {
            case "component": return r.componentLabel || "";
            case "type": return r.componentType || "";
            case "vendor": return r.vendor || "";
            default: return "";
        }
    }, []);

    const filtered = useMemo(
        () => rows.filter(r => passesFilters(r, filters, cellText)),
        [rows, filters, cellText]);

    // API is already newest-first; bucket by capture day, preserving that order.
    const byDay = useMemo(() => {
        const groups: { day: string; rows: ObservationRow[] }[] = [];
        for (const r of filtered) {
            const d = localDay(r.capturedAt) ?? "unknown";
            const last = groups[groups.length - 1];
            if (last && last.day === d) last.rows.push(r);
            else groups.push({ day: d, rows: [r] });
        }
        return groups;
    }, [filtered]);

    return (
        <Box sx={{ padding: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
                <Typography variant="h6">Observations</Typography>
                <LabPriceColorsToggle onChanged={() => setColorModeTick(t => t + 1)} />
                {!loading && rows.length > 0 && (
                    <Chip
                        label={activeFilterCount(filters) > 0 ? `${filtered.length} of ${rows.length}` : `${rows.length} recent`}
                        size="small"
                    />
                )}
                {activeFilterCount(filters) > 0 && (
                    <Button
                        size="small" variant="text"
                        startIcon={<FilterAltOffIcon fontSize="small" />}
                        onClick={() => setFilters({})}
                        sx={{ textTransform: "none" }}
                    >
                        Clear filters
                    </Button>
                )}
            </Box>

            {loading ? (
                <Box sx={{ display: "flex", justifyContent: "center", padding: 3 }}>
                    <CircularProgress size={24} />
                </Box>
            ) : error ? (
                <Typography color="error" sx={{ py: 4, textAlign: "center" }}>{error}</Typography>
            ) : rows.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: "center" }}>
                    No market observations recorded yet — nothing has been priced up. Ask your
                    assistant for a price round, or record one here. (No assistant wired in yet?
                    Settings → Lab MCP Endpoint.)
                </Typography>
            ) : (
                // One table per day batch, each with its own header row, so a batch
                // scrolled into view never needs the top of the page to read.
                byDay.map(group => (
                    <Paper key={group.day} sx={{ mb: 2 }}>
                        <Box sx={{ px: 2, py: 1, display: "flex", alignItems: "baseline", gap: 1 }}>
                            <Typography variant="subtitle1" fontWeight={600}>{dayTitle(group.day)}</Typography>
                            <Typography variant="caption" color="text.secondary">
                                {group.rows.length} observation{group.rows.length === 1 ? "" : "s"}
                            </Typography>
                        </Box>
                        <TableContainer>
                            {/* Each day is its own table, so the columns would size themselves
                                independently and stagger down the page. A fixed layout plus one
                                shared colgroup makes every day's grid identical. */}
                            <Table size="small" sx={{ tableLayout: "fixed", minWidth: 1100 }}>
                                <colgroup>
                                    {COLUMN_WIDTHS.map((w, i) => <col key={i} style={{ width: w }} />)}
                                </colgroup>
                                <TableHead>
                                    <TableRow sx={{ bgcolor: "action.hover" }}>
                                        {COLUMNS.map((c, i) => (
                                            <TableCell key={i} align={c.align} sortDirection={sortKey && sortKey === c.key ? sortDir : false}>
                                                <Box sx={{ display: "inline-flex", alignItems: "center" }}>
                                                    {c.key ? (
                                                        <TableSortLabel
                                                            active={sortKey === c.key}
                                                            direction={sortKey === c.key ? sortDir : "asc"}
                                                            onClick={() => handleSort(c.key!)}
                                                        >
                                                            {c.label}
                                                        </TableSortLabel>
                                                    ) : c.label}
                                                    {c.key && FILTERABLE.includes(c.key) && (
                                                        <ColumnFilterButton
                                                            label={c.label}
                                                            // Values come from the whole feed, not this day's
                                                            // slice, so the same options are there every day.
                                                            values={distinctValues(rows, (r) => cellText(r, c.key!))}
                                                            selected={filters[c.key] ?? []}
                                                            onChange={(next) => setFilters(prev => ({ ...prev, [c.key!]: next }))}
                                                        />
                                                    )}
                                                </Box>
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sortRows(group.rows).map(r => {
                                        // The whole series, starting at Paid when known — derived
                                        // here at render time, never stored in the ledger.
                                        const sparkValues = r.purchasePrice != null
                                            ? [r.purchasePrice, ...r.series]
                                            : r.series;
                                        return (
                                        <React.Fragment key={r.id}>
                                            <TableRow
                                                hover
                                                sx={{ cursor: "pointer" }}
                                                onClick={() => navigate(`/homelab/component/${r.componentId}`)}
                                            >
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight={500}>
                                                        {r.componentLabel || `Component ${r.componentId}`}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {r.source}
                                                        {r.sourceUrl && (
                                                            <>
                                                                {r.source ? " · " : ""}
                                                                <MuiLink
                                                                    href={r.sourceUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    source
                                                                </MuiLink>
                                                            </>
                                                        )}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>
                                                        {r.componentType || "—"}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>
                                                        {r.vendor || "—"}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">{money(r.msrp)}</TableCell>
                                                <TableCell align="right">
                                                    <Typography variant="body2">{money(r.purchasePrice)}</Typography>
                                                    {r.purchasePrice != null && day(r.acquiredAt) && (
                                                        <Typography variant="caption" color="text.secondary">
                                                            {day(r.acquiredAt)}
                                                        </Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell align="right">
                                                    {r.priorValue !== null && r.priorValue !== undefined ? (
                                                        <>
                                                            <Typography variant="body2">{money(r.priorValue)}</Typography>
                                                            <Typography variant="caption" color="text.secondary">
                                                                {localDay(r.priorCapturedAt) || ""}
                                                            </Typography>
                                                        </>
                                                    ) : (
                                                        <Typography variant="body2" color="text.disabled">—</Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0.75 }}>
                                                        {(r.alternates?.length ?? 0) > 0 && (
                                                            <Chip
                                                                size="small"
                                                                label={`+${r.alternates!.length}`}
                                                                variant={expanded.has(r.id) ? "filled" : "outlined"}
                                                                onClick={(e) => { e.stopPropagation(); toggleExpanded(r.id); }}
                                                                sx={{ height: 20, fontSize: "0.7rem" }}
                                                            />
                                                        )}
                                                        <Typography variant="body2" fontWeight={500}>{money(r.value)}</Typography>
                                                    </Box>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {localDay(r.capturedAt)}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right"><DeltaCell row={r} /></TableCell>
                                                <TableCell>
                                                    <Tooltip title={r.notes || `${r.series.length} observation${r.series.length === 1 ? "" : "s"}${r.purchasePrice != null ? ", from paid" : ""} on record`}>
                                                        <Box sx={{ display: "inline-flex" }}>
                                                            <Sparkline values={sparkValues} color={trendColor(sparkValues)} />
                                                        </Box>
                                                    </Tooltip>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Tooltip title="Delete observation (correction path)">
                                                        <IconButton
                                                            size="small"
                                                            onClick={(e) => { e.stopPropagation(); handleDelete(r.componentId, r.id, r.value, r.capturedAt, r.componentLabel || `component ${r.componentId}`); }}
                                                        >
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </TableCell>
                                            </TableRow>
                                            {expanded.has(r.id) && (r.alternates ?? []).map(a => (
                                                <TableRow key={`alt-${a.id}`} sx={{ bgcolor: "action.hover" }}>
                                                    <TableCell sx={{ pl: 4 }}>
                                                        <Typography variant="body2" color="text.secondary">
                                                            ↳ {a.source || "observation"}
                                                            {a.sourceUrl && (
                                                                <>
                                                                    {" · "}
                                                                    <MuiLink href={a.sourceUrl} target="_blank" rel="noopener noreferrer">
                                                                        source
                                                                    </MuiLink>
                                                                </>
                                                            )}
                                                        </Typography>
                                                        {a.notes && (
                                                            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                                                {a.notes}
                                                            </Typography>
                                                        )}
                                                    </TableCell>
                                                    <TableCell /><TableCell /><TableCell align="right" /><TableCell align="right" /><TableCell align="right" />
                                                    <TableCell align="right">
                                                        <Typography variant="body2" color="text.secondary">{money(a.value)}</Typography>
                                                        <Typography variant="caption" color="text.secondary">{localDay(a.capturedAt)}</Typography>
                                                    </TableCell>
                                                    <TableCell align="right" /><TableCell />
                                                    <TableCell align="right">
                                                        <Tooltip title="Delete observation (correction path)">
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => handleDelete(r.componentId, a.id, a.value, a.capturedAt, r.componentLabel || `component ${r.componentId}`)}
                                                            >
                                                                <DeleteIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </React.Fragment>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                ))
            )}
        </Box>
    );
};

export default Observations;
