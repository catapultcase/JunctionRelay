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

import React, { useMemo, useCallback } from 'react';
import { Box, Typography, IconButton, Tooltip, Paper } from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import WarningIcon from '@mui/icons-material/Warning';
import type { PlacedElement } from './types/FrameEngine2_LayoutTypes';
import { getElementIcon, getElementDisplayName } from './FrameEngine2_ElementIcons';
import { elementMissingSensorTag } from './FrameEngine2_Validation';

interface FrameEngine2_Tab_ElementProps {
    /** Currently selected element */
    selectedElement: PlacedElement | null;

    /** All elements (for list and z-index management) */
    elements: PlacedElement[];

    /** Callback to select an element */
    onSelectElement: (elementId: string | null) => void;

    /** Callback to update element properties */
    onUpdateElement: (elementId: string, updates: Partial<PlacedElement>) => void;
}

/**
 * Element tab content for left sidebar
 * Shows list of all elements in z-order (front to back)
 */
const FrameEngine2_Tab_Element: React.FC<FrameEngine2_Tab_ElementProps> = ({
    selectedElement,
    elements,
    onSelectElement,
    onUpdateElement
}) => {
    // Sort elements by z-index (highest first = front)
    // Memoized to avoid sorting on every render
    const sortedElements = useMemo(() => {
        return [...elements].sort((a, b) => {
            const aZ = a.zIndex || 0;
            const bZ = b.zIndex || 0;
            return bZ - aZ; // Descending order
        });
    }, [elements]);

    /**
     * Move element forward in z-index (toward front) - swap with element above in list
     * Wrapped in useCallback to prevent unnecessary re-renders
     */
    const handleMoveForward = useCallback((element: PlacedElement, e: React.MouseEvent, currentIndex: number) => {
        e.stopPropagation(); // Prevent element selection
        if (currentIndex > 0) {
            // Swap z-index with element above (higher z-index)
            const elementAbove = sortedElements[currentIndex - 1];
            const currentZ = element.zIndex || 0;
            const aboveZ = elementAbove.zIndex || 0;
            onUpdateElement(element.id, { zIndex: aboveZ });
            onUpdateElement(elementAbove.id, { zIndex: currentZ });
        }
    }, [sortedElements, onUpdateElement]);

    /**
     * Move element backward in z-index (toward back) - swap with element below in list
     * Wrapped in useCallback to prevent unnecessary re-renders
     */
    const handleMoveBackward = useCallback((element: PlacedElement, e: React.MouseEvent, currentIndex: number) => {
        e.stopPropagation(); // Prevent element selection
        if (currentIndex < sortedElements.length - 1) {
            // Swap z-index with element below (lower z-index)
            const elementBelow = sortedElements[currentIndex + 1];
            const currentZ = element.zIndex || 0;
            const belowZ = elementBelow.zIndex || 0;
            onUpdateElement(element.id, { zIndex: belowZ });
            onUpdateElement(elementBelow.id, { zIndex: currentZ });
        }
    }, [sortedElements, onUpdateElement]);

    /**
     * Toggle visibility
     * Wrapped in useCallback to prevent unnecessary re-renders
     */
    const handleToggleVisibility = useCallback((element: PlacedElement, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent element selection
        onUpdateElement(element.id, { visible: !(element.visible !== false) });
    }, [onUpdateElement]);

    /**
     * Toggle lock
     * Wrapped in useCallback to prevent unnecessary re-renders
     */
    const handleToggleLock = useCallback((element: PlacedElement, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent element selection
        onUpdateElement(element.id, { locked: !(element.locked === true) });
    }, [onUpdateElement]);

    if (elements.length === 0) {
        return (
            <Box
                sx={{
                    p: 1.5,
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
            >
                <Typography variant="caption" color="text.secondary" textAlign="center">
                    No elements on canvas
                </Typography>
            </Box>
        );
    }

    return (
        <Box
            sx={{
                p: 1,
                height: '100%',
                overflowY: 'auto'
            }}
        >
            <Typography variant="caption" color="text.secondary" display="block" mb={1} px={0.5}>
                Elements (top of list = front):
            </Typography>

            {sortedElements.map((element, index) => {
                const isSelected = selectedElement?.id === element.id;
                const isVisible = element.visible !== false;
                const isLocked = element.locked === true;
                const currentZIndex = element.zIndex || 0;
                const canMoveForward = index > 0; // Not already at front
                const canMoveBackward = index < sortedElements.length - 1; // Not already at back

                return (
                    <Paper
                        key={element.id}
                        elevation={0}
                        onClick={() => onSelectElement(element.id)}
                        sx={{
                            p: 1,
                            mb: 0.5,
                            cursor: 'pointer',
                            border: 1,
                            borderColor: isSelected ? 'primary.main' : 'divider',
                            bgcolor: isSelected ? 'action.selected' : 'background.paper',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                                bgcolor: isSelected ? 'action.selected' : 'action.hover',
                                borderColor: isSelected ? 'primary.main' : 'primary.light'
                            }
                        }}
                    >
                        {/* Element Info Row */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                            <Box sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>
                                {getElementIcon(element.type, 'small')}
                            </Box>
                            <Typography variant="caption" fontWeight="bold" flex={1}>
                                {getElementDisplayName(element.type)}
                            </Typography>
                            {elementMissingSensorTag(element) && (
                                <Tooltip title="Missing required SensorTag" arrow>
                                    <WarningIcon sx={{ fontSize: 14, color: 'warning.main', mr: 0.5 }} />
                                </Tooltip>
                            )}
                            <Typography variant="caption" color="text.secondary" fontSize="10px">
                                Z:{currentZIndex}
                            </Typography>
                        </Box>

                        <Typography variant="caption" color="text.secondary" display="block" fontSize="10px" mb={0.5}>
                            ID: ...{element.id.slice(-16)}
                        </Typography>

                        {/* Controls Row */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {/* Z-Index Controls */}
                            <Tooltip title="Move Forward">
                                <span>
                                    <IconButton
                                        size="small"
                                        onClick={(e) => handleMoveForward(element, e, index)}
                                        disabled={!canMoveForward}
                                        sx={{ p: 0.25 }}
                                    >
                                        <ArrowUpwardIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                </span>
                            </Tooltip>
                            <Tooltip title="Move Backward">
                                <span>
                                    <IconButton
                                        size="small"
                                        onClick={(e) => handleMoveBackward(element, e, index)}
                                        disabled={!canMoveBackward}
                                        sx={{ p: 0.25 }}
                                    >
                                        <ArrowDownwardIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                </span>
                            </Tooltip>

                            <Box sx={{ flex: 1 }} />

                            {/* Visibility Toggle */}
                            <Tooltip title={isVisible ? 'Hide' : 'Show'}>
                                <IconButton
                                    size="small"
                                    onClick={(e) => handleToggleVisibility(element, e)}
                                    sx={{ p: 0.25 }}
                                >
                                    {isVisible ? (
                                        <VisibilityIcon sx={{ fontSize: 14 }} />
                                    ) : (
                                        <VisibilityOffIcon sx={{ fontSize: 14, opacity: 0.5 }} />
                                    )}
                                </IconButton>
                            </Tooltip>

                            {/* Lock Toggle */}
                            <Tooltip title={isLocked ? 'Unlock' : 'Lock'}>
                                <IconButton
                                    size="small"
                                    onClick={(e) => handleToggleLock(element, e)}
                                    sx={{ p: 0.25 }}
                                >
                                    {isLocked ? (
                                        <LockIcon sx={{ fontSize: 14 }} />
                                    ) : (
                                        <LockOpenIcon sx={{ fontSize: 14, opacity: 0.5 }} />
                                    )}
                                </IconButton>
                            </Tooltip>
                        </Box>
                    </Paper>
                );
            })}
        </Box>
    );
};

export default FrameEngine2_Tab_Element;
