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
import {
    Box, Typography, Paper, CircularProgress, Chip, Divider,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Button, List, ListItem, useMediaQuery, useTheme, Alert, Dialog,
    DialogTitle, DialogContent, DialogContentText, DialogActions, IconButton
} from "@mui/material";
import { AlertColor } from "@mui/material/Alert";
import SecurityIcon from '@mui/icons-material/Security';
import DevicesIcon from '@mui/icons-material/Devices';
import CloudIcon from '@mui/icons-material/Cloud';
import ComputerIcon from '@mui/icons-material/Computer';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import TabletIcon from '@mui/icons-material/Tablet';
import WebIcon from '@mui/icons-material/Web';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import LogoutIcon from '@mui/icons-material/Logout';
import DeleteIcon from '@mui/icons-material/Delete';

interface TokenInfo {
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
    userId: string;
    isAuthenticated: boolean;
    accessTokenLength: number;
    refreshTokenLength: number;
    accessTokenPreview: string;
    refreshTokenPreview: string;
}

interface SessionItem {
    id: string;
    type: 'backend' | 'web' | 'mobile' | 'tablet';
    name: string;
    lastActive: string;
    location?: string;
    device?: string;
    status: 'active' | 'expired' | 'revoked';
    friendlyName?: string;
}

interface BackendSession {
    sessionId: string;
    keyId: string;
    tokenType: string;
    createdAt: string;
    expiresAt?: string;
    backendId: string;
    deviceName?: string;
    deviceType?: string;
    deviceStatus?: string;
    deviceLastUpdated?: string;
    backendFriendlyName?: string;
}

interface AuthStatus {
    authMode: string;
    isConfigured: boolean;
    requiresSetup: boolean;
    canActivateLocal: boolean;
    isAuthenticated: boolean;
    currentUser?: string;
    authType?: string;
}

interface SessionManagementProps {
    showSnackbar: (message: string, severity?: AlertColor) => void;
    isMobile?: boolean;
}

