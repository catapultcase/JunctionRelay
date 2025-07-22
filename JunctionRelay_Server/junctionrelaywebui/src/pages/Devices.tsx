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
    Box,
    Snackbar,
    Alert,
    CircularProgress
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useTheme, useMediaQuery } from "@mui/material";

// Icon imports
import CloudIcon from '@mui/icons-material/Cloud';
import RefreshIcon from '@mui/icons-material/Refresh';

// Import our components
import DevicesTable from '../components/Devices_DevicesTable';
import DeviceRegistrationModal from '../components/DeviceRegistrationModal';
import PendingDevicesSection from '../components/PendingDevicesSection';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import Device_ScanModal from '../components/Device_ScanModal';
import Device_ManagementSection from '../components/Device_ManagementSection';
import Device_AddDeviceModal from '../components/Device_AddDeviceModal';
import Device_AddCustomDeviceModal from '../components/Device_AddCustomDeviceModal';
import Device_ScanResults from '../components/Device_ScanResults';

import {
    STORAGE_KEY_REFRESH_INTERVAL,
    STORAGE_KEY_CLOUD_REFRESH_INTERVAL
} from '../components/Devices_Helpers';

// Storage keys for scan view modes
const STORAGE_KEY_SCAN_NEW_VIEW_MODE = "junctionrelay_scan_new_view_mode";
const STORAGE_KEY_SCAN_EXISTING_VIEW_MODE = "junctionrelay_scan_existing_view_mode";

// Scan type enum
type ScanType = 'junctionrelay' | 'full' | 'com';

// Scan options interface
interface ScanOptions {
    baudRate: number;
    timeoutMs: number;
    includeDetails: boolean;
}

