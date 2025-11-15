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
    Modal,
    TextField,
    Alert,
    Switch,
    FormControlLabel,
    Divider,
    Grid,
} from "@mui/material";

// Icon imports
import DevicesOtherIcon from '@mui/icons-material/DevicesOther';

interface Device_AddVirtualDeviceModalProps {
    open: boolean;
    onClose: () => void;
    onDeviceAdded: () => void;
}

const Device_AddVirtualDeviceModal: React.FC<Device_AddVirtualDeviceModalProps> = ({
    open,
    onClose,
    onDeviceAdded
}) => {
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        ipAddress: "",
        webSocketPort: 8084,
        mode1Enabled: true,
        mode1PollRate: 5000,
        mode2Enabled: true,
        mode2SendRate: 5000,
        mode3Enabled: false
    });

    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Reset form when modal opens/closes
    useEffect(() => {
        if (open) {
            setError(null);
            setLoading(false);
            setFormData({
                name: "",
                description: "",
                ipAddress: "",
                webSocketPort: 8084,
                mode1Enabled: true,
                mode1PollRate: 5000,
                mode2Enabled: true,
                mode2SendRate: 5000,
                mode3Enabled: false
            });
        }
    }, [open]);

    // Generate a fake MAC address for virtual device
    const generateVirtualMac = (): string => {
        // Use 'VD' prefix to indicate virtual device
        const prefix = "VD";
        const segments = [];

        // Generate 5 random hex segments (2 chars each)
        for (let i = 0; i < 5; i++) {
            const segment = Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
            segments.push(segment);
        }

        return `${prefix}:${segments.join(':')}`;
    };

    // Handle form field changes
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Handle toggle changes
    const handleToggleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, [field]: e.target.checked }));
    };

    // Handle form submission
    const handleSubmit = async () => {
        const { name, description, ipAddress, webSocketPort } = formData;

        // Validation
        if (!name.trim()) {
            setError("Virtual Device Name is required.");
            return;
        }

        if (!ipAddress.trim()) {
            setError("IP Address is required.");
            return;
        }

        // Validate WebSocket port
        if (webSocketPort < 1 || webSocketPort > 65535) {
            setError("WebSocket port must be between 1 and 65535.");
            return;
        }

        try {
            setLoading(true);

            // Create payload for virtual device
            const payload = {
                Name: name.trim(),
                Description: description.trim() || `Virtual device: ${name.trim()}`,
                UniqueIdentifier: generateVirtualMac(),
                Type: "VirtualDevice",
                Status: "Active",

                // Virtual devices don't need physical connection details
                IPAddress: ipAddress.trim(),
                COMPort: "",

                // Network ports
                HttpPort: 80,
                WebSocketPort: webSocketPort,
                MqttPort: 1883,
                Hostname: "",

                // Disable heartbeat monitoring for virtual devices
                HeartbeatEnabled: false,
                HeartbeatProtocol: "HTTP",
                HeartbeatTarget: "",
                HeartbeatExpectedValue: "",
                HeartbeatIntervalMs: 60000,
                HeartbeatGracePeriodMs: 180000,
                HeartbeatMaxRetryAttempts: 3,

                // Disable SSH for virtual devices
                SshUsername: "",
                SshPassword: "",
                SshPort: 22,
                SshTimeoutMs: 10000,
                SshPrivateKey: "",
                UseSshKeyAuth: false,
                SshConnectionRetries: 3,
                SshVerifyHostKey: true,

                // Set appropriate capabilities for virtual devices
                HasOnboardScreen: false,
                HasOnboardLED: false,
                HasOnboardRGBLED: false,
                HasExternalNeopixels: false,
                HasExternalMatrix: false,
                HasExternalI2CDevices: false,
                SupportsEthernet: false, // Virtual - no physical connections
                SupportsWiFi: false,
                SupportsBLE: false,
                SupportsUSB: false,
                SupportsESPNow: false,
                SupportsHTTP: true, // Can send/receive HTTP data
                SupportsMQTT: true, // Can send/receive MQTT data
                SupportsWebSockets: true, // Can send/receive WebSocket data
                HasButtons: false,
                HasBattery: false,
                HasSpeaker: false,
                HasMicroSD: false,
                IsGateway: false,

                // VirtualDevice mode configuration
                VirtualDevice_Mode1_Enabled: formData.mode1Enabled,
                VirtualDevice_Mode1_PollRate: formData.mode1PollRate,
                VirtualDevice_Mode2_Enabled: formData.mode2Enabled,
                VirtualDevice_Mode2_SendRate: formData.mode2SendRate,
                VirtualDevice_Mode3_Enabled: formData.mode3Enabled
            };

            console.log('AddVirtualDeviceModal: Submitting payload:', payload);

            const response = await fetch("/api/virtualdevices", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const result = await response.json();
            console.log('AddVirtualDeviceModal: Server response:', result);

            if (!response.ok) {
                throw new Error(result.message || "Failed to create virtual device");
            }

            // Success - close modal and refresh device list
            onDeviceAdded();
            onClose();

        } catch (err: any) {
            console.error('AddVirtualDeviceModal: Submit error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose}>
            <Box
                sx={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: { xs: '95%', sm: '90%', md: '75%' },
                    maxWidth: 800,
                    maxHeight: '90vh',
                    bgcolor: "background.paper",
                    p: { xs: 2, md: 3 },
                    boxShadow: 24,
                    borderRadius: 2,
                    overflow: 'auto',
                }}
            >
                {/* Modal Header */}
                <Typography variant="h6" gutterBottom sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DevicesOtherIcon />
                    Add Virtual Device
                </Typography>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Create a virtual device for testing, simulation, or as a placeholder for future physical devices.
                    Virtual devices can send and receive data through standard protocols without physical hardware.
                </Typography>

                {/* Error Alert */}
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

                {/* Form Fields - Two Column Layout */}
                <Grid container spacing={3} sx={{ mb: 3 }}>
                    {/* Left Column - Basic Fields */}
                    <Grid item xs={12} md={6}>
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <TextField
                                fullWidth
                                label="Virtual Device Name"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                size="small"
                                required
                                error={!!error && !formData.name.trim()}
                                helperText="A friendly name for this virtual device"
                                placeholder="Virtual Temperature Sensor"
                            />

                            <TextField
                                fullWidth
                                label="Description"
                                name="description"
                                value={formData.description}
                                onChange={handleChange}
                                size="small"
                                helperText="Optional description"
                                multiline
                                rows={2}
                                placeholder="Virtual device for testing"
                            />

                            <TextField
                                fullWidth
                                label="IP Address"
                                name="ipAddress"
                                value={formData.ipAddress}
                                onChange={handleChange}
                                size="small"
                                required
                                error={!!error && !formData.ipAddress.trim()}
                                helperText="IP address where the VirtualDevice is running"
                                placeholder="192.168.1.100"
                            />

                            <TextField
                                fullWidth
                                label="WebSocket Port"
                                name="webSocketPort"
                                type="number"
                                value={formData.webSocketPort}
                                onChange={handleChange}
                                size="small"
                                helperText="Default: 8084"
                                placeholder="8084"
                                slotProps={{
                                    htmlInput: {
                                        min: 1,
                                        max: 65535
                                    }
                                }}
                            />
                        </Box>
                    </Grid>

                    {/* Right Column - Mode Configuration */}
                    <Grid item xs={12} md={6}>
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                            <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 'bold' }}>
                                Mode Configuration
                            </Typography>

                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={formData.mode1Enabled}
                                        onChange={handleToggleChange('mode1Enabled')}
                                        color="primary"
                                    />
                                }
                                label={
                                    <Box>
                                        <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                            Mode 1: Collector
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Collect system metrics
                                        </Typography>
                                    </Box>
                                }
                            />

                            {formData.mode1Enabled && (
                                <TextField
                                    label="Poll Rate (ms)"
                                    name="mode1PollRate"
                                    type="number"
                                    value={formData.mode1PollRate}
                                    onChange={handleChange}
                                    size="small"
                                    sx={{ ml: 4, width: '200px' }}
                                />
                            )}

                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={formData.mode2Enabled}
                                        onChange={handleToggleChange('mode2Enabled')}
                                        color="primary"
                                    />
                                }
                                label={
                                    <Box>
                                        <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                            Mode 2: Display
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Receive frames from junctions
                                        </Typography>
                                    </Box>
                                }
                            />

                            {formData.mode2Enabled && (
                                <TextField
                                    label="Send Rate (ms)"
                                    name="mode2SendRate"
                                    type="number"
                                    value={formData.mode2SendRate}
                                    onChange={handleChange}
                                    size="small"
                                    sx={{ ml: 4, width: '200px' }}
                                />
                            )}

                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={formData.mode3Enabled}
                                        onChange={handleToggleChange('mode3Enabled')}
                                        color="primary"
                                    />
                                }
                                label={
                                    <Box>
                                        <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                            Mode 3: Self-Monitor
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Standalone monitoring
                                        </Typography>
                                    </Box>
                                }
                            />
                        </Box>
                    </Grid>
                </Grid>

                {/* Action Buttons */}
                <Box sx={{
                    display: "flex",
                    gap: 2,
                    flexDirection: { xs: 'column', sm: 'row' },
                    justifyContent: 'flex-end'
                }}>
                    <Button
                        variant="outlined"
                        onClick={onClose}
                        disabled={loading}
                        sx={{ order: { xs: 2, sm: 1 } }}
                    >
                        Cancel
                    </Button>

                    <Button
                        variant="contained"
                        onClick={handleSubmit}
                        disabled={loading || !formData.name.trim() || !formData.ipAddress.trim()}
                        startIcon={<DevicesOtherIcon />}
                        sx={{ order: { xs: 1, sm: 2 } }}
                    >
                        {loading ? "Creating..." : "Add Virtual Device"}
                    </Button>
                </Box>
            </Box>
        </Modal>
    );
};

export default Device_AddVirtualDeviceModal;