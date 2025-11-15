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

import { useEffect, useRef, useState, useCallback } from 'react';

export interface SensorData {
    id: number;
    originalId: number;
    junctionId: number;
    junctionDeviceLinkId: number | null;
    junctionCollectorLinkId: number | null;
    sensorOrder: number;
    mqttServiceId: number | null;
    mqttTopic: string | null;
    mqttQoS: number | null;
    sensorType: string;
    externalId: string;
    deviceName: string;
    name: string;
    componentName: string;
    category: string;
    unit: string;
    value: string;
    decimalPlaces: number;
    sensorTag: string;
    formula: string | null;
    lastUpdated: string;
    customAttribute1: string | null;
    customAttribute2: string | null;
    customAttribute3: string | null;
    customAttribute4: string | null;
    customAttribute5: string | null;
    customAttribute6: string | null;
    customAttribute7: string | null;
    customAttribute8: string | null;
    customAttribute9: string | null;
    customAttribute10: string | null;
    isMissing: boolean;
    isStale: boolean;
    isSelected: boolean;
    isVisible: boolean;
    deviceId: number | null;
    serviceId: number | null;
    collectorId: number;
}

export interface GlobalSensorCacheData {
    sensors: SensorData[];
    lastUpdate: number;
    connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error' | 'disabled';
}

interface WebSocketHookOptions {
    enabled?: boolean;
    url?: string;
    defaultPollRate?: number;
}

// Poll rate presets for easy selection
export const SENSOR_CACHE_POLL_RATE_PRESETS = {
    VERY_FAST: 50,
    FAST: 250,
    NORMAL: 500,
    SLOW: 1000,
    VERY_SLOW: 5000
} as const;

export const SENSOR_CACHE_POLL_RATE_LABELS = {
    [SENSOR_CACHE_POLL_RATE_PRESETS.VERY_FAST]: 'Very Fast (50ms)',
    [SENSOR_CACHE_POLL_RATE_PRESETS.FAST]: 'Fast (250ms)',
    [SENSOR_CACHE_POLL_RATE_PRESETS.NORMAL]: 'Normal (500ms)',
    [SENSOR_CACHE_POLL_RATE_PRESETS.SLOW]: 'Slow (1000ms)',
    [SENSOR_CACHE_POLL_RATE_PRESETS.VERY_SLOW]: 'Very Slow (5000ms)'
} as const;

// Storage key for poll rate persistence
const STORAGE_KEY_POLL_RATE = "junctionrelay_sensor_cache_poll_rate";

export const useGlobalSensorCacheWebSocket = (options: WebSocketHookOptions = {}) => {
    const { enabled = true, url, defaultPollRate = SENSOR_CACHE_POLL_RATE_PRESETS.NORMAL } = options;
    const ws = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<number | undefined>(undefined);
    const pollIntervalRef = useRef<number | undefined>(undefined);

    const [data, setData] = useState<GlobalSensorCacheData>({
        sensors: [],
        lastUpdate: 0,
        connectionStatus: enabled ? 'disconnected' : 'disabled'
    });

    // Initialize poll rate from localStorage or use default
    const [currentPollRate, setCurrentPollRate] = useState<number>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_POLL_RATE);
            if (stored) {
                const parsed = parseInt(stored, 10);
                // Validate that the stored value is a valid poll rate
                if (!isNaN(parsed) && parsed > 0) {
                    return parsed;
                }
            }
        } catch (e) {
            console.warn('[WebSocket] Failed to load poll rate from storage:', e);
        }
        return defaultPollRate;
    });

    const wsUrl = url || `ws://${window.location.host}/api/websocket/sensor-cache/connect`;

    const connect = useCallback(() => {
        if (!enabled) return;
        if (ws.current?.readyState === WebSocket.OPEN) return;

        ws.current = new WebSocket(wsUrl);

        ws.current.onopen = () => {
            setData(prev => ({ ...prev, connectionStatus: 'connected' }));
        };

        ws.current.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'sensor-cache-update') {
                    setData(prev => ({
                        ...prev,
                        sensors: message.data || [],
                        lastUpdate: Date.now()
                    }));
                }
            } catch (err) {
                console.error('[WebSocket] Failed to parse message:', err);
            }
        };

        ws.current.onclose = () => {
            console.warn('[WebSocket] Disconnected');
            setData(prev => ({ ...prev, connectionStatus: 'disconnected' }));
        };

        ws.current.onerror = (err) => {
            console.error('[WebSocket] Error', err);
            setData(prev => ({ ...prev, connectionStatus: 'error' }));
        };
    }, [wsUrl, enabled]);

    const disconnect = useCallback(() => {
        if (ws.current) {
            ws.current.close(1000, 'Manual disconnect');
            ws.current = null;
        }
        setData(prev => ({ ...prev, connectionStatus: 'disconnected' }));
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = undefined;
        }
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = undefined;
        }
    }, []);

    const sendMessage = useCallback((message: any) => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify(message));
        }
    }, []);

    // Polling logic
    useEffect(() => {
        if (!enabled) return;

        connect();

        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = window.setInterval(() => {
            if (ws.current?.readyState === WebSocket.OPEN) {
                sendMessage({ type: 'request-sensor-cache' });
            }
        }, currentPollRate);

        return () => {
            disconnect();
        };
    }, [enabled, connect, disconnect, sendMessage, currentPollRate]);

    const setPollRate = useCallback((rate: number) => {
        setCurrentPollRate(rate);

        // Persist to localStorage
        try {
            localStorage.setItem(STORAGE_KEY_POLL_RATE, rate.toString());
        } catch (e) {
            console.warn('[WebSocket] Failed to save poll rate to localStorage:', e);
        }
    }, []);

    return {
        sensors: data.sensors,
        lastUpdate: data.lastUpdate,
        connectionStatus: data.connectionStatus,
        isConnected: data.connectionStatus === 'connected',
        currentPollRate,
        setPollRate,
        connect,
        disconnect,
        sendMessage
    };
};

