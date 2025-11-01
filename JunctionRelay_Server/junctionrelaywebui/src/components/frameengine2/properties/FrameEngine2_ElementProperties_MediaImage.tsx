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
import { Box, Typography, FormControl, InputLabel, Select, MenuItem, Slider } from '@mui/material';
import type { ElementPropertyPanelProps } from './FrameEngine2_ElementProperties_Types';
import { usePropertiesUpdate } from './FrameEngine2_ElementProperties_Shared';
import FrameEngine2_AssetSelector from '../FrameEngine2_AssetSelector';

/**
 * Properties panel for MediaImage elements
 */
export const MediaImageProperties: React.FC<ElementPropertyPanelProps> = ({
    selectedElement,
    onUpdateElement
}) => {
    const updateProperty = usePropertiesUpdate(selectedElement, onUpdateElement);

    // Type guard: This component is only rendered for media-image elements
    if (selectedElement.type !== 'media-image') {
        return null;
    }

    return (
        <Box>
            <Typography variant="subtitle2" fontWeight="bold" mb={1}>
                Media Image Properties
            </Typography>

            {/* Asset Selector */}
            <FrameEngine2_AssetSelector
                type="image"
                value={selectedElement.properties.filename || null}
                onChange={(filename) => updateProperty('filename', filename)}
            />

            {/* Object Fit */}
            <FormControl size="small" fullWidth sx={{ mb: 1, mt: 1 }}>
                <InputLabel>Object Fit</InputLabel>
                <Select
                    value={selectedElement.properties.objectFit || 'cover'}
                    label="Object Fit"
                    onChange={(e) => updateProperty('objectFit', e.target.value)}
                >
                    <MenuItem value="cover">Cover</MenuItem>
                    <MenuItem value="contain">Contain</MenuItem>
                    <MenuItem value="fill">Fill</MenuItem>
                    <MenuItem value="none">None</MenuItem>
                </Select>
            </FormControl>

            {/* Opacity Slider */}
            <Box sx={{ mb: 1 }}>
                <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                    Opacity: {Math.round((selectedElement.properties.opacity ?? 1) * 100)}%
                </Typography>
                <Slider
                    value={selectedElement.properties.opacity ?? 1}
                    onChange={(_, value) => updateProperty('opacity', value)}
                    min={0}
                    max={1}
                    step={0.01}
                    size="small"
                />
            </Box>
        </Box>
    );
};
