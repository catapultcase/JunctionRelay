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
    Alert
} from "@mui/material";

// Icon imports
import AddIcon from '@mui/icons-material/Add';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import DevicesOtherIcon from '@mui/icons-material/DevicesOther';

interface ServiceSettings {
    service_heartbeats_enabled: boolean;
    service_connection_status_enabled: boolean;
}

interface VirtualDeviceManagementSectionProps {
    isMobile: boolean;
    setAddModalOpen: (open: boolean) => void;
    onServiceSettingChange?: (setting: string, enabled: boolean) => void;
}

const VirtualDeviceManagementSection: React.FC<VirtualDeviceManagementSectionProps> = ({
    isMobile,
    setAddModalOpen,
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
            {/* VirtualDevice Management Header */}
            <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
                <Typography variant="h6">VirtualDevice Management</Typography>
            </Box>

            {/* Management Actions */}
            <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: 'wrap' }}>
                {/* Add VirtualDevice Button */}
                <Button
                    variant="contained"
                    color="primary"
                    onClick={() => setAddModalOpen(true)}
                    startIcon={<AddIcon />}
                    size="small"
                    data-testid="add-virtualdevice-button"
                >
                    Add VirtualDevice
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
                    Configure monitoring services for VirtualDevices. These services run in the background to track device status and health.
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
                                            Monitor VirtualDevice responsiveness and health
                                        </Typography>
                                    </Box>
                                </Box>
                            }
                        />

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
                                            Track VirtualDevice network connectivity
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

export default VirtualDeviceManagementSection;