// ================================
// MQTT HOOK
// ================================

export interface MqttPayloadData {
    topic: string;
    payload: string;
    timestamp: number;
    serviceId: number;
    serviceName?: string;
    qos?: number;
}

export interface MqttServiceData {
    serviceId: number;
    serviceName?: string;
    payloads: Record<string, MqttPayloadData>; // topic -> latest payload
    subscriptions: Array<{
        topic: string;
        qos: number;
    }>;
    connectionStatus: 'connected' | 'disconnected' | 'error';
    lastUpdate: number;
}

export interface MqttCacheData {
    services: Record<number, MqttServiceData>; // serviceId -> service data
    lastUpdate: number;
    connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error' | 'disabled';
}

interface MqttWebSocketHookOptions {
    enabled?: boolean;
    url?: string;
    defaultPollRate?: number;
}

// Storage keys for MQTT hook persistence
const MQTT_STORAGE_KEY_POLL_RATE = "junctionrelay_mqtt_cache_poll_rate";

export const useMqttCacheWebSocket = (options: MqttWebSocketHookOptions = {}) => {
    const { enabled = true, url, defaultPollRate = SENSOR_CACHE_POLL_RATE_PRESETS.NORMAL } = options;
    const ws = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<number | undefined>(undefined);
    const pollIntervalRef = useRef<number | undefined>(undefined);

    const [data, setData] = useState<MqttCacheData>({
        services: {},
        lastUpdate: 0,
        connectionStatus: enabled ? 'disconnected' : 'disabled'
    });

    // Initialize poll rate from localStorage or use default
    const [currentPollRate, setCurrentPollRate] = useState<number>(() => {
        try {
            const stored = localStorage.getItem(MQTT_STORAGE_KEY_POLL_RATE);
            if (stored) {
                const parsed = parseInt(stored, 10);
                if (!isNaN(parsed) && parsed > 0) {
                    return parsed;
                }
            }
        } catch (e) {
            console.warn('[MQTT WebSocket] Failed to load poll rate from storage:', e);
        }
        return defaultPollRate;
    });

    const wsUrl = url || `ws://${window.location.host}/api/websocket/mqtt-cache/connect`;

    const connect = useCallback(() => {
        if (!enabled) return;
        if (ws.current?.readyState === WebSocket.OPEN) return;

        ws.current = new WebSocket(wsUrl);

        ws.current.onopen = () => {
            setData(prev => ({ ...prev, connectionStatus: 'connected' }));
        };

        ws.current.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);

                if (message.type === 'mqtt-services-update') {
                    setData(prev => ({
                        ...prev,
                        services: message.data || {},
                        lastUpdate: Date.now()
                    }));
                } else if (message.type === 'mqtt-payload-update') {
                    // Handle individual MQTT payload updates
                    const { serviceId, topic, payload: payloadContent, qos } = message.data;

                    setData(prev => {
                        const updatedServices = { ...prev.services };
                        if (!updatedServices[serviceId]) {
                            updatedServices[serviceId] = {
                                serviceId,
                                payloads: {},
                                subscriptions: [],
                                connectionStatus: 'connected',
                                lastUpdate: Date.now()
                            };
                        }

                        updatedServices[serviceId].payloads[topic] = {
                            topic,
                            payload: payloadContent,
                            timestamp: Date.now(),
                            serviceId,
                            qos
                        };
                        updatedServices[serviceId].lastUpdate = Date.now();

                        return {
                            ...prev,
                            services: updatedServices,
                            lastUpdate: Date.now()
                        };
                    });
                } else if (message.type === 'error') {
                    console.error('[MQTT WebSocket] Server error:', message.message);
                    setData(prev => ({ ...prev, connectionStatus: 'error' }));
                }
            } catch (err) {
                console.error('[MQTT WebSocket] Failed to parse message:', err);
            }
        };

        ws.current.onclose = () => {
            console.warn('[MQTT WebSocket] Disconnected');
            setData(prev => ({ ...prev, connectionStatus: 'disconnected' }));
        };

        ws.current.onerror = (err) => {
            console.error('[MQTT WebSocket] Error', err);
            setData(prev => ({ ...prev, connectionStatus: 'error' }));
        };
    }, [wsUrl, enabled]);

    const disconnect = useCallback(() => {
        if (ws.current) {
            ws.current.close(1000, 'Manual disconnect');
            ws.current = null;
        }
        setData(prev => ({ ...prev, connectionStatus: 'disconnected' }));
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = undefined;
        }
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = undefined;
        }
    }, []);

    const sendMessage = useCallback((message: any) => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify(message));
        }
    }, []);

    // Polling logic
    useEffect(() => {
        if (!enabled) return;

        connect();

        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = window.setInterval(() => {
            if (ws.current?.readyState === WebSocket.OPEN) {
                sendMessage({ type: 'request-mqtt-services' });
            }
        }, currentPollRate);

        return () => {
            disconnect();
        };
    }, [enabled, connect, disconnect, sendMessage, currentPollRate]);

    const setPollRate = useCallback((rate: number) => {
        setCurrentPollRate(rate);

        // Persist to localStorage
        try {
            localStorage.setItem(MQTT_STORAGE_KEY_POLL_RATE, rate.toString());
        } catch (e) {
            console.warn('[MQTT WebSocket] Failed to save poll rate to localStorage:', e);
        }
    }, []);

    // Helper functions for MQTT data access
    const getMqttPayloadsByService = useCallback((serviceId: number) => {
        return data.services[serviceId]?.payloads || {};
    }, [data.services]);

    const getMqttPayloadByTopic = useCallback((serviceId: number, topic: string) => {
        return data.services[serviceId]?.payloads[topic] || null;
    }, [data.services]);

    const getAllMqttPayloads = useCallback(() => {
        const allPayloads: MqttPayloadData[] = [];
        Object.values(data.services).forEach(service => {
            Object.values(service.payloads).forEach(payload => {
                allPayloads.push(payload);
            });
        });
        return allPayloads.sort((a, b) => b.timestamp - a.timestamp);
    }, [data.services]);

    const getMqttServices = useCallback(() => {
        return Object.values(data.services);
    }, [data.services]);

    return {
        // MQTT data
        services: data.services,
        getMqttPayloadsByService,
        getMqttPayloadByTopic,
        getAllMqttPayloads,
        getMqttServices,

        // Configuration
        lastUpdate: data.lastUpdate,
        connectionStatus: data.connectionStatus,
        isConnected: data.connectionStatus === 'connected',
        currentPollRate,
        setPollRate,

        // Connection control
        connect,
        disconnect,
        sendMessage
    };
};

