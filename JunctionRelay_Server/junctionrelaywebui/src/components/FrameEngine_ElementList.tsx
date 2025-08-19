import React, { useState } from 'react';
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
} from '@mui/icons-material';

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

interface ElementListProps {
    elements: PlacedElement[];
    selectedElements: PlacedElement[];
    onElementSelect: (elementIds: string[], addToSelection?: boolean) => void;
    onElementDelete: (elementId: string) => void;
    onElementDuplicate?: (elementId: string) => void;
    onElementReorder?: (fromIndex: number, toIndex: number) => void;
    onElementVisibilityToggle: (elementId: string) => void;
}

export const FrameEngine_ElementList: React.FC<ElementListProps> = ({
    elements,
    selectedElements,
    onElementSelect,
    onElementDelete,
    onElementDuplicate,
    onElementReorder,
    onElementVisibilityToggle,
}) => {
    // Drag and drop state for reordering
    const [draggedElement, setDraggedElement] = useState<string | null>(null);
    const [dragOverElement, setDragOverElement] = useState<string | null>(null);

    // Get element icon
    const getElementIcon = (type: PlacedElement['type']) => {
        switch (type) {
            case 'sensor': return <SensorsIcon fontSize="small" />;
            case 'text': return <TextIcon fontSize="small" />;
            case 'chart': return <ChartIcon fontSize="small" />;
            case 'image': return <ImageIcon fontSize="small" />;
            case 'container': return <ContainerIcon fontSize="small" />;
            default: return <SensorsIcon fontSize="small" />;
        }
    };

    // Get element display name
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
            default:
                const elementType = element.type as string;
                return elementType.charAt(0).toUpperCase() + elementType.slice(1);
        }
    };

    // Handle element selection from list
    const handleElementSelect = (elementId: string, event: React.MouseEvent) => {
        const isCtrlClick = event.ctrlKey || event.metaKey;
        onElementSelect([elementId], isCtrlClick);
    };

    // Handle element duplication
    const handleElementDuplicate = (elementId: string) => {
        if (onElementDuplicate) {
            onElementDuplicate(elementId);
        }
    };

    // Handle drag start for reordering
    const handleDragStart = (event: React.DragEvent, elementId: string) => {
        setDraggedElement(elementId);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', elementId);
    };

    // Handle drag over for reordering
    const handleDragOver = (event: React.DragEvent, elementId: string) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDragOverElement(elementId);
    };

    // Handle drop for reordering
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {/* Elements List Header */}
            <div style={{ padding: '12px', backgroundColor: '#f8f9fa', borderBottom: '1px solid #e0e0e0' }}>
                <div style={{ fontSize: '12px', fontWeight: 500, color: '#333' }}>
                    Canvas Elements ({elements.length})
                </div>
                <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                    Click to select • Drag to reorder
                </div>
            </div>

            {/* Elements List */}
            <div style={{ flex: 1, overflow: 'auto' }}>
                {elements.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#999' }}>
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
                                    backgroundColor: isSelected ? '#e3f2fd' : isDragOver ? '#f0f8ff' : '#fff',
                                    borderBottom: '1px solid #f0f0f0',
                                    borderLeft: isSelected ? '3px solid #1976d2' : '3px solid transparent',
                                    opacity: isVisible ? 1 : 0.5,
                                    transition: 'all 0.2s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                                onMouseEnter={(e) => {
                                    if (!isSelected) {
                                        e.currentTarget.style.backgroundColor = '#f8f9fa';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!isSelected) {
                                        e.currentTarget.style.backgroundColor = '#fff';
                                    }
                                }}
                            >
                                {/* Drag Handle */}
                                <DragIcon style={{ color: '#999', fontSize: '16px', cursor: 'grab' }} />

                                {/* Element Icon */}
                                <div style={{ color: isSelected ? '#1976d2' : '#666' }}>
                                    {getElementIcon(element.type)}
                                </div>

                                {/* Element Info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontSize: '12px',
                                        fontWeight: isSelected ? 600 : 400,
                                        color: isSelected ? '#1976d2' : '#333',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }}>
                                        {element.type.charAt(0).toUpperCase() + element.type.slice(1)}: {getElementDisplayName(element)}
                                    </div>
                                    <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                                        ({Math.round(element.x)}, {Math.round(element.y)}) • {element.width}×{element.height}
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
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
                                            color: '#666'
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
                                            color: '#666'
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
                                            color: '#d32f2f'
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