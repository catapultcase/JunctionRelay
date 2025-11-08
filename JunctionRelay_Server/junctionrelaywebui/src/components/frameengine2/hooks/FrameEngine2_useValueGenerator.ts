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

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { FrameLayoutConfig, PlacedElement } from '../types/FrameEngine2_LayoutTypes';
import type {
    DiscoveredRiveStateMachine,
    DiscoveredRiveDataBinding
} from '../types/FrameEngine2_ElementTypes';

/**
 * Parameters for useValueGenerator hook
 */
export interface UseValueGeneratorParams {
    /** Current layout configuration */
    layout: FrameLayoutConfig | null;

    /** Elements on canvas */
    elements: PlacedElement[];

    /** Callback to update layout (for saving test values) */
    onLayoutUpdate: (updates: Partial<FrameLayoutConfig>) => void;

    /** Background Rive state machine discoveries */
    backgroundRiveMachines?: DiscoveredRiveStateMachine[];

    /** Background Rive data binding discoveries */
    backgroundRiveBindings?: DiscoveredRiveDataBinding[];

    /** Element Rive discoveries */
    elementRiveDiscoveries?: Map<string, {
        machines: DiscoveredRiveStateMachine[];
        bindings: DiscoveredRiveDataBinding[];
    }>;
}

/**
 * Return value from useValueGenerator hook
 */
export interface UseValueGeneratorResult {
    /** Set of sensor tags included in generation */
    includedSensorTags: Set<string>;

    /** Callback to toggle sensor tag inclusion */
    handleToggleIncludeSensorTag: (sensorTag: string) => void;
}

/**
 * Custom hook for managing the Value Generator feature.
 *
 * Responsibilities:
 * - Extracts sensor tags from elements
 * - Manages which tags are included in generation
 * - Auto-generates random test values at specified interval
 * - Runs independently of which tab is active
 *
 * PERFORMANCE OPTIMIZATIONS:
 * - Uses refs to avoid stale closures in intervals
 * - Separates immediate generation from interval management
 * - Only restarts interval when enable state or interval value changes
 * - Optimizes Set updates to only create new Set when tags actually change
 *
 * @param params - Hook parameters
 * @returns Value generator interface
 */
