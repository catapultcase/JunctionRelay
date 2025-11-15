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

import React, { useState, useEffect, useMemo } from "react";
import {
    Card,
    CardContent,
    Typography,
    Box,
    Chip,
    CircularProgress,
    Paper,
    Tooltip,
    IconButton,
    TextField,
    InputAdornment,
    ToggleButtonGroup,
    ToggleButton,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Accordion,
    AccordionSummary,
    AccordionDetails,
} from "@mui/material";
import {
    Search as SearchIcon,
    ExpandMore as ExpandMoreIcon,
    Wifi as WifiIcon,
    Update as UpdateIcon,
    Error as ErrorIcon,
    CheckCircle as CheckCircleIcon,
    TableView as TableViewIcon,
    ViewModule as ViewModuleIcon,
    Dashboard as DashboardIcon,
    Topic as TopicIcon,
} from "@mui/icons-material";
import { useMqttCacheWebSocket, SENSOR_CACHE_POLL_RATE_PRESETS, SENSOR_CACHE_POLL_RATE_LABELS, MqttPayloadData } from '../hooks/useGlobalSensorCacheWebSocket';

// Types
type ViewMode = 'table' | 'standard' | 'mini';
type SortDirection = 'asc' | 'desc';

interface MqttCacheProps {
    className?: string;
}

// Storage keys
const STORAGE_KEY_MQTT_VIEW_MODE = "junctionrelay_mqtt_cache_view_mode";
const STORAGE_KEY_MQTT_SORT = "mqtt_cache_sort_state";
const STORAGE_KEY_MQTT_CACHE_EXPANDED = "mqtt_cache_expanded";

// Helper function to format timestamps
const formatTimestamp = (timestamp: number): string => {
    try {
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
    } catch {
        return 'Unknown';
    }
};

// Helper function to get time since update
const getTimeSinceUpdate = (timestamp: number): string => {
    try {
        const now = Date.now();
        const diffMs = now - timestamp;

        if (diffMs < 1000) return 'Just now';
        if (diffMs < 60000) return `${Math.floor(diffMs / 1000)}s ago`;
        if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
        if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
        return `${Math.floor(diffMs / 86400000)}d ago`;
    } catch {
        return 'Unknown';
    }
};

// Helper function to format payload preview
const formatPayloadPreview = (payload: string, maxLength: number = 100): string => {
    if (!payload) return 'N/A';

    try {
        // Try to parse as JSON for better formatting
        const parsed = JSON.parse(payload);
        const formatted = JSON.stringify(parsed);
        return formatted.length > maxLength ? formatted.substring(0, maxLength) + '...' : formatted;
    } catch {
        // Not JSON, return as string
        return payload.length > maxLength ? payload.substring(0, maxLength) + '...' : payload;
    }
};

// Helper function to get service status color
const getServiceStatusColor = (status: string): "success" | "warning" | "error" | "default" => {
    switch (status.toLowerCase()) {
        case 'connected':
            return 'success';
        case 'disconnected':
            return 'warning';
        case 'error':
            return 'error';
        default:
            return 'default';
    }
};

