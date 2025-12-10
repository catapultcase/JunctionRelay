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

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
    Typography,
    Box,
    Button,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    IconButton,
    Tooltip,
    Switch,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Popover,
    List,
    ListItem,
    ListItemText,
    Checkbox,
    AlertColor,
    Card,
    CardContent,
    CircularProgress,
    ToggleButtonGroup,
    ToggleButton,
    InputAdornment,
} from "@mui/material";
import { useTheme, useMediaQuery } from "@mui/material";

// Icon imports
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import SensorsIcon from '@mui/icons-material/Sensors';
import TableViewIcon from '@mui/icons-material/TableView';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import DashboardIcon from '@mui/icons-material/Dashboard';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import SearchIcon from '@mui/icons-material/Search';

// WebSocket hook import
import { useEventSensorCacheWebSocket, SENSOR_CACHE_POLL_RATE_PRESETS, SENSOR_CACHE_POLL_RATE_LABELS, EventSensorData } from '../hooks/useGlobalSensorCacheWebSocket';

// Types
type ViewMode = 'table' | 'standard' | 'mini';
type SortDirection = 'asc' | 'desc';

interface EventSensorColumn {
    field: string;
    label: string;
    align: "left" | "right" | "center" | "inherit" | "justify";
    sortable?: boolean;
}

// Props interface
interface EventEngineEventSensorsProps {
    showSnackbar: (message: string, severity?: AlertColor) => void;
    onSensorCreated?: () => void;
}

// Storage keys
const STORAGE_KEY_EVENT_SENSORS_COLUMNS = "eventengine_event_sensors_visible_columns";
const STORAGE_KEY_EVENT_SENSORS_SORT = "eventengine_event_sensors_sort_state";
const STORAGE_KEY_EVENT_SENSORS_VIEW_MODE = "eventengine_event_sensors_view_mode";
const STORAGE_KEY_EVENT_SENSORS_EXPANDED = "eventengine_event_sensors_expanded";

// Column definitions
const defaultEventSensorColumns: EventSensorColumn[] = [
    { field: "actions", label: "Actions", align: "right", sortable: false },
    { field: "name", label: "Name", align: "left", sortable: true },
    { field: "sensorTag", label: "Sensor Tag", align: "left", sortable: true },
    { field: "value", label: "Value", align: "center", sortable: true },
    { field: "unit", label: "Unit", align: "left", sortable: true },
    { field: "sensorType", label: "Sensor Type", align: "left", sortable: true },
    { field: "decimalPlaces", label: "Decimals", align: "center", sortable: true },
    { field: "deviceName", label: "Device Name", align: "left", sortable: true },
    { field: "formula", label: "Formula", align: "left", sortable: true },
    { field: "lastUpdated", label: "Last Updated", align: "left", sortable: true },
    { field: "isMissing", label: "Missing", align: "center", sortable: true },
    { field: "isStale", label: "Stale", align: "center", sortable: true },
    { field: "isVisible", label: "Visible", align: "center", sortable: true },
];

// Default visible columns
const defaultVisibleColumns = ["name", "sensorType", "sensorTag", "value", "unit", "lastUpdated", "actions"];

// Sensor types
const SENSOR_TYPES = [
    "Text",
    "Number",
    "Boolean",
    "Color"
];

// Helper function to get sensor type chip color
const getSensorTypeColor = (sensorType: string) => {
    const typeMap: Record<string, "default" | "primary" | "secondary" | "success" | "info" | "warning" | "error"> = {
        "Text": "primary",
        "Number": "info",
        "Boolean": "success",
        "Color": "secondary"
    };
    return typeMap[sensorType] || "default";
};

// Helper function to format value display
const formatValueDisplay = (value: any, sensorType: string, decimalPlaces: number) => {
    if (value === null || value === undefined) return '-';

    switch (sensorType) {
        case 'Number':
            return typeof value === 'number' ? value.toFixed(decimalPlaces) : value;
        case 'Boolean':
            const boolValue = value === '1' || value === 'true';
            return boolValue ? 'true' : 'false';
        case 'Color':
            return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                        sx={{
                            width: 20,
                            height: 20,
                            backgroundColor: value,
                            border: '1px solid #ccc',
                            borderRadius: '4px'
                        }}
                    />
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {value}
                    </Typography>
                </Box>
            );
        default:
            return String(value);
    }
};

