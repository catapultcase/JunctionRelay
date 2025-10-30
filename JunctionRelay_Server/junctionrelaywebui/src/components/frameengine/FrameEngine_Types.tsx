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
    | 'gauge'
    | 'clock'
    | 'timedate'
    | 'oscilloscope'
    | 'tunnel'
    | 'weather'
    | 'media-image'
    | 'media-video'
    | 'media-rive';

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
    locked?: boolean;
    zIndex?: number;
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

export interface RiveConfiguration {
    discoveredMachines: DiscoveredStateMachine[];
    discoveredBindings: DiscoveredDataBinding[];
    lastDiscoveryUpdate: string;
    activeStateMachine?: string;
    globalInputMappings?: Record<string, any>;
    discoveryMetadata?: {
        totalInputs: number;
        inputTypeBreakdown: Record<string, number>;
        discoveryAttempts: number;
        lastSuccessfulDiscovery: string;
    };
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
    backgroundImageFit?: 'cover' | 'contain' | 'fill' | 'tile' | 'stretch' | 'none';
    backgroundOpacity?: number;
    backgroundVideoUrl?: string | null;
    backgroundVideoFit?: 'cover' | 'contain' | 'fill' | 'stretch' | 'none';
    videoLoop?: boolean;
    videoMuted?: boolean;
    videoAutoplay?: boolean;
    riveFile?: string | null;
    riveStateMachine?: string | null;
    riveInputs?: Record<string, any> | null;
    riveBindings?: Record<string, any> | null;
    riveConfiguration?: RiveConfiguration;
    sensorTestValues?: Record<string, string | number>; // Test values for sensor tags (tag -> value)
    rows?: number;
    columns?: number;
    isTemplate: boolean;
    isDraft?: boolean;
    isPublished?: boolean;
    created?: string;
    lastModified?: string;
    createdBy?: string;
    version?: string;
    thumbnailOverride?: boolean; // ← ADD THIS LINE
    jsonFrameConfig?: string; // ← ADD THIS LINE TOO
    jsonFrameElements?: string; // ← AND THIS LINE
    canvasSettings?: {
        grid: {
            snapToGrid: boolean;
            showGrid: boolean;
            gridSize: number;
            gridColor: string;
        };
        elementPadding: number;
        testBindingsInterval?: number;
        testBindingsEnabled?: boolean;
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
    externalId: string; // ← ADD THIS LINE
    decimalPlaces: number; // ← ADD THIS LINE
    lastUpdated: string; // ← ADD THIS LINE
}

// ============================================================================
// Rive File Info
// ============================================================================

export interface RiveFileInfo {
    filename: string;
    displayName: string;
    uploadDate: string;
    fileSize: number;
}

// ============================================================================
// Background Image Types
// ============================================================================

export interface BackgroundImageInfo {
    filename: string;
    displayName: string;
    uploadDate: string;
    fileSize: number;
}

// ============================================================================
// Background Video Types
// ============================================================================

export interface BackgroundVideoInfo {
    filename: string;
    displayName: string;
    uploadDate: string;
    fileSize: number;
    duration?: number;
    width?: number;
    height?: number;
}

// ============================================================================
// Background Configuration
// ============================================================================

export interface BackgroundConfig {
    type: 'color' | 'image' | 'video' | 'rive';
    color?: string;
    imageUrl?: string;
    imageFit?: 'cover' | 'contain' | 'fill' | 'tile' | 'stretch' | 'none';
    videoUrl?: string;
    videoFit?: 'cover' | 'contain' | 'fill' | 'stretch' | 'none';
    videoLoop?: boolean;
    videoMuted?: boolean;
    videoAutoplay?: boolean;
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
    visible?: boolean;
    locked?: boolean;
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