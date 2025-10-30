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

import React, { useState, useCallback, useEffect } from 'react';
import {
    Box,
    Typography,
    TextField,
    InputAdornment,
    Card,
    CardContent,
} from '@mui/material';
import {
    Search as SearchIcon,
    DragIndicator as DragIcon,
    Sensors as SensorsIcon,
    TextFields as TextIcon,
    ShowChart as ChartIcon,
    Speed as GaugeIcon,
    Schedule as ClockIcon,
    Grain as OscilloscopeIcon,
    Explore as TunnelIcon,
    Cloud as WeatherIcon,
    Image as ImageIcon,
    VideoLibrary as VideoIcon,
    Animation as RiveIcon,
} from '@mui/icons-material';
import { FrameEngine_ElementProperties } from './properties/FrameEngine_ElementProperties';
import type { PlacedElement, ElementType } from './FrameEngine_Types';

interface ElementTemplate {
    id: string;
    name: string;
    description: string;
    type: ElementType;
    icon: React.ReactNode;
    defaultWidth: number;
    defaultHeight: number;
    defaultProperties: Record<string, any>;
    category: 'basic' | 'data' | 'media' | 'layout' | 'effects' | 'assets';
}

interface ElementLibraryProps {
    selectedElements: string[];
    selectedElementsData: PlacedElement[];
    onElementAdd: (element: Omit<PlacedElement, 'id'>) => void;
    onElementUpdate: (elementId: string, updates: Partial<PlacedElement>) => void;
    onElementDelete: (elementId: string) => void;
}

