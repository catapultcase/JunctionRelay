import React, { useState, useEffect, useMemo } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    IconButton,
    Typography,
    CircularProgress,
    Box,
    Tooltip,
    TablePagination,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    TableContainer,
    Paper,
    TextField,
    Chip
} from '@mui/material';
import {
    Download as DownloadIcon,
    CloudUpload as CloudUploadIcon,
    Close as CloseIcon,
    Lock as LockIcon,
    CheckCircle as CheckCircleIcon,
    Delete as DeleteIcon,
    ArrowUpward as ArrowUpwardIcon,
    ArrowDownward as ArrowDownwardIcon
} from '@mui/icons-material';

interface CloudVersion {
    id: string;
    templateName: string;
    snapshotAt: string;
    isBackupSnapshot: boolean;
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
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    useEffect(() => {
        if (open && hasProLicense) {
            loadVersions();
        }
    }, [open, templateId, hasProLicense]);

    const loadVersions = async () => {
        setLoading(true);
        try {
            // Call cloud backend directly - local backend proxies to cloud
            const response = await fetch(`/api/frameengine/cloud-templates/${templateId}/cloud-versions`);
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
            const response = await fetch(`/api/frameengine/cloud-templates/${templateId}/cloud-version`, {
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
            const response = await fetch(`/api/frameengine/cloud-templates/${templateId}/cloud-versions/${snapshotId}/download`, {
                method: 'POST'
            });

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
            const response = await fetch(`/api/frameengine/cloud-templates/${templateId}/cloud-versions/${snapshotId}`, {
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

    const handleChangePage = (_event: unknown, newPage: number) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    // Filter versions based on date range and sort
    const filteredVersions = useMemo(() => {
        let filtered = versions;

        // Filter by date from
        if (dateFrom) {
            const fromDate = new Date(dateFrom);
            fromDate.setHours(0, 0, 0, 0);
            filtered = filtered.filter(version => {
                const versionDate = new Date(version.snapshotAt);
                return versionDate >= fromDate;
            });
        }

        // Filter by date to
        if (dateTo) {
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999);
            filtered = filtered.filter(version => {
                const versionDate = new Date(version.snapshotAt);
                return versionDate <= toDate;
            });
        }

        // Sort by date
        filtered = [...filtered].sort((a, b) => {
            const dateA = new Date(a.snapshotAt).getTime();
            const dateB = new Date(b.snapshotAt).getTime();
            return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
        });

        return filtered;
    }, [versions, dateFrom, dateTo, sortOrder]);

    // Calculate paginated versions
    const paginatedVersions = useMemo(() => {
        return filteredVersions.slice(
            page * rowsPerPage,
            page * rowsPerPage + rowsPerPage
        );
    }, [filteredVersions, page, rowsPerPage]);

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="md"
            fullWidth
            onClick={(e) => e.stopPropagation()}
        >
            <DialogTitle sx={{ pb: 1 }}>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Typography variant="h6">Cloud Versions: {templateName}</Typography>
                    <IconButton onClick={onClose} size="small">
                        <CloseIcon />
                    </IconButton>
                </Box>
            </DialogTitle>
            <DialogContent dividers>
                <Box sx={{ p: 3 }}>
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
                    <>
                        {/* Date Range Filter */}
                        <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'flex-end' }}>
                            <TextField
                                label="From Date"
                                type="date"
                                size="small"
                                value={dateFrom}
                                onChange={(e) => {
                                    setDateFrom(e.target.value);
                                    setPage(0);
                                }}
                                InputLabelProps={{
                                    shrink: true,
                                }}
                                sx={{ width: 200 }}
                            />
                            <TextField
                                label="To Date"
                                type="date"
                                size="small"
                                value={dateTo}
                                onChange={(e) => {
                                    setDateTo(e.target.value);
                                    setPage(0);
                                }}
                                InputLabelProps={{
                                    shrink: true,
                                }}
                                sx={{ width: 200 }}
                            />
                            <Button
                                size="small"
                                onClick={() => {
                                    setDateFrom('');
                                    setDateTo('');
                                    setPage(0);
                                }}
                                variant="outlined"
                                disabled={!dateFrom && !dateTo}
                                sx={{ minWidth: 80 }}
                            >
                                Clear
                            </Button>
                        </Box>

                        {/* Table */}
                        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                            <Table size="small" stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell
                                            sx={{ cursor: 'pointer', userSelect: 'none' }}
                                            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                                        >
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                Date & Time
                                                {sortOrder === 'desc' ? (
                                                    <ArrowDownwardIcon fontSize="small" />
                                                ) : (
                                                    <ArrowUpwardIcon fontSize="small" />
                                                )}
                                            </Box>
                                        </TableCell>
                                        <TableCell>Template Name</TableCell>
                                        <TableCell align="center">Status</TableCell>
                                        <TableCell align="right">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {paginatedVersions.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} align="center">
                                                <Typography variant="body2" color="text.secondary" py={3}>
                                                    No versions match your search
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        paginatedVersions.map((version) => (
                                            <TableRow key={version.id} hover>
                                                <TableCell>
                                                    <Typography variant="body2">
                                                        {new Date(version.snapshotAt).toLocaleString()}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                                                        {version.templateName}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="center">
                                                    {version.isBackupSnapshot ? (
                                                        <Tooltip title="Protected backup snapshot - cannot be deleted">
                                                            <Chip
                                                                icon={<LockIcon />}
                                                                label="Protected"
                                                                color="warning"
                                                                size="small"
                                                            />
                                                        </Tooltip>
                                                    ) : (
                                                        <Chip
                                                            label="Manual"
                                                            color="default"
                                                            size="small"
                                                        />
                                                    )}
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                                                        <Tooltip title="Download this version">
                                                            <IconButton
                                                                size="small"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDownload(version.id, version.templateName);
                                                                }}
                                                                disabled={downloadingId !== null || deletingId !== null}
                                                            >
                                                                {downloadingId === version.id ? (
                                                                    <CircularProgress size={20} />
                                                                ) : (
                                                                    <DownloadIcon fontSize="small" />
                                                                )}
                                                            </IconButton>
                                                        </Tooltip>
                                                        {!version.isBackupSnapshot && (
                                                            <Tooltip title="Delete this version">
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDelete(version.id);
                                                                    }}
                                                                    disabled={downloadingId !== null || deletingId !== null}
                                                                    color="error"
                                                                >
                                                                    {deletingId === version.id ? (
                                                                        <CircularProgress size={20} />
                                                                    ) : (
                                                                        <DeleteIcon fontSize="small" />
                                                                    )}
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                    </Box>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>

                        {/* Pagination */}
                        <TablePagination
                            component="div"
                            count={filteredVersions.length}
                            page={page}
                            onPageChange={handleChangePage}
                            rowsPerPage={rowsPerPage}
                            onRowsPerPageChange={handleChangeRowsPerPage}
                            rowsPerPageOptions={[5, 10, 25, 50]}
                        />
                    </>
                )}
                </Box>
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
