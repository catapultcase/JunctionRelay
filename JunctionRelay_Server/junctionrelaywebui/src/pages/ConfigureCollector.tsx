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

import { useState, useEffect, useMemo, useCallback } from "react";
import {
    Button,
    Typography,
    Box,
    CircularProgress,
    Paper,
    Snackbar,
    Alert,
    Divider,
    Chip,
    Card,
    CardContent,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
} from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";
import { useAppVersion } from "../hooks/useAppVersion";
import { usePageTitle } from "../hooks/usePageTitle";
import { useCollectorManagement } from "../hooks/useCollectorManagement";
import { useCollectorLockManagement } from "../hooks/useCollectorLockManagement";
import { useSensorManagement } from "../hooks/useSensorManagement";

// Import components
// eslint-disable-next-line react/jsx-pascal-case
import Collectors_SensorTable from "../components/Collectors_SensorTable";
import AddSensorsProgressModal from "../components/Collectors_AddSensorsProgressModal";
import CollectorFormFields from "../components/CollectorFormFields";
import SensorFetchStats from "../components/SensorFetchStats";
import { useCollectorTypes } from "../hooks/useCollectorTypes";
import { CATEGORY_CHIP_COLORS } from '@junctionrelay/styles';

// Import icons
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import StorageIcon from '@mui/icons-material/Storage';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import EditIcon from '@mui/icons-material/Edit';
import SecurityIcon from '@mui/icons-material/Security';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import MissingLocationIcon from '@mui/icons-material/LocationOff';
import { errorMessage } from '../utils/errors';
import type { Sensor } from '../types/entities';

// TYPE SAFETY: Service interface
interface Service {
    id: number;
    name: string;
    serviceType?: string;
}

// XSD Stream interface
interface XsdStream {
    id: string;
    name: string;
    type: string;
    port: number;
    rate: number;
    enabled: boolean;
    sensorCount?: number;
}

