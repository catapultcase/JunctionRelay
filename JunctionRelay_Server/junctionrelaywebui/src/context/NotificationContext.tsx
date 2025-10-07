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

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
    Snackbar,
    Alert,
    AlertTitle,
    Slide,
    Box,
    IconButton,
    Typography,
    Chip
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useFeatureFlags } from '../hooks/useFeatureFlags';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';
export type NotificationCategory = 'api' | 'auth' | 'cloud' | 'system';

export interface NotificationDetail {
    label: string;
    value: string | number;
    color?: 'success' | 'error' | 'warning' | 'info' | 'muted';
}

export interface StructuredContent {
    type: string;
    summary: string;
    details: NotificationDetail[];
    additionalInfo?: string;
}

export interface Notification {
    id: string;
    type: NotificationType;
    category: NotificationCategory;
    title?: string;
    message: string;
    duration?: number;
    persistent?: boolean;
    timestamp: number;
    isExiting?: boolean;
    structuredContent?: StructuredContent;
}

interface NotificationContextType {
    showNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
    showSuccess: (message: string, title?: string, category?: NotificationCategory, duration?: number) => void;
    showError: (message: string, title?: string, category?: NotificationCategory, duration?: number) => void;
    showWarning: (message: string, title?: string, category?: NotificationCategory, duration?: number) => void;
    showInfo: (message: string, title?: string, category?: NotificationCategory, duration?: number) => void;
    showStructuredNotification: (type: NotificationType, title: string, structuredContent: StructuredContent, category?: NotificationCategory, duration?: number) => void;
    dismissNotification: (id: string) => void;
    clearAllNotifications: () => void;
    isEnabled: (category?: NotificationCategory) => boolean;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Define pages where notifications are ALLOWED (whitelist)
const ALLOWED_NOTIFICATION_PAGES = [
    '/',
    '/streams',
    '/junctions',
    '/devices',
    '/services',
    '/collectors',
    '/frameengine',
    '/eventengine',
    '/payloads'
];

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
};

function SlideTransition(props: any) {
    return <Slide {...props} direction="left" />;
}

// Component to render structured notification content
const StructuredNotificationContent: React.FC<{ content: StructuredContent }> = ({ content }) => {
    const getChipColor = (color?: string) => {
        switch (color) {
            case 'success': return '#2e7d32';
            case 'error': return '#d32f2f';
            case 'warning': return '#ed6c02';
            case 'info': return '#0288d1';
            case 'muted': return '#757575';
            default: return '#757575';
        }
    };

    const getChipTextColor = (color?: string) => {
        switch (color) {
            case 'muted': return '#ffffff';
            default: return '#ffffff';
        }
    };

    return (
        <Box>
            <Typography
                variant="body2"
                sx={{
                    marginBottom: 1,
                    fontWeight: 500,
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
                }}
            >
                {content.summary}
            </Typography>

            {content.details && content.details.length > 0 && (
                <Box sx={{ marginLeft: 1 }}>
                    {content.details.map((detail, index) => (
                        <Box
                            key={index}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                marginBottom: 0.5,
                                '&:last-child': {
                                    marginBottom: 0
                                }
                            }}
                        >
                            <Typography
                                variant="body2"
                                component="span"
                                sx={{
                                    fontWeight: 600,
                                    marginRight: 0.5,
                                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
                                }}
                            >
                                • {detail.label}:
                            </Typography>
                            <Chip
                                label={detail.value}
                                size="small"
                                sx={{
                                    backgroundColor: getChipColor(detail.color),
                                    color: getChipTextColor(detail.color),
                                    fontWeight: 600,
                                    fontSize: '0.75rem',
                                    height: '20px',
                                    '& .MuiChip-label': {
                                        padding: '0 6px',
                                        textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                                    }
                                }}
                            />
                        </Box>
                    ))}
                </Box>
            )}

            {content.additionalInfo && (
                <Typography
                    variant="caption"
                    sx={{
                        display: 'block',
                        marginTop: 1,
                        opacity: 0.9,
                        fontStyle: 'italic',
                        textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
                    }}
                >
                    {content.additionalInfo}
                </Typography>
            )}
        </Box>
    );
};

