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

import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Typography,
    Card,
    CardContent,
    Chip,
    Button,
    CircularProgress,
    Divider
} from '@mui/material';
import {
    Cloud as CloudIcon,
    CheckCircle as CheckCircleIcon,
    Close as CloseIcon
} from '@mui/icons-material';

interface PendingDevice {
    deviceId: string;
    name: string;
    type?: string;
}

interface PendingDevicesSectionProps {
    onDeviceConfirmed?: () => void;
    onError?: (message: string) => void;
    onSuccess?: (message: string) => void;
}

const PendingDevicesSection: React.FC<PendingDevicesSectionProps> = ({
    onDeviceConfirmed,
    onError,
    onSuccess
}) => {
    const [pendingDevices, setPendingDevices] = useState<PendingDevice[]>([]);
    const [loading, setLoading] = useState(false);
    const [confirmingDevice, setConfirmingDevice] = useState<string | null>(null);

    // Fetch pending cloud devices
    const fetchPendingDevices = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/cloud-auth/devices/pending');

            if (response.ok) {
                const data = await response.json();
                setPendingDevices(data.devices || []);
            } else if (response.status === 401) {
                // No cloud auth, just set empty array
                setPendingDevices([]);
            } else {
                console.warn('Failed to fetch pending devices:', response.statusText);
                setPendingDevices([]);
            }
        } catch (error) {
            console.warn('Error fetching pending devices:', error);
            setPendingDevices([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // Handle device confirmation (approve/reject)
    const handleConfirmDevice = async (deviceId: string, accept: boolean) => {
        setConfirmingDevice(deviceId);
        try {
            const response = await fetch(`/api/cloud-auth/devices/${deviceId}/confirm`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ accept })
            });

            if (response.ok) {
                const action = accept ? 'approved' : 'rejected';
                onSuccess?.(`Device ${action} successfully`);

                // Refresh pending devices and notify parent
                await fetchPendingDevices();
                onDeviceConfirmed?.();
            } else {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to confirm device');
            }
        } catch (err: any) {
            console.error("Error confirming device:", err);
            onError?.(`Failed to confirm device: ${err.message}`);
        } finally {
            setConfirmingDevice(null);
        }
    };

    // Initial load
    useEffect(() => {
        fetchPendingDevices();
    }, [fetchPendingDevices]);

    // Don't render anything if no pending devices
    if (!pendingDevices || pendingDevices.length === 0) {
        return null;
    }

    return (
        <Box sx={{ mb: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <CloudIcon color="warning" />
                <Typography variant="h6" sx={{ color: 'warning.main' }}>
                    Pending Device Approvals ({pendingDevices.length})
                </Typography>
                {loading && <CircularProgress size={20} />}
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {pendingDevices.map((device) => (
                    <Card key={device.deviceId} sx={{ border: '2px solid', borderColor: 'warning.light' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Box sx={{ flex: 1 }}>
                                    <Typography variant="h6" component="div">
                                        {device.name}
                                    </Typography>
                                    <Typography color="textSecondary" variant="body2" sx={{ fontFamily: 'monospace' }}>
                                        Device ID: {device.deviceId}
                                    </Typography>
                                    <Box sx={{ mt: 1, display: 'flex', gap: 1, alignItems: 'center' }}>
                                        <Chip
                                            label={device.type || "ESP32"}
                                            size="small"
                                            color="default"
                                        />
                                        <Chip
                                            label="Pending Approval"
                                            size="small"
                                            color="warning"
                                        />
                                    </Box>
                                </Box>

                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                    <Button
                                        variant="contained"
                                        color="success"
                                        startIcon={<CheckCircleIcon />}
                                        onClick={() => handleConfirmDevice(device.deviceId, true)}
                                        disabled={confirmingDevice === device.deviceId}
                                        size="small"
                                    >
                                        Approve
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        color="error"
                                        startIcon={<CloseIcon />}
                                        onClick={() => handleConfirmDevice(device.deviceId, false)}
                                        disabled={confirmingDevice === device.deviceId}
                                        size="small"
                                    >
                                        Reject
                                    </Button>
                                    {confirmingDevice === device.deviceId && (
                                        <CircularProgress size={20} />
                                    )}
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                ))}
            </Box>

            <Divider sx={{ mt: 3, mb: 3 }} />
        </Box>
    );
};

export default PendingDevicesSection;