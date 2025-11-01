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

import React, { useMemo, useCallback } from 'react';
import {
    Box,
    Typography,
    TextField
} from '@mui/material';
import FontPicker from 'react-fontpicker-ts';
import 'react-fontpicker-ts/dist/index.css';
import type { PlacedElement } from '../types/FrameEngine2_LayoutTypes';
import { useColorPicker } from '../FrameEngine2_ColorPickerContext';

/**
 * Props for color input component
 */
interface ColorInputProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    error?: boolean;
}

/**
 * Reusable color input with global picker and text field
 */
export const ColorInput: React.FC<ColorInputProps> = React.memo(({
    label,
    value,
    onChange,
    error = false
}) => {
    const currentValue = value ?? '#ffffff';
    const colorPicker = useColorPicker();

    // Get display color for the swatch
    const getSwatchColor = () => {
        if (!currentValue || currentValue === 'transparent') {
            return 'transparent';
        }
        return currentValue;
    };

    // Open the global color picker using context
    const handleSwatchClick = useCallback(() => {
        colorPicker.open(currentValue, (newColor: string) => {
            onChange(newColor);
        });
    }, [colorPicker, currentValue, onChange]);

    return (
        <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color={error ? 'error' : 'text.secondary'} display="block" mb={0.5}>
                {label}{error && ' (Required)'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                {/* Color swatch button */}
                <Box
                    onClick={handleSwatchClick}
                    sx={{
                        width: '48px',
                        height: '40px',
                        border: error ? '2px solid #d32f2f' : '1px solid #ccc',
                        borderRadius: '4px',
                        backgroundColor: getSwatchColor(),
                        backgroundImage: currentValue === 'transparent'
                            ? 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc)'
                            : 'none',
                        backgroundSize: '8px 8px',
                        backgroundPosition: '0 0, 4px 4px',
                        '&:hover': {
                            opacity: 0.8
                        }
                    }}
                />

                {/* Text input */}
                <TextField
                    size="small"
                    fullWidth
                    value={currentValue}
                    onChange={(e) => onChange(e.target.value)}
                    error={error}
                    sx={{ fontFamily: 'monospace' }}
                />
            </Box>

            {/* Help text */}
            <Typography variant="caption" color="text.disabled" display="block" mt={0.5} fontSize="10px">
                Supports hex, rgb(), rgba(), hsl(), hsla(), or 'transparent'
            </Typography>
        </Box>
    );
});

ColorInput.displayName = 'ColorInput';

/**
 * Props for text/number input component
 */
interface TextInputProps {
    label: string;
    value: string | number;
    onChange: (value: string | number) => void;
    type?: 'text' | 'number';
    error?: boolean;
    helperText?: string;
    placeholder?: string;
}

/**
 * Reusable text/number input
 */
export const TextInput: React.FC<TextInputProps> = React.memo(({
    label,
    value,
    onChange,
    type = 'text',
    error = false,
    helperText = '',
    placeholder = ''
}) => {
    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (type === 'number') {
            const val = e.target.value;
            if (val === '') {
                onChange('');
            } else {
                const parsed = parseInt(val);
                onChange(isNaN(parsed) ? 0 : parsed);
            }
        } else {
            onChange(e.target.value);
        }
    }, [type, onChange]);

    const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
        if (type === 'number' && e.target.value === '') {
            onChange(0);
        }
    }, [type, onChange]);

    return (
        <Box sx={{ mb: 1 }}>
            <TextField
                label={label}
                type={type}
                size="small"
                fullWidth
                value={value ?? ''}
                onChange={handleChange}
                onBlur={handleBlur}
                error={error}
                helperText={error ? (helperText || 'Required field') : ''}
                placeholder={placeholder}
                sx={{ '& input': { fontFamily: 'monospace' } }}
            />
        </Box>
    );
});

TextInput.displayName = 'TextInput';

/**
 * Props for font family select component
 */
