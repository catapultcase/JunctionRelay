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
import html2canvas from 'html2canvas';
import FrameEngine_Toolbar from '../components/frameengine/FrameEngine_Toolbar';
import FrameEngine_PropertiesPanel from '../components/frameengine/FrameEngine_PropertiesPanel';
import FrameEngine_Canvas from '../components/frameengine/FrameEngine_Canvas';
import FrameEngine_ElementLibrary from '../components/frameengine/FrameEngine_ElementLibrary';

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

interface DiscoveredDataBinding {
    name: string;
    type: 'number' | 'string' | 'boolean' | 'color' | 'trigger' | 'enum' | 'list' | 'image' | 'unknown'; // Added 'list' and 'image'
    propertyName?: string;
    currentValue?: any;
    ref?: any;
}

// Enhanced Rive configuration interface
interface RiveConfiguration {
    discoveredMachines: DiscoveredStateMachine[];
    discoveredBindings: DiscoveredDataBinding[];
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
    riveBindings?: Record<string, any> | null;
    riveConfiguration?: RiveConfiguration;
    canvasSettings?: {
        grid: {
            snapToGrid: boolean;
            showGrid: boolean;
            gridSize: number;
            gridColor: string;
        };
        elementPadding: number;
    };
    jsonFrameConfig?: string;
    jsonFrameElements?: string;
    isTemplate: boolean;
    isDraft?: boolean;
    isPublished?: boolean;
    created?: string;
    lastModified?: string;
    createdBy?: string;
    version?: string;
    thumbnailOverride?: boolean;
}

interface PlacedElement {
    id: string;
    type: 'sensor' | 'text' | 'chart' | 'image' | 'container' | 'ecg' | 'clock' | 'oscilloscope' | 'tunnel' | 'weather';
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
    type: 'sensor' | 'text' | 'chart' | 'image' | 'container' | 'ecg' | 'clock' | 'oscilloscope' | 'tunnel' | 'weather';
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
    previewMode: boolean; // NEW: Preview mode state
}

// Modal states
interface ModalState {
    thumbnailManagement: boolean;
    savingProgress: boolean;
    progressStep: 'saving' | 'thumbnail' | 'complete';
    progressMessage: string;
}

