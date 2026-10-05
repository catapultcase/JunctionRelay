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

import React, { useEffect, useState } from "react";
import {
    Typography,
    Box,
    Card,
    CardContent,
    TextField,
    Tabs,
    Tab,
    FormControlLabel,
    Switch,
} from "@mui/material";

export type LayoutType =
    | "LVGL_GRID"
    | "LVGL_RADIO"
    | "LVGL_PLOTTER"
    | "LVGL_ASTRO"
    | "QUAD"
    | "MATRIX"
    | "NEOPIXEL"
    | "CUSTOM";

const LAYOUT_TYPES: readonly LayoutType[] = ["LVGL_GRID", "LVGL_RADIO", "LVGL_PLOTTER", "LVGL_ASTRO", "QUAD", "MATRIX", "NEOPIXEL", "CUSTOM"];

export const isLayoutType = (value: unknown): value is LayoutType =>
    LAYOUT_TYPES.some((type) => type === value);

interface LayoutPreviewProps {
    layoutType: LayoutType;
    previewHeight: number | string;
    setPreviewHeight: (value: number | string) => void;
    previewWidth: number | string;
    setPreviewWidth: (value: number | string) => void;
    previewSensors: number | string;
    setPreviewSensors: (value: number | string) => void;

    backgroundColor: string;
    backgroundImageUrl: string;
    imageFit: string;
    textColor: string;
    borderVisible: boolean;
    borderThickness: number | string;
    borderColor: string;
    roundedCorners: boolean;
    borderRadiusSize: number | string;

    rows: number | string;
    columns: number | string;
    topMargin: number | string;
    bottomMargin: number | string;
    leftMargin: number | string;
    rightMargin: number | string;
    outerPadding: number | string;
    innerPadding: number | string;

    opacityPercentage: number | string;
    gradientDirection: string;
    gradientEndColor: string;

    justifyContent: string;
    alignItems: string;
    textAlignment: string;

    labelSize: string;
    valueSize: string;
    showUnits: boolean;

    // Updated props for payload handling
    payloadJson: string;
    onRefreshPayload: () => void;

    // Optional props for sensor preview
    sensorPreviewJson?: string;
    onRefreshSensorPreview?: () => void;
}

interface PreviewSensor {
    tag: string;
    value: string;
    unit: string;
}

// The layout's text alignment, if it is one CSS knows
const TEXT_ALIGNS = ['left', 'right', 'center', 'justify', 'start', 'end'] as const;
const toTextAlign = (value: string): React.CSSProperties['textAlign'] =>
    TEXT_ALIGNS.find((align) => align === value);

const PREVIEW_WIDTH = 800;
const PREVIEW_HEIGHT = 480;
const SHOW_PREVIEW_CACHE_KEY = 'layoutPreview_showPreview';

