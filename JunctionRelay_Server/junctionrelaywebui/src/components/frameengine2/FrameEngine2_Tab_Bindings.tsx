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

import React, { useState, useCallback } from 'react';
import { Box, Typography, ToggleButtonGroup, ToggleButton } from '@mui/material';
import ViewListIcon from '@mui/icons-material/ViewList';
import LabelIcon from '@mui/icons-material/Label';
import type { PlacedElement, FrameLayoutConfig } from './types/FrameEngine2_LayoutTypes';
import type {
    DiscoveredRiveStateMachine,
    DiscoveredRiveDataBinding
} from './types/FrameEngine2_ElementTypes';
import type { ViewMode } from './bindings/FrameEngine2_Bindings_Types';
import AssetView from './bindings/FrameEngine2_Bindings_AssetView';
import SensorTagView from './bindings/FrameEngine2_Bindings_SensorTagView';

interface FrameEngine2_Tab_BindingsProps {
    /** All elements on canvas */
    elements: PlacedElement[];

    /** Current layout configuration (contains sensorTestValues) */
    layout: FrameLayoutConfig;

    /** Callback to update layout configuration (for sensorTestValues) */
    onLayoutUpdate: (updates: Partial<FrameLayoutConfig>) => void;

    /** Included sensor tags for Value Generator (managed in parent) */
    includedSensorTags: Set<string>;

    /** Callback to toggle sensor tag inclusion (managed in parent) */
    onToggleIncludeSensorTag: (sensorTag: string) => void;

    /** Background Rive discoveries */
    backgroundRiveMachines?: DiscoveredRiveStateMachine[];
    backgroundRiveBindings?: DiscoveredRiveDataBinding[];

    /** Element Rive discoveries */
    elementRiveDiscoveries?: Map<string, {
        machines: DiscoveredRiveStateMachine[];
        bindings: DiscoveredRiveDataBinding[];
    }>;

    /** Callback to update element properties (for Rive inputs) */
    onUpdateElement?: (elementId: string, updates: Partial<PlacedElement>) => void;
}

/**
 * Bindings tab content for left sidebar
 * Shows SensorTag bindings with test value inputs and Value Generator controls
 * Two views: Asset View (grouped by element) and SensorTag View (deduplicated with include toggles)
 *
 * **Following FRAMEENGINE2_ARCHITECTURE_GUIDELINES.md:**
 * - Section 4.1: Component <500 lines (refactored from 961 lines to ~250 lines)
 * - Section 2.2: Stable callback references with useCallback
 * - Section 7.3: Document optimization decisions
 *
 * **Architecture:**
 * - Main orchestrator component that delegates rendering to specialized views
 * - All handlers remain in this component for access to parent callbacks
 * - View components are presentational and receive data/handlers as props
 */
