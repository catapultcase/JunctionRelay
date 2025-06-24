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
    Typography, Box, Paper, Button, Modal, FormControl, InputLabel, Select,
    MenuItem, TextField, Table, TableHead, TableRow, TableCell, TableBody,
    TableContainer, CircularProgress, FormControlLabel, Switch
} from "@mui/material";
import ScreenshotIcon from '@mui/icons-material/Screenshot';
import MemoryIcon from '@mui/icons-material/Memory';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import SubscriptionsIcon from '@mui/icons-material/Subscriptions';

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
    isCustom: boolean;
    showSnackbar: (message: string, severity: "success" | "error" | "warning" | "info") => void;
}

const modalStyle = {
    position: "absolute" as const,
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: 400,
    bgcolor: "background.paper",
    boxShadow: 24,
    p: 4,
    borderRadius: 2,
};

const DeviceScreensPanel: React.FC<DeviceScreensPanelProps> = ({
    deviceId,
    deviceScreens,
    setDeviceScreens,
    i2cDevices,
    setI2cDevices,
    layoutTemplates,
    isCustom,
    showSnackbar
}) => {
    // Modal state for screens
    const [openScreenModal, setOpenScreenModal] = useState(false);
    const [newScreenKey, setNewScreenKey] = useState("");
    const [newScreenDisplayName, setNewScreenDisplayName] = useState("");
    const [newScreenScreenLayoutId, setNewScreenScreenLayoutId] = useState<number | "">("");
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

    // Add new screen
    const handleAddScreen = async () => {
        try {
            const payload = {
                deviceId: Number(deviceId),
                screenKey: newScreenKey,
                displayName: newScreenDisplayName,
                screenLayoutId: newScreenScreenLayoutId,
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
            setDeviceScreens([...deviceScreens, created]);
            setOpenScreenModal(false);
            setNewScreenKey("");
            setNewScreenDisplayName("");
            setNewScreenScreenLayoutId("");
            setNewScreenSupportsConfigPayloads(true);
            setNewScreenSupportsSensorPayloads(true);
            showSnackbar("Screen added successfully", "success");
        } catch (err: any) {
            console.error(err);
            showSnackbar("Failed to add screen", "error");
        }
    };

    // Update device screen
    const updateDeviceScreen = async (screen: any) => {
        try {
            const res = await fetch(`/api/devices/${screen.deviceId}/screens/${screen.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    displayName: screen.displayName,
                    screenLayoutId: screen.screenLayoutId,
                    supportsConfigPayloads: screen.supportsConfigPayloads,
                    supportsSensorPayloads: screen.supportsSensorPayloads
                })
            });
            if (!res.ok) throw new Error("Failed to update screen.");
            showSnackbar("Screen updated successfully", "success");
        } catch (error) {
            console.error("Error updating screen:", error);
            showSnackbar("Failed to update screen", "error");
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

    // Handle MQTT subscription
    const [subscribeModalOpen, setSubscribeModalOpen] = useState(false);
    const [selectedEndpoint, setSelectedEndpoint] = useState<string>("");
    const [availableServices, setAvailableServices] = useState<any[]>([]);
    const [selectedServiceId, setSelectedServiceId] = useState<string>("");
    const [topicQoS, setTopicQoS] = useState<number>(0);
    const [loadingServices, setLoadingServices] = useState(false);

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

    return (
        <Box>
            {/* Action Buttons for Adding Screens & I2C Devices */}
            {isCustom && (
                <Box sx={{ mb: 3, display: "flex", gap: 2 }}>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => setOpenScreenModal(true)}
                    >
                        Add Device Screen
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => setOpenBusModal(true)}
                    >
                        Add I2C Bus
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => setOpenEndpointModal(true)}
                    >
                        Add I2C Endpoint
                    </Button>
                </Box>
            )}

            {/* Device Screens */}
            <Paper elevation={2} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
                <Typography variant="subtitle1" gutterBottom sx={{
                    display: 'flex',
                    alignItems: 'center',
                    mb: 2
                }}>
                    <ScreenshotIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                    Device Screens
                </Typography>

                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Screen Key</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Friendly Name</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Default Screen Layout</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Supports Config Payloads</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Supports Sensor Payloads</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Actions</TableCell>
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
                                                onChange={e => {
                                                    const updatedScreens = [...deviceScreens];
                                                    const idx = updatedScreens.findIndex(s => s.id === screen.id);
                                                    updatedScreens[idx].displayName = e.target.value;
                                                    setDeviceScreens(updatedScreens);
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <FormControl fullWidth size="small">
                                                <Select
                                                    value={screen.screenLayoutId || ""}
                                                    onChange={e => {
                                                        const updatedScreens = [...deviceScreens];
                                                        const idx = updatedScreens.findIndex(s => s.id === screen.id);
                                                        updatedScreens[idx].screenLayoutId = Number(e.target.value);
                                                        setDeviceScreens(updatedScreens);
                                                    }}
                                                >
                                                    {layoutTemplates.map((t: any) => (
                                                        <MenuItem key={t.id} value={t.id}>{t.displayName}</MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                        </TableCell>
                                        <TableCell>
                                            <Switch
                                                checked={screen.supportsConfigPayloads}
                                                onChange={() => {
                                                    const updatedScreens = [...deviceScreens];
                                                    const idx = updatedScreens.findIndex(s => s.id === screen.id);
                                                    updatedScreens[idx].supportsConfigPayloads = !updatedScreens[idx].supportsConfigPayloads;
                                                    setDeviceScreens(updatedScreens);
                                                }}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Switch
                                                checked={screen.supportsSensorPayloads}
                                                onChange={() => {
                                                    const updatedScreens = [...deviceScreens];
                                                    const idx = updatedScreens.findIndex(s => s.id === screen.id);
                                                    updatedScreens[idx].supportsSensorPayloads = !updatedScreens[idx].supportsSensorPayloads;
                                                    setDeviceScreens(updatedScreens);
                                                }}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="outlined"
                                                size="small"
                                                startIcon={<SaveIcon />}
                                                onClick={() => updateDeviceScreen(screen)}
                                            >
                                                Save
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} align="center">
                                        <Typography variant="body2" color="text.secondary">
                                            No device screens configured
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            {/* I2C Devices and Endpoints */}
            <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
                <Typography variant="subtitle1" gutterBottom sx={{
                    display: 'flex',
                    alignItems: 'center',
                    mb: 2
                }}>
                    <MemoryIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                    Device I2C Bus
                </Typography>

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
            </Paper>

            {/* Add Screen Modal */}
            <Modal open={openScreenModal} onClose={() => setOpenScreenModal(false)}>
                <Paper sx={modalStyle}>
                    <Typography variant="h6" gutterBottom>Add Device Screen</Typography>
                    <TextField
                        fullWidth label="Screen Key" size="small"
                        value={newScreenKey}
                        onChange={e => setNewScreenKey(e.target.value)}
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        fullWidth label="Display Name" size="small"
                        value={newScreenDisplayName}
                        onChange={e => setNewScreenDisplayName(e.target.value)}
                        sx={{ mb: 2 }}
                    />
                    <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                        <InputLabel>Layout</InputLabel>
                        <Select
                            label="Layout"
                            value={newScreenScreenLayoutId}
                            onChange={e => setNewScreenScreenLayoutId(Number(e.target.value))}
                        >
                            {layoutTemplates.map((t: any) => (
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
                        label="Supports Config Payloads"
                    />
                    <FormControlLabel
                        control={
                            <Switch
                                checked={newScreenSupportsSensorPayloads}
                                onChange={() => setNewScreenSupportsSensorPayloads(!newScreenSupportsSensorPayloads)}
                                size="small"
                            />
                        }
                        label="Supports Sensor Payloads"
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Button onClick={() => setOpenScreenModal(false)} sx={{ mr: 1 }}>Cancel</Button>
                        <Button
                            variant="contained"
                            onClick={handleAddScreen}
                            disabled={!newScreenKey || !newScreenDisplayName || !newScreenScreenLayoutId}
                        >
                            Add
                        </Button>
                    </Box>
                </Paper>
            </Modal>

            {/* Add I2C Bus Modal */}
            <Modal open={openBusModal} onClose={() => setOpenBusModal(false)}>
                <Paper sx={modalStyle}>
                    <Typography variant="h6" gutterBottom>Add Device I2C Bus</Typography>
                    <TextField
                        fullWidth label="I2C Address" size="small"
                        value={newBusAddress}
                        onChange={e => setNewBusAddress(e.target.value)}
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        fullWidth label="Device Type" size="small"
                        value={newBusDeviceType}
                        onChange={e => setNewBusDeviceType(e.target.value)}
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        fullWidth label="Comm Protocol" size="small"
                        value={newBusProtocol}
                        onChange={e => setNewBusProtocol(e.target.value)}
                        sx={{ mb: 2 }}
                    />
                    <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                        <InputLabel>Enabled</InputLabel>
                        <Select
                            label="Enabled"
                            value={newBusEnabled ? "Yes" : "No"}
                            onChange={e => setNewBusEnabled(e.target.value === "Yes")}
                        >
                            <MenuItem value="Yes">Yes</MenuItem>
                            <MenuItem value="No">No</MenuItem>
                        </Select>
                    </FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Button onClick={() => setOpenBusModal(false)} sx={{ mr: 1 }}>Cancel</Button>
                        <Button
                            variant="contained"
                            onClick={handleAddBus}
                            disabled={!newBusAddress || !newBusDeviceType}
                        >
                            Add
                        </Button>
                    </Box>
                </Paper>
            </Modal>

            {/* Add I2C Endpoint Modal */}
            <Modal open={openEndpointModal} onClose={() => setOpenEndpointModal(false)}>
                <Paper sx={modalStyle}>
                    <Typography variant="h6" gutterBottom>Add Device I2C Endpoint</Typography>
                    <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                        <InputLabel>Parent Bus</InputLabel>
                        <Select
                            label="Parent Bus"
                            value={endpointParentBusId}
                            onChange={e => setEndpointParentBusId(Number(e.target.value))}
                        >
                            {i2cDevices.map(bus => (
                                <MenuItem key={bus.id} value={bus.id}>
                                    {bus.i2CAddress} ({bus.deviceType})
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <TextField
                        fullWidth label="Endpoint Type" size="small"
                        value={newEndpointType}
                        onChange={e => setNewEndpointType(e.target.value)}
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        fullWidth label="Address" size="small"
                        value={newEndpointAddress}
                        onChange={e => setNewEndpointAddress(e.target.value)}
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        fullWidth label="QoS" size="small" type="number"
                        value={newEndpointQoS}
                        onChange={e => setNewEndpointQoS(Number(e.target.value))}
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        fullWidth label="Notes" size="small"
                        value={newEndpointNotes}
                        onChange={e => setNewEndpointNotes(e.target.value)}
                        sx={{ mb: 2 }}
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Button onClick={() => setOpenEndpointModal(false)} sx={{ mr: 1 }}>Cancel</Button>
                        <Button
                            variant="contained"
                            onClick={handleAddEndpoint}
                            disabled={!endpointParentBusId || !newEndpointType || !newEndpointAddress}
                        >
                            Add
                        </Button>
                    </Box>
                </Paper>
            </Modal>

            {/* Subscribe to Topic Modal */}
            <Modal open={subscribeModalOpen} onClose={() => setSubscribeModalOpen(false)}>
                <Paper sx={modalStyle}>
                    <Typography variant="h6" gutterBottom>Subscribe to I2C Endpoint</Typography>

                    <Box sx={{ mb: 3 }}>
                        <Typography variant="body1" sx={{ mb: 1 }}>
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
                                    >
                                        <MenuItem value={0}>0 - At most once</MenuItem>
                                        <MenuItem value={1}>1 - At least once</MenuItem>
                                        <MenuItem value={2}>2 - Exactly once</MenuItem>
                                    </Select>
                                </FormControl>
                            </>
                        )}
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Button
                            onClick={() => setSubscribeModalOpen(false)}
                            sx={{ mr: 1 }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="contained"
                            onClick={handleSubmitSubscription}
                            disabled={loadingServices || !selectedServiceId}
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