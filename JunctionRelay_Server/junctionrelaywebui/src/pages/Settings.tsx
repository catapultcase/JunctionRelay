/*
 * This file is part of Junction Relay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * Junction Relay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Junction Relay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Junction Relay. If not, see <https://www.gnu.org/licenses/>.
 */

import React, { useState, useEffect } from "react";
import {
    Box, Typography, Button, TableContainer, Table, TableHead, TableRow, TableCell, TableBody,
    Paper, Snackbar, Alert, CircularProgress, Switch, FormControlLabel, Checkbox, Divider,
    TextField, Dialog, DialogTitle, DialogContent, DialogActions
} from "@mui/material";
import { AlertColor } from "@mui/material/Alert";
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import SaveIcon from '@mui/icons-material/Save';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import SecurityIcon from '@mui/icons-material/Security';
import InfoIcon from '@mui/icons-material/Info';
import WarningIcon from '@mui/icons-material/Warning';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import LockIcon from '@mui/icons-material/Lock';
import PersonIcon from '@mui/icons-material/Person';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

interface SettingItem {
    id: string;
    key: string;
    value: string;
    description?: string;
}

interface BackupInfo {
    databaseExists: boolean;
    databaseSize: number;
    keysDirectoryExists: boolean;
    keyFileCount: number;
    hasEncryptionKeys: boolean;
}

