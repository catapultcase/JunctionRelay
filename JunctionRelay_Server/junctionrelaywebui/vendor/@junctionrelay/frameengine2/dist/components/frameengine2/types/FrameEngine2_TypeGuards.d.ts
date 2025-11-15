import { PlacedElement } from './FrameEngine2_LayoutTypes';
import { SensorProperties, GaugeProperties, ECGProperties, MediaRiveProperties, MediaImageProperties, MediaVideoProperties, TextProperties, TimeDateProperties } from './FrameEngine2_ElementTypes';

/**
 * Type guard for sensor elements (sensor, gauge, ecg)
 * These all have a sensorTag property
 */
export declare function hasSensorTag(element: PlacedElement): element is PlacedElement & {
    type: 'sensor' | 'gauge' | 'ecg';
    properties: SensorProperties | GaugeProperties | ECGProperties;
};
/**
 * Type guard for sensor element specifically
 */
export declare function isSensorElement(element: PlacedElement): element is PlacedElement & {
    type: 'sensor';
    properties: SensorProperties;
};
/**
 * Type guard for gauge element
 */
export declare function isGaugeElement(element: PlacedElement): element is PlacedElement & {
    type: 'gauge';
    properties: GaugeProperties;
};
/**
 * Type guard for ECG element
 */
export declare function isECGElement(element: PlacedElement): element is PlacedElement & {
    type: 'ecg';
    properties: ECGProperties;
};
/**
 * Type guard for media-rive element
 */
export declare function isMediaRiveElement(element: PlacedElement): element is PlacedElement & {
    type: 'media-rive';
    properties: MediaRiveProperties;
};
/**
 * Type guard for media-image element
 */
export declare function isMediaImageElement(element: PlacedElement): element is PlacedElement & {
    type: 'media-image';
    properties: MediaImageProperties;
};
/**
 * Type guard for media-video element
 */
export declare function isMediaVideoElement(element: PlacedElement): element is PlacedElement & {
    type: 'media-video';
    properties: MediaVideoProperties;
};
/**
 * Type guard for text element
 */
export declare function isTextElement(element: PlacedElement): element is PlacedElement & {
    type: 'text';
    properties: TextProperties;
};
/**
 * Type guard for timedate element
 */
export declare function isTimeDateElement(element: PlacedElement): element is PlacedElement & {
    type: 'timedate';
    properties: TimeDateProperties;
};
/**
 * Type guard for media elements (image, video, rive)
 */
export declare function isMediaElement(element: PlacedElement): element is PlacedElement & {
    type: 'media-image' | 'media-video' | 'media-rive';
    properties: MediaImageProperties | MediaVideoProperties | MediaRiveProperties;
};
/**
 * Helper to safely get sensorTag from sensor-type elements
 * Returns undefined if element doesn't have sensorTag
 */
export declare function getSensorTag(element: PlacedElement): string | undefined;
/**
 * Helper to safely get Rive properties from media-rive elements
 * Returns undefined if element is not media-rive
 */
export declare function getRiveProperties(element: PlacedElement): MediaRiveProperties | undefined;
//# sourceMappingURL=FrameEngine2_TypeGuards.d.ts.map