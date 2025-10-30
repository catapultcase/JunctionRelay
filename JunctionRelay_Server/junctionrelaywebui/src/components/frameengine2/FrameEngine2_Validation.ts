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

import type { PlacedElement } from './types/FrameEngine2_LayoutTypes';

/**
 * Element types that require a sensorTag
 * These are data-driven elements that display sensor values
 */
const ELEMENT_TYPES_REQUIRING_SENSORTAG = new Set([
    'sensor',
    'gauge',
    'ecg',
    'oscilloscope'
]);

/**
 * Check if an element type requires a sensorTag
 */
export const elementRequiresSensorTag = (elementType: string): boolean => {
    return ELEMENT_TYPES_REQUIRING_SENSORTAG.has(elementType);
};

/**
 * Check if an element is missing a required sensorTag
 */
export const elementMissingSensorTag = (element: PlacedElement): boolean => {
    if (!elementRequiresSensorTag(element.type)) {
        return false;
    }

    // Type guard: only sensor and gauge elements have sensorTag
    if (element.type !== 'sensor' && element.type !== 'gauge') {
        return false;
    }

    const sensorTag = element.properties.sensorTag;
    return !sensorTag || sensorTag.trim() === '';
};

/**
 * Get validation warnings for an element
 * Returns array of warning messages (empty if no warnings)
 */
export const getElementValidationWarnings = (element: PlacedElement): string[] => {
    const warnings: string[] = [];

    if (elementMissingSensorTag(element)) {
        warnings.push('Missing required SensorTag');
    }

    return warnings;
};

/**
 * Get count of elements missing required sensorTags
 * Optimized with early memoization pattern
 */
export const getElementsMissingSensorTagCount = (elements: PlacedElement[]): number => {
    return elements.filter(elementMissingSensorTag).length;
};

/**
 * Get array of elements missing required sensorTags
 */
export const getElementsMissingSensorTag = (elements: PlacedElement[]): PlacedElement[] => {
    return elements.filter(elementMissingSensorTag);
};
