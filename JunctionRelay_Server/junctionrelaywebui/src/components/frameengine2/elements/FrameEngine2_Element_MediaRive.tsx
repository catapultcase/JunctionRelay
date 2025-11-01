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

import React, { useMemo } from 'react';
import { useRive, UseRiveParameters } from '@rive-app/react-canvas';

/**
 * Props for the MediaRive element component
 */
interface MediaRiveElementProps {
    /** Element properties */
    properties: {
        filename?: string | null;
        autoplay?: boolean;
        [key: string]: any;
    };

    /** Element dimensions */
    width: number;
    height: number;
}

/**
 * MediaRive Element - Displays uploaded Rive animation assets
 *
 * Performance optimizations:
 * - Memoized Rive parameters
 * - Key-based remounting on file change
 * - Clean placeholder rendering
 *
 * Note: No Rive bindings implemented yet - just basic rendering
 */
const FrameEngine2_Element_MediaRive: React.FC<MediaRiveElementProps> = ({
    properties,
    width,
    height
}) => {
    const {
        filename = null,
        autoplay = true,
        backgroundColor = 'transparent'
    } = properties;

    /**
     * Resolve Rive URL - convert filenames to API endpoints
     * Pass through blob URLs and HTTP URLs unchanged
     */
    const resolvedRiveUrl = useMemo(() => {
        if (!filename) return undefined;
        return (filename.startsWith('http') || filename.startsWith('blob:'))
            ? filename
            : `/api/frameengine/rive/${filename}/content`;
    }, [filename]);

    /**
     * Rive configuration - memoized
     */
    const riveParams = useMemo<UseRiveParameters | null>(() => {
        if (!resolvedRiveUrl) return null;

        return {
            src: resolvedRiveUrl,
            autoplay
        };
    }, [resolvedRiveUrl, autoplay]);

    /**
     * Rive hook - only initialized when needed
     */
    const { RiveComponent } = useRive(riveParams || {
        src: '',
        autoplay: false
    });

    /**
     * Container styles - memoized
     */
    const containerStyles = useMemo(() => ({
        width: '100%',
        height: '100%',
        position: 'relative' as const,
        userSelect: 'none' as const,
        pointerEvents: 'none' as const
    }), []);

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

    // No Rive file selected
    if (!resolvedRiveUrl || !riveParams) {
        return (
            <div style={placeholderStyles}>
                No Rive file selected
            </div>
        );
    }

    // Render Rive animation with key to force remount on file change
    return (
        <div style={containerStyles} key={resolvedRiveUrl}>
            <RiveComponent style={{
                width: '100%',
                height: '100%',
                display: 'block',
                backgroundColor
            }} />
        </div>
    );
};

export default React.memo(FrameEngine2_Element_MediaRive);
