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

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import { Container, Box, CircularProgress, Typography, useTheme, useMediaQuery } from "@mui/material";
import Navbar from "components/Navbar";
import BottomActionBar from "components/BottomActionBar";
import Dashboard from "pages/Dashboard";
import Junctions from "pages/Junctions";
import Devices from "pages/Devices";
import Services from "pages/Services";
import Collectors from "pages/Collectors";
import VirtualDevices from "pages/VirtualDevices";
import ConfigureDevice from "pages/ConfigureDevice";
import ConfigureVirtualDevice from "pages/ConfigureVirtualDevice";
import ConfigureService from "pages/ConfigureService";
import ConfigureCollector from "pages/ConfigureCollector";
import ConfigureJunction from "pages/ConfigureJunction";
import FrameEngine from "pages/FrameEngine";
import FrameEngineEmbed from "pages/FrameEngineEmbed";
import { ConfigureFrame } from "@junctionrelay/frameengine";
import EventEngine from "pages/EventEngine";
import ConfigureEventRule from "pages/ConfigureEventRule";
import Payloads from "pages/Payloads";
import ConfigurePayload from "pages/ConfigurePayload";
import HostInfo from "pages/HostInfo";
import HostCharts from "pages/HostCharts";
import Settings from "pages/Settings";
import { VirtualScreenViewer } from "@junctionrelay/frameengine";
import LoginOnly from "components/LoginOnly";
import { AuthProvider } from "auth/AuthContext";
import { NotificationProvider } from "context/NotificationContext";
import { UnifiedNotificationProvider } from "components/Notification_UnifiedProvider";
import Streams from "pages/Streams";
import { useFeatureFlags } from "hooks/useFeatureFlags";

// Import statements for icons used in BottomActionBarWrapper
import AddIcon from '@mui/icons-material/Add';
import TableViewIcon from '@mui/icons-material/TableView';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import SaveIcon from '@mui/icons-material/Save';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import ComputerIcon from '@mui/icons-material/Computer';
import CloudIcon from '@mui/icons-material/Cloud';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import BugReportIcon from '@mui/icons-material/BugReport';
import ScreenshotMonitorIcon from '@mui/icons-material/ScreenshotMonitor';

// Enhanced Global Fetch Wrapper - NO FALLBACKS between auth modes
const originalFetch = window.fetch;
(window as any).fetch = async (url: string | Request, options?: RequestInit): Promise<Response> => {
    const urlString = typeof url === 'string' ? url : url.url;
    const isApiCall = urlString.startsWith('/api/');

    if (isApiCall) {
        let authToken = null;

        try {
            // First, determine the current auth mode
            let authMode = 'none';
            try {
                // Use originalFetch to avoid infinite recursion when checking auth mode
                const modeResponse = await originalFetch('/api/unified-auth/config');
                if (modeResponse.ok) {
                    const configData = await modeResponse.json();
                    authMode = configData.authMode || 'none';
                }
            } catch (e) {
                console.warn('Could not determine auth mode, defaulting to none');
            }

            // Handle token based on auth mode - NO FALLBACKS
            if (authMode === 'local') {
                // For local auth, ONLY use the local token
                authToken = localStorage.getItem('junctionrelay_token');
            } else if (authMode === 'cloud') {
                // For cloud auth, ONLY use proxy token - NO FALLBACKS
                authToken = localStorage.getItem('cloud_proxy_token');
                // NO FALLBACK - if cloud auth fails, authToken stays null
            }
            // For 'none' mode, authToken remains null (no authentication)

        } catch (e) {
            console.warn('Error determining auth strategy:', e);
            // NO FALLBACK - don't assume local token for unknown auth modes
        }

        // Add Authorization header if we have a token
        if (authToken) {
            const headers = {
                'Authorization': `Bearer ${authToken}`,
                ...options?.headers,
            };
            options = { ...options, headers };
        }
    }

    return originalFetch(url, options);
};

