import React, { useRef, useState, useCallback, useEffect } from 'react';

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

interface FrameLayoutConfig {
    width: number;
    height: number;
    backgroundColor?: string;
    backgroundImageUrl?: string | null;
    backgroundType?: string;
}

interface CanvasProps {
    layout: FrameLayoutConfig;
    elements: PlacedElement[];
    selectedElementIds: string[];
    onElementUpdate: (elementId: string, updates: Partial<PlacedElement>) => void;
    onElementSelect: (elementIds: string[], addToSelection?: boolean) => void;
    onElementAdd: (element: Omit<PlacedElement, 'id'>) => void;
    onCanvasClick: () => void;
}

interface DragState {
    isDragging: boolean;
    dragType: 'move' | 'resize';
    elementId: string | null;
    startPos: { x: number; y: number };
    startElementPos: { x: number; y: number; width: number; height: number };
    resizeHandle: string | null;
}

interface DropZoneData {
    isActive: boolean;
    elementType: string | null;
}

const FrameEngine_Canvas: React.FC<CanvasProps> = ({
    layout,
    elements,
    selectedElementIds,
    onElementUpdate,
    onElementSelect,
    onElementAdd,
    onCanvasClick,
}) => {
    const canvasRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [dragState, setDragState] = useState<DragState>({
        isDragging: false,
        dragType: 'move',
        elementId: null,
        startPos: { x: 0, y: 0 },
        startElementPos: { x: 0, y: 0, width: 0, height: 0 },
        resizeHandle: null,
    });
    const [dropZone, setDropZone] = useState<DropZoneData>({
        isActive: false,
        elementType: null,
    });

    // Calculate scale to fit canvas in viewport
    useEffect(() => {
        const calculateScale = () => {
            if (!canvasRef.current) return;

            const container = canvasRef.current.parentElement;
            if (!container) return;

            const containerRect = container.getBoundingClientRect();
            const maxWidth = containerRect.width - 40; // Account for padding
            const maxHeight = containerRect.height - 40;

            const scaleX = maxWidth / layout.width;
            const scaleY = maxHeight / layout.height;
            const newScale = Math.min(scaleX, scaleY, 1); // Don't scale up beyond 100%

            setScale(newScale);
        };

        calculateScale();
        window.addEventListener('resize', calculateScale);
        return () => window.removeEventListener('resize', calculateScale);
    }, [layout.width, layout.height]);

    // Convert screen coordinates to canvas coordinates
    const screenToCanvas = useCallback((screenX: number, screenY: number) => {
        if (!canvasRef.current) return { x: 0, y: 0 };

        const rect = canvasRef.current.getBoundingClientRect();
        return {
            x: (screenX - rect.left) / scale,
            y: (screenY - rect.top) / scale,
        };
    }, [scale]);

    // Handle mouse down on element (start drag or resize)
    const handleElementMouseDown = useCallback((
        event: React.MouseEvent,
        elementId: string,
        resizeHandle?: string
    ) => {
        event.stopPropagation();

        const element = elements.find(el => el.id === elementId);
        if (!element) return;

        // Select element if not already selected
        if (!selectedElementIds.includes(elementId)) {
            onElementSelect([elementId], event.ctrlKey || event.metaKey);
        }

        const canvasPos = screenToCanvas(event.clientX, event.clientY);

        setDragState({
            isDragging: true,
            dragType: resizeHandle ? 'resize' : 'move',
            elementId,
            startPos: canvasPos,
            startElementPos: {
                x: element.x,
                y: element.y,
                width: element.width,
                height: element.height,
            },
            resizeHandle: resizeHandle || null,
        });
    }, [elements, selectedElementIds, onElementSelect, screenToCanvas]);

    // Handle mouse move (during drag/resize)
    const handleMouseMove = useCallback((event: React.MouseEvent) => {
        if (!dragState.isDragging || !dragState.elementId) return;

        const canvasPos = screenToCanvas(event.clientX, event.clientY);
        const deltaX = canvasPos.x - dragState.startPos.x;
        const deltaY = canvasPos.y - dragState.startPos.y;

        if (dragState.dragType === 'move') {
            // Move element
            const newX = Math.max(0, Math.min(
                layout.width - dragState.startElementPos.width,
                dragState.startElementPos.x + deltaX
            ));
            const newY = Math.max(0, Math.min(
                layout.height - dragState.startElementPos.height,
                dragState.startElementPos.y + deltaY
            ));

            onElementUpdate(dragState.elementId, { x: newX, y: newY });
        } else if (dragState.dragType === 'resize' && dragState.resizeHandle) {
            // Resize element
            let newWidth = dragState.startElementPos.width;
            let newHeight = dragState.startElementPos.height;
            let newX = dragState.startElementPos.x;
            let newY = dragState.startElementPos.y;

            switch (dragState.resizeHandle) {
                case 'se': // Bottom-right
                    newWidth = Math.max(20, dragState.startElementPos.width + deltaX);
                    newHeight = Math.max(20, dragState.startElementPos.height + deltaY);
                    break;
                case 'sw': // Bottom-left
                    newWidth = Math.max(20, dragState.startElementPos.width - deltaX);
                    newHeight = Math.max(20, dragState.startElementPos.height + deltaY);
                    newX = dragState.startElementPos.x + (dragState.startElementPos.width - newWidth);
                    break;
                case 'ne': // Top-right
                    newWidth = Math.max(20, dragState.startElementPos.width + deltaX);
                    newHeight = Math.max(20, dragState.startElementPos.height - deltaY);
                    newY = dragState.startElementPos.y + (dragState.startElementPos.height - newHeight);
                    break;
                case 'nw': // Top-left
                    newWidth = Math.max(20, dragState.startElementPos.width - deltaX);
                    newHeight = Math.max(20, dragState.startElementPos.height - deltaY);
                    newX = dragState.startElementPos.x + (dragState.startElementPos.width - newWidth);
                    newY = dragState.startElementPos.y + (dragState.startElementPos.height - newHeight);
                    break;
            }

            // Ensure element stays within canvas bounds
            newX = Math.max(0, Math.min(layout.width - newWidth, newX));
            newY = Math.max(0, Math.min(layout.height - newHeight, newY));

            onElementUpdate(dragState.elementId, {
                x: newX,
                y: newY,
                width: newWidth,
                height: newHeight
            });
        }
    }, [dragState, screenToCanvas, layout, onElementUpdate]);

    // Handle mouse up (end drag/resize)
    const handleMouseUp = useCallback(() => {
        setDragState({
            isDragging: false,
            dragType: 'move',
            elementId: null,
            startPos: { x: 0, y: 0 },
            startElementPos: { x: 0, y: 0, width: 0, height: 0 },
            resizeHandle: null,
        });
    }, []);

    // Handle canvas click (clear selection)
    const handleCanvasClick = useCallback((event: React.MouseEvent) => {
        if (event.target === event.currentTarget) {
            onCanvasClick();
        }
    }, [onCanvasClick]);

    // Handle drag over for external drops
    const handleDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';

        const elementType = event.dataTransfer.getData('application/x-element-type');
        setDropZone({ isActive: true, elementType });
    }, []);

    // Handle drag leave
    const handleDragLeave = useCallback((event: React.DragEvent) => {
        if (!canvasRef.current?.contains(event.relatedTarget as Node)) {
            setDropZone({ isActive: false, elementType: null });
        }
    }, []);

    // Handle drop
    const handleDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();

        const elementType = event.dataTransfer.getData('application/x-element-type');
        const elementData = event.dataTransfer.getData('application/x-element-data');

        if (!elementType) return;

        const canvasPos = screenToCanvas(event.clientX, event.clientY);

        let newElement: Omit<PlacedElement, 'id'>;

        if (elementData) {
            // Predefined element data
            newElement = JSON.parse(elementData);
            newElement.x = canvasPos.x - newElement.width / 2;
            newElement.y = canvasPos.y - newElement.height / 2;
        } else {
            // Create default element based on type
            newElement = {
                type: elementType as PlacedElement['type'],
                x: canvasPos.x - 60,
                y: canvasPos.y - 30,
                width: 120,
                height: 60,
                properties: getDefaultElementProperties(elementType),
            };
        }

        // Ensure element is within bounds
        newElement.x = Math.max(0, Math.min(layout.width - newElement.width, newElement.x));
        newElement.y = Math.max(0, Math.min(layout.height - newElement.height, newElement.y));

        onElementAdd(newElement);
        setDropZone({ isActive: false, elementType: null });
    }, [screenToCanvas, layout, onElementAdd]);

    // Get default properties for element type
    const getDefaultElementProperties = (elementType: string): Record<string, any> => {
        switch (elementType) {
            case 'sensor':
                return { sensorName: 'New Sensor', unit: '', fontSize: 12 };
            case 'text':
                return { text: 'Text Label', fontSize: 14, color: '#000000' };
            case 'chart':
                return { chartType: 'line', title: 'Chart', showLegend: true };
            case 'image':
                return { imageUrl: '', alt: 'Image' };
            default:
                return {};
        }
    };

    // Render resize handles for selected elements
    const renderResizeHandles = (element: PlacedElement) => {
        if (!selectedElementIds.includes(element.id)) return null;

        const handles = ['nw', 'ne', 'sw', 'se'];

        return handles.map(handle => (
            <div
                key={handle}
                style={{
                    position: 'absolute',
                    width: '12px',
                    height: '12px',
                    backgroundColor: '#1976d2',
                    border: '1px solid white',
                    cursor: `${handle}-resize`,
                    zIndex: 10,
                    left: handle.includes('w') ? -6 : element.width * scale - 6,
                    top: handle.includes('n') ? -6 : element.height * scale - 6,
                }}
                onMouseDown={(e) => handleElementMouseDown(e, element.id, handle)}
            />
        ));
    };

    // Get background style
    const getBackgroundStyle = () => {
        if (layout.backgroundType === 'image' && layout.backgroundImageUrl) {
            return {
                backgroundImage: `url(${layout.backgroundImageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
            };
        }
        return {
            backgroundColor: layout.backgroundColor || '#FFFFFF',
        };
    };

    return (
        <div style={{
            flex: 1,
            padding: '16px',
            overflowX: 'auto',
            overflowY: 'auto',
            backgroundColor: '#f5f5f5',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                height: '100%'
            }}>
                <div
                    ref={canvasRef}
                    style={{
                        position: 'relative',
                        border: dropZone.isActive ? '2px dashed #1976d2' : '2px solid #bbb',
                        boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                        userSelect: 'none',
                        width: layout.width * scale,
                        height: layout.height * scale,
                        ...getBackgroundStyle(),
                    }}
                    onClick={handleCanvasClick}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    {/* Grid overlay for positioning help */}
                    <div
                        style={{
                            position: 'absolute',
                            inset: '0',
                            opacity: 0.1,
                            pointerEvents: 'none',
                            backgroundImage: `
                                linear-gradient(to right, #000 1px, transparent 1px),
                                linear-gradient(to bottom, #000 1px, transparent 1px)
                            `,
                            backgroundSize: `${20 * scale}px ${20 * scale}px`,
                        }}
                    />

                    {/* Render elements */}
                    {elements.map((element) => (
                        <div
                            key={element.id}
                            style={{
                                position: 'absolute',
                                left: element.x * scale,
                                top: element.y * scale,
                                width: element.width * scale,
                                height: element.height * scale,
                                border: selectedElementIds.includes(element.id)
                                    ? '2px solid #1976d2'
                                    : '1px solid #ccc',
                                backgroundColor: element.type === 'sensor' ? '#e3f2fd' : '#ffffff',
                                cursor: 'move',
                                transition: 'all 75ms',
                                boxShadow: selectedElementIds.includes(element.id)
                                    ? '0 4px 8px rgba(0,0,0,0.2)'
                                    : 'none',
                            }}
                            onMouseDown={(e) => handleElementMouseDown(e, element.id)}
                            onMouseEnter={(e) => {
                                if (!selectedElementIds.includes(element.id)) {
                                    e.currentTarget.style.borderColor = '#999';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!selectedElementIds.includes(element.id)) {
                                    e.currentTarget.style.borderColor = '#ccc';
                                }
                            }}
                        >
                            {/* Element content */}
                            <div style={{
                                padding: '8px',
                                height: '100%',
                                overflow: 'hidden',
                                fontSize: Math.max(10, 12 * scale),
                                lineHeight: 1.2
                            }}>
                                <div style={{
                                    fontWeight: 500,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                }}>
                                    {element.properties.sensorName || element.properties.text || element.type}
                                </div>
                                <div style={{
                                    color: '#666',
                                    fontSize: Math.max(8, 10 * scale),
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                }}>
                                    {element.type === 'sensor' && element.properties.unit && `Unit: ${element.properties.unit}`}
                                    {element.type === 'text' && `Font: ${element.properties.fontSize || 14}px`}
                                    {element.type === 'chart' && element.properties.chartType}
                                </div>
                            </div>

                            {/* Resize handles */}
                            {renderResizeHandles(element)}
                        </div>
                    ))}

                    {/* Drop zone overlay */}
                    {dropZone.isActive && (
                        <div style={{
                            position: 'absolute',
                            inset: '0',
                            backgroundColor: 'rgba(25, 118, 210, 0.1)',
                            border: '2px dashed #1976d2',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            pointerEvents: 'none'
                        }}>
                            <div style={{
                                color: '#1976d2',
                                fontSize: '18px',
                                fontWeight: 500
                            }}>
                                Drop {dropZone.elementType} here
                            </div>
                        </div>
                    )}

                    {/* Empty state */}
                    {elements.length === 0 && !dropZone.isActive && (
                        <div style={{
                            position: 'absolute',
                            inset: '0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#999'
                        }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '18px', fontWeight: 500 }}>Empty Canvas</div>
                                <div style={{ fontSize: '14px' }}>Drag elements from the library to get started</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Canvas info overlay */}
            <div style={{
                marginTop: '16px',
                textAlign: 'center',
                fontSize: '14px',
                color: '#666'
            }}>
                Scale: {Math.round(scale * 100)}% |
                Canvas: {layout.width}×{layout.height} |
                Display: {Math.round(layout.width * scale)}×{Math.round(layout.height * scale)}
            </div>
        </div>
    );
};

export default FrameEngine_Canvas;