const Settings: React.FC = () => {
    const [settings, setSettings] = useState<SettingItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [backupInfo, setBackupInfo] = useState<BackupInfo | null>(null);
    const [includeKeys, setIncludeKeys] = useState<boolean>(true);
    const [authEnabled, setAuthEnabled] = useState<boolean>(true);
    const [authLoading, setAuthLoading] = useState<boolean>(false);
    const [currentUser, setCurrentUser] = useState<string>('');
    const [usernameDialogOpen, setUsernameDialogOpen] = useState<boolean>(false);
    const [newUsername, setNewUsername] = useState<string>('');
    const [usernameLoading, setUsernameLoading] = useState<boolean>(false);
    const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);
    const [snackbarMessage, setSnackbarMessage] = useState<string>("");
    const [snackbarSeverity, setSnackbarSeverity] = useState<AlertColor>("success");
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
    const [deleteLoading, setDeleteLoading] = useState<boolean>(false);

    const showSnackbar = (message: string, severity: AlertColor = "success") => {
        setSnackbarMessage(message);
        setSnackbarSeverity(severity);
        setSnackbarOpen(true);
    };

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/settings");
            const data = await res.json();
            setSettings(data);

            // Check auth status from dedicated auth endpoint
            const authRes = await fetch("/api/auth/enabled");
            if (authRes.ok) {
                const authData = await authRes.json();
                setAuthEnabled(authData.enabled === true);
            }
        } catch (err) {
            showSnackbar("Error loading settings", "error");
        } finally {
            setLoading(false);
        }
    };

    const fetchCurrentUser = async () => {
        try {
            const token = localStorage.getItem("junctionrelay_token") || "";

            // Don't try to fetch user if no token exists
            if (!token) {
                setCurrentUser('');
                return;
            }

            const res = await fetch("/api/auth/current-user", {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            if (res.ok) {
                const data = await res.json();
                setCurrentUser(data.username || "");
            } else if (res.status === 401) {
                // Token is invalid or expired, clear it
                localStorage.removeItem("junctionrelay_token");
                localStorage.removeItem("junctionrelay_username");
                setCurrentUser('');
            }
        } catch (err) {
            console.error("Error loading current user:", err);
            setCurrentUser('');
        }
    };

    const fetchBackupInfo = async () => {
        try {
            const res = await fetch("/api/db/backup-info");
            const data = await res.json();
            setBackupInfo(data);
        } catch (err) {
            console.error("Error loading backup info:", err);
        }
    };

    useEffect(() => {
        fetchSettings();
        fetchBackupInfo();
        fetchCurrentUser();
    }, []);  // eslint-disable-line react-hooks/exhaustive-deps

    const handleToggle = async (item: SettingItem) => {
        try {
            // Toggle the value
            const newValue = item.value.toLowerCase() === 'true' ? 'false' : 'true';

            // Update the setting
            const response = await fetch(`/api/settings/${item.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...item,
                    value: newValue
                })
            });

            if (response.ok) {
                fetchSettings();
                showSnackbar("Setting updated");
            } else {
                throw new Error("Failed to save setting");
            }
        } catch {
            showSnackbar("Error saving setting", "error");
        }
    };

    const handleAuthToggle = async () => {
        try {
            setAuthLoading(true);
            const newValue = !authEnabled;
            const token = localStorage.getItem("junctionrelay_token") || "";
            const response = await fetch(
                "/api/settings/toggle/authentication_enabled",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({ enabled: newValue })
                }
            );
            if (response.ok) {
                setAuthEnabled(newValue);
                const message = newValue
                    ? "Authentication enabled. New users and sessions will require login."
                    : "Authentication disabled. Application is now publicly accessible.";
                showSnackbar(message, newValue ? "success" : "warning");

                // Remove the fetchSettings() call - not needed since auth setting is hidden from table
                // fetchSettings();
            } else {
                const error = await response.json();
                throw new Error(error.message || "Failed to toggle authentication");
            }
        } catch (error: any) {
            showSnackbar(error.message || "Error toggling authentication", "error");
        } finally {
            setAuthLoading(false);
        }
    };

    const handleUsernameChange = async () => {
        if (!newUsername.trim()) {
            showSnackbar("Username cannot be empty", "error");
            return;
        }
        if (newUsername.trim().length < 3) {
            showSnackbar("Username must be at least 3 characters long", "error");
            return;
        }

        try {
            setUsernameLoading(true);
            const token = localStorage.getItem("junctionrelay_token") || "";
            const response = await fetch("/api/auth/change-username", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ newUsername: newUsername.trim() })
            });

            if (response.ok) {
                // Close dialog and clear form
                setUsernameDialogOpen(false);
                setNewUsername("");

                // Clear old auth data
                localStorage.removeItem("junctionrelay_token");
                localStorage.removeItem("junctionrelay_username");

                showSnackbar("Username updated successfully. Please log in with your new username.", "success");

                // Force page reload to trigger login redirect
                setTimeout(() => {
                    window.location.reload();
                }, 2000);

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

    const handleUsernameDialogClose = () => {
        setUsernameDialogOpen(false);
        setNewUsername('');
    };

    const handleDeleteDatabase = async () => {
        try {
            setDeleteLoading(true);

            const response = await fetch("/api/db/delete-database", {
                method: "DELETE"
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Failed to schedule database deletion");
            }

            const result = await response.json();

            // Clear all localStorage
            localStorage.clear();

            // Show success message with restart info
            showSnackbar("Database deletion scheduled. Application restart required to complete the reset.", "warning");

            // Close dialog
            setDeleteConfirmOpen(false);

        } catch (error: any) {
            showSnackbar(error.message || "Error scheduling database deletion", "error");
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleDeleteDialogClose = () => {
        setDeleteConfirmOpen(false);
    };

    const downloadBackup = async () => {
        try {
            const url = `/api/db/export-db${includeKeys ? '?includeKeys=true' : ''}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error("Failed to download backup");

            const blob = await response.blob();
            const downloadUrl = URL.createObjectURL(blob);

            const timestamp = new Date()
                .toISOString()
                .replace(/[-:]/g, "")
                .replace("T", "_")
                .slice(0, 15); // yyyyMMdd_HHmmss

            const filename = includeKeys
                ? `junction_backup_with_keys_${timestamp}.zip`
                : `junction_backup_${timestamp}.db`;

            const a = document.createElement("a");
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();

            URL.revokeObjectURL(downloadUrl);

            const message = includeKeys
                ? "Complete backup package downloaded (database + encryption keys)"
                : "Database backup downloaded (database only)";
            showSnackbar(message);
        } catch {
            showSnackbar("Error downloading backup", "error");
        }
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Helper function to determine if a value is boolean
    const isBooleanValue = (value: string): boolean => {
        return value.toLowerCase() === 'true' || value.toLowerCase() === 'false';
    };

    return (
        <Box sx={{ padding: 2 }}>
            <Typography variant="h5" gutterBottom>Settings</Typography>

            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {/* Left Column */}
                <Box sx={{ flex: '1 1 400px', minWidth: '400px' }}>
                    {/* Authentication Management Card */}
                    <Paper sx={{ p: 3, mb: 3, height: 'fit-content' }}>
                        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                            {authEnabled ? <LockIcon sx={{ mr: 1 }} /> : <LockOpenIcon sx={{ mr: 1 }} />}
                            Authentication Management
                        </Typography>

                        <Box sx={{
                            mb: 3,
                            p: 2,
                            bgcolor: authEnabled ? 'rgba(76, 175, 80, 0.08)' : 'rgba(255, 152, 0, 0.08)',
                            borderRadius: 1,
                            border: authEnabled ? '1px solid rgba(76, 175, 80, 0.23)' : '1px solid rgba(255, 152, 0, 0.23)'
                        }}>
                            <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center' }}>
                                <InfoIcon sx={{ mr: 1, fontSize: 16 }} />
                                Current Status: {authEnabled ? 'Authentication Enabled' : 'Authentication Disabled'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                                <strong>Note:</strong> Authentication settings take effect immediately.
                                Users will need to log in when authentication is enabled.
                            </Typography>
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={authEnabled}
                                        onChange={handleAuthToggle}
                                        disabled={authLoading}
                                        color="primary"
                                    />
                                }
                                label={
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        {authEnabled ? <LockIcon sx={{ mr: 1, fontSize: 16 }} /> : <LockOpenIcon sx={{ mr: 1, fontSize: 16 }} />}
                                        Enable Authentication
                                        {authLoading && <CircularProgress size={16} sx={{ ml: 1 }} />}
                                    </Box>
                                }
                            />
                        </Box>

                        {/* User Account Management - Only show when auth is enabled */}
                        {authEnabled && currentUser && (
                            <Box sx={{
                                mb: 3,
                                p: 2,
                                bgcolor: 'rgba(25, 118, 210, 0.08)',
                                borderRadius: 1,
                                border: '1px solid rgba(25, 118, 210, 0.23)'
                            }}>
                                <Typography variant="subtitle2" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                                    <PersonIcon sx={{ mr: 1, fontSize: 16 }} />
                                    Account Management
                                </Typography>

                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                    <Typography variant="body2" color="text.secondary">
                                        <strong>Current Username:</strong> {currentUser}
                                    </Typography>

                                    <Button
                                        size="small"
                                        variant="outlined"
                                        startIcon={<EditIcon />}
                                        onClick={() => {
                                            setNewUsername(currentUser);
                                            setUsernameDialogOpen(true);
                                        }}
                                    >
                                        Change Username
                                    </Button>
                                </Box>

                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                                    Changing your username will log you out to login again with the new username. Your password and other settings will remain the same.
                                </Typography>
                            </Box>
                        )}

                        {!authEnabled && (
                            <Box sx={{
                                p: 2,
                                bgcolor: 'rgba(244, 67, 54, 0.08)',
                                borderRadius: 1,
                                border: '1px solid rgba(244, 67, 54, 0.23)'
                            }}>
                                <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center' }}>
                                    <WarningIcon sx={{ mr: 1, fontSize: 16 }} />
                                    Security Warning
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                                    <strong>Authentication is currently disabled.</strong> Anyone with network access to this server
                                    can view and modify your Junction Relay configuration, including sensitive data like API keys and device settings.
                                    Only disable authentication in trusted environments.
                                </Typography>
                            </Box>
                        )}

                        <Divider sx={{ my: 2 }} />

                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                            <strong>Note:</strong> Changes to authentication settings require an application restart to take effect.
                            The application will automatically apply the new authentication mode on startup.
                        </Typography>
                    </Paper>

                    {/* Cache Management Card */}
                    <Paper sx={{ p: 3, mb: 3, height: 'fit-content' }}>
                        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                            <DeleteSweepIcon sx={{ mr: 1 }} />
                            Cache Management
                        </Typography>
                        <Box sx={{ mb: 2 }}>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Clear cached firmware release information to force fresh downloads from GitHub.
                                This will reset the 24-hour cache and force the next update check to fetch new data.
                            </Typography>

                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
                                <Button
                                    variant="outlined"
                                    color="warning"
                                    startIcon={<DeleteSweepIcon />}
                                    onClick={async () => {
                                        try {
                                            const response = await fetch("/api/cache/clear", {
                                                method: "DELETE"
                                            });

                                            if (response.ok) {
                                                const result = await response.json();
                                                showSnackbar(`Cache cleared successfully. ${result.filesDeleted || 0} files removed.`, "success");
                                            } else {
                                                throw new Error("Failed to clear cache");
                                            }
                                        } catch (error) {
                                            console.error("Error clearing cache:", error);
                                            showSnackbar("Error clearing cache", "error");
                                        }
                                    }}
                                >
                                    Clear All Cache Files
                                </Button>

                                <Button
                                    variant="outlined"
                                    onClick={async () => {
                                        try {
                                            const response = await fetch("/api/cache/status");

                                            if (response.ok) {
                                                const result = await response.json();
                                                const cacheInfo = result.cacheFiles || [];

                                                if (cacheInfo.length === 0) {
                                                    showSnackbar("No cache files found", "info");
                                                } else {
                                                    const fileList = cacheInfo.map((file: any) =>
                                                        `${file.name} (${file.sizeKB}KB, ${file.age})`
                                                    ).join('\n');

                                                    showSnackbar(`Found ${cacheInfo.length} cache files:\n${fileList}`, "info");
                                                }
                                            } else {
                                                throw new Error("Failed to get cache status");
                                            }
                                        } catch (error) {
                                            console.error("Error getting cache status:", error);
                                            showSnackbar("Error getting cache status", "error");
                                        }
                                    }}
                                >
                                    View Cache Status
                                </Button>
                            </Box>

                            {/* Cache Information */}
                            <Box sx={{
                                p: 2,
                                bgcolor: 'rgba(0, 0, 0, 0.02)',
                                borderRadius: 1,
                                border: '1px solid rgba(0, 0, 0, 0.05)'
                            }}>
                                <Typography variant="subtitle2" sx={{ mb: 1 }}>Cache Information:</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                                    • Release cache expires after 24 hours<br />
                                    • Forced update checks have a 5-second cooldown<br />
                                    • Cache files are stored in the server's Firmware/Releases directory<br />
                                    • Clearing cache will force fresh GitHub API calls on next update check
                                </Typography>
                            </Box>
                        </Box>
                    </Paper>
                </Box>

                {/* Right Column */}
                <Box sx={{ flex: '1 1 400px', minWidth: '400px' }}>
                    {/* Backup/Import card */}
                    <Paper sx={{ p: 3, mb: 3, height: 'fit-content' }}>
                        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                            <SaveIcon sx={{ mr: 1 }} />
                            Database Backup & Import
                        </Typography>

                        {/* Backup Info */}
                        {backupInfo && (
                            <Box sx={{
                                mb: 3,
                                p: 2,
                                bgcolor: 'rgba(0, 0, 0, 0.02)',
                                borderRadius: 1,
                                border: '1px solid rgba(0, 0, 0, 0.05)'
                            }}>
                                <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center' }}>
                                    <InfoIcon sx={{ mr: 1, fontSize: 16 }} />
                                    Backup Information
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                                    • Database: {backupInfo.databaseExists ? `Available (${formatFileSize(backupInfo.databaseSize)})` : 'Not found'}<br />
                                    • Encryption Keys: {backupInfo.hasEncryptionKeys ? `${backupInfo.keyFileCount} files` : 'None found'}<br />
                                    • Secrets Encryption: {backupInfo.hasEncryptionKeys ? 'Active - includes encrypted API tokens' : 'Not active'}
                                </Typography>
                            </Box>
                        )}

                        {/* Backup Options */}
                        <Box sx={{ mb: 3 }}>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={includeKeys}
                                        onChange={(e) => setIncludeKeys(e.target.checked)}
                                        color="primary"
                                    />
                                }
                                label={
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        <SecurityIcon sx={{ mr: 1, fontSize: 16 }} />
                                        Include encryption keys in backup
                                    </Box>
                                }
                            />
                            <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mt: 0.5 }}>
                                {includeKeys ? (
                                    <>
                                        <strong>Recommended:</strong> Creates a complete backup package (.zip) that can be restored on any computer.
                                        Your encrypted API tokens and secrets will be preserved.
                                    </>
                                ) : (
                                    <>
                                        <WarningIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
                                        <strong>Database only:</strong> Creates a .db file without encryption keys.
                                        Encrypted secrets will be unreadable when restored on a different computer.
                                    </>
                                )}
                            </Typography>
                        </Box>

                        <Divider sx={{ my: 2 }} />

                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
                            <Button
                                variant="outlined"
                                startIcon={<SaveIcon />}
                                onClick={downloadBackup}
                            >
                                {includeKeys ? 'Download Complete Backup (.zip)' : 'Download Database Only (.db)'}
                            </Button>

                            <label htmlFor="upload-db" style={{ display: "inline-block" }}>
                                <input
                                    id="upload-db"
                                    type="file"
                                    accept=".db,.zip"
                                    style={{ display: "none" }}
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;

                                        const formData = new FormData();
                                        formData.append("file", file);

                                        try {
                                            const res = await fetch("/api/db/import-db", {
                                                method: "POST",
                                                body: formData,
                                            });

                                            if (!res.ok) {
                                                const errorData = await res.json();
                                                throw new Error(errorData.error || "Failed to import database");
                                            }

                                            const result = await res.json();
                                            showSnackbar(result.message);

                                            // Refresh backup info after successful import
                                            fetchBackupInfo();
                                        } catch (error: any) {
                                            showSnackbar(error.message || "Error importing database", "error");
                                        }
                                    }}
                                />
                                <Button variant="contained" component="span">
                                    Upload Database File
                                </Button>
                            </label>

                            <Box sx={{ ml: 'auto' }}>
                                <Button
                                    variant="contained"
                                    color="error"
                                    startIcon={<DeleteIcon />}
                                    onClick={() => setDeleteConfirmOpen(true)}
                                >
                                    Delete Database
                                </Button>
                            </Box>
                        </Box>

                        {/* Import Instructions */}
                        <Box sx={{
                            p: 2,
                            bgcolor: 'rgba(25, 118, 210, 0.08)',
                            borderRadius: 1,
                            border: '1px solid rgba(25, 118, 210, 0.23)'
                        }}>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>Import Instructions:</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                                • <strong>.zip files:</strong> Complete backups with database + encryption keys (recommended)<br />
                                • <strong>.db files:</strong> Database only (secrets may be unreadable if keys are missing)<br />
                                • After importing, restart the application to apply changes
                            </Typography>
                        </Box>
                    </Paper>

                    {/* Column Settings Card for localStorage column reset */}
                    <Paper sx={{ p: 3, mb: 3, height: 'fit-content' }}>
                        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                            <ViewColumnIcon sx={{ mr: 1 }} />
                            Table Column Settings
                        </Typography>
                        <Box sx={{ mb: 2 }}>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Reset column settings to restore default column visibility and order for all tables.
                                This will clear your saved column preferences for Sensors, Junctions, Devices, and other tables.
                            </Typography>

                            <Button
                                variant="outlined"
                                color="warning"
                                startIcon={<SettingsBackupRestoreIcon />}
                                onClick={() => {
                                    try {
                                        // Get all localStorage keys
                                        const keys = [];
                                        for (let i = 0; i < localStorage.length; i++) {
                                            const key = localStorage.key(i);
                                            if (key) keys.push(key);
                                        }

                                        // Find and remove all column-related keys (including devices tables)
                                        const columnKeys = keys.filter(key =>
                                            key.includes('columns') ||
                                            key.includes('_sensors_') ||
                                            key.includes('junction') ||
                                            key.includes('collector') ||
                                            key.includes('devices_visible_columns') ||
                                            key.includes('devices_sort_state')
                                        );

                                        let resetCount = 0;
                                        columnKeys.forEach(key => {
                                            localStorage.removeItem(key);
                                            resetCount++;
                                        });

                                        showSnackbar(`Reset ${resetCount} column configuration${resetCount !== 1 ? 's' : ''}. Refresh the page to see changes.`, "success");
                                    } catch (error) {
                                        console.error("Error resetting column preferences:", error);
                                        showSnackbar("Error resetting column preferences", "error");
                                    }
                                }}
                                sx={{ mb: 2 }}
                            >
                                Reset All Column Settings
                            </Button>

                            {/* Specific reset buttons for different views */}
                            <Box sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 1.5,
                                p: 2,
                                bgcolor: 'rgba(0, 0, 0, 0.02)',
                                borderRadius: 1,
                                border: '1px solid rgba(0, 0, 0, 0.05)'
                            }}>
                                <Typography variant="subtitle2">Reset Specific Views:</Typography>

                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        onClick={() => {
                                            // Reset junction columns
                                            localStorage.removeItem('junction_sensors_columns');
                                            showSnackbar("Reset Junction table columns. Refresh the page to see changes.", "success");
                                        }}
                                    >
                                        Junction Sensors
                                    </Button>

                                    <Button
                                        size="small"
                                        variant="outlined"
                                        onClick={() => {
                                            // Find and remove all collector-related column settings
                                            const keys = [];
                                            for (let i = 0; i < localStorage.length; i++) {
                                                const key = localStorage.key(i);
                                                if (key && key.includes('collector') && key.includes('columns')) {
                                                    keys.push(key);
                                                }
                                            }

                                            keys.forEach(key => localStorage.removeItem(key));
                                            showSnackbar(`Reset ${keys.length} collector table columns. Refresh to see changes.`, "success");
                                        }}
                                    >
                                        Collector Sensors
                                    </Button>

                                    <Button
                                        size="small"
                                        variant="outlined"
                                        onClick={() => {
                                            // Reset dashboard columns
                                            localStorage.removeItem('dashboard_visible_junction_cols');
                                            showSnackbar("Reset Dashboard junction columns. Refresh to see changes.", "success");
                                        }}
                                    >
                                        Dashboard
                                    </Button>

                                    <Button
                                        size="small"
                                        variant="outlined"
                                        onClick={() => {
                                            // Reset devices table columns and sort settings
                                            localStorage.removeItem('devices_visible_columns_jr');
                                            localStorage.removeItem('devices_visible_columns_other');
                                            localStorage.removeItem('devices_sort_state_jr');
                                            localStorage.removeItem('devices_sort_state_other');
                                            showSnackbar("Reset Devices table columns. Refresh the page to see changes.", "success");
                                        }}
                                    >
                                        Devices Tables
                                    </Button>

                                    <Button
                                        size="small"
                                        variant="outlined"
                                        onClick={() => {
                                            // Reset all devices-related localStorage
                                            const keys = [];
                                            for (let i = 0; i < localStorage.length; i++) {
                                                const key = localStorage.key(i);
                                                if (key && (key.includes('devices_visible_columns') || key.includes('devices_sort_state'))) {
                                                    keys.push(key);
                                                }
                                            }

                                            keys.forEach(key => localStorage.removeItem(key));
                                            showSnackbar(`Reset ${keys.length} devices table settings. Refresh to see changes.`, "success");
                                        }}
                                    >
                                        All Device Settings
                                    </Button>
                                </Box>
                            </Box>
                        </Box>
                    </Paper>
                </Box>
            </Box>

            {/* Settings Table - Full Width */}
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>
            ) : (
                <TableContainer component={Paper}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Key</TableCell>
                                <TableCell>Value</TableCell>
                                <TableCell>Description</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {settings.map(setting => (
                                <TableRow key={setting.id}>
                                    <TableCell>{setting.key}</TableCell>
                                    <TableCell>
                                        {isBooleanValue(setting.value) ? (
                                            <Switch
                                                checked={setting.value.toLowerCase() === 'true'}
                                                onChange={() => handleToggle(setting)}
                                                color="primary"
                                            />
                                        ) : (
                                            setting.value
                                        )}
                                    </TableCell>
                                    <TableCell>{setting.description || "—"}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            <Snackbar
                open={snackbarOpen}
                autoHideDuration={6000}
                onClose={() => setSnackbarOpen(false)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert onClose={() => setSnackbarOpen(false)} severity={snackbarSeverity} sx={{ width: "100%" }}>
                    {snackbarMessage}
                </Alert>
            </Snackbar>

            {/* Username Change Dialog */}
            <Dialog
                open={usernameDialogOpen}
                onClose={handleUsernameDialogClose}
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
                        onClick={handleUsernameDialogClose}
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

            {/* Delete Database Confirmation Dialog */}
            <Dialog
                open={deleteConfirmOpen}
                onClose={handleDeleteDialogClose}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle sx={{ color: 'error.main', display: 'flex', alignItems: 'center' }}>
                    <WarningIcon sx={{ mr: 1 }} />
                    Delete Database - Irreversible Action
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body1" sx={{ mb: 2, fontWeight: 'bold' }}>
                        ⚠️ This action will permanently delete ALL data and cannot be undone!
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        This will delete:
                    </Typography>
                    <Box component="ul" sx={{ pl: 2, mb: 2 }}>
                        <li>All junctions, devices, collectors, and services</li>
                        <li>All sensor data and configurations</li>
                        <li>All user accounts and authentication settings</li>
                        <li>All application settings and preferences</li>
                        <li>All encryption keys and secrets</li>
                        <li>All cache files and temporary data</li>
                        <li>All browser localStorage settings</li>
                    </Box>
                    <Typography variant="body2" color="error" sx={{ fontWeight: 'bold' }}>
                        The application will restart with a fresh, empty database requiring initial setup.
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 2, fontStyle: 'italic' }}>
                        Consider downloading a backup before proceeding if you want to preserve any data.
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 2, p: 1.5, bgcolor: 'warning.light', borderRadius: 1 }}>
                        <strong>Note:</strong> Database deletion will be scheduled and completed on the next application restart.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button
                        onClick={handleDeleteDialogClose}
                        disabled={deleteLoading}
                        variant="outlined"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleDeleteDatabase}
                        variant="contained"
                        color="error"
                        disabled={deleteLoading}
                        startIcon={deleteLoading ? <CircularProgress size={16} /> : <DeleteIcon />}
                    >
                        {deleteLoading ? 'Scheduling...' : 'Schedule Database Deletion'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default Settings;