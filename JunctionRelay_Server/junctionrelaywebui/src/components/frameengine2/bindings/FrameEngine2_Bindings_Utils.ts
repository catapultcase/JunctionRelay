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

import type { PlacedElement, FrameLayoutConfig } from '../types/FrameEngine2_LayoutTypes';
import type {
    DiscoveredRiveStateMachine,
    DiscoveredRiveDataBinding,
    DiscoveredRiveInput
} from '../types/FrameEngine2_ElementTypes';
import type { RiveInputType } from './FrameEngine2_Bindings_Types';
import { hasSensorTag } from './FrameEngine2_Bindings_Types';

/**
 * Map Rive binding types to UI input types
 * DiscoveredRiveDataBinding has additional types (image, enum, list) that don't map to input controls
 */
export const mapBindingTypeToInputType = (bindingType: string): RiveInputType => {
    switch (bindingType) {
        case 'color':
            return 'color';
        case 'boolean':
            return 'boolean';
        case 'number':
            return 'number';
        case 'trigger':
            return 'trigger';
        // For image, enum, list, unknown - treat as string
        default:
            return 'string';
    }
};

/**
 * Get the input type for a sensor tag by checking Rive discoveries
 */
export const getInputType = (
    sensorTag: string,
    backgroundRiveMachines: DiscoveredRiveStateMachine[],
    backgroundRiveBindings: DiscoveredRiveDataBinding[],
    elementRiveDiscoveries: Map<string, {
        machines: DiscoveredRiveStateMachine[];
        bindings: DiscoveredRiveDataBinding[];
    }>
): RiveInputType => {
    // Check background Rive inputs
    for (const machine of backgroundRiveMachines) {
        const input = machine.inputs.find(i => i.name === sensorTag);
        if (input) {
            return input.type === 'unknown' ? 'number' : input.type;
        }
    }

    // Check background Rive bindings
    const bgBinding = backgroundRiveBindings.find(b => b.name === sensorTag);
    if (bgBinding) {
        return mapBindingTypeToInputType(bgBinding.type);
    }

    // Check element Rive inputs/bindings
    for (const [elementId, discovery] of elementRiveDiscoveries.entries()) {
        for (const machine of discovery.machines) {
            const input = machine.inputs.find((i: DiscoveredRiveInput) => i.name === sensorTag);
            if (input) {
                return input.type === 'unknown' ? 'number' : input.type;
            }
        }
        const binding = discovery.bindings.find((b: DiscoveredRiveDataBinding) => b.name === sensorTag);
        if (binding) {
            return mapBindingTypeToInputType(binding.type);
        }
    }

    // Default to number for regular sensor tags
    return 'number';
};

/**
 * Extract all SensorTags from elements (deduplicated)
 * Includes Rive inputs and data bindings as sensor tags (no prefix - treated the same)
 */
export const extractAllSensorTags = (
    elements: PlacedElement[],
    backgroundRiveMachines: DiscoveredRiveStateMachine[],
    backgroundRiveBindings: DiscoveredRiveDataBinding[],
    elementRiveDiscoveries: Map<string, {
        machines: DiscoveredRiveStateMachine[];
        bindings: DiscoveredRiveDataBinding[];
    }>
): string[] => {
    const tags = new Set<string>();

    elements.forEach(element => {
        // Check for direct sensorTag property (sensor, gauge, and ecg elements)
        if ((element.type === 'sensor' || element.type === 'gauge' || element.type === 'ecg') && element.properties.sensorTag) {
            tags.add(element.properties.sensorTag);
        }
    });

    // Add background Rive state machine inputs as sensor tags (no prefix)
    backgroundRiveMachines.forEach(machine => {
        machine.inputs.forEach(input => {
            tags.add(input.name);
        });
    });

    // Add background Rive data bindings as sensor tags (no prefix)
    backgroundRiveBindings.forEach(binding => {
        tags.add(binding.name);
    });

    // Add element Rive inputs and bindings as sensor tags (no prefix)
    elementRiveDiscoveries.forEach((discovery) => {
        discovery.machines.forEach((machine: DiscoveredRiveStateMachine) => {
            machine.inputs.forEach(input => {
                tags.add(input.name);
            });
        });
        discovery.bindings.forEach((binding: DiscoveredRiveDataBinding) => {
            tags.add(binding.name);
        });
    });

    return Array.from(tags).sort();
};

/**
 * Group elements by type for Asset View
 */
export const groupElementsByType = (elements: PlacedElement[]): Record<string, PlacedElement[]> => {
    const grouped: Record<string, PlacedElement[]> = {};

    elements.forEach(element => {
        const elementType = element.type;
        if (!grouped[elementType]) {
            grouped[elementType] = [];
        }
        grouped[elementType].push(element);
    });

    return grouped;
};

/**
 * Get current test value for a sensor tag
 * Checks Rive inputs and bindings first, then falls back to regular test values
 */
export const getTestValue = (
    sensorTag: string,
    layout: FrameLayoutConfig,
    elements: PlacedElement[],
    elementRiveDiscoveries: Map<string, {
        machines: DiscoveredRiveStateMachine[];
        bindings: DiscoveredRiveDataBinding[];
    }>
): string => {
    // Check background Rive inputs
    if (layout.riveInputs?.[sensorTag] !== undefined) {
        return String(layout.riveInputs[sensorTag]);
    }

    // Check background Rive bindings
    if (layout.riveBindings?.[sensorTag] !== undefined) {
        return String(layout.riveBindings[sensorTag]);
    }

    // Check element Rive inputs and bindings
    for (const [elementId, discovery] of elementRiveDiscoveries.entries()) {
        const element = elements.find(el => el.id === elementId);
        if (element && element.type === 'media-rive') {
            if (element.properties.riveInputs?.[sensorTag] !== undefined) {
                return String(element.properties.riveInputs[sensorTag]);
            }
            if (element.properties.riveBindings?.[sensorTag] !== undefined) {
                return String(element.properties.riveBindings[sensorTag]);
            }
        }
    }

    // Fall back to regular sensor test values
    const testData = layout.sensorTestValues?.[sensorTag];
    if (typeof testData === 'object' && testData !== null) {
        return testData.value !== undefined ? String(testData.value) : '';
    }
    return '';
};

/**
 * Get current test label for a sensor tag
 */
export const getTestLabel = (sensorTag: string, layout: FrameLayoutConfig): string => {
    const testData = layout.sensorTestValues?.[sensorTag];
    if (typeof testData === 'object' && testData !== null) {
        return testData.label || '';
    }
    return '';
};

/**
 * Get current test unit for a sensor tag
 */
export const getTestUnit = (sensorTag: string, layout: FrameLayoutConfig): string => {
    const testData = layout.sensorTestValues?.[sensorTag];
    if (typeof testData === 'object' && testData !== null) {
        return testData.unit || '';
    }
    return '';
};
