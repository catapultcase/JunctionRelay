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

import { useEffect, useRef } from 'react';

// Message type discriminator
type UnifiedNotificationMessage =
    | { type: 'notification'; payload: any }
    | { type: 'junction-progress'; payload: any }
    | { type: 'template-version-progress'; payload: any };

interface UnifiedNotificationCallbacks {
    onNotification?: (payload: any) => void;
    onJunctionProgress?: (payload: any) => void;
    onTemplateVersionProgress?: (payload: any) => void;
}

export const useUnifiedNotificationWebSocket = (callbacks: UnifiedNotificationCallbacks) => {
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const callbacksRef = useRef(callbacks);

    // Keep callbacks ref up to date
    useEffect(() => {
        callbacksRef.current = callbacks;
    }, [callbacks]);

    useEffect(() => {
        let isActive = true;
        console.log('[UnifiedNotifications] useEffect RUNNING - creating WebSocket connection');

        const connect = () => {
            console.log('[UnifiedNotifications] connect() called, isActive:', isActive);

            // Clean up existing connection
            if (wsRef.current) {
                console.log('[UnifiedNotifications] Closing existing WebSocket before reconnect');
                wsRef.current.close();
            }

            const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            const wsUrl = `${protocol}//${window.location.host}/api/websocket/notifications/connect`;

            try {
                console.log('[UnifiedNotifications] Creating new WebSocket:', wsUrl);
                const ws = new WebSocket(wsUrl);

                ws.onopen = () => {
                    console.log('[UnifiedNotifications] WebSocket OPENED');
                };

                ws.onmessage = (event) => {
                    try {
                        const message: UnifiedNotificationMessage = JSON.parse(event.data);

                        // Route message based on type
                        switch (message.type) {
                            case 'notification':
                                callbacksRef.current.onNotification?.(message.payload);
                                break;
                            case 'junction-progress':
                                callbacksRef.current.onJunctionProgress?.(message.payload);
                                break;
                            case 'template-version-progress':
                                callbacksRef.current.onTemplateVersionProgress?.(message.payload);
                                break;
                            default:
                                console.warn('[UnifiedNotifications] Unknown message type:', message);
                        }
                    } catch (error) {
                        console.error("[UnifiedNotifications WebSocket] Error parsing message:", error);
                    }
                };

                ws.onerror = (error) => {
                    console.error("[UnifiedNotifications WebSocket] Connection error:", error);
                };

                ws.onclose = () => {
                    console.log('[UnifiedNotifications] WebSocket CLOSED, isActive:', isActive);
                    // Only reconnect if component is still mounted
                    if (isActive) {
                        console.log('[UnifiedNotifications] Scheduling reconnect in 3s...');
                        reconnectTimeoutRef.current = setTimeout(() => {
                            connect();
                        }, 3000);
                    } else {
                        console.log('[UnifiedNotifications] NOT reconnecting - component unmounted');
                    }
                };

                wsRef.current = ws;
            } catch (error) {
                console.error("[UnifiedNotifications WebSocket] Failed to connect:", error);
                // Retry connection after 5 seconds if still mounted
                if (isActive) {
                    reconnectTimeoutRef.current = setTimeout(() => {
                        connect();
                    }, 5000);
                }
            }
        };

        connect();

        return () => {
            console.log('[UnifiedNotifications] useEffect CLEANUP - unmounting, setting isActive=false');
            isActive = false;
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (wsRef.current) {
                console.log('[UnifiedNotifications] Closing WebSocket in cleanup');
                wsRef.current.close();
            }
        };
    }, []);

    return null;
};
