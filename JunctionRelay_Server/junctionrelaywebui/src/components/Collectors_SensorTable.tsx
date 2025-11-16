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
    Typography, Box, Paper, Table, TableHead, TableRow, TableCell,
    TableBody, TextField, InputLabel, Select, MenuItem,
    FormControl, Pagination, SvgIconProps, Popover, List, ListItem,
    ListItemText, Checkbox, IconButton, Button, Chip
} from "@mui/material";
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

// Define interface for sensor object
interface Sensor {
    Id: number;
    name: string;
    sensorTag: string;
    deviceName: string;
    componentName?: string;
    ComponentName?: string;  // API returns PascalCase
    externalId?: string;
    unit?: string;
    value?: any;
    decimalPlaces: number;
    sensorOrder: number;
    lastUpdated?: string;
    sensorType?: string;
    SensorType?: string;  // API returns PascalCase
    category?: string;
    isMissing?: boolean;
    isStale?: boolean;
    [key: string]: any;
}

// Define interface for column
interface SensorColumn {
    field: string;
    label: string;
    width?: string;
}

interface Collectors_SensorTableProps {
    sensors: Sensor[];
    title?: string;
    icon?: React.ReactElement<SvgIconProps>;
    customActions?: (sensor: Sensor) => React.ReactNode;
    appVersion?: string;
    localStorageKey?: string;
}

