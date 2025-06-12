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

import React, { useState, useRef, useEffect } from "react";
import {
    Typography,
    Button,
    TextField,
    Box,
    Paper
} from "@mui/material";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from "recharts";

// Updated SensorData interface to match the backend response
interface SensorData {
    name: string;
    sensorType: string;
    value: number | string;
    componentName: string;
    unit?: string;
    externalId: string;
}

// Helper function to sanitize special numeric values
function sanitizeValue(value: number | string): number | string {
    if (typeof value === "number") {
        if (Number.isNaN(value) || !Number.isFinite(value)) {
            return "N/A";
        }
        return value;
    } else {
        const asNumber = parseFloat(value);
        if (Number.isNaN(asNumber) || !Number.isFinite(asNumber)) {
            return "N/A";
        }
        return asNumber;
    }
}

const HostCharts: React.FC = () => {
    const [isPolling, setIsPolling] = useState<boolean>(false);
    const [refreshRate, setRefreshRate] = useState<number>(3000);
    const [sampleRate, setSampleRate] = useState<number>(1000);
    const [sensors, setSensors] = useState<SensorData[]>([]);
    const pollingRef = useRef<NodeJS.Timeout | null>(null);

    // Fetch sensor data from the backend
    const fetchSensors = async () => {
        try {
            const response = await fetch(`/api/Controller_HostInfo?sampleRate=${sampleRate}`);
            const data = (await response.json()) as SensorData[];

            const sanitized = data.map((sensor) => ({
                ...sensor,
                value: sanitizeValue(sensor.value),
                unit: sensor.unit ?? ""
            }));

            setSensors(sanitized);
        } catch (error) {
            console.error("Error fetching sensors:", error);
        }
    };

    // Start polling at the given refresh rate
    const handleStartPolling = () => {
        if (isPolling) return;
        setIsPolling(true);
        fetchSensors();
        pollingRef.current = setInterval(fetchSensors, refreshRate);
    };

    // Stop polling
    const handleStopPolling = () => {
        setIsPolling(false);
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    };

    useEffect(() => {
        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
            }
        };
    }, []);

    // CPU Load Chart
    const cpuSensors = sensors.filter((s) => {
        const isCpuComponent = s.componentName?.toLowerCase() === "cpu";
        const isLoadType = s.sensorType?.toLowerCase() === "load";
        const matchesCpuNumber = /^cpu\d+_load(?:_arm)?$/i.test(s.externalId);
        return isCpuComponent && isLoadType && matchesCpuNumber;
    });

    const cpuChartData = cpuSensors.map((sensor) => {
        const numericValue =
            typeof sensor.value === "number"
                ? sensor.value
                : parseFloat(sensor.value as string);
        const safeValue = Number.isFinite(numericValue) ? numericValue : 0;
        const cpuName = sensor.externalId.replace(/_load(?:_arm)?/i, "");
        return {
            cpu: cpuName,
            load: safeValue
        };
    });

    // Disk Read/Write Speeds
    const diskSensors = sensors.filter((s) => s.componentName?.toLowerCase() === "disk");

    function extractBaseDiskName(sensorExternalId: string): string {
        const match = sensorExternalId.match(/^disk_(nvme\d+n\d+|sd[a-z])(?:p\d+)?_(read|write)_speed$/);
        return match ? match[1] : "";
    }

    function groupDiskData(sensorsArray: SensorData[]) {
        const result: Record<string, { read: number; write: number }> = {};

        for (const sensor of sensorsArray) {
            const baseDiskName = extractBaseDiskName(sensor.externalId);
            if (!baseDiskName) continue;

            if (!result[baseDiskName]) {
                result[baseDiskName] = { read: 0, write: 0 };
            }

            const isRead = sensor.externalId.includes("read_speed");
            const numericValue =
                typeof sensor.value === "number"
                    ? sensor.value
                    : parseFloat(sensor.value as string) || 0;

            if (isRead) result[baseDiskName].read = numericValue;
            else result[baseDiskName].write = numericValue;
        }

        return result;
    }

    const nvmeData = groupDiskData(diskSensors.filter((s) => s.externalId.includes("nvme")));
    const sataData = groupDiskData(diskSensors.filter((s) => /(^disk_sd[a-z]_)/i.test(s.externalId)));

    return (
        <div>
            <Typography variant="h4" gutterBottom>
                Host Charts
            </Typography>

            {/* Polling Controls */}
            <Box display="flex" flexDirection="row" flexWrap="wrap" gap={2} style={{ marginBottom: "16px" }}>
                <Box>
                    <Button
                        variant="contained"
                        color={isPolling ? "secondary" : "primary"}
                        onClick={handleStartPolling}
                    >
                        Start Polling
                    </Button>
                </Box>
                <Box>
                    <Button variant="contained" onClick={handleStopPolling}>
                        Stop Polling
                    </Button>
                </Box>
                <Box>
                    <TextField
                        label="Refresh Rate (ms)"
                        type="number"
                        value={refreshRate}
                        onChange={(e) => setRefreshRate(Number(e.target.value))}
                        style={{ width: 120 }}
                    />
                </Box>
                <Box>
                    <TextField
                        label="Sample Rate (ms)"
                        type="number"
                        value={sampleRate}
                        onChange={(e) => setSampleRate(Number(e.target.value))}
                        style={{ width: 120 }}
                    />
                </Box>
            </Box>

            {/* CPU Load Chart */}
            <Typography variant="h5" gutterBottom>
                CPU Load
            </Typography>
            <div style={{ width: "100%", height: 400 }}>
                <ResponsiveContainer>
                    <BarChart data={cpuChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="cpu" />
                        <YAxis domain={[0, 100]} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="load" fill="#8884d8" />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* NVMe Disks */}
            <Typography variant="h5" gutterBottom style={{ marginTop: "40px" }}>
                NVMe Disks
            </Typography>
            <Box display="flex" flexDirection="row" flexWrap="wrap" gap={2}>
                {Object.entries(nvmeData).map(([diskName, { read, write }]) => (
                    <Box key={diskName} style={{ padding: "16px", minWidth: "200px" }}>
                        <Paper style={{ padding: "16px", minWidth: "200px" }}>
                            <Typography variant="subtitle1">{diskName}</Typography>
                            <Typography style={{ color: read !== 0 ? "green" : undefined }}>
                                Read: {read.toFixed(1)} MB/s
                            </Typography>
                            <Typography style={{ color: write !== 0 ? "red" : undefined }}>
                                Write: {write.toFixed(1)} MB/s
                            </Typography>
                        </Paper>
                    </Box>
                ))}
            </Box>

            {/* SATA Disks */}
            <Typography variant="h5" gutterBottom style={{ marginTop: "40px" }}>
                SATA Disks
            </Typography>
            <Box display="flex" flexDirection="row" flexWrap="wrap" gap={2}>
                {Object.entries(sataData).map(([diskName, { read, write }]) => (
                    <Box key={diskName} style={{ padding: "16px", minWidth: "200px" }}>
                        <Paper style={{ padding: "16px", minWidth: "200px" }}>
                            <Typography variant="subtitle1">{diskName}</Typography>
                            <Typography style={{ color: read !== 0 ? "green" : undefined }}>
                                Read: {read.toFixed(1)} MB/s
                            </Typography>
                            <Typography style={{ color: write !== 0 ? "red" : undefined }}>
                                Write: {write.toFixed(1)} MB/s
                            </Typography>
                        </Paper>
                    </Box>
                ))}
            </Box>
        </div>
    );
};

export default HostCharts;