// Individual MQTT payload card component
const MqttPayloadCard: React.FC<{ payload: MqttPayloadData; viewMode: ViewMode }> = ({ payload, viewMode }) => {
    const timeSince = getTimeSinceUpdate(payload.timestamp);
    const formattedTime = formatTimestamp(payload.timestamp);
    const payloadPreview = formatPayloadPreview(payload.payload, viewMode === 'mini' ? 50 : 150);

    return (
        <Paper
            elevation={1}
            sx={{
                p: viewMode === 'mini' ? 1 : 2,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                    elevation: 3,
                    transform: 'translateY(-2px)',
                },
                minHeight: viewMode === 'mini' ? 120 : 200
            }}
        >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                <Typography
                    variant={viewMode === 'mini' ? "caption" : "subtitle2"}
                    fontWeight="bold"
                    sx={{
                        fontSize: viewMode === 'mini' ? '0.75rem' : '0.875rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                        mr: 1
                    }}
                >
                    {payload.topic}
                </Typography>
                <Chip
                    size="small"
                    label={`QoS ${payload.qos || 0}`}
                    color="primary"
                    sx={{ fontSize: '0.7rem', height: '20px' }}
                />
            </Box>

            <Typography variant="caption" color="textSecondary" sx={{ mb: 1 }}>
                Service: {payload.serviceName || `ID ${payload.serviceId}`}
            </Typography>

            {viewMode !== 'mini' && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <TopicIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
                    <Typography variant="caption" color="textSecondary">
                        MQTT Payload
                    </Typography>
                </Box>
            )}

            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', my: 1 }}>
                <Typography
                    variant={viewMode === 'mini' ? "caption" : "body2"}
                    sx={{
                        textAlign: 'center',
                        fontFamily: 'monospace',
                        backgroundColor: 'rgba(0, 0, 0, 0.04)',
                        padding: 1,
                        borderRadius: 1,
                        fontSize: viewMode === 'mini' ? '0.7rem' : '0.8rem',
                        wordBreak: 'break-all',
                        maxHeight: viewMode === 'mini' ? '40px' : '80px',
                        overflow: 'hidden'
                    }}
                >
                    {payloadPreview}
                </Typography>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 'auto' }}>
                <Typography variant="caption" color="textSecondary">
                    {timeSince}
                </Typography>
                <Tooltip title={`Full timestamp: ${formattedTime}`}>
                    <Typography variant="caption" color="textSecondary">
                        {formattedTime}
                    </Typography>
                </Tooltip>
            </Box>
        </Paper>
    );
};

