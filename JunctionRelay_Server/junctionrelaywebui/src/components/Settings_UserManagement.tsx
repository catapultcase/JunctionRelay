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
    Box, Typography, List, ListItemButton, ListItemIcon, ListItemText,
    Paper, CircularProgress, useTheme, useMediaQuery, ToggleButtonGroup, ToggleButton
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
import { errorMessage } from '../utils/errors';

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

type AuthContextValue = ReturnType<typeof useAuth>;

export interface AuthComponentProps {
    authStatus: AuthStatus;
    fetchAuthStatus: () => Promise<void>;
    showSnackbar: (message: string, severity?: AlertColor) => void;
    user: AuthContextValue['user'];
    login: AuthContextValue['login'];
    logout: AuthContextValue['logout'];
    cloudUserInfo: CloudUserInfo | null;
    cloudUserLoading: boolean;
    handleCloudLogin: () => Promise<void>;
    handleCloudLogout: () => Promise<void>;
    checkCloudAuth: () => Promise<void>;
}

const Settings_UserManagement: React.FC<UserManagementProps> = ({ showSnackbar }) => {
    const { logout, user, login } = useAuth();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

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
        const urlParams = new URLSearchParams(window.location.search);
        const authStatusParam = urlParams.get('auth');
        const errorMessage = urlParams.get('message');

        if (authStatusParam === 'success') {
            // Token is in httpOnly cookie (set by server callback), no URL tokens to extract
            window.history.replaceState({}, document.title, window.location.pathname);

            fetchAuthStatus().then(() => {
                checkCloudAuth();
                showSnackbar("Successfully authenticated with JunctionRelay Cloud", "success");
            });
        } else if (authStatusParam === 'error') {
            const message = errorMessage || "Authentication failed";
            showSnackbar(message, "error");
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        // Initial fetch of auth status
        fetchAuthStatus();
    }, []);

    // Watch for auth mode changes and check cloud auth
    useEffect(() => {
        if (authStatus.authMode === 'cloud') {
            checkCloudAuth();
        } else {
            setCloudUserInfo(null);
        }
    }, [authStatus.authMode]);

    // Update selected mode when auth status changes
    useEffect(() => {
        setSelectedMode(authStatus.authMode);
    }, [authStatus.authMode]);

    const fetchAuthStatus = async () => {
        try {
            const response = await fetch("/api/unified-auth/status");
            if (response.ok) {
                const data = await response.json();
                setAuthStatus(data);
            } else {
                console.error("[AUTH] Failed to fetch auth status:", response.status);
            }
        } catch (err) {
            console.error("[AUTH] Error fetching auth status:", err);
        }
    };

    const checkCloudAuth = async () => {
        if (authStatus.authMode !== 'cloud') {
            setCloudUserInfo(null);
            return;
        }

        try {
            setCloudUserLoading(true);

            // Cookie sent automatically on same-origin
            const response = await fetch("/api/unified-auth/me");

            if (response.ok) {
                const data = await response.json();
                setCloudUserInfo(data);
            } else if (response.status === 401) {
                setCloudUserInfo(null);
                showSnackbar("Cloud session expired, please login again", "warning");
            } else {
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
        try {
            setCloudUserLoading(true);

            const response = await fetch("/api/unified-auth/login", {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    origin: window.location.origin
                })
            });

            if (!response.ok) {
                throw new Error("Failed to initiate cloud authentication");
            }

            const data = await response.json();

            if (!data.authUrl) {
                throw new Error("No authentication URL received");
            }

            showSnackbar("Redirecting to JunctionRelay Cloud authentication...", "info");
            window.location.href = data.authUrl;
        } catch (error) {
            console.error("[CLOUD_AUTH] Error initiating cloud login:", error);
            showSnackbar(errorMessage(error) || "Error initiating cloud authentication", "error");
        } finally {
            setCloudUserLoading(false);
        }
    };

    const handleCloudLogout = async () => {
        try {
            // Cookie sent automatically on same-origin
            const response = await fetch("/api/unified-auth/logout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });

            if (response.ok) {
                setCloudUserInfo(null);
                showSnackbar("Logged out from JunctionRelay Cloud", "success");
            } else {
                throw new Error("Failed to logout from cloud");
            }
        } catch (error) {
            console.error("[CLOUD_AUTH] Error during cloud logout:", error);
            setCloudUserInfo(null);
            showSnackbar("Logged out locally from JunctionRelay Cloud", "warning");
        }
    };

    const handleAuthModeChange = async (newMode: AuthMode) => {
        try {
            setLoading(true);

            // For cloud mode, we need to handle it differently
            if (newMode === 'cloud') {

                // First, try to set the auth mode to cloud
                const setModeResponse = await fetch("/api/unified-auth/set-mode", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ mode: 'cloud' })
                });

                if (!setModeResponse.ok) {
                    const error = await setModeResponse.json();
                    throw new Error(error.message || "Failed to set cloud mode");
                }


                // Refresh auth status to reflect the mode change
                await fetchAuthStatus();

                // Check if there's an existing valid session (cookie-based)
                try {
                    const checkResponse = await fetch("/api/unified-auth/me");
                    if (checkResponse.ok) {
                        await checkCloudAuth();
                        showSnackbar("Authentication mode changed to: JunctionRelay Cloud", "success");
                        setLoading(false);
                        return;
                    }
                } catch (error) {
                    // No valid session, proceed to OAuth
                }

                // No valid session, need to authenticate
                await handleCloudLogin();
                return;
            }

            // For non-cloud modes (none, local), proceed normally
            const response = await fetch("/api/unified-auth/set-mode", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: newMode })
            });

            if (response.ok) {
                const data = await response.json();

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
        } catch (error) {
            console.error("[AUTH] Error changing auth mode:", error);
            showSnackbar(errorMessage(error) || "Error changing authentication mode", "error");
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

    // Mobile layout with toggle buttons above
    const renderMobileLayout = () => (
        <Box sx={{ mb: 4 }}>
            <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
                Authentication Mode
            </Typography>

            {/* Mobile toggle buttons */}
            <Box sx={{ mb: 3 }}>
                <ToggleButtonGroup
                    value={selectedMode}
                    exclusive
                    onChange={(event, newMode) => {
                        if (newMode !== null) {
                            setSelectedMode(newMode);
                        }
                    }}
                    aria-label="authentication mode"
                    orientation="vertical"
                    fullWidth
                    sx={{ gap: 1 }}
                >
                    {authModes.map((authMode) => (
                        <ToggleButton
                            key={authMode.mode}
                            value={authMode.mode}
                            aria-label={authMode.label}
                            sx={{
                                py: 2,
                                px: 2,
                                display: 'flex',
                                justifyContent: 'flex-start',
                                alignItems: 'center',
                                gap: 2,
                                textAlign: 'left',
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 1,
                                '&.Mui-selected': {
                                    backgroundColor: 'primary.main',
                                    color: 'primary.contrastText',
                                    '&:hover': {
                                        backgroundColor: 'primary.dark',
                                    }
                                },
                                '&:not(.Mui-selected)': {
                                    backgroundColor: 'background.paper'
                                }
                            }}
                        >
                            <Box sx={{ color: 'inherit' }}>
                                {authMode.icon}
                            </Box>
                            <Box sx={{ textAlign: 'left', flex: 1 }}>
                                <Typography variant="body1" sx={{ fontWeight: 'medium', color: 'inherit' }}>
                                    {authMode.label}
                                </Typography>
                                <Typography
                                    variant="body2"
                                    sx={{
                                        color: selectedMode === authMode.mode ? 'rgba(255,255,255,0.7)' : 'text.secondary',
                                        fontSize: '0.875rem'
                                    }}
                                >
                                    {authMode.description}
                                </Typography>
                            </Box>
                            {authStatus.authMode === authMode.mode && (
                                <Box
                                    sx={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        backgroundColor: selectedMode === authMode.mode ? 'rgba(255,255,255,0.8)' : 'success.main'
                                    }}
                                />
                            )}
                        </ToggleButton>
                    ))}
                </ToggleButtonGroup>
            </Box>

            {/* Auth component content */}
            <Box sx={{ minHeight: 300 }}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    renderAuthComponent()
                )}
            </Box>

            {/* Action buttons for mode changes */}
            {selectedMode !== authStatus.authMode && (
                <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                        Switch to {authModes.find(m => m.mode === selectedMode)?.label}?
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                        <button
                            onClick={() => setSelectedMode(authStatus.authMode)}
                            style={{
                                background: 'none',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                                padding: '8px 16px',
                                cursor: 'pointer',
                                flex: 1
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
                                opacity: loading ? 0.6 : 1,
                                flex: 1
                            }}
                        >
                            {loading ? 'Switching...' : 'Confirm'}
                        </button>
                    </Box>
                </Box>
            )}
        </Box>
    );

    // Desktop layout with sidebar
    const renderDesktopLayout = () => (
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

    return isMobile ? renderMobileLayout() : renderDesktopLayout();
};

export default Settings_UserManagement;