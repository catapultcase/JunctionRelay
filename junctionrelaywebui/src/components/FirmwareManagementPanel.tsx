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
    Typography, Box, Button, Paper, Checkbox, FormControlLabel, Chip,
    Modal, FormControl, InputLabel, Select, MenuItem,
    LinearProgress, Alert, List, ListItem, ListItemText, CircularProgress
} from "@mui/material";
import UpdateIcon from '@mui/icons-material/Update';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import SecurityIcon from '@mui/icons-material/Security';
import VerifiedIcon from '@mui/icons-material/Verified';
import ErrorIcon from '@mui/icons-material/Error';
import { useFeatureFlags } from "../hooks/useFeatureFlags";

interface FirmwareManagementPanelProps {
    deviceId: string;
    currentFirmware: string;
    isJunctionRelayDevice: boolean;
    ignoreUpdates: boolean;
    hasCustomFirmware: boolean;
    refreshDeviceData: () => void;
    showSnackbar: (message: string, severity: "success" | "error" | "warning" | "info") => void;
    onUpdateIgnoreSettings: (ignore: boolean) => void;
    initialFirmwareInfo?: FirmwareInfo | null;
}

interface FirmwareInfo {
    current_version: string;
    latest_version: string;
    firmware_file: string;
    is_outdated: boolean;
    firmware_hash?: string;
}

interface DeviceRelease {
    name: string;
    assets: string[];
}

interface VerificationResult {
    device_id: number;
    firmware_hash: string;
    is_authentic: boolean;
    matching_firmware?: string;
    custom_firmware: boolean;
}

const modalStyle = {
    position: "absolute" as const,
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: 550,
    bgcolor: "background.paper",
    boxShadow: 24,
    p: 4,
    borderRadius: 2,
    maxHeight: "80vh",
    overflow: "auto"
};

