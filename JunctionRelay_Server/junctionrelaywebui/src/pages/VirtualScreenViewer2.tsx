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

/* eslint-disable react/jsx-pascal-case */
// Note: Component names use underscore naming convention for namespace organization (FrameEngine2_*)

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useParams, useLocation } from 'react-router-dom';
import { Box, Typography, CircularProgress, Alert, IconButton } from '@mui/material';
import { Launch, Refresh } from '@mui/icons-material';
import type { FrameLayoutConfig, PlacedElement } from '../components/frameengine2/types/FrameEngine2_LayoutTypes';
import {
    VirtualDisplayDataProvider,
    RiveConfig,
    SensorPayload,
} from '../interfaces/VirtualDisplayDataProvider';
import { WebSocketDataProvider } from '../providers/WebSocketDataProvider';
import FrameEngine2_Renderer_Background from '../components/frameengine2/FrameEngine2_Renderer_Background';
import FrameEngine2_Renderer_Elements from '../components/frameengine2/FrameEngine2_Renderer_Elements';
import { useSensorTagManager } from '../components/frameengine2/hooks/FrameEngine2_useSensorTagManager';
import type { DeviceData } from '../interfaces/DeviceData';
import { getSensorValue } from '../interfaces/SensorData';

interface VirtualScreenViewer2Props {
    deviceId?: string;
    containerHeight?: number;
    deviceData?: DeviceData;
    isStandalone?: boolean;
    showControls?: boolean;
    onFullscreenClick?: () => void;
}

interface VirtualScreenViewer2ComponentProps extends VirtualScreenViewer2Props {
    dataProvider: VirtualDisplayDataProvider;
}

/**
 * VirtualScreenViewer2 - Live frame renderer using FrameEngine2
 *
 * This component renders virtual screens in real-time using FrameEngine2 components.
 * It connects to a WebSocket data provider to receive configuration and sensor data.
 *
 * Performance optimizations:
 * - Memoized layout configuration
 * - Memoized sensor data mapping
 * - Ref-based interval management for smooth updates
 * - Proper cleanup on unmount
 */
