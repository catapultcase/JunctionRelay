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
    Snackbar,
    Divider,
    Collapse,
    IconButton,
} from '@mui/material';

// Icon imports
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

import { usePageTitle } from '../hooks/usePageTitle';

interface VirtualDeviceData {
    id: number;
    name: string;
    description: string;
    ipAddress: string;
    webSocketPort: number;
    isConnected: boolean;
    status: string;
}

const ConfigureVirtualDevice: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [deviceData, setDeviceData] = useState<VirtualDeviceData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackSeverity, setSnackSeverity] = useState<'success' | 'error' | 'info'>('success');
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [basicInfoExpanded, setBasicInfoExpanded] = useState<boolean>(() => {
        const saved = localStorage.getItem('configure_vd_basic_info_expanded');
        return saved === null ? true : saved === 'true';
    });

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
        } catch (error: any) {
            showSnackbar(error.message || 'Failed to load virtual device', 'error');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchDeviceData();
    }, [fetchDeviceData]);

    // Persist basic info expansion state
    useEffect(() => {
        localStorage.setItem('configure_vd_basic_info_expanded', basicInfoExpanded.toString());
    }, [basicInfoExpanded]);

    // Show snackbar notification
    const showSnackbar = (message: string, severity: 'success' | 'error' | 'info' = 'success') => {
        setSnackMessage(message);
        setSnackSeverity(severity);
    };

    // Handle field changes with auto-save
    const handleFieldChange = async (field: string, value: any) => {
        if (!deviceData) return;

        const updatedData = { ...deviceData, [field]: value };
        setDeviceData(updatedData);

        // Save changes
        try {
            setSaving(true);

            const response = await fetch(`/api/virtualdevices/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...deviceData, [field]: value }),
            });

            if (!response.ok) {
                throw new Error('Failed to save changes');
            }

            const savedData = await response.json();
            setDeviceData(savedData);
            showSnackbar('Settings saved successfully', 'success');
        } catch (error: any) {
            showSnackbar(error.message || 'Failed to save changes', 'error');
        } finally {
            setSaving(false);
        }
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
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Typography variant="h4">Configure VirtualDevice</Typography>
                    {saving && <CircularProgress size={20} />}
                </Box>
                <Box>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<ArrowBackIcon />}
                        onClick={() => navigate('/virtualdevices')}
                    >
                        Back to VirtualDevices
                    </Button>
                </Box>
            </Box>

            {/* Basic Information Section */}
            <Paper sx={{ mb: 3 }}>
                <Box
                    sx={{
                        p: 2,
                        pb: basicInfoExpanded ? 1 : 2,
                        display: 'flex',
                        alignItems: 'center',
                        cursor: 'pointer',
                    }}
                    onClick={() => setBasicInfoExpanded(!basicInfoExpanded)}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
                            {deviceData.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {deviceData.ipAddress || 'No IP set'}
                        </Typography>
                    </Box>
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); setBasicInfoExpanded(!basicInfoExpanded); }}>
                        {basicInfoExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                </Box>
                <Collapse in={basicInfoExpanded}>
                    <Box sx={{ px: 3, pb: 3 }}>
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
                            <Grid item xs={12}>
                                <Divider sx={{ my: 2 }} />
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Button
                                        variant="outlined"
                                        onClick={handleTestConnection}
                                        disabled={testing}
                                        startIcon={testing ? <CircularProgress size={20} /> : <NetworkCheckIcon />}
                                    >
                                        {testing ? 'Testing Connection...' : 'Test Connection'}
                                    </Button>
                                    <Alert
                                        severity={testResult?.success ? 'success' : 'error'}
                                        sx={{
                                            flex: 1,
                                            visibility: testResult ? 'visible' : 'hidden',
                                            minHeight: '48px'
                                        }}
                                    >
                                        {testResult?.message || 'placeholder'}
                                    </Alert>
                                </Box>
                            </Grid>
                        </Grid>
                    </Box>
                </Collapse>
            </Paper>

            {/* VirtualDevice WebUI Iframe */}
            <Paper
                sx={{
                    p: 0,
                    mb: 3,
                    border: 3,
                    borderColor: 'primary.main',
                    boxShadow: 4,
                    overflow: 'hidden'
                }}
            >
                {deviceData.ipAddress ? (
                    <Box sx={{ position: 'relative' }}>
                        <Box
                            sx={{
                                p: 2,
                                bgcolor: 'primary.main',
                                color: 'primary.contrastText',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}
                        >
                            <Typography variant="h6">
                                VirtualDevice Configuration Interface
                            </Typography>
                            <Button
                                variant="contained"
                                color="inherit"
                                size="small"
                                onClick={() => window.open(`http://${deviceData.ipAddress}:8086/webui`, '_blank')}
                                sx={{ color: 'primary.main' }}
                            >
                                Open in New Tab
                            </Button>
                        </Box>
                        <Box
                            component="iframe"
                            src={`http://${deviceData.ipAddress}:8086/webui`}
                            sx={{
                                width: '100%',
                                height: 'calc(100vh - 400px)',
                                minHeight: '600px',
                                border: 'none',
                                display: 'block'
                            }}
                            title="VirtualDevice WebUI"
                        />
                    </Box>
                ) : (
                    <Alert severity="warning" sx={{ m: 2 }}>
                        Please set the IP Address in the Basic Information section above to view the VirtualDevice configuration interface.
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
