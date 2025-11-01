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
import { Box, Typography, FormControlLabel, Checkbox } from '@mui/material';
import type { ElementPropertyPanelProps } from './FrameEngine2_ElementProperties_Types';
import {
    TextInput,
    ColorInput,
    usePropertiesUpdate
} from './FrameEngine2_ElementProperties_Shared';

/**
 * Properties panel for ECG/Waveform elements
 */
export const FrameEngine2_ElementProperties_ECG: React.FC<ElementPropertyPanelProps> = ({
    selectedElement,
    onUpdateElement
}) => {
    // Hook must be called before any conditional returns
    const updateProperty = usePropertiesUpdate(selectedElement, onUpdateElement);

    // Type guard: This component is only rendered for ECG elements
    if (selectedElement.type !== 'ecg') {
        return null;
    }

    // Check if SensorTag is missing (required field)
    const sensorTagMissing = !selectedElement.properties.sensorTag ||
        selectedElement.properties.sensorTag.trim() === '';

    return (
        <Box>
            <Typography variant="subtitle2" fontWeight="bold" mb={1}>
                ECG Waveform Properties
            </Typography>

            <TextInput
                label="Sensor Tag"
                value={selectedElement.properties.sensorTag || ''}
                onChange={(v) => updateProperty('sensorTag', v)}
                error={sensorTagMissing}
                helperText={sensorTagMissing ? 'Sensor Tag is required for waveform data' : 'Sensor providing waveform values'}
            />

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <TextInput
                    label="Y-Axis Min"
                    type="number"
                    value={selectedElement.properties.yAxisMin ?? 0}
                    onChange={(v) => updateProperty('yAxisMin', parseFloat(v as string) || 0)}
                />
                <TextInput
                    label="Y-Axis Max"
                    type="number"
                    value={selectedElement.properties.yAxisMax ?? 100}
                    onChange={(v) => updateProperty('yAxisMax', parseFloat(v as string) || 100)}
                />
            </Box>

            <TextInput
                label="Buffer Size"
                type="number"
                value={selectedElement.properties.bufferSize ?? 200}
                onChange={(v) => updateProperty('bufferSize', parseInt(v as string) || 200)}
                helperText="Number of data points (50-1000)"
            />

            <TextInput
                label="Line Thickness"
                type="number"
                value={selectedElement.properties.lineWidth ?? 2}
                onChange={(v) => updateProperty('lineWidth', parseFloat(v as string) || 2)}
            />

            <TextInput
                label="Grid Scroll Speed"
                type="number"
                value={selectedElement.properties.gridScrollSpeed ?? 0.5}
                onChange={(v) => updateProperty('gridScrollSpeed', parseFloat(v as string) || 0.5)}
                helperText="0 = static, 0.5 = default, higher = faster"
            />

            <ColorInput
                label="Waveform Color"
                value={selectedElement.properties.waveformColor || '#00ff00'}
                onChange={(v) => updateProperty('waveformColor', v)}
            />

            <ColorInput
                label="Background Color"
                value={selectedElement.properties.backgroundColor || '#000000'}
                onChange={(v) => updateProperty('backgroundColor', v)}
            />

            <ColorInput
                label="Grid Color"
                value={selectedElement.properties.gridColor || 'rgba(0, 255, 0, 0.2)'}
                onChange={(v) => updateProperty('gridColor', v)}
            />

            <ColorInput
                label="Grid Background Color"
                value={selectedElement.properties.gridBackgroundColor || 'transparent'}
                onChange={(v) => updateProperty('gridBackgroundColor', v)}
            />

            <FormControlLabel
                control={
                    <Checkbox
                        checked={selectedElement.properties.showGrid !== false}
                        onChange={(e) => updateProperty('showGrid', e.target.checked)}
                    />
                }
                label="Show Grid"
            />

            <FormControlLabel
                control={
                    <Checkbox
                        checked={selectedElement.properties.showBorder !== false}
                        onChange={(e) => updateProperty('showBorder', e.target.checked)}
                    />
                }
                label="Show Border"
            />
        </Box>
    );
};

export default FrameEngine2_ElementProperties_ECG;
