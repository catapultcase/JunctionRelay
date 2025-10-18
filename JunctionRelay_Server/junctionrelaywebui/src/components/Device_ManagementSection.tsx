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
    Paper,
    FormControlLabel,
    Switch,
    Divider,
    Alert
} from "@mui/material";

// Icon imports
import UpdateIcon from '@mui/icons-material/Update';
import ComputerIcon from '@mui/icons-material/Computer';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScreenshotMonitorIcon from '@mui/icons-material/ScreenshotMonitor';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import DevicesOtherIcon from '@mui/icons-material/DevicesOther';

interface ServiceSettings {
    service_heartbeats_enabled: boolean;
    service_connection_status_enabled: boolean;
}

interface DeviceManagementSectionProps {
    isMobile: boolean;
    scanning: boolean;
    buttonColor: "primary" | "secondary";
    setScanModalOpen: (open: boolean) => void;
    setAddCustomDeviceModalOpen: (open: boolean) => void;
    setAddVirtualScreenModalOpen: (open: boolean) => void;
    setAddVirtualDeviceModalOpen: (open: boolean) => void;
    checkForUpdates: () => Promise<void>;
    handleRefreshCloudDevices: () => Promise<void>;
    refreshingCloudDevices: boolean;
    onServiceSettingChange?: (setting: string, enabled: boolean) => void;
}

