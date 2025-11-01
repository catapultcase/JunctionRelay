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
 * FrameEngine2 Rive Discovery Utility
 *
 * Discovers state machine inputs and view model data bindings from Rive instances.
 * Extracted from old FrameEngine_RiveCore.tsx for reusability.
 */

import type {
    DiscoveredRiveInput,
    DiscoveredRiveStateMachine,
    DiscoveredRiveDataBinding
} from './types/FrameEngine2_ElementTypes';

export interface RiveDiscoveryResult {
    machines: DiscoveredRiveStateMachine[];
    bindings: DiscoveredRiveDataBinding[];
}

/**
 * Discovers Rive state machine inputs and view model data bindings
 *
 * Uses brute-force accessor testing - the ONLY reliable method for Rive binding detection.
 * Based on working POC: rive-test/src/SensorTest.tsx
 *
 * @param rive - The Rive instance from useRive hook
 * @param maxAttempts - Maximum number of retry attempts (default: 3)
 * @returns Promise that resolves with discovered machines and bindings
 */
export async function discoverRiveInputsAndBindings(
    rive: any,
    maxAttempts: number = 3
): Promise<RiveDiscoveryResult> {
    if (!rive) {
        return { machines: [], bindings: [] };
    }

    let attempts = 0;

    return new Promise((resolve) => {
        const discoverAll = () => {
            if (!rive) {
                resolve({ machines: [], bindings: [] });
                return;
            }

            attempts++;

            try {
                // Discover State Machine Inputs
                const smNames: string[] = Array.isArray(rive.stateMachineNames)
                    ? rive.stateMachineNames
                    : [];

                // Auto-play all state machines
                smNames.forEach((sm) => {
                    try {
                        rive.play(sm);
                    } catch {
                        // Ignore play errors
                    }
                });

                const machines: DiscoveredRiveStateMachine[] = smNames.map((smName) => {
                    const inputs: DiscoveredRiveInput[] = [];

                    try {
                        const rawInputs = rive.stateMachineInputs
                            ? (rive.stateMachineInputs(smName) as any[])
                            : [];

                        rawInputs.forEach((rawInput) => {
                            if (rawInput?.name) {
                                const inputName = String(rawInput.name);
                                let inputType: DiscoveredRiveInput['type'] = 'unknown';
                                let currentValue: any = null;
                                let hasValue = false;

                                // Try to detect type by accessing value
                                try {
                                    currentValue = rawInput.value;
                                    hasValue = true;

                                    if (typeof currentValue === 'number') {
                                        inputType = 'number';
                                    } else if (typeof currentValue === 'boolean') {
                                        inputType = 'boolean';
                                    }
                                } catch {
                                    // If value access fails, check for trigger
                                    try {
                                        if (typeof rawInput.fire === 'function') {
                                            inputType = 'trigger';
                                        }
                                    } catch {
                                        // Remain unknown
                                    }
                                }

                                inputs.push({
                                    name: inputName,
                                    type: inputType,
                                    currentValue: hasValue ? currentValue : null,
                                    ref: rawInput
                                });
                            }
                        });
                    } catch (error) {
                        console.warn(`Failed to get inputs for state machine "${smName}":`, error);
                    }

                    return {
                        name: smName,
                        inputNames: inputs.map(i => i.name),
                        inputs
                    };
                });

                // Discover View Model Data Bindings
                // ONLY WORKING METHOD: Brute-force accessor testing
                // Based on POC: rive-test/src/SensorTest.tsx lines 241-290
                const dataBindings: DiscoveredRiveDataBinding[] = [];

                try {
                    const vmi = rive.viewModelInstance;
                    if (vmi) {
                        // Check if viewModelInstance has properties array
                        if ((vmi as any).properties) {
                            (vmi as any).properties.forEach((prop: any) => {
                                const propertyName = prop.name;

                                // Try each accessor type until one works
                                // This is the ONLY working method for Rive binding detection
                                const accessors = [
                                    { fn: 'number', type: 'number' as const },
                                    { fn: 'string', type: 'string' as const },
                                    { fn: 'boolean', type: 'boolean' as const },
                                    { fn: 'color', type: 'color' as const },
                                    { fn: 'trigger', type: 'trigger' as const },
                                    { fn: 'enum', type: 'enum' as const },
                                    { fn: 'list', type: 'list' as const },
                                    { fn: 'image', type: 'image' as const },
                                ];

                                for (const accessor of accessors) {
                                    try {
                                        const binding = (vmi as any)[accessor.fn]?.(propertyName);
                                        if (binding && (binding.value !== undefined || accessor.type === 'trigger' || accessor.type === 'list')) {
                                            let currentValue = null;
                                            try {
                                                if (accessor.type === 'trigger') {
                                                    currentValue = null; // Triggers don't have values
                                                } else if (accessor.type === 'list') {
                                                    currentValue = `List (${binding.length || 0} items)`;
                                                } else {
                                                    currentValue = binding.value;
                                                }
                                            } catch {}

                                            dataBindings.push({
                                                name: propertyName,
                                                type: accessor.type,
                                                currentValue: currentValue,
                                                ref: binding
                                            });
                                            break; // Stop trying accessors once we find one that works
                                        }
                                    } catch {
                                        // Continue trying next accessor type
                                    }
                                }
                            });
                        }
                    }
                } catch (error) {
                    console.error('[RiveDiscovery] Error during data binding discovery:', error);
                }

                // Check if we should retry
                const totalInputs = machines.reduce((sum, m) => sum + m.inputs.length, 0);

                // Retry if we found state machines but no inputs (Rive needs time to load them)
                if (totalInputs === 0 && smNames.length > 0 && attempts < maxAttempts) {
                    setTimeout(discoverAll, 100);
                    return;
                }

                // Success - resolve with results
                resolve({ machines, bindings: dataBindings });

            } catch (error) {
                console.error('[RiveDiscovery] Error during discovery:', error);

                // Retry on error
                if (attempts < maxAttempts) {
                    setTimeout(discoverAll, 120 * attempts);
                } else {
                    // Max attempts reached - resolve with empty results
                    resolve({ machines: [], bindings: [] });
                }
            }
        };

        // Start discovery
        discoverAll();
    });
}