// ================================
// EVENT SENSOR HOOK
// ================================

export interface EventSensorData {
    id: number;
    originalId: number;
    junctionId?: number;
    junctionDeviceLinkId?: number;
    junctionCollectorLinkId?: number;
    sensorOrder: number;
    mqttServiceId?: number;
    mqttTopic?: string;
    mqttQoS?: number;
    sensorType: string;
    externalId: string;
    deviceName: string;
    name: string;
    componentName: string;
    category: string;
    unit: string;
    value: string;
    decimalPlaces: number;
    sensorTag: string;
    formula?: string;
    lastUpdated?: string;
    customAttribute1?: string;
    customAttribute2?: string;
    customAttribute3?: string;
    customAttribute4?: string;
    customAttribute5?: string;
    customAttribute6?: string;
    customAttribute7?: string;
    customAttribute8?: string;
    customAttribute9?: string;
    customAttribute10?: string;
    isMissing: boolean;
    isStale: boolean;
    isSelected: boolean;
    isVisible: boolean;
    isCustomJunctionSensor: boolean;
    isEventSensor: boolean;
    deviceId?: number;
    serviceId?: number;
    collectorId?: number;
}

export interface EventSensorCacheData {
    eventSensors: EventSensorData[];
    lastUpdate: number;
    connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error' | 'disabled';
}

