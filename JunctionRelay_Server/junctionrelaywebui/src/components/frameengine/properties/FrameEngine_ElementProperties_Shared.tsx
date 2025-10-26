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
import { googleFonts } from '../GoogleFonts';
import type { PlacedElement } from '../FrameEngine_Types';
import { inputStyle, sectionHeaderStyle } from './FrameEngine_ElementProperties_Types';

interface SectionHeaderProps {
    id: string;
    title: string;
    expanded: boolean;
    onToggle: (id: string) => void;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ id, title, expanded, onToggle }) => (
    <button
        onClick={() => onToggle(id)}
        style={sectionHeaderStyle}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#eeeeee'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
    >
        <span>{title}</span>
        <span style={{ color: '#666' }}>{expanded ? '−' : '+'}</span>
    </button>
);

interface ColorInputProps {
    label: string;
    property: string;
    defaultValue: string;
    placeholder?: string;
    value: any;
    onChange: (property: string, value: any) => void;
}

export const ColorInput: React.FC<ColorInputProps> = ({
    label,
    property,
    defaultValue,
    placeholder,
    value,
    onChange
}) => {
    // Only use hex colors for color input (it doesn't support "transparent" or other color names)
    const isValidHexColor = (color: string) => /^#[0-9A-F]{6}$/i.test(color);
    const colorInputValue = isValidHexColor(value) ? value : (isValidHexColor(defaultValue) ? defaultValue : '#000000');

    return (
        <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                {label}
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
                <input
                    type="color"
                    value={colorInputValue}
                    onChange={(e) => onChange(property, e.target.value)}
                    style={{ width: '48px', height: '32px', border: '1px solid #ccc', borderRadius: '4px' }}
                />
                <input
                    type="text"
                    value={value || defaultValue}
                    onChange={(e) => onChange(property, e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder={placeholder || defaultValue}
                />
            </div>
        </div>
    );
};

interface TypographyControlsProps {
    prefix?: string;
    getValue: (property: string) => any;
    onChange: (property: string, value: any) => void;
}

export const TypographyControls: React.FC<TypographyControlsProps> = ({
    prefix = '',
    getValue,
    onChange
}) => (
    <>
        <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                Font Family
            </label>
            <select
                value={getValue('fontFamily') || 'Inter'}
                onChange={(e) => onChange('fontFamily', e.target.value)}
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
                    value={getValue('fontSize') || 12}
                    onChange={(e) => onChange('fontSize', parseInt(e.target.value) || 12)}
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
                    value={getValue('fontWeight') || 'normal'}
                    onChange={(e) => onChange('fontWeight', e.target.value)}
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
                    value={getValue('textAlign') || 'left'}
                    onChange={(e) => onChange('textAlign', e.target.value)}
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
                    value={getValue('verticalAlign') || 'center'}
                    onChange={(e) => onChange('verticalAlign', e.target.value)}
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
                value={getValue('lineHeight') || '1.4'}
                onChange={(e) => onChange('lineHeight', e.target.value)}
                style={inputStyle}
            >
                <option value="1">Tight (1.0)</option>
                <option value="1.2">Snug (1.2)</option>
                <option value="1.4">Normal (1.4)</option>
                <option value="1.6">Relaxed (1.6)</option>
                <option value="2">Loose (2.0)</option>
            </select>
        </div>

        <ColorInput
            label="Text Color"
            property="color"
            defaultValue="#000000"
            value={getValue('color')}
            onChange={onChange}
        />

        <ColorInput
            label="Background Color"
            property="backgroundColor"
            defaultValue="#e3f2fd"
            value={getValue('backgroundColor')}
            onChange={onChange}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
                type="checkbox"
                id={`${prefix}textShadow`}
                checked={getValue('textShadow') || false}
                onChange={(e) => onChange('textShadow', e.target.checked)}
            />
            <label htmlFor={`${prefix}textShadow`} style={{ fontSize: '12px', color: '#333' }}>
                Text Shadow
            </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
                type="checkbox"
                id={`${prefix}textBorder`}
                checked={getValue('textBorder') || false}
                onChange={(e) => onChange('textBorder', e.target.checked)}
            />
            <label htmlFor={`${prefix}textBorder`} style={{ fontSize: '12px', color: '#333' }}>
                Text Outline
            </label>
        </div>
    </>
);

interface VisibilityControlProps {
    expanded: boolean;
    onToggle: (id: string) => void;
    getValue: (property: string) => any;
    onChange: (property: string, value: any) => void;
}

export const VisibilityControl: React.FC<VisibilityControlProps> = ({
    expanded,
    onToggle,
    getValue,
    onChange
}) => (
    <>
        <SectionHeader
            id="visibility"
            title="Visibility Control"
            expanded={expanded}
            onToggle={onToggle}
        />
        {expanded && (
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: '#f9f9f9' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                        Visibility SensorTag
                    </label>
                    <input
                        type="text"
                        value={getValue('visibilitySensorTag') || ''}
                        onChange={(e) => onChange('visibilitySensorTag', e.target.value)}
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

/**
 * Utility hook for getting common property values across multiple selected elements
 */
export const useCommonPropertyValue = (selectedElements: PlacedElement[]) => {
    return useCallback((property: string): any => {
        if (selectedElements.length === 0) return '';
        const firstValue = selectedElements[0].properties[property];
        const allSame = selectedElements.every(el => el.properties[property] === firstValue);
        return allSame ? firstValue : '';
    }, [selectedElements]);
};

/**
 * Utility hook for updating element properties
 */
export const useElementPropertyUpdate = (
    selectedElements: PlacedElement[],
    onElementUpdate: (elementId: string, updates: Partial<PlacedElement>) => void
) => {
    return useCallback((property: string, value: any) => {
        selectedElements.forEach(element => {
            onElementUpdate(element.id, {
                properties: { ...element.properties, [property]: value }
            });
        });
    }, [selectedElements, onElementUpdate]);
};

/**
 * Utility hook for updating element transform (position/size)
 */
export const useElementTransformUpdate = (
    selectedElements: PlacedElement[],
    onElementUpdate: (elementId: string, updates: Partial<PlacedElement>) => void
) => {
    return useCallback((updates: Partial<Pick<PlacedElement, 'x' | 'y' | 'width' | 'height'>>) => {
        selectedElements.forEach(element => {
            onElementUpdate(element.id, updates);
        });
    }, [selectedElements, onElementUpdate]);
};