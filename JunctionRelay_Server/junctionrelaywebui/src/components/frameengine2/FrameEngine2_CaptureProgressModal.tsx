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
    CircularProgress,
    Backdrop
} from '@mui/material';

/**
 * GIF capture stage identifier
 */
export type GifCaptureStage = 'preparing' | 'frames' | 'encoding' | 'finalizing';

/**
 * Props for the capture progress modal
 */
export interface FrameEngine2_CaptureProgressModalProps {
    /** Whether modal is open (true if screenshot or GIF capture in progress) */
    open: boolean;

    /** Whether GIF capture is in progress (vs screenshot capture) */
    gifCaptureInProgress: boolean;

    /** Current GIF capture stage */
    gifCaptureStage: GifCaptureStage;

    /** GIF capture progress (0-100 for frames, or undefined for encoding/finalizing) */
    gifCaptureProgress: number;

    /** GIF duration in seconds (for progress display) */
    gifDuration: number;
}

/**
 * Capture Progress Modal Component
 *
 * Displays progress during screenshot or GIF capture operations with:
 * - Spinner for screenshot capture
 * - Progress bar for GIF frame capture
 * - Indeterminate spinner for GIF encoding/finalizing
 * - Stage-specific messages
 *
 * **Architecture Notes:**
 * - Extracted from ConfigureFrame2.tsx to reduce component complexity (~65 lines)
 * - Follows FRAMEENGINE2_ARCHITECTURE_GUIDELINES.md Section 4.1 (Component Size Limits)
 * - Self-contained modal with controlled state pattern
 *
 * **Usage Example:**
 * ```typescript
 * <FrameEngine2_CaptureProgressModal
 *     open={screenshotInProgress || gifCaptureInProgress}
 *     gifCaptureInProgress={gifCaptureInProgress}
 *     gifCaptureStage={gifCaptureStage}
 *     gifCaptureProgress={gifCaptureProgress}
 *     gifDuration={gifSettings.duration}
 * />
 * ```
 *
 * @param props - Component props
 */
export const FrameEngine2_CaptureProgressModal: React.FC<FrameEngine2_CaptureProgressModalProps> = ({
    open,
    gifCaptureInProgress,
    gifCaptureStage,
    gifCaptureProgress,
    gifDuration
}) => {
    return (
        <Modal
            open={open}
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
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    minWidth: 300
                }}
            >
                {gifCaptureInProgress ? (
                    <>
                        {/* GIF Capture Progress */}
                        <CircularProgress
                            variant={gifCaptureStage === 'encoding' || gifCaptureStage === 'finalizing' ? 'indeterminate' : 'determinate'}
                            value={gifCaptureProgress}
                            size={64}
                            thickness={4}
                        />
                        <Typography variant="h6" component="h2">
                            {gifCaptureStage === 'preparing' && 'Preparing capture...'}
                            {gifCaptureStage === 'frames' && `Capturing... ${Math.round(gifCaptureProgress / 60 * gifDuration * 10) / 10}s / ${gifDuration}s`}
                            {gifCaptureStage === 'encoding' && 'Processing frames...'}
                            {gifCaptureStage === 'finalizing' && 'Finalizing...'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {gifCaptureStage === 'frames' && 'Recording real-time animation'}
                            {gifCaptureStage === 'encoding' && 'Encoding GIF, please wait...'}
                            {gifCaptureStage === 'finalizing' && 'Almost done...'}
                        </Typography>
                        {gifCaptureStage === 'frames' && (
                            <Typography variant="caption" color="warning.main" sx={{ mt: 1 }}>
                                ⚠️ Please keep this window visible during capture
                            </Typography>
                        )}
                    </>
                ) : (
                    <>
                        {/* Screenshot Capture Progress */}
                        <CircularProgress size={48} />
                        <Typography variant="h6" component="h2">
                            Taking screenshot...
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Please wait while we capture your layout
                        </Typography>
                    </>
                )}
            </Box>
        </Modal>
    );
};

export default FrameEngine2_CaptureProgressModal;
