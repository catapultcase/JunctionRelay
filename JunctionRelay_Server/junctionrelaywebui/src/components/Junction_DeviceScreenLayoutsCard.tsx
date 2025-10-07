import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
    [key: string]: any;
}

interface DeviceScreenLayoutsCardProps {
    junctionId: number;
    junction: any;
    deviceLinks: any[];
    loading: boolean;
    showSnackbar: (message: string, severity: "success" | "info" | "warning" | "error") => void;
    onJunctionUpdate?: (updatedJunction: any) => void;
    availableSensors: Sensor[];
    onRiveInputsUpdate?: (riveInputs: RiveInput[]) => void;
    onValidationUpdate?: (isValid: boolean, message: string) => void;
}

const headerStyle = {
    padding: '8px 16px',
    borderBottom: 2,
    borderColor: 'divider',
    fontWeight: 'bold',
    backgroundColor: 'action.hover'
};

const cellStyle = {
    padding: '6px 16px'
};

interface ScreenLayoutConfig {
    id?: number;
    junctionId?: number;
    deviceScreenId: number;
    screenLayoutId?: number;
    frameLayoutId?: number;
    targetPollRate?: number;
    onlySendIfChanged: boolean;
    enableUrlAccess?: boolean;
    urlPath?: string;
    lastRequested?: string;
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
    isConnected: boolean;
}

interface RiveInput {
    name: string;
    type: 'number' | 'boolean' | 'trigger' | 'string' | 'unknown';
    fullKey: string;
    currentValue?: any;
    mappedSensorTags: string[];
    isConfigured: boolean;
    elementType: 'input' | 'binding';
    machineName?: string;
    sourceLayoutId?: number;
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
    bindings: Array<{
        name: string;
        type: 'string' | 'number' | 'boolean';
        currentValue?: any;
    }>;
    lastUpdate: string;
    metadata: {
        totalInputs: number;
        totalBindings: number;
        inputTypeBreakdown: Record<string, number>;
        bindingTypeBreakdown: Record<string, number>;
    };
    globalInputMappings: Record<string, string[]>;
}

const getRenderModeDisplayName = (mode: string): string => {
    const option = renderingModeOptions.find(opt => opt.value === mode);
    return option?.name || mode;
};

const renderingModeOptions = [
    { value: "Payload", name: "Data Payloads", desc: "Send raw data payloads to target devices" },
    { value: "Blit", name: "FrameEngine: Pre-rendered Frames", desc: "Render complete images and push per-frame" },
    { value: "Composite", name: "FrameEngine: Frame Reassembly", desc: "Reassemble complete frames at target" }
];

const supportsFrameEngine = (junctionType: string): boolean => {
    return [
        "COM Junction",
        "HTTP Junction",
        "Virtual Junction",
        "WebSocket Junction"
    ].includes(junctionType);
};

