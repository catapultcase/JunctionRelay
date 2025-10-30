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
import WidgetsIcon from '@mui/icons-material/Widgets';
import TuneIcon from '@mui/icons-material/Tune';
import type { PlacedElement } from './types/FrameEngine2_LayoutTypes';
import FrameEngine2_Tab_Library from './FrameEngine2_Tab_Library';
import FrameEngine2_Tab_Properties from './FrameEngine2_Tab_Properties';

interface FrameEngine2_Sidebar_RightProps {
    /** Currently selected element */
    selectedElement: PlacedElement | null;

    /** Callback to update element properties */
    onUpdateElement: (elementId: string, updates: Partial<PlacedElement>) => void;

    /** Callback to delete element */
    onDeleteElement: (elementId: string) => void;
}

const FrameEngine2_Sidebar_Right: React.FC<FrameEngine2_Sidebar_RightProps> = ({
    selectedElement,
    onUpdateElement,
    onDeleteElement
}) => {
    const [currentTab, setCurrentTab] = useState(0);

    const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
        setCurrentTab(newValue);
    };

    // Auto-switch to Properties tab when element is selected
    useEffect(() => {
        if (selectedElement) {
            setCurrentTab(1); // Switch to Properties tab
        }
    }, [selectedElement]);

    return (
        <Box
            sx={{
                width: '320px',
                height: '100%',
                flexShrink: 0,
                bgcolor: 'background.paper',
                borderLeft: 1,
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
                            minHeight: '48px'
                        }
                    }}
                >
                    <Tab icon={<WidgetsIcon fontSize="small" />} label="Library" />
                    <Tab icon={<TuneIcon fontSize="small" />} label="Properties" />
                </Tabs>
            </Box>

            {/* Tab Content */}
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
                {currentTab === 0 && <FrameEngine2_Tab_Library />}
                {currentTab === 1 && (
                    <Box sx={{ height: '100%', overflowY: 'auto' }}>
                        <FrameEngine2_Tab_Properties
                            selectedElement={selectedElement}
                            onUpdateElement={onUpdateElement}
                            onDeleteElement={onDeleteElement}
                        />
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export default React.memo(FrameEngine2_Sidebar_Right);
