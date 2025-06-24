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
    Checkbox, FormControlLabel, CircularProgress
} from "@mui/material";

interface Screen {
    id: number;
    displayName: string;
    description?: string;
}

interface ScreenSelectionModalProps {
    open: boolean;
    onClose: () => void;
    sensor: any;
    device: any;
    screens: Screen[];
    selectedScreenIds: number[];
    onScreensSelected: (screenIds: number[]) => Promise<void>;
    showSnackbar: (message: string, severity?: "success" | "info" | "warning" | "error") => void;
}

const ScreenSelectionModal: React.FC<ScreenSelectionModalProps> = ({
    open,
    onClose,
    sensor,
    device,
    screens,
    selectedScreenIds,
    onScreensSelected,
    showSnackbar
}) => {
    // Use state with proper initialization
    const [localScreenIds, setLocalScreenIds] = useState<number[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    // Initialize local state when modal opens or selectedScreenIds changes
    useEffect(() => {
        if (open) {
            setLocalScreenIds([...selectedScreenIds]);
        }
    }, [open, selectedScreenIds]);

    const handleScreenToggle = useCallback((screenId: number) => {
        setLocalScreenIds(prevIds => {
            if (prevIds.includes(screenId)) {
                return prevIds.filter(id => id !== screenId);
            } else {
                return [...prevIds, screenId];
            }
        });
    }, []);

    const handleSave = async () => {
        try {
            setIsLoading(true);

            // Prevent modal from closing until operation completes
            await onScreensSelected(localScreenIds);

            // Only close modal after successful save
            onClose();
        } catch (error: unknown) {
            console.error("Error saving screen assignments:", error);

            let errorMessage = "Unknown error";
            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (error !== null && error !== undefined) {
                errorMessage = String(error);
            }

            // Use the showSnackbar function for better UX
            showSnackbar(`Failed to save screen assignments: ${errorMessage}`, "error");

            // Don't close modal on error so user can try again
        } finally {
            setIsLoading(false);
        }
    };

    // Render null if not open or missing required props
    if (!open || !sensor || !device) return null;

    return (
        <Modal
            open={open}
            onClose={isLoading ? undefined : onClose} // Prevent closing during loading
            aria-labelledby="screen-selection-modal-title"
            keepMounted={false} // Important: Don't keep mounted when closed
        >
            <Box sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 400,
                bgcolor: 'background.paper',
                borderRadius: 2,
                boxShadow: 24,
                p: 4,
            }}>
                <Typography id="screen-selection-modal-title" variant="h6" component="h2" gutterBottom>
                    Assign Screens for {sensor.name}
                </Typography>
                <Typography variant="subtitle1" gutterBottom>
                    Device: {device.name}
                </Typography>

                <Divider sx={{ my: 2 }} />

                {screens.length === 0 ? (
                    <Typography color="text.secondary">
                        No screens available for this device.
                    </Typography>
                ) : (
                    <Box sx={{ maxHeight: 300, overflowY: 'auto', mt: 2 }}>
                        <FormGroup>
                            {screens.map((screen) => (
                                <FormControlLabel
                                    key={screen.id}
                                    control={
                                        <Checkbox
                                            checked={localScreenIds.includes(screen.id)}
                                            onChange={() => handleScreenToggle(screen.id)}
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
                    </Box>
                )}

                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3, gap: 2 }}>
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