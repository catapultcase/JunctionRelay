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

import { useEffect, useRef, useState } from 'react';

export interface NotificationMessage {
    id: string;
    type: string;
    message: string;
    title?: string;
    category: string;
    duration?: number;
    persistent?: boolean;
    timestamp: string;
    expiresAt?: string;
    structuredContent?: string;
}

export const useNotificationWebSocket = () => {
    const [isConnected, setIsConnected] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const reconnectAttempts = useRef(0);
    const maxReconnectAttempts = 10;
    const baseReconnectDelay = 1000; // 1 second

    const getWebSocketUrl = () => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        return `${protocol}//${host}/api/websocket/notifications/connect`;
    };

    const connect = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            console.log('[NotificationWebSocket] Already connected');
            return;
        }

        try {
            const url = getWebSocketUrl();
            console.log('[NotificationWebSocket] Connecting to:', url);

            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('[NotificationWebSocket] Connected');
                setIsConnected(true);
                reconnectAttempts.current = 0;
            };

            ws.onmessage = (event) => {
                try {
                    const notification: NotificationMessage = JSON.parse(event.data);

                    // Dispatch custom event that NotificationContext will catch
                    window.dispatchEvent(new CustomEvent('notification-received', {
                        detail: notification
                    }));
                } catch (error) {
                    console.error('[NotificationWebSocket] Error parsing notification:', error);
                }
            };

            ws.onerror = (error) => {
                console.error('[NotificationWebSocket] WebSocket error:', error);
            };

            ws.onclose = (event) => {
                console.log('[NotificationWebSocket] Disconnected:', event.code, event.reason);
                setIsConnected(false);
                wsRef.current = null;

                // Attempt to reconnect with exponential backoff
                if (reconnectAttempts.current < maxReconnectAttempts) {
                    const delay = Math.min(
                        baseReconnectDelay * Math.pow(2, reconnectAttempts.current),
                        30000 // Max 30 seconds
                    );

                    console.log(`[NotificationWebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);

                    reconnectTimeoutRef.current = setTimeout(() => {
                        reconnectAttempts.current++;
                        connect();
                    }, delay);
                } else {
                    console.error('[NotificationWebSocket] Max reconnect attempts reached');
                }
            };
        } catch (error) {
            console.error('[NotificationWebSocket] Error creating WebSocket:', error);
        }
    };

    const disconnect = () => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        if (wsRef.current) {
            console.log('[NotificationWebSocket] Disconnecting');
            wsRef.current.close();
            wsRef.current = null;
        }

        setIsConnected(false);
    };

    useEffect(() => {
        connect();

        return () => {
            disconnect();
        };
    }, []);

    return {
        isConnected
    };
};