// Login page component
const LoginPage: React.FC = () => {
    const showSnackbar = (message: string, severity?: any) => {
        if (severity === 'error') {
            alert(message);
        } else if (severity === 'success') {
            console.log('[SUCCESS]', message);
        } else if (severity === 'info') {
            console.log('[INFO]', message);
        }
    };

    return (
        <>
            <Navbar />
            <Container
                maxWidth={false}
                sx={{
                    backgroundColor: "background.default",
                    minHeight: "100vh",
                    paddingTop: { xs: "56px", sm: "64px" },
                    paddingBottom: 4,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
            >
                <Box sx={{ maxWidth: '500px', width: '100%' }}>
                    <Typography variant="h4" align="center" gutterBottom sx={{ mb: 4 }}>
                        JunctionRelay
                    </Typography>
                    <LoginOnly showSnackbar={showSnackbar} />
                </Box>
            </Container>
        </>
    );
};

// Wrapper component to handle bottom action bar logic
const BottomActionBarWrapper: React.FC = () => {
    const location = useLocation();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const featureFlags = useFeatureFlags();

    // State to track current view modes for different pages
    const [devicesViewMode, setDevicesViewMode] = useState(() => {
        return localStorage.getItem('junctionrelay_devices_view_mode_unified') || 'table';
    });

    const [collectorsViewMode, setCollectorsViewMode] = useState(() => {
        return localStorage.getItem('junctionrelay_collectors_view_mode') || 'table';
    });

    const [servicesViewMode, setServicesViewMode] = useState(() => {
        return localStorage.getItem('junctionrelay_services_view_mode') || 'table';
    });

    const [frameEngineViewMode, setFrameEngineViewMode] = useState(() => {
        return localStorage.getItem('junctionrelay_frameengine_view_mode') || 'table';
    });

    const [payloadsViewMode, setPayloadsViewMode] = useState(() => {
        return localStorage.getItem('junctionrelay_payloads_view_mode') || 'table';
    });

    const [dashboardJunctionsViewMode, setDashboardJunctionsViewMode] = useState(() => {
        return localStorage.getItem('dashboard_junctions_view_mode') || 'table';
    });

    const [junctionsViewMode, setJunctionsViewMode] = useState(() => {
        return localStorage.getItem('junctions_view_mode') || 'table';
    });

    // State for configure page view modes
    const [configureDeviceViewMode, setConfigureDeviceViewMode] = useState(() => {
        return localStorage.getItem('configure_device_view_mode') || 'table';
    });

    const [configureJunctionViewMode, setConfigureJunctionViewMode] = useState(() => {
        return localStorage.getItem('configure_junction_view_mode') || 'table';
    });

    const [configureCollectorViewMode, setConfigureCollectorViewMode] = useState(() => {
        return localStorage.getItem('configure_collector_view_mode') || 'table';
    });

    const [configureServiceViewMode, setConfigureServiceViewMode] = useState(() => {
        return localStorage.getItem('configure_service_view_mode') || 'table';
    });

    const [configureFrameViewMode, setConfigureFrameViewMode] = useState(() => {
        return localStorage.getItem('configure_frame_view_mode') || 'table';
    });

    const [eventEngineViewMode, setEventEngineViewMode] = useState(() => {
        return localStorage.getItem('junctionrelay_eventengine_view_mode') || 'table';
    });

    const [configureEventRuleViewMode, setConfigureEventRuleViewMode] = useState(() => {
        return localStorage.getItem('configure_eventrule_view_mode') || 'table';
    });

    const [configurePayloadViewMode, setConfigurePayloadViewMode] = useState(() => {
        return localStorage.getItem('configure_payload_view_mode') || 'table';
    });

    // Listen for view mode changes from localStorage and sync state
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'junctionrelay_devices_view_mode_unified' && e.newValue) {
                setDevicesViewMode(e.newValue);
            }
            if (e.key === 'junctionrelay_collectors_view_mode' && e.newValue) {
                setCollectorsViewMode(e.newValue);
            }
            if (e.key === 'junctionrelay_services_view_mode' && e.newValue) {
                setServicesViewMode(e.newValue);
            }
            if (e.key === 'junctionrelay_frameengine_view_mode' && e.newValue) {
                setFrameEngineViewMode(e.newValue);
            }
            if (e.key === 'junctionrelay_eventengine_view_mode' && e.newValue) {
                setEventEngineViewMode(e.newValue);
            }
            if (e.key === 'junctionrelay_payloads_view_mode' && e.newValue) {
                setPayloadsViewMode(e.newValue);
            }
            if (e.key === 'configure_eventrule_view_mode' && e.newValue) {
                setConfigureEventRuleViewMode(e.newValue);
            }
            if (e.key === 'dashboard_junctions_view_mode' && e.newValue) {
                setDashboardJunctionsViewMode(e.newValue);
            }
            if (e.key === 'junctions_view_mode' && e.newValue) {
                setJunctionsViewMode(e.newValue);
            }
        };

        // Listen for custom events dispatched when view mode changes
        const handleViewModeChange = (e: CustomEvent) => {
            if (e.detail.mode) {
                // Update the appropriate view mode based on current page
                if (location.pathname === '/devices') {
                    setDevicesViewMode(e.detail.mode);
                } else if (location.pathname === '/collectors') {
                    setCollectorsViewMode(e.detail.mode);
                } else if (location.pathname === '/services') {
                    setServicesViewMode(e.detail.mode);
                } else if (location.pathname === '/frameengine') {
                    setFrameEngineViewMode(e.detail.mode);
                } else if (location.pathname === '/eventengine') {
                    setEventEngineViewMode(e.detail.mode);
                } else if (location.pathname === '/payloads') {
                    setPayloadsViewMode(e.detail.mode);
                } else if (location.pathname === '/') {
                    setDashboardJunctionsViewMode(e.detail.mode);
                } else if (location.pathname === '/junctions') {
                    setJunctionsViewMode(e.detail.mode);
                } else if (location.pathname.includes('/configure-device/')) {
                    setConfigureDeviceViewMode(e.detail.mode);
                } else if (location.pathname.includes('/configure-junction/')) {
                    setConfigureJunctionViewMode(e.detail.mode);
                } else if (location.pathname.includes('/configure-collector/')) {
                    setConfigureCollectorViewMode(e.detail.mode);
                } else if (location.pathname.includes('/configure-eventrule/')) {
                    setConfigureEventRuleViewMode(e.detail.mode);
                } else if (location.pathname.includes('/configure-service/')) {
                    setConfigureServiceViewMode(e.detail.mode);
                } else if (location.pathname.includes('/configure-frame/')) {
                    setConfigureFrameViewMode(e.detail.mode);
                } else if (location.pathname.includes('/configure-payload/')) {
                    setConfigurePayloadViewMode(e.detail.mode);
                }
            }
        };

        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('bottom-action-view-mode-change', handleViewModeChange as EventListener);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('bottom-action-view-mode-change', handleViewModeChange as EventListener);
        };
    }, [location.pathname]);

    // Don't show on certain pages
    const isDetailPage = location.pathname.includes('/testing') ||
        location.pathname.includes('/hostinfo') ||
        location.pathname.includes('/hostcharts') ||
        location.pathname.includes('/device/') && location.pathname.includes('/virtual-screen');

    if (!isMobile || isDetailPage) {
        return null;
    }

    // Determine if we're on a configure page
    const isConfigurePage = location.pathname.includes('/configure-');

    // Get feature flag for back button (handle both boolean and string values)
    const showBackButton = featureFlags?.mobile_show_back_button === true ||
        featureFlags?.mobile_show_back_button === 'true';

    // Helper function to get current view mode
    const getCurrentViewMode = () => {
        if (location.pathname === '/') {
            return dashboardJunctionsViewMode;
        } else if (location.pathname === '/junctions') {
            return junctionsViewMode;
        } else if (location.pathname === '/devices') {
            return devicesViewMode;
        } else if (location.pathname === '/collectors') {
            return collectorsViewMode;
        } else if (location.pathname === '/services') {
            return servicesViewMode;
        } else if (location.pathname === '/frameengine') {
            return frameEngineViewMode;
        } else if (location.pathname === '/eventengine') {
            return eventEngineViewMode;
        } else if (location.pathname === '/payloads') {
            return payloadsViewMode;
        } else if (location.pathname.includes('/configure-device/')) {
            return configureDeviceViewMode;
        } else if (location.pathname.includes('/configure-junction/')) {
            return configureJunctionViewMode;
        } else if (location.pathname.includes('/configure-collector/')) {
            return configureCollectorViewMode;
        } else if (location.pathname.includes('/configure-eventrule/')) {
            return configureEventRuleViewMode;
        } else if (location.pathname.includes('/configure-service/')) {
            return configureServiceViewMode;
        } else if (location.pathname.includes('/configure-frame/')) {
            return configureFrameViewMode;
        } else if (location.pathname.includes('/configure-payload/')) {
            return configurePayloadViewMode;
        }
        return 'table';
    };

    // Helper function to handle view mode changes
    const handleViewModeChange = (mode: string) => {
        let storageKey = '';
        let setterFunction = null;

        if (location.pathname === '/') {
            storageKey = 'dashboard_junctions_view_mode';
            setterFunction = setDashboardJunctionsViewMode;
        } else if (location.pathname === '/junctions') {
            storageKey = 'junctions_view_mode';
            setterFunction = setJunctionsViewMode;
        } else if (location.pathname === '/devices') {
            storageKey = 'junctionrelay_devices_view_mode_unified';
            setterFunction = setDevicesViewMode;
        } else if (location.pathname === '/collectors') {
            storageKey = 'junctionrelay_collectors_view_mode';
            setterFunction = setCollectorsViewMode;
        } else if (location.pathname === '/services') {
            storageKey = 'junctionrelay_services_view_mode';
            setterFunction = setServicesViewMode;
        } else if (location.pathname === '/frameengine') {
            storageKey = 'junctionrelay_frameengine_view_mode';
            setterFunction = setFrameEngineViewMode;
        } else if (location.pathname === '/eventengine') {
            storageKey = 'junctionrelay_eventengine_view_mode';
            setterFunction = setEventEngineViewMode;
        } else if (location.pathname === '/payloads') {
            storageKey = 'junctionrelay_payloads_view_mode';
            setterFunction = setPayloadsViewMode;
        } else if (location.pathname.includes('/configure-device/')) {
            storageKey = 'configure_device_view_mode';
            setterFunction = setConfigureDeviceViewMode;
        } else if (location.pathname.includes('/configure-junction/')) {
            storageKey = 'configure_junction_view_mode';
            setterFunction = setConfigureJunctionViewMode;
        } else if (location.pathname.includes('/configure-collector/')) {
            storageKey = 'configure_collector_view_mode';
            setterFunction = setConfigureCollectorViewMode;
        } else if (location.pathname.includes('/configure-eventrule/')) {
            storageKey = 'configure_eventrule_view_mode';
            setterFunction = setConfigureEventRuleViewMode;
        } else if (location.pathname.includes('/configure-service/')) {
            storageKey = 'configure_service_view_mode';
            setterFunction = setConfigureServiceViewMode;
        } else if (location.pathname.includes('/configure-frame/')) {
            storageKey = 'configure_frame_view_mode';
            setterFunction = setConfigureFrameViewMode;
        } else if (location.pathname.includes('/configure-payload/')) {
            storageKey = 'configure_payload_view_mode';
            setterFunction = setConfigurePayloadViewMode;
        }

        if (storageKey && setterFunction) {
            localStorage.setItem(storageKey, mode);
            setterFunction(mode);
            window.dispatchEvent(new CustomEvent('bottom-action-view-mode-change', {
                detail: { mode }
            }));
        }
    };

    // View mode actions (always available)
    const viewModeActions = {
        currentMode: getCurrentViewMode(),
        modes: [
            { mode: 'table', icon: <TableViewIcon />, label: 'Table View' },
            { mode: 'standard', icon: <DashboardIcon />, label: 'Standard Tiles' },
            { mode: 'mini', icon: <ViewModuleIcon />, label: 'Mini Tiles' }
        ],
        onModeChange: handleViewModeChange
    };

    // Get actions based on current page
    const getBottomActionConfig = () => {
        // Configure pages
        if (isConfigurePage) {
            // Page-specific configure actions
            if (location.pathname.includes('/configure-device/')) {
                return {
                    showBackButton,
                    showSaveButton: true,
                    viewModeActions,
                    heroAction: {
                        icon: <BugReportIcon />,
                        label: 'Test Connection',
                        onClick: () => {
                            window.dispatchEvent(new CustomEvent('bottom-action-test-connection'));
                        }
                    },
                    rightSecondaryActions: [
                        {
                            icon: <DeleteSweepIcon />,
                            label: 'Delete',
                            color: 'error' as const,
                            onClick: () => {
                                window.dispatchEvent(new CustomEvent('bottom-action-delete'));
                            }
                        }
                    ]
                };
            } else if (location.pathname.includes('/configure-junction/')) {
                return {
                    showBackButton,
                    showSaveButton: true,
                    viewModeActions,
                    heroAction: {
                        icon: <PlayArrowIcon />,
                        label: 'Start Junction',
                        onClick: () => {
                            window.dispatchEvent(new CustomEvent('bottom-action-start-junction'));
                        }
                    },
                    rightSecondaryActions: [
                        {
                            icon: <CloudUploadIcon />,
                            label: 'Export',
                            onClick: () => {
                                window.dispatchEvent(new CustomEvent('bottom-action-export'));
                            }
                        },
                        {
                            icon: <DeleteSweepIcon />,
                            label: 'Delete',
                            color: 'error' as const,
                            onClick: () => {
                                window.dispatchEvent(new CustomEvent('bottom-action-delete'));
                            }
                        }
                    ]
                };
            } else if (location.pathname.includes('/configure-collector/')) {
                return {
                    showBackButton,
                    showSaveButton: true,
                    viewModeActions,
                    heroAction: {
                        icon: <BugReportIcon />,
                        label: 'Test Collector',
                        onClick: () => {
                            window.dispatchEvent(new CustomEvent('bottom-action-test-connection'));
                        }
                    },
                    rightSecondaryActions: [
                        {
                            icon: <DeleteSweepIcon />,
                            label: 'Delete',
                            color: 'error' as const,
                            onClick: () => {
                                window.dispatchEvent(new CustomEvent('bottom-action-delete'));
                            }
                        }
                    ]
                };
            } else if (location.pathname.includes('/configure-eventrule/')) {
                return {
                    showBackButton,
                    showSaveButton: true,
                    viewModeActions,
                    heroAction: {
                        icon: <BugReportIcon />,
                        label: 'Test Rule',
                        onClick: () => {
                            window.dispatchEvent(new CustomEvent('bottom-action-test-eventrule'));
                        }
                    },
                    rightSecondaryActions: [
                        {
                            icon: <DeleteSweepIcon />,
                            label: 'Delete',
                            color: 'error' as const,
                            onClick: () => {
                                window.dispatchEvent(new CustomEvent('bottom-action-delete'));
                            }
                        }
                    ]
                };
            }
            else if (location.pathname.includes('/configure-service/')) {
                return {
                    showBackButton,
                    showSaveButton: true,
                    viewModeActions,
                    heroAction: {
                        icon: <BugReportIcon />,
                        label: 'Test Service',
                        onClick: () => {
                            window.dispatchEvent(new CustomEvent('bottom-action-test-service'));
                        }
                    },
                    rightSecondaryActions: [
                        {
                            icon: <DeleteSweepIcon />,
                            label: 'Delete',
                            color: 'error' as const,
                            onClick: () => {
                                window.dispatchEvent(new CustomEvent('bottom-action-delete'));
                            }
                        }
                    ]
                };
            } else if (location.pathname.includes('/configure-frame/')) {
                return {
                    showBackButton,
                    showSaveButton: true,
                    viewModeActions,
                    heroAction: {
                        icon: <CloudUploadIcon />,
                        label: 'Export Frame',
                        onClick: () => {
                            window.dispatchEvent(new CustomEvent('bottom-action-export'));
                        }
                    },
                    rightSecondaryActions: []
                };

            } else if (location.pathname.includes('/configure-payload/')) {
                return {
                    showBackButton,
                    showSaveButton: true,
                    viewModeActions,
                    heroAction: {
                        icon: <CloudUploadIcon />,
                        label: 'Export Layout',
                        onClick: () => {
                            window.dispatchEvent(new CustomEvent('bottom-action-export'));
                        }
                    },
                    rightSecondaryActions: []
                };
            }

            // Default configure page config
            return {
                showBackButton,
                showSaveButton: true,
                viewModeActions,
                rightSecondaryActions: []
            };
        }

        // List view pages
        switch (location.pathname) {
            case '/':
                return {
                    showBackButton,
                    showSaveButton: false,
                    viewModeActions,
                    heroAction: {
                        icon: <AddIcon />,
                        label: 'Add Junction',
                        onClick: () => {
                            window.dispatchEvent(new CustomEvent('bottom-action-add-junction'));
                        }
                    }
                };

            case '/junctions':
                return {
                    showBackButton,
                    showSaveButton: false,
                    viewModeActions,
                    heroAction: {
                        icon: <AddIcon />,
                        label: 'Add Junction',
                        onClick: () => {
                            window.dispatchEvent(new CustomEvent('bottom-action-add-junction'));
                        }
                    }
                };

            case '/devices':
                return {
                    showBackButton,
                    showSaveButton: false,
                    viewModeActions,
                    heroAction: {
                        icon: <AddIcon />,
                        label: 'Add Device',
                        submenu: [
                            {
                                icon: <ComputerIcon />,
                                label: 'Add Custom Local Device',
                                description: 'Manually configure a local device',
                                onClick: () => {
                                    window.dispatchEvent(new CustomEvent('bottom-action-add-device'));
                                },
                                color: 'primary' as const
                            },
                            {
                                icon: <ScreenshotMonitorIcon />,
                                label: 'Create Virtual Screen',
                                description: 'Create a virtual display for Rive visualizations',
                                onClick: () => {
                                    window.dispatchEvent(new CustomEvent('bottom-action-add-virtual-screen'));
                                },
                                color: 'secondary' as const
                            }
                        ]
                    },
                    rightSecondaryActions: [
                        {
                            icon: null,
                            label: 'Scan',
                            showText: true,
                            onClick: () => {
                                window.dispatchEvent(new CustomEvent('bottom-action-search'));
                            }
                        }
                    ]
                };

            case '/collectors':
                return {
                    showBackButton,
                    showSaveButton: false,
                    viewModeActions,
                    heroAction: {
                        icon: <AddIcon />,
                        label: 'Add Collector',
                        onClick: () => {
                            window.dispatchEvent(new CustomEvent('bottom-action-add-collector'));
                        }
                    },
                    rightSecondaryActions: [
                        {
                            icon: null,
                            label: 'Test',
                            showText: true,
                            onClick: () => {
                                window.dispatchEvent(new CustomEvent('bottom-action-test-all'));
                            }
                        }
                    ]
                };

            case '/services':
                return {
                    showBackButton,
                    showSaveButton: false,
                    viewModeActions,
                    heroAction: {
                        icon: <AddIcon />,
                        label: 'Add Service',
                        onClick: () => {
                            window.dispatchEvent(new CustomEvent('bottom-action-add-service'));
                        }
                    },
                    rightSecondaryActions: [
                        {
                            icon: null,
                            label: 'Test',
                            showText: true,
                            onClick: () => {
                                window.dispatchEvent(new CustomEvent('bottom-action-test-all'));
                            }
                        }
                    ]
                };

            case '/frameengine':
                return {
                    showBackButton,
                    showSaveButton: false,
                    viewModeActions,
                    heroAction: {
                        icon: <AddIcon />,
                        label: 'Add Frame',
                        onClick: () => {
                            window.dispatchEvent(new CustomEvent('bottom-action-add-frame'));
                        }
                    }
                };

            case '/eventengine':
                return {
                    showBackButton,
                    showSaveButton: false,
                    viewModeActions,
                    heroAction: {
                        icon: <AddIcon />,
                        label: 'Add Event Rule',
                        onClick: () => {
                            window.dispatchEvent(new CustomEvent('bottom-action-add-eventrule'));
                        }
                    }
                };

            case '/payloads':
                return {
                    showBackButton,
                    showSaveButton: false,
                    viewModeActions,
                    heroAction: {
                        icon: <AddIcon />,
                        label: 'Add Layout',
                        onClick: () => {
                            window.dispatchEvent(new CustomEvent('bottom-action-add-payload'));
                        }
                    }
                };

            case '/settings':
                return {
                    showBackButton,
                    showSaveButton: false,
                    rightSecondaryActions: [
                        {
                            icon: <SaveIcon />,
                            label: 'Backup',
                            showText: true,
                            onClick: () => {
                                window.dispatchEvent(new CustomEvent('bottom-action-backup'));
                            }
                        },
                        {
                            icon: <DeleteSweepIcon />,
                            label: 'Cache',
                            showText: true,
                            onClick: () => {
                                window.dispatchEvent(new CustomEvent('bottom-action-clear-cache'));
                            }
                        }
                    ]
                };

            default:
                return {
                    showBackButton,
                    showSaveButton: false,
                    viewModeActions
                };
        }
    };

    return <BottomActionBar {...getBottomActionConfig()} />;
};

