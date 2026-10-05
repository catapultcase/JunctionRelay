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
import { LANE_GRID, Point, Rect, Side } from "./Lab_Network_Model";

// Orthogonal link routing for the Network page: an A* search on a 10px grid. Cards and their port tabs are
// walls; a cell a line already runs along is (all but) closed to a line running the same way, so no two
// lines share a run, and a cell beside one costs a little, so parallel lines keep a lane apart. Crossing a
// line is allowed at a small cost. Bends cost more than distance, so lines stay simple.

export interface RouteEnd { anchor: Point; side: Side; card: Rect }
export interface RouteRequest { id: number; a: RouteEnd; b: RouteEnd }

const G = LANE_GRID;
const CARD_CLEAR = 50;              // walls reach this far past a card's edge: past its tabs, plus a lane
const STUB = 60;                    // a line first leaves its card this far, straight out
const STEP = 1, BEND = 8, CROSS = 4, BESIDE = 2, SHARED = 400;
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];             // 0 right, 1 down, 2 left, 3 up
const OUT: Record<Side, number> = { right: 0, bottom: 1, left: 2, top: 3 };

class Heap {
    private k: number[] = []; private v: number[] = [];
    get size() { return this.k.length; }
    push(key: number, val: number) {
        const k = this.k, v = this.v;
        let i = k.length; k.push(key); v.push(val);
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (k[p] <= key) break;
            k[i] = k[p]; v[i] = v[p]; i = p;
        }
        k[i] = key; v[i] = val;
    }
    pop(): number {
        const k = this.k, v = this.v, top = v[0];
        const lk = k.pop() ?? 0, lv = v.pop() ?? 0;
        if (k.length) {
            let i = 0;
            for (;;) {
                const l = 2 * i + 1, r = l + 1;
                let m = i, mk = lk;
                if (l < k.length && k[l] < mk) { m = l; mk = k[l]; }
                if (r < k.length && k[r] < mk) { m = r; mk = k[r]; }
                if (m === i) break;
                k[i] = k[m]; v[i] = v[m]; i = m;
            }
            k[i] = lk; v[i] = lv;
        }
        return top;
    }
}

// The stub: where the search starts or ends, straight out from the anchor past the card's wall.
function stubOf(end: RouteEnd): Point {
    const { anchor, side, card } = end;
    if (side === "left") return { x: card.x - STUB, y: anchor.y };
    if (side === "right") return { x: card.x + card.w + STUB, y: anchor.y };
    if (side === "top") return { x: anchor.x, y: card.y - STUB };
    return { x: anchor.x, y: card.y + card.h + STUB };
}

