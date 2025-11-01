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
import {
    Box,
    Typography,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Checkbox,
    FormControlLabel
} from '@mui/material';
import type { ElementPropertyPanelProps } from './FrameEngine2_ElementProperties_Types';
import {
    TextInput,
    FontFamilySelect,
    ColorInput,
    usePropertiesUpdate
} from './FrameEngine2_ElementProperties_Shared';

/**
 * Properties panel for TimeDate elements
 */
export const TimeDateProperties: React.FC<ElementPropertyPanelProps> = ({
    selectedElement,
    onUpdateElement
}) => {
    const updateProperty = usePropertiesUpdate(selectedElement, onUpdateElement);

    // Type guard: This component is only rendered for timedate elements
    if (selectedElement.type !== 'timedate') {
        return null;
    }

    return (
        <Box>
            <Typography variant="subtitle2" fontWeight="bold" mb={1}>
                Time & Date Properties
            </Typography>

            <Box sx={{ mb: 1 }}>
                <FormControl fullWidth size="small">
                    <InputLabel>Display Mode</InputLabel>
                    <Select
                        value={selectedElement.properties.displayMode || 'time'}
                        onChange={(e) => updateProperty('displayMode', e.target.value)}
                        label="Display Mode"
                    >
                        <MenuItem value="time">Time Only</MenuItem>
                        <MenuItem value="date">Date Only</MenuItem>
                        <MenuItem value="both">Time & Date</MenuItem>
                    </Select>
                </FormControl>
            </Box>

            <Box sx={{ mb: 1 }}>
                <FormControl fullWidth size="small">
                    <InputLabel>Time Format</InputLabel>
                    <Select
                        value={selectedElement.properties.timeFormat || '12h'}
                        onChange={(e) => updateProperty('timeFormat', e.target.value)}
                        label="Time Format"
                    >
                        <MenuItem value="12h">12-hour (AM/PM)</MenuItem>
                        <MenuItem value="24h">24-hour</MenuItem>
                    </Select>
                </FormControl>
            </Box>

            <Box sx={{ mb: 1 }}>
                <FormControl fullWidth size="small">
                    <InputLabel>Date Format</InputLabel>
                    <Select
                        value={selectedElement.properties.dateFormat || 'short'}
                        onChange={(e) => updateProperty('dateFormat', e.target.value)}
                        label="Date Format"
                    >
                        <MenuItem value="short">Short (Jan 1, 2025)</MenuItem>
                        <MenuItem value="long">Long (Monday, January 1, 2025)</MenuItem>
                        <MenuItem value="numeric">Numeric (01/01/2025)</MenuItem>
                    </Select>
                </FormControl>
            </Box>

            <Box sx={{ mb: 1 }}>
                <FormControl fullWidth size="small">
                    <InputLabel>Timezone</InputLabel>
                    <Select
                        value={selectedElement.properties.timezone || 'America/Chicago'}
                        onChange={(e) => updateProperty('timezone', e.target.value)}
                        label="Timezone"
                    >
                        <MenuItem value="America/New_York">Eastern (US)</MenuItem>
                        <MenuItem value="America/Chicago">Central (US)</MenuItem>
                        <MenuItem value="America/Denver">Mountain (US)</MenuItem>
                        <MenuItem value="America/Los_Angeles">Pacific (US)</MenuItem>
                        <MenuItem value="America/Anchorage">Alaska</MenuItem>
                        <MenuItem value="Pacific/Honolulu">Hawaii</MenuItem>
                        <MenuItem value="Europe/London">London</MenuItem>
                        <MenuItem value="Europe/Paris">Paris</MenuItem>
                        <MenuItem value="Asia/Tokyo">Tokyo</MenuItem>
                        <MenuItem value="Australia/Sydney">Sydney</MenuItem>
                        <MenuItem value="UTC">UTC</MenuItem>
                    </Select>
                </FormControl>
            </Box>

            <FormControlLabel
                control={
                    <Checkbox
                        checked={selectedElement.properties.showSeconds !== false}
                        onChange={(e) => updateProperty('showSeconds', e.target.checked)}
                    />
                }
                label="Show Seconds"
            />

            <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" fontWeight="bold" mb={1}>
                    Typography
                </Typography>

                <FontFamilySelect
                    value={selectedElement.properties.fontFamily || 'Inter'}
                    onChange={(v) => updateProperty('fontFamily', v)}
                />

                <TextInput
                    label="Font Size"
                    type="number"
                    value={selectedElement.properties.fontSize || 16}
                    onChange={(v) => updateProperty('fontSize', v)}
                />

                <ColorInput
                    label="Text Color"
                    value={selectedElement.properties.textColor || '#FFFFFF'}
                    onChange={(v) => updateProperty('textColor', v)}
                />

                <ColorInput
                    label="Background Color"
                    value={selectedElement.properties.backgroundColor || 'transparent'}
                    onChange={(v) => updateProperty('backgroundColor', v)}
                />
            </Box>
        </Box>
    );
};
