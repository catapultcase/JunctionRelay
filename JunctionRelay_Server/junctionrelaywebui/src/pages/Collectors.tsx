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
    Button,
    Typography,
    Box,
    CircularProgress,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    Paper,
    Snackbar,
    Alert,
    IconButton,
    Popover,
    List,
    ListItem,
    ListItemText,
    Checkbox,
    ToggleButtonGroup,
    ToggleButton,
    Switch,
    FormControlLabel,
    MenuItem,
    Select,
    FormControl,
    InputLabel,
    Tooltip,
    Divider,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
// Icon imports
import AddIcon from '@mui/icons-material/Add';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import TableViewIcon from '@mui/icons-material/TableView';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SettingsIcon from '@mui/icons-material/Settings';
import BiotechIcon from '@mui/icons-material/Biotech';
import { useTheme, useMediaQuery } from "@mui/material";
import { usePageTitle } from '../hooks/usePageTitle';

// Import sub-components
import CollectorCard from '../components/Collectors_CollectorCard';
import CollectorTableRow from '../components/Collectors_CollectorTableRow';
import AddCollectorModal from '../components/Collectors_AddCollectorModal';
import CollectorsWarningsCard from '../components/Collectors_WarningsCard';

// Types
type ViewMode = 'table' | 'standard' | 'mini';
type SortDirection = 'asc' | 'desc';

interface CollectorColumn {
    field: string;
    label: string;
    align: "left" | "right" | "center" | "inherit" | "justify";
    sortable?: boolean;
}

// Storage keys
const STORAGE_KEY_COLLECTORS_COLUMNS = "collectors_visible_columns";
const STORAGE_KEY_COLLECTORS_SORT = "collectors_sort_state";
const STORAGE_KEY_COLLECTORS_VIEW_MODE = "junctionrelay_collectors_view_mode";

// Column definitions
const defaultCollectorColumns: CollectorColumn[] = [
    { field: "actions", label: "Actions", align: "right", sortable: false },
    { field: "name", label: "Collector Name", align: "left", sortable: true },
    { field: "type", label: "Type", align: "left", sortable: true },
    { field: "url", label: "URL", align: "left", sortable: true },
    { field: "accessToken", label: "Access Token", align: "left", sortable: false },
    { field: "securityStatus", label: "Security", align: "left", sortable: true },
    { field: "status", label: "Status", align: "left", sortable: true },
    { field: "lastTested", label: "Last Tested", align: "left", sortable: true },
];

// Default visible columns
const defaultVisibleColumns = ["name", "type", "url", "accessToken", "securityStatus", "status", "lastTested", "actions"];

// Frequency options for auto-testing (1 hour, then 6 hour increments up to 24hrs, then days)
const frequencyOptions = [
    { value: 1, label: '1 hour' },
    { value: 6, label: '6 hours' },
    { value: 12, label: '12 hours' },
    { value: 18, label: '18 hours' },
    { value: 24, label: '24 hours' },
    { value: 72, label: '3 days' },
    { value: 168, label: '7 days' },
];

