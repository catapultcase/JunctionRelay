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
import { useTheme } from '@mui/material/styles';
import {
    useRive,
    Layout,
    Fit,
    Alignment,
} from '@rive-app/react-canvas';

// ============================================================================
// TYPES
// ============================================================================

export interface DiscoveredStateMachine {
    name: string;
    inputNames: string[];
    inputs: DiscoveredInput[];
}

export interface DiscoveredInput {
    name: string;
    type: 'number' | 'boolean' | 'trigger' | 'unknown';
    currentValue?: any;
    ref?: any;
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
// SIMPLE LIVE INPUT ROW
// ============================================================================

export const SimpleLiveInputRow: React.FC<{
    inputName: string;
    inputType: 'number' | 'boolean' | 'trigger' | 'unknown';
    currentValue: any;
    onInputChange: (inputName: string, value: any) => void;
}> = ({ inputName, inputType, currentValue, onInputChange }) => {
    const theme = useTheme();
    const [localValue, setLocalValue] = useState(currentValue ?? 0);

    const applyValue = (value: any) => {
        setLocalValue(value);
        onInputChange(inputName, value);
    };

    const generateRandomValue = () => {
        switch (inputType) {
            case 'number':
                return Math.floor(Math.random() * 101);
            case 'boolean':
                return Math.random() < 0.5;
            case 'trigger':
                return Date.now();
            default:
                return 0;
        }
    };

    const miniButtonStyle: React.CSSProperties = {
        padding: '2px 6px',
        borderRadius: '3px',
        border: `1px solid ${theme.palette.divider}`,
        background: theme.palette.background.default,
        color: theme.palette.text.primary,
        cursor: 'pointer',
        fontSize: '10px',
        flex: 1,
    };

    const buttonStyle: React.CSSProperties = {
        padding: '3px 8px',
        borderRadius: '3px',
        border: `1px solid ${theme.palette.divider}`,
        background: theme.palette.background.default,
        color: theme.palette.text.primary,
        cursor: 'pointer',
        fontSize: '10px',
    };

    return (
        <div style={{
            padding: '6px',
            backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100],
            borderRadius: '3px',
            border: `1px solid ${theme.palette.divider}`
        }}>
            <div style={{
                marginBottom: '6px',
                fontFamily: 'monospace',
                fontSize: '11px',
                color: theme.palette.text.primary
            }}>
                <span style={{ fontWeight: 500 }}>{inputName}</span>
                <span style={{ color: theme.palette.text.secondary, marginLeft: '6px' }}>({inputType})</span>
            </div>

            {inputType === 'number' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <input
                        type="number"
                        step="0.1"
                        value={Number.isFinite(localValue) ? localValue : 0}
                        onChange={(e) => applyValue(parseFloat(e.target.value) || 0)}
                        style={{
                            width: '100%',
                            padding: '4px 6px',
                            border: `1px solid ${theme.palette.divider}`,
                            borderRadius: '3px',
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            backgroundColor: theme.palette.background.paper,
                            color: theme.palette.text.primary,
                        }}
                    />
                    <div style={{ display: 'flex', gap: '2px' }}>
                        <button style={miniButtonStyle} onClick={() => applyValue(0)}>0</button>
                        <button style={miniButtonStyle} onClick={() => applyValue(50)}>50</button>
                        <button style={miniButtonStyle} onClick={() => applyValue(100)}>100</button>
                        <button style={buttonStyle} onClick={() => applyValue(generateRandomValue())}>Rand</button>
                    </div>
                </div>
            ) : inputType === 'boolean' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: theme.palette.text.primary }}>
                        <input
                            type="checkbox"
                            checked={Boolean(localValue)}
                            onChange={(e) => applyValue(e.target.checked)}
                        />
                        <span>{localValue ? 'true' : 'false'}</span>
                    </label>
                    <button style={buttonStyle} onClick={() => applyValue(generateRandomValue())}>
                        Random
                    </button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button
                        onClick={() => applyValue(Date.now())}
                        style={{
                            ...buttonStyle,
                            backgroundColor: theme.palette.mode === 'dark' ? theme.palette.success.dark : theme.palette.success.light,
                            color: theme.palette.mode === 'dark' ? theme.palette.success.light : theme.palette.success.dark,
                            borderColor: theme.palette.success.main,
                            width: '100%'
                        }}
                    >
                        Fire Trigger
                    </button>
                    <button
                        onClick={() => applyValue(generateRandomValue())}
                        style={{ ...buttonStyle, width: '100%' }}
                    >
                        Random
                    </button>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// SIMPLE LIVE DATA BINDING ROW
