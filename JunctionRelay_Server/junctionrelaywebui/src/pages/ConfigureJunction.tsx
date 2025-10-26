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

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
    Typography, Box, Button, CircularProgress, Paper,
    Alert, Snackbar,
    Accordion, AccordionSummary,
    AccordionDetails, Tabs, Tab, ToggleButtonGroup, ToggleButton, Tooltip
} from "@mui/material";
import { useParams, useNavigate } from "react-router-dom";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useAppVersion } from "../hooks/useAppVersion";

// Import the useFeatureFlags hook
import { useFeatureFlags } from "../hooks/useFeatureFlags";

// Import the useAutoSave hook
import { useAutoSave } from "../hooks/useAutoSave";

// Import API services
import * as junctionService from '../services/junctionApiService';

// Components
// eslint-disable-next-line react/jsx-pascal-case
import Junction_ConfigPanel from '../components/Junction_ConfigPanel';
// eslint-disable-next-line react/jsx-pascal-case
import Junction_EnhancedSensorSelector from '../components/Junction_EnhancedSensorSelector';
import ScreenSelectionModal from '../components/Junction_ScreenSelectionModal';
import AvailableSourcesTargetsTable from '../components/Junction_AvailableSourcesTargetsTable';
import DeviceScreenLayoutsCard from '../components/Junction_DeviceScreenLayoutsCard';
// eslint-disable-next-line react/jsx-pascal-case
import Junction_Setup_COM from '../components/Junction_Setup_COM';
// eslint-disable-next-line react/jsx-pascal-case
import Junction_CustomSensorCreator from '../components/Junction_CustomSensorCreator';
import { CompactProgressIndicator } from '../components/Junction_CompactProgressIndicator';

// Hooks
import { JunctionProgress, JunctionStartStage } from '../types/notifications';

// Icon imports
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import WarningIcon from '@mui/icons-material/Warning';
import ViewListIcon from '@mui/icons-material/ViewList';
import TabIcon from '@mui/icons-material/Tab';

interface SourceOrTarget {
    linkId?: number;
    id: number;
    type: "device" | "collector";
    name: string;
    description: string;
    ipAddress?: string;
    url?: string;
    role?: string;
    pollRateOverride?: number;
    sendRateOverride?: number;
}

const getDefaultJunctionColumns = () => {
    return [
        "selection",
        "edit",
        "order",
        "source",
        "name",
        "sensorTag",
        "componentName",
        "value",
        "unit",
        "decimalPlaces",
        "targets"
    ];
};

// Helper function to determine if COM setup should be shown
const shouldShowCOMSetup = (junctionType: string) => {
    return junctionType === "COM Junction" ||
        junctionType === "Gateway Junction (COM to ESP:NOW)";
};

