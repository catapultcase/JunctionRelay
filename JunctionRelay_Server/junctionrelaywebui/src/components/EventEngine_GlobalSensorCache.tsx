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
    Grid,
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
    Sensors as SensorsIcon,
    Update as UpdateIcon,
    Error as ErrorIcon,
    CheckCircle as CheckCircleIcon,
    TableView as TableViewIcon,
    ViewModule as ViewModuleIcon,
    Dashboard as DashboardIcon,
} from "@mui/icons-material";
import { useGlobalSensorCacheWebSocket, SENSOR_CACHE_POLL_RATE_PRESETS, SENSOR_CACHE_POLL_RATE_LABELS, SensorData } from '../hooks/useGlobalSensorCacheWebSocket';

// Types
type ViewMode = 'table' | 'standard' | 'mini';
type SortDirection = 'asc' | 'desc';

interface GlobalSensorCacheProps {
    className?: string;
}

// Storage keys
const STORAGE_KEY_SENSOR_VIEW_MODE = "junctionrelay_sensor_cache_view_mode";
const STORAGE_KEY_SENSOR_SORT = "sensor_cache_sort_state";
const STORAGE_KEY_SENSOR_CACHE_EXPANDED = "global_sensor_cache_expanded";

// Helper function to format sensor values - simplified to show raw data
const formatSensorValue = (value: any, unit?: string): string => {
    if (value === null || value === undefined) {
        return 'N/A';
    }

    // Handle boolean values
    if (typeof value === 'boolean') {
        return value ? 'True' : 'False';
    }

    // Handle numeric values - show raw without rounding
    if (typeof value === 'number') {
        return unit ? `${value} ${unit}` : String(value);
    }

    // Handle string values
    if (typeof value === 'string') {
        return unit ? `${value} ${unit}` : value;
    }

    // Handle objects/arrays by stringifying
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
};

// Helper function to get quality color
const getQualityColor = (quality: string): "success" | "warning" | "error" | "default" => {
    switch (quality) {
        case 'Good':
            return 'success';
        case 'Stale':
            return 'warning';
        case 'Error':
            return 'error';
        default:
            return 'default';
    }
};

// Helper function to get time since last update
const getTimeSinceUpdate = (timestamp: string): string => {
    try {
        const now = new Date().getTime();
        const updateTime = new Date(timestamp).getTime();
        const diffMs = now - updateTime;

        if (diffMs < 1000) return 'Just now';
        if (diffMs < 60000) return `${Math.floor(diffMs / 1000)}s ago`;
        if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
        if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
        return `${Math.floor(diffMs / 86400000)}d ago`;
    } catch {
        return 'Unknown';
    }
};

// Helper function to safely access sensor properties (handles both camelCase and PascalCase)
const getSensorProperty = (sensor: any, camelCase: string, pascalCase: string) => {
    return sensor[camelCase] ?? sensor[pascalCase];
};

// Helper function to get quality from sensor properties
const getSensorQuality = (sensor: any): 'Good' | 'Stale' | 'Error' => {
    // Handle both camelCase and PascalCase field names
    const isMissing = getSensorProperty(sensor, 'isMissing', 'IsMissing') ?? false;
    const isStale = getSensorProperty(sensor, 'isStale', 'IsStale') ?? false;

    if (isMissing) return 'Error';
    if (isStale) return 'Stale';
    return 'Good';
};

