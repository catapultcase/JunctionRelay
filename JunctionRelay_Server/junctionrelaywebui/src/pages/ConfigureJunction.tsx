/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024�present Jonathan Mills, CatapultCase
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

import React, { useState, useEffect, useCallback } from "react";
import {
    Typography, Box, Button, Card, CardContent, CircularProgress, Paper,
    Alert, Snackbar, SelectChangeEvent,
    TextField, Select, MenuItem, FormControl, InputLabel,
    FormControlLabel, Switch, Accordion, AccordionSummary,
    AccordionDetails, useTheme, useMediaQuery
} from "@mui/material";
import { useParams, useNavigate } from "react-router-dom";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

// Import the useFeatureFlags hook
import { useFeatureFlags } from "../hooks/useFeatureFlags";

// Import API services
import * as junctionService from '../services/junctionApiService';

// Components
import Junction_ConfigPanel from '../components/Junction_ConfigPanel';
import EnhancedSensorsTable from '../components/EnhancedSensorsTable';
import ScreenSelectionModal from '../components/ScreenSelectionModal';
import AvailableSourcesTargetsTable from '../components/AvailableSourcesTargetsTable';
import DeviceScreenLayoutsCard from '../components/DeviceScreenLayoutsCard';
import Junction_Setup_COM from '../components/Junction_Setup_COM';

// Icon imports
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import SettingsIcon from '@mui/icons-material/Settings';
import SaveIcon from '@mui/icons-material/Save';
import LinkIcon from '@mui/icons-material/Link';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

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

