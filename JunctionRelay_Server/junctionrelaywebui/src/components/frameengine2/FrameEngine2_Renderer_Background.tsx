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

import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { useRive, UseRiveParameters } from '@rive-app/react-canvas';
import type { FrameLayoutConfig } from './types/FrameEngine2_LayoutTypes';
import type {
    DiscoveredRiveStateMachine,
    DiscoveredRiveDataBinding
} from './types/FrameEngine2_ElementTypes';
import {
    discoverRiveInputsAndBindings,
    applyRiveInputs,
    applyRiveBindings
} from './FrameEngine2_RiveDiscovery';

interface FrameEngine2_Renderer_BackgroundProps {
    layout: FrameLayoutConfig;
    onRiveDiscovery?: (machines: DiscoveredRiveStateMachine[], bindings: DiscoveredRiveDataBinding[]) => void;
}

/**
 * Background renderer for FrameEngine2 Canvas
 *
 * Supports three background types:
 * - Image: Static image with fit modes (cover, contain, fill, etc.)
 * - Video: Looping video background with autoplay
 * - Rive: Animated Rive background with input/binding discovery and application
 *
 * Performance optimizations:
 * - All styles memoized to prevent recreation
 * - Video/Rive only rendered when actually needed
 * - Error handling to prevent crashes
 * - Error states reset when file changes (ensures new files load)
 * - Rive discovery runs asynchronously with retry logic
 */
