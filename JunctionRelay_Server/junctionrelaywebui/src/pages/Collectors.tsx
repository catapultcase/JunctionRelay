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

import React, { useState, useEffect } from "react";
import {
    Button,
    Typography,
    Box,
    CircularProgress,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Modal,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    SelectChangeEvent,
    Snackbar,
    Alert,
    Tooltip,
    IconButton
} from "@mui/material";
import { useNavigate } from "react-router-dom";
// Icon imports
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

// AddCollector Modal Component
const AddCollectorModal: React.FC<{
    open: boolean,
    onClose: () => void,
    onCollectorAdded: () => void,
    onCollectorAddedAndConfigure: (collectorId: number) => void
}> = ({ open, onClose, onCollectorAdded, onCollectorAddedAndConfigure }) => {
    const [loading, setLoading] = useState<boolean>(false);
    const [configureAfterAdd, setConfigureAfterAdd] = useState<boolean>(false);
    const [collector, setCollector] = useState<any>({
        name: "HomeAssistant",
        url: "http://10.168.1.17:8123",
        accessToken: "",
        collectorType: "HomeAssistant",
        serviceId: ""
    });
    const [error, setError] = useState<string>("");
    const [services, setServices] = useState<any[]>([]); // Store services for picklist

    // Handle input change
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<any>) => {
        const { name, value } = e.target;
        setCollector({ ...collector, [name]: value });
    };

    // Handle form submission
    const handleAddCollector = async (configureAfter: boolean = false) => {
        setLoading(true);
        setError("");
        setConfigureAfterAdd(configureAfter);

        // Basic validation
        if (!collector.name || !collector.collectorType) {
            setError("Name and Type are required!");
            setLoading(false);
            return;
        }

        if (
            (collector.collectorType === "HomeAssistant" || collector.collectorType === "LibreHardwareMonitor") &&
            !collector.url
        ) {
            setError("URL is required for this collector type.");
            setLoading(false);
            return;
        }

        if (collector.collectorType === "HomeAssistant" && !collector.accessToken) {
            setError("Access Token is required for HomeAssistant.");
            setLoading(false);
            return;
        }

        // URL pattern only applies if a URL is required and present
        const urlPattern = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;
        if (
            (collector.collectorType === "HomeAssistant" || collector.collectorType === "LibreHardwareMonitor") &&
            collector.url &&
            !urlPattern.test(collector.url)
        ) {
            setError("Please enter a valid URL.");
            setLoading(false);
            return;
        }

        // If the collector type is MQTT, ensure serviceId is provided
        if (collector.collectorType === "MQTT" && !collector.serviceId) {
            setError("Service ID is required for MQTT collectors.");
            setLoading(false);
            return;
        }

        // Ensure serviceId is null for non-MQTT collectors
        if (collector.collectorType !== "MQTT") {
            collector.serviceId = null;  // Set to null if not MQTT
        }

        // Send the request
        try {
            const response = await fetch("/api/collectors", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...collector,
                    status: "Active"
                }),
            });

            // First check if the response is ok
            if (response.ok) {
                const result = await response.json();
                // If we want to configure after adding, use the new callback
                if (configureAfter && result && result.id) {
                    onCollectorAddedAndConfigure(result.id);
                } else {
                    onCollectorAdded(); // Otherwise just refresh the collectors list
                }
                onClose(); // Close the modal in both cases
                return;
            }

            // If we get a 500 Internal Server Error and it's likely a unique constraint violation
            if (response.status === 500) {
                // For Internal Server Error, we'll assume it's likely a duplicate collector name
                setError("A collector with this name already exists. Collector names must be unique.");
                setLoading(false);
                return;
            }

            // For other status codes, try to parse the response
            let errorMessage = "Error adding collector";
            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorMessage;
            } catch (parseError) {
                // If response is not valid JSON, use the status text
                errorMessage = response.statusText || errorMessage;

                // Try to get the response text if JSON parsing failed
                try {
                    const responseText = await response.text();
                    console.log("Error response text:", responseText);

                    // Check for specific text patterns that might indicate a unique constraint violation
                    if (
                        responseText.includes("unique") ||
                        responseText.includes("duplicate") ||
                        responseText.toLowerCase().includes("already exists") ||
                        responseText.includes("constraint")
                    ) {
                        errorMessage = "A collector with this name already exists. Collector names must be unique.";
                    }
                } catch (textError) {
                    // If all else fails, use our friendly default error
                    console.error("Error getting response text:", textError);
                }
            }

            throw new Error(errorMessage);
        } catch (err: any) {
            // If the error message contains any indication of a unique constraint
            if (
                err.message.includes("unique") ||
                err.message.includes("duplicate") ||
                err.message.toLowerCase().includes("already exists") ||
                err.message.includes("constraint") ||
                err.message.includes("Internal Server Error")
            ) {
                setError("A collector with this name already exists. Collector names must be unique.");
            } else {
                setError(err.message);
            }
            console.error("Error adding collector:", err);
        } finally {
            setLoading(false);
        }
    };

    // Fetch services for the picklist when MQTT is selected
    const fetchServices = async () => {
        try {
            const servicesResponse = await fetch(`/api/services`); // Assuming the endpoint to fetch services
            if (!servicesResponse.ok) {
                throw new Error("Failed to fetch services");
            }
            const servicesData = await servicesResponse.json();
            setServices(servicesData); // Set the services to the state
        } catch (err) {
            setError("Error fetching services.");
            console.error(err);
        }
    };

    // Set default URL based on selected collector type
    useEffect(() => {
        if (collector.collectorType === "MQTT") {
            fetchServices(); // Fetch services when MQTT is selected
        }
        if (collector.collectorType === "LibreHardwareMonitor") {
            setCollector((prev: any) => ({
                ...prev,
                name: "LibreHardwareMonitor",
                url: "http://localhost:8085",
                accessToken: "" // AccessToken is not needed for LibreHardwareMonitor
            }));
        } else if (collector.collectorType === "HomeAssistant") {
            setCollector((prev: any) => ({
                ...prev,
                name: "HomeAssistant",
                url: "http://10.168.1.17:8123",
                accessToken: ""
            }));
        } else if (collector.collectorType === "UptimeKuma") {
            setCollector((prev: any) => ({
                ...prev,
                name: "Uptime Kuma",
                url: "http://localhost:3001/metrics",
                accessToken: ""
            }));       
        } else if (collector.collectorType === "Host") {
            setCollector((prev: any) => ({
                ...prev,
                name: "Host Device",
                url: "localhost",
                accessToken: ""
            }));
        } else if (collector.collectorType === "NeoPixelColor") {
            setCollector((prev: any) => ({
                ...prev,
                name: "NeoPixel Color",
                url: "",
                accessToken: ""
            }));
        } else if (collector.collectorType === "RateTester") {
            setCollector((prev: any) => ({
                ...prev,
                name: "Rate Tester",
                url: "",
                accessToken: "",
                pollRate: 1000,
                sendRate: 1000
            }));
        } else {
            setCollector((prev: any) => ({
                ...prev,
                name: "",
                url: "",
                accessToken: ""
            }));
        }
    }, [collector.collectorType]);

    return (
        <Modal open={open} onClose={onClose}>
            <Box sx={{
                position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                width: '80%', maxWidth: 600, bgcolor: 'background.paper', p: 4, boxShadow: 24, borderRadius: 2
            }}>
                <Typography variant="h6" gutterBottom>Add Collector</Typography>
                {loading ? (
                    <Box sx={{ display: "flex", justifyContent: "center" }}>
                        <CircularProgress size={24} />
                    </Box>
                ) : (
                    <>
                        {error && (
                            <Alert
                                severity="error"
                                sx={{
                                    mb: 2,
                                    '& .MuiAlert-message': {
                                        fontWeight: 'medium'
                                    }
                                }}
                            >
                                {error}
                            </Alert>
                        )}

                        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            {/* Collector Type Dropdown */}
                            <FormControl fullWidth size="small">
                                <InputLabel id="collector-type-label">Collector Type</InputLabel>
                                <Select
                                    labelId="collector-type-label"
                                    name="collectorType"
                                    value={collector.collectorType}
                                    onChange={handleChange}
                                    label="Collector Type"
                                >
                                    <MenuItem value="MQTT">Connect To MQTT Service</MenuItem>
                                    <MenuItem value="Host">Host Device</MenuItem>
                                    <MenuItem value="HomeAssistant">HomeAssistant</MenuItem>
                                    <MenuItem value="LibreHardwareMonitor">LibreHardwareMonitor</MenuItem>
                                    <MenuItem value="NeoPixelColor">NeoPixelColor</MenuItem>
                                    <MenuItem value="RateTester">Rate Tester</MenuItem>
                                    <MenuItem value="UptimeKuma">Uptime Kuma</MenuItem>
                                </Select>
                            </FormControl>

                            <TextField
                                fullWidth
                                size="small"
                                label="Collector Name"
                                name="name"
                                value={collector.name}
                                onChange={handleChange}
                                required
                                error={!!error && error.includes("name")}
                                helperText={error && error.includes("name") ? "Name must be unique" : ""}
                            />

                            {/* Only show URL if HomeAssistant or LibreHardwareMonitor */}
                                {(collector.collectorType === "HomeAssistant" || collector.collectorType === "LibreHardwareMonitor" || collector.collectorType === "UptimeKuma") && (
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="URL"
                                        name="url"
                                        value={collector.url}
                                        onChange={handleChange}
                                        required
                                    />
                                )}

                            {/* Only show access token if required */}
                            {collector.collectorType === "HomeAssistant" && (
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Access Token"
                                    name="accessToken"
                                    value={collector.accessToken}
                                    onChange={handleChange}
                                    required
                                    type="password"
                                />
                            )}

                            {/* MQTT Service Dropdown */}
                            {collector.collectorType === "MQTT" && (
                                <FormControl fullWidth size="small">
                                    <InputLabel id="service-select-label">Select Service</InputLabel>
                                    <Select
                                        labelId="service-select-label"
                                        value={collector.serviceId}
                                        onChange={handleChange}
                                        name="serviceId"
                                        required
                                        label="Select Service"
                                    >
                                        {services.length > 0 ? (
                                            services.map((service) => (
                                                <MenuItem key={service.id} value={service.id}>
                                                    {service.name}
                                                </MenuItem>
                                            ))
                                        ) : (
                                            <MenuItem disabled>No services available</MenuItem>
                                        )}
                                    </Select>
                                </FormControl>
                            )}
                        </Box>

                        <Box sx={{ display: "flex", gap: 2, marginTop: 2 }}>
                            <Button
                                variant="contained"
                                onClick={() => handleAddCollector(false)}
                                size="small"
                                startIcon={<AddIcon />}
                                disabled={loading}
                            >
                                {loading && !configureAfterAdd ? "Adding..." : "Add Collector"}
                            </Button>
                            <Button
                                variant="contained"
                                onClick={() => handleAddCollector(true)}
                                size="small"
                                color="secondary"
                                startIcon={<EditIcon />}
                                disabled={loading}
                            >
                                {loading && configureAfterAdd ? "Adding..." : "Add & Configure"}
                            </Button>
                            <Button
                                variant="outlined"
                                onClick={onClose}
                                size="small"
                                disabled={loading}
                            >
                                Cancel
                            </Button>
                        </Box>
                    </>
                )}
            </Box>
        </Modal>
    );
};

