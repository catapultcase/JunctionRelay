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

import React, { useCallback, useMemo } from 'react';
import { Box, Paper, Typography, TextField, FormControlLabel, Switch, Button } from '@mui/material';
import type { PlacedElement } from '../types/FrameEngine2_LayoutTypes';
import type {
    DiscoveredRiveStateMachine,
    DiscoveredRiveDataBinding
} from '../types/FrameEngine2_ElementTypes';
import type { RiveInputType } from './FrameEngine2_Bindings_Types';
import { hasSensorTag } from './FrameEngine2_Bindings_Types';
import { ColorInput } from '../properties/FrameEngine2_ElementProperties_Shared';
import { getElementIcon, getElementDisplayName } from '../FrameEngine2_ElementIcons';

interface SensorTagCardProps {
    /** The sensor tag name */
    sensorTag: string;

    /** Whether this tag is included in value generation */
    isIncluded: boolean;

    /** Input type for rendering appropriate control */
    inputType: RiveInputType;

    /** Current test value */
    testValue: string;

    /** Current test label */
    testLabel: string;

    /** Current test unit */
    testUnit: string;

    /** All elements on canvas */
    elements: PlacedElement[];

    /** Background Rive machines */
    backgroundRiveMachines: DiscoveredRiveStateMachine[];

    /** Element Rive discoveries */
    elementRiveDiscoveries: Map<string, {
        machines: DiscoveredRiveStateMachine[];
        bindings: DiscoveredRiveDataBinding[];
    }>;

    /** Callback when include toggle changes */
    onToggleInclude: (sensorTag: string) => void;

    /** Callback when test value changes */
    onTestValueChange: (sensorTag: string, value: string) => void;

    /** Callback when test label changes */
    onTestLabelChange: (sensorTag: string, label: string) => void;

    /** Callback when test unit changes */
    onTestUnitChange: (sensorTag: string, unit: string) => void;
}

/**
 * SensorTag Card Component
 *
 * Displays a single sensor tag with:
 * - Include in generation toggle
 * - Type-aware test value input (color picker, boolean switch, number/text field, trigger button)
 * - Test label and unit inputs
 * - Usage list (which elements use this tag)
 *
 * **Following FRAMEENGINE2_ARCHITECTURE_GUIDELINES.md:**
 * - Section 4.1: Component <500 lines (currently ~280 lines)
 * - Section 2.2: Stable callback references with useCallback
 * - Section 6.1: Required memoization for derived data
 * - Section 6.2: Component-level memoization with React.memo
 */
const SensorTagCard: React.FC<SensorTagCardProps> = ({
    sensorTag,
    isIncluded,
    inputType,
    testValue,
    testLabel,
    testUnit,
    elements,
    backgroundRiveMachines,
    elementRiveDiscoveries,
    onToggleInclude,
    onTestValueChange,
    onTestLabelChange,
    onTestUnitChange
}) => {
    /**
     * Calculate usage information
     * OPTIMIZATION: Memoized to prevent recalculation on every render
     */
    const usageInfo = useMemo(() => {
        // Get all elements that use this tag
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

        const hasUsage = elementsUsingTag.length > 0 || isBackgroundRiveInput || riveElementIds.length > 0;

        return {
            elementsUsingTag,
            isBackgroundRiveInput,
            riveElementIds,
            hasUsage
        };
    }, [sensorTag, elements, backgroundRiveMachines, elementRiveDiscoveries]);

    /**
     * Render type-aware test value input
     * OPTIMIZATION: Memoized callback to prevent re-creation
     */
    const renderTestValueInput = useCallback(() => {
        if (inputType === 'color') {
            return (
                <Box sx={{ mb: 1 }}>
                    <ColorInput
                        label="Test Value (Color)"
                        value={testValue || '#000000'}
                        onChange={(color) => onTestValueChange(sensorTag, color)}
                        disabled={isIncluded}
                    />
                </Box>
            );
        } else if (inputType === 'boolean') {
            // Convert various representations of boolean to actual boolean
            let isChecked = false;
            if (typeof testValue === 'boolean') {
                isChecked = testValue;
            } else if (typeof testValue === 'string') {
                isChecked = testValue === 'true' || testValue === '1';
            } else if (typeof testValue === 'number') {
                isChecked = testValue === 1;
            }
            return (
                <Box sx={{ mb: 1 }}>
                    <FormControlLabel
                        control={
                            <Switch
                                checked={isChecked}
                                onChange={(e) => onTestValueChange(sensorTag, e.target.checked ? 'true' : 'false')}
                                size="small"
                                disabled={isIncluded}
                            />
                        }
                        label={
                            <Typography variant="body2" fontSize="12px">
                                Test Value (Boolean): {isChecked ? 'true' : 'false'}
                            </Typography>
                        }
                    />
                </Box>
            );
        } else if (inputType === 'trigger') {
            return (
                <Box sx={{ mb: 1 }}>
                    <Button
                        variant="outlined"
                        size="small"
                        fullWidth
                        onClick={() => {
                            // Trigger events don't have persistent values
                            // This is just for manual testing
                        }}
                    >
                        Trigger (Event-based, no test value)
                    </Button>
                </Box>
            );
        } else {
            // Default: number or string input
            return (
                <TextField
                    label="Test Value"
                    value={testValue}
                    onChange={(e) => onTestValueChange(sensorTag, e.target.value)}
                    placeholder="Enter test value"
                    size="small"
                    fullWidth
                    type={inputType === 'number' ? 'number' : 'text'}
                    disabled={isIncluded}
                    sx={{
                        mb: 1,
                        '& input': { fontFamily: 'monospace', fontSize: '12px' }
                    }}
                />
            );
        }
    }, [inputType, testValue, isIncluded, sensorTag, onTestValueChange]);

    return (
        <Paper
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
                            onChange={() => onToggleInclude(sensorTag)}
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

            {renderTestValueInput()}

            <TextField
                label="Test Label"
                value={testLabel}
                onChange={(e) => onTestLabelChange(sensorTag, e.target.value)}
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
                value={testUnit}
                onChange={(e) => onTestUnitChange(sensorTag, e.target.value)}
                placeholder="Enter test unit"
                size="small"
                fullWidth
                sx={{
                    '& input': { fontFamily: 'monospace', fontSize: '12px' }
                }}
            />

            {/* List usage (elements and Rive inputs) */}
            {usageInfo.hasUsage && (
                <Box sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary" display="block" fontSize="9px" mb={0.5}>
                        Used by:
                    </Typography>

                    {/* Background Rive */}
                    {usageInfo.isBackgroundRiveInput && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                            <Typography variant="caption" fontSize="10px" color="primary">
                                Background Rive
                            </Typography>
                        </Box>
                    )}

                    {/* Rive Elements */}
                    {usageInfo.riveElementIds.map(elementId => {
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
                    {usageInfo.elementsUsingTag.map(element => (
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
};

export default React.memo(SensorTagCard);
