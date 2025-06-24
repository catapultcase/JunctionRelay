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

import { useState, useEffect, useMemo } from "react";
import {
    Button,
    Typography,
    Box,
    CircularProgress,
    Paper,
    Snackbar,
    Alert,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Divider,
    Chip
} from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";

// Import the EnhancedSensorsTable component
import EnhancedSensorsTable from "../components/EnhancedSensorsTable";

// Import icons
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import StorageIcon from '@mui/icons-material/Storage';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import SettingsIcon from '@mui/icons-material/Settings';
import AddIcon from '@mui/icons-material/Add';

const ConfigureCollector = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [collector, setCollector] = useState<any>(null);
    const [storedSensors, setStoredSensors] = useState<any[]>([]);
    const [fetchedSensors, setFetchedSensors] = useState<any[]>([]);
    const [fetchingSensors, setFetchingSensors] = useState(false);
    const [services, setServices] = useState<any[]>([]);
    const [selectedService, setSelectedService] = useState("");
    const [error, setError] = useState("");
    const [activeTab, setActiveTab] = useState<"stored" | "delta">("stored");

    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState("");
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "error" | "info" | "warning">("success");

    // Removed unused currentTime state and associated useEffect

    // Define the default columns for each view
    const getDefaultVisibleColumns = (viewType: "stored" | "delta") => {
        // Both views share the same column set for consistency
        return [
            "id",
            "externalId",
            "name",
            "componentName",
            "value",
            "unit",
            "lastUpdated",
            "actions"
        ];
    };

    const showSnackbar = (message: string, severity: "success" | "error" | "info" | "warning" = "success") => {
        setSnackbarMessage(message);
        setSnackbarSeverity(severity);
        setSnackbarOpen(true);
    };

    // Removed unused formatRelativeTime function

    // Fetch the collector details
    const fetchCollector = async () => {
        try {
            const rsp = await fetch(`/api/collectors/${id}`);
            if (!rsp.ok) throw new Error();
            setCollector(await rsp.json());
        } catch {
            setError("Error fetching collector data.");
        }
    };

    // Fetch sensors already stored in the database
    const fetchStoredSensors = async () => {
        try {
            const rsp = await fetch(`/api/collectors/${id}/sensors`);
            if (!rsp.ok) throw new Error();
            const data = await rsp.json();

            // Transform the data to match the expected structure for EnhancedSensorsTable
            const transformedSensors = (data.storedSensors || []).map((sensor: any) => ({
                Id: sensor.id,
                name: sensor.name,
                sensorTag: sensor.externalId,
                deviceName: "Collector",
                componentName: sensor.sensorType,
                externalId: sensor.externalId,
                IsSelected: true,
                unit: sensor.unit,
                value: sensor.value,
                sensorOrder: sensor.sensorOrder || 0,
                lastUpdated: sensor.lastUpdated,
                mqttTopic: sensor.mqttTopic,
                mqttQoS: sensor.mqttQoS
            }));

            setStoredSensors(transformedSensors);
        } catch {
            setError("Error fetching stored sensors.");
        }
    };

    // Fetch available services
    const fetchServices = async () => {
        try {
            const rsp = await fetch(`/api/services`);
            if (!rsp.ok) throw new Error();
            setServices(await rsp.json());
        } catch {
            setError("Error fetching services.");
        }
    };

    // Initial data loading
    useEffect(() => {
        const load = async () => {
            try {
                await fetchCollector();
                await fetchStoredSensors();
                await fetchServices();
            } catch (err) {
                console.error("Error during initial load:", err);
            } finally {
                setLoading(false);
            }
        };

        if (id) {
            load();
        } else {
            setError("Collector ID not provided.");
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]); // We use eslint-disable-next-line because including all dependencies would cause unnecessary re-renders

    // Fetch new sensors from the collector that are not already in the DB
    const fetchDeltaSensors = async () => {
        setFetchingSensors(true);
        try {
            const rsp = await fetch(`/api/collectors/${id}/sensors/delta`);
            if (!rsp.ok) throw new Error();
            const data = await rsp.json();
            const newOnes = data.filter(
                (s: any) => !storedSensors.some((st) => st.externalId === s.externalId)
            );

            // Transform the data to match the expected structure for EnhancedSensorsTable
            const transformedSensors = newOnes.map((sensor: any) => ({
                Id: sensor.id || `temp-${Math.random().toString(36).substring(2, 11)}`,
                name: sensor.name,
                sensorTag: sensor.externalId,
                deviceName: "Collector (New)",
                componentName: sensor.sensorType,
                externalId: sensor.externalId,
                IsSelected: false,
                unit: sensor.unit,
                value: sensor.value,
                sensorOrder: 0,
                lastUpdated: sensor.lastUpdated,
                mqttTopic: sensor.mqttTopic,
                mqttQoS: sensor.mqttQoS
            }));

            setFetchedSensors(transformedSensors);
            setActiveTab("delta"); // Switch to delta tab when new sensors are found
            await fetchStoredSensors(); // refresh DB view

            showSnackbar(`Found ${transformedSensors.length} new sensors`, transformedSensors.length > 0 ? "info" : "success");
        } catch {
            setError("Error fetching delta sensors.");
            showSnackbar("Error fetching new sensors", "error");
        } finally {
            setFetchingSensors(false);
        }
    };

    // Fixed handleAddSensor function - updates JSON payload to match API expectations
    const handleAddSensor = async (sensorId: number | string) => {
        try {
            const sensor = fetchedSensors.find((s) => s.Id === sensorId);
            if (!sensor) throw new Error("Sensor not found");

            // Create payload without the "newSensor" wrapper
            const payload = {
                name: sensor.name,
                externalId: sensor.externalId || sensor.sensorTag,
                sensorType: sensor.componentName,
                value: sensor.value,
                unit: sensor.unit || "",
                componentName: sensor.componentName || "",
                lastUpdated: sensor.lastUpdated || new Date().toISOString(),
                collectorId: Number(id),
                sensorTag: sensor.sensorTag || sensor.externalId || "",
                deviceName: sensor.deviceName || "Collector",
                category: sensor.componentName || "Sensor",
                mqttTopic: sensor.mqttTopic || "",
                mqttQoS: sensor.mqttQoS ?? 0 // Default to 0 if undefined
            };

            console.log("Sending payload to server:", JSON.stringify(payload, null, 2));

            const rsp = await fetch(`/api/sensors/collectors/${id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload), // Send the unwrapped payload
            });

            if (!rsp.ok) {
                let errorMsg = `HTTP Error: ${rsp.status} ${rsp.statusText}`;
                try {
                    const errorData = await rsp.text();
                    console.error("Server error details:", errorData);
                    errorMsg += ` - ${errorData}`;
                } catch (e) {
                    // Ignore text parsing error
                }
                throw new Error(errorMsg);
            }

            // Update UI state
            setFetchedSensors(fetchedSensors.filter((s) => s.Id !== sensorId));
            await fetchStoredSensors(); // Refresh stored sensors

            showSnackbar("Sensor added successfully.", "success");
        } catch (error) {
            console.error("Error adding sensor:", error);
            showSnackbar(`Error adding sensor: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
        }
    };

    // Update the handleAddAllSensors function as well
    const handleAddAllSensors = async () => {
        if (fetchedSensors.length === 0) {
            showSnackbar("No new sensors to add", "info");
            return;
        }

        // Show loading state
        setLoading(true);

        try {
            // Create an array of promises for adding each sensor
            const addPromises = fetchedSensors.map(async (sensor) => {
                // Create unwrapped payload for each sensor
                const sensorPayload = {
                    name: sensor.name,
                    externalId: sensor.externalId || sensor.sensorTag,
                    sensorType: sensor.componentName,
                    value: sensor.value,
                    unit: sensor.unit || "",
                    componentName: sensor.componentName || "",
                    lastUpdated: sensor.lastUpdated || new Date().toISOString(),
                    collectorId: Number(id),
                    sensorTag: sensor.sensorTag || sensor.externalId || "",
                    deviceName: sensor.deviceName || "Collector",
                    category: sensor.componentName || "Sensor"
                };

                try {
                    const rsp = await fetch(`/api/sensors/collectors/${id}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(sensorPayload), // Send the unwrapped payload
                    });

                    if (!rsp.ok) {
                        const errorText = await rsp.text();
                        console.error(`Error response for ${sensor.name}:`, errorText);
                        throw new Error(`Failed to add sensor ${sensor.name}`);
                    }

                    return { success: true, sensor };
                } catch (error) {
                    console.error(`Error adding sensor ${sensor.name}:`, error);
                    return { success: false, sensor };
                }
            });

            // Wait for all add operations to complete
            const results = await Promise.all(addPromises);

            // Count successes and failures
            const successCount = results.filter(r => r.success).length;
            const failureCount = results.length - successCount;

            // Clear the fetchedSensors list and refresh stored sensors
            setFetchedSensors([]);
            await fetchStoredSensors();

            // Switch back to stored tab
            setActiveTab("stored");

            // Show appropriate message based on results
            if (failureCount === 0) {
                showSnackbar(`Successfully added all ${successCount} sensors`, "success");
            } else if (successCount === 0) {
                showSnackbar(`Failed to add any sensors`, "error");
            } else {
                showSnackbar(`Added ${successCount} sensors, failed to add ${failureCount}`, "warning");
            }
        } catch (error) {
            console.error("Error in bulk add operation:", error);
            showSnackbar("An error occurred while adding sensors", "error");
        } finally {
            // Reset loading state
            setLoading(false);
        }
    };

    // Handle deleting a sensor from the database
    const handleDeleteSensor = async (sensorId: number) => {
        try {
            const rsp = await fetch(`/api/sensors/${sensorId}`, { method: "DELETE" });
            if (!rsp.ok) throw new Error();

            setStoredSensors(storedSensors.filter((s) => s.Id !== sensorId));
            showSnackbar("Sensor deleted.", "success");
        } catch {
            showSnackbar("Error deleting sensor.", "error");
        }
    };

    // Navigation and collector management
    const handleBack = () => navigate("/collectors");

    const handleDeleteCollector = async () => {
        // Implement collector deletion logic here
        // This would typically involve a confirmation dialog
        showSnackbar("Delete functionality not implemented", "warning");
    };

    // Mock functions required by EnhancedSensorsTable but not used in this context
    const noopAsync = async () => { /* Do nothing */ };
    const noop = () => { /* Do nothing */ };

    // Custom action renderers for the EnhancedSensorsTable
    const renderStoredSensorActions = (sensor: any) => (
        <Button
            size="small"
            variant="contained"
            color="error"
            onClick={() => handleDeleteSensor(sensor.Id)}
            startIcon={<DeleteIcon />}
        >
            Delete
        </Button>
    );

    const renderDeltaSensorActions = (sensor: any) => (
        <Button
            size="small"
            variant="contained"
            color="primary"
            onClick={() => handleAddSensor(sensor.Id)}
            startIcon={<AddIcon />}
        >
            Add to DB
        </Button>
    );

    // Filter and customize sensors for the active tab
    const displaySensors = useMemo(() => {
        return activeTab === "stored" ? storedSensors : fetchedSensors;
    }, [activeTab, storedSensors, fetchedSensors]);

    return (
        <Box sx={{ p: 2 }}>
            {/* Header with title and action buttons */}
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
                <Typography variant="h4">
                    Configure Collector
                </Typography>

                <Box sx={{ display: "flex", gap: 2 }}>
                    <Button
                        variant="outlined"
                        startIcon={<ArrowBackIcon />}
                        onClick={handleBack}
                    >
                        Back to Collectors
                    </Button>

                    <Button
                        variant="outlined"
                        color="error"
                        startIcon={<DeleteIcon />}
                        onClick={handleDeleteCollector}
                    >
                        Delete Collector
                    </Button>
                </Box>
            </Box>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                    <CircularProgress />
                    <Typography sx={{ ml: 2 }}>Loading…</Typography>
                </Box>
            ) : error ? (
                <Typography color="error">{error}</Typography>
            ) : (
                <>
                    {/* Collector Information Card */}
                    <Paper elevation={2} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
                        <Typography variant="h6" gutterBottom sx={{
                            display: 'flex',
                            alignItems: 'center',
                            mb: 2
                        }}>
                            <SettingsIcon sx={{ mr: 1 }} />
                            Collector Configuration
                        </Typography>

                        <Divider sx={{ my: 2 }} />

                        {/* Using Box with flexbox instead of Grid */}
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {/* Collector details - left side */}
                            <Box sx={{ flex: '1 1 300px', minWidth: '300px' }}>
                                <Typography variant="subtitle1" fontWeight="bold">{collector.name}</Typography>
                                <Typography><strong>URL:</strong> {collector.url}</Typography>
                                <Typography><strong>Token:</strong> {collector.accessToken ? "••••••" : "N/A"}</Typography>
                                <Typography><strong>Type:</strong> {collector.collectorType}</Typography>
                            </Box>

                            {/* Service selection and fetch button - right side */}
                            <Box sx={{ flex: '1 1 300px', minWidth: '300px' }}>
                                <FormControl fullWidth sx={{ mb: 2 }}>
                                    <InputLabel id="service-label">Associated Service</InputLabel>
                                    <Select
                                        labelId="service-label"
                                        value={selectedService}
                                        onChange={(e) => setSelectedService(e.target.value)}
                                        disabled={!services.length}
                                        size="small"
                                    >
                                        <MenuItem value="">
                                            <em>None</em>
                                        </MenuItem>
                                        {services.map((svc) => (
                                            <MenuItem key={svc.id} value={svc.id}>{svc.name}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>

                                <Button
                                    variant="contained"
                                    onClick={fetchDeltaSensors}
                                    disabled={fetchingSensors}
                                    startIcon={fetchingSensors ? <CircularProgress size={20} /> : <RefreshIcon />}
                                    fullWidth
                                >
                                    {fetchingSensors ? "Fetching Sensors..." : "Fetch New Sensors"}
                                </Button>
                            </Box>
                        </Box>
                    </Paper>

                    {/* Tab Selection with Add All button */}
                    <Box sx={{ display: 'flex', mb: 2, justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex' }}>
                            <Button
                                variant={activeTab === "stored" ? "contained" : "outlined"}
                                onClick={() => setActiveTab("stored")}
                                startIcon={<StorageIcon />}
                                sx={{ mr: 1 }}
                            >
                                Stored Sensors ({storedSensors.length})
                            </Button>

                            <Button
                                variant={activeTab === "delta" ? "contained" : "outlined"}
                                onClick={() => setActiveTab("delta")}
                                startIcon={<NewReleasesIcon />}
                                disabled={fetchedSensors.length === 0}
                                color={fetchedSensors.length > 0 ? "primary" : "inherit"}
                            >
                                New Sensors {fetchedSensors.length > 0 && `(${fetchedSensors.length})`}
                                {fetchedSensors.length > 0 && (
                                    <Chip
                                        label={fetchedSensors.length}
                                        color="error"
                                        size="small"
                                        sx={{ ml: 1, height: 20 }}
                                    />
                                )}
                            </Button>
                        </Box>

                        {/* Add All button - only show when there are new sensors and we're on the delta tab */}
                        {fetchedSensors.length > 0 && activeTab === "delta" && (
                            <Button
                                variant="contained"
                                color="primary"
                                onClick={handleAddAllSensors}
                                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <AddIcon />}
                                disabled={loading}
                            >
                                {loading ? "Adding..." : `Add All ${fetchedSensors.length} Sensors`}
                            </Button>
                        )}
                    </Box>

                    {/* Sensors Table */}
                    {displaySensors.length > 0 ? (
                        <Box sx={{ mb: 3 }}>
                            <EnhancedSensorsTable
                                availableSensors={displaySensors}
                                handleSensorSelect={noopAsync}
                                handleSensorOrderChange={noopAsync}
                                handleSensorTagChange={noopAsync}
                                getSensorOrder={(sensor) => sensor.sensorOrder || 0}
                                getSensorTag={(sensor) => sensor.sensorTag || ''}
                                sensorTargets={{}}
                                targets={[]}
                                removeSensorTarget={(junctionId, sensorId, deviceId) => noopAsync()}
                                assignSensorTarget={(junctionId, sensorId, deviceId, screenId) => noopAsync()}
                                setCurrentSensor={noop}
                                setCurrentTargetDevice={noop}
                                setScreenSelectionModalOpen={noop}
                                showSnackbar={showSnackbar}
                                setSensorTargets={noop}
                                junctionId={0} // Add dummy junctionId since we don't need it for collectors

                                // Custom props for this specific usage
                                hideTargetsColumn={true}
                                hideSelectionColumn={true}
                                hideSourceColumn={true}
                                customTitle={activeTab === "stored" ? "Stored Sensors" : "New Sensors Available"}
                                customIcon={activeTab === "stored" ? <StorageIcon sx={{ mr: 1 }} /> : <NewReleasesIcon sx={{ mr: 1 }} />}
                                customActions={activeTab === "stored" ? renderStoredSensorActions : renderDeltaSensorActions}
                                readOnly={true}
                                showLastUpdated={true}
                                hideFilters={false}

                                // Use different local storage keys for each view to maintain separate column preferences
                                localStorageKey={`collector_${id}_${activeTab}_sensors_columns`}

                                // Pass in default visible columns for this view
                                defaultVisibleColumns={getDefaultVisibleColumns(activeTab)}
                            />
                        </Box>
                    ) : (
                        <Paper
                            elevation={2}
                            sx={{ p: 3, mb: 3, borderRadius: 2, textAlign: 'center' }}
                        >
                            <Typography variant="body1" color="text.secondary">
                                {activeTab === "stored"
                                    ? "No sensors are currently stored in the database."
                                    : "No new sensors available. Click 'Fetch New Sensors' to check for updates."}
                            </Typography>
                            {activeTab === "stored" && (
                                <Button
                                    variant="contained"
                                    onClick={fetchDeltaSensors}
                                    disabled={fetchingSensors}
                                    startIcon={fetchingSensors ? <CircularProgress size={20} /> : <RefreshIcon />}
                                    sx={{ mt: 2 }}
                                >
                                    {fetchingSensors ? "Fetching Sensors..." : "Fetch New Sensors"}
                                </Button>
                            )}
                        </Paper>
                    )}
                </>
            )}

            {/* Notification Snackbar */}
            <Snackbar
                open={snackbarOpen}
                autoHideDuration={3000}
                onClose={() => setSnackbarOpen(false)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert severity={snackbarSeverity} onClose={() => setSnackbarOpen(false)}>
                    {snackbarMessage}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default ConfigureCollector;