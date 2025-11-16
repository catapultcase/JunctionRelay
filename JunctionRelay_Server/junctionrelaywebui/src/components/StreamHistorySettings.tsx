import React, { useState, useEffect } from 'react';
import {
    Paper, Typography, Box, Slider, Switch, FormControlLabel, Button,
    Alert, Divider, CircularProgress, Chip, Dialog, DialogTitle,
    DialogContent, DialogActions, RadioGroup, Radio, FormLabel
} from '@mui/material';
import {
    History as HistoryIcon,
    Save as SaveIcon,
    Clear as ClearIcon,
    Memory as MemoryIcon,
    Storage as StorageIcon,
    FileDownload as FileDownloadIcon
} from '@mui/icons-material';

interface StreamHistorySettingsProps {
    showSnackbar: (message: string, severity?: 'success' | 'error' | 'warning' | 'info') => void;
}

interface HistoryConfiguration {
    retentionHours: number;
    maxEntriesPerStream: number;
    cleanupInterval: string;
    estimatedMemoryUsage: string;
    totalActiveStreams: number;
    loggingEnabled: boolean;
}

const StreamHistorySettings: React.FC<StreamHistorySettingsProps> = ({ showSnackbar }) => {
    const [config, setConfig] = useState<HistoryConfiguration | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);
    const [clearing, setClearing] = useState<boolean>(false);

    // Local state for UI controls
    const [retentionHours, setRetentionHours] = useState<number>(24);
    const [maxEntries, setMaxEntries] = useState<number>(10000);
    const [loggingEnabled, setLoggingEnabled] = useState<boolean>(true);
    const [memoryEstimate, setMemoryEstimate] = useState<string>('');

    // Export modal state
    const [exportModalOpen, setExportModalOpen] = useState<boolean>(false);
    const [exportLoading, setExportLoading] = useState<boolean>(false);

    const loadConfiguration = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/streamhistory/configuration');
            if (response.ok) {
                const data: HistoryConfiguration = await response.json();
                setConfig(data);
                setRetentionHours(data.retentionHours);
                setMaxEntries(data.maxEntriesPerStream);
                setLoggingEnabled(data.loggingEnabled);
                setMemoryEstimate(data.estimatedMemoryUsage);
            } else {
                throw new Error('Failed to load configuration');
            }
        } catch (error) {
            console.error('Failed to load stream history configuration:', error);
            showSnackbar('Failed to load stream history configuration', 'error');
        } finally {
            setLoading(false);
        }
    };

    const updateMemoryEstimate = async () => {
        try {
            const response = await fetch('/api/streamhistory/memory-estimate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    retentionHours,
                    maxEntriesPerStream: maxEntries
                })
            });

            if (response.ok) {
                const data = await response.json();
                setMemoryEstimate(data.estimatedMemoryUsage || 'Unknown');
            }
        } catch (error) {
            console.error('Failed to get memory estimate:', error);
        }
    };

    const saveConfiguration = async () => {
        try {
            setSaving(true);
            const response = await fetch('/api/streamhistory/configuration', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    retentionHours,
                    maxEntriesPerStream: maxEntries,
                    loggingEnabled
                })
            });

            if (response.ok) {
                await loadConfiguration(); // Reload to get updated estimates
                showSnackbar('Stream history configuration saved successfully', 'success');
            } else {
                throw new Error('Failed to save configuration');
            }
        } catch (error) {
            showSnackbar('Error saving stream history configuration', 'error');
        } finally {
            setSaving(false);
        }
    };

    const clearAllHistory = async () => {
        try {
            setClearing(true);
            const response = await fetch('/api/streamhistory/all', {
                method: 'DELETE'
            });

            if (response.ok) {
                showSnackbar('All stream history cleared successfully', 'success');
                await loadConfiguration(); // Reload configuration
            } else {
                throw new Error('Failed to clear history');
            }
        } catch (error) {
            showSnackbar('Error clearing stream history', 'error');
        } finally {
            setClearing(false);
        }
    };

    const handleExportAllStreams = async () => {
        try {
            setExportLoading(true);

            const url = '/api/streamhistory/export';
            const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
            const filename = `all_streams_history_${timestamp}.csv`;

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Failed to export data');
            }

            const blob = await response.blob();
            const downloadUrl = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(downloadUrl);

            showSnackbar(`CSV export completed: ${filename}`, 'success');
            setExportModalOpen(false);
        } catch (error) {
            console.error('Export error:', error);
            showSnackbar('Error exporting CSV data', 'error');
        } finally {
            setExportLoading(false);
        }
    };

    // Load configuration on mount
    useEffect(() => {
        loadConfiguration();
    }, []);

    // Update memory estimate when sliders change
    useEffect(() => {
        const debounceTimer = setTimeout(() => {
            if (config) { // Only update if config is loaded
                updateMemoryEstimate();
            }
        }, 300);

        return () => clearTimeout(debounceTimer);
    }, [retentionHours, maxEntries, config]);

    if (loading) {
        return (
            <Paper sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
                    <CircularProgress />
                </Box>
            </Paper>
        );
    }

    return (
        <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                <HistoryIcon sx={{ mr: 1 }} />
                Stream History Configuration
            </Typography>

            {/* Warning about in-memory storage */}
            <Alert severity="info" sx={{ mb: 3 }}>
                <Typography variant="body2">
                    <strong>Important:</strong> Stream history is stored in memory only and will be lost when the application restarts.
                    This is designed for real-time monitoring and troubleshooting, not long-term data storage.
                </Typography>
            </Alert>

            {/* Logging Enable/Disable Toggle */}
            <Box sx={{ mb: 3, p: 2, backgroundColor: 'grey.50', borderRadius: 1 }}>
                <FormControlLabel
                    control={
                        <Switch
                            checked={loggingEnabled}
                            onChange={(e) => setLoggingEnabled(e.target.checked)}
                            color="primary"
                        />
                    }
                    label={
                        <Box>
                            <Typography variant="subtitle1" fontWeight="bold">
                                Enable History Logging
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {loggingEnabled
                                    ? 'Stream history is being collected and stored in memory. Real-time stream monitoring remains active regardless of this setting.'
                                    : 'Stream history collection is disabled - no historical data will be stored. Real-time stream monitoring in the Details tab remains active.'
                                }
                            </Typography>
                        </Box>
                    }
                />
            </Box>

            {/* Configuration Sliders */}
            <Box sx={{ mb: 3 }}>
                <Box sx={{ mb: 3 }}>
                    <Typography gutterBottom>
                        Retention Period: {retentionHours} hours
                    </Typography>
                    <Slider
                        value={retentionHours}
                        onChange={(_, value) => setRetentionHours(value as number)}
                        min={1}
                        max={168} // 1 week
                        step={1}
                        marks={[
                            { value: 1, label: '1h' },
                            { value: 24, label: '1d' },
                            { value: 72, label: '3d' },
                            { value: 168, label: '1w' }
                        ]}
                        disabled={!loggingEnabled}
                        sx={{ mb: 2 }}
                    />
                </Box>

                <Box sx={{ mb: 3 }}>
                    <Typography gutterBottom>
                        Max Entries per Stream: {maxEntries.toLocaleString()}
                    </Typography>
                    <Slider
                        value={maxEntries}
                        onChange={(_, value) => setMaxEntries(value as number)}
                        min={100}
                        max={50000}
                        step={500}
                        marks={[
                            { value: 1000, label: '1K' },
                            { value: 10000, label: '10K' },
                            { value: 25000, label: '25K' },
                            { value: 50000, label: '50K' }
                        ]}
                        disabled={!loggingEnabled}
                        sx={{ mb: 2 }}
                    />
                </Box>
            </Box>

            {/* Current Status Info */}
            {config && (
                <Box sx={{ mb: 3, p: 2, backgroundColor: 'rgba(0, 0, 0, 0.02)', borderRadius: 1 }}>
                    <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                        <StorageIcon sx={{ mr: 1, fontSize: 16 }} />
                        Current Status
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                        <Chip
                            size="small"
                            label={`${config.totalActiveStreams} Active Streams`}
                            color="primary"
                            variant="outlined"
                        />
                        <Chip
                            size="small"
                            label={`Cleanup: ${config.cleanupInterval}`}
                            variant="outlined"
                        />
                        <Chip
                            size="small"
                            label={`Logging: ${loggingEnabled ? 'Enabled' : 'Disabled'}`}
                            color={loggingEnabled ? 'success' : 'default'}
                            variant="outlined"
                        />
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                        <MemoryIcon sx={{ mr: 1, fontSize: 16 }} />
                        Estimated Memory Usage: <strong style={{ marginLeft: 4 }}>{memoryEstimate}</strong>
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        * Estimate based on active streams and actual collection rates. Updates automatically as you adjust settings.
                    </Typography>
                </Box>
            )}

            <Divider sx={{ my: 3 }} />

            {/* Action Buttons */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button
                    variant="contained"
                    onClick={saveConfiguration}
                    disabled={saving}
                    startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
                >
                    {saving ? 'Saving...' : 'Save Configuration'}
                </Button>

                <Button
                    variant="outlined"
                    onClick={() => setExportModalOpen(true)}
                    disabled={!config || config.totalActiveStreams === 0}
                    startIcon={<FileDownloadIcon />}
                >
                    Export All History
                </Button>

                <Button
                    variant="outlined"
                    color="error"
                    onClick={clearAllHistory}
                    disabled={clearing}
                    startIcon={clearing ? <CircularProgress size={16} /> : <ClearIcon />}
                >
                    {clearing ? 'Clearing...' : 'Clear All History'}
                </Button>

                <Box sx={{ ml: 'auto' }}>
                    <Typography variant="body2" color="text.secondary">
                        Changes take effect immediately
                    </Typography>
                </Box>
            </Box>

            {/* Export Confirmation Modal */}
            <Dialog open={exportModalOpen} onClose={() => setExportModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Export All Stream History to CSV</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Export history data for all streams as a CSV file for analysis in spreadsheet applications.
                    </Typography>

                    {config && (
                        <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                            <Typography variant="body2">
                                <strong>Export Details:</strong><br />
                                • {config.totalActiveStreams} active streams<br />
                                • Full data export (no sampling)<br />
                                • Current data retention period: {retentionHours} hours<br />
                            </Typography>
                        </Box>
                    )}

                    <Alert severity="info">
                        <Typography variant="body2">
                            • Large exports may take a few moments to generate<br />
                            • The CSV will include all available historical data<br />
                            • File will be named with current timestamp
                        </Typography>
                    </Alert>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setExportModalOpen(false)} disabled={exportLoading}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleExportAllStreams}
                        variant="contained"
                        disabled={exportLoading}
                        startIcon={exportLoading ? <CircularProgress size={16} /> : <FileDownloadIcon />}
                    >
                        {exportLoading ? 'Exporting...' : 'Export All Streams'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
};

export default StreamHistorySettings;