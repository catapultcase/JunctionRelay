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
    SensorTagInput,
    SensorTagOutput,
    SensorTagTarget,
    SensorTagRegistry,
    SensorDebugData,
    SensorTagStats
} from '../types/FrameEngine2_SensorTypes';

/**
 * Parameters for the useSensorTagManager hook
 */
export interface UseSensorTagManagerParams {
    /** Layout configuration containing background settings and test values */
    layout: FrameLayoutConfig;

    /** Array of elements placed on the canvas */
    elements: PlacedElement[];

    /** Whether the sensor tag manager is enabled (default: true) */
    enabled?: boolean;
}

/**
 * Return value from the useSensorTagManager hook
 */
export interface UseSensorTagManagerResult {
    /** Debug data for the debug panel */
    debugData: SensorDebugData;

    /** Resolved sensor values (Live > Test hierarchy applied) */
    resolvedValues: Record<string, any>;

    /** Update a sensor tag value */
    updateSensor: (tag: string, value: any) => void;

    /** Clear a specific sensor tag */
    clearSensor: (tag: string) => void;

    /** Clear all sensor tags */
    clearAll: () => void;

    /** Manually refresh the scan (useful for debugging) */
    refreshScan: () => void;
}

/**
 * Hook that manages sensor tag data flow through the FrameEngine2 system.
 *
 * Responsibilities:
 * 1. Scans layout and elements for sensor tag usage
 * 2. Builds registry of inputs (data coming in) and outputs (where it goes)
 * 3. Processes sensorTestValues to populate test data
 * 4. Tracks update rates
 * 5. Provides debug data for visualization
 *
 * @param params - Hook parameters
 * @returns Sensor tag manager interface
 */
