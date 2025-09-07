import React, { useState, useEffect } from "react";
import {
    Typography, Box, Table, TableHead,
    TableRow, TableCell, TableBody, Paper,
    Chip, CircularProgress, TableContainer,
    Select, MenuItem, FormControl, SelectChangeEvent,
    TextField, Switch, FormControlLabel, InputLabel,
    Card, CardContent, Button, Link, Tooltip,
    IconButton, Collapse
} from "@mui/material";

// Icon imports
import ScreenshotIcon from '@mui/icons-material/Screenshot';
import DevicesIcon from '@mui/icons-material/Devices';
import SettingsIcon from '@mui/icons-material/Settings';
import ImageIcon from '@mui/icons-material/Image';
import SaveIcon from '@mui/icons-material/Save';
import LinkIcon from '@mui/icons-material/Link';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import SensorsIcon from '@mui/icons-material/Sensors';
import LabelIcon from '@mui/icons-material/Label';

// Define sensor interface to match the one from EnhancedSensorsTable
interface Sensor {
    Id: number;
    name: string;
    sensorTag: string;
    deviceName: string;
    componentName?: string;
    externalId?: string;
    IsSelected: boolean;
    unit?: string;
    value?: any;
    decimalPlaces: number;
    sensorOrder: number;
    lastUpdated?: string;
    // Add other fields from Model_Sensor
    sensorType?: string;
    category?: string;
    formula?: string;
    isMissing?: boolean;
    isStale?: boolean;
    isVisible?: boolean;
    junctionId?: number;
    deviceId?: number;
    collectorId?: number;
    serviceId?: number;
    mqttTopic?: string;
    mqttQoS?: number;
    customAttribute1?: string;
    customAttribute2?: string;
    customAttribute3?: string;
    customAttribute4?: string;
    customAttribute5?: string;
    customAttribute6?: string;
    customAttribute7?: string;
    customAttribute8?: string;
    customAttribute9?: string;
    customAttribute10?: string;
    [key: string]: any; // Allow additional dynamic properties
}

