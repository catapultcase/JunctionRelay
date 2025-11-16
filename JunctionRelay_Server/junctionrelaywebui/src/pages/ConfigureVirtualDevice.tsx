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

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box,
    Button,
    TextField,
    Typography,
    Paper,
    CircularProgress,
    Alert,
    Grid,
    FormControlLabel,
    Switch,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Snackbar,
    Divider,
} from '@mui/material';

// Icon imports
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import DataObjectIcon from '@mui/icons-material/DataObject';
import MonitorIcon from '@mui/icons-material/Monitor';
import SelfImprovementIcon from '@mui/icons-material/SelfImprovement';

import { usePageTitle } from '../hooks/usePageTitle';

interface VirtualDeviceData {
    id: number;
    name: string;
    description: string;
    ipAddress: string;
    webSocketPort: number;
    isConnected: boolean;
    status: string;

    // Mode configurations
    virtualDevice_Mode1_Enabled: boolean;
    virtualDevice_Mode1_PollRate: number;
    virtualDevice_Mode2_Enabled: boolean;
    virtualDevice_Mode2_JunctionId: number | null;
    virtualDevice_Mode2_SendRate: number;
    virtualDevice_Mode3_Enabled: boolean;
    virtualDevice_Mode3_LayoutConfig: string;
}

interface Junction {
    id: number;
    name: string;
    description: string;
}