// Main Component
const ConfigureJunction: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const junctionId = parseInt(id || "0", 10);
    const navigate = useNavigate();

    // Hooks
    const flags = useFeatureFlags();
    const junctionImportExportEnabled = flags?.junction_import_export !== false;
    const { version } = useAppVersion();

    // State for Show Selected Only (will load from localStorage when version is available)
    const [showSelectedOnly, setShowSelectedOnly] = useState(false);

    // Application version for localStorage keys (from backend)
    const getStorageKey = useCallback((key: string) => {
        if (!version) {
            throw new Error('Application version not loaded');
        }
        return `${version}_${key}`;
    }, [version]);

    // State for Junction View Mode (list vs tabs)
    const [junctionViewMode, setJunctionViewMode] = useState<'list' | 'tabs'>('tabs'); // Default to tabs

    // Load saved view mode from localStorage when version is available
    useEffect(() => {
        if (version) {
            try {
                const savedViewMode = localStorage.getItem(getStorageKey('junctionViewMode'));
                if (savedViewMode === 'list' || savedViewMode === 'tabs') {
                    setJunctionViewMode(savedViewMode);
                }
            } catch (error) {
                console.error("Error accessing localStorage:", error);
            }
        }
    }, [version, getStorageKey]);

    // Handler for view mode change
    const handleViewModeChange = useCallback((newMode: 'list' | 'tabs') => {
        setJunctionViewMode(newMode);
        try {
            localStorage.setItem(getStorageKey('junctionViewMode'), newMode);
        } catch (error) {
            console.error("Error saving view mode to localStorage:", error);
        }
    }, [getStorageKey]);

    // State for current tab (when in tabs mode)
    const [currentTab, setCurrentTab] = useState<number>(0);

    // State for junction data
    const [junctionData, setJunctionData] = useState<any>({ status: "Loading..." });
    const [originalJunctionData, setOriginalJunctionData] = useState<any>({ status: "Loading..." });
    const [loading, setLoading] = useState<boolean>(true);
    const [mqttBrokers, setMqttBrokers] = useState<any[]>([]);
    const [selectedMqttBrokerId, setSelectedMqttBrokerId] = useState<string>("");

    // State for sources and targets
    const [sources, setSources] = useState<SourceOrTarget[]>([]);
    const [targets, setTargets] = useState<SourceOrTarget[]>([]);
    const [allDevices, setAllDevices] = useState<any[]>([]);
    const [allCollectors, setAllCollectors] = useState<any[]>([]);

    // State for sensors
    const [availableSensors, setAvailableSensors] = useState<any[]>([]);

    // Track which sensors have been auto-assigned to prevent duplicate assignments
    const autoAssignedSensorsRef = useRef<Set<number>>(new Set());

    // State for junction start progress
    const [junctionStartProgress, setJunctionStartProgress] = useState<JunctionProgress | null>(null);
    const [showProgress, setShowProgress] = useState(false);

    // Listen to junction progress events from UnifiedNotificationProvider
    useEffect(() => {
        const handleProgressUpdate = (event: Event) => {
            const customEvent = event as CustomEvent<JunctionProgress>;
            const progress = customEvent.detail;

            // Only show progress for this specific junction
            if (progress.junctionId === junctionId) {
                setJunctionStartProgress(progress);
                setShowProgress(true);

                // Auto-hide progress after completion/error
                if (progress.isComplete) {
                    setTimeout(() => {
                        setShowProgress(false);
                        setJunctionStartProgress(null);
                    }, progress.hasError ? 5000 : 3000);
                }
            }
        };

        window.addEventListener('junction-progress-update', handleProgressUpdate);

        return () => {
            window.removeEventListener('junction-progress-update', handleProgressUpdate);
        };
    }, [junctionId])

    // Memoized sensor filtering using the new boolean fields
    const customSensors = useMemo(() =>
        availableSensors.filter(sensor => sensor.IsCustomJunctionSensor === true),
        [availableSensors]);

    const regularSensors = useMemo(() =>
        availableSensors.filter(sensor => sensor.IsCustomJunctionSensor !== true),
        [availableSensors]);

    // Screen Selection
    const [screenSelectionModalOpen, setScreenSelectionModalOpen] = useState<boolean>(false);
    const [currentSensor, setCurrentSensor] = useState<any>(null);

    // State for rates
    const [devicePollRates, setDevicePollRates] = useState<{ [key: number]: number }>({});
    const [deviceSendRates, setDeviceSendRates] = useState<{ [key: number]: number }>({});
    const [collectorPollRates, setCollectorPollRates] = useState<{ [key: number]: number }>({});
    const [collectorSendRates, setCollectorSendRates] = useState<{ [key: number]: number }>({});

    // State for device screens
    const [deviceScreensMap, setDeviceScreensMap] = useState<{ [deviceId: number]: any[] }>({});
    const [sensorTargets, setSensorTargets] = useState<{
        [sensorId: number]: { deviceId: number, screenIds: number[] }[]
    }>({});

    // State for modified sensor data
    const [modifiedSensorOrders, setModifiedSensorOrders] = useState<{ [sensorId: number]: number }>({});
    const [modifiedSensors, setModifiedSensors] = useState<{ [sensorId: number]: string }>({});

    // State for notifications
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "info" | "warning" | "error">("success");

    // State for Rive inputs from DeviceScreenLayoutsCard
    const [riveInputs, setRiveInputs] = useState<any[]>([]);

    // State for mapped sensor tags from DeviceScreenLayoutsCard
    const [mappedSensorTags, setMappedSensorTags] = useState<string[]>([]);

    // State for screen layout validation
    const [screenLayoutsValid, setScreenLayoutsValid] = useState<boolean>(true);
    const [validationMessage, setValidationMessage] = useState<string>("");

    // State for payload mismatch warnings
    const [hasPayloadMismatches, setHasPayloadMismatches] = useState<boolean>(false);
    const [payloadMismatchCount, setPayloadMismatchCount] = useState<number>(0);

    // State for sensor validation
    const [sensorValidations, setSensorValidations] = useState<{
        noSensorsSelected: boolean;
        allSensorsUnassigned: boolean;
        someSensorsUnassigned: boolean;
    }>({ noSensorsSelected: false, allSensorsUnassigned: false, someSensorsUnassigned: false });

    // Settings accordion state (will load from localStorage when version is available)
    const [settingsExpanded, setSettingsExpanded] = useState(false);

    // Load showSelectedOnly and settingsExpanded from localStorage when version is available
    useEffect(() => {
        if (version) {
            try {
                const savedFilter = localStorage.getItem(getStorageKey(`junction${junctionId}ShowSelectedOnly`));
                if (savedFilter !== null) {
                    setShowSelectedOnly(savedFilter === 'true');
                }

                const savedSettings = localStorage.getItem(getStorageKey('junctionSettingsExpanded'));
                if (savedSettings !== null) {
                    setSettingsExpanded(savedSettings === 'true');
                }
            } catch (error) {
                console.error("Error loading localStorage:", error);
            }
        }
    }, [version, junctionId, getStorageKey]);

    // Handle Show Selected Only
    const handleShowSelectedOnlyChange = useCallback((checked: boolean) => {
        setShowSelectedOnly(checked);
        if (!version) return;
        try {
            localStorage.setItem(getStorageKey(`junction${junctionId}ShowSelectedOnly`), checked.toString());
        } catch (error) {
            console.error("Error saving filter state to localStorage:", error);
        }
    }, [version, junctionId, getStorageKey]);

    // Auto-save hook for junction data
    const junctionAutoSave = useAutoSave(
        `/api/junctions/${junctionId}`,
        originalJunctionData,
        {
            onSuccess: (savedData) => {
                setOriginalJunctionData(JSON.parse(JSON.stringify(savedData)));
                console.log('[AUTO-SAVE] Junction settings auto-saved successfully');
            },
            onError: (error) => {
                console.error('[AUTO-SAVE] Junction auto-save failed:', error);
                showSnackbar('Auto-save failed', 'error');
            },
            debug: true
        }
    );

    // Handler for auto-saving junction data changes
    const handleJunctionDataChange = useCallback((updatedData: any, field: string, immediate: boolean = false) => {
        console.log(`[ConfigureJunction] handleJunctionDataChange called:`, {
            field,
            immediate,
            oldValue: junctionData?.[field],
            newValue: updatedData[field]
        });

        // Update local state
        setJunctionData(updatedData);

        // Trigger auto-save
        junctionAutoSave.save(updatedData, { immediate });
    }, [junctionAutoSave, junctionData]);

    // Scroll to screen layouts section
    const scrollToScreenLayouts = () => {
        const element = document.getElementById('screen-layouts-section');
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    // Listen for bottom action bar events
    useEffect(() => {
        const handleRefresh = () => {
            setLoading(true);
            fetchData().finally(() => setLoading(false));
        };

        const handleSave = () => {
            saveJunction();
        };

        const handleBack = () => {
            navigate('/junctions');
        };

        const handleExport = () => {
            handleExportJunction();
        };

        const handleDelete = () => {
            if (window.confirm(`Are you sure you want to delete this junction "${junctionData.name}"? This action cannot be undone.`)) {
                console.log('Delete junction:', junctionId);
                showSnackbar("Delete functionality not yet implemented", "info");
            }
        };

        window.addEventListener('bottom-action-refresh', handleRefresh);
        window.addEventListener('bottom-action-save', handleSave);
        window.addEventListener('bottom-action-back', handleBack);
        window.addEventListener('bottom-action-export', handleExport);
        window.addEventListener('bottom-action-delete', handleDelete);

        return () => {
            window.removeEventListener('bottom-action-refresh', handleRefresh);
            window.removeEventListener('bottom-action-save', handleSave);
            window.removeEventListener('bottom-action-back', handleBack);
            window.removeEventListener('bottom-action-export', handleExport);
            window.removeEventListener('bottom-action-delete', handleDelete);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navigate, junctionId, junctionData.name]);

    // Show snackbar notification
    const showSnackbar = (message: string, severity: "success" | "info" | "warning" | "error" = "success") => {
        setSnackMessage(message);
        setSnackbarSeverity(severity);
    };

    const handleExportJunction = async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/junctions/export/${junctionId}`);

            if (!response.ok) {
                throw new Error("Failed to export junction");
            }

            const blob = await response.blob();
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `junction_${junctionId}.json`;
            link.click();
            URL.revokeObjectURL(link.href);

            showSnackbar("Junction exported successfully", "success");
        } catch (error) {
            console.error("Export failed:", error);
            showSnackbar("Failed to export junction", "error");
        } finally {
            setLoading(false);
        }
    };

    // Fetch MQTT Brokers
    const fetchMqttBrokers = async () => {
        try {
            const res = await fetch("/api/services");
            if (!res.ok) {
                throw new Error(`Failed to fetch services: ${res.status} ${res.statusText}`);
            }
            const data = await res.json();
            const mqttBrokers = data.filter((service: any) => service.type === "MQTT Broker");
            setMqttBrokers(mqttBrokers);
            return mqttBrokers;
        } catch (error) {
            console.error("Error fetching MQTT brokers:", error);
            showSnackbar("Failed to load MQTT brokers", "error");
            return [];
        }
    };

    // Fetch junction data
    const fetchJunctionInfo = useCallback(async () => {
        if (!id) return;

        try {
            setLoading(true);

            await fetchMqttBrokers();
            const data = await junctionService.getJunctionData(junctionId);

            try {
                const runningData = await junctionService.getJunctionStatus();
                const junctionStatus = runningData.find((r: any) => r.id === junctionId);
                if (junctionStatus) {
                    data.status = junctionStatus.status;
                }
            } catch (error) {
                console.error("Error fetching running status:", error);
            }

            setJunctionData(data);
            setOriginalJunctionData(JSON.parse(JSON.stringify(data))); // Set original data for auto-save comparison

            let selectedId = "";
            if (data.mqttBrokerId != null && data.mqttBrokerId !== undefined) {
                selectedId = data.mqttBrokerId.toString();
            }
            setSelectedMqttBrokerId(selectedId);

        } catch (error) {
            console.error("Error fetching junction data:", error);
            showSnackbar("Failed to load junction data", "error");
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, junctionId]);

    // Initial data loading
    useEffect(() => {
        fetchJunctionInfo();
    }, [fetchJunctionInfo]);


    // Handle settings accordion expansion
    const handleSettingsExpandedChange = useCallback((isExpanded: boolean) => {
        setSettingsExpanded(isExpanded);
        if (!version) return;
        try {
            localStorage.setItem(getStorageKey('junctionSettingsExpanded'), isExpanded.toString());
        } catch (error) {
            console.error("Error saving settings expansion state to localStorage:", error);
        }
    }, [version, getStorageKey]);

    // Callback to receive validation status from DeviceScreenLayoutsCard
    const handleValidationUpdate = useCallback((isValid: boolean, message: string) => {
        setScreenLayoutsValid(isValid);
        setValidationMessage(message);
    }, []);

    // Callback to receive payload mismatch warnings from DeviceScreenLayoutsCard
    const handlePayloadMismatchUpdate = useCallback((hasMismatches: boolean, mismatchCount: number) => {
        setHasPayloadMismatches(hasMismatches);
        setPayloadMismatchCount(mismatchCount);
    }, []);

    // Sensor validation effect
    useEffect(() => {
        const selectedSensors = availableSensors.filter(s => s.IsSelected);
        const noSensorsSelected = selectedSensors.length === 0;

        let allSensorsUnassigned = false;
        let someSensorsUnassigned = false;

        if (selectedSensors.length > 0) {
            const sensorsWithTargetsAndScreens = selectedSensors.filter(sensor => {
                const targets = sensorTargets[sensor.Id] || [];
                return targets.some(target => target.screenIds && target.screenIds.length > 0);
            });

            // RED: ALL sensors have no targets/screens
            allSensorsUnassigned = sensorsWithTargetsAndScreens.length === 0;

            // ORANGE: SOME sensors have targets/screens, but not all
            someSensorsUnassigned = sensorsWithTargetsAndScreens.length > 0 &&
                sensorsWithTargetsAndScreens.length < selectedSensors.length;
        }

        setSensorValidations({
            noSensorsSelected,
            allSensorsUnassigned,
            someSensorsUnassigned
        });
    }, [availableSensors, sensorTargets]);

    // Handle AllTargets settings changes
    const handleAllDataAllTargetsChange = async (enabled: boolean): Promise<void> => {
        try {
            await junctionService.updateJunction(junctionId, {
                ...junctionData,
                AllTargetsAllData: enabled
            });

            setJunctionData((prev: any) => ({ ...prev, allTargetsAllData: enabled }));

        } catch (error) {
            console.error("Error updating AllTargetsAllData:", error);
            throw error;
        }
    };

    const handleAllTargetsAllScreensChange = async (enabled: boolean): Promise<void> => {
        try {
            await junctionService.updateJunction(junctionId, {
                ...junctionData,
                AllTargetsAllScreens: enabled
            });

            setJunctionData((prev: any) => ({ ...prev, allTargetsAllScreens: enabled }));

            if (enabled) {
                setTimeout(() => {
                    autoAssignAllScreensForExistingTargets();
                }, 100);
            }

            showSnackbar(
                enabled
                    ? "All Targets All Screens enabled - assigning all screens to existing targets"
                    : "All Targets All Screens disabled",
                "success"
            );
        } catch (error) {
            console.error("Error updating AllTargetsAllScreens:", error);
            showSnackbar("Failed to update All Targets All Screens setting", "error");
        }
    };

    const autoAssignAllScreensForExistingTargets = async () => {
        try {
            let assignmentCount = 0;
            const processedCombinations: string[] = [];

            for (const [sensorIdStr, targetAssignments] of Object.entries(sensorTargets)) {
                const sensorId = parseInt(sensorIdStr);

                for (const targetAssignment of targetAssignments) {
                    const deviceId = targetAssignment.deviceId;
                    const deviceScreens = deviceScreensMap[deviceId] || [];
                    const allScreenIds = deviceScreens.map(screen => screen.id);
                    const currentScreenIds = targetAssignment.screenIds || [];

                    if (allScreenIds.length > 0 &&
                        (currentScreenIds.length === 0 ||
                            !allScreenIds.every(screenId => currentScreenIds.includes(screenId)))) {

                        const combinationKey = `${sensorId}-${deviceId}`;
                        if (!processedCombinations.includes(combinationKey)) {
                            try {
                                await handleScreenAssignmentUpdate(sensorId, deviceId, allScreenIds);
                                assignmentCount++;
                                processedCombinations.push(combinationKey);
                                await new Promise(resolve => setTimeout(resolve, 100));
                            } catch (error) {
                                console.error(`Error auto-assigning screens for sensor ${sensorId} to device ${deviceId}:`, error);
                            }
                        }
                    }
                }
            }

            if (assignmentCount > 0) {
                showSnackbar(
                    `Auto-assigned all screens for ${assignmentCount} existing sensor-target combinations`,
                    "success"
                );
            } else {
                showSnackbar("All existing targets already have all screens assigned", "info");
            }
        } catch (error) {
            console.error("Error auto-assigning screens for existing targets:", error);
            showSnackbar("Failed to auto-assign screens for existing targets", "error");
        }
    };

    // Save junction data
    const saveJunction = async () => {
        if (!id) return;

        try {
            setLoading(true);

            const updatePayload: junctionService.JunctionUpdatePayload = {
                Name: junctionData.name,
                Type: junctionData.type,
                Description: junctionData.description || "",
                RenderingMode: junctionData.renderingMode || "Payload",
                MQTTBrokerId: selectedMqttBrokerId || null,
                ShowOnDashboard: junctionData.showOnDashboard,
                AutoStartOnLaunch: junctionData.autoStartOnLaunch,
                CronExpression: junctionData.cronExpression || null,
                StreamAutoTimeout: junctionData.streamAutoTimeout,
                StreamAutoTimeoutMs: junctionData.streamAutoTimeoutMs,
                RetryCount: junctionData.retryCount,
                RetryIntervalMs: junctionData.retryIntervalMs,
                EnableTests: junctionData.enableTests,
                EnableHealthCheck: junctionData.enableHealthCheck,
                HealthCheckIntervalMs: junctionData.healthCheckIntervalMs,
                EnableNotifications: junctionData.enableNotifications,
                CompressPayload: junctionData.compressPayload,
                GatewayDeviceId: junctionData.gatewayDeviceId,
                GatewayDestination: junctionData.gatewayDestination,
                DestinationOverride: junctionData.destinationOverride,
                BaudRate: junctionData.baudRate,
                AllTargetsAllData: junctionData.allTargetsAllData,
                AllTargetsAllScreens: junctionData.allTargetsAllScreens,
                AllowStartOnCollectorTestFailure: junctionData.allowStartOnCollectorTestFailure,
                SendConfigPayload: junctionData.sendConfigPayload,
                SendSensorPayloads: junctionData.sendSensorPayloads,
                SendStopPayload: junctionData.sendStopPayload,
            };

            await junctionService.updateJunction(parseInt(id), updatePayload);
            showSnackbar("Junction updated successfully", "success");
        } catch (err) {
            console.error("Error updating junction:", err);
            showSnackbar("Failed to update junction", "error");
        } finally {
            setLoading(false);
        }
    };

    // Connect to MQTT broker
    const connectToMQTTBroker = async () => {
        if (!selectedMqttBrokerId) {
            showSnackbar("Please select an MQTT broker first", "warning");
            return;
        }

        try {
            setLoading(true);
            await junctionService.connectToMQTTBroker(selectedMqttBrokerId);
            showSnackbar("Connected to MQTT broker successfully", "success");
        } catch (err) {
            console.error("Error connecting to MQTT Broker:", err);
            showSnackbar("Failed to connect to MQTT broker", "error");
        } finally {
            setLoading(false);
        }
    };

    // The key function to update screen assignments
    const handleScreenAssignmentUpdate = async (sensorId: number, deviceId: number, screenIds: number[]) => {
        try {
            const targetData = sensorTargets[sensorId]?.find(t => t.deviceId === deviceId);
            const existingScreenIds = targetData?.screenIds || [];

            if (!targetData && screenIds.length > 0) {
                try {
                    await junctionService.assignSensorTarget(junctionId, sensorId, deviceId, null);
                } catch (error) {
                    console.error("Failed to create initial target relationship:", error);
                    showSnackbar("Failed to create target relationship: " +
                        (error instanceof Error ? error.message : String(error)), "error");
                    return;
                }
            }

            const screensToRemove = existingScreenIds.filter(id => !screenIds.includes(id));
            const screensToAdd = screenIds.filter(id => !existingScreenIds.includes(id));
            let operationsFailed = false;

            for (const screenId of screensToRemove) {
                try {
                    await junctionService.removeSensorScreen(junctionId, sensorId, deviceId, screenId);
                } catch (error) {
                    console.error(`Error removing screen ${screenId}:`, error);
                    operationsFailed = true;
                }
            }

            for (const screenId of screensToAdd) {
                try {
                    await junctionService.assignScreenToTarget(junctionId, sensorId, deviceId, screenId);
                } catch (error) {
                    console.error(`Error adding screen ${screenId}:`, error);
                    operationsFailed = true;
                }
            }

            setSensorTargets(prev => {
                const updatedTargets = [...(prev[sensorId] || [])];
                const targetIndex = updatedTargets.findIndex(t => t.deviceId === deviceId);

                if (targetIndex >= 0) {
                    updatedTargets[targetIndex] = {
                        ...updatedTargets[targetIndex],
                        screenIds
                    };
                } else if (screenIds.length > 0) {
                    updatedTargets.push({
                        deviceId,
                        screenIds
                    });
                }

                return {
                    ...prev,
                    [sensorId]: updatedTargets
                };
            });

            if (operationsFailed) {
                showSnackbar("Some screen assignments could not be updated", "warning");
            } else {
                showSnackbar("Screen assignments updated successfully", "success");
            }
        } catch (error) {
            console.error("Error updating screen assignments:", error);
            let errorMessage = "Unknown error";
            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (error !== null && error !== undefined) {
                errorMessage = String(error);
            }
            showSnackbar(`Failed to update screen assignments: ${errorMessage}`, "error");
        }
    };

    const handleAllDataAllTargetsToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.checked;

        try {
            await handleAllDataAllTargetsChange(newValue);

            if (newValue) {
                const selectedSensors = availableSensors.filter(sensor => sensor.IsSelected);
                const deviceTargets = targets.filter(target => target.type === "device");

                for (const sensor of selectedSensors) {
                    for (const target of deviceTargets) {
                        try {
                            const existingTargets = sensorTargets[sensor.Id] || [];
                            const alreadyAssigned = existingTargets.some(t => t.deviceId === target.id);

                            if (!alreadyAssigned) {
                                await junctionService.assignSensorTarget(junctionId, sensor.Id, target.id, null);

                                setSensorTargets(prev => {
                                    const existingTargets = prev[sensor.Id] || [];
                                    return {
                                        ...prev,
                                        [sensor.Id]: [...existingTargets, { deviceId: target.id, screenIds: [] }]
                                    };
                                });

                                await new Promise(resolve => setTimeout(resolve, 100));
                            }
                        } catch (error) {
                            console.error(`Error auto-assigning sensor ${sensor.Id} to device ${target.id}:`, error);
                        }
                    }
                }

                if (deviceTargets.length > 0 && selectedSensors.length > 0) {
                    showSnackbar(`Auto-assigned ${selectedSensors.length} sensors to ${deviceTargets.length} target devices`, "success");
                }

                const isAllScreensEnabled = junctionData.allTargetsAllScreens === true;

                if (isAllScreensEnabled) {
                    await new Promise(resolve => setTimeout(resolve, 200));

                    for (const sensor of selectedSensors) {
                        for (const target of deviceTargets) {
                            const deviceScreens = deviceScreensMap[target.id] || [];
                            const allScreenIds = deviceScreens.map(screen => screen.id);

                            if (allScreenIds.length > 0) {
                                try {
                                    await handleScreenAssignmentUpdate(sensor.Id, target.id, allScreenIds);
                                    await new Promise(resolve => setTimeout(resolve, 100));
                                } catch (error) {
                                    console.error(`Error auto-assigning screens for sensor ${sensor.Id} to device ${target.id}:`, error);
                                }
                            }
                        }
                    }

                    if (deviceTargets.length > 0 && selectedSensors.length > 0) {
                        showSnackbar(`Auto-assigned all screens to ${selectedSensors.length} sensors on ${deviceTargets.length} devices`, "success");
                    }
                }
            }

            showSnackbar(
                newValue
                    ? "All Data All Targets enabled - selected sensors will be automatically assigned"
                    : "All Data All Targets disabled",
                "success"
            );
        } catch (error) {
            showSnackbar("Failed to update All Data All Targets setting", "error");
        }
    };

    // Update sensor order
    const handleSensorOrderChange = async (sensor: any, newOrder: number) => {
        if (sensor.SensorOrder === newOrder) return;

        setModifiedSensorOrders((prev) => ({
            ...prev,
            [sensor.Id]: newOrder,
        }));

        try {
            await junctionService.updateSensorProperty(sensor, "SensorOrder", newOrder);
            showSnackbar("Sensor order updated", "success");
        } catch (error) {
            console.error("Error updating sensor order:", error);
            showSnackbar("Failed to update sensor order", "error");
        }
    };

    // Update sensor tag
    const handleSensorTagChange = async (sensor: any, newTag: string) => {
        if (sensor.SensorTag === newTag) return;

        setModifiedSensors((prev) => ({
            ...prev,
            [sensor.Id]: newTag,
        }));

        setAvailableSensors((prev) =>
            prev.map((s) =>
                s.Id === sensor.Id ? { ...s, sensorTag: newTag } : s
            )
        );

        try {
            await junctionService.updateSensorProperty(sensor, "SensorTag", newTag);
            showSnackbar("Sensor tag updated", "success");
        } catch (error) {
            console.error("Error updating sensor tag:", error);
            showSnackbar("Failed to update sensor tag", "error");
        }
    };

    const handleSensorUpdate = (updatedSensor: any) => {
        setAvailableSensors((prev) =>
            prev.map((s) =>
                s.Id === updatedSensor.Id ? { ...s, ...updatedSensor } : s
            )
        );
    };

    // Populate MQTT broker dropdown with DB value on mount
    useEffect(() => {
        if (junctionData?.mqttBrokerId && mqttBrokers.length > 0) {
            const brokerExists = mqttBrokers.some(broker =>
                broker.id.toString() === junctionData.mqttBrokerId.toString()
            );

            if (brokerExists) {
                setSelectedMqttBrokerId(junctionData.mqttBrokerId.toString());
            }
        }
    }, [junctionData.mqttBrokerId, mqttBrokers]);

    // Auto-assign newly created/selected sensors when toggles are enabled
    useEffect(() => {
        // Don't run during initial load - wait for data to be fully loaded
        if (loading) {
            return;
        }

        // Only run if we have sensors and at least one toggle is enabled
        if (!junctionData.allTargetsAllData && !junctionData.allTargetsAllScreens) {
            return;
        }

        // Don't run if we have selected sensors but sensorTargets hasn't loaded yet
        // This prevents firing during initial page load when sensors load before targets
        const selectedSensors = availableSensors.filter(sensor => sensor.IsSelected);
        if (selectedSensors.length > 0 && Object.keys(sensorTargets).length === 0) {
            // We have selected sensors but no target data loaded yet - skip this run
            return;
        }

        selectedSensors.forEach(async (sensor) => {
            // Skip if already processed
            if (autoAssignedSensorsRef.current.has(sensor.Id)) {
                return;
            }

            // Check if this sensor already has targets assigned
            const hasTargets = sensorTargets[sensor.Id] && sensorTargets[sensor.Id].length > 0;

            // If it already has targets, it's not a new sensor, mark it as processed and skip
            if (hasTargets) {
                autoAssignedSensorsRef.current.add(sensor.Id);
                return;
            }

            // This is a newly selected sensor with no targets - auto-assign it
            await autoAssignSensorToAll(sensor.Id);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [availableSensors, targets, junctionData.allTargetsAllData, junctionData.allTargetsAllScreens, sensorTargets, deviceScreensMap, loading]);

    // Get current sensor order and tag values
    const getSensorOrder = (sensor: any) => {
        return modifiedSensorOrders[sensor.Id] ?? sensor.sensorOrder;
    };

    const getSensorTag = (sensor: any) => {
        return modifiedSensors[sensor.Id] ?? sensor.sensorTag;
    };

    // Fetch all necessary junction data
    const fetchData = async () => {
        if (!id) return;

        try {
            setLoading(true);

            const [deviceData, collectorData, links] = await Promise.all([
                junctionService.getAllDevices(),
                junctionService.getAllCollectors(),
                junctionService.getJunctionLinks(junctionId),
            ]);

            const deviceLinks: SourceOrTarget[] = (links.deviceLinks || []).map((d: any) => ({
                linkId: d.id,
                id: d.deviceId,
                name: d.deviceName,
                description: d.deviceDescription,
                ipAddress: d.deviceIpAddress,
                role: d.role,
                type: "device",
                pollRateOverride: d.pollRateOverride,
                sendRateOverride: d.sendRateOverride,
                defaultPollRate: d.devicePollRate,
                defaultSendRate: d.deviceSendRate,
            }));

            const collectorLinks: SourceOrTarget[] = (links.collectorLinks || []).map((c: any) => ({
                linkId: c.id,
                id: c.collectorId,
                name: c.collectorName,
                description: c.collectorDescription,
                url: c.collectorUrl,
                role: c.role,
                type: "collector",
                pollRateOverride: c.pollRateOverride,
                sendRateOverride: c.sendRateOverride,
                defaultPollRate: c.collectorPollRate,
                defaultSendRate: c.collectorSendRate,
            }));

            const screenMap: { [deviceId: number]: any[] } = {};
            await Promise.all(deviceLinks.map(async (link) => {
                try {
                    const res = await fetch(`/api/devices/${link.id}/screens`);
                    if (res.ok) {
                        const screens = await res.json();
                        screenMap[link.id] = screens;
                    }
                } catch (err) {
                    console.error(`Error fetching screens for device ${link.id}`, err);
                }
            }));
            setDeviceScreensMap(screenMap);

            setSources([
                ...deviceLinks.filter((link: SourceOrTarget) => link.role === "Source"),
                ...collectorLinks.filter((link: SourceOrTarget) => link.role === "Source"),
            ]);

            setTargets([
                ...deviceLinks.filter((link: SourceOrTarget) => link.role === "Target"),
                ...collectorLinks.filter((link: SourceOrTarget) => link.role === "Target"),
            ]);

            setDevicePollRates(deviceLinks.reduce((acc: any, link: any) => {
                acc[link.linkId || link.id] = link.pollRateOverride || 0;
                return acc;
            }, {}));

            setCollectorPollRates(collectorLinks.reduce((acc: any, link: any) => {
                acc[link.linkId || link.id] = link.pollRateOverride || 0;
                return acc;
            }, {}));

            setDeviceSendRates(deviceLinks.reduce((acc: any, link: any) => {
                acc[link.linkId || link.id] = link.sendRateOverride || 0;
                return acc;
            }, {}));

            setCollectorSendRates(collectorLinks.reduce((acc: any, link: any) => {
                acc[link.linkId || link.id] = link.sendRateOverride || 0;
                return acc;
            }, {}));

            const linkedDeviceIds = new Set(deviceLinks.map((link: SourceOrTarget) => link.id));
            const linkedCollectorIds = new Set(collectorLinks.map((link: SourceOrTarget) => link.id));

            setAllDevices(deviceData.filter((d: any) => !linkedDeviceIds.has(d.id)));
            setAllCollectors(collectorData.filter((c: any) => !linkedCollectorIds.has(c.id)));

            const sensorsData = await junctionService.getAvailableSensors(junctionId);
            const normalizedSensors = sensorsData.map((s: any) => ({
                ...s,
                Id: s.id ?? s.Id,
                IsSelected: s.isSelected ?? s.IsSelected,
                IsCustomJunctionSensor: s.isCustomJunctionSensor ?? s.IsCustomJunctionSensor,
                IsEventSensor: s.isEventSensor ?? s.IsEventSensor,
            }));
            setAvailableSensors(normalizedSensors);

            try {
                const res = await fetch(`/api/sensors/junction-sensors/by-junction/${junctionId}/targets-grouped`);
                if (res.ok) {
                    const groupedTargets = await res.json();
                    const allTargets: { [sensorId: number]: { deviceId: number; screenIds: number[] }[] } = {};

                    Object.entries(groupedTargets).forEach(([sensorIdStr, targetsArray]) => {
                        const sensorId = parseInt(sensorIdStr);
                        const targets = targetsArray as any[];

                        const grouped: { [deviceId: number]: number[] } = {};
                        for (const target of targets) {
                            if (!grouped[target.deviceId]) {
                                grouped[target.deviceId] = [];
                            }
                            if (target.screenId !== null) {
                                grouped[target.deviceId].push(target.screenId);
                            }
                        }

                        allTargets[sensorId] = Object.entries(grouped).map(([deviceId, screenIds]) => ({
                            deviceId: parseInt(deviceId),
                            screenIds,
                        }));
                    });

                    setSensorTargets(allTargets);
                } else {
                    setSensorTargets({});
                }
            } catch (error) {
                console.error("Error fetching sensor targets:", error);
                setSensorTargets({});
            }

        } catch (error) {
            console.error("Error fetching junction data:", error);
            showSnackbar("Failed to load junction data", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (id) {
            fetchData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const refreshSensors = async () => {
        try {
            const sensorsData = await junctionService.getAvailableSensors(junctionId);
            const normalizedSensors = sensorsData.map((s: any) => ({
                ...s,
                Id: s.id ?? s.Id,
                IsSelected: s.isSelected ?? s.IsSelected,
                IsCustomJunctionSensor: s.isCustomJunctionSensor ?? s.IsCustomJunctionSensor,
                IsEventSensor: s.isEventSensor ?? s.IsEventSensor,
            }));
            setAvailableSensors(normalizedSensors);
        } catch (error) {
            console.error("Error refreshing sensors:", error);
        }
    };

    const handleAdd = async (item: SourceOrTarget, role: string) => {
        console.log(`[DEBUG] Adding ${item.type} "${item.name}" as ${role}`);

        try {
            let originalRates;

            if (item.type === "device") {
                const originalDevice = allDevices.find(device => device.id === item.id);
                if (originalDevice) {
                    originalRates = {
                        pollRateOverride: originalDevice.pollRate || item.pollRateOverride,
                        sendRateOverride: originalDevice.sendRate || item.sendRateOverride
                    };
                }
                await junctionService.addDeviceLink(junctionId, item.id, role, originalRates);
            } else {
                const originalCollector = allCollectors.find(collector => collector.id === item.id);
                if (originalCollector) {
                    originalRates = {
                        pollRateOverride: originalCollector.pollRate || item.pollRateOverride,
                        sendRateOverride: originalCollector.sendRate || item.sendRateOverride
                    };
                }
                await junctionService.addCollectorLink(junctionId, item.id, role, originalRates);
            }

            console.log(`[DEBUG] ${item.type} link created successfully`);

            const links = await junctionService.getJunctionLinks(junctionId);

            const deviceLinks: SourceOrTarget[] = (links.deviceLinks || []).map((d: any) => ({
                linkId: d.id,
                id: d.deviceId,
                name: d.deviceName,
                description: d.deviceDescription,
                ipAddress: d.deviceIpAddress,
                role: d.role,
                type: "device" as const,
                pollRateOverride: d.pollRateOverride,
                sendRateOverride: d.sendRateOverride,
                defaultPollRate: d.devicePollRate,
                defaultSendRate: d.deviceSendRate,
            }));

            const collectorLinks: SourceOrTarget[] = (links.collectorLinks || []).map((c: any) => ({
                linkId: c.id,
                id: c.collectorId,
                name: c.collectorName,
                description: c.collectorDescription,
                url: c.collectorUrl,
                role: c.role,
                type: "collector" as const,
                pollRateOverride: c.pollRateOverride,
                sendRateOverride: c.sendRateOverride,
                defaultPollRate: c.collectorPollRate,
                defaultSendRate: c.collectorSendRate,
            }));

            const newLink = item.type === "device"
                ? deviceLinks.find(link => link.id === item.id && link.role === role)
                : collectorLinks.find(link => link.id === item.id && link.role === role);

            if (newLink) {
                if (item.type === "device") {
                    setDevicePollRates(prev => ({
                        ...prev,
                        [newLink.linkId!]: newLink.pollRateOverride || 0
                    }));
                    setDeviceSendRates(prev => ({
                        ...prev,
                        [newLink.linkId!]: newLink.sendRateOverride || 0
                    }));
                } else {
                    setCollectorPollRates(prev => ({
                        ...prev,
                        [newLink.linkId!]: newLink.pollRateOverride || 0
                    }));
                    setCollectorSendRates(prev => ({
                        ...prev,
                        [newLink.linkId!]: newLink.sendRateOverride || 0
                    }));
                }

                if (role === "Source") {
                    setSources(prev => [...prev, newLink]);
                    await refreshSensors();
                } else {
                    setTargets(prev => [...prev, newLink]);

                    if (item.type === "device") {
                        try {
                            const res = await fetch(`/api/devices/${item.id}/screens`);
                            if (res.ok) {
                                const screens = await res.json();
                                setDeviceScreensMap(prev => ({
                                    ...prev,
                                    [item.id]: screens
                                }));

                                if (role === "Target") {
                                    const selectedSensors = availableSensors.filter(sensor => sensor.IsSelected);

                                    if (selectedSensors.length > 0) {
                                        if (junctionData.allTargetsAllData) {
                                            for (const sensor of selectedSensors) {
                                                try {
                                                    await junctionService.assignSensorTarget(junctionId, sensor.Id, item.id, null);

                                                    setSensorTargets(prev => {
                                                        const existingTargets = prev[sensor.Id] || [];
                                                        return {
                                                            ...prev,
                                                            [sensor.Id]: [...existingTargets, { deviceId: item.id, screenIds: [] }]
                                                        };
                                                    });

                                                    await new Promise(resolve => setTimeout(resolve, 100));
                                                } catch (error) {
                                                    console.error(`Error auto-assigning sensor ${sensor.Id} to new device ${item.id}:`, error);
                                                }
                                            }

                                            showSnackbar(`Auto-assigned ${selectedSensors.length} sensors to new target device`, "success");
                                        }

                                        if (junctionData.allTargetsAllScreens) {
                                            const allScreenIds = screens.map((screen: any) => screen.id);

                                            if (allScreenIds.length > 0) {
                                                for (const sensor of selectedSensors) {
                                                    const hasTarget = junctionData.allTargetsAllData ||
                                                        (sensorTargets[sensor.Id] || []).some(t => t.deviceId === item.id);

                                                    if (hasTarget) {
                                                        try {
                                                            await handleScreenAssignmentUpdate(sensor.Id, item.id, allScreenIds);
                                                            await new Promise(resolve => setTimeout(resolve, 100));
                                                        } catch (error) {
                                                            console.error(`Error auto-assigning screens for sensor ${sensor.Id} to new device ${item.id}:`, error);
                                                        }
                                                    }
                                                }

                                                const sensorsWithTarget = selectedSensors.filter(sensor =>
                                                    junctionData.allTargetsAllData ||
                                                    (sensorTargets[sensor.Id] || []).some(t => t.deviceId === item.id)
                                                );

                                                if (sensorsWithTarget.length > 0) {
                                                    showSnackbar(`Auto-assigned all screens to ${sensorsWithTarget.length} sensors on new target`, "success");
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        } catch (err) {
                            console.error(`Error fetching screens for device ${item.id}`, err);
                        }
                    }
                }

                if (item.type === "device") {
                    setAllDevices(prev => prev.filter(d => d.id !== item.id));
                } else {
                    setAllCollectors(prev => prev.filter(c => c.id !== item.id));
                }
            }

            showSnackbar(`${item.name} added as ${role.toLowerCase()}`, "success");
        } catch (error) {
            console.error(`Error adding ${item.type} as ${role}:`, error);
            showSnackbar("Failed to add item", "error");
        }
    };

    const handleRemove = async (item: SourceOrTarget) => {
        if (!id || item.linkId === undefined) return;

        try {
            if (item.type === "device") {
                await junctionService.removeDeviceLink(junctionId, item.linkId);
            } else {
                await junctionService.removeCollectorLink(junctionId, item.linkId);
            }

            setSources(prev => {
                const updated = prev.filter(s => s.linkId !== item.linkId);
                if (prev.some(s => s.linkId === item.linkId)) {
                    refreshSensors();
                }
                return updated;
            });

            setTargets(prev => prev.filter(t => t.linkId !== item.linkId));

            if (item.type === "device") {
                setAllDevices(prev => [...prev, {
                    id: item.id,
                    name: item.name,
                    description: item.description,
                    ipAddress: item.ipAddress,
                    pollRate: item.pollRateOverride || 0,
                    sendRate: item.sendRateOverride || 0
                }]);
            } else {
                setAllCollectors(prev => [...prev, {
                    id: item.id,
                    name: item.name,
                    description: item.description,
                    url: item.url,
                    pollRate: item.pollRateOverride || 0,
                    sendRate: item.sendRateOverride || 0
                }]);
            }

            showSnackbar(`${item.name} removed`, "success");
        } catch (error) {
            console.error("Error removing item:", error);
            showSnackbar("Failed to remove item", "error");
        }
    };

    // Shared auto-assignment logic for sensors when toggles are enabled
    const autoAssignSensorToAll = async (sensorId: number) => {
        const deviceTargets = targets.filter(target => target.type === "device");
        let assignedDevicesCount = 0;
        let assignedScreensCount = 0;

        // Auto-assign to all device targets if "All Data All Targets" is enabled
        if (junctionData.allTargetsAllData && deviceTargets.length > 0) {
            for (const target of deviceTargets) {
                try {
                    const existingTargets = sensorTargets[sensorId] || [];
                    const alreadyAssigned = existingTargets.some(t => t.deviceId === target.id);

                    if (!alreadyAssigned) {
                        await junctionService.assignSensorTarget(junctionId, sensorId, target.id, null);

                        setSensorTargets(prev => {
                            const existingTargets = prev[sensorId] || [];
                            return {
                                ...prev,
                                [sensorId]: [...existingTargets, { deviceId: target.id, screenIds: [] }]
                            };
                        });

                        assignedDevicesCount++;
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                } catch (error) {
                    console.error(`Error auto-assigning sensor ${sensorId} to device ${target.id}:`, error);
                }
            }

            // Only show snackbar if we actually assigned to new devices
            if (assignedDevicesCount > 0) {
                showSnackbar(`Auto-assigned sensor to ${assignedDevicesCount} target device${assignedDevicesCount > 1 ? 's' : ''}`, "success");
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        // Auto-assign to all screens if "All Targets All Screens" is enabled
        if (junctionData.allTargetsAllScreens) {
            await new Promise(resolve => setTimeout(resolve, 300));

            let targetAssignments = sensorTargets[sensorId] || [];

            // If we just auto-assigned targets above, construct the list manually
            if (targetAssignments.length === 0 && junctionData.allTargetsAllData) {
                targetAssignments = deviceTargets.map(target => ({
                    deviceId: target.id,
                    screenIds: []
                }));
            }

            if (targetAssignments.length > 0) {
                for (const targetAssignment of targetAssignments) {
                    const deviceScreens = deviceScreensMap[targetAssignment.deviceId] || [];
                    const allScreenIds = deviceScreens.map(screen => screen.id);

                    // Check if screens are already assigned
                    const currentScreenIds = targetAssignment.screenIds || [];
                    const needsAssignment = allScreenIds.length > 0 &&
                        (currentScreenIds.length !== allScreenIds.length ||
                         !allScreenIds.every(id => currentScreenIds.includes(id)));

                    if (needsAssignment) {
                        try {
                            await handleScreenAssignmentUpdate(sensorId, targetAssignment.deviceId, allScreenIds);
                            assignedScreensCount++;
                            await new Promise(resolve => setTimeout(resolve, 100));
                        } catch (error) {
                            console.error(`Error auto-assigning screens for sensor ${sensorId} to device ${targetAssignment.deviceId}:`, error);
                        }
                    }
                }

                // Only show snackbar if we actually assigned screens
                if (assignedScreensCount > 0) {
                    showSnackbar(`Auto-assigned sensor to all screens on ${assignedScreensCount} device${assignedScreensCount > 1 ? 's' : ''}`, "success");
                }
            }
        }

        // Mark this sensor as having been auto-assigned
        autoAssignedSensorsRef.current.add(sensorId);
    };

    const handleSensorSelect = async (sensorId: number) => {
        const currentSensor = availableSensors.find((s) => s.Id === sensorId);
        if (!currentSensor) return;

        const newIsSelected = !currentSensor.IsSelected;

        try {
            await junctionService.updateSensorSelection(currentSensor, newIsSelected);

            setAvailableSensors((prev) =>
                prev.map((s) =>
                    s.Id === sensorId ? { ...s, IsSelected: newIsSelected } : s
                )
            );

            if (newIsSelected) {
                // Use the shared auto-assignment logic
                await autoAssignSensorToAll(sensorId);
            } else {
                const sensorTargetAssignments = sensorTargets[sensorId] || [];

                if (sensorTargetAssignments.length > 0) {
                    let removedTargetsCount = 0;

                    for (const targetAssignment of sensorTargetAssignments) {
                        try {
                            await junctionService.removeSensorTarget(junctionId, sensorId, targetAssignment.deviceId);
                            removedTargetsCount++;
                        } catch (error) {
                            console.error(`Error removing sensor ${sensorId} from device ${targetAssignment.deviceId}:`, error);
                        }
                    }

                    setSensorTargets(prev => {
                        const updated = { ...prev };
                        delete updated[sensorId];
                        return updated;
                    });

                    if (removedTargetsCount > 0) {
                        showSnackbar(`Removed sensor from ${removedTargetsCount} target device${removedTargetsCount > 1 ? 's' : ''}`, "success");
                    }
                }
            }
        } catch (err) {
            console.error("Failed to update sensor selection", err);
            showSnackbar("Failed to update sensor selection", "error");
        }
    };

    useEffect(() => {
        if (!id) return;

        const refreshJunctionStatus = async () => {
            if (screenSelectionModalOpen) {
                return;
            }

            try {
                const runningData = await junctionService.getJunctionStatus();
                const junctionStatus = runningData.find((r: any) => r.id === junctionId);

                if (junctionStatus) {
                    setJunctionData((prevData: any) => ({
                        ...prevData,
                        status: junctionStatus.status
                    }));
                }
            } catch (err) {
                console.error("Error fetching junction status:", err);
            }
        };

        const statusIntervalId = setInterval(() => {
            refreshJunctionStatus();
        }, 2000);

        return () => clearInterval(statusIntervalId);
    }, [id, junctionId, screenSelectionModalOpen]);

    const handleStartJunction = async () => {
        try {
            setLoading(true);
            await junctionService.startJunction(junctionId);

            setJunctionData((prevData: any) => ({
                ...prevData,
                status: "Running"
            }));

            showSnackbar("Junction started successfully", "success");
        } catch (error) {
            console.error("Failed to start junction", error);
            showSnackbar("Failed to start junction", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleStopJunction = async () => {
        try {
            setLoading(true);
            await junctionService.stopJunction(junctionId);

            setJunctionData((prevData: any) => ({
                ...prevData,
                status: "Idle"
            }));

            showSnackbar("Junction stopped successfully", "success");
        } catch (error) {
            console.error("Failed to stop junction", error);
            showSnackbar("Failed to stop junction", "error");
        } finally {
            setLoading(false);
        }
    };

    const handlePollRateOverrideChange = async (
        event: React.ChangeEvent<HTMLInputElement>,
        linkId: number,
        type: "device" | "collector"
    ) => {
        const newPollRate = parseInt(event.target.value, 10);
        if (isNaN(newPollRate)) return;

        if (type === "device" && linkId !== undefined) {
            setDevicePollRates((prev) => ({
                ...prev,
                [linkId]: newPollRate,
            }));
        } else if (type === "collector" && linkId !== undefined) {
            setCollectorPollRates((prev) => ({
                ...prev,
                [linkId]: newPollRate,
            }));
        }

        try {
            await junctionService.updateLinkRates(junctionId, linkId, type, { pollRateOverride: newPollRate });
            showSnackbar("Poll rate updated", "success");
        } catch (err) {
            console.error("Failed to update poll rate override", err);
            showSnackbar("Failed to update poll rate", "error");
        }
    };

    const handleSendRateOverrideChange = async (
        event: React.ChangeEvent<HTMLInputElement>,
        linkId: number,
        type: "device" | "collector"
    ) => {
        const newSendRate = parseInt(event.target.value, 10);
        if (isNaN(newSendRate)) return;

        if (type === "device" && linkId !== undefined) {
            setDeviceSendRates((prev) => ({
                ...prev,
                [linkId]: newSendRate,
            }));
        } else if (type === "collector" && linkId !== undefined) {
            setCollectorSendRates((prev) => ({
                ...prev,
                [linkId]: newSendRate,
            }));
        }

        try {
            await junctionService.updateLinkRates(junctionId, linkId, type, { sendRateOverride: newSendRate });
            showSnackbar("Send rate updated", "success");
        } catch (err) {
            console.error("Failed to update send rate override", err);
            showSnackbar("Failed to update send rate", "error");
        }
    };

    const handleBackToJunctions = () => {
        navigate('/junctions');
    };

    const handleRiveInputsUpdate = useCallback((inputs: any[]) => {
        setRiveInputs(inputs);
    }, []);

    const handleMappedSensorTagsUpdate = useCallback((tags: string[]) => {
        setMappedSensorTags(tags);
    }, []);

    return (
        <Box sx={{ padding: { xs: 1, sm: 2 } }}>
            {/* Header */}
            <Box display="flex" flexDirection={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} mb={3} gap={2}>
                <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}>
                    Configure Junction
                </Typography>
                <Box display="flex" gap={1} flexWrap="wrap">
                    {junctionImportExportEnabled && (
                        <Button
                            variant="outlined"
                            color="primary"
                            onClick={handleExportJunction}
                            startIcon={<DownloadIcon />}
                            size="small"
                            disabled={loading}
                            sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                        >
                            Export
                        </Button>
                    )}
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={handleBackToJunctions}
                        startIcon={<ArrowBackIcon />}
                        sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                    >
                        Back
                    </Button>
                </Box>
            </Box>

            {/* Junction Controls Card - UPDATED WITH TALLER HEADER AND VALIDATION */}
            <Paper
                elevation={2}
                sx={{
                    p: { xs: 2, sm: 3 },
                    mb: 3,
                    borderRadius: 2,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    position: 'sticky',
                    top: { xs: 56, sm: 64 },
                    zIndex: 1000,
                    backgroundColor: 'background.paper'
                }}
            >
                {/* Top Row - Status and Controls */}
                <Box
                    display="flex"
                    flexDirection={{ xs: 'column', sm: 'row' }}
                    alignItems={{ xs: 'stretch', sm: 'center' }}
                    justifyContent="space-between"
                    gap={2}
                >
                    <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
                        <Typography variant="h6" fontWeight="medium" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                            {junctionData?.name || "Junction"}
                        </Typography>
                        <Box display="flex" alignItems="center">
                            <Box
                                component="span"
                                sx={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: "50%",
                                    bgcolor: junctionData?.status === "Running" ? "green" :
                                        junctionData?.status === "Idle" ? "#f0ad4e" :
                                            junctionData?.status === "Error" ? "red" : "gray",
                                    mr: 1,
                                    display: "inline-block"
                                }}
                            />
                            <Typography variant="subtitle1" fontWeight="medium" sx={{ fontSize: { xs: '0.9rem', sm: '1rem' } }}>
                                Status: {junctionData?.status || "Unknown"}
                            </Typography>
                        </Box>
                    </Box>

                    <Box display="flex" gap={1} flexWrap="wrap">
                        <Button
                            variant="contained"
                            color="success"
                            onClick={handleStartJunction}
                            startIcon={<PlayArrowIcon />}
                            size="small"
                            disabled={loading || junctionData?.status === "Running" || !screenLayoutsValid || sensorValidations.noSensorsSelected || sensorValidations.allSensorsUnassigned}
                            sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                        >
                            Start
                        </Button>

                        <Button
                            variant="outlined"
                            color="error"
                            onClick={handleStopJunction}
                            startIcon={<StopIcon />}
                            size="small"
                            disabled={loading || junctionData?.status !== "Running"}
                            sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                        >
                            Stop
                        </Button>

                        <Button
                            variant="outlined"
                            startIcon={<RefreshIcon />}
                            size="small"
                            onClick={() => {
                                setLoading(true);
                                fetchData().finally(() => setLoading(false));
                            }}
                            sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                        >
                            Refresh
                        </Button>
                    </Box>
                </Box>

                {/* View Mode Toggle and Validation Row */}
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 2,
                        flexWrap: 'wrap'
                    }}
                >
                    {/* Validation Warnings - Right Side, before toggle */}
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            flexWrap: 'wrap'
                        }}
                    >
                        {!screenLayoutsValid && (
                            <Button
                                variant="contained"
                                color="error"
                                startIcon={<WarningIcon />}
                                onClick={scrollToScreenLayouts}
                                sx={{
                                    fontSize: { xs: '0.8rem', sm: '0.875rem' },
                                    textTransform: 'none'
                                }}
                            >
                                {validationMessage}
                            </Button>
                        )}

                        {sensorValidations.noSensorsSelected && (
                            <Button
                                variant="contained"
                                color="error"
                                startIcon={<WarningIcon />}
                                sx={{
                                    fontSize: { xs: '0.8rem', sm: '0.875rem' },
                                    textTransform: 'none'
                                }}
                            >
                                No sensors selected
                            </Button>
                        )}

                        {sensorValidations.allSensorsUnassigned && (
                            <Button
                                variant="contained"
                                color="error"
                                startIcon={<WarningIcon />}
                                sx={{
                                    fontSize: { xs: '0.8rem', sm: '0.875rem' },
                                    textTransform: 'none'
                                }}
                            >
                                Selected sensors have no targets or screens assigned
                            </Button>
                        )}

                        {sensorValidations.someSensorsUnassigned && (
                            <Button
                                variant="contained"
                                color="warning"
                                startIcon={<WarningIcon />}
                                sx={{
                                    fontSize: { xs: '0.8rem', sm: '0.875rem' },
                                    textTransform: 'none'
                                }}
                            >
                                Some selected sensors do not have a target or screen selected
                            </Button>
                        )}

                        {hasPayloadMismatches && (
                            <Button
                                variant="contained"
                                color="warning"
                                startIcon={<WarningIcon />}
                                onClick={scrollToScreenLayouts}
                                sx={{
                                    fontSize: { xs: '0.8rem', sm: '0.875rem' },
                                    textTransform: 'none'
                                }}
                            >
                                {payloadMismatchCount} device screen{payloadMismatchCount !== 1 ? 's' : ''} {payloadMismatchCount !== 1 ? 'have' : 'has'} payload compatibility issues
                            </Button>
                        )}
                    </Box>

                    {/* View Mode Toggle - Right Side */}
                    <ToggleButtonGroup
                        value={junctionViewMode}
                        exclusive
                        onChange={(_, newMode) => {
                            if (newMode !== null) {
                                handleViewModeChange(newMode);
                            }
                        }}
                        size="small"
                    >
                        <ToggleButton value="list" aria-label="list view">
                            <Tooltip title="List View">
                                <ViewListIcon fontSize="small" />
                            </Tooltip>
                        </ToggleButton>
                        <ToggleButton value="tabs" aria-label="tabs view">
                            <Tooltip title="Tabs View">
                                <TabIcon fontSize="small" />
                            </Tooltip>
                        </ToggleButton>
                    </ToggleButtonGroup>
                </Box>

                {/* Progress Indicator (when starting from this page) */}
                {showProgress && junctionStartProgress && (
                    <CompactProgressIndicator
                        junctionName={junctionStartProgress.junctionName}
                        currentStage={junctionStartProgress.stage}
                        detailMessage={junctionStartProgress.detailMessage}
                        isGatewayJunction={junctionData.type?.includes('Gateway')}
                        hasError={junctionStartProgress.hasError}
                        isComplete={junctionStartProgress.isComplete}
                    />
                )}

                {/* Statistics Row */}
                <Box
                    display="flex"
                    flexDirection={{ xs: 'column', sm: 'row' }}
                    gap={2}
                    sx={{
                        pt: 1,
                        borderTop: '1px solid',
                        borderColor: 'divider'
                    }}
                >
                    <Box display="flex" gap={3} flexWrap="wrap" alignItems="center">
                        <Typography variant="body2" color="text.secondary">
                            <strong>Sources:</strong> {sources.length}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Targets:</strong> {targets.length}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Selected Sensors:</strong> {availableSensors.filter(s => s.IsSelected).length} / {availableSensors.length}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Mapped:</strong> {riveInputs.filter(input => input.isConfigured).length} / {riveInputs.length} FrameEngine bindings
                        </Typography>
                    </Box>
                </Box>
            </Paper>

            {/* COM Setup Advice */}
            {shouldShowCOMSetup(junctionData.type) && (
                <Accordion sx={{ mb: 3 }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box display="flex" alignItems="center" gap={1}>
                            <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                                COM Junction Setup Guidance
                            </Typography>
                        </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                        {/* eslint-disable-next-line react/jsx-pascal-case */}
                        <Junction_Setup_COM />
                    </AccordionDetails>
                </Accordion>
            )}

            {/* Main Content */}
            {loading ? (
                <Box display="flex" justifyContent="center" my={4}>
                    <CircularProgress />
                </Box>
            ) : junctionViewMode === 'tabs' ? (
                /* Tabs View */
                <Paper sx={{ mt: 2 }}>
                    <Tabs
                        value={currentTab}
                        onChange={(e, newValue) => setCurrentTab(newValue)}
                        variant="scrollable"
                        scrollButtons="auto"
                    >
                        <Tab label="Junction Configuration" />
                        <Tab label="Sources & Targets" />
                        <Tab label="Device Screens & Layouts" />
                        <Tab label="Sensors" />
                    </Tabs>

                    <Box
                        sx={{
                            p: 3,
                            // Force all accordions to be expanded and non-interactive
                            '& .MuiAccordion-root': {
                                '&:before': { display: 'none' }, // Remove default divider
                            },
                            '& .MuiAccordionSummary-root': {
                                cursor: 'default !important',
                                '&:hover': {
                                    backgroundColor: 'transparent !important'
                                }
                            },
                            '& .MuiAccordionSummary-expandIconWrapper': {
                                display: 'none !important'
                            },
                            // Force expanded state visually
                            '& .MuiCollapse-root': {
                                visibility: 'visible !important',
                                height: 'auto !important'
                            },
                            '& .MuiAccordionDetails-root': {
                                display: 'block !important'
                            }
                        }}
                    >
                        {/* Tab 0: Junction Configuration */}
                        <Box sx={{ display: currentTab === 0 ? 'block' : 'none' }}>
                            {/* eslint-disable-next-line react/jsx-pascal-case */}
                            <Junction_ConfigPanel
                                junctionData={junctionData}
                                setJunctionData={setJunctionData}
                                onJunctionDataChange={handleJunctionDataChange}
                                loading={loading}
                                mqttBrokers={mqttBrokers}
                                selectedMqttBrokerId={selectedMqttBrokerId}
                                setSelectedMqttBrokerId={setSelectedMqttBrokerId}
                                settingsExpanded={settingsExpanded}
                                onSettingsExpandedChange={handleSettingsExpandedChange}
                                onConnectToMQTTBroker={connectToMQTTBroker}
                            />
                        </Box>

                        {/* Tab 1: Sources & Targets */}
                        <Box sx={{ display: currentTab === 1 ? 'block' : 'none' }}>
                            <AvailableSourcesTargetsTable
                                loading={loading}
                                allDevices={allDevices}
                                allCollectors={allCollectors}
                                sources={sources}
                                targets={targets}
                                devicePollRates={devicePollRates}
                                deviceSendRates={deviceSendRates}
                                collectorPollRates={collectorPollRates}
                                collectorSendRates={collectorSendRates}
                                handleAdd={handleAdd}
                                handleRemove={handleRemove}
                                handlePollRateOverrideChange={handlePollRateOverrideChange}
                                handleSendRateOverrideChange={handleSendRateOverrideChange}
                                appVersion={version || undefined}
                            />
                        </Box>

                        {/* Tab 2: Device Screens & Layouts */}
                        <Box sx={{ display: currentTab === 2 ? 'block' : 'none' }}>
                            <DeviceScreenLayoutsCard
                                junctionId={junctionId}
                                junction={junctionData}
                                deviceLinks={[...sources, ...targets].filter(link => link.type === "device")}
                                loading={loading}
                                showSnackbar={showSnackbar}
                                onJunctionUpdate={(updatedJunction) => setJunctionData(updatedJunction)}
                                availableSensors={availableSensors}
                                onRiveInputsUpdate={handleRiveInputsUpdate}
                                onValidationUpdate={handleValidationUpdate}
                                onPayloadMismatchUpdate={handlePayloadMismatchUpdate}
                                onMappedSensorTagsUpdate={handleMappedSensorTagsUpdate}
                                disableCollapse={true}
                            />
                        </Box>

                        {/* Tab 3: Sensors (includes Custom Sensors) */}
                        <Box sx={{ display: currentTab === 3 ? 'block' : 'none' }}>
                            <Junction_EnhancedSensorSelector
                                availableSensors={regularSensors}
                                handleSensorSelect={handleSensorSelect}
                                handleSensorOrderChange={handleSensorOrderChange}
                                handleSensorTagChange={handleSensorTagChange}
                                handleSensorUpdate={handleSensorUpdate}
                                getSensorOrder={getSensorOrder}
                                getSensorTag={getSensorTag}
                                sensorTargets={sensorTargets}
                                targets={targets}
                                removeSensorTarget={(junctionId, sensorId, deviceId) =>
                                    junctionService.removeSensorTarget(junctionId, sensorId, deviceId)}
                                assignSensorTarget={(junctionId, sensorId, deviceId, screenId) =>
                                    junctionService.assignSensorTarget(junctionId, sensorId, deviceId, screenId)}
                                setCurrentSensor={setCurrentSensor}
                                setScreenSelectionModalOpen={setScreenSelectionModalOpen}
                                showSnackbar={showSnackbar}
                                setSensorTargets={setSensorTargets}
                                showSelectedOnly={showSelectedOnly}
                                setShowSelectedOnly={handleShowSelectedOnlyChange}
                                defaultVisibleColumns={getDefaultJunctionColumns()}
                                localStorageKey="junction_sensors_columns"
                                junctionId={junctionId}
                                allDataAllTargets={junctionData.allTargetsAllData}
                                allTargetsAllScreens={junctionData.allTargetsAllScreens}
                                onAllDataAllTargetsChange={handleAllDataAllTargetsToggle}
                                onAllTargetsAllScreensChange={handleAllTargetsAllScreensChange}
                                hideEditColumn={false}
                                hideJunctionSettings={false}
                                appVersion={version || undefined}
                                deviceScreensMap={deviceScreensMap}
                                onScreenAssignmentUpdate={handleScreenAssignmentUpdate}
                                sources={sources}
                                riveInputs={riveInputs}
                                mappedSensorTags={mappedSensorTags}
                            />

                            {/* Custom Sensors - now part of Sensors tab */}
                            <Box sx={{ mt: 3 }}>
                                {/* eslint-disable-next-line react/jsx-pascal-case */}
                                <Junction_CustomSensorCreator
                                    junctionId={junctionId}
                                    availableSensors={customSensors}
                                    onSensorsRefresh={refreshSensors}
                                    showSnackbar={showSnackbar}
                                    sensorTargets={sensorTargets}
                                    targets={targets}
                                    removeSensorTarget={(junctionId, sensorId, deviceId) =>
                                        junctionService.removeSensorTarget(junctionId, sensorId, deviceId)}
                                    assignSensorTarget={(junctionId, sensorId, deviceId, screenId) =>
                                        junctionService.assignSensorTarget(junctionId, sensorId, deviceId, screenId)}
                                    setCurrentSensor={setCurrentSensor}
                                    setScreenSelectionModalOpen={setScreenSelectionModalOpen}
                                    setSensorTargets={setSensorTargets}
                                    allDataAllTargets={junctionData.allTargetsAllData}
                                    allTargetsAllScreens={junctionData.allTargetsAllScreens}
                                    deviceScreensMap={deviceScreensMap}
                                    onScreenAssignmentUpdate={handleScreenAssignmentUpdate}
                                    mappedSensorTags={mappedSensorTags}
                                />
                            </Box>
                        </Box>
                    </Box>
                </Paper>
            ) : (
                /* List View (Original Accordion Layout) */
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {/* Junction Configuration in List View */}
                    {/* eslint-disable-next-line react/jsx-pascal-case */}
                    <Junction_ConfigPanel
                        junctionData={junctionData}
                        setJunctionData={setJunctionData}
                        onJunctionDataChange={handleJunctionDataChange}
                        loading={loading}
                        mqttBrokers={mqttBrokers}
                        selectedMqttBrokerId={selectedMqttBrokerId}
                        setSelectedMqttBrokerId={setSelectedMqttBrokerId}
                        settingsExpanded={settingsExpanded}
                        onSettingsExpandedChange={handleSettingsExpandedChange}
                        onConnectToMQTTBroker={connectToMQTTBroker}
                    />

                    <AvailableSourcesTargetsTable
                        loading={loading}
                        allDevices={allDevices}
                        allCollectors={allCollectors}
                        sources={sources}
                        targets={targets}
                        devicePollRates={devicePollRates}
                        deviceSendRates={deviceSendRates}
                        collectorPollRates={collectorPollRates}
                        collectorSendRates={collectorSendRates}
                        handleAdd={handleAdd}
                        handleRemove={handleRemove}
                        handlePollRateOverrideChange={handlePollRateOverrideChange}
                        handleSendRateOverrideChange={handleSendRateOverrideChange}
                        appVersion={version || undefined}
                    />

                    <div id="screen-layouts-section">
                        <DeviceScreenLayoutsCard
                            junctionId={junctionId}
                            junction={junctionData}
                            deviceLinks={[...sources, ...targets].filter(link => link.type === "device")}
                            loading={loading}
                            showSnackbar={showSnackbar}
                            onJunctionUpdate={(updatedJunction) => setJunctionData(updatedJunction)}
                            availableSensors={availableSensors}
                            onRiveInputsUpdate={handleRiveInputsUpdate}
                            onValidationUpdate={handleValidationUpdate}
                            onPayloadMismatchUpdate={handlePayloadMismatchUpdate}
                            onMappedSensorTagsUpdate={handleMappedSensorTagsUpdate}
                        />
                    </div>

                    <Junction_EnhancedSensorSelector
                        availableSensors={regularSensors}
                        handleSensorSelect={handleSensorSelect}
                        handleSensorOrderChange={handleSensorOrderChange}
                        handleSensorTagChange={handleSensorTagChange}
                        handleSensorUpdate={handleSensorUpdate}
                        getSensorOrder={getSensorOrder}
                        getSensorTag={getSensorTag}
                        sensorTargets={sensorTargets}
                        targets={targets}
                        removeSensorTarget={(junctionId, sensorId, deviceId) =>
                            junctionService.removeSensorTarget(junctionId, sensorId, deviceId)}
                        assignSensorTarget={(junctionId, sensorId, deviceId, screenId) =>
                            junctionService.assignSensorTarget(junctionId, sensorId, deviceId, screenId)}
                        setCurrentSensor={setCurrentSensor}
                        setScreenSelectionModalOpen={setScreenSelectionModalOpen}
                        showSnackbar={showSnackbar}
                        setSensorTargets={setSensorTargets}
                        showSelectedOnly={showSelectedOnly}
                        setShowSelectedOnly={handleShowSelectedOnlyChange}
                        defaultVisibleColumns={getDefaultJunctionColumns()}
                        localStorageKey="junction_sensors_columns"
                        junctionId={junctionId}
                        allDataAllTargets={junctionData.allTargetsAllData}
                        allTargetsAllScreens={junctionData.allTargetsAllScreens}
                        onAllDataAllTargetsChange={handleAllDataAllTargetsToggle}
                        onAllTargetsAllScreensChange={handleAllTargetsAllScreensChange}
                        hideEditColumn={false}
                        hideJunctionSettings={false}
                        appVersion={version || undefined}
                        deviceScreensMap={deviceScreensMap}
                        onScreenAssignmentUpdate={handleScreenAssignmentUpdate}
                        sources={sources}
                        riveInputs={riveInputs}
                        mappedSensorTags={mappedSensorTags}
                    />

                    {/* eslint-disable-next-line react/jsx-pascal-case */}
                    <Junction_CustomSensorCreator
                        junctionId={junctionId}
                        availableSensors={customSensors}
                        onSensorsRefresh={refreshSensors}
                        showSnackbar={showSnackbar}
                        sensorTargets={sensorTargets}
                        targets={targets}
                        removeSensorTarget={(junctionId, sensorId, deviceId) =>
                            junctionService.removeSensorTarget(junctionId, sensorId, deviceId)}
                        assignSensorTarget={(junctionId, sensorId, deviceId, screenId) =>
                            junctionService.assignSensorTarget(junctionId, sensorId, deviceId, screenId)}
                        setCurrentSensor={setCurrentSensor}
                        setScreenSelectionModalOpen={setScreenSelectionModalOpen}
                        setSensorTargets={setSensorTargets}
                        allDataAllTargets={junctionData.allTargetsAllData}
                        allTargetsAllScreens={junctionData.allTargetsAllScreens}
                        deviceScreensMap={deviceScreensMap}
                        onScreenAssignmentUpdate={handleScreenAssignmentUpdate}
                        mappedSensorTags={mappedSensorTags}
                    />
                </Box>
            )}

            {/* Snackbar for notifications */}
            <Snackbar
                open={Boolean(snackMessage)}
                autoHideDuration={5000}
                onClose={() => setSnackMessage(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setSnackMessage(null)}
                    severity={snackbarSeverity}
                    sx={{ width: "100%" }}
                >
                    {snackMessage}
                </Alert>
            </Snackbar>

            {/* Screen Selection Modal */}
            <ScreenSelectionModal
                open={screenSelectionModalOpen}
                onClose={() => setScreenSelectionModalOpen(false)}
                sensor={currentSensor}
                showSnackbar={showSnackbar}
                allTargets={targets}
                sensorTargets={currentSensor ? sensorTargets[currentSensor.Id] || [] : []}
                deviceScreensMap={deviceScreensMap}
                onDeviceAssign={async (deviceId) => {
                    if (currentSensor) {
                        await junctionService.assignSensorTarget(junctionId, currentSensor.Id, deviceId, null);
                        // Refresh sensor targets
                        const res = await fetch(`/api/sensors/junction-sensors/by-junction/${junctionId}/targets-grouped`);
                        if (res.ok) {
                            const groupedTargets = await res.json();
                            const allTargets: { [sensorId: number]: { deviceId: number; screenIds: number[] }[] } = {};
                            Object.entries(groupedTargets).forEach(([sensorIdStr, targetsArray]) => {
                                const sensorId = parseInt(sensorIdStr, 10);
                                allTargets[sensorId] = targetsArray as { deviceId: number; screenIds: number[] }[];
                            });
                            setSensorTargets(allTargets);
                        }
                    }
                }}
                onDeviceRemove={async (deviceId) => {
                    if (currentSensor) {
                        await junctionService.removeSensorTarget(junctionId, currentSensor.Id, deviceId);
                        // Refresh sensor targets
                        const res = await fetch(`/api/sensors/junction-sensors/by-junction/${junctionId}/targets-grouped`);
                        if (res.ok) {
                            const groupedTargets = await res.json();
                            const allTargets: { [sensorId: number]: { deviceId: number; screenIds: number[] }[] } = {};
                            Object.entries(groupedTargets).forEach(([sensorIdStr, targetsArray]) => {
                                const sensorId = parseInt(sensorIdStr, 10);
                                allTargets[sensorId] = targetsArray as { deviceId: number; screenIds: number[] }[];
                            });
                            setSensorTargets(allTargets);
                        }
                    }
                }}
                onScreenAssignmentUpdate={(deviceId, screenIds) => {
                    if (currentSensor) {
                        return handleScreenAssignmentUpdate(currentSensor.Id, deviceId, screenIds);
                    }
                    return Promise.resolve();
                }}
            />
        </Box>
    );
};

export default ConfigureJunction;