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

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
    Typography,
    Box,
    CircularProgress,
    Snackbar,
    Alert,
    AlertColor,
    Button,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import AddIcon from '@mui/icons-material/Add';
import { useTheme, useMediaQuery } from "@mui/material";

// Import the JunctionsTable component and its types
import JunctionsTable, { JunctionColumn, Junction } from "../components/JunctionsTable";
import AddJunctionModal from "../components/AddJunctionModal";
import DashboardSettings from '../components/DashboardSettings';
import ActiveCollectorsCard from '../components/ActiveCollectorsCard';
import ActiveStreamsCard from '../components/ActiveStreamsCard';

// Main Dashboard Component
const Dashboard = () => {
    const [junctions, setJunctions] = useState<Junction[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<AlertColor>("success");
    const [detailedConnections, setDetailedConnections] = useState<boolean>(() => {
        const savedValue = localStorage.getItem('junctions_detailed_connections');
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

    // Save preferences when they change
    useEffect(() => {
        localStorage.setItem('junctions_detailed_connections', detailedConnections.toString());
    }, [detailedConnections]);

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

    // Initial data loading
    useEffect(() => {
        const init = async () => {
            try {
                setLoading(true);

                const junctionsResponse = await fetch("/api/junctions");
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
                    const u = runningData.find((x: any) => x.id === j.id);
                    const sortOrder = j.sortOrder !== undefined ? j.sortOrder : index;
                    return u ? { ...j, status: u.status, sortOrder } : { ...j, sortOrder };
                });

                mergedJunctions.sort((a: Junction, b: Junction) => a.sortOrder - b.sortOrder);
                setJunctions(mergedJunctions);

            } catch (err: any) {
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

    // Remove these useEffects since setters are no longer used
    // useEffect(() => {
    //     localStorage.setItem('dashboard_collectors_expanded', collectorsExpanded.toString());
    // }, [collectorsExpanded]);

    // useEffect(() => {
    //     localStorage.setItem('dashboard_streams_expanded', streamsExpanded.toString());
    // }, [streamsExpanded]);

    return (
        <Box sx={{ padding: 2 }}>
            {/* Junction Management Section - Hide on mobile since bottom action bar handles it */}
            {!isMobile && (
                <>
                    <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
                        <Typography variant="h6">Junction Management</Typography>
                    </Box>
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
                </>
            )}

            {loading && junctions.length === 0 ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', padding: 3 }}>
                    <CircularProgress size={24} />
                </Box>
            ) : (
                <JunctionsTable
                    junctions={junctions}
                    filteredJunctions={dashboardJunctions}  // PASS FILTERED JUNCTIONS
                    additionalColumns={additionalColumns}   // EMPTY - no dashboard column
                    onStartJunction={handleStartJunction}
                    onStopJunction={handleStopJunction}
                    onCloneJunction={handleCloneJunction}
                    onDeleteJunction={handleDeleteJunction}
                    onUpdateSortOrders={handleUpdateSortOrders}
                    onJunctionAdded={refreshJunctions}
                    detailedConnections={detailedConnections}
                    setDetailedConnections={setDetailedConnections}
                    localStorageKey="dashboard_visible_junction_cols"
                    title="Junctions"
                    showAddButton={false}
                    showImportButton={false}
                    viewModeStorageKey="dashboard_junctions_view_mode"
                />
            )}

            {/* NEW: Unified Dashboard Settings - replaces SharedWebSocketSettings */}
            <DashboardSettings
                enabled={collectorsExpanded || streamsExpanded}
                defaultExpanded={false}
                storageKey="dashboard_unified_settings_expanded"
            />

            {/* UPDATED: Simplified Active Collectors Card */}
            <ActiveCollectorsCard
                defaultExpanded={collectorsExpanded}
                storageKey="dashboard_collectors_expanded"
            />

            {/* UPDATED: Simplified Active Streams Card */}
            <ActiveStreamsCard
                defaultExpanded={streamsExpanded}
                storageKey="dashboard_streams_expanded"
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