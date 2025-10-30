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

import React from 'react';
import { Box, Typography } from '@mui/material';
import type { ElementPropertyPanelProps } from './FrameEngine2_ElementProperties_Types';
import {
    TextInput,
    ColorInput,
    usePropertiesUpdate
} from './FrameEngine2_ElementProperties_Shared';

/**
 * Properties panel for Gauge elements
 */
export const GaugeProperties: React.FC<ElementPropertyPanelProps> = ({
    selectedElement,
    onUpdateElement
}) => {
    // Hook must be called before any conditional returns
    const updateProperty = usePropertiesUpdate(selectedElement, onUpdateElement);

    // Type guard: This component is only rendered for gauge elements
    if (selectedElement.type !== 'gauge') {
        return null;
    }

    // Check if SensorTag is missing (required field)
    const sensorTagMissing = !selectedElement.properties.sensorTag ||
        selectedElement.properties.sensorTag.trim() === '';

    return (
        <Box>
            <Typography variant="subtitle2" fontWeight="bold" mb={1}>
                Gauge Properties
            </Typography>

            <TextInput
                label="SensorTag"
                value={selectedElement.properties.sensorTag || ''}
                onChange={(v) => updateProperty('sensorTag', v)}
                error={sensorTagMissing}
                helperText={sensorTagMissing ? 'SensorTag is required' : ''}
            />

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <TextInput
                    label="Min Value"
                    type="number"
                    value={selectedElement.properties.minValue ?? 0}
                    onChange={(v) => updateProperty('minValue', v)}
                />
                <TextInput
                    label="Max Value"
                    type="number"
                    value={selectedElement.properties.maxValue ?? 100}
                    onChange={(v) => updateProperty('maxValue', v)}
                />
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <TextInput
                    label="Start Angle"
                    type="number"
                    value={selectedElement.properties.startAngle ?? -90}
                    onChange={(v) => updateProperty('startAngle', v)}
                />
                <TextInput
                    label="End Angle"
                    type="number"
                    value={selectedElement.properties.endAngle ?? 90}
                    onChange={(v) => updateProperty('endAngle', v)}
                />
            </Box>

            <TextInput
                label="Value Label"
                value={selectedElement.properties.valueLabel || ''}
                onChange={(v) => updateProperty('valueLabel', v)}
            />

            <ColorInput
                label="Gauge Color"
                value={selectedElement.properties.gaugeColor || '#1976d2'}
                onChange={(v) => updateProperty('gaugeColor', v)}
            />

            <ColorInput
                label="Reference Arc Color"
                value={selectedElement.properties.referenceArcColor || '#e0e0e0'}
                onChange={(v) => updateProperty('referenceArcColor', v)}
            />

            <ColorInput
                label="Text Color"
                value={selectedElement.properties.textColor || '#000000'}
                onChange={(v) => updateProperty('textColor', v)}
            />
        </Box>
    );
};
