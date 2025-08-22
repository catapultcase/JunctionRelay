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
    Typography, Box, Button, Card, CardContent,
    TextField, Select, MenuItem, FormControl, InputLabel,
    FormControlLabel, Switch, Accordion, AccordionSummary,
    AccordionDetails, SelectChangeEvent
} from "@mui/material";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SettingsIcon from '@mui/icons-material/Settings';
import SaveIcon from '@mui/icons-material/Save';
import LinkIcon from '@mui/icons-material/Link';

interface GatewayDevice {
    id: number;
    name: string;
    ipAddress: string;
    COMPort?: string;
    comPort?: string;
}

interface JunctionConfigPanelProps {
    junctionData: any;
    setJunctionData: (data: any) => void;
    selectedMqttBrokerId: string;
    setSelectedMqttBrokerId: (id: string) => void;
    mqttBrokers: any[];
    loading: boolean;
    settingsExpanded: boolean;
    onSettingsExpandedChange: (expanded: boolean) => void;
    onSaveJunction: () => Promise<void>;
    onConnectToMQTTBroker: () => Promise<void>;
}

// Junction types available
const JUNCTION_TYPES = [
    "COM Junction",
    "HTTP Junction",
    "MQTT Junction",
    "Virtual Junction",
    "WebSocket Junction",
    "Gateway Junction (COM to ESP:NOW)",
    "Gateway Junction (HTTP to ESP:NOW)",
    "Gateway Junction (WebSocket to ESP:NOW)"
];

