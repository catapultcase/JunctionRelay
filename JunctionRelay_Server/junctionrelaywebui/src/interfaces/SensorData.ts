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
export function isSensorData(data: unknown): data is SensorData {
    return (
        typeof data === 'object' &&
        data !== null &&
        'value' in data
    );
}

/**
 * Safely extract value from sensor data or primitive
 *
 * @param sensorData Sensor data (can be SensorData object or primitive value)
 * @returns The sensor value
 */
export function getSensorValue(sensorData: unknown): number | string | boolean | undefined {
    if (isSensorData(sensorData)) {
        return sensorData.value;
    }
    // Return primitive value directly
    if (typeof sensorData === 'number' || typeof sensorData === 'string' || typeof sensorData === 'boolean') {
        return sensorData;
    }
    return undefined;
}
