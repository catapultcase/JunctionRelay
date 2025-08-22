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

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    Typography, Box, CircularProgress, Button, Snackbar, Alert, Paper,
    Tabs, Tab, Chip, Accordion, AccordionSummary, AccordionDetails,
    useTheme, useMediaQuery, Badge
} from "@mui/material";

// Import icons
import InfoIcon from '@mui/icons-material/Info';
import DevicesIcon from '@mui/icons-material/Devices';
import UpdateIcon from '@mui/icons-material/Update';
import SensorsIcon from '@mui/icons-material/Sensors';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SyncIcon from '@mui/icons-material/Sync';
import TuneIcon from '@mui/icons-material/Tune';
import VerifiedIcon from '@mui/icons-material/Verified';
import ErrorIcon from '@mui/icons-material/Error';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import History from '@mui/icons-material/History';

// Import hooks
import { useAutoSave, useAutoSaveWithChangeDetection } from '../hooks/useAutoSave';

// Import sub-components
import DeviceInfoPanel from '../components/Device_InfoPanel';
import DeviceSyncModal from '../components/Device_SyncModal';
import EditModeModal from '../components/Device_EditModeModal';
import DeviceHeartbeatPanel from '../components/DeviceHeartbeatPanel';
import DeviceHeartbeatHistoryPanel from '../components/DeviceHeartbeatHistoryPanel';
import DeviceScreensPanel from '../components/DeviceScreensPanel';
import FirmwareManagementPanel from '../components/FirmwareManagementPanel';
import DeviceSensorsPanel from '../components/DeviceSensorsPanel';
import DevicePreferencesPanel from '../components/DevicePreferencesPanel';
import DeviceSystemStatsPanel from '../components/DeviceSystemStatsPanel';



