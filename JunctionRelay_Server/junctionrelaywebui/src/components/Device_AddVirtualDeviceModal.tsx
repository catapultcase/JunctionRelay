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
        webSocketPort: 8081
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
                webSocketPort: 8081
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

    // Handle form submission
    const handleSubmit = async () => {
        const { name, description, ipAddress, webSocketPort } = formData;

        // Validation - only name is required
        if (!name.trim()) {
            setError("Virtual Device Name is required.");
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
                Type: "Virtual Device",
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
                IsGateway: false
            };

            console.log('AddVirtualDeviceModal: Submitting payload:', payload);

            const response = await fetch("/api/devices", {
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
                    width: { xs: '95%', sm: '85%', md: '60%' },
                    maxWidth: 500,
                    bgcolor: "background.paper",
                    p: { xs: 2, md: 3 },
                    boxShadow: 24,
                    borderRadius: 2,
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

                {/* Form Fields */}
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mb: 3 }}>
                    <TextField
                        fullWidth
                        label="Virtual Device Name *"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        size="small"
                        required
                        error={!!error && !formData.name.trim()}
                        helperText="A friendly name for this virtual device (e.g., 'Test Sensor', 'Simulated Gateway')"
                        placeholder="Virtual Temperature Sensor"
                    />

                    <TextField
                        fullWidth
                        label="Description"
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        size="small"
                        helperText="Optional description of the virtual device's purpose"
                        multiline
                        rows={2}
                        placeholder="Virtual device for testing temperature data flows"
                    />

                    <TextField
                        fullWidth
                        label="IP Address"
                        name="ipAddress"
                        value={formData.ipAddress}
                        onChange={handleChange}
                        size="small"
                        helperText="Optional IP address for the virtual device"
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
                        helperText="Default for JunctionRelay Virtual Device is 8081"
                        placeholder="8081"
                        slotProps={{
                            htmlInput: {
                                min: 1,
                                max: 65535
                            }
                        }}
                    />
                </Box>

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
                        disabled={loading || !formData.name.trim()}
                        startIcon={<DevicesOtherIcon />}
                        sx={{ order: { xs: 1, sm: 2 } }}
                    >
                        {loading ? "Creating..." : "Add Virtual Device"}
                    </Button>
                </Box>

                {/* Help Information */}
                <Box sx={{
                    mt: 3,
                    p: 2,
                    bgcolor: 'action.hover',
                    borderRadius: 1
                }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
                        <strong>Virtual devices</strong> are software-based devices that can participate in your
                        JunctionRelay network without physical hardware. Use them for testing workflows, simulating
                        sensor data, or as placeholders during development. You can attach sensors and configure
                        data streams just like physical devices.
                    </Typography>
                </Box>
            </Box>
        </Modal>
    );
};

export default Device_AddVirtualDeviceModal;