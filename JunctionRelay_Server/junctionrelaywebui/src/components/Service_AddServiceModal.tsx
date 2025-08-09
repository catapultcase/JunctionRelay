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
    Modal,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    SelectChangeEvent,
    Alert,
    IconButton,
    Divider,
} from "@mui/material";
// Icon imports
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import MinimizeIcon from '@mui/icons-material/Minimize';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SetupInstructions_Services from './SetupInstructions_Services';

// AddService Modal Component
const AddServiceModal: React.FC<{
    open: boolean,
    onClose: () => void,
    onServiceAdded: () => void,
    onServiceAddedAndConfigure: (serviceId: number) => void
}> = ({ open, onClose, onServiceAdded, onServiceAddedAndConfigure }) => {
    const [loading, setLoading] = useState<boolean>(false);
    const [configureAfterAdd, setConfigureAfterAdd] = useState<boolean>(false);
    const [setupInstructionsMinimized, setSetupInstructionsMinimized] = useState<boolean>(false);
    const [service, setService] = useState<any>({
        name: "",
        description: "",
        type: "",
        url: "",
        accessToken: "",
        externalAccessToken: false,
        mqttBrokerAddress: "",
        mqttBrokerPort: "",
        mqttUsername: ""
    });
    const [encryptionPassword, setEncryptionPassword] = useState<string>("");
    const [error, setError] = useState<string>("");

    // Service type options for dropdown
    const serviceTypes = [
        { value: "", name: "Select Service Type", desc: "Choose a service type to begin" },
        { value: "MQTT Broker", name: "MQTT Broker", desc: "Message broker service" },
        { value: "HomeAssistant", name: "HomeAssistant", desc: "API access control for HomeAssistant integration" },
        { value: "Grafana", name: "Grafana", desc: "Analytics and monitoring dashboard integration" }
    ];

    // Reset form when modal opens/closes
    useEffect(() => {
        if (open) {
            // Reset to initial state when modal opens
            setService({
                name: "",
                description: "",
                type: "",
                url: "",
                accessToken: "",
                externalAccessToken: false,
                mqttBrokerAddress: "",
                mqttBrokerPort: "",
                mqttUsername: ""
            });
            setEncryptionPassword("");
            setError("");
        }
    }, [open]);

    // Handle input change
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<any>) => {
        const { name, value } = e.target;
        setService({ ...service, [name]: value });
    };

    // Generate a unique identifier automatically
    const generateUniqueIdentifier = () => {
        return `${service.name.replace(/\s+/g, '_').toLowerCase()}_${service.type.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`;
    };

    // Handle form submission
    const handleAddService = async (configureAfter: boolean = false) => {
        setLoading(true);
        setError("");
        setConfigureAfterAdd(configureAfter);

        // Basic validation
        if (!service.name || !service.type) {
            setError("Name and Type are required!");
            setLoading(false);
            return;
        }

        if (service.type === "MQTT Broker" && !service.mqttBrokerAddress) {
            setError("MQTT Broker Address is required for MQTT Broker services!");
            setLoading(false);
            return;
        }

        if (service.type === "MQTT Broker" && !service.mqttBrokerPort) {
            setError("MQTT Broker Port is required for MQTT Broker services!");
            setLoading(false);
            return;
        }

        if (service.type === "Grafana" && !service.url) {
            setError("Grafana URL is required for Grafana services!");
            setLoading(false);
            return;
        }

        // Validate encryption password if external encryption is selected
        if (service.externalAccessToken && !encryptionPassword.trim()) {
            setError("Encryption password is required when using external password encryption.");
            setLoading(false);
            return;
        }

        // Send the request
        try {
            const uniqueIdentifier = generateUniqueIdentifier();

            const requestBody: any = {
                name: service.name,
                description: service.description,
                type: service.type,
                status: "Active",
                uniqueIdentifier: uniqueIdentifier,
                url: service.url,
                accessToken: service.accessToken,
                externalAccessToken: service.externalAccessToken,
                mqttBrokerAddress: service.mqttBrokerAddress,
                mqttBrokerPort: service.mqttBrokerPort,
                mqttUsername: service.mqttUsername,
                pollRate: 5000,
                sendRate: 5000
            };

            // If using external encryption, include the encryption password in a way the backend expects
            if (service.externalAccessToken && encryptionPassword) {
                requestBody.encryptionPassword = encryptionPassword;
            }

            const response = await fetch("/api/services", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
            });

            if (response.ok) {
                const result = await response.json();
                if (configureAfter && result && result.id) {
                    onServiceAddedAndConfigure(result.id);
                } else {
                    onServiceAdded();
                }
                onClose();
                return;
            }

            if (response.status === 500) {
                setError("A service with this name already exists. Service names must be unique.");
                setLoading(false);
                return;
            }

            let errorMessage = "Error adding service";
            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorMessage;
            } catch (parseError) {
                errorMessage = response.statusText || errorMessage;
            }

            throw new Error(errorMessage);
        } catch (err: any) {
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

    // Set default values based on selected service type
    useEffect(() => {
        if (service.type === "MQTT Broker") {
            setService((prev: any) => ({
                ...prev,
                name: "MQTT Broker",
                description: "MQTT message broker service",
                externalAccessToken: false,
                mqttBrokerPort: "1883"
            }));
        } else if (service.type === "HomeAssistant") {
            setService((prev: any) => ({
                ...prev,
                name: "HomeAssistant",
                description: "API access control for HomeAssistant integration",
                externalAccessToken: false
            }));
        } else if (service.type === "Grafana") {
            setService((prev: any) => ({
                ...prev,
                name: "Grafana",
                description: "Analytics and monitoring dashboard integration",
                externalAccessToken: false
            }));
        } else {
            setService((prev: any) => ({
                ...prev,
                name: "",
                description: "",
                externalAccessToken: false
            }));
        }

        // Reset encryption password when service type changes
        setEncryptionPassword("");
    }, [service.type]);

    return (
        <Modal open={open} onClose={onClose}>
            <Box sx={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: { xs: 'auto', sm: '90%', md: '80%' },
                maxWidth: { xs: '95vw', md: 900 },
                minWidth: { xs: 320, sm: 400 },
                height: 'auto',
                maxHeight: { xs: '90vh', md: '80vh' },
                bgcolor: 'background.paper',
                p: 0,
                boxShadow: 24,
                borderRadius: 2,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                <Typography variant="h6" sx={{
                    p: { xs: 2, md: 3 },
                    pb: 2,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    fontSize: { xs: '1.1rem', md: '1.25rem' }
                }}>
                    Add Service
                </Typography>

                {loading ? (
                    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1 }}>
                        <CircularProgress size={40} />
                    </Box>
                ) : (
                    <Box sx={{
                        display: 'flex',
                        flexDirection: { xs: 'column', md: 'row' },
                        flex: 1,
                        overflow: 'hidden',
                        minHeight: 0
                    }}>
                        {/* Left side - Service types list (Desktop only) */}
                        <Box sx={{
                            width: { md: 280 },
                            borderRight: { md: '1px solid' },
                            borderColor: 'divider',
                            overflowY: 'auto',
                            bgcolor: 'action.hover',
                            display: { xs: 'none', md: 'block' }
                        }}>
                            <Typography variant="subtitle2" sx={{ p: 2, pb: 1, fontWeight: 'bold', color: 'text.secondary' }}>
                                Select Service Type
                            </Typography>
                            {serviceTypes.slice(1).map((serviceType) => (
                                <Box
                                    key={serviceType.value}
                                    onClick={() => setService({ ...service, type: serviceType.value })}
                                    sx={{
                                        p: 2,
                                        mx: 1,
                                        mb: 1,
                                        borderRadius: 1,
                                        cursor: 'pointer',
                                        bgcolor: service.type === serviceType.value ? 'primary.main' : 'transparent',
                                        color: service.type === serviceType.value ? 'primary.contrastText' : 'text.primary',
                                        '&:hover': {
                                            bgcolor: service.type === serviceType.value ? 'primary.dark' : 'action.hover'
                                        },
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <Typography variant="body2" fontWeight={service.type === serviceType.value ? 'bold' : 'medium'}>
                                        {serviceType.name}
                                    </Typography>
                                    <Typography variant="caption" sx={{
                                        opacity: service.type === serviceType.value ? 0.9 : 0.7,
                                        display: 'block'
                                    }}>
                                        {serviceType.desc}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>

                        {/* Configuration form */}
                        <Box sx={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            order: { xs: 1, md: 2 }
                        }}>
                            <Box sx={{
                                p: { xs: 2, md: 3 },
                                overflowY: 'auto',
                                flex: 1
                            }}>
                                {error && (
                                    <Alert severity="error" sx={{ mb: 2 }}>
                                        {error}
                                    </Alert>
                                )}

                                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    {/* Service Type Dropdown - Mobile only */}
                                    <Box sx={{ display: { xs: 'block', md: 'none' } }}>
                                        <FormControl fullWidth size="small">
                                            <InputLabel id="service-type-label">Service Type *</InputLabel>
                                            <Select
                                                labelId="service-type-label"
                                                value={service.type}
                                                onChange={handleChange}
                                                name="type"
                                                required
                                                label="Service Type *"
                                            >
                                                {serviceTypes.map((type) => (
                                                    <MenuItem key={type.value} value={type.value} disabled={type.value === ""}>
                                                        <Box>
                                                            <Typography variant="body2" fontWeight="medium">
                                                                {type.name}
                                                            </Typography>
                                                            {type.value !== "" && (
                                                                <Typography variant="caption" color="text.secondary">
                                                                    {type.desc}
                                                                </Typography>
                                                            )}
                                                        </Box>
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Box>

                                    {/* Only show form fields if service type is selected */}
                                    {service.type && (
                                        <>
                                            <TextField
                                                fullWidth
                                                size="small"
                                                label="Service Name"
                                                name="name"
                                                value={service.name}
                                                onChange={handleChange}
                                                required
                                                error={!!error && error.includes("name")}
                                                helperText={error && error.includes("name") ? "Name must be unique" : ""}
                                            />

                                            <TextField
                                                fullWidth
                                                size="small"
                                                label="Description"
                                                name="description"
                                                value={service.description}
                                                onChange={handleChange}
                                                multiline
                                                rows={2}
                                            />

                                            {/* MQTT specific fields */}
                                            {service.type === "MQTT Broker" && (
                                                <>
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        label="MQTT Broker Address"
                                                        name="mqttBrokerAddress"
                                                        value={service.mqttBrokerAddress}
                                                        onChange={handleChange}
                                                        required
                                                    />

                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        label="MQTT Broker Port"
                                                        name="mqttBrokerPort"
                                                        value={service.mqttBrokerPort}
                                                        onChange={handleChange}
                                                        required
                                                        placeholder="1883"
                                                    />

                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        label="MQTT Username"
                                                        name="mqttUsername"
                                                        value={service.mqttUsername}
                                                        onChange={handleChange}
                                                    />

                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        label="MQTT Password"
                                                        name="accessToken"
                                                        value={service.accessToken}
                                                        onChange={handleChange}
                                                        type="password"
                                                        helperText="Stored in AccessToken field for security consistency"
                                                    />
                                                </>
                                            )}

                                            {/* HomeAssistant specific fields - minimal since HA calls us */}
                                            {service.type === "HomeAssistant" && (
                                                <Box sx={{
                                                    p: 2,
                                                    bgcolor: 'action.hover',
                                                    borderRadius: 1,
                                                    border: '1px solid',
                                                    borderColor: 'divider'
                                                }}>
                                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                                        <strong>HomeAssistant Integration:</strong>
                                                    </Typography>
                                                    <Typography variant="body2" color="text.secondary">
                                                        This service controls which junctions are accessible to HomeAssistant.
                                                        Configure junction sharing in the service configuration page after creation.
                                                    </Typography>
                                                </Box>
                                            )}

                                            {/* Grafana specific fields - minimal since Grafana calls us */}
                                            {service.type === "Grafana" && (
                                                <Box sx={{
                                                    p: 2,
                                                    bgcolor: 'action.hover',
                                                    borderRadius: 1,
                                                    border: '1px solid',
                                                    borderColor: 'divider'
                                                }}>
                                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                                        <strong>Grafana Data Source:</strong>
                                                    </Typography>
                                                    <Typography variant="body2" color="text.secondary">
                                                        This service provides data endpoints for Grafana dashboards.
                                                        Configure shared metrics in the service configuration page after creation.
                                                    </Typography>
                                                </Box>
                                            )}
                                        </>
                                    )}
                                </Box>

                                {/* Security Options Section - Show for services that use AccessToken field */}
                                {service.type && service.type === "MQTT Broker" && (
                                    <Box sx={{ mt: 3 }}>
                                        <Divider sx={{ mb: 2 }} />
                                        <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                                            MQTT Password Security
                                        </Typography>

                                        <FormControl component="fieldset">
                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                    <input
                                                        type="radio"
                                                        id="local-encryption-service"
                                                        name="encryption-method-service"
                                                        checked={!service.externalAccessToken}
                                                        onChange={() => setService({ ...service, externalAccessToken: false })}
                                                        style={{ marginRight: '8px' }}
                                                    />
                                                    <label htmlFor="local-encryption-service" style={{ cursor: 'pointer' }}>
                                                        <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                                            Save to local DB (Default)
                                                        </Typography>
                                                    </label>
                                                </Box>

                                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                    <input
                                                        type="radio"
                                                        id="external-encryption-service"
                                                        name="encryption-method-service"
                                                        checked={service.externalAccessToken}
                                                        onChange={() => setService({ ...service, externalAccessToken: true })}
                                                        style={{ marginRight: '8px' }}
                                                    />
                                                    <label htmlFor="external-encryption-service" style={{ cursor: 'pointer' }}>
                                                        <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                                            Encrypt with external password
                                                        </Typography>
                                                    </label>
                                                </Box>
                                            </Box>
                                        </FormControl>

                                        {/* Encryption Password field - only show if external encryption is selected */}
                                        {service.externalAccessToken && (
                                            <TextField
                                                fullWidth
                                                size="small"
                                                label="Encryption Password"
                                                type="password"
                                                value={encryptionPassword}
                                                onChange={(e) => setEncryptionPassword(e.target.value)}
                                                required
                                                sx={{ mt: 2 }}
                                                placeholder="Enter a strong password for encryption"
                                                helperText="This password will be required each time the application starts"
                                            />
                                        )}

                                        {/* Help text - Hide on mobile */}
                                        <Box sx={{
                                            mt: 2,
                                            p: 2,
                                            bgcolor: 'action.hover',
                                            borderRadius: 1,
                                            display: { xs: 'none', md: 'block' }
                                        }}>
                                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                                <strong>Local DB:</strong> MQTT Password will be encrypted but the encryption keys exist in the application directory.
                                                This is usually sufficient if you have secured your local network/docker environment and if the password is not high value.
                                                The application will decrypt automatically on app start so you do not need to re-enter the password.
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                <strong>External Password:</strong> MQTT Password will be encrypted using a password that is not saved in the DB -
                                                this provides maximum security for your MQTT password, but means you must enter the password on application start
                                                for each service that is encrypted via this method before it can be used. If you lose your password,
                                                you will not be able to recover the service and you will need to recreate it.
                                            </Typography>
                                        </Box>
                                    </Box>
                                )}
                            </Box>

                            {/* Instructions - responsive height - Hide on mobile */}
                            {service.type && (
                                <Box sx={{
                                    display: { xs: 'none', md: 'block' },
                                    borderTop: '1px solid',
                                    borderColor: 'divider'
                                }}>
                                    {/* Always Visible Header */}
                                    <Box sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        p: 2,
                                        bgcolor: 'action.hover',
                                        cursor: 'pointer',
                                        '&:hover': {
                                            bgcolor: 'action.selected'
                                        }
                                    }}
                                        onClick={() => setSetupInstructionsMinimized(!setupInstructionsMinimized)}
                                    >
                                        <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
                                            Setup Instructions
                                        </Typography>
                                        <IconButton size="small" sx={{ p: 0 }}>
                                            {setupInstructionsMinimized ? <ExpandMoreIcon /> : <MinimizeIcon />}
                                        </IconButton>
                                    </Box>

                                    {/* Collapsible Content */}
                                    {!setupInstructionsMinimized && (
                                        <Box sx={{
                                            maxHeight: '300px',
                                            p: 3,
                                            overflowY: 'auto',
                                            bgcolor: 'background.default'
                                        }}>
                                            <SetupInstructions_Services serviceType={service.type} />
                                        </Box>
                                    )}
                                </Box>
                            )}

                            {/* Action buttons - responsive layout */}
                            <Box sx={{
                                p: { xs: 2, md: 3 },
                                borderTop: '1px solid',
                                borderColor: 'divider',
                                display: "flex",
                                flexDirection: { xs: 'column', sm: 'row' },
                                gap: { xs: 1, sm: 2 },
                                flexShrink: 0
                            }}>
                                <Button
                                    variant="contained"
                                    onClick={() => handleAddService(false)}
                                    size="small"
                                    startIcon={<AddIcon />}
                                    disabled={loading || !service.type}
                                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                                >
                                    {loading && !configureAfterAdd ? "Adding..." : "Add Service"}
                                </Button>
                                <Button
                                    variant="contained"
                                    onClick={() => handleAddService(true)}
                                    size="small"
                                    color="secondary"
                                    startIcon={<EditIcon />}
                                    disabled={loading || !service.type}
                                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                                >
                                    {loading && configureAfterAdd ? "Adding..." : "Add & Configure"}
                                </Button>
                                <Button
                                    variant="outlined"
                                    onClick={onClose}
                                    size="small"
                                    disabled={loading}
                                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                                >
                                    Cancel
                                </Button>
                            </Box>
                        </Box>
                    </Box>
                )}
            </Box>
        </Modal>
    );
};

export default AddServiceModal;