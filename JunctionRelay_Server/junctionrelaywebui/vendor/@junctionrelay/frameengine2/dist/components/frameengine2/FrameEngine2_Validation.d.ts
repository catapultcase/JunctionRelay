import { PlacedElement } from './types/FrameEngine2_LayoutTypes';

/**
 * Check if an element type requires a sensorTag
 */
export declare const elementRequiresSensorTag: (elementType: string) => boolean;
/**
 * Check if an element is missing a required sensorTag
 */
export declare const elementMissingSensorTag: (element: PlacedElement) => boolean;
/**
 * Get validation warnings for an element
 * Returns array of warning messages (empty if no warnings)
 */
export declare const getElementValidationWarnings: (element: PlacedElement) => string[];
/**
 * Get count of elements missing required sensorTags
 * Optimized with early memoization pattern
 */
export declare const getElementsMissingSensorTagCount: (elements: PlacedElement[]) => number;
/**
 * Get array of elements missing required sensorTags
 */
export declare const getElementsMissingSensorTag: (elements: PlacedElement[]) => PlacedElement[];
//# sourceMappingURL=FrameEngine2_Validation.d.ts.map