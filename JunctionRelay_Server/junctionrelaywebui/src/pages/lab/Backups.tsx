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
    Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Paper,
    Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorIcon from "@mui/icons-material/Error";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { usePageTitle } from "../../hooks/usePageTitle";

// The BACKUPS page - the backup strategy, read as 3-2-1 at the box level. The question is "for each data set:
// how many copies, on how many boxes, any offsite?" - a MATRIX answers it (rows = data sets, columns = boxes);
// a share-level node graph puts too many cards and arrows on screen to read.
// ⛔ NO SITE DATA IS IN THIS FILE: boxes (location), data sets on boxes (copy), jobs and rules are
// Lab_Backup_Design rows, edited here or with lab_set_backup. A box picks its Lab machine (an id). Status uses
// the reserved status colours, each with an icon and a label - never colour alone.
// Three tiers of box: in the house, offsite, and
// cloud - a service such as Backblaze B2, with no Lab machine, that counts as offsite for 3-2-1.

interface LabMachine { id: number; name: string; alwaysOn: boolean; status: string }
interface El {
    id: number; kind: "location" | "job" | "copy" | "rule"; name: string | null; body: string | null;
    machineId: number | null; path: string | null; tier: string | null; snapshots: string | null;
    sourceId: number | null; targetId: number | null; schedule: string | null; mode: string | null;
    row: number; position: number; accent: string | null;
}
const isCloud = (b: El) => (b.tier ?? "").toLowerCase() === "cloud";
const isOffsite = (b: El) => isCloud(b) || (b.tier ?? "").toLowerCase() === "offsite";
type Form = Omit<El, "id"> & { id: number | null };
const blank = (kind: El["kind"], position = 0): Form => ({
    id: null, kind, name: "", body: "", machineId: null, path: "", tier: kind === "location" ? "onsite" : kind === "copy" ? "copy" : null,
    snapshots: "", sourceId: null, targetId: null, schedule: kind === "job" ? "Mondays 10:00" : "",
    mode: kind === "job" ? "mirror, deletes" : null, row: 1, position, accent: "",
});
// The status palette (dataviz reference instance): reserved, never a series colour.
const STATUS = {
    good: { color: "#0ca30c", Icon: CheckCircleIcon },
    warning: { color: "#fab219", Icon: WarningAmberIcon },
    serious: { color: "#ec835a", Icon: WarningAmberIcon },
    critical: { color: "#d03b3b", Icon: ErrorIcon },
    info: { color: "#78909c", Icon: InfoOutlinedIcon },
} as const;
type StatusKey = keyof typeof STATUS;

