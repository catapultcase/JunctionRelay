/*
 * This file is part of Junction Relay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * Junction Relay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Junction Relay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Junction Relay. If not, see <https://www.gnu.org/licenses/>.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
    Typography, Box, Paper, Button, TextField, FormControl,
    InputLabel, Select, MenuItem, CircularProgress, Alert,
    FormControlLabel, Switch, FormHelperText, SelectChangeEvent,
    Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle
} from "@mui/material";
import SettingsIcon from '@mui/icons-material/Settings';
import WifiIcon from '@mui/icons-material/Wifi';
import RouterIcon from '@mui/icons-material/Router';
import ScreenRotationIcon from '@mui/icons-material/ScreenRotation';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CableIcon from '@mui/icons-material/Cable';
import * as deviceApi from '../services/deviceApiServices';

interface DevicePreferences {
    connMode: string;
    wifiSSID: string;
    wifiPassword: string;
    mqttBroker: string;
    mqttUsername: string;
    mqttPassword: string;
    rotation: number;
    swapBlueGreen?: boolean;
    externalNeoPixelsData1?: string | number;  // Allow string or number
    externalNeoPixelsData2?: string | number;  // Allow string or number
}

interface DevicePreferencesPanelProps {
    deviceId: string;
    deviceData: any;
    showSnackbar: (message: string, severity: "success" | "error" | "warning" | "info") => void;
}

const DevicePreferencesPanel: React.FC<DevicePreferencesPanelProps> = ({
    deviceId,
    deviceData,
    showSnackbar
}) => {
    const [preferences, setPreferences] = useState<DevicePreferences>({
        connMode: "wifi",
        wifiSSID: "",
        wifiPassword: "",
        mqttBroker: "",
        mqttUsername: "",
        mqttPassword: "",
        rotation: 0,
        swapBlueGreen: false,
        externalNeoPixelsData1: "35",  // Change to string default
        externalNeoPixelsData2: "0"    // Change to string default
    });

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showRebootDialog, setShowRebootDialog] = useState(false);
    const [rebooting, setRebooting] = useState(false);

    // Fetch device preferences
    const fetchDevicePreferences = useCallback(async () => {
        if (!deviceData?.ipAddress) {
            setError("Device IP address not available");
            return;
        }

        try {
            setLoading(true);
            const deviceIp = deviceData.ipAddress;

            const data = await deviceApi.getDevicePreferences(deviceIp);
            setPreferences({
                ...data,
                swapBlueGreen: data.swapBlueGreen || false,
                externalNeoPixelsData1: data.externalNeoPixelsData1?.toString() || "0",
                externalNeoPixelsData2: data.externalNeoPixelsData2?.toString() || "0"
            });
            setError(null);
        } catch (err) {
            console.error("Error fetching device preferences:", err);
            setError("Failed to load device preferences. Make sure the device is online and accessible.");
        } finally {
            setLoading(false);
        }
    }, [deviceData?.ipAddress]);

    // Load device preferences when component mounts
    useEffect(() => {
        fetchDevicePreferences();
    }, [fetchDevicePreferences]);

    // Save updated preferences
    const savePreferences = async () => {
        if (!deviceData?.ipAddress) {
            showSnackbar("Device IP address not available", "error");
            return;
        }

        try {
            setSaving(true);
            const deviceIp = deviceData.ipAddress;

            // Pass true for reboot parameter - we're rebooting when saving normally
            await deviceApi.saveDevicePreferences(deviceIp, preferences, true);
            showSnackbar("Device preferences saved successfully. Rebooting device...", "success");
        } catch (err) {
            console.error("Error saving device preferences:", err);
            showSnackbar("Failed to save device preferences", "error");
        } finally {
            setSaving(false);
        }
    };

    // Handle form field changes
    const handleInputChange = (field: keyof DevicePreferences) => (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        // For pin fields, keep as string to allow "A3" etc.
        const value = (field === 'externalNeoPixelsData1' || field === 'externalNeoPixelsData2')
            ? event.target.value  // Keep as string
            : event.target.value;

        setPreferences({
            ...preferences,
            [field]: value
        });
    };

    // Handle rotation change
    const handleRotationChange = (event: SelectChangeEvent<number>) => {
        setPreferences({
            ...preferences,
            rotation: Number(event.target.value)
        });
    };

    // Handle switch change
    const handleSwitchChange = (field: keyof DevicePreferences) => (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        setPreferences({
            ...preferences,
            [field]: event.target.checked
        });
    };

    // Handle device reboot
    const handleReboot = async () => {
        if (!deviceData?.ipAddress) {
            showSnackbar("Device IP address not available", "error");
            return;
        }

        try {
            setRebooting(true);
            const deviceIp = deviceData.ipAddress;

            // Use the updated rebootDevice method which uses the preferences API with restart flag
            await deviceApi.rebootDevice(deviceIp);
            showSnackbar("Device rebooting...", "success");
            setShowRebootDialog(false);

            // Wait for the device to reboot before attempting to fetch preferences again
            setTimeout(() => {
                fetchDevicePreferences();
            }, 30000); // Wait 30 seconds before trying to fetch again
        } catch (err) {
            console.error("Error rebooting device:", err);
            showSnackbar("Failed to reboot device", "error");
        } finally {
            setRebooting(false);
        }
    };

    // Convert rotation value to degrees display text
    const getRotationDisplayText = (value: number): string => {
        switch (value) {
            case 0: return "0° (Normal)";
            case 1: return "90° (Right)";
            case 2: return "180° (Inverted)";
            case 3: return "270° (Left)";
            default: return `${value} (Unknown)`;
        }
    };

    return (
        <Box>
            {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                </Alert>
            )}

            <Paper elevation={2} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
                <Typography variant="subtitle1" gutterBottom sx={{
                    display: 'flex',
                    alignItems: 'center',
                    mb: 2
                }}>
                    <SettingsIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                    Device Preferences
                </Typography>

                <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                    <Button
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={fetchDevicePreferences}
                        disabled={loading}
                    >
                        Refresh Preferences
                    </Button>

                    <Button
                        variant="contained"
                        startIcon={<SaveIcon />}
                        onClick={savePreferences}
                        disabled={loading || saving}
                    >
                        {saving ? "Saving..." : "Save Preferences"}
                    </Button>

                    <Button
                        variant="outlined"
                        color="warning"
                        startIcon={<RestartAltIcon />}
                        onClick={() => setShowRebootDialog(true)}
                        disabled={loading || saving || rebooting}
                    >
                        Reboot Device
                    </Button>
                </Box>

                {loading ? (
                    <Box display="flex" justifyContent="center" my={4}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Box component="form" sx={{ mt: 2 }}>
                        {/* Top Row: WiFi and MQTT Side by Side */}
                        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                            {/* WiFi Settings */}
                            <Box sx={{ flex: '1 1 300px', minWidth: '300px' }}>
                                <Paper elevation={1} sx={{ p: 2, bgcolor: '#f8f9fa', borderRadius: 1, height: '100%' }}>
                                    <Typography variant="subtitle2" sx={{
                                        mb: 2,
                                        display: 'flex',
                                        alignItems: 'center',
                                        color: 'primary.main'
                                    }}>
                                        <WifiIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                                        WiFi Configuration
                                    </Typography>

                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        <TextField
                                            label="WiFi SSID"
                                            value={preferences.wifiSSID}
                                            onChange={handleInputChange('wifiSSID')}
                                            fullWidth
                                            size="small"
                                            margin="none"
                                        />

                                        <TextField
                                            label="WiFi Password"
                                            value={preferences.wifiPassword}
                                            onChange={handleInputChange('wifiPassword')}
                                            type="password"
                                            fullWidth
                                            size="small"
                                            margin="none"
                                        />
                                    </Box>
                                </Paper>
                            </Box>

                            {/* MQTT Settings */}
                            <Box sx={{ flex: '1 1 300px', minWidth: '300px' }}>
                                <Paper elevation={1} sx={{ p: 2, bgcolor: '#f8f9fa', borderRadius: 1, height: '100%' }}>
                                    <Typography variant="subtitle2" sx={{
                                        mb: 2,
                                        display: 'flex',
                                        alignItems: 'center',
                                        color: 'primary.main'
                                    }}>
                                        <RouterIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                                        MQTT Configuration
                                    </Typography>

                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        <TextField
                                            label="MQTT Broker"
                                            value={preferences.mqttBroker}
                                            onChange={handleInputChange('mqttBroker')}
                                            fullWidth
                                            size="small"
                                            margin="none"
                                            placeholder="host:port"
                                        />

                                        <TextField
                                            label="MQTT Username (optional)"
                                            value={preferences.mqttUsername}
                                            onChange={handleInputChange('mqttUsername')}
                                            fullWidth
                                            size="small"
                                            margin="none"
                                        />

                                        <TextField
                                            label="MQTT Password (optional)"
                                            value={preferences.mqttPassword}
                                            onChange={handleInputChange('mqttPassword')}
                                            type="password"
                                            fullWidth
                                            size="small"
                                            margin="none"
                                        />
                                    </Box>
                                </Paper>
                            </Box>
                        </Box>

                        {/* Bottom Row: Display Config and Pin Config Side by Side */}
                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                            {/* Display Settings */}
                            <Box sx={{ flex: '1 1 300px', minWidth: '300px' }}>
                                <Paper elevation={1} sx={{ p: 2, bgcolor: '#f8f9fa', borderRadius: 1, height: '100%' }}>
                                    <Typography variant="subtitle2" sx={{
                                        mb: 2,
                                        display: 'flex',
                                        alignItems: 'center',
                                        color: 'primary.main'
                                    }}>
                                        <ScreenRotationIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                                        Display Configuration
                                    </Typography>

                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        <FormControl fullWidth size="small">
                                            <InputLabel id="rotation-label">Screen Rotation</InputLabel>
                                            <Select
                                                labelId="rotation-label"
                                                value={preferences.rotation}
                                                label="Screen Rotation"
                                                onChange={handleRotationChange}
                                            >
                                                <MenuItem value={0}>{getRotationDisplayText(0)}</MenuItem>
                                                <MenuItem value={1}>{getRotationDisplayText(1)}</MenuItem>
                                                <MenuItem value={2}>{getRotationDisplayText(2)}</MenuItem>
                                                <MenuItem value={3}>{getRotationDisplayText(3)}</MenuItem>
                                            </Select>
                                        </FormControl>

                                        <FormControlLabel
                                            control={
                                                <Switch
                                                    checked={preferences.swapBlueGreen || false}
                                                    onChange={handleSwitchChange('swapBlueGreen')}
                                                />
                                            }
                                            label="Swap Blue/Green channels"
                                        />
                                        <FormHelperText>
                                            For Adafruit 64x32 RGB LED Matrix - 2.5mm pitch
                                        </FormHelperText>
                                    </Box>
                                </Paper>
                            </Box>

                            {/* Pin Configuration */}
                            <Box sx={{ flex: '1 1 300px', minWidth: '300px' }}>
                                <Paper elevation={1} sx={{ p: 2, bgcolor: '#f8f9fa', borderRadius: 1, height: '100%' }}>
                                    <Typography variant="subtitle2" sx={{
                                        mb: 2,
                                        display: 'flex',
                                        alignItems: 'center',
                                        color: 'primary.main'
                                    }}>
                                        <CableIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                                        Pin Configuration
                                    </Typography>

                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                            <TextField
                                                label="External NeoPixels Data 1"
                                                value={preferences.externalNeoPixelsData1}
                                                onChange={handleInputChange('externalNeoPixelsData1')}
                                                type="text"  // Change from "number" to "text"
                                                fullWidth
                                                size="small"
                                                margin="none"
                                                placeholder="35 or A3"  // Add helpful placeholder
                                            />

                                            <TextField
                                                label="External NeoPixels Data 2"
                                                value={preferences.externalNeoPixelsData2}
                                                onChange={handleInputChange('externalNeoPixelsData2')}
                                                type="text"  // Change from "number" to "text"
                                                fullWidth
                                                size="small"
                                                margin="none"
                                                placeholder="0 or A1"   // Add helpful placeholder
                                            />

                                            <FormHelperText>
                                                GPIO pin numbers (e.g., 35, 0) or analog pins (e.g., A1, A3)
                                            </FormHelperText>
                                    </Box>
                                </Paper>
                            </Box>
                        </Box>
                    </Box>
                )}
            </Paper>

            {/* Reboot confirmation dialog */}
            <Dialog
                open={showRebootDialog}
                onClose={() => setShowRebootDialog(false)}
                aria-labelledby="reboot-dialog-title"
                aria-describedby="reboot-dialog-description"
            >
                <DialogTitle id="reboot-dialog-title">
                    Confirm Device Reboot
                </DialogTitle>
                <DialogContent>
                    <DialogContentText id="reboot-dialog-description">
                        Are you sure you want to reboot the device? The device will be unavailable for a short time during the reboot process.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setShowRebootDialog(false)} disabled={rebooting}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleReboot}
                        color="warning"
                        autoFocus
                        disabled={rebooting}
                    >
                        {rebooting ? "Rebooting..." : "Reboot Device"}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default DevicePreferencesPanel;