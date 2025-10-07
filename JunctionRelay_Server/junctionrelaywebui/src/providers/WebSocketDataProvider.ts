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

/*
 * This file is part of JunctionRelay.
 */

import {
    VirtualDisplayDataProvider,
    RiveConfig,
    SensorPayload,
    ConnectionStatus
} from '../interfaces/VirtualDisplayDataProvider';

export const POLL_RATE_PRESETS = {
    VERY_FAST: 100,
    FAST: 250,
    NORMAL: 500,
    SLOW: 1000,
    VERY_SLOW: 2000
} as const;

export const POLL_RATE_LABELS = {
    [POLL_RATE_PRESETS.VERY_FAST]: 'Very Fast (100ms)',
    [POLL_RATE_PRESETS.FAST]: 'Fast (250ms)',
    [POLL_RATE_PRESETS.NORMAL]: 'Normal (500ms)',
    [POLL_RATE_PRESETS.SLOW]: 'Slow (1000ms)',
    [POLL_RATE_PRESETS.VERY_SLOW]: 'Very Slow (2000ms)'
} as const;

interface DeviceStreamResponse {
    deviceId: string;
    deviceName: string;
    screenId: number;
    configPayload: any;
    sensorPayload: any;
    lastUpdate: string;
    timestamp: string;
}

interface WebSocketDataProviderOptions {
    deviceId?: string;
    enabled?: boolean;
    defaultPollRate?: number;
}

export class WebSocketDataProvider implements VirtualDisplayDataProvider {
    private deviceId?: string;
    private enabled: boolean = true;
    private pollRate: number;
    private pollIntervalRef?: number;
    private isMountedRef: boolean = true;
    private connectionStatus: ConnectionStatus = 'disconnected';
    private abortController?: AbortController;

    private configCallbacks: Array<(config: RiveConfig) => void> = [];
    private sensorCallbacks: Array<(data: SensorPayload) => void> = [];
    private statusCallbacks: Array<(status: ConnectionStatus) => void> = [];

    private lastConfigJson: string | null = null;
    private lastSensorJson: string | null = null;
    private currentConfig: RiveConfig | null = null;

    constructor(options: WebSocketDataProviderOptions = {}) {
        this.deviceId = options.deviceId;
        this.enabled = options.enabled ?? true;
        this.pollRate = options.defaultPollRate ?? POLL_RATE_PRESETS.FAST;
    }

    onConfigurationReceived(callback: (config: RiveConfig) => void): () => void {
        this.configCallbacks.push(callback);
        return () => {
            const index = this.configCallbacks.indexOf(callback);
            if (index > -1) this.configCallbacks.splice(index, 1);
        };
    }

    onSensorDataReceived(callback: (data: SensorPayload) => void): () => void {
        this.sensorCallbacks.push(callback);
        return () => {
            const index = this.sensorCallbacks.indexOf(callback);
            if (index > -1) this.sensorCallbacks.splice(index, 1);
        };
    }

    onConnectionStatusChanged(callback: (status: ConnectionStatus) => void): () => void {
        this.statusCallbacks.push(callback);
        return () => {
            const index = this.statusCallbacks.indexOf(callback);
            if (index > -1) this.statusCallbacks.splice(index, 1);
        };
    }

    connect(): void {
        if (!this.enabled || !this.isMountedRef) return;
        if (this.connectionStatus === 'connected' || this.connectionStatus === 'connecting') return;

        this.setConnectionStatus('connecting');
        this.startPolling();
    }

    disconnect(): void {
        console.log('[WebSocketDataProvider] Disconnect called');
        this.isMountedRef = false;

        // Abort any in-flight requests asynchronously
        if (this.abortController) {
            const controller = this.abortController;
            this.abortController = undefined;

            // Defer the abort to avoid blocking
            setTimeout(() => {
                try {
                    controller.abort();
                } catch (e) {
                    // Ignore abort errors
                }
            }, 0);
        }

        this.stopPolling();
        this.setConnectionStatus('disconnected');
    }

    isConnected(): boolean {
        return this.connectionStatus === 'connected';
    }

    cleanup(): void {
        console.log('[WebSocketDataProvider] Cleanup called');
        this.isMountedRef = false;

        // Abort any in-flight requests asynchronously
        if (this.abortController) {
            const controller = this.abortController;
            this.abortController = undefined;

            setTimeout(() => {
                try {
                    controller.abort();
                } catch (e) {
                    // Ignore abort errors
                }
            }, 0);
        }

        this.stopPolling();

        // Clear callbacks and state asynchronously
        setTimeout(() => {
            this.configCallbacks = [];
            this.sensorCallbacks = [];
            this.statusCallbacks = [];
            this.lastConfigJson = null;
            this.lastSensorJson = null;
            this.currentConfig = null;
        }, 0);
    }

    setPollRate(rate: number): void {
        if (!this.isMountedRef) return;
        this.pollRate = rate;
        localStorage.setItem('virtual_screen_poll_rate', rate.toString());

        if (this.pollIntervalRef) {
            this.stopPolling();
            this.startPolling();
        }
    }

    getCurrentPollRate(): number {
        return this.pollRate;
    }

    private setConnectionStatus(status: ConnectionStatus): void {
        // Don't set status if we're cleaning up
        if (!this.isMountedRef) return;

        if (this.connectionStatus !== status) {
            this.connectionStatus = status;

            // Call callbacks asynchronously to avoid blocking
            const callbacks = [...this.statusCallbacks];
            setTimeout(() => {
                callbacks.forEach((callback) => {
                    try {
                        callback(status);
                    } catch (error) {
                        console.error('[WebSocketDataProvider] Error in status callback:', error);
                    }
                });
            }, 0);
        }
    }

