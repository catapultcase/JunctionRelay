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

import React from "react";
import { Box, Typography } from "@mui/material";

interface SetupInstructions_FrameEngineProps {
    layoutType: string;
}

// Helper function to get setup instructions for each frame layout type
export const SetupInstructions_FrameEngine: React.FC<SetupInstructions_FrameEngineProps> = ({ layoutType }) => {
    const getInstructions = () => {
        switch (layoutType) {
            case "PRE_RENDERED_IMAGE":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Pre-Rendered Image:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            Map Sensors on top of an image.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Use Cases:</strong><br />
                            • Multi-sensor monitoring dashboards<br />
                            • Environmental data displays<br />
                            • Industrial control panels<br />
                            • Home automation status screens
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Features:</strong><br />
                            • Backend-rendered frames for pixel-perfect display<br />
                            • Custom fonts and typography<br />
                            • Advanced styling and colors<br />
                            • Background image support
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Best for:</strong> E-paper displays, Pi devices, high-quality sensor visualizations
                        </Typography>
                    </Box>
                );

            case "COMPOSITE_MODE":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Composite Mode:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            Build dynamic layouts with multiple elements and animated backgrounds.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Available Elements:</strong><br />
                            • Sensors (text, numeric data)<br />
                            • Gauges (radial, linear)<br />
                            • Media (images, video, Rive animations)<br />
                            • Text labels and time/date displays<br />
                            • ECG waveforms and tunnels
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Background Options:</strong><br />
                            • Solid colors<br />
                            • Static images<br />
                            • Video backgrounds<br />
                            • Rive animations with data bindings
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Best for:</strong> Multi-sensor dashboards, data visualization, animated displays
                        </Typography>
                    </Box>
                );

            case "PIXEL_MODE":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Pixel Mode:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            Create pixel art displays with strict grid snapping and low resolution support (1-256px).
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Features:</strong><br />
                            • Strong grid snapping for precise pixel placement<br />
                            • Low-resolution canvas support (64x64, 128x128, etc.)<br />
                            • Optimized for pixel-perfect rendering<br />
                            • Ideal for LED matrices and retro displays
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Use Cases:</strong><br />
                            • LED matrix displays<br />
                            • Retro gaming aesthetics<br />
                            • Low-resolution indicator panels<br />
                            • Pixel art animations
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Best for:</strong> LED matrices, pixel art, low-resolution displays
                        </Typography>
                    </Box>
                );

            default:
                return (
                    <Box>
                        <Typography variant="body2" color="text.secondary">
                            No specific setup instructions available for this frame layout type.
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 2 }}>
                            <strong>General FrameEngine Benefits:</strong><br />
                            • Backend rendering for pixel-perfect displays<br />
                            • Advanced graphics with SkiaSharp<br />
                            • Custom fonts and typography<br />
                            • Background image support<br />
                            • Real-time preview capabilities
                        </Typography>
                    </Box>
                );
        }
    };

    return getInstructions();
};

export default SetupInstructions_FrameEngine;