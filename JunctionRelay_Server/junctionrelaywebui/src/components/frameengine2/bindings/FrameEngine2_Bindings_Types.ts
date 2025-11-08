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

import type { PlacedElement } from '../types/FrameEngine2_LayoutTypes';

/**
 * Type guard for elements with sensorTag property
 */
export type ElementWithSensorTag = Extract<PlacedElement, { type: 'sensor' | 'gauge' | 'ecg' }>;

/**
 * Check if element has a sensorTag property
 */
export const hasSensorTag = (element: PlacedElement): element is ElementWithSensorTag => {
    return (element.type === 'sensor' || element.type === 'gauge' || element.type === 'ecg') && !!element.properties.sensorTag;
};

/**
 * View mode for the bindings tab
 */
export type ViewMode = 'asset' | 'sensortag';

/**
 * Supported Rive input types for UI controls
 */
export type RiveInputType = 'number' | 'boolean' | 'color' | 'trigger' | 'string';