// Main MqttCache component
const MqttCache: React.FC<MqttCacheProps> = ({ className }) => {
    const [searchTerm, setSearchTerm] = useState('');

    // Accordion state with localStorage persistence
    const [expanded, setExpanded] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_MQTT_CACHE_EXPANDED);
            return saved !== null ? saved === 'true' : true; // Default to open
        } catch (error) {
            console.error("Error accessing localStorage for MQTT cache expansion:", error);
            return false;
        }
    });

    // View mode state
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_MQTT_VIEW_MODE);
        return (stored as ViewMode) || 'table';
    });

    // Sort state - default to timestamp descending (newest first)
    const [sortState, setSortState] = useState<{ orderBy: string, order: SortDirection }>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_MQTT_SORT);
            return stored ? JSON.parse(stored) : { orderBy: 'timestamp', order: 'desc' };
        } catch (e) {
            return { orderBy: 'timestamp', order: 'desc' };
        }
    });

    // Use the MQTT WebSocket hook for real-time data
    const {
        services,
        getAllMqttPayloads,
        getMqttServices,
        connectionStatus,
        isConnected,
        lastUpdate,
        setPollRate,
        currentPollRate
    } = useMqttCacheWebSocket({
        defaultPollRate: 500 // 500 ms default poll rate
    });

    // Get all payloads across all services
    const allPayloads = getAllMqttPayloads();

    // Debug logging
    useEffect(() => {
        // console.log('[MqttCache] Connection status:', connectionStatus);
        // console.log('[MqttCache] Is connected:', isConnected);
        // console.log('[MqttCache] Services count:', Object.keys(services).length);
        // console.log('[MqttCache] Total payloads count:', allPayloads.length);
        // console.log('[MqttCache] Last update:', lastUpdate);
    }, [services, connectionStatus, isConnected, lastUpdate, allPayloads]);

    // Persist accordion state
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_MQTT_CACHE_EXPANDED, expanded.toString());
    }, [expanded]);

    // Persist view mode
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_MQTT_VIEW_MODE, viewMode);
    }, [viewMode]);

    // Persist sort state
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_MQTT_SORT, JSON.stringify(sortState));
    }, [sortState]);

    // Filter payloads based on search term
    const filteredPayloads = useMemo(() => {
        // console.log('[MqttCache] Filtering payloads, raw count:', allPayloads.length);
        // console.log('[MqttCache] Search term:', searchTerm);

        if (!searchTerm.trim()) {
            // console.log('[MqttCache] No search term, returning all payloads');
            return allPayloads;
        }

        const term = searchTerm.toLowerCase();
        const filtered = allPayloads.filter(payload => {
            return (
                payload.topic.toLowerCase().includes(term) ||
                payload.payload.toLowerCase().includes(term) ||
                payload.serviceId.toString().includes(term) ||
                (payload.serviceName && payload.serviceName.toLowerCase().includes(term))
            );
        });

        // console.log('[MqttCache] Filtered payloads count:', filtered.length);
        return filtered;
    }, [allPayloads, searchTerm]);

    // Sort payloads
    const sortedPayloads = useMemo(() => {
        // console.log('[MqttCache] Sorting payloads, filtered count:', filteredPayloads.length);
        // console.log('[MqttCache] Sort state:', sortState);

        const { orderBy, order } = sortState;
        const sorted = [...filteredPayloads].sort((a, b) => {
            let valueA: any;
            let valueB: any;

            switch (orderBy) {
                case 'topic':
                case 'payload':
                case 'serviceName':
                    valueA = (a[orderBy as keyof MqttPayloadData] || '').toString().toLowerCase();
                    valueB = (b[orderBy as keyof MqttPayloadData] || '').toString().toLowerCase();
                    break;
                case 'serviceId':
                case 'timestamp':
                case 'qos':
                    valueA = a[orderBy as keyof MqttPayloadData] || 0;
                    valueB = b[orderBy as keyof MqttPayloadData] || 0;
                    break;
                default:
                    valueA = String(a[orderBy as keyof MqttPayloadData] || '').toLowerCase();
                    valueB = String(b[orderBy as keyof MqttPayloadData] || '').toLowerCase();
            }

            if (valueA < valueB) {
                return order === 'asc' ? -1 : 1;
            }
            if (valueA > valueB) {
                return order === 'asc' ? 1 : -1;
            }
            return 0;
        });

        // console.log('[MqttCache] Final sorted payloads count:', sorted.length);
        return sorted;
    }, [filteredPayloads, sortState]);

    // Group payloads by service for statistics
    const mqttStats = useMemo(() => {
        const stats = {
            totalPayloads: allPayloads.length,
            totalServices: Object.keys(services).length,
            uniqueTopics: new Set(allPayloads.map(p => p.topic)).size,
            serviceBreakdown: {} as Record<number, number>
        };

        allPayloads.forEach(payload => {
            stats.serviceBreakdown[payload.serviceId] = (stats.serviceBreakdown[payload.serviceId] || 0) + 1;
        });

        return stats;
    }, [allPayloads, services]);

    // Calculate grid columns based on view mode
    const getGridColumns = () => {
        if (viewMode === 'mini') {
            return {
                xs: 'repeat(2, 1fr)',
                sm: 'repeat(3, 1fr)',
                md: 'repeat(4, 1fr)',
                lg: 'repeat(6, 1fr)'
            };
        } else if (viewMode === 'standard') {
            return {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(3, 1fr)',
                lg: 'repeat(4, 1fr)'
            };
        }
        return {};
    };

    // Connection status indicator
    const getConnectionStatusChip = () => {
        const statusConfig = {
            connected: { color: 'success' as const, icon: <CheckCircleIcon sx={{ fontSize: '0.8rem' }} />, label: 'Connected' },
            connecting: { color: 'warning' as const, icon: <CircularProgress size={12} />, label: 'Connecting...' },
            disconnected: { color: 'error' as const, icon: <ErrorIcon sx={{ fontSize: '0.8rem' }} />, label: 'Disconnected' },
            error: { color: 'error' as const, icon: <ErrorIcon sx={{ fontSize: '0.8rem' }} />, label: 'Error' },
            disabled: { color: 'default' as const, icon: <ErrorIcon sx={{ fontSize: '0.8rem' }} />, label: 'Disabled' }
        };

        const config = statusConfig[connectionStatus] || statusConfig.disconnected;

        return (
            <Chip
                size="small"
                label={config.label}
                color={config.color}
                icon={config.icon}
                sx={{ fontSize: '0.75rem' }}
            />
        );
    };

    // Event handlers
    const handleAccordionChange = (isExpanded: boolean) => {
        setExpanded(isExpanded);
    };

    const handleViewModeChange = (event: React.MouseEvent<HTMLElement>, newViewMode: ViewMode) => {
        if (newViewMode !== null) {
            setViewMode(newViewMode);
        }
    };

    const handleRequestSort = (property: string) => {
        const isAsc = sortState.orderBy === property && sortState.order === 'asc';
        setSortState({
            orderBy: property,
            order: isAsc ? 'desc' : 'asc'
        });
    };

    return (
        <Accordion
            expanded={expanded}
            onChange={(_, isExpanded) => handleAccordionChange(isExpanded)}
            className={className}
            sx={{ mb: 3 }}
        >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box display="flex" alignItems="center" gap={1}>
                    <WifiIcon color="primary" />
                    <Typography variant="h6">
                        MQTT Cache ({allPayloads.length})
                    </Typography>
                    {getConnectionStatusChip()}
                </Box>
            </AccordionSummary>
            <AccordionDetails>
                <Box>
                    {/* Stats Row */}
                    <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                        <Chip
                            label={`Services: ${mqttStats.totalServices}`}
                            color="default"
                            size="small"
                            icon={<WifiIcon sx={{ fontSize: '0.8rem' }} />}
                        />
                        <Chip
                            label={`Topics: ${mqttStats.uniqueTopics}`}
                            color="primary"
                            size="small"
                            icon={<TopicIcon sx={{ fontSize: '0.8rem' }} />}
                        />
                        <Chip
                            label={`Payloads: ${mqttStats.totalPayloads}`}
                            color="secondary"
                            size="small"
                            icon={<CheckCircleIcon sx={{ fontSize: '0.8rem' }} />}
                        />
                        {lastUpdate > 0 && (
                            <Typography variant="caption" color="textSecondary" sx={{ alignSelf: 'center', ml: 'auto' }}>
                                Last update: {new Date(lastUpdate).toLocaleTimeString()}
                            </Typography>
                        )}
                    </Box>

                    {/* View mode toggle, poll rate, and search */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                        <TextField
                            size="small"
                            placeholder="Search topics or payloads..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon sx={{ fontSize: '1rem' }} />
                                    </InputAdornment>
                                )
                            }}
                            sx={{ maxWidth: 300 }}
                        />

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                            <FormControl size="small" sx={{ minWidth: 140 }}>
                                <InputLabel>Poll Rate</InputLabel>
                                <Select
                                    value={currentPollRate}
                                    onChange={(e) => setPollRate(Number(e.target.value))}
                                    label="Poll Rate"
                                    disabled={!isConnected}
                                >
                                    {Object.entries(SENSOR_CACHE_POLL_RATE_PRESETS).map(([key, value]) => (
                                        <MenuItem key={key} value={value}>
                                            {SENSOR_CACHE_POLL_RATE_LABELS[value]}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <ToggleButtonGroup
                                value={viewMode}
                                exclusive
                                onChange={handleViewModeChange}
                                aria-label="view mode"
                                size="small"
                            >
                                <ToggleButton value="table" aria-label="table view">
                                    <TableViewIcon />
                                    <Typography variant="caption" sx={{ ml: 0.5, display: { xs: 'none', sm: 'inline' } }}>
                                        Table
                                    </Typography>
                                </ToggleButton>
                                <ToggleButton value="standard" aria-label="standard tiles">
                                    <DashboardIcon />
                                    <Typography variant="caption" sx={{ ml: 0.5, display: { xs: 'none', sm: 'inline' } }}>
                                        Standard
                                    </Typography>
                                </ToggleButton>
                                <ToggleButton value="mini" aria-label="mini tiles">
                                    <ViewModuleIcon />
                                    <Typography variant="caption" sx={{ ml: 0.5, display: { xs: 'none', sm: 'inline' } }}>
                                        Mini
                                    </Typography>
                                </ToggleButton>
                            </ToggleButtonGroup>
                        </Box>
                    </Box>

                    {/* MQTT Payloads Display */}
                    {!isConnected ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
                            <Box sx={{ textAlign: 'center' }}>
                                <CircularProgress sx={{ mb: 2 }} />
                                <Typography variant="body2" color="textSecondary">
                                    {connectionStatus === 'connecting' ? 'Connecting to MQTT cache...' : 'Not connected to MQTT cache'}
                                </Typography>
                            </Box>
                        </Box>
                    ) : sortedPayloads.length === 0 ? (
                        <Box sx={{ textAlign: 'center', py: 4 }}>
                            <WifiIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                            <Typography variant="h6" color="textSecondary">
                                {searchTerm ? 'No MQTT payloads match your search' : 'No MQTT payloads in cache'}
                            </Typography>
                            <Typography variant="body2" color="textSecondary">
                                {searchTerm ? 'Try adjusting your search terms' : 'MQTT payloads will appear here when services start receiving data'}
                            </Typography>
                        </Box>
                    ) : viewMode === 'table' ? (
                        /* Table View */
                        <TableContainer component={Paper}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
                                        <TableCell>
                                            <TableSortLabel
                                                active={sortState.orderBy === 'serviceId'}
                                                direction={sortState.orderBy === 'serviceId' ? sortState.order : 'asc'}
                                                onClick={() => handleRequestSort('serviceId')}
                                            >
                                                Service
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell>
                                            <TableSortLabel
                                                active={sortState.orderBy === 'topic'}
                                                direction={sortState.orderBy === 'topic' ? sortState.order : 'asc'}
                                                onClick={() => handleRequestSort('topic')}
                                            >
                                                Topic
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell align="center">
                                            <TableSortLabel
                                                active={sortState.orderBy === 'qos'}
                                                direction={sortState.orderBy === 'qos' ? sortState.order : 'asc'}
                                                onClick={() => handleRequestSort('qos')}
                                            >
                                                QoS
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell>
                                            <TableSortLabel
                                                active={sortState.orderBy === 'payload'}
                                                direction={sortState.orderBy === 'payload' ? sortState.order : 'asc'}
                                                onClick={() => handleRequestSort('payload')}
                                            >
                                                Payload
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell>
                                            <TableSortLabel
                                                active={sortState.orderBy === 'timestamp'}
                                                direction={sortState.orderBy === 'timestamp' ? sortState.order : 'asc'}
                                                onClick={() => handleRequestSort('timestamp')}
                                            >
                                                Last Update
                                            </TableSortLabel>
                                        </TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sortedPayloads.map((payload, index) => (
                                        <TableRow key={`${payload.serviceId}-${payload.topic}-${index}`} hover>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                                    <Typography variant="body2" fontWeight="bold">
                                                        {payload.serviceName || `Service ${payload.serviceId}`}
                                                    </Typography>
                                                    <Typography variant="caption" color="textSecondary">
                                                        ID: {payload.serviceId}
                                                    </Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <Typography
                                                    variant="body2"
                                                    fontFamily="monospace"
                                                    sx={{ wordBreak: 'break-all' }}
                                                >
                                                    {payload.topic}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="center">
                                                <Chip
                                                    size="small"
                                                    label={payload.qos || 0}
                                                    color="primary"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Typography
                                                    variant="body2"
                                                    fontFamily="monospace"
                                                    sx={{
                                                        wordBreak: 'break-all',
                                                        backgroundColor: 'rgba(0, 0, 0, 0.04)',
                                                        padding: 0.5,
                                                        borderRadius: 1,
                                                        maxWidth: 300,
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap'
                                                    }}
                                                >
                                                    {formatPayloadPreview(payload.payload, 200)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                                    <Typography variant="body2">
                                                        {getTimeSinceUpdate(payload.timestamp)}
                                                    </Typography>
                                                    <Typography variant="caption" color="textSecondary">
                                                        {formatTimestamp(payload.timestamp)}
                                                    </Typography>
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    ) : (
                        /* Tile Views (Standard/Mini) */
                        <Box sx={{
                            display: 'grid',
                            gridTemplateColumns: getGridColumns(),
                            gap: viewMode === 'mini' ? 1 : 2
                        }}>
                            {sortedPayloads.map((payload, index) => (
                                <MqttPayloadCard
                                    key={`${payload.serviceId}-${payload.topic}-${index}`}
                                    payload={payload}
                                    viewMode={viewMode}
                                />
                            ))}
                        </Box>
                    )}
                </Box>
            </AccordionDetails>
        </Accordion>
    );
};

export default MqttCache;