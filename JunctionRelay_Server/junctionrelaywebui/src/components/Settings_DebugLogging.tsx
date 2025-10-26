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

import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Button,
    Switch,
    FormControlLabel,
    TextField,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    CircularProgress,
    Snackbar,
    Alert,
    Chip,
    IconButton,
    Tooltip
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import BugReportIcon from '@mui/icons-material/BugReport';
import DeleteIcon from '@mui/icons-material/Delete';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import { AlertColor } from '@mui/material/Alert';

interface LoggingSettings {
    id: number;
    category: string;
    enabled: boolean;
    logIntervalMinutes: number;
    description?: string;
    lastLoggedAt?: string;
    maxLogRetentionDays: number;
    maxLogFileSizeMB: number;
    autoCleanupEnabled: boolean;
    lastCleanupAt?: string;
}

interface BlitModeStatus {
    isMonitoring: boolean;
    logFilePath: string;
    logFileExists: boolean;
    logFileSizeBytes: number;
    currentIntervalMinutes: number;
}

interface LogDirectoryInfo {
    directoryPath: string;
    files: LogFileInfo[];
    totalSizeBytes: number;
    totalFiles: number;
}

interface LogFileInfo {
    filePath: string;
    fileName: string;
    sizeBytes: number;
    createdAt: string;
    lastModified: string;
    category: string;
}

