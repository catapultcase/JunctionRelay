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
import { Box, Typography, Paper } from '@mui/material';
import {
    TextFields as TextIcon,
    Schedule as ClockIcon,
    Sensors as SensorsIcon,
    ShowChart as ChartIcon,
    Speed as GaugeIcon,
    Grain as OscilloscopeIcon,
    Explore as TunnelIcon,
    Cloud as WeatherIcon,
    Image as ImageIcon,
    VideoLibrary as VideoIcon,
    Animation as RiveIcon,
} from '@mui/icons-material';

/**
 * Element definition for the library
 */
interface ElementDefinition {
    type: string;
    label: string;
    icon: React.ReactNode;
    description: string;
    implemented: boolean;
}

/**
 * Library tab content for right sidebar
 * Draggable element types that can be added to canvas
 */
const FrameEngine2_Tab_Library: React.FC = () => {
    // Available elements for the library
    const elements: ElementDefinition[] = [
        {
            type: 'text',
            label: 'Text',
            icon: <TextIcon fontSize="small" />,
            description: 'Static text label',
            implemented: true
        },
        {
            type: 'timedate',
            label: 'Time & Date',
            icon: <ClockIcon fontSize="small" />,
            description: 'Display current time, date, or both',
            implemented: true
        },
        {
            type: 'sensor',
            label: 'Sensor',
            icon: <SensorsIcon fontSize="small" />,
            description: 'Display live sensor values',
            implemented: true
        },
        {
            type: 'ecg',
            label: 'ECG Waveform',
            icon: <ChartIcon fontSize="small" />,
            description: 'Real-time waveform chart',
            implemented: true
        },
        {
            type: 'gauge',
            label: 'Gauge',
            icon: <GaugeIcon fontSize="small" />,
            description: 'Circular gauge display',
            implemented: true
        },
        {
            type: 'oscilloscope',
            label: 'Oscilloscope',
            icon: <OscilloscopeIcon fontSize="small" />,
            description: 'Advanced waveform display',
            implemented: false
        },
        {
            type: 'tunnel',
            label: 'Tunnel Effect',
            icon: <TunnelIcon fontSize="small" />,
            description: 'Psychedelic tunnel effect',
            implemented: false
        },
        {
            type: 'weather',
            label: 'Weather Scene',
            icon: <WeatherIcon fontSize="small" />,
            description: '3D weather visualization',
            implemented: false
        },
        {
            type: 'media-image',
            label: 'Media - Image',
            icon: <ImageIcon fontSize="small" />,
            description: 'Display uploaded image',
            implemented: true
        },
        {
            type: 'media-video',
            label: 'Media - Video',
            icon: <VideoIcon fontSize="small" />,
            description: 'Display uploaded video',
            implemented: true
        },
        {
            type: 'media-rive',
            label: 'Media - Rive',
            icon: <RiveIcon fontSize="small" />,
            description: 'Display Rive animation',
            implemented: true
        }
    ];

    return (
        <Box
            sx={{
                p: 1,
                height: '100%',
                overflowY: 'auto'
            }}
        >
            {elements.map((element) => (
                <Paper
                    key={element.type}
                    draggable={element.implemented}
                    onDragStart={(e) => {
                        if (!element.implemented) {
                            e.preventDefault();
                            return;
                        }
                        e.dataTransfer.setData('elementType', element.type);
                        e.dataTransfer.effectAllowed = 'copy';
                        // Set drag image opacity
                        if (e.currentTarget instanceof HTMLElement) {
                            e.currentTarget.style.opacity = '0.5';
                        }
                    }}
                    onDragEnd={(e) => {
                        // Restore opacity
                        if (e.currentTarget instanceof HTMLElement) {
                            e.currentTarget.style.opacity = '1';
                        }
                    }}
                    elevation={0}
                    sx={{
                        p: 1.5,
                        mb: 1,
                        bgcolor: element.implemented ? 'action.hover' : 'action.disabledBackground',
                        border: 1,
                        borderColor: 'divider',
                        cursor: element.implemented ? 'grab' : 'not-allowed',
                        transition: 'all 0.2s ease',
                        userSelect: 'none',
                        opacity: element.implemented ? 1 : 0.5,
                        '&:hover': element.implemented ? {
                            bgcolor: 'action.selected',
                            borderColor: 'primary.main'
                        } : {},
                        '&:active': element.implemented ? {
                            cursor: 'grabbing'
                        } : {}
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Box sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>
                            {element.icon}
                        </Box>
                        <Typography variant="body2" fontWeight="bold">
                            {element.label}
                            {!element.implemented && (
                                <Typography component="span" variant="caption" sx={{ ml: 0.5, color: 'text.disabled', fontWeight: 'normal' }}>
                                    (Coming Soon)
                                </Typography>
                            )}
                        </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                        {element.description}
                    </Typography>
                </Paper>
            ))}
        </Box>
    );
};

export default FrameEngine2_Tab_Library;
