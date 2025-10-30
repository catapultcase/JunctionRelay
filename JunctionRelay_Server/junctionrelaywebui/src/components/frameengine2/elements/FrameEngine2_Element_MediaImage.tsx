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
 * Props for the MediaImage element component
 */
interface MediaImageElementProps {
    /** Element properties */
    properties: {
        filename?: string | null;
        objectFit?: 'cover' | 'contain' | 'fill' | 'none';
        opacity?: number;
        [key: string]: any;
    };

    /** Element dimensions */
    width: number;
    height: number;
}

/**
 * MediaImage Element - Displays uploaded image assets
 *
 * Performance optimizations:
 * - Memoized styles
 * - Error state handling
 * - Auto-reset errors on file change
 */
const FrameEngine2_Element_MediaImage: React.FC<MediaImageElementProps> = ({
    properties,
    width,
    height
}) => {
    const {
        filename = null,
        objectFit = 'cover',
        opacity = 1
    } = properties;

    const [imageError, setImageError] = useState(false);

    /**
     * Resolve image URL - convert filenames to API endpoints
     * Pass through blob URLs and HTTP URLs unchanged
     */
    const resolvedImageUrl = useMemo(() => {
        if (!filename) return undefined;
        return (filename.startsWith('http') || filename.startsWith('blob:'))
            ? filename
            : `/api/frameengine/images/${filename}/content`;
    }, [filename]);

    /**
     * Reset error when image URL changes
     */
    useEffect(() => {
        setImageError(false);
    }, [resolvedImageUrl]);

    /**
     * Image styles - memoized
     */
    const imageStyles = useMemo(() => ({
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
    const handleImageError = useCallback(() => {
        console.warn('[FrameEngine2_Element_MediaImage] Failed to load image:', resolvedImageUrl);
        setImageError(true);
    }, [resolvedImageUrl]);

    // No image selected
    if (!resolvedImageUrl) {
        return (
            <div style={placeholderStyles}>
                No image selected
            </div>
        );
    }

    // Image load error
    if (imageError) {
        return (
            <div style={placeholderStyles}>
                Image failed to load
            </div>
        );
    }

    // Render image
    return (
        <img
            src={resolvedImageUrl}
            alt="Media"
            style={imageStyles}
            onError={handleImageError}
        />
    );
};

export default React.memo(FrameEngine2_Element_MediaImage);
