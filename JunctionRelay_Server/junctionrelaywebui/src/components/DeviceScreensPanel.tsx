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

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
    Typography, Box, Paper, Button, Modal, FormControl, InputLabel, Select,
    MenuItem, TextField, Table, TableHead, TableRow, TableCell, TableBody,
    TableContainer, CircularProgress, FormControlLabel, Switch, useTheme,
    useMediaQuery, Card, CardContent, Chip, Divider, IconButton
} from "@mui/material";
import ScreenshotIcon from '@mui/icons-material/Screenshot';
import MemoryIcon from '@mui/icons-material/Memory';
import AddIcon from '@mui/icons-material/Add';
import SubscriptionsIcon from '@mui/icons-material/Subscriptions';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';

interface I2CEndpoint {
    id: number;
    i2CDeviceId: number;
    endpointType: string;
    address: string;
    qoS: number;
    notes: string;
}

interface I2CDevice {
    id: number;
    deviceId: number;
    i2CAddress: string;
    deviceType: string;
    communicationProtocol: string;
    isEnabled: boolean;
    dateAdded: string;
    endpoints: I2CEndpoint[];
}

interface DeviceScreensPanelProps {
    deviceId: string;
    deviceScreens: any[];
    setDeviceScreens: (screens: any[]) => void;
    i2cDevices: I2CDevice[];
    setI2cDevices: (devices: I2CDevice[]) => void;
    layoutTemplates: any[];
    frameTemplates: any[];
    isCustom: boolean;
    showSnackbar: (message: string, severity: "success" | "error" | "warning" | "info") => void;
    onScreenChange?: (screens: any[]) => void;
}

