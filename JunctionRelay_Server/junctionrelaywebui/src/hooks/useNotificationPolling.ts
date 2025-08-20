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
import { useFeatureFlags } from './useFeatureFlags';

interface NotificationPollingData {
    lastUpdate: number;
    pollingStatus: 'active' | 'inactive' | 'error' | 'disabled';
    notificationsProcessed: number;
    lastNotificationId: string | null;
}

interface UseNotificationPollingReturn extends NotificationPollingData {
    isActive: boolean;
    startPolling: () => void;
    stopPolling: () => void;
    checkNow: () => Promise<void>;
}

interface NotificationPollingHookOptions {
    enabled?: boolean;
    pollingInterval?: number; // milliseconds
}

export const useNotificationPolling = (options: NotificationPollingHookOptions = {}): UseNotificationPollingReturn => {
    const { enabled: explicitEnabled, pollingInterval: customInterval } = options;
    const flags = useFeatureFlags();

    // Determine if enabled based on feature flags and explicit option
    const enabled = explicitEnabled !== undefined
        ? explicitEnabled
        : flags?.notifications_backend_polling === 'true';

    // Get polling interval from feature flags with default
    const getPollingInterval = useCallback(() => {
        const flagValue = flags?.notifications_polling_interval;
        if (flagValue && typeof flagValue === 'string') {
            const parsed = parseInt(flagValue, 10);
            return !isNaN(parsed) ? parsed : 15000; // 15 seconds default
        }
        return customInterval || 15000;
    }, [flags, customInterval]);

    const intervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
    const enabledRef = useRef(enabled);
    const lastTimestampRef = useRef<string | null>(null);

    const [data, setData] = useState<NotificationPollingData>({
        lastUpdate: 0,
        pollingStatus: enabled ? 'inactive' : 'disabled',
        notificationsProcessed: 0,
        lastNotificationId: null
    });

    // Update enabled ref when prop changes
    useEffect(() => {
        enabledRef.current = enabled;
    }, [enabled]);

    const checkForNotifications = useCallback(async () => {
        if (!enabledRef.current) {
            console.log('[Notification Polling] Polling disabled by feature flags');
            return;
        }

        try {
            const params = new URLSearchParams();
            if (lastTimestampRef.current) {
                params.append('since', lastTimestampRef.current);
            }

            const response = await fetch(`/api/notifications/pending?${params.toString()}`);

            if (!response.ok) {
                console.warn('[Notification Polling] HTTP error:', response.status);
                setData(prev => ({ ...prev, pollingStatus: 'error' }));
                return;
            }

            const result = await response.json();
            const { notifications = [], lastTimestamp } = result;

            const now = Date.now();

            // Update last timestamp if we got one
            if (lastTimestamp) {
                lastTimestampRef.current = lastTimestamp;
            }

            // Process any new notifications
            if (notifications.length > 0) {
                console.log(`[Notification Polling] Processing ${notifications.length} notifications`);

                notifications.forEach((notification: any) => {
                    // Dispatch custom event for NotificationContext to catch
                    window.dispatchEvent(new CustomEvent('notification-show', {
                        detail: {
                            type: notification.type || notification.severity || 'info',
                            message: notification.message,
                            title: notification.title,
                            category: notification.category || 'system',
                            duration: notification.duration,
                            persistent: notification.persistent
                        }
                    }));
                });

                setData(prev => ({
                    ...prev,
                    lastUpdate: now,
                    pollingStatus: 'active',
                    notificationsProcessed: prev.notificationsProcessed + notifications.length,
                    lastNotificationId: lastTimestamp || prev.lastNotificationId
                }));
            } else {
                // No new notifications, just update status
                setData(prev => ({
                    ...prev,
                    lastUpdate: now,
                    pollingStatus: 'active'
                }));
            }

        } catch (error) {
            console.error('[Notification Polling] Error checking for notifications:', error);
            setData(prev => ({ ...prev, pollingStatus: 'error' }));
        }
    }, []);

    const startPolling = useCallback(() => {
        if (!enabledRef.current) {
            console.log('[Notification Polling] Cannot start - disabled by feature flags');
            return;
        }

        if (intervalRef.current) {
            console.log('[Notification Polling] Already polling');
            return;
        }

        const interval = getPollingInterval();
        console.log(`[Notification Polling] Starting polling every ${interval}ms`);

        setData(prev => ({ ...prev, pollingStatus: 'active' }));

        // Initial check
        checkForNotifications();

        // Set up interval
        intervalRef.current = setInterval(checkForNotifications, interval);
    }, [checkForNotifications, getPollingInterval]);

    const stopPolling = useCallback(() => {
        console.log('[Notification Polling] Stopping polling');

        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = undefined;
        }

        setData(prev => ({
            ...prev,
            pollingStatus: enabledRef.current ? 'inactive' : 'disabled'
        }));
    }, []);

    const checkNow = useCallback(async () => {
        console.log('[Notification Polling] Manual check requested');
        await checkForNotifications();
    }, [checkForNotifications]);

    // Handle enabled state changes
    useEffect(() => {
        if (enabled) {
            console.log('[Notification Polling] Enabling polling');
            setData(prev => ({ ...prev, pollingStatus: 'inactive' }));
            startPolling();
        } else {
            console.log('[Notification Polling] Disabling polling');
            stopPolling();
            // Reset data when disabled
            setData({
                lastUpdate: 0,
                pollingStatus: 'disabled',
                notificationsProcessed: 0,
                lastNotificationId: null
            });
            lastTimestampRef.current = null;
        }
    }, [enabled, startPolling, stopPolling]);

    // Restart polling when interval changes
    useEffect(() => {
        if (enabled && intervalRef.current) {
            console.log('[Notification Polling] Restarting polling with new interval');
            stopPolling();
            startPolling();
        }
    }, [getPollingInterval, enabled, startPolling, stopPolling]);

    // Listen for manual refresh events
    useEffect(() => {
        const handleRefreshNotifications = () => {
            if (enabledRef.current) {
                checkNow();
            }
        };

        window.addEventListener('notification-refresh', handleRefreshNotifications);

        return () => {
            window.removeEventListener('notification-refresh', handleRefreshNotifications);
        };
    }, [checkNow]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);

    return {
        lastUpdate: data.lastUpdate,
        pollingStatus: data.pollingStatus,
        notificationsProcessed: data.notificationsProcessed,
        lastNotificationId: data.lastNotificationId,
        isActive: data.pollingStatus === 'active',
        startPolling,
        stopPolling,
        checkNow
    };
};