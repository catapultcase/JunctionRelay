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
// This is a deliberate architectural choice and does not violate PascalCase - the components ARE PascalCase

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Box, CircularProgress, Typography, Modal, Backdrop, Button, Slider } from '@mui/material';

// FrameEngine2 Components
import FrameEngine2_Toolbar from '../components/frameengine2/FrameEngine2_Toolbar';
import FrameEngine2_Sidebar_Left from '../components/frameengine2/FrameEngine2_Sidebar_Left';
import FrameEngine2_Sidebar_Right from '../components/frameengine2/FrameEngine2_Sidebar_Right';
import FrameEngine2_Canvas, { type FrameEngine2_CanvasRef } from '../components/frameengine2/FrameEngine2_Canvas';
import { ColorPickerProvider } from '../components/frameengine2/FrameEngine2_ColorPickerContext';

// FrameEngine2 API & Data
import { getFrameLayout, updateFrameLayout } from '../components/frameengine2/FrameEngine2_API';
import { parseFrameLayoutResponse, DEFAULT_CANVAS_SETTINGS } from '../components/frameengine2/FrameEngine2_Data';

// FrameEngine2 Hooks
import { useValueGenerator } from '../components/frameengine2/hooks/FrameEngine2_useValueGenerator';
import { useScreenshotCapture } from '../components/frameengine2/hooks/FrameEngine2_useScreenshotCapture';
import { useGifCapture } from '../components/frameengine2/hooks/FrameEngine2_useGifCapture';

// Types
import type { FrameLayoutConfig, PlacedElement } from '../components/frameengine2/types/FrameEngine2_LayoutTypes';
import type {
    DiscoveredRiveStateMachine,
    DiscoveredRiveDataBinding
} from '../components/frameengine2/types/FrameEngine2_ElementTypes';

