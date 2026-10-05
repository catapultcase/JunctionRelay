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
import { useMemo, useRef, useState } from "react";
import { Box, IconButton, Paper, Typography, useTheme } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
    anchorOf, computeGeometry, GRID, Geometry, Graph, isSide, Layout, lineColour, NO_GROW, mediaTxt, MODULE_ORANGE,
    NetLink, NetNode, NetPort, Point, QSFP_PURPLE, Rect, SFP_BLUE, Side, snap, speedTxt, TAB_H, TAB_W, ZONE_BAND, ZONE_RED, zoneKindTxt,
} from "./Lab_Network_Model";
import { pathD, routeLinks } from "./Lab_Network_Router";
import type { useCanvasViewport } from "../hooks/useCanvasViewport";

// The Network page's canvas: frames, zones, links, device cards and port tabs on a pan/zoom stage. With
// Edit layout on, a card drags on the 20px grid, a frame drags by its handle (and takes everything in it
// along), a port tab drags to any edge of its card, and any edge of a frame or zone outline drags to grow
// or shrink it (never inside its devices). Placement is the user's call: nothing is refused.

const TAB_TXT = { display: "block", color: "inherit", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "clip", px: "1px" } as const;
const HANDLE_H = 30;

type Drag =
    // pinned: the outlines (frames, zones) that hold the dragged device, as they were when the drag
    // began - they stay put and their grown edges absorb the move. Empty for a whole-frame drag.
    | { kind: "nodes"; ids: number[]; start: Point; from: Map<number, Point>; tray: boolean; pinned: Map<string, Rect> }
    | { kind: "port"; id: number; nodeId: number; start: Point; moved: boolean; at: Point }
    | { kind: "edge"; growKey: string; side: Side; base: Rect };
const EDGE = 14;     // the grab strip along a frame or zone edge, canvas pixels

interface Props {
    graph: Graph;
    layout: Layout;
    editing: boolean;
    showFree: boolean;
    viewport: ReturnType<typeof useCanvasViewport>;
    selected: { port?: number; link?: number } | null;
    armed: number | null;
    pendingPort: number | null;
    onPort: (id: number) => void;
    onLink: (id: number) => void;
    onEditNode: (n: NetNode) => void;
    onLayout: (next: Layout) => void;
}

