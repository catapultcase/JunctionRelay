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

import React, { useState, useEffect } from "react";
import {
    Box, Typography, Button, CircularProgress, TextField, Card, CardContent
} from "@mui/material";
import { AlertColor } from "@mui/material/Alert";
import PersonIcon from '@mui/icons-material/Person';
import CloudIcon from '@mui/icons-material/Cloud';
import LoginIcon from '@mui/icons-material/Login';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { useAuth } from "auth/AuthContext";
import { errorMessage } from '../utils/errors';

type AuthMode = 'none' | 'local' | 'cloud';

interface LoginOnlyProps {
    showSnackbar: (message: string, severity?: AlertColor) => void;
}

// Unified Auth Service using new endpoints
class UnifiedAuthService {
    async initiateLogin(): Promise<{ authUrl?: string; alreadyAuthenticated?: boolean; token?: string; expiresAt?: string }> {
        const response = await fetch('/api/unified-auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                origin: window.location.origin
            })
        });

        if (!response.ok) {
            throw new Error('Failed to initiate authentication');
        }

        return response.json();
    }

    async validateToken(): Promise<{ valid: boolean; user?: unknown; message?: string }> {
        // Cookie sent automatically on same-origin
        const response = await fetch('/api/unified-auth/validate', { method: 'POST' });
        return response.json();
    }

    async getAuthConfig(): Promise<{ authMode: string; isConfigured: boolean; requiresSetup: boolean }> {
        const response = await fetch('/api/unified-auth/config');
        if (!response.ok) {
            throw new Error('Failed to get auth configuration');
        }
        return response.json();
    }

    async getAuthStatus(): Promise<unknown> {
        const response = await fetch('/api/unified-auth/status');
        if (!response.ok) {
            throw new Error('Failed to get auth status');
        }
        return response.json();
    }

    async setupLocalAuth(username: string, password: string): Promise<unknown> {
        const response = await fetch('/api/unified-auth/setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || 'Setup failed');
        }

        return response.json();
    }

    async getFallbackStatus(): Promise<{ enabled: boolean; userConfigured: boolean }> {
        const response = await fetch('/api/unified-auth/fallback/status');
        if (!response.ok) {
            throw new Error('Failed to get fallback status');
        }
        return response.json();
    }

    async fallbackLogin(username: string, password: string): Promise<{ authenticated?: boolean; message?: string }> {
        const response = await fetch('/api/unified-auth/fallback/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || 'Fallback login failed');
        }

        return response.json();
    }
}

