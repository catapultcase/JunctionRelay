/*
 * This file is part of Junction Relay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * Junction Relay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Junction Relay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Junction Relay. If not, see <https://www.gnu.org/licenses/>.
 */

import React, { useState, useEffect, useMemo, useCallback, MouseEvent } from "react";
import {
    Typography, Box, Paper, Table, TableHead, TableRow, TableCell,
    TableBody, Checkbox, TextField, InputLabel, Select, MenuItem,
    FormControl, FormControlLabel, Chip, Pagination, Button,
    SelectChangeEvent, Popover, List, ListItem, ListItemText, IconButton
} from "@mui/material";

// Icon imports
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import SensorsIcon from '@mui/icons-material/Sensors';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

// Define the header styles to match your existing styling
const headerStyle = {
    padding: '8px 16px',
    borderBottom: '2px solid #ddd',
    fontWeight: 'bold',
    backgroundColor: '#f5f5f5'
};

const cellStyle = {
    padding: '6px 16px'
};

// Define interface for sensor object
interface Sensor {
    Id: number;
    name: string;
    sensorTag: string;
    deviceName: string;
    componentName?: string;
    externalId?: string;
    IsSelected: boolean;
    unit?: string;
    value?: any;
    sensorOrder: number;
    lastUpdated?: string;
    // Add other fields from Model_Sensor
    sensorType?: string;
    category?: string;
    formula?: string;
    isMissing?: boolean;
    isStale?: boolean;
    isVisible?: boolean;
    junctionId?: number;
    deviceId?: number;
    collectorId?: number;
    serviceId?: number;
    mqttTopic?: string;
    mqttQoS?: number;
    customAttribute1?: string;
    customAttribute2?: string;
    customAttribute3?: string;
    customAttribute4?: string;
    customAttribute5?: string;
    customAttribute6?: string;
    customAttribute7?: string;
    customAttribute8?: string;
    customAttribute9?: string;
    customAttribute10?: string;
    [key: string]: any; // Allow additional dynamic properties
}

// Define interface for source/target
interface SourceOrTarget {
    linkId?: number;
    id: number;
    type: "device" | "collector";
    name: string;
    description: string;
    ipAddress?: string;
    url?: string;
    role?: string;
    pollRateOverride?: number;
    sendRateOverride?: number;
}

// Define interface for sensor targets
interface SensorTargets {
    [sensorId: number]: Array<{
        deviceId: number;
        screenIds: number[];
    }>;
}

// Define interface for column
interface SensorColumn {
    field: string;
    label: string;
    align?: "left" | "right" | "center" | "inherit" | "justify";
    width?: string;
    required?: boolean; // Columns that can't be hidden
    renderCell?: (sensor: Sensor) => React.ReactNode;
}

// Props interface for the component
interface EnhancedSensorsTableProps {
    availableSensors: Sensor[];
    handleSensorSelect: (sensorId: number) => Promise<void>;
    handleSensorOrderChange: (sensor: Sensor, newOrder: number) => Promise<void>;
    handleSensorTagChange: (sensor: Sensor, newTag: string) => Promise<void>;
    getSensorOrder: (sensor: Sensor) => number;
    getSensorTag: (sensor: Sensor) => string;
    sensorTargets: SensorTargets;
    targets: SourceOrTarget[];
    removeSensorTarget: (junctionId: number, sensorId: number, deviceId: number) => Promise<void>;
    assignSensorTarget: (junctionId: number, sensorId: number, deviceId: number, screenId: number | null) => Promise<void>;
    setCurrentSensor: React.Dispatch<React.SetStateAction<any>>;
    setCurrentTargetDevice: React.Dispatch<React.SetStateAction<any>>;
    setScreenSelectionModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
    showSnackbar: (message: string, severity?: "success" | "info" | "warning" | "error") => void;
    setSensorTargets: React.Dispatch<React.SetStateAction<SensorTargets>>;
    showSelectedOnly?: boolean;
    setShowSelectedOnly?: (checked: boolean) => void;
    junctionId: number; // Add junctionId parameter


