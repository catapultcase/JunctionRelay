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

import React from "react";
import {
    Typography, Box, Paper, TextField, FormControl, Select,
    MenuItem, SelectChangeEvent, Table, TableRow, TableCell, TableBody,
    TableContainer, Switch, FormControlLabel
} from "@mui/material";
import InfoIcon from '@mui/icons-material/Info';
import SettingsIcon from '@mui/icons-material/Settings';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';

interface DeviceInfoPanelProps {
    deviceData: any;
    setDeviceData: (data: any) => void;
    isCustom: boolean;
    comPorts: string[];
    selectedComPort: string;
    setSelectedComPort: (port: string) => void;
}

const DeviceInfoPanel: React.FC<DeviceInfoPanelProps> = ({
    deviceData,
    setDeviceData,
    isCustom,
    comPorts,
    selectedComPort,
    setSelectedComPort
}) => {
    // Helper function to handle text input changes
    const handleTextChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
        setDeviceData({
            ...deviceData,
            [field]: event.target.value
        });
    };

    // Helper function to handle number input changes
    const handleNumberChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value === '' ? 0 : Number(event.target.value);
        setDeviceData({
            ...deviceData,
            [field]: value
        });
    };

    // Helper function to handle select changes
    const handleSelectChange = (field: string) => (event: SelectChangeEvent) => {
        const value = event.target.value === "Yes";
        setDeviceData({
            ...deviceData,
            [field]: value
        });
    };

    // Helper function to handle boolean changes (for switches)
    const handleBooleanChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
        setDeviceData({
            ...deviceData,
            [field]: event.target.checked
        });
    };

    // Helper function to handle heartbeat protocol changes
    const handleHeartbeatProtocolChange = (event: SelectChangeEvent) => {
        setDeviceData({
            ...deviceData,
            heartbeatProtocol: event.target.value
        });
    };

    // Define which fields should be always editable
    const alwaysEditableFields = ['name', 'description', 'pollRate', 'sendRate'];

    // Define info fields
    const infoFields = [
        { key: 'name', label: 'Device Name' },
        { key: 'description', label: 'Description' },
        { key: 'type', label: 'Type' },
        { key: 'uniqueIdentifier', label: 'Unique Identifier' },
        { key: 'ipAddress', label: 'IP Address' },
        { key: 'deviceModel', label: 'Device Model' },
        { key: 'deviceManufacturer', label: 'Manufacturer' },
        { key: 'pollRate', label: 'Default Poll Rate' },
        { key: 'sendRate', label: 'Default Send Rate' }
    ];

    // Define capability fields
    const capFields = [
        { key: 'hasOnboardScreen', label: 'Onboard Screen' },
        { key: 'hasOnboardLED', label: 'Onboard LED' },
        { key: 'hasOnboardRGBLED', label: 'Onboard RGB LED' },
        { key: 'hasExternalNeopixels', label: 'External Neopixels' },
        { key: 'hasExternalMatrix', label: 'External Matrix' },
        { key: 'hasExternalI2CDevices', label: 'External I2C Devices' },
        { key: 'supportsWiFi', label: 'Supports WiFi' },
        { key: 'supportsBLE', label: 'Supports BLE' },
        { key: 'supportsUSB', label: 'Supports USB' },
        { key: 'supportsESPNow', label: 'Supports ESP-NOW' },
        { key: 'supportsHTTP', label: 'Supports HTTP' },
        { key: 'supportsMQTT', label: 'Supports MQTT' },
        { key: 'supportsWebSockets', label: 'Supports WebSockets' }
    ];

    // Define heartbeat configuration fields
    const heartbeatFields = [
        { key: 'heartbeatIntervalMs', label: 'Ping Interval (ms)', type: 'number', defaultValue: 60000 },
        { key: 'heartbeatGracePeriodMs', label: 'Grace Period (ms)', type: 'number', defaultValue: 180000 },
        { key: 'heartbeatMaxRetryAttempts', label: 'Max Retry Attempts', type: 'number', defaultValue: 3 },
        { key: 'heartbeatTarget', label: 'Target Endpoint', type: 'text', defaultValue: '/api/status' },
        { key: 'heartbeatExpectedValue', label: 'Expected Response', type: 'text', defaultValue: 'online' }
    ];

    // Handle COM port selection
    const handleComPortChange = (event: SelectChangeEvent) => {
        setSelectedComPort(event.target.value);
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {/* Device Info */}
                <Box sx={{ flex: '1 1 400px', minWidth: '400px' }}>
                    <Paper elevation={2} sx={{ p: 3, height: '100%', borderRadius: 2 }}>
                        <Typography variant="subtitle1" gutterBottom sx={{
                            display: 'flex',
                            alignItems: 'center',
                            mb: 1
                        }}>
                            <InfoIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                            Device Info
                        </Typography>
                        <Box sx={{ mb: 2 }}>
                            <TableContainer>
                                <Table size="small">
                                    <TableBody>
                                        {infoFields.map(({ key, label }) => (
                                            <TableRow key={key}>
                                                <TableCell
                                                    sx={{
                                                        width: '40%',
                                                        padding: '8px 16px',
                                                        borderBottom: '1px solid #eee'
                                                    }}
                                                >
                                                    <Typography variant="body2" fontWeight="medium">
                                                        {label}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell
                                                    sx={{
                                                        padding: '8px 16px',
                                                        borderBottom: '1px solid #eee'
                                                    }}
                                                >
                                                    {(isCustom && key !== "type") || alwaysEditableFields.includes(key) ? (
                                                        key === 'pollRate' || key === 'sendRate' ? (
                                                            <TextField
                                                                fullWidth
                                                                size="small"
                                                                type="number"
                                                                value={deviceData[key] ?? 0}
                                                                onChange={handleNumberChange(key)}
                                                                slotProps={{
                                                                    htmlInput: { min: 0 }
                                                                }}
                                                            />
                                                        ) : (
                                                            <TextField
                                                                fullWidth
                                                                size="small"
                                                                value={deviceData[key] ?? ""}
                                                                onChange={handleTextChange(key)}
                                                            />
                                                        )
                                                    ) : (
                                                        <Typography variant="body2">
                                                            {deviceData[key] !== undefined ? String(deviceData[key]) : "—"}
                                                        </Typography>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {/* COM Port Selection */}
                                        {deviceData.supportsUSB && (
                                            <TableRow>
                                                <TableCell
                                                    sx={{
                                                        width: '40%',
                                                        padding: '8px 16px',
                                                        borderBottom: '1px solid #eee'
                                                    }}
                                                >
                                                    <Typography variant="body2" fontWeight="medium">
                                                        COM Port
                                                    </Typography>
                                                </TableCell>
                                                <TableCell
                                                    sx={{
                                                        padding: '8px 16px',
                                                        borderBottom: '1px solid #eee'
                                                    }}
                                                >
                                                    <FormControl fullWidth size="small">
                                                        <Select
                                                            value={selectedComPort}
                                                            onChange={handleComPortChange}
                                                            displayEmpty
                                                        >
                                                            <MenuItem value="">
                                                                <em>None</em>
                                                            </MenuItem>
                                                            {comPorts.map((port) => (
                                                                <MenuItem key={port} value={port}>
                                                                    {port}
                                                                </MenuItem>
                                                            ))}
                                                        </Select>
                                                    </FormControl>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Box>
                    </Paper>
                </Box>

                {/* Device Capabilities */}
                <Box sx={{ flex: '1 1 400px', minWidth: '400px' }}>
                    <Paper elevation={2} sx={{ p: 3, height: '100%', borderRadius: 2 }}>
                        <Typography variant="subtitle1" gutterBottom sx={{
                            display: 'flex',
                            alignItems: 'center',
                            mb: 1
                        }}>
                            <SettingsIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                            Device Capabilities
                        </Typography>
                        <Box sx={{ mb: 2 }}>
                            <TableContainer>
                                <Table size="small">
                                    <TableBody>
                                        {capFields.map(({ key, label }) => (
                                            <TableRow key={key}>
                                                <TableCell
                                                    sx={{
                                                        width: '60%',
                                                        padding: '8px 16px',
                                                        borderBottom: '1px solid #eee'
                                                    }}
                                                >
                                                    <Typography variant="body2" fontWeight="medium">
                                                        {label}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell
                                                    sx={{
                                                        padding: '8px 16px',
                                                        borderBottom: '1px solid #eee'
                                                    }}
                                                >
                                                    {isCustom ? (
                                                        <FormControl fullWidth size="small">
                                                            <Select
                                                                value={deviceData[key] ? "Yes" : "No"}
                                                                onChange={handleSelectChange(key)}
                                                            >
                                                                <MenuItem value="Yes">Yes</MenuItem>
                                                                <MenuItem value="No">No</MenuItem>
                                                            </Select>
                                                        </FormControl>
                                                    ) : (
                                                        <Typography variant="body2">
                                                            {deviceData[key] ? "Yes" : "No"}
                                                        </Typography>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Box>
                    </Paper>
                </Box>
            </Box>

            {/* Heartbeat Configuration Section */}
            <Box sx={{ mt: 3 }}>
                <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
                    <Typography variant="subtitle1" gutterBottom sx={{
                        display: 'flex',
                        alignItems: 'center',
                        mb: 2
                    }}>
                        <MonitorHeartIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                        Heartbeat Configuration
                    </Typography>

                    <Box sx={{ mb: 3 }}>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={deviceData.heartbeatEnabled ?? true}
                                    onChange={handleBooleanChange('heartbeatEnabled')}
                                    color="primary"
                                />
                            }
                            label="Enable Heartbeat Monitoring"
                            sx={{ mb: 2 }}
                        />
                        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                            Heartbeat monitoring allows the server to periodically check if the device is online and responsive.
                        </Typography>
                    </Box>

                    {(deviceData.heartbeatEnabled ?? true) && (
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
                            {/* Heartbeat Protocol Selection */}
                            <Box>
                                <Typography variant="body2" fontWeight="medium" sx={{ mb: 1 }}>
                                    Heartbeat Protocol
                                </Typography>
                                <FormControl fullWidth size="small">
                                    <Select
                                        value={deviceData.heartbeatProtocol || 'HTTP'}
                                        onChange={handleHeartbeatProtocolChange}
                                    >
                                        <MenuItem value="HTTP">HTTP</MenuItem>
                                        <MenuItem value="MQTT">MQTT</MenuItem>
                                        <MenuItem value="WebSocket">WebSocket</MenuItem>
                                        <MenuItem value="ICMP">ICMP Ping</MenuItem>
                                    </Select>
                                </FormControl>
                            </Box>

                            {/* Heartbeat Configuration Fields */}
                            {heartbeatFields.map(({ key, label, type, defaultValue }) => (
                                <Box key={key}>
                                    <Typography variant="body2" fontWeight="medium" sx={{ mb: 1 }}>
                                        {label}
                                    </Typography>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        type={type}
                                        value={deviceData[key] ?? defaultValue}
                                        onChange={type === 'number' ? handleNumberChange(key) : handleTextChange(key)}
                                        slotProps={type === 'number' ? {
                                            htmlInput: { min: 0 }
                                        } : undefined}
                                    />
                                </Box>
                            ))}
                        </Box>
                    )}

                    {/* Heartbeat Status Information */}
                    {deviceData.lastPinged && (
                        <Box sx={{ mt: 3, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                Heartbeat Status
                            </Typography>
                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
                                <Box>
                                    <Typography variant="body2" color="textSecondary">Last Ping Status</Typography>
                                    <Typography variant="body2" fontWeight="medium">
                                        {deviceData.lastPingStatus || 'Unknown'}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography variant="body2" color="textSecondary">Last Pinged</Typography>
                                    <Typography variant="body2" fontWeight="medium">
                                        {deviceData.lastPinged ? new Date(deviceData.lastPinged).toLocaleString() : 'Never'}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography variant="body2" color="textSecondary">Ping Latency</Typography>
                                    <Typography variant="body2" fontWeight="medium">
                                        {deviceData.lastPingDurationMs ? `${deviceData.lastPingDurationMs}ms` : '—'}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography variant="body2" color="textSecondary">Consecutive Failures</Typography>
                                    <Typography variant="body2" fontWeight="medium">
                                        {deviceData.consecutivePingFailures || 0}
                                    </Typography>
                                </Box>
                            </Box>
                        </Box>
                    )}
                </Paper>
            </Box>
        </Box>
    );
};

export default DeviceInfoPanel;