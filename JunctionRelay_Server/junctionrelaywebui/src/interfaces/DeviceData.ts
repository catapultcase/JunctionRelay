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
