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

import React, { useState, useMemo, useCallback } from 'react';
import { useTheme } from '@mui/material/styles';

interface FrameEngine2ToolbarProps {
    layoutId?: string;
    layoutName?: string;
    width?: number;
    height?: number;
    zoom?: number;
    elementCount?: number;
    previewMode?: boolean;
    onQuickSave?: () => void;
    onSave?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onPreview?: () => void;
    onScreenshot?: () => void;
    onGifCapture?: () => void;
    onExport?: () => void;
}

const FrameEngine2_Toolbar: React.FC<FrameEngine2ToolbarProps> = ({
    layoutId = '?',
    layoutName,
    width = 1920,
    height = 1080,
    zoom = 1.0,
    elementCount = 0,
    previewMode = false,
    onQuickSave = () => console.log('Quick Save clicked'),
    onSave = () => console.log('Save clicked'),
    onUndo = () => console.log('Undo clicked'),
    onRedo = () => console.log('Redo clicked'),
    onPreview = () => console.log('Preview clicked'),
    onScreenshot = () => console.log('Screenshot clicked'),
    onGifCapture = () => console.log('GIF Capture clicked'),
    onExport = () => console.log('Export clicked'),
}) => {
    const theme = useTheme();

    // State-based hover tracking for each button
    const [hoveredButton, setHoveredButton] = useState<string | null>(null);

    /**
     * Memoized toolbar container style
     * OPTIMIZATION: Prevents recreation on every render
     */
    const toolbarStyle = useMemo(() => ({
        height: '56px',
        backgroundColor: theme.palette.background.paper,
        borderBottom: `1px solid ${theme.palette.divider}`,
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0
    }), [theme]);

    /**
     * Memoized button styles - only recreated when theme or hover state changes
     * OPTIMIZATION: Prevents recreation of style objects on every render
     */
    const getButtonStyle = useCallback((buttonId: string, type: 'default' | 'primary' | 'success') => {
        const isHovered = hoveredButton === buttonId;

        const baseStyle = {
            padding: '6px 12px',
            margin: '0 2px',
            borderRadius: '4px',
            cursor: 'pointer' as const,
            fontSize: '14px',
            display: 'inline-flex' as const,
            alignItems: 'center' as const,
            gap: '4px',
            transition: 'all 0.2s',
            border: `1px solid ${theme.palette.divider}`,
        };

        switch (type) {
            case 'primary':
                return {
                    ...baseStyle,
                    background: isHovered ? theme.palette.primary.dark : theme.palette.primary.main,
                    color: theme.palette.primary.contrastText,
                    border: `1px solid ${theme.palette.primary.main}`,
                };
            case 'success':
                return {
                    ...baseStyle,
                    background: isHovered ? theme.palette.success.dark : theme.palette.success.main,
                    color: theme.palette.success.contrastText,
                    border: `1px solid ${theme.palette.success.main}`,
                };
            default:
                return {
                    ...baseStyle,
                    background: isHovered ? theme.palette.action.hover : theme.palette.background.paper,
                    color: theme.palette.text.primary,
                };
        }
    }, [theme, hoveredButton]);

    /**
     * Memoized section styles
     * OPTIMIZATION: Prevents recreation on every render
     */
    const leftSectionStyle = useMemo(() => ({
        display: 'flex',
        alignItems: 'center',
        gap: '4px'
    }), []);

    const centerSectionStyle = useMemo(() => ({
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        fontSize: '14px'
    }), []);

    const rightSectionStyle = useMemo(() => ({
        display: 'flex',
        alignItems: 'center',
        gap: '4px'
    }), []);

    const dividerStyle = useMemo(() => ({
        width: '1px',
        height: '24px',
        backgroundColor: theme.palette.divider,
        margin: '0 8px'
    }), [theme]);

    const layoutNameStyle = useMemo(() => ({
        color: theme.palette.text.primary
    }), [theme]);

    const infoTextStyle = useMemo(() => ({
        color: theme.palette.text.secondary
    }), [theme]);

    const labelStyle = useMemo(() => ({
        fontWeight: 500
    }), []);

    return (
        <div style={toolbarStyle}>
            {/* Left Section - File Operations */}
            <div style={leftSectionStyle}>
                <button
                    onClick={onQuickSave}
                    style={getButtonStyle('quicksave', 'primary')}
                    title="Quick Save (Ctrl+S)"
                    onMouseEnter={() => setHoveredButton('quicksave')}
                    onMouseLeave={() => setHoveredButton(null)}
                >
                    Quick Save
                </button>

                <button
                    onClick={onSave}
                    style={getButtonStyle('save', 'success')}
                    title="Save & Manage Thumbnail (Ctrl+Shift+S)"
                    onMouseEnter={() => setHoveredButton('save')}
                    onMouseLeave={() => setHoveredButton(null)}
                >
                    Save
                </button>

                <div style={dividerStyle} />

                <button
                    onClick={onUndo}
                    style={getButtonStyle('undo', 'default')}
                    title="Undo (Ctrl+Z)"
                    onMouseEnter={() => setHoveredButton('undo')}
                    onMouseLeave={() => setHoveredButton(null)}
                >
                    Undo
                </button>

                <button
                    onClick={onRedo}
                    style={getButtonStyle('redo', 'default')}
                    title="Redo (Ctrl+Shift+Z)"
                    onMouseEnter={() => setHoveredButton('redo')}
                    onMouseLeave={() => setHoveredButton(null)}
                >
                    Redo
                </button>
            </div>

            {/* Center Section - Layout Info */}
            <div style={centerSectionStyle}>
                <div style={layoutNameStyle}>
                    <span style={labelStyle}>{layoutName || `Layout ${layoutId}`}</span>
                </div>
                <div style={infoTextStyle}>
                    {width}×{height}
                </div>
                <div style={infoTextStyle}>
                    {Math.round(zoom * 100)}%
                </div>
                <div style={infoTextStyle}>
                    {elementCount} {elementCount === 1 ? 'element' : 'elements'}
                </div>
            </div>

            {/* Right Section - Actions */}
            <div style={rightSectionStyle}>
                <button
                    onClick={onScreenshot}
                    style={getButtonStyle('screenshot', 'default')}
                    title="Take Screenshot"
                    onMouseEnter={() => setHoveredButton('screenshot')}
                    onMouseLeave={() => setHoveredButton(null)}
                >
                    📷 Screenshot
                </button>

                <button
                    onClick={onGifCapture}
                    style={getButtonStyle('gif', 'default')}
                    title="Capture 5s Real-Time Animated GIF (720p)"
                    onMouseEnter={() => setHoveredButton('gif')}
                    onMouseLeave={() => setHoveredButton(null)}
                >
                    🎬 GIF
                </button>

                <button
                    onClick={onPreview}
                    style={getButtonStyle('preview', previewMode ? 'primary' : 'success')}
                    title={previewMode ? "Exit Preview Mode" : "Enter Preview Mode"}
                    onMouseEnter={() => setHoveredButton('preview')}
                    onMouseLeave={() => setHoveredButton(null)}
                >
                    {previewMode ? 'Exit Preview' : 'Preview'}
                </button>

                <button
                    onClick={onExport}
                    style={getButtonStyle('export', 'default')}
                    title="Export Layout Package"
                    onMouseEnter={() => setHoveredButton('export')}
                    onMouseLeave={() => setHoveredButton(null)}
                >
                    Export
                </button>
            </div>
        </div>
    );
};

export default React.memo(FrameEngine2_Toolbar);
