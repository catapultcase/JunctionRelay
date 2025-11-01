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

import React, { useMemo } from 'react';
import { Gauge } from '@mui/x-charts';

interface FrameEngine2_Element_GaugeProps {
    /** Element properties */
    properties: Record<string, any>;

    /** Resolved sensor values (Live > Test hierarchy already applied) */
    resolvedValues: Record<string, any>;

    /** Whether to show placeholders */
    showPlaceholders?: boolean;

    /** Element padding */
    elementPadding?: number;

    /** Element width */
    width: number;

    /** Element height */
    height: number;
}

/**
 * Gauge element - Circular gauge display for sensor values
 * Simplified implementation using MUI X Charts Gauge
 */
const FrameEngine2_Element_Gauge: React.FC<FrameEngine2_Element_GaugeProps> = ({
    properties,
    resolvedValues,
    width,
    height
}) => {
    // Extract properties with defaults
    const sensorTag = properties.sensorTag || '';
    const minValue = properties.minValue ?? 0;
    const maxValue = properties.maxValue ?? 100;
    const startAngle = properties.startAngle ?? -90;
    const endAngle = properties.endAngle ?? 90;
    const innerRadius = properties.innerRadius || '70%';
    const outerRadius = properties.outerRadius || '100%';
    const cornerRadius = properties.cornerRadius || '50%';
    const valueLabel = properties.valueLabel || '';
    const showValue = properties.showValue !== false;
    const gaugeColor = properties.gaugeColor || '#2196f3';
    const referenceArcColor = properties.referenceArcColor || '#e0e0e0';
    const textColor = properties.textColor || '#333333';
    const textFontSize = properties.textFontSize || 0;
    const textFontFamily = properties.textFontFamily || 'Roboto, sans-serif';
    const textFontWeight = properties.textFontWeight || 600;
    const backgroundColor = properties.backgroundColor || 'transparent';

    // Get resolved sensor value (hierarchy already applied by SensorTagManager)
    // Element just provides its own default if no value exists
    const displayValue = useMemo(() => {
        if (!sensorTag) return 0;
        const resolvedData = resolvedValues[sensorTag];
        if (resolvedData === undefined || resolvedData === null) return 0;

        // Handle structured data {value, unit, label} - structured format only
        if (typeof resolvedData !== 'object' || !('value' in resolvedData)) return 0;

        const rawValue = resolvedData.value;
        const parsed = typeof rawValue === 'string' ? parseFloat(rawValue) : rawValue;
        return isNaN(parsed) ? 0 : parsed;
    }, [sensorTag, resolvedValues]);

    // Clamp value to min/max range
    const clampedValue = useMemo(() => {
        return Math.max(minValue, Math.min(maxValue, displayValue));
    }, [displayValue, minValue, maxValue]);

    // Calculate text font size - use provided size or auto-calculate based on dimensions
    const calculatedTextSize = textFontSize > 0
        ? textFontSize
        : Math.min(width, height) * 0.15;

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor,
                overflow: 'hidden'
            }}
        >
            <Gauge
                width={width}
                height={height}
                value={clampedValue}
                valueMin={minValue}
                valueMax={maxValue}
                startAngle={startAngle}
                endAngle={endAngle}
                innerRadius={innerRadius}
                outerRadius={outerRadius}
                cornerRadius={cornerRadius}
                text={showValue ? (params: { value: number | null }) => `${params.value ?? 0}${valueLabel}` : () => ''}
                sx={{
                    '& .MuiGauge-valueArc': {
                        fill: gaugeColor
                    },
                    '& .MuiGauge-referenceArc': {
                        fill: referenceArcColor
                    },
                    '& .MuiGauge-valueText': {
                        fontSize: `${calculatedTextSize}px !important`,
                        fontWeight: `${textFontWeight} !important`,
                        fontFamily: `${textFontFamily} !important`,
                        fill: `${textColor} !important`
                    },
                    '& text': {
                        fill: `${textColor} !important`,
                        fontSize: `${calculatedTextSize}px !important`,
                        fontWeight: `${textFontWeight} !important`,
                        fontFamily: `${textFontFamily} !important`
                    }
                }}
            />
        </div>
    );
};

export default React.memo(FrameEngine2_Element_Gauge);