interface DeviceScreenLayoutsCardProps {
    junctionId: number;
    junction: any; // Junction object with renderingMode property
    deviceLinks: any[]; // Device links with role="Target"
    loading: boolean;
    showSnackbar: (message: string, severity: "success" | "info" | "warning" | "error") => void;
    onJunctionUpdate?: (updatedJunction: any) => void; // Callback to update parent component
    availableSensors: Sensor[]; // New prop for sensor data
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

interface ScreenLayoutConfig {
    id?: number;
    junctionId?: number;
    deviceScreenId: number;
    screenLayoutId?: number; // For payload mode
    frameLayoutId?: number; // For frame modes
    targetPollRate?: number;
    onlySendIfChanged: boolean;
    enableUrlAccess?: boolean; // New field
    urlPath?: string; // New field
    lastRequested?: string; // New field
}

interface FrameElement {
    id: string;
    type: string;
    position: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    display: {
        visible: boolean;
        zIndex: number;
        order: number;
    };
    properties: {
        sensorTag?: string;
        showUnit?: boolean;
        showLabel?: boolean;
        placeholderSensorLabel?: string;
        placeholderValue?: string;
        placeholderUnit?: string;
        [key: string]: any;
    };
    lastModified: string;
}

interface SensorTag {
    sensorTag: string;
    placeholderSensorLabel: string;
    showLabel: boolean;
    showUnit: boolean;
    placeholderValue: string;
    placeholderUnit: string;
    isConnected: boolean; // Now uses real sensor mapping logic
}

// Rive Input interfaces
interface RiveInput {
    machineName: string;
    inputName: string;
    inputType: 'number' | 'boolean' | 'trigger' | 'unknown';
    fullKey: string; // "StateMachine.InputName" format
    currentValue?: any;
    mappedSensorTags: string[]; // Array of sensor tags mapped to this input
    isConfigured: boolean; // Whether this input has sensor mappings
}

interface DiscoveredRiveData {
    machines: Array<{
        name: string;
        inputNames: string[];
        inputs: Array<{
            name: string;
            type: 'number' | 'boolean' | 'trigger' | 'unknown';
            currentValue?: any;
        }>;
    }>;
    lastUpdate: string;
    metadata: {
        totalInputs: number;
        inputTypeBreakdown: Record<string, number>;
    };
}

// Render mode display names with proper typing
const renderModeDisplayNames: Record<string, string> = {
    'Payload': 'Payloads',
    'Blit': 'FrameEngine - Blit (Pre-Rendered Frames)',
    'Composite': 'FrameEngine - Composite (Reassembly at Target)'
};

// Function to extract Rive inputs from JsonFrameConfig
const extractRiveInputsFromTemplates = (availableLayouts: any[], availableSensors: Sensor[]): RiveInput[] => {
    const allRiveInputs: RiveInput[] = [];
    const inputMap = new Map<string, RiveInput>();

    availableLayouts.forEach(layout => {
        if (!layout.jsonFrameConfig) return;

        try {
            const frameConfig = JSON.parse(layout.jsonFrameConfig);
            const riveDiscovery: DiscoveredRiveData = frameConfig.frameConfig?.rive?.discovery;

            if (!riveDiscovery?.machines) return;

            riveDiscovery.machines.forEach(machine => {
                machine.inputs.forEach(input => {
                    const fullKey = `${machine.name}.${input.name}`;

                    if (!inputMap.has(fullKey)) {
                        // Check if any selected sensors are mapped to this input
                        // Look for sensor tags that match the input name or full key
                        // Support comma-separated sensor tags with EXACT matching
                        const mappedSensors = availableSensors.filter(sensor => {
                            if (!sensor.IsSelected) return false;

                            // Split sensor tag by comma and check each part
                            const sensorTags = sensor.sensorTag.split(',').map(tag => tag.trim());

                            return sensorTags.some(tag =>
                                tag === input.name ||
                                tag === fullKey
                            );
                        });

                        // Get all sensor tags that could map to this input (exact matches only)
                        const mappedSensorTags: string[] = [];
                        mappedSensors.forEach(sensor => {
                            const sensorTags = sensor.sensorTag.split(',').map(tag => tag.trim());
                            sensorTags.forEach(tag => {
                                if (tag === input.name || tag === fullKey) {
                                    if (!mappedSensorTags.includes(tag)) {
                                        mappedSensorTags.push(tag);
                                    }
                                }
                            });
                        });

                        const riveInput: RiveInput = {
                            machineName: machine.name,
                            inputName: input.name,
                            inputType: input.type,
                            fullKey,
                            currentValue: input.currentValue,
                            mappedSensorTags: mappedSensorTags,
                            isConfigured: mappedSensorTags.length > 0
                        };

                        inputMap.set(fullKey, riveInput);
                        allRiveInputs.push(riveInput);
                    }
                });
            });
        } catch (error) {
            console.error('Error parsing JsonFrameConfig for layout:', layout.displayName, error);
        }
    });

    return allRiveInputs;
};

// Rive Input Mapping Section Component
const RiveInputMappingSection: React.FC<{
    riveInputs: RiveInput[];
    availableSensors: Sensor[];
    onInputMappingChange: (inputKey: string, sensorTags: string[]) => void;
}> = ({ riveInputs, availableSensors, onInputMappingChange }) => {

    if (riveInputs.length === 0) {
        return (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, fontStyle: 'italic' }}>
                No Rive inputs discovered from current templates. Rive inputs will appear here when you configure Composite layouts.
            </Typography>
        );
    }

    // Group inputs by state machine
    const inputsByMachine = riveInputs.reduce((acc, input) => {
        if (!acc[input.machineName]) {
            acc[input.machineName] = [];
        }
        acc[input.machineName].push(input);
        return acc;
    }, {} as Record<string, RiveInput[]>);

    return (
        <Box sx={{ mt: 2 }}>
            {Object.entries(inputsByMachine).map(([machineName, inputs]) => (
                <Box key={machineName} sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                        {machineName}:
                    </Typography>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ ...headerStyle, fontSize: '0.75rem' }}>Input Name</TableCell>
                                <TableCell sx={{ ...headerStyle, fontSize: '0.75rem' }}>Status</TableCell>
                                <TableCell sx={{ ...headerStyle, fontSize: '0.75rem' }}>Type</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {inputs.map((input) => (
                                <TableRow key={input.fullKey} hover>
                                    <TableCell sx={{ ...cellStyle, fontSize: '0.8rem' }}>
                                        <Box display="flex" alignItems="center">
                                            <SensorsIcon fontSize="small" sx={{ mr: 1, color: 'primary.main' }} />
                                            <Typography variant="body2" fontWeight="medium">
                                                {input.inputName}
                                            </Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell sx={{ ...cellStyle, fontSize: '0.8rem' }}>
                                        <Chip
                                            size="small"
                                            label={input.isConfigured ? "Mapped" : "Not Mapped"}
                                            color={input.isConfigured ? "success" : "error"}
                                            icon={input.isConfigured ? <CheckCircleIcon /> : <CancelIcon />}
                                            variant="outlined"
                                        />
                                    </TableCell>
                                    <TableCell sx={{ ...cellStyle, fontSize: '0.8rem' }}>
                                        <Chip
                                            size="small"
                                            label={input.inputType}
                                            color={
                                                input.inputType === 'number' ? 'primary' :
                                                    input.inputType === 'boolean' ? 'secondary' :
                                                        input.inputType === 'trigger' ? 'warning' : 'default'
                                            }
                                            variant="outlined"
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Box>
            ))}
        </Box>
    );
};

