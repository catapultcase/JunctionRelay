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
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Divider,
    Chip,
    TextField,
    Card,
    CardContent,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
} from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";

// Import the EnhancedSensorsTable component
import EnhancedSensorsTable from "../components/EnhancedSensorsTable";
import SetupInstructions_Collectors from "../components/SetupInstructions_Collectors";

// Import icons
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import StorageIcon from '@mui/icons-material/Storage';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import SettingsIcon from '@mui/icons-material/Settings';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import EditIcon from '@mui/icons-material/Edit';
import SecurityIcon from '@mui/icons-material/Security';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CloudIcon from '@mui/icons-material/Cloud';
import CodeIcon from '@mui/icons-material/Code';
import HomeIcon from '@mui/icons-material/Home';
import ComputerIcon from '@mui/icons-material/Computer';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import RouterIcon from '@mui/icons-material/Router';
import ColorLensIcon from '@mui/icons-material/ColorLens';
import SpeedIcon from '@mui/icons-material/Speed';
import WebIcon from '@mui/icons-material/Web';
import PaymentIcon from '@mui/icons-material/Payment';
import MonitorIcon from '@mui/icons-material/Monitor';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import TvIcon from '@mui/icons-material/Tv';

const ConfigureCollector = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [collector, setCollector] = useState<any>(null);
    const [originalCollector, setOriginalCollector] = useState<any>(null); // Store original values
    const [storedSensors, setStoredSensors] = useState<any[]>([]);
    const [fetchedSensors, setFetchedSensors] = useState<any[]>([]);
    const [fetchingSensors, setFetchingSensors] = useState(false);
    const [services, setServices] = useState<any[]>([]);
    const [error, setError] = useState("");
    const [activeTab, setActiveTab] = useState<"stored" | "delta">("stored");
    const [editMode, setEditMode] = useState(false);
    const [accessTokenChanged, setAccessTokenChanged] = useState(false);

    // NEW: Unlock/Lock state
    const [isLocked, setIsLocked] = useState(false);
    const [requiresPassword, setRequiresPassword] = useState(false);
    const [unlocking, setUnlocking] = useState(false);
    const [unlockPassword, setUnlockPassword] = useState("");
    const [showUnlockDialog, setShowUnlockDialog] = useState(false);

    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState("");
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "error" | "info" | "warning">("success");

    // Define the default columns for each view
    const getDefaultVisibleColumns = (viewType: "stored" | "delta") => {
        return [
            "id",
            "externalId",
            "name",
            "componentName",
            "value",
            "unit",
            "decimalPlaces",
            "lastUpdated",
            "actions"
        ];
    };

    const showSnackbar = (message: string, severity: "success" | "error" | "info" | "warning" = "success") => {
        setSnackbarMessage(message);
        setSnackbarSeverity(severity);
        setSnackbarOpen(true);
    };

    // Get collector type icon
    const getCollectorIcon = (type: string) => {
        switch (type) {
            case "Cloudflare": return <CloudIcon />;
            case "Github": return <CodeIcon />;
            case "HomeAssistant": return <HomeIcon />;
            case "Host": return <ComputerIcon />;
            case "LibreHardwareMonitor": return <MonitorHeartIcon />;
            case "MQTT": return <RouterIcon />;
            case "NeoPixelColor": return <ColorLensIcon />;
            case "RateTester": return <SpeedIcon />;
            case "Render": return <WebIcon />;
            case "SonarrCalendar": return <TvIcon />;
            case "Stripe": return <PaymentIcon />;
            case "UptimeKuma": return <MonitorIcon />;
            default: return <SettingsIcon />;
        }
    };

    // Get collector type color
    const getCollectorColor = (type: string): "default" | "primary" | "secondary" | "success" | "info" | "warning" | "error" => {
        switch (type) {
            case "Cloudflare": return "primary";
            case "Github": return "info";
            case "HomeAssistant": return "info";
            case "Host": return "secondary";
            case "LibreHardwareMonitor": return "primary";
            case "MQTT": return "error";
            case "NeoPixelColor": return "secondary";
            case "RateTester": return "warning";
            case "Render": return "success";
            case "SonarrCalendar": return "secondary";
            case "Stripe": return "success";
            case "UptimeKuma": return "success";
            default: return "default";
        }
    };

    // NEW: Check unlock status
    const checkUnlockStatus = useCallback(async () => {
        try {
            const response = await fetch(`/api/collectors/${id}/unlock-status`);
            if (response.ok) {
                const data = await response.json();
                setIsLocked(data.isLocked);
                setRequiresPassword(data.requiresPassword);
            }
        } catch (err) {
            console.error("Error checking unlock status:", err);
        }
    }, [id]);

    // NEW: Unlock collector with password
    const handleUnlockCollector = async () => {
        if (!unlockPassword.trim()) {
            showSnackbar("Please enter the encryption password", "error");
            return;
        }

        setUnlocking(true);
        try {
            const response = await fetch(`/api/collectors/${id}/unlock`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: unlockPassword }),
            });

            console.log("Unlock response status:", response.status, response.ok);

            // Parse response first
            let responseData;
            try {
                responseData = await response.json();
                console.log("Unlock response data:", responseData);
            } catch (parseError) {
                console.error("Failed to parse response JSON:", parseError);
                throw new Error("Invalid response from server");
            }

            // Only close modal and update state if we got a successful response (200)
            if (response.status === 200 && response.ok) {
                console.log("Password correct - unlocking");
                setIsLocked(false);
                setShowUnlockDialog(false);
                setUnlockPassword("");
                showSnackbar("Collector unlocked successfully", "success");
                // Refresh data now that it's unlocked
                await fetchStoredSensors();
            } else {
                // Password was wrong or other error - keep modal open
                console.log("Password incorrect - keeping modal open");
                const errorMessage = responseData?.status || "Invalid password or error occurred";
                showSnackbar(errorMessage, "error");
                // DO NOT close modal, DO NOT clear password, DO NOT change lock state
            }
        } catch (err) {
            console.error("Network or other error during unlock:", err);
            showSnackbar("Error communicating with server", "error");
            // Keep modal open on network errors too
        } finally {
            setUnlocking(false);
        }
    };

    // NEW: Lock collector
    const handleLockCollector = async () => {
        try {
            const response = await fetch(`/api/collectors/${id}/lock`, {
                method: "POST",
            });

            if (response.ok) {
                setIsLocked(true);
                showSnackbar("Collector locked", "info");
            } else {
                showSnackbar("Error locking collector", "error");
            }
        } catch (err) {
            showSnackbar("Error locking collector", "error");
            console.error("Error locking collector:", err);
        }
    };

    // Update collector field
    const updateCollectorField = (field: string, value: any) => {
        if (field === 'accessToken') {
            setAccessTokenChanged(true);
        }
        setCollector({ ...collector, [field]: value });
    };

    // Check if form has changes
    const hasChanges = useMemo(() => {
        if (!originalCollector || !collector) return false;
        return Object.keys(collector).some(key => {
            if (key === 'accessToken' && !accessTokenChanged) {
                return false; // Don't consider unchanged access token as a change
            }
            return collector[key] !== originalCollector[key];
        });
    }, [collector, originalCollector, accessTokenChanged]);

    // Get access token display value
    const getAccessTokenDisplay = () => {
        const isExisting = originalCollector?.accessToken;
        if (isExisting && !accessTokenChanged) {
            return '••••••••••••••••'; // Show masked value for existing token
        }
        return collector?.accessToken || ''; // Show actual value for new/changed tokens
    };

    const getAccessTokenHelperText = () => {
        const isExisting = originalCollector?.accessToken;
        if (isExisting && !accessTokenChanged) {
            return "Encrypted access token exists. Enter new token to change it.";
        }
        return "Access token (will be encrypted when saved)";
    };

    // Save collector changes
    const handleSaveCollector = async () => {
        setSaving(true);
        try {
            const payload = { ...collector };

            // If access token wasn't changed, remove it from payload to avoid overwriting
            if (!accessTokenChanged && originalCollector?.accessToken) {
                delete payload.accessToken;
            }

            const response = await fetch(`/api/collectors/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error("Failed to save collector");
            }

            // Refresh collector data
            await fetchCollector();
            setEditMode(false);
            setAccessTokenChanged(false);
            showSnackbar("Collector updated successfully", "success");
        } catch (err) {
            showSnackbar("Error saving collector", "error");
            console.error("Error saving collector:", err);
        } finally {
            setSaving(false);
        }
    };

    // Cancel edit mode
    const handleCancelEdit = () => {
        setCollector({ ...originalCollector });
        setAccessTokenChanged(false);
        setEditMode(false);
    };

    // Fetch the collector details
    const fetchCollector = useCallback(async () => {
        try {
            const rsp = await fetch(`/api/collectors/${id}`);
            if (!rsp.ok) throw new Error();
            const data = await rsp.json();
            setCollector(data);
            setOriginalCollector({ ...data }); // Store original values
        } catch {
            setError("Error fetching collector data.");
        }
    }, [id]);

    // Fetch sensors already stored in the database
    const fetchStoredSensors = useCallback(async () => {
        try {
            const rsp = await fetch(`/api/collectors/${id}/sensors`);
            if (!rsp.ok) {
                // If it's a 500 error and collector might be locked, just set empty sensors
                if (rsp.status === 500) {
                    setStoredSensors([]);
                    return;
                }
                throw new Error();
            }
            const data = await rsp.json();

            const transformedSensors = (data.storedSensors || []).map((sensor: any) => ({
                Id: sensor.id,
                name: sensor.name,
                sensorTag: sensor.externalId,
                deviceName: "Collector",
                componentName: sensor.sensorType,
                externalId: sensor.externalId,
                IsSelected: true,
                unit: sensor.unit,
                value: sensor.value,
                decimalPlaces: sensor.decimalPlaces,
                sensorOrder: sensor.sensorOrder || 0,
                lastUpdated: sensor.lastUpdated,
                mqttTopic: sensor.mqttTopic,
                mqttQoS: sensor.mqttQoS,
                customAttribute1: sensor.customAttribute1,
                customAttribute2: sensor.customAttribute2,
                customAttribute3: sensor.customAttribute3,
                customAttribute4: sensor.customAttribute4,
                customAttribute5: sensor.customAttribute5,
                customAttribute6: sensor.customAttribute6,
                customAttribute7: sensor.customAttribute7,
                customAttribute8: sensor.customAttribute8,
                customAttribute9: sensor.customAttribute9,
                customAttribute10: sensor.customAttribute10
            }));

            setStoredSensors(transformedSensors);
        } catch {
            // Don't set error state for sensor fetching issues - just set empty sensors
            setStoredSensors([]);
        }
    }, [id]);

    // Fetch available services
    const fetchServices = async () => {
        try {
            const rsp = await fetch(`/api/services`);
            if (!rsp.ok) throw new Error();
            setServices(await rsp.json());
        } catch {
            setError("Error fetching services.");
        }
    };

    // Initial data loading
    useEffect(() => {
        const load = async () => {
            try {
                await fetchCollector();
                await fetchStoredSensors();
                await fetchServices();
                await checkUnlockStatus(); // NEW: Check unlock status
            } catch (err) {
                console.error("Error during initial load:", err);
            } finally {
                setLoading(false);
            }
        };

        if (id) {
            load();
        } else {
            setError("Collector ID not provided.");
            setLoading(false);
        }
    }, [id, fetchCollector, fetchStoredSensors, checkUnlockStatus]);

    // MODIFIED: Fetch new sensors from the collector that are not already in the DB
    const fetchDeltaSensors = async () => {
        if (isLocked) {
            showSnackbar("Please unlock the collector first", "warning");
            setShowUnlockDialog(true);
            return;
        }

        setFetchingSensors(true);
        try {
            const rsp = await fetch(`/api/collectors/${id}/sensors/delta`);
            if (!rsp.ok) throw new Error();
            const data = await rsp.json();
            const newOnes = data.filter(
                (s: any) => !storedSensors.some((st) => st.externalId === s.externalId)
            );

            const transformedSensors = newOnes.map((sensor: any) => ({
                Id: sensor.id || `temp-${Math.random().toString(36).substring(2, 11)}`,
                name: sensor.name,
                sensorTag: sensor.externalId,
                deviceName: "Collector (New)",
                componentName: sensor.sensorType,
                externalId: sensor.externalId,
                IsSelected: false,
                unit: sensor.unit,
                value: sensor.value,
                decimalPlaces: sensor.decimalPlaces,
                sensorOrder: 0,
                lastUpdated: sensor.lastUpdated,
                mqttTopic: sensor.mqttTopic,
                mqttQoS: sensor.mqttQoS,
                customAttribute1: sensor.customAttribute1,
                customAttribute2: sensor.customAttribute2,
                customAttribute3: sensor.customAttribute3,
                customAttribute4: sensor.customAttribute4,
                customAttribute5: sensor.customAttribute5,
                customAttribute6: sensor.customAttribute6,
                customAttribute7: sensor.customAttribute7,
                customAttribute8: sensor.customAttribute8,
                customAttribute9: sensor.customAttribute9,
                customAttribute10: sensor.customAttribute10
            }));

            setFetchedSensors(transformedSensors);
            setActiveTab("delta");
            await fetchStoredSensors();

            showSnackbar(`Found ${transformedSensors.length} new sensors`, transformedSensors.length > 0 ? "info" : "success");
        } catch {
            setError("Error fetching delta sensors.");
            showSnackbar("Error fetching new sensors", "error");
        } finally {
            setFetchingSensors(false);
        }
    };

    // Handle adding a sensor
    const handleAddSensor = async (sensorId: number | string) => {
        try {
            const sensor = fetchedSensors.find((s) => s.Id === sensorId);
            if (!sensor) throw new Error("Sensor not found");

            const payload = {
                name: sensor.name,
                externalId: sensor.externalId || sensor.sensorTag,
                sensorType: sensor.componentName,
                value: sensor.value,
                unit: sensor.unit || "",
                decimalPlaces: sensor.decimalPlaces || 0,
                componentName: sensor.componentName || "",
                lastUpdated: sensor.lastUpdated || new Date().toISOString(),
                collectorId: Number(id),
                sensorTag: sensor.sensorTag || sensor.externalId || "",
                deviceName: sensor.deviceName || "Collector",
                category: sensor.componentName || "Sensor",
                mqttTopic: sensor.mqttTopic || null,
                mqttQoS: sensor.mqttQoS || null,
                customAttribute1: sensor.customAttribute1 || null,
                customAttribute2: sensor.customAttribute2 || null,
                customAttribute3: sensor.customAttribute3 || null,
                customAttribute4: sensor.customAttribute4 || null,
                customAttribute5: sensor.customAttribute5 || null,
                customAttribute6: sensor.customAttribute6 || null,
                customAttribute7: sensor.customAttribute7 || null,
                customAttribute8: sensor.customAttribute8 || null,
                customAttribute9: sensor.customAttribute9 || null,
                customAttribute10: sensor.customAttribute10 || null
            };

            const rsp = await fetch(`/api/sensors/collectors/${id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!rsp.ok) {
                let errorMsg = `HTTP Error: ${rsp.status} ${rsp.statusText}`;
                try {
                    const errorData = await rsp.text();
                    console.error("Server error details:", errorData);
                    errorMsg += ` - ${errorData}`;
                } catch (e) {
                    // Ignore text parsing error
                }
                throw new Error(errorMsg);
            }

            setFetchedSensors(fetchedSensors.filter((s) => s.Id !== sensorId));
            await fetchStoredSensors();

            showSnackbar("Sensor added successfully.", "success");
        } catch (error) {
            console.error("Error adding sensor:", error);
            showSnackbar(`Error adding sensor: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
        }
    };

    // Handle adding all sensors
    const handleAddAllSensors = async () => {
        if (fetchedSensors.length === 0) {
            showSnackbar("No new sensors to add", "info");
            return;
        }

        setLoading(true);

        try {
            const addPromises = fetchedSensors.map(async (sensor) => {
                const sensorPayload = {
                    name: sensor.name,
                    externalId: sensor.externalId || sensor.sensorTag,
                    sensorType: sensor.componentName,
                    value: sensor.value,
                    unit: sensor.unit || "",
                    decimalPlaces: sensor.decimalPlaces || 0,
                    componentName: sensor.componentName || "",
                    lastUpdated: sensor.lastUpdated || new Date().toISOString(),
                    collectorId: Number(id),
                    sensorTag: sensor.sensorTag || sensor.externalId || "",
                    deviceName: sensor.deviceName || "Collector",
                    category: sensor.componentName || "Sensor",
                    mqttTopic: sensor.mqttTopic || null,
                    mqttQoS: sensor.mqttQoS || null,
                    customAttribute1: sensor.customAttribute1 || null,
                    customAttribute2: sensor.customAttribute2 || null,
                    customAttribute3: sensor.customAttribute3 || null,
                    customAttribute4: sensor.customAttribute4 || null,
                    customAttribute5: sensor.customAttribute5 || null,
                    customAttribute6: sensor.customAttribute6 || null,
                    customAttribute7: sensor.customAttribute7 || null,
                    customAttribute8: sensor.customAttribute8 || null,
                    customAttribute9: sensor.customAttribute9 || null,
                    customAttribute10: sensor.customAttribute10 || null
                };

                try {
                    const rsp = await fetch(`/api/sensors/collectors/${id}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(sensorPayload),
                    });

                    if (!rsp.ok) {
                        const errorText = await rsp.text();
                        console.error(`Error response for ${sensor.name}:`, errorText);
                        throw new Error(`Failed to add sensor ${sensor.name}`);
                    }

                    return { success: true, sensor };
                } catch (error) {
                    console.error(`Error adding sensor ${sensor.name}:`, error);
                    return { success: false, sensor };
                }
            });

            const results = await Promise.all(addPromises);
            const successCount = results.filter(r => r.success).length;
            const failureCount = results.length - successCount;

            setFetchedSensors([]);
            await fetchStoredSensors();
            setActiveTab("stored");

            if (failureCount === 0) {
                showSnackbar(`Successfully added all ${successCount} sensors`, "success");
            } else if (successCount === 0) {
                showSnackbar(`Failed to add any sensors`, "error");
            } else {
                showSnackbar(`Added ${successCount} sensors, failed to add ${failureCount}`, "warning");
            }
        } catch (error) {
            console.error("Error in bulk add operation:", error);
            showSnackbar("An error occurred while adding sensors", "error");
        } finally {
            setLoading(false);
        }
    };

    // Handle deleting a sensor from the database
    const handleDeleteSensor = async (sensorId: number) => {
        try {
            const rsp = await fetch(`/api/sensors/${sensorId}`, { method: "DELETE" });
            if (!rsp.ok) throw new Error();

            setStoredSensors(storedSensors.filter((s) => s.Id !== sensorId));
            showSnackbar("Sensor deleted.", "success");
        } catch {
            showSnackbar("Error deleting sensor.", "error");
        }
    };

    // Navigation and collector management
    const handleBack = () => navigate("/collectors");

    const handleDeleteCollector = async () => {
        if (window.confirm(`Are you sure you want to delete the collector "${collector?.name}"? This action cannot be undone and will also delete all associated sensors.`)) {
            try {
                setLoading(true);
                const response = await fetch(`/api/collectors/${id}`, {
                    method: "DELETE"
                });

                if (response.ok) {
                    showSnackbar("Collector deleted successfully", "success");
                    // Give user time to see the success message before navigating
                    setTimeout(() => {
                        navigate("/collectors");
                    }, 1500);
                } else {
                    const errorText = await response.text();
                    console.error("Delete error response:", errorText);
                    throw new Error(`Failed to delete collector: ${response.status} ${response.statusText}`);
                }
            } catch (err: any) {
                console.error("Error deleting collector:", err);
                showSnackbar(`Error deleting collector: ${err.message}`, "error");
                setLoading(false); // Reset loading state on error
            }
        }
    };

    // NEW: Listen for bottom action bar events
    useEffect(() => {
        const handleBottomActionBack = () => {
            handleBack();
        };

        const handleBottomActionRefresh = () => {
            window.location.reload();
        };

        const handleBottomActionSave = () => {
            if (editMode && hasChanges && !isLocked) {
                handleSaveCollector();
            }
        };

        const handleBottomActionTestConnection = () => {
            if (!isLocked) {
                // Implement test connection logic
                showSnackbar("Testing connection...", "info");
                // You can add actual test connection API call here
            } else {
                showSnackbar("Please unlock the collector first", "warning");
                setShowUnlockDialog(true);
            }
        };

        const handleBottomActionDelete = () => {
            handleDeleteCollector();
        };

        // Add event listeners
        window.addEventListener('bottom-action-back', handleBottomActionBack);
        window.addEventListener('bottom-action-refresh', handleBottomActionRefresh);
        window.addEventListener('bottom-action-save', handleBottomActionSave);
        window.addEventListener('bottom-action-test-connection', handleBottomActionTestConnection);
        window.addEventListener('bottom-action-delete', handleBottomActionDelete);

        // Cleanup
        return () => {
            window.removeEventListener('bottom-action-back', handleBottomActionBack);
            window.removeEventListener('bottom-action-refresh', handleBottomActionRefresh);
            window.removeEventListener('bottom-action-save', handleBottomActionSave);
            window.removeEventListener('bottom-action-test-connection', handleBottomActionTestConnection);
            window.removeEventListener('bottom-action-delete', handleBottomActionDelete);
        };
    }, [editMode, hasChanges, isLocked, handleSaveCollector, handleDeleteCollector, handleBack]);

    // Mock functions required by EnhancedSensorsTable but not used in this context
    const noopAsync = async () => { /* Do nothing */ };
    const noop = () => { /* Do nothing */ };

    // Custom action renderers for the EnhancedSensorsTable
    const renderStoredSensorActions = (sensor: any) => (
        <Button
            size="small"
            variant="contained"
            color="error"
            onClick={() => handleDeleteSensor(sensor.Id)}
            startIcon={<DeleteIcon />}
        >
            Delete
        </Button>
    );

    const renderDeltaSensorActions = (sensor: any) => (
        <Button
            size="small"
            variant="contained"
            color="primary"
            onClick={() => handleAddSensor(sensor.Id)}
            startIcon={<AddIcon />}
        >
            Add to DB
        </Button>
    );

    // Filter and customize sensors for the active tab
    const displaySensors = useMemo(() => {
        return activeTab === "stored" ? storedSensors : fetchedSensors;
    }, [activeTab, storedSensors, fetchedSensors]);

    // Render collector configuration fields based on type
    const renderCollectorFields = () => {
        if (!collector) return null;

        const needsUrl = ["Cloudflare", "Github", "HomeAssistant", "LibreHardwareMonitor", "Render", "SonarrCalendar", "Stripe", "UptimeKuma"].includes(collector.collectorType);
        const needsAccessToken = ["Cloudflare", "Github", "HomeAssistant", "Render", "Stripe"].includes(collector.collectorType);
        const needsService = collector.collectorType === "MQTT";

        return (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <TextField
                    label="Collector Name"
                    value={collector.name || ''}
                    onChange={(e) => updateCollectorField('name', e.target.value)}
                    disabled={!editMode || isLocked}
                    size="small"
                    required
                />

                {needsUrl && (
                    <TextField
                        label={
                            collector.collectorType === "Github" ? "GitHub Repository URL" :
                                collector.collectorType === "Cloudflare" ? "Cloudflare Zone URL" :
                                    collector.collectorType === "Render" ? "Render Service URL" :
                                        collector.collectorType === "SonarrCalendar" ? "Sonarr iCal Feed URL" :
                                            collector.collectorType === "Stripe" ? "Stripe API Base URL" :
                                                "URL"
                        }
                        value={collector.url || ''}
                        onChange={(e) => updateCollectorField('url', e.target.value)}
                        disabled={!editMode || isLocked}
                        size="small"
                        required
                        placeholder={
                            collector.collectorType === "Github" ? "https://github.com/owner/repo" :
                                collector.collectorType === "Cloudflare" ? "https://dash.cloudflare.com/account_id/zone_id" :
                                    collector.collectorType === "Render" ? "https://dashboard.render.com/web/srv-abc123" :
                                        collector.collectorType === "SonarrCalendar" ? "http://your-sonarr:8989/feed/v3/calendar/Sonarr.ics?apikey=..." :
                                            collector.collectorType === "Stripe" ? "https://api.stripe.com" :
                                                ""
                        }
                    />
                )}

                {needsAccessToken && (
                    <TextField
                        label={
                            collector.collectorType === "Github" ? "GitHub Personal Access Token" :
                                collector.collectorType === "Cloudflare" ? "Cloudflare API Token" :
                                    collector.collectorType === "Render" ? "Render API Key" :
                                        collector.collectorType === "Stripe" ? "Stripe Secret Key" :
                                            "Access Token"
                        }
                        type="password"
                        value={getAccessTokenDisplay()}
                        onChange={(e) => updateCollectorField('accessToken', e.target.value)}
                        disabled={!editMode || isLocked}
                        size="small"
                        required
                        helperText={editMode ? getAccessTokenHelperText() : ""}
                        placeholder={
                            originalCollector?.accessToken && !accessTokenChanged
                                ? "Enter new token to change existing"
                                : collector.collectorType === "Github" ? "ghp_..." :
                                    collector.collectorType === "Cloudflare" ? "cf_api_token..." :
                                        collector.collectorType === "Render" ? "rnd_..." :
                                            collector.collectorType === "Stripe" ? "sk_..." :
                                                ""
                        }
                    />
                )}

                {needsService && (
                    <FormControl size="small" disabled={!editMode || isLocked}>
                        <InputLabel id="service-select-label">Associated Service</InputLabel>
                        <Select
                            labelId="service-select-label"
                            value={collector.serviceId || ''}
                            onChange={(e) => updateCollectorField('serviceId', e.target.value)}
                            label="Associated Service"
                        >
                            <MenuItem value="">
                                <em>None</em>
                            </MenuItem>
                            {services.map((svc) => (
                                <MenuItem key={svc.id} value={svc.id}>{svc.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}

                <TextField
                    label="Poll Rate (ms)"
                    type="number"
                    value={collector.pollRate || 5000}
                    onChange={(e) => updateCollectorField('pollRate', parseInt(e.target.value) || 5000)}
                    disabled={!editMode || isLocked}
                    size="small"
                    helperText="How often to poll for new data (milliseconds)"
                />

                {collector.collectorType === "RateTester" && (
                    <TextField
                        label="Send Rate (ms)"
                        type="number"
                        value={collector.sendRate || 1000}
                        onChange={(e) => updateCollectorField('sendRate', parseInt(e.target.value) || 1000)}
                        disabled={!editMode || isLocked}
                        size="small"
                        helperText="How often to send test data (milliseconds)"
                    />
                )}
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
                <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', md: '2rem' } }}>
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

                    {/* NEW: Unlock/Lock Button */}
                    {requiresPassword && (
                        <Button
                            variant={isLocked ? "contained" : "outlined"}
                            color={isLocked ? "warning" : "secondary"}
                            startIcon={isLocked ? <LockIcon /> : <LockOpenIcon />}
                            onClick={isLocked ? () => setShowUnlockDialog(true) : handleLockCollector}
                            sx={{ width: { xs: '100%', sm: 'auto' } }}
                        >
                            {isLocked ? "Unlock Collector" : "Lock Collector"}
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

            {/* NEW: Lock Status Banner */}
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
                            {getCollectorIcon(collector.collectorType)}
                            <Typography variant="h6">
                                {collector.name}
                            </Typography>
                            <Chip
                                label={collector.collectorType}
                                color={getCollectorColor(collector.collectorType)}
                                size="small"
                            />
                            {/* NEW: Lock status indicator */}
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
                                        onClick={handleSaveCollector}
                                        disabled={saving || !hasChanges || isLocked}
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
                        {/* Collector Configuration */}
                        <Box sx={{ flex: '1 1 300px', minWidth: '300px' }}>
                            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'medium' }}>
                                Collector Configuration
                            </Typography>
                            {renderCollectorFields()}
                        </Box>

                        {/* Sensor Management */}
                        <Box sx={{ flex: '1 1 300px', minWidth: '300px' }}>
                            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'medium' }}>
                                Sensor Management
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Button
                                    variant="contained"
                                    onClick={fetchDeltaSensors}
                                    disabled={fetchingSensors || isLocked}
                                    startIcon={fetchingSensors ? <CircularProgress size={20} /> : <RefreshIcon />}
                                    fullWidth
                                >
                                    {fetchingSensors ? "Fetching Sensors..." :
                                        isLocked ? "Unlock Collector First" : "Fetch New Sensors"}
                                </Button>

                                <Box sx={{
                                    p: 2,
                                    bgcolor: 'action.hover',
                                    borderRadius: 1,
                                    textAlign: 'center'
                                }}>
                                    <Typography variant="body2" color="text.secondary">
                                        <strong>Stored Sensors:</strong> {storedSensors.length}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        <strong>New Sensors:</strong> {fetchedSensors.length}
                                    </Typography>
                                </Box>

                                {/* Security Notice */}
                                {(collector.collectorType === "Cloudflare" ||
                                    collector.collectorType === "Github" ||
                                    collector.collectorType === "HomeAssistant" ||
                                    collector.collectorType === "Render" ||
                                    collector.collectorType === "Stripe") && (
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
                                                Access tokens are automatically encrypted before being stored.
                                                {requiresPassword ? " This collector uses password-based encryption for enhanced security." : " Existing credentials are never sent to your browser for security."}
                                            </Typography>
                                        </Box>
                                    )}
                            </Box>
                        </Box>
                    </Box>
                </CardContent>
            </Card>

            {/* Setup Instructions Accordion */}
            <Accordion sx={{ mb: 3 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="h6">Setup Instructions</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <SetupInstructions_Collectors collectorType={collector.collectorType} />
                </AccordionDetails>
            </Accordion>

            {/* Tab Selection with Add All button */}
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
                        Stored Sensors ({storedSensors.length})
                    </Button>

                    <Button
                        variant={activeTab === "delta" ? "contained" : "outlined"}
                        onClick={() => setActiveTab("delta")}
                        startIcon={<NewReleasesIcon />}
                        disabled={fetchedSensors.length === 0}
                        color={fetchedSensors.length > 0 ? "primary" : "inherit"}
                    >
                        New Sensors {fetchedSensors.length > 0 && `(${fetchedSensors.length})`}
                        {fetchedSensors.length > 0 && (
                            <Chip
                                label={fetchedSensors.length}
                                color="error"
                                size="small"
                                sx={{ ml: 1, height: 20 }}
                            />
                        )}
                    </Button>
                </Box>

                {/* Add All button - only show when there are new sensors and we're on the delta tab */}
                {fetchedSensors.length > 0 && activeTab === "delta" && (
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={handleAddAllSensors}
                        startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <AddIcon />}
                        disabled={loading}
                        sx={{ width: { xs: '100%', sm: 'auto' } }}
                    >
                        {loading ? "Adding..." : `Add All ${fetchedSensors.length} Sensors`}
                    </Button>
                )}
            </Box>

            {/* Sensors Table */}
            {displaySensors.length > 0 ? (
                <Box sx={{ mb: 3 }}>
                    <EnhancedSensorsTable
                        availableSensors={displaySensors}
                        handleSensorSelect={noopAsync}
                        handleSensorOrderChange={noopAsync}
                        handleSensorTagChange={noopAsync}
                        getSensorOrder={(sensor) => sensor.sensorOrder || 0}
                        getSensorTag={(sensor) => sensor.sensorTag || ''}
                        sensorTargets={{}}
                        targets={[]}
                        removeSensorTarget={(junctionId, sensorId, deviceId) => noopAsync()}
                        assignSensorTarget={(junctionId, sensorId, deviceId, screenId) => noopAsync()}
                        setCurrentSensor={noop}
                        setCurrentTargetDevice={noop}
                        setScreenSelectionModalOpen={noop}
                        showSnackbar={showSnackbar}
                        setSensorTargets={noop}
                        junctionId={0}

                        // Custom props for this specific usage
                        hideEditColumn={true}
                        hideJunctionSettings={true}
                        hideTargetsColumn={true}
                        hideSelectionColumn={true}
                        hideSourceColumn={true}
                        customTitle={activeTab === "stored" ? "Stored Sensors" : "New Sensors Available"}
                        customIcon={activeTab === "stored" ? <StorageIcon sx={{ mr: 1 }} /> : <NewReleasesIcon sx={{ mr: 1 }} />}
                        customActions={activeTab === "stored" ? renderStoredSensorActions : renderDeltaSensorActions}
                        readOnly={true}
                        showLastUpdated={true}
                        hideFilters={false}

                        // Use different local storage keys for each view to maintain separate column preferences
                        localStorageKey={`collector_${id}_${activeTab}_sensors_columns`}

                        // Pass in default visible columns for this view
                        defaultVisibleColumns={getDefaultVisibleColumns(activeTab)}
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
                            : "No new sensors available. Click 'Fetch New Sensors' to check for updates."}
                    </Typography>
                    {activeTab === "stored" && (
                        <Button
                            variant="contained"
                            onClick={fetchDeltaSensors}
                            disabled={fetchingSensors || isLocked}
                            startIcon={fetchingSensors ? <CircularProgress size={20} /> : <RefreshIcon />}
                            sx={{ mt: 2 }}
                        >
                            {fetchingSensors ? "Fetching Sensors..." :
                                isLocked ? "Unlock Collector First" : "Fetch New Sensors"}
                        </Button>
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

            {/* NEW: Unlock Dialog */}
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
                        value={unlockPassword}
                        onChange={(e) => setUnlockPassword(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !unlocking) {
                                e.preventDefault();
                                handleUnlockCollector();
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
                        onClick={handleUnlockCollector}
                        disabled={unlocking || !unlockPassword.trim()}
                        startIcon={unlocking ? <CircularProgress size={20} /> : <LockOpenIcon />}
                    >
                        {unlocking ? "Unlocking..." : "Unlock"}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ConfigureCollector;