const LabNetworkCanvas = ({ graph, layout, editing, showFree, viewport, selected, armed, pendingPort, onPort, onLink, onEditNode, onLayout }: Props) => {
    const theme = useTheme();
    const linked = useMemo(() => {
        const s = new Set<number>();
        graph.links.forEach(l => { s.add(l.portAId); s.add(l.portBId); });
        return s;
    }, [graph.links]);
    const visible = useMemo(() => (p: NetPort) => showFree || linked.has(p.id), [showFree, linked]);

    // while dragging, the page is drawn from a moved copy of the layout
    const [drag, setDrag] = useState<Drag | null>(null);
    const [dragLayout, setDragLayout] = useState<Layout | null>(null);
    const shown = dragLayout ?? layout;
    const geo = useMemo(() => computeGeometry(graph, shown, visible), [graph, shown, visible]);

    const portById = useMemo(() => new Map(graph.ports.map(p => [p.id, p])), [graph.ports]);
    const sideOf = (p: NetPort): Side => shown.edge.get(p.id)?.side ?? (isSide(p.side) ? p.side : "bottom");
    const endOf = (p: NetPort | undefined, g: Geometry) => {
        const t = p && g.tabs.get(p.id), card = p && g.cards.get(p.nodeId);
        return p && t && card ? { anchor: anchorOf(t, sideOf(p)), side: sideOf(p), card } : null;
    };
    // routes follow the committed layout; during a drag the moved links are drawn straight until the drop
    const routes = useMemo(() => {
        const reqs = graph.links.flatMap(l => {
            const a = endOf(portById.get(l.portAId), geo), b = endOf(portById.get(l.portBId), geo);
            return a && b ? [{ id: l.id, a, b }] : [];
        });
        return dragLayout ? null : routeLinks(reqs, geo.bounds);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [graph.links, geo, dragLayout, portById]);
    const linkPath = (l: NetLink) => {
        const r = routes?.get(l.id);
        if (r) return pathD(r);
        const a = endOf(portById.get(l.portAId), geo), b = endOf(portById.get(l.portBId), geo);
        return a && b ? `M${a.anchor.x},${a.anchor.y} L${b.anchor.x},${b.anchor.y}` : null;
    };

    // ---- dragging ----
    const begin = (e: ReactPointerEvent, d: Drag) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(d);
    };
    const startNodes = (e: ReactPointerEvent, ids: number[], wholeFrame = false) => {
        if (!editing) return;
        const start = viewport.toCanvas(e.clientX, e.clientY);
        const from = new Map(ids.map(id => {
            const r = geo.cards.get(id);
            return [id, { x: r?.x ?? 0, y: r?.y ?? 0 }];
        }));
        const pinned = new Map<string, Rect>();
        if (!wholeFrame) {
            for (const f of geo.frames) if (f.nodeIds.some(id => ids.includes(id))) pinned.set(f.growKey, { x: f.x, y: f.y, w: f.w, h: f.h });
            for (const z of geo.zones) if (z.zone.nodeIds.some(id => ids.includes(id))) pinned.set(z.growKey, { x: z.x, y: z.y, w: z.w, h: z.h });
        }
        begin(e, { kind: "nodes", ids, start, from, tray: ids.some(id => geo.unplaced.has(id)), pinned });
    };
    // Keep pinned outlines where they were: each one's grown edges become the gap between its
    // outline and the box around its devices after the move (never negative - a device dragged
    // past an edge pushes it out). Two passes, because a room's box includes its racks' grown edges.
    const pinOutlines = (next: Layout, pinned: Map<string, Rect>): Layout => {
        if (pinned.size === 0) return next;
        let cur = next;
        for (let pass = 0; pass < 2; pass++) {
            const g = computeGeometry(graph, cur, visible);
            const grow = new Map(cur.grow);
            for (const item of [...g.frames, ...g.zones]) {
                const o = pinned.get(item.growKey);
                if (!o) continue;
                const b = item.base;
                grow.set(item.growKey, {
                    left: Math.max(0, b.x - o.x), top: Math.max(0, b.y - o.y),
                    right: Math.max(0, o.x + o.w - (b.x + b.w)), bottom: Math.max(0, o.y + o.h - (b.y + b.h)),
                });
            }
            cur = { ...cur, grow };
        }
        return cur;
    };
    const startPort = (e: ReactPointerEvent, p: NetPort) => {
        const start = viewport.toCanvas(e.clientX, e.clientY);
        if (!editing) return;
        begin(e, { kind: "port", id: p.id, nodeId: p.nodeId, start, moved: false, at: start });
    };
    const onMove = (e: ReactPointerEvent) => {
        if (!drag) return;
        const at = viewport.toCanvas(e.clientX, e.clientY);
        if (drag.kind === "nodes") {
            const dx = snap(at.x - drag.start.x), dy = snap(at.y - drag.start.y);
            const next = new Map(layout.at);
            drag.from.forEach((p, id) => next.set(id, { x: snap(p.x + dx), y: snap(p.y + dy) }));
            setDragLayout(pinOutlines({ at: next, edge: layout.edge, grow: layout.grow }, drag.pinned));
        } else if (drag.kind === "edge") {
            const b = drag.base, g = { ...(layout.grow.get(drag.growKey) ?? NO_GROW) };
            if (drag.side === "left") g.left = Math.max(0, b.x - snap(at.x));
            if (drag.side === "right") g.right = Math.max(0, snap(at.x) - (b.x + b.w));
            if (drag.side === "top") g.top = Math.max(0, b.y - snap(at.y));
            if (drag.side === "bottom") g.bottom = Math.max(0, snap(at.y) - (b.y + b.h));
            const grow = new Map(layout.grow);
            grow.set(drag.growKey, g);
            setDragLayout({ at: layout.at, edge: layout.edge, grow });
        } else {
            const moved = drag.moved || Math.hypot(at.x - drag.start.x, at.y - drag.start.y) > 6;
            setDrag({ ...drag, moved, at });
        }
    };
    const portDrop = (d: Extract<Drag, { kind: "port" }>): Layout | null => {
        const card = geo.cards.get(d.nodeId);
        if (!card) return null;
        const cx = card.x + card.w / 2, cy = card.y + card.h / 2;
        const nx = (d.at.x - cx) / (card.w / 2), ny = (d.at.y - cy) / (card.h / 2);
        const side: Side = Math.abs(nx) >= Math.abs(ny) ? (nx < 0 ? "left" : "right") : (ny < 0 ? "top" : "bottom");
        const along = side === "top" || side === "bottom" ? d.at.x : d.at.y;
        const centre = (id: number) => {
            const t = geo.tabs.get(id);
            return t ? (side === "top" || side === "bottom" ? t.x + t.w / 2 : t.y + t.h / 2) : 0;
        };
        const mine = graph.ports.filter(p => p.nodeId === d.nodeId && p.id !== d.id);
        const edge = new Map(layout.edge);
        const onSide = mine.filter(p => (edge.get(p.id)?.side) === side && visible(p))
            .sort((a, b) => centre(a.id) - centre(b.id));
        const idx = onSide.filter(p => centre(p.id) < along).length;
        const ordered = [...onSide.slice(0, idx).map(p => p.id), d.id, ...onSide.slice(idx).map(p => p.id)];
        ordered.forEach((id, i) => edge.set(id, { side, position: i + 1 }));
        // the edge it left closes up
        const oldSide = layout.edge.get(d.id)?.side;
        if (oldSide && oldSide !== side)
            mine.filter(p => edge.get(p.id)?.side === oldSide)
                .sort((a, b) => (edge.get(a.id)?.position ?? 0) - (edge.get(b.id)?.position ?? 0))
                .forEach((p, i) => edge.set(p.id, { side: oldSide, position: i + 1 }));
        return { at: layout.at, edge, grow: layout.grow };
    };
    const onUp = () => {
        if (!drag) return;
        const d = drag;
        setDrag(null);
        if (d.kind === "port") {
            if (!d.moved) { onPort(d.id); return; }
            const next = portDrop(d);
            if (next) onLayout(next);
            return;
        }
        const next = dragLayout;
        setDragLayout(null);
        if (!next) return;
        if (d.kind === "edge") {
            const a = layout.grow.get(d.growKey) ?? NO_GROW, b = next.grow.get(d.growKey) ?? NO_GROW;
            if (a.left !== b.left || a.top !== b.top || a.right !== b.right || a.bottom !== b.bottom) onLayout(next);
            return;
        }
        const unchanged = d.ids.every(id => {
            const a = next.at.get(id), b = d.from.get(id);
            return !d.tray && a && b && a.x === b.x && a.y === b.y;
        });
        if (unchanged) return;
        onLayout(next);
    };

    // ---- drawing ----
    const portTab = (p: NetPort, t: Rect) => {
        const hasModule = p.moduleComponentId != null || !!p.moduleLabel;
        const sfp = p.media !== "rj45" && p.media !== "other";
        const bg = hasModule ? MODULE_ORANGE : p.media === "qsfp" ? QSFP_PURPLE : sfp ? SFP_BLUE : theme.palette.background.paper;
        const fg = hasModule || sfp ? "#fff" : theme.palette.text.primary;
        const free = !linked.has(p.id);
        const isSel = selected?.port === p.id;
        const label = hasModule ? `${mediaTxt(p.media)}→RJ45` : sfp ? mediaTxt(p.media) : speedTxt(p.speedGb);
        const sub = hasModule || sfp ? speedTxt(p.speedGb) : "RJ45";
        const ghost = drag?.kind === "port" && drag.id === p.id && drag.moved ? drag.at : null;
        return (
            <Box key={`p${p.id}`} component="button" type="button"
                onPointerDown={e => (editing ? startPort(e, p) : undefined)}
                onClick={() => { if (!editing) onPort(p.id); }}
                title={`${graph.nodes.find(n => n.id === p.nodeId)?.displayName ?? ""} · ${p.name}${editing ? " - drag to another edge" : ""}`}
                sx={{
                    position: "absolute", left: ghost ? ghost.x - TAB_W / 2 : t.x, top: ghost ? ghost.y - TAB_H / 2 : t.y, width: TAB_W, height: TAB_H,
                    zIndex: ghost ? 6 : 3, p: 0, cursor: editing ? "grab" : "pointer", touchAction: "none",
                    border: `1.5px ${free ? "dashed" : "solid"} ${theme.palette.text.primary}`, borderRadius: "4px",
                    bgcolor: bg, color: fg, opacity: free ? 0.6 : 1, font: "inherit", lineHeight: 1.05,
                    outline: isSel ? "3px solid #d84315" : armed === p.id || pendingPort === p.id ? "3px solid #ed6c02" : "none", outlineOffset: "1px",
                }}>
                <Typography component="span" sx={{ ...TAB_TXT, fontSize: hasModule ? 9 : 10.5, fontWeight: 600, lineHeight: hasModule ? 1 : 1.05 }}>{hasModule ? mediaTxt(p.media) : label}</Typography>
                {hasModule && <Typography component="span" sx={{ ...TAB_TXT, fontSize: 9, fontWeight: 700, lineHeight: 1 }}>→RJ45</Typography>}
                <Typography component="span" sx={{ ...TAB_TXT, fontSize: hasModule ? 8.5 : 9, opacity: 0.9, lineHeight: hasModule ? 1 : 1.05 }}>{sub}</Typography>
            </Box>
        );
    };
    const moving = drag?.kind === "nodes" ? new Set(drag.ids) : null;
    const nodeCard = (n: NetNode) => {
        const r = geo.cards.get(n.id);
        if (!r) return null;
        const all = graph.ports.filter(p => p.nodeId === n.id);
        const freeCount = all.filter(p => !linked.has(p.id)).length;
        const planned = n.status === "planned";
        return (
            <Paper key={`n${n.id}`} elevation={moving?.has(n.id) ? 8 : 2} onPointerDown={e => startNodes(e, [n.id])} sx={{
                position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, zIndex: moving?.has(n.id) ? 5 : 2, p: "8px 10px",
                border: `1.5px ${planned ? "dashed" : "solid"} ${theme.palette.text.primary}`, borderRadius: "6px",
                cursor: editing ? "grab" : "default", touchAction: "none", userSelect: "none",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 0.25,
            }}>
                <IconButton size="small" title="Edit this device and its ports" onPointerDown={e => e.stopPropagation()} onClick={() => onEditNode(n)}
                    sx={{ position: "absolute", top: 2, right: 2, p: 0.25 }}>
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

    // the four grab strips on a frame or zone outline, in edit mode
    const edgeHandles = (key: string, r: Rect, growKey: string, base: Rect) => !editing ? null : (["left", "right", "top", "bottom"] as const).map(side => {
        const horiz = side === "top" || side === "bottom";
        return (
            <Box key={`${key}-${side}`} title="Drag to resize"
                onPointerDown={e => begin(e, { kind: "edge", growKey, side, base })}
                sx={{ position: "absolute", zIndex: 4, touchAction: "none", cursor: horiz ? "ns-resize" : "ew-resize",
                    left: side === "right" ? r.x + r.w - EDGE / 2 : r.x - (horiz ? 0 : EDGE / 2),
                    top: side === "bottom" ? r.y + r.h - EDGE / 2 : r.y - (horiz ? EDGE / 2 : 0),
                    width: horiz ? r.w : EDGE, height: horiz ? EDGE : r.h,
                    "&:hover": { bgcolor: "rgba(25,118,210,0.25)" } }} />
        );
    });
    const b = geo.bounds;
    const stageRef = useRef<HTMLDivElement>(null);
    const { view } = viewport;
    return (
        <Box ref={viewport.containerRef}
            onPointerDown={e => {
                viewport.onMiddleDown(e);
                if (e.button === 0 && (e.target === e.currentTarget || e.target === stageRef.current)) viewport.startPan(e.clientX, e.clientY);
            }}
            onPointerMove={onMove} onPointerUp={onUp} onAuxClick={e => e.button === 1 && e.preventDefault()}
            sx={{
                position: "relative", overflow: "hidden", height: "calc(100vh - 300px)", minHeight: 480, borderRadius: 1,
                border: `1px solid ${theme.palette.divider}`, bgcolor: theme.palette.mode === "dark" ? "#16191d" : "#f6f7f9",
                cursor: viewport.panning ? "grabbing" : "default", touchAction: "none",
            }}>
            <Box ref={stageRef} sx={{ position: "absolute", left: 0, top: 0, width: 1, height: 1, transformOrigin: "0 0",
                transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` }}>
                {editing && (
                    <Box sx={{ position: "absolute", left: snap(b.x) - GRID * 20, top: snap(b.y) - GRID * 20, width: b.w + GRID * 40, height: b.h + GRID * 40,
                        pointerEvents: "none", opacity: 0.55,
                        backgroundImage: `linear-gradient(${theme.palette.divider} ${1 / view.scale}px, transparent ${1 / view.scale}px), linear-gradient(90deg, ${theme.palette.divider} ${1 / view.scale}px, transparent ${1 / view.scale}px)`,
                        backgroundSize: `${GRID}px ${GRID}px` }} />
                )}
                {geo.frames.map(f => (
                    <Box key={f.key} sx={{
                        position: "absolute", left: f.x, top: f.y, width: f.w, height: f.h, zIndex: 0, pointerEvents: "none",
                        border: `${f.sub ? 1.5 : 2}px ${f.sub ? "dashed" : "solid"} ${theme.palette.text.secondary}`, borderRadius: "6px", opacity: 0.85,
                    }}>
                        <Typography sx={{ position: "absolute", left: 0, right: 0, bottom: f.sub ? 6 : 10, textAlign: "center",
                            fontSize: f.sub ? 13 : 15, fontWeight: f.sub ? 600 : 700, letterSpacing: f.sub ? 0 : "0.06em",
                            textTransform: f.sub ? "none" : "uppercase" }}>{f.name}</Typography>
                        {editing && (
                            <Box onPointerDown={e => startNodes(e, f.nodeIds.filter(id => !geo.unplaced.has(id)), true)} title={`Drag to move ${f.name} and everything in it`}
                                sx={{ position: "absolute", left: 0, right: 0, top: 0, height: HANDLE_H, pointerEvents: "auto", cursor: "grab", touchAction: "none",
                                    bgcolor: theme.palette.action.hover, borderBottom: `1px dashed ${theme.palette.divider}`,
                                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, color: "text.secondary", userSelect: "none" }}>
                                ⠿ {f.name}
                            </Box>
                        )}
                    </Box>
                ))}
                {geo.frames.flatMap(f => edgeHandles(f.key, f, f.growKey, f.base) ?? [])}
                {geo.zones.flatMap(z => edgeHandles(z.key, z, z.growKey, z.base) ?? [])}
                {geo.tray && (
                    <Box sx={{ position: "absolute", left: geo.tray.x, top: geo.tray.y, width: geo.tray.w, height: geo.tray.h, pointerEvents: "none",
                        border: `2px dashed ${theme.palette.warning.main}`, borderRadius: "6px" }}>
                        <Typography sx={{ position: "absolute", left: 12, top: 6, fontSize: 12.5, fontWeight: 700, color: "warning.main" }}>
                            Not placed yet{editing ? " - drag onto the map" : " - Edit layout to place"}
                        </Typography>
                    </Box>
                )}
                <svg width={1} height={1} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", zIndex: 1, pointerEvents: "none" }}>
                    <defs>
                        <pattern id="zoneHatch" patternUnits="userSpaceOnUse" width={8} height={8} patternTransform="rotate(45)">
                            <rect width={4} height={8} fill={ZONE_RED} />
                        </pattern>
                    </defs>
                    {geo.zones.map(z => (
                        <g key={z.key}>
                            <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={10} fill={ZONE_RED} fillOpacity={0.04} stroke="url(#zoneHatch)" strokeWidth={ZONE_BAND} />
                            <text x={z.x + 16} y={z.y + ZONE_BAND + 16} fill={ZONE_RED} fontSize={13} fontWeight={800} letterSpacing="0.06em">
                                {`${zoneKindTxt(z.zone.kind).toUpperCase()} · ${z.zone.name}`}
                            </text>
                        </g>
                    ))}
                    {graph.links.map(l => {
                        const d = linkPath(l);
                        if (!d) return null;
                        const on = selected?.link === l.id || selected?.port === l.portAId || selected?.port === l.portBId;
                        return (
                            <g key={l.id}>
                                <path d={d} fill="none" stroke={on ? "#d84315" : lineColour(l.speedGb)} strokeWidth={2.5}
                                    strokeLinejoin="round" strokeDasharray={l.status === "planned" ? "8 6" : routes ? undefined : "3 4"} />
                                <path d={d} fill="none" stroke="transparent" strokeWidth={12} style={{ pointerEvents: "stroke", cursor: "pointer" }}
                                    onClick={() => onLink(l.id)} />
                            </g>
                        );
                    })}
                </svg>
                {graph.nodes.map(nodeCard)}
                {graph.ports.filter(visible).map(p => {
                    const t = geo.tabs.get(p.id);
                    return t ? portTab(p, t) : null;
                })}
            </Box>
        </Box>
    );
};

export default LabNetworkCanvas;
