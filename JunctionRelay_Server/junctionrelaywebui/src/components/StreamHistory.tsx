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
    Box, Typography, TextField, Button, Chip, Alert, Snackbar,
    FormControl, InputLabel, Select, MenuItem,
    Card, CardContent, CircularProgress, Slider,
    Switch, FormControlLabel, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, TablePagination, IconButton, Collapse, TableSortLabel,
    Dialog, DialogTitle, DialogContent, DialogActions, RadioGroup, Radio, FormLabel
} from '@mui/material';

import Settings from '@mui/icons-material/Settings';
import Clear from '@mui/icons-material/Clear';
import Refresh from '@mui/icons-material/Refresh';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ExpandLess from '@mui/icons-material/ExpandLess';
import Wifi from '@mui/icons-material/Wifi';
import WifiOff from '@mui/icons-material/WifiOff';
import History from '@mui/icons-material/History';
import SamplingIcon from '@mui/icons-material/Timeline';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUp from '@mui/icons-material/KeyboardArrowUp';
import FileDownload from '@mui/icons-material/FileDownload';

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    AreaChart,
    Area
} from 'recharts';

interface StreamHistoryEntry {
    timestamp: string;
    screenId: number;
    deviceName: string;
    screenName: string;
    protocol: string;
    status: string;
    latency: number;
    sensorsCount: number;
    rate: number;
    connectionState: string;
    successRate: number;
    consecutiveFailures: number;
    consecutiveSuccesses: number;
    averageLatency: number;
    lastErrorMessage?: string;
    errorType?: string;
    protocolSpecificData: { [key: string]: any };
}

interface StreamStatistics {
    periodStart: string;
    periodEnd: string;
    period: string;
    totalDataPoints: number;
    averageLatency: number;
    minLatency: number;
    maxLatency: number;
    successRate: number;
    totalFailures: number;
    totalSuccesses: number;
    errorTypeCounts: { [key: string]: number };
    statusChanges: string[];
}

interface StreamHistoryResponse {
    screenId: number;
    deviceName: string;
    screenName: string;
    protocol: string;
    oldestEntry: string;
    newestEntry: string;
    totalEntries: number;
    sampledEntries?: number;
    samplingRatio?: number;
    isSampled?: boolean;
    entries: StreamHistoryEntry[];
    statistics?: StreamStatistics;
}

interface StreamHistoryProps {
    streamId: number;
}

type SortField = 'timestamp' | 'status' | 'connectionState' | 'latency' | 'successRate' | 'consecutiveFailures';
type SortDirection = 'asc' | 'desc';

