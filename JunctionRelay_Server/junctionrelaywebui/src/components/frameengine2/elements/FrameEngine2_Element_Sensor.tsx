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

import React, { useEffect, useMemo } from 'react';
import { loadGoogleFont } from '../FrameEngine2_FontLoader';
import type { Alignment9Way } from '../types/FrameEngine2_ElementTypes';

/**
 * Props for the Sensor element component
 */
interface SensorElementProps {
    /** Element properties */
    properties: {
        sensorTag?: string;
        showLabel?: boolean;
        showUnit?: boolean;
        placeholderSensorLabel?: string;
        placeholderValue?: string | number;
        placeholderUnit?: string;
        fontSize?: number;
        fontFamily?: string;
        fontWeight?: string;
        textColor?: string;
        backgroundColor?: string;
        textAlign?: 'left' | 'center' | 'right';
        verticalAlign?: 'top' | 'center' | 'bottom';
        alignment?: Alignment9Way;
        [key: string]: any;
    };

    /** Resolved sensor values (Live > Test > Placeholder hierarchy already applied) */
    resolvedValues: Record<string, any>;

    /** Whether to show placeholders when no data */
    showPlaceholders?: boolean;

    /** Element padding in pixels */
    elementPadding?: number;

    /** Element dimensions */
    width: number;
    height: number;
}

/**
 * Convert 9-way alignment to flexbox properties
 */
const getAlignmentStyles = (alignment: Alignment9Way) => {
    const alignmentMap: Record<Alignment9Way, { alignItems: string; justifyContent: string }> = {
        'top-left': { alignItems: 'flex-start', justifyContent: 'flex-start' },
        'top-center': { alignItems: 'flex-start', justifyContent: 'center' },
        'top-right': { alignItems: 'flex-start', justifyContent: 'flex-end' },
        'middle-left': { alignItems: 'center', justifyContent: 'flex-start' },
        'center': { alignItems: 'center', justifyContent: 'center' },
        'middle-right': { alignItems: 'center', justifyContent: 'flex-end' },
        'bottom-left': { alignItems: 'flex-end', justifyContent: 'flex-start' },
        'bottom-center': { alignItems: 'flex-end', justifyContent: 'center' },
        'bottom-right': { alignItems: 'flex-end', justifyContent: 'flex-end' }
    };
    return alignmentMap[alignment];
};

/**
 * Sensor Element - Displays live sensor values
 *
 * Data hierarchy (handled by SensorTagManager):
 * 1. Live sensor data (highest priority) - from WebSocket sensors payload
 * 2. Test values (for testing in editor) - from layout.sensorTestValues
 * 3. Placeholder values (when no data available) - from element properties
 */
const FrameEngine2_Element_Sensor: React.FC<SensorElementProps> = ({
    properties,
    resolvedValues,
    showPlaceholders = true,
    elementPadding = 4,
    width,
    height
}) => {
    const {
        sensorTag,
        showLabel = true,
        showUnit = true,
        placeholderSensorLabel = 'Sensor',
        placeholderValue = '--',
        placeholderUnit = '',
        fontSize = 12,
        fontFamily = 'Inter',
        fontWeight = 'normal',
        textColor = '#000000',
        backgroundColor = 'transparent',
        textAlign = 'left',
        verticalAlign = 'center',
        alignment = 'center'
    } = properties;

    // Load Google Font when needed
    useEffect(() => {
        if (fontFamily && fontFamily !== 'Inter') {
            loadGoogleFont(fontFamily);
        }
    }, [fontFamily]);

    // Format font family for CSS (add quotes if it contains spaces)
    const cssFontFamily = fontFamily.includes(' ') ? `"${fontFamily}"` : fontFamily;

    // Get alignment styles (memoized for performance)
    const alignmentStyles = useMemo(() => getAlignmentStyles(alignment), [alignment]);

    // Derive text alignment from 9-way alignment for text content
    const derivedTextAlign = useMemo(() => {
        if (alignment.includes('left')) return 'left';
        if (alignment.includes('right')) return 'right';
        return 'center';
    }, [alignment]);

    /**
     * Data priority hierarchy: LIVE > TEST > PLACEHOLDER
     *
     * Live/Test data structure (from resolvedValues):
     *   { value: number|string, unit: string }  OR  just the value directly
     *
     * Placeholder data structure (from properties):
     *   { placeholderSensorLabel, placeholderValue, placeholderUnit }
     */
    let labelToDisplay: string;
    let valueToDisplay: string | number;
    let unitToDisplay: string;

    // Check if we have live or test data (resolvedValues hierarchy is already applied by SensorTagManager)
    const resolvedData = sensorTag ? resolvedValues[sensorTag] : undefined;

    if (resolvedData !== undefined && resolvedData !== null && typeof resolvedData === 'object' && 'value' in resolvedData) {
        // Live or Test data is available - structured format only
        valueToDisplay = resolvedData.value;
        unitToDisplay = resolvedData.unit || '';
        labelToDisplay = resolvedData.label || placeholderSensorLabel;
    } else {
        // No live/test data - use placeholder
        if (!showPlaceholders) {
            return (
                <div
                    style={{
                        width: '100%',
                        height: '100%',
                        padding: `${elementPadding}px`,
                        fontSize: `${fontSize}px`,
                        fontFamily: cssFontFamily,
                        fontWeight,
                        color: '#888888',
                        backgroundColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center'
                    }}
                >
                    NO DATA
                </div>
            );
        }
        labelToDisplay = placeholderSensorLabel;
        valueToDisplay = placeholderValue;
        unitToDisplay = placeholderUnit;
    }

    // Build display string based on showLabel/showUnit flags
    const labelText = showLabel ? labelToDisplay : '';
    const valueText = valueToDisplay.toString();
    const unitText = showUnit ? unitToDisplay : '';

    let content = '';
    if (labelText) content += labelText + ' ';
    content += valueText;
    if (unitText) content += ' ' + unitText;

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                padding: `${elementPadding}px`,
                fontSize: `${fontSize}px`,
                fontFamily: cssFontFamily,
                fontWeight,
                color: textColor,
                backgroundColor,
                display: 'flex',
                alignItems: alignmentStyles.alignItems,
                justifyContent: alignmentStyles.justifyContent,
                textAlign: derivedTextAlign,
                wordWrap: 'break-word',
                overflow: 'hidden'
            }}
        >
            {content}
        </div>
    );
};

export default React.memo(FrameEngine2_Element_Sensor);
