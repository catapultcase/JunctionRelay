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
    Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton,
    MenuItem, Paper, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography, useTheme,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { usePageTitle } from "../../hooks/usePageTitle";

// The NETWORK page - the topology of machines and switches, their ports and links, driven by the Lab
// inventory (a switch brings its ports with it) and editable here and over MCP. No site data is in this file:
//   * A DEVICE is a Lab machine, a Lab component (a switch, a modem) or a placeholder for something not
//     bought yet - api/lab/network nodes. Its FRAME is the Lab Space it is placed in (or the space set on it).
//   * PORTS come from each record's 'ports' spec field when it is added ("4x RJ45 2.5G, 2x SFP+ 10G"; a
//     machine sums its NICs and motherboard), then are ordinary rows: name, media, speed, card edge, module.
//   * LINKS join port to port, live or planned; a link's speed is the slower end, never typed.
//   * ZONES (dmz | untrusted) are walled-off parts of the network, drawn as a red hatched band around their
//     devices - one outline per frame they reach. A device is in at most one zone.
// Edited here or with lab_set_network_node / lab_set_network_port / lab_connect / lab_set_network_zone / lab_delete_network.
// THE LAYOUT IS COMPUTED from Row/Position and port counts - no pixel positions are stored.

interface NetNode {
    id: number; machineId: number | null; componentId: number | null; label: string | null; portsSpec: string | null;
    status: string; spaceId: number | null; row: number; position: number; notes: string | null;
    displayName: string | null; refLine: string | null; resolvedSpaceId: number | null; resolvedSpaceName: string | null;
    placementNote: string | null; missing: boolean;
    frameSpaceId: number | null; frameSpaceName: string | null; subSpaceId: number | null; subSpaceName: string | null;
}
interface NetPort {
    id: number; nodeId: number; name: string; media: string; speedGb: number | null; side: string; position: number;
    moduleComponentId: number | null; moduleLabel: string | null; sourceComponentId: number | null; notes: string | null;
    moduleName: string | null; sourceName: string | null;
}
interface NetLink { id: number; portAId: number; portBId: number; status: string; notes: string | null; speedGb: number | null }
interface NetZone { id: number; name: string; kind: string; notes: string | null; nodeIds: number[] }
interface NetCheck { level: string; text: string }
interface Graph { nodes: NetNode[]; ports: NetPort[]; links: NetLink[]; zones: NetZone[]; checks: NetCheck[] }
interface LabMachine { id: number; name: string; os: string | null }
interface LabComponent { id: number; name: string | null; manufacturer: string | null; model: string | null; type: string; status: string }
interface LabSpace { id: number; name: string; sortOrder?: number; status?: string }

// Port-tab text never spills past the tab's edges.
const TAB_TXT = { display: "block", color: "inherit", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "clip", px: "1px" } as const;
const TAB_W = 46, TAB_H = 34, STEP_V = 40, STEP_H = 52, NODE_MIN_W = 160, NODE_MIN_H = 104;
// Room between cards, rows and frames: links run in these gaps, so they are wide. LANE is how far apart
// parallel runs that would share a line are pushed.
const NODE_GAP = 150, ROW_GAP = 150, FRAME_PAD = 84, FRAME_LABEL = 40, FRAME_GAP = 140, BAND_GAP = 160, LANE = 16;
// A rack or desk drawn inside its room's frame: its own padding, label and the gap between neighbours.
const SUB_PAD = 64, SUB_LABEL = 30, SUB_GAP = 110;
// A zone's band sits this far outside its devices' cards: clear of their port tabs, inside the frame's padding.
const ZONE_PAD = 60, ZONE_BAND = 9, ZONE_RED = "#d32f2f";
const ZONE_KINDS = [["untrusted", "Untrusted"], ["dmz", "DMZ"]] as const;
const zoneKindTxt = (k: string) => ZONE_KINDS.find(x => x[0] === k)?.[1] ?? k;
const MEDIA = [["rj45", "RJ45"], ["sfp", "SFP+"], ["sfp28", "SFP28"], ["qsfp", "QSFP"], ["other", "Other"]] as const;
const SIDES = ["left", "right", "top", "bottom"] as const;
const SFP_BLUE = "#4a8fe0", MODULE_ORANGE = "#f0892c";
const speedTxt = (g: number | null | undefined) => (g == null ? "?" : g >= 1 ? `${+g.toFixed(2)}G` : `${Math.round(g * 1000)}M`);
const lineColour = (g: number | null | undefined) => (g == null ? "#78909c" : g >= 10 ? "#1e6fd9" : g >= 2.5 ? "#2e7d32" : "#78909c");
const mediaTxt = (m: string) => MEDIA.find(x => x[0] === m)?.[1] ?? m;
const compName = (c: LabComponent) => c.name || [c.manufacturer, c.model].filter(Boolean).join(" ") || `#${c.id}`;

