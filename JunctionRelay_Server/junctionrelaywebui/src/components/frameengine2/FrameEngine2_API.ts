/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * JunctionRelay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * FrameEngine2 API Layer
 *
 * Clean, modern API functions for FrameEngine2 only.
 * NO legacy code, NO backwards compatibility.
 *
 * Following FrameEngine2 conventions:
 * - Performance optimized
 * - Type-safe
 * - Clean error handling
 */

import type { FrameLayoutConfig, PlacedElement } from './types/FrameEngine2_LayoutTypes';

const API_BASE_URL = '/api/frameengine';

// ============================================================================
// Response Types
// ============================================================================

/**
 * Raw response from GET /api/frameengine/{id}
 * Matches FrameLayoutDto from C# backend
 */
interface FrameLayoutResponse {
    id: string;
    displayName: string;
    description?: string;
    layoutType: string;
    isTemplate: boolean;
    isDraft: boolean;
    isPublished: boolean;
    width?: number;
    height?: number;
    orientation: string;
    backgroundType: string;
    backgroundColor?: string;
    backgroundImageUrl?: string;
    backgroundImageFit?: string;
    backgroundVideoUrl?: string;
    backgroundVideoFit?: string;
    videoLoop: boolean;
    videoMuted: boolean;
    videoAutoplay: boolean;
    backgroundOpacity: number;
    riveFile?: string;
    jsonFrameConfig?: string;
    jsonFrameConfigRuntime?: string;
    jsonFrameElements?: string;
    created: string;
    lastModified?: string;
    hasThumbnail: boolean;
    thumbnailPath?: string;
    thumbnailGeneratedAt?: string;
    thumbnailOverride: boolean;
}

/**
 * Update request payload
 */
interface UpdateLayoutRequest {
    displayName?: string;
    description?: string;
    layoutType?: string;
    width?: number;
    height?: number;
    orientation?: string;
    backgroundType?: string;
    backgroundColor?: string;
    backgroundImageUrl?: string | null;
    backgroundImageFit?: string;
    backgroundVideoUrl?: string | null;
    backgroundVideoFit?: string;
    videoLoop?: boolean;
    videoMuted?: boolean;
    videoAutoplay?: boolean;
    backgroundOpacity?: number;
    riveFile?: string | null;
    jsonFrameConfig?: string;
    jsonFrameConfigRuntime?: string;
    jsonFrameElements?: string;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get frame layout by ID
 * @param id - Layout ID from URL params
 * @returns Raw layout data from backend
 */
export const getFrameLayout = async (id: string): Promise<FrameLayoutResponse> => {
    const response = await fetch(`${API_BASE_URL}/${id}`);

    if (!response.ok) {
        throw new Error(`Failed to load layout: ${response.statusText}`);
    }

    return response.json();
};

/**
 * Update frame layout
 * @param id - Layout ID
 * @param layout - FrameEngine2 layout config
 * @param elements - Array of placed elements
 */
export const updateFrameLayout = async (
    id: string,
    layout: FrameLayoutConfig,
    elements: PlacedElement[]
): Promise<void> => {
    // Strip test values from media-rive elements before serializing
        const runtimeElements = elements.map(element => {
            if (element.type === 'media-rive') {
                // Create a copy with cleared test values
                const { riveBindings, riveInputs, ...otherProps } = element.properties;
                return {
                    ...element,
                    properties: {
                        ...otherProps,
                        riveBindings: {},
                        riveInputs: {}
                    }
                };
            }
            return element;
        });

        // Serialize stripped elements to JSON string
        const jsonFrameElements = JSON.stringify(runtimeElements);

    // Build FrameEngine2 config object (canvasSettings + sensorTestValues)
    const frameEngine2Config = {
        canvasSettings: layout.canvasSettings,
        sensorTestValues: layout.sensorTestValues || {}
    };

    // Serialize config to JSON string
    const jsonFrameConfig = JSON.stringify(frameEngine2Config);

    // Build runtime config for devices (includes background settings)
    const bgType = layout.backgroundType || 'color';
    const baseBackground = {
        type: bgType,
        color: layout.backgroundColor || '#FFFFFF',
        opacity: layout.backgroundOpacity || 1.0
    };

    let background;
    if (bgType === 'image') {
        background = {
            ...baseBackground,
            imageUrl: layout.backgroundImageUrl || null,
            imageFit: layout.backgroundImageFit || 'cover',
            videoUrl: null,
            videoFit: null,
            videoLoop: null,
            videoMuted: null,
            videoAutoplay: null
        };
    } else if (bgType === 'video') {
        background = {
            ...baseBackground,
            imageUrl: null,
            imageFit: null,
            videoUrl: layout.backgroundVideoUrl || null,
            videoFit: layout.backgroundVideoFit || 'cover',
            videoLoop: layout.videoLoop ?? true,
            videoMuted: layout.videoMuted ?? true,
            videoAutoplay: layout.videoAutoplay ?? true
        };
    } else {
        background = {
            ...baseBackground,
            imageUrl: null,
            imageFit: null,
            videoUrl: null,
            videoFit: null,
            videoLoop: null,
            videoMuted: null,
            videoAutoplay: null
        };
    }

    const runtimeFrameConfig = {
        type: 'rive_config',
        screenId: id,
        frameConfig: {
            version: '1.0',
            lastConfigUpdate: new Date().toISOString(),
            canvas: {
                width: layout.width,
                height: layout.height,
                orientation: layout.orientation || 'landscape',
                settings: {
                    elementPadding: layout.canvasSettings?.elementPadding ?? 4
                }
            },
            background
        }
    };

    const jsonFrameConfigRuntime = JSON.stringify(runtimeFrameConfig);

    // Build update request with only FrameEngine2 data
    const request: UpdateLayoutRequest = {
        displayName: layout.displayName,
        description: layout.description,
        layoutType: layout.layoutType,
        width: layout.width,
        height: layout.height,
        orientation: layout.orientation,
        backgroundType: layout.backgroundType,
        backgroundColor: layout.backgroundColor,
        backgroundImageUrl: layout.backgroundImageUrl || null,
        backgroundImageFit: layout.backgroundImageFit,
        backgroundVideoUrl: layout.backgroundVideoUrl || null,
        backgroundVideoFit: layout.backgroundVideoFit,
        videoLoop: layout.videoLoop,
        videoMuted: layout.videoMuted,
        videoAutoplay: layout.videoAutoplay,
        backgroundOpacity: layout.backgroundOpacity,
        riveFile: layout.riveFile || null,
        jsonFrameConfig,
        jsonFrameConfigRuntime,
        jsonFrameElements
    };

    const response = await fetch(`${API_BASE_URL}/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
    });

    if (!response.ok) {
        throw new Error(`Failed to save layout: ${response.statusText}`);
    }
};

/**
 * Debounced save function
 * Returns a function that delays execution until after wait milliseconds
 */
export const createDebouncedSave = (wait: number = 2000) => {
    let timeout: NodeJS.Timeout | null = null;

    return (id: string, layout: FrameLayoutConfig, elements: PlacedElement[]): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (timeout) {
                clearTimeout(timeout);
            }

            timeout = setTimeout(async () => {
                try {
                    await updateFrameLayout(id, layout, elements);
                    resolve();
                } catch (error) {
                    reject(error);
                } finally {
                    timeout = null;
                }
            }, wait);
        });
    };
};
