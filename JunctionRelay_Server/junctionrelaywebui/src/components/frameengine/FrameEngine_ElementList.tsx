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

import React, { useState } from 'react';
import { useTheme } from '@mui/material/styles';
import {
    Sensors as SensorsIcon,
    TextFields as TextIcon,
    BarChart as ChartIcon,
    Image as ImageIcon,
    ViewModule as ContainerIcon,
    DragIndicator as DragIcon,
    Visibility as VisibilityIcon,
    VisibilityOff as VisibilityOffIcon,
    Delete as DeleteIcon,
    ContentCopy as DuplicateIcon,
    ShowChart as EcgIcon,
    Speed as GaugeIcon,
    Schedule as ClockIcon,
    Grain as OscilloscopeIcon,
    Explore as TunnelIcon,
    Cloud as WeatherIcon,
    VideoLibrary as VideoIcon,
    Animation as RiveIcon,
    Lock as LockIcon,
    LockOpen as LockOpenIcon,
} from '@mui/icons-material';
import type { PlacedElement, ElementType } from './FrameEngine_Types';

interface ElementListProps {
    elements: PlacedElement[];
    selectedElements: PlacedElement[];
    onElementSelect: (elementIds: string[], addToSelection?: boolean) => void;
    onElementDelete: (elementId: string) => void;
    onElementDuplicate?: (elementId: string) => void;
    onElementReorder?: (fromIndex: number, toIndex: number) => void;
    onElementVisibilityToggle: (elementId: string) => void;
    onElementLockToggle: (elementId: string) => void;
}

