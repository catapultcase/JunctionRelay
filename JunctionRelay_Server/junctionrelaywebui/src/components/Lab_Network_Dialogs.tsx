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
    Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, TextField,
    ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import {
    compName, Graph, LabComponent, LabMachine, LabSpace, MEDIA, NetNode, NetPort, NetZone, SIDES, ZONE_KINDS, zoneKindTxt,
} from "./Lab_Network_Model";
import { errorMessage } from "../utils/errors";

// The Network page's dialogs: add a device, edit a device and its ports (the pencil), and the zones.
// Where a device is drawn is not set here - it is dragged in Edit layout.

export const putJson = (url: string, method: string, body?: unknown) =>
    fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

const isNetPortList = (v: unknown): v is NetPort[] => Array.isArray(v);
const isGraph = (v: unknown): v is Graph => typeof v === "object" && v !== null && "nodes" in v && "ports" in v;
const usable = (c: LabComponent) => !["sold", "disposed", "lost"].includes(c.status);

interface AddProps {
    open: boolean; onClose: () => void; onSaved: () => Promise<void>;
    graph: Graph; machines: LabMachine[]; components: LabComponent[]; spaces: LabSpace[];
}
export const AddDeviceDialog = ({ open, onClose, onSaved, graph, machines, components, spaces }: AddProps) => {
    const [kind, setKind] = useState<"component" | "machine" | "placeholder">("component");
    const [record, setRecord] = useState<number | null>(null);
    const [label, setLabel] = useState("");
    const [spec, setSpec] = useState("");
    const [space, setSpace] = useState<number | "">("");
    const [preview, setPreview] = useState<{ ports: NetPort[] | null; error: string | null }>({ ports: null, error: null });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        if (!open) return;
        setKind("component"); setRecord(null); setLabel(""); setSpec(""); setSpace(""); setError(null);
    }, [open]);
    const onPage = useMemo(() => ({
        machines: new Set(graph.nodes.map(n => n.machineId).filter((x): x is number => x != null)),
        components: new Set(graph.nodes.map(n => n.componentId).filter((x): x is number => x != null)),
    }), [graph.nodes]);
    const componentOptions = useMemo(() => components
        .filter(c => usable(c) && !onPage.components.has(c.id))
        // Networking gear first, then NICs, then everything else
        .sort((a, b) => (a.type === "Networking" ? 0 : a.type === "NIC" ? 1 : 2) - (b.type === "Networking" ? 0 : b.type === "NIC" ? 1 : 2)
            || compName(a).localeCompare(compName(b))), [components, onPage]);
    const body = () => ({
        id: 0, machineId: kind === "machine" ? record : null, componentId: kind === "component" ? record : null,
        label: label.trim() || null, portsSpec: kind === "placeholder" ? spec.trim() || null : null,
        status: kind === "placeholder" ? "planned" : "live", spaceId: space === "" ? null : space, x: null, y: null, notes: null,
    });
    useEffect(() => {
        if (!open || (kind !== "placeholder" && record == null)) { setPreview({ ports: null, error: null }); return; }
        const t = setTimeout(async () => {
            const res = await putJson("/api/lab/network/preview-ports", "POST", body());
            if (!res.ok) { setPreview({ ports: null, error: await res.text() }); return; }
            const ports: unknown = await res.json();
            setPreview({ ports: isNetPortList(ports) ? ports : [], error: null });
        }, 250);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, kind, record, spec]);
    const save = async () => {
        setSaving(true); setError(null);
        try {
            const res = await putJson("/api/lab/network/nodes", "POST", body());
            if (!res.ok) throw new Error(await res.text());
            await onSaved();
            onClose();
        } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
    };
    return (
        <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="sm" fullWidth>
            <DialogTitle>Add device</DialogTitle>
            <DialogContent>
                <ToggleButtonGroup size="small" exclusive value={kind} sx={{ mt: 0.5, mb: 2 }}
                    onChange={(_, v) => { if (v === "component" || v === "machine" || v === "placeholder") { setKind(v); setRecord(null); } }}>
                    <ToggleButton value="component">Component</ToggleButton>
                    <ToggleButton value="machine">Machine</ToggleButton>
                    <ToggleButton value="placeholder">Not bought yet</ToggleButton>
                </ToggleButtonGroup>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
                    {kind === "component" && (
                        <Autocomplete size="small" sx={{ gridColumn: "1 / -1" }} options={componentOptions}
                            groupBy={c => (c.type === "Networking" || c.type === "NIC" ? c.type : "Other parts")}
                            getOptionLabel={c => `#${c.id} ${compName(c)}`}
                            value={componentOptions.find(c => c.id === record) ?? null}
                            onChange={(_, v) => setRecord(v?.id ?? null)}
                            renderInput={params => <TextField {...params} label="Lab component (switch, router, modem…)" />} />
                    )}
                    {kind === "machine" && (
                        <Autocomplete size="small" sx={{ gridColumn: "1 / -1" }}
                            options={machines.filter(m => !onPage.machines.has(m.id)).sort((a, b) => a.name.localeCompare(b.name))}
                            getOptionLabel={m => m.name}
                            value={machines.find(m => m.id === record) ?? null}
                            onChange={(_, v) => setRecord(v?.id ?? null)}
                            renderInput={params => <TextField {...params} label="Lab machine" />} />
                    )}
                    <TextField size="small" label={kind === "placeholder" ? "Name" : "Display name (optional)"} value={label}
                        onChange={e => setLabel(e.target.value)} />
                    <TextField select size="small" label="Frame" value={space} onChange={e => setSpace(e.target.value === "" ? "" : Number(e.target.value))}>
                        <MenuItem value="">The Space it is placed in</MenuItem>
                        {spaces.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                    </TextField>
                    {kind === "placeholder" && (
                        <TextField size="small" label="Ports, e.g. 4x SFP+ 10G" value={spec} onChange={e => setSpec(e.target.value)} sx={{ gridColumn: "1 / -1" }} />
                    )}
                </Box>
                <Box sx={{ mt: 2 }}>
                    {preview.error && <Typography color="error" sx={{ fontSize: 12.5 }}>{preview.error}</Typography>}
                    {preview.ports && (preview.ports.length === 0
                        ? <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
                            {kind === "machine" ? "None of this machine's installed parts has a ports field yet" : "Its ports field is empty"} -
                            it will be added with no ports. Set the field on the Lab record, then Sync ports, or add ports by hand.
                        </Typography>
                        : <Typography sx={{ fontSize: 12.5 }}>
                            <b>{preview.ports.length} ports will be created:</b>{" "}
                            <Box component="span" sx={{ fontFamily: "monospace", fontSize: 12 }}>{preview.ports.map(p => p.name).join(" · ")}</Box>
                        </Typography>)}
                    <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 1 }}>It goes on a free spot below the map; drag it into place with Edit layout.</Typography>
                </Box>
                {error && <Typography color="error" sx={{ fontSize: 12, mt: 1 }}>{error}</Typography>}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={saving}>Cancel</Button>
                <Button variant="contained" onClick={save}
                    disabled={saving || (kind === "placeholder" ? !label.trim() : record == null)}>{saving ? "Adding…" : "Add"}</Button>
            </DialogActions>
        </Dialog>
    );
};

