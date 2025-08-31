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
    Box, Typography, Button, FormControlLabel, Switch, Checkbox,
    CircularProgress, Paper, Chip, Divider, Table, TableContainer,
    TableHead, TableRow, TableCell, TableBody, List, ListItem,
    LinearProgress, Select, MenuItem, FormControl, InputLabel, Alert,
    TablePagination
} from "@mui/material";
import { AlertColor } from "@mui/material/Alert";
import CloudIcon from '@mui/icons-material/Cloud';
import BackupIcon from '@mui/icons-material/Backup';
import RestoreIcon from '@mui/icons-material/Restore';
import DeleteIcon from '@mui/icons-material/Delete';
import SettingsIcon from '@mui/icons-material/Settings';
import InfoIcon from '@mui/icons-material/Info';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import DownloadIcon from '@mui/icons-material/Download';

interface CloudUserInfo {
    email?: string;
    userId?: string;
    hasValidLicense: boolean;
    message?: string;
}

interface BackupSettings {
    enabled: boolean;
    frequency: 'daily' | 'weekly' | 'monthly';
    retentionDays: number;
    lastBackup?: Date;
    includeKeys?: boolean;
    includeIdentity?: boolean;
    includeFrameEngine?: boolean;
}

interface BackupUsage {
    backupCount: number;
    totalStorageUsed: number;
    totalUncompressedSize: number;
    pendingCount: number;
    completedCount: number;
    failedCount: number;
    maxStorageLimit: number;
    maxBackupLimit: number;
    maxSingleBackupSize: number;
}

interface BackupRecord {
    id: string;
    filename: string;
    status: 'pending' | 'completed' | 'failed';
    compressedSize: number;
    uncompressedSize: number;
    createdAt: Date;
    expiresAt?: Date;
    backendId: string;
    clerkUserId: string;
    s3Key: string;
}

interface BackendInfo {
    backendId: string;
    friendlyName?: string;
}

interface SettingsBackupsProps {
    showSnackbar: (message: string, severity?: AlertColor) => void;
    isMobile?: boolean;
    cloudUserInfo: CloudUserInfo | null;
    backendId?: string;
}

