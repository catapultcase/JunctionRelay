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

import { useState, useEffect, useCallback, useMemo } from "react";
import {
    Typography,
    Box,
    CircularProgress,
    Snackbar,
    Alert,
    AlertColor,
    Button,
    IconButton,
    Switch,
    FormControlLabel,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    ToggleButtonGroup,
    ToggleButton,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SettingsIcon from '@mui/icons-material/Settings';
import TableViewIcon from '@mui/icons-material/TableView';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import { useTheme, useMediaQuery } from "@mui/material";
import { usePageTitle } from "../hooks/usePageTitle";
import { useColumnVisibility, ColumnPickerPopover } from '@junctionrelay/styles';

// Import the JunctionsTable component and its types
import JunctionsTable, { Junction, JUNCTION_COLUMNS } from "../components/JunctionsTable";
import type { ViewMode } from "../components/JunctionsTable";
import AddJunctionModal from "../components/Junction_AddJunctionModal";
import DashboardSettings from '../components/dashboard/Dashboard_Settings';
import ActiveCollectorsCard from '../components/dashboard/Dashboard_ActiveCollectorsCard';
import ActiveStreamsCard from '../components/dashboard/Dashboard_ActiveStreamsCard';
import DashboardStats from '../components/dashboard/Dashboard_Stats';
import { useDashboardWebSocket } from '../hooks/useDashboardWebSocket';

// Main Dashboard Component
const Dashboard = () => {
    usePageTitle('Dashboard');
    const [junctions, setJunctions] = useState<Junction[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<AlertColor>("success");
    const [detailedConnections, setDetailedConnections] = useState<boolean>(() => {
        const savedValue = localStorage.getItem('dashboard_detailed_connections');
        return savedValue !== null ? savedValue === 'true' : true;
    });

    // View mode — persisted to localStorage
    const [dashViewMode, setDashViewMode] = useState<ViewMode>(() =>
        (localStorage.getItem('dashboard_junctions_view_mode') as ViewMode) || 'table'
    );
    useEffect(() => {
        localStorage.setItem('dashboard_junctions_view_mode', dashViewMode);
    }, [dashViewMode]);

    // Show running only — persisted to localStorage
    const [showRunningOnly, setShowRunningOnly] = useState<boolean>(() => {
        const s = localStorage.getItem('dashboard_show_running_only');
        return s ? JSON.parse(s) : false;
    });
    useEffect(() => {
        localStorage.setItem('dashboard_show_running_only', JSON.stringify(showRunningOnly));
    }, [showRunningOnly]);

    // Persist detailedConnections
    useEffect(() => {
        localStorage.setItem('dashboard_detailed_connections', JSON.stringify(detailedConnections));
    }, [detailedConnections]);

    // Column visibility — exclude dashboard column (Dashboard shows only dashboard-visible junctions)
    const dashAllColumns = useMemo(() =>
        JUNCTION_COLUMNS.filter(c => c.field !== 'dashboard'),
    []);

    const {
        visibleColumns: dashVisibleColumns, orderedColumns: dashOrderedColumns,
        hiddenColumns: dashHiddenColumns, toggleColumn: dashToggleColumn,
        moveColumn: dashMoveColumn, resetToDefault: dashResetToDefault,
        anchorEl: dashColAnchor, openPopover: dashOpenColPicker, closePopover: dashCloseColPicker,
    } = useColumnVisibility('dashboard_visible_junction_cols', dashAllColumns);

    // Junction creation state - simplified
    const [addJunctionModalOpen, setAddJunctionModalOpen] = useState<boolean>(false);

    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Filter junctions to only show those with showOnDashboard: true
    const dashboardJunctions = useMemo(() => {
        return junctions.filter(junction => junction.showOnDashboard !== false);
    }, [junctions]);


    // Add cleanup when navigating away from dashboard
    useEffect(() => {
        return () => {
            // Notify child components to cleanup
            window.dispatchEvent(new CustomEvent('dashboard-cleanup'));
        };
    }, []);

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

    // Show snackbar with configurable severity
    const showSnackbar = useCallback((message: string, severity: AlertColor = "success") => {
        setSnackMessage(message);
        setSnackbarSeverity(severity);
    }, []);

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

    // Initial data loading with enhanced cleanup
    useEffect(() => {
        let mounted = true;
        let intervalId: number | null = null;

        const init = async () => {
            if (!mounted) return;

            try {
                setLoading(true);

                const junctionsResponse = await fetch("/api/junctions/summary");
                if (!junctionsResponse.ok) {
                    throw new Error("Failed to fetch junctions");
                }
                const junctions = await junctionsResponse.json();

                if (!mounted) return; // Check again after async operation

                const runningResponse = await fetch("/api/connections/running");
                let runningData: { id: number; status: string }[] = [];
                if (runningResponse.ok) {
                    runningData = await runningResponse.json();
                }

                if (!mounted) return; // Check again after async operation

                const mergedJunctions = junctions.map((j: Junction, index: number) => {
                    const u = runningData.find(x => x.id === j.id);
                    const sortOrder = j.sortOrder !== undefined ? j.sortOrder : index;
                    return u ? { ...j, status: u.status, sortOrder } : { ...j, sortOrder };
                });

                mergedJunctions.sort((a: Junction, b: Junction) => a.sortOrder - b.sortOrder);

                if (mounted) {
                    setJunctions(mergedJunctions);
                }

            } catch (err) {
                if (mounted) {
                    showSnackbar("Error fetching junctions", "error");
                    console.error("Error fetching junctions:", err);
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        };

        init();

        intervalId = window.setInterval(() => {
            if (mounted) {
                refreshJunctionsStatus();
            }
        }, 1000);

        // Enhanced cleanup
        return () => {
            mounted = false;
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
        };
    }, [refreshJunctionsStatus, showSnackbar]);

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

    const handleJunctionAdded = async (id: number, redirect: boolean) => {
        await refreshJunctions();
        showSnackbar("Junction added successfully", "success");

        if (redirect) {
            navigate(`/configure-junction/${id}`);
        }
    };

    const [collectorsExpanded] = useState<boolean>(() => {
        const saved = localStorage.getItem('dashboard_collectors_expanded');
        return saved !== null ? saved === 'true' : true;
    });

    const [streamsExpanded] = useState<boolean>(() => {
        const saved = localStorage.getItem('dashboard_streams_expanded');
        return saved !== null ? saved === 'true' : true;
    });

    const [junctionsExpanded, setJunctionsExpanded] = useState<boolean>(() => {
        const saved = localStorage.getItem('dashboard_junctions_expanded');
        return saved !== null ? saved === 'true' : true;
    });

    // Single WebSocket connection for both collectors and streams
    const {
        collectors,
        streams,
        connectionStatus,
        isConnected,
        connect: wsConnect,
        disconnect: wsDisconnect    } = useDashboardWebSocket({
        enabled: collectorsExpanded || streamsExpanded
    });

    // Persist junctions expansion state
    useEffect(() => {
        localStorage.setItem('dashboard_junctions_expanded', junctionsExpanded.toString());
    }, [junctionsExpanded]);

    return (
        <Box sx={{ padding: 2 }}>
            {/* System Overview Stats Card - now includes warnings */}
            <DashboardStats junctions={junctions} />

            {/* Junction Management — Accordion with controls in header */}
            <Accordion
                expanded={junctionsExpanded}
                onChange={() => setJunctionsExpanded(!junctionsExpanded)}
                disableGutters
                sx={{ mb: 3 }}
                TransitionProps={{ timeout: junctionsExpanded ? undefined : 0 }}
            >
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ pr: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', pr: 2 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Junction Management</Typography>
                        {!isMobile && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }} onClick={(e) => e.stopPropagation()}>
                                {/* 1. Switches */}
                                {dashViewMode === 'table' && (
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
                                    size="small"
                                    startIcon={<AddIcon />}
                                    onClick={(e) => { e.stopPropagation(); handleAddJunctionClick(); }}
                                    data-testid="add-junction-button"
                                >
                                    Add Junction
                                </Button>

                                {/* 3. Column picker gear — table mode only */}
                                {dashViewMode === 'table' && (
                                    <IconButton size="small" onClick={dashOpenColPicker}>
                                        <SettingsIcon fontSize="small" />
                                    </IconButton>
                                )}

                                {/* 4. View mode toggle — icon-only */}
                                <ToggleButtonGroup
                                    value={dashViewMode}
                                    exclusive
                                    onChange={(_e, v) => { if (v) setDashViewMode(v); }}
                                    aria-label="view mode"
                                    size="small"
                                >
                                    <ToggleButton value="table" title="Table view">
                                        <TableViewIcon />
                                    </ToggleButton>
                                    <ToggleButton value="standard" title="Standard tiles">
                                        <DashboardIcon />
                                    </ToggleButton>
                                    <ToggleButton value="mini" title="Mini tiles">
                                        <ViewModuleIcon />
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
                    ) : (
                        <Box sx={{ p: 2 }}>
                            <JunctionsTable
                                junctions={junctions}
                                filteredJunctions={dashboardJunctions}
                                viewMode={dashViewMode}
                                showRunningOnly={showRunningOnly}
                                visibleColumns={dashVisibleColumns}
                                allColumns={dashAllColumns}
                                sortStorageKey="dashboard_junction_sort"
                                onStartJunction={handleStartJunction}
                                onStopJunction={handleStopJunction}
                                onCloneJunction={handleCloneJunction}
                                onDeleteJunction={handleDeleteJunction}
                                onUpdateSortOrders={handleUpdateSortOrders}
                                onJunctionAdded={refreshJunctions}
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
                allColumns={dashAllColumns}
                orderedColumns={dashOrderedColumns}
                hiddenColumns={dashHiddenColumns}
                anchorEl={dashColAnchor}
                onClose={dashCloseColPicker}
                onToggle={dashToggleColumn}
                onMove={dashMoveColumn}
                onReset={dashResetToDefault}
            />

            {/* Unified Dashboard Settings */}
            <DashboardSettings
                enabled={true}
                defaultExpanded={false}
                storageKey="dashboard_unified_settings_expanded"
                showAsCard={true}
            />

            {/* Active Collectors Card */}
            <ActiveCollectorsCard
                defaultExpanded={collectorsExpanded}
                storageKey="dashboard_collectors_expanded"
                collectors={collectors}
                connectionStatus={connectionStatus}
                isConnected={isConnected}
                connect={wsConnect}
                disconnect={wsDisconnect}
            />

            {/* Active Streams Card */}
            <ActiveStreamsCard
                defaultExpanded={streamsExpanded}
                storageKey="dashboard_streams_expanded"
                streams={streams}
                connectionStatus={connectionStatus}
                isConnected={isConnected}
                connect={wsConnect}
                disconnect={wsDisconnect}
            />

            {/* Add Junction Modal */}
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

export default Dashboard;