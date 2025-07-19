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

import React, { useState, useEffect, useCallback } from "react";
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import { Container, Box, CircularProgress, Typography, useTheme, useMediaQuery } from "@mui/material";
import Navbar from "components/Navbar";
import BottomActionBar from "components/BottomActionBar";
import Dashboard from "pages/Dashboard";
import Junctions from "pages/Junctions";
import Devices from "pages/Devices";
import Services from "pages/Services";
import Collectors from "pages/Collectors";
import ConfigureDevice from "pages/ConfigureDevice";
import ConfigureService from "pages/ConfigureService";
import ConfigureCollector from "pages/ConfigureCollector";
import ConfigureJunction from "pages/ConfigureJunction";
import Payloads from "pages/Payloads";
import ConfigurePayload from "pages/ConfigurePayload";
import Testing from "pages/Testing";
import TestingQuad from "pages/TestingQuad";
import HostInfo from "pages/HostInfo";
import HostCharts from "pages/HostCharts";
import Settings from "pages/Settings";
import LoginOnly from "components/LoginOnly";
import { AuthProvider } from "auth/AuthContext";
import Streams from "pages/Streams";

// Import statements for icons used in BottomActionBarWrapper
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import FilterListIcon from '@mui/icons-material/FilterList';
import TableViewIcon from '@mui/icons-material/TableView';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import SearchIcon from '@mui/icons-material/Search';
import SaveIcon from '@mui/icons-material/Save';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import ComputerIcon from '@mui/icons-material/Computer';
import CloudIcon from '@mui/icons-material/Cloud';
import MemoryIcon from '@mui/icons-material/Memory';

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
                const modeResponse = await originalFetch('/api/auth/mode');
                if (modeResponse.ok) {
                    const modeData = await modeResponse.json();
                    authMode = modeData.mode || 'none';
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

    const [payloadsViewMode, setPayloadsViewMode] = useState(() => {
        return localStorage.getItem('junctionrelay_payloads_view_mode') || 'table';
    });

    const [dashboardJunctionsViewMode, setDashboardJunctionsViewMode] = useState(() => {
        return localStorage.getItem('dashboard_junctions_view_mode') || 'table';
    });

    const [junctionsViewMode, setJunctionsViewMode] = useState(() => {
        return localStorage.getItem('junctions_view_mode') || 'table';
    });

    // State for configure device actions (dynamically set by the configure device page)
    const [configureDeviceActions, setConfigureDeviceActions] = useState<any>(null);

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
            if (e.key === 'junctionrelay_payloads_view_mode' && e.newValue) {
                setPayloadsViewMode(e.newValue);
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
                } else if (location.pathname === '/payloads') {
                    setPayloadsViewMode(e.detail.mode);
                } else if (location.pathname === '/') {
                    setDashboardJunctionsViewMode(e.detail.mode);
                } else if (location.pathname === '/junctions') {
                    setJunctionsViewMode(e.detail.mode);
                }
            }
        };

        // Listen for configure device bottom actions configuration
        const handleConfigureDeviceActions = (e: CustomEvent) => {
            if (e.detail.clear) {
                setConfigureDeviceActions(null);
            } else {
                setConfigureDeviceActions(e.detail);
            }
        };

        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('bottom-action-view-mode-change', handleViewModeChange as EventListener);
        window.addEventListener('configure-device-bottom-actions', handleConfigureDeviceActions as EventListener);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('bottom-action-view-mode-change', handleViewModeChange as EventListener);
            window.removeEventListener('configure-device-bottom-actions', handleConfigureDeviceActions as EventListener);
        };
    }, [location.pathname]);

    // Don't show on certain pages, but DO show on settings and configure pages
    const isDetailPage = location.pathname.includes('/testing') ||
        location.pathname.includes('/hostinfo') ||
        location.pathname.includes('/hostcharts');

    if (!isMobile || isDetailPage) {
        return null;
    }

    // Check if we're on a configure device page
    const isConfigureDevicePage = location.pathname.includes('/configure-device/');

    // If we're on configure device page and have actions configured, use those
    if (isConfigureDevicePage && configureDeviceActions) {
        return (
            <>
                <BottomActionBar {...configureDeviceActions} />
                {/* Status indicator overlay for unsaved changes */}
                {configureDeviceActions.statusIndicator && (
                    <Box
                        sx={{
                            position: 'fixed',
                            bottom: 70, // Above the bottom action bar
                            left: '50%',
                            transform: 'translateX(-50%)',
                            zIndex: theme.zIndex.snackbar,
                            px: 2,
                            py: 0.5,
                            backgroundColor: (() => {
                                const color = configureDeviceActions.statusIndicator.color || 'info';
                                switch (color) {
                                    case 'warning': return `${theme.palette.warning.main}20`;
                                    case 'success': return `${theme.palette.success.main}20`;
                                    case 'error': return `${theme.palette.error.main}20`;
                                    case 'info':
                                    default: return `${theme.palette.info.main}20`;
                                }
                            })(),
                            color: (() => {
                                const color = configureDeviceActions.statusIndicator.color || 'info';
                                switch (color) {
                                    case 'warning': return theme.palette.warning.main;
                                    case 'success': return theme.palette.success.main;
                                    case 'error': return theme.palette.error.main;
                                    case 'info':
                                    default: return theme.palette.info.main;
                                }
                            })(),
                            borderRadius: 2,
                            border: (() => {
                                const color = configureDeviceActions.statusIndicator.color || 'info';
                                switch (color) {
                                    case 'warning': return `1px solid ${theme.palette.warning.main}40`;
                                    case 'success': return `1px solid ${theme.palette.success.main}40`;
                                    case 'error': return `1px solid ${theme.palette.error.main}40`;
                                    case 'info':
                                    default: return `1px solid ${theme.palette.info.main}40`;
                                }
                            })(),
                            backdropFilter: 'blur(10px)',
                            fontSize: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5
                        }}
                    >
                        {configureDeviceActions.statusIndicator.icon && (
                            <span style={{ fontSize: '0.8rem' }}>
                                {configureDeviceActions.statusIndicator.icon}
                            </span>
                        )}
                        {configureDeviceActions.statusIndicator.text}
                    </Box>
                )}
            </>
        );
    }

    // Get actions based on current page
    const getBottomActionConfig = () => {
        switch (location.pathname) {
            case '/':
                return {
                    primaryAction: {
                        icon: <AddIcon />,
                        label: 'Add Junction',
                        onClick: () => {
                            // This would be passed down from Dashboard component
                            // For now, you could trigger a custom event or use a context
                            window.dispatchEvent(new CustomEvent('bottom-action-add-junction'));
                        }
                    },
                    secondaryActions: [
                        {
                            icon: <RefreshIcon />,
                            label: 'Refresh',
                            onClick: () => {
                                window.dispatchEvent(new CustomEvent('bottom-action-refresh'));
                            }
                        },
                        {
                            icon: <FilterListIcon />,
                            label: 'Filter',
                            onClick: () => {
                                window.dispatchEvent(new CustomEvent('bottom-action-filter'));
                            }
                        }
                    ],
                    viewModeActions: {
                        currentMode: dashboardJunctionsViewMode,
                        modes: [
                            { mode: 'table', icon: <TableViewIcon />, label: 'Table View' },
                            { mode: 'standard', icon: <DashboardIcon />, label: 'Standard Tiles' },
                            { mode: 'mini', icon: <ViewModuleIcon />, label: 'Mini Tiles' }
                        ],
                        onModeChange: (mode: string) => {
                            localStorage.setItem('dashboard_junctions_view_mode', mode);
                            setDashboardJunctionsViewMode(mode);
                            window.dispatchEvent(new CustomEvent('bottom-action-view-mode-change', {
                                detail: { mode }
                            }));
                        }
                    }
                };

            case '/junctions':
                return {
                    primaryAction: {
                        icon: <AddIcon />,
                        label: 'Add Junction',
                        onClick: () => {
                            window.dispatchEvent(new CustomEvent('bottom-action-add-junction'));
                        }
                    },
                    secondaryActions: [
                        {
                            icon: <CloudUploadIcon />,
                            label: 'Import',
                            onClick: () => {
                                window.dispatchEvent(new CustomEvent('bottom-action-import'));
                            }
                        },
                        {
                            icon: <RefreshIcon />,
                            label: 'Refresh',
                            onClick: () => {
                                window.dispatchEvent(new CustomEvent('bottom-action-refresh'));
                            }
                        }
                    ],
                    viewModeActions: {
                        currentMode: junctionsViewMode,
                        modes: [
                            { mode: 'table', icon: <TableViewIcon />, label: 'Table View' },
                            { mode: 'standard', icon: <DashboardIcon />, label: 'Standard Tiles' },
                            { mode: 'mini', icon: <ViewModuleIcon />, label: 'Mini Tiles' }
                        ],
                        onModeChange: (mode: string) => {
                            localStorage.setItem('junctions_view_mode', mode);
                            setJunctionsViewMode(mode);
                            window.dispatchEvent(new CustomEvent('bottom-action-view-mode-change', {
                                detail: { mode }
                            }));
                        }
                    }
                };

            case '/devices':
                return {
                    primaryAction: {
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
                                icon: <CloudIcon />,
                                label: 'Add Cloud Device',
                                description: 'Register a JunctionRelay cloud device',
                                onClick: () => {
                                    window.dispatchEvent(new CustomEvent('bottom-action-add-cloud-device'));
                                },
                                color: 'info' as const
                            }
                        ]
                    },
                    secondaryActions: [
                        {
                            icon: <RefreshIcon />,
                            label: 'Refresh',
                            onClick: () => {
                                window.dispatchEvent(new CustomEvent('bottom-action-refresh'));
                            }
                        },
                        {
                            icon: <SearchIcon />,
                            label: 'Scan',
                            onClick: () => {
                                // Trigger the scan modal which will show the submenu
                                window.dispatchEvent(new CustomEvent('bottom-action-search'));
                            },
                            showText: true
                        }
                    ],
                    viewModeActions: {
                        currentMode: devicesViewMode,
                        modes: [
                            { mode: 'table', icon: <TableViewIcon />, label: 'Table View' },
                            { mode: 'standard', icon: <DashboardIcon />, label: 'Standard Tiles' },
                            { mode: 'mini', icon: <ViewModuleIcon />, label: 'Mini Tiles' }
                        ],
                        onModeChange: (mode: string) => {
                            localStorage.setItem('junctionrelay_devices_view_mode_unified', mode);
                            setDevicesViewMode(mode);
                            window.dispatchEvent(new CustomEvent('bottom-action-view-mode-change', {
                                detail: { mode }
                            }));
                        }
                    }
                };

            case '/collectors':
                return {
                    primaryAction: {
                        icon: <AddIcon />,
                        label: 'Add Collector',
                        onClick: () => {
                            window.dispatchEvent(new CustomEvent('bottom-action-add-collector'));
                        }
                    },
                    secondaryActions: [
                        {
                            icon: <RefreshIcon />,
                            label: 'Refresh',
                            onClick: () => {
                                window.dispatchEvent(new CustomEvent('bottom-action-refresh'));
                            }
                        }
                    ],
                    viewModeActions: {
                        currentMode: collectorsViewMode,
                        modes: [
                            { mode: 'table', icon: <TableViewIcon />, label: 'Table View' },
                            { mode: 'standard', icon: <DashboardIcon />, label: 'Standard Tiles' },
                            { mode: 'mini', icon: <ViewModuleIcon />, label: 'Mini Tiles' }
                        ],
                        onModeChange: (mode: string) => {
                            localStorage.setItem('junctionrelay_collectors_view_mode', mode);
                            setCollectorsViewMode(mode);
                            window.dispatchEvent(new CustomEvent('bottom-action-view-mode-change', {
                                detail: { mode }
                            }));
                        }
                    }
                };

            case '/services':
                return {
                    primaryAction: {
                        icon: <AddIcon />,
                        label: 'Add Service',
                        onClick: () => {
                            window.dispatchEvent(new CustomEvent('bottom-action-add-service'));
                        }
                    },
                    secondaryActions: [
                        {
                            icon: <RefreshIcon />,
                            label: 'Refresh',
                            onClick: () => {
                                window.dispatchEvent(new CustomEvent('bottom-action-refresh'));
                            }
                        }
                    ],
                    viewModeActions: {
                        currentMode: servicesViewMode,
                        modes: [
                            { mode: 'table', icon: <TableViewIcon />, label: 'Table View' },
                            { mode: 'standard', icon: <DashboardIcon />, label: 'Standard Tiles' },
                            { mode: 'mini', icon: <ViewModuleIcon />, label: 'Mini Tiles' }
                        ],
                        onModeChange: (mode: string) => {
                            localStorage.setItem('junctionrelay_services_view_mode', mode);
                            setServicesViewMode(mode);
                            window.dispatchEvent(new CustomEvent('bottom-action-view-mode-change', {
                                detail: { mode }
                            }));
                        }
                    }
                };

            case '/payloads':
                return {
                    primaryAction: {
                        icon: <AddIcon />,
                        label: 'Add Layout',
                        onClick: () => {
                            window.dispatchEvent(new CustomEvent('bottom-action-add-payload'));
                        }
                    },
                    secondaryActions: [
                        {
                            icon: <RefreshIcon />,
                            label: 'Reset All',
                            onClick: () => {
                                window.dispatchEvent(new CustomEvent('bottom-action-reset-all'));
                            },
                            showText: true
                        }
                    ],
                    viewModeActions: {
                        currentMode: payloadsViewMode,
                        modes: [
                            { mode: 'table', icon: <TableViewIcon />, label: 'Table View' },
                            { mode: 'standard', icon: <DashboardIcon />, label: 'Standard Tiles' },
                            { mode: 'mini', icon: <ViewModuleIcon />, label: 'Mini Tiles' }
                        ],
                        onModeChange: (mode: string) => {
                            localStorage.setItem('junctionrelay_payloads_view_mode', mode);
                            setPayloadsViewMode(mode);
                            window.dispatchEvent(new CustomEvent('bottom-action-view-mode-change', {
                                detail: { mode }
                            }));
                        }
                    }
                };

            case '/settings':
                return {
                    secondaryActions: [
                        {
                            icon: <SaveIcon />,
                            label: 'Backup',
                            onClick: () => {
                                window.dispatchEvent(new CustomEvent('bottom-action-backup'));
                            },
                            showText: true
                        },
                        {
                            icon: <DeleteSweepIcon />,
                            label: 'Cache',
                            onClick: () => {
                                window.dispatchEvent(new CustomEvent('bottom-action-clear-cache'));
                            },
                            showText: true
                        },
                        {
                            icon: <SettingsBackupRestoreIcon />,
                            label: 'Reset',
                            onClick: () => {
                                window.dispatchEvent(new CustomEvent('bottom-action-reset-columns'));
                            },
                            showText: true
                        }
                    ]
                };

            default:
                return {};
        }
    };

    return <BottomActionBar {...getBottomActionConfig()} />;
};