const ConfigureFrame2: React.FC = () => {
    const { id } = useParams<{ id: string }>();

    // Loading & Error states
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Layout & Elements state (loaded from API)
    const [layout, setLayout] = useState<FrameLayoutConfig | null>(null);
    const [elements, setElements] = useState<PlacedElement[]>([]);

    // Selected element ID
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

    // Current zoom level
    const [currentZoom, setCurrentZoom] = useState<number>(1.0);

    // Preview mode (hides editing UI, focuses on bindings/testing)
    const [previewMode, setPreviewMode] = useState<boolean>(false);

    // Store original grid settings before preview mode (to restore later)
    const previewOriginalGridSettings = useRef<{ showGrid: boolean; showOutlines: boolean } | null>(null);

    // Screenshot modal state
    const [screenshotInProgress, setScreenshotInProgress] = useState<boolean>(false);

    // Thumbnail state
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
    const [thumbnailLoading, setThumbnailLoading] = useState<boolean>(false);

    // GIF capture state
    const [gifCaptureInProgress, setGifCaptureInProgress] = useState<boolean>(false);
    const [gifCaptureProgress, setGifCaptureProgress] = useState<number>(0);
    const [gifCaptureStage, setGifCaptureStage] = useState<'preparing' | 'frames' | 'encoding' | 'finalizing'>('preparing');
    const [showGifSettings, setShowGifSettings] = useState<boolean>(false);
    const [gifSettings, setGifSettings] = useState({
        duration: 5,
        quality: 15,
        targetFps: 30  // Target FPS to aim for during capture
    });

    // Sidebar tab state (for restoring after capture)
    const [sidebarTab, setSidebarTab] = useState<number>(0);

    // Canvas ref for calling resetView
    const canvasRef = useRef<FrameEngine2_CanvasRef>(null);

    // Rive discovery state - Background
    const [backgroundRiveMachines, setBackgroundRiveMachines] = useState<DiscoveredRiveStateMachine[]>([]);
    const [backgroundRiveBindings, setBackgroundRiveBindings] = useState<DiscoveredRiveDataBinding[]>([]);

    // Rive discovery state - Elements (Map of elementId -> discoveries)
    const [elementRiveDiscoveries, setElementRiveDiscoveries] = useState<Map<string, {
        machines: DiscoveredRiveStateMachine[];
        bindings: DiscoveredRiveDataBinding[];
    }>>(new Map());

    /**
     * Memoized selected element to avoid expensive find on every render
     */
    const selectedElement = useMemo(
        () => elements.find(el => el.id === selectedElementId) || null,
        [elements, selectedElementId]
    );

    /**
     * Handle layout configuration updates
     * Wrapped in useCallback to prevent unnecessary re-renders
     */
    const handleLayoutUpdate = useCallback((updates: Partial<FrameLayoutConfig>) => {
        setLayout(prev => {
            if (!prev) return null;
            return { ...prev, ...updates };
        });
    }, []);

    /**
     * Add a new element to the canvas
     * Wrapped in useCallback to prevent unnecessary re-renders
     */
    const handleAddElement = useCallback((element: PlacedElement) => {
        setElements(prev => [...prev, element]);
        setSelectedElementId(element.id);
    }, []);

    /**
     * Update an existing element
     * Wrapped in useCallback to prevent unnecessary re-renders
     */
    const handleUpdateElement = useCallback((elementId: string, updates: Partial<PlacedElement>) => {
        setElements(prev => prev.map(el =>
            el.id === elementId ? { ...el, ...updates } as PlacedElement : el
        ));
    }, []);

    /**
     * Delete an element
     * Wrapped in useCallback to prevent unnecessary re-renders
     */
    const handleDeleteElement = useCallback((elementId: string) => {
        setElements(prev => prev.filter(el => el.id !== elementId));
        setSelectedElementId(prev => prev === elementId ? null : prev);
    }, []);

    /**
     * Handle element selection
     * Wrapped in useCallback to prevent unnecessary re-renders
     */
    const handleSelectElement = useCallback((elementId: string | null) => {
        setSelectedElementId(elementId);
    }, []);

    /**
     * Handle zoom level changes from canvas
     * Wrapped in useCallback to prevent unnecessary re-renders
     */
    const handleZoomChange = useCallback((zoom: number) => {
        setCurrentZoom(zoom);
    }, []);

    /**
     * Handle background Rive discovery from canvas
     * Wrapped in useCallback to prevent unnecessary re-renders
     */
    const handleBackgroundRiveDiscovery = useCallback((
        machines: DiscoveredRiveStateMachine[],
        bindings: DiscoveredRiveDataBinding[]
    ) => {
        console.log('[ConfigureFrame2] Background Rive discovery received:', {
            machines: machines.length,
            bindings: bindings.length
        });
        setBackgroundRiveMachines(machines);
        setBackgroundRiveBindings(bindings);
    }, []);

    /**
     * Handle element Rive discovery from canvas
     * Wrapped in useCallback to prevent unnecessary re-renders
     */
    const handleElementRiveDiscovery = useCallback((
        discoveries: Map<string, { machines: DiscoveredRiveStateMachine[]; bindings: DiscoveredRiveDataBinding[] }>
    ) => {
        console.log('[ConfigureFrame2] Element Rive discoveries received:', {
            totalElements: discoveries.size,
            elementIds: Array.from(discoveries.keys())
        });
        setElementRiveDiscoveries(discoveries);
    }, []);

    /**
     * Load layout data from API
     */
    useEffect(() => {
        const loadLayout = async () => {
            if (!id) {
                setError('No layout ID provided');
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setError(null);

                const response = await getFrameLayout(id);
                const { layout: parsedLayout, elements: parsedElements } = parseFrameLayoutResponse(response);

                setLayout(parsedLayout);
                setElements(parsedElements);
            } catch (err) {
                console.error('[FrameEngine2] Failed to load layout:', err);
                setError(err instanceof Error ? err.message : 'Failed to load layout');
            } finally {
                setLoading(false);
            }
        };

        loadLayout();
    }, [id]);

    /**
     * Load thumbnail on mount
     */
    useEffect(() => {
        if (!id) return;

        const loadThumbnail = async () => {
            try {
                // Check if thumbnail exists
                const response = await fetch(`/api/frameengine/${id}/thumbnail`, { method: 'HEAD' });
                if (response.ok) {
                    setThumbnailUrl(`/api/frameengine/${id}/thumbnail?t=${Date.now()}`);
                }
            } catch (err) {
                // No thumbnail exists, that's okay
                console.log('[FrameEngine2] No thumbnail found');
            }
        };

        loadThumbnail();
    }, [id]);

    /**
     * Save layout to API (immediate)
     */
    const saveLayout = useCallback(async () => {
        if (!id || !layout) return;

        try {
            await updateFrameLayout(id, layout, elements);
            console.log('[FrameEngine2] Layout saved successfully');
        } catch (err) {
            console.error('[FrameEngine2] Failed to save layout:', err);
            setError(err instanceof Error ? err.message : 'Failed to save layout');
        }
    }, [id, layout, elements]);

    const handleQuickSave = useCallback(() => {
        saveLayout();
    }, [saveLayout]);

    const handleSave = useCallback(() => {
        saveLayout();
    }, [saveLayout]);

    const handleUndo = useCallback(() => {
        console.log('Undo clicked');
    }, []);

    const handleRedo = useCallback(() => {
        console.log('Redo clicked');
    }, []);

    const handlePreview = useCallback(() => {
        setPreviewMode(prev => {
            const newMode = !prev;

            if (newMode) {
                // ENTERING preview mode
                // Clear selection
                setSelectedElementId(null);

                // Store current grid settings and update layout
                setLayout(currentLayout => {
                    if (!currentLayout?.canvasSettings?.grid) return currentLayout;

                    previewOriginalGridSettings.current = {
                        showGrid: currentLayout.canvasSettings.grid.showGrid,
                        showOutlines: currentLayout.canvasSettings.grid.showOutlines
                    };

                    // Force grid settings to false for preview
                    return {
                        ...currentLayout,
                        canvasSettings: {
                            ...DEFAULT_CANVAS_SETTINGS,
                            ...currentLayout.canvasSettings,
                            grid: {
                                ...DEFAULT_CANVAS_SETTINGS.grid,
                                ...currentLayout.canvasSettings.grid,
                                showGrid: false,
                                showOutlines: false
                            }
                        }
                    };
                });
            } else {
                // EXITING preview mode
                // Restore original grid settings
                if (previewOriginalGridSettings.current) {
                    setLayout(currentLayout => {
                        if (!currentLayout) return currentLayout;

                        const restored = {
                            ...currentLayout,
                            canvasSettings: {
                                ...DEFAULT_CANVAS_SETTINGS,
                                ...currentLayout.canvasSettings,
                                grid: {
                                    ...DEFAULT_CANVAS_SETTINGS.grid,
                                    ...(currentLayout.canvasSettings?.grid || {}),
                                    showGrid: previewOriginalGridSettings.current!.showGrid,
                                    showOutlines: previewOriginalGridSettings.current!.showOutlines
                                }
                            }
                        };
                        previewOriginalGridSettings.current = null;
                        return restored;
                    });
                }
            }

            console.log('[FrameEngine2] Preview mode:', newMode);
            return newMode;
        });
    }, []);

    const handleExport = useCallback(async () => {
        if (!id) {
            console.error('[FrameEngine2] Cannot export: No layout ID');
            return;
        }

        try {
            // Save latest changes before export
            await saveLayout();

            // Generate filename from layout name
            const filename = layout?.displayName
                ? `${layout.displayName.replace(/[^a-z0-9]/gi, '_')}.zip`
                : `layout_${id}.zip`;

            // Trigger download by opening export endpoint
            const exportUrl = `/api/frameengine/${id}/export-standalone?filename=${encodeURIComponent(filename)}`;
            window.open(exportUrl, '_blank');

            console.log('[FrameEngine2] Export initiated');
        } catch (err) {
            console.error('[FrameEngine2] Failed to export layout:', err);
            setError(err instanceof Error ? err.message : 'Failed to export layout');
        }
    }, [id, layout?.displayName, saveLayout]);

    /**
     * Screenshot and thumbnail capture hook
     * Extracts complex async capture logic
     */
    const { captureScreenshot, captureThumbnail } = useScreenshotCapture({
        layout,
        id,
        previewMode,
        sidebarTab,
        canvasRef,
        onPreviewToggle: handlePreview,
        onSetSidebarTab: setSidebarTab,
        onSetScreenshotInProgress: setScreenshotInProgress,
        onSetThumbnailLoading: setThumbnailLoading,
        onSetThumbnailUrl: setThumbnailUrl
    });

    /**
     * GIF capture hook
     * Captures animated 5-second preview
     */
    const { captureGif } = useGifCapture({
        layout,
        id,
        previewMode,
        sidebarTab,
        canvasRef,
        onPreviewToggle: handlePreview,
        onSetSidebarTab: setSidebarTab,
        onSetGifCaptureInProgress: setGifCaptureInProgress,
        onSetGifCaptureProgress: setGifCaptureProgress,
        onSetGifCaptureStage: setGifCaptureStage
    });

    const handleScreenshot = useCallback(async () => {
        await captureScreenshot();
    }, [captureScreenshot]);

    const handleGifCapture = useCallback(() => {
        setShowGifSettings(true);
    }, []);

    const handleStartGifCapture = useCallback(async () => {
        setShowGifSettings(false);
        await captureGif({
            duration: gifSettings.duration,
            quality: gifSettings.quality,
            targetWidth: 1280,  // 720p width
            targetHeight: 720,   // 720p height
            targetFps: gifSettings.targetFps
        });
    }, [captureGif, gifSettings]);

    /**
     * Handle thumbnail capture - like screenshot but uploads to server
     */
    const handleCaptureThumbnail = useCallback(async () => {
        await captureThumbnail();
    }, [captureThumbnail]);

    /**
     * Handle thumbnail upload from file
     */
    const handleUploadThumbnail = useCallback(async (file: File) => {
        if (!id) return;

        try {
            // Show modal overlay
            setScreenshotInProgress(true);
            setThumbnailLoading(true);

            // Small delay to ensure modal is visible
            await new Promise(resolve => setTimeout(resolve, 100));

            const formData = new FormData();
            formData.append('thumbnail', file);

            const response = await fetch(`/api/frameengine/${id}/thumbnail-upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }

            // Refresh thumbnail display
            setThumbnailUrl(`/api/frameengine/${id}/thumbnail?t=${Date.now()}`);

            console.log('[FrameEngine2] Custom thumbnail uploaded successfully');
        } catch (err) {
            console.error('[FrameEngine2] Failed to upload custom thumbnail:', err);
            alert('Failed to upload thumbnail. Please try again.');
        } finally {
            setScreenshotInProgress(false);

            setThumbnailLoading(false);
        }
    }, [id]);

    /**
     * Value Generator hook - handles all random value generation logic
     * Extracted to custom hook for better separation of concerns and performance
     */
    const { includedSensorTags, handleToggleIncludeSensorTag } = useValueGenerator({
        layout,
        elements,
        onLayoutUpdate: handleLayoutUpdate,
        backgroundRiveMachines,
        backgroundRiveBindings,
        elementRiveDiscoveries
    });

    /**
     * Sync Value Generator test values to Rive inputs and bindings
     * When sensorTestValues changes, update corresponding Rive inputs/bindings
     * Batches all updates to prevent multiple render cycles
     */
    useEffect(() => {
        if (!layout?.sensorTestValues) return;

        let hasBackgroundInputUpdates = false;
        let hasBackgroundBindingUpdates = false;
        const newRiveInputs = { ...(layout.riveInputs || {}) };
        const newRiveBindings = { ...(layout.riveBindings || {}) };

        // Check background Rive inputs
        backgroundRiveMachines.forEach(machine => {
            machine.inputs.forEach(input => {
                const testValue = layout.sensorTestValues?.[input.name];
                if (testValue !== undefined && typeof testValue === 'object' && testValue.value !== undefined) {
                    const currentValue = layout.riveInputs?.[input.name];
                    if (currentValue !== testValue.value) {
                        newRiveInputs[input.name] = testValue.value;
                        hasBackgroundInputUpdates = true;
                    }
                }
            });
        });

        // Check background Rive bindings
        backgroundRiveBindings.forEach(binding => {
            const testValue = layout.sensorTestValues?.[binding.name];
            if (testValue !== undefined && typeof testValue === 'object' && testValue.value !== undefined) {
                const currentValue = layout.riveBindings?.[binding.name];
                if (currentValue !== testValue.value) {
                    newRiveBindings[binding.name] = testValue.value;
                    hasBackgroundBindingUpdates = true;
                }
            }
        });

        // Apply background updates if any
        if (hasBackgroundInputUpdates) {
            handleLayoutUpdate({ riveInputs: newRiveInputs });
        }
        if (hasBackgroundBindingUpdates) {
            handleLayoutUpdate({ riveBindings: newRiveBindings });
        }

        // Check element Rive inputs and bindings
        elementRiveDiscoveries.forEach((discovery, elementId) => {
            let hasElementInputUpdates = false;
            let hasElementBindingUpdates = false;
            const element = elements.find(el => el.id === elementId);
            if (!element || element.type !== 'media-rive') return;

            const newElementRiveInputs = { ...(element.properties.riveInputs || {}) };
            const newElementRiveBindings = { ...(element.properties.riveBindings || {}) };

            // Check inputs
            discovery.machines.forEach(machine => {
                machine.inputs.forEach(input => {
                    const testValue = layout.sensorTestValues?.[input.name];
                    if (testValue !== undefined && typeof testValue === 'object' && testValue.value !== undefined) {
                        const currentValue = element.properties.riveInputs?.[input.name];
                        if (currentValue !== testValue.value) {
                            newElementRiveInputs[input.name] = testValue.value;
                            hasElementInputUpdates = true;
                        }
                    }
                });
            });

            // Check bindings
            discovery.bindings.forEach(binding => {
                const testValue = layout.sensorTestValues?.[binding.name];
                if (testValue !== undefined && typeof testValue === 'object' && testValue.value !== undefined) {
                    const currentValue = element.properties.riveBindings?.[binding.name];
                    if (currentValue !== testValue.value) {
                        newElementRiveBindings[binding.name] = testValue.value;
                        hasElementBindingUpdates = true;
                    }
                }
            });

            // Apply element updates if any
            if (hasElementInputUpdates || hasElementBindingUpdates) {
                const propertyUpdates: any = { ...element.properties };
                if (hasElementInputUpdates) {
                    propertyUpdates.riveInputs = newElementRiveInputs;
                }
                if (hasElementBindingUpdates) {
                    propertyUpdates.riveBindings = newElementRiveBindings;
                }
                handleUpdateElement(elementId, {
                    properties: propertyUpdates
                });
            }
        });
    }, [layout?.sensorTestValues, backgroundRiveMachines, backgroundRiveBindings, elementRiveDiscoveries, elements, layout?.riveInputs, layout?.riveBindings, handleLayoutUpdate, handleUpdateElement]);

    // Loading state
    if (loading) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 'calc(100vh - 120px)',
                    minHeight: '600px',
                    bgcolor: 'background.default'
                }}
            >
                <CircularProgress size={60} />
                <Typography variant="h6" sx={{ mt: 2, color: 'text.secondary' }}>
                    Loading layout...
                </Typography>
            </Box>
        );
    }

    // Error state
    if (error) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 'calc(100vh - 120px)',
                    minHeight: '600px',
                    bgcolor: 'background.default'
                }}
            >
                <Typography variant="h5" color="error" sx={{ mb: 2 }}>
                    Error Loading Layout
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    {error}
                </Typography>
            </Box>
        );
    }

    // No layout loaded (shouldn't happen if loading/error handled correctly)
    if (!layout) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 'calc(100vh - 120px)',
                    minHeight: '600px',
                    bgcolor: 'background.default'
                }}
            >
                <Typography variant="h6" color="text.secondary">
                    No layout data available
                </Typography>
            </Box>
        );
    }

    return (
        <ColorPickerProvider>
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    height: 'calc(100vh - 120px)',
                    minHeight: '600px',
                    overflow: 'hidden',
                    bgcolor: 'background.default'
                }}
            >
                {/* Toolbar */}
                <Box sx={{ flexShrink: 0 }}>
                    <FrameEngine2_Toolbar
                        layoutId={id}
                        layoutName={layout?.displayName}
                        width={layout?.width}
                        height={layout?.height}
                        zoom={currentZoom}
                        elementCount={elements.length}
                        previewMode={previewMode}
                        onQuickSave={handleQuickSave}
                        onSave={handleSave}
                        onUndo={handleUndo}
                        onRedo={handleRedo}
                        onPreview={handlePreview}
                        onScreenshot={handleScreenshot}
                        onGifCapture={handleGifCapture}
                        onExport={handleExport}
                    />
                </Box>

                {/* Main Content Area */}
                <Box
                    sx={{
                        flex: 1,
                        display: 'flex',
                        overflow: 'hidden',
                        minHeight: 0
                    }}
                >
                    {/* Left Sidebar */}
                    <FrameEngine2_Sidebar_Left
                        layout={layout}
                        onLayoutUpdate={handleLayoutUpdate}
                        elements={elements}
                        selectedElement={selectedElement}
                        onSelectElement={handleSelectElement}
                        onUpdateElement={handleUpdateElement}
                        includedSensorTags={includedSensorTags}
                        onToggleIncludeSensorTag={handleToggleIncludeSensorTag}
                        previewMode={previewMode}
                        thumbnailUrl={thumbnailUrl}
                        thumbnailLoading={thumbnailLoading}
                        onCaptureThumbnail={handleCaptureThumbnail}
                        onUploadThumbnail={handleUploadThumbnail}
                        currentTab={sidebarTab}
                        onTabChange={setSidebarTab}
                        backgroundRiveMachines={backgroundRiveMachines}
                        backgroundRiveBindings={backgroundRiveBindings}
                        elementRiveDiscoveries={elementRiveDiscoveries}
                    />

                    {/* Center Canvas Area */}
                    <FrameEngine2_Canvas
                        ref={canvasRef}
                        layout={layout}
                        elements={elements}
                        onLayoutUpdate={handleLayoutUpdate}
                        onAddElement={handleAddElement}
                        onUpdateElement={handleUpdateElement}
                        selectedElementId={selectedElementId}
                        onSelectElement={handleSelectElement}
                        onZoomChange={handleZoomChange}
                        previewMode={previewMode}
                        onBackgroundRiveDiscovery={handleBackgroundRiveDiscovery}
                        onElementRiveDiscovery={handleElementRiveDiscovery}
                    />

                    {/* Right Sidebar - Hidden in preview mode */}
                    {!previewMode && (
                        <FrameEngine2_Sidebar_Right
                            selectedElement={selectedElement}
                            onUpdateElement={handleUpdateElement}
                            onDeleteElement={handleDeleteElement}
                        />
                    )}
                </Box>
            </Box>

            {/* Screenshot In Progress Modal */}
            <Modal
                open={screenshotInProgress || gifCaptureInProgress}
                closeAfterTransition
                BackdropComponent={Backdrop}
                BackdropProps={{
                    timeout: 500,
                    sx: { backgroundColor: 'rgba(0, 0, 0, 0.8)' }
                }}
            >
                <Box
                    sx={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        bgcolor: 'background.paper',
                        borderRadius: 2,
                        boxShadow: 24,
                        p: 4,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 2,
                        minWidth: 300
                    }}
                >
                    {gifCaptureInProgress ? (
                        <>
                            <CircularProgress
                                variant={gifCaptureStage === 'encoding' || gifCaptureStage === 'finalizing' ? 'indeterminate' : 'determinate'}
                                value={gifCaptureProgress}
                                size={64}
                                thickness={4}
                            />
                            <Typography variant="h6" component="h2">
                                {gifCaptureStage === 'preparing' && 'Preparing capture...'}
                                {gifCaptureStage === 'frames' && `Capturing... ${Math.round(gifCaptureProgress / 60 * gifSettings.duration * 10) / 10}s / ${gifSettings.duration}s`}
                                {gifCaptureStage === 'encoding' && 'Processing frames...'}
                                {gifCaptureStage === 'finalizing' && 'Finalizing...'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {gifCaptureStage === 'frames' && 'Recording real-time animation'}
                                {gifCaptureStage === 'encoding' && 'Encoding GIF, please wait...'}
                                {gifCaptureStage === 'finalizing' && 'Almost done...'}
                            </Typography>
                            {gifCaptureStage === 'frames' && (
                                <Typography variant="caption" color="warning.main" sx={{ mt: 1 }}>
                                    ⚠️ Please keep this window visible during capture
                                </Typography>
                            )}
                        </>
                    ) : (
                        <>
                            <CircularProgress size={48} />
                            <Typography variant="h6" component="h2">
                                Taking screenshot...
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Please wait while we capture your layout
                            </Typography>
                        </>
                    )}
                </Box>
            </Modal>

            {/* GIF Settings Modal */}
            <Modal
                open={showGifSettings}
                onClose={() => setShowGifSettings(false)}
                closeAfterTransition
                BackdropComponent={Backdrop}
                BackdropProps={{
                    timeout: 500,
                    sx: { backgroundColor: 'rgba(0, 0, 0, 0.8)' }
                }}
            >
                <Box
                    sx={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        bgcolor: 'background.paper',
                        borderRadius: 2,
                        boxShadow: 24,
                        p: 4,
                        minWidth: 400,
                        maxWidth: 500
                    }}
                >
                    <Typography variant="h5" component="h2" sx={{ mb: 3 }}>
                        GIF Capture Settings
                    </Typography>

                    {/* Target FPS */}
                    <Box sx={{ mb: 3 }}>
                        <Typography gutterBottom>
                            Target FPS: {gifSettings.targetFps}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                            Higher FPS = smoother animation but larger file size
                        </Typography>
                        <Slider
                            value={gifSettings.targetFps}
                            onChange={(_, value) => setGifSettings({ ...gifSettings, targetFps: value as number })}
                            min={10}
                            max={60}
                            step={5}
                            marks={[
                                { value: 10, label: '10' },
                                { value: 20, label: '20' },
                                { value: 30, label: '30' },
                                { value: 40, label: '40' },
                                { value: 50, label: '50' },
                                { value: 60, label: '60' }
                            ]}
                        />
                    </Box>

                    {/* Duration */}
                    <Box sx={{ mb: 3 }}>
                        <Typography gutterBottom>
                            Duration: {gifSettings.duration}s
                        </Typography>
                        <Slider
                            value={gifSettings.duration}
                            onChange={(_, value) => setGifSettings({ ...gifSettings, duration: value as number })}
                            min={2}
                            max={10}
                            step={1}
                            marks
                        />
                    </Box>

                    {/* Quality */}
                    <Box sx={{ mb: 3 }}>
                        <Typography gutterBottom>
                            Quality: {gifSettings.quality}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                            Higher values = better quality but larger file size
                        </Typography>
                        <Slider
                            value={gifSettings.quality}
                            onChange={(_, value) => setGifSettings({ ...gifSettings, quality: value as number })}
                            min={5}
                            max={25}
                            step={5}
                            marks={[
                                { value: 5, label: 'Fast' },
                                { value: 15, label: 'Good' },
                                { value: 25, label: 'Best' }
                            ]}
                        />
                    </Box>

                    {/* File Size Estimate */}
                    <Box sx={{ mb: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                            Estimated file size: {(() => {
                                const totalFrames = gifSettings.duration * gifSettings.targetFps;
                                // Rough estimate: base size + (frames * bytes per frame * quality factor)
                                // Quality: 5=fast (low colors), 15=good, 25=best (high colors)
                                const qualityFactor = gifSettings.quality / 10; // 0.5 to 2.5
                                const bytesPerFrame = 1280 * 720 * 0.1 * qualityFactor; // Rough estimate
                                const estimatedBytes = totalFrames * bytesPerFrame;
                                const estimatedMB = estimatedBytes / (1024 * 1024);

                                if (estimatedMB < 1) {
                                    return `${Math.round(estimatedBytes / 1024)}KB`;
                                } else {
                                    return `${estimatedMB.toFixed(1)}MB`;
                                }
                            })()}
                        </Typography>
                    </Box>

                    {/* Buttons */}
                    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 4 }}>
                        <Button
                            onClick={() => setShowGifSettings(false)}
                            variant="outlined"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleStartGifCapture}
                            variant="contained"
                            color="primary"
                        >
                            Start Capture
                        </Button>
                    </Box>
                </Box>
            </Modal>
        </ColorPickerProvider>
    );
};

export default ConfigureFrame2;
