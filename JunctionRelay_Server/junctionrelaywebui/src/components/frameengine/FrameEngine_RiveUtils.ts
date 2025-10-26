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

/**
 * Shared utilities for working with Rive animations in FrameEngine
 * This file is shared between JunctionRelay Server and Virtual Device projects
 */

export type RiveBindingType = 'boolean' | 'string' | 'number' | 'color' | 'trigger' | 'enum' | 'list' | 'image' | 'unknown';

/**
 * Convert a hex color string to ARGB integer format used by Rive
 * @param hexColor - Hex color string (e.g., "#FF0000")
 * @returns ARGB integer value
 */
export function hexToArgb(hexColor: string): number {
    if (!hexColor || !hexColor.startsWith('#')) {
        return 0xFF000000; // Default to black
    }

    const hexValue = parseInt(hexColor.slice(1), 16);
    const r = (hexValue >> 16) & 0xFF;
    const g = (hexValue >> 8) & 0xFF;
    const b = hexValue & 0xFF;

    // ARGB format: Alpha in highest byte, then RGB
    return (0xFF << 24) | (r << 16) | (g << 8) | b;
}

/**
 * Convert a sensor value to the appropriate type for a Rive binding
 * @param value - The sensor value to convert
 * @param bindingType - The target Rive binding type
 * @returns Converted value ready for Rive
 */
export function convertValueForRiveBinding(value: any, bindingType: RiveBindingType): string | number | boolean {
    switch (bindingType) {
        case 'boolean':
            return Boolean(value);

        case 'string':
            return String(value);

        case 'number':
            return Number(value);

        case 'color':
            if (typeof value === 'string' && value.startsWith('#')) {
                return hexToArgb(value);
            }
            return Number(value) || 0;

        case 'trigger':
            // Triggers are typically boolean events
            return Boolean(value);

        default:
            // For unknown types, try to convert to number
            return Number(value) || 0;
    }
}

/**
 * Extract sensor tags from a sensor key that may contain comma-separated values
 * @param sensorKey - Sensor key (may be "tag1,tag2,tag3" or just "tag")
 * @returns Array of individual sensor tag strings
 */
export function extractSensorTags(sensorKey: string): string[] {
    if (sensorKey.includes(',')) {
        return sensorKey.split(',').map(tag => tag.trim());
    }
    return [sensorKey];
}

/**
 * Check if a value has actually changed (handles type coercion)
 * @param oldValue - Previous value
 * @param newValue - New value
 * @returns True if values are different
 */
export function hasValueChanged(oldValue: any, newValue: any): boolean {
    // Strict equality first
    if (oldValue === newValue) {
        return false;
    }

    // Handle undefined/null cases
    if (oldValue == null && newValue == null) {
        return false;
    }

    // For numbers, handle NaN case
    if (typeof oldValue === 'number' && typeof newValue === 'number') {
        if (isNaN(oldValue) && isNaN(newValue)) {
            return false;
        }
    }

    return true;
}

/**
 * Update a binding value in a ref object, returning whether it changed
 * @param bindingsRef - Ref object containing bindings
 * @param targetId - ID of the target (background or element ID)
 * @param bindingName - Name of the binding
 * @param newValue - New value to set
 * @returns True if the value changed
 */
export function updateBindingValue(
    bindingsRef: Record<string, any>,
    targetId: string | null,
    bindingName: string,
    newValue: any
): boolean {
    if (targetId) {
        // Element-level binding
        if (!bindingsRef[targetId]) {
            bindingsRef[targetId] = {};
        }
        const oldValue = bindingsRef[targetId][bindingName];
        if (hasValueChanged(oldValue, newValue)) {
            bindingsRef[targetId][bindingName] = newValue;
            return true;
        }
    } else {
        // Background-level binding
        const oldValue = bindingsRef[bindingName];
        if (hasValueChanged(oldValue, newValue)) {
            bindingsRef[bindingName] = newValue;
            return true;
        }
    }
    return false;
}

/**
 * Process a sensor payload and update Rive bindings
 * This is a generic function that can be used for both background and element bindings
 */
export interface ProcessBindingsOptions {
    sensorPayload: Record<string, any>;
    discoveredBindings: Array<{ name: string; type: RiveBindingType }>;
    bindingsRef: Record<string, any>;
    targetId?: string | null;
    logPrefix?: string;
}

export function processRiveBindings(options: ProcessBindingsOptions): {
    hasChanges: boolean;
    changedBindings: string[];
} {
    const {
        sensorPayload,
        discoveredBindings,
        bindingsRef,
        targetId = null,
        logPrefix = ''
    } = options;

    let hasChanges = false;
    const changedBindings: string[] = [];

    Object.entries(sensorPayload).forEach(([sensorKey, sensorData]) => {
        const sensorTags = extractSensorTags(sensorKey);

        sensorTags.forEach(sensorTag => {
            const binding = discoveredBindings.find(b => b.name === sensorTag);

            if (binding) {
                const newValue = convertValueForRiveBinding(sensorData.value, binding.type);
                const changed = updateBindingValue(bindingsRef, targetId, sensorTag, newValue);

                if (changed) {
                    hasChanges = true;
                    changedBindings.push(sensorTag);

                    if (logPrefix) {
                        const target = targetId ? `Element ${targetId}` : 'Background';
                        console.log(`${logPrefix}${target} binding "${sensorTag}" (${binding.type}) updated to: ${newValue}`);
                    }
                }
            }
        });
    });

    return { hasChanges, changedBindings };
}

/**
 * Process Rive state machine inputs from sensor data
 */
export interface ProcessInputsOptions {
    sensorPayload: Record<string, any>;
    discoveredMachines: Array<{
        name: string;
        inputs: Array<{ name: string; type: string }>;
    }>;
    inputsRef: Record<string, any>;
    targetId?: string | null;
    logPrefix?: string;
}

export function processRiveInputs(options: ProcessInputsOptions): {
    hasChanges: boolean;
    changedInputs: string[];
} {
    const {
        sensorPayload,
        discoveredMachines,
        inputsRef,
        targetId = null,
        logPrefix = ''
    } = options;

    let hasChanges = false;
    const changedInputs: string[] = [];

    discoveredMachines.forEach(machine => {
        machine.inputs.forEach(input => {
            Object.entries(sensorPayload).forEach(([sensorKey, sensorData]) => {
                const sensorTags = extractSensorTags(sensorKey);

                sensorTags.forEach(sensorTag => {
                    if (input.name === sensorTag) {
                        const newValue = sensorData.value;
                        const changed = updateBindingValue(inputsRef, targetId, sensorTag, newValue);

                        if (changed) {
                            hasChanges = true;
                            changedInputs.push(sensorTag);

                            if (logPrefix) {
                                const target = targetId ? `Element ${targetId}` : 'Background';
                                console.log(`${logPrefix}${target} input "${sensorTag}" updated to: ${newValue}`);
                            }
                        }
                    }
                });
            });
        });
    });

    return { hasChanges, changedInputs };
}
