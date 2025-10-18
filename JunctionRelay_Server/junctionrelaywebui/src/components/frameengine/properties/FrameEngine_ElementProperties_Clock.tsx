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

export const ClockProperties: React.FC<ElementPropertyPanelProps> = ({
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
                id="clock"
                title="Clock Settings"
                expanded={expandedSections.has('clock')}
                onToggle={onToggleSection}
            />
            {expandedSections.has('clock') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Time Format
                        </label>
                        <select
                            value={getCommonPropertyValue('timeFormat') || '12h'}
                            onChange={(e) => updateElementProperty('timeFormat', e.target.value)}
                            style={inputStyle}
                        >
                            <option value="12h">12-hour (AM/PM)</option>
                            <option value="24h">24-hour</option>
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                            Timezone
                        </label>
                        <select
                            value={getCommonPropertyValue('timezone') || 'America/Chicago'}
                            onChange={(e) => updateElementProperty('timezone', e.target.value)}
                            style={inputStyle}
                        >
                            <option value="America/New_York">Eastern (US)</option>
                            <option value="America/Chicago">Central (US)</option>
                            <option value="America/Denver">Mountain (US)</option>
                            <option value="America/Los_Angeles">Pacific (US)</option>
                            <option value="America/Anchorage">Alaska</option>
                            <option value="Pacific/Honolulu">Hawaii</option>
                            <option value="Europe/London">London</option>
                            <option value="Europe/Paris">Paris</option>
                            <option value="Asia/Tokyo">Tokyo</option>
                            <option value="Australia/Sydney">Sydney</option>
                            <option value="UTC">UTC</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#333' }}>
                            <input
                                type="checkbox"
                                checked={getCommonPropertyValue('showSeconds') !== false}
                                onChange={(e) => updateElementProperty('showSeconds', e.target.checked)}
                            />
                            Show Seconds
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#333' }}>
                            <input
                                type="checkbox"
                                checked={getCommonPropertyValue('showDate') || false}
                                onChange={(e) => updateElementProperty('showDate', e.target.checked)}
                            />
                            Show Date
                        </label>
                    </div>
                </div>
            )}

            <SectionHeader
                id="clockTypography"
                title="Clock Typography"
                expanded={expandedSections.has('clockTypography')}
                onToggle={onToggleSection}
            />
            {expandedSections.has('clockTypography') && (
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <TypographyControls
                        prefix="clock"
                        getValue={getCommonPropertyValue}
                        onChange={updateElementProperty}
                    />
                </div>
            )}
        </>
    );
};