// ============================================================================

export const SimpleLiveDataBindingRow: React.FC<{
    bindingName: string;
    bindingType: 'number' | 'string' | 'boolean' | 'color' | 'trigger' | 'enum' | 'list' | 'image' | 'unknown';
    currentValue: any;
    bindingRef: any;
    onBindingChange: (bindingName: string, value: any) => void;
}> = ({ bindingName, bindingType, currentValue, bindingRef, onBindingChange }) => {
    const theme = useTheme();
    const [localValue, setLocalValue] = useState(currentValue ?? '');

    const applyValue = (value: any) => {
        setLocalValue(value);
        onBindingChange(bindingName, value);

        console.log(`🔧 DATA BINDING UPDATE:`, {
            name: bindingName,
            type: bindingType,
            oldValue: localValue,
            newValue: value,
            bindingRef: bindingRef
        });

        try {
            if (bindingRef) {
                if (bindingType === 'color') {
                    console.log(`🎨 COLOR BINDING ATTEMPT for ${bindingName}:`, value);

                    let colorValue: number;

                    if (typeof value === 'string' && value.startsWith('#')) {
                        const hexValue = parseInt(value.slice(1), 16);
                        const r = (hexValue >> 16) & 0xFF;
                        const g = (hexValue >> 8) & 0xFF;
                        const b = hexValue & 0xFF;

                        console.log(`   → RGB components: R=${r}, G=${g}, B=${b}`);
                        colorValue = (0xFF << 24) | (r << 16) | (g << 8) | b;
                        console.log(`   → Using ARGB format: ${colorValue} (0x${colorValue.toString(16).padStart(8, '0')})`);

                    } else if (typeof value === 'number') {
                        colorValue = value >>> 0;
                    } else {
                        console.warn(`   → Unsupported color value format:`, value);
                        return;
                    }

                    bindingRef.value = colorValue >>> 0;
                    console.log(`   → Set binding.ref.value to: ${bindingRef.value}`);

                    try {
                        if (bindingRef.markDirty) bindingRef.markDirty();
                        if (bindingRef.update) bindingRef.update();
                        if (bindingRef.notify) bindingRef.notify();
                    } catch (e) {
                        console.log(`   → No refresh methods available on binding`);
                    }

                } else {
                    bindingRef.value = value;
                }

                console.log(`✅ Successfully set ${bindingName} to:`, bindingRef.value);
            } else {
                console.warn(`❌ No binding ref found for ${bindingName}`);
            }
        } catch (error) {
            console.error(`❌ Failed to set value for ${bindingName}:`, error);
        }
    };

    const generateRandomValue = () => {
        switch (bindingType) {
            case 'number':
                return Math.floor(Math.random() * 101);
            case 'boolean':
                return Math.random() < 0.5;
            case 'string':
                const options = ['Hello', 'World', 'Test', 'Sample', 'Demo'];
                return options[Math.floor(Math.random() * options.length)];
            case 'color':
                return `#${Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')}`;
            default:
                return '';
        }
    };

    const getDisplayColor = (val: any): string => {
        if (typeof val === 'string' && val.startsWith('#')) {
            return val;
        } else if (typeof val === 'number') {
            return `#${((val >>> 0) & 0xFFFFFF).toString(16).padStart(6, '0')}`;
        } else {
            return '#000000';
        }
    };

    const miniButtonStyle: React.CSSProperties = {
        padding: '2px 6px',
        borderRadius: '3px',
        border: `1px solid ${theme.palette.divider}`,
        background: theme.palette.background.default,
        color: theme.palette.text.primary,
        cursor: 'pointer',
        fontSize: '10px',
        flex: 1,
    };

    const buttonStyle: React.CSSProperties = {
        padding: '3px 8px',
        borderRadius: '3px',
        border: `1px solid ${theme.palette.divider}`,
        background: theme.palette.background.default,
        color: theme.palette.text.primary,
        cursor: 'pointer',
        fontSize: '10px',
    };

    return (
        <div style={{
            padding: '6px',
            backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[900] : '#fff8e1',
            borderRadius: '3px',
            border: `2px solid ${theme.palette.warning.main}`
        }}>
            <div style={{
                marginBottom: '6px',
                fontFamily: 'monospace',
                fontSize: '11px',
                color: theme.palette.text.primary
            }}>
                <span style={{ fontWeight: 500 }}>{bindingName}</span>
                <span style={{ color: theme.palette.text.secondary, marginLeft: '6px' }}>({bindingType})</span>
                {bindingType === 'color' && (
                    <span style={{ fontSize: '10px', color: theme.palette.text.secondary, display: 'block' }}>
                        Current: {getDisplayColor(localValue)}
                    </span>
                )}
            </div>

            {bindingType === 'number' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <input
                        type="number"
                        step="0.1"
                        value={Number.isFinite(localValue) ? localValue : 0}
                        onChange={(e) => applyValue(parseFloat(e.target.value) || 0)}
                        style={{
                            width: '100%',
                            padding: '4px 6px',
                            border: `1px solid ${theme.palette.divider}`,
                            borderRadius: '3px',
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            backgroundColor: theme.palette.background.paper,
                            color: theme.palette.text.primary,
                        }}
                    />
                    <div style={{ display: 'flex', gap: '2px' }}>
                        <button style={miniButtonStyle} onClick={() => applyValue(0)}>0</button>
                        <button style={miniButtonStyle} onClick={() => applyValue(50)}>50</button>
                        <button style={miniButtonStyle} onClick={() => applyValue(100)}>100</button>
                        <button style={buttonStyle} onClick={() => applyValue(generateRandomValue())}>Rand</button>
                    </div>
                </div>
            ) : bindingType === 'boolean' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: theme.palette.text.primary }}>
                        <input
                            type="checkbox"
                            checked={Boolean(localValue)}
                            onChange={(e) => applyValue(e.target.checked)}
                        />
                        <span>{localValue ? 'true' : 'false'}</span>
                    </label>
                    <button style={buttonStyle} onClick={() => applyValue(generateRandomValue())}>
                        Random
                    </button>
                </div>
            ) : bindingType === 'string' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <input
                        type="text"
                        value={String(localValue || '')}
                        onChange={(e) => applyValue(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '4px 6px',
                            border: `1px solid ${theme.palette.divider}`,
                            borderRadius: '3px',
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            backgroundColor: theme.palette.background.paper,
                            color: theme.palette.text.primary,
                        }}
                    />
                    <button style={buttonStyle} onClick={() => applyValue(generateRandomValue())}>
                        Random
                    </button>
                </div>
            ) : bindingType === 'color' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <input
                            type="color"
                            value={getDisplayColor(localValue)}
                            onChange={(e) => {
                                const hexColor = e.target.value;
                                console.log(`🎨 Color picker changed to: ${hexColor}`);
                                applyValue(hexColor);
                            }}
                            style={{
                                width: '50px',
                                height: '30px',
                                padding: '2px',
                                border: `1px solid ${theme.palette.divider}`,
                                borderRadius: '4px'
                            }}
                        />
                        <input
                            type="text"
                            value={getDisplayColor(localValue)}
                            onChange={(e) => {
                                const textColor = e.target.value;
                                console.log(`🎨 Color text input changed to: ${textColor}`);
                                applyValue(textColor);
                            }}
                            placeholder="#FF0000"
                            style={{
                                flex: 1,
                                padding: '4px 6px',
                                border: `1px solid ${theme.palette.divider}`,
                                borderRadius: '3px',
                                fontFamily: 'monospace',
                                fontSize: '11px',
                                backgroundColor: theme.palette.background.paper,
                                color: theme.palette.text.primary,
                            }}
                        />
                    </div>
                    <button style={buttonStyle} onClick={() => applyValue(generateRandomValue())}>
                        Random
                    </button>
                </div>
            ) : bindingType === 'trigger' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button
                        onClick={() => {
                            try {
                                console.log(`🔥 Firing trigger: ${bindingName}`);
                                bindingRef?.fire?.();
                                console.log(`✅ Trigger fired successfully`);
                            } catch (error) {
                                console.error(`❌ Failed to fire trigger ${bindingName}:`, error);
                            }
                        }}
                        style={{
                            ...buttonStyle,
                            backgroundColor: theme.palette.mode === 'dark' ? theme.palette.success.dark : theme.palette.success.light,
                            color: theme.palette.mode === 'dark' ? theme.palette.success.light : theme.palette.success.dark,
                            borderColor: theme.palette.success.main,
                            width: '100%'
                        }}
                    >
                        Fire Trigger
                    </button>
                </div>
            ) : bindingType === 'list' ? (
                <div style={{ fontSize: '10px', color: theme.palette.text.secondary }}>List property ({String(localValue)})</div>
            ) : bindingType === 'image' ? (
                <div style={{ fontSize: '10px', color: theme.palette.text.secondary }}>Image property</div>
            ) : (
                <div style={{ fontSize: '10px', color: theme.palette.text.secondary }}>Unknown binding type</div>
            )}
        </div>
    );
};