interface NotificationProviderProps {
    children: React.ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const location = useLocation();
    const flags = useFeatureFlags();

    const generateId = () => `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check if current page allows notifications (whitelist approach)
    const isPageAllowed = useCallback(() => {
        const currentPath = location.pathname;

        // Check if current path exactly matches or starts with any allowed path
        return ALLOWED_NOTIFICATION_PAGES.some(allowedPath => {
            // Exact match for root path
            if (allowedPath === '/' && currentPath === '/') {
                return true;
            }
            // For other paths, check if current path starts with the allowed path
            if (allowedPath !== '/' && currentPath.startsWith(allowedPath)) {
                return true;
            }
            return false;
        });
    }, [location.pathname]);

    // Feature flag helpers
    const isEnabled = useCallback((category?: NotificationCategory) => {
        // First check if we're on an allowed page
        if (!isPageAllowed()) {
            console.log(`[Notification] Blocked on page: ${location.pathname} (not in whitelist)`);
            return false;
        }

        // Master toggle
        if (flags?.notifications_enabled !== 'true') {
            return false;
        }

        // Category-specific toggles
        if (category) {
            switch (category) {
                case 'api':
                    return flags?.notifications_api_calls === 'true';
                case 'auth':
                    return flags?.notifications_auth_events === 'true';
                case 'cloud':
                    return flags?.notifications_cloud_sync === 'true';
                case 'system':
                    return flags?.notifications_system === 'true';
                default:
                    return true;
            }
        }

        return true;
    }, [flags, isPageAllowed, location.pathname]);

    // Get durations from feature flags with defaults
    const getSuccessDuration = useCallback(() => {
        const flagValue = flags?.notifications_duration_success;
        return flagValue && typeof flagValue === 'string' ? parseInt(flagValue, 10) : 6000;
    }, [flags]);

    const getErrorDuration = useCallback(() => {
        const flagValue = flags?.notifications_duration_error;
        return flagValue && typeof flagValue === 'string' ? parseInt(flagValue, 10) : 8000;
    }, [flags]);

    const getMaxConcurrent = useCallback(() => {
        const flagValue = flags?.notifications_max_concurrent;
        return flagValue && typeof flagValue === 'string' ? parseInt(flagValue, 10) : 5;
    }, [flags]);

    const showNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp'>) => {
        // Check if notifications are enabled for this category and page
        if (!isEnabled(notification.category)) {
            return;
        }

        const id = generateId();
        const timestamp = Date.now();

        // Set default duration based on type if not specified
        let duration = notification.duration;
        if (duration === undefined) {
            switch (notification.type) {
                case 'success':
                    duration = getSuccessDuration();
                    break;
                case 'error':
                    duration = getErrorDuration();
                    break;
                case 'warning':
                    duration = 7000; // Between success and error
                    break;
                case 'info':
                    duration = getSuccessDuration();
                    break;
                default:
                    duration = getSuccessDuration();
            }
        }

        // Extend duration for structured notifications
        if (notification.structuredContent && duration && duration > 0) {
            duration = Math.max(duration, 8000); // Minimum 8 seconds for structured content
        }

        const newNotification: Notification = {
            id,
            timestamp,
            duration,
            ...notification,
        };

        console.log(`[Notification] Creating notification on allowed page:`, {
            id,
            page: location.pathname,
            type: newNotification.type,
            duration: newNotification.duration,
            persistent: newNotification.persistent,
            category: newNotification.category,
            hasStructuredContent: !!newNotification.structuredContent
        });

        setNotifications(prev => {
            const updated = [newNotification, ...prev];
            // Keep only the latest notifications up to maxConcurrent
            return updated.slice(0, getMaxConcurrent());
        });

        // Auto-dismiss if duration is set and not persistent
        if (newNotification.duration && newNotification.duration > 0 && !newNotification.persistent) {
            setTimeout(() => {
                dismissNotification(id);
            }, newNotification.duration);
        }
    }, [isEnabled, getSuccessDuration, getErrorDuration, getMaxConcurrent, location.pathname]);

    const showSuccess = useCallback((message: string, title?: string, category: NotificationCategory = 'system', duration?: number) => {
        showNotification({ type: 'success', message, title, category, duration });
    }, [showNotification]);

    const showError = useCallback((message: string, title?: string, category: NotificationCategory = 'system', duration?: number) => {
        showNotification({
            type: 'error',
            message,
            title,
            category,
            duration: duration ?? getErrorDuration(),
            persistent: duration === 0
        });
    }, [showNotification, getErrorDuration]);

    const showWarning = useCallback((message: string, title?: string, category: NotificationCategory = 'system', duration?: number) => {
        showNotification({ type: 'warning', message, title, category, duration });
    }, [showNotification]);

    const showInfo = useCallback((message: string, title?: string, category: NotificationCategory = 'system', duration?: number) => {
        showNotification({ type: 'info', message, title, category, duration });
    }, [showNotification]);

    // New method for structured notifications
    const showStructuredNotification = useCallback((
        type: NotificationType,
        title: string,
        structuredContent: StructuredContent,
        category: NotificationCategory = 'system',
        duration?: number
    ) => {
        showNotification({
            type,
            title,
            message: structuredContent.summary,
            category,
            duration,
            structuredContent
        });
    }, [showNotification]);

    const dismissNotification = useCallback((id: string) => {
        // Start fade-out animation
        setNotifications(prev => prev.map(n =>
            n.id === id ? { ...n, isExiting: true } : n
        ));

        // Remove after animation completes
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 300); // Match the animation duration
    }, []);

    const clearAllNotifications = useCallback(() => {
        setNotifications([]);
    }, []);

    // Clear notifications when navigating to a blocked page
    useEffect(() => {
        if (!isPageAllowed()) {
            console.log(`[Notification] Clearing all notifications - navigated to blocked page: ${location.pathname}`);
            clearAllNotifications();
        }
    }, [location.pathname, isPageAllowed, clearAllNotifications]);

    // Enhanced event listener for structured notifications
    useEffect(() => {
        const handleNotificationEvent = (event: CustomEvent) => {
            const { type, message, title, category, duration, persistent, structuredContent } = event.detail;
            console.log('[Notification] Received event with data:', event.detail);

            const notificationData: any = {
                type: type || 'info',
                message,
                title,
                category: category || 'system',
                persistent
            };

            // Handle structured content
            if (structuredContent) {
                try {
                    const parsedContent = typeof structuredContent === 'string'
                        ? JSON.parse(structuredContent)
                        : structuredContent;
                    notificationData.structuredContent = parsedContent;
                } catch (error) {
                    console.warn('[Notification] Failed to parse structured content:', error);
                }
            }

            // Only include duration if it's a valid number
            if (duration !== null && duration !== undefined && typeof duration === 'number') {
                notificationData.duration = duration;
            }

            showNotification(notificationData);
        };

        window.addEventListener('notification-show', handleNotificationEvent as EventListener);

        return () => {
            window.removeEventListener('notification-show', handleNotificationEvent as EventListener);
        };
    }, [showNotification]);

    const contextValue: NotificationContextType = {
        showNotification,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        showStructuredNotification,
        dismissNotification,
        clearAllNotifications,
        isEnabled,
    };

    return (
        <NotificationContext.Provider value={contextValue}>
            {children}

            {/* Notification Container - Only render if on allowed page */}
            {isPageAllowed() && (
                <Box
                    sx={{
                        position: 'fixed',
                        top: 72, // Just below navbar (64px + 8px margin)
                        right: 16,
                        zIndex: (theme) => theme.zIndex.snackbar, // Below AppBar but above content
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        maxWidth: 400,
                        width: '100%',
                        '@media (max-width: 600px)': {
                            left: 24,
                            right: 24,
                            maxWidth: 'calc(100% - 48px)',
                        }
                    }}
                >
                    {notifications.map((notification, index) => (
                        <Snackbar
                            key={notification.id}
                            open={true}
                            TransitionComponent={SlideTransition}
                            sx={{
                                position: 'relative',
                                top: 'auto !important',
                                left: 'auto !important',
                                right: 'auto !important',
                                bottom: 'auto !important',
                                width: '100%',
                                marginBottom: index < notifications.length - 1 ? 1 : 0,
                                opacity: notification.isExiting ? 0 : 1,
                                transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
                                transform: notification.isExiting ? 'translateX(100%) !important' : 'translateX(0) !important',
                            }}
                        >
                            <Alert
                                severity={notification.type}
                                variant="filled"
                                action={
                                    <IconButton
                                        size="small"
                                        aria-label="close"
                                        color="inherit"
                                        onClick={() => dismissNotification(notification.id)}
                                        sx={{
                                            padding: '4px',
                                            '&:hover': {
                                                backgroundColor: 'rgba(255, 255, 255, 0.25)'
                                            }
                                        }}
                                    >
                                        <CloseIcon fontSize="small" />
                                    </IconButton>
                                }
                                sx={{
                                    width: '100%',
                                    boxShadow: (theme) => theme.shadows[6],
                                    minHeight: notification.structuredContent ? '80px' : '48px',

                                    // GLASS EFFECT WITH TRANSPARENCY
                                    backgroundColor: (theme) => {
                                        const alpha = 0.6; // 80% opacity for glass effect
                                        switch (notification.type) {
                                            case 'error':
                                                return `rgba(211, 47, 47, ${alpha})`; // Red with transparency
                                            case 'warning':
                                                return `rgba(237, 108, 2, ${alpha})`; // Orange with transparency
                                            case 'success':
                                                return `rgba(46, 125, 50, ${alpha})`; // Green with transparency
                                            case 'info':
                                                return `rgba(2, 136, 209, ${alpha})`; // Blue with transparency
                                            default:
                                                return `rgba(2, 136, 209, ${alpha})`;
                                        }
                                    },

                                    // Glass effect with blur and saturation
                                    backdropFilter: 'blur(12px) saturate(180%)',
                                    WebkitBackdropFilter: 'blur(12px) saturate(180%)', // Safari support

                                    // Subtle border for better definition
                                    border: '1px solid rgba(255, 255, 255, 0.1)',

                                    // Enhanced glass appearance
                                    position: 'relative',
                                    overflow: 'hidden',

                                    // Subtle inner highlight for glass effect
                                    '&::before': {
                                        content: '""',
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        right: 0,
                                        height: '1px',
                                        background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent)',
                                        zIndex: 1
                                    },

                                    '& .MuiAlert-message': {
                                        width: '100%',
                                        overflow: 'hidden',
                                        position: 'relative',
                                        zIndex: 2,
                                    },

                                    // Ensure text remains readable with transparency
                                    '& .MuiAlert-icon': {
                                        opacity: 1, // Keep icons fully opaque
                                        filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1))', // Subtle text shadow for readability
                                        position: 'relative',
                                        zIndex: 2,
                                    },

                                    '& .MuiAlertTitle-root': {
                                        opacity: 1, // Keep titles fully opaque
                                        fontWeight: 'bold',
                                        marginBottom: 0.5,
                                        textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)', // Subtle text shadow for readability
                                        position: 'relative',
                                        zIndex: 2,
                                    },

                                    // Add text shadow to main message for better readability
                                    '& .MuiAlert-message > *': {
                                        textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                                        position: 'relative',
                                        zIndex: 2,
                                    }
                                }}
                            >
                                {notification.title && (
                                    <AlertTitle sx={{ fontWeight: 'bold', marginBottom: 0.5 }}>
                                        {notification.title}
                                    </AlertTitle>
                                )}

                                {/* Render structured content if available, otherwise show simple message */}
                                {notification.structuredContent ? (
                                    <StructuredNotificationContent content={notification.structuredContent} />
                                ) : (
                                    notification.message
                                )}
                            </Alert>
                        </Snackbar>
                    ))}
                </Box>
            )}
        </NotificationContext.Provider>
    );
};