export function useValueGenerator(params: UseValueGeneratorParams): UseValueGeneratorResult {
    const { layout, elements, onLayoutUpdate, backgroundRiveMachines = [], backgroundRiveBindings = [], elementRiveDiscoveries = new Map() } = params;

    // State for which sensor tags are included in generation
    // Initialize from layout.canvasSettings.includedSensorTags if available
    const [includedSensorTags, setIncludedSensorTags] = useState<Set<string>>(() => {
        const saved = layout?.canvasSettings?.includedSensorTags;
        return saved ? new Set(saved) : new Set();
    });

    // Refs for interval management (prevents stale closures)
    const generatorIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const includedSensorTagsRef = useRef<Set<string>>(new Set());
    const allSensorTagsRef = useRef<string[]>([]);
    const layoutRef = useRef<FrameLayoutConfig | null>(null);
    const onLayoutUpdateRef = useRef<(updates: Partial<FrameLayoutConfig>) => void>(onLayoutUpdate);
    const hasSyncedRef = useRef<boolean>(false); // Track if we've synced from saved preferences

    // Refs for Rive discoveries (for type detection)
    const backgroundRiveMachinesRef = useRef<DiscoveredRiveStateMachine[]>([]);
    const backgroundRiveBindingsRef = useRef<DiscoveredRiveDataBinding[]>([]);
    const elementRiveDiscoveriesRef = useRef<Map<string, { machines: DiscoveredRiveStateMachine[]; bindings: DiscoveredRiveDataBinding[] }>>(new Map());

    /**
     * Extract all SensorTags from elements, Rive inputs, and Rive data bindings
     * OPTIMIZATION: Memoized to prevent recalculation on every render
     */
    const allSensorTags = useMemo(() => {
        const tags = new Set<string>();

        // Extract from sensor and gauge elements
        elements.forEach(element => {
            // Type guard: only sensor and gauge elements have sensorTag
            if ((element.type === 'sensor' || element.type === 'gauge') && element.properties.sensorTag) {
                tags.add(element.properties.sensorTag);
            }
        });

        // Extract from background Rive state machine inputs
        backgroundRiveMachines.forEach(machine => {
            machine.inputs.forEach(input => {
                tags.add(input.name);
            });
        });

        // Extract from background Rive data bindings
        backgroundRiveBindings.forEach(binding => {
            tags.add(binding.name);
        });

        // Extract from element Rive inputs and data bindings
        elementRiveDiscoveries.forEach((discovery) => {
            discovery.machines.forEach((machine: DiscoveredRiveStateMachine) => {
                machine.inputs.forEach(input => {
                    tags.add(input.name);
                });
            });
            discovery.bindings.forEach((binding: DiscoveredRiveDataBinding) => {
                tags.add(binding.name);
            });
        });

        return Array.from(tags);
    }, [elements, backgroundRiveMachines, backgroundRiveBindings, elementRiveDiscoveries]);

    /**
     * Keep refs in sync with state/props
     * OPTIMIZATION: Refs prevent stale closures in interval callbacks
     */
    useEffect(() => {
        includedSensorTagsRef.current = includedSensorTags;
    }, [includedSensorTags]);

    useEffect(() => {
        allSensorTagsRef.current = allSensorTags;
    }, [allSensorTags]);

    useEffect(() => {
        layoutRef.current = layout;
    }, [layout]);

    useEffect(() => {
        onLayoutUpdateRef.current = onLayoutUpdate;
    }, [onLayoutUpdate]);

    useEffect(() => {
        backgroundRiveMachinesRef.current = backgroundRiveMachines;
    }, [backgroundRiveMachines]);

    useEffect(() => {
        backgroundRiveBindingsRef.current = backgroundRiveBindings;
    }, [backgroundRiveBindings]);

    useEffect(() => {
        elementRiveDiscoveriesRef.current = elementRiveDiscoveries;
    }, [elementRiveDiscoveries]);

    /**
     * Map Rive binding types to UI input types
     * DiscoveredRiveDataBinding has additional types (image, enum, list) that don't map to input controls
     */
    const mapBindingTypeToInputType = useCallback((bindingType: string): 'number' | 'boolean' | 'color' | 'trigger' | 'string' => {
        switch (bindingType) {
            case 'color':
                return 'color';
            case 'boolean':
                return 'boolean';
            case 'number':
                return 'number';
            case 'trigger':
                return 'trigger';
            // For image, enum, list, unknown - treat as string
            default:
                return 'string';
        }
    }, []);

    /**
     * Get the input type for a sensor tag by checking Rive discoveries
     * This is used to generate appropriate random values for each type
     */
    const getInputType = useCallback((sensorTag: string): 'number' | 'boolean' | 'color' | 'trigger' | 'string' => {
        // Check background Rive inputs
        for (const machine of backgroundRiveMachinesRef.current) {
            const input = machine.inputs.find(i => i.name === sensorTag);
            if (input) {
                return input.type === 'unknown' ? 'number' : input.type;
            }
        }

        // Check background Rive bindings
        const bgBinding = backgroundRiveBindingsRef.current.find(b => b.name === sensorTag);
        if (bgBinding) {
            return mapBindingTypeToInputType(bgBinding.type);
        }

        // Check element Rive inputs/bindings
        for (const [elementId, discovery] of elementRiveDiscoveriesRef.current.entries()) {
            for (const machine of discovery.machines) {
                const input = machine.inputs.find(i => i.name === sensorTag);
                if (input) {
                    return input.type === 'unknown' ? 'number' : input.type;
                }
            }
            const binding = discovery.bindings.find(b => b.name === sensorTag);
            if (binding) {
                return mapBindingTypeToInputType(binding.type);
            }
        }

        // Default to number for regular sensor tags
        return 'number';
    }, [mapBindingTypeToInputType]);

    /**
     * Sync state with saved preferences ONCE on mount
     * Prevents infinite loop with save effect
     * hasSyncedRef ensures this only runs once even if dependencies change
     */
    useEffect(() => {
        // Only sync once when layout loads
        if (hasSyncedRef.current || !layout) return;

        const savedTags = layout.canvasSettings?.includedSensorTags;

        if (savedTags === undefined) {
            // No saved preferences - auto-include all tags (first time setup)
            setIncludedSensorTags(prev => {
                const hasNew = allSensorTags.some(tag => !prev.has(tag));
                if (!hasNew) return prev;

                const newSet = new Set(prev);
                allSensorTags.forEach(tag => newSet.add(tag));
                return newSet;
            });
        } else {
            // Saved preferences exist - sync state to match them
            setIncludedSensorTags(new Set(savedTags));
        }

        hasSyncedRef.current = true;
    }, [layout, allSensorTags]); // Include all dependencies - hasSyncedRef prevents re-runs

    /**
     * Generate random test values for included sensor tags
     * MEMOIZED: Stable reference since it only uses refs
     * OPTIMIZATION: Uses refs to access latest values without causing effect restarts
     * TYPE-AWARE: Generates appropriate values based on input type (color, boolean, number, etc.)
     */
    const generateRandomValues = useCallback(() => {
        const currentLayout = layoutRef.current;
        if (!currentLayout) return;

        const currentTags = allSensorTagsRef.current;
        if (currentTags.length === 0) return;

        const newTestValues = { ...currentLayout.sensorTestValues };
        currentTags.forEach(tag => {
            if (includedSensorTagsRef.current.has(tag)) {
                const existing = newTestValues[tag] || {};

                // Detect input type and generate appropriate value
                const inputType = getInputType(tag);
                let generatedValue: string | number | boolean;

                if (inputType === 'color') {
                    // Generate random hex color
                    const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
                    generatedValue = randomColor;
                } else if (inputType === 'boolean') {
                    // Generate random boolean
                    generatedValue = Math.random() > 0.5;
                } else if (inputType === 'trigger') {
                    // Skip triggers - they are event-based, not value-based
                    return;
                } else {
                    // Default: number 0-100
                    generatedValue = Math.floor(Math.random() * 101);
                }

                newTestValues[tag] = {
                    ...existing,
                    value: generatedValue
                };
            }
        });

        onLayoutUpdateRef.current({ sensorTestValues: newTestValues });
    }, [getInputType]); // Include getInputType dependency

    /**
     * Run Value Generator immediately when enabled
     * OPTIMIZATION: Separate from interval management to prevent restart
     */
    useEffect(() => {
        if (layout?.canvasSettings?.testBindingsEnabled) {
            generateRandomValues();
        }
    }, [layout?.canvasSettings?.testBindingsEnabled, generateRandomValues]);

    /**
     * Value Generator interval management
     * OPTIMIZATION: Stable dependencies - only restarts when enable or interval changes
     * Uses refs to access latest values, preventing interval restart on every layout update
     */
    useEffect(() => {
        const enabled = layout?.canvasSettings?.testBindingsEnabled ?? false;
        const interval = layout?.canvasSettings?.testBindingsInterval ?? 5000;

        if (!enabled) {
            if (generatorIntervalRef.current) {
                clearInterval(generatorIntervalRef.current);
                generatorIntervalRef.current = null;
            }
            return;
        }

        // Set up interval
        generatorIntervalRef.current = setInterval(generateRandomValues, interval);

        // Cleanup
        return () => {
            if (generatorIntervalRef.current) {
                clearInterval(generatorIntervalRef.current);
                generatorIntervalRef.current = null;
            }
        };
    }, [layout?.canvasSettings?.testBindingsEnabled, layout?.canvasSettings?.testBindingsInterval, generateRandomValues]);

    /**
     * Save includedSensorTags to layout when changed
     * Uses onLayoutUpdateRef to avoid unnecessary re-runs when callback changes
     */
    useEffect(() => {
        if (!layout) return;

        const savedTags = layout.canvasSettings?.includedSensorTags || [];
        const currentTags = Array.from(includedSensorTags).sort();
        const savedTagsSorted = [...savedTags].sort();

        // Only update if actually different
        if (JSON.stringify(currentTags) !== JSON.stringify(savedTagsSorted)) {
            onLayoutUpdateRef.current({
                canvasSettings: {
                    ...(layout.canvasSettings || {}),
                    grid: layout.canvasSettings?.grid || {
                        snapToGrid: false,
                        showGrid: false,
                        showOutlines: false,
                        gridSize: 10,
                        gridColor: '#7a7a7a'
                    },
                    elementPadding: layout.canvasSettings?.elementPadding ?? 4,
                    testBindingsEnabled: layout.canvasSettings?.testBindingsEnabled ?? false,
                    testBindingsInterval: layout.canvasSettings?.testBindingsInterval ?? 5000,
                    includedSensorTags: currentTags
                }
            });
        }
    }, [includedSensorTags, layout]); // Removed onLayoutUpdate - using ref instead

    /**
     * Toggle sensor tag inclusion in Value Generator
     * OPTIMIZATION: Memoized to prevent child re-renders
     */
    const handleToggleIncludeSensorTag = useCallback((sensorTag: string) => {
        setIncludedSensorTags(prev => {
            const newSet = new Set(prev);
            if (newSet.has(sensorTag)) {
                newSet.delete(sensorTag);
            } else {
                newSet.add(sensorTag);
            }
            return newSet;
        });
    }, []);

    return {
        includedSensorTags,
        handleToggleIncludeSensorTag
    };
}
