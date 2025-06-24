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

import React, { useState, useRef, useEffect } from "react";
import {
    Typography,
    Button,
    TextField,
    Box,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody
} from "@mui/material";

// Updated SensorData interface to match backend
interface SensorData {
    name: string;
    sensorType: string;
    value: number | string;
    componentName: string;
    unit?: string;
    externalId: string;
}

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

const HostInfo: React.FC = () => {
    const [isPolling, setIsPolling] = useState<boolean>(false);
    const [refreshRate, setRefreshRate] = useState<number>(3000);
    const [sampleRate, setSampleRate] = useState<number>(1000);
    const [sensors, setSensors] = useState<SensorData[]>([]);
    const pollingRef = useRef<NodeJS.Timeout | null>(null);

    const fetchSensors = async () => {
        try {
            // Pass sampleRate as a query param
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

    const handleStartPolling = () => {
        if (isPolling) return;
        setIsPolling(true);

        // Fetch immediately
        fetchSensors();

        // Then poll at intervals
        pollingRef.current = setInterval(() => {
            fetchSensors();
        }, refreshRate);
    };

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

    // Group sensors by ComponentName
    const groupedSensors = sensors.reduce((acc, sensor) => {
        const key = sensor.componentName ?? "Unknown";
        if (!acc[key]) acc[key] = [];
        acc[key].push(sensor);
        return acc;
    }, {} as Record<string, SensorData[]>);

    return (
        <div>
            <Typography variant="h4" gutterBottom>
                Host Info
            </Typography>

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
                    <Button variant="contained" color="primary" onClick={handleStopPolling}>
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

            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell>Sensor</TableCell>
                        <TableCell>Value</TableCell>
                        <TableCell>Units</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {Object.keys(groupedSensors).map((category) => (
                        <React.Fragment key={category}>
                            <TableRow>
                                <TableCell colSpan={3} style={{ fontWeight: "bold" }}>
                                    {category}
                                </TableCell>
                            </TableRow>
                            {groupedSensors[category].map((sensor) => (
                                <TableRow key={sensor.externalId}>
                                    <TableCell>{sensor.name}</TableCell>
                                    <TableCell>{sensor.value}</TableCell>
                                    <TableCell>{sensor.unit}</TableCell>
                                </TableRow>
                            ))}
                        </React.Fragment>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
};

export default HostInfo;