const DeviceScreensPanel: React.FC<DeviceScreensPanelProps> = ({
    deviceId,
    deviceScreens,
    setDeviceScreens,
    i2cDevices,
    setI2cDevices,
    layoutTemplates,
    frameTemplates,
    isCustom,
    showSnackbar,
    onScreenChange
}) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const isSmallMobile = useMediaQuery(theme.breakpoints.down('sm'));

    // Debounce timers for auto-save
    const debounceTimersRef = useRef<{ [screenId: number]: NodeJS.Timeout }>({});

    // Modal style - responsive
    const modalStyle = {
        position: "absolute" as const,
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: isMobile ? "95%" : 400,
        maxWidth: 400,
        bgcolor: "background.paper",
        boxShadow: 24,
        p: isMobile ? 2 : 4,
        borderRadius: 2,
        maxHeight: "90vh",
        overflow: "auto"
    };

    // Modal state for screens
    const [openScreenModal, setOpenScreenModal] = useState(false);
    const [newScreenKey, setNewScreenKey] = useState("");
    const [newScreenDisplayName, setNewScreenDisplayName] = useState("");
    const [newScreenScreenLayoutId, setNewScreenScreenLayoutId] = useState<number | "">("");
    const [newScreenFrameLayoutId, setNewScreenFrameLayoutId] = useState<number | "">("");
    const [newScreenSupportsConfigPayloads, setNewScreenSupportsConfigPayloads] = useState(true);
    const [newScreenSupportsSensorPayloads, setNewScreenSupportsSensorPayloads] = useState(true);

    // Modal state for I2C bus
    const [openBusModal, setOpenBusModal] = useState(false);
    const [newBusAddress, setNewBusAddress] = useState("");
    const [newBusDeviceType, setNewBusDeviceType] = useState("");
    const [newBusProtocol, setNewBusProtocol] = useState("");
    const [newBusEnabled, setNewBusEnabled] = useState<boolean>(true);

    // Modal state for I2C endpoints
    const [openEndpointModal, setOpenEndpointModal] = useState(false);
    const [endpointParentBusId, setEndpointParentBusId] = useState<number | "">("");
    const [newEndpointType, setNewEndpointType] = useState("");
    const [newEndpointAddress, setNewEndpointAddress] = useState("");
    const [newEndpointQoS, setNewEndpointQoS] = useState<number>(0);
    const [newEndpointNotes, setNewEndpointNotes] = useState("");

    // Modal state for MQTT subscription
    const [subscribeModalOpen, setSubscribeModalOpen] = useState(false);
    const [selectedEndpoint, setSelectedEndpoint] = useState<string>("");
    const [availableServices, setAvailableServices] = useState<any[]>([]);
    const [selectedServiceId, setSelectedServiceId] = useState<string>("");
    const [topicQoS, setTopicQoS] = useState<number>(0);
    const [loadingServices, setLoadingServices] = useState(false);

    // Auto-save individual screen changes
    const autoSaveScreen = useCallback(async (screen: any, immediate: boolean = false) => {
        const screenId = screen.id;

        console.log(`[DeviceScreensPanel] Auto-saving screen ${screenId}, immediate: ${immediate}`);

        // Clear existing timer for this screen
        if (debounceTimersRef.current[screenId]) {
            clearTimeout(debounceTimersRef.current[screenId]);
            delete debounceTimersRef.current[screenId];
        }

        const performSave = async () => {
            try {
                console.log(`[DeviceScreensPanel] Executing save for screen ${screenId}`);
                const res = await fetch(`/api/devices/${screen.deviceId}/screens/${screen.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        displayName: screen.displayName,
                        screenLayoutId: screen.screenLayoutId,
                        frameLayoutId: screen.frameLayoutId,
                        supportsConfigPayloads: screen.supportsConfigPayloads,
                        supportsSensorPayloads: screen.supportsSensorPayloads
                    })
                });
                if (!res.ok) throw new Error("Failed to update screen.");
                console.log(`[DeviceScreensPanel] Screen ${screenId} saved successfully`);
            } catch (error) {
                console.error(`[DeviceScreensPanel] Error auto-saving screen ${screenId}:`, error);
                showSnackbar("Failed to auto-save screen changes", "error");
            }
        };

        if (immediate) {
            // Immediate save for dropdowns and toggles
            await performSave();
        } else {
            // Debounced save for text inputs (2 seconds)
            debounceTimersRef.current[screenId] = setTimeout(performSave, 2000);
        }
    }, [showSnackbar]);

    // Handle text field changes with debounced auto-save
    const handleScreenTextChange = useCallback((screenId: number, field: string) =>
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const newValue = event.target.value;
            console.log(`[DeviceScreensPanel] Text change for screen ${screenId}.${field}: ${newValue}`);

            const updatedScreens = deviceScreens.map(screen =>
                screen.id === screenId ? { ...screen, [field]: newValue } : screen
            );

            setDeviceScreens(updatedScreens);
            if (onScreenChange) {
                onScreenChange(updatedScreens);
            }

            // Find the updated screen and auto-save it with debounce
            const updatedScreen = updatedScreens.find(s => s.id === screenId);
            if (updatedScreen) {
                autoSaveScreen(updatedScreen, false); // Debounced save
            }
        }, [deviceScreens, setDeviceScreens, onScreenChange, autoSaveScreen]);

    // Handle select changes with immediate auto-save
    const handleScreenSelectChange = useCallback((screenId: number, field: string) =>
        (event: any) => {
            const newValue = event.target.value;
            console.log(`[DeviceScreensPanel] Select change for screen ${screenId}.${field}: ${newValue}`);

            const updatedScreens = deviceScreens.map(screen =>
                screen.id === screenId ? { ...screen, [field]: newValue } : screen
            );

            setDeviceScreens(updatedScreens);
            if (onScreenChange) {
                onScreenChange(updatedScreens);
            }

            // Find the updated screen and auto-save it immediately
            const updatedScreen = updatedScreens.find(s => s.id === screenId);
            if (updatedScreen) {
                autoSaveScreen(updatedScreen, true); // Immediate save
            }
        }, [deviceScreens, setDeviceScreens, onScreenChange, autoSaveScreen]);

    const handleFrameSelectChange = useCallback((screenId: number, field: string) =>
        (event: any) => {
            const newValue = event.target.value;
            console.log(`[DeviceScreensPanel] Select change for screen ${screenId}.${field}: ${newValue}`);

            const updatedScreens = deviceScreens.map(screen =>
                screen.id === screenId ? { ...screen, [field]: newValue } : screen
            );

            setDeviceScreens(updatedScreens);
            if (onScreenChange) {
                onScreenChange(updatedScreens);
            }

            // Find the updated screen and auto-save it immediately
            const updatedScreen = updatedScreens.find(s => s.id === screenId);
            if (updatedScreen) {
                autoSaveScreen(updatedScreen, true); // Immediate save
            }
        }, [deviceScreens, setDeviceScreens, onScreenChange, autoSaveScreen]);

    // Handle boolean changes with immediate auto-save
    const handleScreenBooleanChange = useCallback((screenId: number, field: string) =>
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const newValue = event.target.checked;
            console.log(`[DeviceScreensPanel] Boolean change for screen ${screenId}.${field}: ${newValue}`);

            const updatedScreens = deviceScreens.map(screen =>
                screen.id === screenId ? { ...screen, [field]: newValue } : screen
            );

            setDeviceScreens(updatedScreens);
            if (onScreenChange) {
                onScreenChange(updatedScreens);
            }

            // Find the updated screen and auto-save it immediately
            const updatedScreen = updatedScreens.find(s => s.id === screenId);
            if (updatedScreen) {
                autoSaveScreen(updatedScreen, true); // Immediate save
            }
        }, [deviceScreens, setDeviceScreens, onScreenChange, autoSaveScreen]);

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            Object.values(debounceTimersRef.current).forEach(timer => {
                clearTimeout(timer);
            });
        };
    }, []);

    // Add new screen
    const handleAddScreen = async () => {
        try {
            const payload = {
                deviceId: Number(deviceId),
                screenKey: newScreenKey,
                displayName: newScreenDisplayName,
                screenLayoutId: newScreenScreenLayoutId,
                frameLayoutId: newScreenFrameLayoutId,
                supportsConfigPayloads: newScreenSupportsConfigPayloads,
                supportsSensorPayloads: newScreenSupportsSensorPayloads
            };
            const res = await fetch(`/api/devices/${deviceId}/screens`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error("Failed to add screen.");
            const created = await res.json();
            const updatedScreens = [...deviceScreens, created];
            setDeviceScreens(updatedScreens);
            if (onScreenChange) {
                onScreenChange(updatedScreens);
            }
            setOpenScreenModal(false);
            setNewScreenKey("");
            setNewScreenDisplayName("");
            setNewScreenScreenLayoutId("");
            setNewScreenFrameLayoutId("");
            setNewScreenSupportsConfigPayloads(true);
            setNewScreenSupportsSensorPayloads(true);
            showSnackbar("Screen added successfully", "success");
        } catch (err: any) {
            console.error(err);
            showSnackbar("Failed to add screen", "error");
        }
    };

    // Add new I2C bus
    const handleAddBus = async () => {
        try {
            const payload = {
                deviceId: Number(deviceId),
                i2CAddress: newBusAddress,
                deviceType: newBusDeviceType,
                communicationProtocol: newBusProtocol,
                isEnabled: newBusEnabled
            };
            const res = await fetch(`/api/devices/${deviceId}/i2c-devices`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error("Failed to add I2C bus.");
            const created: I2CDevice = await res.json();
            created.endpoints = [];
            setI2cDevices([...i2cDevices, created]);
            setOpenBusModal(false);
            setNewBusAddress("");
            setNewBusDeviceType("");
            setNewBusProtocol("");
            setNewBusEnabled(true);
            showSnackbar("I2C bus added successfully", "success");
        } catch (err: any) {
            console.error(err);
            showSnackbar("Failed to add I2C bus", "error");
        }
    };

    // Add new I2C endpoint
    const handleAddEndpoint = async () => {
        try {
            if (!endpointParentBusId) throw new Error("Select a bus");
            const payload = {
                i2CDeviceId: endpointParentBusId,
                endpointType: newEndpointType,
                address: newEndpointAddress,
                qoS: newEndpointQoS,
                notes: newEndpointNotes
            };
            const res = await fetch(
                `/api/devices/${deviceId}/i2c-devices/${endpointParentBusId}/endpoints`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                }
            );
            if (!res.ok) throw new Error("Failed to add endpoint.");
            await res.json();

            // Fetch refreshed I2C devices data
            const refreshRes = await fetch(`/api/devices/${deviceId}/i2c-devices`);
            if (!refreshRes.ok) throw new Error("Failed to fetch updated I2C devices");
            const refreshedDevices = await refreshRes.json();

            setI2cDevices(refreshedDevices);
            setOpenEndpointModal(false);
            setEndpointParentBusId("");
            setNewEndpointType("");
            setNewEndpointAddress("");
            setNewEndpointQoS(0);
            setNewEndpointNotes("");
            showSnackbar("Endpoint added successfully", "success");
        } catch (err: any) {
            console.error(err);
            showSnackbar("Failed to add endpoint", "error");
        }
    };

    // Fetch available MQTT services when the subscription modal opens
    useEffect(() => {
        if (subscribeModalOpen) {
            fetchMqttServices();
        }
    }, [subscribeModalOpen]);

    // Fetch MQTT service list
    const fetchMqttServices = async () => {
        try {
            setLoadingServices(true);
            const response = await fetch("/api/services");
            if (!response.ok) throw new Error("Failed to fetch services");

            const services = await response.json();
            // Filter to only include MQTT broker services
            const mqttServices = services.filter((service: any) =>
                service.type === "MQTT Broker");

            setAvailableServices(mqttServices);

            // Default select the first service if available
            if (mqttServices.length > 0) {
                setSelectedServiceId(mqttServices[0].id.toString());
            }
        } catch (error) {
            console.error("Error fetching MQTT services:", error);
            showSnackbar("Failed to load MQTT services", "error");
        } finally {
            setLoadingServices(false);
        }
    };

    // Open subscription modal
    const handleSubscribe = (endpoint: string) => {
        setSelectedEndpoint(endpoint);
        setSubscribeModalOpen(true);
    };

    // Submit the subscription to the selected MQTT service
    const handleSubmitSubscription = async () => {
        if (!selectedServiceId || !selectedEndpoint) {
            showSnackbar("Please select an MQTT service", "error");
            return;
        }

        try {
            const response = await fetch(`/api/services/subscribe/${selectedServiceId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    topic: selectedEndpoint,
                    qos: topicQoS
                })
            });

            if (!response.ok) throw new Error("Failed to add subscription");

            showSnackbar(`Subscribed to ${selectedEndpoint} with QoS ${topicQoS}`, "success");
            setSubscribeModalOpen(false);

            // Reset form fields
            setTopicQoS(0);
        } catch (error) {
            console.error("Error subscribing to topic:", error);
            showSnackbar("Failed to subscribe to topic", "error");
        }
    };

    // Render mobile-friendly screen cards
    const renderMobileScreenCards = () => (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {deviceScreens.length > 0 ? (
                deviceScreens.map(screen => (
                    <Card key={screen.id} elevation={1} sx={{ borderRadius: 2 }}>
                        <CardContent sx={{ pb: 1 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                                <Box>
                                    <Typography variant="subtitle2" fontWeight="bold" sx={{ fontSize: '0.9rem' }}>
                                        {screen.screenKey}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                                        Screen Key
                                    </Typography>
                                </Box>
                                <IconButton size="small" color="primary">
                                    <EditIcon fontSize="small" />
                                </IconButton>
                            </Box>

                            <Box sx={{ mb: 2 }}>
                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', mb: 0.5 }}>
                                    Display Name
                                </Typography>
                                <TextField
                                    fullWidth
                                    size="small"
                                    value={screen.displayName || ""}
                                    onChange={handleScreenTextChange(screen.id, 'displayName')}
                                    sx={{
                                        '& .MuiInputBase-input': {
                                            fontSize: '0.8rem',
                                            padding: '6px 8px'
                                        }
                                    }}
                                />
                            </Box>

                            <Box sx={{ mb: 2 }}>
                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', mb: 0.5 }}>
                                    Screen Layout
                                </Typography>
                                <FormControl fullWidth size="small">
                                    <Select
                                        value={screen.screenLayoutId || ""}
                                        onChange={handleScreenSelectChange(screen.id, 'screenLayoutId')}
                                        sx={{
                                            '& .MuiSelect-select': {
                                                fontSize: '0.8rem',
                                                padding: '6px 8px'
                                            }
                                        }}
                                    >
                                        {layoutTemplates.map((t: any) => (
                                            <MenuItem key={t.id} value={t.id}>{t.displayName}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Box>

                            <Box sx={{ mb: 2 }}>
                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', mb: 0.5 }}>
                                    Frame Layout
                                </Typography>
                                <FormControl fullWidth size="small">
                                    <Select
                                        value={screen.frameLayoutId || ""}
                                        onChange={handleFrameSelectChange(screen.id, 'frameLayoutId')}
                                        sx={{
                                            '& .MuiSelect-select': {
                                                fontSize: '0.8rem',
                                                padding: '6px 8px'
                                            }
                                        }}
                                    >
                                        {frameTemplates.map((t: any) => (
                                            <MenuItem key={t.id} value={t.id}>{t.displayName}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Box>

                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={screen.supportsConfigPayloads}
                                            onChange={handleScreenBooleanChange(screen.id, 'supportsConfigPayloads')}
                                            size="small"
                                        />
                                    }
                                    label={
                                        <Typography sx={{ fontSize: '0.8rem' }}>
                                            Config Payloads
                                        </Typography>
                                    }
                                />
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={screen.supportsSensorPayloads}
                                            onChange={handleScreenBooleanChange(screen.id, 'supportsSensorPayloads')}
                                            size="small"
                                        />
                                    }
                                    label={
                                        <Typography sx={{ fontSize: '0.8rem' }}>
                                            Sensor Payloads
                                        </Typography>
                                    }
                                />
                            </Box>
                        </CardContent>
                    </Card>
                ))
            ) : (
                <Card elevation={1}>
                    <CardContent sx={{ textAlign: 'center', py: 4 }}>
                        <ScreenshotIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                        <Typography variant="body2" color="text.secondary">
                            No device screens configured
                        </Typography>
                    </CardContent>
                </Card>
            )}
        </Box>
    );

    // Render mobile-friendly I2C device cards
    const renderMobileI2CCards = () => (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {i2cDevices.length > 0 ? (
                i2cDevices.map(device => (
                    <Card key={device.id} elevation={1} sx={{ borderRadius: 2 }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                                <Box>
                                    <Typography variant="subtitle2" fontWeight="bold" sx={{ fontSize: '0.9rem' }}>
                                        {device.i2CAddress}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                                        {device.deviceType}
                                    </Typography>
                                </Box>
                                <Chip
                                    label={device.isEnabled ? 'Enabled' : 'Disabled'}
                                    size="small"
                                    color={device.isEnabled ? 'success' : 'default'}
                                    sx={{ fontSize: '0.7rem' }}
                                />
                            </Box>

                            {device.endpoints && device.endpoints.length > 0 && (
                                <Box>
                                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', mb: 1 }}>
                                        Endpoints ({device.endpoints.length})
                                    </Typography>
                                    {device.endpoints.map((endpoint, index) => (
                                        <Box key={endpoint.id}>
                                            {index > 0 && <Divider sx={{ my: 1 }} />}
                                            <Box sx={{
                                                p: 1.5,
                                                bgcolor: 'rgba(0, 0, 0, 0.02)',
                                                borderRadius: 1,
                                                border: '1px solid rgba(0, 0, 0, 0.05)'
                                            }}>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                                                    <Box sx={{ flex: 1 }}>
                                                        <Typography variant="body2" fontWeight="medium" sx={{ fontSize: '0.8rem' }}>
                                                            {endpoint.endpointType}
                                                        </Typography>
                                                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>
                                                            {endpoint.address}
                                                        </Typography>
                                                    </Box>
                                                    <Chip
                                                        label={`QoS ${endpoint.qoS}`}
                                                        size="small"
                                                        variant="outlined"
                                                        sx={{ fontSize: '0.7rem', ml: 1 }}
                                                    />
                                                </Box>
                                                {endpoint.notes && (
                                                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem', mb: 1 }}>
                                                        {endpoint.notes}
                                                    </Typography>
                                                )}
                                                <Button
                                                    variant="outlined"
                                                    size="small"
                                                    startIcon={<SubscriptionsIcon />}
                                                    onClick={() => handleSubscribe(endpoint.address)}
                                                    fullWidth
                                                    sx={{ fontSize: '0.75rem' }}
                                                >
                                                    Subscribe to MQTT
                                                </Button>
                                            </Box>
                                        </Box>
                                    ))}
                                </Box>
                            )}

                            {(!device.endpoints || device.endpoints.length === 0) && (
                                <Box sx={{ textAlign: 'center', py: 2 }}>
                                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                                        No endpoints configured
                                    </Typography>
                                </Box>
                            )}
                        </CardContent>
                    </Card>
                ))
            ) : (
                <Card elevation={1}>
                    <CardContent sx={{ textAlign: 'center', py: 4 }}>
                        <MemoryIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                        <Typography variant="body2" color="text.secondary">
                            No I2C devices found
                        </Typography>
                    </CardContent>
                </Card>
            )}
        </Box>
    );

    // Render desktop table for screens - NO SAVE BUTTONS, AUTO-SAVE INSTEAD
    const renderDesktopScreensTable = () => (
        <TableContainer>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Screen Key</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Friendly Name</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Default Payload Layout</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Default FrameEngine Layout</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Supports Config Payloads</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Supports Sensor Payloads</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {deviceScreens.length > 0 ? (
                        deviceScreens.map(screen => (
                            <TableRow key={screen.id}>
                                <TableCell>{screen.screenKey}</TableCell>
                                <TableCell>
                                    <TextField
                                        size="small"
                                        value={screen.displayName || ""}
                                        onChange={handleScreenTextChange(screen.id, 'displayName')}
                                    />
                                </TableCell>
                                <TableCell>
                                    <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                                        <Select
                                            value={screen.screenLayoutId || ""}
                                            onChange={handleScreenSelectChange(screen.id, 'screenLayoutId')}
                                        >
                                            {layoutTemplates.map((t: any) => (
                                                <MenuItem key={t.id} value={t.id}>{t.displayName}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </TableCell>
                                <TableCell>
                                    <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                                        <Select
                                            value={screen.screenFrameId || ""}
                                            onChange={handleScreenSelectChange(screen.id, 'screenFrameId')}
                                        >
                                            {frameTemplates.map((t: any) => (
                                                <MenuItem key={t.id} value={t.id}>{t.displayName}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </TableCell>
                                <TableCell>
                                    <Switch
                                        checked={screen.supportsConfigPayloads}
                                        onChange={handleScreenBooleanChange(screen.id, 'supportsConfigPayloads')}
                                        size="small"
                                    />
                                </TableCell>
                                <TableCell>
                                    <Switch
                                        checked={screen.supportsSensorPayloads}
                                        onChange={handleScreenBooleanChange(screen.id, 'supportsSensorPayloads')}
                                        size="small"
                                    />
                                </TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={5} align="center">
                                <Typography variant="body2" color="text.secondary">
                                    No device screens configured
                                </Typography>
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );

    // Render desktop table for I2C devices
    const renderDesktopI2CTable = () => (
        <TableContainer>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>I2C Address</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Device Type</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Endpoint</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>MQTT Address</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Default QoS</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Notes</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Actions</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {i2cDevices.length > 0 ? (
                        i2cDevices.map(dev => (
                            <React.Fragment key={dev.id}>
                                <TableRow>
                                    <TableCell rowSpan={dev.endpoints.length || 1}>{dev.i2CAddress}</TableCell>
                                    <TableCell rowSpan={dev.endpoints.length || 1}>{dev.deviceType}</TableCell>
                                    {dev.endpoints.length > 0 ? (
                                        <>
                                            <TableCell>{dev.endpoints[0].endpointType}</TableCell>
                                            <TableCell>{dev.endpoints[0].address}</TableCell>
                                            <TableCell>{dev.endpoints[0].qoS}</TableCell>
                                            <TableCell>{dev.endpoints[0].notes}</TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="outlined"
                                                    size="small"
                                                    startIcon={<SubscriptionsIcon />}
                                                    onClick={() => handleSubscribe(dev.endpoints[0].address)}
                                                >
                                                    Subscribe
                                                </Button>
                                            </TableCell>
                                        </>
                                    ) : (
                                        <TableCell colSpan={5}>
                                            <Typography variant="body2" color="text.secondary">
                                                No endpoints
                                            </Typography>
                                        </TableCell>
                                    )}
                                </TableRow>
                                {dev.endpoints.slice(1).map(ep => (
                                    <TableRow key={ep.id}>
                                        <TableCell>{ep.endpointType}</TableCell>
                                        <TableCell>{ep.address}</TableCell>
                                        <TableCell>{ep.qoS}</TableCell>
                                        <TableCell>{ep.notes}</TableCell>
                                        <TableCell>
                                            <Button
                                                variant="outlined"
                                                size="small"
                                                startIcon={<SubscriptionsIcon />}
                                                onClick={() => handleSubscribe(ep.address)}
                                            >
                                                Subscribe
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </React.Fragment>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={7} align="center">
                                <Typography variant="body2" color="text.secondary">
                                    No I2C devices found
                                </Typography>
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );

    return (
        <Box>
            {/* Action Buttons for Adding Screens & I2C Devices */}
            {isCustom && (
                <Box sx={{
                    mb: 3,
                    display: "flex",
                    gap: isMobile ? 1 : 2,
                    flexDirection: isMobile ? 'column' : 'row',
                    flexWrap: 'wrap'
                }}>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => setOpenScreenModal(true)}
                        size={isMobile ? "small" : "medium"}
                        fullWidth={isMobile}
                        sx={{ fontSize: isMobile ? '0.8rem' : '0.875rem' }}
                    >
                        Add Device Screen
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => setOpenBusModal(true)}
                        size={isMobile ? "small" : "medium"}
                        fullWidth={isMobile}
                        sx={{ fontSize: isMobile ? '0.8rem' : '0.875rem' }}
                    >
                        Add I2C Bus
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => setOpenEndpointModal(true)}
                        size={isMobile ? "small" : "medium"}
                        fullWidth={isMobile}
                        sx={{ fontSize: isMobile ? '0.8rem' : '0.875rem' }}
                    >
                        Add I2C Endpoint
                    </Button>
                </Box>
            )}

            {/* Device Screens */}
            <Paper elevation={2} sx={{
                p: isMobile ? 2 : 3,
                mb: 3,
                borderRadius: 2,
                overflow: 'hidden'
            }}>
                <Typography variant="subtitle1" gutterBottom sx={{
                    display: 'flex',
                    alignItems: 'center',
                    mb: 2,
                    fontSize: isMobile ? '1rem' : '1.1rem'
                }}>
                    <ScreenshotIcon sx={{ mr: 1, fontSize: isMobile ? '1.1rem' : '1.2rem' }} />
                    Device Screens
                </Typography>

                {isMobile ? renderMobileScreenCards() : renderDesktopScreensTable()}
            </Paper>

            {/* I2C Devices and Endpoints */}
            <Paper elevation={2} sx={{
                p: isMobile ? 2 : 3,
                borderRadius: 2,
                overflow: 'hidden'
            }}>
                <Typography variant="subtitle1" gutterBottom sx={{
                    display: 'flex',
                    alignItems: 'center',
                    mb: 2,
                    fontSize: isMobile ? '1rem' : '1.1rem'
                }}>
                    <MemoryIcon sx={{ mr: 1, fontSize: isMobile ? '1.1rem' : '1.2rem' }} />
                    Device I2C Bus
                </Typography>

                {isMobile ? renderMobileI2CCards() : renderDesktopI2CTable()}
            </Paper>

            {/* Add Screen Modal */}
            <Modal open={openScreenModal} onClose={() => setOpenScreenModal(false)}>
                <Paper sx={modalStyle}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6" sx={{ fontSize: isMobile ? '1.1rem' : '1.25rem' }}>
                            Add Device Screen
                        </Typography>
                        {isMobile && (
                            <IconButton onClick={() => setOpenScreenModal(false)} size="small">
                                <CloseIcon />
                            </IconButton>
                        )}
                    </Box>
                    <TextField
                        fullWidth
                        label="Screen Key"
                        size="small"
                        value={newScreenKey}
                        onChange={e => setNewScreenKey(e.target.value)}
                        sx={{
                            mb: 2,
                            '& .MuiInputBase-input': {
                                fontSize: isMobile ? '0.8rem' : '0.875rem'
                            }
                        }}
                    />
                    <TextField
                        fullWidth
                        label="Display Name"
                        size="small"
                        value={newScreenDisplayName}
                        onChange={e => setNewScreenDisplayName(e.target.value)}
                        sx={{
                            mb: 2,
                            '& .MuiInputBase-input': {
                                fontSize: isMobile ? '0.8rem' : '0.875rem'
                            }
                        }}
                    />
                    <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                        <InputLabel>Screen Layout</InputLabel>
                        <Select
                            label="Layout"
                            value={newScreenScreenLayoutId}
                            onChange={e => setNewScreenScreenLayoutId(Number(e.target.value))}
                            sx={{
                                '& .MuiSelect-select': {
                                    fontSize: isMobile ? '0.8rem' : '0.875rem'
                                }
                            }}
                        >
                            {layoutTemplates.map((t: any) => (
                                <MenuItem key={t.id} value={t.id}>{t.displayName}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                        <InputLabel>Frame Layout</InputLabel>
                        <Select
                            label="Layout"
                            value={newScreenFrameLayoutId}
                            onChange={e => setNewScreenFrameLayoutId(Number(e.target.value))}
                            sx={{
                                '& .MuiSelect-select': {
                                    fontSize: isMobile ? '0.8rem' : '0.875rem'
                                }
                            }}
                        >
                            {frameTemplates.map((t: any) => (
                                <MenuItem key={t.id} value={t.id}>{t.displayName}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControlLabel
                        control={
                            <Switch
                                checked={newScreenSupportsConfigPayloads}
                                onChange={() => setNewScreenSupportsConfigPayloads(!newScreenSupportsConfigPayloads)}
                                size="small"
                            />
                        }
                        label={
                            <Typography sx={{ fontSize: isMobile ? '0.8rem' : '0.875rem' }}>
                                Supports Config Payloads
                            </Typography>
                        }
                    />
                    <FormControlLabel
                        control={
                            <Switch
                                checked={newScreenSupportsSensorPayloads}
                                onChange={() => setNewScreenSupportsSensorPayloads(!newScreenSupportsSensorPayloads)}
                                size="small"
                            />
                        }
                        label={
                            <Typography sx={{ fontSize: isMobile ? '0.8rem' : '0.875rem' }}>
                                Supports Sensor Payloads
                            </Typography>
                        }
                    />
                    <Box sx={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        mt: 2,
                        gap: 1,
                        flexDirection: isMobile ? 'column-reverse' : 'row'
                    }}>
                        <Button
                            onClick={() => setOpenScreenModal(false)}
                            fullWidth={isMobile}
                            sx={{ fontSize: isMobile ? '0.8rem' : '0.875rem' }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="contained"
                            onClick={handleAddScreen}
                            disabled={!newScreenKey || !newScreenDisplayName || !newScreenScreenLayoutId || !newScreenFrameLayoutId}
                            fullWidth={isMobile}
                            sx={{ fontSize: isMobile ? '0.8rem' : '0.875rem' }}
                        >
                            Add
                        </Button>
                    </Box>
                </Paper>
            </Modal>

            {/* Add I2C Bus Modal */}
            <Modal open={openBusModal} onClose={() => setOpenBusModal(false)}>
                <Paper sx={modalStyle}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6" sx={{ fontSize: isMobile ? '1.1rem' : '1.25rem' }}>
                            Add Device I2C Bus
                        </Typography>
                        {isMobile && (
                            <IconButton onClick={() => setOpenBusModal(false)} size="small">
                                <CloseIcon />
                            </IconButton>
                        )}
                    </Box>
                    <TextField
                        fullWidth
                        label="I2C Address"
                        size="small"
                        value={newBusAddress}
                        onChange={e => setNewBusAddress(e.target.value)}
                        sx={{
                            mb: 2,
                            '& .MuiInputBase-input': {
                                fontSize: isMobile ? '0.8rem' : '0.875rem'
                            }
                        }}
                    />
                    <TextField
                        fullWidth
                        label="Device Type"
                        size="small"
                        value={newBusDeviceType}
                        onChange={e => setNewBusDeviceType(e.target.value)}
                        sx={{
                            mb: 2,
                            '& .MuiInputBase-input': {
                                fontSize: isMobile ? '0.8rem' : '0.875rem'
                            }
                        }}
                    />
                    <TextField
                        fullWidth
                        label="Comm Protocol"
                        size="small"
                        value={newBusProtocol}
                        onChange={e => setNewBusProtocol(e.target.value)}
                        sx={{
                            mb: 2,
                            '& .MuiInputBase-input': {
                                fontSize: isMobile ? '0.8rem' : '0.875rem'
                            }
                        }}
                    />
                    <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                        <InputLabel>Enabled</InputLabel>
                        <Select
                            label="Enabled"
                            value={newBusEnabled ? "Yes" : "No"}
                            onChange={e => setNewBusEnabled(e.target.value === "Yes")}
                            sx={{
                                '& .MuiSelect-select': {
                                    fontSize: isMobile ? '0.8rem' : '0.875rem'
                                }
                            }}
                        >
                            <MenuItem value="Yes">Yes</MenuItem>
                            <MenuItem value="No">No</MenuItem>
                        </Select>
                    </FormControl>
                    <Box sx={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        mt: 2,
                        gap: 1,
                        flexDirection: isMobile ? 'column-reverse' : 'row'
                    }}>
                        <Button
                            onClick={() => setOpenBusModal(false)}
                            fullWidth={isMobile}
                            sx={{ fontSize: isMobile ? '0.8rem' : '0.875rem' }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="contained"
                            onClick={handleAddBus}
                            disabled={!newBusAddress || !newBusDeviceType}
                            fullWidth={isMobile}
                            sx={{ fontSize: isMobile ? '0.8rem' : '0.875rem' }}
                        >
                            Add
                        </Button>
                    </Box>
                </Paper>
            </Modal>

            {/* Add I2C Endpoint Modal */}
            <Modal open={openEndpointModal} onClose={() => setOpenEndpointModal(false)}>
                <Paper sx={modalStyle}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6" sx={{ fontSize: isMobile ? '1.1rem' : '1.25rem' }}>
                            Add Device I2C Endpoint
                        </Typography>
                        {isMobile && (
                            <IconButton onClick={() => setOpenEndpointModal(false)} size="small">
                                <CloseIcon />
                            </IconButton>
                        )}
                    </Box>
                    <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                        <InputLabel>Parent Bus</InputLabel>
                        <Select
                            label="Parent Bus"
                            value={endpointParentBusId}
                            onChange={e => setEndpointParentBusId(Number(e.target.value))}
                            sx={{
                                '& .MuiSelect-select': {
                                    fontSize: isMobile ? '0.8rem' : '0.875rem'
                                }
                            }}
                        >
                            {i2cDevices.map(bus => (
                                <MenuItem key={bus.id} value={bus.id}>
                                    {bus.i2CAddress} ({bus.deviceType})
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <TextField
                        fullWidth
                        label="Endpoint Type"
                        size="small"
                        value={newEndpointType}
                        onChange={e => setNewEndpointType(e.target.value)}
                        sx={{
                            mb: 2,
                            '& .MuiInputBase-input': {
                                fontSize: isMobile ? '0.8rem' : '0.875rem'
                            }
                        }}
                    />
                    <TextField
                        fullWidth
                        label="Address"
                        size="small"
                        value={newEndpointAddress}
                        onChange={e => setNewEndpointAddress(e.target.value)}
                        sx={{
                            mb: 2,
                            '& .MuiInputBase-input': {
                                fontSize: isMobile ? '0.8rem' : '0.875rem'
                            }
                        }}
                    />
                    <TextField
                        fullWidth
                        label="QoS"
                        size="small"
                        type="number"
                        value={newEndpointQoS}
                        onChange={e => setNewEndpointQoS(Number(e.target.value))}
                        sx={{
                            mb: 2,
                            '& .MuiInputBase-input': {
                                fontSize: isMobile ? '0.8rem' : '0.875rem'
                            }
                        }}
                    />
                    <TextField
                        fullWidth
                        label="Notes"
                        size="small"
                        value={newEndpointNotes}
                        onChange={e => setNewEndpointNotes(e.target.value)}
                        sx={{
                            mb: 2,
                            '& .MuiInputBase-input': {
                                fontSize: isMobile ? '0.8rem' : '0.875rem'
                            }
                        }}
                    />
                    <Box sx={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        mt: 2,
                        gap: 1,
                        flexDirection: isMobile ? 'column-reverse' : 'row'
                    }}>
                        <Button
                            onClick={() => setOpenEndpointModal(false)}
                            fullWidth={isMobile}
                            sx={{ fontSize: isMobile ? '0.8rem' : '0.875rem' }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="contained"
                            onClick={handleAddEndpoint}
                            disabled={!endpointParentBusId || !newEndpointType || !newEndpointAddress}
                            fullWidth={isMobile}
                            sx={{ fontSize: isMobile ? '0.8rem' : '0.875rem' }}
                        >
                            Add
                        </Button>
                    </Box>
                </Paper>
            </Modal>

            {/* Subscribe to Topic Modal */}
            <Modal open={subscribeModalOpen} onClose={() => setSubscribeModalOpen(false)}>
                <Paper sx={modalStyle}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6" sx={{ fontSize: isMobile ? '1.1rem' : '1.25rem' }}>
                            Subscribe to I2C Endpoint
                        </Typography>
                        {isMobile && (
                            <IconButton onClick={() => setSubscribeModalOpen(false)} size="small">
                                <CloseIcon />
                            </IconButton>
                        )}
                    </Box>

                    <Box sx={{ mb: 3 }}>
                        <Typography variant="body1" sx={{ mb: 1, fontSize: isMobile ? '0.9rem' : '1rem' }}>
                            <strong>Topic:</strong> {selectedEndpoint}
                        </Typography>

                        {loadingServices ? (
                            <Box display="flex" justifyContent="center" my={2}>
                                <CircularProgress size={24} />
                            </Box>
                        ) : (
                            <>
                                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                                    <InputLabel>MQTT Service</InputLabel>
                                    <Select
                                        label="MQTT Service"
                                        value={selectedServiceId}
                                        onChange={e => setSelectedServiceId(e.target.value)}
                                        sx={{
                                            '& .MuiSelect-select': {
                                                fontSize: isMobile ? '0.8rem' : '0.875rem'
                                            }
                                        }}
                                    >
                                        {availableServices.length === 0 ? (
                                            <MenuItem value="" disabled>
                                                No MQTT services available
                                            </MenuItem>
                                        ) : (
                                            availableServices.map(service => (
                                                <MenuItem key={service.id} value={service.id}>
                                                    {service.name} ({service.mqttBrokerAddress}:{service.mqttBrokerPort})
                                                </MenuItem>
                                            ))
                                        )}
                                    </Select>
                                </FormControl>

                                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                                    <InputLabel>QoS Level</InputLabel>
                                    <Select
                                        label="QoS Level"
                                        value={topicQoS}
                                        onChange={e => setTopicQoS(Number(e.target.value))}
                                        sx={{
                                            '& .MuiSelect-select': {
                                                fontSize: isMobile ? '0.8rem' : '0.875rem'
                                            }
                                        }}
                                    >
                                        <MenuItem value={0}>0 - At most once</MenuItem>
                                        <MenuItem value={1}>1 - At least once</MenuItem>
                                        <MenuItem value={2}>2 - Exactly once</MenuItem>
                                    </Select>
                                </FormControl>
                            </>
                        )}
                    </Box>

                    <Box sx={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        mt: 2,
                        gap: 1,
                        flexDirection: isMobile ? 'column-reverse' : 'row'
                    }}>
                        <Button
                            onClick={() => setSubscribeModalOpen(false)}
                            fullWidth={isMobile}
                            sx={{ fontSize: isMobile ? '0.8rem' : '0.875rem' }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="contained"
                            onClick={handleSubmitSubscription}
                            disabled={loadingServices || !selectedServiceId}
                            fullWidth={isMobile}
                            sx={{ fontSize: isMobile ? '0.8rem' : '0.875rem' }}
                        >
                            Subscribe
                        </Button>
                    </Box>
                </Paper>
            </Modal>
        </Box>
    );
};

export default DeviceScreensPanel;