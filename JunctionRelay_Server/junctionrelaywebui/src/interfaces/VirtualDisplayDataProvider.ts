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

export interface RiveConfig {
    type: "rive_config";
    screenId: string;
    frameConfig: {
        frameConfig?: {
            canvas: { width: number; height: number; orientation: string };
            background: { color: string; type: string };
            rive: {
                enabled: boolean;
                file: string;
                fileUrl?: string;
                discovery?: {
                    machines?: Array<{
                        name: string;
                        inputNames: string[];
                        inputs: Array<{
                            name: string;
                            type: string;
                            currentValue: any;
                        }>;
                    }>;
                };
            };
        };
        canvas?: { width: number; height: number; orientation: string };
        background?: { color: string; type: string };
        rive?: any;
    };
    frameElements?: Array<{
        id: string;
        type: string;
        position: { x: number; y: number; width: number; height: number };
        properties: {
            sensorTag?: string;
            placeholderValue?: string;
            placeholderUnit?: string;
            fontSize?: number;
            fontFamily?: string;
            fontWeight?: string;
            textColor?: string;
            showUnit?: boolean;
            text?: string;
            textAlign?: string;
            placeholderSensorLabel?: string;
            showLabel?: boolean;
            lineHeight?: string;
            backgroundColor?: string;
            color?: string;
            textShadow?: boolean;
            textBorder?: boolean;
        };
    }>;
}

export interface SensorPayload {
    type: "rive_sensor";
    screenId: string;
    sensors: Record<string, {
        value: number;
        unit: string;
        displayValue: string;
    }>;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'disabled';

export interface VirtualDisplayDataProvider {
    // Configuration management
    onConfigurationReceived(callback: (config: RiveConfig) => void): () => void;

    // Sensor data management
    onSensorDataReceived(callback: (data: SensorPayload) => void): () => void;

    // Connection status management
    onConnectionStatusChanged(callback: (status: ConnectionStatus) => void): () => void;

    // Control methods
    connect(): void;
    disconnect(): void;
    isConnected(): boolean;

    // Cleanup
    cleanup(): void;
}