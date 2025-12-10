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

import React, { useState, useEffect, useCallback } from "react";
import {
    Typography, Box, Modal, FormGroup, Button, Divider,
    Checkbox, FormControlLabel, CircularProgress, Accordion, AccordionSummary, AccordionDetails, Chip
} from "@mui/material";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import IconButton from '@mui/material/IconButton';

interface Screen {
    id: number;
    displayName: string;
    description?: string;
}

interface Target {
    id: number;
    name: string;
    type: string;
}

interface ScreenSelectionModalProps {
    open: boolean;
    onClose: () => void;
    sensor: any;
    showSnackbar: (message: string, severity?: "success" | "info" | "warning" | "error") => void;
    // Multi-device mode props
    allTargets: Target[];
    sensorTargets: Array<{ deviceId: number; screenIds: number[] }>;
    deviceScreensMap: { [deviceId: number]: Screen[] };
    onDeviceAssign: (deviceId: number) => Promise<void>;
    onDeviceRemove: (deviceId: number) => Promise<void>;
    onScreenAssignmentUpdate: (deviceId: number, screenIds: number[]) => Promise<void>;
}

const ScreenSelectionModal: React.FC<ScreenSelectionModalProps> = ({
    open,
    onClose,
    sensor,
    showSnackbar,
    allTargets,
    sensorTargets,
    deviceScreensMap,
    onDeviceAssign,
    onDeviceRemove,
    onScreenAssignmentUpdate
}) => {
    const [localDeviceScreens, setLocalDeviceScreens] = useState<{ [deviceId: number]: number[] }>({});
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);

    // Initialize local state when modal opens
    useEffect(() => {
        if (open) {
            const initialState: { [deviceId: number]: number[] } = {};
            sensorTargets.forEach(target => {
                initialState[target.deviceId] = target.screenIds ? [...target.screenIds] : [];
            });
            setLocalDeviceScreens(initialState);

            // Auto-select first assigned device, or first device if none assigned
            const assignedDevices = Object.keys(initialState);
            if (assignedDevices.length > 0) {
                setSelectedDeviceId(parseInt(assignedDevices[0], 10));
            } else {
                const firstDevice = allTargets.find(t => t.type === "device");
                if (firstDevice) {
                    setSelectedDeviceId(firstDevice.id);
                }
            }
        }
    }, [open, sensorTargets, allTargets]);

    const handleScreenToggle = useCallback((screenId: number, deviceId: number) => {
        setLocalDeviceScreens(prev => {
            const current = prev[deviceId] || [];
            const updated = current.includes(screenId)
                ? current.filter(id => id !== screenId)
                : [...current, screenId];
            return { ...prev, [deviceId]: updated };
        });
    }, []);

    const handleDeviceToggle = async (deviceId: number, isCurrentlyAssigned: boolean) => {
        try {
            setIsLoading(true);
            if (isCurrentlyAssigned) {
                await onDeviceRemove?.(deviceId);
                setLocalDeviceScreens(prev => {
                    const newState = { ...prev };
                    delete newState[deviceId];
                    return newState;
                });
            } else {
                await onDeviceAssign?.(deviceId);
                setLocalDeviceScreens(prev => ({ ...prev, [deviceId]: [] }));
            }
        } catch (error) {
            console.error("Error toggling device:", error);
            showSnackbar("Failed to update device assignment", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setIsLoading(true);

            // Save all device screen assignments
            for (const [deviceIdStr, screenIds] of Object.entries(localDeviceScreens)) {
                const deviceId = parseInt(deviceIdStr, 10);
                await onScreenAssignmentUpdate(deviceId, screenIds);
            }
            showSnackbar("All screen assignments updated successfully", "success");

            await new Promise(resolve => setTimeout(resolve, 100));
            onClose();

        } catch (error: unknown) {
            console.error("Error saving screen assignments:", error);
            let errorMessage = "Unknown error";
            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (error !== null && error !== undefined) {
                errorMessage = String(error);
            }
            showSnackbar(`Failed to save screen assignments: ${errorMessage}`, "error");
        } finally {
            setIsLoading(false);
        }
    };

    // Render null if not open or missing required props
    if (!open || !sensor) return null;

    return (
        <Modal
            open={open}
            onClose={isLoading ? undefined : onClose}
            aria-labelledby="screen-selection-modal-title"
            keepMounted={false}
        >
            <Box sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 700,
                height: '70vh',
                bgcolor: 'background.paper',
                borderRadius: 2,
                boxShadow: 24,
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* Header */}
                <Box sx={{ p: 3, pb: 2 }}>
                    <Typography id="screen-selection-modal-title" variant="h6" component="h2">
                        Target & Screen Assignment - {sensor.name || sensor.sensorTag}
                    </Typography>
                </Box>

                <Divider />

                {/* Split pane content */}
                <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    {/* Left pane - Devices */}
                    <Box sx={{
                        width: '250px',
                        borderRight: 1,
                        borderColor: 'divider',
                        overflow: 'auto'
                    }}>
                        <Box sx={{ p: 2, pb: 1 }}>
                            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                                TARGET DEVICES
                            </Typography>
                        </Box>
                        {allTargets.filter(t => t.type === "device").map((target) => {
                            const isAssigned = target.id in localDeviceScreens;
                            const assignedScreenIds = localDeviceScreens[target.id] || [];
                            const isSelected = selectedDeviceId === target.id;

                            return (
                                <Box
                                    key={target.id}
                                    onClick={() => setSelectedDeviceId(target.id)}
                                    sx={{
                                        px: 2,
                                        py: 1,
                                        cursor: 'pointer',
                                        bgcolor: isSelected ? 'action.selected' : 'transparent',
                                        '&:hover': { bgcolor: isSelected ? 'action.selected' : 'action.hover' },
                                        borderLeft: isSelected ? 3 : 0,
                                        borderColor: 'primary.main'
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Checkbox
                                            checked={isAssigned}
                                            onChange={(e) => {
                                                e.stopPropagation();
                                                handleDeviceToggle(target.id, isAssigned);
                                            }}
                                            disabled={isLoading}
                                            onClick={(e) => e.stopPropagation()}
                                            size="small"
                                        />
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Typography variant="body2" noWrap>{target.name}</Typography>
                                            {isAssigned && assignedScreenIds.length > 0 && (
                                                <Typography variant="caption" color="text.secondary">
                                                    {assignedScreenIds.length} screen{assignedScreenIds.length !== 1 ? 's' : ''}
                                                </Typography>
                                            )}
                                        </Box>
                                    </Box>
                                </Box>
                            );
                        })}
                    </Box>

                    {/* Right pane - Screens */}
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {selectedDeviceId !== null ? (
                            <>
                                <Box sx={{ p: 2, pb: 1 }}>
                                    <Typography variant="subtitle2" color="text.secondary">
                                        SCREENS FOR {allTargets.find(t => t.id === selectedDeviceId)?.name.toUpperCase()}
                                    </Typography>
                                </Box>
                                <Box sx={{ flex: 1, overflow: 'auto', px: 2 }}>
                                    {(() => {
                                        const isAssigned = selectedDeviceId in localDeviceScreens;
                                        const deviceScreens = deviceScreensMap[selectedDeviceId] || [];
                                        const assignedScreenIds = localDeviceScreens[selectedDeviceId] || [];

                                        if (!isAssigned) {
                                            return (
                                                <Box sx={{ py: 4, textAlign: 'center' }}>
                                                    <Typography color="text.secondary">
                                                        Check the device checkbox to assign screens
                                                    </Typography>
                                                </Box>
                                            );
                                        }

                                        if (deviceScreens.length === 0) {
                                            return (
                                                <Box sx={{ py: 4, textAlign: 'center' }}>
                                                    <Typography color="text.secondary">
                                                        No screens available for this device
                                                    </Typography>
                                                </Box>
                                            );
                                        }

                                        return (
                                            <FormGroup>
                                                {deviceScreens.map((screen) => (
                                                    <FormControlLabel
                                                        key={screen.id}
                                                        control={
                                                            <Checkbox
                                                                checked={assignedScreenIds.includes(screen.id)}
                                                                onChange={() => handleScreenToggle(screen.id, selectedDeviceId)}
                                                                size="small"
                                                                disabled={isLoading}
                                                            />
                                                        }
                                                        label={
                                                            <Box>
                                                                <Typography variant="body2">{screen.displayName}</Typography>
                                                                {screen.description && (
                                                                    <Typography variant="caption" color="text.secondary" display="block">
                                                                        {screen.description}
                                                                    </Typography>
                                                                )}
                                                            </Box>
                                                        }
                                                    />
                                                ))}
                                            </FormGroup>
                                        );
                                    })()}
                                </Box>
                            </>
                        ) : (
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                <Typography color="text.secondary">
                                    Select a device to view screens
                                </Typography>
                            </Box>
                        )}
                    </Box>
                </Box>

                <Divider />

                {/* Footer buttons */}
                <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={onClose}
                        disabled={isLoading}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        size="small"
                        onClick={handleSave}
                        color="primary"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <CircularProgress size={16} sx={{ mr: 1 }} />
                                Saving...
                            </Box>
                        ) : "Save"}
                    </Button>
                </Box>
            </Box>
        </Modal>
    );
};

export default ScreenSelectionModal;