    // Props for customization
    hideTargetsColumn?: boolean;
    hideSelectionColumn?: boolean;
    hideSourceColumn?: boolean;
    customTitle?: string;
    customIcon?: React.ReactNode;
    customActions?: (sensor: Sensor) => React.ReactNode;
    readOnly?: boolean;
    showLastUpdated?: boolean;
    sensorsPerPageOverride?: number;
    hidePagination?: boolean;
    hideFilters?: boolean;
    additionalColumns?: {
        header: string;
        field: string;
        render: (sensor: Sensor) => React.ReactNode;
        width?: string;
    }[];
    localStorageKey?: string; // Key for storing column preferences
    defaultVisibleColumns?: string[]; // Default visible columns for the table
}

// Default storage key for columns
const STORAGE_KEY_DEFAULT = "sensors_table_visible_columns";

// Utility to move an item up/down in the visible list
const moveCol = (
    field: string,
    list: string[],
    setList: (a: string[]) => void,
    direction: "up" | "down"
) => {
    const i = list.indexOf(field);
    if (i < 0) return;
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return;
    const copy = [...list];
    copy.splice(i, 1);
    copy.splice(j, 0, field);
    setList(copy);
};

// Component for the enhanced sensors table
const EnhancedSensorsTable: React.FC<EnhancedSensorsTableProps> = ({
    availableSensors,
    handleSensorSelect,
    handleSensorOrderChange,
    handleSensorTagChange,
    getSensorOrder,
    getSensorTag,
    sensorTargets,
    targets,
    removeSensorTarget,
    assignSensorTarget,
    setCurrentSensor,
    setCurrentTargetDevice,
    setScreenSelectionModalOpen,
    showSnackbar,
    setSensorTargets,
    showSelectedOnly = false,
    setShowSelectedOnly,
    junctionId, // Add junctionId parameter here
    // Props with defaults
    hideTargetsColumn = false,
    hideSelectionColumn = false,
    hideSourceColumn = false,
    customTitle,
    customIcon,
    customActions,
    readOnly = false,
    showLastUpdated = false,
    sensorsPerPageOverride,
    hidePagination = false,
    hideFilters = false,
    additionalColumns = [],
    localStorageKey = STORAGE_KEY_DEFAULT,
    defaultVisibleColumns
}) => {
    // State for search and filters
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [selectedUnit, setSelectedUnit] = useState<string>('');

    // State for pagination
    const [page, setPage] = useState<number>(1);
    const [sensorsPerPage] = useState<number>(sensorsPerPageOverride || 20);

    // Derived state for filtering and pagination
    const [sensorsLoaded, setSensorsLoaded] = useState(false);
    const [filteredSensors, setFilteredSensors] = useState<Sensor[]>([]);

    // Define all possible columns
    const allColumns: SensorColumn[] = useMemo(() => {
        const standardColumns: SensorColumn[] = [
            // Core display columns
            { field: "selection", label: "Select", width: "80px", required: true },
            { field: "order", label: "Order", width: "80px", required: false },
            { field: "source", label: "Source", required: false },
            { field: "name", label: "Sensor Name", required: true },
            { field: "sensorTag", label: "Sensor Tag", required: false },
            { field: "value", label: "Value", required: true },
            { field: "unit", label: "Unit", required: true },
            { field: "lastUpdated", label: "Last Updated", required: false },
            { field: "targets", label: "Targets", required: false },
            { field: "actions", label: "Actions", align: "right", required: false },

            // Additional Model_Sensor fields from backend
            { field: "id", label: "ID", required: false },
            { field: "sensorType", label: "Sensor Type", required: false },
            { field: "externalId", label: "External ID", required: false },
            { field: "componentName", label: "Component", required: false },
            { field: "category", label: "Category", required: false },
            { field: "isStale", label: "Is Stale", required: false },
            { field: "junctionId", label: "Junction ID", required: false },
            { field: "deviceId", label: "Device ID", required: false },
            { field: "collectorId", label: "Collector ID", required: false },
            { field: "serviceId", label: "Service ID", required: false },
            { field: "mqttTopic", label: "MQTT Topic", required: false },
            { field: "mqttQoS", label: "MQTT QoS", required: false },
            { field: "customAttribute1", label: "Custom Attr 1", required: false },
            { field: "customAttribute2", label: "Custom Attr 2", required: false },
            { field: "customAttribute3", label: "Custom Attr 3", required: false },
            { field: "customAttribute4", label: "Custom Attr 4", required: false },
            { field: "customAttribute5", label: "Custom Attr 5", required: false },
            { field: "customAttribute6", label: "Custom Attr 6", required: false },
            { field: "customAttribute7", label: "Custom Attr 7", required: false },
            { field: "customAttribute8", label: "Custom Attr 8", required: false },
            { field: "customAttribute9", label: "Custom Attr 9", required: false },
            { field: "customAttribute10", label: "Custom Attr 10", required: false }
        ];

        // Add additional columns if provided
        const additionalSensorColumns: SensorColumn[] = additionalColumns.map(col => ({
            field: col.field,
            label: col.header,
            width: col.width,
            required: false,
            renderCell: col.render
        }));

        return [...standardColumns, ...additionalSensorColumns];
    }, [additionalColumns]);

    // Filter out columns that shouldn't be shown based on props
    const availableColumns = useMemo(() => {
        return allColumns.filter(col => {
            if (col.field === "selection" && hideSelectionColumn) return false;
            if (col.field === "order" && readOnly) return false;
            if (col.field === "source" && hideSourceColumn) return false;
            if (col.field === "lastUpdated" && !showLastUpdated) return false;
            if (col.field === "targets" && hideTargetsColumn) return false;
            if (col.field === "actions" && !customActions) return false;
            return true;
        });
    }, [allColumns, hideSelectionColumn, readOnly, hideSourceColumn, showLastUpdated, hideTargetsColumn, customActions]);

    // State for visible columns (ordered)
    const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
        // Try to get from localStorage first
        const stored = localStorage.getItem(localStorageKey);
        if (stored) {
            try {
                const parsedColumns = JSON.parse(stored);
                // Filter out any columns that don't exist anymore
                const filteredColumns = parsedColumns.filter((field: string) =>
                    availableColumns.some(col => col.field === field)
                );

                // If we have valid columns from localStorage, use them
                if (filteredColumns.length > 0) {
                    return filteredColumns;
                }
            } catch (e) {
                console.error("Error parsing stored columns:", e);
            }
        }

        // If localStorage doesn't have valid columns, use defaultVisibleColumns if provided
        if (defaultVisibleColumns && defaultVisibleColumns.length > 0) {
            // Filter to ensure all columns exist in availableColumns
            return defaultVisibleColumns.filter(field =>
                availableColumns.some(col => col.field === field)
            );
        }

        // Fallback to standard defaults if no defaultVisibleColumns provided
        const standardDefaults = [
            "id", "externalId", "name", "componentName",
            "value", "unit", "lastUpdated", "actions"
        ];

        // Return standard defaults filtered to available columns
        return standardDefaults.filter(field =>
            availableColumns.some(col => col.field === field)
        );
    });

    // Popover state for column selector
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    // Save visible columns to localStorage when they change
    useEffect(() => {
        localStorage.setItem(localStorageKey, JSON.stringify(visibleColumns));
    }, [visibleColumns, localStorageKey]);

    // Extract unique units from available sensors
    const availableUnits = useMemo(() => {
        const unitSet = new Set<string>();
        availableSensors.forEach(sensor => {
            if (sensor.unit) {
                unitSet.add(sensor.unit);
            }
        });
        return Array.from(unitSet).sort();
    }, [availableSensors]);

    // Handle Count of Sensors
    const selectedSensorsCount = useMemo(() => {
        return availableSensors.filter(s => s.IsSelected).length;
    }, [availableSensors]);

    // Handle search query changes
    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
        setPage(1); // Reset to first page when search changes
    };

    // Handle unit filter changes
    const handleUnitFilterChange = (event: SelectChangeEvent<string>) => {
        setSelectedUnit(event.target.value);
        setPage(1); // Reset to first page when filter changes
    };

    // Add after any of your existing useEffect hooks
    useEffect(() => {
        if (availableSensors.length > 0 && !sensorsLoaded) {
            setSensorsLoaded(true);
        }
    }, [availableSensors, sensorsLoaded]);

    // Handle show selected only toggle
    const handleShowSelectedOnlyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newCheckedState = e.target.checked;

        // If trying to enable the filter when no sensors are selected, prevent it
        if (newCheckedState && selectedSensorsCount === 0) {
            showSnackbar("Cannot enable filter - no sensors are currently selected", "warning");
            return; // Don't update the state
        }

        // Only proceed with the change if setShowSelectedOnly is provided
        if (setShowSelectedOnly) {
            setShowSelectedOnly(newCheckedState);
            setPage(1); // Reset to first page when filter changes
        }
    };

    // Handle page changes
    const handlePageChange = (event: React.ChangeEvent<unknown>, value: number) => {
        setPage(value);
    };

    // Handle column visibility toggle
    const handleToggleColumn = useCallback((field: string, checked: boolean) => {
        if (checked) {
            setVisibleColumns(prev => [...prev, field]);
        } else {
            // Don't allow removing required columns
            const column = availableColumns.find(col => col.field === field);
            if (column?.required) return;

            setVisibleColumns(prev => prev.filter(f => f !== field));
        }
    }, [availableColumns]);

    // Handle column reordering
    const handleMoveColumn = useCallback((field: string, direction: "up" | "down") => {
        moveCol(field, visibleColumns, setVisibleColumns, direction);
    }, [visibleColumns]);

    // Column selector popover handlers
    const openColumnSelector = (event: MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const closeColumnSelector = () => {
        setAnchorEl(null);
    };

    // Filter sensors based on search query, unit filter, and selection status
    useEffect(() => {
        const filtered = availableSensors.filter((sensor) => {
            // Apply text search filter
            const matchesSearchQuery = !searchQuery ||
                sensor.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                sensor.sensorTag?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                sensor.componentName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                sensor.externalId?.toLowerCase().includes(searchQuery.toLowerCase());

            // Apply unit filter
            const matchesUnitFilter = !selectedUnit || sensor.unit === selectedUnit;

            // Apply selected only filter
            const matchesSelectedFilter = !showSelectedOnly || sensor.IsSelected;

            return matchesSearchQuery && matchesUnitFilter && matchesSelectedFilter;
        });

        setFilteredSensors(filtered);
    }, [searchQuery, selectedUnit, showSelectedOnly, availableSensors]);

    useEffect(() => {
        // Only apply this logic after sensors have been loaded at least once
        if (sensorsLoaded) {
            // If the count of selected sensors drops to zero and the filter is currently enabled,
            // automatically disable the filter
            if (selectedSensorsCount === 0 && showSelectedOnly && setShowSelectedOnly) {
                setShowSelectedOnly(false);
            }
        }
    }, [selectedSensorsCount, showSelectedOnly, setShowSelectedOnly, sensorsLoaded]);

    // Calculate pagination
    const totalPages = Math.ceil(filteredSensors.length / sensorsPerPage);
    const paginatedSensors = useMemo(() => {
        return hidePagination ? filteredSensors : filteredSensors.slice(
            (page - 1) * sensorsPerPage,
            page * sensorsPerPage
        );
    }, [filteredSensors, page, sensorsPerPage, hidePagination]);

    // Reset to first page if we end up with no data on the current page (can happen when filters change)
    useEffect(() => {
        if (paginatedSensors.length === 0 && page > 1 && filteredSensors.length > 0) {
            setPage(1);
        }
    }, [paginatedSensors, page, filteredSensors]);

    // Clear filters function
    const clearFilters = () => {
        setSearchQuery('');
        setSelectedUnit('');
        // Only reset the showSelectedOnly if there are selected sensors
        if (setShowSelectedOnly && selectedSensorsCount > 0) {
            setShowSelectedOnly(false);
        }
        setPage(1);
    };

    // Format relative time (helper function)
    const formatRelativeTime = (isoTime?: string) => {
        if (!isoTime) return '—';

        const then = new Date(isoTime).getTime();
        const now = Date.now();
        const diff = now - then;
        const sec = Math.floor(diff / 1000);

        if (sec < 60) return `${sec}s ago`;
        const min = Math.floor(sec / 60);
        if (min < 60) return `${min}m ago`;
        const hr = Math.floor(min / 60);
        if (hr < 24) return `${hr}h ago`;
        const day = Math.floor(hr / 24);
        if (day < 7) return `${day}d ago`;
        const wk = Math.floor(day / 7);
        return `${wk}w ago`;
    };

    // Format boolean values
    const formatBoolean = (value?: boolean) => {
        if (value === undefined || value === null) return '—';
        return value ? 'Yes' : 'No';
    };

    // Render cell content based on column field
    const renderCellContent = (sensor: Sensor, field: string) => {
        // Check if there's a custom renderer for additional columns
        const additionalColumn = additionalColumns.find(col => col.field === field);
        if (additionalColumn && additionalColumn.render) {
            return additionalColumn.render(sensor);
        }

        // Handle default columns
        switch (field) {
            case "selection":
                return (
                    <Checkbox
                        checked={sensor.IsSelected}
                        onChange={() => handleSensorSelect(sensor.Id)}
                        size="small"
                    />
                );
            case "order":
                return (
                    <TextField
                        size="small"
                        value={getSensorOrder(sensor)}
                        onChange={(e) => handleSensorOrderChange(sensor, parseInt(e.target.value, 10))}
                        type="number"
                        slotProps={{
                            htmlInput: { min: 0 }
                        }}
                        sx={{ width: "60px" }}
                        variant="outlined"
                    />
                );
            case "source":
                return sensor.deviceName;
            case "name":
                return sensor.name;
            case "sensorTag":
                return readOnly ? (
                    <Typography>{getSensorTag(sensor)}</Typography>
                ) : (
                    <TextField
                        size="small"
                        value={getSensorTag(sensor)}
                        onChange={(e) => handleSensorTagChange(sensor, e.target.value)}
                        sx={{ width: "200px" }}
                        variant="outlined"
                    />
                );
            case "value":
                return sensor.value !== undefined ? sensor.value : '—';
            case "unit":
                return sensor.unit ? (
                    <Chip
                        label={sensor.unit}
                        size="small"
                        variant="outlined"
                        color={selectedUnit === sensor.unit ? "primary" : "default"}
                    />
                ) : '—';
            case "lastUpdated":
                return formatRelativeTime(sensor.lastUpdated);
            case "targets": {
                const assignedTargets = sensorTargets[sensor.Id] || [];
                return (
                    <Box>
                        {targets
                            .filter(t => t.type === "device")
                            .map((device) => {
                                const isChecked = assignedTargets.some(t => t.deviceId === device.id);
                                const targetData = assignedTargets.find(t => t.deviceId === device.id);
                                const assignedScreenCount = targetData?.screenIds.length || 0;

                                return (
                                    <Box key={`devchk-${sensor.Id}-${device.id}`} sx={{ mb: 1 }}>
                                        <FormControlLabel
                                            control={
                                                <Checkbox
                                                    checked={isChecked}
                                                    onChange={async () => {
                                                        try {
                                                            if (isChecked) {
                                                                await removeSensorTarget(junctionId, sensor.Id, device.id);
                                                            } else {
                                                                await assignSensorTarget(junctionId, sensor.Id, device.id, null);
                                                            }

                                                            const newList = isChecked
                                                                ? assignedTargets.filter(t => t.deviceId !== device.id)
                                                                : [...assignedTargets, { deviceId: device.id, screenIds: [] }];

                                                            setSensorTargets(prev => ({
                                                                ...prev,
                                                                [sensor.Id]: newList
                                                            }));
                                                        } catch (error) {
                                                            console.error("Error updating sensor target:", error);
                                                            showSnackbar("Failed to update sensor target", "error");
                                                        }
                                                    }}
                                                    size="small"
                                                />
                                            }
                                            label={
                                                <Typography variant="body2">
                                                    {device.name}
                                                </Typography>
                                            }
                                        />

                                        {isChecked && (
                                            <Box sx={{ display: 'flex', alignItems: 'center', ml: 4 }}>
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    onClick={() => {
                                                        setCurrentSensor(sensor);
                                                        setCurrentTargetDevice(device);
                                                        setScreenSelectionModalOpen(true);
                                                    }}
                                                    sx={{ ml: 1 }}
                                                >
                                                    {assignedScreenCount > 0 ? (
                                                        <>
                                                            <Chip
                                                                size="small"
                                                                label={assignedScreenCount}
                                                                color="primary"
                                                                sx={{ mr: 1, height: 20 }}
                                                            />
                                                            {assignedScreenCount === 1
                                                                ? "Screen Selected"
                                                                : "Screens Selected"}
                                                        </>
                                                    ) : (
                                                        "Assign Screens"
                                                    )}
                                                </Button>
                                            </Box>
                                        )}
                                    </Box>
                                );
                            })}
                    </Box>
                );
            }
            case "actions":
                return customActions ? customActions(sensor) : null;
            case "id":
                return sensor.Id;
            case "sensorType":
                return sensor.sensorType || '—';
            case "externalId":
                return sensor.externalId || '—';
            case "componentName":
                return sensor.componentName || '—';
            case "category":
                return sensor.category || '—';
            case "formula":
                return sensor.formula || '—';
            case "isMissing":
                return formatBoolean(sensor.isMissing);
            case "isStale":
                return formatBoolean(sensor.isStale);
            case "isVisible":
                return formatBoolean(sensor.isVisible);
            case "junctionId":
                return sensor.junctionId || '—';
            case "deviceId":
                return sensor.deviceId || '—';
            case "collectorId":
                return sensor.collectorId || '—';
            case "serviceId":
                return sensor.serviceId || '—';
            case "mqttTopic":
                return sensor.mqttTopic || '—';
            case "mqttQoS":
                return sensor.mqttQoS !== undefined ? sensor.mqttQoS : '—';
            case "customAttribute1":
                return sensor.customAttribute1 || '—';
            case "customAttribute2":
                return sensor.customAttribute2 || '—';
            case "customAttribute3":
                return sensor.customAttribute3 || '—';
            case "customAttribute4":
                return sensor.customAttribute4 || '—';
            case "customAttribute5":
                return sensor.customAttribute5 || '—';
            case "customAttribute6":
                return sensor.customAttribute6 || '—';
            case "customAttribute7":
                return sensor.customAttribute7 || '—';
            case "customAttribute8":
                return sensor.customAttribute8 || '—';
            case "customAttribute9":
                return sensor.customAttribute9 || '—';
            case "customAttribute10":
                return sensor.customAttribute10 || '—';
            default:
                // Try to access the property dynamically
                return sensor[field] !== undefined ? sensor[field] : '—';
        }
    };

    return (
        <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
            {/* Table Header with Title and Controls */}
            <Box display="flex" alignItems="center" mb={2}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
                    {customIcon || <SensorsIcon sx={{ mr: 1 }} />}
                    {customTitle || "Sensors Configuration"}
                </Typography>

                <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Button
                        onClick={openColumnSelector}
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

                    {/* Column Selector Popover */}
                    <Popover
                        open={Boolean(anchorEl)}
                        anchorEl={anchorEl}
                        onClose={closeColumnSelector}
                        anchorOrigin={{
                            vertical: 'bottom',
                            horizontal: 'right',
                        }}
                        transformOrigin={{
                            vertical: 'top',
                            horizontal: 'right',
                        }}
                    >
                        <List dense sx={{ width: 300, maxHeight: 500, overflow: 'auto' }}>
                            {/* Section title for visible columns */}
                            <ListItem sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
                                <ListItemText
                                    primary="Visible Columns"
                                    slotProps={{
                                        primary: { fontWeight: 'bold' }
                                    }}
                                />
                            </ListItem>

                            {/* Visible columns */}
                            {visibleColumns.map((field, idx) => {
                                const column = availableColumns.find(col => col.field === field);
                                if (!column) return null;
                                return (
                                    <ListItem key={field} sx={{ pr: 1 }}>
                                        <Checkbox
                                            checked
                                            onChange={(e) => handleToggleColumn(field, e.target.checked)}
                                            disabled={column.required} // Can't uncheck required columns
                                            size="small"
                                        />
                                        <ListItemText primary={column.label} />
                                        <IconButton
                                            size="small"
                                            disabled={idx === 0}
                                            onClick={() => handleMoveColumn(field, "up")}
                                        >
                                            <ArrowUpwardIcon fontSize="inherit" />
                                        </IconButton>
                                        <IconButton
                                            size="small"
                                            disabled={idx === visibleColumns.length - 1}
                                            onClick={() => handleMoveColumn(field, "down")}
                                        >
                                            <ArrowDownwardIcon fontSize="inherit" />
                                        </IconButton>
                                    </ListItem>
                                );
                            })}

                            {/* Section title for available columns */}
                            <ListItem sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
                                <ListItemText
                                    primary="Available Columns"
                                    slotProps={{
                                        primary: { fontWeight: 'bold' }
                                    }}
                                />
                            </ListItem>

                            {/* Hidden columns */}
                            {availableColumns
                                .filter(col => !visibleColumns.includes(col.field))
                                .map(({ field, label, required }) => (
                                    <ListItem key={field}>
                                        <Checkbox
                                            checked={false}
                                            onChange={(e) => handleToggleColumn(field, e.target.checked)}
                                            size="small"
                                        />
                                        <ListItemText primary={label} />
                                    </ListItem>
                                ))}
                        </List>
                    </Popover>
                </Box>
            </Box>

            {/* Enhanced Filter Section - Only show if not hidden */}
            {!hideFilters && (
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    {/* Left side: Search and Unit Filter */}
                    <Box display="flex" alignItems="center" gap={2}>
                        <TextField
                            placeholder="Search sensors..."
                            size="small"
                            value={searchQuery}
                            onChange={handleSearchChange}
                            slotProps={{
                                input: {
                                    startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
                                }
                            }}
                            sx={{ width: 300 }}
                        />

                        <FormControl size="small" sx={{ minWidth: 250 }}>
                            <InputLabel
                                id="unit-filter-label"
                                sx={{ display: 'flex', alignItems: 'center' }}
                            >
                                <FilterListIcon fontSize="small" sx={{ mr: 0.5 }} />
                                Filter by Unit
                            </InputLabel>
                            <Select
                                labelId="unit-filter-label"
                                value={selectedUnit}
                                onChange={handleUnitFilterChange}
                                label="Filter by Unit"
                            >
                                <MenuItem value="">
                                    <em>All Units</em>
                                </MenuItem>
                                {availableUnits.map((unit) => (
                                    <MenuItem key={unit} value={unit}>
                                        {unit}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        {/* Clear filters button - only show when filters are active */}
                        {(searchQuery || selectedUnit || showSelectedOnly) && (
                            <Button
                                size="small"
                                variant="outlined"
                                onClick={clearFilters}
                            >
                                Clear Filters
                            </Button>
                        )}
                    </Box>

                    {/* Right side: Show Selected Only Checkbox - Only if setShowSelectedOnly is provided */}
                    {setShowSelectedOnly && !hideSelectionColumn && (
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={showSelectedOnly || false}
                                    onChange={handleShowSelectedOnlyChange}
                                    size="small"
                                    disabled={selectedSensorsCount === 0} // Disable when no sensors are selected
                                />
                            }
                            label={
                                <Typography
                                    variant="body2"
                                    color={selectedSensorsCount === 0 ? "text.disabled" : "text.primary"}
                                >
                                    Show Selected Only
                                    {selectedSensorsCount === 0 && " (No sensors selected)"}
                                </Typography>
                            }
                        />
                    )}
                </Box>
            )}

            {/* Stats summary */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                    Showing {paginatedSensors.length} of {filteredSensors.length} sensors
                    {filteredSensors.length !== availableSensors.length && (
                        <> (filtered from {availableSensors.length} total)</>
                    )}
                </Typography>
                {!hideSelectionColumn && (
                    <Typography variant="body2" color={selectedSensorsCount === 0 ? "text.disabled" : "text.secondary"}>
                        {selectedSensorsCount} sensors selected
                    </Typography>
                )}
            </Box>

            {/* Sensors Table */}
            <Paper variant="outlined" sx={{ mb: 2 }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
                            {visibleColumns.map((field) => {
                                const column = availableColumns.find(col => col.field === field);
                                if (!column) return null;
                                return (
                                    <TableCell
                                        key={field}
                                        sx={headerStyle}
                                        width={column.width}
                                        align={column.align || "left"}
                                    >
                                        {column.label}
                                    </TableCell>
                                );
                            })}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {paginatedSensors.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={visibleColumns.length}
                                    align="center"
                                    sx={{ py: 3 }}
                                >
                                    <Typography variant="body2" color="text.secondary">
                                        No sensors found matching your criteria.
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginatedSensors.map((sensor) => (
                                <TableRow key={sensor.Id} hover>
                                    {visibleColumns.map((field) => {
                                        const column = availableColumns.find(col => col.field === field);
                                        if (!column) return null;
                                        return (
                                            <TableCell
                                                key={`${sensor.Id}-${field}`}
                                                sx={cellStyle}
                                                align={column.align || "left"}
                                            >
                                                {renderCellContent(sensor, field)}
                                            </TableCell>
                                        );
                                    })}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </Paper>

            {/* Pagination Controls - Only show if pagination is not hidden and there are multiple pages */}
            {!hidePagination && totalPages > 1 && (
                <Box display="flex" justifyContent="center" mt={2}>
                    <Pagination
                        count={totalPages}
                        page={page}
                        onChange={handlePageChange}
                        color="primary"
                        showFirstButton
                        showLastButton
                    />
                </Box>
            )}
        </Paper>
    );
};

export default EnhancedSensorsTable;