export function useSensorTagManager(params: UseSensorTagManagerParams): UseSensorTagManagerResult {
    const { layout, elements, enabled = true } = params;

    // Registry state
    const [registry, setRegistry] = useState<SensorTagRegistry>({
        inputs: new Map(),
        outputs: new Map()
    });

    // Update rate tracking
    const [updateRate, setUpdateRate] = useState<number>(0);
    const updateCounts = useRef<Map<string, number>>(new Map());
    const lastRateCheck = useRef<number>(Date.now());

    // Scan counter to force re-scan when needed
    const [scanVersion, setScanVersion] = useState<number>(0);

    /**
     * Scan the layout and elements for sensor tag usage and build the outputs registry
     */
    const scanForSensorTags = useCallback(() => {
        if (!enabled) return;

        const newOutputs = new Map<string, SensorTagOutput>();

        /**
         * Helper to add an output target
         */
        const addTarget = (tag: string, target: SensorTagTarget) => {
            if (!newOutputs.has(tag)) {
                newOutputs.set(tag, { tag, targets: [] });
            }
            newOutputs.get(tag)!.targets.push(target);
        };

        // Scan elements for sensor tags
        elements.forEach(element => {
            // Type guard: Check for direct sensorTag property (sensor and gauge elements)
            if ((element.type === 'sensor' || element.type === 'gauge') && element.properties.sensorTag) {
                const tag = element.properties.sensorTag;
                addTarget(tag, {
                    type: 'element-property',
                    elementId: element.id,
                    elementType: element.type,
                    propertyPath: 'sensorTag',
                    value: undefined
                });
            }

            // Scan media-rive elements for Rive inputs/bindings
            if (element.type === 'media-rive') {
                // Scan Rive inputs
                if (element.properties.riveInputs) {
                    Object.keys(element.properties.riveInputs).forEach(inputName => {
                        addTarget(inputName, {
                            type: 'element-rive-input',
                            elementId: element.id,
                            elementType: element.type,
                            propertyPath: `riveInputs.${inputName}`,
                            value: undefined
                        });
                    });
                }

                // Scan Rive bindings
                if (element.properties.riveBindings) {
                    Object.keys(element.properties.riveBindings).forEach(bindingName => {
                        addTarget(bindingName, {
                            type: 'element-rive-binding',
                            elementId: element.id,
                            elementType: element.type,
                            propertyPath: `riveBindings.${bindingName}`,
                            value: undefined
                        });
                    });
                }
            }
        });

        // Scan background Rive inputs/bindings
        if (layout.riveInputs) {
            Object.keys(layout.riveInputs).forEach(inputName => {
                addTarget(inputName, {
                    type: 'background-rive-input',
                    propertyPath: `riveInputs.${inputName}`,
                    value: undefined
                });
            });
        }

        if (layout.riveBindings) {
            Object.keys(layout.riveBindings).forEach(bindingName => {
                addTarget(bindingName, {
                    type: 'background-rive-binding',
                    propertyPath: `riveBindings.${bindingName}`,
                    value: undefined
                });
            });
        }

        // Update registry with new outputs
        setRegistry(prev => ({
            ...prev,
            outputs: newOutputs
        }));

    }, [layout, elements, enabled]);

    /**
     * Process sensor test values and update inputs
     * Fixed: Use functional setState to avoid stale closure
     * Supports comma-separated tags (e.g., "tag1,tag2") to update multiple tags with the same value
     */
    const processSensorTestValues = useCallback(() => {
        if (!enabled || !layout.sensorTestValues) return;

        setRegistry(prev => {
            const newInputs = new Map(prev.inputs); // Use prev.inputs to avoid stale closure
            const processedTags = new Set<string>(); // Track all individual tags we've processed

            Object.entries(layout.sensorTestValues || {}).forEach(([tag, value]) => {
                const now = Date.now();

                // Handle comma-separated tags - split and update each individual tag
                const tags = tag.includes(',')
                    ? tag.split(',').map(t => t.trim()).filter(t => t.length > 0)
                    : [tag];

                tags.forEach(individualTag => {
                    const hasTarget = prev.outputs.has(individualTag); // Use prev.outputs
                    processedTags.add(individualTag);

                    if (newInputs.has(individualTag)) {
                        // Update existing input
                        const existing = newInputs.get(individualTag)!;
                        newInputs.set(individualTag, {
                            ...existing,
                            value,
                            lastUpdate: now,
                            updateCount: existing.updateCount + 1,
                            hasTarget,
                            source: 'test'
                        });

                        // Track update for rate calculation
                        updateCounts.current.set(individualTag, (updateCounts.current.get(individualTag) || 0) + 1);
                    } else {
                        // Create new input
                        newInputs.set(individualTag, {
                            tag: individualTag,
                            value,
                            lastUpdate: now,
                            updateCount: 1,
                            hasTarget,
                            source: 'test'
                        });

                        // Track update for rate calculation
                        updateCounts.current.set(individualTag, 1);
                    }
                });
            });

            // Remove inputs that are no longer in sensorTestValues (check against processed individual tags)
            Array.from(newInputs.keys()).forEach(tag => {
                if (!processedTags.has(tag)) {
                    newInputs.delete(tag);
                    updateCounts.current.delete(tag);
                }
            });

            // BUG FIX: Also remove inputs whose sensor tags no longer have any output targets
            // This happens when elements are deleted but their test values remain in layout.sensorTestValues
            Array.from(newInputs.keys()).forEach(tag => {
                if (!prev.outputs.has(tag)) {
                    newInputs.delete(tag);
                    updateCounts.current.delete(tag);
                }
            });

            return {
                ...prev,
                inputs: newInputs
            };
        });

    }, [layout.sensorTestValues, enabled]);

    /**
     * Scan when layout or elements change
     */
    useEffect(() => {
        scanForSensorTags();
    }, [scanForSensorTags, scanVersion]);

    /**
     * Process test values when they change or outputs change
     */
    useEffect(() => {
        processSensorTestValues();
    }, [processSensorTestValues]);

    /**
     * Update rate tracking - calculate updates/second
     */
    useEffect(() => {
        if (!enabled) return;

        const interval = setInterval(() => {
            const now = Date.now();
            const elapsed = (now - lastRateCheck.current) / 1000;

            if (elapsed > 0) {
                const totalUpdates = Array.from(updateCounts.current.values())
                    .reduce((sum, count) => sum + count, 0);

                setUpdateRate(totalUpdates / elapsed);

                // Reset counters
                updateCounts.current.clear();
                lastRateCheck.current = now;
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [enabled]);

    /**
     * Update a sensor tag value manually
     * Fixed: Use functional setState to avoid stale closure
     * Supports comma-separated tags (e.g., "tag1,tag2") to update multiple tags with the same value
     */
    const updateSensor = useCallback((tag: string, value: any) => {
        const now = Date.now();

        // Handle comma-separated tags - split and update each individual tag
        const tags = tag.includes(',')
            ? tag.split(',').map(t => t.trim()).filter(t => t.length > 0)
            : [tag];

        setRegistry(prev => {
            const newInputs = new Map(prev.inputs);

            // Update each individual tag with the same value
            tags.forEach(individualTag => {
                const hasTarget = prev.outputs.has(individualTag);

                if (newInputs.has(individualTag)) {
                    const existing = newInputs.get(individualTag)!;
                    newInputs.set(individualTag, {
                        ...existing,
                        value,
                        lastUpdate: now,
                        updateCount: existing.updateCount + 1,
                        hasTarget,
                        source: 'live'
                    });
                } else {
                    newInputs.set(individualTag, {
                        tag: individualTag,
                        value,
                        lastUpdate: now,
                        updateCount: 1,
                        hasTarget,
                        source: 'live'
                    });
                }

                // Track update for rate calculation
                updateCounts.current.set(individualTag, (updateCounts.current.get(individualTag) || 0) + 1);
            });

            return {
                ...prev,
                inputs: newInputs
            };
        });
    }, []);

    /**
     * Clear a specific sensor tag
     * Supports comma-separated tags (e.g., "tag1,tag2") to clear multiple tags
     */
    const clearSensor = useCallback((tag: string) => {
        // Handle comma-separated tags - split and clear each individual tag
        const tags = tag.includes(',')
            ? tag.split(',').map(t => t.trim()).filter(t => t.length > 0)
            : [tag];

        setRegistry(prev => {
            const newInputs = new Map(prev.inputs);

            tags.forEach(individualTag => {
                newInputs.delete(individualTag);
                updateCounts.current.delete(individualTag);
            });

            return {
                ...prev,
                inputs: newInputs
            };
        });
    }, []);

    /**
     * Clear all sensor tags
     */
    const clearAll = useCallback(() => {
        setRegistry(prev => ({
            ...prev,
            inputs: new Map()
        }));
        updateCounts.current.clear();
    }, []);

    /**
     * Manually refresh the scan
     */
    const refreshScan = useCallback(() => {
        setScanVersion(v => v + 1);
    }, []);

    /**
     * Resolve sensor values: Live data > Test values
     * This is the SINGLE SOURCE OF TRUTH for data hierarchy
     */
    const resolvedValues = useMemo(() => {
    const resolved: Record<string, any> = {};

    registry.inputs.forEach((input, tag) => {
        if (input.value != null) {
            resolved[tag] = input.value;
            // DEBUG
            // console.log(`[ResolvedValues] ${tag} = ${input.value} (source: ${input.source})`);
        } else if (layout.sensorTestValues?.[tag] !== undefined) {
            resolved[tag] = layout.sensorTestValues[tag];
            // DEBUG
            // console.log(`[ResolvedValues] ${tag} = ${layout.sensorTestValues[tag]} (source: test)`);
        }
    });

    // DEBUG SUMMARY
    // console.log('[ResolvedValues] Total resolved:', Object.keys(resolved).length, resolved);

    return resolved;
}, [registry.inputs, layout.sensorTestValues]);

    /**
     * Compute debug data from registry
     */
    const debugData: SensorDebugData = useMemo(() => {
        // Convert inputs map to sorted array
        const inputs = Array.from(registry.inputs.values())
            .sort((a, b) => a.tag.localeCompare(b.tag));

        // Convert outputs map to sorted array
        const outputs = Array.from(registry.outputs.values())
            .sort((a, b) => a.tag.localeCompare(b.tag));

        // Calculate stats
        const stats: SensorTagStats = {
            activeTags: registry.inputs.size,
            totalBindings: outputs.reduce((sum, output) => sum + output.targets.length, 0),
            orphanedTags: inputs.filter(input => !input.hasTarget).length,
            updateRate: Math.round(updateRate * 10) / 10 // Round to 1 decimal
        };

        return {
            inputs,
            outputs,
            stats
        };
    }, [registry, updateRate]);

    return {
        debugData,
        resolvedValues,
        updateSensor,
        clearSensor,
        clearAll,
        refreshScan
    };
}
