import { default as React } from 'react';
import { FrameLayoutConfig, PlacedElement } from './types/FrameEngine2_LayoutTypes';

interface RgbaColor {
    r: number;
    g: number;
    b: number;
    a: number;
}
interface FrameEngine2_CanvasControlsProps {
    /** Current layout configuration */
    layout: FrameLayoutConfig;
    /** Callback to update layout configuration */
    onLayoutUpdate: (updates: Partial<FrameLayoutConfig>) => void;
    /** Whether the debug panel is currently shown */
    showDebugPanel: boolean;
    /** Callback to toggle debug panel visibility */
    onToggleDebugPanel: () => void;
    /** Callback to reset canvas viewport */
    onResetView: () => void;
    /** All elements (for validation warnings) */
    elements: PlacedElement[];
    /** Color picker visibility */
    colorPickerVisible: boolean;
    /** Current color picker value (RGBA format) */
    colorPickerColor: RgbaColor;
    /** Color picker change handler */
    onColorPickerChange: (color: RgbaColor) => void;
    /** Color picker close handler */
    onColorPickerClose: () => void;
    /** Preview mode - hides canvas options */
    previewMode?: boolean;
}
declare const _default: React.NamedExoticComponent<FrameEngine2_CanvasControlsProps>;
export default _default;
//# sourceMappingURL=FrameEngine2_CanvasControls.d.ts.map