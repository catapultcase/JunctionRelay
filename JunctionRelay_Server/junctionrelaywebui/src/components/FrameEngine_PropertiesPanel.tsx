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
import { FrameEngine_LayoutProperties } from './FrameEngine_LayoutProperties';
import { FrameEngine_ElementList } from './FrameEngine_ElementList';
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
    discoveredMachines?: DiscoveredStateMachine[];
    discoveredBindings?: DiscoveredDataBinding[];
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
    discoveredMachines = [],
    discoveredBindings = [],
}) => {
    const [activeSection, setActiveSection] = useState<'layout' | 'element'>('layout');
    const [expandedSections, setExpandedSections] = useState<Set<string>>(
        new Set(['basic', 'position', 'appearance', 'dimensions', 'background', 'sensor', 'sensorTypography', 'text', 'textTypography', 'clockTypography'])
    );

    // Handle element visibility toggle
    const handleElementVisibilityToggle = useCallback((elementId: string) => {
        const element = elements.find(el => el.id === elementId);
        if (element) {
            onElementUpdate(elementId, { visible: !(element.visible ?? true) });
        }
    }, [elements, onElementUpdate]);

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
            riveInputs: layout.riveInputs
        });
    }, [layout.riveFile, layout.riveStateMachine, layout.riveInputs]);

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

    // Common styles
    const panelStyle = {
        width: '320px',
        backgroundColor: '#fff',
        borderRight: '1px solid #e0e0e0',
        display: 'flex',
        flexDirection: 'column' as const,
        flex: 1,
        minHeight: 0,
        maxHeight: '100%'
    };

    return (
        <div style={panelStyle}>
            {/* Header */}
            <div style={{ padding: '16px', borderBottom: '1px solid #e0e0e0' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 500, color: '#333', margin: 0 }}>Layout & Elements</h3>
                <div style={{ display: 'flex', marginTop: '8px' }}>
                    <button
                        onClick={() => setActiveSection('layout')}
                        style={{
                            flex: 1,
                            padding: '4px 12px',
                            fontSize: '12px',
                            borderTopLeftRadius: '4px',
                            borderBottomLeftRadius: '4px',
                            border: '1px solid #ccc',
                            backgroundColor: activeSection === 'layout' ? '#e3f2fd' : '#f5f5f5',
                            color: activeSection === 'layout' ? '#1976d2' : '#666',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            if (activeSection !== 'layout') {
                                e.currentTarget.style.backgroundColor = '#eeeeee';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (activeSection !== 'layout') {
                                e.currentTarget.style.backgroundColor = '#f5f5f5';
                            }
                        }}
                    >
                        Layout
                    </button>
                    <button
                        onClick={() => setActiveSection('element')}
                        style={{
                            flex: 1,
                            padding: '4px 12px',
                            fontSize: '12px',
                            borderTopRightRadius: '4px',
                            borderBottomRightRadius: '4px',
                            borderTop: '1px solid #ccc',
                            borderRight: '1px solid #ccc',
                            borderBottom: '1px solid #ccc',
                            backgroundColor: activeSection === 'element' ? '#e3f2fd' : '#f5f5f5',
                            color: activeSection === 'element' ? '#1976d2' : '#666',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            if (activeSection !== 'element') {
                                e.currentTarget.style.backgroundColor = '#eeeeee';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (activeSection !== 'element') {
                                e.currentTarget.style.backgroundColor = '#f5f5f5';
                            }
                        }}
                    >
                        Elements {elements.length > 0 && `(${elements.length})`}
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
                ) : (
                    <FrameEngine_ElementList
                        elements={elements}
                        selectedElements={selectedElements}
                        onElementSelect={onElementSelect}
                        onElementDelete={onElementDelete}
                        onElementDuplicate={onElementDuplicate}
                        onElementReorder={onElementReorder}
                        onElementVisibilityToggle={handleElementVisibilityToggle}
                    />
                )}
            </div>
        </div>
    );
};

export default FrameEngine_PropertiesPanel;