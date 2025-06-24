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

import React from "react";
import {
    Typography, Box, Button, Divider, TextField, FormControl, MenuItem,
    InputLabel, Select, Paper, CircularProgress, SelectChangeEvent,
    Switch, FormControlLabel, FormGroup, Stack
    } from "@mui/material";
import SaveIcon from '@mui/icons-material/Save';
import SyncIcon from '@mui/icons-material/Sync';
import SettingsIcon from '@mui/icons-material/Settings';
import NotificationsIcon from '@mui/icons-material/Notifications';
import TimerIcon from '@mui/icons-material/Timer';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import RepeatIcon from '@mui/icons-material/Repeat';
import VisibilityIcon from '@mui/icons-material/Visibility';

interface JunctionConfigPanelProps {
    loading: boolean;
    junctionData: any;
    setJunctionData: (data: any) => void;
    selectedMqttBrokerId: string;
    setSelectedMqttBrokerId: (id: string) => void;
    mqttBrokers: any[];
    saveJunction: () => Promise<void>;
    connectToMQTTBroker: () => Promise<void>;
}

const JunctionConfigPanel: React.FC<JunctionConfigPanelProps> = ({
    loading,
    junctionData,
    setJunctionData,
    selectedMqttBrokerId,
    setSelectedMqttBrokerId,
    mqttBrokers,
    saveJunction,
    connectToMQTTBroker
}) => {
    // Handle MQTT broker selection
    const handleMqttBrokerChange = (event: SelectChangeEvent<string>) => {
        setSelectedMqttBrokerId(event.target.value);
    };

    // Handle switch toggle changes
    const handleSwitchChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
        setJunctionData({
            ...junctionData,
            [field]: event.target.checked
        });
    };

    // Handle text field changes
    const handleTextChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
        setJunctionData({
            ...junctionData,
            [field]: event.target.value
        });
    };

    // Handle number field changes with validation
    const handleNumberChange = (field: string, minValue = 0) => (event: React.ChangeEvent<HTMLInputElement>) => {
        let value = event.target.value === '' ? 0 : Number(event.target.value);

        // Apply minimum value constraint
        if (value < minValue) {
            value = minValue;
        }

        setJunctionData({
            ...junctionData,
            [field]: value
        });
    };

    return (
        <Box>
            {loading ? (
                <Box display="flex" justifyContent="center" my={4}>
                    <CircularProgress />
                </Box>
            ) : (
                <Box>
                    {/* Fixed Action Bar with Save Button */}
                    <Paper
                        elevation={3}
                        sx={{
                            position: 'sticky',
                            top: 0,
                            zIndex: 10,
                            p: 2,
                            mb: 3,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderRadius: 2
                        }}
                    >
                        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
                            <SettingsIcon sx={{ mr: 1 }} />
                            Junction Configuration
                        </Typography>

                        <Box display="flex" gap={2}>
                            <Button
                                variant="contained"
                                color="primary"
                                onClick={saveJunction}
                                startIcon={<SaveIcon />}
                                size="medium"
                            >
                                Save Settings
                            </Button>

                            {selectedMqttBrokerId && (
                                <Button
                                    variant="outlined"
                                    color="primary"
                                    onClick={connectToMQTTBroker}
                                    startIcon={<SyncIcon />}
                                    size="medium"
                                >
                                    Connect to MQTT Broker
                                </Button>
                            )}
                        </Box>
                    </Paper>

                    {/* Main Layout for Settings Cards - Using Box and Stack instead of Grid */}
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                        {/* Basic Settings - Half width */}
                        <Box sx={{ flex: '1 1 calc(50% - 8px)', minWidth: '300px' }}>
                            <Paper elevation={2} sx={{ p: 2, height: '100%', borderRadius: 2 }}>
                                <Typography variant="subtitle1" gutterBottom sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    mb: 1
                                }}>
                                    <SettingsIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                                    Basic Settings
                                </Typography>
                                <Divider sx={{ mb: 2 }} />

                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
                                    <TextField
                                        fullWidth
                                        label="Junction Name"
                                        value={junctionData?.name || ""}
                                        onChange={handleTextChange("name")}
                                        size="small"
                                        margin="dense"
                                    />
                                    <FormControl
                                        fullWidth
                                        margin="dense"
                                        size="small"
                                    >
                                        <InputLabel>Junction Type</InputLabel>
                                        <Select
                                            value={junctionData?.type || ""}
                                            onChange={(e) => handleTextChange("type")(e as React.ChangeEvent<HTMLInputElement>)}
                                            label="Junction Type"
                                        >
                                            <MenuItem value="COM Junction">COM Junction</MenuItem>
                                            <MenuItem value="HTTP Junction">HTTP Junction</MenuItem>
                                            <MenuItem value="MQTT Junction">MQTT Junction</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Stack>

                                <TextField
                                    fullWidth
                                    label="Description"
                                    value={junctionData?.description || ""}
                                    onChange={handleTextChange("description")}
                                    size="small"
                                    margin="dense"
                                    multiline
                                    rows={2}
                                />

                                <FormGroup sx={{ mt: 1 }}>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={junctionData?.showOnDashboard ?? true}
                                                onChange={handleSwitchChange("showOnDashboard")}
                                                size="small"
                                            />
                                        }
                                        label={
                                            <Box display="flex" alignItems="center">
                                                <VisibilityIcon fontSize="small" sx={{ mr: 1 }} />
                                                <span>Show on Dashboard</span>
                                            </Box>
                                        }
                                    />
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={junctionData?.autoStartOnLaunch ?? false}
                                                onChange={handleSwitchChange("autoStartOnLaunch")}
                                                size="small"
                                            />
                                        }
                                        label="Auto-Start on Launch"
                                    />
                                </FormGroup>
                            </Paper>
                        </Box>

                        {/* MQTT Broker Settings - Half width */}
                        <Box sx={{ flex: '1 1 calc(50% - 8px)', minWidth: '300px' }}>
                            <Paper elevation={2} sx={{ p: 2, height: '100%', borderRadius: 2 }}>
                                <Typography variant="subtitle1" gutterBottom sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    mb: 1
                                }}>
                                    <SyncIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                                    MQTT & Scheduling
                                </Typography>
                                <Divider sx={{ mb: 2 }} />

                                <FormControl
                                    fullWidth
                                    margin="dense"
                                    size="small"
                                >
                                    <InputLabel>MQTT Broker</InputLabel>
                                        <Select
                                            value={selectedMqttBrokerId || ""}  // Remove the .toString() call
                                            onChange={handleMqttBrokerChange}
                                            label="MQTT Broker"
                                        >
                                            <MenuItem value="">
                                                <em>None</em>
                                            </MenuItem>
                                            {mqttBrokers.map((broker) => (
                                                <MenuItem key={broker.id} value={broker.id.toString()}>
                                                    {broker.name}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                </FormControl>

                                <TextField
                                    fullWidth
                                    label="Cron Expression"
                                    value={junctionData?.cronExpression || ""}
                                    onChange={handleTextChange("cronExpression")}
                                    placeholder="e.g. */15 * * * *"
                                    size="small"
                                    margin="dense"
                                    sx={{ mt: 1 }}
                                    helperText="Schedule automated start/stop (leave empty to disable)"
                                />
                            </Paper>
                        </Box>

                        {/* Stream Timeout Settings - Half width */}
                        <Box sx={{ flex: '1 1 calc(50% - 8px)', minWidth: '300px' }}>
                            <Paper elevation={2} sx={{ p: 2, height: '100%', borderRadius: 2 }}>
                                <Typography variant="subtitle1" gutterBottom sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    mb: 1
                                }}>
                                    <TimerIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                                    Stream Timeout Settings
                                </Typography>
                                <Divider sx={{ mb: 2 }} />

                                <FormGroup sx={{ mb: 1 }}>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={junctionData?.streamAutoTimeout ?? false}
                                                onChange={handleSwitchChange("streamAutoTimeout")}
                                                size="small"
                                            />
                                        }
                                        label="Enable Stream Auto-Timeout"
                                    />
                                </FormGroup>
                                <TextField
                                    fullWidth
                                    label="Stream Timeout (ms)"
                                    value={junctionData?.streamAutoTimeoutMs || 10000}
                                    onChange={handleNumberChange("streamAutoTimeoutMs", 0)}
                                    size="small"
                                    type="number"
                                    disabled={!junctionData?.streamAutoTimeout}
                                />
                            </Paper>
                        </Box>

                        {/* Retry Configuration - Half width */}
                        <Box sx={{ flex: '1 1 calc(50% - 8px)', minWidth: '300px' }}>
                            <Paper elevation={2} sx={{ p: 2, height: '100%', borderRadius: 2 }}>
                                <Typography variant="subtitle1" gutterBottom sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    mb: 1
                                }}>
                                    <RepeatIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                                    Retry Configuration
                                </Typography>
                                <Divider sx={{ mb: 2 }} />

                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                                    <TextField
                                        fullWidth
                                        label="Retry Count"
                                        value={junctionData?.retryCount || 3}
                                        onChange={handleNumberChange("retryCount", 0)}
                                        size="small"
                                        type="number"
                                    />
                                    <TextField
                                        fullWidth
                                        label="Retry Interval (ms)"
                                        value={junctionData?.retryIntervalMs || 1000}
                                        onChange={handleNumberChange("retryIntervalMs", 100)}
                                        size="small"
                                        type="number"
                                    />
                                </Stack>
                            </Paper>
                        </Box>

                        {/* Health & Monitoring - Half width */}
                        <Box sx={{ flex: '1 1 calc(50% - 8px)', minWidth: '300px' }}>
                            <Paper elevation={2} sx={{ p: 2, height: '100%', borderRadius: 2 }}>
                                <Typography variant="subtitle1" gutterBottom sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    mb: 1
                                }}>
                                    <HealthAndSafetyIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                                    Health & Monitoring
                                </Typography>
                                <Divider sx={{ mb: 2 }} />

                                <FormGroup sx={{ mb: 1 }}>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={junctionData?.enableTests ?? true}
                                                onChange={handleSwitchChange("enableTests")}
                                                size="small"
                                            />
                                        }
                                        label="Enable Tests"
                                    />
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={junctionData?.enableHealthCheck ?? true}
                                                onChange={handleSwitchChange("enableHealthCheck")}
                                                size="small"
                                            />
                                        }
                                        label="Enable Health Check"
                                    />
                                </FormGroup>
                                <TextField
                                    fullWidth
                                    label="Health Check Interval (ms)"
                                    value={junctionData?.healthCheckIntervalMs || 60000}
                                    onChange={handleNumberChange("healthCheckIntervalMs", 1000)}
                                    size="small"
                                    type="number"
                                    disabled={!junctionData?.enableHealthCheck}
                                />
                            </Paper>
                        </Box>

                        {/* Notifications - Half width */}
                        <Box sx={{ flex: '1 1 calc(50% - 8px)', minWidth: '300px' }}>
                            <Paper elevation={2} sx={{ p: 2, height: '100%', borderRadius: 2 }}>
                                <Typography variant="subtitle1" gutterBottom sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    mb: 1
                                }}>
                                    <NotificationsIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
                                    Notifications
                                </Typography>
                                <Divider sx={{ mb: 2 }} />

                                <FormGroup>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={junctionData?.enableNotifications ?? false}
                                                onChange={handleSwitchChange("enableNotifications")}
                                                size="small"
                                            />
                                        }
                                        label="Enable Notifications"
                                    />
                                </FormGroup>
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                    Configure notification rules in the Notifications tab.
                                </Typography>
                            </Paper>
                        </Box>
                    </Box>
                </Box>
            )}
        </Box>
    );
};

export default JunctionConfigPanel;