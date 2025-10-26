/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024�present Jonathan Mills, CatapultCase
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

import React, { useState, useEffect, useMemo, useCallback, MouseEvent, memo } from "react";
import {
    Typography, Box, Paper, Table, TableHead, TableRow, TableCell,
    TableBody, Checkbox, TextField, InputLabel, Select, MenuItem,
    FormControl, FormControlLabel, Chip, Pagination, Button,
    SelectChangeEvent, Popover, List, ListItem, ListItemText, IconButton,
    Modal, Dialog, DialogTitle, DialogContent, DialogActions,
    ToggleButtonGroup, ToggleButton, Card, CardContent, Divider,
    useTheme, useMediaQuery, Tooltip, Switch, TableContainer, Grid
} from "@mui/material";

// Icon imports
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import SensorsIcon from '@mui/icons-material/Sensors';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import TableViewIcon from '@mui/icons-material/TableView';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import DashboardIcon from '@mui/icons-material/Dashboard';
import LinkIcon from '@mui/icons-material/Link';

const cellStyle = {
    padding: '6px 16px'
};

// Types
type ViewMode = 'table' | 'standard' | 'mini';

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
    decimalPlaces: number;
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
interface Junction_EnhancedSensorSelectorProps {
    availableSensors: Sensor[];
    handleSensorSelect: (sensorId: number) => Promise<void>;
    handleSensorOrderChange: (sensor: Sensor, newOrder: number) => Promise<void>;
    handleSensorTagChange: (sensor: Sensor, newTag: string) => Promise<void>;
    handleSensorUpdate?: (updatedSensor: Sensor) => void;
    getSensorOrder: (sensor: Sensor) => number;
    getSensorTag: (sensor: Sensor) => string;
    sensorTargets: SensorTargets;
    targets: SourceOrTarget[];
    removeSensorTarget: (junctionId: number, sensorId: number, deviceId: number) => Promise<void>;
    assignSensorTarget: (junctionId: number, sensorId: number, deviceId: number, screenId: number | null) => Promise<void>;
    setCurrentSensor: React.Dispatch<React.SetStateAction<any>>;
    setScreenSelectionModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
    showSnackbar: (message: string, severity?: "success" | "info" | "warning" | "error") => void;
    setSensorTargets: React.Dispatch<React.SetStateAction<SensorTargets>>;
    showSelectedOnly?: boolean;
    setShowSelectedOnly?: (checked: boolean) => void;
    junctionId: number;

    // New props for junction-level settings
    allDataAllTargets?: boolean;
    allTargetsAllScreens?: boolean;
    onAllDataAllTargetsChange?: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
    onAllTargetsAllScreensChange?: (enabled: boolean) => Promise<void>;

    // Props for customization
    hideTargetsColumn?: boolean;
    hideSelectionColumn?: boolean;
    hideSourceColumn?: boolean;
    hideEditColumn?: boolean;
    customTitle?: string;
    customIcon?: React.ReactNode;
    customActions?: (sensor: Sensor) => React.ReactNode;
    readOnly?: boolean;
    showLastUpdated?: boolean;
    sensorsPerPageOverride?: number;
    hidePagination?: boolean;
    hideFilters?: boolean;
    hideJunctionSettings?: boolean;
    appVersion?: string; // Application version for localStorage keys
    additionalColumns?: {
        header: string;
        field: string;
        render: (sensor: Sensor) => React.ReactNode;
        width?: string;
    }[];
    localStorageKey?: string;
    defaultVisibleColumns?: string[];

    // New props for All Targets All Screens functionality
    deviceScreensMap?: { [deviceId: number]: any[] };
    onScreenAssignmentUpdate?: (sensorId: number, deviceId: number, screenIds: number[]) => Promise<void>;

    // Collector filter (only shown on junction pages)
    sources?: SourceOrTarget[];

    // Rive inputs for binding status
    riveInputs?: any[];

    // All mapped sensor tags (from both Rive elements and frame sensor tags)
    mappedSensorTags?: string[];
}

// Storage keys
const STORAGE_KEY_DEFAULT = "sensors_table_visible_columns";
const STORAGE_KEY_VIEW_MODE = "sensors_table_view_mode";

