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

import {
    Typography,
    TextField,
    MenuItem,
    Select,
    InputLabel,
    FormControl,
    Button,
    Card,
    CardActionArea,
    CardContent,
    Box
} from "@mui/material";
import { useEffect, useState } from "react";
import { SelectChangeEvent } from "@mui/material/Select";

interface Device {
    id: number;
    name: string;
    ipAddress: string;
}

const TestingQuad = () => {
    const [targetType, setTargetType] = useState<string>("");
    const [selectedWiFiDevice, setSelectedWiFiDevice] = useState<Device | null>(null);
    const [wifiDevices, setWifiDevices] = useState<Device[]>([]);
    const [displayText, setDisplayText] = useState<string>("");
    const [mode, setMode] = useState<string>("scroll"); // New mode state

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
        if (targetType === "WiFi Device") {
            fetchWiFiDevices();
        }
    }, [targetType]);

    const handleTargetTypeChange = (event: SelectChangeEvent<string>) => {
        setTargetType(event.target.value);
        if (event.target.value !== "WiFi Device") {
            setSelectedWiFiDevice(null);
        }
    };

    const sendConfigPayload = async (deviceId: number, displayText: string) => {
        try {
            const requestBody = {
                DeviceId: deviceId,
                DisplayText: displayText,
                Mode: mode // Include mode
            };

            console.log(`[DEBUG] Sending display text to WiFi device ${selectedWiFiDevice!.name}:`, requestBody);

            const response = await fetch("/api/send-data/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorMsg = await response.text();
                console.error("Error sending display text:", errorMsg);
                return;
            }

            console.log(`[DEBUG] Payload sent successfully to WiFi device ${selectedWiFiDevice!.name}`);
        } catch (error) {
            console.error("Error sending display text payload:", error);
        }
    };

    const handleSendDisplayText = () => {
        if (selectedWiFiDevice && displayText) {
            sendConfigPayload(selectedWiFiDevice.id, displayText);
        }
    };

    return (
        <div>
            <Typography variant="h4">Testing Quad</Typography>
            <section>
                <Typography variant="h6">Device Configuration</Typography>
                <Box display="flex" flexDirection="row" flexWrap="wrap" gap={2}>
                    <Box width="50%">
                        <FormControl fullWidth>
                            <InputLabel>Target Type</InputLabel>
                            <Select value={targetType} label="Target Type" onChange={handleTargetTypeChange}>
                                <MenuItem value="WiFi Device">WiFi Device</MenuItem>
                            </Select>
                        </FormControl>
                    </Box>

                    <Box width="100%">
                        {targetType === "WiFi Device" && (
                            <Box display="flex" flexDirection="row" flexWrap="wrap" gap={1}>
                                {wifiDevices.map((device) => (
                                    <Box key={device.id} width="auto">
                                        <Card
                                            variant={selectedWiFiDevice?.id === device.id ? "outlined" : undefined}
                                            onClick={() => setSelectedWiFiDevice(device)}
                                            sx={{
                                                cursor: "pointer",
                                                border: selectedWiFiDevice?.id === device.id ? "2px solid blue" : undefined
                                            }}
                                        >
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
                        )}
                    </Box>

                    <Box width="100%">
                        <TextField
                            fullWidth
                            label="Display Text"
                            value={displayText}
                            onChange={(e) => setDisplayText(e.target.value)}
                        />
                    </Box>

                    <Box width="50%">
                        <FormControl fullWidth>
                            <InputLabel>Mode</InputLabel>
                            <Select
                                value={mode}
                                label="Mode"
                                onChange={(e: SelectChangeEvent<string>) => setMode(e.target.value)}
                            >
                                <MenuItem value="static">Static</MenuItem>
                                <MenuItem value="scroll">Scroll</MenuItem>
                            </Select>
                        </FormControl>
                    </Box>

                    <Box width="25%">
                        <Button fullWidth variant="contained" color="primary" onClick={handleSendDisplayText}>
                            Send Display Text
                        </Button>
                    </Box>
                </Box>
            </section>
        </div>
    );
};

export default TestingQuad;
