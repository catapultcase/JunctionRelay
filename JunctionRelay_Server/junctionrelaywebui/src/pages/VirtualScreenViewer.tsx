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

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import {
    Box,
    Typography,
    CircularProgress,
    Alert,
    IconButton,
} from '@mui/material';
import {
    Launch,
    Refresh,
} from '@mui/icons-material';
import {
    VirtualDisplayDataProvider,
    RiveConfig,
    SensorPayload,
} from '../interfaces/VirtualDisplayDataProvider';
import { WebSocketDataProvider } from '../providers/WebSocketDataProvider';
import {
    FrameEngine_ElementRenderer,
    BaseElement,
    RendererConfig
} from '../components/frameengine/FrameEngine_ElementRenderer';
import {
    FrameEngine_BackgroundRenderer,
    BackgroundConfig,
    DiscoveredStateMachine,
    DiscoveredDataBinding
} from '../components/frameengine/FrameEngine_BackgroundRenderer';
import {
    convertValueForRiveBinding,
    extractSensorTags,
} from '../components/frameengine/FrameEngine_RiveUtils';

interface CanvasConfig {
    width: number;
    height: number;
    backgroundColor: string;
    elementPadding: number;
}

interface VirtualScreenViewerProps {
    deviceId?: string;
    containerHeight?: number;
    deviceData?: any;
    isStandalone?: boolean;
    showControls?: boolean;
    onFullscreenClick?: () => void;
}

interface VirtualScreenViewerComponentProps extends VirtualScreenViewerProps {
    dataProvider: VirtualDisplayDataProvider;
}

