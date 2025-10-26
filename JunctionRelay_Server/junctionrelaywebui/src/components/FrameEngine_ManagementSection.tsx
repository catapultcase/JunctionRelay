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

import React, { useState, useEffect, useCallback } from 'react';
import {
    Paper,
    Box,
    Typography,
    Button,
    CircularProgress,
    Alert,
    Switch,
    FormControlLabel,
    Tooltip,
    Divider,
    Chip,
} from '@mui/material';
import StorageIcon from '@mui/icons-material/Storage';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';

interface OrphanedFilesReport {
    orphanedRiveFiles: string[];
    orphanedThumbnails: string[];
    orphanedFrameImages: string[];
    orphanedAssets: string[];
    totalOrphanedFiles: number;
    estimatedSizeMB: number;
}

interface FrameEngineManagementSectionProps {
    onShowSnackbar: (message: string, severity: 'success' | 'info' | 'warning' | 'error') => void;
}

const FrameEngineManagementSection: React.FC<FrameEngineManagementSectionProps> = ({ onShowSnackbar }) => {
    const [loading, setLoading] = useState<boolean>(false);
    const [cleanupLoading, setCleanupLoading] = useState<boolean>(false);
    const [autoCleanupEnabled, setAutoCleanupEnabled] = useState<boolean>(false);
    const [autoCleanupLoading, setAutoCleanupLoading] = useState<boolean>(false);
    const [orphanedReport, setOrphanedReport] = useState<OrphanedFilesReport | null>(null);
    const [lastAuditTime, setLastAuditTime] = useState<Date | null>(null);
    const [isWindows, setIsWindows] = useState<boolean>(false);
    const [openDirLoading, setOpenDirLoading] = useState<boolean>(false);

    // Fetch server platform information from backend
    const fetchPlatformInfo = useCallback(async () => {
        try {
            const response = await fetch('/api/frameengine/platform');
            if (response.ok) {
                const data = await response.json();
                setIsWindows(data.isWindows || false);
            }
        } catch (error) {
            console.error('Error fetching platform info:', error);
            // Keep isWindows as false on error
        }
    }, []);

    // Fetch auto-cleanup settings
    const fetchAutoCleanupSettings = useCallback(async () => {
        try {
            const response = await fetch('/api/frameengine/settings/auto-cleanup');
            if (response.ok) {
                const settings = await response.json();
                setAutoCleanupEnabled(settings.enabled || false);
            }
        } catch (error) {
            console.error('Error fetching auto-cleanup settings:', error);
        }
    }, []);

    // Fetch orphaned files audit
    const fetchOrphanedFilesAudit = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/frameengine/audit/orphaned-files');
            if (response.ok) {
                const data = await response.json();
                setOrphanedReport(data);
                setLastAuditTime(new Date());
            } else {
                throw new Error('Failed to fetch orphaned files audit');
            }
        } catch (error) {
            console.error('Error fetching orphaned files:', error);
            onShowSnackbar('Error fetching filesystem audit', 'error');
        } finally {
            setLoading(false);
        }
    }, [onShowSnackbar]);

    // Initial load - UPDATED: fetch platform info too
    useEffect(() => {
        const init = async () => {
            await Promise.all([
                fetchPlatformInfo(),
                fetchAutoCleanupSettings(),
                fetchOrphanedFilesAudit()
            ]);
        };
        init();
    }, [fetchPlatformInfo, fetchAutoCleanupSettings, fetchOrphanedFilesAudit]);

    // Handle auto-cleanup toggle
    const handleAutoCleanupToggle = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = event.target.checked;
        setAutoCleanupLoading(true);

        try {
            const response = await fetch('/api/frameengine/settings/auto-cleanup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: newValue })
            });

            if (response.ok) {
                setAutoCleanupEnabled(newValue);
                onShowSnackbar(
                    `Auto-cleanup on app start ${newValue ? 'enabled' : 'disabled'}`,
                    'info'
                );
            } else {
                const error = await response.json();
                onShowSnackbar(`Failed to update setting: ${error.message}`, 'error');
                setAutoCleanupEnabled(!newValue);
            }
        } catch (error) {
            console.error('Error updating auto-cleanup setting:', error);
            onShowSnackbar('Error updating auto-cleanup setting', 'error');
            setAutoCleanupEnabled(!newValue);
        } finally {
            setAutoCleanupLoading(false);
        }
    };

    // Handle cleanup now
    const handleCleanupNow = async () => {
        if (!orphanedReport || orphanedReport.totalOrphanedFiles === 0) {
            onShowSnackbar('No orphaned files to clean up', 'info');
            return;
        }

        if (!window.confirm(
            `This will permanently delete ${orphanedReport.totalOrphanedFiles} orphaned files ` +
            `(~${orphanedReport.estimatedSizeMB.toFixed(2)} MB). This action cannot be undone. Continue?`
        )) {
            return;
        }

        setCleanupLoading(true);
        try {
            const response = await fetch('/api/frameengine/cleanup/orphaned-files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                const result = await response.json();
                onShowSnackbar(
                    `Cleanup complete: ${result.deletedCount} files removed, ${result.freedSpaceMB.toFixed(2)} MB freed`,
                    'success'
                );
                // Refresh the audit
                await fetchOrphanedFilesAudit();
            } else {
                const error = await response.json();
                throw new Error(error.message || 'Cleanup failed');
            }
        } catch (error: any) {
            console.error('Error during cleanup:', error);
            onShowSnackbar(`Cleanup failed: ${error.message}`, 'error');
        } finally {
            setCleanupLoading(false);
        }
    };

    // Refresh audit
    const handleRefreshAudit = () => {
        fetchOrphanedFilesAudit();
    };

    // Open directory in Windows Explorer
    const handleOpenDirectory = async () => {
        setOpenDirLoading(true);
        try {
            const response = await fetch('/api/frameengine/open-directory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                onShowSnackbar('Opened FrameEngine directory in Explorer', 'success');
            } else {
                const error = await response.json();
                throw new Error(error.message || 'Failed to open directory');
            }
        } catch (error: any) {
            console.error('Error opening directory:', error);
            onShowSnackbar(`Failed to open directory: ${error.message}`, 'error');
        } finally {
            setOpenDirLoading(false);
        }
    };

    return (
        <Paper sx={{ p: 2, mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <StorageIcon sx={{ mr: 1, color: 'text.secondary' }} />
                <Typography variant="h6">
                    Filesystem Management
                </Typography>
                {(loading || autoCleanupLoading) && (
                    <CircularProgress size={16} sx={{ ml: 1 }} />
                )}
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Monitor and clean up orphaned Rive files, thumbnails, frame images, and media files (images, videos, etc.) that are no longer used by any frame layouts. This will prevent unnecessary files from being added to your database backups.
            </Typography>

            <Divider sx={{ mb: 2 }} />

            {/* Audit Summary */}
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <CircularProgress size={24} />
                </Box>
            ) : orphanedReport ? (
                <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                        {orphanedReport.totalOrphanedFiles === 0 ? (
                            <Alert severity="success" icon={<CheckCircleIcon />} sx={{ flex: 1 }}>
                                <Typography variant="body2">
                                    No orphaned files found. Filesystem is clean!
                                </Typography>
                            </Alert>
                        ) : (
                            <Alert severity="warning" icon={<WarningIcon />} sx={{ flex: 1 }}>
                                <Typography variant="body2" fontWeight="medium">
                                    {orphanedReport.totalOrphanedFiles} orphaned file{orphanedReport.totalOrphanedFiles !== 1 ? 's' : ''} found
                                </Typography>
                                <Typography variant="caption" display="block">
                                    Estimated size: ~{orphanedReport.estimatedSizeMB.toFixed(2)} MB
                                </Typography>
                            </Alert>
                        )}
                    </Box>

                    {/* Breakdown - UPDATED: Added orphanedAssets */}
                    {orphanedReport.totalOrphanedFiles > 0 && (
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                            {orphanedReport.orphanedRiveFiles.length > 0 && (
                                <Chip
                                    label={`${orphanedReport.orphanedRiveFiles.length} Rive files`}
                                    size="small"
                                    color="warning"
                                    variant="outlined"
                                />
                            )}
                            {orphanedReport.orphanedThumbnails.length > 0 && (
                                <Chip
                                    label={`${orphanedReport.orphanedThumbnails.length} thumbnails`}
                                    size="small"
                                    color="warning"
                                    variant="outlined"
                                />
                            )}
                            {orphanedReport.orphanedFrameImages.length > 0 && (
                                <Chip
                                    label={`${orphanedReport.orphanedFrameImages.length} frame images`}
                                    size="small"
                                    color="warning"
                                    variant="outlined"
                                />
                            )}
                            {orphanedReport.orphanedAssets.length > 0 && (
                                <Chip
                                    label={`${orphanedReport.orphanedAssets.length} assets`}
                                    size="small"
                                    color="warning"
                                    variant="outlined"
                                />
                            )}
                        </Box>
                    )}

                    {lastAuditTime && (
                        <Typography variant="caption" color="text.secondary">
                            Last audit: {lastAuditTime.toLocaleString()}
                        </Typography>
                    )}
                </Box>
            ) : (
                <Alert severity="error" sx={{ mb: 2 }}>
                    Failed to load filesystem audit
                </Alert>
            )}

            {/* Actions */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Button
                    variant="contained"
                    color="error"
                    onClick={handleCleanupNow}
                    disabled={cleanupLoading || loading || !orphanedReport || orphanedReport.totalOrphanedFiles === 0}
                    startIcon={cleanupLoading ? <CircularProgress size={16} /> : <DeleteSweepIcon />}
                    size="small"
                >
                    {cleanupLoading ? 'Cleaning...' : 'Clean Up Now'}
                </Button>

                <Button
                    variant="outlined"
                    onClick={handleRefreshAudit}
                    disabled={loading}
                    size="small"
                >
                    Refresh Audit
                </Button>

                {/* Open Directory Button - Windows Only */}
                {isWindows && (
                    <Tooltip title="⚠️ It is recommended to not manually clean files. Windows cannot detect which files are in use by JunctionRelay. Use the cleanup tools on this page instead.">
                        <Button
                            variant="outlined"
                            onClick={handleOpenDirectory}
                            disabled={openDirLoading}
                            startIcon={openDirLoading ? <CircularProgress size={16} /> : <FolderOpenIcon />}
                            size="small"
                        >
                            {openDirLoading ? 'Opening...' : 'Open Directory'}
                        </Button>
                    </Tooltip>
                )}

                <FormControlLabel
                    control={
                        <Switch
                            checked={autoCleanupEnabled}
                            onChange={handleAutoCleanupToggle}
                            disabled={autoCleanupLoading}
                            color="primary"
                        />
                    }
                    label={
                        <Tooltip title="Automatically clean up orphaned files when the application starts">
                            <Typography variant="body2">
                                Auto-cleanup on app start
                            </Typography>
                        </Tooltip>
                    }
                    sx={{ ml: 'auto' }}
                />
            </Box>
        </Paper>
    );
};

export default FrameEngineManagementSection;