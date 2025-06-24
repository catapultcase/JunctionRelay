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

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
    Button,
    Typography,
    Box,
    CircularProgress,
    Card,
    CardContent,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Paper,
    Modal,
    Snackbar,
    TextField,
    Divider,
    Alert,
    FormControl,
    InputLabel,
    Select,
    MenuItem
} from "@mui/material";
import { useNavigate } from "react-router-dom";
// Icon imports
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import UpdateIcon from '@mui/icons-material/Update';
import DeviceHubIcon from '@mui/icons-material/DeviceHub';
import DeviceUnknownIcon from '@mui/icons-material/DeviceUnknown';
import EditIcon from '@mui/icons-material/Edit';
import CloudIcon from '@mui/icons-material/Cloud';
import ComputerIcon from '@mui/icons-material/Computer';

// Import our components
import DevicesTable from '../components/Devices_DevicesTable';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { STORAGE_KEY_REFRESH_INTERVAL, getDeviceStatusInfo } from '../components/Devices_Helpers';

// Main Device Component
const Devices: React.FC = () => {
    // Configurable refresh rate (in milliseconds) - 30 seconds default
    const REFRESH_INTERVAL_OPTIONS = [
        { value: 0, label: "Disabled" },
        { value: 10000, label: "10 seconds" },
        { value: 30000, label: "30 seconds" },
        { value: 60000, label: "1 minute" },
        { value: 300000, label: "5 minutes" }
    ];

    const [refreshInterval, setRefreshInterval] = useState<number>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_REFRESH_INTERVAL);
        return stored ? parseInt(stored, 10) : 30000; // Default to 30 seconds
    });
    const [scanning, setScanning] = useState(false);
    const [status, setStatus] = useState("");
    const [devices, setDevices] = useState<any[]>([]);
    const [deviceDetails, setDeviceDetails] = useState<Record<string, any>>({});
    const [buttonColor, setButtonColor] = useState<"primary" | "secondary">("primary");
    const [allDevices, setAllDevices] = useState<any[]>([]);
    const [connectionStatuses, setConnectionStatuses] = useState<Record<number, any>>({});
    const [updateStatuses, setUpdateStatuses] = useState<Record<number, boolean>>({});
    const [updatingDevices, setUpdatingDevices] = useState<Set<number>>(new Set());
    const [addCustomDeviceModalOpen, setAddCustomDeviceModalOpen] = useState(false);
    const [addCloudDeviceModalOpen, setAddCloudDeviceModalOpen] = useState(false);
    const [refreshingCloudDevices, setRefreshingCloudDevices] = useState(false);
    const [selectedDevice, setSelectedDevice] = useState<{ name: string; ipAddress: string } | null>(null);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "info" | "warning" | "error">("success");
    const [resyncingDevices, setResyncingDevices] = useState<{ [macIp: string]: boolean }>({});
    const [resyncedDevices, setResyncedDevices] = useState<Set<string>>(new Set());
    const [loadingDetails, setLoadingDetails] = useState<Set<string>>(new Set());
    const navigate = useNavigate();
    const flags = useFeatureFlags();


    // Save refresh interval to localStorage when it changes
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_REFRESH_INTERVAL, refreshInterval.toString());
    }, [refreshInterval]);

    // Group and sort devices by status for scan results
    const groupedDevices = useMemo(() => {
        if (!devices.length) return { newDevices: [], existingDevices: [], otherDevices: [] };

        return devices.reduce(
            (acc: any, device: any) => {
                if (device.status === "NEW_DEVICE") {
                    acc.newDevices.push(device);
                } else if (device.status === "DEVICE_EXISTS") {
                    acc.existingDevices.push(device);
                } else {
                    acc.otherDevices.push(device);
                }
                return acc;
            },
            { newDevices: [], existingDevices: [], otherDevices: [] }
        );
    }, [devices]);

    // Show snackbar with configurable severity
    const showSnackbar = (message: string, severity: "success" | "info" | "warning" | "error" = "success") => {
        setSnackMessage(message);
        setSnackbarSeverity(severity);
    };

    const startScan = async () => {
        setScanning(true);
        setStatus("Scanning for devices...");
        setButtonColor("secondary");
        try {
            const response = await fetch(`/api/devices/scan`);
            const data = await response.json();
            console.log("Scan results:", data);
            setDevices(data);
            setStatus("Scan completed!");

            // Start fetching additional details for each device
            const promises = data.map(async (device: any) => {
                if (!device.ipAddress) return;

                // Add to loading state
                setLoadingDetails(prev => {
                    const newSet = new Set(prev);
                    newSet.add(device.ipAddress);
                    return newSet;
                });

                try {
                    const infoRes = await fetch(`/api/devices/info?ip=${encodeURIComponent(device.ipAddress)}`);
                    if (infoRes.ok) {
                        const infoJson = await infoRes.json();
                        console.log("Device Info received:", infoJson.deviceInfo);
                        // Store device details by IP address
                        setDeviceDetails(prev => ({
                            ...prev,
                            [device.ipAddress]: infoJson.deviceInfo
                        }));
                    }
                } catch (error) {
                    console.error(`Error fetching details for device at ${device.ipAddress}:`, error);
                } finally {
                    // Remove from loading state
                    setLoadingDetails(prev => {
                        const newSet = new Set(prev);
                        newSet.delete(device.ipAddress);
                        return newSet;
                    });
                }
            });

            // Execute all the fetch requests in parallel
            await Promise.all(promises);

        } catch (error) {
            console.error("Scan error:", error);
            setStatus("Error scanning the network.");
        } finally {
            setScanning(false);
            setButtonColor("primary");
        }
    };

    const handleResync = async (macAddress?: string, newIpAddress?: string) => {
        if (!macAddress || !newIpAddress) {
            showSnackbar("Device MAC address or IP is missing.", "error");
            return;
        }

        // Create a unique key for this device to track resync state
        const deviceKey = `${macAddress}-${newIpAddress}`;

        // Set this specific device as resyncing
        setResyncingDevices(prev => ({
            ...prev,
            [deviceKey]: true
        }));

        try {
            console.log(`Resyncing device with MAC: ${macAddress}, New IP: ${newIpAddress}`);

            const res = await fetch('/api/devices/resync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ macAddress, newIpAddress })
            });

            const result = await res.json();
            console.log("Resync response:", result);

            if (res.ok) {
                showSnackbar(result.message || "Device resynced successfully.", "success");

                // Mark this device as resynced so we can hide the button
                if (macAddress) {
                    setResyncedDevices(prev => {
                        const updated = new Set(prev);
                        updated.add(macAddress);
                        return updated;
                    });
                }

                // Refresh the device lists after a successful resync
                await fetchDevices();
            } else {
                showSnackbar(`Failed to resync device: ${result.message}`, "error");
            }
        } catch (error) {
            console.error("Resync error:", error);
            showSnackbar("Error syncing the device.", "error");
        } finally {
            // Clear resyncing state for this device
            setResyncingDevices(prev => {
                const updated = { ...prev };
                delete updated[deviceKey];
                return updated;
            });
        }
    };

    const checkForUpdates = useCallback(async () => {
        try {
            // Get all JunctionRelay devices from allDevices
            const junctionRelayDevices = allDevices.filter(d =>
                d.isJunctionRelayDevice && !d.isGateway
            );
            if (junctionRelayDevices.length === 0) {
                return;
            }
            console.log("Manual check - Checking updates for", junctionRelayDevices.length, "devices");
            const updates: Record<number, boolean> = {};
            let foundUpdates = 0;
            // Check each device individually using the backend API
            for (const device of junctionRelayDevices) {
                try {
                    const res = await fetch(`/api/ota/check/${device.id}?force=true`);
                    if (res.ok) {
                        const updateInfo = await res.json();
                        const needsUpdate = updateInfo.is_outdated === true;
                        updates[device.id] = needsUpdate;
                        if (needsUpdate) {
                            foundUpdates++;
                            console.log(`Device ${device.name} (${device.id}) needs update: ${updateInfo.current_version} -> ${updateInfo.latest_version}`);
                        }
                    } else {
                        console.log(`Failed to check updates for device ${device.id}: ${res.status}`);
                        updates[device.id] = false;
                    }
                } catch (error) {
                    console.error(`Error checking updates for device ${device.id}:`, error);
                    updates[device.id] = false;
                }
            }
            setUpdateStatuses(updates);
            console.log("Manual check - Update statuses set:", updates);
        } catch (error) {
            console.error("Error checking for updates:", error);
        }
    }, [allDevices]);

    const fetchDevices = useCallback(async (checkUpdates: boolean = false) => {
        try {
            const response = await fetch("/api/devices");
            const data = await response.json();

            // Set all devices
            setAllDevices(data);

            // Fetch connection status for all devices with IP addresses
            const devicesWithIp = data.filter((d: any) => d.ipAddress);

            if (devicesWithIp.length > 0) {
                try {
                    const deviceIds = devicesWithIp.map((d: any) => d.id);
                    const connectionResponse = await fetch('/api/devices/bulk-connection-status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(deviceIds)
                    });

                    if (connectionResponse.ok) {
                        const connectionResult = await connectionResponse.json();
                        setConnectionStatuses(connectionResult.connectionStatuses || {});
                    } else {
                        console.warn('Failed to fetch bulk connection status:', connectionResponse.statusText);
                        setConnectionStatuses({});
                    }
                } catch (error) {
                    console.warn('Error fetching bulk connection status:', error);
                    setConnectionStatuses({});
                }
            }

            // Check for updates if requested
            if (checkUpdates) {
                const jrDevices = data.filter((d: any) =>
                    d.isJunctionRelayDevice && !d.isGateway
                );

                if (jrDevices.length > 0) {
                    console.log("Performing individual firmware checks for", jrDevices.length, "junction relay devices");

                    try {
                        const updates: Record<number, boolean> = {};

                        for (const device of jrDevices) {
                            try {
                                const res = await fetch(`/api/ota/check/${device.id}?force=false`);

                                if (res.ok) {
                                    const updateInfo = await res.json();
                                    const deviceNeedsUpdate = updateInfo.is_outdated === true;
                                    updates[device.id] = deviceNeedsUpdate;

                                    if (deviceNeedsUpdate) {
                                        console.log(`Device ${device.name} (${device.id}) needs firmware update: ${updateInfo.current_version} -> ${updateInfo.latest_version}`);
                                    }
                                } else {
                                    console.log(`No update info available for device ${device.id}`);
                                    updates[device.id] = false;
                                }
                            } catch (err) {
                                console.error(`Failed to check update for device ${device.id}`, err);
                                updates[device.id] = false;
                            }
                        }

                        console.log("Update statuses (from individual checks):", updates);
                        setUpdateStatuses(updates);
                    } catch (error) {
                        console.error("Error in individual firmware checks:", error);
                        const updates: Record<number, boolean> = {};
                        jrDevices.forEach((device: any) => {
                            updates[device.id] = false;
                        });
                        setUpdateStatuses(updates);
                    }
                }
            }
        } catch (err) {
            console.error("Error fetching devices:", err);
        }
    }, []);

    useEffect(() => {
        // Initial load with update check
        fetchDevices(true);

        // Set up automatic refresh only if interval > 0
        // Auto-refresh should NOT check for updates to avoid rate limiting
        if (refreshInterval > 0) {
            const interval = setInterval(() => {
                fetchDevices(false); // Don't check updates on auto-refresh
            }, refreshInterval);

            // Cleanup interval on component unmount
            return () => clearInterval(interval);
        }
    }, [refreshInterval, fetchDevices]);

    const handleCardClick = (device: any) => {
        setSelectedDevice({
            name: device.instance || device.name,
            ipAddress: device.ipAddress
        });
    };

    // Check if a specific device is currently being resynced
    const isResyncing = (macAddress: string, ipAddress: string) => {
        return !!resyncingDevices[`${macAddress}-${ipAddress}`];
    };

    // Handle refresh cloud devices
    const handleRefreshCloudDevices = async () => {
        setRefreshingCloudDevices(true);
        try {
            const response = await fetch('/api/cloud-auth/devices/refresh', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                    // You'll need to pass the cloud auth token here
                    // "Authorization": `Bearer ${cloudToken}`
                }
            });

            if (response.ok) {
                const result = await response.json();
                showSnackbar(`Refreshed ${result.count || 0} cloud devices`, "success");
                await fetchDevices(); // Refresh the local device list
            } else {
                const error = await response.json();
                showSnackbar(`Failed to refresh cloud devices: ${error.message}`, "error");
            }
        } catch (error) {
            console.error("Error refreshing cloud devices:", error);
            showSnackbar("Error refreshing cloud devices", "error");
        } finally {
            setRefreshingCloudDevices(false);
        }
    };

    // Handle device firmware update
    const handleUpdateDevice = async (deviceId: number, e: React.MouseEvent) => {
        e.stopPropagation();

        setUpdatingDevices(prev => new Set(prev).add(deviceId));

        try {
            const deviceInfo = allDevices.find(d => d.id === deviceId);
            if (!deviceInfo) throw new Error("Device not found");
            const ipAddress = deviceInfo.ipAddress;
            if (!ipAddress) throw new Error("Device IP address not found");

            // Step 1: Get the firmware and start the upload
            const firmwareRes = await fetch(`/api/ota/firmware/${deviceId}`);
            if (!firmwareRes.ok) throw new Error(`Failed to get firmware: ${firmwareRes.statusText}`);
            const firmwareBlob = await firmwareRes.blob();

            const formData = new FormData();
            formData.append("file", firmwareBlob, "firmware.bin");

            let uploadSucceeded = false;

            try {
                await fetch(`http://${ipAddress}/api/ota/firmware`, {
                    method: "POST",
                    body: formData
                });
                uploadSucceeded = true;
            } catch (err) {
                console.warn(`[OTA] Expected disconnection during firmware upload to ${ipAddress}`, err);
            }

            if (!uploadSucceeded) {
                // This is *expected* because the device reboots during OTA
                showSnackbar(`Update pushed to ${ipAddress}, waiting for reboot...`, "info");
            } else {
                showSnackbar(`Update started successfully for ${ipAddress}`, "success");
            }

            // Step 2: Call the PollForUpdate method to track the firmware update status
            const pollRes = await fetch(`/api/ota/poll-for-update/${deviceId}`, {
                method: "POST",
            });

            if (pollRes.ok) {
                const pollData = await pollRes.json();
                if (pollData.updated) {
                    showSnackbar(`Device at ${ipAddress} updated to v${pollData.version}`, "success");
                } else {
                    showSnackbar(`Update started, but device has not yet reported v${pollData.version}`, "info");
                }
            } else {
                showSnackbar("Error polling for update.", "error");
            }

            await fetchDevices();
        } catch (error) {
            console.error("Update error:", error);
            showSnackbar(`Error: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
        } finally {
            setUpdatingDevices(prev => {
                const updated = new Set(prev);
                updated.delete(deviceId);
                return updated;
            });
        }
    };

    // Handle device deletion
    const handleDelete = async (e: React.MouseEvent, deviceId: number) => {
        e.stopPropagation(); // Prevent row click event
        if (window.confirm("Are you sure you want to delete this device?")) {
            try {
                const response = await fetch(`/api/devices/${deviceId}`, {
                    method: "DELETE"
                });

                if (response.ok) {
                    showSnackbar("Device deleted successfully", "success");
                    fetchDevices(); // Refresh the list
                } else {
                    throw new Error("Failed to delete device");
                }
            } catch (err: unknown) {
                showSnackbar("Error deleting device", "error");
            }
        }
    };

    // Render a device card with consistent height
    const renderDeviceCard = (device: any, index: number) => {
        const statusInfo = getDeviceStatusInfo(device.status);
        const details = deviceDetails[device.ipAddress] || {};
        const isLoading = loadingDetails.has(device.ipAddress);

        return (
            <Box
                key={index}
                sx={{
                    width: { xs: '100%', sm: '50%', md: '33.33%', lg: '25%' },
                    p: 1
                }}
            >
                <Card
                    sx={{
                        height: 220,
                        display: 'flex',
                        flexDirection: 'column',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease-in-out',
                        '&:hover': {
                            boxShadow: 6,
                            transform: 'translateY(-3px)'
                        }
                    }}
                    onClick={() => handleCardClick(device)}
                >
                    <CardContent sx={{ flexGrow: 1, p: 2, pb: 1 }}>
                        {/* Device Name */}
                        <Typography
                            variant="subtitle1"
                            noWrap
                            sx={{
                                fontWeight: 'medium',
                                width: '100%',
                                mb: 1,
                                lineHeight: 1.3
                            }}
                        >
                            {device.instance}
                        </Typography>

                        <Divider sx={{ mb: 1 }} />

                        {/* Basic Info - More compact */}
                        <Box sx={{ mb: 0.5 }}>
                            <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                <strong>IP:</strong> {device.ipAddress}
                            </Typography>
                            <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                <strong>MAC:</strong> {device.macAddress || "Unknown"}
                            </Typography>

                            {/* Device Model and Manufacturer */}
                            {details && details.deviceManufacturer && (
                                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                    <strong>Mfr:</strong> {details.deviceManufacturer}
                                </Typography>
                            )}
                            {details && details.deviceModel && (
                                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                    <strong>Model:</strong> {details.deviceModel}
                                </Typography>
                            )}
                            {details && details.firmwareVersion && (
                                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                    <strong>Firmware:</strong> {details.firmwareVersion}
                                </Typography>
                            )}
                            {details && details.customFirmware !== undefined && (
                                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                    <strong>Custom:</strong> {details.customFirmware === true ? "Yes" : "No"}
                                </Typography>
                            )}
                        </Box>

                        {/* Device Details or Loading */}
                        {isLoading ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                                <CircularProgress size={12} sx={{ mr: 1 }} />
                                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.75rem' }}>
                                    Loading...
                                </Typography>
                            </Box>
                        ) : null}
                    </CardContent>

                    <Box sx={{
                        p: 1.5,
                        pt: 0,
                        mt: 'auto',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        alignItems: 'center'
                    }}>
                        {/* Badge for device status */}
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            {device.needsResync && !resyncedDevices.has(device.macAddress) ? (
                                <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={<RefreshIcon />}
                                    onClick={e => {
                                        e.stopPropagation();
                                        handleResync(device.macAddress, device.ipAddress);
                                    }}
                                    disabled={isResyncing(device.macAddress, device.ipAddress)}
                                    sx={{
                                        fontSize: '0.75rem',
                                        py: 0.5,
                                        minWidth: '70px'
                                    }}
                                >
                                    {isResyncing(device.macAddress, device.ipAddress) ? (
                                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                            <CircularProgress size={12} sx={{ mr: 1 }} />
                                            Sync
                                        </Box>
                                    ) : (
                                        "Resync"
                                    )}
                                </Button>
                            ) : device.needsResync && resyncedDevices.has(device.macAddress) ? (
                                <Chip
                                    label="Resynced"
                                    color="success"
                                    size="small"
                                    sx={{ fontSize: '0.7rem', height: 22 }}
                                />
                            ) : null}

                            <Chip
                                label={statusInfo.label}
                                color={statusInfo.color}
                                size="small"
                                sx={{
                                    fontWeight: 'medium',
                                    fontSize: '0.7rem',
                                    height: 22
                                }}
                            />
                        </Box>
                    </Box>
                </Card>
            </Box>
        );
    };

    return (
        <Box sx={{ padding: 2 }}>
            <Typography variant="h5" gutterBottom>Devices</Typography>

            {/* Action Buttons - Network Scan Section */}
            <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: 'wrap' }}>
                <Button
                    variant="contained"
                    color={buttonColor}
                    onClick={startScan}
                    disabled={scanning}
                    startIcon={<DeviceHubIcon />}
                    size="small"
                >
                    {scanning ? "Scanning..." : "Scan Network"}
                </Button>
            </Box>

            {/* Scan Status */}
            {(scanning || status) && (
                <Paper sx={{ mb: 3, p: 2, borderRadius: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                    {scanning && <CircularProgress size={24} />}
                    <Typography variant="h6" sx={{ m: 0 }}>{status}</Typography>
                </Paper>
            )}

            {/* Scan Results Display */}
            {devices.length > 0 && (
                <Box sx={{ mb: 4 }}>
                    {/* Display New Devices Section */}
                    {groupedDevices.newDevices.length > 0 && (
                        <>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                <DeviceHubIcon color="success" />
                                <Typography variant="h6">New Devices</Typography>
                                <Chip
                                    label={groupedDevices.newDevices.length}
                                    color="success"
                                    size="small"
                                    sx={{ ml: 1 }}
                                />
                            </Box>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', mx: -1 }}>
                                {groupedDevices.newDevices.map(renderDeviceCard)}
                            </Box>
                        </>
                    )}

                    {/* Display Existing Devices Section */}
                    {groupedDevices.existingDevices.length > 0 && (
                        <>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 4, mb: 2 }}>
                                <DeviceHubIcon color="info" />
                                <Typography variant="h6">Existing Devices</Typography>
                                <Chip
                                    label={groupedDevices.existingDevices.length}
                                    color="info"
                                    size="small"
                                    sx={{ ml: 1 }}
                                />
                            </Box>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', mx: -1 }}>
                                {groupedDevices.existingDevices.map(renderDeviceCard)}
                            </Box>
                        </>
                    )}

                    {/* Display Other Devices Section */}
                    {groupedDevices.otherDevices.length > 0 && (
                        <>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 4, mb: 2 }}>
                                <DeviceUnknownIcon color="warning" />
                                <Typography variant="h6">Other Devices</Typography>
                                <Chip
                                    label={groupedDevices.otherDevices.length}
                                    color="warning"
                                    size="small"
                                    sx={{ ml: 1 }}
                                />
                            </Box>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', mx: -1 }}>
                                {groupedDevices.otherDevices.map(renderDeviceCard)}
                            </Box>
                        </>
                    )}
                </Box>
            )}

            {/* No Devices Message */}
            {devices.length === 0 && !scanning && (
                <Paper sx={{ p: 3, textAlign: 'center', mb: 4 }}>
                    <Typography variant="h6" color="textSecondary">No devices found</Typography>
                    <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                        Click "Scan Network" to discover devices on your network
                    </Typography>
                </Paper>
            )}

            {/* Device Management Section - Above the table */}
            <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
                <Typography variant="h6">Device Management</Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: 'wrap' }}>
                <Button
                    variant="contained"
                    color="primary"
                    onClick={() => setAddCustomDeviceModalOpen(true)}
                    startIcon={<ComputerIcon />}
                    size="small"
                >
                    Add Custom Local Device
                </Button>

                <Button
                    variant="outlined"
                    startIcon={<UpdateIcon />}
                    onClick={checkForUpdates}
                    size="small"
                >
                    Check for Firmware Updates
                </Button>

                <Button
                    variant="contained"
                    color="primary"
                    onClick={() => setAddCloudDeviceModalOpen(true)}
                    startIcon={<CloudIcon />}
                    size="small"
                >
                    Add Cloud Device
                </Button>

                <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleRefreshCloudDevices}
                    disabled={refreshingCloudDevices}
                    startIcon={refreshingCloudDevices ? <CircularProgress size={16} /> : <RefreshIcon />}
                    size="small"
                >
                    {refreshingCloudDevices ? "Refreshing..." : "Refresh Cloud Devices"}
                </Button>
            </Box>

            {/* Conditional Device Tables based on feature flag */}
            {String(flags?.combine_cloud_devices).toLowerCase() === 'true' ? (
                // Single unified table when flag is true
                <DevicesTable
                    devices={allDevices}
                    title="All Devices"
                    updateStatuses={updateStatuses}
                    updatingDevices={updatingDevices}
                    connectionStatuses={connectionStatuses}
                    onDelete={handleDelete}
                    onUpdate={handleUpdateDevice}
                    navigate={navigate}
                    storageKeySuffix="_unified"
                    onDevicesChange={() => fetchDevices(false)}
                    refreshInterval={refreshInterval}
                    onRefreshIntervalChange={setRefreshInterval}
                    refreshIntervalOptions={REFRESH_INTERVAL_OPTIONS}
                />
            ) : (
                // Separate tables when flag is false
                <>
                    <DevicesTable
                        devices={allDevices.filter(device => device.type !== "Cloud Device")}
                        title="Local Devices"
                        updateStatuses={updateStatuses}
                        updatingDevices={updatingDevices}
                        connectionStatuses={connectionStatuses}
                        onDelete={handleDelete}
                        onUpdate={handleUpdateDevice}
                        navigate={navigate}
                        storageKeySuffix="_local"
                        onDevicesChange={() => fetchDevices(false)}
                        refreshInterval={refreshInterval}
                        onRefreshIntervalChange={setRefreshInterval}
                        refreshIntervalOptions={REFRESH_INTERVAL_OPTIONS}
                    />

                    <DevicesTable
                        devices={allDevices.filter(device => device.type === "Cloud Device")}
                        title="Cloud Devices"
                        updateStatuses={updateStatuses}
                        updatingDevices={updatingDevices}
                        connectionStatuses={connectionStatuses}
                        onDelete={handleDelete}
                        onUpdate={handleUpdateDevice}
                        navigate={navigate}
                        storageKeySuffix="_cloud"
                        onDevicesChange={() => fetchDevices(false)}
                    // Cloud devices don't need auto-refresh controls
                    />
                </>
            )}

            {/* Snackbar and Modals */}
            <Snackbar
                open={Boolean(snackMessage)}
                autoHideDuration={6000}
                onClose={() => setSnackMessage(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setSnackMessage(null)}
                    severity={snackbarSeverity}
                    sx={{ width: "100%" }}
                >
                    {snackMessage}
                </Alert>
            </Snackbar>

            <AddDeviceModal
                open={!!selectedDevice}
                onClose={() => setSelectedDevice(null)}
                deviceIp={selectedDevice?.ipAddress || ""}
                instance={selectedDevice?.name || ""}
                onDeviceAdded={fetchDevices}
            />

            <AddCustomDeviceModal
                open={addCustomDeviceModalOpen}
                onClose={() => setAddCustomDeviceModalOpen(false)}
                onDeviceAdded={fetchDevices}
            />

            <AddCloudDeviceModal
                open={addCloudDeviceModalOpen}
                onClose={() => setAddCloudDeviceModalOpen(false)}
                onDeviceAdded={fetchDevices}
            />
        </Box>
    );
};

// AddDevice Modal Component
const AddDeviceModal: React.FC<{
    open: boolean;
    onClose: () => void;
    deviceIp: string;
    instance: string;
    onDeviceAdded: () => void;
}> = ({ open, onClose, deviceIp, instance, onDeviceAdded }) => {
    const [loading, setLoading] = useState<boolean>(true);
    const [deviceInfo, setDeviceInfo] = useState<any>(null);
    const [capabilities, setCapabilities] = useState<any>(null);
    const [error, setError] = useState<string>("");
    const [configureAfterAdd, setConfigureAfterAdd] = useState<boolean>(false);

    useEffect(() => {
        const fetchInfoAndCapabilities = async () => {
            try {
                if (!deviceIp) throw new Error("Device IP not provided.");
                const [infoRes, capRes] = await Promise.all([
                    fetch(`/api/devices/info?ip=${encodeURIComponent(deviceIp)}`),
                    fetch(`/api/devices/capabilities?ip=${encodeURIComponent(deviceIp)}`)
                ]);
                if (!infoRes.ok || !capRes.ok) throw new Error("Failed to fetch device info or capabilities");

                const infoJson = await infoRes.json();
                const capJson = await capRes.json();
                setDeviceInfo(infoJson.deviceInfo);
                setCapabilities(capJson.capabilities);
            } catch (err: any) {
                console.error("Error:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        if (deviceIp) fetchInfoAndCapabilities();
    }, [deviceIp]);

    const handleAdd = async (redirectToConfigure: boolean) => {
        setConfigureAfterAdd(redirectToConfigure);
        setLoading(true);

        try {
            const response = await fetch(
                `/api/devices/add-from-ip?ip=${encodeURIComponent(deviceIp!)}&instance=${encodeURIComponent(instance || "")}`,
                { method: "POST" }
            );
            const result = await response.json();
            if (!response.ok) throw new Error("Error adding device");

            const newId = result.id || result.Id;
            onDeviceAdded();
            if (redirectToConfigure) window.location.href = `/configure-device/${newId}`;
            else window.location.href = "/devices";
        } catch (err: any) {
            console.error("Add device failed:", err);
            setError("Error adding device. Please try again.");
            setLoading(false);
        }
    };

    const renderObjectFields = (obj: any) =>
        Object.entries(obj).map(([key, value]) => (
            <TableRow key={key}>
                <TableCell>{key}</TableCell>
                <TableCell>
                    {value === null || value === undefined
                        ? "—"  // Em dash for null or undefined values
                        : typeof value === 'boolean'
                            ? (value ? "Yes" : "No")
                            : typeof value === 'string' || typeof value === 'number'
                                ? value
                                : String(value) // Convert any other type directly to string
                    }
                </TableCell>
            </TableRow>
        ));

    return (
        <Modal open={open} onClose={onClose}>
            <Box
                sx={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: "80%",
                    maxWidth: 1000,
                    bgcolor: "background.paper",
                    p: 4,
                    boxShadow: 24,
                    borderRadius: 2,
                    maxHeight: "80vh",
                    overflow: "auto"
                }}
            >
                <Typography variant="h6" gutterBottom>
                    Add Device: {instance}
                </Typography>
                {loading ? (
                    <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                        <CircularProgress size={24} />
                    </Box>
                ) : error ? (
                    <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
                ) : (
                    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                        <Card sx={{ flex: 1, minWidth: "45%", maxHeight: 400, overflow: "auto" }}>
                            <CardContent>
                                <Typography variant="h6">Device Info:</Typography>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Field</TableCell>
                                            <TableCell>Value</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>{deviceInfo && renderObjectFields(deviceInfo)}</TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                        <Card sx={{ flex: 1, minWidth: "45%", maxHeight: 400, overflow: "auto" }}>
                            <CardContent>
                                <Typography variant="h6">Device Capabilities:</Typography>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Capability</TableCell>
                                            <TableCell>Enabled</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>{capabilities && renderObjectFields(capabilities)}</TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </Box>
                )}
                <Box sx={{ display: "flex", gap: 2, mt: 2 }}>
                    <Button
                        variant="contained"
                        onClick={() => handleAdd(false)}
                        startIcon={<AddIcon />}
                        size="small"
                        disabled={loading}
                    >
                        {loading && !configureAfterAdd ? "Adding..." : "Add Device"}
                    </Button>
                    <Button
                        variant="contained"
                        color="secondary"
                        onClick={() => handleAdd(true)}
                        startIcon={<EditIcon />}
                        size="small"
                        disabled={loading}
                    >
                        {loading && configureAfterAdd ? "Adding..." : "Add & Configure"}
                    </Button>
                    <Button
                        variant="outlined"
                        onClick={onClose}
                        size="small"
                        disabled={loading}
                    >
                        Cancel
                    </Button>
                </Box>
            </Box>
        </Modal>
    );
};

// Add Custom Device Modal Component
const AddCustomDeviceModal: React.FC<{
    open: boolean;
    onClose: () => void;
    onDeviceAdded: () => void;
}> = ({ open, onClose, onDeviceAdded }) => {
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        ipAddress: "",
        uniqueIdentifier: ""
    });
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [configureAfterAdd, setConfigureAfterAdd] = useState<boolean>(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (redirectToConfigure: boolean) => {
        const { name, description, ipAddress, uniqueIdentifier } = formData;
        if (!name || !description || !ipAddress || !uniqueIdentifier) {
            setError("All fields are required.");
            return;
        }

        try {
            setLoading(true);
            setConfigureAfterAdd(redirectToConfigure);

            const payload = {
                name,
                description,
                uniqueIdentifier,
                ipAddress,
                type: "Custom",
                status: "Active"
            };

            const response = await fetch("/api/devices", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message || "Failed to add device");

            onDeviceAdded();
            onClose();

            if (redirectToConfigure) {
                const newId = result.id || result.Id;
                window.location.href = `/configure-device/${newId}`;
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose}>
            <Box
                sx={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: '80%',
                    maxWidth: 500,
                    bgcolor: "background.paper",
                    p: 4,
                    boxShadow: 24,
                    borderRadius: 2
                }}
            >
                <Typography variant="h6" gutterBottom>
                    Add Custom Local Device
                </Typography>

                {error && (
                    <Alert
                        severity="error"
                        sx={{
                            mb: 2,
                            '& .MuiAlert-message': {
                                fontWeight: 'medium'
                            }
                        }}
                    >
                        {error}
                    </Alert>
                )}

                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <TextField
                        fullWidth
                        label="Name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        size="small"
                        required
                    />
                    <TextField
                        fullWidth
                        label="Description"
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        size="small"
                        required
                    />
                    <TextField
                        fullWidth
                        label="IP Address"
                        name="ipAddress"
                        value={formData.ipAddress}
                        onChange={handleChange}
                        size="small"
                        required
                    />
                    <TextField
                        fullWidth
                        label="Unique Identifier"
                        name="uniqueIdentifier"
                        value={formData.uniqueIdentifier}
                        onChange={handleChange}
                        size="small"
                        required
                    />
                </Box>

                <Box sx={{ display: "flex", gap: 2, mt: 2 }}>
                    <Button
                        variant="contained"
                        onClick={() => handleSubmit(false)}
                        disabled={loading}
                        startIcon={<ComputerIcon />}
                        size="small"
                    >
                        {loading && !configureAfterAdd ? "Adding..." : "Add Device"}
                    </Button>
                    <Button
                        variant="contained"
                        color="secondary"
                        onClick={() => handleSubmit(true)}
                        disabled={loading}
                        startIcon={<EditIcon />}
                        size="small"
                    >
                        {loading && configureAfterAdd ? "Adding..." : "Add & Configure"}
                    </Button>
                    <Button
                        variant="outlined"
                        onClick={onClose}
                        size="small"
                        disabled={loading}
                    >
                        Cancel
                    </Button>
                </Box>
            </Box>
        </Modal>
    );
};

// Add Cloud Device Modal Component
const AddCloudDeviceModal: React.FC<{
    open: boolean;
    onClose: () => void;
    onDeviceAdded: () => void;
}> = ({ open, onClose, onDeviceAdded }) => {
    const [formData, setFormData] = useState({
        deviceName: "",
        deviceId: ""
    });
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async () => {
        const { deviceName, deviceId } = formData;
        if (!deviceName || !deviceId) {
            setError("All fields are required.");
            return;
        }

        try {
            setLoading(true);

            // This would call your cloud device registration API
            const response = await fetch("/api/cloud-auth/devices/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    // You'll need to pass the cloud auth token here
                    // "Authorization": `Bearer ${cloudToken}`
                },
                body: JSON.stringify({
                    deviceId,
                    deviceName
                }),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message || "Failed to register cloud device");

            onDeviceAdded();
            onClose();

            // Reset form
            setFormData({ deviceName: "", deviceId: "" });
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose}>
            <Box
                sx={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: '80%',
                    maxWidth: 500,
                    bgcolor: "background.paper",
                    p: 4,
                    boxShadow: 24,
                    borderRadius: 2
                }}
            >
                <Typography variant="h6" gutterBottom>
                    Add Cloud Device
                </Typography>

                {error && (
                    <Alert
                        severity="error"
                        sx={{
                            mb: 2,
                            '& .MuiAlert-message': {
                                fontWeight: 'medium'
                            }
                        }}
                    >
                        {error}
                    </Alert>
                )}

                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                    Register a new device to your JunctionRelay Cloud account.
                </Typography>

                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <TextField
                        fullWidth
                        label="Device Name"
                        name="deviceName"
                        value={formData.deviceName}
                        onChange={handleChange}
                        size="small"
                        required
                        helperText="A friendly name for your device"
                    />
                    <TextField
                        fullWidth
                        label="Device ID"
                        name="deviceId"
                        value={formData.deviceId}
                        onChange={handleChange}
                        size="small"
                        required
                        helperText="Unique identifier for your device (e.g., serial number)"
                    />
                </Box>

                <Box sx={{ display: "flex", gap: 2, mt: 3 }}>
                    <Button
                        variant="contained"
                        onClick={handleSubmit}
                        disabled={loading}
                        startIcon={<CloudIcon />}
                        size="small"
                    >
                        {loading ? "Registering..." : "Register Device"}
                    </Button>
                    <Button
                        variant="outlined"
                        onClick={onClose}
                        size="small"
                        disabled={loading}
                    >
                        Cancel
                    </Button>
                </Box>
            </Box>
        </Modal>
    );
};

export default Devices;