export const VirtualScreenViewer2Component: React.FC<VirtualScreenViewer2ComponentProps> = ({
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

    const [device, setDevice] = useState<DeviceData | null>(null);
    const [layout, setLayout] = useState<FrameLayoutConfig | null>(null);
    const [elements, setElements] = useState<PlacedElement[]>([]);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentBrightness, setCurrentBrightness] = useState<number>(1.0);
    const [backgroundRiveMachines, setBackgroundRiveMachines] = useState<any[]>([]);
    const [backgroundRiveBindings, setBackgroundRiveBindings] = useState<any[]>([]);

    // Element Rive discovery state (Map of elementId -> discoveries)
    const [elementRiveDiscoveries, setElementRiveDiscoveries] = useState<Map<string, {
        machines: any[];
        bindings: any[];
    }>>(new Map());

    const isMountedRef = useRef(true);
    const riveConfigRef = useRef<RiveConfig | null>(null);

    /**
     * Sensor Tag Manager - manages sensor data flow
     * Only enabled when layout and elements are ready
     */
    const { resolvedValues, updateSensor } = useSensorTagManager({
        layout: layout || {
            displayName: '',
            layoutType: 'frameengine2',
            width: 400,
            height: 1280,
            isTemplate: false
        },
        elements: elements || [],
        enabled: isReady && !!layout
    });

    /**
     * Convert RiveConfig to FrameLayoutConfig
     */
    const convertToLayout = useCallback((config: RiveConfig): FrameLayoutConfig => {
        const frameConfig = config.frameConfig;
        const canvas = frameConfig?.canvas;
        const background = frameConfig?.background;

        const elementPadding = (canvas as any)?.settings?.elementPadding ??
                               (canvas as any)?.elementPadding ??
                               4;

        return {
            displayName: 'Virtual Screen',
            layoutType: 'frameengine2',
            width: canvas?.width || 400,
            height: canvas?.height || 1280,
            backgroundColor: background?.color || '#000000',
            backgroundType: background?.type || 'color',
            backgroundImageUrl: (background as any)?.imageUrl || null,
            backgroundImageFit: (background as any)?.imageFit || 'cover',
            backgroundVideoUrl: (background as any)?.videoUrl || null,
            backgroundVideoFit: (background as any)?.videoFit || 'cover',
            videoLoop: (background as any)?.videoLoop !== false,
            videoMuted: (background as any)?.videoMuted !== false,
            videoAutoplay: (background as any)?.videoAutoplay !== false,
            riveFile: (background as any)?.riveFile || null,
            riveStateMachine: (background as any)?.riveStateMachine || null,
            riveInputs: (background as any)?.riveInputs || null,
            riveBindings: (background as any)?.riveBindings || null,
            isTemplate: false,
            canvasSettings: {
                grid: {
                    snapToGrid: false,
                    showGrid: false,
                    showOutlines: false,
                    gridSize: 10,
                    gridColor: '#333333'
                },
                elementPadding
            }
        };
    }, []);


    /**
     * Process brightness sensor data
     */
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
                console.log(`JR Brightness: ${brightnessValue} (${Math.round(normalizedBrightness * 100)}%)`);
                return true;
            }
        }

        return false;
    }, [currentBrightness]);

    /**
     * Process sensor data from WebSocket
     */
    const processSensorData = useCallback((sensorPayload: SensorPayload) => {
        if (!isMountedRef.current || !riveConfigRef.current) {
            return;
        }

        if (sensorPayload.screenId !== riveConfigRef.current.screenId) {
            return;
        }

        // Update each sensor tag through the SensorTagManager
        Object.entries(sensorPayload.sensors).forEach(([tag, sensorData]) => {
            updateSensor(tag, sensorData);
        });

        processBrightnessSensor(sensorPayload);
    }, [processBrightnessSensor, updateSensor]);

    /**
     * Process configuration data from WebSocket
     *
     * FRAMEENGINE2 FORMAT ONLY - NO CONVERSION
     */
    const processConfigData = useCallback((config: RiveConfig) => {
        console.log('[VirtualScreenViewer2] Processing FrameEngine2 config:', config);
        riveConfigRef.current = config;

        const layoutConfig = convertToLayout(config);

        // FrameEngine2 elements - use as-is (x, y, width, height are direct properties)
        const placedElements: PlacedElement[] = (config.frameElements || []).map((element: any) => ({
            id: element.id,
            type: element.type,
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
            rotation: element.rotation ?? 0,
            properties: element.properties,
            visible: element.visible ?? true,
            locked: element.locked ?? false,
            zIndex: element.zIndex
        }));
        console.log('[VirtualScreenViewer2] Layout:', layoutConfig);
        console.log('[VirtualScreenViewer2] Elements:', placedElements);

        setLayout(layoutConfig);
        setElements(placedElements);
        setIsReady(true);
    }, [convertToLayout]);

    /**
     * Handle background Rive discovery (BATCHED)
     * Initializes layout.riveInputs and layout.riveBindings with discovered properties
     *
     * OPTIMIZATION: Batches all state updates to prevent cascading re-renders
     */
    const handleBackgroundRiveDiscovery = useCallback((machines: any[], bindings: any[]) => {
        // Batch all state updates together
        ReactDOM.unstable_batchedUpdates(() => {
            setBackgroundRiveMachines(machines);
            setBackgroundRiveBindings(bindings);

            // Initialize layout.riveInputs and layout.riveBindings with discovered names
            setLayout(prev => {
                if (!prev) return prev;

                const riveInputs: Record<string, any> = { ...prev.riveInputs };
                const riveBindings: Record<string, any> = { ...prev.riveBindings };

                // Add all discovered inputs
                machines.forEach((machine: any) => {
                    machine.inputs?.forEach((input: any) => {
                        if (input.name && !(input.name in riveInputs)) {
                            riveInputs[input.name] = input.currentValue ?? null;
                        }
                    });
                });

                // Add all discovered bindings
                bindings.forEach((binding: any) => {
                    if (binding.name && !(binding.name in riveBindings)) {
                        riveBindings[binding.name] = binding.currentValue ?? null;
                    }
                });

                return {
                    ...prev,
                    riveInputs,
                    riveBindings
                };
            });
        });
    }, []);

    /**
     * Handle element Rive discovery from element renderers (BATCHED)
     * Initializes element.properties.riveInputs and element.properties.riveBindings
     *
     * OPTIMIZATION: Batches both state updates to prevent cascading re-renders
     */
    const handleElementRiveDiscovery = useCallback((
        elementId: string,
        machines: any[],
        bindings: any[]
    ) => {
        console.log(`[VirtualScreenViewer2] Element Rive discovery received for ${elementId}:`, {
            machines: machines.length,
            bindings: bindings.length
        });

        // Batch both state updates together
        ReactDOM.unstable_batchedUpdates(() => {
            // Store discoveries in state
            setElementRiveDiscoveries(prev => {
                const next = new Map(prev);
                next.set(elementId, { machines, bindings });
                return next;
            });

            // Initialize element properties with discovered bindings
            setElements(prev => prev.map(el => {
                if (el.id !== elementId || el.type !== 'media-rive') return el;

                const riveInputs: Record<string, any> = { ...(el.properties.riveInputs || {}) };
                const riveBindings: Record<string, any> = { ...(el.properties.riveBindings || {}) };

                // Add all discovered inputs
                machines.forEach((machine: any) => {
                    machine.inputs?.forEach((input: any) => {
                        if (input.name && !(input.name in riveInputs)) {
                            riveInputs[input.name] = input.currentValue ?? null;
                        }
                    });
                });

                // Add all discovered bindings
                bindings.forEach((binding: any) => {
                    if (binding.name && !(binding.name in riveBindings)) {
                        riveBindings[binding.name] = binding.currentValue ?? null;
                    }
                });

                return {
                    ...el,
                    properties: {
                        ...el.properties,
                        riveInputs,
                        riveBindings
                    }
                };
            }));
        });
    }, []);

    /**
     * Update Rive inputs/bindings from sensor data (BATCHED)
     * Maps resolvedValues (from sensors) to both layout and element Rive properties
     *
     * OPTIMIZATION: Batches both layout and element updates to prevent cascading re-renders
     */
    useEffect(() => {
        if (!isReady || Object.keys(resolvedValues).length === 0) return;

        // Batch both state updates to prevent cascading re-renders
        ReactDOM.unstable_batchedUpdates(() => {
            // Update layout Rive inputs/bindings
            if (layout) {
                setLayout(prev => {
                    if (!prev) return prev;

                    const updatedRiveInputs = { ...prev.riveInputs };
                    const updatedRiveBindings = { ...prev.riveBindings };
                    let hasChanges = false;

                    // Map resolvedValues to Rive inputs/bindings
                    Object.entries(resolvedValues).forEach(([tag, sensorData]) => {
                        // Extract the actual value from sensor data object (type-safe)
                        const value = getSensorValue(sensorData) ?? sensorData;

                        // Check if this tag matches any discovered input
                        if (updatedRiveInputs && tag in updatedRiveInputs && updatedRiveInputs[tag] !== value) {
                            updatedRiveInputs[tag] = value;
                            hasChanges = true;
                        }
                        // Check if this tag matches any discovered binding
                        if (updatedRiveBindings && tag in updatedRiveBindings && updatedRiveBindings[tag] !== value) {
                            updatedRiveBindings[tag] = value;
                            hasChanges = true;
                        }
                    });

                    // Only update if there are actual changes
                    if (hasChanges) {
                        return {
                            ...prev,
                            riveInputs: updatedRiveInputs,
                            riveBindings: updatedRiveBindings
                        };
                    }

                    return prev;
                });
            }

            // Update element Rive inputs/bindings
            if (elementRiveDiscoveries.size > 0) {
                setElements(prev => {
                    let hasChanges = false;
                    const updated = prev.map(el => {
                        if (el.type !== 'media-rive') return el;

                        const discovery = elementRiveDiscoveries.get(el.id);
                        if (!discovery) return el;

                        const updatedRiveInputs = { ...(el.properties.riveInputs || {}) };
                        const updatedRiveBindings = { ...(el.properties.riveBindings || {}) };
                        let elementHasChanges = false;

                        // Map resolvedValues to element Rive inputs
                        discovery.machines.forEach((machine: any) => {
                            machine.inputs?.forEach((input: any) => {
                                const tag = input.name;
                                const sensorData = resolvedValues[tag];
                                if (sensorData !== undefined) {
                                    const value = getSensorValue(sensorData) ?? sensorData;
                                    if (updatedRiveInputs[tag] !== value) {
                                        updatedRiveInputs[tag] = value;
                                        elementHasChanges = true;
                                    }
                                }
                            });
                        });

                        // Map resolvedValues to element Rive bindings
                        discovery.bindings.forEach((binding: any) => {
                            const tag = binding.name;
                            const sensorData = resolvedValues[tag];
                            if (sensorData !== undefined) {
                                const value = getSensorValue(sensorData) ?? sensorData;
                                if (updatedRiveBindings[tag] !== value) {
                                    updatedRiveBindings[tag] = value;
                                    elementHasChanges = true;
                                }
                            }
                        });

                        if (elementHasChanges) {
                            hasChanges = true;
                            return {
                                ...el,
                                properties: {
                                    ...el.properties,
                                    riveInputs: updatedRiveInputs,
                                    riveBindings: updatedRiveBindings
                                }
                            };
                        }

                        return el;
                    });

                    return hasChanges ? updated : prev;
                });
            }
        });
    }, [resolvedValues, elementRiveDiscoveries, isReady]);

    /**
     * Connect to data provider
     */
    useEffect(() => {
        if (loading || error) return;

        const unsubscribeConfig = dataProvider.onConfigurationReceived(processConfigData);
        const unsubscribeSensor = dataProvider.onSensorDataReceived(processSensorData);

        dataProvider.connect();

        return () => {
            unsubscribeConfig();
            unsubscribeSensor();
        };
    }, [loading, error, dataProvider, processConfigData, processSensorData]);

    /**
     * Load device data
     */
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

    /**
     * Cleanup on unmount
     */
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

    /**
     * Brightness filter style
     */
    const brightnessStyle = useMemo(() => ({
        filter: `brightness(${currentBrightness})`
    }), [currentBrightness]);

    /**
     * Reconnect handler
     */
    const reconnect = useCallback(() => {
        dataProvider.connect();
    }, [dataProvider]);

    /**
     * Fullscreen handler
     */
    const handleFullscreenClick = useCallback(() => {
        if (isEmbedded) {
            if (onFullscreenClick) {
                onFullscreenClick();
            } else {
                window.open(`/device/${deviceId}/virtual-screen`, "_blank");
            }
        }
    }, [isEmbedded, onFullscreenClick, deviceId]);

    // Loading state
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

    // Error state
    if (error) {
        return (
            <Box sx={{ p: 2 }}>
                <Alert severity="error">{error}</Alert>
            </Box>
        );
    }

    // Waiting for configuration
    if (!isReady || !layout) {
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

    // Puppeteer/Screenshot mode - minimal rendering
    if (isPuppeteerMode || isScreenshotMode) {
        return (
            <div
                data-testid="virtual-screen-container"
                style={{
                    width: layout.width,
                    height: layout.height,
                    backgroundColor: layout.backgroundColor,
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
                <FrameEngine2_Renderer_Background
                    layout={layout}
                    onRiveDiscovery={handleBackgroundRiveDiscovery}
                />

                {elements
                    .filter(element => element.visible)
                    .map((element) => (
                    <FrameEngine2_Renderer_Elements
                        key={element.id}
                        element={element}
                        resolvedValues={resolvedValues}
                        showPlaceholders={false}
                        elementPadding={layout.canvasSettings?.elementPadding || 4}
                        onRiveDiscovery={handleElementRiveDiscovery}
                        previewMode={true}
                    />
                ))}
            </div>
        );
    }

    // Embedded mode (iframe)
    if (isEmbedded) {
        const scale = containerHeight / layout.height;

        return (
            <Box sx={{
                position: 'relative',
                width: '100%',
                height: containerHeight,
                backgroundColor: layout.backgroundColor,
                borderRadius: 1,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <iframe
                    src={`/device/${deviceId}/virtual-screen`}
                    style={{
                        width: layout.width,
                        height: layout.height,
                        transform: `scale(${scale})`,
                        transformOrigin: 'center center',
                        border: 'none',
                        backgroundColor: layout.backgroundColor,
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
                            {layout.width}×{layout.height}
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
                            Sensors: {Object.keys(resolvedValues).length} | Elements: {elements.length} | Brightness: {Math.round(currentBrightness * 100)}%
                        </Typography>
                    </Box>
                )}
            </Box>
        );
    }

    // Standalone fullscreen mode
    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            margin: 0,
            padding: 0,
            backgroundColor: layout.backgroundColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        }}>
            <div
                data-testid="virtual-screen-container"
                style={{
                    width: layout.width,
                    height: layout.height,
                    position: 'relative',
                    zoom: 1 / (window.devicePixelRatio || 1),
                    ...brightnessStyle
                }}
            >
                <FrameEngine2_Renderer_Background
                    layout={layout}
                    onRiveDiscovery={handleBackgroundRiveDiscovery}
                />

                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: 1,
                }}>
                    {elements
                        .filter(element => element.visible)
                        .map((element) => (
                        <FrameEngine2_Renderer_Elements
                            key={element.id}
                            element={element}
                            resolvedValues={resolvedValues}
                            showPlaceholders={false}
                            elementPadding={layout.canvasSettings?.elementPadding || 4}
                            onRiveDiscovery={handleElementRiveDiscovery}
                            previewMode={true}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

/**
 * VirtualScreenViewer2 - Main export with WebSocket provider
 */
const VirtualScreenViewer2: React.FC<VirtualScreenViewer2Props> = (props) => {
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
        <VirtualScreenViewer2Component
            {...props}
            deviceId={deviceId}
            dataProvider={dataProviderRef.current}
        />
    );
};

export default VirtualScreenViewer2;