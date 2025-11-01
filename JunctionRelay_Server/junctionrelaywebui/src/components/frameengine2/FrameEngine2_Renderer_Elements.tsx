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

import React, { useState, useRef, useMemo, useCallback, useEffect, lazy, Suspense } from 'react';
import type { PlacedElement, GridSettings } from './types/FrameEngine2_LayoutTypes';
import type {
    DiscoveredRiveStateMachine,
    DiscoveredRiveDataBinding
} from './types/FrameEngine2_ElementTypes';
import FrameEngine2_Element_Sensor from './elements/FrameEngine2_Element_Sensor';
import FrameEngine2_Element_Text from './elements/FrameEngine2_Element_Text';
import FrameEngine2_Element_TimeDate from './elements/FrameEngine2_Element_TimeDate';
import FrameEngine2_Element_MediaImage from './elements/FrameEngine2_Element_MediaImage';
import FrameEngine2_Element_MediaVideo from './elements/FrameEngine2_Element_MediaVideo';

// Lazy load heavy components to reduce initial bundle size
const FrameEngine2_Element_Gauge = lazy(() => import('./elements/FrameEngine2_Element_Gauge')); // Uses Recharts (~100KB)
const FrameEngine2_Element_MediaRive = lazy(() => import('./elements/FrameEngine2_Element_MediaRive')); // Uses Rive library (~150KB)
const FrameEngine2_Element_ECG = lazy(() => import('./elements/FrameEngine2_Element_ECG')); // Heavy waveform rendering

// Lazy load Moveable (120KB) - only needed when element is selected
const Moveable = lazy(() => import('react-moveable'));

// Inject CSS to ensure Moveable controls are clickable
// (Parent layer has pointer-events: none, so we need to override)
if (typeof document !== 'undefined' && !document.getElementById('moveable-pointer-events-fix')) {
    const style = document.createElement('style');
    style.id = 'moveable-pointer-events-fix';
    style.innerHTML = `
        .moveable-control-box,
        .moveable-control,
        .moveable-line,
        .moveable-direction {
            pointer-events: auto !important;
        }
    `;
    document.head.appendChild(style);
}

interface FrameEngine2_Renderer_ElementsProps {
    /** Element to render */
    element: PlacedElement;

    /** Whether this element is currently selected */
    isSelected?: boolean;

    /** Callback when element is clicked */
    onClick?: (elementId: string) => void;

    /** Callback when element is updated (e.g., dragged) */
    onUpdateElement?: (elementId: string, updates: Partial<PlacedElement>) => void;

    /** Resolved sensor values (Live > Test hierarchy already applied) */
    resolvedValues: Record<string, any>;

    /** Whether to show placeholders when no data */
    showPlaceholders?: boolean;

    /** Element padding in pixels */
    elementPadding?: number;

    /** Grid settings for snapping */
    grid?: GridSettings;

    /** Preview mode - disables selection and editing */
    previewMode?: boolean;

    /** Callback for Rive discovery (MediaRive elements only) */
    onRiveDiscovery?: (elementId: string, machines: DiscoveredRiveStateMachine[], bindings: DiscoveredRiveDataBinding[]) => void;
}

/**
 * Element Renderer - Dispatches to the correct element component
 * and handles positioning, selection, resize, and rotation
 */
