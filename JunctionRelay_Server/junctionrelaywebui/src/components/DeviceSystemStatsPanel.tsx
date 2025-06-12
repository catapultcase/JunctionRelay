/*
 * This file is part of Junction Relay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * Junction Relay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Junction Relay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Junction Relay. If not, see <https://www.gnu.org/licenses/>.
 */

import React, { useState, useEffect } from "react";
import {
    Typography, Box, Paper, CircularProgress, Alert, Button,
    Table, TableRow, TableCell, TableBody, TableContainer,
    LinearProgress, Chip, Grid, Divider, Switch, FormControlLabel,
    Tooltip
} from "@mui/material";
import MemoryIcon from '@mui/icons-material/Memory';
import QueueIcon from '@mui/icons-material/Queue';
import SpeedIcon from '@mui/icons-material/Speed';
import WifiIcon from '@mui/icons-material/Wifi';
import BatteryFullIcon from '@mui/icons-material/BatteryFull';
import SettingsIcon from '@mui/icons-material/Settings';
import RefreshIcon from '@mui/icons-material/Refresh';
import TaskIcon from '@mui/icons-material/Task';

interface DeviceSystemStatsPanelProps {
    deviceId: string;
    deviceData: any;
    showSnackbar: (message: string, severity?: "success" | "error" | "warning" | "info") => void;
}

interface SystemStats {
    queues: {
        sensor: {
            depth: number;
            maxSize: number;
            spacesAvailable: number;
        };
        config: {
            depth: number;
            maxSize: number;
            spacesAvailable: number;
        };
    };
    memory: {
        freeHeap: number;
        minFreeHeap: number;
        heapSize: number;
        maxAllocHeap: number;
        psramSize?: number;
        freePsram?: number;
        minFreePsram?: number;
        maxAllocPsram?: number;
    };
    tasks?: {
        sensorProcessing: {
            state: number;
            priority: number;
            stackHighWaterMark: number;
        };
        configProcessing: {
            state: number;
            priority: number;
            stackHighWaterMark: number;
        };
    };
    system: {
        uptime: number;
        cpuFreqMHz: number;
        flashSize?: number;
        sketchSize?: number;
        freeSketchSpace?: number;
    };
    wifi?: {
        rssi: number;
        channel: number;
        txPower: number;
        autoReconnect: boolean;
    };
    mqtt?: {
        connected: boolean;
    };
    battery?: {
        voltage: number;
        percent: number;
        isCharging: boolean;
        lowBattery: boolean;
        criticalBattery: boolean;
        status: string;
    };
    configuration: {
        hasReceivedConfig: boolean;
        lastConfigTimestamp: number;
        configCount: number;
        readyForSensorData: boolean;
    };
    connectionMode: string;
    timestamp: number;
}