interface FontFamilySelectProps {
    value: string;
    onChange: (value: string) => void;
}

/**
 * Reusable Google Fonts dropdown with live previews
 * Uses react-fontpicker-ts with autoLoad to handle all font loading
 */
export const FontFamilySelect: React.FC<FontFamilySelectProps> = React.memo(({
    value: currentValue,
    onChange
}) => {
    return (
        <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                Font Family
            </Typography>
            <FontPicker
                defaultValue={currentValue || 'Inter'}
                value={onChange}
                autoLoad={true}
            />
        </Box>
    );
});

FontFamilySelect.displayName = 'FontFamilySelect';

/**
 * Props for typography controls group
 */
interface TypographyControlsProps {
    fontFamily: string;
    fontSize: number;
    textColor: string;
    backgroundColor: string;
    onChange: (property: string, value: any) => void;
    textColorPropertyName?: string; // Property name to use for text color (default: 'textColor')
}

/**
 * Reusable typography controls group (font family, size, colors)
 */
export const TypographyControls: React.FC<TypographyControlsProps> = React.memo(({
    fontFamily,
    fontSize,
    textColor,
    backgroundColor,
    onChange,
    textColorPropertyName = 'textColor'
}) => {
    return (
        <>
            <FontFamilySelect
                value={fontFamily}
                onChange={(v) => onChange('fontFamily', v)}
            />
            <TextInput
                label="Font Size"
                type="number"
                value={fontSize}
                onChange={(v) => onChange('fontSize', v)}
            />
            <ColorInput
                label="Text Color"
                value={textColor}
                onChange={(v) => onChange(textColorPropertyName, v)}
            />
            <ColorInput
                label="Background Color"
                value={backgroundColor}
                onChange={(v) => onChange('backgroundColor', v)}
            />
        </>
    );
});

TypographyControls.displayName = 'TypographyControls';

/**
 * Hook to create property update function
 * Handles both top-level (x, y) and nested (properties.text) updates
 */
export const usePropertyUpdate = (
    selectedElement: PlacedElement,
    onUpdateElement: (elementId: string, updates: Partial<PlacedElement>) => void
) => {
    return useCallback((propertyPath: string, value: any) => {
        if (propertyPath.includes('.')) {
            // Nested property (e.g., "properties.text")
            const [parent, key] = propertyPath.split('.');
            onUpdateElement(selectedElement.id, {
                [parent]: {
                    ...selectedElement[parent as keyof PlacedElement] as any,
                    [key]: value
                }
            });
        } else {
            // Top-level property (e.g., "x", "y")
            onUpdateElement(selectedElement.id, { [propertyPath]: value });
        }
    }, [selectedElement, onUpdateElement]);
};

/**
 * Hook to get property value with default
 * Supports both top-level and nested properties
 */
export const usePropertyValue = (selectedElement: PlacedElement) => {
    return useCallback((propertyPath: string, defaultValue: any = '') => {
        if (propertyPath.includes('.')) {
            // Nested property (e.g., "properties.text")
            const [parent, key] = propertyPath.split('.');
            const parentObj = selectedElement[parent as keyof PlacedElement] as any;
            return parentObj?.[key] ?? defaultValue;
        } else {
            // Top-level property (e.g., "x", "y")
            return selectedElement[propertyPath as keyof PlacedElement] ?? defaultValue;
        }
    }, [selectedElement]);
};

/**
 * Common property update function for properties object
 * Shorthand for updating element.properties.* values
 */
export const usePropertiesUpdate = (
    selectedElement: PlacedElement,
    onUpdateElement: (elementId: string, updates: Partial<PlacedElement>) => void
) => {
    return useCallback((property: string, value: any) => {
        onUpdateElement(selectedElement.id, {
            properties: {
                ...selectedElement.properties,
                [property]: value
            }
        } as Partial<PlacedElement>);
    }, [selectedElement, onUpdateElement]);
};
