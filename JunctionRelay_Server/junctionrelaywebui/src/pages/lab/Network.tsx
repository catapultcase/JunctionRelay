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
    Box, Button, ButtonGroup, FormControlLabel, MenuItem, Paper, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography, useTheme,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useCanvasViewport } from "../../hooks/useCanvasViewport";
import {
    computeGeometry, Graph, LabComponent, LabMachine, LabSpace, Layout, layoutOf, mediaTxt, MODULE_ORANGE, NetLink, NetNode,
    NetPort, SFP_BLUE, speedTxt, ZONE_RED,
} from "../../components/Lab_Network_Model";
import LabNetworkCanvas from "../../components/Lab_Network_Canvas";
import { AddDeviceDialog, EditDeviceDialog, putJson, ZonesDialog } from "../../components/Lab_Network_Dialogs";
import { errorMessage } from "../../utils/errors";

// The NETWORK page - the topology of machines and switches, their ports and links, driven by the Lab
// inventory (a switch brings its ports with it) and editable here and over MCP. No site data is in this file:
//   * A DEVICE is a Lab machine, a Lab component (a switch, a modem) or a placeholder for something not
//     bought yet. It is drawn at its x/y; its FRAME is the Lab Space it is placed in, drawn around it.
//   * PORTS come from each record's 'ports' spec field when it is added, then are ordinary rows.
//   * LINKS join port to port, live or planned; a link's speed is the slower end. Lines are routed around
//     the cards, each in its own lane (Lab_Network_Router).
//   * ZONES (dmz | untrusted) are drawn as a red hatched band around their devices.
// The map pans and zooms inside its box (useCanvasViewport). Edit layout drags devices, frames and port tabs
// on a grid; Save writes the moves in one go (PUT api/lab/network/layout).

const isGraph = (v: unknown): v is Graph => typeof v === "object" && v !== null && "nodes" in v && "ports" in v && "links" in v;
const listOf = <T,>(v: unknown): T[] => (Array.isArray(v) ? v : []);

