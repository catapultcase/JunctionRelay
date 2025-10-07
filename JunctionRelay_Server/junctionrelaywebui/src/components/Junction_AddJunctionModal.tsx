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
    IconButton,
    Divider,
} from "@mui/material";
// Icon imports
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import MinimizeIcon from '@mui/icons-material/Minimize';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Junction } from "./JunctionsTable";
import SetupInstructions_Junctions from '../components/SetupInstructions_Junctions';

interface AddJunctionModalProps {
    open: boolean;
    onClose: () => void;
    onJunctionAdded: (id: number, redirect: boolean) => void;
    junctions: Junction[];
}

interface GatewayDevice {
    id: number;
    name: string;
    ipAddress: string;
    COMPort?: string;
    comPort?: string;
}

const AddJunctionModal: React.FC<AddJunctionModalProps> = ({
    open,
    onClose,
    onJunctionAdded,
    junctions
}) => {
    const [modalLoading, setModalLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>("");
    const [gatewayDevices, setGatewayDevices] = useState<GatewayDevice[]>([]);
    const hasBeenOpenedRef = useRef<boolean>(false);
    const [configureAfterAdd, setConfigureAfterAdd] = useState<boolean>(false);

    // State for the add junction form
    const [newJunction, setNewJunction] = useState<Partial<Junction>>({
        name: "",
        description: "",
        type: "COM Junction",
        renderingMode: "Payload", // Add rendering mode
        showOnDashboard: true,
        autoStartOnLaunch: false,
        deviceLinks: [],
        collectorLinks: [],
        sortOrder: 0,
        gatewayDeviceId: undefined // Only store the device ID, not the destination
    });

    // Separate state for UI display purposes only
    const [displayGatewayDestination, setDisplayGatewayDestination] = useState<string>("");
    const [setupInstructionsMinimized, setSetupInstructionsMinimized] = useState<boolean>(false);

    // Junction type options for dropdown
    const junctionTypes = [
        { value: "", name: "Select Junction Type", desc: "Choose a junction type to begin" },
        { value: "COM Junction", name: "COM Junction", desc: "Serial port communication" },
        { value: "HTTP Junction", name: "HTTP Junction", desc: "HTTP REST API endpoints" },
        { value: "MQTT Junction", name: "MQTT Junction", desc: "Message broker communication" },
        { value: "Virtual Junction", name: "Virtual Junction", desc: "Internal data processing only" },
        { value: "WebSocket Junction", name: "WebSocket Junction", desc: "Real-time bidirectional communication" },
        { value: "Gateway Junction (COM to ESP:NOW)", name: "Gateway Junction (COM to ESP:NOW)", desc: "Serial to ESP:NOW gateway" },
        { value: "Gateway Junction (HTTP to ESP:NOW)", name: "Gateway Junction (HTTP to ESP:NOW)", desc: "HTTP to ESP:NOW gateway" },
        { value: "Gateway Junction (WebSocket to ESP:NOW)", name: "Gateway Junction (WebSocket to ESP:NOW)", desc: "WebSocket to ESP:NOW gateway" },
    ];

    // Rendering mode options
    const renderingModeOptions = [
        { value: "Payload", name: "Data Payloads", desc: "Send raw data payloads to target devices" },
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

    // Get available rendering modes based on junction type
    const getAvailableRenderingModes = useCallback(() => {
        if (!newJunction.type || !supportsFrameEngine(newJunction.type)) {
            return renderingModeOptions.filter(mode => mode.value === "Payload");
        }
        return renderingModeOptions;
    }, [newJunction.type, supportsFrameEngine]);

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

        if (open) {
            loadGatewayDevices();
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
            type: "COM Junction",
            renderingMode: "Payload", // Default rendering mode
            showOnDashboard: true,
            autoStartOnLaunch: false,
            deviceLinks: [],
            collectorLinks: [],
            sortOrder: highestSortOrder + 1,
            gatewayDeviceId: undefined // Only store the device ID
        });
        setDisplayGatewayDestination(""); // Reset display value
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
            const selectedType = junctionTypes.find(type => type.value === newJunction.type);
            if (selectedType && selectedType.value !== "") {
                setNewJunction((prev) => ({
                    ...prev,
                    name: selectedType.name
                }));
            }
        }
    }, [newJunction.type]);

    // Reset rendering mode when junction type changes and doesn't support FrameEngine
    useEffect(() => {
        if (newJunction.type && !supportsFrameEngine(newJunction.type)) {
            setNewJunction((prev) => ({
                ...prev,
                renderingMode: "Payload"
            }));
        }
    }, [newJunction.type, supportsFrameEngine]);

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
                    setDisplayGatewayDestination(selectedDevice.COMPort || selectedDevice.comPort || "");
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
                        setDisplayGatewayDestination(selectedDevice.COMPort || selectedDevice.comPort || "");
                    } else {
                        setDisplayGatewayDestination(selectedDevice.ipAddress || "");
                    }
                }
            }
        }
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
        } catch (err: any) {
            // Handle unique constraint errors
            if (
                err.message.includes("unique") ||
                err.message.includes("duplicate") ||
                err.message.toLowerCase().includes("already exists") ||
                err.message.includes("constraint") ||
                err.message.includes("Internal Server Error")
            ) {
                setError("A junction with this name already exists. Junction names must be unique.");
            } else {
                setError(err.message);
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

    return (
        <Modal open={open} onClose={onClose}>
            <Box sx={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: { xs: 'auto', sm: '90%', md: '80%' },
                maxWidth: { xs: '95vw', md: 900 },
                minWidth: { xs: 320, sm: 400 },
                height: 'auto',
                maxHeight: { xs: '90vh', md: '80vh' },
                bgcolor: 'background.paper',
                p: 0,
                boxShadow: 24,
                borderRadius: 2,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                <Typography variant="h6" sx={{
                    p: { xs: 2, md: 3 },
                    pb: 2,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    fontSize: { xs: '1.1rem', md: '1.25rem' }
                }}>
                    Add Junction
                </Typography>

                {modalLoading ? (
                    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1 }}>
                        <CircularProgress size={40} />
                    </Box>
                ) : (
                    <Box sx={{
                        display: 'flex',
                        flexDirection: { xs: 'column', md: 'row' },
                        flex: 1,
                        overflow: 'hidden',
                        minHeight: 0
                    }}>
                        {/* Left side - Junction types list (Desktop only) */}
                        <Box sx={{
                            width: { md: 280 },
                            borderRight: { md: '1px solid' },
                            borderColor: 'divider',
                            overflowY: 'auto',
                            bgcolor: 'action.hover',
                            display: { xs: 'none', md: 'block' }
                        }}>
                            <Typography variant="subtitle2" sx={{ p: 2, pb: 1, fontWeight: 'bold', color: 'text.secondary' }}>
                                Select Junction Type
                            </Typography>
                            {junctionTypes.slice(1).map((junctionType) => (
                                <Box
                                    key={junctionType.value}
                                    onClick={() => setNewJunction({ ...newJunction, type: junctionType.value })}
                                    sx={{
                                        p: 2,
                                        mx: 1,
                                        mb: 1,
                                        borderRadius: 1,
                                        cursor: 'pointer',
                                        bgcolor: newJunction.type === junctionType.value ? 'primary.main' : 'transparent',
                                        color: newJunction.type === junctionType.value ? 'primary.contrastText' : 'text.primary',
                                        '&:hover': {
                                            bgcolor: newJunction.type === junctionType.value ? 'primary.dark' : 'action.hover'
                                        },
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <Typography variant="body2" fontWeight={newJunction.type === junctionType.value ? 'bold' : 'medium'}>
                                        {junctionType.name}
                                    </Typography>
                                    <Typography variant="caption" sx={{
                                        opacity: newJunction.type === junctionType.value ? 0.9 : 0.7,
                                        display: 'block'
                                    }}>
                                        {junctionType.desc}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>

                        {/* Configuration form */}
                        <Box sx={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            order: { xs: 1, md: 2 }
                        }}>
                            <Box sx={{
                                p: { xs: 2, md: 3 },
                                overflowY: 'auto',
                                flex: 1
                            }}>
                                {error && (
                                    <Alert severity="error" sx={{ mb: 2 }}>
                                        {error}
                                    </Alert>
                                )}

                                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    {/* Junction Type Dropdown - Mobile only */}
                                    <Box sx={{ display: { xs: 'block', md: 'none' } }}>
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
                                                {junctionTypes.map((type) => (
                                                    <MenuItem key={type.value} value={type.value} disabled={type.value === ""}>
                                                        <Box>
                                                            <Typography variant="body2" fontWeight="medium">
                                                                {type.name}
                                                            </Typography>
                                                            {type.value !== "" && (
                                                                <Typography variant="caption" color="text.secondary">
                                                                    {type.desc}
                                                                </Typography>
                                                            )}
                                                        </Box>
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Box>

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
                                                helperText={error && error.includes("name") ? "Name must be unique" : ""}
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

                                            {/* Rendering Mode Selection */}
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
                                <Box sx={{
                                    display: { xs: 'none', md: 'block' },
                                    borderTop: '1px solid',
                                    borderColor: 'divider'
                                }}>
                                    {/* Always Visible Header */}
                                    <Box sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        p: 2,
                                        bgcolor: 'action.hover',
                                        cursor: 'pointer',
                                        '&:hover': {
                                            bgcolor: 'action.selected'
                                        }
                                    }}
                                        onClick={() => setSetupInstructionsMinimized(!setupInstructionsMinimized)}
                                    >
                                        <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
                                            Junction Information
                                        </Typography>
                                        <IconButton size="small" sx={{ p: 0 }}>
                                            {setupInstructionsMinimized ? <ExpandMoreIcon /> : <MinimizeIcon />}
                                        </IconButton>
                                    </Box>

                                    {/* Collapsible Content */}
                                    {!setupInstructionsMinimized && (
                                        <Box sx={{
                                            maxHeight: '300px',
                                            p: 3,
                                            overflowY: 'auto',
                                            bgcolor: 'background.default'
                                        }}>
                                            <SetupInstructions_Junctions junctionType={newJunction.type} />
                                        </Box>
                                    )}
                                </Box>
                            )}

                            {/* Action buttons - responsive layout */}
                            <Box sx={{
                                p: { xs: 2, md: 3 },
                                borderTop: '1px solid',
                                borderColor: 'divider',
                                display: "flex",
                                flexDirection: { xs: 'column', sm: 'row' },
                                gap: { xs: 1, sm: 2 },
                                flexShrink: 0
                            }}>
                                <Button
                                    variant="contained"
                                    onClick={() => handleSave(false)}
                                    size="small"
                                    startIcon={<AddIcon />}
                                    disabled={modalLoading || !newJunction.type || newJunction.type === ""}
                                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                                >
                                    {modalLoading && !configureAfterAdd ? "Adding..." : "Add Junction"}
                                </Button>
                                <Button
                                    variant="contained"
                                    onClick={() => handleSave(true)}
                                    size="small"
                                    color="secondary"
                                    startIcon={<EditIcon />}
                                    disabled={modalLoading || !newJunction.type || newJunction.type === ""}
                                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                                >
                                    {modalLoading && configureAfterAdd ? "Adding..." : "Add & Configure"}
                                </Button>
                                <Button
                                    variant="outlined"
                                    onClick={onClose}
                                    size="small"
                                    disabled={modalLoading}
                                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                                >
                                    Cancel
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