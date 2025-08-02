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
} from "@mui/material";
import { Junction } from "./JunctionsTable";

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

    // State for the add junction form
    const [newJunction, setNewJunction] = useState<Partial<Junction>>({
        name: "",
        description: "",
        type: "COM Junction",
        showOnDashboard: true,
        autoStartOnLaunch: false,
        allTargetsAllData: false,
        deviceLinks: [],
        collectorLinks: [],
        sortOrder: 0,
        gatewayDeviceId: undefined // Only store the device ID, not the destination
    });

    // Separate state for UI display purposes only
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
            showOnDashboard: true,
            autoStartOnLaunch: false,
            allTargetsAllData: false,
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

        // Basic validation
        if (!newJunction.name) {
            setError("Junction name is required!");
            setModalLoading(false);
            return;
        }

        // Validate gateway device selection for Gateway types
        if ((newJunction.type === "Gateway Junction (HTTP to ESP:NOW)" ||
            newJunction.type === "Gateway Junction (COM to ESP:NOW)" ||
            newJunction.type === "Gateway Junction (Websocket to ESP:NOW)") &&
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
                showOnDashboard: newJunction.showOnDashboard,
                autoStartOnLaunch: newJunction.autoStartOnLaunch,
                allTargetsAllData: newJunction.allTargetsAllData,
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
                throw new Error("Failed to create junction");
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
            setError(err.message);
            setModalLoading(false);
        }
    };

    // Helper function to determine if a gateway device should be shown
    const shouldShowGatewaySelection = () => {
        return newJunction.type === "Gateway Junction (HTTP to ESP:NOW)" ||
            newJunction.type === "Gateway Junction (COM to ESP:NOW)" ||
            newJunction.type === "Gateway Junction (Websocket to ESP:NOW)";
    };

    return (
        <Modal open={open} onClose={onClose}>
            <Box sx={{
                position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                width: '80%', maxWidth: 600, bgcolor: 'background.paper', p: 4, boxShadow: 24, borderRadius: 2
            }}>
                <Typography variant="h6" gutterBottom>Create New Junction</Typography>
                {modalLoading ? (
                    <Box sx={{ display: "flex", justifyContent: "center" }}>
                        <CircularProgress size={24} />
                    </Box>
                ) : (
                    <>
                        {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}

                        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <TextField
                                fullWidth
                                size="small"
                                label="Junction Name"
                                name="name"
                                value={newJunction.name}
                                onChange={handleChange}
                                required
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
                            />

                            <FormControl fullWidth size="small">
                                <InputLabel id="junction-type-label">Junction Type</InputLabel>
                                <Select
                                    labelId="junction-type-label"
                                    name="type"
                                    value={newJunction.type as string}
                                    onChange={handleSelectChange}
                                    label="Junction Type"
                                >
                                    <MenuItem value="COM Junction">COM Junction</MenuItem>
                                    <MenuItem value="HTTP Junction">HTTP Junction</MenuItem>
                                    <MenuItem value="MQTT Junction">MQTT Junction</MenuItem>
                                    <MenuItem value="Websocket Junction">Websocket Junction</MenuItem>
                                    <MenuItem value="Gateway Junction (COM to ESP:NOW)">Gateway Junction (COM to ESP:NOW)</MenuItem>
                                    <MenuItem value="Gateway Junction (HTTP to ESP:NOW)">Gateway Junction (HTTP to ESP:NOW)</MenuItem>
                                    <MenuItem value="Gateway Junction (Websocket to ESP:NOW)">Gateway Junction (Websocket to ESP:NOW)</MenuItem>
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

                            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
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

                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={newJunction.allTargetsAllData || false}
                                            onChange={handleCheckboxChange}
                                            name="allTargetsAllData"
                                            size="small"
                                        />
                                    }
                                    label="All Targets All Data"
                                />
                            </Box>
                        </Box>

                        <Box sx={{ display: "flex", gap: 2, marginTop: 3, justifyContent: "flex-end" }}>
                            <Button
                                variant="contained"
                                onClick={() => handleSave(false)}
                                size="small"
                            >
                                Save
                            </Button>

                            <Button
                                variant="contained"
                                color="secondary"
                                onClick={() => handleSave(true)}
                                size="small"
                            >
                                Save & Configure
                            </Button>

                            <Button
                                variant="outlined"
                                onClick={onClose}
                                size="small"
                            >
                                Cancel
                            </Button>
                        </Box>
                    </>
                )}
            </Box>
        </Modal>
    );
};

export default AddJunctionModal;