interface EventSensorWebSocketHookOptions {
    enabled?: boolean;
    url?: string;
    defaultPollRate?: number;
}

// Storage keys for Event Sensor hook persistence
const EVENT_SENSOR_STORAGE_KEY_POLL_RATE = "junctionrelay_event_sensor_cache_poll_rate";

export const useEventSensorCacheWebSocket = (options: EventSensorWebSocketHookOptions = {}) => {
    const { enabled = true, url, defaultPollRate = SENSOR_CACHE_POLL_RATE_PRESETS.NORMAL } = options;
    const ws = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<number | undefined>(undefined);
    const pollIntervalRef = useRef<number | undefined>(undefined);

    const [data, setData] = useState<EventSensorCacheData>({
        eventSensors: [],
        lastUpdate: 0,
        connectionStatus: enabled ? 'disconnected' : 'disabled'
    });

    // Initialize poll rate from localStorage or use default
    const [currentPollRate, setCurrentPollRate] = useState<number>(() => {
        try {
            const stored = localStorage.getItem(EVENT_SENSOR_STORAGE_KEY_POLL_RATE);
            if (stored) {
                const parsed = parseInt(stored, 10);
                if (!isNaN(parsed) && parsed > 0) {
                    return parsed;
                }
            }
        } catch (e) {
            console.warn('[Event Sensor WebSocket] Failed to load poll rate from storage:', e);
        }
        return defaultPollRate;
    });

    const wsUrl = url || `ws://${window.location.host}/api/websocket/event-cache/connect`;

    const connect = useCallback(() => {
        if (!enabled) return;
        if (ws.current?.readyState === WebSocket.OPEN) return;

        ws.current = new WebSocket(wsUrl);

        ws.current.onopen = () => {
            setData(prev => ({ ...prev, connectionStatus: 'connected' }));
        };

        ws.current.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);

                if (message.type === 'event-sensors-update') {
                    setData(prev => ({
                        ...prev,
                        eventSensors: message.data || [],
                        lastUpdate: Date.now()
                    }));
                } else if (message.type === 'error') {
                    console.error('[Event Sensor WebSocket] Server error:', message.message);
                    setData(prev => ({ ...prev, connectionStatus: 'error' }));
                }
            } catch (err) {
                console.error('[Event Sensor WebSocket] Failed to parse message:', err);
            }
        };

        ws.current.onclose = () => {
            console.warn('[Event Sensor WebSocket] Disconnected');
            setData(prev => ({ ...prev, connectionStatus: 'disconnected' }));
        };

        ws.current.onerror = (err) => {
            console.error('[Event Sensor WebSocket] Error', err);
            setData(prev => ({ ...prev, connectionStatus: 'error' }));
        };
    }, [wsUrl, enabled]);

    const disconnect = useCallback(() => {
        if (ws.current) {
            ws.current.close(1000, 'Manual disconnect');
            ws.current = null;
        }
        setData(prev => ({ ...prev, connectionStatus: 'disconnected' }));
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = undefined;
        }
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = undefined;
        }
    }, []);

    const sendMessage = useCallback((message: any) => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify(message));
        }
    }, []);

    // Polling logic
    useEffect(() => {
        if (!enabled) return;

        connect();

        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = window.setInterval(() => {
            if (ws.current?.readyState === WebSocket.OPEN) {
                sendMessage({ type: 'request-event-sensors' });
            }
        }, currentPollRate);

        return () => {
            disconnect();
        };
    }, [enabled, connect, disconnect, sendMessage, currentPollRate]);

    const setPollRate = useCallback((rate: number) => {
        setCurrentPollRate(rate);

        // Persist to localStorage
        try {
            localStorage.setItem(EVENT_SENSOR_STORAGE_KEY_POLL_RATE, rate.toString());
        } catch (e) {
            console.warn('[Event Sensor WebSocket] Failed to save poll rate to localStorage:', e);
        }
    }, []);

    // Helper functions for Event Sensor data access
    const getEventSensorById = useCallback((id: number) => {
        return data.eventSensors.find(sensor => sensor.id === id);
    }, [data.eventSensors]);

    const getEventSensorByTag = useCallback((tag: string) => {
        return data.eventSensors.find(sensor => sensor.sensorTag.toLowerCase() === tag.toLowerCase());
    }, [data.eventSensors]);

    const getEventSensorsByCategory = useCallback((category: string) => {
        return data.eventSensors.filter(sensor => sensor.category.toLowerCase() === category.toLowerCase());
    }, [data.eventSensors]);

    const getEventSensorsByType = useCallback((type: string) => {
        return data.eventSensors.filter(sensor => sensor.sensorType.toLowerCase() === type.toLowerCase());
    }, [data.eventSensors]);

    const getAllEventSensors = useCallback(() => {
        return data.eventSensors;
    }, [data.eventSensors]);

    return {
        // Event Sensor data
        eventSensors: data.eventSensors,
        getEventSensorById,
        getEventSensorByTag,
        getEventSensorsByCategory,
        getEventSensorsByType,
        getAllEventSensors,

        // Configuration
        lastUpdate: data.lastUpdate,
        connectionStatus: data.connectionStatus,
        isConnected: data.connectionStatus === 'connected',
        currentPollRate,
        setPollRate,

        // Connection control
        connect,
        disconnect,
        sendMessage
    };
};

