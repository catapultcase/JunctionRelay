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

import React, { useState, useEffect, useMemo, useRef } from 'react';
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

interface AssetRiveElementProps {
    assetRiveFile?: string;
    riveStateMachine?: string;
    riveInputs?: Record<string, any>;
    riveBindings?: Record<string, any>;
    riveFit?: 'cover' | 'contain' | 'none';
    opacity?: number;
    width: number;
    height: number;
    onRiveDiscovery?: (machines: DiscoveredStateMachine[], bindings: DiscoveredDataBinding[]) => void;
    onRiveLoad?: () => void;
    onRiveError?: (error: any) => void;
}

export const FrameEngine_Asset_Rive: React.FC<AssetRiveElementProps> = ({
    assetRiveFile,
    riveStateMachine,
    riveInputs,
    riveBindings,
    riveFit = 'cover',
    opacity = 1,
    width,
    height,
    onRiveDiscovery,
    onRiveLoad,
    onRiveError,
}) => {
    const [discoveredInputs, setDiscoveredInputs] = useState<Record<string, any>>({});
    const [discoveredBindings, setDiscoveredBindings] = useState<Record<string, any>>({});
    const [riveKey, setRiveKey] = useState(0);

    // Detect Rive file changes and force remount
    useEffect(() => {
        if (assetRiveFile) {
            console.log('🔄 Asset Rive file changed, forcing reload:', assetRiveFile);
            setRiveKey(prev => prev + 1);
        }
    }, [assetRiveFile]);

    // Determine Rive options
    const riveOptions = useMemo(() => {
        if (!assetRiveFile) {
            return null;
        }

        const riveFileUrl = assetRiveFile.startsWith('http')
            ? assetRiveFile
            : `/api/frameengine/rive/${assetRiveFile}/content`;

        let layoutFit: Fit;
        switch (riveFit) {
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
            autoBind: true,
            useDevicePixelRatio: true,
            layout: new Layout({
                fit: layoutFit,
                alignment: Alignment.Center
            }),
            onLoad: () => {
                console.log('✅ Asset Rive loaded:', assetRiveFile);
                if (onRiveLoad) onRiveLoad();
            },
            onLoadError: (error: any) => {
                console.error('❌ Asset Rive load error:', error, { riveFile: assetRiveFile });
                if (onRiveError) onRiveError(error);
            },
        };
    }, [assetRiveFile, riveFit, onRiveLoad, onRiveError, riveKey]);

    // Initialize Rive
    const { rive, RiveComponent } = useRive(riveOptions || { src: '', autoplay: false });

    // Discovery logic - STREAMLINED VERSION (same as background renderer)
    // Use a ref to track if we've already discovered for this file
    const discoveredFileRef = useRef<string | null>(null);
    const hasRunDiscoveryRef = useRef<boolean>(false);

    useEffect(() => {
        if (!rive || !assetRiveFile) return;

        // Only discover once per file to prevent infinite loops
        if (discoveredFileRef.current === assetRiveFile && hasRunDiscoveryRef.current) {
            return;
        }

        // Reset if file changed
        if (discoveredFileRef.current !== assetRiveFile) {
            discoveredFileRef.current = assetRiveFile;
            hasRunDiscoveryRef.current = false;
        }

        let attempts = 0;
        let stopped = false;
        const maxAttempts = 20;

        const discoverAll = () => {
            if (stopped || !rive) return;
            attempts++;

            try {
                const smNames: string[] = Array.isArray(rive.stateMachineNames) ? rive.stateMachineNames : [];

                smNames.forEach((sm) => {
                    try { rive.play(sm); } catch { }
                });

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

                // Discover data bindings
                const dataBindings: DiscoveredDataBinding[] = [];

                try {
                    const vmi = (rive as any).viewModelInstance;
                    if (vmi && (vmi as any).properties) {
                        (vmi as any).properties.forEach((prop: any) => {
                            const propertyName = prop.name;
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
                } catch (error) {
                    console.error("Error during asset Rive data binding discovery:", error);
                }

                // Mark that we've run discovery for this file
                hasRunDiscoveryRef.current = true;

                if (onRiveDiscovery) {
                    onRiveDiscovery(machines, dataBindings);
                }

                const totalInputs = machines.reduce((sum, m) => sum + m.inputs.length, 0);
                const totalBindings = dataBindings.length;

                // Only retry if we found NOTHING (no machines AND no inputs AND no bindings)
                // Don't retry just because there are no bindings - many Rive files don't use data bindings
                const foundNothing = machines.length === 0 && totalInputs === 0 && totalBindings === 0;

                if (foundNothing && attempts < maxAttempts) {
                    setTimeout(discoverAll, 120 * attempts);
                }

            } catch (error) {
                console.error('Error during asset Rive discovery:', error);
                if (attempts < maxAttempts) {
                    setTimeout(discoverAll, 120 * attempts);
                }
            }
        };

        discoverAll();

        return () => {
            stopped = true;
        };
    }, [rive, assetRiveFile, onRiveDiscovery]);

    // Input binding logic (same as background renderer)
    useEffect(() => {
        if (!rive || !assetRiveFile || !riveInputs) return;

        let attempts = 0;
        let stopped = false;
        const maxAttempts = 20;
        const inputRefs: Record<string, any> = {};

        const discoverAndBindInputs = () => {
            if (stopped || !rive) return;
            attempts++;

            try {
                const smNames: string[] = Array.isArray(rive.stateMachineNames) ? rive.stateMachineNames : [];

                smNames.forEach((sm) => {
                    try { rive.play(sm); } catch { }
                });

                const newDiscoveredInputs: Record<string, any> = {};

                Object.entries(riveInputs || {}).forEach(([inputKey, inputValue]) => {
                    let targetMachine: string;
                    let inputName: string;

                    if (inputKey.includes('.')) {
                        const parts = inputKey.split('.');
                        targetMachine = parts[0];
                        inputName = parts.slice(1).join('.');
                    } else {
                        targetMachine = riveStateMachine || smNames[0];
                        inputName = inputKey;
                    }

                    if (!targetMachine) return;
                    if (!smNames.includes(targetMachine)) return;

                    const machineInputs = rive.stateMachineInputs
                        ? (rive.stateMachineInputs(targetMachine) as any[])
                        : [];

                    const foundInput = machineInputs.find((i) => i?.name === inputName);

                    if (foundInput) {
                        inputRefs[inputKey] = foundInput;

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

                        try {
                            if (inputType === 'trigger') {
                                if (inputValue && typeof foundInput.fire === 'function') {
                                    foundInput.fire();
                                }
                            } else if (hasValue) {
                                const newValue = inputType === 'boolean' ? Boolean(inputValue) : Number(inputValue) || 0;
                                foundInput.value = newValue;
                            }
                        } catch (error) {
                            console.error(`❌ Error applying asset Rive input "${inputName}" in "${targetMachine}":`, error);
                        }
                    }
                });

                setDiscoveredInputs(newDiscoveredInputs);

                const foundCount = Object.keys(newDiscoveredInputs).length;
                const expectedCount = Object.keys(riveInputs || {}).length;

                if (foundCount < expectedCount && attempts < maxAttempts) {
                    setTimeout(discoverAndBindInputs, 120 * attempts);
                }

            } catch (error) {
                console.error('Error during asset Rive input discovery:', error);
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
    }, [rive, assetRiveFile, riveStateMachine, riveInputs]);

    // Data binding logic (same as background renderer)
    useEffect(() => {
        if (!rive || !assetRiveFile || !riveBindings) return;

        let attempts = 0;
        let stopped = false;
        const maxAttempts = 20;

        const discoverAndBindDataBindings = () => {
            if (stopped || !rive) return;
            attempts++;

            try {
                const vmi = (rive as any).viewModelInstance;

                if (!vmi) {
                    if (attempts < maxAttempts) {
                        setTimeout(discoverAndBindDataBindings, 120 * attempts);
                    }
                    return;
                }

                const newDiscoveredBindings: Record<string, any> = {};

                Object.entries(riveBindings || {}).forEach(([bindingName, bindingValue]) => {
                    let foundBinding = null;
                    let bindingType = 'unknown';

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
                        } catch (e) { }
                    }

                    if (foundBinding) {
                        newDiscoveredBindings[bindingName] = {
                            ref: foundBinding,
                            type: bindingType,
                            currentValue: foundBinding.value
                        };

                        try {
                            if (bindingType === 'number') {
                                foundBinding.value = Number(bindingValue) || 0;
                            } else if (bindingType === 'boolean') {
                                foundBinding.value = Boolean(bindingValue);
                            } else if (bindingType === 'string') {
                                foundBinding.value = String(bindingValue || '');
                            } else if (bindingType === 'color') {
                                let colorValue: number;

                                if (typeof bindingValue === 'string' && bindingValue.startsWith('#')) {
                                    const hexValue = parseInt(bindingValue.slice(1), 16);
                                    const r = (hexValue >> 16) & 0xFF;
                                    const g = (hexValue >> 8) & 0xFF;
                                    const b = hexValue & 0xFF;
                                    colorValue = (0xFF << 24) | (r << 16) | (g << 8) | b;
                                } else if (typeof bindingValue === 'number') {
                                    colorValue = bindingValue >>> 0;
                                } else {
                                    return;
                                }

                                foundBinding.value = colorValue >>> 0;
                            } else if (bindingType === 'trigger') {
                                if (bindingValue && typeof foundBinding.fire === 'function') {
                                    foundBinding.fire();
                                }
                            }
                        } catch (error) {
                            console.error(`❌ Error applying asset Rive data binding "${bindingName}":`, error);
                        }
                    }
                });

                setDiscoveredBindings(newDiscoveredBindings);

                const foundCount = Object.keys(newDiscoveredBindings).length;
                const expectedCount = Object.keys(riveBindings || {}).length;

                if (foundCount < expectedCount && attempts < maxAttempts) {
                    setTimeout(discoverAndBindDataBindings, 120 * attempts);
                }

            } catch (error) {
                console.error('Error during asset Rive data binding discovery:', error);
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
    }, [rive, assetRiveFile, riveBindings]);

    // Apply input changes when inputs prop changes
    useEffect(() => {
        if (!assetRiveFile || !riveInputs || Object.keys(discoveredInputs).length === 0) return;

        Object.entries(riveInputs || {}).forEach(([inputKey, inputValue]) => {
            const discovered = discoveredInputs[inputKey];
            if (!discovered || !discovered.ref) return;

            try {
                if (discovered.type === 'trigger') {
                    if (inputValue && typeof discovered.ref.fire === 'function') {
                        discovered.ref.fire();
                    }
                } else {
                    const newValue = discovered.type === 'boolean' ? Boolean(inputValue) : Number(inputValue) || 0;
                    if (discovered.ref.value !== newValue) {
                        discovered.ref.value = newValue;
                    }
                }
            } catch (error) {
                console.error(`❌ Error updating asset Rive input "${discovered.inputName}" in "${discovered.stateMachine}":`, error);
            }
        });
    }, [assetRiveFile, riveInputs, discoveredInputs]);

    // Apply data binding changes when bindings prop changes
    useEffect(() => {
        if (!assetRiveFile || !riveBindings || Object.keys(discoveredBindings).length === 0) return;

        Object.entries(riveBindings || {}).forEach(([bindingName, bindingValue]) => {
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
                    if (typeof bindingValue === 'string' && bindingValue.startsWith('#')) {
                        const hexValue = parseInt(bindingValue.slice(1), 16);
                        const r = (hexValue >> 16) & 0xFF;
                        const g = (hexValue >> 8) & 0xFF;
                        const b = hexValue & 0xFF;
                        newValue = (0xFF << 24) | (r << 16) | (g << 8) | b;
                    } else {
                        newValue = Number(bindingValue) || 0;
                    }
                } else if (discovered.type === 'trigger') {
                    if (bindingValue && typeof discovered.ref.fire === 'function') {
                        discovered.ref.fire();
                    }
                    return;
                } else {
                    return;
                }

                if (discovered.ref.value !== newValue) {
                    discovered.ref.value = newValue;
                }
            } catch (error) {
                console.error(`❌ Error updating asset Rive data binding "${bindingName}":`, error);
            }
        });
    }, [assetRiveFile, riveBindings, discoveredBindings]);

    // If no Rive file, show placeholder
    if (!assetRiveFile || !RiveComponent) {
        return (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#f0f0f0',
                    border: '2px dashed #ccc',
                    color: '#999',
                    fontSize: '14px',
                    textAlign: 'center',
                    padding: '16px',
                    boxSizing: 'border-box',
                }}
            >
                <div>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎨</div>
                    <div>No Rive animation selected</div>
                    <div style={{ fontSize: '12px', marginTop: '4px' }}>
                        Select a Rive file in properties
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                overflow: 'hidden',
                backgroundColor: 'transparent',
                opacity: opacity,
            }}
        >
            <RiveComponent
                key={riveKey}
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    margin: 0,
                    padding: 0,
                    border: 'none',
                    outline: 'none',
                    imageRendering: 'crisp-edges',
                    pointerEvents: 'none',
                    userSelect: 'none',
                }}
            />
        </div>
    );
};

export default FrameEngine_Asset_Rive;