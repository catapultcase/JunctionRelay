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

import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useTheme } from '@mui/material/styles';
import {
    FrameEngine_ElementRenderer,
    BaseElement,
    RendererConfig
} from './FrameEngine_ElementRenderer';
import {
    FrameEngine_BackgroundRenderer,
    BackgroundConfig,
    DiscoveredStateMachine,
    DiscoveredDataBinding
} from './FrameEngine_BackgroundRenderer';
import type {
    PlacedElement,
    FrameLayoutConfig,
    AvailableSensor
} from './FrameEngine_Types';

interface CanvasProps {
    layout: FrameLayoutConfig;
    elements: PlacedElement[];
    selectedElementIds: string[];
    availableSensors?: AvailableSensor[];
    previewMode?: boolean;
    onElementUpdate: (elementId: string, updates: Partial<PlacedElement>) => void;
    onElementSelect: (elementIds: string[], addToSelection?: boolean) => void;
    onElementAdd: (element: Omit<PlacedElement, 'id'>) => void;
    onCanvasClick: () => void;
    onStartElementOperation?: (action: string) => void;
    onRiveDiscovery?: (machines: DiscoveredStateMachine[], bindings: DiscoveredDataBinding[]) => void;
    onElementRiveDiscovery?: (elementId: string, machines: DiscoveredStateMachine[], bindings: DiscoveredDataBinding[]) => void;
    onCanvasSettingsChange?: (settings: {
        grid: { snapToGrid: boolean; showGrid: boolean; gridSize: number; gridColor: string; };
        elementPadding: number;
    }) => void;
}

interface ViewportState {
    scale: number;
    translateX: number;
    translateY: number;
}

interface DragState {
    isDragging: boolean;
    dragType: 'move' | 'resize';
    elementId: string | null;
    startPos: { x: number; y: number };
    startElementPos: { x: number; y: number; width: number; height: number };
    resizeHandle: string | null;
    hasAddedHistory: boolean;
}

interface DropZoneData {
    isActive: boolean;
    elementType: string | null;
}

