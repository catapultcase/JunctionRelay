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

import React, { useState, useEffect } from 'react';
import {
    useRive,
    Layout,
    Fit,
    Alignment,
} from '@rive-app/react-canvas';

// Types for Rive discovery
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

// Background configuration types
export interface BackgroundConfig {
    type: 'color' | 'image' | 'rive';
    color?: string;
    imageUrl?: string;
    riveFile?: string;
    riveStateMachine?: string;
    riveInputs?: Record<string, any>;
    riveBindings?: Record<string, any>;
}

// Component props
interface FrameEngine_BackgroundRendererProps {
    config: BackgroundConfig;
    width: number;
    height: number;
    fit?: 'none' | 'contain' | 'cover';
    onRiveDiscovery?: (machines: DiscoveredStateMachine[], bindings: DiscoveredDataBinding[]) => void;
    onRiveLoad?: () => void;
    onRiveError?: (error: any) => void;
}

export const FrameEngine_BackgroundRenderer: React.FC<FrameEngine_BackgroundRendererProps> = ({
    config,
    width,
    height,
    fit = 'none',
    onRiveDiscovery,
    onRiveLoad,
    onRiveError
}) => {
    const [discoveredInputs, setDiscoveredInputs] = useState<Record<string, any>>({});
    const [discoveredBindings, setDiscoveredBindings] = useState<Record<string, any>>({});
    const [riveKey, setRiveKey] = useState(0); // Force re-initialization on file change

    // Detect Rive file changes and force remount
    useEffect(() => {
        if (config.type === 'rive' && config.riveFile) {
            console.log('🔄 Rive file changed, forcing reload:', config.riveFile);
            setRiveKey(prev => prev + 1);
        }
    }, [config.riveFile, config.type]);

    // Determine Rive options
    const riveOptions = React.useMemo(() => {
        if (config.type !== 'rive' || !config.riveFile) {
            return null;
        }

        const riveFileUrl = config.riveFile.startsWith('http')
            ? config.riveFile
            : `/api/frameengine/rive-files/${config.riveFile}/content`;

        let layoutFit: Fit;
        switch (fit) {
            case 'contain':
                layoutFit = Fit.Contain;
                break;
            case 'cover':
                layoutFit = Fit.Cover;
                break;
            default:
                layoutFit = Fit.None;
                break;
        }

        return {
            src: riveFileUrl,
            autoplay: true,
            autoBind: true, // Critical for data bindings
            layout: new Layout({
                fit: layoutFit,
                alignment: Alignment.Center
            }),
            onLoad: () => {
                console.log('✅ Rive background loaded:', config.riveFile);
                if (onRiveLoad) onRiveLoad();
            },
            onLoadError: (error: any) => {
                console.error('❌ Rive background load error:', error, { riveFile: config.riveFile });
                if (onRiveError) onRiveError(error);
            },
        };
    }, [config.type, config.riveFile, fit, onRiveLoad, onRiveError, riveKey]); // Add riveKey to dependencies

    // Initialize Rive
    const { rive, RiveComponent } = useRive(riveOptions || { src: '', autoplay: false });

    // Discovery logic using the correct approach from Rive documentation
    useEffect(() => {
        if (!rive || config.type !== 'rive') return;

        let attempts = 0;
        let stopped = false;
        const maxAttempts = 20;

        const discoverAll = () => {
            if (stopped || !rive) return;
            attempts++;

            try {
                // Get state machine names
                const smNames: string[] = Array.isArray(rive.stateMachineNames) ? rive.stateMachineNames : [];

                // Ensure machines are running so inputs wire up
                smNames.forEach((sm) => {
                    try { rive.play(sm); } catch { }
                });

                // Discover state machines and inputs
                const machines: DiscoveredStateMachine[] = smNames.map((smName) => {
                    const inputs: DiscoveredInput[] = [];

                    try {
                        const rawInputs = rive.stateMachineInputs ? (rive.stateMachineInputs(smName) as any[]) : [];

                        rawInputs.forEach((rawInput) => {
                            if (rawInput?.name) {
                                const inputName = String(rawInput.name);
                                let inputType: DiscoveredInput['type'] = 'unknown';
                                let currentValue: any = null;
                                let hasValue = false;

                                try {
                                    currentValue = rawInput.value;
                                    hasValue = true;

                                    if (typeof currentValue === 'number') {
                                        inputType = 'number';
                                    } else if (typeof currentValue === 'boolean') {
                                        inputType = 'boolean';
                                    }
                                } catch {
                                    try {
                                        if (typeof rawInput.fire === 'function') {
                                            inputType = 'trigger';
                                        }
                                    } catch { }
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

                // Discover data bindings using the correct approach
                const dataBindings: DiscoveredDataBinding[] = [];

                try {
                    const vmi = rive.viewModelInstance;
                    if (vmi) {
                        console.log("Found viewModelInstance:", vmi);

                        // Get the view model from the rive instance to access property descriptors
                        const viewModel = (rive as any).viewModel;
                        console.log("ViewModel:", viewModel);

                        if (viewModel?.properties) {
                            console.log("Found viewModel.properties:", viewModel.properties);

                            // Iterate through property descriptors to discover by type
                            viewModel.properties.forEach((propertyDescriptor: any) => {
                                const propertyName = propertyDescriptor.name;
                                const propertyType = propertyDescriptor.type;

                                console.log(`Discovering property: ${propertyName} (type: ${propertyType})`);

                                try {
                                    let binding: any = null;
                                    let discoveredType: DiscoveredDataBinding['type'] = 'unknown';
                                    let currentValue: any = null;

                                    // Map Rive property types to our discovery types and access accordingly
                                    switch (propertyType) {
                                        case 0: // Number
                                            binding = vmi.number(propertyName);
                                            discoveredType = 'number';
                                            break;
                                        case 1: // String  
                                            binding = vmi.string(propertyName);
                                            discoveredType = 'string';
                                            break;
                                        case 2: // Boolean
                                            binding = vmi.boolean(propertyName);
                                            discoveredType = 'boolean';
                                            break;
                                        case 3: // Color
                                            binding = vmi.color(propertyName);
                                            discoveredType = 'color';
                                            break;
                                        case 4: // Trigger
                                            binding = vmi.trigger(propertyName);
                                            discoveredType = 'trigger';
                                            break;
                                        case 5: // Enum
                                            binding = vmi.enum(propertyName);
                                            discoveredType = 'enum';
                                            break;
                                        case 6: // List
                                            binding = vmi.list(propertyName);
                                            discoveredType = 'list';
                                            break;
                                        case 7: // Image
                                            binding = vmi.image(propertyName);
                                            discoveredType = 'image';
                                            break;
                                        default:
                                            console.warn(`Unknown property type: ${propertyType} for ${propertyName}`);
                                            // Try to access anyway
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
                                                    const testBinding = (vmi as any)[accessor.fn]?.(propertyName);
                                                    if (testBinding) {
                                                        binding = testBinding;
                                                        discoveredType = accessor.type;
                                                        break;
                                                    }
                                                } catch { }
                                            }
                                    }

                                    if (binding) {
                                        // Get current value if available
                                        try {
                                            if (discoveredType === 'trigger') {
                                                currentValue = null; // Triggers don't have values
                                            } else if (discoveredType === 'list') {
                                                currentValue = `List (${binding.length || 0} items)`;
                                            } else {
                                                currentValue = binding.value;
                                            }
                                        } catch {
                                            currentValue = null;
                                        }

                                        console.log(`✓ Successfully discovered ${propertyName} as ${discoveredType}:`, currentValue);
                                        dataBindings.push({
                                            name: propertyName,
                                            type: discoveredType,
                                            currentValue: currentValue,
                                            ref: binding
                                        });
                                    } else {
                                        console.warn(`✗ Could not access property: ${propertyName} (type: ${propertyType})`);
                                    }
                                } catch (error) {
                                    console.error(`Error accessing property ${propertyName}:`, error);
                                }
                            });
                        } else {
                            // Fallback: If no property descriptors, try accessing the viewModelInstance directly
                            console.log("No viewModel.properties found, checking viewModelInstance.properties...");

                            if ((vmi as any).properties) {
                                console.log("Found properties on viewModelInstance:", (vmi as any).properties);

                                (vmi as any).properties.forEach((prop: any) => {
                                    const propertyName = prop.name;
                                    console.log(`Trying property from instance: ${propertyName}`);

                                    // Try each accessor type
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
                                                        currentValue = null;
                                                    } else if (accessor.type === 'list') {
                                                        currentValue = `List (${binding.length || 0} items)`;
                                                    } else {
                                                        currentValue = binding.value;
                                                    }
                                                } catch { }

                                                console.log(`✓ Found ${propertyName} as ${accessor.type}:`, currentValue);
                                                dataBindings.push({
                                                    name: propertyName,
                                                    type: accessor.type,
                                                    currentValue: currentValue,
                                                    ref: binding
                                                });
                                                break;
                                            }
                                        } catch { }
                                    }
                                });
                            }
                        }
                    } else {
                        console.log("No viewModelInstance found - autoBind may be disabled or no data bindings exist");
                    }
                } catch (error) {
                    console.error("Error during data binding discovery:", error);
                }

                console.log('🔍 BackgroundRenderer discovered state machines:', machines);
                console.log('🔍 BackgroundRenderer discovered data bindings:', dataBindings);

                // Call the discovery callback
                if (onRiveDiscovery) {
                    onRiveDiscovery(machines, dataBindings);
                }

                // Continue polling if we haven't found everything
                const totalInputs = machines.reduce((sum, m) => sum + m.inputs.length, 0);
                const totalBindings = dataBindings.length;

                if ((totalInputs === 0 && smNames.length > 0) || (totalBindings === 0 && attempts < 10)) {
                    if (attempts < maxAttempts) {
                        setTimeout(discoverAll, 120 * attempts);
                    }
                }

            } catch (error) {
                console.error('Error during BackgroundRenderer discovery:', error);
                if (attempts < maxAttempts) {
                    setTimeout(discoverAll, 120 * attempts);
                }
            }
        };

        discoverAll();

        return () => {
            stopped = true;
        };
    }, [rive, config.type, onRiveDiscovery]);

    // Input binding logic - applies input values to Rive
    useEffect(() => {
        if (!rive || config.type !== 'rive' || !config.riveInputs) return;

        let attempts = 0;
        let stopped = false;
        const maxAttempts = 20;
        const inputRefs: Record<string, any> = {};

        const discoverAndBindInputs = () => {
            if (stopped || !rive) return;
            attempts++;

            try {
                // Get available state machines
                const smNames: string[] = Array.isArray(rive.stateMachineNames) ? rive.stateMachineNames : [];

                // Ensure machines are running so inputs wire up
                smNames.forEach((sm) => {
                    try { rive.play(sm); } catch { }
                });

                const newDiscoveredInputs: Record<string, any> = {};

                // Process each input we want to bind
                Object.entries(config.riveInputs || {}).forEach(([inputKey, inputValue]) => {
                    // Parse the input key to extract state machine and input name
                    let targetMachine: string;
                    let inputName: string;

                    if (inputKey.includes('.')) {
                        // New format: "StateMachineName.InputName"
                        const parts = inputKey.split('.');
                        targetMachine = parts[0];
                        inputName = parts.slice(1).join('.'); // Handle input names with dots
                    } else {
                        // Legacy format: just "InputName" - use specified state machine or first available
                        targetMachine = config.riveStateMachine || smNames[0];
                        inputName = inputKey;
                    }

                    if (!targetMachine) {
                        console.warn(`⚠️ No target state machine found for input "${inputKey}"`);
                        return;
                    }

                    // Check if this state machine exists
                    if (!smNames.includes(targetMachine)) {
                        console.warn(`⚠️ State machine "${targetMachine}" not found. Available: ${smNames.join(', ')}`);
                        return;
                    }

                    // console.log(`🔍 Looking for input "${inputName}" in state machine "${targetMachine}"`);

                    const machineInputs = rive.stateMachineInputs
                        ? (rive.stateMachineInputs(targetMachine) as any[])
                        : [];

                    const foundInput = machineInputs.find((i) => i?.name === inputName);

                    if (foundInput) {
                        inputRefs[inputKey] = foundInput; // Use original key for tracking

                        // Determine input type by probing
                        let inputType = 'unknown';
                        let hasValue = false;
                        let currentValue: any;

                        try {
                            currentValue = foundInput.value;
                            hasValue = true;

                            if (typeof currentValue === 'number') {
                                inputType = 'number';
                            } else if (typeof currentValue === 'boolean') {
                                inputType = 'boolean';
                            }
                        } catch {
                            // If no readable value, check for trigger
                            try {
                                if (typeof foundInput.fire === 'function') {
                                    inputType = 'trigger';
                                }
                            } catch { }
                        }

                        newDiscoveredInputs[inputKey] = {
                            ref: foundInput,
                            type: inputType,
                            currentValue: hasValue ? currentValue : null,
                            stateMachine: targetMachine,
                            inputName: inputName
                        };

                        // Apply the input value
                        try {
                            if (inputType === 'trigger') {
                                // For triggers, fire if the value is truthy
                                if (inputValue && typeof foundInput.fire === 'function') {
                                    foundInput.fire();
                                    console.log(`🔥 Fired trigger "${inputName}" in "${targetMachine}"`);
                                }
                            } else if (hasValue) {
                                // For number/boolean inputs
                                const newValue = inputType === 'boolean' ? Boolean(inputValue) : Number(inputValue) || 0;
                                foundInput.value = newValue;
                                // console.log(`✅ Set "${inputName}" in "${targetMachine}" (${inputType}) to:`, newValue);
                            }
                        } catch (error) {
                            console.error(`❌ Error applying input "${inputName}" in "${targetMachine}":`, error);
                        }
                    } else {
                        console.warn(`⚠️ Input "${inputName}" not found in state machine "${targetMachine}"`);
                        console.log(`Available inputs in "${targetMachine}":`, machineInputs.map(i => i?.name).filter(Boolean));
                    }
                });

                setDiscoveredInputs(newDiscoveredInputs);

                // If we didn't find all inputs and haven't exhausted attempts, keep trying
                const foundCount = Object.keys(newDiscoveredInputs).length;
                const expectedCount = Object.keys(config.riveInputs || {}).length;

                if (foundCount < expectedCount && attempts < maxAttempts) {
                    setTimeout(discoverAndBindInputs, 120 * attempts);
                }

            } catch (error) {
                console.error('Error during input discovery:', error);
                if (attempts < maxAttempts) {
                    setTimeout(discoverAndBindInputs, 120 * attempts);
                }
            }
        };

        discoverAndBindInputs();

        return () => {
            stopped = true;
            setDiscoveredInputs({});
        };
    }, [rive, config.type, config.riveStateMachine, config.riveInputs]);

    // Enhanced data binding logic with improved color handling
    useEffect(() => {
        if (!rive || config.type !== 'rive' || !config.riveBindings) return;

        let attempts = 0;
        let stopped = false;
        const maxAttempts = 20;

        const discoverAndBindDataBindings = () => {
            if (stopped || !rive) return;
            attempts++;

            try {

                const vmi = (rive as any).viewModelInstance;

                if (!vmi) {
                    console.log('No viewModelInstance found for data binding');
                    if (attempts < maxAttempts) {
                        setTimeout(discoverAndBindDataBindings, 120 * attempts);
                    }
                    return;
                }

                const newDiscoveredBindings: Record<string, any> = {};

                // Process each binding we want to apply
                Object.entries(config.riveBindings || {}).forEach(([bindingName, bindingValue]) => {
                    // console.log(`🔍 Looking for data binding "${bindingName}"`);

                    let foundBinding = null;
                    let bindingType = 'unknown';

                    // Try to find the binding by type using official API
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
                            foundBinding = vmi[accessor.fn]?.(bindingName);
                            if (foundBinding && (foundBinding.value !== undefined || accessor.type === 'trigger' || accessor.type === 'list')) {
                                bindingType = accessor.type;
                                break;
                            }
                        } catch (e) {
                            // This type doesn't work for this binding
                        }
                    }

                    if (foundBinding) {
                        newDiscoveredBindings[bindingName] = {
                            ref: foundBinding,
                            type: bindingType,
                            currentValue: foundBinding.value
                        };

                        // Apply the binding value using official API with enhanced color handling
                        try {
                            if (bindingType === 'number') {
                                foundBinding.value = Number(bindingValue) || 0;
                                // console.log(`✅ Set data binding "${bindingName}" (number) to:`, bindingValue);
                            } else if (bindingType === 'boolean') {
                                foundBinding.value = Boolean(bindingValue);
                                // console.log(`✅ Set data binding "${bindingName}" (boolean) to:`, bindingValue);
                            } else if (bindingType === 'string') {
                                foundBinding.value = String(bindingValue || '');
                                // console.log(`✅ Set data binding "${bindingName}" (string) to:`, bindingValue);
                            } else if (bindingType === 'color') {
                                // Enhanced color handling from your Rive tester
                                // console.log(`🎨 COLOR BINDING ATTEMPT for ${bindingName}:`, bindingValue);

                                let colorValue: number;

                                if (typeof bindingValue === 'string' && bindingValue.startsWith('#')) {
                                    // Convert hex string to ARGB format
                                    const hexValue = parseInt(bindingValue.slice(1), 16);

                                    const r = (hexValue >> 16) & 0xFF;
                                    const g = (hexValue >> 8) & 0xFF;
                                    const b = hexValue & 0xFF;

                                    console.log(`   → RGB components: R=${r}, G=${g}, B=${b}`);
                                    console.log(`   → Original hex: ${bindingValue} (${hexValue})`);

                                    // Use ARGB format (Alpha, Red, Green, Blue)
                                    colorValue = (0xFF << 24) | (r << 16) | (g << 8) | b;

                                    console.log(`   → Using ARGB format: ${colorValue} (0x${colorValue.toString(16).padStart(8, '0')})`);

                                } else if (typeof bindingValue === 'number') {
                                    colorValue = bindingValue >>> 0; // Ensure unsigned 32-bit
                                } else {
                                    console.warn(`   → Unsupported color value format:`, bindingValue);
                                    return;
                                }

                                foundBinding.value = colorValue >>> 0; // Ensure unsigned 32-bit
                                // console.log(`   → Set binding.ref.value to: ${foundBinding.value} (0x${foundBinding.value.toString(16).padStart(8, '0')})`);

                                // Force a refresh/update if available
                                try {
                                    if (foundBinding.markDirty) {
                                        foundBinding.markDirty();
                                        console.log(`   → Called markDirty() on color binding`);
                                    }
                                    if (foundBinding.update) {
                                        foundBinding.update();
                                        console.log(`   → Called update() on color binding`);
                                    }
                                    if (foundBinding.notify) {
                                        foundBinding.notify();
                                        console.log(`   → Called notify() on color binding`);
                                    }
                                } catch (e) {
                                    console.log(`   → No refresh methods available on binding`);
                                }

                                // console.log(`✅ Set data binding "${bindingName}" (color) to:`, bindingValue);
                            } else if (bindingType === 'trigger') {
                                if (bindingValue && typeof foundBinding.fire === 'function') {
                                    foundBinding.fire();
                                    console.log(`🔥 Fired data binding trigger "${bindingName}"`);
                                }
                            }
                        } catch (error) {
                            console.error(`❌ Error applying data binding "${bindingName}":`, error);
                        }
                    } else {
                        console.warn(`⚠️ Data binding "${bindingName}" not found`);
                    }
                });

                setDiscoveredBindings(newDiscoveredBindings);

                // If we didn't find all bindings and haven't exhausted attempts, keep trying
                const foundCount = Object.keys(newDiscoveredBindings).length;
                const expectedCount = Object.keys(config.riveBindings || {}).length;

                if (foundCount < expectedCount && attempts < maxAttempts) {
                    setTimeout(discoverAndBindDataBindings, 120 * attempts);
                }

            } catch (error) {
                console.error('Error during data binding discovery:', error);
                if (attempts < maxAttempts) {
                    setTimeout(discoverAndBindDataBindings, 120 * attempts);
                }
            }
        };

        discoverAndBindDataBindings();

        return () => {
            stopped = true;
            setDiscoveredBindings({});
        };
    }, [rive, config.type, config.riveBindings]);

    // Apply input changes when inputs prop changes
    useEffect(() => {
        if (config.type !== 'rive' || !config.riveInputs || Object.keys(discoveredInputs).length === 0) return;

        Object.entries(config.riveInputs || {}).forEach(([inputKey, inputValue]) => {
            const discovered = discoveredInputs[inputKey];
            if (!discovered || !discovered.ref) return;

            try {
                if (discovered.type === 'trigger') {
                    // For triggers, fire if the value is truthy and different from last time
                    if (inputValue && typeof discovered.ref.fire === 'function') {
                        discovered.ref.fire();
                        console.log(`🔥 Fired trigger "${discovered.inputName}" in "${discovered.stateMachine}" via update`);
                    }
                } else {
                    // For number/boolean inputs
                    const newValue = discovered.type === 'boolean' ? Boolean(inputValue) : Number(inputValue) || 0;
                    if (discovered.ref.value !== newValue) {
                        discovered.ref.value = newValue;
                        console.log(`🔄 Updated "${discovered.inputName}" in "${discovered.stateMachine}" to:`, newValue);
                    }
                }
            } catch (error) {
                console.error(`❌ Error updating input "${discovered.inputName}" in "${discovered.stateMachine}":`, error);
            }
        });
    }, [config.type, config.riveInputs, discoveredInputs]);

    // Apply data binding changes when bindings prop changes with enhanced color handling
    useEffect(() => {
        if (config.type !== 'rive' || !config.riveBindings || Object.keys(discoveredBindings).length === 0) return;

        Object.entries(config.riveBindings || {}).forEach(([bindingName, bindingValue]) => {
            const discovered = discoveredBindings[bindingName];
            if (!discovered || !discovered.ref) return;

            try {
                let newValue: any;
                if (discovered.type === 'number') {
                    newValue = Number(bindingValue) || 0;
                } else if (discovered.type === 'boolean') {
                    newValue = Boolean(bindingValue);
                } else if (discovered.type === 'string') {
                    newValue = String(bindingValue || '');
                } else if (discovered.type === 'color') {
                    // Enhanced color handling for updates
                    if (typeof bindingValue === 'string' && bindingValue.startsWith('#')) {
                        const hexValue = parseInt(bindingValue.slice(1), 16);
                        const r = (hexValue >> 16) & 0xFF;
                        const g = (hexValue >> 8) & 0xFF;
                        const b = hexValue & 0xFF;
                        newValue = (0xFF << 24) | (r << 16) | (g << 8) | b; // ARGB format
                    } else {
                        newValue = Number(bindingValue) || 0;
                    }
                } else if (discovered.type === 'trigger') {
                    if (bindingValue && typeof discovered.ref.fire === 'function') {
                        discovered.ref.fire();
                        console.log(`🔄 Fired data binding trigger "${bindingName}"`);
                    }
                    return;
                } else {
                    return; // Unknown type
                }

                if (discovered.ref.value !== newValue) {
                    discovered.ref.value = newValue;
                    // console.log(`🔄 Updated data binding "${bindingName}" to:`, newValue);
                }
            } catch (error) {
                console.error(`❌ Error updating data binding "${bindingName}":`, error);
            }
        });
    }, [config.type, config.riveBindings, discoveredBindings]);

    // Get container styles based on background type
    const getContainerStyles = React.useMemo((): React.CSSProperties => {
        const baseStyles: React.CSSProperties = {
            position: 'absolute',
            top: 0,
            left: 0,
            width: width,
            height: height,
            pointerEvents: 'none',
            zIndex: 0,
        };

        switch (config.type) {
            case 'color':
                return {
                    ...baseStyles,
                    backgroundColor: config.color || '#FFFFFF',
                };

            case 'image':
                return {
                    ...baseStyles,
                    backgroundImage: config.imageUrl ? `url(${config.imageUrl})` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                };

            case 'rive':
                return {
                    ...baseStyles,
                    backgroundColor: 'transparent',
                };

            default:
                return {
                    ...baseStyles,
                    backgroundColor: '#FFFFFF',
                };
        }
    }, [config.type, config.color, config.imageUrl, width, height]);

    // Render based on background type
    const renderContent = () => {
        switch (config.type) {
            case 'rive':
                if (!config.riveFile || !RiveComponent) {
                    return null;
                }

                return (
                    <RiveComponent
                        key={riveKey} // Force remount on file change
                        style={{
                            width: width,
                            height: height,
                            display: 'block',
                            margin: 0,
                            padding: 0,
                            border: 'none',
                            outline: 'none',
                            imageRendering: 'crisp-edges',
                        }}
                    />
                );

            case 'image':
                // Background image is handled via CSS, no additional content needed
                return null;

            case 'color':
                // Background color is handled via CSS, no additional content needed
                return null;

            default:
                return null;
        }
    };

    return (
        <div style={getContainerStyles}>
            {renderContent()}
        </div>
    );
};

export default FrameEngine_BackgroundRenderer;