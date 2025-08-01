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

import React, { useState } from "react";
import {
    Button,
    Typography,
    Box,
    Modal,
    IconButton,
    Divider,
    TextField,
    FormControlLabel,
    Checkbox,
} from "@mui/material";
// Icon imports
import SearchIcon from '@mui/icons-material/Search';
import MemoryIcon from '@mui/icons-material/Memory';
import RouterIcon from '@mui/icons-material/Router';
import UsbIcon from '@mui/icons-material/Usb';
import MinimizeIcon from '@mui/icons-material/Minimize';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

// Scan type definitions
type ScanType = 'junctionrelay' | 'full' | 'com';

interface ScanOptions {
    baudRate: number;
    timeoutMs: number;
    includeDetails: boolean;
}

// SetupInstructions component for scan types
const SetupInstructions_Scan: React.FC<{ scanType: ScanType }> = ({ scanType }) => {
    switch (scanType) {
        case 'junctionrelay':
            return (
                <Box>
                    <Typography variant="h6" sx={{ mb: 2, color: 'primary.main' }}>
                        JunctionRelay Network Scan
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        This scan looks for devices running JunctionRelay firmware on your local network using mDNS discovery.
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                        What this scan finds:
                    </Typography>
                    <Box component="ul" sx={{ ml: 2, mb: 2 }}>
                        <li><Typography variant="body2">Devices with JunctionRelay firmware</Typography></li>
                        <li><Typography variant="body2">Devices that respond to mDNS queries</Typography></li>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                        <strong>Tip:</strong> This is the fastest scan option and should be your first choice for discovering devices running JunctionRelay firmware.
                    </Typography>
                </Box>
            );

        case 'full':
            return (
                <Box>
                    <Typography variant="h6" sx={{ mb: 2, color: 'secondary.main' }}>
                        Full Network Scan
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        This scan discovers all devices on your local network, not just those running JunctionRelay firmware.
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                        What this scan finds:
                    </Typography>
                    <Box component="ul" sx={{ ml: 2, mb: 2 }}>
                        <li><Typography variant="body2">All network-connected devices (routers, computers, phones, etc.)</Typography></li>
                        <li><Typography variant="body2">Any device with an active IP address</Typography></li>
                    </Box>
                    <Typography variant="body2" color="warning.main" sx={{ mb: 1 }}>
                        <strong>Note:</strong> This scan may take longer and will discover many non-JunctionRelay devices.
                    </Typography>
                </Box>
            );

        case 'com':
            return (
                <Box>
                    <Typography variant="h6" sx={{ mb: 2, color: 'success.main' }}>
                        COM Port Device Scan
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        This scan discovers devices connected via serial/USB ports that may be running JunctionRelay firmware or other compatible protocols.
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                        What this scan finds:
                    </Typography>
                    <Box component="ul" sx={{ ml: 2, mb: 2 }}>
                        <li><Typography variant="body2">USB-connected devices</Typography></li>
                    </Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                        Configuration options:
                    </Typography>
                    <Box component="ul" sx={{ ml: 2, mb: 2 }}>
                        <li><Typography variant="body2"><strong>Baud Rate:</strong> Communication speed (default: 115200)</Typography></li>
                        <li><Typography variant="body2"><strong>Timeout:</strong> How long to wait for device response (default: 3000ms)</Typography></li>
                    </Box>
                </Box>
            );

        default:
            return null;
    }
};

// Main Scan Modal Component
interface Device_ScanModalProps {
    open: boolean;
    onClose: () => void;
    onScanStart: (scanType: ScanType, options?: ScanOptions) => void;
    scanning?: boolean;
    setScanResults: React.Dispatch<React.SetStateAction<any[]>>;
    setScanning: React.Dispatch<React.SetStateAction<boolean>>;
    setHasScanned: React.Dispatch<React.SetStateAction<boolean>>;
    setStatus: React.Dispatch<React.SetStateAction<string>>;
    setScanType: React.Dispatch<React.SetStateAction<ScanType>>;
    setButtonColor: React.Dispatch<React.SetStateAction<"primary" | "secondary">>;
    setScanNewViewMode: React.Dispatch<React.SetStateAction<string>>;
    setScanExistingViewMode: React.Dispatch<React.SetStateAction<string>>;
    setScanViewModeNotice: React.Dispatch<React.SetStateAction<string | null>>;
    setResyncedDevices: React.Dispatch<React.SetStateAction<Set<string>>>;
    fetchDeviceDetails: (ipAddress: string) => Promise<void>;
}

