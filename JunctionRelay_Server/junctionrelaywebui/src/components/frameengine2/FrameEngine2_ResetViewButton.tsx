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

import React, { useState, useMemo } from 'react';
import { useTheme } from '@mui/material/styles';

interface FrameEngine2_ResetViewButtonProps {
    /** Callback when reset is clicked */
    onReset: () => void;
}

/**
 * Reset View button for canvas viewport
 *
 * Resets the canvas pan and zoom to default:
 * - Centers the canvas in viewport
 * - Sets zoom to 100% (1x scale)
 *
 * Styled as a tiled button matching the Debug toggle button.
 * Positioned in CanvasControls below the Debug button.
 *
 * Performance notes:
 * - Memoized styles to prevent recreation
 * - State-based hover instead of direct DOM manipulation
 */
const FrameEngine2_ResetViewButton: React.FC<FrameEngine2_ResetViewButtonProps> = ({ onReset }) => {
    const theme = useTheme();
    const [isHovered, setIsHovered] = useState(false);

    /**
     * Memoized button style
     * OPTIMIZATION: Prevents object recreation on every render
     */
    const buttonStyle = useMemo(() => ({
        padding: '8px 12px',
        fontSize: '12px',
        backgroundColor: isHovered ? theme.palette.action.hover : theme.palette.background.paper,
        color: theme.palette.text.primary,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: '4px',
        cursor: 'pointer',
        boxShadow: theme.shadows[2],
        fontWeight: 'bold',
        width: '100%'
    }), [theme, isHovered]);

    return (
        <button
            onClick={onReset}
            style={buttonStyle}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            title="Reset view to fit and center (100% zoom)"
        >
            Reset View
        </button>
    );
};

export default React.memo(FrameEngine2_ResetViewButton);
