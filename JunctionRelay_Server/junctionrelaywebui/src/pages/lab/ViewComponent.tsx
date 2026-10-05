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

import { useState, useEffect, useCallback } from "react";
import EditIcon from '@mui/icons-material/Edit';
import { useParams, useNavigate } from "react-router-dom";
import { useComponentTypes } from '../../components/Lab_ComponentTypes_Client';
import { SETTABLE_STATUSES, isIntegratedChild } from '../../components/Lab_Inventory_Helpers';
import LabComponentAttachmentsDialog from '../../components/Lab_Component_AttachmentsDialog';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import {
    Box, Typography, CircularProgress, Chip, Button, Paper, Divider, TextField, MenuItem, Alert,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Link as MuiLink, useTheme, Tooltip, IconButton
} from "@mui/material";
import DownloadIcon from '@mui/icons-material/Download';
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
    ResponsiveContainer, ReferenceLine} from "recharts";
import { getPriceColorMode, refreshPriceColorMode, vsPaidColor } from "../../components/Lab_Display_Settings";
import { errorMessage } from '../../utils/errors';

interface LabComponent {
    id: number;
    type: string;
    name?: string | null;
    manufacturer?: string | null;
    model?: string | null;
    nickname?: string | null;
    spec?: string | null;
    status?: string | null;
    serialNumber?: string | null;
    sku?: string | null;
    vendor?: string | null;
    source?: string | null;          // condition: New / Used / Shucked / Internal
    msrp?: number | null;
    listPrice?: number | null;
    listPriceDate?: string | null;
    listPriceNotes?: string | null;
    purchasePrice?: number | null;
    acquiredAt?: string | null;
    warrantyYears?: number | null;
    notes?: string | null;
    currentMachineId?: number | null;
    currentMachineName?: string | null;
    parentComponentId?: number | null;   // set on an integrated part
    specJson?: string | null;
}

interface MarketValue {
    id: number;
    componentId: number;
    value: number;
    condition?: string | null;
    source?: string | null;
    sourceUrl?: string | null;
    capturedAt: string;
    notes?: string | null;
}

const label = (c: LabComponent) => {
    const base = c.name || [c.manufacturer, c.model].filter(Boolean).join(" ") || c.nickname || c.type;
    return c.nickname ? `${base} "${c.nickname}"` : base;
};

