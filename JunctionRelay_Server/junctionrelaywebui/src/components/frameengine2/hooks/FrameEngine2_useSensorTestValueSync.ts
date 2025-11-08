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

import { useEffect } from 'react';
import type { FrameLayoutConfig, PlacedElement } from '../types/FrameEngine2_LayoutTypes';
import type {
    DiscoveredRiveStateMachine,
    DiscoveredRiveDataBinding
} from '../types/FrameEngine2_ElementTypes';

/**
 * Parameters for the useSensorTestValueSync hook
 */
export interface UseSensorTestValueSyncParams {
    /** Current layout configuration */
    layout: FrameLayoutConfig | null;

    /** Array of placed elements */
    elements: PlacedElement[];

    /** Discovered background Rive machines */
    backgroundRiveMachines: DiscoveredRiveStateMachine[];

    /** Discovered background Rive bindings */
    backgroundRiveBindings: DiscoveredRiveDataBinding[];

    /** Map of element ID to discovered Rive machines/bindings */
    elementRiveDiscoveries: Map<string, {
        machines: DiscoveredRiveStateMachine[];
        bindings: DiscoveredRiveDataBinding[];
    }>;

    /** Callback to update layout configuration */
    onLayoutUpdate: (updates: Partial<FrameLayoutConfig>) => void;

    /** Callback to update elements array */
    setElements: React.Dispatch<React.SetStateAction<PlacedElement[]>>;
}

/**
 * Custom hook to synchronize sensor test values to Rive inputs and bindings
 *
 * This hook monitors sensorTestValues from the Value Generator and automatically
 * updates corresponding Rive inputs/bindings in both background and element Rive files.
 *
 * **Architecture Notes:**
 * - Extracted from ConfigureFrame2.tsx to reduce component complexity (was 108 lines)
 * - Handles both background layout Rive and element-specific Rive files
 * - Batches all updates to prevent multiple render cycles
 * - Intentionally excludes layout.riveInputs/riveBindings from deps to prevent loops
 *
 * **Following FRAMEENGINE2_ARCHITECTURE_GUIDELINES.md:**
 * - Section 4.1: Extract effects >50 lines into custom hooks
 * - Section 1.3: Batch array updates
 * - Section 7.3: Document optimization decisions
 *
 * @param params - Configuration parameters for the sync hook
 */
export function useSensorTestValueSync(params: UseSensorTestValueSyncParams): void {
    const {
        layout,
        elements,
        backgroundRiveMachines,
        backgroundRiveBindings,
        elementRiveDiscoveries,
        onLayoutUpdate,
        setElements
    } = params;

    /**
     * Effect 1: Sync background Rive inputs and bindings
     * Updates the layout's background Rive file when test values change
     */
    useEffect(() => {
        if (!layout?.sensorTestValues) return;

        let hasBackgroundInputUpdates = false;
        let hasBackgroundBindingUpdates = false;
        const newRiveInputs = { ...(layout.riveInputs || {}) };
        const newRiveBindings = { ...(layout.riveBindings || {}) };

        // Check background Rive inputs
        backgroundRiveMachines.forEach(machine => {
            machine.inputs.forEach(input => {
                const testValue = layout.sensorTestValues?.[input.name];
                if (testValue !== undefined && typeof testValue === 'object' && testValue.value !== undefined) {
                    const currentValue = layout.riveInputs?.[input.name];
                    if (currentValue !== testValue.value) {
                        newRiveInputs[input.name] = testValue.value;
                        hasBackgroundInputUpdates = true;
                    }
                }
            });
        });

        // Check background Rive bindings
        backgroundRiveBindings.forEach(binding => {
            const testValue = layout.sensorTestValues?.[binding.name];
            if (testValue !== undefined && typeof testValue === 'object' && testValue.value !== undefined) {
                const currentValue = layout.riveBindings?.[binding.name];
                if (currentValue !== testValue.value) {
                    newRiveBindings[binding.name] = testValue.value;
                    hasBackgroundBindingUpdates = true;
                }
            }
        });

        // Apply background updates if any (BATCHED - prevents multiple re-renders)
        if (hasBackgroundInputUpdates || hasBackgroundBindingUpdates) {
            const updates: Partial<FrameLayoutConfig> = {};
            if (hasBackgroundInputUpdates) updates.riveInputs = newRiveInputs;
            if (hasBackgroundBindingUpdates) updates.riveBindings = newRiveBindings;
            onLayoutUpdate(updates);
        }

        // IMPORTANT: Removed layout.riveInputs and layout.riveBindings from dependencies
        // to prevent infinite loop. This effect reads these values but also modifies
        // them via onLayoutUpdate, creating a circular dependency if included.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layout?.sensorTestValues, backgroundRiveMachines, backgroundRiveBindings, onLayoutUpdate]);

    /**
     * Effect 2: Sync element Rive inputs and bindings
     * Updates individual element Rive files when test values change
     */
    useEffect(() => {
        if (!layout?.sensorTestValues || elementRiveDiscoveries.size === 0) return;

        // OPTIMIZATION: Collect all updates first, then apply in a single batch
        const elementUpdates: Array<{ id: string; updates: Partial<PlacedElement> }> = [];

        elementRiveDiscoveries.forEach((discovery, elementId) => {
            let hasElementInputUpdates = false;
            let hasElementBindingUpdates = false;
            const element = elements.find(el => el.id === elementId);
            if (!element || element.type !== 'media-rive') return;

            const newElementRiveInputs = { ...(element.properties.riveInputs || {}) };
            const newElementRiveBindings = { ...(element.properties.riveBindings || {}) };

            // Check inputs
            discovery.machines.forEach(machine => {
                machine.inputs.forEach(input => {
                    const testValue = layout.sensorTestValues?.[input.name];
                    if (testValue !== undefined && typeof testValue === 'object' && testValue.value !== undefined) {
                        const currentValue = element.properties.riveInputs?.[input.name];
                        if (currentValue !== testValue.value) {
                            newElementRiveInputs[input.name] = testValue.value;
                            hasElementInputUpdates = true;
                        }
                    }
                });
            });

            // Check bindings
            discovery.bindings.forEach(binding => {
                const testValue = layout.sensorTestValues?.[binding.name];
                if (testValue !== undefined && typeof testValue === 'object' && testValue.value !== undefined) {
                    const currentValue = element.properties.riveBindings?.[binding.name];
                    if (currentValue !== testValue.value) {
                        newElementRiveBindings[binding.name] = testValue.value;
                        hasElementBindingUpdates = true;
                    }
                }
            });

            // Collect element updates (instead of applying immediately)
            if (hasElementInputUpdates || hasElementBindingUpdates) {
                const propertyUpdates = { ...element.properties };
                if (hasElementInputUpdates) {
                    propertyUpdates.riveInputs = newElementRiveInputs;
                }
                if (hasElementBindingUpdates) {
                    propertyUpdates.riveBindings = newElementRiveBindings;
                }
                elementUpdates.push({
                    id: elementId,
                    updates: { properties: propertyUpdates }
                });
            }
        });

        // Apply all element updates in a single batch (prevents N re-renders)
        if (elementUpdates.length > 0) {
            setElements(prev => prev.map(el => {
                const update = elementUpdates.find(u => u.id === el.id);
                return update ? { ...el, ...update.updates } as PlacedElement : el;
            }));
        }

        // OPTIMIZATION: Using setElements directly for batching instead of handleUpdateElement
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layout?.sensorTestValues, elementRiveDiscoveries, elements, setElements]);
}