// Edit Modal Component
const SensorEditModal: React.FC<{
    open: boolean;
    onClose: () => void;
    sensor: Sensor | null;
    onSave: (updatedSensor: Sensor) => Promise<void>;
}> = ({ open, onClose, sensor, onSave }) => {
    const theme = useTheme();
    const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
    const [editedSensor, setEditedSensor] = useState<Sensor | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (sensor) {
            setEditedSensor({ ...sensor });
        }
    }, [sensor]);

    const handleSave = async () => {
        if (!editedSensor) return;

        setSaving(true);
        try {
            await onSave(editedSensor);
            onClose();
        } catch (error) {
            console.error('Error saving sensor:', error);
        } finally {
            setSaving(false);
        }
    };

    const handleFieldChange = (field: string, value: any) => {
        if (!editedSensor) return;
        setEditedSensor({ ...editedSensor, [field]: value });
    };

    const handleNumberFieldChange = (field: string, value: string) => {
        if (!editedSensor) return;

        // Allow empty string (user clearing the field)
        if (value === '') {
            setEditedSensor({ ...editedSensor, [field]: 0 });
            return;
        }

        // Parse the number and handle the case where user enters '0'
        const numValue = Number(value);
        if (!isNaN(numValue)) {
            // For decimalPlaces field, prevent negative values
            if (field === 'decimalPlaces' && numValue < 0) {
                setEditedSensor({ ...editedSensor, [field]: 0 });
                return;
            }
            setEditedSensor({ ...editedSensor, [field]: numValue });
        }
    };

    if (!editedSensor) return null;

    // Define editable fields (exclude Id, ExternalId, Value)
    const editableFields = [
        { field: 'name', label: 'Name', type: 'text' },
        { field: 'sensorTag', label: 'Sensor Tag', type: 'text' },
        { field: 'componentName', label: 'Component Name', type: 'text' },
        { field: 'sensorType', label: 'Sensor Type', type: 'text' },
        { field: 'category', label: 'Category', type: 'text' },
        { field: 'unit', label: 'Unit', type: 'text' },
        { field: 'decimalPlaces', label: 'Decimal Places', type: 'number' },
        { field: 'formula', label: 'Formula', type: 'text' },
        { field: 'mqttTopic', label: 'MQTT Topic', type: 'text' },
        { field: 'mqttQoS', label: 'MQTT QoS', type: 'number' },
        { field: 'customAttribute1', label: 'Custom Attribute 1', type: 'text' },
        { field: 'customAttribute2', label: 'Custom Attribute 2', type: 'text' },
        { field: 'customAttribute3', label: 'Custom Attribute 3', type: 'text' },
        { field: 'customAttribute4', label: 'Custom Attribute 4', type: 'text' },
        { field: 'customAttribute5', label: 'Custom Attribute 5', type: 'text' },
        { field: 'customAttribute6', label: 'Custom Attribute 6', type: 'text' },
        { field: 'customAttribute7', label: 'Custom Attribute 7', type: 'text' },
        { field: 'customAttribute8', label: 'Custom Attribute 8', type: 'text' },
        { field: 'customAttribute9', label: 'Custom Attribute 9', type: 'text' },
        { field: 'customAttribute10', label: 'Custom Attribute 10', type: 'text' },
    ];

    return (
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
            <DialogTitle>Edit Sensor: {editedSensor.name}</DialogTitle>
            <DialogContent>
                <Box sx={{ mt: 1 }}>
                    <Grid container spacing={2}>
                        {editableFields.map(({ field, label, type }) => (
                            <Grid item xs={12} md={isDesktop ? 6 : 12} key={field}>
                                <TextField
                                    label={label}
                                    type={type}
                                    value={editedSensor[field] !== undefined ? editedSensor[field] : ''}
                                    onChange={(e) => {
                                        if (type === 'number') {
                                            handleNumberFieldChange(field, e.target.value);
                                        } else {
                                            handleFieldChange(field, e.target.value);
                                        }
                                    }}
                                    size="small"
                                    fullWidth
                                    inputProps={type === 'number' ? { min: 0 } : undefined}
                                />
                            </Grid>
                        ))}
                    </Grid>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={saving}>
                    Cancel
                </Button>
                <Button
                    onClick={handleSave}
                    variant="contained"
                    disabled={saving}
                    startIcon={saving ? <SensorsIcon /> : <SaveIcon />}
                >
                    {saving ? 'Saving...' : 'Save'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

// Sensor Card Component for mobile/tile views
const SensorCard = memo(({
    sensor,
    viewMode,
    onEdit,
    onSelect,
    getSensorOrder,
    getSensorTag,
    hideEditColumn,
    hideSelectionColumn,
}: {
    sensor: Sensor;
    viewMode: 'standard' | 'mini';
    onEdit: (sensor: Sensor) => void;
    onSelect: (sensorId: number) => void;
    getSensorOrder: (sensor: Sensor) => number;
    getSensorTag: (sensor: Sensor) => string;
    hideEditColumn: boolean;
    hideSelectionColumn: boolean;
}) => {
    const getCardHeight = () => {
        return viewMode === 'mini' ? 120 : 200;
    };

    const statusColor = sensor.IsSelected ? 'success' : 'default';

    return (
        <Card
            variant="outlined"
            sx={{
                position: 'relative',
                minHeight: getCardHeight(),
                display: 'flex',
                flexDirection: 'column',
                transition: 'all 0.2s ease-in-out',
                border: '1px solid',
                borderColor: statusColor === 'success' ? 'success.main' : 'divider',
                '&:hover': {
                    boxShadow: 4,
                    transform: 'translateY(-1px)',
                },
            }}
        >
            {/* Selection Badge */}
            {!hideSelectionColumn && (
                <Box
                    sx={{
                        position: 'absolute',
                        top: viewMode === 'mini' ? 4 : 8,
                        right: viewMode === 'mini' ? 4 : 8,
                        zIndex: 1
                    }}
                >
                    <Checkbox
                        checked={sensor.IsSelected}
                        onChange={() => onSelect(sensor.Id)}
                        size="small"
                        sx={{
                            backgroundColor: 'background.paper',
                            borderRadius: 1,
                            '&:hover': { backgroundColor: 'action.hover' }
                        }}
                    />
                </Box>
            )}

            <CardContent sx={{
                flex: 1,
                pt: viewMode === 'mini' ? 2.5 : 3,
                p: viewMode === 'mini' ? 1 : 2
            }}>
                {/* Sensor Name */}
                <Typography
                    variant={viewMode === 'mini' ? 'body2' : 'h6'}
                    sx={{
                        fontSize: viewMode === 'mini' ? '0.75rem' : { xs: '1rem', sm: '1.1rem' },
                        fontWeight: 600,
                        lineHeight: viewMode === 'mini' ? 1.2 : 1.5,
                        mb: viewMode === 'mini' ? 0.5 : 1,
                    }}
                    noWrap
                >
                    {sensor.name}
                </Typography>

                {/* Sensor Details */}
                {viewMode === 'standard' && (
                    <>
                        <Divider sx={{ mb: 1 }} />
                        <Box sx={{ mb: 1 }}>
                            <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                <strong>Tag:</strong> {getSensorTag(sensor) || '�'}
                            </Typography>
                            <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                <strong>Component:</strong> {sensor.componentName || '�'}
                            </Typography>
                            <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                <strong>Value:</strong> {sensor.value !== undefined ? sensor.value : '�'}
                            </Typography>
                        </Box>
                    </>
                )}

                {/* Unit and Value Chips */}
                <Box sx={{
                    display: 'flex',
                    gap: 0.5,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    mt: 'auto'
                }}>
                    <Chip
                        label={`${sensor.value !== undefined ? sensor.value : '�'} ${sensor.unit || ''}`}
                        size="small"
                        sx={{
                            fontSize: viewMode === 'mini' ? '0.6rem' : '0.7rem',
                            height: viewMode === 'mini' ? 18 : 22
                        }}
                    />
                    {viewMode === 'mini' && sensor.unit && (
                        <Chip
                            label={sensor.unit}
                            size="small"
                            variant="outlined"
                            sx={{
                                fontSize: '0.6rem',
                                height: 18
                            }}
                        />
                    )}
                </Box>

                {/* Edit Button for standard view */}
                {viewMode === 'standard' && !hideEditColumn && (
                    <Box sx={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        mt: 1,
                        gap: 1
                    }}>
                        <Tooltip title="Edit Sensor">
                            <IconButton
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit(sensor);
                                }}
                            >
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                )}
            </CardContent>
        </Card>
    );
});

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
const Junction_EnhancedSensorSelector: React.FC<Junction_EnhancedSensorSelectorProps> = ({
    availableSensors,
    handleSensorSelect,
    handleSensorOrderChange,
    handleSensorTagChange,
    handleSensorUpdate,
    getSensorOrder,
    getSensorTag,
    sensorTargets,
    targets,
    removeSensorTarget,
    assignSensorTarget,
    setCurrentSensor,
    setScreenSelectionModalOpen,
    showSnackbar,
    setSensorTargets,
    showSelectedOnly = false,
    setShowSelectedOnly,
    junctionId,
    allDataAllTargets = false,
    allTargetsAllScreens = false,
    onAllDataAllTargetsChange,
    onAllTargetsAllScreensChange,
    // Props with defaults
    hideTargetsColumn = false,
    hideSelectionColumn = false,
    hideSourceColumn = false,
    hideEditColumn = false,
    customTitle,
    customIcon,
    customActions,
    readOnly = false,
    showLastUpdated = false,
    sensorsPerPageOverride,
    hidePagination = false,
    hideFilters = false,
    hideJunctionSettings = false,
    appVersion,
    additionalColumns = [],
    localStorageKey = STORAGE_KEY_DEFAULT,
    defaultVisibleColumns,
    deviceScreensMap,
    onScreenAssignmentUpdate,
    sources,
    riveInputs = [],
    mappedSensorTags = []
}) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const headerStyle = {
        padding: '8px 16px',
        borderBottom: `2px solid ${theme.palette.divider}`,
        fontWeight: 'bold',
        backgroundColor: theme.palette.action.hover
    };

    // State for search and filters
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [selectedUnit, setSelectedUnit] = useState<string>('');
    const [selectedCollector, setSelectedCollector] = useState<string>('');

    // State for pagination (load from localStorage if appVersion available)
    const [page, setPage] = useState<number>(1);
    const [sensorsPerPage, setSensorsPerPage] = useState<number>(() => {
        if (sensorsPerPageOverride) return sensorsPerPageOverride;
        if (!appVersion) return 10;
        try {
            const key = `${appVersion}_sensorsPerPage`;
            const stored = localStorage.getItem(key);
            return stored ? parseInt(stored, 10) : 10;
        } catch (error) {
            console.error("Error loading sensorsPerPage from localStorage:", error);
            return 10;
        }
    });

    // View mode state (load from localStorage if appVersion available)
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        if (!appVersion) return 'table';
        try {
            const key = `${appVersion}_${localStorageKey}_view_mode`;
            const stored = localStorage.getItem(key);
            return (stored as ViewMode) || 'table';
        } catch (error) {
            console.error("Error loading viewMode from localStorage:", error);
            return 'table';
        }
    });

    // Derived state for filtering and pagination
    const [sensorsLoaded, setSensorsLoaded] = useState(false);
    const [filteredSensors, setFilteredSensors] = useState<Sensor[]>([]);

    // Edit modal state
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [currentEditSensor, setCurrentEditSensor] = useState<Sensor | null>(null);

    // Define all possible columns
    const allColumns: SensorColumn[] = useMemo(() => {
        const standardColumns: SensorColumn[] = [
            // Core display columns
            { field: "selection", label: "Select", width: "80px", required: true },
            { field: "edit", label: "Edit", width: "80px", required: false },
            { field: "order", label: "Order", width: "100px", required: false },
            { field: "source", label: "Source", required: false },
            { field: "collector", label: "Collector", required: false },
            { field: "name", label: "Sensor Name", required: true },
            { field: "sensorTag", label: "Sensor Tag", required: false },
            { field: "binding", label: "Binding", width: "90px", required: false },
            { field: "value", label: "Value", required: true },
            { field: "unit", label: "Unit", required: true },
            { field: "decimalPlaces", label: "Decimal Places", required: true },
            { field: "lastUpdated", label: "Last Updated", required: false },
            { field: "targets", label: "Targets", required: false, align: "left", width: "200px" },
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
            if (col.field === "edit" && hideEditColumn) return false;
            if (col.field === "order" && readOnly) return false;
            if (col.field === "source" && hideSourceColumn) return false;
            if (col.field === "lastUpdated" && !showLastUpdated) return false;
            if (col.field === "targets" && hideTargetsColumn) return false;
            if (col.field === "actions" && !customActions) return false;
            return true;
        });
    }, [allColumns, hideSelectionColumn, hideEditColumn, readOnly, hideSourceColumn, showLastUpdated, hideTargetsColumn, customActions]);

    // Mandatory columns - always visible in this exact order
    const mandatoryColumns = useMemo(() => {
        const cols = ['selection', 'edit', 'order', 'collector', 'name', 'sensorTag', 'binding', 'value', 'unit', 'decimalPlaces', 'targets'];
        // Filter to only include columns that exist in availableColumns
        return cols.filter(field => availableColumns.some(col => col.field === field));
    }, [availableColumns]);

    // State for extra fields to show in expandable row
    const [extraFields, setExtraFields] = useState<string[]>(() => {
        if (appVersion) {
            try {
                const key = `${appVersion}_${localStorageKey}_extraFields`;
                const stored = localStorage.getItem(key);
                if (stored) {
                    return JSON.parse(stored);
                }
            } catch (e) {
                console.error("Error loading extra fields:", e);
            }
        }
        return [];
    });

    // Popover state for column selector
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    // Function to move extra field order
    const moveExtraField = useCallback((field: string, direction: 'up' | 'down') => {
        setExtraFields(prev => {
            const index = prev.indexOf(field);
            if (index === -1) return prev;

            const newIndex = direction === 'up' ? index - 1 : index + 1;
            if (newIndex < 0 || newIndex >= prev.length) return prev;

            const newFields = [...prev];
            [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
            return newFields;
        });
    }, []);

    // Persist view mode with version prefix
    useEffect(() => {
        if (!appVersion) return;
        try {
            const key = `${appVersion}_${localStorageKey}_view_mode`;
            localStorage.setItem(key, viewMode);
        } catch (error) {
            console.error("Error saving view mode to localStorage:", error);
        }
    }, [viewMode, localStorageKey, appVersion]);

    // Save extra fields to localStorage with version prefix
    useEffect(() => {
        if (!appVersion) return;
        try {
            const key = `${appVersion}_${localStorageKey}_extraFields`;
            localStorage.setItem(key, JSON.stringify(extraFields));
        } catch (error) {
            console.error("Error saving extra fields to localStorage:", error);
        }
    }, [extraFields, localStorageKey, appVersion]);

    // Save sensorsPerPage to localStorage (global, not junction-specific) with version prefix
    useEffect(() => {
        if (!appVersion || sensorsPerPageOverride) return; // Don't save if overridden
        try {
            const key = `${appVersion}_sensorsPerPage`;
            localStorage.setItem(key, sensorsPerPage.toString());
        } catch (error) {
            console.error("Error saving sensorsPerPage to localStorage:", error);
        }
    }, [sensorsPerPage, appVersion, sensorsPerPageOverride]);

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

    // Get available collectors from sources (only collectors, not devices)
    const availableCollectors = useMemo(() => {
        if (!sources || sources.length === 0) return [];
        return sources
            .filter(source => source.type === "collector")
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [sources]);

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

    // Handle collector filter changes
    const handleCollectorFilterChange = (event: SelectChangeEvent<string>) => {
        setSelectedCollector(event.target.value);
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


    // View mode change handler
    const handleViewModeChange = useCallback((event: React.MouseEvent<HTMLElement>, newViewMode: ViewMode) => {
        if (newViewMode !== null) {
            setViewMode(newViewMode);
        }
    }, []);

    // Column selector popover handlers
    const openColumnSelector = (event: MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const closeColumnSelector = () => {
        setAnchorEl(null);
    };

    // Edit sensor handlers
    const handleEditSensor = (sensor: Sensor) => {
        setCurrentEditSensor(sensor);
        setEditModalOpen(true);
    };

    const handleSaveEditedSensor = async (updatedSensor: Sensor) => {
        try {
            const response = await fetch(`/api/sensors/junction-sensors/update`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updatedSensor),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to update sensor: ${response.status} ${errorText}`);
            }

            // Update the local state immediately after successful save
            if (handleSensorUpdate) {
                handleSensorUpdate(updatedSensor);
            }

            showSnackbar("Sensor updated successfully", "success");
        } catch (error) {
            console.error("Error saving sensor:", error);
            showSnackbar("Failed to save sensor", "error");
        }
    };
    
    const handleAllTargetsAllScreensToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.checked;

        if (onAllTargetsAllScreensChange) {
            try {
                await onAllTargetsAllScreensChange(newValue);
                showSnackbar(
                    newValue
                        ? "All Targets All Screens enabled - selected sensors will be assigned to all screens"
                        : "All Targets All Screens disabled",
                    "success"
                );
            } catch (error) {
                showSnackbar("Failed to update All Targets All Screens setting", "error");
            }
        }
    };

    // Filter sensors based on search query, unit filter, collector filter, and selection status
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

            // Apply collector filter (match by collector ID)
            const matchesCollectorFilter = !selectedCollector ||
                (sensor.collectorId && sensor.collectorId.toString() === selectedCollector);

            // Apply selected only filter
            const matchesSelectedFilter = !showSelectedOnly || sensor.IsSelected;

            return matchesSearchQuery && matchesUnitFilter && matchesCollectorFilter && matchesSelectedFilter;
        });

        setFilteredSensors(filtered);
    }, [searchQuery, selectedUnit, selectedCollector, showSelectedOnly, availableSensors]);

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
        setSelectedCollector('');
        // Only reset the showSelectedOnly if there are selected sensors
        if (setShowSelectedOnly && selectedSensorsCount > 0) {
            setShowSelectedOnly(false);
        }
        setPage(1);
    };

    // Format relative time (helper function)
    const formatRelativeTime = (isoTime?: string) => {
        if (!isoTime) return '�';

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
        if (value === undefined || value === null) return '�';
        return value ? 'Yes' : 'No';
    };

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
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Checkbox
                            checked={sensor.IsSelected}
                            onChange={() => handleSensorSelect(sensor.Id)}
                            size="small"
                        />
                    </Box>
                );
            case "edit":
                return (
                    <Tooltip title="Edit Sensor">
                        <IconButton
                            size="small"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleEditSensor(sensor);
                            }}
                        >
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                );
            case "order":
                return (
                    <TextField
                        size="small"
                        value={getSensorOrder(sensor) || ''}
                        onChange={(e) => {
                            const value = e.target.value;
                            if (value === '') {
                                handleSensorOrderChange(sensor, 0);
                            } else {
                                const numValue = parseInt(value, 10);
                                if (!isNaN(numValue)) {
                                    handleSensorOrderChange(sensor, numValue);
                                }
                            }
                        }}
                        type="number"
                        placeholder="Order"
                        sx={{ width: "80px" }}
                        variant="outlined"
                        InputProps={{
                            inputProps: { min: 0 }
                        }}
                    />
                );
            case "source":
                return sensor.deviceName;
            case "collector": {
                // Find the collector name from sources by matching collectorId
                if (!sensor.collectorId || !sources) return '—';
                const collector = sources.find(s => s.type === "collector" && s.id === sensor.collectorId);
                return collector ? collector.name : '—';
            }
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
            case "binding": {
                // Check if sensor tag is successfully mapped to a FrameEngine binding or sensor tag
                const sensorTag = getSensorTag(sensor);
                if (!sensorTag) return null;

                // Split sensor tags by comma and trim (sensors can have multiple tags)
                const sensorTags = sensorTag.split(',').map((tag: string) => tag.trim()).filter(Boolean);

                // Check if any of this sensor's tags are in the mapped sensor tags list
                // This list includes:
                // 1. Machine inputs and template bindings (from riveInputs)
                // 2. Frame element sensor tags (sensor/ecg elements with sensorTag property)
                const hasBinding = mappedSensorTags && mappedSensorTags.length > 0 &&
                    sensorTags.some(tag => mappedSensorTags.includes(tag));

                if (!hasBinding) return null;

                return (
                    <Tooltip title="Mapped to FrameEngine input/binding">
                        <Chip
                            icon={<LinkIcon />}
                            label=""
                            size="small"
                            color="success"
                            variant="outlined"
                            sx={{ minWidth: '36px', '& .MuiChip-label': { px: 0.5 } }}
                        />
                    </Tooltip>
                );
            }
            case "value":
                return sensor.value !== undefined ? sensor.value : '�';
            case "unit":
                return sensor.unit ? (
                    <Chip
                        label={sensor.unit}
                        size="small"
                        variant="outlined"
                        color={selectedUnit === sensor.unit ? "primary" : "default"}
                    />
                ) : '�';
            case "decimalPlaces":
                return readOnly ? (
                    <Typography>{sensor.decimalPlaces}</Typography>
                ) : (
                    <TextField
                        size="small"
                        value={sensor.decimalPlaces !== undefined ? sensor.decimalPlaces : ''}
                        onChange={async (e) => {
                            const value = e.target.value;
                            let numValue = 0;
                            if (value !== '') {
                                numValue = parseInt(value, 10);
                                if (isNaN(numValue) || numValue < 0) {
                                    return;
                                }
                            }

                            try {
                                const updatedSensor = {
                                    ...sensor,
                                    decimalPlaces: value === '' ? 0 : numValue
                                };

                                const response = await fetch(`/api/sensors/junction-sensors/update`, {
                                    method: 'PUT',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify(updatedSensor),
                                });

                                if (!response.ok) {
                                    throw new Error(`Failed to update decimal places: ${response.status}`);
                                }

                                // Update the local state immediately after successful save
                                if (handleSensorUpdate) {
                                    handleSensorUpdate(updatedSensor);
                                }

                                showSnackbar("Decimal places updated successfully", "success");
                            } catch (error) {
                                console.error('Error updating decimal places:', error);
                                showSnackbar('Failed to update decimal places', 'error');
                            }
                        }}
                        type="number"
                        placeholder="0"
                        sx={{ width: "80px" }}
                        variant="outlined"
                        InputProps={{
                            inputProps: { min: 0 }
                        }}
                    />
                );
            case "lastUpdated":
                return formatRelativeTime(sensor.lastUpdated);
            case "targets": {
                const assignedTargets = sensorTargets[sensor.Id] || [];
                const totalDevices = assignedTargets.length;
                const totalScreens = assignedTargets.reduce((sum, t) => sum + (t.screenIds?.length || 0), 0);

                if (totalDevices === 0) {
                    return (
                        <Button
                            size="small"
                            variant="outlined"
                            disabled={allDataAllTargets && allTargetsAllScreens}
                            onClick={() => {
                                setCurrentSensor(sensor);
                                setScreenSelectionModalOpen(true);
                            }}
                        >
                            Screen Assignment
                        </Button>
                    );
                }

                return (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Typography variant="body2">
                            {totalDevices} {totalDevices === 1 ? 'Device' : 'Devices'}
                            {totalScreens > 0 && ` • ${totalScreens} ${totalScreens === 1 ? 'Screen' : 'Screens'}`}
                        </Typography>
                        <Button
                            size="small"
                            variant="outlined"
                            disabled={allDataAllTargets && allTargetsAllScreens}
                            onClick={() => {
                                setCurrentSensor(sensor);
                                setScreenSelectionModalOpen(true);
                            }}
                        >
                            Edit Assignments
                        </Button>
                    </Box>
                );
            }
            case "actions":
                return customActions ? customActions(sensor) : null;
            case "id":
                return sensor.Id;
            case "sensorType":
                return sensor.sensorType || '�';
            case "externalId":
                return sensor.externalId || '�';
            case "componentName":
                return sensor.componentName || '�';
            case "category":
                return sensor.category || '�';
            case "formula":
                return sensor.formula || '�';
            case "isMissing":
                return formatBoolean(sensor.isMissing);
            case "isStale":
                return formatBoolean(sensor.isStale);
            case "isVisible":
                return formatBoolean(sensor.isVisible);
            case "junctionId":
                return sensor.junctionId || '�';
            case "deviceId":
                return sensor.deviceId || '�';
            case "collectorId":
                return sensor.collectorId || '�';
            case "serviceId":
                return sensor.serviceId || '�';
            case "mqttTopic":
                return sensor.mqttTopic || '�';
            case "mqttQoS":
                return sensor.mqttQoS !== undefined ? sensor.mqttQoS : '�';
            case "customAttribute1":
                return sensor.customAttribute1 || '�';
            case "customAttribute2":
                return sensor.customAttribute2 || '�';
            case "customAttribute3":
                return sensor.customAttribute3 || '�';
            case "customAttribute4":
                return sensor.customAttribute4 || '�';
            case "customAttribute5":
                return sensor.customAttribute5 || '�';
            case "customAttribute6":
                return sensor.customAttribute6 || '�';
            case "customAttribute7":
                return sensor.customAttribute7 || '�';
            case "customAttribute8":
                return sensor.customAttribute8 || '�';
            case "customAttribute9":
                return sensor.customAttribute9 || '�';
            case "customAttribute10":
                return sensor.customAttribute10 || '�';
            default:
                // Try to access the property dynamically
                return sensor[field] !== undefined ? sensor[field] : '�';
        }
    };

    return (
        <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
            {/* Table Header with Title and Controls */}
            <Box display="flex" alignItems="center" mb={2} flexWrap="wrap" gap={2}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
                    {customIcon || <SensorsIcon sx={{ mr: 1 }} />}
                    {customTitle || "Sensors Configuration"}
                </Typography>

                <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    {/* View Mode Toggle - Hide on mobile */}
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

                    {/* Extra Fields Button - Only show in table view */}
                    {viewMode === 'table' && (
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
                            Extra Fields {extraFields.length > 0 && `(${extraFields.length})`}
                        </Button>
                    )}

                    {/* Extra Fields Selector Popover */}
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
                        <List dense sx={{ width: 350, maxHeight: 500, overflow: 'auto' }}>
                            {/* Section title */}
                            <ListItem sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
                                <ListItemText
                                    primary="Extra Fields"
                                    secondary="Selected fields will automatically appear below each sensor"
                                    slotProps={{
                                        primary: { fontWeight: 'bold' },
                                        secondary: { variant: 'caption' }
                                    }}
                                />
                            </ListItem>

                            {/* Selected extra fields with ordering */}
                            {extraFields.length > 0 && (
                                <>
                                    <ListItem sx={{ backgroundColor: 'rgba(0, 0, 0, 0.02)', py: 0.5 }}>
                                        <ListItemText
                                            primary="Selected Fields"
                                            slotProps={{
                                                primary: { variant: 'caption', fontWeight: 'bold' }
                                            }}
                                        />
                                    </ListItem>
                                    {extraFields.map((field, index) => {
                                        const column = availableColumns.find(col => col.field === field);
                                        if (!column) return null;
                                        return (
                                            <ListItem key={field} sx={{ py: 0.5 }}>
                                                <Checkbox
                                                    checked={true}
                                                    onChange={() => {
                                                        setExtraFields(prev => prev.filter(f => f !== field));
                                                    }}
                                                    size="small"
                                                />
                                                <ListItemText primary={column.label} />
                                                <Box sx={{ display: 'flex', gap: 0.5 }}>
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => moveExtraField(field, 'up')}
                                                        disabled={index === 0}
                                                        sx={{ p: 0.5 }}
                                                    >
                                                        <ArrowUpwardIcon fontSize="small" />
                                                    </IconButton>
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => moveExtraField(field, 'down')}
                                                        disabled={index === extraFields.length - 1}
                                                        sx={{ p: 0.5 }}
                                                    >
                                                        <ArrowDownwardIcon fontSize="small" />
                                                    </IconButton>
                                                </Box>
                                            </ListItem>
                                        );
                                    })}
                                </>
                            )}

                            {/* Available extra fields to add */}
                            {availableColumns.filter(col => !mandatoryColumns.includes(col.field) && !extraFields.includes(col.field)).length > 0 && (
                                <>
                                    <ListItem sx={{ backgroundColor: 'rgba(0, 0, 0, 0.02)', py: 0.5, mt: extraFields.length > 0 ? 1 : 0 }}>
                                        <ListItemText
                                            primary="Available Fields"
                                            slotProps={{
                                                primary: { variant: 'caption', fontWeight: 'bold' }
                                            }}
                                        />
                                    </ListItem>
                                    {availableColumns
                                        .filter(col => !mandatoryColumns.includes(col.field) && !extraFields.includes(col.field))
                                        .map(({ field, label }) => (
                                            <ListItem key={field} sx={{ py: 0.5 }}>
                                                <Checkbox
                                                    checked={false}
                                                    onChange={() => {
                                                        setExtraFields(prev => [...prev, field]);
                                                    }}
                                                    size="small"
                                                />
                                                <ListItemText primary={label} />
                                            </ListItem>
                                        ))}
                                </>
                            )}
                        </List>
                    </Popover>
                </Box>
            </Box>

            {/* Enhanced Filter Section and Junction Settings - Only show if not hidden */}
            {!hideFilters && (
                <Box display="flex" flexDirection="column" gap={2} mb={2}>
                    {/* Filters Row */}
                    <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
                        {/* Left side: Search and Unit Filter */}
                        <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
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

                            {/* Collector Filter - only shown when sources prop is provided (junction context) */}
                            {availableCollectors.length > 0 && (
                                <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 250 } }}>
                                    <InputLabel
                                        id="collector-filter-label"
                                        sx={{ display: 'flex', alignItems: 'center' }}
                                    >
                                        <FilterListIcon fontSize="small" sx={{ mr: 0.5 }} />
                                        Filter by Collector
                                    </InputLabel>
                                    <Select
                                        labelId="collector-filter-label"
                                        value={selectedCollector}
                                        onChange={handleCollectorFilterChange}
                                        label="Filter by Collector"
                                    >
                                        <MenuItem value="">
                                            <em>All Collectors</em>
                                        </MenuItem>
                                        {availableCollectors.map((collector) => (
                                            <MenuItem key={collector.id} value={collector.id.toString()}>
                                                {collector.name}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            )}

                            {/* Clear filters button - only show when filters are active */}
                            {(searchQuery || selectedUnit || selectedCollector || showSelectedOnly) && (
                                <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={clearFilters}
                                >
                                    Clear Filters
                                </Button>
                            )}
                        </Box>

                        {/* Right side: Selection and Junction Settings */}
                        <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
                            {/* Show Selected Only Checkbox - Only if setShowSelectedOnly is provided */}
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
                    </Box>

                    {/* Junction Settings Row - Only show if not hidden and not on ConfigureCollector */}
                    {!hideJunctionSettings && (
                        <Box display="flex" alignItems="center" gap={3} flexWrap="wrap" sx={{
                            p: 2,
                            bgcolor: 'action.hover',
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: 'divider'
                        }}>
                            <Typography variant="subtitle2" fontWeight="medium">
                                Junction Settings:
                            </Typography>

                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={allDataAllTargets}
                                        onChange={onAllDataAllTargetsChange}
                                        size="small"
                                    />
                                }
                                label="All Data All Targets"
                            />

                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={allTargetsAllScreens}
                                        onChange={handleAllTargetsAllScreensToggle}
                                        size="small"
                                    />
                                }
                                label="All Targets All Screens"
                            />
                        </Box>
                    )}
                </Box>
            )}

            {/* Stats summary */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
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

            {/* Render content based on view mode */}
            {viewMode === 'table' ? (
                /* Table View with TableContainer to handle overflow */
                <>
                    <TableContainer component={Paper} variant="outlined" sx={{ mb: 2, maxWidth: '100%' }}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
                                    {mandatoryColumns.map((field) => {
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
                                            colSpan={mandatoryColumns.length}
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
                                        <React.Fragment key={sensor.Id}>
                                            <TableRow hover>
                                                {mandatoryColumns.map((field) => {
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
                                            {extraFields.length > 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={mandatoryColumns.length} sx={{ py: 1, backgroundColor: 'rgba(0, 0, 0, 0.02)' }}>
                                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, pl: 2 }}>
                                                            {extraFields.map((field) => {
                                                                const column = availableColumns.find(col => col.field === field);
                                                                if (!column) return null;
                                                                return (
                                                                    <Box key={`${sensor.Id}-extra-${field}`} sx={{ minWidth: 150 }}>
                                                                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>
                                                                            {column.label}:
                                                                        </Typography>
                                                                        <Typography variant="body2" sx={{ ml: 1, display: 'inline' }}>
                                                                            {renderCellContent(sensor, field)}
                                                                        </Typography>
                                                                    </Box>
                                                                );
                                                            })}
                                                        </Box>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </React.Fragment>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </>
            ) : (
                /* Tile Views */
                <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: getGridColumns(),
                    gap: viewMode === 'mini' ? 1 : 2,
                    mb: 2
                }}>
                    {paginatedSensors.length === 0 ? (
                        <Paper sx={{ p: 3, textAlign: 'center', gridColumn: '1 / -1' }}>
                            <Typography variant="body2" color="text.secondary">
                                No sensors found matching your criteria.
                            </Typography>
                        </Paper>
                    ) : (
                        paginatedSensors.map((sensor) => (
                            <SensorCard
                                key={sensor.Id}
                                sensor={sensor}
                                viewMode={viewMode as 'standard' | 'mini'}
                                onEdit={handleEditSensor}
                                onSelect={handleSensorSelect}
                                getSensorOrder={getSensorOrder}
                                getSensorTag={getSensorTag}
                                hideEditColumn={hideEditColumn}
                                hideSelectionColumn={hideSelectionColumn}
                            />
                        ))
                    )}
                </Box>
            )}

            {/* Pagination Controls - Only show if pagination is not hidden */}
            {!hidePagination && filteredSensors.length > 0 && (
                <Box display="flex" justifyContent="space-between" alignItems="center" mt={2} flexWrap="wrap" gap={2}>
                    <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="body2" color="text.secondary">
                            Rows per page:
                        </Typography>
                        <FormControl size="small" variant="outlined">
                            <Select
                                value={sensorsPerPage}
                                onChange={(e) => {
                                    setSensorsPerPage(Number(e.target.value));
                                    setPage(1); // Reset to first page when changing rows per page
                                }}
                                sx={{ minWidth: 80 }}
                            >
                                <MenuItem value={5}>5</MenuItem>
                                <MenuItem value={10}>10</MenuItem>
                                <MenuItem value={20}>20</MenuItem>
                                <MenuItem value={50}>50</MenuItem>
                                <MenuItem value={100}>100</MenuItem>
                            </Select>
                        </FormControl>
                        <Typography variant="body2" color="text.secondary">
                            {Math.min((page - 1) * sensorsPerPage + 1, filteredSensors.length)}-{Math.min(page * sensorsPerPage, filteredSensors.length)} of {filteredSensors.length}
                        </Typography>
                    </Box>
                    {totalPages > 1 && (
                        <Pagination
                            count={totalPages}
                            page={page}
                            onChange={handlePageChange}
                            color="primary"
                            showFirstButton
                            showLastButton
                            size={isMobile ? "small" : "medium"}
                        />
                    )}
                </Box>
            )}

            {/* Edit Sensor Modal */}
            <SensorEditModal
                open={editModalOpen}
                onClose={() => setEditModalOpen(false)}
                sensor={currentEditSensor}
                onSave={handleSaveEditedSensor}
            />
        </Paper>
    );
};

export default Junction_EnhancedSensorSelector;