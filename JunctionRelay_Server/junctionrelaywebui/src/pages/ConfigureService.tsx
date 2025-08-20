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

import { useState, useEffect, useCallback } from "react";
import {
    Button,
    Typography,
    Box,
    CircularProgress,
    Snackbar,
    Alert,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Divider,
    Chip,
    TextField,
    Card,
    CardContent,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    Paper,
} from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";

// Import icons
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import EditIcon from '@mui/icons-material/Edit';
import SecurityIcon from '@mui/icons-material/Security';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import RefreshIcon from '@mui/icons-material/Refresh';
import ConnectWithoutContactIcon from '@mui/icons-material/ConnectWithoutContact';
import AddIcon from '@mui/icons-material/Add';
import RouterIcon from '@mui/icons-material/Router';
import StorageIcon from '@mui/icons-material/Storage';

// Import the new dynamic configuration component
import ServiceConfigurationSection from '../components/Service_ConfigurationSection';

const ConfigureService = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [serviceData, setServiceData] = useState<any>(null);
    const [originalService, setOriginalService] = useState<any>(null);
    const [newSensors, setNewSensors] = useState<any[]>([]);
    const [error, setError] = useState("");
    const [editMode, setEditMode] = useState(false);
    const [accessTokenChanged, setAccessTokenChanged] = useState(false);

    // Unlock/Lock state
    const [isLocked, setIsLocked] = useState(false);
    const [requiresPassword, setRequiresPassword] = useState(false);
    const [unlocking, setUnlocking] = useState(false);
    const [unlockPassword, setUnlockPassword] = useState("");
    const [showUnlockDialog, setShowUnlockDialog] = useState(false);

    // COM ports (if applicable)
    const [comPorts, setComPorts] = useState<string[]>([]);
    const [selectedComPort, setSelectedComPort] = useState<string>("");

    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState("");
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "error" | "info" | "warning">("success");

    const showSnackbar = (message: string, severity: "success" | "error" | "info" | "warning" = "success") => {
        setSnackbarMessage(message);
        setSnackbarSeverity(severity);
        setSnackbarOpen(true);
    };

    // Get service type icon
    const getServiceIcon = (type: string) => {
        switch (type?.toLowerCase()) {
            case "mqtt":
            case "mqtt broker":
                return <RouterIcon />;
            case "host service":
            case "homeassistant":
            case "grafana":
                return <StorageIcon />;
            default: return <RouterIcon />;
        }
    };

    // Get service type color
    const getServiceColor = (type: string): "default" | "primary" | "secondary" | "success" | "info" | "warning" | "error" => {
        switch (type?.toLowerCase()) {
            case "mqtt":
            case "mqtt broker":
                return "primary";
            case "host service":
                return "success";
            case "homeassistant":
                return "info";
            case "grafana":
                return "secondary";
            default: return "default";
        }
    };

    // Check unlock status
    const checkUnlockStatus = useCallback(async () => {
        try {
            const response = await fetch(`/api/services/${id}/unlock-status`);
            if (response.ok) {
                const data = await response.json();
                setIsLocked(data.isLocked);
                setRequiresPassword(data.requiresPassword);
            }
        } catch (err) {
            console.error("Error checking unlock status:", err);
        }
    }, [id]);

    // Unlock service with password
    const handleUnlockService = async () => {
        if (!unlockPassword.trim()) {
            showSnackbar("Please enter the encryption password", "error");
            return;
        }

        setUnlocking(true);
        try {
            const response = await fetch(`/api/services/${id}/unlock`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: unlockPassword }),
            });

            const responseData = await response.json();

            if (response.status === 200 && response.ok) {
                setIsLocked(false);
                setShowUnlockDialog(false);
                setUnlockPassword("");
                showSnackbar("Service unlocked successfully", "success");
                // Refresh data now that it's unlocked
                await fetchServiceData();
            } else {
                const errorMessage = responseData?.status || "Invalid password or error occurred";
                showSnackbar(errorMessage, "error");
            }
        } catch (err) {
            showSnackbar("Error communicating with server", "error");
            console.error("Error unlocking service:", err);
        } finally {
            setUnlocking(false);
        }
    };

    // Lock service
    const handleLockService = async () => {
        try {
            const response = await fetch(`/api/services/${id}/lock`, {
                method: "POST",
            });

            if (response.ok) {
                setIsLocked(true);
                showSnackbar("Service locked", "info");
            } else {
                showSnackbar("Error locking service", "error");
            }
        } catch (err) {
            showSnackbar("Error locking service", "error");
            console.error("Error locking service:", err);
        }
    };

    // Update service field
    const updateServiceField = (field: string, value: any) => {
        if (field === 'accessToken') {
            setAccessTokenChanged(true);
        }
        setServiceData({ ...serviceData, [field]: value });
    };

    // Fetch service data
    const fetchServiceData = useCallback(async () => {
        try {
            const serviceResponse = await fetch(`/api/services/${id}`);
            if (!serviceResponse.ok) throw new Error("Failed to fetch service");
            const service = await serviceResponse.json();

            setServiceData(service);
            setOriginalService({ ...service });
            setSelectedComPort(service.COMPort || "");
        } catch (err: any) {
            console.error(err);
            setError(err.message);
        }
    }, [id]);

    // Fetch COM ports
    const fetchComPorts = async () => {
        try {
            const portsResponse = await fetch("/api/Controller_Com_Ports/com-ports");
            if (!portsResponse.ok) throw new Error("Failed to fetch COM ports");
            const ports = await portsResponse.json();
            setComPorts(ports);
        } catch (err) {
            console.error("Error fetching COM ports:", err);
        }
    };

    // Initial data loading
    useEffect(() => {
        const load = async () => {
            try {
                await fetchServiceData();
                await fetchComPorts();
                await checkUnlockStatus();
            } catch (err) {
                console.error("Error during initial load:", err);
            } finally {
                setLoading(false);
            }
        };

        if (id) {
            load();
        } else {
            setError("Service ID not provided.");
            setLoading(false);
        }
    }, [id, fetchServiceData, checkUnlockStatus]);

    // Save service changes
    const handleSaveService = async () => {
        setSaving(true);
        try {
            const payload = { ...serviceData };
            payload.COMPort = selectedComPort;

            // If access token wasn't changed, remove it from payload
            if (!accessTokenChanged && originalService?.accessToken) {
                delete payload.accessToken;
            }

            const response = await fetch(`/api/services/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error("Failed to save service");
            }

            await fetchServiceData();
            setEditMode(false);
            setAccessTokenChanged(false);
            showSnackbar("Service updated successfully", "success");
        } catch (err) {
            showSnackbar("Error saving service", "error");
            console.error("Error saving service:", err);
        } finally {
            setSaving(false);
        }
    };

    // Cancel edit mode
    const handleCancelEdit = () => {
        setServiceData({ ...originalService });
        setSelectedComPort(originalService?.COMPort || "");
        setAccessTokenChanged(false);
        setEditMode(false);
    };

    // Test service functionality based on type
    const handleTestService = async () => {
        if (isLocked) {
            showSnackbar("Please unlock the service first", "warning");
            setShowUnlockDialog(true);
            return;
        }

        const serviceType = serviceData?.type?.toLowerCase();

        try {
            switch (serviceType) {
                case "mqtt":
                case "mqtt broker":
                    const mqttResponse = await fetch(`/api/services/connect-to-mqtt/${id}`, { method: "POST" });
                    if (!mqttResponse.ok) throw new Error("Failed to connect to MQTT");
                    showSnackbar("MQTT connection test successful", "success");
                    break;

                case "homeassistant":
                    showSnackbar("HomeAssistant service is running", "info");
                    break;

                case "grafana":
                    showSnackbar("Testing Grafana connection...", "info");
                    // Add actual Grafana test logic here
                    break;

                default:
                    showSnackbar("Testing service connection...", "info");
                    break;
            }
        } catch (error) {
            showSnackbar("Service test failed", "error");
            console.error("Service test error:", error);
        }
    };

    // Delete service
    const handleDeleteService = async () => {
        if (window.confirm(`Are you sure you want to delete the service "${serviceData?.name}"? This action cannot be undone.`)) {
            try {
                setLoading(true);
                const response = await fetch(`/api/services/${id}`, {
                    method: "DELETE"
                });

                if (response.ok) {
                    showSnackbar("Service deleted successfully", "success");
                    setTimeout(() => {
                        navigate("/services");
                    }, 1500);
                } else {
                    throw new Error(`Failed to delete service: ${response.status}`);
                }
            } catch (err: any) {
                console.error("Error deleting service:", err);
                showSnackbar(`Error deleting service: ${err.message}`, "error");
                setLoading(false);
            }
        }
    };

    // Navigation
    const handleBack = () => navigate("/services");

    // Listen for bottom action bar events
    useEffect(() => {
        const handleBottomActionBack = () => {
            handleBack();
        };

        const handleBottomActionRefresh = () => {
            window.location.reload();
        };

        const handleBottomActionSave = () => {
            if (editMode && !isLocked) {
                handleSaveService();
            }
        };

        const handleBottomActionTestService = () => {
            handleTestService();
        };

        const handleBottomActionDelete = () => {
            handleDeleteService();
        };

        // Add event listeners
        window.addEventListener('bottom-action-back', handleBottomActionBack);
        window.addEventListener('bottom-action-refresh', handleBottomActionRefresh);
        window.addEventListener('bottom-action-save', handleBottomActionSave);
        window.addEventListener('bottom-action-test-service', handleBottomActionTestService);
        window.addEventListener('bottom-action-delete', handleBottomActionDelete);

        // Cleanup
        return () => {
            window.removeEventListener('bottom-action-back', handleBottomActionBack);
            window.removeEventListener('bottom-action-refresh', handleBottomActionRefresh);
            window.removeEventListener('bottom-action-save', handleBottomActionSave);
            window.removeEventListener('bottom-action-test-service', handleBottomActionTestService);
            window.removeEventListener('bottom-action-delete', handleBottomActionDelete);
        };
    }, [editMode, isLocked, serviceData, handleSaveService, handleDeleteService, handleBack]);

    // Render basic service configuration fields (common to all service types)
    const renderBasicServiceFields = () => {
        if (!serviceData) return null;

        return (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <TextField
                    label="Service Name"
                    value={serviceData.name || ''}
                    onChange={(e) => updateServiceField('name', e.target.value)}
                    disabled={!editMode || isLocked}
                    size="small"
                    required
                />

                <TextField
                    label="Description"
                    value={serviceData.description || ''}
                    onChange={(e) => updateServiceField('description', e.target.value)}
                    disabled={!editMode || isLocked}
                    size="small"
                    multiline
                    rows={2}
                />

                {comPorts.length > 0 && (
                    <FormControl size="small" disabled={!editMode || isLocked}>
                        <InputLabel id="com-port-select-label">COM Port</InputLabel>
                        <Select
                            labelId="com-port-select-label"
                            value={selectedComPort}
                            onChange={(e) => setSelectedComPort(e.target.value)}
                            label="COM Port"
                        >
                            <MenuItem value="">
                                <em>None</em>
                            </MenuItem>
                            {comPorts.map((port) => (
                                <MenuItem key={port} value={port}>{port}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}

                <TextField
                    label="Poll Rate (ms)"
                    type="number"
                    value={serviceData.pollRate || 5000}
                    onChange={(e) => updateServiceField('pollRate', parseInt(e.target.value) || 5000)}
                    disabled={!editMode || isLocked}
                    size="small"
                    helperText="How often to poll for new data (milliseconds)"
                />

                <TextField
                    label="Send Rate (ms)"
                    type="number"
                    value={serviceData.sendRate || 5000}
                    onChange={(e) => updateServiceField('sendRate', parseInt(e.target.value) || 5000)}
                    disabled={!editMode || isLocked}
                    size="small"
                    helperText="How often to send data (milliseconds)"
                />
            </Box>
        );
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                <CircularProgress />
                <Typography sx={{ ml: 2 }}>Loading...</Typography>
            </Box>
        );
    }

    if (error) {
        return (
            <Box sx={{ p: 2 }}>
                <Typography color="error">{error}</Typography>
                <Button variant="outlined" onClick={handleBack} sx={{ mt: 2 }}>
                    Back to Services
                </Button>
            </Box>
        );
    }

    return (
        <Box sx={{ p: { xs: 1, md: 2 } }}>
            {/* Header with title and action buttons */}
            <Box sx={{
                display: "flex",
                flexDirection: { xs: 'column', sm: 'row' },
                justifyContent: "space-between",
                alignItems: { xs: 'stretch', sm: 'center' },
                mb: 3,
                gap: 2
            }}>
                <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', md: '2rem' } }}>
                    Configure Service
                </Typography>

                <Box sx={{
                    display: "flex",
                    flexDirection: { xs: 'column', sm: 'row' },
                    gap: 1
                }}>
                    <Button
                        variant="outlined"
                        startIcon={<ArrowBackIcon />}
                        onClick={handleBack}
                        sx={{ width: { xs: '100%', sm: 'auto' } }}
                    >
                        Back to Services
                    </Button>

                    {/* Unlock/Lock Button */}
                    {requiresPassword && (
                        <Button
                            variant={isLocked ? "contained" : "outlined"}
                            color={isLocked ? "warning" : "secondary"}
                            startIcon={isLocked ? <LockIcon /> : <LockOpenIcon />}
                            onClick={isLocked ? () => setShowUnlockDialog(true) : handleLockService}
                            sx={{ width: { xs: '100%', sm: 'auto' } }}
                        >
                            {isLocked ? "Unlock Service" : "Lock Service"}
                        </Button>
                    )}

                    {serviceData?.type !== "Host Service" && (
                        <Button
                            variant="outlined"
                            color="error"
                            startIcon={<DeleteIcon />}
                            onClick={handleDeleteService}
                            sx={{ width: { xs: '100%', sm: 'auto' } }}
                        >
                            Delete Service
                        </Button>
                    )}
                </Box>
            </Box>

            {/* Lock Status Banner */}
            {isLocked && (
                <Box sx={{ mb: 3 }}>
                    <Alert
                        severity="warning"
                        action={
                            <Button
                                color="inherit"
                                size="small"
                                onClick={() => setShowUnlockDialog(true)}
                                startIcon={<LockOpenIcon />}
                            >
                                Unlock
                            </Button>
                        }
                    >
                        This service is locked. Unlock it to access features or modify settings.
                    </Alert>
                </Box>
            )}

            {/* Service Information Card */}
            <Card elevation={2} sx={{ mb: 3 }}>
                <CardContent>
                    <Box sx={{
                        display: 'flex',
                        flexDirection: { xs: 'column', sm: 'row' },
                        justifyContent: 'space-between',
                        alignItems: { xs: 'stretch', sm: 'center' },
                        mb: 2,
                        gap: 2
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {getServiceIcon(serviceData.type)}
                            <Typography variant="h6">
                                {serviceData.name}
                            </Typography>
                            <Chip
                                label={serviceData.type}
                                color={getServiceColor(serviceData.type)}
                                size="small"
                            />
                            <Chip
                                label={serviceData.status}
                                color={serviceData.status === "Online" ? "success" : "default"}
                                size="small"
                                variant="outlined"
                            />
                            {/* Lock status indicator */}
                            {requiresPassword && (
                                <Chip
                                    icon={isLocked ? <LockIcon /> : <LockOpenIcon />}
                                    label={isLocked ? "Locked" : "Unlocked"}
                                    color={isLocked ? "warning" : "success"}
                                    size="small"
                                    variant="outlined"
                                />
                            )}
                        </Box>

                        <Box sx={{
                            display: 'flex',
                            flexDirection: { xs: 'column', sm: 'row' },
                            gap: 1
                        }}>
                            {editMode ? (
                                <>
                                    <Button
                                        variant="contained"
                                        startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
                                        onClick={handleSaveService}
                                        disabled={saving || isLocked}
                                        sx={{ width: { xs: '100%', sm: 'auto' } }}
                                    >
                                        {saving ? "Saving..." : "Save Changes"}
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        onClick={handleCancelEdit}
                                        disabled={saving}
                                        sx={{ width: { xs: '100%', sm: 'auto' } }}
                                    >
                                        Cancel
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    variant="outlined"
                                    startIcon={<EditIcon />}
                                    onClick={() => setEditMode(true)}
                                    disabled={isLocked}
                                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                                >
                                    Edit Settings
                                </Button>
                            )}
                        </Box>
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {/* Basic Service Configuration */}
                        <Box sx={{ flex: '1 1 300px', minWidth: '300px' }}>
                            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'medium' }}>
                                Basic Configuration
                            </Typography>
                            {renderBasicServiceFields()}
                        </Box>

                        {/* Service-Specific Configuration */}
                        <Box sx={{ flex: '1 1 300px', minWidth: '300px' }}>
                            <ServiceConfigurationSection
                                serviceData={serviceData}
                                editMode={editMode}
                                isLocked={isLocked}
                                onServiceUpdate={updateServiceField}
                                onShowSnackbar={showSnackbar}
                            />
                        </Box>
                    </Box>
                </CardContent>
            </Card>

            {/* Service Sensors */}
            {serviceData.sensors && serviceData.sensors.length > 0 && (
                <Card elevation={2} sx={{ mb: 3 }}>
                    <CardContent>
                        <Typography variant="h6" sx={{ mb: 2 }}>Service Sensors</Typography>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Sensor</TableCell>
                                    <TableCell>Value</TableCell>
                                    <TableCell>Units</TableCell>
                                    <TableCell>Last Updated</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {serviceData.sensors.map((sensor: any) => (
                                    <TableRow key={sensor.id}>
                                        <TableCell>{sensor.name}</TableCell>
                                        <TableCell>{sensor.value}</TableCell>
                                        <TableCell>{sensor.unit || "N/A"}</TableCell>
                                        <TableCell>{sensor.lastUpdated ? new Date(sensor.lastUpdated).toLocaleString() : "N/A"}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* Delta Sensors */}
            {newSensors.length > 0 && (
                <Card elevation={2} sx={{ mb: 3 }}>
                    <CardContent>
                        <Typography variant="h6" sx={{ mb: 2 }}>New Sensors Available</Typography>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Sensor</TableCell>
                                    <TableCell>Units</TableCell>
                                    <TableCell>Action</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {newSensors.map((sensor) => (
                                    <TableRow key={sensor.externalId}>
                                        <TableCell>{sensor.name}</TableCell>
                                        <TableCell>{sensor.unit || "N/A"}</TableCell>
                                        <TableCell>
                                            <Button
                                                variant="contained"
                                                onClick={() => handleAddToDatabase(sensor.externalId)}
                                                startIcon={<AddIcon />}
                                                size="small"
                                            >
                                                Add to Database
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* Notification Snackbar */}
            <Snackbar
                open={snackbarOpen}
                autoHideDuration={3000}
                onClose={() => setSnackbarOpen(false)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert severity={snackbarSeverity} onClose={() => setSnackbarOpen(false)}>
                    {snackbarMessage}
                </Alert>
            </Snackbar>

            {/* Unlock Dialog */}
            <Dialog
                open={showUnlockDialog}
                onClose={() => {
                    if (!unlocking) {
                        setShowUnlockDialog(false);
                        setUnlockPassword("");
                    }
                }}
                maxWidth="sm"
                fullWidth
                disableEscapeKeyDown={unlocking}
            >
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LockIcon color="warning" />
                        Unlock Service
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        This service uses password-based encryption. Please enter the encryption password to unlock it.
                    </Typography>
                    <TextField
                        fullWidth
                        type="password"
                        label="Encryption Password"
                        value={unlockPassword}
                        onChange={(e) => setUnlockPassword(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !unlocking) {
                                e.preventDefault();
                                handleUnlockService();
                            }
                        }}
                        disabled={unlocking}
                        autoFocus
                        margin="normal"
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => {
                            if (!unlocking) {
                                setShowUnlockDialog(false);
                                setUnlockPassword("");
                            }
                        }}
                        disabled={unlocking}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleUnlockService}
                        disabled={unlocking || !unlockPassword.trim()}
                        startIcon={unlocking ? <CircularProgress size={20} /> : <LockOpenIcon />}
                    >
                        {unlocking ? "Unlocking..." : "Unlock"}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );

    // Helper function for adding sensor to database (referenced in newSensors map)
    const handleAddToDatabase = async (sensorId: string) => {
        try {
            const sensor = newSensors.find((sensor) => sensor.externalId === sensorId);
            if (!sensor) {
                showSnackbar("Sensor not found.", "error");
                return;
            }

            const payload = {
                ...sensor,
                serviceId: id,
            };

            const response = await fetch(`/api/sensors/services/${id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) throw new Error("Failed to add sensor to database.");

            showSnackbar(`Sensor ${sensor.name} added to database.`, "success");
            setNewSensors(newSensors.filter(s => s.externalId !== sensorId));
        } catch (err: any) {
            console.error("Error adding sensor to database:", err);
            showSnackbar("Failed to add sensor to database.", "error");
        }
    };
};

export default ConfigureService;