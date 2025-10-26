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
    FormControlLabel,
    Radio,
    RadioGroup,
    FormLabel,
} from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";
import { useAppVersion } from "../hooks/useAppVersion";

// Import components
// eslint-disable-next-line react/jsx-pascal-case
import Collectors_SensorTable from "../components/Collectors_SensorTable";
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
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import InfoIcon from '@mui/icons-material/Info';
import MissingLocationIcon from '@mui/icons-material/LocationOff';

const ConfigureCollector = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { version } = useAppVersion();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [collector, setCollector] = useState<any>(null);
    const [originalCollector, setOriginalCollector] = useState<any>(null);
    const [storedSensors, setStoredSensors] = useState<any[]>([]);
    const [fetchedSensors, setFetchedSensors] = useState<any[]>([]);
    const [lostSensors, setLostSensors] = useState<any[]>([]); // NEW: Lost sensors state
    const [fetchingSensors, setFetchingSensors] = useState(false);
    const [services, setServices] = useState<any[]>([]);
    const [error, setError] = useState("");
    const [activeTab, setActiveTab] = useState<"stored" | "delta" | "lost">("stored"); // UPDATED: Add "lost" tab
    const [editMode, setEditMode] = useState(false);
    const [accessTokenChanged, setAccessTokenChanged] = useState(false);

    // NEW: Encryption method state
    const [encryptionPassword, setEncryptionPassword] = useState<string>("");
    const [originalEncryptionMethod, setOriginalEncryptionMethod] = useState<boolean>(false);

    // Unlock/Lock state
    const [isLocked, setIsLocked] = useState(false);
    const [requiresPassword, setRequiresPassword] = useState(false);
    const [unlocking, setUnlocking] = useState(false);
    const [unlockPassword, setUnlockPassword] = useState("");
    const [showUnlockDialog, setShowUnlockDialog] = useState(false);

    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState("");
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "error" | "info" | "warning">("success");

    // NEW: Enhanced sensor fetch state
    const [sensorFetchError, setSensorFetchError] = useState<string | null>(null);
    const [lastFetchStats, setLastFetchStats] = useState<{
        totalFetched: number;
        totalStored: number;
        newSensors: number;
        lostSensors: number; // UPDATED: Add lost sensors count
        fetchSuccessful: boolean;
        lastFetchTime: Date | null;
    }>({
        totalFetched: 0,
        totalStored: 0,
        newSensors: 0,
        lostSensors: 0, // UPDATED: Add lost sensors count
        fetchSuccessful: false,
        lastFetchTime: null
    });

    const showSnackbar = (message: string, severity: "success" | "error" | "info" | "warning" = "success") => {
        setSnackbarMessage(message);
        setSnackbarSeverity(severity);
        setSnackbarOpen(true);
    };

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

            let responseData;
            try {
                responseData = await response.json();
            } catch (parseError) {
                throw new Error("Invalid response from server");
            }

            if (response.status === 200 && response.ok) {
                setIsLocked(false);
                setShowUnlockDialog(false);
                setUnlockPassword("");
                showSnackbar("Collector unlocked - running test...", "success");
                await fetchStoredSensors();
            } else {
                const errorMessage = responseData?.status || "Invalid password or error occurred";
                showSnackbar(errorMessage, "error");
            }
        } catch (err) {
            showSnackbar("Error communicating with server", "error");
        } finally {
            setUnlocking(false);
        }
    };

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

    const updateCollectorField = (field: string, value: any) => {
        if (field === 'accessToken') {
            setAccessTokenChanged(true);
        }
        setCollector({ ...collector, [field]: value });
    };

    const hasChanges = useMemo(() => {
        if (!originalCollector || !collector) return false;

        const encryptionMethodChanged = (collector.externalAccessToken || false) !== originalEncryptionMethod;

        const fieldsChanged = Object.keys(collector).some(key => {
            if (key === 'accessToken' && !accessTokenChanged) {
                return false;
            }
            return collector[key] !== originalCollector[key];
        });

        return fieldsChanged || encryptionMethodChanged;
    }, [collector, originalCollector, accessTokenChanged, originalEncryptionMethod]);

    const getAccessTokenDisplay = () => {
        const isExisting = originalCollector?.accessToken;
        if (isExisting && !accessTokenChanged) {
            return '••••••••••••••••';
        }
        return collector?.accessToken || '';
    };

    const getAccessTokenHelperText = () => {
        const isExisting = originalCollector?.accessToken;
        if (isExisting && !accessTokenChanged) {
            return "Encrypted access token exists. Enter new token to change it.";
        }
        return "Access token (will be encrypted when saved)";
    };

    const isEncryptionPasswordRequired = () => {
        if (!editMode) return false;

        // If changing to password encryption and token is being changed
        if (collector?.externalAccessToken && accessTokenChanged) {
            return !encryptionPassword.trim();
        }

        return false;
    };

    const handleSaveCollector = async () => {
        setSaving(true);
        try {
            const payload: any = { ...collector };

            // Only include access token if it's been changed
            if (!accessTokenChanged && originalCollector?.accessToken) {
                delete payload.accessToken;
            }

            // Include encryption password if using password-based encryption for new/changed tokens
            if (collector.externalAccessToken && accessTokenChanged && encryptionPassword.trim()) {
                payload.encryptionPassword = encryptionPassword;
            }

            // If switching from password to database encryption, ensure we clear external flag
            if (!collector.externalAccessToken && originalEncryptionMethod) {
                payload.externalAccessToken = false;
                delete payload.encryptionPassword;
            }

            const response = await fetch(`/api/collectors/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to save collector: ${errorText}`);
            }

            await fetchCollector();
            await checkUnlockStatus();
            setEditMode(false);
            setAccessTokenChanged(false);
            setEncryptionPassword("");
            showSnackbar("Collector updated successfully", "success");
        } catch (err: any) {
            showSnackbar(`Error saving collector: ${err.message}`, "error");
            console.error("Error saving collector:", err);
        } finally {
            setSaving(false);
        }
    };

    const handleCancelEdit = () => {
        setCollector({ ...originalCollector });
        setAccessTokenChanged(false);
        setEncryptionPassword("");
        setEditMode(false);
    };

    const fetchCollector = useCallback(async () => {
        try {
            const rsp = await fetch(`/api/collectors/${id}`);
            if (!rsp.ok) throw new Error();
            const data = await rsp.json();
            setCollector(data);
            setOriginalCollector({ ...data });
            setOriginalEncryptionMethod(data.externalAccessToken || false);

            // Use persisted lastFetchLostSensors count
            if (data.lastFetchTime) {
                setLastFetchStats({
                    totalFetched: data.lastFetchTotalSensors || 0,
                    totalStored: data.lastFetchTotalSensors - (data.lastFetchNewSensors || 0),
                    newSensors: data.lastFetchNewSensors || 0,
                    lostSensors: data.lastFetchLostSensors || 0, // UPDATED: Add lost sensors from backend
                    fetchSuccessful: data.lastFetchSuccessful ?? false,
                    lastFetchTime: new Date(data.lastFetchTime)
                });
            }
        } catch {
            setError("Error fetching collector data.");
        }
    }, [id]);

    const fetchStoredSensors = useCallback(async () => {
        try {
            const rsp = await fetch(`/api/collectors/${id}/sensors`);
            if (!rsp.ok) {
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
                sensorTag: sensor.sensorTag,
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

            // Update stored sensor count in stats
            setLastFetchStats(prev => ({
                ...prev,
                totalStored: transformedSensors.length
            }));
        } catch {
            setStoredSensors([]);
        }
    }, [id]);

    const fetchServices = async () => {
        try {
            const rsp = await fetch(`/api/services`);
            if (!rsp.ok) throw new Error();
            setServices(await rsp.json());
        } catch {
            setError("Error fetching services.");
        }
    };

    useEffect(() => {
        const load = async () => {
            try {
                await fetchCollector();
                await fetchStoredSensors();
                await fetchServices();
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
            setError("Collector ID not provided.");
            setLoading(false);
        }
    }, [id, fetchCollector, fetchStoredSensors, checkUnlockStatus]);

    const fetchDeltaSensors = async () => {
        if (isLocked) {
            showSnackbar("Please unlock the collector first", "warning");
            setShowUnlockDialog(true);
            return;
        }

        setFetchingSensors(true);
        setSensorFetchError(null);

        try {
            const rsp = await fetch(`/api/collectors/${id}/sensors/delta`);
            if (!rsp.ok) throw new Error(`HTTP ${rsp.status}: ${rsp.statusText}`);

            const response = await rsp.json();
            const deltaSensors = response.deltaSensors || response.newSensors || [];
            const lostSensorsData = response.lostSensors || []; // NEW: Extract lost sensors
            const totalFetched = response.totalFetched || 0;
            const totalStored = response.totalStored || 0;
            const totalLost = response.totalLost || 0; // NEW: Extract lost count
            const fetchSuccessful = response.fetchSuccessful || false;
            const errorMessage = response.errorMessage;

            // UPDATED: Include lost sensors in fetch statistics
            setLastFetchStats({
                totalFetched,
                totalStored,
                newSensors: deltaSensors.length,
                lostSensors: totalLost, // NEW: Set lost sensors count
                fetchSuccessful,
                lastFetchTime: new Date()
            });

            if (!fetchSuccessful || errorMessage) {
                setSensorFetchError(errorMessage || "Failed to fetch sensors from the collector. Please check the collector configuration, network connectivity, and ensure the target service is accessible.");
                showSnackbar("Error fetching sensors from collector", "error");
                setFetchedSensors([]);
                setLostSensors([]); // NEW: Clear lost sensors on error
                return;
            }

            if (totalFetched === 0) {
                setSensorFetchError("No sensors were returned from the collector. This could indicate a connection issue, incorrect configuration, or the collector service may not be running properly.");
                showSnackbar("No sensors found - please check collector configuration", "warning");
                setFetchedSensors([]);
                setLostSensors([]); // NEW: Clear lost sensors
                return;
            }

            // Transform the delta sensors for display
            const transformedNewSensors = deltaSensors.map((sensor: any) => ({
                Id: sensor.id || `temp-${Math.random().toString(36).substring(2, 11)}`,
                name: sensor.name,
                sensorTag: sensor.sensorTag,
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

            // NEW: Transform the lost sensors for display
            const transformedLostSensors = lostSensorsData.map((sensor: any) => ({
                Id: sensor.id,
                name: sensor.name,
                sensorTag: sensor.sensorTag,
                deviceName: "Collector (Lost)",
                componentName: sensor.sensorType,
                externalId: sensor.externalId,
                IsSelected: false,
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

            setFetchedSensors(transformedNewSensors);
            setLostSensors(transformedLostSensors); // NEW: Set lost sensors

            // NEW: Auto-switch to appropriate tab based on what was found
            if (transformedLostSensors.length > 0) {
                setActiveTab("lost");
            } else if (transformedNewSensors.length > 0) {
                setActiveTab("delta");
            } else {
                setActiveTab("stored");
            }

            await fetchStoredSensors();

            // Clear any previous errors since fetch was successful
            setSensorFetchError(null);

            // NEW: Enhanced notification messages
            if (deltaSensors.length === 0 && lostSensorsData.length === 0) {
                showSnackbar("No new or lost sensors detected", "info");
            } else {
                const messages = [];
                if (deltaSensors.length > 0) messages.push(`${deltaSensors.length} new sensors`);
                if (lostSensorsData.length > 0) messages.push(`${lostSensorsData.length} lost sensors`);
                showSnackbar(`Found: ${messages.join(', ')}`, "success");
            }
        } catch (err: any) {
            console.error("Error fetching delta sensors:", err);
            setSensorFetchError(`Failed to fetch sensors from the collector: ${err.message}`);
            showSnackbar("Error fetching new sensors", "error");
            setFetchedSensors([]);
            setLostSensors([]); // NEW: Clear lost sensors on error

            // Update stats to reflect the failure
            setLastFetchStats(prev => ({
                ...prev,
                fetchSuccessful: false,
                lastFetchTime: new Date()
            }));
        } finally {
            setFetchingSensors(false);
        }
    };

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
            setSensorFetchError(null);

            // Update fetch stats
            setLastFetchStats(prev => ({
                ...prev,
                newSensors: prev.newSensors - 1
            }));

            showSnackbar("Sensor added successfully.", "success");
        } catch (error) {
            console.error("Error adding sensor:", error);
            showSnackbar(`Error adding sensor: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
        }
    };

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
            setSensorFetchError(null);

            // Update fetch stats
            setLastFetchStats(prev => ({
                ...prev,
                newSensors: 0
            }));

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

    // NEW: Handle removing lost sensor from database
    const handleRemoveLostSensor = async (sensorId: number) => {
        if (window.confirm("Are you sure you want to remove this lost sensor from the database? This action cannot be undone.")) {
            try {
                const rsp = await fetch(`/api/sensors/${sensorId}`, { method: "DELETE" });
                if (!rsp.ok) throw new Error();

                setLostSensors(lostSensors.filter((s) => s.Id !== sensorId));
                await fetchStoredSensors(); // Refresh stored sensors count
                showSnackbar("Lost sensor removed from database.", "success");
            } catch {
                showSnackbar("Error removing lost sensor.", "error");
            }
        }
    };

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
                setLoading(false);
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
            if (editMode && hasChanges && !isLocked) {
                handleSaveCollector();
            }
        };

        const handleBottomActionTestConnection = () => {
            if (!isLocked) {
                showSnackbar("Testing connection...", "info");
            } else {
                showSnackbar("Please unlock the collector first", "warning");
                setShowUnlockDialog(true);
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
    }, [editMode, hasChanges, isLocked, handleSaveCollector, handleDeleteCollector, handleBack]);

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

    // NEW: Actions for lost sensors
    const renderLostSensorActions = (sensor: any) => (
        <Button
            size="small"
            variant="contained"
            color="error"
            onClick={() => handleRemoveLostSensor(sensor.Id)}
            startIcon={<DeleteIcon />}
        >
            Remove from DB
        </Button>
    );

    const displaySensors = useMemo(() => {
        switch (activeTab) {
            case "stored": return storedSensors;
            case "delta": return fetchedSensors;
            case "lost": return lostSensors; // NEW: Return lost sensors for lost tab
            default: return storedSensors;
        }
    }, [activeTab, storedSensors, fetchedSensors, lostSensors]); // UPDATED: Include lostSensors dependency

    const renderCollectorFields = () => {
        if (!collector) return null;

        const needsUrl = ["Cloudflare", "GenericAPI", "Github", "HomeAssistant", "LibreHardwareMonitor", "Render", "SonarrCalendar", "Stripe", "UptimeKuma"].includes(collector.collectorType);
        const needsAccessToken = ["Cloudflare", "GenericAPI", "Github", "HomeAssistant", "Render", "Stripe", "SonarrCalendar", "iCal", "Unraid"].includes(collector.collectorType);
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
                                        collector.collectorType === "SonarrCalendar" ? "Sonarr Base URL" :
                                            collector.collectorType === "Stripe" ? "Stripe API Base URL" :
                                                collector.collectorType === "Unraid" ? "Unraid IP Address" :
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
                                        collector.collectorType === "SonarrCalendar" ? "http://your-sonarr:8989" :
                                            collector.collectorType === "Stripe" ? "https://api.stripe.com" :
                                                collector.collectorType === "Unraid" ? "https://your-unraid-ip" :
                                                    ""
                        }
                    />
                )}

                {needsAccessToken && (
                    <Box>
                        <TextField
                            label={
                                collector.collectorType === "Github" ? "GitHub Personal Access Token" :
                                    collector.collectorType === "Cloudflare" ? "Cloudflare API Token" :
                                        collector.collectorType === "Render" ? "Render API Key" :
                                            collector.collectorType === "SonarrCalendar" ? "Sonarr iCal Feed URL" :
                                                collector.collectorType === "iCal" ? "iCal Feed URL" :
                                                    collector.collectorType === "Stripe" ? "Stripe Secret Key" :
                                                        collector.collectorType === "Unraid" ? "Unraid API Key" :
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
                                                collector.collectorType === "SonarrCalendar" ? "http://sonarr:8989/feed/v3/calendar/Sonarr.ics?apikey=..." :
                                                    collector.collectorType === "iCal" ? "https://calendar.google.com/calendar/ical/..." :
                                                        collector.collectorType === "Stripe" ? "sk_..." :
                                                            collector.collectorType === "Unraid" ? "your-api-key" :
                                                                ""
                            }
                        />

                        {/* Show encryption method selection when editing and token is being changed */}
                        {editMode && accessTokenChanged && (
                            <Box sx={{ mt: 2 }}>
                                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'medium' }}>
                                    How should this token be stored?
                                </Typography>
                                <FormControl component="fieldset">
                                    <RadioGroup
                                        value={collector.externalAccessToken ? "password" : "database"}
                                        onChange={(e) => updateCollectorField('externalAccessToken', e.target.value === "password")}
                                    >
                                        <FormControlLabel
                                            value="database"
                                            control={<Radio size="small" />}
                                            label={
                                                <Box>
                                                    <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                                        Database Encryption (Recommended)
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        Automatically encrypted. No password required on startup.
                                                    </Typography>
                                                </Box>
                                            }
                                        />
                                        <FormControlLabel
                                            value="password"
                                            control={<Radio size="small" />}
                                            label={
                                                <Box>
                                                    <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                                        Password-Based Encryption
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        Maximum security. Requires password entry on each app start.
                                                    </Typography>
                                                </Box>
                                            }
                                        />
                                    </RadioGroup>
                                </FormControl>

                                {/* Encryption Password field - only show if password encryption is selected */}
                                {collector.externalAccessToken && (
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Encryption Password"
                                        type="password"
                                        value={encryptionPassword}
                                        onChange={(e) => setEncryptionPassword(e.target.value)}
                                        required
                                        sx={{ mt: 2 }}
                                        placeholder="Enter a strong password for encryption"
                                        helperText="This password will be required each time the application starts"
                                    />
                                )}
                            </Box>
                        )}

                        {/* Show current encryption method when not changing token */}
                        {editMode && !accessTokenChanged && originalCollector?.accessToken && (
                            <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'medium', display: 'flex', alignItems: 'center' }}>
                                    <SecurityIcon sx={{ mr: 1, fontSize: 14 }} />
                                    Current: {originalEncryptionMethod ? "Password-Based" : "Database"} Encryption
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                    {originalEncryptionMethod
                                        ? "Enter a new token above to change encryption method"
                                        : "Enter a new token above to change encryption method"}
                                </Typography>
                            </Box>
                        )}
                    </Box>
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

                {/* Description field - allow editing */}
                <TextField
                    label="Description (Optional)"
                    value={collector.description || ''}
                    onChange={(e) => updateCollectorField('description', e.target.value)}
                    disabled={!editMode || isLocked}
                    size="small"
                    multiline
                    rows={2}
                    placeholder="Optional description for this collector"
                />
            </Box>
        );
    };

    // UPDATED: Render enhanced sensor fetch stats with lost sensors
    const renderSensorFetchStats = () => {
        const hasPersistedStats = collector?.lastFetchTime;
        const hasRecentFetchStats = lastFetchStats.lastFetchTime;

        const statsToShow = hasRecentFetchStats ? lastFetchStats : {
            totalFetched: collector?.lastFetchTotalSensors || 0,
            totalStored: storedSensors.length,
            newSensors: collector?.lastFetchNewSensors || 0,
            lostSensors: collector?.lastFetchLostSensors || 0, // NEW: Include lost sensors from collector
            fetchSuccessful: collector?.lastFetchSuccessful ?? false,
            lastFetchTime: collector?.lastFetchTime ? new Date(collector.lastFetchTime) : null
        };

        const { totalFetched, totalStored, newSensors, lostSensors, fetchSuccessful, lastFetchTime } = statsToShow;

        return (
            <Box sx={{
                p: 2,
                bgcolor: lastFetchTime ? (fetchSuccessful ? 'action.hover' : 'error.light') : 'grey.50',
                borderRadius: 1,
                border: '1px solid',
                borderColor: lastFetchTime ? (fetchSuccessful ? 'divider' : 'error.main') : 'grey.300'
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    {lastFetchTime ? (
                        fetchSuccessful ? (
                            <CheckCircleIcon sx={{ mr: 1, color: 'primary.main', fontSize: 20 }} />
                        ) : (
                            <ErrorIcon sx={{ mr: 1, color: 'error.main', fontSize: 20 }} />
                        )
                    ) : (
                        <InfoIcon sx={{ mr: 1, color: 'grey.500', fontSize: 20 }} />
                    )}
                    <Typography variant="subtitle2" sx={{ fontWeight: 'medium' }}>
                        {lastFetchTime ?
                            `Last Fetch: ${lastFetchTime.toLocaleTimeString()} on ${lastFetchTime.toLocaleDateString()}` :
                            'No fetch performed yet'
                        }
                    </Typography>
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 2 }}>
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" color={lastFetchTime ? (fetchSuccessful ? 'primary.main' : 'error.main') : 'grey.500'}>
                            {totalFetched}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            Total Fetched
                        </Typography>
                    </Box>

                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" color="primary.main">
                            {totalStored}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            In Database
                        </Typography>
                    </Box>

                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" color={newSensors > 0 ? 'warning.main' : 'text.secondary'}>
                            {newSensors}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            New Available
                        </Typography>
                    </Box>

                    {/* NEW: Lost sensors count */}
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" color={lostSensors > 0 ? 'error.main' : 'text.secondary'}>
                            {lostSensors}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            Lost Sensors
                        </Typography>
                    </Box>

                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" color="text.secondary">
                            {collector?.testFrequency ? `${collector.testFrequency}ms` : 'Not Set'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            Test Frequency
                        </Typography>
                    </Box>
                </Box>

                {/* Show last tested info */}
                {collector?.lastTested && (
                    <Box sx={{ mt: 1, display: 'flex', alignItems: 'center' }}>
                        <InfoIcon sx={{ mr: 1, color: 'info.main', fontSize: 16 }} />
                        <Typography variant="caption" color="info.main">
                            Last tested: {new Date(collector.lastTested + 'Z').toLocaleString()}
                        </Typography>
                    </Box>
                )}

                {/* Show success message for completed fetch */}
                {lastFetchTime && fetchSuccessful && newSensors === 0 && lostSensors === 0 && totalFetched > 0 && (
                    <Box sx={{ mt: 1, display: 'flex', alignItems: 'center' }}>
                        <InfoIcon sx={{ mr: 1, color: 'info.main', fontSize: 16 }} />
                        <Typography variant="caption" color="info.main">
                            All sensors from collector are already stored in database
                        </Typography>
                    </Box>
                )}

                {/* NEW: Show warning if lost sensors detected */}
                {lastFetchTime && fetchSuccessful && lostSensors > 0 && (
                    <Box sx={{ mt: 1, display: 'flex', alignItems: 'center' }}>
                        <ErrorIcon sx={{ mr: 1, color: 'error.main', fontSize: 16 }} />
                        <Typography variant="caption" color="error.main">
                            Warning: {lostSensors} sensors are no longer available from the collector
                        </Typography>
                    </Box>
                )}

                {/* Show error message if last fetch failed */}
                {lastFetchTime && !fetchSuccessful && collector?.lastFetchErrorMessage && (
                    <Box sx={{ mt: 1, display: 'flex', alignItems: 'flex-start' }}>
                        <ErrorIcon sx={{ mr: 1, color: 'error.main', fontSize: 16, mt: 0.1 }} />
                        <Typography variant="caption" color="error.main">
                            Last error: {collector.lastFetchErrorMessage}
                        </Typography>
                    </Box>
                )}

                {/* Show message when no fetch has been performed */}
                {!lastFetchTime && (
                    <Box sx={{ mt: 1, display: 'flex', alignItems: 'center' }}>
                        <InfoIcon sx={{ mr: 1, color: 'grey.500', fontSize: 16 }} />
                        <Typography variant="caption" color="grey.600">
                            Click "Fetch New Sensors" to retrieve sensors from this collector
                        </Typography>
                    </Box>
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

                    {/* Unlock/Lock Button */}
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
                                        onClick={handleSaveCollector}
                                        disabled={saving || !hasChanges || isLocked || isEncryptionPasswordRequired()}
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

                                {/* Enhanced Sensor Fetch Stats */}
                                {renderSensorFetchStats()}

                                {/* Security Notice */}
                                {(collector.collectorType === "Cloudflare" ||
                                    collector.collectorType === "Github" ||
                                    collector.collectorType === "HomeAssistant" ||
                                    collector.collectorType === "Render" ||
                                    collector.collectorType === "SonarrCalendar" ||
                                    collector.collectorType === "iCal" ||
                                    collector.collectorType === "Stripe" ||
                                    collector.collectorType === "Unraid") && (
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
            {sensorFetchError && (
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
                                            onClick={() => setSensorFetchError(null)}
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
                                            onClick={fetchDeltaSensors}
                                            disabled={fetchingSensors || isLocked}
                                            startIcon={fetchingSensors ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                                            sx={{
                                                bgcolor: 'error.dark',
                                                color: 'error.contrastText',
                                                '&:hover': {
                                                    bgcolor: 'error.main'
                                                }
                                            }}
                                        >
                                            {fetchingSensors ? "Retrying..." : "Retry"}
                                        </Button>
                                    </Box>
                                }
                            >
                                <Box>
                                    <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1 }}>
                                        Sensor Fetch Issue Detected
                                    </Typography>
                                    <Typography variant="body2" sx={{ mb: 2 }}>
                                        {sensorFetchError}
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

            {/* Setup Instructions Accordion */}
            <Accordion sx={{ mb: 3 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="h6">Setup Instructions</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <SetupInstructions_Collectors collectorType={collector.collectorType} />
                </AccordionDetails>
            </Accordion>

            {/* UPDATED: Tab Selection with Lost Sensors tab */}
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
                        New Sensors
                        {fetchedSensors.length > 0 && (
                            <Chip
                                label={fetchedSensors.length}
                                color="success"
                                size="small"
                                sx={{ ml: 1, height: 20 }}
                            />
                        )}
                    </Button>

                    {/* NEW: Lost Sensors Tab */}
                    <Button
                        variant={activeTab === "lost" ? "contained" : "outlined"}
                        onClick={() => setActiveTab("lost")}
                        startIcon={<MissingLocationIcon />}
                        disabled={lostSensors.length === 0}
                        color={lostSensors.length > 0 ? "error" : "inherit"}
                    >
                        Lost Sensors
                        {lostSensors.length > 0 && (
                            <Chip
                                label={lostSensors.length}
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
                    <Collectors_SensorTable
                        key={`${activeTab}_${storedSensors.length}_${fetchedSensors.length}_${lostSensors.length}`}
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
                                : "No lost sensors detected. This means all stored sensors are still available from the collector." // NEW: Message for lost sensors tab
                        }
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
                    {/* NEW: Help text for lost sensors tab */}
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