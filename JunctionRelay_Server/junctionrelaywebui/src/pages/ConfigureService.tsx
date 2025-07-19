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
import LinkOffIcon from '@mui/icons-material/LinkOff';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import RouterIcon from '@mui/icons-material/Router';
import StorageIcon from '@mui/icons-material/Storage';

interface Subscription {
    topic: string;
    qos: number;
}

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

    // MQTT and subscriptions
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [showAddSubscriptionModal, setShowAddSubscriptionModal] = useState(false);
    const [newTopic, setNewTopic] = useState("");
    const [newTopicQoS, setNewTopicQoS] = useState<number>(0);

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
            case "mqtt": return <RouterIcon />;
            case "host service": return <StorageIcon />;
            default: return <RouterIcon />;
        }
    };

    // Get service type color
    const getServiceColor = (type: string): "default" | "primary" | "secondary" | "success" | "info" | "warning" | "error" => {
        switch (type?.toLowerCase()) {
            case "mqtt": return "primary";
            case "host service": return "success";
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

    // Get access token display value
    const getAccessTokenDisplay = () => {
        const isExisting = originalService?.accessToken;
        if (isExisting && !accessTokenChanged) {
            return '••••••••••••••••';
        }
        return serviceData?.accessToken || '';
    };

    const getAccessTokenHelperText = () => {
        const isExisting = originalService?.accessToken;
        if (isExisting && !accessTokenChanged) {
            return "Encrypted access token exists. Enter new token to change it.";
        }
        return "Access token (will be encrypted when saved)";
    };

    // Fetch service data
    const fetchServiceData = useCallback(async () => {
        try {
            const serviceResponse = await fetch(`/api/services/${id}`);
            if (!serviceResponse.ok) throw new Error("Failed to fetch service");
            const service = await serviceResponse.json();

            setServiceData(service);
            setOriginalService({ ...service });
            setSelectedComPort(service.selectedPort || "");
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

    // Fetch subscriptions
    const fetchSubscriptions = async () => {
        if (isLocked) return; // Don't fetch if locked

        try {
            const res = await fetch(`/api/services/subscriptions/${id}`);
            if (!res.ok) {
                if (res.status === 500) {
                    setSubscriptions([]);
                    return;
                }
                throw new Error("Failed to fetch subscriptions");
            }
            const data = await res.json();

            const subscriptions: Subscription[] = (data.subscriptions || []).map((sub: any) => {
                let parsedQoS: number;
                if (typeof sub.qos === "string") {
                    parsedQoS = parseInt(sub.qos, 10);
                } else if (typeof sub.qos === "number") {
                    parsedQoS = sub.qos;
                } else {
                    parsedQoS = 0;
                }

                return {
                    topic: sub.topic,
                    qos: isNaN(parsedQoS) ? 0 : parsedQoS,
                };
            });

            setSubscriptions(subscriptions);
        } catch (err) {
            console.error("Error fetching subscriptions:", err);
            setSubscriptions([]);
        }
    };

    // Initial data loading
    useEffect(() => {
        const load = async () => {
            try {
                await fetchServiceData();
                await fetchComPorts();
                await checkUnlockStatus();
                await fetchSubscriptions();
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
            payload.selectedPort = selectedComPort;

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
        setSelectedComPort(originalService?.selectedPort || "");
        setAccessTokenChanged(false);
        setEditMode(false);
    };

    // MQTT Operations
    const handleConnect = async () => {
        if (isLocked) {
            showSnackbar("Please unlock the service first", "warning");
            setShowUnlockDialog(true);
            return;
        }

        try {
            const res = await fetch(`/api/services/connect-to-mqtt/${id}`, { method: "POST" });
            if (!res.ok) throw new Error("Failed to connect");
            showSnackbar("Connected to MQTT broker", "success");
        } catch (err) {
            showSnackbar("Connect failed", "error");
            console.error(err);
        }
    };

    const handleDisconnect = async () => {
        try {
            const res = await fetch(`/api/services/disconnect-from-mqtt/${id}`, { method: "POST" });
            if (!res.ok) throw new Error("Failed to disconnect");
            showSnackbar("Disconnected from MQTT broker", "success");
        } catch (err) {
            showSnackbar("Disconnect failed", "error");
            console.error(err);
        }
    };

    // Subscription management
    const handleAddCustomSubscription = async () => {
        if (isLocked) {
            showSnackbar("Please unlock the service first", "warning");
            setShowUnlockDialog(true);
            return;
        }

        try {
            const res = await fetch(`/api/services/subscribe/${id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topic: newTopic, qos: newTopicQoS })
            });

            if (!res.ok) throw new Error("Failed to add subscription");
            showSnackbar("Subscription added!", "success");
            setNewTopic("");
            setNewTopicQoS(0);
            setShowAddSubscriptionModal(false);
            await fetchSubscriptions();
        } catch (err: any) {
            showSnackbar("Failed to subscribe", "error");
        }
    };

    const handleRemoveSubscription = async (topic: string) => {
        if (isLocked) {
            showSnackbar("Please unlock the service first", "warning");
            setShowUnlockDialog(true);
            return;
        }

        try {
            const res = await fetch(`/api/services/unsubscribe/${id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topic }),
            });

            if (!res.ok) throw new Error("Unsubscribe failed");
            showSnackbar("Unsubscribed successfully", "success");
            await fetchSubscriptions();
        } catch (err) {
            console.error("Unsubscribe error:", err);
            showSnackbar("Unsubscribe failed", "error");
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

    // NEW: Listen for bottom action bar events
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
            if (!isLocked) {
                // Test MQTT connection for MQTT services
                if (serviceData?.type?.toLowerCase() === "mqtt") {
                    handleConnect();
                } else {
                    showSnackbar("Testing service connection...", "info");
                    // You can add other service test logic here
                }
            } else {
                showSnackbar("Please unlock the service first", "warning");
                setShowUnlockDialog(true);
            }
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
    }, [editMode, isLocked, serviceData, handleSaveService, handleDeleteService, handleBack, handleConnect]);

    // Render service configuration fields
    const renderServiceFields = () => {
        if (!serviceData) return null;

        const isMqttService = serviceData.type?.toLowerCase() === "mqtt";
        const needsAccessToken = ["mqtt"].includes(serviceData.type?.toLowerCase());

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

                {isMqttService && (
                    <>
                        <TextField
                            label="MQTT Broker Address"
                            value={serviceData.mqttBrokerAddress || ''}
                            onChange={(e) => updateServiceField('mqttBrokerAddress', e.target.value)}
                            disabled={!editMode || isLocked}
                            size="small"
                            placeholder="localhost"
                        />

                        <TextField
                            label="MQTT Broker Port"
                            type="number"
                            value={serviceData.mqttBrokerPort || 1883}
                            onChange={(e) => updateServiceField('mqttBrokerPort', parseInt(e.target.value) || 1883)}
                            disabled={!editMode || isLocked}
                            size="small"
                        />

                        <TextField
                            label="MQTT Username"
                            value={serviceData.mqttUsername || ''}
                            onChange={(e) => updateServiceField('mqttUsername', e.target.value)}
                            disabled={!editMode || isLocked}
                            size="small"
                        />

                        {needsAccessToken && (
                            <TextField
                                label="MQTT Password"
                                type="password"
                                value={getAccessTokenDisplay()}
                                onChange={(e) => updateServiceField('accessToken', e.target.value)}
                                disabled={!editMode || isLocked}
                                size="small"
                                helperText={editMode ? getAccessTokenHelperText() : ""}
                                placeholder={originalService?.accessToken && !accessTokenChanged ? "Enter new password to change existing" : ""}
                            />
                        )}
                    </>
                )}

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
                        This service is locked. Unlock it to access MQTT features or modify settings.
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
                        {/* Service Configuration */}
                        <Box sx={{ flex: '1 1 300px', minWidth: '300px' }}>
                            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'medium' }}>
                                Service Configuration
                            </Typography>
                            {renderServiceFields()}
                        </Box>

                        {/* MQTT Management */}
                        {serviceData.type?.toLowerCase() === "mqtt" && (
                            <Box sx={{ flex: '1 1 300px', minWidth: '300px' }}>
                                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'medium' }}>
                                    MQTT Management
                                </Typography>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                        <Button
                                            variant="contained"
                                            color="success"
                                            onClick={handleConnect}
                                            disabled={isLocked}
                                            startIcon={<ConnectWithoutContactIcon />}
                                            size="small"
                                        >
                                            {isLocked ? "Unlock First" : "Connect"}
                                        </Button>
                                        <Button
                                            variant="contained"
                                            color="error"
                                            onClick={handleDisconnect}
                                            startIcon={<LinkOffIcon />}
                                            size="small"
                                        >
                                            Disconnect
                                        </Button>
                                    </Box>

                                    <Box sx={{
                                        p: 2,
                                        bgcolor: 'action.hover',
                                        borderRadius: 1,
                                        textAlign: 'center'
                                    }}>
                                        <Typography variant="body2" color="text.secondary">
                                            <strong>Active Subscriptions:</strong> {subscriptions.length}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            <strong>Broker:</strong> {serviceData.mqttBrokerAddress || 'Not configured'}
                                        </Typography>
                                    </Box>

                                    {/* Security Notice for MQTT */}
                                    {requiresPassword && (
                                        <Box sx={{
                                            p: 2,
                                            bgcolor: 'rgba(76, 175, 80, 0.08)',
                                            borderRadius: 1,
                                            border: '1px solid rgba(76, 175, 80, 0.23)'
                                        }}>
                                            <Typography variant="caption" color="success.main" sx={{
                                                fontWeight: 'medium',
                                                display: 'flex',
                                                alignItems: 'center',
                                                mb: 0.5
                                            }}>
                                                <SecurityIcon sx={{ mr: 1, fontSize: 16 }} />
                                                Security Notice
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                MQTT credentials are automatically encrypted before being stored.
                                                {requiresPassword ? " This service uses password-based encryption for enhanced security." : " Existing credentials are never sent to your browser for security."}
                                            </Typography>
                                        </Box>
                                    )}
                                </Box>
                            </Box>
                        )}
                    </Box>
                </CardContent>
            </Card>

            {/* MQTT Subscriptions Management */}
            {serviceData.type?.toLowerCase() === "mqtt" && (
                <>
                    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6">MQTT Subscriptions</Typography>
                        <Button
                            variant="outlined"
                            onClick={() => setShowAddSubscriptionModal(true)}
                            disabled={isLocked}
                            startIcon={<AddIcon />}
                        >
                            {isLocked ? "Unlock to Add" : "Add Subscription"}
                        </Button>
                    </Box>

                    <Card elevation={2} sx={{ mb: 3 }}>
                        <CardContent>
                            {subscriptions.length > 0 ? (
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Topic</TableCell>
                                            <TableCell>QoS Level</TableCell>
                                            <TableCell>Actions</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {subscriptions.map((sub) => (
                                            <TableRow key={sub.topic}>
                                                <TableCell>{sub.topic}</TableCell>
                                                <TableCell>
                                                    {sub.qos} - {["At Most Once", "At Least Once", "Exactly Once"][sub.qos] ?? "Unknown QoS"}
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        color="error"
                                                        onClick={() => handleRemoveSubscription(sub.topic)}
                                                        disabled={isLocked}
                                                        startIcon={<RemoveIcon />}
                                                        size="small"
                                                    >
                                                        Remove
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <Paper sx={{ p: 3, textAlign: 'center' }}>
                                    <Typography variant="body1" color="text.secondary">
                                        No MQTT subscriptions configured.
                                    </Typography>
                                    <Button
                                        variant="contained"
                                        onClick={() => setShowAddSubscriptionModal(true)}
                                        disabled={isLocked}
                                        startIcon={<AddIcon />}
                                        sx={{ mt: 2 }}
                                    >
                                        {isLocked ? "Unlock to Add Subscription" : "Add First Subscription"}
                                    </Button>
                                </Paper>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}

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

            {/* Add Subscription Dialog */}
            <Dialog open={showAddSubscriptionModal} onClose={() => setShowAddSubscriptionModal(false)}>
                <DialogTitle>Add MQTT Subscription</DialogTitle>
                <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 400 }}>
                    <TextField
                        label="MQTT Topic"
                        fullWidth
                        value={newTopic}
                        onChange={(e) => setNewTopic(e.target.value)}
                        placeholder="sensor/temperature"
                        margin="normal"
                    />
                    <FormControl fullWidth margin="normal">
                        <InputLabel id="qos-label">QoS Level</InputLabel>
                        <Select
                            labelId="qos-label"
                            value={newTopicQoS}
                            label="QoS Level"
                            onChange={(e) => setNewTopicQoS(Number(e.target.value))}
                        >
                            <MenuItem value={0}>0 - At most once</MenuItem>
                            <MenuItem value={1}>1 - At least once</MenuItem>
                            <MenuItem value={2}>2 - Exactly once</MenuItem>
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setShowAddSubscriptionModal(false)}>Cancel</Button>
                    <Button
                        variant="contained"
                        onClick={handleAddCustomSubscription}
                        disabled={!newTopic.trim()}
                    >
                        Subscribe
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