const FrameEngine2_Renderer_Elements: React.FC<FrameEngine2_Renderer_ElementsProps> = ({
    element,
    isSelected = false,
    onClick,
    onUpdateElement,
    resolvedValues,
    showPlaceholders = true,
    elementPadding = 4,
    grid,
    previewMode = false,
    onRiveDiscovery
}) => {
    // Hover state for border highlighting
    const [isHovered, setIsHovered] = useState(false);

    // Ref for Moveable target element
    const targetRef = useRef<HTMLDivElement>(null);


    /**
     * Render the appropriate element component based on type
     * Memoized to prevent expensive element recreation (especially for Gauge)
     */
    const renderedElement = useMemo(() => {
        // Capture type for use in default case (discriminated union narrows to never)
        const elementType = element.type;

        switch (elementType) {
            case 'sensor':
                return (
                    <FrameEngine2_Element_Sensor
                        properties={element.properties}
                        resolvedValues={resolvedValues}
                        showPlaceholders={showPlaceholders}
                        elementPadding={elementPadding}
                        width={element.width}
                        height={element.height}
                    />
                );

            case 'text':
                return (
                    <FrameEngine2_Element_Text
                        properties={element.properties}
                        elementPadding={elementPadding}
                        width={element.width}
                        height={element.height}
                    />
                );

            case 'gauge':
                return (
                    <Suspense fallback={<div style={{ width: '100%', height: '100%', background: '#f5f5f5' }} />}>
                        <FrameEngine2_Element_Gauge
                            properties={element.properties}
                            resolvedValues={resolvedValues}
                            showPlaceholders={showPlaceholders}
                            elementPadding={elementPadding}
                            width={element.width}
                            height={element.height}
                        />
                    </Suspense>
                );

            case 'timedate':
                return (
                    <FrameEngine2_Element_TimeDate
                        properties={element.properties}
                        elementPadding={elementPadding}
                        width={element.width}
                        height={element.height}
                    />
                );

            case 'media-image':
                return (
                    <FrameEngine2_Element_MediaImage
                        properties={element.properties}
                        width={element.width}
                        height={element.height}
                    />
                );

            case 'media-video':
                return (
                    <FrameEngine2_Element_MediaVideo
                        properties={element.properties}
                        width={element.width}
                        height={element.height}
                    />
                );

            case 'media-rive':
                return (
                    <Suspense fallback={<div style={{ width: '100%', height: '100%', background: '#f5f5f5' }} />}>
                        <FrameEngine2_Element_MediaRive
                            elementId={element.id}
                            properties={element.properties}
                            width={element.width}
                            height={element.height}
                            onRiveDiscovery={onRiveDiscovery}
                        />
                    </Suspense>
                );

            case 'ecg':
                return (
                    <Suspense fallback={<div style={{ width: '100%', height: '100%', background: '#f5f5f5' }} />}>
                        <FrameEngine2_Element_ECG
                            properties={element.properties}
                            resolvedValues={resolvedValues}
                            showPlaceholders={showPlaceholders}
                            elementPadding={elementPadding}
                            width={element.width}
                            height={element.height}
                        />
                    </Suspense>
                );

            default:
                // TypeScript knows this is unreachable for valid types
                // but we keep it for runtime safety
                return (
                    <div
                        style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            color: '#999'
                        }}
                    >
                        Unknown: {elementType}
                    </div>
                );
        }
    }, [element.type, element.properties, element.width, element.height, element.id, resolvedValues, showPlaceholders, elementPadding, onRiveDiscovery]);

    /**
     * Handle click - select element
     * OPTIMIZATION: Wrapped in useCallback
     */
    const handleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onClick?.(element.id);
    }, [onClick, element.id]);

    /**
     * Handle mouse enter for hover state
     * OPTIMIZATION: State-based styling instead of direct DOM manipulation
     */
    const handleMouseEnter = useCallback(() => {
        if (!isSelected) {
            setIsHovered(true);
        }
    }, [isSelected]);

    /**
     * Handle mouse leave for hover state
     * OPTIMIZATION: State-based styling instead of direct DOM manipulation
     */
    const handleMouseLeave = useCallback(() => {
        setIsHovered(false);
    }, []);

    /**
     * Memoized element wrapper style
     * OPTIMIZATION: Prevents object recreation on every render
     */
    const elementWrapperStyle = useMemo(() => {
        // Determine border based on state
        // IMPORTANT: Always use 2px border to prevent content shift when selecting
        let border;
        if (isSelected) {
            border = '2px solid #2196f3';
        } else if (isHovered) {
            border = '2px solid rgba(33, 150, 243, 0.5)';
        } else if (grid?.showOutlines) {
            // Show outlines for all elements when showOutlines is enabled
            border = '2px solid rgba(128, 128, 128, 0.3)';
        } else {
            border = '2px solid transparent';
        }

        return {
            position: 'absolute' as const,
            transform: `translate(${element.x}px, ${element.y}px) rotate(${element.rotation}deg)`,
            width: `${element.width}px`,
            height: `${element.height}px`,
            cursor: previewMode ? 'default' : 'pointer',
            border,
            boxSizing: 'border-box' as const,
            transition: 'border-color 0.15s ease',
            pointerEvents: (element.locked || previewMode ? 'none' : 'auto') as 'none' | 'auto',
            zIndex: element.zIndex,
            userSelect: 'none' as const
        };
    }, [element.x, element.y, element.width, element.height, element.rotation, element.zIndex, element.locked, isSelected, isHovered, grid?.showOutlines, previewMode]);

    return (
        <>
            <div
                ref={targetRef}
                onClick={!isSelected ? handleClick : undefined}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                style={elementWrapperStyle}
            >
                {renderedElement}
            </div>

            {/* Moveable Controls - Only render when selected, not locked, and not in preview mode */}
            {isSelected && !element.locked && !previewMode && (
                <Suspense fallback={null}>
                    <Moveable
                    target={targetRef}
                    draggable={true}
                    resizable={true}
                    rotatable={true}
                    origin={false}

                    // Make handles easier to click
                    controlPadding={5}

                    // Prevent element from blocking handle clicks
                    dragArea={false}

                    // Snap to grid when enabled
                    snappable={grid?.snapToGrid}
                    snapGridWidth={grid?.gridSize}
                    snapGridHeight={grid?.gridSize}
                    isDisplayGridGuidelines={false}

                    // Resize handles: corners and edges
                    renderDirections={["nw", "n", "ne", "w", "e", "sw", "s", "se"]}

                    // Drag handlers
                    onDrag={({ transform }) => {
                        if (targetRef.current) {
                            targetRef.current.style.transform = transform;
                        }
                    }}
                    onDragEnd={({ lastEvent }) => {
                        if (lastEvent && onUpdateElement) {
                            const beforeTranslate = lastEvent.beforeTranslate;
                            onUpdateElement(element.id, {
                                x: beforeTranslate[0],
                                y: beforeTranslate[1]
                            });
                        }
                    }}

                    // Resize handlers
                    onResize={({ width, height, drag }) => {
                        if (targetRef.current) {
                            targetRef.current.style.width = `${width}px`;
                            targetRef.current.style.height = `${height}px`;
                            targetRef.current.style.transform = drag.transform;
                        }
                    }}
                    onResizeEnd={({ lastEvent }) => {
                        if (lastEvent && onUpdateElement) {
                            const beforeTranslate = lastEvent.drag.beforeTranslate;
                            onUpdateElement(element.id, {
                                width: lastEvent.width,
                                height: lastEvent.height,
                                x: beforeTranslate[0],
                                y: beforeTranslate[1]
                            });
                        }
                    }}

                    // Rotation handlers
                    onRotate={({ transform }) => {
                        if (targetRef.current) {
                            targetRef.current.style.transform = transform;
                        }
                    }}
                    onRotateEnd={({ lastEvent }) => {
                        if (lastEvent && onUpdateElement) {
                            onUpdateElement(element.id, {
                                rotation: lastEvent.rotate
                            });
                        }
                    }}

                    // Click handler for when element is clicked (keeps it selected)
                    onClick={() => {
                        onClick?.(element.id);
                    }}
                />
                </Suspense>
            )}
        </>
    );
};

export default React.memo(FrameEngine2_Renderer_Elements);

