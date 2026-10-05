/** Dashboard visualization settings: stored in localStorage and broadcast as 'dashboard-settings-changed'. */
export interface VisualizationSettings {
    bufferSize: number;
    scrollInterval: number; // ms per scroll step
    showLatencyMetrics: boolean;
    autoHideInactive: boolean;
    inactiveThreshold: number; // seconds
    enableTileFlashing: boolean; // Controls background color flashing
}

export const isVisualizationSettings = (value: unknown): value is VisualizationSettings =>
    typeof value === 'object' && value !== null &&
    'bufferSize' in value && typeof value.bufferSize === 'number' &&
    'scrollInterval' in value && typeof value.scrollInterval === 'number' &&
    'showLatencyMetrics' in value && typeof value.showLatencyMetrics === 'boolean' &&
    'autoHideInactive' in value && typeof value.autoHideInactive === 'boolean' &&
    'inactiveThreshold' in value && typeof value.inactiveThreshold === 'number' &&
    'enableTileFlashing' in value && typeof value.enableTileFlashing === 'boolean';

/** Model_StreamHealth_DTO as the dashboard WebSocket sends it (camelCase). */
export interface DashboardStreamHealth {
    connectionState: string;
    successRate: number;
    lastErrorMessage: string | null;
    errorType: string | null;
    consecutiveFailures: number;
    consecutiveSuccesses: number;
    averageLatency: number;
    maxLatency: number;
    minLatency: number;
    lastSuccessTime: string;
    lastFailureTime: string;
    isFrameMode: boolean;
    payloadType: string;
    framesSent: number;
    payloadsSent: number;
    currentFrameLayoutType: string;
    averageFrameSize: number;
    maxFrameSize: number;
    minFrameSize: number;
    averageFrameRenderTime: number;
    maxFrameRenderTime: number;
    minFrameRenderTime: number;
    connectionRecreated: boolean;
    lastWebSocketState: string | null;
    connectionRecreationCount: number;
    poolRecreationCount: number;
    httpStatusCode: number | null;
    comPort: string | null;
    acknowledgmentTimeouts: number;
    publishFailures: number;
    topicLatencies: Record<string, number> | null;
    isGatewayMode: boolean;
    gatewayTarget: string | null;
    gatewayMessagesSent: number;
}

/** Model_StreamInfo_DTO: one entry of a 'streams-update' message. */
export interface DashboardStream {
    streamKey: string;
    protocol: string;
    deviceName: string;
    deviceMac: string;
    screenId: number;
    screenName: string;
    status: string;
    rate: number;
    latency: number;
    lastSentTime: string;
    sensorsCount: number;
    configPayloadPrefix: string;
    configPayloadJson: string;
    lastSentPayloadPrefix: string;
    lastSentPayloadJson: string;
    compressedConfigPayloadPrefix: string;
    compressedLastSentPayloadPrefix: string;
    configPayloadCompressed: string;
    lastSentPayloadCompressed: string;
    hasLastFrame: boolean;
    lastFrameSize: number | null;
    lastFrameTime: string | null;
    lastFrameLayoutType: string;
    isGatewayMode: boolean;
    gatewayTarget: string | null;
    compressionEnabled: boolean;
    mqttConfigPayloadPrefix: string | null;
    mqttConfigPayloadJson: string | null;
    compressedMqttConfigPayloadPrefix: string | null;
    mqttConfigPayloadCompressed: string | null;
    health: DashboardStreamHealth | null;
}

/** Service_Manager_Polling.PolledSensorInfo */
export interface DashboardPolledSensor {
    deviceName: string | null;
    originalId: number;
    name: string;
    externalId: string;
    value: string | null;
    unit: string | null;
}

/** One entry of a 'collectors-update' message (an active poller, built in Service_Manager_WebSocket_Server). */
export interface DashboardCollector {
    sourceKey: string;
    sourceName: string | null;
    sourceType: string;
    status: string;
    sensorCount: number;
    junctionCount: number;
    rate: number;
    lastPollTime: string;
    polledSensors: DashboardPolledSensor[] | null;
}
