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

export const OscilloscopeProperties: React.FC<ElementPropertyPanelProps> = ({
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
                id="oscilloscope"
                title="Oscilloscope Settings"
                expanded={expandedSections.has('oscilloscope')}
                onToggle={onToggleSection}
            />
            {expandedSections.has('oscilloscope') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            SensorTag
                        </label>
                        <input
                            type="text"
                            value={getCommonPropertyValue('sensorTag') || ''}
                            onChange={(e) => updateElementProperty('sensorTag', e.target.value)}
                            style={inputStyle}
                            placeholder="Optional - leave empty for synthetic waveform"
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Display Mode
                        </label>
                        <select
                            value={getCommonPropertyValue('mode') || 'glow'}
                            onChange={(e) => updateElementProperty('mode', e.target.value)}
                            style={inputStyle}
                        >
                            <option value="line">Line</option>
                            <option value="dots">Dots</option>
                            <option value="glow">Glow</option>
                            <option value="filled">Filled</option>
                            <option value="dual">Dual Trace</option>
                            <option value="lissajous">Lissajous (X-Y)</option>
                            <option value="spectrum">Spectrum Analyzer</option>
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Phosphor Decay: {(getCommonPropertyValue('phosphorDecay') || 0.95).toFixed(2)}
                        </label>
                        <input
                            type="range"
                            min="0.8"
                            max="1"
                            step="0.01"
                            value={getCommonPropertyValue('phosphorDecay') || 0.95}
                            onChange={(e) => updateElementProperty('phosphorDecay', parseFloat(e.target.value))}
                            style={{ width: '100%' }}
                        />
                        <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                            Lower values create longer trails
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Glow Intensity: {getCommonPropertyValue('glowIntensity') || 3}
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="10"
                            step="1"
                            value={getCommonPropertyValue('glowIntensity') || 3}
                            onChange={(e) => updateElementProperty('glowIntensity', parseInt(e.target.value))}
                            style={{ width: '100%' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Frequency: {(getCommonPropertyValue('frequency') || 0.05).toFixed(3)}
                        </label>
                        <input
                            type="range"
                            min="0.01"
                            max="0.2"
                            step="0.01"
                            value={getCommonPropertyValue('frequency') || 0.05}
                            onChange={(e) => updateElementProperty('frequency', parseFloat(e.target.value))}
                            style={{ width: '100%' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Harmonics: {getCommonPropertyValue('harmonics') || 0}
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="5"
                            step="1"
                            value={getCommonPropertyValue('harmonics') || 0}
                            onChange={(e) => updateElementProperty('harmonics', parseInt(e.target.value))}
                            style={{ width: '100%' }}
                        />
                        <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                            Adds overtones for complex waveforms
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Symmetry: {(getCommonPropertyValue('symmetry') || 0).toFixed(2)}
                        </label>
                        <input
                            type="range"
                            min="-1"
                            max="1"
                            step="0.1"
                            value={getCommonPropertyValue('symmetry') || 0}
                            onChange={(e) => updateElementProperty('symmetry', parseFloat(e.target.value))}
                            style={{ width: '100%' }}
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

                    <ColorInput
                        label="Waveform Color"
                        property="waveformColor"
                        defaultValue="#00ff00"
                        value={getCommonPropertyValue('waveformColor')}
                        onChange={updateElementProperty}
                    />

                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#333' }}>
                            <input
                                type="checkbox"
                                checked={getCommonPropertyValue('showTrigger') || false}
                                onChange={(e) => updateElementProperty('showTrigger', e.target.checked)}
                            />
                            Show Trigger
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#333' }}>
                            <input
                                type="checkbox"
                                checked={getCommonPropertyValue('showGrid') !== false}
                                onChange={(e) => updateElementProperty('showGrid', e.target.checked)}
                            />
                            Show Grid
                        </label>
                    </div>
                </div>
            )}
        </>
    );
};