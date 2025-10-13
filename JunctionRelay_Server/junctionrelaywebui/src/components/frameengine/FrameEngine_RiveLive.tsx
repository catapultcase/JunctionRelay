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

import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '@mui/material/styles';
import {
    useRive,
    Layout,
    Fit,
    Alignment,
} from '@rive-app/react-canvas';
import {
    SimpleLiveInputRow,
    SimpleLiveDataBindingRow,
    type DiscoveredInput,
    type DiscoveredStateMachine,
    type DiscoveredDataBinding,
} from './FrameEngine_RiveCore';

// ============================================================================
// LIVE INPUT ROW
// ============================================================================

export const LiveInputRow: React.FC<{
    machineName: string;
    input: DiscoveredInput;
    riveFile: string;
    onInputChange: (inputName: string, value: any) => void;
}> = ({ machineName, input, riveFile, onInputChange }) => {
    const theme = useTheme();
    const [localValue, setLocalValue] = useState<any>(input.currentValue ?? 0);
    const [inputReady, setInputReady] = useState(false);
    const riveFileUrl = `/api/frameengine/rive-files/${riveFile}/content`;
    const inputRef = useRef<any>(null);

    const { rive } = useRive({
        src: riveFileUrl,
        autoplay: true,
        autoBind: true,
        layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
    });

    useEffect(() => {
        if (!rive) return;

        let attempts = 0;
        let stopped = false;
        const maxAttempts = 20;

        const pollForInput = () => {
            if (stopped || !rive) return;
            attempts++;

            try {
                try { rive.play(machineName); } catch { }

                const machineInputs = rive.stateMachineInputs
                    ? (rive.stateMachineInputs(machineName) as any[])
                    : [];

                const foundInput = machineInputs.find((i) => i?.name === input.name);

                if (foundInput) {
                    inputRef.current = foundInput;
                    setInputReady(true);

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

    const generateRandomValue = () => {
        switch (input.type) {
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
                <span style={{ fontWeight: 500 }}>{input.name}</span>
                <span style={{ color: theme.palette.text.secondary, marginLeft: '6px' }}>({input.type})</span>
            </div>

            {!inputReady ? (
                <span style={{ fontSize: '10px', color: theme.palette.error.main }}>discovering...</span>
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
            ) : input.type === 'boolean' ? (
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
// LIVE DATA BINDING ROW
// ============================================================================

export const LiveDataBindingRow: React.FC<{
    binding: DiscoveredDataBinding;
    riveFile: string;
    onBindingChange: (bindingName: string, value: any) => void;
}> = ({ binding, riveFile, onBindingChange }) => {
    const theme = useTheme();
    const [localValue, setLocalValue] = useState<any>(binding.currentValue ?? '');
    const [bindingReady, setBindingReady] = useState(false);
    const riveFileUrl = `/api/frameengine/rive-files/${riveFile}/content`;
    const bindingRef = useRef<any>(null);

    const { rive } = useRive({
        src: riveFileUrl,
        autoplay: true,
        autoBind: true,
        layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
    });

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
                console.log(`🎨 COLOR BINDING ATTEMPT for ${binding.name}:`, value);

                let colorValue: number;

                if (typeof value === 'string' && value.startsWith('#')) {
                    const hexValue = parseInt(value.slice(1), 16);

                    const r = (hexValue >> 16) & 0xFF;
                    const g = (hexValue >> 8) & 0xFF;
                    const b = hexValue & 0xFF;

                    console.log(`   → RGB components: R=${r}, G=${g}, B=${b}`);
                    console.log(`   → Original hex: ${value} (${hexValue})`);

                    colorValue = (0xFF << 24) | (r << 16) | (g << 8) | b;

                    console.log(`   → Using ARGB format: ${colorValue} (0x${colorValue.toString(16).padStart(8, '0')})`);

                } else if (typeof value === 'number') {
                    colorValue = value >>> 0;
                } else {
                    console.warn(`   → Unsupported color value format:`, value);
                    return;
                }

                bindingRef.current.value = colorValue >>> 0;
                console.log(`   → Set binding.ref.value to: ${bindingRef.current.value} (0x${bindingRef.current.value.toString(16).padStart(8, '0')})`);

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

    const generateRandomValue = () => {
        switch (binding.type) {
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
                <span style={{ fontWeight: 500 }}>{binding.name}</span>
                <span style={{ color: theme.palette.text.secondary, marginLeft: '6px' }}>({binding.type})</span>
                {binding.type === 'color' && (
                    <span style={{ fontSize: '10px', color: theme.palette.text.secondary, display: 'block' }}>
                        Current: {getDisplayColor(localValue)}
                    </span>
                )}
            </div>

            {!bindingReady ? (
                <span style={{ fontSize: '10px', color: theme.palette.error.main }}>discovering...</span>
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
            ) : binding.type === 'boolean' ? (
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
            ) : binding.type === 'string' ? (
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
            ) : binding.type === 'trigger' ? (
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
                </div>
            ) : binding.type === 'list' ? (
                <div style={{ fontSize: '10px', color: theme.palette.text.secondary }}>List property ({String(localValue)})</div>
            ) : binding.type === 'image' ? (
                <div style={{ fontSize: '10px', color: theme.palette.text.secondary }}>Image property</div>
            ) : (
                <div style={{ fontSize: '10px', color: theme.palette.text.secondary }}>Unknown binding type</div>
            )}
        </div>
    );
};

// ============================================================================
// LIVE STATE MACHINE TESTING
// ============================================================================

export const LiveStateMachineTesting: React.FC<{
    discoveredMachines: DiscoveredStateMachine[];
    discoveredBindings: DiscoveredDataBinding[];
    riveFile: string;
    layout: any;
    onInputChange: (stateMachineName: string, inputName: string, value: any) => void;
    onBindingChange: (bindingName: string, value: any) => void;
}> = ({ discoveredMachines, discoveredBindings, riveFile, layout, onInputChange, onBindingChange }) => {
    const theme = useTheme();
    const hasStateMachines = discoveredMachines.length > 0;
    const hasDataBindings = discoveredBindings.length > 0;
    const totalInputs = discoveredMachines.reduce((sum, m) => sum + m.inputs.length, 0);

    if (!riveFile || (!hasStateMachines && !hasDataBindings)) {
        return (
            <div style={{
                padding: '8px',
                backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.warning.light,
                borderRadius: '4px',
                fontSize: '11px',
                color: theme.palette.text.primary,
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
            <label style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 500,
                color: theme.palette.text.primary,
                marginBottom: '8px'
            }}>
                🧪 Live Rive Testing
            </label>

            <div style={{
                padding: '8px',
                border: `2px solid ${theme.palette.success.main}`,
                borderRadius: '4px',
                backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[900] : theme.palette.success.light,
                marginBottom: '12px'
            }}>
                <div style={{
                    fontWeight: 600,
                    marginBottom: '4px',
                    fontSize: '11px',
                    color: theme.palette.text.primary
                }}>
                    Discovery Summary
                </div>
                <div style={{ fontSize: '10px', color: theme.palette.text.primary }}>
                    <div>State Machines: {discoveredMachines.length}</div>
                    <div>Total Inputs: {totalInputs}</div>
                    <div>Data Bindings: {discoveredBindings.length}</div>
                </div>
            </div>

            <div style={{
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: '4px',
                backgroundColor: theme.palette.background.paper,
                maxHeight: '400px',
                overflowY: 'auto'
            }}>
                {hasStateMachines && (
                    <div style={{ padding: '8px' }}>
                        <div style={{
                            fontWeight: 600,
                            marginBottom: '8px',
                            fontSize: '12px',
                            color: theme.palette.text.primary
                        }}>
                            ⚙️ State Machines & Interactive Inputs
                        </div>
                        {discoveredMachines.map((machine) => (
                            <div key={machine.name} style={{
                                border: `1px solid ${theme.palette.divider}`,
                                borderRadius: '4px',
                                margin: '0 0 8px 0',
                                padding: '10px',
                                background: theme.palette.mode === 'dark' ? theme.palette.grey[900] : theme.palette.grey[50]
                            }}>
                                <div style={{
                                    fontWeight: 600,
                                    marginBottom: '8px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    fontSize: '12px',
                                    color: theme.palette.text.primary
                                }}>
                                    <span>{machine.name}</span>
                                    <span style={{ fontSize: '11px', color: theme.palette.text.secondary }}>
                                        {machine.inputs.length} input{machine.inputs.length === 1 ? '' : 's'}
                                    </span>
                                </div>

                                {machine.inputs.length === 0 ? (
                                    <div style={{
                                        color: theme.palette.text.secondary,
                                        fontSize: '11px',
                                        fontStyle: 'italic'
                                    }}>
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

                {hasDataBindings && (
                    <div style={{
                        padding: '8px',
                        borderTop: hasStateMachines ? `1px solid ${theme.palette.divider}` : 'none'
                    }}>
                        <div style={{
                            fontWeight: 600,
                            marginBottom: '8px',
                            fontSize: '12px',
                            color: theme.palette.text.primary
                        }}>
                            🔗 Global Data Bindings
                        </div>
                        <div style={{
                            border: `2px solid ${theme.palette.warning.main}`,
                            borderRadius: '4px',
                            padding: '10px',
                            background: theme.palette.mode === 'dark' ? theme.palette.grey[900] : '#fff8e1'
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