// Main Collectors Component
const Collectors = () => {
    usePageTitle('Collectors');

    const [collectors, setCollectors] = useState<any[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [addCollectorModalOpen, setAddCollectorModalOpen] = useState(false);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "info" | "warning" | "error">("success");

    // Auto-testing configuration state
    const [autoTestingEnabled, setAutoTestingEnabled] = useState<boolean>(false);
    const [testingFrequency, setTestingFrequency] = useState<number>(6);
    const [loadingTestingSettings, setLoadingTestingSettings] = useState<boolean>(false);

    // View mode and table management state
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_COLLECTORS_VIEW_MODE);
        return (stored as ViewMode) || 'table';
    });

    const [visibleCols, setVisibleCols] = useState<string[]>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_COLLECTORS_COLUMNS);
        return stored ? JSON.parse(stored) : defaultVisibleColumns;
    });

    const [sortState, setSortState] = useState<{ orderBy: string, order: SortDirection }>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_COLLECTORS_SORT);
            return stored ? JSON.parse(stored) : { orderBy: 'name', order: 'asc' };
        } catch (e) {
            return { orderBy: 'name', order: 'asc' };
        }
    });

    // Popover anchor for column management
    const [anchorCols, setAnchorCols] = useState<HTMLElement | null>(null);

    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Persist states
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_COLLECTORS_VIEW_MODE, viewMode);
    }, [viewMode]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_COLLECTORS_COLUMNS, JSON.stringify(visibleCols));
    }, [visibleCols]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_COLLECTORS_SORT, JSON.stringify(sortState));
    }, [sortState]);

    // Show snackbar with configurable severity
    const showSnackbar = (message: string, severity: "success" | "info" | "warning" | "error" = "success") => {
        setSnackMessage(message);
        setSnackbarSeverity(severity);
    };

    // Fetch auto-testing settings
    const fetchAutoTestingSettings = useCallback(async () => {
        try {
            const response = await fetch('/api/settings/collector-testing');
            if (response.ok) {
                const settings = await response.json();
                setAutoTestingEnabled(settings.enabled || false);
                setTestingFrequency(settings.frequency || 6);
            }
        } catch (error) {
            console.error('Error fetching auto-testing settings:', error);
        }
    }, []);

    // Update auto-testing setting
    const updateAutoTestingSetting = useCallback(async (key: string, value: boolean | number) => {
        setLoadingTestingSettings(true);
        try {
            const response = await fetch('/api/settings/collector-testing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [key]: value })
            });

            if (response.ok) {
                let message = '';
                if (key === 'enabled') {
                    message = `Collector auto-testing ${value ? 'enabled' : 'disabled'}`;
                } else if (key === 'frequency') {
                    const freqOption = frequencyOptions.find(opt => opt.value === value);
                    message = `Testing frequency set to ${freqOption?.label || value + ' days'}`;
                }
                showSnackbar(message, "info");
            } else {
                const error = await response.json();
                showSnackbar(`Failed to update setting: ${error.message}`, "error");

                // Revert the local state on error
                if (key === 'enabled') {
                    setAutoTestingEnabled(!value as boolean);
                } else if (key === 'frequency') {
                    await fetchAutoTestingSettings();
                }
            }
        } catch (error) {
            console.error('Error updating auto-testing setting:', error);
            showSnackbar('Error updating auto-testing setting', "error");

            // Revert the local state on error
            if (key === 'enabled') {
                setAutoTestingEnabled(!value as boolean);
            } else if (key === 'frequency') {
                await fetchAutoTestingSettings();
            }
        } finally {
            setLoadingTestingSettings(false);
        }
    }, [showSnackbar, fetchAutoTestingSettings]);

    // Auto-testing setting change handlers
    const handleAutoTestingToggle = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = event.target.checked;
        setAutoTestingEnabled(newValue);
        await updateAutoTestingSetting('enabled', newValue);
    }, [updateAutoTestingSetting]);

    const handleFrequencyChange = useCallback(async (event: any) => {
        const newValue = event.target.value as number;
        setTestingFrequency(newValue);
        await updateAutoTestingSetting('frequency', newValue);
    }, [updateAutoTestingSetting]);

    const fetchCollectors = async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/collectors");
            if (!response.ok) {
                throw new Error("Failed to fetch collectors");
            }
            const data = await response.json();
            setCollectors(data);
        } catch (err: any) {
            showSnackbar("Error fetching collectors", "error");
            console.error("Error fetching collectors:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const init = async () => {
            await Promise.all([
                fetchCollectors(),
                fetchAutoTestingSettings()
            ]);
        };
        init();
    }, [fetchAutoTestingSettings]);

    // Listen for view mode changes from bottom action bar (mobile only) 
    useEffect(() => {
        const handleBottomActionViewModeChange = (e: CustomEvent) => {
            // Only respond to bottom action bar changes when in mobile mode
            if (isMobile && e.detail.mode) {
                const newMode = e.detail.mode as ViewMode;
                setViewMode(newMode);
                localStorage.setItem(STORAGE_KEY_COLLECTORS_VIEW_MODE, newMode);
            }
        };

        // Listen for localStorage changes from other tabs/windows
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY_COLLECTORS_VIEW_MODE && e.newValue) {
                const newMode = e.newValue as ViewMode;
                setViewMode(newMode);
            }
        };

        // Only listen for bottom action events on mobile
        if (isMobile) {
            window.addEventListener('bottom-action-view-mode-change', handleBottomActionViewModeChange as EventListener);
        }

        window.addEventListener('storage', handleStorageChange);

        return () => {
            if (isMobile) {
                window.removeEventListener('bottom-action-view-mode-change', handleBottomActionViewModeChange as EventListener);
            }
            window.removeEventListener('storage', handleStorageChange);
        };
    }, [isMobile]);

    // Listen for bottom action bar events
    useEffect(() => {
        const handleAddCollector = () => {
            console.log('Bottom bar: Add collector requested');
            setAddCollectorModalOpen(true);
        };

        // Add event listener for bottom action bar
        window.addEventListener('bottom-action-add-collector', handleAddCollector);

        // Cleanup
        return () => {
            window.removeEventListener('bottom-action-add-collector', handleAddCollector);
        };
    }, []);

    // Sort collectors
    const sortedCollectors = useMemo(() => {
        const { orderBy, order } = sortState;
        return [...collectors].sort((a, b) => {
            let valueA: any;
            let valueB: any;

            switch (orderBy) {
                case 'name':
                    valueA = a.name?.toLowerCase() || '';
                    valueB = b.name?.toLowerCase() || '';
                    break;
                case 'type':
                    valueA = a.collectorType?.toLowerCase() || '';
                    valueB = b.collectorType?.toLowerCase() || '';
                    break;
                case 'url':
                    valueA = a.url?.toLowerCase() || '';
                    valueB = b.url?.toLowerCase() || '';
                    break;
                case 'status':
                    valueA = a.status?.toLowerCase() || '';
                    valueB = b.status?.toLowerCase() || '';
                    break;
                default:
                    valueA = a[orderBy] || '';
                    valueB = b[orderBy] || '';
            }

            if (valueA < valueB) {
                return order === 'asc' ? -1 : 1;
            }
            if (valueA > valueB) {
                return order === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }, [collectors, sortState]);

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

    // Helper function to check if collector is EventEngine (managed by event system)
    const isFrameEngine = (collector: any) => {
        return collector.collectorType === 'EventEngine';
    };

    // Event handlers
    const handleAddCollector = () => {
        setAddCollectorModalOpen(true);
    };

    const handleTestAllCollectors = async () => {
        try {
            // Don't use setLoading - it hides the collectors table
            // Backend sends progress notifications for each collector

            const response = await fetch('/api/collectors/test-all', {
                method: 'POST',
            });

            if (response.ok) {
                // Refresh collectors to show updated statuses
                await fetchCollectors();
            } else {
                const error = await response.json();
                showSnackbar(`Failed to test collectors: ${error.message}`, 'error');
            }
        } catch (error) {
            console.error('Error testing collectors:', error);
            showSnackbar('Error testing collectors', 'error');
        }
    };

    const handleCollectorAdded = () => {
        fetchCollectors();
        showSnackbar("Collector added successfully", "success");
    };

    const handleCollectorAddedAndConfigure = (collectorId: number) => {
        showSnackbar("Collector added successfully. Redirecting to configuration...", "success");
        navigate(`/configure-collector/${collectorId}`);
    };

    // Test collector handler
    const handleTestCollector = async (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        try {
            // Backend sends progress notifications, so no need for frontend snackbar
            const response = await fetch(`/api/collectors/${id}/test`, {
                method: 'POST',
            });

            if (response.ok) {
                // Refresh collectors to show updated status
                await fetchCollectors();
            } else {
                const error = await response.json();
                showSnackbar(`Test failed: ${error.message}`, 'error');
            }
        } catch (error) {
            console.error('Error testing collector:', error);
            showSnackbar('Error testing collector', 'error');
        }
    };

    // Modified delete handler - prevent deletion of FrameEngine collectors
    const handleDelete = async (e: React.MouseEvent, collectorId: number) => {
        e.stopPropagation();

        // Find the collector to check its type
        const collector = collectors.find(c => c.id === collectorId);
        if (isFrameEngine(collector)) {
            // Don't allow deletion of FrameEngine collectors
            return;
        }

        if (window.confirm("Are you sure you want to delete this collector?")) {
            try {
                const response = await fetch(`/api/collectors/${collectorId}`, {
                    method: "DELETE"
                });

                if (response.ok) {
                    showSnackbar("Collector deleted successfully", "success");
                    fetchCollectors();
                } else {
                    throw new Error("Failed to delete collector");
                }
            } catch (err: unknown) {
                showSnackbar("Error deleting collector", "error");
            }
        }
    };

    // Modified edit handler - redirect FrameEngine collectors to /eventengine
    const handleEdit = (e: React.MouseEvent, collector: any) => {
        e.stopPropagation();

        if (isFrameEngine(collector)) {
            // Redirect FrameEngine collectors to /eventengine
            navigate('/eventengine');
        } else {
            // Normal edit behavior for other collectors
            navigate(`/configure-collector/${collector.id}`);
        }
    };

    // Modified card click handler - handle FrameEngine redirection
    const handleCardClick = (collector: any) => {
        if (isFrameEngine(collector)) {
            navigate('/eventengine');
        } else {
            navigate(`/configure-collector/${collector.id}`);
        }
    };

    // View mode change handler
    const handleViewModeChange = useCallback((event: React.MouseEvent<HTMLElement>, newViewMode: ViewMode) => {
        if (newViewMode !== null) {
            setViewMode(newViewMode);
        }
    }, []);

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
        <Box sx={{ padding: 2 }}>
            {/* Page Header - Hide on mobile */}
            {!isMobile && (
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Collector Management
                </Typography>
            )}

            {/* Management Buttons - Hide on mobile since bottom action bar handles it */}
            {!isMobile && (
                <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: 'wrap' }}>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={handleAddCollector}
                        size="small"
                        startIcon={<AddIcon />}
                    >
                        Add Collector
                    </Button>
                    <Button
                        variant="outlined"
                        color="secondary"
                        onClick={handleTestAllCollectors}
                        size="small"
                        startIcon={<BiotechIcon />}
                        disabled={loading || collectors.length === 0}
                    >
                        Test All
                    </Button>
                </Box>
            )}

            {/* Auto-Testing Control Panel - Hide on mobile */}
            {!isMobile && (
                <Paper sx={{ p: 2, mb: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        <SettingsIcon sx={{ mr: 1, color: 'text.secondary' }} />
                        <Typography variant="h6">
                            Auto-Testing Configuration
                        </Typography>
                        {loadingTestingSettings && (
                            <CircularProgress size={16} sx={{ ml: 1 }} />
                        )}
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={autoTestingEnabled}
                                    onChange={handleAutoTestingToggle}
                                    disabled={loadingTestingSettings}
                                    color="primary"
                                />
                            }
                            label={
                                <Tooltip title="Enable automatic testing of collectors at regular intervals">
                                    <Typography variant="body2">
                                        Enable Collector Testing
                                    </Typography>
                                </Tooltip>
                            }
                        />

                        <FormControl size="small" sx={{ minWidth: 120 }}>
                            <InputLabel id="testing-frequency-label">Frequency</InputLabel>
                            <Select
                                labelId="testing-frequency-label"
                                value={testingFrequency}
                                label="Frequency"
                                onChange={handleFrequencyChange}
                                disabled={loadingTestingSettings || !autoTestingEnabled}
                            >
                                {frequencyOptions.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>
                                        {option.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>
                </Paper>
            )}

            {/* Warnings Card - shows collectors with errors */}
            <Box sx={{ mb: 3 }}>
                <CollectorsWarningsCard collectors={collectors} />
            </Box>

            {/* Table header with view mode toggle and column selector */}
            <Box display="flex" alignItems="center" mb={1} flexWrap="wrap" gap={2}>
                <Typography variant="h6">Collectors</Typography>

                <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    {/* View Mode Toggle - ONLY show on desktop (hidden on mobile since it's in bottom bar) */}
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

                    {/* Columns Button - Only show in table view */}
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

                {/* Columns Popover */}
                <Popover
                    open={Boolean(anchorCols)}
                    anchorEl={anchorCols}
                    onClose={closeColsPopover}
                >
                    <List dense>
                        {visibleCols.map((field, idx) => (
                            <ListItem key={field}>
                                <Checkbox
                                    checked
                                    onChange={(e) => {
                                        handleToggleColumn(field, e.target.checked);
                                    }}
                                />
                                <ListItemText primary={defaultCollectorColumns.find((c) => c.field === field)!.label} />
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
                        ))}
                        {defaultCollectorColumns
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

            {/* Render based on view mode */}
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', padding: 3 }}>
                    <CircularProgress size={24} />
                </Box>
            ) : viewMode === 'table' ? (
                /* Table View */
                <TableContainer component={Paper} sx={{ mb: 4 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
                                {visibleCols.map((field) => {
                                    const colDef = defaultCollectorColumns.find((c) => c.field === field)!;

                                    const getColumnWidth = (field: string) => {
                                        switch (field) {
                                            case "name":
                                                return { minWidth: 200, width: 'auto' };
                                            case "type":
                                                return { minWidth: 120, width: 120 };
                                            case "url":
                                                return { minWidth: 200, width: 'auto' };
                                            case "accessToken":
                                                return { minWidth: 120, width: 120 };
                                            case "securityStatus":
                                                return { minWidth: 100, width: 100 };
                                            case "status":
                                                return { minWidth: 100, width: 100 };
                                            case "actions":
                                                return { minWidth: 120, width: 120 };
                                            default:
                                                return { minWidth: 120, width: 'auto' };
                                        }
                                    };

                                    const columnWidth = getColumnWidth(field);

                                    return (
                                        <TableCell
                                            key={field}
                                            align={colDef.align}
                                            sortDirection={sortState.orderBy === field ? sortState.order : false}
                                            sx={{
                                                ...columnWidth,
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                padding: '8px 16px'
                                            }}
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
                            {sortedCollectors.length > 0 ? (
                                sortedCollectors.map((collector) => (
                                    <CollectorTableRow
                                        key={collector.id}
                                        collector={collector}
                                        visibleCols={visibleCols}
                                        allColumns={defaultCollectorColumns}
                                        onDelete={handleDelete}
                                        onEdit={handleEdit}
                                        onTest={handleTestCollector}
                                        // Pass additional props to handle FrameEngine special behavior
                                        isFrameEngine={isFrameEngine(collector)}
                                        onCardClick={() => handleCardClick(collector)}
                                        // Add id for scroll-to functionality
                                        id={`collector-${collector.id}`}
                                    />
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={visibleCols.length} sx={{ textAlign: 'center', py: 3 }}>
                                        <Typography color="textSecondary">No collectors found</Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            ) : (
                /* Tile Views */
                <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: getGridColumns(),
                    gap: viewMode === 'mini' ? 1 : 2,
                    mb: 4
                }}>
                    {sortedCollectors.length > 0 ? (
                        sortedCollectors.map((collector) => (
                            <Box key={collector.id} id={`collector-${collector.id}`}>
                                <CollectorCard
                                    collector={collector}
                                    viewMode={viewMode as 'standard' | 'mini'}
                                    onDelete={handleDelete}
                                    onEdit={handleEdit}
                                    onTest={handleTestCollector}
                                    // Pass additional props to handle FrameEngine special behavior
                                    isFrameEngine={isFrameEngine(collector)}
                                    onCardClick={() => handleCardClick(collector)}
                                />
                            </Box>
                        ))
                    ) : (
                        <Paper sx={{ p: 3, textAlign: 'center', gridColumn: '1 / -1' }}>
                            <Typography color="textSecondary">No collectors found</Typography>
                        </Paper>
                    )}
                </Box>
            )}

            {/* Snackbar for notifications */}
            <Snackbar
                open={Boolean(snackMessage)}
                autoHideDuration={6000}
                onClose={() => setSnackMessage(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setSnackMessage(null)}
                    severity={snackbarSeverity}
                    sx={{ width: "100%" }}
                >
                    {snackMessage}
                </Alert>
            </Snackbar>

            {/* Add Collector Modal */}
            <AddCollectorModal
                open={addCollectorModalOpen}
                onClose={() => setAddCollectorModalOpen(false)}
                onCollectorAdded={handleCollectorAdded}
                onCollectorAddedAndConfigure={handleCollectorAddedAndConfigure}
            />
        </Box>
    );
};

export default Collectors;