const ImprovedFrameEngine_Canvas: React.FC<CanvasProps> = ({
    layout,
    elements,
    selectedElementIds,
    availableSensors = [],
    previewMode = false,
    onElementUpdate,
    onElementSelect,
    onElementAdd,
    onCanvasClick,
    onStartElementOperation,
    onRiveDiscovery,
    onElementRiveDiscovery,
    onCanvasSettingsChange,
}) => {
    const theme = useTheme();
    const viewportRef = useRef<HTMLDivElement>(null);
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

    // Viewport transform state
    const [viewport, setViewport] = useState<ViewportState>({
        scale: 1,
        translateX: 0,
        translateY: 0,
    });

    // Grid and padding state
    const [snapToGrid, setSnapToGrid] = useState(layout.canvasSettings?.grid.snapToGrid ?? false);
    const [showGrid, setShowGrid] = useState(layout.canvasSettings?.grid.showGrid ?? false);
    const [gridSize, setGridSize] = useState(layout.canvasSettings?.grid.gridSize ?? 10);
    const [gridColor, setGridColor] = useState(layout.canvasSettings?.grid.gridColor ?? '#000000');
    const [elementPadding, setElementPadding] = useState(layout.canvasSettings?.elementPadding ?? 4);

    // Pan state
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });

    const [dragState, setDragState] = useState<DragState>({
        isDragging: false,
        dragType: 'move',
        elementId: null,
        startPos: { x: 0, y: 0 },
        startElementPos: { x: 0, y: 0, width: 0, height: 0 },
        resizeHandle: null,
        hasAddedHistory: false,
    });

    const [dropZone, setDropZone] = useState<DropZoneData>({
        isActive: false,
        elementType: null,
    });

    // Check if an element is locked
    const isElementLocked = useCallback((elementId: string): boolean => {
        const element = elements.find(el => el.id === elementId);
        return element?.locked ?? false;
    }, [elements]);

    // Convert PlacedElement[] to BaseElement[] for the shared renderer
    const baseElements: BaseElement[] = useMemo(() => {
        return elements.map(element => ({
            id: element.id,
            type: element.type,
            position: {
                x: element.x,
                y: element.y,
                width: element.width,
                height: element.height,
            },
            properties: element.properties,
            visible: element.visible ?? true,
            locked: element.locked ?? false,
        }));
    }, [elements]);

    // Create sensor data map for the shared renderer
    const sensorDataMap = useMemo(() => {
        const sensorMap: Record<string, any> = {};

        availableSensors.forEach(sensor => {
            sensorMap[sensor.id] = {
                value: sensor.value,
                unit: sensor.unit,
                displayValue: `${sensor.value}${sensor.unit ? ' ' + sensor.unit : ''}`
            };
        });

        return sensorMap;
    }, [availableSensors]);

    // Create renderer configuration
    const rendererConfig: RendererConfig = useMemo(() => ({
        elementPadding: elementPadding,
        isInteractive: !previewMode,
        showPlaceholders: true,
    }), [elementPadding, previewMode]);

    // Create background configuration for the shared renderer
    const backgroundConfig: BackgroundConfig = useMemo(() => {
        const bgType = (layout.backgroundType as 'color' | 'image' | 'video' | 'rive') || 'color';

        return {
            type: bgType,
            color: layout.backgroundColor,
            imageUrl: layout.backgroundImageUrl || undefined,
            videoUrl: layout.backgroundVideoUrl || undefined,
            riveFile: layout.riveFile || undefined,
            riveStateMachine: layout.riveStateMachine || undefined,
            riveInputs: layout.riveInputs || undefined,
            riveBindings: layout.riveBindings || undefined,
        };
    }, [
        layout.backgroundColor,
        layout.backgroundImageUrl,
        layout.backgroundVideoUrl,
        layout.backgroundType,
        layout.riveFile,
        layout.riveStateMachine,
        layout.riveInputs,
        layout.riveBindings
    ]);

    // Canvas settings update handler
    const updateCanvasSettings = useCallback((updates: {
        grid?: Partial<{ snapToGrid: boolean; showGrid: boolean; gridSize: number; gridColor: string; }>;
        elementPadding?: number;
    }) => {
        if (onCanvasSettingsChange) {
            const currentSettings = {
                grid: { snapToGrid, showGrid, gridSize, gridColor },
                elementPadding
            };

            const newSettings = {
                ...currentSettings,
                ...updates,
                grid: { ...currentSettings.grid, ...(updates.grid || {}) }
            };

            onCanvasSettingsChange(newSettings);
        }
    }, [snapToGrid, showGrid, gridSize, gridColor, elementPadding, onCanvasSettingsChange]);

    // Individual setting handlers
    const handleSnapToGridChange = useCallback((value: boolean) => {
        setSnapToGrid(value);
        updateCanvasSettings({ grid: { snapToGrid: value } });
    }, [updateCanvasSettings]);

    const handleShowGridChange = useCallback((value: boolean) => {
        setShowGrid(value);
        updateCanvasSettings({ grid: { showGrid: value } });
    }, [updateCanvasSettings]);

    const handleGridSizeChange = useCallback((value: number) => {
        setGridSize(value);
        updateCanvasSettings({ grid: { gridSize: value } });
    }, [updateCanvasSettings]);

    const handleGridColorChange = useCallback((value: string) => {
        setGridColor(value);
        updateCanvasSettings({ grid: { gridColor: value } });
    }, [updateCanvasSettings]);

    const handleElementPaddingChange = useCallback((value: number) => {
        setElementPadding(value);
        updateCanvasSettings({ elementPadding: value });
    }, [updateCanvasSettings]);

    // Sync with layout changes
    useEffect(() => {
        if (layout.canvasSettings) {
            setSnapToGrid(layout.canvasSettings.grid.snapToGrid);
            setShowGrid(layout.canvasSettings.grid.showGrid);
            setGridSize(layout.canvasSettings.grid.gridSize);
            setGridColor(layout.canvasSettings.grid.gridColor);
            setElementPadding(layout.canvasSettings.elementPadding);
        }
    }, [layout.canvasSettings]);

    // Snap to grid function
    const snapToGridValue = useCallback((value: number) => {
        if (!snapToGrid || previewMode) return value;
        return Math.round(value / gridSize) * gridSize;
    }, [snapToGrid, gridSize, previewMode]);

    // Convert screen coordinates to viewport coordinates
    const screenToViewport = useCallback((screenX: number, screenY: number) => {
        if (!viewportRef.current) return { x: 0, y: 0 };

        const rect = viewportRef.current.getBoundingClientRect();
        return {
            x: screenX - rect.left,
            y: screenY - rect.top,
        };
    }, []);

    // Convert viewport coordinates to canvas coordinates
    const viewportToCanvas = useCallback((viewportX: number, viewportY: number) => {
        return {
            x: (viewportX - viewport.translateX) / viewport.scale,
            y: (viewportY - viewport.translateY) / viewport.scale,
        };
    }, [viewport]);

    // Convert screen coordinates directly to canvas coordinates
    const screenToCanvas = useCallback((screenX: number, screenY: number) => {
        const viewportCoords = screenToViewport(screenX, screenY);
        return viewportToCanvas(viewportCoords.x, viewportCoords.y);
    }, [screenToViewport, viewportToCanvas]);

    // Reset view to 100% scale centered in viewport
    const fitToViewport = useCallback(() => {
        if (!viewportRef.current) return;

        const viewportRect = viewportRef.current.getBoundingClientRect();
        const canvasWidth = layout.width;
        const canvasHeight = layout.height;

        // Center the canvas in the viewport at 100% scale
        const translateX = (viewportRect.width - canvasWidth) / 2;
        const translateY = (viewportRect.height - canvasHeight) / 2;

        setViewport({
            scale: 1,
            translateX: translateX,
            translateY: translateY,
        });
    }, [layout.width, layout.height]);

    // Reset to fit on layout change
    useEffect(() => {
        fitToViewport();
    }, [layout.width, layout.height, fitToViewport]);

    // Handle wheel for zoom
    const handleWheel = useCallback((event: WheelEvent) => {
        event.preventDefault();

        if (event.ctrlKey || event.metaKey) {
            // Zoom with Ctrl/Cmd
            const viewportCoords = screenToViewport(event.clientX, event.clientY);
            const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
            const newScale = Math.max(0.1, Math.min(30, viewport.scale * zoomFactor));

            const scaleChange = newScale / viewport.scale;
            const newTranslateX = viewportCoords.x - (viewportCoords.x - viewport.translateX) * scaleChange;
            const newTranslateY = viewportCoords.y - (viewportCoords.y - viewport.translateY) * scaleChange;

            setViewport({
                scale: newScale,
                translateX: newTranslateX,
                translateY: newTranslateY,
            });
        } else if (event.shiftKey) {
            // Horizontal pan with Shift
            setViewport(prev => ({
                ...prev,
                translateX: prev.translateX - event.deltaY,
            }));
        } else {
            // Default: zoom without modifier
            const viewportCoords = screenToViewport(event.clientX, event.clientY);
            const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
            const newScale = Math.max(0.1, Math.min(30, viewport.scale * zoomFactor));

            const scaleChange = newScale / viewport.scale;
            const newTranslateX = viewportCoords.x - (viewportCoords.x - viewport.translateX) * scaleChange;
            const newTranslateY = viewportCoords.y - (viewportCoords.y - viewport.translateY) * scaleChange;

            setViewport({
                scale: newScale,
                translateX: newTranslateX,
                translateY: newTranslateY,
            });
        }
    }, [viewport, screenToViewport]);

    // Fix passive event listener issue
    useEffect(() => {
        const element = viewportRef.current;
        if (!element) return;

        element.addEventListener('wheel', handleWheel as any, { passive: false });
        return () => element.removeEventListener('wheel', handleWheel as any);
    }, [handleWheel]);

    // Handle mouse down for panning
    const handleMouseDown = useCallback((event: React.MouseEvent) => {
        if (event.button === 1) { // Middle button
            event.preventDefault();
            setIsPanning(true);
            setPanStart({
                x: event.clientX - viewport.translateX,
                y: event.clientY - viewport.translateY,
            });
        }
    }, [viewport]);

    // Handle element mouse events for the shared renderer
    const handleElementMouseDown = useCallback((event: React.MouseEvent, elementId: string) => {
        if (previewMode) return;

        // Check if element is locked - completely ignore locked elements on canvas
        if (isElementLocked(elementId)) {
            // Don't stop propagation - let the click pass through to canvas
            return;
        }

        event.stopPropagation();

        const element = elements.find(el => el.id === elementId);
        if (!element) return;

        if (!selectedElementIds.includes(elementId)) {
            onElementSelect([elementId], event.ctrlKey || event.metaKey);
        }

        const canvasPos = screenToCanvas(event.clientX, event.clientY);

        const action = `Move element ${elementId}`;
        if (onStartElementOperation) {
            onStartElementOperation(action);
        }

        setDragState({
            isDragging: true,
            dragType: 'move',
            elementId,
            startPos: canvasPos,
            startElementPos: {
                x: element.x,
                y: element.y,
                width: element.width,
                height: element.height,
            },
            resizeHandle: null,
            hasAddedHistory: true,
        });
    }, [previewMode, elements, selectedElementIds, onElementSelect, screenToCanvas, onStartElementOperation, isElementLocked]);

    const handleElementMouseEnter = useCallback((event: React.MouseEvent, elementId: string) => {
        if (!selectedElementIds.includes(elementId) && !previewMode) {
            const target = event.currentTarget as HTMLElement;
            target.style.outlineColor = theme.palette.text.disabled;
        }
    }, [selectedElementIds, previewMode, theme]);

    const handleElementMouseLeave = useCallback((event: React.MouseEvent, elementId: string) => {
        if (!selectedElementIds.includes(elementId) && !previewMode) {
            const target = event.currentTarget as HTMLElement;
            target.style.outlineColor = theme.palette.divider;
        }
    }, [selectedElementIds, previewMode, theme]);

    // Render resize handles for selected elements
    const renderResizeHandles = useCallback(() => {
        if (previewMode) return null;

        return elements.map(element => {
            const isSelected = selectedElementIds.includes(element.id);
            const locked = element.locked ?? false;

            // Don't show resize handles for locked elements
            if (!isSelected || locked) return null;

            const handles = ['nw', 'ne', 'sw', 'se'];

            return handles.map(handle => (
                <div
                    key={`${element.id}-${handle}`}
                    data-skip-thumbnail="true"
                    style={{
                        position: 'absolute',
                        width: '16px',
                        height: '16px',
                        backgroundColor: theme.palette.primary.main,
                        border: `2px solid ${theme.palette.background.paper}`,
                        cursor: `${handle}-resize`,
                        zIndex: 10,
                        left: handle.includes('w') ? element.x - 8 : element.x + element.width - 8,
                        top: handle.includes('n') ? element.y - 8 : element.y + element.height - 8,
                    }}
                    onMouseDown={(e) => {
                        e.stopPropagation();

                        if (!selectedElementIds.includes(element.id)) {
                            onElementSelect([element.id], e.ctrlKey || e.metaKey);
                        }

                        const canvasPos = screenToCanvas(e.clientX, e.clientY);
                        const action = `Resize element ${element.id}`;
                        if (onStartElementOperation) {
                            onStartElementOperation(action);
                        }

                        setDragState({
                            isDragging: true,
                            dragType: 'resize',
                            elementId: element.id,
                            startPos: canvasPos,
                            startElementPos: {
                                x: element.x,
                                y: element.y,
                                width: element.width,
                                height: element.height,
                            },
                            resizeHandle: handle,
                            hasAddedHistory: true,
                        });
                    }}
                />
            ));
        }).flat();
    }, [elements, selectedElementIds, previewMode, onElementSelect, screenToCanvas, onStartElementOperation, theme]);

    // Global mouse move and up handlers
    useEffect(() => {
        const handleGlobalMouseMove = (event: MouseEvent) => {
            if (isPanning) {
                setViewport(prev => ({
                    ...prev,
                    translateX: event.clientX - panStart.x,
                    translateY: event.clientY - panStart.y,
                }));
            }

            if (!previewMode && dragState.isDragging && dragState.elementId) {
                // Check if element is locked - if so, don't allow dragging/resizing
                if (isElementLocked(dragState.elementId)) {
                    return;
                }

                const canvasPos = screenToCanvas(event.clientX, event.clientY);
                const deltaX = canvasPos.x - dragState.startPos.x;
                const deltaY = canvasPos.y - dragState.startPos.y;

                if (dragState.dragType === 'move') {
                    let newX = dragState.startElementPos.x + deltaX;
                    let newY = dragState.startElementPos.y + deltaY;

                    if (snapToGrid) {
                        newX = snapToGridValue(newX);
                        newY = snapToGridValue(newY);
                    }

                    const roundedX = Math.round(newX * 100) / 100;
                    const roundedY = Math.round(newY * 100) / 100;

                    onElementUpdate(dragState.elementId, { x: roundedX, y: roundedY });
                } else if (dragState.dragType === 'resize' && dragState.resizeHandle) {
                    let newWidth = dragState.startElementPos.width;
                    let newHeight = dragState.startElementPos.height;
                    let newX = dragState.startElementPos.x;
                    let newY = dragState.startElementPos.y;

                    switch (dragState.resizeHandle) {
                        case 'se':
                            newWidth = Math.max(20, dragState.startElementPos.width + deltaX);
                            newHeight = Math.max(20, dragState.startElementPos.height + deltaY);
                            break;
                        case 'sw':
                            newWidth = Math.max(20, dragState.startElementPos.width - deltaX);
                            newHeight = Math.max(20, dragState.startElementPos.height + deltaY);
                            newX = dragState.startElementPos.x + (dragState.startElementPos.width - newWidth);
                            break;
                        case 'ne':
                            newWidth = Math.max(20, dragState.startElementPos.width + deltaX);
                            newHeight = Math.max(20, dragState.startElementPos.height - deltaY);
                            newY = dragState.startElementPos.y + (dragState.startElementPos.height - newHeight);
                            break;
                        case 'nw':
                            newWidth = Math.max(20, dragState.startElementPos.width - deltaX);
                            newHeight = Math.max(20, dragState.startElementPos.height - deltaY);
                            newX = dragState.startElementPos.x + (dragState.startElementPos.width - newWidth);
                            newY = dragState.startElementPos.y + (dragState.startElementPos.height - newHeight);
                            break;
                    }

                    if (snapToGrid) {
                        newX = snapToGridValue(newX);
                        newY = snapToGridValue(newY);
                        newWidth = snapToGridValue(newWidth);
                        newHeight = snapToGridValue(newHeight);
                    }

                    const roundedX = Math.round(newX * 100) / 100;
                    const roundedY = Math.round(newY * 100) / 100;
                    const roundedWidth = Math.round(newWidth * 100) / 100;
                    const roundedHeight = Math.round(newHeight * 100) / 100;

                    onElementUpdate(dragState.elementId, {
                        x: roundedX,
                        y: roundedY,
                        width: roundedWidth,
                        height: roundedHeight
                    });
                }
            }
        };

        const handleGlobalMouseUp = () => {
            setIsPanning(false);
            setDragState({
                isDragging: false,
                dragType: 'move',
                elementId: null,
                startPos: { x: 0, y: 0 },
                startElementPos: { x: 0, y: 0, width: 0, height: 0 },
                resizeHandle: null,
                hasAddedHistory: false,
            });
        };

        if (isPanning || (!previewMode && dragState.isDragging)) {
            document.addEventListener('mousemove', handleGlobalMouseMove);
            document.addEventListener('mouseup', handleGlobalMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleGlobalMouseMove);
            document.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [isPanning, dragState, panStart, screenToCanvas, onElementUpdate, snapToGrid, snapToGridValue, previewMode, isElementLocked]);

    // Handle canvas click (clear selection)
    const handleCanvasClick = useCallback((event: React.MouseEvent) => {
        if (previewMode) return;
        if (event.target === event.currentTarget) {
            onCanvasClick();
        }
    }, [onCanvasClick, previewMode]);

    // Handle drag over for external drops
    const handleDragOver = useCallback((event: React.DragEvent) => {
        if (previewMode) return;

        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';

        const elementType = event.dataTransfer.getData('application/x-element-type');
        setDropZone({ isActive: true, elementType });
    }, [previewMode]);

    // Handle drag leave
    const handleDragLeave = useCallback((event: React.DragEvent) => {
        if (previewMode) return;
        if (!canvasRef.current?.contains(event.relatedTarget as Node)) {
            setDropZone({ isActive: false, elementType: null });
        }
    }, [previewMode]);

    // Handle drop
    const handleDrop = useCallback((event: React.DragEvent) => {
        if (previewMode) return;

        event.preventDefault();

        const elementType = event.dataTransfer.getData('application/x-element-type');
        const elementData = event.dataTransfer.getData('application/x-element-data');

        if (!elementType) return;

        const canvasPos = screenToCanvas(event.clientX, event.clientY);

        let newElement: Omit<PlacedElement, 'id'>;

        if (elementData) {
            newElement = JSON.parse(elementData);
            let dropX = canvasPos.x - newElement.width / 2;
            let dropY = canvasPos.y - newElement.height / 2;

            if (snapToGrid) {
                dropX = snapToGridValue(dropX);
                dropY = snapToGridValue(dropY);
            }

            newElement.x = dropX;
            newElement.y = dropY;
        } else {
            let dropX = canvasPos.x - 60;
            let dropY = canvasPos.y - 30;

            if (snapToGrid) {
                dropX = snapToGridValue(dropX);
                dropY = snapToGridValue(dropY);
            }

            newElement = {
                type: elementType as PlacedElement['type'],
                x: dropX,
                y: dropY,
                width: 120,
                height: 60,
                properties: getDefaultElementProperties(elementType),
            };
        }

        onElementAdd(newElement);
        setDropZone({ isActive: false, elementType: null });
    }, [screenToCanvas, onElementAdd, snapToGrid, snapToGridValue, previewMode]);

    // Get default properties for element type
    const getDefaultElementProperties = (elementType: string): Record<string, any> => {
        switch (elementType) {
            case 'sensor':
                return {
                    sensorTag: '',
                    sensorName: 'New Sensor',
                    placeholderSensorLabel: 'Sensor (element)',
                    placeholderValue: '',
                    placeholderUnit: '',
                    fontSize: 12,
                    fontFamily: 'Inter',
                    fontWeight: 'normal',
                    textColor: '#000000',
                    backgroundColor: 'transparent',
                    textAlign: 'left',
                    verticalAlign: 'center',
                    showUnit: true,
                    showLabel: true
                };
            case 'text':
                return {
                    text: 'Text Label',
                    fontSize: 14,
                    fontFamily: 'Inter',
                    fontWeight: 'normal',
                    color: '#000000',
                    backgroundColor: 'transparent',
                    textAlign: 'left',
                    verticalAlign: 'center'
                };
            case 'chart':
                return {
                    chartType: 'line',
                    title: 'Chart',
                    showLegend: true,
                    fontSize: 12,
                    fontFamily: 'Inter'
                };
            case 'image':
                return {
                    imageUrl: '',
                    alt: 'Image'
                };
            case 'gauge':
                return {
                    sensorTag: '',
                    placeholderSensorLabel: 'Gauge (element)',
                    gaugeType: 'semicircle',
                    minValue: 0,
                    maxValue: 100,
                    valueLabel: '',
                    showLabels: true,
                    showTicks: true
                };
            case 'ecg':
                return {
                    sensorTag: '',
                    placeholderSensorLabel: 'ECG (element)',
                    showLabel: true
                };
            case 'oscilloscope':
                return {
                    sensorTag: '',
                    placeholderSensorLabel: 'Oscilloscope (element)',
                    showLabel: true
                };
            default:
                return {};
        }
    };

    return (
        <div style={{
            flex: 1,
            padding: '16px',
            overflow: 'hidden',
            backgroundColor: theme.palette.background.default,
            display: 'flex',
            flexDirection: 'column'
        }}>
            <div
                ref={viewportRef}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: 1,
                    height: '100%',
                    position: 'relative',
                    overflow: 'hidden',
                    cursor: isPanning ? 'grabbing' : 'default',
                }}
                onMouseDown={handleMouseDown}
            >
                {/* Enhanced Control Panel - HIDDEN in preview mode */}
                {!previewMode && (
                    <div
                        data-skip-thumbnail="true"
                        style={{
                            position: 'absolute',
                            top: '16px',
                            right: '16px',
                            zIndex: 100,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                        }}
                    >
                        <button
                            onClick={fitToViewport}
                            style={{
                                padding: '8px 12px',
                                fontSize: '12px',
                                backgroundColor: theme.palette.background.paper,
                                border: `1px solid ${theme.palette.divider}`,
                                borderRadius: '4px',
                                cursor: 'pointer',
                                boxShadow: theme.shadows[2],
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                color: theme.palette.text.primary
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.palette.action.hover}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = theme.palette.background.paper}
                            title="Reset view to fit and center"
                        >
                            🎯 Reset View
                        </button>

                        <div style={{
                            backgroundColor: theme.palette.background.paper,
                            border: `1px solid ${theme.palette.divider}`,
                            borderRadius: '4px',
                            padding: '8px',
                            boxShadow: theme.shadows[2],
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                            minWidth: '120px'
                        }}>
                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '12px',
                                fontWeight: 500,
                                color: theme.palette.text.primary,
                                cursor: 'pointer'
                            }}>
                                <input
                                    type="checkbox"
                                    checked={showGrid}
                                    onChange={(e) => handleShowGridChange(e.target.checked)}
                                    style={{ cursor: 'pointer' }}
                                />
                                Show Grid
                            </label>

                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '12px',
                                fontWeight: 500,
                                color: theme.palette.text.primary,
                                cursor: 'pointer'
                            }}>
                                <input
                                    type="checkbox"
                                    checked={snapToGrid}
                                    onChange={(e) => handleSnapToGridChange(e.target.checked)}
                                    style={{ cursor: 'pointer' }}
                                />
                                Snap to Grid
                            </label>

                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '11px',
                                color: theme.palette.text.secondary,
                                minHeight: '28px',
                                padding: '4px 0'
                            }}>
                                <span>Grid size:</span>
                                <input
                                    type="number"
                                    value={gridSize}
                                    onChange={(e) => handleGridSizeChange(Math.max(1, parseInt(e.target.value) || 1))}
                                    min="1"
                                    max="50"
                                    style={{
                                        width: '45px',
                                        height: '24px',
                                        padding: '4px 6px',
                                        fontSize: '11px',
                                        border: `1px solid ${theme.palette.divider}`,
                                        borderRadius: '3px',
                                        textAlign: 'center',
                                        backgroundColor: theme.palette.background.paper,
                                        color: theme.palette.text.primary
                                    }}
                                />
                                <span>px</span>
                            </div>

                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '11px',
                                color: theme.palette.text.secondary,
                                minHeight: '28px',
                                padding: '4px 0'
                            }}>
                                <span>Grid color:</span>
                                <input
                                    type="color"
                                    value={gridColor}
                                    onChange={(e) => handleGridColorChange(e.target.value)}
                                    style={{
                                        width: '24px',
                                        height: '24px',
                                        border: `1px solid ${theme.palette.divider}`,
                                        borderRadius: '3px',
                                        cursor: 'pointer',
                                        backgroundColor: 'transparent'
                                    }}
                                />
                            </div>
                        </div>

                        <div style={{
                            backgroundColor: theme.palette.background.paper,
                            border: `1px solid ${theme.palette.divider}`,
                            borderRadius: '4px',
                            padding: '8px',
                            boxShadow: theme.shadows[2],
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                            minWidth: '120px'
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '11px',
                                color: theme.palette.text.secondary,
                                minHeight: '28px',
                                padding: '4px 0'
                            }}>
                                <span>Element padding:</span>
                                <input
                                    type="number"
                                    value={elementPadding}
                                    onChange={(e) =>
                                        handleElementPaddingChange(Math.max(4, parseInt(e.target.value) || 4))
                                    }
                                    min="4"
                                    max="20"
                                    style={{
                                        width: '45px',
                                        height: '24px',
                                        padding: '4px 6px',
                                        fontSize: '11px',
                                        border: `1px solid ${theme.palette.divider}`,
                                        borderRadius: '3px',
                                        textAlign: 'center',
                                        backgroundColor: theme.palette.background.paper,
                                        color: theme.palette.text.primary
                                    }}
                                />
                                <span>px</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* PREVIEW MODE: Simple Reset View Button */}
                {previewMode && (
                    <div
                        data-skip-thumbnail="true"
                        style={{
                            position: 'absolute',
                            top: '16px',
                            right: '16px',
                            zIndex: 100
                        }}
                    >
                        <button
                            onClick={fitToViewport}
                            style={{
                                padding: '8px 12px',
                                fontSize: '12px',
                                backgroundColor: theme.palette.background.paper,
                                border: `1px solid ${theme.palette.divider}`,
                                borderRadius: '4px',
                                cursor: 'pointer',
                                boxShadow: theme.shadows[2],
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                color: theme.palette.text.primary
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.palette.action.hover}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = theme.palette.background.paper}
                            title="Reset view to fit and center"
                        >
                            Reset View
                        </button>
                    </div>
                )}

                {/* Transform Container - This scales and translates */}
                <div
                    ref={canvasContainerRef}
                    style={{
                        position: 'absolute',
                        transformOrigin: '0 0',
                        transform: `translate(${viewport.translateX}px, ${viewport.translateY}px) scale(${viewport.scale})`,
                        pointerEvents: 'none',
                    }}
                >
                    {/* Canvas - Fixed size, contains all content */}
                    <div
                        ref={canvasRef}
                        data-canvas="true"
                        className="frame-canvas-area"
                        style={{
                            position: 'relative',
                            border: (!previewMode && dropZone.isActive) ? `2px dashed ${theme.palette.primary.main}` : 'none',
                            boxShadow: theme.shadows[4],
                            userSelect: 'none',
                            width: layout.width,
                            height: layout.height,
                            overflow: 'visible',
                            cursor: 'default',
                            backgroundColor: backgroundConfig.type === 'color' ? backgroundConfig.color : 'transparent',
                            pointerEvents: 'auto',
                        }}
                        onClick={handleCanvasClick}
                        onMouseDown={(e) => {
                            if (e.button !== 1) {
                                e.stopPropagation();
                            }
                        }}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onContextMenu={(e) => e.preventDefault()}
                    >
                        {/* Background Layer using shared renderer */}
                        <FrameEngine_BackgroundRenderer
                            config={backgroundConfig}
                            width={layout.width}
                            height={layout.height}
                            fit="none"
                            onRiveDiscovery={onRiveDiscovery}
                        />

                        {/* Grid overlay */}
                        {!previewMode && (
                            <div
                                data-skip-thumbnail="true"
                                style={{
                                    position: 'absolute',
                                    inset: '0',
                                    opacity: showGrid ? (snapToGrid ? 0.4 : 0.2) : 0,
                                    pointerEvents: 'none',
                                    backgroundImage: `
                                        linear-gradient(to right, ${gridColor} 1px, transparent 1px),
                                        linear-gradient(to bottom, ${gridColor} 1px, transparent 1px)
                                    `,
                                    backgroundSize: `${gridSize}px ${gridSize}px`,
                                    zIndex: 1,
                                    transition: 'opacity 0.2s ease'
                                }}
                            />
                        )}

                        {/* Render elements using shared renderer */}
                        <FrameEngine_ElementRenderer
                            elements={baseElements}
                            config={rendererConfig}
                            sensorData={sensorDataMap}
                            selectedElementIds={selectedElementIds}
                            onElementMouseDown={handleElementMouseDown}
                            onElementMouseEnter={handleElementMouseEnter}
                            onElementMouseLeave={handleElementMouseLeave}
                            onElementRiveDiscovery={onElementRiveDiscovery}
                        >
                            {/* Resize handles as children */}
                            {renderResizeHandles()}
                        </FrameEngine_ElementRenderer>

                        {/* Drop zone overlay */}
                        {!previewMode && dropZone.isActive && (
                            <div style={{
                                position: 'absolute',
                                inset: '0',
                                backgroundColor: `${theme.palette.primary.main}1A`,
                                border: `2px dashed ${theme.palette.primary.main}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                pointerEvents: 'none',
                                zIndex: 10
                            }}>
                                <div style={{
                                    color: theme.palette.primary.main,
                                    fontSize: '18px',
                                    fontWeight: 500
                                }}>
                                    Drop {dropZone.elementType} here
                                </div>
                            </div>
                        )}

                        {/* Empty state */}
                        {!previewMode && elements.length === 0 && !dropZone.isActive && backgroundConfig.type !== 'rive' && (
                            <div style={{
                                position: 'absolute',
                                inset: '0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: theme.palette.text.disabled,
                                zIndex: 1
                            }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '18px', fontWeight: 500 }}>Empty Canvas</div>
                                    <div style={{ fontSize: '14px' }}>Drag elements from the library to get started</div>
                                </div>
                            </div>
                        )}

                        {/* Rive Loading State */}
                        {!previewMode && backgroundConfig.type === 'rive' && backgroundConfig.riveFile && elements.length === 0 && !dropZone.isActive && (
                            <div style={{
                                position: 'absolute',
                                inset: '0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: theme.palette.text.disabled,
                                backgroundColor: 'rgba(255,255,255,0.8)',
                                zIndex: 5
                            }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '18px', fontWeight: 500 }}>Rive Background Active</div>
                                    <div style={{ fontSize: '14px' }}>Drag elements to overlay on Rive animation</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Enhanced Canvas info overlay */}
            <div style={{
                marginTop: '16px',
                textAlign: 'center',
                fontSize: '14px',
                color: theme.palette.text.secondary
            }}>
                Scale: {Math.round(viewport.scale * 100)}% |
                Canvas: {layout.width}×{layout.height} |
                Display: {Math.round(layout.width * viewport.scale)}×{Math.round(layout.height * viewport.scale)} |
                Offset: ({Math.round(viewport.translateX)}, {Math.round(viewport.translateY)})
                {!previewMode && showGrid && (
                    <span> | Grid: {gridSize}px{snapToGrid ? ' (snap)' : ''}</span>
                )}
                {backgroundConfig.type === 'rive' && backgroundConfig.riveFile && (
                    <span> | Rive: {backgroundConfig.riveFile}</span>
                )}
                {previewMode && (
                    <span style={{ color: theme.palette.warning.main, fontWeight: 500 }}> | PREVIEW MODE</span>
                )}
                <br />
                <span style={{ fontSize: '12px', color: theme.palette.text.disabled }}>
                    {previewMode ? (
                        'Wheel: Zoom | Shift+Wheel: Pan Horizontal | Middle Click+Drag: Pan'
                    ) : (
                        <>
                            Wheel: Zoom | Shift+Wheel: Pan Horizontal | Middle Click+Drag: Pan
                            {snapToGrid && ' | Elements snap to grid'}
                        </>
                    )}
                </span>
            </div>
        </div>
    );
};

export default ImprovedFrameEngine_Canvas;