// Individual sensor card component
const SensorCard: React.FC<{ sensor: any; viewMode: ViewMode }> = ({ sensor, viewMode }) => {
    const quality = getSensorQuality(sensor);
    const lastUpdated = getSensorProperty(sensor, 'lastUpdated', 'LastUpdated');
    const timeSince = getTimeSinceUpdate(lastUpdated);
    const name = getSensorProperty(sensor, 'name', 'Name');
    const sensorTag = getSensorProperty(sensor, 'sensorTag', 'SensorTag');
    const displayName = name || sensorTag;
    const externalId = getSensorProperty(sensor, 'externalId', 'ExternalId');
    const deviceName = getSensorProperty(sensor, 'deviceName', 'DeviceName');
    const sensorType = getSensorProperty(sensor, 'sensorType', 'SensorType');
    const value = getSensorProperty(sensor, 'value', 'Value');
    const unit = getSensorProperty(sensor, 'unit', 'Unit');
    const id = getSensorProperty(sensor, 'id', 'Id');

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
                border: quality === 'Error' ? '1px solid' : 'none',
                borderColor: quality === 'Error' ? 'error.main' : 'transparent',
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
                    {displayName}
                </Typography>
                <Chip
                    size="small"
                    label={quality}
                    color={getQualityColor(quality)}
                    sx={{ fontSize: '0.7rem', height: '20px' }}
                />
            </Box>

            {/* Show external ID if available and different from name */}
            {externalId && externalId !== displayName && (
                <Typography variant="caption" color="textSecondary" sx={{ mb: 0.5 }}>
                    ID: {externalId}
                </Typography>
            )}

            <Typography variant="caption" color="textSecondary" sx={{ mb: 1 }}>
                {deviceName}
            </Typography>

            {viewMode !== 'mini' && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <SensorsIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
                    <Typography variant="caption" color="textSecondary">
                        {sensorType}
                    </Typography>
                </Box>
            )}

            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', my: 1 }}>
                <Typography
                    variant={viewMode === 'mini' ? "subtitle2" : "h6"}
                    sx={{
                        textAlign: 'center',
                        fontWeight: 'bold',
                        color: quality === 'Error' ? 'error.main' : 'text.primary',
                        fontSize: viewMode === 'mini' ? '0.9rem' : '1.1rem'
                    }}
                >
                    {formatSensorValue(value, unit)}
                </Typography>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 'auto' }}>
                <Typography variant="caption" color="textSecondary">
                    {timeSince}
                </Typography>
                <Tooltip title={`Sensor ID: ${id}`}>
                    <Typography variant="caption" color="textSecondary">
                        #{id}
                    </Typography>
                </Tooltip>
            </Box>
        </Paper>
    );
};