const FrameEngine_ElementLibrary: React.FC<ElementLibraryProps> = ({
    selectedElements,
    selectedElementsData,
    onElementAdd,
    onElementUpdate,
    onElementDelete,
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'library' | 'properties'>('library');
    const [expandedSections, setExpandedSections] = useState<Set<string>>(
        new Set([
            // Basic element properties
            'position',
            // Element-specific sections
            'sensor', 'sensorTypography',
            'text', 'textTypography',
            'clock', 'clockTypography',
            'ecg',
            'gauge-data', 'gauge-shape', 'gauge-display', 'gauge-colors',
            'oscilloscope',
            'tunnel',
            'weather'
            // Note: 'visibility' is intentionally excluded - it starts collapsed
        ])
    );

    useEffect(() => {
        if (selectedElementsData.length > 0) {
            setActiveTab('properties');
        }
    }, [selectedElementsData.length]);

    const toggleSection = useCallback((sectionId: string) => {
        setExpandedSections(prev => {
            const newSet = new Set(prev);
            if (newSet.has(sectionId)) {
                newSet.delete(sectionId);
            } else {
                newSet.add(sectionId);
            }
            return newSet;
        });
    }, []);

    const elementTemplates: ElementTemplate[] = [
        {
            id: 'text-label',
            name: 'Text Label',
            description: 'Static text for titles and labels',
            type: 'text',
            icon: <TextIcon />,
            defaultWidth: 100,
            defaultHeight: 30,
            defaultProperties: {
                text: 'Label',
                fontSize: 14,
                fontWeight: 'normal',
                textAlign: 'left',
                color: '#000000',
                backgroundColor: 'transparent',
            },
            category: 'basic',
        },
        {
            id: 'clock-display',
            name: 'Clock',
            description: 'Live clock with timezone support',
            type: 'clock',
            icon: <ClockIcon />,
            defaultWidth: 200,
            defaultHeight: 60,
            defaultProperties: {
                fontSize: 24,
                fontFamily: 'Inter',
                fontWeight: 'normal',
                color: '#000000',
                backgroundColor: 'transparent',
                textAlign: 'center',
                verticalAlign: 'center',
                timeFormat: '12h',
                showSeconds: true,
                showDate: false,
                dateFormat: 'short',
                timezone: 'America/Chicago',
                textShadow: false,
                textBorder: false,
            },
            category: 'basic',
        },
        {
            id: 'sensor-display',
            name: 'Sensor Display',
            description: 'Display live sensor data with value and unit',
            type: 'sensor',
            icon: <SensorsIcon />,
            defaultWidth: 120,
            defaultHeight: 60,
            defaultProperties: {
                sensorName: 'New Sensor',
                placeholderValue: '',
                placeholderUnit: '',
                fontSize: 12,
                showUnit: true,
                showLabel: true,
                backgroundColor: 'transparent',
                color: '#000000',
                textAlign: 'left',
            },
            category: 'data',
        },
        {
            id: 'ecg-display',
            name: 'ECG Waveform',
            description: 'Real-time waveform chart for sensor data',
            type: 'ecg',
            icon: <ChartIcon />,
            defaultWidth: 300,
            defaultHeight: 120,
            defaultProperties: {
                sensorTag: '',
                waveformColor: '#00ff00',
                backgroundColor: '#000000',
                gridColor: 'rgba(0, 255, 0, 0.2)',
                showGrid: true,
                showBorder: true,
                bufferSize: 200,
                yAxisMin: 0,
                yAxisMax: 100,
                lineWidth: 2,
                gridScrollSpeed: 0.5,
            },
            category: 'data',
        },
        {
            id: 'gauge-display',
            name: 'Gauge',
            description: 'Circular gauge for sensor values',
            type: 'gauge',
            icon: <GaugeIcon />,
            defaultWidth: 200,
            defaultHeight: 200,
            defaultProperties: {
                gaugeLibrary: 'mui',
                sensorTag: '',
                gaugeType: 'semicircle',
                minValue: 0,
                maxValue: 100,
                // MUI Gauge angles - MUST be explicitly set per documentation
                gaugeAngleType: 'arc',  // arc | circle | custom
                startAngle: -90,  // Default arc starting at left
                endAngle: 90,     // Default arc ending at right (180° span)
                innerRadius: '70%',
                outerRadius: '100%',
                cornerRadius: '50%',
                valueLabel: '',
                showValue: true,
                // Arc colors
                gaugeColor: '#2196f3',
                referenceArcColor: '#e0e0e0',
                // Text styling
                textColor: '#333333',
                textFontSize: 0,
                textFontFamily: 'Roboto, sans-serif',
                textFontWeight: 600,
                // Container
                backgroundColor: 'transparent',
                // Legacy properties (kept for backward compatibility)
                showLabels: true,
                showTicks: true,
                pointerType: 'needle',
                pointerColor: '#464A4F',
                pointerLength: 0.7,
                pointerWidth: 15,
                pointerElastic: true,
                pointerAnimationDelay: 0,
                arcColors: [
                    { limit: 33, color: '#5BE12C' },
                    { limit: 66, color: '#F5CD19' },
                    { limit: 100, color: '#EA4228' }
                ],
                arcPadding: 0.02,
                arcWidth: 0.2,
                valueLabelColor: '#333',
                tickLabelColor: '#666'
            },
            category: 'data',
        },
        {
            id: 'oscilloscope-display',
            name: 'Oscilloscope',
            description: 'Advanced waveform display with multiple modes',
            type: 'oscilloscope',
            icon: <OscilloscopeIcon />,
            defaultWidth: 400,
            defaultHeight: 200,
            defaultProperties: {
                sensorTag: '',
                waveformColor: '#00ff00',
                backgroundColor: '#000000',
                gridColor: 'rgba(0, 255, 0, 0.2)',
                showGrid: true,
                showBorder: true,
                bufferSize: 200,
                yAxisMin: 0,
                yAxisMax: 100,
                lineWidth: 2,
                mode: 'glow',
                phosphorDecay: 0.95,
                glowIntensity: 3,
                frequency: 0.05,
                phase: 0,
                amplitude: 1,
                harmonics: 0,
                noiseLevel: 0,
                symmetry: 0,
                triggerLevel: 50,
                showTrigger: false,
            },
            category: 'effects',
        },
        {
            id: 'tunnel-effect',
            name: 'Tunnel Effect',
            description: 'Psychedelic tunnel with 2D/3D rendering modes',
            type: 'tunnel',
            icon: <TunnelIcon />,
            defaultWidth: 400,
            defaultHeight: 300,
            defaultProperties: {
                sensorTag: '',
                primaryColor: '#ff00ff',
                secondaryColor: '#00ffff',
                backgroundColor: '#000000',
                tunnelType: 'circular',
                speed: 1,
                depth: 20,
                ringSpacing: 5,
                rotation: 0.5,
                twist: 0,
                pulseSpeed: 1,
                pulseAmount: 0.2,
                scanlines: true,
                scanlineIntensity: 0.3,
                chromatic: false,
                chromaticAmount: 2,
                pixelate: false,
                pixelSize: 4,
                colorCycle: false,
                colorCycleSpeed: 0.01,
                perspective: 1,
                glow: true,
                glowIntensity: 10,
                renderMode: '2d',
                curveTargetX: 0,
                curveTargetY: 0,
                curveStrength: 1,
                banking: 0.5,
                pitch: 0,
                originX: 0.5,
                originY: 0.5,
                depthFade: false,
                fadeEnd: 'back',
            },
            category: 'effects',
        },
        {
            id: 'weather-display',
            name: 'Weather Scene',
            description: '3D weather visualization with dynamic effects',
            type: 'weather',
            icon: <WeatherIcon />,
            defaultWidth: 400,
            defaultHeight: 300,
            defaultProperties: {
                sensorTag: '',
                weatherType: 'clear',
                timeOfDay: 'day',
                cloudDensity: 0.5,
                animationSpeed: 1,
                particleCount: 500,
                showStars: true,
                cameraAngle: 30,
                backgroundColor: 'transparent',
            },
            category: 'effects',
        },
        {
            id: 'media-image',
            name: 'Asset Image',
            description: 'Display an uploaded image asset',
            type: 'media-image',
            icon: <ImageIcon />,
            defaultWidth: 200,
            defaultHeight: 150,
            defaultProperties: {
                assetImageUrl: '',
                imageFit: 'cover',
                opacity: 1,
            },
            category: 'assets',
        },
        {
            id: 'media-video',
            name: 'Asset Video',
            description: 'Display an uploaded video asset',
            type: 'media-video',
            icon: <VideoIcon />,
            defaultWidth: 320,
            defaultHeight: 180,
            defaultProperties: {
                assetVideoUrl: '',
                videoFit: 'cover',
                videoLoop: true,
                videoMuted: true,
                videoAutoplay: true,
                opacity: 1,
            },
            category: 'assets',
        },
        {
            id: 'media-rive',
            name: 'Asset Rive',
            description: 'Display an uploaded Rive animation',
            type: 'media-rive',
            icon: <RiveIcon />,
            defaultWidth: 200,
            defaultHeight: 200,
            defaultProperties: {
                assetRiveFile: '',
                riveStateMachine: '',
                riveInputs: {},
                riveBindings: {},
                riveFit: 'cover',
                opacity: 1,
            },
            category: 'assets',
        },
    ];

    const handleElementDragStart = useCallback((template: ElementTemplate, event: React.DragEvent) => {
        const elementData = {
            type: template.type,
            width: template.defaultWidth,
            height: template.defaultHeight,
            properties: { ...template.defaultProperties },
            x: 0,
            y: 0,
        };

        event.dataTransfer.setData('application/x-element-type', template.type);
        event.dataTransfer.setData('application/x-element-data', JSON.stringify(elementData));
        event.dataTransfer.effectAllowed = 'copy';
    }, []);

    const handleQuickAdd = useCallback((template: ElementTemplate) => {
        onElementAdd({
            type: template.type,
            x: 50,
            y: 50,
            width: template.defaultWidth,
            height: template.defaultHeight,
            properties: { ...template.defaultProperties },
        });
    }, [onElementAdd]);

    const filteredTemplates = elementTemplates.filter(t =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const templatesByCategory = filteredTemplates.reduce((acc, template) => {
        (acc[template.category] ||= []).push(template);
        return acc;
    }, {} as Record<string, ElementTemplate[]>);

    const categoryNames = {
        basic: 'Basic Elements',
        data: 'Data Elements',
        media: 'Media Elements',
        layout: 'Layout Elements',
        effects: 'Visual Effects',
        assets: 'Asset Elements',
    };

    return (
        <Box
            sx={{
                width: 320,
                height: '100%',
                bgcolor: 'background.paper',
                borderLeft: 1,
                borderColor: 'divider',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
        >
            {/* Fixed Header */}
            <Box sx={{ flexShrink: 0, p: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.1rem', mb: 1 }}>
                    Element Library & Properties
                </Typography>

                <Box sx={{ display: 'flex' }}>
                    <button
                        onClick={() => setActiveTab('library')}
                        style={{
                            flex: 1,
                            padding: '4px 12px',
                            fontSize: '12px',
                            borderTopLeftRadius: '4px',
                            borderBottomLeftRadius: '4px',
                            border: '1px solid #ccc',
                            backgroundColor: activeTab === 'library' ? '#e3f2fd' : '#f5f5f5',
                            color: activeTab === 'library' ? '#1976d2' : '#666',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        Library
                    </button>
                    <button
                        onClick={() => setActiveTab('properties')}
                        style={{
                            flex: 1,
                            padding: '4px 12px',
                            fontSize: '12px',
                            borderTopRightRadius: '4px',
                            borderBottomRightRadius: '4px',
                            borderTop: '1px solid #ccc',
                            borderRight: '1px solid #ccc',
                            borderBottom: '1px solid #ccc',
                            backgroundColor: activeTab === 'properties' ? '#e3f2fd' : '#f5f5f5',
                            color: activeTab === 'properties' ? '#1976d2' : '#666',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        Properties {selectedElementsData.length > 0 && `(${selectedElementsData.length})`}
                    </button>
                </Box>
            </Box>

            {/* Scrollable Content */}
            <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {activeTab === 'library' ? (
                    <>
                        <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                            <TextField
                                size="small"
                                fullWidth
                                placeholder="Search elements..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchIcon fontSize="small" />
                                        </InputAdornment>
                                    ),
                                }}
                                sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.875rem' } }}
                            />
                        </Box>

                        <Box sx={{ p: 1.5 }}>
                            {Object.entries(templatesByCategory).map(([category, templates]) => (
                                <Box key={category} sx={{ mb: 3 }}>
                                    <Typography
                                        variant="overline"
                                        sx={{
                                            fontSize: '0.7rem',
                                            fontWeight: 600,
                                            color: 'text.secondary',
                                            letterSpacing: 1,
                                            mb: 1,
                                            display: 'block',
                                        }}
                                    >
                                        {categoryNames[category as keyof typeof categoryNames]}
                                    </Typography>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        {templates.map((template) => (
                                            <Card
                                                key={template.id}
                                                draggable
                                                onDragStart={(e) => handleElementDragStart(template, e)}
                                                onDoubleClick={() => handleQuickAdd(template)}
                                                sx={{
                                                    cursor: 'grab',
                                                    transition: 'all 0.2s',
                                                    '&:hover': {
                                                        bgcolor: 'action.hover',
                                                        transform: 'translateY(-1px)',
                                                        boxShadow: 2,
                                                    },
                                                    '&:active': {
                                                        cursor: 'grabbing',
                                                    },
                                                }}
                                            >
                                                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                                                        <Box sx={{ color: 'primary.main', mt: 0.25 }}>
                                                            {template.icon}
                                                        </Box>
                                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                                            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                                                                {template.name}
                                                            </Typography>
                                                            <Typography
                                                                variant="caption"
                                                                color="text.secondary"
                                                                sx={{ display: 'block', mt: 0.5, lineHeight: 1.3 }}
                                                            >
                                                                {template.description}
                                                            </Typography>
                                                            <Typography
                                                                variant="caption"
                                                                color="text.disabled"
                                                                sx={{ display: 'block', mt: 0.5 }}
                                                            >
                                                                {template.defaultWidth}×{template.defaultHeight}
                                                            </Typography>
                                                        </Box>
                                                        <DragIcon color="action" fontSize="small" />
                                                    </Box>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </Box>
                                </Box>
                            ))}
                        </Box>

                        <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider', bgcolor: 'grey.50' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    Tip:
                                </Typography>
                                <Typography variant="caption" color="text.disabled">
                                    Drag or double-click
                                </Typography>
                            </Box>
                        </Box>
                    </>
                ) : (
                    <FrameEngine_ElementProperties
                        selectedElements={selectedElementsData}
                        onElementUpdate={onElementUpdate}
                        onElementDelete={onElementDelete}
                        expandedSections={expandedSections}
                        onToggleSection={toggleSection}
                    />
                )}
            </Box>
        </Box>
    );
};

export default FrameEngine_ElementLibrary;