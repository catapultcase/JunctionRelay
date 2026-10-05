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

// The Network page's data and geometry - no React here. A device's card sits at its stored x/y (canvas
// pixels on a 20px grid); its size follows its ports; frames (Lab Spaces) are DRAWN AROUND their devices,
// so moving a frame means moving its devices. Where things go is the user's call - nothing is refused. Port tabs are centred on 10px grid lines so the link router
// (Lab_Network_Router) can run lines straight out of them.

export interface NetNode {
    id: number; machineId: number | null; componentId: number | null; label: string | null; portsSpec: string | null;
    status: string; spaceId: number | null; x: number | null; y: number | null; notes: string | null;
    displayName: string | null; refLine: string | null; resolvedSpaceId: number | null; resolvedSpaceName: string | null;
    placementNote: string | null; missing: boolean;
    frameSpaceId: number | null; frameSpaceName: string | null; subSpaceId: number | null; subSpaceName: string | null;
}
export interface NetPort {
    id: number; nodeId: number; name: string; media: string; speedGb: number | null; side: string; position: number;
    moduleComponentId: number | null; moduleLabel: string | null; sourceComponentId: number | null; notes: string | null;
    moduleName: string | null; sourceName: string | null;
}
export interface NetLink { id: number; portAId: number; portBId: number; status: string; notes: string | null; speedGb: number | null }
export interface NetZone { id: number; name: string; kind: string; notes: string | null; nodeIds: number[] }
export interface NetCheck { level: string; text: string }
export interface NetMargin { key: string; growLeft: number; growTop: number; growRight: number; growBottom: number }
export interface Graph { nodes: NetNode[]; ports: NetPort[]; links: NetLink[]; zones: NetZone[]; margins?: NetMargin[]; checks: NetCheck[] }
export interface LabMachine { id: number; name: string; os: string | null }
export interface LabComponent { id: number; name: string | null; manufacturer: string | null; model: string | null; type: string; status: string }
export interface LabSpace { id: number; name: string; sortOrder?: number; status?: string }

export type Side = "left" | "right" | "top" | "bottom";
export const SIDES: readonly Side[] = ["left", "right", "top", "bottom"];
export const isSide = (s: string): s is Side => SIDES.some(x => x === s);
export type Rect = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };

export const GRID = 20;                 // where cards snap
export const LANE_GRID = 10;            // the router's grid: tab centres and every line run sit on it
export const TAB_W = 46, TAB_H = 34, STEP_V = 40, STEP_H = 50, NODE_MIN_W = 160, NODE_MIN_H = 100;
export const FRAME_PAD = 80, FRAME_LABEL = 40, SUB_PAD = 60, SUB_LABEL = 30;
export const ZONE_PAD = 56, ZONE_BAND = 9, ZONE_RED = "#d32f2f";
export const ZONE_KINDS = [["untrusted", "Untrusted"], ["dmz", "DMZ"]] as const;
export const zoneKindTxt = (k: string) => ZONE_KINDS.find(x => x[0] === k)?.[1] ?? k;
export const MEDIA = [["rj45", "RJ45"], ["sfp", "SFP+"], ["sfp28", "SFP28"], ["qsfp", "QSFP"], ["other", "Other"]] as const;
export const SFP_BLUE = "#4a8fe0", QSFP_PURPLE = "#9c4dcc", MODULE_ORANGE = "#f0892c";
export const speedTxt = (g: number | null | undefined) => (g == null ? "?" : g >= 1 ? `${+g.toFixed(2)}G` : `${Math.round(g * 1000)}M`);
// 100G+ (Spark pair DACs, QSFP), 10G, 2.5G, 1G or less
export const lineColour = (g: number | null | undefined) =>
    (g == null ? "#78909c" : g >= 100 ? QSFP_PURPLE : g >= 10 ? "#1e6fd9" : g >= 2.5 ? "#2e7d32" : "#78909c");
export const mediaTxt = (m: string) => MEDIA.find(x => x[0] === m)?.[1] ?? m;
export const compName = (c: LabComponent) => c.name || [c.manufacturer, c.model].filter(Boolean).join(" ") || `#${c.id}`;

const ceilTo = (v: number, step: number) => Math.ceil(v / step) * step;
const roundTo = (v: number, step: number) => Math.round(v / step) * step;
export const snap = (v: number) => roundTo(v, GRID);

