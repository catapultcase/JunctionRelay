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

import React from 'react';
import type { ElementPropertyPanelProps } from './FrameEngine_ElementProperties_Types';
import { inputStyle } from './FrameEngine_ElementProperties_Types';
import {
    SectionHeader,
    ColorInput,
    useCommonPropertyValue,
    useElementPropertyUpdate
} from './FrameEngine_ElementProperties_Shared';
import { LibraryAttribution } from './FrameEngine_ElementProperties_Attribution';

export const GaugeProperties: React.FC<ElementPropertyPanelProps> = ({
    selectedElements,
    onElementUpdate,
    expandedSections,
    onToggleSection
}) => {
    const getCommonPropertyValue = useCommonPropertyValue(selectedElements);
    const updateElementProperty = useElementPropertyUpdate(selectedElements, onElementUpdate);

    return (
        <>
            {/* Data Source */}
            <SectionHeader
                id="gauge-data"
                title="Data Source"
                expanded={expandedSections.has('gauge-data')}
                onToggle={onToggleSection}
            />
            {expandedSections.has('gauge-data') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#333',
                            marginBottom: '6px'
                        }}>
                            Sensor Tag
                        </label>
                        <input
                            type="text"
                            value={getCommonPropertyValue('sensorTag')}
                            onChange={(e) => updateElementProperty('sensorTag', e.target.value)}
                            style={inputStyle}
                            placeholder="e.g., temperature-01"
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                            <label style={{
                                display: 'block',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: '#333',
                                marginBottom: '6px'
                            }}>
                                Min Value
                            </label>
                            <input
                                type="number"
                                value={getCommonPropertyValue('minValue') ?? 0}
                                onChange={(e) => updateElementProperty('minValue', parseFloat(e.target.value) || 0)}
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label style={{
                                display: 'block',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: '#333',
                                marginBottom: '6px'
                            }}>
                                Max Value
                            </label>
                            <input
                                type="number"
                                value={getCommonPropertyValue('maxValue') ?? 100}
                                onChange={(e) => updateElementProperty('maxValue', parseFloat(e.target.value) || 100)}
                                style={inputStyle}
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#333',
                            marginBottom: '6px'
                        }}>
                            Value Label
                        </label>
                        <input
                            type="text"
                            value={getCommonPropertyValue('valueLabel') || ''}
                            onChange={(e) => updateElementProperty('valueLabel', e.target.value)}
                            style={inputStyle}
                            placeholder="Leave empty for numeric value"
                        />
                        <div style={{
                            fontSize: '10px',
                            color: '#666',
                            marginTop: '4px',
                            fontStyle: 'italic'
                        }}>
                            Example: "75°F" or "85%"
                        </div>
                    </div>
                </div>
            )}

            {/* Gauge Style */}
            <SectionHeader
                id="gauge-style"
                title="Gauge Style"
                expanded={expandedSections.has('gauge-style')}
                onToggle={onToggleSection}
            />
            {expandedSections.has('gauge-style') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#333',
                            marginBottom: '6px'
                        }}>
                            Gauge Type
                        </label>
                        <select
                            value={getCommonPropertyValue('gaugeType') || 'semicircle'}
                            onChange={(e) => updateElementProperty('gaugeType', e.target.value)}
                            style={inputStyle}
                        >
                            <option value="semicircle">Semicircle</option>
                            <option value="radial">Radial (Full Circle)</option>
                        </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                            <label style={{
                                display: 'block',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: '#333',
                                marginBottom: '6px'
                            }}>
                                Arc Width
                            </label>
                            <input
                                type="number"
                                value={getCommonPropertyValue('arcWidth') ?? 0.2}
                                onChange={(e) => updateElementProperty('arcWidth', parseFloat(e.target.value) || 0.2)}
                                style={inputStyle}
                                min="0.05"
                                max="0.5"
                                step="0.05"
                            />
                        </div>
                        <div>
                            <label style={{
                                display: 'block',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: '#333',
                                marginBottom: '6px'
                            }}>
                                Arc Padding
                            </label>
                            <input
                                type="number"
                                value={getCommonPropertyValue('arcPadding') ?? 0.02}
                                onChange={(e) => updateElementProperty('arcPadding', parseFloat(e.target.value) || 0.02)}
                                style={inputStyle}
                                min="0"
                                max="0.1"
                                step="0.01"
                            />
                            <div style={{
                                fontSize: '9px',
                                color: '#666',
                                marginTop: '2px',
                                fontStyle: 'italic'
                            }}>
                                Space between color zones
                            </div>
                        </div>
                    </div>

                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#333',
                            marginBottom: '6px'
                        }}>
                            Corner Radius
                        </label>
                        <input
                            type="number"
                            value={getCommonPropertyValue('cornerRadius') ?? 5}
                            onChange={(e) => updateElementProperty('cornerRadius', parseFloat(e.target.value) || 0)}
                            style={inputStyle}
                            min="0"
                            max="20"
                        />
                    </div>

                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        padding: '10px',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '6px',
                    }}>
                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '12px',
                            color: '#333',
                            cursor: 'pointer',
                        }}>
                            <input
                                type="checkbox"
                                checked={getCommonPropertyValue('showLabels') !== false}
                                onChange={(e) => updateElementProperty('showLabels', e.target.checked)}
                                style={{ cursor: 'pointer' }}
                            />
                            <span style={{ fontWeight: 500 }}>Show Scale Labels</span>
                        </label>

                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '12px',
                            color: '#333',
                            cursor: 'pointer',
                        }}>
                            <input
                                type="checkbox"
                                checked={getCommonPropertyValue('showTicks') !== false}
                                onChange={(e) => updateElementProperty('showTicks', e.target.checked)}
                                style={{ cursor: 'pointer' }}
                            />
                            <span style={{ fontWeight: 500 }}>Show Tick Marks</span>
                        </label>
                    </div>
                </div>
            )}

            {/* Pointer */}
            <SectionHeader
                id="gauge-pointer"
                title="Pointer"
                expanded={expandedSections.has('gauge-pointer')}
                onToggle={onToggleSection}
            />
            {expandedSections.has('gauge-pointer') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#333',
                            marginBottom: '6px'
                        }}>
                            Pointer Type
                        </label>
                        <select
                            value={getCommonPropertyValue('pointerType') || 'needle'}
                            onChange={(e) => updateElementProperty('pointerType', e.target.value)}
                            style={inputStyle}
                        >
                            <option value="needle">Needle</option>
                            <option value="blob">Blob</option>
                            <option value="arrow">Arrow</option>
                        </select>
                    </div>

                    <ColorInput
                        label="Pointer Color"
                        property="pointerColor"
                        defaultValue="#464A4F"
                        value={getCommonPropertyValue('pointerColor')}
                        onChange={updateElementProperty}
                    />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                            <label style={{
                                display: 'block',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: '#333',
                                marginBottom: '6px'
                            }}>
                                Length (0-1)
                            </label>
                            <input
                                type="number"
                                value={getCommonPropertyValue('pointerLength') ?? 0.7}
                                onChange={(e) => updateElementProperty('pointerLength', parseFloat(e.target.value) || 0.7)}
                                style={inputStyle}
                                min="0.3"
                                max="1"
                                step="0.05"
                            />
                        </div>
                        <div>
                            <label style={{
                                display: 'block',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: '#333',
                                marginBottom: '6px'
                            }}>
                                Width (px)
                            </label>
                            <input
                                type="number"
                                value={getCommonPropertyValue('pointerWidth') ?? 15}
                                onChange={(e) => updateElementProperty('pointerWidth', parseFloat(e.target.value) || 15)}
                                style={inputStyle}
                                min="5"
                                max="30"
                            />
                        </div>
                    </div>

                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        padding: '10px',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '6px',
                    }}>
                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '12px',
                            color: '#333',
                            cursor: 'pointer',
                        }}>
                            <input
                                type="checkbox"
                                checked={getCommonPropertyValue('pointerElastic') !== false}
                                onChange={(e) => updateElementProperty('pointerElastic', e.target.checked)}
                                style={{ cursor: 'pointer' }}
                            />
                            <span style={{ fontWeight: 500 }}>Elastic Animation (Bounce)</span>
                        </label>

                        <div>
                            <label style={{
                                display: 'block',
                                fontSize: '11px',
                                fontWeight: 600,
                                color: '#333',
                                marginBottom: '4px'
                            }}>
                                Animation Delay (ms)
                            </label>
                            <input
                                type="number"
                                value={getCommonPropertyValue('pointerAnimationDelay') ?? 0}
                                onChange={(e) => updateElementProperty('pointerAnimationDelay', parseInt(e.target.value) || 0)}
                                style={{...inputStyle, fontSize: '11px'}}
                                min="0"
                                max="2000"
                                step="100"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Colors */}
            <SectionHeader
                id="gauge-colors"
                title="Label Colors"
                expanded={expandedSections.has('gauge-colors')}
                onToggle={onToggleSection}
            />
            {expandedSections.has('gauge-colors') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <ColorInput
                        label="Value Label Color"
                        property="valueLabelColor"
                        defaultValue="#333"
                        value={getCommonPropertyValue('valueLabelColor')}
                        onChange={updateElementProperty}
                    />

                    <ColorInput
                        label="Tick Label Color"
                        property="tickLabelColor"
                        defaultValue="#666"
                        value={getCommonPropertyValue('tickLabelColor')}
                        onChange={updateElementProperty}
                    />
                </div>
            )}

            {/* Library Attribution */}
            <div style={{ padding: '12px' }}>
                <LibraryAttribution libraries={[{
                    name: 'react-gauge-component',
                    url: 'https://github.com/antoniolago/react-gauge-component',
                    license: 'MIT'
                }]} />
            </div>
        </>
    );
};
