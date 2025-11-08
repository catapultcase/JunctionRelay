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

import React, { useState, useEffect, useMemo } from 'react';
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
    Tooltip,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    TablePagination,
    TableSortLabel
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import BugReportIcon from '@mui/icons-material/BugReport';
import DeleteIcon from '@mui/icons-material/Delete';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
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

// Event-driven categories that don't use interval-based logging
const EVENT_DRIVEN_CATEGORIES = ['LoginAndAuthentication'];

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

    // File list filtering, sorting, and pagination
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [orderBy, setOrderBy] = useState<keyof LogFileInfo>('lastModified');
    const [order, setOrder] = useState<'asc' | 'desc'>('desc');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);

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

    // View log file in new window
    const handleViewFile = async (fileName: string) => {
        try {
            const response = await fetch(`/api/Controller_LoggingSettings/logs/download/${fileName}`);
            if (response.ok) {
                const text = await response.text();
                const newWindow = window.open('', '_blank');
                if (newWindow) {
                    newWindow.document.write(`
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <title>${fileName}</title>
                            <style>
                                body {
                                    margin: 0;
                                    padding: 20px;
                                    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                                    font-size: 12px;
                                    line-height: 1.5;
                                    background: #1e1e1e;
                                    color: #d4d4d4;
                                }
                                pre {
                                    margin: 0;
                                    white-space: pre-wrap;
                                    word-wrap: break-word;
                                }
                            </style>
                        </head>
                        <body>
                            <pre>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                        </body>
                        </html>
                    `);
                    newWindow.document.close();
                } else {
                    showSnackbar('Failed to open new window. Please allow pop-ups.', 'warning');
                }
            } else {
                showSnackbar('Failed to load log file', 'error');
            }
        } catch (error) {
            console.error('Failed to view log:', error);
            showSnackbar('Failed to view log file', 'error');
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

    // Delete all log files
    const handleDeleteAllFiles = async () => {
        if (!window.confirm('Are you sure you want to delete ALL log files? This action cannot be undone.')) {
            return;
        }
        try {
            const deletePromises = logDirectoryInfo?.files.map(file =>
                fetch(`/api/Controller_LoggingSettings/logs/delete/${file.fileName}`, { method: 'DELETE' })
            ) || [];

            await Promise.all(deletePromises);
            showSnackbar('All log files deleted', 'success');
            await fetchLogDirectoryInfo();
        } catch (error) {
            console.error('Failed to delete all logs:', error);
            showSnackbar('Failed to delete all log files', 'error');
        }
    };

    // Get unique categories from logging settings (so all configured categories show even without files)
    const categories = useMemo(() => {
        if (loggingSettings.length === 0) return [];
        const configuredCategories = loggingSettings.map(s => s.category).sort();

        // Also include any file categories that might not be in settings (for legacy/unknown files)
        if (logDirectoryInfo) {
            const fileCategories = Array.from(new Set(logDirectoryInfo.files.map(f => f.category)));
            const additionalCategories = fileCategories.filter(cat => !configuredCategories.includes(cat));
            return [...configuredCategories, ...additionalCategories.sort()];
        }

        return configuredCategories;
    }, [loggingSettings, logDirectoryInfo]);

    // Handle sort request
    const handleRequestSort = (property: keyof LogFileInfo) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    // Filter and sort files
    const filteredAndSortedFiles = useMemo(() => {
        if (!logDirectoryInfo) return [];

        let files = [...logDirectoryInfo.files];

        // Apply category filter
        if (categoryFilter !== 'all') {
            files = files.filter(f => f.category === categoryFilter);
        }

        // Apply sorting
        files.sort((a, b) => {
            let aValue = a[orderBy];
            let bValue = b[orderBy];

            // Handle date sorting
            if (orderBy === 'lastModified' || orderBy === 'createdAt') {
                aValue = new Date(aValue as string).getTime();
                bValue = new Date(bValue as string).getTime();
            }

            // Handle number sorting
            if (orderBy === 'sizeBytes') {
                aValue = aValue as number;
                bValue = bValue as number;
            }

            if (aValue < bValue) {
                return order === 'asc' ? -1 : 1;
            }
            if (aValue > bValue) {
                return order === 'asc' ? 1 : -1;
            }
            return 0;
        });

        return files;
    }, [logDirectoryInfo, categoryFilter, orderBy, order]);

    // Paginated files
    const paginatedFiles = useMemo(() => {
        return filteredAndSortedFiles.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
    }, [filteredAndSortedFiles, page, rowsPerPage]);

    // Handle page change
    const handleChangePage = (event: unknown, newPage: number) => {
        setPage(newPage);
    };

    // Handle rows per page change
    const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
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
                                        disabled={savingCategory === setting.category || !setting.enabled || EVENT_DRIVEN_CATEGORIES.includes(setting.category)}
                                        size="small"
                                        sx={{ width: 100 }}
                                        inputProps={{ min: 1, max: 1440 }}
                                        helperText={EVENT_DRIVEN_CATEGORIES.includes(setting.category) ? "Event-driven" : undefined}
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
                            Log Files ({filteredAndSortedFiles.length} of {logDirectoryInfo.totalFiles} files, {formatBytes(logDirectoryInfo.totalSizeBytes)})
                        </Typography>
                        <Box display="flex" gap={1}>
                            <Button
                                variant="outlined"
                                size="small"
                                color="error"
                                startIcon={<DeleteSweepIcon />}
                                onClick={handleDeleteAllFiles}
                                disabled={logDirectoryInfo.files.length === 0}
                            >
                                Delete All
                            </Button>
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

                    {/* Category Filter */}
                    <Box mb={2}>
                        <FormControl size="small" sx={{ minWidth: 200 }}>
                            <InputLabel>Filter by Category</InputLabel>
                            <Select
                                value={categoryFilter}
                                label="Filter by Category"
                                onChange={(e) => {
                                    setCategoryFilter(e.target.value);
                                    setPage(0); // Reset to first page when filtering
                                }}
                            >
                                <MenuItem value="all">All Categories</MenuItem>
                                {categories.map(cat => (
                                    <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>

                    {logDirectoryInfo.files.length > 0 ? (
                        <>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>
                                                <TableSortLabel
                                                    active={orderBy === 'fileName'}
                                                    direction={orderBy === 'fileName' ? order : 'asc'}
                                                    onClick={() => handleRequestSort('fileName')}
                                                >
                                                    File Name
                                                </TableSortLabel>
                                            </TableCell>
                                            <TableCell>
                                                <TableSortLabel
                                                    active={orderBy === 'category'}
                                                    direction={orderBy === 'category' ? order : 'asc'}
                                                    onClick={() => handleRequestSort('category')}
                                                >
                                                    Category
                                                </TableSortLabel>
                                            </TableCell>
                                            <TableCell>
                                                <TableSortLabel
                                                    active={orderBy === 'sizeBytes'}
                                                    direction={orderBy === 'sizeBytes' ? order : 'asc'}
                                                    onClick={() => handleRequestSort('sizeBytes')}
                                                >
                                                    Size
                                                </TableSortLabel>
                                            </TableCell>
                                            <TableCell>
                                                <TableSortLabel
                                                    active={orderBy === 'lastModified'}
                                                    direction={orderBy === 'lastModified' ? order : 'asc'}
                                                    onClick={() => handleRequestSort('lastModified')}
                                                >
                                                    Last Modified
                                                </TableSortLabel>
                                            </TableCell>
                                            <TableCell align="right">Actions</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {paginatedFiles.map((file) => (
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
                                                <Tooltip title="View in Browser">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => handleViewFile(file.fileName)}
                                                        color="primary"
                                                    >
                                                        <OpenInNewIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
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
                        <TablePagination
                            rowsPerPageOptions={[5, 10, 25, 50, 100]}
                            component="div"
                            count={filteredAndSortedFiles.length}
                            rowsPerPage={rowsPerPage}
                            page={page}
                            onPageChange={handleChangePage}
                            onRowsPerPageChange={handleChangeRowsPerPage}
                        />
                    </>
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