const money = (v?: number | null) =>
    v === null || v === undefined ? "—" : `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// capturedAt is a UTC instant serialized without a Z; slicing it raw dates an evening
// observation tomorrow. Parse as UTC, render the LOCAL calendar day.
const localDay = (iso: string) => {
    const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
    if (isNaN(d.getTime())) return iso.slice(0, 10);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const Field = ({ k, v }: { k: string; v: React.ReactNode }) =>
    v === null || v === undefined || v === "" ? null : (
        <Box sx={{ display: "flex", gap: 1, py: 0.4 }}>
            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120 }}>{k}</Typography>
            <Typography variant="body2">{v}</Typography>
        </Box>
    );

const ViewComponent = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const theme = useTheme();
    const dark = theme.palette.mode === "dark";

    // ONE series, so no legend is needed - the chart title names it. The reference lines
    // for paid and MSRP are directly labelled rather than colour-coded, which keeps
    // identity off colour alone.
    const SERIES = dark ? "#3987e5" : "#2a78d6";
    const GRID = dark ? "#3a3f45" : "#e3e3e0";
    const AXIS = theme.palette.text.secondary;

    const [component, setComponent] = useState<LabComponent | null>(null);
    const [market, setMarket] = useState<MarketValue[]>([]);
    const [loading, setLoading] = useState(true);

    // Editing lives HERE now, not in a modal. The Add/Edit modal disabled Type outright, so a
    // part filed under the wrong category could not be moved without touching the database.
    const { typeNames } = useComponentTypes();
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);
    const [form, setForm] = useState<Partial<LabComponent>>({});

    // An integrated part inherits the parent's purchase facts, so its own money inputs are
    // disabled rather than hidden - the same rule the server enforces, where writing a price
    // to a child component is refused outright.
    const integrated = !!component && isIntegratedChild(component);

    // Files were reachable from the LIST but not from the record itself - so the page that
    // exists to show everything about a part omitted its invoice.
    const [attachments, setAttachments] = useState<{ id: number; fileName: string; sizeBytes?: number | null; kind?: string | null }[]>([]);
    const [filesOpen, setFilesOpen] = useState(false);

    const loadAttachments = useCallback(async (componentId: number) => {
        try {
            const r = await fetch(`/api/lab/attachments?componentId=${componentId}`);
            setAttachments(r.ok ? await r.json() : []);
        } catch {
            setAttachments([]);
        }
    }, []);

    const startEdit = () => {
        if (!component) return;
        setForm({ ...component });
        setEditError(null);
        setEditing(true);
    };

    const saveEdit = async () => {
        if (!component) return;
        setSaving(true);
        setEditError(null);
        try {
            const r = await fetch(`/api/lab/components/${component.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...component, ...form }),
            });
            if (!r.ok) throw new Error(await r.text());
            setEditing(false);
            await load();
        } catch (e) {
            setEditError(errorMessage(e) || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [cRes, mRes] = await Promise.all([
                fetch(`/api/lab/components/${id}`),
                fetch(`/api/lab/components/${id}/market-values`)
            ]);
            if (cRes.ok) setComponent(await cRes.json());
            if (mRes.ok) setMarket(await mRes.json());
            if (id) loadAttachments(Number(id));
        } finally {
            setLoading(false);
        }
    }, [id, loadAttachments]);

    useEffect(() => { load(); }, [load]);

    // Sync the price-color lens from the settings DB; re-render if it changed.
    const [, setColorModeTick] = useState(0);
    useEffect(() => { refreshPriceColorMode().then(() => setColorModeTick(t => t + 1)); }, []);

    if (loading) return <Box sx={{ p: 4, textAlign: "center" }}><CircularProgress /></Box>;
    if (!component) return <Box sx={{ p: 4 }}><Typography>Component {id} not found.</Typography></Box>;

    // Oldest-first for the x axis; the API returns newest-first for the table.
    // The chart plots the EFFECTIVE series — the cheapest observation per day
    // ("what could it be bought for that day"). Every raw vendor row stays in
    // the table below; only the plot collapses.
    const byDay = new Map<string, { date: string; value: number; condition?: string | null; source?: string | null }>();
    for (const m of [...market].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))) {
        const date = localDay(m.capturedAt);
        const cur = byDay.get(date);
        if (!cur || m.value < cur.value) byDay.set(date, { date, value: m.value, condition: m.condition, source: m.source });
    }
    const observed = Array.from(byDay.values());

    // Headline market figure = the effective (cheapest) value of the latest observed day.
    const latest = observed.length > 0 ? observed[observed.length - 1] : null;
    const paid = component.purchasePrice;
    const delta = latest && paid ? latest.value - paid : null;

    // The series' first point is derived here, at render time, from the component
    // itself — the ledger stores only real observations, never a seeded row.
    const acquired = component.acquiredAt ? component.acquiredAt.slice(0, 10) : null;
    const series = paid != null && acquired && (observed.length === 0 || acquired <= observed[0].date)
        ? [{ date: acquired, value: paid, condition: null, source: "paid at purchase" }, ...observed]
        : observed;

    return (
        <Box sx={{ p: 3, maxWidth: 1100, mx: "auto" }}>
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>
                Back
            </Button>

            <Typography variant="h5" fontWeight="bold">{label(component)}</Typography>
            <Box sx={{ display: "flex", gap: 1, mt: 1, mb: 2, flexWrap: "wrap" }}>
                <Chip size="small" label={component.type} />
                {component.status && <Chip size="small" label={component.status} variant="outlined" />}
                <Chip
                    size="small"
                    variant="outlined"
                    label={component.currentMachineName || "shelf"}
                    onClick={component.currentMachineId
                        ? () => navigate(`/homelab/configure-machine/${component.currentMachineId}`)
                        : undefined}
                />
            </Box>

            {/* The three price questions, side by side and never conflated: what it cost at
                launch, what the invoice listed, and what it fetches now. */}
            <Paper sx={{ p: 2, mb: 2 }}>
                <Box sx={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <Box>
                        <Typography variant="caption" color="text.secondary">MSRP (launch)</Typography>
                        <Typography variant="h6">{money(component.msrp)}</Typography>
                    </Box>
                    <Box>
                        <Typography variant="caption" color="text.secondary">List at purchase</Typography>
                        <Typography variant="h6">{money(component.listPrice)}</Typography>
                    </Box>
                    <Box>
                        <Typography variant="caption" color="text.secondary">Paid</Typography>
                        <Typography variant="h6">{money(component.purchasePrice)}</Typography>
                    </Box>
                    <Box>
                        <Typography variant="caption" color="text.secondary">
                            Market {latest ? `(${latest.date})` : ""}
                        </Typography>
                        <Typography variant="h6">{latest ? money(latest.value) : "—"}</Typography>
                        {delta !== null && (
                            <Typography variant="caption" color={vsPaidColor(delta, getPriceColorMode()) ?? "text.secondary"}>
                                {delta >= 0 ? "+" : ""}{money(delta)} vs paid
                            </Typography>
                        )}
                    </Box>
                </Box>
            </Paper>

            <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    Market value over time
                </Typography>

                {market.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
                        Nobody has looked up what this sells for yet. Ask your assistant for a
                        price check on it, or add one from the Observations tab. Paid and MSRP come
                        off the invoice; this chart is the market price over time.
                    </Typography>
                ) : (
                    <Box sx={{ width: "100%", height: 300 }}>
                        <ResponsiveContainer>
                            <LineChart data={series} margin={{ top: 8, right: 56, bottom: 8, left: 8 }}>
                                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="date" tick={{ fill: AXIS, fontSize: 12 }} stroke={GRID} />
                                <YAxis
                                    tick={{ fill: AXIS, fontSize: 12 }}
                                    stroke={GRID}
                                    tickFormatter={(v) => `$${v}`}
                                    domain={["auto", "auto"]}
                                />
                                <RTooltip
                                    formatter={(v, _n, p) =>
                                        [typeof v === "number" ? money(v) : String(v),
                                         [p?.payload?.condition, p?.payload?.source].filter(Boolean).join(", ") || "observation"]}
                                    contentStyle={{
                                        background: theme.palette.background.paper,
                                        border: `1px solid ${GRID}`,
                                        borderRadius: 6,
                                        color: theme.palette.text.primary
                                    }}
                                />
                                {/* Directly labelled, so these read without a colour key. */}
                                {paid != null && (
                                    <ReferenceLine
                                        y={paid} stroke={AXIS} strokeDasharray="4 4"
                                        label={{ value: `paid ${money(paid)}`, position: "right", fill: AXIS, fontSize: 11 }}
                                    />
                                )}
                                {component.msrp != null && (
                                    <ReferenceLine
                                        y={component.msrp} stroke={AXIS} strokeDasharray="2 6"
                                        label={{ value: `MSRP ${money(component.msrp)}`, position: "right", fill: AXIS, fontSize: 11 }}
                                    />
                                )}
                                <Line
                                    type="monotone"
                                    dataKey="value"
                                    stroke={SERIES}
                                    strokeWidth={2}
                                    dot={{ r: 4, fill: SERIES, stroke: theme.palette.background.paper, strokeWidth: 2 }}
                                    activeDot={{ r: 6 }}
                                    isAnimationActive={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </Box>
                )}
            </Paper>

            {/* The table is not decoration: it is the accessible view of the same data, and
                the only place the source URL is reachable. */}
            {market.length > 0 && (
                <Paper sx={{ p: 2, mb: 2 }}>
                    <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                        Observations ({market.length})
                    </Typography>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Captured</TableCell>
                                    <TableCell align="right">Value</TableCell>
                                    <TableCell>Condition</TableCell>
                                    <TableCell>Source</TableCell>
                                    <TableCell>Notes</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {market.map(m => (
                                    <TableRow key={m.id}>
                                        <TableCell>{localDay(m.capturedAt)}</TableCell>
                                        <TableCell align="right">{money(m.value)}</TableCell>
                                        <TableCell>{m.condition || "—"}</TableCell>
                                        <TableCell>
                                            {m.sourceUrl ? (
                                                <MuiLink href={m.sourceUrl} target="_blank" rel="noopener noreferrer">
                                                    {m.source || "link"}
                                                </MuiLink>
                                            ) : (m.source || "—")}
                                        </TableCell>
                                        <TableCell sx={{ color: "text.secondary" }}>{m.notes || ""}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            )}

            <Paper sx={{ p: 2, mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="subtitle1" fontWeight="bold">
                        Files {attachments.length > 0 && `(${attachments.length})`}
                    </Typography>
                    <Button size="small" variant="outlined" startIcon={<AttachFileIcon />}
                        onClick={() => setFilesOpen(true)}>
                        Manage
                    </Button>
                </Box>
                <Divider sx={{ mb: 1 }} />
                {attachments.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                        No invoice or manual attached. Use Manage to upload one.
                    </Typography>
                ) : (
                    attachments.map(a => (
                        <Box key={a.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.4 }}>
                            <AttachFileIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                            {/* ⛔ CLICKING THE NAME PREVIEWS, it does not download. Same endpoint
                                either way - `?inline=true` is what makes the browser render the
                                PDF instead of saving it - and the attachments dialog has always
                                done it this way. This card shipped without the flag, so opening
                                an invoice from the component page dropped a file in Downloads
                                when all you wanted was to look at it. Downloading is still one
                                click, now on its own button where it can be chosen. */}
                            <MuiLink href={`/api/lab/attachments/${a.id}/download?inline=true`}
                                target="_blank" rel="noopener noreferrer" variant="body2"
                                sx={{ cursor: 'pointer' }}>
                                {a.fileName}
                            </MuiLink>
                            <Chip size="small" variant="outlined" label={a.kind || 'file'} />
                            {a.sizeBytes != null && (
                                <Typography variant="caption" color="text.secondary">
                                    {(a.sizeBytes / 1024).toFixed(0)} KB
                                </Typography>
                            )}
                            <Tooltip title="Download">
                                <IconButton size="small"
                                    onClick={() => window.open(`/api/lab/attachments/${a.id}/download`, '_blank')}>
                                    <DownloadIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    ))
                )}
            </Paper>

            <Paper sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="subtitle1" fontWeight="bold">Details</Typography>
                    {!editing ? (
                        <Button size="small" variant="outlined" startIcon={<EditIcon />}
                            onClick={startEdit}>
                            Edit
                        </Button>
                    ) : (
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button size="small" onClick={() => { setEditing(false); setEditError(null); }}>
                                Cancel
                            </Button>
                            <Button size="small" variant="contained" onClick={saveEdit} disabled={saving}>
                                {saving ? 'Saving…' : 'Save'}
                            </Button>
                        </Box>
                    )}
                </Box>
                <Divider sx={{ mb: 2 }} />

                {editError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setEditError(null)}>{editError}</Alert>}

                {!editing ? (
                    <>
                        <Field k="Type" v={component.type} />
                        <Field k="Manufacturer" v={component.manufacturer} />
                        <Field k="Model" v={component.model} />
                        <Field k="Nickname" v={component.nickname} />
                        <Field k="Spec" v={component.spec} />
                        <Field k="Serial" v={component.serialNumber} />
                        <Field k="SKU" v={component.sku} />
                        <Field k="Vendor" v={component.vendor} />
                        <Field k="Source" v={component.source} />
                        <Field k="Acquired" v={component.acquiredAt?.slice(0, 10)} />
                        <Field k="Warranty" v={component.warrantyYears ? `${component.warrantyYears} yr` : null} />
                        <Field k="Notes" v={component.notes} />
                    </>
                ) : (
                    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr' }}>
                        {/* 🔑 Type IS editable here. The old Add/Edit modal disabled it outright
                            (`disabled={isEdit}`), so a part filed under the wrong category could
                            never be moved - which is what made "change these switches to
                            Networking" impossible in the UI. */}
                        <TextField select size="small" label="Type" value={form.type ?? ''}
                            helperText="Manage the list from Inventory › Manage Types"
                            onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                            {typeNames.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                            {form.type && !typeNames.includes(form.type) && (
                                <MenuItem value={form.type}>{form.type} (retired)</MenuItem>
                            )}
                        </TextField>
                        <TextField select size="small" label="Status" value={form.status ?? ''}
                            onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                            {/* ⚠️ The FULL vocabulary, from the shared list - never a hardcoded
                                subset, or the one place components are edited could not mark
                                anything sold, damaged or lost while the MCP tool and the chips
                                understand them all. */}
                            {['active', ...SETTABLE_STATUSES.map(o => o.value)].map(s => (
                                <MenuItem key={s} value={s}>{s}</MenuItem>
                            ))}
                        </TextField>
                        <TextField size="small" label="Name" value={form.name ?? ''}
                            helperText="Overrides manufacturer + model. Leave blank for most parts."
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                        <TextField size="small" label="Manufacturer" value={form.manufacturer ?? ''}
                            onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))} />
                        <TextField size="small" label="Model" value={form.model ?? ''}
                            onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
                        <TextField size="small" label="Nickname" value={form.nickname ?? ''}
                            onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} />
                        <TextField size="small" label="Serial" value={form.serialNumber ?? ''}
                            onChange={e => setForm(f => ({ ...f, serialNumber: e.target.value }))} />
                        <TextField size="small" label="SKU" value={form.sku ?? ''}
                            onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
                        <TextField size="small" label="Vendor" value={form.vendor ?? ''}
                            onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} />
                        <TextField size="small" label="Source" value={form.source ?? ''}
                            placeholder="New / Used / Shucked / Internal"
                            onChange={e => setForm(f => ({ ...f, source: e.target.value }))} />
                        <TextField size="small" label="Warranty (years)" type="number"
                            value={form.warrantyYears ?? ''}
                            onChange={e => setForm(f => ({
                                ...f, warrantyYears: e.target.value ? Number(e.target.value) : null,
                            }))} />
                        {/* The money columns. They were absent entirely: editing moved off
                            the Add/Edit modal onto this page and the price fields did not come
                            with it, so the only way to correct one was the API. */}
                        <TextField size="small" label="MSRP" type="number"
                            value={form.msrp ?? ''}
                            helperText="Manufacturer's launch list - same for every unit ever sold"
                            onChange={e => setForm(f => ({
                                ...f, msrp: e.target.value === '' ? null : Number(e.target.value),
                            }))} />
                        <TextField size="small" label="Purchase Price" type="number"
                            value={form.purchasePrice ?? ''}
                            disabled={integrated}
                            helperText={integrated
                                ? 'Paid on the parent - integrated parts carry no price'
                                : 'What actually left the bank, after seller discounts'}
                            onChange={e => setForm(f => ({
                                ...f, purchasePrice: e.target.value === '' ? null : Number(e.target.value),
                            }))} />
                        <TextField size="small" label="List Price at Purchase" type="number"
                            value={form.listPrice ?? ''}
                            disabled={integrated}
                            helperText="What the invoice charged, before discounts"
                            onChange={e => setForm(f => ({
                                ...f, listPrice: e.target.value === '' ? null : Number(e.target.value),
                            }))} />
                        <TextField size="small" label="List Price Date" placeholder="YYYY-MM-DD"
                            value={form.listPriceDate ?? ''}
                            disabled={integrated}
                            helperText="The invoice's order date"
                            InputLabelProps={{ shrink: true }}
                            onChange={e => setForm(f => ({ ...f, listPriceDate: e.target.value || null }))} />
                        <TextField size="small" label="Pricing Notes" multiline rows={2} sx={{ gridColumn: '1 / -1' }}
                            value={form.listPriceNotes ?? ''}
                            helperText="Where the figures came from - invoice line, launch-price citation"
                            onChange={e => setForm(f => ({ ...f, listPriceNotes: e.target.value || null }))} />
                        <TextField size="small" label="Spec" sx={{ gridColumn: '1 / -1' }}
                            value={form.spec ?? ''}
                            onChange={e => setForm(f => ({ ...f, spec: e.target.value }))} />
                        <TextField size="small" label="Notes" multiline rows={3} sx={{ gridColumn: '1 / -1' }}
                            value={form.notes ?? ''}
                            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                    </Box>
                )}
            </Paper>

            <LabComponentAttachmentsDialog
                open={filesOpen}
                onClose={() => setFilesOpen(false)}
                component={component as never}
                onChanged={() => { if (id) loadAttachments(Number(id)); load(); }}
                onError={(m) => setEditError(m)}
            />
        </Box>
    );
};

export default ViewComponent;
