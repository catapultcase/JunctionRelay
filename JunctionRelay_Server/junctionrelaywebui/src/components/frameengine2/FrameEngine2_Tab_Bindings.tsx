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

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Box, Typography, ToggleButtonGroup, ToggleButton, TextField, Paper, Chip, Switch, FormControlLabel, Slider } from '@mui/material';
import ViewListIcon from '@mui/icons-material/ViewList';
import LabelIcon from '@mui/icons-material/Label';
import type { PlacedElement, FrameLayoutConfig } from './types/FrameEngine2_LayoutTypes';
import type {
    DiscoveredRiveStateMachine,
    DiscoveredRiveDataBinding,
    DiscoveredRiveInput
} from './types/FrameEngine2_ElementTypes';
import { getElementIcon, getElementDisplayName } from './FrameEngine2_ElementIcons';

/**
 * Type guard for elements with sensorTag property
 */
type ElementWithSensorTag = Extract<PlacedElement, { type: 'sensor' | 'gauge' | 'ecg' }>;

const hasSensorTag = (element: PlacedElement): element is ElementWithSensorTag => {
    return (element.type === 'sensor' || element.type === 'gauge' || element.type === 'ecg') && !!element.properties.sensorTag;
};

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

type ViewMode = 'asset' | 'sensortag';

