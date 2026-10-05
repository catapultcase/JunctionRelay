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

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
    Typography,
    Box,
    CircularProgress,
    Button,
    Modal,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    SelectChangeEvent,
    Checkbox,
    FormControlLabel,
    Alert,
    Paper,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Divider,
    Collapse,
} from "@mui/material";
// Icon imports
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { Junction } from "./JunctionsTable";
import type { Device } from "../types/entities";
import SetupInstructions_Junctions from '../components/SetupInstructions_Junctions';
import {
    MODAL_SHELL_SX,
    MODAL_HEADER_SX,
    MODAL_TITLE_SX,
    MODAL_LOADING_SX,
    MODAL_CONTENT_SX,
    MODAL_LEFT_PANEL_SX,
    MODAL_GROUP_HEADER_SX,
    MODAL_LIST_ITEM_SX,
    MODAL_LIST_ITEM_ICON_SX,
    MODAL_LIST_ITEM_EMOJI_SX,
    MODAL_RIGHT_PANEL_SX,
    MODAL_FORM_AREA_SX,
    MODAL_MOBILE_DROPDOWN_SX,
    MODAL_MOBILE_GROUP_HEADER_SX,
    MODAL_TYPE_DESCRIPTION_SX,
    MODAL_INSTRUCTIONS_PANEL_SX,
    MODAL_INSTRUCTIONS_TOGGLE_SX,
    MODAL_INSTRUCTIONS_CONTENT_SX,
    MODAL_ACTIONS_SX,
} from '@junctionrelay/styles';
import { errorMessage } from '../utils/errors';

interface AddJunctionModalProps {
    open: boolean;
    onClose: () => void;
    onJunctionAdded: (id: number, redirect: boolean) => void;
    junctions: Junction[];
}

// Junction type definitions with grouped categories
const JUNCTION_GROUPS = [
    {
        id: 'broadcast',
        name: 'Broadcast',
        types: [
            { value: "Broadcast Junction", name: "Websocket Broadcast", emoji: "📡", desc: "Broadcasts sensor data to connected devices via WebSocket" },
        ]
    },
    {
        id: 'xsd',
        name: 'XSD Junctions',
        types: [
            { value: "XSD Junction (Remote Control)", name: "Remote Control", emoji: "🎮", desc: "Full remote control of XSD Mode 3 displays" },
        ]
    },
    {
        id: 'standard',
        name: 'Standard Junctions',
        types: [
            { value: "COM Junction", name: "COM Junction", emoji: "🔌", desc: "Serial port communication" },
            { value: "HTTP Junction", name: "HTTP Junction", emoji: "🌐", desc: "HTTP REST API endpoints" },
            { value: "MQTT Junction", name: "MQTT Junction", emoji: "📨", desc: "Message broker communication" },
            { value: "Virtual Junction", name: "Virtual Junction", emoji: "💭", desc: "Internal data processing only" },
            { value: "WebSocket Junction", name: "WebSocket Junction", emoji: "⚡", desc: "Real-time bidirectional communication" },
        ]
    },
    {
        id: 'gateway',
        name: 'Gateway Junctions',
        types: [
            { value: "Gateway Junction (COM to ESP:NOW)", name: "COM to ESP:NOW", emoji: "📻", desc: "Serial to ESP:NOW gateway" },
            { value: "Gateway Junction (HTTP to ESP:NOW)", name: "HTTP to ESP:NOW", emoji: "📶", desc: "HTTP to ESP:NOW gateway" },
            { value: "Gateway Junction (WebSocket to ESP:NOW)", name: "WebSocket to ESP:NOW", emoji: "🛜", desc: "WebSocket to ESP:NOW gateway" },
        ]
    }
];

// Flatten for dropdown/mobile use
const ALL_JUNCTION_TYPES = JUNCTION_GROUPS.flatMap(group => group.types);