// ================================
// EVENT RULES HOOK (NEW)
// ================================

export interface EventRuleTriggerData {
    id?: number;
    eventRuleId?: number;
    triggerOrder: number;
    isActive: boolean;
    triggerType: string;
    triggerSensorId: number | null;
    triggerSensorName?: string;
    triggerCondition: string;
    triggerValue: string;
    triggerDebounceMs: number;
}

export interface EventRuleActionData {
    id?: number;
    eventRuleId?: number;
    actionOrder: number;
    isActive: boolean;
    delayBeforeNextMs: number;
    actionType: string;
    actionTargetSensorId?: number | null;
    actionTargetSensorName?: string;
    actionStaticValue?: string;
    actionTransform?: string;
    actionJunctionId?: number | null;
    actionJunctionName?: string;
    actionMqttTopic?: string;
    actionMqttPayload?: string;
    actionMqttServiceId?: number | null;
    actionHttpUrl?: string;
    actionHttpMethod?: string;
    actionHttpPayload?: string;
}

export interface EventRuleData {
    id: number;
    name: string;
    description: string;
    enabled: boolean;
    triggerLogic: string;
    triggers: EventRuleTriggerData[];
    actions: EventRuleActionData[];
    lastTriggered?: string;
    triggerCount: number;
    createdAt?: string;
    updatedAt?: string;
}

export interface EventRulesCacheData {
    eventRules: EventRuleData[];
    lastUpdate: number;
    connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error' | 'disabled';
}

interface EventRulesWebSocketHookOptions {
    enabled?: boolean;
    url?: string;
    defaultPollRate?: number;
}

// Storage keys for Event Rules hook persistence
const EVENT_RULES_STORAGE_KEY_POLL_RATE = "junctionrelay_event_rules_cache_poll_rate";

