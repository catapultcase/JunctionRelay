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
 * Props for the Text element component
 */
interface TextElementProps {
    /** Element properties */
    properties: {
        text?: string;
        fontSize?: number;
        fontFamily?: string;
        fontWeight?: string;
        color?: string;
        backgroundColor?: string;
        textAlign?: 'left' | 'center' | 'right';
        verticalAlign?: 'top' | 'center' | 'bottom';
        alignment?: Alignment9Way;
        [key: string]: any;
    };

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
 * Text Element - Displays static text labels
 */
const FrameEngine2_Element_Text: React.FC<TextElementProps> = ({
    properties,
    elementPadding = 4,
    width,
    height
}) => {
    const {
        text = 'Text Element',
        fontSize = 14,
        fontFamily = 'Inter',
        fontWeight = 'normal',
        color = '#000000',
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

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                padding: `${elementPadding}px`,
                fontSize: `${fontSize}px`,
                fontFamily: cssFontFamily,
                fontWeight,
                color,
                backgroundColor,
                display: 'flex',
                alignItems: alignmentStyles.alignItems,
                justifyContent: alignmentStyles.justifyContent,
                textAlign: derivedTextAlign,
                wordWrap: 'break-word',
                overflow: 'hidden'
            }}
        >
            {text}
        </div>
    );
};

export default React.memo(FrameEngine2_Element_Text);