const LoginOnly: React.FC<LoginOnlyProps> = ({ showSnackbar }) => {
    const { login } = useAuth();

    const [authMode, setAuthMode] = useState<AuthMode>('none');
    const [requiresSetup, setRequiresSetup] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(true);

    // Local auth setup/login state
    const [setupUsername, setSetupUsername] = useState<string>('');
    const [setupPassword, setSetupPassword] = useState<string>('');
    const [setupConfirmPassword, setSetupConfirmPassword] = useState<string>('');
    const [setupLoading, setSetupLoading] = useState<boolean>(false);
    const [loginUsername, setLoginUsername] = useState<string>('');
    const [loginPassword, setLoginPassword] = useState<string>('');
    const [loginLoading, setLoginLoading] = useState<boolean>(false);

    // Cloud login state
    const [cloudLoginLoading, setCloudLoginLoading] = useState<boolean>(false);

    // Fallback authentication state
    const [fallbackEnabled, setFallbackEnabled] = useState<boolean>(false);
    const [fallbackUserConfigured, setFallbackUserConfigured] = useState<boolean>(false);
    const [showFallbackForm, setShowFallbackForm] = useState<boolean>(false);
    const [fallbackUsername, setFallbackUsername] = useState<string>('');
    const [fallbackPassword, setFallbackPassword] = useState<string>('');
    const [fallbackLoading, setFallbackLoading] = useState<boolean>(false);

    const unifiedAuth = new UnifiedAuthService();

    useEffect(() => {
        fetchAuthStatus();
        checkAuthCallback();
    }, []);

    const checkAuthCallback = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const authStatusParam = urlParams.get('auth');

        if (authStatusParam === 'success') {
            // Token is in httpOnly cookie (set by server callback), no URL tokens to extract
            window.history.replaceState({}, document.title, window.location.pathname);
            triggerAuthChange();
            showSnackbar('Successfully authenticated with JunctionRelay Cloud!', 'success');
        } else if (authStatusParam === 'error') {
            window.history.replaceState({}, document.title, window.location.pathname);
            showSnackbar('Cloud authentication failed. Please try again.', 'error');
        }
    };

    const fetchAuthStatus = async () => {
        try {
            // Get unified auth configuration
            const config = await unifiedAuth.getAuthConfig();
            setAuthMode(config.authMode as AuthMode);
            setRequiresSetup(config.requiresSetup);

            // If in cloud mode, check fallback status
            if (config.authMode === 'cloud') {
                try {
                    const fallbackStatus = await unifiedAuth.getFallbackStatus();
                    setFallbackEnabled(fallbackStatus.enabled);
                    setFallbackUserConfigured(fallbackStatus.userConfigured);
                } catch (err) {
                    console.error("Error checking fallback status:", err);
                    setFallbackEnabled(false);
                    setFallbackUserConfigured(false);
                }
            }
        } catch (err) {
            console.error("Error checking auth status:", err);
            setAuthMode('none');
            setRequiresSetup(false);
        } finally {
            setLoading(false);
        }
    };

    // Trigger auth change event
    const triggerAuthChange = () => {
        window.dispatchEvent(new CustomEvent('auth-changed'));
    };

    // Local auth setup (create admin)
    const handleSetupSubmit = async () => {
        if (setupPassword !== setupConfirmPassword) {
            showSnackbar('Passwords do not match', 'error');
            return;
        }

        if (setupPassword.length < 6) {
            showSnackbar('Password must be at least 6 characters long', 'error');
            return;
        }

        if (setupUsername.length < 3) {
            showSnackbar('Username must be at least 3 characters long', 'error');
            return;
        }

        setSetupLoading(true);

        try {
            await unifiedAuth.setupLocalAuth(setupUsername, setupPassword);
            setSetupUsername('');
            setSetupPassword('');
            setSetupConfirmPassword('');
            await fetchAuthStatus();
            triggerAuthChange();
            showSnackbar('Admin account created successfully!', 'success');
        } catch (error) {
            showSnackbar(errorMessage(error) || 'Error creating admin user', 'error');
        } finally {
            setSetupLoading(false);
        }
    };

    // Local auth login
    const handleLocalLogin = async () => {
        setLoginLoading(true);

        try {
            const success = await login(loginUsername, loginPassword);

            if (success) {
                setLoginUsername('');
                setLoginPassword('');
                triggerAuthChange();
                showSnackbar('Successfully logged in!', 'success');
            } else {
                throw new Error('Invalid username or password');
            }
        } catch (error) {
            console.error('Login error:', error);
            showSnackbar(errorMessage(error) || 'Login failed', 'error');
        } finally {
            setLoginLoading(false);
        }
    };

    // Cloud login using unified auth
    const handleCloudLogin = async () => {
        setCloudLoginLoading(true);

        try {
            const response = await unifiedAuth.initiateLogin();

            // IMPORTANT: Never accept tokens here. Force Clerk redirect.
            if (response.token || response.alreadyAuthenticated) {
                console.warn('[Auth] Ignoring token/alreadyAuthenticated returned from /unified-auth/login');
            }

            if (!response.authUrl) {
                throw new Error('No authUrl returned from unified auth');
            }

            showSnackbar('Redirecting to JunctionRelay Cloud...', 'info');
            window.location.href = response.authUrl;
        } catch (error) {
            console.error('Cloud login error:', error);
            showSnackbar(`Cloud login error: ${errorMessage(error)}`, 'error');
        } finally {
            setCloudLoginLoading(false);
        }
    };

    // Fallback login
    const handleFallbackLogin = async () => {
        setFallbackLoading(true);

        try {
            const response = await unifiedAuth.fallbackLogin(fallbackUsername, fallbackPassword);

            if (response.authenticated) {
                // Token is in httpOnly cookie (set by server), no localStorage needed
                setFallbackUsername('');
                setFallbackPassword('');
                setShowFallbackForm(false);

                triggerAuthChange();
                showSnackbar('Successfully logged in using fallback authentication. System switched to local mode.', 'success');
            } else {
                throw new Error('Fallback login failed');
            }
        } catch (error) {
            console.error('Fallback login error:', error);
            showSnackbar(errorMessage(error) || 'Fallback login failed', 'error');
        } finally {
            setFallbackLoading(false);
        }
    };


    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
                <CircularProgress />
            </Box>
        );
    }

    // Show the appropriate login interface based on auth mode
    if (authMode === 'local') {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                <Card sx={{ maxWidth: 400, width: '100%' }}>
                    <CardContent sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                            <PersonIcon sx={{ mr: 1, color: 'primary.main' }} />
                            <Typography variant="h5">Local Authentication</Typography>
                        </Box>

                        {requiresSetup ? (
                            // Setup form
                            <>
                                <Typography variant="subtitle1" sx={{ mb: 2 }}>
                                    Create Admin Account
                                </Typography>
                                <TextField
                                    fullWidth
                                    label="Admin Username"
                                    value={setupUsername}
                                    onChange={(e) => setSetupUsername(e.target.value)}
                                    disabled={setupLoading}
                                    helperText="Minimum 3 characters"
                                    sx={{ mb: 2 }}
                                />
                                <TextField
                                    fullWidth
                                    type="password"
                                    label="Password"
                                    value={setupPassword}
                                    onChange={(e) => setSetupPassword(e.target.value)}
                                    disabled={setupLoading}
                                    helperText="Minimum 6 characters"
                                    sx={{ mb: 2 }}
                                />
                                <TextField
                                    fullWidth
                                    type="password"
                                    label="Confirm Password"
                                    value={setupConfirmPassword}
                                    onChange={(e) => setSetupConfirmPassword(e.target.value)}
                                    disabled={setupLoading}
                                    sx={{ mb: 3 }}
                                />
                                <Button
                                    fullWidth
                                    variant="contained"
                                    onClick={handleSetupSubmit}
                                    disabled={setupLoading || !setupUsername || !setupPassword || !setupConfirmPassword}
                                    startIcon={setupLoading ? <CircularProgress size={20} /> : <AccountCircleIcon />}
                                >
                                    {setupLoading ? 'Creating...' : 'Create Admin Account'}
                                </Button>
                            </>
                        ) : (
                            // Login form
                            <>
                                <Typography variant="subtitle1" sx={{ mb: 2 }}>
                                    Login to Your Account
                                </Typography>
                                <TextField
                                    fullWidth
                                    label="Username"
                                    value={loginUsername}
                                    onChange={(e) => setLoginUsername(e.target.value)}
                                    disabled={loginLoading}
                                    sx={{ mb: 2 }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && loginUsername && loginPassword) {
                                            handleLocalLogin();
                                        }
                                    }}
                                />
                                <TextField
                                    fullWidth
                                    type="password"
                                    label="Password"
                                    value={loginPassword}
                                    onChange={(e) => setLoginPassword(e.target.value)}
                                    disabled={loginLoading}
                                    sx={{ mb: 3 }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && loginUsername && loginPassword) {
                                            handleLocalLogin();
                                        }
                                    }}
                                />
                                <Button
                                    fullWidth
                                    variant="contained"
                                    onClick={handleLocalLogin}
                                    disabled={loginLoading || !loginUsername || !loginPassword}
                                    startIcon={loginLoading ? <CircularProgress size={20} /> : <LoginIcon />}
                                >
                                    {loginLoading ? 'Logging in...' : 'Login'}
                                </Button>
                            </>
                        )}
                    </CardContent>
                </Card>
            </Box>
        );
    }

    if (authMode === 'cloud') {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                <Card sx={{ maxWidth: 400, width: '100%' }}>
                    <CardContent sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                            <CloudIcon sx={{ mr: 1, color: 'primary.main' }} />
                            <Typography variant="h5">JunctionRelay Cloud</Typography>
                        </Box>

                        {!showFallbackForm ? (
                            <>
                                <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                                    Sign in with your JunctionRelay Cloud account to access the application.
                                </Typography>

                                <Button
                                    fullWidth
                                    variant="contained"
                                    onClick={handleCloudLogin}
                                    disabled={cloudLoginLoading}
                                    startIcon={cloudLoginLoading ? <CircularProgress size={20} /> : <CloudIcon />}
                                >
                                    {cloudLoginLoading ? 'Connecting...' : 'Login with JunctionRelay Cloud'}
                                </Button>

                                {fallbackEnabled && fallbackUserConfigured && (
                                    <Box sx={{ mt: 2, textAlign: 'center' }}>
                                        <Button
                                            variant="text"
                                            size="small"
                                            onClick={() => setShowFallbackForm(true)}
                                            startIcon={<PersonIcon />}
                                        >
                                            Use Local Fallback
                                        </Button>
                                    </Box>
                                )}
                            </>
                        ) : (
                            <>
                                <Typography variant="subtitle1" sx={{ mb: 2 }}>
                                    Fallback Authentication
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Login with your local fallback credentials.
                                </Typography>

                                <TextField
                                    fullWidth
                                    label="Username"
                                    value={fallbackUsername}
                                    onChange={(e) => setFallbackUsername(e.target.value)}
                                    disabled={fallbackLoading}
                                    sx={{ mb: 2 }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && fallbackUsername && fallbackPassword) {
                                            handleFallbackLogin();
                                        }
                                    }}
                                />
                                <TextField
                                    fullWidth
                                    type="password"
                                    label="Password"
                                    value={fallbackPassword}
                                    onChange={(e) => setFallbackPassword(e.target.value)}
                                    disabled={fallbackLoading}
                                    sx={{ mb: 3 }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && fallbackUsername && fallbackPassword) {
                                            handleFallbackLogin();
                                        }
                                    }}
                                />
                                <Button
                                    fullWidth
                                    variant="contained"
                                    onClick={handleFallbackLogin}
                                    disabled={fallbackLoading || !fallbackUsername || !fallbackPassword}
                                    startIcon={fallbackLoading ? <CircularProgress size={20} /> : <LoginIcon />}
                                    sx={{ mb: 1 }}
                                >
                                    {fallbackLoading ? 'Logging in...' : 'Login with Fallback'}
                                </Button>
                                <Button
                                    fullWidth
                                    variant="text"
                                    size="small"
                                    onClick={() => {
                                        setShowFallbackForm(false);
                                        setFallbackUsername('');
                                        setFallbackPassword('');
                                    }}
                                    disabled={fallbackLoading}
                                >
                                    Back to Cloud Login
                                </Button>
                            </>
                        )}
                    </CardContent>
                </Card>
            </Box>
        );
    }

    // This shouldn't happen if auth is configured properly, but just in case
    return (
        <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
            <Card sx={{ maxWidth: 400, width: '100%' }}>
                <CardContent sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="h6" gutterBottom>
                        Server Unreachable
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Please ensure the JunctionRelay Server is running or contact your administrator
                    </Typography>
                </CardContent>
            </Card>
        </Box>
    );
};

export default LoginOnly;