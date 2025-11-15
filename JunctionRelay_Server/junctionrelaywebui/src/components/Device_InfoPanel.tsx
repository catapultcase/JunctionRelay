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
    TableContainer, useTheme, useMediaQuery, Switch, FormControlLabel, Grid
} from "@mui/material";
import InfoIcon from '@mui/icons-material/Info';
import SettingsIcon from '@mui/icons-material/Settings';
import DeviceHubIcon from '@mui/icons-material/DeviceHub';
import PortIcon from '@mui/icons-material/Cable';
import { EmbeddedVirtualScreenViewer } from '@junctionrelay/frameengine2';

interface DeviceInfoPanelProps {
    deviceData: any;
    setDeviceData: (data: any) => void;
    isCustom: boolean;
    comPorts: string[];
    selectedComPort: string;
    setSelectedComPort: (port: string) => void;
    onAutoSave?: (updatedData: any, field: string, immediate?: boolean) => void;
    deviceId?: string;
    mountVirtualScreen?: boolean;
}

const DeviceInfoPanel: React.FC<DeviceInfoPanelProps> = ({
    deviceData,
    setDeviceData,
    isCustom,
    comPorts,
    selectedComPort,
    setSelectedComPort,
    onAutoSave,
    deviceId,
    mountVirtualScreen = true
}) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    React.useEffect(() => {
        if (deviceData?.comPort !== undefined) {
            setSelectedComPort(deviceData.comPort || "");
        }
    }, [deviceData?.comPort, setSelectedComPort]);

    const isCOMPortInvalid = React.useMemo(() => {
        return deviceData?.comPort &&
            deviceData.comPort !== "" &&
            comPorts.length > 0 &&
            !comPorts.includes(deviceData.comPort);
    }, [deviceData?.comPort, comPorts]);

    const handleFieldChange = (field: string, value: any, immediate: boolean = false) => {
        const updatedData = { ...deviceData, [field]: value };
        if (onAutoSave) {
            onAutoSave(updatedData, field, immediate);
        }
    };

    const handleTextChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
        handleFieldChange(field, event.target.value, false);
    };

    const handleNumberChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value === '' ? null : Number(event.target.value);
        handleFieldChange(field, value, false);
    };

    const handleToggleChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
        handleFieldChange(field, event.target.checked, true);
    };

    const handleComPortChange = (event: SelectChangeEvent) => {
        const newPort = event.target.value;
        setSelectedComPort(newPort);
        handleFieldChange('comPort', newPort, true);
    };

    const alwaysEditableFields = ['name', 'description', 'pollRate', 'sendRate'];

    const infoFields = [
        { key: 'name', label: 'Device Name' },
        { key: 'description', label: 'Description' },
        { key: 'type', label: 'Type' },
        { key: 'uniqueIdentifier', label: 'Unique Identifier' },
        { key: 'ipAddress', label: 'IP Address' },
        { key: 'deviceModel', label: 'Device Model' },
        { key: 'deviceManufacturer', label: 'Manufacturer' },
        { key: 'firmwareVersion', label: 'Firmware Version' },
        { key: 'hasCustomFirmware', label: 'Has Custom Firmware' },
        { key: 'mcu', label: 'MCU' },
        { key: 'wirelessConnectivity', label: 'Wireless Connectivity' },
        { key: 'flash', label: 'Flash' },
        { key: 'psram', label: 'PSRAM' },
        { key: 'pollRate', label: 'Default Poll Rate' },
        { key: 'sendRate', label: 'Default Send Rate' }
    ];

    const capFields = [
        { key: 'hasOnboardScreen', label: 'Onboard Screen' },
        { key: 'hasOnboardLED', label: 'Onboard LED' },
        { key: 'hasOnboardRGBLED', label: 'Onboard RGB LED' },
        { key: 'hasExternalNeopixels', label: 'External Neopixels' },
        { key: 'hasExternalMatrix', label: 'External Matrix' },
        { key: 'hasExternalI2CDevices', label: 'External I2C Devices' },
        { key: 'hasButtons', label: 'Has Buttons' },
        { key: 'hasBattery', label: 'Has Battery' },
        { key: 'hasSpeaker', label: 'Has Speaker' },
        { key: 'hasMicroSD', label: 'Has MicroSD' },
        { key: 'supportsEthernet', label: 'Supports Ethernet' },
        { key: 'supportsWiFi', label: 'Supports WiFi' },
        { key: 'supportsBLE', label: 'Supports BLE' },
        { key: 'supportsUSB', label: 'Supports USB' },
        { key: 'supportsESPNow', label: 'Supports ESP-NOW' },
        { key: 'supportsHTTP', label: 'Supports HTTP' },
        { key: 'supportsMQTT', label: 'Supports MQTT' },
        { key: 'supportsWebSockets', label: 'Supports WebSockets' }
    ];

    const isVirtualScreen = deviceData?.type === 'Virtual Screen';
    const isVirtualDevice = deviceData?.type === 'Virtual Device';
    const isVirtualType = isVirtualScreen || isVirtualDevice;

    // Virtual Screen: Only 4 fields + preview
    if (isVirtualScreen) {
        return (
            <Box>
                {/* Device Info Card - 2 columns layout */}
                <Paper elevation={2} sx={{
                    p: isMobile ? 2 : 3,
                    borderRadius: 2,
                    overflow: 'hidden',
                    mb: 3
                }}>
                    <Typography variant="subtitle1" gutterBottom sx={{
                        display: 'flex',
                        alignItems: 'center',
                        mb: isMobile ? 1.5 : 2,
                        fontSize: isMobile ? '1rem' : '1.1rem'
                    }}>
                        <InfoIcon sx={{ mr: 1, fontSize: isMobile ? '1.1rem' : '1.2rem' }} />
                        Device Info
                    </Typography>

                    <Grid container spacing={isMobile ? 2 : 3}>
                        {/* Left Column - Name and Description */}
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Device Name"
                                size="small"
                                value={deviceData.name ?? ""}
                                onChange={handleTextChange('name')}
                                sx={{ mb: 2 }}
                            />
                            <TextField
                                fullWidth
                                label="Description"
                                size="small"
                                multiline
                                rows={3}
                                value={deviceData.description ?? ""}
                                onChange={handleTextChange('description')}
                            />
                        </Grid>

                        {/* Right Column - Poll Rate and Send Rate */}
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Default Poll Rate (ms)"
                                size="small"
                                type="number"
                                value={deviceData.pollRate ?? 5000}
                                onChange={handleNumberChange('pollRate')}
                                slotProps={{ htmlInput: { min: 0 } }}
                                sx={{ mb: 2 }}
                            />
                            <TextField
                                fullWidth
                                label="Default Send Rate (ms)"
                                size="small"
                                type="number"
                                value={deviceData.sendRate ?? 5000}
                                onChange={handleNumberChange('sendRate')}
                                slotProps={{ htmlInput: { min: 0 } }}
                            />
                        </Grid>
                    </Grid>
                </Paper>

                {/* Virtual Screen Preview */}
                <Paper elevation={2} sx={{
                    p: 0,
                    height: '600px',
                    borderRadius: 2,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <Box sx={{
                        p: isMobile ? 2 : 3,
                        borderBottom: '1px solid #eee',
                        backgroundColor: 'background.paper'
                    }}>
                        <Typography variant="subtitle1" sx={{
                            display: 'flex',
                            alignItems: 'center',
                            fontSize: isMobile ? '1rem' : '1.1rem',
                            margin: 0
                        }}>
                            <SettingsIcon sx={{ mr: 1, fontSize: isMobile ? '1.1rem' : '1.2rem' }} />
                            Virtual Screen Preview
                        </Typography>
                    </Box>
                    <Box sx={{ flex: 1, position: 'relative' }}>
                        {mountVirtualScreen && deviceId && (
                            <EmbeddedVirtualScreenViewer
                                deviceId={deviceId}
                                deviceData={deviceData}
                                containerHeight={600 - (isMobile ? 68 : 76)}
                                showControls={true}
                            />
                        )}
                        {!mountVirtualScreen && (
                            <Box sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: '100%',
                                color: 'text.secondary'
                            }}>
                                <Typography variant="body2">Preparing navigation...</Typography>
                            </Box>
                        )}
                    </Box>
                </Paper>
            </Box>
        );
    }

    // Virtual Device: 5 fields + Connection card with IP and WebSocket port
    if (isVirtualDevice) {
        return (
            <Box>
                {/* Device Info Card - 2 columns layout */}
                <Paper elevation={2} sx={{
                    p: isMobile ? 2 : 3,
                    borderRadius: 2,
                    overflow: 'hidden',
                    mb: 3
                }}>
                    <Typography variant="subtitle1" gutterBottom sx={{
                        display: 'flex',
                        alignItems: 'center',
                        mb: isMobile ? 1.5 : 2,
                        fontSize: isMobile ? '1rem' : '1.1rem'
                    }}>
                        <InfoIcon sx={{ mr: 1, fontSize: isMobile ? '1.1rem' : '1.2rem' }} />
                        Device Info
                    </Typography>

                    <Grid container spacing={isMobile ? 2 : 3}>
                        {/* Left Column - Name and Description */}
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Device Name"
                                size="small"
                                value={deviceData.name ?? ""}
                                onChange={handleTextChange('name')}
                                sx={{ mb: 2 }}
                            />
                            <TextField
                                fullWidth
                                label="Description"
                                size="small"
                                multiline
                                rows={3}
                                value={deviceData.description ?? ""}
                                onChange={handleTextChange('description')}
                            />
                        </Grid>

                        {/* Right Column - Poll Rate and Send Rate */}
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Default Poll Rate (ms)"
                                size="small"
                                type="number"
                                value={deviceData.pollRate ?? 5000}
                                onChange={handleNumberChange('pollRate')}
                                slotProps={{ htmlInput: { min: 0 } }}
                                sx={{ mb: 2 }}
                            />
                            <TextField
                                fullWidth
                                label="Default Send Rate (ms)"
                                size="small"
                                type="number"
                                value={deviceData.sendRate ?? 5000}
                                onChange={handleNumberChange('sendRate')}
                                slotProps={{ htmlInput: { min: 0 } }}
                            />
                        </Grid>
                    </Grid>
                </Paper>

                {/* Connection Configuration Card */}
                <Paper elevation={2} sx={{
                    p: isMobile ? 2 : 3,
                    borderRadius: 2,
                    overflow: 'hidden'
                }}>
                    <Typography variant="subtitle1" gutterBottom sx={{
                        display: 'flex',
                        alignItems: 'center',
                        mb: isMobile ? 1.5 : 2,
                        fontSize: isMobile ? '1rem' : '1.1rem'
                    }}>
                        <PortIcon sx={{ mr: 1, fontSize: isMobile ? '1.1rem' : '1.2rem' }} />
                        Connection Configuration
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <TextField
                            fullWidth
                            label="IP Address"
                            size="small"
                            type="text"
                            value={deviceData.ipAddress ?? ""}
                            onChange={handleTextChange('ipAddress')}
                            placeholder="192.168.1.100"
                            helperText="IP address for network communication"
                        />
                        <TextField
                            fullWidth
                            label="WebSocket Port"
                            size="small"
                            type="number"
                            value={deviceData.webSocketPort ?? 8080}
                            onChange={handleNumberChange('webSocketPort')}
                            slotProps={{ htmlInput: { min: 1, max: 65535 } }}
                            helperText="Port for WebSocket communication"
                        />
                    </Box>
                </Paper>
            </Box>
        );
    }

    // Original Layout for non-Virtual devices
    return (
        <Box>
            <Box sx={{
                display: 'flex',
                gap: isMobile ? 2 : 3,
                flexDirection: isMobile ? 'column' : 'row',
                mb: 3
            }}>
                {/* Left Column - Device Info, Gateway Configuration, and Network Ports */}
                <Box sx={{
                    flex: isMobile ? '1' : '1 1 400px',
                    minWidth: isMobile ? 'auto' : '400px',
                    width: isMobile ? '100%' : 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: isMobile ? 2 : 3
                }}>
                    {/* Device Info Card */}
                    <Paper elevation={2} sx={{
                        p: isMobile ? 2 : 3,
                        borderRadius: 2,
                        overflow: 'hidden',
                        flex: 1
                    }}>
                        <Typography variant="subtitle1" gutterBottom sx={{
                            display: 'flex',
                            alignItems: 'center',
                            mb: isMobile ? 1.5 : 1,
                            fontSize: isMobile ? '1rem' : '1.1rem'
                        }}>
                            <InfoIcon sx={{ mr: 1, fontSize: isMobile ? '1.1rem' : '1.2rem' }} />
                            Device Info
                        </Typography>
                        <Box sx={{ mb: 2, overflow: 'auto' }}>
                            <TableContainer sx={{
                                maxWidth: '100%',
                                '& .MuiTable-root': { tableLayout: 'fixed' }
                            }}>
                                <Table size="small">
                                    <TableBody>
                                        {infoFields.map(({ key, label }) => (
                                            <TableRow key={key}>
                                                <TableCell sx={{
                                                    width: isMobile ? '35%' : '40%',
                                                    padding: isMobile ? '6px 8px' : '8px 16px',
                                                    borderBottom: '1px solid #eee',
                                                    wordBreak: 'break-word',
                                                    fontSize: isMobile ? '0.8rem' : '0.875rem'
                                                }}>
                                                    <Typography variant="body2" fontWeight="medium" sx={{
                                                        fontSize: isMobile ? '0.8rem' : '0.875rem',
                                                        lineHeight: 1.2
                                                    }}>
                                                        {label}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell sx={{
                                                    padding: isMobile ? '6px 8px' : '8px 16px',
                                                    borderBottom: '1px solid #eee',
                                                    overflow: 'hidden'
                                                }}>
                                                    {(isCustom && key !== "type") || alwaysEditableFields.includes(key) ? (
                                                        key === 'pollRate' || key === 'sendRate' ? (
                                                            <TextField
                                                                fullWidth
                                                                size="small"
                                                                type="number"
                                                                value={deviceData[key] ?? 0}
                                                                onChange={handleNumberChange(key)}
                                                                slotProps={{ htmlInput: { min: 0 } }}
                                                                sx={{
                                                                    '& .MuiInputBase-input': {
                                                                        fontSize: isMobile ? '0.8rem' : '0.875rem',
                                                                        padding: isMobile ? '6px 8px' : '8px 12px'
                                                                    }
                                                                }}
                                                            />
                                                        ) : key === 'hasCustomFirmware' ? (
                                                            <Typography variant="body2" sx={{
                                                                fontSize: isMobile ? '0.8rem' : '0.875rem',
                                                                wordBreak: 'break-word',
                                                                lineHeight: 1.2
                                                            }}>
                                                                {deviceData[key] ? "Yes" : "No"}
                                                            </Typography>
                                                        ) : (
                                                            <TextField
                                                                fullWidth
                                                                size="small"
                                                                value={deviceData[key] ?? ""}
                                                                onChange={handleTextChange(key)}
                                                                sx={{
                                                                    '& .MuiInputBase-input': {
                                                                        fontSize: isMobile ? '0.8rem' : '0.875rem',
                                                                        padding: isMobile ? '6px 8px' : '8px 12px'
                                                                    }
                                                                }}
                                                            />
                                                        )
                                                    ) : (
                                                        <Typography variant="body2" sx={{
                                                            fontSize: isMobile ? '0.8rem' : '0.875rem',
                                                            wordBreak: 'break-word',
                                                            lineHeight: 1.2
                                                        }}>
                                                            {deviceData[key] !== undefined ? String(deviceData[key]) : "—"}
                                                        </Typography>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {/* COM Port Selection */}
                                        {deviceData.supportsUSB && (
                                            <TableRow>
                                                <TableCell sx={{
                                                    width: isMobile ? '35%' : '40%',
                                                    padding: isMobile ? '6px 8px' : '8px 16px',
                                                    borderBottom: '1px solid #eee',
                                                    backgroundColor: isCOMPortInvalid ? 'rgba(244, 67, 54, 0.1)' : 'transparent'
                                                }}>
                                                    <Typography variant="body2" fontWeight="medium" sx={{
                                                        fontSize: isMobile ? '0.8rem' : '0.875rem',
                                                        color: isCOMPortInvalid ? 'error.main' : 'inherit'
                                                    }}>
                                                        COM Port
                                                    </Typography>
                                                </TableCell>
                                                <TableCell sx={{
                                                    padding: isMobile ? '6px 8px' : '8px 16px',
                                                    borderBottom: '1px solid #eee',
                                                    backgroundColor: isCOMPortInvalid ? 'rgba(244, 67, 54, 0.1)' : 'transparent'
                                                }}>
                                                    <FormControl fullWidth size="small" error={isCOMPortInvalid}>
                                                        <Select
                                                            value={selectedComPort || ""}
                                                            onChange={handleComPortChange}
                                                            displayEmpty
                                                            sx={{
                                                                '& .MuiSelect-select': {
                                                                    fontSize: isMobile ? '0.8rem' : '0.875rem',
                                                                    padding: isMobile ? '6px 8px' : '8px 12px'
                                                                },
                                                                '& .MuiOutlinedInput-notchedOutline': {
                                                                    borderColor: isCOMPortInvalid ? 'error.main' : undefined
                                                                }
                                                            }}
                                                        >
                                                            <MenuItem value=""><em>None</em></MenuItem>
                                                            {isCOMPortInvalid && (
                                                                <MenuItem value={deviceData.comPort} disabled sx={{ color: 'error.main', fontStyle: 'italic' }}>
                                                                    {deviceData.comPort} (No longer available)
                                                                </MenuItem>
                                                            )}
                                                            {comPorts.map((port) => (
                                                                <MenuItem key={port} value={port}>{port}</MenuItem>
                                                            ))}
                                                        </Select>
                                                    </FormControl>
                                                    {isCOMPortInvalid && (
                                                        <Typography variant="caption" color="error" sx={{
                                                            display: 'block',
                                                            mt: 0.5,
                                                            fontSize: isMobile ? '0.7rem' : '0.75rem'
                                                        }}>
                                                            Saved selection no longer exists
                                                        </Typography>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Box>
                    </Paper>

                    {/* Gateway Configuration Card */}
                    <Paper elevation={2} sx={{
                        p: isMobile ? 2 : 3,
                        borderRadius: 2,
                        overflow: 'hidden'
                    }}>
                        <Typography variant="subtitle1" gutterBottom sx={{
                            display: 'flex',
                            alignItems: 'center',
                            mb: isMobile ? 1.5 : 2,
                            fontSize: isMobile ? '1rem' : '1.1rem'
                        }}>
                            <DeviceHubIcon sx={{ mr: 1, fontSize: isMobile ? '1.1rem' : '1.2rem' }} />
                            Gateway Configuration
                        </Typography>

                        <Box sx={{ mb: 2 }}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={deviceData.isGateway || false}
                                        onChange={handleToggleChange('isGateway')}
                                        disabled={!isCustom}
                                        color="primary"
                                    />
                                }
                                label={
                                    <Typography variant="body2" sx={{
                                        fontSize: isMobile ? '0.8rem' : '0.875rem',
                                        fontWeight: 'medium'
                                    }}>
                                        Enable Gateway Mode
                                    </Typography>
                                }
                                sx={{ mb: 1 }}
                            />

                            <Typography variant="body2" color="text.secondary" sx={{
                                fontSize: isMobile ? '0.75rem' : '0.8rem',
                                lineHeight: 1.4,
                                mt: 1
                            }}>
                                Gateway devices can relay data from other devices on the network. Enable this setting if this device should act as a central hub for collecting and forwarding sensor data from multiple sources.
                            </Typography>
                        </Box>
                    </Paper>

                    {/* Network Ports Configuration Card */}
                    <Paper elevation={2} sx={{
                        p: isMobile ? 2 : 3,
                        borderRadius: 2,
                        overflow: 'hidden'
                    }}>
                        <Typography variant="subtitle1" gutterBottom sx={{
                            display: 'flex',
                            alignItems: 'center',
                            mb: isMobile ? 1.5 : 2,
                            fontSize: isMobile ? '1rem' : '1.1rem'
                        }}>
                            <PortIcon sx={{ mr: 1, fontSize: isMobile ? '1.1rem' : '1.2rem' }} />
                            Network Ports
                        </Typography>

                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <Box>
                                <Typography variant="body2" sx={{
                                    fontSize: isMobile ? '0.8rem' : '0.875rem',
                                    fontWeight: 'medium',
                                    mb: 0.5
                                }}>
                                    HTTP Port
                                </Typography>
                                <TextField
                                    fullWidth
                                    size="small"
                                    type="number"
                                    placeholder="80"
                                    value={deviceData.httpPort ?? ''}
                                    onChange={handleNumberChange('httpPort')}
                                    disabled={!isCustom}
                                    slotProps={{ htmlInput: { min: 1, max: 65535 } }}
                                    sx={{
                                        '& .MuiInputBase-input': {
                                            fontSize: isMobile ? '0.8rem' : '0.875rem',
                                            padding: isMobile ? '6px 8px' : '8px 12px'
                                        }
                                    }}
                                />
                                <Typography variant="caption" color="text.secondary" sx={{
                                    display: 'block',
                                    mt: 0.5,
                                    fontSize: isMobile ? '0.7rem' : '0.75rem'
                                }}>
                                    Default: 80
                                </Typography>
                            </Box>

                            <Box>
                                <Typography variant="body2" sx={{
                                    fontSize: isMobile ? '0.8rem' : '0.875rem',
                                    fontWeight: 'medium',
                                    mb: 0.5
                                }}>
                                    WebSocket Port
                                </Typography>
                                <TextField
                                    fullWidth
                                    size="small"
                                    type="number"
                                    placeholder="81"
                                    value={deviceData.webSocketPort ?? ''}
                                    onChange={handleNumberChange('webSocketPort')}
                                    disabled={!isCustom}
                                    slotProps={{ htmlInput: { min: 1, max: 65535 } }}
                                    sx={{
                                        '& .MuiInputBase-input': {
                                            fontSize: isMobile ? '0.8rem' : '0.875rem',
                                            padding: isMobile ? '6px 8px' : '8px 12px'
                                        }
                                    }}
                                />
                                <Typography variant="caption" color="text.secondary" sx={{
                                    display: 'block',
                                    mt: 0.5,
                                    fontSize: isMobile ? '0.7rem' : '0.75rem'
                                }}>
                                    Default: 81
                                </Typography>
                            </Box>

                            <Box>
                                <Typography variant="body2" sx={{
                                    fontSize: isMobile ? '0.8rem' : '0.875rem',
                                    fontWeight: 'medium',
                                    mb: 0.5
                                }}>
                                    MQTT Port
                                </Typography>
                                <TextField
                                    fullWidth
                                    size="small"
                                    type="number"
                                    placeholder="1883"
                                    value={deviceData.mqttPort ?? ''}
                                    onChange={handleNumberChange('mqttPort')}
                                    disabled={!isCustom}
                                    slotProps={{ htmlInput: { min: 1, max: 65535 } }}
                                    sx={{
                                        '& .MuiInputBase-input': {
                                            fontSize: isMobile ? '0.8rem' : '0.875rem',
                                            padding: isMobile ? '6px 8px' : '8px 12px'
                                        }
                                    }}
                                />
                                <Typography variant="caption" color="text.secondary" sx={{
                                    display: 'block',
                                    mt: 0.5,
                                    fontSize: isMobile ? '0.7rem' : '0.75rem'
                                }}>
                                    Default: 1883
                                </Typography>
                            </Box>

                            <Box>
                                <Typography variant="body2" sx={{
                                    fontSize: isMobile ? '0.8rem' : '0.875rem',
                                    fontWeight: 'medium',
                                    mb: 0.5
                                }}>
                                    SSH Port
                                </Typography>
                                <TextField
                                    fullWidth
                                    size="small"
                                    type="number"
                                    placeholder="22"
                                    value={deviceData.sshPort ?? ''}
                                    onChange={handleNumberChange('sshPort')}
                                    disabled={!isCustom}
                                    slotProps={{ htmlInput: { min: 1, max: 65535 } }}
                                    sx={{
                                        '& .MuiInputBase-input': {
                                            fontSize: isMobile ? '0.8rem' : '0.875rem',
                                            padding: isMobile ? '6px 8px' : '8px 12px'
                                        }
                                    }}
                                />
                                <Typography variant="caption" color="text.secondary" sx={{
                                    display: 'block',
                                    mt: 0.5,
                                    fontSize: isMobile ? '0.7rem' : '0.75rem'
                                }}>
                                    Default: 22
                                </Typography>
                            </Box>

                            <Box>
                                <Typography variant="body2" sx={{
                                    fontSize: isMobile ? '0.8rem' : '0.875rem',
                                    fontWeight: 'medium',
                                    mb: 0.5
                                }}>
                                    Hostname
                                </Typography>
                                <TextField
                                    fullWidth
                                    size="small"
                                    type="text"
                                    placeholder="device.local"
                                    value={deviceData.hostname ?? ''}
                                    onChange={handleTextChange('hostname')}
                                    disabled={!isCustom}
                                    sx={{
                                        '& .MuiInputBase-input': {
                                            fontSize: isMobile ? '0.8rem' : '0.875rem',
                                            padding: isMobile ? '6px 8px' : '8px 12px'
                                        }
                                    }}
                                />
                                <Typography variant="caption" color="text.secondary" sx={{
                                    display: 'block',
                                    mt: 0.5,
                                    fontSize: isMobile ? '0.7rem' : '0.75rem'
                                }}>
                                    Optional mDNS hostname
                                </Typography>
                            </Box>
                        </Box>
                    </Paper>
                </Box>

                {/* Right Column - Device Capabilities */}
                <Box sx={{
                    flex: isMobile ? '1' : '1 1 400px',
                    minWidth: isMobile ? 'auto' : '400px',
                    width: isMobile ? '100%' : 'auto'
                }}>
                    <Paper elevation={2} sx={{
                        p: isMobile ? 2 : 3,
                        height: '100%',
                        borderRadius: 2,
                        overflow: 'hidden'
                    }}>
                        <Typography variant="subtitle1" gutterBottom sx={{
                            display: 'flex',
                            alignItems: 'center',
                            mb: isMobile ? 1.5 : 1,
                            fontSize: isMobile ? '1rem' : '1.1rem'
                        }}>
                            <SettingsIcon sx={{ mr: 1, fontSize: isMobile ? '1.1rem' : '1.2rem' }} />
                            Device Capabilities
                        </Typography>
                        <Box sx={{ mb: 2, overflow: 'auto' }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {capFields.map(({ key, label }) => (
                                    <Box key={key} sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        py: 0.5,
                                        borderBottom: '1px solid #f0f0f0'
                                    }}>
                                        <Typography variant="body2" sx={{
                                            fontSize: isMobile ? '0.8rem' : '0.875rem',
                                            fontWeight: 'medium'
                                        }}>
                                            {label}
                                        </Typography>

                                        {isCustom ? (
                                            <Switch
                                                checked={deviceData[key] || false}
                                                onChange={handleToggleChange(key)}
                                                size="small"
                                                color="primary"
                                            />
                                        ) : (
                                            <Typography variant="body2" sx={{
                                                fontSize: isMobile ? '0.8rem' : '0.875rem',
                                                color: deviceData[key] ? 'success.main' : 'text.secondary'
                                            }}>
                                                {deviceData[key] ? "Yes" : "No"}
                                            </Typography>
                                        )}
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                    </Paper>
                </Box>
            </Box>
        </Box>
    );
};

export default DeviceInfoPanel;