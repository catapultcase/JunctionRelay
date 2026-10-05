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
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

// A pan/zoom viewport over a canvas: the container clips (overflow hidden) and an inner stage carries
// translate(...) scale(...). The wheel zooms toward the pointer and only inside the container - the page
// never scrolls under it. Middle-drag pans anywhere; startPan lets the canvas pan on a left-drag of its
// background. The view is remembered in this browser under storageKey.

export interface View { tx: number; ty: number; scale: number }
export type Box = { x: number; y: number; w: number; h: number };

const MIN = 0.15, MAX = 3;
const clamp = (s: number) => Math.min(MAX, Math.max(MIN, s));
const isView = (v: unknown): v is View =>
    typeof v === "object" && v !== null && "tx" in v && "ty" in v && "scale" in v &&
    typeof v.tx === "number" && typeof v.ty === "number" && typeof v.scale === "number";

function readView(key: string): View | null {
    try {
        const raw = localStorage.getItem(key);
        const v: unknown = raw ? JSON.parse(raw) : null;
        return isView(v) ? { ...v, scale: clamp(v.scale) } : null;
    } catch { return null; }
}

export function useCanvasViewport(storageKey: string) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [view, setView] = useState<View>(() => readView(storageKey) ?? { tx: 40, ty: 40, scale: 1 });
    const [restored] = useState(() => readView(storageKey) != null);
    const viewRef = useRef(view);
    viewRef.current = view;

    useEffect(() => {
        try { localStorage.setItem(storageKey, JSON.stringify(view)); } catch { /* private window: forget it */ }
    }, [storageKey, view]);

    // screen point -> canvas point
    const toCanvas = useCallback((clientX: number, clientY: number) => {
        const r = containerRef.current?.getBoundingClientRect();
        const v = viewRef.current;
        return { x: (clientX - (r?.left ?? 0) - v.tx) / v.scale, y: (clientY - (r?.top ?? 0) - v.ty) / v.scale };
    }, []);

    const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
        const el = containerRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const px = (clientX ?? r.left + r.width / 2) - r.left, py = (clientY ?? r.top + r.height / 2) - r.top;
        setView(v => {
            const scale = clamp(v.scale * factor);
            const k = scale / v.scale;
            return { scale, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k };
        });
    }, []);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, [zoomAt]);

    // panning: middle-drag anywhere, or whatever the canvas starts with startPan
    const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
    const [panning, setPanning] = useState(false);
    const startPan = useCallback((clientX: number, clientY: number) => {
        pan.current = { x: clientX, y: clientY, tx: viewRef.current.tx, ty: viewRef.current.ty };
        setPanning(true);
    }, []);
    useEffect(() => {
        const move = (e: PointerEvent) => {
            const p = pan.current;
            if (!p) return;
            setView(v => ({ ...v, tx: p.tx + e.clientX - p.x, ty: p.ty + e.clientY - p.y }));
        };
        const up = () => { if (pan.current) { pan.current = null; setPanning(false); } };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    }, []);
    const onMiddleDown = useCallback((e: ReactPointerEvent) => {
        if (e.button !== 1) return;
        e.preventDefault();
        startPan(e.clientX, e.clientY);
    }, [startPan]);

    // fit a canvas box into the container, never past 100%
    const fit = useCallback((b: Box) => {
        const el = containerRef.current;
        if (!el || b.w <= 0 || b.h <= 0) return;
        const r = el.getBoundingClientRect();
        const scale = clamp(Math.min(1, (r.width - 40) / b.w, (r.height - 40) / b.h));
        setView({ scale, tx: (r.width - b.w * scale) / 2 - b.x * scale, ty: (r.height - b.h * scale) / 2 - b.y * scale });
    }, []);
    const actualSize = useCallback(() => zoomAt(1 / viewRef.current.scale), [zoomAt]);

    return { containerRef, view, restored, toCanvas, zoomAt, fit, actualSize, startPan, onMiddleDown, panning };
}
