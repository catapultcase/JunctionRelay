import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
    Typography, Box, Table, TableHead,
    TableRow, TableCell, TableBody, Paper,
    Chip, CircularProgress, TableContainer,
    Select, MenuItem, FormControl, SelectChangeEvent,
    TextField, Switch, FormControlLabel, InputLabel,
    Card, CardContent, Button, Link, Tooltip,
    IconButton, Collapse, Accordion, AccordionSummary, AccordionDetails,
    useTheme, useMediaQuery, ToggleButtonGroup, ToggleButton
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
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ViewListIcon from '@mui/icons-material/ViewList';
import ViewAgendaIcon from '@mui/icons-material/ViewAgenda';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

// Define sensor interface to match the one from Junction_EnhancedSensorSelector
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
    onPayloadMismatchUpdate?: (hasMismatches: boolean, mismatchCount: number) => void;
    onMappedSensorTagsUpdate?: (mappedSensorTags: string[]) => void;
    disableCollapse?: boolean;
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
    streamingFps?: number;
    streamingJpegQuality?: number;
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

// Unified SensorTag interface that combines both SensorTags and Rive inputs
interface UnifiedSensorTag {
    sensorTag: string;
    isConnected: boolean;
    showLabel: boolean;
    showUnit: boolean;
    placeholderValue: string;
    placeholderUnit: string;
    placeholderSensorLabel: string;
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
    { value: "Composite", name: "FrameEngine: Frame Reassembly", desc: "Reassemble complete frames at target" },
    { value: "Streaming", name: "FrameEngine: MJPEG Streaming", desc: "Stream MJPEG video via HTTP at set FPS/Quality" }
];

const supportsFrameEngine = (junctionType: string): boolean => {
    return [
        "COM Junction",
        "HTTP Junction",
        "Virtual Junction",
        "WebSocket Junction"
    ].includes(junctionType);
};

/**
 * DEPRECATED: This function is no longer used.
 * SensorTags are now extracted directly from jsonFrameConfig.sensorTestValues
 * which is the single source of truth for all SensorTags used in a layout.
 */
const extractRiveInputsFromTemplates_DEPRECATED = (): RiveInput[] => {
    return [];
};

/**
 * Extract all SensorTags from a layout's jsonFrameConfig.sensorTestValues
 * This is the single source of truth for all SensorTags used in a layout,
 * including sensor elements, ECG elements, Rive inputs, and Rive bindings.
 */