// Main Device Component
const Devices: React.FC = () => {
    // Configurable refresh rate options
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

    // State management
    const [refreshInterval, setRefreshInterval] = useState<number>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_REFRESH_INTERVAL);
        return stored ? parseInt(stored, 10) : 30000;
    });

    const [cloudRefreshInterval, setCloudRefreshInterval] = useState<number>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_CLOUD_REFRESH_INTERVAL);
        return stored ? parseInt(stored, 10) : 0;
    });

    const [scanning, setScanning] = useState(false);
    const [hasScanned, setHasScanned] = useState(false);
    const [status, setStatus] = useState("");
    const [scanResults, setScanResults] = useState<any[]>([]);
    const [scanType, setScanType] = useState<ScanType>('junctionrelay');

    const [scanNewViewMode, setScanNewViewMode] = useState<string>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_SCAN_NEW_VIEW_MODE);
        if (stored) return stored;
        const localViewMode = localStorage.getItem('junctionrelay_devices_view_mode_local');
        return localViewMode || 'table';
    });

    const [scanExistingViewMode, setScanExistingViewMode] = useState<string>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_SCAN_EXISTING_VIEW_MODE);
        if (stored) return stored;
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
    const [scanModalOpen, setScanModalOpen] = useState(false);

    const navigate = useNavigate();
    const flags = useFeatureFlags();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const isUnifiedMode = String(flags?.device_combine_cloud_devices).toLowerCase() === 'true';

    // Save intervals to localStorage
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_REFRESH_INTERVAL, refreshInterval.toString());
    }, [refreshInterval]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_CLOUD_REFRESH_INTERVAL, cloudRefreshInterval.toString());
    }, [cloudRefreshInterval]);

    // Save scan view modes to localStorage
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_SCAN_NEW_VIEW_MODE, scanNewViewMode);
    }, [scanNewViewMode]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_SCAN_EXISTING_VIEW_MODE, scanExistingViewMode);
    }, [scanExistingViewMode]);

    // Bottom action bar event listeners
    useEffect(() => {
        const handleAddDevice = () => setAddCustomDeviceModalOpen(true);
        const handleAddCloudDevice = () => setAddCloudDeviceModalOpen(true);
        const handleRefresh = () => fetchDevices(false, true);
        const handleSearch = () => setScanModalOpen(true);
        const handleViewModeChange = (event: CustomEvent) => {
            console.log('Bottom bar: View mode change requested:', event.detail.mode);
        };
        const handleScanDeviceSelected = (event: CustomEvent) => {
            handleCardClick(event.detail.device);
        };

        window.addEventListener('bottom-action-add-device', handleAddDevice);
        window.addEventListener('bottom-action-add-cloud-device', handleAddCloudDevice);
        window.addEventListener('bottom-action-refresh', handleRefresh);
        window.addEventListener('bottom-action-search', handleSearch);
        window.addEventListener('bottom-action-view-mode-change', handleViewModeChange as EventListener);
        window.addEventListener('scan-device-selected', handleScanDeviceSelected as EventListener);

        return () => {
            window.removeEventListener('bottom-action-add-device', handleAddDevice);
            window.removeEventListener('bottom-action-add-cloud-device', handleAddCloudDevice);
            window.removeEventListener('bottom-action-refresh', handleRefresh);
            window.removeEventListener('bottom-action-search', handleSearch);
            window.removeEventListener('bottom-action-view-mode-change', handleViewModeChange as EventListener);
            window.removeEventListener('scan-device-selected', handleScanDeviceSelected as EventListener);
        };
    }, []);

    // Group scan results by status
    const groupedScanResults = useMemo(() => {
        if (!scanResults.length) return { newDevices: [], existingDevices: [] };

        return scanResults.reduce(
            (acc: any, device: any) => {
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

    // Fetch device details helper
    const fetchDeviceDetails = async (ipAddress: string) => {
        setLoadingDetails(prev => new Set([...prev, ipAddress]));
        try {
            const infoRes = await fetch(`/api/devices/info?ip=${encodeURIComponent(ipAddress)}`);
            if (infoRes.ok) {
                const infoJson = await infoRes.json();
                setDeviceDetails(prev => ({ ...prev, [ipAddress]: infoJson.deviceInfo }));
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

    // Fetch devices from API
    const fetchDevices = useCallback(async (checkUpdates: boolean = false, forceCloudSync: boolean = false) => {
        try {
            const skipCloudSync = !forceCloudSync;
            const response = await fetch(`/api/devices?skipCloudSync=${skipCloudSync}`);
            const data = await response.json();
            setAllDevices(data);

            if (checkUpdates) {
                const jrDevices = data.filter((d: any) => d.isJunctionRelayDevice && !d.isGateway);
                if (jrDevices.length > 0) {
                    const updates: Record<number, boolean> = {};
                    for (const device of jrDevices) {
                        try {
                            const res = await fetch(`/api/ota/check/${device.id}?force=false`);
                            if (res.ok) {
                                const updateInfo = await res.json();
                                updates[device.id] = updateInfo.is_outdated === true;
                            } else {
                                updates[device.id] = false;
                            }
                        } catch (err) {
                            updates[device.id] = false;
                        }
                    }
                    setUpdateStatuses(updates);
                }
            }
        } catch (err) {
            console.error("Error fetching devices:", err);
        }
    }, []);

    // Check for firmware updates
    const checkForUpdates = useCallback(async () => {
        try {
            const junctionRelayDevices = allDevices.filter(d => d.isJunctionRelayDevice && !d.isGateway);
            if (junctionRelayDevices.length === 0) return;

            const updates: Record<number, boolean> = {};
            for (const device of junctionRelayDevices) {
                try {
                    const res = await fetch(`/api/ota/check/${device.id}?force=true`);
                    if (res.ok) {
                        const updateInfo = await res.json();
                        updates[device.id] = updateInfo.is_outdated === true;
                    } else {
                        updates[device.id] = false;
                    }
                } catch (error) {
                    updates[device.id] = false;
                }
            }
            setUpdateStatuses(updates);
        } catch (error) {
            console.error("Error checking for updates:", error);
        }
    }, [allDevices]);

    // Device resync handler
    const handleResync = async (macAddress?: string, newIpAddress?: string) => {
        if (!macAddress || !newIpAddress) {
            showSnackbar("Device MAC address or IP is missing.", "error");
            return;
        }

        const deviceKey = `${macAddress}-${newIpAddress}`;
        setResyncingDevices(prev => ({ ...prev, [deviceKey]: true }));

        try {
            const res = await fetch('/api/devices/resync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ macAddress, newIpAddress })
            });

            const result = await res.json();
            if (res.ok) {
                showSnackbar(result.message || "Device resynced successfully.", "success");
                setResyncedDevices(prev => new Set([...prev, macAddress]));
                await fetchDevices();
            } else {
                showSnackbar(`Failed to resync device: ${result.message}`, "error");
            }
        } catch (error) {
            console.error("Resync error:", error);
            showSnackbar("Error syncing the device.", "error");
        } finally {
            setResyncingDevices(prev => {
                const updated = { ...prev };
                delete updated[deviceKey];
                return updated;
            });
        }
    };

    // Device card click handler
    const handleCardClick = (device: any) => {
        const ip = device.ipAddress || device.IpAddress;
        const details = deviceDetails[ip] || {};
        const isJunctionRelay = details.firmwareVersion && details.firmwareVersion.includes('JunctionRelay');

        if (isJunctionRelay) {
            setSelectedDevice({
                name: device.instance || device.Instance || device.name || 'Unknown Device',
                ipAddress: ip
            });
        } else {
            setSelectedCustomDevice({
                name: `Device-${ip}`,
                ipAddress: ip,
                macAddress: device.macAddress || device.MacAddress
            });
        }
    };

    // Cloud device refresh handler
    const handleRefreshCloudDevices = async () => {
        setRefreshingCloudDevices(true);
        try {
            const response = await fetch('/api/cloud-auth/devices/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                const result = await response.json();
                showSnackbar(`Refreshed ${result.count || 0} cloud devices`, "success");
                await fetchDevices();
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

    // Device deletion handler
    const handleDelete = async (e: React.MouseEvent, deviceId: number) => {
        e.stopPropagation();
        if (window.confirm("Are you sure you want to delete this device?")) {
            try {
                const response = await fetch(`/api/devices/${deviceId}`, { method: "DELETE" });
                if (response.ok) {
                    showSnackbar("Device deleted successfully", "success");
                    fetchDevices();
                } else {
                    throw new Error("Failed to delete device");
                }
            } catch (err: unknown) {
                showSnackbar("Error deleting device", "error");
            }
        }
    };

    // Device update handler
    const handleUpdateDevice = async (deviceId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setUpdatingDevices(prev => new Set([...prev, deviceId]));

        try {
            const deviceInfo = allDevices.find(d => d.id === deviceId);
            if (!deviceInfo) throw new Error("Device not found");

            const ipAddress = deviceInfo.ipAddress;
            if (!ipAddress) throw new Error("Device IP address not found");

            const firmwareRes = await fetch(`/api/ota/firmware/${deviceId}`);
            if (!firmwareRes.ok) throw new Error(`Failed to get firmware: ${firmwareRes.statusText}`);

            const firmwareBlob = await firmwareRes.blob();
            const formData = new FormData();
            formData.append("file", firmwareBlob, "firmware.bin");

            try {
                await fetch(`http://${ipAddress}/api/ota/firmware`, {
                    method: "POST",
                    body: formData
                });
            } catch (err) {
                console.warn(`[OTA] Expected disconnection during firmware upload to ${ipAddress}`, err);
            }

            showSnackbar(`Update pushed to ${ipAddress}, waiting for reboot...`, "info");

            const pollRes = await fetch(`/api/ota/poll-for-update/${deviceId}`, { method: "POST" });
            if (pollRes.ok) {
                const pollData = await pollRes.json();
                if (pollData.updated) {
                    showSnackbar(`Device at ${ipAddress} updated to v${pollData.version}`, "success");
                } else {
                    showSnackbar(`Update started, but device has not yet reported v${pollData.version}`, "info");
                }
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

    // Notification toggle handler
    const handleToggleNotifications = useCallback(async (deviceId: number) => {
        const device = allDevices.find(d => d.id === deviceId);
        if (!device) return;

        try {
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
                showSnackbar(`Notifications ${action}d successfully`, "success");
                fetchDevices(false);
            } else {
                const error = await response.json();
                showSnackbar(`Failed to ${action} notifications: ${error.message}`, "error");
            }
        } catch (error) {
            console.error('Error toggling notifications:', error);
            showSnackbar(`Error ${device.pushNotifications ? 'disabling' : 'enabling'} notifications`, "error");
        }
    }, [allDevices, fetchDevices]);

    // Sync mode change handler
    const handleSyncModeChange = useCallback(async (deviceId: number, mode: string) => {
        try {
            const response = await fetch(`/api/devices/${deviceId}/sync-mode`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ syncMode: mode })
            });

            if (response.ok) {
                showSnackbar(`Sync mode updated to ${mode.replace('_', ' ')}`, "success");
                fetchDevices(false);
            } else {
                const error = await response.json();
                showSnackbar(`Failed to update sync mode: ${error.message}`, "error");
            }
        } catch (error) {
            console.error('Error updating sync mode:', error);
            showSnackbar('Error updating sync mode', "error");
        }
    }, [fetchDevices]);

    // Initial data loading and interval setup
    useEffect(() => {
        fetchDevices(true, true);

        let localInterval: NodeJS.Timeout | undefined;
        if (refreshInterval > 0) {
            localInterval = setInterval(() => fetchDevices(false, false), refreshInterval);
        }

        let cloudInterval: NodeJS.Timeout | undefined;
        if (cloudRefreshInterval > 0) {
            cloudInterval = setInterval(() => handleRefreshCloudDevices(), cloudRefreshInterval);
        }

        return () => {
            if (localInterval) clearInterval(localInterval);
            if (cloudInterval) clearInterval(cloudInterval);
        };
    }, [refreshInterval, cloudRefreshInterval, fetchDevices]);

    return (
        <Box sx={{ padding: 2 }}>
            {/* Scan Results */}
            <Device_ScanResults
                scanning={scanning}
                status={status}
                scanViewModeNotice={scanViewModeNotice}
                setScanViewModeNotice={setScanViewModeNotice}
                scanResults={scanResults}
                groupedScanResults={groupedScanResults}
                scanNewViewMode={scanNewViewMode}
                setScanNewViewMode={setScanNewViewMode}
                scanExistingViewMode={scanExistingViewMode}
                setScanExistingViewMode={setScanExistingViewMode}
                deviceDetails={deviceDetails}
                loadingDetails={loadingDetails}
                hasScanned={hasScanned}
                scanType={scanType}
                handleDelete={handleDelete}
                handleUpdateDevice={handleUpdateDevice}
                navigate={navigate}
                handleToggleNotifications={handleToggleNotifications}
                handleSyncModeChange={handleSyncModeChange}
                handleCardClick={handleCardClick}
                handleResync={handleResync}
                resyncingDevices={resyncingDevices}
                resyncedDevices={resyncedDevices}
                fetchDevices={fetchDevices}
            />

            {/* Pending Cloud Devices Section */}
            <PendingDevicesSection
                onDeviceConfirmed={() => fetchDevices(false)}
                onError={(message) => showSnackbar(message, "error")}
                onSuccess={(message) => showSnackbar(message, "success")}
            />

            {/* Device Management Section */}
            <Device_ManagementSection
                isMobile={isMobile}
                scanning={scanning}
                buttonColor={buttonColor}
                setScanModalOpen={setScanModalOpen}
                setAddCustomDeviceModalOpen={setAddCustomDeviceModalOpen}
                checkForUpdates={checkForUpdates}
                isUnifiedMode={isUnifiedMode}
                setAddCloudDeviceModalOpen={setAddCloudDeviceModalOpen}
                handleRefreshCloudDevices={handleRefreshCloudDevices}
                refreshingCloudDevices={refreshingCloudDevices}
            />

            {/* Device Tables */}
            {isUnifiedMode ? (
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

            {/* Modals */}
            <Device_ScanModal
                open={scanModalOpen}
                onClose={() => setScanModalOpen(false)}
                onScanStart={(scanType: ScanType, options?: ScanOptions) => {
                    console.log('Scan started from modal:', scanType, options);
                }}
                scanning={scanning}
                setScanResults={setScanResults}
                setScanning={setScanning}
                setHasScanned={setHasScanned}
                setStatus={setStatus}
                setScanType={setScanType}
                setButtonColor={setButtonColor}
                setScanNewViewMode={setScanNewViewMode}
                setScanExistingViewMode={setScanExistingViewMode}
                setScanViewModeNotice={setScanViewModeNotice}
                setResyncedDevices={setResyncedDevices}
                fetchDeviceDetails={fetchDeviceDetails}
            />

            <Device_AddDeviceModal
                open={!!selectedDevice}
                onClose={() => setSelectedDevice(null)}
                deviceIp={selectedDevice?.ipAddress || ""}
                instance={selectedDevice?.name || ""}
                onDeviceAdded={fetchDevices}
            />

            <Device_AddCustomDeviceModal
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

            {/* Snackbar */}
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
        </Box>
    );
};

export default Devices;