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

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
    Typography,
    Box,
    CircularProgress,
    Snackbar,
    Alert,
    Tooltip,
    Switch,
    AlertColor,
    Button,
    IconButton,
    FormControlLabel,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    ToggleButtonGroup,
    ToggleButton,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import AddIcon from '@mui/icons-material/Add';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import SettingsIcon from '@mui/icons-material/Settings';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TableViewIcon from '@mui/icons-material/TableView';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import { useTheme, useMediaQuery } from "@mui/material";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { usePageTitle } from "../hooks/usePageTitle";
import { useColumnVisibility, ColumnPickerPopover } from '@junctionrelay/styles';
// Import the JunctionsTable component and its types
import JunctionsTable, { Junction, JUNCTION_COLUMNS } from "../components/JunctionsTable";
import type { ViewMode } from "../components/JunctionsTable";
import AddJunctionModal from "../components/Junction_AddJunctionModal";

// Main Junctions Component following Devices page pattern
const Junctions = () => {
    usePageTitle('Junctions');

    const [junctions, setJunctions] = useState<Junction[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<AlertColor>("success");
    const [detailedConnections, setDetailedConnections] = useState<boolean>(() => {
        const savedValue = localStorage.getItem('junctions_page_detailed_connections');
        return savedValue !== null ? savedValue === 'true' : true;
    });

    // View mode — persisted to localStorage
    const [viewMode, setViewMode] = useState<ViewMode>(() =>
        (localStorage.getItem('junctions_page_view_mode') as ViewMode) || 'table'
    );
    useEffect(() => {
        localStorage.setItem('junctions_page_view_mode', viewMode);
    }, [viewMode]);

    // Show running only — persisted to localStorage
    const [showRunningOnly, setShowRunningOnly] = useState<boolean>(() => {
        const s = localStorage.getItem('junctions_page_show_running_only');
        return s ? JSON.parse(s) : false;
    });
    useEffect(() => {
        localStorage.setItem('junctions_page_show_running_only', JSON.stringify(showRunningOnly));
    }, [showRunningOnly]);

    // Persist detailedConnections
    useEffect(() => {
        localStorage.setItem('junctions_page_detailed_connections', JSON.stringify(detailedConnections));
    }, [detailedConnections]);

    // Column visibility
    const allColumns = useMemo(() => JUNCTION_COLUMNS, []);

    const {
        visibleColumns, orderedColumns, hiddenColumns,
        toggleColumn, moveColumn, resetToDefault,
        anchorEl: colPickerAnchor, openPopover: openColPicker, closePopover: closeColPicker,
    } = useColumnVisibility('junctions_visible_cols', allColumns);

    // Junction creation state - simplified
    const [addJunctionModalOpen, setAddJunctionModalOpen] = useState<boolean>(false);
    const [importing, setImporting] = useState<boolean>(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Service settings state
    const [autostartEnabled, setAutostartEnabled] = useState<boolean>(true);
    const [parallelMode, setParallelMode] = useState<boolean>(false);
    const [loadingSettings, setLoadingSettings] = useState<boolean>(false);

    // Accordion expansion states — persisted to localStorage, no animation on load
    const [settingsExpanded, setSettingsExpanded] = useState<boolean>(() => {
        const s = localStorage.getItem('junctions_settings_expanded');
        return s !== null ? JSON.parse(s) : true;
    });
    const [junctionsExpanded, setJunctionsExpanded] = useState<boolean>(() => {
        const s = localStorage.getItem('junctions_table_expanded');
        return s !== null ? JSON.parse(s) : true;
    });

    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const flags = useFeatureFlags();
    const junctionImportExportEnabled = flags?.junction_import_export !== false;

    // Show snackbar with configurable severity
    const showSnackbar = useCallback((message: string, severity: AlertColor = "success") => {
        setSnackMessage(message);
        setSnackbarSeverity(severity);
    }, []);

    // Fetch service settings
    const fetchServiceSettings = useCallback(async () => {
        try {
            const response = await fetch('/api/settings/flags');
            if (response.ok) {
                const settings = await response.json();
                setAutostartEnabled(String(settings.junction_autostart_enabled).toLowerCase() === 'true');
                setParallelMode(String(settings.junction_autostart_parallel).toLowerCase() === 'true');
            }
        } catch (error) {
            console.error('Error fetching service settings:', error);
        }
    }, []);

    // Update service setting
    const updateServiceSetting = useCallback(async (key: string, value: boolean) => {
        setLoadingSettings(true);
        try {
            const response = await fetch(`/api/settings/toggle/${key}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: value })
            });

            if (response.ok) {
                // Format the service name properly for display
                let serviceName = key;
                if (key === 'junction_autostart_enabled') {
                    serviceName = 'Junction auto-start service';
                } else if (key === 'junction_autostart_parallel') {
                    serviceName = 'Parallel junction startup';
                }

                showSnackbar(
                    `${serviceName} ${value ? 'enabled' : 'disabled'}`,
                    "info"
                );
            } else {
                const error = await response.json();
                showSnackbar(`Failed to update setting: ${error.message}`, "error");

                // Revert the local state on error
                if (key === 'junction_autostart_enabled') {
                    setAutostartEnabled(!value);
                } else if (key === 'junction_autostart_parallel') {
                    setParallelMode(!value);
                }
            }
        } catch (error) {
            console.error('Error updating service setting:', error);
            showSnackbar('Error updating service setting', "error");

            // Revert the local state on error
            if (key === 'junction_autostart_enabled') {
                setAutostartEnabled(!value);
            } else if (key === 'junction_autostart_parallel') {
                setParallelMode(!value);
            }
        } finally {
            setLoadingSettings(false);
        }
    }, [showSnackbar]);

    // Service setting change handlers
    const handleServiceAutostartToggle = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = event.target.checked;
        setAutostartEnabled(newValue);
        await updateServiceSetting('junction_autostart_enabled', newValue);
    }, [updateServiceSetting]);

    const handleParallelModeToggle = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = event.target.checked;
        setParallelMode(newValue);
        await updateServiceSetting('junction_autostart_parallel', newValue);
    }, [updateServiceSetting]);

    // Persist accordion expansion states
    useEffect(() => {
        localStorage.setItem('junctions_settings_expanded', JSON.stringify(settingsExpanded));
    }, [settingsExpanded]);

    useEffect(() => {
        localStorage.setItem('junctions_table_expanded', JSON.stringify(junctionsExpanded));
    }, [junctionsExpanded]);

    // NEW: Bottom Action Bar event listeners
    useEffect(() => {
        const handleAddJunction = () => {
            handleAddJunctionClick();
        };

        const handleRefresh = () => {
            refreshJunctions();
        };

        // Add event listeners for bottom action bar
        window.addEventListener('bottom-action-add-junction', handleAddJunction);
        window.addEventListener('bottom-action-refresh', handleRefresh);

        // Cleanup
        return () => {
            window.removeEventListener('bottom-action-add-junction', handleAddJunction);
            window.removeEventListener('bottom-action-refresh', handleRefresh);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Empty dependency array - refreshJunctions is stable

    // Refresh only junction status - matches Dashboard pattern with smart comparison
    const refreshJunctionsStatus = useCallback(() => {
        fetch("/api/connections/running")
            .then((r) => r.json())
            .then((data: { id: number; status: string }[]) =>
                setJunctions((prev) => {
                    const updated = prev.map((j) => {
                        const upd = data.find((r) => r.id === j.id);
                        return upd && upd.status !== j.status ? { ...j, status: upd.status } : j;
                    });

                    if (JSON.stringify(updated) !== JSON.stringify(prev)) {
                        return updated;
                    }
                    return prev;
                })
            )
            .catch(console.error);
    }, []);

    // Refresh junctions data (for after add/clone/delete operations)
    const refreshJunctions = useCallback(async () => {
        try {
            const response = await fetch("/api/junctions/summary");
            if (!response.ok) {
                throw new Error("Failed to fetch junctions");
            }
            const junctions = await response.json();

            // Add sortOrder if missing and sort the junctions
            const junctionsWithSortOrder = junctions.map((j: Junction, index: number) => {
                return { ...j, sortOrder: j.sortOrder !== undefined ? j.sortOrder : index };
            }).sort((a: Junction, b: Junction) => a.sortOrder - b.sortOrder);

            // Merge with current status data
            const runningResponse = await fetch("/api/connections/running");
            if (runningResponse.ok) {
                const runningData: { id: number; status: string }[] = await runningResponse.json();
                const updatedJunctions = junctionsWithSortOrder.map((j: Junction) => {
                    const running = runningData.find(r => r.id === j.id);
                    return running ? { ...j, status: running.status } : j;
                });

                setJunctions(prev => {
                    if (JSON.stringify(updatedJunctions) !== JSON.stringify(prev)) {
                        return updatedJunctions;
                    }
                    return prev;
                });
            } else {
                setJunctions(prev => {
                    if (JSON.stringify(junctionsWithSortOrder) !== JSON.stringify(prev)) {
                        return junctionsWithSortOrder;
                    }
                    return prev;
                });
            }
        } catch (err) {
            showSnackbar("Error refreshing junctions", "error");
            console.error("Error refreshing junctions:", err);
        }
    }, [showSnackbar]);

    // Initial data loading
    useEffect(() => {
        const init = async () => {
            try {
                setLoading(true);

                // Fetch service settings first
                await fetchServiceSettings();

                const junctionsResponse = await fetch("/api/junctions/summary");
                if (!junctionsResponse.ok) {
                    throw new Error("Failed to fetch junctions");
                }
                const junctions = await junctionsResponse.json();

                const runningResponse = await fetch("/api/connections/running");
                let runningData: { id: number; status: string }[] = [];
                if (runningResponse.ok) {
                    runningData = await runningResponse.json();
                }

                const mergedJunctions = junctions.map((j: Junction, index: number) => {
                    const u = runningData.find(x => x.id === j.id);
                    const sortOrder = j.sortOrder !== undefined ? j.sortOrder : index;
                    return u ? { ...j, status: u.status, sortOrder } : { ...j, sortOrder };
                });

                mergedJunctions.sort((a: Junction, b: Junction) => a.sortOrder - b.sortOrder);
                setJunctions(mergedJunctions);

            } catch (err) {
                showSnackbar("Error fetching junctions", "error");
                console.error("Error fetching junctions:", err);
            } finally {
                setLoading(false);
            }
        };

        init();

        const intervalId = setInterval(() => {
            refreshJunctionsStatus();
        }, 1000);

        return () => clearInterval(intervalId);
    }, [refreshJunctionsStatus, showSnackbar, fetchServiceSettings]);

    // Handle updating junction sort order
    const handleUpdateSortOrders = async (updates: { junctionId: number, sortOrder: number }[]) => {
        try {
            if (!updates || updates.length === 0) return;

            // Update local state only - no backend call needed
            setJunctions(prevJunctions => {
                const junctionMap = new Map(prevJunctions.map(j => [j.id, j]));

                updates.forEach(update => {
                    if (junctionMap.has(update.junctionId)) {
                        const junction = junctionMap.get(update.junctionId);
                        if (junction) {
                            junctionMap.set(update.junctionId, {
                                ...junction,
                                sortOrder: update.sortOrder
                            });
                        }
                    }
                });

                return Array.from(junctionMap.values())
                    .sort((a, b) => a.sortOrder - b.sortOrder);
            });

        } catch (error) {
            console.error("Failed to process sort orders:", error);
        }
    };

    // Junction action handlers
    const handleDashboardToggle = useCallback(async (junctionId: number, showOnDashboard: boolean) => {
        try {
            // Find the junction to update
            const junction = junctions.find(j => j.id === junctionId);
            if (!junction) {
                throw new Error("Junction not found");
            }

            const updatedJunction = {
                ...junction,
                showOnDashboard: showOnDashboard
            };

            const response = await fetch(`/api/junctions/${junctionId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedJunction),
            });

            if (response.ok) {
                showSnackbar(`Junction ${showOnDashboard ? 'added to' : 'removed from'} dashboard`, "success");
                await refreshJunctions();
            } else {
                throw new Error("Failed to update junction");
            }
        } catch (err) {
            console.error("Dashboard toggle error:", err);
            showSnackbar("Error updating junction dashboard status", "error");
        }
    }, [junctions, showSnackbar, refreshJunctions]);

    const handleAutoStartToggle = useCallback(async (junctionId: number, autoStartOnLaunch: boolean) => {
        try {
            // Find the junction to update
            const junction = junctions.find(j => j.id === junctionId);
            if (!junction) {
                throw new Error("Junction not found");
            }

            const updatedJunction = {
                ...junction,
                autoStartOnLaunch: autoStartOnLaunch
            };

            const response = await fetch(`/api/junctions/${junctionId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedJunction),
            });

            if (response.ok) {
                showSnackbar(`Junction auto-start ${autoStartOnLaunch ? 'enabled' : 'disabled'}`, "success");
                await refreshJunctions();
            } else {
                throw new Error("Failed to update junction");
            }
        } catch (err) {
            console.error("Auto-start toggle error:", err);
            showSnackbar("Error updating junction auto-start status", "error");
        }
    }, [junctions, showSnackbar, refreshJunctions]);

    const handleStartJunction = async (junctionId: number) => {
        try {
            const response = await fetch(`/api/connections/start/${junctionId}`, { method: "POST" });
            if (response.ok) {
                showSnackbar("Junction started successfully", "success");
                setJunctions(prev =>
                    prev.map(j =>
                        j.id === junctionId ? { ...j, status: "Running" } : j
                    )
                );
            } else {
                throw new Error("Failed to start junction");
            }
        } catch (err) {
            showSnackbar("Error starting junction", "error");
        }
    };

    const handleStopJunction = async (junctionId: number) => {
        try {
            const response = await fetch(`/api/connections/stop/${junctionId}`, { method: "POST" });
            if (response.ok) {
                showSnackbar("Junction stopped successfully", "success");
                setJunctions(prev =>
                    prev.map(j =>
                        j.id === junctionId ? { ...j, status: "Idle" } : j
                    )
                );
            } else {
                throw new Error("Failed to stop junction");
            }
        } catch (err) {
            showSnackbar("Error stopping junction", "error");
        }
    };

    const handleCloneJunction = async (junctionId: number) => {
        try {
            const response = await fetch(`/api/junctions/${junctionId}/clone`, {
                method: "POST"
            });

            if (!response.ok) {
                throw new Error("Failed to clone junction");
            }

            const cloned = await response.json();
            showSnackbar(`Cloned "${cloned.name}" successfully`, "success");
            await refreshJunctions();
        } catch (err) {
            console.error("Clone failed:", err);
            showSnackbar("Error cloning junction", "error");
        }
    };

    const handleDeleteJunction = async (junctionId: number) => {
        try {
            // Check if junction is running before deletion
            const junction = junctions.find(j => j.id === junctionId);
            if (junction?.status === "Running") {
                showSnackbar("Cannot delete a running junction. Please stop it first.", "error");
                return;
            }

            const response = await fetch(`/api/junctions/${junctionId}`, {
                method: "DELETE"
            });

            if (response.ok) {
                showSnackbar("Junction deleted successfully", "success");
                await refreshJunctions();
            } else {
                // Try to parse backend error message
                const errorData = await response.json().catch(() => null);
                const errorMessage = errorData?.message || "Failed to delete junction";
                showSnackbar(errorMessage, "error");
            }
        } catch (err) {
            showSnackbar("Error deleting junction", "error");
        }
    };

    // Junction creation handlers - simplified
    const handleAddJunctionClick = () => {
        setAddJunctionModalOpen(true);
    };

    // Handle the file upload and import
    const handleImportJunction = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            showSnackbar("No file selected", "error");
            return;
        }

        setImporting(true);
        try {
            const fileContent = await file.text();
            JSON.parse(fileContent); // Just validate JSON format

            // Import junction logic would go here - calling the service
            // await junctionService.importJunction(jsonData);

            // Notify parent to refresh
            await refreshJunctions();
            showSnackbar("Junction imported successfully", "success");
        } catch (error) {
            console.error("Import failed:", error);
            showSnackbar("Failed to import junction", "error");
        } finally {
            setImporting(false);
        }

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleJunctionAdded = async (id: number, redirect: boolean) => {
        await refreshJunctions();
        showSnackbar("Junction added successfully", "success");

        if (redirect) {
            navigate(`/configure-junction/${id}`);
        }
    };

    return (
        <Box sx={{ padding: 2 }}>
            {/* Standalone page title — Pattern 2 */}
            {!isMobile && (
                <Typography variant="h6" sx={{ mb: 2 }}>Junction Management</Typography>
            )}

            {/* Service Settings Accordion */}
            {!isMobile && (
                <Accordion
                    expanded={settingsExpanded}
                    onChange={() => setSettingsExpanded(!settingsExpanded)}
                    sx={{ mb: 1 }}
                    TransitionProps={{ timeout: settingsExpanded ? undefined : 0 }}
                >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                            <SettingsIcon color="primary" />
                            <Typography variant="h6" sx={{ fontSize: '1rem' }}>
                                Service Settings
                            </Typography>
                            {loadingSettings && <CircularProgress size={16} />}
                        </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={autostartEnabled}
                                        onChange={handleServiceAutostartToggle}
                                        disabled={loadingSettings}
                                        color="primary"
                                    />
                                }
                                label={
                                    <Tooltip title="Master toggle for the junction autostart service. If disabled, no junctions will auto-start regardless of their individual AutoStartOnLaunch setting">
                                        <Typography variant="body2">
                                            Auto-Start Service
                                        </Typography>
                                    </Tooltip>
                                }
                            />

                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={parallelMode}
                                        onChange={handleParallelModeToggle}
                                        disabled={loadingSettings || !autostartEnabled}
                                        color="primary"
                                    />
                                }
                                label={
                                    <Tooltip title="If enabled, auto-start junctions will be started in parallel during system startup. If disabled, they will be started sequentially with delays between each start">
                                        <Typography variant="body2">
                                            Parallel Startup Mode
                                        </Typography>
                                    </Tooltip>
                                }
                            />
                        </Box>
                    </AccordionDetails>
                </Accordion>
            )}

            {/* Junctions Accordion — all controls in header */}
            <Accordion
                expanded={junctionsExpanded}
                onChange={() => setJunctionsExpanded(!junctionsExpanded)}
                TransitionProps={{ timeout: junctionsExpanded ? undefined : 0 }}
            >
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ pr: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', pr: 2 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                            Junctions
                        </Typography>
                        {!isMobile && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }} onClick={(e) => e.stopPropagation()}>
                                {/* 1. Switches */}
                                {viewMode === 'table' && (
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={detailedConnections}
                                                onChange={(e) => setDetailedConnections(e.target.checked)}
                                                size="small"
                                            />
                                        }
                                        label={<Typography variant="body2">Show Details</Typography>}
                                        sx={{ margin: 0 }}
                                    />
                                )}

                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={showRunningOnly}
                                            onChange={(e) => setShowRunningOnly(e.target.checked)}
                                            size="small"
                                        />
                                    }
                                    label={<Typography variant="body2">Running Only</Typography>}
                                    sx={{ margin: 0 }}
                                />

                                {/* 2. Buttons */}
                                <Button
                                    variant="contained"
                                    color="primary"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleAddJunctionClick();
                                    }}
                                    size="small"
                                    startIcon={<AddIcon />}
                                    data-testid="add-junction-button"
                                >
                                    Create Junction
                                </Button>

                                {junctionImportExportEnabled && (
                                    <Button
                                        variant="outlined"
                                        color="primary"
                                        component="label"
                                        size="small"
                                        startIcon={<CloudUploadIcon />}
                                        disabled={importing}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {importing ? (
                                            <>
                                                <CircularProgress size={16} sx={{ mr: 1 }} />
                                                Importing...
                                            </>
                                        ) : (
                                            'Import Junction'
                                        )}
                                        <input
                                            type="file"
                                            hidden
                                            accept=".json"
                                            onChange={handleImportJunction}
                                            disabled={importing}
                                            ref={fileInputRef}
                                        />
                                    </Button>
                                )}

                                {/* 3. Column picker gear — table mode only */}
                                {viewMode === 'table' && (
                                    <IconButton size="small" onClick={openColPicker}>
                                        <SettingsIcon fontSize="small" />
                                    </IconButton>
                                )}

                                {/* 4. View mode toggle — icon-only */}
                                <ToggleButtonGroup
                                    value={viewMode}
                                    exclusive
                                    onChange={(_e, v) => { if (v) setViewMode(v); }}
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
                    {loading && junctions.length === 0 ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', padding: 3 }}>
                            <CircularProgress size={24} />
                        </Box>
                    ) : viewMode === 'table' ? (
                        <JunctionsTable
                            junctions={junctions}
                            viewMode={viewMode}
                            showRunningOnly={showRunningOnly}
                            visibleColumns={visibleColumns}
                            allColumns={allColumns}
                            sortStorageKey="junctions_sort"
                            onStartJunction={handleStartJunction}
                            onStopJunction={handleStopJunction}
                            onCloneJunction={handleCloneJunction}
                            onDeleteJunction={handleDeleteJunction}
                            onUpdateSortOrders={handleUpdateSortOrders}
                            onJunctionAdded={refreshJunctions}
                            onDashboardToggle={handleDashboardToggle}
                            onAutoStartToggle={handleAutoStartToggle}
                            detailedConnections={detailedConnections}
                            setDetailedConnections={setDetailedConnections}
                            showAddButton={false}
                            showImportButton={false}
                        />
                    ) : (
                        <Box sx={{ p: 2 }}>
                            <JunctionsTable
                                junctions={junctions}
                                viewMode={viewMode}
                                showRunningOnly={showRunningOnly}
                                visibleColumns={visibleColumns}
                                allColumns={allColumns}
                                sortStorageKey="junctions_sort"
                                onStartJunction={handleStartJunction}
                                onStopJunction={handleStopJunction}
                                onCloneJunction={handleCloneJunction}
                                onDeleteJunction={handleDeleteJunction}
                                onUpdateSortOrders={handleUpdateSortOrders}
                                onJunctionAdded={refreshJunctions}
                                onDashboardToggle={handleDashboardToggle}
                                onAutoStartToggle={handleAutoStartToggle}
                                detailedConnections={detailedConnections}
                                setDetailedConnections={setDetailedConnections}
                                showAddButton={false}
                                showImportButton={false}
                            />
                        </Box>
                    )}
                </AccordionDetails>
            </Accordion>

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

            {/* Create Junction Modal */}
            <AddJunctionModal
                open={addJunctionModalOpen}
                onClose={() => setAddJunctionModalOpen(false)}
                onJunctionAdded={handleJunctionAdded}
                junctions={junctions}
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
        </Box>
    );
};

export default Junctions;