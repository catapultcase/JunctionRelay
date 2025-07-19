// src/hooks/useDashboardWebSocket.ts
import { useEffect, useRef, useState, useCallback } from 'react';

interface DashboardData {
    collectors: any[];
    streams: any[];
    lastUpdate: number;
    connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error' | 'disabled';
}

interface UseDashboardWebSocketReturn extends DashboardData {
    isConnected: boolean;
    reconnect: () => void;
    sendMessage: (message: any) => void;
    connect: () => void;
    disconnect: () => void;
    setPollRate: (rate: number) => void;
    currentPollRate: number;
}

interface WebSocketHookOptions {
    enabled?: boolean;
    url?: string;
    defaultPollRate?: number; // in milliseconds
}

// Poll rate presets for easy selection
export const POLL_RATE_PRESETS = {
    VERY_FAST: 30,    // 30ms - ~33 FPS
    FAST: 100,        // 100ms - 10 FPS  
    NORMAL: 250,      // 250ms - 4 FPS
    SLOW: 500,        // 500ms - 2 FPS
    VERY_SLOW: 1000   // 1000ms - 1 FPS
} as const;

export const POLL_RATE_LABELS = {
    [POLL_RATE_PRESETS.VERY_FAST]: 'Very Fast (30ms)',
    [POLL_RATE_PRESETS.FAST]: 'Fast (100ms)',
    [POLL_RATE_PRESETS.NORMAL]: 'Normal (250ms)',
    [POLL_RATE_PRESETS.SLOW]: 'Slow (500ms)',
    [POLL_RATE_PRESETS.VERY_SLOW]: 'Very Slow (1000ms)'
} as const;

