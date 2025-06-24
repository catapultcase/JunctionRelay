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

import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    TextField,
    IconButton,
    Alert,
    CircularProgress,
    Tab,
    Tabs,
    Paper,
    Chip
} from '@mui/material';
import {
    Close as CloseIcon,
    ContentCopy as CopyIcon,
    QrCode as QrCodeIcon,
    Schedule as ScheduleIcon
} from '@mui/icons-material';

interface DeviceRegistrationModalProps {
    open: boolean;
    onClose: () => void;
    onDeviceAdded?: () => void;
}

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

interface RegistrationTokenResponse {
    success: boolean;
    registrationToken: string;
    expiresIn: number;
    qrCodeData: string;
}

function TabPanel(props: TabPanelProps) {
    const { children, value, index, ...other } = props;

    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`registration-tabpanel-${index}`}
            aria-labelledby={`registration-tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box sx={{ p: 3 }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

const DeviceRegistrationModal: React.FC<DeviceRegistrationModalProps> = ({
    open,
    onClose,
    onDeviceAdded
}) => {
    const [tabValue, setTabValue] = useState(0);
    const [token, setToken] = useState<string>('');
    const [qrCodeData, setQrCodeData] = useState<string>('');
    const [expiresIn, setExpiresIn] = useState<number>(0);
    const [timeRemaining, setTimeRemaining] = useState<number>(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>('');
    const [copySuccess, setCopySuccess] = useState(false);
    const [authError, setAuthError] = useState<string>('');

    const generateToken = async () => {
        try {
            setLoading(true);
            setError('');
            setAuthError('');

            // Use the existing cloud-auth proxy controller to generate registration token
            const response = await fetch('/api/cloud-auth/generate-registration-token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                if (response.status === 401) {
                    setAuthError('Cloud authentication required. Please sign in to JunctionRelay Cloud first.');
                    setLoading(false);
                    return;
                }

                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to generate registration token');
            }

            const data: RegistrationTokenResponse = await response.json();

            setToken(data.registrationToken);
            setQrCodeData(data.qrCodeData);
            setExpiresIn(data.expiresIn);
            setTimeRemaining(data.expiresIn);

        } catch (err: any) {
            console.error('Token generation error:', err);
            if (err.message.includes('authentication') || err.message.includes('auth')) {
                setAuthError(err.message);
            } else {
                setError(err.message || 'Failed to generate registration token');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(token);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
        }
    };

    const formatTime = (seconds: number) => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    // Countdown timer
    useEffect(() => {
        if (timeRemaining > 0) {
            const timer = setInterval(() => {
                setTimeRemaining((prev) => {
                    if (prev <= 1) {
                        setError('Registration token has expired. Please generate a new one.');
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

            return () => clearInterval(timer);
        }
    }, [timeRemaining]);

    // Generate token when modal opens
    useEffect(() => {
        if (open && !token) {
            generateToken();
        }
    }, [open]);

    // Reset state when modal closes
    useEffect(() => {
        if (!open) {
            setToken('');
            setQrCodeData('');
            setTimeRemaining(0);
            setError('');
            setAuthError('');
            setCopySuccess(false);
            setTabValue(0);
        }
    }, [open]);

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
    };

    const handleClose = () => {
        onClose();
        if (onDeviceAdded) {
            onDeviceAdded(); // Refresh devices list when modal closes
        }
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
            <DialogTitle>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6">Add Cloud Device</Typography>
                    <IconButton onClick={handleClose} size="small">
                        <CloseIcon />
                    </IconButton>
                </Box>
            </DialogTitle>

            <DialogContent>
                {authError && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        <Typography variant="body1" fontWeight="medium">
                            {authError}
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 1 }}>
                            Please configure cloud authentication in your JunctionRelay settings.
                        </Typography>
                    </Alert>
                )}

                {error && !authError && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                        <CircularProgress />
                        <Typography sx={{ ml: 2 }}>Generating registration token...</Typography>
                    </Box>
                ) : authError ? (
                    <Box sx={{ textAlign: 'center', py: 4 }}>
                        <Typography variant="body1" color="textSecondary" sx={{ mb: 2 }}>
                            Cloud authentication is required to register devices.
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                            Configure your cloud connection in the settings to enable device registration.
                        </Typography>
                    </Box>
                ) : token ? (
                    <>
                        {/* Timer and Status */}
                        <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                            <Chip
                                icon={<ScheduleIcon />}
                                label={`Expires in ${formatTime(timeRemaining)}`}
                                color={timeRemaining < 300 ? 'warning' : 'success'}
                                variant="outlined"
                            />
                        </Box>

                        {/* Instructions */}
                        <Typography variant="body1" sx={{ mb: 3, textAlign: 'center' }}>
                            Use this token to register your ESP32 device with JunctionRelay Cloud. The token expires in 15 minutes.
                        </Typography>

                        {/* Tabs */}
                        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                            <Tabs value={tabValue} onChange={handleTabChange} centered>
                                <Tab icon={<CopyIcon />} label="Copy Token" />
                                <Tab icon={<QrCodeIcon />} label="QR Code" />
                            </Tabs>
                        </Box>

                        {/* Copy Tab */}
                        <TabPanel value={tabValue} index={0}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Typography variant="subtitle2" color="textSecondary">
                                    Registration Token:
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <TextField
                                        fullWidth
                                        value={token}
                                        InputProps={{
                                            readOnly: true,
                                            sx: { fontFamily: 'monospace', fontSize: '0.875rem' }
                                        }}
                                        variant="outlined"
                                    />
                                    <Button
                                        variant="contained"
                                        onClick={handleCopy}
                                        startIcon={<CopyIcon />}
                                        color={copySuccess ? 'success' : 'primary'}
                                        sx={{ minWidth: 100 }}
                                    >
                                        {copySuccess ? 'Copied!' : 'Copy'}
                                    </Button>
                                </Box>
                                <Typography variant="body2" color="textSecondary">
                                    Copy this token and paste it into your ESP32 device when prompted during the registration process.
                                </Typography>
                            </Box>
                        </TabPanel>

                        {/* QR Code Tab */}
                        <TabPanel value={tabValue} index={1}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <Paper sx={{ p: 3, backgroundColor: 'white', borderRadius: 2 }}>
                                    {/* QR Code placeholder - you'll need a QR code library like 'qrcode.react' */}
                                    <Box
                                        sx={{
                                            width: 200,
                                            height: 200,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            border: '2px dashed #ccc',
                                            borderRadius: 1,
                                            fontSize: '0.75rem',
                                            textAlign: 'center',
                                            color: 'text.secondary'
                                        }}
                                    >
                                        QR Code<br />
                                        {qrCodeData}<br />
                                        <br />
                                        <Typography variant="caption">
                                            Install 'qrcode.react' library to display QR code
                                        </Typography>
                                    </Box>
                                </Paper>
                                <Typography variant="body2" color="textSecondary" textAlign="center">
                                    Scan this QR code with your ESP32 device to automatically input the registration token.
                                </Typography>
                            </Box>
                        </TabPanel>
                    </>
                ) : null}
            </DialogContent>

            <DialogActions>
                <Button onClick={handleClose} variant="outlined">
                    Close
                </Button>
                {token && timeRemaining === 0 && (
                    <Button onClick={generateToken} variant="contained" disabled={loading}>
                        Generate New Token
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default DeviceRegistrationModal;