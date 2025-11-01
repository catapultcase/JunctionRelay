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
import { Box, Typography, FormControlLabel, Switch } from '@mui/material';
import type { ElementPropertyPanelProps } from './FrameEngine2_ElementProperties_Types';
import { usePropertiesUpdate, ColorInput } from './FrameEngine2_ElementProperties_Shared';
import FrameEngine2_AssetSelector from '../FrameEngine2_AssetSelector';

/**
 * Properties panel for MediaRive elements
 */
export const MediaRiveProperties: React.FC<ElementPropertyPanelProps> = ({
    selectedElement,
    onUpdateElement
}) => {
    const updateProperty = usePropertiesUpdate(selectedElement, onUpdateElement);

    // Type guard: This component is only rendered for media-rive elements
    if (selectedElement.type !== 'media-rive') {
        return null;
    }

    return (
        <Box>
            <Typography variant="subtitle2" fontWeight="bold" mb={1}>
                Media Rive Properties
            </Typography>

            {/* Asset Selector */}
            <FrameEngine2_AssetSelector
                type="rive"
                value={selectedElement.properties.filename || null}
                onChange={(filename) => updateProperty('filename', filename)}
            />

            {/* Rive Controls */}
            <Box sx={{ mb: 1, mt: 1 }}>
                <FormControlLabel
                    control={
                        <Switch
                            checked={selectedElement.properties.autoplay !== false}
                            onChange={(e) => updateProperty('autoplay', e.target.checked)}
                            size="small"
                        />
                    }
                    label="Autoplay"
                />
            </Box>

            {/* Background Color */}
            <ColorInput
                label="Background Color"
                value={selectedElement.properties.backgroundColor || 'transparent'}
                onChange={(v) => updateProperty('backgroundColor', v)}
            />

            {/* Info about bindings */}
            <Typography variant="caption" color="text.disabled" display="block" mt={1}>
                Configure Rive inputs and data bindings in the Bindings tab
            </Typography>
        </Box>
    );
};