export const useEventRulesCacheWebSocket = (options: EventRulesWebSocketHookOptions = {}) => {
    const { enabled = true, url, defaultPollRate = SENSOR_CACHE_POLL_RATE_PRESETS.NORMAL } = options;
    const ws = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<number | undefined>(undefined);
    const pollIntervalRef = useRef<number | undefined>(undefined);

    const [data, setData] = useState<EventRulesCacheData>({
        eventRules: [],
        lastUpdate: 0,
        connectionStatus: enabled ? 'disconnected' : 'disabled'
    });

    // Initialize poll rate from localStorage or use default
    const [currentPollRate, setCurrentPollRate] = useState<number>(() => {
        try {
            const stored = localStorage.getItem(EVENT_RULES_STORAGE_KEY_POLL_RATE);
            if (stored) {
                const parsed = parseInt(stored, 10);
                if (!isNaN(parsed) && parsed > 0) {
                    return parsed;
                }
            }
        } catch (e) {
            console.warn('[Event Rules WebSocket] Failed to load poll rate from storage:', e);
        }
        return defaultPollRate;
    });

    const wsUrl = url || `ws://${window.location.host}/api/websocket/event-rules-cache/connect`;

    const connect = useCallback(() => {
        if (!enabled) return;
        if (ws.current?.readyState === WebSocket.OPEN) return;

        ws.current = new WebSocket(wsUrl);

        ws.current.onopen = () => {
            setData(prev => ({ ...prev, connectionStatus: 'connected' }));
        };

        ws.current.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);

                if (message.type === 'event-rules-update') {
                    setData(prev => ({
                        ...prev,
                        eventRules: message.data || [],
                        lastUpdate: Date.now()
                    }));
                } else if (message.type === 'error') {
                    console.error('[Event Rules WebSocket] Server error:', message.message);
                    setData(prev => ({ ...prev, connectionStatus: 'error' }));
                }
            } catch (err) {
                console.error('[Event Rules WebSocket] Failed to parse message:', err);
            }
        };

        ws.current.onclose = () => {
            console.warn('[Event Rules WebSocket] Disconnected');
            setData(prev => ({ ...prev, connectionStatus: 'disconnected' }));
        };

        ws.current.onerror = (err) => {
            console.error('[Event Rules WebSocket] Error', err);
            setData(prev => ({ ...prev, connectionStatus: 'error' }));
        };
    }, [wsUrl, enabled]);

    const disconnect = useCallback(() => {
        if (ws.current) {
            ws.current.close(1000, 'Manual disconnect');
            ws.current = null;
        }
        setData(prev => ({ ...prev, connectionStatus: 'disconnected' }));
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = undefined;
        }
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = undefined;
        }
    }, []);

    const sendMessage = useCallback((message: any) => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify(message));
        }
    }, []);

    // Polling logic
    useEffect(() => {
        if (!enabled) return;

        connect();

        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = window.setInterval(() => {
            if (ws.current?.readyState === WebSocket.OPEN) {
                sendMessage({ type: 'request-event-rules' });
            }
        }, currentPollRate);

        return () => {
            disconnect();
        };
    }, [enabled, connect, disconnect, sendMessage, currentPollRate]);

    const setPollRate = useCallback((rate: number) => {
        setCurrentPollRate(rate);

        // Persist to localStorage
        try {
            localStorage.setItem(EVENT_RULES_STORAGE_KEY_POLL_RATE, rate.toString());
        } catch (e) {
            console.warn('[Event Rules WebSocket] Failed to save poll rate to localStorage:', e);
        }
    }, []);

    // Helper functions for Event Rules data access
    const getEventRuleById = useCallback((id: number) => {
        return data.eventRules.find(rule => rule.id === id);
    }, [data.eventRules]);

    const getEventRulesByEnabled = useCallback((enabled: boolean) => {
        return data.eventRules.filter(rule => rule.enabled === enabled);
    }, [data.eventRules]);

    const getEventRulesBySensorId = useCallback((sensorId: number) => {
        return data.eventRules.filter(rule =>
            rule.triggers.some(t => t.triggerSensorId === sensorId) ||
            rule.actions.some(a => a.actionTargetSensorId === sensorId)
        );
    }, [data.eventRules]);

    const getAllEventRules = useCallback(() => {
        return data.eventRules;
    }, [data.eventRules]);

    return {
        // Event Rules data
        eventRules: data.eventRules,
        getEventRuleById,
        getEventRulesByEnabled,
        getEventRulesBySensorId,
        getAllEventRules,

        // Configuration
        lastUpdate: data.lastUpdate,
        connectionStatus: data.connectionStatus,
        isConnected: data.connectionStatus === 'connected',
        currentPollRate,
        setPollRate,

        // Connection control
        connect,
        disconnect,
        sendMessage
    };
};