const AddJunctionModal: React.FC<AddJunctionModalProps> = ({
    open,
    onClose,
    onJunctionAdded,
    junctions
}) => {
    const [modalLoading, setModalLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>("");
    const [gatewayDevices, setGatewayDevices] = useState<Device[]>([]);
    const [payloads, setPayloads] = useState<{ id: string; displayName: string }[]>([]);
    const [selectedPayloadId, setSelectedPayloadId] = useState<string>("");
    const hasBeenOpenedRef = useRef<boolean>(false);
    const [configureAfterAdd, setConfigureAfterAdd] = useState<boolean>(false);

    // State for the add junction form
    const [newJunction, setNewJunction] = useState<Partial<Junction>>({
        name: "",
        description: "",
        type: "XSD Junction (Remote Control)",
        renderingMode: "Composite", // XSD Junction only supports Frame Reassembly
        showOnDashboard: true,
        autoStartOnLaunch: false,
        deviceLinks: [],
        collectorLinks: [],
        sortOrder: 0,
        gatewayDeviceId: undefined // Only store the device ID, not the destination
    });

    // Separate state for UI display purposes only
    const [displayGatewayDestination, setDisplayGatewayDestination] = useState<string>("");
    const [showInstructions, setShowInstructions] = useState<boolean>(true);

    // Rendering mode options
    const renderingModeOptions = [
        { value: "Payload", name: "Payloads", desc: "Send raw data payloads to target devices" },
        { value: "Blit", name: "FrameEngine: Pre-rendered Frames", desc: "Render complete images and push per-frame" },
        { value: "Composite", name: "FrameEngine: Frame Reassembly", desc: "Reassemble complete frames at target" }
    ];

    // Function to check if junction type supports FrameEngine modes
    const supportsFrameEngine = useCallback((junctionType: string): boolean => {
        return [
            "COM Junction",
            "HTTP Junction",
            "Virtual Junction",
            "WebSocket Junction"
        ].includes(junctionType);
    }, []);

    // XSD Junctions only support Frame Reassembly mode
    const isXSDJunction = useCallback((junctionType: string): boolean => {
        return junctionType === "XSD Junction (Remote Control)";
    }, []);

    // Broadcast Junctions only support Payload mode
    const isBroadcastJunction = useCallback((junctionType: string): boolean => {
        return junctionType === "Broadcast Junction";
    }, []);

    // Get available rendering modes based on junction type
    const getAvailableRenderingModes = useCallback(() => {
        if (isXSDJunction(newJunction.type || "")) {
            return renderingModeOptions.filter(mode => mode.value === "Composite");
        }
        if (isBroadcastJunction(newJunction.type || "")) {
            return renderingModeOptions.filter(mode => mode.value === "Payload");
        }
        if (!newJunction.type || !supportsFrameEngine(newJunction.type)) {
            return renderingModeOptions.filter(mode => mode.value === "Payload");
        }
        return renderingModeOptions;
    }, [newJunction.type, supportsFrameEngine, isXSDJunction, isBroadcastJunction]);

    // Get current junction type config
    const getCurrentTypeConfig = useCallback(() => {
        return ALL_JUNCTION_TYPES.find(t => t.value === newJunction.type);
    }, [newJunction.type]);

    // Load gateway devices when component mounts
    useEffect(() => {
        const loadGatewayDevices = async () => {
            try {
                const response = await fetch("/api/devices");
                if (response.ok) {
                    const devices: Device[] = await response.json();
                    const gateways = devices
                        .filter(device => device.isGateway === true)
                        .sort((a, b) => a.name.localeCompare(b.name));
                    setGatewayDevices(gateways);
                }
            } catch (error) {
                console.error("Error loading gateway devices:", error);
            }
        };

        const loadPayloads = async () => {
            try {
                const response = await fetch("/api/payloads");
                if (response.ok) {
                    const data = await response.json();
                    setPayloads(data);
                }
            } catch (error) {
                console.error("Error loading payloads:", error);
            }
        };

        if (open) {
            loadGatewayDevices();
            loadPayloads();
        }
    }, [open]);

    // Reset form function - memoized to prevent unnecessary re-renders
    const resetForm = useCallback(() => {
        const highestSortOrder = junctions.length > 0
            ? Math.max(...junctions.map(j => j.sortOrder !== undefined ? j.sortOrder : 0))
            : -1;

        setNewJunction({
            name: "",
            description: "",
            type: "XSD Junction (Remote Control)",
            renderingMode: "Composite", // XSD Junction only supports Frame Reassembly
            showOnDashboard: true,
            autoStartOnLaunch: false,
            deviceLinks: [],
            collectorLinks: [],
            sortOrder: highestSortOrder + 1,
            gatewayDeviceId: undefined // Only store the device ID
        });
        setDisplayGatewayDestination(""); // Reset display value
        setSelectedPayloadId(""); // Reset payload selection
        setError("");
        hasBeenOpenedRef.current = false;
    }, [junctions]);

    // Reset form only when modal opens for the first time
    useEffect(() => {
        if (open && !hasBeenOpenedRef.current) {
            resetForm();
            hasBeenOpenedRef.current = true;
        } else if (!open) {
            // Reset the flag when modal closes
            hasBeenOpenedRef.current = false;
        }
    }, [open, resetForm]);

    // Set default name based on junction type
    useEffect(() => {
        if (newJunction.type && newJunction.type !== "") {
            const selectedType = ALL_JUNCTION_TYPES.find(type => type.value === newJunction.type);
            if (selectedType) {
                setNewJunction((prev) => ({
                    ...prev,
                    name: selectedType.value // Use full value as name
                }));
            }
        }
    }, [newJunction.type]);

    // Reset rendering mode when junction type changes
    useEffect(() => {
        if (newJunction.type) {
            if (isXSDJunction(newJunction.type)) {
                setNewJunction((prev) => ({ ...prev, renderingMode: "Composite" }));
            } else if (isBroadcastJunction(newJunction.type) || !supportsFrameEngine(newJunction.type)) {
                setNewJunction((prev) => ({ ...prev, renderingMode: "Payload" }));
            }
        }
    }, [newJunction.type, supportsFrameEngine, isXSDJunction, isBroadcastJunction]);

    // Form handlers
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setNewJunction({ ...newJunction, [name]: value });
    };

    const handleSelectChange = (e: SelectChangeEvent<string>) => {
        const { name, value } = e.target;

        // Handle gateway device selection
        if (name === "gatewayDeviceId") {
            const selectedDevice = gatewayDevices.find(device => device.id.toString() === value);

            // Update the junction with only the device ID
            setNewJunction({
                ...newJunction,
                gatewayDeviceId: value ? parseInt(value) : undefined
            });

            // Update display value for UI purposes only
            if (selectedDevice) {
                if (newJunction.type === "Gateway Junction (COM to ESP:NOW)") {
                    setDisplayGatewayDestination(selectedDevice.comPort || "");
                } else {
                    setDisplayGatewayDestination(selectedDevice.ipAddress || "");
                }
            } else {
                setDisplayGatewayDestination("");
            }
        } else {
            setNewJunction({ ...newJunction, [name]: value });

            // If junction type changes, update display destination for currently selected device
            if (name === "type" && newJunction.gatewayDeviceId) {
                const selectedDevice = gatewayDevices.find(device => device.id === newJunction.gatewayDeviceId);
                if (selectedDevice) {
                    if (value === "Gateway Junction (COM to ESP:NOW)") {
                        setDisplayGatewayDestination(selectedDevice.comPort || "");
                    } else {
                        setDisplayGatewayDestination(selectedDevice.ipAddress || "");
                    }
                }
            }
        }
    };

    const handleTypeSelect = (typeValue: string) => {
        setNewJunction({ ...newJunction, type: typeValue });
    };

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setNewJunction({ ...newJunction, [name]: checked });
    };

    const handleSave = async (redirect: boolean) => {
        setModalLoading(true);
        setError("");
        setConfigureAfterAdd(redirect);

        // Basic validation
        if (!newJunction.name) {
            setError("Junction name is required!");
            setModalLoading(false);
            return;
        }

        if (!newJunction.type || newJunction.type === "") {
            setError("Junction type is required!");
            setModalLoading(false);
            return;
        }

        // Validate gateway device selection for Gateway types
        if ((newJunction.type === "Gateway Junction (HTTP to ESP:NOW)" ||
            newJunction.type === "Gateway Junction (COM to ESP:NOW)" ||
            newJunction.type === "Gateway Junction (WebSocket to ESP:NOW)") &&
            !newJunction.gatewayDeviceId) {
            setError("Please select a gateway device for Gateway junctions!");
            setModalLoading(false);
            return;
        }

        try {
            // Create the payload - explicitly exclude any destination field
            const junctionPayload = {
                name: newJunction.name,
                description: newJunction.description,
                type: newJunction.type,
                renderingMode: newJunction.renderingMode, // Include rendering mode
                showOnDashboard: newJunction.showOnDashboard,
                autoStartOnLaunch: newJunction.autoStartOnLaunch,
                sortOrder: newJunction.sortOrder,
                status: "Idle",
                // Only include gatewayDeviceId if this is a gateway junction
                ...(shouldShowGatewaySelection() && { gatewayDeviceId: newJunction.gatewayDeviceId })
            };

            const response = await fetch("/api/junctions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(junctionPayload),
            });

            if (!response.ok) {
                // Handle different status codes appropriately
                if (response.status === 500) {
                    setError("A junction with this name already exists. Junction names must be unique.");
                    setModalLoading(false);
                    return;
                }

                let errorMessage = "Error creating junction";
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.message || errorMessage;
                } catch (parseError) {
                    errorMessage = response.statusText || errorMessage;
                }
                throw new Error(errorMessage);
            }

            const result = await response.json();
            if (result && typeof result.id === 'number') {
                onJunctionAdded(result.id, redirect);
                onClose();
            } else {
                setError("Failed to get valid junction ID from response");
                setModalLoading(false);
            }
        } catch (err) {
            // Handle unique constraint errors
            if (
                errorMessage(err).includes("unique") ||
                errorMessage(err).includes("duplicate") ||
                errorMessage(err).toLowerCase().includes("already exists") ||
                errorMessage(err).includes("constraint") ||
                errorMessage(err).includes("Internal Server Error")
            ) {
                setError("A junction with this name already exists. Junction names must be unique.");
            } else {
                setError(errorMessage(err));
            }
            console.error("Error creating junction:", err);
        } finally {
            setModalLoading(false);
        }
    };

    // Helper function to determine if a gateway device should be shown
    const shouldShowGatewaySelection = () => {
        return newJunction.type === "Gateway Junction (HTTP to ESP:NOW)" ||
            newJunction.type === "Gateway Junction (COM to ESP:NOW)" ||
            newJunction.type === "Gateway Junction (WebSocket to ESP:NOW)";
    };

    const currentTypeConfig = getCurrentTypeConfig();

    return (
        <Modal open={open} onClose={onClose}>
            <Box sx={MODAL_SHELL_SX}>
                <Box sx={MODAL_HEADER_SX}>
                    <Typography variant="h6" sx={MODAL_TITLE_SX}>
                        Create Junction
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Configure a data routing channel for your devices
                    </Typography>
                </Box>

                {modalLoading ? (
                    <Box sx={MODAL_LOADING_SX}>
                        <CircularProgress size={40} />
                    </Box>
                ) : (
                    <Box sx={MODAL_CONTENT_SX}>
                        {/* Left side - Junction types list (Desktop only) */}
                        <Paper
                            variant="outlined"
                            sx={MODAL_LEFT_PANEL_SX}
                        >
                            <List dense disablePadding>
                                {JUNCTION_GROUPS.map((group, groupIndex) => (
                                    <React.Fragment key={group.id}>
                                        {groupIndex > 0 && <Divider />}
                                        <Typography
                                            variant="caption"
                                            sx={MODAL_GROUP_HEADER_SX}
                                        >
                                            {group.name}
                                        </Typography>
                                        {group.types.map((junctionType) => (
                                            <ListItemButton
                                                key={junctionType.value}
                                                selected={newJunction.type === junctionType.value}
                                                onClick={() => handleTypeSelect(junctionType.value)}
                                                sx={MODAL_LIST_ITEM_SX}
                                            >
                                                <ListItemIcon sx={MODAL_LIST_ITEM_ICON_SX}>
                                                    <Typography sx={MODAL_LIST_ITEM_EMOJI_SX}>{junctionType.emoji}</Typography>
                                                </ListItemIcon>
                                                <ListItemText
                                                    primary={junctionType.name}
                                                    primaryTypographyProps={{ variant: 'body2', fontSize: '0.85rem' }}
                                                />
                                            </ListItemButton>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </List>
                        </Paper>

                        {/* Configuration form */}
                        <Box sx={MODAL_RIGHT_PANEL_SX}>
                            <Box sx={MODAL_FORM_AREA_SX}>
                                {error && (
                                    <Alert severity="error" sx={{ mb: 2 }}>
                                        {error}
                                    </Alert>
                                )}

                                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    {/* Junction Type Dropdown - Mobile only */}
                                    <Box sx={MODAL_MOBILE_DROPDOWN_SX}>
                                        <FormControl fullWidth size="small">
                                            <InputLabel id="junction-type-label">Junction Type *</InputLabel>
                                            <Select
                                                labelId="junction-type-label"
                                                value={newJunction.type || ""}
                                                onChange={handleSelectChange}
                                                name="type"
                                                required
                                                label="Junction Type *"
                                            >
                                                {JUNCTION_GROUPS.map((group) => [
                                                    <MenuItem key={`header-${group.id}`} disabled sx={MODAL_MOBILE_GROUP_HEADER_SX}>
                                                        {group.name}
                                                    </MenuItem>,
                                                    ...group.types.map((type) => (
                                                        <MenuItem key={type.value} value={type.value}>
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                <span>{type.emoji}</span>
                                                                {type.name}
                                                            </Box>
                                                        </MenuItem>
                                                    ))
                                                ])}
                                            </Select>
                                        </FormControl>
                                    </Box>

                                    {/* Type description */}
                                    {currentTypeConfig && (
                                        <Alert severity="info" sx={MODAL_TYPE_DESCRIPTION_SX}>
                                            {currentTypeConfig.desc}
                                        </Alert>
                                    )}

                                    {/* Only show form fields if junction type is selected */}
                                    {newJunction.type && newJunction.type !== "" && (
                                        <>
                                            <TextField
                                                fullWidth
                                                size="small"
                                                label="Junction Name"
                                                name="name"
                                                value={newJunction.name}
                                                onChange={handleChange}
                                                required
                                                error={!!error && error.includes("name")}
                                                helperText={error && error.includes("name") ? "Name must be unique" : "A unique name for this junction"}
                                            />

                                            <TextField
                                                fullWidth
                                                size="small"
                                                label="Description"
                                                name="description"
                                                value={newJunction.description}
                                                onChange={handleChange}
                                                multiline
                                                rows={2}
                                                placeholder="Optional description for this junction"
                                            />

                                            {/* Rendering Mode Selection — hidden for Broadcast (always Payload) */}
                                            {!isBroadcastJunction(newJunction.type || "") && (
                                                <FormControl fullWidth size="small">
                                                    <InputLabel id="rendering-mode-label">Rendering Mode</InputLabel>
                                                    <Select
                                                        labelId="rendering-mode-label"
                                                        name="renderingMode"
                                                        value={newJunction.renderingMode || "Payload"}
                                                        onChange={handleSelectChange}
                                                        label="Rendering Mode"
                                                        disabled={!supportsFrameEngine(newJunction.type || "")}
                                                    >
                                                        {getAvailableRenderingModes().map((mode) => (
                                                            <MenuItem key={mode.value} value={mode.value}>
                                                                <Box>
                                                                    <Typography variant="body2" fontWeight="medium">
                                                                        {mode.name}
                                                                    </Typography>
                                                                    <Typography variant="caption" color="text.secondary">
                                                                        {mode.desc}
                                                                    </Typography>
                                                                </Box>
                                                            </MenuItem>
                                                        ))}
                                                    </Select>
                                                </FormControl>
                                            )}

                                            {/* Payload Selection — shown for Broadcast junctions */}
                                            {isBroadcastJunction(newJunction.type || "") && (
                                                <FormControl fullWidth size="small">
                                                    <InputLabel id="payload-select-label">Payload</InputLabel>
                                                    <Select
                                                        labelId="payload-select-label"
                                                        value={selectedPayloadId}
                                                        onChange={(e) => setSelectedPayloadId(e.target.value)}
                                                        label="Payload"
                                                    >
                                                        {payloads.length === 0 ? (
                                                            <MenuItem disabled>No payloads available</MenuItem>
                                                        ) : (
                                                            payloads.map((p) => (
                                                                <MenuItem key={p.id} value={p.id}>
                                                                    {p.displayName}
                                                                </MenuItem>
                                                            ))
                                                        )}
                                                    </Select>
                                                </FormControl>
                                            )}

                                            {/* Gateway Device Selection - only show for Gateway types */}
                                            {shouldShowGatewaySelection() && (
                                                <>
                                                    <FormControl fullWidth size="small" error={shouldShowGatewaySelection() && !newJunction.gatewayDeviceId}>
                                                        <InputLabel id="gateway-device-label">Gateway Device</InputLabel>
                                                        <Select
                                                            labelId="gateway-device-label"
                                                            name="gatewayDeviceId"
                                                            value={newJunction.gatewayDeviceId?.toString() || ""}
                                                            onChange={handleSelectChange}
                                                            label="Gateway Device"
                                                            required
                                                            error={shouldShowGatewaySelection() && !newJunction.gatewayDeviceId}
                                                        >
                                                            {gatewayDevices.length === 0 ? (
                                                                <MenuItem disabled>
                                                                    No gateway devices found
                                                                </MenuItem>
                                                            ) : (
                                                                gatewayDevices.map((device) => (
                                                                    <MenuItem key={device.id} value={device.id.toString()}>
                                                                        {newJunction.type === "Gateway Junction (COM to ESP:NOW)"
                                                                            ? `${device.name} (${device.comPort || 'No COM port'})`
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
                                                            label={newJunction.type === "Gateway Junction (COM to ESP:NOW)" ? "Gateway COM Port" : "Gateway IP Address"}
                                                            value={displayGatewayDestination}
                                                            disabled
                                                            helperText={
                                                                (newJunction.type === "Gateway Junction (COM to ESP:NOW)"
                                                                    ? "COM port of the selected gateway device (for display only)"
                                                                    : "IP address of the selected gateway device (for display only)")
                                                            }
                                                        />
                                                    )}

                                                    {/* Show error message if gateway is required but not selected */}
                                                    {shouldShowGatewaySelection() && !newJunction.gatewayDeviceId && (
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            label={newJunction.type === "Gateway Junction (COM to ESP:NOW)" ? "Gateway COM Port" : "Gateway IP Address"}
                                                            value=""
                                                            disabled
                                                            error={true}
                                                            helperText="Gateway device selection is required for this junction type"
                                                        />
                                                    )}
                                                </>
                                            )}

                                            {/* Configuration checkboxes - side by side */}
                                            <Box sx={{ display: "flex", flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
                                                <FormControlLabel
                                                    control={
                                                        <Checkbox
                                                            checked={newJunction.showOnDashboard || false}
                                                            onChange={handleCheckboxChange}
                                                            name="showOnDashboard"
                                                            size="small"
                                                        />
                                                    }
                                                    label="Show on Dashboard"
                                                />

                                                <FormControlLabel
                                                    control={
                                                        <Checkbox
                                                            checked={newJunction.autoStartOnLaunch || false}
                                                            onChange={handleCheckboxChange}
                                                            name="autoStartOnLaunch"
                                                            size="small"
                                                        />
                                                    }
                                                    label="Auto Start on Launch"
                                                />
                                            </Box>
                                        </>
                                    )}
                                </Box>
                            </Box>

                            {/* Instructions - responsive height - Hide on mobile */}
                            {newJunction.type && newJunction.type !== "" && (
                                <Paper
                                    variant="outlined"
                                    sx={MODAL_INSTRUCTIONS_PANEL_SX}
                                >
                                    <Box
                                        sx={MODAL_INSTRUCTIONS_TOGGLE_SX}
                                        onClick={() => setShowInstructions(!showInstructions)}
                                    >
                                        <Typography variant="subtitle2">Setup Instructions</Typography>
                                        {showInstructions ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                    </Box>
                                    <Collapse in={showInstructions}>
                                        <Divider />
                                        <Box sx={MODAL_INSTRUCTIONS_CONTENT_SX}>
                                            <SetupInstructions_Junctions junctionType={newJunction.type} />
                                        </Box>
                                    </Collapse>
                                </Paper>
                            )}

                            {/* Action buttons - right-aligned */}
                            <Box sx={MODAL_ACTIONS_SX}>
                                <Button
                                    variant="outlined"
                                    onClick={onClose}
                                    size="small"
                                    disabled={modalLoading}
                                    sx={{ order: { xs: 3, sm: 1 } }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="contained"
                                    onClick={() => handleSave(false)}
                                    size="small"
                                    startIcon={<AddIcon />}
                                    disabled={modalLoading || !newJunction.type || newJunction.type === ""}
                                    sx={{ order: { xs: 2, sm: 2 } }}
                                >
                                    {modalLoading && !configureAfterAdd ? "Creating..." : "Create Junction"}
                                </Button>
                                <Button
                                    variant="contained"
                                    color="secondary"
                                    onClick={() => handleSave(true)}
                                    size="small"
                                    startIcon={<EditIcon />}
                                    disabled={modalLoading || !newJunction.type || newJunction.type === ""}
                                    sx={{ order: { xs: 1, sm: 3 } }}
                                >
                                    {modalLoading && configureAfterAdd ? "Creating..." : "Create & Configure Junction"}
                                </Button>
                            </Box>
                        </Box>
                    </Box>
                )}
            </Box>
        </Modal>
    );
};

export default AddJunctionModal;
