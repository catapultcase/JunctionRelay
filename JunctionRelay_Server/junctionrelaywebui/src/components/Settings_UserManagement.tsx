/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024�present Jonathan Mills, CatapultCase
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
    Box, Typography, List, ListItemButton, ListItemIcon, ListItemText,
    Paper, CircularProgress
} from "@mui/material";
import { AlertColor } from "@mui/material/Alert";
import LockOpenIcon from '@mui/icons-material/LockOpen';
import PersonIcon from '@mui/icons-material/Person';
import CloudIcon from '@mui/icons-material/Cloud';
import { useAuth } from "auth/AuthContext";

// Import sub-components
import Settings_AuthNone from './Settings_AuthNone';
import Settings_AuthLocal from './Settings_AuthLocal';
import Settings_AuthCloud from './Settings_AuthCloud';

type AuthMode = 'none' | 'local' | 'cloud';

interface UserManagementProps {
    showSnackbar: (message: string, severity?: AlertColor) => void;
}

interface AuthStatus {
    authMode: AuthMode;
    isConfigured: boolean;
    requiresSetup: boolean;
    canActivateLocal: boolean;
    isAuthenticated: boolean;
    currentUser?: string;
    authType?: string;
}

interface CloudUserInfo {
    email?: string;
    userId?: string;
    hasValidLicense: boolean;
    message?: string;
}

export interface AuthComponentProps {
    authStatus: AuthStatus;
    fetchAuthStatus: () => Promise<void>;
    showSnackbar: (message: string, severity?: AlertColor) => void;
    user: any;
    login: any;
    logout: any;
    cloudUserInfo: CloudUserInfo | null;
    cloudUserLoading: boolean;
    handleCloudLogin: () => Promise<void>;
    handleCloudLogout: () => Promise<void>;
    checkCloudAuth: () => Promise<void>;
}

