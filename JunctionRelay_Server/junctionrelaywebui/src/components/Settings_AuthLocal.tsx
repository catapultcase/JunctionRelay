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
    Box, Typography, Paper, Button, Dialog, DialogTitle, DialogContent,
    DialogActions, TextField, CircularProgress, List, ListItem, ListItemIcon,
    ListItemText, IconButton, Chip
} from "@mui/material";
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EditIcon from '@mui/icons-material/Edit';
import KeyIcon from '@mui/icons-material/Key';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonIcon from '@mui/icons-material/Person';
import WarningIcon from '@mui/icons-material/Warning';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import { AuthComponentProps } from "./Settings_UserManagement";

const Settings_AuthLocal: React.FC<AuthComponentProps> = ({
    authStatus,
    fetchAuthStatus,
    showSnackbar,
    user,
    login,
    logout
}) => {
    const [setupDialogOpen, setSetupDialogOpen] = useState<boolean>(false);
    const [adminUsername, setAdminUsername] = useState<string>('');
    const [adminPassword, setAdminPassword] = useState<string>('');
    const [adminConfirmPassword, setAdminConfirmPassword] = useState<string>('');
    const [setupLoading, setSetupLoading] = useState<boolean>(false);

    const [usernameDialogOpen, setUsernameDialogOpen] = useState<boolean>(false);
    const [newUsername, setNewUsername] = useState<string>('');
    const [usernameLoading, setUsernameLoading] = useState<boolean>(false);

    const [passwordDialogOpen, setPasswordDialogOpen] = useState<boolean>(false);
    const [currentPassword, setCurrentPassword] = useState<string>('');
    const [newPassword, setNewPassword] = useState<string>('');
    const [confirmPassword, setConfirmPassword] = useState<string>('');
    const [passwordLoading, setPasswordLoading] = useState<boolean>(false);

    const [removeUserDialogOpen, setRemoveUserDialogOpen] = useState<boolean>(false);
    const [removeUserLoading, setRemoveUserLoading] = useState<boolean>(false);

    // Show setup dialog if local mode is active but requires setup
    useEffect(() => {
        if (authStatus.authMode === 'local' && authStatus.requiresSetup) {
            setSetupDialogOpen(true);
        }
    }, [authStatus]);

    const handleSetupAndActivate = async () => {
        if (!adminUsername.trim()) {
            showSnackbar("Username cannot be empty", "error");
            return;
        }
        if (adminUsername.trim().length < 3) {
            showSnackbar("Username must be at least 3 characters long", "error");
            return;
        }
        if (!adminPassword || !adminConfirmPassword) {
            showSnackbar("All password fields are required", "error");
            return;
        }
        if (adminPassword !== adminConfirmPassword) {
            showSnackbar("Passwords do not match", "error");
            return;
        }
        if (adminPassword.length < 6) {
            showSnackbar("Password must be at least 6 characters long", "error");
            return;
        }

        try {
            setSetupLoading(true);

            const response = await fetch("/api/auth/setup-and-activate-local", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: adminUsername.trim(),
                    password: adminPassword
                })
            });

            if (response.ok) {
                const data = await response.json();

                setSetupDialogOpen(false);
                setAdminUsername("");
                setAdminPassword("");
                setAdminConfirmPassword("");

                if (data.token) {
                    const loginSuccess = await login(data.username, adminPassword);
                    if (loginSuccess) {
                        showSnackbar("Local admin created and logged in successfully", "success");
                    }
                }

                await fetchAuthStatus();
            } else {
                const error = await response.json();
                throw new Error(error.message || "Failed to setup local authentication");
            }
        } catch (error: any) {
            showSnackbar(error.message || "Error setting up local authentication", "error");
        } finally {
            setSetupLoading(false);
        }
    };

    const handleUsernameChange = async () => {
        if (!newUsername.trim() || newUsername.trim().length < 3) {
            showSnackbar("Username must be at least 3 characters long", "error");
            return;
        }

        try {
            setUsernameLoading(true);
            const response = await fetch("/api/auth/change-username", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ newUsername: newUsername.trim() })
            });

            if (response.ok) {
                setUsernameDialogOpen(false);
                setNewUsername("");
                logout();
                await fetchAuthStatus();
                showSnackbar("Username updated successfully. Please log in with your new username.", "success");
            } else {
                const error = await response.json();
                throw new Error(error.message || "Failed to update username");
            }
        } catch (error: any) {
            showSnackbar(error.message || "Error updating username", "error");
        } finally {
            setUsernameLoading(false);
        }
    };

    const handlePasswordChange = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            showSnackbar("All password fields are required", "error");
            return;
        }
        if (newPassword !== confirmPassword) {
            showSnackbar("New passwords do not match", "error");
            return;
        }
        if (newPassword.length < 6) {
            showSnackbar("New password must be at least 6 characters long", "error");
            return;
        }

        try {
            setPasswordLoading(true);
            const response = await fetch("/api/auth/change-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    currentPassword: currentPassword,
                    newPassword: newPassword
                })
            });

            if (response.ok) {
                setPasswordDialogOpen(false);
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
                showSnackbar("Password changed successfully.", "success");
            } else {
                const error = await response.json();
                throw new Error(error.message || "Failed to change password");
            }
        } catch (error: any) {
            showSnackbar(error.message || "Error changing password", "error");
        } finally {
            setPasswordLoading(false);
        }
    };

    const handleRemoveLocalUser = async () => {
        try {
            setRemoveUserLoading(true);
            const response = await fetch("/api/auth/remove-user", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" }
            });

            if (response.ok) {
                const data = await response.json();
                setRemoveUserDialogOpen(false);
                logout();
                await fetchAuthStatus();
                showSnackbar(data.message || "Local user removed successfully.", "success");
            } else {
                const error = await response.json();
                throw new Error(error.message || "Failed to remove user");
            }
        } catch (error: any) {
            showSnackbar(error.message || "Error removing user", "error");
        } finally {
            setRemoveUserLoading(false);
        }
    };

    return (
        <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
                Local Authentication (Offline Mode)
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Local admin account with offline authentication. Secure access with username and password while maintaining local-only operation.
            </Typography>

            <Box sx={{
                p: 2,
                bgcolor: 'rgba(25, 118, 210, 0.08)',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'rgba(25, 118, 210, 0.23)',
                mb: 3
            }}>
                <Typography variant="body2" color="primary.main" sx={{ fontWeight: 'medium', display: 'flex', alignItems: 'center', mb: 1 }}>
                    <WifiOffIcon sx={{ mr: 1, fontSize: 18 }} />
                    Offline Authentication
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    This mode provides secure local authentication without external dependencies or cloud services. All authentication data is stored locally.
                </Typography>
            </Box>

            {/* Current Status */}
            {authStatus.authMode === 'local' && user && (
                <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle1" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                        <CheckCircleIcon sx={{ mr: 1, fontSize: 20, color: 'success.main' }} />
                        Currently Logged In
                    </Typography>

                    <List sx={{ bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 1, p: 0 }}>
                        <ListItem
                            secondaryAction={
                                <IconButton
                                    onClick={() => {
                                        setNewUsername(user.username);
                                        setUsernameDialogOpen(true);
                                    }}
                                    size="small"
                                >
                                    <EditIcon />
                                </IconButton>
                            }
                        >
                            <ListItemIcon><PersonIcon /></ListItemIcon>
                            <ListItemText
                                primary="Username"
                                secondary={user.username}
                            />
                        </ListItem>
                        <ListItem
                            secondaryAction={
                                <IconButton
                                    onClick={() => setPasswordDialogOpen(true)}
                                    size="small"
                                >
                                    <EditIcon />
                                </IconButton>
                            }
                        >
                            <ListItemIcon><KeyIcon /></ListItemIcon>
                            <ListItemText
                                primary="Password"
                                secondary="••••••••"
                            />
                        </ListItem>
                    </List>
                </Box>
            )}

            {/* Account Status for Non-Logged In Users */}
            {authStatus.authMode === 'local' && !user && authStatus.isConfigured && (
                <Box sx={{ mb: 3 }}>
                    <Chip
                        label="Local account configured - Please log in"
                        color="warning"
                        sx={{ mb: 2 }}
                    />
                </Box>
            )}

            {/* Account Management */}
            {authStatus.isConfigured && (
                <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" gutterBottom>
                        Account Management
                    </Typography>
                    <Button
                        variant="outlined"
                        color="error"
                        startIcon={<DeleteIcon />}
                        onClick={() => setRemoveUserDialogOpen(true)}
                        disabled={removeUserLoading}
                        sx={{ mb: 2 }}
                    >
                        {removeUserLoading ? 'Removing...' : 'Remove Local User'}
                    </Button>
                </Box>
            )}

            <Typography variant="subtitle2" gutterBottom>
                This mode is suitable for:
            </Typography>
            <Box component="ul" sx={{ margin: '8px 0', paddingLeft: '20px', color: 'text.secondary' }}>
                <li>Private networks requiring basic authentication</li>
                <li>Multi-user environments with shared access</li>
                <li>Situations where simple login protection is needed</li>
                <li>Offline installations with authentication requirements</li>
                <li>Local development with authentication testing</li>
            </Box>

            {/* Setup Dialog */}
            <Dialog
                open={setupDialogOpen}
                onClose={() => {
                    if (!authStatus.requiresSetup) {
                        setSetupDialogOpen(false);
                        setAdminUsername('');
                        setAdminPassword('');
                        setAdminConfirmPassword('');
                    }
                }}
                maxWidth="sm"
                fullWidth
                disableEscapeKeyDown={authStatus.requiresSetup}
            >
                <DialogTitle>Setup Local Authentication</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Create an administrator account to secure access to your JunctionRelay device.
                    </Typography>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Admin Username"
                        type="text"
                        fullWidth
                        variant="outlined"
                        value={adminUsername}
                        onChange={(e) => setAdminUsername(e.target.value)}
                        disabled={setupLoading}
                        helperText="Username must be at least 3 characters long"
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        margin="dense"
                        label="Admin Password"
                        type="password"
                        fullWidth
                        variant="outlined"
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        disabled={setupLoading}
                        helperText="Password must be at least 6 characters long"
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        margin="dense"
                        label="Confirm Password"
                        type="password"
                        fullWidth
                        variant="outlined"
                        value={adminConfirmPassword}
                        onChange={(e) => setAdminConfirmPassword(e.target.value)}
                        disabled={setupLoading}
                        error={adminConfirmPassword.length > 0 && adminPassword !== adminConfirmPassword}
                        helperText={adminConfirmPassword.length > 0 && adminPassword !== adminConfirmPassword ? "Passwords do not match" : ""}
                    />
                </DialogContent>
                <DialogActions>
                    {!authStatus.requiresSetup && (
                        <Button
                            onClick={() => {
                                setSetupDialogOpen(false);
                                setAdminUsername('');
                                setAdminPassword('');
                                setAdminConfirmPassword('');
                            }}
                            disabled={setupLoading}
                        >
                            Cancel
                        </Button>
                    )}
                    <Button
                        onClick={handleSetupAndActivate}
                        variant="contained"
                        disabled={setupLoading || !adminUsername.trim() || adminUsername.trim().length < 3 || !adminPassword || !adminConfirmPassword || adminPassword !== adminConfirmPassword}
                        startIcon={setupLoading ? <CircularProgress size={16} /> : undefined}
                    >
                        {setupLoading ? 'Setting up...' : 'Setup & Activate'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Username Change Dialog */}
            <Dialog
                open={usernameDialogOpen}
                onClose={() => {
                    setUsernameDialogOpen(false);
                    setNewUsername('');
                }}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Change Username</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="New Username"
                        type="text"
                        fullWidth
                        variant="outlined"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        disabled={usernameLoading}
                        helperText="Username must be at least 3 characters long"
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => {
                            setUsernameDialogOpen(false);
                            setNewUsername('');
                        }}
                        disabled={usernameLoading}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleUsernameChange}
                        variant="contained"
                        disabled={usernameLoading || newUsername.trim().length < 3}
                        startIcon={usernameLoading ? <CircularProgress size={16} /> : undefined}
                    >
                        {usernameLoading ? 'Updating...' : 'Update Username'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Password Change Dialog */}
            <Dialog
                open={passwordDialogOpen}
                onClose={() => {
                    setPasswordDialogOpen(false);
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                }}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Change Password</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Current Password"
                        type="password"
                        fullWidth
                        variant="outlined"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        disabled={passwordLoading}
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        margin="dense"
                        label="New Password"
                        type="password"
                        fullWidth
                        variant="outlined"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={passwordLoading}
                        helperText="Password must be at least 6 characters long"
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        margin="dense"
                        label="Confirm New Password"
                        type="password"
                        fullWidth
                        variant="outlined"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={passwordLoading}
                        error={confirmPassword.length > 0 && newPassword !== confirmPassword}
                        helperText={confirmPassword.length > 0 && newPassword !== confirmPassword ? "Passwords do not match" : ""}
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => {
                            setPasswordDialogOpen(false);
                            setCurrentPassword('');
                            setNewPassword('');
                            setConfirmPassword('');
                        }}
                        disabled={passwordLoading}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handlePasswordChange}
                        variant="contained"
                        disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                        startIcon={passwordLoading ? <CircularProgress size={16} /> : undefined}
                    >
                        {passwordLoading ? 'Changing...' : 'Change Password'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Remove Local User Dialog */}
            <Dialog
                open={removeUserDialogOpen}
                onClose={() => {
                    setRemoveUserDialogOpen(false);
                }}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center' }}>
                    <WarningIcon sx={{ mr: 1, color: 'warning.main' }} />
                    Remove Local User
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body1" sx={{ mb: 2 }}>
                        Are you sure you want to remove the local user account? This action cannot be undone.
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        After removing the user, you can create a new admin account if needed.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => {
                            setRemoveUserDialogOpen(false);
                        }}
                        disabled={removeUserLoading}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleRemoveLocalUser}
                        variant="contained"
                        color="error"
                        disabled={removeUserLoading}
                        startIcon={removeUserLoading ? <CircularProgress size={16} /> : <DeleteIcon />}
                    >
                        {removeUserLoading ? 'Removing...' : 'Remove User'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
};

export default Settings_AuthLocal;