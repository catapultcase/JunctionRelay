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

import { useState, useEffect, useCallback, useRef } from 'react';
import type { FrameLayoutConfig, PlacedElement } from '../types/FrameEngine2_LayoutTypes';
import type { MediaRiveProperties } from '../types/FrameEngine2_ElementTypes';
import { getFrameLayout, updateFrameLayout } from '../FrameEngine2_API';
import { parseFrameLayoutResponse } from '../FrameEngine2_Data';

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
export function useLayoutPersistence(params: UseLayoutPersistenceParams): LayoutPersistence {
    const {
        layoutId,
        layout,
        elements,
        onLayoutLoaded,
        onElementsLoaded,
        onSetPreviewMode
    } = params;

    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Store original grid settings before entering preview mode (for restoration)
    const previewOriginalGridSettings = useRef<GridSettings | null>(null);

    /**
     * Clear error message
     */
    const clearError = useCallback(() => {
        setError(null);
    }, []);

    /**
     * Load layout data from API
     * Automatically enables preview mode for templates
     */
    useEffect(() => {
        const loadLayout = async () => {
            if (!layoutId) {
                setError('No layout ID provided');
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setError(null);

                const response = await getFrameLayout(layoutId);
                const { layout: parsedLayout, elements: parsedElements } = parseFrameLayoutResponse(response);

                // If this is a template, auto-enable preview mode and hide grid
                // Do this BEFORE setting state to avoid race conditions
                if (parsedLayout.isTemplate) {
                    onSetPreviewMode(true);

                    // Save original grid settings if they exist
                    if (parsedLayout.canvasSettings?.grid) {
                        previewOriginalGridSettings.current = {
                            showGrid: parsedLayout.canvasSettings.grid.showGrid,
                            showOutlines: parsedLayout.canvasSettings.grid.showOutlines
                        };

                        // Hide grid in the parsed layout before setting state
                        parsedLayout.canvasSettings.grid.showGrid = false;
                        parsedLayout.canvasSettings.grid.showOutlines = false;
                    }
                } else {
                    // Not a template - ensure preview mode is disabled
                    onSetPreviewMode(false);
                }

                onLayoutLoaded(parsedLayout);
                onElementsLoaded(parsedElements);
            } catch (err) {
                console.error('[FrameEngine2] Failed to load layout:', err);
                setError(err instanceof Error ? err.message : 'Failed to load layout');
            } finally {
                setLoading(false);
            }
        };

        loadLayout();

        // CLEANUP: Clear preview ref when layout ID changes to prevent stale data
        // This fixes the bug where cloning a template keeps preview mode active
        return () => {
            previewOriginalGridSettings.current = null;
        };
    }, [layoutId, onLayoutLoaded, onElementsLoaded, onSetPreviewMode]);

    /**
     * Save layout to API (immediate)
     * Logs detailed information about Rive elements for debugging
     */
    const saveLayout = useCallback(async () => {
        if (!layoutId || !layout) return;

        console.log(`💾 [SAVE] Saving layout with ${elements.length} elements:`,
            elements
                .filter(el => el.type === 'media-rive')
                .map(el => {
                    const props = el.properties as MediaRiveProperties;
                    return {
                        id: el.id,
                        filename: props.filename,
                        riveInputs: props.riveInputs,
                        riveBindings: props.riveBindings,
                        inputsCount: Object.keys(props.riveInputs || {}).length,
                        bindingsCount: Object.keys(props.riveBindings || {}).length
                    };
                })
        );

        try {
            await updateFrameLayout(layoutId, layout, elements);
            console.log('[FrameEngine2] Layout saved successfully');
        } catch (err) {
            console.error('[FrameEngine2] Failed to save layout:', err);
            setError(err instanceof Error ? err.message : 'Failed to save layout');
        }
    }, [layoutId, layout, elements]);

    return {
        loading,
        error,
        clearError,
        saveLayout,
        previewOriginalGridSettings
    };
}
