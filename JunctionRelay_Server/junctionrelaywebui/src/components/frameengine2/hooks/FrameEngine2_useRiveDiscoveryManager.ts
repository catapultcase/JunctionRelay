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

import { useState, useCallback } from 'react';
import type {
    DiscoveredRiveStateMachine,
    DiscoveredRiveDataBinding
} from '../types/FrameEngine2_ElementTypes';

/**
 * Return type for the useRiveDiscoveryManager hook
 */
export interface RiveDiscoveryManager {
    /** Discovered Rive machines from background layout */
    backgroundRiveMachines: DiscoveredRiveStateMachine[];

    /** Discovered Rive bindings from background layout */
    backgroundRiveBindings: DiscoveredRiveDataBinding[];

    /** Map of element ID to discovered Rive machines/bindings */
    elementRiveDiscoveries: Map<string, {
        machines: DiscoveredRiveStateMachine[];
        bindings: DiscoveredRiveDataBinding[];
    }>;

    /** Callback to handle background Rive discovery */
    handleBackgroundRiveDiscovery: (
        machines: DiscoveredRiveStateMachine[],
        bindings: DiscoveredRiveDataBinding[]
    ) => void;

    /** Callback to handle element Rive discovery */
    handleElementRiveDiscovery: (
        discoveries: Map<string, {
            machines: DiscoveredRiveStateMachine[];
            bindings: DiscoveredRiveDataBinding[];
        }>
    ) => void;
}

/**
 * Custom hook to manage Rive discovery state and handlers
 *
 * This hook centralizes all Rive discovery-related state management for both
 * background layout Rive files and element-specific Rive files. It provides
 * stable callbacks for discovery handlers to prevent unnecessary re-renders.
 *
 * **Architecture Notes:**
 * - Extracted from ConfigureFrame2.tsx to reduce component complexity
 * - Centralizes Rive discovery logic in a single, reusable hook
 * - Provides stable callbacks with empty dependency arrays
 * - Used by both Canvas and other components that need discovery state
 *
 * **Following FRAMEENGINE2_ARCHITECTURE_GUIDELINES.md:**
 * - Section 4.1: Extract hooks to reduce component complexity
 * - Section 2.2: Stable callback references with useCallback
 * - Section 7.3: Document optimization decisions
 *
 * **Usage Example:**
 * ```typescript
 * const {
 *     backgroundRiveMachines,
 *     backgroundRiveBindings,
 *     elementRiveDiscoveries,
 *     handleBackgroundRiveDiscovery,
 *     handleElementRiveDiscovery
 * } = useRiveDiscoveryManager();
 *
 * <Canvas
 *     onBackgroundRiveDiscovery={handleBackgroundRiveDiscovery}
 *     onElementRiveDiscovery={handleElementRiveDiscovery}
 * />
 * ```
 *
 * @returns RiveDiscoveryManager object containing state and handlers
 */
export function useRiveDiscoveryManager(): RiveDiscoveryManager {
    // Rive discovery state - Background layout
    const [backgroundRiveMachines, setBackgroundRiveMachines] = useState<DiscoveredRiveStateMachine[]>([]);
    const [backgroundRiveBindings, setBackgroundRiveBindings] = useState<DiscoveredRiveDataBinding[]>([]);

    // Rive discovery state - Elements (Map of elementId -> discoveries)
    const [elementRiveDiscoveries, setElementRiveDiscoveries] = useState<Map<string, {
        machines: DiscoveredRiveStateMachine[];
        bindings: DiscoveredRiveDataBinding[];
    }>>(new Map());

    /**
     * Handle background Rive discovery from canvas
     * Wrapped in useCallback with empty deps to prevent unnecessary re-renders
     */
    const handleBackgroundRiveDiscovery = useCallback((
        machines: DiscoveredRiveStateMachine[],
        bindings: DiscoveredRiveDataBinding[]
    ) => {
        setBackgroundRiveMachines(machines);
        setBackgroundRiveBindings(bindings);
    }, []);

    /**
     * Handle element Rive discovery from canvas
     * Wrapped in useCallback with empty deps to prevent unnecessary re-renders
     */
    const handleElementRiveDiscovery = useCallback((
        discoveries: Map<string, { machines: DiscoveredRiveStateMachine[]; bindings: DiscoveredRiveDataBinding[] }>
    ) => {
        setElementRiveDiscoveries(discoveries);
    }, []);

    return {
        backgroundRiveMachines,
        backgroundRiveBindings,
        elementRiveDiscoveries,
        handleBackgroundRiveDiscovery,
        handleElementRiveDiscovery
    };
}