/**
 * Bindings tab content for left sidebar
 * Shows SensorTag bindings with test value inputs and Value Generator controls
 * Two views: Asset View (grouped by element) and SensorTag View (deduplicated with include toggles)
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
     * Derive values directly from layout.canvasSettings (no local state needed)
     * OPTIMIZATION: Single source of truth, no state sync required
     */
    const testBindingsEnabled = layout.canvasSettings?.testBindingsEnabled ?? false;
    const testBindingsInterval = layout.canvasSettings?.testBindingsInterval ?? 5000;

    /**
     * Extract all SensorTags from elements (deduplicated)
     * Includes Rive inputs and data bindings as sensor tags (no prefix - treated the same)
     */
    const allSensorTags = useMemo(() => {
        const tags = new Set<string>();

        elements.forEach(element => {
            // Check for direct sensorTag property (sensor, gauge, and ecg elements)
            if ((element.type === 'sensor' || element.type === 'gauge' || element.type === 'ecg') && element.properties.sensorTag) {
                tags.add(element.properties.sensorTag);
            }
        });

        // Add background Rive state machine inputs as sensor tags (no prefix)
        backgroundRiveMachines.forEach(machine => {
            machine.inputs.forEach(input => {
                tags.add(input.name);
            });
        });

        // Add background Rive data bindings as sensor tags (no prefix)
        backgroundRiveBindings.forEach(binding => {
            tags.add(binding.name);
        });

        // Add element Rive inputs and bindings as sensor tags (no prefix)
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

        return Array.from(tags).sort();
    }, [elements, backgroundRiveMachines, backgroundRiveBindings, elementRiveDiscoveries]);

    /**
     * Group elements by type for Asset View
     */
    const elementsByType = useMemo(() => {
        const grouped: Record<string, PlacedElement[]> = {};

        elements.forEach(element => {
            const elementType = element.type;
            if (!grouped[elementType]) {
                grouped[elementType] = [];
            }
            grouped[elementType].push(element);
        });

        return grouped;
    }, [elements]);

    /**
     * Get current test value for a sensor tag
     * Checks Rive inputs and bindings first, then falls back to regular test values
     */
    const getTestValue = (sensorTag: string): string => {
        // Check background Rive inputs
        if (layout.riveInputs?.[sensorTag] !== undefined) {
            return String(layout.riveInputs[sensorTag]);
        }

        // Check background Rive bindings
        if (layout.riveBindings?.[sensorTag] !== undefined) {
            return String(layout.riveBindings[sensorTag]);
        }

        // Check element Rive inputs and bindings
        for (const [elementId, discovery] of elementRiveDiscoveries.entries()) {
            const element = elements.find(el => el.id === elementId);
            if (element && element.type === 'media-rive') {
                if (element.properties.riveInputs?.[sensorTag] !== undefined) {
                    return String(element.properties.riveInputs[sensorTag]);
                }
                if (element.properties.riveBindings?.[sensorTag] !== undefined) {
                    return String(element.properties.riveBindings[sensorTag]);
                }
            }
        }

        // Fall back to regular sensor test values
        const testData = layout.sensorTestValues?.[sensorTag];
        if (typeof testData === 'object' && testData !== null) {
            return testData.value !== undefined ? String(testData.value) : '';
        }
        return '';
    };

    /**
     * Get current test label for a sensor tag
     */
    const getTestLabel = (sensorTag: string): string => {
        const testData = layout.sensorTestValues?.[sensorTag];
        if (typeof testData === 'object' && testData !== null) {
            return testData.label || '';
        }
        return '';
    };

    /**
     * Get current test unit for a sensor tag
     */
    const getTestUnit = (sensorTag: string): string => {
        const testData = layout.sensorTestValues?.[sensorTag];
        if (typeof testData === 'object' && testData !== null) {
            return testData.unit || '';
        }
        return '';
    };

    /**
     * Handle background Rive input change
     */
    const handleBackgroundRiveInputChange = useCallback((inputName: string, value: any) => {
        const riveInputs = { ...(layout.riveInputs || {}) };
        riveInputs[inputName] = value;
        onLayoutUpdate({ riveInputs });
    }, [layout.riveInputs, onLayoutUpdate]);

    /**
     * Handle background Rive binding change
     */
    const handleBackgroundRiveBindingChange = useCallback((bindingName: string, value: any) => {
        const riveBindings = { ...(layout.riveBindings || {}) };
        riveBindings[bindingName] = value;
        onLayoutUpdate({ riveBindings });
    }, [layout.riveBindings, onLayoutUpdate]);

    /**
     * Handle element Rive input change
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
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {/* Value Generator Status Banner */}
                        <Chip
                            label={testBindingsEnabled ? 'Value Generator: Enabled' : 'Value Generator: Disabled'}
                            onClick={() => setViewMode('sensortag')}
                            size="small"
                            color={testBindingsEnabled ? 'primary' : 'default'}
                            sx={{
                                cursor: 'pointer',
                                fontSize: '10px',
                                height: 20,
                                '&:hover': {
                                    bgcolor: testBindingsEnabled ? 'primary.dark' : 'action.hover'
                                }
                            }}
                        />

                        {/* Background Rive Section */}
                        {(backgroundRiveMachines.length > 0 || backgroundRiveBindings.length > 0) && (
                            <Paper
                                elevation={0}
                                sx={{ p: 1, border: 1, borderColor: 'primary.main', bgcolor: 'action.selected' }}
                            >
                                <Typography variant="caption" fontWeight="bold" display="block" mb={1}>
                                    Background Rive
                                </Typography>

                                {backgroundRiveMachines.flatMap((machine: DiscoveredRiveStateMachine) => machine.inputs).map((input: DiscoveredRiveInput) => (
                                    <Box key={`bg-input-${input.name}`} sx={{ mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Typography variant="caption" color="text.secondary" fontSize="10px">
                                            Input:
                                        </Typography>
                                        <Typography variant="caption" fontWeight="bold" fontSize="11px" sx={{ fontFamily: 'monospace' }}>
                                            {input.name}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" fontSize="9px">
                                            ({input.type})
                                        </Typography>
                                    </Box>
                                ))}

                                {backgroundRiveBindings.map(binding => (
                                    <Box key={`bg-binding-${binding.name}`} sx={{ mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Typography variant="caption" color="text.secondary" fontSize="10px">
                                            Binding:
                                        </Typography>
                                        <Typography variant="caption" fontWeight="bold" fontSize="11px" sx={{ fontFamily: 'monospace' }}>
                                            {binding.name}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" fontSize="9px">
                                            ({binding.type})
                                        </Typography>
                                    </Box>
                                ))}
                            </Paper>
                        )}

                        {/* Show "no elements" message only if no Background Rive and no elements */}
                        {elements.length === 0 && backgroundRiveMachines.length === 0 && backgroundRiveBindings.length === 0 && (
                            <Typography variant="caption" color="text.secondary" textAlign="center" display="block" sx={{ py: 2 }}>
                                No elements or Rive assets on canvas
                            </Typography>
                        )}

                        {elements.length > 0 && (
                            <Typography variant="caption" color="text.secondary" display="block">
                                SensorTag Bindings grouped by element type:
                            </Typography>
                        )}

                        {Object.entries(elementsByType).map(([elementType, typeElements]) => {
                            // Filter to only elements with SensorTags (sensor and gauge types)
                            // Type guard ensures TypeScript knows the filtered elements have sensorTag
                            const elementsWithTags = typeElements.filter(hasSensorTag);
                            if (elementsWithTags.length === 0) return null;

                            return (
                                <Paper
                                    key={elementType}
                                    elevation={0}
                                    sx={{ p: 1, border: 1, borderColor: 'divider' }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                                        <Box sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>
                                            {getElementIcon(elementType, 'small')}
                                        </Box>
                                        <Typography variant="caption" fontWeight="bold">
                                            {getElementDisplayName(elementType)}
                                        </Typography>
                                        <Chip
                                            label={elementsWithTags.length}
                                            size="small"
                                            sx={{ ml: 0.5, height: 16, fontSize: '10px' }}
                                        />
                                    </Box>

                                    {elementsWithTags.map(element => (
                                        <Box key={element.id} sx={{ mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant="caption" color="text.secondary" fontSize="10px">
                                                Tag:
                                            </Typography>
                                            <Typography variant="caption" fontWeight="bold" fontSize="11px" sx={{ fontFamily: 'monospace' }}>
                                                {element.properties.sensorTag}
                                            </Typography>
                                            <Typography variant="caption" color="text.disabled" fontSize="9px">
                                                (...{element.id.substring(element.id.length - 8)})
                                            </Typography>
                                        </Box>
                                    ))}
                                </Paper>
                            );
                        })}

                        {/* MediaRive Elements Section */}
                        {Array.from(elementRiveDiscoveries.entries()).map(([elementId, discovery]) => {
                            const element = elements.find(el => el.id === elementId);
                            if (!element || element.type !== 'media-rive') return null;
                            if (discovery.machines.length === 0 && discovery.bindings.length === 0) return null;

                            return (
                                <Paper
                                    key={`rive-${elementId}`}
                                    elevation={0}
                                    sx={{ p: 1, border: 1, borderColor: 'divider' }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                                        <Box sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>
                                            {getElementIcon('media-rive', 'small')}
                                        </Box>
                                        <Typography variant="caption" fontWeight="bold">
                                            {getElementDisplayName('media-rive')}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" fontSize="9px">
                                            (...{elementId.slice(-8)})
                                        </Typography>
                                    </Box>

                                    {discovery.machines.flatMap((machine: DiscoveredRiveStateMachine) => machine.inputs).map((input: DiscoveredRiveInput) => (
                                        <Box key={`${elementId}-input-${input.name}`} sx={{ mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant="caption" color="text.secondary" fontSize="10px">
                                                Input:
                                            </Typography>
                                            <Typography variant="caption" fontWeight="bold" fontSize="11px" sx={{ fontFamily: 'monospace' }}>
                                                {input.name}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" fontSize="9px">
                                                ({input.type})
                                            </Typography>
                                        </Box>
                                    ))}

                                    {discovery.bindings.map((binding: DiscoveredRiveDataBinding) => (
                                        <Box key={`${elementId}-binding-${binding.name}`} sx={{ mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant="caption" color="text.secondary" fontSize="10px">
                                                Binding:
                                            </Typography>
                                            <Typography variant="caption" fontWeight="bold" fontSize="11px" sx={{ fontFamily: 'monospace' }}>
                                                {binding.name}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" fontSize="9px">
                                                ({binding.type})
                                            </Typography>
                                        </Box>
                                    ))}
                                </Paper>
                            );
                        })}
                    </Box>
                )}

                {viewMode === 'sensortag' && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {/* Value Generator Card */}
                        <Paper
                            elevation={0}
                            sx={{
                                p: 1.5,
                                border: 1,
                                borderColor: testBindingsEnabled ? 'primary.main' : 'divider',
                                bgcolor: testBindingsEnabled ? 'action.selected' : 'background.paper'
                            }}
                        >
                            <Typography variant="caption" fontWeight="bold" display="block" mb={1}>
                                Value Generator
                            </Typography>

                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={testBindingsEnabled}
                                        onChange={(e) => handleTestBindingsEnabledChange(e.target.checked)}
                                        size="small"
                                    />
                                }
                                label={
                                    <Typography variant="caption">
                                        {testBindingsEnabled ? 'Enabled' : 'Disabled'}
                                    </Typography>
                                }
                                sx={{ mb: 1, ml: 0 }}
                            />

                            <TextField
                                label="Interval (ms)"
                                type="number"
                                value={testBindingsInterval}
                                onChange={(e) => {
                                    const newInterval = Math.max(100, parseInt(e.target.value) || 5000);
                                    handleTestBindingsIntervalChange(newInterval);
                                }}
                                disabled={testBindingsEnabled}
                                size="small"
                                fullWidth
                                inputProps={{ min: 100, step: 100 }}
                                sx={{
                                    '& input': { fontFamily: 'monospace', fontSize: '12px' }
                                }}
                                helperText={testBindingsEnabled ? 'Disable to change interval' : 'Random values updated at this interval'}
                            />
                        </Paper>

                        <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                            All SensorTags ({allSensorTags.length}):
                        </Typography>

                        {allSensorTags.length === 0 ? (
                            <Typography variant="caption" color="text.secondary">
                                No SensorTags found
                            </Typography>
                        ) : (
                            allSensorTags.map(sensorTag => {
                                // Get all elements that use this tag (with type guard)
                                const elementsUsingTag = elements.filter(el =>
                                    hasSensorTag(el) && el.properties.sensorTag === sensorTag
                                );

                                // Check if this is a background Rive input
                                const isBackgroundRiveInput = backgroundRiveMachines.some(machine =>
                                    machine.inputs.some(input => input.name === sensorTag)
                                );

                                // Check if this is an element Rive input and collect element IDs
                                const riveElementIds: string[] = [];
                                elementRiveDiscoveries.forEach((discovery, elementId) => {
                                    const hasInput = discovery.machines.some((machine: DiscoveredRiveStateMachine) =>
                                        machine.inputs.some(input => input.name === sensorTag)
                                    );
                                    if (hasInput) {
                                        riveElementIds.push(elementId);
                                    }
                                });

                                const isIncluded = includedSensorTags.has(sensorTag);
                                const hasUsage = elementsUsingTag.length > 0 || isBackgroundRiveInput || riveElementIds.length > 0;

                                return (
                                    <Paper
                                        key={sensorTag}
                                        elevation={0}
                                        sx={{
                                            p: 1.5,
                                            border: 1,
                                            borderColor: 'divider',
                                            mb: 1
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                                            <Typography variant="caption" fontWeight="bold" flex={1} fontSize="11px">
                                                {sensorTag}
                                            </Typography>
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        checked={isIncluded}
                                                        onChange={() => onToggleIncludeSensorTag(sensorTag)}
                                                        size="small"
                                                    />
                                                }
                                                label={
                                                    <Typography variant="caption" fontSize="9px">
                                                        Include in Value Generation
                                                    </Typography>
                                                }
                                                labelPlacement="start"
                                                sx={{ m: 0, gap: 0.5 }}
                                            />
                                        </Box>
                                        <TextField
                                            label="Test Value"
                                            value={getTestValue(sensorTag)}
                                            onChange={(e) => handleTestValueChange(sensorTag, e.target.value)}
                                            placeholder="Enter test value"
                                            size="small"
                                            fullWidth
                                            sx={{
                                                mb: 1,
                                                '& input': { fontFamily: 'monospace', fontSize: '12px' }
                                            }}
                                        />
                                        <TextField
                                            label="Test Label"
                                            value={getTestLabel(sensorTag)}
                                            onChange={(e) => handleTestLabelChange(sensorTag, e.target.value)}
                                            placeholder="Enter test label"
                                            size="small"
                                            fullWidth
                                            sx={{
                                                mb: 1,
                                                '& input': { fontFamily: 'monospace', fontSize: '12px' }
                                            }}
                                        />
                                        <TextField
                                            label="Test Unit"
                                            value={getTestUnit(sensorTag)}
                                            onChange={(e) => handleTestUnitChange(sensorTag, e.target.value)}
                                            placeholder="Enter test unit"
                                            size="small"
                                            fullWidth
                                            sx={{
                                                '& input': { fontFamily: 'monospace', fontSize: '12px' }
                                            }}
                                        />

                                        {/* List usage (elements and Rive inputs) */}
                                        {hasUsage && (
                                            <Box sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                                                <Typography variant="caption" color="text.secondary" display="block" fontSize="9px" mb={0.5}>
                                                    Used by:
                                                </Typography>

                                                {/* Background Rive */}
                                                {isBackgroundRiveInput && (
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                                                        <Typography variant="caption" fontSize="10px" color="primary">
                                                            Background Rive
                                                        </Typography>
                                                    </Box>
                                                )}

                                                {/* Rive Elements */}
                                                {riveElementIds.map(elementId => {
                                                    const element = elements.find(el => el.id === elementId);
                                                    if (!element) return null;
                                                    return (
                                                        <Box key={`rive-${elementId}`} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                                                            <Box sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>
                                                                {getElementIcon('media-rive', 'small')}
                                                            </Box>
                                                            <Typography variant="caption" fontSize="10px">
                                                                {getElementDisplayName('media-rive')}
                                                            </Typography>
                                                            <Typography variant="caption" color="text.secondary" fontSize="9px">
                                                                (...{elementId.slice(-8)})
                                                            </Typography>
                                                        </Box>
                                                    );
                                                })}

                                                {/* Regular Elements */}
                                                {elementsUsingTag.map(element => (
                                                    <Box key={element.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                                                        <Box sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>
                                                            {getElementIcon(element.type, 'small')}
                                                        </Box>
                                                        <Typography variant="caption" fontSize="10px">
                                                            {getElementDisplayName(element.type)}
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary" fontSize="9px">
                                                            (...{element.id.slice(-8)})
                                                        </Typography>
                                                    </Box>
                                                ))}
                                            </Box>
                                        )}
                                    </Paper>
                                );
                            })
                        )}
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export default FrameEngine2_Tab_Bindings;