// Navigation logger component
const NavigationLogger: React.FC = () => {
    const location = useLocation();

    useEffect(() => {
        console.log('🗺️🗺️🗺️ ROUTE CHANGED TO:', location.pathname);
    }, [location.pathname]);

    return null;
};

// Main app routes component
const AppRoutes: React.FC = () => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const location = useLocation();

    // Check if we're on a virtual screen route or embed route
    const isVirtualScreenRoute = location.pathname.includes('/device/') && location.pathname.includes('/virtual-screen');
    const isEmbedRoute = location.pathname.includes('/embed');

    // Hide navbar for these routes
    const hideNavbar = isVirtualScreenRoute || isEmbedRoute;

    return (
        <>
            <NavigationLogger />
            {/* Hide navbar for virtual screen viewer and embed pages */}
            {!hideNavbar && <Navbar />}
            <Container
                maxWidth={false}
                sx={{
                    backgroundColor: "background.default",
                    minHeight: "100vh",
                    // Only add top padding if navbar is visible
                    paddingTop: hideNavbar ? 0 : { xs: "56px", sm: "64px" },
                    // Add bottom padding on mobile to account for bottom action bar (except special routes)
                    paddingBottom: isMobile && !hideNavbar ? { xs: '84px', sm: '84px' } : 4,
                    // Remove padding for special routes full experience
                    padding: hideNavbar ? 0 : undefined
                }}
            >
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/junctions" element={<Junctions />} />
                    <Route path="/streams" element={<Streams />} />
                    <Route path="/devices" element={<Devices />} />
                    <Route path="/services" element={<Services />} />
                    <Route path="/collectors" element={<Collectors />} />
                    <Route path="/virtualdevices" element={<VirtualDevices />} />
                    <Route path="/virtualdevices/:id/configure" element={<ConfigureVirtualDevice />} />
                    <Route path="/configure-device/:id" element={<ConfigureDevice key={location.pathname} />} />
                    <Route path="/configure-service/:id" element={<ConfigureService />} />
                    <Route path="/configure-collector/:id" element={<ConfigureCollector />} />
                    <Route path="/configure-eventrule/:id" element={<ConfigureEventRule />} />
                    <Route path="/configure-junction/:id" element={<ConfigureJunction />} />
                    <Route path="/frameengine" element={<FrameEngine />} />
                    <Route path="/frameengine/embed" element={<FrameEngineEmbed />} />
                    <Route path="/configure-frame/:id" element={<ConfigureFrame />} />
                    <Route path="/eventengine" element={<EventEngine />} />
                    <Route path="/payloads" element={<Payloads />} />
                    <Route path="/configure-payload/:id" element={<ConfigurePayload />} />
                    <Route path="/device/:deviceId/virtual-screen" element={<VirtualScreenViewer key={location.pathname} />} />
                    <Route path="/device/:deviceId/virtual-screen/fullscreen" element={<VirtualScreenViewer key={location.pathname} />} />
                    <Route path="/hostinfo" element={<HostInfo />} />
                    <Route path="/hostcharts" element={<HostCharts />} />
                    <Route path="/settings" element={<Settings />} />
                </Routes>
            </Container>
            {/* Bottom Action Bar - only shows on mobile */}
            <BottomActionBarWrapper />
        </>
    );
};