const ConfigureVirtualDevice: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [deviceData, setDeviceData] = useState<VirtualDeviceData | null>(null);
    const [originalDeviceData, setOriginalDeviceData] = useState<VirtualDeviceData | null>(null);
    const [junctions, setJunctions] = useState<Junction[]>([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);

    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackSeverity, setSnackSeverity] = useState<'success' | 'error' | 'info'>('success');
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    usePageTitle('Configure VirtualDevice');

    // Fetch device data
    const fetchDeviceData = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/virtualdevices/${id}`);

            if (!response.ok) {
                throw new Error('Failed to fetch virtual device');
            }

            const data = await response.json();
            setDeviceData(data);
            setOriginalDeviceData(JSON.parse(JSON.stringify(data))); // Deep copy
        } catch (error: any) {
            showSnackbar(error.message || 'Failed to load virtual device', 'error');
        } finally {
            setLoading(false);
        }
    }, [id]);

    // Fetch available junctions
    const fetchJunctions = useCallback(async () => {
        try {
            const response = await fetch('/api/junctions/summary');
            if (response.ok) {
                const data = await response.json();
                setJunctions(data);
            }
        } catch (error) {
            console.error('Failed to fetch junctions:', error);
        }
    }, []);

    useEffect(() => {
        fetchDeviceData();
        fetchJunctions();
    }, [fetchDeviceData, fetchJunctions]);

    // Show snackbar notification
    const showSnackbar = (message: string, severity: 'success' | 'error' | 'info' = 'success') => {
        setSnackMessage(message);
        setSnackSeverity(severity);
    };

    // Save changes to backend
    const saveChanges = async (updatedData: Partial<VirtualDeviceData>, immediate: boolean = false) => {
        if (!deviceData) return;

        try {
            setSaving(true);

            const response = await fetch(`/api/virtualdevices/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...deviceData, ...updatedData }),
            });

            if (!response.ok) {
                throw new Error('Failed to save changes');
            }

            const savedData = await response.json();
            setDeviceData(savedData);
            setOriginalDeviceData(JSON.parse(JSON.stringify(savedData)));

            if (immediate) {
                showSnackbar('Settings saved successfully', 'success');
            }
        } catch (error: any) {
            showSnackbar(error.message || 'Failed to save changes', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Handle field changes with auto-save
    const handleFieldChange = (field: string, value: any, immediate: boolean = false) => {
        if (!deviceData) return;

        const updatedData = { ...deviceData, [field]: value };
        setDeviceData(updatedData);

        // Save changes
        saveChanges({ [field]: value }, immediate);
    };

    // Test connection
    const handleTestConnection = async () => {
        try {
            setTesting(true);
            setTestResult(null);

            const response = await fetch(`/api/virtualdevices/${id}/test-connection`, {
                method: 'POST',
            });

            const result = await response.json();

            setTestResult({
                success: result.connected,
                message: result.message,
            });
        } catch (error: any) {
            setTestResult({
                success: false,
                message: error.message || 'Connection test failed',
            });
        } finally {
            setTesting(false);
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    if (!deviceData) {
        return (
            <Box sx={{ p: 3 }}>
                <Alert severity="error">VirtualDevice not found</Alert>
                <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/virtualdevices')} sx={{ mt: 2 }}>
                    Back to VirtualDevices
                </Button>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* Page Header */}
            <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Button
                    startIcon={<ArrowBackIcon />}
                    onClick={() => navigate('/virtualdevices')}
                    variant="outlined"
                    size="small"
                >
                    Back
                </Button>
                <Typography variant="h4">Configure VirtualDevice</Typography>
                {saving && <CircularProgress size={20} />}
            </Box>

            {/* Basic Information Section */}
            <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom>Basic Information</Typography>
                <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth
                            label="Device Name"
                            value={deviceData.name}
                            onChange={(e) => handleFieldChange('name', e.target.value)}
                            size="small"
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth
                            label="IP Address"
                            value={deviceData.ipAddress || ''}
                            onChange={(e) => handleFieldChange('ipAddress', e.target.value)}
                            size="small"
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth
                            label="Description"
                            value={deviceData.description}
                            onChange={(e) => handleFieldChange('description', e.target.value)}
                            multiline
                            rows={3}
                            size="small"
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth
                            label="WebSocket Port"
                            type="number"
                            value={deviceData.webSocketPort}
                            onChange={(e) => handleFieldChange('webSocketPort', parseInt(e.target.value))}
                            size="small"
                        />
                    </Grid>
                </Grid>
            </Paper>

            {/* Mode 1: Collector */}
            <Paper sx={{ p: 3, mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <DataObjectIcon color="primary" />
                    <Typography variant="h6">Mode 1: Collector</Typography>
                </Box>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                    Collect system metrics (CPU, GPU, memory, etc.) from this virtual device and make them available to junctions.
                </Typography>

                <FormControlLabel
                    control={
                        <Switch
                            checked={deviceData.virtualDevice_Mode1_Enabled}
                            onChange={(e) => handleFieldChange('virtualDevice_Mode1_Enabled', e.target.checked, true)}
                            color="primary"
                        />
                    }
                    label="Enable Collector Mode"
                />

                {deviceData.virtualDevice_Mode1_Enabled && (
                    <Box sx={{ mt: 2 }}>
                        <TextField
                            label="Poll Rate (ms)"
                            type="number"
                            value={deviceData.virtualDevice_Mode1_PollRate}
                            onChange={(e) => handleFieldChange('virtualDevice_Mode1_PollRate', parseInt(e.target.value))}
                            size="small"
                            helperText="How often to collect metrics from the virtual device"
                            sx={{ width: 250 }}
                        />
                    </Box>
                )}
            </Paper>

            {/* Mode 2: Display */}
            <Paper sx={{ p: 3, mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <MonitorIcon color="primary" />
                    <Typography variant="h6">Mode 2: Display</Typography>
                </Box>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                    Receive frames from a junction and display them on this virtual device. When enabled, this device will appear in junction device lists.
                </Typography>

                <FormControlLabel
                    control={
                        <Switch
                            checked={deviceData.virtualDevice_Mode2_Enabled}
                            onChange={(e) => handleFieldChange('virtualDevice_Mode2_Enabled', e.target.checked, true)}
                            color="primary"
                        />
                    }
                    label="Enable Display Mode"
                />

                {deviceData.virtualDevice_Mode2_Enabled && (
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={12} md={6}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Select Junction</InputLabel>
                                <Select
                                    value={deviceData.virtualDevice_Mode2_JunctionId || ''}
                                    onChange={(e) => handleFieldChange('virtualDevice_Mode2_JunctionId', e.target.value ? parseInt(e.target.value as string) : null, true)}
                                    label="Select Junction"
                                >
                                    <MenuItem value="">
                                        <em>None</em>
                                    </MenuItem>
                                    {junctions.map((junction) => (
                                        <MenuItem key={junction.id} value={junction.id}>
                                            {junction.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Send Rate (ms)"
                                type="number"
                                value={deviceData.virtualDevice_Mode2_SendRate}
                                onChange={(e) => handleFieldChange('virtualDevice_Mode2_SendRate', parseInt(e.target.value))}
                                size="small"
                                helperText="How often to send frames to this device"
                            />
                        </Grid>
                    </Grid>
                )}
            </Paper>

            {/* Mode 3: Self-Monitor */}
            <Paper sx={{ p: 3, mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <SelfImprovementIcon color="primary" />
                    <Typography variant="h6">Mode 3: Self-Monitor</Typography>
                </Box>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                    Configure custom layout for standalone monitoring without server connection.
                </Typography>

                <FormControlLabel
                    control={
                        <Switch
                            checked={deviceData.virtualDevice_Mode3_Enabled}
                            onChange={(e) => handleFieldChange('virtualDevice_Mode3_Enabled', e.target.checked, true)}
                            color="primary"
                        />
                    }
                    label="Enable Self-Monitor Mode"
                />

                {deviceData.virtualDevice_Mode3_Enabled && (
                    <Box sx={{ mt: 2 }}>
                        <TextField
                            fullWidth
                            label="Layout Configuration (JSON)"
                            multiline
                            rows={10}
                            value={deviceData.virtualDevice_Mode3_LayoutConfig || ''}
                            onChange={(e) => handleFieldChange('virtualDevice_Mode3_LayoutConfig', e.target.value)}
                            size="small"
                            helperText="Enter JSON configuration for the self-monitoring layout"
                            sx={{ fontFamily: 'monospace' }}
                        />
                    </Box>
                )}
            </Paper>

            {/* Connection Test Section */}
            <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom>Connection Test</Typography>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                    Test the WebSocket connection to this virtual device.
                </Typography>

                <Button
                    variant="outlined"
                    onClick={handleTestConnection}
                    disabled={testing}
                    startIcon={testing ? <CircularProgress size={20} /> : <NetworkCheckIcon />}
                >
                    {testing ? 'Testing...' : 'Test Connection'}
                </Button>

                {testResult && (
                    <Alert severity={testResult.success ? 'success' : 'error'} sx={{ mt: 2 }}>
                        {testResult.message}
                    </Alert>
                )}
            </Paper>

            {/* Snackbar for notifications */}
            <Snackbar
                open={Boolean(snackMessage)}
                autoHideDuration={4000}
                onClose={() => setSnackMessage(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setSnackMessage(null)}
                    severity={snackSeverity}
                    sx={{ width: '100%' }}
                >
                    {snackMessage}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default ConfigureVirtualDevice;
