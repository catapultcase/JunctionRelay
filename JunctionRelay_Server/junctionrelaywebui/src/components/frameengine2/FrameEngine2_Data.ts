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
 * FrameEngine2 Data Parser
 *
 * Parses database responses into clean FrameEngine2 format.
 * NO backwards compatibility - invalid data is skipped/defaulted.
 *
 * Philosophy:
 * - Only valid CSS values accepted
 * - Invalid data → use FrameEngine2 defaults
 * - Clean break from legacy FrameEngine
 */

import type { FrameLayoutConfig, PlacedElement } from './types/FrameEngine2_LayoutTypes';

// ============================================================================
// Default Values (Exported - Single Source of Truth)
// ============================================================================

export const DEFAULT_CANVAS_SETTINGS = {
    grid: {
        snapToGrid: false,
        showGrid: false,
        showOutlines: false,
        gridSize: 10,
        gridColor: '#7a7a7a'
    },
    elementPadding: 4,
    testBindingsInterval: 5000,
    testBindingsEnabled: false
};

const VALID_IMAGE_FIT_MODES: Set<string> = new Set(['cover', 'contain', 'fill', 'none']);
const VALID_VIDEO_FIT_MODES: Set<string> = new Set(['cover', 'contain', 'fill', 'none']);

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate and normalize image fit mode
 * Invalid values → 'cover' (FrameEngine2 default)
 */
const normalizeImageFit = (fit?: string): 'cover' | 'contain' | 'fill' | 'none' => {
    if (!fit || !VALID_IMAGE_FIT_MODES.has(fit)) {
        return 'cover';
    }
    return fit as 'cover' | 'contain' | 'fill' | 'none';
};

/**
 * Validate and normalize video fit mode
 * Invalid values → 'cover' (FrameEngine2 default)
 */
const normalizeVideoFit = (fit?: string): 'cover' | 'contain' | 'fill' | 'none' => {
    if (!fit || !VALID_VIDEO_FIT_MODES.has(fit)) {
        return 'cover';
    }
    return fit as 'cover' | 'contain' | 'fill' | 'none';
};

/**
 * Parse and validate elements from JSON string
 * Invalid JSON → empty array
 */
const parseElements = (jsonElements?: string): PlacedElement[] => {
    if (!jsonElements) {
        return [];
    }

    try {
        const parsed = JSON.parse(jsonElements);

        // Validate it's an array
        if (!Array.isArray(parsed)) {
            console.warn('[FrameEngine2] JsonFrameElements is not an array, using empty array');
            return [];
        }

        // Validate and normalize each element
        const validElements: PlacedElement[] = [];

        for (const el of parsed) {
            // Skip invalid elements
            if (
                !el.id ||
                !el.type ||
                typeof el.x !== 'number' ||
                typeof el.y !== 'number' ||
                typeof el.width !== 'number' ||
                typeof el.height !== 'number' ||
                !el.properties
            ) {
                continue;
            }

            // Normalize element with required boolean defaults
            validElements.push({
                id: el.id,
                type: el.type,
                x: el.x,
                y: el.y,
                width: el.width,
                height: el.height,
                rotation: el.rotation ?? 0,
                properties: el.properties,
                visible: el.visible ?? true,
                locked: el.locked ?? false,
                zIndex: el.zIndex
            });
        }

        if (validElements.length !== parsed.length) {
            console.warn(
                `[FrameEngine2] Filtered ${parsed.length - validElements.length} invalid elements`
            );
        }

        return validElements;
    } catch (error) {
        console.error('[FrameEngine2] Failed to parse JsonFrameElements:', error);
        return [];
    }
};

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse database response into FrameEngine2 format
 *
 * Strategy:
 * - Extract layout properties
 * - Normalize fit modes (reject invalid values)
 * - Parse elements from JSON
 * - Apply FrameEngine2 defaults where needed
 * - IGNORE incompatible data (no migration, clean break)
 *
 * @param response - Raw database response
 * @returns Clean FrameEngine2 layout config and elements
 */
export const parseFrameLayoutResponse = (
    response: any
): { layout: FrameLayoutConfig; elements: PlacedElement[] } => {
    // Parse elements first
    const elements = parseElements(response.jsonFrameElements);

    // Parse FrameEngine2 config (canvasSettings + sensorTestValues)
    let frameEngine2Config: any = {};
    if (response.jsonFrameConfig) {
        try {
            frameEngine2Config = JSON.parse(response.jsonFrameConfig);
            console.log('[FrameEngine2] Loaded config from jsonFrameConfig:', frameEngine2Config);
        } catch (error) {
            console.warn('[FrameEngine2] Failed to parse jsonFrameConfig, using defaults:', error);
        }
    }

    // Build clean FrameEngine2 layout config
    const layout: FrameLayoutConfig = {
        id: response.id ? Number(response.id) : undefined,
        displayName: response.displayName || 'Unnamed Layout',
        description: response.description,
        layoutType: response.layoutType || 'custom',
        width: response.width || 800,
        height: response.height || 600,
        orientation: response.orientation || 'landscape',
        backgroundColor: response.backgroundColor || '#333333',
        backgroundType: response.backgroundType || 'color',
        backgroundImageUrl: response.backgroundImageUrl || null,
        backgroundImageFit: normalizeImageFit(response.backgroundImageFit),
        backgroundOpacity: response.backgroundOpacity ?? 1.0,
        backgroundVideoUrl: response.backgroundVideoUrl || null,
        backgroundVideoFit: normalizeVideoFit(response.backgroundVideoFit),
        videoLoop: response.videoLoop ?? true,
        videoMuted: response.videoMuted ?? true,
        videoAutoplay: response.videoAutoplay ?? true,
        riveFile: response.riveFile || null,
        sensorTestValues: frameEngine2Config.sensorTestValues || {},
        isTemplate: response.isTemplate ?? false,
        isDraft: response.isDraft ?? true,
        isPublished: response.isPublished ?? false,
        created: response.created,
        lastModified: response.lastModified,
        createdBy: response.createdBy,
        version: response.version,
        thumbnailOverride: response.thumbnailOverride ?? false,

        // FrameEngine2 specific - merge saved settings with defaults to ensure all fields exist
        canvasSettings: frameEngine2Config.canvasSettings ? {
            ...DEFAULT_CANVAS_SETTINGS,
            ...frameEngine2Config.canvasSettings,
            grid: {
                ...DEFAULT_CANVAS_SETTINGS.grid,
                ...(frameEngine2Config.canvasSettings.grid || {})
            }
        } : DEFAULT_CANVAS_SETTINGS
    };

    return { layout, elements };
};
