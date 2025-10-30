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

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

/**
 * Color picker state interface
 */
interface ColorPickerState {
    visible: boolean;
    color: string;
    onChange: ((color: string) => void) | null;
}

/**
 * Color picker context interface
 */
interface ColorPickerContextValue {
    /** Current color picker state */
    state: ColorPickerState;
    /** Open the color picker with initial color and callback */
    open: (color: string, onChange: (color: string) => void) => void;
    /** Close the color picker */
    close: () => void;
    /** Update the current color */
    updateColor: (color: string) => void;
}

/**
 * Color picker context
 * Replaces global window API for better React patterns
 */
const ColorPickerContext = createContext<ColorPickerContextValue | null>(null);

/**
 * Color picker provider props
 */
interface ColorPickerProviderProps {
    children: ReactNode;
}

/**
 * Color picker provider component
 * Manages global color picker state for FrameEngine2
 */
export const ColorPickerProvider: React.FC<ColorPickerProviderProps> = ({ children }) => {
    const [state, setState] = useState<ColorPickerState>({
        visible: false,
        color: '#000000',
        onChange: null
    });

    /**
     * Open color picker with initial color and change callback
     */
    const open = useCallback((color: string, onChange: (color: string) => void) => {
        setState({
            visible: true,
            color: color || '#000000',
            onChange
        });
    }, []);

    /**
     * Close color picker and reset state
     */
    const close = useCallback(() => {
        setState({
            visible: false,
            color: '#000000',
            onChange: null
        });
    }, []);

    /**
     * Update current color and notify callback
     */
    const updateColor = useCallback((color: string) => {
        setState(prev => {
            if (prev.onChange) {
                prev.onChange(color);
            }
            return {
                ...prev,
                color
            };
        });
    }, []);

    const value = useMemo(() => ({
        state,
        open,
        close,
        updateColor
    }), [state, open, close, updateColor]);

    return (
        <ColorPickerContext.Provider value={value}>
            {children}
        </ColorPickerContext.Provider>
    );
};

/**
 * Hook to access color picker context
 * Throws error if used outside ColorPickerProvider
 */
export const useColorPicker = (): ColorPickerContextValue => {
    const context = useContext(ColorPickerContext);
    if (!context) {
        throw new Error('useColorPicker must be used within ColorPickerProvider');
    }
    return context;
};
