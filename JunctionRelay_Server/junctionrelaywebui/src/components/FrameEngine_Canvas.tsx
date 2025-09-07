import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
    useRive,
    Layout,
    Fit,
    Alignment,
} from '@rive-app/react-canvas';

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

// Google Fonts loader utility
const loadGoogleFont = (fontFamily: string) => {
    // Skip if it's a system font or already loaded
    if (!fontFamily || fontFamily.includes('system') || fontFamily.includes('sans-serif') ||
        document.querySelector(`link[href*="${fontFamily.replace(/\s+/g, '+')}"]`)) {
        return;
    }

    const link = document.createElement('link');
    link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/\s+/g, '+')}:wght@100;200;300;400;500;600;700;800;900&display=swap`;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
};

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
    riveFile?: string | null;
    riveStateMachine?: string | null;
    riveInputs?: Record<string, any> | null;
}

interface AvailableSensor {
    id: string;
    name: string;
    value: string;
    unit: string;
    type: 'environmental' | 'system' | 'custom';
    isOnline: boolean;
}

interface CanvasProps {
    layout: FrameLayoutConfig;
    elements: PlacedElement[];
    selectedElementIds: string[];
    availableSensors?: AvailableSensor[];
    onElementUpdate: (elementId: string, updates: Partial<PlacedElement>) => void;
    onElementSelect: (elementIds: string[], addToSelection?: boolean) => void;
    onElementAdd: (element: Omit<PlacedElement, 'id'>) => void;
    onCanvasClick: () => void;
    onStartElementOperation?: (action: string) => void;
    onRiveDiscovery?: (machines: DiscoveredStateMachine[]) => void;
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

// Dynamic Rive Background Component
const RiveBackground: React.FC<{
    riveFile: string;
    stateMachine?: string;
    inputs?: Record<string, any>;
    width: number;
    height: number;
    onRiveDiscovery?: (machines: DiscoveredStateMachine[]) => void; // Add this prop
}> = ({ riveFile, stateMachine, inputs, width, height, onRiveDiscovery }) => {
    const riveFileUrl = `/api/frameengine/rive-files/${riveFile}/content`;
    const [discoveredInputs, setDiscoveredInputs] = useState<Record<string, any>>({});

    const { rive, RiveComponent } = useRive({
        src: riveFileUrl,
        autoplay: true,
        layout: new Layout({
            fit: Fit.Cover,
            alignment: Alignment.Center
        }),
        onLoad: () => {
            console.log('✅ Rive background loaded:', riveFile);
        },
        onLoadError: (error: any) => {
            console.error('❌ Rive background load error:', error, { riveFile });
        },
    });

    // Discovery logic
    useEffect(() => {
        if (!rive) return;

        let attempts = 0;
        let stopped = false;
        const maxAttempts = 20;

        const discoverMachinesAndInputs = () => {
            if (stopped || !rive) return;
            attempts++;

            try {
                // Get state machine names
                const smNames: string[] = Array.isArray(rive.stateMachineNames) ? rive.stateMachineNames : [];

                // Ensure machines are running so inputs wire up
                smNames.forEach((sm) => {
                    try { rive.play(sm); } catch { }
                });

                const machines: DiscoveredStateMachine[] = smNames.map((smName) => {
                    const inputs: DiscoveredInput[] = [];

                    try {
                        const rawInputs = rive.stateMachineInputs ? (rive.stateMachineInputs(smName) as any[]) : [];

                        rawInputs.forEach((rawInput) => {
                            if (rawInput?.name) {
                                const inputName = String(rawInput.name);
                                let inputType: DiscoveredInput['type'] = 'unknown';
                                let currentValue: any = null;
                                let hasValue = false;

                                // Probe input type following POC pattern
                                try {
                                    currentValue = rawInput.value;
                                    hasValue = true;

                                    if (typeof currentValue === 'number') {
                                        inputType = 'number';
                                    } else if (typeof currentValue === 'boolean') {
                                        inputType = 'boolean';
                                    }
                                } catch {
                                    // If no readable value, check for trigger
                                    try {
                                        if (typeof rawInput.fire === 'function') {
                                            inputType = 'trigger';
                                        }
                                    } catch { }
                                }

                                inputs.push({
                                    name: inputName,
                                    type: inputType,
                                    currentValue: hasValue ? currentValue : null,
                                    ref: rawInput
                                });
                            }
                        });
                    } catch (error) {
                        console.warn(`Failed to get inputs for state machine "${smName}":`, error);
                    }

                    return {
                        name: smName,
                        inputNames: inputs.map(i => i.name),
                        inputs
                    };
                });

                console.log('🔍 RiveBackground discovered state machines:', machines);

                // **KEY FIX**: Call the discovery callback
                if (onRiveDiscovery && machines.length > 0) {
                    onRiveDiscovery(machines);
                }

                // Continue polling if we haven't found everything
                const totalInputs = machines.reduce((sum, m) => sum + m.inputs.length, 0);
                if (totalInputs === 0 && attempts < maxAttempts) {
                    setTimeout(discoverMachinesAndInputs, 120 * attempts);
                }

            } catch (error) {
                console.error('Error during state machine discovery:', error);
                if (attempts < maxAttempts) {
                    setTimeout(discoverMachinesAndInputs, 120 * attempts);
                }
            }
        };

        discoverMachinesAndInputs();

        return () => {
            stopped = true;
        };
    }, [rive, onRiveDiscovery]); // Add onRiveDiscovery to dependencies

    // Bind input logic (UPDATED to handle state machine prefixed keys)
    useEffect(() => {
        if (!rive || !inputs) return;

        let attempts = 0;
        let stopped = false;
        const maxAttempts = 20;
        const inputRefs: Record<string, any> = {};

        const discoverAndBindInputs = () => {
            if (stopped || !rive) return;
            attempts++;

            try {
                // Get available state machines
                const smNames: string[] = Array.isArray(rive.stateMachineNames) ? rive.stateMachineNames : [];

                // Ensure machines are running so inputs wire up
                smNames.forEach((sm) => {
                    try { rive.play(sm); } catch { }
                });

                const newDiscoveredInputs: Record<string, any> = {};

                // Process each input we want to bind
                Object.entries(inputs).forEach(([inputKey, inputValue]) => {
                    // Parse the input key to extract state machine and input name
                    let targetMachine: string;
                    let inputName: string;

                    if (inputKey.includes('.')) {
                        // New format: "StateMachineName.InputName"
                        const parts = inputKey.split('.');
                        targetMachine = parts[0];
                        inputName = parts.slice(1).join('.'); // Handle input names with dots
                    } else {
                        // Legacy format: just "InputName" - use specified state machine or first available
                        targetMachine = stateMachine || smNames[0];
                        inputName = inputKey;
                    }

                    if (!targetMachine) {
                        console.warn(`⚠️ No target state machine found for input "${inputKey}"`);
                        return;
                    }

                    // Check if this state machine exists
                    if (!smNames.includes(targetMachine)) {
                        console.warn(`⚠️ State machine "${targetMachine}" not found. Available: ${smNames.join(', ')}`);
                        return;
                    }

                    console.log(`🔍 Looking for input "${inputName}" in state machine "${targetMachine}"`);

                    const machineInputs = rive.stateMachineInputs
                        ? (rive.stateMachineInputs(targetMachine) as any[])
                        : [];

                    const foundInput = machineInputs.find((i) => i?.name === inputName);

                    if (foundInput) {
                        inputRefs[inputKey] = foundInput; // Use original key for tracking

                        // Determine input type by probing
                        let inputType = 'unknown';
                        let hasValue = false;
                        let currentValue: any;

                        try {
                            currentValue = foundInput.value;
                            hasValue = true;

                            if (typeof currentValue === 'number') {
                                inputType = 'number';
                            } else if (typeof currentValue === 'boolean') {
                                inputType = 'boolean';
                            }
                        } catch {
                            // If no readable value, check for trigger
                            try {
                                if (typeof foundInput.fire === 'function') {
                                    inputType = 'trigger';
                                }
                            } catch { }
                        }

                        newDiscoveredInputs[inputKey] = {
                            ref: foundInput,
                            type: inputType,
                            currentValue: hasValue ? currentValue : null,
                            stateMachine: targetMachine,
                            inputName: inputName
                        };

                        // Apply the input value
                        try {
                            if (inputType === 'trigger') {
                                // For triggers, fire if the value is truthy or has changed
                                if (inputValue && typeof foundInput.fire === 'function') {
                                    foundInput.fire();
                                    console.log(`🔥 Fired trigger "${inputName}" in "${targetMachine}"`);
                                }
                            } else if (hasValue) {
                                // For number/boolean inputs
                                const newValue = inputType === 'boolean' ? Boolean(inputValue) : Number(inputValue) || 0;
                                foundInput.value = newValue;
                                console.log(`✅ Set "${inputName}" in "${targetMachine}" (${inputType}) to:`, newValue);
                            }
                        } catch (error) {
                            console.error(`❌ Error applying input "${inputName}" in "${targetMachine}":`, error);
                        }
                    } else {
                        console.warn(`⚠️ Input "${inputName}" not found in state machine "${targetMachine}"`);
                        console.log(`Available inputs in "${targetMachine}":`, machineInputs.map(i => i?.name).filter(Boolean));
                    }
                });

                setDiscoveredInputs(newDiscoveredInputs);

                // If we didn't find all inputs and haven't exhausted attempts, keep trying
                const foundCount = Object.keys(newDiscoveredInputs).length;
                const expectedCount = Object.keys(inputs).length;

                if (foundCount < expectedCount && attempts < maxAttempts) {
                    setTimeout(discoverAndBindInputs, 120 * attempts);
                }

            } catch (error) {
                console.error('Error during input discovery:', error);
                if (attempts < maxAttempts) {
                    setTimeout(discoverAndBindInputs, 120 * attempts);
                }
            }
        };

        discoverAndBindInputs();

        return () => {
            stopped = true;
            setDiscoveredInputs({});
        };
    }, [rive, stateMachine, inputs]);

    // Apply input changes when inputs prop changes (UPDATED)
    useEffect(() => {
        if (!inputs || Object.keys(discoveredInputs).length === 0) return;

        Object.entries(inputs).forEach(([inputKey, inputValue]) => {
            const discovered = discoveredInputs[inputKey];
            if (!discovered || !discovered.ref) return;

            try {
                if (discovered.type === 'trigger') {
                    // For triggers, fire if the value is truthy and different from last time
                    if (inputValue && typeof discovered.ref.fire === 'function') {
                        discovered.ref.fire();
                        console.log(`🔥 Fired trigger "${discovered.inputName}" in "${discovered.stateMachine}" via update`);
                    }
                } else {
                    // For number/boolean inputs
                    const newValue = discovered.type === 'boolean' ? Boolean(inputValue) : Number(inputValue) || 0;
                    if (discovered.ref.value !== newValue) {
                        discovered.ref.value = newValue;
                        console.log(`🔄 Updated "${discovered.inputName}" in "${discovered.stateMachine}" to:`, newValue);
                    }
                }
            } catch (error) {
                console.error(`❌ Error updating input "${discovered.inputName}" in "${discovered.stateMachine}":`, error);
            }
        });
    }, [inputs, discoveredInputs]);

    return (
        <div
            style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 0,
            }}
        >
            <RiveComponent
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'block'
                }}
            />
        </div>
    );
};

const FrameEngine_Canvas: React.FC<CanvasProps> = ({
    layout,
    elements,
    selectedElementIds,
    availableSensors = [],
    onElementUpdate,
    onElementSelect,
    onElementAdd,
    onCanvasClick,
    onStartElementOperation,
    onRiveDiscovery,
}) => {
    const canvasRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [viewportOffset, setViewportOffset] = useState({ x: 0, y: 0 });
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

    // Load Google Fonts when elements change
    useEffect(() => {
        const fontsToLoad = new Set<string>();

        elements.forEach(element => {
            const fontFamily = element.properties.fontFamily;
            if (fontFamily && fontFamily !== 'Inter' && !fontFamily.includes('system')) {
                fontsToLoad.add(fontFamily);
            }
        });

        fontsToLoad.forEach(loadGoogleFont);
    }, [elements]);

    // Reset viewport to fit and center
    const resetView = useCallback(() => {
        console.log('[RESET VIEW] Starting resetView');
        if (!canvasRef.current) {
            console.log('[RESET VIEW] No canvas ref, returning');
            return;
        }

        const viewportContainer = canvasRef.current.parentElement;
        if (!viewportContainer) {
            console.log('[RESET VIEW] No viewport container, returning');
            return;
        }

        const containerWidth = viewportContainer.clientWidth;
        const containerHeight = viewportContainer.clientHeight;

        console.log('[RESET VIEW] Container size:', containerWidth, 'x', containerHeight);
        console.log('[RESET VIEW] Canvas size:', layout.width, 'x', layout.height);

        const scaleX = containerWidth / layout.width;
        const scaleY = containerHeight / layout.height;
        const newScale = Math.min(scaleX, scaleY, 1);

        console.log('[RESET VIEW] Scale:', newScale);

        const scaledWidth = layout.width * newScale;
        const scaledHeight = layout.height * newScale;
        const offsetX = (containerWidth - scaledWidth) / 2;
        const offsetY = (containerHeight - scaledHeight) / 2;

        console.log('[RESET VIEW] Scaled size:', scaledWidth, 'x', scaledHeight);
        console.log('[RESET VIEW] Offset:', offsetX, ',', offsetY);

        setScale(newScale);
        setViewportOffset({ x: offsetX, y: offsetY });
        console.log('[RESET VIEW] Complete');
    }, [layout.width, layout.height]);

    // Calculate initial scale to fit canvas in viewport (only on mount/layout change)
    useEffect(() => {
        console.log('[CANVAS EFFECT] Layout dimensions changed, calling resetView');
        resetView();
    }, [layout.width, layout.height]);

    // Convert screen coordinates to canvas coordinates
    const screenToCanvas = useCallback((screenX: number, screenY: number) => {
        if (!canvasRef.current) return { x: 0, y: 0 };

        const canvasRect = canvasRef.current.getBoundingClientRect();

        return {
            x: (screenX - canvasRect.left) / scale,
            y: (screenY - canvasRect.top) / scale,
        };
    }, [scale]);

    // Handle mouse wheel for zooming and panning
    const handleWheel = useCallback((event: React.WheelEvent) => {
        event.preventDefault();

        const viewportContainer = canvasRef.current?.parentElement;
        if (!viewportContainer) return;

        const rect = viewportContainer.getBoundingClientRect();

        if (event.ctrlKey || event.metaKey) {
            // Zoom with Ctrl+wheel
            const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
            const newScale = Math.max(0.1, Math.min(3, scale * zoomFactor));

            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;

            const scaleChange = newScale / scale;
            const newOffsetX = mouseX - (mouseX - viewportOffset.x) * scaleChange;
            const newOffsetY = mouseY - (mouseY - viewportOffset.y) * scaleChange;

            setScale(newScale);
            setViewportOffset({ x: newOffsetX, y: newOffsetY });
        } else if (event.shiftKey) {
            // Horizontal pan with Shift+wheel
            const panSpeed = 50;
            setViewportOffset(prev => ({
                x: prev.x - event.deltaY * panSpeed / 100,
                y: prev.y
            }));
        } else {
            // Default: Zoom with plain wheel
            const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
            const newScale = Math.max(0.1, Math.min(3, scale * zoomFactor));

            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;

            const scaleChange = newScale / scale;
            const newOffsetX = mouseX - (mouseX - viewportOffset.x) * scaleChange;
            const newOffsetY = mouseY - (mouseY - viewportOffset.y) * scaleChange;

            setScale(newScale);
            setViewportOffset({ x: newOffsetX, y: newOffsetY });
        }
    }, [scale, viewportOffset]);

    // Handle mouse down for panning with middle button
    const handleMouseDown = useCallback((event: React.MouseEvent) => {
        if (event.button === 1) { // Middle mouse button
            event.preventDefault();
            setIsPanning(true);
            setPanStart({ x: event.clientX - viewportOffset.x, y: event.clientY - viewportOffset.y });
        }
    }, [viewportOffset]);

    // Handle mouse move for panning
    const handleMouseMoveForPanning = useCallback((event: React.MouseEvent) => {
        if (isPanning) {
            event.preventDefault();
            setViewportOffset({
                x: event.clientX - panStart.x,
                y: event.clientY - panStart.y
            });
        }
    }, [isPanning, panStart]);

    // Handle mouse up for panning
    const handleMouseUpForPanning = useCallback(() => {
        setIsPanning(false);
    }, []);

    // Add global mouse event listeners for panning and element dragging
    useEffect(() => {
        console.log('[CANVAS GLOBAL EFFECT] Setting up global mouse listeners');

        const handleGlobalMouseMove = (event: MouseEvent) => {
            if (isPanning) {
                setViewportOffset({
                    x: event.clientX - panStart.x,
                    y: event.clientY - panStart.y
                });
            }

            if (dragState.isDragging && dragState.elementId) {
                const canvasPos = screenToCanvas(event.clientX, event.clientY);
                const deltaX = canvasPos.x - dragState.startPos.x;
                const deltaY = canvasPos.y - dragState.startPos.y;

                if (dragState.dragType === 'move') {
                    const newX = dragState.startElementPos.x + deltaX;
                    const newY = dragState.startElementPos.y + deltaY;

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

        if (isPanning || dragState.isDragging) {
            console.log('[CANVAS GLOBAL EFFECT] Adding event listeners');
            document.addEventListener('mousemove', handleGlobalMouseMove);
            document.addEventListener('mouseup', handleGlobalMouseUp);
        }

        return () => {
            console.log('[CANVAS GLOBAL EFFECT] Cleanup - removing event listeners');
            document.removeEventListener('mousemove', handleGlobalMouseMove);
            document.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [isPanning, dragState.isDragging]);

    // Get sensor data for an element
    const getSensorData = useCallback((element: PlacedElement) => {
        if (element.type !== 'sensor' || !element.properties.sensorId) {
            return null;
        }
        return availableSensors.find(s => s.id === element.properties.sensorId);
    }, [availableSensors]);

    // Get element styles based on properties
    const getElementStyles = useCallback((element: PlacedElement, isSelected: boolean) => {
        const props = element.properties;
        const styles: React.CSSProperties = {
            position: 'absolute',
            left: element.x * scale,
            top: element.y * scale,
            width: element.width * scale,
            height: element.height * scale,
            border: '1px solid #ccc',
            outline: isSelected ? '2px solid #1976d2' : 'none',
            cursor: 'move',
            boxShadow: isSelected ? '0 0 0 2px rgba(25, 118, 210, 0.3)' : 'none',
            zIndex: 2,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
        };

        if (props.backgroundColor) {
            styles.backgroundColor = props.backgroundColor;
        } else {
            styles.backgroundColor = 'transparent';
        }

        return styles;
    }, [scale]);

    // Get text styles for content
    const getTextStyles = useCallback((element: PlacedElement): React.CSSProperties => {
        const props = element.properties;
        const baseSize = Math.max(8, (props.fontSize || 12) * scale);
        const fontFamily = props.fontFamily || 'Inter, system-ui, -apple-system, sans-serif';

        if (fontFamily && fontFamily !== 'Inter' && !fontFamily.includes('system')) {
            loadGoogleFont(fontFamily);
        }

        const styles: React.CSSProperties = {
            fontSize: baseSize,
            fontFamily: `"${fontFamily}", system-ui, -apple-system, sans-serif`,
            fontWeight: props.fontWeight || 'normal',
            color: props.color || props.textColor || '#000000',
            textAlign: (props.textAlign || 'center') as any,
            lineHeight: props.lineHeight || '1.4',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: `${4 * scale}px`,
            boxSizing: 'border-box',
            wordWrap: 'break-word',
            overflow: 'hidden',
        };

        if (props.textShadow) {
            styles.textShadow = '1px 1px 2px rgba(0,0,0,0.3)';
        }

        if (props.textBorder) {
            styles.WebkitTextStroke = '1px rgba(0,0,0,0.5)';
        }

        return styles;
    }, [scale]);

    // Render element content based on type
    const renderElementContent = useCallback((element: PlacedElement) => {
        switch (element.type) {
            case 'sensor': {
                const sensorData = getSensorData(element);

                const showLabel: boolean = element.properties.showLabel === true;
                const showUnit: boolean = element.properties.showUnit !== false;

                const labelText: string = showLabel ? (element.properties.placeholderSensorLabel || '') : '';

                const valueText: string =
                    (sensorData?.value ?? '').toString().trim() ||
                    (element.properties.placeholderValue ?? '').toString().trim() ||
                    '--';

                const unitText: string = showUnit
                    ? (
                        (sensorData?.unit ?? '').toString().trim() ||
                        (element.properties.placeholderUnit ?? '').toString().trim()
                    )
                    : '';

                const baseTextStyles = getTextStyles(element);
                const singleLineStyles: React.CSSProperties = {
                    ...baseTextStyles,
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent:
                        (element.properties.textAlign || 'center') === 'left' ? 'flex-start' :
                            (element.properties.textAlign || 'center') === 'right' ? 'flex-end' :
                                'center',
                    gap: `${6 * scale}px`,
                    whiteSpace: 'nowrap',
                    overflow: 'visible',
                    lineHeight: 1,
                    paddingTop: `${4 * scale}px`,
                    paddingBottom: `${4 * scale}px`,
                };

                const baseSize = Math.max(8, (element.properties.fontSize || 12) * scale);
                const fontFamily = element.properties.fontFamily || 'Inter, system-ui, -apple-system, sans-serif';
                const fontWeight = element.properties.fontWeight || 'normal';
                const textColor = element.properties.textColor || '#000000';

                const commonTextStyle = {
                    fontFamily: `"${fontFamily}", system-ui, -apple-system, sans-serif`,
                    fontWeight: fontWeight,
                    fontSize: `${baseSize}px`,
                    color: textColor,
                    whiteSpace: 'nowrap' as const,
                    overflow: 'visible' as const,
                };

                return (
                    <div style={singleLineStyles}>
                        {labelText && (
                            <span
                                style={commonTextStyle}
                                title={labelText}
                            >
                                {labelText}
                            </span>
                        )}

                        <span
                            style={commonTextStyle}
                            title={valueText}
                        >
                            {valueText}
                        </span>

                        {unitText && (
                            <span
                                style={commonTextStyle}
                                title={unitText}
                            >
                                {unitText}
                            </span>
                        )}
                    </div>
                );
            }

            case 'text':
                const textContent = element.properties.text || 'Text Element';
                return (
                    <div style={getTextStyles(element)}>
                        {textContent}
                    </div>
                );

            case 'chart':
                return (
                    <div style={getTextStyles(element)}>
                        <div style={{
                            fontWeight: '600',
                            marginBottom: `${4 * scale}px`
                        }}>
                            📊 {element.properties.title || 'Chart'}
                        </div>
                        <div style={{
                            fontSize: `${Math.max(8, 10 * scale)}px`,
                            color: '#666'
                        }}>
                            {element.properties.chartType || 'line'} chart
                        </div>
                    </div>
                );

            case 'image':
                const imageUrl = element.properties.imageUrl;
                const altText = element.properties.alt || 'Image';

                if (imageUrl) {
                    return (
                        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                            <img
                                src={imageUrl}
                                alt={altText}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    display: 'block'
                                }}
                                onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    const parent = target.parentElement;
                                    if (parent) {
                                        parent.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #999; font-size: ${Math.max(8, 10 * scale)}px;">🖼️ ${altText}</div>`;
                                    }
                                }}
                            />
                        </div>
                    );
                } else {
                    return (
                        <div style={{
                            ...getTextStyles(element),
                            color: '#999',
                            fontSize: `${Math.max(8, 10 * scale)}px`
                        }}>
                            🖼️ {altText}
                        </div>
                    );
                }

            case 'container':
                return (
                    <div style={{
                        ...getTextStyles(element),
                        border: '2px dashed #ccc',
                        color: '#999',
                        fontSize: `${Math.max(8, 10 * scale)}px`
                    }}>
                        📦 Container
                    </div>
                );

            default:
                return (
                    <div style={getTextStyles(element)}>
                        {element.type}
                    </div>
                );
        }
    }, [getSensorData, getTextStyles, scale]);

    // Handle mouse down on element (start drag or resize)
    const handleElementMouseDown = useCallback((
        event: React.MouseEvent,
        elementId: string,
        resizeHandle?: string
    ) => {
        event.stopPropagation();

        const element = elements.find(el => el.id === elementId);
        if (!element) return;

        if (!selectedElementIds.includes(elementId)) {
            onElementSelect([elementId], event.ctrlKey || event.metaKey);
        }

        const canvasPos = screenToCanvas(event.clientX, event.clientY);

        const action = resizeHandle ? `Resize element ${elementId}` : `Move element ${elementId}`;
        if (onStartElementOperation) {
            onStartElementOperation(action);
        }

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
            hasAddedHistory: true,
        });
    }, [elements, selectedElementIds, onElementSelect, screenToCanvas, onStartElementOperation]);

    // Handle mouse move (during drag/resize)
    const handleMouseMove = useCallback((event: React.MouseEvent) => {
        handleMouseMoveForPanning(event);

        if (!dragState.isDragging || !dragState.elementId) return;

        const canvasPos = screenToCanvas(event.clientX, event.clientY);
        const deltaX = canvasPos.x - dragState.startPos.x;
        const deltaY = canvasPos.y - dragState.startPos.y;

        if (dragState.dragType === 'move') {
            const newX = dragState.startElementPos.x + deltaX;
            const newY = dragState.startElementPos.y + deltaY;

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
    }, [dragState, screenToCanvas, onElementUpdate, handleMouseMoveForPanning]);

    // Handle mouse up (end drag/resize)
    const handleMouseUp = useCallback(() => {
        handleMouseUpForPanning();

        setDragState({
            isDragging: false,
            dragType: 'move',
            elementId: null,
            startPos: { x: 0, y: 0 },
            startElementPos: { x: 0, y: 0, width: 0, height: 0 },
            resizeHandle: null,
            hasAddedHistory: false,
        });
    }, [handleMouseUpForPanning]);

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
            newElement = JSON.parse(elementData);
            newElement.x = canvasPos.x - newElement.width / 2;
            newElement.y = canvasPos.y - newElement.height / 2;
        } else {
            newElement = {
                type: elementType as PlacedElement['type'],
                x: canvasPos.x - 60,
                y: canvasPos.y - 30,
                width: 120,
                height: 60,
                properties: getDefaultElementProperties(elementType),
            };
        }

        onElementAdd(newElement);
        setDropZone({ isActive: false, elementType: null });
    }, [screenToCanvas, onElementAdd]);

    // Get default properties for element type
    const getDefaultElementProperties = (elementType: string): Record<string, any> => {
        switch (elementType) {
            case 'sensor':
                return {
                    sensorTag: 'New Sensor',
                    placeholderSensorLabel: 'New Sensor Label',
                    placeholderValue: '',
                    placeholderUnit: '',
                    fontSize: 12,
                    fontFamily: 'Inter',
                    fontWeight: 'normal',
                    textColor: '#000000',
                    backgroundColor: 'transparent',
                    textAlign: 'left',
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
                    textAlign: 'left'
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
            default:
                return {};
        }
    };

    // Render resize handles for selected elements
    const renderResizeHandles = (element: PlacedElement, isSelected: boolean) => {
        if (!isSelected) return null;

        const handles = ['nw', 'ne', 'sw', 'se'];

        return handles.map(handle => (
            <div
                key={handle}
                data-skip-thumbnail="true"
                style={{
                    position: 'absolute',
                    width: '16px',
                    height: '16px',
                    backgroundColor: '#1976d2',
                    border: '2px solid white',
                    cursor: `${handle}-resize`,
                    zIndex: 10,
                    left: handle.includes('w') ? -8 : element.width * scale - 8,
                    top: handle.includes('n') ? -8 : element.height * scale - 8,
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
        if (layout.backgroundType === 'rive') {
            return {
                backgroundColor: 'transparent',
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
            overflow: 'hidden',
            backgroundColor: '#f5f5f5',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <div
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
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMoveForPanning}
                onMouseUp={handleMouseUpForPanning}
            >
                {/* Reset View Button */}
                <button
                    data-skip-thumbnail="true"
                    onClick={resetView}
                    style={{
                        position: 'absolute',
                        top: '16px',
                        right: '16px',
                        zIndex: 100,
                        padding: '8px 12px',
                        fontSize: '12px',
                        backgroundColor: '#fff',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                    title="Reset view to fit and center"
                >
                    🎯 Reset View
                </button>
                <div
                    ref={canvasRef}
                    data-canvas="true"
                    className="frame-canvas-area"
                    style={{
                        position: 'relative',
                        border: dropZone.isActive ? '2px dashed #1976d2' : '2px solid #bbb',
                        boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                        userSelect: 'none',
                        width: layout.width * scale,
                        height: layout.height * scale,
                        overflow: 'hidden',
                        transform: `translate(${viewportOffset.x}px, ${viewportOffset.y}px)`,
                        cursor: 'default',
                        ...getBackgroundStyle(),
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
                    {/* Rive Background Component */}
                    {layout.backgroundType === 'rive' && layout.riveFile && (
                        <RiveBackground
                            riveFile={layout.riveFile}
                            stateMachine={layout.riveStateMachine || undefined}
                            inputs={layout.riveInputs || undefined}
                            width={layout.width}
                            height={layout.height}
                            onRiveDiscovery={onRiveDiscovery}
                        />
                    )}

                    {/* Grid overlay for positioning help */}
                    <div
                        data-skip-thumbnail="true" 
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
                            zIndex: 1,
                        }}
                    />

                    {/* Render elements */}
                    {elements.map((element) => {
                        const isSelected = selectedElementIds.includes(element.id);
                        return (
                            <div
                                key={element.id}
                                style={getElementStyles(element, isSelected)}
                                onMouseDown={(e) => handleElementMouseDown(e, element.id)}
                                onMouseEnter={(e) => {
                                    if (!isSelected) {
                                        (e.currentTarget as HTMLElement).style.borderColor = '#999';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!isSelected) {
                                        (e.currentTarget as HTMLElement).style.borderColor = '#ccc';
                                    }
                                }}
                            >
                                {renderElementContent(element)}
                                {renderResizeHandles(element, isSelected)}
                            </div>
                        );
                    })}

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
                            pointerEvents: 'none',
                            zIndex: 10
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
                    {elements.length === 0 && !dropZone.isActive && layout.backgroundType !== 'rive' && (
                        <div style={{
                            position: 'absolute',
                            inset: '0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#999',
                            zIndex: 1
                        }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '18px', fontWeight: 500 }}>Empty Canvas</div>
                                <div style={{ fontSize: '14px' }}>Drag elements from the library to get started</div>
                            </div>
                        </div>
                    )}

                    {/* Rive Loading State */}
                    {layout.backgroundType === 'rive' && layout.riveFile && elements.length === 0 && !dropZone.isActive && (
                        <div style={{
                            position: 'absolute',
                            inset: '0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#999',
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

            {/* Canvas info overlay */}
            <div style={{
                marginTop: '16px',
                textAlign: 'center',
                fontSize: '14px',
                color: '#666'
            }}>
                Scale: {Math.round(scale * 100)}% |
                Canvas: {layout.width}×{layout.height} |
                Display: {Math.round(layout.width * scale)}×{Math.round(layout.height * scale)} |
                Offset: ({Math.round(viewportOffset.x)}, {Math.round(viewportOffset.y)})
                {layout.backgroundType === 'rive' && layout.riveFile && (
                    <span> | Rive: {layout.riveFile}</span>
                )}
                <br />
                <span style={{ fontSize: '12px', color: '#999' }}>
                    Wheel: Zoom | Shift+Wheel: Pan Horizontal | Middle Click+Drag: Pan
                </span>
            </div>
        </div>
    );
};

export default FrameEngine_Canvas;