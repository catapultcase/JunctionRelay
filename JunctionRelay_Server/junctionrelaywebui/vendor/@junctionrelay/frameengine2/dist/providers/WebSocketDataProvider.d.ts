import { VirtualDisplayDataProvider, RiveConfig, SensorPayload, ConnectionStatus } from '../interfaces/VirtualDisplayDataProvider';

export declare const POLL_RATE_PRESETS: {
    readonly VERY_FAST: 100;
    readonly FAST: 250;
    readonly NORMAL: 500;
    readonly SLOW: 1000;
    readonly VERY_SLOW: 2000;
};
export declare const POLL_RATE_LABELS: {
    readonly 100: "Very Fast (100ms)";
    readonly 250: "Fast (250ms)";
    readonly 500: "Normal (500ms)";
    readonly 1000: "Slow (1000ms)";
    readonly 2000: "Very Slow (2000ms)";
};
interface WebSocketDataProviderOptions {
    deviceId?: string;
    enabled?: boolean;
    defaultPollRate?: number;
}
export declare class WebSocketDataProvider implements VirtualDisplayDataProvider {
    private deviceId?;
    private enabled;
    private pollRate;
    private pollIntervalRef?;
    private isMountedRef;
    private connectionStatus;
    private abortController?;
    private configCallbacks;
    private sensorCallbacks;
    private statusCallbacks;
    private lastConfigJson;
    private lastSensorJson;
    private currentConfig;
    constructor(options?: WebSocketDataProviderOptions);
    onConfigurationReceived(callback: (config: RiveConfig) => void): () => void;
    onSensorDataReceived(callback: (data: SensorPayload) => void): () => void;
    onConnectionStatusChanged(callback: (status: ConnectionStatus) => void): () => void;
    connect(): void;
    disconnect(): void;
    isConnected(): boolean;
    cleanup(): void;
    setPollRate(rate: number): void;
    getCurrentPollRate(): number;
    private setConnectionStatus;
    private startPolling;
    private stopPolling;
    private fetchDeviceData;
    private processDeviceData;
    private processConfigData;
    private processSensorData;
    private enhanceSensorDataWithDisplayValues;
    private buildDisplayValue;
}
export {};
//# sourceMappingURL=WebSocketDataProvider.d.ts.map