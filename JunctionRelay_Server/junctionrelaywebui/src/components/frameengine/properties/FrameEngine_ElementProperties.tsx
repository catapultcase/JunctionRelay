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

import React, { useCallback } from 'react';
import type { PlacedElement } from '../FrameEngine_Types';
import type { BaseElementPropertiesProps } from '../properties/FrameEngine_ElementProperties_Types';
import { inputStyle } from '../properties/FrameEngine_ElementProperties_Types';
import { SectionHeader, VisibilityControl, useElementTransformUpdate } from '../properties/FrameEngine_ElementProperties_Shared';
import { SensorProperties } from '../properties/FrameEngine_ElementProperties_Sensor';
import { TextProperties } from '../properties/FrameEngine_ElementProperties_Text';
import { ECGProperties } from '../properties/FrameEngine_ElementProperties_ECG';
import { ClockProperties } from '../properties/FrameEngine_ElementProperties_Clock';
import { OscilloscopeProperties } from '../properties/FrameEngine_ElementProperties_Oscilloscope';
import { TunnelProperties } from '../properties/FrameEngine_ElementProperties_Tunnel';
import { WeatherProperties } from '../properties/FrameEngine_ElementProperties_Weather';
import { AssetImageProperties } from '../properties/FrameEngine_ElementProperties_AssetImage';
import { AssetVideoProperties } from '../properties/FrameEngine_ElementProperties_AssetVideo';
import { AssetRiveProperties } from '../properties/FrameEngine_ElementProperties_AssetRive';

export const FrameEngine_ElementProperties: React.FC<BaseElementPropertiesProps> = ({
    selectedElements,
    onElementUpdate,
    onElementDelete,
    expandedSections,
    onToggleSection,
}) => {
    const updateElementTransform = useElementTransformUpdate(selectedElements, onElementUpdate);

    const deleteSelectedElements = useCallback(() => {
        selectedElements.forEach(element => {
            onElementDelete(element.id);
        });
    }, [selectedElements, onElementDelete]);

    const getCommonPropertyValue = useCallback((property: string): any => {
        if (selectedElements.length === 0) return '';
        const firstValue = selectedElements[0].properties[property];
        const allSame = selectedElements.every(el => el.properties[property] === firstValue);
        return allSame ? firstValue : '';
    }, [selectedElements]);

    const updateElementProperty = useCallback((property: string, value: any) => {
        selectedElements.forEach(element => {
            onElementUpdate(element.id, {
                properties: { ...element.properties, [property]: value }
            });
        });
    }, [selectedElements, onElementUpdate]);

    if (selectedElements.length === 0) {
        return (
            <div style={{
                padding: '16px',
                textAlign: 'center',
                color: '#999',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center'
            }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>👆</div>
                <div style={{ fontSize: '12px' }}>Select an element to edit its properties</div>
            </div>
        );
    }

    const multipleSelected = selectedElements.length > 1;
    const firstElement = selectedElements[0];

    // Route to the appropriate property panel based on element type
    const renderElementSpecificProperties = () => {
        const props = {
            selectedElements,
            onElementUpdate,
            onElementDelete,
            expandedSections,
            onToggleSection
        };

        switch (firstElement.type) {
            case 'sensor':
                return <SensorProperties {...props} />;
            case 'text':
                return <TextProperties {...props} />;
            case 'ecg':
                return <ECGProperties {...props} />;
            case 'clock':
                return <ClockProperties {...props} />;
            case 'oscilloscope':
                return <OscilloscopeProperties {...props} />;
            case 'tunnel':
                return <TunnelProperties {...props} />;
            case 'weather':
                return <WeatherProperties {...props} />;
            case 'asset-image':
                return <AssetImageProperties {...props} />;
            case 'asset-video':
                return <AssetVideoProperties {...props} />;
            case 'asset-rive':
                return <AssetRiveProperties {...props} />;
            default:
                return null;
        }
    };

    return (
        <div style={{
            height: '100%',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <div style={{
                padding: '12px',
                backgroundColor: '#e3f2fd',
                borderBottom: '1px solid #bbdefb',
                flexShrink: 0
            }}>
                <div style={{ fontSize: '12px', fontWeight: 500, color: '#1976d2' }}>
                    {multipleSelected ? `${selectedElements.length} elements selected` : `${firstElement.type} element`}
                </div>
                {!multipleSelected && (
                    <div style={{ fontSize: '12px', color: '#1976d2', marginTop: '4px' }}>
                        ID: {firstElement.id.split('_')[1]}
                    </div>
                )}
            </div>

            <div style={{
                flex: 1,
                overflowY: 'auto',
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '1px'
            }}>
                {/* Position & Size - Common to all elements */}
                <SectionHeader
                    id="position"
                    title="Position & Size"
                    expanded={expandedSections.has('position')}
                    onToggle={onToggleSection}
                />
                {expandedSections.has('position') && (
                    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>X Position</label>
                                <input
                                    type="number"
                                    value={multipleSelected ? '' : firstElement.x}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => {
                                        const value = parseFloat(e.target.value);
                                        if (!isNaN(value)) {
                                            updateElementTransform({ x: Math.round(value * 100) / 100 });
                                        }
                                    }}
                                    style={inputStyle}
                                    placeholder={multipleSelected ? 'Mixed' : ''}
                                    step="0.01"
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>Y Position</label>
                                <input
                                    type="number"
                                    value={multipleSelected ? '' : firstElement.y}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => {
                                        const value = parseFloat(e.target.value);
                                        if (!isNaN(value)) {
                                            updateElementTransform({ y: Math.round(value * 100) / 100 });
                                        }
                                    }}
                                    style={inputStyle}
                                    placeholder={multipleSelected ? 'Mixed' : ''}
                                    step="0.01"
                                />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>Width</label>
                                <input
                                    type="number"
                                    value={multipleSelected ? '' : firstElement.width}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => {
                                        const value = parseFloat(e.target.value);
                                        if (!isNaN(value) && value > 0) {
                                            updateElementTransform({ width: Math.round(value * 100) / 100 });
                                        }
                                    }}
                                    style={inputStyle}
                                    placeholder={multipleSelected ? 'Mixed' : ''}
                                    step="0.01"
                                    min="0.01"
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>Height</label>
                                <input
                                    type="number"
                                    value={multipleSelected ? '' : firstElement.height}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => {
                                        const value = parseFloat(e.target.value);
                                        if (!isNaN(value) && value > 0) {
                                            updateElementTransform({ height: Math.round(value * 100) / 100 });
                                        }
                                    }}
                                    style={inputStyle}
                                    placeholder={multipleSelected ? 'Mixed' : ''}
                                    step="0.01"
                                    min="0.01"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Element-specific properties */}
                {renderElementSpecificProperties()}

                {/* Visibility Control - Common to all elements */}
                <VisibilityControl
                    expanded={expandedSections.has('visibility')}
                    onToggle={onToggleSection}
                    getValue={getCommonPropertyValue}
                    onChange={updateElementProperty}
                />

                {/* Delete button */}
                <div style={{ padding: '12px', borderTop: '1px solid #e0e0e0', marginTop: 'auto' }}>
                    <button
                        onClick={deleteSelectedElements}
                        style={{
                            width: '100%',
                            padding: '8px 12px',
                            fontSize: '12px',
                            backgroundColor: '#ffebee',
                            color: '#c62828',
                            border: '1px solid #c62828',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ffcdd2'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffebee'}
                    >
                        Delete Selected ({selectedElements.length})
                    </button>
                </div>
            </div>
        </div>
    );
};