// Thumbnail Management Modal Component
const ThumbnailManagementModal: React.FC<{
    isOpen: boolean;
    layout: FrameLayoutConfig;
    onClose: () => void;
    onSaveWithThumbnail: (customThumbnail?: File) => Promise<void>;
    onCaptureThumbnail: () => Promise<void>;
}> = ({ isOpen, layout, onClose, onSaveWithThumbnail, onCaptureThumbnail }) => {
    const [uploadingFile, setUploadingFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const getCurrentThumbnailUrl = () => {
        if (layout.id) {
            return `/api/frameengine/${layout.id}/thumbnail?${Date.now()}`;
        }
        return null;
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            setUploadingFile(file);
            const reader = new FileReader();
            reader.onload = (e) => {
                setPreviewUrl(e.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSaveWithCustomThumbnail = async () => {
        await onSaveWithThumbnail(uploadingFile || undefined);
        onClose();
    };

    const handleCaptureAndSave = async () => {
        await onCaptureThumbnail();
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
        }}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '24px',
                maxWidth: '500px',
                width: '90%',
                maxHeight: '80vh',
                overflow: 'auto'
            }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600 }}>
                    Save Layout & Manage Thumbnail
                </h3>

                {/* Current Thumbnail Section */}
                <div style={{ marginBottom: '24px' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 500 }}>
                        Current Thumbnail
                    </h4>
                    <div style={{
                        width: '100%',
                        height: '160px',
                        border: '2px dashed #ccc',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#f9f9f9',
                        overflow: 'hidden'
                    }}>
                        {getCurrentThumbnailUrl() ? (
                            <img
                                src={getCurrentThumbnailUrl()!}
                                alt="Current thumbnail"
                                style={{
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    objectFit: 'contain'
                                }}
                                onError={() => {
                                    // Handle thumbnail load error
                                }}
                            />
                        ) : (
                            <div style={{ textAlign: 'center', color: '#666' }}>
                                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📷</div>
                                <div style={{ fontSize: '14px' }}>No thumbnail exists yet</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Upload New Thumbnail Section */}
                <div style={{ marginBottom: '24px' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 500 }}>
                        Upload Custom Thumbnail
                    </h4>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            marginBottom: '8px'
                        }}
                    />
                    {previewUrl && (
                        <div style={{
                            width: '100%',
                            height: '120px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <img
                                src={previewUrl}
                                alt="Upload preview"
                                style={{
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    objectFit: 'contain'
                                }}
                            />
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div style={{
                    display: 'flex',
                    gap: '12px',
                    flexDirection: 'column'
                }}>
                    {uploadingFile && (
                        <button
                            onClick={handleSaveWithCustomThumbnail}
                            style={{
                                padding: '12px 16px',
                                backgroundColor: '#1976d2',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: 500
                            }}
                        >
                            Save with Uploaded Thumbnail
                        </button>
                    )}

                    <button
                        onClick={handleCaptureAndSave}
                        style={{
                            padding: '12px 16px',
                            backgroundColor: '#4caf50',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 500
                        }}
                    >
                        Capture from Canvas & Save
                    </button>

                    <div style={{
                        display: 'flex',
                        gap: '8px'
                    }}>
                        <button
                            onClick={() => onSaveWithThumbnail()}
                            style={{
                                flex: 1,
                                padding: '12px 16px',
                                backgroundColor: '#666',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '14px'
                            }}
                        >
                            Save Without Changes
                        </button>

                        <button
                            onClick={onClose}
                            style={{
                                flex: 1,
                                padding: '12px 16px',
                                backgroundColor: 'transparent',
                                color: '#666',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '14px'
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Saving Progress Modal Component
const SavingProgressModal: React.FC<{
    isOpen: boolean;
    step: 'saving' | 'thumbnail' | 'complete';
    message: string;
    onClose: () => void;
}> = ({ isOpen, step, message, onClose }) => {
    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
        }}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '32px',
                textAlign: 'center',
                minWidth: '300px'
            }}>
                {step === 'complete' ? (
                    <>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600, color: '#4caf50' }}>
                            Save Complete!
                        </h3>
                        <p style={{ margin: '0 0 24px 0', color: '#666', fontSize: '14px' }}>
                            {message}
                        </p>
                        <button
                            onClick={onClose}
                            style={{
                                padding: '8px 16px',
                                backgroundColor: '#4caf50',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '14px'
                            }}
                        >
                            Close
                        </button>
                    </>
                ) : (
                    <>
                        <div style={{
                            width: '40px',
                            height: '40px',
                            border: '4px solid #f3f3f3',
                            borderTop: '4px solid #1976d2',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                            margin: '0 auto 16px'
                        }}></div>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600 }}>
                            {step === 'saving' ? 'Saving Layout...' : 'Generating Thumbnail...'}
                        </h3>
                        <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
                            {message}
                        </p>
                    </>
                )}
                <style>{`
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `}</style>
            </div>
        </div>
    );
};

