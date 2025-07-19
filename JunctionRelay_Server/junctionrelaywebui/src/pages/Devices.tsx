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
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Paper,
    Modal,
    Snackbar,
    TextField,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions} from "@mui/material";
import { useNavigate } from "react-router-dom";
// Icon imports
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import UpdateIcon from '@mui/icons-material/Update';
import DeviceHubIcon from '@mui/icons-material/DeviceHub';
import EditIcon from '@mui/icons-material/Edit';
import CloudIcon from '@mui/icons-material/Cloud';
import ComputerIcon from '@mui/icons-material/Computer';
import SearchIcon from '@mui/icons-material/Search';
import MemoryIcon from '@mui/icons-material/Memory';
import { useTheme, useMediaQuery } from "@mui/material";

// Import our components
import DevicesTable from '../components/Devices_DevicesTable';
import DeviceRegistrationModal from '../components/DeviceRegistrationModal';
import PendingDevicesSection from '../components/PendingDevicesSection';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import HeartbeatProtocolSelector from '../components/HeartbeatProtocolSelector';
import { HeartbeatProtocol } from '../components/HeartbeatProtocolSelector';

import {
    STORAGE_KEY_REFRESH_INTERVAL,
    STORAGE_KEY_CLOUD_REFRESH_INTERVAL} from '../components/Devices_Helpers';

// Storage keys for scan view modes
const STORAGE_KEY_SCAN_NEW_VIEW_MODE = "junctionrelay_scan_new_view_mode";
const STORAGE_KEY_SCAN_EXISTING_VIEW_MODE = "junctionrelay_scan_existing_view_mode";

