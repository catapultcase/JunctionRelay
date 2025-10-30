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

import { useState, useCallback, useMemo, useRef, useEffect, RefObject } from 'react';

/**
 * Viewport state for pan and zoom
 */
export interface ViewportState {
    translateX: number;
    translateY: number;
    scale: number;
}

/**
 * Parameters for useCanvasViewport hook
 */
export interface UseCanvasViewportParams {
    /** Ref to the container element for event attachment */
    containerRef: RefObject<HTMLDivElement | null>;

    /** Canvas width in pixels */
    canvasWidth: number;

    /** Canvas height in pixels */
    canvasHeight: number;
}

/**
 * Return value from useCanvasViewport hook
 */
export interface UseCanvasViewportResult {
    /** Current viewport state */
    viewport: ViewportState;

    /** Memoized transform style for canvas container */
    transformStyle: React.CSSProperties;

    /** Whether currently panning */
    isPanning: boolean;

    /** Current zoom level (same as viewport.scale, for convenience) */
    currentZoom: number;

    /** Reset view to center and fit canvas */
    resetView: () => void;

    /** Handle mouse down for pan start */
    handleMouseDown: (e: React.MouseEvent) => void;

    /** Handle mouse move for panning */
    handleMouseMove: (e: React.MouseEvent) => void;

    /** Handle mouse up for pan end */
    handleMouseUp: () => void;
}

/**
 * Custom hook for canvas pan and zoom functionality
 *
 * Features:
 * - Wheel zoom (zooms to cursor position)
 * - Middle-click pan
 * - Reset view to center and fit
 * - Zoom limits: 0.1x to 5x
 *
 * Performance optimizations:
 * - Ref-based event handlers (no stale closures)
 * - Memoized transform style
 * - Stable callbacks with empty dependencies
 * - Single event listener registration (never removed/re-added)
 *
 * Best practices followed:
 * - Custom hook extraction for complex logic
 * - Separation of concerns
 * - No prop drilling
 * - Clean, testable architecture
 *
 * @param params - Hook parameters
 * @returns Viewport interface for canvas
 */
export function useCanvasViewport(params: UseCanvasViewportParams): UseCanvasViewportResult {
    const { containerRef, canvasWidth, canvasHeight } = params;

    // Viewport state - initialized with lazy function to calculate centered position
    const [viewport, setViewport] = useState<ViewportState>(() => {
        // Try to get initial centered position
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                return {
                    translateX: (rect.width - canvasWidth) / 2,
                    translateY: (rect.height - canvasHeight) / 2,
                    scale: 1
                };
            }
        }
        // Fallback to (0, 0) if container not ready
        return {
            translateX: 0,
            translateY: 0,
            scale: 1
        };
    });

    // Pan state
    const [isPanning, setIsPanning] = useState(false);

    // Refs to avoid stale closures in event handlers
    // OPTIMIZATION: Event handlers use these refs instead of state/props
    const viewportRef = useRef<ViewportState>(viewport);
    const isPanningRef = useRef<boolean>(isPanning);
    const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    /**
     * Sync viewport ref when state changes
     * OPTIMIZATION: Keeps ref in sync for event handlers
     */
    useEffect(() => {
        viewportRef.current = viewport;
    }, [viewport]);

    /**
     * Sync isPanning ref when state changes
     * OPTIMIZATION: Keeps ref in sync for event handlers
     */
    useEffect(() => {
        isPanningRef.current = isPanning;
    }, [isPanning]);

    /**
     * Memoized transform style for canvas container
     * OPTIMIZATION: Only recreated when viewport changes, not on every render
     */
    const transformStyle = useMemo<React.CSSProperties>(() => ({
        transform: `translate(${viewport.translateX}px, ${viewport.translateY}px) scale(${viewport.scale})`,
        transformOrigin: '0 0',
        transition: 'none' // Disable transitions for smooth dragging
    }), [viewport.translateX, viewport.translateY, viewport.scale]);

    /**
     * Reset view to center canvas in viewport at 100% scale
     * OPTIMIZATION: Memoized callback with stable dependencies
     * FIX: Use getBoundingClientRect() for accurate dimensions
     */
    const resetView = useCallback(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;
        const rect = container.getBoundingClientRect();

        // Use getBoundingClientRect for accurate rendered dimensions
        const containerWidth = rect.width;
        const containerHeight = rect.height;

        // Skip if container has no dimensions yet (not rendered)
        if (containerWidth === 0 || containerHeight === 0) {
            return;
        }

        // Center the canvas in the viewport at 100% scale
        const translateX = (containerWidth - canvasWidth) / 2;
        const translateY = (containerHeight - canvasHeight) / 2;

        setViewport({
            translateX,
            translateY,
            scale: 1
        });
    }, [containerRef, canvasWidth, canvasHeight]);

    /**
     * Handle wheel event for zooming
     * OPTIMIZATION: Uses refs to avoid stale closures, empty dependencies
     */
    const handleWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();

        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const currentViewport = viewportRef.current;
        const delta = e.deltaY;

        // Zoom factor: 10% per wheel tick
        const zoomFactor = delta > 0 ? 0.9 : 1.1;

        // Clamp zoom between 0.1x (10%) and 5x (500%)
        const newScale = Math.max(0.1, Math.min(5, currentViewport.scale * zoomFactor));

        // Zoom to cursor position
        // Calculate how much the scale changed
        const scaleChange = newScale / currentViewport.scale;

        // Adjust translation to zoom toward cursor
        const newTranslateX = mouseX - (mouseX - currentViewport.translateX) * scaleChange;
        const newTranslateY = mouseY - (mouseY - currentViewport.translateY) * scaleChange;

        setViewport({
            translateX: newTranslateX,
            translateY: newTranslateY,
            scale: newScale
        });
    }, [containerRef]); // ✅ Stable dependencies

    /**
     * Initialize view to centered position on mount
     * FIX: Ensures reset view returns to the proper initial centered view
     * Uses requestAnimationFrame to ensure DOM is fully laid out
     */
    useEffect(() => {
        // Wait for next animation frame to ensure container is rendered with proper dimensions
        const frameId = requestAnimationFrame(() => {
            resetView();
        });

        return () => cancelAnimationFrame(frameId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Empty deps - only run once on mount

    /**
     * Attach wheel event listener
     * OPTIMIZATION: Only attached once, never removed/re-added
     */
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Must use non-passive to call preventDefault
        container.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
            container.removeEventListener('wheel', handleWheel);
        };
    }, [containerRef, handleWheel]);

    /**
     * Handle mouse down for pan start
     * OPTIMIZATION: Memoized callback with stable dependencies
     */
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        // Only pan with middle button (button 1)
        if (e.button !== 1) return;

        e.preventDefault();
        setIsPanning(true);

        // Store pan start position relative to current viewport
        panStartRef.current = {
            x: e.clientX - viewportRef.current.translateX,
            y: e.clientY - viewportRef.current.translateY
        };
    }, []);

    /**
     * Handle mouse move for panning
     * OPTIMIZATION: Uses refs to avoid stale closures
     */
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isPanningRef.current) return;

        // Calculate new viewport position
        setViewport(prev => ({
            ...prev,
            translateX: e.clientX - panStartRef.current.x,
            translateY: e.clientY - panStartRef.current.y
        }));
    }, []);

    /**
     * Handle mouse up for pan end
     * OPTIMIZATION: Stable callback
     */
    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
    }, []);

    return {
        viewport,
        transformStyle,
        isPanning,
        currentZoom: viewport.scale,
        resetView,
        handleMouseDown,
        handleMouseMove,
        handleMouseUp
    };
}
