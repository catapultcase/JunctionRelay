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
    Chip,
    LinearProgress
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { JunctionProgress, JunctionStartStage, getStageDisplayName, TemplateVersionProgress, TemplateVersionUploadStage } from '../types/notifications';

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

export interface JunctionProgressData {
    junctionId: number;
    junctionName: string;
    operationId: string;
    currentStage: JunctionStartStage;
    detailMessage: string;
    isGatewayJunction?: boolean;
}

export interface CollectorTestProgressData {
    collectorId: number;
    collectorName: string;
    stage: 'testing' | 'complete';
    success?: boolean;
    sensorCount?: number;
    errorMessage?: string;
}

export interface TemplateVersionProgressData {
    templateId: number;
    templateName: string;
    operationId: string;
    currentStage: TemplateVersionUploadStage;
    detailMessage: string;
    progressPercentage: number;
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
    junctionProgress?: JunctionProgressData;
    collectorTestProgress?: CollectorTestProgressData;
    templateVersionProgress?: TemplateVersionProgressData;
}

interface NotificationContextType {
    showNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
    showSuccess: (message: string, title?: string, category?: NotificationCategory, duration?: number) => void;
    showError: (message: string, title?: string, category?: NotificationCategory, duration?: number) => void;
    showWarning: (message: string, title?: string, category?: NotificationCategory, duration?: number) => void;
    showInfo: (message: string, title?: string, category?: NotificationCategory, duration?: number) => void;
    showStructuredNotification: (type: NotificationType, title: string, structuredContent: StructuredContent, category?: NotificationCategory, duration?: number) => void;
    showJunctionProgress: (junctionId: number, junctionName: string, operationId: string) => void;
    updateJunctionProgress: (progress: JunctionProgress) => void;
    showTemplateVersionProgress: (templateId: number, templateName: string, operationId: string) => void;
    updateTemplateVersionProgress: (progress: TemplateVersionProgress) => void;
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
const StructuredNotificationContent: React.FC<{ content: StructuredContent | any }> = ({ content }) => {
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

    // Regular structured content
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
                    {content.details.map((detail: NotificationDetail, index: number) => (
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

// Component to render template version progress with linear progress bar
const TemplateVersionProgressContent: React.FC<{ progressData: TemplateVersionProgressData; hasError?: boolean; isComplete?: boolean }> = ({ progressData, hasError, isComplete }) => {
    const getStageDisplayName = (stage: TemplateVersionUploadStage): string => {
        switch (stage) {
            case TemplateVersionUploadStage.Preparing: return 'Preparing';
            case TemplateVersionUploadStage.HashingAssets: return 'Hashing Assets';
            case TemplateVersionUploadStage.CheckingCloud: return 'Checking Cloud';
            case TemplateVersionUploadStage.UploadingAssets: return 'Uploading Assets';
            case TemplateVersionUploadStage.SavingMetadata: return 'Saving Metadata';
            case TemplateVersionUploadStage.Complete: return 'Complete';
            default: return 'Processing';
        }
    };

    const getBarColor = () => {
        if (hasError) return '#d32f2f'; // Red
        if (isComplete) return '#2e7d32'; // Green
        return (theme: any) => theme.palette.text.secondary; // Gray
    };

    return (
        <Box sx={{ width: '100%' }}>
            <Box sx={{ position: 'relative', marginBottom: 2 }}>
                <LinearProgress
                    variant="determinate"
                    value={progressData.progressPercentage}
                    sx={{
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: (theme) => theme.palette.action.hover,
                        '& .MuiLinearProgress-bar': {
                            borderRadius: 3,
                            backgroundColor: getBarColor(),
                        }
                    }}
                />
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginBottom: 1 }}>
                {isComplete && !hasError && (
                    <CheckCircleIcon sx={{ fontSize: 18, color: '#2e7d32' }} />
                )}
                {hasError && (
                    <ErrorIcon sx={{ fontSize: 18, color: '#d32f2f' }} />
                )}
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {getStageDisplayName(progressData.currentStage)}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', marginLeft: 'auto' }}>
                    {progressData.progressPercentage}%
                </Typography>
            </Box>

            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontStyle: 'italic' }}>
                {progressData.detailMessage}
            </Typography>
        </Box>
    );
};

// Component to render junction progress with linear progress bar
const JunctionProgressContent: React.FC<{ progressData: JunctionProgressData; hasError?: boolean; isComplete?: boolean }> = ({ progressData, hasError, isComplete }) => {
    const steps = [
        'Validating',
        'Loading Configuration',
        'Registering Sources',
        ...(progressData.isGatewayJunction ? ['Configuring Gateway'] : []),
        'Starting Streams',
        'Complete'
    ];

    const getProgressPercentage = (stage: JunctionStartStage, isGateway: boolean): number => {
        const totalSteps = isGateway ? 6 : 5;
        let currentStep = stage;

        // Adjust for non-gateway junctions (skip ConfiguringGateway)
        if (!isGateway && stage >= JunctionStartStage.ConfiguringGateway) {
            currentStep = stage - 1;
        }

        return (currentStep / totalSteps) * 100;
    };

    const progress = getProgressPercentage(progressData.currentStage, !!progressData.isGatewayJunction);

    return (
        <Box sx={{ width: '100%' }}>
            {/* Progress bar */}
            <Box sx={{ position: 'relative', marginBottom: 2 }}>
                <LinearProgress
                    variant="determinate"
                    value={progress}
                    sx={{
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: (theme) => theme.palette.action.hover,
                        '& .MuiLinearProgress-bar': {
                            borderRadius: 3,
                            backgroundColor: (theme) => {
                                if (hasError) return theme.palette.error.main;
                                if (isComplete) return theme.palette.success.main;
                                return theme.palette.text.secondary; // Neutral gray for in-progress
                            }
                        }
                    }}
                />
            </Box>

            {/* Current stage and detail message */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginBottom: 1 }}>
                {isComplete && !hasError && (
                    <CheckCircleIcon sx={{ color: 'success.main', fontSize: '1.2rem' }} />
                )}
                {hasError && (
                    <ErrorIcon sx={{ color: 'error.main', fontSize: '1.2rem' }} />
                )}
                <Typography
                    variant="body2"
                    sx={{
                        fontWeight: 600,
                        color: (theme) => {
                            if (hasError) return theme.palette.error.main;
                            if (isComplete) return theme.palette.success.main;
                            return theme.palette.text.primary;
                        }
                    }}
                >
                    {getStageDisplayName(progressData.currentStage)}
                </Typography>
            </Box>

            {/* Detail message */}
            <Typography
                variant="caption"
                sx={{
                    display: 'block',
                    color: 'text.secondary',
                    fontStyle: 'italic'
                }}
            >
                {progressData.detailMessage}
            </Typography>
        </Box>
    );
};

