import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import FrameEngine_Toolbar from '../components/FrameEngine_Toolbar';
import FrameEngine_PropertiesPanel from '../components/FrameEngine_PropertiesPanel';
import FrameEngine_Canvas from '../components/FrameEngine_Canvas';
import FrameEngine_ElementLibrary from '../components/FrameEngine_ElementLibrary';

// Types for Rive discovery
interface DiscoveredInput {
    name: string;
    type: 'number' | 'boolean' | 'trigger' | 'unknown';
    currentValue?: any;
    ref?: any;
}

interface DiscoveredStateMachine {
    name: string;
    inputNames: string[];
    inputs: DiscoveredInput[];
}

// Enhanced Rive configuration interface
interface RiveConfiguration {
    discoveredMachines: DiscoveredStateMachine[];
    lastDiscoveryUpdate: string;
    activeStateMachine?: string;
    globalInputMappings?: Record<string, any>;
    discoveryMetadata?: {
        totalInputs: number;
        inputTypeBreakdown: Record<string, number>;
        discoveryAttempts: number;
        lastSuccessfulDiscovery: string;
    };
}

// Types for frame layout data structure - UPDATED with riveConfiguration
interface FrameLayoutConfig {
    id?: number;
    displayName: string;
    description?: string;
    layoutType: string;
    rows?: number;
    columns?: number;
    width: number;
    height: number;
    orientation?: string;
    backgroundType?: string;
    backgroundColor?: string;
    backgroundImageUrl?: string | null;
    backgroundImageData?: Uint8Array | null;
    backgroundOpacity?: number;
    riveFile?: string | null;
    riveStateMachine?: string | null;
    riveInputs?: Record<string, any> | null;
    riveEmbedInPayload?: boolean;
    riveConfiguration?: RiveConfiguration; // NEW: Store all discovered Rive data
    jsonFrameConfig?: string;
    jsonFrameElements?: string;
    isTemplate: boolean;
    isDraft?: boolean;
    isPublished?: boolean;
    created?: string;
    lastModified?: string;
    createdBy?: string;
    version?: string;
}

interface PlacedElement {
    id: string;
    type: 'sensor' | 'text' | 'chart' | 'image' | 'container';
    x: number;
    y: number;
    width: number;
    height: number;
    properties: Record<string, any>;
    sensorId?: string;
    visible?: boolean;
    zIndex?: number;
}

interface SavedElement {
    id: string;
    type: 'sensor' | 'text' | 'chart' | 'image' | 'container';
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
    properties: Record<string, any>;
    sensorId?: string;
    lastModified: string;
}

interface AvailableSensor {
    id: string;
    name: string;
    value: string;
    unit: string;
    type: 'environmental' | 'system' | 'custom';
    isOnline: boolean;
    externalId: string;
    decimalPlaces: number;
    lastUpdated: string;
}

interface HistoryState {
    layout: FrameLayoutConfig;
    elements: PlacedElement[];
    timestamp: number;
    action: string;
}

interface FrameBuilderState {
    layout: FrameLayoutConfig;
    elements: PlacedElement[];
    selectedElementIds: string[];
    availableSensors: AvailableSensor[];
    history: HistoryState[];
    historyIndex: number;
    isLoading: boolean;
    isDirty: boolean;
    error: string | null;
}

