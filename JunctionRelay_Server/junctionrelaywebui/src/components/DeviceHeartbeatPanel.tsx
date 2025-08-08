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

import React, { useCallback } from "react";
import {
    Typography, Box, Paper, TextField, Switch, FormControlLabel,
    useTheme, useMediaQuery, Divider
} from "@mui/material";
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import HeartbeatProtocolSelector, { HeartbeatProtocol } from './HeartbeatProtocolSelector';

interface DeviceHeartbeatPanelProps {
    deviceData: any;
    onAutoSave?: (updatedData: any, field: string, immediate?: boolean) => void;
}

const DeviceHeartbeatPanel: React.FC<DeviceHeartbeatPanelProps> = ({
    deviceData,
    onAutoSave
}) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Simple field change handler
    const handleFieldChange = (field: string, value: any, immediate: boolean = false) => {
        console.log(`[DeviceHeartbeatPanel] Field change: ${field} = ${value}`);

        const updatedData = {
            ...deviceData,
            [field]: value
        };

        if (onAutoSave) {
            onAutoSave(updatedData, field, immediate);
        }
    };

    // Helper function to handle number input changes with debounced auto-save
    const handleNumberChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value === '' ? 0 : Number(event.target.value);
        console.log(`[DeviceHeartbeatPanel] Number change: ${field} = ${value}`);
        handleFieldChange(field, value, false); // false = debounced save
    };

    // Helper function to handle boolean changes (for switches) with immediate auto-save
    const handleBooleanChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = event.target.checked;
        console.log(`[DeviceHeartbeatPanel] Boolean change: ${field} = ${newValue}`);
        handleFieldChange(field, newValue, true); // true = immediate save
    };

    // Handle heartbeat protocol changes with immediate auto-save
    const handleHeartbeatProtocolChange = (protocol: HeartbeatProtocol) => {
        console.log(`[DeviceHeartbeatPanel] Heartbeat protocol change: ${protocol}`);

        // Define protocol defaults
        const protocolDefaults: Record<HeartbeatProtocol, { target: string; expected: string }> = {
            'HTTP': { target: '/api/health/heartbeat', expected: 'OK' },
            'WebSocket': { target: '81', expected: 'ok' },
            'MQTT': { target: 'junctionrelay/data', expected: 'online' },
            'SSH': { target: 'uptime', expected: 'up' },
            'ICMP': { target: '', expected: '' },
            'ESPNOW': { target: '', expected: '' }
        };

        const defaults = protocolDefaults[protocol] || { target: '', expected: '' };

        const updatedData = {
            ...deviceData,
            heartbeatProtocol: protocol,
            HeartbeatProtocol: protocol,
            heartbeatTarget: defaults.target,
            HeartbeatTarget: defaults.target,
            heartbeatExpectedValue: defaults.expected,
            HeartbeatExpectedValue: defaults.expected
        };

        // Immediate save for protocol changes
        if (onAutoSave) {
            onAutoSave(updatedData, 'heartbeatProtocol', true);
        }
    };

    // Handle heartbeat form data changes with smart auto-save timing
    const handleHeartbeatFormDataChange = useCallback((formData: any) => {
        console.log(`[DeviceHeartbeatPanel] Heartbeat form data change:`, formData);

        // Clean up duplicate fields to prevent cascade
        const processedData = { ...formData };

        // Remove uppercase duplicates if lowercase versions exist
        if (processedData.heartbeatEnabled !== undefined && processedData.HeartbeatEnabled !== undefined) {
            delete processedData.HeartbeatEnabled;
        }
        if (processedData.heartbeatProtocol && processedData.HeartbeatProtocol) {
            delete processedData.HeartbeatProtocol;
        }
        if (processedData.heartbeatTarget && processedData.HeartbeatTarget) {
            delete processedData.HeartbeatTarget;
        }
        if (processedData.heartbeatExpectedValue && processedData.HeartbeatExpectedValue) {
            delete processedData.HeartbeatExpectedValue;
        }
        if (processedData.heartbeatIntervalMs !== undefined && processedData.HeartbeatIntervalMs !== undefined) {
            delete processedData.HeartbeatIntervalMs;
        }
        if (processedData.heartbeatGracePeriodMs !== undefined && processedData.HeartbeatGracePeriodMs !== undefined) {
            delete processedData.HeartbeatGracePeriodMs;
        }
        if (processedData.heartbeatMaxRetryAttempts !== undefined && processedData.HeartbeatMaxRetryAttempts !== undefined) {
            delete processedData.HeartbeatMaxRetryAttempts;
        }
        // Handle stream heartbeat fields
        if (processedData.useStreamAsHeartbeat !== undefined && processedData.UseStreamAsHeartbeat !== undefined) {
            delete processedData.UseStreamAsHeartbeat;
        }
        if (processedData.streamHeartbeatThresholdMs !== undefined && processedData.StreamHeartbeatThresholdMs !== undefined) {
            delete processedData.StreamHeartbeatThresholdMs;
        }
        // Handle connection status fields
        if (processedData.connectionStatusEnabled !== undefined && processedData.ConnectionStatusEnabled !== undefined) {
            delete processedData.ConnectionStatusEnabled;
        }
        if (processedData.connectionStatusIntervalMs !== undefined && processedData.ConnectionStatusIntervalMs !== undefined) {
            delete processedData.ConnectionStatusIntervalMs;
        }

        const updatedData = {
            ...deviceData,
            ...processedData
        };

        // Only save once per batch of changes
        if (onAutoSave) {
            // Determine if any field requires immediate save
            const immediateFields = ['heartbeatEnabled', 'useStreamAsHeartbeat', 'connectionStatusEnabled'];
            const hasImmediateField = Object.keys(processedData).some(field =>
                immediateFields.includes(field)
            );

            // Save with appropriate timing
            onAutoSave(updatedData, 'heartbeatFormData', hasImmediateField);
        }
    }, [deviceData, onAutoSave]);

    // Get current heartbeat protocol, with fallback
    const currentHeartbeatProtocol: HeartbeatProtocol =
        (deviceData.heartbeatProtocol || deviceData.HeartbeatProtocol || 'HTTP') as HeartbeatProtocol;

    return (
        <Box>
            {/* Compact Header */}
            <Box sx={{ mb: 2 }}>
                <Typography variant="h6" gutterBottom sx={{
                    display: 'flex',
                    alignItems: 'center',
                    mb: 0.5,
                    fontSize: isMobile ? '1.1rem' : '1.25rem'
                }}>
                    <MonitorHeartIcon sx={{ mr: 1, fontSize: isMobile ? '1.2rem' : '1.4rem' }} />
                    Device Monitoring Configuration
                </Typography>
                <Typography
                    variant="body2"
                    color="textSecondary"
                    sx={{ fontSize: isMobile ? '0.8rem' : '0.875rem' }}
                >
                    Configure heartbeat monitoring and connection status tracking for this device.
                </Typography>
            </Box>

            {/* Heartbeat Monitoring Card */}
            <Paper elevation={1} sx={{ p: isMobile ? 1.5 : 2, mb: 2, borderRadius: 1 }}>
                <FormControlLabel
                    control={
                        <Switch
                            checked={deviceData.heartbeatEnabled ?? deviceData.HeartbeatEnabled ?? true}
                            onChange={handleBooleanChange('heartbeatEnabled')}
                            color="primary"
                            size="small"
                        />
                    }
                    label={
                        <Typography sx={{ fontSize: isMobile ? '0.9rem' : '1rem', fontWeight: 'medium' }}>
                            Enable Heartbeat Monitoring
                        </Typography>
                    }
                    sx={{ mb: 1 }}
                />
                <Typography
                    variant="body2"
                    color="textSecondary"
                    sx={{ fontSize: isMobile ? '0.8rem' : '0.85rem', mb: 2 }}
                >
                    Periodically check if this device is online and responsive
                </Typography>

                {/* Heartbeat Configuration Fields - Only show if enabled */}
                {(deviceData.heartbeatEnabled ?? deviceData.HeartbeatEnabled ?? true) && (
                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: {
                            xs: '1fr',
                            sm: 'repeat(2, 1fr)',
                            md: 'repeat(3, 1fr)'
                        },
                        gap: isMobile ? 1.5 : 2
                    }}>
                        <TextField
                            label="Check Interval (ms)"
                            type="number"
                            value={deviceData.heartbeatIntervalMs ?? deviceData.HeartbeatIntervalMs ?? 60000}
                            onChange={handleNumberChange('heartbeatIntervalMs')}
                            size="small"
                            helperText="How often to ping"
                            slotProps={{
                                htmlInput: { min: 1000 }
                            }}
                            sx={{
                                '& .MuiInputBase-input': {
                                    fontSize: isMobile ? '0.8rem' : '0.85rem'
                                },
                                '& .MuiFormHelperText-root': {
                                    fontSize: '0.7rem'
                                }
                            }}
                        />
                        <TextField
                            label="Grace Period (ms)"
                            type="number"
                            value={deviceData.heartbeatGracePeriodMs ?? deviceData.HeartbeatGracePeriodMs ?? 180000}
                            onChange={handleNumberChange('heartbeatGracePeriodMs')}
                            size="small"
                            helperText="Timeout period"
                            slotProps={{
                                htmlInput: { min: 1000 }
                            }}
                            sx={{
                                '& .MuiInputBase-input': {
                                    fontSize: isMobile ? '0.8rem' : '0.85rem'
                                },
                                '& .MuiFormHelperText-root': {
                                    fontSize: '0.7rem'
                                }
                            }}
                        />
                        <TextField
                            label="Max Retries"
                            type="number"
                            value={deviceData.heartbeatMaxRetryAttempts ?? deviceData.HeartbeatMaxRetryAttempts ?? 3}
                            onChange={handleNumberChange('heartbeatMaxRetryAttempts')}
                            size="small"
                            helperText="Failed attempts"
                            slotProps={{
                                htmlInput: { min: 1, max: 10 }
                            }}
                            sx={{
                                '& .MuiInputBase-input': {
                                    fontSize: isMobile ? '0.8rem' : '0.85rem'
                                },
                                '& .MuiFormHelperText-root': {
                                    fontSize: '0.7rem'
                                }
                            }}
                        />
                    </Box>
                )}
            </Paper>

            {/* Connection Status Monitoring Card */}
            <Paper elevation={1} sx={{ p: isMobile ? 1.5 : 2, mb: 2, borderRadius: 1 }}>
                <FormControlLabel
                    control={
                        <Switch
                            checked={deviceData.connectionStatusEnabled ?? deviceData.ConnectionStatusEnabled ?? true}
                            onChange={handleBooleanChange('connectionStatusEnabled')}
                            color="secondary"
                            size="small"
                        />
                    }
                    label={
                        <Typography sx={{ fontSize: isMobile ? '0.9rem' : '1rem', fontWeight: 'medium' }}>
                            Enable Connection Status Monitoring
                        </Typography>
                    }
                    sx={{ mb: 1 }}
                />
                <Typography
                    variant="body2"
                    color="textSecondary"
                    sx={{ fontSize: isMobile ? '0.8rem' : '0.85rem', mb: 2 }}
                >
                    Monitor active network connections (WiFi, Ethernet, MQTT, etc.)
                </Typography>

                {/* Connection Status Configuration Fields - Only show if enabled */}
                {(deviceData.connectionStatusEnabled ?? deviceData.ConnectionStatusEnabled ?? true) && (
                    <TextField
                        label="Check Interval (ms)"
                        type="number"
                        value={deviceData.connectionStatusIntervalMs ?? deviceData.ConnectionStatusIntervalMs ?? 300000}
                        onChange={handleNumberChange('connectionStatusIntervalMs')}
                        size="small"
                        helperText="How often to check connection status (minimum 1 minute)"
                        slotProps={{
                            htmlInput: { min: 60000 } // Minimum 1 minute
                        }}
                        sx={{
                            maxWidth: 300,
                            '& .MuiInputBase-input': {
                                fontSize: isMobile ? '0.8rem' : '0.85rem'
                            },
                            '& .MuiFormHelperText-root': {
                                fontSize: '0.7rem'
                            }
                        }}
                    />
                )}
            </Paper>

            {/* Protocol Configuration - Only show if heartbeat is enabled */}
            {(deviceData.heartbeatEnabled ?? deviceData.HeartbeatEnabled ?? true) && (
                <Paper elevation={1} sx={{
                    p: isMobile ? 1.5 : 2,
                    mb: 2,
                    borderRadius: 1
                }}>
                    <Typography
                        variant="subtitle2"
                        sx={{
                            mb: 1.5,
                            fontWeight: 'medium',
                            fontSize: isMobile ? '0.9rem' : '1rem'
                        }}
                    >
                        Heartbeat Protocol
                    </Typography>

                    <HeartbeatProtocolSelector
                        selectedProtocol={currentHeartbeatProtocol}
                        onProtocolChange={handleHeartbeatProtocolChange}
                        formData={deviceData}
                        onFormDataChange={handleHeartbeatFormDataChange}
                    />
                </Paper>
            )}

            {/* Current Status Information - Compact */}
            {(deviceData.lastPinged || deviceData.connMode) && (
                <Paper elevation={1} sx={{
                    p: isMobile ? 1.5 : 2,
                    borderRadius: 1,
                    bgcolor: 'background.default'
                }}>
                    <Typography
                        variant="subtitle2"
                        sx={{
                            mb: 1.5,
                            fontWeight: 'medium',
                            fontSize: isMobile ? '0.9rem' : '1rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5
                        }}
                    >
                        <NetworkCheckIcon fontSize="small" />
                        Current Status
                    </Typography>
                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: {
                            xs: '1fr',
                            sm: 'repeat(2, 1fr)',
                            md: 'repeat(4, 1fr)'
                        },
                        gap: isMobile ? 1.5 : 2
                    }}>
                        {/* Heartbeat Status */}
                        {deviceData.lastPinged && (
                            <>
                                <Box>
                                    <Typography
                                        variant="body2"
                                        color="textSecondary"
                                        sx={{ fontSize: '0.7rem', mb: 0.25, fontWeight: 'medium' }}
                                    >
                                        Heartbeat Status
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        fontWeight="medium"
                                        sx={{ fontSize: isMobile ? '0.8rem' : '0.85rem' }}
                                    >
                                        {deviceData.lastPingStatus || 'Unknown'}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography
                                        variant="body2"
                                        color="textSecondary"
                                        sx={{ fontSize: '0.7rem', mb: 0.25, fontWeight: 'medium' }}
                                    >
                                        Last Checked
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        fontWeight="medium"
                                        sx={{
                                            fontSize: isMobile ? '0.8rem' : '0.85rem',
                                            wordBreak: 'break-word'
                                        }}
                                    >
                                        {deviceData.lastPinged ? new Date(deviceData.lastPinged).toLocaleString() : 'Never'}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography
                                        variant="body2"
                                        color="textSecondary"
                                        sx={{ fontSize: '0.7rem', mb: 0.25, fontWeight: 'medium' }}
                                    >
                                        Response Time
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        fontWeight="medium"
                                        sx={{ fontSize: isMobile ? '0.8rem' : '0.85rem' }}
                                    >
                                        {deviceData.lastPingDurationMs ? `${deviceData.lastPingDurationMs}ms` : '—'}
                                    </Typography>
                                </Box>
                            </>
                        )}

                        {/* Connection Status */}
                        <Box>
                            <Typography
                                variant="body2"
                                color="textSecondary"
                                sx={{ fontSize: '0.7rem', mb: 0.25, fontWeight: 'medium' }}
                            >
                                Connection Mode
                            </Typography>
                            <Typography
                                variant="body2"
                                fontWeight="medium"
                                sx={{ fontSize: isMobile ? '0.8rem' : '0.85rem' }}
                            >
                                {deviceData.connMode || 'Unknown'}
                            </Typography>
                        </Box>

                        {/* Failed Attempts - Only show if heartbeat enabled */}
                        {deviceData.lastPinged && (
                            <Box>
                                <Typography
                                    variant="body2"
                                    color="textSecondary"
                                    sx={{ fontSize: '0.7rem', mb: 0.25, fontWeight: 'medium' }}
                                >
                                    Failed Attempts
                                </Typography>
                                <Typography
                                    variant="body2"
                                    fontWeight="medium"
                                    sx={{ fontSize: isMobile ? '0.8rem' : '0.85rem' }}
                                >
                                    {deviceData.consecutivePingFailures || 0}
                                </Typography>
                            </Box>
                        )}
                    </Box>
                </Paper>
            )}
        </Box>
    );
};

export default DeviceHeartbeatPanel;