const extractAllSensorTags = (layoutId: number, availableLayouts: any[], availableSensors: Sensor[]): UnifiedSensorTag[] => {
    const layout = availableLayouts.find(l => String(l.id) === String(layoutId));
    if (!layout) {
        return [];
    }

    // Helper function to check if a SensorTag is connected
    const isSensorTagMapped = (sensorTag: string): boolean => {
        return availableSensors.some(sensor => {
            if (!sensor.IsSelected) return false;
            const sensorTags = sensor.sensorTag.split(',').map(tag => tag.trim());
            return sensorTags.includes(sensorTag);
        });
    };

    try {
        if (!layout.jsonFrameConfig) {
            return [];
        }

        const frameConfig = JSON.parse(layout.jsonFrameConfig);

        // All SensorTags in use are stored as keys in sensorTestValues
        if (!frameConfig.sensorTestValues) {
            return [];
        }

        // Extract SensorTags from sensorTestValues keys and sort alphabetically
        const sensorTags = Object.keys(frameConfig.sensorTestValues).sort();

        return sensorTags.map(sensorTag => {
            const testValue = frameConfig.sensorTestValues[sensorTag];

            return {
                sensorTag,
                placeholderSensorLabel: testValue.label || sensorTag,
                showLabel: true,
                showUnit: !!testValue.unit,
                placeholderValue: String(testValue.value ?? ''),
                placeholderUnit: testValue.unit || '',
                isConnected: isSensorTagMapped(sensorTag)
            };
        });
    } catch (error) {
        console.error('Error parsing jsonFrameConfig:', error);
        return [];
    }
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
                                    <TableCell sx={{ ...headerStyle, fontSize: '0.75rem' }}>Binding</TableCell>
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
                                            {element.isConfigured && (
                                                <Tooltip title="Mapped to sensor">
                                                    <Chip
                                                        icon={<LinkIcon />}
                                                        label=""
                                                        size="small"
                                                        color="success"
                                                        variant="outlined"
                                                        sx={{ minWidth: '36px', '& .MuiChip-label': { px: 0.5 } }}
                                                    />
                                                </Tooltip>
                                            )}
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
    onValidationUpdate,
    onPayloadMismatchUpdate,
    onMappedSensorTagsUpdate,
    disableCollapse = false
}) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [expanded, setExpanded] = useState<boolean>(true);
    const [deviceScreens, setDeviceScreens] = useState<{ [deviceId: number]: any[] }>({});
    const [screenLayouts, setScreenLayouts] = useState<any[]>([]);
    const [frameLayouts, setFrameLayouts] = useState<any[]>([]);
    const [screenConfigs, setScreenConfigs] = useState<{ [key: string]: ScreenLayoutConfig }>({});
    const [loadingState, setLoadingState] = useState<{ [key: string]: boolean }>({});
    const [savingRenderingMode, setSavingRenderingMode] = useState<boolean>(false);
    const [riveInputMappings, setRiveInputMappings] = useState<Record<string, string[]>>({});

    // View mode state for single vs all devices
    const [viewMode, setViewMode] = useState<'all' | 'single'>('all');
    const [currentDeviceIndex, setCurrentDeviceIndex] = useState<number>(0);

    const renderingMode = junction?.renderingMode || 'Payload';
    const isPayloadMode = renderingMode === 'Payload';
    const isBlitMode = renderingMode === 'Blit';
    const isCompositeMode = renderingMode === 'Composite';
    const isStreamingMode = renderingMode === 'Streaming';
    const isAnyFrameMode = isBlitMode || isCompositeMode || isStreamingMode;

    const getAvailableRenderingModes = useCallback(() => {
        if (!junction?.type || !supportsFrameEngine(junction.type)) {
            return renderingModeOptions.filter(mode => mode.value === "Payload");
        }
        return renderingModeOptions;
    }, [junction?.type]);

    const getFilteredLayouts = useCallback(() => {
        if (isBlitMode || isCompositeMode || isStreamingMode) {
            return frameLayouts;
        } else {
            return screenLayouts;
        }
    }, [isBlitMode, isCompositeMode, isStreamingMode, frameLayouts, screenLayouts]);

    const availableLayouts = getFilteredLayouts();

    const targetDeviceLinks = useMemo(() =>
        deviceLinks.filter(link => link.type === "device" && link.role === "Target")
        , [deviceLinks]);

    // Handlers for device navigation in single view mode
    const handlePreviousDevice = () => {
        if (currentDeviceIndex > 0) {
            setCurrentDeviceIndex(currentDeviceIndex - 1);
        }
    };

    const handleNextDevice = () => {
        if (currentDeviceIndex < targetDeviceLinks.length - 1) {
            setCurrentDeviceIndex(currentDeviceIndex + 1);
        }
    };

    // Filter devices based on view mode
    const displayedDeviceLinks = useMemo(() => {
        if (viewMode === 'single' && targetDeviceLinks.length > 0) {
            const index = Math.min(currentDeviceIndex, targetDeviceLinks.length - 1);
            return [targetDeviceLinks[index]];
        }
        return targetDeviceLinks;
    }, [viewMode, currentDeviceIndex, targetDeviceLinks]);

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
        // SIMPLIFIED: Use the new extractAllSensorTags function that reads from jsonFrameConfig.sensorTestValues
        // This is the single source of truth for all SensorTags used in a layout
        return extractAllSensorTags(layoutId, availableLayouts, availableSensors);
    }, [availableLayouts, availableSensors]);

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

    // SIMPLIFIED: Rive inputs are now extracted from jsonFrameConfig.sensorTestValues
    // No need for separate tracking - all SensorTags are in sensorTestValues
    const riveInputs = useMemo(() => {
        return [];
    }, []);

    // SIMPLIFIED: No longer tracking separate Rive inputs - all tags in sensorTestValues
    useEffect(() => {
        if (onRiveInputsUpdate) {
            onRiveInputsUpdate([]);
        }
    }, [onRiveInputsUpdate]);

    // MAPPED SENSOR TAGS EFFECT - Send all SensorTags used in layouts to parent
    // SIMPLIFIED: All SensorTags now extracted from jsonFrameConfig.sensorTestValues
    // This list is used to show binding indicators for sensors that match layout SensorTags
    const previousMappedSensorTagsRef = useRef<string>('');

    useEffect(() => {
        if (onMappedSensorTagsUpdate) {
            const allMappedTags = new Set<string>();

            // Extract ALL SensorTags from all selected layouts (from sensorTestValues keys)
            // These are the tags that the layout is configured to use
            const selectedLayoutIds = getSelectedLayoutIds();
            selectedLayoutIds.forEach(layoutId => {
                const sensorTags = extractSensorTagsFromTemplate(layoutId);
                // Add ALL tags from the layout, not just connected ones
                // This allows binding indicators to show which sensors COULD be connected
                sensorTags.forEach(sensorTag => {
                    allMappedTags.add(sensorTag.sensorTag.trim());
                });
            });

            const mappedTagsArray = Array.from(allMappedTags);
            const currentHash = JSON.stringify(mappedTagsArray.sort());

            if (currentHash !== previousMappedSensorTagsRef.current) {
                previousMappedSensorTagsRef.current = currentHash;
                onMappedSensorTagsUpdate(mappedTagsArray);
            }
        }
    }, [onMappedSensorTagsUpdate, getSelectedLayoutIds, extractSensorTagsFromTemplate]);

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

    // Effect to detect payload mismatches
    useEffect(() => {
        if (!onPayloadMismatchUpdate || !junction) return;

        let mismatchCount = 0;
        const targetDevices = deviceLinks.filter(link => link.isTarget);

        for (const link of targetDevices) {
            const deviceId = link.id;
            const screens = deviceScreens[deviceId] || [];

            for (const screen of screens) {
                const hasConfigMismatch = junction.sendConfigPayload && !screen.supportsConfigPayloads;
                const hasSensorMismatch = junction.sendSensorPayloads && !screen.supportsSensorPayloads;
                const hasStopMismatch = junction.sendStopPayload && !screen.supportsStopPayloads;

                if (hasConfigMismatch || hasSensorMismatch || hasStopMismatch) {
                    mismatchCount++;
                }
            }
        }

        onPayloadMismatchUpdate(mismatchCount > 0, mismatchCount);
    }, [
        deviceLinks,
        deviceScreens,
        junction,
        onPayloadMismatchUpdate
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
                        streamingFps: config.streamingFps,
                        streamingJpegQuality: config.streamingJpegQuality,
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

        try {
            setLoadingState(prev => ({ ...prev, [key]: true }));

            // If no existing config, create a new one
            if (!existingConfig?.id) {
                const payload: any = {
                    junctionId,
                    deviceScreenId: screenId,
                    targetPollRate: undefined,
                    streamingFps: undefined,
                    streamingJpegQuality: undefined,
                    onlySendIfChanged: true,
                    enableUrlAccess: false,
                    urlPath: undefined
                };

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
                    throw new Error(`Failed to create layout configuration: ${response.status}`);
                }

                const data = await response.json();

                setScreenConfigs(prev => ({
                    ...prev,
                    [key]: {
                        id: data.id,
                        junctionId: data.junctionId,
                        deviceScreenId: screenId,
                        screenLayoutId: data.screenLayoutId,
                        frameLayoutId: data.frameLayoutId,
                        targetPollRate: data.targetPollRate,
                        streamingFps: data.streamingFps,
                        streamingJpegQuality: data.streamingJpegQuality,
                        onlySendIfChanged: data.onlySendIfChanged ?? true,
                        enableUrlAccess: data.enableUrlAccess ?? false,
                        urlPath: data.urlPath,
                        lastRequested: data.lastRequested
                    }
                }));

                const modeDescription = getRenderModeDisplayName(renderingMode);
                showSnackbar(`${modeDescription} layout configuration created successfully`, "success");
                return;
            }

            const currentEffectiveLayoutId = isAnyFrameMode ? existingConfig.frameLayoutId : existingConfig.screenLayoutId;

            if (currentEffectiveLayoutId === layoutId) {
                return;
            }

            const payload: any = {
                junctionId,
                deviceScreenId: screenId,
                targetPollRate: existingConfig.targetPollRate,
                streamingFps: existingConfig.streamingFps,
                streamingJpegQuality: existingConfig.streamingJpegQuality,
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
                    streamingFps: data.streamingFps,
                    streamingJpegQuality: data.streamingJpegQuality,
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

            if (!existingConfig?.id) {
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
                streamingFps: existingConfig.streamingFps,
                streamingJpegQuality: existingConfig.streamingJpegQuality,
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

            if (!existingConfig?.id) {
                showSnackbar("Please assign a layout first before setting poll rate", "warning");
                return;
            }

            const payload = {
                junctionId,
                deviceScreenId: screenId,
                screenLayoutId: existingConfig.screenLayoutId,
                frameLayoutId: existingConfig.frameLayoutId,
                targetPollRate: numericRate,
                streamingFps: existingConfig.streamingFps,
                streamingJpegQuality: existingConfig.streamingJpegQuality,
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

    const handleStreamingFpsChange = useCallback(async (linkId: number, screenId: number, fps: string) => {
        const key = `${linkId}-${screenId}`;
        const numericFps = fps === "" ? undefined : parseInt(fps, 10);

        try {
            const existingConfig = screenConfigs[key];

            if (!existingConfig?.id) {
                showSnackbar("Please assign a layout first before setting streaming FPS", "warning");
                return;
            }

            const payload = {
                junctionId,
                deviceScreenId: screenId,
                screenLayoutId: existingConfig.screenLayoutId,
                frameLayoutId: existingConfig.frameLayoutId,
                targetPollRate: existingConfig.targetPollRate,
                streamingFps: numericFps,
                streamingJpegQuality: existingConfig.streamingJpegQuality,
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
                throw new Error(`Failed to update streaming FPS: ${response.status}`);
            }

            setScreenConfigs(prev => ({
                ...prev,
                [key]: {
                    ...existingConfig,
                    streamingFps: numericFps
                }
            }));

        } catch (error) {
            console.error("Error updating streaming FPS:", error);
            showSnackbar("Failed to update streaming FPS", "error");
        }
    }, [screenConfigs, junctionId, showSnackbar]);

    const handleStreamingJpegQualityChange = useCallback(async (linkId: number, screenId: number, quality: string) => {
        const key = `${linkId}-${screenId}`;
        const numericQuality = quality === "" ? undefined : parseInt(quality, 10);

        try {
            const existingConfig = screenConfigs[key];

            if (!existingConfig?.id) {
                showSnackbar("Please assign a layout first before setting JPEG quality", "warning");
                return;
            }

            const payload = {
                junctionId,
                deviceScreenId: screenId,
                screenLayoutId: existingConfig.screenLayoutId,
                frameLayoutId: existingConfig.frameLayoutId,
                targetPollRate: existingConfig.targetPollRate,
                streamingFps: existingConfig.streamingFps,
                streamingJpegQuality: numericQuality,
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
                throw new Error(`Failed to update JPEG quality: ${response.status}`);
            }

            setScreenConfigs(prev => ({
                ...prev,
                [key]: {
                    ...existingConfig,
                    streamingJpegQuality: numericQuality
                }
            }));

        } catch (error) {
            console.error("Error updating JPEG quality:", error);
            showSnackbar("Failed to update JPEG quality", "error");
        }
    }, [screenConfigs, junctionId, showSnackbar]);

    const handleOnlySendIfChangedToggle = useCallback(async (linkId: number, screenId: number) => {
        const key = `${linkId}-${screenId}`;

        try {
            const existingConfig = screenConfigs[key];

            if (!existingConfig?.id) {
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
                streamingFps: existingConfig.streamingFps,
                streamingJpegQuality: existingConfig.streamingJpegQuality,
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

    const generateStreamEndpointUrl = useCallback((linkId: number, screenId: number, deviceId: number) => {
        const virtualDeviceId = -(Math.abs(deviceId) + 10000);
        const streamPort = 50000 + Math.abs(virtualDeviceId);
        const hostname = window.location.hostname;
        return `http://${hostname}:${streamPort}/stream`;
    }, []);

    const renderSensorTagsTable = useCallback((sensorTags: UnifiedSensorTag[], layoutName: string, isMobile: boolean) => {
        if (sensorTags.length === 0) {
            return (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2, fontStyle: 'italic' }}>
                    No SensorTags found in this template
                </Typography>
            );
        }

        return (
            <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                    SensorTags in "{layoutName}":
                </Typography>

                {/* Mobile: Card Layout */}
                {isMobile ? (
                    <Box display="flex" flexDirection="column" gap={1.5}>
                        {sensorTags.map((sensorTag, index) => (
                            <Card key={`${sensorTag.sensorTag}-${index}`} variant="outlined" sx={{ borderRadius: 1 }}>
                                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                                    {/* SensorTag Name */}
                                    <Box display="flex" alignItems="center" mb={1}>
                                        <SensorsIcon fontSize="small" sx={{ mr: 1, color: 'primary.main' }} />
                                        <Typography variant="body2" fontWeight="bold">
                                            {sensorTag.sensorTag}
                                        </Typography>
                                    </Box>

                                    {/* Status */}
                                    <Box mb={1}>
                                        <Chip
                                            size="small"
                                            label={sensorTag.isConnected ? "Mapped" : "Not Mapped"}
                                            color={sensorTag.isConnected ? "success" : "error"}
                                            icon={sensorTag.isConnected ? <CheckCircleIcon /> : <CancelIcon />}
                                            variant="outlined"
                                            sx={{ fontSize: '0.7rem' }}
                                        />
                                    </Box>

                                    {/* Template Example */}
                                    <Box mb={1} p={1} bgcolor="background.default" borderRadius={1}>
                                        <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                                            Template Example:
                                        </Typography>
                                        <Typography variant="body2">
                                            {sensorTag.showLabel && sensorTag.placeholderSensorLabel && (
                                                <span style={{ marginRight: '4px', fontWeight: 500 }}>
                                                    {sensorTag.placeholderSensorLabel}
                                                </span>
                                            )}
                                            <span>
                                                {sensorTag.placeholderValue}
                                            </span>
                                            {sensorTag.showUnit && sensorTag.placeholderUnit && (
                                                <span style={{ marginLeft: '2px', opacity: 0.7 }}>
                                                    {sensorTag.placeholderUnit}
                                                </span>
                                            )}
                                        </Typography>
                                    </Box>

                                    {/* Flags */}
                                    <Box display="flex" gap={0.5} flexWrap="wrap">
                                        <Chip
                                            size="small"
                                            label={sensorTag.showLabel ? "Show Label" : "Hide Label"}
                                            color={sensorTag.showLabel ? "primary" : "default"}
                                            icon={<LabelIcon />}
                                            variant="outlined"
                                            sx={{ fontSize: '0.65rem', height: '20px' }}
                                        />
                                        <Chip
                                            size="small"
                                            label={sensorTag.showUnit ? "Show Units" : "Hide Units"}
                                            color={sensorTag.showUnit ? "primary" : "default"}
                                            variant="outlined"
                                            sx={{ fontSize: '0.65rem', height: '20px' }}
                                        />
                                    </Box>
                                </CardContent>
                            </Card>
                        ))}
                    </Box>
                ) : (
                    /* Desktop: Table Layout */
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ ...headerStyle, fontSize: '0.75rem' }}>SensorTag</TableCell>
                                <TableCell sx={{ ...headerStyle, fontSize: '0.75rem' }}>Binding</TableCell>
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
                                        {sensorTag.isConnected && (
                                            <Tooltip title="Mapped to sensor">
                                                <Chip
                                                    icon={<LinkIcon />}
                                                    label=""
                                                    size="small"
                                                    color="success"
                                                    variant="outlined"
                                                    sx={{ minWidth: '36px', '& .MuiChip-label': { px: 0.5 } }}
                                                />
                                            </Tooltip>
                                        )}
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
                )}
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
        <Accordion
            expanded={disableCollapse ? true : expanded}
            onChange={disableCollapse ? undefined : () => setExpanded(!expanded)}
            sx={{ mb: 3 }}
        >
            <AccordionSummary
                expandIcon={disableCollapse ? null : <ExpandMoreIcon />}
                sx={disableCollapse ? {
                    cursor: 'default !important',
                    '&:hover': { backgroundColor: 'transparent' },
                    // Allow child elements to be clickable even when accordion is disabled
                    pointerEvents: 'auto'
                } : undefined}
                onClick={disableCollapse ? (e) => e.preventDefault() : undefined}
            >
                <Box display="flex" alignItems="center" justifyContent="space-between" width="100%" sx={{ pointerEvents: 'auto' }}>
                    <Box display="flex" alignItems="center" gap={1}>
                        <ScreenshotIcon />
                        <Typography variant="h6">Device Screens & Layout Configuration</Typography>
                    </Box>

                    {/* View Mode Toggle - Only show if there are multiple target devices */}
                    {targetDeviceLinks.length > 1 && (
                        <Box onClick={(e) => e.stopPropagation()}>
                            <ToggleButtonGroup
                                value={viewMode}
                                exclusive
                                onChange={(e, newMode) => {
                                    e.stopPropagation();
                                    if (newMode !== null) {
                                        setViewMode(newMode);
                                    }
                                }}
                                size="small"
                            >
                                <ToggleButton value="all" aria-label="all devices">
                                    <Tooltip title="All Devices">
                                        <ViewListIcon fontSize="small" />
                                    </Tooltip>
                                </ToggleButton>
                                <ToggleButton value="single" aria-label="single device">
                                    <Tooltip title="Single Device">
                                        <ViewAgendaIcon fontSize="small" />
                                    </Tooltip>
                                </ToggleButton>
                            </ToggleButtonGroup>
                        </Box>
                    )}
                </Box>
            </AccordionSummary>
            <AccordionDetails>
                <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
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
                        ) : isStreamingMode ? (
                            <>
                                <strong>MJPEG Streaming:</strong> Uses the FrameEngine to render frames and stream them as MJPEG video to browsers via HTTP. Ideal for web-based displays and monitoring dashboards.
                            </>
                        ) : (
                            <>
                                <strong>Data Payloads:</strong> Uses the Payload system to send raw data payloads to target devices using legacy screen layouts. The receiving device should handle rendering/display logic.
                            </>
                        )}
                    </Typography>

                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                        {isStreamingMode ? (
                            <>
                                <strong>Streaming FPS:</strong> Frame rate for the MJPEG video stream. Higher values provide smoother updates but increase bandwidth usage.
                            </>
                        ) : (
                            <>
                                <strong>Target Poll Rate (ms):</strong> If you want the target device to "request" new data, instead of the backend sending new payloads at the send rate frequency, enter that desired frequency here.
                            </>
                        )}
                    </Typography>
                </CardContent>
            </Card>

            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{
                    display: 'flex',
                    alignItems: 'center'
                }}>
                    {isAnyFrameMode ? <ImageIcon sx={{ mr: 1 }} /> : <ScreenshotIcon sx={{ mr: 1 }} />}
                    {isCompositeMode
                        ? "Frame Assembly Configurations"
                        : isBlitMode
                            ? "Pre-rendered Frame Configurations"
                            : isStreamingMode
                                ? "MJPEG Streaming Configurations"
                                : "Payload Layout Configurations"}
                </Typography>
            </Box>

            {/* Device Selector - Only show in single device mode with multiple devices */}
            {viewMode === 'single' && targetDeviceLinks.length > 1 && (
                <Box sx={{ mb: 3, p: 2, backgroundColor: 'action.hover', borderRadius: 1, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 'medium' }}>
                        Viewing Device:
                    </Typography>
                    <FormControl sx={{ minWidth: 300, flex: 1, maxWidth: 500 }} size="small">
                        <Select
                            value={currentDeviceIndex}
                            onChange={(e) => setCurrentDeviceIndex(Number(e.target.value))}
                        >
                            {targetDeviceLinks.map((device, index) => (
                                <MenuItem key={`device-select-${device.linkId}`} value={index}>
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <DevicesIcon fontSize="small" color="primary" />
                                        <Typography variant="body2">{device.name}</Typography>
                                    </Box>
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <Box display="flex" alignItems="center" gap={0.5}>
                        <IconButton
                            size="small"
                            onClick={handlePreviousDevice}
                            disabled={currentDeviceIndex === 0}
                        >
                            <NavigateBeforeIcon />
                        </IconButton>
                        <Typography variant="caption" sx={{ minWidth: '50px', textAlign: 'center' }}>
                            {currentDeviceIndex + 1} / {targetDeviceLinks.length}
                        </Typography>
                        <IconButton
                            size="small"
                            onClick={handleNextDevice}
                            disabled={currentDeviceIndex >= targetDeviceLinks.length - 1}
                        >
                            <NavigateNextIcon />
                        </IconButton>
                    </Box>
                </Box>
            )}

            {targetDeviceLinks.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                    No target devices available. Add devices as targets to configure their {isAnyFrameMode ? 'frame layouts' : 'screen layouts'}.
                </Typography>
            ) : (
                <Box>
                    {displayedDeviceLinks.map(link => {
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
                                    <Box>
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

                                                    // Check for payload mismatches
                                                    const hasConfigMismatch = junction.sendConfigPayload && !screen.supportsConfigPayloads;
                                                    const hasSensorMismatch = junction.sendSensorPayloads && !screen.supportsSensorPayloads;
                                                    const hasStopMismatch = junction.sendStopPayload && !screen.supportsStopPayloads;
                                                    const hasAnyMismatch = hasConfigMismatch || hasSensorMismatch || hasStopMismatch;

                                                    return (
                                                        <Paper
                                                            key={`screen-${screenId}`}
                                                            variant="outlined"
                                                            sx={{
                                                                mb: 2,
                                                                p: 2,
                                                                backgroundColor: hasAnyMismatch ? 'warning.light' : 'inherit',
                                                                borderColor: hasAnyMismatch ? 'warning.main' : 'divider'
                                                            }}
                                                        >
                                                            <Box
                                                                display="grid"
                                                                gridTemplateColumns={{ xs: '1fr', lg: '400px 1fr' }}
                                                                gap={3}
                                                            >
                                                                {/* Left Column: Controls */}
                                                                <Box>
                                                                    {/* Screen Name */}
                                                                    <Typography variant="subtitle1" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                                                        <ScreenshotIcon fontSize="small" color="primary" />
                                                                        {screen.displayName || screen.screenKey}
                                                                    </Typography>

                                                                    {/* Frame/Payload Layout */}
                                                                    <Box mb={3}>
                                                                        <Typography variant="body2" color="text.secondary" gutterBottom>
                                                                            {isCompositeMode ? "Frame Layout" : (isBlitMode ? "Frame Layout" : "Payload Layout")}
                                                                        </Typography>
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
                                                                        <Box display="flex" alignItems="center" gap={1} mt={1}>
                                                                            {isConfigured && (
                                                                                <Chip
                                                                                    size="small"
                                                                                    label="Configured"
                                                                                    color="primary"
                                                                                    variant="outlined"
                                                                                />
                                                                            )}
                                                                            {isLoading && (
                                                                                <CircularProgress size={16} />
                                                                            )}
                                                                        </Box>
                                                                    </Box>

                                                                    {/* Payload Support */}
                                                                    <Box mb={3}>
                                                                        <Typography variant="body2" color="text.secondary" gutterBottom>
                                                                            Payload Support
                                                                        </Typography>
                                                                        <Box display="flex" gap={0.5} flexWrap="wrap">
                                                                            <Tooltip title={screen.supportsConfigPayloads ? "Supports Config Payloads" : "Does NOT support Config Payloads"}>
                                                                                <Chip
                                                                                    size="small"
                                                                                    icon={screen.supportsConfigPayloads ? <CheckCircleIcon /> : <CancelIcon />}
                                                                                    label="Config"
                                                                                    color={screen.supportsConfigPayloads ? "success" : "default"}
                                                                                    variant={hasConfigMismatch ? "filled" : "outlined"}
                                                                                />
                                                                            </Tooltip>
                                                                            <Tooltip title={screen.supportsSensorPayloads ? "Supports Sensor Payloads" : "Does NOT support Sensor Payloads"}>
                                                                                <Chip
                                                                                    size="small"
                                                                                    icon={screen.supportsSensorPayloads ? <CheckCircleIcon /> : <CancelIcon />}
                                                                                    label="Sensor"
                                                                                    color={screen.supportsSensorPayloads ? "success" : "default"}
                                                                                    variant={hasSensorMismatch ? "filled" : "outlined"}
                                                                                />
                                                                            </Tooltip>
                                                                            <Tooltip title={screen.supportsStopPayloads ? "Supports Stop Payloads" : "Does NOT support Stop Payloads"}>
                                                                                <Chip
                                                                                    size="small"
                                                                                    icon={screen.supportsStopPayloads ? <CheckCircleIcon /> : <CancelIcon />}
                                                                                    label="Stop"
                                                                                    color={screen.supportsStopPayloads ? "success" : "default"}
                                                                                    variant={hasStopMismatch ? "filled" : "outlined"}
                                                                                />
                                                                            </Tooltip>
                                                                        </Box>
                                                                        {hasAnyMismatch && (
                                                                            <Box display="flex" alignItems="center" gap={0.5} mt={1}>
                                                                                <WarningAmberIcon fontSize="small" color="error" />
                                                                                <Typography variant="caption" color="error" fontWeight="medium">
                                                                                    Payload mismatch detected!
                                                                                </Typography>
                                                                            </Box>
                                                                        )}
                                                                    </Box>

                                                                    {/* Poll Rate - Not for Composite or Streaming */}
                                                                    {!isCompositeMode && !isStreamingMode && (
                                                                        <Box mb={3}>
                                                                            <Typography variant="body2" color="text.secondary" gutterBottom>
                                                                                Target Poll Rate (ms)
                                                                            </Typography>
                                                                            <TextField
                                                                                type="number"
                                                                                size="small"
                                                                                fullWidth
                                                                                value={config?.targetPollRate || ""}
                                                                                onChange={(e) => handlePollRateChange(linkId, screenId, e.target.value)}
                                                                                placeholder="Optional"
                                                                                disabled={isLoading}
                                                                            />
                                                                        </Box>
                                                                    )}

                                                                    {/* Streaming FPS - Only for Streaming mode */}
                                                                    {isStreamingMode && (
                                                                        <Box mb={3}>
                                                                            <Typography variant="body2" color="text.secondary" gutterBottom>
                                                                                Streaming FPS
                                                                            </Typography>
                                                                            <TextField
                                                                                type="number"
                                                                                size="small"
                                                                                fullWidth
                                                                                value={config?.streamingFps || ""}
                                                                                onChange={(e) => handleStreamingFpsChange(linkId, screenId, e.target.value)}
                                                                                placeholder="30"
                                                                                disabled={isLoading}
                                                                                inputProps={{ min: 1, max: 60 }}
                                                                            />
                                                                        </Box>
                                                                    )}

                                                                    {/* JPEG Quality - Only for Streaming mode */}
                                                                    {isStreamingMode && (
                                                                        <Box mb={3}>
                                                                            <Typography variant="body2" color="text.secondary" gutterBottom>
                                                                                JPEG Quality (1-100)
                                                                            </Typography>
                                                                            <TextField
                                                                                type="number"
                                                                                size="small"
                                                                                fullWidth
                                                                                value={config?.streamingJpegQuality || ""}
                                                                                onChange={(e) => handleStreamingJpegQualityChange(linkId, screenId, e.target.value)}
                                                                                placeholder="85"
                                                                                disabled={isLoading}
                                                                                inputProps={{ min: 1, max: 100 }}
                                                                            />
                                                                        </Box>
                                                                    )}

                                                                    {/* Only Send If Changed - Not for Composite or Streaming */}
                                                                    {!isCompositeMode && !isStreamingMode && (
                                                                        <Box mb={3}>
                                                                            <FormControlLabel
                                                                                control={
                                                                                    <Switch
                                                                                        checked={config?.onlySendIfChanged ?? true}
                                                                                        onChange={() => handleOnlySendIfChangedToggle(linkId, screenId)}
                                                                                        disabled={isLoading}
                                                                                        size="small"
                                                                                    />
                                                                                }
                                                                                label="Only Send If Data Changed"
                                                                            />
                                                                        </Box>
                                                                    )}

                                                                    {/* URL Access for Blit and Streaming Modes */}
                                                                    {(isBlitMode || isStreamingMode) && (
                                                                        <Box mb={2}>
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

                                                                            {/* Frame URL - Only for Blit Mode */}
                                                                            {isBlitMode && config?.enableUrlAccess && frameUrl && (
                                                                                <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                                                    <LinkIcon fontSize="small" color="primary" />
                                                                                    <Link
                                                                                        href={frameUrl}
                                                                                        target="_blank"
                                                                                        rel="noopener"
                                                                                        sx={{ fontSize: '0.75rem', wordBreak: 'break-all', flex: 1 }}
                                                                                    >
                                                                                        {frameUrl}
                                                                                    </Link>
                                                                                    <Tooltip title="Copy URL">
                                                                                        <IconButton
                                                                                            size="small"
                                                                                            onClick={() => copyToClipboard(frameUrl)}
                                                                                        >
                                                                                            <ContentCopyIcon fontSize="small" />
                                                                                        </IconButton>
                                                                                    </Tooltip>
                                                                                </Box>
                                                                            )}

                                                                            {/* Virtual Display - For both Blit and Streaming */}
                                                                            {config?.enableUrlAccess && (
                                                                                <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                                                    <DevicesIcon fontSize="small" color="secondary" />
                                                                                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                                                                        Virtual Display:
                                                                                    </Typography>
                                                                                    <Link
                                                                                        href={generateVirtualDisplayUrl(linkId, screenId, link.id)}
                                                                                        target="_blank"
                                                                                        rel="noopener"
                                                                                        sx={{ fontSize: '0.75rem', wordBreak: 'break-all', flex: 1 }}
                                                                                    >
                                                                                        {generateVirtualDisplayUrl(linkId, screenId, link.id)}
                                                                                    </Link>
                                                                                    <Tooltip title="Copy Virtual Display URL">
                                                                                        <IconButton
                                                                                            size="small"
                                                                                            onClick={() => copyToClipboard(generateVirtualDisplayUrl(linkId, screenId, link.id))}
                                                                                        >
                                                                                            <ContentCopyIcon fontSize="small" />
                                                                                        </IconButton>
                                                                                    </Tooltip>
                                                                                </Box>
                                                                            )}

                                                                            {/* Stream Endpoint - Only for Streaming Mode */}
                                                                            {isStreamingMode && config?.enableUrlAccess && (
                                                                                <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                                                    <LinkIcon fontSize="small" color="success" />
                                                                                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                                                                        Stream Endpoint:
                                                                                    </Typography>
                                                                                    <Link
                                                                                        href={generateStreamEndpointUrl(linkId, screenId, link.id)}
                                                                                        target="_blank"
                                                                                        rel="noopener"
                                                                                        sx={{ fontSize: '0.75rem', wordBreak: 'break-all', flex: 1 }}
                                                                                    >
                                                                                        {generateStreamEndpointUrl(linkId, screenId, link.id)}
                                                                                    </Link>
                                                                                    <Tooltip title="Copy Stream Endpoint URL">
                                                                                        <IconButton
                                                                                            size="small"
                                                                                            onClick={() => copyToClipboard(generateStreamEndpointUrl(linkId, screenId, link.id))}
                                                                                        >
                                                                                            <ContentCopyIcon fontSize="small" />
                                                                                        </IconButton>
                                                                                    </Tooltip>
                                                                                </Box>
                                                                            )}
                                                                        </Box>
                                                                    )}
                                                                </Box>

                                                                {/* Right Column: Unified SensorTags */}
                                                                <Box>
                                                                    {/* Unified SensorTags Section (includes sensor elements + Rive inputs) */}
                                                                    {isAnyFrameMode && currentLayoutId && (
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
                                                                            {(() => {
                                                                                const allSensorTags = extractAllSensorTags(
                                                                                    currentLayoutId,
                                                                                    availableLayouts,
                                                                                    availableSensors
                                                                                );
                                                                                return renderSensorTagsTable(
                                                                                    allSensorTags,
                                                                                    selectedLayout?.displayName || 'Unknown Layout',
                                                                                    isMobile
                                                                                );
                                                                            })()}
                                                                        </Box>
                                                                    )}
                                                                </Box>
                                                            </Box>
                                                        </Paper>
                                                    );
                                                })}
                                    </Box>
                                )}
                            </Paper>
                        );
                    })}
                </Box>
            )}
        </Paper>
            </AccordionDetails>
        </Accordion>
    );
};

export default DeviceScreenLayoutsCard;