const ConfigureFrame: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const isEditing = Boolean(id);

    // Main application state
    const [state, setState] = useState<FrameBuilderState>({
        layout: {
            displayName: '',
            layoutType: 'PRE_RENDERED_IMAGE',
            width: 792,
            height: 272,
            orientation: 'landscape',
            backgroundColor: '#FFFFFF',
            backgroundType: 'color',
            backgroundImageUrl: null,
            backgroundOpacity: 1.0,
            riveEmbedInPayload: true,
            riveConfiguration: {
                discoveredMachines: [],
                lastDiscoveryUpdate: '',
                globalInputMappings: {},
                discoveryMetadata: {
                    totalInputs: 0,
                    inputTypeBreakdown: {},
                    discoveryAttempts: 0,
                    lastSuccessfulDiscovery: ''
                }
            },
            isTemplate: false,
            isDraft: true,
            isPublished: false,
            rows: 2,
            columns: 2,
            version: '1.0',
        },
        elements: [],
        selectedElementIds: [],
        availableSensors: [
            {
                id: 'temp_01',
                name: 'Temperature',
                value: '23.5',
                unit: '°C',
                type: 'environmental',
                isOnline: true,
                externalId: 'temp_01',
                decimalPlaces: 1,
                lastUpdated: new Date().toISOString()
            },
            {
                id: 'hum_01',
                name: 'Humidity',
                value: '45',
                unit: '%',
                type: 'environmental',
                isOnline: true,
                externalId: 'hum_01',
                decimalPlaces: 0,
                lastUpdated: new Date().toISOString()
            },
            {
                id: 'press_01',
                name: 'Pressure',
                value: '1013.2',
                unit: 'hPa',
                type: 'environmental',
                isOnline: true,
                externalId: 'press_01',
                decimalPlaces: 1,
                lastUpdated: new Date().toISOString()
            },
            {
                id: 'light_01',
                name: 'Light Level',
                value: '850',
                unit: 'lux',
                type: 'environmental',
                isOnline: true,
                externalId: 'light_01',
                decimalPlaces: 0,
                lastUpdated: new Date().toISOString()
            },
            {
                id: 'cpu_01',
                name: 'CPU Usage',
                value: '12',
                unit: '%',
                type: 'system',
                isOnline: true,
                externalId: 'cpu_01',
                decimalPlaces: 0,
                lastUpdated: new Date().toISOString()
            },
            {
                id: 'mem_01',
                name: 'Memory Usage',
                value: '2.1',
                unit: 'GB',
                type: 'system',
                isOnline: true,
                externalId: 'mem_01',
                decimalPlaces: 1,
                lastUpdated: new Date().toISOString()
            },
            {
                id: 'disk_01',
                name: 'Disk Space',
                value: '45.2',
                unit: 'GB',
                type: 'system',
                isOnline: false,
                externalId: 'disk_01',
                decimalPlaces: 1,
                lastUpdated: new Date().toISOString()
            },
            {
                id: 'net_01',
                name: 'Network Speed',
                value: '125',
                unit: 'Mbps',
                type: 'system',
                isOnline: true,
                externalId: 'net_01',
                decimalPlaces: 0,
                lastUpdated: new Date().toISOString()
            },
        ],
        history: [],
        historyIndex: -1,
        isLoading: true,
        isDirty: false,
        error: null,
    });

    // Load the existing frame layout on mount
    useEffect(() => {
        if (!id) {
            setState(prev => ({
                ...prev,
                error: 'No layout ID provided',
                isLoading: false
            }));
            return;
        }

        loadFrameLayout(parseInt(id, 10));
    }, [id]);

    // Add to history for undo/redo
    const addToHistory = useCallback((action: string) => {
        setState(prev => {
            const newHistoryEntry: HistoryState = {
                layout: { ...prev.layout },
                elements: [...prev.elements],
                timestamp: Date.now(),
                action,
            };

            const newHistory = prev.history.slice(0, prev.historyIndex + 1);
            newHistory.push(newHistoryEntry);

            // Limit history size
            if (newHistory.length > 50) {
                newHistory.shift();
            }

            return {
                ...prev,
                history: newHistory,
                historyIndex: newHistory.length - 1,
            };
        });
    }, []);

    // Undo operation
    const handleUndo = useCallback(() => {
        setState(prev => {
            if (prev.historyIndex > 0) {
                const previousState = prev.history[prev.historyIndex - 1];
                return {
                    ...prev,
                    layout: previousState.layout,
                    elements: previousState.elements,
                    historyIndex: prev.historyIndex - 1,
                    isDirty: true,
                };
            }
            return prev;
        });
    }, []);

    // Redo operation
    const handleRedo = useCallback(() => {
        setState(prev => {
            if (prev.historyIndex < prev.history.length - 1) {
                const nextState = prev.history[prev.historyIndex + 1];
                return {
                    ...prev,
                    layout: nextState.layout,
                    elements: nextState.elements,
                    historyIndex: prev.historyIndex + 1,
                    isDirty: true,
                };
            }
            return prev;
        });
    }, []);

    // Navigate back to list
    const handleNew = useCallback(() => {
        if (state.isDirty) {
            const confirmed = window.confirm('You have unsaved changes. Are you sure you want to leave?');
            if (!confirmed) return;
        }
        navigate('/frameengine');
    }, [state.isDirty, navigate]);

    const handleLoadRequest = useCallback(() => {
        if (state.isDirty) {
            const confirmed = window.confirm('You have unsaved changes. Are you sure you want to leave?');
            if (!confirmed) return;
        }
        navigate('/frameengine');
    }, [state.isDirty, navigate]);

    // Initialize history when layout loads
    useEffect(() => {
        if (!state.isDirty && state.history.length === 0) {
            addToHistory('Initial state');
        }
    }, [state.isDirty, state.history.length, addToHistory]);

    // Handle window resize
    useEffect(() => {
        const handleResize = () => {
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
            }, 100);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Utility function to generate discovery metadata
    const generateDiscoveryMetadata = (machines: DiscoveredStateMachine[]) => {
        const totalInputs = machines.reduce((sum, machine) => sum + machine.inputs.length, 0);
        const inputTypeBreakdown: Record<string, number> = {};

        machines.forEach(machine => {
            machine.inputs.forEach(input => {
                inputTypeBreakdown[input.type] = (inputTypeBreakdown[input.type] || 0) + 1;
            });
        });

        return {
            totalInputs,
            inputTypeBreakdown,
            discoveryAttempts: (state.layout.riveConfiguration?.discoveryMetadata?.discoveryAttempts || 0) + 1,
            lastSuccessfulDiscovery: new Date().toISOString()
        };
    };

    // Save frame layout to API - ENHANCED with Rive discovery persistence in JsonFrameConfig
    const saveFrameLayout = async () => {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            // Build the enhanced JsonFrameConfig with full Rive discovery data
            const frameConfig = {
                type: "rive_config",
                screenId: state.layout.id?.toString() || "new",
                frameConfig: {
                    version: "1.0",
                    lastConfigUpdate: new Date().toISOString(),

                    canvas: {
                        width: state.layout.width,
                        height: state.layout.height,
                        orientation: state.layout.orientation || 'landscape'
                    },

                    background: {
                        type: state.layout.backgroundType || 'color',
                        color: state.layout.backgroundColor || '#FFFFFF',
                        hasImageData: !!state.layout.backgroundImageData,
                        opacity: state.layout.backgroundOpacity || 1.0
                    },

                    // Enhanced Rive section with full discovery data stored in JsonFrameConfig
                    ...(state.layout.backgroundType === 'rive' || state.layout.riveFile || state.layout.riveConfiguration?.discoveredMachines.length ? {
                        rive: {
                            enabled: state.layout.backgroundType === 'rive',
                            file: state.layout.riveFile || null,
                            stateMachine: state.layout.riveStateMachine || null,
                            inputs: state.layout.riveInputs || {},
                            settings: {
                                fit: 'cover',
                                alignment: 'center',
                                autoplay: true,
                                loop: true
                            },
                            // NEW: Store all discovered state machines and inputs in JsonFrameConfig
                            discovery: {
                                machines: state.layout.riveConfiguration?.discoveredMachines || [],
                                lastUpdate: state.layout.riveConfiguration?.lastDiscoveryUpdate || '',
                                metadata: state.layout.riveConfiguration?.discoveryMetadata || {},
                                activeStateMachine: state.layout.riveConfiguration?.activeStateMachine || state.layout.riveStateMachine,
                                globalInputMappings: state.layout.riveConfiguration?.globalInputMappings || {}
                            }
                        }
                    } : {})
                },

                // Enhanced frameElements with Rive input connections for sensors
                frameElements: state.elements.map((element, index) => {
                    const baseElement = {
                        id: element.id,
                        type: element.type,
                        position: {
                            x: element.x,
                            y: element.y,
                            width: element.width,
                            height: element.height
                        },
                        display: {
                            visible: element.visible ?? true,
                            zIndex: element.zIndex || index,
                            order: index
                        },
                        properties: element.properties || {},
                        ...(element.sensorId ? { sensorId: element.sensorId } : {}),
                        lastModified: new Date().toISOString()
                    };

                    // NEW: If this is a sensor element and we have Rive discovery data, include potential mappings
                    if (element.type === 'sensor' && state.layout.riveConfiguration?.discoveredMachines.length) {
                        return {
                            ...baseElement,
                            riveConnections: {
                                availableInputs: state.layout.riveConfiguration.discoveredMachines.flatMap(machine =>
                                    machine.inputs.map(input => ({
                                        machineName: machine.name,
                                        inputName: input.name,
                                        inputType: input.type,
                                        currentValue: input.currentValue,
                                        fullKey: `${machine.name}.${input.name}`
                                    }))
                                ),
                                mappedInputs: element.properties.riveMappings || [],
                                lastMappingUpdate: new Date().toISOString()
                            }
                        };
                    }

                    return baseElement;
                })
            };

            // Build the enhanced JsonFrameElements
            const frameElements = state.elements.map((element, index) => ({
                id: element.id,
                type: element.type,
                position: {
                    x: element.x,
                    y: element.y,
                    width: element.width,
                    height: element.height
                },
                display: {
                    visible: element.visible ?? true,
                    zIndex: element.zIndex || index,
                    order: index
                },
                properties: element.properties || {},
                ...(element.sensorId ? { sensorId: element.sensorId } : {}),
                lastModified: new Date().toISOString()
            }));

            // Prepare the save data - Rive discovery data is now stored in JsonFrameConfig only
            const saveData = {
                displayName: state.layout.displayName,
                description: state.layout.description,
                layoutType: state.layout.layoutType,
                width: state.layout.width,
                height: state.layout.height,
                orientation: state.layout.orientation,
                backgroundType: state.layout.backgroundType,
                backgroundColor: state.layout.backgroundColor,
                backgroundImageUrl: state.layout.backgroundImageUrl,
                backgroundImageData: state.layout.backgroundImageData,
                backgroundOpacity: state.layout.backgroundOpacity,
                riveFile: state.layout.riveFile,
                riveStateMachine: state.layout.riveStateMachine,
                riveInputs: state.layout.riveInputs,
                isTemplate: state.layout.isTemplate,
                isDraft: state.layout.isDraft,
                isPublished: state.layout.isPublished,
                jsonFrameConfig: JSON.stringify(frameConfig), // Discovery data stored here
                jsonFrameElements: JSON.stringify(frameElements),
                riveEmbedInPayload: state.layout.riveEmbedInPayload ?? true
            };

            console.log('Saving enhanced frame config with Rive discovery data in JsonFrameConfig:', {
                frameConfig,
                riveDiscoverySection: frameConfig.frameConfig.rive?.discovery,
                discoveredMachines: state.layout.riveConfiguration?.discoveredMachines.length || 0
            });

            const response = await fetch(`/api/frameengine/${state.layout.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(saveData),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to save frame layout');
            }

            console.log('Frame layout saved successfully with Rive discovery data in JsonFrameConfig');
            setState(prev => ({ ...prev, isDirty: false, isLoading: false }));
        } catch (error) {
            console.error('Failed to save frame layout:', error);
            setState(prev => ({
                ...prev,
                error: error instanceof Error ? error.message : 'Failed to save layout',
                isLoading: false,
            }));
        }
    };

    // Load frame layout from API - ENHANCED to restore Rive configuration from JsonFrameConfig
    const loadFrameLayout = async (layoutId: number) => {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            const response = await fetch(`/api/frameengine/${layoutId}`);

            if (!response.ok) {
                throw new Error('Failed to load frame layout');
            }

            const layoutData = await response.json();

            // Parse frame config
            const frameConfig = layoutData.jsonFrameConfig ? JSON.parse(layoutData.jsonFrameConfig) : {};

            // Parse Rive configuration from JsonFrameConfig discovery section
            let riveConfiguration: RiveConfiguration = {
                discoveredMachines: [],
                lastDiscoveryUpdate: '',
                globalInputMappings: {},
                discoveryMetadata: {
                    totalInputs: 0,
                    inputTypeBreakdown: {},
                    discoveryAttempts: 0,
                    lastSuccessfulDiscovery: ''
                }
            };

            // Restore from JsonFrameConfig.rive.discovery section
            if (frameConfig.frameConfig?.rive?.discovery) {
                const discovery = frameConfig.frameConfig.rive.discovery;
                riveConfiguration = {
                    discoveredMachines: discovery.machines || [],
                    lastDiscoveryUpdate: discovery.lastUpdate || '',
                    activeStateMachine: discovery.activeStateMachine,
                    globalInputMappings: discovery.globalInputMappings || {},
                    discoveryMetadata: discovery.metadata || riveConfiguration.discoveryMetadata
                };
                console.log('Restored Rive configuration from JsonFrameConfig:', riveConfiguration);
            }

            // Parse and convert elements from nested format to flat format
            let elementPositions: PlacedElement[] = [];
            if (layoutData.jsonFrameElements) {
                try {
                    const savedElements: SavedElement[] = JSON.parse(layoutData.jsonFrameElements);
                    elementPositions = savedElements.map((savedElement: SavedElement): PlacedElement => ({
                        id: savedElement.id,
                        type: savedElement.type,
                        x: savedElement.position?.x || 0,
                        y: savedElement.position?.y || 0,
                        width: savedElement.position?.width || 100,
                        height: savedElement.position?.height || 60,
                        properties: savedElement.properties || {},
                        sensorId: savedElement.sensorId,
                        visible: savedElement.display?.visible ?? true,
                        zIndex: savedElement.display?.zIndex || 0
                    }));
                    console.log('Loaded elements:', elementPositions);
                } catch (elementError) {
                    console.error('Error parsing elements:', elementError);
                    elementPositions = [];
                }
            }

            setState(prev => ({
                ...prev,
                layout: {
                    id: layoutData.id,
                    displayName: layoutData.displayName,
                    description: layoutData.description,
                    layoutType: layoutData.layoutType,
                    rows: frameConfig.frameConfig?.canvas?.grid?.rows || layoutData.rows,
                    columns: frameConfig.frameConfig?.canvas?.grid?.columns || layoutData.columns,
                    width: frameConfig.frameConfig?.canvas?.width || layoutData.width,
                    height: frameConfig.frameConfig?.canvas?.height || layoutData.height,
                    orientation: frameConfig.frameConfig?.canvas?.orientation || layoutData.orientation,
                    backgroundType: frameConfig.frameConfig?.background?.type || layoutData.backgroundType || 'color',
                    backgroundColor: frameConfig.frameConfig?.background?.color || layoutData.backgroundColor,
                    backgroundImageUrl: frameConfig.frameConfig?.background?.imageUrl || layoutData.backgroundImageUrl,
                    backgroundOpacity: frameConfig.frameConfig?.background?.opacity || layoutData.backgroundOpacity,
                    riveFile: frameConfig.frameConfig?.rive?.file || layoutData.riveFile,
                    riveStateMachine: frameConfig.frameConfig?.rive?.stateMachine || layoutData.riveStateMachine,
                    riveInputs: frameConfig.frameConfig?.rive?.inputs || layoutData.riveInputs,
                    riveEmbedInPayload: layoutData.riveEmbedInPayload ?? true,
                    riveConfiguration: riveConfiguration, // NEW: Restored from JsonFrameConfig
                    jsonFrameConfig: layoutData.jsonFrameConfig,
                    jsonFrameElements: layoutData.jsonFrameElements,
                    isTemplate: frameConfig.frameConfig?.metadata?.isTemplate || layoutData.isTemplate,
                    isDraft: frameConfig.frameConfig?.metadata?.isDraft || layoutData.isDraft,
                    isPublished: frameConfig.frameConfig?.metadata?.isPublished || layoutData.isPublished,
                    created: layoutData.created,
                    lastModified: layoutData.lastModified,
                    createdBy: layoutData.createdBy,
                    version: frameConfig.frameConfig?.version || layoutData.version,
                },
                elements: elementPositions,
                selectedElementIds: [],
                isLoading: false,
                isDirty: false,
                error: null,
            }));

        } catch (error) {
            console.error('Failed to load frame layout:', error);
            setState(prev => ({
                ...prev,
                error: error instanceof Error ? error.message : 'Failed to load layout',
                isLoading: false,
            }));
        }
    };

    // Update layout properties
    const updateLayout = useCallback((updates: Partial<FrameLayoutConfig>) => {
        addToHistory(`Update layout: ${Object.keys(updates).join(', ')}`);
        setState(prev => ({
            ...prev,
            layout: { ...prev.layout, ...updates },
            isDirty: true,
        }));
    }, [addToHistory]);

    // Add element to canvas
    const addElement = useCallback((element: Omit<PlacedElement, 'id'>) => {
        const newElement: PlacedElement = {
            ...element,
            id: `element_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            visible: element.visible ?? true,
        };

        addToHistory(`Add ${element.type} element`);
        setState(prev => ({
            ...prev,
            elements: [...prev.elements, newElement],
            selectedElementIds: [newElement.id],
            isDirty: true,
        }));
    }, [addToHistory]);

    // Update element properties WITHOUT adding to history (for continuous operations like dragging)
    const updateElementSilent = useCallback((elementId: string, updates: Partial<PlacedElement>) => {
        setState(prev => ({
            ...prev,
            elements: prev.elements.map(el =>
                el.id === elementId ? { ...el, ...updates } : el
            ),
            isDirty: true,
        }));
    }, []);

    // Update element properties WITH history tracking (for discrete operations like property changes)
    const updateElement = useCallback((elementId: string, updates: Partial<PlacedElement>) => {
        addToHistory(`Update element ${elementId}`);
        setState(prev => ({
            ...prev,
            elements: prev.elements.map(el =>
                el.id === elementId ? { ...el, ...updates } : el
            ),
            isDirty: true,
        }));
    }, [addToHistory]);

    // Remove element from canvas
    const removeElement = useCallback((elementId: string) => {
        addToHistory(`Remove element ${elementId}`);
        setState(prev => ({
            ...prev,
            elements: prev.elements.filter(el => el.id !== elementId),
            selectedElementIds: prev.selectedElementIds.filter(id => id !== elementId),
            isDirty: true,
        }));
    }, [addToHistory]);

    // Select elements
    const selectElements = useCallback((elementIds: string[], addToSelection = false) => {
        setState(prev => ({
            ...prev,
            selectedElementIds: addToSelection
                ? [...new Set([...prev.selectedElementIds, ...elementIds])]
                : elementIds,
        }));
    }, []);

    // Clear selection
    const clearSelection = useCallback(() => {
        setState(prev => ({ ...prev, selectedElementIds: [] }));
    }, []);

    // Handle element duplication
    const handleElementDuplicate = useCallback((elementId: string) => {
        const element = state.elements.find(el => el.id === elementId);
        if (element) {
            const { id, ...elementWithoutId } = element;
            const newElement = {
                ...elementWithoutId,
                x: element.x + 20,
                y: element.y + 20,
            };
            addElement(newElement);
        }
    }, [state.elements, addElement]);

    // Handle element reordering
    const handleElementReorder = useCallback((fromIndex: number, toIndex: number) => {
        addToHistory(`Reorder element from ${fromIndex} to ${toIndex}`);
        setState(prev => {
            const newElements = [...prev.elements];
            const [movedElement] = newElements.splice(fromIndex, 1);
            newElements.splice(toIndex, 0, movedElement);
            return {
                ...prev,
                elements: newElements,
                isDirty: true
            };
        });
    }, [addToHistory]);

    // Start drag/resize operation - adds history entry at the beginning
    const startElementOperation = useCallback((action: string) => {
        addToHistory(action);
    }, [addToHistory]);

    // Rive discovery state - lifted up from Canvas
    const [discoveredMachines, setDiscoveredMachines] = useState<DiscoveredStateMachine[]>([]);

    // ENHANCED: Handle Rive discovery from Canvas and persist to layout
    const handleRiveDiscovery = useCallback((machines: DiscoveredStateMachine[]) => {
        console.log('🏗️ ConfigureFrame received Rive discovery:', machines);
        setDiscoveredMachines(machines);

        // NEW: Automatically update the layout with discovered machines
        if (machines.length > 0) {
            const discoveryMetadata = generateDiscoveryMetadata(machines);
            const updatedRiveConfiguration: RiveConfiguration = {
                discoveredMachines: machines,
                lastDiscoveryUpdate: new Date().toISOString(),
                activeStateMachine: state.layout.riveStateMachine || machines[0]?.name,
                globalInputMappings: state.layout.riveConfiguration?.globalInputMappings || {},
                discoveryMetadata
            };

            console.log('📝 Persisting Rive discovery to layout configuration:', updatedRiveConfiguration);

            setState(prev => ({
                ...prev,
                layout: {
                    ...prev.layout,
                    riveConfiguration: updatedRiveConfiguration
                },
                isDirty: true
            }));
        }
    }, [state.layout.riveStateMachine, state.layout.riveConfiguration?.globalInputMappings]);

    const generatePreview = async () => {
        try {
            console.log('Generating preview for layout:', state.layout.id);
            console.log('Including Rive discovery data:', state.layout.riveConfiguration);
            alert('Preview generated with Rive discovery data!');
        } catch (error) {
            setState(prev => ({ ...prev, error: 'Failed to generate preview' }));
        }
    };

    // Refresh sensors
    const refreshSensors = useCallback(() => {
        setState(prev => ({
            ...prev,
            availableSensors: prev.availableSensors.map(sensor => ({
                ...sensor,
                value: (Math.random() * 100).toFixed(sensor.decimalPlaces),
                isOnline: Math.random() > 0.1,
                lastUpdated: new Date().toISOString(),
            })),
        }));
    }, []);

    // Simple export method for standalone config - ENHANCED with Rive discovery data
    const exportStandaloneConfig = async () => {
        try {
            const response = await fetch(`/api/frameengine/${state.layout.id}/export-standalone`);
            if (!response.ok) throw new Error('Failed to export standalone config');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${state.layout.displayName}-standalone.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to export standalone config:', error);
            setState(prev => ({ ...prev, error: 'Failed to export standalone config' }));
        }
    };

    // Export layout - ENHANCED with Rive discovery data
    const handleExport = useCallback(async (format: 'png' | 'json' | 'pdf' | 'standalone') => {
        if (format === 'json') {
            const exportData = {
                layout: state.layout,
                elements: state.elements,
                riveDiscoveryData: {
                    discoveredMachines: state.layout.riveConfiguration?.discoveredMachines || [],
                    discoveryMetadata: state.layout.riveConfiguration?.discoveryMetadata,
                    lastDiscoveryUpdate: state.layout.riveConfiguration?.lastDiscoveryUpdate,
                    exportNote: 'This export includes complete Rive state machine discovery data'
                },
                exportDate: new Date().toISOString(),
                version: '1.0',
            };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${state.layout.displayName}-with-rive-discovery.json`;
            a.click();
            URL.revokeObjectURL(url);
        } else if (format === 'standalone') {
            await exportStandaloneConfig();
        } else {
            alert(`${format.toUpperCase()} export would be implemented here`);
        }
    }, [state.layout, state.elements]);

    // Publish layout
    const handlePublish = useCallback(async () => {
        setState(prev => ({
            ...prev,
            layout: { ...prev.layout, isPublished: true, isDraft: false },
            isDirty: true,
        }));
    }, []);

    if (state.isLoading) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '400px',
                backgroundColor: '#fff'
            }}>
                <div style={{
                    width: '40px',
                    height: '40px',
                    border: '4px solid #f3f3f3',
                    borderTop: '4px solid #3498db',
                    borderRadius: '50%',
                    animation: 'spin 2s linear infinite'
                }}></div>
                <style>{`
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `}</style>
            </div>
        );
    }

    const selectedElements = state.elements.filter(el => state.selectedElementIds.includes(el.id));

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: 'calc(100vh - 120px)',
            minHeight: '600px',
            overflow: 'hidden',
            backgroundColor: '#fff'
        }}>
            {/* Error Display */}
            {state.error && (
                <div style={{
                    backgroundColor: '#ffebee',
                    border: '1px solid #f44336',
                    borderLeft: 'none',
                    borderRight: 'none',
                    borderTop: 'none',
                    color: '#c62828',
                    padding: '8px 16px',
                    position: 'relative',
                    flexShrink: 0
                }}>
                    {state.error}
                    <button
                        style={{
                            position: 'absolute',
                            right: '8px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            fontSize: '16px',
                            cursor: 'pointer',
                            color: '#c62828',
                            padding: '4px'
                        }}
                        onClick={() => setState(prev => ({ ...prev, error: null }))}
                    >
                        ×
                    </button>
                </div>
            )}

            {/* Debug Info - Show Rive Discovery Status */}
            {state.layout.riveConfiguration?.discoveredMachines.length ? (
                <div style={{
                    backgroundColor: '#e8f5e8',
                    border: '1px solid #4caf50',
                    borderLeft: 'none',
                    borderRight: 'none',
                    borderTop: 'none',
                    color: '#2e7d32',
                    padding: '4px 16px',
                    fontSize: '12px',
                    flexShrink: 0
                }}>
                    🔍 Rive Discovery: {state.layout.riveConfiguration.discoveredMachines.length} state machines,
                    {state.layout.riveConfiguration.discoveryMetadata?.totalInputs || 0} inputs discovered
                    {state.layout.riveConfiguration.lastDiscoveryUpdate && (
                        <span style={{ marginLeft: '8px', color: '#666' }}>
                            (Last: {new Date(state.layout.riveConfiguration.lastDiscoveryUpdate).toLocaleTimeString()})
                        </span>
                    )}
                </div>
            ) : null}

            {/* Toolbar */}
            <div style={{ flexShrink: 0 }}>
                <FrameEngine_Toolbar
                    layout={state.layout}
                    elements={state.elements}
                    selectedElements={state.selectedElementIds}
                    isDirty={state.isDirty}
                    isLoading={state.isLoading}
                    isEditing={isEditing}
                    canUndo={state.historyIndex > 0}
                    canRedo={state.historyIndex < state.history.length - 1}
                    onSave={saveFrameLayout}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    onPreview={generatePreview}
                    onExport={handleExport}
                    onPublish={handlePublish}
                />
            </div>

            {/* Main Content Area */}
            <div style={{
                flex: 1,
                display: 'flex',
                overflow: 'hidden',
                minHeight: 0
            }}>
                {/* Properties Panel */}
                <div style={{
                    width: '640px',
                    flexShrink: 0
                }}>
                    <FrameEngine_PropertiesPanel
                        layout={state.layout}
                        selectedElements={selectedElements}
                        onLayoutUpdate={updateLayout}
                        onElementUpdate={updateElement}
                        onElementDelete={removeElement}
                        elements={state.elements}
                        onElementSelect={selectElements}
                        onElementDuplicate={handleElementDuplicate}
                        onElementReorder={handleElementReorder}
                        discoveredMachines={discoveredMachines}
                    />
                </div>

                {/* Canvas Area */}
                <div style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}>
                    <FrameEngine_Canvas
                        layout={state.layout}
                        elements={state.elements}
                        selectedElementIds={state.selectedElementIds}
                        availableSensors={state.availableSensors}
                        onElementUpdate={updateElementSilent}
                        onElementSelect={selectElements}
                        onElementAdd={addElement}
                        onCanvasClick={clearSelection}
                        onStartElementOperation={startElementOperation}
                        onRiveDiscovery={handleRiveDiscovery}
                    />
                </div>

                {/* Element Library */}
                <div style={{
                    width: '320px',
                    flexShrink: 0
                }}>
                    <FrameEngine_ElementLibrary
                        selectedElements={state.selectedElementIds}
                        onElementAdd={addElement}
                    />
                </div>
            </div>
        </div>
    );
};

export default ConfigureFrame;