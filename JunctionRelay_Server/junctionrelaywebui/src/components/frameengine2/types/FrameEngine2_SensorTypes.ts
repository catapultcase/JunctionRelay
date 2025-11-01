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
 * Type definitions for FrameEngine2 Sensor Tag Management System
 *
 * This system tracks sensor data flow from inputs through the middleware
 * to outputs (element properties, Rive inputs, Rive bindings).
 */

// ============================================================================
// Input Tracking
// ============================================================================

/**
 * Source of sensor data
 */
export type SensorDataSource = 'live' | 'test';

/**
 * Represents a sensor tag input - data coming INTO the system
 */
export interface SensorTagInput {
    /** The sensor tag name (e.g., "temperature", "value1") */
    tag: string;

    /** Current value of the sensor */
    value: any;

    /** Timestamp of last update (ms since epoch) */
    lastUpdate: number;

    /** Total number of updates received for this tag */
    updateCount: number;

    /** Whether this tag has any output targets (false = orphaned) */
    hasTarget: boolean;

    /** Source of this data: 'live' from actual sensors or 'test' from test inputs */
    source: SensorDataSource;
}

// ============================================================================
// Output Tracking
// ============================================================================

/**
 * Types of targets that can consume sensor tag data
 */
export type SensorTargetType =
    | 'element-property'           // Element property (e.g., element.properties.sensorTag)
    | 'element-rive-input'         // Element Rive input (e.g., asset-rive element)
    | 'element-rive-binding'       // Element Rive binding (e.g., asset-rive element)
    | 'background-rive-input'      // Background Rive input
    | 'background-rive-binding';   // Background Rive binding

/**
 * Represents a single target that consumes a sensor tag
 */
export interface SensorTagTarget {
    /** Type of target */
    type: SensorTargetType;

    /** Element ID (undefined for background targets) */
    elementId?: string;

    /** Element type (for display purposes, e.g., "sensor", "gauge", "asset-rive") */
    elementType?: string;

    /** Property path within the target (e.g., "sensorTag", "riveInputs.battery") */
    propertyPath: string;

    /** Current value at this target */
    value: any;

    /** Converted value (if type conversion occurred, e.g., string -> number) */
    convertedValue?: any;

    /** Whether value was converted */
    wasConverted?: boolean;
}

/**
 * Represents a sensor tag output - where the data GOES
 */
export interface SensorTagOutput {
    /** The sensor tag name */
    tag: string;

    /** List of all targets consuming this tag */
    targets: SensorTagTarget[];
}

// ============================================================================
// Registry
// ============================================================================

/**
 * Central registry for all sensor tag inputs and outputs
 */
export interface SensorTagRegistry {
    /** Map of tag name -> input data */
    inputs: Map<string, SensorTagInput>;

    /** Map of tag name -> output data */
    outputs: Map<string, SensorTagOutput>;
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Statistics about sensor tag usage
 */
export interface SensorTagStats {
    /** Number of unique sensor tags receiving data */
    activeTags: number;

    /** Total number of bindings (targets) across all tags */
    totalBindings: number;

    /** Number of orphaned tags (receiving data but no targets) */
    orphanedTags: number;

    /** Update rate in updates per second */
    updateRate: number;
}

// ============================================================================
// Debug Panel Data
// ============================================================================

/**
 * Complete data structure for the debug panel
 */
export interface SensorDebugData {
    /** All sensor tag inputs (sorted by tag name) */
    inputs: SensorTagInput[];

    /** All sensor tag outputs (sorted by tag name) */
    outputs: SensorTagOutput[];

    /** Statistics summary */
    stats: SensorTagStats;
}
