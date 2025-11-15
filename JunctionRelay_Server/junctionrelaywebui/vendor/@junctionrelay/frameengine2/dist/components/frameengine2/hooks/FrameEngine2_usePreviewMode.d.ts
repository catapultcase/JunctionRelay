import { FrameLayoutConfig } from '../types/FrameEngine2_LayoutTypes';

/**
 * Grid settings stored for restoration
 */
interface GridSettings {
    showGrid: boolean;
    showOutlines: boolean;
}
/**
 * Parameters for the usePreviewMode hook
 */
export interface UsePreviewModeParams {
    /** Ref storing original grid settings before preview mode */
    previewOriginalGridSettingsRef: React.MutableRefObject<GridSettings | null>;
    /** Current preview mode state (used to determine entering/exiting) */
    currentPreviewMode: boolean;
    /** Callback when element selection should be cleared */
    onClearSelection: () => void;
    /** Callback when layout should be updated */
    onLayoutUpdate: (updater: (current: FrameLayoutConfig | null) => FrameLayoutConfig | null) => void;
    /** Callback to update preview mode state */
    onSetPreviewMode: (enabled: boolean) => void;
}
/**
 * Return type for the usePreviewMode hook
 */
export interface PreviewModeManager {
    /** Handler to toggle preview mode */
    handlePreview: () => void;
}
/**
 * Custom hook to manage preview mode toggling
 *
 * This hook handles:
 * - Toggling preview mode on/off
 * - Clearing element selection when entering preview mode
 * - Storing and restoring grid visibility settings
 * - Updating layout configuration for preview display
 *
 * **Architecture Notes:**
 * - Extracted from ConfigureFrame2.tsx to reduce component complexity (~62 lines)
 * - Centralizes preview mode state management logic
 * - Works with external preview grid settings ref (shared with useLayoutPersistence)
 *
 * **Following FRAMEENGINE2_ARCHITECTURE_GUIDELINES.md:**
 * - Section 4.1: Extract effects >50 lines into custom hooks
 * - Section 2.2: Stable callback references with useCallback
 * - Section 7.3: Document optimization decisions
 *
 * **Usage Example:**
 * ```typescript
 * const { handlePreview } = usePreviewMode({
 *     previewOriginalGridSettingsRef: previewOriginalGridSettings,
 *     onClearSelection: () => setSelectedElementId(null),
 *     onLayoutUpdate: setLayout
 * });
 * ```
 *
 * @param params - Configuration parameters for the hook
 * @returns PreviewModeManager object containing handlers
 */
export declare function usePreviewMode(params: UsePreviewModeParams): PreviewModeManager;
export {};
//# sourceMappingURL=FrameEngine2_usePreviewMode.d.ts.map