const DeviceScreenLayoutsCard: React.FC<DeviceScreenLayoutsCardProps> = ({
    junctionId,
    junction,
    deviceLinks,
    loading,
    showSnackbar,
    onJunctionUpdate,
    availableSensors
}) => {
    // State for screens, layouts, and configurations
    const [deviceScreens, setDeviceScreens] = useState<{ [deviceId: number]: any[] }>({});
    const [screenLayouts, setScreenLayouts] = useState<any[]>([]); // Legacy layouts
    const [frameLayouts, setFrameLayouts] = useState<any[]>([]); // Frame layouts
    const [screenConfigs, setScreenConfigs] = useState<{ [key: string]: ScreenLayoutConfig }>({});
    const [loadingState, setLoadingState] = useState<{ [key: string]: boolean }>({});
    const [savingRenderingMode, setSavingRenderingMode] = useState<boolean>(false);

    // State for Rive input mappings
    const [riveInputMappings, setRiveInputMappings] = useState<Record<string, string[]>>({});

    // Determine rendering mode using new constants
    const renderingMode = junction?.renderingMode || 'Payload';
    const isPayloadMode = renderingMode === 'Payload';
    const isBlitMode = renderingMode === 'Blit';
    const isCompositeMode = renderingMode === 'Composite';
    const isAnyFrameMode = isBlitMode || isCompositeMode;

    // Filter layouts based on rendering mode
    const getFilteredLayouts = () => {
        if (isBlitMode || isCompositeMode) {
            // Both frame modes - show all frame layouts
            return frameLayouts;
        } else {
            // Payload mode - show traditional screen layouts
            return screenLayouts;
        }
    };

    const availableLayouts = getFilteredLayouts();

    // Filter to only include device links that are targets
    const targetDeviceLinks = deviceLinks.filter(link =>
        link.type === "device" && link.role === "Target"
    );

    // Function to check if a sensor tag is mapped to a selected sensor (updated to handle comma-separated tags)
    const isSensorTagMapped = (sensorTag: string): boolean => {
        return availableSensors.some(sensor => {
            if (!sensor.IsSelected) return false;

            // Split sensor tag by comma and check each part for exact match
            const sensorTags = sensor.sensorTag.split(',').map(tag => tag.trim());
            return sensorTags.includes(sensorTag);
        });
    };

    // Get base URL for frame access
    const getBaseUrl = () => {
        return `${window.location.protocol}//${window.location.host}`;
    };

    // Copy URL to clipboard
    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            showSnackbar("URL copied to clipboard", "success");
        } catch (err) {
            showSnackbar("Failed to copy URL", "error");
        }
    };

    // Extract sensor tags from template JSON
    const extractSensorTagsFromTemplate = (layoutId: number): SensorTag[] => {
        const layout = availableLayouts.find(l => String(l.id) === String(layoutId));
        if (!layout || !layout.jsonFrameElements) {
            return [];
        }

        try {
            const elements: FrameElement[] = JSON.parse(layout.jsonFrameElements);
            const sensorElements = elements.filter(element =>
                element.type === 'sensor' &&
                element.properties?.sensorTag
            );

            return sensorElements.map(element => {
                const sensorTag = element.properties.sensorTag!;
                const isConnected = isSensorTagMapped(sensorTag);

                return {
                    sensorTag: sensorTag,
                    placeholderSensorLabel: element.properties.placeholderSensorLabel || 'Unknown',
                    showLabel: element.properties.showLabel ?? false,
                    showUnit: element.properties.showUnit ?? false,
                    placeholderValue: element.properties.placeholderValue || '',
                    placeholderUnit: element.properties.placeholderUnit || '',
                    isConnected: isConnected
                };
            });
        } catch (error) {
            console.error('Error parsing template JSON:', error);
            return [];
        }
    };

    // Calculate Rive inputs when layouts or sensors change - now for both frame modes
    const riveInputs = React.useMemo(() => {
        if (!isAnyFrameMode) return [];
        return extractRiveInputsFromTemplates(availableLayouts, availableSensors);
    }, [availableLayouts, availableSensors, isAnyFrameMode]);

    // Handle Rive input mapping changes
    const handleRiveInputMappingChange = async (inputKey: string, sensorTags: string[]) => {
        try {
            // Update local state immediately
            setRiveInputMappings(prev => ({
                ...prev,
                [inputKey]: sensorTags
            }));

            showSnackbar(
                `Updated mapping for ${inputKey}: ${sensorTags.length ? sensorTags.join(', ') : 'cleared'}`,
                "success"
            );

        } catch (error) {
            console.error('Error updating Rive input mapping:', error);
            showSnackbar('Failed to update Rive input mapping', 'error');
        }
    };

    // Fetch screen layouts (legacy)
    const fetchScreenLayouts = async () => {
        try {
            setLoadingState(prev => ({ ...prev, screenLayouts: true }));
            const response = await fetch('/api/layouts');

            if (!response.ok) {
                throw new Error(`Failed to fetch screen layouts: ${response.status}`);
            }

            const data = await response.json();
            setScreenLayouts(data);
        } catch (error) {
            console.error("Error fetching screen layouts:", error);
            showSnackbar("Failed to load screen layouts", "error");
        } finally {
            setLoadingState(prev => ({ ...prev, screenLayouts: false }));
        }
    };

    // Fetch frame layouts
    const fetchFrameLayouts = async () => {
        try {
            setLoadingState(prev => ({ ...prev, frameLayouts: true }));
            const response = await fetch('/api/frameengine');

            if (!response.ok) {
                throw new Error(`Failed to fetch frame layouts: ${response.status}`);
            }

            const data = await response.json();
            console.log('Debug - Frame layouts from API:', data);
            setFrameLayouts(data);
        } catch (error) {
            console.error("Error fetching frame layouts:", error);
            showSnackbar("Failed to load frame layouts", "error");
        } finally {
            setLoadingState(prev => ({ ...prev, frameLayouts: false }));
        }
    };

    // Fetch screen configurations for a specific device link
    const fetchScreenConfigs = async (junctionId: number, linkId: number) => {
        try {
            setLoadingState(prev => ({ ...prev, [`configs-${linkId}`]: true }));

            const response = await fetch(`/api/junctions/${junctionId}/links/device-links/${linkId}/screen-layouts`);

            if (response.ok) {
                const data = await response.json();

                // Store device screens from this response
                if (data.deviceScreens && data.deviceScreens.length > 0) {
                    const deviceId = data.deviceScreens[0].deviceId;
                    setDeviceScreens(prev => ({
                        ...prev,
                        [deviceId]: data.deviceScreens
                    }));
                }

                // Process screen configurations
                const configs = data.screenLayoutOverrides || [];
                const newConfigs = { ...screenConfigs };

                configs.forEach((config: any) => {
                    const screenId = config.deviceScreenId;
                    const key = `${linkId}-${screenId}`;
                    newConfigs[key] = {
                        id: config.id,
                        junctionId: config.junctionId,
                        deviceScreenId: config.deviceScreenId,
                        screenLayoutId: config.screenLayoutId,
                        frameLayoutId: config.frameLayoutId,
                        targetPollRate: config.targetPollRate,
                        onlySendIfChanged: config.onlySendIfChanged ?? true,
                        enableUrlAccess: config.enableUrlAccess ?? false,
                        urlPath: config.urlPath,
                        lastRequested: config.lastRequested
                    };
                });

                setScreenConfigs(newConfigs);
            } else {
                console.error(`Failed to fetch screen configurations: ${response.status}`);
            }
        } catch (error) {
            console.error(`Error fetching screen configurations for link ${linkId}:`, error);
        } finally {
            setLoadingState(prev => ({ ...prev, [`configs-${linkId}`]: false }));
        }
    };

    // Load data on component mount
    useEffect(() => {
        fetchScreenLayouts();
        fetchFrameLayouts();

        targetDeviceLinks.forEach(link => {
            if (link.linkId) {
                fetchScreenConfigs(junctionId, link.linkId);
            }
        });
    }, [targetDeviceLinks.map(link => `${link.id}-${link.linkId}`).join(','), junction?.renderingMode]);

    // Handle layout change
    const handleLayoutChange = async (linkId: number, screenId: number, layoutId: number | null, defaultLayoutId: number | null) => {
        const key = `${linkId}-${screenId}`;
        try {
            setLoadingState(prev => ({ ...prev, [key]: true }));

            const existingConfig = screenConfigs[key];

            // Remove existing configuration if it exists
            if (existingConfig && existingConfig.id) {
                try {
                    const deleteResponse = await fetch(`/api/junctions/${junctionId}/links/device-links/${linkId}/screen-layouts/${existingConfig.id}`, {
                        method: "DELETE"
                    });

                    if (!deleteResponse.ok) {
                        console.warn(`Warning: Failed to remove existing configuration: ${deleteResponse.status}`);
                    }

                    // Remove from local state
                    const newConfigs = { ...screenConfigs };
                    delete newConfigs[key];
                    setScreenConfigs(newConfigs);
                } catch (deleteError) {
                    console.warn("Warning: Error removing existing configuration:", deleteError);
                }
            }

            // If setting to default/null, we're done
            if (layoutId === defaultLayoutId || layoutId === null) {
                showSnackbar("Reverted to default layout", "success");
                return;
            }

            // Create new configuration
            const payload: any = {
                junctionId,
                deviceScreenId: screenId,
                targetPollRate: existingConfig?.targetPollRate,
                onlySendIfChanged: existingConfig?.onlySendIfChanged ?? true,
                enableUrlAccess: existingConfig?.enableUrlAccess ?? false,
                urlPath: existingConfig?.urlPath
            };

            // Set the appropriate layout ID based on rendering mode
            if (isAnyFrameMode) {
                payload.frameLayoutId = layoutId;
            } else {
                payload.screenLayoutId = layoutId;
            }

            const response = await fetch(`/api/junctions/${junctionId}/links/device-links/${linkId}/screen-layouts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Failed to save layout configuration: ${response.status}`);
            }

            const data = await response.json();

            // Update state with new configuration
            setScreenConfigs(prev => ({
                ...prev,
                [key]: {
                    id: data.id,
                    junctionId: data.junctionId,
                    deviceScreenId: screenId,
                    screenLayoutId: data.screenLayoutId,
                    frameLayoutId: data.frameLayoutId,
                    targetPollRate: data.targetPollRate,
                    onlySendIfChanged: data.onlySendIfChanged ?? true,
                    enableUrlAccess: data.enableUrlAccess ?? false,
                    urlPath: data.urlPath,
                    lastRequested: data.lastRequested
                }
            }));

            const modeDescription = renderModeDisplayNames[renderingMode] || renderingMode;
            showSnackbar(`${modeDescription} layout configuration saved successfully`, "success");
        } catch (error) {
            console.error("Error managing layout configuration:", error);
            const modeDescription = renderModeDisplayNames[renderingMode] || renderingMode;
            showSnackbar(`Failed to save ${modeDescription} layout configuration`, "error");
        } finally {
            setLoadingState(prev => ({ ...prev, [key]: false }));
        }
    };

    // Handle URL access toggle
    const handleUrlAccessToggle = async (linkId: number, screenId: number) => {
        const key = `${linkId}-${screenId}`;

        try {
            const existingConfig = screenConfigs[key];

            if (!existingConfig || !existingConfig.id) {
                showSnackbar("Please assign a layout first before enabling URL access", "warning");
                return;
            }

            const newValue = !existingConfig.enableUrlAccess;
            let newUrlPath = existingConfig.urlPath;

            // Generate URL path if enabling and none exists
            if (newValue && !newUrlPath) {
                newUrlPath = `junction-${junctionId}-link-${linkId}-screen-${screenId}.png`;
            }

            const payload = {
                junctionId,
                deviceScreenId: screenId,
                screenLayoutId: existingConfig.screenLayoutId,
                frameLayoutId: existingConfig.frameLayoutId,
                targetPollRate: existingConfig.targetPollRate,
                onlySendIfChanged: existingConfig.onlySendIfChanged,
                enableUrlAccess: newValue,
                urlPath: newUrlPath
            };

            const response = await fetch(`/api/junctions/${junctionId}/links/device-links/${linkId}/screen-layouts/${existingConfig.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Failed to update URL access: ${response.status}`);
            }

            // Update local state
            setScreenConfigs(prev => ({
                ...prev,
                [key]: {
                    ...existingConfig,
                    enableUrlAccess: newValue,
                    urlPath: newUrlPath
                }
            }));

            showSnackbar(`URL access ${newValue ? 'enabled' : 'disabled'} successfully`, "success");

        } catch (error) {
            console.error("Error updating URL access:", error);
            showSnackbar("Failed to update URL access", "error");
        }
    };

    // Handle poll rate change
    const handlePollRateChange = async (linkId: number, screenId: number, pollRate: string) => {
        const key = `${linkId}-${screenId}`;
        const numericRate = pollRate === "" ? undefined : parseInt(pollRate, 10);

        try {
            const existingConfig = screenConfigs[key];

            if (!existingConfig || !existingConfig.id) {
                showSnackbar("Please assign a layout first before setting poll rate", "warning");
                return;
            }

            const payload = {
                junctionId,
                deviceScreenId: screenId,
                screenLayoutId: existingConfig.screenLayoutId,
                frameLayoutId: existingConfig.frameLayoutId,
                targetPollRate: numericRate,
                onlySendIfChanged: existingConfig.onlySendIfChanged,
                enableUrlAccess: existingConfig.enableUrlAccess,
                urlPath: existingConfig.urlPath
            };

            const response = await fetch(`/api/junctions/${junctionId}/links/device-links/${linkId}/screen-layouts/${existingConfig.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Failed to update poll rate: ${response.status}`);
            }

            // Update local state
            setScreenConfigs(prev => ({
                ...prev,
                [key]: {
                    ...existingConfig,
                    targetPollRate: numericRate
                }
            }));

        } catch (error) {
            console.error("Error updating poll rate:", error);
            showSnackbar("Failed to update poll rate", "error");
        }
    };

    // Handle "only send if changed" toggle
    const handleOnlySendIfChangedToggle = async (linkId: number, screenId: number) => {
        const key = `${linkId}-${screenId}`;

        try {
            const existingConfig = screenConfigs[key];

            if (!existingConfig || !existingConfig.id) {
                showSnackbar("Please assign a layout first before changing send options", "warning");
                return;
            }

            const newValue = !existingConfig.onlySendIfChanged;

            const payload = {
                junctionId,
                deviceScreenId: screenId,
                screenLayoutId: existingConfig.screenLayoutId,
                frameLayoutId: existingConfig.frameLayoutId,
                targetPollRate: existingConfig.targetPollRate,
                onlySendIfChanged: newValue,
                enableUrlAccess: existingConfig.enableUrlAccess,
                urlPath: existingConfig.urlPath
            };

            const response = await fetch(`/api/junctions/${junctionId}/links/device-links/${linkId}/screen-layouts/${existingConfig.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Failed to update send option: ${response.status}`);
            }

            // Update local state
            setScreenConfigs(prev => ({
                ...prev,
                [key]: {
                    ...existingConfig,
                    onlySendIfChanged: newValue
                }
            }));

        } catch (error) {
            console.error("Error updating send option:", error);
            showSnackbar("Failed to update send option", "error");
        }
    };

    // Handle rendering mode change
    const handleRenderingModeChange = async (newMode: string) => {
        try {
            setSavingRenderingMode(true);

            const response = await fetch(`/api/junctions/${junctionId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...junction,
                    renderingMode: newMode
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to update rendering mode: ${response.status}`);
            }

            // Update local junction state
            const updatedJunction = { ...junction, renderingMode: newMode };

            // Call parent callback if provided
            if (onJunctionUpdate) {
                onJunctionUpdate(updatedJunction);
            }

            const modeLabel = renderModeDisplayNames[newMode] || newMode;
            showSnackbar(`Switched to ${modeLabel} successfully`, "success");

            // Refresh screen configurations since they may be different for the new mode
            targetDeviceLinks.forEach(link => {
                if (link.linkId) {
                    fetchScreenConfigs(junctionId, link.linkId);
                }
            });

        } catch (error) {
            console.error("Error updating rendering mode:", error);
            showSnackbar("Failed to update rendering mode", "error");
        } finally {
            setSavingRenderingMode(false);
        }
    };

    // Get layout name by ID
    const getLayoutName = (layoutId: number) => {
        const layout = availableLayouts.find(l => l.id === layoutId);
        return layout ? layout.displayName : "Unknown Layout";
    };

    // Get current layout ID (configuration or default)
    const getCurrentLayoutId = (screenId: number, defaultLayoutId: number | null, linkId: number) => {
        const key = `${linkId}-${screenId}`;
        const config = screenConfigs[key];

        if (config) {
            return isAnyFrameMode ? config.frameLayoutId : config.screenLayoutId;
        }

        return defaultLayoutId;
    };

    // Generate frame URL for display (only relevant for pre-rendered frames)
    const generateFrameUrl = (linkId: number, screenId: number) => {
        const key = `${linkId}-${screenId}`;
        const config = screenConfigs[key];

        if (!config?.enableUrlAccess || !config.urlPath) {
            return "";
        }

        return `${getBaseUrl()}/frames/${config.urlPath}`;
    };

    // Render sensor tags table
    const renderSensorTagsTable = (sensorTags: SensorTag[], layoutName: string) => {
        if (sensorTags.length === 0) {
            return (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2, fontStyle: 'italic' }}>
                    No sensor tags found in this template
                </Typography>
            );
        }

        return (
            <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                    Sensor Tags in "{layoutName}":
                </Typography>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ ...headerStyle, fontSize: '0.75rem' }}>Sensor Tag</TableCell>
                            <TableCell sx={{ ...headerStyle, fontSize: '0.75rem' }}>Status</TableCell>
                            <TableCell sx={{ ...headerStyle, fontSize: '0.75rem' }}>Show Label</TableCell>
                            <TableCell sx={{ ...headerStyle, fontSize: '0.75rem' }}>Show Units</TableCell>
                            <TableCell sx={{ ...headerStyle, fontSize: '0.75rem' }}>Template Example</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {sensorTags.map((sensorTag, index) => (
                            <TableRow key={`${sensorTag.sensorTag}-${index}`} hover>
                                <TableCell sx={{ ...cellStyle, fontSize: '0.8rem' }}>
                                    <Box display="flex" alignItems="center">
                                        <SensorsIcon fontSize="small" sx={{ mr: 1, color: 'primary.main' }} />
                                        <Typography variant="body2" fontWeight="medium">
                                            {sensorTag.sensorTag}
                                        </Typography>
                                    </Box>
                                </TableCell>
                                <TableCell sx={{ ...cellStyle, fontSize: '0.8rem' }}>
                                    <Chip
                                        size="small"
                                        label={sensorTag.isConnected ? "Mapped" : "Not Mapped"}
                                        color={sensorTag.isConnected ? "success" : "error"}
                                        icon={sensorTag.isConnected ? <CheckCircleIcon /> : <CancelIcon />}
                                        variant="outlined"
                                    />
                                </TableCell>
                                <TableCell sx={{ ...cellStyle, fontSize: '0.8rem' }}>
                                    <Chip
                                        size="small"
                                        label={sensorTag.showLabel ? "Yes" : "No"}
                                        color={sensorTag.showLabel ? "primary" : "default"}
                                        icon={<LabelIcon />}
                                        variant="outlined"
                                    />
                                </TableCell>
                                <TableCell sx={{ ...cellStyle, fontSize: '0.8rem' }}>
                                    <Chip
                                        size="small"
                                        label={sensorTag.showUnit ? "Yes" : "No"}
                                        color={sensorTag.showUnit ? "primary" : "default"}
                                        variant="outlined"
                                    />
                                </TableCell>
                                <TableCell sx={{ ...cellStyle, fontSize: '0.8rem' }}>
                                    <Typography variant="body2">
                                        {/* Show label if showLabel is true */}
                                        {sensorTag.showLabel && sensorTag.placeholderSensorLabel && (
                                            <span style={{ marginRight: '4px' }}>
                                                {sensorTag.placeholderSensorLabel}
                                            </span>
                                        )}

                                        {/* Always show the value */}
                                        <span>
                                            {sensorTag.placeholderValue}
                                        </span>

                                        {/* Show unit if showUnit is true */}
                                        {sensorTag.showUnit && sensorTag.placeholderUnit && (
                                            <span style={{ color: '#666', marginLeft: '2px' }}>
                                                {sensorTag.placeholderUnit}
                                            </span>
                                        )}
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Box>
        );
    };

    if (loading || loadingState.screenLayouts || loadingState.frameLayouts) {
        return (
            <Box display="flex" justifyContent="center" my={4}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Paper elevation={2} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
            {/* Rendering Mode Configuration Card */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Typography variant="subtitle1" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <SettingsIcon />
                        Rendering Mode Configuration
                    </Typography>

                    <Box display="flex" flexDirection={{ xs: 'column', sm: 'row' }} gap={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
                        <FormControl size="small" sx={{ minWidth: 200 }}>
                            <InputLabel>Rendering Mode</InputLabel>
                            <Select
                                value={renderingMode}
                                label="Rendering Mode"
                                onChange={(e) => handleRenderingModeChange(e.target.value)}
                                disabled={savingRenderingMode || loading}
                            >
                                <MenuItem value="Payload">Data Payloads</MenuItem>
                                <MenuItem value="Blit">Pre-rendered Frames</MenuItem>
                                <MenuItem value="Composite">Frame Assembly</MenuItem>
                            </Select>
                        </FormControl>
                        <Chip
                            label={`${renderModeDisplayNames[renderingMode] || renderingMode} Active`}
                            color={isAnyFrameMode ? "primary" : "default"}
                            size="small"
                            icon={<ImageIcon />}
                        />

                        {savingRenderingMode && <CircularProgress size={20} />}
                    </Box>

                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                        {isBlitMode ? (
                            <>
                                <strong>Pre-rendered Frames:</strong> Uses the FrameEngine to render complete images and push per-frame. The receiving device should handle only the displaying of these final images.
                            </>
                        ) : isCompositeMode ? (
                            <>
                                <strong>Frame Assembly:</strong> Uses Rive state machines and animations mapped directly to sensors. The receiving device interprets Rive instructions rather than raw frames or payloads, enabling dynamic, vector-based rendering.
                            </>
                        ) : (
                            <>
                                <strong>Data Payloads:</strong> Uses the Payload system to send raw data payloads to target devices using legacy screen layouts. The receiving device should handle rendering/display logic.
                            </>
                        )}
                    </Typography>

                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                        <strong>Target Poll Rate (ms):</strong> If you want the target device to "request" new data, instead of the backend sending new payloads at the send rate frequency, enter that desired frequency here.
                    </Typography>
                </CardContent>
            </Card>

            {/* Screen Configurations */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" sx={{
                    display: 'flex',
                    alignItems: 'center'
                }}>
                    {isAnyFrameMode ? <ImageIcon sx={{ mr: 1 }} /> : <ScreenshotIcon sx={{ mr: 1 }} />}
                    {isCompositeMode
                        ? "Frame Assembly Configurations"
                        : (isBlitMode ? "Pre-rendered Frame Configurations" : "Screen Layout Overrides")}
                </Typography>
            </Box>

            {targetDeviceLinks.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                    No target devices available. Add devices as targets to configure their {isAnyFrameMode ? 'frame layouts' : 'screen layouts'}.
                </Typography>
            ) : (
                <Box>
                    {targetDeviceLinks.map(link => {
                        const deviceId = link.id;
                        const linkId = link.linkId;
                        const isLoadingDevice = loadingState[`configs-${linkId}`] || false;
                        const screens = deviceScreens[deviceId] || [];

                        return (
                            <Paper
                                key={`device-screens-${linkId}`}
                                variant="outlined"
                                sx={{ mb: 2, p: { xs: 1, sm: 2 } }}
                            >
                                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} sx={{ flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 1, sm: 0 } }}>
                                    <Typography variant="subtitle1" sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        fontSize: { xs: '0.9rem', sm: '1rem' }
                                    }}>
                                        <DevicesIcon fontSize="small" sx={{ mr: 1, color: "primary.main" }} />
                                        {link.name}
                                    </Typography>
                                </Box>

                                {isLoadingDevice ? (
                                    <Box display="flex" justifyContent="center" my={2}>
                                        <CircularProgress size={24} />
                                    </Box>
                                ) : screens.length === 0 ? (
                                    <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                                        No screens available for this device.
                                    </Typography>
                                ) : (
                                    <Box sx={{ overflowX: 'auto' }}>
                                        <Table size="small" sx={{ minWidth: { xs: 600, sm: 'auto' } }}>
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell sx={{ ...headerStyle, minWidth: { xs: 120, sm: 'auto' } }}>Screen</TableCell>
                                                    <TableCell sx={{ ...headerStyle, minWidth: { xs: 200, sm: 'auto' } }}>
                                                        {isCompositeMode ? "Frame Layout" : (isBlitMode ? "Frame Layout" : "Screen Layout")}
                                                    </TableCell>
                                                    {!isCompositeMode && (
                                                        <TableCell sx={{ ...headerStyle, minWidth: { xs: 100, sm: 'auto' } }}>Target Poll Rate (ms)</TableCell>
                                                    )}
                                                    {!isCompositeMode && (
                                                        <TableCell sx={{ ...headerStyle, minWidth: { xs: 120, sm: 'auto' } }}>Only Send If Data Changed</TableCell>
                                                    )}
                                                    {isBlitMode && (
                                                        <TableCell sx={{ ...headerStyle, minWidth: { xs: 150, sm: 'auto' } }}>External URL Access</TableCell>
                                                    )}
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {screens.map((screen: any) => {
                                                    const screenId = screen.id;
                                                    const key = `${linkId}-${screenId}`;
                                                    const defaultLayoutId = screen.screenLayoutId;
                                                    const currentLayoutId = getCurrentLayoutId(screenId, defaultLayoutId, linkId);
                                                    const config = screenConfigs[key];
                                                    const isConfigured = Boolean(config);
                                                    const isLoading = loadingState[key] || false;
                                                    const frameUrl = generateFrameUrl(linkId, screenId);

                                                    // Extract sensor tags if a layout is selected
                                                    const sensorTags = currentLayoutId && isAnyFrameMode
                                                        ? extractSensorTagsFromTemplate(currentLayoutId)
                                                        : [];

                                                    const selectedLayout = currentLayoutId
                                                        ? availableLayouts.find(l => String(l.id) === String(currentLayoutId))
                                                        : null;

                                                    // Debug logging
                                                    if (currentLayoutId && isAnyFrameMode) {
                                                        console.log('Debug - Layout ID:', currentLayoutId);
                                                        console.log('Debug - Available Layouts:', availableLayouts);
                                                        console.log('Debug - Selected Layout:', selectedLayout);
                                                        console.log('Debug - Sensor Tags:', sensorTags);
                                                        console.log('Debug - JsonFrameElements:', selectedLayout?.jsonFrameElements);
                                                    }

                                                    return (
                                                        <React.Fragment key={`screen-${screenId}`}>
                                                            <TableRow hover>
                                                                <TableCell sx={cellStyle}>
                                                                    <Typography variant="body2" fontWeight="medium">
                                                                        {screen.displayName || screen.screenKey}
                                                                    </Typography>
                                                                </TableCell>
                                                                <TableCell sx={cellStyle}>
                                                                    <Box display="flex" alignItems="center">
                                                                        <FormControl fullWidth size="small">
                                                                            <Select
                                                                                value={String(currentLayoutId || "")}
                                                                                onChange={(e: SelectChangeEvent) => {
                                                                                    const newLayoutId = e.target.value === "" ? null : parseInt(e.target.value, 10);
                                                                                    handleLayoutChange(linkId, screenId, newLayoutId, defaultLayoutId);
                                                                                }}
                                                                                displayEmpty
                                                                                disabled={isLoading}
                                                                            >
                                                                                <MenuItem value="">
                                                                                    <em>Use default</em>
                                                                                </MenuItem>
                                                                                {availableLayouts.map((layout: any) => (
                                                                                    <MenuItem
                                                                                        key={`layout-${layout.id}`}
                                                                                        value={layout.id.toString()}
                                                                                    >
                                                                                        <Box>
                                                                                            <Typography variant="body2">
                                                                                                {layout.displayName}
                                                                                            </Typography>
                                                                                            <Typography variant="caption" color="text.secondary">
                                                                                                {layout.layoutType}
                                                                                                {isAnyFrameMode && layout.isTemplate && " (Template)"}
                                                                                            </Typography>
                                                                                        </Box>
                                                                                    </MenuItem>
                                                                                ))}
                                                                            </Select>
                                                                        </FormControl>
                                                                        {isConfigured && (
                                                                            <Chip
                                                                                size="small"
                                                                                label="Configured"
                                                                                color="primary"
                                                                                variant="outlined"
                                                                                sx={{ ml: 2 }}
                                                                            />
                                                                        )}
                                                                        {isLoading && (
                                                                            <CircularProgress size={16} sx={{ ml: 2 }} />
                                                                        )}
                                                                    </Box>
                                                                </TableCell>
                                                                {!isCompositeMode && (
                                                                    <TableCell sx={cellStyle}>
                                                                        <TextField
                                                                            type="number"
                                                                            size="small"
                                                                            value={config?.targetPollRate || ""}
                                                                            onChange={(e) => handlePollRateChange(linkId, screenId, e.target.value)}
                                                                            placeholder="Optional"
                                                                            disabled={isLoading}
                                                                            sx={{ minWidth: 100 }}
                                                                        />
                                                                    </TableCell>
                                                                )}
                                                                {!isCompositeMode && (
                                                                    <TableCell sx={cellStyle}>
                                                                        <FormControlLabel
                                                                            control={
                                                                                <Switch
                                                                                    checked={config?.onlySendIfChanged ?? true}
                                                                                    onChange={() => handleOnlySendIfChangedToggle(linkId, screenId)}
                                                                                    disabled={isLoading}
                                                                                    size="small"
                                                                                />
                                                                            }
                                                                            label=""
                                                                        />
                                                                    </TableCell>
                                                                )}
                                                                {isBlitMode && (
                                                                    <TableCell sx={cellStyle}>
                                                                        <Box>
                                                                            <FormControlLabel
                                                                                control={
                                                                                    <Switch
                                                                                        checked={config?.enableUrlAccess ?? false}
                                                                                        onChange={() => handleUrlAccessToggle(linkId, screenId)}
                                                                                        disabled={isLoading}
                                                                                        size="small"
                                                                                    />
                                                                                }
                                                                                label="Enable URL Access"
                                                                            />
                                                                            {config?.enableUrlAccess && frameUrl && (
                                                                                <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                                    <LinkIcon fontSize="small" color="primary" />
                                                                                    <Link
                                                                                        href={frameUrl}
                                                                                        target="_blank"
                                                                                        rel="noopener"
                                                                                        sx={{ fontSize: '0.75rem', wordBreak: 'break-all' }}
                                                                                    >
                                                                                        {frameUrl}
                                                                                    </Link>
                                                                                    <Tooltip title="Copy URL">
                                                                                        <IconButton
                                                                                            size="small"
                                                                                            onClick={() => copyToClipboard(frameUrl)}
                                                                                            sx={{ ml: 1 }}
                                                                                        >
                                                                                            <ContentCopyIcon fontSize="small" />
                                                                                        </IconButton>
                                                                                    </Tooltip>
                                                                                </Box>
                                                                            )}
                                                                        </Box>
                                                                    </TableCell>
                                                                )}
                                                            </TableRow>
                                                            {/* Sensor Tags Expansion Row */}
                                                            {sensorTags.length > 0 && isAnyFrameMode && (
                                                                <TableRow>
                                                                    <TableCell
                                                                        colSpan={isCompositeMode ? 2 : (isBlitMode ? 5 : 4)}
                                                                        sx={{ p: 0, border: 'none' }}
                                                                    >
                                                                        <Box sx={{ p: 2, backgroundColor: '#f8f9fa', border: '1px solid #e9ecef', borderRadius: 1 }}>
                                                                            {renderSensorTagsTable(sensorTags, selectedLayout?.displayName || 'Unknown Layout')}
                                                                        </Box>
                                                                    </TableCell>
                                                                </TableRow>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </Box>
                                )}
                            </Paper>
                        );
                    })}
                </Box>
            )}

            {/* Rive Input Mapping Section - show for both frame modes */}
            {isAnyFrameMode && (
                <Paper
                    variant="outlined"
                    sx={{ mb: 2, p: { xs: 1, sm: 2 } }}
                >
                    <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                        <SensorsIcon sx={{ mr: 1, color: 'primary.main' }} />
                        Rive Input Mappings
                    </Typography>

                    <Box sx={{ p: 2, backgroundColor: '#f8f9fa', border: '1px solid #e9ecef', borderRadius: 1 }}>
                        <RiveInputMappingSection
                            riveInputs={riveInputs}
                            availableSensors={availableSensors}
                            onInputMappingChange={handleRiveInputMappingChange}
                        />
                    </Box>
                </Paper>
            )}
        </Paper>
    );
};

export default DeviceScreenLayoutsCard;