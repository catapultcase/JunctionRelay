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

import React, { useState, useEffect } from "react";
import {
    Typography, Box, Paper, Button, Table, TableHead, TableRow,
    TableCell, TableBody, TableContainer, Chip, CircularProgress
} from "@mui/material";
import SensorsIcon from '@mui/icons-material/Sensors';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import DataUsageIcon from '@mui/icons-material/DataUsage';

interface DeviceSensorsPanelProps {
    deviceId: string;
    deviceData: any;
    newSensors: any[];
    setNewSensors: (sensors: any[]) => void;
    showSnackbar: (message: string, severity: "success" | "error" | "warning" | "info") => void;
}

const DeviceSensorsPanel: React.FC<DeviceSensorsPanelProps> = ({
    deviceId,
    deviceData,
    newSensors,
    setNewSensors,
    showSnackbar
}) => {
    const [loading, setLoading] = useState(false);
    const [refreshingSensors, setRefreshingSensors] = useState(false);
    const [sensorData, setSensorData] = useState<any[]>([]);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // Initial load of sensor data
    useEffect(() => {
        if (deviceData?.sensors) {
            setSensorData(deviceData.sensors);
            setLastUpdated(new Date());
        }
    }, [deviceData]);

    // Handle refreshing sensors
    const handleRefreshSensors = async () => {
        try {
            setRefreshingSensors(true);
            const isHost = deviceData.type === "Host Device";
            const res = await fetch(`/api/devices/${deviceId}/delta?isHostDevice=${isHost}`);
            if (!res.ok) throw new Error("Failed to fetch delta sensors.");
            const sensors = await res.json();
            setNewSensors(sensors);
            setLastUpdated(new Date());

            if (sensors.length > 0) {
                showSnackbar(`Found ${sensors.length} new sensor${sensors.length > 1 ? 's' : ''}`, "info");
            } else {
                showSnackbar("No new sensors found", "info");
            }
        } catch (err) {
            console.error(err);
            showSnackbar("Failed to refresh sensors", "error");
        } finally {
            setRefreshingSensors(false);
        }
    };

    // Handle adding sensor to database
    const handleAddToDatabase = async (sensorId: string) => {
        try {
            setLoading(true);
            const sensor = newSensors.find(s => s.externalId === sensorId);
            if (!sensor) {
                showSnackbar("Sensor not found", "error");
                return;
            }

            const payload = { ...sensor, deviceId };
            const res = await fetch(`/api/sensors/devices/${deviceId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Failed to add sensor");

            // Remove the added sensor from the newSensors list
            setNewSensors(newSensors.filter(s => s.externalId !== sensorId));

            // Add the sensor to the displayed sensor data
            const addedSensor = await res.json();
            setSensorData([...sensorData, addedSensor]);

            showSnackbar(`Sensor "${sensor.name}" added to database`, "success");
        } catch (err: any) {
            console.error(err);
            showSnackbar("Failed to add sensor", "error");
        } finally {
            setLoading(false);
        }
    };

    // Format the last updated time
    const formatLastUpdated = () => {
        if (!lastUpdated) return "Never";
        return lastUpdated.toLocaleTimeString();
    };

    return (
        <Box>
            {/* Actions Bar */}
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
                <Typography variant="subtitle1">
                    Last refreshed: {formatLastUpdated()}
                </Typography>
                <Button
                    variant="outlined"
                    startIcon={<RefreshIcon />}
                    onClick={handleRefreshSensors}
                    disabled={refreshingSensors}
                >
                    {refreshingSensors ? "Refreshing..." : "Refresh Sensors"}
                </Button>
            </Box>

            {/* New Sensors Panel */}
            {newSensors.length > 0 && (
                <Paper elevation={2} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
                    <Typography variant="subtitle1" gutterBottom sx={{
                        display: 'flex',
                        alignItems: 'center',
                        mb: 2
                    }}>
                        <AddCircleIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                        New Sensors Available
                    </Typography>

                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Sensor Name</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>External ID</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Units</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Action</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {newSensors.map(sensor => (
                                    <TableRow key={sensor.externalId}>
                                        <TableCell>{sensor.name}</TableCell>
                                        <TableCell>{sensor.externalId}</TableCell>
                                        <TableCell>{sensor.unit || "—"}</TableCell>
                                        <TableCell>
                                            <Button
                                                variant="contained"
                                                size="small"
                                                onClick={() => handleAddToDatabase(sensor.externalId)}
                                                disabled={loading}
                                            >
                                                Add to Database
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            )}

            {/* Current Device Sensors */}
            <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
                <Typography variant="subtitle1" gutterBottom sx={{
                    display: 'flex',
                    alignItems: 'center',
                    mb: 2
                }}>
                    <SensorsIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                    Device Sensors
                </Typography>

                {loading ? (
                    <Box display="flex" justifyContent="center" my={4}>
                        <CircularProgress size={40} />
                    </Box>
                ) : (
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Sensor Name</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Value</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Units</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Type</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>Status</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {sensorData && sensorData.length > 0 ? (
                                    sensorData.map((sensor: any) => (
                                        <TableRow key={sensor.id}>
                                            <TableCell>{sensor.name}</TableCell>
                                            <TableCell>
                                                <Typography fontWeight="medium">
                                                    {sensor.value !== undefined && sensor.value !== null ?
                                                        sensor.value : '—'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>{sensor.unit || "—"}</TableCell>
                                            <TableCell>{sensor.sensorType || "—"}</TableCell>
                                            <TableCell>
                                                {sensor.isActive ? (
                                                    <Chip
                                                        label="Active"
                                                        size="small"
                                                        color="success"
                                                        variant="outlined"
                                                    />
                                                ) : (
                                                    <Chip
                                                        label="Inactive"
                                                        size="small"
                                                        color="default"
                                                        variant="outlined"
                                                    />
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} align="center">
                                            <Typography variant="body2" color="text.secondary">
                                                No sensors configured for this device
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            {/* Sensor Statistics Panel */}
            <Paper elevation={2} sx={{ p: 3, mt: 3, borderRadius: 2 }}>
                <Typography variant="subtitle1" gutterBottom sx={{
                    display: 'flex',
                    alignItems: 'center',
                    mb: 2
                }}>
                    <DataUsageIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                    Sensor Statistics
                </Typography>

                <Box display="flex" flexWrap="wrap" gap={3}>
                    <Box
                        sx={{
                            p: 2,
                            borderRadius: 1,
                            backgroundColor: '#f5f5f5',
                            minWidth: 150,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center'
                        }}
                    >
                        <Typography variant="h4" fontWeight="bold" color="primary">
                            {sensorData?.length || 0}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Total Sensors
                        </Typography>
                    </Box>

                    <Box
                        sx={{
                            p: 2,
                            borderRadius: 1,
                            backgroundColor: '#f5f5f5',
                            minWidth: 150,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center'
                        }}
                    >
                        <Typography variant="h4" fontWeight="bold" color="success.main">
                            {sensorData?.filter(s => s.isActive)?.length || 0}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Active Sensors
                        </Typography>
                    </Box>

                    <Box
                        sx={{
                            p: 2,
                            borderRadius: 1,
                            backgroundColor: '#f5f5f5',
                            minWidth: 150,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center'
                        }}
                    >
                        <Typography variant="h4" fontWeight="bold" color="warning.main">
                            {newSensors?.length || 0}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Pending Sensors
                        </Typography>
                    </Box>
                </Box>
            </Paper>
        </Box>
    );
};

export default DeviceSensorsPanel;