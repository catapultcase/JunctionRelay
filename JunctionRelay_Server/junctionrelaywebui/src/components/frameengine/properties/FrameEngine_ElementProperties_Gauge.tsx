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

// Available gauge libraries - add more here as they become available
const GAUGE_LIBRARIES = [
    { value: 'mui', label: 'Material UI Gauge', description: 'Clean Material Design gauge with smooth animations' }
    // { value: 'classic', label: 'Classic Gauge', description: 'Traditional gauge with needle pointer' }
];

export const GaugeProperties: React.FC<ElementPropertyPanelProps> = ({
    selectedElements,
    onElementUpdate,
    expandedSections,
    onToggleSection
}) => {
    const getCommonPropertyValue = useCommonPropertyValue(selectedElements);
    const updateElementProperty = useElementPropertyUpdate(selectedElements, onElementUpdate);

    const gaugeLibrary = getCommonPropertyValue('gaugeLibrary') || 'mui';

    // Helper to ensure radius values have % suffix
    const handleRadiusChange = (property: string, value: string) => {
        let sanitized = value.trim();

        // If empty, allow it
        if (!sanitized) {
            updateElementProperty(property, '');
            return;
        }

        // If it's a number without %, append %
        if (!sanitized.includes('%')) {
            const num = parseFloat(sanitized);
            if (!isNaN(num)) {
                sanitized = num + '%';
            }
        }

        updateElementProperty(property, sanitized);
    };

    // Handle gauge type selection - store the type, calculate endAngle automatically
    const handleGaugeTypeChange = (type: string) => {
        selectedElements.forEach(element => {
            const currentStart = element.properties.startAngle ?? -90;
            let endAngle: number;

            if (type === 'arc') {
                // Arc: end is always start + 180
                endAngle = currentStart + 180;
            } else if (type === 'circle') {
                // Full circle: end is always start + 360
                endAngle = currentStart + 360;
            } else {
                // Custom: keep current endAngle or use default
                endAngle = element.properties.endAngle ?? 90;
            }

            onElementUpdate(element.id, {
                properties: {
                    ...element.properties,
                    gaugeAngleType: type,  // Store the type
                    startAngle: currentStart,
                    endAngle: endAngle
                }
            });
        });
    };

    // Handle start angle change - update endAngle automatically for arc/circle
    const handleStartAngleChange = (value: number) => {
        const gaugeType = getCommonPropertyValue('gaugeAngleType') || 'arc';

        selectedElements.forEach(element => {
            let endAngle: number;

            if (gaugeType === 'arc') {
                endAngle = value + 180;
            } else if (gaugeType === 'circle') {
                endAngle = value + 360;
            } else {
                // Custom: keep existing endAngle
                endAngle = element.properties.endAngle ?? 90;
            }

            onElementUpdate(element.id, {
                properties: {
                    ...element.properties,
                    startAngle: value,
                    endAngle: endAngle
                }
            });
        });
    };

    // Determine current gauge type
    const getCurrentGaugeType = () => {
        const storedType = getCommonPropertyValue('gaugeAngleType');
        if (storedType) return storedType;

        // Fallback: detect based on angles
        const start = getCommonPropertyValue('startAngle') ?? -90;
        const end = getCommonPropertyValue('endAngle') ?? 90;
        const diff = end - start;

        if (diff === 360) return 'circle';
        if (diff === 180) return 'arc';
        return 'custom';
    };

    return (
        <>
            {/* Gauge Library Selection - Only show if more than 1 option */}
            {GAUGE_LIBRARIES.length > 1 && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: '#f8f9fa' }}>
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#333',
                            marginBottom: '6px'
                        }}>
                            Gauge Library
                        </label>
                        <select
                            value={gaugeLibrary}
                            onChange={(e) => updateElementProperty('gaugeLibrary', e.target.value)}
                            style={{
                                ...inputStyle,
                                cursor: 'pointer'
                            }}
                        >
                            {GAUGE_LIBRARIES.map(lib => (
                                <option key={lib.value} value={lib.value}>{lib.label}</option>
                            ))}
                        </select>
                        <div style={{
                            fontSize: '10px',
                            color: '#666',
                            marginTop: '4px',
                            fontStyle: 'italic'
                        }}>
                            {GAUGE_LIBRARIES.find(lib => lib.value === gaugeLibrary)?.description || ''}
                        </div>
                    </div>
                </div>
            )}

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
                </div>
            )}

            {/* Gauge Shape */}
            <SectionHeader
                id="gauge-shape"
                title="Gauge Shape"
                expanded={expandedSections.has('gauge-shape')}
                onToggle={onToggleSection}
            />
            {expandedSections.has('gauge-shape') && (
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
                            value={getCommonPropertyValue('gaugeAngleType') || getCurrentGaugeType()}
                            onChange={(e) => handleGaugeTypeChange(e.target.value)}
                            style={inputStyle}
                        >
                            <option value="arc">Arc (180° span)</option>
                            <option value="circle">Full Circle (360° span)</option>
                            <option value="custom">Custom Angles</option>
                        </select>
                        <div style={{
                            fontSize: '10px',
                            color: '#666',
                            marginTop: '4px',
                            fontStyle: 'italic'
                        }}>
                            Arc & Circle: set start angle only | Custom: set both angles
                        </div>
                    </div>

                    {/* Start Angle - Always visible */}
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#333',
                            marginBottom: '6px'
                        }}>
                            Start Angle
                        </label>
                        <input
                            type="number"
                            value={getCommonPropertyValue('startAngle') ?? -90}
                            onChange={(e) => handleStartAngleChange(parseFloat(e.target.value) || 0)}
                            style={inputStyle}
                            step="1"
                        />
                        <div style={{
                            fontSize: '9px',
                            color: '#666',
                            marginTop: '2px',
                            fontStyle: 'italic'
                        }}>
                            0° = top, 90° = right, 180° = bottom, -90° = left
                        </div>
                    </div>

                    {/* End Angle - Only visible for Custom mode */}
                    {(getCommonPropertyValue('gaugeAngleType') || getCurrentGaugeType()) === 'custom' && (
                        <div>
                            <label style={{
                                display: 'block',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: '#333',
                                marginBottom: '6px'
                            }}>
                                End Angle
                            </label>
                            <input
                                type="number"
                                value={getCommonPropertyValue('endAngle') ?? 90}
                                onChange={(e) => updateElementProperty('endAngle', parseFloat(e.target.value) || 0)}
                                style={inputStyle}
                                step="1"
                            />
                            <div style={{
                                fontSize: '9px',
                                color: '#666',
                                marginTop: '2px',
                                fontStyle: 'italic'
                            }}>
                                Angle where gauge ends (can exceed 360° for multi-turn)
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                            <label style={{
                                display: 'block',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: '#333',
                                marginBottom: '6px'
                            }}>
                                Inner Radius
                            </label>
                            <input
                                type="text"
                                value={getCommonPropertyValue('innerRadius') || '70%'}
                                onChange={(e) => handleRadiusChange('innerRadius', e.target.value)}
                                style={inputStyle}
                                placeholder="70%"
                            />
                            <div style={{
                                fontSize: '9px',
                                color: '#666',
                                marginTop: '2px',
                                fontStyle: 'italic'
                            }}>
                                Arc thickness (0-100%)
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
                                Outer Radius
                            </label>
                            <input
                                type="text"
                                value={getCommonPropertyValue('outerRadius') || '100%'}
                                onChange={(e) => handleRadiusChange('outerRadius', e.target.value)}
                                style={inputStyle}
                                placeholder="100%"
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
                            Corner Radius
                        </label>
                        <input
                            type="text"
                            value={getCommonPropertyValue('cornerRadius') || '50%'}
                            onChange={(e) => handleRadiusChange('cornerRadius', e.target.value)}
                            style={inputStyle}
                            placeholder="50%"
                        />
                        <div style={{
                            fontSize: '10px',
                            color: '#666',
                            marginTop: '4px',
                            fontStyle: 'italic'
                        }}>
                            50% for fully rounded ends, 0% for square ends
                        </div>
                    </div>
                </div>
            )}

            {/* Center Value Display */}
            <SectionHeader
                id="gauge-display"
                title="Center Value Display"
                expanded={expandedSections.has('gauge-display')}
                onToggle={onToggleSection}
            />
            {expandedSections.has('gauge-display') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{
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
                                checked={getCommonPropertyValue('showValue') !== false}
                                onChange={(e) => updateElementProperty('showValue', e.target.checked)}
                                style={{ cursor: 'pointer' }}
                            />
                            <span style={{ fontWeight: 500 }}>Show Center Value</span>
                        </label>
                    </div>

                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#333',
                            marginBottom: '6px'
                        }}>
                            Value Label Suffix
                        </label>
                        <input
                            type="text"
                            value={getCommonPropertyValue('valueLabel') || ''}
                            onChange={(e) => updateElementProperty('valueLabel', e.target.value)}
                            style={inputStyle}
                            placeholder="e.g., °F, %, RPM"
                        />
                        <div style={{
                            fontSize: '10px',
                            color: '#666',
                            marginTop: '4px',
                            fontStyle: 'italic'
                        }}>
                            Text displayed after the value (e.g., "75°F")
                        </div>
                    </div>

                    <ColorInput
                        label="Text Color"
                        property="textColor"
                        defaultValue="#333333"
                        value={getCommonPropertyValue('textColor')}
                        onChange={updateElementProperty}
                    />

                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#333',
                            marginBottom: '6px'
                        }}>
                            Font Family
                        </label>
                        <select
                            value={getCommonPropertyValue('textFontFamily') || 'Roboto, sans-serif'}
                            onChange={(e) => updateElementProperty('textFontFamily', e.target.value)}
                            style={inputStyle}
                        >
                            <option value="Roboto, sans-serif">Roboto</option>
                            <option value="Inter, sans-serif">Inter</option>
                            <option value="Arial, sans-serif">Arial</option>
                            <option value="'Courier New', monospace">Courier New</option>
                            <option value="Georgia, serif">Georgia</option>
                            <option value="'Times New Roman', serif">Times New Roman</option>
                            <option value="Verdana, sans-serif">Verdana</option>
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
                                Font Size (px)
                            </label>
                            <input
                                type="number"
                                value={getCommonPropertyValue('textFontSize') || 0}
                                onChange={(e) => updateElementProperty('textFontSize', parseFloat(e.target.value) || 0)}
                                style={inputStyle}
                                min="0"
                                max="200"
                                placeholder="Auto"
                            />
                            <div style={{
                                fontSize: '9px',
                                color: '#666',
                                marginTop: '2px',
                                fontStyle: 'italic'
                            }}>
                                0 for auto-sizing
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
                                Font Weight
                            </label>
                            <select
                                value={getCommonPropertyValue('textFontWeight') || 600}
                                onChange={(e) => updateElementProperty('textFontWeight', parseInt(e.target.value))}
                                style={inputStyle}
                            >
                                <option value="300">Light (300)</option>
                                <option value="400">Normal (400)</option>
                                <option value="500">Medium (500)</option>
                                <option value="600">Semi-Bold (600)</option>
                                <option value="700">Bold (700)</option>
                                <option value="900">Black (900)</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* Arc Colors */}
            <SectionHeader
                id="gauge-colors"
                title="Arc Colors"
                expanded={expandedSections.has('gauge-colors')}
                onToggle={onToggleSection}
            />
            {expandedSections.has('gauge-colors') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <ColorInput
                        label="Value Arc Color (Fill)"
                        property="gaugeColor"
                        defaultValue="#2196f3"
                        value={getCommonPropertyValue('gaugeColor')}
                        onChange={updateElementProperty}
                    />

                    <ColorInput
                        label="Reference Arc Color (Background)"
                        property="referenceArcColor"
                        defaultValue="#e0e0e0"
                        value={getCommonPropertyValue('referenceArcColor')}
                        onChange={updateElementProperty}
                    />

                    <ColorInput
                        label="Container Background"
                        property="backgroundColor"
                        defaultValue="transparent"
                        value={getCommonPropertyValue('backgroundColor')}
                        onChange={updateElementProperty}
                    />

                    <div style={{
                        fontSize: '10px',
                        color: '#666',
                        padding: '8px',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '4px',
                        fontStyle: 'italic'
                    }}>
                        Value Arc = filled portion showing current value<br />
                        Reference Arc = unfilled background portion
                    </div>
                </div>
            )}

            {/* Library Attribution */}
            <div style={{ padding: '12px' }}>
                <LibraryAttribution libraries={[{
                    name: '@mui/x-charts',
                    url: 'https://mui.com/x/react-charts/',
                    license: 'MIT'
                }]} />
            </div>
        </>
    );
};