const HomelabNetwork = () => {
    usePageTitle("Homelab Network");
    const theme = useTheme();
    const [graph, setGraph] = useState<Graph>({ nodes: [], ports: [], links: [], zones: [], checks: [] });
    const [machines, setMachines] = useState<LabMachine[]>([]);
    const [components, setComponents] = useState<LabComponent[]>([]);
    const [spaces, setSpaces] = useState<LabSpace[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);

    const load = useCallback(async () => {
        try {
            const [gRes, mRes, cRes, sRes] = await Promise.all([
                fetch("/api/lab/network"), fetch("/api/lab/machines"), fetch("/api/lab/components"), fetch("/api/lab/spaces"),
            ]);
            if (!gRes.ok) throw new Error(await gRes.text());
            const g: unknown = await gRes.json();
            if (!isGraph(g)) throw new Error("The network came back in an unexpected shape.");
            setGraph(g);
            if (mRes.ok) setMachines(listOf<LabMachine>(await mRes.json()));
            if (cRes.ok) setComponents(listOf<LabComponent>(await cRes.json()));
            if (sRes.ok) setSpaces(listOf<LabSpace>(await sRes.json()));
            setError(null);
        } catch (e) {
            setError(errorMessage(e));
        } finally { setLoaded(true); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const [showFree, setShowFree] = useState(false);
    const viewport = useCanvasViewport("jr.network.view");

    // ---- edit layout: a draft, an undo stack, Save / Cancel ----
    const committed = useMemo(() => layoutOf(graph), [graph]);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<Layout | null>(null);
    const [undo, setUndo] = useState<Layout[]>([]);
    const [problem, setProblem] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const layout = editing && draft ? draft : committed;
    const startEdit = () => { setDraft(committed); setUndo([]); setProblem(null); setEditing(true); setConnectMode(false); };
    const cancelEdit = () => { setDraft(null); setUndo([]); setProblem(null); setEditing(false); };
    const onLayout = (next: Layout) => { setUndo(u => [...u, layout]); setDraft(next); setProblem(null); };
    const undoOne = useCallback(() => {
        setUndo(u => {
            const prev = u[u.length - 1];
            if (prev) setDraft(prev);
            return u.slice(0, -1);
        });
    }, []);
    useEffect(() => {
        if (!editing) return;
        const key = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undoOne(); }
        };
        window.addEventListener("keydown", key);
        return () => window.removeEventListener("keydown", key);
    }, [editing, undoOne]);
    const saveLayout = async () => {
        if (!draft) return;
        const nodes = [...draft.at.entries()]
            .filter(([id, p]) => { const o = committed.at.get(id); return !o || o.x !== p.x || o.y !== p.y; })
            .map(([id, p]) => ({ id, x: p.x, y: p.y }));
        const ports = [...draft.edge.entries()]
            .filter(([id, e]) => { const o = committed.edge.get(id); return !o || o.side !== e.side || o.position !== e.position; })
            .map(([id, e]) => ({ id, side: e.side, position: e.position }));
        setSaving(true);
        try {
            if (nodes.length || ports.length) {
                const res = await putJson("/api/lab/network/layout", "PUT", { nodes, ports });
                if (!res.ok) throw new Error(await res.text());
                await load();
            }
            setDraft(null); setUndo([]); setEditing(false);
        } catch (e) { setProblem(errorMessage(e)); } finally { setSaving(false); }
    };

    // ---- the view: fit once on first visit, and on demand ----
    const linked = useMemo(() => new Set(graph.links.flatMap(l => [l.portAId, l.portBId])), [graph.links]);
    const bounds = useMemo(() => computeGeometry(graph, layout, p => showFree || linked.has(p.id)).bounds, [graph, layout, showFree, linked]);
    const [fitted, setFitted] = useState(false);
    useEffect(() => {
        if (fitted || !loaded || graph.nodes.length === 0) return;
        setFitted(true);
        if (!viewport.restored) viewport.fit(bounds);
    }, [fitted, loaded, graph.nodes.length, viewport, bounds]);

    // ---- selection and connect mode ----
    const [selected, setSelected] = useState<{ port?: number; link?: number } | null>(null);
    const [connectMode, setConnectMode] = useState(false);
    const [armed, setArmed] = useState<number | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    // Two picks make a PENDING link; nothing is written until "Connect" on the confirm bar.
    const [pending, setPending] = useState<{ a: number; b: number; status: "live" | "planned" } | null>(null);
    const onPort = (id: number) => {
        setActionError(null);
        if (!connectMode || linked.has(id)) { setSelected({ port: id }); setArmed(null); setPending(null); return; }
        if (armed == null) { setArmed(id); setPending(null); return; }
        if (armed === id) { setArmed(null); setPending(null); return; }
        setPending({ a: armed, b: id, status: "live" });
    };
    const confirmLink = async () => {
        if (!pending) return;
        const res = await putJson("/api/lab/network/links", "POST", { portAId: pending.a, portBId: pending.b, status: pending.status });
        if (!res.ok) { setActionError(await res.text()); return; }
        const saved: unknown = await res.json();
        setArmed(null); setPending(null);
        if (typeof saved === "object" && saved !== null && "id" in saved && typeof saved.id === "number") setSelected({ link: saved.id });
        await load();
    };
    const cancelLink = () => { setArmed(null); setPending(null); };
    const setLinkStatus = async (l: NetLink, status: string) => {
        const res = await putJson(`/api/lab/network/links/${l.id}`, "PUT", { ...l, status });
        if (!res.ok) setActionError(await res.text());
        await load();
    };
    const deleteLink = async (id: number) => {
        await putJson(`/api/lab/network/links/${id}`, "DELETE");
        setSelected(null);
        await load();
    };

    const [addOpen, setAddOpen] = useState(false);
    const [zonesOpen, setZonesOpen] = useState(false);
    const [editNode, setEditNode] = useState<NetNode | null>(null);

    const portById = useMemo(() => new Map(graph.ports.map(p => [p.id, p])), [graph.ports]);
    const nodeById = useMemo(() => new Map(graph.nodes.map(n => [n.id, n])), [graph.nodes]);
    const linkOf = (id: number) => graph.links.find(l => l.portAId === id || l.portBId === id);
    const sel = selected?.port != null ? portById.get(selected.port) : undefined;
    const selLink = selected?.link != null ? graph.links.find(l => l.id === selected.link) : sel ? linkOf(sel.id) : undefined;
    const otherEnd = (l: NetLink, from?: NetPort) => portById.get(from && l.portAId === from.id ? l.portBId : l.portAId);
    const portLabel = (p?: NetPort) => (p ? `${nodeById.get(p.nodeId)?.displayName ?? `#${p.nodeId}`} · ${p.name}` : "?");

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: "flex", alignItems: "flex-end", gap: 2, flexWrap: "wrap", mb: 2 }}>
                <Box sx={{ flex: 1, minWidth: 280 }}>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>Network</Typography>
                    <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                        Every device is a Lab machine or component (or a placeholder for one not bought yet); frames are the rooms they are
                        in, with each rack or desk drawn inside its room. Ports come from each record&#39;s ports field; links join port to port. Edited here and through MCP
                        (lab_network, lab_set_network_node, lab_set_network_port, lab_connect).
                    </Typography>
                </Box>
                {editing ? (
                    <>
                        <Typography sx={{ fontSize: 12.5, color: "text.secondary", maxWidth: 360 }}>
                            Drag devices, frames (by their top bar) and port tabs. Ctrl+Z undoes.
                        </Typography>
                        <Button size="small" onClick={undoOne} disabled={undo.length === 0}>Undo</Button>
                        <Button size="small" onClick={cancelEdit} disabled={saving}>Cancel</Button>
                        <Button size="small" variant="contained" onClick={saveLayout} disabled={saving || undo.length === 0}>{saving ? "Saving…" : "Save layout"}</Button>
                    </>
                ) : (
                    <>
                        <FormControlLabel control={<Switch size="small" checked={showFree} onChange={e => setShowFree(e.target.checked)} />} label="Show free ports" />
                        <Button size="small" variant={connectMode ? "contained" : "outlined"}
                            onClick={() => { setConnectMode(!connectMode); setArmed(null); setPending(null); if (!connectMode) setShowFree(true); }}>
                            {connectMode ? (pending ? "Confirm below" : armed != null ? "Pick the other port…" : "Connect: pick a port") : "Connect"}
                        </Button>
                        <Button size="small" variant="outlined" onClick={() => setZonesOpen(true)}>Zones</Button>
                        <Button size="small" variant="outlined" onClick={() => setAddOpen(true)}>Add device</Button>
                        <Button size="small" variant="outlined" onClick={startEdit}>Edit layout</Button>
                    </>
                )}
            </Box>
            {pending && (
                <Paper variant="outlined" sx={{ p: 1, mb: 1.5, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", borderColor: "#ed6c02" }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{portLabel(portById.get(pending.a))} ↔ {portLabel(portById.get(pending.b))}</Typography>
                    <TextField select size="small" value={pending.status}
                        onChange={e => setPending({ ...pending, status: e.target.value === "planned" ? "planned" : "live" })} sx={{ minWidth: 110 }}>
                        <MenuItem value="live">live</MenuItem>
                        <MenuItem value="planned">planned</MenuItem>
                    </TextField>
                    <Button size="small" variant="contained" onClick={confirmLink}>Connect</Button>
                    <Button size="small" onClick={cancelLink}>Cancel</Button>
                    {actionError && <Typography color="error" sx={{ fontSize: 12 }}>{actionError}</Typography>}
                </Paper>
            )}

            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", mb: 1.5, fontSize: 12, color: "text.secondary" }}>
                {[["RJ45", theme.palette.background.paper], ["SFP+", SFP_BLUE], ["SFP+ with RJ45 module", MODULE_ORANGE]].map(([l, c]) => (
                    <Box key={l} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        <Box sx={{ width: 18, height: 13, bgcolor: c, border: `1.5px solid ${theme.palette.text.primary}`, borderRadius: "3px" }} />{l}
                    </Box>
                ))}
                {([["10G", "#1e6fd9", false], ["2.5G", "#2e7d32", false], ["1G or less", "#78909c", false], ["planned", "#78909c", true]] as const).map(([l, c, d]) => (
                    <Box key={l} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        <Box sx={{ width: 22, borderTop: `3px ${d ? "dashed" : "solid"} ${c}` }} />{l}
                    </Box>
                ))}
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Box sx={{ width: 22, height: 13, border: `4px solid transparent`, borderRadius: "2px",
                        borderImage: `repeating-linear-gradient(45deg, ${ZONE_RED} 0 3px, transparent 3px 6px) 4` }} />DMZ / untrusted zone
                </Box>
                <Box sx={{ flex: 1 }} />
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Wheel zooms the map; drag its background (or middle-drag) to move around.</Typography>
                <ButtonGroup size="small" variant="outlined">
                    <Button onClick={() => viewport.zoomAt(1 / 1.2)} title="Zoom out">−</Button>
                    <Button onClick={viewport.actualSize} title="Back to 100%" sx={{ fontVariantNumeric: "tabular-nums", minWidth: 56 }}>{Math.round(viewport.view.scale * 100)}%</Button>
                    <Button onClick={() => viewport.zoomAt(1.2)} title="Zoom in">+</Button>
                    <Button onClick={() => viewport.fit(bounds)} title="Fit the whole map">Fit</Button>
                </ButtonGroup>
            </Box>

            {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
            {actionError && !pending && <Typography color="error" sx={{ mb: 1, fontSize: 13 }}>{actionError}</Typography>}
            {problem && <Typography color="error" sx={{ mb: 1, fontSize: 13 }}>{problem}</Typography>}

            {loaded && graph.nodes.length === 0 ? (
                <Paper sx={{ p: 3 }}>
                    <Typography sx={{ fontSize: 14 }}>
                        No devices yet. Add a switch, router or machine with Add device: its ports come from the ports field on its Lab record
                        (a machine&#39;s from its NICs and motherboard). Frames appear for the Lab Spaces the devices are placed in.
                    </Typography>
                </Paper>
            ) : (
                <LabNetworkCanvas graph={graph} layout={layout} editing={editing} showFree={showFree || editing} viewport={viewport}
                    selected={selected} armed={armed} pendingPort={pending?.b ?? null}
                    onPort={onPort} onLink={id => { setSelected({ link: id }); setActionError(null); }} onEditNode={setEditNode}
                    onLayout={onLayout} onProblem={setProblem} />
            )}

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mt: 2 }}>
                <Paper sx={{ p: 2 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 1 }}>Selected</Typography>
                    {!sel && !selLink && <Typography sx={{ fontSize: 13, color: "text.disabled" }}>Click a port or a link.</Typography>}
                    {sel && (
                        <Box sx={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "3px 12px", fontSize: 13 }}>
                            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Port</Typography><Typography sx={{ fontSize: 13 }}>{portLabel(sel)}</Typography>
                            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Media</Typography><Typography sx={{ fontSize: 13 }}>{mediaTxt(sel.media)}, {speedTxt(sel.speedGb)}</Typography>
                            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Module</Typography><Typography sx={{ fontSize: 13 }}>{sel.moduleName || sel.moduleLabel || "none"}</Typography>
                            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Provided by</Typography><Typography sx={{ fontSize: 13 }}>{sel.sourceName || nodeById.get(sel.nodeId)?.refLine}</Typography>
                            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Connected to</Typography>
                            <Typography sx={{ fontSize: 13 }}>{selLink ? portLabel(otherEnd(selLink, sel)) : "free"}</Typography>
                        </Box>
                    )}
                    {selLink && (
                        <Box sx={{ mt: sel ? 1.5 : 0 }}>
                            {!sel && <Typography sx={{ fontSize: 13 }}>{portLabel(portById.get(selLink.portAId))} ↔ {portLabel(portById.get(selLink.portBId))}</Typography>}
                            <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.5 }}>Link #{selLink.id} · {speedTxt(selLink.speedGb)}</Typography>
                            <Box sx={{ display: "flex", gap: 1, alignItems: "center", mt: 1 }}>
                                <ToggleButtonGroup size="small" exclusive value={selLink.status} onChange={(_, v) => typeof v === "string" && setLinkStatus(selLink, v)}>
                                    <ToggleButton value="live">live</ToggleButton>
                                    <ToggleButton value="planned">planned</ToggleButton>
                                </ToggleButtonGroup>
                                <Button size="small" color="error" onClick={() => deleteLink(selLink.id)}>Remove link</Button>
                            </Box>
                        </Box>
                    )}
                </Paper>
                <Paper sx={{ p: 2 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 1 }}>Checks</Typography>
                    {graph.checks.length === 0 && <Typography sx={{ fontSize: 13, color: "text.disabled" }}>Nothing to report.</Typography>}
                    {graph.checks.map((c, i) => (
                        <Box key={i} sx={{ display: "flex", gap: 1, alignItems: "flex-start", mb: 0.75 }}>
                            {c.level === "warn" ? <WarningAmberIcon sx={{ fontSize: 18, color: "#ed6c02" }} />
                                : c.level === "ok" ? <CheckCircleIcon sx={{ fontSize: 18, color: "#2e7d32" }} />
                                : <InfoOutlinedIcon sx={{ fontSize: 18, color: "#1565c0" }} />}
                            <Typography sx={{ fontSize: 13 }}>{c.text}</Typography>
                        </Box>
                    ))}
                </Paper>
            </Box>

            <AddDeviceDialog open={addOpen} onClose={() => setAddOpen(false)} onSaved={load}
                graph={graph} machines={machines} components={components} spaces={spaces} />
            <EditDeviceDialog node={editNode} onClose={() => setEditNode(null)} onSaved={load}
                graph={graph} components={components} spaces={spaces} />
            <ZonesDialog open={zonesOpen} onClose={() => setZonesOpen(false)} onSaved={load} graph={graph} />
        </Box>
    );
};

export default HomelabNetwork;
