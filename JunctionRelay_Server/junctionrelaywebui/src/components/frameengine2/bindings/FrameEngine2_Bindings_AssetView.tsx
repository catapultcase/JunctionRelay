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
import { Box, Typography, Paper, Chip } from '@mui/material';
import type { PlacedElement } from '../types/FrameEngine2_LayoutTypes';
import type {
    DiscoveredRiveStateMachine,
    DiscoveredRiveDataBinding,
    DiscoveredRiveInput
} from '../types/FrameEngine2_ElementTypes';
import { hasSensorTag } from './FrameEngine2_Bindings_Types';
import { groupElementsByType } from './FrameEngine2_Bindings_Utils';
import { getElementIcon, getElementDisplayName } from '../FrameEngine2_ElementIcons';

interface AssetViewProps {
    /** All elements on canvas */
    elements: PlacedElement[];

    /** Background Rive machines */
    backgroundRiveMachines: DiscoveredRiveStateMachine[];

    /** Background Rive bindings */
    backgroundRiveBindings: DiscoveredRiveDataBinding[];

    /** Element Rive discoveries */
    elementRiveDiscoveries: Map<string, {
        machines: DiscoveredRiveStateMachine[];
        bindings: DiscoveredRiveDataBinding[];
    }>;
}

/**
 * Asset View Component
 *
 * Displays bindings grouped by asset/element type:
 * - Background Rive inputs and bindings
 * - Elements grouped by type with their sensor tags
 * - MediaRive elements with their Rive inputs and bindings
 *
 * **Following FRAMEENGINE2_ARCHITECTURE_GUIDELINES.md:**
 * - Section 4.1: Component <500 lines (currently ~220 lines)
 * - Section 6.1: Required memoization for derived data
 * - Section 6.2: Component-level memoization with React.memo
 */
const AssetView: React.FC<AssetViewProps> = ({
    elements,
    backgroundRiveMachines,
    backgroundRiveBindings,
    elementRiveDiscoveries
}) => {
    /**
     * Group elements by type
     * OPTIMIZATION: Memoized to prevent recalculation on every render
     */
    const elementsByType = useMemo(() => groupElementsByType(elements), [elements]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
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
    );
};

export default React.memo(AssetView);