const Collectors_SensorTable: React.FC<Collectors_SensorTableProps> = ({
    sensors,
    title = "Sensors",
    icon,
    customActions,
    appVersion,
    localStorageKey = "collector_sensors"
}) => {
    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [sensorsPerPage, setSensorsPerPage] = useState(() => {
        if (appVersion && localStorageKey) {
            try {
                const stored = localStorage.getItem(`${appVersion}_${localStorageKey}_perPage`);
                return stored ? parseInt(stored, 10) : 25;
            } catch (e) {
                return 25;
            }
        }
        return 25;
    });

    // Filter states
    const [searchQuery, setSearchQuery] = useState("");
    const [unitFilter, setUnitFilter] = useState("all");

    // Column management
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    // All available columns
    const allColumns: SensorColumn[] = useMemo(() => [
        { field: "id", label: "ID", width: "80px" },
        { field: "order", label: "Order", width: "100px" },
        { field: "externalId", label: "External ID", width: "120px" },
        { field: "name", label: "Name" },
        { field: "sensorTag", label: "Sensor Tag", width: "150px" },
        { field: "componentName", label: "Component", width: "150px" },
        { field: "value", label: "Value", width: "120px" },
        { field: "unit", label: "Unit", width: "100px" },
        { field: "sensorType", label: "Type", width: "120px" },
        { field: "decimalPlaces", label: "Decimals", width: "100px" },
        { field: "category", label: "Category", width: "120px" },
        { field: "lastUpdated", label: "Last Updated", width: "180px" },
        { field: "actions", label: "Actions", width: "150px" }
    ], []);

    // Visible columns state
    const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
        let columns: string[] = [];

        if (appVersion && localStorageKey) {
            try {
                const stored = localStorage.getItem(`${appVersion}_${localStorageKey}_columns`);
                if (stored) {
                    columns = JSON.parse(stored);
                }
            } catch (e) {
                console.error("Error loading visible columns:", e);
            }
        }

        // Default columns if nothing loaded
        if (columns.length === 0) {
            columns = ["name", "sensorTag", "componentName", "value", "unit", "sensorType", "lastUpdated", "actions"];
        }

        // Ensure actions is always last
        const withoutActions = columns.filter(c => c !== 'actions');
        if (columns.includes('actions')) {
            return [...withoutActions, 'actions'];
        }
        return withoutActions;
    });

    // Persist visible columns
    useEffect(() => {
        if (appVersion && localStorageKey) {
            try {
                localStorage.setItem(`${appVersion}_${localStorageKey}_columns`, JSON.stringify(visibleColumns));
            } catch (e) {
                console.error("Error saving visible columns:", e);
            }
        }
    }, [visibleColumns, appVersion, localStorageKey]);

    // Persist sensors per page
    useEffect(() => {
        if (appVersion && localStorageKey) {
            try {
                localStorage.setItem(`${appVersion}_${localStorageKey}_perPage`, sensorsPerPage.toString());
            } catch (e) {
                console.error("Error saving sensors per page:", e);
            }
        }
    }, [sensorsPerPage, appVersion, localStorageKey]);

    // Get unique units for filter
    const availableUnits = useMemo(() => {
        const units = new Set<string>();
        sensors.forEach(sensor => {
            if (sensor.unit && sensor.unit.trim() !== '') {
                units.add(sensor.unit);
            }
        });
        return Array.from(units).sort();
    }, [sensors]);

    // Filter sensors
    const filteredSensors = useMemo(() => {
        return sensors.filter(sensor => {
            // Search filter - check both PascalCase and camelCase
            const componentName = sensor.ComponentName || sensor.componentName || '';
            const matchesSearch = searchQuery === "" ||
                sensor.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                sensor.sensorTag?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                componentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                sensor.externalId?.toLowerCase().includes(searchQuery.toLowerCase());

            // Unit filter
            const matchesUnit = unitFilter === "all" || sensor.unit === unitFilter;

            return matchesSearch && matchesUnit;
        });
    }, [sensors, searchQuery, unitFilter]);

    // Pagination
    const totalPages = Math.ceil(filteredSensors.length / sensorsPerPage);
    const paginatedSensors = useMemo(() => {
        const start = (currentPage - 1) * sensorsPerPage;
        return filteredSensors.slice(start, start + sensorsPerPage);
    }, [filteredSensors, currentPage, sensorsPerPage]);

    // Format value for display
    const formatValueDisplay = (value: any, decimalPlaces: number = 2): string => {
        if (value === null || value === undefined || value === '') return '—';
        if (typeof value === 'number') {
            return value.toFixed(decimalPlaces);
        }
        return String(value);
    };

    // Format relative time
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

    // Column management functions
    const handleToggleColumn = (field: string) => {
        if (visibleColumns.includes(field)) {
            setVisibleColumns(prev => prev.filter(f => f !== field));
        } else {
            // When adding, ensure actions is always last
            setVisibleColumns(prev => {
                const withoutActions = prev.filter(f => f !== 'actions');
                const newColumns = [...withoutActions, field];
                // If actions was in the list, add it back at the end
                if (prev.includes('actions')) {
                    return [...newColumns.filter(f => f !== 'actions'), 'actions'];
                }
                return newColumns;
            });
        }
    };

    const handleMoveColumn = (field: string, direction: 'up' | 'down') => {
        // Don't allow moving the actions column
        if (field === 'actions') return;

        const index = visibleColumns.indexOf(field);
        if (index === -1) return;

        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= visibleColumns.length) return;

        // Don't allow swapping with actions column
        if (visibleColumns[newIndex] === 'actions') return;

        const newColumns = [...visibleColumns];
        [newColumns[index], newColumns[newIndex]] = [newColumns[newIndex], newColumns[index]];
        setVisibleColumns(newColumns);
    };

    // Render cell content
    const renderCellContent = (sensor: Sensor, field: string) => {
        switch (field) {
            case "id":
                return sensor.Id;
            case "order":
                return sensor.sensorOrder || '—';
            case "externalId":
                return sensor.externalId || '—';
            case "name":
                return sensor.name;
            case "sensorTag":
                return sensor.sensorTag || '—';
            case "componentName":
                return sensor.ComponentName || sensor.componentName || '—';
            case "value":
                return formatValueDisplay(sensor.value, sensor.decimalPlaces);
            case "unit":
                return sensor.unit ? (
                    <Chip
                        label={sensor.unit}
                        size="small"
                        variant="outlined"
                        color={unitFilter === sensor.unit ? "primary" : "default"}
                    />
                ) : '—';
            case "sensorType":
                return sensor.SensorType || sensor.sensorType || 'Number';
            case "decimalPlaces":
                return sensor.decimalPlaces;
            case "category":
                return sensor.category || '—';
            case "lastUpdated":
                return formatRelativeTime(sensor.lastUpdated);
            case "actions":
                return customActions ? customActions(sensor) : null;
            default:
                return '—';
        }
    };

    // Get visible column definitions
    const visibleColumnDefs = useMemo(() => {
        return visibleColumns
            .map(field => allColumns.find(col => col.field === field))
            .filter((col): col is SensorColumn => col !== undefined);
    }, [visibleColumns, allColumns]);

    return (
        <Paper elevation={2} sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    {icon}
                    <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                        {title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
                        ({filteredSensors.length} {filteredSensors.length === 1 ? 'sensor' : 'sensors'})
                    </Typography>
                </Box>

                {/* Column Selector Button */}
                <Button
                    size="small"
                    variant="outlined"
                    startIcon={<ViewColumnIcon />}
                    onClick={(e) => setAnchorEl(e.currentTarget)}
                >
                    Columns ({visibleColumns.length})
                </Button>
            </Box>

            {/* Filters */}
            <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2} mb={2}>
                <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
                    <TextField
                        placeholder="Search sensors..."
                        size="small"
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setCurrentPage(1);
                        }}
                        slotProps={{
                            input: {
                                startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
                            }
                        }}
                        sx={{ width: { xs: '100%', sm: 300 } }}
                    />

                    <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 250 } }}>
                        <InputLabel
                            id="unit-filter-label"
                            sx={{ display: 'flex', alignItems: 'center' }}
                        >
                            <FilterListIcon fontSize="small" sx={{ mr: 0.5 }} />
                            Filter by Unit
                        </InputLabel>
                        <Select
                            labelId="unit-filter-label"
                            value={unitFilter}
                            onChange={(e) => {
                                setUnitFilter(e.target.value);
                                setCurrentPage(1);
                            }}
                            label="Filter by Unit"
                        >
                            <MenuItem value="all">All Units</MenuItem>
                            {availableUnits.map(unit => (
                                <MenuItem key={unit} value={unit}>{unit}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Box>

                {/* Sensors per page */}
                <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel>Per Page</InputLabel>
                    <Select
                        value={sensorsPerPage}
                        onChange={(e) => {
                            setSensorsPerPage(Number(e.target.value));
                            setCurrentPage(1);
                        }}
                        label="Per Page"
                    >
                        <MenuItem value={10}>10</MenuItem>
                        <MenuItem value={25}>25</MenuItem>
                        <MenuItem value={50}>50</MenuItem>
                        <MenuItem value={100}>100</MenuItem>
                    </Select>
                </FormControl>
            </Box>

            {/* Column Selector Popover */}
            <Popover
                open={Boolean(anchorEl)}
                anchorEl={anchorEl}
                onClose={() => setAnchorEl(null)}
                anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'right',
                }}
                transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                }}
            >
                <List dense sx={{ width: 350, maxHeight: 500, overflow: 'auto' }}>
                    {/* Section title */}
                    <ListItem sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
                        <ListItemText
                            primary="Manage Columns"
                            secondary="Select columns to display and reorder them"
                            slotProps={{
                                primary: { fontWeight: 'bold' },
                                secondary: { variant: 'caption' }
                            }}
                        />
                    </ListItem>

                    {/* Selected columns with ordering */}
                    {visibleColumns.length > 0 && (
                        <>
                            <ListItem sx={{ backgroundColor: 'rgba(0, 0, 0, 0.02)', py: 0.5 }}>
                                <ListItemText
                                    primary="Selected Columns"
                                    slotProps={{
                                        primary: { variant: 'caption', fontWeight: 'bold' }
                                    }}
                                />
                            </ListItem>
                            {visibleColumns.map((field, index) => {
                                const column = allColumns.find(col => col.field === field);
                                if (!column) return null;
                                // Don't show actions column if customActions not provided
                                if (column.field === 'actions' && !customActions) return null;

                                return (
                                    <ListItem key={field} sx={{ py: 0.5 }}>
                                        <Checkbox
                                            checked={true}
                                            onChange={() => handleToggleColumn(field)}
                                            size="small"
                                        />
                                        <ListItemText primary={column.label} />
                                        {/* Don't show arrows for Actions column - it's always last */}
                                        {field !== 'actions' && (
                                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleMoveColumn(field, 'up')}
                                                    disabled={index === 0}
                                                    sx={{ p: 0.5 }}
                                                >
                                                    <ArrowUpwardIcon fontSize="small" />
                                                </IconButton>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleMoveColumn(field, 'down')}
                                                    disabled={index === visibleColumns.length - 1 || visibleColumns[index + 1] === 'actions'}
                                                    sx={{ p: 0.5 }}
                                                >
                                                    <ArrowDownwardIcon fontSize="small" />
                                                </IconButton>
                                            </Box>
                                        )}
                                    </ListItem>
                                );
                            })}
                        </>
                    )}

                    {/* Available columns to add */}
                    {allColumns.filter(col => !visibleColumns.includes(col.field) && (col.field !== 'actions' || customActions)).length > 0 && (
                        <>
                            <ListItem sx={{ backgroundColor: 'rgba(0, 0, 0, 0.02)', py: 0.5, mt: visibleColumns.length > 0 ? 1 : 0 }}>
                                <ListItemText
                                    primary="Available Columns"
                                    slotProps={{
                                        primary: { variant: 'caption', fontWeight: 'bold' }
                                    }}
                                />
                            </ListItem>
                            {allColumns
                                .filter(col => !visibleColumns.includes(col.field) && (col.field !== 'actions' || customActions))
                                .map((column) => (
                                    <ListItem key={column.field} sx={{ py: 0.5 }}>
                                        <Checkbox
                                            checked={false}
                                            onChange={() => handleToggleColumn(column.field)}
                                            size="small"
                                        />
                                        <ListItemText primary={column.label} />
                                    </ListItem>
                                ))}
                        </>
                    )}
                </List>
            </Popover>

            {/* Table */}
            <Table size="small">
                <TableHead>
                    <TableRow>
                        {visibleColumnDefs.map(column => (
                            <TableCell
                                key={column.field}
                                sx={{ fontWeight: 'bold', width: column.width }}
                            >
                                {column.label}
                            </TableCell>
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {paginatedSensors.length > 0 ? (
                        paginatedSensors.map((sensor) => (
                            <TableRow key={sensor.Id} hover>
                                {visibleColumnDefs.map(column => (
                                    <TableCell key={column.field}>
                                        {renderCellContent(sensor, column.field)}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={visibleColumnDefs.length} align="center">
                                <Typography variant="body2" color="text.secondary">
                                    No sensors found
                                </Typography>
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
                <Box display="flex" justifyContent="center" mt={2}>
                    <Pagination
                        count={totalPages}
                        page={currentPage}
                        onChange={(_, page) => setCurrentPage(page)}
                        color="primary"
                        showFirstButton
                        showLastButton
                    />
                </Box>
            )}
        </Paper>
    );
};

export default Collectors_SensorTable;