const Settings_CloudBackups: React.FC<SettingsBackupsProps> = ({
    showSnackbar,
    isMobile = false,
    cloudUserInfo,
}) => {
    const [loading, setLoading] = useState<boolean>(true);
    const [backupSettings, setBackupSettings] = useState<BackupSettings | null>(null);
    const [backupUsage, setBackupUsage] = useState<BackupUsage | null>(null);
    const [backups, setBackups] = useState<BackupRecord[]>([]);
    const [backendInfos, setBackendInfos] = useState<Map<string, BackendInfo>>(new Map());
    const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
    const [savingSettings, setSavingSettings] = useState<boolean>(false);
    const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
    const [showAllBackends, setShowAllBackends] = useState<boolean>(false);
    const [backendId, setBackendId] = useState<string | null>(null);
    const [page, setPage] = useState<number>(0);
    const [rowsPerPage] = useState<number>(7);

    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDate = (date: Date): string => {
        return new Date(date).toLocaleString();
    };

    const formatBackendName = (backendId: string): string => {
        const backendInfo = backendInfos.get(backendId);
        if (backendInfo?.friendlyName && backendInfo.friendlyName.trim()) {
            return backendInfo.friendlyName;
        }
        return backendId.substring(0, 5) + '...';
    };

    const calculateEstimatedUsage = (): { estimatedSize: number, averageSize: number } => {
        if (!backups.length || !backupSettings) {
            return { estimatedSize: 0, averageSize: 0 };
        }

        // Calculate average size of completed backups
        const completedBackups = backups.filter(backup => backup.status === 'completed');
        if (!completedBackups.length) {
            return { estimatedSize: 0, averageSize: 0 };
        }

        const totalSize = completedBackups.reduce((sum, backup) => sum + backup.compressedSize, 0);
        const averageSize = totalSize / completedBackups.length;

        // Calculate how many backups would be retained based on frequency and retention
        let backupsPerRetentionPeriod = 0;
        const retentionDays = backupSettings.retentionDays;

        switch (backupSettings.frequency) {
            case 'daily':
                backupsPerRetentionPeriod = retentionDays;
                break;
            case 'weekly':
                backupsPerRetentionPeriod = Math.ceil(retentionDays / 7);
                break;
            case 'monthly':
                backupsPerRetentionPeriod = Math.ceil(retentionDays / 30);
                break;
        }

        const estimatedSize = averageSize * backupsPerRetentionPeriod;
        return { estimatedSize, averageSize };
    };

    const sortBackupsByDate = (backups: BackupRecord[]) => {
        return [...backups].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    };

    const fetchBackendInfos = async (backupRecords: BackupRecord[]) => {
        // Get unique backend IDs from the backup records
        const uniqueBackendIds = [...new Set(backupRecords.map(backup => backup.backendId))];
        const newBackendInfos = new Map<string, BackendInfo>();

        // Fetch info for each unique backend ID
        for (const backendId of uniqueBackendIds) {
            try {
                // Check if we already have this backend info cached
                if (backendInfos.has(backendId)) {
                    newBackendInfos.set(backendId, backendInfos.get(backendId)!);
                    continue;
                }

                // For now, we'll use the cloud backups API to get backend info
                // This assumes the API can return friendly names for different backends
                const cloudToken = localStorage.getItem('cloud_proxy_token');
                if (cloudToken) {
                    try {
                        const response = await fetch(`/api/cloud-backups/backend-info/${backendId}`, {
                            headers: {
                                'Authorization': `Bearer ${cloudToken}`,
                                'Content-Type': 'application/json'
                            }
                        });

                        if (response.ok) {
                            const data = await response.json();
                            newBackendInfos.set(backendId, {
                                backendId: backendId,
                                friendlyName: data.friendlyName
                            });
                        } else {
                            // Fallback: just store the backend ID without friendly name
                            newBackendInfos.set(backendId, { backendId: backendId });
                        }
                    } catch (error) {
                        // Fallback: just store the backend ID without friendly name
                        newBackendInfos.set(backendId, { backendId: backendId });
                    }
                } else {
                    // No token, just store the backend ID
                    newBackendInfos.set(backendId, { backendId: backendId });
                }
            } catch (error) {
                // Fallback: just store the backend ID without friendly name
                newBackendInfos.set(backendId, { backendId: backendId });
            }
        }

        setBackendInfos(newBackendInfos);
    };

    const fetchBackendIdentity = async () => {
        try {
            const res = await fetch("/api/db/backend-identity");
            if (res.ok) {
                const data = await res.json();
                setBackendId(data.backendId);
            }
        } catch (err) {
            console.error("Error loading backend identity:", err);
        }
    };

    const fetchBackupStatus = async () => {
        if (!cloudUserInfo?.hasValidLicense) return;

        try {
            const cloudToken = localStorage.getItem('cloud_proxy_token');
            if (!cloudToken) return;

            const response = await fetch('/api/cloud-backups/status', {
                headers: {
                    'Authorization': `Bearer ${cloudToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                setBackupSettings(data.settings);
                setBackupUsage(data.usage);
            } else if (response.status === 403) {
                showSnackbar("Cloud backups require a valid Pro license", "error");
            }
        } catch (error) {
            console.error('Error fetching backup status:', error);
        }
    };

    const fetchBackups = async () => {
        if (!cloudUserInfo?.hasValidLicense) return;

        try {
            const cloudToken = localStorage.getItem('cloud_proxy_token');
            if (!cloudToken) return;

            const response = await fetch('/api/cloud-backups/list?limit=50', {
                headers: {
                    'Authorization': `Bearer ${cloudToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                const sortedBackups = sortBackupsByDate(data.backups || []);
                setBackups(sortedBackups);
                setPage(0); // Reset to first page when data changes

                // Fetch backend info for the backups
                await fetchBackendInfos(sortedBackups);
            }
        } catch (error) {
            console.error('Error fetching backups:', error);
        }
    };

    const updateBackupSettings = async (newSettings: Partial<BackupSettings>) => {
        if (!cloudUserInfo?.hasValidLicense) return;

        try {
            setSavingSettings(true);
            const cloudToken = localStorage.getItem('cloud_proxy_token');
            if (!cloudToken) throw new Error('Not authenticated');

            const response = await fetch('/api/cloud-backups/settings', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${cloudToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ...backupSettings, ...newSettings })
            });

            if (response.ok) {
                setBackupSettings(prev => ({ ...prev!, ...newSettings }));
                showSnackbar('Backup settings updated successfully', 'success');
                fetchBackupStatus(); // Refresh the full status
            } else {
                throw new Error('Failed to update settings');
            }
        } catch (error: any) {
            showSnackbar(error.message || 'Error updating backup settings', 'error');
        } finally {
            setSavingSettings(false);
        }
    };

    const createBackup = async () => {
        if (!cloudUserInfo?.hasValidLicense) return;

        try {
            setIsBackingUp(true);
            const cloudToken = localStorage.getItem('cloud_proxy_token');
            if (!cloudToken) throw new Error('Not authenticated');

            // Create backup using the dedicated cloud backup endpoint
            const backupResponse = await fetch('/api/cloud-backups/create', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${cloudToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    includeKeys: backupSettings?.includeKeys !== false,
                    includeIdentity: backupSettings?.includeIdentity !== false,
                    includeFrameEngine: backupSettings?.includeFrameEngine || false
                })
            });

            if (!backupResponse.ok) {
                const error = await backupResponse.json();
                throw new Error(error.error || 'Failed to create cloud backup');
            }

            const result = await backupResponse.json();

            if (result.success) {
                showSnackbar('Backup created and uploaded to cloud successfully', 'success');
                fetchBackups();
                fetchBackupStatus();
            } else {
                throw new Error(result.message || 'Failed to complete backup');
            }
        } catch (error: any) {
            showSnackbar(error.message || 'Error creating cloud backup', 'error');
        } finally {
            setIsBackingUp(false);
        }
    };

    const downloadBackup = async (backupId: string) => {
        if (!cloudUserInfo?.hasValidLicense) return;

        try {
            const cloudToken = localStorage.getItem('cloud_proxy_token');
            if (!cloudToken) throw new Error('Not authenticated');

            // Use the proxied download endpoint instead of direct S3 access
            const response = await fetch(`/api/cloud-backups/${backupId}/download`, {
                headers: {
                    'Authorization': `Bearer ${cloudToken}`,
                }
            });

            if (!response.ok) {
                throw new Error('Failed to download backup');
            }

            // Get filename from response headers or use a default
            const contentDisposition = response.headers.get('content-disposition');
            let filename = `backup_${backupId}.zip`;
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

            showSnackbar('Backup downloaded successfully', 'success');
        } catch (error: any) {
            showSnackbar(error.message || 'Error downloading backup', 'error');
        }
    };

    const deleteBackup = async (backupId: string) => {
        if (!cloudUserInfo?.hasValidLicense) return;

        try {
            const cloudToken = localStorage.getItem('cloud_proxy_token');
            if (!cloudToken) throw new Error('Not authenticated');

            const response = await fetch(`/api/cloud-backups/${backupId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${cloudToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                showSnackbar('Backup deleted successfully', 'success');
                fetchBackups();
                fetchBackupStatus();
            } else {
                throw new Error('Failed to delete backup');
            }
        } catch (error: any) {
            showSnackbar(error.message || 'Error deleting backup', 'error');
        }
    };

    const handleChangePage = (event: unknown, newPage: number) => {
        setPage(newPage);
    };

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            if (cloudUserInfo?.hasValidLicense) {
                await Promise.all([
                    fetchBackupStatus(),
                    fetchBackups(),
                    fetchBackendIdentity()
                ]);
            } else {
                // Still fetch backend ID even without license for potential future use
                await fetchBackendIdentity();
            }
            setLoading(false);
        };
        loadData();
    }, [cloudUserInfo]);

    // Filter backups by backend ID if not showing all backends
    const filteredBackups = showAllBackends || !backendId ? backups :
        backups.filter(backup => backup.backendId === backendId);

    // Paginate the filtered backups
    const paginatedBackups = filteredBackups.slice(
        page * rowsPerPage,
        page * rowsPerPage + rowsPerPage
    );

    // Show license requirement message if not licensed
    if (!cloudUserInfo?.hasValidLicense) {
        return (
            <Box>
                <Alert severity="info" sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CloudIcon />
                        <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                            Cloud Backups - Pro Feature
                        </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ mt: 1 }}>
                        Secure cloud backups require a valid JunctionRelay Pro license.
                        {!cloudUserInfo && " Please authenticate with JunctionRelay Cloud first."}
                    </Typography>
                </Alert>
            </Box>
        );
    }

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress />
            </Box>
        );
    }

    // Storage usage percentage
    const storagePercentage = backupUsage ?
        Math.round((backupUsage.totalStorageUsed / backupUsage.maxStorageLimit) * 100) : 0;

    // Backup count percentage
    const backupCountPercentage = backupUsage ?
        Math.round((backupUsage.backupCount / backupUsage.maxBackupLimit) * 100) : 0;

    return (
        <>
            {/* Status Overview */}
            <Box sx={{ mb: 3 }}>
                <Box sx={{
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    gap: 2
                }}>
                    {/* Backup Status */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center' }}>
                            <CloudIcon sx={{ mr: 1, fontSize: 16 }} />
                            Backup Status
                        </Typography>
                        <Box sx={{
                            p: 2,
                            bgcolor: 'rgba(0, 0, 0, 0.02)',
                            borderRadius: 1,
                            border: '1px solid rgba(0, 0, 0, 0.05)',
                        }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                {backupSettings?.enabled ? (
                                    <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
                                ) : (
                                    <ErrorIcon sx={{ fontSize: 16, color: 'error.main' }} />
                                )}
                                <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                    {backupSettings?.enabled ? 'Active' : 'Disabled'}
                                </Typography>
                            </Box>
                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                                Frequency: {backupSettings?.frequency || 'N/A'}<br />
                                Retention: {backupSettings?.retentionDays || 30} days<br />
                                Last backup: {backupSettings?.lastBackup ?
                                    formatDate(new Date(backupSettings.lastBackup)) : 'Never'}<br />
                                Components: {(() => {
                                    const components = [];
                                    if (backupSettings?.includeKeys !== false) components.push('Keys');
                                    if (backupSettings?.includeIdentity !== false) components.push('Identity');
                                    if (backupSettings?.includeFrameEngine) components.push('Frame Engine');
                                    return components.length > 0 ? components.join(', ') : 'Database only';
                                })()}
                            </Typography>
                        </Box>
                    </Box>

                    {/* Usage Statistics */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center' }}>
                            <InfoIcon sx={{ mr: 1, fontSize: 16 }} />
                            Usage Statistics (All Backends)
                        </Typography>
                        <Box sx={{
                            p: 2,
                            bgcolor: 'rgba(0, 0, 0, 0.02)',
                            borderRadius: 1,
                            border: '1px solid rgba(0, 0, 0, 0.05)',
                        }}>
                            {backupUsage && (
                                <>
                                    <Box sx={{ mb: 2 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                                                Storage Used
                                            </Typography>
                                            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                                                {formatFileSize(backupUsage.totalStorageUsed)} / {formatFileSize(backupUsage.maxStorageLimit)}
                                            </Typography>
                                        </Box>
                                        <LinearProgress
                                            variant="determinate"
                                            value={Math.min(storagePercentage, 100)}
                                            color={storagePercentage > 90 ? 'error' : storagePercentage > 75 ? 'warning' : 'primary'}
                                            sx={{ height: 6, borderRadius: 3 }}
                                        />
                                    </Box>
                                    <Box sx={{ mb: 2 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                                                Backups
                                            </Typography>
                                            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                                                {backupUsage.backupCount} / {backupUsage.maxBackupLimit}
                                            </Typography>
                                        </Box>
                                        <LinearProgress
                                            variant="determinate"
                                            value={Math.min(backupCountPercentage, 100)}
                                            color={backupCountPercentage > 90 ? 'error' : backupCountPercentage > 75 ? 'warning' : 'primary'}
                                            sx={{ height: 6, borderRadius: 3 }}
                                        />
                                    </Box>
                                    {(() => {
                                        const { estimatedSize, averageSize } = calculateEstimatedUsage();
                                        const estimatedPercentage = backupUsage.maxStorageLimit > 0 ?
                                            Math.round((estimatedSize / backupUsage.maxStorageLimit) * 100) : 0;

                                        return estimatedSize > 0 && backupSettings?.enabled ? (
                                            <Box>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                                                        Estimated Usage (This Backend)
                                                    </Typography>
                                                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                                                        {formatFileSize(estimatedSize)} / {formatFileSize(backupUsage.maxStorageLimit)}
                                                    </Typography>
                                                </Box>
                                                <LinearProgress
                                                    variant="determinate"
                                                    value={Math.min(estimatedPercentage, 100)}
                                                    color={estimatedPercentage > 90 ? 'error' : estimatedPercentage > 75 ? 'warning' : 'info'}
                                                    sx={{ height: 6, borderRadius: 3, opacity: 0.7 }}
                                                />
                                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', mt: 0.5, display: 'block' }}>
                                                    Based on {formatFileSize(averageSize)} avg × {backupSettings.frequency} × {backupSettings.retentionDays}d retention
                                                </Typography>
                                            </Box>
                                        ) : null;
                                    })()}
                                </>
                            )}
                        </Box>
                    </Box>
                </Box>
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Backup Settings and Backup History */}
            <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 3 }}>
                {/* Backup Settings */}
                <Box sx={{ flex: isMobile ? 1 : 0.4, minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                        <SettingsIcon sx={{ mr: 1, fontSize: 16 }} />
                        Backup Settings
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={backupSettings?.enabled || false}
                                    onChange={(e) => updateBackupSettings({ enabled: e.target.checked })}
                                    disabled={savingSettings}
                                />
                            }
                            label="Enable automatic cloud backups"
                        />

                        {backupSettings?.enabled && (
                            <>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <FormControl size="small" sx={{ minWidth: 120 }}>
                                        <InputLabel>Frequency</InputLabel>
                                        <Select
                                            value={backupSettings.frequency}
                                            onChange={(e) => updateBackupSettings({
                                                frequency: e.target.value as 'daily' | 'weekly' | 'monthly'
                                            })}
                                            label="Frequency"
                                            disabled={savingSettings}
                                        >
                                            <MenuItem value="daily">Daily</MenuItem>
                                            <MenuItem value="weekly">Weekly</MenuItem>
                                            <MenuItem value="monthly">Monthly</MenuItem>
                                        </Select>
                                    </FormControl>

                                    <FormControl size="small" sx={{ minWidth: 140 }}>
                                        <InputLabel>Retention</InputLabel>
                                        <Select
                                            value={backupSettings.retentionDays}
                                            onChange={(e) => updateBackupSettings({ retentionDays: Number(e.target.value) })}
                                            label="Retention"
                                            disabled={savingSettings}
                                        >
                                            <MenuItem value={7}>7 days</MenuItem>
                                            <MenuItem value={30}>30 days</MenuItem>
                                            <MenuItem value={90}>90 days</MenuItem>
                                            <MenuItem value={365}>1 year</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Box>

                                <Box sx={{ mt: 2 }}>
                                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 'medium' }}>
                                        Backup Components:
                                    </Typography>

                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={backupSettings?.includeKeys !== false}
                                                onChange={(e) => updateBackupSettings({ includeKeys: e.target.checked })}
                                                disabled={savingSettings}
                                            />
                                        }
                                        label="Include encryption keys"
                                        sx={{ display: 'block', mb: 0.5 }}
                                    />

                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={backupSettings?.includeIdentity !== false}
                                                onChange={(e) => updateBackupSettings({ includeIdentity: e.target.checked })}
                                                disabled={savingSettings}
                                            />
                                        }
                                        label="Include backend identity"
                                        sx={{ display: 'block', mb: 0.5 }}
                                    />

                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={backupSettings?.includeFrameEngine || false}
                                                onChange={(e) => updateBackupSettings({ includeFrameEngine: e.target.checked })}
                                                disabled={savingSettings}
                                            />
                                        }
                                        label="Include Frame Engine files"
                                        sx={{ display: 'block', mb: 0.5 }}
                                    />
                                </Box>

                                <Box sx={{ mt: 2 }}>
                                    <Button
                                        variant="contained"
                                        startIcon={isBackingUp ? <CircularProgress size={16} /> : <BackupIcon />}
                                        onClick={createBackup}
                                        disabled={isBackingUp}
                                        size="small"
                                    >
                                        {isBackingUp ? 'Creating Backup...' : 'Create Backup Now'}
                                    </Button>
                                </Box>
                            </>
                        )}
                    </Box>
                </Box>

                {/* Backup History */}
                <Box sx={{ flex: isMobile ? 1 : 0.6, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <RestoreIcon sx={{ fontSize: 16 }} />
                            <Typography variant="subtitle2">
                                Backup History
                            </Typography>
                            <Chip
                                size="small"
                                label={`${filteredBackups.length}${!showAllBackends && filteredBackups.length !== backups.length ? ` of ${backups.length}` : ''} backups`}
                                sx={{ ml: 1 }}
                            />
                        </Box>
                        <FormControlLabel
                            control={
                                <Switch
                                    size="small"
                                    checked={showAllBackends}
                                    onChange={(e) => {
                                        setShowAllBackends(e.target.checked);
                                        setPage(0); // Reset to first page when filter changes
                                    }}
                                />
                            }
                            label="All backends"
                            sx={{ ml: 2 }}
                        />
                    </Box>

                    {filteredBackups.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                            {showAllBackends ? 'No backups found.' : 'No backups found for this backend.'} Create your first backup using the button above.
                        </Typography>
                    ) : isMobile ? (
                        <>
                            <List disablePadding>
                                {paginatedBackups.map((backup, index) => (
                                    <ListItem
                                        key={backup.id}
                                        sx={{
                                            flexDirection: 'column',
                                            alignItems: 'stretch',
                                            borderBottom: index < paginatedBackups.length - 1 ? '1px solid' : 'none',
                                            borderColor: 'divider',
                                            py: 2,
                                            px: 0
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', mb: 1 }}>
                                            <Box sx={{ flex: 1 }}>
                                                <Typography variant="subtitle2" sx={{ fontSize: '0.875rem' }}>
                                                    {formatDate(backup.createdAt)}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                                                    {showAllBackends ? `Backend: ${formatBackendName(backup.backendId)} • ` : ''}{formatFileSize(backup.compressedSize)}
                                                    {backup.expiresAt && ` • Expires ${formatDate(backup.expiresAt)}`}
                                                </Typography>
                                            </Box>
                                            <Chip
                                                label={backup.status}
                                                size="small"
                                                color={
                                                    backup.status === 'completed' ? 'success' :
                                                        backup.status === 'failed' ? 'error' : 'default'
                                                }
                                                sx={{ ml: 1 }}
                                            />
                                        </Box>

                                        {backup.status === 'completed' && (
                                            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    startIcon={<DownloadIcon />}
                                                    onClick={() => downloadBackup(backup.id)}
                                                >
                                                    Download
                                                </Button>
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    color="error"
                                                    startIcon={<DeleteIcon />}
                                                    onClick={() => deleteBackup(backup.id)}
                                                >
                                                    Delete
                                                </Button>
                                            </Box>
                                        )}
                                    </ListItem>
                                ))}
                            </List>
                            {filteredBackups.length > rowsPerPage && (
                                <TablePagination
                                    component="div"
                                    count={filteredBackups.length}
                                    page={page}
                                    onPageChange={handleChangePage}
                                    rowsPerPage={rowsPerPage}
                                    rowsPerPageOptions={[]}
                                    sx={{
                                        mt: 1,
                                        '& .MuiTablePagination-toolbar': {
                                            minHeight: 'auto',
                                            pl: 1,
                                            pr: 1
                                        }
                                    }}
                                />
                            )}
                        </>
                    ) : (
                        <>
                            <TableContainer component={Paper} variant="outlined">
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            {showAllBackends ? (
                                                <>
                                                    <TableCell sx={{ width: '22%' }}>Created</TableCell>
                                                    <TableCell sx={{ width: '18%' }}>Backend</TableCell>
                                                    <TableCell sx={{ width: '12%' }}>Status</TableCell>
                                                    <TableCell sx={{ width: '12%' }}>Size</TableCell>
                                                    <TableCell sx={{ width: '20%' }}>Expires</TableCell>
                                                    <TableCell align="right" sx={{ width: '16%' }}>Actions</TableCell>
                                                </>
                                            ) : (
                                                <>
                                                    <TableCell sx={{ width: '25%' }}>Created</TableCell>
                                                    <TableCell sx={{ width: '15%' }}>Status</TableCell>
                                                    <TableCell sx={{ width: '15%' }}>Size</TableCell>
                                                    <TableCell sx={{ width: '25%' }}>Expires</TableCell>
                                                    <TableCell align="right" sx={{ width: '20%' }}>Actions</TableCell>
                                                </>
                                            )}
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {paginatedBackups.map((backup) => (
                                            <TableRow key={backup.id}>
                                                <TableCell sx={{ fontSize: '0.875rem' }}>
                                                    {formatDate(backup.createdAt)}
                                                </TableCell>
                                                {showAllBackends && (
                                                    <TableCell sx={{ fontSize: '0.875rem', fontFamily: 'monospace' }}>
                                                        {formatBackendName(backup.backendId)}
                                                    </TableCell>
                                                )}
                                                <TableCell>
                                                    <Chip
                                                        label={backup.status}
                                                        size="small"
                                                        color={
                                                            backup.status === 'completed' ? 'success' :
                                                                backup.status === 'failed' ? 'error' : 'default'
                                                        }
                                                    />
                                                </TableCell>
                                                <TableCell sx={{ fontSize: '0.875rem' }}>
                                                    {formatFileSize(backup.compressedSize)}
                                                </TableCell>
                                                <TableCell sx={{ fontSize: '0.875rem' }}>
                                                    {backup.expiresAt ? formatDate(backup.expiresAt) : '—'}
                                                </TableCell>
                                                <TableCell align="right">
                                                    {backup.status === 'completed' && (
                                                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                                                            <Button
                                                                size="small"
                                                                variant="outlined"
                                                                startIcon={<DownloadIcon />}
                                                                onClick={() => downloadBackup(backup.id)}
                                                            >
                                                                Download
                                                            </Button>
                                                            <Button
                                                                size="small"
                                                                variant="outlined"
                                                                color="error"
                                                                startIcon={<DeleteIcon />}
                                                                onClick={() => deleteBackup(backup.id)}
                                                            >
                                                                Delete
                                                            </Button>
                                                        </Box>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                            {filteredBackups.length > rowsPerPage && (
                                <TablePagination
                                    component="div"
                                    count={filteredBackups.length}
                                    page={page}
                                    onPageChange={handleChangePage}
                                    rowsPerPage={rowsPerPage}
                                    rowsPerPageOptions={[]}
                                    sx={{ mt: 1 }}
                                />
                            )}
                        </>
                    )}
                </Box>
            </Box>

            {/* Information Box */}
            <Box sx={{
                mt: 3,
                p: 2,
                bgcolor: 'rgba(229, 246, 253, 0.8)',
                border: '1px solid rgba(3, 169, 244, 0.3)',
                borderRadius: 1
            }}>
                <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                    <InfoIcon sx={{ mr: 1, fontSize: 18 }} />
                    Cloud Backup Information
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    • Backups include your complete database, encryption keys, and backend identity<br />
                    • Optionally include Frame Engine configuration and data files<br />
                    • All data is encrypted in transit and at rest using industry-standard encryption<br />
                    • Automatic backups run according to your selected schedule<br />
                    • Storage usage and limits are shared across all your backends<br />
                    • You can restore backups by downloading and importing them through Database settings
                </Typography>
            </Box>
        </>
    );
};

export default Settings_CloudBackups;