const extractRiveInputsFromTemplates = (availableLayouts: any[], availableSensors: Sensor[]): RiveInput[] => {
    const allRiveInputs: RiveInput[] = [];
    const inputMap = new Map<string, RiveInput>();

    availableLayouts.forEach(layout => {
        if (!layout.jsonFrameConfig) {
            return;
        }

        try {
            const frameConfig = JSON.parse(layout.jsonFrameConfig);
            const riveConfig = frameConfig.frameConfig?.rive;

            if (!riveConfig?.discovery) {
                return;
            }

            const discovery: DiscoveredRiveData = riveConfig.discovery;

            if (discovery.machines && Array.isArray(discovery.machines)) {
                discovery.machines.forEach((machine) => {
                    if (machine.inputs && Array.isArray(machine.inputs)) {
                        machine.inputs.forEach((input) => {
                            const fullKey = `${machine.name}.${input.name}`;
                            const uniqueKey = `${layout.id}-${fullKey}`;

                            if (!inputMap.has(uniqueKey)) {
                                const mappedSensors = availableSensors.filter(sensor => {
                                    if (!sensor.IsSelected) return false;
                                    const sensorTags = sensor.sensorTag.split(',').map(tag => tag.trim());
                                    return sensorTags.some(tag =>
                                        tag === input.name ||
                                        tag === fullKey
                                    );
                                });

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
                                    name: input.name,
                                    type: input.type,
                                    fullKey,
                                    currentValue: input.currentValue,
                                    mappedSensorTags: mappedSensorTags,
                                    isConfigured: mappedSensorTags.length > 0,
                                    elementType: 'input',
                                    machineName: machine.name,
                                    sourceLayoutId: layout.id
                                };

                                inputMap.set(uniqueKey, riveInput);
                                allRiveInputs.push(riveInput);
                            }
                        });
                    }
                });
            }

            if (discovery.bindings && Array.isArray(discovery.bindings)) {
                discovery.bindings.forEach((binding) => {
                    const bindingKey = binding.name;
                    const uniqueKey = `${layout.id}-${bindingKey}`;

                    if (!inputMap.has(uniqueKey)) {
                        const mappedSensors = availableSensors.filter(sensor => {
                            if (!sensor.IsSelected) return false;
                            const sensorTags = sensor.sensorTag.split(',').map(tag => tag.trim());
                            return sensorTags.some(tag => tag === binding.name);
                        });

                        const mappedSensorTags: string[] = [];
                        mappedSensors.forEach(sensor => {
                            const sensorTags = sensor.sensorTag.split(',').map(tag => tag.trim());
                            sensorTags.forEach(tag => {
                                if (tag === binding.name) {
                                    if (!mappedSensorTags.includes(tag)) {
                                        mappedSensorTags.push(tag);
                                    }
                                }
                            });
                        });

                        const riveInput: RiveInput = {
                            name: binding.name,
                            type: binding.type || 'string',
                            fullKey: bindingKey,
                            currentValue: binding.currentValue,
                            mappedSensorTags: mappedSensorTags,
                            isConfigured: mappedSensorTags.length > 0,
                            elementType: 'binding',
                            sourceLayoutId: layout.id
                        };

                        inputMap.set(uniqueKey, riveInput);
                        allRiveInputs.push(riveInput);
                    }
                });
            }

        } catch (error) {
            console.error(`Error parsing JsonFrameConfig for layout ${layout.id}:`, error);
        }
    });

    return allRiveInputs;
};

