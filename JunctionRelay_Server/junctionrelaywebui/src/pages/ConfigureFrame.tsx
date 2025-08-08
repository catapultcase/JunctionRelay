import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import FrameEngine_Toolbar from '../components/FrameEngine_Toolbar';
import FrameEngine_PropertiesPanel from '../components/FrameEngine_PropertiesPanel';
import FrameEngine_Canvas from '../components/FrameEngine_Canvas';
import FrameEngine_ElementLibrary from '../components/FrameEngine_ElementLibrary';;

// Types for frame layout data structure (matches C# Model_Frame_Layout)
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
    jsonFrameConfig?: string;
    jsonElementPositions?: string;
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
}

interface AvailableSensor {
    id: string;
    name: string;
    value: string;
    unit: string;
    type: 'environmental' | 'system' | 'custom';
    isOnline: boolean;
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
            // Will be populated by loadFrameLayout
            displayName: '',
            layoutType: 'FRAME_SENSOR_GRID',
            width: 792,
            height: 272,
            orientation: 'landscape',
            backgroundColor: '#FFFFFF',
            backgroundType: 'color',
            backgroundImageUrl: null,
            backgroundOpacity: 1.0,
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
            { id: 'temp_01', name: 'Temperature', value: '23.5', unit: '°C', type: 'environmental', isOnline: true },
            { id: 'hum_01', name: 'Humidity', value: '45', unit: '%', type: 'environmental', isOnline: true },
            { id: 'press_01', name: 'Pressure', value: '1013.2', unit: 'hPa', type: 'environmental', isOnline: true },
            { id: 'light_01', name: 'Light Level', value: '850', unit: 'lux', type: 'environmental', isOnline: true },
            { id: 'cpu_01', name: 'CPU Usage', value: '12', unit: '%', type: 'system', isOnline: true },
            { id: 'mem_01', name: 'Memory Usage', value: '2.1', unit: 'GB', type: 'system', isOnline: true },
            { id: 'disk_01', name: 'Disk Space', value: '45.2', unit: 'GB', type: 'system', isOnline: false },
            { id: 'net_01', name: 'Network Speed', value: '125', unit: 'Mbps', type: 'system', isOnline: true },
        ],
        history: [],
        historyIndex: -1,
        isLoading: true, // Start loading, will load the existing layout
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

    // Navigate back to list for new layouts
    const handleNew = useCallback(() => {
        if (state.isDirty) {
            const confirmed = window.confirm('You have unsaved changes. Are you sure you want to leave?');
            if (!confirmed) return;
        }
        navigate('/frameengine');
    }, [state.isDirty, navigate]);

    // Navigate back to list for loading other layouts  
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

    // Handle window resize to ensure canvas scales properly
    useEffect(() => {
        const handleResize = () => {
            // Force a small delay to let the layout settle, then trigger resize event
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
            }, 100);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Save frame layout to API
    const saveFrameLayout = async () => {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            const saveData = {
                ...state.layout,
                jsonFrameConfig: JSON.stringify({}),
                jsonElementPositions: JSON.stringify(state.elements),
            };

            const response = await fetch(`/api/frameengine/${state.layout.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(saveData),
            });

            if (!response.ok) {
                throw new Error('Failed to save frame layout');
            }

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

    // Load frame layout from API
    const loadFrameLayout = async (layoutId: number) => {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            const response = await fetch(`/api/frameengine/${layoutId}`);

            if (!response.ok) {
                throw new Error('Failed to load frame layout');
            }

            const layoutData = await response.json();

            const frameConfig = layoutData.jsonFrameConfig ? JSON.parse(layoutData.jsonFrameConfig) : {};
            const elementPositions = layoutData.jsonElementPositions ? JSON.parse(layoutData.jsonElementPositions) : [];

            setState(prev => ({
                ...prev,
                layout: {
                    id: layoutData.id,
                    displayName: layoutData.displayName,
                    description: layoutData.description,
                    layoutType: layoutData.layoutType,
                    rows: layoutData.rows,
                    columns: layoutData.columns,
                    width: layoutData.width,
                    height: layoutData.height,
                    backgroundType: layoutData.backgroundType || 'color',
                    backgroundColor: layoutData.backgroundColor,
                    backgroundImageUrl: layoutData.backgroundImageUrl,
                    backgroundOpacity: layoutData.backgroundOpacity,
                    orientation: layoutData.orientation,
                    jsonFrameConfig: layoutData.jsonFrameConfig,
                    jsonElementPositions: layoutData.jsonElementPositions,
                    isTemplate: layoutData.isTemplate,
                    isDraft: layoutData.isDraft,
                    isPublished: layoutData.isPublished,
                    created: layoutData.created,
                    lastModified: layoutData.lastModified,
                    createdBy: layoutData.createdBy,
                    version: layoutData.version,
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
        };

        addToHistory(`Add ${element.type} element`);
        setState(prev => ({
            ...prev,
            elements: [...prev.elements, newElement],
            selectedElementIds: [newElement.id],
            isDirty: true,
        }));
    }, [addToHistory]);

    // Update element properties
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

    // Generate preview
    const generatePreview = async () => {
        try {
            console.log('Generating preview for layout:', state.layout.id);
            alert('Preview generated!');
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
                value: (Math.random() * 100).toFixed(1),
                isOnline: Math.random() > 0.1,
            })),
        }));
    }, []);

    // Export layout
    const handleExport = useCallback(async (format: 'png' | 'json' | 'pdf') => {
        if (format === 'json') {
            const exportData = {
                layout: state.layout,
                elements: state.elements,
                exportDate: new Date().toISOString(),
                version: '1.0',
            };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${state.layout.displayName}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } else {
            alert(`${format.toUpperCase()} export would be implemented here`);
        }
    }, [state.layout, state.elements]);

    // Clone layout
    const handleClone = useCallback(async () => {
        setState(prev => ({
            ...prev,
            layout: {
                ...prev.layout,
                id: undefined,
                displayName: `${prev.layout.displayName} (Copy)`,
                isDraft: true,
                isPublished: false,
            },
            isDirty: true,
        }));
    }, []);

    // Publish layout
    const handlePublish = useCallback(async () => {
        setState(prev => ({
            ...prev,
            layout: { ...prev.layout, isPublished: true, isDraft: false },
            isDirty: true,
        }));
    }, []);

    // Apply template
    const handleTemplateApply = useCallback(async (templateId: number) => {
        const templates = {
            1: { layoutType: 'FRAME_SENSOR_GRID', width: 792, height: 272, rows: 2, columns: 2 },
            2: { layoutType: 'FRAME_CALENDAR', width: 1024, height: 600, rows: 1, columns: 3 },
            3: { layoutType: 'FRAME_DASHBOARD', width: 1280, height: 720, rows: 3, columns: 3 },
            4: { layoutType: 'FRAME_CHART', width: 800, height: 600, rows: 1, columns: 1 },
        };

        const template = templates[templateId as keyof typeof templates];
        if (template) {
            addToHistory(`Apply template ${templateId}`);
            setState(prev => ({
                ...prev,
                layout: { ...prev.layout, ...template },
                elements: [],
                selectedElementIds: [],
                isDirty: true,
            }));
        }
    }, [addToHistory]);

    // Handle window resize to ensure canvas scales properly
    useEffect(() => {
        const handleResize = () => {
            // Force a small delay to let the layout settle, then trigger resize event
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
            }, 100);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Force canvas resize when layout changes
    useEffect(() => {
        const timer = setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 50);
        return () => clearTimeout(timer);
    }, [state.layout.width, state.layout.height]);

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
            height: 'calc(100vh - 120px)', // Leave room for navbar + container padding + bottom space
            minHeight: '600px', // Ensure minimum usable height
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
                    onClone={handleClone}
                    onPublish={handlePublish}
                    onTemplateApply={handleTemplateApply}
                />
            </div>

            {/* Main Content Area */}
            <div style={{
                flex: 1,
                display: 'flex',
                overflow: 'hidden',
                minHeight: 0 // Critical for flex shrinking
            }}>
                {/* Properties Panel */}
                <div style={{
                    width: '320px',
                    flexShrink: 0
                }}>
                    <FrameEngine_PropertiesPanel
                        layout={state.layout}
                        selectedElements={selectedElements}
                        availableSensors={state.availableSensors}
                        onLayoutUpdate={updateLayout}
                        onElementUpdate={updateElement}
                        onElementDelete={removeElement}
                    />
                </div>

                {/* Canvas Area */}
                <div style={{
                    flex: 1,
                    minWidth: 0, // Critical for flex shrinking
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}>
                    <FrameEngine_Canvas
                        layout={state.layout}
                        elements={state.elements}
                        selectedElementIds={state.selectedElementIds}
                        onElementUpdate={updateElement}
                        onElementSelect={selectElements}
                        onElementAdd={addElement}
                        onCanvasClick={clearSelection}
                    />
                </div>

                {/* Element Library */}
                <div style={{
                    width: '320px',
                    flexShrink: 0
                }}>
                    <FrameEngine_ElementLibrary
                        availableSensors={state.availableSensors}
                        selectedElements={state.selectedElementIds}
                        onElementAdd={addElement}
                        onRefreshSensors={refreshSensors}
                    />
                </div>
            </div>

            {/* Status Bar */}
            <div style={{
                borderTop: '1px solid #e0e0e0',
                padding: '8px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#fafafa',
                fontSize: '14px',
                color: '#666',
                flexShrink: 0,
                minHeight: '48px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <span>
                        {state.isDirty && <span style={{ color: '#ff9800' }}>● </span>}
                        Layout: {state.layout.displayName}
                    </span>
                    <span>Size: {state.layout.width}×{state.layout.height}</span>
                    <span>Elements: {state.elements.length}</span>
                    <span>Selected: {state.selectedElementIds.length}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>Type: {state.layout.layoutType.replace('FRAME_', '')}</span>
                    {state.layout.isTemplate && (
                        <span style={{
                            backgroundColor: '#e3f2fd',
                            color: '#1976d2',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '12px'
                        }}>
                            Template
                        </span>
                    )}
                    {state.layout.isPublished && (
                        <span style={{
                            backgroundColor: '#e8f5e8',
                            color: '#2e7d32',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '12px'
                        }}>
                            Published
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ConfigureFrame;