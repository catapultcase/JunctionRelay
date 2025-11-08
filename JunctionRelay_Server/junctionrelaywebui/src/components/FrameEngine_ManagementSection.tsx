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
import { useAppVersion } from '../hooks/useAppVersion';
import {
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
    Accordion,
    AccordionSummary,
    AccordionDetails,
    List,
    ListItem,
    ListItemText,
} from '@mui/material';
import StorageIcon from '@mui/icons-material/Storage';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FileCopyIcon from '@mui/icons-material/FileCopy';
import { DuplicateGroup, DeduplicationResult } from '../interfaces/DuplicateAssets';

interface OrphanedFilesReport {
    orphanedRiveFiles: string[];
    orphanedThumbnails: string[];
    orphanedFrameImages: string[];
    orphanedAssets: string[];
    totalOrphanedFiles: number;
    estimatedSizeMB: number;
    // Duplicate detection fields
    duplicateAssets?: DuplicateGroup[];
    totalDuplicateSpaceSavingsBytes?: number;
    totalDuplicateFileCount?: number;
}

interface FrameEngineManagementSectionProps {
    onShowSnackbar: (message: string, severity: 'success' | 'info' | 'warning' | 'error') => void;
}

const FrameEngineManagementSection: React.FC<FrameEngineManagementSectionProps> = ({ onShowSnackbar }) => {
    // Versioned localStorage for persistence
    const { version } = useAppVersion();

    const getStorageKey = useCallback((key: string) => {
        if (!version) {
            throw new Error('Application version not loaded');
        }
        return `${version}_${key}`;
    }, [version]);

    // State
    const [loading, setLoading] = useState<boolean>(false);
    const [cleanupLoading, setCleanupLoading] = useState<boolean>(false);
    const [autoCleanupEnabled, setAutoCleanupEnabled] = useState<boolean>(false);
    const [autoCleanupLoading, setAutoCleanupLoading] = useState<boolean>(false);
    const [orphanedReport, setOrphanedReport] = useState<OrphanedFilesReport | null>(null);
    const [lastAuditTime, setLastAuditTime] = useState<Date | null>(null);
    const [isWindows, setIsWindows] = useState<boolean>(false);
    const [openDirLoading, setOpenDirLoading] = useState<boolean>(false);
    const [deduplicating, setDeduplicating] = useState<boolean>(false);
    const [expanded, setExpanded] = useState<boolean>(true); // Default while version loads

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

    // Load expanded state from versioned localStorage when version is available
    useEffect(() => {
        if (version) {
            try {
                const saved = localStorage.getItem(getStorageKey('filesystem_management_expanded'));
                if (saved !== null) {
                    setExpanded(saved === 'true');
                }
            } catch (error) {
                console.error("Error accessing localStorage for filesystem management:", error);
            }
        }
    }, [version, getStorageKey]);

    // Persist expanded state to versioned localStorage
    useEffect(() => {
        if (version) {
            try {
                localStorage.setItem(getStorageKey('filesystem_management_expanded'), expanded.toString());
            } catch (error) {
                console.error("Error saving to localStorage:", error);
            }
        }
    }, [expanded, version, getStorageKey]);

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

    // De-duplicate assets
    const handleDeduplicate = async () => {
        if (!orphanedReport?.duplicateAssets || orphanedReport.duplicateAssets.length === 0) {
            return;
        }

        const totalDuplicates = orphanedReport.duplicateAssets.reduce((sum, g) => sum + g.duplicates.length, 0);
        const totalSavingsMB = (orphanedReport.totalDuplicateSpaceSavingsBytes || 0) / (1024 * 1024);

        const confirmed = window.confirm(
            `Remove ${totalDuplicates} duplicate file${totalDuplicates !== 1 ? 's' : ''}?\n\n` +
            `This will save ${totalSavingsMB.toFixed(2)} MB and update database references to point to the oldest version of each file.\n\n` +
            `This action cannot be undone.`
        );

        if (!confirmed) return;

        setDeduplicating(true);
        try {
            const response = await fetch('/api/frameengine/cleanup/duplicate-assets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ duplicateGroups: orphanedReport.duplicateAssets })
            });

            if (response.ok) {
                const result: DeduplicationResult = await response.json();
                const spaceSavedMB = result.spaceFreedBytes / (1024 * 1024);

                if (result.errors.length > 0) {
                    onShowSnackbar(
                        `Removed ${result.filesDeleted} files (${spaceSavedMB.toFixed(2)} MB freed) with ${result.errors.length} error(s)`,
                        'warning'
                    );
                } else {
                    onShowSnackbar(
                        `Successfully removed ${result.filesDeleted} duplicate files, freed ${spaceSavedMB.toFixed(2)} MB`,
                        'success'
                    );
                }

                // Re-audit to refresh UI
                await fetchOrphanedFilesAudit();
            } else {
                const error = await response.json();
                throw new Error(error.message || 'Failed to de-duplicate assets');
            }
        } catch (error: any) {
            console.error('Error de-duplicating assets:', error);
            onShowSnackbar(`Failed to de-duplicate assets: ${error.message}`, 'error');
        } finally {
            setDeduplicating(false);
        }
    };

    // Helper to format bytes
    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    };

    // Helper to generate status chips for collapsed state
    const getStatusChips = () => {
        if (!orphanedReport) return null;

        const chips = [];

        // Clean state chip (when no issues)
        if (orphanedReport.totalOrphanedFiles === 0 &&
            (!orphanedReport.duplicateAssets || orphanedReport.duplicateAssets.length === 0)) {
            chips.push(
                <Chip
                    key="clean"
                    label="Clean"
                    color="success"
                    size="small"
                    icon={<CheckCircleIcon sx={{ fontSize: '0.8rem' }} />}
                />
            );
        } else {
            // Orphaned files chips
            if (orphanedReport.totalOrphanedFiles > 0) {
                chips.push(
                    <Chip
                        key="orphaned"
                        label={`${orphanedReport.totalOrphanedFiles} orphaned`}
                        color="warning"
                        size="small"
                        icon={<WarningIcon sx={{ fontSize: '0.8rem' }} />}
                    />
                );
                chips.push(
                    <Chip
                        key="size"
                        label={`~${orphanedReport.estimatedSizeMB.toFixed(2)} MB`}
                        color="warning"
                        size="small"
                        icon={<DeleteSweepIcon sx={{ fontSize: '0.8rem' }} />}
                    />
                );
            }

            // Duplicate files chip
            if (orphanedReport.duplicateAssets && orphanedReport.duplicateAssets.length > 0) {
                chips.push(
                    <Chip
                        key="duplicates"
                        label={`${orphanedReport.totalDuplicateFileCount} duplicates`}
                        color="info"
                        size="small"
                        icon={<FileCopyIcon sx={{ fontSize: '0.8rem' }} />}
                    />
                );
            }
        }

        return chips;
    };

    return (
        <Accordion
            expanded={expanded}
            onChange={(_, isExpanded) => setExpanded(isExpanded)}
            sx={{ mb: 3 }}
        >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box display="flex" alignItems="center" gap={1}>
                    <StorageIcon color="primary" />
                    <Typography variant="h6">
                        Filesystem Management
                    </Typography>
                    {(loading || autoCleanupLoading) && (
                        <CircularProgress size={16} sx={{ ml: 1 }} />
                    )}
                    {!loading && getStatusChips()}
                </Box>
            </AccordionSummary>

            <AccordionDetails>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Monitor and clean up orphaned Rive files, thumbnails, frame images, and media element files (images, videos) that are no longer referenced by any frame layouts or media elements. This will prevent unnecessary files from being added to your database backups.
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

            {/* Duplicate Assets Section */}
            {orphanedReport && (
                <>
                    <Divider sx={{ my: 3 }} />

                    <Box sx={{ mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                            <FileCopyIcon sx={{ mr: 1, color: 'text.secondary' }} />
                            <Typography variant="h6">
                                Duplicate Assets
                            </Typography>
                        </Box>

                        {/* Show success message when no duplicates exist */}
                        {(!orphanedReport.duplicateAssets || orphanedReport.duplicateAssets.length === 0) ? (
                            <Alert severity="success" icon={<CheckCircleIcon />} sx={{ mb: 2 }}>
                                <Typography variant="body2">
                                    No duplicate assets exist. All files are unique!
                                </Typography>
                            </Alert>
                        ) : (
                            <>
                                <Alert severity="info" icon={<WarningIcon />} sx={{ mb: 2 }}>
                                    <Typography variant="body2" fontWeight="medium">
                                        {orphanedReport.duplicateAssets.length} duplicate group{orphanedReport.duplicateAssets.length !== 1 ? 's' : ''} found
                                        ({orphanedReport.totalDuplicateFileCount} file{orphanedReport.totalDuplicateFileCount !== 1 ? 's' : ''})
                                    </Typography>
                                    <Typography variant="caption" display="block">
                                        Space savings: {formatBytes(orphanedReport.totalDuplicateSpaceSavingsBytes || 0)}
                                    </Typography>
                                </Alert>

                                {/* Duplicate Groups */}
                                {orphanedReport.duplicateAssets.map((group, index) => (
                                    <Accordion key={group.fileHash} sx={{ mb: 1 }}>
                                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                                                <Chip
                                                    label={group.assetType.toUpperCase()}
                                                    size="small"
                                                    color="primary"
                                                    variant="outlined"
                                                />
                                                <Typography variant="body2">
                                                    {group.duplicates.length + 1} copies of <strong>{group.canonicalFile}</strong>
                                                </Typography>
                                                <Chip
                                                    label={formatBytes(group.spaceSavingsBytes)}
                                                    size="small"
                                                    color="success"
                                                    sx={{ ml: 'auto' }}
                                                />
                                            </Box>
                                        </AccordionSummary>
                                        <AccordionDetails>
                                            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                                                Canonical (oldest): <strong>{group.canonicalFile}</strong> - This file will be kept
                                            </Typography>
                                            <Divider sx={{ my: 1 }} />
                                            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                                                Duplicates (will be removed):
                                            </Typography>
                                            <List dense>
                                                {group.duplicates.map((file) => (
                                                    <ListItem key={file.filename} sx={{ py: 0.5 }}>
                                                        <ListItemText
                                                            primary={file.filename}
                                                            secondary={
                                                                <>
                                                                    {formatBytes(file.sizeBytes)} • {' '}
                                                                    {file.usageCount} reference{file.usageCount !== 1 ? 's' : ''} • {' '}
                                                                    {new Date(file.createdDate).toLocaleDateString()}
                                                                </>
                                                            }
                                                            primaryTypographyProps={{ variant: 'body2' }}
                                                            secondaryTypographyProps={{ variant: 'caption' }}
                                                        />
                                                    </ListItem>
                                                ))}
                                            </List>
                                        </AccordionDetails>
                                    </Accordion>
                                ))}

                                {/* De-duplicate Button */}
                                <Box sx={{ mt: 2 }}>
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        onClick={handleDeduplicate}
                                        disabled={deduplicating || loading}
                                        startIcon={deduplicating ? <CircularProgress size={16} /> : <DeleteSweepIcon />}
                                        size="small"
                                    >
                                        {deduplicating ? 'De-duplicating...' : 'De-duplicate Assets'}
                                    </Button>
                                </Box>
                            </>
                        )}
                    </Box>
                </>
            )}
            </AccordionDetails>
        </Accordion>
    );
};

export default FrameEngineManagementSection;