// The editable layout: where each device is and which edge/order each port has. The page keeps a draft of
// this while Edit layout is on; Save sends the difference.
// How far a frame or zone outline is grown past its devices, per edge ("space:8", "zone:3").
export type Grow = { left: number; top: number; right: number; bottom: number };
export const NO_GROW: Grow = { left: 0, top: 0, right: 0, bottom: 0 };
export interface Layout {
    at: Map<number, Point>;                                        // node id -> card top-left (placed nodes only)
    edge: Map<number, { side: Side; position: number }>;           // port id -> its edge and order
    grow: Map<string, Grow>;                                       // frame/zone key -> grown edges
}
export const layoutOf = (g: Graph): Layout => ({
    at: new Map(g.nodes.filter(n => n.x != null && n.y != null).map(n => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }])),
    edge: new Map(g.ports.map(p => [p.id, { side: isSide(p.side) ? p.side : "bottom", position: p.position }])),
    grow: new Map((g.margins ?? []).map(m => [m.key, { left: m.growLeft, top: m.growTop, right: m.growRight, bottom: m.growBottom }])),
});
const grown = (r: Rect, g: Grow | undefined): Rect =>
    g ? { x: r.x - g.left, y: r.y - g.top, w: r.w + g.left + g.right, h: r.h + g.top + g.bottom } : r;

// base: the box around its members before any grown edges - what an edge drag measures from.
export interface Frame extends Rect { key: string; growKey: string; base: Rect; spaceId: number; name: string; sub: boolean; parentKey: string | null; nodeIds: number[] }
export interface Geometry {
    cards: Map<number, Rect>;               // every node, placed or in the tray
    tabs: Map<number, Rect>;                // visible ports only
    frames: Frame[];                        // rooms first, then the racks/desks inside them
    zones: (Rect & { key: string; growKey: string; base: Rect; zone: NetZone })[];
    tray: Rect | null;                      // where devices that are not placed yet wait
    unplaced: Set<number>;
    bounds: Rect;
}

const frameIdOf = (n: NetNode) => n.frameSpaceId ?? n.resolvedSpaceId;

