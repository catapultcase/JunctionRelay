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

import React, { useState, useCallback, useEffect } from 'react';
import { useTheme } from '@mui/material/styles';
import { FrameEngine_LayoutProperties } from './FrameEngine_LayoutProperties';
import { FrameEngine_ElementList } from './FrameEngine_ElementList';
import { FrameEngine_BindingsPanel } from './FrameEngine_BindingsPanel';
import type {
    FrameLayoutConfig,
    PlacedElement,
    DiscoveredInput,
    DiscoveredStateMachine,
    DiscoveredDataBinding
} from './FrameEngine_Types';

interface FrameEngine_PropertiesPanelProps {
    layout: FrameLayoutConfig;
    selectedElements: PlacedElement[];
    onLayoutUpdate: (updates: Partial<FrameLayoutConfig>) => void;
    onElementUpdate: (elementId: string, updates: Partial<PlacedElement>) => void;
    onElementDelete: (elementId: string) => void;
    elements: PlacedElement[];
    onElementSelect: (elementIds: string[], addToSelection?: boolean) => void;
    onElementDuplicate?: (elementId: string) => void;
    onElementReorder?: (fromIndex: number, toIndex: number) => void;
    onElementVisibilityToggle: (elementId: string) => void;
    onElementLockToggle: (elementId: string) => void;
    discoveredMachines?: DiscoveredStateMachine[];
    discoveredBindings?: DiscoveredDataBinding[];
    elementRiveDiscoveries?: Record<string, {
        machines: DiscoveredStateMachine[];
        bindings: DiscoveredDataBinding[];
    }>;
}

