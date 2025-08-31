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

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box,
    Button,
    Typography,
    CircularProgress,
    Alert,
    IconButton,
    Fab
} from '@mui/material';
import {
    Fullscreen,
    FullscreenExit,
    ArrowBack,
    Refresh,
    Launch
} from '@mui/icons-material';
import {
    useRive,
    Layout,
    Fit,
    Alignment,
} from '@rive-app/react-canvas';
import { useDashboardWebSocket } from '../hooks/useDashboardWebSocket';

// Google Fonts loader utility - EXACT COPY from FrameEngine_Canvas
const loadGoogleFont = (fontFamily: string) => {
    if (!fontFamily || fontFamily.includes('system') || fontFamily.includes('sans-serif') ||
        document.querySelector(`link[href*="${fontFamily.replace(/\s+/g, '+')}"]`)) {
        return;
    }

    const link = document.createElement('link');
    link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/\s+/g, '+')}:wght@100;200;300;400;500;600;700;800;900&display=swap`;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
};

interface RiveConnection {
    machineName: string;
    inputName: string;
    inputType: string;
    currentValue: any;
    fullKey: string;
}

interface RiveConfig {
    type: "rive_config";
    screenId: string;
    frameConfig: {
        frameConfig?: {
            canvas: { width: number; height: number; orientation: string };
            background: { color: string; type: string };
            rive: {
                enabled: boolean;
                file: string;
                fileUrl?: string;
                discovery?: {
                    machines: Array<{
                        name: string;
                        inputs: Array<{
                            name: string;
                            type: string;
                            currentValue: any;
                            ref?: any;
                        }>;
                    }>;
                    metadata: {
                        totalInputs: number;
                        inputTypeBreakdown: Record<string, number>;
                        discoveryAttempts: number;
                        lastSuccessfulDiscovery: string;
                    };
                    activeStateMachine: string;
                    globalInputMappings: Record<string, any>;
                };
            };
        };
        canvas?: { width: number; height: number; orientation: string };
        background?: { color: string; type: string };
        rive?: any;
    };
    frameElements?: Array<{
        id: string;
        type: string;
        position: { x: number; y: number; width: number; height: number };
        properties: {
            sensorTag?: string;
            placeholderValue?: string;
            placeholderUnit?: string;
            fontSize?: number;
            fontFamily?: string;
            fontWeight?: string;
            textColor?: string;
            showUnit?: boolean;
            text?: string;
            textAlign?: string;
            placeholderSensorLabel?: string;
            showLabel?: boolean;
            lineHeight?: string;
            backgroundColor?: string;
            color?: string;
            textShadow?: boolean;
            textBorder?: boolean;
        };
        riveConnections?: {
            availableInputs: RiveConnection[];
            mappedInputs: RiveConnection[];
            lastMappingUpdate: string;
        };
    }>;
}

interface SensorPayload {
    type: "rive_sensor";
    screenId: string;
    sensors: Record<string, {
        value: number;
        unit: string;
        displayValue: string;
    }>;
}

interface DisplayElement {
    id: string;
    type: 'sensor' | 'text';
    position: { x: number; y: number; width: number; height: number };
    properties: Record<string, any>;
    sensorTag?: string;
    text?: string;
    currentValue?: string;
    currentUnit?: string;
    riveConnections?: {
        availableInputs: RiveConnection[];
        mappedInputs: RiveConnection[];
        lastMappingUpdate: string;
    };
}

interface CanvasBounds {
    left: number;
    top: number;
    width: number;
    height: number;
    scaleX: number;
    scaleY: number;
}

interface VirtualScreenViewerProps {
    // For embedded mode
    deviceId?: string;
    containerHeight?: number;
    showControls?: boolean;
    onFullscreenClick?: () => void;
    deviceData?: any;

    // For standalone mode (will use URL params if not provided)
    isStandalone?: boolean;
}

// Dynamic Rive Background Component - EXACT COPY from FrameEngine_Canvas
const RiveBackground: React.FC<{
    riveFile: string;
    stateMachine?: string;
    inputs?: Record<string, any>;
    width: number;
    height: number;
    onRiveDiscovery?: (machines: any[]) => void;
}> = ({ riveFile, stateMachine, inputs, width, height, onRiveDiscovery }) => {
    const riveFileUrl = `/api/frameengine/rive-files/${riveFile}/content`;
    const [discoveredInputs, setDiscoveredInputs] = useState<Record<string, any>>({});

    const { rive, RiveComponent } = useRive({
        src: riveFileUrl,
        autoplay: true,
        layout: new Layout({
            fit: Fit.Cover,
            alignment: Alignment.Center
        }),
        onLoad: () => {
            console.log('✅ Rive background loaded:', riveFile);
        },
        onLoadError: (error: any) => {
            console.error('❌ Rive background load error:', error, { riveFile });
        },
    });

    // Discovery logic - EXACT COPY from FrameEngine_Canvas
    useEffect(() => {
        if (!rive) return;

        let attempts = 0;
        let stopped = false;
        const maxAttempts = 20;

        const discoverMachinesAndInputs = () => {
            if (stopped || !rive) return;
            attempts++;

            try {
                const smNames: string[] = Array.isArray(rive.stateMachineNames) ? rive.stateMachineNames : [];

                smNames.forEach((sm) => {
                    try { rive.play(sm); } catch { }
                });

                const machines: any[] = smNames.map((smName) => {
                    const inputs: any[] = [];

                    try {
                        const rawInputs = rive.stateMachineInputs ? (rive.stateMachineInputs(smName) as any[]) : [];

                        rawInputs.forEach((rawInput) => {
                            if (rawInput?.name) {
                                const inputName = String(rawInput.name);
                                let inputType: string = 'unknown';
                                let currentValue: any = null;
                                let hasValue = false;

                                try {
                                    currentValue = rawInput.value;
                                    hasValue = true;

                                    if (typeof currentValue === 'number') {
                                        inputType = 'number';
                                    } else if (typeof currentValue === 'boolean') {
                                        inputType = 'boolean';
                                    }
                                } catch {
                                    try {
                                        if (typeof rawInput.fire === 'function') {
                                            inputType = 'trigger';
                                        }
                                    } catch { }
                                }

                                inputs.push({
                                    name: inputName,
                                    type: inputType,
                                    currentValue: hasValue ? currentValue : null,
                                    ref: rawInput
                                });
                            }
                        });
                    } catch (error) {
                        console.warn(`Failed to get inputs for state machine "${smName}":`, error);
                    }

                    return {
                        name: smName,
                        inputNames: inputs.map(i => i.name),
                        inputs
                    };
                });

                console.log('🔍 RiveBackground discovered state machines:', machines);

                if (onRiveDiscovery && machines.length > 0) {
                    onRiveDiscovery(machines);
                }

                const totalInputs = machines.reduce((sum, m) => sum + m.inputs.length, 0);
                if (totalInputs === 0 && attempts < maxAttempts) {
                    setTimeout(discoverMachinesAndInputs, 120 * attempts);
                }

            } catch (error) {
                console.error('Error during state machine discovery:', error);
                if (attempts < maxAttempts) {
                    setTimeout(discoverMachinesAndInputs, 120 * attempts);
                }
            }
        };

        discoverMachinesAndInputs();

        return () => {
            stopped = true;
        };
    }, [rive, onRiveDiscovery]);

    // Bind input logic - EXACT COPY from FrameEngine_Canvas
    useEffect(() => {
        if (!rive || !inputs) return;

        let attempts = 0;
        let stopped = false;
        const maxAttempts = 20;
        const inputRefs: Record<string, any> = {};

        const discoverAndBindInputs = () => {
            if (stopped || !rive) return;
            attempts++;

            try {
                const smNames: string[] = Array.isArray(rive.stateMachineNames) ? rive.stateMachineNames : [];

                smNames.forEach((sm) => {
                    try { rive.play(sm); } catch { }
                });

                const newDiscoveredInputs: Record<string, any> = {};

                Object.entries(inputs).forEach(([inputKey, inputValue]) => {
                    let targetMachine: string;
                    let inputName: string;

                    if (inputKey.includes('.')) {
                        const parts = inputKey.split('.');
                        targetMachine = parts[0];
                        inputName = parts.slice(1).join('.');
                    } else {
                        targetMachine = stateMachine || smNames[0];
                        inputName = inputKey;
                    }

                    if (!targetMachine) {
                        console.warn(`⚠️ No target state machine found for input "${inputKey}"`);
                        return;
                    }

                    if (!smNames.includes(targetMachine)) {
                        console.warn(`⚠️ State machine "${targetMachine}" not found. Available: ${smNames.join(', ')}`);
                        return;
                    }

                    console.log(`🔍 Looking for input "${inputName}" in state machine "${targetMachine}"`);

                    const machineInputs = rive.stateMachineInputs
                        ? (rive.stateMachineInputs(targetMachine) as any[])
                        : [];

                    const foundInput = machineInputs.find((i) => i?.name === inputName);

                    if (foundInput) {
                        inputRefs[inputKey] = foundInput;

                        let inputType = 'unknown';
                        let hasValue = false;
                        let currentValue: any;

                        try {
                            currentValue = foundInput.value;
                            hasValue = true;

                            if (typeof currentValue === 'number') {
                                inputType = 'number';
                            } else if (typeof currentValue === 'boolean') {
                                inputType = 'boolean';
                            }
                        } catch {
                            try {
                                if (typeof foundInput.fire === 'function') {
                                    inputType = 'trigger';
                                }
                            } catch { }
                        }

                        newDiscoveredInputs[inputKey] = {
                            ref: foundInput,
                            type: inputType,
                            currentValue: hasValue ? currentValue : null,
                            stateMachine: targetMachine,
                            inputName: inputName
                        };

                        try {
                            if (inputType === 'trigger') {
                                if (inputValue && typeof foundInput.fire === 'function') {
                                    foundInput.fire();
                                    console.log(`🔥 Fired trigger "${inputName}" in "${targetMachine}"`);
                                }
                            } else if (hasValue) {
                                const newValue = inputType === 'boolean' ? Boolean(inputValue) : Number(inputValue) || 0;
                                foundInput.value = newValue;
                                console.log(`✅ Set "${inputName}" in "${targetMachine}" (${inputType}) to:`, newValue);
                            }
                        } catch (error) {
                            console.error(`❌ Error applying input "${inputName}" in "${targetMachine}":`, error);
                        }
                    } else {
                        console.warn(`⚠️ Input "${inputName}" not found in state machine "${targetMachine}"`);
                        console.log(`Available inputs in "${targetMachine}":`, machineInputs.map(i => i?.name).filter(Boolean));
                    }
                });

                setDiscoveredInputs(newDiscoveredInputs);

                const foundCount = Object.keys(newDiscoveredInputs).length;
                const expectedCount = Object.keys(inputs).length;

                if (foundCount < expectedCount && attempts < maxAttempts) {
                    setTimeout(discoverAndBindInputs, 120 * attempts);
                }

            } catch (error) {
                console.error('Error during input discovery:', error);
                if (attempts < maxAttempts) {
                    setTimeout(discoverAndBindInputs, 120 * attempts);
                }
            }
        };

        discoverAndBindInputs();

        return () => {
            stopped = true;
            setDiscoveredInputs({});
        };
    }, [rive, stateMachine, inputs]);

    // Apply input changes - EXACT COPY from FrameEngine_Canvas
    useEffect(() => {
        if (!inputs || Object.keys(discoveredInputs).length === 0) return;

        Object.entries(inputs).forEach(([inputKey, inputValue]) => {
            const discovered = discoveredInputs[inputKey];
            if (!discovered || !discovered.ref) return;

            try {
                if (discovered.type === 'trigger') {
                    if (inputValue && typeof discovered.ref.fire === 'function') {
                        discovered.ref.fire();
                        console.log(`🔥 Fired trigger "${discovered.inputName}" in "${discovered.stateMachine}" via update`);
                    }
                } else {
                    const newValue = discovered.type === 'boolean' ? Boolean(inputValue) : Number(inputValue) || 0;
                    if (discovered.ref.value !== newValue) {
                        discovered.ref.value = newValue;
                        console.log(`🔄 Updated "${discovered.inputName}" in "${discovered.stateMachine}" to:`, newValue);
                    }
                }
            } catch (error) {
                console.error(`❌ Error updating input "${discovered.inputName}" in "${discovered.stateMachine}":`, error);
            }
        });
    }, [inputs, discoveredInputs]);

    return (
        <div
            style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 0,
            }}
        >
            <RiveComponent
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'block'
                }}
            />
        </div>
    );
};

const VirtualScreenViewer: React.FC<VirtualScreenViewerProps> = ({
    deviceId: propDeviceId,
    containerHeight,
    showControls = true,
    onFullscreenClick,
    deviceData: providedDeviceData,
    isStandalone = false
}) => {
    const { deviceId: urlDeviceId } = useParams<{ deviceId: string }>();
    const navigate = useNavigate();

    // Determine mode and device ID
    const isEmbedded = !isStandalone && containerHeight !== undefined;
    const deviceId = propDeviceId || urlDeviceId;

    // Core state
    const [device, setDevice] = useState<any>(null);
    const [riveConfig, setRiveConfig] = useState<RiveConfig | null>(null);
    const [displayElements, setDisplayElements] = useState<DisplayElement[]>([]);
    const [currentSensorData, setSensorData] = useState<Record<string, any>>({});
    const [riveFileBlob, setRiveFileBlob] = useState<string | null>(null);
    const [isConfigured, setIsConfigured] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // Fullscreen state (standalone only)
    const [isFullscreen, setIsFullscreen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Canvas positioning state
    const [canvasBounds, setCanvasBounds] = useState<CanvasBounds | null>(null);
    const riveContainerRef = useRef<HTMLDivElement>(null);

    // State machine input refs for direct control
    const stateMachineInputRefs = useRef<Record<string, any>>({});

    // Rive state machine mappings - maps sensor tags to Rive inputs
    const [sensorToRiveMap, setSensorToRiveMap] = useState<Record<string, string[]>>({});

    // WebSocket connection for real-time data
    const {
        streams,
        connectionStatus,
        isConnected,
        reconnect
    } = useDashboardWebSocket({
        enabled: true,
        defaultPollRate: 250
    });

    // Load device details
    useEffect(() => {
        if (!deviceId) {
            console.error('[VirtualScreenViewer] No device ID provided');
            setError('No device ID provided');
            setLoading(false);
            return;
        }

        if (providedDeviceData) {
            console.log('[VirtualScreenViewer] Using provided device data:', providedDeviceData);
            setDevice(providedDeviceData);
            setLoading(false);
            return;
        }

        const loadDevice = async () => {
            try {
                console.log('[VirtualScreenViewer] Loading device from API:', deviceId);
                const response = await fetch(`/api/devices/${deviceId}`);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('[VirtualScreenViewer] Device API error:', response.status, errorText);
                    throw new Error(`Failed to load device: ${response.status} ${errorText}`);
                }

                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    const responseText = await response.text();
                    console.error('[VirtualScreenViewer] Non-JSON response:', responseText.substring(0, 200));
                    throw new Error(`API returned HTML instead of JSON. Check if the API endpoint exists.`);
                }

                const deviceData = await response.json();

                if (deviceData.type !== 'Virtual Screen' && !isEmbedded) {
                    throw new Error(`Device is not a virtual screen (type: ${deviceData.type})`);
                }

                setDevice(deviceData);
            } catch (err) {
                console.error('[VirtualScreenViewer] Error loading device:', err);
                setError(err instanceof Error ? err.message : 'Failed to load device');
            } finally {
                setLoading(false);
            }
        };

        loadDevice();
    }, [deviceId, providedDeviceData, isEmbedded]);

    // Monitor streams for this virtual screen's data
    useEffect(() => {
        if (!device || !streams || !Array.isArray(streams)) {
            return;
        }

        const matchingStream = streams.find(stream => {
            return stream.screenId === parseInt(deviceId!) ||
                stream.deviceName === device.name ||
                stream.screenName === device.name;
        });

        if (matchingStream && matchingStream.configPayloadJson) {
            try {
                const configData = JSON.parse(matchingStream.configPayloadJson);

                if (configData.type === 'rive_config') {
                    processConfig(configData);
                }
            } catch (err) {
                console.error('[VirtualScreenViewer] Error parsing config:', err);
            }
        }

        streams.forEach(stream => {
            if (stream.lastSentPayloadJson) {
                try {
                    const sensorData = JSON.parse(stream.lastSentPayloadJson);
                    if (sensorData.type === 'rive_sensor' &&
                        (sensorData.screenId === parseInt(deviceId!) ||
                            sensorData.screenId === device.uniqueIdentifier ||
                            sensorData.screenId === deviceId ||
                            sensorData.screenId === "virtual")) {
                        processSensorData(sensorData);
                    }
                } catch (err) {
                    console.error('[VirtualScreenViewer] Error parsing sensor data:', err);
                }
            }
        });
    }, [device, streams, deviceId]);

    // Calculate canvas bounds and scaling for overlay positioning
    const calculateCanvasBounds = useCallback(() => {
        if (!riveContainerRef.current || !riveConfig) {
            return;
        }

        const container = riveContainerRef.current;
        const containerRect = container.getBoundingClientRect();
        const canvasConfig = getCanvasConfig(riveConfig);

        if (isEmbedded) {
            const containerWidth = containerRect.width;
            const containerHeight = containerRect.height;

            const scaleX = containerWidth / canvasConfig.width;
            const scaleY = containerHeight / canvasConfig.height;
            const scale = Math.min(scaleX, scaleY);

            const scaledWidth = canvasConfig.width * scale;
            const scaledHeight = canvasConfig.height * scale;

            const canvasLeft = (containerWidth - scaledWidth) / 2;
            const canvasTop = (containerHeight - scaledHeight) / 2;

            setCanvasBounds({
                left: canvasLeft,
                top: canvasTop,
                width: scaledWidth,
                height: scaledHeight,
                scaleX: scale,
                scaleY: scale,
            });
        } else {
            const canvasWidth = canvasConfig.width;
            const canvasHeight = canvasConfig.height;

            if (isFullscreen) {
                const canvasLeft = (containerRect.width - canvasWidth) / 2;
                const canvasTop = (containerRect.height - canvasHeight) / 2;

                setCanvasBounds({
                    left: canvasLeft,
                    top: canvasTop,
                    width: canvasWidth,
                    height: canvasHeight,
                    scaleX: 1,
                    scaleY: 1,
                });
            } else {
                const canvasLeft = (containerRect.width - canvasWidth) / 2;
                const canvasTop = 20;

                setCanvasBounds({
                    left: canvasLeft,
                    top: canvasTop,
                    width: canvasWidth,
                    height: canvasHeight,
                    scaleX: 1,
                    scaleY: 1,
                });
            }
        }
    }, [riveConfig, isEmbedded, isFullscreen]);

    // Use ResizeObserver for reliable resize detection
    useEffect(() => {
        if (!riveContainerRef.current || !riveConfig) return;

        let timeoutId: NodeJS.Timeout;

        const debouncedCalculate = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                calculateCanvasBounds();
            }, 16);
        };

        const resizeObserver = new ResizeObserver((entries) => {
            debouncedCalculate();
        });

        resizeObserver.observe(riveContainerRef.current);
        setTimeout(calculateCanvasBounds, 200);

        return () => {
            resizeObserver.disconnect();
            clearTimeout(timeoutId);
        };
    }, [riveConfig, calculateCanvasBounds]);

    // Listen for window resize and orientation changes (standalone mode)
    useEffect(() => {
        if (isEmbedded) return;

        let timeoutId: NodeJS.Timeout;

        const debouncedCalculate = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                calculateCanvasBounds();
            }, 16);
        };

        const handleResize = () => {
            debouncedCalculate();
        };

        const handleOrientationChange = () => {
            setTimeout(calculateCanvasBounds, 300);
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleOrientationChange);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('orientationchange', handleOrientationChange);
            clearTimeout(timeoutId);
        };
    }, [calculateCanvasBounds, isEmbedded]);

    // Get canvas dimensions and background from config
    const getCanvasConfig = (config: RiveConfig) => {
        const canvas = config.frameConfig?.frameConfig?.canvas || config.frameConfig?.canvas;
        const background = config.frameConfig?.frameConfig?.background || config.frameConfig?.background;

        return {
            width: canvas?.width || 400,
            height: canvas?.height || 1280,
            orientation: canvas?.orientation || 'portrait',
            backgroundColor: background?.color || '#000000',
            backgroundType: background?.type || 'color'
        };
    };

    // Process Rive file data (URL download only)
    const processRiveFileData = async (config: RiveConfig) => {
        const riveConfig = config.frameConfig?.frameConfig?.rive || config.frameConfig?.rive;

        if (riveConfig?.fileUrl) {
            try {
                const response = await fetch(riveConfig.fileUrl);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                setRiveFileBlob(blobUrl);
                return blobUrl;
            } catch (error) {
                console.error('[VirtualScreenViewer] Download failed:', error);
                return null;
            }
        } else if (riveConfig?.file) {
            const fileUrl = `/api/frameengine/rive-files/${riveConfig.file}/content`;
            setRiveFileBlob(fileUrl);
            return fileUrl;
        } else {
            console.warn('[VirtualScreenViewer] No Rive file URL or file reference found in config');
            return null;
        }
    };

    // Extract display elements from config
    const extractDisplayElements = (config: RiveConfig) => {
        const elements = config.frameElements || [];

        const displayElements: DisplayElement[] = elements.map(element => ({
            id: element.id,
            type: element.type as 'sensor' | 'text',
            position: element.position,
            properties: element.properties,
            sensorTag: element.properties.sensorTag,
            text: element.properties.text,
            riveConnections: element.riveConnections,
        }));

        setDisplayElements(displayElements);
        return displayElements;
    };

    // Build sensor tag to Rive input mapping from config
    const buildSensorToRiveMapping = (config: RiveConfig) => {
        const mapping: Record<string, string[]> = {};

        const riveConfig = config.frameConfig?.frameConfig?.rive || config.frameConfig?.rive;
        const discovery = riveConfig?.discovery;

        if (discovery) {
            const elements = config.frameElements || [];
            elements.forEach(element => {
                if (element.properties.sensorTag && element.riveConnections?.availableInputs) {
                    const sensorTag = element.properties.sensorTag;
                    const riveInputs: string[] = [];

                    element.riveConnections.availableInputs.forEach(connection => {
                        const fullKey = connection.fullKey || `${connection.machineName}.${connection.inputName}`;
                        riveInputs.push(fullKey);
                    });

                    if (riveInputs.length > 0) {
                        mapping[sensorTag] = riveInputs;
                    }
                }
            });
        }

        setSensorToRiveMap(mapping);
        return mapping;
    };

    // Process incoming config
    const processConfig = async (config: RiveConfig) => {
        setRiveConfig(config);
        await processRiveFileData(config);
        extractDisplayElements(config);
        buildSensorToRiveMapping(config);

        setIsConfigured(true);
    };

    // Process incoming sensor data with enhanced comma-separated sensor tag support
    const processSensorData = (sensorPayload: SensorPayload) => {
        if (!riveConfig) {
            return;
        }

        if (sensorPayload.screenId !== riveConfig.screenId) {
            return;
        }

        const expandedSensorData: Record<string, any> = {};
        const newMappings: Record<string, string[]> = { ...sensorToRiveMap };

        Object.entries(sensorPayload.sensors).forEach(([sensorKey, sensorData]) => {
            const sensorTags = sensorKey.split(',').map(tag => tag.trim());

            if (sensorTags.length > 1) {
                const sensorTag = sensorTags[0];
                const riveInputName = sensorTags[1];

                const availableInputKeys = Object.keys(stateMachineInputRefs.current);
                const fullRiveKey = availableInputKeys.find(key => key.endsWith(`.${riveInputName}`)) || riveInputName;

                if (!newMappings[sensorTag]) {
                    newMappings[sensorTag] = [];
                }
                if (!newMappings[sensorTag].includes(fullRiveKey)) {
                    newMappings[sensorTag].push(fullRiveKey);
                }

                expandedSensorData[sensorTag] = sensorData;
                expandedSensorData[riveInputName] = sensorData;
            } else {
                const tag = sensorTags[0];
                expandedSensorData[tag] = sensorData;
            }
        });

        if (Object.keys(newMappings).length > Object.keys(sensorToRiveMap).length) {
            setSensorToRiveMap(newMappings);
        }

        setSensorData(expandedSensorData);

        setDisplayElements(prev =>
            prev.map(element => {
                if (element.type === 'sensor' && element.sensorTag) {
                    const sensorData = expandedSensorData[element.sensorTag];
                    if (sensorData) {
                        return {
                            ...element,
                            currentValue: sensorData.value.toString(),
                            currentUnit: sensorData.unit,
                        };
                    }
                }
                return element;
            })
        );

        updateRiveInputsFromSensorData(expandedSensorData, newMappings);
    };

    // Update Rive state machine inputs based on sensor data
    const updateRiveInputsFromSensorData = (sensorData: Record<string, any>, mappings?: Record<string, string[]>) => {
        if (!rive || Object.keys(stateMachineInputRefs.current).length === 0) {
            return;
        }

        const currentMappings = mappings || sensorToRiveMap;

        Object.entries(sensorData).forEach(([sensorTag, data]) => {
            const riveInputKeys = currentMappings[sensorTag] || [];

            riveInputKeys.forEach(riveInputKey => {
                const inputRef = stateMachineInputRefs.current[riveInputKey];
                if (inputRef) {
                    try {
                        const newValue = Number(data.value) || 0;
                        inputRef.value = newValue;
                    } catch (error) {
                        console.error(`Error updating Rive input "${riveInputKey}":`, error);
                    }
                }
            });

            const directInputRef = stateMachineInputRefs.current[sensorTag];
            if (directInputRef) {
                try {
                    const newValue = Number(data.value) || 0;
                    directInputRef.value = newValue;
                } catch (error) {
                    console.error(`Error updating Rive input "${sensorTag}":`, error);
                }
            }
        });
    };

    // Set up Rive with appropriate layout based on mode
    const riveOptions = useMemo(() => ({
        src: riveFileBlob || '',
        autoplay: true,
        layout: new Layout({
            fit: isEmbedded ? Fit.Contain : Fit.None,
            alignment: Alignment.Center
        }),
        onLoad: () => {
            setTimeout(() => calculateCanvasBounds(), 100);
            setTimeout(() => calculateCanvasBounds(), 300);
            setTimeout(() => calculateCanvasBounds(), 500);
        },
        onLoadError: (error: any) => {
            console.error('[VirtualScreenViewer] Rive load error:', error);
        },
    }), [riveFileBlob, calculateCanvasBounds, isEmbedded]);

    const { rive, RiveComponent } = useRive(riveOptions);

    // Build state machine input references when Rive loads
    useEffect(() => {
        if (!rive) return;

        const buildInputRefs = () => {
            const inputRefs: Record<string, any> = {};

            try {
                const stateMachineNames = rive.stateMachineNames || [];

                stateMachineNames.forEach((machineName: string) => {
                    try {
                        rive.play(machineName);

                        const inputs = rive.stateMachineInputs(machineName) || [];

                        inputs.forEach((input: any) => {
                            if (input && input.name) {
                                const fullKey = `${machineName}.${input.name}`;
                                inputRefs[fullKey] = input;
                                inputRefs[input.name] = input;
                            }
                        });
                    } catch (error) {
                        console.error(`Error processing state machine "${machineName}":`, error);
                    }
                });

                stateMachineInputRefs.current = inputRefs;

                if (Object.keys(currentSensorData).length > 0) {
                    updateRiveInputsFromSensorData(currentSensorData);
                }
            } catch (error) {
                console.error('Error building state machine inputs:', error);
            }
        };

        const timer = setTimeout(buildInputRefs, 100);
        return () => clearTimeout(timer);
    }, [rive, currentSensorData, sensorToRiveMap]);

    // Fullscreen handlers (standalone only)
    const toggleFullscreen = async () => {
        if (isEmbedded || !containerRef.current) return;

        try {
            if (!isFullscreen) {
                await containerRef.current.requestFullscreen();
            } else {
                await document.exitFullscreen();
            }
        } catch (err) {
            console.error('Fullscreen error:', err);
        }
    };

    // Listen for fullscreen changes and recalculate bounds (standalone only)
    useEffect(() => {
        if (isEmbedded) return;

        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
            setTimeout(() => calculateCanvasBounds(), 100);
            setTimeout(() => calculateCanvasBounds(), 300);
            setTimeout(() => calculateCanvasBounds(), 500);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, [calculateCanvasBounds, isEmbedded]);

    // Load Google Fonts when elements change - EXACT COPY from FrameEngine_Canvas
    useEffect(() => {
        const fontsToLoad = new Set<string>();

        displayElements.forEach(element => {
            const fontFamily = element.properties.fontFamily;
            if (fontFamily && fontFamily !== 'Inter' && !fontFamily.includes('system')) {
                fontsToLoad.add(fontFamily);
            }
        });

        fontsToLoad.forEach(loadGoogleFont);
    }, [displayElements]);

    // Render overlay elements with canvas-relative positioning - PIXEL PERFECT VERSION WITH PADDING
    const renderOverlayElements = () => {
        if (!riveConfig || !canvasBounds) return null;

        return displayElements.map((element) => {
            let content = '';
            let textColor = element.properties.textColor || element.properties.color || '#929e00';

            if (element.type === 'sensor' && element.sensorTag) {
                const sensorData = currentSensorData[element.sensorTag];
                const value = sensorData?.value?.toString() || element.properties.placeholderValue || '--';
                const unit = sensorData?.unit || element.properties.placeholderUnit || '';
                const showUnit = element.properties.showUnit !== false;
                const showLabel = element.properties.showLabel !== false;
                const label = element.properties.placeholderSensorLabel || '';

                let contentParts = [];

                if (showLabel && label) {
                    contentParts.push(label);
                }

                contentParts.push(value);

                if (showUnit && unit) {
                    contentParts.push(unit);
                }

                content = contentParts.join(' ');
            } else if (element.type === 'text') {
                content = element.properties.text || '';
            }

            const fontSize = element.properties.fontSize || 32;
            const configuredFont = element.properties.fontFamily;
            const fontFamily = configuredFont || 'system-ui';
            const fontWeight = element.properties.fontWeight || '900';
            const textAlign = element.properties.textAlign || 'left';

            // Load Google Fonts properly - EXACT COPY from FrameEngine_Canvas
            if (fontFamily &&
                fontFamily !== 'system-ui' &&
                fontFamily !== 'Arial' &&
                fontFamily !== 'Helvetica' &&
                !fontFamily.includes('system') &&
                !fontFamily.includes('sans-serif') &&
                !fontFamily.includes('serif') &&
                !fontFamily.includes('monospace')) {
                loadGoogleFont(fontFamily);
            }

            // Calculate position relative to canvas bounds
            const scaledLeft = canvasBounds.left + (element.position.x * canvasBounds.scaleX);
            const scaledTop = canvasBounds.top + (element.position.y * canvasBounds.scaleY);
            const scaledWidth = element.position.width * canvasBounds.scaleX;
            const scaledHeight = element.position.height * canvasBounds.scaleY;
            const scaledFontSize = fontSize * Math.min(canvasBounds.scaleX, canvasBounds.scaleY);

            // CRITICAL: Calculate padding exactly like FrameEngine_Canvas
            // In the builder: padding: `${4 * scale}px`
            // We need to apply the same 4px base padding, scaled by our viewport scaling
            const basePadding = 4;
            const scaledPadding = basePadding * Math.min(canvasBounds.scaleX, canvasBounds.scaleY);

            // Build font stack that respects the configured font - EXACT COPY from FrameEngine_Canvas
            let fontStack;
            if (configuredFont) {
                fontStack = `"${configuredFont}", system-ui, -apple-system, sans-serif`;
            } else {
                fontStack = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            }

            // CRITICAL: Build styles object WITH padding to match builder
            const elementStyles: React.CSSProperties = {
                position: 'absolute',
                left: scaledLeft,
                top: scaledTop,
                width: scaledWidth,
                height: scaledHeight,
                fontSize: `${scaledFontSize}px`,
                fontFamily: fontStack,
                color: textColor,
                fontWeight: fontWeight,
                pointerEvents: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: textAlign === 'center' ? 'center' :
                    textAlign === 'right' ? 'flex-end' : 'flex-start',
                justifyContent: 'center',
                zIndex: element.properties.zIndex || 10,
                // CRITICAL: Add the same padding as FrameEngine_Canvas
                padding: `${scaledPadding}px`,
                boxSizing: 'border-box',
                wordWrap: 'break-word',
                overflow: 'hidden',
                lineHeight: element.properties.lineHeight || '1.4',
            };

            // ONLY add textShadow if explicitly defined in properties (NO HARDCODING)
            if (element.properties.textShadow === true) {
                elementStyles.textShadow = '1px 1px 2px rgba(0,0,0,0.3)';
            }

            // ONLY add textBorder if explicitly defined in properties
            if (element.properties.textBorder === true) {
                elementStyles.WebkitTextStroke = '1px rgba(0,0,0,0.5)';
            }

            return (
                <div
                    key={element.id}
                    style={elementStyles}
                >
                    {content}
                </div>
            );
        });
    };

    // Handle full-screen navigation or toggle
    const handleFullscreenClick = () => {
        if (isEmbedded) {
            if (onFullscreenClick) {
                onFullscreenClick();
            } else {
                window.open(`/device/${deviceId}/virtual-screen`, "_blank");
            }
        } else {
            toggleFullscreen();
        }
    };

    // Loading state
    if (loading) {
        const loadingHeight = isEmbedded ? containerHeight : '100vh';

        return (
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: loadingHeight,
                gap: 2,
                backgroundColor: isEmbedded ? '#000' : 'inherit',
                color: isEmbedded ? 'white' : 'inherit',
                borderRadius: isEmbedded ? 1 : 0
            }}>
                <CircularProgress size={isEmbedded ? 40 : 60} />
                <Typography variant={isEmbedded ? "body2" : "h6"}>
                    Loading virtual screen...
                </Typography>
            </Box>
        );
    }

    // Error state
    if (error) {
        const errorHeight = isEmbedded ? containerHeight : 'auto';

        return (
            <Box sx={{
                height: errorHeight,
                p: isEmbedded ? 2 : 3,
                backgroundColor: isEmbedded ? '#000' : 'inherit',
                color: isEmbedded ? 'white' : 'inherit',
                borderRadius: isEmbedded ? 1 : 0,
                display: isEmbedded ? 'flex' : 'block',
                flexDirection: isEmbedded ? 'column' : 'row',
                justifyContent: isEmbedded ? 'center' : 'flex-start'
            }}>
                <Alert
                    severity="error"
                    sx={{
                        mb: 2,
                        backgroundColor: isEmbedded ? 'rgba(244, 67, 54, 0.1)' : 'inherit',
                        color: isEmbedded ? 'white' : 'inherit'
                    }}
                >
                    {error}
                </Alert>
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button
                        variant={isEmbedded ? "outlined" : "contained"}
                        onClick={() => window.location.reload()}
                        size={isEmbedded ? "small" : "medium"}
                        sx={isEmbedded ? { color: 'white', borderColor: 'white', alignSelf: 'flex-start' } : {}}
                    >
                        Retry
                    </Button>
                </Box>
            </Box>
        );
    }

    // Not configured state
    if (!isConfigured) {
        const waitingHeight = isEmbedded ? containerHeight : '100vh';

        return (
            <Box sx={{
                height: waitingHeight,
                backgroundColor: '#000',
                color: '#fff',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'system-ui, Arial, sans-serif',
                fontSize: isEmbedded ? '14px' : '18px',
                borderRadius: isEmbedded ? 1 : 0,
                position: 'relative',
                width: isEmbedded ? '100%' : '100vw',
                ...(isEmbedded ? {} : { position: 'fixed', top: 0, left: 0 })
            }}>
                <div style={{ textAlign: 'center', maxWidth: isEmbedded ? '300px' : '600px', padding: '20px' }}>
                    <div style={{ marginBottom: isEmbedded ? '16px' : '20px', fontSize: isEmbedded ? '32px' : '48px' }}>⏳</div>
                    <Typography variant={isEmbedded ? "subtitle2" : "h5"} gutterBottom>
                        {device?.name || 'Virtual Screen'}
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 2, fontSize: isEmbedded ? '12px' : 'inherit' }}>
                        Waiting for stream configuration...
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: isEmbedded ? '11px' : 'inherit' }}>
                        WebSocket: {isConnected ? '✅ Connected' : '❌ Disconnected'}
                    </Typography>
                    {!isConnected && (
                        <Button
                            variant="outlined"
                            onClick={reconnect}
                            size={isEmbedded ? "small" : "medium"}
                            sx={{
                                mt: isEmbedded ? 1 : 2,
                                color: 'white',
                                borderColor: 'white',
                                fontSize: isEmbedded ? '11px' : 'inherit'
                            }}
                        >
                            Reconnect
                        </Button>
                    )}
                </div>

                {showControls && (
                    <Box sx={{
                        position: 'absolute',
                        top: isEmbedded ? 8 : 20,
                        right: isEmbedded ? 8 : 20,
                        display: 'flex',
                        gap: 1
                    }}>
                        {!isEmbedded && (
                            <Fab
                                color="primary"
                                onClick={() => navigate('/devices')}
                                size={isEmbedded ? "small" : "medium"}
                            >
                                <ArrowBack />
                            </Fab>
                        )}
                        <IconButton
                            size="small"
                            onClick={handleFullscreenClick}
                            sx={{ color: 'white', backgroundColor: 'rgba(255,255,255,0.1)' }}
                        >
                            {isEmbedded ? <Launch fontSize="small" /> : <Fullscreen fontSize="small" />}
                        </IconButton>
                    </Box>
                )}
            </Box>
        );
    }

    // Main visualization view
    const canvasConfig = riveConfig ? getCanvasConfig(riveConfig) : { width: 400, height: 1280, orientation: 'portrait', backgroundColor: '#000000', backgroundType: 'color' };

    if (isEmbedded) {
        // Embedded mode - render in container
        return (
            <Box
                sx={{
                    position: 'relative',
                    width: '100%',
                    height: containerHeight,
                    backgroundColor: canvasConfig.backgroundColor,
                    borderRadius: 1,
                    overflow: 'hidden'
                }}
            >
                {/* Rive animation container */}
                <div
                    ref={riveContainerRef}
                    style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative'
                    }}
                >
                    {riveFileBlob && riveConfig && (
                        <RiveComponent style={{
                            width: '100%',
                            height: '100%',
                            display: 'block'
                        }} />
                    )}
                </div>

                {/* Overlay elements positioned relative to canvas */}
                {renderOverlayElements()}

                {/* Control buttons */}
                {showControls && (
                    <Box sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        display: 'flex',
                        gap: 1,
                        zIndex: 1000,
                    }}>
                        <IconButton
                            size="small"
                            onClick={handleFullscreenClick}
                            sx={{
                                color: 'white',
                                backgroundColor: 'rgba(0,0,0,0.7)',
                                '&:hover': { backgroundColor: 'rgba(0,0,0,0.8)' }
                            }}
                            title="Open in fullscreen"
                        >
                            <Launch fontSize="small" />
                        </IconButton>
                        <IconButton
                            size="small"
                            onClick={reconnect}
                            sx={{
                                color: isConnected ? 'lightgreen' : 'orange',
                                backgroundColor: 'rgba(0,0,0,0.7)',
                                '&:hover': { backgroundColor: 'rgba(0,0,0,0.8)' }
                            }}
                            title={isConnected ? 'Connected' : 'Reconnect'}
                        >
                            <Refresh fontSize="small" />
                        </IconButton>
                    </Box>
                )}

                {/* Status indicator */}
                {showControls && (
                    <Box sx={{
                        position: 'absolute',
                        bottom: 8,
                        left: 8,
                        backgroundColor: 'rgba(0,0,0,0.7)',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: 1,
                        fontSize: '10px',
                        zIndex: 1000,
                    }}>
                        <Typography variant="caption" sx={{ fontSize: '10px' }}>
                            {canvasConfig.width}×{canvasConfig.height}
                        </Typography>
                        <br />
                        <Typography variant="caption" color={isConnected ? 'lightgreen' : 'orange'} sx={{ fontSize: '9px' }}>
                            {isConnected ? '🟢' : '🟡'} {Object.keys(currentSensorData).length} sensors
                        </Typography>
                    </Box>
                )}
            </Box>
        );
    } else {
        // Standalone mode - render fullscreen
        return (
            <div
                ref={containerRef}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    margin: 0,
                    padding: 0,
                    backgroundColor: canvasConfig.backgroundColor,
                    overflow: isFullscreen ? 'hidden' : 'auto',
                    cursor: isFullscreen ? 'none' : 'default',
                }}
            >
                {/* Rive animation - fixed size container */}
                <div
                    ref={riveContainerRef}
                    style={{
                        width: '100%',
                        minHeight: isFullscreen ? '100vh' : riveConfig ? `${getCanvasConfig(riveConfig).height}px` : '100vh',
                        height: isFullscreen ? '100vh' : 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingTop: isFullscreen ? 0 : '20px',
                        paddingBottom: isFullscreen ? 0 : '20px'
                    }}
                >
                    {riveFileBlob && riveConfig && (
                        <div style={{
                            width: getCanvasConfig(riveConfig).width,
                            height: getCanvasConfig(riveConfig).height,
                            position: 'relative'
                        }}>
                            <RiveComponent style={{
                                width: '100%',
                                height: '100%',
                                display: 'block'
                            }} />
                        </div>
                    )}
                </div>

                {/* Overlay elements positioned relative to canvas */}
                {renderOverlayElements()}

                {/* Control buttons - hidden in fullscreen */}
                {!isFullscreen && showControls && (
                    <>
                        <Fab
                            color="primary"
                            onClick={() => navigate('/devices')}
                            sx={{
                                position: 'fixed',
                                top: 20,
                                left: 20,
                                zIndex: 1000,
                            }}
                        >
                            <ArrowBack />
                        </Fab>

                        <Fab
                            color="secondary"
                            onClick={toggleFullscreen}
                            sx={{
                                position: 'fixed',
                                top: 20,
                                right: 20,
                                zIndex: 1000,
                            }}
                        >
                            <Fullscreen />
                        </Fab>

                        <Box sx={{
                            position: 'fixed',
                            bottom: 20,
                            left: 20,
                            backgroundColor: 'rgba(0,0,0,0.7)',
                            color: 'white',
                            padding: '8px 12px',
                            borderRadius: 1,
                            zIndex: 1000,
                            fontSize: '12px'
                        }}>
                            <Typography variant="caption">
                                {device?.name} • {canvasConfig.width}×{canvasConfig.height}
                            </Typography>
                            <br />
                            <Typography variant="caption" color={isConnected ? 'lightgreen' : 'orange'}>
                                {isConnected ? '🟢 Live' : '🟡 Connecting'}
                            </Typography>
                            <br />
                            <Typography variant="caption" color="lightblue">
                                Sensors: {Object.keys(currentSensorData).length} • Inputs: {Object.keys(stateMachineInputRefs.current).length}
                            </Typography>
                            <br />
                            <Typography variant="caption" color="lightcyan">
                                Mappings: {Object.keys(sensorToRiveMap).length}
                            </Typography>
                        </Box>
                    </>
                )}
            </div>
        );
    }
};

export default VirtualScreenViewer;