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
import { googleFonts } from './GoogleFonts';
import type { PlacedElement } from './FrameEngine_Types';

interface FrameEngine_ElementPropertiesProps {
    selectedElements: PlacedElement[];
    onElementUpdate: (elementId: string, updates: Partial<PlacedElement>) => void;
    onElementDelete: (elementId: string) => void;
    expandedSections: Set<string>;
    onToggleSection: (sectionId: string) => void;
}

interface FrameEngine_ElementPropertiesProps {
    selectedElements: PlacedElement[];
    onElementUpdate: (elementId: string, updates: Partial<PlacedElement>) => void;
    onElementDelete: (elementId: string) => void;
    expandedSections: Set<string>;
    onToggleSection: (sectionId: string) => void;
}

export const FrameEngine_ElementProperties: React.FC<FrameEngine_ElementPropertiesProps> = ({
    selectedElements,
    onElementUpdate,
    onElementDelete,
    expandedSections,
    onToggleSection,
}) => {
    const updateElementProperty = useCallback((property: string, value: any) => {
        selectedElements.forEach(element => {
            onElementUpdate(element.id, {
                properties: { ...element.properties, [property]: value }
            });
        });
    }, [selectedElements, onElementUpdate]);

    const updateElementTransform = useCallback((updates: Partial<Pick<PlacedElement, 'x' | 'y' | 'width' | 'height'>>) => {
        selectedElements.forEach(element => {
            onElementUpdate(element.id, updates);
        });
    }, [selectedElements, onElementUpdate]);

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

    const sectionHeaderStyle = {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px',
        textAlign: 'left' as const,
        backgroundColor: '#f5f5f5',
        border: 'none',
        borderBottom: '1px solid #e0e0e0',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: 500,
        color: '#333',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px'
    };

    const inputStyle = {
        width: '100%',
        padding: '4px 8px',
        fontSize: '12px',
        border: '1px solid #ccc',
        borderRadius: '4px',
        outline: 'none'
    };

    const renderSectionHeader = (id: string, title: string) => (
        <button
            onClick={() => onToggleSection(id)}
            style={sectionHeaderStyle}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#eeeeee'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
        >
            <span>{title}</span>
            <span style={{ color: '#666' }}>{expandedSections.has(id) ? '−' : '+'}</span>
        </button>
    );

    const renderColorInput = (label: string, property: string, defaultValue: string, placeholder?: string) => (
        <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                {label}
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
                <input
                    type="color"
                    value={getCommonPropertyValue(property) || defaultValue}
                    onChange={(e) => updateElementProperty(property, e.target.value)}
                    style={{ width: '48px', height: '32px', border: '1px solid #ccc', borderRadius: '4px' }}
                />
                <input
                    type="text"
                    value={getCommonPropertyValue(property) || defaultValue}
                    onChange={(e) => updateElementProperty(property, e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder={placeholder || defaultValue}
                />
            </div>
        </div>
    );

    const renderTypographyControls = (prefix: string = '') => (
        <>
            <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                    Font Family
                </label>
                <select
                    value={getCommonPropertyValue('fontFamily') || 'Inter'}
                    onChange={(e) => updateElementProperty('fontFamily', e.target.value)}
                    style={inputStyle}
                >
                    {googleFonts.map(font => (
                        <option key={font} value={font}>{font}</option>
                    ))}
                </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                        Font Size
                    </label>
                    <input
                        type="number"
                        value={getCommonPropertyValue('fontSize') || 12}
                        onChange={(e) => updateElementProperty('fontSize', parseInt(e.target.value) || 12)}
                        style={inputStyle}
                        min="8"
                        max="72"
                    />
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                        Font Weight
                    </label>
                    <select
                        value={getCommonPropertyValue('fontWeight') || 'normal'}
                        onChange={(e) => updateElementProperty('fontWeight', e.target.value)}
                        style={inputStyle}
                    >
                        <option value="100">Thin (100)</option>
                        <option value="200">Extra Light (200)</option>
                        <option value="300">Light (300)</option>
                        <option value="normal">Normal (400)</option>
                        <option value="500">Medium (500)</option>
                        <option value="600">Semi Bold (600)</option>
                        <option value="bold">Bold (700)</option>
                        <option value="800">Extra Bold (800)</option>
                        <option value="900">Black (900)</option>
                    </select>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                        Horizontal Align
                    </label>
                    <select
                        value={getCommonPropertyValue('textAlign') || 'left'}
                        onChange={(e) => updateElementProperty('textAlign', e.target.value)}
                        style={inputStyle}
                    >
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                    </select>
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                        Vertical Align
                    </label>
                    <select
                        value={getCommonPropertyValue('verticalAlign') || 'center'}
                        onChange={(e) => updateElementProperty('verticalAlign', e.target.value)}
                        style={inputStyle}
                    >
                        <option value="top">Top</option>
                        <option value="center">Center</option>
                        <option value="bottom">Bottom</option>
                    </select>
                </div>
            </div>

            <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                    Line Height
                </label>
                <select
                    value={getCommonPropertyValue('lineHeight') || '1.4'}
                    onChange={(e) => updateElementProperty('lineHeight', e.target.value)}
                    style={inputStyle}
                >
                    <option value="1">Tight (1.0)</option>
                    <option value="1.2">Snug (1.2)</option>
                    <option value="1.4">Normal (1.4)</option>
                    <option value="1.6">Relaxed (1.6)</option>
                    <option value="2">Loose (2.0)</option>
                </select>
            </div>

            {renderColorInput('Text Color', 'color', '#000000')}
            {renderColorInput('Background Color', 'backgroundColor', '#e3f2fd')}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                    type="checkbox"
                    id={`${prefix}textShadow`}
                    checked={getCommonPropertyValue('textShadow') || false}
                    onChange={(e) => updateElementProperty('textShadow', e.target.checked)}
                />
                <label htmlFor={`${prefix}textShadow`} style={{ fontSize: '12px', color: '#333' }}>
                    Text Shadow
                </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                    type="checkbox"
                    id={`${prefix}textBorder`}
                    checked={getCommonPropertyValue('textBorder') || false}
                    onChange={(e) => updateElementProperty('textBorder', e.target.checked)}
                />
                <label htmlFor={`${prefix}textBorder`} style={{ fontSize: '12px', color: '#333' }}>
                    Text Outline
                </label>
            </div>
        </>
    );

    const renderVisibilityControl = () => (
        <>
            {renderSectionHeader('visibility', 'Visibility Control')}
            {expandedSections.has('visibility') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: '#f9f9f9' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Visibility SensorTag
                        </label>
                        <input
                            type="text"
                            value={getCommonPropertyValue('visibilitySensorTag') || ''}
                            onChange={(e) => updateElementProperty('visibilitySensorTag', e.target.value)}
                            style={inputStyle}
                            placeholder="Optional - leave empty for always visible"
                        />
                        <div style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
                            Element shows when sensor value is true/non-zero. Leave empty to always show.
                        </div>
                    </div>
                </div>
            )}
        </>
    );

    const renderOscilloscopeProperties = () => (
        <>
            {renderSectionHeader('oscilloscope', 'Oscilloscope Settings')}
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

                    {renderColorInput('Waveform Color', 'waveformColor', '#00ff00')}

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

    const renderTunnelProperties = () => (
        <>
            {renderSectionHeader('tunnel', 'Tunnel Settings')}
            {expandedSections.has('tunnel') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Render Mode Selector */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Render Mode
                        </label>
                        <select
                            value={getCommonPropertyValue('renderMode') || '2d'}
                            onChange={(e) => updateElementProperty('renderMode', e.target.value)}
                            style={inputStyle}
                        >
                            <option value="2d">2D Canvas (High Compatibility)</option>
                            <option value="3d">3D WebGL (Advanced Features)</option>
                        </select>
                        <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                            2D mode works everywhere, 3D enables depth fade effects
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Tunnel Type
                        </label>
                        <select
                            value={getCommonPropertyValue('tunnelType') || 'circular'}
                            onChange={(e) => updateElementProperty('tunnelType', e.target.value)}
                            style={inputStyle}
                        >
                            <option value="circular">Circular</option>
                            <option value="square">Square</option>
                            <option value="hexagon">Hexagon</option>
                            <option value="star">Star</option>
                            <option value="spiral">Spiral</option>
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Speed: {(getCommonPropertyValue('speed') || 1).toFixed(1)}
                        </label>
                        <input
                            type="range"
                            min="0.1"
                            max="5"
                            step="0.1"
                            value={getCommonPropertyValue('speed') || 1}
                            onChange={(e) => updateElementProperty('speed', parseFloat(e.target.value))}
                            style={{ width: '100%' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Rotation: {(getCommonPropertyValue('rotation') || 0.5).toFixed(1)}
                        </label>
                        <input
                            type="range"
                            min="-5"
                            max="5"
                            step="0.1"
                            value={getCommonPropertyValue('rotation') || 0.5}
                            onChange={(e) => updateElementProperty('rotation', parseFloat(e.target.value))}
                            style={{ width: '100%' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Twist: {(getCommonPropertyValue('twist') || 0).toFixed(1)}
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="10"
                            step="0.1"
                            value={getCommonPropertyValue('twist') || 0}
                            onChange={(e) => updateElementProperty('twist', parseFloat(e.target.value))}
                            style={{ width: '100%' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Depth: {getCommonPropertyValue('depth') || 20}
                        </label>
                        <input
                            type="range"
                            min="5"
                            max="50"
                            step="1"
                            value={getCommonPropertyValue('depth') || 20}
                            onChange={(e) => updateElementProperty('depth', parseInt(e.target.value))}
                            style={{ width: '100%' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Line Thickness: {(getCommonPropertyValue('lineWidth') || 2).toFixed(1)}
                        </label>
                        <input
                            type="range"
                            min="0.5"
                            max="10"
                            step="0.5"
                            value={getCommonPropertyValue('lineWidth') || 2}
                            onChange={(e) => updateElementProperty('lineWidth', parseFloat(e.target.value))}
                            style={{ width: '100%' }}
                        />
                        <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                            Thickness of tunnel lines
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Ring Spacing: {getCommonPropertyValue('ringSpacing') || 5}
                        </label>
                        <input
                            type="range"
                            min="1"
                            max="20"
                            step="1"
                            value={getCommonPropertyValue('ringSpacing') || 5}
                            onChange={(e) => updateElementProperty('ringSpacing', parseInt(e.target.value))}
                            style={{ width: '100%' }}
                        />
                        <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                            Space between tunnel rings
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Perspective: {(getCommonPropertyValue('perspective') || 1).toFixed(2)}
                        </label>
                        <input
                            type="range"
                            min="0.5"
                            max="2"
                            step="0.1"
                            value={getCommonPropertyValue('perspective') || 1}
                            onChange={(e) => updateElementProperty('perspective', parseFloat(e.target.value))}
                            style={{ width: '100%' }}
                        />
                        <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                            Perspective distortion (0.5 = wide angle, 2 = telephoto)
                        </div>
                    </div>

                    <div style={{
                        backgroundColor: '#fff3e0',
                        padding: '12px',
                        borderRadius: '4px',
                        border: '1px solid #ffcc80',
                        marginTop: '8px'
                    }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#e65100', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Pulse Effect
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#333' }}>
                                <input
                                    type="checkbox"
                                    checked={getCommonPropertyValue('enablePulse') !== false}
                                    onChange={(e) => updateElementProperty('enablePulse', e.target.checked)}
                                />
                                Enable Pulse
                            </label>

                            {getCommonPropertyValue('enablePulse') !== false && (
                                <>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                                            Pulse Speed: {(getCommonPropertyValue('pulseSpeed') || 1).toFixed(1)}
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="5"
                                            step="0.1"
                                            value={getCommonPropertyValue('pulseSpeed') || 1}
                                            onChange={(e) => updateElementProperty('pulseSpeed', parseFloat(e.target.value))}
                                            style={{ width: '100%' }}
                                        />
                                        <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                                            0 = static, higher = faster pulsing
                                        </div>
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                                            Pulse Amount: {(getCommonPropertyValue('pulseAmount') || 0.2).toFixed(2)}
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.05"
                                            value={getCommonPropertyValue('pulseAmount') || 0.2}
                                            onChange={(e) => updateElementProperty('pulseAmount', parseFloat(e.target.value))}
                                            style={{ width: '100%' }}
                                        />
                                        <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                                            How much the tunnel expands/contracts
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div style={{
                        backgroundColor: '#f0f8ff',
                        padding: '12px',
                        borderRadius: '4px',
                        border: '1px solid #b3d9ff',
                        marginTop: '8px'
                    }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#0066cc', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            3D Curve Controls
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                                    Horizontal Curve: {(getCommonPropertyValue('curveTargetX') || 0).toFixed(2)}
                                </label>
                                <input
                                    type="range"
                                    min="-1"
                                    max="1"
                                    step="0.01"
                                    value={getCommonPropertyValue('curveTargetX') || 0}
                                    onChange={(e) => updateElementProperty('curveTargetX', parseFloat(e.target.value))}
                                    style={{ width: '100%' }}
                                />
                                <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                                    -1 = left, 0 = straight, 1 = right
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                                    Vertical Curve: {(getCommonPropertyValue('curveTargetY') || 0).toFixed(2)}
                                </label>
                                <input
                                    type="range"
                                    min="-1"
                                    max="1"
                                    step="0.01"
                                    value={getCommonPropertyValue('curveTargetY') || 0}
                                    onChange={(e) => updateElementProperty('curveTargetY', parseFloat(e.target.value))}
                                    style={{ width: '100%' }}
                                />
                                <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                                    -1 = up, 0 = straight, 1 = down
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                                    Curve Strength: {(getCommonPropertyValue('curveStrength') || 1).toFixed(2)}
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="2"
                                    step="0.01"
                                    value={getCommonPropertyValue('curveStrength') || 1}
                                    onChange={(e) => updateElementProperty('curveStrength', parseFloat(e.target.value))}
                                    style={{ width: '100%' }}
                                />
                                <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                                    How much the tunnel curves
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                                    Banking: {(getCommonPropertyValue('banking') || 0.5).toFixed(2)}
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={getCommonPropertyValue('banking') || 0.5}
                                    onChange={(e) => updateElementProperty('banking', parseFloat(e.target.value))}
                                    style={{ width: '100%' }}
                                />
                                <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                                    How much tunnel rolls into curves
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                                    Pitch: {(getCommonPropertyValue('pitch') || 0).toFixed(2)}
                                </label>
                                <input
                                    type="range"
                                    min="-1"
                                    max="1"
                                    step="0.01"
                                    value={getCommonPropertyValue('pitch') || 0}
                                    onChange={(e) => updateElementProperty('pitch', parseFloat(e.target.value))}
                                    style={{ width: '100%' }}
                                />
                                <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                                    -1 = looking down, 0 = level, 1 = looking up
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                                    Origin X: {(getCommonPropertyValue('originX') || 0.5).toFixed(2)}
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={getCommonPropertyValue('originX') || 0.5}
                                    onChange={(e) => updateElementProperty('originX', parseFloat(e.target.value))}
                                    style={{ width: '100%' }}
                                />
                                <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                                    0 = left edge, 0.5 = center, 1 = right edge
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                                    Origin Y: {(getCommonPropertyValue('originY') || 0.5).toFixed(2)}
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={getCommonPropertyValue('originY') || 0.5}
                                    onChange={(e) => updateElementProperty('originY', parseFloat(e.target.value))}
                                    style={{ width: '100%' }}
                                />
                                <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                                    0 = top edge, 0.5 = center, 1 = bottom edge
                                </div>
                            </div>
                        </div>
                    </div>

                    {renderColorInput('Primary Color', 'primaryColor', '#ff00ff')}
                    {renderColorInput('Secondary Color', 'secondaryColor', '#00ffff')}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#333' }}>
                            <input
                                type="checkbox"
                                checked={getCommonPropertyValue('scanlines') !== false}
                                onChange={(e) => updateElementProperty('scanlines', e.target.checked)}
                            />
                            Scanlines
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#333' }}>
                            <input
                                type="checkbox"
                                checked={getCommonPropertyValue('chromatic') || false}
                                onChange={(e) => updateElementProperty('chromatic', e.target.checked)}
                            />
                            Chromatic Aberration
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#333' }}>
                            <input
                                type="checkbox"
                                checked={getCommonPropertyValue('pixelate') || false}
                                onChange={(e) => updateElementProperty('pixelate', e.target.checked)}
                            />
                            Pixelate
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#333' }}>
                            <input
                                type="checkbox"
                                checked={getCommonPropertyValue('colorCycle') || false}
                                onChange={(e) => updateElementProperty('colorCycle', e.target.checked)}
                            />
                            Color Cycle
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#333' }}>
                            <input
                                type="checkbox"
                                checked={getCommonPropertyValue('depthFade') || false}
                                onChange={(e) => updateElementProperty('depthFade', e.target.checked)}
                            />
                            Depth Fade
                        </label>
                        {getCommonPropertyValue('depthFade') && (
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                                    Fade End
                                </label>
                                <select
                                    value={getCommonPropertyValue('fadeEnd') || 'back'}
                                    onChange={(e) => updateElementProperty('fadeEnd', e.target.value)}
                                    style={inputStyle}
                                >
                                    <option value="back">Back (Far)</option>
                                    <option value="front">Front (Near)</option>
                                </select>
                                <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                                    Which end of the tunnel fades out
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );

    const renderWeatherProperties = () => (
        <>
            {renderSectionHeader('weather', 'Weather Settings')}
            {expandedSections.has('weather') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Weather Type
                        </label>
                        <select
                            value={getCommonPropertyValue('weatherType') || 'clear'}
                            onChange={(e) => updateElementProperty('weatherType', e.target.value)}
                            style={inputStyle}
                        >
                            <option value="clear">Clear</option>
                            <option value="cloudy">Cloudy</option>
                            <option value="rainy">Rainy</option>
                            <option value="snowy">Snowy</option>
                            <option value="stormy">Stormy</option>
                            <option value="foggy">Foggy</option>
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Time of Day
                        </label>
                        <select
                            value={getCommonPropertyValue('timeOfDay') || 'day'}
                            onChange={(e) => updateElementProperty('timeOfDay', e.target.value)}
                            style={inputStyle}
                        >
                            <option value="day">Day</option>
                            <option value="sunset">Sunset</option>
                            <option value="night">Night</option>
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Cloud Density: {(getCommonPropertyValue('cloudDensity') ?? 0.5).toFixed(1)}
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={getCommonPropertyValue('cloudDensity') ?? 0.5}
                            onChange={(e) => updateElementProperty('cloudDensity', parseFloat(e.target.value))}
                            style={{ width: '100%' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Animation Speed: {(getCommonPropertyValue('animationSpeed') ?? 1).toFixed(1)}
                        </label>
                        <input
                            type="range"
                            min="0.1"
                            max="3"
                            step="0.1"
                            value={getCommonPropertyValue('animationSpeed') ?? 1}
                            onChange={(e) => updateElementProperty('animationSpeed', parseFloat(e.target.value))}
                            style={{ width: '100%' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Particle Count: {getCommonPropertyValue('particleCount') ?? 500}
                        </label>
                        <input
                            type="range"
                            min="100"
                            max="1000"
                            step="100"
                            value={getCommonPropertyValue('particleCount') ?? 500}
                            onChange={(e) => updateElementProperty('particleCount', parseInt(e.target.value))}
                            style={{ width: '100%' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Camera Angle: {getCommonPropertyValue('cameraAngle') ?? 30}°
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="60"
                            step="5"
                            value={getCommonPropertyValue('cameraAngle') ?? 30}
                            onChange={(e) => updateElementProperty('cameraAngle', parseInt(e.target.value))}
                            style={{ width: '100%' }}
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                            type="checkbox"
                            id="showStars"
                            checked={getCommonPropertyValue('showStars') !== false}
                            onChange={(e) => updateElementProperty('showStars', e.target.checked)}
                        />
                        <label htmlFor="showStars" style={{ fontSize: '12px', color: '#333' }}>
                            Show Stars (Night Only)
                        </label>
                    </div>

                    {renderColorInput('Background Color', 'backgroundColor', '#000000', 'transparent')}
                </div>
            )}
        </>
    );

    const renderClockProperties = () => (
        <>
            {renderSectionHeader('clock', 'Clock Settings')}
            {expandedSections.has('clock') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Time Format
                        </label>
                        <select
                            value={getCommonPropertyValue('timeFormat') || '12h'}
                            onChange={(e) => updateElementProperty('timeFormat', e.target.value)}
                            style={inputStyle}
                        >
                            <option value="12h">12-hour (AM/PM)</option>
                            <option value="24h">24-hour</option>
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Timezone
                        </label>
                        <select
                            value={getCommonPropertyValue('timezone') || 'America/Chicago'}
                            onChange={(e) => updateElementProperty('timezone', e.target.value)}
                            style={inputStyle}
                        >
                            <option value="America/New_York">Eastern (US)</option>
                            <option value="America/Chicago">Central (US)</option>
                            <option value="America/Denver">Mountain (US)</option>
                            <option value="America/Los_Angeles">Pacific (US)</option>
                            <option value="America/Anchorage">Alaska</option>
                            <option value="Pacific/Honolulu">Hawaii</option>
                            <option value="Europe/London">London</option>
                            <option value="Europe/Paris">Paris</option>
                            <option value="Asia/Tokyo">Tokyo</option>
                            <option value="Australia/Sydney">Sydney</option>
                            <option value="UTC">UTC</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#333' }}>
                            <input
                                type="checkbox"
                                checked={getCommonPropertyValue('showSeconds') !== false}
                                onChange={(e) => updateElementProperty('showSeconds', e.target.checked)}
                            />
                            Show Seconds
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#333' }}>
                            <input
                                type="checkbox"
                                checked={getCommonPropertyValue('showDate') || false}
                                onChange={(e) => updateElementProperty('showDate', e.target.checked)}
                            />
                            Show Date
                        </label>
                    </div>
                </div>
            )}

            {renderSectionHeader('clockTypography', 'Clock Typography')}
            {expandedSections.has('clockTypography') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {renderTypographyControls('clock')}
                </div>
            )}
        </>
    );

    const renderECGProperties = () => (
        <>
            {renderSectionHeader('ecg', 'ECG Settings')}
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

                    {renderColorInput('Waveform Color', 'waveformColor', '#00ff00')}
                    {renderColorInput('Background Color', 'backgroundColor', '#000000')}

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

    const renderSensorProperties = () => (
        <>
            {renderSectionHeader('sensor', 'Sensor Settings')}
            {expandedSections.has('sensor') && (
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
                            placeholder="e.g., temperature-01, humidity-main"
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Placeholder Sensor Label
                        </label>
                        <input
                            type="text"
                            value={getCommonPropertyValue('placeholderSensorLabel')}
                            onChange={(e) => updateElementProperty('placeholderSensorLabel', e.target.value)}
                            style={inputStyle}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Placeholder Value
                        </label>
                        <input
                            type="text"
                            value={getCommonPropertyValue('placeholderValue')}
                            onChange={(e) => updateElementProperty('placeholderValue', e.target.value)}
                            style={inputStyle}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Placeholder Unit
                        </label>
                        <input
                            type="text"
                            value={getCommonPropertyValue('placeholderUnit')}
                            onChange={(e) => updateElementProperty('placeholderUnit', e.target.value)}
                            style={inputStyle}
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                        <label htmlFor="showLabel" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#333' }}>
                            <input
                                type="checkbox"
                                id="showLabel"
                                checked={getCommonPropertyValue('showLabel') || false}
                                onChange={(e) => updateElementProperty('showLabel', e.target.checked)}
                            />
                            Show Label
                        </label>

                        <label htmlFor="showUnit" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#333' }}>
                            <input
                                type="checkbox"
                                id="showUnit"
                                checked={getCommonPropertyValue('showUnit') || false}
                                onChange={(e) => updateElementProperty('showUnit', e.target.checked)}
                            />
                            Show Unit
                        </label>
                    </div>
                </div>
            )}

            {renderSectionHeader('sensorTypography', 'Sensor Typography')}
            {expandedSections.has('sensorTypography') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {renderTypographyControls('sensor')}
                </div>
            )}
        </>
    );

    const renderTextProperties = () => (
        <>
            {renderSectionHeader('text', 'Text Settings')}
            {expandedSections.has('text') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Text Content
                        </label>
                        <textarea
                            value={getCommonPropertyValue('text')}
                            onChange={(e) => updateElementProperty('text', e.target.value)}
                            rows={2}
                            style={inputStyle}
                        />
                    </div>
                </div>
            )}

            {renderSectionHeader('textTypography', 'Text Typography')}
            {expandedSections.has('textTypography') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {renderTypographyControls('text')}
                </div>
            )}
        </>
    );

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
                {renderSectionHeader('position', 'Position & Size')}
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

                {firstElement.type === 'sensor' && renderSensorProperties()}
                {firstElement.type === 'text' && renderTextProperties()}
                {firstElement.type === 'ecg' && renderECGProperties()}
                {firstElement.type === 'clock' && renderClockProperties()}
                {firstElement.type === 'oscilloscope' && renderOscilloscopeProperties()}
                {firstElement.type === 'tunnel' && renderTunnelProperties()}
                {firstElement.type === 'weather' && renderWeatherProperties()}

                {renderVisibilityControl()}

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