export const FrameEngine_PropertiesPanel: React.FC<FrameEngine_PropertiesPanelProps> = ({
    layout,
    selectedElements,
    onLayoutUpdate,
    onElementUpdate,
    onElementDelete,
    elements,
    onElementSelect,
    onElementDuplicate,
    onElementReorder,
    onElementVisibilityToggle,
    onElementLockToggle,
    discoveredMachines = [],
    discoveredBindings = [],
    elementRiveDiscoveries = {},
}) => {
    const theme = useTheme();
    const [activeSection, setActiveSection] = useState<'layout' | 'element' | 'bindings'>('layout');
    const [expandedSections, setExpandedSections] = useState<Set<string>>(
        new Set([
            // Layout sections
            'basic', 'appearance', 'dimensions', 'background',
            // Element sections (same as ElementLibrary)
            'position',
            'sensor', 'sensorTypography',
            'text', 'textTypography',
            'clock', 'clockTypography',
            'ecg',
            'gauge-data', 'gauge-shape', 'gauge-display', 'gauge-colors',
            'oscilloscope',
            'tunnel',
            'weather',
            // Bindings sections
            'bindings-background', 'bindings-assets', 'bindings-sensors'
            // Note: 'visibility' is intentionally excluded - it starts collapsed
        ])
    );

    // Switch to element properties when elements are selected
    useEffect(() => {
        if (selectedElements.length > 0) {
            setActiveSection('element');
        }
    }, [selectedElements.length]);

    // Debug: Log layout changes
    useEffect(() => {
        console.log('🏗️ Main Panel - Layout updated:', {
            riveFile: layout.riveFile,
            riveStateMachine: layout.riveStateMachine,
            riveInputs: layout.riveInputs,
            sensorTestValues: layout.sensorTestValues
        });
    }, [layout.riveFile, layout.riveStateMachine, layout.riveInputs, layout.sensorTestValues]);

    // Toggle section expansion
    const toggleSection = useCallback((sectionId: string) => {
        setExpandedSections(prev => {
            const newSet = new Set(prev);
            if (newSet.has(sectionId)) {
                newSet.delete(sectionId);
            } else {
                newSet.add(sectionId);
            }
            return newSet;
        });
    }, []);

    // Theme-responsive styles
    const panelStyle = {
        width: '320px',
        backgroundColor: theme.palette.background.paper,
        borderRight: `1px solid ${theme.palette.divider}`,
        display: 'flex',
        flexDirection: 'column' as const,
        flex: 1,
        minHeight: 0,
        maxHeight: '100%'
    };

    const headerStyle = {
        padding: '16px',
        borderBottom: `1px solid ${theme.palette.divider}`
    };

    const titleStyle = {
        fontSize: '14px',
        fontWeight: 500,
        color: theme.palette.text.primary,
        margin: 0
    };

    const getButtonStyle = (isActive: boolean) => ({
        flex: 1,
        padding: '4px 12px',
        fontSize: '12px',
        border: `1px solid ${theme.palette.divider}`,
        backgroundColor: isActive
            ? (theme.palette.mode === 'dark' ? theme.palette.primary.dark : theme.palette.primary.light)
            : theme.palette.background.default,
        color: isActive ? theme.palette.primary.main : theme.palette.text.secondary,
        cursor: 'pointer',
        transition: 'all 0.2s'
    });

    const layoutButtonStyle = {
        ...getButtonStyle(activeSection === 'layout'),
        borderTopLeftRadius: '4px',
        borderBottomRightRadius: '0',
    };

    const elementButtonStyle = {
        ...getButtonStyle(activeSection === 'element'),
        borderTopRightRadius: '4px',
        borderBottomLeftRadius: '0',
    };

    const bindingsButtonStyle = {
        ...getButtonStyle(activeSection === 'bindings'),
        borderRadius: '0',
        borderBottomLeftRadius: '4px',
        borderBottomRightRadius: '4px',
        marginTop: '4px',
    };

    return (
        <div style={panelStyle}>
            {/* Header */}
            <div style={headerStyle}>
                <h3 style={titleStyle}>Layout & Elements</h3>
                <div style={{ display: 'flex', flexDirection: 'column', marginTop: '8px' }}>
                    <div style={{ display: 'flex' }}>
                        <button
                            onClick={() => setActiveSection('layout')}
                            style={layoutButtonStyle}
                            onMouseEnter={(e) => {
                                if (activeSection !== 'layout') {
                                    e.currentTarget.style.backgroundColor = theme.palette.mode === 'dark'
                                        ? theme.palette.grey[800]
                                        : theme.palette.grey[200];
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (activeSection !== 'layout') {
                                    e.currentTarget.style.backgroundColor = theme.palette.background.default;
                                }
                            }}
                        >
                            Layout
                        </button>
                        <button
                            onClick={() => setActiveSection('element')}
                            style={elementButtonStyle}
                            onMouseEnter={(e) => {
                                if (activeSection !== 'element') {
                                    e.currentTarget.style.backgroundColor = theme.palette.mode === 'dark'
                                        ? theme.palette.grey[800]
                                        : theme.palette.grey[200];
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (activeSection !== 'element') {
                                    e.currentTarget.style.backgroundColor = theme.palette.background.default;
                                }
                            }}
                        >
                            Elements {elements.length > 0 && `(${elements.length})`}
                        </button>
                    </div>
                    <button
                        onClick={() => setActiveSection('bindings')}
                        style={bindingsButtonStyle}
                        onMouseEnter={(e) => {
                            if (activeSection !== 'bindings') {
                                e.currentTarget.style.backgroundColor = theme.palette.mode === 'dark'
                                    ? theme.palette.grey[800]
                                    : theme.palette.grey[200];
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (activeSection !== 'bindings') {
                                e.currentTarget.style.backgroundColor = theme.palette.background.default;
                            }
                        }}
                    >
                        Bindings
                    </button>
                </div>
            </div>

            {/* Content */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                minHeight: 0
            }}>
                {activeSection === 'layout' ? (
                    <FrameEngine_LayoutProperties
                        layout={layout}
                        onLayoutUpdate={onLayoutUpdate}
                        expandedSections={expandedSections}
                        onToggleSection={toggleSection}
                        discoveredMachines={discoveredMachines}
                        discoveredBindings={discoveredBindings}
                    />
                ) : activeSection === 'element' ? (
                    <FrameEngine_ElementList
                        elements={elements}
                        selectedElements={selectedElements}
                        onElementSelect={onElementSelect}
                        onElementDelete={onElementDelete}
                        onElementDuplicate={onElementDuplicate}
                        onElementReorder={onElementReorder}
                        onElementVisibilityToggle={onElementVisibilityToggle}
                        onElementLockToggle={onElementLockToggle}
                    />
                ) : (
                    <FrameEngine_BindingsPanel
                        layout={layout}
                        elements={elements}
                        onLayoutUpdate={onLayoutUpdate}
                        onElementUpdate={onElementUpdate}
                        onElementSelect={onElementSelect}
                        expandedSections={expandedSections}
                        onToggleSection={toggleSection}
                        discoveredMachines={discoveredMachines}
                        discoveredBindings={discoveredBindings}
                        elementRiveDiscoveries={elementRiveDiscoveries}
                    />
                )}
            </div>
        </div>
    );
};

export default FrameEngine_PropertiesPanel;