// Main Collectors Component
const Collectors = () => {
    const [collectors, setCollectors] = useState<any[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [addCollectorModalOpen, setAddCollectorModalOpen] = useState(false);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "info" | "warning" | "error">("success");

    const navigate = useNavigate();

    // Show snackbar with configurable severity
    const showSnackbar = (message: string, severity: "success" | "info" | "warning" | "error" = "success") => {
        setSnackMessage(message);
        setSnackbarSeverity(severity);
    };

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
        fetchCollectors();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleAddCollector = () => {
        setAddCollectorModalOpen(true);
    };

    const handleCollectorAdded = () => {
        fetchCollectors();
        showSnackbar("Collector added successfully", "success");
    };

    // New handler for Add & Configure flow
    const handleCollectorAddedAndConfigure = (collectorId: number) => {
        // We'll still show a message, but we'll redirect immediately
        showSnackbar("Collector added successfully. Redirecting to configuration...", "success");
        // Navigate to the configuration page for the new collector
        navigate(`/configure-collector/${collectorId}`);
    };

    const handleRowClick = (collector: any) => {
        navigate(`/configure-collector/${collector.id}`);
    };

    const handleDelete = async (e: React.MouseEvent, collectorId: number) => {
        e.stopPropagation(); // Prevent row click event
        if (window.confirm("Are you sure you want to delete this collector?")) {
            try {
                const response = await fetch(`/api/collectors/${collectorId}`, {
                    method: "DELETE"
                });

                if (response.ok) {
                    showSnackbar("Collector deleted successfully", "success");
                    fetchCollectors(); // Refresh the list
                } else {
                    throw new Error("Failed to delete collector");
                }
            } catch (err: unknown) {
                showSnackbar("Error deleting collector", "error");
            }
        }
    };

    const handleEdit = (e: React.MouseEvent, collector: any) => {
        e.stopPropagation(); // Prevent row click event
        navigate(`/configure-collector/${collector.id}`);
    };

    // Helper function to get the appropriate icon color based on collector type
    const getCollectorTypeChip = (type: string) => {
        let color: "default" | "primary" | "secondary" | "success" | "info" | "warning" | "error" = "default";

        switch (type) {
            case "HomeAssistant":
                color = "info";
                break;
            case "MQTT":
                color = "error";
                break;
            case "Host":
                color = "secondary";
                break;
            case "LibreHardwareMonitor":
                color = "primary";
                break;
            case "NeoPixelColor":
                color = "secondary";
                break;
            case "RateTester":
                color = "warning";
                break;
            case "UptimeKuma":
                color = "success"; 
                break;
            default:
                color = "default";
        }

        return (
            <Chip
                label={type}
                color={color}
                size="small"
            />
        );
    };

    return (
        <Box sx={{ padding: 2 }}>
            <Typography variant="h5" gutterBottom>
                Collectors
            </Typography>

            <Button
                variant="contained"
                color="primary"
                onClick={handleAddCollector}
                sx={{ marginBottom: 2 }}
                size="small"
                startIcon={<AddIcon />}
            >
                Add Collector
            </Button>

            {/* Collectors Table */}
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', padding: 3 }}>
                    <CircularProgress size={24} />
                </Box>
            ) : (
                <TableContainer component={Paper}>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
                                <TableCell>Collector Name</TableCell>
                                <TableCell>URL</TableCell>
                                <TableCell>Access Token</TableCell>
                                <TableCell>Type</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {collectors.length > 0 ? (
                                collectors.map((collector) => (
                                    <TableRow
                                        key={collector.id}
                                        hover
                                        sx={{ cursor: "pointer" }}
                                        onClick={() => handleRowClick(collector)}
                                    >
                                        <TableCell>
                                            <Typography fontWeight="medium">{collector.name}</Typography>
                                        </TableCell>
                                        <TableCell>{collector.url}</TableCell>
                                        <TableCell>{collector.accessToken ? "********" : "N/A"}</TableCell>
                                        <TableCell>{getCollectorTypeChip(collector.collectorType)}</TableCell>
                                        <TableCell align="right">
                                            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                <Tooltip title="Edit">
                                                    <IconButton
                                                        size="small"
                                                        onClick={(e) => handleEdit(e, collector)}
                                                    >
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Delete">
                                                    <IconButton
                                                        size="small"
                                                        onClick={(e) => handleDelete(e, collector.id)}
                                                    >
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={5} sx={{ textAlign: 'center', py: 3 }}>
                                        <Typography color="textSecondary">No collectors found</Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
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

            {/* Add Collector Modal with the new prop */}
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