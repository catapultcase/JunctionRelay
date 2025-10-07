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

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    useRive,
    Layout,
    Fit,
    Alignment,
} from '@rive-app/react-canvas';

// Types for Rive discovery
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

// Enhanced Simple Input Row for live testing with improved color handling
const SimpleLiveInputRow: React.FC<{
    inputName: string;
    inputType: 'number' | 'boolean' | 'trigger' | 'unknown';
    currentValue: any;
    onInputChange: (inputName: string, value: any) => void;
}> = ({ inputName, inputType, currentValue, onInputChange }) => {
    const [localValue, setLocalValue] = useState(currentValue ?? 0);

    // Apply value changes
    const applyValue = (value: any) => {
        setLocalValue(value);
        onInputChange(inputName, value);
    };

    // Generate random values
    const generateRandomValue = () => {
        switch (inputType) {
            case 'number':
                return Math.floor(Math.random() * 101); // 0-100
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
        border: '1px solid #ddd',
        background: '#fafafa',
        cursor: 'pointer',
        fontSize: '10px',
        flex: 1,
    };

    const buttonStyle: React.CSSProperties = {
        padding: '3px 8px',
        borderRadius: '3px',
        border: '1px solid #ccc',
        background: '#f5f5f5',
        cursor: 'pointer',
        fontSize: '10px',
    };

    return (
        <div style={{
            padding: '6px',
            backgroundColor: '#f9f9f9',
            borderRadius: '3px',
            border: '1px solid #e8e8e8'
        }}>
            {/* Input name and type */}
            <div style={{
                marginBottom: '6px',
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#333'
            }}>
                <span style={{ fontWeight: 500 }}>{inputName}</span>
                <span style={{ color: '#999', marginLeft: '6px' }}>({inputType})</span>
            </div>

            {/* Input controls */}
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
                            border: '1px solid #ccc',
                            borderRadius: '3px',
                            fontFamily: 'monospace',
                            fontSize: '12px',
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
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
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
                // Trigger or unknown
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button
                        onClick={() => applyValue(Date.now())}
                        style={{
                            ...buttonStyle,
                            backgroundColor: '#e8f5e8',
                            borderColor: '#4caf50',
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

// Enhanced Simple Data Binding Row with improved color handling from Rive tester
const SimpleLiveDataBindingRow: React.FC<{
    bindingName: string;
    bindingType: 'number' | 'string' | 'boolean' | 'color' | 'trigger' | 'enum' | 'list' | 'image' | 'unknown';
    currentValue: any;
    bindingRef: any;
    onBindingChange: (bindingName: string, value: any) => void;
}> = ({ bindingName, bindingType, currentValue, bindingRef, onBindingChange }) => {
    const [localValue, setLocalValue] = useState(currentValue ?? '');

    // Enhanced apply value changes with improved color handling
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

        // Direct update using official API with enhanced color handling
        try {
            if (bindingRef) {
                if (bindingType === 'color') {
                    console.log(`🎨 COLOR BINDING ATTEMPT for ${bindingName}:`, value);

                    let colorValue: number;

                    if (typeof value === 'string' && value.startsWith('#')) {
                        // Convert hex string to RGB components
                        const hexValue = parseInt(value.slice(1), 16);

                        const r = (hexValue >> 16) & 0xFF;
                        const g = (hexValue >> 8) & 0xFF;
                        const b = hexValue & 0xFF;

                        console.log(`   → RGB components: R=${r}, G=${g}, B=${b}`);
                        console.log(`   → Original hex: ${value} (${hexValue})`);

                        // Use ARGB format - Alpha, Red, Green, Blue
                        colorValue = (0xFF << 24) | (r << 16) | (g << 8) | b;

                        console.log(`   → Using ARGB format: ${colorValue} (0x${colorValue.toString(16).padStart(8, '0')})`);

                    } else if (typeof value === 'number') {
                        colorValue = value >>> 0;
                    } else {
                        console.warn(`   → Unsupported color value format:`, value);
                        return;
                    }

                    bindingRef.value = colorValue >>> 0; // Ensure unsigned 32-bit
                    console.log(`   → Set binding.ref.value to: ${bindingRef.value} (0x${bindingRef.value.toString(16).padStart(8, '0')})`);

                    // Force a refresh/update if available
                    try {
                        if (bindingRef.markDirty) {
                            bindingRef.markDirty();
                            console.log(`   → Called markDirty() on color binding`);
                        }
                        if (bindingRef.update) {
                            bindingRef.update();
                            console.log(`   → Called update() on color binding`);
                        }
                        if (bindingRef.notify) {
                            bindingRef.notify();
                            console.log(`   → Called notify() on color binding`);
                        }
                    } catch (e) {
                        console.log(`   → No refresh methods available on binding`);
                    }

                } else {
                    // For other types, set normally
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

    // Generate random values
    const generateRandomValue = () => {
        switch (bindingType) {
            case 'number':
                return Math.floor(Math.random() * 101); // 0-100
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

    // Helper function to get display color from value
    const getDisplayColor = (val: any): string => {
        if (typeof val === 'string' && val.startsWith('#')) {
            return val;
        } else if (typeof val === 'number') {
            return `#${((val >>> 0) & 0xFFFFFF).toString(16).padStart(6, '0')}`;
        } else {
            return '#000000'; // Default fallback
        }
    };

    const miniButtonStyle: React.CSSProperties = {
        padding: '2px 6px',
        borderRadius: '3px',
        border: '1px solid #ddd',
        background: '#fafafa',
        cursor: 'pointer',
        fontSize: '10px',
        flex: 1,
    };

    const buttonStyle: React.CSSProperties = {
        padding: '3px 8px',
        borderRadius: '3px',
        border: '1px solid #ccc',
        background: '#f5f5f5',
        cursor: 'pointer',
        fontSize: '10px',
    };

    return (
        <div style={{
            padding: '6px',
            backgroundColor: '#fff8e1',
            borderRadius: '3px',
            border: '1px solid #ffcc02'
        }}>
            {/* Binding name and type */}
            <div style={{
                marginBottom: '6px',
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#333'
            }}>
                <span style={{ fontWeight: 500 }}>{bindingName}</span>
                <span style={{ color: '#999', marginLeft: '6px' }}>({bindingType})</span>
                {bindingType === 'color' && (
                    <span style={{ fontSize: '10px', color: '#666', display: 'block' }}>
                        Current: {getDisplayColor(localValue)}
                    </span>
                )}
            </div>

            {/* Binding controls */}
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
                            border: '1px solid #ccc',
                            borderRadius: '3px',
                            fontFamily: 'monospace',
                            fontSize: '12px',
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
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
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
                            border: '1px solid #ccc',
                            borderRadius: '3px',
                            fontFamily: 'monospace',
                            fontSize: '12px',
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
                                border: '1px solid #ccc',
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
                                border: '1px solid #ccc',
                                borderRadius: '3px',
                                fontFamily: 'monospace',
                                fontSize: '11px',
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
                            backgroundColor: '#e8f5e8',
                            borderColor: '#4caf50',
                            width: '100%'
                        }}
                    >
                        Fire Trigger
                    </button>
                </div>
            ) : bindingType === 'list' ? (
                <div style={{ fontSize: '10px', color: '#666' }}>List property ({String(localValue)})</div>
            ) : bindingType === 'image' ? (
                <div style={{ fontSize: '10px', color: '#666' }}>Image property</div>
            ) : (
                <div style={{ fontSize: '10px', color: '#666' }}>Unknown binding type</div>
            )}
        </div>
    );
};

// Live Input Row Component - Following POC Pattern
export const LiveInputRow: React.FC<{
    machineName: string;
    input: DiscoveredInput;
    riveFile: string;
    onInputChange: (inputName: string, value: any) => void;
}> = ({ machineName, input, riveFile, onInputChange }) => {
    const [localValue, setLocalValue] = useState<any>(input.currentValue ?? 0);
    const [inputReady, setInputReady] = useState(false);
    const riveFileUrl = `/api/frameengine/rive-files/${riveFile}/content`;
    const inputRef = useRef<any>(null);

    const { rive } = useRive({
        src: riveFileUrl,
        autoplay: true,
        autoBind: true, // Enable auto-binding for data bindings
        layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
    });

    // Poll for input availability following POC pattern
    useEffect(() => {
        if (!rive) return;

        let attempts = 0;
        let stopped = false;
        const maxAttempts = 20;

        const pollForInput = () => {
            if (stopped || !rive) return;
            attempts++;

            try {
                // Ensure machine is running
                try { rive.play(machineName); } catch { }

                const machineInputs = rive.stateMachineInputs
                    ? (rive.stateMachineInputs(machineName) as any[])
                    : [];

                const foundInput = machineInputs.find((i) => i?.name === input.name);

                if (foundInput) {
                    inputRef.current = foundInput;
                    setInputReady(true);

                    // Initialize with current value
                    if (input.type === 'number' || input.type === 'boolean') {
                        try {
                            const currentValue = foundInput.value;
                            if (currentValue !== undefined) {
                                setLocalValue(currentValue);
                            }
                        } catch { }
                    }
                    return;
                }
            } catch { }

            if (attempts < maxAttempts) {
                setTimeout(pollForInput, 120 * attempts);
            }
        };

        pollForInput();

        return () => {
            stopped = true;
            setInputReady(false);
            inputRef.current = null;
        };
    }, [rive, machineName, input.name, input.type]);

    // Apply value changes to Rive input
    const applyValue = (value: any) => {
        setLocalValue(value);
        onInputChange(input.name, value);

        if (!inputRef.current) return;

        try {
            if (input.type === 'trigger') {
                if (value && typeof inputRef.current.fire === 'function') {
                    inputRef.current.fire();
                }
            } else if (input.type === 'number' || input.type === 'boolean') {
                const newValue = input.type === 'boolean' ? Boolean(value) : Number(value) || 0;
                inputRef.current.value = newValue;
            }
        } catch (error) {
            console.error(`Error applying value to input "${input.name}":`, error);
        }
    };

    // Generate random values
    const generateRandomValue = () => {
        switch (input.type) {
            case 'number':
                return Math.floor(Math.random() * 101); // 0-100
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
        border: '1px solid #ddd',
        background: '#fafafa',
        cursor: 'pointer',
        fontSize: '10px',
        flex: 1,
    };

    const buttonStyle: React.CSSProperties = {
        padding: '3px 8px',
        borderRadius: '3px',
        border: '1px solid #ccc',
        background: '#f5f5f5',
        cursor: 'pointer',
        fontSize: '10px',
    };

    return (
        <div style={{
            padding: '6px',
            backgroundColor: '#f9f9f9',
            borderRadius: '3px',
            border: '1px solid #e8e8e8'
        }}>
            {/* Input name and type */}
            <div style={{
                marginBottom: '6px',
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#333'
            }}>
                <span style={{ fontWeight: 500 }}>{input.name}</span>
                <span style={{ color: '#999', marginLeft: '6px' }}>({input.type})</span>
            </div>

            {/* Input controls */}
            {!inputReady ? (
                <span style={{ fontSize: '10px', color: '#c00' }}>discovering...</span>
            ) : input.type === 'number' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <input
                        type="number"
                        step="0.1"
                        value={Number.isFinite(localValue) ? localValue : 0}
                        onChange={(e) => applyValue(parseFloat(e.target.value) || 0)}
                        style={{
                            width: '100%',
                            padding: '4px 6px',
                            border: '1px solid #ccc',
                            borderRadius: '3px',
                            fontFamily: 'monospace',
                            fontSize: '12px',
                        }}
                    />
                    <div style={{ display: 'flex', gap: '2px' }}>
                        <button style={miniButtonStyle} onClick={() => applyValue(0)}>0</button>
                        <button style={miniButtonStyle} onClick={() => applyValue(50)}>50</button>
                        <button style={miniButtonStyle} onClick={() => applyValue(100)}>100</button>
                        <button style={buttonStyle} onClick={() => applyValue(generateRandomValue())}>Rand</button>
                    </div>
                </div>
            ) : input.type === 'boolean' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
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
                // Trigger or unknown
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button
                        onClick={() => applyValue(Date.now())}
                        style={{
                            ...buttonStyle,
                            backgroundColor: '#e8f5e8',
                            borderColor: '#4caf50',
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

// Enhanced Live Data Binding Row Component with improved color handling
export const LiveDataBindingRow: React.FC<{
    binding: DiscoveredDataBinding;
    riveFile: string;
    onBindingChange: (bindingName: string, value: any) => void;
}> = ({ binding, riveFile, onBindingChange }) => {
    const [localValue, setLocalValue] = useState<any>(binding.currentValue ?? '');
    const [bindingReady, setBindingReady] = useState(false);
    const riveFileUrl = `/api/frameengine/rive-files/${riveFile}/content`;
    const bindingRef = useRef<any>(null);

    const { rive } = useRive({
        src: riveFileUrl,
        autoplay: true,
        autoBind: true, // Critical for data bindings
        layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
    });

    // Poll for data binding availability using official API
    useEffect(() => {
        if (!rive) return;

        let attempts = 0;
        let stopped = false;
        const maxAttempts = 20;

        const pollForBinding = () => {
            if (stopped || !rive) return;
            attempts++;

            try {
                const anyRive = rive as any;
                const vmi = anyRive.viewModelInstance;

                if (vmi) {
                    let foundBinding = null;

                    // Try to find the binding by type using official API
                    try {
                        if (binding.type === 'number') {
                            foundBinding = vmi.number?.(binding.name);
                        } else if (binding.type === 'string') {
                            foundBinding = vmi.string?.(binding.name);
                        } else if (binding.type === 'boolean') {
                            foundBinding = vmi.boolean?.(binding.name);
                        } else if (binding.type === 'color') {
                            foundBinding = vmi.color?.(binding.name);
                        } else if (binding.type === 'trigger') {
                            foundBinding = vmi.trigger?.(binding.name);
                        } else if (binding.type === 'enum') {
                            foundBinding = vmi.enum?.(binding.name);
                        } else if (binding.type === 'list') {
                            foundBinding = vmi.list?.(binding.name);
                        } else if (binding.type === 'image') {
                            foundBinding = vmi.image?.(binding.name);
                        }
                    } catch { }

                    if (foundBinding) {
                        bindingRef.current = foundBinding;
                        setBindingReady(true);

                        // Initialize with current value
                        try {
                            const currentValue = foundBinding.value;
                            if (currentValue !== undefined) {
                                setLocalValue(currentValue);
                            }
                        } catch { }
                        return;
                    }
                }
            } catch { }

            if (attempts < maxAttempts) {
                setTimeout(pollForBinding, 120 * attempts);
            }
        };

        pollForBinding();

        return () => {
            stopped = true;
            setBindingReady(false);
            bindingRef.current = null;
        };
    }, [rive, binding.name, binding.type]);

        // Enhanced apply value changes with improved color handling
        const applyValue = (value: any) => {
            setLocalValue(value);
            onBindingChange(binding.name, value);

            if (!bindingRef.current) return;

            try {
                if (binding.type === 'number') {
                    bindingRef.current.value = Number(value) || 0;
                } else if (binding.type === 'boolean') {
                    bindingRef.current.value = Boolean(value);
                } else if (binding.type === 'string') {
                    bindingRef.current.value = String(value || '');
                } else if (binding.type === 'color') {
                    // Enhanced color handling from Rive tester
                    console.log(`🎨 COLOR BINDING ATTEMPT for ${binding.name}:`, value);

                    let colorValue: number;

                    if (typeof value === 'string' && value.startsWith('#')) {
                        // Convert hex string to RGB components
                        const hexValue = parseInt(value.slice(1), 16);

                        const r = (hexValue >> 16) & 0xFF;
                        const g = (hexValue >> 8) & 0xFF;
                        const b = hexValue & 0xFF;

                        console.log(`   → RGB components: R=${r}, G=${g}, B=${b}`);
                        console.log(`   → Original hex: ${value} (${hexValue})`);

                        // Use ARGB format (Alpha, Red, Green, Blue)
                        colorValue = (0xFF << 24) | (r << 16) | (g << 8) | b;

                        console.log(`   → Using ARGB format: ${colorValue} (0x${colorValue.toString(16).padStart(8, '0')})`);

                    } else if (typeof value === 'number') {
                        colorValue = value >>> 0;
                    } else {
                        console.warn(`   → Unsupported color value format:`, value);
                        return;
                    }

                    bindingRef.current.value = colorValue >>> 0; // Ensure unsigned 32-bit
                    console.log(`   → Set binding.ref.value to: ${bindingRef.current.value} (0x${bindingRef.current.value.toString(16).padStart(8, '0')})`);

                    // Force a refresh/update if available
                    try {
                        if (bindingRef.current.markDirty) {
                            bindingRef.current.markDirty();
                            console.log(`   → Called markDirty() on color binding`);
                        }
                        if (bindingRef.current.update) {
                            bindingRef.current.update();
                            console.log(`   → Called update() on color binding`);
                        }
                        if (bindingRef.current.notify) {
                            bindingRef.current.notify();
                            console.log(`   → Called notify() on color binding`);
                        }
                    } catch (e) {
                        console.log(`   → No refresh methods available on binding`);
                    }

                } else if (binding.type === 'trigger') {
                    if (value && typeof bindingRef.current.fire === 'function') {
                        bindingRef.current.fire();
                    }
                }
            } catch (error) {
                console.error(`Error applying value to data binding "${binding.name}":`, error);
            }
        };

        // Generate random values
        const generateRandomValue = () => {
            switch (binding.type) {
                case 'number':
                    return Math.floor(Math.random() * 101); // 0-100
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

        // Helper function to get display color from value
        const getDisplayColor = (val: any): string => {
            if (typeof val === 'string' && val.startsWith('#')) {
                return val;
            } else if (typeof val === 'number') {
                return `#${((val >>> 0) & 0xFFFFFF).toString(16).padStart(6, '0')}`;
            } else {
                return '#000000'; // Default fallback
            }
        };

        const miniButtonStyle: React.CSSProperties = {
            padding: '2px 6px',
            borderRadius: '3px',
            border: '1px solid #ddd',
            background: '#fafafa',
            cursor: 'pointer',
            fontSize: '10px',
            flex: 1,
        };

        const buttonStyle: React.CSSProperties = {
            padding: '3px 8px',
            borderRadius: '3px',
            border: '1px solid #ccc',
            background: '#f5f5f5',
            cursor: 'pointer',
            fontSize: '10px',
        };

        return (
            <div style={{
                padding: '6px',
                backgroundColor: '#fff8e1',
                borderRadius: '3px',
                border: '1px solid #ffcc02'
            }}>
                {/* Binding name and type */}
                <div style={{
                    marginBottom: '6px',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    color: '#333'
                }}>
                    <span style={{ fontWeight: 500 }}>{binding.name}</span>
                    <span style={{ color: '#999', marginLeft: '6px' }}>({binding.type})</span>
                    {binding.type === 'color' && (
                        <span style={{ fontSize: '10px', color: '#666', display: 'block' }}>
                            Current: {getDisplayColor(localValue)}
                        </span>
                    )}
                </div>

                {/* Binding controls */}
                {!bindingReady ? (
                    <span style={{ fontSize: '10px', color: '#c00' }}>discovering...</span>
                ) : binding.type === 'number' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <input
                            type="number"
                            step="0.1"
                            value={Number.isFinite(localValue) ? localValue : 0}
                            onChange={(e) => applyValue(parseFloat(e.target.value) || 0)}
                            style={{
                                width: '100%',
                                padding: '4px 6px',
                                border: '1px solid #ccc',
                                borderRadius: '3px',
                                fontFamily: 'monospace',
                                fontSize: '12px',
                            }}
                        />
                        <div style={{ display: 'flex', gap: '2px' }}>
                            <button style={miniButtonStyle} onClick={() => applyValue(0)}>0</button>
                            <button style={miniButtonStyle} onClick={() => applyValue(50)}>50</button>
                            <button style={miniButtonStyle} onClick={() => applyValue(100)}>100</button>
                            <button style={buttonStyle} onClick={() => applyValue(generateRandomValue())}>Rand</button>
                        </div>
                    </div>
                ) : binding.type === 'boolean' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
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
                ) : binding.type === 'string' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <input
                            type="text"
                            value={String(localValue || '')}
                            onChange={(e) => applyValue(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '4px 6px',
                                border: '1px solid #ccc',
                                borderRadius: '3px',
                                fontFamily: 'monospace',
                                fontSize: '12px',
                            }}
                        />
                        <button style={buttonStyle} onClick={() => applyValue(generateRandomValue())}>
                            Random
                        </button>
                    </div>
                ) : binding.type === 'color' ? (
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
                                    border: '1px solid #ccc',
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
                                    border: '1px solid #ccc',
                                    borderRadius: '3px',
                                    fontFamily: 'monospace',
                                    fontSize: '11px',
                                }}
                            />
                        </div>
                        <button style={buttonStyle} onClick={() => applyValue(generateRandomValue())}>
                            Random
                        </button>
                    </div>
                ) : binding.type === 'trigger' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <button
                            onClick={() => applyValue(Date.now())}
                            style={{
                                ...buttonStyle,
                                backgroundColor: '#e8f5e8',
                                borderColor: '#4caf50',
                                width: '100%'
                            }}
                        >
                            Fire Trigger
                        </button>
                    </div>
                ) : binding.type === 'list' ? (
                    <div style={{ fontSize: '10px', color: '#666' }}>List property ({String(localValue)})</div>
                ) : binding.type === 'image' ? (
                    <div style={{ fontSize: '10px', color: '#666' }}>Image property</div>
                ) : (
                    <div style={{ fontSize: '10px', color: '#666' }}>Unknown binding type</div>
                )}
            </div>
        );
    };

// Enhanced Dynamic Rive Discovery Component with improved data bindings
export const RiveDiscovery: React.FC<{
    riveFile: string;
    onDiscovery: (machines: DiscoveredStateMachine[], bindings: DiscoveredDataBinding[]) => void;
}> = ({ riveFile, onDiscovery }) => {
    const [discovery, setDiscovery] = useState<{ machines: DiscoveredStateMachine[], bindings: DiscoveredDataBinding[] }>({ machines: [], bindings: [] });
    const riveFileUrl = `/api/frameengine/rive-files/${riveFile}/content`;

    const { rive } = useRive({
        src: riveFileUrl,
        autoplay: true,
        autoBind: true, // Critical for data bindings
        layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
        onLoad: () => {
            console.log('✅ Rive file loaded for discovery:', riveFile);
        },
        onLoadError: (error: any) => {
            console.error('❌ Rive discovery load error:', error);
        },
    });

    // Enhanced discovery using the correct approach from Rive tester
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

                // Enhanced data binding discovery using the correct approach
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

                console.log('🔍 Discovered state machines:', machines);
                console.log('🔍 Discovered data bindings:', dataBindings);

                const discoveryResult = { machines, bindings: dataBindings };
                setDiscovery(discoveryResult);
                onDiscovery(machines, dataBindings);

                // If we didn't find everything and haven't exhausted attempts, keep trying
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

    // Hidden component - only used for discovery
    return null;
};

// Enhanced Live State Machine Testing Component with improved color handling
export const LiveStateMachineTesting: React.FC<{
    discoveredMachines: DiscoveredStateMachine[];
    discoveredBindings: DiscoveredDataBinding[];
    riveFile: string;
    layout: any;
    onInputChange: (stateMachineName: string, inputName: string, value: any) => void;
    onBindingChange: (bindingName: string, value: any) => void;
}> = ({ discoveredMachines, discoveredBindings, riveFile, layout, onInputChange, onBindingChange }) => {
    const hasStateMachines = discoveredMachines.length > 0;
    const hasDataBindings = discoveredBindings.length > 0;
    const totalInputs = discoveredMachines.reduce((sum, m) => sum + m.inputs.length, 0);

    if (!riveFile || (!hasStateMachines && !hasDataBindings)) {
        return (
            <div style={{
                padding: '8px',
                backgroundColor: '#fff3cd',
                borderRadius: '4px',
                fontSize: '11px',
                color: '#856404',
                marginTop: '12px'
            }}>
                {!riveFile ?
                    '⏳ Select a Rive file to see available state machines and data bindings...' :
                    '🔍 Discovering state machines and data bindings from canvas... This may take a moment.'
                }
            </div>
        );
    }

    return (
        <div style={{ marginTop: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '8px' }}>
                🧪 Live Rive Testing
            </label>

            {/* Discovery Summary */}
            <div style={{
                padding: '8px',
                border: '2px solid #4CAF50',
                borderRadius: '4px',
                backgroundColor: '#f8fff8',
                marginBottom: '12px'
            }}>
                <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '11px' }}>Discovery Summary</div>
                <div style={{ fontSize: '10px', color: '#333' }}>
                    <div>State Machines: {discoveredMachines.length}</div>
                    <div>Total Inputs: {totalInputs}</div>
                    <div>Data Bindings: {discoveredBindings.length}</div>
                </div>
            </div>

            <div style={{
                border: '1px solid #e0e0e0',
                borderRadius: '4px',
                backgroundColor: '#fff',
                maxHeight: '400px',
                overflowY: 'auto'
            }}>
                {/* State Machines Section */}
                {hasStateMachines && (
                    <div style={{ padding: '8px' }}>
                        <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '12px', color: '#333' }}>
                            ⚙️ State Machines & Interactive Inputs
                        </div>
                        {discoveredMachines.map((machine) => (
                            <div key={machine.name} style={{
                                border: '1px solid #eee',
                                borderRadius: '4px',
                                margin: '0 0 8px 0',
                                padding: '10px',
                                background: '#fcfcfc'
                            }}>
                                <div style={{
                                    fontWeight: 600,
                                    marginBottom: '8px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    fontSize: '12px',
                                    color: '#333'
                                }}>
                                    <span>{machine.name}</span>
                                    <span style={{ fontSize: '11px', color: '#888' }}>
                                        {machine.inputs.length} input{machine.inputs.length === 1 ? '' : 's'}
                                    </span>
                                </div>

                                {machine.inputs.length === 0 ? (
                                    <div style={{ color: '#999', fontSize: '11px', fontStyle: 'italic' }}>
                                        No inputs in this state machine.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {machine.inputs.map((input) => (
                                            <SimpleLiveInputRow
                                                key={`${machine.name}/${input.name}`}
                                                inputName={input.name}
                                                inputType={input.type}
                                                currentValue={input.currentValue}
                                                onInputChange={(inputName, value) => {
                                                    onInputChange(machine.name, inputName, value);
                                                }}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Enhanced Data Bindings Section with improved color handling */}
                {hasDataBindings && (
                    <div style={{
                        padding: '8px',
                        borderTop: hasStateMachines ? '1px solid #f0f0f0' : 'none'
                    }}>
                        <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '12px', color: '#333' }}>
                            🔗 Global Data Bindings
                        </div>
                        <div style={{
                            border: '1px solid #ffcc02',
                            borderRadius: '4px',
                            padding: '10px',
                            background: '#fff8e1'
                        }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {discoveredBindings.map((binding, index) => (
                                    <SimpleLiveDataBindingRow
                                        key={`${binding.name}-${index}`}
                                        bindingName={binding.name}
                                        bindingType={binding.type}
                                        currentValue={binding.currentValue}
                                        bindingRef={binding.ref}
                                        onBindingChange={onBindingChange}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};