// Lay the page out from a Layout: card sizes from the ports shown, tabs centred on their edge, frames as
// the box around their members, zones, and a tray below everything for devices with no position yet.
export function computeGeometry(g: Graph, lay: Layout, visible: (p: NetPort) => boolean): Geometry {
    const cards = new Map<number, Rect>(), tabs = new Map<number, Rect>();
    const bySide = new Map<number, Record<Side, NetPort[]>>();
    for (const n of g.nodes) bySide.set(n.id, { left: [], right: [], top: [], bottom: [] });
    for (const p of g.ports) {
        if (!visible(p)) continue;
        const e = lay.edge.get(p.id);
        bySide.get(p.nodeId)?.[e?.side ?? "bottom"].push(p);
    }
    const order = (a: NetPort, b: NetPort) => (lay.edge.get(a.id)?.position ?? 0) - (lay.edge.get(b.id)?.position ?? 0) || a.id - b.id;
    bySide.forEach(s => SIDES.forEach(k => s[k].sort(order)));
    const sizeOf = (id: number) => {
        const s = bySide.get(id);
        const across = Math.max(s?.top.length ?? 0, s?.bottom.length ?? 0), down = Math.max(s?.left.length ?? 0, s?.right.length ?? 0);
        return { w: ceilTo(Math.max(NODE_MIN_W, 40 + across * STEP_H), GRID), h: ceilTo(Math.max(NODE_MIN_H, 40 + down * STEP_V), GRID) };
    };

    const placed = g.nodes.filter(n => lay.at.has(n.id));
    const unplaced = new Set(g.nodes.filter(n => !lay.at.has(n.id)).map(n => n.id));
    placed.forEach(n => { const p = lay.at.get(n.id) ?? { x: 0, y: 0 }; cards.set(n.id, { ...p, ...sizeOf(n.id) }); });

    // frames: each rack/desk around its devices, then each room around its own devices and its racks/desks
    const frames: Frame[] = [];
    const boxAround = (rs: Rect[], pad: number, label: number): Rect => {
        const x0 = Math.min(...rs.map(r => r.x)) - pad, y0 = Math.min(...rs.map(r => r.y)) - pad;
        return { x: x0, y: y0, w: Math.max(...rs.map(r => r.x + r.w)) + pad - x0, h: Math.max(...rs.map(r => r.y + r.h)) + pad + label - y0 };
    };
    const withTabs = (r: Rect): Rect => ({ x: r.x - TAB_W, y: r.y - TAB_H, w: r.w + TAB_W * 2, h: r.h + TAB_H * 2 });
    const roomIds = [...new Set(placed.map(frameIdOf).filter((x): x is number => x != null))];
    for (const rid of roomIds) {
        const members = placed.filter(n => frameIdOf(n) === rid);
        const subs: Frame[] = [];
        for (const sid of [...new Set(members.map(n => n.subSpaceId).filter((x): x is number => x != null))]) {
            const inSub = members.filter(n => n.subSpaceId === sid);
            const base = boxAround(inSub.map(n => withTabs(cards.get(n.id) ?? { x: 0, y: 0, w: 0, h: 0 })), SUB_PAD - TAB_H, SUB_LABEL);
            const growKey = `space:${sid}`;
            subs.push({ key: `s${sid}`, growKey, base, spaceId: sid, name: inSub[0]?.subSpaceName ?? "", sub: true, parentKey: `f${rid}`, nodeIds: inSub.map(n => n.id), ...grown(base, lay.grow.get(growKey)) });
        }
        const loose = members.filter(n => n.subSpaceId == null).map(n => withTabs(cards.get(n.id) ?? { x: 0, y: 0, w: 0, h: 0 }));
        const base = boxAround([...loose, ...subs], FRAME_PAD - TAB_H, FRAME_LABEL);
        const growKey = `space:${rid}`;
        frames.push({ key: `f${rid}`, growKey, base, ...grown(base, lay.grow.get(growKey)), spaceId: rid, name: members[0]?.frameSpaceName ?? members[0]?.resolvedSpaceName ?? `Space #${rid}`,
            sub: false, parentKey: null, nodeIds: members.map(n => n.id) });
        frames.push(...subs);
    }

    // the tray: one row under everything placed
    const all = [...cards.values(), ...frames];
    const bottom = all.length ? Math.max(...all.map(r => r.y + r.h)) : 0;
    let tray: Rect | null = null;
    if (unplaced.size) {
        const y = snap(bottom + 120) + 40;
        let x = all.length ? snap(Math.min(...all.map(r => r.x))) + 40 : 80;
        const x0 = x;
        g.nodes.filter(n => unplaced.has(n.id)).forEach(n => { const s = sizeOf(n.id); cards.set(n.id, { x, y, ...s }); x += s.w + 100; });
        const hMax = Math.max(...g.nodes.filter(n => unplaced.has(n.id)).map(n => sizeOf(n.id).h));
        tray = { x: x0 - 60, y: y - 60, w: x - 100 - x0 + 120, h: hMax + 120 };
    }

    // tabs, centred along their edge with their centres on the router's grid
    for (const n of g.nodes) {
        const r = cards.get(n.id), s = bySide.get(n.id);
        if (!r || !s) continue;
        for (const side of SIDES) {
            const ps = s[side], horiz = side === "top" || side === "bottom";
            const step = horiz ? STEP_H : STEP_V, span = horiz ? r.w : r.h;
            const first = roundTo((span - (ps.length - 1) * step) / 2, LANE_GRID);
            ps.forEach((p, i) => {
                const c = first + i * step;
                tabs.set(p.id, side === "left" ? { x: r.x - TAB_W, y: r.y + c - TAB_H / 2, w: TAB_W, h: TAB_H }
                    : side === "right" ? { x: r.x + r.w, y: r.y + c - TAB_H / 2, w: TAB_W, h: TAB_H }
                    : side === "top" ? { x: r.x + c - TAB_W / 2, y: r.y - TAB_H, w: TAB_W, h: TAB_H }
                    : { x: r.x + c - TAB_W / 2, y: r.y + r.h, w: TAB_W, h: TAB_H });
            });
        }
    }

    // zones: one outline per frame their devices are in
    const zones: Geometry["zones"] = [];
    for (const z of g.zones ?? []) {
        const members = placed.filter(n => z.nodeIds.includes(n.id));
        for (const f of [...new Set(members.map(n => frameIdOf(n) ?? -1))]) {
            const rs = members.filter(n => (frameIdOf(n) ?? -1) === f).map(n => withTabs(cards.get(n.id) ?? { x: 0, y: 0, w: 0, h: 0 }));
            const base = boxAround(rs, ZONE_PAD - TAB_H, 0), growKey = `zone:${z.id}`;
            zones.push({ key: `z${z.id}f${f}`, growKey, base, zone: z, ...grown(base, lay.grow.get(growKey)) });
        }
    }

    const everything = [...cards.values(), ...frames, ...(tray ? [tray] : [])].map(r => withTabs(r));
    const bounds = everything.length ? boxAround(everything, 80, 0) : { x: 0, y: 0, w: 1200, h: 600 };
    return { cards, tabs, frames, zones, tray, unplaced, bounds };
}

// Every line leaves its tab straight out, from the tab's outer edge.
export function anchorOf(t: Rect, side: Side): Point {
    if (side === "left") return { x: t.x, y: t.y + t.h / 2 };
    if (side === "right") return { x: t.x + t.w, y: t.y + t.h / 2 };
    if (side === "top") return { x: t.x + t.w / 2, y: t.y };
    return { x: t.x + t.w / 2, y: t.y + t.h };
}