/**
 * Applies input values to discovered state machine inputs
 *
 * @param machines - Discovered state machines with input refs
 * @param inputValues - Record of input name -> value to apply
 */
export function applyRiveInputs(
    machines: DiscoveredRiveStateMachine[],
    inputValues: Record<string, any>
): void {
    machines.forEach(machine => {
        machine.inputs.forEach(input => {
            if (input.ref && inputValues.hasOwnProperty(input.name)) {
                const value = inputValues[input.name];

                try {
                    if (input.type === 'trigger') {
                        if (value && typeof input.ref.fire === 'function') {
                            input.ref.fire();
                        }
                    } else if (input.type === 'number') {
                        input.ref.value = Number(value);
                    } else if (input.type === 'boolean') {
                        input.ref.value = Boolean(value);
                    } else {
                        input.ref.value = value;
                    }
                } catch (error) {
                    console.error(`Error applying input "${input.name}":`, error);
                }
            }
        });
    });
}

/**
 * Applies binding values to discovered data bindings
 *
 * @param bindings - Discovered data bindings with refs
 * @param bindingValues - Record of binding name -> value to apply
 */
export function applyRiveBindings(
    bindings: DiscoveredRiveDataBinding[],
    bindingValues: Record<string, any>
): void {
    bindings.forEach(binding => {
        if (binding.ref && bindingValues.hasOwnProperty(binding.name)) {
            const value = bindingValues[binding.name];

            try {
                if (binding.type === 'trigger') {
                    if (value && typeof binding.ref.fire === 'function') {
                        binding.ref.fire();
                    }
                } else if (binding.type === 'number') {
                    binding.ref.value = Number(value);
                } else if (binding.type === 'boolean') {
                    binding.ref.value = Boolean(value);
                } else if (binding.type === 'color') {
                    // Color expects ARGB integer format
                    binding.ref.value = convertHexToARGB(value);
                } else if (binding.type === 'string') {
                    binding.ref.value = String(value);
                } else {
                    binding.ref.value = value;
                }
            } catch (error) {
                console.error(`Error applying binding "${binding.name}":`, error);
            }
        }
    });
}

/**
 * Converts hex color string to ARGB integer format for Rive
 *
 * @param hexColor - Hex color string (e.g., "#FF5733")
 * @returns ARGB integer
 */
function convertHexToARGB(hexColor: string): number {
    if (typeof hexColor !== 'string' || !hexColor.startsWith('#')) {
        return 0xFF000000; // Default to black
    }

    const hexValue = parseInt(hexColor.slice(1), 16);
    const r = (hexValue >> 16) & 0xFF;
    const g = (hexValue >> 8) & 0xFF;
    const b = hexValue & 0xFF;

    // ARGB format: alpha (0xFF) in highest byte
    return (0xFF << 24) | (r << 16) | (g << 8) | b;
}
