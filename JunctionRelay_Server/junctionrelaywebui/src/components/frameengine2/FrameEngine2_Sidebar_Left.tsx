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

/* eslint-disable react/jsx-pascal-case */
// Note: Component names use underscore naming convention for namespace organization (FrameEngine2_*)
// This is a deliberate architectural choice and does not violate PascalCase - the components ARE PascalCase

import React, { useState, useEffect } from 'react';
import { Box, Tabs, Tab } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import LinkIcon from '@mui/icons-material/Link';
import type { FrameLayoutConfig, PlacedElement } from './types/FrameEngine2_LayoutTypes';
import FrameEngine2_Tab_Layout from './FrameEngine2_Tab_Layout';
import FrameEngine2_Tab_Element from './FrameEngine2_Tab_Element';
import FrameEngine2_Tab_Bindings from './FrameEngine2_Tab_Bindings';

interface FrameEngine2_Sidebar_LeftProps {
    /** Current layout configuration */
    layout: FrameLayoutConfig;

    /** Callback to update layout configuration */
    onLayoutUpdate: (updates: Partial<FrameLayoutConfig>) => void;

    /** All elements (for z-index management) */
    elements: PlacedElement[];

    /** Currently selected element */
    selectedElement: PlacedElement | null;

    /** Callback to select an element */
    onSelectElement: (elementId: string | null) => void;

    /** Callback to update element properties */
    onUpdateElement: (elementId: string, updates: Partial<PlacedElement>) => void;

    /** Included sensor tags for Value Generator */
    includedSensorTags: Set<string>;

    /** Callback to toggle sensor tag inclusion */
    onToggleIncludeSensorTag: (sensorTag: string) => void;

    /** Preview mode - locks sidebar to Bindings tab */
    previewMode?: boolean;

    /** Thumbnail URL (if exists) */
    thumbnailUrl: string | null;

    /** Thumbnail loading state */
    thumbnailLoading: boolean;

    /** Callback to capture thumbnail from canvas */
    onCaptureThumbnail: () => void;

    /** Callback to upload custom thumbnail */
    onUploadThumbnail: (file: File) => void;

    /** Current tab index (controlled by parent) */
    currentTab: number;

    /** Callback when tab changes */
    onTabChange: (tab: number) => void;
}

const FrameEngine2_Sidebar_Left: React.FC<FrameEngine2_Sidebar_LeftProps> = ({
    layout,
    onLayoutUpdate,
    elements,
    selectedElement,
    onSelectElement,
    onUpdateElement,
    includedSensorTags,
    onToggleIncludeSensorTag,
    previewMode = false,
    thumbnailUrl,
    thumbnailLoading,
    onCaptureThumbnail,
    onUploadThumbnail,
    currentTab,
    onTabChange
}) => {
    // Force tab to Bindings (index 2) when in preview mode
    useEffect(() => {
        if (previewMode) {
            onTabChange(2);
        }
    }, [previewMode, onTabChange]);

    const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
        // Disable tab changes in preview mode
        if (previewMode) return;
        onTabChange(newValue);
    };

    return (
        <Box
            sx={{
                width: '320px',
                height: '100%',
                flexShrink: 0,
                bgcolor: 'background.paper',
                borderRight: 1,
                borderColor: 'divider',
                display: 'flex',
                flexDirection: 'column'
            }}
        >
            {/* Tabs Header */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs
                    value={currentTab}
                    onChange={handleTabChange}
                    variant="fullWidth"
                    sx={{
                        minHeight: '48px',
                        '& .MuiTab-root': {
                            minHeight: '48px',
                            // Visually indicate locked state in preview mode
                            ...(previewMode && {
                                opacity: 0.5,
                                cursor: 'not-allowed',
                                '&.Mui-selected': {
                                    opacity: 1
                                }
                            })
                        }
                    }}
                >
                    <Tab
                        icon={<SettingsIcon fontSize="small" />}
                        label="Layout"
                        disabled={previewMode}
                    />
                    <Tab
                        icon={<ViewInArIcon fontSize="small" />}
                        label="Elements"
                        disabled={previewMode}
                    />
                    <Tab
                        icon={<LinkIcon fontSize="small" />}
                        label={previewMode ? "Bindings (Preview)" : "Bindings"}
                    />
                </Tabs>
            </Box>

            {/* Tab Content */}
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
                {currentTab === 0 && (
                    <FrameEngine2_Tab_Layout
                        layout={layout}
                        onLayoutUpdate={onLayoutUpdate}
                        thumbnailUrl={thumbnailUrl}
                        thumbnailLoading={thumbnailLoading}
                        onCaptureThumbnail={onCaptureThumbnail}
                        onUploadThumbnail={onUploadThumbnail}
                    />
                )}
                {currentTab === 1 && (
                    <FrameEngine2_Tab_Element
                        selectedElement={selectedElement}
                        elements={elements}
                        onSelectElement={onSelectElement}
                        onUpdateElement={onUpdateElement}
                    />
                )}
                {currentTab === 2 && (
                    <FrameEngine2_Tab_Bindings
                        elements={elements}
                        layout={layout}
                        onLayoutUpdate={onLayoutUpdate}
                        includedSensorTags={includedSensorTags}
                        onToggleIncludeSensorTag={onToggleIncludeSensorTag}
                    />
                )}
            </Box>
        </Box>
    );
};

export default React.memo(FrameEngine2_Sidebar_Left);
