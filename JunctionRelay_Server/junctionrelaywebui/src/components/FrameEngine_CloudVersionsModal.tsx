import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction,
    IconButton,
    Typography,
    CircularProgress,
    Box,
    Tooltip
} from '@mui/material';
import {
    Download as DownloadIcon,
    CloudUpload as CloudUploadIcon,
    Close as CloseIcon,
    Lock as LockIcon,
    CheckCircle as CheckCircleIcon,
    Delete as DeleteIcon
} from '@mui/icons-material';

interface CloudVersion {
    id: string;
    templateName: string;
    snapshotAt: string;
}

interface CloudVersionsModalProps {
    open: boolean;
    onClose: () => void;
    templateId: number;
    templateName: string;
    hasProLicense: boolean;
    onShowSnackbar?: (message: string, severity?: "success" | "info" | "warning" | "error") => void;
}

const FrameEngine_CloudVersionsModal: React.FC<CloudVersionsModalProps> = ({
    open,
    onClose,
    templateId,
    templateName,
    hasProLicense,
    onShowSnackbar
}) => {
    const [versions, setVersions] = useState<CloudVersion[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        if (open && hasProLicense) {
            loadVersions();
        }
    }, [open, templateId, hasProLicense]);

    const loadVersions = async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/frameengine/cloud-versions/${templateId}`);
            if (!response.ok) {
                throw new Error('Failed to load versions');
            }
            const data = await response.json();
            setVersions(data);
        } catch (error) {
            console.error('Error loading versions:', error);
            onShowSnackbar?.('Failed to load cloud versions', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveNewVersion = async () => {
        setUploading(true);
        try {
            const response = await fetch(`/api/frameengine/${templateId}/save-cloud-version`, {
                method: 'POST'
            });

            if (response.status === 403) {
                onShowSnackbar?.('Pro tier subscription required for cloud template versioning', 'warning');
                return;
            }

            if (!response.ok) {
                throw new Error('Failed to save cloud version');
            }

            const result = await response.json();

            if (result.unchanged) {
                onShowSnackbar?.('No changes detected - template identical to latest version', 'info');
            } else {
                onShowSnackbar?.('Template version saved successfully!', 'success');
            }

            // Reload versions list
            await loadVersions();
        } catch (error) {
            console.error('Error saving cloud version:', error);
            onShowSnackbar?.('Error saving cloud version', 'error');
        } finally {
            setUploading(false);
        }
    };

    const handleDownload = async (snapshotId: string, versionName: string) => {
        setDownloadingId(snapshotId);
        try {
            const response = await fetch(`/api/frameengine/cloud-versions/${snapshotId}/download`);

            if (!response.ok) {
                throw new Error('Failed to download version');
            }

            // Get the blob and trigger download
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${versionName}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            onShowSnackbar?.('Download started', 'success');
        } catch (error) {
            console.error('Error downloading version:', error);
            onShowSnackbar?.('Error downloading version', 'error');
        } finally {
            setDownloadingId(null);
        }
    };

    const handleDelete = async (snapshotId: string) => {
        if (!window.confirm('Are you sure you want to delete this version? This action cannot be undone.')) {
            return;
        }

        setDeletingId(snapshotId);
        try {
            const response = await fetch(`/api/frameengine/cloud-versions/${snapshotId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete version');
            }

            onShowSnackbar?.('Version deleted successfully', 'success');

            // Reload versions list
            await loadVersions();
        } catch (error) {
            console.error('Error deleting version:', error);
            onShowSnackbar?.('Error deleting version', 'error');
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            onClick={(e) => e.stopPropagation()}
        >
            <DialogTitle>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Typography variant="h6">Cloud Versions: {templateName}</Typography>
                    <IconButton onClick={onClose} size="small">
                        <CloseIcon />
                    </IconButton>
                </Box>
            </DialogTitle>
            <DialogContent>
                {!hasProLicense ? (
                    <Box textAlign="center" py={4} px={2}>
                        <LockIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
                        <Typography variant="h6" gutterBottom>
                            Cloud Template Versioning
                        </Typography>
                        <Typography variant="body1" color="text.secondary" paragraph>
                            This is a Pro feature that lets you save and restore FrameEngine template versions in the cloud.
                        </Typography>
                        <Box textAlign="left" maxWidth={400} mx="auto" mt={3} mb={3}>
                            <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <CheckCircleIcon fontSize="small" color="success" />
                                Automatic version snapshots
                            </Typography>
                            <Typography variant="body2" color="text.secondary" paragraph sx={{ ml: 4 }}>
                                Save complete template states including all assets (images, videos, Rive animations)
                            </Typography>

                            <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <CheckCircleIcon fontSize="small" color="success" />
                                Smart deduplication
                            </Typography>
                            <Typography variant="body2" color="text.secondary" paragraph sx={{ ml: 4 }}>
                                Only changed assets are uploaded, saving storage and bandwidth
                            </Typography>

                            <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <CheckCircleIcon fontSize="small" color="success" />
                                One-click restore
                            </Typography>
                            <Typography variant="body2" color="text.secondary" paragraph sx={{ ml: 4 }}>
                                Download any previous version as a complete template package
                            </Typography>

                            <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <CheckCircleIcon fontSize="small" color="success" />
                                60-day retention
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ ml: 4 }}>
                                All versions are kept for 60 days with automatic cleanup
                            </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                            Upgrade to Pro to unlock this feature and support development.
                        </Typography>
                    </Box>
                ) : loading ? (
                    <Box display="flex" justifyContent="center" p={3}>
                        <CircularProgress />
                    </Box>
                ) : versions.length === 0 ? (
                    <Box textAlign="center" p={3}>
                        <Typography variant="body2" color="text.secondary">
                            No cloud versions saved yet. Click "Save New Version" to create one.
                        </Typography>
                    </Box>
                ) : (
                    <List>
                        {versions.map((version) => (
                            <ListItem key={version.id} divider disablePadding={false}>
                                <ListItemText
                                    primary={new Date(version.snapshotAt).toLocaleString()}
                                    secondary={version.templateName}
                                />
                                <ListItemSecondaryAction>
                                    <Tooltip title="Download this version">
                                        <IconButton
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDownload(version.id, version.templateName);
                                            }}
                                            disabled={downloadingId !== null || deletingId !== null}
                                        >
                                            {downloadingId === version.id ? (
                                                <CircularProgress size={24} />
                                            ) : (
                                                <DownloadIcon />
                                            )}
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Delete this version">
                                        <IconButton
                                            edge="end"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(version.id);
                                            }}
                                            disabled={downloadingId !== null || deletingId !== null}
                                            color="error"
                                        >
                                            {deletingId === version.id ? (
                                                <CircularProgress size={24} />
                                            ) : (
                                                <DeleteIcon />
                                            )}
                                        </IconButton>
                                    </Tooltip>
                                </ListItemSecondaryAction>
                            </ListItem>
                        ))}
                    </List>
                )}
            </DialogContent>
            <DialogActions>
                {hasProLicense && (
                    <Button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleSaveNewVersion();
                        }}
                        variant="contained"
                        startIcon={uploading ? <CircularProgress size={20} /> : <CloudUploadIcon />}
                        disabled={uploading}
                    >
                        {uploading ? 'Saving...' : 'Save New Version'}
                    </Button>
                )}
                <Button onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                }}>Close</Button>
            </DialogActions>
        </Dialog>
    );
};

export default FrameEngine_CloudVersionsModal;
