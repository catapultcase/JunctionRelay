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

// ============================================================================
// Core Element Types
// ============================================================================

export type ElementType =
    | 'sensor'
    | 'text'
    | 'chart'
    | 'image'
    | 'container'
    | 'ecg'
    | 'clock'
    | 'oscilloscope'
    | 'tunnel'
    | 'weather';

export interface PlacedElement {
    id: string;
    type: ElementType;
    x: number;
    y: number;
    width: number;
    height: number;
    properties: Record<string, any>;
    sensorId?: string;
    visible?: boolean;
    zIndex?: number;
}

// ============================================================================
// Layout Configuration
// ============================================================================

export interface FrameLayoutConfig {
    id?: number;
    displayName: string;
    description?: string;
    layoutType: string;
    width: number;
    height: number;
    orientation?: string;
    backgroundColor?: string;
    backgroundType?: string;
    backgroundImageUrl?: string | null;
    backgroundImageData?: Uint8Array | null;
    backgroundOpacity?: number;
    riveFile?: string | null;
    riveStateMachine?: string | null;
    riveInputs?: Record<string, any> | null;
    riveBindings?: Record<string, any> | null;
    rows?: number;
    columns?: number;
    isTemplate: boolean;
    isDraft?: boolean;
    isPublished?: boolean;
    created?: string;
    lastModified?: string;
    canvasSettings?: {
        grid: {
            snapToGrid: boolean;
            showGrid: boolean;
            gridSize: number;
            gridColor: string;
        };
        elementPadding: number;
    };
}

// ============================================================================
// Sensor Data
// ============================================================================

export interface AvailableSensor {
    id: string;
    name: string;
    value: string;
    unit: string;
    type: 'environmental' | 'system' | 'custom';
    isOnline: boolean;
}

// ============================================================================
// Rive Discovery Types
// ============================================================================

export interface DiscoveredInput {
    name: string;
    type: 'number' | 'boolean' | 'trigger' | 'unknown';
    currentValue?: any;
    ref?: any;
}

export interface DiscoveredStateMachine {
    name: string;
    inputNames: string[];
    inputs: DiscoveredInput[];
}

export interface DiscoveredDataBinding {
    name: string;
    type: 'number' | 'string' | 'boolean' | 'color' | 'trigger' | 'enum' | 'list' | 'image' | 'unknown';
    currentValue?: any;
    ref?: any;
}

export interface RiveFileInfo {
    filename: string;
    displayName: string;
    uploadDate: string;
    fileSize: number;
}

// ============================================================================
// Background Configuration
// ============================================================================

export interface BackgroundConfig {
    type: 'color' | 'image' | 'rive';
    color?: string;
    imageUrl?: string;
    riveFile?: string;
    riveStateMachine?: string;
    riveInputs?: Record<string, any>;
    riveBindings?: Record<string, any>;
}

// ============================================================================
// Renderer Types
// ============================================================================

export interface ElementPosition {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface BaseElement {
    id: string;
    type: ElementType;
    position: ElementPosition;
    properties: Record<string, any>;
}

export interface RendererConfig {
    elementPadding: number;
    isInteractive: boolean;
    showPlaceholders: boolean;
}

// ============================================================================
// Gallery Types
// ============================================================================

export interface FrameLayoutListItem {
    id: string;
    isTemplate?: boolean;
    displayName: string;
    description?: string;
    layoutType: string;
    width?: number;
    height?: number;
    hasThumbnail?: boolean;
    thumbnailPath?: string;
    thumbnailGeneratedAt?: string;
}