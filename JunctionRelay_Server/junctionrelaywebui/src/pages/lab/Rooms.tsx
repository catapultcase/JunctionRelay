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
import { Box, Button, MenuItem, Paper, TextField, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { usePageTitle } from "../../hooks/usePageTitle";

// The ROOMS page - where everything is, in one tree: a room, the racks and desks inside it (Lab_Spaces.ParentSpaceId), what
// each holds top U first (Lab_Placements), and a machine's parts. Spaces stays the rack editor and Machines
// the machine editor; this page reads both and only writes a placement ("Place…"). "Not in a room yet" is the
// to-do list, with hints from the network page and the machines' free-text location notes.

interface Space { id: number; name: string; kind: string; parentSpaceId: number | null; heightU: number | null; status: string; sortOrder?: number }
interface Placement {
    id: number; spaceId: number; machineId: number | null; componentId: number | null; positionU: number | null; heightU: number | null;
    face: string; status: string; occupantLabel: string | null; occupantKind: string | null;
    onPlacementId: number | null;       // sits on this shelf/drawer/tray
}
interface Machine { id: number; name: string; kind: string | null; role: string | null; status: string; location: string | null; componentCount: number }
interface Component { id: number; name: string | null; manufacturer: string | null; model: string | null; type: string; status: string; currentMachineId: number | null; nickname: string | null }
interface NetNode { machineId: number | null; componentId: number | null; displayName: string | null; frameSpaceName: string | null; subSpaceName: string | null }
type Sel = { path: string[]; name: string; kind: "machine" | "component" | "space"; id: number; status?: string; parts?: number };

const RETIRED = ["sold", "dead", "damaged", "lost", "disposed"];
const compName = (c: Component) => c.name || [c.manufacturer, c.model].filter(Boolean).join(" ") || `#${c.id}`;
const uText = (p: Placement, all: Placement[]) => {
    if (p.onPlacementId != null) return `on ${all.find(x => x.id === p.onPlacementId)?.occupantLabel ?? "a shelf"}`;
    return p.positionU == null ? "-" : (p.heightU ?? 1) > 1 ? `U${p.positionU}-${p.positionU + (p.heightU ?? 1) - 1}` : `U${p.positionU}`;
};
// a thing on a shelf sorts with the shelf (just under it)
const effectiveU = (p: Placement, all: Placement[]) =>
    p.onPlacementId != null ? (all.find(x => x.id === p.onPlacementId)?.positionU ?? -1) - 0.5 : p.positionU ?? -1;

const HomelabRooms = () => {
    usePageTitle("Homelab Rooms");
    const navigate = useNavigate();
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [placements, setPlacements] = useState<Placement[]>([]);
    const [machines, setMachines] = useState<Machine[]>([]);
    const [components, setComponents] = useState<Component[]>([]);
    const [nodes, setNodes] = useState<NetNode[]>([]);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const [sR, pR, mR, cR, nR] = await Promise.all([
                fetch("/api/lab/spaces"), fetch("/api/lab/spaces/placements"), fetch("/api/lab/machines"),
                fetch("/api/lab/components"), fetch("/api/lab/network"),
            ]);
            if (!sR.ok || !pR.ok) throw new Error("Could not read the spaces");
            setSpaces(await sR.json());
            setPlacements(await pR.json());
            if (mR.ok) setMachines(await mR.json());
            if (cR.ok) setComponents(await cR.json());
            if (nR.ok) setNodes((await nR.json()).nodes ?? []);
            setError(null);
        } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const byId = useMemo(() => new Map(spaces.map(s => [s.id, s])), [spaces]);
    const childrenOf = useCallback((id: number | null) => spaces.filter(s => s.parentSpaceId === id && s.status !== "retired")
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)), [spaces]);
    const pathOf = useCallback((id: number) => {
        const out: string[] = [];
        const seen = new Set<number>();
        for (let s = byId.get(id); s && !seen.has(s.id); s = s.parentSpaceId ? byId.get(s.parentSpaceId) : undefined) { seen.add(s.id); out.unshift(s.name); }
        return out;
    }, [byId]);
    const rooms = useMemo(() => childrenOf(null).filter(s => s.kind === "Room"), [childrenOf]);
    const looseSpaces = useMemo(() => childrenOf(null).filter(s => s.kind !== "Room"), [childrenOf]);
    const partsOf = useCallback((machineId: number) => components.filter(c => c.currentMachineId === machineId && !RETIRED.includes(c.status))
        .sort((a, b) => a.type.localeCompare(b.type) || compName(a).localeCompare(compName(b))), [components]);

    // ---- not in a room yet ----
    const placedMachines = useMemo(() => new Set(placements.map(p => p.machineId).filter(Boolean)), [placements]);
    const placedComponents = useMemo(() => new Set(placements.map(p => p.componentId).filter(Boolean)), [placements]);
    const hintFor = (machineId: number | null, componentId: number | null, location?: string | null) => {
        const n = nodes.find(x => (machineId != null && x.machineId === machineId) || (componentId != null && x.componentId === componentId));
        const bits: string[] = [];
        if (n?.frameSpaceName) bits.push(`network page: ${n.subSpaceName ? `${n.frameSpaceName} › ${n.subSpaceName}` : n.frameSpaceName}`);
        if (location?.trim()) bits.push(`location note: ${location.trim()}`);
        return bits.join(" · ") || "no hint yet";
    };
    const unplacedMachines = machines.filter(m => m.status !== "retired" && !placedMachines.has(m.id))
        .sort((a, b) => a.name.localeCompare(b.name));
    const portable = unplacedMachines.filter(m => (m.kind ?? "").toLowerCase() === "laptop");
    const unplacedFixed = unplacedMachines.filter(m => (m.kind ?? "").toLowerCase() !== "laptop");
    // Standalone parts that matter for "where": the ones on the network page, not in a machine, not placed.
    const unplacedParts = components.filter(c => nodes.some(n => n.componentId === c.id) && c.currentMachineId == null
        && !placedComponents.has(c.id) && !RETIRED.includes(c.status));

    // ---- place ----
    const [placing, setPlacing] = useState<string | null>(null);
    const [placeSpace, setPlaceSpace] = useState<number | "">("");
    const [placeU, setPlaceU] = useState("");
    const [placeError, setPlaceError] = useState<string | null>(null);
    const targets = useMemo(() => spaces.filter(s => s.status !== "retired").map(s => ({ id: s.id, label: pathOf(s.id).join(" › "), heightU: s.heightU }))
        .sort((a, b) => a.label.localeCompare(b.label)), [spaces, pathOf]);
    const startPlace = (key: string) => { setPlacing(placing === key ? null : key); setPlaceSpace(""); setPlaceU(""); setPlaceError(null); };
    const doPlace = async (machineId: number | null, componentId: number | null) => {
        if (placeSpace === "") return;
        const res = await fetch("/api/lab/spaces/placements", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: 0, spaceId: placeSpace, machineId, componentId, positionU: placeU.trim() ? Number(placeU) : null,
                heightU: placeU.trim() ? 1 : null, face: "front", rotation: 0, status: "installed" }),
        });
        if (!res.ok) { setPlaceError(await res.text()); return; }
        setPlacing(null);
        await load();
    };

    // ---- selection ----
    const [sel, setSel] = useState<Sel | null>(null);
    const [openParts, setOpenParts] = useState<Set<number>>(new Set());
    const toggleParts = (id: number) => setOpenParts(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

    const spaceCard = (s: Space, depth = 0): React.ReactElement => {
        const mine = placements.filter(p => p.spaceId === s.id).sort((a, b) => effectiveU(b, placements) - effectiveU(a, placements) || a.id - b.id);
        const used = mine.filter(p => p.face !== "rear").reduce((t, p) => t + (p.positionU != null ? p.heightU ?? 1 : 0), 0);
        const kids = childrenOf(s.id);
        const isRoom = s.kind === "Room";
        const fill = s.heightU ? `${Math.max(0, s.heightU - used)}U free of ${s.heightU}` : `${mine.length} item${mine.length === 1 ? "" : "s"}`;
        const rows = mine.map(p => {
            const isM = p.occupantKind === "machine" && p.machineId != null;
            const m = isM ? machines.find(x => x.id === p.machineId) : undefined;
            const c = !isM && p.componentId != null ? components.find(x => x.id === p.componentId) : undefined;
            // the placement's own label first: it is what the Spaces page shows, and a part record can lack a name
            const name = m?.name ?? p.occupantLabel ?? (c ? compName(c) : "?");
            return (
                <Box key={p.id} sx={{ borderTop: "1px solid", borderColor: "divider", py: 0.4 }}>
                    <Box sx={{ display: "grid", gridTemplateColumns: "62px minmax(0,1fr) auto", gap: 1, alignItems: "baseline" }}>
                        <Typography sx={{ fontFamily: "monospace", fontSize: 11, color: "text.secondary" }}>{uText(p, placements)}</Typography>
                        <Typography component="button" type="button"
                            onClick={() => setSel({ path: [...pathOf(s.id), uText(p, placements)].filter(x => x !== "-"), name, kind: isM ? "machine" : "component",
                                id: (isM ? p.machineId : p.componentId) ?? 0, status: m?.status ?? c?.status, parts: m?.componentCount })}
                            sx={{ textAlign: "left", border: 0, bgcolor: "transparent", p: 0, cursor: "pointer", font: "inherit", fontSize: 12.5,
                                fontWeight: isM ? 700 : 400, color: isM ? "primary.main" : "text.primary", overflowWrap: "anywhere" }}>
                            {name}{p.status === "planned" && <Box component="span" sx={{ ml: 0.75, fontSize: 10, fontWeight: 700, color: "warning.main" }}>planned</Box>}
                            {p.face === "rear" && <Box component="span" sx={{ ml: 0.75, fontSize: 10, color: "text.secondary" }}>rear</Box>}
                        </Typography>
                        {isM ? (
                            <Typography component="button" type="button" onClick={() => toggleParts(p.machineId!)}
                                sx={{ border: 0, bgcolor: "transparent", p: 0, cursor: "pointer", font: "inherit", fontSize: 10.5, color: "text.secondary", textDecoration: "underline" }}>
                                {m?.componentCount ?? 0} parts
                            </Typography>
                        ) : <Typography sx={{ fontSize: 10.5, color: "text.secondary" }}>{c?.type ?? "part"}</Typography>}
                    </Box>
                    {isM && openParts.has(p.machineId!) && (
                        <Box sx={{ ml: "70px", mt: 0.5, mb: 0.5, p: 1, border: "1px solid", borderColor: "divider", borderRadius: "5px", display: "grid", gap: 0.25 }}>
                            {partsOf(p.machineId!).map(pc => (
                                <Box key={pc.id} sx={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 1 }}>
                                    <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>{pc.type}</Typography>
                                    <Typography sx={{ fontSize: 11.5 }}>{compName(pc)}{pc.nickname ? ` "${pc.nickname}"` : ""}</Typography>
                                </Box>
                            ))}
                            {partsOf(p.machineId!).length === 0 && <Typography sx={{ fontSize: 11.5, color: "text.disabled" }}>no parts recorded</Typography>}
                        </Box>
                    )}
                </Box>
            );
        });
        return (
            <Box key={s.id} sx={{ bgcolor: "background.default", border: "1px solid", borderColor: "divider", borderTop: `4px ${isRoom ? "dashed" : "solid"}`,
                borderTopColor: isRoom ? "text.disabled" : "success.main", borderRadius: "6px", p: "10px 12px", minWidth: 0, ml: depth ? 0 : 0 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", mb: 0.5 }}>
                    <Typography component="button" type="button" onClick={() => setSel({ path: pathOf(s.id).slice(0, -1), name: s.name, kind: "space", id: s.id })}
                        sx={{ border: 0, bgcolor: "transparent", p: 0, cursor: "pointer", font: "inherit", fontSize: 14, fontWeight: 800, color: "text.primary" }}>
                        {depth === 0 && isRoom ? "In the room, not in a rack" : s.name}
                    </Typography>
                    <Box component="span" sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "text.secondary", border: "1px solid", borderColor: "divider", borderRadius: "8px", px: 0.75 }}>{s.kind}</Box>
                    <Box sx={{ flex: 1 }} />
                    <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{fill}</Typography>
                </Box>
                {rows}
                {mine.length === 0 && kids.length === 0 && <Typography sx={{ fontSize: 12, color: "text.disabled" }}>empty</Typography>}
                {kids.length > 0 && depth > 0 && (
                    <Box sx={{ display: "grid", gap: 1, mt: 1 }}>{kids.map(k => spaceCard(k, depth + 1))}</Box>
                )}
            </Box>
        );
    };

    const roomPaper = (r: Space) => {
        const kids = childrenOf(r.id);
        const direct = placements.filter(p => p.spaceId === r.id);
        const count = direct.length + kids.reduce((t, k) => t + placements.filter(p => p.spaceId === k.id).length, 0);
        return (
            <Paper key={r.id} sx={{ p: "14px 16px" }}>
                <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5, mb: 1.5, flexWrap: "wrap" }}>
                    <Typography sx={{ fontSize: 17, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>{r.name}</Typography>
                    <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{kids.length} racks and desks · {count} items</Typography>
                </Box>
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 1.5 }}>
                    {kids.map(k => spaceCard(k, 1))}
                    {direct.length > 0 && spaceCard(r, 0)}
                </Box>
            </Paper>
        );
    };

    const todoRow = (key: string, name: string, hint: string, machineId: number | null, componentId: number | null, isMachine: boolean) => (
        <Box key={key} sx={{ border: "1px solid", borderColor: "divider", borderRadius: "6px", p: "6px 8px", bgcolor: "background.default" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: isMachine ? "primary.main" : "text.primary", flex: 1, minWidth: 0 }}>{name}</Typography>
                <Button size="small" variant="outlined" onClick={() => startPlace(key)} sx={{ py: 0, minWidth: 0 }}>{placing === key ? "Cancel" : "Place…"}</Button>
            </Box>
            <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{hint}</Typography>
            {placing === key && (
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 64px auto", gap: 0.75, mt: 0.75, alignItems: "center" }}>
                    <TextField select size="small" label="Where" value={placeSpace} onChange={e => setPlaceSpace(e.target.value === "" ? "" : Number(e.target.value))}>
                        {targets.map(t => <MenuItem key={t.id} value={t.id}>{t.label}</MenuItem>)}
                    </TextField>
                    <TextField size="small" label="U" value={placeU} onChange={e => setPlaceU(e.target.value)}
                        disabled={placeSpace === "" || !targets.find(t => t.id === placeSpace)?.heightU} />
                    <Button size="small" variant="contained" disabled={placeSpace === ""} onClick={() => doPlace(machineId, componentId)}>Place</Button>
                    {placeError && <Typography color="error" sx={{ gridColumn: "1 / -1", fontSize: 11.5 }}>{placeError}</Typography>}
                </Box>
            )}
        </Box>
    );

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>Rooms</Typography>
            <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1.5, maxWidth: "80ch" }}>
                Where everything is: each room, the racks and desks inside it, what each holds (top U first) and a machine&#39;s parts.
                A rack or desk joins a room through &quot;Inside&quot; on the Spaces page (or lab_update_space parent). Spaces stays the rack editor.
            </Typography>
            {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
                {[`${rooms.length} rooms`, `${spaces.filter(s => s.kind !== "Room").length} racks and desks`,
                  `${placedMachines.size} machines placed`, `${unplacedFixed.length} machines not in a room`, `${unplacedParts.length} network parts not in a room`]
                    .map(t => <Box key={t} sx={{ fontSize: 12, border: "1px solid", borderColor: "divider", bgcolor: "background.paper", borderRadius: "14px", px: 1.25, py: 0.25 }}>{t}</Box>)}
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1fr) 340px" }, gap: 2, alignItems: "start" }}>
                <Box sx={{ display: "grid", gap: 2 }}>
                    {rooms.map(roomPaper)}
                    {looseSpaces.length > 0 && (
                        <Paper sx={{ p: "14px 16px" }}>
                            <Typography sx={{ fontSize: 15, fontWeight: 800, mb: 0.5 }}>Spaces not in a room yet</Typography>
                            <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1.5 }}>Set &quot;Inside&quot; on the Spaces page to put them in a room.</Typography>
                            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 1.5 }}>{looseSpaces.map(s => spaceCard(s, 1))}</Box>
                        </Paper>
                    )}
                    {rooms.length === 0 && looseSpaces.length === 0 && (
                        <Paper sx={{ p: 3 }}><Typography sx={{ fontSize: 14 }}>No spaces yet. Add rooms, racks and desks on the Spaces page.</Typography></Paper>
                    )}
                </Box>
                <Box sx={{ display: "grid", gap: 2, position: { lg: "sticky" }, top: { lg: 80 } }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography sx={{ fontSize: 15, fontWeight: 700, mb: 1 }}>Selected</Typography>
                        {!sel ? <Typography sx={{ fontSize: 13, color: "text.disabled" }}>Click a machine, a part or a space.</Typography> : (
                            <>
                                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{[...sel.path, sel.name].join(" › ")}</Typography>
                                <Typography sx={{ fontSize: 12.5, color: "text.secondary", mt: 0.5 }}>
                                    {sel.kind}{sel.status ? ` · ${sel.status}` : ""}{sel.parts != null ? ` · ${sel.parts} parts` : ""}
                                </Typography>
                                <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                                    {sel.kind === "machine" && <Button size="small" onClick={() => navigate(`/homelab/configure-machine/${sel.id}`)}>Open machine</Button>}
                                    {sel.kind === "component" && <Button size="small" onClick={() => navigate(`/homelab/component/${sel.id}`)}>Open part</Button>}
                                    <Button size="small" onClick={() => navigate("/homelab/spaces")}>Spaces</Button>
                                </Box>
                            </>
                        )}
                    </Paper>
                    <Paper sx={{ p: 2, display: "grid", gap: 1 }}>
                        <Typography sx={{ fontSize: 15, fontWeight: 700 }}>Not in a room yet</Typography>
                        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                            Machines and network parts with no place. Hints come from the network page and the machines&#39; location notes.
                        </Typography>
                        {unplacedFixed.length > 0 && <Typography sx={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: "text.secondary", mt: 0.5 }}>Machines</Typography>}
                        {unplacedFixed.map(m => todoRow(`m${m.id}`, m.name, hintFor(m.id, null, m.location), m.id, null, true))}
                        {unplacedParts.length > 0 && <Typography sx={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: "text.secondary", mt: 0.5 }}>Network parts</Typography>}
                        {unplacedParts.map(c => todoRow(`c${c.id}`, compName(c), hintFor(null, c.id), null, c.id, false))}
                        {portable.length > 0 && (
                            <Typography sx={{ fontSize: 11.5, color: "text.secondary", mt: 0.5 }}>
                                Portable, so not listed: {portable.map(m => m.name).join(", ")}.
                            </Typography>
                        )}
                        {unplacedFixed.length === 0 && unplacedParts.length === 0 && <Typography sx={{ fontSize: 13, color: "text.disabled" }}>Everything has a place.</Typography>}
                    </Paper>
                </Box>
            </Box>
        </Box>
    );
};

export default HomelabRooms;