const LabBackups = () => {
    usePageTitle("Backups");
    const [els, setEls] = useState<El[]>([]);
    const [machines, setMachines] = useState<LabMachine[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);

    const load = useCallback(async () => {
        try {
            const [dRes, mRes] = await Promise.all([fetch("/api/lab/backup-design"), fetch("/api/lab/machines")]);
            if (!dRes.ok) throw new Error(await dRes.text());
            setEls(await dRes.json());
            if (mRes.ok) setMachines(await mRes.json());
            setError(null);
        } catch (e) { setError(e instanceof Error ? e.message : "Failed to load the backups design"); }
        finally { setLoaded(true); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const boxes = useMemo(() => els.filter(e => e.kind === "location").sort((a, b) => a.position - b.position || a.id - b.id), [els]);
    const copies = useMemo(() => els.filter(e => e.kind === "copy"), [els]);
    const jobs = useMemo(() => els.filter(e => e.kind === "job").sort((a, b) => a.position - b.position || a.id - b.id), [els]);
    const rules = useMemo(() => els.filter(e => e.kind === "rule").sort((a, b) => a.position - b.position || a.id - b.id), [els]);
    const machineById = useMemo(() => new Map(machines.map(m => [m.id, m])), [machines]);
    const boxById = useMemo(() => new Map(boxes.map(b => [b.id, b])), [boxes]);
    const machinesSorted = useMemo(() => [...machines].sort((a, b) => a.name.localeCompare(b.name)), [machines]);

    // ---- the 3-2-1 reading, per data set ----
    const sets = useMemo(() => {
        const offsiteBox = (id: number | null) => { const b = id != null ? boxById.get(id) : undefined; return b ? isOffsite(b) : false; };
        const by = new Map<string, El[]>();
        for (const c of copies) { const k = c.name ?? ""; (by.get(k) ?? by.set(k, []).get(k)!).push(c); }
        return [...by].map(([name, rows]) => {
            const n = rows.length;
            const boxCount = new Set(rows.map(r => r.sourceId)).size;
            const offsite = rows.some(r => offsiteBox(r.sourceId));
            const replaceable = rows.some(r => (r.mode ?? "").toLowerCase() === "replaceable");
            let status: StatusKey, label: string;
            if (n >= 3 && boxCount >= 2 && offsite) { status = "good"; label = "3-2-1 met"; }
            else if (replaceable && n <= 1) { status = "info"; label = "re-downloadable"; }
            else if (n <= 1) { status = "critical"; label = "1 copy"; }
            else if (n >= 3 && boxCount >= 2) { status = "warning"; label = "no offsite"; }
            else { status = "serious"; label = `${n} copies${offsite ? "" : ", no offsite"}`; }
            const order = Math.min(...rows.map(r => r.position));
            return { name, rows, n, boxCount, offsite, status, label, order };
        }).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    }, [copies, boxById]);
    const kpi = useMemo(() => ({
        total: sets.length,
        met: sets.filter(s => s.status === "good").length,
        offsite: sets.filter(s => s.offsite).length,
        single: sets.filter(s => s.status === "critical").length,
    }), [sets]);

    // ---- saving ----
    const [form, setForm] = useState<Form | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const putJson = (url: string, method: string, body: unknown) =>
        fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const saveOne = async (f: Form) => {
        const res = await putJson(f.id != null ? `/api/lab/backup-design/${f.id}` : "/api/lab/backup-design",
            f.id != null ? "PUT" : "POST", { ...f, id: f.id ?? 0 });
        if (!res.ok) throw new Error(await res.text());
    };
    const saveForm = async () => {
        if (!form) return;
        setSaving(true); setSaveError(null);
        try { await saveOne(form); await load(); setForm(null); }
        catch (e) { setSaveError(e instanceof Error ? e.message : "Save failed"); }
        finally { setSaving(false); }
    };
    const deleteForm = async () => {
        if (!form?.id) return;
        setSaving(true);
        try { await fetch(`/api/lab/backup-design/${form.id}`, { method: "DELETE" }); await load(); setForm(null); }
        finally { setSaving(false); }
    };

    // ---- list editors: data sets, and jobs & rules ----
    const [listKind, setListKind] = useState<"copies" | "jobs" | null>(null);
    const [draft, setDraft] = useState<Form[]>([]);
    const [deleted, setDeleted] = useState<number[]>([]);
    const openList = (k: "copies" | "jobs") => {
        const src = k === "copies"
            ? [...copies].sort((a, b) => a.position - b.position || (a.name ?? "").localeCompare(b.name ?? ""))
            : [...jobs, ...rules];
        setDraft(src.map(e => ({ ...e })));
        setDeleted([]); setSaveError(null); setListKind(k);
    };
    const setD = (i: number, patch: Partial<Form>) => setDraft(draft.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    const dropD = (i: number) => { const f = draft[i]; if (f.id) setDeleted([...deleted, f.id]); setDraft(draft.filter((_, j) => j !== i)); };
    const saveList = async () => {
        setSaving(true); setSaveError(null);
        try {
            for (const id of deleted) await fetch(`/api/lab/backup-design/${id}`, { method: "DELETE" });
            for (const f of draft) await saveOne(f);
            await load(); setListKind(null);
        } catch (e) { setSaveError(e instanceof Error ? e.message : "Save failed"); }
        finally { setSaving(false); }
    };

    const statusBadge = (s: StatusKey, label: string) => {
        const { color, Icon } = STATUS[s];
        return (
            <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, whiteSpace: "nowrap" }}>
                <Icon sx={{ fontSize: 17, color }} />
                <Typography component="span" sx={{ fontSize: 13, fontWeight: 600, color: "text.primary" }}>{label}</Typography>
            </Box>
        );
    };
    const tile = (label: string, value: number, sub: string, s?: StatusKey) => {
        const st = s ? STATUS[s] : null;
        return (
            <Paper variant="outlined" sx={{ p: 1.5, flex: "1 1 180px", minWidth: 160 }}>
                <Typography sx={{ fontSize: 12, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.25 }}>
                    <Typography sx={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
                    {st && <st.Icon sx={{ fontSize: 22, color: st.color }} />}
                </Box>
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{sub}</Typography>
            </Paper>
        );
    };
    const cell = (rows: El[]) => {
        if (rows.length === 0) return <Typography sx={{ color: "text.disabled", fontSize: 13 }}>-</Typography>;
        const ordered = [...rows].sort((a, b) => (a.tier === "live" ? 0 : 1) - (b.tier === "live" ? 0 : 1));
        return (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, alignItems: "center" }}>
                {ordered.map(r => {
                    const live = r.tier === "live";
                    const b = r.sourceId != null ? boxById.get(r.sourceId) : undefined;
                    return (
                        <Tooltip key={r.id} arrow title={
                            <Box sx={{ fontSize: 12 }}>
                                <div><b>{live ? "Live" : "Copy"}</b> on {b?.name}</div>
                                {r.path && <div style={{ fontFamily: "monospace" }}>{r.path}</div>}
                                {b?.snapshots && <div>Undo: {b.snapshots}</div>}
                                {r.body && <div>{r.body}</div>}
                            </Box>
                        }>
                            <Box component="span" sx={{
                                px: 1, py: "1px", borderRadius: "4px", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.04em", cursor: "default",
                                border: 1, borderColor: live ? "text.primary" : "divider",
                                bgcolor: live ? "text.primary" : "transparent", color: live ? "background.paper" : "text.primary",
                            }}>{live ? "LIVE" : "COPY"}</Box>
                        </Tooltip>
                    );
                })}
            </Box>
        );
    };
    const boxName = (id: number | null) => (id != null ? boxById.get(id)?.name : null) ?? "-";

    return (
        <Box sx={{ p: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5, flexWrap: "wrap" }}>
                <Typography variant="h6">Backups</Typography>
                <Box sx={{ flex: 1 }} />
                <Button size="small" variant="outlined" onClick={() => { setSaveError(null); setForm(blank("location", boxes.length)); }}>Add box</Button>
                <Button size="small" variant="outlined" onClick={() => openList("copies")} disabled={boxes.length === 0}>Edit data sets</Button>
                <Button size="small" variant="outlined" onClick={() => openList("jobs")} disabled={boxes.length < 2}>Jobs &amp; rules</Button>
            </Box>
            <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 2 }}>
                The backup strategy read as 3-2-1: three copies, on two separate boxes, one offsite. Every word here is data -
                the buttons and pencils edit it, and so does MCP (lab_set_backup). Boxes are Lab machines in the house or offsite,
                or a cloud service (Backblaze B2), which counts as offsite.
            </Typography>
            {error && <Typography color="error" variant="body2" sx={{ mb: 2 }}>{error}</Typography>}

            {loaded && boxes.length === 0 ? (
                <Paper sx={{ p: 3 }}><Typography sx={{ fontSize: 14 }}>No boxes yet. Add one for each machine that holds data.</Typography></Paper>
            ) : (
                <>
                    <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
                        {tile("Data sets", kpi.total, "tracked here")}
                        {tile("Meet 3-2-1", kpi.met, `of ${kpi.total}`, kpi.met === kpi.total && kpi.total > 0 ? "good" : "warning")}
                        {tile("Offsite copy", kpi.offsite, kpi.offsite === 0 ? "nothing survives losing the house" : `of ${kpi.total}`, kpi.offsite === 0 ? "critical" : undefined)}
                        {tile("Single copy", kpi.single, "snapshots are the only undo", kpi.single > 0 ? "critical" : "good")}
                    </Box>

                    <Paper sx={{ overflowX: "auto", mb: 2 }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 700, minWidth: 190 }}>Data set</TableCell>
                                    {boxes.map(b => {
                                        const m = b.machineId != null ? machineById.get(b.machineId) : undefined;
                                        return (
                                            <TableCell key={b.id} align="center" sx={{ minWidth: 120 }}>
                                                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.25 }}>
                                                    <Typography sx={{ fontWeight: 700, fontSize: 13.5 }}>{b.name}</Typography>
                                                    <IconButton size="small" title="Edit this box" onClick={() => { setSaveError(null); setForm({ ...b }); }} sx={{ p: 0.25 }}>
                                                        <EditIcon sx={{ fontSize: 14 }} />
                                                    </IconButton>
                                                </Box>
                                                <Typography sx={{ fontSize: 11, color: m || isCloud(b) ? "text.secondary" : "error.main" }}>
                                                    {isCloud(b) ? "cloud · offsite" : m ? `${isOffsite(b) ? "offsite" : "in the house"}${m.alwaysOn ? " · always on" : ""}` : "machine missing from Lab"}
                                                </Typography>
                                            </TableCell>
                                        );
                                    })}
                                    <TableCell align="center" sx={{ fontWeight: 700 }}>Copies</TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 700 }}>Boxes</TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 700 }}>Offsite</TableCell>
                                    <TableCell sx={{ fontWeight: 700, minWidth: 150 }}>3-2-1</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {sets.map(s => (
                                    <TableRow key={s.name} hover>
                                        <TableCell sx={{ fontWeight: 600 }}>{s.name}</TableCell>
                                        {boxes.map(b => <TableCell key={b.id} align="center">{cell(s.rows.filter(r => r.sourceId === b.id))}</TableCell>)}
                                        <TableCell align="center" sx={{ fontVariantNumeric: "tabular-nums" }}>{s.n}</TableCell>
                                        <TableCell align="center" sx={{ fontVariantNumeric: "tabular-nums" }}>{s.boxCount}</TableCell>
                                        <TableCell align="center">{s.offsite ? "yes" : "no"}</TableCell>
                                        <TableCell>{statusBadge(s.status, s.label)}</TableCell>
                                    </TableRow>
                                ))}
                                {sets.length === 0 && (
                                    <TableRow><TableCell colSpan={boxes.length + 5} sx={{ color: "text.secondary" }}>No data sets yet - &quot;Edit data sets&quot; adds them.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Paper>

                    {jobs.length > 0 && (
                        <Paper sx={{ overflowX: "auto", mb: 2 }}>
                            <Typography sx={{ fontWeight: 700, fontSize: 14, px: 2, pt: 1.5 }}>Jobs - what makes the copies</Typography>
                            <Table size="small">
                                <TableHead>
                                    <TableRow><TableCell>Carries</TableCell><TableCell>From</TableCell><TableCell>To</TableCell><TableCell>When</TableCell><TableCell>Mode</TableCell><TableCell>Note</TableCell></TableRow>
                                </TableHead>
                                <TableBody>
                                    {jobs.map(j => (
                                        <TableRow key={j.id}>
                                            <TableCell>{j.name}</TableCell><TableCell>{boxName(j.sourceId)}</TableCell><TableCell>{boxName(j.targetId)}</TableCell>
                                            <TableCell>{j.schedule}</TableCell><TableCell>{j.mode}</TableCell><TableCell sx={{ color: "text.secondary" }}>{j.body}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </Paper>
                    )}

                    <Paper sx={{ p: 2 }}>
                        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(auto-fill, minmax(260px, 1fr))" }, gap: 1.5, mb: rules.length ? 2 : 0 }}>
                            {boxes.map(b => (
                                <Box key={b.id}>
                                    <Typography sx={{ fontWeight: 700, fontSize: 13 }}>{b.name} - undo</Typography>
                                    <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{b.snapshots || "no snapshot policy recorded"}</Typography>
                                    {b.body && <Typography sx={{ fontSize: 12.5, mt: 0.25 }}>{b.body}</Typography>}
                                </Box>
                            ))}
                        </Box>
                        {rules.length > 0 && (
                            <Box sx={{ display: "flex", flexDirection: "column", gap: 1, pt: 1.5, borderTop: 1, borderColor: "divider" }}>
                                {rules.map((r, i) => (
                                    <Box key={r.id} sx={{ display: "flex", gap: 1 }}>
                                        <Box sx={{ minWidth: 22, height: 22, borderRadius: "11px", bgcolor: "text.secondary", color: "background.paper", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</Box>
                                        <Typography sx={{ fontSize: 13, lineHeight: 1.5 }}>{r.body}</Typography>
                                    </Box>
                                ))}
                            </Box>
                        )}
                    </Paper>
                </>
            )}

            <Dialog open={!!form} onClose={() => !saving && setForm(null)} maxWidth="sm" fullWidth>
                {form && (
                    <>
                        <DialogTitle>{form.id != null ? form.name : "New box"}</DialogTitle>
                        <DialogContent>
                            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mt: 0.5 }}>
                                <TextField label="Name" size="small" value={form.name ?? ""} onChange={e => setForm({ ...form, name: e.target.value })} />
                                <TextField select label="Lab machine" size="small" value={form.machineId ?? ""} disabled={form.tier === "cloud"}
                                    helperText={form.tier === "cloud" ? "a cloud service has none" : undefined}
                                    onChange={e => setForm({ ...form, machineId: Number(e.target.value) })}>
                                    {machinesSorted.map(m => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
                                </TextField>
                                <TextField select label="Where it is" size="small" value={form.tier === "offsite" || form.tier === "cloud" ? form.tier : "onsite"}
                                    onChange={e => setForm({ ...form, tier: e.target.value, machineId: e.target.value === "cloud" ? null : form.machineId })}>
                                    <MenuItem value="onsite">in the house</MenuItem>
                                    <MenuItem value="offsite">offsite</MenuItem>
                                    <MenuItem value="cloud">cloud (Backblaze B2...)</MenuItem>
                                </TextField>
                                <TextField label="Column order" size="small" type="number" value={form.position} onChange={e => setForm({ ...form, position: Number(e.target.value) })} />
                                <TextField label="Path (pools, shares)" size="small" value={form.path ?? ""} sx={{ gridColumn: "1 / -1" }} onChange={e => setForm({ ...form, path: e.target.value })} />
                                <TextField label="Undo (snapshot policy)" size="small" value={form.snapshots ?? ""} sx={{ gridColumn: "1 / -1" }} onChange={e => setForm({ ...form, snapshots: e.target.value })} />
                                <TextField label="Note" size="small" multiline minRows={2} value={form.body ?? ""} sx={{ gridColumn: "1 / -1" }} onChange={e => setForm({ ...form, body: e.target.value })} />
                            </Box>
                            {saveError && <Typography color="error" sx={{ fontSize: 12, mt: 1 }}>{saveError}</Typography>}
                        </DialogContent>
                        <DialogActions>
                            {form.id != null && <Button color="error" onClick={deleteForm} disabled={saving}>Delete box (and its copies and jobs)</Button>}
                            <Box sx={{ flex: 1 }} />
                            <Button onClick={() => setForm(null)} disabled={saving}>Cancel</Button>
                            <Button variant="contained" onClick={saveForm} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                        </DialogActions>
                    </>
                )}
            </Dialog>

            <Dialog open={listKind != null} onClose={() => !saving && setListKind(null)} maxWidth="lg" fullWidth>
                <DialogTitle>{listKind === "copies" ? "Data sets - where each copy lives" : "Jobs & rules"}</DialogTitle>
                <DialogContent>
                    {listKind === "copies" && (
                        <>
                            <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 1, mb: 1.5 }}>
                                One row per copy: the same data set name on several rows makes one line of the matrix. Mark the live row
                                &quot;replaceable&quot; when a single copy is the design.
                            </Typography>
                            {draft.map((f, i) => (
                                <Box key={`c${i}`} sx={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 0.8fr 1.5fr 0.9fr 60px 36px", gap: 1, mb: 1 }}>
                                    <TextField size="small" label="Data set" value={f.name ?? ""} onChange={e => setD(i, { name: e.target.value })} />
                                    <TextField select size="small" label="Box" value={f.sourceId ?? ""} onChange={e => setD(i, { sourceId: Number(e.target.value) })}>
                                        {boxes.map(b => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
                                    </TextField>
                                    <TextField select size="small" label="Kind" value={f.tier ?? "copy"} onChange={e => setD(i, { tier: e.target.value })}>
                                        <MenuItem value="live">live</MenuItem>
                                        <MenuItem value="copy">copy</MenuItem>
                                    </TextField>
                                    <TextField size="small" label="Path on that box" value={f.path ?? ""} onChange={e => setD(i, { path: e.target.value })} />
                                    <TextField select size="small" label="Design" value={f.mode ?? ""} onChange={e => setD(i, { mode: e.target.value || null })}>
                                        <MenuItem value="">-</MenuItem>
                                        <MenuItem value="replaceable">replaceable</MenuItem>
                                    </TextField>
                                    <TextField size="small" label="Row" type="number" value={f.position} onChange={e => setD(i, { position: Number(e.target.value) })} />
                                    <IconButton size="small" onClick={() => dropD(i)}><DeleteIcon fontSize="small" /></IconButton>
                                </Box>
                            ))}
                            <Button size="small" onClick={() => setDraft([...draft, { ...blank("copy", sets.length), sourceId: boxes[0]?.id ?? null }])}>Add copy</Button>
                        </>
                    )}
                    {listKind === "jobs" && (
                        <>
                            <Typography sx={{ fontSize: 12, fontWeight: 700, mt: 1, mb: 1 }}>JOBS - what copies from which box to which</Typography>
                            {draft.map((f, i) => f.kind !== "job" ? null : (
                                <Box key={`j${i}`} sx={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 0.9fr 0.9fr 1.3fr 36px", gap: 1, mb: 1 }}>
                                    <TextField size="small" label="Carries" value={f.name ?? ""} onChange={e => setD(i, { name: e.target.value })} />
                                    <TextField select size="small" label="From" value={f.sourceId ?? ""} onChange={e => setD(i, { sourceId: Number(e.target.value) })}>
                                        {boxes.map(b => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
                                    </TextField>
                                    <TextField select size="small" label="To" value={f.targetId ?? ""} onChange={e => setD(i, { targetId: Number(e.target.value) })}>
                                        {boxes.filter(b => b.id !== f.sourceId).map(b => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
                                    </TextField>
                                    <TextField size="small" label="When" value={f.schedule ?? ""} onChange={e => setD(i, { schedule: e.target.value })} />
                                    <TextField select size="small" label="Mode" value={f.mode ?? ""} onChange={e => setD(i, { mode: e.target.value })}>
                                        <MenuItem value="mirror, deletes">mirror, deletes</MenuItem>
                                        <MenuItem value="copy, adds only">copy, adds only</MenuItem>
                                        <MenuItem value="sync, deletes">sync, deletes</MenuItem>
                                    </TextField>
                                    <TextField size="small" label="Note" value={f.body ?? ""} onChange={e => setD(i, { body: e.target.value })} />
                                    <IconButton size="small" onClick={() => dropD(i)}><DeleteIcon fontSize="small" /></IconButton>
                                </Box>
                            ))}
                            <Button size="small" onClick={() => setDraft([...draft, { ...blank("job", jobs.length), sourceId: boxes[0]?.id ?? null, targetId: boxes[1]?.id ?? null }])}>Add job</Button>
                            <Typography sx={{ fontSize: 12, fontWeight: 700, mt: 2, mb: 1 }}>RULES - the numbered lines at the bottom</Typography>
                            {draft.map((f, i) => f.kind !== "rule" ? null : (
                                <Box key={`r${i}`} sx={{ display: "grid", gridTemplateColumns: "70px 1fr 36px", gap: 1, mb: 1 }}>
                                    <TextField size="small" label="Order" type="number" value={f.position} onChange={e => setD(i, { position: Number(e.target.value) })} />
                                    <TextField size="small" label="Rule" multiline value={f.body ?? ""} onChange={e => setD(i, { body: e.target.value })} />
                                    <IconButton size="small" onClick={() => dropD(i)}><DeleteIcon fontSize="small" /></IconButton>
                                </Box>
                            ))}
                            <Button size="small" onClick={() => setDraft([...draft, blank("rule", rules.length + 1)])}>Add rule</Button>
                        </>
                    )}
                    {saveError && <Typography color="error" sx={{ fontSize: 12, mt: 1 }}>{saveError}</Typography>}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setListKind(null)} disabled={saving}>Cancel</Button>
                    <Button variant="contained" onClick={saveList} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default LabBackups;
