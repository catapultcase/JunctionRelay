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

import React, { useEffect, useState, useRef } from 'react';

interface ClockElementProps {
    width: number;
    height: number;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string;
    textColor?: string;
    backgroundColor?: string;
    textAlign?: 'left' | 'center' | 'right';
    verticalAlign?: 'top' | 'center' | 'bottom';
    timeFormat?: '12h' | '24h';
    showSeconds?: boolean;
    showDate?: boolean;
    dateFormat?: 'short' | 'long' | 'iso';
    timezone?: string; // IANA timezone string like 'America/New_York'
    textShadow?: boolean;
    textBorder?: boolean;
}

export const FrameEngine_ClockElement: React.FC<ClockElementProps> = ({
    width: _width,
    height: _height,
    fontSize = 24,
    fontFamily = 'Inter',
    fontWeight = 'normal',
    textColor = '#000000',
    backgroundColor = 'transparent',
    textAlign = 'center',
    verticalAlign = 'center',
    timeFormat = '12h',
    showSeconds = true,
    showDate = false,
    dateFormat = 'short',
    timezone = 'America/Chicago', // Default to local timezone
    textShadow = false,
    textBorder = false,
}) => {
    const [currentTime, setCurrentTime] = useState('');
    const intervalRef = useRef<number | null>(null);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;

        const updateTime = () => {
            if (!isMountedRef.current) return;

            try {
                const now = new Date();

                // Format time based on settings
                const timeOptions: Intl.DateTimeFormatOptions = {
                    hour: 'numeric',
                    minute: '2-digit',
                    ...(showSeconds && { second: '2-digit' }),
                    hour12: timeFormat === '12h',
                    timeZone: timezone,
                };

                const timeString = new Intl.DateTimeFormat('en-US', timeOptions).format(now);

                let displayString = timeString;

                // Add date if requested
                if (showDate) {
                    let dateOptions: Intl.DateTimeFormatOptions;

                    switch (dateFormat) {
                        case 'long':
                            dateOptions = {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                timeZone: timezone,
                            };
                            break;
                        case 'iso':
                            dateOptions = {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                timeZone: timezone,
                            };
                            break;
                        default: // 'short'
                            dateOptions = {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                timeZone: timezone,
                            };
                    }

                    const dateString = new Intl.DateTimeFormat('en-US', dateOptions).format(now);
                    displayString = `${dateString}\n${timeString}`;
                }

                setCurrentTime(displayString);
            } catch (error) {
                console.error('Error formatting time:', error);
                setCurrentTime('Invalid timezone');
            }
        };

        // Update immediately
        updateTime();

        // Update every second
        intervalRef.current = window.setInterval(updateTime, 1000);

        return () => {
            isMountedRef.current = false;
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [timeFormat, showSeconds, showDate, dateFormat, timezone]);

    // Handle vertical alignment
    let justifyContent: string;
    switch (verticalAlign) {
        case 'top':
            justifyContent = 'flex-start';
            break;
        case 'bottom':
            justifyContent = 'flex-end';
            break;
        default:
            justifyContent = 'center';
            break;
    }

    const containerStyle: React.CSSProperties = {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: justifyContent,
        alignItems: textAlign === 'left' ? 'flex-start' :
            textAlign === 'right' ? 'flex-end' : 'center',
        backgroundColor: backgroundColor,
        fontSize: fontSize,
        fontFamily: `"${fontFamily}", system-ui, -apple-system, sans-serif`,
        fontWeight: fontWeight,
        color: textColor,
        textAlign: textAlign,
        whiteSpace: 'pre-line',
        padding: '8px',
        boxSizing: 'border-box',
        textShadow: textShadow ? '1px 1px 2px rgba(0,0,0,0.3)' : 'none',
        WebkitTextStroke: textBorder ? '1px currentColor' : 'none',
    };

    return (
        <div style={containerStyle}>
            {currentTime}
        </div>
    );
};

export default FrameEngine_ClockElement;