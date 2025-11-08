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

import { useCallback } from 'react';
import type { FrameLayoutConfig, CanvasSettings } from '../types/FrameEngine2_LayoutTypes';
import { DEFAULT_CANVAS_SETTINGS } from '../FrameEngine2_Data';

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
export function usePreviewMode(params: UsePreviewModeParams): PreviewModeManager {
    const {
        previewOriginalGridSettingsRef,
        currentPreviewMode,
        onClearSelection,
        onLayoutUpdate,
        onSetPreviewMode
    } = params;

    /**
     * Toggle preview mode
     * - Entering: Clear selection, hide grid, store original settings
     * - Exiting: Restore original grid settings
     */
    const handlePreview = useCallback(() => {
        // Determine if we're entering or exiting based on current state
        // This is more robust than inferring from grid visibility
        const isEnteringPreview = !currentPreviewMode;

        onLayoutUpdate(currentLayout => {
            if (!currentLayout) return currentLayout;

            if (isEnteringPreview) {
                // ENTERING preview mode
                if (!currentLayout.canvasSettings?.grid) return currentLayout;

                // Store current grid settings for restoration
                previewOriginalGridSettingsRef.current = {
                    showGrid: currentLayout.canvasSettings.grid.showGrid,
                    showOutlines: currentLayout.canvasSettings.grid.showOutlines
                };

                // Force grid settings to false for preview
                return {
                    ...currentLayout,
                    canvasSettings: {
                        ...currentLayout.canvasSettings,
                        grid: {
                            ...DEFAULT_CANVAS_SETTINGS.grid,
                            ...currentLayout.canvasSettings.grid,
                            showGrid: false,
                            showOutlines: false
                        }
                    } as CanvasSettings
                } as FrameLayoutConfig;
            } else {
                // EXITING preview mode
                // Restore original grid settings if available
                if (previewOriginalGridSettingsRef.current) {
                    const restored = {
                        ...currentLayout,
                        canvasSettings: {
                            ...currentLayout.canvasSettings,
                            grid: {
                                ...DEFAULT_CANVAS_SETTINGS.grid,
                                ...(currentLayout.canvasSettings?.grid || {}),
                                showGrid: previewOriginalGridSettingsRef.current.showGrid,
                                showOutlines: previewOriginalGridSettingsRef.current.showOutlines
                            }
                        } as CanvasSettings
                    } as FrameLayoutConfig;
                    previewOriginalGridSettingsRef.current = null;
                    return restored;
                }
                return currentLayout;
            }
        });

        // Update preview state and clear selection when entering preview mode
        if (isEnteringPreview) {
            onClearSelection();
            onSetPreviewMode(true);
            console.log('[FrameEngine2] Preview mode: ENABLED');
        } else {
            onSetPreviewMode(false);
            console.log('[FrameEngine2] Preview mode: DISABLED');
        }
    }, [currentPreviewMode, previewOriginalGridSettingsRef, onClearSelection, onLayoutUpdate, onSetPreviewMode]);

    return {
        handlePreview
    };
}