const DeviceSystemStatsPanel: React.FC<DeviceSystemStatsPanelProps> = ({
    deviceId,
    deviceData,
    showSnackbar
}) => {
    const [stats, setStats] = useState<SystemStats | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>("");
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [useFastMode, setUseFastMode] = useState<boolean>(() => {
        // Load from localStorage on component initialization
        const saved = localStorage.getItem('deviceStatsMode');
        return saved ? JSON.parse(saved) : false; // Default to full stats
    });

    // Map FreeRTOS task state numbers to user-friendly labels based on context
    const getTaskStatusLabel = (stateCode: number, taskName: string, queueDepth: number, hasConfig: boolean): { label: string; color: "success" | "warning" | "error" | "info" } => {
        // For suspended/deleted tasks, show the actual problem
        if (stateCode === 3) return { label: "Suspended", color: "error" };
        if (stateCode === 4) return { label: "Deleted", color: "error" };

        // For normal operation (Ready/Blocked), show meaningful status based on context
        if (taskName.toLowerCase().includes("sensor")) {
            if (!hasConfig) {
                return { label: "Waiting for Config", color: "warning" };
            }
            if (queueDepth > 0) {
                return { label: "Processing Data", color: "success" };
            }
            return { label: "Ready for Data", color: "info" };
        }

        if (taskName.toLowerCase().includes("config")) {
            if (queueDepth > 0) {
                return { label: "Processing Config", color: "success" };
            }
            return { label: "Ready for Config", color: "info" };
        }

        // Fallback for unknown tasks
        if (stateCode === 0) return { label: "Running", color: "success" };
        return { label: "Ready", color: "info" };
    };

    // Helper functions
    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatUptime = (ms: number): string => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
        if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    };

    const getMemoryUsagePercent = (used: number, total: number): number => {
        return ((total - used) / total) * 100;
    };

    const getBatteryColor = (percent: number): "success" | "warning" | "error" => {
        if (percent > 60) return "success";
        if (percent > 20) return "warning";
        return "error";
    };

    const getWifiSignalInfo = (rssi: number): { percent: number; color: "success" | "warning" | "error"; label: string } => {
        // Convert dBm to percentage (0-100%) for display
        // -30 dBm = 100%, -90 dBm = 0%
        const percent = Math.max(0, Math.min(100, (rssi + 90) * (100 / 60)));

        if (rssi >= -50) return { percent, color: "success", label: "Excellent" };
        if (rssi >= -60) return { percent, color: "success", label: "Good" };
        if (rssi >= -70) return { percent, color: "warning", label: "Fair" };
        if (rssi >= -80) return { percent, color: "warning", label: "Weak" };
        return { percent, color: "error", label: "Very Poor" };
    };

    // Fetch system stats via backend
    const fetchSystemStats = async () => {
        if (!deviceId) {
            setError("Device ID not available");
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError("");

            // ✅ FIXED: Use the backend API endpoints (not direct ESP32 calls)
            const endpoint = useFastMode
                ? `/api/devices/${deviceId}/system-stats-lite`  // Backend proxies to ESP32's /api/system/statslite
                : `/api/devices/${deviceId}/system-stats`;       // Backend proxies to ESP32's /api/system/stats

            console.log(`[DEBUG] Fetching from endpoint: ${endpoint}`);

            const response = await fetch(endpoint);

            if (!response.ok) {
                if (response.status === 503) {
                    throw new Error("Device is unreachable");
                } else if (response.status === 408) {
                    throw new Error("Device response timeout");
                } else if (response.status === 404) {
                    throw new Error(`Endpoint not found: ${endpoint}`);
                } else {
                    throw new Error(`Failed to fetch system stats: ${response.status}`);
                }
            }

            // ✅ Add content type check to catch HTML responses
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                const text = await response.text();
                console.error("[DEBUG] Received non-JSON response:", text.substring(0, 200));
                throw new Error("Server returned non-JSON response");
            }

            const data = await response.json();
            setStats(data);
            setLastUpdated(new Date());

        } catch (err: any) {
            console.error("Error fetching system stats:", err);
            setError(err.message);
            showSnackbar(`Failed to fetch system stats: ${err.message}`, "error");
        } finally {
            setLoading(false);
        }
    };

    // Handle mode toggle and save to localStorage
    const handleModeToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newMode = event.target.checked;
        setUseFastMode(newMode);
        localStorage.setItem('deviceStatsMode', JSON.stringify(newMode));

        // Show feedback to user
        showSnackbar(
            newMode ? "Switched to Fast Mode (lightweight stats)" : "Switched to Full Mode (detailed stats)",
            "info"
        );

        // Immediately fetch with new mode
        setTimeout(fetchSystemStats, 100);
    };

    // Initial fetch and periodic updates
    useEffect(() => {
        fetchSystemStats();

        // Auto-refresh every 1 second for fast mode, 2 seconds for full mode
        const refreshInterval = useFastMode ? 1000 : 2000;
        const interval = setInterval(fetchSystemStats, refreshInterval);

        return () => clearInterval(interval);
    }, [deviceId, useFastMode]); // Re-run when mode changes

    if (loading && !stats) {
        return (
            <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" p={4}>
                <CircularProgress size={50} />
                <Typography variant="h6" sx={{ mt: 2 }}>Loading system statistics...</Typography>
            </Box>
        );
    }

    if (error && !stats) {
        return (
            <Box p={2}>
                <Alert severity="error" sx={{ mb: 2 }}>
                    <Typography>{error}</Typography>
                </Alert>
                <Button
                    variant="contained"
                    startIcon={<RefreshIcon />}
                    onClick={fetchSystemStats}
                >
                    Retry
                </Button>
            </Box>
        );
    }

    if (!stats) {
        return (
            <Box p={2}>
                <Alert severity="warning">
                    <Typography>System statistics not available for this device.</Typography>
                </Alert>
            </Box>
        );
    }

    return (
        <Box>
            {/* Header with mode toggle and refresh button */}
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h6">Real-Time System Statistics</Typography>
                <Box display="flex" alignItems="center" gap={2}>
                    {/* Mode Toggle */}
                    <Tooltip title={useFastMode ?
                        "Fast Mode: Lightweight stats with 1s refresh. Switch to Full Mode for detailed information." :
                        "Full Mode: Detailed stats with 2s refresh. Switch to Fast Mode for quicker updates."
                    }>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={useFastMode}
                                    onChange={handleModeToggle}
                                    size="small"
                                    color="primary"
                                />
                            }
                            label={
                                <Box display="flex" alignItems="center" gap={1}>
                                    <Typography variant="body2" color="textSecondary">
                                        {useFastMode ? "Fast" : "Full"}
                                    </Typography>
                                    <Chip
                                        label={useFastMode ? "1s" : "2s"}
                                        size="small"
                                        variant="outlined"
                                        color="primary"
                                    />
                                </Box>
                            }
                            labelPlacement="start"
                            sx={{ mr: 1 }}
                        />
                    </Tooltip>

                    {lastUpdated && (
                        <Typography variant="body2" color="textSecondary">
                            Last updated: {lastUpdated.toLocaleTimeString()}
                        </Typography>
                    )}
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<RefreshIcon />}
                        onClick={fetchSystemStats}
                        disabled={loading}
                    >
                        Refresh
                    </Button>
                </Box>
            </Box>

            {error && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    <Typography>Auto-refresh failed: {error}</Typography>
                </Alert>
            )}

            {/* Fast Mode Notice */}
            {useFastMode && (
                <Alert severity="info" sx={{ mb: 2 }}>
                    <Typography>
                        <strong>Fast Mode:</strong> Showing lightweight system statistics for quicker updates.
                        Switch to Full Mode for detailed information about tasks, WiFi, battery, and more.
                    </Typography>
                </Alert>
            )}

            <Grid container spacing={3}>
                {/* System Overview */}
                <Grid item xs={12} md={6}>
                    <Paper elevation={2} sx={{ p: 3, height: '100%', borderRadius: 2 }}>
                        <Typography variant="subtitle1" gutterBottom sx={{
                            display: 'flex',
                            alignItems: 'center',
                            mb: 2
                        }}>
                            <SpeedIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                            System Overview
                        </Typography>
                        <TableContainer>
                            <Table size="small">
                                <TableBody>
                                    <TableRow>
                                        <TableCell><strong>Uptime</strong></TableCell>
                                        <TableCell>{formatUptime(stats.system.uptime)}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell><strong>CPU Frequency</strong></TableCell>
                                        <TableCell>{stats.system.cpuFreqMHz} MHz</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell><strong>Connection Mode</strong></TableCell>
                                        <TableCell>
                                            <Chip
                                                label={stats.connectionMode.toUpperCase()}
                                                size="small"
                                                color="primary"
                                                variant="outlined"
                                            />
                                        </TableCell>
                                    </TableRow>
                                    {/* Only show flash info in full mode */}
                                    {!useFastMode && stats.system.flashSize && (
                                        <>
                                            <TableRow>
                                                <TableCell><strong>Flash Size</strong></TableCell>
                                                <TableCell>{formatBytes(stats.system.flashSize)}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell><strong>Sketch Size</strong></TableCell>
                                                <TableCell>{formatBytes(stats.system.sketchSize || 0)}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell><strong>Free Sketch Space</strong></TableCell>
                                                <TableCell>{formatBytes(stats.system.freeSketchSpace || 0)}</TableCell>
                                            </TableRow>
                                        </>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>

                {/* Memory Statistics */}
                <Grid item xs={12} md={6}>
                    <Paper elevation={2} sx={{ p: 3, height: '100%', borderRadius: 2 }}>
                        <Typography variant="subtitle1" gutterBottom sx={{
                            display: 'flex',
                            alignItems: 'center',
                            mb: 2
                        }}>
                            <MemoryIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                            Memory Usage
                        </Typography>

                        {/* Heap Memory */}
                        <Box sx={{ mb: 2 }}>
                            <Typography variant="body2" fontWeight="medium">
                                Heap Memory
                            </Typography>
                            <LinearProgress
                                variant="determinate"
                                value={getMemoryUsagePercent(stats.memory.freeHeap, stats.memory.heapSize)}
                                sx={{ mb: 1, height: 8, borderRadius: 4 }}
                                color={getMemoryUsagePercent(stats.memory.freeHeap, stats.memory.heapSize) > 80 ? "error" :
                                    getMemoryUsagePercent(stats.memory.freeHeap, stats.memory.heapSize) > 60 ? "warning" : "success"}
                            />
                            <Typography variant="body2" color="textSecondary">
                                {formatBytes(stats.memory.freeHeap)} free of {formatBytes(stats.memory.heapSize)}
                            </Typography>
                        </Box>

                        {/* PSRAM (if available) */}
                        {stats.memory.psramSize && (
                            <Box sx={{ mb: 2 }}>
                                <Typography variant="body2" fontWeight="medium">
                                    PSRAM
                                </Typography>
                                <LinearProgress
                                    variant="determinate"
                                    value={getMemoryUsagePercent(stats.memory.freePsram || 0, stats.memory.psramSize)}
                                    sx={{ mb: 1, height: 8, borderRadius: 4 }}
                                    color="primary"
                                />
                                <Typography variant="body2" color="textSecondary">
                                    {formatBytes(stats.memory.freePsram || 0)} free of {formatBytes(stats.memory.psramSize)}
                                </Typography>
                            </Box>
                        )}

                        {/* Only show detailed memory info in full mode */}
                        {!useFastMode && (
                            <>
                                <Divider sx={{ my: 2 }} />
                                <TableContainer>
                                    <Table size="small">
                                        <TableBody>
                                            <TableRow>
                                                <TableCell><strong>Min Free Heap</strong></TableCell>
                                                <TableCell>{formatBytes(stats.memory.minFreeHeap)}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell><strong>Max Alloc</strong></TableCell>
                                                <TableCell>{formatBytes(stats.memory.maxAllocHeap)}</TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </>
                        )}
                    </Paper>
                </Grid>

                {/* Queue Status */}
                <Grid item xs={12} md={6}>
                    <Paper elevation={2} sx={{ p: 3, height: '100%', borderRadius: 2 }}>
                        <Typography variant="subtitle1" gutterBottom sx={{
                            display: 'flex',
                            alignItems: 'center',
                            mb: 2
                        }}>
                            <QueueIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                            Queue Status
                        </Typography>

                        {/* Sensor Queue */}
                        <Box sx={{ mb: 2 }}>
                            <Typography variant="body2" fontWeight="medium">
                                Sensor Queue
                            </Typography>
                            <LinearProgress
                                variant="determinate"
                                value={(stats.queues.sensor.depth / stats.queues.sensor.maxSize) * 100}
                                sx={{ mb: 1, height: 8, borderRadius: 4 }}
                                color={stats.queues.sensor.depth > stats.queues.sensor.maxSize * 0.8 ? "error" : "success"}
                            />
                            <Typography variant="body2" color="textSecondary">
                                {stats.queues.sensor.depth} / {stats.queues.sensor.maxSize} items
                            </Typography>
                        </Box>

                        {/* Config Queue */}
                        <Box sx={{ mb: 2 }}>
                            <Typography variant="body2" fontWeight="medium">
                                Config Queue
                            </Typography>
                            <LinearProgress
                                variant="determinate"
                                value={(stats.queues.config.depth / stats.queues.config.maxSize) * 100}
                                sx={{ mb: 1, height: 8, borderRadius: 4 }}
                                color={stats.queues.config.depth > stats.queues.config.maxSize * 0.8 ? "error" : "success"}
                            />
                            <Typography variant="body2" color="textSecondary">
                                {stats.queues.config.depth} / {stats.queues.config.maxSize} items
                            </Typography>
                        </Box>
                    </Paper>
                </Grid>

                {/* Task Status - Only show in full mode */}
                {!useFastMode && stats.tasks && (
                    <Grid item xs={12} md={6}>
                        <Paper elevation={2} sx={{ p: 3, height: '100%', borderRadius: 2 }}>
                            <Typography variant="subtitle1" gutterBottom sx={{
                                display: 'flex',
                                alignItems: 'center',
                                mb: 2
                            }}>
                                <TaskIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                                Task Status
                            </Typography>
                            <TableContainer>
                                <Table size="small">
                                    <TableBody>
                                        <TableRow>
                                            <TableCell><strong>Sensor Processing</strong></TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={getTaskStatusLabel(
                                                        stats.tasks.sensorProcessing.state,
                                                        "sensorProcessing",
                                                        stats.queues.sensor.depth,
                                                        stats.configuration.hasReceivedConfig
                                                    ).label}
                                                    size="small"
                                                    color={getTaskStatusLabel(
                                                        stats.tasks.sensorProcessing.state,
                                                        "sensorProcessing",
                                                        stats.queues.sensor.depth,
                                                        stats.configuration.hasReceivedConfig
                                                    ).color}
                                                    variant="outlined"
                                                />
                                            </TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell><strong>Config Processing</strong></TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={getTaskStatusLabel(
                                                        stats.tasks.configProcessing.state,
                                                        "configProcessing",
                                                        stats.queues.config.depth,
                                                        stats.configuration.hasReceivedConfig
                                                    ).label}
                                                    size="small"
                                                    color={getTaskStatusLabel(
                                                        stats.tasks.configProcessing.state,
                                                        "configProcessing",
                                                        stats.queues.config.depth,
                                                        stats.configuration.hasReceivedConfig
                                                    ).color}
                                                    variant="outlined"
                                                />
                                            </TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell><strong>Sensor Memory Safety</strong></TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Typography variant="body2">
                                                        {formatBytes(stats.tasks.sensorProcessing.stackHighWaterMark)} free
                                                    </Typography>
                                                    <Chip
                                                        label={stats.tasks.sensorProcessing.stackHighWaterMark > 2000 ? "Healthy" :
                                                            stats.tasks.sensorProcessing.stackHighWaterMark > 500 ? "Low" : "Critical"}
                                                        size="small"
                                                        color={stats.tasks.sensorProcessing.stackHighWaterMark > 2000 ? "success" :
                                                            stats.tasks.sensorProcessing.stackHighWaterMark > 500 ? "warning" : "error"}
                                                        variant="outlined"
                                                    />
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell><strong>Config Memory Safety</strong></TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Typography variant="body2">
                                                        {formatBytes(stats.tasks.configProcessing.stackHighWaterMark)} free
                                                    </Typography>
                                                    <Chip
                                                        label={stats.tasks.configProcessing.stackHighWaterMark > 2000 ? "Healthy" :
                                                            stats.tasks.configProcessing.stackHighWaterMark > 500 ? "Low" : "Critical"}
                                                        size="small"
                                                        color={stats.tasks.configProcessing.stackHighWaterMark > 2000 ? "success" :
                                                            stats.tasks.configProcessing.stackHighWaterMark > 500 ? "warning" : "error"}
                                                        variant="outlined"
                                                    />
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>
                )}

                {/* WiFi Status - Only show in full mode */}
                {!useFastMode && stats.wifi && (
                    <Grid item xs={12} md={6}>
                        <Paper elevation={2} sx={{ p: 3, height: '100%', borderRadius: 2 }}>
                            <Typography variant="subtitle1" gutterBottom sx={{
                                display: 'flex',
                                alignItems: 'center',
                                mb: 2
                            }}>
                                <WifiIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                                WiFi Status
                            </Typography>

                            {/* Signal Strength Bar */}
                            <Box sx={{ mb: 2 }}>
                                <Typography variant="body2" fontWeight="medium">
                                    Signal Strength
                                </Typography>
                                <LinearProgress
                                    variant="determinate"
                                    value={getWifiSignalInfo(stats.wifi.rssi).percent}
                                    sx={{ mb: 1, height: 8, borderRadius: 4 }}
                                    color={getWifiSignalInfo(stats.wifi.rssi).color}
                                />
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" color="textSecondary">
                                        {stats.wifi.rssi} dBm
                                    </Typography>
                                    <Chip
                                        label={getWifiSignalInfo(stats.wifi.rssi).label}
                                        size="small"
                                        color={getWifiSignalInfo(stats.wifi.rssi).color}
                                        variant="outlined"
                                    />
                                </Box>
                            </Box>

                            <TableContainer>
                                <Table size="small">
                                    <TableBody>
                                        <TableRow>
                                            <TableCell><strong>Channel</strong></TableCell>
                                            <TableCell>{stats.wifi.channel}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell><strong>TX Power</strong></TableCell>
                                            <TableCell>{stats.wifi.txPower}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell><strong>Auto Reconnect</strong></TableCell>
                                            <TableCell>{stats.wifi.autoReconnect ? "Enabled" : "Disabled"}</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>
                )}

                {/* Battery Status - Only show in full mode */}
                {!useFastMode && stats.battery && (
                    <Grid item xs={12} md={6}>
                        <Paper elevation={2} sx={{ p: 3, height: '100%', borderRadius: 2 }}>
                            <Typography variant="subtitle1" gutterBottom sx={{
                                display: 'flex',
                                alignItems: 'center',
                                mb: 2
                            }}>
                                <BatteryFullIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                                Battery Status
                            </Typography>

                            <Box sx={{ mb: 2 }}>
                                <Typography variant="body2" fontWeight="medium">
                                    Battery Level
                                </Typography>
                                <LinearProgress
                                    variant="determinate"
                                    value={stats.battery.percent}
                                    sx={{ mb: 1, height: 12, borderRadius: 6 }}
                                    color={getBatteryColor(stats.battery.percent)}
                                />
                                <Typography variant="body2" color="textSecondary">
                                    {stats.battery.percent.toFixed(1)}% ({stats.battery.voltage.toFixed(2)}V)
                                </Typography>
                            </Box>

                            <TableContainer>
                                <Table size="small">
                                    <TableBody>
                                        <TableRow>
                                            <TableCell><strong>Status</strong></TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={stats.battery.status}
                                                    size="small"
                                                    color={getBatteryColor(stats.battery.percent)}
                                                    variant="outlined"
                                                />
                                            </TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell><strong>Charging</strong></TableCell>
                                            <TableCell>{stats.battery.isCharging ? "Yes" : "No"}</TableCell>
                                        </TableRow>
                                        {stats.battery.lowBattery && (
                                            <TableRow>
                                                <TableCell colSpan={2}>
                                                    <Alert severity="warning" sx={{ mt: 1 }}>
                                                        Low Battery Warning
                                                    </Alert>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>
                )}

                {/* Configuration Status */}
                <Grid item xs={12}>
                    <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
                        <Typography variant="subtitle1" gutterBottom sx={{
                            display: 'flex',
                            alignItems: 'center',
                            mb: 2
                        }}>
                            <SettingsIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                            Configuration Status
                        </Typography>

                        <Grid container spacing={3}>
                            <Grid item xs={12} md={3}>
                                <Box textAlign="center">
                                    <Typography variant="h4" color={stats.configuration.hasReceivedConfig ? "success.main" : "warning.main"}>
                                        {stats.configuration.hasReceivedConfig ? "✓" : "⚠"}
                                    </Typography>
                                    <Typography variant="body2" fontWeight="medium">
                                        Configuration Status
                                    </Typography>
                                    <Typography variant="body2" color="textSecondary">
                                        {stats.configuration.hasReceivedConfig ? "Configured" : "Needs Config"}
                                    </Typography>
                                </Box>
                            </Grid>

                            <Grid item xs={12} md={3}>
                                <Box textAlign="center">
                                    <Typography variant="h4" color="primary.main">
                                        {stats.configuration.configCount}
                                    </Typography>
                                    <Typography variant="body2" fontWeight="medium">
                                        Configs Received
                                    </Typography>
                                    <Typography variant="body2" color="textSecondary">
                                        Total count
                                    </Typography>
                                </Box>
                            </Grid>

                            <Grid item xs={12} md={3}>
                                <Box textAlign="center">
                                    <Typography variant="h4" color={stats.configuration.readyForSensorData ? "success.main" : "warning.main"}>
                                        {stats.configuration.readyForSensorData ? "✓" : "✗"}
                                    </Typography>
                                    <Typography variant="body2" fontWeight="medium">
                                        Sensor Data Ready
                                    </Typography>
                                    <Typography variant="body2" color="textSecondary">
                                        {stats.configuration.readyForSensorData ? "Ready" : "Not Ready"}
                                    </Typography>
                                </Box>
                            </Grid>

                            <Grid item xs={12} md={3}>
                                <Box textAlign="center">
                                    <Typography variant="h4" color="info.main">
                                        {stats.configuration.lastConfigTimestamp > 0 ?
                                            formatUptime(stats.timestamp - stats.configuration.lastConfigTimestamp) : "Never"}
                                    </Typography>
                                    <Typography variant="body2" fontWeight="medium">
                                        Last Config
                                    </Typography>
                                    <Typography variant="body2" color="textSecondary">
                                        Time ago
                                    </Typography>
                                </Box>
                            </Grid>
                        </Grid>

                        {!stats.configuration.hasReceivedConfig && (
                            <Alert severity="warning" sx={{ mt: 2 }}>
                                <Typography>
                                    This device needs to receive a configuration before it can process sensor data.
                                    Send a configuration payload to initialize the device properly.
                                </Typography>
                            </Alert>
                        )}
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
};

export default DeviceSystemStatsPanel;