const FrameEngine2_Tab_Bindings: React.FC<FrameEngine2_Tab_BindingsProps> = ({
    elements,
    layout,
    onLayoutUpdate,
    includedSensorTags,
    onToggleIncludeSensorTag,
    backgroundRiveMachines = [],
    backgroundRiveBindings = [],
    elementRiveDiscoveries = new Map(),
    onUpdateElement
}) => {
    const [viewMode, setViewMode] = useState<ViewMode>('sensortag');

    /**
     * Handle background Rive input change
     * @param value - Rive input value (legitimately `any` - can be number, boolean, string, or trigger)
     */
    const handleBackgroundRiveInputChange = useCallback((inputName: string, value: any) => {
        const riveInputs = { ...(layout.riveInputs || {}) };
        riveInputs[inputName] = value;
        onLayoutUpdate({ riveInputs });
    }, [layout.riveInputs, onLayoutUpdate]);

    /**
     * Handle background Rive binding change
     * @param value - Rive binding value (legitimately `any` - can be number, string, boolean, color, etc.)
     */
    const handleBackgroundRiveBindingChange = useCallback((bindingName: string, value: any) => {
        const riveBindings = { ...(layout.riveBindings || {}) };
        riveBindings[bindingName] = value;
        onLayoutUpdate({ riveBindings });
    }, [layout.riveBindings, onLayoutUpdate]);

    /**
     * Handle element Rive input change
     * @param value - Rive input value (legitimately `any` - can be number, boolean, string, or trigger)
     */
    const handleElementRiveInputChange = useCallback((elementId: string, inputName: string, value: any) => {
        if (!onUpdateElement) return;

        const element = elements.find(el => el.id === elementId);
        if (!element || element.type !== 'media-rive') return;

        const riveInputs = { ...(element.properties.riveInputs || {}) };
        riveInputs[inputName] = value;

        onUpdateElement(elementId, {
            properties: {
                ...element.properties,
                riveInputs
            }
        });
    }, [elements, onUpdateElement]);

    /**
     * Handle element Rive binding change
     * @param value - Rive binding value (legitimately `any` - can be number, string, boolean, color, etc.)
     */
    const handleElementRiveBindingChange = useCallback((elementId: string, bindingName: string, value: any) => {
        if (!onUpdateElement) return;

        const element = elements.find(el => el.id === elementId);
        if (!element || element.type !== 'media-rive') return;

        const riveBindings = { ...(element.properties.riveBindings || {}) };
        riveBindings[bindingName] = value;

        onUpdateElement(elementId, {
            properties: {
                ...element.properties,
                riveBindings
            }
        });
    }, [elements, onUpdateElement]);

    /**
     * Update test value for a sensor tag
     * Checks if it's a Rive input/binding and updates accordingly
     */
    const handleTestValueChange = useCallback((sensorTag: string, value: string) => {
        // Parse value once
        const numValue = parseFloat(value);
        const parsedValue = value.trim() === '' ? undefined : (isNaN(numValue) ? value : numValue);

        // Check if this is a background Rive input
        const isBackgroundRiveInput = backgroundRiveMachines.some(machine =>
            machine.inputs.some(input => input.name === sensorTag)
        );
        if (isBackgroundRiveInput) {
            handleBackgroundRiveInputChange(sensorTag, parsedValue);
            return;
        }

        // Check if this is a background Rive binding
        const isBackgroundRiveBinding = backgroundRiveBindings.some(binding => binding.name === sensorTag);
        if (isBackgroundRiveBinding) {
            handleBackgroundRiveBindingChange(sensorTag, parsedValue);
            return;
        }

        // Check if this is an element Rive input or binding
        for (const [elementId, discovery] of elementRiveDiscoveries.entries()) {
            const isElementRiveInput = discovery.machines.some((machine: DiscoveredRiveStateMachine) =>
                machine.inputs.some(input => input.name === sensorTag)
            );
            if (isElementRiveInput) {
                handleElementRiveInputChange(elementId, sensorTag, parsedValue);
                return;
            }

            const isElementRiveBinding = discovery.bindings.some((binding: DiscoveredRiveDataBinding) => binding.name === sensorTag);
            if (isElementRiveBinding) {
                handleElementRiveBindingChange(elementId, sensorTag, parsedValue);
                return;
            }
        }

        // Fall back to regular sensor test value update
        const sensorTestValues = { ...layout.sensorTestValues };
        const existing = sensorTestValues[sensorTag] || {};

        if (value.trim() === '' && !existing.label && !existing.unit) {
            // Remove entirely if all fields empty
            delete sensorTestValues[sensorTag];
        } else {
            sensorTestValues[sensorTag] = {
                ...existing,
                value: parsedValue
            };
        }

        onLayoutUpdate({ sensorTestValues });
    }, [layout.sensorTestValues, onLayoutUpdate, backgroundRiveMachines, backgroundRiveBindings, elementRiveDiscoveries, handleBackgroundRiveInputChange, handleBackgroundRiveBindingChange, handleElementRiveInputChange, handleElementRiveBindingChange]);

    /**
     * Update test label for a sensor tag
     */
    const handleTestLabelChange = useCallback((sensorTag: string, label: string) => {
        const sensorTestValues = { ...layout.sensorTestValues };
        const existing = sensorTestValues[sensorTag] || {};

        if (label.trim() === '' && !existing.value && !existing.unit) {
            // Remove entirely if all fields empty
            delete sensorTestValues[sensorTag];
        } else {
            sensorTestValues[sensorTag] = {
                ...existing,
                label: label.trim() || undefined
            };
        }

        onLayoutUpdate({ sensorTestValues });
    }, [layout.sensorTestValues, onLayoutUpdate]);

    /**
     * Update test unit for a sensor tag
     */
    const handleTestUnitChange = useCallback((sensorTag: string, unit: string) => {
        const sensorTestValues = { ...layout.sensorTestValues };
        const existing = sensorTestValues[sensorTag] || {};

        if (unit.trim() === '' && !existing.value && !existing.label) {
            // Remove entirely if all fields empty
            delete sensorTestValues[sensorTag];
        } else {
            sensorTestValues[sensorTag] = {
                ...existing,
                unit: unit.trim() || undefined
            };
        }

        onLayoutUpdate({ sensorTestValues });
    }, [layout.sensorTestValues, onLayoutUpdate]);

    /**
     * Handle test bindings enabled change
     * OPTIMIZATION: Memoized callback to prevent inline object creation
     */
    const handleTestBindingsEnabledChange = useCallback((enabled: boolean) => {
        onLayoutUpdate({
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
                testBindingsInterval: layout.canvasSettings?.testBindingsInterval ?? 5000,
                testBindingsEnabled: enabled
            }
        });
    }, [layout.canvasSettings, onLayoutUpdate]);

    /**
     * Handle test bindings interval change
     * OPTIMIZATION: Memoized callback to prevent inline object creation
     */
    const handleTestBindingsIntervalChange = useCallback((interval: number) => {
        onLayoutUpdate({
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
                testBindingsInterval: interval
            }
        });
    }, [layout.canvasSettings, onLayoutUpdate]);

    const handleViewModeChange = (_event: React.MouseEvent<HTMLElement>, newMode: ViewMode | null) => {
        if (newMode !== null) {
            setViewMode(newMode);
        }
    };

    return (
        <Box
            sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column'
            }}
        >
            {/* View Toggle Buttons (Pinned at top) */}
            <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider' }}>
                <ToggleButtonGroup
                    value={viewMode}
                    exclusive
                    onChange={handleViewModeChange}
                    fullWidth
                    size="small"
                    sx={{
                        '& .MuiToggleButton-root': {
                            '&.Mui-selected': {
                                bgcolor: 'primary.main',
                                color: 'primary.contrastText',
                                '&:hover': {
                                    bgcolor: 'primary.dark'
                                }
                            }
                        }
                    }}
                >
                    <ToggleButton value="asset">
                        <ViewListIcon sx={{ fontSize: 16, mr: 0.5 }} />
                        <Typography variant="caption">Asset View</Typography>
                    </ToggleButton>
                    <ToggleButton value="sensortag">
                        <LabelIcon sx={{ fontSize: 16, mr: 0.5 }} />
                        <Typography variant="caption">SensorTag View</Typography>
                    </ToggleButton>
                </ToggleButtonGroup>
            </Box>

            {/* Scrollable Content */}
            <Box sx={{ flex: 1, overflowY: 'auto', p: 1 }}>
                {viewMode === 'asset' && (
                    <AssetView
                        elements={elements}
                        backgroundRiveMachines={backgroundRiveMachines}
                        backgroundRiveBindings={backgroundRiveBindings}
                        elementRiveDiscoveries={elementRiveDiscoveries}
                    />
                )}

                {viewMode === 'sensortag' && (
                    <SensorTagView
                        elements={elements}
                        layout={layout}
                        includedSensorTags={includedSensorTags}
                        backgroundRiveMachines={backgroundRiveMachines}
                        backgroundRiveBindings={backgroundRiveBindings}
                        elementRiveDiscoveries={elementRiveDiscoveries}
                        onToggleIncludeSensorTag={onToggleIncludeSensorTag}
                        onTestValueChange={handleTestValueChange}
                        onTestLabelChange={handleTestLabelChange}
                        onTestUnitChange={handleTestUnitChange}
                        onTestBindingsEnabledChange={handleTestBindingsEnabledChange}
                        onTestBindingsIntervalChange={handleTestBindingsIntervalChange}
                    />
                )}
            </Box>
        </Box>
    );
};

export default FrameEngine2_Tab_Bindings;
