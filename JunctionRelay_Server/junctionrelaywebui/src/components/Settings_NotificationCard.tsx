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
    Switch,
    TextField,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    CircularProgress,
    Snackbar,
    Alert,
    Chip
} from '@mui/material';
import { AlertColor } from '@mui/material/Alert';

interface NotificationSetting {
    id: number;
    category: string;
    enabled: boolean;
    defaultDurationMs: number;
    description?: string;
}

const Settings_NotificationCard: React.FC = () => {
    const [settings, setSettings] = useState<NotificationSetting[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingCategory, setSavingCategory] = useState<string | null>(null);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: AlertColor }>({
        open: false,
        message: '',
        severity: 'info'
    });
    // Local state for text field editing
    const [editingValues, setEditingValues] = useState<{ [key: number]: number }>({});

    // Fetch notification settings
    const fetchSettings = async () => {
        try {
            const response = await fetch('/api/Controller_NotificationSettings');
            if (response.ok) {
                const data = await response.json();
                setSettings(data);
            }
        } catch (error) {
            console.error('Failed to fetch notification settings:', error);
            showSnackbar('Failed to load notification settings', 'error');
        }
    };

    // Initial load
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            await fetchSettings();
            setLoading(false);
        };
        loadData();
    }, []);

    // Show snackbar
    const showSnackbar = (message: string, severity: AlertColor = 'info') => {
        setSnackbar({ open: true, message, severity });
    };

    // Close snackbar
    const handleSnackbarClose = () => {
        setSnackbar({ ...snackbar, open: false });
    };

    // Update notification setting
    const handleUpdateSetting = async (setting: NotificationSetting) => {
        setSavingCategory(setting.category);
        try {
            const response = await fetch('/api/Controller_NotificationSettings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(setting)
            });

            if (response.ok) {
                showSnackbar('Settings updated successfully', 'success');
                await fetchSettings();
            } else {
                showSnackbar('Failed to update settings', 'error');
            }
        } catch (error) {
            console.error('Failed to update setting:', error);
            showSnackbar('Failed to update settings', 'error');
        } finally {
            setSavingCategory(null);
        }
    };

    // Toggle enabled state
    const handleToggleEnabled = (setting: NotificationSetting) => {
        const updated = { ...setting, enabled: !setting.enabled };
        handleUpdateSetting(updated);
    };

    // Get the current value for duration field
    const getDurationValue = (settingId: number, defaultValue: number): number => {
        return editingValues[settingId] !== undefined ? editingValues[settingId] : defaultValue;
    };

    // Handle duration field change (updates local state only)
    const handleDurationChange = (settingId: number, value: string) => {
        const numValue = parseInt(value) || 0;
        setEditingValues(prev => ({ ...prev, [settingId]: numValue }));
    };

    // Handle duration field blur (commits the change)
    const handleDurationBlur = (setting: NotificationSetting) => {
        const value = editingValues[setting.id];

        if (value === undefined) return; // No changes made

        // Clear the editing state
        setEditingValues(prev => {
            const newState = { ...prev };
            delete newState[setting.id];
            return newState;
        });

        // Validate (1 second to 30 seconds)
        if (value < 1000 || value > 30000) {
            showSnackbar('Duration must be between 1000ms (1s) and 30000ms (30s)', 'warning');
            return;
        }

        // Update the setting
        const updated = { ...setting, defaultDurationMs: value };
        handleUpdateSetting(updated);
    };

    // Convert category name to display name
    const getCategoryDisplayName = (category: string): string => {
        const map: { [key: string]: string } = {
            'notifications_system': 'System',
            'notifications_api': 'API',
            'notifications_auth': 'Authentication',
            'notifications_cloud': 'Cloud Sync',
            'notifications_junction_events': 'Junction Events',
            'notifications_collector_tests': 'Collector Tests',
            'notifications_cloud_health_reports': 'Cloud Health Reports'
        };
        return map[category] || category;
    };

    // Get category color
    const getCategoryColor = (category: string): 'primary' | 'success' | 'warning' | 'info' => {
        const map: { [key: string]: 'primary' | 'success' | 'warning' | 'info' } = {
            'notifications_system': 'info',
            'notifications_api': 'primary',
            'notifications_auth': 'warning',
            'notifications_cloud': 'success'
        };
        return map[category] || 'primary';
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box>
            <Typography variant="body2" color="text.secondary" mb={3}>
                Configure notification preferences for different event categories. Control which types of notifications appear and how long they stay visible.
            </Typography>

            {/* Notification Settings Table */}
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Category</TableCell>
                            <TableCell>Enabled</TableCell>
                            <TableCell>Dismiss Time (ms)</TableCell>
                            <TableCell>Description</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {settings.map((setting) => (
                            <TableRow key={setting.id}>
                                <TableCell>
                                    <Chip
                                        label={getCategoryDisplayName(setting.category)}
                                        size="small"
                                        color={setting.enabled ? getCategoryColor(setting.category) : 'default'}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Switch
                                        checked={setting.enabled}
                                        onChange={() => handleToggleEnabled(setting)}
                                        disabled={savingCategory === setting.category}
                                        size="small"
                                    />
                                </TableCell>
                                <TableCell>
                                    <TextField
                                        type="number"
                                        value={getDurationValue(setting.id, setting.defaultDurationMs)}
                                        onChange={(e) => handleDurationChange(setting.id, e.target.value)}
                                        onBlur={() => handleDurationBlur(setting)}
                                        disabled={savingCategory === setting.category || !setting.enabled}
                                        size="small"
                                        sx={{ width: 120 }}
                                        inputProps={{ min: 1000, max: 30000, step: 1000 }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2" color="text.secondary">
                                        {setting.description}
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Help Text */}
            <Paper variant="outlined" sx={{ p: 2, backgroundColor: 'action.hover' }}>
                <Typography variant="body2" color="text.secondary">
                    <strong>About Notifications:</strong>
                    <br />
                    • <strong>System:</strong> Application updates, theme changes, and general system events
                    <br />
                    • <strong>API:</strong> Success and error notifications from API operations
                    <br />
                    • <strong>Authentication:</strong> Login, logout, session expiration, and security events
                    <br />
                    • <strong>Cloud Sync:</strong> Cloud device synchronization notifications
                    <br />
                    • <strong>Junction Events:</strong> Junction start, stop, and error notifications
                    <br />
                    • <strong>Collector Tests:</strong> Collector test progress and result notifications
                    <br />
                    • <strong>Cloud Health Reports:</strong> Cloud health report sync event notifications
                    <br />
                    • <strong>Duration:</strong> Time in milliseconds before notifications automatically dismiss (1000ms = 1 second)
                    <br />
                    • Notifications are delivered in real-time via WebSocket connection
                </Typography>
            </Paper>

            {/* Snackbar for feedback */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={handleSnackbarClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert onClose={handleSnackbarClose} severity={snackbar.severity} sx={{ width: '100%' }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default Settings_NotificationCard;
