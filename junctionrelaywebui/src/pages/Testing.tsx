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

import {
    Typography,
    TextField,
    MenuItem,
    Select,
    InputLabel,
    FormControl,
    Box,
    Button,
    IconButton,
    Card,
    CardActionArea,
    CardContent
} from "@mui/material";
import { useEffect, useState } from "react";
import { SelectChangeEvent } from "@mui/material/Select";
import RefreshIcon from "@mui/icons-material/Refresh";

// Define a Device interface to represent a WiFi device
interface Device {
    id: number;
    name: string;
    ipAddress: string;
}

const Testing = () => {
    const [targetType, setTargetType] = useState<string>("");
    const [targetAddress, setTargetAddress] = useState<string>(""); // used for manual input if needed
    const [selectedComPort, setSelectedComPort] = useState<string>("");
    const [selectedWiFiDevice, setSelectedWiFiDevice] = useState<Device | null>(null);
    const [comPorts, setComPorts] = useState<string[]>([]);
    const [wifiDevices, setWifiDevices] = useState<Device[]>([]);

    // -------------------------------------------
    // STATES FOR STREAMING CONTROL
    // -------------------------------------------
    const [rate, setRate] = useState<number>(1000);  // Default rate in milliseconds
    const [currentLatency, setCurrentLatency] = useState<number | null>(null);  // To store the current latency

    // -------------------------------------------
    // PORT STATUS
    // -------------------------------------------
    const [portStatuses, setPortStatuses] = useState<Record<string, "OPEN" | "CLOSED" | "ERROR">>({});

    // -------------------------------------------
    // Fetch available COM ports and WiFi devices
    // -------------------------------------------
    const fetchComPorts = async () => {
        console.log("Fetching available COM ports...");
        try {
            const response = await fetch("/api/Controller_Com_Ports/com-ports"); // Updated endpoint
            const data = await response.json();
            setComPorts(data);
            return data;
        } catch (error) {
            console.error("Error fetching COM ports:", error);
            setComPorts(["None Detected"]);
            return ["None Detected"];
        }
    };

    const fetchWiFiDevices = async () => {
        console.log("Fetching WiFi devices...");
        try {
            const response = await fetch("/api/devices");
            const data: Device[] = await response.json();
            setWifiDevices(data);
        } catch (error) {
            console.error("Error fetching WiFi devices:", error);
            setWifiDevices([]);
        }
    };

    useEffect(() => {
        if (targetType === "Local COM Device") {
            fetchComPorts();
            setSelectedWiFiDevice(null);
        } else if (targetType === "WiFi Device") {
            fetchWiFiDevices();
            setSelectedComPort("");
            setTargetAddress("");
        }
    }, [targetType]);

    const handleTargetTypeChange = (event: SelectChangeEvent<string>) => {
        setTargetType(event.target.value);
        if (event.target.value !== "Local COM Device") {
            setSelectedComPort("");
        }
        if (event.target.value !== "WiFi Device") {
            setSelectedWiFiDevice(null);
        }
    };

    const openCOMPort = async () => {
        if (!selectedComPort) {
            console.error("Error: No COM port selected");
            return;
        }
        console.log(`Opening COM port: ${selectedComPort}`);
        try {
            const response = await fetch(
                `/api/Controller_Com_Ports/open?portName=${encodeURIComponent(selectedComPort)}&baudRate=115200`, // Updated endpoint
                { method: "POST" }
            );
            const msg = await response.text();
            console.log("Response:", response.status, msg);
        } catch (error) {
            console.error("Error opening COM port:", error);
        } finally {
            await refreshPortStatus(selectedComPort); // Pass the selected port name
        }
    };

    const closeCOMPort = async () => {
        if (!selectedComPort) {
            console.error("Error: No COM port selected");
            return;
        }
        console.log(`Closing COM port: ${selectedComPort}`);
        try {
            const response = await fetch(
                `/api/Controller_Com_Ports/close?portName=${encodeURIComponent(selectedComPort)}`, // Updated endpoint
                { method: "POST" }
            );
            const msg = await response.text();
            console.log("Response:", response.status, msg);
        } catch (error) {
            console.error("Error closing COM port:", error);
        } finally {
            await refreshPortStatus(selectedComPort); // Pass the selected port name
        }
    };

    const refreshPortStatus = async (portName: string) => {
        try {
            const response = await fetch(`/api/Controller_Com_Ports/status?portName=${encodeURIComponent(portName)}`);
            if (response.ok) {
                const result = await response.text();
                setPortStatuses(prev => ({
                    ...prev,
                    [portName]: result as "OPEN" | "CLOSED" | "ERROR"
                }));
            } else {
                setPortStatuses(prev => ({
                    ...prev,
                    [portName]: "ERROR"
                }));
            }
        } catch (err) {
            console.error("Error checking port status:", err);
            setPortStatuses(prev => ({
                ...prev,
                [portName]: "ERROR"
            }));
        }
    };

    const sendPayloadWiFi = async (deviceId: number, rate: number) => {
        try {
            const requestBody = {
                DeviceId: deviceId,
                Rate: rate
            };

            console.log(
                `[DEBUG] Sending stream start to WiFi device ${selectedWiFiDevice!.name} (${selectedWiFiDevice!.ipAddress}):`,
                requestBody
            );

            const response = await fetch("/api/send-data/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody)
            });

            // Ensure the response is ok before proceeding
            if (!response.ok) {
                const errorMsg = await response.text();  // Only call text() if response is not OK
                console.error("Error starting the stream:", errorMsg);
                return;
            }

            // Parse the JSON response
            const data = await response.json();

            // Check if latency is available in the response and update state
            if (data.latency !== undefined) {
                setCurrentLatency(data.latency);  // Update latency state with the returned latency
            }
            console.log(`[DEBUG] WiFi Response: ${response.status} ${data.message}`);
        } catch (error) {
            console.error("Error sending stream start to WiFi device:", error);
        }
    };

    const handleStartStreaming = async () => {
        if (selectedWiFiDevice) {
            await sendPayloadWiFi(selectedWiFiDevice.id, rate);  // Pass the current rate
        }
    };

    const handleStopStreaming = async () => {
        if (selectedWiFiDevice) {
            const requestBody = {
                DeviceId: selectedWiFiDevice.id,
                Action: "stop"
            };

            try {
                const response = await fetch("/api/send-data/stream", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(requestBody)
                });

                const msg = await response.text();
                console.log(`[DEBUG] WiFi Response: ${response.status} ${msg}`);
                setCurrentLatency(null);  // Reset latency when stream is stopped
            } catch (error) {
                console.error("Error stopping stream:", error);
            }
        }
    };

    // Fetch latency every second
    useEffect(() => {
        const fetchLatency = async () => {
            if (selectedWiFiDevice) {
                const response = await fetch(`/api/send-data/latency/${selectedWiFiDevice.id}`);
                if (response.ok) {
                    const data = await response.json();
                    setCurrentLatency(data.latency);
                }
            }
        };

        const interval = setInterval(fetchLatency, 1000);  // Fetch latency every second

        return () => clearInterval(interval);  // Clean up on unmount
    }, [selectedWiFiDevice]);

    return (
        <div>
            <Typography variant="h4">Testing</Typography>
            <section>
                <Typography variant="h6">Device Configuration</Typography>
                <Box display="flex" flexWrap="wrap" gap={2}>
                    {/* Target Type */}
                    <Box flex="1 1 48%">
                        <FormControl fullWidth>
                            <InputLabel>Target Type</InputLabel>
                            <Select value={targetType} label="Target Type" onChange={handleTargetTypeChange}>
                                <MenuItem value="Local COM Device">Local COM Device</MenuItem>
                                <MenuItem value="WiFi Device">WiFi Device</MenuItem>
                                <MenuItem value="ESP-NOW Device">ESP-NOW Device</MenuItem>
                            </Select>
                        </FormControl>
                    </Box>

                    {/* Conditional content for Local COM Device and WiFi Device */}
                    <Box flex="1 1 48%">
                        {targetType === "Local COM Device" ? (
                            <>
                                <FormControl fullWidth>
                                    <InputLabel>COM Port</InputLabel>
                                    <Select value={selectedComPort} onChange={(e) => setSelectedComPort(e.target.value)}>
                                        {comPorts.map((port) => (
                                            <MenuItem key={port} value={port}>
                                                {port}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                    <IconButton onClick={fetchComPorts}>
                                        <RefreshIcon />
                                    </IconButton>
                                </FormControl>
                                <Box mt={2}>
                                    <Button fullWidth variant="contained" color="primary" onClick={openCOMPort}>
                                        Open COM Port
                                    </Button>
                                </Box>
                                <Box mt={2}>
                                    <Button fullWidth variant="contained" color="error" onClick={closeCOMPort}>
                                        Close COM Port
                                    </Button>
                                </Box>
                            </>
                        ) : targetType === "WiFi Device" ? (
                            <Box display="flex" flexWrap="wrap" gap={2}>
                                {wifiDevices.map((device) => (
                                    <Box key={device.id} onClick={() => setSelectedWiFiDevice(device)} sx={{
                                        cursor: 'pointer',
                                        border: selectedWiFiDevice?.id === device.id ? '2px solid blue' : undefined
                                    }}>
                                        <Card variant="outlined">
                                            <CardActionArea>
                                                <CardContent>
                                                    <Typography variant="subtitle1">{device.name}</Typography>
                                                    <Typography variant="caption">{device.ipAddress}</Typography>
                                                </CardContent>
                                            </CardActionArea>
                                        </Card>
                                    </Box>
                                ))}
                            </Box>
                        ) : (
                            <TextField
                                fullWidth
                                label="Target Address"
                                value={targetAddress}
                                onChange={(e) => setTargetAddress(e.target.value)}
                            />
                        )}
                    </Box>

                    {/* Rate input */}
                    <Box flex="1 1 48%">
                        <TextField
                            fullWidth
                            label="Rate (ms)"
                            type="number"
                            value={rate}
                            onChange={(e) => setRate(Number(e.target.value))}
                        />
                    </Box>

                    {/* Buttons */}
                    <Box flex="1 1 48%">
                        <Button fullWidth variant="contained" color="primary" onClick={handleStartStreaming}>
                            Start Streaming
                        </Button>
                    </Box>
                    <Box flex="1 1 48%">
                        <Button fullWidth variant="contained" color="error" onClick={handleStopStreaming}>
                            Stop Streaming
                        </Button>
                    </Box>

                    {/* Latency Display */}
                    <Box flex="1 1 100%">
                        {currentLatency !== null ? (
                            <Typography variant="h6">
                                Current Latency: {currentLatency} ms
                            </Typography>
                        ) : (
                            <Typography variant="h6">No latency data available</Typography>
                        )}
                    </Box>

                    {/* COM port status */}
                    {targetType === "Local COM Device" && (
                        <Box flex="1 1 100%">
                            <Typography>
                                {selectedComPort
                                    ? `${selectedComPort} is ${portStatuses[selectedComPort] || "CLOSED"}`
                                    : "No port selected"}
                            </Typography>
                        </Box>
                    )}
                </Box>
            </section>
        </div>
    );
};

export default Testing;