// ============================================================================
// RIVE DISCOVERY
// ============================================================================

export const RiveDiscovery: React.FC<{
    riveFile: string;
    onDiscovery: (machines: DiscoveredStateMachine[], bindings: DiscoveredDataBinding[]) => void;
}> = ({ riveFile, onDiscovery }) => {
    const [discovery, setDiscovery] = useState<{ machines: DiscoveredStateMachine[], bindings: DiscoveredDataBinding[] }>({ machines: [], bindings: [] });
    const riveFileUrl = `/api/frameengine/rive-files/${riveFile}/content`;

    const { rive } = useRive({
        src: riveFileUrl,
        autoplay: true,
        autoBind: true,
        layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
        onLoad: () => {
            console.log('✅ Rive file loaded for discovery:', riveFile);
        },
        onLoadError: (error: any) => {
            console.error('❌ Rive discovery load error:', error);
        },
    });

    useEffect(() => {
        if (!rive) return;

        let attempts = 0;
        let stopped = false;
        const maxAttempts = 20;

        const discoverAll = () => {
            if (stopped || !rive) return;
            attempts++;

            try {
                const anyRive = rive as any;
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

                const dataBindings: DiscoveredDataBinding[] = [];

                try {
                    const vmi = rive.viewModelInstance;
                    if (vmi) {
                        const viewModel = (rive as any).viewModel;

                        if (viewModel?.properties) {
                            viewModel.properties.forEach((propertyDescriptor: any) => {
                                const propertyName = propertyDescriptor.name;
                                const propertyType = propertyDescriptor.type;

                                try {
                                    let binding: any = null;
                                    let discoveredType: DiscoveredDataBinding['type'] = 'unknown';
                                    let currentValue: any = null;

                                    switch (propertyType) {
                                        case 0: binding = vmi.number(propertyName); discoveredType = 'number'; break;
                                        case 1: binding = vmi.string(propertyName); discoveredType = 'string'; break;
                                        case 2: binding = vmi.boolean(propertyName); discoveredType = 'boolean'; break;
                                        case 3: binding = vmi.color(propertyName); discoveredType = 'color'; break;
                                        case 4: binding = vmi.trigger(propertyName); discoveredType = 'trigger'; break;
                                        case 5: binding = vmi.enum(propertyName); discoveredType = 'enum'; break;
                                        case 6: binding = vmi.list(propertyName); discoveredType = 'list'; break;
                                        case 7: binding = vmi.image(propertyName); discoveredType = 'image'; break;
                                        default:
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
                                        try {
                                            if (discoveredType === 'trigger') {
                                                currentValue = null;
                                            } else if (discoveredType === 'list') {
                                                currentValue = `List (${binding.length || 0} items)`;
                                            } else {
                                                currentValue = binding.value;
                                            }
                                        } catch {
                                            currentValue = null;
                                        }

                                        dataBindings.push({
                                            name: propertyName,
                                            type: discoveredType,
                                            currentValue: currentValue,
                                            ref: binding
                                        });
                                    }
                                } catch (error) {
                                    console.error(`Error accessing property ${propertyName}:`, error);
                                }
                            });
                        }
                    }
                } catch (error) {
                    console.error("Error during data binding discovery:", error);
                }

                const discoveryResult = { machines, bindings: dataBindings };
                setDiscovery(discoveryResult);
                onDiscovery(machines, dataBindings);

                const totalInputs = machines.reduce((sum, m) => sum + m.inputs.length, 0);
                const totalBindings = dataBindings.length;

                if ((totalInputs === 0 && smNames.length > 0) || (totalBindings === 0 && attempts < 10)) {
                    if (attempts < maxAttempts) {
                        setTimeout(discoverAll, 120 * attempts);
                    }
                }

            } catch (error) {
                console.error('Error during Rive discovery:', error);
                if (attempts < maxAttempts) {
                    setTimeout(discoverAll, 120 * attempts);
                }
            }
        };

        discoverAll();

        return () => {
            stopped = true;
            setDiscovery({ machines: [], bindings: [] });
        };
    }, [rive, onDiscovery]);

    return null;
};