// Connection status indicator helper
const getConnectionStatusChip = (connectionStatus: string, isConnected: boolean) => {
    const statusConfig = {
        connected: { color: 'success' as const, icon: <CheckCircleIcon sx={{ fontSize: '0.8rem' }} />, label: 'Connected' },
        connecting: { color: 'warning' as const, icon: <CircularProgress size={12} />, label: 'Connecting...' },
        disconnected: { color: 'error' as const, icon: <ErrorIcon sx={{ fontSize: '0.8rem' }} />, label: 'Disconnected' },
        error: { color: 'error' as const, icon: <ErrorIcon sx={{ fontSize: '0.8rem' }} />, label: 'Error' },
        disabled: { color: 'default' as const, icon: <ErrorIcon sx={{ fontSize: '0.8rem' }} />, label: 'Disabled' }
    };

    const config = statusConfig[connectionStatus as keyof typeof statusConfig] || statusConfig.disconnected;

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

// Main component
const EventEngineEventSensors: React.FC<EventEngineEventSensorsProps> = ({
    showSnackbar,
    onSensorCreated
}) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // WebSocket hook for real-time event sensor data
    const {
        eventSensors,
        connectionStatus,
        isConnected,
        lastUpdate,
        currentPollRate,
        setPollRate,
        getAllEventSensors
    } = useEventSensorCacheWebSocket({
        defaultPollRate: 500
    });

    // Search state
    const [searchTerm, setSearchTerm] = useState('');

    // Dialog state
    const [dialogOpen, setDialogOpen] = useState<boolean>(false);
    const [editingSensor, setEditingSensor] = useState<EventSensorData | null>(null);
    const [formData, setFormData] = useState<Partial<EventSensorData>>({
        name: '',
        sensorTag: '',
        value: '',
        unit: '',
        sensorType: 'Text',
        decimalPlaces: 2,
        deviceName: 'EventEngine',
        isSelected: false,
        isVisible: true,
        isEventSensor: true,
        isCustomJunctionSensor: false,
        isMissing: false,
        isStale: false,
        sensorOrder: 0,
        originalId: 0
    });

    // Accordion state
    const [expanded, setExpanded] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_EVENT_SENSORS_EXPANDED);
            return saved !== null ? saved === 'true' : true;
        } catch (error) {
            console.error("Error accessing localStorage for event sensors expansion:", error);
            return false;
        }
    });

    // View mode and table management state
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_EVENT_SENSORS_VIEW_MODE);
        return (stored as ViewMode) || 'table';
    });

    const [visibleCols, setVisibleCols] = useState<string[]>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_EVENT_SENSORS_COLUMNS);
        return stored ? JSON.parse(stored) : defaultVisibleColumns;
    });

    const [sortState, setSortState] = useState<{ orderBy: string, order: SortDirection }>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_EVENT_SENSORS_SORT);
            return stored ? JSON.parse(stored) : { orderBy: 'name', order: 'asc' };
        } catch (e) {
            return { orderBy: 'name', order: 'asc' };
        }
    });

    // Popover anchor for column management
    const [anchorCols, setAnchorCols] = useState<HTMLElement | null>(null);

    // Persist states
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_EVENT_SENSORS_EXPANDED, expanded.toString());
    }, [expanded]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_EVENT_SENSORS_VIEW_MODE, viewMode);
    }, [viewMode]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_EVENT_SENSORS_COLUMNS, JSON.stringify(visibleCols));
    }, [visibleCols]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_EVENT_SENSORS_SORT, JSON.stringify(sortState));
    }, [sortState]);

    // Filter sensors based on search term
    const filteredSensors = useMemo(() => {
        if (!searchTerm.trim()) {
            return eventSensors;
        }

        const term = searchTerm.toLowerCase();
        return eventSensors.filter(sensor => {
            return (
                sensor.name.toLowerCase().includes(term) ||
                sensor.sensorTag.toLowerCase().includes(term) ||
                sensor.sensorType.toLowerCase().includes(term) ||
                sensor.deviceName.toLowerCase().includes(term) ||
                (sensor.value && sensor.value.toLowerCase().includes(term))
            );
        });
    }, [eventSensors, searchTerm]);

    // Sort sensors
    const sortedSensors = useMemo(() => {
        const { orderBy, order } = sortState;
        return [...filteredSensors].sort((a, b) => {
            let valueA: any;
            let valueB: any;

            switch (orderBy) {
                case 'name':
                case 'sensorTag':
                case 'unit':
                case 'sensorType':
                case 'lastUpdated':
                    valueA = a[orderBy as keyof EventSensorData]?.toString()?.toLowerCase() || '';
                    valueB = b[orderBy as keyof EventSensorData]?.toString()?.toLowerCase() || '';
                    break;
                case 'isVisible':
                case 'isEventSensor':
                    valueA = a[orderBy as keyof EventSensorData] ? 1 : 0;
                    valueB = b[orderBy as keyof EventSensorData] ? 1 : 0;
                    break;
                case 'value':
                case 'decimalPlaces':
                    valueA = a[orderBy as keyof EventSensorData] || 0;
                    valueB = b[orderBy as keyof EventSensorData] || 0;
                    break;
                default:
                    valueA = a[orderBy as keyof EventSensorData] || '';
                    valueB = b[orderBy as keyof EventSensorData] || '';
            }

            if (valueA < valueB) {
                return order === 'asc' ? -1 : 1;
            }
            if (valueA > valueB) {
                return order === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }, [filteredSensors, sortState]);

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

    // Event handlers
    const handleAccordionChange = (isExpanded: boolean) => {
        setExpanded(isExpanded);
    };

    // View mode change handler
    const handleViewModeChange = useCallback((event: React.MouseEvent<HTMLElement>, newViewMode: ViewMode) => {
        if (newViewMode !== null) {
            setViewMode(newViewMode);
        }
    }, []);

    const handleAdd = () => {
        setEditingSensor(null);
        setFormData({
            name: '',
            sensorTag: '',
            value: '',
            unit: '',
            sensorType: 'Text',
            decimalPlaces: 2,
            deviceName: 'EventEngine',
            isSelected: false,
            isVisible: true,
            isEventSensor: true,
            isCustomJunctionSensor: false,
            isMissing: false,
            isStale: false,
            sensorOrder: 0,
            originalId: 0
        });
        setDialogOpen(true);
    };

    const handleEdit = (sensor: EventSensorData) => {
        setEditingSensor(sensor);
        setFormData({ ...sensor });
        setDialogOpen(true);
    };

    const handleDelete = async (sensorId: number) => {
        if (window.confirm("Are you sure you want to delete this event sensor?")) {
            try {
                const response = await fetch(`/api/sensors/event-sensors/${sensorId}`, {
                    method: 'DELETE'
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                showSnackbar("Event sensor deleted successfully", "success");
            } catch (error) {
                console.error("Error deleting event sensor:", error);
                showSnackbar("Failed to delete event sensor", "error");
            }
        }
    };

    const handleSave = async () => {
        try {
            if (!formData.name || !formData.sensorTag) {
                showSnackbar("Name and Sensor Tag are required", "warning");
                return;
            }

            let valueToSave = formData.value;
            if (formData.sensorType === 'Boolean') {
                if (formData.value === 'true' || formData.value === '1') {
                    valueToSave = '1';
                } else {
                    valueToSave = '0';
                }
            }

            const sensorData = {
                name: formData.name,
                sensorTag: formData.sensorTag,
                sensorType: formData.sensorType || 'Text',
                value: String(valueToSave || ''),
                unit: formData.unit || '',
                decimalPlaces: formData.decimalPlaces ?? 2,
                deviceName: formData.deviceName || 'EventEngine',
                componentName: 'EventSensor',  // ADDED - required field
                category: 'Event',              // ADDED - required field
                externalId: formData.externalId || `event_${formData.sensorTag}_${Date.now()}`,
                formula: formData.formula || '',
                isEventSensor: true,
                isSelected: false,
                isVisible: formData.isVisible ?? true,
                isCustomJunctionSensor: false,
                isMissing: false,
                isStale: false,
                sensorOrder: 0
            };

            if (editingSensor) {
                const response = await fetch(`/api/sensors/event-sensors/${editingSensor.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(sensorData)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
                }

                showSnackbar("Event sensor updated successfully", "success");
            } else {
                const response = await fetch('/api/sensors/event-sensors', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(sensorData)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
                }

                showSnackbar("Event sensor created successfully", "success");
            }

            setDialogOpen(false);

            // Call parent's refresh function after successful save
            if (onSensorCreated) {
                onSensorCreated();
            }
        } catch (error) {
            console.error("Error saving event sensor:", error);
            const errorMessage = error instanceof Error ? error.message : "Failed to save event sensor";
            showSnackbar(errorMessage, "error");
        }
    };

    // Sort handler
    const handleRequestSort = useCallback((property: string) => {
        const isAsc = sortState.orderBy === property && sortState.order === 'asc';
        setSortState({
            orderBy: property,
            order: isAsc ? 'desc' : 'asc'
        });
    }, [sortState]);

    // Column management handlers
    const openColsPopover = useCallback((e: React.MouseEvent<HTMLElement>) => {
        e.stopPropagation();
        setAnchorCols(e.currentTarget);
    }, []);

    const closeColsPopover = useCallback(() => setAnchorCols(null), []);

    const handleToggleColumn = useCallback((field: string, checked: boolean) => {
        if (checked) {
            setVisibleCols(prev => [...prev, field]);
        } else {
            setVisibleCols(prev => prev.filter(f => f !== field));
        }
    }, []);

    const moveCol = useCallback((field: string, direction: "up" | "down") => {
        const list = visibleCols;
        const i = list.indexOf(field);
        if (i < 0) return;
        const j = direction === "up" ? i - 1 : i + 1;
        if (j < 0 || j >= list.length) return;
        const copy = [...list];
        copy.splice(i, 1);
        copy.splice(j, 0, field);
        setVisibleCols(copy);
    }, [visibleCols]);

    const handleMoveColumn = useCallback((field: string, direction: "up" | "down") => {
        moveCol(field, direction);
    }, [moveCol]);

    return (
        <>
            <Accordion
                expanded={expanded}
                onChange={(_, isExpanded) => handleAccordionChange(isExpanded)}
                sx={{ mb: 3 }}
            >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box display="flex" alignItems="center" gap={1}>
                        <SensorsIcon color="primary" />
                        <Typography variant="h6">
                            Event Sensors ({eventSensors.length})
                        </Typography>
                        {getConnectionStatusChip(connectionStatus, isConnected)}
                    </Box>
                </AccordionSummary>
                <AccordionDetails>
                    <Box sx={{ mb: 2 }}>
                        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                            Create event sensors with custom values that can be used in events and displayed on device screens.
                            These sensors maintain their values until manually updated or triggered by events.
                        </Typography>

                        {lastUpdate > 0 && (
                            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                                <Typography variant="caption" color="textSecondary" sx={{ alignSelf: 'center', ml: 'auto' }}>
                                    Last update: {new Date(lastUpdate).toLocaleTimeString()}
                                </Typography>
                            </Box>
                        )}

                        {!isMobile && (
                            <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: 'wrap' }}>
                                <Button
                                    variant="contained"
                                    size="small"
                                    onClick={handleAdd}
                                    startIcon={<AddIcon />}
                                    disabled={!isConnected}
                                >
                                    Add Event Sensor
                                </Button>
                            </Box>
                        )}

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                            <TextField
                                size="small"
                                placeholder="Search event sensors..."
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

                                {!isMobile && (
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
                                )}

                                {viewMode === 'table' && (
                                    <Button
                                        onClick={openColsPopover}
                                        size="small"
                                        variant="outlined"
                                        sx={{
                                            minWidth: 'auto',
                                            textTransform: 'none',
                                            fontWeight: 500,
                                            fontSize: '0.875rem',
                                            padding: '4px 10px',
                                        }}
                                    >
                                        Columns
                                    </Button>
                                )}
                            </Box>

                            <Popover
                                open={Boolean(anchorCols)}
                                anchorEl={anchorCols}
                                onClose={closeColsPopover}
                            >
                                <List dense>
                                    {visibleCols.map((field, idx) => {
                                        const colDef = defaultEventSensorColumns.find((c) => c.field === field);
                                        if (!colDef) return null;

                                        return (
                                            <ListItem key={field}>
                                                <Checkbox
                                                    checked
                                                    onChange={(e) => {
                                                        handleToggleColumn(field, e.target.checked);
                                                    }}
                                                />
                                                <ListItemText primary={colDef.label} />
                                                <IconButton
                                                    size="small"
                                                    disabled={idx === 0}
                                                    onClick={() => handleMoveColumn(field, "up")}
                                                >
                                                    <ArrowUpwardIcon fontSize="inherit" />
                                                </IconButton>
                                                <IconButton
                                                    size="small"
                                                    disabled={idx === visibleCols.length - 1}
                                                    onClick={() => handleMoveColumn(field, "down")}
                                                >
                                                    <ArrowDownwardIcon fontSize="inherit" />
                                                </IconButton>
                                            </ListItem>
                                        );
                                    })}
                                    {defaultEventSensorColumns
                                        .filter((c) => !visibleCols.includes(c.field))
                                        .map(({ field, label }) => (
                                            <ListItem key={field}>
                                                <Checkbox
                                                    onChange={(e) => {
                                                        handleToggleColumn(field, e.target.checked);
                                                    }}
                                                />
                                                <ListItemText primary={label} />
                                            </ListItem>
                                        ))}
                                </List>
                            </Popover>
                        </Box>

                        {!isConnected ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
                                <Box sx={{ textAlign: 'center' }}>
                                    <CircularProgress sx={{ mb: 2 }} />
                                    <Typography variant="body2" color="textSecondary">
                                        {connectionStatus === 'connecting' ? 'Connecting to event sensor cache...' : 'Not connected to event sensor cache'}
                                    </Typography>
                                </Box>
                            </Box>
                        ) : viewMode === 'table' ? (
                            <TableContainer component={Paper}>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
                                            {visibleCols.map((field) => {
                                                const colDef = defaultEventSensorColumns.find((c) => c.field === field);
                                                if (!colDef) return null;

                                                return (
                                                    <TableCell
                                                        key={field}
                                                        align={colDef.align}
                                                        sortDirection={sortState.orderBy === field ? sortState.order : false}
                                                        sx={{ padding: '8px 16px' }}
                                                    >
                                                        {colDef.sortable !== false ? (
                                                            <TableSortLabel
                                                                active={sortState.orderBy === field}
                                                                direction={sortState.orderBy === field ? sortState.order : 'asc'}
                                                                onClick={() => handleRequestSort(field)}
                                                            >
                                                                {colDef.label}
                                                            </TableSortLabel>
                                                        ) : (
                                                            colDef.label
                                                        )}
                                                    </TableCell>
                                                );
                                            })}
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {sortedSensors.length > 0 ? (
                                            sortedSensors.map((sensor) => (
                                                <TableRow key={sensor.id} hover>
                                                    {visibleCols.map((field) => (
                                                        <TableCell key={field} sx={{ padding: '8px 16px' }}>
                                                            {field === 'actions' && (
                                                                <Box sx={{ display: 'flex', gap: 1 }}>
                                                                    <Tooltip title="Edit Event Sensor">
                                                                        <IconButton size="small" onClick={() => handleEdit(sensor)}>
                                                                            <EditIcon fontSize="small" />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                    <Tooltip title="Delete Event Sensor">
                                                                        <IconButton size="small" onClick={() => handleDelete(sensor.id)}>
                                                                            <DeleteIcon fontSize="small" />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                </Box>
                                                            )}
                                                            {field === 'sensorType' && (
                                                                <Chip
                                                                    label={sensor.sensorType}
                                                                    size="small"
                                                                    color={getSensorTypeColor(sensor.sensorType)}
                                                                />
                                                            )}
                                                            {field === 'value' && (
                                                                formatValueDisplay(sensor.value, sensor.sensorType, sensor.decimalPlaces)
                                                            )}
                                                            {field === 'isMissing' && (
                                                                <Chip
                                                                    label={sensor.isMissing ? 'Missing' : 'OK'}
                                                                    size="small"
                                                                    color={sensor.isMissing ? 'error' : 'success'}
                                                                />
                                                            )}
                                                            {field === 'isStale' && (
                                                                <Chip
                                                                    label={sensor.isStale ? 'Stale' : 'Fresh'}
                                                                    size="small"
                                                                    color={sensor.isStale ? 'warning' : 'success'}
                                                                />
                                                            )}
                                                            {field === 'isVisible' && (
                                                                <Switch
                                                                    size="small"
                                                                    checked={sensor.isVisible}
                                                                    disabled
                                                                    color="primary"
                                                                />
                                                            )}
                                                            {!['actions', 'sensorType', 'value', 'isMissing', 'isStale', 'isVisible'].includes(field) && (
                                                                <Typography variant="body2">
                                                                    {sensor[field as keyof EventSensorData] || '-'}
                                                                </Typography>
                                                            )}
                                                        </TableCell>
                                                    ))}
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={visibleCols.length} sx={{ textAlign: 'center', py: 3 }}>
                                                    <Typography color="textSecondary">
                                                        {searchTerm ? 'No event sensors match your search' : 'No event sensors found'}
                                                    </Typography>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        ) : (
                            <Box sx={{
                                display: 'grid',
                                gridTemplateColumns: getGridColumns(),
                                gap: viewMode === 'mini' ? 1 : 2
                            }}>
                                {sortedSensors.length > 0 ? (
                                    sortedSensors.map((sensor) => (
                                        <Card key={sensor.id} sx={{
                                            cursor: 'pointer',
                                            '&:hover': {
                                                boxShadow: theme.shadows[4]
                                            },
                                            minHeight: viewMode === 'mini' ? 120 : 200
                                        }}>
                                            <CardContent sx={{ p: viewMode === 'mini' ? 1 : 2 }}>
                                                <Box sx={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'flex-start',
                                                    mb: 1
                                                }}>
                                                    <Typography
                                                        variant={viewMode === 'mini' ? "caption" : "subtitle1"}
                                                        fontWeight="bold"
                                                        sx={{
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                            flex: 1,
                                                            mr: 1
                                                        }}
                                                    >
                                                        {sensor.name}
                                                    </Typography>
                                                </Box>

                                                {viewMode === 'standard' && (
                                                    <Typography
                                                        variant="body2"
                                                        color="textSecondary"
                                                        sx={{ mb: 1 }}
                                                    >
                                                        Tag: {sensor.sensorTag}
                                                    </Typography>
                                                )}

                                                <Box sx={{
                                                    display: 'flex',
                                                    flexDirection: viewMode === 'mini' ? 'column' : 'row',
                                                    gap: 0.5,
                                                    mb: viewMode === 'mini' ? 1 : 2,
                                                    flexWrap: 'wrap'
                                                }}>
                                                    <Chip
                                                        label={sensor.sensorType}
                                                        size="small"
                                                        color={getSensorTypeColor(sensor.sensorType)}
                                                    />
                                                </Box>

                                                {viewMode === 'standard' && (
                                                    <>
                                                        <Typography variant="caption" color="textSecondary">
                                                            Value: {typeof formatValueDisplay(sensor.value, sensor.sensorType, sensor.decimalPlaces) === 'object'
                                                                ? sensor.value
                                                                : formatValueDisplay(sensor.value, sensor.sensorType, sensor.decimalPlaces)} {sensor.unit}
                                                        </Typography>
                                                        <br />
                                                        {sensor.lastUpdated && (
                                                            <>
                                                                <Typography variant="caption" color="textSecondary">
                                                                    Updated: {sensor.lastUpdated}
                                                                </Typography>
                                                                <br />
                                                            </>
                                                        )}
                                                    </>
                                                )}

                                                <Box sx={{
                                                    display: 'flex',
                                                    justifyContent: 'flex-end',
                                                    gap: 1,
                                                    mt: 'auto'
                                                }}>
                                                    <Tooltip title="Edit Event Sensor">
                                                        <IconButton
                                                            size="small"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleEdit(sensor);
                                                            }}
                                                        >
                                                            <EditIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Delete Event Sensor">
                                                        <IconButton
                                                            size="small"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDelete(sensor.id);
                                                            }}
                                                        >
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Box>
                                            </CardContent>
                                        </Card>
                                    ))
                                ) : (
                                    <Paper sx={{ p: 3, textAlign: 'center', gridColumn: '1 / -1' }}>
                                        <Typography color="textSecondary">
                                            {searchTerm ? 'No event sensors match your search' : 'No event sensors found'}
                                        </Typography>
                                    </Paper>
                                )}
                            </Box>
                        )}
                    </Box>
                </AccordionDetails>
            </Accordion>

            <Dialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    {editingSensor ? 'Edit Event Sensor' : 'Add Event Sensor'}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                        <TextField
                            label="Name"
                            value={formData.name || ''}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            fullWidth
                            required
                            size="small"
                        />

                        <TextField
                            label="Sensor Tag"
                            value={formData.sensorTag || ''}
                            onChange={(e) => setFormData(prev => ({ ...prev, sensorTag: e.target.value }))}
                            fullWidth
                            required
                            size="small"
                            helperText="Unique identifier for this sensor"
                        />

                        <FormControl size="small" fullWidth>
                            <InputLabel>Sensor Type</InputLabel>
                            <Select
                                value={formData.sensorType || 'Text'}
                                label="Sensor Type"
                                onChange={(e) => setFormData(prev => ({ ...prev, sensorType: e.target.value }))}
                            >
                                {SENSOR_TYPES.map((type) => (
                                    <MenuItem key={type} value={type}>
                                        {type}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        {formData.sensorType === 'Color' ? (
                            <Box>
                                <Typography variant="caption" color="textSecondary" sx={{ mb: 0.5, display: 'block' }}>
                                    Color Value
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <input
                                        type="color"
                                        value={formData.value || '#ffffff'}
                                        onChange={(e) => setFormData(prev => ({ ...prev, value: e.target.value }))}
                                        style={{
                                            width: '50px',
                                            height: '40px',
                                            padding: '2px',
                                            border: '1px solid #ccc',
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                        }}
                                    />
                                    <TextField
                                        value={formData.value || '#ffffff'}
                                        onChange={(e) => setFormData(prev => ({ ...prev, value: e.target.value }))}
                                        placeholder="#ffffff"
                                        size="small"
                                        fullWidth
                                        inputProps={{
                                            style: {
                                                fontFamily: 'monospace',
                                                fontSize: '12px'
                                            }
                                        }}
                                    />
                                </Box>
                            </Box>
                        ) : formData.sensorType === 'Boolean' ? (
                            <Box>
                                <Typography variant="caption" color="textSecondary" sx={{ mb: 0.5, display: 'block' }}>
                                    Boolean Value
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant="body2">False</Typography>
                                    <Switch
                                        checked={formData.value === '1' || formData.value === 'true'}
                                        onChange={(e) => setFormData(prev => ({ ...prev, value: e.target.checked ? '1' : '0' }))}
                                        color="primary"
                                    />
                                    <Typography variant="body2">True</Typography>
                                </Box>
                            </Box>
                        ) : (
                            <TextField
                                label="Value"
                                value={formData.value || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, value: e.target.value }))}
                                fullWidth
                                size="small"
                                type={formData.sensorType === 'Number' ? 'number' : 'text'}
                                helperText="Enter the sensor value"
                            />
                        )}

                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField
                                label="Unit"
                                value={formData.unit || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, unit: e.target.value }))}
                                size="small"
                                sx={{ flex: 1 }}
                                helperText="e.g., °C, %, m/s"
                            />

                            <TextField
                                label="Decimal Places"
                                type="number"
                                value={formData.decimalPlaces ?? 2}
                                onChange={(e) => setFormData(prev => ({ ...prev, decimalPlaces: parseInt(e.target.value) || 0 }))}
                                size="small"
                                sx={{ width: 120 }}
                                inputProps={{ min: 0, max: 10 }}
                                disabled={formData.sensorType !== 'Number'}
                            />
                        </Box>

                        <TextField
                            label="Formula"
                            value={formData.formula || ''}
                            onChange={(e) => setFormData(prev => ({ ...prev, formula: e.target.value }))}
                            fullWidth
                            size="small"
                            helperText="Optional formula for value calculation"
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setDialogOpen(false)}
                        startIcon={<CancelIcon />}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        variant="contained"
                        startIcon={<SaveIcon />}
                    >
                        {editingSensor ? 'Update' : 'Create'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default EventEngineEventSensors;