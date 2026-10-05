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

interface SetupInstructions_PayloadsProps {
    layoutType: string;
}

// Helper function to get setup instructions for each layout type
export const SetupInstructions_Payloads: React.FC<SetupInstructions_PayloadsProps> = ({ layoutType }) => {
    const getInstructions = () => {
        switch (layoutType) {
            case "LVGL_GRID":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            LVGL Grid Layout:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            Grid-based user interface layout for LVGL displays. Perfect for organizing UI elements in a structured grid format.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Use Cases:</strong><br />
                            • Dashboard interfaces<br />
                            • Control panels with buttons and indicators<br />
                            • Status displays with multiple data points<br />
                            • Settings menus and configuration screens
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Configuration:</strong><br />
                            • Rows/Columns: Define the grid structure<br />
                            • Each cell can contain different UI elements<br />
                            • Supports responsive layouts and alignment
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Best for:</strong> Touch screen interfaces, ESP32 displays, embedded UI applications
                        </Typography>
                    </Box>
                );

            case "LVGL_RADIO":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            LVGL Radio Layout:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            Radio button interface for LVGL displays. Allows single-choice selection from multiple options.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Use Cases:</strong><br />
                            • Settings with mutually exclusive options<br />
                            • Mode selection interfaces<br />
                            • Configuration menus<br />
                            • System state selection
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Features:</strong><br />
                            • Single selection enforcement<br />
                            • Visual feedback for selected state<br />
                            • Touch-friendly button sizing<br />
                            • Customizable styling and colors
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Best for:</strong> Option selection, mode switching, preference settings
                        </Typography>
                    </Box>
                );

            case "LVGL_PLOTTER":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            LVGL Plotter Layout:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            Chart and graph display for LVGL. Visualizes data trends, real-time measurements, and analytics.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Use Cases:</strong><br />
                            • Sensor data visualization<br />
                            • Performance monitoring graphs<br />
                            • Temperature, humidity, pressure charts<br />
                            • System metrics and analytics
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Features:</strong><br />
                            • Real-time data plotting<br />
                            • Multiple data series support<br />
                            • Customizable axes and scaling<br />
                            • Interactive zoom and pan capabilities
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Best for:</strong> Data logging applications, monitoring systems, IoT dashboards
                        </Typography>
                    </Box>
                );

            case "QUAD":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Quad Layout:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            Four-panel display layout. Divides the screen into four equal quadrants for organizing different types of content.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Use Cases:</strong><br />
                            • Multi-camera security displays<br />
                            • System monitoring with different metrics<br />
                            • Dashboard with four key indicators<br />
                            • Comparative data displays
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Configuration:</strong><br />
                            • Fixed 2×2 grid structure<br />
                            • Each quadrant is independent<br />
                            • Supports different content types per panel<br />
                            • Consistent spacing and alignment
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Best for:</strong> Surveillance systems, multi-metric dashboards, comparison displays
                        </Typography>
                    </Box>
                );

            case "MATRIX":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Matrix Layout:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            LED matrix display configuration. Controls individual pixels or segments in a matrix arrangement.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Use Cases:</strong><br />
                            • LED matrix displays (8×8, 16×16, 32×32)<br />
                            • Pixel art and animations<br />
                            • Text scrolling displays<br />
                            • Visual indicators and patterns
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Features:</strong><br />
                            • Individual pixel control<br />
                            • Pattern and animation support<br />
                            • Brightness and color control<br />
                            • Text rendering capabilities
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Best for:</strong> MAX7219 displays, WS2812 matrix panels, dot matrix signs
                        </Typography>
                    </Box>
                );

            case "NEOPIXEL":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            NeoPixel Layout:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            RGB LED strip control layout. Manages addressable LED strips with individual pixel control.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Use Cases:</strong><br />
                            • Ambient lighting systems<br />
                            • Status indication strips<br />
                            • Color-changing decorative lighting<br />
                            • Audio visualization displays
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Features:</strong><br />
                            • Individual RGB pixel control<br />
                            • Animation and effect patterns<br />
                            • Brightness adjustment<br />
                            • Color mixing and transitions
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Configuration:</strong><br />
                            • Columns: Number of LEDs in the strip<br />
                            • Rows: Typically 1 for linear strips<br />
                            • Supports WS2812, WS2811, SK6812 protocols
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Best for:</strong> WS2812B strips, addressable LED projects, mood lighting
                        </Typography>
                    </Box>
                );

            case "CUSTOM":
                return (
                    <Box>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Custom Layout:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Purpose:</strong><br />
                            Flexible custom layout configuration. Allows for specialized display arrangements not covered by standard layouts.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Use Cases:</strong><br />
                            • Unique display requirements<br />
                            • Prototype and experimental layouts<br />
                            • Integration with custom hardware<br />
                            • Specialized industrial applications
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            <strong>Features:</strong><br />
                            • Fully customizable structure<br />
                            • Flexible row and column configuration<br />
                            • Custom element positioning<br />
                            • Advanced styling options
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            After creating the layout, configure specific elements and behaviors in the payload configuration page.
                        </Typography>
                    </Box>
                );

            default:
                return (
                    <Box>
                        <Typography variant="body2" color="text.secondary">
                            No specific setup instructions available for this layout type.
                        </Typography>
                    </Box>
                );
        }
    };

    return getInstructions();
};

export default SetupInstructions_Payloads;