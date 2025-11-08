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
import {
    Modal,
    Box,
    Typography,
    Button,
    Slider,
    Backdrop
} from '@mui/material';

/**
 * GIF capture settings
 */
export interface GifSettings {
    /** Duration of GIF in seconds */
    duration: number;

    /** Quality setting (5-25, higher = better quality) */
    quality: number;

    /** Target FPS for capture */
    targetFps: number;
}

/**
 * Props for the GIF settings modal
 */
export interface FrameEngine2_GifSettingsModalProps {
    /** Whether modal is open */
    open: boolean;

    /** Callback when modal should close */
    onClose: () => void;

    /** Current GIF settings */
    gifSettings: GifSettings;

    /** Callback when settings change */
    onGifSettingsChange: (settings: GifSettings) => void;

    /** Callback when user clicks "Start Capture" */
    onStartCapture: () => void;
}

/**
 * GIF Settings Modal Component
 *
 * Provides UI for configuring animated GIF capture parameters including:
 * - Target FPS (10-60)
 * - Duration (2-10 seconds)
 * - Quality (5-25)
 * - File size estimate
 *
 * **Architecture Notes:**
 * - Extracted from ConfigureFrame2.tsx to reduce component complexity (~130 lines)
 * - Follows FRAMEENGINE2_ARCHITECTURE_GUIDELINES.md Section 4.1 (Component Size Limits)
 * - Self-contained modal with controlled state pattern
 *
 * **Usage Example:**
 * ```typescript
 * <FrameEngine2_GifSettingsModal
 *     open={showGifSettings}
 *     onClose={() => setShowGifSettings(false)}
 *     gifSettings={gifSettings}
 *     onGifSettingsChange={setGifSettings}
 *     onStartCapture={handleStartGifCapture}
 * />
 * ```
 *
 * @param props - Component props
 */
export const FrameEngine2_GifSettingsModal: React.FC<FrameEngine2_GifSettingsModalProps> = ({
    open,
    onClose,
    gifSettings,
    onGifSettingsChange,
    onStartCapture
}) => {
    return (
        <Modal
            open={open}
            onClose={onClose}
            closeAfterTransition
            BackdropComponent={Backdrop}
            BackdropProps={{
                timeout: 500,
                sx: { backgroundColor: 'rgba(0, 0, 0, 0.8)' }
            }}
        >
            <Box
                sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    bgcolor: 'background.paper',
                    borderRadius: 2,
                    boxShadow: 24,
                    p: 4,
                    minWidth: 400,
                    maxWidth: 500
                }}
            >
                <Typography variant="h5" component="h2" sx={{ mb: 3 }}>
                    GIF Capture Settings
                </Typography>

                {/* Target FPS */}
                <Box sx={{ mb: 3 }}>
                    <Typography gutterBottom>
                        Target FPS: {gifSettings.targetFps}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                        Higher FPS = smoother animation but larger file size
                    </Typography>
                    <Slider
                        value={gifSettings.targetFps}
                        onChange={(_, value) => onGifSettingsChange({ ...gifSettings, targetFps: value as number })}
                        min={10}
                        max={60}
                        step={5}
                        marks={[
                            { value: 10, label: '10' },
                            { value: 20, label: '20' },
                            { value: 30, label: '30' },
                            { value: 40, label: '40' },
                            { value: 50, label: '50' },
                            { value: 60, label: '60' }
                        ]}
                    />
                </Box>

                {/* Duration */}
                <Box sx={{ mb: 3 }}>
                    <Typography gutterBottom>
                        Duration: {gifSettings.duration}s
                    </Typography>
                    <Slider
                        value={gifSettings.duration}
                        onChange={(_, value) => onGifSettingsChange({ ...gifSettings, duration: value as number })}
                        min={2}
                        max={10}
                        step={1}
                        marks
                    />
                </Box>

                {/* Quality */}
                <Box sx={{ mb: 3 }}>
                    <Typography gutterBottom>
                        Quality: {gifSettings.quality}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                        Higher values = better quality but larger file size
                    </Typography>
                    <Slider
                        value={gifSettings.quality}
                        onChange={(_, value) => onGifSettingsChange({ ...gifSettings, quality: value as number })}
                        min={5}
                        max={25}
                        step={5}
                        marks={[
                            { value: 5, label: 'Fast' },
                            { value: 15, label: 'Good' },
                            { value: 25, label: 'Best' }
                        ]}
                    />
                </Box>

                {/* File Size Estimate */}
                <Box sx={{ mb: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                        Estimated file size: {(() => {
                            const totalFrames = gifSettings.duration * gifSettings.targetFps;
                            // Rough estimate: base size + (frames * bytes per frame * quality factor)
                            // Quality: 5=fast (low colors), 15=good, 25=best (high colors)
                            const qualityFactor = gifSettings.quality / 10; // 0.5 to 2.5
                            const bytesPerFrame = 1280 * 720 * 0.1 * qualityFactor; // Rough estimate
                            const estimatedBytes = totalFrames * bytesPerFrame;
                            const estimatedMB = estimatedBytes / (1024 * 1024);

                            if (estimatedMB < 1) {
                                return `${Math.round(estimatedBytes / 1024)}KB`;
                            } else {
                                return `${estimatedMB.toFixed(1)}MB`;
                            }
                        })()}
                    </Typography>
                </Box>

                {/* Buttons */}
                <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 4 }}>
                    <Button
                        onClick={onClose}
                        variant="outlined"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={onStartCapture}
                        variant="contained"
                        color="primary"
                    >
                        Start Capture
                    </Button>
                </Box>
            </Box>
        </Modal>
    );
};

export default FrameEngine2_GifSettingsModal;