// Junction types available
const JUNCTION_TYPES = [
    "COM Junction",
    "HTTP Junction",
    "MQTT Junction",
    "WebSocket Junction",
    "Gateway Junction (COM to ESP:NOW)",
    "Gateway Junction (HTTP to ESP:NOW)",
    "Gateway Junction (WebSocket to ESP:NOW)"
];

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
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Hooks
    const flags = useFeatureFlags();
    const junctionImportExportEnabled = flags?.junction_import_export !== false;

    // State for Show Selected Only
    const [showSelectedOnly, setShowSelectedOnly] = useState(() => {
        try {
            const savedFilter = localStorage.getItem(`junction${junctionId}ShowSelectedOnly`);
            return savedFilter === 'true';
        } catch (error) {
            console.error("Error accessing localStorage:", error);
            return false;
        }
    });

    // State for junction data
    const [junctionData, setJunctionData] = useState<any>({ status: "Loading..." });
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
    const [filteredSensors, setFilteredSensors] = useState<any[]>([]);

    // Screen Selection
    const [screenSelectionModalOpen, setScreenSelectionModalOpen] = useState<boolean>(false);
    const [currentSensor, setCurrentSensor] = useState<any>(null);
    const [currentTargetDevice, setCurrentTargetDevice] = useState<any>(null);

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

    // Settings accordion state with localStorage
    const [settingsExpanded, setSettingsExpanded] = useState(() => {
        try {
            const saved = localStorage.getItem('junctionSettingsExpanded');
            return saved !== null ? saved === 'true' : false;
        } catch (error) {
            console.error("Error accessing localStorage for settings:", error);
            return false;
        }
    });

    // Handle Show Selected Only
    const handleShowSelectedOnlyChange = (checked: boolean) => {
        setShowSelectedOnly(checked);
        try {
            localStorage.setItem(`junction${junctionId}ShowSelectedOnly`, checked.toString());
        } catch (error) {
            console.error("Error saving filter state to localStorage:", error);
        }
    };

    // Listen for bottom action bar events
    useEffect(() => {
        const handleRefresh = () => {
            fetchData();
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
            // Show confirmation dialog before deleting
            if (window.confirm(`Are you sure you want to delete this junction "${junctionData.name}"? This action cannot be undone.`)) {
                // Handle junction deletion logic here
                // You would typically call an API to delete the junction
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
    const fetchJunctionInfo = async () => {
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
    };

    // Initial data loading
    useEffect(() => {
        fetchJunctionInfo();
    }, [id]);

    // Handle MQTT broker selection
    const handleMqttBrokerChange = (event: SelectChangeEvent<string>) => {
        setSelectedMqttBrokerId(event.target.value);
    };

    // Handle settings accordion expansion
    const handleSettingsExpandedChange = (isExpanded: boolean) => {
        setSettingsExpanded(isExpanded);
        try {
            localStorage.setItem('junctionSettingsExpanded', isExpanded.toString());
        } catch (error) {
            console.error("Error saving settings expansion state to localStorage:", error);
        }
    };

    // Handle AllTargets settings changes
    const handleAllTargetsAllDataChange = async (enabled: boolean): Promise<void> => {
        try {
            setLoading(true);
            await junctionService.updateJunction(junctionId, {
                ...junctionData,
                AllTargetsAllData: enabled
            });
            setJunctionData((prev: any) => ({ ...prev, allTargetsAllData: enabled }));
        } catch (error) {
            console.error("Error updating AllTargetsAllData:", error);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const handleAllTargetsAllScreensChange = async (enabled: boolean): Promise<void> => {
        try {
            setLoading(true);
            await junctionService.updateJunction(junctionId, {
                ...junctionData,
                AllTargetsAllScreens: enabled
            });
            setJunctionData((prev: any) => ({ ...prev, allTargetsAllScreens: enabled }));
        } catch (error) {
            console.error("Error updating AllTargetsAllScreens:", error);
            throw error;
        } finally {
            setLoading(false);
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
            setLoading(true);

            const targetData = sensorTargets[sensorId]?.find(t => t.deviceId === deviceId);
            const existingScreenIds = targetData?.screenIds || [];

            if (!targetData && screenIds.length > 0) {
                try {
                    await junctionService.assignSensorTarget(junctionId, sensorId, deviceId, null);
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (error) {
                    console.error("Failed to create initial target relationship:", error);
                    showSnackbar("Failed to create target relationship: " +
                        (error instanceof Error ? error.message : String(error)), "error");
                    setLoading(false);
                    return;
                }
            }

            const screensToRemove = existingScreenIds.filter(id => !screenIds.includes(id));
            const screensToAdd = screenIds.filter(id => !existingScreenIds.includes(id));
            let operationsFailed = false;

            for (const screenId of screensToRemove) {
                try {
                    await junctionService.removeSensorScreen(junctionId, sensorId, deviceId, screenId);
                    await new Promise(resolve => setTimeout(resolve, 300));
                } catch (error) {
                    console.error(`Error removing screen ${screenId}:`, error);
                    operationsFailed = true;
                }
            }

            for (const screenId of screensToAdd) {
                try {
                    await junctionService.assignScreenToTarget(junctionId, sensorId, deviceId, screenId);
                    await new Promise(resolve => setTimeout(resolve, 300));
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
        } finally {
            setLoading(false);
        }
    };

    // Update sensor order
    const handleSensorOrderChange = async (sensor: any, newOrder: number) => {
        if (sensor.SensorOrder === newOrder) return;

        setModifiedSensorOrders((prev) => ({
            ...prev,
            [sensor.Id]: newOrder,
        }));

        setFilteredSensors((prev) =>
            prev.map((s) =>
                s.Id === sensor.Id ? { ...s, SensorOrder: newOrder } : s
            )
        );

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

        setFilteredSensors((prev) =>
            prev.map((s) =>
                s.Id === sensor.Id ? { ...s, SensorTag: newTag } : s
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

    // Initialize sensors with updated values
    useEffect(() => {
        setFilteredSensors((prevSensors) =>
            availableSensors.map((sensor) => {
                const modifiedOrder = modifiedSensorOrders[sensor.Id];
                return {
                    ...sensor,
                    SensorTag: modifiedSensors[sensor.Id] ?? sensor.sensorTag,
                    SensorOrder: modifiedOrder ?? sensor.sensorOrder,
                };
            })
        );
    }, [availableSensors, modifiedSensors, modifiedSensorOrders]);

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

    // Get current sensor order and tag values
    const getSensorOrder = (sensor: any) => {
        return modifiedSensorOrders[sensor.Id] ?? sensor.sensorOrder;
    };

    const getSensorTag = (sensor: any) => {
        return modifiedSensors[sensor.Id] ?? sensor.sensorTag;
    };

    // Fetch all necessary junction data
    const fetchData = useCallback(async () => {
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
    }, [id, junctionId]);

    // Initial data fetch
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleAdd = async (item: SourceOrTarget, role: string) => {
        try {
            let originalRates;

            if (item.type === "device") {
                const originalDevice = allDevices.find(device => device.id === item.id);
                if (originalDevice) {
                    originalRates = {
                        pollRateOverride: originalDevice.pollRate,
                        sendRateOverride: originalDevice.sendRate
                    };
                }
                await junctionService.addDeviceLink(junctionId, item.id, role, originalRates);
            } else {
                const originalCollector = allCollectors.find(collector => collector.id === item.id);
                if (originalCollector) {
                    originalRates = {
                        pollRateOverride: originalCollector.pollRate,
                        sendRateOverride: originalCollector.sendRate
                    };
                }
                await junctionService.addCollectorLink(junctionId, item.id, role, originalRates);
            }

            await fetchData();
            showSnackbar(`${item.name} added as ${role.toLowerCase()}`, "success");
        } catch (error) {
            console.error(`Error adding ${item.type} as ${role}:`, error);
            showSnackbar("Failed to add item", "error");
        }
    };

    // Handle removing a source or target
    const handleRemove = async (item: SourceOrTarget) => {
        if (!id || item.linkId === undefined) return;

        try {
            if (item.type === "device") {
                await junctionService.removeDeviceLink(junctionId, item.linkId);
            } else {
                await junctionService.removeCollectorLink(junctionId, item.linkId);
            }
            await fetchData();
            showSnackbar(`${item.name} removed`, "success");
        } catch (error) {
            console.error("Error removing item:", error);
            showSnackbar("Failed to remove item", "error");
        }
    };

    // Handle sensor selection
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

            setFilteredSensors((prev) =>
                prev.map((s) =>
                    s.Id === sensorId ? { ...s, IsSelected: newIsSelected } : s
                )
            );
        } catch (err) {
            console.error("Failed to update sensor selection", err);
            showSnackbar("Failed to update sensor selection", "error");
        }
    };

    // Update the status polling useEffect
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
        }, 1000);

        return () => clearInterval(statusIntervalId);
    }, [id, junctionId, screenSelectionModalOpen]);

    // Update the handleStartJunction function
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

    // Update the handleStopJunction function
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

    // Update poll rate override
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

    // Navigate back to junctions
    const handleBackToJunctions = () => {
        navigate('/junctions');
    };

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

            {/* Junction Controls Card */}
            <Paper
                elevation={2}
                sx={{
                    p: { xs: 2, sm: 3 },
                    mb: 3,
                    borderRadius: 2,
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    alignItems: { xs: 'stretch', sm: 'center' },
                    justifyContent: 'space-between',
                    gap: 2
                }}
            >
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

                <Box display="flex" gap={1} flexWrap="wrap">
                    <Button
                        variant="contained"
                        color="success"
                        onClick={handleStartJunction}
                        startIcon={<PlayArrowIcon />}
                        size="small"
                        disabled={loading || junctionData?.status === "Running"}
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
                        onClick={fetchData}
                        sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                    >
                        Refresh
                    </Button>
                </Box>
            </Paper>

            <Junction_ConfigPanel
                junctionData={junctionData}
                setJunctionData={setJunctionData}
                selectedMqttBrokerId={selectedMqttBrokerId}
                setSelectedMqttBrokerId={setSelectedMqttBrokerId}
                mqttBrokers={mqttBrokers}
                loading={loading}
                settingsExpanded={settingsExpanded}
                onSettingsExpandedChange={handleSettingsExpandedChange}
                onSaveJunction={saveJunction}
                onConnectToMQTTBroker={connectToMQTTBroker}
            />

            {/* COM Setup Advice - Only show for COM and Gateway COM junctions */}
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
                        <Junction_Setup_COM />
                    </AccordionDetails>
                </Accordion>
            )}

            {/* Main Content */}
            {loading ? (
                <Box display="flex" justifyContent="center" my={4}>
                    <CircularProgress />
                </Box>
            ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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
                    />

                        <DeviceScreenLayoutsCard
                            junctionId={junctionId}
                            junction={junctionData}
                            deviceLinks={[...sources, ...targets].filter(link => link.type === "device")}
                            loading={loading}
                            showSnackbar={showSnackbar}
                            onJunctionUpdate={(updatedJunction) => setJunctionData(updatedJunction)}
                        />

                    <EnhancedSensorsTable
                        availableSensors={availableSensors}
                        handleSensorSelect={handleSensorSelect}
                        handleSensorOrderChange={handleSensorOrderChange}
                        handleSensorTagChange={handleSensorTagChange}
                        getSensorOrder={getSensorOrder}
                        getSensorTag={getSensorTag}
                        sensorTargets={sensorTargets}
                        targets={targets}
                        removeSensorTarget={(junctionId, sensorId, deviceId) =>
                            junctionService.removeSensorTarget(junctionId, sensorId, deviceId)}
                        assignSensorTarget={(junctionId, sensorId, deviceId, screenId) =>
                            junctionService.assignSensorTarget(junctionId, sensorId, deviceId, screenId)}
                        setCurrentSensor={setCurrentSensor}
                        setCurrentTargetDevice={setCurrentTargetDevice}
                        setScreenSelectionModalOpen={setScreenSelectionModalOpen}
                        showSnackbar={showSnackbar}
                        setSensorTargets={setSensorTargets}
                        showSelectedOnly={showSelectedOnly}
                        setShowSelectedOnly={handleShowSelectedOnlyChange}
                        defaultVisibleColumns={getDefaultJunctionColumns()}
                        localStorageKey="junction_sensors_columns"
                        junctionId={junctionId}
                        allTargetsAllData={junctionData.allTargetsAllData}
                        allTargetsAllScreens={junctionData.allTargetsAllScreens}
                        onAllTargetsAllDataChange={handleAllTargetsAllDataChange}
                        onAllTargetsAllScreensChange={handleAllTargetsAllScreensChange}
                        hideEditColumn={false}
                        hideJunctionSettings={false}
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
                device={currentTargetDevice}
                screens={currentTargetDevice ? deviceScreensMap[currentTargetDevice.id] || [] : []}
                selectedScreenIds={
                    currentSensor && currentTargetDevice
                        ? sensorTargets[currentSensor.Id]?.find(t => t.deviceId === currentTargetDevice.id)?.screenIds || []
                        : []
                }
                onScreensSelected={(screenIds) => {
                    if (currentSensor && currentTargetDevice) {
                        return handleScreenAssignmentUpdate(currentSensor.Id, currentTargetDevice.id, screenIds);
                    }
                    return Promise.resolve();
                }}
                showSnackbar={showSnackbar}
            />
        </Box>
    );
};

export default ConfigureJunction;