const Junction_ConfigPanel: React.FC<JunctionConfigPanelProps> = ({
    junctionData,
    setJunctionData,
    selectedMqttBrokerId,
    setSelectedMqttBrokerId,
    mqttBrokers,
    loading,
    settingsExpanded,
    onSettingsExpandedChange,
    onSaveJunction,
    onConnectToMQTTBroker
}) => {
    const [gatewayDevices, setGatewayDevices] = useState<GatewayDevice[]>([]);
    const [displayGatewayDestination, setDisplayGatewayDestination] = useState<string>("");

    // Load gateway devices when component mounts
    useEffect(() => {
        const loadGatewayDevices = async () => {
            try {
                const response = await fetch("/api/devices");
                if (response.ok) {
                    const devices = await response.json();
                    const gateways = devices
                        .filter((device: any) => device.isGateway === true)
                        .sort((a: any, b: any) => a.name.localeCompare(b.name));
                    setGatewayDevices(gateways);
                }
            } catch (error) {
                console.error("Error loading gateway devices:", error);
            }
        };

        loadGatewayDevices();
    }, []);

    // Update display destination when junction data or gateway devices change
    useEffect(() => {
        if (junctionData?.gatewayDeviceId && gatewayDevices.length > 0) {
            const selectedDevice = gatewayDevices.find(device => device.id === junctionData.gatewayDeviceId);
            if (selectedDevice) {
                if (junctionData.type === "Gateway Junction (COM to ESP:NOW)") {
                    setDisplayGatewayDestination(selectedDevice.COMPort || selectedDevice.comPort || "");
                } else {
                    setDisplayGatewayDestination(selectedDevice.ipAddress || "");
                }
            } else {
                setDisplayGatewayDestination("");
            }
        } else {
            setDisplayGatewayDestination("");
        }
    }, [junctionData?.gatewayDeviceId, junctionData?.type, gatewayDevices]);

    // Handle MQTT broker selection
    const handleMqttBrokerChange = (event: SelectChangeEvent<string>) => {
        setSelectedMqttBrokerId(event.target.value);
    };

    // Handle gateway device selection
    const handleGatewayDeviceChange = (event: SelectChangeEvent<string>) => {
        const deviceId = event.target.value ? parseInt(event.target.value) : undefined;
        setJunctionData({
            ...junctionData,
            gatewayDeviceId: deviceId
        });
    };

    // Helper function to determine if a gateway device should be shown
    const shouldShowGatewaySelection = () => {
        return junctionData?.type === "Gateway Junction (HTTP to ESP:NOW)" ||
            junctionData?.type === "Gateway Junction (COM to ESP:NOW)" ||
            junctionData?.type === "Gateway Junction (WebSocket to ESP:NOW)";
    };

    return (
        <Accordion
            expanded={settingsExpanded}
            onChange={(event, isExpanded) => onSettingsExpandedChange(isExpanded)}
            sx={{ mb: 3 }}
        >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box display="flex" alignItems="center" gap={1}>
                    <SettingsIcon />
                    <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                        Junction Settings
                    </Typography>
                </Box>
            </AccordionSummary>
            <AccordionDetails>
                <Box display="flex" flexDirection="column" gap={2}>

                    {/* Junction Info */}
                    <Card>
                        <CardContent sx={{ pb: 1 }}>
                            <Typography variant="subtitle1" gutterBottom>Junction Info</Typography>
                            <Box display="flex" flexDirection={{ xs: 'column', md: 'row' }} gap={1}>
                                <TextField
                                    fullWidth
                                    label="Name"
                                    value={junctionData.name || ""}
                                    onChange={(e) => setJunctionData({ ...junctionData, name: e.target.value })}
                                    size="small"
                                />
                                <FormControl fullWidth size="small">
                                    <InputLabel>Type</InputLabel>
                                    <Select
                                        value={junctionData.type || ""}
                                        label="Type"
                                        onChange={(e) => setJunctionData({ ...junctionData, type: e.target.value })}
                                    >
                                        {JUNCTION_TYPES.map((type) => (
                                            <MenuItem key={type} value={type}>{type}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Box>
                            <TextField
                                fullWidth
                                label="Description"
                                value={junctionData.description || ""}
                                onChange={(e) => setJunctionData({ ...junctionData, description: e.target.value })}
                                multiline
                                rows={2}
                                size="small"
                                sx={{ mt: 1 }}
                            />
                        </CardContent>
                    </Card>

                    {/* Junction Configuration */}
                    <Card>
                        <CardContent sx={{ pb: 1 }}>
                            <Typography variant="subtitle1" gutterBottom>Junction Configuration</Typography>

                            <Box display="flex" flexWrap="wrap" gap={1}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={junctionData.showOnDashboard || false}
                                            onChange={(e) => setJunctionData({ ...junctionData, showOnDashboard: e.target.checked })}
                                            size="small"
                                        />
                                    }
                                    label="Show on Dashboard"
                                />
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={junctionData.autoStartOnLaunch || false}
                                            onChange={(e) => setJunctionData({ ...junctionData, autoStartOnLaunch: e.target.checked })}
                                            size="small"
                                        />
                                    }
                                    label="Auto Start on Launch"
                                />
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={junctionData.compressPayload || false}
                                            onChange={(e) => setJunctionData({ ...junctionData, compressPayload: e.target.checked })}
                                            size="small"
                                        />
                                    }
                                    label="Enable Payload Compression"
                                />
                            </Box>

                            <Box display="flex" flexDirection={{ xs: 'column', sm: 'row' }} gap={1} mt={1}>
                                <TextField
                                    fullWidth
                                    label="Retry Count"
                                    type="number"
                                    value={junctionData.retryCount || 0}
                                    onChange={(e) => setJunctionData({ ...junctionData, retryCount: parseInt(e.target.value) || 0 })}
                                    size="small"
                                />
                                <TextField
                                    fullWidth
                                    label="Retry Interval (ms)"
                                    type="number"
                                    value={junctionData.retryIntervalMs || 0}
                                    onChange={(e) => setJunctionData({ ...junctionData, retryIntervalMs: parseInt(e.target.value) || 0 })}
                                    size="small"
                                />
                                <TextField
                                    fullWidth
                                    label="Stream Timeout (ms)"
                                    type="number"
                                    value={junctionData.streamAutoTimeoutMs || 0}
                                    onChange={(e) => setJunctionData({ ...junctionData, streamAutoTimeoutMs: parseInt(e.target.value) || 0 })}
                                    size="small"
                                />
                            </Box>
                        </CardContent>
                    </Card>

                    {/* Gateway Configuration */}
                    <Card>
                        <CardContent sx={{ pb: 1 }}>
                            <Typography variant="subtitle1" gutterBottom>Gateway Configuration</Typography>

                            {shouldShowGatewaySelection() ? (
                                <Box display="flex" flexDirection="column" gap={1}>
                                    <FormControl fullWidth size="small">
                                        <InputLabel id="gateway-device-label">Gateway Device</InputLabel>
                                        <Select
                                            labelId="gateway-device-label"
                                            value={junctionData?.gatewayDeviceId?.toString() || ""}
                                            onChange={handleGatewayDeviceChange}
                                            label="Gateway Device"
                                        >
                                            <MenuItem value="">
                                                <em>Select a gateway device</em>
                                            </MenuItem>
                                            {gatewayDevices.length === 0 ? (
                                                <MenuItem disabled>
                                                    No gateway devices found
                                                </MenuItem>
                                            ) : (
                                                gatewayDevices.map((device) => (
                                                    <MenuItem key={device.id} value={device.id.toString()}>
                                                        {junctionData?.type === "Gateway Junction (COM to ESP:NOW)"
                                                            ? `${device.name} (${device.COMPort || device.comPort || 'No COM port'})`
                                                            : `${device.name} (${device.ipAddress})`
                                                        }
                                                    </MenuItem>
                                                ))
                                            )}
                                        </Select>
                                    </FormControl>

                                    {/* Show the appropriate connection info that will be used - FOR DISPLAY ONLY */}
                                    {displayGatewayDestination && (
                                        <TextField
                                            fullWidth
                                            size="small"
                                            label={junctionData?.type === "Gateway Junction (COM to ESP:NOW)" ? "Gateway COM Port" : "Gateway IP Address"}
                                            value={displayGatewayDestination}
                                            disabled
                                            //helperText={
                                            //    (junctionData?.type === "Gateway Junction (COM to ESP:NOW)"
                                            //        ? "COM port of the selected gateway device (for display only)"
                                            //        : "IP address of the selected gateway device (for display only)")
                                            //}
                                        />
                                    )}

                                    {/* Show message if gateway is required but not selected */}
                                    {shouldShowGatewaySelection() && !junctionData?.gatewayDeviceId && (
                                        <TextField
                                            fullWidth
                                            size="small"
                                            label={junctionData?.type === "Gateway Junction (COM to ESP:NOW)" ? "Gateway COM Port" : "Gateway IP Address"}
                                            value=""
                                            disabled
                                            error={true}
                                            helperText="Gateway device selection is required for this junction type"
                                        />
                                    )}

                                    <TextField
                                        label="Baud Rate"
                                        type="number"
                                        value={junctionData.baudRate || 115200}
                                        onChange={(e) => setJunctionData({ ...junctionData, baudRate: parseInt(e.target.value) || 115200 })}
                                        size="small"
                                        helperText="Only applies for UART protocol"
                                    />
                                </Box>
                            ) : (
                                <Box display="flex" flexDirection="column" gap={1}>
                                    <TextField
                                        label="Gateway Device ID"
                                        value={junctionData.gatewayDeviceId || ''}
                                        onChange={(e) => setJunctionData({ ...junctionData, gatewayDeviceId: e.target.value })}
                                        size="small"
                                        helperText="This device will forward received payloads via ESP:NOW to selected target devices below"
                                    />
                                    <TextField
                                        label="Gateway Destination"
                                        value={junctionData.gatewayDestination || ''}
                                        onChange={(e) => setJunctionData({ ...junctionData, gatewayDestination: e.target.value })}
                                        placeholder=""
                                        size="small"
                                        helperText="For internet protocols, this will be the IP Address of the Gateway. For COM/USB/Serial, this should be a port e.g. COM3 or /dev/ttyUSB0"
                                    />
                                    <TextField
                                        label="Baud Rate"
                                        type="number"
                                        value={junctionData.baudRate || 115200}
                                        onChange={(e) => setJunctionData({ ...junctionData, baudRate: parseInt(e.target.value) || 115200 })}
                                        size="small"
                                        helperText="Only applies for UART protocol"
                                    />
                                </Box>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent sx={{ pb: 1 }}>
                            <Typography variant="subtitle1" gutterBottom>MQTT Broker Configuration</Typography>

                            <Box
                                sx={{
                                    display: 'flex',
                                    flexDirection: { xs: 'column', md: 'row' },
                                    gap: 1,
                                    alignItems: { xs: 'stretch', md: 'flex-end' }
                                }}
                            >
                                <FormControl fullWidth size="small">
                                    <InputLabel>MQTT Broker</InputLabel>
                                    <Select
                                        value={selectedMqttBrokerId}
                                        label="MQTT Broker"
                                        onChange={handleMqttBrokerChange}
                                    >
                                        <MenuItem value="">
                                            <em>None</em>
                                        </MenuItem>
                                        {mqttBrokers.map((broker) => (
                                            <MenuItem key={broker.id} value={broker.id.toString()}>
                                                {broker.name}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>

                                <Box sx={{ width: { xs: '100%', md: 'auto' }, minWidth: { md: '120px' } }}>
                                    <Button
                                        fullWidth
                                        variant="outlined"
                                        onClick={onConnectToMQTTBroker}
                                        startIcon={<LinkIcon />}
                                        disabled={!selectedMqttBrokerId || loading}
                                        size="small"
                                    >
                                        Connect
                                    </Button>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>

                    {/* Save Button aligned right */}
                    <Box display="flex" justifyContent="flex-end">
                        <Button
                            variant="contained"
                            onClick={onSaveJunction}
                            startIcon={<SaveIcon />}
                            disabled={loading}
                            size="small"
                        >
                            Save Junction Settings
                        </Button>
                    </Box>
                </Box>
            </AccordionDetails>
        </Accordion>
    );
};

export default Junction_ConfigPanel;