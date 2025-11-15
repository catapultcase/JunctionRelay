import { RefObject } from 'react';

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
    /** Layout mode for determining zoom limits */
    layoutMode?: 'composite' | 'pixel';
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
 * - Zoom limits: 0.1x to 5x (Composite mode) or 0.1x to 100x (Pixel mode)
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
export declare function useCanvasViewport(params: UseCanvasViewportParams): UseCanvasViewportResult;
//# sourceMappingURL=FrameEngine2_useCanvasViewport.d.ts.map