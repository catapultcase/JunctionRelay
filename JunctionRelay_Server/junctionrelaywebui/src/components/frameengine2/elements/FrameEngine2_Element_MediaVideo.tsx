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

import React, { useMemo, useCallback, useState, useEffect } from 'react';

/**
 * Props for the MediaVideo element component
 */
interface MediaVideoElementProps {
    /** Element properties */
    properties: {
        filename?: string | null;
        objectFit?: 'cover' | 'contain' | 'fill' | 'none';
        opacity?: number;
        loop?: boolean;
        muted?: boolean;
        autoplay?: boolean;
        [key: string]: any;
    };

    /** Element dimensions */
    width: number;
    height: number;
}

/**
 * MediaVideo Element - Displays uploaded video assets
 *
 * Performance optimizations:
 * - Memoized styles
 * - Error state handling
 * - Auto-reset errors on file change
 */
const FrameEngine2_Element_MediaVideo: React.FC<MediaVideoElementProps> = ({
    properties,
    width,
    height
}) => {
    const {
        filename = null,
        objectFit = 'cover',
        opacity = 1,
        loop = true,
        muted = true,
        autoplay = true
    } = properties;

    const [videoError, setVideoError] = useState(false);

    /**
     * Resolve video URL - convert filenames to API endpoints
     * Pass through blob URLs and HTTP URLs unchanged
     */
    const resolvedVideoUrl = useMemo(() => {
        if (!filename) return undefined;
        return (filename.startsWith('http') || filename.startsWith('blob:'))
            ? filename
            : `/api/frameengine/videos/${filename}/content`;
    }, [filename]);

    /**
     * Reset error when video URL changes
     */
    useEffect(() => {
        setVideoError(false);
    }, [resolvedVideoUrl]);

    /**
     * Video styles - memoized
     */
    const videoStyles = useMemo(() => ({
        width: '100%',
        height: '100%',
        objectFit: objectFit as React.CSSProperties['objectFit'],
        opacity,
        display: 'block',
        userSelect: 'none' as const,
        pointerEvents: 'none' as const
    }), [objectFit, opacity]);

    /**
     * Placeholder styles - memoized
     */
    const placeholderStyles = useMemo(() => ({
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f0f0f0',
        color: '#999',
        fontSize: '12px',
        textAlign: 'center' as const,
        padding: '8px',
        userSelect: 'none' as const
    }), []);

    /**
     * Error handler - memoized
     */
    const handleVideoError = useCallback(() => {
        console.warn('[FrameEngine2_Element_MediaVideo] Failed to load video:', resolvedVideoUrl);
        setVideoError(true);
    }, [resolvedVideoUrl]);

    // No video selected
    if (!resolvedVideoUrl) {
        return (
            <div style={placeholderStyles}>
                No video selected
            </div>
        );
    }

    // Video load error
    if (videoError) {
        return (
            <div style={placeholderStyles}>
                Video failed to load
            </div>
        );
    }

    // Render video
    return (
        <video
            src={resolvedVideoUrl}
            style={videoStyles}
            loop={loop}
            muted={muted}
            autoPlay={autoplay}
            playsInline
            onError={handleVideoError}
        />
    );
};

export default React.memo(FrameEngine2_Element_MediaVideo);
