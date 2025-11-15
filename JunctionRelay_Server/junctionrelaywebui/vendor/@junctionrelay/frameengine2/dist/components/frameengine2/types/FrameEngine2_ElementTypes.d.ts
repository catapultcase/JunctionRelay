/**
 * Type definitions for element default properties
 *
 * These interfaces define the structure of default properties for each element type.
 * Used in FrameEngine2_Canvas for DEFAULT_ELEMENT_PROPERTIES constant.
 */
/**
 * 9-directional alignment type
 * Covers all combinations of horizontal and vertical positioning
 */
export type Alignment9Way = 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
/**
 * Properties for Sensor element type
 */
export interface SensorProperties {
    sensorTag: string;
    showLabel: boolean;
    showUnit: boolean;
    placeholderSensorLabel: string;
    placeholderValue: string;
    placeholderUnit: string;
    fontSize: number;
    fontFamily: string;
    fontType?: 'google' | 'pixel';
    fontWeight: string;
    textColor: string;
    backgroundColor: string;
    textAlign: 'left' | 'center' | 'right';
    verticalAlign: 'top' | 'center' | 'bottom';
    alignment: Alignment9Way;
}
/**
 * Properties for Text element type
 */
export interface TextProperties {
    text: string;
    fontSize: number;
    fontFamily: string;
    fontType?: 'google' | 'pixel';
    fontWeight: string;
    color: string;
    backgroundColor: string;
    textAlign: 'left' | 'center' | 'right';
    verticalAlign: 'top' | 'center' | 'bottom';
    alignment: Alignment9Way;
}
/**
 * Properties for Gauge element type
 */
export interface GaugeProperties {
    sensorTag: string;
    minValue: number;
    maxValue: number;
    startAngle: number;
    endAngle: number;
    innerRadius: string;
    outerRadius: string;
    cornerRadius: string;
    valueLabel: string;
    showValue: boolean;
    gaugeColor: string;
    referenceArcColor: string;
    textColor: string;
    textFontSize: number;
    textFontFamily: string;
    textFontWeight: number;
    backgroundColor: string;
}
/**
 * Properties for TimeDate element type
 */
export interface TimeDateProperties {
    displayMode: 'time' | 'date' | 'both';
    timeFormat: '12h' | '24h';
    dateFormat: 'short' | 'long' | 'numeric';
    timezone: string;
    showSeconds: boolean;
    fontSize: number;
    fontFamily: string;
    fontWeight: string;
    textColor: string;
    backgroundColor: string;
    textAlign: 'left' | 'center' | 'right';
    verticalAlign: 'top' | 'center' | 'bottom';
}
/**
 * Properties for MediaImage element type
 */
export interface MediaImageProperties {
    filename: string | null;
    objectFit: 'cover' | 'contain' | 'fill' | 'none';
    opacity: number;
}
/**
 * Properties for MediaVideo element type
 */
export interface MediaVideoProperties {
    filename: string | null;
    objectFit: 'cover' | 'contain' | 'fill' | 'none';
    opacity: number;
    loop: boolean;
    muted: boolean;
    autoplay: boolean;
}
/**
 * Discovered Rive input from state machine
 */
export interface DiscoveredRiveInput {
    name: string;
    type: 'number' | 'boolean' | 'trigger' | 'unknown';
    currentValue?: any;
    ref?: any;
}
/**
 * Discovered Rive state machine with inputs
 */
export interface DiscoveredRiveStateMachine {
    name: string;
    inputNames: string[];
    inputs: DiscoveredRiveInput[];
}
/**
 * Discovered Rive data binding (View Model property)
 */
export interface DiscoveredRiveDataBinding {
    name: string;
    type: 'number' | 'string' | 'boolean' | 'color' | 'trigger' | 'enum' | 'list' | 'image' | 'unknown';
    currentValue?: any;
    ref?: any;
}
/**
 * Properties for MediaRive element type
 */
export interface MediaRiveProperties {
    filename: string | null;
    autoplay: boolean;
    backgroundColor: string;
    riveStateMachine?: string;
    riveInputs?: Record<string, any>;
    riveBindings?: Record<string, any>;
}
/**
 * Properties for ECG/Waveform element type
 */
export interface ECGProperties {
    sensorTag: string;
    yAxisMin: number;
    yAxisMax: number;
    bufferSize: number;
    lineWidth: number;
    gridScrollSpeed: number;
    waveformColor: string;
    backgroundColor: string;
    gridBackgroundColor: string;
    gridColor: string;
    showGrid: boolean;
    showBorder: boolean;
}
/**
 * Properties for Tunnel element type
 * Creates animated 3D tunnel effect with various shapes and customization options
 */
export interface TunnelProperties {
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    tunnelType: 'circular' | 'square' | 'hexagon' | 'star' | 'spiral';
    speed: number;
    depth: number;
    ringSpacing: number;
    rotation: number;
    twist: number;
    pulseSpeed: number;
    pulseAmount: number;
    scanlines: boolean;
    scanlineIntensity: number;
    chromatic: boolean;
    chromaticAmount: number;
    pixelate: boolean;
    pixelSize: number;
    colorCycle: boolean;
    colorCycleSpeed: number;
    perspective: number;
    glow: boolean;
    glowIntensity: number;
    lineWidth: number;
    curveTargetX: number;
    curveTargetY: number;
    curveStrength: number;
    banking: number;
    pitch: number;
    originX: number;
    originY: number;
    depthFade: boolean;
    fadeEnd: 'front' | 'back';
}
/**
 * Properties for Weather element type
 * Creates 3D weather scene with Three.js
 */
export interface WeatherProperties {
    weatherType: 'clear' | 'cloudy' | 'rainy' | 'snowy' | 'stormy' | 'foggy';
    timeOfDay: 'day' | 'sunset' | 'night';
    cloudDensity: number;
    animationSpeed: number;
    particleCount: number;
    showStars: boolean;
    cameraAngle: number;
    backgroundColor: string;
}
/**
 * Properties for PixelDraw element type
 * Creates a pixel art drawing canvas
 */
export interface PixelDrawProperties {
    pixelSize: number;
    gridColor: string;
    showGrid: boolean;
    backgroundColor: string;
    pixels?: Record<string, string>;
}
/**
 * Union type for all element default properties
 *
 * This ensures type safety when accessing default properties
 * in the DEFAULT_ELEMENT_PROPERTIES record.
 */
export type ElementDefaultProperties = SensorProperties | TextProperties | GaugeProperties | TimeDateProperties | MediaImageProperties | MediaVideoProperties | MediaRiveProperties | ECGProperties | TunnelProperties | WeatherProperties | PixelDrawProperties;
//# sourceMappingURL=FrameEngine2_ElementTypes.d.ts.map