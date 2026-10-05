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
    Tabs,
    Tab,
    Snackbar,
    Alert,
    IconButton,
    ToggleButtonGroup,
    ToggleButton,
    Switch,
    MenuItem,
    Select,
    FormControl,
    InputLabel,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    SelectChangeEvent,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
// Icon imports
import AddIcon from '@mui/icons-material/Add';
import TableViewIcon from '@mui/icons-material/TableView';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SettingsIcon from '@mui/icons-material/Settings';
import BiotechIcon from '@mui/icons-material/Biotech';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTheme, useMediaQuery } from "@mui/material";
import { usePageTitle } from '../hooks/usePageTitle';

// Shared column utilities
import { useColumnVisibility, ColumnPickerPopover, type ColumnDefinition } from '@junctionrelay/styles';

// Import sub-components
import CollectorCard from '../components/Collectors_CollectorCard';
import CollectorTableRow from '../components/Collectors_CollectorTableRow';
import AddCollectorModal from '../components/Collectors_AddCollectorModal';
import CollectorsWarningsCard from '../components/Collectors_WarningsCard';
import { useCollectorTypes } from '../hooks/useCollectorTypes';
import { FrameEngine_CollectorPluginsTab, FrameEngine_CloudCollectorsTab, FrameEngine_MyCollectorUploadsTab } from '@junctionrelay/frameengine';
import type { CloudAuthState } from '@junctionrelay/frameengine';
import { useAuth } from '../auth/AuthContext';
import type { Collector } from '../types/entities';
import type { ViewMode } from '../types/devices';
import { isViewMode, viewModeFromEvent } from '../types/payloads';

// Types
type SortDirection = 'asc' | 'desc';

// Storage keys
const STORAGE_KEY_COLLECTORS_COLUMNS = "collectors_visible_columns";
const STORAGE_KEY_COLLECTORS_SORT = "collectors_sort_state";
const STORAGE_KEY_COLLECTORS_VIEW_MODE = "junctionrelay_collectors_view_mode";
const STORAGE_KEY_COLLECTORS_ACTIVE_TAB = "collectors_active_tab";

