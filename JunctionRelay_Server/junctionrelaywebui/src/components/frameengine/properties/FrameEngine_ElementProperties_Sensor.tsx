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
    TypographyControls,
    useCommonPropertyValue,
    useElementPropertyUpdate
} from './FrameEngine_ElementProperties_Shared';

export const SensorProperties: React.FC<ElementPropertyPanelProps> = ({
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
                id="sensor"
                title="Sensor Settings"
                expanded={expandedSections.has('sensor')}
                onToggle={onToggleSection}
            />
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

            <SectionHeader
                id="sensorTypography"
                title="Sensor Typography"
                expanded={expandedSections.has('sensorTypography')}
                onToggle={onToggleSection}
            />
            {expandedSections.has('sensorTypography') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <TypographyControls
                        prefix="sensor"
                        getValue={getCommonPropertyValue}
                        onChange={updateElementProperty}
                    />
                </div>
            )}
        </>
    );
};