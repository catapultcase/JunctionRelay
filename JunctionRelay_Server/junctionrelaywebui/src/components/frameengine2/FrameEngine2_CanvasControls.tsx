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

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useTheme } from '@mui/material/styles';
import { RgbaColorPicker, HexColorInput } from 'react-colorful';
import type { FrameLayoutConfig, PlacedElement, GridSettings, CanvasSettings } from './types/FrameEngine2_LayoutTypes';
import { getElementsMissingSensorTagCount } from './FrameEngine2_Validation';
import FrameEngine2_ResetViewButton from './FrameEngine2_ResetViewButton';
import { DEFAULT_CANVAS_SETTINGS } from './FrameEngine2_Data';

interface RgbaColor {
    r: number;
    g: number;
    b: number;
    a: number;
}

/**
 * Convert RgbaColor to hex string
 */
const rgbaToHex = (color: RgbaColor): string => {
    const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
    if (color.a < 1) {
        const alpha = Math.round(color.a * 255);
        return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}${toHex(alpha)}`;
    }
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
};

/**
 * Convert hex string to RgbaColor
 */
const hexToRgba = (hex: string): RgbaColor => {
    const cleanHex = hex.replace('#', '');
    if (cleanHex.length === 6) {
        return {
            r: parseInt(cleanHex.slice(0, 2), 16),
            g: parseInt(cleanHex.slice(2, 4), 16),
            b: parseInt(cleanHex.slice(4, 6), 16),
            a: 1
        };
    } else if (cleanHex.length === 8) {
        return {
            r: parseInt(cleanHex.slice(0, 2), 16),
            g: parseInt(cleanHex.slice(2, 4), 16),
            b: parseInt(cleanHex.slice(4, 6), 16),
            a: parseInt(cleanHex.slice(6, 8), 16) / 255
        };
    }
    return { r: 0, g: 0, b: 0, a: 1 };
};

interface FrameEngine2_CanvasControlsProps {
    /** Current layout configuration */
    layout: FrameLayoutConfig;

    /** Callback to update layout configuration */
    onLayoutUpdate: (updates: Partial<FrameLayoutConfig>) => void;

    /** Whether the debug panel is currently shown */
    showDebugPanel: boolean;

    /** Callback to toggle debug panel visibility */
    onToggleDebugPanel: () => void;

    /** Callback to reset canvas viewport */
    onResetView: () => void;

    /** All elements (for validation warnings) */
    elements: PlacedElement[];

    /** Color picker visibility */
    colorPickerVisible: boolean;

    /** Current color picker value (RGBA format) */
    colorPickerColor: RgbaColor;

    /** Color picker change handler */
    onColorPickerChange: (color: RgbaColor) => void;

    /** Color picker close handler */
    onColorPickerClose: () => void;

    /** Preview mode - hides canvas options */
    previewMode?: boolean;
}

/**
 * Canvas control panel component (positioned top-right)
 * Provides controls for grid, element padding, and debug panel toggle
 *
 * Performance notes:
 * - All styles memoized to prevent recreation
 * - Event handlers wrapped in useCallback
 * - Uses state-based hover instead of direct DOM manipulation
 */
const FrameEngine2_CanvasControls: React.FC<FrameEngine2_CanvasControlsProps> = ({
    layout,
    onLayoutUpdate,
    showDebugPanel,
    onToggleDebugPanel,
    onResetView,
    elements,
    colorPickerVisible,
    colorPickerColor,
    onColorPickerChange,
    onColorPickerClose,
    previewMode = false
}) => {
    const theme = useTheme();

    // State for hover tracking and expansion
    const [isDebugButtonHovered, setIsDebugButtonHovered] = useState(false);
    const [isCanvasOptionsExpanded, setIsCanvasOptionsExpanded] = useState(() => {
        // Initialize from localStorage, default to true
        const stored = localStorage.getItem('frameengine2_canvasOptionsExpanded');
        return stored !== null ? stored === 'true' : true;
    });

    // Persist expanded state to localStorage
    useEffect(() => {
        localStorage.setItem('frameengine2_canvasOptionsExpanded', String(isCanvasOptionsExpanded));
    }, [isCanvasOptionsExpanded]);

    // Calculate count of elements missing required sensorTags (memoized for performance)
    const missingSensorTagCount = useMemo(() => {
        return getElementsMissingSensorTagCount(elements);
    }, [elements]);

    // Get current canvas settings or use defaults (memoized)
    const canvasSettings = useMemo(() => {
        return layout.canvasSettings || DEFAULT_CANVAS_SETTINGS;
    }, [layout.canvasSettings]);

    const { grid, elementPadding } = canvasSettings;

    /**
     * Update canvas settings
     * OPTIMIZATION: Wrapped in useCallback for stable reference
     */
    const updateCanvasSettings = useCallback((updates: {
        grid?: Partial<GridSettings>;
        elementPadding?: number;
    }) => {
        const newSettings: CanvasSettings = {
            grid: {
                snapToGrid: grid.snapToGrid,
                showGrid: grid.showGrid,
                showOutlines: grid.showOutlines,
                gridSize: grid.gridSize,
                gridColor: grid.gridColor,
                ...updates.grid
            },
            elementPadding: updates.elementPadding !== undefined ? updates.elementPadding : elementPadding
        };

        onLayoutUpdate({ canvasSettings: newSettings });
    }, [grid, elementPadding, onLayoutUpdate]);

    /**
     * Handle grid setting changes
     * OPTIMIZATION: All wrapped in useCallback
     */
    const handleShowOutlinesChange = useCallback((value: boolean) => {
        updateCanvasSettings({ grid: { showOutlines: value } });
    }, [updateCanvasSettings]);

    const handleShowGridChange = useCallback((value: boolean) => {
        updateCanvasSettings({ grid: { showGrid: value } });
    }, [updateCanvasSettings]);

    const handleSnapToGridChange = useCallback((value: boolean) => {
        updateCanvasSettings({ grid: { snapToGrid: value } });
    }, [updateCanvasSettings]);

    const handleGridSizeChange = useCallback((value: number) => {
        updateCanvasSettings({ grid: { gridSize: value } });
    }, [updateCanvasSettings]);

    const handleGridColorChange = useCallback((value: string) => {
        updateCanvasSettings({ grid: { gridColor: value } });
    }, [updateCanvasSettings]);

    const handleElementPaddingChange = useCallback((value: number) => {
        updateCanvasSettings({ elementPadding: value });
    }, [updateCanvasSettings]);

    /**
     * Memoized style objects
     * OPTIMIZATION: Prevents object recreation on every render
     */
    const containerStyle = useMemo(() => ({
        position: 'absolute' as const,
        top: '16px',
        right: '16px',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '8px',
        width: '218px'
    }), []);

    const warningBannerStyle = useMemo(() => ({
        backgroundColor: theme.palette.warning.main,
        color: theme.palette.warning.contrastText,
        padding: '8px 12px',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 'bold',
        boxShadow: theme.shadows[2],
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
    }), [theme]);

    const debugButtonStyle = useMemo(() => ({
        padding: '8px 12px',
        fontSize: '12px',
        backgroundColor: showDebugPanel
            ? theme.palette.primary.main
            : (isDebugButtonHovered ? theme.palette.action.hover : theme.palette.background.paper),
        color: showDebugPanel
            ? theme.palette.primary.contrastText
            : theme.palette.text.primary,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: '4px',
        cursor: 'pointer',
        boxShadow: theme.shadows[2],
        fontWeight: 'bold'
    }), [theme, showDebugPanel, isDebugButtonHovered]);

    const controlPanelStyle = useMemo(() => ({
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: '4px',
        padding: '8px',
        boxShadow: theme.shadows[2],
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '6px'
    }), [theme]);

    const checkboxLabelStyle = useMemo(() => ({
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '12px',
        fontWeight: 500,
        color: theme.palette.text.primary,
        cursor: 'pointer'
    }), [theme]);

    const checkboxStyle = useMemo(() => ({
        cursor: 'pointer'
    }), []);

    const inputRowStyle = useMemo(() => ({
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '11px',
        color: theme.palette.text.secondary,
        minHeight: '28px',
        padding: '4px 0'
    }), [theme]);

    const numberInputStyle = useMemo(() => ({
        width: '45px',
        height: '24px',
        padding: '4px 6px',
        fontSize: '11px',
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: '3px',
        textAlign: 'center' as const,
        backgroundColor: theme.palette.background.paper,
        color: theme.palette.text.primary
    }), [theme]);

    const colorInputStyle = useMemo(() => ({
        width: '24px',
        height: '24px',
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: '3px',
        cursor: 'pointer',
        backgroundColor: 'transparent'
    }), [theme]);

    const expandableCardStyle = useMemo(() => ({
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: '4px',
        boxShadow: theme.shadows[2],
        overflow: 'hidden'
    }), [theme]);

    const expandableHeaderStyle = useMemo(() => ({
        padding: '8px 12px',
        fontSize: '12px',
        fontWeight: 600,
        color: theme.palette.text.primary,
        backgroundColor: theme.palette.action.hover,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        userSelect: 'none' as const
    }), [theme]);

    const separatorStyle = useMemo(() => ({
        height: '1px',
        backgroundColor: theme.palette.divider,
        margin: '6px 0'
    }), [theme]);

    const debugButtonContainerStyle = useMemo(() => ({
        position: 'absolute' as const,
        bottom: '16px',
        right: '16px',
        zIndex: 100
    }), []);

    return (
        <>
            {/* Top-right controls */}
            <div style={containerStyle}>
                {/* Validation Warning Banner */}
                {missingSensorTagCount > 0 && (
                    <div style={warningBannerStyle}>
                        ⚠️ {missingSensorTagCount} element{missingSensorTagCount !== 1 ? 's' : ''} missing SensorTag
                    </div>
                )}

                {/* Reset View Button */}
                <FrameEngine2_ResetViewButton onReset={onResetView} />

                {/* Canvas Options - Expandable Card (Hidden in preview mode) */}
                {!previewMode && (
                <div style={expandableCardStyle}>
                    {/* Expandable Header */}
                    <div
                        style={expandableHeaderStyle}
                        onClick={() => setIsCanvasOptionsExpanded(!isCanvasOptionsExpanded)}
                    >
                        <span>Canvas Options</span>
                        <span style={{ fontSize: '10px' }}>
                            {isCanvasOptionsExpanded ? '▼' : '▶'}
                        </span>
                    </div>

                    {/* Expandable Content */}
                    {isCanvasOptionsExpanded && (
                        <div style={{ padding: '8px' }}>
                            {/* Grid Settings Section */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={checkboxLabelStyle}>
                                    <input
                                        type="checkbox"
                                        checked={grid.showOutlines}
                                        onChange={(e) => handleShowOutlinesChange(e.target.checked)}
                                        style={checkboxStyle}
                                    />
                                    Show Outlines
                                </label>

                                <label style={checkboxLabelStyle}>
                                    <input
                                        type="checkbox"
                                        checked={grid.showGrid}
                                        onChange={(e) => handleShowGridChange(e.target.checked)}
                                        style={checkboxStyle}
                                    />
                                    Show Grid
                                </label>

                                <label style={checkboxLabelStyle}>
                                    <input
                                        type="checkbox"
                                        checked={grid.snapToGrid}
                                        onChange={(e) => handleSnapToGridChange(e.target.checked)}
                                        style={checkboxStyle}
                                    />
                                    Snap to Grid
                                </label>

                                <div style={inputRowStyle}>
                                    <span>Grid size:</span>
                                    <input
                                        type="number"
                                        value={grid.gridSize}
                                        onChange={(e) => handleGridSizeChange(Math.max(1, parseInt(e.target.value) || 1))}
                                        min="1"
                                        max="50"
                                        style={numberInputStyle}
                                    />
                                    <span>px</span>
                                </div>

                                <div style={inputRowStyle}>
                                    <span>Grid color:</span>
                                    <input
                                        type="color"
                                        value={grid.gridColor}
                                        onChange={(e) => handleGridColorChange(e.target.value)}
                                        style={colorInputStyle}
                                    />
                                </div>
                            </div>

                            {/* Separator */}
                            <div style={separatorStyle} />

                            {/* Element Padding Section */}
                            <div style={inputRowStyle}>
                                <span>Element padding:</span>
                                <input
                                    type="number"
                                    value={elementPadding}
                                    onChange={(e) => handleElementPaddingChange(Math.max(4, parseInt(e.target.value) || 4))}
                                    min="4"
                                    max="20"
                                    style={numberInputStyle}
                                />
                                <span>px</span>
                            </div>
                        </div>
                    )}
                </div>
                )}

                {/* Global Color Picker - positioned below Canvas Options */}
                {colorPickerVisible && (
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            boxShadow: theme.shadows[4],
                            borderRadius: '8px',
                            backgroundColor: theme.palette.background.paper,
                            padding: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px'
                        }}
                    >
                        {/* Color picker */}
                        <RgbaColorPicker
                            color={colorPickerColor}
                            onChange={onColorPickerChange}
                        />

                        {/* RGB Inputs */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, 1fr)',
                            gap: '6px',
                            fontSize: '11px'
                        }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ color: theme.palette.text.secondary, fontWeight: 500 }}>R</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="255"
                                    value={Math.round(colorPickerColor.r)}
                                    onChange={(e) => {
                                        const val = Math.max(0, Math.min(255, parseInt(e.target.value) || 0));
                                        onColorPickerChange({ ...colorPickerColor, r: val });
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '4px',
                                        fontSize: '11px',
                                        border: `1px solid ${theme.palette.divider}`,
                                        borderRadius: '3px',
                                        backgroundColor: theme.palette.background.default,
                                        color: theme.palette.text.primary,
                                        textAlign: 'center'
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ color: theme.palette.text.secondary, fontWeight: 500 }}>G</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="255"
                                    value={Math.round(colorPickerColor.g)}
                                    onChange={(e) => {
                                        const val = Math.max(0, Math.min(255, parseInt(e.target.value) || 0));
                                        onColorPickerChange({ ...colorPickerColor, g: val });
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '4px',
                                        fontSize: '11px',
                                        border: `1px solid ${theme.palette.divider}`,
                                        borderRadius: '3px',
                                        backgroundColor: theme.palette.background.default,
                                        color: theme.palette.text.primary,
                                        textAlign: 'center'
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ color: theme.palette.text.secondary, fontWeight: 500 }}>B</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="255"
                                    value={Math.round(colorPickerColor.b)}
                                    onChange={(e) => {
                                        const val = Math.max(0, Math.min(255, parseInt(e.target.value) || 0));
                                        onColorPickerChange({ ...colorPickerColor, b: val });
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '4px',
                                        fontSize: '11px',
                                        border: `1px solid ${theme.palette.divider}`,
                                        borderRadius: '3px',
                                        backgroundColor: theme.palette.background.default,
                                        color: theme.palette.text.primary,
                                        textAlign: 'center'
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ color: theme.palette.text.secondary, fontWeight: 500 }}>A</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={colorPickerColor.a.toFixed(2)}
                                    onChange={(e) => {
                                        const val = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
                                        onColorPickerChange({ ...colorPickerColor, a: val });
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '4px',
                                        fontSize: '11px',
                                        border: `1px solid ${theme.palette.divider}`,
                                        borderRadius: '3px',
                                        backgroundColor: theme.palette.background.default,
                                        color: theme.palette.text.primary,
                                        textAlign: 'center'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Hex Input */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '11px', color: theme.palette.text.secondary, fontWeight: 500 }}>HEX</label>
                            <HexColorInput
                                color={rgbaToHex(colorPickerColor)}
                                onChange={(hex) => onColorPickerChange(hexToRgba(hex))}
                                alpha={colorPickerColor.a < 1}
                                prefixed
                                style={{
                                    width: '100%',
                                    padding: '6px',
                                    fontSize: '12px',
                                    border: `1px solid ${theme.palette.divider}`,
                                    borderRadius: '3px',
                                    backgroundColor: theme.palette.background.default,
                                    color: theme.palette.text.primary,
                                    fontFamily: 'monospace',
                                    textAlign: 'center'
                                }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom-right Debug button */}
            <div style={debugButtonContainerStyle}>
                <button
                    onClick={onToggleDebugPanel}
                    style={debugButtonStyle}
                    onMouseEnter={() => setIsDebugButtonHovered(true)}
                    onMouseLeave={() => setIsDebugButtonHovered(false)}
                    title="Toggle sensor tag debug panel"
                >
                    {showDebugPanel ? 'Hide Debug' : 'Show Debug'}
                </button>
            </div>
        </>
    );
};

export default React.memo(FrameEngine2_CanvasControls);
