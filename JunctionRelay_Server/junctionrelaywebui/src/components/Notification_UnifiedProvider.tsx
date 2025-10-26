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

import React, { useCallback, useRef, useEffect } from 'react';
import { useUnifiedNotificationWebSocket } from '../hooks/useUnifiedNotificationWebSocket';
import { useNotifications } from '../context/NotificationContext';

interface UnifiedNotificationProviderProps {
    children: React.ReactNode;
}

/**
 * UnifiedNotificationProvider connects the unified notification WebSocket
 * to the notification system, handling all notification types (general notifications,
 * junction progress, template version progress) through a single connection.
 */
export const UnifiedNotificationProvider: React.FC<UnifiedNotificationProviderProps> = ({ children }) => {
    // Get the entire notifications context to avoid re-renders when individual functions change
    const notifications = useNotifications();

    // Store in a ref that updates on every render
    const notificationsRef = useRef(notifications);
    notificationsRef.current = notifications;

    // Handle general notifications
    const handleNotificationRef = useRef((payload: any) => {
        notificationsRef.current.showNotification(payload);
    });

    // Handle junction progress
    const handleJunctionProgressRef = useRef((progress: any) => {
        // Emit a custom event for pages that want to listen to junction progress
        window.dispatchEvent(new CustomEvent('junction-progress-update', {
            detail: progress
        }));

        // Only create notification on first stage - showJunctionProgress removes duplicates itself
        if (progress.stage === 1) {
            notificationsRef.current.showJunctionProgress(
                progress.junctionId,
                progress.junctionName,
                progress.operationId
            );
        }

        // Always update with the latest progress
        notificationsRef.current.updateJunctionProgress(progress);
    });

    // Handle template version progress
    const handleTemplateVersionProgressRef = useRef((progress: any) => {
        // Only create notification on first stage
        if (progress.stage === 1) {
            notificationsRef.current.showTemplateVersionProgress(
                progress.templateId,
                progress.templateName,
                progress.operationId
            );
        }

        // Always update with the latest progress
        notificationsRef.current.updateTemplateVersionProgress(progress);
    });

    // Create stable callback wrappers that call the refs
    const onNotification = useCallback((payload: any) => handleNotificationRef.current(payload), []);
    const onJunctionProgress = useCallback((progress: any) => handleJunctionProgressRef.current(progress), []);
    const onTemplateVersionProgress = useCallback((progress: any) => handleTemplateVersionProgressRef.current(progress), []);

    useUnifiedNotificationWebSocket({
        onNotification,
        onJunctionProgress,
        onTemplateVersionProgress,
    });

    return <>{children}</>;
};

export default UnifiedNotificationProvider;
