/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * JunctionRelay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import html2canvas from 'html2canvas';
import type {
    FrameLayoutConfig,
    PlacedElement,
    DiscoveredStateMachine,
    DiscoveredDataBinding,
} from './ConfigureFrame_Types';

/**
 * Generate discovery metadata from machines and bindings
 */
const generateDiscoveryMetadata = (
    machines: DiscoveredStateMachine[],
    bindings: DiscoveredDataBinding[],
    currentMetadata?: any
) => {
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
        discoveryAttempts: (currentMetadata?.discoveryAttempts || 0) + 1,
        lastSuccessfulDiscovery: new Date().toISOString()
    };
};

/**
 * Generate and save thumbnail from canvas
 */
export const generateAndSaveThumbnail = async (
    canvasRef: React.RefObject<HTMLDivElement | null>,
    layoutId: number | undefined,
    backgroundColor: string
): Promise<void> => {
    if (!canvasRef.current) {
        console.warn('Canvas ref not available for thumbnail generation');
        return;
    }

    if (!layoutId) {
        console.warn('Layout ID not available for thumbnail generation');
        return;
    }

    try {
        console.log('Generating thumbnail from canvas...');

        await new Promise(resolve => setTimeout(resolve, 500));

        const canvasElement = canvasRef.current.querySelector('[data-canvas="true"]') ||
            canvasRef.current.querySelector('.frame-canvas-area') ||
            canvasRef.current;

        if (!canvasElement) {
            console.error('Could not find canvas element for thumbnail capture');
            return;
        }

        console.log('Found canvas element for capture:', canvasElement.className || 'no-class');

        const canvas = await html2canvas(canvasElement as HTMLElement, {
            width: 300,
            height: 200,
            useCORS: true,
            allowTaint: true,
            background: backgroundColor || '#FFFFFF'
        });

        const dataURL = canvas.toDataURL('image/png', 0.8);

        console.log('Sending thumbnail to backend...');

        const response = await fetch(`/api/frameengine/${layoutId}/thumbnail-from-frontend`, {
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

/**
 * Upload custom thumbnail
 */
export const uploadCustomThumbnail = async (
    layoutId: number | undefined,
    file: File
): Promise<void> => {
    if (!layoutId) {
        console.warn('Layout ID not available for thumbnail upload');
        return;
    }

    try {
        const formData = new FormData();
        formData.append('thumbnail', file);

        const response = await fetch(`/api/frameengine/${layoutId}/thumbnail-upload`, {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            console.log('Custom thumbnail uploaded successfully');
        } else {
            const errorText = await response.text();
            console.error('Failed to upload thumbnail:', errorText);
        }
    } catch (error) {
        console.error('Error uploading thumbnail:', error);
    }
};

/**
 * Core save function - saves layout and elements to backend
 */
export const performSave = async (
    layout: FrameLayoutConfig,
    elements: PlacedElement[],
    discoveredMachines: DiscoveredStateMachine[],
    discoveredBindings: DiscoveredDataBinding[],
    elementRiveDiscoveries?: Record<string, {
        machines: DiscoveredStateMachine[];
        bindings: DiscoveredDataBinding[];
    }>,
    customThumbnail?: File
): Promise<void> => {
    try {
        // Build the enhanced JsonFrameConfig with Rive discovery data
        const frameConfig = {
            type: "rive_config",
            screenId: layout.id?.toString() || "new",
            frameConfig: {
                version: "1.0",
                lastConfigUpdate: new Date().toISOString(),

                canvas: {
                    width: layout.width,
                    height: layout.height,
                    orientation: layout.orientation || 'landscape',
                    settings: layout.canvasSettings || {
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
                    type: layout.backgroundType || 'color',
                    color: layout.backgroundColor || '#FFFFFF',
                    imageUrl: layout.backgroundImageUrl || null,
                    imageFit: layout.backgroundImageFit || 'cover',
                    videoUrl: layout.backgroundVideoUrl || null,
                    videoFit: layout.backgroundVideoFit || 'cover',
                    videoLoop: layout.videoLoop ?? true,
                    videoMuted: layout.videoMuted ?? true,
                    videoAutoplay: layout.videoAutoplay ?? true,
                    opacity: layout.backgroundOpacity || 1.0
                },

                ...(layout.backgroundType === 'rive' || layout.riveFile ? {
                    rive: {
                        enabled: layout.backgroundType === 'rive',
                        file: layout.riveFile || null,
                        inputs: layout.riveInputs || {},
                        bindings: layout.riveBindings || {},
                        settings: {
                            fit: 'cover',
                            alignment: 'center',
                            autoplay: true,
                            loop: true
                        },
                        discovery: {
                            machines: discoveredMachines.length > 0 ? discoveredMachines : (layout.riveConfiguration?.discoveredMachines || []),
                            bindings: discoveredBindings.length > 0 ? discoveredBindings : (layout.riveConfiguration?.discoveredBindings || []),
                            lastUpdate: discoveredMachines.length > 0 || discoveredBindings.length > 0 ? new Date().toISOString() : (layout.riveConfiguration?.lastDiscoveryUpdate || ''),
                            metadata: discoveredMachines.length > 0 || discoveredBindings.length > 0 ? generateDiscoveryMetadata(discoveredMachines, discoveredBindings, layout.riveConfiguration?.discoveryMetadata) : (layout.riveConfiguration?.discoveryMetadata || {}),
                            activeStateMachine: layout.riveConfiguration?.activeStateMachine || layout.riveStateMachine,
                            globalInputMappings: layout.riveConfiguration?.globalInputMappings || {}
                        }
                    }
                } : {})
            }
        };

        // Build RUNTIME-ONLY config (stripped for devices)
        const runtimeFrameConfig = {
            type: "rive_config",
            screenId: layout.id?.toString() || "new",
            frameConfig: {
                version: "1.0",
                lastConfigUpdate: new Date().toISOString(),

                canvas: {
                    width: layout.width,
                    height: layout.height,
                    orientation: layout.orientation || 'landscape',
                    settings: {
                        elementPadding: layout.canvasSettings?.elementPadding ?? 4
                    }
                },

                background: {
                    type: layout.backgroundType || 'color',
                    color: layout.backgroundColor || '#FFFFFF',
                    imageUrl: layout.backgroundImageUrl || null,
                    imageFit: layout.backgroundImageFit || 'cover',
                    videoUrl: layout.backgroundVideoUrl || null,
                    videoFit: layout.backgroundVideoFit || 'cover',
                    videoLoop: layout.videoLoop ?? true,
                    videoMuted: layout.videoMuted ?? true,
                    videoAutoplay: layout.videoAutoplay ?? true,
                    opacity: layout.backgroundOpacity || 1.0
                },

                ...(layout.backgroundType === 'rive' || layout.riveFile ? {
                    rive: {
                        enabled: layout.backgroundType === 'rive',
                        file: layout.riveFile || null,
                        inputs: layout.riveInputs || {},
                        bindings: layout.riveBindings || {},
                        settings: {
                            fit: 'cover',
                            alignment: 'center',
                            autoplay: true,
                            loop: true
                        },
                        discovery: {
                            machines: (discoveredMachines.length > 0 ? discoveredMachines : (layout.riveConfiguration?.discoveredMachines || [])).map(machine => ({
                                name: machine.name,
                                inputNames: machine.inputNames,
                                inputs: machine.inputs.map(input => ({
                                    name: input.name,
                                    type: input.type,
                                    currentValue: input.currentValue
                                }))
                            })),
                            bindings: (discoveredBindings.length > 0 ? discoveredBindings : (layout.riveConfiguration?.discoveredBindings || [])).map(binding => ({
                                name: binding.name,
                                type: binding.type,
                                currentValue: binding.currentValue
                            })),
                            lastUpdate: discoveredMachines.length > 0 || discoveredBindings.length > 0 ? new Date().toISOString() : (layout.riveConfiguration?.lastDiscoveryUpdate || ''),
                            activeStateMachine: layout.riveConfiguration?.activeStateMachine || layout.riveStateMachine,
                            globalInputMappings: layout.riveConfiguration?.globalInputMappings || {}
                        }
                    }
                } : {})
            }
        };

        // Build standalone frameElements array
        const frameElements = elements.map((element, index) => {
            const baseElement = {
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
                    locked: element.locked ?? false,
                    zIndex: element.zIndex || index,
                    order: index
                },
                properties: element.properties || {},
                ...(element.sensorId ? { sensorId: element.sensorId } : {}),
                lastModified: new Date().toISOString(),
            };

            // Add sensor rive mapping if applicable
            if (element.type === 'sensor' && element.properties.riveMapping) {
                return {
                    ...baseElement,
                    riveConnections: {
                        mappedInputs: [element.properties.riveMapping],
                        lastMappingUpdate: new Date().toISOString()
                    }
                };
            }

            // Add asset-rive discoveries if applicable
            if (element.type === 'asset-rive' && elementRiveDiscoveries && elementRiveDiscoveries[element.id]) {
                const discovery = elementRiveDiscoveries[element.id];
                return {
                    ...baseElement,
                    riveDiscovery: {
                        machines: discovery.machines.map(machine => ({
                            name: machine.name,
                            inputNames: machine.inputNames,
                            inputs: machine.inputs.map(input => ({
                                name: input.name,
                                type: input.type,
                                currentValue: input.currentValue
                            }))
                        })),
                        bindings: discovery.bindings.map(binding => ({
                            name: binding.name,
                            type: binding.type,
                            currentValue: binding.currentValue
                        })),
                        lastUpdate: new Date().toISOString()
                    }
                };
            }

            return baseElement;
        });

        // Prepare the save data
        const saveData = {
            displayName: layout.displayName,
            description: layout.description,
            layoutType: layout.layoutType,
            width: layout.width,
            height: layout.height,
            orientation: layout.orientation,
            backgroundType: layout.backgroundType,
            backgroundColor: layout.backgroundColor,
            backgroundImageUrl: layout.backgroundImageUrl,
            backgroundImageFit: layout.backgroundImageFit,
            backgroundVideoUrl: layout.backgroundVideoUrl,
            backgroundVideoFit: layout.backgroundVideoFit,
            videoLoop: layout.videoLoop,
            videoMuted: layout.videoMuted,
            videoAutoplay: layout.videoAutoplay,
            backgroundOpacity: layout.backgroundOpacity,
            riveFile: layout.riveFile,
            riveStateMachine: layout.riveStateMachine,
            riveInputs: layout.riveInputs,
            riveBindings: layout.riveBindings,
            thumbnailOverride: customThumbnail ? true : layout.thumbnailOverride,
            isTemplate: layout.isTemplate,
            isDraft: layout.isDraft,
            isPublished: layout.isPublished,
            jsonFrameConfig: JSON.stringify(frameConfig),
            jsonFrameConfigRuntime: JSON.stringify(runtimeFrameConfig),
            jsonFrameElements: JSON.stringify(frameElements)
        };

        console.log('Saving frame configs:', {
            fullConfigSize: JSON.stringify(frameConfig).length,
            runtimeConfigSize: JSON.stringify(runtimeFrameConfig).length,
            elementsSize: JSON.stringify(frameElements).length,
            configReduction: `${Math.round((1 - JSON.stringify(runtimeFrameConfig).length / JSON.stringify(frameConfig).length) * 100)}%`,
            elementCount: frameElements.length,
            backgroundType: layout.backgroundType,
            backgroundImageUrl: layout.backgroundImageUrl,
            backgroundVideoUrl: layout.backgroundVideoUrl,
            videoPlaybackSettings: {
                videoLoop: layout.videoLoop,
                videoMuted: layout.videoMuted,
                videoAutoplay: layout.videoAutoplay,
                videoFit: layout.backgroundVideoFit
            }
        });

        const response = await fetch(`/api/frameengine/${layout.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(saveData),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to save frame layout');
        }

        console.log('Frame layout saved successfully');

    } catch (error) {
        console.error('Failed to save frame layout:', error);
        throw error;
    }
};

/**
 * Export layout as standalone ZIP package
 */
export const handleExport = async (layoutId: number | undefined, displayName: string): Promise<string | null> => {
    if (!layoutId) {
        throw new Error('No layout ID available for export');
    }

    try {
        console.log('Exporting layout as ZIP package...');

        const response = await fetch(`/api/frameengine/${layoutId}/export-standalone`);

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || `Export failed with status ${response.status}`);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${displayName}.zip`;
        a.click();
        URL.revokeObjectURL(url);

        console.log('ZIP package export completed');
        return null;
    } catch (error) {
        console.error('Export failed:', error);
        return `Failed to export layout: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
};