interface FirmwareInfo {
    current_version: string;
    latest_version: string;
    firmware_file: string;
    is_outdated: boolean;
}

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

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
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Basic component state
    const [loading, setLoading] = useState<boolean>(true);
    const [deviceData, setDeviceData] = useState<any>(null);
    const [originalDeviceData, setOriginalDeviceData] = useState<any>(null);
    const [newSensors, setNewSensors] = useState<any[]>([]);
    const [error, setError] = useState<string>("");
    const [status, setStatus] = useState<string>("Loading...");
    const [deviceScreens, setDeviceScreens] = useState<any[]>([]);
    const [originalScreens, setOriginalScreens] = useState<any[]>([]);
    const [i2cDevices, setI2cDevices] = useState<any[]>([]);
    const [layoutTemplates, setLayoutTemplates] = useState<any[]>([]);
    const [frameTemplates, setFrameTemplates] = useState<any[]>([]);
    const [comPorts, setComPorts] = useState<string[]>([]);
    const [selectedComPort, setSelectedComPort] = useState<string>("");
    const [initialFirmwareInfo, setInitialFirmwareInfo] = useState<FirmwareInfo | null>(null);

    // Sync/Edit modals
    const [syncModalOpen, setSyncModalOpen] = useState(false);
    const [editModeModalOpen, setEditModeModalOpen] = useState(false);

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

    // Accordion state for mobile - supports multiple open panels
    const [accordionStates, setAccordionStates] = useState<{ [key: string]: boolean }>(() => {
        try {
            const saved = localStorage.getItem('deviceConfigAccordionStates');
            return saved ? JSON.parse(saved) : {
                panel0: true,   // Device Details - open by default
                panel1: false,  // Heartbeat Monitoring
                panel2: false,  // Heartbeat History
                panel3: false,  // Screens & I2C Bus
                panel4: false,  // Firmware Management
                panel5: false,  // Sensors
                panel6: false,  // Preferences
                panel7: false   // System Stats
            };
        } catch (error) {
            console.error("Error accessing localStorage:", error);
            return {
                panel0: true,
                panel1: false,
                panel2: false,
                panel3: false,
                panel4: false,
                panel5: false,
                panel6: false,
                panel7: false
            };
        }
    });

    // Show snackbar notification
    const showSnackbar = useCallback((message: string, severity: "success" | "error" | "warning" | "info" = "success") => {
        setSnackbarMessage(message);
        setSnackbarSeverity(severity);
        setSnackbarOpen(true);
    }, []);

    // Auto-save hooks with enhanced success callbacks
    const deviceAutoSave = useAutoSave(
        `/api/devices/${id}`,
        originalDeviceData,
        {
            onSuccess: (savedData) => {
                // Update the original data reference to reflect successful save
                setOriginalDeviceData(JSON.parse(JSON.stringify(savedData)));
                console.log('[AUTO-SAVE] Device auto-saved successfully');
            },
            onError: (error) => {
                console.error('[AUTO-SAVE] Device auto-save failed:', error);
                showSnackbar('Auto-save failed', 'error');
            },
            debug: true // ENABLE DEBUG for detailed logs
        }
    );

    const screensAutoSave = useAutoSaveWithChangeDetection(
        `/api/devices/${id}/screens/batch`, // Assuming a batch update endpoint
        deviceScreens,
        originalScreens,
        [], // No fields to exclude for screens
        {
            onSuccess: (savedData) => {
                setOriginalScreens(JSON.parse(JSON.stringify(deviceScreens)));
                console.log('Screens auto-saved successfully');
            },
            onError: (error) => {
                console.error('Screens auto-save failed:', error);
                showSnackbar('Screen auto-save failed', 'error');
            }
        }
    );

    // Universal auto-save handler - ADD DEBUG LOGS to your working version
    const handleAutoSave = useCallback((updatedData: any, field: string, immediate: boolean = false) => {
        console.log(`[ConfigureDevice] handleAutoSave called:`, {
            field,
            immediate,
            oldValue: deviceData?.[field],
            newValue: updatedData[field],
            hasDataChanged: JSON.stringify(deviceData) !== JSON.stringify(updatedData)
        });

        // Update local state
        setDeviceData(updatedData);
        console.log(`[ConfigureDevice] Local state updated for field: ${field}`);

        // Always trigger auto-save with appropriate timing
        console.log(`[ConfigureDevice] Calling deviceAutoSave.save for field: ${field}`);
        deviceAutoSave.save(updatedData, { immediate });
    }, [deviceAutoSave, deviceData]);

    // Handle tab change
    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
        try {
            localStorage.setItem('deviceConfigTab', newValue.toString());
        } catch (error) {
            console.error("Error saving tab state to localStorage:", error);
        }
    };

    // Handle accordion change for mobile
    const handleAccordionChange = (panel: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
        setAccordionStates(prev => ({
            ...prev,
            [panel]: isExpanded
        }));
    };

    // Save accordion states to localStorage
    useEffect(() => {
        try {
            localStorage.setItem('deviceConfigAccordionStates', JSON.stringify(accordionStates));
        } catch (error) {
            console.error("Error saving accordion states to localStorage:", error);
        }
    }, [accordionStates]);

    // Update change detection when data changes
    useEffect(() => {
        screensAutoSave.checkForChanges();
    }, [deviceScreens, screensAutoSave]);

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
                fetch("/api/com/ports"),
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

            // Handle SSH credentials properly for existing devices
            if (device.Id) {
                // Store the original username (it's not sensitive)
                const originalSshUsername = device.SshUsername;

                // Add flags for existing credentials
                device.hasSshPassword = !!(device.SshPassword && device.SshPassword.length > 0);
                device.hasSshPrivateKey = !!(device.SshPrivateKey && device.SshPrivateKey.length > 0);

                // Remove actual sensitive values - never send to frontend
                delete device.SshPassword;
                delete device.SshPrivateKey;

                // But restore the username since it's not sensitive
                device.SshUsername = originalSshUsername;
            }

            setDeviceData(device);
            setOriginalDeviceData(JSON.parse(JSON.stringify(device)));
            setComPorts(ports);
            setSelectedComPort(device.COMPort || "");
            setI2cDevices(i2c);
            setLayoutTemplates(layouts);
            setFrameTemplates(layouts);
            setDeviceScreens(screens);
            setOriginalScreens(JSON.parse(JSON.stringify(screens)));
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

    // Initial data fetch
    useEffect(() => {
        if (id) {
            fetchDeviceData();
        } else {
            setError("Device ID not provided.");
            setLoading(false);
        }
    }, [id, fetchDeviceData]);

    // Handle device deletion
    const handleDeleteDevice = useCallback(async () => {
        try {
            const response = await fetch(`/api/devices/${id}`, { method: "DELETE" });
            if (!response.ok) throw new Error("Failed to delete device");
            showSnackbar("Device deleted successfully", "success");
            navigate("/devices");
        } catch (err: any) {
            console.error(err);
            showSnackbar("Failed to delete device", "error");
        }
    }, [id, showSnackbar, navigate]);

    // Handle resync
    const handleResyncIP = useCallback(async () => {
        if (!deviceData?.ipAddress) return showSnackbar("Device IP not available for resync", "error");
        try {
            setLoading(true);

            // 1. Get device info and capabilities
            const [infoRes, capRes] = await Promise.all([
                fetch(`/api/devices/info?ip=${encodeURIComponent(deviceData.ipAddress)}`),
                fetch(`/api/devices/capabilities?ip=${encodeURIComponent(deviceData.ipAddress)}`)
            ]);

            if (!infoRes.ok || !capRes.ok) throw new Error("IP Resync failed.");

            const infoJson = await infoRes.json();
            const capJson = await capRes.json();

            // 2. Create properly mapped update object
            const updated = {
                ...deviceData,
                deviceModel: infoJson.deviceInfo?.deviceModel || deviceData.deviceModel,
                deviceManufacturer: infoJson.deviceInfo?.deviceManufacturer || deviceData.deviceManufacturer,
                firmwareVersion: infoJson.deviceInfo?.firmwareVersion || deviceData.firmwareVersion,
                mcu: infoJson.deviceInfo?.mcu || deviceData.mcu,
                wirelessConnectivity: infoJson.deviceInfo?.wirelessConnectivity || deviceData.wirelessConnectivity,
                flash: infoJson.deviceInfo?.flash || deviceData.flash,
                psram: infoJson.deviceInfo?.psram || deviceData.psram,
                uniqueIdentifier: infoJson.deviceInfo?.uniqueIdentifier || deviceData.uniqueIdentifier,
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
                lastUpdated: new Date().toISOString()
            };

            // 3. Use auto-save to update the device
            setDeviceData(updated);
            await deviceAutoSave.save(updated, { immediate: true });

            // 4. Update original data to reflect successful resync
            setOriginalDeviceData(JSON.parse(JSON.stringify(updated)));
            deviceAutoSave.updateOriginalData(updated);

            // 5. Trigger firmware verification if it's a JunctionRelay device
            if (updated.isJunctionRelayDevice) {
                try {
                    await fetch(`/api/ota/verify-firmware/${id}`, {
                        method: 'POST'
                    });
                    setTimeout(() => {
                        fetchDeviceData();
                    }, 2000);
                } catch (verifyErr) {
                    console.warn("Firmware verification failed during resync:", verifyErr);
                }
            }

            showSnackbar("IP Resync successful! Device information updated.", "success");
        } catch (err: any) {
            console.error("IP Resync error:", err);
            showSnackbar(`IP Resync failed: ${err.message}`, "error");
        } finally {
            setLoading(false);
        }
    }, [deviceData, showSnackbar, deviceAutoSave, id, fetchDeviceData]);

    const handleDeviceSync = useCallback(() => {
        setSyncModalOpen(true);
    }, []);

    const handleSyncSuccess = useCallback(() => {
        // Refresh device data after successful sync
        fetchDeviceData();
    }, [fetchDeviceData]);

    const handleEnableEditMode = useCallback(() => {
        setEditModeModalOpen(true);
    }, []);

    const handleEditModeSuccess = useCallback(() => {
        // Refresh device data to reflect the type change
        fetchDeviceData();
    }, [fetchDeviceData]);

    // Handle refreshing sensors
    const handleRefreshSensors = useCallback(async () => {
        try {
            setLoading(true);
            const isHost = deviceData?.type === "Host Device";
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
    }, [id, deviceData?.type, showSnackbar]);

    // Handle ignoring firmware updates
    const handleUpdateIgnoreSettings = async (ignoreUpdates: boolean) => {
        const updatedDevice = { ...deviceData, ignoreUpdates };
        setDeviceData(updatedDevice);

        // Use auto-save for immediate update
        await deviceAutoSave.save(updatedDevice, { immediate: true });
        showSnackbar("Notification settings updated", "success");
    };

    // Listen for bottom action bar events on mobile
    useEffect(() => {
        if (!isMobile) return;

        const handleBottomActionResync = () => handleResyncIP();
        const handleBottomActionRefreshSensors = () => handleRefreshSensors();
        const handleBottomActionDelete = () => {
            if (window.confirm('Are you sure you want to delete this device?')) {
                handleDeleteDevice();
            }
        };

        window.addEventListener('bottom-action-resync', handleBottomActionResync);
        window.addEventListener('bottom-action-refresh-sensors', handleBottomActionRefreshSensors);
        window.addEventListener('bottom-action-delete-device', handleBottomActionDelete);

        return () => {
            window.removeEventListener('bottom-action-resync', handleBottomActionResync);
            window.removeEventListener('bottom-action-refresh-sensors', handleBottomActionRefreshSensors);
            window.removeEventListener('bottom-action-delete-device', handleBottomActionDelete);
        };
    }, [isMobile, handleDeleteDevice, handleRefreshSensors, handleResyncIP]);

    // Dispatch bottom action bar configuration for mobile
    useEffect(() => {
        if (isMobile && deviceData) {
            const event = new CustomEvent('configure-device-bottom-actions', {
                detail: {
                    secondaryActions: [
                        ...(deviceData.type !== "Host Device" ? [{
                            icon: <SyncIcon />,
                            label: 'Resync',
                            onClick: () => window.dispatchEvent(new CustomEvent('bottom-action-resync'))
                        }] : []),
                        {
                            icon: <RefreshIcon />,
                            label: 'Refresh',
                            onClick: () => window.dispatchEvent(new CustomEvent('bottom-action-refresh-sensors'))
                        },
                        ...(deviceData.type !== "Host Device" ? [{
                            icon: <DeleteIcon />,
                            label: 'Delete',
                            color: 'error' as const,
                            onClick: () => window.dispatchEvent(new CustomEvent('bottom-action-delete-device'))
                        }] : [])
                    ],
                    // Add status indicator for auto-save status
                    statusIndicator: deviceAutoSave.status === 'saving' ? {
                        text: 'Saving...',
                        color: 'info',
                        icon: '~'
                    } : (deviceAutoSave.status === 'saved' ? {
                        text: 'Saved',
                        color: 'success',
                        icon: '+'
                    } : (deviceAutoSave.status === 'error' ? {
                        text: 'Save failed',
                        color: 'error',
                        icon: '!'
                    } : undefined))
                }
            });
            window.dispatchEvent(event);
        }

        return () => {
            if (isMobile) {
                window.dispatchEvent(new CustomEvent('configure-device-bottom-actions', {
                    detail: { clear: true }
                }));
            }
        };
    }, [isMobile, deviceData, deviceAutoSave.status]);

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

    // Define accordion panels configuration - UPDATED with new Heartbeat History panel
    const accordionPanels = [
        {
            id: 'panel0',
            icon: <InfoIcon />,
            title: 'Device Details',
            badge: null,
            content: (
                <DeviceInfoPanel
                    deviceData={deviceData}
                    setDeviceData={setDeviceData}
                    isCustom={isCustom}
                    comPorts={comPorts}
                    selectedComPort={selectedComPort}
                    setSelectedComPort={setSelectedComPort}
                    onAutoSave={handleAutoSave}
                    deviceId={id}
                />
            )
        },
        {
            id: 'panel1',
            icon: <MonitorHeartIcon />,
            title: 'Heartbeat Configuration',
            badge: null,
            content: (
                <DeviceHeartbeatPanel
                    deviceData={deviceData}
                    onAutoSave={handleAutoSave}
                />
            )
        },
        {
            id: 'panel2',
            icon: <History />,
            title: 'Heartbeat History',
            badge: null,
            content: (
                <DeviceHeartbeatHistoryPanel deviceId={id || ""} />
            )
        },
        {
            id: 'panel3',
            icon: <DevicesIcon />,
            title: 'Screens & I2C Bus',
            badge: null,
            content: (
                <DeviceScreensPanel
                    deviceId={id || ""}
                    deviceScreens={deviceScreens}
                    setDeviceScreens={setDeviceScreens}
                    i2cDevices={i2cDevices}
                    setI2cDevices={setI2cDevices}
                    layoutTemplates={layoutTemplates}
                    frameTemplates={frameTemplates}
                    isCustom={isCustom}
                    showSnackbar={showSnackbar}
                    onScreenChange={(screens) => {
                        setDeviceScreens(screens);
                        screensAutoSave.markChanged();
                    }}
                />
            )
        },
        {
            id: 'panel4',
            icon: <UpdateIcon />,
            title: 'Firmware Management',
            badge: initialFirmwareInfo?.is_outdated ? 1 : null,
            content: (
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
            )
        },
        {
            id: 'panel5',
            icon: <SensorsIcon />,
            title: 'Sensors',
            badge: newSensors.length > 0 ? newSensors.length : null,
            content: (
                <DeviceSensorsPanel
                    deviceId={id || ""}
                    deviceData={deviceData}
                    newSensors={newSensors}
                    setNewSensors={setNewSensors}
                    showSnackbar={showSnackbar}
                />
            )
        },
        {
            id: 'panel6',
            icon: <TuneIcon />,
            title: 'Preferences',
            badge: null,
            content: (
                <DevicePreferencesPanel
                    deviceId={id || ""}
                    deviceData={deviceData}
                    showSnackbar={showSnackbar}
                />
            )
        },
        {
            id: 'panel7',
            icon: <AnalyticsIcon />,
            title: 'System Stats',
            badge: null,
            content: (
                <DeviceSystemStatsPanel
                    deviceId={id || ""}
                    deviceData={deviceData}
                    showSnackbar={showSnackbar}
                />
            )
        }
    ];

    return (
        <Box sx={{ padding: isMobile ? 1 : 2 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant={isMobile ? "h5" : "h4"}>
                    Configure Device: {deviceData.name}
                </Typography>
                <Box>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<ArrowBackIcon />}
                        onClick={() => navigate("/devices")}
                    >
                        {isMobile ? 'Back' : 'Back to Devices'}
                    </Button>
                </Box>
            </Box>

            {/* Device Status & Action Buttons - Only show on desktop */}
            {!isMobile && (
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
                        {/* Firmware authenticity indicator */}
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

                    <Box display="flex" gap={2} alignItems="center">
                        {/* NEW: Edit Mode Button - Only for non-Custom devices */}
                        {!isCustom && (
                            <Button
                                variant="outlined"
                                startIcon={<EditIcon />}
                                size="small"
                                onClick={handleEnableEditMode}
                                color="warning"
                            >
                                Edit
                            </Button>
                        )}

                        {deviceData.type !== "Host Device" && (
                            <>
                                {/* RENAMED: Old Resync Device button becomes Resync IP */}
                                <Button
                                    variant="outlined"
                                    startIcon={<SyncIcon />}
                                    size="small"
                                    onClick={handleResyncIP}
                                >
                                    Resync IP
                                </Button>

                                {/* NEW: Full Device Sync button */}
                                <Button
                                    variant="contained"
                                    startIcon={<SyncIcon />}
                                    size="small"
                                    onClick={handleDeviceSync}
                                    color="primary"
                                >
                                    Resync Device
                                </Button>
                            </>
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

                        {/* Auto-save status indicator */}
                        {deviceAutoSave.status !== 'idle' && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                {deviceAutoSave.status === 'saving' && (
                                    <>
                                        <CircularProgress size={12} />
                                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                                            Saving...
                                        </Typography>
                                    </>
                                )}
                                {deviceAutoSave.status === 'saved' && (
                                    <Typography variant="body2" color="success.main" sx={{ fontSize: '0.75rem' }}>
                                        Saved
                                    </Typography>
                                )}
                                {deviceAutoSave.status === 'error' && (
                                    <Typography variant="body2" color="error.main" sx={{ fontSize: '0.75rem' }}>
                                        Save failed
                                    </Typography>
                                )}
                            </Box>
                        )}
                    </Box>
                </Paper>
            )}

            {/* Mobile Status Bar - Enhanced version with action buttons */}
            {isMobile && (
                <Paper
                    elevation={2}
                    sx={{
                        p: 2,
                        mb: 2,
                        borderRadius: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2
                    }}
                >
                    {/* Status Row */}
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                        <Box display="flex" alignItems="center" flex={1}>
                            <Box
                                component="span"
                                sx={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: "50%",
                                    bgcolor: deviceData.status === "Online" ? "green" :
                                        deviceData.status === "Offline" ? "red" : "#f0ad4e",
                                    mr: 1,
                                    display: "inline-block"
                                }}
                            />
                            <Typography variant="body2" fontWeight="medium">
                                {deviceData.status || "Unknown"}
                            </Typography>
                            {deviceData.firmwareVersion && (
                                <Chip
                                    label={`v${deviceData.firmwareVersion}`}
                                    size="small"
                                    color="primary"
                                    variant="outlined"
                                    sx={{ ml: 1, fontSize: '0.7rem', height: 20 }}
                                />
                            )}
                        </Box>

                        <Box display="flex" alignItems="center" gap={0.5}>
                            {isJunctionRelayDevice && (
                                <Chip
                                    icon={deviceData.hasCustomFirmware ? <ErrorIcon fontSize="small" /> : <VerifiedIcon fontSize="small" />}
                                    label={deviceData.hasCustomFirmware ? "Custom" : "Authentic"}
                                    size="small"
                                    color={deviceData.hasCustomFirmware ? "warning" : "success"}
                                    variant="outlined"
                                    sx={{ fontSize: '0.7rem', height: 20 }}
                                />
                            )}
                            {initialFirmwareInfo?.is_outdated && (
                                <Chip
                                    label="Update"
                                    size="small"
                                    color="warning"
                                    variant="outlined"
                                    sx={{ fontSize: '0.7rem', height: 20 }}
                                />
                            )}

                            {/* Mobile auto-save status */}
                            {deviceAutoSave.status !== 'idle' && (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1 }}>
                                    {deviceAutoSave.status === 'saving' && <CircularProgress size={8} />}
                                    {deviceAutoSave.status === 'saved' && (
                                        <Typography variant="body2" color="success.main" sx={{ fontSize: '0.6rem' }}>
                                            OK
                                        </Typography>
                                    )}
                                    {deviceAutoSave.status === 'error' && (
                                        <Typography variant="body2" color="error.main" sx={{ fontSize: '0.6rem' }}>
                                            ERR
                                        </Typography>
                                    )}
                                </Box>
                            )}
                        </Box>
                    </Box>

                    {/* Action Buttons Row */}
                    <Box display="flex" gap={1} flexWrap="wrap">
                        {/* Edit Mode Button - Only for non-Custom devices */}
                        {!isCustom && (
                            <Button
                                variant="outlined"
                                startIcon={<EditIcon />}
                                size="small"
                                onClick={handleEnableEditMode}
                                color="warning"
                                sx={{ minWidth: 'auto', fontSize: '0.75rem' }}
                            >
                                Edit
                            </Button>
                        )}

                        {deviceData.type !== "Host Device" && (
                            <>
                                {/* Resync IP button */}
                                <Button
                                    variant="outlined"
                                    startIcon={<SyncIcon />}
                                    size="small"
                                    onClick={handleResyncIP}
                                    sx={{ minWidth: 'auto', fontSize: '0.75rem' }}
                                >
                                    Resync IP
                                </Button>

                                {/* Full Device Sync button */}
                                <Button
                                    variant="contained"
                                    startIcon={<SyncIcon />}
                                    size="small"
                                    onClick={handleDeviceSync}
                                    color="primary"
                                    sx={{ minWidth: 'auto', fontSize: '0.75rem' }}
                                >
                                    Resync Device
                                </Button>
                            </>
                        )}

                        <Button
                            variant="outlined"
                            startIcon={<RefreshIcon />}
                            size="small"
                            onClick={handleRefreshSensors}
                            sx={{ minWidth: 'auto', fontSize: '0.75rem' }}
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
                                sx={{ minWidth: 'auto', fontSize: '0.75rem' }}
                            >
                                Delete
                            </Button>
                        )}
                    </Box>
                </Paper>
            )}

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

            {isMobile ? (
                // Mobile Accordion View - FIXED STYLING
                <Box sx={{
                    mb: 4,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1  // Add gap between accordions like Settings
                }}>
                    {accordionPanels.map((panel) => (
                        <Accordion
                            key={panel.id}
                            expanded={accordionStates[panel.id] || false}
                            onChange={handleAccordionChange(panel.id)}
                            elevation={isMobile ? 1 : 2}  // Match Settings elevation
                            sx={{
                                // Remove individual accordion margins and borders
                                mb: 0,  // Remove margin bottom
                                '&:before': {
                                    display: 'none',  // Remove default MUI before element
                                },
                                '&.Mui-expanded': {
                                    margin: 0,  // Remove expanded margin
                                },
                                // No border radius - let the container handle it
                                borderRadius: 0,
                                overflow: 'visible'  // Don't clip content
                            }}
                        >
                            <AccordionSummary
                                expandIcon={<ExpandMoreIcon />}
                                aria-controls={`${panel.id}-content`}
                                id={`${panel.id}-header`}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    {panel.badge ? (
                                        <Badge badgeContent={panel.badge} color="error" sx={{ mr: 1 }}>
                                            {panel.icon}
                                        </Badge>
                                    ) : (
                                        <Box sx={{ mr: 1 }}>
                                            {panel.icon}
                                        </Box>
                                    )}
                                    <Typography variant="h6">
                                        {panel.title}
                                    </Typography>
                                </Box>
                            </AccordionSummary>
                            <AccordionDetails sx={{
                                px: isMobile ? 1 : 3  // Match Settings padding
                            }}>
                                {panel.content}
                            </AccordionDetails>
                        </Accordion>
                    ))}
                </Box>
            ) : (
                // Desktop Tabs View - UPDATED with new Heartbeat History tab
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
                            icon={<MonitorHeartIcon />}
                            iconPosition="start"
                            label="Heartbeat Config"
                            id="device-tab-1"
                            aria-controls="device-tabpanel-1"
                        />
                        <Tab
                            icon={<History />}
                            iconPosition="start"
                            label="Heartbeat History"
                            id="device-tab-2"
                            aria-controls="device-tabpanel-2"
                        />
                        <Tab
                            icon={<DevicesIcon />}
                            iconPosition="start"
                            label="Screens & I2C"
                            id="device-tab-3"
                            aria-controls="device-tabpanel-3"
                        />
                        <Tab
                            icon={initialFirmwareInfo?.is_outdated ? (
                                <Badge badgeContent={1} color="error">
                                    <UpdateIcon />
                                </Badge>
                            ) : <UpdateIcon />}
                            iconPosition="start"
                            label="Firmware"
                            id="device-tab-4"
                            aria-controls="device-tabpanel-4"
                        />
                        <Tab
                            icon={newSensors.length > 0 ? (
                                <Badge badgeContent={newSensors.length} color="error">
                                    <SensorsIcon />
                                </Badge>
                            ) : <SensorsIcon />}
                            iconPosition="start"
                            label="Sensors"
                            id="device-tab-5"
                            aria-controls="device-tabpanel-5"
                        />
                        <Tab
                            icon={<TuneIcon />}
                            iconPosition="start"
                            label="Preferences"
                            id="device-tab-6"
                            aria-controls="device-tabpanel-6"
                        />
                        <Tab
                            icon={<AnalyticsIcon />}
                            iconPosition="start"
                            label="System Stats"
                            id="device-tab-7"
                            aria-controls="device-tabpanel-7"
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
                            onAutoSave={handleAutoSave}
                            deviceId={id}
                        />
                    </TabPanel>

                    {/* Heartbeat Configuration Tab */}
                    <TabPanel value={tabValue} index={1}>
                        <DeviceHeartbeatPanel
                            deviceData={deviceData}
                            onAutoSave={handleAutoSave}
                        />
                    </TabPanel>

                    {/* NEW: Heartbeat History Tab */}
                    <TabPanel value={tabValue} index={2}>
                        <DeviceHeartbeatHistoryPanel deviceId={id || ""} />
                    </TabPanel>

                    {/* Screens & I2C Bus Tab */}
                    <TabPanel value={tabValue} index={3}>
                        <DeviceScreensPanel
                            deviceId={id || ""}
                            deviceScreens={deviceScreens}
                            setDeviceScreens={setDeviceScreens}
                            i2cDevices={i2cDevices}
                            setI2cDevices={setI2cDevices}
                            layoutTemplates={layoutTemplates}
                            frameTemplates={frameTemplates}
                            isCustom={isCustom}
                            showSnackbar={showSnackbar}
                            onScreenChange={(screens) => {
                                setDeviceScreens(screens);
                                screensAutoSave.markChanged();
                            }}
                        />
                    </TabPanel>

                    {/* Firmware Management Tab */}
                    <TabPanel value={tabValue} index={4}>
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
                    <TabPanel value={tabValue} index={5}>
                        <DeviceSensorsPanel
                            deviceId={id || ""}
                            deviceData={deviceData}
                            newSensors={newSensors}
                            setNewSensors={setNewSensors}
                            showSnackbar={showSnackbar}
                        />
                    </TabPanel>

                    {/* Preferences Tab */}
                    <TabPanel value={tabValue} index={6}>
                        <DevicePreferencesPanel
                            deviceId={id || ""}
                            deviceData={deviceData}
                            showSnackbar={showSnackbar}
                        />
                    </TabPanel>

                    {/* System Stats Tab */}
                    <TabPanel value={tabValue} index={7}>
                        <DeviceSystemStatsPanel
                            deviceId={id || ""}
                            deviceData={deviceData}
                            showSnackbar={showSnackbar}
                        />
                    </TabPanel>
                </Paper>
            )}

            {/* Device Sync Modal */}
            <DeviceSyncModal
                open={syncModalOpen}
                onClose={() => setSyncModalOpen(false)}
                deviceId={id || ""}
                deviceName={deviceData?.name || ""}
                onSuccess={handleSyncSuccess}
                showSnackbar={showSnackbar}
            />

            {/* Edit Mode Modal */}
            <EditModeModal
                open={editModeModalOpen}
                onClose={() => setEditModeModalOpen(false)}
                deviceId={id || ""}
                deviceName={deviceData?.name || ""}
                onSuccess={handleEditModeSuccess}
                showSnackbar={showSnackbar}
            />

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