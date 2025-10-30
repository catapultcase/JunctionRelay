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
    HelpOutline as UnknownIcon,
} from '@mui/icons-material';

/**
 * Get the monochrome icon for an element type
 */
export const getElementIcon = (elementType: string, fontSize: 'small' | 'medium' = 'small'): React.ReactNode => {
    switch (elementType) {
        case 'text':
            return <TextIcon fontSize={fontSize} />;
        case 'timedate':
            return <ClockIcon fontSize={fontSize} />;
        case 'sensor':
            return <SensorsIcon fontSize={fontSize} />;
        case 'ecg':
            return <ChartIcon fontSize={fontSize} />;
        case 'gauge':
            return <GaugeIcon fontSize={fontSize} />;
        case 'oscilloscope':
            return <OscilloscopeIcon fontSize={fontSize} />;
        case 'tunnel':
            return <TunnelIcon fontSize={fontSize} />;
        case 'weather':
            return <WeatherIcon fontSize={fontSize} />;
        case 'media-image':
            return <ImageIcon fontSize={fontSize} />;
        case 'media-video':
            return <VideoIcon fontSize={fontSize} />;
        case 'media-rive':
            return <RiveIcon fontSize={fontSize} />;
        default:
            return <UnknownIcon fontSize={fontSize} />;
    }
};

/**
 * Get display name for element type
 */
export const getElementDisplayName = (elementType: string): string => {
    switch (elementType) {
        case 'text':
            return 'Text';
        case 'timedate':
            return 'Time & Date';
        case 'sensor':
            return 'Sensor';
        case 'ecg':
            return 'ECG Waveform';
        case 'gauge':
            return 'Gauge';
        case 'oscilloscope':
            return 'Oscilloscope';
        case 'tunnel':
            return 'Tunnel Effect';
        case 'weather':
            return 'Weather Scene';
        case 'media-image':
            return 'Media - Image';
        case 'media-video':
            return 'Media - Video';
        case 'media-rive':
            return 'Media - Rive';
        default:
            return elementType;
    }
};
