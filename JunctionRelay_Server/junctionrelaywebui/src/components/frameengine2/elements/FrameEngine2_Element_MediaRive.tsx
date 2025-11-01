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

import React, { useMemo, useEffect, useState } from 'react';
import { useRive, UseRiveParameters } from '@rive-app/react-canvas';
import type {
    DiscoveredRiveStateMachine,
    DiscoveredRiveDataBinding
} from '../types/FrameEngine2_ElementTypes';
import {
    discoverRiveInputsAndBindings,
    applyRiveInputs,
    applyRiveBindings
} from '../FrameEngine2_RiveDiscovery';

/**
 * Props for the MediaRive element component
 */
interface MediaRiveElementProps {
    /** Element ID (for discovery callback) */
    elementId: string;

    /** Element properties */
    properties: {
        filename?: string | null;
        autoplay?: boolean;
        riveStateMachine?: string;
        riveInputs?: Record<string, any>;
        riveBindings?: Record<string, any>;
        backgroundColor?: string;
        [key: string]: any;
    };

    /** Element dimensions */
    width: number;
    height: number;

    /** Rive discovery callback */
    onRiveDiscovery?: (elementId: string, machines: DiscoveredRiveStateMachine[], bindings: DiscoveredRiveDataBinding[]) => void;
}

/**
 * MediaRive Element - Displays uploaded Rive animation assets
 *
 * Features:
 * - Auto-discovery of state machine inputs and view model data bindings
 * - Applies riveInputs and riveBindings from element properties
 * - Supports state machine selection
 *
 * Performance optimizations:
 * - Memoized Rive parameters
 * - Key-based remounting on file change
 * - Clean placeholder rendering
 * - Async discovery with retry logic
 */
const FrameEngine2_Element_MediaRive: React.FC<MediaRiveElementProps> = ({
    elementId,
    properties,
    width,
    height,
    onRiveDiscovery
}) => {
    const {
        filename = null,
        autoplay = true,
        backgroundColor = 'transparent',
        riveStateMachine,
        riveInputs,
        riveBindings
    } = properties;

    const [discoveredMachines, setDiscoveredMachines] = useState<DiscoveredRiveStateMachine[]>([]);
    const [discoveredBindings, setDiscoveredBindings] = useState<DiscoveredRiveDataBinding[]>([]);

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
     * Includes autoBind for View Model data bindings, state machine selection, and automatic event handling
     */
    const riveParams = useMemo<UseRiveParameters | null>(() => {
        if (!resolvedRiveUrl) return null;

        return {
            src: resolvedRiveUrl,
            autoplay,
            autoBind: true, // Required for View Model data bindings
            stateMachines: riveStateMachine ? [riveStateMachine] : undefined,
            automaticallyHandleEvents: true
        };
    }, [resolvedRiveUrl, autoplay, riveStateMachine]);

    /**
     * Rive hook - only initialized when needed
     * Returns rive instance for discovery and binding application
     */
    const { RiveComponent, rive } = useRive(riveParams || {
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

    /**
     * Discovery effect - triggers when Rive file changes
     * Discovers state machine inputs and view model data bindings
     */
    useEffect(() => {
        if (!rive || !resolvedRiveUrl) {
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
                        onRiveDiscovery(elementId, machines, bindings);
                    }
                })
                .catch((error) => {
                    console.error(`[FrameEngine2_Element_MediaRive] Rive discovery failed for element ${elementId}:`, error);
                });
        }, 100);

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
        };
    }, [rive, resolvedRiveUrl, elementId, onRiveDiscovery]);

    /**
     * Apply state machine inputs when riveInputs changes
     */
    useEffect(() => {
        if (!rive || !riveInputs || discoveredMachines.length === 0) return;

        applyRiveInputs(discoveredMachines, riveInputs);
    }, [rive, riveInputs, discoveredMachines]);

    /**
     * Apply data bindings when riveBindings changes
     */
    useEffect(() => {
        if (!rive || !riveBindings || discoveredBindings.length === 0) return;

        applyRiveBindings(discoveredBindings, riveBindings);
    }, [rive, riveBindings, discoveredBindings]);

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
