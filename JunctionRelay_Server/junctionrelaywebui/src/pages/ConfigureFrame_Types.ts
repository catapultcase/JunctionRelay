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

// Import centralized types
import type {
    PlacedElement,
    FrameLayoutConfig,
    AvailableSensor,
    DiscoveredInput,
    DiscoveredStateMachine,
    DiscoveredDataBinding,
} from '../components/frameengine/FrameEngine_Types';

// ConfigureFrame-specific types

export interface HistoryState {
    layout: FrameLayoutConfig;
    elements: PlacedElement[];
    timestamp: number;
    action: string;
}

export interface FrameBuilderState {
    layout: FrameLayoutConfig;
    elements: PlacedElement[];
    selectedElementIds: string[];
    availableSensors: AvailableSensor[];
    history: HistoryState[];
    historyIndex: number;
    isLoading: boolean;
    isDirty: boolean;
    error: string | null;
    previewMode: boolean;
}

export interface ModalState {
    thumbnailManagement: boolean;
    savingProgress: boolean;
    progressStep: 'saving' | 'thumbnail' | 'complete';
    progressMessage: string;
}

// Re-export centralized types for convenience
export type {
    PlacedElement,
    FrameLayoutConfig,
    AvailableSensor,
    DiscoveredInput,
    DiscoveredStateMachine,
    DiscoveredDataBinding,
};