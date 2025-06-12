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
import { useParams, useNavigate } from "react-router-dom";
import {
    Typography, Box, CircularProgress, Button, Snackbar, Alert, Paper,
    Tabs, Tab, Chip
} from "@mui/material";

// Import icons
import InfoIcon from '@mui/icons-material/Info';
import DevicesIcon from '@mui/icons-material/Devices';
import UpdateIcon from '@mui/icons-material/Update';
import SensorsIcon from '@mui/icons-material/Sensors';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SyncIcon from '@mui/icons-material/Sync';
import TuneIcon from '@mui/icons-material/Tune';
import VerifiedIcon from '@mui/icons-material/Verified';
import ErrorIcon from '@mui/icons-material/Error';
import AnalyticsIcon from '@mui/icons-material/Analytics';

// Import sub-components
import DeviceInfoPanel from '../components/DeviceInfoPanel';
import DeviceScreensPanel from '../components/DeviceScreensPanel';
import FirmwareManagementPanel from '../components/FirmwareManagementPanel';
import DeviceSensorsPanel from '../components/DeviceSensorsPanel';
import DevicePreferencesPanel from '../components/DevicePreferencesPanel';
import DeviceSystemStatsPanel from '../components/DeviceSystemStatsPanel';

// Define interface for TabPanel props
interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

interface FirmwareInfo {
    current_version: string;
    latest_version: string;
    firmware_file: string;
    is_outdated: boolean;
}