const Settings_UserManagement: React.FC<UserManagementProps> = ({ showSnackbar }) => {
    const { logout, user, login } = useAuth();

    const [authStatus, setAuthStatus] = useState<AuthStatus>({
        authMode: 'none',
        isConfigured: false,
        requiresSetup: false,
        canActivateLocal: false,
        isAuthenticated: false
    });
    const [loading, setLoading] = useState<boolean>(false);
    const [selectedMode, setSelectedMode] = useState<AuthMode>('none');
    const [cloudUserInfo, setCloudUserInfo] = useState<CloudUserInfo | null>(null);
    const [cloudUserLoading, setCloudUserLoading] = useState<boolean>(false);

    // MAIN INITIALIZATION - Handle OAuth callback
    useEffect(() => {
        console.log("[CLOUD_AUTH] Component mounted, checking URL parameters...");

        const urlParams = new URLSearchParams(window.location.search);
        const authStatusParam = urlParams.get('auth');
        const token = urlParams.get('token');
        const refreshToken = urlParams.get('refreshToken');
        const errorMessage = urlParams.get('message');

        console.log("[CLOUD_AUTH] URL params:", { authStatusParam, hasToken: !!token, hasRefreshToken: !!refreshToken, errorMessage });

        if (authStatusParam === 'success' && token && refreshToken) {
            console.log("[CLOUD_AUTH] Success callback detected, storing tokens...");

            // Store the cloud proxy tokens
            localStorage.setItem('cloud_proxy_token', token);
            localStorage.setItem('cloud_refresh_token', refreshToken);

            console.log("[CLOUD_AUTH] Tokens stored in localStorage");

            // Clear URL parameters
            window.history.replaceState({}, document.title, window.location.pathname);
            console.log("[CLOUD_AUTH] URL cleaned");

            // Refresh auth status and cloud user info
            fetchAuthStatus().then(() => {
                console.log("[CLOUD_AUTH] Auth status fetched, now checking cloud auth...");
                checkCloudAuth();
                showSnackbar("Successfully authenticated with JunctionRelay Cloud", "success");
            });
        } else if (authStatusParam === 'error') {
            console.log("[CLOUD_AUTH] Error callback detected:", errorMessage);
            const message = errorMessage || "Authentication failed";
            showSnackbar(message, "error");
            window.history.replaceState({}, document.title, window.location.pathname);
        } else {
            console.log("[CLOUD_AUTH] No OAuth callback detected in URL");
        }

        // Initial fetch of auth status
        fetchAuthStatus();
    }, []);

    // Watch for auth mode changes and check cloud auth
    useEffect(() => {
        console.log("[CLOUD_AUTH] Auth mode changed to:", authStatus.authMode);
        if (authStatus.authMode === 'cloud') {
            console.log("[CLOUD_AUTH] Cloud mode detected, checking cloud auth...");
            checkCloudAuth();
        } else {
            console.log("[CLOUD_AUTH] Non-cloud mode, clearing cloud user info");
            setCloudUserInfo(null);
        }
    }, [authStatus.authMode]);

    // Update selected mode when auth status changes
    useEffect(() => {
        setSelectedMode(authStatus.authMode);
    }, [authStatus.authMode]);

    const fetchAuthStatus = async () => {
        console.log("[AUTH] Fetching auth status...");
        try {
            const response = await fetch("/api/auth/status");
            if (response.ok) {
                const data = await response.json();
                console.log("[AUTH] Auth status response:", data);
                setAuthStatus(data);
            } else {
                console.error("[AUTH] Failed to fetch auth status:", response.status);
            }
        } catch (err) {
            console.error("[AUTH] Error fetching auth status:", err);
        }
    };

    const checkCloudAuth = async () => {
        console.log("[CLOUD_AUTH] Starting cloud auth check...");

        if (authStatus.authMode !== 'cloud') {
            console.log("[CLOUD_AUTH] Not in cloud mode, skipping check");
            setCloudUserInfo(null);
            return;
        }

        try {
            setCloudUserLoading(true);

            // Get the stored cloud token
            const cloudToken = localStorage.getItem('cloud_proxy_token');
            console.log("[CLOUD_AUTH] Retrieved token from localStorage:", cloudToken ? `${cloudToken.substring(0, 20)}...` : 'null');

            if (!cloudToken) {
                console.log("[CLOUD_AUTH] No token found, user needs to login");
                setCloudUserInfo(null);
                return;
            }

            console.log("[CLOUD_AUTH] Making request to /api/cloud-auth/user-info with token...");

            // Include Authorization header with the token
            const response = await fetch("/api/cloud-auth/user-info", {
                headers: {
                    'Authorization': `Bearer ${cloudToken}`
                }
            });

            console.log("[CLOUD_AUTH] Response status:", response.status, response.statusText);

            if (response.ok) {
                const data = await response.json();
                console.log("[CLOUD_AUTH] User info response:", data);
                setCloudUserInfo(data);

                // Store user email in localStorage
                if (data.email) {
                    localStorage.setItem('junctionrelay_cloud_user', data.email);
                    console.log("[CLOUD_AUTH] Stored cloud user in localStorage:", data.email);
                }

                showSnackbar("Cloud authentication verified successfully", "success");
            } else if (response.status === 401) {
                console.log("[CLOUD_AUTH] Token is invalid or expired, clearing stored tokens");
                localStorage.removeItem('cloud_proxy_token');
                localStorage.removeItem('cloud_refresh_token');
                localStorage.removeItem('junctionrelay_cloud_user');
                setCloudUserInfo(null);
                showSnackbar("Cloud session expired, please login again", "warning");
            } else {
                const errorText = await response.text();
                console.error("[CLOUD_AUTH] Unexpected response:", response.status, errorText);
                throw new Error(`Failed to get cloud user info: ${response.status}`);
            }
        } catch (err) {
            console.error("[CLOUD_AUTH] Error checking cloud auth:", err);
            setCloudUserInfo(null);
            showSnackbar("Error verifying cloud authentication", "error");
        } finally {
            setCloudUserLoading(false);
        }
    };

    const handleCloudLogin = async () => {
        console.log("[CLOUD_AUTH] Initiating cloud login...");
        try {
            setCloudUserLoading(true);

            const response = await fetch("/api/cloud-auth/initiate-login", { method: "POST" });

            if (!response.ok) {
                throw new Error("Failed to initiate cloud authentication");
            }

            const data = await response.json();
            console.log("[CLOUD_AUTH] Initiate login response:", data);

            if (!data.authUrl) {
                throw new Error("No authentication URL received");
            }

            console.log("[CLOUD_AUTH] Redirecting to:", data.authUrl);
            showSnackbar("Redirecting to JunctionRelay Cloud authentication...", "info");
            window.location.href = data.authUrl;
        } catch (error: any) {
            console.error("[CLOUD_AUTH] Error initiating cloud login:", error);
            showSnackbar(error.message || "Error initiating cloud authentication", "error");
        } finally {
            setCloudUserLoading(false);
        }
    };

    const handleCloudLogout = async () => {
        console.log("[CLOUD_AUTH] Logging out from cloud...");
        try {
            const refreshToken = localStorage.getItem('cloud_refresh_token');
            const cloudToken = localStorage.getItem('cloud_proxy_token');

            const response = await fetch("/api/cloud-auth/logout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${cloudToken}`
                },
                body: JSON.stringify({ refreshToken })
            });

            if (response.ok) {
                console.log("[CLOUD_AUTH] Successfully logged out from cloud");
                localStorage.removeItem('cloud_proxy_token');
                localStorage.removeItem('cloud_refresh_token');
                localStorage.removeItem('junctionrelay_cloud_user');
                setCloudUserInfo(null);
                showSnackbar("Logged out from JunctionRelay Cloud", "success");
            } else {
                throw new Error("Failed to logout from cloud");
            }
        } catch (error: any) {
            console.error("[CLOUD_AUTH] Error during cloud logout:", error);
            // Still clear local state even if server logout fails
            localStorage.removeItem('cloud_proxy_token');
            localStorage.removeItem('cloud_refresh_token');
            localStorage.removeItem('junctionrelay_cloud_user');
            setCloudUserInfo(null);
            showSnackbar("Logged out locally from JunctionRelay Cloud", "warning");
        }
    };

    const handleAuthModeChange = async (newMode: AuthMode) => {
        console.log("[AUTH] Changing auth mode to:", newMode);
        try {
            setLoading(true);

            // For cloud mode, we need to handle it differently
            if (newMode === 'cloud') {
                console.log("[AUTH] Cloud mode selected, checking authentication flow...");

                // First, try to set the auth mode to cloud
                console.log("[AUTH] Setting auth mode to cloud first...");
                const setModeResponse = await fetch("/api/auth/set-mode", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ mode: 'cloud' })
                });

                if (!setModeResponse.ok) {
                    const error = await setModeResponse.json();
                    throw new Error(error.message || "Failed to set cloud mode");
                }

                const setModeData = await setModeResponse.json();
                console.log("[AUTH] Successfully set mode to cloud:", setModeData);

                // Refresh auth status to reflect the mode change
                await fetchAuthStatus();

                // Now check if we have valid cloud tokens
                const cloudToken = localStorage.getItem('cloud_proxy_token');
                console.log("[AUTH] Checking for existing cloud token:", cloudToken ? 'present' : 'none');

                if (cloudToken) {
                    console.log("[AUTH] Validating existing cloud token...");
                    try {
                        const checkResponse = await fetch("/api/cloud-auth/user-info", {
                            headers: {
                                'Authorization': `Bearer ${cloudToken}`
                            }
                        });

                        if (checkResponse.ok) {
                            console.log("[AUTH] Existing token valid, checking cloud auth...");
                            await checkCloudAuth();
                            showSnackbar("Authentication mode changed to: JunctionRelay Cloud", "success");
                            setLoading(false);
                            return;
                        } else {
                            console.log("[AUTH] Existing token invalid, clearing and initiating new login");
                            localStorage.removeItem('cloud_proxy_token');
                            localStorage.removeItem('cloud_refresh_token');
                            localStorage.removeItem('junctionrelay_cloud_user');
                        }
                    } catch (error) {
                        console.log("[AUTH] Error validating token, clearing tokens:", error);
                        localStorage.removeItem('cloud_proxy_token');
                        localStorage.removeItem('cloud_refresh_token');
                        localStorage.removeItem('junctionrelay_cloud_user');
                    }
                }

                // No valid token, need to authenticate
                console.log("[AUTH] No valid token, initiating OAuth flow...");
                await handleCloudLogin();
                return;
            }

            // For non-cloud modes (none, local), proceed normally
            console.log("[AUTH] Setting auth mode via API...");
            const response = await fetch("/api/auth/set-mode", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: newMode })
            });

            if (response.ok) {
                const data = await response.json();
                console.log("[AUTH] Set mode response:", data);

                await fetchAuthStatus();

                // Clear local auth when switching modes
                if (newMode !== 'local') {
                    logout();
                }

                const modeNames = {
                    none: 'No Authentication',
                    local: 'Local Authentication',
                    cloud: 'JunctionRelay Cloud'
                };
                showSnackbar(
                    data.message || `Authentication mode changed to: ${modeNames[newMode]}`,
                    "success"
                );
            } else {
                const error = await response.json();
                throw new Error(error.message || "Failed to change authentication mode");
            }
        } catch (error: any) {
            console.error("[AUTH] Error changing auth mode:", error);
            showSnackbar(error.message || "Error changing authentication mode", "error");
        } finally {
            setLoading(false);
        }
    };

    const authModes = [
        {
            mode: 'none' as AuthMode,
            label: 'No Authentication',
            icon: <LockOpenIcon />,
            description: 'Open access'
        },
        {
            mode: 'local' as AuthMode,
            label: 'Local Authentication',
            icon: <PersonIcon />,
            description: 'Local admin account'
        },
        {
            mode: 'cloud' as AuthMode,
            label: 'JunctionRelay Cloud',
            icon: <CloudIcon />,
            description: 'Cloud authentication'
        }
    ];

    const renderAuthComponent = () => {
        const commonProps: AuthComponentProps = {
            authStatus,
            fetchAuthStatus,
            showSnackbar,
            user,
            login,
            logout,
            cloudUserInfo,
            cloudUserLoading,
            handleCloudLogin,
            handleCloudLogout,
            checkCloudAuth
        };

        switch (selectedMode) {
            case 'none':
                return <Settings_AuthNone {...commonProps} />;
            case 'local':
                return <Settings_AuthLocal {...commonProps} />;
            case 'cloud':
                return <Settings_AuthCloud {...commonProps} />;
            default:
                return <Settings_AuthNone {...commonProps} />;
        }
    };

    return (
        <Box sx={{ mb: 4 }}>
            <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
                Authentication Mode
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, minHeight: 400 }}>
                {/* Left Sidebar - Auth Mode Selection */}
                <Paper sx={{ width: 280, p: 0 }}>
                    <List sx={{ p: 0 }}>
                        {authModes.map((authMode, index) => (
                            <ListItemButton
                                key={authMode.mode}
                                selected={selectedMode === authMode.mode}
                                onClick={() => setSelectedMode(authMode.mode)}
                                sx={{
                                    borderBottom: index < authModes.length - 1 ? '1px solid' : 'none',
                                    borderColor: 'divider',
                                    py: 2,
                                    '&.Mui-selected': {
                                        backgroundColor: 'primary.main',
                                        color: 'primary.contrastText',
                                        '&:hover': {
                                            backgroundColor: 'primary.dark',
                                        },
                                        '& .MuiListItemIcon-root': {
                                            color: 'inherit'
                                        }
                                    }
                                }}
                            >
                                <ListItemIcon sx={{ minWidth: 40 }}>
                                    {authMode.icon}
                                </ListItemIcon>
                                <ListItemText
                                    primary={authMode.label}
                                    secondary={authMode.description}
                                    secondaryTypographyProps={{
                                        sx: {
                                            color: selectedMode === authMode.mode ? 'rgba(255,255,255,0.7)' : 'text.secondary'
                                        }
                                    }}
                                />
                                {authStatus.authMode === authMode.mode && (
                                    <Box
                                        sx={{
                                            width: 8,
                                            height: 8,
                                            borderRadius: '50%',
                                            backgroundColor: selectedMode === authMode.mode ? 'rgba(255,255,255,0.8)' : 'success.main',
                                            ml: 1
                                        }}
                                    />
                                )}
                            </ListItemButton>
                        ))}
                    </List>
                </Paper>

                {/* Right Content - Auth Mode Details */}
                <Box sx={{ flex: 1, minHeight: 400 }}>
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        renderAuthComponent()
                    )}
                </Box>
            </Box>

            {/* Action buttons for mode changes */}
            {selectedMode !== authStatus.authMode && (
                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center', mr: 1 }}>
                            Switch to {authModes.find(m => m.mode === selectedMode)?.label}?
                        </Typography>
                        <button
                            onClick={() => setSelectedMode(authStatus.authMode)}
                            style={{
                                background: 'none',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                                padding: '8px 16px',
                                cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => handleAuthModeChange(selectedMode)}
                            disabled={loading}
                            style={{
                                background: '#1976d2',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '8px 16px',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                opacity: loading ? 0.6 : 1
                            }}
                        >
                            {loading ? 'Switching...' : 'Confirm'}
                        </button>
                    </Box>
                </Box>
            )}
        </Box>
    );
};

export default Settings_UserManagement;