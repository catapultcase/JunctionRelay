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
import { useParams, useNavigate } from 'react-router-dom';
import { Box, CircularProgress, Typography, Modal, Backdrop, Button, Slider, Alert } from '@mui/material';
import { usePageTitle } from '../hooks/usePageTitle';

// FrameEngine2 Components
import FrameEngine2_Toolbar from '../components/frameengine2/FrameEngine2_Toolbar';
import FrameEngine2_Sidebar_Left from '../components/frameengine2/FrameEngine2_Sidebar_Left';
import FrameEngine2_Sidebar_Right from '../components/frameengine2/FrameEngine2_Sidebar_Right';
import FrameEngine2_Canvas, { type FrameEngine2_CanvasRef } from '../components/frameengine2/FrameEngine2_Canvas';
import { ColorPickerProvider } from '../components/frameengine2/FrameEngine2_ColorPickerContext';
import FrameEngine2_GifSettingsModal, { type GifSettings } from '../components/frameengine2/FrameEngine2_GifSettingsModal';
import FrameEngine2_CaptureProgressModal from '../components/frameengine2/FrameEngine2_CaptureProgressModal';

// FrameEngine2 API & Data
import { cloneFrameLayout } from '../components/frameengine2/FrameEngine2_API';

// FrameEngine2 Hooks
import { useValueGenerator } from '../components/frameengine2/hooks/FrameEngine2_useValueGenerator';
import { useScreenshotCapture } from '../components/frameengine2/hooks/FrameEngine2_useScreenshotCapture';
import { useGifCapture } from '../components/frameengine2/hooks/FrameEngine2_useGifCapture';
import { useSensorTestValueSync } from '../components/frameengine2/hooks/FrameEngine2_useSensorTestValueSync';
import { useRiveDiscoveryManager } from '../components/frameengine2/hooks/FrameEngine2_useRiveDiscoveryManager';
import { useThumbnailManager } from '../components/frameengine2/hooks/FrameEngine2_useThumbnailManager';
import { useLayoutPersistence } from '../components/frameengine2/hooks/FrameEngine2_useLayoutPersistence';
import { usePreviewMode } from '../components/frameengine2/hooks/FrameEngine2_usePreviewMode';

// Types
import type { FrameLayoutConfig, PlacedElement } from '../components/frameengine2/types/FrameEngine2_LayoutTypes';
import type {
    DiscoveredRiveStateMachine,
    DiscoveredRiveDataBinding
} from '../components/frameengine2/types/FrameEngine2_ElementTypes';

