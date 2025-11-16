/**
 * Type definitions for FrameEngine2 Sensor Tag Management System
 *
 * This system tracks sensor data flow from inputs through the middleware
 * to outputs (element properties, Rive inputs, Rive bindings).
 */
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
/**
 * Types of targets that can consume sensor tag data
 */
export type SensorTargetType = 'element-property' | 'element-rive-input' | 'element-rive-binding' | 'background-rive-input' | 'background-rive-binding';
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
/**
 * Central registry for all sensor tag inputs and outputs
 */
export interface SensorTagRegistry {
    /** Map of tag name -> input data */
    inputs: Map<string, SensorTagInput>;
    /** Map of tag name -> output data */
    outputs: Map<string, SensorTagOutput>;
}
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
/**
 * Rive discovery information for debug panel
 */
export interface RiveDebugInfo {
    /** Number of discovered state machines */
    stateMachines: number;
    /** Total number of state machine inputs */
    totalInputs: number;
    /** Number of discovered data bindings */
    dataBindings: number;
    /** Input names */
    inputNames: string[];
    /** Data binding names */
    bindingNames: string[];
}
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
    /** Rive discovery information (optional) */
    riveInfo?: RiveDebugInfo;
}
//# sourceMappingURL=FrameEngine2_SensorTypes.d.ts.map