const ConfigureCollector = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { version } = useAppVersion();
    const { collectorTypesByName } = useCollectorTypes();

    const [services, setServices] = useState<Service[]>([]);
    const [error, setError] = useState("");
    const [activeTab, setActiveTab] = useState<"stored" | "delta" | "lost">("stored");
    const [requiresPassword, setRequiresPassword] = useState(false);

    // XSD streams state
    const [xsdStreams, setXsdStreams] = useState<XsdStream[]>([]);
    const [xsdConnected, setXsdConnected] = useState(false);
    const [loadingStreams, setLoadingStreams] = useState(false);

    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState("");
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "error" | "info" | "warning">("success");

    // OPTIMIZATION: Wrap in useCallback to prevent recreation on every render
    const showSnackbar = useCallback((message: string, severity: "success" | "error" | "info" | "warning" = "success") => {
        setSnackbarMessage(message);
        setSnackbarSeverity(severity);
        setSnackbarOpen(true);
    }, []);

    // Custom hooks for collector management
    const lockMgmt = useCollectorLockManagement(
        id,
        showSnackbar,
        async () => {} // Placeholder, will be updated after sensorMgmt is initialized
    );

    const collectorMgmt = useCollectorManagement(
        id,
        showSnackbar,
        lockMgmt.checkUnlockStatus
    );

    const sensorMgmt = useSensorManagement(
        id,
        lockMgmt.isLocked,
        showSnackbar,
        collectorMgmt.setLastFetchStats,
        lockMgmt.setShowUnlockDialog
    );

    // Set page title dynamically based on collector name
    usePageTitle(collectorMgmt.collector?.name || 'Collector');

    const fetchServices = useCallback(async () => {
        try {
            const rsp = await fetch(`/api/services`);
            if (!rsp.ok) throw new Error('Failed to fetch services');
            const data = await rsp.json();

            if (!Array.isArray(data)) {
                throw new Error('Invalid services data received from API');
            }

            setServices(data);
        } catch {
            setError("Error fetching services.");
        }
    }, []);

    // Fetch XSD streams if this is an XSD collector
    const fetchXsdStreams = useCallback(async (collector: { collectorType: string; url?: string | null }) => {
        if (collector.collectorType !== 'XSD' || !collector.url?.startsWith('xsd://')) {
            return;
        }

        // Extract device ID from URL (format: xsd://{deviceId})
        const deviceId = collector.url.replace('xsd://', '');
        if (!deviceId) return;

        setLoadingStreams(true);
        try {
            const response = await fetch(`/api/xsd/${deviceId}/streams`);
            if (response.ok) {
                const data = await response.json();
                setXsdConnected(data.connected);
                setXsdStreams(data.streams || []);
            }
        } catch (err) {
            console.error("Error fetching XSD streams:", err);
        } finally {
            setLoadingStreams(false);
        }
    }, []);

    const checkUnlockStatusWithPassword = useCallback(async () => {
        try {
            const response = await fetch(`/api/collectors/${id}/unlock-status`);
            if (response.ok) {
                const data = await response.json();
                setRequiresPassword(data.requiresPassword);
            }
        } catch (err) {
            console.error("Error checking unlock status:", err);
        }
    }, [id]);

    useEffect(() => {
        const load = async () => {
            try {
                await collectorMgmt.fetchCollector();
                await sensorMgmt.fetchStoredSensors();
                await fetchServices();
                await lockMgmt.checkUnlockStatus();
                await checkUnlockStatusWithPassword();
            } catch (err) {
                console.error("Error during initial load:", err);
            }
        };

        if (id) {
            load();
        } else {
            setError("Collector ID not provided.");
        }
    }, [id, collectorMgmt.fetchCollector, sensorMgmt.fetchStoredSensors, lockMgmt.checkUnlockStatus, fetchServices, checkUnlockStatusWithPassword]);

    // Fetch XSD streams when collector is loaded
    useEffect(() => {
        if (collectorMgmt.collector) {
            fetchXsdStreams(collectorMgmt.collector);
        }
    }, [collectorMgmt.collector, fetchXsdStreams]);

    const handleBack = () => navigate("/collectors");

    const handleDeleteCollector = async () => {
        if (window.confirm(`Are you sure you want to delete the collector "${collectorMgmt.collector?.name}"? This action cannot be undone and will also delete all associated sensors.`)) {
            try {
                const response = await fetch(`/api/collectors/${id}`, {
                    method: "DELETE"
                });

                if (response.ok) {
                    showSnackbar("Collector deleted successfully", "success");
                    setTimeout(() => {
                        navigate("/collectors");
                    }, 1500);
                } else {
                    const errorText = await response.text();
                    console.error("Delete error response:", errorText);
                    throw new Error(`Failed to delete collector: ${response.status} ${response.statusText}`);
                }
            } catch (err) {
                console.error("Error deleting collector:", err);
                showSnackbar(`Error deleting collector: ${errorMessage(err)}`, "error");
            }
        }
    };

    useEffect(() => {
        const handleBottomActionBack = () => {
            handleBack();
        };

        const handleBottomActionRefresh = () => {
            window.location.reload();
        };

        const handleBottomActionSave = () => {
            if (collectorMgmt.editMode && collectorMgmt.hasChanges && !lockMgmt.isLocked) {
                collectorMgmt.handleSaveCollector();
            }
        };

        const handleBottomActionTestConnection = () => {
            if (!lockMgmt.isLocked) {
                showSnackbar("Testing connection...", "info");
            } else {
                showSnackbar("Please unlock the collector first", "warning");
                lockMgmt.setShowUnlockDialog(true);
            }
        };

        const handleBottomActionDelete = () => {
            handleDeleteCollector();
        };

        window.addEventListener('bottom-action-back', handleBottomActionBack);
        window.addEventListener('bottom-action-refresh', handleBottomActionRefresh);
        window.addEventListener('bottom-action-save', handleBottomActionSave);
        window.addEventListener('bottom-action-test-connection', handleBottomActionTestConnection);
        window.addEventListener('bottom-action-delete', handleBottomActionDelete);

        return () => {
            window.removeEventListener('bottom-action-back', handleBottomActionBack);
            window.removeEventListener('bottom-action-refresh', handleBottomActionRefresh);
            window.removeEventListener('bottom-action-save', handleBottomActionSave);
            window.removeEventListener('bottom-action-test-connection', handleBottomActionTestConnection);
            window.removeEventListener('bottom-action-delete', handleBottomActionDelete);
        };
    }, [collectorMgmt.editMode, collectorMgmt.hasChanges, lockMgmt.isLocked, collectorMgmt.handleSaveCollector, handleDeleteCollector]);

    // OPTIMIZATION: Memoize render functions to prevent recreation on every render
    const renderStoredSensorActions = useCallback((sensor: Sensor) => (
        <Button
            size="small"
            variant="contained"
            color="error"
            onClick={() => sensorMgmt.handleDeleteSensor(sensor.id)}
            startIcon={<DeleteIcon />}
        >
            Remove from DB
        </Button>
    ), [sensorMgmt.handleDeleteSensor]);

    const renderDeltaSensorActions = useCallback((sensor: Sensor) => (
        <Button
            size="small"
            variant="contained"
            color="primary"
            onClick={() => sensorMgmt.handleAddSensor(sensor.id)}
            startIcon={<AddIcon />}
        >
            Add to DB
        </Button>
    ), [sensorMgmt.handleAddSensor]);

    const renderLostSensorActions = useCallback((sensor: Sensor) => (
        <Button
            size="small"
            variant="contained"
            color="error"
            onClick={() => sensorMgmt.handleRemoveLostSensor(sensor.id)}
            startIcon={<DeleteIcon />}
        >
            Remove from DB
        </Button>
    ), [sensorMgmt.handleRemoveLostSensor]);

    const displaySensors = useMemo(() => {
        switch (activeTab) {
            case "stored": return sensorMgmt.storedSensors;
            case "delta": return sensorMgmt.fetchedSensors;
            case "lost": return sensorMgmt.lostSensors;
            default: return sensorMgmt.storedSensors;
        }
    }, [activeTab, sensorMgmt.storedSensors, sensorMgmt.fetchedSensors, sensorMgmt.lostSensors]);

    // Handle fetch with auto tab switching
    const handleFetchWithTabSwitch = useCallback(async () => {
        const result = await sensorMgmt.fetchDeltaSensors();
        if (result) {
            const { newCount, lostCount } = result;
            if (lostCount > 0) {
                setActiveTab("lost");
            } else if (newCount > 0) {
                setActiveTab("delta");
            } else {
                setActiveTab("stored");
            }
            // Refresh XSD streams after successful fetch (device may have just connected)
            if (collectorMgmt.collector) {
                fetchXsdStreams(collectorMgmt.collector);
            }
        }
    }, [sensorMgmt.fetchDeltaSensors, collectorMgmt.collector, fetchXsdStreams]);

    const handleAddAllWithTabSwitch = useCallback(async () => {
        await sensorMgmt.handleAddAllSensors();
        setActiveTab("stored");
    }, [sensorMgmt.handleAddAllSensors]);

    const isEncryptionPasswordRequired = () => {
        if (!collectorMgmt.editMode) return false;
        if (collectorMgmt.collector?.externalAccessToken && collectorMgmt.accessTokenChanged) {
            return !collectorMgmt.encryptionPassword.trim();
        }
        return false;
    };

    if (collectorMgmt.loading || !collectorMgmt.collector) {
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
                    Back to Collectors
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
                <Typography variant="h6">
                    Configure Collector
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
                        Back to Collectors
                    </Button>

                    {requiresPassword && (
                        <Button
                            variant={lockMgmt.isLocked ? "contained" : "outlined"}
                            color={lockMgmt.isLocked ? "warning" : "secondary"}
                            startIcon={lockMgmt.isLocked ? <LockIcon /> : <LockOpenIcon />}
                            onClick={lockMgmt.isLocked ? () => lockMgmt.setShowUnlockDialog(true) : lockMgmt.handleLockCollector}
                            sx={{ width: { xs: '100%', sm: 'auto' } }}
                        >
                            {lockMgmt.isLocked ? "Unlock Collector" : "Lock Collector"}
                        </Button>
                    )}

                    <Button
                        variant="outlined"
                        color="error"
                        startIcon={<DeleteIcon />}
                        onClick={handleDeleteCollector}
                        sx={{ width: { xs: '100%', sm: 'auto' } }}
                    >
                        Delete Collector
                    </Button>
                </Box>
            </Box>

            {/* Lock Status Banner */}
            {lockMgmt.isLocked && (
                <Box sx={{ mb: 3 }}>
                    <Alert
                        severity="warning"
                        action={
                            <Button
                                color="inherit"
                                size="small"
                                onClick={() => lockMgmt.setShowUnlockDialog(true)}
                                startIcon={<LockOpenIcon />}
                            >
                                Unlock
                            </Button>
                        }
                    >
                        This collector is locked. Unlock it to fetch sensors or modify settings.
                    </Alert>
                </Box>
            )}

            {/* Collector Information Card */}
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
                            <span style={{ fontSize: '1.4rem' }}>{collectorTypesByName.get(collectorMgmt.collector.collectorType)?.emoji || "⚙️"}</span>
                            <Typography variant="h6">
                                {collectorMgmt.collector.name}
                            </Typography>
                            <Chip
                                label={collectorMgmt.collector.collectorType}
                                color={CATEGORY_CHIP_COLORS[collectorTypesByName.get(collectorMgmt.collector.collectorType)?.category || ""] || "default"}
                                size="small"
                            />
                            {requiresPassword && (
                                <Chip
                                    icon={lockMgmt.isLocked ? <LockIcon /> : <LockOpenIcon />}
                                    label={lockMgmt.isLocked ? "Locked" : "Unlocked"}
                                    color={lockMgmt.isLocked ? "warning" : "success"}
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
                            {collectorMgmt.editMode ? (
                                <>
                                    <Button
                                        variant="contained"
                                        startIcon={collectorMgmt.saving ? <CircularProgress size={20} /> : <SaveIcon />}
                                        onClick={collectorMgmt.handleSaveCollector}
                                        disabled={collectorMgmt.saving || !collectorMgmt.hasChanges || lockMgmt.isLocked || isEncryptionPasswordRequired()}
                                        sx={{ width: { xs: '100%', sm: 'auto' } }}
                                    >
                                        {collectorMgmt.saving ? "Saving..." : "Save Changes"}
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        onClick={collectorMgmt.handleCancelEdit}
                                        disabled={collectorMgmt.saving}
                                        sx={{ width: { xs: '100%', sm: 'auto' } }}
                                    >
                                        Cancel
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    variant="outlined"
                                    startIcon={<EditIcon />}
                                    onClick={() => collectorMgmt.setEditMode(true)}
                                    disabled={lockMgmt.isLocked}
                                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                                >
                                    Edit Settings
                                </Button>
                            )}
                        </Box>
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {/* Collector Configuration */}
                        <Box sx={{ flex: '1 1 300px', minWidth: '300px' }}>
                            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'medium' }}>
                                Collector Configuration
                            </Typography>
                            <CollectorFormFields
                                collector={collectorMgmt.collector}
                                services={services}
                                editMode={collectorMgmt.editMode}
                                isLocked={lockMgmt.isLocked}
                                updateField={collectorMgmt.updateCollectorField}
                                accessTokenDisplay={collectorMgmt.accessTokenDisplay}
                                accessTokenHelperText={collectorMgmt.accessTokenHelperText}
                                accessTokenChanged={collectorMgmt.accessTokenChanged}
                                encryptionPassword={collectorMgmt.encryptionPassword}
                                setEncryptionPassword={collectorMgmt.setEncryptionPassword}
                                originalCollector={collectorMgmt.originalCollector}
                                originalEncryptionMethod={collectorMgmt.originalEncryptionMethod}
                                metadata={collectorTypesByName.get(collectorMgmt.collector.collectorType)}
                            />
                        </Box>

                        {/* Sensor Management */}
                        <Box sx={{ flex: '1 1 300px', minWidth: '300px' }}>
                            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'medium' }}>
                                Sensor Management
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Button
                                    variant="contained"
                                    onClick={handleFetchWithTabSwitch}
                                    disabled={sensorMgmt.fetchingSensors || lockMgmt.isLocked || collectorMgmt.editMode}
                                    startIcon={sensorMgmt.fetchingSensors ? <CircularProgress size={20} /> : <RefreshIcon />}
                                    fullWidth
                                >
                                    {sensorMgmt.fetchingSensors ? "Fetching Sensors..." :
                                        lockMgmt.isLocked ? "Unlock Collector First" :
                                        collectorMgmt.editMode ? "Save Changes First" : "Fetch New Sensors"}
                                </Button>

                                <SensorFetchStats
                                    lastFetchStats={collectorMgmt.lastFetchStats}
                                    collector={{
                                        lastTested: collectorMgmt.collector.lastTested ?? undefined,
                                        testFrequency: collectorMgmt.collector.testFrequency ?? undefined,
                                        lastFetchErrorMessage: collectorMgmt.collector.lastFetchErrorMessage ?? undefined,
                                    }}
                                    storedSensorsCount={sensorMgmt.storedSensors.length}
                                />

                                {/* Security Notice */}
                                {(collectorTypesByName.get(collectorMgmt.collector.collectorType)?.fields?.requiresAccessToken) && (
                                        <Box sx={{
                                            p: 2,
                                            bgcolor: requiresPassword ? 'rgba(255, 152, 0, 0.08)' : 'rgba(76, 175, 80, 0.08)',
                                            borderRadius: 1,
                                            border: '1px solid',
                                            borderColor: requiresPassword ? 'rgba(255, 152, 0, 0.23)' : 'rgba(76, 175, 80, 0.23)'
                                        }}>
                                            <Typography variant="caption" color={requiresPassword ? "warning.main" : "success.main"} sx={{
                                                fontWeight: 'medium',
                                                display: 'flex',
                                                alignItems: 'center',
                                                mb: 0.5
                                            }}>
                                                <SecurityIcon sx={{ mr: 1, fontSize: 16 }} />
                                                {requiresPassword ? "Password-Protected Collector" : "Database-Encrypted Collector"}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {requiresPassword
                                                    ? "This collector uses password-based encryption for maximum security. Access tokens are encrypted with your password and require manual unlock."
                                                    : "Access tokens are automatically encrypted using database encryption. The application can decrypt them automatically on startup."
                                                }
                                            </Typography>
                                        </Box>
                                    )}
                            </Box>
                        </Box>
                    </Box>
                </CardContent>
            </Card>

            {/* Sensor Fetch Error Card */}
            {sensorMgmt.sensorFetchError && (
                <Card elevation={3} sx={{ mb: 3, border: '2px solid', borderColor: 'error.main' }}>
                    <CardContent sx={{ bgcolor: 'error.light', color: 'error.contrastText' }}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                            <Alert
                                severity="error"
                                sx={{
                                    flex: 1,
                                    bgcolor: 'transparent',
                                    color: 'inherit',
                                    '& .MuiAlert-icon': {
                                        color: 'error.main'
                                    }
                                }}
                                action={
                                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                        <Button
                                            color="inherit"
                                            size="small"
                                            variant="outlined"
                                            onClick={() => sensorMgmt.setSensorFetchError(null)}
                                            sx={{
                                                borderColor: 'error.contrastText',
                                                color: 'error.contrastText',
                                                '&:hover': {
                                                    borderColor: 'error.contrastText',
                                                    bgcolor: 'rgba(255, 255, 255, 0.1)'
                                                }
                                            }}
                                        >
                                            Dismiss
                                        </Button>
                                        <Button
                                            color="inherit"
                                            size="small"
                                            variant="contained"
                                            onClick={handleFetchWithTabSwitch}
                                            disabled={sensorMgmt.fetchingSensors || lockMgmt.isLocked}
                                            startIcon={sensorMgmt.fetchingSensors ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                                            sx={{
                                                bgcolor: 'error.dark',
                                                color: 'error.contrastText',
                                                '&:hover': {
                                                    bgcolor: 'error.main'
                                                }
                                            }}
                                        >
                                            {sensorMgmt.fetchingSensors ? "Retrying..." : "Retry"}
                                        </Button>
                                    </Box>
                                }
                            >
                                <Box>
                                    <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1 }}>
                                        Sensor Fetch Issue Detected
                                    </Typography>
                                    <Typography variant="body2" sx={{ mb: 2 }}>
                                        {sensorMgmt.sensorFetchError}
                                    </Typography>

                                    <Typography variant="body2" sx={{ fontWeight: 'medium', mb: 1 }}>
                                        Troubleshooting Steps:
                                    </Typography>
                                    <Box component="ul" sx={{ m: 0, pl: 2, '& li': { mb: 0.5 } }}>
                                        <li>Verify the collector configuration (URL, API tokens, etc.)</li>
                                        <li>Check network connectivity to the target service</li>
                                        <li>Ensure the target service is running and accessible</li>
                                        <li>Review API key permissions and expiration</li>
                                        {requiresPassword && <li>Verify the collector is unlocked with the correct password</li>}
                                    </Box>
                                </Box>
                            </Alert>
                        </Box>
                    </CardContent>
                </Card>
            )}

            {/* XSD Available Streams */}
            {collectorMgmt.collector.collectorType === 'XSD' && (
                <Card elevation={2} sx={{ mb: 3 }}>
                    <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                            <Typography variant="h6">
                                Available Streams
                            </Typography>
                            <Chip
                                label={xsdConnected ? "Connected" : "Disconnected"}
                                color={xsdConnected ? "success" : "error"}
                                size="small"
                            />
                        </Box>

                        {loadingStreams ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                                <CircularProgress size={24} />
                            </Box>
                        ) : !xsdConnected ? (
                            <Alert severity="warning">
                                XSD device is not connected. Streams will appear when the device connects.
                            </Alert>
                        ) : xsdStreams.length === 0 ? (
                            <Alert severity="info">
                                No streams available from this XSD device.
                            </Alert>
                        ) : (
                            <>
                                {/* Polled Stream (main) */}
                                {xsdStreams.filter(s => s.id === 'main').length > 0 && (
                                    <Box sx={{ mb: 3 }}>
                                        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 500, color: 'primary.main' }}>
                                            Polled Stream
                                        </Typography>
                                        <Table size="small">
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
                                                    <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
                                                    <TableCell sx={{ fontWeight: 'bold' }} align="right">Port</TableCell>
                                                    <TableCell sx={{ fontWeight: 'bold' }} align="right">Broadcast Rate</TableCell>
                                                    <TableCell sx={{ fontWeight: 'bold' }} align="center">Status</TableCell>
                                                    <TableCell sx={{ fontWeight: 'bold' }} align="right">Sensors</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {xsdStreams.filter(s => s.id === 'main').map((stream) => (
                                                    <TableRow key={stream.id} hover>
                                                        <TableCell>{stream.name}</TableCell>
                                                        <TableCell>
                                                            <Chip
                                                                label={stream.type}
                                                                size="small"
                                                                color="primary"
                                                            />
                                                        </TableCell>
                                                        <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{stream.port}</TableCell>
                                                        <TableCell align="right">{stream.rate}ms</TableCell>
                                                        <TableCell align="center">
                                                            <Chip
                                                                label={stream.enabled ? "Active" : "Inactive"}
                                                                size="small"
                                                                color={stream.enabled ? "success" : "default"}
                                                                variant="outlined"
                                                            />
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            {stream.sensorCount !== undefined ? stream.sensorCount : '-'}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </Box>
                                )}

                                {/* Additional (Non-polled) Streams */}
                                {xsdStreams.filter(s => s.id !== 'main').length > 0 && (
                                    <Box>
                                        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 500, color: 'text.secondary' }}>
                                            Additional Streams (Not Polled)
                                        </Typography>
                                        <Table size="small">
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
                                                    <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
                                                    <TableCell sx={{ fontWeight: 'bold' }} align="right">Port</TableCell>
                                                    <TableCell sx={{ fontWeight: 'bold' }} align="right">Broadcast Rate</TableCell>
                                                    <TableCell sx={{ fontWeight: 'bold' }} align="center">Status</TableCell>
                                                    <TableCell sx={{ fontWeight: 'bold' }} align="right">Sensors</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {xsdStreams.filter(s => s.id !== 'main').map((stream) => (
                                                    <TableRow key={stream.id} hover>
                                                        <TableCell>{stream.name}</TableCell>
                                                        <TableCell>
                                                            <Chip
                                                                label={stream.type}
                                                                size="small"
                                                                color={stream.type === 'audio' ? 'secondary' : 'default'}
                                                            />
                                                        </TableCell>
                                                        <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{stream.port}</TableCell>
                                                        <TableCell align="right">{stream.rate}ms</TableCell>
                                                        <TableCell align="center">
                                                            <Chip
                                                                label={stream.enabled ? "Active" : "Inactive"}
                                                                size="small"
                                                                color={stream.enabled ? "success" : "default"}
                                                                variant="outlined"
                                                            />
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            {stream.sensorCount !== undefined ? stream.sensorCount : '-'}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </Box>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Setup Instructions Accordion */}
            {(() => {
                const meta = collectorTypesByName.get(collectorMgmt.collector.collectorType);
                const steps = meta?.setupInstructions || [];
                if (steps.length === 0 && !meta?.setupNote) return null;
                return (
                    <Accordion sx={{ mb: 3 }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography variant="h6">Setup Instructions</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                            {steps.map((step, i) => (
                                <Box key={i} sx={{ mb: i < steps.length - 1 ? 2 : 0 }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                                        {step.title}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                                        {step.body}
                                    </Typography>
                                </Box>
                            ))}
                            {meta?.setupNote && (
                                <Typography variant="body2" color="text.secondary" sx={{ mt: steps.length > 0 ? 2 : 0, fontStyle: 'italic' }}>
                                    {meta.setupNote}
                                </Typography>
                            )}
                        </AccordionDetails>
                    </Accordion>
                );
            })()}

            {/* Tab Selection */}
            <Box sx={{
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                justifyContent: 'space-between',
                mb: 2,
                gap: 2
            }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    <Button
                        variant={activeTab === "stored" ? "contained" : "outlined"}
                        onClick={() => setActiveTab("stored")}
                        startIcon={<StorageIcon />}
                    >
                        Stored Sensors ({sensorMgmt.storedSensors.length})
                    </Button>

                    <Button
                        variant={activeTab === "delta" ? "contained" : "outlined"}
                        onClick={() => setActiveTab("delta")}
                        startIcon={<NewReleasesIcon />}
                        disabled={sensorMgmt.fetchedSensors.length === 0}
                        color={sensorMgmt.fetchedSensors.length > 0 ? "primary" : "inherit"}
                    >
                        New Sensors
                        {sensorMgmt.fetchedSensors.length > 0 && (
                            <Chip
                                label={sensorMgmt.fetchedSensors.length}
                                color="success"
                                size="small"
                                sx={{ ml: 1, height: 20 }}
                            />
                        )}
                    </Button>

                    <Button
                        variant={activeTab === "lost" ? "contained" : "outlined"}
                        onClick={() => setActiveTab("lost")}
                        startIcon={<MissingLocationIcon />}
                        disabled={sensorMgmt.lostSensors.length === 0}
                        color={sensorMgmt.lostSensors.length > 0 ? "error" : "inherit"}
                    >
                        Lost Sensors
                        {sensorMgmt.lostSensors.length > 0 && (
                            <Chip
                                label={sensorMgmt.lostSensors.length}
                                color="error"
                                size="small"
                                sx={{ ml: 1, height: 20 }}
                            />
                        )}
                    </Button>
                </Box>

                {sensorMgmt.fetchedSensors.length > 0 && activeTab === "delta" && (
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={handleAddAllWithTabSwitch}
                        startIcon={sensorMgmt.addingSensors ? <CircularProgress size={20} color="inherit" /> : <AddIcon />}
                        disabled={sensorMgmt.addingSensors}
                        sx={{ width: { xs: '100%', sm: 'auto' } }}
                    >
                        {sensorMgmt.addingSensors ? "Adding..." : `Add All ${sensorMgmt.fetchedSensors.length} Sensors`}
                    </Button>
                )}

                {sensorMgmt.lostSensors.length > 0 && activeTab === "lost" && (
                    <Button
                        variant="contained"
                        color="error"
                        onClick={sensorMgmt.handleRemoveAllLostSensors}
                        startIcon={<DeleteIcon />}
                        sx={{ width: { xs: '100%', sm: 'auto' } }}
                    >
                        Remove All {sensorMgmt.lostSensors.length} from DB
                    </Button>
                )}
            </Box>

            {/* Sensors Table */}
            {displaySensors.length > 0 ? (
                <Box sx={{ mb: 3 }}>
                    <Collectors_SensorTable
                        key={`${activeTab}_${sensorMgmt.storedSensors.length}_${sensorMgmt.fetchedSensors.length}_${sensorMgmt.lostSensors.length}`}
                        sensors={displaySensors}
                        title={
                            activeTab === "stored" ? "Stored Sensors" :
                                activeTab === "delta" ? "New Sensors Available" :
                                    "Lost Sensors"
                        }
                        icon={
                            activeTab === "stored" ? <StorageIcon sx={{ mr: 1 }} /> :
                                activeTab === "delta" ? <NewReleasesIcon sx={{ mr: 1 }} /> :
                                    <MissingLocationIcon sx={{ mr: 1 }} />
                        }
                        customActions={
                            activeTab === "stored" ? renderStoredSensorActions :
                                activeTab === "delta" ? renderDeltaSensorActions :
                                    renderLostSensorActions
                        }
                        appVersion={version || undefined}
                        localStorageKey={`collector_${id}_${activeTab}_sensors`}
                    />
                </Box>
            ) : (
                <Paper
                    elevation={2}
                    sx={{ p: 3, mb: 3, borderRadius: 2, textAlign: 'center' }}
                >
                    <Typography variant="body1" color="text.secondary">
                        {activeTab === "stored"
                            ? "No sensors are currently stored in the database."
                            : activeTab === "delta"
                                ? "No new sensors available. Click 'Fetch New Sensors' to check for updates."
                                : "No lost sensors detected. This means all stored sensors are still available from the collector."
                        }
                    </Typography>
                    {activeTab === "stored" && (
                        <Button
                            variant="contained"
                            onClick={handleFetchWithTabSwitch}
                            disabled={sensorMgmt.fetchingSensors || lockMgmt.isLocked || collectorMgmt.editMode}
                            startIcon={sensorMgmt.fetchingSensors ? <CircularProgress size={20} /> : <RefreshIcon />}
                            sx={{ mt: 2 }}
                        >
                            {sensorMgmt.fetchingSensors ? "Fetching Sensors..." :
                                lockMgmt.isLocked ? "Unlock Collector First" :
                                collectorMgmt.editMode ? "Save Changes First" : "Fetch New Sensors"}
                        </Button>
                    )}
                    {activeTab === "lost" && (
                        <Box sx={{ mt: 2, p: 2, bgcolor: 'success.light', borderRadius: 1 }}>
                            <Typography variant="body2" color="success.dark">
                                Lost sensors are sensors that were previously stored in the database but are no longer
                                available from the collector. This could indicate that the sensor has been removed from
                                the source system, renamed, or the collector configuration has changed.
                            </Typography>
                        </Box>
                    )}
                </Paper>
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
                open={lockMgmt.showUnlockDialog}
                onClose={() => {
                    if (!lockMgmt.unlocking) {
                        lockMgmt.setShowUnlockDialog(false);
                        lockMgmt.setUnlockPassword("");
                    }
                }}
                maxWidth="sm"
                fullWidth
                disableEscapeKeyDown={lockMgmt.unlocking}
            >
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LockIcon color="warning" />
                        Unlock Collector
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        This collector uses password-based encryption. Please enter the encryption password to unlock it.
                    </Typography>
                    <TextField
                        fullWidth
                        type="password"
                        label="Encryption Password"
                        value={lockMgmt.unlockPassword}
                        onChange={(e) => lockMgmt.setUnlockPassword(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !lockMgmt.unlocking) {
                                e.preventDefault();
                                lockMgmt.handleUnlockCollector();
                            }
                        }}
                        disabled={lockMgmt.unlocking}
                        autoFocus
                        margin="normal"
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => {
                            if (!lockMgmt.unlocking) {
                                lockMgmt.setShowUnlockDialog(false);
                                lockMgmt.setUnlockPassword("");
                            }
                        }}
                        disabled={lockMgmt.unlocking}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={lockMgmt.handleUnlockCollector}
                        disabled={lockMgmt.unlocking || !lockMgmt.unlockPassword.trim()}
                        startIcon={lockMgmt.unlocking ? <CircularProgress size={20} /> : <LockOpenIcon />}
                    >
                        {lockMgmt.unlocking ? "Unlocking..." : "Unlock"}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Sensor Addition Progress Modal */}
            <AddSensorsProgressModal
                open={sensorMgmt.addingSensors}
                totalSensors={sensorMgmt.addSensorsProgress.total}
                addedSensors={sensorMgmt.addSensorsProgress.added}
                skippedSensors={sensorMgmt.addSensorsProgress.skipped}
                isComplete={sensorMgmt.addSensorsComplete}
                hasError={!!sensorMgmt.addSensorsError}
                errorMessage={sensorMgmt.addSensorsError || undefined}
                onClose={sensorMgmt.handleCloseProgressModal}
            />
        </Box>
    );
};

export default ConfigureCollector;
