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

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Box, Typography, TextField, Select, MenuItem, FormControl, InputLabel, Slider, FormControlLabel, Switch, Button, CircularProgress } from '@mui/material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import UploadIcon from '@mui/icons-material/Upload';
import type { FrameLayoutConfig } from './types/FrameEngine2_LayoutTypes';
import FrameEngine2_AssetSelector from './FrameEngine2_AssetSelector';

interface FrameEngine2_Tab_LayoutProps {
    /** Current layout configuration */
    layout: FrameLayoutConfig;

    /** Callback to update layout configuration */
    onLayoutUpdate: (updates: Partial<FrameLayoutConfig>) => void;

    /** Thumbnail URL (if exists) */
    thumbnailUrl: string | null;

    /** Thumbnail loading state */
    thumbnailLoading: boolean;

    /** Callback to capture thumbnail from canvas */
    onCaptureThumbnail: () => void;

    /** Callback to upload custom thumbnail */
    onUploadThumbnail: (file: File) => void;
}

/**
 * Layout tab content for left sidebar
 * Canvas dimensions and background configuration
 *
 * Performance notes:
 * - Memoized styles to prevent recreation
 * - Wrapped in React.memo to prevent unnecessary re-renders
 */
const FrameEngine2_Tab_Layout: React.FC<FrameEngine2_Tab_LayoutProps> = ({
    layout,
    onLayoutUpdate,
    thumbnailUrl,
    thumbnailLoading,
    onCaptureThumbnail,
    onUploadThumbnail
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    /**
     * Local state for dimension inputs
     * Allows partial input without immediately falling back to defaults
     */
    const [widthInput, setWidthInput] = useState(String(layout.width));
    const [heightInput, setHeightInput] = useState(String(layout.height));

    /**
     * Memoized color picker style
     * OPTIMIZATION: Prevents object recreation on every render
     */
    const colorPickerStyle = useMemo(() => ({
        width: '40px',
        height: '40px',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
    }), []);

    /**
     * Sync local state when layout changes externally
     */
    useEffect(() => {
        setWidthInput(String(layout.width));
    }, [layout.width]);

    useEffect(() => {
        setHeightInput(String(layout.height));
    }, [layout.height]);

    /**
     * Handle width input change (allows partial input)
     */
    const handleWidthInputChange = (value: string) => {
        setWidthInput(value);
    };

    /**
     * Handle width blur - validate and update layout
     */
    const handleWidthBlur = () => {
        const parsed = parseInt(widthInput);
        if (!isNaN(parsed) && parsed >= 100 && parsed <= 7680) {
            onLayoutUpdate({ width: parsed });
        } else {
            // Reset to current valid value if invalid
            setWidthInput(String(layout.width));
        }
    };

    /**
     * Handle height input change (allows partial input)
     */
    const handleHeightInputChange = (value: string) => {
        setHeightInput(value);
    };

    /**
     * Handle height blur - validate and update layout
     */
    const handleHeightBlur = () => {
        const parsed = parseInt(heightInput);
        if (!isNaN(parsed) && parsed >= 100 && parsed <= 4320) {
            onLayoutUpdate({ height: parsed });
        } else {
            // Reset to current valid value if invalid
            setHeightInput(String(layout.height));
        }
    };

    /**
     * Handle Enter key to commit changes immediately
     */
    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, blurHandler: () => void) => {
        if (e.key === 'Enter') {
            blurHandler();
        }
    };

    const handleBackgroundColorChange = (value: string) => {
        onLayoutUpdate({ backgroundColor: value });
    };

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onUploadThumbnail(file);
        }
        // Reset input so same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <Box
            sx={{
                p: 1.5,
                height: '100%',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5
            }}
        >
            {/* Thumbnail Preview */}
            <Box>
                <Typography variant="body2" fontWeight="bold" gutterBottom>
                    Thumbnail
                </Typography>
                <Box
                    sx={{
                        position: 'relative',
                        width: '100%',
                        paddingBottom: '56.25%', // 16:9 aspect ratio
                        backgroundColor: thumbnailUrl ? 'transparent' : 'action.hover',
                        borderRadius: 1,
                        overflow: 'hidden',
                        border: 1,
                        borderColor: 'divider'
                    }}
                >
                    {thumbnailUrl ? (
                        <img
                            src={thumbnailUrl}
                            alt="Layout thumbnail"
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover'
                            }}
                        />
                    ) : (
                        <Box
                            sx={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            {thumbnailLoading ? (
                                <CircularProgress size={40} />
                            ) : (
                                <Button
                                    variant="contained"
                                    color="primary"
                                    startIcon={<CameraAltIcon />}
                                    onClick={onCaptureThumbnail}
                                    sx={{ textTransform: 'none' }}
                                >
                                    CAPTURE
                                </Button>
                            )}
                        </Box>
                    )}
                </Box>

                {/* Thumbnail Actions */}
                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={thumbnailLoading ? <CircularProgress size={16} /> : <CameraAltIcon />}
                        onClick={onCaptureThumbnail}
                        disabled={thumbnailLoading}
                        fullWidth
                        sx={{ textTransform: 'none' }}
                    >
                        Recapture
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<UploadIcon />}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={thumbnailLoading}
                        fullWidth
                        sx={{ textTransform: 'none' }}
                    >
                        Upload
                    </Button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp"
                        style={{ display: 'none' }}
                        onChange={handleFileSelect}
                    />
                </Box>
            </Box>

            {/* Layout Info */}
            <Box>
                <Typography variant="body2" fontWeight="bold" gutterBottom>
                    Layout Info
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <TextField
                        label="Name"
                        size="small"
                        fullWidth
                        value={layout.displayName}
                        onChange={(e) => onLayoutUpdate({ displayName: e.target.value })}
                    />
                    <TextField
                        label="Description"
                        size="small"
                        fullWidth
                        multiline
                        rows={2}
                        value={layout.description || ''}
                        onChange={(e) => onLayoutUpdate({ description: e.target.value })}
                    />
                </Box>
            </Box>

            {/* Canvas Dimensions */}
            <Box>
                <Typography variant="body2" fontWeight="bold" gutterBottom>
                    Canvas Size
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <TextField
                        label="Width (px)"
                        size="small"
                        fullWidth
                        value={widthInput}
                        onChange={(e) => handleWidthInputChange(e.target.value)}
                        onBlur={handleWidthBlur}
                        onKeyDown={(e) => handleKeyDown(e, handleWidthBlur)}
                        placeholder="100 - 7680"
                    />
                    <TextField
                        label="Height (px)"
                        size="small"
                        fullWidth
                        value={heightInput}
                        onChange={(e) => handleHeightInputChange(e.target.value)}
                        onBlur={handleHeightBlur}
                        onKeyDown={(e) => handleKeyDown(e, handleHeightBlur)}
                        placeholder="100 - 4320"
                    />
                </Box>
            </Box>

            {/* Background Color */}
            <Box>
                <Typography variant="body2" fontWeight="bold" gutterBottom>
                    Background
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <input
                        type="color"
                        value={layout.backgroundColor || '#000000'}
                        onChange={(e) => handleBackgroundColorChange(e.target.value)}
                        style={colorPickerStyle}
                    />
                    <TextField
                        size="small"
                        fullWidth
                        value={layout.backgroundColor || '#000000'}
                        onChange={(e) => handleBackgroundColorChange(e.target.value)}
                        placeholder="#000000"
                        sx={{ '& input': { fontFamily: 'monospace' } }}
                    />
                </Box>
            </Box>

            {/* Background Media */}
            <Box>
                <Typography variant="body2" fontWeight="bold" gutterBottom>
                    Background Media
                </Typography>

                {/* Background Type Selector */}
                <FormControl size="small" fullWidth sx={{ mb: 1.5 }}>
                    <InputLabel>Type</InputLabel>
                    <Select
                        value={layout.backgroundType || 'none'}
                        label="Type"
                        onChange={(e) => onLayoutUpdate({ backgroundType: e.target.value })}
                    >
                        <MenuItem value="none">None</MenuItem>
                        <MenuItem value="image">Image</MenuItem>
                        <MenuItem value="video">Video</MenuItem>
                        <MenuItem value="rive">Rive</MenuItem>
                    </Select>
                </FormControl>

                {/* Image Configuration */}
                {layout.backgroundType === 'image' && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <FrameEngine2_AssetSelector
                            type="image"
                            value={layout.backgroundImageUrl || null}
                            onChange={(filename) => onLayoutUpdate({ backgroundImageUrl: filename })}
                        />
                        <FormControl size="small" fullWidth>
                            <InputLabel>Fit Mode</InputLabel>
                            <Select
                                value={layout.backgroundImageFit || 'cover'}
                                label="Fit Mode"
                                onChange={(e) => onLayoutUpdate({
                                    backgroundImageFit: e.target.value as 'cover' | 'contain' | 'fill' | 'tile' | 'stretch' | 'none'
                                })}
                            >
                                <MenuItem value="cover">Cover</MenuItem>
                                <MenuItem value="contain">Contain</MenuItem>
                                <MenuItem value="fill">Fill</MenuItem>
                                <MenuItem value="none">None</MenuItem>
                            </Select>
                        </FormControl>
                        <Box>
                            <Typography variant="caption" display="block" gutterBottom>
                                Opacity: {((layout.backgroundOpacity !== undefined ? layout.backgroundOpacity : 1) * 100).toFixed(0)}%
                            </Typography>
                            <Slider
                                value={layout.backgroundOpacity !== undefined ? layout.backgroundOpacity : 1}
                                onChange={(_, value) => onLayoutUpdate({ backgroundOpacity: value as number })}
                                min={0}
                                max={1}
                                step={0.05}
                                size="small"
                                sx={{ maxWidth: 280 }}
                            />
                        </Box>
                    </Box>
                )}

                {/* Video Configuration */}
                {layout.backgroundType === 'video' && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <FrameEngine2_AssetSelector
                            type="video"
                            value={layout.backgroundVideoUrl || null}
                            onChange={(filename) => onLayoutUpdate({ backgroundVideoUrl: filename })}
                        />
                        <FormControl size="small" fullWidth>
                            <InputLabel>Fit Mode</InputLabel>
                            <Select
                                value={layout.backgroundVideoFit || 'cover'}
                                label="Fit Mode"
                                onChange={(e) => onLayoutUpdate({
                                    backgroundVideoFit: e.target.value as 'cover' | 'contain' | 'fill' | 'stretch' | 'none'
                                })}
                            >
                                <MenuItem value="cover">Cover</MenuItem>
                                <MenuItem value="contain">Contain</MenuItem>
                                <MenuItem value="fill">Fill</MenuItem>
                                <MenuItem value="none">None</MenuItem>
                            </Select>
                        </FormControl>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={layout.videoLoop !== false}
                                        onChange={(e) => onLayoutUpdate({ videoLoop: e.target.checked })}
                                        size="small"
                                    />
                                }
                                label={<Typography variant="caption">Loop</Typography>}
                            />
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={layout.videoMuted !== false}
                                        onChange={(e) => onLayoutUpdate({ videoMuted: e.target.checked })}
                                        size="small"
                                    />
                                }
                                label={<Typography variant="caption">Muted</Typography>}
                            />
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={layout.videoAutoplay !== false}
                                        onChange={(e) => onLayoutUpdate({ videoAutoplay: e.target.checked })}
                                        size="small"
                                    />
                                }
                                label={<Typography variant="caption">Autoplay</Typography>}
                            />
                        </Box>
                        <Box>
                            <Typography variant="caption" display="block" gutterBottom>
                                Opacity: {((layout.backgroundOpacity !== undefined ? layout.backgroundOpacity : 1) * 100).toFixed(0)}%
                            </Typography>
                            <Slider
                                value={layout.backgroundOpacity !== undefined ? layout.backgroundOpacity : 1}
                                onChange={(_, value) => onLayoutUpdate({ backgroundOpacity: value as number })}
                                min={0}
                                max={1}
                                step={0.05}
                                size="small"
                                sx={{ maxWidth: 280 }}
                            />
                        </Box>
                    </Box>
                )}

                {/* Rive Configuration */}
                {layout.backgroundType === 'rive' && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <FrameEngine2_AssetSelector
                            type="rive"
                            value={layout.riveFile || null}
                            onChange={(filename) => onLayoutUpdate({ riveFile: filename })}
                        />
                        <Box>
                            <Typography variant="caption" display="block" gutterBottom>
                                Opacity: {((layout.backgroundOpacity !== undefined ? layout.backgroundOpacity : 1) * 100).toFixed(0)}%
                            </Typography>
                            <Slider
                                value={layout.backgroundOpacity !== undefined ? layout.backgroundOpacity : 1}
                                onChange={(_, value) => onLayoutUpdate({ backgroundOpacity: value as number })}
                                min={0}
                                max={1}
                                step={0.05}
                                size="small"
                                sx={{ maxWidth: 280 }}
                            />
                        </Box>
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export default React.memo(FrameEngine2_Tab_Layout);
