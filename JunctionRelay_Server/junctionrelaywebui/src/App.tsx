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
import { Container, Box, CircularProgress, Typography } from "@mui/material";
import Navbar from "components/Navbar";
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

// Main app routes component
const AppRoutes: React.FC = () => {
    return (
        <>
            <Navbar />
            <Container
                maxWidth={false}
                sx={{
                    backgroundColor: "background.default",
                    minHeight: "100vh",
                    paddingTop: { xs: "56px", sm: "64px" },
                    paddingBottom: 4
                }}
            >
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/junctions" element={<Junctions />} />
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
        const authStatus = urlParams.get('auth');

        if (token && authStatus === 'success') {
            localStorage.setItem('cloud_proxy_token', token);
            // Clear URL parameters
            window.history.replaceState({}, document.title, window.location.pathname);
            // Trigger auth recheck AND notify other components
            checkAuthStatus();
            // Dispatch auth-changed event so navbar and other components refresh
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