    private startPolling(): void {
        if (!this.enabled || !this.isMountedRef || this.pollIntervalRef) return;

        const poll = async () => {
            if (!this.enabled || !this.isMountedRef) return;

            try {
                await this.fetchDeviceData();
            } catch (error) {
                if (this.isMountedRef) {
                    this.setConnectionStatus('error');
                }
            }
        };

        poll();
        this.pollIntervalRef = window.setInterval(poll, this.pollRate);
    }

    private stopPolling(): void {
        if (this.pollIntervalRef) {
            clearInterval(this.pollIntervalRef);
            this.pollIntervalRef = undefined;
        }
    }

    private async fetchDeviceData(): Promise<void> {
        if (!this.isMountedRef || !this.deviceId) return;

        this.abortController = new AbortController();

        try {
            const response = await fetch(`/api/connections/device/${this.deviceId}`, {
                signal: this.abortController.signal
            });

            if (!this.isMountedRef) return;

            if (!response.ok) {
                if (response.status === 404) {
                    this.setConnectionStatus('connected');
                    return;
                }
                throw new Error(`Device stream fetch failed: ${response.status}`);
            }

            const data: DeviceStreamResponse = await response.json();
            if (!this.isMountedRef) return;

            if (this.connectionStatus !== 'connected') {
                this.setConnectionStatus('connected');
            }

            this.processDeviceData(data);
        } catch (error: any) {
            if (error.name === 'AbortError') return;
            if (this.isMountedRef) {
                this.setConnectionStatus('error');
            }
        }
    }

    private processDeviceData(deviceData: DeviceStreamResponse): void {
        if (!this.isMountedRef) return;

        try {
            const configString = JSON.stringify(deviceData.configPayload);
            if (configString !== this.lastConfigJson) {
                this.lastConfigJson = configString;
                this.processConfigData(deviceData.configPayload);
            }

            const sensorString = JSON.stringify(deviceData.sensorPayload);
            if (sensorString !== this.lastSensorJson) {
                this.lastSensorJson = sensorString;
                this.processSensorData(deviceData.sensorPayload);
            }
        } catch (error) {
            // Silent
        }
    }

    private processConfigData(configPayload: any): void {
        if (!this.isMountedRef) return;

        try {
            const isRiveConfig = configPayload?.type === 'rive_config' ||
                (configPayload?.frameConfig && configPayload?.frameElements);

            if (isRiveConfig && this.isMountedRef) {
                this.currentConfig = configPayload as RiveConfig;
                this.configCallbacks.forEach((callback) => {
                    if (!this.isMountedRef) return;
                    try {
                        callback(configPayload as RiveConfig);
                    } catch (error) {
                        console.error('[WebSocketDataProvider] Error in config callback:', error);
                    }
                });
            }
        } catch (error) {
            // Silent
        }
    }

    private processSensorData(sensorPayload: any): void {
        if (!this.isMountedRef) return;

        try {
            const isValidSensor = sensorPayload?.type === 'rive_sensor' && sensorPayload?.sensors;

            if (isValidSensor && this.isMountedRef) {
                const enhancedSensorPayload = this.enhanceSensorDataWithDisplayValues(sensorPayload);
                this.sensorCallbacks.forEach((callback) => {
                    if (!this.isMountedRef) return;
                    try {
                        callback(enhancedSensorPayload as SensorPayload);
                    } catch (error) {
                        console.error('[WebSocketDataProvider] Error in sensor callback:', error);
                    }
                });
            }
        } catch (error) {
            // Silent
        }
    }

    private enhanceSensorDataWithDisplayValues(sensorPayload: any): any {
        if (!this.currentConfig?.frameElements) return sensorPayload;

        const enhanced = JSON.parse(JSON.stringify(sensorPayload));
        const sensorConfigs = new Map<string, any>();

        if (Array.isArray(this.currentConfig.frameElements)) {
            this.currentConfig.frameElements.forEach((element: any) => {
                if (element.type === 'sensor' && element.properties?.sensorTag) {
                    sensorConfigs.set(element.properties.sensorTag, element.properties);
                }
            });
        }

        Object.entries(enhanced.sensors).forEach(([sensorTag, sensorData]: [string, any]) => {
            const config = sensorConfigs.get(sensorTag);

            if (config) {
                const displayValue = this.buildDisplayValue(
                    sensorData.value,
                    sensorData.unit || '',
                    config.showLabel ? config.placeholderSensorLabel : null,
                    config.showUnit || false,
                    config.showLabel || false
                );

                enhanced.sensors[sensorTag] = {
                    ...sensorData,
                    displayValue: displayValue
                };
            } else {
                enhanced.sensors[sensorTag] = {
                    ...sensorData,
                    displayValue: `${sensorData.value}${sensorData.unit ? ' ' + sensorData.unit : ''}`
                };
            }
        });

        return enhanced;
    }

    private buildDisplayValue(value: any, unit: string, label: string | null, showUnit: boolean, showLabel: boolean): string {
        const parts: string[] = [];
        if (showLabel && label) parts.push(label);
        parts.push(value.toString());
        if (showUnit && unit) parts.push(unit);
        return parts.join(' ');
    }
}