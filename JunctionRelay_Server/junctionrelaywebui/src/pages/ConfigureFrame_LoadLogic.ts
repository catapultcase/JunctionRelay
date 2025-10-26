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

import type {
    FrameLayoutConfig,
    PlacedElement,
} from './ConfigureFrame_Types';

interface SavedElement {
    id: string;
    type: PlacedElement['type'];
    position: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    display: {
        visible: boolean;
        locked: boolean;
        zIndex: number;
        order: number;
    };
    properties: Record<string, any>;
    sensorId?: string;
    lastModified: string;
}

interface RiveConfiguration {
    discoveredMachines: any[];
    discoveredBindings: any[];
    lastDiscoveryUpdate: string;
    activeStateMachine?: string;
    globalInputMappings?: Record<string, any>;
    discoveryMetadata?: {
        totalInputs: number;
        inputTypeBreakdown: Record<string, number>;
        discoveryAttempts: number;
        lastSuccessfulDiscovery: string;
    };
}

/**
 * Load frame layout from API
 */
export const loadFrameLayout = async (layoutId: number): Promise<{
    layout: FrameLayoutConfig;
    elements: PlacedElement[];
}> => {
    try {
        const response = await fetch(`/api/frameengine/${layoutId}`);

        if (!response.ok) {
            throw new Error('Failed to load frame layout');
        }

        const layoutData = await response.json();

        const frameConfig = layoutData.jsonFrameConfig ? JSON.parse(layoutData.jsonFrameConfig) : {};

        let riveConfiguration: RiveConfiguration = {
            discoveredMachines: [],
            discoveredBindings: [],
            lastDiscoveryUpdate: '',
            globalInputMappings: {},
            discoveryMetadata: {
                totalInputs: 0,
                inputTypeBreakdown: {},
                discoveryAttempts: 0,
                lastSuccessfulDiscovery: ''
            }
        };

        if (frameConfig.frameConfig?.rive?.discovery) {
            const discovery = frameConfig.frameConfig.rive.discovery;
            riveConfiguration = {
                discoveredMachines: discovery.machines || [],
                discoveredBindings: discovery.bindings || [],
                lastDiscoveryUpdate: discovery.lastUpdate || '',
                activeStateMachine: discovery.activeStateMachine,
                globalInputMappings: discovery.globalInputMappings || {},
                discoveryMetadata: discovery.metadata || riveConfiguration.discoveryMetadata
            };
            console.log('Restored Rive configuration from JsonFrameConfig:', riveConfiguration);
        }

        let canvasSettings = {
            grid: {
                snapToGrid: false,
                showGrid: false,
                gridSize: 10,
                gridColor: '#000000'
            },
            elementPadding: 4
        };

        if (frameConfig.frameConfig?.canvas?.settings) {
            canvasSettings = frameConfig.frameConfig.canvas.settings;
            console.log('Restored canvas settings from JsonFrameConfig:', canvasSettings);
        }

        let elementPositions: PlacedElement[] = [];
        if (layoutData.jsonFrameElements) {
            try {
                const savedElements: SavedElement[] = JSON.parse(layoutData.jsonFrameElements);
                elementPositions = savedElements.map((savedElement: SavedElement): PlacedElement => ({
                    id: savedElement.id,
                    type: savedElement.type,
                    x: savedElement.position?.x || 0,
                    y: savedElement.position?.y || 0,
                    width: savedElement.position?.width || 100,
                    height: savedElement.position?.height || 60,
                    properties: savedElement.properties || {},
                    sensorId: savedElement.sensorId,
                    visible: savedElement.display?.visible ?? true,
                    locked: savedElement.display?.locked ?? false,
                    zIndex: savedElement.display?.zIndex || 0
                }));
                console.log('Loaded elements:', elementPositions);
            } catch (elementError) {
                console.error('Error parsing elements:', elementError);
                elementPositions = [];
            }
        }

        const layout: FrameLayoutConfig = {
            id: layoutData.id,
            displayName: layoutData.displayName,
            description: layoutData.description,
            layoutType: layoutData.layoutType,
            rows: frameConfig.frameConfig?.canvas?.grid?.rows || layoutData.rows,
            columns: frameConfig.frameConfig?.canvas?.grid?.columns || layoutData.columns,
            width: frameConfig.frameConfig?.canvas?.width || layoutData.width,
            height: frameConfig.frameConfig?.canvas?.height || layoutData.height,
            orientation: frameConfig.frameConfig?.canvas?.orientation || layoutData.orientation,
            backgroundType: frameConfig.frameConfig?.background?.type || layoutData.backgroundType || 'color',
            backgroundColor: frameConfig.frameConfig?.background?.color || layoutData.backgroundColor,
            backgroundImageUrl: frameConfig.frameConfig?.background?.imageUrl || layoutData.backgroundImageUrl,
            backgroundImageFit: frameConfig.frameConfig?.background?.imageFit || layoutData.backgroundImageFit || 'cover',
            backgroundVideoUrl: frameConfig.frameConfig?.background?.videoUrl || layoutData.backgroundVideoUrl,
            backgroundVideoFit: frameConfig.frameConfig?.background?.videoFit || layoutData.backgroundVideoFit || 'cover',
            videoLoop: frameConfig.frameConfig?.background?.videoLoop ?? layoutData.videoLoop ?? true,
            videoMuted: frameConfig.frameConfig?.background?.videoMuted ?? layoutData.videoMuted ?? true,
            videoAutoplay: frameConfig.frameConfig?.background?.videoAutoplay ?? layoutData.videoAutoplay ?? true,
            backgroundOpacity: frameConfig.frameConfig?.background?.opacity || layoutData.backgroundOpacity,
            riveFile: frameConfig.frameConfig?.rive?.file || layoutData.riveFile,
            riveStateMachine: frameConfig.frameConfig?.rive?.stateMachine || layoutData.riveStateMachine,
            riveInputs: frameConfig.frameConfig?.rive?.inputs || layoutData.riveInputs,
            riveBindings: frameConfig.frameConfig?.rive?.bindings || layoutData.riveBindings,
            riveConfiguration: riveConfiguration,
            canvasSettings: canvasSettings,
            thumbnailOverride: layoutData.thumbnailOverride || false,
            jsonFrameConfig: layoutData.jsonFrameConfig,
            jsonFrameElements: layoutData.jsonFrameElements,
            isTemplate: frameConfig.frameConfig?.metadata?.isTemplate || layoutData.isTemplate,
            isDraft: frameConfig.frameConfig?.metadata?.isDraft || layoutData.isDraft,
            isPublished: frameConfig.frameConfig?.metadata?.isPublished || layoutData.isPublished,
            created: layoutData.created,
            lastModified: layoutData.lastModified,
            createdBy: layoutData.createdBy,
            version: frameConfig.frameConfig?.version || layoutData.version,
        };

        return { layout, elements: elementPositions };

    } catch (error) {
        console.error('Failed to load frame layout:', error);
        throw error;
    }
};

/**
 * Get default canvas settings
 */
export const getDefaultCanvasSettings = () => ({
    grid: {
        snapToGrid: false,
        showGrid: false,
        gridSize: 10,
        gridColor: '#000000'
    },
    elementPadding: 4
});

/**
 * Get initial layout configuration
 */
export const getInitialLayout = (): FrameLayoutConfig => ({
    displayName: '',
    layoutType: 'PRE_RENDERED_IMAGE',
    width: 800,
    height: 600,
    orientation: 'landscape',
    backgroundColor: '#FFFFFF',
    backgroundType: 'color',
    backgroundImageUrl: null,
    backgroundVideoUrl: null,
    backgroundOpacity: 1.0,
    thumbnailOverride: false,
    canvasSettings: getDefaultCanvasSettings(),
    riveConfiguration: {
        discoveredMachines: [],
        discoveredBindings: [],
        lastDiscoveryUpdate: '',
        globalInputMappings: {},
        discoveryMetadata: {
            totalInputs: 0,
            inputTypeBreakdown: {},
            discoveryAttempts: 0,
            lastSuccessfulDiscovery: ''
        }
    },
    isTemplate: false,
    isDraft: true,
    isPublished: false,
    rows: 2,
    columns: 2,
    version: '1.0',
});