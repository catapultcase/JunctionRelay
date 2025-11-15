import { FrameLayoutConfig, PlacedElement } from '../types/FrameEngine2_LayoutTypes';

/**
 * Grid settings for preview mode restoration
 */
interface GridSettings {
    showGrid: boolean;
    showOutlines: boolean;
}
/**
 * Parameters for the useLayoutPersistence hook
 */
export interface UseLayoutPersistenceParams {
    /** Layout ID to load/save */
    layoutId: string | undefined;
    /** Current layout configuration */
    layout: FrameLayoutConfig | null;
    /** Current elements array */
    elements: PlacedElement[];
    /** Callback when layout is loaded */
    onLayoutLoaded: (layout: FrameLayoutConfig) => void;
    /** Callback when elements are loaded */
    onElementsLoaded: (elements: PlacedElement[]) => void;
    /** Callback when preview mode should be enabled (for templates) */
    onSetPreviewMode: (enabled: boolean) => void;
}
/**
 * Return type for the useLayoutPersistence hook
 */
export interface LayoutPersistence {
    /** Whether layout is currently loading */
    loading: boolean;
    /** Error message if load/save failed */
    error: string | null;
    /** Clear error message */
    clearError: () => void;
    /** Save layout to API */
    saveLayout: () => Promise<void>;
    /** Grid settings stored before entering preview mode (for restoration) */
    previewOriginalGridSettings: React.MutableRefObject<GridSettings | null>;
}
/**
 * Custom hook to manage layout loading and saving
 *
 * This hook handles:
 * - Loading layout from API on mount
 * - Saving layout changes to API
 * - Template auto-preview mode
 * - Error handling for API operations
 * - Loading state management
 *
 * **Architecture Notes:**
 * - Extracted from ConfigureFrame2.tsx to reduce component complexity (~78 lines)
 * - Centralizes all API persistence logic
 * - Manages loading/error states independently
 * - Stores preview mode grid settings for restoration
 *
 * **Following FRAMEENGINE2_ARCHITECTURE_GUIDELINES.md:**
 * - Section 4.1: Extract effects >50 lines into custom hooks
 * - Section 2.2: Stable callback references with useCallback
 * - Section 7.3: Document optimization decisions
 *
 * **Usage Example:**
 * ```typescript
 * const {
 *     loading,
 *     error,
 *     clearError,
 *     saveLayout,
 *     previewOriginalGridSettings
 * } = useLayoutPersistence({
 *     layoutId: id,
 *     layout,
 *     elements,
 *     onLayoutLoaded: setLayout,
 *     onElementsLoaded: setElements,
 *     onSetPreviewMode: setPreviewMode
 * });
 * ```
 *
 * @param params - Configuration parameters for the hook
 * @returns LayoutPersistence object containing state and handlers
 */
export declare function useLayoutPersistence(params: UseLayoutPersistenceParams): LayoutPersistence;
export {};
//# sourceMappingURL=FrameEngine2_useLayoutPersistence.d.ts.map