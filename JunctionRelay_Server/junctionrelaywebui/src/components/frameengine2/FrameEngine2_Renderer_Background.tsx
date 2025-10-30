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

interface FrameEngine2_Renderer_BackgroundProps {
    layout: FrameLayoutConfig;
}

/**
 * Background renderer for FrameEngine2 Canvas
 *
 * Supports three background types:
 * - Image: Static image with fit modes (cover, contain, fill, etc.)
 * - Video: Looping video background with autoplay
 * - Rive: Animated Rive background (no bindings yet - kept simple)
 *
 * Performance optimizations:
 * - All styles memoized to prevent recreation
 * - Video/Rive only rendered when actually needed
 * - Error handling to prevent crashes
 * - Error states reset when file changes (ensures new files load)
 */
const FrameEngine2_Renderer_Background: React.FC<FrameEngine2_Renderer_BackgroundProps> = ({ layout }) => {
    const [imageError, setImageError] = useState(false);
    const [videoError, setVideoError] = useState(false);

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
     */
    const riveParams = useMemo<UseRiveParameters | null>(() => {
        if (backgroundType !== 'rive' || !resolvedRiveUrl) return null;

        return {
            src: resolvedRiveUrl,
            autoplay: true
        };
    }, [backgroundType, resolvedRiveUrl]);

    /**
     * Rive hook - only initialized when needed
     */
    const { RiveComponent } = useRive(riveParams || {
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
