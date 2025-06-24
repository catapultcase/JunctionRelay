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

import React, { useState, useEffect, useCallback } from "react";
import {
    Typography, Box, Button, Table, TableHead,
    TableRow, TableCell, TableBody, 
    CircularProgress, Tabs, Tab, Paper,
    Alert, Snackbar, SelectChangeEvent, TableContainer
} from "@mui/material";
import { useParams } from "react-router-dom";

// Import the useFeatureFlags hook
import { useFeatureFlags } from "../hooks/useFeatureFlags";

// Import API services
import * as junctionService from '../services/junctionApiService';

// Components
import EnhancedSensorsTable from '../components/EnhancedSensorsTable';
import ScreenSelectionModal from '../components/ScreenSelectionModal';
import AvailableSourcesTargetsTable from '../components/AvailableSourcesTargetsTable';
import JunctionConfigPanel from '../components/JunctionConfigPanel';
import DeviceScreenLayoutsCard from '../components/DeviceScreenLayoutsCard';

// Icon imports
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import SensorsIcon from '@mui/icons-material/Sensors';
import SettingsIcon from '@mui/icons-material/Settings';
import AnalyticsIcon from '@mui/icons-material/Analytics';
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

const headerStyle = {
    padding: '8px 16px',
    borderBottom: '2px solid #ddd',
    fontWeight: 'bold',
    backgroundColor: '#f5f5f5'
};

const cellStyle = {
    padding: '6px 16px'
};

// Interface tabs
interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

