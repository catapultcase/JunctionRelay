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

            case "RIVE_MAPPING":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Rive Mapping:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            Map Sensors on top of a Rive component.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Use Cases:</strong><br />
                            • TV show and episode schedules<br />
                            • Event calendars and timetables<br />
                            • Meeting and appointment displays<br />
                            • Daily schedule overviews
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Features:</strong><br />
                            • Multi-day episode listings (yesterday/today/tomorrow)<br />
                            • Time zone conversion and local time display<br />
                            • Custom background images and styling<br />
                            • Responsive text wrapping and formatting
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Best for:</strong> Entertainment systems, digital signage, schedule displays
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