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
import { Box, Typography, FormControlLabel, Checkbox, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import type { ElementPropertyPanelProps } from './FrameEngine2_ElementProperties_Types';
import type { Alignment9Way } from '../types/FrameEngine2_ElementTypes';
import {
    TextInput,
    TypographyControls,
    usePropertiesUpdate
} from './FrameEngine2_ElementProperties_Shared';

/**
 * Properties panel for Sensor elements
 */
export const SensorProperties: React.FC<ElementPropertyPanelProps> = ({
    selectedElement,
    onUpdateElement
}) => {
    // Hook must be called before any conditional returns
    const updateProperty = usePropertiesUpdate(selectedElement, onUpdateElement);

    // Type guard: This component is only rendered for sensor elements
    if (selectedElement.type !== 'sensor') {
        return null;
    }

    // Check if SensorTag is missing (required field)
    const sensorTagMissing = !selectedElement.properties.sensorTag ||
        selectedElement.properties.sensorTag.trim() === '';

    return (
        <Box>
            <Typography variant="subtitle2" fontWeight="bold" mb={1}>
                Sensor Properties
            </Typography>

            <TextInput
                label="SensorTag"
                value={selectedElement.properties.sensorTag || ''}
                onChange={(v) => updateProperty('sensorTag', v)}
                error={sensorTagMissing}
                helperText={sensorTagMissing ? 'SensorTag is required' : ''}
            />

            {/* Display Options */}
            <Box sx={{ mb: 1 }}>
                <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                    Display Options
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={selectedElement.properties.showLabel}
                                onChange={(e) => updateProperty('showLabel', e.target.checked)}
                                size="small"
                            />
                        }
                        label="Show Label"
                    />
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={selectedElement.properties.showUnit}
                                onChange={(e) => updateProperty('showUnit', e.target.checked)}
                                size="small"
                            />
                        }
                        label="Show Unit"
                    />
                </Box>
            </Box>

            {/* Placeholder Values */}
            <Box sx={{ mb: 1 }}>
                <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                    Placeholder Values
                </Typography>
                <TextInput
                    label="Placeholder Label"
                    value={selectedElement.properties.placeholderSensorLabel || ''}
                    onChange={(v) => updateProperty('placeholderSensorLabel', v)}
                />
                <TextInput
                    label="Placeholder Value"
                    value={selectedElement.properties.placeholderValue || ''}
                    onChange={(v) => updateProperty('placeholderValue', v)}
                />
                <TextInput
                    label="Placeholder Unit"
                    value={selectedElement.properties.placeholderUnit || ''}
                    onChange={(v) => updateProperty('placeholderUnit', v)}
                />
            </Box>

            {/* Alignment */}
            <FormControl size="small" fullWidth sx={{ mb: 1 }}>
                <InputLabel>Alignment</InputLabel>
                <Select
                    value={selectedElement.properties.alignment || 'center'}
                    label="Alignment"
                    onChange={(e) => updateProperty('alignment', e.target.value as Alignment9Way)}
                >
                    <MenuItem value="top-left">Top Left</MenuItem>
                    <MenuItem value="top-center">Top Center</MenuItem>
                    <MenuItem value="top-right">Top Right</MenuItem>
                    <MenuItem value="middle-left">Middle Left</MenuItem>
                    <MenuItem value="center">Center</MenuItem>
                    <MenuItem value="middle-right">Middle Right</MenuItem>
                    <MenuItem value="bottom-left">Bottom Left</MenuItem>
                    <MenuItem value="bottom-center">Bottom Center</MenuItem>
                    <MenuItem value="bottom-right">Bottom Right</MenuItem>
                </Select>
            </FormControl>

            <TypographyControls
                fontFamily={selectedElement.properties.fontFamily || 'Inter'}
                fontSize={selectedElement.properties.fontSize || 14}
                textColor={selectedElement.properties.textColor || '#FFFFFF'}
                backgroundColor={selectedElement.properties.backgroundColor || 'transparent'}
                onChange={updateProperty}
            />
        </Box>
    );
};
