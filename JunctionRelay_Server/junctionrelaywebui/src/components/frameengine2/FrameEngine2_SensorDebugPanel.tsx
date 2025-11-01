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
import type { SensorDebugData } from './types/FrameEngine2_SensorTypes';

interface FrameEngine2_SensorDebugPanelProps {
    /** Debug data from the sensor tag manager */
    debugData: SensorDebugData;
}

/**
 * Debug panel component that visualizes sensor tag data flow
 * Displays in retro terminal style (black background, green text)
 */
const FrameEngine2_SensorDebugPanel: React.FC<FrameEngine2_SensorDebugPanelProps> = ({ debugData }) => {
    const [inputsExpanded, setInputsExpanded] = useState<boolean>(true);
    const [outputsExpanded, setOutputsExpanded] = useState<boolean>(true);
    const [riveExpanded, setRiveExpanded] = useState<boolean>(true);

    const { inputs, outputs, stats, riveInfo } = debugData;

    /**
     * Format timestamp as seconds ago
     */
    const formatTimestamp = (timestamp: number): string => {
        const secondsAgo = Math.floor((Date.now() - timestamp) / 1000);
        if (secondsAgo < 1) return '0s ago';
        if (secondsAgo < 60) return `${secondsAgo}s ago`;
        const minutesAgo = Math.floor(secondsAgo / 60);
        return `${minutesAgo}m ago`;
    };

    /**
     * Format value for display
     */
    const formatValue = (value: any): string => {
        if (value === null || value === undefined) return 'null';
        if (typeof value === 'string') return `"${value}"`;
        if (typeof value === 'number') return value.toString();
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        return JSON.stringify(value);
    };

    return (
        <div
            style={{
                position: 'absolute',
                top: '16px',
                left: '16px',
                width: '500px',
                maxHeight: '600px',
                backgroundColor: '#000000',
                color: '#00ff00',
                border: '1px solid #00ff00',
                borderRadius: '4px',
                fontFamily: '"Courier New", Courier, monospace',
                fontSize: '12px',
                overflow: 'auto',
                boxShadow: '0 4px 6px rgba(0, 255, 0, 0.1)',
                zIndex: 100
            }}
        >
            {/* Header */}
            <div
                style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #00ff00',
                    fontWeight: 'bold',
                    backgroundColor: '#001100'
                }}
            >
                DATA FLOW DEBUG
            </div>

            {/* Inputs Section */}
            <div style={{ borderBottom: '1px solid #003300' }}>
                <div
                    onClick={() => setInputsExpanded(!inputsExpanded)}
                    style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        backgroundColor: '#001100',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        userSelect: 'none'
                    }}
                >
                    <span>{inputsExpanded ? '▼' : '▶'}</span>
                    <span>📥 INPUTS ({inputs.length})</span>
                </div>

                {inputsExpanded && (
                    <div style={{ padding: '8px 12px' }}>
                        {inputs.length === 0 ? (
                            <div style={{ color: '#00aa00', fontStyle: 'italic' }}>
                                No sensor data
                            </div>
                        ) : (
                            inputs.map((input, index) => (
                                <div
                                    key={input.tag}
                                    style={{
                                        marginBottom: index < inputs.length - 1 ? '6px' : '0',
                                        paddingBottom: index < inputs.length - 1 ? '6px' : '0',
                                        borderBottom: index < inputs.length - 1 ? '1px solid #003300' : 'none'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontWeight: 'bold' }}>{input.tag}</span>
                                        <span
                                            style={{
                                                fontSize: '9px',
                                                color: input.source === 'test' ? '#ffaa00' : '#00aaff',
                                                border: '1px solid currentColor',
                                                borderRadius: '3px',
                                                padding: '1px 4px'
                                            }}
                                        >
                                            {input.source.toUpperCase()}
                                        </span>
                                        <span>= {formatValue(input.value)}</span>
                                        {!input.hasTarget && (
                                            <span
                                                style={{
                                                    color: '#ffaa00',
                                                    fontSize: '10px',
                                                    marginLeft: '4px'
                                                }}
                                                title="Orphaned - no output target"
                                            >
                                                ⚠️
                                            </span>
                                        )}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: '10px',
                                            color: '#00aa00',
                                            marginTop: '2px'
                                        }}
                                    >
                                        {formatTimestamp(input.lastUpdate)} | {input.updateCount} updates
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Outputs Section */}
            <div style={{ borderBottom: '1px solid #003300' }}>
                <div
                    onClick={() => setOutputsExpanded(!outputsExpanded)}
                    style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        backgroundColor: '#001100',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        userSelect: 'none'
                    }}
                >
                    <span>{outputsExpanded ? '▼' : '▶'}</span>
                    <span>📤 OUTPUTS ({outputs.length} tags)</span>
                </div>

                {outputsExpanded && (
                    <div style={{ padding: '8px 12px' }}>
                        {outputs.length === 0 ? (
                            <div style={{ color: '#00aa00', fontStyle: 'italic' }}>
                                No sensor tag bindings found
                            </div>
                        ) : (
                            outputs.map((output, index) => {
                                // Find the input value for this output tag
                                const inputData = inputs.find(i => i.tag === output.tag);
                                const currentValue = inputData ? formatValue(inputData.value) : 'null';

                                return (
                                    <div
                                        key={output.tag}
                                        style={{
                                            marginBottom: index < outputs.length - 1 ? '8px' : '0',
                                            paddingBottom: index < outputs.length - 1 ? '8px' : '0',
                                            borderBottom: index < outputs.length - 1 ? '1px solid #003300' : 'none'
                                        }}
                                    >
                                        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                                            {output.tag} = {currentValue}
                                        </div>
                                        <div style={{ fontSize: '10px', color: '#00aa00', marginLeft: '12px', marginBottom: '4px' }}>
                                            → {output.targets.length} target{output.targets.length !== 1 ? 's' : ''}:
                                        </div>
                                        {output.targets.map((target, targetIndex) => (
                                            <div
                                                key={targetIndex}
                                                style={{
                                                    marginLeft: '24px',
                                                    fontSize: '11px',
                                                    color: '#00dd00',
                                                    marginBottom: targetIndex < output.targets.length - 1 ? '3px' : '0'
                                                }}
                                            >
                                                {target.elementId ? (
                                                    <span>
                                                        [{target.elementType}:...{target.elementId.slice(-16)}].{target.propertyPath}
                                                    </span>
                                                ) : (
                                                    <span>
                                                        [background].{target.propertyPath}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>

            {/* Rive Section */}
            {riveInfo && (riveInfo.totalInputs > 0 || riveInfo.dataBindings > 0) && (
                <div style={{ borderBottom: '1px solid #003300' }}>
                    <div
                        onClick={() => setRiveExpanded(!riveExpanded)}
                        style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            backgroundColor: '#001100',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            userSelect: 'none'
                        }}
                    >
                        <span>{riveExpanded ? '▼' : '▶'}</span>
                        <span>🎨 RIVE ({riveInfo.stateMachines} SM | {riveInfo.totalInputs + riveInfo.dataBindings} bindings)</span>
                    </div>

                    {riveExpanded && (
                        <div style={{ padding: '8px 12px' }}>
                            {riveInfo.totalInputs > 0 && (
                                <div style={{ marginBottom: riveInfo.dataBindings > 0 ? '12px' : '0' }}>
                                    <div style={{
                                        fontSize: '10px',
                                        color: '#00aaff',
                                        marginBottom: '6px',
                                        fontWeight: 'bold'
                                    }}>
                                        STATE MACHINE INPUTS ({riveInfo.totalInputs}):
                                    </div>
                                    {riveInfo.inputNames.map((name, index) => (
                                        <div
                                            key={index}
                                            style={{
                                                marginLeft: '12px',
                                                fontSize: '11px',
                                                color: '#00dd00',
                                                marginBottom: index < riveInfo.inputNames.length - 1 ? '3px' : '0'
                                            }}
                                        >
                                            • {name}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {riveInfo.dataBindings > 0 && (
                                <div>
                                    <div style={{
                                        fontSize: '10px',
                                        color: '#00aaff',
                                        marginBottom: '6px',
                                        fontWeight: 'bold'
                                    }}>
                                        DATA BINDINGS ({riveInfo.dataBindings}):
                                    </div>
                                    {riveInfo.bindingNames.map((name, index) => (
                                        <div
                                            key={index}
                                            style={{
                                                marginLeft: '12px',
                                                fontSize: '11px',
                                                color: '#00dd00',
                                                marginBottom: index < riveInfo.bindingNames.length - 1 ? '3px' : '0'
                                            }}
                                        >
                                            • {name}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Stats Section - Always Visible */}
            <div
                style={{
                    padding: '8px 12px',
                    backgroundColor: '#001100',
                    fontSize: '11px',
                    fontWeight: 'bold'
                }}
            >
                📊 {stats.activeTags} active | {stats.totalBindings} bindings |{' '}
                {stats.orphanedTags > 0 && (
                    <span style={{ color: '#ffaa00' }}>
                        {stats.orphanedTags} orphan{stats.orphanedTags !== 1 ? 's' : ''} |{' '}
                    </span>
                )}
                {stats.updateRate} updates/sec
            </div>
        </div>
    );
};

export default FrameEngine2_SensorDebugPanel;
