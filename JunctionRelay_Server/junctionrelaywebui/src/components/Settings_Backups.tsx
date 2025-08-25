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
    Box, Typography, Button, FormControlLabel, Switch,
    CircularProgress, Paper, Chip, Divider, Table, TableContainer,
    TableHead, TableRow, TableCell, TableBody, List, ListItem,
    LinearProgress, Select, MenuItem, FormControl, InputLabel, Alert
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
}

interface SettingsBackupsProps {
    showSnackbar: (message: string, severity?: AlertColor) => void;
    isMobile?: boolean;
    cloudUserInfo: CloudUserInfo | null;
}

const Settings_Backups: React.FC<SettingsBackupsProps> = ({
    showSnackbar,
    isMobile = false,
    cloudUserInfo
}) => {
    const [loading, setLoading] = useState<boolean>(true);
    const [backupSettings, setBackupSettings] = useState<BackupSettings | null>(null);
    const [backupUsage, setBackupUsage] = useState<BackupUsage | null>(null);
    const [backups, setBackups] = useState<BackupRecord[]>([]);
    const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
    const [savingSettings, setSavingSettings] = useState<boolean>(false);
    const [selectedBackup, setSelectedBackup] = useState<string | null>(null);

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
                setBackups(data.backups || []);
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

            // First, create a local backup
            const localBackupResponse = await fetch('/api/db/export-db?includeKeys=true&includeIdentity=true');
            if (!localBackupResponse.ok) throw new Error('Failed to create local backup');

            const backupBlob = await localBackupResponse.blob();
            const backupFile = new File([backupBlob], 'backup.zip', { type: 'application/zip' });

            // Request upload URL from cloud
            const uploadResponse = await fetch('/api/cloud-backups/request-upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${cloudToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: `junction_backup_${new Date().toISOString().slice(0, 19)}.zip`,
                    uncompressedSize: backupBlob.size,
                    compressedSize: backupBlob.size
                })
            });

            if (!uploadResponse.ok) {
                const error = await uploadResponse.json();
                throw new Error(error.error || 'Failed to request upload');
            }

            const { uploadUrl, backupId } = await uploadResponse.json();

            // Upload to S3
            const s3Response = await fetch(uploadUrl, {
                method: 'PUT',
                body: backupFile,
                headers: {
                    'Content-Type': 'application/zip'
                }
            });

            if (!s3Response.ok) {
                throw new Error('Failed to upload backup to cloud');
            }

            // Complete the backup
            const completeResponse = await fetch('/api/cloud-backups/complete-upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${cloudToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    backupId,
                    actualCompressedSize: backupBlob.size
                })
            });

            if (completeResponse.ok) {
                showSnackbar('Backup uploaded to cloud successfully', 'success');
                fetchBackups();
                fetchBackupStatus();
            } else {
                throw new Error('Failed to complete backup');
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

            const response = await fetch(`/api/cloud-backups/${backupId}/request-download`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${cloudToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();

                // Download the file
                const downloadResponse = await fetch(data.downloadUrl);
                if (!downloadResponse.ok) throw new Error('Failed to download backup');

                const blob = await downloadResponse.blob();
                const url = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                a.download = data.filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);

                showSnackbar('Backup downloaded successfully', 'success');
            } else {
                throw new Error('Failed to get download URL');
            }
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

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            if (cloudUserInfo?.hasValidLicense) {
                await Promise.all([
                    fetchBackupStatus(),
                    fetchBackups()
                ]);
            }
            setLoading(false);
        };
        loadData();
    }, [cloudUserInfo]);

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
                                    formatDate(new Date(backupSettings.lastBackup)) : 'Never'}
                            </Typography>
                        </Box>
                    </Box>

                    {/* Usage Statistics */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center' }}>
                            <InfoIcon sx={{ mr: 1, fontSize: 16 }} />
                            Usage Statistics
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
                                    <Box>
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
                                </>
                            )}
                        </Box>
                    </Box>
                </Box>
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Backup Settings */}
            <Box sx={{ mb: 3 }}>
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
                        <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 2 }}>
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
                    )}
                </Box>
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Manual Backup */}
            <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center' }}>
                    <BackupIcon sx={{ mr: 1, fontSize: 16 }} />
                    Manual Backup
                </Typography>

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

            <Divider sx={{ my: 2 }} />

            {/* Backup History */}
            <Box>
                <Typography variant="subtitle2" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                    <RestoreIcon sx={{ mr: 1, fontSize: 16 }} />
                    Backup History
                    <Chip
                        size="small"
                        label={`${backups.length} backups`}
                        sx={{ ml: 1 }}
                    />
                </Typography>

                {backups.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                        No backups found. Create your first backup using the button above.
                    </Typography>
                ) : isMobile ? (
                    <List disablePadding>
                        {backups.map((backup, index) => (
                            <ListItem
                                key={backup.id}
                                sx={{
                                    flexDirection: 'column',
                                    alignItems: 'stretch',
                                    borderBottom: index < backups.length - 1 ? '1px solid' : 'none',
                                    borderColor: 'divider',
                                    py: 2,
                                    px: 0
                                }}
                            >
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', mb: 1 }}>
                                    <Box sx={{ flex: 1 }}>
                                        <Typography variant="subtitle2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                            {backup.filename}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                                            {formatDate(backup.createdAt)} • {formatFileSize(backup.compressedSize)}
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
                ) : (
                    <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Filename</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell>Size</TableCell>
                                    <TableCell>Created</TableCell>
                                    <TableCell>Expires</TableCell>
                                    <TableCell align="right">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {backups.map((backup) => (
                                    <TableRow key={backup.id}>
                                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                            {backup.filename}
                                        </TableCell>
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
                                        <TableCell>{formatFileSize(backup.compressedSize)}</TableCell>
                                        <TableCell>{formatDate(backup.createdAt)}</TableCell>
                                        <TableCell>
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
                )}
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
                    • All data is encrypted in transit and at rest using industry-standard encryption<br />
                    • Automatic backups run according to your selected schedule<br />
                    • You can restore backups by downloading and importing them through Database settings
                </Typography>
            </Box>
        </>
    );
};

export default Settings_Backups;