export const FrameEngine_ElementList: React.FC<ElementListProps> = ({
    elements,
    selectedElements,
    onElementSelect,
    onElementDelete,
    onElementDuplicate,
    onElementReorder,
    onElementVisibilityToggle,
    onElementLockToggle,
}) => {
    const theme = useTheme();
    const [draggedElement, setDraggedElement] = useState<string | null>(null);
    const [dragOverElement, setDragOverElement] = useState<string | null>(null);

    const getElementIcon = (type: ElementType) => {
        switch (type) {
            case 'sensor': return <SensorsIcon fontSize="small" />;
            case 'text': return <TextIcon fontSize="small" />;
            case 'chart': return <ChartIcon fontSize="small" />;
            case 'image': return <ImageIcon fontSize="small" />;
            case 'container': return <ContainerIcon fontSize="small" />;
            case 'ecg': return <EcgIcon fontSize="small" />;
            case 'gauge': return <GaugeIcon fontSize="small" />;
            case 'clock': return <ClockIcon fontSize="small" />;
            case 'oscilloscope': return <OscilloscopeIcon fontSize="small" />;
            case 'tunnel': return <TunnelIcon fontSize="small" />;
            case 'weather': return <WeatherIcon fontSize="small" />;
            case 'asset-image': return <ImageIcon fontSize="small" />;
            case 'asset-video': return <VideoIcon fontSize="small" />;
            case 'asset-rive': return <RiveIcon fontSize="small" />;
            default: return <SensorsIcon fontSize="small" />;
        }
    };

    const getElementDisplayName = (element: PlacedElement): string => {
        switch (element.type) {
            case 'sensor':
                return element.properties.placeholderSensorLabel || element.properties.sensorTag || 'Sensor';
            case 'text':
                const text = element.properties.text || 'Text';
                return text.length > 20 ? text.substring(0, 20) + '...' : text;
            case 'chart':
                return element.properties.title || 'Chart';
            case 'image':
                return element.properties.alt || 'Image';
            case 'container':
                return element.properties.title || 'Container';
            case 'ecg':
                return element.properties.sensorTag || 'ECG Waveform';
            case 'gauge':
                return element.properties.sensorTag || `Gauge (${element.properties.gaugeType || 'semicircle'})`;
            case 'clock':
                return element.properties.timezone ? `Clock (${element.properties.timezone})` : 'Clock';
            case 'oscilloscope':
                return element.properties.sensorTag || `Oscilloscope (${element.properties.mode || 'glow'})`;
            case 'tunnel':
                const mode = element.properties.renderMode === '3d' ? '3D' : '2D';
                return `Tunnel (${element.properties.tunnelType || 'circular'}, ${mode})`;
            case 'weather':
                return `Weather (${element.properties.weatherType || 'clear'})`;
            case 'asset-image':
                return element.properties.assetImageUrl
                    ? `Image: ${element.properties.assetImageUrl}`
                    : 'Image Asset';
            case 'asset-video':
                return element.properties.assetVideoUrl
                    ? `Video: ${element.properties.assetVideoUrl}`
                    : 'Video Asset';
            case 'asset-rive':
                return element.properties.assetRiveFile
                    ? `Rive: ${element.properties.assetRiveFile}`
                    : 'Rive Asset';
            default:
                const elementType = element.type as string;
                return elementType.charAt(0).toUpperCase() + elementType.slice(1);
        }
    };

    const handleElementSelect = (elementId: string, event: React.MouseEvent) => {
        const isCtrlClick = event.ctrlKey || event.metaKey;
        onElementSelect([elementId], isCtrlClick);
    };

    const handleElementDuplicate = (elementId: string) => {
        if (onElementDuplicate) {
            onElementDuplicate(elementId);
        }
    };

    const handleDragStart = (event: React.DragEvent, elementId: string) => {
        setDraggedElement(elementId);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', elementId);
    };

    const handleDragOver = (event: React.DragEvent, elementId: string) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDragOverElement(elementId);
    };

    const handleDrop = (event: React.DragEvent, targetElementId: string) => {
        event.preventDefault();

        if (draggedElement && draggedElement !== targetElementId) {
            const fromIndex = elements.findIndex(el => el.id === draggedElement);
            const toIndex = elements.findIndex(el => el.id === targetElementId);

            if (fromIndex !== -1 && toIndex !== -1 && onElementReorder) {
                onElementReorder(fromIndex, toIndex);
            }
        }

        setDraggedElement(null);
        setDragOverElement(null);
    };

    return (
        <div style={{
            height: '100%',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
        }}>
            {/* Fixed Header */}
            <div style={{
                padding: '12px',
                backgroundColor: theme.palette.mode === 'dark'
                    ? theme.palette.grey[800]
                    : theme.palette.grey[100],
                borderBottom: `1px solid ${theme.palette.divider}`,
                flexShrink: 0
            }}>
                <div style={{
                    fontSize: '12px',
                    fontWeight: 500,
                    color: theme.palette.text.primary
                }}>
                    Canvas Elements ({elements.length})
                </div>
                <div style={{
                    fontSize: '10px',
                    color: theme.palette.text.secondary,
                    marginTop: '2px'
                }}>
                    Click to select • Drag to reorder
                </div>
            </div>

            {/* Scrollable Content */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                minHeight: 0
            }}>
                {elements.length === 0 ? (
                    <div style={{
                        padding: '16px',
                        textAlign: 'center',
                        color: theme.palette.text.disabled
                    }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>📦</div>
                        <div style={{ fontSize: '12px' }}>No elements on canvas</div>
                        <div style={{ fontSize: '11px', marginTop: '4px' }}>
                            Drag elements from the library to get started
                        </div>
                    </div>
                ) : (
                    elements.map((element, index) => {
                        const isSelected = selectedElements.some(sel => sel.id === element.id);
                        const isDragOver = dragOverElement === element.id;
                        const isVisible = element.visible ?? true;
                        const isLocked = element.locked ?? false;

                        return (
                            <div
                                key={element.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, element.id)}
                                onDragOver={(e) => handleDragOver(e, element.id)}
                                onDrop={(e) => handleDrop(e, element.id)}
                                onDragLeave={() => setDragOverElement(null)}
                                onClick={(e) => handleElementSelect(element.id, e)}
                                style={{
                                    padding: '8px 12px',
                                    cursor: 'pointer',
                                    backgroundColor: isSelected
                                        ? (theme.palette.mode === 'dark'
                                            ? theme.palette.primary.dark
                                            : theme.palette.primary.light)
                                        : isDragOver
                                            ? theme.palette.action.hover
                                            : theme.palette.background.paper,
                                    borderBottom: `1px solid ${theme.palette.divider}`,
                                    borderLeft: isSelected
                                        ? `3px solid ${theme.palette.primary.main}`
                                        : '3px solid transparent',
                                    opacity: isVisible ? 1 : 0.5,
                                    transition: 'all 0.2s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                                onMouseEnter={(e) => {
                                    if (!isSelected) {
                                        e.currentTarget.style.backgroundColor = theme.palette.action.hover;
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!isSelected) {
                                        e.currentTarget.style.backgroundColor = theme.palette.background.paper;
                                    }
                                }}
                            >
                                <DragIcon style={{
                                    color: theme.palette.text.disabled,
                                    fontSize: '16px',
                                    cursor: 'grab'
                                }} />

                                <div style={{
                                    color: isSelected
                                        ? theme.palette.primary.main
                                        : theme.palette.text.secondary
                                }}>
                                    {getElementIcon(element.type)}
                                </div>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontSize: '12px',
                                        fontWeight: isSelected ? 600 : 400,
                                        color: isSelected
                                            ? theme.palette.primary.main
                                            : theme.palette.text.primary,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }}>
                                        {element.type.charAt(0).toUpperCase() + element.type.slice(1).replace(/-/g, ' ')}: {getElementDisplayName(element)}
                                    </div>
                                    <div style={{
                                        fontSize: '10px',
                                        color: theme.palette.text.secondary,
                                        marginTop: '2px'
                                    }}>
                                        ({Math.round(element.x)}, {Math.round(element.y)}) • {element.width}×{element.height}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onElementLockToggle(element.id);
                                        }}
                                        style={{
                                            border: 'none',
                                            background: 'none',
                                            cursor: 'pointer',
                                            padding: '2px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            color: isLocked
                                                ? theme.palette.warning.main
                                                : theme.palette.text.secondary
                                        }}
                                        title={isLocked ? 'Unlock element' : 'Lock element'}
                                    >
                                        {isLocked ?
                                            <LockIcon style={{ fontSize: '14px' }} /> :
                                            <LockOpenIcon style={{ fontSize: '14px' }} />
                                        }
                                    </button>

                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onElementVisibilityToggle(element.id);
                                        }}
                                        style={{
                                            border: 'none',
                                            background: 'none',
                                            cursor: 'pointer',
                                            padding: '2px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            color: theme.palette.text.secondary
                                        }}
                                        title={isVisible ? 'Hide element' : 'Show element'}
                                    >
                                        {isVisible ?
                                            <VisibilityIcon style={{ fontSize: '14px' }} /> :
                                            <VisibilityOffIcon style={{ fontSize: '14px' }} />
                                        }
                                    </button>

                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleElementDuplicate(element.id);
                                        }}
                                        style={{
                                            border: 'none',
                                            background: 'none',
                                            cursor: 'pointer',
                                            padding: '2px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            color: theme.palette.text.secondary
                                        }}
                                        title="Duplicate element"
                                    >
                                        <DuplicateIcon style={{ fontSize: '14px' }} />
                                    </button>

                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onElementDelete(element.id);
                                        }}
                                        style={{
                                            border: 'none',
                                            background: 'none',
                                            cursor: 'pointer',
                                            padding: '2px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            color: theme.palette.error.main
                                        }}
                                        title="Delete element"
                                    >
                                        <DeleteIcon style={{ fontSize: '14px' }} />
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};