const LayoutPreview: React.FC<LayoutPreviewProps> = (props) => {
    const {
        layoutType,
        previewHeight,
        setPreviewHeight,
        previewWidth,
        setPreviewWidth,
        previewSensors,
        setPreviewSensors,
        backgroundColor,
        backgroundImageUrl,
        imageFit,
        textColor,
        borderVisible,
        borderThickness,
        borderColor,
        roundedCorners,
        borderRadiusSize,
        rows,
        columns,
        topMargin,
        bottomMargin,
        leftMargin,
        rightMargin,
        outerPadding,
        innerPadding,
        opacityPercentage,
        gradientDirection,
        gradientEndColor,
        justifyContent,
        alignItems,
        textAlignment,
        labelSize,
        valueSize,
        showUnits,
        payloadJson,
        onRefreshPayload,
        sensorPreviewJson,
        onRefreshSensorPreview
    } = props;

    const [tabValue, setTabValue] = useState(0);

    // Show Preview toggle state with browser cache persistence
    const [showPreview, setShowPreview] = useState(() => {
        const cached = localStorage.getItem(SHOW_PREVIEW_CACHE_KEY);
        return cached !== null ? JSON.parse(cached) : true;
    });

    // Save showPreview state to localStorage when it changes
    useEffect(() => {
        localStorage.setItem(SHOW_PREVIEW_CACHE_KEY, JSON.stringify(showPreview));
    }, [showPreview]);

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
    };

    const handleShowPreviewToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
        setShowPreview(event.target.checked);
    };

    // Add this near the beginning of the component, after the existing useState calls
    const [, setForceUpdate] = useState(0);

    // Add a useEffect to trigger re-renders when the payload data changes
    useEffect(() => {
        if (sensorPreviewJson) {
            setForceUpdate(prev => prev + 1);
        }
    }, [sensorPreviewJson]);

    // Add forceUpdate as a dependency to another useEffect if you want to see the parsed data in console

    // Add these parsing functions at the beginning of the component
    // Parse the sensor preview JSON to extract sensor data
    const parseSensorData = (): PreviewSensor[] => {
        // Return empty array if no sensorPreviewJson or if it starts with "Error"
        if (!sensorPreviewJson || sensorPreviewJson.trim() === "" || sensorPreviewJson.startsWith("Error")) {
            return [];
        }

        try {

            // Extract the JSON part from the payload
            let jsonStr = sensorPreviewJson;

            // Check if it starts with digits (length prefix)
            const prefixMatch = jsonStr.match(/^(\d+)\s+/);
            if (prefixMatch) {
                // Remove the digits and any whitespace after them
                jsonStr = jsonStr.substring(prefixMatch[0].length);
            } else if (jsonStr.includes('\n')) {
                // If newline separator (e.g. "00000123\n{...}")
                const parts = jsonStr.split('\n');
                if (parts.length > 1) {
                    jsonStr = parts[1];
                }
            }

            // Clean the JSON string
            jsonStr = jsonStr.trim();
            if (!jsonStr || jsonStr === "") {
                return [];
            }

            // Log the actual JSON we're trying to parse

            const data: unknown = JSON.parse(jsonStr);

            // Sensor payloads are { sensors: { [tag]: [{ Value, Unit, ... }] } } - the field names are the
            // template's FieldsToSend (PascalCase), see Service_Manager_Payloads_Sensor.BuildSensorData
            const sensors: unknown = typeof data === 'object' && data !== null && 'sensors' in data ? data.sensors : null;
            if (typeof sensors === 'object' && sensors !== null) {
                const parsed: PreviewSensor[] = [];
                Object.entries(sensors).forEach(([sensorTag, sensorInfo]: [string, unknown]) => {
                    if (!Array.isArray(sensorInfo) || sensorInfo.length === 0) return;
                    const first: unknown = sensorInfo[0];
                    if (typeof first !== 'object' || first === null) return;
                    const value = 'Value' in first && (typeof first.Value === 'string' || typeof first.Value === 'number') ? String(first.Value) : '0';
                    const unit = 'Unit' in first && typeof first.Unit === 'string' ? first.Unit : '';
                    parsed.push({ tag: sensorTag, value, unit });
                });
                return parsed;
            }

            return [];
        } catch (e) {
            console.error('Error parsing sensor data:', e);
            // Return empty array to avoid rendering errors
            return [];
        }
    };

    // Get parsed sensor data
    const sensorData = parseSensorData();

    // background style
    const backgroundStyle: React.CSSProperties = {
        backgroundColor: backgroundColor || "black",
    };
    if (gradientDirection && gradientEndColor) {
        let dir = "to bottom";
        if (gradientDirection === "horizontal") dir = "to right";
        if (gradientDirection === "diagonal") dir = "to bottom right";
        backgroundStyle.background = `linear-gradient(${dir}, ${backgroundColor || "#000"}, ${gradientEndColor})`;
    }
    if (backgroundImageUrl) {
        backgroundStyle.backgroundImage = `url(${backgroundImageUrl})`;
        backgroundStyle.backgroundSize = imageFit || "cover";
        backgroundStyle.backgroundPosition = "center";
        backgroundStyle.backgroundRepeat = "no-repeat";
    }

    // Update the generateSensorLabels function
    const generateSensorLabels = () => {
        const labels: React.ReactNode[] = [];
        const numSensors = parseInt(String(previewSensors)) || 0;
        const rowCount = parseInt(String(rows)) || 1;
        const columnCount = parseInt(String(columns)) || 1;
        const ph = parseInt(String(previewHeight)) || 0;
        const pw = parseInt(String(previewWidth)) || 0;
        const outerPad = parseInt(String(outerPadding)) || 0;
        const innerPad = parseInt(String(innerPadding)) || 0;
        const topPad = parseInt(String(topMargin)) || 0;
        const leftPad = parseInt(String(leftMargin)) || 0;
        const opac = opacityPercentage
            ? parseInt(String(opacityPercentage)) / 100
            : 1;
        const radius = roundedCorners
            ? parseInt(String(borderRadiusSize)) || 8
            : 0;

        const availW = pw - leftPad - (parseInt(String(rightMargin)) || 0);
        const availH = ph - topPad - (parseInt(String(bottomMargin)) || 0);
        const cellW = availW / columnCount;
        const cellH = availH / rowCount;

        // Only use actual sensor data if available, otherwise show placeholders
        if (sensorData.length === 0) {
            // No sensor data, display placeholders
            for (let i = 1; i <= numSensors; i++) {
                const row = Math.floor((i - 1) / columnCount);
                const col = (i - 1) % columnCount;
                const topPos = topPad + row * cellH + outerPad / 2;
                const leftPos = leftPad + col * cellW + outerPad / 2;
                const w = cellW - outerPad;
                const h = cellH - outerPad;

                labels.push(
                    <Box
                        key={i}
                        sx={{
                            position: "absolute",
                            top: `${topPos}px`,
                            left: `${leftPos}px`,
                            width: `${w}px`,
                            height: `${h}px`,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: alignItems || "center",
                            justifyContent: justifyContent || "center",
                            textAlign: toTextAlign(textAlignment) || "center",
                            padding: `${innerPad}px`,
                            backgroundColor: "rgba(0,0,0,0.2)",
                            color: textColor || "white",
                            border: borderVisible
                                ? `${borderThickness}px solid ${borderColor}`
                                : "none",
                            borderRadius: `${radius}px`,
                            overflow: "hidden",
                            opacity: opac,
                        }}
                    >
                        <Typography
                            variant="caption"
                            sx={{
                                fontSize: labelSize,
                                fontWeight: "bold",
                                color: textColor || "white",
                            }}
                        >
                            Sensor {i}
                        </Typography>
                        <Typography
                            variant="caption"
                            sx={{
                                fontSize: valueSize,
                                fontWeight: "bold",
                                color: textColor || "white",
                            }}
                        >
                            -
                        </Typography>
                        {showUnits && (
                            <Typography
                                variant="caption"
                                sx={{ fontSize: "8px", color: textColor || "white" }}
                            >
                                -
                            </Typography>
                        )}
                    </Box>
                );
            }
        } else {
            // Use actual sensor data
            const displayLimit = Math.min(sensorData.length, numSensors);
            for (let i = 0; i < displayLimit; i++) {
                const sensor = sensorData[i];
                const row = Math.floor(i / columnCount);
                const col = i % columnCount;
                const topPos = topPad + row * cellH + outerPad / 2;
                const leftPos = leftPad + col * cellW + outerPad / 2;
                const w = cellW - outerPad;
                const h = cellH - outerPad;

                labels.push(
                    <Box
                        key={i}
                        sx={{
                            position: "absolute",
                            top: `${topPos}px`,
                            left: `${leftPos}px`,
                            width: `${w}px`,
                            height: `${h}px`,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: alignItems || "center",
                            justifyContent: justifyContent || "center",
                            textAlign: toTextAlign(textAlignment) || "center",
                            padding: `${innerPad}px`,
                            backgroundColor: "rgba(0,0,0,0.2)",
                            color: textColor || "white",
                            border: borderVisible
                                ? `${borderThickness}px solid ${borderColor}`
                                : "none",
                            borderRadius: `${radius}px`,
                            overflow: "hidden",
                            opacity: opac,
                        }}
                    >
                        <Typography
                            variant="caption"
                            sx={{
                                fontSize: labelSize,
                                fontWeight: "bold",
                                color: textColor || "white",
                            }}
                        >
                            {sensor.tag}
                        </Typography>
                        <Typography
                            variant="caption"
                            sx={{
                                fontSize: valueSize,
                                fontWeight: "bold",
                                color: textColor || "white",
                            }}
                        >
                            {sensor.value}
                        </Typography>
                        {showUnits && (
                            <Typography
                                variant="caption"
                                sx={{ fontSize: "8px", color: textColor || "white" }}
                            >
                                {sensor.unit}
                            </Typography>
                        )}
                    </Box>
                );
            }
        }

        return labels;
    };

    // Update the renderQuadLCD function
    const renderQuadLCD = () => {
        const r = parseInt(String(rows)) || 1;
        const c = parseInt(String(columns)) || 1;
        const ph = parseInt(String(previewHeight)) || PREVIEW_HEIGHT;
        const cellH = ph / r;
        const fontSizePx = cellH * 0.6;

        return (
            <Box
                sx={{
                    width: "100%",
                    height: "100%",
                    display: "grid",
                    gridTemplateRows: `repeat(${r}, 1fr)`,
                    gridTemplateColumns: `repeat(${c}, 1fr)`,
                    backgroundColor: backgroundColor,
                    color: textColor,
                    fontFamily: "monospace",
                    fontSize: `${fontSizePx}px`
                }}
            >
                {Array.from({ length: r * c }).map((_, i) => {
                    // Check if we have sensor data for this cell
                    const hasValue = sensorData.length > 0 && i < sensorData.length;
                    // Display the value if we have it, otherwise a placeholder
                    const display = hasValue
                        ? String(parseInt(sensorData[i].value) || 0).padStart(2, "0")
                        : "\u00A0"; // Non-breaking space for empty cells
                    return (
                        <Box
                            key={i}
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            {display}
                        </Box>
                    );
                })}
            </Box>
        );
    };

    // Update the renderMatrix function
    const renderMatrix = () => {
        const r = 4; // always 4 rows for our sensor lines
        const ph = parseInt(String(previewHeight)) || PREVIEW_HEIGHT;
        const cellH = ph / r;
        const fontSizePx = cellH * 0.8;

        // Create the lines to display
        const lines = Array.from({ length: r }, (_, row) => {
            // If we have sensor data for this row, use it
            if (sensorData.length > 0 && row < sensorData.length) {
                const sensor = sensorData[row];
                return `${sensor.tag} ${sensor.value}${sensor.unit}`;
            }
            // Otherwise return an empty string
            return "";
        });

        return (
            <Box
                sx={{
                    width: "100%",
                    height: "100%",
                    position: "relative",
                    backgroundColor,
                    overflow: "hidden",
                }}
            >
                {/* 64×32 dot grid */}
                <Box
                    sx={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundImage: `
                        repeating-linear-gradient(0deg, ${textColor} 0 1px, transparent 1px 8px),
                        repeating-linear-gradient(90deg, ${textColor} 0 1px, transparent 1px 8px)
                    `,
                        opacity: 0.2,
                    }}
                />
                {/* centered text */}
                <Box
                    sx={{
                        position: "relative",
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        alignItems: "flex-start",
                        color: textColor,
                        fontFamily: "monospace",
                        fontSize: `${fontSizePx}px`,
                        lineHeight: 1.0,
                        pl: 2,
                    }}
                >
                    {lines.map((line, i) => (
                        <Box key={i}>{line}</Box>
                    ))}
                </Box>
            </Box>
        );
    };

    // scaling + centering
    const phNum = parseInt(String(previewHeight)) || 1;
    const pwNum = parseInt(String(previewWidth)) || 1;
    const scaleX = pwNum / PREVIEW_WIDTH;
    const scaleY = phNum / PREVIEW_HEIGHT;
    const renderedW = pwNum * scaleX;
    const renderedH = phNum * scaleY;
    const offsetX = (PREVIEW_WIDTH - renderedW) / 2;
    const offsetY = (PREVIEW_HEIGHT - renderedH) / 2;

    // Handle sensor preview refresh with fallback
    const handleSensorPreviewRefresh = () => {
        if (onRefreshSensorPreview) {
            onRefreshSensorPreview();
        }
    };

    // Render Config Payload section
    const renderConfigPayload = () => (
        <Box
            sx={{
                border: "1px solid rgba(0,0,0,0.2)",
                borderRadius: 1,
                p: 2,
                backgroundColor: "#f9f9f9",
                display: "flex",
                flexDirection: "column",
                flex: showPreview ? 1 : "1 1 50%",
                maxHeight: PREVIEW_HEIGHT,
                overflow: "hidden",
            }}
        >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                    Config Payload Preview
                </Typography>
                <Box
                    component="button"
                    sx={{
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        color: 'primary.main',
                        fontSize: '0.8rem',
                        '&:hover': { textDecoration: 'underline' }
                    }}
                    onClick={onRefreshPayload}
                >
                    Refresh
                </Box>
            </Box>
            <Box
                component="pre"
                sx={{
                    whiteSpace: "pre-wrap",
                    margin: 0,
                    minHeight: '100px',
                    fontFamily: "monospace",
                    fontSize: 12,
                    flex: 1,
                    overflow: 'auto'
                }}
            >
                {payloadJson || "Loading..."}
            </Box>
        </Box>
    );

    // Render Sensor Preview section
    const renderSensorPreview = () => (
        <Box
            sx={{
                border: "1px solid rgba(0,0,0,0.2)",
                borderRadius: 1,
                p: 2,
                backgroundColor: "#f9f9f9",
                display: "flex",
                flexDirection: "column",
                flex: showPreview ? 1 : "1 1 50%",
                maxHeight: PREVIEW_HEIGHT,
                overflow: "hidden",
            }}
        >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                    Sensor Payload Preview
                </Typography>
                <Box
                    component="button"
                    sx={{
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        color: 'primary.main',
                        fontSize: '0.8rem',
                        '&:hover': { textDecoration: 'underline' }
                    }}
                    onClick={handleSensorPreviewRefresh}
                >
                    Refresh
                </Box>
            </Box>
            <Box
                component="pre"
                sx={{
                    whiteSpace: "pre-wrap",
                    margin: 0,
                    minHeight: '100px',
                    fontFamily: "monospace",
                    fontSize: 12,
                    flex: 1,
                    overflow: 'auto'
                }}
            >
                {sensorPreviewJson && sensorPreviewJson.trim() !== ""
                    ? sensorPreviewJson.startsWith("Error")
                        ? sensorPreviewJson
                        : sensorPreviewJson
                    : previewSensors && parseInt(String(previewSensors)) > 0
                        ? "No sensor data available. Click 'Refresh' to load."
                        : "No sensors to display. Set 'Sensors' to a value greater than 0."}
            </Box>
        </Box>
    );

    return (
        <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                    <Typography variant="subtitle1">
                        Preview
                    </Typography>
                    <FormControlLabel
                        control={
                            <Switch
                                checked={showPreview}
                                onChange={handleShowPreviewToggle}
                                size="small"
                            />
                        }
                        label="Show Preview"
                        sx={{ m: 0 }}
                    />
                </Box>

                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
                    <Box sx={{ flex: "1 1 30%", minWidth: 120 }}>
                        <TextField
                            label="Height"
                            type="number"
                            fullWidth
                            size="small"
                            value={previewHeight}
                            onChange={(e) => setPreviewHeight(e.target.value)}
                        />
                    </Box>
                    <Box sx={{ flex: "1 1 30%", minWidth: 120 }}>
                        <TextField
                            label="Width"
                            type="number"
                            fullWidth
                            size="small"
                            value={previewWidth}
                            onChange={(e) => setPreviewWidth(e.target.value)}
                        />
                    </Box>
                    <Box sx={{ flex: "1 1 30%", minWidth: 120 }}>
                        <TextField
                            label="Sensors"
                            type="number"
                            fullWidth
                            size="small"
                            value={previewSensors}
                            onChange={(e) => setPreviewSensors(e.target.value)}
                        />
                    </Box>
                </Box>

                {showPreview ? (
                    // Original layout with preview on the left and tabbed panels on the right
                    <Box sx={{ display: "flex", gap: 2 }}>
                        <Box
                            sx={{
                                width: PREVIEW_WIDTH,
                                height: PREVIEW_HEIGHT,
                                position: "relative",
                                border: "1px solid rgba(0,0,0,0.2)",
                                overflow: "hidden",
                            }}
                        >
                            <Box
                                sx={{
                                    width: pwNum,
                                    height: phNum,
                                    position: "absolute",
                                    top: `${offsetY}px`,
                                    left: `${offsetX}px`,
                                    transform: `scale(${scaleX}, ${scaleY})`,
                                    transformOrigin: "top left",
                                    ...backgroundStyle,
                                }}
                            >
                                {layoutType === "QUAD"
                                    ? renderQuadLCD()
                                    : layoutType === "MATRIX"
                                        ? renderMatrix()
                                        : generateSensorLabels()}
                            </Box>
                        </Box>

                        <Box
                            sx={{
                                flex: 1,
                                border: "1px solid rgba(0,0,0,0.2)",
                                borderRadius: 1,
                                p: 0,
                                maxHeight: PREVIEW_HEIGHT,
                                overflow: "hidden",
                                backgroundColor: "#f9f9f9",
                                display: "flex",
                                flexDirection: "column",
                            }}
                        >
                            {/* Tabs for Config and Sensor Preview */}
                            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                                <Tabs
                                    value={tabValue}
                                    onChange={handleTabChange}
                                    variant="fullWidth"
                                    sx={{ minHeight: '40px' }}
                                >
                                    <Tab label="Config Payload Preview" sx={{ textTransform: 'none', minHeight: '40px' }} />
                                    <Tab label="Sensor Payload Preview" sx={{ textTransform: 'none', minHeight: '40px' }} />
                                </Tabs>
                            </Box>

                            {/* Tab Panel for Config Payload */}
                            <Box
                                sx={{
                                    display: tabValue === 0 ? 'flex' : 'none',
                                    flexDirection: 'column',
                                    p: 2,
                                    flex: 1,
                                    overflow: 'auto'
                                }}
                            >
                                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                                    <Box
                                        component="button"
                                        sx={{
                                            border: 'none',
                                            background: 'none',
                                            cursor: 'pointer',
                                            color: 'primary.main',
                                            fontSize: '0.8rem',
                                            '&:hover': { textDecoration: 'underline' }
                                        }}
                                        onClick={onRefreshPayload}
                                    >
                                        Refresh
                                    </Box>
                                </Box>
                                <Box
                                    component="pre"
                                    sx={{
                                        whiteSpace: "pre-wrap",
                                        margin: 0,
                                        minHeight: '100px',
                                        fontFamily: "monospace",
                                        fontSize: 12,
                                    }}
                                >
                                    {payloadJson || "Loading..."}
                                </Box>
                            </Box>

                            {/* Tab Panel for Sensor Preview */}
                            <Box
                                sx={{
                                    display: tabValue === 1 ? 'flex' : 'none',
                                    flexDirection: 'column',
                                    p: 2,
                                    flex: 1,
                                    overflow: 'auto'
                                }}
                            >
                                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                                    <Box
                                        component="button"
                                        sx={{
                                            border: 'none',
                                            background: 'none',
                                            cursor: 'pointer',
                                            color: 'primary.main',
                                            fontSize: '0.8rem',
                                            '&:hover': { textDecoration: 'underline' }
                                        }}
                                        onClick={handleSensorPreviewRefresh}
                                    >
                                        Refresh
                                    </Box>
                                </Box>
                                <Box
                                    component="pre"
                                    sx={{
                                        whiteSpace: "pre-wrap",
                                        margin: 0,
                                        minHeight: '100px',
                                        fontFamily: "monospace",
                                        fontSize: 12,
                                    }}
                                >
                                    {sensorPreviewJson && sensorPreviewJson.trim() !== ""
                                        ? sensorPreviewJson.startsWith("Error")
                                            ? sensorPreviewJson
                                            : sensorPreviewJson
                                        : previewSensors && parseInt(String(previewSensors)) > 0
                                            ? "No sensor data available. Click 'Refresh' to load."
                                            : "No sensors to display. Set 'Sensors' to a value greater than 0."}
                                </Box>
                            </Box>
                        </Box>
                    </Box>
                ) : (
                    // Alternative layout with config and sensor preview side by side (no tabs)
                    <Box sx={{ display: "flex", gap: 2 }}>
                        {renderConfigPayload()}
                        {renderSensorPreview()}
                    </Box>
                )}
            </CardContent>
        </Card>
    );
};

export default LayoutPreview;