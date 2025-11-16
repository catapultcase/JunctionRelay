import { FrameLayoutConfig, PlacedElement } from '../types/FrameEngine2_LayoutTypes';
import { SensorDebugData } from '../types/FrameEngine2_SensorTypes';

/**
 * Parameters for the useSensorTagManager hook
 */
export interface UseSensorTagManagerParams {
    /** Layout configuration containing background settings and test values */
    layout: FrameLayoutConfig;
    /** Array of elements placed on the canvas */
    elements: PlacedElement[];
    /** Whether the sensor tag manager is enabled (default: true) */
    enabled?: boolean;
}
/**
 * Return value from the useSensorTagManager hook
 */
export interface UseSensorTagManagerResult {
    /** Debug data for the debug panel */
    debugData: SensorDebugData;
    /** Resolved sensor values (Live > Test hierarchy applied) */
    resolvedValues: Record<string, any>;
    /** Update a sensor tag value */
    updateSensor: (tag: string, value: any) => void;
    /** Clear a specific sensor tag */
    clearSensor: (tag: string) => void;
    /** Clear all sensor tags */
    clearAll: () => void;
    /** Manually refresh the scan (useful for debugging) */
    refreshScan: () => void;
}
/**
 * Hook that manages sensor tag data flow through the FrameEngine2 system.
 *
 * Responsibilities:
 * 1. Scans layout and elements for sensor tag usage
 * 2. Builds registry of inputs (data coming in) and outputs (where it goes)
 * 3. Processes sensorTestValues to populate test data
 * 4. Tracks update rates
 * 5. Provides debug data for visualization
 *
 * @param params - Hook parameters
 * @returns Sensor tag manager interface
 */
export declare function useSensorTagManager(params: UseSensorTagManagerParams): UseSensorTagManagerResult;
//# sourceMappingURL=FrameEngine2_useSensorTagManager.d.ts.map