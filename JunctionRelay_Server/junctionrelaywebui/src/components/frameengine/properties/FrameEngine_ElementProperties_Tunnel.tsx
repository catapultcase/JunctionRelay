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

export const TunnelProperties: React.FC<ElementPropertyPanelProps> = ({
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
                id="tunnel"
                title="Tunnel Settings"
                expanded={expandedSections.has('tunnel')}
                onToggle={onToggleSection}
            />
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

                    <ColorInput
                        label="Primary Color"
                        property="primaryColor"
                        defaultValue="#ff00ff"
                        value={getCommonPropertyValue('primaryColor')}
                        onChange={updateElementProperty}
                    />

                    <ColorInput
                        label="Secondary Color"
                        property="secondaryColor"
                        defaultValue="#00ffff"
                        value={getCommonPropertyValue('secondaryColor')}
                        onChange={updateElementProperty}
                    />

                    <ColorInput
                        label="Background Color"
                        property="backgroundColor"
                        defaultValue="#000000"
                        placeholder="transparent"
                        value={getCommonPropertyValue('backgroundColor')}
                        onChange={updateElementProperty}
                    />

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
};