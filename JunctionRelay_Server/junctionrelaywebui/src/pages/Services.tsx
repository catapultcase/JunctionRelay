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
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Snackbar,
    Alert,
    Tooltip,
    IconButton,
    SelectChangeEvent
} from "@mui/material";
import { useNavigate } from "react-router-dom";
// Icon imports
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

// AddService Modal Component
const AddServiceModal: React.FC<{
    open: boolean,
    onClose: () => void,
    onServiceAdded: () => void,
    onServiceAddedAndConfigure: (serviceId: number) => void
}> = ({ open, onClose, onServiceAdded, onServiceAddedAndConfigure }) => {
    const [loading, setLoading] = useState(false);
    const [configureAfterAdd, setConfigureAfterAdd] = useState<boolean>(false);
    const [serviceInfo, setServiceInfo] = useState<any>({
        name: "",
        description: "",
        type: "MQTT Broker", // Default type
        ipAddress: "",
        url: "",
        accessToken: "",
        mqttBrokerAddress: "",
        mqttBrokerPort: "",
        mqttUsername: "",
        mqttPassword: ""
    });
    const [error, setError] = useState<string>("");

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<any>) => {
        const { name, value } = e.target;
        setServiceInfo({ ...serviceInfo, [name]: value });
    };

    // Generate a unique identifier automatically
    const generateUniqueIdentifier = () => {
        // Create a unique string based on service name, type and a timestamp
        return `${serviceInfo.name.replace(/\s+/g, '_').toLowerCase()}_${serviceInfo.type.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`;
    };

    const handleAddService = async (configureAfter: boolean = false) => {
        setLoading(true);
        setError("");
        setConfigureAfterAdd(configureAfter);

        // Basic validation
        if (!serviceInfo.name) {
            setError("Service Name is required!");
            setLoading(false);
            return;
        }

        // Additional validations based on service type
        if (serviceInfo.type === "MQTT Broker Address" && !serviceInfo.mqttBrokerAddress) {
            setError("MQTT Broker Address is required for MQTT Broker services!");
            setLoading(false);
            return;
        }

        if (serviceInfo.type === "MQTT Broker Port" && !serviceInfo.mqttBrokerPort) {
            setError("MQTT Broker Port is required for MQTT Broker services!");
            setLoading(false);
            return;
        }

        if (serviceInfo.type === "REST API" && !serviceInfo.url) {
            setError("URL is required for REST API services!");
            setLoading(false);
            return;
        }

        try {
            // Generate a unique identifier and set default status to "Active"
            const uniqueIdentifier = generateUniqueIdentifier();

            const newService = {
                name: serviceInfo.name,
                description: serviceInfo.description,
                type: serviceInfo.type,
                status: "Active", // Default to Active status
                uniqueIdentifier: uniqueIdentifier,
                ipAddress: serviceInfo.ipAddress,
                url: serviceInfo.url,
                accessToken: serviceInfo.accessToken,
                mqttBrokerAddress: serviceInfo.mqttBrokerAddress,
                mqttBrokerPort: serviceInfo.mqttBrokerPort,
                mqttUsername: serviceInfo.mqttUsername,
                mqttPassword: serviceInfo.mqttPassword
            };

            // Sending data to the new endpoint for adding a service
            const response = await fetch("/api/services", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newService),
            });

            // First check if the response is ok
            if (response.ok) {
                const result = await response.json();
                // If we want to configure after adding, use the new callback
                if (configureAfter && result && result.id) {
                    onServiceAddedAndConfigure(result.id);
                } else {
                    onServiceAdded(); // Otherwise just refresh the services list
                }
                onClose(); // Close the modal in both cases
                return;
            }

            // If we get a 500 Internal Server Error and it's likely a unique constraint violation
            if (response.status === 500) {
                // For Internal Server Error, we'll assume it's likely a duplicate service name
                setError("A service with this name already exists. Service names must be unique.");
                setLoading(false);
                return;
            }

            // For other status codes, try to parse the response
            let errorMessage = "Error adding service";
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
                        errorMessage = "A service with this name already exists. Service names must be unique.";
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
                setError("A service with this name already exists. Service names must be unique.");
            } else {
                setError(err.message);
            }
            console.error("Error adding service:", err);
        } finally {
            setLoading(false);
        }
    };

    // Reset form fields when the service type changes
    useEffect(() => {
        // Using functional update pattern to avoid dependency on serviceInfo
        setServiceInfo((prevInfo: typeof serviceInfo) => ({
            ...prevInfo,
            ipAddress: "",
            url: "",
            accessToken: "",
            mqttBrokerAddress: "",
            mqttBrokerPort: "",
            mqttUsername: "",
            mqttPassword: ""
        }));
    }, [serviceInfo.type]);  // We still need serviceInfo.type as a dependency

    return (
        <Modal open={open} onClose={onClose}>
            <Box sx={{
                position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                width: '80%', maxWidth: 800, bgcolor: 'background.paper', p: 4, boxShadow: 24, borderRadius: 2,
                maxHeight: "90vh", overflow: "auto"
            }}>
                <Typography variant="h6" gutterBottom>Add Service</Typography>
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
                            {/* Select for Service Type - This should be first to determine the other fields */}
                            <FormControl fullWidth size="small">
                                <InputLabel id="service-type-label">Service Type</InputLabel>
                                <Select
                                    labelId="service-type-label"
                                    name="type"
                                    value={serviceInfo.type}
                                    onChange={handleChange}
                                    label="Service Type"
                                >
                                    <MenuItem value="MQTT Broker">MQTT Broker</MenuItem>
                                    <MenuItem value="REST API">REST API</MenuItem>
                                    <MenuItem value="Custom">Custom</MenuItem>
                                </Select>
                            </FormControl>

                            <TextField
                                fullWidth
                                label="Service Name"
                                name="name"
                                value={serviceInfo.name}
                                onChange={handleChange}
                                required
                                size="small"
                                error={!!error && error.includes("name")}
                                helperText={error && error.includes("name") ? "Name must be unique" : ""}
                            />

                            <TextField
                                fullWidth
                                label="Description"
                                name="description"
                                value={serviceInfo.description}
                                onChange={handleChange}
                                multiline
                                rows={2}
                                size="small"
                            />

                            {/* Common Fields across service types (except MQTT) */}
                            {serviceInfo.type !== "MQTT Broker" && (
                                <TextField
                                    fullWidth
                                    label="IP Address (optional)"
                                    name="ipAddress"
                                    value={serviceInfo.ipAddress}
                                    onChange={handleChange}
                                    size="small"
                                />
                            )}

                            {/* REST API specific fields */}
                            {serviceInfo.type === "REST API" && (
                                <>
                                    <Typography variant="subtitle2" sx={{ mt: 1 }}>REST API Settings</Typography>

                                    <TextField
                                        fullWidth
                                        label="URL"
                                        name="url"
                                        value={serviceInfo.url}
                                        onChange={handleChange}
                                        required
                                        size="small"
                                    />

                                    <TextField
                                        fullWidth
                                        label="Access Token"
                                        name="accessToken"
                                        value={serviceInfo.accessToken}
                                        onChange={handleChange}
                                        size="small"
                                        type="password"
                                    />
                                </>
                            )}

                            {/* MQTT specific fields - show only if type is MQTT Broker */}
                            {serviceInfo.type === "MQTT Broker" && (
                                <>
                                    <Typography variant="subtitle2" sx={{ mt: 1 }}>MQTT Settings</Typography>

                                    <TextField
                                        fullWidth
                                        label="MQTT Broker Address"
                                        name="mqttBrokerAddress"
                                        value={serviceInfo.mqttBrokerAddress}
                                        onChange={handleChange}
                                        required
                                        size="small"
                                    />

                                    <TextField
                                        fullWidth
                                        label="MQTT Broker Port"
                                        name="mqttBrokerPort"
                                        value={serviceInfo.mqttBrokerPort}
                                        onChange={handleChange}
                                        size="small"
                                        required
                                        placeholder="1883"
                                    />

                                    <TextField
                                        fullWidth
                                        label="MQTT Username"
                                        name="mqttUsername"
                                        value={serviceInfo.mqttUsername}
                                        onChange={handleChange}
                                        size="small"
                                    />

                                    <TextField
                                        fullWidth
                                        label="MQTT Password"
                                        name="mqttPassword"
                                        value={serviceInfo.mqttPassword}
                                        onChange={handleChange}
                                        size="small"
                                        type="password"
                                    />
                                </>
                            )}
                        </Box>
                        <Box sx={{ display: "flex", gap: 2, marginTop: 2 }}>
                            <Button
                                variant="contained"
                                onClick={() => handleAddService(false)}
                                startIcon={<AddIcon />}
                                size="small"
                                disabled={loading}
                            >
                                {loading && !configureAfterAdd ? "Adding..." : "Add Service"}
                            </Button>
                            <Button
                                variant="contained"
                                onClick={() => handleAddService(true)}
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

// Main Services Component
const Services = () => {
    const [services, setServices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [addServiceModalOpen, setAddServiceModalOpen] = useState(false);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "info" | "warning" | "error">("success");

    const navigate = useNavigate();

    // Show snackbar with configurable severity
    const showSnackbar = (message: string, severity: "success" | "info" | "warning" | "error" = "success") => {
        setSnackMessage(message);
        setSnackbarSeverity(severity);
    };

    const fetchServices = async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/services");
            if (!response.ok) {
                throw new Error("Failed to fetch services");
            }
            const data = await response.json();
            setServices(data);
        } catch (err: any) {
            showSnackbar("Error fetching services", "error");
            console.error("Error fetching services:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchServices();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleRowClick = (service: any) => {
        navigate(`/configure-service/${service.id}`);
    };

    const handleAddService = () => {
        setAddServiceModalOpen(true);
    };

    const handleServiceAdded = () => {
        fetchServices();
        showSnackbar("Service added successfully", "success");
    };

    // New handler for Add & Configure flow
    const handleServiceAddedAndConfigure = (serviceId: number) => {
        // We'll still show a message, but we'll redirect immediately
        showSnackbar("Service added successfully. Redirecting to configuration...", "success");
        // Navigate to the configuration page for the new service
        navigate(`/configure-service/${serviceId}`);
    };

    const handleDelete = async (e: React.MouseEvent, serviceId: number) => {
        e.stopPropagation(); // Prevent row click event
        if (window.confirm("Are you sure you want to delete this service?")) {
            try {
                const response = await fetch(`/api/services/${serviceId}`, {
                    method: "DELETE"
                });

                if (response.ok) {
                    showSnackbar("Service deleted successfully", "success");
                    fetchServices(); // Refresh the list
                } else {
                    throw new Error("Failed to delete service");
                }
            } catch (err: unknown) {
                showSnackbar("Error deleting service", "error");
            }
        }
    };

    const handleEdit = (e: React.MouseEvent, service: any) => {
        e.stopPropagation(); // Prevent row click event
        navigate(`/configure-service/${service.id}`);
    };

    const getStatusColor = (status: string): "success" | "info" | "warning" | "error" | "default" => {
        switch (status.toLowerCase()) {
            case "active":
                return "success";
            case "inactive":
                return "error";
            case "maintenance":
                return "warning";
            default:
                return "default";
        }
    };

    return (
        <Box sx={{ padding: 2 }}>
            <Typography variant="h5" gutterBottom>
                Services
            </Typography>

            <Button
                variant="contained"
                color="primary"
                onClick={handleAddService}
                sx={{ marginBottom: 2 }}
                size="small"
                startIcon={<AddIcon />}
            >
                Add Service
            </Button>

            {/* Services Table */}
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', padding: 3 }}>
                    <CircularProgress size={24} />
                </Box>
            ) : (
                <TableContainer component={Paper}>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
                                <TableCell>Service Name</TableCell>
                                <TableCell>Description</TableCell>
                                <TableCell>Type</TableCell>
                                <TableCell>Unique Identifier</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {services.length > 0 ? (
                                services.map((service: any) => (
                                    <TableRow
                                        key={service.id}
                                        hover
                                        sx={{ cursor: "pointer" }}
                                        onClick={() => handleRowClick(service)}
                                    >
                                        <TableCell>
                                            <Typography fontWeight="medium">{service.name}</Typography>
                                        </TableCell>
                                        <TableCell>{service.description}</TableCell>
                                        <TableCell>{service.type}</TableCell>
                                        <TableCell>{service.uniqueIdentifier}</TableCell>
                                        <TableCell>
                                            <Chip
                                                label={service.status}
                                                color={getStatusColor(service.status)}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell align="right">
                                            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                <Tooltip title="Edit">
                                                    <IconButton
                                                        size="small"
                                                        onClick={(e) => handleEdit(e, service)}
                                                    >
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Delete">
                                                    <IconButton
                                                        size="small"
                                                        onClick={(e) => handleDelete(e, service.id)}
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
                                    <TableCell colSpan={6} sx={{ textAlign: 'center', py: 3 }}>
                                        <Typography color="textSecondary">No services found</Typography>
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

            {/* Add Service Modal with the new props */}
            <AddServiceModal
                open={addServiceModalOpen}
                onClose={() => setAddServiceModalOpen(false)}
                onServiceAdded={handleServiceAdded}
                onServiceAddedAndConfigure={handleServiceAddedAndConfigure}
            />
        </Box>
    );
};

export default Services;