// Collector Test Progress Content (similar to Junction Progress)
const CollectorTestProgressContent: React.FC<{ progressData: CollectorTestProgressData; hasError?: boolean; isComplete?: boolean }> = ({ progressData, hasError, isComplete }) => {
    const progress = progressData.stage === 'testing' ? 50 : 100;

    return (
        <Box sx={{ width: '100%' }}>
            {/* Progress bar */}
            <Box sx={{ position: 'relative', marginBottom: 2 }}>
                <LinearProgress
                    variant="determinate"
                    value={progress}
                    sx={{
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: (theme) => theme.palette.action.hover,
                        '& .MuiLinearProgress-bar': {
                            borderRadius: 3,
                            backgroundColor: (theme) => {
                                if (hasError) return theme.palette.error.main;
                                if (isComplete) return theme.palette.success.main;
                                return theme.palette.text.secondary; // Neutral gray for in-progress
                            }
                        }
                    }}
                />
            </Box>

            {/* Current stage and detail message */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginBottom: 1 }}>
                {isComplete && !hasError && (
                    <CheckCircleIcon sx={{ color: 'success.main', fontSize: '1.2rem' }} />
                )}
                {hasError && (
                    <ErrorIcon sx={{ color: 'error.main', fontSize: '1.2rem' }} />
                )}
                <Typography
                    variant="body2"
                    sx={{
                        fontWeight: 600,
                        color: (theme) => {
                            if (hasError) return theme.palette.error.main;
                            if (isComplete) return theme.palette.success.main;
                            return theme.palette.text.primary;
                        }
                    }}
                >
                    {progressData.stage === 'testing' ? 'Fetching sensors...' : (progressData.success ? 'Test passed' : 'Test failed')}
                </Typography>
            </Box>

            {/* Detail message */}
            <Typography
                variant="caption"
                sx={{
                    display: 'block',
                    color: 'text.secondary',
                    fontStyle: 'italic'
                }}
            >
                {progressData.stage === 'complete' && progressData.success
                    ? `Found ${progressData.sensorCount} sensor${progressData.sensorCount !== 1 ? 's' : ''}`
                    : progressData.errorMessage || 'Testing connection...'}
            </Typography>
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

    // WebSocket connection is now handled by UnifiedNotificationProvider

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
            return false;
        }

        // Master toggle
        if (!flags?.notifications_enabled) {
            return false;
        }

        // Category-specific toggles
        if (category) {
            switch (category) {
                case 'api':
                    return !!flags?.notifications_api_calls;
                case 'auth':
                    return !!flags?.notifications_auth_events;
                case 'cloud':
                    return !!flags?.notifications_cloud_sync;
                case 'system':
                    return !!flags?.notifications_system;
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

        // Note: Duration is now controlled by backend - no minimum extension applied

        // Extract id from notification to avoid overwriting our generated ID
        const { id: _ignoredBackendId, ...notificationWithoutId } = notification as any;

        const newNotification: Notification = {
            id,
            timestamp,
            duration,
            ...notificationWithoutId,
        };


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

    // New method for junction progress notifications
    const showJunctionProgress = useCallback((
        junctionId: number,
        junctionName: string,
        operationId: string
    ) => {
        const notificationId = `junction_progress_${operationId}`;

        const progressData: JunctionProgressData = {
            junctionId,
            junctionName,
            operationId,
            currentStage: JunctionStartStage.Validating,
            detailMessage: 'Starting junction...',
            isGatewayJunction: false
        };

        const newNotification: Notification = {
            id: notificationId,
            type: 'info',
            category: 'system',
            title: `Starting: ${junctionName}`,
            message: 'Junction startup in progress...',
            timestamp: Date.now(),
            persistent: true, // Don't auto-dismiss during progress
            junctionProgress: progressData
        };

        setNotifications(prev => {
            // Remove any existing progress notification for this operation
            const filtered = prev.filter(n => n.id !== notificationId);
            return [newNotification, ...filtered].slice(0, getMaxConcurrent());
        });
    }, [getMaxConcurrent]);

    // Update junction progress
    const updateJunctionProgress = useCallback((progress: JunctionProgress) => {
        const notificationId = `junction_progress_${progress.operationId}`;

        setNotifications(prev => {
            const existing = prev.find(n => n.id === notificationId);
            if (!existing) {
                return prev;
            }

            // Determine if this is a gateway junction based on the detail message or stage
            const isGatewayJunction = progress.detailMessage.toLowerCase().includes('gateway') ||
                                     progress.stage === JunctionStartStage.ConfiguringGateway;

            const updatedProgress: JunctionProgressData = {
                junctionId: progress.junctionId,
                junctionName: progress.junctionName,
                operationId: progress.operationId,
                currentStage: progress.stage,
                detailMessage: progress.detailMessage,
                isGatewayJunction: existing.junctionProgress?.isGatewayJunction || isGatewayJunction
            };

            let updatedNotification: Notification;

            if (progress.isComplete) {
                if (progress.hasError) {
                    // Turn red on error, auto-dismiss after 5 seconds
                    updatedNotification = {
                        ...existing,
                        type: 'error',
                        title: `Failed: ${progress.junctionName}`,
                        message: progress.errorMessage || 'Junction failed to start',
                        junctionProgress: updatedProgress,
                        persistent: false,
                        duration: 5000
                    };

                    // Auto-dismiss after 5 seconds
                    setTimeout(() => {
                        dismissNotification(notificationId);
                    }, 5000);
                } else {
                    // Success! Auto-dismiss after 3 seconds
                    updatedNotification = {
                        ...existing,
                        type: 'success',
                        title: `Started: ${progress.junctionName}`,
                        message: 'Junction started successfully',
                        junctionProgress: updatedProgress,
                        persistent: false,
                        duration: 3000
                    };

                    // Auto-dismiss after 3 seconds
                    setTimeout(() => {
                        dismissNotification(notificationId);
                    }, 3000);
                }
            } else {
                // Still in progress
                updatedNotification = {
                    ...existing,
                    junctionProgress: updatedProgress
                };
            }

            return prev.map(n => n.id === notificationId ? updatedNotification : n);
        });
    }, []);

    // Template version progress methods
    const showTemplateVersionProgress = useCallback((
        templateId: number,
        templateName: string,
        operationId: string
    ) => {
        const notificationId = `template_version_progress_${operationId}`;

        const progressData: TemplateVersionProgressData = {
            templateId,
            templateName,
            operationId,
            currentStage: TemplateVersionUploadStage.Preparing,
            detailMessage: 'Preparing template for upload...',
            progressPercentage: 0
        };

        const newNotification: Notification = {
            id: notificationId,
            type: 'info',
            category: 'cloud',
            title: `Saving: ${templateName}`,
            message: 'Uploading template version...',
            timestamp: Date.now(),
            persistent: true,
            templateVersionProgress: progressData
        };

        setNotifications(prev => {
            const filtered = prev.filter(n => n.id !== notificationId);
            return [newNotification, ...filtered].slice(0, getMaxConcurrent());
        });
    }, [getMaxConcurrent]);

    const updateTemplateVersionProgress = useCallback((progress: TemplateVersionProgress) => {
        const notificationId = `template_version_progress_${progress.operationId}`;

        setNotifications(prev => {
            const existing = prev.find(n => n.id === notificationId);
            if (!existing) {
                return prev;
            }

            const updatedProgress: TemplateVersionProgressData = {
                templateId: progress.templateId,
                templateName: progress.templateName,
                operationId: progress.operationId,
                currentStage: progress.stage,
                detailMessage: progress.detailMessage,
                progressPercentage: progress.progressPercentage
            };

            let updatedNotification: Notification;

            if (progress.isComplete) {
                if (progress.hasError) {
                    updatedNotification = {
                        ...existing,
                        type: 'error',
                        title: `Failed: ${progress.templateName}`,
                        message: progress.errorMessage || 'Template version upload failed',
                        templateVersionProgress: updatedProgress,
                        persistent: false,
                        duration: 5000
                    };

                    setTimeout(() => {
                        dismissNotification(notificationId);
                    }, 5000);
                } else {
                    updatedNotification = {
                        ...existing,
                        type: 'success',
                        title: `Saved: ${progress.templateName}`,
                        message: progress.detailMessage,
                        templateVersionProgress: updatedProgress,
                        persistent: false,
                        duration: 3000
                    };

                    setTimeout(() => {
                        dismissNotification(notificationId);
                    }, 3000);
                }
            } else {
                updatedNotification = {
                    ...existing,
                    templateVersionProgress: updatedProgress
                };
            }

            return prev.map(n => n.id === notificationId ? updatedNotification : n);
        });
    }, []);

    const dismissNotification = useCallback((id: string) => {
        // Start fade-out animation
        setNotifications(prev => {
            const updated = prev.map(n =>
                n.id === id ? { ...n, isExiting: true } : n
            );
            return updated;
        });

        // Remove after animation completes
        setTimeout(() => {
            setNotifications(prev => {
                const filtered = prev.filter(n => n.id !== id);
                return filtered;
            });
        }, 300); // Match the animation duration
    }, []);

    const clearAllNotifications = useCallback(() => {
        setNotifications([]);
    }, []);

    // Clear notifications when navigating to a blocked page
    useEffect(() => {
        if (!isPageAllowed()) {
            clearAllNotifications();
        }
    }, [location.pathname, isPageAllowed, clearAllNotifications]);

    // Enhanced event listener for structured notifications
    useEffect(() => {
        const handleNotificationEvent = (event: CustomEvent) => {
            const { type, message, title, category, duration, persistent, structuredContent } = event.detail;

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
                    // Silently ignore parse errors
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

    // WebSocket event listener for real-time notifications
    useEffect(() => {
        const handleNotificationReceived = (event: CustomEvent) => {
            const notification = event.detail;

            // Parse structured content first to check if this is a collector test
            let parsedContent: any = null;
            if (notification.structuredContent) {
                try {
                    parsedContent = typeof notification.structuredContent === 'string'
                        ? JSON.parse(notification.structuredContent)
                        : notification.structuredContent;
                } catch (error) {
                    // Silently ignore parse errors
                }
            }

            // Check if this is a collector test notification
            if (parsedContent?.collectorId !== undefined) {
                const collectorId = parsedContent.collectorId;
                const notificationId = `collector_test_${collectorId}`;
                const stage = parsedContent.stage || 'testing';

                const collectorTestProgress: CollectorTestProgressData = {
                    collectorId: parsedContent.collectorId,
                    collectorName: parsedContent.collectorName,
                    stage: parsedContent.stage,
                    success: parsedContent.success,
                    sensorCount: parsedContent.sensorCount,
                    errorMessage: parsedContent.errorMessage
                };

                if (stage === 'testing') {
                    // Create new notification for this collector test
                    const newNotification: Notification = {
                        id: notificationId,
                        type: 'info',
                        category: notification.category || 'system',
                        title: notification.title,
                        message: notification.message,
                        timestamp: Date.now(),
                        persistent: true, // Don't auto-dismiss while testing
                        collectorTestProgress: collectorTestProgress
                    };

                    setNotifications(prev => {
                        // Remove any existing notification for this collector
                        const filtered = prev.filter(n => n.id !== notificationId);
                        return [newNotification, ...filtered].slice(0, getMaxConcurrent());
                    });
                } else if (stage === 'complete') {
                    // Update existing notification with completion status
                    setNotifications(prev => {
                        const existing = prev.find(n => n.id === notificationId);
                        if (!existing) {
                            return prev;
                        }

                        const success = parsedContent.success === true;
                        const updatedNotification: Notification = {
                            ...existing,
                            type: success ? 'success' : 'error',
                            title: notification.title,
                            message: notification.message,
                            persistent: false,
                            duration: 3000,
                            collectorTestProgress: collectorTestProgress
                        };

                        // Auto-dismiss after duration
                        setTimeout(() => {
                            dismissNotification(notificationId);
                        }, 3000);

                        return prev.map(n => n.id === notificationId ? updatedNotification : n);
                    });
                }
                return; // Don't process as regular notification
            }

            // Regular notification handling
            const notificationData: any = {
                type: notification.type || 'info',
                message: notification.message,
                title: notification.title,
                category: notification.category || 'system',
                persistent: notification.persistent
            };

            if (parsedContent) {
                notificationData.structuredContent = parsedContent;
            }

            // Only include duration if it's a valid number
            if (notification.duration !== null && notification.duration !== undefined && typeof notification.duration === 'number') {
                notificationData.duration = notification.duration;
            }

            showNotification(notificationData);
        };

        window.addEventListener('notification-received', handleNotificationReceived as EventListener);

        return () => {
            window.removeEventListener('notification-received', handleNotificationReceived as EventListener);
        };
    }, [showNotification, getMaxConcurrent]);

    const contextValue: NotificationContextType = {
        showNotification,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        showStructuredNotification,
        showJunctionProgress,
        updateJunctionProgress,
        showTemplateVersionProgress,
        updateTemplateVersionProgress,
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
                                severity="info"
                                variant="outlined"
                                icon={false}
                                action={
                                    <IconButton
                                        size="small"
                                        aria-label="close"
                                        color="inherit"
                                        onClick={() => dismissNotification(notification.id)}
                                        sx={{
                                            padding: '4px'
                                        }}
                                    >
                                        <CloseIcon fontSize="small" />
                                    </IconButton>
                                }
                                sx={{
                                    width: '100%',
                                    boxShadow: (theme) => theme.shadows[4],
                                    minHeight: notification.junctionProgress || notification.collectorTestProgress || notification.templateVersionProgress ? '120px' : notification.structuredContent ? '80px' : '48px',

                                    // Use theme background colors
                                    backgroundColor: (theme) => theme.palette.background.paper,
                                    color: (theme) => theme.palette.text.primary,
                                    borderColor: (theme) => theme.palette.divider,

                                    '& .MuiAlert-message': {
                                        width: '100%',
                                        overflow: 'hidden',
                                    },

                                    '& .MuiAlertTitle-root': {
                                        fontWeight: 'bold',
                                        marginBottom: 0.5,
                                    }
                                }}
                            >
                                {notification.title && (
                                    <AlertTitle sx={{ fontWeight: 'bold', marginBottom: 0.5 }}>
                                        {notification.title}
                                    </AlertTitle>
                                )}

                                {/* Render junction progress, template version progress, collector test progress, structured content, or simple message */}
                                {notification.junctionProgress ? (
                                    <JunctionProgressContent
                                        progressData={notification.junctionProgress}
                                        hasError={notification.type === 'error'}
                                        isComplete={notification.junctionProgress.currentStage === JunctionStartStage.Complete}
                                    />
                                ) : notification.templateVersionProgress ? (
                                    <TemplateVersionProgressContent
                                        progressData={notification.templateVersionProgress}
                                        hasError={notification.type === 'error'}
                                        isComplete={notification.templateVersionProgress.currentStage === TemplateVersionUploadStage.Complete}
                                    />
                                ) : notification.collectorTestProgress ? (
                                    <CollectorTestProgressContent
                                        progressData={notification.collectorTestProgress}
                                        hasError={notification.type === 'error'}
                                        isComplete={notification.collectorTestProgress.stage === 'complete'}
                                    />
                                ) : notification.structuredContent ? (
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