type Rect = { x: number; y: number; w: number; h: number };

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
            setGraph(await gRes.json());
            if (mRes.ok) setMachines(await mRes.json());
            if (cRes.ok) setComponents(await cRes.json());
            if (sRes.ok) setSpaces(await sRes.json());
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load the network");
        } finally { setLoaded(true); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const putJson = (url: string, method: string, body?: unknown) =>
        fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

    // ---- what is drawn ----
    const [showFree, setShowFree] = useState(false);
    const linkOf = useMemo(() => {
        const m = new Map<number, NetLink>();
        graph.links.forEach(l => { m.set(l.portAId, l); m.set(l.portBId, l); });
        return m;
    }, [graph.links]);
    const portById = useMemo(() => new Map(graph.ports.map(p => [p.id, p])), [graph.ports]);
    const nodeById = useMemo(() => new Map(graph.nodes.map(n => [n.id, n])), [graph.nodes]);
    const visiblePorts = useCallback((nodeId: number) =>
        graph.ports.filter(p => p.nodeId === nodeId && (showFree || linkOf.has(p.id)))
            .sort((a, b) => a.side.localeCompare(b.side) || a.position - b.position || a.id - b.id), [graph.ports, linkOf, showFree]);

    // ---- layout, computed ----
    const layout = useMemo(() => {
        const size = new Map<number, { w: number; h: number }>();
        const sideIndex = new Map<number, number>();
        for (const n of graph.nodes) {
            const ps = visiblePorts(n.id);
            const per: Record<string, number> = { left: 0, right: 0, top: 0, bottom: 0 };
            ps.forEach(p => { sideIndex.set(p.id, per[p.side] ?? 0); per[p.side] = (per[p.side] ?? 0) + 1; });
            size.set(n.id, {
                w: Math.max(NODE_MIN_W, 24 + Math.max(per.top, per.bottom) * STEP_H),
                h: Math.max(NODE_MIN_H, 30 + Math.max(per.left, per.right) * STEP_V),
            });
        }
        const order = (a: NetNode, b: NetNode) => a.row - b.row || a.position - b.position || a.id - b.id;
        // A group laid out as rows of cards; returns each node's offset and the group's size.
        const place = (nodes: NetNode[]) => {
            const rows = [...new Set(nodes.map(n => n.row))].sort((a, b) => a - b);
            const pos = new Map<number, { x: number; y: number }>();
            let y = 0, width = 0;
            for (const r of rows) {
                const inRow = nodes.filter(n => n.row === r).sort(order);
                let x = 0;
                const tallest = Math.max(...inRow.map(n => size.get(n.id)!.h));
                inRow.forEach(n => { pos.set(n.id, { x, y }); x += size.get(n.id)!.w + NODE_GAP; });
                width = Math.max(width, x - NODE_GAP);
                y += tallest + ROW_GAP;
            }
            return { pos, w: width, h: Math.max(0, y - ROW_GAP) };
        };
        const spaceOrder = (id: number) => {
            const s = spaces.find(x => x.id === id);
            return [s?.sortOrder ?? 0, s?.name ?? ""] as const;
        };
        // Frames are top-level Spaces (rooms, or a rack with no room); a rack or desk inside a room is a
        // sub-frame within it, and devices placed in the room itself sit beside the sub-frames.
        const frameOf = (n: NetNode) => n.frameSpaceId ?? n.resolvedSpaceId;
        const byOrder = (a: number, b: number) => spaceOrder(a)[0] - spaceOrder(b)[0] || spaceOrder(a)[1].localeCompare(spaceOrder(b)[1]);
        const framed = [...new Set(graph.nodes.map(frameOf).filter((x): x is number => x != null))].sort(byOrder);
        const outside = graph.nodes.filter(n => frameOf(n) == null);
        const above = place(outside.filter(n => n.row <= 1));
        const below = place(outside.filter(n => n.row >= 2));

        const rects = new Map<number, Rect>();
        const frames: (Rect & { id: string; name: string; sub: boolean })[] = [];
        const top0 = TAB_H + 16;
        const framesTop = above.h > 0 ? top0 + above.h + BAND_GAP : top0;
        let x = TAB_W + 16;
        for (const fid of framed) {
            const members = graph.nodes.filter(n => frameOf(n) === fid);
            const fname = members[0]?.frameSpaceName ?? members[0]?.resolvedSpaceName ?? `Space #${fid}`;
            // devices in the room itself first, then each rack/desk in space order
            const subIds = [...new Set(members.map(n => n.subSpaceId ?? 0))].sort((a, b) => (a === 0 ? -1 : b === 0 ? 1 : byOrder(a, b)));
            const subs = subIds.map(sid => {
                const nodes = members.filter(n => (n.subSpaceId ?? 0) === sid);
                const g = place(nodes);
                const pad = sid ? SUB_PAD : 0;
                return { sid, name: nodes[0]?.subSpaceName ?? "", g, w: g.w + pad * 2, h: g.h + pad * 2 + (sid ? SUB_LABEL : 0), pad };
            });
            const innerW = subs.reduce((t, sg) => t + sg.w, 0) + SUB_GAP * Math.max(0, subs.length - 1);
            const innerH = Math.max(0, ...subs.map(sg => sg.h));
            const fw = innerW + FRAME_PAD * 2, fh = innerH + FRAME_PAD * 2 + FRAME_LABEL;
            frames.push({ id: `f${fid}`, name: fname, sub: false, x, y: framesTop, w: fw, h: fh });
            let sx = x + FRAME_PAD;
            for (const sg of subs) {
                const sy = framesTop + FRAME_PAD;
                if (sg.sid) frames.push({ id: `s${sg.sid}`, name: sg.name, sub: true, x: sx, y: sy, w: sg.w, h: sg.h });
                sg.g.pos.forEach((p, id) => rects.set(id, { x: sx + sg.pad + p.x, y: sy + sg.pad + p.y, ...size.get(id)! }));
                sx += sg.w + SUB_GAP;
            }
            x += fw + FRAME_GAP;
        }
        const framesW = Math.max(0, x - FRAME_GAP);
        const framesH = frames.length ? Math.max(...frames.filter(f => !f.sub).map(f => f.h)) : 0;
        const totalW = Math.max(framesW, above.w + TAB_W * 2, below.w + TAB_W * 2, 900);
        const center = (bandW: number) => Math.max(TAB_W + 16, (totalW - bandW) / 2);
        above.pos.forEach((p, id) => rects.set(id, { x: center(above.w) + p.x, y: top0 + p.y, ...size.get(id)! }));
        const belowTop = (frames.length ? framesTop + framesH : framesTop) + (below.h > 0 ? BAND_GAP : 0);
        below.pos.forEach((p, id) => rects.set(id, { x: center(below.w) + p.x, y: belowTop + p.y, ...size.get(id)! }));
        const height = (below.h > 0 ? belowTop + below.h : frames.length ? framesTop + framesH : top0 + above.h) + TAB_H + 24;
        // Zones: one outline per frame a zone's devices are in, around their cards and port tabs.
        const zones: (Rect & { key: string; zone: NetZone })[] = [];
        const zoneWarnings: string[] = [];
        for (const z of graph.zones ?? []) {
            const members = graph.nodes.filter(n => z.nodeIds.includes(n.id) && rects.has(n.id));
            for (const f of [...new Set(members.map(n => frameOf(n) ?? -1))]) {
                const rs = members.filter(n => (frameOf(n) ?? -1) === f).map(n => rects.get(n.id)!);
                const x0 = Math.min(...rs.map(r => r.x)) - ZONE_PAD, y0 = Math.min(...rs.map(r => r.y)) - ZONE_PAD;
                const box = { x: x0, y: y0, w: Math.max(...rs.map(r => r.x + r.w)) + ZONE_PAD - x0, h: Math.max(...rs.map(r => r.y + r.h)) + ZONE_PAD - y0 };
                zones.push({ key: `z${z.id}f${f}`, zone: z, ...box });
                const caught = graph.nodes.filter(n => !z.nodeIds.includes(n.id) && (() => {
                    const r = rects.get(n.id);
                    return !!r && r.x < box.x + box.w && box.x < r.x + r.w && r.y < box.y + box.h && box.y < r.y + r.h;
                })());
                if (caught.length) zoneWarnings.push(`Zone ${z.name}'s outline takes in ${caught.map(n => n.displayName).join(", ")}, which ${caught.length > 1 ? "are" : "is"} not in it: move ${caught.length > 1 ? "them" : "it"} to another row, or the zone's devices next to each other.`);
            }
        }
        return { rects, frames, zones, zoneWarnings, width: totalW + TAB_W + 32, height, sideIndex };
    }, [graph.nodes, graph.zones, spaces, visiblePorts]);

    const tabRect = (p: NetPort): Rect | null => {
        const r = layout.rects.get(p.nodeId);
        const i = layout.sideIndex.get(p.id);
        if (!r || i == null) return null;
        if (p.side === "left") return { x: r.x - TAB_W, y: r.y + 14 + i * STEP_V, w: TAB_W, h: TAB_H };
        if (p.side === "right") return { x: r.x + r.w, y: r.y + 14 + i * STEP_V, w: TAB_W, h: TAB_H };
        if (p.side === "top") return { x: r.x + 12 + i * STEP_H, y: r.y - TAB_H, w: TAB_W, h: TAB_H };
        return { x: r.x + 12 + i * STEP_H, y: r.y + r.h, w: TAB_W, h: TAB_H };
    };
    const anchor = (p: NetPort) => {
        const t = tabRect(p);
        if (!t) return null;
        if (p.side === "left") return { x: t.x, y: t.y + TAB_H / 2, h: true };
        if (p.side === "right") return { x: t.x + TAB_W, y: t.y + TAB_H / 2, h: true };
        if (p.side === "top") return { x: t.x + TAB_W / 2, y: t.y, h: false };
        return { x: t.x + TAB_W / 2, y: t.y + TAB_H, h: false };
    };
    // Routes: out of each port, one bend line between them. Links whose bend lines would fall on the same
    // run (within a lane of each other and overlapping) are pushed into parallel lanes so no two share a line.
    const routes = (() => {
        type R = { a: { x: number; y: number; h: boolean }; b: { x: number; y: number; h: boolean }; kind: "hh" | "vv" | "hv" | "vh"; mid: number; lo: number; hi: number };
        const out = new Map<number, R>();
        for (const l of graph.links) {
            const pa = portById.get(l.portAId), pb = portById.get(l.portBId);
            const a = pa && anchor(pa), b = pb && anchor(pb);
            if (!a || !b) continue;
            const kind = a.h && b.h ? "hh" : !a.h && !b.h ? "vv" : a.h ? "hv" : "vh";
            const mid = kind === "hh" ? (a.x + b.x) / 2 : kind === "vv" ? (a.y + b.y) / 2 : 0;
            // the span the bend line covers, across it
            const [lo, hi] = kind === "hh" ? [Math.min(a.y, b.y), Math.max(a.y, b.y)] : [Math.min(a.x, b.x), Math.max(a.x, b.x)];
            out.set(l.id, { a, b, kind, mid, lo, hi });
        }
        for (const kind of ["hh", "vv"] as const) {
            const rs = [...out.entries()].filter(([, r]) => r.kind === kind).sort((x, y) => x[1].mid - y[1].mid || x[0] - y[0]);
            const placed: R[] = [];
            for (const [, r] of rs) {
                // nudge until no already-placed run sits on the same line over an overlapping span
                for (let tries = 0; tries < 12; tries++) {
                    const clash = placed.some(p => Math.abs(p.mid - r.mid) < LANE && p.lo < r.hi + 4 && r.lo < p.hi + 4);
                    if (!clash) break;
                    r.mid += (tries % 2 === 0 ? 1 : -1) * LANE * Math.ceil((tries + 1) / 2);
                }
                placed.push(r);
            }
        }
        return out;
    })();
    const pathOf = (l: NetLink) => {
        const r = routes.get(l.id);
        if (!r) return null;
        const { a, b } = r;
        if (r.kind === "hh") return `M${a.x},${a.y} H${r.mid} V${b.y} H${b.x}`;
        if (r.kind === "vv") return `M${a.x},${a.y} V${r.mid} H${b.x} V${b.y}`;
        return r.kind === "hv" ? `M${a.x},${a.y} H${b.x} V${b.y}` : `M${a.x},${a.y} V${b.y} H${b.x}`;
    };

    // ---- middle-click drag pans the map: its own box sideways, the page up and down ----
    const scrollRef = useRef<HTMLDivElement>(null);
    const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
    useEffect(() => {
        const move = (e: MouseEvent) => {
            const p = pan.current;
            if (!p || !scrollRef.current) return;
            scrollRef.current.scrollLeft = p.left - (e.clientX - p.x);
            window.scrollTo(window.scrollX, p.top - (e.clientY - p.y));
        };
        const up = (e: MouseEvent) => {
            if (e.button !== 1 || !pan.current) return;
            pan.current = null;
            document.body.style.cursor = "";
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
        return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    }, []);
    const startPan = (e: React.MouseEvent) => {
        if (e.button !== 1 || !scrollRef.current) return;
        e.preventDefault();   // no browser autoscroll
        pan.current = { x: e.clientX, y: e.clientY, left: scrollRef.current.scrollLeft, top: window.scrollY };
        document.body.style.cursor = "grabbing";
    };

    // ---- the mouse wheel zooms the map while the pointer is over it: the point
    // under the cursor stays put; the level is remembered in this browser; the readout by the legend resets it ----
    const ZOOM_KEY = "jr.network.zoom", ZOOM_MIN = 0.3, ZOOM_MAX = 2;
    const [zoom, setZoom] = useState(() => {
        try { const z = Number(localStorage.getItem(ZOOM_KEY)); return z >= ZOOM_MIN && z <= ZOOM_MAX ? z : 1; } catch { return 1; }
    });
    const zoomRef = useRef(zoom);
    const mapRef = useRef<HTMLDivElement>(null);
    const zoomAnchor = useRef<{ cx: number; cy: number; x: number; y: number } | null>(null);
    useEffect(() => {
        zoomRef.current = zoom;
        try { localStorage.setItem(ZOOM_KEY, String(zoom)); } catch { /* private window: forget it */ }
    }, [zoom]);
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            if (!mapRef.current) return;
            e.preventDefault();   // the page does not scroll while the wheel is zooming the map
            const old = zoomRef.current;
            const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, old * Math.exp(-e.deltaY * 0.0015)));
            if (next === old) return;
            const r = mapRef.current.getBoundingClientRect();
            zoomAnchor.current = { cx: e.clientX, cy: e.clientY, x: (e.clientX - r.left) / old, y: (e.clientY - r.top) / old };
            zoomRef.current = next;
            setZoom(next);
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, [graph.nodes.length]);
    // after the new scale is laid out, scroll so the map point that was under the cursor is under it again
    useLayoutEffect(() => {
        const a = zoomAnchor.current;
        zoomAnchor.current = null;
        if (!a || !mapRef.current || !scrollRef.current) return;
        const r = mapRef.current.getBoundingClientRect();
        scrollRef.current.scrollLeft += r.left + a.x * zoom - a.cx;
        window.scrollBy(0, r.top + a.y * zoom - a.cy);
    }, [zoom]);

    // ---- selection and connect mode ----
    const [selected, setSelected] = useState<{ port?: number; link?: number } | null>(null);
    const [connectMode, setConnectMode] = useState(false);
    const [armed, setArmed] = useState<number | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    // Two picks make a PENDING link; nothing is written until "Connect" on the confirm bar.
    const [pending, setPending] = useState<{ a: number; b: number; status: "live" | "planned" } | null>(null);
    const onPort = (id: number) => {
        setActionError(null);
        if (!connectMode || linkOf.has(id)) { setSelected({ port: id }); setArmed(null); setPending(null); return; }
        if (armed == null) { setArmed(id); setPending(null); return; }
        if (armed === id) { setArmed(null); setPending(null); return; }
        setPending({ a: armed, b: id, status: "live" });
    };
    const confirmLink = async () => {
        if (!pending) return;
        const res = await putJson("/api/lab/network/links", "POST", { portAId: pending.a, portBId: pending.b, status: pending.status });
        if (!res.ok) { setActionError(await res.text()); return; }
        const saved: NetLink = await res.json();
        setArmed(null); setPending(null);
        setSelected({ link: saved.id });
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

    // ---- add device ----
    const [addOpen, setAddOpen] = useState(false);
    const [addKind, setAddKind] = useState<"component" | "machine" | "placeholder">("component");
    const [addRecord, setAddRecord] = useState<number | null>(null);
    const [addLabel, setAddLabel] = useState("");
    const [addSpec, setAddSpec] = useState("");
    const [addSpace, setAddSpace] = useState<number | "">("");
    const [addRow, setAddRow] = useState("1");
    const [addPos, setAddPos] = useState("0");
    const [preview, setPreview] = useState<{ ports: NetPort[] | null; error: string | null }>({ ports: null, error: null });
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const onPage = useMemo(() => ({
        machines: new Set(graph.nodes.map(n => n.machineId).filter((x): x is number => x != null)),
        components: new Set(graph.nodes.map(n => n.componentId).filter((x): x is number => x != null)),
    }), [graph.nodes]);
    const componentOptions = useMemo(() => components
        .filter(c => !["sold", "disposed", "lost"].includes(c.status) && !onPage.components.has(c.id))
        // Networking gear first, then NICs, then everything else
        .sort((a, b) => (a.type === "Networking" ? 0 : a.type === "NIC" ? 1 : 2) - (b.type === "Networking" ? 0 : b.type === "NIC" ? 1 : 2)
            || compName(a).localeCompare(compName(b))), [components, onPage]);
    const addBody = () => ({
        id: 0, machineId: addKind === "machine" ? addRecord : null, componentId: addKind === "component" ? addRecord : null,
        label: addLabel.trim() || null, portsSpec: addKind === "placeholder" ? addSpec.trim() || null : null,
        status: addKind === "placeholder" ? "planned" : "live", spaceId: addSpace === "" ? null : addSpace,
        row: Number(addRow) || 0, position: Number(addPos) || 0, notes: null,
    });
    useEffect(() => {
        if (!addOpen || (addKind !== "placeholder" && addRecord == null)) { setPreview({ ports: null, error: null }); return; }
        const t = setTimeout(async () => {
            const res = await putJson("/api/lab/network/preview-ports", "POST", addBody());
            setPreview(res.ok ? { ports: await res.json(), error: null } : { ports: null, error: await res.text() });
        }, 250);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addOpen, addKind, addRecord, addSpec]);
    const openAdd = () => {
        setAddKind("component"); setAddRecord(null); setAddLabel(""); setAddSpec(""); setAddSpace("");
        setAddRow("1"); setAddPos(String(graph.nodes.length)); setSaveError(null); setAddOpen(true);
    };
    const saveAdd = async () => {
        setSaving(true); setSaveError(null);
        try {
            const res = await putJson("/api/lab/network/nodes", "POST", addBody());
            if (!res.ok) throw new Error(await res.text());
            await load();
            setAddOpen(false);
        } catch (e) { setSaveError(e instanceof Error ? e.message : "Save failed"); } finally { setSaving(false); }
    };

    // ---- zones: the Zones dialog adds, renames and deletes them; the device dialog puts a device in one ----
    const zoneOfNode = useMemo(() => {
        const m = new Map<number, NetZone>();
        (graph.zones ?? []).forEach(z => z.nodeIds.forEach(id => m.set(id, z)));
        return m;
    }, [graph.zones]);
    const [zonesOpen, setZonesOpen] = useState(false);
    const [zoneDraft, setZoneDraft] = useState<NetZone[]>([]);
    const [zoneError, setZoneError] = useState<string | null>(null);
    const openZones = () => { setZoneDraft((graph.zones ?? []).map(z => ({ ...z }))); setZoneError(null); setZonesOpen(true); };
    const setZone = (id: number, patch: Partial<NetZone>) => setZoneDraft(zs => zs.map(z => (z.id === id ? { ...z, ...patch } : z)));
    const saveZones = async () => {
        setSaving(true); setZoneError(null);
        try {
            for (const z of graph.zones ?? []) {
                if (zoneDraft.some(d => d.id === z.id)) continue;
                const res = await putJson(`/api/lab/network/zones/${z.id}`, "DELETE");
                if (!res.ok) throw new Error(`${z.name}: ${await res.text()}`);
            }
            for (const z of zoneDraft) {
                const orig = (graph.zones ?? []).find(x => x.id === z.id);
                if (orig && JSON.stringify(orig) === JSON.stringify(z)) continue;
                const res = await putJson(z.id > 0 ? `/api/lab/network/zones/${z.id}` : "/api/lab/network/zones", z.id > 0 ? "PUT" : "POST", { ...z, id: z.id > 0 ? z.id : 0 });
                if (!res.ok) throw new Error(`${z.name || "New zone"}: ${await res.text()}`);
            }
            await load();
            setZonesOpen(false);
        } catch (e) { setZoneError(e instanceof Error ? e.message : "Save failed"); await load(); } finally { setSaving(false); }
    };

    // ---- edit a device (the pencil): the node and its ports ----
    const [editNode, setEditNode] = useState<NetNode | null>(null);
    const [editZone, setEditZone] = useState<number | "">("");
    const [portDraft, setPortDraft] = useState<NetPort[]>([]);
    const [portsDeleted, setPortsDeleted] = useState<number[]>([]);
    const openEdit = (n: NetNode) => {
        setEditNode({ ...n });
        setEditZone(zoneOfNode.get(n.id)?.id ?? "");
        setPortDraft(graph.ports.filter(p => p.nodeId === n.id).map(p => ({ ...p }))
            .sort((a, b) => a.side.localeCompare(b.side) || a.position - b.position || a.id - b.id));
        setPortsDeleted([]); setSaveError(null);
    };
    const setPort = (id: number, patch: Partial<NetPort>) => setPortDraft(ps => ps.map(p => (p.id === id ? { ...p, ...patch } : p)));
    const addPort = () => {
        if (!editNode) return;
        const side = "bottom";
        const pos = Math.max(0, ...portDraft.filter(p => p.side === side).map(p => p.position)) + 1;
        setPortDraft(ps => [...ps, {
            id: -Date.now(), nodeId: editNode.id, name: `Port ${ps.length + 1}`, media: "rj45", speedGb: 1, side, position: pos,
            moduleComponentId: null, moduleLabel: null, sourceComponentId: null, notes: null, moduleName: null, sourceName: null,
        }]);
    };
    const saveEdit = async () => {
        if (!editNode) return;
        setSaving(true); setSaveError(null);
        try {
            let res = await putJson(`/api/lab/network/nodes/${editNode.id}`, "PUT", editNode);
            if (!res.ok) throw new Error(await res.text());
            if ((zoneOfNode.get(editNode.id)?.id ?? "") !== editZone) {
                res = await putJson(`/api/lab/network/nodes/${editNode.id}/zone`, "PUT", { zoneId: editZone === "" ? null : editZone });
                if (!res.ok) throw new Error(`Zone: ${await res.text()}`);
            }
            for (const id of portsDeleted) await putJson(`/api/lab/network/ports/${id}`, "DELETE");
            for (const p of portDraft) {
                const orig = graph.ports.find(x => x.id === p.id);
                if (orig && JSON.stringify(orig) === JSON.stringify(p)) continue;
                res = await putJson(p.id > 0 ? `/api/lab/network/ports/${p.id}` : "/api/lab/network/ports", p.id > 0 ? "PUT" : "POST", { ...p, id: p.id > 0 ? p.id : 0 });
                if (!res.ok) throw new Error(`${p.name}: ${await res.text()}`);
            }
            await load();
            setEditNode(null);
        } catch (e) { setSaveError(e instanceof Error ? e.message : "Save failed"); } finally { setSaving(false); }
    };
    const syncPorts = async () => {
        if (!editNode) return;
        const res = await putJson(`/api/lab/network/nodes/${editNode.id}/sync-ports`, "POST");
        const out = res.ok ? await res.json() : null;
        await load();
        setSaveError(out?.warning ?? (out ? `${out.portsAdded} port(s) added from its spec.` : await res.text()));
        const g: Graph = await (await fetch("/api/lab/network")).json();
        setPortDraft(g.ports.filter(p => p.nodeId === editNode.id).map(p => ({ ...p })));
    };
    const deleteNode = async () => {
        if (!editNode) return;
        setSaving(true);
        try { await putJson(`/api/lab/network/nodes/${editNode.id}`, "DELETE"); await load(); setEditNode(null); }
        finally { setSaving(false); }
    };

    // ---- drawing ----
    const portTab = (p: NetPort) => {
        const t = tabRect(p);
        if (!t) return null;
        const hasModule = p.moduleComponentId != null || !!p.moduleLabel;
        const sfp = p.media !== "rj45" && p.media !== "other";
        const bg = hasModule ? MODULE_ORANGE : sfp ? SFP_BLUE : theme.palette.background.paper;
        const fg = hasModule || sfp ? "#fff" : theme.palette.text.primary;
        const free = !linkOf.has(p.id);
        const isSel = selected?.port === p.id;
        const label = hasModule ? `${mediaTxt(p.media)}→RJ45` : sfp ? mediaTxt(p.media) : speedTxt(p.speedGb);
        const sub = hasModule || sfp ? speedTxt(p.speedGb) : "RJ45";
        return (
            <Box key={`p${p.id}`} component="button" type="button" onClick={() => onPort(p.id)}
                title={`${nodeById.get(p.nodeId)?.displayName ?? ""} · ${p.name}`}
                sx={{
                    position: "absolute", left: t.x, top: t.y, width: TAB_W, height: TAB_H, zIndex: 3, p: 0, cursor: "pointer",
                    border: `1.5px ${free ? "dashed" : "solid"} ${theme.palette.text.primary}`, borderRadius: "4px",
                    bgcolor: bg, color: fg, opacity: free ? 0.6 : 1, font: "inherit", lineHeight: 1.05,
                    outline: isSel ? "3px solid #d84315" : armed === p.id || pending?.b === p.id ? "3px solid #ed6c02" : "none", outlineOffset: "1px",
                }}>
                {/* A module port is three short lines (SFP+ / →RJ45 / 10G): one "SFP+→RJ45" line is wider than the tab. */}
                <Typography component="span" sx={{ ...TAB_TXT, fontSize: hasModule ? 9 : 10.5, fontWeight: 600, lineHeight: hasModule ? 1 : 1.05 }}>{hasModule ? mediaTxt(p.media) : label}</Typography>
                {hasModule && <Typography component="span" sx={{ ...TAB_TXT, fontSize: 9, fontWeight: 700, lineHeight: 1 }}>→RJ45</Typography>}
                <Typography component="span" sx={{ ...TAB_TXT, fontSize: hasModule ? 8.5 : 9, opacity: 0.9, lineHeight: hasModule ? 1 : 1.05 }}>{sub}</Typography>
            </Box>
        );
    };
    const nodeCard = (n: NetNode) => {
        const r = layout.rects.get(n.id);
        if (!r) return null;
        const all = graph.ports.filter(p => p.nodeId === n.id);
        const freeCount = all.filter(p => !linkOf.has(p.id)).length;
        const planned = n.status === "planned";
        return (
            <Paper key={`n${n.id}`} elevation={2} sx={{
                position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, zIndex: 2, p: "8px 10px",
                border: `1.5px ${planned ? "dashed" : "solid"} ${theme.palette.text.primary}`, borderRadius: "6px",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 0.25,
            }}>
                <IconButton size="small" title="Edit this device and its ports" onClick={() => openEdit(n)} sx={{ position: "absolute", top: 2, right: 2, p: 0.25 }}>
                    <EditIcon sx={{ fontSize: 14 }} />
                </IconButton>
                <Typography sx={{ fontSize: 14, fontWeight: 800, lineHeight: 1.15, px: 1.5 }}>{n.displayName}</Typography>
                <Typography sx={{ fontSize: 10, color: "text.secondary", lineHeight: 1.25 }}>
                    {n.refLine}{n.placementNote ? ` · ${n.placementNote}` : ""}
                </Typography>
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", justifyContent: "center", mt: 0.25 }}>
                    {planned && <Box component="span" sx={{ fontSize: 9.5, fontWeight: 700, color: "#fff", bgcolor: "#ed6c02", borderRadius: "8px", px: 0.75 }}>planned</Box>}
                    {n.missing && <Box component="span" sx={{ fontSize: 9.5, fontWeight: 700, color: "#fff", bgcolor: "#c62828", borderRadius: "8px", px: 0.75 }}>Lab record gone</Box>}
                    {all.length === 0 && <Box component="span" sx={{ fontSize: 9.5, color: "text.secondary" }}>no ports yet</Box>}
                    {!showFree && freeCount > 0 && (
                        <Box component="span" sx={{ fontSize: 9.5, fontFamily: "monospace", color: "text.secondary", border: "1px solid rgba(0,0,0,0.15)", borderRadius: "8px", px: 0.75 }}>
                            +{freeCount} free
                        </Box>
                    )}
                </Box>
            </Paper>
        );
    };

    const sel = selected?.port != null ? portById.get(selected.port) : undefined;
    const selLink = selected?.link != null ? graph.links.find(l => l.id === selected.link) : sel ? linkOf.get(sel.id) : undefined;
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
                <FormControlLabel control={<Switch size="small" checked={showFree} onChange={e => setShowFree(e.target.checked)} />} label="Show free ports" />
                <Button size="small" variant={connectMode ? "contained" : "outlined"}
                    onClick={() => { setConnectMode(!connectMode); setArmed(null); setPending(null); if (!connectMode) setShowFree(true); }}>
                    {connectMode ? (pending ? "Confirm below" : armed != null ? "Pick the other port…" : "Connect: pick a port") : "Connect"}
                </Button>
                <Button size="small" variant="outlined" onClick={openZones}>Zones</Button>
                <Button size="small" variant="outlined" onClick={openAdd}>Add device</Button>
            </Box>
            {pending && (
                <Paper variant="outlined" sx={{ p: 1, mb: 1.5, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", borderColor: "#ed6c02" }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{portLabel(graph.ports.find(x => x.id === pending.a))} ↔ {portLabel(graph.ports.find(x => x.id === pending.b))}</Typography>
                    <TextField select size="small" value={pending.status} onChange={e => setPending({ ...pending, status: e.target.value as "live" | "planned" })} sx={{ minWidth: 110 }}>
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
                {[["10G", "#1e6fd9", false], ["2.5G", "#2e7d32", false], ["1G or less", "#78909c", false], ["planned", "#78909c", true]].map(([l, c, d]) => (
                    <Box key={l as string} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        <Box sx={{ width: 22, borderTop: `3px ${d ? "dashed" : "solid"} ${c}` }} />{l as string}
                    </Box>
                ))}
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Box sx={{ width: 22, height: 13, border: `4px solid transparent`, borderRadius: "2px",
                        borderImage: `repeating-linear-gradient(45deg, ${ZONE_RED} 0 3px, transparent 3px 6px) 4` }} />DMZ / untrusted zone
                </Box>
                <Box sx={{ flex: 1 }} />
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Middle-click and drag to move around the map; the wheel zooms it.</Typography>
                <Button size="small" onClick={() => setZoom(1)} title="Back to 100%" sx={{ minWidth: 0, py: 0, fontVariantNumeric: "tabular-nums" }}>
                    {Math.round(zoom * 100)}%
                </Button>
            </Box>

            {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
            {actionError && <Typography color="error" sx={{ mb: 1, fontSize: 13 }}>{actionError}</Typography>}

            {loaded && graph.nodes.length === 0 ? (
                <Paper sx={{ p: 3 }}>
                    <Typography sx={{ fontSize: 14 }}>
                        No devices yet. Add a switch, router or machine with Add device: its ports come from the ports field on its Lab record
                        (a machine&#39;s from its NICs and motherboard). Frames appear for the Lab Spaces the devices are placed in.
                    </Typography>
                </Paper>
            ) : (
                <Paper ref={scrollRef} onMouseDown={startPan} onAuxClick={e => e.button === 1 && e.preventDefault()} sx={{ p: 2, overflowX: "auto" }}>
                    <Box sx={{ position: "relative", width: layout.width * zoom, height: layout.height * zoom }}>
                    <Box ref={mapRef} sx={{ position: "absolute", left: 0, top: 0, width: layout.width, height: layout.height, transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
                        {layout.frames.map(f => (
                            <Box key={f.id} sx={{
                                position: "absolute", left: f.x, top: f.y, width: f.w, height: f.h, zIndex: 0,
                                border: `${f.sub ? 1.5 : 2}px ${f.sub ? "dashed" : "solid"} ${theme.palette.text.secondary}`, borderRadius: "6px", opacity: 0.85,
                            }}>
                                <Typography sx={{ position: "absolute", left: 0, right: 0, bottom: f.sub ? 6 : 10, textAlign: "center",
                                    fontSize: f.sub ? 13 : 15, fontWeight: f.sub ? 600 : 700, letterSpacing: f.sub ? 0 : "0.06em",
                                    textTransform: f.sub ? "none" : "uppercase" }}>{f.name}</Typography>
                            </Box>
                        ))}
                        {layout.zones.length > 0 && (
                            <svg width={layout.width} height={layout.height} style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}>
                                <defs>
                                    <pattern id="zoneHatch" patternUnits="userSpaceOnUse" width={8} height={8} patternTransform="rotate(45)">
                                        <rect width={4} height={8} fill={ZONE_RED} />
                                    </pattern>
                                </defs>
                                {layout.zones.map(z => (
                                    <g key={z.key}>
                                        <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={10} fill={ZONE_RED} fillOpacity={0.04}
                                            stroke="url(#zoneHatch)" strokeWidth={ZONE_BAND} />
                                        <text x={z.x + 16} y={z.y + ZONE_BAND + 16} fill={ZONE_RED} fontSize={13} fontWeight={800} letterSpacing="0.06em">
                                            {`${zoneKindTxt(z.zone.kind).toUpperCase()} · ${z.zone.name}`}
                                        </text>
                                    </g>
                                ))}
                            </svg>
                        )}
                        <svg width={layout.width} height={layout.height} style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}>
                            {graph.links.map(l => {
                                const d = pathOf(l);
                                if (!d) return null;
                                const on = selected?.link === l.id || selected?.port === l.portAId || selected?.port === l.portBId;
                                return (
                                    <g key={l.id}>
                                        <path d={d} fill="none" stroke={on ? "#d84315" : lineColour(l.speedGb)} strokeWidth={2.5}
                                            strokeLinejoin="round" strokeDasharray={l.status === "planned" ? "8 6" : undefined} />
                                        <path d={d} fill="none" stroke="transparent" strokeWidth={12} style={{ pointerEvents: "stroke", cursor: "pointer" }}
                                            onClick={() => { setSelected({ link: l.id }); setActionError(null); }} />
                                    </g>
                                );
                            })}
                        </svg>
                        {graph.nodes.map(nodeCard)}
                        {graph.nodes.flatMap(n => visiblePorts(n.id)).map(portTab)}
                    </Box>
                    </Box>
                </Paper>
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
                                <ToggleButtonGroup size="small" exclusive value={selLink.status} onChange={(_, v) => v && setLinkStatus(selLink, v)}>
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
                    {graph.checks.length + layout.zoneWarnings.length === 0 && <Typography sx={{ fontSize: 13, color: "text.disabled" }}>Nothing to report.</Typography>}
                    {[...layout.zoneWarnings.map(text => ({ level: "warn", text })), ...graph.checks].map((c, i) => (
                        <Box key={i} sx={{ display: "flex", gap: 1, alignItems: "flex-start", mb: 0.75 }}>
                            {c.level === "warn" ? <WarningAmberIcon sx={{ fontSize: 18, color: "#ed6c02" }} />
                                : c.level === "ok" ? <CheckCircleIcon sx={{ fontSize: 18, color: "#2e7d32" }} />
                                : <InfoOutlinedIcon sx={{ fontSize: 18, color: "#1565c0" }} />}
                            <Typography sx={{ fontSize: 13 }}>{c.text}</Typography>
                        </Box>
                    ))}
                </Paper>
            </Box>

            <Dialog open={addOpen} onClose={() => !saving && setAddOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Add device</DialogTitle>
                <DialogContent>
                    <ToggleButtonGroup size="small" exclusive value={addKind} sx={{ mt: 0.5, mb: 2 }}
                        onChange={(_, v) => { if (v) { setAddKind(v); setAddRecord(null); } }}>
                        <ToggleButton value="component">Component</ToggleButton>
                        <ToggleButton value="machine">Machine</ToggleButton>
                        <ToggleButton value="placeholder">Not bought yet</ToggleButton>
                    </ToggleButtonGroup>
                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
                        {addKind === "component" && (
                            <Autocomplete size="small" sx={{ gridColumn: "1 / -1" }} options={componentOptions}
                                groupBy={c => (c.type === "Networking" || c.type === "NIC" ? c.type : "Other parts")}
                                getOptionLabel={c => `#${c.id} ${compName(c)}`}
                                value={componentOptions.find(c => c.id === addRecord) ?? null}
                                onChange={(_, v) => setAddRecord(v?.id ?? null)}
                                renderInput={params => <TextField {...params} label="Lab component (switch, router, modem…)" />} />
                        )}
                        {addKind === "machine" && (
                            <Autocomplete size="small" sx={{ gridColumn: "1 / -1" }}
                                options={machines.filter(m => !onPage.machines.has(m.id)).sort((a, b) => a.name.localeCompare(b.name))}
                                getOptionLabel={m => m.name}
                                value={machines.find(m => m.id === addRecord) ?? null}
                                onChange={(_, v) => setAddRecord(v?.id ?? null)}
                                renderInput={params => <TextField {...params} label="Lab machine" />} />
                        )}
                        <TextField size="small" label={addKind === "placeholder" ? "Name" : "Display name (optional)"} value={addLabel}
                            onChange={e => setAddLabel(e.target.value)} sx={{ gridColumn: addKind === "placeholder" ? "1 / -1" : undefined }} />
                        {addKind === "placeholder" && (
                            <TextField size="small" label="Ports, e.g. 4x SFP+ 10G" value={addSpec} onChange={e => setAddSpec(e.target.value)} sx={{ gridColumn: "1 / -1" }} />
                        )}
                        <TextField select size="small" label="Frame" value={addSpace} onChange={e => setAddSpace(e.target.value === "" ? "" : Number(e.target.value))}>
                            <MenuItem value="">The Space it is placed in</MenuItem>
                            {spaces.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                        </TextField>
                        <TextField size="small" label="Row" type="number" value={addRow} onChange={e => setAddRow(e.target.value)} />
                        <TextField size="small" label="Position in the row" type="number" value={addPos} onChange={e => setAddPos(e.target.value)} />
                    </Box>
                    <Box sx={{ mt: 2 }}>
                        {preview.error && <Typography color="error" sx={{ fontSize: 12.5 }}>{preview.error}</Typography>}
                        {preview.ports && (preview.ports.length === 0
                            ? <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
                                {addKind === "machine" ? "None of this machine's installed parts has a ports field yet" : "Its ports field is empty"} -
                                it will be added with no ports. Set the field on the Lab record, then Sync ports, or add ports by hand.
                            </Typography>
                            : <Typography sx={{ fontSize: 12.5 }}>
                                <b>{preview.ports.length} ports will be created:</b>{" "}
                                <Box component="span" sx={{ fontFamily: "monospace", fontSize: 12 }}>{preview.ports.map(p => p.name).join(" · ")}</Box>
                            </Typography>)}
                    </Box>
                    {saveError && <Typography color="error" sx={{ fontSize: 12, mt: 1 }}>{saveError}</Typography>}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button>
                    <Button variant="contained" onClick={saveAdd}
                        disabled={saving || (addKind === "placeholder" ? !addLabel.trim() : addRecord == null)}>{saving ? "Adding…" : "Add"}</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={!!editNode} onClose={() => !saving && setEditNode(null)} maxWidth="md" fullWidth>
                {editNode && (
                    <>
                        <DialogTitle sx={{ pb: 0.5 }}>{editNode.displayName}</DialogTitle>
                        <DialogContent>
                            <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1.5 }}>{editNode.refLine}</Typography>
                            <Box sx={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1.4fr 80px 80px 1.2fr", gap: 1.5, mb: 2 }}>
                                <TextField size="small" label={editNode.machineId || editNode.componentId ? "Display name (optional)" : "Name"} value={editNode.label ?? ""}
                                    onChange={e => setEditNode({ ...editNode, label: e.target.value || null })} />
                                <TextField select size="small" label="Status" value={editNode.status} disabled={!editNode.machineId && !editNode.componentId}
                                    onChange={e => setEditNode({ ...editNode, status: e.target.value })}>
                                    <MenuItem value="live">live</MenuItem>
                                    <MenuItem value="planned">planned</MenuItem>
                                </TextField>
                                <TextField select size="small" label="Frame" value={editNode.spaceId ?? ""}
                                    onChange={e => setEditNode({ ...editNode, spaceId: e.target.value === "" ? null : Number(e.target.value) })}>
                                    <MenuItem value="">The Space it is placed in</MenuItem>
                                    {spaces.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                                </TextField>
                                <TextField size="small" label="Row" type="number" value={editNode.row} onChange={e => setEditNode({ ...editNode, row: Number(e.target.value) })} />
                                <TextField size="small" label="Position" type="number" value={editNode.position} onChange={e => setEditNode({ ...editNode, position: Number(e.target.value) })} />
                                <TextField select size="small" label="Zone" value={editZone} onChange={e => setEditZone(e.target.value === "" ? "" : Number(e.target.value))}
                                    helperText={(graph.zones ?? []).length === 0 ? "Add zones with Zones" : undefined}>
                                    <MenuItem value="">None</MenuItem>
                                    {(graph.zones ?? []).map(z => <MenuItem key={z.id} value={z.id}>{z.name} ({zoneKindTxt(z.kind)})</MenuItem>)}
                                </TextField>
                                {!editNode.machineId && !editNode.componentId && (
                                    <TextField size="small" label="Ports, e.g. 4x SFP+ 10G" value={editNode.portsSpec ?? ""} sx={{ gridColumn: "1 / -1" }}
                                        onChange={e => setEditNode({ ...editNode, portsSpec: e.target.value || null })} />
                                )}
                            </Box>
                            <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "text.secondary", mb: 1 }}>Ports</Typography>
                            <Box sx={{ display: "grid", gridTemplateColumns: "1.2fr 100px 70px 100px 60px 1.6fr 36px", gap: 1, alignItems: "center" }}>
                                {["Name", "Media", "Gb/s", "Edge", "Order", "Module in the cage", ""].map(h => (
                                    <Typography key={h} sx={{ fontSize: 10.5, fontWeight: 700, color: "text.secondary", textTransform: "uppercase" }}>{h}</Typography>
                                ))}
                                {portDraft.map(p => (
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
                                            <Autocomplete size="small" options={components.filter(c => !["sold", "disposed", "lost"].includes(c.status))}
                                                getOptionLabel={c => `#${c.id} ${compName(c)}`}
                                                value={components.find(c => c.id === p.moduleComponentId) ?? null}
                                                onChange={(_, v) => setPort(p.id, { moduleComponentId: v?.id ?? null })}
                                                renderInput={params => <TextField {...params} placeholder={p.moduleLabel ?? "empty cage"} />} />
                                        )}
                                        <IconButton size="small" title={linkOf.has(p.id) ? "Delete this port and its link" : "Delete this port"}
                                            onClick={() => { if (p.id > 0) setPortsDeleted(d => [...d, p.id]); setPortDraft(ps => ps.filter(x => x.id !== p.id)); }}>
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
                            </Typography>
                            {saveError && <Typography color={saveError.includes("added") ? "text.secondary" : "error"} sx={{ fontSize: 12, mt: 1 }}>{saveError}</Typography>}
                        </DialogContent>
                        <DialogActions>
                            <Button color="error" onClick={deleteNode} disabled={saving}>Remove from the page</Button>
                            <Box sx={{ flex: 1 }} />
                            <Button onClick={() => setEditNode(null)} disabled={saving}>Cancel</Button>
                            <Button variant="contained" onClick={saveEdit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                        </DialogActions>
                    </>
                )}
            </Dialog>

            <Dialog open={zonesOpen} onClose={() => !saving && setZonesOpen(false)} maxWidth="md" fullWidth>
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
                        {zoneDraft.map(z => (
                            <Box key={z.id} sx={{ display: "contents" }}>
                                <TextField size="small" value={z.name} onChange={e => setZone(z.id, { name: e.target.value })} />
                                <TextField select size="small" value={z.kind} onChange={e => setZone(z.id, { kind: e.target.value })}>
                                    {ZONE_KINDS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
                                </TextField>
                                <TextField size="small" value={z.notes ?? ""} onChange={e => setZone(z.id, { notes: e.target.value || null })} />
                                <Typography sx={{ fontSize: 13 }} title={z.nodeIds.map(id => nodeById.get(id)?.displayName ?? `#${id}`).join(", ")}>{z.nodeIds.length}</Typography>
                                <IconButton size="small" title="Delete this zone (its devices stay)" onClick={() => setZoneDraft(zs => zs.filter(x => x.id !== z.id))}>
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            </Box>
                        ))}
                    </Box>
                    <Button size="small" variant="outlined" sx={{ mt: 1.5 }}
                        onClick={() => setZoneDraft(zs => [...zs, { id: -Date.now(), name: "", kind: "untrusted", notes: null, nodeIds: [] }])}>Add zone</Button>
                    {zoneError && <Typography color="error" sx={{ fontSize: 12, mt: 1 }}>{zoneError}</Typography>}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setZonesOpen(false)} disabled={saving}>Cancel</Button>
                    <Button variant="contained" onClick={saveZones} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default HomelabNetwork;
