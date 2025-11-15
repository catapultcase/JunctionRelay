import { PlacedElement, FrameLayoutConfig } from '../types/FrameEngine2_LayoutTypes';
import { DiscoveredRiveStateMachine, DiscoveredRiveDataBinding } from '../types/FrameEngine2_ElementTypes';
import { RiveInputType } from './FrameEngine2_Bindings_Types';

/**
 * Map Rive binding types to UI input types
 * DiscoveredRiveDataBinding has additional types (image, enum, list) that don't map to input controls
 */
export declare const mapBindingTypeToInputType: (bindingType: string) => RiveInputType;
/**
 * Get the input type for a sensor tag by checking Rive discoveries
 */
export declare const getInputType: (sensorTag: string, backgroundRiveMachines: DiscoveredRiveStateMachine[], backgroundRiveBindings: DiscoveredRiveDataBinding[], elementRiveDiscoveries: Map<string, {
    machines: DiscoveredRiveStateMachine[];
    bindings: DiscoveredRiveDataBinding[];
}>) => RiveInputType;
/**
 * Extract all SensorTags from elements (deduplicated)
 * Includes Rive inputs and data bindings as sensor tags (no prefix - treated the same)
 */
export declare const extractAllSensorTags: (elements: PlacedElement[], backgroundRiveMachines: DiscoveredRiveStateMachine[], backgroundRiveBindings: DiscoveredRiveDataBinding[], elementRiveDiscoveries: Map<string, {
    machines: DiscoveredRiveStateMachine[];
    bindings: DiscoveredRiveDataBinding[];
}>) => string[];
/**
 * Group elements by type for Asset View
 */
export declare const groupElementsByType: (elements: PlacedElement[]) => Record<string, PlacedElement[]>;
/**
 * Get current test value for a sensor tag
 * Checks Rive inputs and bindings first, then falls back to regular test values
 */
export declare const getTestValue: (sensorTag: string, layout: FrameLayoutConfig, elements: PlacedElement[], elementRiveDiscoveries: Map<string, {
    machines: DiscoveredRiveStateMachine[];
    bindings: DiscoveredRiveDataBinding[];
}>) => string;
/**
 * Get current test label for a sensor tag
 */
export declare const getTestLabel: (sensorTag: string, layout: FrameLayoutConfig) => string;
/**
 * Get current test unit for a sensor tag
 */
export declare const getTestUnit: (sensorTag: string, layout: FrameLayoutConfig) => string;
//# sourceMappingURL=FrameEngine2_Bindings_Utils.d.ts.map