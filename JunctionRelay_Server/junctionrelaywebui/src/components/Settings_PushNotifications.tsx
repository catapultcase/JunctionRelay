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
    Box,
    Typography,
    Button,
    Alert,
    Chip,
    CircularProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Switch,
    FormControlLabel,
    Select,
    MenuItem,
    FormControl,
    Paper,
    Card,
    CardContent,
    useTheme,
    useMediaQuery
} from '@mui/material';
import {
    QrCode2 as QrCodeIcon,
    Phone as PhoneIcon,
    Notifications as NotificationsIcon
} from '@mui/icons-material';
import { AlertColor } from '@mui/material/Alert';
import QRCode from 'qrcode';

interface Props {
    showSnackbar: (message: string, severity?: AlertColor) => void;
}

interface NotificationPreferences {
    pushNotificationsEnabled: boolean;
    deviceHealthTimeoutMinutes: number | null;
    deviceHealthReminderIntervalMinutes: number | null;
}

interface CreatePairCodeResponse {
    success: boolean;
    token: string;
    expiresAt: string;
}

const Settings_PushNotifications: React.FC<Props> = ({ showSnackbar }) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Push notifications state
    const [pushNotificationsEnabled, setPushNotificationsEnabled] = useState(true);
    const [deviceHealthTimeout, setDeviceHealthTimeout] = useState<number | null>(60);
    const [deviceHealthReminderInterval, setDeviceHealthReminderInterval] = useState<number | null>(null); // null = Never
    const [showPairDialog, setShowPairDialog] = useState(false);
    const [pairCode, setPairCode] = useState('');
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
    const [isGeneratingPairCode, setIsGeneratingPairCode] = useState(false);
    const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);
    const [isSavingPreferences, setIsSavingPreferences] = useState(false);

    // Load preferences on component mount
    useEffect(() => {
        const loadPreferences = async () => {
            try {
                setIsLoadingPreferences(true);
                const response = await fetch('/api/notifications/preferences');
                if (response.ok) {
                    const data = await response.json();
                    const preferences = data.preferences || data;
                    setPushNotificationsEnabled(preferences.pushNotificationsEnabled ?? true);
                    setDeviceHealthTimeout(preferences.deviceHealthTimeoutMinutes ?? 60);
                    setDeviceHealthReminderInterval(preferences.deviceHealthReminderIntervalMinutes || null);
                } else {
                    console.warn('No existing notification preferences found, using defaults');
                }
            } catch (error: any) {
                console.error('Error loading notification preferences:', error);
                showSnackbar('Failed to load notification preferences', 'error');
                // Keep defaults on error
            } finally {
                setIsLoadingPreferences(false);
            }
        };

        loadPreferences();
    }, []); // Empty dependency array - only run on mount

    // Save preferences when they change
    const savePreferences = async (
        newPushEnabled: boolean,
        newDeviceHealthTimeout: number | null,
        newDeviceHealthReminderInterval: number | null = deviceHealthReminderInterval
    ) => {
        try {
            setIsSavingPreferences(true);
            const response = await fetch('/api/notifications/preferences', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    pushNotificationsEnabled: newPushEnabled,
                    deviceHealthTimeoutMinutes: newDeviceHealthTimeout,
                    deviceHealthReminderIntervalMinutes: newDeviceHealthReminderInterval
                })
            });

            if (response.ok) {
                showSnackbar('Notification preferences updated successfully', 'success');
            } else {
                const error = await response.json();
                throw new Error(error.message || 'Failed to save preferences');
            }
        } catch (error: any) {
            console.error('Error saving notification preferences:', error);
            showSnackbar('Failed to save notification preferences', 'error');
            // Revert state on error
            setPushNotificationsEnabled(!newPushEnabled);
            setDeviceHealthTimeout(deviceHealthTimeout);
            setDeviceHealthReminderInterval(deviceHealthReminderInterval);
        } finally {
            setIsSavingPreferences(false);
        }
    };

    const handlePushNotificationsToggle = (enabled: boolean) => {
        setPushNotificationsEnabled(enabled);

        // If disabling push notifications, set device health timeout and reminder to null
        const newDeviceHealthTimeout = enabled ? (deviceHealthTimeout || 60) : null;
        const newDeviceHealthReminderInterval = enabled ? deviceHealthReminderInterval : null;
        setDeviceHealthTimeout(newDeviceHealthTimeout);
        setDeviceHealthReminderInterval(newDeviceHealthReminderInterval);

        savePreferences(enabled, newDeviceHealthTimeout, newDeviceHealthReminderInterval);
    };

    const handleDeviceHealthTimeoutChange = (timeout: number) => {
        setDeviceHealthTimeout(timeout);
        savePreferences(pushNotificationsEnabled, timeout);
    };

    const handleDeviceHealthReminderIntervalChange = (interval: number | null) => {
        setDeviceHealthReminderInterval(interval);
        savePreferences(pushNotificationsEnabled, deviceHealthTimeout, interval);
    };

    const handleGeneratePairCode = async () => {
        try {
            setIsGeneratingPairCode(true);

            const response = await fetch('/api/notifications/create-pair-code', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    deviceName: 'Mobile Device'
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to generate pair code');
            }

            const data: CreatePairCodeResponse = await response.json();
            setPairCode(data.token);

            // Create the JSON format expected by the mobile app
            const qrCodeData = {
                success: true,
                token: data.token,
                expiresAt: data.expiresAt
            };

            // Generate QR code with the qrcode library
            const qrData = await QRCode.toDataURL(JSON.stringify(qrCodeData), {
                width: 256,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                },
                errorCorrectionLevel: 'M'
            });
            setQrCodeDataUrl(qrData);
            setShowPairDialog(true);

        } catch (error: any) {
            console.error('Error generating pair code:', error);
            showSnackbar(error.message || 'Failed to generate pair code', 'error');
        } finally {
            setIsGeneratingPairCode(false);
        }
    };

    // Simple QR code generation function (you'll need to install a QR code library)
    // For now, this is a placeholder that creates a simple data URL
    const generateQRCode = async (data: string): Promise<string> => {
        // This is a placeholder - you would use a library like 'qrcode' here
        // For demonstration, we'll create a simple canvas with the token
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 256;

        if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 256, 256);
            ctx.fillStyle = '#000000';
            ctx.font = '12px monospace';
            ctx.fillText('QR Code Placeholder', 10, 30);
            ctx.fillText('Token: ' + JSON.parse(data).token.substring(0, 20) + '...', 10, 50);
            ctx.fillText('Scan with mobile app', 10, 70);
        }

        return canvas.toDataURL();
    };

    // Helper function to format reminder interval display
    const formatReminderInterval = (minutes: number | null) => {
        if (minutes === null) return 'Never';
        if (minutes < 60) return `${minutes} minutes`;
        const hours = minutes / 60;
        return `${hours} hour${hours > 1 ? 's' : ''}`;
    };

    if (isLoadingPreferences) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <>
            <Alert severity="info" sx={{ mb: 3 }}>
                <Typography variant="body2">
                    📱 <strong>Mobile Push Notifications:</strong> Pair your mobile device to receive real-time alerts about your IoT devices.
                    Notifications are sent directly to your phone when issues are detected.
                </Typography>
            </Alert>

            <Box sx={{ mb: 3 }}>
                <Button
                    variant="contained"
                    startIcon={isGeneratingPairCode ? <CircularProgress size={16} /> : <QrCodeIcon />}
                    onClick={handleGeneratePairCode}
                    disabled={isGeneratingPairCode}
                    fullWidth={isMobile}
                    size="small"
                    sx={{ mb: 2 }}
                >
                    {isGeneratingPairCode ? 'Generating...' : 'Pair Mobile Device'}
                </Button>
                <Typography variant="body2" color="text.secondary">
                    Scan the QR code with your mobile device to enable push notifications
                </Typography>
            </Box>

            {/* Master Push Notifications Toggle */}
            <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                        Push Notifications
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {isSavingPreferences && <CircularProgress size={16} />}
                        <Chip
                            label={pushNotificationsEnabled ? 'Enabled' : 'Disabled'}
                            color={pushNotificationsEnabled ? 'success' : 'default'}
                            size="small"
                        />
                        <Switch
                            checked={pushNotificationsEnabled}
                            onChange={(e) => handlePushNotificationsToggle(e.target.checked)}
                            disabled={isSavingPreferences}
                            color="primary"
                        />
                    </Box>
                </Box>
                <Typography variant="body2" color="text.secondary">
                    Master toggle for all push notifications
                </Typography>
            </Box>

            {/* Notification Cards */}
            <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>
                    Notification Types
                </Typography>

                {/* Device Health Alerts Card */}
                <Card
                    sx={{
                        mb: 2,
                        opacity: pushNotificationsEnabled ? 1 : 0.5,
                        pointerEvents: pushNotificationsEnabled ? 'auto' : 'none'
                    }}
                >
                    <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <NotificationsIcon color={pushNotificationsEnabled ? 'primary' : 'disabled'} />
                            <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                                Device Health Alerts
                            </Typography>
                        </Box>

                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Get alerted when devices go offline or stop sending health reports
                        </Typography>

                        {/* First row - Initial timeout */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                            <Typography variant="body2">
                                Notify when device hasn't reported health for
                            </Typography>
                            <FormControl size="small" sx={{ minWidth: 120 }}>
                                <Select
                                    value={deviceHealthTimeout || 60}
                                    onChange={(e) => handleDeviceHealthTimeoutChange(e.target.value as number)}
                                    disabled={!pushNotificationsEnabled || isSavingPreferences}
                                >
                                    <MenuItem value={15}>15 minutes</MenuItem>
                                    <MenuItem value={30}>30 minutes</MenuItem>
                                    <MenuItem value={60}>1 hour</MenuItem>
                                    <MenuItem value={120}>2 hours</MenuItem>
                                    <MenuItem value={360}>6 hours</MenuItem>
                                    <MenuItem value={720}>12 hours</MenuItem>
                                    <MenuItem value={1440}>24 hours</MenuItem>
                                </Select>
                            </FormControl>
                        </Box>

                        {/* Second row - Reminder interval */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography variant="body2">
                                and remind me periodically every
                            </Typography>
                            <FormControl size="small" sx={{ minWidth: 120 }}>
                                <Select
                                    value={deviceHealthReminderInterval === null ? 'never' : deviceHealthReminderInterval}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        handleDeviceHealthReminderIntervalChange(value === 'never' ? null : value as number);
                                    }}
                                    disabled={!pushNotificationsEnabled || isSavingPreferences}
                                >
                                    <MenuItem value="never">Never</MenuItem>
                                    <MenuItem value={60}>1 hour</MenuItem>
                                    <MenuItem value={120}>2 hours</MenuItem>
                                    <MenuItem value={180}>3 hours</MenuItem>
                                    <MenuItem value={240}>4 hours</MenuItem>
                                    <MenuItem value={300}>5 hours</MenuItem>
                                    <MenuItem value={360}>6 hours</MenuItem>
                                    <MenuItem value={480}>8 hours</MenuItem>
                                    <MenuItem value={720}>12 hours</MenuItem>
                                    <MenuItem value={1440}>24 hours</MenuItem>
                                </Select>
                            </FormControl>
                        </Box>

                        {/* Show current settings summary */}
                        {pushNotificationsEnabled && (
                            <Alert severity="info" sx={{ mt: 2 }}>
                                <Typography variant="body2">
                                    <strong>Current setting:</strong> Alert after {formatReminderInterval(deviceHealthTimeout)},
                                    then remind {deviceHealthReminderInterval === null ? 'never' : `every ${formatReminderInterval(deviceHealthReminderInterval)}`}
                                </Typography>
                            </Alert>
                        )}
                    </CardContent>
                </Card>
            </Box>

            {/* Pair Device QR Code Dialog */}
            <Dialog
                open={showPairDialog}
                onClose={() => setShowPairDialog(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PhoneIcon color="primary" />
                        <Typography variant="h6">Pair Mobile Device</Typography>
                    </Box>
                </DialogTitle>

                <DialogContent sx={{ textAlign: 'center' }}>
                    <Alert severity="info" sx={{ mb: 3 }}>
                        <Typography variant="body2">
                            📱 Scan this QR code with your mobile device to enable push notifications.
                            The pairing code expires in 15 minutes.
                        </Typography>
                    </Alert>

                    {qrCodeDataUrl && (
                        <Box sx={{ mb: 3 }}>
                            <img
                                src={qrCodeDataUrl}
                                alt="Pairing QR Code"
                                style={{
                                    maxWidth: '100%',
                                    height: 'auto',
                                    border: '1px solid #e0e0e0',
                                    borderRadius: '8px'
                                }}
                            />
                        </Box>
                    )}

                    {pairCode && (
                        <Box sx={{ mb: 2 }}>
                            <Typography variant="body2" color="text.secondary" gutterBottom>
                                Manual pairing code (JSON format):
                            </Typography>
                            <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', fontSize: '0.75rem' }}>
                                    {JSON.stringify({
                                        success: true,
                                        token: pairCode,
                                        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
                                    }, null, 2)}
                                </Typography>
                            </Paper>
                        </Box>
                    )}
                </DialogContent>

                <DialogActions>
                    <Button
                        onClick={() => setShowPairDialog(false)}
                        variant="contained"
                    >
                        Done
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default Settings_PushNotifications;