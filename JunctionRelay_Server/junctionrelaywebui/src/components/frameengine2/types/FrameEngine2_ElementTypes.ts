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
export type Alignment9Way =
    | 'top-left' | 'top-center' | 'top-right'
    | 'middle-left' | 'center' | 'middle-right'
    | 'bottom-left' | 'bottom-center' | 'bottom-right';

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
 * Union type for all element default properties
 *
 * This ensures type safety when accessing default properties
 * in the DEFAULT_ELEMENT_PROPERTIES record.
 */
export type ElementDefaultProperties =
    | SensorProperties
    | TextProperties
    | GaugeProperties
    | TimeDateProperties
    | MediaImageProperties
    | MediaVideoProperties
    | MediaRiveProperties
    | ECGProperties;