// Authentication boundary component with virtual screen bypass
const AuthBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [showLogin, setShowLogin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [hasCheckedInitialAuth, setHasCheckedInitialAuth] = useState(false);
    const location = useLocation();

    // Check if current route should bypass authentication
    const isVirtualScreenRoute = useMemo(() => {
        return location.pathname.includes('/device/') && location.pathname.includes('/virtual-screen');
    }, [location.pathname]);

    const isEmbedRoute = useMemo(() => {
        return location.pathname.includes('/embed');
    }, [location.pathname]);

    const bypassAuth = isVirtualScreenRoute || isEmbedRoute;

    const checkAuthStatus = useCallback(async () => {
        try {
            // BYPASS: Skip authentication for virtual screen routes and embed routes
            if (bypassAuth) {
                console.log('Special route detected (virtual screen or embed), bypassing authentication');
                setShowLogin(false);
                setLoading(false);
                return;
            }

            // First check auth mode - this should always be accessible
            const modeResponse = await originalFetch('/api/unified-auth/config');
            if (!modeResponse.ok) {
                setShowLogin(false);
                setLoading(false);
                return;
            }

            const configData = await modeResponse.json();
            const authMode = configData.authMode || 'none';

            // If no authentication required, don't show login
            if (authMode === 'none') {
                setShowLogin(false);
                setLoading(false);
                return;
            }

            // Check authentication based on mode
            let isAuthenticated = false;

            if (authMode === 'local') {
                // For local auth, check if we have a valid local token
                const localToken = localStorage.getItem('junctionrelay_token');

                if (localToken) {
                    // Test the local token
                    try {
                        const response = await fetch('/api/unified-auth/validate', {
                            method: 'POST'
                        });
                        if (response.ok) {
                            isAuthenticated = true;
                        }
                    } catch (error) {
                        console.error('Local token validation failed:', error);
                    }
                }
            } else if (authMode === 'cloud') {
                // For cloud auth, check proxy token
                const proxyToken = localStorage.getItem('cloud_proxy_token');

                if (proxyToken) {
                    try {
                        // Validate proxy token with unified auth controller
                        const response = await originalFetch('/api/unified-auth/validate', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${proxyToken}` }
                        });
                        if (response.ok) {
                            isAuthenticated = true;
                        } else {
                            // Token is invalid, remove it
                            localStorage.removeItem('cloud_proxy_token');
                        }
                    } catch (error) {
                        console.error('Cloud proxy token validation failed:', error);
                        localStorage.removeItem('cloud_proxy_token');
                    }
                }
            }

            setShowLogin(!isAuthenticated);

        } catch (error) {
            console.error('Auth check failed:', error);
            setShowLogin(true);
        } finally {
            setLoading(false);
        }
    }, [bypassAuth]);

    // Check auth status on route changes, but only after initial auth check
    useEffect(() => {
        if (hasCheckedInitialAuth) {
            checkAuthStatus();
        }
    }, [location.pathname, hasCheckedInitialAuth, checkAuthStatus]);

    // Initial auth check
    useEffect(() => {
        const performInitialAuthCheck = async () => {
            await checkAuthStatus();
            setHasCheckedInitialAuth(true);
        };

        performInitialAuthCheck();
    }, [checkAuthStatus]);

    // Listen for auth changes - but skip for virtual screen routes
    useEffect(() => {
        const handleAuthChange = (event: any) => {
            // Skip auth change handling for virtual screen routes
            if (isVirtualScreenRoute) {
                return;
            }

            // Always recheck auth when auth-changed event is fired
            if (hasCheckedInitialAuth) {
                console.log('Auth change detected, rechecking...');
                checkAuthStatus();
            }
        };

        const handleStorageChange = (event: StorageEvent) => {
            // Skip storage change handling for virtual screen routes
            if (isVirtualScreenRoute) {
                return;
            }

            // Only care about auth-related storage changes
            if (event.key === 'junctionrelay_token' ||
                event.key === 'cloud_proxy_token' ||
                event.key === 'junction-relay-cloud-setup') {
                if (hasCheckedInitialAuth) {
                    console.log('Auth storage change detected, rechecking...');
                    checkAuthStatus();
                }
            }
        };

        window.addEventListener('auth-changed', handleAuthChange);
        window.addEventListener('storage', handleStorageChange);

        return () => {
            window.removeEventListener('auth-changed', handleAuthChange);
            window.removeEventListener('storage', handleStorageChange);
        };
    }, [hasCheckedInitialAuth, checkAuthStatus, isVirtualScreenRoute]);

    // Handle global 401 responses - skip for virtual screen routes
    useEffect(() => {
        const handleGlobal401 = (event: CustomEvent) => {
            if (isVirtualScreenRoute) {
                return;
            }
            setShowLogin(true);
        };

        window.addEventListener('auth-required' as any, handleGlobal401);
        return () => window.removeEventListener('auth-required' as any, handleGlobal401);
    }, [bypassAuth]);

    // Handle auth callback from cloud proxy - skip for virtual screen routes
    useEffect(() => {
        if (isVirtualScreenRoute) {
            return;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        const authStatus = urlParams.get('auth');

        if (token && authStatus === 'success') {
            localStorage.setItem('cloud_proxy_token', token);

            // Clear URL parameters
            window.history.replaceState({}, document.title, window.location.pathname);

            checkAuthStatus();
            window.dispatchEvent(new CustomEvent('auth-changed'));
        }
    }, [checkAuthStatus, isVirtualScreenRoute]);

    if (loading) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '100vh',
                    backgroundColor: 'background.default'
                }}
            >
                <CircularProgress size={40} sx={{ mb: 2 }} />
                <Typography variant="body2" color="text.secondary">
                    Loading...
                </Typography>
            </Box>
        );
    }

    if (showLogin) {
        return <LoginPage />;
    }

    return <>{children}</>;
};

// Inner App component wrapped by providers
const AppWithProviders: React.FC = () => {
    return (
        <AuthProvider>
            <Router>
                <NotificationProvider>
                    <UnifiedNotificationProvider>
                        <AuthBoundary>
                            <AppRoutes />
                        </AuthBoundary>
                    </UnifiedNotificationProvider>
                </NotificationProvider>
            </Router>
        </AuthProvider>
    );
};

// Main App component
const App: React.FC = () => {
    return <AppWithProviders />;
};

export default App;