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

import React, { useMemo } from 'react';
import { useTheme } from '@mui/material/styles';
import { ModernRiveBindings } from './FrameEngine_ModernRiveBindings';
import type {
    FrameLayoutConfig,
    PlacedElement,
    DiscoveredStateMachine,
    DiscoveredDataBinding
} from './FrameEngine_Types';

interface FrameEngine_BindingsPanelProps {
    layout: FrameLayoutConfig;
    elements: PlacedElement[];
    onLayoutUpdate: (updates: Partial<FrameLayoutConfig>) => void;
    onElementUpdate: (elementId: string, updates: Partial<PlacedElement>) => void;
    onElementSelect: (elementIds: string[], addToSelection?: boolean) => void;
    expandedSections: Set<string>;
    onToggleSection: (sectionId: string) => void;
    discoveredMachines?: DiscoveredStateMachine[];
    discoveredBindings?: DiscoveredDataBinding[];
    elementRiveDiscoveries?: Record<string, {
        machines: DiscoveredStateMachine[];
        bindings: DiscoveredDataBinding[];
    }>;
}

export const FrameEngine_BindingsPanel: React.FC<FrameEngine_BindingsPanelProps> = ({
    layout,
    elements,
    onLayoutUpdate,
    onElementUpdate,
    onElementSelect,
    expandedSections,
    onToggleSection,
    discoveredMachines = [],
    discoveredBindings = [],
    elementRiveDiscoveries = {},
}) => {
    const theme = useTheme();

    // Collect all sensor tag inputs from elements
    const sensorInputs = useMemo(() => {
        const inputs: Array<{
            elementId: string;
            elementType: string;
            sensorTag: string;
            elementName?: string;
        }> = [];

        elements.forEach((element) => {
            const sensorTag = element.properties.sensorTag;
            if (sensorTag) {
                inputs.push({
                    elementId: element.id,
                    elementType: element.type,
                    sensorTag: sensorTag,
                    elementName: element.properties.placeholderSensorLabel || element.properties.name
                });
            }
        });

        return inputs;
    }, [elements]);

    // Collect all asset-rive elements
    const riveAssetElements = useMemo(() => {
        return elements.filter((element) => element.type === 'asset-rive');
    }, [elements]);

    // Handlers for background rive bindings
    const handleRiveInputChange = (inputName: string, value: any) => {
        const currentInputs = layout.riveInputs || {};
        onLayoutUpdate({
            riveInputs: { ...currentInputs, [inputName]: value }
        });
    };

    const handleRiveBindingChange = (bindingName: string, value: any) => {
        const currentBindings = layout.riveBindings || {};
        onLayoutUpdate({
            riveBindings: { ...currentBindings, [bindingName]: value }
        });
    };

    // Styles
    const sectionHeaderStyle: React.CSSProperties = {
        padding: '12px 16px',
        backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100],
        borderBottom: `1px solid ${theme.palette.divider}`,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        userSelect: 'none',
    };

    const sectionTitleStyle: React.CSSProperties = {
        fontSize: '13px',
        fontWeight: 600,
        color: theme.palette.text.primary,
        margin: 0,
    };

    const sectionContentStyle: React.CSSProperties = {
        padding: '12px',
        borderBottom: `1px solid ${theme.palette.divider}`,
    };

    const emptyMessageStyle: React.CSSProperties = {
        fontSize: '12px',
        color: theme.palette.text.secondary,
        fontStyle: 'italic',
        textAlign: 'center',
        padding: '8px',
    };

    const sensorItemStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px',
        marginBottom: '6px',
        backgroundColor: theme.palette.background.default,
        borderRadius: '4px',
        border: `1px solid ${theme.palette.divider}`,
        fontSize: '12px',
    };

    const badgeStyle: React.CSSProperties = {
        fontSize: '10px',
        padding: '2px 6px',
        borderRadius: '3px',
        backgroundColor: theme.palette.primary.main,
        color: theme.palette.primary.contrastText,
        fontWeight: 500,
    };

    const jumpButtonStyle: React.CSSProperties = {
        fontSize: '11px',
        padding: '4px 8px',
        borderRadius: '3px',
        border: `1px solid ${theme.palette.divider}`,
        backgroundColor: theme.palette.background.paper,
        color: theme.palette.text.primary,
        cursor: 'pointer',
        transition: 'all 0.2s',
    };

    return (
        <div>
            {/* Background Rive Bindings Section */}
            <div>
                <div
                    style={sectionHeaderStyle}
                    onClick={() => onToggleSection('bindings-background')}
                >
                    <h4 style={sectionTitleStyle}>
                        Background Rive Bindings
                        {layout.backgroundType === 'rive' && layout.riveFile && (
                            <span style={{ ...badgeStyle, marginLeft: '8px' }}>
                                {discoveredMachines.length + discoveredBindings.length}
                            </span>
                        )}
                    </h4>
                    <span style={{ color: theme.palette.text.secondary }}>
                        {expandedSections.has('bindings-background') ? '▼' : '▶'}
                    </span>
                </div>
                {expandedSections.has('bindings-background') && (
                    <div style={sectionContentStyle}>
                        {layout.backgroundType === 'rive' && layout.riveFile ? (
                            <ModernRiveBindings
                                discoveredMachines={discoveredMachines}
                                discoveredBindings={discoveredBindings}
                                riveFile={layout.riveFile}
                                layout={layout}
                                onInputChange={handleRiveInputChange}
                                onBindingChange={handleRiveBindingChange}
                            />
                        ) : (
                            <div style={emptyMessageStyle}>
                                No Rive background configured. Set a Rive file in the Layout tab.
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Asset Rive Bindings Section */}
            <div>
                <div
                    style={sectionHeaderStyle}
                    onClick={() => onToggleSection('bindings-assets')}
                >
                    <h4 style={sectionTitleStyle}>
                        Asset Rive Bindings
                        {riveAssetElements.length > 0 && (
                            <span style={{ ...badgeStyle, marginLeft: '8px' }}>
                                {riveAssetElements.length}
                            </span>
                        )}
                    </h4>
                    <span style={{ color: theme.palette.text.secondary }}>
                        {expandedSections.has('bindings-assets') ? '▼' : '▶'}
                    </span>
                </div>
                {expandedSections.has('bindings-assets') && (
                    <div style={sectionContentStyle}>
                        {riveAssetElements.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {riveAssetElements.map((element) => {
                                    const elementDiscovery = elementRiveDiscoveries[element.id];
                                    const discoveredElementMachines = elementDiscovery?.machines || [];
                                    const discoveredElementBindings = elementDiscovery?.bindings || [];

                                    return (
                                        <div
                                            key={element.id}
                                            style={{
                                                padding: '12px',
                                                backgroundColor: theme.palette.background.default,
                                                borderRadius: '6px',
                                                border: `1px solid ${theme.palette.divider}`,
                                            }}
                                        >
                                            {/* Element Header */}
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                marginBottom: '12px',
                                                paddingBottom: '8px',
                                                borderBottom: `1px solid ${theme.palette.divider}`,
                                            }}>
                                                <div>
                                                    <div style={{
                                                        fontSize: '12px',
                                                        fontWeight: 600,
                                                        color: theme.palette.text.primary,
                                                        marginBottom: '4px',
                                                    }}>
                                                        {element.properties.name || `Rive Asset ${element.id.slice(0, 6)}`}
                                                    </div>
                                                    {element.properties.assetRiveFile && (
                                                        <div style={{
                                                            fontSize: '10px',
                                                            color: theme.palette.text.secondary,
                                                        }}>
                                                            {element.properties.assetRiveFile}
                                                        </div>
                                                    )}
                                                </div>
                                                <button
                                                    style={jumpButtonStyle}
                                                    onClick={() => onElementSelect([element.id])}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.backgroundColor = theme.palette.mode === 'dark'
                                                            ? theme.palette.grey[700]
                                                            : theme.palette.grey[200];
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.backgroundColor = theme.palette.background.paper;
                                                    }}
                                                >
                                                    Select
                                                </button>
                                            </div>

                                            {/* Bindings Controls */}
                                            {element.properties.assetRiveFile ? (
                                                <ModernRiveBindings
                                                    discoveredMachines={discoveredElementMachines}
                                                    discoveredBindings={discoveredElementBindings}
                                                    riveFile={element.properties.assetRiveFile}
                                                    layout={{
                                                        riveInputs: element.properties.riveInputs,
                                                        riveBindings: element.properties.riveBindings,
                                                    }}
                                                    onInputChange={(inputName, value) => {
                                                        const currentInputs = element.properties.riveInputs || {};
                                                        onElementUpdate(element.id, {
                                                            properties: {
                                                                ...element.properties,
                                                                riveInputs: { ...currentInputs, [inputName]: value }
                                                            }
                                                        });
                                                    }}
                                                    onBindingChange={(bindingName, value) => {
                                                        const currentBindings = element.properties.riveBindings || {};
                                                        onElementUpdate(element.id, {
                                                            properties: {
                                                                ...element.properties,
                                                                riveBindings: { ...currentBindings, [bindingName]: value }
                                                            }
                                                        });
                                                    }}
                                                />
                                            ) : (
                                                <div style={emptyMessageStyle}>
                                                    No Rive file configured. Configure in the properties panel.
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div style={emptyMessageStyle}>
                                No Rive asset elements in this layout. Add from the Elements tab.
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Sensor Tag Inputs Section */}
            <div>
                <div
                    style={sectionHeaderStyle}
                    onClick={() => onToggleSection('bindings-sensors')}
                >
                    <h4 style={sectionTitleStyle}>
                        Sensor Tag Inputs
                        {sensorInputs.length > 0 && (
                            <span style={{ ...badgeStyle, marginLeft: '8px' }}>
                                {sensorInputs.length}
                            </span>
                        )}
                    </h4>
                    <span style={{ color: theme.palette.text.secondary }}>
                        {expandedSections.has('bindings-sensors') ? '▼' : '▶'}
                    </span>
                </div>
                {expandedSections.has('bindings-sensors') && (
                    <div style={sectionContentStyle}>
                        {sensorInputs.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {sensorInputs.map((input) => (
                                    <div key={input.elementId} style={sensorItemStyle}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontWeight: 600,
                                                marginBottom: '2px',
                                                color: theme.palette.text.primary,
                                                overflow: 'visible',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {input.elementType.charAt(0).toUpperCase() + input.elementType.slice(1).replace(/-/g, ' ')}: {input.elementName || 'element'}
                                            </div>
                                            <div style={{
                                                fontSize: '11px',
                                                color: theme.palette.text.secondary,
                                            }}>
                                                <span style={{ opacity: 0.7 }}>Tag:</span> {input.sensorTag}
                                            </div>
                                        </div>
                                        <button
                                            style={jumpButtonStyle}
                                            onClick={() => onElementSelect([input.elementId])}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.backgroundColor = theme.palette.mode === 'dark'
                                                    ? theme.palette.grey[700]
                                                    : theme.palette.grey[200];
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.backgroundColor = theme.palette.background.paper;
                                            }}
                                        >
                                            Select
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={emptyMessageStyle}>
                                No sensor inputs found. Add sensor, gauge, ECG, or oscilloscope elements from the Elements tab.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default FrameEngine_BindingsPanel;