const TabPanel = ({ children, value, index, ...other }: TabPanelProps) => {
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`junction-tabpanel-${index}`}
            aria-labelledby={`junction-tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box sx={{ p: 3 }}>{children}</Box>
            )}
        </div>
    );
};

const getDefaultJunctionColumns = () => {
    return [
        "selection",
        "order",
        "source",
        "name",
        "sensorTag",
        "componentName",
        "value",
        "unit",
        "targets"
    ];
};

// Main Component
const ConfigureJunction: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const junctionId = parseInt(id || "0", 10);

    // Hooks
    const flags = useFeatureFlags();
    const junctionImportExportEnabled = flags?.junction_import_export !== false;

    // State for tabs
    const [tabValue, setTabValue] = useState(() => {
        try {
            const savedTab = localStorage.getItem('junctionConfigTab');
            return savedTab ? parseInt(savedTab, 10) : 0;
        } catch (error) {
            console.error("Error accessing localStorage:", error);
            return 0;
        }
    });

    // State for Show Selected Only
    const [showSelectedOnly, setShowSelectedOnly] = useState(() => {
        try {
            const savedFilter = localStorage.getItem(`junction${junctionId}ShowSelectedOnly`);
            return savedFilter === 'true'; // Convert string to boolean
        } catch (error) {
            console.error("Error accessing localStorage:", error);
            return false; // Default value
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

    // State for real-time data
    const [cachedData, setCachedData] = useState<any[]>([]);

    // State for modified sensor data
    const [modifiedSensorOrders, setModifiedSensorOrders] = useState<{ [sensorId: number]: number }>({});
    const [modifiedSensors, setModifiedSensors] = useState<{ [sensorId: number]: string }>({});

    // State for notifications
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "info" | "warning" | "error">("success");

    // Show snackbar notification
    const showSnackbar = (message: string, severity: "success" | "info" | "warning" | "error" = "success") => {
        setSnackMessage(message);
        setSnackbarSeverity(severity);
    };

    // Handle tab change
    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
        try {
            localStorage.setItem('junctionConfigTab', newValue.toString());
        } catch (error) {
            console.error("Error saving tab state to localStorage:", error);
        }
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
            link.download = `junction_${junctionId}.json`;  // Set the filename
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
            console.log("Fetching MQTT brokers...");
            const res = await fetch("/api/services");
            if (!res.ok) {
                throw new Error(`Failed to fetch services: ${res.status} ${res.statusText}`);
            }
            const data = await res.json();
            console.log("All services from API:", data);

            const mqttBrokers = data.filter((service: any) => service.type === "MQTT Broker");
            console.log("Filtered MQTT brokers:", mqttBrokers);

            setMqttBrokers(mqttBrokers);
            return mqttBrokers; // Return the brokers so we can use them immediately
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

            // First ensure MQTT brokers are loaded
            await fetchMqttBrokers();

            // Fetch junction data
            const data = await junctionService.getJunctionData(junctionId);

            // Debug logging
            console.log("Junction data from API:", data);
            console.log("MQTT Broker ID from data:", data.mqttBrokerId, "Type:", typeof data.mqttBrokerId);

            // Also fetch running status data to merge with junction data
            try {
                const runningData = await junctionService.getJunctionStatus();
                // Find this specific junction's status
                const junctionStatus = runningData.find((r: any) => r.id === junctionId);
                if (junctionStatus) {
                    // Merge status with junction data
                    data.status = junctionStatus.status;
                }
            } catch (error) {
                console.error("Error fetching running status:", error);
            }

            setJunctionData(data);

            // Set the selected MQTT broker ID with better handling
            let selectedId = "";

            if (data.mqttBrokerId != null && data.mqttBrokerId !== undefined) {
                selectedId = data.mqttBrokerId.toString();
                console.log("Setting selected MQTT broker ID to:", selectedId);
            } else {
                console.log("No MQTT broker ID found in junction data");
            }

            setSelectedMqttBrokerId(selectedId);

            // Debug: Log available brokers to compare (this should now have data)
            console.log("Available MQTT brokers after fetch:", mqttBrokers);

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

    // Handle Show Selected Only
    const handleShowSelectedOnlyChange = (checked: boolean) => {
        setShowSelectedOnly(checked);
        try {
            localStorage.setItem(`junction${junctionId}ShowSelectedOnly`, checked.toString());
        } catch (error) {
            console.error("Error saving filter state to localStorage:", error);
        }
    };

    // Save junction data
    const saveJunction = async () => {
        if (!id) return;

        try {
            setLoading(true);

            // Create an update payload with proper types
            const updatePayload: junctionService.JunctionUpdatePayload = {
                Name: junctionData.name,
                Type: junctionData.type,
                Description: junctionData.description || "",
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
                EnableNotifications: junctionData.enableNotifications
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

    const assignScreenToTarget = async (sensorId: number, deviceId: number, screenId: number) => {
        try {
            console.log(`Assigning screen ${screenId} to sensor ${sensorId} for device ${deviceId}`);

            // Use the endpoint that's designed for adding a screen to an existing target
            const response = await fetch(`/api/sensors/junction-sensors/${junctionId}/${sensorId}/assign-screen`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    DeviceId: deviceId,
                    ScreenId: screenId
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Failed to assign screen: ${errorText}`);
                throw new Error(`Failed to assign screen: ${response.status} ${response.statusText}`);
            }

            return await response.json();
        } catch (error: unknown) {
            // Proper TypeScript error handling
            if (error instanceof Error) {
                throw error;
            } else {
                throw new Error(String(error));
            }
        }
    };


    // The key function to update screen assignments
    const handleScreenAssignmentUpdate = async (sensorId: number, deviceId: number, screenIds: number[]) => {
        try {
            // Start loading state
            setLoading(true);

            // First check what screens we already have assigned
            const targetData = sensorTargets[sensorId]?.find(t => t.deviceId === deviceId);
            const existingScreenIds = targetData?.screenIds || [];

            // If no existing target relationship, we need to create it first
            if (!targetData && screenIds.length > 0) {
                console.log(`Creating initial sensor target for sensor ${sensorId} and device ${deviceId}`);

                try {
                    // First create the target relationship without any screen
                    await junctionService.assignSensorTarget(junctionId, sensorId, deviceId, null);

                    // Short wait to ensure server-side processing completes
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (error) {
                    console.error("Failed to create initial target relationship:", error);
                    showSnackbar("Failed to create target relationship: " +
                        (error instanceof Error ? error.message : String(error)), "error");
                    setLoading(false);
                    return; // Stop further processing
                }
            }

            // Determine screens to add and remove
            const screensToRemove = existingScreenIds.filter(id => !screenIds.includes(id));
            const screensToAdd = screenIds.filter(id => !existingScreenIds.includes(id));
            let operationsFailed = false;

            // Process screen removals sequentially to avoid race conditions
            for (const screenId of screensToRemove) {
                try {
                    console.log(`Removing screen ${screenId} from sensor ${sensorId} and device ${deviceId}`);
                    await junctionService.removeSensorScreen(junctionId, sensorId, deviceId, screenId);
                    // Add a small delay between operations
                    await new Promise(resolve => setTimeout(resolve, 300));
                } catch (error) {
                    console.error(`Error removing screen ${screenId}:`, error);
                    operationsFailed = true;
                    // Continue with other operations
                }
            }

            // Process screen additions sequentially
            for (const screenId of screensToAdd) {
                try {
                    console.log(`Assigning screen ${screenId} to sensor ${sensorId} and device ${deviceId}`);
                    await junctionService.assignScreenToTarget(junctionId, sensorId, deviceId, screenId);
                    // Add a small delay between operations
                    await new Promise(resolve => setTimeout(resolve, 300));
                } catch (error) {
                    console.error(`Error adding screen ${screenId}:`, error);
                    operationsFailed = true;
                    // Continue with other screens
                }
            }

            // Update local state after all API calls complete, regardless of failures
            setSensorTargets(prev => {
                const updatedTargets = [...(prev[sensorId] || [])];
                const targetIndex = updatedTargets.findIndex(t => t.deviceId === deviceId);

                if (targetIndex >= 0) {
                    // Update existing target
                    updatedTargets[targetIndex] = {
                        ...updatedTargets[targetIndex],
                        screenIds
                    };
                } else if (screenIds.length > 0) {
                    // Add new target if we have screens to add
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

            // Only show error messages, not success messages
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
            // Always ensure loading state is reset
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

    // Update sensor order
    const handleSensorOrderChange = async (sensor: any, newOrder: number) => {
        // Skip if order hasn't changed
        if (sensor.SensorOrder === newOrder) return;

        // Update local state
        setModifiedSensorOrders((prev) => ({
            ...prev,
            [sensor.Id]: newOrder,
        }));

        // Update filtered sensors list
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
        // Skip if tag hasn't changed
        if (sensor.SensorTag === newTag) return;

        // Update local state
        setModifiedSensors((prev) => ({
            ...prev,
            [sensor.Id]: newTag,
        }));

        // Update filtered sensors list
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

    // Updated useEffect to handle when mqttBrokers state changes
    useEffect(() => {
        if (junctionData?.mqttBrokerId && mqttBrokers.length > 0 && !selectedMqttBrokerId) {
            const brokerExists = mqttBrokers.some(broker =>
                broker.id.toString() === junctionData.mqttBrokerId.toString()
            );

            if (brokerExists) {
                console.log("Setting MQTT broker ID from useEffect:", junctionData.mqttBrokerId.toString());
                setSelectedMqttBrokerId(junctionData.mqttBrokerId.toString());
            } else {
                console.warn("MQTT Broker ID", junctionData.mqttBrokerId, "not found in available brokers");
                console.warn("Available broker IDs:", mqttBrokers.map(b => b.id));
            }
        }
    }, [junctionData, mqttBrokers, selectedMqttBrokerId]);

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

            // Process device links
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

            // Process collector links
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

            // Fetch screens for each device
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

            // Set sources and targets
            setSources([
                ...deviceLinks.filter((link: SourceOrTarget) => link.role === "Source"),
                ...collectorLinks.filter((link: SourceOrTarget) => link.role === "Source"),
            ]);

            setTargets([
                ...deviceLinks.filter((link: SourceOrTarget) => link.role === "Target"),
                ...collectorLinks.filter((link: SourceOrTarget) => link.role === "Target"),
            ]);

            // Set rate overrides
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

            // Set available devices and collectors
            const linkedDeviceIds = new Set(deviceLinks.map((link: SourceOrTarget) => link.id));
            const linkedCollectorIds = new Set(collectorLinks.map((link: SourceOrTarget) => link.id));

            setAllDevices(deviceData.filter((d: any) => !linkedDeviceIds.has(d.id)));
            setAllCollectors(collectorData.filter((c: any) => !linkedCollectorIds.has(c.id)));

            // Get available sensors
            const sensorsData = await junctionService.getAvailableSensors(junctionId);
            const normalizedSensors = sensorsData.map((s: any) => ({
                ...s,
                Id: s.id ?? s.Id,
                IsSelected: s.isSelected ?? s.IsSelected,
            }));
            setAvailableSensors(normalizedSensors);

            // Load sensor targets for all sensors in one batch request
            try {
                const res = await fetch(`/api/sensors/junction-sensors/by-junction/${junctionId}/targets-grouped`);
                if (res.ok) {
                    const groupedTargets = await res.json();

                    // Process the grouped targets
                    const allTargets: { [sensorId: number]: { deviceId: number; screenIds: number[] }[] } = {};

                    // For each sensor ID and its targets
                    Object.entries(groupedTargets).forEach(([sensorIdStr, targetsArray]) => {
                        const sensorId = parseInt(sensorIdStr);

                        // Type assertion to tell TypeScript that targetsArray is an array
                        const targets = targetsArray as any[];

                        // Group targets by deviceId
                        const grouped: { [deviceId: number]: number[] } = {};
                        for (const target of targets) {
                            if (!grouped[target.deviceId]) {
                                grouped[target.deviceId] = [];
                            }
                            if (target.screenId !== null) {
                                grouped[target.deviceId].push(target.screenId);
                            }
                        }

                        // Convert to the format expected by the UI
                        allTargets[sensorId] = Object.entries(grouped).map(([deviceId, screenIds]) => ({
                            deviceId: parseInt(deviceId),
                            screenIds,
                        }));
                    });

                    setSensorTargets(allTargets);
                } else {
                    console.error(`Failed to fetch sensor targets: ${res.status}`);
                    // Still set an empty object to avoid undefined errors
                    setSensorTargets({});
                }
            } catch (error) {
                console.error("Error fetching sensor targets:", error);
                // Set empty object on error
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

    // Poll for real-time sensor data
    useEffect(() => {
        if (!id) return;

        const intervalId = setInterval(async () => {
            // Skip data refresh when the modal is open
            if (screenSelectionModalOpen) {
                return;
            }

            try {
                const data = await junctionService.getSensorData(junctionId);
                const formattedData = data.map((sensor: any) => ({
                    ...sensor,
                    lastUpdated: junctionService.getTimeAgoInSeconds(sensor.lastUpdated),
                }));

                setCachedData(formattedData);
            } catch (err) {
                console.error("Error fetching cached data", err);
                // No need to show a snackbar for periodic refresh errors
            }
        }, 1000);

        return () => clearInterval(intervalId);
    }, [id, junctionId, screenSelectionModalOpen]);

    const handleAdd = async (item: SourceOrTarget, role: string) => {
        try {
            console.log(`Adding ${item.type} as ${role}:`, item);

            // Find the original device/collector to get its default poll/send rates
            let originalRates;

            if (item.type === "device") {
                // Find the original device from allDevices
                const originalDevice = allDevices.find(device => device.id === item.id);
                console.log(`Original device found:`, originalDevice);

                if (originalDevice) {
                    originalRates = {
                        pollRateOverride: originalDevice.pollRate,
                        sendRateOverride: originalDevice.sendRate
                    };
                    console.log(`Using device rates from original device:`, originalRates);
                } else {
                    console.warn(`Original device not found for id ${item.id}`);
                }

                await junctionService.addDeviceLink(junctionId, item.id, role, originalRates);
            } else {
                // Find the original collector from allCollectors
                const originalCollector = allCollectors.find(collector => collector.id === item.id);
                console.log(`Original collector found:`, originalCollector);

                if (originalCollector) {
                    originalRates = {
                        pollRateOverride: originalCollector.pollRate,
                        sendRateOverride: originalCollector.sendRate
                    };
                    console.log(`Using collector rates from original collector:`, originalRates);
                } else {
                    console.warn(`Original collector not found for id ${item.id}`);
                }

                await junctionService.addCollectorLink(junctionId, item.id, role, originalRates);
            }

            console.log(`Successfully added ${item.type} as ${role}`);
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

        // Function to fetch only the junction's status
        const refreshJunctionStatus = async () => {
            // Skip status refresh when the modal is open
            if (screenSelectionModalOpen) {
                return;
            }

            try {
                const runningData = await junctionService.getJunctionStatus();
                // Find this specific junction's status
                const junctionStatus = runningData.find((r: any) => r.id === junctionId);

                if (junctionStatus) {
                    // Only update the status property, not the entire junction data
                    setJunctionData((prevData: any) => ({
                        ...prevData,
                        status: junctionStatus.status
                    }));
                }
            } catch (err) {
                console.error("Error fetching junction status:", err);
            }
        };

        // Set up polling interval for status updates only
        const statusIntervalId = setInterval(() => {
            refreshJunctionStatus();
        }, 1000);

        // Clean up interval on component unmount
        return () => clearInterval(statusIntervalId);
    }, [id, junctionId, screenSelectionModalOpen]);

    // Update the handleStartJunction function
    const handleStartJunction = async () => {
        try {
            setLoading(true);
            await junctionService.startJunction(junctionId);

            // Immediately update the UI status without waiting for the next poll
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

            // Immediately update the UI status without waiting for the next poll
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

        // Update local state
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

        // Update local state
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

    // Render Junction Configuration Tab
    const renderJunctionConfigTab = () => (
        <JunctionConfigPanel
            loading={loading}
            junctionData={junctionData}
            setJunctionData={setJunctionData}
            selectedMqttBrokerId={selectedMqttBrokerId}
            setSelectedMqttBrokerId={setSelectedMqttBrokerId}
            mqttBrokers={mqttBrokers}
            saveJunction={saveJunction}
            connectToMQTTBroker={connectToMQTTBroker}
        />
    );

    // Render Sources, Targets, and Sensors Tab
    const renderSourcesTargetsTab = () => (
        <Box>
            {loading ? (
                <Box display="flex" justifyContent="center" my={4}>
                    <CircularProgress />
                </Box>
            ) : (
                <>
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
                            deviceLinks={[...sources, ...targets].filter(link => link.type === "device")}
                            loading={loading}
                            showSnackbar={showSnackbar}
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
                            // Add these new props
                            defaultVisibleColumns={getDefaultJunctionColumns()}
                            localStorageKey="junction_sensors_columns"
                            junctionId={junctionId}
                        />
                </>
            )}
        </Box>
    );

    // Render Analytics Tab
    const renderAnalyticsTab = () => (
        <Box>
            <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
                <Typography variant="h6" gutterBottom sx={{
                    display: 'flex',
                    alignItems: 'center',
                    mb: 2
                }}>
                    <AnalyticsIcon sx={{ mr: 1 }} />
                    Real-time Sensor Data
                </Typography>

                <Box display="flex" justifyContent="space-between" mb={2}>
                    <Typography variant="body2" color="text.secondary">
                        Live data is refreshed automatically every second
                    </Typography>

                    <Button
                        size="small"
                        startIcon={<RefreshIcon />}
                        onClick={() => {
                            // Manually refresh sensor data
                            const fetchCachedData = async () => {
                                try {
                                    const data = await junctionService.getSensorData(junctionId);
                                    const formattedData = data.map((sensor: any) => ({
                                        ...sensor,
                                        lastUpdated: junctionService.getTimeAgoInSeconds(sensor.lastUpdated),
                                    }));
                                    setCachedData(formattedData);
                                    showSnackbar("Sensor data refreshed", "success");
                                } catch (err) {
                                    console.error("Error fetching cached data", err);
                                    showSnackbar("Failed to refresh sensor data", "error");
                                }
                            };
                            fetchCachedData();
                        }}
                    >
                        Refresh Now
                    </Button>
                </Box>

                <TableContainer component={Paper} variant="outlined">
                    <Table size="small" stickyHeader>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={headerStyle}>Sensor Name</TableCell>
                                <TableCell sx={headerStyle}>Sensor Tag</TableCell>
                                <TableCell sx={headerStyle}>Value</TableCell>
                                <TableCell sx={headerStyle}>Unit</TableCell>
                                <TableCell sx={headerStyle}>Component</TableCell>
                                <TableCell sx={headerStyle}>Last Updated</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {cachedData.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            {junctionData?.status === "Running"
                                                ? "No sensor data available yet. Make sure sensors are selected and the junction is properly configured."
                                                : "Junction is not running. Start the junction to see real-time sensor data."
                                            }
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                cachedData.map((sensor, index) => (
                                    <TableRow key={`sensor-${sensor.Id || index}`} hover>
                                        <TableCell sx={cellStyle}>{sensor.name}</TableCell>
                                        <TableCell sx={cellStyle}>{sensor.sensorTag}</TableCell>
                                        <TableCell sx={cellStyle}>
                                            <Typography
                                                fontWeight="medium"
                                                variant="body2"
                                            >
                                                {sensor.value !== undefined ? sensor.value : '—'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={cellStyle}>{sensor.unit || '—'}</TableCell>
                                        <TableCell sx={cellStyle}>{sensor.componentName || '—'}</TableCell>
                                        <TableCell sx={cellStyle}>{sensor.lastUpdated}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>
        </Box>
    );

    return (
        <Box sx={{ padding: 2 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h4">
                    Configure Junction
                </Typography>
                <Box>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => console.log("Back to Junctions")}
                    >
                        Back to Junctions
                    </Button>
                </Box>
            </Box>

            {/* Action Buttons with margin */}
            <Box display="flex" gap={2} mt={3} mb={3} sx={{ marginBottom: 3 }}>
                {/* Export Button - only show if feature flag is enabled */}
                {junctionImportExportEnabled && (
                    <Button
                        variant="outlined"
                        color="primary"
                        onClick={handleExportJunction}
                        startIcon={<DownloadIcon />}
                        size="small"
                        disabled={false}
                    >
                        Export Junction
                    </Button>
                )}
            </Box>

            {/* Junction Controls Card - Persistent Above Tabs */}
            <Paper
                elevation={2}
                sx={{
                    p: 3,
                    mb: 3,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
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
                    <Typography variant="subtitle1" fontWeight="medium">
                        Status: {junctionData?.status || "Unknown"}
                    </Typography>
                </Box>

                <Box display="flex" gap={2}>
                    <Button
                        variant="contained"
                        color="success"
                        onClick={handleStartJunction}
                        startIcon={<PlayArrowIcon />}
                        size="small"
                        disabled={loading || junctionData?.status === "Running"}
                    >
                        Start Junction
                    </Button>

                    <Button
                        variant="outlined"
                        color="error"
                        onClick={handleStopJunction}
                        startIcon={<StopIcon />}
                        size="small"
                        disabled={loading || junctionData?.status !== "Running"}
                    >
                        Stop Junction
                    </Button>

                    <Button
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        size="small"
                        onClick={fetchData}
                    >
                        Refresh Data
                    </Button>
                </Box>
            </Paper>

            <Paper sx={{ width: '100%', mb: 4 }} elevation={2}>
                <Tabs
                    value={tabValue}
                    onChange={handleTabChange}
                    aria-label="junction configuration tabs"
                    sx={{ borderBottom: 1, borderColor: 'divider' }}
                >
                    <Tab
                        icon={<SettingsIcon />}
                        iconPosition="start"
                        label="Junction Configuration"
                        id="junction-tab-0"
                        aria-controls="junction-tabpanel-0"
                    />
                    <Tab
                        icon={<SensorsIcon />}
                        iconPosition="start"
                        label="Sources, Targets & Sensors"
                        id="junction-tab-1"
                        aria-controls="junction-tabpanel-1"
                    />
                    <Tab
                        icon={<AnalyticsIcon />}
                        iconPosition="start"
                        label="Analytics"
                        id="junction-tab-2"
                        aria-controls="junction-tabpanel-2"
                    />
                </Tabs>
                <TabPanel value={tabValue} index={0}>
                    {renderJunctionConfigTab()}
                </TabPanel>
                <TabPanel value={tabValue} index={1}>
                    {renderSourcesTargetsTab()}
                </TabPanel>
                <TabPanel value={tabValue} index={2}>
                    {renderAnalyticsTab()}
                </TabPanel>
            </Paper>

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