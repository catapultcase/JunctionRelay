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

type AuthMode = 'none' | 'local' | 'cloud';

interface LoginOnlyProps {
    showSnackbar: (message: string, severity?: AlertColor) => void;
}

// Cloud Auth Service for proxy mode
class CloudAuthService {
    async initiateLogin(): Promise<{ authUrl: string }> {
        const response = await fetch('/api/cloud-auth/initiate-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                redirectUrl: window.location.origin,
                origin: window.location.origin
            })
        });

        if (!response.ok) {
            throw new Error('Failed to initiate cloud authentication');
        }

        return response.json();
    }

    async validateToken(token: string): Promise<{ valid: boolean; user?: any }> {
        const response = await fetch('/api/cloud-auth/validate', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.json();
    }
}

const LoginOnly: React.FC<LoginOnlyProps> = ({ showSnackbar }) => {
    const { login } = useAuth();

    const [authMode, setAuthMode] = useState<AuthMode>('none');
    const [isConfigured, setIsConfigured] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(true);

    // Local auth setup/login state
    const [setupUsername, setSetupUsername] = useState<string>('');
    const [setupPassword, setSetupPassword] = useState<string>('');
    const [setupConfirmPassword, setSetupConfirmPassword] = useState<string>('');
    const [setupLoading, setSetupLoading] = useState<boolean>(false);
    const [loginUsername, setLoginUsername] = useState<string>('');
    const [loginPassword, setLoginPassword] = useState<string>('');
    const [loginLoading, setLoginLoading] = useState<boolean>(false);

    // Cloud proxy login state
    const [cloudLoginLoading, setCloudLoginLoading] = useState<boolean>(false);

    const cloudAuth = new CloudAuthService();

    useEffect(() => {
        fetchAuthStatus();
        checkAuthCallback();
    }, []);

    const checkAuthCallback = () => {
        // Check for auth callback from cloud proxy
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        const authStatus = urlParams.get('auth');

        if (token && authStatus === 'success') {
            localStorage.setItem('cloud_proxy_token', token);
            // Clear URL parameters
            window.history.replaceState({}, document.title, window.location.pathname);
            // Trigger auth recheck
            triggerAuthChange();
            showSnackbar('Successfully authenticated with JunctionRelay Cloud!', 'success');
        } else if (authStatus === 'error') {
            // Clear URL parameters
            window.history.replaceState({}, document.title, window.location.pathname);
            showSnackbar('Cloud authentication failed. Please try again.', 'error');
        }
    };

    const fetchAuthStatus = async () => {
        try {
            // Get auth mode first
            const modeRes = await fetch("/api/auth/mode");
            if (!modeRes.ok) {
                console.error("Cannot fetch auth mode");
                setAuthMode('none');
                setIsConfigured(true);
                return;
            }

            const modeData = await modeRes.json();
            const currentMode = modeData.mode || 'none';
            setAuthMode(currentMode);

            // Only check local auth configuration if in local mode
            if (currentMode === 'local') {
                const statusRes = await fetch('/api/auth/status');
                if (statusRes.ok) {
                    const statusData = await statusRes.json();
                    setIsConfigured(statusData.isConfigured || false);
                } else {
                    setIsConfigured(false);
                }
            } else {
                setIsConfigured(true); // Non-local modes don't need setup
            }
        } catch (err) {
            console.error("Error checking auth status:", err);
            setAuthMode('none');
            setIsConfigured(true);
        } finally {
            setLoading(false);
        }
    };

    // Trigger auth change event
    const triggerAuthChange = () => {
        console.log('Triggering auth change event');
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
            const response = await fetch('/api/auth/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: setupUsername,
                    password: setupPassword
                })
            });

            if (response.ok) {
                setSetupUsername('');
                setSetupPassword('');
                setSetupConfirmPassword('');
                await fetchAuthStatus();
                triggerAuthChange();
                showSnackbar('Admin account created successfully!', 'success');
            } else {
                const data = await response.json();
                throw new Error(data.message || 'Failed to create admin user');
            }
        } catch (error: any) {
            showSnackbar(error.message || 'Error creating admin user', 'error');
        } finally {
            setSetupLoading(false);
        }
    };

    // Local auth login
    const handleLocalLogin = async () => {
        setLoginLoading(true);

        try {
            const success = await login(loginUsername, loginPassword);
            console.log('Login result:', success);

            if (success) {
                setLoginUsername('');
                setLoginPassword('');
                console.log('Login successful, triggering auth change');
                triggerAuthChange();
                showSnackbar('Successfully logged in!', 'success');
            } else {
                throw new Error('Invalid username or password');
            }
        } catch (error: any) {
            console.error('Login error:', error);
            showSnackbar(error.message || 'Login failed', 'error');
        } finally {
            setLoginLoading(false);
        }
    };

    // Cloud proxy login
    const handleCloudProxyLogin = async () => {
        setCloudLoginLoading(true);

        try {
            console.log('Initiating cloud proxy login...');
            const { authUrl } = await cloudAuth.initiateLogin();

            console.log('Redirecting to cloud authentication...');
            showSnackbar('Redirecting to JunctionRelay Cloud...', 'info');

            // Redirect to cloud authentication
            window.location.href = authUrl;
        } catch (error: any) {
            console.error('Cloud proxy login error:', error);
            showSnackbar(`Cloud login error: ${error.message}`, 'error');
            setCloudLoginLoading(false);
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

                        {!isConfigured ? (
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

                        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                            Sign in with your JunctionRelay Cloud account to access the application.
                        </Typography>

                        <Button
                            fullWidth
                            variant="contained"
                            onClick={handleCloudProxyLogin}
                            disabled={cloudLoginLoading}
                            startIcon={cloudLoginLoading ? <CircularProgress size={20} /> : <CloudIcon />}
                        >
                            {cloudLoginLoading ? 'Connecting...' : 'Login with JunctionRelay Cloud'}
                        </Button>
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
                        Authentication Not Configured
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Please contact your administrator to configure authentication.
                    </Typography>
                </CardContent>
            </Card>
        </Box>
    );
};

export default LoginOnly;