const ConfigureFrame: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const isEditing = Boolean(id);
    const canvasRef = useRef<HTMLDivElement>(null);

    // Modal state
    const [modalState, setModalState] = useState<ModalState>({
        thumbnailManagement: false,
        savingProgress: false,
        progressStep: 'saving',
        progressMessage: ''
    });

    // Main application state - UPDATED with previewMode
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
            thumbnailOverride: false,
            canvasSettings: {
                grid: {
                    snapToGrid: false,
                    showGrid: false,
                    gridSize: 10,
                    gridColor: '#000000'
                },
                elementPadding: 4
            },
            riveConfiguration: {
                discoveredMachines: [],
                discoveredBindings: [],
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
        previewMode: false, // NEW: Initialize preview mode as false
    });

    // NEW: Toggle preview mode
    const togglePreviewMode = useCallback(() => {
        setState(prev => ({
            ...prev,
            previewMode: !prev.previewMode,
            // Clear selection when entering preview mode
            selectedElementIds: prev.previewMode ? prev.selectedElementIds : []
        }));
    }, []);

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

    // Thumbnail generation function
    const generateAndSaveThumbnail = async () => {
        if (!canvasRef.current) {
            console.warn('Canvas ref not available for thumbnail generation');
            return;
        }

        if (!state.layout.id) {
            console.warn('Layout ID not available for thumbnail generation');
            return;
        }

        try {
            console.log('Generating thumbnail from canvas...');

            // Wait a moment for any animations/renders to settle
            await new Promise(resolve => setTimeout(resolve, 500));

            // Find the actual canvas element within the ref
            const canvasElement = canvasRef.current.querySelector('[data-canvas="true"]') ||
                canvasRef.current.querySelector('.frame-canvas-area') ||
                canvasRef.current;

            if (!canvasElement) {
                console.error('Could not find canvas element for thumbnail capture');
                return;
            }

            console.log('Found canvas element for capture:', canvasElement.className || 'no-class');

            // Capture the canvas with html2canvas
            const canvas = await html2canvas(canvasElement as HTMLElement, {
                width: 300,
                height: 200,
                useCORS: true,
                allowTaint: true,
                background: state.layout.backgroundColor || '#FFFFFF'
            });

            // Convert to base64
            const dataURL = canvas.toDataURL('image/png', 0.8);

            console.log('Sending thumbnail to backend...');

            // Send to backend
            const response = await fetch(`/api/frameengine/${state.layout.id}/thumbnail-from-frontend`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageData: dataURL })
            });

            if (response.ok) {
                console.log('Thumbnail saved successfully');
            } else {
                const errorText = await response.text();
                console.error('Failed to save thumbnail:', errorText);
            }
        } catch (error) {
            console.error('Error generating thumbnail:', error);
        }
    };

    // Upload custom thumbnail
    const uploadCustomThumbnail = async (file: File) => {
        if (!state.layout.id) {
            console.warn('Layout ID not available for thumbnail upload');
            return;
        }

        try {
            const formData = new FormData();
            formData.append('thumbnail', file);

            const response = await fetch(`/api/frameengine/${state.layout.id}/thumbnail-upload`, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                console.log('Custom thumbnail uploaded successfully');
                // Update thumbnailOverride flag
                setState(prev => ({
                    ...prev,
                    layout: { ...prev.layout, thumbnailOverride: true }
                }));
            } else {
                const errorText = await response.text();
                console.error('Failed to upload thumbnail:', errorText);
            }
        } catch (error) {
            console.error('Error uploading thumbnail:', error);
        }
    };

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
    const generateDiscoveryMetadata = (machines: DiscoveredStateMachine[], bindings: DiscoveredDataBinding[]) => {
        const totalInputs = machines.reduce((sum, machine) => sum + machine.inputs.length, 0);
        const totalBindings = bindings.length;

        const inputTypeBreakdown: Record<string, number> = {};
        const bindingTypeBreakdown: Record<string, number> = {};

        machines.forEach(machine => {
            machine.inputs.forEach(input => {
                inputTypeBreakdown[input.type] = (inputTypeBreakdown[input.type] || 0) + 1;
            });
        });

        bindings.forEach(binding => {
            bindingTypeBreakdown[binding.type] = (bindingTypeBreakdown[binding.type] || 0) + 1;
        });

        return {
            totalInputs,
            totalBindings,
            inputTypeBreakdown,
            bindingTypeBreakdown,
            discoveryAttempts: (state.layout.riveConfiguration?.discoveryMetadata?.discoveryAttempts || 0) + 1,
            lastSuccessfulDiscovery: new Date().toISOString()
        };
    };

    // Core save function used by both quick save and full save
    const performSave = async (customThumbnail?: File) => {
        try {
            // Build the enhanced JsonFrameConfig with Rive discovery data (NO frameElements)
            const frameConfig = {
                type: "rive_config",
                screenId: state.layout.id?.toString() || "new",
                frameConfig: {
                    version: "1.0",
                    lastConfigUpdate: new Date().toISOString(),

                    canvas: {
                        width: state.layout.width,
                        height: state.layout.height,
                        orientation: state.layout.orientation || 'landscape',
                        settings: state.layout.canvasSettings || {
                            grid: {
                                snapToGrid: false,
                                showGrid: false,
                                gridSize: 10,
                                gridColor: '#000000'
                            },
                            elementPadding: 4
                        }
                    },

                    background: {
                        type: state.layout.backgroundType || 'color',
                        color: state.layout.backgroundColor || '#FFFFFF',
                        hasImageData: !!state.layout.backgroundImageData,
                        opacity: state.layout.backgroundOpacity || 1.0
                    },

                    // Store Rive data at the layout level
                    ...(state.layout.backgroundType === 'rive' || state.layout.riveFile ? {
                        rive: {
                            enabled: state.layout.backgroundType === 'rive',
                            file: state.layout.riveFile || null,
                            inputs: state.layout.riveInputs || {},
                            bindings: state.layout.riveBindings || {},
                            settings: {
                                fit: 'cover',
                                alignment: 'center',
                                autoplay: true,
                                loop: true
                            },
                            discovery: {
                                machines: discoveredMachines.length > 0 ? discoveredMachines : (state.layout.riveConfiguration?.discoveredMachines || []),
                                bindings: discoveredBindings.length > 0 ? discoveredBindings : (state.layout.riveConfiguration?.discoveredBindings || []),
                                lastUpdate: discoveredMachines.length > 0 || discoveredBindings.length > 0 ? new Date().toISOString() : (state.layout.riveConfiguration?.lastDiscoveryUpdate || ''),
                                metadata: discoveredMachines.length > 0 || discoveredBindings.length > 0 ? generateDiscoveryMetadata(discoveredMachines, discoveredBindings) : (state.layout.riveConfiguration?.discoveryMetadata || {}),
                                activeStateMachine: state.layout.riveConfiguration?.activeStateMachine || state.layout.riveStateMachine,
                                globalInputMappings: state.layout.riveConfiguration?.globalInputMappings || {}
                            }
                        }
                    } : {})
                }
                // frameElements removed - stored separately in jsonFrameElements
            };

            // Build RUNTIME-ONLY config (stripped for devices, NO frameElements)
            const runtimeFrameConfig = {
                type: "rive_config",
                screenId: state.layout.id?.toString() || "new",
                frameConfig: {
                    version: "1.0",
                    lastConfigUpdate: new Date().toISOString(),

                    canvas: {
                        width: state.layout.width,
                        height: state.layout.height,
                        orientation: state.layout.orientation || 'landscape',
                        settings: {
                            // Grid settings removed - editor-only
                            elementPadding: state.layout.canvasSettings?.elementPadding ?? 4
                        }
                    },

                    background: {
                        type: state.layout.backgroundType || 'color',
                        color: state.layout.backgroundColor || '#FFFFFF',
                        hasImageData: !!state.layout.backgroundImageData,
                        opacity: state.layout.backgroundOpacity || 1.0
                    },

                    ...(state.layout.backgroundType === 'rive' || state.layout.riveFile ? {
                        rive: {
                            enabled: state.layout.backgroundType === 'rive',
                            file: state.layout.riveFile || null,
                            inputs: state.layout.riveInputs || {},
                            bindings: state.layout.riveBindings || {},
                            settings: {
                                fit: 'cover',
                                alignment: 'center',
                                autoplay: true,
                                loop: true
                            },
                            discovery: {
                                // Clean machines - remove ref objects
                                machines: (discoveredMachines.length > 0 ? discoveredMachines : (state.layout.riveConfiguration?.discoveredMachines || [])).map(machine => ({
                                    name: machine.name,
                                    inputNames: machine.inputNames,
                                    inputs: machine.inputs.map(input => ({
                                        name: input.name,
                                        type: input.type,
                                        currentValue: input.currentValue
                                        // ref removed - causes massive bloat
                                    }))
                                })),
                                // Clean bindings - remove ref objects
                                bindings: (discoveredBindings.length > 0 ? discoveredBindings : (state.layout.riveConfiguration?.discoveredBindings || [])).map(binding => ({
                                    name: binding.name,
                                    type: binding.type,
                                    currentValue: binding.currentValue
                                    // ref removed - causes massive bloat
                                })),
                                lastUpdate: discoveredMachines.length > 0 || discoveredBindings.length > 0 ? new Date().toISOString() : (state.layout.riveConfiguration?.lastDiscoveryUpdate || ''),
                                activeStateMachine: state.layout.riveConfiguration?.activeStateMachine || state.layout.riveStateMachine,
                                globalInputMappings: state.layout.riveConfiguration?.globalInputMappings || {}
                                // metadata removed - editor-only stats
                            }
                        }
                    } : {})
                }
                // frameElements removed - stored separately in jsonFrameElements
            };

            // Build standalone frameElements array (used by both configs)
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
                lastModified: new Date().toISOString(),
                ...(element.type === 'sensor' && element.properties.riveMapping ? {
                    riveConnections: {
                        mappedInputs: [element.properties.riveMapping],
                        lastMappingUpdate: new Date().toISOString()
                    }
                } : {})
            }));

            // Prepare the save data
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
                riveBindings: state.layout.riveBindings,
                thumbnailOverride: customThumbnail ? true : state.layout.thumbnailOverride,
                isTemplate: state.layout.isTemplate,
                isDraft: state.layout.isDraft,
                isPublished: state.layout.isPublished,
                jsonFrameConfig: JSON.stringify(frameConfig), // Config only - no elements
                jsonFrameConfigRuntime: JSON.stringify(runtimeFrameConfig), // Runtime config only - no elements
                jsonFrameElements: JSON.stringify(frameElements) // Elements separate - shared by both
            };

            console.log('Saving frame configs:', {
                fullConfigSize: JSON.stringify(frameConfig).length,
                runtimeConfigSize: JSON.stringify(runtimeFrameConfig).length,
                elementsSize: JSON.stringify(frameElements).length,
                configReduction: `${Math.round((1 - JSON.stringify(runtimeFrameConfig).length / JSON.stringify(frameConfig).length) * 100)}%`,
                elementCount: frameElements.length
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

            console.log('Frame layout saved successfully');
            setState(prev => ({ ...prev, isDirty: false }));

            // Handle thumbnail operations
            if (customThumbnail) {
                await uploadCustomThumbnail(customThumbnail);
            } else if (!state.layout.thumbnailOverride) {
                await generateAndSaveThumbnail();
            }

        } catch (error) {
            console.error('Failed to save frame layout:', error);
            throw error;
        }
    };

    // Quick Save - saves with current thumbnail settings and shows progress modal
    const handleQuickSave = async () => {
        setModalState(prev => ({
            ...prev,
            savingProgress: true,
            progressStep: 'saving',
            progressMessage: 'Saving layout configuration...'
        }));

        try {
            await performSave();

            // Show thumbnail generation step if applicable
            if (!state.layout.thumbnailOverride) {
                setModalState(prev => ({
                    ...prev,
                    progressStep: 'thumbnail',
                    progressMessage: 'Generating thumbnail from canvas...'
                }));

                // Small delay to show the step change
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Show completion
            setModalState(prev => ({
                ...prev,
                progressStep: 'complete',
                progressMessage: state.layout.thumbnailOverride
                    ? 'Layout saved successfully with existing thumbnail.'
                    : 'Layout saved and thumbnail generated successfully.'
            }));

            // Auto-close after 2 seconds
            setTimeout(() => {
                setModalState(prev => ({ ...prev, savingProgress: false }));
            }, 2000);

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
            await performSave(customThumbnail);

            if (customThumbnail) {
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

            // Auto-close after 2 seconds
            setTimeout(() => {
                setModalState(prev => ({ ...prev, savingProgress: false }));
            }, 2000);

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
            // First update the layout state to reset thumbnailOverride BEFORE saving
            setState(prev => ({
                ...prev,
                layout: { ...prev.layout, thumbnailOverride: false }
            }));

            await performSave();

            setModalState(prev => ({
                ...prev,
                progressStep: 'thumbnail',
                progressMessage: 'Capturing thumbnail from canvas...'
            }));

            // Small delay to show the step change
            await new Promise(resolve => setTimeout(resolve, 1000));

            setModalState(prev => ({
                ...prev,
                progressStep: 'complete',
                progressMessage: 'Layout saved and thumbnail captured successfully.'
            }));

            // Auto-close after 2 seconds
            setTimeout(() => {
                setModalState(prev => ({ ...prev, savingProgress: false }));
            }, 2000);

        } catch (error) {
            setModalState(prev => ({ ...prev, savingProgress: false }));
            setState(prev => ({
                ...prev,
                error: error instanceof Error ? error.message : 'Failed to save layout'
            }));
        }
    };

    // Load frame layout from API - ENHANCED to restore canvas settings
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
                discoveredBindings: [],
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
                    discoveredBindings: discovery.bindings || [],
                    lastDiscoveryUpdate: discovery.lastUpdate || '',
                    activeStateMachine: discovery.activeStateMachine,
                    globalInputMappings: discovery.globalInputMappings || {},
                    discoveryMetadata: discovery.metadata || riveConfiguration.discoveryMetadata
                };
                console.log('Restored Rive configuration from JsonFrameConfig:', riveConfiguration);
            }

            // Restore canvas settings from JsonFrameConfig or use defaults
            let canvasSettings = {
                grid: {
                    snapToGrid: false,
                    showGrid: false,
                    gridSize: 10,
                    gridColor: '#000000'
                },
                elementPadding: 4
            };

            if (frameConfig.frameConfig?.canvas?.settings) {
                canvasSettings = frameConfig.frameConfig.canvas.settings;
                console.log('Restored canvas settings from JsonFrameConfig:', canvasSettings);
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
                    riveBindings: frameConfig.frameConfig?.rive?.bindings || layoutData.riveBindings,
                    riveConfiguration: riveConfiguration,
                    canvasSettings: canvasSettings,
                    thumbnailOverride: layoutData.thumbnailOverride || false,
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

    // Start drag/resize operation - adds history entry at the beginning
    const startElementOperation = useCallback((action: string) => {
        addToHistory(action);
    }, [addToHistory]);

    // Rive discovery state
    const [discoveredMachines, setDiscoveredMachines] = useState<DiscoveredStateMachine[]>([]);
    const [discoveredBindings, setDiscoveredBindings] = useState<DiscoveredDataBinding[]>([]);

    // ENHANCED: Handle Rive discovery from Canvas and persist to layout
    const handleRiveDiscovery = useCallback((machines: DiscoveredStateMachine[], bindings: DiscoveredDataBinding[]) => {
        console.log('ConfigureFrame received Rive discovery:', machines);
        console.log('ConfigureFrame received data bindings:', bindings);

        setDiscoveredMachines(machines);
        setDiscoveredBindings(bindings);

        // NEW: Automatically update the layout with discovered machines and bindings
        if (machines.length > 0 || bindings.length > 0) {
            const discoveryMetadata = generateDiscoveryMetadata(machines, bindings);
            const updatedRiveConfiguration: RiveConfiguration = {
                discoveredMachines: machines,
                discoveredBindings: bindings, // Add bindings to the configuration
                lastDiscoveryUpdate: new Date().toISOString(),
                activeStateMachine: state.layout.riveStateMachine || machines[0]?.name,
                globalInputMappings: state.layout.riveConfiguration?.globalInputMappings || {},
                discoveryMetadata
            };

            console.log('Persisting Rive discovery to layout configuration:', updatedRiveConfiguration);

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

    // UPDATED: Generate preview with preview mode toggle
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

    const handleExport = useCallback(async () => {
        if (!state.layout.id) {
            setState(prev => ({ ...prev, error: 'No layout ID available for export' }));
            return;
        }

        try {
            console.log('Exporting layout as ZIP package...');

            const response = await fetch(`/api/frameengine/${state.layout.id}/export-standalone`);

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.message || `Export failed with status ${response.status}`);
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${state.layout.displayName}.zip`;
            a.click();
            URL.revokeObjectURL(url);

            console.log('ZIP package export completed');
        } catch (error) {
            console.error('Export failed:', error);
            setState(prev => ({
                ...prev,
                error: `Failed to export layout: ${error instanceof Error ? error.message : 'Unknown error'}`
            }));
        }
    }, [state.layout.id, state.layout.displayName]);

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

            {/* Toolbar - Pass preview mode state */}
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
                    previewMode={state.previewMode} // NEW: Pass preview mode
                    onQuickSave={handleQuickSave}
                    onSave={handleSave}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    onPreview={generatePreview} // This now toggles preview mode
                    onExport={handleExport}
                    onPublish={handlePublish}
                />
            </div>

            {/* Main Content Area - Hide sidebars in preview mode */}
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
                            discoveredMachines={discoveredMachines}
                            discoveredBindings={discoveredBindings}
                        />
                    </div>
                )}

                {/* Canvas Area - Pass preview mode and fill full width when in preview */}
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