// Main GlobalSensorCache component
const GlobalSensorCache: React.FC<GlobalSensorCacheProps> = ({ className }) => {
    const [searchTerm, setSearchTerm] = useState('');

    // Accordion state with localStorage persistence
    const [expanded, setExpanded] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_SENSOR_CACHE_EXPANDED);
            return saved !== null ? saved === 'true' : true; // Default to open
        } catch (error) {
            console.error("Error accessing localStorage for sensor cache expansion:", error);
            return false;
        }
    });

    // View mode state
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_SENSOR_VIEW_MODE);
        return (stored as ViewMode) || 'table';
    });

    // Sort state - default to id first
    const [sortState, setSortState] = useState<{ orderBy: string, order: SortDirection }>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_SENSOR_SORT);
            return stored ? JSON.parse(stored) : { orderBy: 'id', order: 'asc' };
        } catch (e) {
            return { orderBy: 'id', order: 'asc' };
        }
    });

    // Use the WebSocket hook for real-time sensor data
    const {
        sensors,
        connectionStatus,
        isConnected,
        lastUpdate,
        setPollRate,
        currentPollRate
    } = useGlobalSensorCacheWebSocket({
        defaultPollRate: 500 // 500 ms default poll rate
    });

    // Debug logging
    useEffect(() => {
        // console.log('[GlobalSensorCache] Connection status:', connectionStatus);
        // console.log('[GlobalSensorCache] Is connected:', isConnected);
        // console.log('[GlobalSensorCache] Sensors count:', sensors.length);
        // console.log('[GlobalSensorCache] Sensors data:', sensors);
        // console.log('[GlobalSensorCache] Last update:', lastUpdate);
    }, [sensors, connectionStatus, isConnected, lastUpdate]);

    // Persist accordion state
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_SENSOR_CACHE_EXPANDED, expanded.toString());
    }, [expanded]);

    // Persist view mode
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_SENSOR_VIEW_MODE, viewMode);
    }, [viewMode]);

    // Persist sort state
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_SENSOR_SORT, JSON.stringify(sortState));
    }, [sortState]);

    // Filter sensors based on search term
    const filteredSensors = useMemo(() => {
        // console.log('[GlobalSensorCache] Filtering sensors, raw count:', sensors.length);
        // console.log('[GlobalSensorCache] Search term:', searchTerm);

        if (!searchTerm.trim()) {
            // console.log('[GlobalSensorCache] No search term, returning all sensors');
            return sensors;
        }

        const term = searchTerm.toLowerCase();
        const filtered = sensors.filter(sensor => {
            const name = getSensorProperty(sensor, 'name', 'Name') || '';
            const deviceName = getSensorProperty(sensor, 'deviceName', 'DeviceName') || '';
            const sensorType = getSensorProperty(sensor, 'sensorType', 'SensorType') || '';
            const sensorTag = getSensorProperty(sensor, 'sensorTag', 'SensorTag') || '';
            const externalId = getSensorProperty(sensor, 'externalId', 'ExternalId') || '';
            const id = getSensorProperty(sensor, 'id', 'Id') || '';

            return (
                name.toLowerCase().includes(term) ||
                deviceName.toLowerCase().includes(term) ||
                sensorType.toLowerCase().includes(term) ||
                sensorTag.toLowerCase().includes(term) ||
                externalId.toLowerCase().includes(term) ||
                id.toString().includes(term)
            );
        });

        // console.log('[GlobalSensorCache] Filtered sensors count:', filtered.length);
        return filtered;
    }, [sensors, searchTerm]);

    // Sort sensors
    const sortedSensors = useMemo(() => {
        // console.log('[GlobalSensorCache] Sorting sensors, filtered count:', filteredSensors.length);
        // console.log('[GlobalSensorCache] Sort state:', sortState);

        const { orderBy, order } = sortState;
        const sorted = [...filteredSensors].sort((a, b) => {
            let valueA: any;
            let valueB: any;

            switch (orderBy) {
                case 'id':
                    valueA = getSensorProperty(a, 'id', 'Id');
                    valueB = getSensorProperty(b, 'id', 'Id');
                    break;
                case 'externalId':
                    valueA = (getSensorProperty(a, 'externalId', 'ExternalId') || '').toLowerCase();
                    valueB = (getSensorProperty(b, 'externalId', 'ExternalId') || '').toLowerCase();
                    break;
                case 'name':
                    valueA = (getSensorProperty(a, 'name', 'Name') || '').toLowerCase();
                    valueB = (getSensorProperty(b, 'name', 'Name') || '').toLowerCase();
                    break;
                case 'deviceName':
                    valueA = (getSensorProperty(a, 'deviceName', 'DeviceName') || '').toLowerCase();
                    valueB = (getSensorProperty(b, 'deviceName', 'DeviceName') || '').toLowerCase();
                    break;
                case 'sensorType':
                    valueA = (getSensorProperty(a, 'sensorType', 'SensorType') || '').toLowerCase();
                    valueB = (getSensorProperty(b, 'sensorType', 'SensorType') || '').toLowerCase();
                    break;
                case 'lastUpdated':
                    valueA = (getSensorProperty(a, 'lastUpdated', 'LastUpdated') || '').toLowerCase();
                    valueB = (getSensorProperty(b, 'lastUpdated', 'LastUpdated') || '').toLowerCase();
                    break;
                case 'quality':
                    const qualityOrder = { 'Error': 0, 'Stale': 1, 'Good': 2 };
                    valueA = qualityOrder[getSensorQuality(a)] || 0;
                    valueB = qualityOrder[getSensorQuality(b)] || 0;
                    break;
                case 'value':
                    const valA = getSensorProperty(a, 'value', 'Value');
                    const valB = getSensorProperty(b, 'value', 'Value');
                    valueA = typeof valA === 'number' ? valA : String(valA).toLowerCase();
                    valueB = typeof valB === 'number' ? valB : String(valB).toLowerCase();
                    break;
                default:
                    // Fallback to string comparison for unknown fields
                    valueA = String(getSensorProperty(a, orderBy, orderBy) || '').toLowerCase();
                    valueB = String(getSensorProperty(b, orderBy, orderBy) || '').toLowerCase();
            }

            if (valueA < valueB) {
                return order === 'asc' ? -1 : 1;
            }
            if (valueA > valueB) {
                return order === 'asc' ? 1 : -1;
            }
            return 0;
        });

        // console.log('[GlobalSensorCache] Final sorted sensors count:', sorted.length);
        // console.log('[GlobalSensorCache] First few sorted sensors:', sorted.slice(0, 3));
        return sorted;
    }, [filteredSensors, sortState]);

    // Group sensors by quality for statistics
    const sensorStats = useMemo(() => {
        const stats = {
            total: sensors.length,
            good: 0,
            stale: 0,
            error: 0
        };

        sensors.forEach(sensor => {
            const quality = getSensorQuality(sensor);
            switch (quality) {
                case 'Good':
                    stats.good++;
                    break;
                case 'Stale':
                    stats.stale++;
                    break;
                case 'Error':
                    stats.error++;
                    break;
            }
        });

        return stats;
    }, [sensors]);

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
                    <SensorsIcon color="primary" />
                    <Typography variant="h6">
                        Global Sensor Cache ({sensors.length})
                    </Typography>
                    {getConnectionStatusChip()}
                </Box>
            </AccordionSummary>
            <AccordionDetails>
                <Box>
                    {/* Stats Row */}
                    <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                        <Chip
                            label={`Total: ${sensorStats.total}`}
                            color="default"
                            size="small"
                            icon={<SensorsIcon sx={{ fontSize: '0.8rem' }} />}
                        />
                        <Chip
                            label={`Good: ${sensorStats.good}`}
                            color="success"
                            size="small"
                            icon={<CheckCircleIcon sx={{ fontSize: '0.8rem' }} />}
                        />
                        {sensorStats.stale > 0 && (
                            <Chip
                                label={`Stale: ${sensorStats.stale}`}
                                color="warning"
                                size="small"
                                icon={<UpdateIcon sx={{ fontSize: '0.8rem' }} />}
                            />
                        )}
                        {sensorStats.error > 0 && (
                            <Chip
                                label={`Error: ${sensorStats.error}`}
                                color="error"
                                size="small"
                                icon={<ErrorIcon sx={{ fontSize: '0.8rem' }} />}
                            />
                        )}
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
                            placeholder="Search sensors..."
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

                    {/* Sensors Display */}
                    {!isConnected ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
                            <Box sx={{ textAlign: 'center' }}>
                                <CircularProgress sx={{ mb: 2 }} />
                                <Typography variant="body2" color="textSecondary">
                                    {connectionStatus === 'connecting' ? 'Connecting to sensor cache...' : 'Not connected to sensor cache'}
                                </Typography>
                            </Box>
                        </Box>
                    ) : sortedSensors.length === 0 ? (
                        <Box sx={{ textAlign: 'center', py: 4 }}>
                            <SensorsIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                            <Typography variant="h6" color="textSecondary">
                                {searchTerm ? 'No sensors match your search' : 'No global sensors in cache'}
                            </Typography>
                            <Typography variant="body2" color="textSecondary">
                                {searchTerm ? 'Try adjusting your search terms' : 'Sensors will appear here when junctions start sending data'}
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
                                                active={sortState.orderBy === 'id'}
                                                direction={sortState.orderBy === 'id' ? sortState.order : 'asc'}
                                                onClick={() => handleRequestSort('id')}
                                            >
                                                ID
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell>
                                            <TableSortLabel
                                                active={sortState.orderBy === 'externalId'}
                                                direction={sortState.orderBy === 'externalId' ? sortState.order : 'asc'}
                                                onClick={() => handleRequestSort('externalId')}
                                            >
                                                External ID
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell>
                                            <TableSortLabel
                                                active={sortState.orderBy === 'name'}
                                                direction={sortState.orderBy === 'name' ? sortState.order : 'asc'}
                                                onClick={() => handleRequestSort('name')}
                                            >
                                                Name
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell>
                                            <TableSortLabel
                                                active={sortState.orderBy === 'deviceName'}
                                                direction={sortState.orderBy === 'deviceName' ? sortState.order : 'asc'}
                                                onClick={() => handleRequestSort('deviceName')}
                                            >
                                                Source
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell>
                                            <TableSortLabel
                                                active={sortState.orderBy === 'sensorType'}
                                                direction={sortState.orderBy === 'sensorType' ? sortState.order : 'asc'}
                                                onClick={() => handleRequestSort('sensorType')}
                                            >
                                                Type
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell align="center">
                                            <TableSortLabel
                                                active={sortState.orderBy === 'value'}
                                                direction={sortState.orderBy === 'value' ? sortState.order : 'asc'}
                                                onClick={() => handleRequestSort('value')}
                                            >
                                                Value
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell align="center">
                                            <TableSortLabel
                                                active={sortState.orderBy === 'quality'}
                                                direction={sortState.orderBy === 'quality' ? sortState.order : 'asc'}
                                                onClick={() => handleRequestSort('quality')}
                                            >
                                                Quality
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell>
                                            <TableSortLabel
                                                active={sortState.orderBy === 'lastUpdated'}
                                                direction={sortState.orderBy === 'lastUpdated' ? sortState.order : 'asc'}
                                                onClick={() => handleRequestSort('lastUpdated')}
                                            >
                                                Last Update
                                            </TableSortLabel>
                                        </TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sortedSensors.map((sensor) => {
                                        const quality = getSensorQuality(sensor);
                                        const id = getSensorProperty(sensor, 'id', 'Id');
                                        const externalId = getSensorProperty(sensor, 'externalId', 'ExternalId');
                                        const name = getSensorProperty(sensor, 'name', 'Name');
                                        const sensorTag = getSensorProperty(sensor, 'sensorTag', 'SensorTag');
                                        const deviceName = getSensorProperty(sensor, 'deviceName', 'DeviceName');
                                        const sensorType = getSensorProperty(sensor, 'sensorType', 'SensorType');
                                        const value = getSensorProperty(sensor, 'value', 'Value');
                                        const unit = getSensorProperty(sensor, 'unit', 'Unit');
                                        const lastUpdated = getSensorProperty(sensor, 'lastUpdated', 'LastUpdated');

                                        return (
                                            <TableRow key={`${id}-${deviceName}`} hover>
                                                <TableCell sx={{ fontWeight: 'bold' }}>
                                                    #{id}
                                                </TableCell>
                                                <TableCell>
                                                    {externalId || '-'}
                                                </TableCell>
                                                <TableCell>
                                                    {name || sensorTag}
                                                </TableCell>
                                                <TableCell>
                                                    {deviceName}
                                                </TableCell>
                                                <TableCell>
                                                    {sensorType}
                                                </TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                                                    {formatSensorValue(value, unit)}
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Chip
                                                        size="small"
                                                        label={quality}
                                                        color={getQualityColor(quality)}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    {getTimeSinceUpdate(lastUpdated)}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
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
                            {sortedSensors.map((sensor) => {
                                const id = getSensorProperty(sensor, 'id', 'Id');
                                const deviceName = getSensorProperty(sensor, 'deviceName', 'DeviceName');
                                return (
                                    <SensorCard
                                        key={`${id}-${deviceName}`}
                                        sensor={sensor}
                                        viewMode={viewMode}
                                    />
                                );
                            })}
                        </Box>
                    )}
                </Box>
            </AccordionDetails>
        </Accordion>
    );
};

export default GlobalSensorCache;