export const VirtualScreenViewerComponent: React.FC<VirtualScreenViewerComponentProps> = ({
    deviceId: propDeviceId,
    containerHeight,
    deviceData: providedDeviceData,
    isStandalone = false,
    showControls = true,
    onFullscreenClick,
    dataProvider
}) => {
    const { deviceId: urlDeviceId } = useParams<{ deviceId: string }>();
    const location = useLocation();

    const deviceId = propDeviceId || urlDeviceId;
    const isScreenshotMode = location.pathname.includes('/fullscreen');
    const shouldShowControls = showControls && !isScreenshotMode;
    const isEmbedded = !isStandalone && containerHeight !== undefined;

    const isPuppeteerMode = typeof window !== 'undefined' && (
        window.navigator.userAgent.includes('HeadlessChrome') ||
        window.navigator.webdriver ||
        (window as any).puppeteerMode ||
        isScreenshotMode
    );

    const [device, setDevice] = useState<any>(null);
    const [canvasConfig, setCanvasConfig] = useState<CanvasConfig | null>(null);
    const [backgroundConfig, setBackgroundConfig] = useState<BackgroundConfig | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const [riveConfig, setRiveConfig] = useState<RiveConfig | null>(null);
    const [currentSensorData, setSensorData] = useState<Record<string, any>>({});
    const [displayElements, setDisplayElements] = useState<BaseElement[]>([]);
    const [discoveredMachines, setDiscoveredMachines] = useState<DiscoveredStateMachine[]>([]);
    const [discoveredBindings, setDiscoveredBindings] = useState<DiscoveredDataBinding[]>([]);

    // Element-level Rive discoveries (for asset-rive elements)
    const [elementRiveDiscoveries, setElementRiveDiscoveries] = useState<Record<string, {
        machines: DiscoveredStateMachine[];
        bindings: DiscoveredDataBinding[];
    }>>({});

    const [currentBrightness, setCurrentBrightness] = useState<number>(1.0);

    // Use refs for binding values to avoid triggering re-renders
    const backgroundInputs = useRef<Record<string, any>>({});
    const backgroundBindings = useRef<Record<string, string | number | boolean>>({});
    // Track element-level rive inputs/bindings
    const elementRiveInputs = useRef<Record<string, Record<string, any>>>({});
    const elementRiveBindings = useRef<Record<string, Record<string, any>>>({});
    const isMountedRef = useRef(true);

    const extractDisplayElements = useCallback((config: RiveConfig) => {
        const elements = config.frameElements || [];
        const discoveries: Record<string, { machines: DiscoveredStateMachine[]; bindings: DiscoveredDataBinding[] }> = {};

        const baseElements: BaseElement[] = elements.map(element => ({
            id: element.id,
            type: element.type as BaseElement['type'],
            position: {
                x: element.position.x,
                y: element.position.y,
                width: element.position.width,
                height: element.position.height,
            },
            properties: element.properties,
            visible: (element as any).display?.visible ?? true,
        }));

        // Extract rive discoveries from asset-rive elements
        elements.forEach(element => {
            if (element.type === 'asset-rive' && (element as any).riveDiscovery) {
                const discovery = (element as any).riveDiscovery;
                discoveries[element.id] = {
                    machines: discovery.machines || [],
                    bindings: discovery.bindings || []
                };

                // Initialize element rive inputs/bindings refs
                const props = element.properties as any;
                elementRiveInputs.current[element.id] = { ...(props.riveInputs || {}) };
                elementRiveBindings.current[element.id] = { ...(props.riveBindings || {}) };

                console.log(`📡 Extracted Rive discovery for element ${element.id}:`, discoveries[element.id]);
            }
        });

        setElementRiveDiscoveries(discoveries);
        setDisplayElements(baseElements);
        return baseElements;
    }, []);

    const hasOnscreenElement = useCallback((sensorTag: string) => {
        return displayElements.some(element => {
            if (element.type === 'sensor' && element.properties.sensorTag) {
                return element.properties.sensorTag === sensorTag;
            }
            if (element.type === 'ecg' && element.properties.sensorTag) {
                return element.properties.sensorTag === sensorTag;
            }
            return false;
        });
    }, [displayElements]);

    const hasMatchingSensorData = useCallback((sensorTag: string, sensorPayload: SensorPayload) => {
        if (sensorPayload.sensors[sensorTag]) {
            return true;
        }

        return Object.keys(sensorPayload.sensors).some(key =>
            key.includes(',') && key.split(',').map(tag => tag.trim()).includes(sensorTag)
        );
    }, []);

    const processBrightnessSensor = useCallback((sensorPayload: SensorPayload) => {
        let brightnessValue: number | null = null;

        if (sensorPayload.sensors['jr_brightness']) {
            brightnessValue = sensorPayload.sensors['jr_brightness'].value;
        }

        Object.entries(sensorPayload.sensors).forEach(([sensorKey, sensorData]) => {
            if (sensorKey.includes(',')) {
                const sensorTags = sensorKey.split(',').map(tag => tag.trim());
                if (sensorTags.includes('jr_brightness')) {
                    brightnessValue = sensorData.value;
                }
            }
        });

        if (brightnessValue !== null) {
            const normalizedBrightness = Math.max(0, Math.min(1, brightnessValue / 255));

            if (normalizedBrightness !== currentBrightness) {
                setCurrentBrightness(normalizedBrightness);
                console.log(`JR Brightness sensor updated: ${brightnessValue} (${Math.round(normalizedBrightness * 100)}%)`);
                return true;
            }
        }

        return false;
    }, [currentBrightness]);

    const updateBackgroundInputs = useCallback((sensorPayload: SensorPayload) => {
        if (!discoveredMachines.length) return false;

        let hasChanges = false;

        Object.entries(sensorPayload.sensors).forEach(([sensorKey, sensorData]) => {
            const sensorTags = extractSensorTags(sensorKey);

            sensorTags.forEach(sensorTag => {
                const inputExists = discoveredMachines.some(machine =>
                    machine.inputs.some(input => input.name === sensorTag)
                );

                if (inputExists) {
                    const oldValue = backgroundInputs.current[sensorTag];
                    const newValue = sensorData.value;

                    if (oldValue !== newValue) {
                        backgroundInputs.current[sensorTag] = newValue;
                        hasChanges = true;
                        console.log(`Background input "${sensorTag}" updated: ${oldValue} -> ${newValue}`);
                    }
                }
            });
        });

        return hasChanges;
    }, [discoveredMachines]);

    const updateBackgroundBindings = useCallback((sensorPayload: SensorPayload) => {
        if (!discoveredBindings.length) return false;

        let hasChanges = false;

        Object.entries(sensorPayload.sensors).forEach(([sensorKey, sensorData]) => {
            const sensorTags = extractSensorTags(sensorKey);

            sensorTags.forEach(sensorTag => {
                const binding = discoveredBindings.find(b => b.name === sensorTag);

                if (binding) {
                    const oldValue = backgroundBindings.current[sensorTag];
                    const newValue = convertValueForRiveBinding(sensorData.value, binding.type as any);

                    if (oldValue !== newValue) {
                        backgroundBindings.current[sensorTag] = newValue;
                        hasChanges = true;
                        // console.log(`Background binding "${sensorTag}" (${binding.type}) updated: ${oldValue} -> ${newValue}`);
                    }
                }
            });
        });

        return hasChanges;
    }, [discoveredBindings]);

    // Update element-level Rive inputs based on sensor data
    const updateElementRiveInputs = useCallback((sensorPayload: SensorPayload) => {
        let hasChanges = false;
        const elementsToUpdate: string[] = [];

        Object.entries(elementRiveDiscoveries).forEach(([elementId, discovery]) => {
            if (!discovery.machines || discovery.machines.length === 0) return;

            discovery.machines.forEach(machine => {
                machine.inputs.forEach(input => {
                    Object.entries(sensorPayload.sensors).forEach(([sensorKey, sensorData]) => {
                        const sensorTags = extractSensorTags(sensorKey);

                        sensorTags.forEach(sensorTag => {
                            if (input.name === sensorTag) {
                                const oldValue = elementRiveInputs.current[elementId]?.[sensorTag];
                                const newValue = sensorData.value;

                                if (oldValue !== newValue) {
                                    if (!elementRiveInputs.current[elementId]) {
                                        elementRiveInputs.current[elementId] = {};
                                    }
                                    elementRiveInputs.current[elementId][sensorTag] = newValue;
                                    hasChanges = true;
                                    elementsToUpdate.push(elementId);
                                    console.log(`Element ${elementId} input "${sensorTag}" updated: ${oldValue} -> ${newValue}`);
                                }
                            }
                        });
                    });
                });
            });
        });

        return { hasChanges, elementsToUpdate: [...new Set(elementsToUpdate)] };
    }, [elementRiveDiscoveries]);

    // Update element-level Rive bindings based on sensor data
    const updateElementRiveBindings = useCallback((sensorPayload: SensorPayload) => {
        let hasChanges = false;
        const elementsToUpdate: string[] = [];

        Object.entries(elementRiveDiscoveries).forEach(([elementId, discovery]) => {
            if (!discovery.bindings || discovery.bindings.length === 0) return;

            discovery.bindings.forEach(binding => {
                Object.entries(sensorPayload.sensors).forEach(([sensorKey, sensorData]) => {
                    const sensorTags = extractSensorTags(sensorKey);

                    sensorTags.forEach(sensorTag => {
                        if (binding.name === sensorTag) {
                            const oldValue = elementRiveBindings.current[elementId]?.[sensorTag];
                            const newValue = convertValueForRiveBinding(sensorData.value, binding.type as any);

                            if (oldValue !== newValue) {
                                if (!elementRiveBindings.current[elementId]) {
                                    elementRiveBindings.current[elementId] = {};
                                }
                                elementRiveBindings.current[elementId][sensorTag] = newValue;
                                hasChanges = true;
                                elementsToUpdate.push(elementId);
                                console.log(`Element ${elementId} binding "${sensorTag}" (${binding.type}) updated: ${oldValue} -> ${newValue}`);
                            }
                        }
                    });
                });
            });
        });

        return { hasChanges, elementsToUpdate: [...new Set(elementsToUpdate)] };
    }, [elementRiveDiscoveries]);

    const processSensorData = useCallback((sensorPayload: SensorPayload) => {
        if (!isMountedRef.current || !riveConfig || sensorPayload.screenId !== riveConfig.screenId) {
            return;
        }

        setSensorData(sensorPayload.sensors);

        const brightnessProcessed = processBrightnessSensor(sensorPayload);
        const inputsChanged = updateBackgroundInputs(sensorPayload);
        const bindingsChanged = updateBackgroundBindings(sensorPayload);

        // Only update backgroundConfig if bindings or inputs actually changed
        if (inputsChanged || bindingsChanged) {
            setBackgroundConfig(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    riveInputs: { ...backgroundInputs.current },
                    riveBindings: { ...backgroundBindings.current }
                };
            });
        }

        // Update element-level Rive inputs/bindings
        const elementInputsResult = updateElementRiveInputs(sensorPayload);
        const elementBindingsResult = updateElementRiveBindings(sensorPayload);

        // Combine updated element IDs from both inputs and bindings
        const updatedElementIds = [...new Set([...elementInputsResult.elementsToUpdate, ...elementBindingsResult.elementsToUpdate])];

        // Update displayElements with new rive inputs/bindings for changed elements
        if (updatedElementIds.length > 0) {
            setDisplayElements(prev => prev.map(element => {
                if (element.type === 'asset-rive' && updatedElementIds.includes(element.id)) {
                    return {
                        ...element,
                        properties: {
                            ...element.properties,
                            riveInputs: { ...elementRiveInputs.current[element.id] },
                            riveBindings: { ...elementRiveBindings.current[element.id] }
                        }
                    };
                }
                return element;
            }));
        }

        const processedSensors = new Set<string>();

        if (brightnessProcessed) {
            processedSensors.add('jr_brightness');
        }

        Object.keys(sensorPayload.sensors).forEach(sensorKey => {
            if (sensorKey.includes(',')) {
                const tags = sensorKey.split(',').map(tag => tag.trim());
                tags.forEach(tag => {
                    if (hasOnscreenElement(tag) ||
                        backgroundInputs.current.hasOwnProperty(tag) ||
                        backgroundBindings.current.hasOwnProperty(tag)) {
                        processedSensors.add(tag);
                    }
                });
            } else {
                if (hasOnscreenElement(sensorKey) ||
                    backgroundInputs.current.hasOwnProperty(sensorKey) ||
                    backgroundBindings.current.hasOwnProperty(sensorKey)) {
                    processedSensors.add(sensorKey);
                }
            }
        });

        // console.log('New sensor data:');
        // Object.entries(sensorPayload.sensors).forEach(([tag, data]: [string, any], index) => {
        //     console.log(`  ${index + 1}. "${tag}": ${data.displayValue || `${data.value} ${data.unit || ''}`}`);
        // });

        const allSensorTags = new Set<string>();

        Object.keys(sensorPayload.sensors).forEach(key => {
            if (key.includes(',')) {
                key.split(',').map(tag => tag.trim()).forEach(tag => allSensorTags.add(tag));
            } else {
                allSensorTags.add(key);
            }
        });

        allSensorTags.forEach(sensorTag => {
            if (!processedSensors.has(sensorTag)) {
                const hasOnscreen = hasOnscreenElement(sensorTag);
                const hasData = hasMatchingSensorData(sensorTag, sensorPayload);
                const hasBackground = backgroundInputs.current.hasOwnProperty(sensorTag);
                const hasBinding = backgroundBindings.current.hasOwnProperty(sensorTag);
                console.log(`   Failed to process sensor "${sensorTag}" - no valid target found (hasOnscreen: ${hasOnscreen}, hasData: ${hasData}, hasBackground: ${hasBackground}, hasBinding: ${hasBinding})`);
            }
        });

    }, [riveConfig, hasOnscreenElement, hasMatchingSensorData, updateBackgroundInputs, updateBackgroundBindings, updateElementRiveInputs, updateElementRiveBindings, processBrightnessSensor]);

    const handleBackgroundDiscovery = useCallback((machines: DiscoveredStateMachine[], bindings: DiscoveredDataBinding[]) => {
        console.log('Background discovered state machines:', machines);
        console.log('Background discovered data bindings:', bindings);

        setDiscoveredMachines(machines);
        setDiscoveredBindings(bindings);

        // Initialize the refs with discovered values
        const initialInputs: Record<string, any> = {};
        machines.forEach(machine => {
            machine.inputs.forEach(input => {
                if (input.currentValue !== null) {
                    initialInputs[input.name] = input.currentValue;
                }
            });
        });
        backgroundInputs.current = initialInputs;

        const initialBindings: Record<string, string | number | boolean> = {};
        bindings.forEach(binding => {
            if (binding.currentValue !== null && binding.currentValue !== undefined) {
                initialBindings[binding.name] = binding.currentValue;
            }
        });
        backgroundBindings.current = initialBindings;
    }, []);

    useEffect(() => {
        if (loading || error) return;

        const processConfigData = (config: RiveConfig) => {
            console.log('Processing config data:', config);

            const canvas = config.frameConfig?.canvas;
            const background = config.frameConfig?.background;

            console.log('Canvas config:', canvas);
            console.log('Background config:', background);

            let elementPadding = 4;

            if ((canvas as any)?.settings?.elementPadding !== undefined) {
                elementPadding = (canvas as any).settings.elementPadding;
                console.log('Found elementPadding in canvas.settings:', elementPadding);
            } else if ((canvas as any)?.elementPadding !== undefined) {
                elementPadding = (canvas as any).elementPadding;
                console.log('Found elementPadding directly on canvas:', elementPadding);
            } else {
                console.log('No elementPadding found, using default:', elementPadding);
            }

            const canvasInfo: CanvasConfig = {
                width: canvas?.width || 400,
                height: canvas?.height || 1280,
                backgroundColor: background?.color || '#000000',
                elementPadding: elementPadding,
            };

            // FIXED: Create background config with video support
            const bgConfig: BackgroundConfig = {
                type: (background?.type as 'color' | 'image' | 'video' | 'rive') || 'color',
                color: background?.color,
                imageUrl: (background as any)?.imageUrl,
                videoUrl: (background as any)?.videoUrl, // ADD THIS
                riveFile: config.frameConfig?.rive?.fileUrl,
                riveStateMachine: (config as any).riveStateMachine || (background as any)?.riveStateMachine,
                riveInputs: backgroundInputs.current,
                riveBindings: backgroundBindings.current,
            };

            console.log('Final canvas info:', canvasInfo);
            console.log('Final background config:', bgConfig);

            setCanvasConfig(canvasInfo);
            setBackgroundConfig(bgConfig);
            setRiveConfig(config);
            extractDisplayElements(config);
            setIsReady(true);
        };

        const unsubscribeConfig = dataProvider.onConfigurationReceived(processConfigData);
        const unsubscribeSensor = dataProvider.onSensorDataReceived(processSensorData);

        dataProvider.connect();

        return () => {
            unsubscribeConfig();
            unsubscribeSensor();
        };
    }, [loading, error, dataProvider, processSensorData, extractDisplayElements]);

    useEffect(() => {
        if (!deviceId) {
            setError('No device ID provided');
            setLoading(false);
            return;
        }

        if (providedDeviceData) {
            setDevice(providedDeviceData);
            setLoading(false);
            return;
        }

        const loadDevice = async () => {
            try {
                const response = await fetch(`/api/devices/${deviceId}`);
                if (!response.ok) {
                    throw new Error(`Failed to load device: ${response.status}`);
                }
                const deviceData = await response.json();
                setDevice(deviceData);
                setLoading(false);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load device');
                setLoading(false);
            }
        };

        loadDevice();
    }, [deviceId, providedDeviceData]);

    useEffect(() => {
        isMountedRef.current = true;

        return () => {
            isMountedRef.current = false;
            dataProvider.disconnect();
            setTimeout(() => {
                dataProvider.cleanup();
            }, 100);
        };
    }, [dataProvider]);

    const rendererConfig: RendererConfig = useMemo(() => ({
        elementPadding: canvasConfig?.elementPadding || 4,
        isInteractive: false,
        showPlaceholders: false,
        enableSensorVisibility: true, // Enable sensor-based visibility in runtime
    }), [canvasConfig?.elementPadding]);

    const brightnessStyle = useMemo(() => {
        return {
            filter: `brightness(${currentBrightness})`
        };
    }, [currentBrightness]);

    const handleFullscreenClick = () => {
        if (isEmbedded) {
            if (onFullscreenClick) {
                onFullscreenClick();
            } else {
                window.open(`/device/${deviceId}/virtual-screen`, "_blank");
            }
        }
    };

    const reconnect = () => {
        dataProvider.connect();
    };

    if (loading) {
        return (
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: isEmbedded ? containerHeight : '100vh',
                gap: 2,
            }}>
                <CircularProgress size={40} />
                <Typography variant="body2">Loading virtual screen...</Typography>
            </Box>
        );
    }

    if (error) {
        return (
            <Box sx={{ p: 2 }}>
                <Alert severity="error">{error}</Alert>
            </Box>
        );
    }

    if (!isReady || !canvasConfig || !backgroundConfig) {
        return (
            <Box sx={{
                height: isEmbedded ? containerHeight : '100vh',
                backgroundColor: '#000',
                color: '#fff',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: isEmbedded ? '14px' : '18px',
            }}>
                <Typography variant={isEmbedded ? "subtitle2" : "h5"} gutterBottom>
                    {device?.name || 'Virtual Screen'}
                </Typography>
                <Typography variant="body2" sx={{ mb: 2 }}>
                    Waiting for configuration...
                </Typography>
            </Box>
        );
    }

    if (isPuppeteerMode || isScreenshotMode) {
        return (
            <div
                data-testid="virtual-screen-container"
                style={{
                    width: canvasConfig.width,
                    height: canvasConfig.height,
                    backgroundColor: canvasConfig.backgroundColor,
                    margin: 0,
                    padding: 0,
                    border: 'none',
                    outline: 'none',
                    overflow: 'hidden',
                    position: 'relative',
                    boxSizing: 'border-box',
                    ...brightnessStyle
                }}
            >
                <FrameEngine_BackgroundRenderer
                    config={backgroundConfig}
                    width={canvasConfig.width}
                    height={canvasConfig.height}
                    fit="none"
                    onRiveDiscovery={handleBackgroundDiscovery}
                />

                <FrameEngine_ElementRenderer
                    elements={displayElements}
                    config={rendererConfig}
                    sensorData={currentSensorData}
                />
            </div>
        );
    }

    if (isEmbedded) {
        // Calculate scale to fit canvas within container height
        const scale = containerHeight / canvasConfig.height;

        return (
            <Box sx={{
                position: 'relative',
                width: '100%',
                height: containerHeight,
                backgroundColor: canvasConfig.backgroundColor,
                borderRadius: 1,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <iframe
                    src={`/device/${deviceId}/virtual-screen`}
                    style={{
                        width: canvasConfig.width,
                        height: canvasConfig.height,
                        transform: `scale(${scale})`,
                        transformOrigin: 'center center',
                        border: 'none',
                        backgroundColor: canvasConfig.backgroundColor,
                    }}
                    title="Virtual Screen Preview"
                />

                {shouldShowControls && (
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
                                color: 'lightgreen',
                                backgroundColor: 'rgba(0,0,0,0.7)',
                                '&:hover': { backgroundColor: 'rgba(0,0,0,0.8)' }
                            }}
                            title="Reconnect"
                        >
                            <Refresh fontSize="small" />
                        </IconButton>
                    </Box>
                )}

                {shouldShowControls && (
                    <Box sx={{
                        position: 'absolute',
                        bottom: 8,
                        left: 8,
                        backgroundColor: 'rgba(0,0,0,0.9)',
                        color: '#00ff00',
                        padding: '6px 10px',
                        borderRadius: 1,
                        fontSize: '12px',
                        fontWeight: 'bold',
                        zIndex: 1000,
                        border: '1px solid #00ff00',
                    }}>
                        <Typography variant="caption" sx={{ fontSize: '12px', fontWeight: 'bold', color: '#00ff00' }}>
                            {canvasConfig.width}×{canvasConfig.height}
                        </Typography>
                    </Box>
                )}

                {shouldShowControls && (
                    <Box sx={{
                        position: 'absolute',
                        top: 8,
                        left: 8,
                        backgroundColor: 'rgba(0,0,0,0.9)',
                        color: '#00ff00',
                        padding: '6px 10px',
                        borderRadius: 1,
                        fontSize: '12px',
                        fontWeight: 'bold',
                        zIndex: 1000,
                        border: '1px solid #00ff00',
                    }}>
                        <Typography variant="caption" sx={{ fontSize: '12px', fontWeight: 'bold', color: '#00ff00' }}>
                            Sensors: {Object.keys(currentSensorData).length} | Elements: {displayElements.length} | Bindings: {discoveredBindings.length} | Brightness: {Math.round(currentBrightness * 100)}%
                        </Typography>
                    </Box>
                )}
            </Box>
        );
    }

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            margin: 0,
            padding: 0,
            backgroundColor: canvasConfig.backgroundColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        }}>
            <div
                data-testid="virtual-screen-container"
                style={{
                    width: canvasConfig.width,
                    height: canvasConfig.height,
                    position: 'relative',
                    zoom: 1 / (window.devicePixelRatio || 1),
                    ...brightnessStyle
                }}
            >
                <FrameEngine_BackgroundRenderer
                    config={backgroundConfig}
                    width={canvasConfig.width}
                    height={canvasConfig.height}
                    fit="none"
                    onRiveDiscovery={handleBackgroundDiscovery}
                />

                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: 1,
                }}>
                    <FrameEngine_ElementRenderer
                        elements={displayElements}
                        config={rendererConfig}
                        sensorData={currentSensorData}
                    />
                </div>
            </div>
        </div>
    );
};

const VirtualScreenViewer: React.FC<VirtualScreenViewerProps> = (props) => {
    const { deviceId: urlDeviceId } = useParams<{ deviceId: string }>();
    const deviceId = props.deviceId || urlDeviceId;
    const dataProviderRef = useRef<WebSocketDataProvider | null>(null);

    if (!dataProviderRef.current) {
        dataProviderRef.current = new WebSocketDataProvider({
            deviceId,
            enabled: true,
            defaultPollRate: 250
        });
    }

    useEffect(() => {
        return () => {
            const provider = dataProviderRef.current;
            if (provider) {
                provider.disconnect();
                setTimeout(() => {
                    provider.cleanup();
                    dataProviderRef.current = null;
                }, 100);
            }
        };
    }, [deviceId]);

    if (!dataProviderRef.current) {
        return null;
    }

    return (
        <VirtualScreenViewerComponent
            {...props}
            deviceId={deviceId}
            dataProvider={dataProviderRef.current}
        />
    );
};

export default VirtualScreenViewer;