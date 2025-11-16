/**
 * Sensor Data Type Definitions
 *
 * These interfaces and type guards provide type safety for sensor data
 * flowing through the system via WebSocket and other data providers.
 */
/**
 * Sensor data structure with metadata
 */
export interface SensorData {
    value: number | string | boolean;
    unit?: string;
    timestamp?: number;
}
/**
 * Type guard to check if data is SensorData
 *
 * @param data Unknown data to check
 * @returns True if data matches SensorData interface
 */
export declare function isSensorData(data: unknown): data is SensorData;
/**
 * Safely extract value from sensor data or primitive
 *
 * @param sensorData Sensor data (can be SensorData object or primitive value)
 * @returns The sensor value
 */
export declare function getSensorValue(sensorData: unknown): number | string | boolean | undefined;
//# sourceMappingURL=SensorData.d.ts.map