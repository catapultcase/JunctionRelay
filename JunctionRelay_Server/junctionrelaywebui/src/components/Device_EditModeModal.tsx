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

import React, { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    Alert,
    CircularProgress
} from '@mui/material';

// Icons
import EditIcon from '@mui/icons-material/Edit';
import WarningIcon from '@mui/icons-material/Warning';
import SyncIcon from '@mui/icons-material/Sync';

interface Device_EditModeModalProps {
    open: boolean;
    onClose: () => void;
    deviceId: string;
    deviceName: string;
    onSuccess: () => void;
    showSnackbar: (message: string, severity: 'success' | 'error' | 'warning' | 'info') => void;
}

const Device_EditModeModal: React.FC<Device_EditModeModalProps> = ({
    open,
    onClose,
    deviceId,
    deviceName,
    onSuccess,
    showSnackbar
}) => {
    const [loading, setLoading] = useState(false);

    const handleConfirm = async () => {
        setLoading(true);

        try {
            // First, get the current device data
            const getResponse = await fetch(`/api/devices/${deviceId}`);
            if (!getResponse.ok) {
                throw new Error(`Failed to fetch device: ${getResponse.status} ${getResponse.statusText}`);
            }

            const currentDevice = await getResponse.json();

            // Update the device with Custom type
            const updatedDevice = {
                ...currentDevice,
                type: 'Custom'
            };

            const response = await fetch(`/api/devices/${deviceId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updatedDevice)
            });

            if (!response.ok) {
                throw new Error(`Failed to update device: ${response.status} ${response.statusText}`);
            }

            showSnackbar(
                'Device converted to Custom type. You can now edit all fields manually.',
                'success'
            );

            onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Edit mode conversion error:', err);
            showSnackbar(
                `Failed to enable edit mode: ${err.message}`,
                'error'
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                <Box display="flex" alignItems="center" gap={1}>
                    <EditIcon />
                    <Typography variant="h6">
                        Enable Manual Edit Mode
                    </Typography>
                </Box>
            </DialogTitle>

            <DialogContent>
                <Alert severity="warning" sx={{ mb: 3 }}>
                    <Box display="flex" alignItems="center" gap={1} mb={1}>
                        <WarningIcon />
                        <Typography variant="subtitle1" fontWeight="bold">
                            Important: This will override device auto-configuration
                        </Typography>
                    </Box>
                </Alert>

                <Typography variant="body1" paragraph>
                    You are about to enable manual edit mode for <strong>{deviceName}</strong>.
                </Typography>

                <Typography variant="body1" paragraph>
                    This will:
                </Typography>

                <Box component="ul" sx={{ mt: 1, mb: 2, pl: 3 }}>
                    <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                        Change the device type to <strong>"Custom"</strong>
                    </Typography>
                    <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                        Allow you to manually override all device fields, screens, and I2C devices
                    </Typography>
                    <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                        Disable automatic synchronization with the physical device
                    </Typography>
                    <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                        Enable full editing capabilities in all configuration panels
                    </Typography>
                </Box>

                <Alert severity="info" sx={{ mt: 2 }}>
                    <Typography variant="body2">
                        <strong>Tip:</strong> You can use the <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                            <SyncIcon fontSize="small" />
                            "Resync Device"
                        </Box> button at any time to restore the device configuration from the physical device and return it to automatic mode.
                    </Typography>
                </Alert>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose} disabled={loading}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    onClick={handleConfirm}
                    disabled={loading}
                    startIcon={loading ? <CircularProgress size={16} /> : <EditIcon />}
                    color="warning"
                >
                    {loading ? 'Converting...' : 'Confirm & Enable Edit Mode'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default Device_EditModeModal;