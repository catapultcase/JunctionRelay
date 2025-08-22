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
    TableContainer, useTheme, useMediaQuery, Switch, FormControlLabel
} from "@mui/material";
import InfoIcon from '@mui/icons-material/Info';
import SettingsIcon from '@mui/icons-material/Settings';
import DeviceHubIcon from '@mui/icons-material/DeviceHub';
import EmbeddedVirtualScreenViewer from '../pages/VirtualScreenViewer';

interface DeviceInfoPanelProps {
    deviceData: any;
    setDeviceData: (data: any) => void;
    isCustom: boolean;
    comPorts: string[];
    selectedComPort: string;
    setSelectedComPort: (port: string) => void;
    onAutoSave?: (updatedData: any, field: string, immediate?: boolean) => void;
    deviceId?: string; // Add deviceId prop
}

const DeviceInfoPanel: React.FC<DeviceInfoPanelProps> = ({
    deviceData,
    setDeviceData,
    isCustom,
    comPorts,
    selectedComPort,
    setSelectedComPort,
    onAutoSave,
    deviceId
}) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Sync selectedComPort with deviceData changes - initialize and update
    React.useEffect(() => {
        console.log('[DeviceInfoPanel] useEffect triggered:', {
            deviceDataComPort: deviceData?.comPort,
            selectedComPort,
            deviceDataExists: !!deviceData
        });

        if (deviceData?.comPort !== undefined) {
            console.log('[DeviceInfoPanel] Setting selectedComPort to:', deviceData.comPort);
            setSelectedComPort(deviceData.comPort || "");
        } else {
            console.log('[DeviceInfoPanel] deviceData.comPort is undefined, not updating selectedComPort');
        }
    }, [deviceData?.comPort, setSelectedComPort]);

    // Check if selected port is invalid - memoized to prevent excessive re-renders
    const isCOMPortInvalid = React.useMemo(() => {
        const isInvalid = deviceData?.comPort &&
            deviceData.comPort !== "" &&
            comPorts.length > 0 &&
            !comPorts.includes(deviceData.comPort);

        console.log('[DeviceInfoPanel] isCOMPortInvalid computed:', {
            deviceComPort: deviceData?.comPort,
            comPortsLength: comPorts.length,
            isInvalid
        });

        return isInvalid;
    }, [deviceData?.comPort, comPorts]);

    // Simple field change handler - match your working v4 signature
    const handleFieldChange = (field: string, value: any, immediate: boolean = false) => {
        console.log(`[DeviceInfoPanel] handleFieldChange called:`, {
            field,
            value,
            immediate,
            currentDeviceData: deviceData,
            onAutoSaveExists: !!onAutoSave
        });

        // Create updated data object like your working version expects
        const updatedData = {
            ...deviceData,
            [field]: value
        };

        console.log(`[DeviceInfoPanel] Created updatedData:`, updatedData);

        // Call with the signature your working ConfigureDevice expects
        if (onAutoSave) {
            console.log(`[DeviceInfoPanel] Calling onAutoSave with:`, { updatedData, field, immediate });
            onAutoSave(updatedData, field, immediate);
        } else {
            console.warn('[DeviceInfoPanel] onAutoSave is not provided!');
        }
    };

    // Helper function to handle text input changes with debounced auto-save
    const handleTextChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = event.target.value;
        console.log(`[DeviceInfoPanel] Text change: ${field} = ${newValue}`);
        handleFieldChange(field, newValue, false); // false = debounced save
    };

    // Helper function to handle number input changes with debounced auto-save
    const handleNumberChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value === '' ? 0 : Number(event.target.value);
        console.log(`[DeviceInfoPanel] Number change: ${field} = ${value}`);
        handleFieldChange(field, value, false); // false = debounced save
    };

    // Helper function to handle boolean toggle changes with immediate auto-save
    const handleToggleChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.checked;
        console.log(`[DeviceInfoPanel] Toggle change: ${field} = ${value}`);
        handleFieldChange(field, value, true); // true = immediate save
    };

    // Handle COM port selection with immediate auto-save
    const handleComPortChange = (event: SelectChangeEvent) => {
        const newPort = event.target.value;
        console.log('[DeviceInfoPanel] handleComPortChange:', {
            newPort,
            currentSelectedComPort: selectedComPort,
            currentDeviceCOMPort: deviceData?.COMPort
        });

        setSelectedComPort(newPort);
        console.log('[DeviceInfoPanel] setSelectedComPort called with:', newPort);

        handleFieldChange('comPort', newPort, true);
        console.log('[DeviceInfoPanel] handleFieldChange called for COMPort with value:', newPort);
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
        { key: 'firmwareVersion', label: 'Firmware Version' },
        { key: 'hasCustomFirmware', label: 'Has Custom Firmware' },
        { key: 'mcu', label: 'MCU' },
        { key: 'wirelessConnectivity', label: 'Wireless Connectivity' },
        { key: 'flash', label: 'Flash' },
        { key: 'psram', label: 'PSRAM' },
        { key: 'pollRate', label: 'Default Poll Rate' },
        { key: 'sendRate', label: 'Default Send Rate' }
    ];

    // Define capability fields (removed isGateway - now in separate card)
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

    // Check if this is a Virtual Screen device
    const isVirtualScreen = deviceData?.type === 'Virtual Screen';

    return (
        <Box>
            {/* Device Info and Capabilities Cards */}
            <Box sx={{
                display: 'flex',
                gap: isMobile ? 2 : 3,
                flexDirection: isMobile ? 'column' : 'row',
                mb: 3
            }}>
                {/* Left Column - Device Info and Gateway Configuration */}
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
                                '& .MuiTable-root': {
                                    tableLayout: 'fixed'
                                }
                            }}>
                                <Table size="small">
                                    <TableBody>
                                        {infoFields.map(({ key, label }) => (
                                            <TableRow key={key}>
                                                <TableCell
                                                    sx={{
                                                        width: isMobile ? '35%' : '40%',
                                                        padding: isMobile ? '6px 8px' : '8px 16px',
                                                        borderBottom: '1px solid #eee',
                                                        wordBreak: 'break-word',
                                                        fontSize: isMobile ? '0.8rem' : '0.875rem'
                                                    }}
                                                >
                                                    <Typography
                                                        variant="body2"
                                                        fontWeight="medium"
                                                        sx={{
                                                            fontSize: isMobile ? '0.8rem' : '0.875rem',
                                                            lineHeight: 1.2
                                                        }}
                                                    >
                                                        {label}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell
                                                    sx={{
                                                        padding: isMobile ? '6px 8px' : '8px 16px',
                                                        borderBottom: '1px solid #eee',
                                                        overflow: 'hidden'
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
                                                                sx={{
                                                                    '& .MuiInputBase-input': {
                                                                        fontSize: isMobile ? '0.8rem' : '0.875rem',
                                                                        padding: isMobile ? '6px 8px' : '8px 12px'
                                                                    }
                                                                }}
                                                            />
                                                        ) : key === 'hasCustomFirmware' ? (
                                                            // Special handling for hasCustomFirmware - show as Yes/No display only
                                                            <Typography
                                                                variant="body2"
                                                                sx={{
                                                                    fontSize: isMobile ? '0.8rem' : '0.875rem',
                                                                    wordBreak: 'break-word',
                                                                    lineHeight: 1.2
                                                                }}
                                                            >
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
                                                        <Typography
                                                            variant="body2"
                                                            sx={{
                                                                fontSize: isMobile ? '0.8rem' : '0.875rem',
                                                                wordBreak: 'break-word',
                                                                lineHeight: 1.2
                                                            }}
                                                        >
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
                                                        width: isMobile ? '35%' : '40%',
                                                        padding: isMobile ? '6px 8px' : '8px 16px',
                                                        borderBottom: '1px solid #eee',
                                                        backgroundColor: isCOMPortInvalid ? 'rgba(244, 67, 54, 0.1)' : 'transparent'
                                                    }}
                                                >
                                                    <Typography
                                                        variant="body2"
                                                        fontWeight="medium"
                                                        sx={{
                                                            fontSize: isMobile ? '0.8rem' : '0.875rem',
                                                            color: isCOMPortInvalid ? 'error.main' : 'inherit'
                                                        }}
                                                    >
                                                        COM Port
                                                    </Typography>
                                                </TableCell>
                                                <TableCell
                                                    sx={{
                                                        padding: isMobile ? '6px 8px' : '8px 16px',
                                                        borderBottom: '1px solid #eee',
                                                        backgroundColor: isCOMPortInvalid ? 'rgba(244, 67, 54, 0.1)' : 'transparent'
                                                    }}
                                                >
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
                                                            <MenuItem value="">
                                                                <em>None</em>
                                                            </MenuItem>
                                                            {/* Show the invalid saved port if it exists */}
                                                            {isCOMPortInvalid && (
                                                                <MenuItem value={deviceData.comPort} disabled sx={{ color: 'error.main', fontStyle: 'italic' }}>
                                                                    {deviceData.comPort} (No longer available)
                                                                </MenuItem>
                                                            )}
                                                            {comPorts.map((port) => (
                                                                <MenuItem key={port} value={port}>
                                                                    {port}
                                                                </MenuItem>
                                                            ))}
                                                        </Select>
                                                    </FormControl>
                                                    {isCOMPortInvalid && (
                                                        <Typography
                                                            variant="caption"
                                                            color="error"
                                                            sx={{
                                                                display: 'block',
                                                                mt: 0.5,
                                                                fontSize: isMobile ? '0.7rem' : '0.75rem'
                                                            }}
                                                        >
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
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            fontSize: isMobile ? '0.8rem' : '0.875rem',
                                            fontWeight: 'medium'
                                        }}
                                    >
                                        Enable Gateway Mode
                                    </Typography>
                                }
                                sx={{ mb: 1 }}
                            />

                            <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{
                                    fontSize: isMobile ? '0.75rem' : '0.8rem',
                                    lineHeight: 1.4,
                                    mt: 1
                                }}
                            >
                                Gateway devices can relay data from other devices on the network. Enable this setting if this device should act as a central hub for collecting and forwarding sensor data from multiple sources.
                            </Typography>
                        </Box>
                    </Paper>
                </Box>

                {/* Right Column - Device Capabilities OR Virtual Screen Viewer */}
                <Box sx={{
                    flex: isMobile ? '1' : '1 1 400px',
                    minWidth: isMobile ? 'auto' : '400px',
                    width: isMobile ? '100%' : 'auto'
                }}>
                    {isVirtualScreen ? (
                        /* Virtual Screen Viewer */
                        <Paper elevation={2} sx={{
                            p: 0, // No padding for the viewer
                            height: '600px', // Fixed height for consistent layout
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
                            <Box sx={{
                                flex: 1,
                                position: 'relative'
                            }}>
                                <EmbeddedVirtualScreenViewer
                                    deviceId={deviceId || deviceData.id?.toString() || deviceData.uniqueIdentifier || ''}
                                    deviceData={deviceData} // Pass the device data to avoid API call
                                    containerHeight={600 - (isMobile ? 68 : 76)} // Account for header
                                    showControls={true}
                                />
                            </Box>
                        </Paper>
                    ) : (
                        /* Device Capabilities */
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
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    fontSize: isMobile ? '0.8rem' : '0.875rem',
                                                    fontWeight: 'medium'
                                                }}
                                            >
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
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        fontSize: isMobile ? '0.8rem' : '0.875rem',
                                                        color: deviceData[key] ? 'success.main' : 'text.secondary'
                                                    }}
                                                >
                                                    {deviceData[key] ? "Yes" : "No"}
                                                </Typography>
                                            )}
                                        </Box>
                                    ))}
                                </Box>
                            </Box>
                        </Paper>
                    )}
                </Box>
            </Box>
        </Box>
    );
};

export default DeviceInfoPanel;