const RiveInputsForLayout: React.FC<{
    layoutId: number;
    layoutName: string;
    riveInputs: RiveInput[];
    availableSensors: Sensor[];
    onInputMappingChange: (inputKey: string, sensorTags: string[]) => void;
}> = ({ layoutId, layoutName, riveInputs, availableSensors, onInputMappingChange }) => {

    const layoutInputs = riveInputs.filter(input => {
        const inputLayoutId = Number(input.sourceLayoutId);
        const targetLayoutId = Number(layoutId);
        return inputLayoutId === targetLayoutId;
    });

    if (layoutInputs.length === 0) {
        return (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, fontStyle: 'italic' }}>
                No Rive inputs found in "{layoutName}"
            </Typography>
        );
    }

    const inputs = layoutInputs.filter(input => input.elementType === 'input');
    const bindings = layoutInputs.filter(input => input.elementType === 'binding');

    const renderInputTable = (elements: RiveInput[], title: string) => {
        if (elements.length === 0) return null;

        const groupedElements = elements.reduce((acc, element) => {
            const key = element.machineName || 'Bindings';
            if (!acc[key]) acc[key] = [];
            acc[key].push(element);
            return acc;
        }, {} as Record<string, RiveInput[]>);

        return (
            <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                    {title}:
                </Typography>
                {Object.entries(groupedElements).map(([groupName, groupElements]) => (
                    <Box key={groupName} sx={{ mb: 2 }}>
                        {groupName !== 'Bindings' && (
                            <Typography variant="body2" sx={{ mb: 1, fontStyle: 'italic', color: 'text.secondary' }}>
                                {groupName}
                            </Typography>
                        )}
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ ...headerStyle, fontSize: '0.75rem' }}>Name</TableCell>
                                    <TableCell sx={{ ...headerStyle, fontSize: '0.75rem' }}>Status</TableCell>
                                    <TableCell sx={{ ...headerStyle, fontSize: '0.75rem' }}>Type</TableCell>
                                    <TableCell sx={{ ...headerStyle, fontSize: '0.75rem' }}>Default Value</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {groupElements.map((element) => (
                                    <TableRow
                                        key={`${element.elementType}-${element.fullKey}-${element.sourceLayoutId}`}
                                        hover
                                    >
                                        <TableCell sx={{ ...cellStyle, fontSize: '0.8rem' }}>
                                            <Box display="flex" alignItems="center">
                                                <SensorsIcon fontSize="small" sx={{ mr: 1, color: 'primary.main' }} />
                                                <Typography variant="body2" fontWeight="medium">
                                                    {element.name}
                                                </Typography>
                                            </Box>
                                        </TableCell>
                                        <TableCell sx={{ ...cellStyle, fontSize: '0.8rem' }}>
                                            <Chip
                                                size="small"
                                                label={element.isConfigured ? "Mapped" : "Not Mapped"}
                                                color={element.isConfigured ? "success" : "error"}
                                                icon={element.isConfigured ? <CheckCircleIcon /> : <CancelIcon />}
                                                variant="outlined"
                                            />
                                        </TableCell>
                                        <TableCell sx={{ ...cellStyle, fontSize: '0.8rem' }}>
                                            <Chip
                                                size="small"
                                                label={element.type}
                                                color={
                                                    element.type === 'number' ? 'primary' :
                                                        element.type === 'boolean' ? 'secondary' :
                                                            element.type === 'string' ? 'info' :
                                                                element.type === 'trigger' ? 'warning' : 'default'
                                                }
                                                variant="outlined"
                                            />
                                        </TableCell>
                                        <TableCell sx={{ ...cellStyle, fontSize: '0.8rem' }}>
                                            <Typography variant="body2" color="text.secondary">
                                                {element.currentValue !== undefined ? String(element.currentValue) : 'N/A'}
                                            </Typography>
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

    return (
        <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                <SensorsIcon sx={{ mr: 1, color: 'primary.main' }} />
                Rive Elements in "{layoutName}"
            </Typography>
            {renderInputTable(inputs, "State Machine Inputs")}
            {renderInputTable(bindings, "Text Bindings")}
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
    availableSensors,
    onRiveInputsUpdate,
    onValidationUpdate
}) => {
    const [deviceScreens, setDeviceScreens] = useState<{ [deviceId: number]: any[] }>({});
    const [screenLayouts, setScreenLayouts] = useState<any[]>([]);
    const [frameLayouts, setFrameLayouts] = useState<any[]>([]);
    const [screenConfigs, setScreenConfigs] = useState<{ [key: string]: ScreenLayoutConfig }>({});
    const [loadingState, setLoadingState] = useState<{ [key: string]: boolean }>({});
    const [savingRenderingMode, setSavingRenderingMode] = useState<boolean>(false);
    const [riveInputMappings, setRiveInputMappings] = useState<Record<string, string[]>>({});

    const renderingMode = junction?.renderingMode || 'Payload';
    const isPayloadMode = renderingMode === 'Payload';
    const isBlitMode = renderingMode === 'Blit';
    const isCompositeMode = renderingMode === 'Composite';
    const isAnyFrameMode = isBlitMode || isCompositeMode;

    const getAvailableRenderingModes = useCallback(() => {
        if (!junction?.type || !supportsFrameEngine(junction.type)) {
            return renderingModeOptions.filter(mode => mode.value === "Payload");
        }
        return renderingModeOptions;
    }, [junction?.type]);

    const getFilteredLayouts = useCallback(() => {
        if (isBlitMode || isCompositeMode) {
            return frameLayouts;
        } else {
            return screenLayouts;
        }
    }, [isBlitMode, isCompositeMode, frameLayouts, screenLayouts]);

    const availableLayouts = getFilteredLayouts();

    const targetDeviceLinks = useMemo(() =>
        deviceLinks.filter(link => link.type === "device" && link.role === "Target")
        , [deviceLinks]);

    const isSensorTagMapped = useCallback((sensorTag: string): boolean => {
        return availableSensors.some(sensor => {
            if (!sensor.IsSelected) return false;
            const sensorTags = sensor.sensorTag.split(',').map(tag => tag.trim());
            return sensorTags.includes(sensorTag);
        });
    }, [availableSensors]);

    const getBaseUrl = useCallback(() => {
        return `${window.location.protocol}//${window.location.host}`;
    }, []);

    const copyToClipboard = useCallback(async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            showSnackbar("URL copied to clipboard", "success");
        } catch (err) {
            showSnackbar("Failed to copy URL", "error");
        }
    }, [showSnackbar]);

    const extractSensorTagsFromTemplate = useCallback((layoutId: number): SensorTag[] => {
        const layout = availableLayouts.find(l => String(l.id) === String(layoutId));
        if (!layout || !layout.jsonFrameElements) {
            return [];
        }

        try {
            const elements: FrameElement[] = JSON.parse(layout.jsonFrameElements);
            const sensorTags: SensorTag[] = [];

            elements.forEach(element => {
                // Extract main sensor tag (for data display)
                if ((element.type === 'sensor' || element.type === 'ecg') && element.properties?.sensorTag) {
                    const sensorTag = element.properties.sensorTag;
                    const isConnected = isSensorTagMapped(sensorTag);

                    sensorTags.push({
                        sensorTag: sensorTag,
                        placeholderSensorLabel: element.properties.placeholderSensorLabel || 'Unknown',
                        showLabel: element.properties.showLabel ?? false,
                        showUnit: element.properties.showUnit ?? false,
                        placeholderValue: element.properties.placeholderValue || '',
                        placeholderUnit: element.properties.placeholderUnit || '',
                        isConnected: isConnected
                    });
                }

                // Extract visibility sensor tag (for visibility control) - for ALL element types
                if (element.properties?.visibilitySensorTag) {
                    const visibilityTag = element.properties.visibilitySensorTag;
                    const isConnected = isSensorTagMapped(visibilityTag);

                    // Only add if not already in the list
                    if (!sensorTags.find(st => st.sensorTag === visibilityTag)) {
                        sensorTags.push({
                            sensorTag: visibilityTag,
                            placeholderSensorLabel: `[Visibility Control for ${element.type}]`,
                            showLabel: false,
                            showUnit: false,
                            placeholderValue: 'true/false',
                            placeholderUnit: '',
                            isConnected: isConnected
                        });
                    }
                }
            });

            return sensorTags;
        } catch (error) {
            console.error('Error parsing template JSON:', error);
            return [];
        }
    }, [availableLayouts, isSensorTagMapped]);

    const getSelectedLayoutIds = useCallback((): number[] => {
        const selectedIds = new Set<number>();

        targetDeviceLinks.forEach(link => {
            const linkId = link.linkId;
            const deviceId = link.id;
            const screens = deviceScreens[deviceId] || [];

            screens.forEach(screen => {
                const screenId = screen.id;
                const key = `${linkId}-${screenId}`;
                const config = screenConfigs[key];

                let selectedLayoutId: number | null = null;

                if (config) {
                    const configLayoutId = isAnyFrameMode ? config.frameLayoutId : config.screenLayoutId;
                    selectedLayoutId = configLayoutId ?? null;
                } else {
                    selectedLayoutId = screen.screenLayoutId ?? null;
                }

                if (selectedLayoutId !== null) {
                    selectedIds.add(selectedLayoutId);
                }
            });
        });

        return Array.from(selectedIds);
    }, [targetDeviceLinks, deviceScreens, screenConfigs, isAnyFrameMode]);

    const sensorSelectionHash = useMemo(() => {
        return availableSensors
            .filter(s => s.IsSelected)
            .map(s => `${s.Id}-${s.sensorTag}`)
            .sort()
            .join(',');
    }, [availableSensors]);

    const riveInputs = useMemo(() => {
        if (!isAnyFrameMode) {
            return [];
        }

        const selectedLayoutIds = getSelectedLayoutIds();
        const selectedLayouts = availableLayouts.filter(layout => {
            const layoutIdAsNumber = parseInt(String(layout.id), 10);
            return selectedLayoutIds.includes(layoutIdAsNumber);
        });

        return extractRiveInputsFromTemplates(selectedLayouts, availableSensors);
    }, [
        isAnyFrameMode,
        availableLayouts.length,
        Object.keys(screenConfigs).join(','),
        Object.keys(deviceScreens).join(','),
        targetDeviceLinks.length,
        sensorSelectionHash,
        getSelectedLayoutIds
    ]);

    const previousRiveInputsRef = useRef<string>('');

    useEffect(() => {
        if (onRiveInputsUpdate) {
            const currentInputsHash = JSON.stringify(riveInputs.map(input => ({
                fullKey: input.fullKey,
                isConfigured: input.isConfigured,
                sourceLayoutId: input.sourceLayoutId
            })));

            if (currentInputsHash !== previousRiveInputsRef.current) {
                previousRiveInputsRef.current = currentInputsHash;
                onRiveInputsUpdate(riveInputs);
            }
        }
    }, [riveInputs, onRiveInputsUpdate]);

    // VALIDATION EFFECT - NEW
    useEffect(() => {
        if (!onValidationUpdate) return;

        const targetDevices = deviceLinks.filter(link => link.type === "device" && link.role === "Target");

        if (targetDevices.length === 0) {
            onValidationUpdate(true, "");
            return;
        }

        let hasUnassignedScreens = false;
        let unassignedCount = 0;

        for (const link of targetDevices) {
            const linkId = link.linkId;
            const deviceId = link.id;
            const screens = deviceScreens[deviceId] || [];

            for (const screen of screens) {
                const screenId = screen.id;
                const key = `${linkId}-${screenId}`;
                const config = screenConfigs[key];

                const layoutId = isAnyFrameMode
                    ? (config?.frameLayoutId ?? screen.screenLayoutId)
                    : (config?.screenLayoutId ?? screen.screenLayoutId);

                if (!layoutId) {
                    hasUnassignedScreens = true;
                    unassignedCount++;
                }
            }
        }

        if (hasUnassignedScreens) {
            onValidationUpdate(
                false,
                `${unassignedCount} screen${unassignedCount > 1 ? 's' : ''} need${unassignedCount === 1 ? 's' : ''} a layout assigned`
            );
        } else {
            onValidationUpdate(true, "");
        }
    }, [
        deviceLinks,
        deviceScreens,
        screenConfigs,
        isAnyFrameMode,
        onValidationUpdate
    ]);

    const handleRiveInputMappingChange = useCallback(async (inputKey: string, sensorTags: string[]) => {
        try {
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
    }, [showSnackbar]);

    const fetchScreenLayouts = useCallback(async () => {
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
    }, [showSnackbar]);

    const fetchFrameLayouts = useCallback(async () => {
        try {
            setLoadingState(prev => ({ ...prev, frameLayouts: true }));
            const response = await fetch('/api/frameengine');

            if (!response.ok) {
                throw new Error(`Failed to fetch frame layouts: ${response.status}`);
            }

            const data = await response.json();
            setFrameLayouts(data);
        } catch (error) {
            console.error("Error fetching frame layouts:", error);
            showSnackbar("Failed to load frame layouts", "error");
        } finally {
            setLoadingState(prev => ({ ...prev, frameLayouts: false }));
        }
    }, [showSnackbar]);

    const fetchScreenConfigs = useCallback(async (junctionId: number, linkId: number) => {
        try {
            setLoadingState(prev => ({ ...prev, [`configs-${linkId}`]: true }));

            const response = await fetch(`/api/junctions/${junctionId}/links/device-links/${linkId}/screen-layouts`);

            if (response.ok) {
                const data = await response.json();

                if (data.deviceScreens && data.deviceScreens.length > 0) {
                    const deviceId = data.deviceScreens[0].deviceId;
                    setDeviceScreens(prev => ({
                        ...prev,
                        [deviceId]: data.deviceScreens
                    }));
                }

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

                setScreenConfigs(prev => ({
                    ...prev,
                    ...newConfigs
                }));
            }
        } catch (error) {
            console.error(`Error fetching screen configurations for link ${linkId}:`, error);
        } finally {
            setLoadingState(prev => ({ ...prev, [`configs-${linkId}`]: false }));
        }
    }, [screenConfigs]);

    useEffect(() => {
        fetchScreenLayouts();
        fetchFrameLayouts();

        targetDeviceLinks.forEach(link => {
            if (link.linkId) {
                fetchScreenConfigs(junctionId, link.linkId);
            }
        });
    }, [targetDeviceLinks.map(link => `${link.id}-${link.linkId}`).join(','), junction?.renderingMode]);

    const handleLayoutChange = useCallback(async (linkId: number, screenId: number, layoutId: number | null, defaultLayoutId: number | null) => {
        const key = `${linkId}-${screenId}`;
        const existingConfig = screenConfigs[key];

        if (!existingConfig?.id) {
            showSnackbar("Screen layout configuration not found", "error");
            return;
        }

        try {
            setLoadingState(prev => ({ ...prev, [key]: true }));

            const currentEffectiveLayoutId = isAnyFrameMode ? existingConfig.frameLayoutId : existingConfig.screenLayoutId;

            if (currentEffectiveLayoutId === layoutId) {
                return;
            }

            const payload: any = {
                junctionId,
                deviceScreenId: screenId,
                targetPollRate: existingConfig.targetPollRate,
                onlySendIfChanged: existingConfig.onlySendIfChanged ?? true,
                enableUrlAccess: existingConfig.enableUrlAccess ?? false,
                urlPath: existingConfig.urlPath
            };

            if (isAnyFrameMode) {
                payload.frameLayoutId = layoutId;
            } else {
                payload.screenLayoutId = layoutId;
            }

            payload.id = existingConfig.id;
            payload.junctionId = existingConfig.junctionId;

            const response = await fetch(`/api/junctions/${junctionId}/links/device-links/${linkId}/screen-layouts/${existingConfig.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Failed to update layout configuration: ${response.status}`);
            }

            const data = { ...payload, id: existingConfig.id };

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

            const modeDescription = getRenderModeDisplayName(renderingMode);
            showSnackbar(`${modeDescription} layout configuration updated successfully`, "success");
        } catch (error) {
            console.error("Error updating layout configuration:", error);
            const modeDescription = getRenderModeDisplayName(renderingMode);
            showSnackbar(`Failed to update ${modeDescription} layout configuration`, "error");
        } finally {
            setLoadingState(prev => ({ ...prev, [key]: false }));
        }
    }, [screenConfigs, junctionId, showSnackbar, isAnyFrameMode, renderingMode]);

    const handleUrlAccessToggle = useCallback(async (linkId: number, screenId: number) => {
        const key = `${linkId}-${screenId}`;

        try {
            const existingConfig = screenConfigs[key];

            if (!existingConfig || !existingConfig.id) {
                showSnackbar("Please assign a layout first before enabling URL access", "warning");
                return;
            }

            const newValue = !existingConfig.enableUrlAccess;
            let newUrlPath = existingConfig.urlPath;

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
    }, [screenConfigs, junctionId, showSnackbar]);

    const handlePollRateChange = useCallback(async (linkId: number, screenId: number, pollRate: string) => {
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
    }, [screenConfigs, junctionId, showSnackbar]);

    const handleOnlySendIfChangedToggle = useCallback(async (linkId: number, screenId: number) => {
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
    }, [screenConfigs, junctionId, showSnackbar]);

    const handleRenderingModeChange = useCallback(async (newMode: string) => {
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

            const updatedJunction = { ...junction, renderingMode: newMode };

            if (onJunctionUpdate) {
                onJunctionUpdate(updatedJunction);
            }

            const modeLabel = getRenderModeDisplayName(newMode);
            showSnackbar(`Switched to ${modeLabel} successfully`, "success");
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
    }, [junction, junctionId, onJunctionUpdate, showSnackbar, targetDeviceLinks, fetchScreenConfigs]);

    const getLayoutName = useCallback((layoutId: number) => {
        const layout = availableLayouts.find(l => l.id === layoutId);
        return layout ? layout.displayName : "Unknown Layout";
    }, [availableLayouts]);

    const getCurrentLayoutId = useCallback((screenId: number, defaultLayoutId: number | null, linkId: number) => {
        const key = `${linkId}-${screenId}`;
        const config = screenConfigs[key];

        if (config) {
            const layoutId = isAnyFrameMode ? config.frameLayoutId : config.screenLayoutId;
            return layoutId;
        }

        return defaultLayoutId;
    }, [screenConfigs, isAnyFrameMode]);

    const generateFrameUrl = useCallback((linkId: number, screenId: number) => {
        const key = `${linkId}-${screenId}`;
        const config = screenConfigs[key];

        if (!config?.enableUrlAccess || !config.urlPath) {
            return "";
        }

        return `${getBaseUrl()}/frames/${config.urlPath}`;
    }, [screenConfigs, getBaseUrl]);

    const generateVirtualDisplayUrl = useCallback((linkId: number, screenId: number, deviceId: number) => {
        const virtualDeviceId = -(Math.abs(deviceId + 10000));
        return `${getBaseUrl()}/device/${virtualDeviceId}/virtual-screen`;
    }, [getBaseUrl]);

    const renderSensorTagsTable = useCallback((sensorTags: SensorTag[], layoutName: string) => {
        if (sensorTags.length === 0) {
            return (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2, fontStyle: 'italic' }}>
                    No SensorTags found in this template
                </Typography>
            );
        }

        return (
            <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                    SensorTags in "{layoutName}":
                </Typography>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ ...headerStyle, fontSize: '0.75rem' }}>SensorTag</TableCell>
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
                                        {sensorTag.showLabel && sensorTag.placeholderSensorLabel && (
                                            <span style={{ marginRight: '4px' }}>
                                                {sensorTag.placeholderSensorLabel}
                                            </span>
                                        )}
                                        <span>
                                            {sensorTag.placeholderValue}
                                        </span>
                                        {sensorTag.showUnit && sensorTag.placeholderUnit && (
                                            <span style={{ color: 'text.secondary', marginLeft: '2px' }}>
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
    }, []);

    if (loading || loadingState.screenLayouts || loadingState.frameLayouts) {
        return (
            <Box display="flex" justifyContent="center" my={4}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Paper elevation={2} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
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
                                disabled={savingRenderingMode || loading || !supportsFrameEngine(junction?.type || "")}
                            >
                                {getAvailableRenderingModes().map((mode) => (
                                    <MenuItem key={mode.value} value={mode.value}>
                                        <Box>
                                            <Typography variant="body2" fontWeight="medium">
                                                {mode.name}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {mode.desc}
                                            </Typography>
                                        </Box>
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <Chip
                            label={`${getRenderModeDisplayName(renderingMode)} Active`}
                            color={isAnyFrameMode ? "primary" : "default"}
                            size="small"
                            icon={<ImageIcon />}
                        />

                        {savingRenderingMode && <CircularProgress size={20} />}
                    </Box>

                    {!supportsFrameEngine(junction?.type || "") && (
                        <Typography variant="body2" color="warning.main" sx={{ mt: 2, fontStyle: 'italic' }}>
                            <strong>Note:</strong> This junction type ({junction?.type}) only supports Data Payloads mode.
                            FrameEngine modes (Pre-rendered Frames, Frame Assembly) are available for COM, HTTP, Virtual, and WebSocket junctions only.
                        </Typography>
                    )}

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

                                                    const sensorTags = currentLayoutId && isAnyFrameMode
                                                        ? extractSensorTagsFromTemplate(currentLayoutId)
                                                        : [];

                                                    const selectedLayout = currentLayoutId
                                                        ? availableLayouts.find(l => String(l.id) === String(currentLayoutId))
                                                        : null;

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
                                                                        <FormControl
                                                                            fullWidth
                                                                            size="small"
                                                                            error={!currentLayoutId}
                                                                            sx={{
                                                                                '& .MuiOutlinedInput-root': {
                                                                                    '&.Mui-error': {
                                                                                        '& fieldset': {
                                                                                            borderColor: 'error.main',
                                                                                            borderWidth: 2
                                                                                        }
                                                                                    }
                                                                                },
                                                                                '& .MuiSelect-select': {
                                                                                    color: !currentLayoutId ? 'error.main' : 'inherit'
                                                                                }
                                                                            }}
                                                                        >
                                                                            <Select
                                                                                value={String(getCurrentLayoutId(screenId, defaultLayoutId, linkId) || "")}
                                                                                onChange={(e: SelectChangeEvent) => {
                                                                                    const newLayoutId = parseInt(e.target.value, 10);
                                                                                    const currentValue = getCurrentLayoutId(screenId, defaultLayoutId, linkId);

                                                                                    if (newLayoutId !== currentValue && !isNaN(newLayoutId)) {
                                                                                        handleLayoutChange(linkId, screenId, newLayoutId, defaultLayoutId);
                                                                                    }
                                                                                }}
                                                                                disabled={isLoading || availableLayouts.length === 0}
                                                                                displayEmpty
                                                                            >
                                                                                {!currentLayoutId && (
                                                                                    <MenuItem value="" disabled>
                                                                                        <Typography variant="body2" color="error">
                                                                                            Select a layout...
                                                                                        </Typography>
                                                                                    </MenuItem>
                                                                                )}
                                                                                {availableLayouts.map((layout: any) => (
                                                                                    <MenuItem
                                                                                        key={`layout-${layout.id}`}
                                                                                        value={layout.id.toString()}
                                                                                    >
                                                                                        <Box>
                                                                                            <Typography variant="body2">
                                                                                                {layout.displayName}
                                                                                                {layout.id === defaultLayoutId && " (Device Default)"}
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
                                                                            <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                                <DevicesIcon fontSize="small" color="secondary" />
                                                                                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                                                                    Virtual Display:
                                                                                </Typography>
                                                                                <Link
                                                                                    href={generateVirtualDisplayUrl(linkId, screenId, link.id)}
                                                                                    target="_blank"
                                                                                    rel="noopener"
                                                                                    sx={{ fontSize: '0.75rem', wordBreak: 'break-all' }}
                                                                                >
                                                                                    {generateVirtualDisplayUrl(linkId, screenId, link.id)}
                                                                                </Link>
                                                                                <Tooltip title="Copy Virtual Display URL">
                                                                                    <IconButton
                                                                                        size="small"
                                                                                        onClick={() => copyToClipboard(generateVirtualDisplayUrl(linkId, screenId, link.id))}
                                                                                        sx={{ ml: 1 }}
                                                                                    >
                                                                                        <ContentCopyIcon fontSize="small" />
                                                                                    </IconButton>
                                                                                </Tooltip>
                                                                            </Box>
                                                                        </Box>
                                                                    </TableCell>
                                                                )}
                                                            </TableRow>

                                                            {/* SensorTags Expansion Row */}
                                                            {sensorTags.length > 0 && isAnyFrameMode && (
                                                                <TableRow>
                                                                    <TableCell
                                                                        colSpan={
                                                                            isCompositeMode ? 2 :
                                                                                isBlitMode ? 5 :
                                                                                    4
                                                                        }
                                                                        sx={{ p: 0, border: 'none' }}
                                                                    >
                                                                        <Box sx={{
                                                                            p: 2,
                                                                            backgroundColor: 'action.hover',
                                                                            border: 1,
                                                                            borderColor: 'divider',
                                                                            borderRadius: 1
                                                                        }}>
                                                                            {renderSensorTagsTable(sensorTags, selectedLayout?.displayName || 'Unknown Layout')}
                                                                        </Box>
                                                                    </TableCell>
                                                                </TableRow>
                                                            )}

                                                            {/* Rive Inputs Expansion Row */}
                                                            {isAnyFrameMode && currentLayoutId && (
                                                                <TableRow>
                                                                    <TableCell
                                                                        colSpan={
                                                                            isCompositeMode ? 2 :
                                                                                isBlitMode ? 5 :
                                                                                    4
                                                                        }
                                                                        sx={{ p: 0, border: 'none' }}
                                                                    >
                                                                        <Box sx={{
                                                                            p: 2,
                                                                            backgroundColor: 'action.hover',
                                                                            border: 1,
                                                                            borderColor: 'divider',
                                                                            borderRadius: 1,
                                                                            '& .MuiTypography-root': {
                                                                                color: 'text.primary'
                                                                            }
                                                                        }}>
                                                                            <RiveInputsForLayout
                                                                                layoutId={currentLayoutId}
                                                                                layoutName={selectedLayout?.displayName || 'Unknown Layout'}
                                                                                riveInputs={riveInputs}
                                                                                availableSensors={availableSensors}
                                                                                onInputMappingChange={handleRiveInputMappingChange}
                                                                            />
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
        </Paper>
    );
};

export default DeviceScreenLayoutsCard;