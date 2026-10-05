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
import { JunctionProgress, TemplateVersionProgress } from '../types/notifications';

/** A general notification as Service_Unified_Notification_Broadcaster sends it (camelCase). */
export interface ServerNotification {
    id: string;
    type: string;
    message: string;
    title?: string | null;
    category: string;
    duration?: number | null;
    persistent: boolean;
    timestamp: string;
    expiresAt?: string | null;
    /** Already parsed to an object by the server; its shape depends on the sender. */
    structuredContent?: unknown;
}

// Message type discriminator
type UnifiedNotificationMessage =
    | { type: 'notification'; payload: ServerNotification }
    | { type: 'junction-progress'; payload: JunctionProgress }
    | { type: 'template-version-progress'; payload: TemplateVersionProgress };

interface UnifiedNotificationCallbacks {
    onNotification?: (payload: ServerNotification) => void;
    onJunctionProgress?: (payload: JunctionProgress) => void;
    onTemplateVersionProgress?: (payload: TemplateVersionProgress) => void;
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

        const connect = () => {

            // Clean up existing connection
            if (wsRef.current) {
                wsRef.current.close();
            }

            const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            const wsUrl = `${protocol}//${window.location.host}/api/websocket/notifications/connect`;

            try {
                const ws = new WebSocket(wsUrl);

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
                    // Only reconnect if component is still mounted
                    if (isActive) {
                        reconnectTimeoutRef.current = setTimeout(() => {
                            connect();
                        }, 3000);
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
            isActive = false;
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, []);

    return null;
};