const Settings_SessionManagement: React.FC<SessionManagementProps> = ({
    showSnackbar,
    isMobile = false
}) => {
    const theme = useTheme();
    const isSmallScreen = useMediaQuery(theme.breakpoints.down('md'));

    const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
    const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
    const [sessions, setSessions] = useState<SessionItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [refreshing, setRefreshing] = useState<boolean>(false);
    const [revokeDialogOpen, setRevokeDialogOpen] = useState<boolean>(false);
    const [revokeAllDialogOpen, setRevokeAllDialogOpen] = useState<boolean>(false);
    const [sessionToRevoke, setSessionToRevoke] = useState<SessionItem | null>(null);
    const [revoking, setRevoking] = useState<boolean>(false);

    // Helper functions to transform backend session data
    const getSessionType = (session: BackendSession): 'backend' | 'web' | 'mobile' | 'tablet' => {
        if (session.tokenType === 'device') return 'backend'; // Device sessions show as backend type
        if (session.tokenType === 'user' && session.backendId) return 'backend'; // Backend user sessions
        return 'web'; // Cloud dashboard sessions (user with no backendId)
    };

    const getSessionName = (session: BackendSession): string => {
        if (session.tokenType === 'device') {
            return 'Cloud Device';
        }
        if (session.tokenType === 'user' && session.backendId) {
            return 'Backend Session';
        }
        return 'Cloud Dashboard';
    };

    const getDeviceInfo = (session: BackendSession): string => {
        if (session.tokenType === 'device') {
            return `Device ID: ${session.keyId}`;
        }
        if (session.tokenType === 'user' && session.backendId) {
            return `Database ID: ${session.backendId}`;
        }
        return 'Web Browser';
    };

    const fetchAuthStatus = useCallback(async () => {
        try {
            const response = await fetch("/api/auth/status");
            if (response.ok) {
                const data = await response.json();
                setAuthStatus(data);
            }
        } catch (error) {
            console.error("Error fetching auth status:", error);
        }
    }, []);

    const fetchTokenInfo = useCallback(async () => {
        try {
            const response = await fetch("/api/cloud-auth/tokens");
            if (response.ok) {
                const data = await response.json();
                setTokenInfo(data);
            } else {
                console.warn("Failed to fetch token info:", response.status);
                setTokenInfo(null);
            }
        } catch (error) {
            console.error("Error fetching token info:", error);
            setTokenInfo(null);
        }
    }, []);

    const fetchSessions = useCallback(async () => {
        try {
            const response = await fetch("/api/cloud-auth/sessions");
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.sessions) {
                    // Transform backend data to frontend format
                    const transformedSessions: SessionItem[] = data.sessions.map((session: BackendSession) => ({
                        id: session.sessionId,
                        type: getSessionType(session),
                        name: getSessionName(session),
                        lastActive: session.createdAt,
                        location: 'Unknown',
                        device: getDeviceInfo(session),
                        friendlyName: session.deviceName || session.backendFriendlyName || undefined,
                        status: session.expiresAt && new Date(session.expiresAt) < new Date() ? 'expired' : 'active'
                    }));
                    setSessions(transformedSessions);
                } else {
                    setSessions([]);
                }
            } else {
                console.warn("Failed to fetch sessions:", response.status);
                setSessions([]);
            }
        } catch (error) {
            console.error("Error fetching sessions:", error);
            setSessions([]);
        }
    }, []);

    const revokeSession = useCallback(async (sessionId: string) => {
        setRevoking(true);
        try {
            const response = await fetch(`/api/cloud-auth/sessions/${encodeURIComponent(sessionId)}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                showSnackbar("Session revoked successfully", "success");
                await fetchSessions(); // Refresh the sessions list
            } else {
                const errorData = await response.json().catch(() => ({}));
                showSnackbar(errorData.message || "Failed to revoke session", "error");
            }
        } catch (error) {
            console.error("Error revoking session:", error);
            showSnackbar("Error revoking session", "error");
        } finally {
            setRevoking(false);
            setRevokeDialogOpen(false);
            setSessionToRevoke(null);
        }
    }, [fetchSessions, showSnackbar]);

    const revokeAllOtherSessions = useCallback(async () => {
        setRevoking(true);
        try {
            const response = await fetch('/api/cloud-auth/sessions', {
                method: 'DELETE'
            });

            if (response.ok) {
                const data = await response.json();
                const revokedCount = data.revokedCount || 0;
                showSnackbar(`Revoked ${revokedCount} other sessions successfully`, "success");
                await fetchSessions(); // Refresh the sessions list
            } else {
                const errorData = await response.json().catch(() => ({}));
                showSnackbar(errorData.message || "Failed to revoke sessions", "error");
            }
        } catch (error) {
            console.error("Error revoking all sessions:", error);
            showSnackbar("Error revoking all sessions", "error");
        } finally {
            setRevoking(false);
            setRevokeAllDialogOpen(false);
        }
    }, [fetchSessions, showSnackbar]);

    const handleRevokeSession = (session: SessionItem) => {
        setSessionToRevoke(session);
        setRevokeDialogOpen(true);
    };

    const handleRevokeAllOther = () => {
        setRevokeAllDialogOpen(true);
    };

    const refreshData = useCallback(async () => {
        setRefreshing(true);
        try {
            await Promise.all([fetchAuthStatus(), fetchTokenInfo(), fetchSessions()]);
            showSnackbar("Session data refreshed", "success");
        } catch (error) {
            showSnackbar("Error refreshing session data", "error");
        } finally {
            setRefreshing(false);
        }
    }, [fetchAuthStatus, fetchTokenInfo, fetchSessions, showSnackbar]);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            await Promise.all([fetchAuthStatus(), fetchTokenInfo()]);
            setLoading(false);
        };
        loadData();
    }, [fetchAuthStatus, fetchTokenInfo]);

    // Separate effect to fetch sessions when authStatus changes to cloud mode
    useEffect(() => {
        if (authStatus && authStatus.authMode === 'cloud' && !loading) {
            fetchSessions();
        } else {
            setSessions([]);
        }
    }, [authStatus, fetchSessions, loading]);

    const getSessionIcon = (type: string) => {
        switch (type) {
            case 'backend': return <ComputerIcon />;
            case 'mobile': return <PhoneAndroidIcon />;
            case 'tablet': return <TabletIcon />;
            case 'web': return <WebIcon />;
            default: return <DevicesIcon />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return 'success';
            case 'expired': return 'warning';
            case 'revoked': return 'error';
            default: return 'default';
        }
    };

    const formatLastActive = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    };

    const renderMobileSessionsList = () => (
        <List disablePadding>
            {sessions.map((session: SessionItem, index: number) => (
                <ListItem
                    key={session.id}
                    sx={{
                        flexDirection: 'column',
                        alignItems: 'stretch',
                        borderBottom: index === sessions.length - 1 ? 'none' : '1px solid',
                        borderColor: 'divider',
                        py: 2,
                        px: 0
                    }}
                >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', mb: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', flex: 1, mr: 2 }}>
                            {getSessionIcon(session.type)}
                            <Box sx={{ ml: 1 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                                    {session.name}
                                </Typography>

                                {session.friendlyName && (
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                        {session.friendlyName}
                                    </Typography>
                                )}

                                <Typography variant="caption" color="text.secondary">
                                    {session.device}
                                </Typography>
                            </Box>
                        </Box>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                            <Chip
                                label={session.status}
                                size="small"
                                color={getStatusColor(session.status) as any}
                                variant={session.status === 'active' ? 'filled' : 'outlined'}
                            />
                            <Typography variant="caption" color="text.secondary">
                                {formatLastActive(session.lastActive)}
                            </Typography>
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                        <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleRevokeSession(session)}
                            disabled={revoking}
                            title="Revoke Session"
                        >
                            <LogoutIcon fontSize="small" />
                        </IconButton>
                    </Box>
                </ListItem>
            ))}
        </List>
    );

    const renderDesktopSessionsTable = () => (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>Session</TableCell>
                        <TableCell>Identity / Client</TableCell>
                        <TableCell>Friendly Name</TableCell>
                        <TableCell>Token Generated / Refreshed</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell align="right">Actions</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {sessions.map((session: SessionItem) => (
                        <TableRow key={session.id}>
                            <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    {getSessionIcon(session.type)}
                                    <Typography variant="body2" sx={{ ml: 1, fontWeight: 'medium' }}>
                                        {session.name}
                                    </Typography>
                                </Box>
                            </TableCell>
                            <TableCell>
                                <Typography variant="body2" color="text.secondary">
                                    {session.device}
                                </Typography>
                            </TableCell>
                            <TableCell>
                                {session.friendlyName ? (
                                    <Typography variant="body2">{session.friendlyName}</Typography>
                                ) : (
                                    <Typography variant="body2" color="text.disabled">—</Typography>
                                )}
                            </TableCell>
                            <TableCell>
                                <Typography variant="body2" color="text.secondary">
                                    {formatLastActive(session.lastActive)}
                                </Typography>
                            </TableCell>
                            <TableCell>
                                <Chip
                                    label={session.status}
                                    size="small"
                                    color={getStatusColor(session.status) as any}
                                    variant={session.status === 'active' ? 'filled' : 'outlined'}
                                />
                            </TableCell>
                            <TableCell align="right">
                                <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => handleRevokeSession(session)}
                                    disabled={revoking}
                                    title="Revoke Session"
                                >
                                    <LogoutIcon fontSize="small" />
                                </IconButton>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress />
            </Box>
        );
    }

    // Show message when not in cloud mode
    if (!authStatus || authStatus.authMode !== 'cloud') {
        return (
            <Alert severity="info">
                <Typography variant="body2" sx={{ fontWeight: 'medium', mb: 1 }}>
                    Session Management (Cloud Mode Only)
                </Typography>
                <Typography variant="body2">
                    Session management features are only available when using JunctionRelay Cloud authentication.
                    Switch to Cloud mode in User Management to access these features.
                </Typography>
            </Alert>
        );
    }

    return (
        <>
            {/* Current Backend Token Status */}
            {tokenInfo && (
                <>
                    <Box sx={{ mb: 3 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center' }}>
                            <SecurityIcon sx={{ mr: 1, fontSize: 16 }} />
                            Current Backend Authentication
                        </Typography>
                        <Box sx={{
                            p: 2,
                            bgcolor: tokenInfo.isAuthenticated ? 'rgba(76, 175, 80, 0.08)' : 'rgba(244, 67, 54, 0.08)',
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: tokenInfo.isAuthenticated ? 'rgba(76, 175, 80, 0.23)' : 'rgba(244, 67, 54, 0.23)'
                        }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                {tokenInfo.isAuthenticated ? (
                                    <CheckCircleIcon sx={{ mr: 1, fontSize: 16, color: 'success.main' }} />
                                ) : (
                                    <ErrorIcon sx={{ mr: 1, fontSize: 16, color: 'error.main' }} />
                                )}
                                <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                    {tokenInfo.isAuthenticated ? 'Authenticated' : 'Not Authenticated'}
                                </Typography>
                            </Box>

                            <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 1, mb: 1 }}>
                                <Chip
                                    label={`Access Token: ${tokenInfo.hasAccessToken ? 'Valid' : 'Missing'}`}
                                    size="small"
                                    color={tokenInfo.hasAccessToken ? 'success' : 'error'}
                                    variant="outlined"
                                />
                                <Chip
                                    label={`Refresh Token: ${tokenInfo.hasRefreshToken ? 'Valid' : 'Missing'}`}
                                    size="small"
                                    color={tokenInfo.hasRefreshToken ? 'success' : 'error'}
                                    variant="outlined"
                                />
                            </Box>

                            {tokenInfo.isAuthenticated && (
                                <Box sx={{ mt: 1 }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                        User ID: {tokenInfo.userId}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
                                        Access: {tokenInfo.accessTokenPreview}... ({tokenInfo.accessTokenLength} chars)
                                    </Typography>
                                    <br />
                                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
                                        Refresh: {tokenInfo.refreshTokenPreview}... ({tokenInfo.refreshTokenLength} chars)
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                    </Box>

                    <Divider sx={{ my: 2 }} />
                </>
            )}

            {/* Active Sessions */}
            <Box sx={{ mb: 2 }}>
                {isMobile || isSmallScreen ? (
                    // Mobile layout: stacked header and buttons
                    <>
                        <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                            <CloudIcon sx={{ mr: 1, fontSize: 16 }} />
                            Active Sessions ({sessions.filter((s: SessionItem) => s.status === 'active').length})
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                            {sessions.length > 1 && (
                                <Button
                                    size="small"
                                    color="error"
                                    startIcon={<DeleteIcon />}
                                    onClick={handleRevokeAllOther}
                                    disabled={refreshing || revoking}
                                    variant="outlined"
                                >
                                    Revoke All
                                </Button>
                            )}
                            <Button
                                size="small"
                                startIcon={refreshing ? <CircularProgress size={12} /> : <RefreshIcon />}
                                onClick={refreshData}
                                disabled={refreshing || revoking}
                                variant="outlined"
                            >
                                {refreshing ? 'Refreshing...' : 'Refresh'}
                            </Button>
                        </Box>
                        {sessions.length > 1 && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                                Revoke All will log out all sessions except the current backend
                            </Typography>
                        )}
                    </>
                ) : (
                    // Desktop layout: header and buttons side by side
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center' }}>
                            <CloudIcon sx={{ mr: 1, fontSize: 16 }} />
                            Active Sessions ({sessions.filter((s: SessionItem) => s.status === 'active').length})
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            {sessions.length > 1 && (
                                <Button
                                    size="small"
                                    color="error"
                                    startIcon={<DeleteIcon />}
                                    onClick={handleRevokeAllOther}
                                    disabled={refreshing || revoking}
                                    variant="outlined"
                                >
                                    Revoke All
                                </Button>
                            )}
                            <Button
                                size="small"
                                startIcon={refreshing ? <CircularProgress size={12} /> : <RefreshIcon />}
                                onClick={refreshData}
                                disabled={refreshing || revoking}
                                variant="outlined"
                            >
                                {refreshing ? 'Refreshing...' : 'Refresh'}
                            </Button>
                        </Box>
                    </Box>
                )}

                {sessions.length === 0 ? (
                    <Alert severity="info" sx={{ mb: 2 }}>
                        No active sessions found. Session management features are coming soon.
                    </Alert>
                ) : (
                    <>
                        {isSmallScreen || isMobile ? renderMobileSessionsList() : renderDesktopSessionsTable()}

                        <Alert severity="info" sx={{ mt: 2 }}>
                            <Typography variant="body2" sx={{ mb: 1, fontWeight: 'medium' }}>
                                Session Management
                            </Typography>
                            <Typography variant="body2">
                                This section displays your active authentication sessions across all devices and backends.
                                Local backends automatically refresh their tokens to stay authenticated for health reporting.
                                Each local frontend login is proxied through the local backend, which handles token refreshes.
                                <br /><br />
                                If your local backend reports that it has lost access, you can restore connectivity by logging out and back in via the User Management panel above.
                                <br /><br />
                                <strong>Note:</strong> Revoking a session prevents future logins, but existing access tokens may remain valid for up to 8 hours.
                            </Typography>
                        </Alert>
                    </>
                )}
            </Box>

            {/* Revoke Session Confirmation Dialog */}
            <Dialog
                open={revokeDialogOpen}
                onClose={() => !revoking && setRevokeDialogOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Revoke Session</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to revoke the session for <strong>{sessionToRevoke?.name}</strong>?
                        <br /><br />
                        This will prevent future logins from this session, but the current access token may remain valid for up to 8 hours.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setRevokeDialogOpen(false)}
                        disabled={revoking}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={() => sessionToRevoke && revokeSession(sessionToRevoke.id)}
                        color="error"
                        disabled={revoking}
                        startIcon={revoking ? <CircularProgress size={16} /> : <LogoutIcon />}
                    >
                        {revoking ? 'Revoking...' : 'Revoke Session'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Revoke All Other Sessions Confirmation Dialog */}
            <Dialog
                open={revokeAllDialogOpen}
                onClose={() => !revoking && setRevokeAllDialogOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Revoke All Sessions</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to revoke all other active sessions except your current backend?
                        <br /><br />
                        This will log out all other devices and browsers where you're currently logged in, but existing access tokens may remain valid for up to 8 hours.
                        You will remain logged in on this backend.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setRevokeAllDialogOpen(false)}
                        disabled={revoking}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={revokeAllOtherSessions}
                        color="error"
                        disabled={revoking}
                        startIcon={revoking ? <CircularProgress size={16} /> : <DeleteIcon />}
                    >
                        {revoking ? 'Revoking...' : 'Revoke All'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default Settings_SessionManagement;