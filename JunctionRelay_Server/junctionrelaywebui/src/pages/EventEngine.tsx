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
    Typography, Box, Button, CircularProgress, Snackbar,
    Alert, Switch, FormControl, InputLabel, Select, MenuItem,
    FormControlLabel, Paper, Chip, AlertColor,
} from "@mui/material";
import { useNavigate } from "react-router-dom";

// Icon imports
import SettingsIcon from '@mui/icons-material/Settings';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import { useTheme, useMediaQuery } from "@mui/material";

// Import components
import MqttCache from '../components/EventEngine_MqttCache';
import GlobalSensorCache from '../components/EventEngine_GlobalSensorCache';
import EventEngineEventRules from '../components/EventEngine_EventRules';
import EventEngineEventSensors from '../components/EventEngine_EventSensors';

// Main EventEngine Component
const EventEngine = () => {
    const [services, setServices] = useState<any[]>([]);
    const [loadingService, setLoadingService] = useState<boolean>(false);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<AlertColor>("success");

    // EventEngine service state
    const [serviceEnabled, setServiceEnabled] = useState<boolean>(false);
    const [selectedMqttServiceId, setSelectedMqttServiceId] = useState<string>("");
    const [mqttConnectionStatus, setMqttConnectionStatus] = useState<string>("disconnected");

    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Show snackbar with configurable severity
    const showSnackbar = (message: string, severity: AlertColor = "success") => {
        setSnackMessage(message);
        setSnackbarSeverity(severity);
    };

    // Fetch EventEngine service setting
    const fetchServiceSetting = async () => {
        try {
            const response = await fetch("/api/settings/flags");
            if (response.ok) {
                const flags = await response.json();
                setServiceEnabled(flags.service_eventengine_enabled || false);
            }
        } catch (error) {
            console.error("Error fetching service setting:", error);
        }
    };

    // Fetch MQTT services
    const fetchMqttServices = async () => {
        try {
            const servicesResponse = await fetch("/api/services");
            if (servicesResponse.ok) {
                const servicesData = await servicesResponse.json();
                const mqttServices = servicesData.filter((s: any) => s.type === "MQTT Broker");
                setServices(mqttServices);

                // Set default MQTT service if none selected
                if (!selectedMqttServiceId && mqttServices.length > 0) {
                    setSelectedMqttServiceId(mqttServices[0].id.toString());
                }
            }
        } catch (err: any) {
            showSnackbar("Error fetching MQTT services", "error");
            console.error("Error fetching MQTT services:", err);
        }
    };

    useEffect(() => {
        fetchServiceSetting();
        fetchMqttServices();
    }, []);

    const handleServiceToggle = async (enabled: boolean) => {
        setLoadingService(true);
        try {
            const response = await fetch("/api/settings/toggle/service_eventengine_enabled", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled })
            });

            if (response.ok) {
                const result = await response.json();
                setServiceEnabled(enabled);
                showSnackbar(`EventEngine service ${enabled ? 'enabled' : 'disabled'}`, "success");
                console.log("EventEngine service setting updated:", result);
            } else {
                const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
                throw new Error(errorData.error || "Failed to update setting");
            }
        } catch (error: any) {
            console.error("Error toggling EventEngine service:", error);
            showSnackbar(`Error toggling service: ${error.message}`, "error");
            setServiceEnabled(!enabled);
        } finally {
            setLoadingService(false);
        }
    };

    const handleMqttServiceChange = (serviceId: string) => {
        setSelectedMqttServiceId(serviceId);
    };

    const handleConnectToMqtt = async () => {
        if (!selectedMqttServiceId) return;

        setLoadingService(true);
        try {
            const response = await fetch(`/api/services/connect-to-mqtt/${selectedMqttServiceId}`, {
                method: "POST"
            });

            if (response.ok) {
                setMqttConnectionStatus("connected");
                showSnackbar("Connected to MQTT broker", "success");
            } else {
                throw new Error("Failed to connect");
            }
        } catch (error) {
            showSnackbar("Error connecting to MQTT broker", "error");
        } finally {
            setLoadingService(false);
        }
    };

    return (
        <Box sx={{ padding: 2 }}>
            {/* Page Header - Hide on mobile */}
            {!isMobile && (
                <Typography variant="h6" sx={{ mb: 2 }}>
                    EventEngine
                </Typography>
            )}

            {/* Service Control Panel */}
            <Paper sx={{ p: 2, mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <SettingsIcon sx={{ mr: 1, color: 'text.secondary' }} />
                    <Typography variant="h6">
                        EventEngine Service
                    </Typography>
                    {loadingService && (
                        <CircularProgress size={16} sx={{ ml: 1 }} />
                    )}
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <FormControlLabel
                        control={
                            <Switch
                                checked={serviceEnabled}
                                onChange={(e) => handleServiceToggle(e.target.checked)}
                                disabled={loadingService}
                                color="primary"
                            />
                        }
                        label={
                            <Box>
                                <Typography variant="body2">
                                    EventEngine Service {serviceEnabled ? 'Enabled' : 'Disabled'}
                                </Typography>
                                {!serviceEnabled && (
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                        Note: Service may take up to 10 seconds to warm up after re-enabling
                                    </Typography>
                                )}
                            </Box>
                        }
                    />

                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <FormControl size="small" sx={{ minWidth: 200 }}>
                            <InputLabel>MQTT Service</InputLabel>
                            <Select
                                value={selectedMqttServiceId}
                                label="MQTT Service"
                                onChange={(e) => handleMqttServiceChange(e.target.value)}
                                disabled={loadingService}
                            >
                                <MenuItem value="">
                                    <em>None</em>
                                </MenuItem>
                                {services.map((service) => (
                                    <MenuItem key={service.id} value={service.id.toString()}>
                                        {service.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <Button
                            variant="outlined"
                            onClick={handleConnectToMqtt}
                            startIcon={mqttConnectionStatus === 'connected' ? <LinkIcon /> : <LinkOffIcon />}
                            disabled={!selectedMqttServiceId || loadingService}
                            size="small"
                        >
                            {mqttConnectionStatus === 'connected' ? 'Connected' : 'Connect'}
                        </Button>

                        <Chip
                            label={mqttConnectionStatus}
                            color={mqttConnectionStatus === 'connected' ? 'success' : 'default'}
                            size="small"
                        />
                    </Box>
                </Box>
            </Paper>

            {/* Global MQTT Cache */}
            <MqttCache />

            {/* Global Sensor Cache */}
            <GlobalSensorCache />

            {/* Event Rules Component */}
            <EventEngineEventRules
                showSnackbar={showSnackbar}
            />

            {/* Event Sensors Component */}
            <EventEngineEventSensors
                showSnackbar={showSnackbar}
                onSensorCreated={() => { }}
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

export default EventEngine;