export function routeLinks(reqs: RouteRequest[], bounds: Rect): Map<number, Point[]> {
    const x0 = Math.floor((bounds.x - 200) / G) * G, y0 = Math.floor((bounds.y - 200) / G) * G;
    const W = Math.ceil((bounds.w + 400) / G) + 1, H = Math.ceil((bounds.h + 400) / G) + 1;
    const wall = new Uint8Array(W * H);
    const usedH = new Uint8Array(W * H), usedV = new Uint8Array(W * H);
    const cell = (p: Point) => ({ cx: Math.round((p.x - x0) / G), cy: Math.round((p.y - y0) / G) });
    const inside = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < W && cy < H;

    const cards = new Set<Rect>();
    const ends: { req: RouteRequest; stub: Point; end: RouteEnd }[] = [];
    for (const r of reqs)
        for (const end of [r.a, r.b]) { cards.add(end.card); ends.push({ req: r, stub: stubOf(end), end }); }
    cards.forEach(c => {
        const a = cell({ x: c.x - CARD_CLEAR, y: c.y - CARD_CLEAR }), b = cell({ x: c.x + c.w + CARD_CLEAR, y: c.y + c.h + CARD_CLEAR });
        for (let cy = a.cy + 1; cy < b.cy; cy++) for (let cx = a.cx + 1; cx < b.cx; cx++) if (inside(cx, cy)) wall[cy * W + cx] = 1;
    });
    // every stub's run out of its card belongs to that link alone
    const markRun = (from: Point, to: Point) => {
        const a = cell(from), b = cell(to);
        const horiz = a.cy === b.cy;
        const n = Math.max(Math.abs(b.cx - a.cx), Math.abs(b.cy - a.cy));
        for (let i = 0; i <= n; i++) {
            const cx = a.cx + Math.sign(b.cx - a.cx) * i, cy = a.cy + Math.sign(b.cy - a.cy) * i;
            if (inside(cx, cy)) (horiz ? usedH : usedV)[cy * W + cx] = 1;
        }
    };
    ends.forEach(e => markRun(e.end.anchor, e.stub));

    const out = new Map<number, Point[]>();
    const dist = (r: RouteRequest) => Math.abs(r.a.anchor.x - r.b.anchor.x) + Math.abs(r.a.anchor.y - r.b.anchor.y);
    const N = W * H;
    const cost = new Float64Array(N * 4), prev = new Int32Array(N * 4);
    for (const r of [...reqs].sort((p, q) => dist(p) - dist(q))) {
        const ea = ends.find(e => e.req === r && e.end === r.a), eb = ends.find(e => e.req === r && e.end === r.b);
        if (!ea || !eb) continue;
        const s = cell(ea.stub), t = cell(eb.stub);
        if (!inside(s.cx, s.cy) || !inside(t.cx, t.cy)) continue;
        // the stubs' own cells are this link's to use
        const own = new Set([s.cy * W + s.cx, t.cy * W + t.cx]);
        cost.fill(Infinity); prev.fill(-1);
        const heap = new Heap();
        const startDir = OUT[r.a.side], endDir = (OUT[r.b.side] + 2) % 4;      // arrive heading into b's card
        const sState = (s.cy * W + s.cx) * 4 + startDir;
        cost[sState] = 0; heap.push(0, sState);
        let goal = -1;
        while (heap.size) {
            const st = heap.pop();
            const c = st >> 2, d = st & 3, cx = c % W, cy = (c / W) | 0;
            if (cx === t.cx && cy === t.cy) { goal = st; break; }
            const base = cost[st];
            for (let nd = 0; nd < 4; nd++) {
                if (nd === (d + 2) % 4) continue;                                  // no U-turns
                const nx = cx + DX[nd], ny = cy + DY[nd];
                if (!inside(nx, ny)) continue;
                const nc = ny * W + nx;
                if (wall[nc] && !own.has(nc)) continue;
                const horiz = nd % 2 === 0;
                let step = STEP + (nd !== d ? BEND : 0);
                if (!own.has(nc)) {
                    if ((horiz ? usedH : usedV)[nc]) step += SHARED;
                    if ((horiz ? usedV : usedH)[nc]) step += CROSS;
                    const side1 = horiz ? nc - W : nc - 1, side2 = horiz ? nc + W : nc + 1;
                    const lane = horiz ? usedH : usedV;
                    if ((side1 >= 0 && lane[side1]) || (side2 < N && lane[side2])) step += BESIDE;
                }
                if (nx === t.cx && ny === t.cy && nd !== endDir) step += BEND;
                const ns = nc * 4 + nd, nk = base + step;
                if (nk < cost[ns]) {
                    cost[ns] = nk; prev[ns] = st;
                    heap.push(nk + (Math.abs(nx - t.cx) + Math.abs(ny - t.cy)) * STEP, ns);
                }
            }
        }
        const pts: Point[] = [];
        if (goal >= 0) {
            const cells: number[] = [];
            for (let st = goal; st >= 0; st = prev[st]) cells.push(st >> 2);
            cells.reverse();
            for (let i = 0; i < cells.length; i++) {
                const c = cells[i], cx = c % W, cy = (c / W) | 0;
                pts.push({ x: x0 + cx * G, y: y0 + cy * G });
                if (i > 0) {
                    const pc = cells[i - 1], horiz = (pc / W | 0) === cy;
                    (horiz ? usedH : usedV)[c] = 1;
                    (horiz ? usedH : usedV)[pc] = 1;
                }
            }
        } else pts.push(ea.stub, { x: eb.stub.x, y: ea.stub.y }, eb.stub);      // no way through: an L, drawn anyway
        out.set(r.id, simplify([r.a.anchor, ...pts, r.b.anchor]));
    }
    return out;
}

// Drop the points in the middle of straight runs.
function simplify(pts: Point[]): Point[] {
    const res: Point[] = [];
    for (const p of pts) {
        const n = res.length;
        if (n && res[n - 1].x === p.x && res[n - 1].y === p.y) continue;
        if (n >= 2) {
            const a = res[n - 2], b = res[n - 1];
            if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) { res[n - 1] = p; continue; }
        }
        res.push(p);
    }
    return res;
}

export const pathD = (pts: Point[]) => pts.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
