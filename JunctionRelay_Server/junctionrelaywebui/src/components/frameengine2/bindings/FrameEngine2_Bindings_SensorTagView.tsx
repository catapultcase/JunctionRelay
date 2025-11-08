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
import { Box, Typography } from '@mui/material';
import type { PlacedElement, FrameLayoutConfig } from '../types/FrameEngine2_LayoutTypes';
import type {
    DiscoveredRiveStateMachine,
    DiscoveredRiveDataBinding
} from '../types/FrameEngine2_ElementTypes';
import ValueGenerator from './FrameEngine2_Bindings_ValueGenerator';
import SensorTagCard from './FrameEngine2_Bindings_SensorTagCard';
import { extractAllSensorTags, getInputType, getTestValue, getTestLabel, getTestUnit } from './FrameEngine2_Bindings_Utils';

interface SensorTagViewProps {
    /** All elements on canvas */
    elements: PlacedElement[];

    /** Current layout configuration */
    layout: FrameLayoutConfig;

    /** Included sensor tags for Value Generator */
    includedSensorTags: Set<string>;

    /** Background Rive machines */
    backgroundRiveMachines: DiscoveredRiveStateMachine[];

    /** Background Rive bindings */
    backgroundRiveBindings: DiscoveredRiveDataBinding[];

    /** Element Rive discoveries */
    elementRiveDiscoveries: Map<string, {
        machines: DiscoveredRiveStateMachine[];
        bindings: DiscoveredRiveDataBinding[];
    }>;

    /** Callback when include toggle changes */
    onToggleIncludeSensorTag: (sensorTag: string) => void;

    /** Callback when test value changes */
    onTestValueChange: (sensorTag: string, value: string) => void;

    /** Callback when test label changes */
    onTestLabelChange: (sensorTag: string, label: string) => void;

    /** Callback when test unit changes */
    onTestUnitChange: (sensorTag: string, unit: string) => void;

    /** Callback when enabled state changes */
    onTestBindingsEnabledChange: (enabled: boolean) => void;

    /** Callback when interval changes */
    onTestBindingsIntervalChange: (interval: number) => void;
}

/**
 * SensorTag View Component
 *
 * Displays deduplicated list of all sensor tags with:
 * - Value Generator card at top
 * - Individual cards for each sensor tag
 * - Type-aware test value inputs
 * - Include in generation toggles
 *
 * **Following FRAMEENGINE2_ARCHITECTURE_GUIDELINES.md:**
 * - Section 4.1: Component <500 lines (currently ~180 lines)
 * - Section 6.1: Required memoization for derived data
 * - Section 6.2: Component-level memoization with React.memo
 */
const SensorTagView: React.FC<SensorTagViewProps> = ({
    elements,
    layout,
    includedSensorTags,
    backgroundRiveMachines,
    backgroundRiveBindings,
    elementRiveDiscoveries,
    onToggleIncludeSensorTag,
    onTestValueChange,
    onTestLabelChange,
    onTestUnitChange,
    onTestBindingsEnabledChange,
    onTestBindingsIntervalChange
}) => {
    /**
     * Extract all sensor tags
     * OPTIMIZATION: Memoized to prevent recalculation on every render
     */
    const allSensorTags = useMemo(() =>
        extractAllSensorTags(elements, backgroundRiveMachines, backgroundRiveBindings, elementRiveDiscoveries),
        [elements, backgroundRiveMachines, backgroundRiveBindings, elementRiveDiscoveries]
    );

    /**
     * Derive values directly from layout.canvasSettings (no local state needed)
     * OPTIMIZATION: Single source of truth, no state sync required
     */
    const testBindingsEnabled = layout.canvasSettings?.testBindingsEnabled ?? false;
    const testBindingsInterval = layout.canvasSettings?.testBindingsInterval ?? 5000;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {/* Value Generator Card */}
            <ValueGenerator
                testBindingsEnabled={testBindingsEnabled}
                testBindingsInterval={testBindingsInterval}
                onEnabledChange={onTestBindingsEnabledChange}
                onIntervalChange={onTestBindingsIntervalChange}
            />

            <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                All SensorTags ({allSensorTags.length}):
            </Typography>

            {allSensorTags.length === 0 ? (
                <Typography variant="caption" color="text.secondary">
                    No SensorTags found
                </Typography>
            ) : (
                allSensorTags.map(sensorTag => {
                    const inputType = getInputType(
                        sensorTag,
                        backgroundRiveMachines,
                        backgroundRiveBindings,
                        elementRiveDiscoveries
                    );

                    return (
                        <SensorTagCard
                            key={sensorTag}
                            sensorTag={sensorTag}
                            isIncluded={includedSensorTags.has(sensorTag)}
                            inputType={inputType}
                            testValue={getTestValue(sensorTag, layout, elements, elementRiveDiscoveries)}
                            testLabel={getTestLabel(sensorTag, layout)}
                            testUnit={getTestUnit(sensorTag, layout)}
                            elements={elements}
                            backgroundRiveMachines={backgroundRiveMachines}
                            elementRiveDiscoveries={elementRiveDiscoveries}
                            onToggleInclude={onToggleIncludeSensorTag}
                            onTestValueChange={onTestValueChange}
                            onTestLabelChange={onTestLabelChange}
                            onTestUnitChange={onTestUnitChange}
                        />
                    );
                })
            )}
        </Box>
    );
};

export default React.memo(SensorTagView);