const DeviceManagementSection: React.FC<DeviceManagementSectionProps> = ({
    isMobile,
    scanning,
    buttonColor,
    setScanModalOpen,
    setAddCustomDeviceModalOpen,
    setAddVirtualScreenModalOpen,
    setAddVirtualDeviceModalOpen,
    checkForUpdates,
    handleRefreshCloudDevices,
    refreshingCloudDevices,
    onServiceSettingChange
}) => {
    const [settings, setSettings] = useState<ServiceSettings>({
        service_heartbeats_enabled: true,
        service_connection_status_enabled: true
    });
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Fetch service settings
    const fetchServiceSettings = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/settings');
            if (response.ok) {
                const allSettings = await response.json();

                // Extract just the service settings we need
                const serviceSettings: ServiceSettings = {
                    service_heartbeats_enabled: true, // default
                    service_connection_status_enabled: true // default
                };

                allSettings.forEach((setting: any) => {
                    if (setting.key === 'service_heartbeats_enabled' || setting.key === 'service_connection_status_enabled') {
                        serviceSettings[setting.key as keyof ServiceSettings] =
                            setting.value?.trim().toLowerCase() === 'true';
                    }
                });

                setSettings(serviceSettings);
            } else {
                throw new Error('Failed to fetch service settings');
            }
        } catch (err) {
            console.error('Error fetching service settings:', err);
            setError('Failed to load service settings');
        } finally {
            setLoading(false);
        }
    };

    // Update service setting
    const updateServiceSetting = async (serviceKey: string, enabled: boolean) => {
        try {
            setUpdating(serviceKey);
            const response = await fetch(`/api/settings/toggle/${serviceKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ enabled })
            });

            if (response.ok) {
                setSettings(prev => ({
                    ...prev,
                    [serviceKey]: enabled
                }));

                // Notify parent component of the change
                if (onServiceSettingChange) {
                    onServiceSettingChange(serviceKey, enabled);
                }
            } else {
                throw new Error('Failed to update service setting');
            }
        } catch (err) {
            console.error('Error updating service setting:', err);
            setError(`Failed to update ${serviceKey}`);
            // Reset the switch state on error
            await fetchServiceSettings();
        } finally {
            setUpdating(null);
        }
    };

    // Handle switch change
    const handleSwitchChange = (serviceKey: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
        updateServiceSetting(serviceKey, event.target.checked);
    };

    // Load settings on component mount
    useEffect(() => {
        fetchServiceSettings();
    }, []);

    // Clear error after 5 seconds
    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    // Hide on mobile since bottom action bar handles it
    if (isMobile) {
        return null;
    }

    return (
        <>
            {/* Device Management Header */}
            <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
                <Typography variant="h6">Device Management</Typography>
            </Box>

            {/* First Row - Core Device Management */}
            <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: 'wrap' }}>
                {/* Scan for Devices Button */}
                <Button
                    variant="contained"
                    color={buttonColor}
                    onClick={() => setScanModalOpen(true)}
                    disabled={scanning}
                    startIcon={<SearchIcon />}
                    size="small"
                >
                    {scanning ? "Scanning..." : "Scan for Devices"}
                </Button>

                {/* Add Custom Local Device Button */}
                <Button
                    variant="contained"
                    color="primary"
                    onClick={() => setAddCustomDeviceModalOpen(true)}
                    startIcon={<ComputerIcon />}
                    size="small"
                    data-testid="add-custom-local-device-button"
                >
                    Add Custom Local Device
                </Button>

                {/* Create Virtual Screen Button */}
                <Button
                    variant="contained"
                    color="secondary"
                    onClick={() => setAddVirtualScreenModalOpen(true)}
                    startIcon={<ScreenshotMonitorIcon />}
                    size="small"
                    data-testid="add-virtual-screen-button"
                >
                    Create Virtual Screen
                </Button>

                {/* Add Virtual Device Button */}
                <Button
                    variant="contained"
                    color="secondary"
                    onClick={() => setAddVirtualDeviceModalOpen(true)}
                    startIcon={<DevicesOtherIcon />}
                    size="small"
                    data-testid="add-virtual-device-button"
                >
                    Add Virtual Device
                </Button>

                {/* Check for Firmware Updates Button */}
                <Button
                    variant="outlined"
                    startIcon={<UpdateIcon />}
                    onClick={checkForUpdates}
                    size="small"
                >
                    Check for Firmware Updates
                </Button>
            </Box>

            {/* Second Row - Cloud Device Management */}
            <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: 'wrap' }}>
                <Button
                    variant="outlined"
                    onClick={handleRefreshCloudDevices}
                    disabled={refreshingCloudDevices}
                    startIcon={refreshingCloudDevices ? <CircularProgress size={16} /> : <RefreshIcon />}
                    size="small"
                    sx={{
                        borderColor: '#1976d2',
                        color: '#1976d2',
                        '&:hover': {
                            borderColor: '#1565c0',
                            backgroundColor: 'rgba(25, 118, 210, 0.04)',
                        },
                        '&:focus': {
                            borderColor: '#1565c0',
                        }
                    }}
                >
                    {refreshingCloudDevices ? "Refreshing..." : "Refresh Cloud Devices"}
                </Button>
            </Box>

            {/* Service Settings Section */}
            <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                    <NetworkCheckIcon sx={{ mr: 1 }} />
                    Service Settings
                </Typography>

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                        {error}
                    </Alert>
                )}

                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                    Configure monitoring services that run in the background to track device status.
                </Typography>

                {loading ? (
                    <Box display="flex" alignItems="center" justifyContent="center">
                        <CircularProgress size={24} sx={{ mr: 1 }} />
                        <Typography>Loading service settings...</Typography>
                    </Box>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
                        {/* Heartbeat Service Setting */}
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={settings.service_heartbeats_enabled}
                                    onChange={handleSwitchChange('service_heartbeats_enabled')}
                                    disabled={updating === 'service_heartbeats_enabled'}
                                    color="primary"
                                />
                            }
                            label={
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    <MonitorHeartIcon sx={{ mr: 1, fontSize: 20 }} />
                                    <Box>
                                        <Typography variant="body1">
                                            Heartbeat Monitoring
                                            {updating === 'service_heartbeats_enabled' && (
                                                <CircularProgress size={16} sx={{ ml: 1 }} />
                                            )}
                                        </Typography>
                                        <Typography variant="body2" color="textSecondary">
                                            Monitor device responsiveness and health status
                                        </Typography>
                                    </Box>
                                </Box>
                            }
                        />

                        {/* Divider - only show on mobile when stacked */}
                        <Divider sx={{ display: { xs: 'block', md: 'none' }, my: 1 }} />

                        {/* Connection Status Service Setting */}
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={settings.service_connection_status_enabled}
                                    onChange={handleSwitchChange('service_connection_status_enabled')}
                                    disabled={updating === 'service_connection_status_enabled'}
                                    color="primary"
                                />
                            }
                            label={
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    <NetworkCheckIcon sx={{ mr: 1, fontSize: 20 }} />
                                    <Box>
                                        <Typography variant="body1">
                                            Connection Status Monitoring
                                            {updating === 'service_connection_status_enabled' && (
                                                <CircularProgress size={16} sx={{ ml: 1 }} />
                                            )}
                                        </Typography>
                                        <Typography variant="body2" color="textSecondary">
                                            Track device network connectivity and availability
                                        </Typography>
                                    </Box>
                                </Box>
                            }
                        />
                    </Box>
                )}
            </Paper>
        </>
    );
};

export default DeviceManagementSection;