// Scan type enum
type ScanType = 'junctionrelay' | 'full';

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

    const CLOUD_REFRESH_INTERVAL_OPTIONS = [
        { value: 0, label: "Disabled" },
        { value: 60000, label: "1 minute" },
        { value: 300000, label: "5 minutes" },
        { value: 900000, label: "15 minutes" },
        { value: 1800000, label: "30 minutes" }
    ];

    const [refreshInterval, setRefreshInterval] = useState<number>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_REFRESH_INTERVAL);
        return stored ? parseInt(stored, 10) : 30000; // Default to 30 seconds
    });

    const [cloudRefreshInterval, setCloudRefreshInterval] = useState<number>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_CLOUD_REFRESH_INTERVAL);
        return stored ? parseInt(stored, 10) : 0; // Default to disabled
    });

    const [scanning, setScanning] = useState(false);
    const [hasScanned, setHasScanned] = useState(false);
    const [status, setStatus] = useState("");
    const [scanResults, setScanResults] = useState<any[]>([]);
    const [scanType, setScanType] = useState<ScanType>('junctionrelay');

    // Separate view modes for scan results
    const [scanNewViewMode, setScanNewViewMode] = useState<string>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_SCAN_NEW_VIEW_MODE);
        if (stored) return stored;
        // Default to user's current local device view mode
        const localViewMode = localStorage.getItem('junctionrelay_devices_view_mode_local');
        return localViewMode || 'table';
    });

    const [scanExistingViewMode, setScanExistingViewMode] = useState<string>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_SCAN_EXISTING_VIEW_MODE);
        if (stored) return stored;
        // Default to user's current local device view mode
        const localViewMode = localStorage.getItem('junctionrelay_devices_view_mode_local');
        return localViewMode || 'table';
    });

    const [scanViewModeNotice, setScanViewModeNotice] = useState<string | null>(null);
    const [deviceDetails, setDeviceDetails] = useState<Record<string, any>>({});
    const [buttonColor, setButtonColor] = useState<"primary" | "secondary">("primary");
    const [allDevices, setAllDevices] = useState<any[]>([]);
    const [updateStatuses, setUpdateStatuses] = useState<Record<number, boolean>>({});
    const [updatingDevices, setUpdatingDevices] = useState<Set<number>>(new Set());
    const [addCustomDeviceModalOpen, setAddCustomDeviceModalOpen] = useState(false);
    const [addCloudDeviceModalOpen, setAddCloudDeviceModalOpen] = useState(false);
    const [refreshingCloudDevices, setRefreshingCloudDevices] = useState(false);
    const [selectedDevice, setSelectedDevice] = useState<{ name: string; ipAddress: string } | null>(null);
    const [selectedCustomDevice, setSelectedCustomDevice] = useState<{ name: string; ipAddress: string; macAddress?: string } | null>(null);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "info" | "warning" | "error">("success");
    const [resyncingDevices, setResyncingDevices] = useState<{ [macIp: string]: boolean }>({});
    const [resyncedDevices, setResyncedDevices] = useState<Set<string>>(new Set());
    const [loadingDetails, setLoadingDetails] = useState<Set<string>>(new Set());

    // Scan modal state
    const [scanModalOpen, setScanModalOpen] = useState(false);

    const navigate = useNavigate();
    const flags = useFeatureFlags();

    // ADD MOBILE DETECTION HERE:
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Check if we're in unified mode
    const isUnifiedMode = String(flags?.device_combine_cloud_devices).toLowerCase() === 'true';

    // Save refresh interval to localStorage when it changes
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_REFRESH_INTERVAL, refreshInterval.toString());
    }, [refreshInterval]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_CLOUD_REFRESH_INTERVAL, cloudRefreshInterval.toString());
    }, [cloudRefreshInterval]);

    // Save scan view modes to localStorage when they change
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_SCAN_NEW_VIEW_MODE, scanNewViewMode);
    }, [scanNewViewMode]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_SCAN_EXISTING_VIEW_MODE, scanExistingViewMode);
    }, [scanExistingViewMode]);

    useEffect(() => {
        const handleAddDevice = () => {
            console.log('Bottom bar: Add custom local device requested');
            setAddCustomDeviceModalOpen(true);
        };

        const handleAddCloudDevice = () => {
            console.log('Bottom bar: Add cloud device requested');
            setAddCloudDeviceModalOpen(true);
        };

        const handleRefresh = () => {
            console.log('Bottom bar: Refresh requested');
            // Manual refresh should include cloud sync
            fetchDevices(false, true);
        };

        const handleSearch = () => {
            console.log('Bottom bar: Search requested');
            // Show scan modal on mobile
            setScanModalOpen(true);
        };

        const handleViewModeChange = (event: CustomEvent) => {
            const newMode = event.detail.mode;
            console.log('Bottom bar: View mode change requested:', newMode);
            // This will update the DevicesTable view mode through localStorage
            // The DevicesTable component will pick up the change automatically
        };

        const handleScanDeviceSelected = (event: CustomEvent) => {
            const device = event.detail.device;
            handleCardClick(device);
        };

        // Add event listeners for bottom action bar
        window.addEventListener('bottom-action-add-device', handleAddDevice);
        window.addEventListener('bottom-action-add-cloud-device', handleAddCloudDevice);
        window.addEventListener('bottom-action-refresh', handleRefresh);
        window.addEventListener('bottom-action-search', handleSearch);
        window.addEventListener('bottom-action-view-mode-change', handleViewModeChange as EventListener);
        window.addEventListener('scan-device-selected', handleScanDeviceSelected as EventListener);

        // Cleanup
        return () => {
            window.removeEventListener('bottom-action-add-device', handleAddDevice);
            window.removeEventListener('bottom-action-add-cloud-device', handleAddCloudDevice);
            window.removeEventListener('bottom-action-refresh', handleRefresh);
            window.removeEventListener('bottom-action-search', handleSearch);
            window.removeEventListener('bottom-action-view-mode-change', handleViewModeChange as EventListener);
            window.removeEventListener('scan-device-selected', handleScanDeviceSelected as EventListener);
        };
    }, [isUnifiedMode]);

    // Group scan results by status
    const groupedScanResults = useMemo(() => {
        if (!scanResults.length) return { newDevices: [], existingDevices: [] };

        return scanResults.reduce(
            (acc: any, device: any) => {
                // Handle both uppercase (streaming scan) and lowercase (regular scan) property names
                const status = device.Status || device.status;

                if (status === "NEW_DEVICE" || status === "IP_IN_USE") {
                    acc.newDevices.push(device);
                } else if (status === "DEVICE_EXISTS" || status === "NEEDS_RESYNC") {
                    acc.existingDevices.push(device);
                }
                return acc;
            },
            { newDevices: [], existingDevices: [] }
        );
    }, [scanResults]);

    // Show snackbar with configurable severity
    const showSnackbar = (message: string, severity: "success" | "info" | "warning" | "error" = "success") => {
        setSnackMessage(message);
        setSnackbarSeverity(severity);
    };


    const startScan = async (type: ScanType = 'junctionrelay') => {
        console.log(`[FRONTEND] Starting ${type} scan`);
        setScanning(true);
        setHasScanned(true);
        setScanResults([]); // Clear previous results
        setResyncedDevices(new Set()); // Clear resync tracking
        setScanType(type);

        // Handle view mode for different scan types
        if (type === 'full') {
            // Full scan always opens as table view
            setScanNewViewMode('table');
            setScanExistingViewMode('table');
            setScanViewModeNotice('Switched to table view due to large result set');
            setTimeout(() => setScanViewModeNotice(null), 5000);
        } else {
            // JunctionRelay scan uses stored preferences or defaults to local device table view mode
            const currentLocalViewMode = localStorage.getItem('junctionrelay_devices_view_mode_local') || 'table';

            const storedNewViewMode = localStorage.getItem(STORAGE_KEY_SCAN_NEW_VIEW_MODE);
            const storedExistingViewMode = localStorage.getItem(STORAGE_KEY_SCAN_EXISTING_VIEW_MODE);

            setScanNewViewMode(storedNewViewMode || currentLocalViewMode);
            setScanExistingViewMode(storedExistingViewMode || currentLocalViewMode);
            setScanViewModeNotice(null);
        }

        setStatus(type === 'full' ? "Scanning all network devices..." : "Scanning for JunctionRelay devices...");
        setButtonColor("secondary");

        try {
            if (type === 'full') {
                console.log('[FRONTEND] Starting SSE connection to /api/devices/scan/stream');

                // Use Server-Sent Events for full scan
                const eventSource = new EventSource('/api/devices/scan/stream');
                let deviceCount = 0;

                eventSource.onopen = () => {
                    console.log('[FRONTEND] SSE connection opened');
                };

                eventSource.onmessage = (event: MessageEvent) => {
                    console.log('[FRONTEND] Received SSE message:', event.data);

                    try {
                        const data = JSON.parse(event.data);
                        console.log('[FRONTEND] Parsed SSE data:', data);

                        // Check if this is a device (has IpAddress) or a status message
                        if (data.IpAddress) {
                            console.log(`[FRONTEND] Adding device: ${data.IpAddress}`);
                            setScanResults(prev => {
                                const updated = [...prev, data];
                                console.log(`[FRONTEND] Total devices now: ${updated.length}`);
                                return updated;
                            });
                            deviceCount++;

                            // Start fetching device details - use capital I
                            fetchDeviceDetails(data.IpAddress);
                        } else if (data.status) {
                            console.log('[FRONTEND] Status message:', data);
                            if (data.message) {
                                setStatus(data.message);
                            }
                        }
                    } catch (parseError) {
                        console.error('[FRONTEND] Error parsing SSE data:', parseError);
                        console.error('[FRONTEND] Raw data:', event.data);
                    }
                };

                eventSource.addEventListener('complete', (event: MessageEvent) => {
                    console.log('[FRONTEND] Scan complete event received:', event.data);

                    try {
                        const completionData = JSON.parse(event.data);
                        setStatus(completionData.message || `Scan completed! Found ${deviceCount} devices.`);
                    } catch (parseError) {
                        setStatus(`Scan completed! Found ${deviceCount} devices.`);
                    }

                    setScanning(false);
                    setButtonColor("primary");
                    eventSource.close();
                    console.log('[FRONTEND] SSE connection closed after completion');
                });

                eventSource.addEventListener('error', (event: MessageEvent) => {
                    console.error("[FRONTEND] SSE error event:", event);
                    console.error("[FRONTEND] EventSource readyState:", eventSource.readyState);

                    // Error events from addEventListener do have data
                    if (event.data) {
                        try {
                            const errorData = JSON.parse(event.data);
                            setStatus(`Error: ${errorData.error || 'Unknown error during scan'}`);
                        } catch (parseError) {
                            setStatus("Error scanning the network.");
                        }
                    } else {
                        setStatus("Error scanning the network.");
                    }

                    setScanning(false);
                    setButtonColor("primary");
                    eventSource.close();
                    console.log('[FRONTEND] SSE connection closed after error');
                });

                eventSource.onerror = (event: Event) => {
                    console.error("[FRONTEND] SSE onerror:", event);
                    console.error("[FRONTEND] EventSource readyState:", eventSource.readyState);

                    if (eventSource.readyState === EventSource.CLOSED) {
                        console.log('[FRONTEND] SSE connection was closed');
                        setStatus("Connection to server was lost during scan.");
                        setScanning(false);
                        setButtonColor("primary");
                    } else if (eventSource.readyState === EventSource.CONNECTING) {
                        console.log('[FRONTEND] SSE is reconnecting...');
                        setStatus("Reconnecting to server...");
                    }
                };

            } else {
                // Use original method for JunctionRelay scan
                console.log('[FRONTEND] Starting regular fetch for JunctionRelay scan');
                const response = await fetch('/api/devices/scan');
                const data = await response.json();
                console.log("JunctionRelay scan results:", data);
                setScanResults(data);
                setStatus(`Scan completed! Found ${data.length} devices.`);

                // Start fetching additional details for each device
                const promises = data.map(async (device: any) => {
                    if (device.ipAddress) {
                        await fetchDeviceDetails(device.ipAddress);
                    }
                });
                await Promise.all(promises);

                setScanning(false);
                setButtonColor("primary");
            }
        } catch (error) {
            console.error("Scan error:", error);
            setStatus("Error scanning the network.");
            setScanning(false);
            setButtonColor("primary");
        }
    };

    const fetchDeviceDetails = async (ipAddress: string) => {
        setLoadingDetails(prev => {
            const newSet = new Set(prev);
            newSet.add(ipAddress);
            return newSet;
        });

        try {
            const infoRes = await fetch(`/api/devices/info?ip=${encodeURIComponent(ipAddress)}`);
            if (infoRes.ok) {
                const infoJson = await infoRes.json();
                setDeviceDetails(prev => ({
                    ...prev,
                    [ipAddress]: infoJson.deviceInfo
                }));
            }
        } catch (error) {
            console.error(`Error fetching details for device at ${ipAddress}:`, error);
        } finally {
            setLoadingDetails(prev => {
                const newSet = new Set(prev);
                newSet.delete(ipAddress);
                return newSet;
            });
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

    // Check if a specific device is currently being resynced
    const isResyncing = (macAddress: string, ipAddress: string) => {
        return !!resyncingDevices[`${macAddress}-${ipAddress}`];
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

    const fetchDevices = useCallback(async (checkUpdates: boolean = false, forceCloudSync: boolean = false) => {
        try {
            const skipCloudSync = !forceCloudSync;
            const response = await fetch(`/api/devices?skipCloudSync=${skipCloudSync}`);
            const data = await response.json();

            // Set all devices
            setAllDevices(data);

            // Check for updates if requested
            if (checkUpdates) {
                const jrDevices = data.filter((d: any) =>
                    d.isJunctionRelayDevice && !d.isGateway
                );

                if (jrDevices.length > 0) {
                    console.log("Performing individual firmware checks for", jrDevices.length, "junctionrelay devices");

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
        // Initial load with update check AND cloud sync
        fetchDevices(true, true);

        // Set up automatic refresh for local devices only if interval > 0
        let localInterval: NodeJS.Timeout | undefined;
        if (refreshInterval > 0) {
            localInterval = setInterval(() => {
                fetchDevices(false, false); // Don't check updates, don't sync cloud
            }, refreshInterval);
        }

        // Set up automatic refresh for cloud devices only if interval > 0
        let cloudInterval: NodeJS.Timeout | undefined;
        if (cloudRefreshInterval > 0) {
            cloudInterval = setInterval(() => {
                handleRefreshCloudDevices(); // Refresh cloud devices specifically
            }, cloudRefreshInterval);
        }

        // Cleanup intervals on component unmount or dependency change
        return () => {
            if (localInterval) clearInterval(localInterval);
            if (cloudInterval) clearInterval(cloudInterval);
        };
    }, [refreshInterval, cloudRefreshInterval, fetchDevices]);

    // Determine if device should open regular modal vs custom modal based on firmware
    const isJunctionRelayDevice = (device: any) => {
        const ip = device.ipAddress || device.IpAddress;
        const details = deviceDetails[ip] || {};

        // If we have firmware info and it contains "JunctionRelay", use regular modal
        if (details.firmwareVersion && details.firmwareVersion.includes('JunctionRelay')) {
            return true;
        }

        // Otherwise use custom modal
        return false;
    };

    const handleCardClick = (device: any) => {
        if (isJunctionRelayDevice(device)) {
            // Open regular add device modal for JunctionRelay devices
            setSelectedDevice({
                name: device.instance || device.Instance || device.name || 'Unknown Device',
                ipAddress: device.ipAddress || device.IpAddress
            });
        } else {
            // Open custom device modal for non-JunctionRelay devices
            setSelectedCustomDevice({
                name: `Device-${device.ipAddress || device.IpAddress}`,
                ipAddress: device.ipAddress || device.IpAddress,
                macAddress: device.macAddress || device.MacAddress
            });
        }
    };

    // Handle refresh cloud devices using the existing proxy controller
    const handleRefreshCloudDevices = async () => {
        setRefreshingCloudDevices(true);
        try {
            const response = await fetch('/api/cloud-auth/devices/refresh', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
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

    // Handle notification toggle for devices
    const handleToggleNotifications = useCallback(async (deviceId: number) => {
        const device = allDevices.find(d => d.id === deviceId);
        if (!device) return;

        try {
            // Toggle the current state
            const newState = !device.pushNotifications;
            const action = newState ? 'enable' : 'disable';

            const response = await fetch(`/api/cloud-auth/devices/${deviceId}/notifications/${action}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('cloud_proxy_token') || ''}`
                }
            });

            if (response.ok) {
                const result = await response.json();
                showSnackbar(`Notifications ${action}d successfully`, "success");
                fetchDevices(false); // Refresh all device lists
            } else {
                const error = await response.json();
                showSnackbar(`Failed to ${action} notifications: ${error.message}`, "error");
            }
        } catch (error) {
            console.error('Error toggling notifications:', error);
            showSnackbar(`Error ${device.pushNotifications ? 'disabling' : 'enabling'} notifications`, "error");
        }
    }, [allDevices, fetchDevices, showSnackbar]);

    // Handle sync mode change for devices
    const handleSyncModeChange = useCallback(async (deviceId: number, mode: string) => {
        try {
            const response = await fetch(`/api/devices/${deviceId}/sync-mode`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ syncMode: mode })
            });

            if (response.ok) {
                const result = await response.json();
                showSnackbar(`Sync mode updated to ${mode.replace('_', ' ')}`, "success");
                fetchDevices(false); // Refresh all device lists
            } else {
                const error = await response.json();
                showSnackbar(`Failed to update sync mode: ${error.message}`, "error");
            }
        } catch (error) {
            console.error('Error updating sync mode:', error);
            showSnackbar('Error updating sync mode', "error");
        }
    }, [fetchDevices, showSnackbar]);

    // Handle scan modal confirm
    const handleScanModalConfirm = (selectedScanType: ScanType) => {
        setScanModalOpen(false);
        startScan(selectedScanType);
    };

    return (
        <Box sx={{ padding: 2 }}>
            {/* Scan Status */}
            {(scanning || status) && (
                <Paper sx={{ mb: 3, p: 2, borderRadius: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                    {scanning && <CircularProgress size={24} />}
                    <Typography variant="h6" sx={{ m: 0 }}>{status}</Typography>
                </Paper>
            )}

            {/* View Mode Notice */}
            {scanViewModeNotice && (
                <Alert severity="info" sx={{ mb: 2 }} onClose={() => setScanViewModeNotice(null)}>
                    {scanViewModeNotice}
                </Alert>
            )}

            {/* Scan Results Tables */}
            {scanResults.length > 0 && (
                <Box sx={{ mb: 4 }}>
                    {/* New Devices Table */}
                    {groupedScanResults.newDevices.length > 0 && (
                        <DevicesTable
                            devices={groupedScanResults.newDevices}
                            title={`New Devices (${groupedScanResults.newDevices.length})`}
                            updateStatuses={{}}
                            updatingDevices={new Set()}
                            onDelete={handleDelete}
                            onUpdate={handleUpdateDevice}
                            navigate={navigate}
                            storageKeySuffix="_scan_new"
                            onDevicesChange={() => fetchDevices(false)}
                            isCloudDevicesTable={false}
                            onToggleNotifications={handleToggleNotifications}
                            onSyncModeChange={handleSyncModeChange}
                            isScanResults={true}
                            scanViewMode={scanNewViewMode}
                            onScanViewModeChange={setScanNewViewMode}
                            handleCardClick={handleCardClick}
                            deviceDetails={deviceDetails}
                            loadingDetails={loadingDetails}
                        />
                    )}

                    {/* Existing Devices Table */}
                    {groupedScanResults.existingDevices.length > 0 && (
                        <DevicesTable
                            devices={groupedScanResults.existingDevices}
                            title={`Existing Devices (${groupedScanResults.existingDevices.length})`}
                            updateStatuses={{}}
                            updatingDevices={new Set()}
                            onDelete={handleDelete}
                            onUpdate={handleUpdateDevice}
                            navigate={navigate}
                            storageKeySuffix="_scan_existing"
                            onDevicesChange={() => fetchDevices(false)}
                            isCloudDevicesTable={false}
                            onToggleNotifications={handleToggleNotifications}
                            onSyncModeChange={handleSyncModeChange}
                            isScanResults={true}
                            scanViewMode={scanExistingViewMode}
                            onScanViewModeChange={setScanExistingViewMode}
                            onResync={handleResync}
                            resyncingDevices={resyncingDevices}
                            resyncedDevices={resyncedDevices}
                            loadingDetails={loadingDetails}
                            deviceDetails={deviceDetails}
                            handleCardClick={handleCardClick}
                        />
                    )}
                </Box>
            )}

            {/* No Devices Message - Only show after scanning */}
            {scanResults.length === 0 && !scanning && hasScanned && (
                <Paper sx={{ p: 3, textAlign: 'center', mb: 4 }}>
                    <Typography variant="h6" color="textSecondary">No devices found</Typography>
                    <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                        {scanType === 'full'
                            ? 'No network devices were discovered during the scan'
                            : 'No JunctionRelay devices were found on your network'
                        }
                    </Typography>
                </Paper>
            )}

            {/* Pending Cloud Devices Section */}
            <PendingDevicesSection
                onDeviceConfirmed={() => fetchDevices(false)}
                onError={(message) => showSnackbar(message, "error")}
                onSuccess={(message) => showSnackbar(message, "success")}
            />

            {/* Device Management Section - Hide on mobile since bottom action bar handles it */}
            {!isMobile && (
                <>
                    <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
                        <Typography variant="h6">Device Management</Typography>
                    </Box>
                    <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: 'wrap' }}>
                        <Button
                            variant="contained"
                            color={buttonColor}
                            onClick={() => startScan('junctionrelay')}
                            disabled={scanning}
                            startIcon={<DeviceHubIcon />}
                            size="small"
                        >
                            {scanning && scanType === 'junctionrelay' ? "Scanning..." : "Scan Network"}
                        </Button>

                        <Button
                            variant="outlined"
                            color="primary"
                            onClick={() => startScan('full')}
                            disabled={scanning}
                            startIcon={<SearchIcon />}
                            size="small"
                        >
                            {scanning && scanType === 'full' ? "Scanning..." : "Scan Network (Full)"}
                        </Button>

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

                        <Button
                            variant="outlined"
                            startIcon={<UpdateIcon />}
                            onClick={checkForUpdates}
                            size="small"
                        >
                            Check for Firmware Updates
                        </Button>

                        {/* Cloud Device Buttons - Only show in unified mode */}
                        {isUnifiedMode && (
                            <>
                                <Button
                                    variant="contained"
                                    onClick={() => setAddCloudDeviceModalOpen(true)}
                                    startIcon={<CloudIcon />}
                                    size="small"
                                    data-testid="add-cloud-device-button"
                                    sx={{
                                        backgroundColor: '#1976d2',
                                        color: 'white',
                                        '&:hover': {
                                            backgroundColor: '#1565c0',
                                        },
                                        '&:focus': {
                                            backgroundColor: '#1565c0',
                                        }
                                    }}
                                >
                                    Add Cloud Device
                                </Button>

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
                            </>
                        )}
                    </Box>
                </>
            )}

            {/* Conditional Device Tables based on feature flag */}
            {isUnifiedMode ? (
                // Single unified table when flag is true
                <DevicesTable
                    devices={allDevices}
                    title="All Devices"
                    updateStatuses={updateStatuses}
                    updatingDevices={updatingDevices}
                    onDelete={handleDelete}
                    onUpdate={handleUpdateDevice}
                    navigate={navigate}
                    storageKeySuffix="_unified"
                    onDevicesChange={() => fetchDevices(false)}
                    refreshInterval={refreshInterval}
                    onRefreshIntervalChange={setRefreshInterval}
                    refreshIntervalOptions={REFRESH_INTERVAL_OPTIONS}
                    isCloudDevicesTable={false}
                    onToggleNotifications={handleToggleNotifications}
                    onSyncModeChange={handleSyncModeChange}
                />
            ) : (
                // Separate tables when flag is false
                <>
                    <DevicesTable
                        devices={allDevices.filter(device => device.type !== "Cloud Device")}
                        title="Local Devices"
                        updateStatuses={updateStatuses}
                        updatingDevices={updatingDevices}
                        onDelete={handleDelete}
                        onUpdate={handleUpdateDevice}
                        navigate={navigate}
                        storageKeySuffix="_local"
                        onDevicesChange={() => fetchDevices(false)}
                        refreshInterval={refreshInterval}
                        onRefreshIntervalChange={setRefreshInterval}
                        refreshIntervalOptions={REFRESH_INTERVAL_OPTIONS}
                        isCloudDevicesTable={false}
                        onToggleNotifications={handleToggleNotifications}
                        onSyncModeChange={handleSyncModeChange}
                    />

                    {/* Cloud Device Management Buttons - Hide on mobile, above Cloud table in non-unified mode */}
                    {!isMobile && (
                        <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
                            <Button
                                variant="contained"
                                onClick={() => setAddCloudDeviceModalOpen(true)}
                                startIcon={<CloudIcon />}
                                size="small"
                                data-testid="add-cloud-device-button-nonunified"
                                sx={{
                                    backgroundColor: '#1976d2',
                                    color: 'white',
                                    '&:hover': {
                                        backgroundColor: '#1565c0',
                                    },
                                    '&:focus': {
                                        backgroundColor: '#1565c0',
                                    }
                                }}
                            >
                                Add Cloud Device
                            </Button>

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
                    )}

                    <DevicesTable
                        devices={allDevices.filter(device => device.type === "Cloud Device")}
                        title="Cloud Devices"
                        updateStatuses={updateStatuses}
                        updatingDevices={updatingDevices}
                        onDelete={handleDelete}
                        onUpdate={handleUpdateDevice}
                        navigate={navigate}
                        storageKeySuffix="_cloud"
                        onDevicesChange={() => fetchDevices(false)}
                        refreshInterval={cloudRefreshInterval}
                        onRefreshIntervalChange={setCloudRefreshInterval}
                        refreshIntervalOptions={CLOUD_REFRESH_INTERVAL_OPTIONS}
                        isCloudDevicesTable={true}
                        onToggleNotifications={handleToggleNotifications}
                        onSyncModeChange={handleSyncModeChange}
                    />
                </>
            )}

            {/* Scan Modal */}
            <Dialog
                open={scanModalOpen}
                onClose={() => setScanModalOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <SearchIcon color="primary" />
                        Network Scan
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body1" sx={{ mb: 3 }}>
                        Choose the type of network scan to perform:
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Button
                            variant="outlined"
                            onClick={() => handleScanModalConfirm('junctionrelay')}
                            disabled={scanning}
                            sx={{
                                p: 2,
                                justifyContent: 'flex-start',
                                textAlign: 'left',
                                border: '2px solid',
                                borderColor: 'primary.main',
                                '&:hover': {
                                    backgroundColor: 'primary.light',
                                    borderColor: 'primary.dark',
                                }
                            }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                                <MemoryIcon sx={{ mr: 2, fontSize: 32 }} color="primary" />
                                <Box>
                                    <Typography variant="h6" component="div">
                                        JunctionRelay Firmware
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Scan for devices running JunctionRelay firmware only
                                    </Typography>
                                </Box>
                            </Box>
                        </Button>

                        <Button
                            variant="outlined"
                            onClick={() => handleScanModalConfirm('full')}
                            disabled={scanning}
                            sx={{
                                p: 2,
                                justifyContent: 'flex-start',
                                textAlign: 'left',
                                border: '2px solid',
                                borderColor: 'secondary.main',
                                '&:hover': {
                                    backgroundColor: 'secondary.light',
                                    borderColor: 'secondary.dark',
                                }
                            }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                                <SearchIcon sx={{ mr: 2, fontSize: 32 }} color="secondary" />
                                <Box>
                                    <Typography variant="h6" component="div">
                                        All Network Devices
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Comprehensive scan of all devices on the network
                                    </Typography>
                                </Box>
                            </Box>
                        </Button>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setScanModalOpen(false)}
                        disabled={scanning}
                    >
                        Cancel
                    </Button>
                </DialogActions>
            </Dialog>

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
                open={addCustomDeviceModalOpen || !!selectedCustomDevice}
                onClose={() => {
                    setAddCustomDeviceModalOpen(false);
                    setSelectedCustomDevice(null);
                }}
                onDeviceAdded={fetchDevices}
                prefilledData={selectedCustomDevice}
            />

            <DeviceRegistrationModal
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

const AddCustomDeviceModal: React.FC<{
    open: boolean;
    onClose: () => void;
    onDeviceAdded: () => void;
    prefilledData?: { name: string; ipAddress: string; macAddress?: string } | null;
}> = ({ open, onClose, onDeviceAdded, prefilledData }) => {
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        ipAddress: "",
        uniqueIdentifier: "",
        // Match your C# model fields - Heartbeat
        HeartbeatProtocol: 'HTTP' as HeartbeatProtocol,
        HeartbeatTarget: "",
        HeartbeatExpectedValue: "",
        HeartbeatEnabled: true,
        HeartbeatIntervalMs: 60000,
        HeartbeatGracePeriodMs: 180000,
        HeartbeatMaxRetryAttempts: 3,
        // Match your C# model fields - SSH
        SshUsername: "",
        SshPassword: "",
        SshPort: 22,
        SshTimeoutMs: 10000,
        SshPrivateKey: "",
        UseSshKeyAuth: false,
        SshConnectionRetries: 3,
        SshVerifyHostKey: true
    });
    const [selectedProtocol, setSelectedProtocol] = useState<HeartbeatProtocol>('HTTP');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [configureAfterAdd, setConfigureAfterAdd] = useState<boolean>(false);

    // Update form data when prefilledData changes
    useEffect(() => {
        if (prefilledData) {
            setFormData(prev => ({
                ...prev,
                name: prefilledData.name,
                description: `Custom device at ${prefilledData.ipAddress}`,
                ipAddress: prefilledData.ipAddress,
                uniqueIdentifier: prefilledData.macAddress || prefilledData.ipAddress
            }));
        } else {
            // Reset form when no prefilled data
            setFormData({
                name: "",
                description: "",
                ipAddress: "",
                uniqueIdentifier: "",
                HeartbeatProtocol: 'HTTP' as HeartbeatProtocol,
                HeartbeatTarget: "",
                HeartbeatExpectedValue: "",
                HeartbeatEnabled: true,
                HeartbeatIntervalMs: 60000,
                HeartbeatGracePeriodMs: 180000,
                HeartbeatMaxRetryAttempts: 3,
                SshUsername: "",
                SshPassword: "",
                SshPort: 22,
                SshTimeoutMs: 10000,
                SshPrivateKey: "",
                UseSshKeyAuth: false,
                SshConnectionRetries: 3,
                SshVerifyHostKey: true
            });
        }
    }, [prefilledData]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Handle changes from HeartbeatProtocolSelector
    const handleHeartbeatFormDataChange = (updates: any) => {
        console.log('AddCustomDeviceModal: Received updates from HeartbeatProtocolSelector:', updates);
        setFormData(prev => {
            const newFormData = { ...prev, ...updates };
            console.log('AddCustomDeviceModal: Updated formData:', newFormData);
            return newFormData;
        });
    };

    const handleSubmit = async (redirectToConfigure: boolean) => {
        const {
            name,
            description,
            ipAddress,
            uniqueIdentifier,
            HeartbeatProtocol,
            HeartbeatTarget,
            HeartbeatExpectedValue,
            HeartbeatEnabled,
            HeartbeatIntervalMs,
            HeartbeatGracePeriodMs,
            HeartbeatMaxRetryAttempts,
            SshUsername,
            SshPassword,
            SshPort,
            SshTimeoutMs,
            SshPrivateKey,
            UseSshKeyAuth,
            SshConnectionRetries,
            SshVerifyHostKey
        } = formData;

        if (!name || !description || !ipAddress || !uniqueIdentifier) {
            setError("All fields are required.");
            return;
        }

        try {
            setLoading(true);
            setConfigureAfterAdd(redirectToConfigure);

            // FIX: Use PascalCase field names that match your C# Model_Device
            const payload = {
                Name: name,
                Description: description,
                UniqueIdentifier: uniqueIdentifier,
                IPAddress: ipAddress,
                Type: "Custom",
                Status: "Active",

                // Include heartbeat fields with correct PascalCase names
                HeartbeatProtocol: HeartbeatProtocol,
                HeartbeatTarget: HeartbeatTarget,
                HeartbeatExpectedValue: HeartbeatExpectedValue,
                HeartbeatEnabled: HeartbeatEnabled,
                HeartbeatIntervalMs: HeartbeatIntervalMs,
                HeartbeatGracePeriodMs: HeartbeatGracePeriodMs,
                HeartbeatMaxRetryAttempts: HeartbeatMaxRetryAttempts,

                // Include SSH fields with correct PascalCase names
                SshUsername: SshUsername,
                SshPassword: SshPassword,
                SshPort: SshPort,
                SshTimeoutMs: SshTimeoutMs,
                SshPrivateKey: SshPrivateKey,
                UseSshKeyAuth: UseSshKeyAuth,
                SshConnectionRetries: SshConnectionRetries,
                SshVerifyHostKey: SshVerifyHostKey,

                // Set default capabilities for custom devices
                HasOnboardScreen: false,
                HasOnboardLED: false,
                HasOnboardRGBLED: false,
                HasExternalNeopixels: false,
                HasExternalMatrix: false,
                HasExternalI2CDevices: false,
                SupportsEthernet: true,
                SupportsWiFi: true,
                SupportsBLE: true,
                SupportsUSB: true,
                SupportsESPNow: true,
                SupportsHTTP: true,
                SupportsMQTT: true,
                SupportsWebSockets: true,
                HasButtons: false,
                HasBattery: false,
                HasSpeaker: false,
                HasMicroSD: false,
                IsGateway: false
            };

            console.log('AddCustomDeviceModal: Submitting payload:', payload);

            const response = await fetch("/api/devices", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const result = await response.json();
            console.log('AddCustomDeviceModal: Server response:', result);

            if (!response.ok) throw new Error(result.message || "Failed to add device");

            onDeviceAdded();
            onClose();

            if (redirectToConfigure) {
                const newId = result.id || result.Id;
                window.location.href = `/configure-device/${newId}`;
            }
        } catch (err: any) {
            console.error('AddCustomDeviceModal: Submit error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Update protocol selection when HeartbeatProtocol changes
    React.useEffect(() => {
        if (formData.HeartbeatProtocol !== selectedProtocol) {
            setSelectedProtocol(formData.HeartbeatProtocol);
        }
    }, [formData.HeartbeatProtocol]);

    return (
        <Modal open={open} onClose={onClose}>
            <Box
                sx={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: '90%',
                    maxWidth: 900,
                    bgcolor: "background.paper",
                    p: 4,
                    boxShadow: 24,
                    borderRadius: 2,
                    maxHeight: "90vh",
                    overflow: "auto"
                }}
            >
                <Typography variant="h6" gutterBottom>
                    {prefilledData ? `Add Custom Device: ${prefilledData.name}` : "Add Custom Local Device"}
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

                {/* Basic Device Information */}
                <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'medium' }}>
                    Device Information
                </Typography>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mb: 3 }}>
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
                        helperText="MAC address or other unique identifier"
                    />
                </Box>

                    {/* Heartbeat Protocol Selector */}
                    <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'medium' }}>
                        Health Monitoring
                    </Typography>
                    <HeartbeatProtocolSelector
                        selectedProtocol={selectedProtocol}
                        onProtocolChange={setSelectedProtocol}
                        formData={formData}
                        onFormDataChange={handleHeartbeatFormDataChange}
                    />

                    {/* Action Buttons */}
                    <Box sx={{ display: "flex", gap: 2, mt: 3, justifyContent: 'flex-end' }}>
                        <Button
                            variant="outlined"
                            onClick={onClose}
                            size="small"
                            disabled={loading}
                        >
                            Cancel
                        </Button>
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
                    </Box>
                </Box>
            </Modal>
        );
    };

export default Devices;