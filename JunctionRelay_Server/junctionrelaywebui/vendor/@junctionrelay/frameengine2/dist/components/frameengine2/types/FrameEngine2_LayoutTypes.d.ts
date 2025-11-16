import { SensorProperties, TextProperties, GaugeProperties, TimeDateProperties, MediaImageProperties, MediaVideoProperties, MediaRiveProperties, ECGProperties, TunnelProperties, WeatherProperties, PixelDrawProperties } from './FrameEngine2_ElementTypes';

/**
 * Base interface for common element properties
 */
interface PlacedElementBase {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    visible: boolean;
    locked: boolean;
    zIndex?: number;
}
/**
 * Discriminated union type for PlacedElement
 * Each element type has properly typed properties based on its type field
 */
export type PlacedElement = (PlacedElementBase & {
    type: 'sensor';
    properties: SensorProperties;
}) | (PlacedElementBase & {
    type: 'text';
    properties: TextProperties;
}) | (PlacedElementBase & {
    type: 'gauge';
    properties: GaugeProperties;
}) | (PlacedElementBase & {
    type: 'timedate';
    properties: TimeDateProperties;
}) | (PlacedElementBase & {
    type: 'media-image';
    properties: MediaImageProperties;
}) | (PlacedElementBase & {
    type: 'media-video';
    properties: MediaVideoProperties;
}) | (PlacedElementBase & {
    type: 'media-rive';
    properties: MediaRiveProperties;
}) | (PlacedElementBase & {
    type: 'ecg';
    properties: ECGProperties;
}) | (PlacedElementBase & {
    type: 'tunnel';
    properties: TunnelProperties;
}) | (PlacedElementBase & {
    type: 'weather';
    properties: WeatherProperties;
}) | (PlacedElementBase & {
    type: 'pixel-draw';
    properties: PixelDrawProperties;
});
/**
 * Canvas grid settings
 */
export interface GridSettings {
    snapToGrid: boolean;
    showGrid: boolean;
    showOutlines: boolean;
    gridSize: number;
    gridColor: string;
}
/**
 * Canvas settings
 */
export interface CanvasSettings {
    grid: GridSettings;
    elementPadding: number;
    testBindingsEnabled?: boolean;
    testBindingsInterval?: number;
    includedSensorTags?: string[];
}
/**
 * Sensor test value structure
 */
export interface SensorTestValue {
    value?: string | number | boolean;
    label?: string;
    unit?: string;
}
/**
 * Frame layout configuration
 */
export interface FrameLayoutConfig {
    id?: number;
    displayName: string;
    description?: string;
    layoutType: string;
    width: number;
    height: number;
    orientation?: string;
    backgroundColor?: string;
    backgroundType?: string;
    backgroundImageUrl?: string | null;
    backgroundImageFit?: 'cover' | 'contain' | 'fill' | 'tile' | 'stretch' | 'none';
    backgroundVideoUrl?: string | null;
    backgroundVideoFit?: 'cover' | 'contain' | 'fill' | 'stretch' | 'none';
    videoLoop?: boolean;
    videoMuted?: boolean;
    videoAutoplay?: boolean;
    backgroundOpacity?: number;
    riveFile?: string | null;
    riveStateMachine?: string | null;
    riveInputs?: Record<string, any> | null;
    riveBindings?: Record<string, any> | null;
    isTemplate: boolean;
    cloudTemplateId?: string | null;
    cloudVariantId?: string | null;
    isDraft?: boolean;
    isPublished?: boolean;
    canvasSettings?: CanvasSettings;
    sensorTestValues?: Record<string, SensorTestValue>;
    created?: string;
    lastModified?: string;
    createdBy?: string;
    version?: string;
    thumbnailOverride?: boolean;
    jsonFrameConfig?: string;
    jsonFrameElements?: string;
}
export {};
//# sourceMappingURL=FrameEngine2_LayoutTypes.d.ts.map