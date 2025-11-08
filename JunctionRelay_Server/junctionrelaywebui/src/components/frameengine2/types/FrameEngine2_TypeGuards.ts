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
 * Type guards for FrameEngine2 discriminated unions
 *
 * These functions allow TypeScript to properly narrow types when
 * working with PlacedElement discriminated unions, eliminating the
 * need for unsafe `as any` casts.
 */

import type { PlacedElement } from './FrameEngine2_LayoutTypes';
import type {
    SensorProperties,
    GaugeProperties,
    ECGProperties,
    MediaRiveProperties,
    MediaImageProperties,
    MediaVideoProperties,
    TextProperties,
    TimeDateProperties
} from './FrameEngine2_ElementTypes';

/**
 * Type guard for sensor elements (sensor, gauge, ecg)
 * These all have a sensorTag property
 */
export function hasSensorTag(element: PlacedElement): element is PlacedElement & {
    type: 'sensor' | 'gauge' | 'ecg';
    properties: SensorProperties | GaugeProperties | ECGProperties;
} {
    return element.type === 'sensor' || element.type === 'gauge' || element.type === 'ecg';
}

/**
 * Type guard for sensor element specifically
 */
export function isSensorElement(element: PlacedElement): element is PlacedElement & {
    type: 'sensor';
    properties: SensorProperties;
} {
    return element.type === 'sensor';
}

/**
 * Type guard for gauge element
 */
export function isGaugeElement(element: PlacedElement): element is PlacedElement & {
    type: 'gauge';
    properties: GaugeProperties;
} {
    return element.type === 'gauge';
}

/**
 * Type guard for ECG element
 */
export function isECGElement(element: PlacedElement): element is PlacedElement & {
    type: 'ecg';
    properties: ECGProperties;
} {
    return element.type === 'ecg';
}

/**
 * Type guard for media-rive element
 */
export function isMediaRiveElement(element: PlacedElement): element is PlacedElement & {
    type: 'media-rive';
    properties: MediaRiveProperties;
} {
    return element.type === 'media-rive';
}

/**
 * Type guard for media-image element
 */
export function isMediaImageElement(element: PlacedElement): element is PlacedElement & {
    type: 'media-image';
    properties: MediaImageProperties;
} {
    return element.type === 'media-image';
}

/**
 * Type guard for media-video element
 */
export function isMediaVideoElement(element: PlacedElement): element is PlacedElement & {
    type: 'media-video';
    properties: MediaVideoProperties;
} {
    return element.type === 'media-video';
}

/**
 * Type guard for text element
 */
export function isTextElement(element: PlacedElement): element is PlacedElement & {
    type: 'text';
    properties: TextProperties;
} {
    return element.type === 'text';
}

/**
 * Type guard for timedate element
 */
export function isTimeDateElement(element: PlacedElement): element is PlacedElement & {
    type: 'timedate';
    properties: TimeDateProperties;
} {
    return element.type === 'timedate';
}

/**
 * Type guard for media elements (image, video, rive)
 */
export function isMediaElement(element: PlacedElement): element is PlacedElement & {
    type: 'media-image' | 'media-video' | 'media-rive';
    properties: MediaImageProperties | MediaVideoProperties | MediaRiveProperties;
} {
    return element.type.startsWith('media-');
}

/**
 * Helper to safely get sensorTag from sensor-type elements
 * Returns undefined if element doesn't have sensorTag
 */
export function getSensorTag(element: PlacedElement): string | undefined {
    if (hasSensorTag(element)) {
        return element.properties.sensorTag;
    }
    return undefined;
}

/**
 * Helper to safely get Rive properties from media-rive elements
 * Returns undefined if element is not media-rive
 */
export function getRiveProperties(element: PlacedElement): MediaRiveProperties | undefined {
    if (isMediaRiveElement(element)) {
        return element.properties;
    }
    return undefined;
}
