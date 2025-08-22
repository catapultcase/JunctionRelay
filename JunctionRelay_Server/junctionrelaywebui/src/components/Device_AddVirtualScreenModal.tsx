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
import ScreenshotMonitorIcon from '@mui/icons-material/ScreenshotMonitor';

interface Device_AddVirtualScreenModalProps {
    open: boolean;
    onClose: () => void;
    onDeviceAdded: () => void;
}

const Device_AddVirtualScreenModal: React.FC<Device_AddVirtualScreenModalProps> = ({
    open,
    onClose,
    onDeviceAdded
}) => {
    const [formData, setFormData] = useState({
        name: "",
        description: ""
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
                description: ""
            });
        }
    }, [open]);

    // Generate a fake MAC address for virtual screen
    const generateVirtualMac = (): string => {
        // Use 'VV' prefix to indicate virtual device
        const prefix = "VV";
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
        const { name, description } = formData;

        // Validation - only name is required
        if (!name.trim()) {
            setError("Virtual Screen Name is required.");
            return;
        }

        try {
            setLoading(true);

            // Create payload for virtual screen device
            const payload = {
                Name: name.trim(),
                Description: description.trim() || `Virtual screen: ${name.trim()}`,
                UniqueIdentifier: generateVirtualMac(),
                Type: "Virtual Screen",
                Status: "Active",

                // Virtual screens don't need physical connection details
                IPAddress: "",
                COMPort: "",

                // Disable heartbeat monitoring for virtual screens
                HeartbeatEnabled: false,
                HeartbeatProtocol: "HTTP",
                HeartbeatTarget: "",
                HeartbeatExpectedValue: "",
                HeartbeatIntervalMs: 60000,
                HeartbeatGracePeriodMs: 180000,
                HeartbeatMaxRetryAttempts: 3,

                // Disable SSH for virtual screens
                SshUsername: "",
                SshPassword: "",
                SshPort: 22,
                SshTimeoutMs: 10000,
                SshPrivateKey: "",
                UseSshKeyAuth: false,
                SshConnectionRetries: 3,
                SshVerifyHostKey: true,

                // Set appropriate capabilities for virtual screens
                HasOnboardScreen: true, // Virtual screen acts as a display
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
                SupportsHTTP: true, // Can receive HTTP data streams
                SupportsMQTT: true, // Can receive MQTT data streams
                SupportsWebSockets: true, // Can receive WebSocket data streams
                HasButtons: false,
                HasBattery: false,
                HasSpeaker: false,
                HasMicroSD: false,
                IsGateway: false
            };

            console.log('AddVirtualScreenModal: Submitting payload:', payload);

            const response = await fetch("/api/devices", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const result = await response.json();
            console.log('AddVirtualScreenModal: Server response:', result);

            if (!response.ok) {
                throw new Error(result.message || "Failed to create virtual screen");
            }

            // Success - close modal and refresh device list
            onDeviceAdded();
            onClose();

        } catch (err: any) {
            console.error('AddVirtualScreenModal: Submit error:', err);
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
                    <ScreenshotMonitorIcon />
                    Create Virtual Screen
                </Typography>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Create a virtual screen device that can display Rive visualizations from data streams.
                    The screen dimensions and content are determined by the stream configuration.
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
                        label="Virtual Screen Name *"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        size="small"
                        required
                        error={!!error && !formData.name.trim()}
                        helperText="A friendly name for this virtual screen (e.g., 'Dashboard Display', 'Lobby Screen')"
                        placeholder="Living Room Display"
                    />

                    <TextField
                        fullWidth
                        label="Description"
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        size="small"
                        helperText="Optional description of where this virtual screen will be used"
                        multiline
                        rows={2}
                        placeholder="Virtual display for showing sensor data in the living room"
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
                        startIcon={<ScreenshotMonitorIcon />}
                        sx={{ order: { xs: 1, sm: 2 } }}
                    >
                        {loading ? "Creating..." : "Create Virtual Screen"}
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
                        <strong>Virtual screens</strong> are software-based displays that can render Rive animations
                        and sensor data visualizations. Once created, configure your data streams to target this
                        virtual screen, then view the real-time visualization through the web interface.
                    </Typography>
                </Box>
            </Box>
        </Modal>
    );
};

export default Device_AddVirtualScreenModal;