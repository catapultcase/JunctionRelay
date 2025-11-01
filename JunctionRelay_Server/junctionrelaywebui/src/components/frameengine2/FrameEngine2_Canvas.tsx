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

import React, { useState, useMemo, useCallback, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { useTheme } from '@mui/material/styles';
import type { FrameLayoutConfig, PlacedElement } from './types/FrameEngine2_LayoutTypes';
import type {
    SensorProperties,
    TextProperties,
    GaugeProperties,
    TimeDateProperties,
    MediaImageProperties,
    MediaVideoProperties,
    MediaRiveProperties,
    ECGProperties,
    DiscoveredRiveStateMachine,
    DiscoveredRiveDataBinding
} from './types/FrameEngine2_ElementTypes';
import FrameEngine2_CanvasControls from './FrameEngine2_CanvasControls';
import FrameEngine2_SensorDebugPanel from './FrameEngine2_SensorDebugPanel';
import FrameEngine2_Renderer_Elements from './FrameEngine2_Renderer_Elements';
import FrameEngine2_Renderer_Background from './FrameEngine2_Renderer_Background';
import { useSensorTagManager } from './hooks/FrameEngine2_useSensorTagManager';
import { useCanvasViewport } from './hooks/FrameEngine2_useCanvasViewport';
import { useColorPicker } from './FrameEngine2_ColorPickerContext';
import { DEFAULT_CANVAS_SETTINGS } from './FrameEngine2_Data';

interface RgbaColor {
    r: number;
    g: number;
    b: number;
    a: number;
}

/**
 * Convert string color (hex or rgba) to RgbaColor object
 */
const parseColorToRgba = (colorString: string): RgbaColor => {
    // Default fallback
    const defaultColor = { r: 0, g: 0, b: 0, a: 1 };

    // Handle rgba format: rgba(r, g, b, a)
    const rgbaMatch = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (rgbaMatch) {
        return {
            r: parseInt(rgbaMatch[1]),
            g: parseInt(rgbaMatch[2]),
            b: parseInt(rgbaMatch[3]),
            a: rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1
        };
    }

    // Handle hex format: #RRGGBB or #RRGGBBAA
    if (colorString.startsWith('#')) {
        const hex = colorString.slice(1);
        if (hex.length === 6 || hex.length === 8) {
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
            return { r, g, b, a };
        }
    }

    // Handle transparent keyword
    if (colorString === 'transparent') {
        return { r: 0, g: 0, b: 0, a: 0 };
    }

    return defaultColor;
};

/** Ref handle for imperative methods */
export interface FrameEngine2_CanvasRef {
    resetView: () => void;
}

interface FrameEngine2_CanvasProps {
    /** Layout configuration */
    layout: FrameLayoutConfig;

    /** Elements placed on the canvas */
    elements: PlacedElement[];

    /** Callback to update layout configuration */
    onLayoutUpdate: (updates: Partial<FrameLayoutConfig>) => void;

    /** Callback to add a new element */
    onAddElement: (element: PlacedElement) => void;

    /** Callback to update an element */
    onUpdateElement: (elementId: string, updates: Partial<PlacedElement>) => void;

    /** Currently selected element ID */
    selectedElementId: string | null;

    /** Callback when an element is selected */
    onSelectElement: (elementId: string | null) => void;

    /** Optional callback when zoom level changes */
    onZoomChange?: (zoom: number) => void;

    /** Preview mode - hides canvas options */
    previewMode?: boolean;

    /** Optional callback when background Rive discoveries change */
    onBackgroundRiveDiscovery?: (machines: DiscoveredRiveStateMachine[], bindings: DiscoveredRiveDataBinding[]) => void;

    /** Optional callback when element Rive discoveries change */
    onElementRiveDiscovery?: (discoveries: Map<string, { machines: DiscoveredRiveStateMachine[]; bindings: DiscoveredRiveDataBinding[] }>) => void;
}

/**
 * Default element sizes - Static data at file scope for optimal performance
 * OPTIMIZATION: Moved outside component to prevent recreation on every mount
 */
const DEFAULT_ELEMENT_SIZES: Record<string, { width: number; height: number }> = {
    sensor: { width: 200, height: 50 },
    text: { width: 150, height: 40 },
    gauge: { width: 200, height: 200 },
    timedate: { width: 200, height: 60 },
    'media-image': { width: 300, height: 200 },
    'media-video': { width: 300, height: 200 },
    'media-rive': { width: 300, height: 200 },
    ecg: { width: 400, height: 150 }
};

/**
 * Default element properties - Static data at file scope for optimal performance
 * OPTIMIZATION: Moved outside component to prevent recreation on every mount
 * TYPE SAFETY: Uses explicit interfaces instead of 'any' for full type checking
 */
const DEFAULT_ELEMENT_PROPERTIES: Record<string, SensorProperties | TextProperties | GaugeProperties | TimeDateProperties | MediaImageProperties | MediaVideoProperties | MediaRiveProperties | ECGProperties> = {
    sensor: {
        sensorTag: '',
        showLabel: true,
        showUnit: true,
        placeholderSensorLabel: 'Sensor',
        placeholderValue: '--',
        placeholderUnit: '',
        fontSize: 14,
        fontFamily: 'Inter',
        fontWeight: 'normal',
        textColor: '#FFFFFF',
        backgroundColor: 'transparent',
        textAlign: 'center',
        verticalAlign: 'center',
        alignment: 'center'
    },
    text: {
        text: 'Text Label',
        fontSize: 16,
        fontFamily: 'Inter',
        fontWeight: 'normal',
        color: '#FFFFFF',
        backgroundColor: 'transparent',
        textAlign: 'center',
        verticalAlign: 'center',
        alignment: 'center'
    },
    gauge: {
        sensorTag: '',
        minValue: 0,
        maxValue: 100,
        startAngle: -90,
        endAngle: 90,
        innerRadius: '70%',
        outerRadius: '100%',
        cornerRadius: '50%',
        valueLabel: '',
        showValue: true,
        gaugeColor: '#2196f3',
        referenceArcColor: '#e0e0e0',
        textColor: '#333333',
        textFontSize: 0,
        textFontFamily: 'Roboto, sans-serif',
        textFontWeight: 600,
        backgroundColor: 'transparent'
    },
    timedate: {
        displayMode: 'time',
        timeFormat: '12h',
        dateFormat: 'short',
        timezone: 'America/Chicago',
        showSeconds: true,
        fontSize: 16,
        fontFamily: 'Inter',
        fontWeight: 'normal',
        textColor: '#FFFFFF',
        backgroundColor: 'transparent',
        textAlign: 'center',
        verticalAlign: 'center'
    },
    'media-image': {
        filename: null,
        objectFit: 'cover',
        opacity: 1
    },
    'media-video': {
        filename: null,
        objectFit: 'cover',
        opacity: 1,
        loop: true,
        muted: true,
        autoplay: true
    },
    'media-rive': {
        filename: null,
        autoplay: true,
        backgroundColor: 'transparent'
    },
    ecg: {
        sensorTag: '',
        yAxisMin: 0,
        yAxisMax: 100,
        bufferSize: 200,
        lineWidth: 2,
        gridScrollSpeed: 0.5,
        waveformColor: '#00ff00',
        backgroundColor: '#000000',
        gridBackgroundColor: 'transparent',
        gridColor: 'rgba(0, 255, 0, 0.2)',
        showGrid: true,
        showBorder: true
    }
};

/**
 * Valid element types
 * TYPE SAFETY: Used for type guarding element type strings
 */
type ElementType = 'sensor' | 'text' | 'gauge' | 'timedate' | 'media-image' | 'media-video' | 'media-rive' | 'ecg';

/**
 * Type guard for element types
 * TYPE SAFETY: Validates string is a valid ElementType
 */
const isValidElementType = (type: string): type is ElementType => {
    return ['sensor', 'text', 'gauge', 'timedate', 'media-image', 'media-video', 'media-rive', 'ecg'].includes(type);
};

/**
 * Main canvas component for FrameEngine2
 */
const FrameEngine2_Canvas = forwardRef<FrameEngine2_CanvasRef, FrameEngine2_CanvasProps>(({
    layout,
    elements,
    onLayoutUpdate,
    onAddElement,
    onUpdateElement,
    selectedElementId,
    onSelectElement,
    onZoomChange,
    previewMode = false,
    onBackgroundRiveDiscovery,
    onElementRiveDiscovery
}, ref) => {
    const theme = useTheme();

    // Ref to canvas container for viewport management
    const containerRef = useRef<HTMLDivElement>(null);

    // Debug panel visibility state
    const [showDebugPanel, setShowDebugPanel] = useState<boolean>(false);

    // Drag over state for visual feedback
    const [isDragOver, setIsDragOver] = useState<boolean>(false);

    // Rive discovery state - Background
    const [backgroundRiveMachines, setBackgroundRiveMachines] = useState<DiscoveredRiveStateMachine[]>([]);
    const [backgroundRiveBindings, setBackgroundRiveBindings] = useState<DiscoveredRiveDataBinding[]>([]);

    // Rive discovery state - Elements (Map of elementId -> discoveries)
    const [elementRiveDiscoveries, setElementRiveDiscoveries] = useState<Map<string, {
        machines: DiscoveredRiveStateMachine[];
        bindings: DiscoveredRiveDataBinding[];
    }>>(new Map());

    // Color picker context (replaces window API)
    const colorPicker = useColorPicker();

    // Initialize sensor tag manager
    const { debugData: baseDebugData, resolvedValues } = useSensorTagManager({
        layout,
        elements,
        enabled: true
    });

    // Enhance debug data with Rive discovery info
    const debugData = useMemo(() => {
        const totalInputs = backgroundRiveMachines.reduce((sum, m) => sum + m.inputs.length, 0);
        const inputNames = backgroundRiveMachines.flatMap(m => m.inputs.map(i => i.name));
        const bindingNames = backgroundRiveBindings.map(b => b.name);

        return {
            ...baseDebugData,
            riveInfo: {
                stateMachines: backgroundRiveMachines.length,
                totalInputs,
                dataBindings: backgroundRiveBindings.length,
                inputNames,
                bindingNames
            }
        };
    }, [baseDebugData, backgroundRiveMachines, backgroundRiveBindings]);

    // Initialize canvas viewport for pan/zoom
    const {
        transformStyle,
        isPanning,
        currentZoom,
        resetView,
        handleMouseDown,
        handleMouseMove,
        handleMouseUp
    } = useCanvasViewport({
        containerRef,
        canvasWidth: layout.width,
        canvasHeight: layout.height
    });

    /**
     * Expose resetView method to parent via ref
     */
    useImperativeHandle(ref, () => ({
        resetView
    }), [resetView]);

    /**
     * Get canvas settings or use defaults
     * OPTIMIZED: Memoized to prevent object creation on every render
     */
    const canvasSettings = useMemo(() => {
        return layout.canvasSettings || DEFAULT_CANVAS_SETTINGS;
    }, [layout.canvasSettings]);

    const { grid } = canvasSettings;

    /**
     * Ref to stabilize onZoomChange callback
     * OPTIMIZATION: Prevents effect re-run when callback reference changes
     */
    const onZoomChangeRef = useRef(onZoomChange);
    useEffect(() => {
        onZoomChangeRef.current = onZoomChange;
    }, [onZoomChange]);

    /**
     * Notify parent of zoom changes
     * OPTIMIZATION: Only calls callback when zoom actually changes, using ref for stability
     */
    useEffect(() => {
        if (onZoomChangeRef.current) {
            onZoomChangeRef.current(currentZoom);
        }
    }, [currentZoom]);

    /**
     * Toggle debug panel visibility
     */
    const handleToggleDebugPanel = useCallback(() => {
        setShowDebugPanel(prev => !prev);
    }, []);

    /**
     * Handle Rive discovery from background renderer
     */
    const handleBackgroundRiveDiscovery = useCallback((
        machines: DiscoveredRiveStateMachine[],
        bindings: DiscoveredRiveDataBinding[]
    ) => {
        console.log('[FrameEngine2_Canvas] Background Rive discovery received:', {
            machines: machines.length,
            bindings: bindings.length
        });
        setBackgroundRiveMachines(machines);
        setBackgroundRiveBindings(bindings);
    }, []);

    /**
     * Handle Rive discovery from element renderers
     */
    const handleElementRiveDiscovery = useCallback((
        elementId: string,
        machines: DiscoveredRiveStateMachine[],
        bindings: DiscoveredRiveDataBinding[]
    ) => {
        console.log(`[FrameEngine2_Canvas] Element Rive discovery received for ${elementId}:`, {
            machines: machines.length,
            bindings: bindings.length
        });
        setElementRiveDiscoveries(prev => {
            const next = new Map(prev);
            next.set(elementId, { machines, bindings });
            console.log('[FrameEngine2_Canvas] Element discoveries map updated:', {
                totalElements: next.size,
                elementIds: Array.from(next.keys())
            });
            return next;
        });
    }, []);

    /**
     * Notify parent when background Rive discoveries change
     */
    useEffect(() => {
        if (onBackgroundRiveDiscovery) {
            onBackgroundRiveDiscovery(backgroundRiveMachines, backgroundRiveBindings);
        }
    }, [backgroundRiveMachines, backgroundRiveBindings, onBackgroundRiveDiscovery]);

    /**
     * Notify parent when element Rive discoveries change
     */
    useEffect(() => {
        if (onElementRiveDiscovery) {
            onElementRiveDiscovery(elementRiveDiscoveries);
        }
    }, [elementRiveDiscoveries, onElementRiveDiscovery]);

    /**
     * Convert color picker string to RgbaColor object
     * OPTIMIZATION: Memoized to prevent recalculation
     */
    const colorPickerRgba = useMemo(() => {
        return parseColorToRgba(colorPicker.state.color);
    }, [colorPicker.state.color]);

    /**
     * Handle color picker change - converts RgbaColor to string
     */
    const handleColorPickerChange = useCallback((color: RgbaColor) => {
        const { r, g, b, a } = color;

        let colorString: string;
        if (a !== undefined && a < 1) {
            colorString = `rgba(${r}, ${g}, ${b}, ${a})`;
        } else {
            // Convert to hex when fully opaque
            const toHex = (n: number) => n.toString(16).padStart(2, '0');
            colorString = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        }

        colorPicker.updateColor(colorString);
    }, [colorPicker]);

    /**
     * Handle drag over canvas - prevents default to allow drop
     */
    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setIsDragOver(true);
    }, []);

    /**
     * Handle drag leave canvas
     */
    const handleDragLeave = useCallback(() => {
        setIsDragOver(false);
    }, []);

    /**
     * Handle drop on canvas - creates new element at drop position
     * TYPE SAFETY: Validates element type before creating element
     */
    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(false);

        const elementType = e.dataTransfer.getData('elementType');
        if (!elementType) return;

        // Validate element type
        if (!isValidElementType(elementType)) {
            console.warn('[FrameEngine2_Canvas] Invalid element type:', elementType);
            return;
        }

        // Get drop position relative to canvas
        const canvasRect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - canvasRect.left;
        const y = e.clientY - canvasRect.top;

        // Use static defaults from file scope (optimal performance)
        const size = DEFAULT_ELEMENT_SIZES[elementType] || { width: 100, height: 100 };

        // Create new element - type is validated by type guard
        // Type assertion is safe here because elementType is guaranteed to be valid
        const newElement = {
            id: `element-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            type: elementType,
            x,
            y,
            width: size.width,
            height: size.height,
            rotation: 0,
            properties: DEFAULT_ELEMENT_PROPERTIES[elementType] || {},
            visible: true,
            locked: false,
            zIndex: elements.length
        } as PlacedElement;

        onAddElement(newElement);
    }, [elements.length, onAddElement]);

    /**
     * Handle canvas background click - deselect all elements and close color picker
     */
    const handleCanvasClick = useCallback(() => {
        onSelectElement(null);
        colorPicker.close();
    }, [onSelectElement, colorPicker]);

    /**
     * Handle element click - select element
     */
    const handleElementClick = useCallback((elementId: string) => {
        onSelectElement(elementId);
    }, [onSelectElement]);

    /**
     * Memoized style objects for optimal performance
     * OPTIMIZATION: Prevents object recreation on every render
     */
    const containerStyle = useMemo(() => ({
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.palette.background.default,
        position: 'relative' as const,
        overflow: 'hidden' as const,
        cursor: isPanning ? 'grabbing' : 'grab'
    }), [theme.palette.background.default, isPanning]);

    const controlsPositionStyle = useMemo(() => ({
        position: 'absolute' as const,
        top: 8,
        right: 8
    }), []);

    const canvasContainerStyle = useMemo(() => ({
        position: 'absolute' as const,
        top: 0,
        left: 0,
        width: layout.width,
        height: layout.height,
        backgroundColor: layout.backgroundColor || '#000000',
        boxShadow: theme.shadows[4],
        overflow: 'visible' as const,
        border: isDragOver ? '2px dashed #2196f3' : 'none',
        cursor: 'default' as const,
        pointerEvents: 'auto' as const,
        ...transformStyle
    }), [layout.width, layout.height, layout.backgroundColor, theme.shadows, isDragOver, transformStyle]);

    const gridOverlayStyle = useMemo(() => ({
        position: 'absolute' as const,
        inset: '0',
        opacity: grid.snapToGrid ? 0.4 : 0.2,
        pointerEvents: 'none' as const,
        backgroundImage: `
            linear-gradient(to right, ${grid.gridColor} 1px, transparent 1px),
            linear-gradient(to bottom, ${grid.gridColor} 1px, transparent 1px)
        `,
        backgroundSize: `${grid.gridSize}px ${grid.gridSize}px`,
        zIndex: 1,
        transition: 'opacity 0.2s ease'
    }), [grid.snapToGrid, grid.gridColor, grid.gridSize]);

    const elementsLayerStyle = useMemo(() => ({
        position: 'absolute' as const,
        inset: '0',
        zIndex: 2,
        pointerEvents: 'none' as const
        // NOTE: Individual elements override with 'auto' - this allows clicking canvas background
    }), []);

    return (
        <div
            ref={containerRef}
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={containerStyle}
        >
            {/* Canvas Controls - Top Right (includes color picker) */}
            <div style={controlsPositionStyle}>
                <FrameEngine2_CanvasControls
                    layout={layout}
                    onLayoutUpdate={onLayoutUpdate}
                    showDebugPanel={showDebugPanel}
                    onToggleDebugPanel={handleToggleDebugPanel}
                    onResetView={resetView}
                    elements={elements}
                    colorPickerVisible={colorPicker.state.visible}
                    colorPickerColor={colorPickerRgba}
                    onColorPickerChange={handleColorPickerChange}
                    onColorPickerClose={colorPicker.close}
                    previewMode={previewMode}
                />
            </div>

            {/* Sensor Debug Panel - Top Left (conditionally rendered) */}
            {showDebugPanel && (
                <FrameEngine2_SensorDebugPanel debugData={debugData} />
            )}

            {/* Canvas Container - Transform for pan/zoom
                CRITICAL: position: absolute allows canvas to extend beyond viewport
                when canvas is larger than window (e.g., 1920x1080 canvas in small window)
                top: 0, left: 0 ensures transform starts from container origin
            */}
            <div
                data-canvas-container="true"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleCanvasClick}
                style={canvasContainerStyle}
            >
                {/* Background Layer (Image/Video/Rive) - z-index: 0 */}
                <FrameEngine2_Renderer_Background
                    layout={layout}
                    onRiveDiscovery={handleBackgroundRiveDiscovery}
                />

                {/* Grid Overlay */}
                {grid.showGrid && (
                    <div style={gridOverlayStyle} />
                )}

                {/* Elements Layer */}
                <div style={elementsLayerStyle}>
                    {elements
                        .filter(element => element.visible)
                        .map((element) => (
                        <FrameEngine2_Renderer_Elements
                            key={element.id}
                            element={element}
                            isSelected={selectedElementId === element.id}
                            onClick={handleElementClick}
                            onUpdateElement={onUpdateElement}
                            resolvedValues={resolvedValues}
                            showPlaceholders={true}
                            elementPadding={canvasSettings.elementPadding}
                            grid={grid}
                            previewMode={previewMode}
                            onRiveDiscovery={handleElementRiveDiscovery}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
});

export default React.memo(FrameEngine2_Canvas);
