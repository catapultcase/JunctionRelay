/**
 * Device Data Type Definitions
 *
 * These interfaces provide type safety for device and sensor data
 * throughout the FrameEngine2 system.
 */
/**
 * Sensor definition from device configuration
 */
export interface SensorDefinition {
    tag: string;
    name: string;
    unit?: string;
    type: 'number' | 'string' | 'boolean';
    min?: number;
    max?: number;
    description?: string;
}
/**
 * Device data structure
 */
export interface DeviceData {
    id: string;
    name: string;
    type: string;
    status: 'online' | 'offline';
    sensors?: SensorDefinition[];
    lastSeen?: number;
    metadata?: Record<string, any>;
}
//# sourceMappingURL=DeviceData.d.ts.map