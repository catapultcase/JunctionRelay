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

import React, { useState, useEffect, useCallback } from "react";
import {
    Typography,
    Box,
    CircularProgress,
    Snackbar,
    Alert,
    Tooltip,
    Switch,
    AlertColor,
} from "@mui/material";
import { useNavigate } from "react-router-dom";

// Import the JunctionsTable component and its types
import JunctionsTable, { JunctionColumn, Junction } from "../components/JunctionsTable";

// Main Junctions Component
const Junctions = () => {
    const [junctions, setJunctions] = useState<Junction[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<AlertColor>("success");
    const [detailedConnections, setDetailedConnections] = useState<boolean>(() => {
        const savedValue = localStorage.getItem('junctions_detailed_connections');
        return savedValue !== null ? savedValue === 'true' : true;
    });

    const navigate = useNavigate();

    // Save preference when it changes
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
                    // Create a new junctions array with updated statuses
                    const updated = prev.map((j) => {
                        const upd = data.find((r) => r.id === j.id);
                        // Only update if there's a status change
                        return upd && upd.status !== j.status ? { ...j, status: upd.status } : j;
                    });

                    // Only trigger state update if something actually changed
                    if (JSON.stringify(updated) !== JSON.stringify(prev)) {
                        return updated;
                    }
                    return prev; // No changes, return previous state to avoid re-render
                })
            )
            .catch(console.error);
    }, []);

    // Initial data loading - matches Dashboard pattern
    useEffect(() => {
        const init = async () => {
            try {
                setLoading(true);

                // Get both junctions and running status before updating state
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

                // Merge data before setting state - only set state once
                // Add sortOrder if not present
                const mergedJunctions = junctions.map((j: Junction, index: number) => {
                    const u = runningData.find((x: any) => x.id === j.id);
                    // If sortOrder is not defined, use the index as default value
                    const sortOrder = j.sortOrder !== undefined ? j.sortOrder : index;
                    return u ? { ...j, status: u.status, sortOrder } : { ...j, sortOrder };
                });

                // Sort by sortOrder before setting state
                mergedJunctions.sort((a: Junction, b: Junction) => a.sortOrder - b.sortOrder);

                // Update state only once with the properly merged data
                setJunctions(mergedJunctions);

            } catch (err: any) {
                showSnackbar("Error fetching junctions", "error");
                console.error("Error fetching junctions:", err);
            } finally {
                setLoading(false);
            }
        };

        init();

        // Set up polling interval for status updates only - matches Dashboard
        const intervalId = setInterval(() => {
            refreshJunctionsStatus();
        }, 1000);

        // Clean up interval on component unmount
        return () => clearInterval(intervalId);
    }, [refreshJunctionsStatus, showSnackbar]);

    // Handle updating junction sort order - matches Dashboard pattern exactly
    const handleUpdateSortOrders = async (updates: { junctionId: number, sortOrder: number }[]) => {
        try {
            // If there are no updates, return early
            if (!updates || updates.length === 0) return;

            // Log what we're updating
            console.log("Updating sort orders for", updates.length, "junctions");

            // Update the local state for immediate UI feedback
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

            // Add error handling around the API call
            try {
                // Call the API in a single batch - exactly like Dashboard
                const r = await fetch(`/api/junctions/sort-order`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ updates }),
                });
                if (!r.ok) throw new Error("Failed to update junction sort orders");
                return r.json();
            } catch (apiError) {
                // Log but don't crash the UI
                console.warn("Backend sort order update failed:", apiError);
            }
        } catch (error) {
            console.error("Failed to process sort orders:", error);
        }
    };

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

                // Add smart comparison to prevent unnecessary updates
                setJunctions(prev => {
                    if (JSON.stringify(updatedJunctions) !== JSON.stringify(prev)) {
                        return updatedJunctions;
                    }
                    return prev; // No changes, return previous state to avoid re-render
                });
            } else {
                // Add smart comparison here too
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

    const handleStartJunction = async (junctionId: number) => {
        try {
            const response = await fetch(`/api/connections/start/${junctionId}`, { method: "POST" });
            if (response.ok) {
                showSnackbar("Junction started successfully", "success");
                // Update the junction's status in the state immediately
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
                // Update the junction's status in the state immediately
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
            await refreshJunctions(); // Use the new refresh function
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
                await refreshJunctions(); // Use the new refresh function
            } else {
                throw new Error("Failed to delete junction");
            }
        } catch (err) {
            showSnackbar("Error deleting junction", "error");
        }
    };

    // Add a custom renderer for the dashboard toggle column
    const renderDashboardToggle = (junction: Junction) => {
        return (
            <Tooltip title={junction.showOnDashboard ? "Shown on dashboard" : "Hidden from dashboard"}>
                <Switch
                    size="small"
                    checked={junction.showOnDashboard}
                    onChange={(e) => handleToggleDashboard(e, junction)}
                    onClick={(e) => e.stopPropagation()}
                    color="primary"
                    aria-label="Show on dashboard"
                />
            </Tooltip>
        );
    };

    const handleToggleDashboard = async (e: React.ChangeEvent<HTMLInputElement>, junction: Junction) => {
        e.stopPropagation();
        const updatedJunction = {
            ...junction,
            showOnDashboard: e.target.checked
        };

        try {
            const response = await fetch(`/api/junctions/${junction.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedJunction),
            });

            if (response.ok) {
                showSnackbar(`Junction ${e.target.checked ? 'added to' : 'removed from'} dashboard`, "success");
                await refreshJunctions(); // Use the new refresh function
            } else {
                throw new Error("Failed to update junction");
            }
        } catch (err) {
            showSnackbar("Error updating junction dashboard status", "error");
        }
    };

    // Custom column for dashboard toggle
    const additionalColumns: JunctionColumn[] = [
        {
            field: "dashboard",
            label: "Show on Dashboard",
            align: "left",
            renderCell: renderDashboardToggle,
            sortable: false
        }
    ];

    return (
        <Box sx={{ padding: 2 }}>
            <Typography variant="h5" gutterBottom>
                Junctions
            </Typography>

            {loading && junctions.length === 0 ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', padding: 3 }}>
                    <CircularProgress size={24} />
                </Box>
            ) : (
                <JunctionsTable
                    junctions={junctions}
                    additionalColumns={additionalColumns}
                    onStartJunction={handleStartJunction}
                    onStopJunction={handleStopJunction}
                    onCloneJunction={handleCloneJunction}
                    onDeleteJunction={handleDeleteJunction}
                    onUpdateSortOrders={handleUpdateSortOrders}
                    onJunctionAdded={refreshJunctions}
                    detailedConnections={detailedConnections}
                    setDetailedConnections={setDetailedConnections}
                    localStorageKey="junctions_visible_cols"
                    showAddButton={true}
                    showImportButton={false}
                />
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
        </Box>
    );
};

export default Junctions;