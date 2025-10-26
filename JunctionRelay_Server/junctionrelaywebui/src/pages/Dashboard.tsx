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

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
    Typography,
    Box,
    CircularProgress,
    Snackbar,
    Alert,
    AlertColor,
    Button,
    IconButton,
    Card,
    CardHeader,
    CardContent,
    Collapse,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import AddIcon from '@mui/icons-material/Add';
import { useTheme, useMediaQuery } from "@mui/material";

// Import icons
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

// Import the JunctionsTable component and its types
import JunctionsTable, { JunctionColumn, Junction } from "../components/JunctionsTable";
import AddJunctionModal from "../components/Junction_AddJunctionModal";
import DashboardSettings from '../components/dashboard/Dashboard_Settings';
import ActiveCollectorsCard from '../components/dashboard/Dashboard_ActiveCollectorsCard';
import ActiveStreamsCard from '../components/dashboard/Dashboard_ActiveStreamsCard';
import DashboardStats from '../components/dashboard/Dashboard_Stats';
import { useDashboardWebSocket } from '../hooks/useDashboardWebSocket';

// Main Dashboard Component
const Dashboard = () => {
    const [junctions, setJunctions] = useState<Junction[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<AlertColor>("success");
    const [detailedConnections, setDetailedConnections] = useState<boolean>(() => {
        const savedValue = localStorage.getItem('dashboard_detailed_connections');
        return savedValue !== null ? savedValue === 'true' : true;
    });

    // Junction creation state - simplified
    const [addJunctionModalOpen, setAddJunctionModalOpen] = useState<boolean>(false);

    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Filter junctions to only show those with showOnDashboard: true
    const dashboardJunctions = useMemo(() => {
        return junctions.filter(junction => junction.showOnDashboard !== false);
    }, [junctions]);

    // Dashboard component does NOT include dashboard toggle column
    const additionalColumns: JunctionColumn[] = []; // Empty - no dashboard column

    // Add cleanup when navigating away from dashboard
    useEffect(() => {
        return () => {
            console.log('Dashboard unmounting - cleaning up resources');
            // Notify child components to cleanup
            window.dispatchEvent(new CustomEvent('dashboard-cleanup'));
        };
    }, []);

    // NEW: Bottom Action Bar event listeners
    useEffect(() => {
        const handleAddJunction = () => {
            console.log('Bottom bar: Add junction requested');
            handleAddJunctionClick();
        };

        const handleRefresh = () => {
            console.log('Bottom bar: Refresh requested');
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
            const response = await fetch("/api/junctions");
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
                const runningData = await runningResponse.json();
                const updatedJunctions = junctionsWithSortOrder.map((j: Junction) => {
                    const running = runningData.find((r: any) => r.id === j.id);
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
        } catch (err: any) {
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

                const junctionsResponse = await fetch("/api/junctions");
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
                    const u = runningData.find((x: any) => x.id === j.id);
                    const sortOrder = j.sortOrder !== undefined ? j.sortOrder : index;
                    return u ? { ...j, status: u.status, sortOrder } : { ...j, sortOrder };
                });

                mergedJunctions.sort((a: Junction, b: Junction) => a.sortOrder - b.sortOrder);

                if (mounted) {
                    setJunctions(mergedJunctions);
                }

            } catch (err: any) {
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
            console.log('Dashboard effect cleanup - clearing interval and marking unmounted');
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
            const response = await fetch(`/api/junctions/${junctionId}`, {
                method: "DELETE"
            });

            if (response.ok) {
                showSnackbar("Junction deleted successfully", "success");
                await refreshJunctions();
            } else {
                throw new Error("Failed to delete junction");
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
        disconnect: wsDisconnect,
        setPollRate,
        currentPollRate
    } = useDashboardWebSocket({
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

            {/* Junction Management Card - matches ActiveCollectors/Streams pattern */}
            <Card sx={{ mb: 3 }}>
                <CardHeader
                    title={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <AccountTreeIcon color="primary" />
                            <Typography variant="h6">
                                Junction Management
                            </Typography>
                        </Box>
                    }
                    action={
                        <IconButton onClick={() => setJunctionsExpanded(!junctionsExpanded)} size="small">
                            {junctionsExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                    }
                    sx={{
                        cursor: 'pointer',
                        pb: junctionsExpanded ? 1 : 2,
                        '&:hover': { backgroundColor: 'action.hover' }
                    }}
                    onClick={() => setJunctionsExpanded(!junctionsExpanded)}
                />

                <Collapse in={junctionsExpanded}>
                    {junctionsExpanded && (
                        <CardContent sx={{ pt: 0 }}>
                            {/* Junction Management Buttons - only show on desktop */}
                            {!isMobile && (
                                <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: 'wrap' }}>
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        onClick={handleAddJunctionClick}
                                        size="small"
                                        startIcon={<AddIcon />}
                                        data-testid="add-junction-button"
                                    >
                                        Add Junction
                                    </Button>
                                </Box>
                            )}

                            {/* Junctions Table */}
                            {loading && junctions.length === 0 ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', padding: 3 }}>
                                    <CircularProgress size={24} />
                                </Box>
                            ) : (
                                <JunctionsTable
                                    junctions={junctions}
                                    filteredJunctions={dashboardJunctions}
                                    additionalColumns={additionalColumns}
                                    onStartJunction={handleStartJunction}
                                    onStopJunction={handleStopJunction}
                                    onCloneJunction={handleCloneJunction}
                                    onDeleteJunction={handleDeleteJunction}
                                    onUpdateSortOrders={handleUpdateSortOrders}
                                    onJunctionAdded={refreshJunctions}
                                    onAutoStartToggle={handleAutoStartToggle}
                                    detailedConnections={detailedConnections}
                                    setDetailedConnections={setDetailedConnections}
                                    localStorageKey="dashboard_visible_junction_cols"
                                    title="Junctions"
                                    showAddButton={false}
                                    showImportButton={false}
                                    viewModeStorageKey="dashboard_junctions_view_mode"
                                    showRunningOnlyStorageKey="dashboard_show_running_only"
                                    detailedConnectionsStorageKey="dashboard_detailed_connections"
                                />
                            )}
                        </CardContent>
                    )}
                </Collapse>
            </Card>

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