const Settings_DebugLogging: React.FC = () => {
    const [loggingSettings, setLoggingSettings] = useState<LoggingSettings[]>([]);
    const [blitModeStatus, setBlitModeStatus] = useState<BlitModeStatus | null>(null);
    const [streamHistoryStatus, setStreamHistoryStatus] = useState<BlitModeStatus | null>(null);
    const [logDirectoryInfo, setLogDirectoryInfo] = useState<LogDirectoryInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [savingCategory, setSavingCategory] = useState<string | null>(null);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: AlertColor }>({
        open: false,
        message: '',
        severity: 'info'
    });
    // Local state for text field editing to prevent immediate updates
    const [editingValues, setEditingValues] = useState<{ [key: string]: number }>({});

    // Fetch logging settings
    const fetchLoggingSettings = async () => {
        try {
            const response = await fetch('/api/Controller_LoggingSettings');
            if (response.ok) {
                const data = await response.json();
                setLoggingSettings(data);
            }
        } catch (error) {
            console.error('Failed to fetch logging settings:', error);
            showSnackbar('Failed to load logging settings', 'error');
        }
    };

    // Fetch blit mode status
    const fetchBlitModeStatus = async () => {
        try {
            const response = await fetch('/api/Controller_LoggingSettings/blit-mode/status');
            if (response.ok) {
                const data = await response.json();
                setBlitModeStatus(data);
            }
        } catch (error) {
            console.error('Failed to fetch blit mode status:', error);
        }
    };

    // Fetch stream history status
    const fetchStreamHistoryStatus = async () => {
        try {
            const response = await fetch('/api/Controller_LoggingSettings/stream-history/status');
            if (response.ok) {
                const data = await response.json();
                setStreamHistoryStatus(data);
            }
        } catch (error) {
            console.error('Failed to fetch stream history status:', error);
        }
    };

    // Fetch log directory info
    const fetchLogDirectoryInfo = async () => {
        try {
            const response = await fetch('/api/Controller_LoggingSettings/logs/directory-info');
            if (response.ok) {
                const data = await response.json();
                setLogDirectoryInfo(data);
            }
        } catch (error) {
            console.error('Failed to fetch log directory info:', error);
        }
    };

    // Initial load
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            await Promise.all([fetchLoggingSettings(), fetchBlitModeStatus(), fetchStreamHistoryStatus(), fetchLogDirectoryInfo()]);
            setLoading(false);
        };
        loadData();
    }, []);

    // Show snackbar
    const showSnackbar = (message: string, severity: AlertColor = 'info') => {
        setSnackbar({ open: true, message, severity });
    };

    // Close snackbar
    const handleSnackbarClose = () => {
        setSnackbar({ ...snackbar, open: false });
    };

    // Update logging setting
    const handleUpdateSetting = async (setting: LoggingSettings) => {
        setSavingCategory(setting.category);
        try {
            const response = await fetch('/api/Controller_LoggingSettings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(setting)
            });

            if (response.ok) {
                showSnackbar('Settings updated successfully', 'success');
                // Give monitoring time to start and create initial snapshot
                await new Promise(resolve => setTimeout(resolve, 500));
                await fetchLoggingSettings();
                await fetchBlitModeStatus();
                await fetchStreamHistoryStatus();
                await fetchLogDirectoryInfo();
            } else {
                showSnackbar('Failed to update settings', 'error');
            }
        } catch (error) {
            console.error('Failed to update setting:', error);
            showSnackbar('Failed to update settings', 'error');
        } finally {
            setSavingCategory(null);
        }
    };

    // Toggle enabled state
    const handleToggleEnabled = (setting: LoggingSettings) => {
        const updated = { ...setting, enabled: !setting.enabled };
        handleUpdateSetting(updated);
    };

    // Update interval
    const handleUpdateInterval = (setting: LoggingSettings, newInterval: number) => {
        if (newInterval < 1 || newInterval > 1440) {
            showSnackbar('Interval must be between 1 and 1440 minutes', 'warning');
            return;
        }
        const updated = { ...setting, logIntervalMinutes: newInterval };
        handleUpdateSetting(updated);
    };

    // Get the current value for a field (either from editing state or actual setting)
    const getFieldValue = (settingId: number, field: string, defaultValue: number): number => {
        const key = `${settingId}_${field}`;
        return editingValues[key] !== undefined ? editingValues[key] : defaultValue;
    };

    // Handle text field change (updates local state only)
    const handleFieldChange = (settingId: number, field: string, value: string) => {
        const key = `${settingId}_${field}`;
        const numValue = parseInt(value) || 0;
        setEditingValues(prev => ({ ...prev, [key]: numValue }));
    };

    // Handle text field blur (commits the change)
    const handleFieldBlur = (setting: LoggingSettings, field: string, min: number, max: number) => {
        const key = `${setting.id}_${field}`;
        const value = editingValues[key];

        if (value === undefined) return; // No changes made

        // Clear the editing state
        setEditingValues(prev => {
            const newState = { ...prev };
            delete newState[key];
            return newState;
        });

        // Validate
        if (value < min || value > max) {
            showSnackbar(`Value must be between ${min} and ${max}`, 'warning');
            return;
        }

        // Update the setting
        const updated = { ...setting, [field]: value };
        handleUpdateSetting(updated);
    };

    // Download log file
    const handleDownloadLog = async () => {
        try {
            const response = await fetch('/api/Controller_LoggingSettings/blit-mode/download-log');
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `blit_resources_${new Date().toISOString().split('T')[0]}.log`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                showSnackbar('Log file downloaded', 'success');
            } else {
                showSnackbar('Log file not found or unavailable', 'error');
            }
        } catch (error) {
            console.error('Failed to download log:', error);
            showSnackbar('Failed to download log file', 'error');
        }
    };

    // Trigger manual snapshot
    const handleManualSnapshot = async (category: string) => {
        try {
            const endpoint = category === 'BlitMode'
                ? '/api/Controller_LoggingSettings/blit-mode/snapshot'
                : '/api/Controller_LoggingSettings/stream-history/snapshot';

            const response = await fetch(endpoint, {
                method: 'POST'
            });
            if (response.ok) {
                showSnackbar('Manual snapshot triggered successfully', 'success');
                // Give the file system a moment to update before refreshing
                await new Promise(resolve => setTimeout(resolve, 500));
                await fetchBlitModeStatus();
                await fetchStreamHistoryStatus();
                await fetchLogDirectoryInfo();
            } else {
                const data = await response.json();
                showSnackbar(data.message || 'Failed to trigger snapshot', 'error');
            }
        } catch (error) {
            console.error('Failed to trigger snapshot:', error);
            showSnackbar('Failed to trigger snapshot', 'error');
        }
    };

    // Cleanup all logs
    const handleCleanupAll = async () => {
        try {
            const response = await fetch('/api/Controller_LoggingSettings/logs/cleanup-all', {
                method: 'POST'
            });
            if (response.ok) {
                const result = await response.json();
                showSnackbar(`Cleaned up ${result.filesDeleted} files, freed ${formatBytes(result.bytesFreed)}`, 'success');
                await fetchLogDirectoryInfo();
            } else {
                showSnackbar('Cleanup failed', 'error');
            }
        } catch (error) {
            console.error('Failed to cleanup logs:', error);
            showSnackbar('Failed to cleanup logs', 'error');
        }
    };

    // Download specific log file
    const handleDownloadFile = async (fileName: string) => {
        try {
            const response = await fetch(`/api/Controller_LoggingSettings/logs/download/${fileName}`);
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                showSnackbar('Log file downloaded', 'success');
            } else {
                showSnackbar('Failed to download log file', 'error');
            }
        } catch (error) {
            console.error('Failed to download log:', error);
            showSnackbar('Failed to download log file', 'error');
        }
    };

    // Delete specific log file
    const handleDeleteFile = async (fileName: string) => {
        if (!window.confirm(`Are you sure you want to delete ${fileName}?`)) {
            return;
        }
        try {
            const response = await fetch(`/api/Controller_LoggingSettings/logs/delete/${fileName}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showSnackbar('Log file deleted', 'success');
                await fetchLogDirectoryInfo();
            } else {
                showSnackbar('Failed to delete log file', 'error');
            }
        } catch (error) {
            console.error('Failed to delete log:', error);
            showSnackbar('Failed to delete log file', 'error');
        }
    };

    // Format bytes to human readable
    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    // Format date
    const formatDate = (dateString?: string): string => {
        if (!dateString) return 'Never';
        const date = new Date(dateString);
        return date.toLocaleString();
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box>
            <Typography variant="body2" color="text.secondary" mb={3}>
                Configure diagnostic logging for troubleshooting and performance monitoring.
            </Typography>

            {/* Logging Settings Table */}
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Category</TableCell>
                            <TableCell>Enabled</TableCell>
                            <TableCell>Interval (min)</TableCell>
                            <TableCell>Retention (days)</TableCell>
                            <TableCell>Max Size per File (MB)</TableCell>
                            <TableCell>Auto Cleanup</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell>Log File Size</TableCell>
                            <TableCell>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loggingSettings.map((setting) => (
                            <TableRow key={setting.id}>
                                <TableCell>
                                    <Chip
                                        label={setting.category}
                                        size="small"
                                        color={setting.enabled ? 'primary' : 'default'}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Switch
                                        checked={setting.enabled}
                                        onChange={() => handleToggleEnabled(setting)}
                                        disabled={savingCategory === setting.category}
                                        size="small"
                                    />
                                </TableCell>
                                <TableCell>
                                    <TextField
                                        type="number"
                                        value={getFieldValue(setting.id, 'logIntervalMinutes', setting.logIntervalMinutes)}
                                        onChange={(e) => handleFieldChange(setting.id, 'logIntervalMinutes', e.target.value)}
                                        onBlur={() => handleFieldBlur(setting, 'logIntervalMinutes', 1, 1440)}
                                        disabled={savingCategory === setting.category || !setting.enabled}
                                        size="small"
                                        sx={{ width: 100 }}
                                        inputProps={{ min: 1, max: 1440 }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <TextField
                                        type="number"
                                        value={getFieldValue(setting.id, 'maxLogRetentionDays', setting.maxLogRetentionDays)}
                                        onChange={(e) => handleFieldChange(setting.id, 'maxLogRetentionDays', e.target.value)}
                                        onBlur={() => handleFieldBlur(setting, 'maxLogRetentionDays', 1, 365)}
                                        disabled={savingCategory === setting.category || !setting.enabled}
                                        size="small"
                                        sx={{ width: 80 }}
                                        inputProps={{ min: 1, max: 365 }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <TextField
                                        type="number"
                                        value={getFieldValue(setting.id, 'maxLogFileSizeMB', setting.maxLogFileSizeMB)}
                                        onChange={(e) => handleFieldChange(setting.id, 'maxLogFileSizeMB', e.target.value)}
                                        onBlur={() => handleFieldBlur(setting, 'maxLogFileSizeMB', 1, 1000)}
                                        disabled={savingCategory === setting.category || !setting.enabled}
                                        size="small"
                                        sx={{ width: 80 }}
                                        inputProps={{ min: 1, max: 1000 }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Switch
                                        checked={setting.autoCleanupEnabled}
                                        onChange={() => handleUpdateSetting({...setting, autoCleanupEnabled: !setting.autoCleanupEnabled})}
                                        disabled={savingCategory === setting.category || !setting.enabled}
                                        size="small"
                                    />
                                </TableCell>
                                <TableCell>
                                    {(setting.category === 'BlitMode' || setting.category === 'StreamHistory') && setting.enabled ? (
                                        <Chip
                                            label="Active"
                                            color="success"
                                            size="small"
                                        />
                                    ) : (
                                        <Box display="flex" flexDirection="column" gap={0.5}>
                                            <Typography variant="body2" color="text.secondary">
                                                {formatDate(setting.lastLoggedAt)}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                Cleaned: {formatDate(setting.lastCleanupAt)}
                                            </Typography>
                                        </Box>
                                    )}
                                </TableCell>
                                <TableCell>
                                    {setting.category === 'BlitMode' && blitModeStatus ? (
                                        <Typography variant="body2">
                                            {formatBytes(blitModeStatus.logFileSizeBytes)}
                                        </Typography>
                                    ) : setting.category === 'StreamHistory' && streamHistoryStatus ? (
                                        <Typography variant="body2">
                                            {formatBytes(streamHistoryStatus.logFileSizeBytes)}
                                        </Typography>
                                    ) : (
                                        <Typography variant="caption" color="text.secondary">—</Typography>
                                    )}
                                </TableCell>
                                <TableCell>
                                    {(setting.category === 'BlitMode' || setting.category === 'StreamHistory') && setting.enabled ? (
                                        <Tooltip title="Trigger Snapshot">
                                            <IconButton
                                                size="small"
                                                onClick={() => handleManualSnapshot(setting.category)}
                                                disabled={setting.category === 'BlitMode' && (!blitModeStatus || !blitModeStatus.isMonitoring)}
                                                color="primary"
                                            >
                                                <CameraAltIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    ) : (
                                        <Typography variant="caption" color="text.secondary">—</Typography>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Log Files Browser */}
            {logDirectoryInfo && (
                <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                        <Typography variant="subtitle2">
                            Log Files ({logDirectoryInfo.totalFiles} files, {formatBytes(logDirectoryInfo.totalSizeBytes)})
                        </Typography>
                        <Box display="flex" gap={1}>
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<CleaningServicesIcon />}
                                onClick={handleCleanupAll}
                            >
                                Cleanup Old Logs
                            </Button>
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<RefreshIcon />}
                                onClick={fetchLogDirectoryInfo}
                            >
                                Refresh
                            </Button>
                        </Box>
                    </Box>

                    {logDirectoryInfo.files.length > 0 ? (
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>File Name</TableCell>
                                        <TableCell>Category</TableCell>
                                        <TableCell>Size</TableCell>
                                        <TableCell>Last Modified</TableCell>
                                        <TableCell align="right">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {logDirectoryInfo.files.map((file) => (
                                        <TableRow key={file.fileName}>
                                            <TableCell>
                                                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                    {file.fileName}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip label={file.category} size="small" />
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {formatBytes(file.sizeBytes)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" color="text.secondary">
                                                    {formatDate(file.lastModified)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Tooltip title="Download">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => handleDownloadFile(file.fileName)}
                                                    >
                                                        <DownloadIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Delete">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => handleDeleteFile(file.fileName)}
                                                        color="error"
                                                    >
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    ) : (
                        <Typography variant="body2" color="text.secondary" textAlign="center" py={2}>
                            No log files found
                        </Typography>
                    )}
                </Paper>
            )}

            {/* Help Text */}
            <Paper variant="outlined" sx={{ p: 2, backgroundColor: 'action.hover' }}>
                <Typography variant="body2" color="text.secondary">
                    • <strong>Retention:</strong> Configure how long to keep logs (days) before automatic deletion
                    <br />
                    • <strong>Max Size per File:</strong> When a log file reaches this size, it will be rotated (renamed with a sequence number) and a new file will be created
                    <br />
                    • <strong>Auto Cleanup:</strong> Automatically removes logs older than the retention period on startup
                    <br />
                    • Logs are saved to the <code>logs/</code> directory with daily rotation
                    <br />
                    • Changing settings will restart monitoring with new configuration
                    <br />
                    • Manual snapshots and cleanup can be triggered at any time
                </Typography>
            </Paper>

            {/* Snackbar for notifications */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={handleSnackbarClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert onClose={handleSnackbarClose} severity={snackbar.severity} sx={{ width: '100%' }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default Settings_DebugLogging;
