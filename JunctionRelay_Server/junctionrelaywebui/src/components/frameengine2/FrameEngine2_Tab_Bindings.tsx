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
import { Box, Typography, ToggleButtonGroup, ToggleButton, TextField, Paper, Chip, Switch, FormControlLabel } from '@mui/material';
import ViewListIcon from '@mui/icons-material/ViewList';
import LabelIcon from '@mui/icons-material/Label';
import type { PlacedElement, FrameLayoutConfig } from './types/FrameEngine2_LayoutTypes';
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
    onToggleIncludeSensorTag
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
     */
    const allSensorTags = useMemo(() => {
        const tags = new Set<string>();

        elements.forEach(element => {
            // Check for direct sensorTag property (sensor, gauge, and ecg elements)
            if ((element.type === 'sensor' || element.type === 'gauge' || element.type === 'ecg') && element.properties.sensorTag) {
                tags.add(element.properties.sensorTag);
            }

            // TODO: Add Rive inputs/bindings when we have Rive elements
        });

        return Array.from(tags).sort();
    }, [elements]);

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
     */
    const getTestValue = (sensorTag: string): string => {
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
     * Update test value for a sensor tag
     */
    const handleTestValueChange = useCallback((sensorTag: string, value: string) => {
        const sensorTestValues = { ...layout.sensorTestValues };
        const existing = sensorTestValues[sensorTag] || {};

        if (value.trim() === '' && !existing.label && !existing.unit) {
            // Remove entirely if all fields empty
            delete sensorTestValues[sensorTag];
        } else {
            // Try to parse as number, otherwise store as string
            const numValue = parseFloat(value);
            sensorTestValues[sensorTag] = {
                ...existing,
                value: value.trim() === '' ? undefined : (isNaN(numValue) ? value : numValue)
            };
        }

        onLayoutUpdate({ sensorTestValues });
    }, [layout.sensorTestValues, onLayoutUpdate]);

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


    if (elements.length === 0) {
        return (
            <Box
                sx={{
                    p: 1.5,
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
            >
                <Typography variant="caption" color="text.secondary" textAlign="center">
                    No elements on canvas
                </Typography>
            </Box>
        );
    }

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

                        <Typography variant="caption" color="text.secondary" display="block">
                            SensorTag Bindings grouped by element type:
                        </Typography>

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
                                        <Box key={element.id} sx={{ mb: 1, '&:last-child': { mb: 0 } }}>
                                            <Typography variant="caption" color="text.secondary" display="block" fontSize="10px" mb={0.5}>
                                                {element.id.substring(0, 8)}...
                                            </Typography>
                                            <TextField
                                                label={element.properties.sensorTag}
                                                value={getTestValue(element.properties.sensorTag)}
                                                onChange={(e) => handleTestValueChange(element.properties.sensorTag, e.target.value)}
                                                placeholder="Test value"
                                                size="small"
                                                fullWidth
                                                sx={{
                                                    '& input': { fontFamily: 'monospace', fontSize: '12px' }
                                                }}
                                            />
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
                                const isIncluded = includedSensorTags.has(sensorTag);

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

                                        {/* List elements using this sensor tag */}
                                        {elementsUsingTag.length > 0 && (
                                            <Box sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                                                <Typography variant="caption" color="text.secondary" display="block" fontSize="9px" mb={0.5}>
                                                    Used by:
                                                </Typography>
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