const ConfigureFrame2: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    // Layout & Elements state (loaded from API)
    const [layout, setLayout] = useState<FrameLayoutConfig | null>(null);
    const [elements, setElements] = useState<PlacedElement[]>([]);

    // Set page title dynamically based on layout name
    usePageTitle(layout?.displayName || 'Frame Layout');

    // Loading & Error states (other than persistence)
    const [cloning, setCloning] = useState(false);

    // Selected element ID
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

    // Current zoom level
    const [currentZoom, setCurrentZoom] = useState<number>(1.0);

    // Preview mode (hides editing UI, focuses on bindings/testing)
    const [previewMode, setPreviewMode] = useState<boolean>(false);

    /**
     * Layout persistence hook
     * REFACTORED: Extracted layout loading/saving logic into custom hook
     * Following FRAMEENGINE2_ARCHITECTURE_GUIDELINES.md Section 4.1 (Component Size Limits)
     */
    const {
        loading,
        error,
        clearError,
        saveLayout,
        previewOriginalGridSettings
    } = useLayoutPersistence({
        layoutId: id,
        layout,
        elements,
        onLayoutLoaded: setLayout,
        onElementsLoaded: setElements,
        onSetPreviewMode: setPreviewMode
    });

    // Screenshot modal state
    const [screenshotInProgress, setScreenshotInProgress] = useState<boolean>(false);

    /**
     * Thumbnail manager hook
     * REFACTORED: Extracted thumbnail loading/upload logic into custom hook
     * Following FRAMEENGINE2_ARCHITECTURE_GUIDELINES.md Section 4.1 (Component Size Limits)
     */
    const {
        thumbnailUrl,
        thumbnailLoading,
        handleUploadThumbnail,
        setThumbnailLoading,
        setThumbnailUrl
    } = useThumbnailManager({
        layoutId: id,
        onSetScreenshotInProgress: setScreenshotInProgress
    });

    // GIF capture state
    const [gifCaptureInProgress, setGifCaptureInProgress] = useState<boolean>(false);
    const [gifCaptureProgress, setGifCaptureProgress] = useState<number>(0);
    const [gifCaptureStage, setGifCaptureStage] = useState<'preparing' | 'frames' | 'encoding' | 'finalizing'>('preparing');
    const [showGifSettings, setShowGifSettings] = useState<boolean>(false);
    const [gifSettings, setGifSettings] = useState<GifSettings>({
        duration: 5,
        quality: 15,
        targetFps: 30  // Target FPS to aim for during capture
    });

    // Sidebar tab state (for restoring after capture)
    const [sidebarTab, setSidebarTab] = useState<number>(0);

    // Canvas ref for calling resetView
    const canvasRef = useRef<FrameEngine2_CanvasRef>(null);

    /**
     * Rive discovery manager hook
     * REFACTORED: Extracted Rive discovery state and handlers into custom hook
     * Following FRAMEENGINE2_ARCHITECTURE_GUIDELINES.md Section 4.1 (Component Size Limits)
     */
    const {
        backgroundRiveMachines,
        backgroundRiveBindings,
        elementRiveDiscoveries,
        handleBackgroundRiveDiscovery,
        handleElementRiveDiscovery
    } = useRiveDiscoveryManager();

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
     * Supports both direct updates and functional updates for advanced use cases
     */
    const handleUpdateElement = useCallback((
        elementId: string,
        updates: Partial<PlacedElement> | ((current: PlacedElement) => Partial<PlacedElement>)
    ) => {
        setElements(prev => {
            const updated = prev.map(el => {
                if (el.id === elementId) {
                    // Support functional updates
                    const resolvedUpdates = typeof updates === 'function' ? updates(el) : updates;
                    const merged = { ...el, ...resolvedUpdates } as PlacedElement;
                    return merged;
                }
                return el;
            });
            return updated;
        });
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

    const handleQuickSave = useCallback(() => {
        saveLayout();
    }, [saveLayout]);

    const handleSave = useCallback(() => {
        saveLayout();
    }, [saveLayout]);

    /**
     * Preview mode manager hook
     * REFACTORED: Extracted preview mode toggling logic into custom hook
     * Following FRAMEENGINE2_ARCHITECTURE_GUIDELINES.md Section 4.1 (Component Size Limits)
     */
    const { handlePreview } = usePreviewMode({
        previewOriginalGridSettingsRef: previewOriginalGridSettings,
        currentPreviewMode: previewMode,
        onClearSelection: useCallback(() => setSelectedElementId(null), []),
        onLayoutUpdate: setLayout,
        onSetPreviewMode: setPreviewMode
    });

    const handleUndo = useCallback(() => {
        console.log('Undo clicked');
    }, []);

    const handleRedo = useCallback(() => {
        console.log('Redo clicked');
    }, []);

    const handleCloneTemplate = useCallback(async () => {
        if (!id || !layout) return;

        try {
            setCloning(true);
            const newName = `${layout.displayName} (Copy)`;
            const clonedId = await cloneFrameLayout(id, newName);

            // Navigate to the cloned layout
            navigate(`/configure-frame/${clonedId}`);
        } catch (err) {
            console.error('[FrameEngine2] Failed to clone template:', err);
            alert(err instanceof Error ? err.message : 'Failed to clone template');
        } finally {
            setCloning(false);
        }
    }, [id, layout, navigate]);

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
            alert(err instanceof Error ? err.message : 'Failed to export layout');
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
     * REFACTORED: Extracted 108-line effect into useSensorTestValueSync hook
     * Following FRAMEENGINE2_ARCHITECTURE_GUIDELINES.md Section 4.1 (Component Size Limits)
     */
    useSensorTestValueSync({
        layout,
        elements,
        backgroundRiveMachines,
        backgroundRiveBindings,
        elementRiveDiscoveries,
        onLayoutUpdate: handleLayoutUpdate,
        setElements
    });

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
                        isTemplate={layout?.isTemplate}
                        cloudTemplateId={layout?.cloudTemplateId ?? undefined}
                        cloudVariantId={layout?.cloudVariantId ?? undefined}
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
                    <Box
                        sx={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            minWidth: 0,
                            position: 'relative'
                        }}
                    >
                        {/* Template Banner */}
                        {layout?.isTemplate && (
                            <Box
                                sx={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 1,
                                    py: 2,
                                    px: 3,
                                    bgcolor: 'info.main',
                                    color: 'info.contrastText',
                                    borderBottom: '1px solid',
                                    borderColor: 'divider'
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Typography
                                        variant="body1"
                                        sx={{
                                            fontWeight: 500,
                                            fontSize: '1rem'
                                        }}
                                    >
                                        Templates cannot be edited - please clone first
                                    </Typography>
                                    <Button
                                        variant="contained"
                                        onClick={handleCloneTemplate}
                                        disabled={cloning}
                                        sx={{
                                            bgcolor: 'background.paper',
                                            color: 'text.primary',
                                            fontWeight: 'bold',
                                            px: 3,
                                            '&:hover': {
                                                bgcolor: 'grey.200'
                                            },
                                            '&.Mui-disabled': {
                                                bgcolor: 'grey.300',
                                                color: 'text.disabled'
                                            }
                                        }}
                                    >
                                        {cloning ? 'Cloning...' : 'Clone'}
                                    </Button>
                                </Box>
                            </Box>
                        )}

                        {/* Canvas */}
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
                    </Box>

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

            {/* Screenshot/Capture Progress Modal */}
            <FrameEngine2_CaptureProgressModal
                open={screenshotInProgress || gifCaptureInProgress}
                gifCaptureInProgress={gifCaptureInProgress}
                gifCaptureStage={gifCaptureStage}
                gifCaptureProgress={gifCaptureProgress}
                gifDuration={gifSettings.duration}
            />

            {/* GIF Settings Modal */}
            <FrameEngine2_GifSettingsModal
                open={showGifSettings}
                onClose={() => setShowGifSettings(false)}
                gifSettings={gifSettings}
                onGifSettingsChange={setGifSettings}
                onStartCapture={handleStartGifCapture}
            />
        </ColorPickerProvider>
    );
};

export default ConfigureFrame2;