const FrameEngine2_Renderer_Background: React.FC<FrameEngine2_Renderer_BackgroundProps> = ({ layout, onRiveDiscovery }) => {
    const [imageError, setImageError] = useState(false);
    const [videoError, setVideoError] = useState(false);
    const [discoveredMachines, setDiscoveredMachines] = useState<DiscoveredRiveStateMachine[]>([]);
    const [discoveredBindings, setDiscoveredBindings] = useState<DiscoveredRiveDataBinding[]>([]);

    /**
     * Determine background type (image, video, rive, or none)
     */
    const backgroundType = useMemo(() => {
        if (!layout.backgroundType) return 'none';
        return layout.backgroundType as 'image' | 'video' | 'rive' | 'none';
    }, [layout.backgroundType]);

    /**
     * Map fit modes to CSS objectFit values (only valid CSS values)
     */
    const getObjectFit = useCallback((fitMode?: string): React.CSSProperties['objectFit'] => {
        switch (fitMode) {
            case 'cover': return 'cover';
            case 'contain': return 'contain';
            case 'fill': return 'fill';
            case 'none': return 'none';
            default: return 'cover';
        }
    }, []);

    /**
     * Resolve image URL - convert local filenames to API endpoints
     * Pass through blob URLs and HTTP URLs unchanged
     */
    const resolvedImageUrl = useMemo(() => {
        if (!layout.backgroundImageUrl) return undefined;
        return (layout.backgroundImageUrl.startsWith('http') || layout.backgroundImageUrl.startsWith('blob:'))
            ? layout.backgroundImageUrl
            : `/api/frameengine/images/${layout.backgroundImageUrl}/content`;
    }, [layout.backgroundImageUrl]);

    /**
     * Resolve video URL - convert local filenames to API endpoints
     * Pass through blob URLs and HTTP URLs unchanged
     */
    const resolvedVideoUrl = useMemo(() => {
        if (!layout.backgroundVideoUrl) return undefined;
        return (layout.backgroundVideoUrl.startsWith('http') || layout.backgroundVideoUrl.startsWith('blob:'))
            ? layout.backgroundVideoUrl
            : `/api/frameengine/videos/${layout.backgroundVideoUrl}/content`;
    }, [layout.backgroundVideoUrl]);

    /**
     * Resolve Rive URL - convert local filenames to API endpoints
     * Pass through blob URLs and HTTP URLs unchanged
     */
    const resolvedRiveUrl = useMemo(() => {
        if (!layout.riveFile) return undefined;
        return (layout.riveFile.startsWith('http') || layout.riveFile.startsWith('blob:'))
            ? layout.riveFile
            : `/api/frameengine/rive/${layout.riveFile}/content`;
    }, [layout.riveFile]);

    /**
     * Reset image error when image URL changes
     * OPTIMIZATION: Ensures new images load even if previous one failed
     */
    useEffect(() => {
        setImageError(false);
    }, [resolvedImageUrl]);

    /**
     * Reset video error when video URL changes
     * OPTIMIZATION: Ensures new videos load even if previous one failed
     */
    useEffect(() => {
        setVideoError(false);
    }, [resolvedVideoUrl]);

    /**
     * Image background styles - memoized
     */
    const imageStyles = useMemo(() => ({
        position: 'absolute' as const,
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        objectFit: getObjectFit(layout.backgroundImageFit),
        opacity: layout.backgroundOpacity !== undefined ? layout.backgroundOpacity : 1,
        pointerEvents: 'none' as const,
        userSelect: 'none' as const,
        zIndex: 0
    }), [layout.backgroundImageFit, layout.backgroundOpacity, getObjectFit]);

    /**
     * Video background styles - memoized
     */
    const videoStyles = useMemo(() => ({
        position: 'absolute' as const,
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        objectFit: getObjectFit(layout.backgroundVideoFit),
        opacity: layout.backgroundOpacity !== undefined ? layout.backgroundOpacity : 1,
        pointerEvents: 'none' as const,
        userSelect: 'none' as const,
        zIndex: 0
    }), [layout.backgroundVideoFit, layout.backgroundOpacity, getObjectFit]);

    /**
     * Rive container styles - memoized
     * Uses explicit canvas dimensions to prevent scaling with window
     */
    const riveContainerStyles = useMemo(() => ({
        position: 'absolute' as const,
        top: 0,
        left: 0,
        width: layout.width,
        height: layout.height,
        opacity: layout.backgroundOpacity !== undefined ? layout.backgroundOpacity : 1,
        pointerEvents: 'none' as const,
        userSelect: 'none' as const,
        zIndex: 0
    }), [layout.width, layout.height, layout.backgroundOpacity]);

    /**
     * Rive configuration - memoized
     * Only created when Rive background is active
     * Enables autoBind for View Model data bindings and stateMachine selection
     */
    const riveParams = useMemo<UseRiveParameters | null>(() => {
        if (backgroundType !== 'rive' || !resolvedRiveUrl) return null;

        return {
            src: resolvedRiveUrl,
            autoplay: true,
            autoBind: true, // Required for View Model data bindings
            stateMachines: layout.riveStateMachine ? [layout.riveStateMachine] : undefined,
            automaticallyHandleEvents: true
        };
    }, [backgroundType, resolvedRiveUrl, layout.riveStateMachine]);

    /**
     * Rive hook - only initialized when needed
     * Returns rive instance for discovery and binding application
     */
    const { RiveComponent, rive } = useRive(riveParams || {
        src: '',
        autoplay: false
    });

    /**
     * Image error handler - memoized
     */
    const handleImageError = useCallback(() => {
        console.warn('[FrameEngine2_Renderer_Background] Failed to load background image:', resolvedImageUrl);
        setImageError(true);
    }, [resolvedImageUrl]);

    /**
     * Video error handler - memoized
     */
    const handleVideoError = useCallback(() => {
        console.warn('[FrameEngine2_Renderer_Background] Failed to load background video:', resolvedVideoUrl);
        setVideoError(true);
    }, [resolvedVideoUrl]);

    /**
     * Discovery effect - triggers when Rive file changes
     * Discovers state machine inputs and view model data bindings
     */
    useEffect(() => {
        if (!rive || backgroundType !== 'rive') {
            setDiscoveredMachines([]);
            setDiscoveredBindings([]);
            return;
        }

        let cancelled = false;

        // Wait 100ms before discovery (viewModel property may not be immediately available)
        const timeoutId = setTimeout(() => {
            if (cancelled) return;

            discoverRiveInputsAndBindings(rive)
                .then(({ machines, bindings }) => {
                    if (cancelled) return;

                    setDiscoveredMachines(machines);
                    setDiscoveredBindings(bindings);

                    // Notify parent of discovery
                    if (onRiveDiscovery) {
                        onRiveDiscovery(machines, bindings);
                    }
                })
                .catch((error) => {
                    console.error('[FrameEngine2_Renderer_Background] Rive discovery failed:', error);
                });
        }, 100);

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
        };
    }, [rive, backgroundType, resolvedRiveUrl, onRiveDiscovery]);

    /**
     * Apply state machine inputs when layout.riveInputs changes
     */
    useEffect(() => {
        if (!rive || !layout.riveInputs || discoveredMachines.length === 0) return;

        applyRiveInputs(discoveredMachines, layout.riveInputs);
    }, [rive, layout.riveInputs, discoveredMachines]);

    /**
     * Apply data bindings when layout.riveBindings changes
     */
    useEffect(() => {
        if (!rive || !layout.riveBindings || discoveredBindings.length === 0) return;

        applyRiveBindings(discoveredBindings, layout.riveBindings);
    }, [rive, layout.riveBindings, discoveredBindings]);

    /**
     * Render appropriate background type
     */
    if (backgroundType === 'image' && resolvedImageUrl && !imageError) {
        return (
            <img
                src={resolvedImageUrl}
                alt="Background"
                style={imageStyles}
                onError={handleImageError}
            />
        );
    }

    if (backgroundType === 'video' && resolvedVideoUrl && !videoError) {
        return (
            <video
                src={resolvedVideoUrl}
                style={videoStyles}
                loop={layout.videoLoop !== false}
                muted={layout.videoMuted !== false}
                autoPlay={layout.videoAutoplay !== false}
                playsInline
                onError={handleVideoError}
            />
        );
    }

    if (backgroundType === 'rive' && resolvedRiveUrl && riveParams) {
        return (
            <div style={riveContainerStyles} key={resolvedRiveUrl}>
                <RiveComponent style={{
                    width: layout.width,
                    height: layout.height,
                    display: 'block'
                }} />
            </div>
        );
    }

    // No background or error state
    return null;
};

export default FrameEngine2_Renderer_Background;
