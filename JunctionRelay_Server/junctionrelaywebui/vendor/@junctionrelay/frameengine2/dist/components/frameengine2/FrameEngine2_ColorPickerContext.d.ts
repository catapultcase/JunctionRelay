import { default as React, ReactNode } from 'react';

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
 * Color picker provider props
 */
interface ColorPickerProviderProps {
    children: ReactNode;
}
/**
 * Color picker provider component
 * Manages global color picker state for FrameEngine2
 */
export declare const ColorPickerProvider: React.FC<ColorPickerProviderProps>;
/**
 * Hook to access color picker context
 * Throws error if used outside ColorPickerProvider
 */
export declare const useColorPicker: () => ColorPickerContextValue;
export {};
//# sourceMappingURL=FrameEngine2_ColorPickerContext.d.ts.map