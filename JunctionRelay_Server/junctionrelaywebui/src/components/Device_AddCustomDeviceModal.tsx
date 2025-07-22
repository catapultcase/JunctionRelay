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
import ComputerIcon from '@mui/icons-material/Computer';
import EditIcon from '@mui/icons-material/Edit';

// Import components
import HeartbeatProtocolSelector from './HeartbeatProtocolSelector';
import { HeartbeatProtocol } from './HeartbeatProtocolSelector';

interface Device_AddCustomDeviceModalProps {
    open: boolean;
    onClose: () => void;
    onDeviceAdded: () => void;
    prefilledData?: { name: string; ipAddress: string; macAddress?: string } | null;
}

const Device_AddCustomDeviceModal: React.FC<Device_AddCustomDeviceModalProps> = ({
    open,
    onClose,
    onDeviceAdded,
    prefilledData
}) => {
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        ipAddress: "",
        uniqueIdentifier: "",
        // Match your C# model fields - Heartbeat
        HeartbeatProtocol: 'HTTP' as HeartbeatProtocol,
        HeartbeatTarget: "",
        HeartbeatExpectedValue: "",
        HeartbeatEnabled: true,
        HeartbeatIntervalMs: 60000,
        HeartbeatGracePeriodMs: 180000,
        HeartbeatMaxRetryAttempts: 3,
        // Match your C# model fields - SSH
        SshUsername: "",
        SshPassword: "",
        SshPort: 22,
        SshTimeoutMs: 10000,
        SshPrivateKey: "",
        UseSshKeyAuth: false,
        SshConnectionRetries: 3,
        SshVerifyHostKey: true
    });

    const [selectedProtocol, setSelectedProtocol] = useState<HeartbeatProtocol>('HTTP');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [configureAfterAdd, setConfigureAfterAdd] = useState<boolean>(false);

    // Update form data when prefilledData changes
    useEffect(() => {
        if (prefilledData) {
            setFormData(prev => ({
                ...prev,
                name: prefilledData.name,
                description: `Custom device at ${prefilledData.ipAddress}`,
                ipAddress: prefilledData.ipAddress,
                uniqueIdentifier: prefilledData.macAddress || prefilledData.ipAddress
            }));
        } else {
            // Reset form when no prefilled data
            setFormData({
                name: "",
                description: "",
                ipAddress: "",
                uniqueIdentifier: "",
                HeartbeatProtocol: 'HTTP' as HeartbeatProtocol,
                HeartbeatTarget: "",
                HeartbeatExpectedValue: "",
                HeartbeatEnabled: true,
                HeartbeatIntervalMs: 60000,
                HeartbeatGracePeriodMs: 180000,
                HeartbeatMaxRetryAttempts: 3,
                SshUsername: "",
                SshPassword: "",
                SshPort: 22,
                SshTimeoutMs: 10000,
                SshPrivateKey: "",
                UseSshKeyAuth: false,
                SshConnectionRetries: 3,
                SshVerifyHostKey: true
            });
        }
    }, [prefilledData]);

    // Reset error when modal opens/closes
    useEffect(() => {
        if (open) {
            setError(null);
            setLoading(false);
            setConfigureAfterAdd(false);
        }
    }, [open]);

    // Handle basic form field changes
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Handle changes from HeartbeatProtocolSelector
    const handleHeartbeatFormDataChange = (updates: any) => {
        console.log('AddCustomDeviceModal: Received updates from HeartbeatProtocolSelector:', updates);
        setFormData(prev => {
            const newFormData = { ...prev, ...updates };
            console.log('AddCustomDeviceModal: Updated formData:', newFormData);
            return newFormData;
        });
    };

    // Handle form submission
    const handleSubmit = async (redirectToConfigure: boolean) => {
        const {
            name,
            description,
            ipAddress,
            uniqueIdentifier,
            HeartbeatProtocol,
            HeartbeatTarget,
            HeartbeatExpectedValue,
            HeartbeatEnabled,
            HeartbeatIntervalMs,
            HeartbeatGracePeriodMs,
            HeartbeatMaxRetryAttempts,
            SshUsername,
            SshPassword,
            SshPort,
            SshTimeoutMs,
            SshPrivateKey,
            UseSshKeyAuth,
            SshConnectionRetries,
            SshVerifyHostKey
        } = formData;

        // Basic validation
        if (!name || !description || !ipAddress || !uniqueIdentifier) {
            setError("All required fields must be filled out.");
            return;
        }

        // IP address format validation
        const ipPattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (!ipPattern.test(ipAddress)) {
            setError("Please enter a valid IP address.");
            return;
        }

        try {
            setLoading(true);
            setConfigureAfterAdd(redirectToConfigure);

            // Use PascalCase field names that match your C# Model_Device
            const payload = {
                Name: name,
                Description: description,
                UniqueIdentifier: uniqueIdentifier,
                IPAddress: ipAddress,
                Type: "Custom",
                Status: "Active",

                // Include heartbeat fields with correct PascalCase names
                HeartbeatProtocol: HeartbeatProtocol,
                HeartbeatTarget: HeartbeatTarget,
                HeartbeatExpectedValue: HeartbeatExpectedValue,
                HeartbeatEnabled: HeartbeatEnabled,
                HeartbeatIntervalMs: HeartbeatIntervalMs,
                HeartbeatGracePeriodMs: HeartbeatGracePeriodMs,
                HeartbeatMaxRetryAttempts: HeartbeatMaxRetryAttempts,

                // Include SSH fields with correct PascalCase names
                SshUsername: SshUsername,
                SshPassword: SshPassword,
                SshPort: SshPort,
                SshTimeoutMs: SshTimeoutMs,
                SshPrivateKey: SshPrivateKey,
                UseSshKeyAuth: UseSshKeyAuth,
                SshConnectionRetries: SshConnectionRetries,
                SshVerifyHostKey: SshVerifyHostKey,

                // Set default capabilities for custom devices
                HasOnboardScreen: false,
                HasOnboardLED: false,
                HasOnboardRGBLED: false,
                HasExternalNeopixels: false,
                HasExternalMatrix: false,
                HasExternalI2CDevices: false,
                SupportsEthernet: true,
                SupportsWiFi: true,
                SupportsBLE: true,
                SupportsUSB: true,
                SupportsESPNow: true,
                SupportsHTTP: true,
                SupportsMQTT: true,
                SupportsWebSockets: true,
                HasButtons: false,
                HasBattery: false,
                HasSpeaker: false,
                HasMicroSD: false,
                IsGateway: false
            };

            console.log('AddCustomDeviceModal: Submitting payload:', payload);

            const response = await fetch("/api/devices", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const result = await response.json();
            console.log('AddCustomDeviceModal: Server response:', result);

            if (!response.ok) {
                throw new Error(result.message || "Failed to add device");
            }

            onDeviceAdded();
            onClose();

            if (redirectToConfigure) {
                const newId = result.id || result.Id;
                window.location.href = `/configure-device/${newId}`;
            }
        } catch (err: any) {
            console.error('AddCustomDeviceModal: Submit error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Update protocol selection when HeartbeatProtocol changes
    useEffect(() => {
        if (formData.HeartbeatProtocol !== selectedProtocol) {
            setSelectedProtocol(formData.HeartbeatProtocol);
        }
    }, [formData.HeartbeatProtocol]);

    return (
        <Modal open={open} onClose={onClose}>
            <Box
                sx={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: { xs: '95%', sm: '90%', md: '80%' },
                    maxWidth: 900,
                    bgcolor: "background.paper",
                    p: { xs: 3, md: 4 },
                    boxShadow: 24,
                    borderRadius: 2,
                    maxHeight: "90vh",
                    overflow: "auto"
                }}
            >
                {/* Modal Header */}
                <Typography variant="h6" gutterBottom sx={{ mb: 3 }}>
                    {prefilledData ? `Add Custom Device: ${prefilledData.name}` : "Add Custom Local Device"}
                </Typography>

                {/* Error Alert */}
                {error && (
                    <Alert
                        severity="error"
                        sx={{
                            mb: 3,
                            '& .MuiAlert-message': {
                                fontWeight: 'medium'
                            }
                        }}
                    >
                        {error}
                    </Alert>
                )}

                {/* Basic Device Information Section */}
                <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'medium', color: 'primary.main' }}>
                    Device Information
                </Typography>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mb: 4 }}>
                    <TextField
                        fullWidth
                        label="Device Name *"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        size="small"
                        required
                        error={!!error && !formData.name}
                        helperText="A friendly name for this device"
                    />

                    <TextField
                        fullWidth
                        label="Description *"
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        size="small"
                        required
                        error={!!error && !formData.description}
                        helperText="Brief description of the device's purpose"
                        multiline
                        rows={2}
                    />

                    <TextField
                        fullWidth
                        label="IP Address *"
                        name="ipAddress"
                        value={formData.ipAddress}
                        onChange={handleChange}
                        size="small"
                        required
                        error={!!error && !formData.ipAddress}
                        helperText="Device's network IP address (e.g., 192.168.1.100)"
                        placeholder="192.168.1.100"
                    />

                    <TextField
                        fullWidth
                        label="Unique Identifier *"
                        name="uniqueIdentifier"
                        value={formData.uniqueIdentifier}
                        onChange={handleChange}
                        size="small"
                        required
                        error={!!error && !formData.uniqueIdentifier}
                        helperText="MAC address or other unique identifier"
                        placeholder="AA:BB:CC:DD:EE:FF"
                    />
                </Box>

                {/* Health Monitoring Section */}
                <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'medium', color: 'secondary.main' }}>
                    Health Monitoring
                </Typography>
                <Box sx={{ mb: 4 }}>
                    <HeartbeatProtocolSelector
                        selectedProtocol={selectedProtocol}
                        onProtocolChange={setSelectedProtocol}
                        formData={formData}
                        onFormDataChange={handleHeartbeatFormDataChange}
                    />
                </Box>

                {/* Action Buttons */}
                <Box sx={{
                    display: "flex",
                    gap: 2,
                    mt: 4,
                    flexDirection: { xs: 'column', sm: 'row' },
                    justifyContent: 'flex-end'
                }}>
                    <Button
                        variant="outlined"
                        onClick={onClose}
                        size="small"
                        disabled={loading}
                        sx={{ order: { xs: 3, sm: 1 } }}
                    >
                        Cancel
                    </Button>

                    <Button
                        variant="contained"
                        onClick={() => handleSubmit(false)}
                        disabled={loading}
                        startIcon={<ComputerIcon />}
                        size="small"
                        sx={{ order: { xs: 2, sm: 2 } }}
                    >
                        {loading && !configureAfterAdd ? "Adding..." : "Add Device"}
                    </Button>

                    <Button
                        variant="contained"
                        color="secondary"
                        onClick={() => handleSubmit(true)}
                        disabled={loading}
                        startIcon={<EditIcon />}
                        size="small"
                        sx={{ order: { xs: 1, sm: 3 } }}
                    >
                        {loading && configureAfterAdd ? "Adding..." : "Add & Configure"}
                    </Button>
                </Box>

                {/* Help Information */}
                <Box sx={{
                    mt: 3,
                    p: 2,
                    bgcolor: 'action.hover',
                    borderRadius: 1,
                    display: { xs: 'none', sm: 'block' }
                }}>
                    <Typography variant="body2" color="text.secondary">
                        <strong>Custom devices</strong> are non-JunctionRelay devices that you want to monitor.
                        Configure health monitoring to track device availability and performance.
                        You can use HTTP endpoints, ping, or SSH for monitoring.
                    </Typography>
                </Box>
            </Box>
        </Modal>
    );
};

export default Device_AddCustomDeviceModal;