const FirmwareManagementPanel: React.FC<FirmwareManagementPanelProps> = ({
    deviceId,
    currentFirmware,
    isJunctionRelayDevice,
    ignoreUpdates,
    hasCustomFirmware,
    refreshDeviceData,
    showSnackbar,
    onUpdateIgnoreSettings,
    initialFirmwareInfo = null
}) => {

    // Feature flags
    const flags = useFeatureFlags();
    const customFirmwareEnabled = flags?.custom_firmware_flashing === true;

    // State hooks
    const [loading, setLoading] = useState(false);
    const [checkingForUpdates, setCheckingForUpdates] = useState(false);
    const [firmwareInfo, setFirmwareInfo] = useState<FirmwareInfo | null>(initialFirmwareInfo);
    const [openUpdateModal, setOpenUpdateModal] = useState(false);
    const [selectedVersion, setSelectedVersion] = useState<string>("");
    const [deviceReleases, setDeviceReleases] = useState<DeviceRelease[]>([]);
    const [updating, setUpdating] = useState(false);
    const [customFirmwareModal, setCustomFirmwareModal] = useState(false);
    const [customFirmwareFile, setCustomFirmwareFile] = useState<File | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [forceUpdate, setForceUpdate] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);

    // NEW: Loading states and risk acceptance
    const [loadingReleases, setLoadingReleases] = useState(false);
    const [showRiskDialog, setShowRiskDialog] = useState(false);
    const [pendingUpdate, setPendingUpdate] = useState(false);

    // Extract version from release name (e.g., "ESP32 S3 OTA Firmware v0.6.8" -> "0.6.8")
    const extractVersionFromRelease = (releaseName: string): string => {
        const versionMatch = releaseName.match(/v?(\d+\.\d+\.\d+)/);
        return versionMatch ? versionMatch[1] : releaseName;
    };

    // Perform the actual firmware update
    const performFirmwareUpdate = useCallback(async () => {
        setUpdating(true);
        setShowRiskDialog(false);
        setPendingUpdate(false);

        try {
            console.log(`Starting firmware update for device ${deviceId} with version ${selectedVersion} and force=${forceUpdate}`);

            // Step 1: Get the device-specific firmware for the selected version
            const firmwareRes = await fetch(`/api/ota/firmware/${deviceId}?version=${encodeURIComponent(selectedVersion)}&force=${forceUpdate}`);
            if (!firmwareRes.ok) {
                const errorText = await firmwareRes.text();
                throw new Error(`Failed to get firmware: ${errorText || firmwareRes.statusText}`);
            }

            const firmwareBlob = await firmwareRes.blob();
            showSnackbar(`Device-compatible firmware v${selectedVersion} downloaded, beginning update process...`, "success");

            // Step 2: Upload firmware to the device
            try {
                const deviceInfoRes = await fetch(`/api/devices/${deviceId}`);
                if (!deviceInfoRes.ok) {
                    throw new Error("Failed to get device information");
                }

                const deviceInfo = await deviceInfoRes.json();
                const deviceIP = deviceInfo.ipAddress;

                if (!deviceIP) {
                    throw new Error("Device IP address not found");
                }

                const formData = new FormData();
                formData.append("file", firmwareBlob, "firmware.bin");

                await fetch(`http://${deviceIP}/api/ota/firmware`, {
                    method: "POST",
                    body: formData
                });

                showSnackbar(`Firmware v${selectedVersion} uploaded to device, completing update...`, "success");
            } catch (uploadError) {
                console.warn("Expected disconnection during update:", uploadError);
            }

            // Step 3: Poll for update completion
            const pollRes = await fetch(`/api/ota/poll-for-update/${deviceId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    force: forceUpdate,
                    version: selectedVersion
                })
            });

            if (pollRes.ok) {
                const pollData = await pollRes.json();

                if (pollData.updated) {
                    showSnackbar(`Device updated to firmware version ${pollData.version}`, "success");
                    setTimeout(() => {
                        refreshDeviceData();
                    }, 1000);
                } else {
                    showSnackbar(pollData.message || `Update process initiated for version ${selectedVersion}`, "success");
                }
            } else {
                const errorText = await pollRes.text();
                throw new Error(`Error polling for update status: ${errorText}`);
            }
        } catch (error) {
            console.error("Error updating firmware:", error);
            showSnackbar(`Update failed: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
        } finally {
            setUpdating(false);
            setOpenUpdateModal(false);
        }
    }, [deviceId, selectedVersion, forceUpdate, showSnackbar, refreshDeviceData]);

    // Set initial firmware info when prop changes
    useEffect(() => {
        if (initialFirmwareInfo) {
            setFirmwareInfo(initialFirmwareInfo);
        }
    }, [initialFirmwareInfo]);

    // Verify firmware authenticity
    const verifyFirmware = useCallback(async () => {
        if (!isJunctionRelayDevice) {
            showSnackbar("Firmware verification is only available for Junction Relay devices", "error");
            return;
        }

        setVerifying(true);
        try {
            const response = await fetch(`/api/ota/verify-firmware/${deviceId}`, {
                method: 'POST'
            });

            if (!response.ok) {
                if (response.status === 404) {
                    showSnackbar("Device not found or unreachable", "error");
                    return;
                }
                if (response.status === 500) {
                    const errorText = await response.text();
                    throw new Error(errorText || "Verification failed");
                }
                throw new Error(`Verification failed: ${response.statusText}`);
            }

            const result: VerificationResult = await response.json();
            setVerificationResult(result);

            if (result.is_authentic) {
                showSnackbar("✓ Firmware verified as authentic", "success");
            } else {
                showSnackbar("⚠ Unable to verify firmware", "warning");
            }

            setTimeout(() => {
                refreshDeviceData();
            }, 1000);

        } catch (error) {
            console.error("Error verifying firmware:", error);
            showSnackbar(`Verification failed: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
        } finally {
            setVerifying(false);
        }
    }, [deviceId, isJunctionRelayDevice, showSnackbar, refreshDeviceData]);

    // Check if firmware updates are available
    const checkForUpdates = useCallback(async (forceCheck: boolean = false) => {
        if (!isJunctionRelayDevice) {
            showSnackbar("Firmware updates are only available for Junction Relay devices", "error");
            return;
        }

        setCheckingForUpdates(true);
        try {
            const endpoint = `/api/ota/check/${deviceId}?force=${forceCheck}`;
            const response = await fetch(endpoint);

            if (!response.ok) {
                if (response.status === 429) {
                    showSnackbar("Rate limit reached, please try again in a few minutes", "warning");
                    return;
                }
                if (response.status === 404) {
                    setFirmwareInfo(null);
                    return;
                }
                throw new Error("Failed to check for updates");
            }

            const data = await response.json();
            setFirmwareInfo(data);

            if (forceCheck && data.is_outdated) {
                showSnackbar(`Firmware update available: v${data.latest_version}`, "success");
            } else if (forceCheck && !data.is_outdated) {
                showSnackbar("Your firmware is up to date", "success");
            }
        } catch (error) {
            console.error("Error checking for updates:", error);
            showSnackbar("Failed to check for updates", "error");
        } finally {
            setCheckingForUpdates(false);
        }
    }, [deviceId, isJunctionRelayDevice, showSnackbar]);

    // Fetch available releases when modal opens
    useEffect(() => {
        if (openUpdateModal) {
            const fetchReleases = async () => {
                try {
                    const response = await fetch(`/api/ota/releases/${deviceId}?forceRefresh=true`);

                    if (!response.ok) {
                        if (response.status === 404) {
                            setDeviceReleases([]);
                            return;
                        }
                        if (response.status === 429) {
                            setDeviceReleases([]);
                            showSnackbar("Rate limit reached, please try again later", "warning");
                            return;
                        }
                        throw new Error(`Failed to fetch device releases: ${response.status}`);
                    }

                    const data = await response.json();

                    let processedReleases: DeviceRelease[] = [];
                    if (Array.isArray(data)) {
                        processedReleases = data.map((release: any) => ({
                            name: release.name || 'Unknown Release',
                            assets: Array.isArray(release.assets) ? release.assets : []
                        }));
                    }

                    const validReleases = processedReleases.filter(release =>
                        release.assets && release.assets.length > 0
                    );

                    if (validReleases.length > 0) {
                        setDeviceReleases(validReleases);
                        setSelectedVersion(extractVersionFromRelease(validReleases[0].name));
                    } else {
                        setDeviceReleases([]);
                    }
                } catch (error) {
                    console.error("Error fetching device releases:", error);
                    setDeviceReleases([]);
                    showSnackbar("Network error while fetching firmware releases", "error");
                }
            };

            fetchReleases();
        }
    }, [openUpdateModal, deviceId, showSnackbar]);

    // Handle notification preference change
    const handleNotificationChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newIgnoreUpdates = !event.target.checked;
        onUpdateIgnoreSettings(newIgnoreUpdates);
    };

    // Get selected release details by version
    const getSelectedReleaseDetails = () => {
        return deviceReleases.find(release =>
            extractVersionFromRelease(release.name) === selectedVersion
        );
    };

    // Handle firmware update
    const updateFirmware = async () => {
        if (!selectedVersion) {
            showSnackbar("Please select a version", "error");
            return;
        }

        const selectedReleaseDetails = getSelectedReleaseDetails();
        if (!selectedReleaseDetails) {
            showSnackbar("Selected release not found", "error");
            return;
        }

        setUpdating(true);
        try {
            console.log(`Starting firmware update for device ${deviceId} with version ${selectedVersion} and force=${forceUpdate}`);

            // Step 1: Get the device-specific firmware for the selected version
            const firmwareRes = await fetch(`/api/ota/firmware/${deviceId}?version=${encodeURIComponent(selectedVersion)}&force=${forceUpdate}`);
            if (!firmwareRes.ok) {
                const errorText = await firmwareRes.text();
                throw new Error(`Failed to get firmware: ${errorText || firmwareRes.statusText}`);
            }

            const firmwareBlob = await firmwareRes.blob();
            showSnackbar(`Device-compatible firmware v${selectedVersion} downloaded, beginning update process...`, "success");

            // Step 2: Upload firmware to the device
            try {
                const deviceInfoRes = await fetch(`/api/devices/${deviceId}`);
                if (!deviceInfoRes.ok) {
                    throw new Error("Failed to get device information");
                }

                const deviceInfo = await deviceInfoRes.json();
                const deviceIP = deviceInfo.ipAddress;

                if (!deviceIP) {
                    throw new Error("Device IP address not found");
                }

                const formData = new FormData();
                formData.append("file", firmwareBlob, "firmware.bin");

                await fetch(`http://${deviceIP}/api/ota/firmware`, {
                    method: "POST",
                    body: formData
                });

                showSnackbar(`Firmware v${selectedVersion} uploaded to device, completing update...`, "success");
            } catch (uploadError) {
                console.warn("Expected disconnection during update:", uploadError);
            }

            // Step 3: Poll for update completion
            const pollRes = await fetch(`/api/ota/poll-for-update/${deviceId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    force: forceUpdate,
                    version: selectedVersion
                })
            });

            if (pollRes.ok) {
                const pollData = await pollRes.json();

                if (pollData.updated) {
                    showSnackbar(`Device updated to firmware version ${pollData.version}`, "success");
                    setTimeout(() => {
                        refreshDeviceData();
                    }, 1000);
                } else {
                    showSnackbar(pollData.message || `Update process initiated for version ${selectedVersion}`, "success");
                }
            } else {
                const errorText = await pollRes.text();
                throw new Error(`Error polling for update status: ${errorText}`);
            }
        } catch (error) {
            console.error("Error updating firmware:", error);
            showSnackbar(`Update failed: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
        } finally {
            setUpdating(false);
            setOpenUpdateModal(false);
        }
    };

    // Handle custom firmware upload
    const handleCustomFirmwareUpload = async () => {
        if (!customFirmwareFile) {
            showSnackbar("Please select a firmware file", "error");
            return;
        }

        setUploadProgress(0);
        setLoading(true);

        try {
            const formData = new FormData();
            formData.append("firmwareFile", customFirmwareFile);

            const xhr = new XMLHttpRequest();
            xhr.open("POST", `/api/ota/upload/${deviceId}`);

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const progress = Math.round((event.loaded / event.total) * 100);
                    setUploadProgress(progress);
                }
            };

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    showSnackbar("Custom firmware uploaded successfully", "success");
                    setCustomFirmwareModal(false);
                    refreshDeviceData();
                } else {
                    throw new Error(`Upload failed with status: ${xhr.status}`);
                }
            };

            xhr.onerror = () => {
                throw new Error("Network error occurred during upload");
            };

            xhr.send(formData);
        } catch (error) {
            console.error("Error uploading custom firmware:", error);
            showSnackbar(`Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
        } finally {
            setLoading(false);
        }
    };

    // Get firmware authenticity chip

    const getFirmwareStatusChip = () => {
        // If we have a verification result, use that instead of the device's hasCustomFirmware flag
        if (verificationResult) {
            if (verificationResult.is_authentic) {
                return (
                    <Chip
                        icon={<VerifiedIcon />}
                        label="Verified Authentic"
                        color="success"
                        size="small"
                        sx={{ ml: 2 }}
                    />
                );
            } else {
                return (
                    <Chip
                        icon={<ErrorIcon />}
                        label="Unable to Verify Firmware"
                        color="warning"
                        size="small"
                        sx={{ ml: 2 }}
                    />
                );
            }
        }

        // Fallback to device's hasCustomFirmware flag if no verification has been run
        if (hasCustomFirmware) {
            return (
                <Chip
                    icon={<ErrorIcon />}
                    label="Unable to Verify Firmware"
                    color="warning"
                    size="small"
                    sx={{ ml: 2 }}
                />
            );
        } else {
            return (
                <Chip
                    icon={<VerifiedIcon />}
                    label="Authentic Firmware"
                    color="success"
                    size="small"
                    sx={{ ml: 2 }}
                />
            );
        }
    };

    return (
        <Box>
            {/* Firmware Info Panel */}
            <Paper elevation={2} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
                <Typography variant="subtitle1" gutterBottom sx={{
                    display: 'flex',
                    alignItems: 'center',
                    mb: 2
                }}>
                    <SystemUpdateAltIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                    Firmware Details
                </Typography>

                <Box sx={{ mb: 3 }}>
                    <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <strong>Current Firmware:</strong>
                        <Box component="span" sx={{ ml: 1 }}>
                            {currentFirmware || "Unknown"}
                        </Box>

                        {isJunctionRelayDevice && getFirmwareStatusChip()}

                        {firmwareInfo?.is_outdated === false && (
                            <Chip
                                icon={<CheckCircleIcon />}
                                label="Up to date"
                                color="success"
                                size="small"
                                sx={{ ml: 2 }}
                            />
                        )}
                        {firmwareInfo?.is_outdated === true && (
                            <Chip
                                icon={<WarningIcon />}
                                label="Update available"
                                color="warning"
                                size="small"
                                sx={{ ml: 2 }}
                            />
                        )}
                    </Typography>

                    {firmwareInfo && (
                        <Typography variant="body1" sx={{ mb: 2 }}>
                            <strong>Latest Official Firmware Version:</strong> {firmwareInfo.latest_version}
                        </Typography>
                    )}

                    {/* Show verification result if available */}
                    {verificationResult && (
                        <Box sx={{
                            mb: 2,
                            p: 2,
                            bgcolor: verificationResult.is_authentic ? 'success.light' : 'warning.light',
                            borderRadius: 1,
                            border: verificationResult.is_authentic ? '1px solid' : '2px solid',
                            borderColor: verificationResult.is_authentic ? 'success.main' : 'warning.main'
                        }}>
                            <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>
                                <strong>Last Verification Result:</strong>
                            </Typography>
                            <Typography variant="body2" sx={{ mb: 1 }}>
                                Hash: <code style={{ fontSize: '0.8rem' }}>{verificationResult.firmware_hash.substring(0, 16)}...</code>
                            </Typography>
                            <Typography variant="body2" sx={{
                                mb: 1,
                                color: verificationResult.is_authentic ? 'success.dark' : 'warning.dark',
                                fontWeight: 'bold'
                            }}>
                                Status: {verificationResult.is_authentic ? "✓ Verified as Authentic" : "⚠ Unable to Verify Firmware"}
                            </Typography>
                            {verificationResult.matching_firmware && (
                                <Typography variant="body2">
                                    Matches: {verificationResult.matching_firmware}
                                </Typography>
                            )}
                            {!verificationResult.is_authentic && (
                                <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic', color: 'warning.dark' }}>
                                    This firmware could not be verified against known authentic releases.
                                </Typography>
                            )}
                        </Box>
                    )}

                    {!isJunctionRelayDevice && (
                        <Alert severity="info" sx={{ mb: 2 }}>
                            <Typography variant="body2">
                                Firmware management is only available for Junction Relay devices
                            </Typography>
                        </Alert>
                    )}

                    {isJunctionRelayDevice && !firmwareInfo && (
                        <Alert severity="info" sx={{ mb: 2 }}>
                            <Typography variant="body2">
                                No firmware releases are currently available for this device model
                            </Typography>
                        </Alert>
                    )}

                    {/* Update Notification checkbox */}
                    {isJunctionRelayDevice && (
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={!ignoreUpdates}
                                    onChange={handleNotificationChange}
                                    disabled={!isJunctionRelayDevice}
                                />
                            }
                            label="Get Update Notifications"
                        />
                    )}
                </Box>

                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <Button
                        variant="outlined"
                        startIcon={<UpdateIcon />}
                        onClick={() => checkForUpdates(true)}
                        disabled={checkingForUpdates || !isJunctionRelayDevice}
                    >
                        {checkingForUpdates ? "Checking..." : "Check for Updates"}
                    </Button>

                    <Button
                        variant="outlined"
                        startIcon={verifying ? <CircularProgress size={16} /> : <SecurityIcon />}
                        onClick={verifyFirmware}
                        disabled={verifying || !isJunctionRelayDevice}
                        color="secondary"
                    >
                        {verifying ? "Verifying..." : "Verify Firmware"}
                    </Button>

                    <Button
                        variant="contained"
                        startIcon={<UpdateIcon />}
                        onClick={() => setOpenUpdateModal(true)}
                        disabled={!isJunctionRelayDevice}
                    >
                        Manage Firmware
                    </Button>

                    {customFirmwareEnabled && (
                        <Button
                            variant="outlined"
                            color="secondary"
                            startIcon={<UploadFileIcon />}
                            onClick={() => setCustomFirmwareModal(true)}
                            disabled={!isJunctionRelayDevice}
                        >
                            Upload Custom Firmware
                        </Button>
                    )}
                </Box>
            </Paper>

            {/* Update Guide */}
            <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
                <Typography variant="subtitle1" gutterBottom sx={{
                    display: 'flex',
                    alignItems: 'center',
                    mb: 2
                }}>
                    <InfoIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                    Firmware Management Guide
                </Typography>

                <Typography variant="body2" sx={{ mb: 2 }}>
                    Firmware updates provide bug fixes, new features, and improved performance. When a new version is available, you'll see an "Update available" indicator above.
                </Typography>

                <Typography variant="body2" sx={{ mb: 2 }}>
                    <strong>Firmware Management:</strong> Click "Manage Firmware" to view and install any firmware version available for your specific device model. Use "Force Flash" to install older versions or reflash the same version.
                </Typography>

                <Typography variant="body2" sx={{ mb: 2 }}>
                    <strong>Firmware Verification:</strong> Click "Verify Firmware" to check if your device is running authentic, unmodified firmware. This compares your device's firmware hash against known official releases.
                </Typography>

                <Typography variant="body2" sx={{ mb: 2 }}>
                    <strong>Custom firmware:</strong> Use "Upload Custom Firmware" only if you have received a firmware file directly from our team. Uploading incompatible firmware may damage your device.
                </Typography>

                <Typography variant="body2">
                    <strong>Note:</strong> Keep your device powered and connected during the update process. Updates typically take 2-5 minutes to complete.
                </Typography>
            </Paper>

            {/* Update Firmware Modal */}
            <Modal open={openUpdateModal} onClose={() => !updating && !loadingReleases && setOpenUpdateModal(false)}>
                <Paper sx={modalStyle}>
                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                        <SecurityIcon sx={{ mr: 1, color: 'success.main' }} />
                        Firmware Management (Device-Safe)
                    </Typography>

                    {loadingReleases ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
                            <LinearProgress sx={{ width: '100%', mb: 2 }} />
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                Loading available firmware releases...
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                Checking GitHub repository for device-compatible firmware
                            </Typography>
                        </Box>
                    ) : deviceReleases && deviceReleases.length > 0 ? (
                        <>
                            <Alert severity="success" sx={{ mb: 2 }}>
                                <Typography variant="body2">
                                    Found {deviceReleases.length} firmware release{deviceReleases.length !== 1 ? 's' : ''} compatible with your device model.
                                    You can flash any version using the "Force Flash" option.
                                </Typography>
                            </Alert>

                            {/* Show warning if device has custom firmware */}
                            {hasCustomFirmware && (
                                <Alert severity="warning" sx={{ mb: 2 }}>
                                    <Typography variant="body2">
                                        ⚠️ Your device firmware could not be verified. Flashing new firmware may require additional caution.
                                    </Typography>
                                </Alert>
                            )}

                            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                                <InputLabel>Select Compatible Version</InputLabel>
                                <Select
                                    label="Select Compatible Version"
                                    value={selectedVersion}
                                    onChange={e => setSelectedVersion(e.target.value as string)}
                                    disabled={updating}
                                >
                                    {deviceReleases.map((release, index) => {
                                        const version = extractVersionFromRelease(release.name);
                                        return (
                                            <MenuItem key={index} value={version}>
                                                {release.name}
                                            </MenuItem>
                                        );
                                    })}
                                </Select>
                            </FormControl>

                            {/* Show firmware files for the selected version */}
                            {selectedVersion && getSelectedReleaseDetails() && (
                                <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                                    <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center' }}>
                                        <FileDownloadIcon sx={{ mr: 1, fontSize: '1rem' }} />
                                        Device-Compatible Firmware Files:
                                    </Typography>
                                    <List dense>
                                        {getSelectedReleaseDetails()!.assets.map((asset: string, index: number) => (
                                            <ListItem key={index} sx={{ py: 0.5, px: 1 }}>
                                                <ListItemText
                                                    primary={
                                                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                            {asset}
                                                        </Typography>
                                                    }
                                                />
                                            </ListItem>
                                        ))}
                                    </List>
                                </Box>
                            )}

                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={forceUpdate}
                                        onChange={(e) => setForceUpdate(e.target.checked)}
                                        disabled={updating}
                                    />
                                }
                                label="Force Flash (allows flashing any version, including downgrades or same version)"
                            />

                            {updating && (
                                <Box sx={{ mb: 2, mt: 2 }}>
                                    <Typography variant="body2" gutterBottom>Updating firmware...</Typography>
                                    <LinearProgress />
                                </Box>
                            )}

                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
                                <Button
                                    onClick={() => setOpenUpdateModal(false)}
                                    disabled={updating}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="contained"
                                    onClick={updateFirmware}
                                    disabled={updating || !selectedVersion}
                                >
                                    {updating ? "Updating..." : "Flash Firmware"}
                                </Button>
                            </Box>
                        </>
                    ) : (
                        <Box>
                            <Alert severity="info" sx={{ mb: 2 }}>
                                <Typography variant="body2" sx={{ mb: 1 }}>
                                    <strong>No firmware releases found for this device model.</strong>
                                </Typography>
                                <Typography variant="body2">
                                    This could mean:
                                </Typography>
                                <Typography component="ul" variant="body2" sx={{ mt: 1, pl: 2 }}>
                                    <li>This device type doesn't have firmware in the current repository</li>
                                    <li>The device model name doesn't match the firmware naming convention</li>
                                    <li>Firmware may be available through other channels</li>
                                </Typography>
                            </Alert>

                            <Typography variant="body2" sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                                <strong>Device Target:</strong> Looking for firmware matching your device type
                            </Typography>

                            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <Button onClick={() => setOpenUpdateModal(false)}>
                                    Close
                                </Button>
                            </Box>
                        </Box>
                    )}
                </Paper>
            </Modal>

            {/* Risk Acceptance Dialog */}
            <Modal open={showRiskDialog} onClose={() => !pendingUpdate && setShowRiskDialog(false)}>
                <Paper sx={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 500,
                    bgcolor: "background.paper",
                    boxShadow: 24,
                    p: 4,
                    borderRadius: 2,
                }}>
                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', color: 'warning.main' }}>
                        <WarningIcon sx={{ mr: 1 }} />
                        Custom Firmware Risk Warning
                    </Typography>

                    <Alert severity="warning" sx={{ mb: 3 }}>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>⚠️ CAUTION:</strong> Your device firmware could not be verified.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            This could indicate custom firmware or verification issues. Flashing new firmware may:
                        </Typography>
                        <Typography component="ul" variant="body2" sx={{ mb: 2, pl: 2 }}>
                            <li>Cause unexpected behavior or device malfunction</li>
                            <li>Require manual recovery procedures</li>
                            <li>Potentially brick your device if incompatible</li>
                            <li>Void your warranty</li>
                        </Typography>
                        <Typography variant="body2">
                            <strong>Recommendation:</strong> Verify your firmware is authentic before proceeding, or contact support if needed.
                        </Typography>
                    </Alert>

                    <Typography variant="body2" sx={{ mb: 3, fontWeight: 'bold' }}>
                        Do you understand the risks and wish to proceed anyway?
                    </Typography>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                        <Button
                            variant="outlined"
                            onClick={() => {
                                setShowRiskDialog(false);
                                setPendingUpdate(false);
                            }}
                            disabled={pendingUpdate}
                            sx={{ flex: 1 }}
                        >
                            Cancel (Recommended)
                        </Button>
                        <Button
                            variant="contained"
                            color="warning"
                            onClick={performFirmwareUpdate}
                            disabled={pendingUpdate}
                            sx={{ flex: 1 }}
                        >
                            Accept Risk & Continue
                        </Button>
                    </Box>
                </Paper>
            </Modal>

            {/* Custom Firmware Upload Modal */}
            <Modal open={customFirmwareModal} onClose={() => !loading && setCustomFirmwareModal(false)}>
                <Paper sx={modalStyle}>
                    <Typography variant="h6" gutterBottom>Upload Custom Firmware</Typography>

                    <Box sx={{ mb: 3 }}>
                        <Alert severity="warning" sx={{ mb: 2 }}>
                            <Typography variant="body2">
                                Warning: Uploading custom firmware may void your warranty and could potentially damage your device.
                                Only upload firmware from trusted sources that is specifically designed for your device model.
                            </Typography>
                        </Alert>

                        <Box sx={{ mt: 2 }}>
                            <Button
                                variant="outlined"
                                component="label"
                                fullWidth
                            >
                                Select Firmware File (.bin)
                                <input
                                    type="file"
                                    hidden
                                    accept=".bin"
                                    onChange={(e) => {
                                        if (e.target.files && e.target.files[0]) {
                                            setCustomFirmwareFile(e.target.files[0]);
                                        }
                                    }}
                                />
                            </Button>
                            {customFirmwareFile && (
                                <Typography variant="body2" sx={{ mt: 1 }}>
                                    Selected: {customFirmwareFile.name} ({Math.round(customFirmwareFile.size / 1024)} KB)
                                </Typography>
                            )}
                        </Box>
                    </Box>

                    {loading && (
                        <Box sx={{ mb: 2 }}>
                            <Typography variant="body2" gutterBottom>
                                Uploading... {uploadProgress}%
                            </Typography>
                            <LinearProgress variant="determinate" value={uploadProgress} />
                        </Box>
                    )}

                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Button
                            onClick={() => setCustomFirmwareModal(false)}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="contained"
                            color="warning"
                            onClick={handleCustomFirmwareUpload}
                            disabled={loading || !customFirmwareFile}
                        >
                            {loading ? "Uploading..." : "Upload Firmware"}
                        </Button>
                    </Box>
                </Paper>
            </Modal>
        </Box>
    );
};

export default FirmwareManagementPanel;