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

export const WeatherProperties: React.FC<ElementPropertyPanelProps> = ({
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
                id="weather"
                title="Weather Settings"
                expanded={expandedSections.has('weather')}
                onToggle={onToggleSection}
            />
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

                    <ColorInput
                        label="Background Color"
                        property="backgroundColor"
                        defaultValue="#000000"
                        placeholder="transparent"
                        value={getCommonPropertyValue('backgroundColor')}
                        onChange={updateElementProperty}
                    />
                </div>
            )}
        </>
    );
};