// Column definitions (shared ColumnDefinition type)
const COLLECTOR_COLUMNS: ColumnDefinition<string>[] = [
    { field: 'name', label: 'Collector Name', align: 'left', sortable: true },
    { field: 'type', label: 'Type', align: 'left', sortable: true },
    { field: 'category', label: 'Category', align: 'left', sortable: true },
    { field: 'url', label: 'URL', align: 'left', sortable: true },
    { field: 'accessToken', label: 'Credentials', align: 'left' },
    { field: 'securityStatus', label: 'Security', align: 'left', sortable: true },
    { field: 'status', label: 'Status', align: 'left', sortable: true },
    { field: 'sensorCount', label: 'Sensors', align: 'right', sortable: true },
    { field: 'lastTested', label: 'Last Activity', align: 'left', sortable: true },
    { field: 'actions', label: 'Actions', align: 'right', pinned: 'end', alwaysVisible: true, width: 120 },
];

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
    const { collectorTypesByName } = useCollectorTypes();
    const { isAuthenticated, isLoading, hasValidLicense, user } = useAuth();

    // Map Server's unified auth to CloudAuthState for the shared cloud tabs
    const cloudAuth = useMemo<CloudAuthState>(() => ({
        isAuthenticated,
        loading: isLoading,
        hasValidLicense,
        userName: user?.username ?? null,
        profileImageUrl: null,
    }), [isAuthenticated, isLoading, hasValidLicense, user?.username]);

    // Plugin import pref (default false, only show when explicitly true)
    const [enableImportCollectors, setEnableImportCollectors] = useState(false);

    useEffect(() => {
        fetch('/api/settings/plugin_import_collectors')
            .then(res => res.ok ? res.json() : null)
            .then(data => { if (data) setEnableImportCollectors(data.value === 'true'); })
            .catch(() => {});
    }, []);

    const [collectors, setCollectors] = useState<Collector[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [installedCollectorCount, setInstalledCollectorCount] = useState<number | null>(null);
    const [addCollectorModalOpen, setAddCollectorModalOpen] = useState(false);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "info" | "warning" | "error">("success");

    // Auto-testing configuration state
    const [autoTestingEnabled, setAutoTestingEnabled] = useState<boolean>(false);
    const [testingFrequency, setTestingFrequency] = useState<number>(6);
    const [loadingTestingSettings, setLoadingTestingSettings] = useState<boolean>(false);

    // Active sub-tab — persisted to localStorage
    const [activeSubTab, setActiveSubTab] = useState<number>(() => {
        const saved = localStorage.getItem(STORAGE_KEY_COLLECTORS_ACTIVE_TAB);
        const parsed = saved !== null ? parseInt(saved, 10) : 0;
        return (parsed >= 0 && parsed <= 3) ? parsed : 0;
    });
    const handleSubTabChange = useCallback((_: React.SyntheticEvent, newValue: number) => {
        setActiveSubTab(newValue);
        localStorage.setItem(STORAGE_KEY_COLLECTORS_ACTIVE_TAB, newValue.toString());
    }, []);

    // View mode — persisted to localStorage
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_COLLECTORS_VIEW_MODE);
        return isViewMode(stored) ? stored : 'table';
    });
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_COLLECTORS_VIEW_MODE, viewMode);
    }, [viewMode]);

    // Sort state — persisted to localStorage
    const [sortState, setSortState] = useState<{ orderBy: string, order: SortDirection }>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_COLLECTORS_SORT);
            return stored ? JSON.parse(stored) : { orderBy: 'name', order: 'asc' };
        } catch (e) {
            return { orderBy: 'name', order: 'asc' };
        }
    });
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_COLLECTORS_SORT, JSON.stringify(sortState));
    }, [sortState]);

    // Column visibility — shared hook
    const allColumns = useMemo<ColumnDefinition<string>[]>(() => COLLECTOR_COLUMNS, []);

    const {
        visibleColumns, orderedColumns, hiddenColumns,
        toggleColumn, moveColumn, resetToDefault,
        anchorEl: colPickerAnchor, openPopover: openColPicker, closePopover: closeColPicker,
    } = useColumnVisibility(STORAGE_KEY_COLLECTORS_COLUMNS, allColumns);

    // Accordion expansion states — persisted to localStorage, no animation on load
    const [configExpanded, setConfigExpanded] = useState<boolean>(() => {
        const s = localStorage.getItem('collectors_config_expanded');
        return s !== null ? JSON.parse(s) : true;
    });
    const [collectorsExpanded, setCollectorsExpanded] = useState<boolean>(() => {
        const s = localStorage.getItem('collectors_table_expanded');
        return s !== null ? JSON.parse(s) : true;
    });

    useEffect(() => {
        localStorage.setItem('collectors_config_expanded', JSON.stringify(configExpanded));
    }, [configExpanded]);

    useEffect(() => {
        localStorage.setItem('collectors_table_expanded', JSON.stringify(collectorsExpanded));
    }, [collectorsExpanded]);

    const navigate = useNavigate();
    const handleCloudLogin = useCallback(() => navigate('/settings'), [navigate]);
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

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
                    setAutoTestingEnabled(!value);
                } else if (key === 'frequency') {
                    await fetchAutoTestingSettings();
                }
            }
        } catch (error) {
            console.error('Error updating auto-testing setting:', error);
            showSnackbar('Error updating auto-testing setting', "error");

            // Revert the local state on error
            if (key === 'enabled') {
                setAutoTestingEnabled(!value);
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

    const handleFrequencyChange = useCallback(async (event: SelectChangeEvent<number>) => {
        const newValue = Number(event.target.value);
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
        } catch (err) {
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
            // Fetch installed collector count for tab label
            try {
                const res = await fetch('/api/collectors/types');
                if (res.ok) {
                    const data = await res.json();
                    setInstalledCollectorCount(Array.isArray(data) ? data.length : 0);
                }
            } catch { /* count stays null */ }
        };
        init();
    }, [fetchAutoTestingSettings]);

    // Listen for view mode changes from bottom action bar (mobile only)
    useEffect(() => {
        const handleBottomActionViewModeChange = (e: Event) => {
            // Only respond to bottom action bar changes when in mobile mode
            const newMode = viewModeFromEvent(e);
            if (isMobile && newMode) {
                setViewMode(newMode);
                localStorage.setItem(STORAGE_KEY_COLLECTORS_VIEW_MODE, newMode);
            }
        };

        // Listen for localStorage changes from other tabs/windows
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY_COLLECTORS_VIEW_MODE && isViewMode(e.newValue)) {
                setViewMode(e.newValue);
            }
        };

        // Only listen for bottom action events on mobile
        if (isMobile) {
            window.addEventListener('bottom-action-view-mode-change', handleBottomActionViewModeChange);
        }

        window.addEventListener('storage', handleStorageChange);

        return () => {
            if (isMobile) {
                window.removeEventListener('bottom-action-view-mode-change', handleBottomActionViewModeChange);
            }
            window.removeEventListener('storage', handleStorageChange);
        };
    }, [isMobile]);

    // Listen for bottom action bar events — only handle "Configure Collector" on tab 0
    useEffect(() => {
        const handleAddCollector = () => {
            if (activeSubTab === 0) {
                setAddCollectorModalOpen(true);
            }
        };

        // Add event listener for bottom action bar
        window.addEventListener('bottom-action-add-collector', handleAddCollector);

        // Cleanup
        return () => {
            window.removeEventListener('bottom-action-add-collector', handleAddCollector);
        };
    }, [activeSubTab]);

    // The warnings card types its optional fields as undefined-only; the API sends null
    const warningCollectors = useMemo(() => collectors.map((c) => ({
        ...c,
        lastFetchErrorMessage: c.lastFetchErrorMessage ?? undefined,
        lastTested: c.lastTested ?? undefined,
    })), [collectors]);

    // Sort collectors
    const sortedCollectors = useMemo(() => {
        const { orderBy, order } = sortState;
        return [...collectors].sort((a, b) => {
            let valueA: string | number;
            let valueB: string | number;

            switch (orderBy) {
                case 'name':
                    valueA = a.name?.toLowerCase() || '';
                    valueB = b.name?.toLowerCase() || '';
                    break;
                case 'type':
                    valueA = a.collectorType?.toLowerCase() || '';
                    valueB = b.collectorType?.toLowerCase() || '';
                    break;
                case 'category':
                    valueA = (collectorTypesByName.get(a.collectorType)?.category || '').toLowerCase();
                    valueB = (collectorTypesByName.get(b.collectorType)?.category || '').toLowerCase();
                    break;
                case 'url':
                    valueA = a.url?.toLowerCase() || '';
                    valueB = b.url?.toLowerCase() || '';
                    break;
                case 'status':
                    valueA = a.status?.toLowerCase() || '';
                    valueB = b.status?.toLowerCase() || '';
                    break;
                case 'securityStatus':
                    valueA = a.securityStatus || '';
                    valueB = b.securityStatus || '';
                    break;
                case 'sensorCount':
                    valueA = a.addedSensorCount;
                    valueB = b.addedSensorCount;
                    break;
                case 'lastTested':
                    valueA = a.lastTested || '';
                    valueB = b.lastTested || '';
                    break;
                default:
                    valueA = '';
                    valueB = '';
            }

            if (valueA < valueB) {
                return order === 'asc' ? -1 : 1;
            }
            if (valueA > valueB) {
                return order === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }, [collectors, sortState, collectorTypesByName]);

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
    const isFrameEngine = (collector: Collector) => {
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
        if (collector && isFrameEngine(collector)) {
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
    const handleEdit = (e: React.MouseEvent, collector: Collector) => {
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
    const handleCardClick = (collector: Collector) => {
        if (isFrameEngine(collector)) {
            navigate('/eventengine');
        } else {
            navigate(`/configure-collector/${collector.id}`);
        }
    };

    // View mode change handler
    const handleViewModeChange = useCallback((_event: React.MouseEvent<HTMLElement>, newViewMode: ViewMode) => {
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

    return (
        <Box sx={{ padding: 2 }}>
            {/* Standalone page title — Pattern 2 */}
            {!isMobile && (
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Collector Management
                </Typography>
            )}

            {/* Auto-Testing Config Accordion — hide on mobile */}
            {!isMobile && (
                <Accordion
                    expanded={autoTestingEnabled && configExpanded}
                    onChange={() => { if (autoTestingEnabled) setConfigExpanded(!configExpanded); }}
                    sx={{
                        mb: 1,
                        opacity: autoTestingEnabled ? 1 : 0.7,
                        '& .MuiAccordionSummary-root': {
                            cursor: autoTestingEnabled ? 'pointer' : 'default',
                        }
                    }}
                    TransitionProps={{ timeout: configExpanded ? undefined : 0 }}
                >
                    <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ opacity: autoTestingEnabled ? 1 : 0.3 }} />}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                            <SettingsIcon color="primary" sx={{ opacity: autoTestingEnabled ? 1 : 0.5 }} />
                            <Typography variant="h6" sx={{ fontSize: '1rem', color: autoTestingEnabled ? 'inherit' : 'text.disabled' }}>
                                Auto-Testing Configuration
                            </Typography>
                            {loadingTestingSettings && <CircularProgress size={16} />}
                            <Box sx={{ flex: 1 }} />
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }} onClick={(e) => e.stopPropagation()}>
                                <Typography variant="caption" sx={{ color: autoTestingEnabled ? 'success.main' : 'text.disabled', fontWeight: 600 }}>
                                    {autoTestingEnabled ? 'ON' : 'OFF'}
                                </Typography>
                                <Switch
                                    checked={autoTestingEnabled}
                                    onChange={handleAutoTestingToggle}
                                    disabled={loadingTestingSettings}
                                    size="small"
                                    color="primary"
                                />
                            </Box>
                        </Box>
                    </AccordionSummary>
                    <AccordionDetails>
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
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                            Automatically test all collector connections at the selected interval.
                        </Typography>
                    </AccordionDetails>
                </Accordion>
            )}

            {/* Current Issues — self-managing Card, renders null if no issues */}
            <CollectorsWarningsCard collectors={warningCollectors} />

            {/* Tab Container */}
            <Paper sx={{ display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
                    <Tabs value={activeSubTab} onChange={handleSubTabChange}>
                        <Tab label={loading ? 'Collectors' : `Collectors (${collectors.length})`} />
                        <Tab label={installedCollectorCount !== null ? `Installed Collectors (${installedCollectorCount})` : 'Installed Collectors'} />
                        {/* MVP v1: CollectorXchange and My Uploads hidden */}
                        <Tab label="CollectorXchange" sx={{ display: 'none' }} />
                        <Tab label="My Uploads" sx={{ display: 'none' }} />
                    </Tabs>
                </Box>
                <Box>
                    {activeSubTab === 0 && (
                        <>
                            {/* Collectors Accordion — all controls in header */}
                            <Accordion
                                expanded={collectorsExpanded}
                                onChange={() => setCollectorsExpanded(!collectorsExpanded)}
                                square
                                TransitionProps={{ timeout: collectorsExpanded ? undefined : 0 }}
                            >
                                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ pr: 2 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', pr: 2 }}>
                                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                            Configured Collectors ({loading ? '...' : collectors.length})
                                        </Typography>
                                        {!isMobile && (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }} onClick={(e) => e.stopPropagation()}>
                                                {/* 1. Buttons */}
                                                <Button
                                                    variant="contained"
                                                    color="primary"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleAddCollector();
                                                    }}
                                                    size="small"
                                                    startIcon={<AddIcon />}
                                                >
                                                    Configure Collector
                                                </Button>
                                                <Button
                                                    variant="outlined"
                                                    color="secondary"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleTestAllCollectors();
                                                    }}
                                                    size="small"
                                                    startIcon={<BiotechIcon />}
                                                    disabled={loading || collectors.length === 0}
                                                >
                                                    Test All
                                                </Button>

                                                {/* 2. Column picker gear — table mode only */}
                                                {viewMode === 'table' && (
                                                    <IconButton size="small" onClick={openColPicker}>
                                                        <SettingsIcon fontSize="small" />
                                                    </IconButton>
                                                )}

                                                {/* 3. View mode toggle — icon-only */}
                                                <ToggleButtonGroup
                                                    value={viewMode}
                                                    exclusive
                                                    onChange={handleViewModeChange}
                                                    aria-label="view mode"
                                                    size="small"
                                                >
                                                    <ToggleButton value="table" title="Table View">
                                                        <TableViewIcon fontSize="small" />
                                                    </ToggleButton>
                                                    <ToggleButton value="standard" title="Card View">
                                                        <DashboardIcon fontSize="small" />
                                                    </ToggleButton>
                                                    <ToggleButton value="mini" title="Compact View">
                                                        <ViewModuleIcon fontSize="small" />
                                                    </ToggleButton>
                                                </ToggleButtonGroup>
                                            </Box>
                                        )}
                                    </Box>
                                </AccordionSummary>
                                <AccordionDetails sx={{ p: 0 }}>
                                    {loading ? (
                                        <Box sx={{ display: 'flex', justifyContent: 'center', padding: 3 }}>
                                            <CircularProgress size={24} />
                                        </Box>
                                    ) : (
                                        <>
                                            {viewMode === 'table' ? (
                                                /* Table View */
                                                <TableContainer>
                                                    <Table size="small">
                                                        <TableHead>
                                                            <TableRow sx={{ bgcolor: 'action.hover' }}>
                                                                {visibleColumns.map((field: string) => {
                                                                    const colDef = COLLECTOR_COLUMNS.find((c) => c.field === field);
                                                                    if (!colDef) return null;

                                                                    const getColumnWidth = (field: string) => {
                                                                        switch (field) {
                                                                            case "name":
                                                                                return { minWidth: 200, width: 'auto' };
                                                                            case "type":
                                                                                return { minWidth: 120, width: 120 };
                                                                            case "category":
                                                                                return { minWidth: 140, width: 140 };
                                                                            case "url":
                                                                                return { minWidth: 200, width: 'auto' };
                                                                            case "accessToken":
                                                                                return { minWidth: 120, width: 120 };
                                                                            case "securityStatus":
                                                                                return { minWidth: 100, width: 100 };
                                                                            case "status":
                                                                                return { minWidth: 100, width: 100 };
                                                                            case "sensorCount":
                                                                                return { minWidth: 80, width: 80 };
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
                                                                        visibleCols={visibleColumns}
                                                                        allColumns={COLLECTOR_COLUMNS}
                                                                        onDelete={handleDelete}
                                                                        onEdit={handleEdit}
                                                                        onTest={handleTestCollector}
                                                                        isFrameEngine={isFrameEngine(collector)}
                                                                        onCardClick={() => handleCardClick(collector)}
                                                                        id={`collector-${collector.id}`}
                                                                        metadata={collectorTypesByName.get(collector.collectorType)}
                                                                    />
                                                                ))
                                                            ) : (
                                                                <TableRow>
                                                                    <TableCell colSpan={visibleColumns.length} sx={{ textAlign: 'center', py: 3 }}>
                                                                        <Typography color="textSecondary">No collectors found</Typography>
                                                                    </TableCell>
                                                                </TableRow>
                                                            )}
                                                        </TableBody>
                                                    </Table>
                                                </TableContainer>
                                            ) : (
                                                /* Tile Views */
                                                <Box sx={{ p: 2 }}>
                                                    <Box sx={{
                                                        display: 'grid',
                                                        gridTemplateColumns: getGridColumns(),
                                                        gap: viewMode === 'mini' ? 1 : 2,
                                                    }}>
                                                        {sortedCollectors.length > 0 ? (
                                                            sortedCollectors.map((collector) => (
                                                                <Box key={collector.id} id={`collector-${collector.id}`}>
                                                                    <CollectorCard
                                                                        collector={collector}
                                                                        viewMode={viewMode === 'mini' ? 'mini' : 'standard'}
                                                                        onDelete={handleDelete}
                                                                        onEdit={handleEdit}
                                                                        onTest={handleTestCollector}
                                                                        isFrameEngine={isFrameEngine(collector)}
                                                                        onCardClick={() => handleCardClick(collector)}
                                                                        metadata={collectorTypesByName.get(collector.collectorType)}
                                                                    />
                                                                </Box>
                                                            ))
                                                        ) : (
                                                            <Paper sx={{ p: 3, textAlign: 'center', gridColumn: '1 / -1' }}>
                                                                <Typography color="textSecondary">No collectors found</Typography>
                                                            </Paper>
                                                        )}
                                                    </Box>
                                                </Box>
                                            )}
                                        </>
                                    )}
                                </AccordionDetails>
                            </Accordion>
                        </>
                    )}
                    {activeSubTab === 1 && (
                        <FrameEngine_CollectorPluginsTab
                          onShowSnackbar={showSnackbar}
                          enableImport={enableImportCollectors}
                        />
                    )}
                    {activeSubTab === 2 && (
                        <FrameEngine_CloudCollectorsTab
                          cloudAuth={cloudAuth}
                          onCloudLogin={handleCloudLogin}
                          cloudLoginLabel="Go to Settings"
                          onShowSnackbar={showSnackbar}
                        />
                    )}
                    {activeSubTab === 3 && (
                        <FrameEngine_MyCollectorUploadsTab
                          cloudAuth={cloudAuth}
                          onCloudLogin={handleCloudLogin}
                          cloudLoginLabel="Go to Settings"
                        />
                    )}
                </Box>
            </Paper>

            {/* Column picker popover — rendered outside accordion */}
            <ColumnPickerPopover
                allColumns={allColumns}
                orderedColumns={orderedColumns}
                hiddenColumns={hiddenColumns}
                anchorEl={colPickerAnchor}
                onClose={closeColPicker}
                onToggle={toggleColumn}
                onMove={moveColumn}
                onReset={resetToDefault}
            />

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
