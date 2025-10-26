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
    AccordionDetails, SelectChangeEvent, Alert
} from "@mui/material";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SettingsIcon from '@mui/icons-material/Settings';
import SaveIcon from '@mui/icons-material/Save';
import LinkIcon from '@mui/icons-material/Link';
import InfoIcon from '@mui/icons-material/Info';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import SendIcon from '@mui/icons-material/Send';

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
    onJunctionDataChange: (updatedData: any, field: string, immediate?: boolean) => void;
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
    onJunctionDataChange,
    onConnectToMQTTBroker
}) => {
    const [gatewayDevices, setGatewayDevices] = useState<GatewayDevice[]>([]);
    const [displayGatewayDestination, setDisplayGatewayDestination] = useState<string>("");

    // Determine if we're in a FrameEngine mode
    const renderingMode = junctionData?.renderingMode || 'Payload';
    const isFrameEngineMode = renderingMode === 'Blit' || renderingMode === 'Composite';
    const compressionRequired = isFrameEngineMode;

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

    // Auto-enable compression for FrameEngine modes
    useEffect(() => {
        if (compressionRequired && !junctionData?.compressPayload) {
            onJunctionDataChange({
                ...junctionData,
                compressPayload: true
            }, 'compressPayload', true);
        }
    }, [compressionRequired, junctionData?.compressPayload]);

    // Handle MQTT broker selection
    const handleMqttBrokerChange = (event: SelectChangeEvent<string>) => {
        setSelectedMqttBrokerId(event.target.value);
    };

    // Handle gateway device selection
    const handleGatewayDeviceChange = (event: SelectChangeEvent<string>) => {
        const deviceId = event.target.value ? parseInt(event.target.value) : undefined;
        onJunctionDataChange({
            ...junctionData,
            gatewayDeviceId: deviceId
        }, 'gatewayDeviceId', true);
    };

    // Helper function to determine if a gateway device should be shown
    const shouldShowGatewaySelection = () => {
        return junctionData?.type === "Gateway Junction (HTTP to ESP:NOW)" ||
            junctionData?.type === "Gateway Junction (COM to ESP:NOW)" ||
            junctionData?.type === "Gateway Junction (WebSocket to ESP:NOW)";
    };

    // Handle compression toggle with FrameEngine enforcement
    const handleCompressionToggle = (checked: boolean) => {
        if (compressionRequired && !checked) {
            // Don't allow disabling compression in FrameEngine modes
            return;
        }
        onJunctionDataChange({ ...junctionData, compressPayload: checked }, 'compressPayload', true);
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
                                    onChange={(e) => onJunctionDataChange({ ...junctionData, name: e.target.value }, 'name')}
                                    size="small"
                                />
                                <FormControl fullWidth size="small">
                                    <InputLabel>Type</InputLabel>
                                    <Select
                                        value={junctionData.type || ""}
                                        label="Type"
                                        onChange={(e) => onJunctionDataChange({ ...junctionData, type: e.target.value }, 'type', true)}
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
                                onChange={(e) => onJunctionDataChange({ ...junctionData, description: e.target.value }, 'description')}
                                multiline
                                rows={2}
                                size="small"
                                sx={{ mt: 1 }}
                            />
                        </CardContent>
                    </Card>

                    {/* Junction Configuration - 2 Column Grid */}
                    <Box
                        display="grid"
                        gridTemplateColumns={{ xs: '1fr', md: 'repeat(2, 1fr)' }}
                        gap={2}
                    >
                        {/* General Settings Card */}
                        <Card>
                            <CardContent sx={{ p: 2.5 }}>
                                <Box display="flex" alignItems="center" gap={1} mb={2}>
                                    <SettingsIcon fontSize="small" color="action" />
                                    <Typography variant="subtitle1">General Settings</Typography>
                                </Box>
                                <Box display="flex" flexWrap="wrap" gap={1.5}>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={junctionData.showOnDashboard || false}
                                                onChange={(e) => onJunctionDataChange({ ...junctionData, showOnDashboard: e.target.checked }, 'showOnDashboard', true)}
                                                size="small"
                                            />
                                        }
                                        label="Show on Dashboard"
                                    />
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={junctionData.autoStartOnLaunch || false}
                                                onChange={(e) => onJunctionDataChange({ ...junctionData, autoStartOnLaunch: e.target.checked }, 'autoStartOnLaunch', true)}
                                                size="small"
                                            />
                                        }
                                        label="Auto-Start on JunctionRelay Launch"
                                    />
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={compressionRequired || junctionData.compressPayload || false}
                                                onChange={(e) => handleCompressionToggle(e.target.checked)}
                                                size="small"
                                                disabled={junctionData.type === "MQTT Junction" || compressionRequired}
                                            />
                                        }
                                        label={
                                            <Box component="span" sx={{
                                                opacity: (junctionData.type === "MQTT Junction" || compressionRequired) ? 0.6 : 1
                                            }}>
                                                Enable Payload Compression
                                                {compressionRequired && " (Required)"}
                                            </Box>
                                        }
                                    />
                                </Box>
                                {compressionRequired && (
                                    <Alert severity="info" sx={{ mt: 2 }}>
                                        <strong>Compression Required:</strong> Payload compression is automatically enabled and required for FrameEngine modes (Pre-rendered Frames and Frame Reassembly).
                                        FrameEngine transmits rendered image data or Rive animation instructions which benefit significantly from compression to reduce bandwidth and improve transmission speed.
                                    </Alert>
                                )}
                            </CardContent>
                        </Card>

                        {/* Testing & Validation Card */}
                        <Card>
                            <CardContent sx={{ p: 2.5 }}>
                                <Box display="flex" alignItems="center" gap={1} mb={2}>
                                    <VerifiedUserIcon fontSize="small" color="action" />
                                    <Typography variant="subtitle1">Testing & Validation</Typography>
                                </Box>
                                <Box display="flex" flexWrap="wrap" gap={1.5}>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={junctionData.allowStartOnCollectorTestFailure || false}
                                                onChange={(e) => onJunctionDataChange({ ...junctionData, allowStartOnCollectorTestFailure: e.target.checked }, 'allowStartOnCollectorTestFailure', true)}
                                                size="small"
                                            />
                                        }
                                        label="Allow Start if Collector Tests Fail"
                                    />
                                </Box>
                                <Alert severity="warning" sx={{ mt: 2 }}>
                                    When disabled (default), junction startup will abort if any linked collectors fail their connection tests. Enable this to allow the junction to start despite test failures.
                                </Alert>
                            </CardContent>
                        </Card>

                        {/* Payload Control Card */}
                        <Card sx={{ gridColumn: { xs: '1', md: 'span 2' } }}>
                            <CardContent sx={{ p: 2.5 }}>
                                <Box display="flex" alignItems="center" gap={1} mb={2}>
                                    <SendIcon fontSize="small" color="action" />
                                    <Typography variant="subtitle1">Payload Control</Typography>
                                </Box>
                                <Box display="flex" flexWrap="wrap" gap={1.5}>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={junctionData.sendConfigPayload !== false}
                                                onChange={(e) => onJunctionDataChange({ ...junctionData, sendConfigPayload: e.target.checked }, 'sendConfigPayload', true)}
                                                size="small"
                                            />
                                        }
                                        label="Send Config Payload"
                                    />
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={junctionData.sendSensorPayloads !== false}
                                                onChange={(e) => onJunctionDataChange({ ...junctionData, sendSensorPayloads: e.target.checked }, 'sendSensorPayloads', true)}
                                                size="small"
                                            />
                                        }
                                        label="Send Sensor Payloads"
                                    />
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={junctionData.sendStopPayload !== false}
                                                onChange={(e) => onJunctionDataChange({ ...junctionData, sendStopPayload: e.target.checked }, 'sendStopPayload', true)}
                                                size="small"
                                            />
                                        }
                                        label="Send Stop Payload"
                                    />
                                </Box>
                            </CardContent>
                        </Card>
                    </Box>

                    {/* Gateway Configuration */}
                    {shouldShowGatewaySelection() && (
                        <Card>
                            <CardContent sx={{ pb: 1 }}>
                                <Typography variant="subtitle1" gutterBottom>Gateway Configuration</Typography>

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

                                    {displayGatewayDestination && (
                                        <TextField
                                            fullWidth
                                            size="small"
                                            label={junctionData?.type === "Gateway Junction (COM to ESP:NOW)" ? "Gateway COM Port" : "Gateway IP Address"}
                                            value={displayGatewayDestination}
                                            disabled
                                        />
                                    )}

                                    {!junctionData?.gatewayDeviceId && (
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
                            </CardContent>
                        </Card>
                    )}

                    {junctionData.type === "MQTT Junction" && (
                        <Card>
                            <CardContent sx={{ pb: 1 }}>
                                <Typography variant="subtitle1" gutterBottom>MQTT Broker Configuration</Typography>

                                <Alert severity="info" icon={<InfoIcon />} sx={{ mb: 2 }}>
                                    <Typography variant="body2">
                                        <strong>MQTT Protocol Flow:</strong> Initial configuration payloads are sent via HTTP to the device,
                                        then subsequent sensor data updates are transmitted via MQTT to the configured broker topics.
                                        Sensor payloads must fit within the MQTT packet size limits defined by your broker (typically 256MB max, but often configured lower).
                                    </Typography>
                                </Alert>

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
                    )}
                </Box>
            </AccordionDetails>
        </Accordion>
    );
};

export default Junction_ConfigPanel;