export const useDashboardWebSocket = (options: WebSocketHookOptions = {}): UseDashboardWebSocketReturn => {
    const { enabled = true, url, defaultPollRate = POLL_RATE_PRESETS.NORMAL } = options;

    const ws = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
    const pollIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
    const reconnectAttempts = useRef(0);
    const maxReconnectAttempts = 5;
    const baseReconnectDelay = 1000; // 1 second
    const enabledRef = useRef(enabled);

    // Poll rate state with persistence
    const [pollRate, setPollRateState] = useState<number>(() => {
        const saved = localStorage.getItem('dashboard_websocket_poll_rate');
        return saved ? parseInt(saved, 10) : defaultPollRate;
    });

    const [data, setData] = useState<DashboardData>({
        collectors: [],
        streams: [],
        lastUpdate: 0,
        connectionStatus: enabled ? 'disconnected' : 'disabled'
    });

    const wsUrl = url || `ws://${window.location.host}/api/dashboard-websocket/connect?clientInfo=DashboardApp`;

    // Update enabled ref when prop changes
    useEffect(() => {
        enabledRef.current = enabled;
    }, [enabled]);

    // Save poll rate to localStorage when it changes
    useEffect(() => {
        localStorage.setItem('dashboard_websocket_poll_rate', pollRate.toString());
    }, [pollRate]);

    const setPollRate = useCallback((rate: number) => {
        console.log(`[Dashboard WebSocket] Updating poll rate to ${rate}ms`);
        setPollRateState(rate);

        // Restart polling with new rate if connected
        if (ws.current?.readyState === WebSocket.OPEN) {
            stopPolling();
            startPolling();
        }
    }, []);

    const startPolling = useCallback(() => {
        if (!enabledRef.current || pollIntervalRef.current) {
            return;
        }

        console.log(`[Dashboard WebSocket] Starting polling at ${pollRate}ms intervals`);

        const poll = () => {
            if (ws.current?.readyState === WebSocket.OPEN && enabledRef.current) {
                sendMessage({ type: 'request-collectors' });
                sendMessage({ type: 'request-streams' });
            }
        };

        // Initial poll
        poll();

        // Set up interval
        pollIntervalRef.current = setInterval(poll, pollRate);
    }, [pollRate]);

    const stopPolling = useCallback(() => {
        if (pollIntervalRef.current) {
            console.log('[Dashboard WebSocket] Stopping polling');
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = undefined;
        }
    }, []);

    const connect = useCallback(() => {
        if (!enabledRef.current) {
            console.log('[Dashboard WebSocket] Connection disabled');
            return;
        }

        if (ws.current?.readyState === WebSocket.OPEN) {
            return;
        }

        console.log('[Dashboard WebSocket] Connecting to:', wsUrl);
        setData(prev => ({ ...prev, connectionStatus: 'connecting' }));

        try {
            ws.current = new WebSocket(wsUrl);

            ws.current.onopen = () => {
                console.log('[Dashboard WebSocket] Connected successfully');
                setData(prev => ({ ...prev, connectionStatus: 'connected' }));
                reconnectAttempts.current = 0;

                // Start polling when connection is established
                if (enabledRef.current) {
                    startPolling();
                }
            };

            ws.current.onmessage = (event) => {
                // Only process messages if enabled
                if (!enabledRef.current) return;

                try {
                    const message = JSON.parse(event.data);
                    handleMessage(message);
                } catch (error) {
                    console.error('[Dashboard WebSocket] Error parsing message:', error);
                }
            };

            ws.current.onclose = (event) => {
                console.log('[Dashboard WebSocket] Connection closed:', event.code, event.reason);
                setData(prev => ({
                    ...prev,
                    connectionStatus: enabledRef.current ? 'disconnected' : 'disabled'
                }));

                // Stop polling when connection closes
                stopPolling();

                // Auto-reconnect only if enabled and not a normal closure
                if (enabledRef.current &&
                    event.code !== 1000 &&
                    reconnectAttempts.current < maxReconnectAttempts) {

                    const delay = Math.min(baseReconnectDelay * Math.pow(2, reconnectAttempts.current), 30000);
                    console.log(`[Dashboard WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1})`);

                    reconnectTimeoutRef.current = setTimeout(() => {
                        if (enabledRef.current) { // Double-check enabled state
                            reconnectAttempts.current++;
                            connect();
                        }
                    }, delay);
                }
            };

            ws.current.onerror = (error) => {
                console.error('[Dashboard WebSocket] Connection error:', error);
                setData(prev => ({
                    ...prev,
                    connectionStatus: enabledRef.current ? 'error' : 'disabled'
                }));
                stopPolling();
            };

        } catch (error) {
            console.error('[Dashboard WebSocket] Failed to create connection:', error);
            setData(prev => ({
                ...prev,
                connectionStatus: enabledRef.current ? 'error' : 'disabled'
            }));
        }
    }, [wsUrl, startPolling, stopPolling]);

    const disconnect = useCallback(() => {
        console.log('[Dashboard WebSocket] Manually disconnecting');

        // Stop polling first
        stopPolling();

        // Clear any pending reconnection attempts
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = undefined;
        }

        // Close the WebSocket connection
        if (ws.current) {
            ws.current.close(1000, 'Manual disconnect');
            ws.current = null;
        }

        // Update state
        setData(prev => ({
            ...prev,
            connectionStatus: enabledRef.current ? 'disconnected' : 'disabled'
        }));
    }, [stopPolling]);

    const handleMessage = useCallback((message: any) => {
        // Only handle messages if enabled
        if (!enabledRef.current) return;

        const now = Date.now();

        switch (message.type) {
            case 'collectors-update':
                setData(prev => ({
                    ...prev,
                    collectors: message.data || [],
                    lastUpdate: now
                }));
                break;

            case 'streams-update':
                setData(prev => ({
                    ...prev,
                    streams: message.data || [],
                    lastUpdate: now
                }));
                break;

            case 'pong':
                // Handle ping response
                console.log('[Dashboard WebSocket] Received pong');
                break;

            default:
                console.log('[Dashboard WebSocket] Unknown message type:', message.type);
        }
    }, []);

    const sendMessage = useCallback((message: any) => {
        if (!enabledRef.current) {
            console.warn('[Dashboard WebSocket] Cannot send message - disabled');
            return;
        }

        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify(message));
        } else {
            console.warn('[Dashboard WebSocket] Cannot send message - not connected');
        }
    }, []);

    const reconnect = useCallback(() => {
        if (!enabledRef.current) {
            console.log('[Dashboard WebSocket] Cannot reconnect - disabled');
            return;
        }

        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
        }

        if (ws.current) {
            ws.current.close();
        }

        reconnectAttempts.current = 0;
        connect();
    }, [connect]);

    // Handle enabled state changes
    useEffect(() => {
        if (enabled) {
            console.log('[Dashboard WebSocket] Enabling connection');
            setData(prev => ({
                ...prev,
                connectionStatus: 'disconnected'
            }));
            connect();
        } else {
            console.log('[Dashboard WebSocket] Disabling connection');
            disconnect();
            // Clear data when disabled to free memory
            setData({
                collectors: [],
                streams: [],
                lastUpdate: 0,
                connectionStatus: 'disabled'
            });
        }
    }, [enabled, connect, disconnect]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopPolling();
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (ws.current) {
                ws.current.close(1000, 'Component unmounting');
            }
        };
    }, [stopPolling]);

    return {
        collectors: data.collectors,
        streams: data.streams,
        lastUpdate: data.lastUpdate,
        connectionStatus: data.connectionStatus,
        isConnected: data.connectionStatus === 'connected',
        reconnect,
        sendMessage,
        connect,
        disconnect,
        setPollRate,
        currentPollRate: pollRate
    };
};