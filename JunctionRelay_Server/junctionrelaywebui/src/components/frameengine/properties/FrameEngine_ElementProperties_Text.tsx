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
import type { ElementPropertyPanelProps } from './FrameEngine_ElementProperties_Types';
import { inputStyle } from './FrameEngine_ElementProperties_Types';
import {
    SectionHeader,
    TypographyControls,
    useCommonPropertyValue,
    useElementPropertyUpdate
} from './FrameEngine_ElementProperties_Shared';

export const TextProperties: React.FC<ElementPropertyPanelProps> = ({
    selectedElements,
    onElementUpdate,
    expandedSections,
    onToggleSection
}) => {
    const getCommonPropertyValue = useCommonPropertyValue(selectedElements);
    const updateElementProperty = useElementPropertyUpdate(selectedElements, onElementUpdate);

    return (
        <>
            <SectionHeader
                id="text"
                title="Text Settings"
                expanded={expandedSections.has('text')}
                onToggle={onToggleSection}
            />
            {expandedSections.has('text') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Text Content
                        </label>
                        <textarea
                            value={getCommonPropertyValue('text')}
                            onChange={(e) => updateElementProperty('text', e.target.value)}
                            rows={2}
                            style={inputStyle}
                        />
                    </div>
                </div>
            )}

            <SectionHeader
                id="textTypography"
                title="Text Typography"
                expanded={expandedSections.has('textTypography')}
                onToggle={onToggleSection}
            />
            {expandedSections.has('textTypography') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <TypographyControls
                        prefix="text"
                        getValue={getCommonPropertyValue}
                        onChange={updateElementProperty}
                    />
                </div>
            )}
        </>
    );
};