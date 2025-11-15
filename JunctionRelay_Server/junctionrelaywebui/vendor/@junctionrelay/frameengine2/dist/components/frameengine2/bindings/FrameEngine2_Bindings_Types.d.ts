import { PlacedElement } from '../types/FrameEngine2_LayoutTypes';

/**
 * Type guard for elements with sensorTag property
 */
export type ElementWithSensorTag = Extract<PlacedElement, {
    type: 'sensor' | 'gauge' | 'ecg';
}>;
/**
 * Check if element has a sensorTag property
 */
export declare const hasSensorTag: (element: PlacedElement) => element is ElementWithSensorTag;
/**
 * View mode for the bindings tab
 */
export type ViewMode = 'asset' | 'sensortag';
/**
 * Supported Rive input types for UI controls
 */
export type RiveInputType = 'number' | 'boolean' | 'color' | 'trigger' | 'string';
//# sourceMappingURL=FrameEngine2_Bindings_Types.d.ts.map