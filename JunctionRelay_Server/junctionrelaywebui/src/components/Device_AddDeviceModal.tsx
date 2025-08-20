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

import React, { useState, useEffect } from "react";
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
    Modal,
    Alert,
} from "@mui/material";

// Icon imports
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';

interface Device_AddDeviceModalProps {
    open: boolean;
    onClose: () => void;
    deviceIp: string;
    instance: string;
    onDeviceAdded: () => void;
}

const Device_AddDeviceModal: React.FC<Device_AddDeviceModalProps> = ({
    open,
    onClose,
    deviceIp,
    instance,
    onDeviceAdded
}) => {
    const [loading, setLoading] = useState<boolean>(true);
    const [deviceInfo, setDeviceInfo] = useState<any>(null);
    const [capabilities, setCapabilities] = useState<any>(null);
    const [error, setError] = useState<string>("");
    const [configureAfterAdd, setConfigureAfterAdd] = useState<boolean>(false);

    // Fetch device info and capabilities when modal opens
    useEffect(() => {
        const fetchInfoAndCapabilities = async () => {
            try {
                if (!deviceIp) throw new Error("Device IP not provided.");

                const [infoRes, capRes] = await Promise.all([
                    fetch(`/api/devices/info?ip=${encodeURIComponent(deviceIp)}`),
                    fetch(`/api/devices/capabilities?ip=${encodeURIComponent(deviceIp)}`)
                ]);

                if (!infoRes.ok || !capRes.ok) {
                    throw new Error("Failed to fetch device info or capabilities");
                }

                const infoJson = await infoRes.json();
                const capJson = await capRes.json();

                setDeviceInfo(infoJson.deviceInfo);
                setCapabilities(capJson.capabilities);
            } catch (err: any) {
                console.error("Error fetching device information:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (deviceIp && open) {
            setLoading(true);
            setError("");
            fetchInfoAndCapabilities();
        }
    }, [deviceIp, open]);

    // Handle adding the device
    const handleAdd = async (redirectToConfigure: boolean) => {
        setConfigureAfterAdd(redirectToConfigure);
        setLoading(true);

        try {
            const response = await fetch(
                `/api/devices/add-from-ip?ip=${encodeURIComponent(deviceIp!)}&instance=${encodeURIComponent(instance || "")}`,
                { method: "POST" }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || "Error adding device");
            }

            const newId = result.id || result.Id;
            onDeviceAdded();

            if (redirectToConfigure) {
                window.location.href = `/configure-device/${newId}`;
            } else {
                window.location.href = "/devices";
            }
        } catch (err: any) {
            console.error("Add device failed:", err);
            setError("Error adding device. Please try again.");
            setLoading(false);
        }
    };

    // Render object fields as table rows
    const renderObjectFields = (obj: any) => {
        if (!obj) return null;

        return Object.entries(obj).map(([key, value]) => (
            <TableRow key={key}>
                <TableCell sx={{ fontWeight: 'medium' }}>{key}</TableCell>
                <TableCell>
                    {value === null || value === undefined
                        ? "—"  // Em dash for null or undefined values
                        : typeof value === 'boolean'
                            ? (value ? "Yes" : "No")
                            : typeof value === 'string' || typeof value === 'number'
                                ? String(value)
                                : String(value) // Convert any other type directly to string
                    }
                </TableCell>
            </TableRow>
        ));
    };

    return (
        <Modal open={open} onClose={onClose}>
            <Box
                sx={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: { xs: "90%", sm: "80%", md: "70%" },
                    maxWidth: 1000,
                    bgcolor: "background.paper",
                    p: 4,
                    boxShadow: 24,
                    borderRadius: 2,
                    maxHeight: "80vh",
                    overflow: "auto"
                }}
            >
                {/* Modal Header */}
                <Typography variant="h6" gutterBottom sx={{ mb: 3 }}>
                    Add Device: {instance || deviceIp}
                </Typography>

                {loading ? (
                    /* Loading State */
                    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", p: 4 }}>
                        <CircularProgress size={32} />
                        <Typography variant="body1" sx={{ ml: 2 }}>
                            Fetching device information...
                        </Typography>
                    </Box>
                ) : error ? (
                    /* Error State */
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                ) : (
                    /* Device Information Display */
                    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 3 }}>
                        {/* Device Info Card */}
                        <Card sx={{
                            flex: 1,
                            minWidth: { xs: "100%", md: "45%" },
                            maxHeight: 400,
                            overflow: "auto"
                        }}>
                            <CardContent>
                                <Typography variant="h6" sx={{ mb: 2, color: 'primary.main' }}>
                                    Device Information
                                </Typography>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{ fontWeight: 'bold' }}>Field</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold' }}>Value</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {renderObjectFields(deviceInfo)}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>

                        {/* Device Capabilities Card */}
                        <Card sx={{
                            flex: 1,
                            minWidth: { xs: "100%", md: "45%" },
                            maxHeight: 400,
                            overflow: "auto"
                        }}>
                            <CardContent>
                                <Typography variant="h6" sx={{ mb: 2, color: 'secondary.main' }}>
                                    Device Capabilities
                                </Typography>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{ fontWeight: 'bold' }}>Capability</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold' }}>Supported</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {renderObjectFields(capabilities)}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </Box>
                )}

                {/* Action Buttons */}
                <Box sx={{
                    display: "flex",
                    gap: 2,
                    mt: 3,
                    flexDirection: { xs: 'column', sm: 'row' },
                    justifyContent: 'flex-end'
                }}>
                    <Button
                        variant="outlined"
                        onClick={onClose}
                        size="small"
                        disabled={loading}
                        sx={{ order: { xs: 3, sm: 1 } }}
                    >
                        Cancel
                    </Button>

                    <Button
                        variant="contained"
                        onClick={() => handleAdd(false)}
                        startIcon={<AddIcon />}
                        size="small"
                        disabled={loading || !!error}
                        sx={{ order: { xs: 2, sm: 2 } }}
                    >
                        {loading && !configureAfterAdd ? "Adding..." : "Add Device"}
                    </Button>

                    <Button
                        variant="contained"
                        color="secondary"
                        onClick={() => handleAdd(true)}
                        startIcon={<EditIcon />}
                        size="small"
                        disabled={loading || !!error}
                        sx={{ order: { xs: 1, sm: 3 } }}
                    >
                        {loading && configureAfterAdd ? "Adding..." : "Add & Configure"}
                    </Button>
                </Box>

                {/* Additional Information */}
                {!loading && !error && (
                    <Box sx={{ mt: 3, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Note:</strong> This device appears to be running JunctionRelay firmware.
                            You can add it directly to your system or add and configure it immediately.
                        </Typography>
                    </Box>
                )}
            </Box>
        </Modal>
    );
};

export default Device_AddDeviceModal;