const StreamHistory: React.FC<StreamHistoryProps> = ({ streamId }) => {
    const [currentHistory, setCurrentHistory] = useState<StreamHistoryResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackSeverity, setSnackSeverity] = useState<'success' | 'error' | 'warning' | 'info'>('success');

    // Configuration state
    const [retentionHours, setRetentionHours] = useState<number>(24);
    const [maxEntries, setMaxEntries] = useState<number>(10000);
    const [memoryEstimate, setMemoryEstimate] = useState<string>('');
    const [loggingEnabled, setLoggingEnabled] = useState<boolean>(true);

    // Configuration panel collapse state with localStorage
    const [configCollapsed, setConfigCollapsed] = useState<boolean>(() => {
        try {
            return localStorage.getItem('stream_history_config_collapsed') === 'true';
        } catch {
            return false;
        }
    });

    // Auto-refresh state with localStorage (global setting)
    const [autoRefresh, setAutoRefresh] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem('stream_history_auto_refresh');
            return saved === 'true';
        } catch {
            return false;
        }
    });

    // Time filtering
    const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d' | 'custom'>('24h');
    const [customFromTime, setCustomFromTime] = useState<string>('');
    const [customToTime, setCustomToTime] = useState<string>('');

    // Display options
    const [showStatistics, setShowStatistics] = useState<boolean>(true);
    const [pageSize, setPageSize] = useState<number>(50);
    const [page, setPage] = useState<number>(0);
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

    // Sorting state with localStorage
    const [sortField, setSortField] = useState<SortField>(() => {
        try {
            return (localStorage.getItem('stream_history_sort_field') as SortField) || 'timestamp';
        } catch {
            return 'timestamp';
        }
    });
    const [sortDirection, setSortDirection] = useState<SortDirection>(() => {
        try {
            return (localStorage.getItem('stream_history_sort_direction') as SortDirection) || 'desc';
        } catch {
            return 'desc';
        }
    });

    const [tableSamplingEnabled, setTableSamplingEnabled] = useState<boolean>(() => {
        try {
            const stored = localStorage.getItem('stream_history_table_sampling');
            if (stored === null) {
                localStorage.setItem('stream_history_table_sampling', 'true');
                return true;
            }
            return stored === 'true';
        } catch {
            return true; // Fallback if localStorage is not available
        }
    });

    // Export modal state
    const [exportModalOpen, setExportModalOpen] = useState<boolean>(false);
    const [exportScope, setExportScope] = useState<'current' | 'all'>('current');
    const [exportLoading, setExportLoading] = useState<boolean>(false);

    // Chart sampling - using backend sampling with max 200 points
    const maxChartPoints = 200;

    // Save preferences to localStorage
    useEffect(() => {
        try {
            localStorage.setItem('stream_history_auto_refresh', autoRefresh.toString());
        } catch {
        }
    }, [autoRefresh]);

    useEffect(() => {
        try {
            localStorage.setItem('stream_history_config_collapsed', configCollapsed.toString());
        } catch {
        }
    }, [configCollapsed]);

    // Save sort preferences to localStorage
    useEffect(() => {
        try {
            localStorage.setItem('stream_history_sort_field', sortField);
        } catch {
        }
    }, [sortField]);

    useEffect(() => {
        try {
            localStorage.setItem('stream_history_sort_direction', sortDirection);
        } catch {
        }
    }, [sortDirection]);

    // Save table sampling preference to localStorage and reload data
    useEffect(() => {
        try {
            localStorage.setItem('stream_history_table_sampling', tableSamplingEnabled.toString());
        } catch {
        }

        // Reload data when sampling preference changes (but not on initial mount)
        if (streamId) {
            const timeoutId = setTimeout(() => {
                loadStreamHistory(streamId, false);
            }, 50);

            return () => clearTimeout(timeoutId);
        }
    }, [tableSamplingEnabled, streamId]);

    // Auto-refresh effect
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (autoRefresh && streamId) {
            interval = setInterval(() => {
                // Silent refresh - no loading indicator, no position reset
                loadStreamHistory(streamId, true);
            }, 10000); // Refresh every 10 seconds
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [autoRefresh, streamId]);

    // Load initial data
    useEffect(() => {
        loadConfiguration();
    }, []);

    // Load history when streamId changes
    useEffect(() => {
        if (streamId) {
            loadStreamHistory(streamId, false); // Not silent for initial load
        }
    }, [streamId]);

    // Update memory estimate when sliders change
    useEffect(() => {
        const debounceTimer = setTimeout(() => {
            getMemoryEstimate();
        }, 300); // Debounce API calls

        return () => clearTimeout(debounceTimer);
    }, [retentionHours, maxEntries]);

    // Memoized chart data - backend handles sampling
    const chartData = useMemo(() => {
        if (!currentHistory?.entries || currentHistory.entries.length === 0) {
            return [];
        }

        return currentHistory.entries.map(entry => ({
            timestamp: new Date(entry.timestamp).toLocaleTimeString(),
            latency: entry.latency || 0,
            successRate: entry.successRate || 0,
            consecutiveFailures: entry.consecutiveFailures || 0,
            averageLatency: entry.averageLatency || 0
        }));
    }, [currentHistory?.entries]);

    // Memoized sorted entries for table
    const sortedEntries = useMemo(() => {
        if (!currentHistory?.entries) return [];

        const sorted = [...currentHistory.entries].sort((a, b) => {
            let aValue: any;
            let bValue: any;

            switch (sortField) {
                case 'timestamp':
                    aValue = new Date(a.timestamp).getTime();
                    bValue = new Date(b.timestamp).getTime();
                    break;
                case 'status':
                    aValue = a.status.toLowerCase();
                    bValue = b.status.toLowerCase();
                    break;
                case 'connectionState':
                    aValue = a.connectionState.toLowerCase();
                    bValue = b.connectionState.toLowerCase();
                    break;
                case 'latency':
                    aValue = a.latency;
                    bValue = b.latency;
                    break;
                case 'successRate':
                    aValue = a.successRate;
                    bValue = b.successRate;
                    break;
                case 'consecutiveFailures':
                    aValue = a.consecutiveFailures;
                    bValue = b.consecutiveFailures;
                    break;
                default:
                    return 0;
            }

            if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        return sorted;
    }, [currentHistory?.entries, sortField, sortDirection]);

    const handleSortRequest = (field: SortField) => {
        const isAsc = sortField === field && sortDirection === 'asc';
        setSortDirection(isAsc ? 'desc' : 'asc');
        setSortField(field);
        setPage(0); // Reset to first page when sorting
    };

    const showSnackbar = (message: string, severity: typeof snackSeverity = 'success') => {
        setSnackMessage(message);
        setSnackSeverity(severity);
    };

    const getTimeRangeParams = () => {
        const now = new Date();
        let fromTime: Date | null = null;
        let toTime: Date | null = null;

        switch (timeRange) {
            case '1h':
                fromTime = new Date(now.getTime() - 60 * 60 * 1000);
                break;
            case '6h':
                fromTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
                break;
            case '24h':
                fromTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case '7d':
                fromTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'custom':
                if (customFromTime) fromTime = new Date(customFromTime);
                if (customToTime) toTime = new Date(customToTime);
                break;
        }

        return { fromTime, toTime };
    };

    const loadConfiguration = async () => {
        try {
            const response = await fetch('/api/streamhistory/configuration');
            if (response.ok) {
                const data = await response.json();
                setRetentionHours(data.retentionHours || 24);
                setMaxEntries(data.maxEntriesPerStream || 10000);
                setMemoryEstimate(data.estimatedMemoryUsage || 'Unknown');
                setLoggingEnabled(data.loggingEnabled ?? true);
            }
        } catch (error) {
            console.error('Failed to load configuration:', error);
        }
    };

    const loadStreamHistory = async (screenId: number, silent: boolean = false) => {
        if (!screenId) return;

        try {
            // Only show loading indicator for non-silent loads
            if (!silent) {
                setLoading(true);
            }

            const { fromTime, toTime } = getTimeRangeParams();

            const params = new URLSearchParams();
            if (fromTime) params.append('fromTime', fromTime.toISOString());
            if (toTime) params.append('toTime', toTime.toISOString());
            params.append('includeStatistics', showStatistics.toString());

            // Charts always use sampling for performance, table uses user preference
            if (tableSamplingEnabled) {
                params.append('sample', 'true');
                params.append('maxPoints', maxChartPoints.toString());
            } else {
                params.append('sample', 'false');
            }

            const response = await fetch(`/api/streamhistory/stream/${screenId}?${params}`);
            if (response.ok) {
                const data: StreamHistoryResponse = await response.json();
                setCurrentHistory(data);

                // Only reset pagination on manual loads, not auto-refresh
                if (!silent) {
                    setPage(0);
                    setExpandedRows(new Set()); // Reset expanded rows on manual refresh
                }
            } else {
                if (!silent) {
                    showSnackbar('Failed to load stream history', 'error');
                }
            }
        } catch (error) {
            if (!silent) {
                showSnackbar('Error loading stream history', 'error');
            }
        } finally {
            if (!silent) {
                setLoading(false);
            }
        }
    };

    const getMemoryEstimate = async () => {
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

    const updateConfiguration = async () => {
        try {
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
                await response.json();
                showSnackbar('Configuration saved successfully', 'success');
                loadConfiguration(); // Reload to get updated estimates
            } else {
                showSnackbar('Failed to save configuration', 'error');
            }
        } catch (error) {
            showSnackbar('Error saving configuration', 'error');
        }
    };

    const clearStreamHistory = async (screenId: number) => {
        try {
            const response = await fetch(`/api/streamhistory/stream/${screenId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                setCurrentHistory(null);
                showSnackbar('Stream history cleared', 'success');
            } else {
                showSnackbar('Failed to clear history', 'error');
            }
        } catch (error) {
            showSnackbar('Error clearing history', 'error');
        }
    };

    const clearAllHistory = async () => {
        try {
            const response = await fetch('/api/streamhistory/all', {
                method: 'DELETE'
            });

            if (response.ok) {
                setCurrentHistory(null);
                showSnackbar('All history cleared', 'success');
            } else {
                showSnackbar('Failed to clear all history', 'error');
            }
        } catch (error) {
            showSnackbar('Error clearing all history', 'error');
        }
    };

    const toggleRowExpansion = (index: number) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(index)) {
            newExpanded.delete(index);
        } else {
            newExpanded.add(index);
        }
        setExpandedRows(newExpanded);
    };

    const handleExportCSV = async () => {
        try {
            setExportLoading(true);

            let url: string;
            let filename: string;
            const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);

            if (exportScope === 'current') {
                if (!streamId) {
                    showSnackbar('No stream selected for export', 'error');
                    return;
                }

                const { fromTime, toTime } = getTimeRangeParams();
                const params = new URLSearchParams();
                if (fromTime) params.append('fromTime', fromTime.toISOString());
                if (toTime) params.append('toTime', toTime.toISOString());
                params.append('includeStatistics', 'false'); // Don't need stats for CSV
                params.append('sample', 'false'); // Always get full data for export

                url = `/api/streamhistory/stream/${streamId}/export?${params}`;
                filename = `stream_${streamId}_history_${timestamp}.csv`;
            } else {
                // Export all streams
                const { fromTime, toTime } = getTimeRangeParams();
                const params = new URLSearchParams();
                if (fromTime) params.append('fromTime', fromTime.toISOString());
                if (toTime) params.append('toTime', toTime.toISOString());
                params.append('includeStatistics', 'false');

                url = `/api/streamhistory/export?${params}`;
                filename = `all_streams_history_${timestamp}.csv`;
            }

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

    const formatTimestamp = (timestamp: string) => {
        return new Date(timestamp).toLocaleString();
    };

    const getStatusColor = (status: string, connectionState: string) => {
        if (status.toLowerCase() === 'active' && connectionState === 'good') return '#4caf50';
        if (status.toLowerCase() === 'active' && connectionState === 'poor') return '#ff9800';
        if (status.toLowerCase() === 'inactive' || connectionState === 'disconnected') return '#f44336';
        return '#607d8b';
    };

    const renderChartSamplingIndicator = () => {
        if (!currentHistory?.isSampled) return null;

        return (
            <Box sx={{ mb: 2, p: 1, backgroundColor: 'info.light', borderRadius: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <SamplingIcon fontSize="small" />
                <Typography variant="caption" color="info.contrastText">
                    Data sampling active: Showing {currentHistory.sampledEntries} of {currentHistory.totalEntries} data points
                    ({((currentHistory.samplingRatio || 0) * 100).toFixed(1)}% sample rate) for better performance
                </Typography>
            </Box>
        );
    };

    return (
        <Box sx={{ maxWidth: '100%' }}>
            {/* Time Range and Controls */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Box display="flex" flexWrap="wrap" gap={2} alignItems="center" justifyContent="space-between">
                        <Box display="flex" flexWrap="wrap" gap={2} alignItems="center">
                            <Box sx={{ minWidth: 200 }}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Time Range</InputLabel>
                                    <Select
                                        value={timeRange}
                                        label="Time Range"
                                        onChange={(e) => setTimeRange(e.target.value as any)}
                                    >
                                        <MenuItem value="1h">Last Hour</MenuItem>
                                        <MenuItem value="6h">Last 6 Hours</MenuItem>
                                        <MenuItem value="24h">Last 24 Hours</MenuItem>
                                        <MenuItem value="7d">Last 7 Days</MenuItem>
                                        <MenuItem value="custom">Custom Range</MenuItem>
                                    </Select>
                                </FormControl>
                            </Box>

                            {timeRange === 'custom' && (
                                <Box display="flex" gap={2}>
                                    <TextField
                                        label="From"
                                        type="datetime-local"
                                        value={customFromTime}
                                        onChange={(e) => setCustomFromTime(e.target.value)}
                                        size="small"
                                        sx={{ minWidth: 200 }}
                                        InputLabelProps={{ shrink: true }}
                                    />
                                    <TextField
                                        label="To"
                                        type="datetime-local"
                                        value={customToTime}
                                        onChange={(e) => setCustomToTime(e.target.value)}
                                        size="small"
                                        sx={{ minWidth: 200 }}
                                        InputLabelProps={{ shrink: true }}
                                    />
                                </Box>
                            )}

                            <Button
                                variant="contained"
                                onClick={() => loadStreamHistory(streamId, false)}
                                disabled={!streamId || loading}
                                size="small"
                            >
                                Apply
                            </Button>
                        </Box>

                        <Box display="flex" alignItems="center" gap={2}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={autoRefresh}
                                        onChange={(e) => setAutoRefresh(e.target.checked)}
                                        size="small"
                                    />
                                }
                                label={
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <span>Auto Refresh</span>
                                        {autoRefresh && (
                                            <Chip
                                                label="10s"
                                                size="small"
                                                color="primary"
                                                sx={{ height: 18, fontSize: '10px' }}
                                            />
                                        )}
                                    </Box>
                                }
                            />
                            <Button
                                variant="outlined"
                                startIcon={<Refresh />}
                                onClick={() => loadStreamHistory(streamId, false)}
                                size="small"
                                disabled={loading || !streamId}
                            >
                                Refresh
                            </Button>
                        </Box>
                    </Box>
                </CardContent>
            </Card>

            {/* Loading State */}
            {loading && (
                <Box display="flex" justifyContent="center" py={4}>
                    <CircularProgress />
                </Box>
            )}

            {/* Configuration Panel - Collapsible */}
            <Card sx={{ mb: 4 }}>
                <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={configCollapsed ? 0 : 2}>
                        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Settings /> History Configuration
                        </Typography>
                        <IconButton
                            onClick={() => setConfigCollapsed(!configCollapsed)}
                            size="small"
                        >
                            {configCollapsed ? <KeyboardArrowDown /> : <KeyboardArrowUp />}
                        </IconButton>
                    </Box>

                    <Collapse in={!configCollapsed}>
                        <Box>
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
                                                    ? 'Stream history is being collected and stored in memory'
                                                    : 'Stream history collection is disabled - no historical data will be stored. Real-time stream monitoring in the Details tab remains active.'
                                                }
                                            </Typography>
                                        </Box>
                                    }
                                />
                            </Box>

                            <Box display="flex" flexWrap="wrap" gap={4} alignItems="center">
                                <Box sx={{ minWidth: 300, flex: 1 }}>
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
                                    />
                                </Box>

                                <Box sx={{ minWidth: 300, flex: 1 }}>
                                    <Typography gutterBottom>
                                        Max Entries per Stream: {maxEntries}
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
                                    />
                                </Box>

                                <Box display="flex" flexDirection="column" gap={1} sx={{ minWidth: 200 }}>
                                    <Button
                                        variant="contained"
                                        onClick={updateConfiguration}
                                        fullWidth
                                    >
                                        Save Configuration
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        color="error"
                                        onClick={clearAllHistory}
                                        fullWidth
                                        startIcon={<Clear />}
                                    >
                                        Clear All History
                                    </Button>
                                </Box>
                            </Box>

                            {/* Memory usage estimation */}
                            <Box sx={{ mt: 3, p: 2, backgroundColor: 'grey.50', borderRadius: 1 }}>
                                <Typography variant="subtitle2" gutterBottom>
                                    Estimated Memory Usage
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    With current settings: <strong>{memoryEstimate}</strong>
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                    * Estimate based on active streams and actual collection rates. Updates automatically as you adjust settings.
                                </Typography>
                            </Box>
                        </Box>
                    </Collapse>
                </CardContent>
            </Card>

            {/* History Content */}
            {currentHistory && !loading && (
                <Box display="flex" flexDirection="column" gap={3}>
                    {/* Summary Cards */}
                    <Box display="flex" flexWrap="wrap" gap={2}>
                        <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
                            <Card>
                                <CardContent sx={{ textAlign: 'center' }}>
                                    <Typography variant="h6" color="primary">
                                        {currentHistory.totalEntries}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        Total Entries
                                    </Typography>
                                    {currentHistory.isSampled && (
                                        <Typography variant="caption" color="info.main" sx={{ display: 'block' }}>
                                            ({currentHistory.sampledEntries} shown)
                                        </Typography>
                                    )}
                                </CardContent>
                            </Card>
                        </Box>

                        <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
                            <Card>
                                <CardContent sx={{ textAlign: 'center' }}>
                                    <Typography variant="h6" color="success.main">
                                        {currentHistory.statistics?.successRate.toFixed(1)}%
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        Success Rate
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Box>

                        <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
                            <Card>
                                <CardContent sx={{ textAlign: 'center' }}>
                                    <Typography variant="h6" color="info.main">
                                        {currentHistory.statistics?.averageLatency.toFixed(1)}ms
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        Avg Latency
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Box>

                        <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
                            <Card>
                                <CardContent sx={{ textAlign: 'center' }}>
                                    <Typography variant="h6" color="error.main">
                                        {currentHistory.statistics?.totalFailures || 0}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        Total Failures
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Box>
                    </Box>

                    {/* Charts */}
                    {chartData.length > 1 && (
                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    Performance Charts
                                </Typography>

                                {/* Data Sampling Indicator */}
                                {renderChartSamplingIndicator()}

                                <Box display="flex" flexWrap="wrap" gap={2}>
                                    <Box sx={{ flex: '1 1 400px', minWidth: 400 }}>
                                        <Typography variant="subtitle2" gutterBottom>
                                            Latency Over Time
                                        </Typography>
                                        <ResponsiveContainer width="100%" height={300}>
                                            <LineChart data={chartData}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="timestamp" />
                                                <YAxis />
                                                <Tooltip />
                                                <Legend />
                                                <Line
                                                    type="monotone"
                                                    dataKey="latency"
                                                    stroke="#2196f3"
                                                    strokeWidth={2}
                                                    dot={false}
                                                    isAnimationActive={false}
                                                />
                                                <Line
                                                    type="monotone"
                                                    dataKey="averageLatency"
                                                    stroke="#ff9800"
                                                    strokeWidth={1}
                                                    strokeDasharray="5 5"
                                                    dot={false}
                                                    isAnimationActive={false}
                                                />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </Box>

                                    <Box sx={{ flex: '1 1 400px', minWidth: 400 }}>
                                        <Typography variant="subtitle2" gutterBottom>
                                            Success Rate Over Time
                                        </Typography>
                                        <ResponsiveContainer width="100%" height={300}>
                                            <AreaChart data={chartData}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="timestamp" />
                                                <YAxis domain={[0, 100]} />
                                                <Tooltip />
                                                <Legend />
                                                <Area
                                                    type="monotone"
                                                    dataKey="successRate"
                                                    stroke="#4caf50"
                                                    fill="#4caf50"
                                                    fillOpacity={0.3}
                                                    isAnimationActive={false}
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </Box>
                                </Box>
                            </CardContent>
                        </Card>
                    )}

                    {/* History Table */}
                    <Card>
                        <CardContent>
                            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                                <Typography variant="h6">
                                    History Entries ({sortedEntries.length})
                                    {currentHistory.isSampled && (
                                        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                            (Sampled from {currentHistory.totalEntries} total)
                                        </Typography>
                                    )}
                                </Typography>
                                <Box display="flex" alignItems="center" gap={1}>
                                    {!tableSamplingEnabled && currentHistory.totalEntries > 1000 && (
                                        <Chip
                                            icon={<SamplingIcon />}
                                            label={`${currentHistory.totalEntries} records`}
                                            color="warning"
                                            size="small"
                                        />
                                    )}
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={tableSamplingEnabled}
                                                onChange={(e) => setTableSamplingEnabled(e.target.checked)}
                                                size="small"
                                            />
                                        }
                                        label={
                                            <Box display="flex" alignItems="center" gap={1}>
                                                <SamplingIcon fontSize="small" />
                                                <span>Sample Table</span>
                                            </Box>
                                        }
                                        sx={{ mr: 1 }}
                                    />
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        startIcon={<FileDownload />}
                                        onClick={() => setExportModalOpen(true)}
                                        sx={{ mr: 1 }}
                                    >
                                        Export CSV
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        startIcon={<Clear />}
                                        onClick={() => clearStreamHistory(currentHistory.screenId)}
                                        color="error"
                                    >
                                        Clear History
                                    </Button>
                                </Box>
                            </Box>

                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>
                                                <TableSortLabel
                                                    active={sortField === 'timestamp'}
                                                    direction={sortField === 'timestamp' ? sortDirection : 'asc'}
                                                    onClick={() => handleSortRequest('timestamp')}
                                                >
                                                    Timestamp
                                                </TableSortLabel>
                                            </TableCell>
                                            <TableCell>
                                                <TableSortLabel
                                                    active={sortField === 'status'}
                                                    direction={sortField === 'status' ? sortDirection : 'asc'}
                                                    onClick={() => handleSortRequest('status')}
                                                >
                                                    Status
                                                </TableSortLabel>
                                            </TableCell>
                                            <TableCell>
                                                <TableSortLabel
                                                    active={sortField === 'connectionState'}
                                                    direction={sortField === 'connectionState' ? sortDirection : 'asc'}
                                                    onClick={() => handleSortRequest('connectionState')}
                                                >
                                                    Connection
                                                </TableSortLabel>
                                            </TableCell>
                                            <TableCell align="right">
                                                <TableSortLabel
                                                    active={sortField === 'latency'}
                                                    direction={sortField === 'latency' ? sortDirection : 'asc'}
                                                    onClick={() => handleSortRequest('latency')}
                                                >
                                                    Latency
                                                </TableSortLabel>
                                            </TableCell>
                                            <TableCell align="right">
                                                <TableSortLabel
                                                    active={sortField === 'successRate'}
                                                    direction={sortField === 'successRate' ? sortDirection : 'asc'}
                                                    onClick={() => handleSortRequest('successRate')}
                                                >
                                                    Success Rate
                                                </TableSortLabel>
                                            </TableCell>
                                            <TableCell align="right">
                                                <TableSortLabel
                                                    active={sortField === 'consecutiveFailures'}
                                                    direction={sortField === 'consecutiveFailures' ? sortDirection : 'asc'}
                                                    onClick={() => handleSortRequest('consecutiveFailures')}
                                                >
                                                    Failures
                                                </TableSortLabel>
                                            </TableCell>
                                            <TableCell>Actions</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {sortedEntries
                                            .slice(page * pageSize, page * pageSize + pageSize)
                                            .map((entry, index) => {
                                                const actualIndex = page * pageSize + index;
                                                const isExpanded = expandedRows.has(actualIndex);

                                                return (
                                                    <React.Fragment key={actualIndex}>
                                                        <TableRow>
                                                            <TableCell>
                                                                {formatTimestamp(entry.timestamp)}
                                                            </TableCell>
                                                            <TableCell>
                                                                <Chip
                                                                    label={entry.status}
                                                                    size="small"
                                                                    sx={{
                                                                        backgroundColor: getStatusColor(entry.status, entry.connectionState),
                                                                        color: 'white'
                                                                    }}
                                                                />
                                                            </TableCell>
                                                            <TableCell>
                                                                <Box display="flex" alignItems="center" gap={1}>
                                                                    {entry.connectionState === 'good' ? (
                                                                        <Wifi fontSize="small" color="success" />
                                                                    ) : entry.connectionState === 'poor' ? (
                                                                        <Wifi fontSize="small" color="warning" />
                                                                    ) : (
                                                                        <WifiOff fontSize="small" color="error" />
                                                                    )}
                                                                    <Typography variant="caption">
                                                                        {entry.connectionState}
                                                                    </Typography>
                                                                </Box>
                                                            </TableCell>
                                                            <TableCell align="right">
                                                                {entry.latency}ms
                                                            </TableCell>
                                                            <TableCell align="right">
                                                                {entry.successRate.toFixed(1)}%
                                                            </TableCell>
                                                            <TableCell align="right">
                                                                {entry.consecutiveFailures > 0 && (
                                                                    <Chip
                                                                        label={entry.consecutiveFailures}
                                                                        size="small"
                                                                        color="error"
                                                                    />
                                                                )}
                                                            </TableCell>
                                                            <TableCell>
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() => toggleRowExpansion(actualIndex)}
                                                                >
                                                                    {isExpanded ? <ExpandLess /> : <ExpandMore />}
                                                                </IconButton>
                                                            </TableCell>
                                                        </TableRow>

                                                        {/* Expanded Row Details */}
                                                        <TableRow>
                                                            <TableCell colSpan={7} sx={{ py: 0 }}>
                                                                <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                                                    <Box sx={{ p: 2, backgroundColor: 'grey.50' }}>
                                                                        <Box display="flex" flexWrap="wrap" gap={2}>
                                                                            {/* Performance Metrics */}
                                                                            <Box flex="1 1 300px" minWidth="250px">
                                                                                <Typography variant="subtitle2" gutterBottom>
                                                                                    Performance Metrics
                                                                                </Typography>
                                                                                <Typography variant="body2">
                                                                                    Average Latency: {entry.averageLatency.toFixed(1)}ms
                                                                                </Typography>
                                                                                <Typography variant="body2">
                                                                                    Consecutive Successes: {entry.consecutiveSuccesses}
                                                                                </Typography>
                                                                                <Typography variant="body2">
                                                                                    Sensors Count: {entry.sensorsCount}
                                                                                </Typography>
                                                                                <Typography variant="body2">
                                                                                    Rate: {entry.rate}ms
                                                                                </Typography>
                                                                            </Box>

                                                                            {/* Error Information */}
                                                                            {entry.lastErrorMessage && (
                                                                                <Box flex="1 1 300px" minWidth="250px">
                                                                                    <Typography variant="subtitle2" gutterBottom color="error">
                                                                                        Error Information
                                                                                    </Typography>
                                                                                    <Typography variant="body2" color="error">
                                                                                        Type: {entry.errorType}
                                                                                    </Typography>
                                                                                    <Typography variant="body2" color="error">
                                                                                        Message: {entry.lastErrorMessage}
                                                                                    </Typography>
                                                                                </Box>
                                                                            )}

                                                                            {/* Protocol-Specific Data */}
                                                                            {Object.keys(entry.protocolSpecificData).length > 0 && (
                                                                                <Box flex="1 1 100%" minWidth="100%">
                                                                                    <Typography variant="subtitle2" gutterBottom>
                                                                                        Protocol-Specific Data
                                                                                    </Typography>
                                                                                    <pre style={{ fontSize: '12px', overflow: 'auto' }}>
                                                                                        {JSON.stringify(entry.protocolSpecificData, null, 2)}
                                                                                    </pre>
                                                                                </Box>
                                                                            )}
                                                                        </Box>
                                                                    </Box>
                                                                </Collapse>
                                                            </TableCell>
                                                        </TableRow>
                                                    </React.Fragment>
                                                );
                                            })}
                                    </TableBody>
                                </Table>
                            </TableContainer>

                            <TablePagination
                                rowsPerPageOptions={[25, 50, 100, 200]}
                                component="div"
                                count={sortedEntries.length}
                                rowsPerPage={pageSize}
                                page={page}
                                onPageChange={(_, newPage) => setPage(newPage)}
                                onRowsPerPageChange={(e) => {
                                    setPageSize(parseInt(e.target.value, 10));
                                    setPage(0);
                                }}
                            />
                        </CardContent>
                    </Card>
                </Box>
            )}

            {/* Empty State */}
            {!currentHistory && !loading && (
                <Card>
                    <CardContent sx={{ textAlign: 'center', py: 8 }}>
                        <History sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                        <Typography variant="h6" color="text.secondary" gutterBottom>
                            {loggingEnabled ? 'No History Data Available' : 'History Logging Disabled'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {loggingEnabled
                                ? 'No history data found for this stream. Data may not have been collected yet or the retention period may have expired.'
                                : 'History logging is currently disabled. Enable logging in the configuration above to start collecting historical data. Stream monitoring remains active in the Details tab.'
                            }
                        </Typography>
                    </CardContent>
                </Card>
            )}

            {/* Snackbar */}
            <Snackbar
                open={Boolean(snackMessage)}
                autoHideDuration={5000}
                onClose={() => setSnackMessage(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert onClose={() => setSnackMessage(null)} severity={snackSeverity} sx={{ width: '100%' }}>
                    {snackMessage}
                </Alert>
            </Snackbar>

            {/* Export CSV Modal */}
            <Dialog open={exportModalOpen} onClose={() => setExportModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Export Stream History to CSV</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Export stream history data as a CSV file for analysis in spreadsheet applications.
                    </Typography>

                    <FormControl component="fieldset">
                        <FormLabel component="legend" sx={{ mb: 2 }}>Export Scope</FormLabel>
                        <RadioGroup
                            value={exportScope}
                            onChange={(e) => setExportScope(e.target.value as 'current' | 'all')}
                        >
                            <FormControlLabel
                                value="current"
                                control={<Radio />}
                                label={
                                    <Box>
                                        <Typography variant="body2">Current Stream Only</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Export history for the currently selected stream
                                            {currentHistory && ` (${currentHistory.totalEntries || 0} total records)`}
                                        </Typography>
                                    </Box>
                                }
                            />
                            <FormControlLabel
                                value="all"
                                control={<Radio />}
                                label={
                                    <Box>
                                        <Typography variant="body2">All Streams</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Export history for all streams
                                        </Typography>
                                    </Box>
                                }
                            />
                        </RadioGroup>
                    </FormControl>

                    <Alert severity="info" sx={{ mt: 2 }}>
                        <Typography variant="body2">
                            • CSV exports always include full data (no sampling applied)<br />
                            • Time range filters from the main view will be applied<br />
                            • Large exports may take a few moments to generate
                        </Typography>
                    </Alert>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setExportModalOpen(false)} disabled={exportLoading}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleExportCSV}
                        variant="contained"
                        disabled={exportLoading}
                        startIcon={exportLoading ? <CircularProgress size={16} /> : <FileDownload />}
                    >
                        {exportLoading ? 'Exporting...' : 'Export CSV'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default StreamHistory;