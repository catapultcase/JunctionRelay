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

import React, { useState } from 'react';
import { useTheme } from '@mui/material/styles';
import type {
    DiscoveredStateMachine,
    DiscoveredDataBinding,
    DiscoveredInput
} from './FrameEngine_Types';

interface ModernRiveBindingsProps {
    discoveredMachines: DiscoveredStateMachine[];
    discoveredBindings: DiscoveredDataBinding[];
    riveFile: string;
    layout: any;
    onInputChange: (inputName: string, value: any) => void;
    onBindingChange: (bindingName: string, value: any) => void;
}

export const ModernRiveBindings: React.FC<ModernRiveBindingsProps> = ({
    discoveredMachines,
    discoveredBindings,
    riveFile,
    layout,
    onInputChange,
    onBindingChange
}) => {
    const theme = useTheme();
    const [expandedMachines, setExpandedMachines] = useState<Set<string>>(new Set());

    const toggleMachine = (machineName: string) => {
        setExpandedMachines(prev => {
            const newSet = new Set(prev);
            if (newSet.has(machineName)) {
                newSet.delete(machineName);
            } else {
                newSet.add(machineName);
            }
            return newSet;
        });
    };

    // Styles
    const inputRowStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '10px 12px',
        backgroundColor: theme.palette.background.default,
        borderRadius: '6px',
        marginBottom: '8px',
        border: `1px solid ${theme.palette.divider}`,
    };

    const labelStyle: React.CSSProperties = {
        fontSize: '12px',
        fontWeight: 500,
        color: theme.palette.text.primary,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    };

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '6px 10px',
        fontSize: '12px',
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: '4px',
        backgroundColor: theme.palette.background.paper,
        color: theme.palette.text.primary,
        boxSizing: 'border-box',
    };

    const typeTagStyle: React.CSSProperties = {
        fontSize: '10px',
        padding: '2px 6px',
        borderRadius: '3px',
        backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[700] : theme.palette.grey[300],
        color: theme.palette.text.secondary,
        fontWeight: 500,
    };

    const machineHeaderStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100],
        borderRadius: '6px',
        cursor: 'pointer',
        marginBottom: '8px',
        border: `1px solid ${theme.palette.divider}`,
    };

    const sectionTitleStyle: React.CSSProperties = {
        fontSize: '12px',
        fontWeight: 600,
        color: theme.palette.text.primary,
        marginBottom: '12px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    };

    // Render input control based on type
    const renderInputControl = (input: DiscoveredInput, machineName: string) => {
        const currentValue = layout.riveInputs?.[input.name];

        switch (input.type) {
            case 'boolean':
                return (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={currentValue ?? false}
                            onChange={(e) => onInputChange(input.name, e.target.checked)}
                            style={{ cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '12px', color: theme.palette.text.secondary }}>
                            {currentValue ? 'True' : 'False'}
                        </span>
                    </label>
                );

            case 'number':
                return (
                    <input
                        type="number"
                        value={currentValue ?? 0}
                        onChange={(e) => onInputChange(input.name, parseFloat(e.target.value) || 0)}
                        style={inputStyle}
                        step="0.1"
                    />
                );

            case 'trigger':
                return (
                    <button
                        onClick={() => onInputChange(input.name, true)}
                        style={{
                            ...inputStyle,
                            cursor: 'pointer',
                            backgroundColor: theme.palette.primary.main,
                            color: theme.palette.primary.contrastText,
                            border: 'none',
                            fontWeight: 500,
                        }}
                    >
                        Fire Trigger
                    </button>
                );

            default:
                return (
                    <input
                        type="text"
                        value={currentValue ?? ''}
                        onChange={(e) => onInputChange(input.name, e.target.value)}
                        style={inputStyle}
                        placeholder="Enter value"
                    />
                );
        }
    };

    // Render data binding control
    const renderBindingControl = (binding: DiscoveredDataBinding) => {
        const currentValue = layout.riveBindings?.[binding.name];

        switch (binding.type) {
            case 'boolean':
                return (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={currentValue ?? false}
                            onChange={(e) => onBindingChange(binding.name, e.target.checked)}
                            style={{ cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '12px', color: theme.palette.text.secondary }}>
                            {currentValue ? 'True' : 'False'}
                        </span>
                    </label>
                );

            case 'number':
                return (
                    <input
                        type="number"
                        value={currentValue ?? 0}
                        onChange={(e) => onBindingChange(binding.name, parseFloat(e.target.value) || 0)}
                        style={inputStyle}
                        step="0.1"
                    />
                );

            case 'color':
                return (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                            type="color"
                            value={currentValue ?? '#000000'}
                            onChange={(e) => onBindingChange(binding.name, e.target.value)}
                            style={{ width: '50px', height: '32px', border: 'none', cursor: 'pointer' }}
                        />
                        <input
                            type="text"
                            value={currentValue ?? '#000000'}
                            onChange={(e) => onBindingChange(binding.name, e.target.value)}
                            style={{ ...inputStyle, flex: 1 }}
                            placeholder="#000000"
                        />
                    </div>
                );

            case 'string':
                return (
                    <input
                        type="text"
                        value={currentValue ?? ''}
                        onChange={(e) => onBindingChange(binding.name, e.target.value)}
                        style={inputStyle}
                        placeholder="Enter value"
                    />
                );

            default:
                return (
                    <input
                        type="text"
                        value={currentValue ?? ''}
                        onChange={(e) => onBindingChange(binding.name, e.target.value)}
                        style={inputStyle}
                        placeholder="Enter value"
                    />
                );
        }
    };

    if (!riveFile || (discoveredMachines.length === 0 && discoveredBindings.length === 0)) {
        return (
            <div style={{
                padding: '16px',
                textAlign: 'center',
                color: theme.palette.text.secondary,
                fontSize: '12px',
                fontStyle: 'italic'
            }}>
                {!riveFile
                    ? 'Select a Rive file to see available bindings'
                    : 'No state machines or data bindings discovered in this file'}
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* State Machines */}
            {discoveredMachines.length > 0 && (
                <div>
                    <div style={sectionTitleStyle}>State Machine Inputs</div>
                    {discoveredMachines.map((machine) => {
                        const isExpanded = expandedMachines.has(machine.name);
                        return (
                            <div key={machine.name} style={{ marginBottom: '12px' }}>
                                <div
                                    style={machineHeaderStyle}
                                    onClick={() => toggleMachine(machine.name)}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 600 }}>
                                            {machine.name}
                                        </span>
                                        <span style={{
                                            fontSize: '10px',
                                            padding: '2px 6px',
                                            borderRadius: '10px',
                                            backgroundColor: theme.palette.primary.main,
                                            color: theme.palette.primary.contrastText,
                                        }}>
                                            {machine.inputs.length}
                                        </span>
                                    </div>
                                    <span style={{ color: theme.palette.text.secondary }}>
                                        {isExpanded ? '▼' : '▶'}
                                    </span>
                                </div>

                                {isExpanded && (
                                    <div style={{ paddingLeft: '8px' }}>
                                        {machine.inputs.map((input) => (
                                            <div key={input.name} style={inputRowStyle}>
                                                <div style={labelStyle}>
                                                    <span>{input.name}</span>
                                                    <span style={typeTagStyle}>{input.type}</span>
                                                </div>
                                                <div style={{ width: '100%' }}>
                                                    {renderInputControl(input, machine.name)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Data Bindings */}
            {discoveredBindings.length > 0 && (
                <div>
                    <div style={sectionTitleStyle}>Global Data Bindings</div>
                    {discoveredBindings.map((binding) => (
                        <div key={binding.name} style={inputRowStyle}>
                            <div style={labelStyle}>
                                <span>{binding.name}</span>
                                <span style={typeTagStyle}>{binding.type}</span>
                            </div>
                            <div style={{ width: '100%' }}>
                                {renderBindingControl(binding)}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ModernRiveBindings;
