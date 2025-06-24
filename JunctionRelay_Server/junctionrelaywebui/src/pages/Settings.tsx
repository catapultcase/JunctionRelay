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
    Box, Typography, Button, TableContainer, Table, TableHead, TableRow, TableCell, TableBody,
    Paper, Snackbar, Alert, CircularProgress, Switch, FormControlLabel, Checkbox, Divider
} from "@mui/material";
import { AlertColor } from "@mui/material/Alert";
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import SaveIcon from '@mui/icons-material/Save';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import SecurityIcon from '@mui/icons-material/Security';
import InfoIcon from '@mui/icons-material/Info';
import WarningIcon from '@mui/icons-material/Warning';
import DeleteIcon from '@mui/icons-material/Delete';
import Settings_UserManagement from '../components/Settings_UserManagement';

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
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
    const [deleteLoading, setDeleteLoading] = useState<boolean>(false);

    // Snackbar state
    const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);
    const [snackbarMessage, setSnackbarMessage] = useState<string>("");
    const [snackbarSeverity, setSnackbarSeverity] = useState<AlertColor>("success");

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
        } catch (err) {
            showSnackbar("Error loading settings", "error");
        } finally {
            setLoading(false);
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
    }, []);

    const handleDeleteDatabase = async () => {
        try {
            setDeleteLoading(true);
            const response = await fetch("/api/db/delete-database", { method: "DELETE" });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Failed to schedule database deletion");
            }

            localStorage.clear();
            showSnackbar("Database deletion scheduled. Application restart required to complete the reset.", "warning");
            setDeleteConfirmOpen(false);
        } catch (error: any) {
            showSnackbar(error.message || "Error scheduling database deletion", "error");
        } finally {
            setDeleteLoading(false);
        }
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
                .slice(0, 15);

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

    const isBooleanValue = (value: string): boolean => {
        return value.toLowerCase() === 'true' || value.toLowerCase() === 'false';
    };

    const handleToggle = async (item: SettingItem) => {
        try {
            const newValue = item.value.toLowerCase() === 'true' ? 'false' : 'true';
            const response = await fetch(`/api/settings/${item.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...item, value: newValue })
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

    const handleAlignmentToggle = async (item: SettingItem) => {
        try {
            const newValue = item.value.toLowerCase() === 'left' ? 'right' : 'left';
            const response = await fetch(`/api/settings/${item.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...item, value: newValue })
            });

            if (response.ok) {
                fetchSettings();
                showSnackbar(`${item.key} alignment set to ${newValue}`);
            } else {
                throw new Error("Failed to save setting");
            }
        } catch {
            showSnackbar("Error saving setting", "error");
        }
    };

    return (
        <Box sx={{ padding: 2 }}>
            <Typography variant="h5" gutterBottom>Settings</Typography>

            {/* User Management Component - Top Section */}
            <Settings_UserManagement showSnackbar={showSnackbar} />

            {/* Database Backup & Import - Full Width */}
            <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                    <SaveIcon sx={{ mr: 1 }} />
                    Database Backup & Import
                </Typography>

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

            {/* Side by Side Section - Cache Management and Column Settings */}
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 3 }}>
                {/* Cache Management Card */}
                <Box sx={{ flex: '1 1 400px', minWidth: '400px' }}>
                    <Paper sx={{ p: 3, height: 'fit-content' }}>
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
                                            const response = await fetch("/api/cache/clear", { method: "DELETE" });
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

                {/* Column Settings Card */}
                <Box sx={{ flex: '1 1 400px', minWidth: '400px' }}>
                    <Paper sx={{ p: 3, height: 'fit-content' }}>
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
                                        const keys = [];
                                        for (let i = 0; i < localStorage.length; i++) {
                                            const key = localStorage.key(i);
                                            if (key) keys.push(key);
                                        }

                                        const columnKeys = keys.filter(key =>
                                            key.includes('columns') ||
                                            key.includes('_sensors_') ||
                                            key.includes('junction') ||
                                            key.includes('collector') ||
                                            key.includes('devices_visible_columns') ||
                                            key.includes('devices_sort_state') ||
                                            key.includes('devices_refresh_interval') ||
                                            key.includes('dashboard_visible_junction_cols') ||
                                            key.includes('junction_sort_state') ||
                                            key.includes('_unified') ||
                                            key.includes('_jr') ||
                                            key.includes('_other')
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
                                            const keys = [];
                                            for (let i = 0; i < localStorage.length; i++) {
                                                const key = localStorage.key(i);
                                                if (key && (
                                                    key.includes('devices_visible_columns') ||
                                                    key.includes('devices_sort_state') ||
                                                    key.includes('devices_refresh_interval')
                                                )) {
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
                                <TableCell>Control</TableCell>
                                <TableCell>Value</TableCell>
                                <TableCell>Description</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {settings.map(setting => {
                                const isReadOnly = setting.key === 'authentication_mode';
                                const isBoolean = isBooleanValue(setting.value);
                                const isAlignment = setting.key === 'device_actions_alignment' || setting.key === 'junction_actions_alignment';

                                return (
                                    <TableRow key={setting.id}>
                                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                                            {setting.key}
                                        </TableCell>

                                        {/* Control Column */}
                                        <TableCell>
                                            {isReadOnly ? (
                                                <Typography variant="body2" color="text.disabled">
                                                    Read Only
                                                </Typography>
                                            ) : isBoolean ? (
                                                <Switch
                                                    checked={setting.value.toLowerCase() === 'true'}
                                                    onChange={() => handleToggle(setting)}
                                                    color="primary"
                                                    size="small"
                                                />
                                            ) : isAlignment ? (
                                                <Switch
                                                    checked={setting.value.toLowerCase() === 'right'}
                                                    onChange={() => handleAlignmentToggle(setting)}
                                                    size="small"
                                                    sx={{
                                                        '& .MuiSwitch-switchBase.Mui-checked': {
                                                            color: 'grey.300',
                                                        },
                                                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                                            backgroundColor: 'grey.400',
                                                        }
                                                    }}
                                                />
                                            ) : (
                                                <Typography variant="body2" color="text.disabled">
                                                    —
                                                </Typography>
                                            )}
                                        </TableCell>

                                        {/* Value Column */}
                                        <TableCell>
                                            {isBoolean ? (
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        fontFamily: 'monospace',
                                                        color: setting.value.toLowerCase() === 'true' ? 'success.main' : 'text.secondary',
                                                        fontWeight: 'medium'
                                                    }}
                                                >
                                                    {setting.value}
                                                </Typography>
                                            ) : isAlignment ? (
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        fontFamily: 'monospace',
                                                        color: 'text.secondary',
                                                        fontWeight: 'medium'
                                                    }}
                                                >
                                                    {setting.value}
                                                </Typography>
                                            ) : (
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        fontFamily: 'monospace',
                                                        bgcolor: 'rgba(0, 0, 0, 0.04)',
                                                        px: 1,
                                                        py: 0.5,
                                                        borderRadius: 1,
                                                        display: 'inline-block'
                                                    }}
                                                >
                                                    {setting.value}
                                                </Typography>
                                            )}
                                        </TableCell>

                                        <TableCell sx={{ color: 'text.secondary' }}>
                                            {setting.description || "—"}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
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

            {/* Delete Database Confirmation Dialog */}
            {/* Note: The actual delete dialog component would go here - simplified for space */}
        </Box>
    );
};

export default Settings;