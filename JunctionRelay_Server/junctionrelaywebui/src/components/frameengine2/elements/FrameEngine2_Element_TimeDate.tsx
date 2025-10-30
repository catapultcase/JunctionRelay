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

import React, { useState, useEffect, useMemo } from 'react';
import { loadGoogleFont } from '../FrameEngine2_FontLoader';

/**
 * Props for the TimeDate element component
 */
interface TimeDateElementProps {
    /** Element properties */
    properties: {
        displayMode?: 'time' | 'date' | 'both';
        timeFormat?: '12h' | '24h';
        dateFormat?: 'short' | 'long' | 'numeric';
        timezone?: string;
        showSeconds?: boolean;
        fontSize?: number;
        fontFamily?: string;
        fontWeight?: string;
        textColor?: string;
        backgroundColor?: string;
        textAlign?: 'left' | 'center' | 'right';
        verticalAlign?: 'top' | 'center' | 'bottom';
        [key: string]: any;
    };

    /** Element padding in pixels */
    elementPadding?: number;

    /** Element dimensions */
    width: number;
    height: number;
}

/**
 * TimeDate Element - Displays current time and/or date
 *
 * Features:
 * - Display time, date, or both
 * - 12/24 hour format
 * - Multiple date formats
 * - Timezone support
 * - Optional seconds display
 *
 * Performance notes:
 * - Updates every second (or minute if seconds hidden)
 * - Memoized formatting for efficiency
 * - Cleanup on unmount to prevent memory leaks
 */
const FrameEngine2_Element_TimeDate: React.FC<TimeDateElementProps> = ({
    properties,
    elementPadding = 4,
    width,
    height
}) => {
    const {
        displayMode = 'time',
        timeFormat = '12h',
        dateFormat = 'short',
        timezone = 'America/Chicago',
        showSeconds = true,
        fontSize = 16,
        fontFamily = 'Inter',
        fontWeight = 'normal',
        textColor = '#FFFFFF',
        backgroundColor = 'transparent',
        textAlign = 'center',
        verticalAlign = 'center'
    } = properties;

    // Current time state
    const [currentTime, setCurrentTime] = useState(new Date());

    // Load Google Font when needed
    useEffect(() => {
        if (fontFamily && fontFamily !== 'Inter') {
            loadGoogleFont(fontFamily);
        }
    }, [fontFamily]);

    // Format font family for CSS (add quotes if it contains spaces)
    const cssFontFamily = fontFamily.includes(' ') ? `"${fontFamily}"` : fontFamily;

    /**
     * Update time every second (or minute if seconds hidden)
     */
    useEffect(() => {
        const intervalMs = showSeconds ? 1000 : 60000;

        const interval = setInterval(() => {
            setCurrentTime(new Date());
        }, intervalMs);

        return () => clearInterval(interval);
    }, [showSeconds]);

    /**
     * Format time string based on configuration
     * OPTIMIZATION: Memoized to prevent re-computation on every render
     */
    const formattedTime = useMemo(() => {
        if (displayMode === 'date') return null;

        const options: Intl.DateTimeFormatOptions = {
            timeZone: timezone,
            hour: 'numeric',
            minute: '2-digit',
            hour12: timeFormat === '12h'
        };

        if (showSeconds) {
            options.second = '2-digit';
        }

        return currentTime.toLocaleTimeString('en-US', options);
    }, [currentTime, displayMode, timeFormat, timezone, showSeconds]);

    /**
     * Format date string based on configuration
     * OPTIMIZATION: Memoized to prevent re-computation on every render
     */
    const formattedDate = useMemo(() => {
        if (displayMode === 'time') return null;

        const options: Intl.DateTimeFormatOptions = {
            timeZone: timezone
        };

        switch (dateFormat) {
            case 'short':
                options.month = 'short';
                options.day = 'numeric';
                options.year = 'numeric';
                break;
            case 'long':
                options.weekday = 'long';
                options.month = 'long';
                options.day = 'numeric';
                options.year = 'numeric';
                break;
            case 'numeric':
                options.month = '2-digit';
                options.day = '2-digit';
                options.year = 'numeric';
                break;
        }

        return currentTime.toLocaleDateString('en-US', options);
    }, [currentTime, displayMode, dateFormat, timezone]);

    /**
     * Memoized display text
     * OPTIMIZATION: Combines time/date based on display mode
     */
    const displayText = useMemo(() => {
        if (displayMode === 'both') {
            return (
                <>
                    <div>{formattedTime}</div>
                    <div style={{ fontSize: `${fontSize * 0.8}px`, opacity: 0.9 }}>{formattedDate}</div>
                </>
            );
        } else if (displayMode === 'time') {
            return formattedTime;
        } else {
            return formattedDate;
        }
    }, [displayMode, formattedTime, formattedDate, fontSize]);

    /**
     * Memoized container style
     * OPTIMIZATION: Prevents object recreation on every render
     */
    const containerStyle = useMemo(() => ({
        width: '100%',
        height: '100%',
        padding: `${elementPadding}px`,
        fontSize: `${fontSize}px`,
        fontFamily: cssFontFamily,
        fontWeight,
        color: textColor,
        backgroundColor,
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center',
        justifyContent: verticalAlign === 'top' ? 'flex-start' : verticalAlign === 'bottom' ? 'flex-end' : 'center',
        textAlign,
        overflow: 'hidden',
        gap: displayMode === 'both' ? '4px' : '0'
    }), [elementPadding, fontSize, cssFontFamily, fontWeight, textColor, backgroundColor, textAlign, verticalAlign, displayMode]);

    return (
        <div style={containerStyle}>
            {displayText}
        </div>
    );
};

export default React.memo(FrameEngine2_Element_TimeDate);
