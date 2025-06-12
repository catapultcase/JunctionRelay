/*
 * This file is part of Junction Relay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * Junction Relay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Junction Relay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Junction Relay. If not, see <https://www.gnu.org/licenses/>.
 */

import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
    Typography,
    Box,
    Card,
    CardContent,
    TextField,
    Divider,
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

    const { id } = useParams<{ id: string }>();
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
    const [forceUpdate, setForceUpdate] = useState(0);

    // Add a useEffect to trigger re-renders when the payload data changes
    useEffect(() => {
        if (sensorPreviewJson) {
            console.log("Sensor preview JSON updated, triggering re-render");
            setForceUpdate(prev => prev + 1);
        }
    }, [sensorPreviewJson]);

    // Add forceUpdate as a dependency to another useEffect if you want to see the parsed data in console
    useEffect(() => {
        console.log("Parsed sensor data:", sensorData);
    }, [sensorPreviewJson, forceUpdate]);

    // Add these parsing functions at the beginning of the component
    // Parse the sensor preview JSON to extract sensor data
    const parseSensorData = () => {
        // Return empty array if no sensorPreviewJson or if it starts with "Error"
        if (!sensorPreviewJson || sensorPreviewJson.trim() === "" || sensorPreviewJson.startsWith("Error")) {
            return [];
        }

        try {
            console.log("Raw sensorPreviewJson:", sensorPreviewJson);

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
                console.log("Empty JSON string after prefix removal");
                return [];
            }

            // Log the actual JSON we're trying to parse
            console.log("Attempting to parse JSON:", jsonStr);

            const data = JSON.parse(jsonStr);
            console.log("Successfully parsed JSON:", data);

            if (data && data.sensors) {
                // Handle the standard format
                const sensorMap = new Map();

                // Convert sensors object to Map for easier lookup
                Object.entries(data.sensors).forEach(([sensorTag, sensorInfo]: [string, any]) => {
                    if (Array.isArray(sensorInfo) && sensorInfo.length > 0) {
                        sensorMap.set(sensorTag, {
                            tag: sensorTag,
                            value: sensorInfo[0].Value !== undefined ? sensorInfo[0].Value :
                                sensorInfo[0].value !== undefined ? sensorInfo[0].value : 0,
                            unit: sensorInfo[0].Unit !== undefined ? sensorInfo[0].Unit :
                                sensorInfo[0].unit !== undefined ? sensorInfo[0].unit : ''
                        });
                    } else if (sensorInfo && sensorInfo.Position && sensorInfo.Data) {
                        // Handle matrix format
                        const text = sensorInfo.Data[0]?.text || '';
                        const parts = text.split(' ');
                        const value = parts.length > 1 ? parts[1] : '0';
                        const unit = parts.length > 2 ? parts[2] : '';

                        sensorMap.set(sensorTag, {
                            tag: sensorTag,
                            value: value,
                            unit: unit,
                            position: sensorInfo.Position
                        });
                    }
                });

                // Convert Map to array
                return Array.from(sensorMap.values());
            }

            // Handle neopixel format
            if (data && data.sensors && data.sensors.neopixel && data.sensors.neopixel.color) {
                return [{
                    tag: 'neopixel',
                    value: data.sensors.neopixel.color,
                    unit: '',
                    isColor: true
                }];
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
        const numSensors = parseInt(previewSensors as string) || 0;
        const rowCount = parseInt(rows as string) || 1;
        const columnCount = parseInt(columns as string) || 1;
        const ph = parseInt(previewHeight as string) || 0;
        const pw = parseInt(previewWidth as string) || 0;
        const outerPad = parseInt(outerPadding as string) || 0;
        const innerPad = parseInt(innerPadding as string) || 0;
        const topPad = parseInt(topMargin as string) || 0;
        const leftPad = parseInt(leftMargin as string) || 0;
        const opac = opacityPercentage
            ? parseInt(opacityPercentage as string) / 100
            : 1;
        const radius = roundedCorners
            ? parseInt(borderRadiusSize as string) || 8
            : 0;

        const availW = pw - leftPad - (parseInt(rightMargin as string) || 0);
        const availH = ph - topPad - (parseInt(bottomMargin as string) || 0);
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
                            textAlign: (textAlignment as any) || "center",
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
                            textAlign: (textAlignment as any) || "center",
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
        const r = parseInt(rows as string) || 1;
        const c = parseInt(columns as string) || 1;
        const ph = parseInt(previewHeight as string) || PREVIEW_HEIGHT;
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
        const ph = parseInt(previewHeight as string) || PREVIEW_HEIGHT;
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
    const phNum = parseInt(previewHeight as string) || 1;
    const pwNum = parseInt(previewWidth as string) || 1;
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
                    : previewSensors && parseInt(previewSensors as string) > 0
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
                                        : previewSensors && parseInt(previewSensors as string) > 0
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