// TabPanel Component
const TabPanel = ({ children, value, index, ...other }: TabPanelProps) => {
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`device-tabpanel-${index}`}
            aria-labelledby={`device-tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box sx={{ p: 3 }}>{children}</Box>
            )}
        </div>
    );
};

const ConfigureDevice: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    // State
    const [loading, setLoading] = useState<boolean>(true);
    const [deviceData, setDeviceData] = useState<any>(null);
    const [newSensors, setNewSensors] = useState<any[]>([]);
    const [error, setError] = useState<string>("");
    const [status, setStatus] = useState<string>("Loading...");
    const [deviceScreens, setDeviceScreens] = useState<any[]>([]);
    const [i2cDevices, setI2cDevices] = useState<any[]>([]);
    const [layoutTemplates, setLayoutTemplates] = useState<any[]>([]);
    const [comPorts, setComPorts] = useState<string[]>([]);
    const [selectedComPort, setSelectedComPort] = useState<string>("");
    const [initialFirmwareInfo, setInitialFirmwareInfo] = useState<FirmwareInfo | null>(null);

    // Snackbar state
    const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);
    const [snackbarMessage, setSnackbarMessage] = useState<string>("");
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "error" | "warning" | "info">("success");

    // Tab state - persist to localStorage
    const [tabValue, setTabValue] = useState(() => {
        try {
            const savedTab = localStorage.getItem('deviceConfigTab');
            return savedTab ? parseInt(savedTab, 10) : 0;
        } catch (error) {
            console.error("Error accessing localStorage:", error);
            return 0;
        }
    });

    // Show snackbar notification
    const showSnackbar = useCallback((message: string, severity: "success" | "error" | "warning" | "info" = "success") => {
        setSnackbarMessage(message);
        setSnackbarSeverity(severity);
        setSnackbarOpen(true);
    }, []);

    // Handle tab change
    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
        try {
            localStorage.setItem('deviceConfigTab', newValue.toString());
        } catch (error) {
            console.error("Error saving tab state to localStorage:", error);
        }
    };

    // Fetch device screens
    const fetchDeviceScreens = useCallback(async (deviceId: string) => {
        const res = await fetch(`/api/devices/${deviceId}/screens`);
        if (!res.ok) throw new Error("Failed to fetch device screens.");
        return await res.json();
    }, []);

    // Check for firmware updates using cache
    const checkFirmwareUpdates = useCallback(async (deviceId: string, isJunctionRelayDevice: boolean, ignoreUpdates: boolean) => {
        if (!isJunctionRelayDevice || ignoreUpdates) {
            return null;
        }

        try {
            console.log(`Auto-checking for firmware updates for device ${deviceId} (using cache)`);
            const firmwareRes = await fetch(`/api/ota/check/${deviceId}?force=false`);

            if (!firmwareRes.ok) {
                if (firmwareRes.status === 404) {
                    console.log("No firmware available for this device - this is normal");
                    return null;
                }
                throw new Error("Failed to check for firmware updates");
            }

            const firmwareData = await firmwareRes.json();
            console.log('Firmware check result:', firmwareData);

            // Show notification if update is available
            if (firmwareData.is_outdated) {
                showSnackbar(`Firmware update available: v${firmwareData.latest_version}`, "info");
            }

            return firmwareData;
        } catch (error) {
            console.log('Firmware check failed (expected for some devices):', error);
            return null;
        }
    }, [showSnackbar]);

    // Fetch device data
    const fetchDeviceData = useCallback(async () => {
        try {
            setStatus("Fetching device data...");
            const [deviceRes, portsRes, i2cRes, layoutsRes] = await Promise.all([
                fetch(`/api/devices/${id}`),
                fetch("/api/Controller_Com_Ports/com-ports"),
                fetch(`/api/devices/${id}/i2c-devices`),
                fetch("/api/layouts")
            ]);

            if (!deviceRes.ok) throw new Error("Failed to fetch device");
            if (!portsRes.ok) throw new Error("Failed to fetch COM ports");
            if (!i2cRes.ok) throw new Error("Failed to fetch I2C devices");
            if (!layoutsRes.ok) throw new Error("Failed to fetch layout templates");

            const device = await deviceRes.json();
            const ports = await portsRes.json();
            const i2c = await i2cRes.json();
            const layouts = await layoutsRes.json();
            const screens = id ? await fetchDeviceScreens(id) : [];

            // Auto-check for firmware updates ONCE on page load (using cache)
            const firmwareInfo = await checkFirmwareUpdates(
                id || "",
                device.isJunctionRelayDevice || false,
                device.ignoreUpdates || false
            );

            setDeviceData(device);
            setComPorts(ports);
            setSelectedComPort(device.SelectedPort || "");
            setI2cDevices(i2c);
            setLayoutTemplates(layouts);
            setDeviceScreens(screens);
            setInitialFirmwareInfo(firmwareInfo);
            setStatus("Device info loaded.");
        } catch (err: any) {
            console.error(err);
            setError(err.message);
            setStatus("Failed to load device info.");
        } finally {
            setLoading(false);
        }
    }, [id, fetchDeviceScreens, checkFirmwareUpdates]);

    // Initial data fetch - includes ONE firmware check using cache
    useEffect(() => {
        if (id) {
            fetchDeviceData();
        } else {
            setError("Device ID not provided.");
            setLoading(false);
        }
    }, [id, fetchDeviceData]);

    // Handle device deletion
    const handleDeleteDevice = async () => {
        try {
            const response = await fetch(`/api/devices/${id}`, { method: "DELETE" });
            if (!response.ok) throw new Error("Failed to delete device");
            showSnackbar("Device deleted successfully", "success");
            navigate("/devices");
        } catch (err: any) {
            console.error(err);
            showSnackbar("Failed to delete device", "error");
        }
    };

    // Replace your handleResync method with this fixed version:

    const handleResync = async () => {
        if (!deviceData?.ipAddress) return showSnackbar("Device IP not available for resync", "error");
        try {
            setLoading(true);

            // 1. Get device info and capabilities
            const [infoRes, capRes] = await Promise.all([
                fetch(`/api/devices/info?ip=${encodeURIComponent(deviceData.ipAddress)}`),
                fetch(`/api/devices/capabilities?ip=${encodeURIComponent(deviceData.ipAddress)}`)
            ]);

            if (!infoRes.ok || !capRes.ok) throw new Error("Resync failed.");

            const infoJson = await infoRes.json();
            const capJson = await capRes.json();

            // 2. Create properly mapped update object (only include valid Model_Device properties)
            const updated = {
                ...deviceData, // Start with existing device data

                // Update with device info (map to correct property names)
                deviceModel: infoJson.deviceInfo?.deviceModel || deviceData.deviceModel,
                deviceManufacturer: infoJson.deviceInfo?.deviceManufacturer || deviceData.deviceManufacturer,
                firmwareVersion: infoJson.deviceInfo?.firmwareVersion || deviceData.firmwareVersion,
                mcu: infoJson.deviceInfo?.mcu || deviceData.mcu,
                wirelessConnectivity: infoJson.deviceInfo?.wirelessConnectivity || deviceData.wirelessConnectivity,
                flash: infoJson.deviceInfo?.flash || deviceData.flash,
                psram: infoJson.deviceInfo?.psram || deviceData.psram,
                uniqueIdentifier: infoJson.deviceInfo?.uniqueIdentifier || deviceData.uniqueIdentifier,

                // Update with capabilities (map to correct property names)
                hasOnboardScreen: capJson.capabilities?.HasOnboardScreen ?? deviceData.hasOnboardScreen,
                hasOnboardLED: capJson.capabilities?.HasOnboardLED ?? deviceData.hasOnboardLED,
                hasOnboardRGBLED: capJson.capabilities?.HasOnboardRGBLED ?? deviceData.hasOnboardRGBLED,
                hasExternalMatrix: capJson.capabilities?.HasExternalMatrix ?? deviceData.hasExternalMatrix,
                hasExternalNeopixels: capJson.capabilities?.HasExternalNeopixels ?? deviceData.hasExternalNeopixels,
                hasExternalI2CDevices: capJson.capabilities?.HasExternalI2CDevices ?? deviceData.hasExternalI2CDevices,
                hasButtons: capJson.capabilities?.HasButtons ?? deviceData.hasButtons,
                hasBattery: capJson.capabilities?.HasBattery ?? deviceData.hasBattery,
                supportsWiFi: capJson.capabilities?.SupportsWiFi ?? deviceData.supportsWiFi,
                supportsBLE: capJson.capabilities?.SupportsBLE ?? deviceData.supportsBLE,
                supportsUSB: capJson.capabilities?.SupportsUSB ?? deviceData.supportsUSB,
                supportsESPNow: capJson.capabilities?.SupportsESPNow ?? deviceData.supportsESPNow,
                supportsHTTP: capJson.capabilities?.SupportsHTTP ?? deviceData.supportsHTTP,
                supportsMQTT: capJson.capabilities?.SupportsMQTT ?? deviceData.supportsMQTT,
                supportsWebSockets: capJson.capabilities?.SupportsWebSockets ?? deviceData.supportsWebSockets,
                hasSpeaker: capJson.capabilities?.HasSpeaker ?? deviceData.hasSpeaker,
                hasMicroSD: capJson.capabilities?.HasMicroSD ?? deviceData.hasMicroSD,
                isGateway: capJson.capabilities?.IsGateway ?? deviceData.isGateway,

                // Update timestamp
                lastUpdated: new Date().toISOString()
            };

            // 3. Remove any properties that shouldn't be sent to backend
            const { sensors, supportedProtocols, i2cDevices, screens, ...deviceUpdatePayload } = updated;

            console.log("[DEBUG] Sending device update payload:", deviceUpdatePayload);

            // 4. Update the device in the database
            const putRes = await fetch(`/api/devices/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(deviceUpdatePayload)
            });

            if (!putRes.ok) {
                const errorText = await putRes.text();
                console.error("[DEBUG] Update failed:", errorText);
                throw new Error(`Failed to update device: ${putRes.status} ${errorText}`);
            }

            // 5. Update local state with the full updated object
            setDeviceData(updated);

            // 6. Trigger firmware verification if it's a Junction Relay device
            if (updated.isJunctionRelayDevice) {
                try {
                    await fetch(`/api/ota/verify-firmware/${id}`, {
                        method: 'POST'
                    });
                    console.log("Firmware verification triggered during resync");

                    // 7. Refresh device data to get updated custom firmware flag
                    setTimeout(() => {
                        fetchDeviceData(); // Use your existing fetch method
                    }, 2000);
                } catch (verifyErr) {
                    console.warn("Firmware verification failed during resync:", verifyErr);
                    // Don't fail the whole resync if verification fails
                }
            }

            showSnackbar("Resync successful! Device information updated.", "success");
        } catch (err: any) {
            console.error("Resync error:", err);
            showSnackbar(`Resync failed: ${err.message}`, "error");
        } finally {
            setLoading(false);
        }
    };

    // Handle refreshing sensors
    const handleRefreshSensors = async () => {
        try {
            setLoading(true);
            const isHost = deviceData.type === "Host Device";
            const res = await fetch(`/api/devices/${id}/delta?isHostDevice=${isHost}`);
            if (!res.ok) throw new Error("Failed to fetch delta sensors.");
            const sensors = await res.json();
            setNewSensors(sensors);
            showSnackbar("Sensors refreshed", "success");
        } catch (err) {
            console.error(err);
            showSnackbar("Failed to refresh sensors", "error");
        } finally {
            setLoading(false);
        }
    };

    // Save device changes
    const handleSave = async () => {
        try {
            setLoading(true);
            const { sensors, ...withoutSensors } = deviceData;
            withoutSensors.SelectedPort = selectedComPort;
            const res = await fetch(`/api/devices/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(withoutSensors)
            });
            if (!res.ok) throw new Error("Failed to save changes.");
            showSnackbar("Changes saved successfully!", "success");
        } catch (err: any) {
            console.error(err);
            showSnackbar("Failed to save changes", "error");
        } finally {
            setLoading(false);
        }
    };

    // Handle ignoring firmware updates
    const handleUpdateIgnoreSettings = async (ignoreUpdates: boolean) => {
        try {
            const updatedDevice = { ...deviceData, ignoreUpdates };
            const res = await fetch(`/api/devices/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedDevice)
            });

            if (!res.ok) throw new Error("Failed to update notification settings");
            setDeviceData(updatedDevice);
            showSnackbar("Notification settings updated", "success");
        } catch (error) {
            console.error("Error updating notification settings:", error);
            showSnackbar("Failed to update notification settings", "error");
        }
    };

    if (loading) {
        return (
            <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" p={4}>
                <CircularProgress size={50} />
                <Typography variant="h6" sx={{ mt: 2 }}>{status}</Typography>
            </Box>
        );
    }

    if (error) {
        return (
            <Box p={4}>
                <Alert severity="error" sx={{ mb: 2 }}>
                    <Typography>{error}</Typography>
                </Alert>
                <Button variant="contained" startIcon={<ArrowBackIcon />} onClick={() => navigate("/devices")}>
                    Back to Devices
                </Button>
            </Box>
        );
    }

    const isCustom = deviceData.type === "Custom";
    const isJunctionRelayDevice = deviceData.isJunctionRelayDevice || false;

    return (
        <Box sx={{ padding: 2 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h4">
                    Configure Device: {deviceData.name}
                </Typography>
                <Box>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<ArrowBackIcon />}
                        onClick={() => navigate("/devices")}
                    >
                        Back to Devices
                    </Button>
                </Box>
            </Box>

            {/* Device Status & Action Buttons */}
            <Paper
                elevation={2}
                sx={{
                    p: 3,
                    mb: 3,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}
            >
                <Box display="flex" alignItems="center">
                    <Box
                        component="span"
                        sx={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            bgcolor: deviceData.status === "Online" ? "green" :
                                deviceData.status === "Offline" ? "red" : "#f0ad4e",
                            mr: 1,
                            display: "inline-block"
                        }}
                    />
                    <Typography variant="subtitle1" fontWeight="medium">
                        Status: {deviceData.status || "Unknown"}
                    </Typography>
                    {deviceData.firmwareVersion && (
                        <Chip
                            label={`Firmware ${deviceData.firmwareVersion}`}
                            size="small"
                            color="primary"
                            variant="outlined"
                            sx={{ ml: 2 }}
                        />
                    )}
                    {/* NEW: Add firmware authenticity indicator */}
                    {isJunctionRelayDevice && (
                        <Chip
                            icon={deviceData.hasCustomFirmware ? <ErrorIcon /> : <VerifiedIcon />}
                            label={deviceData.hasCustomFirmware ? "Custom Firmware" : "Authentic Firmware"}
                            size="small"
                            color={deviceData.hasCustomFirmware ? "warning" : "success"}
                            variant="outlined"
                            sx={{ ml: 1 }}
                        />
                    )}
                    {initialFirmwareInfo?.is_outdated && (
                        <Chip
                            label="Update Available"
                            size="small"
                            color="warning"
                            variant="outlined"
                            sx={{ ml: 1 }}
                        />
                    )}
                </Box>

                <Box display="flex" gap={2}>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={handleSave}
                        startIcon={<SaveIcon />}
                        size="small"
                    >
                        Save Changes
                    </Button>

                    {deviceData.type !== "Host Device" && (
                        <Button
                            variant="outlined"
                            startIcon={<SyncIcon />}
                            size="small"
                            onClick={handleResync}
                        >
                            Resync Device
                        </Button>
                    )}

                    <Button
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        size="small"
                        onClick={handleRefreshSensors}
                    >
                        Refresh Sensors
                    </Button>

                    {deviceData.type !== "Host Device" && (
                        <Button
                            variant="outlined"
                            color="error"
                            startIcon={<DeleteIcon />}
                            size="small"
                            onClick={handleDeleteDevice}
                        >
                            Delete Device
                        </Button>
                    )}
                </Box>
            </Paper>

            {/* Delta Sensors Notification */}
            {newSensors.length > 0 && (
                <Paper elevation={2} sx={{ p: 2, mb: 3, borderRadius: 2 }}>
                    <Alert severity="info" sx={{ mb: 1 }}>
                        <Typography variant="subtitle1">
                            {newSensors.length} new sensor{newSensors.length > 1 ? 's' : ''} found
                        </Typography>
                    </Alert>
                    <Typography variant="body2">
                        New sensors have been detected on this device. Navigate to the Sensors tab to add them to your database.
                    </Typography>
                </Paper>
            )}

            {/* Main Tabs Interface */}
            <Paper sx={{ width: '100%', mb: 4 }} elevation={2}>
                <Tabs
                    value={tabValue}
                    onChange={handleTabChange}
                    aria-label="device configuration tabs"
                    sx={{ borderBottom: 1, borderColor: 'divider' }}
                >
                    <Tab
                        icon={<InfoIcon />}
                        iconPosition="start"
                        label="Device Details"
                        id="device-tab-0"
                        aria-controls="device-tabpanel-0"
                    />
                    <Tab
                        icon={<DevicesIcon />}
                        iconPosition="start"
                        label="Screens & I2C Bus"
                        id="device-tab-1"
                        aria-controls="device-tabpanel-1"
                    />
                    <Tab
                        icon={<UpdateIcon />}
                        iconPosition="start"
                        label="Firmware Management"
                        id="device-tab-2"
                        aria-controls="device-tabpanel-2"
                    />
                    <Tab
                        icon={<SensorsIcon />}
                        iconPosition="start"
                        label="Sensors"
                        id="device-tab-3"
                        aria-controls="device-tabpanel-3"
                    />
                    <Tab
                        icon={<TuneIcon />}
                        iconPosition="start"
                        label="Preferences"
                        id="device-tab-4"
                        aria-controls="device-tabpanel-4"
                    />
                    <Tab
                        icon={<AnalyticsIcon />}
                        iconPosition="start"
                        label="System Stats"
                        id="device-tab-5"
                        aria-controls="device-tabpanel-5"
                    />
                </Tabs>

                {/* Device Details Tab */}
                <TabPanel value={tabValue} index={0}>
                    <DeviceInfoPanel
                        deviceData={deviceData}
                        setDeviceData={setDeviceData}
                        isCustom={isCustom}
                        comPorts={comPorts}
                        selectedComPort={selectedComPort}
                        setSelectedComPort={setSelectedComPort}
                    />
                </TabPanel>

                {/* Screens & I2C Bus Tab */}
                <TabPanel value={tabValue} index={1}>
                    <DeviceScreensPanel
                        deviceId={id || ""}
                        deviceScreens={deviceScreens}
                        setDeviceScreens={setDeviceScreens}
                        i2cDevices={i2cDevices}
                        setI2cDevices={setI2cDevices}
                        layoutTemplates={layoutTemplates}
                        isCustom={isCustom}
                        showSnackbar={showSnackbar}
                    />
                </TabPanel>

                {/* Firmware Management Tab */}
                <TabPanel value={tabValue} index={2}>
                    <FirmwareManagementPanel
                        deviceId={id || ""}
                        currentFirmware={deviceData.firmwareVersion || "Unknown"}
                        isJunctionRelayDevice={isJunctionRelayDevice}
                        ignoreUpdates={deviceData.ignoreUpdates || false}
                        hasCustomFirmware={deviceData.hasCustomFirmware || false}
                        refreshDeviceData={fetchDeviceData}
                        showSnackbar={showSnackbar}
                        onUpdateIgnoreSettings={handleUpdateIgnoreSettings}
                        initialFirmwareInfo={initialFirmwareInfo}
                    />
                </TabPanel>

                {/* Sensors Tab */}
                <TabPanel value={tabValue} index={3}>
                    <DeviceSensorsPanel
                        deviceId={id || ""}
                        deviceData={deviceData}
                        newSensors={newSensors}
                        setNewSensors={setNewSensors}
                        showSnackbar={showSnackbar}
                    />
                </TabPanel>

                {/* Preferences Tab */}
                <TabPanel value={tabValue} index={4}>
                    <DevicePreferencesPanel
                        deviceId={id || ""}
                        deviceData={deviceData}
                        showSnackbar={showSnackbar}
                    />
                </TabPanel>

                {/* System Stats Tab */}
                <TabPanel value={tabValue} index={5}>
                    <DeviceSystemStatsPanel
                        deviceId={id || ""}
                        deviceData={deviceData}
                        showSnackbar={showSnackbar}
                    />
                </TabPanel>
            </Paper>

            {/* Snackbar for notifications */}
            <Snackbar
                open={snackbarOpen}
                autoHideDuration={5000}
                onClose={() => setSnackbarOpen(false)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setSnackbarOpen(false)}
                    severity={snackbarSeverity}
                    sx={{ width: "100%" }}
                >
                    {snackbarMessage}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default ConfigureDevice;