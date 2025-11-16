import { default as React } from 'react';
import { PlacedElement } from '../types/FrameEngine2_LayoutTypes';

/**
 * Props for color input component
 */
interface ColorInputProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    error?: boolean;
    disabled?: boolean;
}
/**
 * Reusable color input with global picker and text field
 */
export declare const ColorInput: React.FC<ColorInputProps>;
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
    step?: number;
}
/**
 * Reusable text/number input
 */
export declare const TextInput: React.FC<TextInputProps>;
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
export declare const FontFamilySelect: React.FC<FontFamilySelectProps>;
/**
 * Props for font source picker component
 */
interface FontSourcePickerProps {
    value: 'google' | 'pixel';
    onChange: (value: 'google' | 'pixel') => void;
}
/**
 * Font source picker - Choose between Google Fonts and Pixel Fonts
 */
export declare const FontSourcePicker: React.FC<FontSourcePickerProps>;
/**
 * Props for pixel font select component
 */
interface PixelFontSelectProps {
    value: string;
    onChange: (value: string) => void;
}
/**
 * Pixel font picker - Select from available pixel fonts
 */
export declare const PixelFontSelect: React.FC<PixelFontSelectProps>;
/**
 * Props for typography controls group
 */
interface TypographyControlsProps {
    fontFamily: string;
    fontSize: number;
    textColor: string;
    backgroundColor: string;
    onChange: (property: string, value: any) => void;
    textColorPropertyName?: string;
    fontType?: 'google' | 'pixel';
    supportsFontType?: boolean;
    onFontTypeChange?: (newType: 'google' | 'pixel') => void;
}
/**
 * Reusable typography controls group (font family, size, colors)
 * Supports optional font type picker for elements that can use pixel fonts
 */
export declare const TypographyControls: React.FC<TypographyControlsProps>;
/**
 * Hook to create property update function
 * Handles both top-level (x, y) and nested (properties.text) updates
 * @param value - Property value (legitimately `any` - different properties have different types)
 */
export declare const usePropertyUpdate: (selectedElement: PlacedElement, onUpdateElement: (elementId: string, updates: Partial<PlacedElement>) => void) => (propertyPath: string, value: any) => void;
/**
 * Hook to get property value with default
 * Supports both top-level and nested properties
 * @param defaultValue - Default value if property doesn't exist (legitimately `any` - properties have varying types)
 */
export declare const usePropertyValue: (selectedElement: PlacedElement) => (propertyPath: string, defaultValue?: any) => any;
/**
 * Common property update function for properties object
 * Shorthand for updating element.properties.* values
 * @param value - Property value (legitimately `any` - different properties have different types)
 */
export declare const usePropertiesUpdate: (selectedElement: PlacedElement, onUpdateElement: (elementId: string, updates: Partial<PlacedElement>) => void) => (property: string, value: any) => void;
export {};
//# sourceMappingURL=FrameEngine2_ElementProperties_Shared.d.ts.map