import { FrameLayoutConfig, PlacedElement } from './types/FrameEngine2_LayoutTypes';

export declare const DEFAULT_CANVAS_SETTINGS: {
    grid: {
        snapToGrid: boolean;
        showGrid: boolean;
        showOutlines: boolean;
        gridSize: number;
        gridColor: string;
    };
    elementPadding: number;
    testBindingsInterval: number;
    testBindingsEnabled: boolean;
};
/**
 * Parse database response into FrameEngine2 format
 *
 * Strategy:
 * - Extract layout properties
 * - Normalize fit modes (reject invalid values)
 * - Parse elements from JSON
 * - Apply FrameEngine2 defaults where needed
 * - IGNORE incompatible data (no migration, clean break)
 *
 * @param response - Raw database response
 * @returns Clean FrameEngine2 layout config and elements
 */
export declare const parseFrameLayoutResponse: (response: any) => {
    layout: FrameLayoutConfig;
    elements: PlacedElement[];
};
//# sourceMappingURL=FrameEngine2_Data.d.ts.map