// Main app routes component
const AppRoutes: React.FC = () => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    return (
        <>
            <Navbar />
            <Container
                maxWidth={false}
                sx={{
                    backgroundColor: "background.default",
                    minHeight: "100vh",
                    paddingTop: { xs: "56px", sm: "64px" },
                    // Add bottom padding on mobile to account for bottom action bar
                    paddingBottom: isMobile ? { xs: '84px', sm: '84px' } : 4
                }}
            >
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/junctions" element={<Junctions />} />
                    <Route path="/streams" element={<Streams />} />
                    <Route path="/devices" element={<Devices />} />
                    <Route path="/services" element={<Services />} />
                    <Route path="/collectors" element={<Collectors />} />
                    <Route path="/configure-device/:id" element={<ConfigureDevice />} />
                    <Route path="/configure-service/:id" element={<ConfigureService />} />
                    <Route path="/configure-collector/:id" element={<ConfigureCollector />} />
                    <Route path="/configure-junction/:id" element={<ConfigureJunction />} />
                    <Route path="/payloads" element={<Payloads />} />
                    <Route path="/configure-payload/:id" element={<ConfigurePayload />} />
                    <Route path="/testing" element={<Testing />} />
                    <Route path="/testingquad" element={<TestingQuad />} />
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

// Authentication boundary component
const AuthBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [showLogin, setShowLogin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [hasCheckedInitialAuth, setHasCheckedInitialAuth] = useState(false);
    const location = useLocation();

    const checkAuthStatus = useCallback(async () => {
        try {
            // First check auth mode - this should always be accessible
            const modeResponse = await originalFetch('/api/auth/mode');
            if (!modeResponse.ok) {
                setShowLogin(false);
                setLoading(false);
                return;
            }

            const modeData = await modeResponse.json();
            const authMode = modeData.mode || 'none';

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
                        const response = await fetch('/api/auth/validate');
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
                        // Validate proxy token with cloud auth controller
                        const response = await originalFetch('/api/cloud-auth/validate', {
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
    }, []);

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

    // Listen for auth changes
    useEffect(() => {
        const handleAuthChange = (event: any) => {
            // Always recheck auth when auth-changed event is fired
            // Removed the !showLogin condition that was preventing login page from responding
            if (hasCheckedInitialAuth) {
                console.log('Auth change detected, rechecking...');
                checkAuthStatus();
            }
        };

        const handleStorageChange = (event: StorageEvent) => {
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
    }, [hasCheckedInitialAuth, checkAuthStatus]); // Removed showLogin from dependencies

    // Handle global 401 responses
    useEffect(() => {
        const handleGlobal401 = (event: CustomEvent) => {
            setShowLogin(true);
        };

        window.addEventListener('auth-required' as any, handleGlobal401);
        return () => window.removeEventListener('auth-required' as any, handleGlobal401);
    }, []);

    // Handle auth callback from cloud proxy
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        const refreshToken = urlParams.get('refreshToken');
        const authStatus = urlParams.get('auth');

        if (token && authStatus === 'success') {
            localStorage.setItem('cloud_proxy_token', token);

            // Clear URL parameters
            window.history.replaceState({}, document.title, window.location.pathname);

            checkAuthStatus();
            window.dispatchEvent(new CustomEvent('auth-changed'));
        }
    }, [checkAuthStatus]);


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
                <AuthBoundary>
                    <AppRoutes />
                </AuthBoundary>
            </Router>
        </AuthProvider>
    );
};

// Main App component - no Clerk provider needed
const App: React.FC = () => {
    return <AppWithProviders />;
};

export default App;