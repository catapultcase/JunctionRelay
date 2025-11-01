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

export const ECGProperties: React.FC<ElementPropertyPanelProps> = ({
    selectedElements,
    onElementUpdate,
    expandedSections,
    onToggleSection
}) => {
    const getCommonPropertyValue = useCommonPropertyValue(selectedElements);
    const updateElementProperty = useElementPropertyUpdate(selectedElements, onElementUpdate);

    return (
        <>
            <SectionHeader
                id="ecg"
                title="ECG Settings"
                expanded={expandedSections.has('ecg')}
                onToggle={onToggleSection}
            />
            {expandedSections.has('ecg') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            SensorTag
                        </label>
                        <input
                            type="text"
                            value={getCommonPropertyValue('sensorTag')}
                            onChange={(e) => updateElementProperty('sensorTag', e.target.value)}
                            style={inputStyle}
                            placeholder="e.g., temperature-01"
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                                Y-Axis Min
                            </label>
                            <input
                                type="number"
                                value={getCommonPropertyValue('yAxisMin') || 0}
                                onChange={(e) => updateElementProperty('yAxisMin', parseFloat(e.target.value) || 0)}
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                                Y-Axis Max
                            </label>
                            <input
                                type="number"
                                value={getCommonPropertyValue('yAxisMax') || 100}
                                onChange={(e) => updateElementProperty('yAxisMax', parseFloat(e.target.value) || 100)}
                                style={inputStyle}
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Buffer Size
                        </label>
                        <input
                            type="number"
                            value={getCommonPropertyValue('bufferSize') || 200}
                            onChange={(e) => updateElementProperty('bufferSize', parseInt(e.target.value) || 200)}
                            style={inputStyle}
                            min="50"
                            max="1000"
                        />
                        <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                            Number of data points to display
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Line Thickness
                        </label>
                        <input
                            type="number"
                            value={getCommonPropertyValue('lineWidth') || 2}
                            onChange={(e) => updateElementProperty('lineWidth', parseFloat(e.target.value) || 2)}
                            style={inputStyle}
                            min="0.5"
                            max="10"
                            step="0.5"
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Grid Scroll Speed
                        </label>
                        <input
                            type="number"
                            value={getCommonPropertyValue('gridScrollSpeed') ?? 0.5}
                            onChange={(e) => updateElementProperty('gridScrollSpeed', parseFloat(e.target.value) || 0)}
                            style={inputStyle}
                            min="0"
                            max="5"
                            step="0.1"
                        />
                        <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                            0 = static, 0.5 = default, higher = faster parallax
                        </div>
                    </div>

                    <ColorInput
                        label="Waveform Color"
                        property="waveformColor"
                        defaultValue="#00ff00"
                        value={getCommonPropertyValue('waveformColor')}
                        onChange={updateElementProperty}
                    />

                    <ColorInput
                        label="Background Color"
                        property="backgroundColor"
                        defaultValue="#000000"
                        value={getCommonPropertyValue('backgroundColor')}
                        onChange={updateElementProperty}
                    />

                    <ColorInput
                        label="Grid Background Color"
                        property="gridBackgroundColor"
                        defaultValue="transparent"
                        value={getCommonPropertyValue('gridBackgroundColor')}
                        onChange={updateElementProperty}
                    />

                    <ColorInput
                        label="Grid Color"
                        property="gridColor"
                        defaultValue="rgba(0, 255, 0, 0.2)"
                        value={getCommonPropertyValue('gridColor')}
                        onChange={updateElementProperty}
                    />

                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#333' }}>
                            <input
                                type="checkbox"
                                checked={getCommonPropertyValue('showGrid') !== false}
                                onChange={(e) => updateElementProperty('showGrid', e.target.checked)}
                            />
                            Show Grid
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#333' }}>
                            <input
                                type="checkbox"
                                checked={getCommonPropertyValue('showBorder') !== false}
                                onChange={(e) => updateElementProperty('showBorder', e.target.checked)}
                            />
                            Show Border
                        </label>
                    </div>
                </div>
            )}
        </>
    );
};