interface EditProps {
    node: NetNode | null; onClose: () => void; onSaved: () => Promise<void>;
    graph: Graph; components: LabComponent[]; spaces: LabSpace[];
}
export const EditDeviceDialog = ({ node, onClose, onSaved, graph, components, spaces }: EditProps) => {
    const [draft, setDraft] = useState<NetNode | null>(null);
    const [zone, setZoneId] = useState<number | "">("");
    const [ports, setPorts] = useState<NetPort[]>([]);
    const [deleted, setDeleted] = useState<number[]>([]);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const zoneOf = (id: number) => (graph.zones ?? []).find(z => z.nodeIds.includes(id));
    const linked = useMemo(() => new Set(graph.links.flatMap(l => [l.portAId, l.portBId])), [graph.links]);
    const portsOf = (g: Graph, id: number) => g.ports.filter(p => p.nodeId === id).map(p => ({ ...p }))
        .sort((a, b) => a.side.localeCompare(b.side) || a.position - b.position || a.id - b.id);
    useEffect(() => {
        if (!node) { setDraft(null); return; }
        setDraft({ ...node }); setZoneId(zoneOf(node.id)?.id ?? ""); setPorts(portsOf(graph, node.id)); setDeleted([]); setMessage(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [node]);
    const setPort = (id: number, patch: Partial<NetPort>) => setPorts(ps => ps.map(p => (p.id === id ? { ...p, ...patch } : p)));
    const addPort = () => {
        if (!draft) return;
        const pos = Math.max(0, ...ports.filter(p => p.side === "bottom").map(p => p.position)) + 1;
        setPorts(ps => [...ps, {
            id: -Date.now(), nodeId: draft.id, name: `Port ${ps.length + 1}`, media: "rj45", speedGb: 1, side: "bottom", position: pos,
            moduleComponentId: null, moduleLabel: null, sourceComponentId: null, notes: null, moduleName: null, sourceName: null,
        }]);
    };
    const save = async () => {
        if (!draft) return;
        setSaving(true); setMessage(null);
        try {
            let res = await putJson(`/api/lab/network/nodes/${draft.id}`, "PUT", draft);
            if (!res.ok) throw new Error(await res.text());
            if ((zoneOf(draft.id)?.id ?? "") !== zone) {
                res = await putJson(`/api/lab/network/nodes/${draft.id}/zone`, "PUT", { zoneId: zone === "" ? null : zone });
                if (!res.ok) throw new Error(`Zone: ${await res.text()}`);
            }
            for (const id of deleted) await putJson(`/api/lab/network/ports/${id}`, "DELETE");
            for (const p of ports) {
                const orig = graph.ports.find(x => x.id === p.id);
                if (orig && JSON.stringify(orig) === JSON.stringify(p)) continue;
                res = await putJson(p.id > 0 ? `/api/lab/network/ports/${p.id}` : "/api/lab/network/ports", p.id > 0 ? "PUT" : "POST", { ...p, id: p.id > 0 ? p.id : 0 });
                if (!res.ok) throw new Error(`${p.name}: ${await res.text()}`);
            }
            await onSaved();
            onClose();
        } catch (e) { setMessage(errorMessage(e)); } finally { setSaving(false); }
    };
    const syncPorts = async () => {
        if (!draft) return;
        const res = await putJson(`/api/lab/network/nodes/${draft.id}/sync-ports`, "POST");
        const out: unknown = res.ok ? await res.json() : null;
        await onSaved();
        const g: unknown = await (await fetch("/api/lab/network")).json();
        if (isGraph(g)) setPorts(portsOf(g, draft.id));
        if (typeof out === "object" && out !== null && "portsAdded" in out)
            setMessage("warning" in out && typeof out.warning === "string" ? out.warning : `${String(out.portsAdded)} port(s) added from its spec.`);
        else setMessage(await res.text());
    };
    const remove = async () => {
        if (!draft) return;
        setSaving(true);
        try { await putJson(`/api/lab/network/nodes/${draft.id}`, "DELETE"); await onSaved(); onClose(); } finally { setSaving(false); }
    };
    return (
        <Dialog open={!!draft} onClose={() => !saving && onClose()} maxWidth="md" fullWidth>
            {draft && (
                <>
                    <DialogTitle sx={{ pb: 0.5 }}>{draft.displayName}</DialogTitle>
                    <DialogContent>
                        <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1.5 }}>{draft.refLine}</Typography>
                        <Box sx={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1.4fr 1.2fr", gap: 1.5, mb: 2 }}>
                            <TextField size="small" label={draft.machineId || draft.componentId ? "Display name (optional)" : "Name"} value={draft.label ?? ""}
                                onChange={e => setDraft({ ...draft, label: e.target.value || null })} />
                            <TextField select size="small" label="Status" value={draft.status} disabled={!draft.machineId && !draft.componentId}
                                onChange={e => setDraft({ ...draft, status: e.target.value })}>
                                <MenuItem value="live">live</MenuItem>
                                <MenuItem value="planned">planned</MenuItem>
                            </TextField>
                            <TextField select size="small" label="Frame" value={draft.spaceId ?? ""}
                                onChange={e => setDraft({ ...draft, spaceId: e.target.value === "" ? null : Number(e.target.value) })}>
                                <MenuItem value="">The Space it is placed in</MenuItem>
                                {spaces.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                            </TextField>
                            <TextField select size="small" label="Zone" value={zone} onChange={e => setZoneId(e.target.value === "" ? "" : Number(e.target.value))}
                                helperText={(graph.zones ?? []).length === 0 ? "Add zones with Zones" : undefined}>
                                <MenuItem value="">None</MenuItem>
                                {(graph.zones ?? []).map(z => <MenuItem key={z.id} value={z.id}>{z.name} ({zoneKindTxt(z.kind)})</MenuItem>)}
                            </TextField>
                            {!draft.machineId && !draft.componentId && (
                                <TextField size="small" label="Ports, e.g. 4x SFP+ 10G" value={draft.portsSpec ?? ""} sx={{ gridColumn: "1 / -1" }}
                                    onChange={e => setDraft({ ...draft, portsSpec: e.target.value || null })} />
                            )}
                        </Box>
                        <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "text.secondary", mb: 1 }}>Ports</Typography>
                        <Box sx={{ display: "grid", gridTemplateColumns: "1.2fr 100px 70px 100px 60px 1.6fr 36px", gap: 1, alignItems: "center" }}>
                            {["Name", "Media", "Gb/s", "Edge", "Order", "Module in the cage", ""].map(h => (
                                <Typography key={h} sx={{ fontSize: 10.5, fontWeight: 700, color: "text.secondary", textTransform: "uppercase" }}>{h}</Typography>
                            ))}
                            {ports.map(p => (
                                <Box key={p.id} sx={{ display: "contents" }}>
                                    <TextField size="small" value={p.name} onChange={e => setPort(p.id, { name: e.target.value })} />
                                    <TextField select size="small" value={p.media} onChange={e => setPort(p.id, { media: e.target.value })}>
                                        {MEDIA.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
                                    </TextField>
                                    <TextField size="small" type="number" value={p.speedGb ?? ""} onChange={e => setPort(p.id, { speedGb: e.target.value === "" ? null : Number(e.target.value) })} />
                                    <TextField select size="small" value={p.side} onChange={e => setPort(p.id, { side: e.target.value })}>
                                        {SIDES.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                                    </TextField>
                                    <TextField size="small" type="number" value={p.position} onChange={e => setPort(p.id, { position: Number(e.target.value) })} />
                                    {p.media === "rj45" ? (
                                        <Typography sx={{ fontSize: 11.5, color: "text.disabled" }}>-</Typography>
                                    ) : (
                                        <Autocomplete size="small" options={components.filter(usable)}
                                            getOptionLabel={c => `#${c.id} ${compName(c)}`}
                                            value={components.find(c => c.id === p.moduleComponentId) ?? null}
                                            onChange={(_, v) => setPort(p.id, { moduleComponentId: v?.id ?? null })}
                                            renderInput={params => <TextField {...params} placeholder={p.moduleLabel ?? "empty cage"} />} />
                                    )}
                                    <IconButton size="small" title={linked.has(p.id) ? "Delete this port and its link" : "Delete this port"}
                                        onClick={() => { if (p.id > 0) setDeleted(d => [...d, p.id]); setPorts(ps => ps.filter(x => x.id !== p.id)); }}>
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </Box>
                            ))}
                        </Box>
                        <Box sx={{ display: "flex", gap: 1, mt: 1.5, flexWrap: "wrap" }}>
                            <Button size="small" variant="outlined" onClick={addPort}>Add port</Button>
                            <Button size="small" variant="outlined" onClick={syncPorts}>Sync ports from its spec</Button>
                        </Box>
                        <Typography sx={{ fontSize: 11.5, color: "text.secondary", mt: 1 }}>
                            Sync adds the ports its Lab record lists that this device lacks; it never removes one. A deleted port takes its link with it.
                            Edges and order can also be dragged in Edit layout.
                        </Typography>
                        {message && <Typography color={message.includes("added") ? "text.secondary" : "error"} sx={{ fontSize: 12, mt: 1 }}>{message}</Typography>}
                    </DialogContent>
                    <DialogActions>
                        <Button color="error" onClick={remove} disabled={saving}>Remove from the page</Button>
                        <Box sx={{ flex: 1 }} />
                        <Button onClick={onClose} disabled={saving}>Cancel</Button>
                        <Button variant="contained" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                    </DialogActions>
                </>
            )}
        </Dialog>
    );
};

interface ZonesProps { open: boolean; onClose: () => void; onSaved: () => Promise<void>; graph: Graph }
export const ZonesDialog = ({ open, onClose, onSaved, graph }: ZonesProps) => {
    const [draft, setDraft] = useState<NetZone[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => { if (open) { setDraft((graph.zones ?? []).map(z => ({ ...z }))); setError(null); } }, [open, graph.zones]);
    const setZone = (id: number, patch: Partial<NetZone>) => setDraft(zs => zs.map(z => (z.id === id ? { ...z, ...patch } : z)));
    const save = async () => {
        setSaving(true); setError(null);
        try {
            for (const z of graph.zones ?? []) {
                if (draft.some(d => d.id === z.id)) continue;
                const res = await putJson(`/api/lab/network/zones/${z.id}`, "DELETE");
                if (!res.ok) throw new Error(`${z.name}: ${await res.text()}`);
            }
            for (const z of draft) {
                const orig = (graph.zones ?? []).find(x => x.id === z.id);
                if (orig && JSON.stringify(orig) === JSON.stringify(z)) continue;
                const res = await putJson(z.id > 0 ? `/api/lab/network/zones/${z.id}` : "/api/lab/network/zones", z.id > 0 ? "PUT" : "POST", { ...z, id: z.id > 0 ? z.id : 0 });
                if (!res.ok) throw new Error(`${z.name || "New zone"}: ${await res.text()}`);
            }
            await onSaved();
            onClose();
        } catch (e) { setError(errorMessage(e)); await onSaved(); } finally { setSaving(false); }
    };
    const nameOf = (id: number) => graph.nodes.find(n => n.id === id)?.displayName ?? `#${id}`;
    return (
        <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="md" fullWidth>
            <DialogTitle>Zones</DialogTitle>
            <DialogContent>
                <Typography sx={{ fontSize: 12.5, color: "text.secondary", mb: 1.5 }}>
                    A zone is a walled-off part of the network, drawn as a red hatched band around its devices. DMZ: servers exposed to
                    the internet. Untrusted: devices kept off the LAN. Put a device in a zone from its pencil; a device is in at most one.
                </Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: "1.2fr 140px 2fr 90px 36px", gap: 1, alignItems: "center" }}>
                    {["Name", "Kind", "Notes", "Devices", ""].map(h => (
                        <Typography key={h} sx={{ fontSize: 10.5, fontWeight: 700, color: "text.secondary", textTransform: "uppercase" }}>{h}</Typography>
                    ))}
                    {draft.map(z => (
                        <Box key={z.id} sx={{ display: "contents" }}>
                            <TextField size="small" value={z.name} onChange={e => setZone(z.id, { name: e.target.value })} />
                            <TextField select size="small" value={z.kind} onChange={e => setZone(z.id, { kind: e.target.value })}>
                                {ZONE_KINDS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
                            </TextField>
                            <TextField size="small" value={z.notes ?? ""} onChange={e => setZone(z.id, { notes: e.target.value || null })} />
                            <Typography sx={{ fontSize: 13 }} title={z.nodeIds.map(nameOf).join(", ")}>{z.nodeIds.length}</Typography>
                            <IconButton size="small" title="Delete this zone (its devices stay)" onClick={() => setDraft(zs => zs.filter(x => x.id !== z.id))}>
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Box>
                    ))}
                </Box>
                <Button size="small" variant="outlined" sx={{ mt: 1.5 }}
                    onClick={() => setDraft(zs => [...zs, { id: -Date.now(), name: "", kind: "untrusted", notes: null, nodeIds: [] }])}>Add zone</Button>
                {error && <Typography color="error" sx={{ fontSize: 12, mt: 1 }}>{error}</Typography>}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={saving}>Cancel</Button>
                <Button variant="contained" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </DialogActions>
        </Dialog>
    );
};
