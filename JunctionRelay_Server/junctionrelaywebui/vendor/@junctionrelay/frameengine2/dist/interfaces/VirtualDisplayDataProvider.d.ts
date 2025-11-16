export interface RiveConfig {
    type: "rive_config";
    screenId: string;
    frameConfig: {
        frameConfig?: {
            canvas: {
                width: number;
                height: number;
                orientation: string;
            };
            background: {
                color: string;
                type: string;
            };
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
        canvas?: {
            width: number;
            height: number;
            orientation: string;
        };
        background?: {
            color: string;
            type: string;
        };
        rive?: any;
    };
    frameElements?: Array<{
        id: string;
        type: string;
        position: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
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
    onConfigurationReceived(callback: (config: RiveConfig) => void): () => void;
    onSensorDataReceived(callback: (data: SensorPayload) => void): () => void;
    onConnectionStatusChanged(callback: (status: ConnectionStatus) => void): () => void;
    connect(): void;
    disconnect(): void;
    isConnected(): boolean;
    cleanup(): void;
}
//# sourceMappingURL=VirtualDisplayDataProvider.d.ts.map