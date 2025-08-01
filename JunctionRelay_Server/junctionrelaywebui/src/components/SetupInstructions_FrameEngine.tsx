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
            case "FRAME_SENSOR_GRID":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Sensor Grid Frame:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            Grid-based sensor data display rendered as a complete frame. Perfect for organized sensor dashboards with pixel-perfect control.
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

            case "FRAME_CALENDAR":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Calendar Frame:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            TV Guide style calendar layout with episode listings and schedule displays. Renders complete calendar frames with perfect typography.
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

            case "FRAME_DASHBOARD":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Dashboard Frame:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            Multi-widget dashboard layout for comprehensive displays. Combines multiple data sources into a unified frame.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Use Cases:</strong><br />
                            • Executive summary displays<br />
                            • System monitoring dashboards<br />
                            • KPI and metrics overview<br />
                            • Multi-source data aggregation
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Features:</strong><br />
                            • Flexible widget arrangement<br />
                            • Mixed content types (sensors, charts, text)<br />
                            • Custom branding and styling<br />
                            • Real-time data integration
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Best for:</strong> Business intelligence displays, control rooms, executive dashboards
                        </Typography>
                    </Box>
                );

            case "FRAME_CHART":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Chart Frame:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            Data visualization and chart display frame. Renders charts, graphs, and analytics with high-quality graphics.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Use Cases:</strong><br />
                            • Time series data visualization<br />
                            • Performance metrics and trends<br />
                            • Statistical analysis displays<br />
                            • Real-time analytics dashboards
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Features:</strong><br />
                            • Advanced chart rendering with SkiaSharp<br />
                            • Multiple chart types (line, bar, pie, scatter)<br />
                            • Custom colors and styling<br />
                            • Data point annotations and labels
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Best for:</strong> Analytics displays, scientific visualization, business reporting
                        </Typography>
                    </Box>
                );

            case "FRAME_QUAD":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Quad Frame:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            Four-panel display arrangement rendered as a complete frame. Divides the display into equal quadrants for organized content.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Use Cases:</strong><br />
                            • Multi-camera security feeds<br />
                            • Comparative data displays<br />
                            • Four-zone monitoring systems<br />
                            • Split-screen information panels
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Configuration:</strong><br />
                            • Fixed 2×2 grid structure<br />
                            • Independent content per quadrant<br />
                            • Consistent spacing and borders<br />
                            • Synchronized updates across panels
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Best for:</strong> Surveillance systems, comparison views, multi-metric displays
                        </Typography>
                    </Box>
                );

            case "FRAME_IMAGE":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Image Frame:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            Background image with data overlays. Combines custom imagery with dynamic sensor data for branded displays.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Use Cases:</strong><br />
                            • Branded corporate displays<br />
                            • Custom background dashboards<br />
                            • Themed information screens<br />
                            • Logo and branding integration
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Features:</strong><br />
                            • High-quality background image support<br />
                            • Transparent text overlays<br />
                            • Custom positioning and alignment<br />
                            • Opacity and blending controls
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Best for:</strong> Corporate displays, retail signage, branded information systems
                        </Typography>
                    </Box>
                );

            case "FRAME_CUSTOM":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Custom Frame:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            Custom frame layout configuration. Allows for specialized rendering arrangements not covered by standard frame types.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Use Cases:</strong><br />
                            • Unique display requirements<br />
                            • Prototype and experimental layouts<br />
                            • Industry-specific visualizations<br />
                            • Custom graphic compositions
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Features:</strong><br />
                            • Fully customizable frame structure<br />
                            • Advanced SkiaSharp graphics capabilities<br />
                            • Custom element positioning and styling<br />
                            • Complex visual effects and animations
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Advanced Capabilities:</strong><br />
                            • Vector graphics and paths<br />
                            • Custom fonts and typography<br />
                            • Gradient and pattern fills<br />
                            • Image manipulation and effects
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            After creating the custom frame layout, configure specific rendering logic and visual elements in the frame configuration page.
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