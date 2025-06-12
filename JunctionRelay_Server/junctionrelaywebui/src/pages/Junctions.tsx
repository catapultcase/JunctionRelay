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

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
    Button,
    Typography,
    Box,
    CircularProgress,
    Modal,
    TextField,
    Snackbar,
    Alert,
    Tooltip,
    Switch,
    FormControlLabel,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    SelectChangeEvent,
    Checkbox,
    AlertColor,
} from "@mui/material";
import { useNavigate } from "react-router-dom";

// Import API services
import * as junctionService from '../services/junctionApiService';

// Icon imports
import AddIcon from '@mui/icons-material/Add';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

// Import the JunctionsTable component and its types
import JunctionsTable, { JunctionColumn, Junction } from "../components/JunctionsTable";
import { useFeatureFlags } from "../hooks/useFeatureFlags";

// Main Junctions Component
const Junctions = () => {
    const [junctions, setJunctions] = useState<Junction[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [importing, setImporting] = useState<boolean>(false);
    const [addJunctionModalOpen, setAddJunctionModalOpen] = useState<boolean>(false);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<AlertColor>("success");
    const [detailsModalOpen, setDetailsModalOpen] = useState<boolean>(false);
    const [detailedConnections, setDetailedConnections] = useState<boolean>(() => {
        const savedValue = localStorage.getItem('junctions_detailed_connections');
        return savedValue !== null ? savedValue === 'true' : true;
    });

    // State for the add junction form
    const [newJunction, setNewJunction] = useState<Partial<Junction>>({
        name: "",
        description: "",
        type: "COM Junction",
        showOnDashboard: true,
        autoStartOnLaunch: false,
        allTargetsAllData: false,
        deviceLinks: [],
        collectorLinks: [],
        sortOrder: 0,
        gatewayDestination: "", // Add gateway destination field
        selectedGatewayDeviceId: "" // Add selected gateway device ID
    });

    // State for gateway devices
    const [gatewayDevices, setGatewayDevices] = useState<any[]>([]);

    const [error, setError] = useState<string>("");

    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Get feature flags
    const flags = useFeatureFlags();
    const junctionImportExportEnabled = flags?.junction_import_export !== false;

    // Save preference when it changes
    useEffect(() => {
        localStorage.setItem('junctions_detailed_connections', detailedConnections.toString());
    }, [detailedConnections]);

    // Load gateway devices when component mounts
    useEffect(() => {
        const loadGatewayDevices = async () => {
            try {
                const response = await fetch("/api/devices");
                if (response.ok) {
                    const devices = await response.json();
                    // Filter devices where IsGateway = true
                    const gateways = devices.filter((device: any) => device.isGateway === true);
                    setGatewayDevices(gateways);
                }
            } catch (error) {
                console.error("Error loading gateway devices:", error);
            }
        };

        loadGatewayDevices();
    }, []);

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

    const handleAddJunction = () => {
        // Reset the form when opening
        // Get the highest existing sort order
        const highestSortOrder = junctions.length > 0
            ? Math.max(...junctions.map(j => j.sortOrder !== undefined ? j.sortOrder : 0))
            : -1;

        setNewJunction({
            name: "",
            description: "",
            type: "COM Junction",
            showOnDashboard: true,
            autoStartOnLaunch: false,
            allTargetsAllData: false,
            deviceLinks: [],
            collectorLinks: [],
            sortOrder: highestSortOrder + 1,
            gatewayDestination: "",
            selectedGatewayDeviceId: ""
        });
        setError("");
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
            const jsonData = JSON.parse(fileContent);

            await junctionService.importJunction(jsonData);
            await refreshJunctions(); // Use the new refresh function
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

    // Form handlers for the add junction modal
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setNewJunction({ ...newJunction, [name]: value });
    };

    const handleSelectChange = (e: SelectChangeEvent<string>) => {
        const { name, value } = e.target;

        // Handle gateway device selection
        if (name === "selectedGatewayDeviceId") {
            const selectedDevice = gatewayDevices.find(device => device.id.toString() === value);
            setNewJunction({
                ...newJunction,
                [name]: value,
                gatewayDestination: selectedDevice ? selectedDevice.ipAddress : "" // Use IP address, not MAC
            });
        } else {
            setNewJunction({ ...newJunction, [name]: value });
        }
    };

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setNewJunction({ ...newJunction, [name]: checked });
    };

    const handleSave = async (redirect: boolean) => {
        setLoading(true);
        setError("");

        // Basic validation
        if (!newJunction.name) {
            setError("Junction name is required!");
            setLoading(false);
            return;
        }

        // Validate gateway destination for Gateway type
        if (newJunction.type === "Gateway Junction (HTTP)" && !newJunction.selectedGatewayDeviceId) {
            setError("Please select a gateway device for Gateway junctions!");
            setLoading(false);
            return;
        }

        try {
            const response = await fetch("/api/junctions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...newJunction, status: "Idle" }),
            });

            if (!response.ok) {
                throw new Error("Failed to create junction");
            }

            const result = await response.json();
            if (result && typeof result.id === 'number') {
                handleJunctionAdded(result.id, redirect);
            } else {
                setError("Failed to get valid junction ID from response");
                setLoading(false);
            }
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

    const handleJunctionAdded = async (id: number, redirect: boolean) => {
        await refreshJunctions(); // Use the new refresh function
        showSnackbar("Junction added successfully", "success");

        if (redirect) {
            navigate(`/configure-junction/${id}`);
        } else {
            setAddJunctionModalOpen(false);
        }
        setLoading(false);
    };

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

            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Button
                    variant="contained"
                    color="primary"
                    onClick={handleAddJunction}
                    size="small"
                    startIcon={<AddIcon />}
                    sx={{ mr: 2 }}
                >
                    Add Junction
                </Button>

                {junctionImportExportEnabled && (
                    <Button
                        variant="outlined"
                        color="primary"
                        component="label"
                        startIcon={<CloudUploadIcon />}
                        size="small"
                        disabled={importing}
                        sx={{ display: 'flex', alignItems: 'center' }}
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
            </Box>

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
                    detailedConnections={detailedConnections}
                    setDetailedConnections={setDetailedConnections}
                    localStorageKey="junctions_visible_cols"
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

            {/* Add Junction Modal */}
            <Modal open={addJunctionModalOpen} onClose={() => setAddJunctionModalOpen(false)}>
                <Box sx={{
                    position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                    width: '80%', maxWidth: 600, bgcolor: 'background.paper', p: 4, boxShadow: 24, borderRadius: 2
                }}>
                    <Typography variant="h6" gutterBottom>Create New Junction</Typography>
                    {loading ? (
                        <Box sx={{ display: "flex", justifyContent: "center" }}>
                            <CircularProgress size={24} />
                        </Box>
                    ) : (
                        <>
                            {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}

                            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Junction Name"
                                    name="name"
                                    value={newJunction.name}
                                    onChange={handleChange}
                                    required
                                />

                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Description"
                                    name="description"
                                    value={newJunction.description}
                                    onChange={handleChange}
                                    multiline
                                    rows={2}
                                />

                                <FormControl fullWidth size="small">
                                    <InputLabel id="junction-type-label">Junction Type</InputLabel>
                                    <Select
                                        labelId="junction-type-label"
                                        name="type"
                                        value={newJunction.type as string}
                                        onChange={handleSelectChange}
                                        label="Junction Type"
                                    >
                                        <MenuItem value="COM Junction">COM Junction</MenuItem>
                                        <MenuItem value="HTTP Junction">HTTP Junction</MenuItem>
                                        <MenuItem value="MQTT Junction">MQTT Junction</MenuItem>
                                        <MenuItem value="Gateway Junction (HTTP)">Gateway Junction (HTTP)</MenuItem>
                                    </Select>
                                </FormControl>

                                {/* Gateway Device Selection - only show for Gateway type */}
                                {newJunction.type === "Gateway Junction (HTTP)" && (
                                    <>
                                        <FormControl fullWidth size="small">
                                            <InputLabel id="gateway-device-label">Gateway Device</InputLabel>
                                            <Select
                                                labelId="gateway-device-label"
                                                name="selectedGatewayDeviceId"
                                                value={newJunction.selectedGatewayDeviceId || ""}
                                                onChange={handleSelectChange}
                                                label="Gateway Device"
                                                required
                                            >
                                                {gatewayDevices.length === 0 ? (
                                                    <MenuItem disabled>
                                                        No gateway devices found
                                                    </MenuItem>
                                                ) : (
                                                    gatewayDevices.map((device) => (
                                                        <MenuItem key={device.id} value={device.id.toString()}>
                                                            {device.name} ({device.ipAddress})
                                                        </MenuItem>
                                                    ))
                                                )}
                                            </Select>
                                        </FormControl>

                                        {/* Show the IP address that will be used */}
                                        {newJunction.gatewayDestination && (
                                            <TextField
                                                fullWidth
                                                size="small"
                                                label="Gateway IP Address"
                                                value={newJunction.gatewayDestination}
                                                disabled
                                                helperText="IP address of the selected gateway device"
                                            />
                                        )}
                                    </>
                                )}

                                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={newJunction.showOnDashboard || false}
                                                onChange={handleCheckboxChange}
                                                name="showOnDashboard"
                                                size="small"
                                            />
                                        }
                                        label="Show on Dashboard"
                                    />

                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={newJunction.autoStartOnLaunch || false}
                                                onChange={handleCheckboxChange}
                                                name="autoStartOnLaunch"
                                                size="small"
                                            />
                                        }
                                        label="Auto Start on Launch"
                                    />

                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={newJunction.allTargetsAllData || false}
                                                onChange={handleCheckboxChange}
                                                name="allTargetsAllData"
                                                size="small"
                                            />
                                        }
                                        label="All Targets All Data"
                                    />
                                </Box>
                            </Box>

                            <Box sx={{ display: "flex", gap: 2, marginTop: 3, justifyContent: "flex-end" }}>
                                <Button
                                    variant="contained"
                                    onClick={() => handleSave(false)}
                                    size="small"
                                >
                                    Save
                                </Button>

                                <Button
                                    variant="contained"
                                    color="secondary"
                                    onClick={() => handleSave(true)}
                                    size="small"
                                >
                                    Save & Configure
                                </Button>

                                <Button
                                    variant="outlined"
                                    onClick={() => setAddJunctionModalOpen(false)}
                                    size="small"
                                >
                                    Cancel
                                </Button>
                            </Box>
                        </>
                    )}
                </Box>
            </Modal>

            {/* Junction Details Modal */}
            <Modal open={detailsModalOpen} onClose={() => setDetailsModalOpen(false)}>
                <Box sx={{
                    position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                    width: '80%', maxWidth: 700, bgcolor: 'background.paper', p: 4, boxShadow: 24, borderRadius: 2
                }}>
                    <Typography variant="h6" gutterBottom>Junction Details</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Details functionality coming soon...
                    </Typography>

                    <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 3 }}>
                        <Button
                            variant="outlined"
                            onClick={() => setDetailsModalOpen(false)}
                            size="small"
                        >
                            Close
                        </Button>
                    </Box>
                </Box>
            </Modal>
        </Box>
    );
};

export default Junctions;