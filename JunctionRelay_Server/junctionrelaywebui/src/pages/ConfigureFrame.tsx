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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';

// Components
import FrameEngine_Toolbar from '../components/frameengine/FrameEngine_Toolbar';
import FrameEngine_PropertiesPanel from '../components/frameengine/FrameEngine_PropertiesPanel';
import FrameEngine_Canvas from '../components/frameengine/FrameEngine_Canvas';
import FrameEngine_ElementLibrary from '../components/frameengine/FrameEngine_ElementLibrary';

// Modals
import { ThumbnailManagementModal, SavingProgressModal } from './ConfigureFrame_Modals';

// Types
import type {
    FrameBuilderState,
    ModalState,
    HistoryState,
    PlacedElement,
    FrameLayoutConfig,
    AvailableSensor,
    DiscoveredStateMachine,
    DiscoveredDataBinding,
} from './ConfigureFrame_Types';

// Logic
import {
    performSave,
    generateAndSaveThumbnail,
    uploadCustomThumbnail,
    handleExport,
} from './ConfigureFrame_SaveLogic';
import {
    loadFrameLayout,
    getInitialLayout,
} from './ConfigureFrame_LoadLogic';
import { getDefaultElementProperties } from './ConfigureFrame_DefaultProperties';

const ConfigureFrame: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const theme = useTheme();
    const isEditing = Boolean(id);
    const canvasRef = useRef<HTMLDivElement>(null);

    // Modal state
    const [modalState, setModalState] = useState<ModalState>({
        thumbnailManagement: false,
        savingProgress: false,
        progressStep: 'saving',
        progressMessage: ''
    });

    // Main application state
    const [state, setState] = useState<FrameBuilderState>({
        layout: getInitialLayout(),
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
        previewMode: false,
    });

    // Rive discovery state - background
    const [discoveredMachines, setDiscoveredMachines] = useState<DiscoveredStateMachine[]>([]);
    const [discoveredBindings, setDiscoveredBindings] = useState<DiscoveredDataBinding[]>([]);

    // Rive discovery state - per element (for asset-rive elements)
    const [elementRiveDiscoveries, setElementRiveDiscoveries] = useState<Record<string, {
        machines: DiscoveredStateMachine[];
        bindings: DiscoveredDataBinding[];
    }>>({});

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

        const loadLayout = async () => {
            try {
                const { layout, elements } = await loadFrameLayout(parseInt(id, 10));
                setState(prev => ({
                    ...prev,
                    layout,
                    elements,
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

        loadLayout();
    }, [id]);

    // Toggle preview mode
    const togglePreviewMode = useCallback(() => {
        setState(prev => ({
            ...prev,
            previewMode: !prev.previewMode,
            selectedElementIds: prev.previewMode ? prev.selectedElementIds : []
        }));
    }, []);

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

    // Initialize history when layout loads
    useEffect(() => {
        if (!state.isDirty && state.history.length === 0) {
            addToHistory('Initial state');
        }
    }, [state.isDirty, state.history.length, addToHistory]);

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

    // Handle canvas settings changes
    const handleCanvasSettingsChange = useCallback((canvasSettings: FrameLayoutConfig['canvasSettings']) => {
        setState(prev => ({
            ...prev,
            layout: { ...prev.layout, canvasSettings },
            isDirty: true,
        }));
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

    // Handle Rive discovery from Canvas and persist to layout
    const handleRiveDiscovery = useCallback((machines: DiscoveredStateMachine[], bindings: DiscoveredDataBinding[]) => {
        console.log('ConfigureFrame received Rive discovery:', machines);
        console.log('ConfigureFrame received data bindings:', bindings);

        setDiscoveredMachines(machines);
        setDiscoveredBindings(bindings);

        if (machines.length > 0 || bindings.length > 0) {
            // Use setState functional update to avoid dependency on discoveryAttempts
            setState(prev => {
                const discoveryMetadata = {
                    totalInputs: machines.reduce((sum, m) => sum + m.inputs.length, 0),
                    totalBindings: bindings.length,
                    inputTypeBreakdown: {} as Record<string, number>,
                    bindingTypeBreakdown: {} as Record<string, number>,
                    discoveryAttempts: (prev.layout.riveConfiguration?.discoveryMetadata?.discoveryAttempts || 0) + 1,
                    lastSuccessfulDiscovery: new Date().toISOString()
                };

                machines.forEach(machine => {
                    machine.inputs.forEach(input => {
                        discoveryMetadata.inputTypeBreakdown[input.type] =
                            (discoveryMetadata.inputTypeBreakdown[input.type] || 0) + 1;
                    });
                });

                bindings.forEach(binding => {
                    discoveryMetadata.bindingTypeBreakdown[binding.type] =
                        (discoveryMetadata.bindingTypeBreakdown[binding.type] || 0) + 1;
                });

                const updatedRiveConfiguration = {
                    discoveredMachines: machines,
                    discoveredBindings: bindings,
                    lastDiscoveryUpdate: new Date().toISOString(),
                    activeStateMachine: prev.layout.riveStateMachine || machines[0]?.name,
                    globalInputMappings: prev.layout.riveConfiguration?.globalInputMappings || {},
                    discoveryMetadata
                };

                console.log('Persisting Rive discovery to layout configuration:', updatedRiveConfiguration);

                return {
                    ...prev,
                    layout: {
                        ...prev.layout,
                        riveConfiguration: updatedRiveConfiguration
                    },
                    isDirty: true
                };
            });
        }
    }, []); // Empty dependency array - all data comes from function parameters or setState callback

    // Handle Rive discovery for individual asset-rive elements
    const handleElementRiveDiscovery = useCallback((elementId: string, machines: DiscoveredStateMachine[], bindings: DiscoveredDataBinding[]) => {
        console.log(`📡 Element Rive Discovery for ${elementId}:`, { machines, bindings });
        setElementRiveDiscoveries(prev => ({
            ...prev,
            [elementId]: { machines, bindings }
        }));
    }, []);

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

    // Handle element visibility toggle
    const handleElementVisibilityToggle = useCallback((elementId: string) => {
        addToHistory(`Toggle visibility for element ${elementId}`);
        setState(prev => ({
            ...prev,
            elements: prev.elements.map(el =>
                el.id === elementId ? { ...el, visible: !(el.visible ?? true) } : el
            ),
            isDirty: true,
        }));
    }, [addToHistory]);

    // Handle element lock toggle
    const handleElementLockToggle = useCallback((elementId: string) => {
        addToHistory(`Toggle lock for element ${elementId}`);
        setState(prev => ({
            ...prev,
            elements: prev.elements.map(el =>
                el.id === elementId ? { ...el, locked: !(el.locked ?? false) } : el
            ),
            isDirty: true,
        }));
    }, [addToHistory]);

    // Start drag/resize operation - adds history entry at the beginning
    const startElementOperation = useCallback((action: string) => {
        addToHistory(action);
    }, [addToHistory]);

    // Quick Save - saves with current thumbnail settings and shows progress modal
    const handleQuickSave = async () => {
        setModalState(prev => ({
            ...prev,
            savingProgress: true,
            progressStep: 'saving',
            progressMessage: 'Saving layout configuration...'
        }));

        try {
            await performSave(state.layout, state.elements, discoveredMachines, discoveredBindings, elementRiveDiscoveries);

            if (!state.layout.thumbnailOverride) {
                setModalState(prev => ({
                    ...prev,
                    progressStep: 'thumbnail',
                    progressMessage: 'Generating thumbnail from canvas...'
                }));

                await new Promise(resolve => setTimeout(resolve, 1000));
                await generateAndSaveThumbnail(canvasRef, state.layout.id, state.layout.backgroundColor || '#FFFFFF');
            }

            setModalState(prev => ({
                ...prev,
                progressStep: 'complete',
                progressMessage: state.layout.thumbnailOverride
                    ? 'Layout saved successfully with existing thumbnail.'
                    : 'Layout saved and thumbnail generated successfully.'
            }));

            setState(prev => ({ ...prev, isDirty: false }));

            setTimeout(() => {
                setModalState(prev => ({ ...prev, savingProgress: false }));
            }, 800);

        } catch (error) {
            setModalState(prev => ({ ...prev, savingProgress: false }));
            setState(prev => ({
                ...prev,
                error: error instanceof Error ? error.message : 'Failed to save layout'
            }));
        }
    };

    // Full Save - opens thumbnail management modal
    const handleSave = async () => {
        setModalState(prev => ({ ...prev, thumbnailManagement: true }));
    };

    // Save with thumbnail from modal
    const handleSaveWithThumbnail = async (customThumbnail?: File) => {
        setModalState(prev => ({
            ...prev,
            thumbnailManagement: false,
            savingProgress: true,
            progressStep: 'saving',
            progressMessage: 'Saving layout configuration...'
        }));

        try {
            await performSave(state.layout, state.elements, discoveredMachines, discoveredBindings, elementRiveDiscoveries, customThumbnail);

            if (customThumbnail) {
                await uploadCustomThumbnail(state.layout.id, customThumbnail);
                setState(prev => ({
                    ...prev,
                    layout: { ...prev.layout, thumbnailOverride: true }
                }));

                setModalState(prev => ({
                    ...prev,
                    progressStep: 'complete',
                    progressMessage: 'Layout saved with custom thumbnail successfully.'
                }));
            } else {
                setModalState(prev => ({
                    ...prev,
                    progressStep: 'complete',
                    progressMessage: 'Layout saved successfully.'
                }));
            }

            setState(prev => ({ ...prev, isDirty: false }));

            setTimeout(() => {
                setModalState(prev => ({ ...prev, savingProgress: false }));
            }, 800);

        } catch (error) {
            setModalState(prev => ({ ...prev, savingProgress: false }));
            setState(prev => ({
                ...prev,
                error: error instanceof Error ? error.message : 'Failed to save layout'
            }));
        }
    };

    // Capture thumbnail from modal
    const handleCaptureThumbnail = async () => {
        setModalState(prev => ({
            ...prev,
            thumbnailManagement: false,
            savingProgress: true,
            progressStep: 'saving',
            progressMessage: 'Saving layout configuration...'
        }));

        try {
            setState(prev => ({
                ...prev,
                layout: { ...prev.layout, thumbnailOverride: false }
            }));

            await performSave(state.layout, state.elements, discoveredMachines, discoveredBindings, elementRiveDiscoveries);

            setModalState(prev => ({
                ...prev,
                progressStep: 'thumbnail',
                progressMessage: 'Capturing thumbnail from canvas...'
            }));

            await new Promise(resolve => setTimeout(resolve, 1000));
            await generateAndSaveThumbnail(canvasRef, state.layout.id, state.layout.backgroundColor || '#FFFFFF');

            setModalState(prev => ({
                ...prev,
                progressStep: 'complete',
                progressMessage: 'Layout saved and thumbnail captured successfully.'
            }));

            setState(prev => ({ ...prev, isDirty: false }));

            setTimeout(() => {
                setModalState(prev => ({ ...prev, savingProgress: false }));
            }, 800);

        } catch (error) {
            setModalState(prev => ({ ...prev, savingProgress: false }));
            setState(prev => ({
                ...prev,
                error: error instanceof Error ? error.message : 'Failed to save layout'
            }));
        }
    };

    // Generate preview with preview mode toggle
    const generatePreview = async () => {
        try {
            console.log('Toggling preview mode:', !state.previewMode);
            togglePreviewMode();
        } catch (error) {
            setState(prev => ({ ...prev, error: 'Failed to toggle preview mode' }));
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

    // Export handler
    const handleExportClick = useCallback(async () => {
        const error = await handleExport(state.layout.id, state.layout.displayName);
        if (error) {
            setState(prev => ({ ...prev, error }));
        }
    }, [state.layout.id, state.layout.displayName]);

    if (state.isLoading) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '400px',
                backgroundColor: theme.palette.background.default
            }}>
                <div style={{
                    width: '40px',
                    height: '40px',
                    border: `4px solid ${theme.palette.divider}`,
                    borderTop: `4px solid ${theme.palette.primary.main}`,
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
            backgroundColor: theme.palette.background.default
        }}>
            {/* Error Display */}
            {state.error && (
                <div style={{
                    backgroundColor: theme.palette.mode === 'dark'
                        ? theme.palette.error.dark
                        : theme.palette.error.light,
                    border: `1px solid ${theme.palette.error.main}`,
                    borderLeft: 'none',
                    borderRight: 'none',
                    borderTop: 'none',
                    color: theme.palette.mode === 'dark'
                        ? theme.palette.error.light
                        : theme.palette.error.dark,
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
                            color: theme.palette.mode === 'dark'
                                ? theme.palette.error.light
                                : theme.palette.error.dark,
                            padding: '4px'
                        }}
                        onClick={() => setState(prev => ({ ...prev, error: null }))}
                    >
                        ×
                    </button>
                </div>
            )}

            {/* Modals */}
            <ThumbnailManagementModal
                isOpen={modalState.thumbnailManagement}
                layout={state.layout}
                onClose={() => setModalState(prev => ({ ...prev, thumbnailManagement: false }))}
                onSaveWithThumbnail={handleSaveWithThumbnail}
                onCaptureThumbnail={handleCaptureThumbnail}
            />

            <SavingProgressModal
                isOpen={modalState.savingProgress}
                step={modalState.progressStep}
                message={modalState.progressMessage}
                onClose={() => setModalState(prev => ({ ...prev, savingProgress: false }))}
            />

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
                    previewMode={state.previewMode}
                    onQuickSave={handleQuickSave}
                    onSave={handleSave}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    onPreview={generatePreview}
                    onExport={handleExportClick}
                />
            </div>

            {/* Main Content Area */}
            <div style={{
                flex: 1,
                display: 'flex',
                overflow: 'hidden',
                minHeight: 0
            }}>
                {/* Properties Panel - Hidden in preview mode */}
                {!state.previewMode && (
                    <div style={{
                        width: '320px',
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
                            onElementVisibilityToggle={handleElementVisibilityToggle}
                            onElementLockToggle={handleElementLockToggle}
                            discoveredMachines={discoveredMachines}
                            discoveredBindings={discoveredBindings}
                            elementRiveDiscoveries={elementRiveDiscoveries}
                        />
                    </div>
                )}

                {/* Canvas Area */}
                <div
                    ref={canvasRef}
                    style={{
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden'
                    }}
                    data-canvas="true"
                >
                    <FrameEngine_Canvas
                        layout={state.layout}
                        elements={state.elements}
                        selectedElementIds={state.selectedElementIds}
                        availableSensors={state.availableSensors}
                        previewMode={state.previewMode}
                        onElementUpdate={updateElementSilent}
                        onElementSelect={selectElements}
                        onElementAdd={addElement}
                        onCanvasClick={clearSelection}
                        onStartElementOperation={startElementOperation}
                        onRiveDiscovery={handleRiveDiscovery}
                        onElementRiveDiscovery={handleElementRiveDiscovery}
                        onCanvasSettingsChange={handleCanvasSettingsChange}
                    />
                </div>

                {/* Element Library - Hidden in preview mode */}
                {!state.previewMode && (
                    <div style={{
                        width: '320px',
                        flexShrink: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 0
                    }}>
                        <FrameEngine_ElementLibrary
                            selectedElements={state.selectedElementIds}
                            selectedElementsData={selectedElements}
                            onElementAdd={addElement}
                            onElementUpdate={updateElement}
                            onElementDelete={removeElement}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default ConfigureFrame;