const Device_ScanModal: React.FC<Device_ScanModalProps> = ({
    open,
    onClose,
    onScanStart,
    scanning = false,
    setScanResults,
    setScanning,
    setHasScanned,
    setStatus,
    setScanType,
    setButtonColor,
    setScanNewViewMode,
    setScanExistingViewMode,
    setScanViewModeNotice,
    setResyncedDevices,
    fetchDeviceDetails
}) => {
    const [selectedScanType, setSelectedScanType] = useState<ScanType | null>('junctionrelay');
    const [setupInstructionsMinimized, setSetupInstructionsMinimized] = useState<boolean>(false);
    const [scanOptions, setScanOptions] = useState<ScanOptions>({
        baudRate: 115200,
        timeoutMs: 3000,
        includeDetails: true
    });

    // Scan type options for the left sidebar
    const scanTypes = [
        {
            value: 'junctionrelay' as ScanType,
            name: 'JunctionRelay Network',
            desc: 'Fast scan for JunctionRelay devices',
            icon: <MemoryIcon />,
            color: 'primary.main'
        },
        {
            value: 'full' as ScanType,
            name: 'Full Network Scan',
            desc: 'Comprehensive network discovery',
            icon: <RouterIcon />,
            color: 'secondary.main'
        },
        {
            value: 'com' as ScanType,
            name: 'COM Port Devices',
            desc: 'Serial/USB connected devices',
            icon: <UsbIcon />,
            color: 'success.main'
        }
    ];

    // Reset state when modal opens/closes
    React.useEffect(() => {
        if (open) {
            setSelectedScanType('junctionrelay'); // Pre-select instead of null
            setSetupInstructionsMinimized(false);
            setScanOptions({
                baudRate: 115200,
                timeoutMs: 3000,
                includeDetails: true
            });
        }
    }, [open]);

    // Unified scan start function that handles all scan types
    const startScan = async (type: ScanType, options?: ScanOptions) => {
        console.log(`[FRONTEND] Starting ${type} scan with options:`, options);
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
            // Other scans use stored preferences or defaults to local device table view mode
            const currentLocalViewMode = localStorage.getItem('junctionrelay_devices_view_mode_local') || 'table';

            const storedNewViewMode = localStorage.getItem('junctionrelay_scan_new_view_mode');
            const storedExistingViewMode = localStorage.getItem('junctionrelay_scan_existing_view_mode');

            setScanNewViewMode(storedNewViewMode || currentLocalViewMode);
            setScanExistingViewMode(storedExistingViewMode || currentLocalViewMode);
            setScanViewModeNotice(null);
        }

        // Set appropriate status message and endpoint
        let statusMessage = "";
        let endpoint = "";

        switch (type) {
            case 'junctionrelay':
                statusMessage = "Scanning for JunctionRelay devices...";
                endpoint = '/api/devices/scan';
                break;
            case 'full':
                statusMessage = "Scanning all network devices...";
                endpoint = '/api/devices/scan/stream';
                break;
            case 'com':
                statusMessage = `Scanning COM ports at ${options?.baudRate || 115200} baud...`;
                endpoint = `/api/com/scan/stream?baudRate=${options?.baudRate || 115200}&timeoutMs=${options?.timeoutMs || 3000}`;
                break;
        }

        setStatus(statusMessage);
        setButtonColor("secondary");

        try {
            if (type === 'junctionrelay') {
                // Use original method for JunctionRelay scan (non-streaming)
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
            } else {
                // Use Server-Sent Events for full network and COM scans
                console.log(`[FRONTEND] Starting SSE connection to ${endpoint}`);

                const eventSource = new EventSource(endpoint);
                let deviceCount = 0;

                eventSource.onopen = () => {
                    console.log('[FRONTEND] SSE connection opened');
                };

                eventSource.onmessage = (event: MessageEvent) => {
                    console.log('[FRONTEND] Received SSE message:', event.data);

                    try {
                        const data = JSON.parse(event.data);
                        console.log('[FRONTEND] Parsed SSE data:', data);

                        // Check if this is a device (has IpAddress/PortName) or a status message
                        if (data.IpAddress || data.PortName) {
                            console.log(`[FRONTEND] Adding device: ${data.IpAddress || data.PortName}`);
                            setScanResults(prev => {
                                const updated = [...prev, data];
                                console.log(`[FRONTEND] Total devices now: ${updated.length}`);
                                return updated;
                            });
                            deviceCount++;

                            // Start fetching device details for network devices
                            if (data.IpAddress && type !== 'com') {
                                fetchDeviceDetails(data.IpAddress);
                            }
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

                eventSource.addEventListener('status', (event: MessageEvent) => {
                    console.log('[FRONTEND] Status event received:', event.data);
                    try {
                        const statusData = JSON.parse(event.data);
                        if (statusData.message) {
                            setStatus(statusData.message);
                        }
                    } catch (parseError) {
                        console.log('[FRONTEND] Could not parse status event data');
                    }
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
                            setStatus("Error scanning devices.");
                        }
                    } else {
                        setStatus("Error scanning devices.");
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
            }
        } catch (error) {
            console.error("Scan error:", error);
            setStatus("Error scanning for devices.");
            setScanning(false);
            setButtonColor("primary");
        }
    };

    const handleScanStart = () => {
        if (selectedScanType) {
            startScan(selectedScanType, scanOptions);
            onClose();
        }
    };

    const handleOptionChange = (field: keyof ScanOptions, value: any) => {
        setScanOptions(prev => ({
            ...prev,
            [field]: value
        }));
    };

    return (
        <Modal open={open} onClose={onClose}>
            <Box sx={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: { xs: 'auto', sm: '90%', md: '80%' },
                maxWidth: { xs: '95vw', md: 900 },
                minWidth: { xs: 320, sm: 400 },
                height: 'auto',
                maxHeight: { xs: '90vh', md: '80vh' },
                bgcolor: 'background.paper',
                p: 0,
                boxShadow: 24,
                borderRadius: 2,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                <Typography variant="h6" sx={{
                    p: { xs: 2, md: 3 },
                    pb: 2,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    fontSize: { xs: '1.1rem', md: '1.25rem' },
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1
                }}>
                    <SearchIcon color="primary" />
                    Scan for Devices
                </Typography>

                <Box sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', md: 'row' },
                    flex: 1,
                    overflow: 'hidden',
                    minHeight: 0
                }}>
                    {/* Left side - Scan types list (Desktop only) */}
                    <Box sx={{
                        width: { md: 280 },
                        borderRight: { md: '1px solid' },
                        borderColor: 'divider',
                        overflowY: 'auto',
                        bgcolor: 'action.hover',
                        display: { xs: 'none', md: 'block' }
                    }}>
                        <Typography variant="subtitle2" sx={{ p: 2, pb: 1, fontWeight: 'bold', color: 'text.secondary' }}>
                            Select Scan Type
                        </Typography>
                        {scanTypes.map((scanType) => (
                            <Box
                                key={scanType.value}
                                onClick={() => setSelectedScanType(scanType.value)}
                                sx={{
                                    p: 2,
                                    mx: 1,
                                    mb: 1,
                                    borderRadius: 1,
                                    cursor: 'pointer',
                                    bgcolor: selectedScanType === scanType.value ? scanType.color : 'transparent',
                                    color: selectedScanType === scanType.value ? 'white' : 'text.primary',
                                    '&:hover': {
                                        bgcolor: selectedScanType === scanType.value ? scanType.color : 'action.hover'
                                    },
                                    transition: 'all 0.2s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1
                                }}
                            >
                                <Box sx={{
                                    color: selectedScanType === scanType.value ? 'white' : scanType.color,
                                    display: 'flex',
                                    alignItems: 'center'
                                }}>
                                    {scanType.icon}
                                </Box>
                                <Box sx={{ flex: 1 }}>
                                    <Typography variant="body2" fontWeight={selectedScanType === scanType.value ? 'bold' : 'medium'}>
                                        {scanType.name}
                                    </Typography>
                                    <Typography variant="caption" sx={{
                                        opacity: selectedScanType === scanType.value ? 0.9 : 0.7,
                                        display: 'block'
                                    }}>
                                        {scanType.desc}
                                    </Typography>
                                </Box>
                            </Box>
                        ))}
                    </Box>

                    {/* Configuration form */}
                    <Box sx={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        order: { xs: 1, md: 2 }
                    }}>
                        <Box sx={{
                            p: { xs: 2, md: 3 },
                            overflowY: 'auto',
                            flex: 1
                        }}>
                            {/* Mobile scan type selection */}
                            <Box sx={{ display: { xs: 'block', md: 'none' }, mb: 3 }}>
                                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                                    Choose Scan Type
                                </Typography>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    {scanTypes.map((scanType) => (
                                        <Box
                                            key={scanType.value}
                                            onClick={() => setSelectedScanType(scanType.value)}
                                            sx={{
                                                p: 2,
                                                borderRadius: 1,
                                                cursor: 'pointer',
                                                border: '2px solid',
                                                borderColor: selectedScanType === scanType.value ? scanType.color : 'divider',
                                                bgcolor: selectedScanType === scanType.value ? `${scanType.color}15` : 'transparent',
                                                '&:hover': {
                                                    borderColor: scanType.color,
                                                    bgcolor: `${scanType.color}10`
                                                },
                                                transition: 'all 0.2s',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 2
                                            }}
                                        >
                                            <Box sx={{
                                                color: scanType.color,
                                                display: 'flex',
                                                alignItems: 'center'
                                            }}>
                                                {scanType.icon}
                                            </Box>
                                            <Box sx={{ flex: 1 }}>
                                                <Typography variant="body2" fontWeight="medium">
                                                    {scanType.name}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {scanType.desc}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    ))}
                                </Box>
                            </Box>

                            {/* Scan options - only show for COM port scans */}
                            {selectedScanType === 'com' && (
                                <Box sx={{ mb: 3 }}>
                                    <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                                        COM Port Scan Options
                                    </Typography>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        <TextField
                                            fullWidth
                                            size="small"
                                            label="Baud Rate"
                                            type="number"
                                            value={scanOptions.baudRate}
                                            onChange={(e) => handleOptionChange('baudRate', parseInt(e.target.value))}
                                            helperText="Communication speed (common: 9600, 115200)"
                                        />
                                        <TextField
                                            fullWidth
                                            size="small"
                                            label="Timeout (ms)"
                                            type="number"
                                            value={scanOptions.timeoutMs}
                                            onChange={(e) => handleOptionChange('timeoutMs', parseInt(e.target.value))}
                                            helperText="How long to wait for device response"
                                        />
                                        <FormControlLabel
                                            control={
                                                <Checkbox
                                                    checked={scanOptions.includeDetails}
                                                    onChange={(e) => handleOptionChange('includeDetails', e.target.checked)}
                                                />
                                            }
                                            label="Fetch detailed device information"
                                        />
                                    </Box>
                                </Box>
                            )}

                            {/* General scan options for other scan types */}
                            {selectedScanType && selectedScanType !== 'com' && (
                                <Box sx={{ mb: 3 }}>
                                    <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                                        Scan Options
                                    </Typography>
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={scanOptions.includeDetails}
                                                onChange={(e) => handleOptionChange('includeDetails', e.target.checked)}
                                            />
                                        }
                                        label="Fetch detailed device information during scan"
                                    />
                                </Box>
                            )}
                        </Box>

                        {/* Instructions - responsive height - Hide on mobile */}
                        {selectedScanType && (
                            <Box sx={{
                                display: { xs: 'none', md: 'block' },
                                borderTop: '1px solid',
                                borderColor: 'divider'
                            }}>
                                {/* Always Visible Header */}
                                <Box sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    p: 2,
                                    bgcolor: 'action.hover',
                                    cursor: 'pointer',
                                    '&:hover': {
                                        bgcolor: 'action.selected'
                                    }
                                }}
                                    onClick={() => setSetupInstructionsMinimized(!setupInstructionsMinimized)}
                                >
                                    <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
                                        Scan Information
                                    </Typography>
                                    <IconButton size="small" sx={{ p: 0 }}>
                                        {setupInstructionsMinimized ? <ExpandMoreIcon /> : <MinimizeIcon />}
                                    </IconButton>
                                </Box>

                                {/* Collapsible Content */}
                                {!setupInstructionsMinimized && (
                                    <Box sx={{
                                        maxHeight: '300px',
                                        p: 3,
                                        overflowY: 'auto',
                                        bgcolor: 'background.default'
                                    }}>
                                        <SetupInstructions_Scan scanType={selectedScanType} />
                                    </Box>
                                )}
                            </Box>
                        )}

                        {/* Action buttons - responsive layout */}
                        <Box sx={{
                            p: { xs: 2, md: 3 },
                            borderTop: '1px solid',
                            borderColor: 'divider',
                            display: "flex",
                            flexDirection: { xs: 'column', sm: 'row' },
                            gap: { xs: 1, sm: 2 },
                            flexShrink: 0
                        }}>
                            <Button
                                variant="contained"
                                onClick={handleScanStart}
                                size="small"
                                startIcon={<SearchIcon />}
                                disabled={scanning || !selectedScanType}
                                sx={{
                                    width: { xs: '100%', sm: 'auto' }
                                }}
                            >
                                {scanning ? "Scanning..." : `Start ${selectedScanType ? scanTypes.find(t => t.value === selectedScanType)?.name : 'Scan'}`}
                            </Button>
                            <Button
                                variant="outlined"
                                onClick={onClose}
                                size="small"
                                disabled={scanning}
                                sx={{ width: { xs: '100%', sm: 'auto' } }}
                            >
                                Cancel
                            </Button>
                        </Box>
                    </Box>
                </Box>
            </Box>
        </Modal>
    );
};

export default Device_ScanModal;